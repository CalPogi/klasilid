import type { IsoDate } from '@klasilid/core';
import { classDay, dayLetter, schoolDaysInMonth } from './attendance';
import type { KlasilidDb, LEnrollment, LLearner, OutboxItem } from './db';
import { parseLearnerList } from './setup';

export type StudentFilter = 'all' | 'nocard' | 'replaced' | 'noparent' | 'left';
export interface StudentRow {
  learner: LLearner;
  enrollment: LEnrollment;
  /** left = marked as transferred out (attendance still counts through the last day); joined = joined within the last 30 days */
  status: 'enrolled' | 'joined' | 'left';
  card: { state: 'none' | 'registered' | 'replaced'; uid?: string; replacedAt?: string };
  /** Parent accounts arrive in plan 4. */
  parent: 'none';
  /** This month: P and L days count 1, H counts ½, over days that counted (N excluded). */
  presentPct: number | null;
}

const addDays = (d: IsoDate, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const byName = (a: LLearner, b: LLearner) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);

export async function studentRows(db: KlasilidDb, classId: string, today: IsoDate, filter: StudentFilter, query: string): Promise<StudentRow[]> {
  const enrolls = await db.enrollments.where('classId').equals(classId).toArray();
  const learners = new Map((await db.learners.bulkGet(enrolls.map(e => e.learnerId))).filter((l): l is LLearner => !!l).map(l => [l.id, l]));
  const cards = await db.cards.toArray();
  const days = await schoolDaysInMonth(db, classId, today.slice(0, 7), today);
  const grid = await Promise.all(days.map(d => classDay(db, classId, d, new Date(d + 'T23:59:00+08:00'))));

  const rows: StudentRow[] = enrolls.flatMap(enrollment => {
    const learner = learners.get(enrollment.learnerId);
    if (!learner) return [];
    const mine = cards.filter(c => c.learnerId === learner.id);
    const active = mine.find(c => c.active);
    const old = mine.filter(c => !c.active).sort((a, b) => (a.replacedAt ?? '').localeCompare(b.replacedAt ?? '')).pop();
    let score = 0, counted = 0;
    for (const d of grid) {
      const r = d.rows.find(x => x.learner.id === learner.id);
      if (!r) continue;
      const l = dayLetter(r.am, r.pm);
      if (l === 'N') continue;
      counted++;
      score += l === 'P' || l === 'L' ? 1 : l === 'H' ? 0.5 : 0;
    }
    return [{
      learner, enrollment, parent: 'none' as const,
      status: enrollment.leftOn ? 'left' : enrollment.joinedOn >= addDays(today, -30) ? 'joined' : 'enrolled',
      card: active ? (old ? { state: 'replaced', uid: active.uid, replacedAt: old.replacedAt } : { state: 'registered', uid: active.uid }) : { state: 'none' },
      presentPct: counted ? Math.round((score / counted) * 100) : null,
    } satisfies StudentRow];
  });

  const q = query.trim().toLowerCase();
  return rows
    .filter(r => !q || `${r.learner.firstName} ${r.learner.lastName} ${r.learner.lastName}, ${r.learner.firstName}`.toLowerCase().includes(q))
    .filter(r => filter === 'all' || (filter === 'left' ? r.status === 'left'
      : r.status !== 'left' && (filter === 'nocard' ? r.card.state === 'none' : filter === 'replaced' ? r.card.state === 'replaced' : r.parent === 'none')))
    .sort((a, b) => byName(a.learner, b.learner));
}

export async function addStudent(db: KlasilidDb, classId: string, s: {
  fullName: string; lrn?: string; sex: 'M' | 'F'; joinedOn: IsoDate; from?: string; guardianName?: string; guardianPhone?: string;
}, now: Date): Promise<LLearner> {
  const [name] = parseLearnerList(s.fullName);
  if (!name) throw new Error('Enter the full name as Last name, First name');
  const lrn = s.lrn?.trim() || undefined;
  if (lrn && !/^\d{12}$/.test(lrn)) throw new Error('LRN has 12 digits');
  const learner: LLearner = {
    id: crypto.randomUUID(), ...name, sex: s.sex, lrn,
    guardianName: s.guardianName?.trim() || undefined, guardianPhone: s.guardianPhone?.trim() || undefined,
  };
  const from = s.from?.trim() || undefined;
  const createdAt = now.toISOString();
  const op = (o: OutboxItem['op']): OutboxItem => ({ op: o, createdAt });
  await db.transaction('rw', db.learners, db.enrollments, db.outbox, async () => {
    await db.learners.put(learner);
    await db.enrollments.put({ id: crypto.randomUUID(), classId, learnerId: learner.id, joinedOn: s.joinedOn, joinedFrom: from });
    await db.outbox.add(op({ kind: 'rpc', fn: 'add_learner', args: {
      p_learner_id: learner.id, p_class_id: classId, p_last: learner.lastName, p_first: learner.firstName, p_middle: learner.middleName ?? null,
      p_sex: learner.sex, p_joined: s.joinedOn, p_lrn: lrn ?? null, p_guardian_name: learner.guardianName ?? null, p_guardian_phone: learner.guardianPhone ?? null } }));
    if (from) await db.outbox.add(op({ kind: 'update', table: 'enrollments', match: { class_id: classId, learner_id: learner.id }, values: { joined_from: from } }));
  });
  return learner;
}

/** They leave attendance, the seat plan and SF2 after their last day; history before it stays (spec §7.3). */
export async function transferOut(db: KlasilidDb, enrollmentId: string, lastDay: IsoDate, newSchool: string): Promise<void> {
  const e = await db.enrollments.get(enrollmentId);
  if (!e) throw new Error('Enrollment not found');
  const leftOn = addDays(lastDay, 1);
  const leaveReason = newSchool.trim() ? `Transferred to ${newSchool.trim()}` : 'Transferred out';
  await db.transaction('rw', db.enrollments, db.outbox, async () => {
    await db.enrollments.update(enrollmentId, { leftOn, leaveReason });
    // Server enrollment ids differ from ones made on this device; (class, learner) is unique.
    await db.outbox.add({ createdAt: new Date().toISOString(), op: { kind: 'update', table: 'enrollments',
      match: { class_id: e.classId, learner_id: e.learnerId }, values: { left_on: leftOn, leave_reason: leaveReason } } });
  });
}

export type AssignResult = { ok: true } | { ok: false; reason: 'taken'; ownerName: string };

/** Cards are never reassigned (taps are matched to cards), so any card already on file is refused. */
export async function assignCard(db: KlasilidDb, learnerId: string, uid: string, now: Date): Promise<AssignResult> {
  const id = uid.trim().toUpperCase();
  const existing = await db.cards.get(id);
  if (existing) {
    const owner = await db.learners.get(existing.learnerId);
    return { ok: false, reason: 'taken', ownerName: owner ? `${owner.firstName} ${owner.lastName}` : 'another learner' };
  }
  const issuedAt = now.toISOString();
  await db.transaction('rw', db.cards, db.outbox, async () => {
    await db.cards.put({ uid: id, learnerId, active: true, issuedAt });
    // A server function, so a card owned outside this class is refused out loud (it lands in the rejected list).
    await db.outbox.add({ createdAt: issuedAt, op: { kind: 'rpc', fn: 'register_card', args: { p_uid: id, p_learner_id: learnerId } } });
  });
  return { ok: true };
}

/** The learner's current card stops working at once; a new one is registered after (spec §7.3). */
export async function replaceCard(db: KlasilidDb, learnerId: string, now: Date): Promise<void> {
  const at = now.toISOString();
  await db.transaction('rw', db.cards, db.outbox, async () => {
    for (const c of (await db.cards.where('learnerId').equals(learnerId).toArray()).filter(c => c.active)) {
      await db.cards.update(c.uid, { active: false, replacedAt: at });
      await db.outbox.add({ createdAt: at, op: { kind: 'update', table: 'cards', match: { uid: c.uid }, values: { active: false, replaced_at: at } } });
    }
  });
}

/** Waits for the first tap made after `since`, whatever the card: assignCard then registers it or says whose it is. `poll` syncs. */
export async function waitForNewCard(db: KlasilidDb, since: Date, signal: AbortSignal, poll: () => Promise<void>, intervalMs = 3000): Promise<string> {
  const from = since.toISOString();
  while (!signal.aborted) {
    const [tap] = await db.taps.where('at').aboveOrEqual(from).sortBy('at');
    if (tap) return tap.cardUid;
    await poll();
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new DOMException('Stopped waiting', 'AbortError');
}
