import { describe, expect, it } from 'vitest';
import { classDay, learnerRecentDays, monthSummary, needsAttention, type ClassDay } from '../src/lib/attendance';
import { openDb } from '../src/lib/db';
import { DEMO_CLASS_ID, seedDemo } from '../src/lib/demo';
import { shortName } from '../src/lib/format';
import { clickSeat, editorHint, stepSize } from '../src/lib/seat-editor';
import { attentionLine, todayNotices, todayTodos } from '../src/lib/today';

const NOW = new Date('2026-11-13T04:00:00Z'); // noon Manila, Fri Nov 13, a demo school day
const demo = async () => { const db = openDb('t-' + crypto.randomUUID()); await seedDemo(db, NOW); return db; };

it('shortName gives first name and last initial', () => {
  expect(shortName({ firstName: 'Ana', lastName: 'Garcia' })).toBe('Ana G.');
  expect(shortName({ firstName: 'Juan', lastName: 'dela Cruz' })).toBe('Juan D.');
  expect(shortName({ firstName: 'Ana', lastName: '' })).toBe('Ana');
});

describe('today', () => {
  it('todayTodos lists pairing the reader, and cards when some are missing', async () => {
    const day = await classDay(await demo(), DEMO_CLASS_ID, '2026-11-13', NOW);
    expect(todayTodos(day, 0)).toContainEqual({ id: 'reader', title: 'Pair your door reader', sub: 'Do this when your reader arrives', due: 'Later' });
    expect(todayTodos(day, 0).some(t => t.id === 'cards')).toBe(false);
    expect(todayTodos(day, 3)).toContainEqual({ id: 'cards', title: 'Register cards for 3 learners', sub: 'No RFID card yet', due: '' });
  });

  it('attentionLine explains an after-closing arrival', async () => {
    const day = await classDay(await demo(), DEMO_CLASS_ID, '2026-11-13', NOW);
    const late = needsAttention(day).find(r => r.am.flags.includes('after_closing'))!;
    expect(attentionLine(late, false).text).toMatch(/^Came after closing/);
    expect(attentionLine(late, false).session).toBe('am');
  });

  it('todayNotices counts waiting and refused changes', async () => {
    const day = await classDay(await demo(), DEMO_CLASS_ID, '2026-11-13', NOW);
    const n = todayNotices(day, 1, 2, false);
    expect(n).toContainEqual({ title: '1 change the server refused', sub: 'Kept on this device. Check the account or ask for help.', tone: 'bad' });
    expect(n).toContainEqual({ title: '2 changes waiting to sync', sub: 'They send when the internet is back', tone: '' });
  });
});

describe('attendance summaries', () => {
  const half = (status: string) => ({ status, flags: [] }) as never;
  const day = (pairs: [string, string][]): ClassDay => ({ rows: pairs.map(([am, pm]) => ({ am: half(am), pm: half(pm) })) }) as unknown as ClassDay;

  it('monthSummary counts present, late and absent half-days, skipping pending and no-school', () => {
    const days = [day([['on_time', 'late'], ['absent', 'absent']]), day([['excused', 'pending'], ['on_time', 'no_school']])];
    // counted halves: on_time, late, absent, absent, excused, on_time = 6; present = 4
    expect(monthSummary(days)).toEqual({ presentPct: 67, late: 1, absent: 2 });
    expect(monthSummary([])).toEqual({ presentPct: null, late: 0, absent: 0 });
  });

  it('learnerRecentDays gives at most n school days, newest first', async () => {
    const db = await demo();
    const id = (await db.enrollments.where('classId').equals(DEMO_CLASS_ID).first())!.learnerId;
    const recent = await learnerRecentDays(db, DEMO_CLASS_ID, id, NOW, 3);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.length).toBeLessThanOrEqual(3);
    expect(recent.map(r => r.date)).toEqual([...recent.map(r => r.date)].sort().reverse());
    expect(recent.every(r => r.row.learner.id === id)).toBe(true);
  });
});

describe('seat editor', () => {
  const room = () => ({ rows: 2, cols: 2, seats: ['a', 'b', null, null] as (string | null)[] });

  it('a picked learner tapped onto a taken seat moves the old one out', () => {
    const r = clickSeat(room(), { type: 'stu', id: 'c' }, 0);
    expect(r.draft.seats).toEqual(['c', 'b', null, null]);
    expect(r.movedOut).toBe('a');
    expect(r.sel).toBeNull();
  });
  it('two seats tapped in turn swap', () => {
    const first = clickSeat(room(), null, 0);
    expect(first.sel).toEqual({ type: 'seat', idx: 0 });
    expect(clickSeat(first.draft, first.sel, 1).draft.seats).toEqual(['b', 'a', null, null]);
  });
  it('stepSize reports learners pushed out by a smaller room', () => {
    expect(stepSize({ rows: 2, cols: 1, seats: ['a', 'b'] }, 'rows', -1)).toEqual({ draft: { rows: 1, cols: 1, seats: ['a'] }, lost: 1 });
  });
  it('editorHint uses Tap on the phone and Click on the laptop', () => {
    const learners = [{ id: 'a', firstName: 'Ana', lastName: 'G' }, { id: 'b', firstName: 'Ben', lastName: 'C' }] as never[];
    expect(editorHint(room(), null, learners, '', 'Tap')).toBe('Tap a learner to move them. Tap two learners to swap them.');
    expect(editorHint(room(), null, learners, '', 'Click')).toBe('Click a learner to move them. Click two learners to swap them.');
    expect(editorHint(room(), { type: 'stu', id: 'a' }, learners, '', 'Tap')).toBe('Now tap a seat for Ana G.');
  });
});
