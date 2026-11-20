<script lang="ts">
  import type { KlasilidDb, LLearner } from '../lib/db';
  import type { Mode } from '../lib/session';
  import { assignCard, replaceCard, waitForNewCard } from '../lib/students';
  import Modal from './Modal.svelte';

  // Markup follows the mockup's register-card (#regModal) and register-in-a-row (#bulkModal) modals.
  // replace: the learner's card is lost or broken. Nothing changes until the teacher confirms; then the old card stops
  // working and the dialog waits for the new one.
  let { db, learners, bulk = false, replace = false, mode, now, poll, onclose }: {
    db: KlasilidDb; learners: LLearner[]; bulk?: boolean; replace?: boolean; mode: Mode; now: () => Date; poll: () => Promise<void>; onclose: () => void;
  } = $props();

  let queue = $state([...learners]);
  let done = $state(0);
  let ok = $state(false);
  let note = $state('');
  const total = learners.length;
  const current = $derived(queue[0]);
  const name = (l: LLearner) => `${l.firstName} ${l.lastName}`;
  let waiter: AbortController | undefined;
  let asking = $state(replace);
  async function confirmReplace() {
    if (!current) return;
    await replaceCard(db, current.id, now());
    asking = false;
    listen();
  }

  async function take(uid: string) {
    if (!current) return;
    const r = await assignCard(db, current.id, uid, now());
    if (!r.ok) { note = `This card belongs to ${r.ownerName}. Tap a blank card.`; listen(); return; }
    note = '';
    done++;
    poll().catch(() => {});  // send it now: the door reader is checking for this card while the learner waits
    if (!bulk) { ok = true; setTimeout(onclose, 1200); return; }
    queue = queue.slice(1);
    if (queue.length) listen();
  }
  function listen() {
    waiter?.abort();
    if (mode === 'demo' || !current || asking) return;   // demo has no reader: the Simulate tap button stands in
    waiter = new AbortController();
    waitForNewCard(db, now(), waiter.signal, poll, 1000).then(take, () => {});  // every second: the learner waits at the door
  }
  function skip() {
    queue = [...queue.slice(1), queue[0]];
    note = '';
    listen();
  }
  const simulate = () => take(Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('').toUpperCase());
  $effect(() => { listen(); return () => waiter?.abort(); });
</script>

<Modal labelledby="rgTitle" {onclose}>
  {#if bulk}
    <h4 id="rgTitle">Register cards in a row</h4><div class="meta">Hand out the cards in this order. Each tap registers one card and moves to the next learner.</div>
    <div class="bulk-prog" aria-hidden="true"><i style="width:{total ? (done / total) * 100 : 0}%"></i></div>
    <div class="sub2 num" style="margin:0 0 8px">{done} of {total} registered</div>
    <div class="bulk-now">
      {#if current}
        <div class="avatar">{current.firstName[0]}{current.lastName[0]}</div><div><b>{name(current)}</b><span>{note || "Tap this learner's card on the door reader"}</span></div>
      {:else}
        <div class="avatar">✓</div><div><b>All cards registered</b><span>Every learner can tap in now.</span></div>
      {/if}
    </div>
    <div class="actions">
      {#if current}
        <button class="btn ghost" type="button" onclick={skip}>Skip for now</button>
        {#if mode === 'demo'}<button class="btn" type="button" onclick={simulate}>Simulate tap</button>{:else}<button class="btn" type="button" onclick={onclose}>Finish later</button>{/if}
      {:else}
        <button class="btn" type="button" onclick={onclose}>Done</button>
      {/if}
    </div>
  {:else if current && asking}
    <h4 id="rgTitle">Replace card</h4><div class="meta">For {name(current)}</div>
    <div class="tapwait">
      <b>{current.firstName}’s current card stops working now</b>
      <span>Use this when a card is lost or broken. Taps made with it so far still count. Next, tap the new card on the door reader.</span>
    </div>
    <div class="actions">
      <button class="btn ghost" type="button" onclick={onclose}>Cancel</button>
      <button class="btn" type="button" onclick={confirmReplace}>Replace card</button>
    </div>
  {:else if current}
    <h4 id="rgTitle">Register card</h4><div class="meta">For {name(current)}</div>
    <div class="tapwait">
      <div class="ring" class:ok><svg aria-hidden="true"><use href="#i-{ok ? 'check' : 'wifi'}" /></svg></div>
      <b>{ok ? 'Card registered' : 'Tap a blank card on the door reader'}</b>
      <span>{ok ? `${name(current)} can tap in now.` : note || 'The reader beeps when it reads the card. Waiting…'}</span>
    </div>
    <div class="actions">
      <button class="btn ghost" type="button" onclick={onclose}>Cancel</button>
      {#if mode === 'demo' && !ok}<button class="btn" type="button" onclick={simulate}>Simulate tap</button>{/if}
    </div>
  {/if}
</Modal>
