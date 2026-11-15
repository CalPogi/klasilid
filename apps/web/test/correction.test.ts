import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import CorrectionModal from '../src/components/CorrectionModal.svelte';
import type { LearnerDay } from '../src/lib/attendance';
import { openDb } from '../src/lib/db';
import { fmtTime } from '../src/lib/format';

const day: LearnerDay = {
  learner: { id: 'a', firstName: 'Ana', lastName: 'Abad', sex: 'F' },
  am: { status: 'late', flags: [], inTapId: 't1' },
  pm: { status: 'pending', flags: [] },
  review: [],
  taps: [{ id: 't1', deviceId: 'd', cardUid: 'AAAAAAAA', at: '2026-11-12T23:31:00Z', clockSuspect: false }],
};

const open = () => {
  const db = openDb('t-' + crypto.randomUUID());
  const onclose = vi.fn();
  const onsaved = vi.fn();
  render(CorrectionModal, { db, classId: 'c1', date: '2026-11-13', day, session: 'am', teacherId: 't', onclose, onsaved });
  return { db, onclose, onsaved };
};
const save = () => screen.getByRole('button', { name: 'Save change' }) as HTMLButtonElement;

it('fmtTime shows Manila time', () => {
  expect(fmtTime('2026-11-12T23:31:00Z')).toBe('7:31 AM');
  expect(fmtTime('2026-11-13T05:05:00Z')).toBe('1:05 PM');
});

it('shows the learner, the half-day and the current status with its tap time', () => {
  open();
  expect(screen.getByRole('dialog', { name: 'Ana Abad' })).toBeTruthy();
  expect(screen.getByText('Morning · Tapped in at 7:31 AM · now late')).toBeTruthy();
});

it('status is chosen with the four buttons from the mockup', async () => {
  open();
  const radios = screen.getAllByRole('radio').map(r => r.textContent);
  expect(radios).toEqual(['Present', 'Late', 'Absent', 'Excused']);
  await fireEvent.click(screen.getByRole('radio', { name: 'Excused' }));
  expect(screen.getByRole('radio', { name: 'Excused' }).getAttribute('aria-checked')).toBe('true');
});

it('Save is disabled until a reason is chosen', async () => {
  open();
  expect(save().disabled).toBe(true);
  await fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'forgot_card' } });
  expect(save().disabled).toBe(false);
});

it('choosing Other shows a required text box; Save stays disabled while it is blank', async () => {
  open();
  await fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'other' } });
  const box = screen.getByLabelText('Type the reason') as HTMLInputElement;
  expect(box.required).toBe(true);
  expect(save().disabled).toBe(true);
  await fireEvent.input(box, { target: { value: '  ' } });
  expect(save().disabled).toBe(true);
  await fireEvent.input(box, { target: { value: 'Went home sick at 10' } });
  expect(save().disabled).toBe(false);
});

it('saving writes the correction and calls onsaved', async () => {
  const { db, onsaved } = open();
  await fireEvent.click(screen.getByRole('radio', { name: 'Absent' }));
  await fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'tapped_by_classmate' } });
  await fireEvent.click(save());
  await vi.waitFor(() => expect(onsaved).toHaveBeenCalledOnce());
  expect(await db.corrections.toArray()).toMatchObject([{ learnerId: 'a', session: 'am', status: 'absent', reason: 'tapped_by_classmate', createdBy: 't' }]);
});

it('the reason list has exactly the seven labels in order', () => {
  open();
  const labels = [...(screen.getByLabelText('Reason') as HTMLSelectElement).options].filter(o => o.value).map(o => o.textContent);
  expect(labels).toEqual(['Forgot their card', 'Card not working', 'Tapped by a classmate, not in room', 'Sick (excused)',
    'School activity or errand', 'Arrived but did not tap', 'Other…']);
});

it('Escape, a click outside and Cancel call onclose without saving', async () => {
  const { db, onclose } = open();
  await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await fireEvent.click(screen.getByRole('dialog'));
  await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onclose).toHaveBeenCalledTimes(3);
  expect(await db.corrections.count()).toBe(0);
});
