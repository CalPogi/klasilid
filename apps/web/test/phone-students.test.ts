import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import TransferModal from '../src/components/TransferModal.svelte';
import { openDb } from '../src/lib/db';
import { DEMO_CLASS_ID, DEMO_TEACHER_ID, seedDemo } from '../src/lib/demo';
import StudentPhone from '../src/pages/phone/StudentPhone.svelte';
import StudentsPhone from '../src/pages/phone/StudentsPhone.svelte';
import { mockMatchMedia } from './phone-helpers';

const NOW = new Date('2026-11-13T00:30:00Z');
const demo = async () => { mockMatchMedia(true); const db = openDb('t-' + crypto.randomUUID()); await seedDemo(db, NOW); return db; };
const base = { classId: DEMO_CLASS_ID, teacherId: DEMO_TEACHER_ID, now: () => NOW, mode: 'demo' as const };
const firstLearner = async (db: Awaited<ReturnType<typeof demo>>) => (await db.enrollments.where('classId').equals(DEMO_CLASS_ID).first())!;

afterEach(() => { location.hash = ''; });

it('Students rows show short names with today’s first tap, and a row opens that learner', async () => {
  render(StudentsPhone, { db: await demo(), ...base, onregister: vi.fn() });
  const rows = await screen.findAllByRole('button', { name: /(In \d|No tap yet)/ });
  expect(rows[0].querySelector('b')!.textContent).toMatch(/^[A-Z][a-z]+ [A-Z]\.$/);
  await fireEvent.click(rows[0]);
  expect(location.hash).toMatch(/^#\/student\?id=/);
});

it('the No card chip filters the list, and the banner registers cards in bulk', async () => {
  const db = await demo();
  const card = (await db.cards.toArray()).find(c => c.active)!;
  await db.cards.update(card.uid, { active: false });
  const onregister = vi.fn();
  render(StudentsPhone, { db, ...base, onregister });
  await fireEvent.click(await screen.findByRole('button', { name: /^No card/ }));
  await vi.waitFor(() => expect(screen.getAllByRole('button', { name: /(In \d|No tap yet)/ })).toHaveLength(1), { timeout: 5000 });
  await fireEvent.click(screen.getByRole('button', { name: /Register cards for 1 learner/ }));
  expect(onregister).toHaveBeenCalledWith({ bulk: true });
});

it('the + button opens the Add student sheet', async () => {
  render(StudentsPhone, { db: await demo(), ...base, onregister: vi.fn() });
  await fireEvent.click(await screen.findByRole('button', { name: 'Add student' }));
  expect(await screen.findByRole('heading', { name: 'Add student' })).toBeTruthy();
});

it('a learner’s page shows recent days; Correct opens a sheet that back closes', async () => {
  const db = await demo();
  const e = await firstLearner(db);
  render(StudentPhone, { db, ...base, id: e.learnerId, onregister: vi.fn() });
  expect(await screen.findByText('Recent days')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
  expect(await screen.findByRole('button', { name: 'Save change' })).toBeTruthy();
  history.back();
  await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Save change' })).toBeNull());
  expect(screen.getByText('Recent days')).toBeTruthy();
});

it('a learner’s card row registers or replaces; Transferred out opens its sheet', async () => {
  const db = await demo();
  const e = await firstLearner(db);
  const onregister = vi.fn();
  render(StudentPhone, { db, ...base, id: e.learnerId, onregister });
  await fireEvent.click(await screen.findByRole('button', { name: /^(Replace|Register)$/ }));
  await vi.waitFor(() => expect(onregister).toHaveBeenCalledWith({ learner: expect.objectContaining({ id: e.learnerId }) }));
  await fireEvent.click(screen.getByRole('button', { name: 'Transferred out' }));
  expect(await screen.findByRole('heading', { name: 'Mark as transferred out' })).toBeTruthy();
});

it('a transferred-out learner has no actions', async () => {
  const db = await demo();
  const e = await firstLearner(db);
  await db.enrollments.update(e.id, { leftOn: '2026-11-11', leaveReason: 'Transferred out' });
  render(StudentPhone, { db, ...base, id: e.learnerId, onregister: vi.fn() });
  expect((await screen.findAllByText(/^Left /)).length).toBeGreaterThan(0);
  for (const name of ['Correct', 'Replace', 'Register', 'Transferred out']) expect(screen.queryByRole('button', { name })).toBeNull();
});

it('an unknown learner goes back to Students', async () => {
  render(StudentPhone, { db: await demo(), ...base, id: 'nobody', onregister: vi.fn() });
  await vi.waitFor(() => expect(location.hash).toBe('#/students'));
});

it('the transfer sheet uses no real school name as its example', async () => {
  render(TransferModal, { db: await demo(), enrollmentId: 'x', name: 'Ana G.', days: ['2026-11-13'], today: '2026-11-13', onclose: vi.fn(), ondone: vi.fn() });
  expect(screen.getByLabelText('New school').getAttribute('placeholder')).toBe('Name of the new school');
});
