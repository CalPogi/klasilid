<script lang="ts">
  import { manilaMinute, type HalfDayStatus, type Session } from '@klasilid/core';
  import CorrectionModal from '../../components/CorrectionModal.svelte';
  import Icon from '../../components/Icon.svelte';
  import AdvisoryHead from '../../components/phone/AdvisoryHead.svelte';
  import { classDay, todayManila, type ClassDay, type LearnerDay } from '../../lib/attendance';
  import type { KlasilidDb } from '../../lib/db';
  import { fmtLongDay, fmtMinutes, fmtTime, shortName } from '../../lib/format';
  import { go } from '../../lib/router';
  import { seatPlanFor, type Layout } from '../../lib/seats';

  // The mockup's phone seat plan (data-screen="seat"). With `date` it is that past school day (canvas board
  // "a past school day"): back + the date instead of the class header, no editing, seats still correctable.
  let { db, classId, teacherId, now, date }: { db: KlasilidDb; classId: string; teacherId: string; now: () => Date; date?: string } = $props();

  const today = $derived(todayManila(now()));
  // svelte-ignore state_referenced_locally
  const past = !!date;
  // svelte-ignore state_referenced_locally
  const valid = !date || (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && date <= todayManila(now()));
  let session: Session = $state(!date && manilaMinute(now().toISOString()) >= 12 * 60 ? 'pm' : 'am');
  let day: ClassDay | undefined = $state();
  let layout: Layout = $state({ rows: 8, cols: 5, seats: [] });
  let className = $state('');
  let filter: 'all' | 'late' | 'absent' | 'notyet' = $state('all');
  let editing: { row: LearnerDay; session: Session } | undefined = $state();

  const TAG: Record<HalfDayStatus, string> = { on_time: 'in', late: 'late', absent: 'absent', excused: 'excused', pending: 'notyet', no_school: 'notyet' };
  const LABEL: Record<string, string> = { in: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused', notyet: 'Not yet' };
  const ICON: Record<string, string> = { in: 'check', late: 'clock', absent: 'x', excused: 'dash' };
  const rowOf = $derived(new Map((day?.rows ?? []).map(r => [r.learner.id, r])));
  const statusOf = (r: LearnerDay) => TAG[r[session].status];
  // Desks show '7:01' without AM/PM, as the mockup's phone does (the label keeps the full time).
  const tapTime = (r: LearnerDay) => { const t = r.taps.find(x => x.id === r[session].inTapId); return t ? fmtTime(t.at).replace(/ [AP]M$/, '') : ''; };
  const counts = $derived(Object.fromEntries(['late', 'absent', 'notyet'].map(k => [k, (day?.rows ?? []).filter(r => statusOf(r) === k).length])));
  const pmIn = $derived(day?.windows.find(w => w.session === 'pm' && w.kind === 'in'));
  const noSchool = $derived(day && (day.dayType === 'holiday' || day.dayType === 'suspension'));
  const FILTERS = $derived(([['all', 'All', day?.rows.length ?? 0], ['late', 'Late', counts.late], ['absent', 'Absent', counts.absent], ['notyet', 'Not yet', counts.notyet]] as const)
    .filter(([f]) => !past || f !== 'notyet'));

  async function load() {
    const d = date ?? today;
    day = await classDay(db, classId, d, now());
    layout = (await seatPlanFor(db, classId, d)).layout;
    const c = await db.classes.get(classId);
    className = c ? `Gr. ${c.grade} ${c.section}` : '';
  }
  $effect(() => {
    if (!valid) { go('attendance'); return; }
    load();
    if (past) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  });
  const back = () => (history.length > 1 ? history.back() : go('attendance'));
</script>

{#if past}
  <div class="hrow">
    <button class="iconbtn" type="button" aria-label="Back" onclick={back}><Icon name="back" cls="ico" /></button>
    <div style="text-align:center"><b style="font-size:16px">{date && valid ? fmtLongDay(date) : ''}</b>
      <p class="eyebrowless" style="font-size:12.5px;margin:0">{className} · past school day</p></div>
    <span class="spacer44"></span>
  </div>
{:else}
  <AdvisoryHead {className} count={day?.rows.length ?? 0} tab="seat">
    {#snippet right()}<button class="iconbtn" type="button" aria-label="Edit seat plan" onclick={() => go('seat-edit')}><Icon name="edit" cls="ico" /></button>{/snippet}
  </AdvisoryHead>
{/if}

{#if noSchool && day}
  <div class="card mt4"><h3 style="margin:0 0 4px">No classes on this day</h3>
    <p class="eyebrowless" style="margin:0">{day.dayType === 'suspension' ? 'Classes were suspended.' : 'It was a weekend or a holiday.'} Nobody is marked absent.</p></div>
{:else if day}
  <div class="sess-tabs" role="tablist" aria-label="Session" style="display:grid;margin:{past ? '14px' : '0'} 0 10px">
    <button type="button" role="tab" aria-selected={session === 'am'} class:on={session === 'am'} onclick={() => (session = 'am')}>Morning</button>
    <button type="button" role="tab" aria-selected={session === 'pm'} class:on={session === 'pm'} onclick={() => (session = 'pm')}>Afternoon</button>
  </div>
  <div class="filters" style="margin-top:0" role="group" aria-label="Filter seats">
    {#each FILTERS as [f, label, n]}
      <button type="button" class="fbtn" class:on={filter === f} aria-pressed={filter === f} onclick={() => (filter = f)}>{label}<b>{n}</b></button>
    {/each}
  </div>
  {#if past}<p class="eyebrowless" style="font-size:13px;margin:0 4px 10px">Tap a seat to correct this day. A reason is required.</p>{/if}
  {#if !past && session === 'pm' && pmIn}
    <div class="warn pm-note" style="display:flex"><Icon name="clock" /><span>Afternoon tap-in opens at {fmtMinutes(pmIn.opens)}. Seats fill in as students come back from lunch. Late after {fmtMinutes(pmIn.lateAfter ?? pmIn.closes)}.</span></div>
  {/if}
  <div class="front"><Icon name="board" />Front of the room</div>
  <div class="desk-scroll"><div class="desks" id="mDesks" style="--cols: {layout.cols};">
    {#each layout.seats as id, k (k)}
      {@const r = id ? rowOf.get(id) : undefined}
      {#if r}
        {@const st = statusOf(r)}
        {@const t = tapTime(r)}
        {@const name = shortName(r.learner)}
        <button type="button" class="desk {st}" class:dim={filter !== 'all' && filter !== st} title={name}
          aria-label="{name}, {LABEL[st]}{t && (st === 'in' || st === 'late') ? ' at ' + t : ''}{r[session].correctionId ? ', edited by teacher' : ''}"
          onclick={() => (editing = { row: r, session })}>
          <span class="av" aria-hidden="true">{r.learner.firstName[0]}{r.learner.lastName[0]}{#if ICON[st]}<span class="bdg"><svg><use href="#i-{ICON[st]}" /></svg></span>{/if}</span>
          <b>{name}</b><small class="num">{#if st === 'in'}{t}{:else if st === 'late'}<span class="lt">Late · </span>{t}{:else}{LABEL[st]}{/if}</small>
        </button>
      {:else}
        <span class="desk empty" aria-hidden="true"></span>
      {/if}
    {/each}
  </div></div>
  <div class="seat-legend" aria-hidden="true"><span><i style="background:var(--ink);color:#fff"><svg><use href="#i-check" /></svg></i>On time</span><span><i style="background:var(--accent);color:var(--on-accent)"><svg><use href="#i-clock" /></svg></i>Late</span><span><i style="background:var(--bad);color:#fff"><svg><use href="#i-x" /></svg></i>Absent</span>{#if !past}<span><i style="border:1.5px dashed #B5B5BE"></i>Not yet</span>{/if}</div>
{/if}

{#if editing && day}
  <CorrectionModal {db} {classId} date={day.date} day={editing.row} session={editing.session} {teacherId}
    onclose={() => (editing = undefined)} onsaved={() => { editing = undefined; load(); }} />
{/if}
