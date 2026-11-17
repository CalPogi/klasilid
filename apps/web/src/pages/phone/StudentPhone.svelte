<script lang="ts">
  import { manilaMinute, type IsoDate, type Session } from '@klasilid/core';
  import CorrectionModal from '../../components/CorrectionModal.svelte';
  import Icon from '../../components/Icon.svelte';
  import TransferModal from '../../components/TransferModal.svelte';
  import { classDay, dayLetter, learnerRecentDays, schoolDaysInMonth, todayManila, type DayLetter, type LearnerDay } from '../../lib/attendance';
  import type { KlasilidDb, LLearner } from '../../lib/db';
  import { fmtTime, shortName, STATUS_LABEL } from '../../lib/format';
  import { go } from '../../lib/router';
  import type { Mode } from '../../lib/session';
  import { replaceCard, studentRows, type StudentRow } from '../../lib/students';

  // The mockup's phone Student screen (data-screen="stu") plus the canvas board's Card and Enrollment groups.
  // The mockup's Parent group comes with parent accounts (plan 4).
  let { db, classId, teacherId, now, id, onregister }: {
    db: KlasilidDb; classId: string; teacherId: string; now: () => Date; mode: Mode; id: string;
    onregister: (t: { learner?: LLearner; bulk?: boolean }) => void;
  } = $props();

  const today = $derived(todayManila(now()));
  const half = $derived<Session>(manilaMinute(now().toISOString()) >= 12 * 60 ? 'pm' : 'am');
  let row: StudentRow | undefined = $state();
  let todayRow: LearnerDay | undefined = $state();
  let schoolToday = $state(false);
  let recent: { date: IsoDate; row: LearnerDay }[] = $state([]);
  let days: IsoDate[] = $state([]);
  let className = $state('');
  let correcting = $state(false);
  let moving = $state(false);

  /** Everything is read first and shown together, so the page never appears half-filled. */
  async function load() {
    const r = (await studentRows(db, classId, today, 'all', '')).find(x => x.learner.id === id);
    if (!r) { location.replace('#/students'); return; } // replace: back must not return to the bad link
    const c = await db.classes.get(classId);
    const d = await classDay(db, classId, today, now());
    const rec = await learnerRecentDays(db, classId, id, now(), 31);
    const ds = await schoolDaysInMonth(db, classId, today.slice(0, 7), today);
    className = c ? `Gr. ${c.grade} ${c.section}` : '';
    schoolToday = d.dayType === 'school' || d.dayType === 'half';
    todayRow = d.rows.find(x => x.learner.id === id);
    recent = rec;
    days = ds;
    row = r;
  }
  $effect(() => { load(); });

  const left = $derived(row?.status === 'left');
  const thisMonth = $derived(recent.filter(r => r.date.slice(0, 7) === today.slice(0, 7)).map(r => dayLetter(r.row.am, r.row.pm)));
  const tap = $derived(todayRow?.taps.find(t => t.id === todayRow?.[half].inTapId));
  const LETTER: Record<DayLetter, [string, string]> = { P: ['in', 'Present'], L: ['late', 'Late'], A: ['absent', 'Absent'], E: ['excused', 'Excused'], H: ['late', 'Half day'], N: ['notyet', 'Not yet'] };
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const times = (r: LearnerDay) => {
    const t = (tid?: string) => { const x = r.taps.find(y => y.id === tid); return x ? fmtTime(x.at).replace(/ [AP]M$/, '') : '…'; };
    const part = (h: 'am' | 'pm', label: string) => (r[h].inTapId ? `${label} ${t(r[h].inTapId)}–${t(r[h].outTapId)}` : '');
    return [part('am', 'AM'), part('pm', 'PM')].filter(Boolean).join(' · ') || 'No tap';
  };
  const fmtDate = (d: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d + 'T00:00:00Z'));
  const back = () => (history.length > 1 ? history.back() : go('students'));
</script>

<div class="hrow"><button class="iconbtn" type="button" aria-label="Back" onclick={back}><Icon name="back" cls="ico" /></button><b style="font-size:16px">Student</b><span class="spacer44"></span></div>
{#if row}
  <div class="profile-hero"><div class="avatar">{row.learner.firstName[0]}{row.learner.lastName[0]}</div><b>{shortName(row.learner)}</b><span>{className}</span></div>

  {#if left}
    <div class="card mt4"><b style="font-size:16px">Left {fmtDate(row.enrollment.leftOn!)}</b>
      <p class="eyebrowless" style="font-size:13px;margin:0">{row.enrollment.leaveReason ?? 'Transferred out'}. Their records stay, view only.</p></div>
  {:else}
    <div class="card mt4"><div class="hrow">
      <div><b style="font-size:16px">{todayRow && schoolToday ? `${STATUS_LABEL[todayRow[half].status]}${tap ? ' · ' + fmtTime(tap.at) : ''}` : 'No class today'}</b>
        <p class="eyebrowless" style="font-size:13px;margin:0">{tap ? 'Door reader' : todayRow?.[half].correctionId ? 'Corrected by you' : schoolToday ? 'No tap so far today' : 'Nobody is marked absent'}</p></div>
      {#if todayRow && schoolToday}<button class="mini-btn primary" type="button" onclick={() => (correcting = true)}>Correct</button>{/if}
    </div></div>
  {/if}

  <div class="stat3 num">
    <div><b>{row.presentPct == null ? '—' : `${row.presentPct}%`}</b><span>Avg. present</span></div>
    <div class="k-late"><b>{thisMonth.filter(l => l === 'L').length}</b><span>Late</span></div>
    <div class="k-bad"><b>{thisMonth.filter(l => l === 'A').length}</b><span>Absent</span></div>
  </div>

  <div class="title-row"><h3>Recent days</h3></div>
  <div class="rows">
    {#each recent.slice(0, 5) as d (d.date)}
      {@const [k, label] = LETTER[dayLetter(d.row.am, d.row.pm)]}
      <div class="day"><div class="dt num"><b>{Number(d.date.slice(8))}</b><span>{WD[new Date(d.date + 'T00:00:00Z').getUTCDay()]}</span></div>
        <div class="txt num">{times(d.row)}</div><span class="tag {k}">{label}</span></div>
    {:else}
      <div class="day"><div class="txt">No school days yet.</div></div>
    {/each}
  </div>

  <div class="group-title">Card</div>
  <div class="rows" style="padding:0 16px"><div class="mrow">
    <div class="txt" style="flex:1"><b>RFID card</b><span class="sub">{row.card.state === 'none' ? 'No card yet' : `Registered · ends in ${row.card.uid?.slice(-4)}`}</span></div>
    {#if !left}
      <button class="mini-btn" type="button" onclick={async () => { const l = row!.learner; if (row!.card.state !== 'none') await replaceCard(db, l.id, now()); onregister({ learner: l }); }}>
        {row.card.state === 'none' ? 'Register' : 'Replace'}</button>
    {/if}
  </div></div>

  <div class="group-title">Enrollment</div>
  <div class="rows" style="padding:0 16px"><div class="mrow">
    {#if left}
      <div class="txt" style="flex:1"><b>Left {fmtDate(row.enrollment.leftOn!)}</b><span class="sub">{row.enrollment.leaveReason ?? 'Transferred out'}</span></div>
    {:else}
      <div class="txt" style="flex:1"><b>Enrolled</b><span class="sub">Since {fmtDate(row.enrollment.joinedOn)}{row.enrollment.joinedFrom ? ` · from ${row.enrollment.joinedFrom}` : ''}</span></div>
      <button class="mini-btn" type="button" onclick={() => (moving = true)}>Transferred out</button>
    {/if}
  </div></div>
{/if}

{#if correcting && todayRow}
  <CorrectionModal {db} {classId} date={today} day={todayRow} session={half} {teacherId}
    onclose={() => (correcting = false)} onsaved={() => { correcting = false; load(); }} />
{/if}
{#if moving && row}
  <TransferModal {db} enrollmentId={row.enrollment.id} name={shortName(row.learner)} {days} {today}
    onclose={() => (moving = false)} ondone={() => { moving = false; load(); }} />
{/if}

<style>
  .sub { display: block; font-size: 13px; color: var(--muted); }
</style>
