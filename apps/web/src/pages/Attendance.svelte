<script lang="ts">
  import type { HalfDay, IsoDate, Session } from '@klasilid/core';
  import CorrectionModal from '../components/CorrectionModal.svelte';
  import Pager from '../components/Pager.svelte';
  import { classDay, monthsWithAttendance, schoolDaysInMonth, todayManila, type ClassDay, type LearnerDay } from '../lib/attendance';
  import type { KlasilidDb } from '../lib/db';
  import { fmtDay, fmtMonth, fmtTime, STATUS_LABEL } from '../lib/format';

  let { db, classId, teacherId, now }: {
    db: KlasilidDb; classId: string; teacherId: string; displayName?: string; now: () => Date;
  } = $props();

  const PER_PAGE = 12;
  const today = $derived(todayManila(now()));
  let months: string[] = $state([]);
  let month = $state('');
  let days: IsoDate[] = $state([]);
  let date = $state('');
  let day: ClassDay | undefined = $state();
  let page = $state(1);
  let editing: { row: LearnerDay; session: Session } | undefined = $state();

  const TAG: Record<HalfDay['status'], string> = { on_time: 'in', late: 'late', absent: 'absent', excused: 'excused', pending: 'notyet', no_school: 'gone' };
  const pages = $derived(Math.max(1, Math.ceil((day?.rows.length ?? 0) / PER_PAGE)));
  const shown = $derived(day?.rows.slice((page - 1) * PER_PAGE, page * PER_PAGE) ?? []);

  $effect(() => {
    monthsWithAttendance(db, classId, today).then(m => { months = m; month ||= m[0] ?? today.slice(0, 7); });
  });
  $effect(() => {
    if (!month) return;
    schoolDaysInMonth(db, classId, month, today).then(d => { days = d; if (!d.includes(date)) date = d[0] ?? ''; });
  });
  async function load() {
    if (date) day = await classDay(db, classId, date, now());
  }
  $effect(() => {
    date;
    page = 1;
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  });

  const cell = (r: LearnerDay, s: Session) => {
    const h = r[s];
    const t = r.taps.find(x => x.id === h.inTapId);
    return `${STATUS_LABEL[h.status]}${t && (h.status === 'on_time' || h.status === 'late') ? ' · ' + fmtTime(t.at) : ''}`;
  };
  const flags = (r: LearnerDay) => [
    ...(r.am.flags.includes('after_closing') || r.pm.flags.includes('after_closing') ? ['Came after closing'] : []),
    ...(r.am.flags.includes('no_time_out') || r.pm.flags.includes('no_time_out') ? ['No time out'] : []),
    ...(r.review.length ? [`${r.review.length} tap${r.review.length > 1 ? 's' : ''} to check`] : []),
  ];
</script>

<div class="att">
  <header class="pg-head">
    <div><h1>Attendance</h1><p>Gr. 6 Diamond · {day ? `${day.counts.in} of ${day.counts.total} in class` : ''}</p></div>
    <div class="pickers">
      <div class="field"><label for="am">Month</label>
        <select id="am" bind:value={month}>{#each months as m}<option value={m}>{fmtMonth(m)}</option>{/each}</select></div>
      <div class="field"><label for="ad">Day</label>
        <select id="ad" bind:value={date}>
          {#each days as d}<option value={d}>{d === today ? `Today · ${fmtDay(d)}` : fmtDay(d)}</option>{/each}
        </select></div>
    </div>
  </header>

  <section class="panel">
    {#if day?.needsSetup}
      <p class="empty">Tap times aren't set for this day yet. <a href="#/setup">Set up tap times</a></p>
    {:else}
      <table>
        <thead><tr><th scope="col">Learner</th><th scope="col">Morning</th><th scope="col">Afternoon</th><th scope="col">Notes</th></tr></thead>
        <tbody>
          {#each shown as r (r.learner.id)}
            {@const name = `${r.learner.firstName} ${r.learner.lastName}`}
            <tr>
              <th scope="row">{name}</th>
              {#each ['am', 'pm'] as const as s}
                <td>
                  <button class="tag {TAG[r[s].status]}" type="button" aria-label="Change {name} {s === 'am' ? 'morning' : 'afternoon'}"
                    disabled={r[s].status === 'no_school'} onclick={() => (editing = { row: r, session: s })}>{cell(r, s)}</button>
                  {#if r[s].correctionId}<span class="ctag">corrected</span>{/if}
                </td>
              {/each}
              <td class="notes">{flags(r).join(' · ')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <Pager bind:page {pages} />
    {/if}
  </section>
</div>

{#if editing && day}
  <CorrectionModal {db} {classId} date={day.date} day={editing.row} session={editing.session} {teacherId}
    onclose={() => (editing = undefined)} onsaved={() => { editing = undefined; load(); }} />
{/if}

<style>
  .att { display: flex; flex-direction: column; gap: 16px; }
  .pg-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .pg-head h1 { font-size: 26px; letter-spacing: -.03em; }
  .pg-head p { margin: 2px 0 0; color: var(--muted); font-size: 14px; }
  .pickers { display: flex; gap: 10px; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 170px; }
  .panel { background: var(--surface); border-radius: var(--r-lg); padding: 16px 20px; box-shadow: var(--shadow-card); display: flex; flex-direction: column; gap: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; font-size: 14px; border-bottom: 1px solid var(--line); }
  thead th { font-size: 12.5px; color: var(--muted); font-weight: 700; }
  tbody th { font-weight: 700; white-space: nowrap; }
  tbody tr:last-child > * { border-bottom: 0; }
  .tag { font: inherit; font-size: 13px; font-weight: 700; border-radius: 8px; padding: 0 10px; min-height: 36px; border: 0; cursor: pointer; white-space: nowrap; }
  .tag:disabled { cursor: default; }
  .tag.in { background: #EDEDF1; color: var(--ink); }
  .tag.late { background: var(--accent-soft); color: var(--accent-ink); }
  .tag.absent { background: var(--bad-soft); color: var(--bad-ink); }
  .tag.excused, .tag.notyet { background: var(--info-soft); color: var(--ink-2); }
  .tag.gone { background: var(--surface-2); color: var(--muted); }
  :global(html[data-theme='dark']) .tag.in { background: var(--surface-2); }
  .ctag { margin-left: 6px; font-size: 12px; font-weight: 700; color: var(--accent-ink); }
  .notes { color: var(--muted); font-size: 13px; }
  .empty { color: var(--muted); }
  @media (max-width: 860px) {
    .pg-head h1 { font-size: 22px; }
    .pickers { width: 100%; }
    .field { min-width: 0; flex: 1; }
    .panel { padding: 8px 12px; }
    thead { display: none; }
    tbody tr { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--line); }
    tbody th, tbody td { border: 0; padding: 0; }
    tbody th, .notes { grid-column: 1 / -1; }
    .tag { width: 100%; min-height: 44px; }
    .notes:empty { display: none; }
  }
</style>
