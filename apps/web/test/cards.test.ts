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
  expect((await db.outbox.toArray())[0].op).toEqual({ kind: 'rpc', fn: 'register_card', args: { p_uid: 'DD00EE11', p_learner_id: 'c' } });
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

it('a switched-off card tapped again for the same learner is turned back on', async () => {
  const db = await classDb();
  await replaceCard(db, 'a', NOW);
  expect(await assignCard(db, 'a', 'aaaaaaaa', NOW)).toEqual({ ok: true });
  const card = await db.cards.get('AAAAAAAA');
  expect(card).toMatchObject({ learnerId: 'a', active: true });
  expect(card?.replacedAt).toBeUndefined();
  expect((await db.outbox.toArray()).at(-1)!.op).toEqual(
    { kind: 'update', table: 'cards', match: { uid: 'AAAAAAAA' }, values: { active: true, replaced_at: null } });
});

it('turning an old card back on switches off the newer card the learner got meanwhile', async () => {
  const db = await classDb();
  await replaceCard(db, 'a', NOW);
  expect(await assignCard(db, 'a', 'DD00EE11', NOW)).toEqual({ ok: true });
  expect(await assignCard(db, 'a', 'AAAAAAAA', NOW)).toEqual({ ok: true });
  expect(await db.cards.get('DD00EE11')).toMatchObject({ active: false });
  expect(await db.cards.get('AAAAAAAA')).toMatchObject({ active: true });
});

it('a card that is still on for the learner is refused, so a double tap does nothing', async () => {
  const db = await classDb();
  expect(await assignCard(db, 'a', 'AAAAAAAA', NOW)).toMatchObject({ ok: false, reason: 'taken' });
  expect(await db.outbox.count()).toBe(0);
});

it('replaceCard stops the old card from now on; taps from before still count for the learner (a lost card keeps its history)', async () => {
  const db = await classDb();
  await replaceCard(db, 'a', NOW);
  expect(await db.cards.get('AAAAAAAA')).toMatchObject({ active: false, replacedAt: NOW.toISOString() });
  expect((await db.outbox.toArray())[0].op).toMatchObject({ kind: 'update', table: 'cards', match: { uid: 'AAAAAAAA' }, values: { active: false } });
  await db.taps.put({ id: 'lost', deviceId: 'd', cardUid: 'AAAAAAAA', at: at('09:30'), clockSuspect: false });  // someone has the lost card
  const day = await classDay(db, 'c1', '2026-11-13', new Date(at('20:00')));
  expect(day.rows[0].am.status).not.toBe('absent');  // t1 at 07:00, before the card was switched off
  expect(day.rows[0].taps.map(t => t.id)).toEqual(['t1']);
  expect(day.unknownTaps.map(t => t.id)).toEqual(['lost']);
});

it('the tap that registers a card does not count as attendance; the next one does', async () => {
  const db = await classDb();
  await db.cards.delete('CCCCCCCC');
  await db.taps.put({ id: 'reg', deviceId: 'd', cardUid: 'DD00EE11', at: at('07:05'), clockSuspect: false });
  await assignCard(db, 'c', 'DD00EE11', new Date(Date.parse(at('07:05')) + 4000));  // saved 4 s after the tap
  let day = await classDay(db, 'c1', '2026-11-13', new Date(at('20:00')));
  const c = () => day.rows.find(r => r.learner.id === 'c')!;
  expect(c().taps).toEqual([]);
  expect(c().am.status).toBe('absent');
  expect(day.unknownTaps.map(t => t.id)).not.toContain('reg');  // not a stray tap either
  await db.taps.put({ id: 'real', deviceId: 'd', cardUid: 'DD00EE11', at: at('07:06'), clockSuspect: false });
  day = await classDay(db, 'c1', '2026-11-13', new Date(at('20:00')));
  expect(c().taps.map(t => t.id)).toEqual(['real']);
});

it('waitForNewCard returns a tap from a card already on file, so the modal can say whose it is', async () => {
  const db = await classDb();
  const poll = async () => { await db.taps.put({ id: 'known', deviceId: 'd', cardUid: 'BBBBBBBB', at: at('08:01'), clockSuspect: false }); };
  expect(await waitForNewCard(db, new Date(at('08:00')), new AbortController().signal, poll, 5)).toBe('BBBBBBBB');
});

it('waitForNewCard resolves with the first tap after the modal opened, ignoring older taps', async () => {
  const db = await classDb();
  const since = new Date(at('08:00'));
  await db.taps.put({ id: 'old', deviceId: 'd', cardUid: 'OLD00001', at: at('07:59'), clockSuspect: false });
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

it('a registered card is sent to the server at once, so the door reader can find it while the learner waits', async () => {
  const db = await classDb();
  await db.cards.delete('CCCCCCCC');
  const poll = vi.fn(async () => {});
  render(RegisterCardModal, { db, learners: [(await db.learners.get('c'))!], mode: 'demo', now: () => NOW, poll, onclose: vi.fn() });
  await fireEvent.click(screen.getByRole('button', { name: 'Simulate tap' }));
  await vi.waitFor(() => expect(poll).toHaveBeenCalled());
});

it('while the register dialog waits, it looks for the tap every second', async () => {
  const db = await classDb();
  vi.useFakeTimers({ toFake: ['setTimeout'] });  // the database's own timers stay real
  try {
    const poll = vi.fn(async () => {});
    render(RegisterCardModal, { db, learners: [(await db.learners.get('c'))!], mode: 'online', now: () => NOW, poll, onclose: vi.fn() });
    await vi.advanceTimersByTimeAsync(2100);
    expect(poll.mock.calls.length).toBeGreaterThanOrEqual(3);  // at 0, 1 and 2 s
  } finally {
    vi.useRealTimers();
  }
});

it('waitForNewCard still finds the tap when this laptop clock runs 2 minutes fast', async () => {
  const db = await classDb();
  await db.taps.put({ id: 'old', deviceId: 'd', cardUid: 'OLD00001', at: at('07:59'), clockSuspect: false });
  const laptopNow = new Date(Date.parse(at('08:02')) + 2 * 60_000);  // the laptop says 08:04 when the reader says 08:02
  let polls = 0;
  const poll = async () => {
    if (++polls === 2) await db.taps.put({ id: 'new', deviceId: 'd', cardUid: 'NEW00001', at: at('08:02'), clockSuspect: false });
  };
  expect(await waitForNewCard(db, laptopNow, new AbortController().signal, poll, 5)).toBe('NEW00001');
});

it('Replace card asks first: Cancel keeps the card; confirming switches it off and waits for the new one', async () => {
  const db = await classDb();
  const learner = (await db.learners.get('a'))!;
  const first = render(RegisterCardModal, { db, learners: [learner], replace: true, mode: 'demo', now: () => NOW, poll: async () => {}, onclose: vi.fn() });
  expect(screen.getByText(/stops working now/)).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect((await db.cards.get('AAAAAAAA'))!.active).toBe(true);
  first.unmount();
  render(RegisterCardModal, { db, learners: [learner], replace: true, mode: 'demo', now: () => NOW, poll: async () => {}, onclose: vi.fn() });
  await fireEvent.click(screen.getByRole('button', { name: 'Replace card' }));
  await vi.waitFor(async () => expect((await db.cards.get('AAAAAAAA'))!.active).toBe(false));
  expect(await screen.findByText('Tap a blank card on the door reader')).toBeTruthy();
});
