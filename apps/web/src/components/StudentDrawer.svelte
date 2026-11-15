<script lang="ts">
  import { manilaMinute, type Session } from '@klasilid/core';
  import type { LearnerDay } from '../lib/attendance';
  import { fmtTime, STATUS_LABEL } from '../lib/format';
  import type { StudentRow } from '../lib/students';
  import Icon from './Icon.svelte';

  // Markup follows the mockup's student drawer (.drawer).
  let { row, today, className, now, onclose, oncorrect, ontransfer, oncard }: {
    row: StudentRow; today: LearnerDay | undefined; className: string; now: () => Date;
    onclose: () => void; oncorrect: (r: LearnerDay, s: Session) => void; ontransfer: () => void; oncard: (action: 'register' | 'replace') => void;
  } = $props();

  const name = $derived(`${row.learner.firstName} ${row.learner.lastName}`);
  const session = $derived<Session>(manilaMinute(now().toISOString()) >= 12 * 60 ? 'pm' : 'am');
  const tap = $derived(today?.taps.find(t => t.id === today?.[session].inTapId));
  const fmtDate = (d: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(d + 'T00:00:00Z'));
</script>

<div class="drawer-scrim open" role="presentation" onclick={onclose}></div>
<aside class="drawer open" role="dialog" aria-modal="true" aria-labelledby="sdName" tabindex="-1" onkeydown={e => e.key === 'Escape' && onclose()}>
  <div class="hrow"><span class="eyebrowless">Student</span><button class="iconbtn" type="button" aria-label="Close" onclick={onclose}><Icon name="x" cls="ico" /></button></div>
  <div class="who"><div class="avatar">{row.learner.firstName[0]}{row.learner.lastName[0]}</div>
    <div><b id="sdName">{name}</b><span>{className}{row.learner.lrn ? ` · LRN ${row.learner.lrn}` : ''}</span></div></div>
  <div class="stat3 num" style="margin-top:0">
    <div><b>{row.presentPct == null ? '—' : `${row.presentPct}%`}</b><span>Present this month</span></div>
    <div class="k-late"><b>{today ? (today.am.status === 'late' ? 1 : 0) + (today.pm.status === 'late' ? 1 : 0) : 0}</b><span>Late today</span></div>
    <div class="k-bad"><b>{today ? (today.am.status === 'absent' ? 1 : 0) + (today.pm.status === 'absent' ? 1 : 0) : 0}</b><span>Absent today</span></div>
  </div>
  <h4>Today</h4>
  <div class="rows" style="padding:0 16px"><div class="mrow">
    <div class="txt"><b>{today ? `${STATUS_LABEL[today[session].status]}${tap ? ' · ' + fmtTime(tap.at) : ''}` : 'No class today'}</b><span>{tap ? 'Door reader' : today?.[session].correctionId ? 'Corrected by you' : 'No tap yet'}</span></div>
    {#if today && row.status !== 'left'}<button class="mini-btn" type="button" onclick={() => oncorrect(today!, session)}>Correct</button>{/if}
  </div></div>
  <h4>Card and accounts</h4>
  <div class="rows" style="padding:0 16px">
    <div class="mrow"><div class="txt"><b>RFID card</b><span>{row.card.state === 'none' ? 'No card yet' : `Registered · ends in ${row.card.uid?.slice(-4)}`}</span></div>
      {#if row.status !== 'left'}<button class="mini-btn" type="button" onclick={() => oncard(row.card.state === 'none' ? 'register' : 'replace')}>{row.card.state === 'none' ? 'Register' : 'Replace'}</button>{/if}</div>
    <div class="mrow"><div class="txt"><b>Parent account</b><span>Not set up yet{row.learner.guardianName ? ` · ${row.learner.guardianName}` : ''}</span></div>
      <button class="mini-btn" type="button" disabled title="Comes with parent accounts">Login slip</button></div>
  </div>
  <h4>Enrollment</h4>
  <div class="rows" style="padding:0 16px"><div class="mrow">
    {#if row.status === 'left'}
      <div class="txt"><b>Left {fmtDate(row.enrollment.leftOn!)}</b><span>{row.enrollment.leaveReason ?? 'Transferred out'}</span></div>
    {:else}
      <div class="txt"><b>Enrolled</b><span>Since {fmtDate(row.enrollment.joinedOn)}{row.enrollment.joinedFrom ? ` · from ${row.enrollment.joinedFrom}` : ''}</span></div>
      <button class="mini-btn" type="button" onclick={ontransfer}>Transferred out</button>
    {/if}
  </div></div>
  <h4>Grades this term</h4>
  <div class="rows" style="padding:0 16px"><div class="mrow"><div class="txt"><b>Comes with class records</b><span>Grades appear once class records are uploaded.</span></div></div></div>
  <h4>History</h4>
  <div class="rows" style="padding:0 16px"><div class="mrow"><div class="txt"><b>SY 2026–2027</b><span>{className} · {row.presentPct == null ? 'no days yet' : `${row.presentPct}% present this month`}</span></div></div></div>
</aside>
