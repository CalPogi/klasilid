<script lang="ts">
  import type { IsoDate, Session } from '@klasilid/core';
  import AddStudentModal from '../components/AddStudentModal.svelte';
  import CorrectionModal from '../components/CorrectionModal.svelte';
  import Icon from '../components/Icon.svelte';
  import Pager from '../components/Pager.svelte';
  import StudentDrawer from '../components/StudentDrawer.svelte';
  import TransferModal from '../components/TransferModal.svelte';
  import { classDay, schoolDaysInMonth, todayManila, type ClassDay, type LearnerDay } from '../lib/attendance';
  import type { KlasilidDb, LLearner } from '../lib/db';
  import { replaceCard, studentRows, type StudentFilter, type StudentRow } from '../lib/students';
  import type { Mode } from '../lib/session';

  // Markup follows the mockup's Students page (renderStudents) and its drawer and modals.
  let { db, classId, teacherId, now, mode = 'online', onregister }: {
    db: KlasilidDb; classId: string; teacherId: string; now: () => Date; mode?: Mode;
    onregister?: (target: { learner?: LLearner; bulk?: boolean }) => void;
  } = $props();

  const PER_PAGE = 11; // fits a 1440×950 laptop screen with the tools row and pager
  const today = $derived(todayManila(now()));
  let rows: StudentRow[] = $state([]);
  let all: StudentRow[] = $state([]);
  let day: ClassDay | undefined = $state();
  let days: IsoDate[] = $state([]);
  let className = $state('');
  let filter: StudentFilter = $state('all');
  let query = $state('');
  let page = $state(1);
  let open: StudentRow | undefined = $state();
  let adding = $state(false);
  let moving: StudentRow | undefined = $state();
  let correcting: { row: LearnerDay; session: Session } | undefined = $state();

  const pages = $derived(Math.max(1, Math.ceil(rows.length / PER_PAGE)));
  const shown = $derived(rows.slice((page - 1) * PER_PAGE, page * PER_PAGE));
  const enrolledCount = $derived(all.filter(r => r.status !== 'left').length);

  async function load() {
    const cls = await db.classes.get(classId);
    className = cls ? `Gr. ${cls.grade} ${cls.section}` : '';
    days = await schoolDaysInMonth(db, classId, today.slice(0, 7), today);
    day = await classDay(db, classId, today, now());
    all = await studentRows(db, classId, today, 'all', '');
    rows = await studentRows(db, classId, today, filter, query);
    if (open) open = all.find(r => r.learner.id === open!.learner.id);
  }
  $effect(() => { filter; query; page = 1; load(); });
  const todayOf = (id: string) => day?.rows.find(r => r.learner.id === id);
  /** Today's excuse-letter photo kept on this device, if a correction has one. */
  let letter = $state('');
  $effect(() => {
    const r = open && todayOf(open.learner.id);
    const ids = r ? [r.am.correctionId, r.pm.correctionId].filter((x): x is string => !!x) : [];
    letter = '';
    (async () => {
      for (const id of ids) {
        const p = await db.photos.get(id);
        if (p && typeof URL.createObjectURL === 'function') { letter = URL.createObjectURL(p.blob); return; }
      }
    })();
  });
</script>

<div class="page on" data-page="students">
  <div class="cls-head">
    <div><h2>Students</h2><p>{className} · {enrolledCount} learners</p></div>
    <div class="hd-actions">
      <label class="period"><Icon name="cal" /><span class="sr">School year</span><select><option>SY 2026–2027</option></select></label>
      <button class="btn ghost" type="button" style="width:auto;height:44px;padding:0 16px;font-size:15px" onclick={() => onregister?.({ bulk: true })}><Icon name="wifi" />Register cards</button>
      <button class="btn" type="button" style="width:auto;height:44px;padding:0 18px" onclick={() => (adding = true)}><Icon name="users" />Add student</button>
    </div>
  </div>
  <div class="panel">
    <div class="stu-tools">
      <label class="search"><Icon name="search" /><span class="sr">Search students</span><input bind:value={query} placeholder="Search students" autocomplete="off" /></label>
      <label class="sr" for="stuF">Show</label>
      <select id="stuF" bind:value={filter}>
        <option value="all">All learners</option><option value="nocard">No card</option><option value="replaced">Card replaced</option>
        <option value="noparent">No parent account</option><option value="left">Transferred out</option>
      </select>
      <span class="sub2">{rows.length} shown</span>
    </div>
    <div class="tbl-wrap">
      <table class="tbl" id="stuTbl">
        <thead><tr><th>Learner</th><th>Status</th><th>RFID card</th><th>Parent account</th><th class="c">Attendance</th><th></th></tr></thead>
        <tbody class="num">
          {#each shown as r (r.learner.id)}
            {@const name = `${r.learner.firstName} ${r.learner.lastName}`}
            <tr class:left={r.status === 'left'}>
              <td><button class="linkbtn" type="button" style="color:inherit" onclick={() => (open = r)}>{name}</button></td>
              <td>{#if r.status === 'left'}<span class="tag gone">Transferred out</span>{:else if r.status === 'joined'}<span class="tag in">Joined {r.enrollment.joinedOn.slice(5).replace('-', '/')}</span>{:else}<span class="tag ok">Enrolled</span>{/if}</td>
              <td>{#if r.status === 'left'}<span class="tag gone">Stopped</span>{:else if r.card.state === 'none'}<span class="tag notyet">No card</span>{:else if r.card.state === 'replaced'}<span class="tag late">Replaced</span>{:else}<span class="tag ok">Registered</span>{/if}</td>
              <td>{#if r.status === 'left'}<span class="tag gone">Closed</span>{:else}<span class="tag late">Not set up</span>{/if}</td>
              <td class="c">{r.presentPct == null ? '—' : `${r.presentPct}%`}</td>
              <td>{#if r.status !== 'left' && r.card.state === 'none'}<button class="mini-btn primary" type="button" onclick={() => onregister?.({ learner: r.learner })}>Register card</button>{:else}<button class="mini-btn" type="button" aria-label="View {name}" onclick={() => (open = r)}>View</button>{/if}</td>
            </tr>
          {:else}
            <tr><td colspan="6"><div class="empty-st"><div class="ic"><Icon name="search" /></div><b>No learners match</b><span>Try another name or filter.</span></div></td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <Pager bind:page {pages} />
  </div>
</div>

{#if open}
  <StudentDrawer row={open} today={todayOf(open.learner.id)} {className} {now} {letter} onclose={() => (open = undefined)}
    oncorrect={(r, s) => (correcting = { row: r, session: s })} ontransfer={() => (moving = open)}
    oncard={async a => { const l = open!.learner; if (a === 'replace') await replaceCard(db, l.id, now()); await load(); onregister?.({ learner: l }); }} />
{/if}
{#if adding}
  <AddStudentModal {db} {classId} {className} {days} {today} {now} onclose={() => (adding = false)}
    onadded={l => { adding = false; load(); onregister?.({ learner: l }); }} />
{/if}
{#if moving}
  <TransferModal {db} enrollmentId={moving.enrollment.id} name="{moving.learner.firstName} {moving.learner.lastName}" {days} {today}
    onclose={() => (moving = undefined)} ondone={() => { moving = undefined; load(); }} />
{/if}
{#if correcting && day}
  <CorrectionModal {db} {classId} date={day.date} day={correcting.row} session={correcting.session} {teacherId}
    onclose={() => (correcting = undefined)} onsaved={() => { correcting = undefined; load(); }} />
{/if}
