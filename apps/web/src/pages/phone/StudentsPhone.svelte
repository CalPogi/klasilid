<script lang="ts">
  import { manilaMinute, type HalfDayStatus, type IsoDate, type Session } from '@klasilid/core';
  import AddStudentModal from '../../components/AddStudentModal.svelte';
  import Icon from '../../components/Icon.svelte';
  import AdvisoryHead from '../../components/phone/AdvisoryHead.svelte';
  import { classDay, schoolDaysInMonth, todayManila, type ClassDay } from '../../lib/attendance';
  import type { KlasilidDb, LLearner } from '../../lib/db';
  import { fmtDay, fmtTime, shortName, STATUS_LABEL } from '../../lib/format';
  import { go } from '../../lib/router';
  import type { Mode } from '../../lib/session';
  import { studentRows, type StudentFilter, type StudentRow } from '../../lib/students';

  // The mockup's phone Students tab (data-screen="mStudents") plus the canvas board's +, filter chips and register banner.
  let { db, classId, now, onregister }: {
    db: KlasilidDb; classId: string; teacherId: string; now: () => Date; mode: Mode;
    onregister: (t: { learner?: LLearner; bulk?: boolean }) => void;
  } = $props();

  const today = $derived(todayManila(now()));
  const half = $derived<Session>(manilaMinute(now().toISOString()) >= 12 * 60 ? 'pm' : 'am');
  let all: StudentRow[] = $state([]);
  let rows: StudentRow[] = $state([]);
  let day: ClassDay | undefined = $state();
  let days: IsoDate[] = $state([]);
  let className = $state('');
  let filter: StudentFilter = $state('all');
  let query = $state('');
  let adding = $state(false);

  async function load() {
    const c = await db.classes.get(classId);
    className = c ? `Gr. ${c.grade} ${c.section}` : '';
    days = await schoolDaysInMonth(db, classId, today.slice(0, 7), today);
    day = await classDay(db, classId, today, now());
    all = await studentRows(db, classId, today, 'all', '');
    rows = await studentRows(db, classId, today, filter, query);
  }
  $effect(() => { filter; query; load(); });

  const stays = (r: StudentRow) => r.status !== 'left';
  const count = $derived({
    all: all.length,
    nocard: all.filter(r => stays(r) && r.card.state === 'none').length,
    replaced: all.filter(r => stays(r) && r.card.state === 'replaced').length,
    noparent: all.filter(r => stays(r) && r.parent === 'none').length,
    left: all.filter(r => !stays(r)).length,
  } satisfies Record<StudentFilter, number>);
  const CHIPS: [StudentFilter, string][] = [['all', 'All'], ['nocard', 'No card'], ['replaced', 'Card replaced'], ['noparent', 'No parent account'], ['left', 'Transferred out']];
  const TAG: Record<HalfDayStatus, string> = { on_time: 'in', late: 'late', absent: 'absent', excused: 'excused', pending: 'notyet', no_school: 'gone' };
  const todayOf = (id: string) => day?.rows.find(r => r.learner.id === id);
  function firstTap(id: string): string {
    const r = todayOf(id);
    const t = r && (r.taps.find(x => x.id === r.am.inTapId) ?? r.taps.find(x => x.id === r.pm.inTapId));
    return t ? `In ${fmtTime(t.at)}` : 'No tap yet';
  }
</script>

<AdvisoryHead {className} count={count.all - count.left} tab="students">
  {#snippet right()}<button class="iconbtn" type="button" aria-label="Add student" onclick={() => (adding = true)}><Icon name="plus" cls="ico" /></button>{/snippet}
</AdvisoryHead>
<label class="search" style="width:100%;height:48px"><Icon name="search" /><span class="sr">Search students</span><input bind:value={query} placeholder="Search students" autocomplete="off" /></label>
<div class="filters" role="group" aria-label="Show">
  {#each CHIPS as [f, label]}
    <button type="button" class="fbtn" class:on={filter === f} aria-pressed={filter === f} onclick={() => (filter = f)}>{label}<b>{count[f]}</b></button>
  {/each}
</div>
{#if count.nocard}
  <button class="up-row" type="button" onclick={() => onregister({ bulk: true })}>
    <span class="up-ic" aria-hidden="true"><Icon name="wifi" /></span>
    <span class="up-t"><b>Register cards for {count.nocard} learner{count.nocard > 1 ? 's' : ''}</b><span>Tap each card on the door reader, in list order</span></span>
    <Icon name="right" cls="ico-sm up-chev" />
  </button>
{/if}
<div class="rows mt3">
  {#each rows as r (r.learner.id)}
    {@const t = todayOf(r.learner.id)}
    <button class="rowi" type="button" onclick={() => go('student', { id: r.learner.id })}>
      <div class="avatar sm">{r.learner.firstName[0]}{r.learner.lastName[0]}</div>
      <div class="txt"><b>{shortName(r.learner)}</b><span>{r.status === 'left' ? `Left ${fmtDay(r.enrollment.leftOn!)}` : firstTap(r.learner.id)}</span></div>
      {#if t && r.status !== 'left'}<span class="tag {TAG[t[half].status]}">{STATUS_LABEL[t[half].status]}</span>{/if}
    </button>
  {:else}
    <div class="rowi" style="cursor:default"><div class="txt"><b>No learners match</b><span>Try another name or filter.</span></div></div>
  {/each}
</div>

{#if adding}
  <AddStudentModal {db} {classId} {className} {days} {today} {now} onclose={() => (adding = false)}
    onadded={l => { adding = false; load(); onregister({ learner: l }); }} />
{/if}
