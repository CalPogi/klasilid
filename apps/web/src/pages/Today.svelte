<script lang="ts">
  import { manilaMinute, type Session } from '@klasilid/core';
  import CorrectionModal from '../components/CorrectionModal.svelte';
  import Icon from '../components/Icon.svelte';
  import { classDay, needsAttention, todayManila, type ClassDay, type LearnerDay } from '../lib/attendance';
  import { pendingCount, type KlasilidDb } from '../lib/db';
  import { fmtLongDay, fmtMinutes, fmtTime } from '../lib/format';

  let { db, classId, teacherId, displayName, now }: {
    db: KlasilidDb; classId: string; teacherId: string; displayName: string; now: () => Date;
  } = $props();

  let day: ClassDay | undefined = $state();
  let pending = $state(0);
  let online = $state(navigator.onLine);
  let editing: { row: LearnerDay; session: Session } | undefined = $state();

  async function load() {
    day = await classDay(db, classId, todayManila(now()), now());
    pending = await pendingCount(db);
  }
  $effect(() => {
    load();
    const t = setInterval(load, 30_000);
    const net = () => (online = navigator.onLine);
    addEventListener('online', net);
    addEventListener('offline', net);
    return () => { clearInterval(t); removeEventListener('online', net); removeEventListener('offline', net); };
  });

  const afternoon = $derived(manilaMinute(now().toISOString()) >= 12 * 60);
  const lateAfter = $derived(day?.windows.find(w => w.session === 'am' && w.kind === 'in')?.lateAfter);
  const attention = $derived(day ? needsAttention(day) : []);
  const bar = $derived(day ? [
    [day.counts.in - day.counts.late, 'var(--ink)'], [day.counts.late, 'var(--accent)'], [day.counts.absent, 'var(--bad)'], [day.counts.notYet, '#CFCFD6'],
  ] as [number, string][] : []);

  /** What to say about a learner on the attention list, and which half-day the correction is for. */
  function why(r: LearnerDay): { text: string; session: Session } {
    const stray = r.review[0];
    if (stray) return { text: `Tapped at ${fmtTime(stray.at)}, outside tap times`, session: manilaMinute(stray.at) >= 12 * 60 ? 'pm' : 'am' };
    const s: Session = r.pm.flags.includes('after_closing') && !r.am.flags.includes('after_closing') ? 'pm' : 'am';
    if (r[s].flags.includes('after_closing')) {
      const t = r.taps.find(x => x.id === r[s].inTapId);
      return { text: `Came after closing${t ? ' · ' + fmtTime(t.at) : ''}`, session: s };
    }
    return { text: 'No tap this morning', session: afternoon ? 'pm' : 'am' };
  }
</script>

<div class="today">
  <header class="topbar">
    <div class="ttl">
      <h1>Good {afternoon ? 'afternoon' : 'morning'}, {displayName}</h1>
      <p>{fmtLongDay(todayManila(now()))} · Gr. 6 Diamond</p>
    </div>
  </header>

  {#if !online}
    <div class="warn" role="status"><Icon name="wifi" />
      <span>No internet right now. Attendance keeps working: the door reader saves every tap. Your <b>{pending} changes</b> sync when the internet is back.</span></div>
  {/if}

  {#if day && (day.dayType === 'holiday' || day.dayType === 'suspension')}
    <div class="setup-cta card">
      <div><h2>No classes today</h2><p>{day.dayType === 'suspension' ? 'Classes are suspended.' : 'It is a weekend or a holiday.'} Nobody is marked absent.</p></div>
      <a class="btn ghost" href="#/attendance">See past days</a>
    </div>
  {:else if day?.needsSetup}
    <div class="setup-cta card">
      <div><h2>Set the tap times first</h2><p>Attendance starts once the morning and afternoon tap times are set.</p></div>
      <a class="btn" href="#/setup">Set up tap times</a>
    </div>
  {:else if day}
    <div class="kpis num">
      <div class="kpi main" role="group" aria-label="In class">
        <div class="row1"><span>In class</span><small>of {day.counts.total} learners</small></div>
        <b data-testid="value">{day.counts.in}</b>
        <div class="segbar" aria-hidden="true">{#each bar as [n, c]}{#if n}<i style="flex:{n};background:{c}"></i>{/if}{/each}</div>
      </div>
      <div class="kpi" role="group" aria-label="Late">
        <div class="row1"><span>Late</span><i class="sw" style="background:var(--accent)"></i></div>
        <b data-testid="value">{day.counts.late}</b><small>{lateAfter != null ? `after ${fmtMinutes(lateAfter)}` : ''}</small>
      </div>
      <div class="kpi" role="group" aria-label="Absent">
        <div class="row1"><span>Absent</span><i class="sw" style="background:var(--bad)"></i></div>
        <b data-testid="value">{day.counts.absent}</b><small>this morning</small>
      </div>
      <div class="kpi" role="group" aria-label="Not yet">
        <div class="row1"><span>Not yet</span><i class="sw" style="background:#CFCFD6"></i></div>
        <b data-testid="value">{day.counts.notYet}</b><small>no tap so far</small>
      </div>
    </div>

    <div class="dmain">
      <section class="panel">
        <div class="panel-top"><div><h2>Needs your attention</h2><p class="sub2">Click a name to correct it</p></div></div>
        <div class="scroll">
          {#each attention as r (r.learner.id)}
            {@const w = why(r)}
            <button class="row" type="button" onclick={() => (editing = { row: r, session: w.session })}>
              <span class="av">{r.learner.firstName[0]}{r.learner.lastName[0]}</span>
              <span class="txt"><b>{r.learner.firstName} {r.learner.lastName}</b><small>{w.text}</small></span>
            </button>
          {:else}
            <p class="empty">Nothing to check right now.</p>
          {/each}
        </div>
      </section>
      <section class="panel">
        <div class="panel-top"><div><h2>Reader notes</h2><p class="sub2">Taps the system could not place</p></div></div>
        <div class="scroll">
          {#if day.suspectTaps.length}
            <div class="warn small"><Icon name="alert" />
              <span>The reader's clock looked wrong for {day.suspectTaps.length} {day.suspectTaps.length === 1 ? 'tap' : 'taps'}. Check them.</span></div>
          {/if}
          {#each day.unknownTaps as t (t.id)}
            <div class="row static"><span class="av q">?</span><span class="txt"><b class="mono">{t.cardUid}</b><small>Card not registered · {fmtTime(t.at)}</small></span></div>
          {:else}
            {#if !day.suspectTaps.length}<p class="empty">Every tap matched a learner.</p>{/if}
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>

{#if editing && day}
  <CorrectionModal {db} {classId} date={day.date} day={editing.row} session={editing.session} {teacherId}
    onclose={() => (editing = undefined)} onsaved={() => { editing = undefined; load(); }} />
{/if}

<style>
  .today { display: flex; flex-direction: column; gap: 16px; height: calc(100vh - 40px); max-height: 910px; }
  .topbar h1 { font-size: 26px; letter-spacing: -.03em; line-height: 1.15; }
  .topbar p { margin: 2px 0 0; color: var(--muted); font-size: 14px; }
  .warn { display: flex; gap: 10px; align-items: flex-start; background: var(--accent-soft); color: var(--accent-ink); border-radius: var(--r-md);
    padding: 12px 14px; font-size: 14px; font-weight: 600; }
  .warn.small { font-size: 13px; padding: 10px 12px; margin-bottom: 8px; }
  .setup-cta { display: flex; align-items: center; gap: 16px; justify-content: space-between; }
  .setup-cta h2 { font-size: 18px; }
  .setup-cta p { margin: 4px 0 0; color: var(--muted); }
  .kpis { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; gap: 12px; }
  .kpi { background: var(--surface); border-radius: var(--r-lg); padding: 16px; box-shadow: var(--shadow-card); display: flex; flex-direction: column;
    justify-content: space-between; min-height: 104px; }
  .kpi .row1 { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .kpi span { font-size: 14px; color: var(--muted); font-weight: 600; }
  .kpi small { font-size: 13px; color: var(--muted); font-weight: 600; }
  .kpi b { display: block; font-size: 30px; letter-spacing: -.03em; line-height: 1.2; }
  .sw { width: 10px; height: 10px; border-radius: 3px; display: block; }
  .segbar { display: flex; height: 10px; border-radius: 6px; overflow: hidden; gap: 3px; }
  .segbar i { display: block; height: 100%; border-radius: 3px; }
  .dmain { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; flex: 1; min-height: 0; }
  .panel { background: var(--surface); border-radius: var(--r-lg); padding: 20px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; min-height: 0; }
  .panel-top { margin-bottom: 12px; }
  .panel h2 { font-size: 17px; }
  .sub2 { color: var(--muted); font-size: 13.5px; margin: 2px 0 0; }
  .scroll { overflow: auto; min-height: 0; margin: 0 -8px; padding: 0 8px; }
  .row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 8px; border: 0; background: none; border-radius: 12px;
    text-align: left; cursor: pointer; font: inherit; color: inherit; }
  .row:hover { background: var(--surface-2); }
  .row.static { cursor: default; }
  .row.static:hover { background: none; }
  .av { width: 38px; height: 38px; border-radius: 12px; background: var(--surface-2); display: grid; place-items: center; font-weight: 800; font-size: 13px; flex: none; }
  .av.q { background: var(--accent-soft); color: var(--accent-ink); }
  .txt { display: flex; flex-direction: column; min-width: 0; }
  .txt b { font-size: 14.5px; }
  .txt small { color: var(--muted); font-size: 13px; }
  .mono { font-family: ui-monospace, Consolas, monospace; letter-spacing: .02em; }
  .empty { color: var(--muted); font-size: 14px; margin: 8px 0; }
  @media (max-width: 1100px) { .dmain { grid-template-columns: 1fr; } .today { height: auto; max-height: none; } }
  @media (max-width: 860px) {
    .kpis { grid-template-columns: 1fr 1fr; gap: 8px; }
    .kpi { min-height: 86px; padding: 12px; }
    .kpi b { font-size: 24px; }
    .kpi.main .row1 { flex-direction: column; align-items: flex-start; gap: 0; }
    .topbar h1 { font-size: 22px; }
    .panel { padding: 14px; }
    .setup-cta { flex-direction: column; align-items: stretch; }
  }
</style>
