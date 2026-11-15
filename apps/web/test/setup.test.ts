import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Setup from '../src/pages/Setup.svelte';
import { openDb } from '../src/lib/db';
import { applySetup, DEFAULT_WINDOWS, parseLearnerList, validateSetup, type SetupInput } from '../src/lib/setup';

const NOW = new Date('2026-11-13T00:00:00Z'); // 08:00 Manila, Fri Nov 13
const input = (over: Partial<SetupInput> = {}): SetupInput => ({
  schoolName: 'Test Central School', yearLabel: 'SY 2026–2027', startsOn: '2026-06-01', endsOn: '2027-04-30',
  grade: 6, section: 'Diamond', rows: 8, cols: 5, windows: DEFAULT_WINDOWS.map(w => ({ ...w })),
  learners: [{ lastName: 'Abad', firstName: 'Ana', sex: 'F' }, { lastName: 'Bautista', firstName: 'Ben', sex: 'M' }],
  ...over,
});

describe('validateSetup', () => {
  it('passes a complete input', () => {
    expect(validateSetup(input())).toEqual([]);
  });
  it("reports overlapping tap times with core's message", () => {
    const windows = input().windows.map(w => (w.session === 'am' && w.kind === 'out' ? { ...w, opens: '07:50' } : w));
    expect(validateSetup(input({ windows }))).toContain('Morning out overlaps Morning in');
  });
  it('rejects no learners and duplicate learners', () => {
    expect(validateSetup(input({ learners: [] }))).toContain('Add at least one learner');
    const dup = [{ lastName: 'Abad', firstName: 'Ana', sex: 'F' as const }, { lastName: 'abad ', firstName: 'ana', sex: 'F' as const }];
    expect(validateSetup(input({ learners: dup }))).toContain('Duplicate learner: Abad, Ana');
  });
  it('rejects a missing section, a blank school and a backwards school year', () => {
    const e = validateSetup(input({ section: '', schoolName: ' ', endsOn: '2026-05-01' }));
    expect(e).toEqual(expect.arrayContaining(['Choose a section', 'Enter the school name', 'The school year must end after it starts']));
  });
});

it('parseLearnerList splits "Last, First Middle" lines and skips blanks', () => {
  expect(parseLearnerList('Abad, Ana Cruz\n\n  Bautista, Ben\nNoComma')).toEqual([
    { lastName: 'Abad', firstName: 'Ana', middleName: 'Cruz' },
    { lastName: 'Bautista', firstName: 'Ben' },
  ]);
});

it('applySetup writes class, learners, windows, seat plan and the outbox ops in order', async () => {
  const db = openDb('t-' + crypto.randomUUID());
  const classId = await applySetup(db, input(), NOW);
  expect(await db.classes.get(classId)).toMatchObject({ grade: 6, section: 'Diamond', isAdvisory: true });
  expect(await db.learners.count()).toBe(2);
  expect(await db.enrollments.where('classId').equals(classId).count()).toBe(2);
  const windows = await db.tapWindows.toArray();
  expect(windows).toHaveLength(4);
  expect(windows.every(w => w.effectiveFrom === '2026-11-13')).toBe(true);
  expect(await db.seatPlans.toArray()).toMatchObject([{ classId, rows: 8, cols: 5, effectiveFrom: '2026-11-13' }]);
  const ops = (await db.outbox.orderBy('seq').toArray()).map(i => (i.op.kind === 'rpc' ? i.op.fn : i.op.table));
  expect(ops).toEqual(['setup_class', 'add_learner', 'add_learner', 'tap_windows', 'tap_windows', 'tap_windows', 'tap_windows', 'seat_plans']);
  const first = (await db.outbox.orderBy('seq').first())!.op;
  expect(first).toMatchObject({ kind: 'rpc', fn: 'setup_class', args: { p_class_id: classId, p_grade: 6, p_section: 'Diamond' } });
  expect((await db.meta.get('classId'))?.value).toBe(classId);
});

describe('wizard', () => {
  const start = () => render(Setup, { db: openDb('t-' + crypto.randomUUID()), now: () => NOW, onfinish: vi.fn() });
  const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;

  it("the Next button is disabled until the step is valid", async () => {
    start();
    await fireEvent.input(screen.getByLabelText('School'), { target: { value: 'Test Central School' } });
    expect(next().disabled).toBe(true);
    await fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Diamond' } });
    expect(next().disabled).toBe(false);
  });

  it('uses selects for grade, section, rows, seats and every tap time', async () => {
    start();
    expect(screen.getByLabelText('Grade').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Section').tagName).toBe('SELECT');
    expect(screen.getByLabelText('School year').tagName).toBe('SELECT');
    await fireEvent.input(screen.getByLabelText('School'), { target: { value: 'Test Central School' } });
    await fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Diamond' } });
    await fireEvent.click(next());                                    // → Students
    await fireEvent.input(screen.getByLabelText('Paste a list'), { target: { value: 'Abad, Ana' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add from list' }));
    await fireEvent.click(next());                                    // → Cards
    await fireEvent.click(next());                                    // → Seats
    expect(screen.getByLabelText('Rows').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Seats per row').tagName).toBe('SELECT');
    await fireEvent.click(next());                                    // → School hours
    expect(screen.getAllByRole('combobox')).toHaveLength(10);         // 4 opens + 2 late-after + 4 closes
  });
});
