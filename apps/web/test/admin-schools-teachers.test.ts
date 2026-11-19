import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, expect, it, vi } from 'vitest';
import AdminApp from '../src/pages/admin/AdminApp.svelte';
import { fakeAdmin } from './admin-helpers';

let clip: ReturnType<typeof vi.fn>;
beforeEach(() => {
  clip = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: clip }, configurable: true });
});

const open = async (tab: 'Schools' | 'Teachers', over: Parameters<typeof fakeAdmin>[0] = {}) => {
  const f = fakeAdmin(over);
  render(AdminApp, { sb: f.sb, onsignout: vi.fn(), now: () => new Date('2026-11-19T00:02:00Z') });
  await screen.findByRole('heading', { name: 'Readers' });
  await fireEvent.click(within(screen.getByRole('navigation', { name: 'Admin' })).getByText(tab));
  await screen.findByRole('heading', { name: tab });
  return f;
};

it('lists schools with advisers and code state', async () => {
  await open('Schools');
  const row = screen.getAllByRole('row')[1];
  expect(row.textContent).toContain('San Isidro West Central School');
  expect(row.textContent).toContain('2');
  expect(row.textContent).toContain('Working · made Nov 18');
});

it('Add school shows the code and invite link once', async () => {
  const { calls } = await open('Schools');
  await fireEvent.click(screen.getByRole('button', { name: 'Add school' }));
  const dialog = screen.getByRole('dialog', { name: 'Add a school' });
  await fireEvent.input(within(dialog).getByLabelText('School name'), { target: { value: 'Sample Elementary School' } });
  await fireEvent.click(within(dialog).getByRole('button', { name: 'Add school' }));
  const shown = await screen.findByRole('dialog', { name: 'Sign-up code for Sample Elementary School' });
  expect(calls.find(c => c.action === 'addSchool')).toEqual({ action: 'addSchool', name: 'Sample Elementary School' });
  expect(shown.textContent).toContain('QK7P-4XWN');
  expect(shown.textContent).toContain('klasilid.pages.dev/app/#/signup?invite=QK7P-4XWN');
  await fireEvent.click(within(shown).getByRole('button', { name: 'Copy invite link for advisers' }));
  expect(clip).toHaveBeenCalledWith('https://klasilid.pages.dev/app/#/signup?invite=QK7P-4XWN');
  await fireEvent.click(within(shown).getByRole('button', { name: 'Done, I’ve copied it' }));
  await waitFor(() => expect(screen.queryByText('QK7P-4XWN')).toBeNull());
});

it('New code warns that the old code stops working', async () => {
  const { calls } = await open('Schools');
  await fireEvent.click(screen.getByRole('button', { name: 'New code' }));
  const ask = screen.getByRole('dialog', { name: 'Make a new code for San Isidro West Central School?' });
  expect(ask.textContent).toContain('The old code stops working right away.');
  expect(calls.some(c => c.action === 'newSchoolCode')).toBe(false);
  await fireEvent.click(within(ask).getByRole('button', { name: 'Make new code' }));
  const shown = await screen.findByRole('dialog', { name: 'New sign-up code' });
  expect(shown.textContent).toContain('For San Isidro West Central School. The old code no longer works.');
  expect(calls.find(c => c.action === 'newSchoolCode')).toEqual({ action: 'newSchoolCode', schoolId: 'school-1' });
});

it('copying a class id writes the uuid to the clipboard', async () => {
  await open('Teachers');
  await fireEvent.click(screen.getByRole('button', { name: 'Copy class id of Gr. 6 Test' }));
  expect(clip).toHaveBeenCalledWith('class-test');
});

it('Delete account needs the exact username and refreshes the list', async () => {
  const { calls } = await open('Teachers');
  await fireEvent.click(screen.getAllByRole('button', { name: 'Delete account' })[1]);
  const dialog = screen.getByRole('dialog', { name: 'Delete Test Adviser’s account?' });
  expect(dialog.textContent).toContain('Gr. 6 Test');
  expect(dialog.textContent).toContain('Only for test accounts, or when the school asks in writing after the teacher has exported her data.');
  const go = within(dialog).getByRole('button', { name: 'Delete account' }) as HTMLButtonElement;
  await fireEvent.input(within(dialog).getByLabelText('Type test-adviser to confirm'), { target: { value: 'Test-Adviser' } });
  expect(go.disabled).toBe(true);
  await fireEvent.input(within(dialog).getByLabelText('Type test-adviser to confirm'), { target: { value: 'test-adviser' } });
  await fireEvent.click(go);
  await waitFor(() => expect(calls.find(c => c.action === 'deleteTeacher')).toEqual({ action: 'deleteTeacher', teacherId: 'teacher-2', confirm: 'test-adviser' }));
  await waitFor(() => expect(calls.filter(c => c.action === 'overview').length).toBe(2));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('photos left after a delete offer a retry', async () => {
  const f = await open('Teachers');
  f.answers.deleteTeacher = { ok: true, photosLeft: ['class-test'] };
  await fireEvent.click(screen.getAllByRole('button', { name: 'Delete account' })[1]);
  const dialog = screen.getByRole('dialog', { name: 'Delete Test Adviser’s account?' });
  await fireEvent.input(within(dialog).getByLabelText('Type test-adviser to confirm'), { target: { value: 'test-adviser' } });
  await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }));
  const left = await screen.findByRole('dialog', { name: 'Account deleted' });
  expect(left.textContent).toContain('Some excuse-letter photos weren’t deleted.');
  await fireEvent.click(within(left).getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(f.calls.find(c => c.action === 'removeClassPhotos')).toEqual({ action: 'removeClassPhotos', classIds: ['class-test'] }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Account deleted' })).toBeNull());
});
