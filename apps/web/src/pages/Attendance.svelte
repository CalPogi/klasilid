<script lang="ts">
  import type { IsoDate, Session } from '@klasilid/core';
  import CorrectionModal from '../components/CorrectionModal.svelte';
  import Icon from '../components/Icon.svelte';
  import Pager from '../components/Pager.svelte';
  import { classDay, dayLetter, monthsWithAttendance, schoolDaysInMonth, todayManila, type ClassDay, type DayLetter, type LearnerDay } from '../lib/attendance';
  import type { KlasilidDb, LLearner } from '../lib/db';
  import { fmtDay, fmtMonth, STATUS_LABEL } from '../lib/format';

  // Markup and class names follow the mockup's web Attendance page: a month grid of letters, click a cell to correct it.
  let { db, classId, teacherId, now }: {
    db: KlasilidDb; classId: string; teacherId: string; displayName?: string; now: () => Date;
  } = $props();

  const PER_PAGE = 12;
  const LEGEND: [DayLetter, string][] = [['P', 'Present'], ['L', 'Late'], ['A', 'Absent'], ['E', 'Excused'], ['H', 'Half day']];
  const today = $derived(todayManila(now()));
  let className = $state('');
  let months: string[] = $state([]);
  let month = $state('');
  let days: IsoDate[] = $state([]);       // oldest first, as grid columns
  let grid: ClassDay[] = $state([]);
  let page = $state(1);
  let editing: { row: LearnerDay; date: IsoDate; session: Session } | undefined = $state();

  const learners = $derived<LLearner[]>(grid.length ? grid[grid.length - 1].rows.map(r => r.learner) : []);
  const pages = $derived(Math.max(1, Math.ceil(learners.length / PER_PAGE)));
  const shown = $derived(learners.slice((page - 1) * PER_PAGE, page * PER_PAGE));
  const rowOf = (d: ClassDay, id: string) => d.rows.find(r => r.learner.id === id);

  $effect(() => {
    db.classes.get(classId).then(c => (className = c ? `Gr. ${c.grade} ${c.section}` : ''));
    monthsWithAttendance(db, classId, today).then(m => { months = m; month ||= m[0] ?? today.slice(0, 7); });
  });
  async function load() {
    if (!month) return;
    days = (await schoolDaysInMonth(db, classId, month, today)).reverse();
    grid = await Promise.all(days.map(d => classDay(db, classId, d, now())));
  }
  $effect(() => {
    month;
    page = 1;
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  });

  function correct(d: ClassDay, r: LearnerDay) {
    const session: Session = r.am.status !== 'on_time' && r.am.status !== 'no_school' ? 'am' : 'pm';
    editing = { row: r, date: d.date, session };
  }
  const count = (id: string, letter: DayLetter) => grid.filter(d => { const r = rowOf(d, id); return r && dayLetter(r.am, r.pm) === letter; }).length;
</script>

<div class="page on" data-page="history">
  <div class="cls-head">
    <div><h2>Attendance</h2><p>{className}</p></div>
    <div class="hd-actions">
      <label class="period"><Icon name="cal" /><span class="sr">School year</span><select><option>SY 2026–2027</option></select></label>
      <label class="period"><span class="sr">Month</span>
        <select bind:value={month} aria-label="Month">{#each months as m}<option value={m}>{fmtMonth(m).split(' ')[0]}</option>{/each}</select></label>
    </div>
  </div>
  <div class="panel">
    <div class="hrow" style="margin-bottom:12px;flex-wrap:wrap">
      <div style="display:flex;gap:14px;font-size:13px;color:var(--muted);font-weight:600;flex-wrap:wrap">
        {#each LEGEND as [l, label]}<span><span class="cell {l}" style="width:20px;height:20px">{l}</span> {label}</span>{/each}
      </div>
      <span class="waiting">Click a cell to correct it</span>
    </div>
    {#if grid.length && grid[grid.length - 1].needsSetup}
      <p class="sub2">Tap times aren't set yet. <a class="link" href="#/setup">Set up tap times</a></p>
    {:else}
      <div class="tbl-wrap">
        <table class="tbl" id="histTbl">
          <thead><tr><th>Learner</th>{#each days as d}<th class="c num">{fmtDay(d).slice(0, 1)}<br />{Number(d.slice(8))}</th>{/each}<th class="c">Absent</th><th class="c">Late</th></tr></thead>
          <tbody>
            {#each shown as l (l.id)}
              <tr>
                <td>{l.firstName} {l.lastName}</td>
                {#each grid as d}
                  {@const r = rowOf(d, l.id)}
                  {@const letter = r ? dayLetter(r.am, r.pm) : 'N'}
                  <td class="c">
                    {#if r}
                      <button class="cell {letter}" class:fixed={!!(r.am.correctionId || r.pm.correctionId)} type="button"
                        aria-label="{l.firstName} {l.lastName}, {d.date === today ? 'today' : fmtDay(d.date)}: morning {STATUS_LABEL[r.am.status]}, afternoon {STATUS_LABEL[r.pm.status]}{r.am.correctionId || r.pm.correctionId ? ', corrected' : ''}"
                        onclick={() => correct(d, r)}>{letter === 'N' ? '·' : letter}</button>
                    {/if}
                  </td>
                {/each}
                <td class="c num">{count(l.id, 'A')}</td><td class="c num">{count(l.id, 'L')}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Pager bind:page {pages} />
    {/if}
  </div>
</div>

{#if editing}
  <CorrectionModal {db} {classId} date={editing.date} day={editing.row} session={editing.session} {teacherId}
    onclose={() => (editing = undefined)} onsaved={() => { editing = undefined; load(); }} />
{/if}

<style>
  button.cell { border: 0; padding: 0; cursor: pointer; font: inherit; font-size: 12px; font-weight: 800; }
  button.cell.fixed { outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
