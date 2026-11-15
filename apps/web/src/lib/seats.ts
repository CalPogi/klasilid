import type { IsoDate } from '@klasilid/core';
import { todayManila } from './attendance';
import type { KlasilidDb, LLearner, LSeat, LSeatPlan, OutboxItem } from './db';

/** Row-major seats; each cell holds a learner id or null. */
export interface Layout { rows: number; cols: number; seats: (string | null)[] }

const MAX = 10;
const clamp = (n: number) => Math.min(MAX, Math.max(1, Math.round(n)));
const byName = (a: LLearner, b: LLearner) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);

/** The plan in effect on `date` (latest effectiveFrom, then latest createdAt). No plan yet → an empty 8×5 room. */
export async function seatPlanFor(db: KlasilidDb, classId: string, date: IsoDate): Promise<{ plan: LSeatPlan | null; layout: Layout }> {
  const plan = (await db.seatPlans.where('classId').equals(classId).toArray())
    .filter(p => p.effectiveFrom <= date)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    .pop() ?? null;
  if (!plan) return { plan: null, layout: { rows: 8, cols: 5, seats: Array(40).fill(null) } };
  const seats: (string | null)[] = Array(plan.rows * plan.cols).fill(null);
  for (const s of await db.seats.where('planId').equals(plan.id).toArray())
    if (s.row < plan.rows && s.col < plan.cols) seats[s.row * plan.cols + s.col] = s.learnerId;
  return { plan, layout: { rows: plan.rows, cols: plan.cols, seats } };
}

/** Everyone in alphabetical order, row by row; learners beyond the last seat stay unseated. */
export function fillAZ(layout: Layout, learners: LLearner[]): Layout {
  const order = [...learners].sort(byName);
  return { ...layout, seats: layout.seats.map((_, k) => order[k]?.id ?? null) };
}

/** Keeps each learner at their row and seat when it still exists; the rest become unseated. */
export function resize(layout: Layout, rows: number, cols: number): Layout {
  const [r, c] = [clamp(rows), clamp(cols)];
  const seats: (string | null)[] = Array(r * c).fill(null);
  for (let i = 0; i < Math.min(r, layout.rows); i++)
    for (let j = 0; j < Math.min(c, layout.cols); j++) seats[i * c + j] = layout.seats[i * layout.cols + j];
  return { rows: r, cols: c, seats };
}

export function unseated(layout: Layout, learners: LLearner[]): LLearner[] {
  const seated = new Set(layout.seats.filter(Boolean));
  return learners.filter(l => !seated.has(l.id)).sort(byName);
}

/** A new plan from today (Manila); past days keep the plan they had (spec §7.2). */
export async function saveSeatPlan(db: KlasilidDb, classId: string, layout: Layout, now: Date): Promise<LSeatPlan> {
  const plan: LSeatPlan = {
    id: crypto.randomUUID(), classId, rows: layout.rows, cols: layout.cols, effectiveFrom: todayManila(now), createdAt: now.toISOString(),
  };
  const seats: LSeat[] = layout.seats.flatMap((learnerId, k) =>
    learnerId ? [{ id: crypto.randomUUID(), planId: plan.id, row: Math.floor(k / layout.cols), col: k % layout.cols, learnerId }] : []);
  const op = (o: OutboxItem['op']): OutboxItem => ({ op: o, createdAt: plan.createdAt! });
  await db.transaction('rw', db.seatPlans, db.seats, db.outbox, async () => {
    await db.seatPlans.put(plan);
    await db.seats.bulkPut(seats);
    await db.outbox.bulkAdd([
      op({ kind: 'insert', table: 'seat_plans', row: { id: plan.id, class_id: classId, rows: plan.rows, cols: plan.cols, effective_from: plan.effectiveFrom, created_at: plan.createdAt } }),
      ...seats.map(s => op({ kind: 'insert', table: 'seats', row: { id: s.id, plan_id: plan.id, row: s.row, col: s.col, learner_id: s.learnerId } })),
    ]);
  });
  return plan;
}
