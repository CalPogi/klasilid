<script lang="ts">
  import type { CorrectionReason, IsoDate, Session } from '@klasilid/core';
  import type { LearnerDay } from '../lib/attendance';
  import { recordCorrection, type KlasilidDb, type LCorrection } from '../lib/db';
  import { fmtTime, STATUS_LABEL } from '../lib/format';
  import Modal from './Modal.svelte';

  // Markup follows the mockup's correction modal: name, what happened, status choices, reason, Cancel / Save change.
  let { db, classId, date, day, session, teacherId, onclose, onsaved }: {
    db: KlasilidDb; classId: string; date: IsoDate; day: LearnerDay; session: Session; teacherId: string;
    onclose: () => void; onsaved: (c: LCorrection) => void;
  } = $props();

  // Exact wording from the spec (§7.1) and the approved mockup.
  const REASONS: [CorrectionReason, string][] = [
    ['forgot_card', 'Forgot their card'], ['card_not_working', 'Card not working'],
    ['tapped_by_classmate', 'Tapped by a classmate, not in room'], ['sick', 'Sick (excused)'],
    ['school_activity', 'School activity or errand'], ['arrived_no_tap', 'Arrived but did not tap'], ['other', 'Other…'],
  ];
  const STATUSES = ['on_time', 'late', 'absent', 'excused'] as const;
  const id = 'c-' + Math.random().toString(36).slice(2);

  let which: Session = $state(session); // the grid and lists pick a half; the teacher can switch (spec §7.1: corrections are per half-day)
  const half = $derived(day[which]);
  const tapAt = $derived(day.taps.find(t => t.id === half.inTapId)?.at);
  const meta = $derived(`${which === 'am' ? 'Morning' : 'Afternoon'} · ${tapAt ? `Tapped in at ${fmtTime(tapAt)}` : 'No tap'} · now ${STATUS_LABEL[half.status].toLowerCase()}`);

  let status: LCorrection['status'] = $state(day[session].status === 'absent' ? 'excused' : 'absent');
  let reason: CorrectionReason | '' = $state('');
  let reasonText = $state('');
  let photo: File | undefined = $state();
  let saving = $state(false);
  let error = $state('');
  const ok = $derived(!!reason && (reason !== 'other' || !!reasonText.trim()) && !saving);

  async function save() {
    if (!ok || !reason) return;
    saving = true;
    try {
      const c = await recordCorrection(db, {
        learnerId: day.learner.id, classId, date, session: which, status, reason, createdBy: teacherId,
        ...(reason === 'other' ? { reasonText: reasonText.trim() } : {}),
      });
      if (photo) await db.photos.put({ correctionId: c.id, blob: photo, name: photo.name });
      onsaved(c);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      saving = false;
    }
  }
</script>

<Modal labelledby={id} {onclose}>
  <h4 {id}>{day.learner.firstName} {day.learner.lastName}</h4>
  <div class="meta">{meta}</div>
  <div class="seg halves" role="radiogroup" aria-label="Half-day">
    {#each [['am', 'Morning'], ['pm', 'Afternoon']] as [h, label]}
      <button type="button" role="radio" aria-checked={which === h} class:sel={which === h} disabled={day[h as Session].status === 'no_school'}
        onclick={() => (which = h as Session)}>{label}</button>
    {/each}
  </div>
  <div class="seg" role="radiogroup" aria-label="Status">
    {#each STATUSES as s}
      <button type="button" role="radio" aria-checked={status === s} class:sel={status === s} onclick={() => (status = s)}>{STATUS_LABEL[s]}</button>
    {/each}
  </div>
  <div class="field" class:err={!!error}>
    <label for="{id}-r">Reason</label>
    <select id="{id}-r" bind:value={reason}>
      <option value="">Choose a reason…</option>
      {#each REASONS as [code, label]}<option value={code}>{label}</option>{/each}
    </select>
    {#if reason === 'other'}
      <input autocomplete="off" placeholder="Type the reason" aria-label="Type the reason" required bind:value={reasonText} style="margin-top:8px" />
    {/if}
    <div class="help">{error || 'Required. The parent sees the new status.'}</div>
  </div>
  <div class="field">
    <label for="{id}-p">Excuse letter photo (optional)</label>
    <input id="{id}-p" type="file" accept="image/*" onchange={e => (photo = e.currentTarget.files?.[0])} style="padding-top:12px" />
  </div>
  <div class="actions">
    <button class="btn ghost" type="button" onclick={onclose}>Cancel</button>
    <button class="btn" type="button" disabled={!ok} onclick={save}>Save change</button>
  </div>
</Modal>

<style>
  .halves { grid-template-columns: repeat(2, 1fr); margin-bottom: 8px; }
</style>
