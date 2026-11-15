<script lang="ts">
  import type { CorrectionReason, IsoDate, Session } from '@klasilid/core';
  import type { LearnerDay } from '../lib/attendance';
  import { recordCorrection, type KlasilidDb, type LCorrection } from '../lib/db';
  import { fmtTime, STATUS_LABEL } from '../lib/format';
  import Modal from './Modal.svelte';

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

  const half = $derived(day[session]);
  const tapAt = $derived(day.taps.find(t => t.id === half.inTapId)?.at);
  const now = $derived(`${session === 'am' ? 'Morning' : 'Afternoon'} · now ${STATUS_LABEL[half.status]}${tapAt ? ' · ' + fmtTime(tapAt) : ''}`);

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
        learnerId: day.learner.id, classId, date, session, status, reason, createdBy: teacherId,
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

<Modal title="Change {day.learner.firstName} {day.learner.lastName}" {onclose}>
  <p class="now">{now}</p>
  <div class="field"><label for="cs">New status</label>
    <select id="cs" bind:value={status}>{#each STATUSES as s}<option value={s}>{STATUS_LABEL[s]}</option>{/each}</select></div>
  <div class="field"><label for="cr">Reason</label>
    <select id="cr" bind:value={reason} required>
      <option value="" disabled>Choose a reason…</option>
      {#each REASONS as [code, label]}<option value={code}>{label}</option>{/each}
    </select>
    <small>Required. The parent sees the new status.</small></div>
  {#if reason === 'other'}
    <div class="field"><label for="ct">What happened?</label><textarea id="ct" required bind:value={reasonText}></textarea></div>
  {/if}
  <div class="field"><label for="cp">Excuse letter photo (optional)</label>
    <input id="cp" type="file" accept="image/*" onchange={e => (photo = e.currentTarget.files?.[0])} /></div>
  {#if error}<p class="err" role="alert">{error}</p>{/if}
  {#snippet actions()}
    <button class="btn ghost" type="button" onclick={onclose}>Cancel</button>
    <button class="btn" type="button" disabled={!ok} onclick={save}>Save change</button>
  {/snippet}
</Modal>

<style>
  .now { margin: -6px 0 0; color: var(--muted); font-weight: 600; font-size: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  small { color: var(--muted); font-size: 12.5px; }
  input[type='file'] { font-size: 14px; min-height: 44px; }
  .err { margin: 0; color: var(--bad-ink); font-weight: 600; font-size: 14px; }
</style>
