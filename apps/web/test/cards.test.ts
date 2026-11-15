import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import RegisterCardModal from '../src/components/RegisterCardModal.svelte';
import { classDay } from '../src/lib/attendance';
import { assignCard, replaceCard, waitForNewCard } from '../src/lib/students';
import { at, classDb } from './fixture';

const NOW = new Date(at('09:00'));

it('assignCard registers an unknown card to the learner and queues the insert', async () => {
  const db = await classDb();
  expect(await assignCard(db, 'c', 'dd00ee11', NOW)).toEqual({ ok: true });
  expect(await db.cards.get('DD00EE11')).toMatchObject({ learnerId: 'c', active: true });
  expect((await db.outbox.toArray())[0].op).toMatchObject({ kind: 'insert', table: 'cards', row: { uid: 'DD00EE11', learner_id: 'c', active: true } });
});

it('a card that belongs to another learner is refused with their name and nothing is written', async () => {
  const db = await classDb();
  expect(await assignCard(db, 'c', 'BBBBBBBB', NOW)).toEqual({ ok: false, reason: 'taken', ownerName: 'Ben Bautista' });
  expect(await db.outbox.count()).toBe(0);
  expect((await db.cards.get('BBBBBBBB'))!.learnerId).toBe('b');
});

it('an old deactivated card cannot be given to someone else either', async () => {
  const db = await classDb();
  await db.cards.update('BBBBBBBB', { active: false });
  expect(await assignCard(db, 'c', 'BBBBBBBB', NOW)).toMatchObject({ ok: false, reason: 'taken' });
});

it('replaceCard deactivates the old card so its taps no longer count for the learner', async () => {
  const db = await classDb();
  await replaceCard(db, 'a', NOW);
  expect(await db.cards.get('AAAAAAAA')).toMatchObject({ active: false, replacedAt: NOW.toISOString() });
  expect((await db.outbox.toArray())[0].op).toMatchObject({ kind: 'update', table: 'cards', match: { uid: 'AAAAAAAA' }, values: { active: false } });
  const day = await classDay(db, 'c1', '2026-11-13', new Date(at('20:00')));
  expect(day.rows[0].am.status).toBe('absent');
  expect(day.unknownTaps.map(t => t.id)).toEqual(['t1']);
});

it('waitForNewCard resolves with the first unknown tap after the modal opened, ignoring known cards and older taps', async () => {
  const db = await classDb();
  const since = new Date(at('08:00'));
  await db.taps.put({ id: 'old', deviceId: 'd', cardUid: 'OLD00001', at: at('07:59'), clockSuspect: false });
  await db.taps.put({ id: 'known', deviceId: 'd', cardUid: 'AAAAAAAA', at: at('08:01'), clockSuspect: false });
  let polls = 0;
  const poll = async () => {
    polls++;
    if (polls === 2) await db.taps.put({ id: 'new', deviceId: 'd', cardUid: 'NEW00001', at: at('08:02'), clockSuspect: false });
  };
  const uid = await waitForNewCard(db, since, new AbortController().signal, poll, 5);
  expect(uid).toBe('NEW00001');
});

it('bulk registration walks learners without a card in order; skip moves on; a taken card keeps waiting', async () => {
  const db = await classDb();
  await db.cards.bulkDelete(['BBBBBBBB', 'CCCCCCCC']);
  const learners = (await db.learners.bulkGet(['b', 'c'])).map(l => l!);
  render(RegisterCardModal, { db, learners, bulk: true, mode: 'demo', now: () => NOW, poll: async () => {}, onclose: vi.fn() });
  expect(screen.getByText('0 of 2 registered')).toBeTruthy();
  expect(screen.getByText('Ben Bautista')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
  expect(screen.getByText('Carla Castro')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Simulate tap' }));
  await vi.waitFor(async () => expect((await db.cards.where('learnerId').equals('c').toArray()).length).toBe(1));
  expect(await screen.findByText('1 of 2 registered')).toBeTruthy();
  expect(screen.getByText('Ben Bautista')).toBeTruthy();
});
