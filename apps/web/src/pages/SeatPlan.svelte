<script lang="ts">
  import { manilaMinute, type HalfDayStatus, type IsoDate, type Session } from '@klasilid/core';
  import CorrectionModal from '../components/CorrectionModal.svelte';
  import Icon from '../components/Icon.svelte';
  import { classDay, schoolDaysInMonth, todayManila, type ClassDay, type LearnerDay } from '../lib/attendance';
  import type { KlasilidDb, LLearner } from '../lib/db';
  import { fmtDay, fmtMinutes, fmtTime } from '../lib/format';
  import { fillAZ, resize, saveSeatPlan, seatPlanFor, unseated, type Layout } from '../lib/seats';

  // Markup and class names follow the mockup's web Seat plan page and its editor (renderSeats, desk(), renderEd).
  let { db, classId, teacherId, now }: { db: KlasilidDb; classId: string; teacherId: string; now: () => Date } = $props();

  const today = $derived(todayManila(now()));
  let session: Session = $state(manilaMinute(now().toISOString()) >= 12 * 60 ? 'pm' : 'am');
  let days: IsoDate[] = $state([]);
  let date = $state('');
  let day: ClassDay | undefined = $state();
  let layout: Layout = $state({ rows: 8, cols: 5, seats: [] });
  let filter: 'all' | 'late' | 'absent' | 'notyet' = $state('all');
  let editing: { row: LearnerDay; session: Session } | undefined = $state();
  // editor
  let edit = $state(false);
  let draft: Layout = $state({ rows: 8, cols: 5, seats: [] });
  let sel: { type: 'stu'; id: string } | { type: 'seat'; idx: number } | null = $state(null);
  let msg = $state('');

  const TAG: Record<HalfDayStatus, string> = { on_time: 'in', late: 'late', absent: 'absent', excused: 'excused', pending: 'notyet', no_school: 'notyet' };
  const LABEL: Record<string, string> = { in: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused', notyet: 'Not yet' };
  const ICON: Record<string, string> = { in: 'check', late: 'clock', absent: 'x', excused: 'dash' };
  const rowOf = $derived(new Map((day?.rows ?? []).map(r => [r.learner.id, r])));
  const learners = $derived<LLearner[]>((day?.rows ?? []).map(r => r.learner));
  const initials = (l: LLearner) => `${l.firstName[0] ?? ''}${l.lastName[0] ?? ''}`;
  const nameOf = (id: string) => { const l = rowOf.get(id)?.learner; return l ? `${l.firstName} ${l.lastName}` : ''; };
  const statusOf = (r: LearnerDay) => TAG[r[session].status];
  const tapTime = (r: LearnerDay) => { const t = r.taps.find(x => x.id === r[session].inTapId); return t ? fmtTime(t.at) : ''; };
  const counts = $derived(Object.fromEntries(['late', 'absent', 'notyet'].map(k => [k, (day?.rows ?? []).filter(r => statusOf(r) === k).length])));
  const seated = $derived(layout.seats.filter(id => id && rowOf.has(id)).length);
  const pmIn = $derived(day?.windows.find(w => w.session === 'pm' && w.kind === 'in'));

  $effect(() => { schoolDaysInMonth(db, classId, today.slice(0, 7), today).then(d => { days = d; date ||= d[0] ?? today; }); });
  async function load() {
    if (!date) return;
    day = await classDay(db, classId, date, now());
    layout = (await seatPlanFor(db, classId, date)).layout;
  }
  $effect(() => { date; load(); const t = setInterval(load, 30_000); return () => clearInterval(t); });

  // editor actions (mockup's startEdit / clickSeat / act)
  function startEdit() { draft = { ...layout, seats: layout.seats.map(id => (id && rowOf.has(id) ? id : null)) }; sel = null; msg = ''; edit = true; }
  function step(k: 'rows' | 'cols', d: number) {
    const before = draft.seats.filter(Boolean).length;
    draft = resize(draft, k === 'rows' ? draft.rows + d : draft.rows, k === 'cols' ? draft.cols + d : draft.cols);
    const lost = before - draft.seats.filter(Boolean).length;
    sel = null;
    msg = lost ? `${lost} learner${lost > 1 ? 's' : ''} moved to Not seated.` : '';
  }
  function clickSeat(idx: number) {
    const v = draft.seats[idx];
    msg = '';
    if (sel?.type === 'stu') { draft.seats[idx] = sel.id; if (v) msg = `${nameOf(v)} moved to Not seated.`; sel = null; return; }
    if (sel?.type === 'seat') { if (sel.idx !== idx) { const a = sel.idx; [draft.seats[a], draft.seats[idx]] = [draft.seats[idx], draft.seats[a]]; } sel = null; return; }
    if (v) sel = { type: 'seat', idx };
  }
  async function save() {
    await saveSeatPlan(db, classId, $state.snapshot(draft), now());
    edit = false;
    load();
  }
  let dragging: typeof sel = null;
  const uns = $derived(unseated(draft, learners));
  const cap = $derived(draft.rows * draft.cols);
  const hint = $derived(msg || (sel?.type === 'stu' ? `Now click a seat for ${nameOf(sel.id)}.` : sel?.type === 'seat' ? `Click another seat to move or swap ${nameOf(draft.seats[sel.idx]!)}.`
    : uns.length ? `${uns.length} learner${uns.length > 1 ? 's' : ''} still without a seat.` : 'Click a learner to move them. Click two learners to swap them.'));
</script>

<div class="page on fill" data-page="seat">
  <div class="cls-head">
    <div><h2>Seat plan</h2><p><span>{!date || date === today ? 'Today' : fmtDay(date)}</span> · <span>{session === 'am' ? 'Morning' : 'Afternoon'}</span></p></div>
    <div class="hd-actions">
      <div class="sess-tabs" role="tablist" aria-label="Session">
        <button type="button" role="tab" aria-selected={session === 'am'} class:on={session === 'am'} onclick={() => (session = 'am')}>Morning</button>
        <button type="button" role="tab" aria-selected={session === 'pm'} class:on={session === 'pm'} onclick={() => (session = 'pm')}>Afternoon</button>
      </div>
      <label class="period"><Icon name="cal" /><span class="sr">Day</span>
        <select bind:value={date} aria-label="Day">{#each days as d}<option value={d}>{d === today ? `Today · ${fmtDay(d)}` : fmtDay(d)}</option>{/each}</select></label>
      {#if !edit}<button class="btn ghost" type="button" style="width:auto;height:44px;padding:0 16px;font-size:15px" disabled={!day} onclick={startEdit}><Icon name="edit" />Edit seat plan</button>{/if}
    </div>
  </div>

  {#if !edit}
    <div class="panel">
      <div class="panel-head">
        <h3>Seat plan</h3>
        <div class="filters" role="group" aria-label="Filter seats">
          {#each [['all', 'All', learners.length], ['late', 'Late', counts.late], ['absent', 'Absent', counts.absent], ['notyet', 'Not yet', counts.notyet]] as [f, label, n]}
            <button type="button" class="fbtn" class:on={filter === f} aria-pressed={filter === f} onclick={() => (filter = f as typeof filter)}>{label}<b>{n}</b></button>
          {/each}
        </div>
      </div>
      {#if session === 'pm' && pmIn}
        <div class="warn pm-note" style="display:flex"><Icon name="clock" /><span>Afternoon tap-in opens at {fmtMinutes(pmIn.opens)}. Seats fill in as students come back from lunch. Late after {fmtMinutes(pmIn.lateAfter ?? pmIn.closes)}.</span></div>
      {/if}
      <div class="front"><Icon name="board" />Front of the room</div>
      <div class="desk-scroll"><div class="desks" style="--cols:{layout.cols}">
        {#each layout.seats as id, k (k)}
          {@const r = id ? rowOf.get(id) : undefined}
          {#if r}
            {@const st = statusOf(r)}
            {@const t = tapTime(r)}
            {@const name = `${r.learner.firstName} ${r.learner.lastName}`}
            {@const changed = !!r[session].correctionId}
            <button type="button" class="desk {st}" class:dim={filter !== 'all' && filter !== st} title={name}
              aria-label="{name}, {LABEL[st]}{t && (st === 'in' || st === 'late') ? ' at ' + t : ''}{changed ? ', edited by teacher' : ''}"
              onclick={() => (editing = { row: r, session })}>
              {#if changed}<span class="edited" title="Edited by teacher"><svg aria-hidden="true"><use href="#i-edit" /></svg></span>{/if}
              <span class="av" aria-hidden="true">{initials(r.learner)}{#if ICON[st]}<span class="bdg"><svg><use href="#i-{ICON[st]}" /></svg></span>{/if}</span>
              <b>{name}</b><small class="num">{#if st === 'in'}{t}{:else if st === 'late'}<span class="lt">Late · </span>{t}{:else}{LABEL[st]}{/if}</small>
            </button>
          {:else}
            <span class="desk empty" aria-hidden="true"></span>
          {/if}
        {/each}
      </div></div>
      <div class="seat-legend" aria-hidden="true"><span><i style="background:var(--ink);color:#fff"><svg><use href="#i-check" /></svg></i>On time</span><span><i style="background:var(--accent);color:var(--on-accent)"><svg><use href="#i-clock" /></svg></i>Late</span><span><i style="background:var(--bad);color:#fff"><svg><use href="#i-x" /></svg></i>Absent</span><span><i style="border:1.5px dashed #B5B5BE"></i>Not yet</span></div>
      <p class="layout-note">{layout.rows} rows × {layout.cols} seats · {seated} seated{learners.length - seated ? ` · ${learners.length - seated} without a seat` : ''}</p>
    </div>
  {:else}
    <div class="panel" id="wEd">
      <div class="ed-top">
        <div class="stepper"><span class="lbl">Rows</span><button type="button" aria-label="Fewer rows" disabled={draft.rows <= 1} onclick={() => step('rows', -1)}>−</button><b class="num">{draft.rows}</b><button type="button" aria-label="More rows" disabled={draft.rows >= 10} onclick={() => step('rows', 1)}>+</button></div>
        <div class="stepper"><span class="lbl">Seats per row</span><button type="button" aria-label="Fewer seats per row" disabled={draft.cols <= 1} onclick={() => step('cols', -1)}>−</button><b class="num">{draft.cols}</b><button type="button" aria-label="More seats per row" disabled={draft.cols >= 10} onclick={() => step('cols', 1)}>+</button></div>
        <span class="ed-total"><b>{cap}</b> seats · <b>{learners.length}</b> learners · {#if cap >= learners.length}{cap - learners.length} spare{:else}<span style="color:var(--bad-ink)">{learners.length - cap} short</span>{/if}</span>
        <div class="ed-tools">
          <button class="mini-btn" type="button" onclick={() => { draft = fillAZ(draft, learners); sel = null; msg = ''; }}>Fill A–Z</button>
          <button class="mini-btn" type="button" onclick={() => { draft.seats = draft.seats.map(() => null); sel = null; msg = ''; }}>Clear seats</button>
        </div>
      </div>
      <div class="ed-body">
        <div>
          <div class="front"><Icon name="board" />Front of the room</div>
          <div class="desk-scroll"><div class="eseats" style="--cols:{draft.cols}" role="group" aria-label="Seats">
            {#each draft.seats as v, idx (idx)}
              {@const r = Math.floor(idx / draft.cols) + 1}
              {@const c = (idx % draft.cols) + 1}
              {#if !v}
                <button type="button" class="eseat empty" class:target={!!sel} aria-label="Row {r} seat {c}, empty" onclick={() => clickSeat(idx)}
                  ondragover={e => e.preventDefault()} ondrop={e => { e.preventDefault(); sel = dragging; clickSeat(idx); }}>
                  <span class="plus" aria-hidden="true"><svg><use href="#i-plus" /></svg></span><small>R{r} · {c}</small></button>
              {:else}
                {@const l = rowOf.get(v)?.learner}
                <button type="button" class="eseat" class:sel={sel?.type === 'seat' && sel.idx === idx} draggable="true" aria-label="Row {r} seat {c}, {nameOf(v)}"
                  aria-pressed={sel?.type === 'seat' && sel.idx === idx} onclick={() => clickSeat(idx)}
                  ondragstart={() => (dragging = { type: 'seat', idx })} ondragover={e => e.preventDefault()} ondrop={e => { e.preventDefault(); sel = dragging; clickSeat(idx); }}>
                  <span class="av" aria-hidden="true">{l ? initials(l) : ''}</span><b>{nameOf(v)}</b><small>R{r} · {c}</small></button>
              {/if}
            {/each}
          </div></div>
        </div>
        <aside class="unseated" role="group" aria-label="Not seated" ondragover={e => e.preventDefault()}
          ondrop={e => { e.preventDefault(); if (dragging?.type === 'seat') { draft.seats[dragging.idx] = null; sel = null; } }}>
          <h4>Not seated</h4>
          <p>Drag a name onto a seat, or click a name then a seat.</p>
          <div class="uchips">
            {#each uns as l (l.id)}
              <button type="button" class="uchip" class:sel={sel?.type === 'stu' && sel.id === l.id} draggable="true" aria-pressed={sel?.type === 'stu' && sel.id === l.id}
                onclick={() => (sel = sel?.type === 'stu' && sel.id === l.id ? null : { type: 'stu', id: l.id })} ondragstart={() => (dragging = { type: 'stu', id: l.id })}>{l.firstName} {l.lastName}</button>
            {:else}
              <span style="font-size:13.5px;color:var(--muted);font-weight:600">Everyone has a seat.</span>
            {/each}
          </div>
        </aside>
      </div>
      <div class="ed-foot">
        <p class="hint" class:warn-t={!msg && !sel && uns.length > 0}>{hint}</p>
        {#if sel?.type === 'seat'}<button class="btn ghost" type="button" onclick={() => { if (sel?.type === 'seat') draft.seats[sel.idx] = null; sel = null; }}>Remove from seat</button>{/if}
        <button class="btn ghost" type="button" onclick={() => (edit = false)}>Cancel</button>
        <button class="btn" type="button" onclick={save}>Save seat plan</button>
      </div>
    </div>
  {/if}
</div>

{#if editing && day}
  <CorrectionModal {db} {classId} date={day.date} day={editing.row} session={editing.session} {teacherId}
    onclose={() => (editing = undefined)} onsaved={() => { editing = undefined; load(); }} />
{/if}
