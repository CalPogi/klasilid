<script lang="ts">
  import { manilaMinute, type HalfDayStatus, type Session } from '@klasilid/core';
  import CorrectionModal from '../components/CorrectionModal.svelte';
  import Icon from '../components/Icon.svelte';
  import { classDay, needsAttention, todayManila, type ClassDay, type LearnerDay } from '../lib/attendance';
  import { pendingCount, type KlasilidDb } from '../lib/db';
  import { fmtLongDay, fmtMinutes, fmtTime, STATUS_LABEL } from '../lib/format';

  // Markup and class names follow the mockup's web Today page.
  let { db, classId, teacherId, displayName, now, onregister }: {
    db: KlasilidDb; classId: string; teacherId: string; displayName: string; now: () => Date; onregister?: () => void;
  } = $props();

  let day: ClassDay | undefined = $state();
  let className = $state('');
  let pending = $state(0);
  let noCard = $state(0);
  let refused = $state(0);
  let online = $state(navigator.onLine);
  let editing: { row: LearnerDay; session: Session } | undefined = $state();
  let bellOpen = $state(false);
  let query = $state('');
  let done: Record<string, boolean> = $state({});

  async function load() {
    const today = todayManila(now());
    day = await classDay(db, classId, today, now());
    const cls = await db.classes.get(classId);
    className = cls ? `Gr. ${cls.grade} ${cls.section}` : '';
    pending = await pendingCount(db);
    refused = await db.rejected.count();
    const carded = new Set((await db.cards.toArray()).filter(c => c.active).map(c => c.learnerId));
    noCard = day.rows.filter(r => !carded.has(r.learner.id)).length;
  }
  $effect(() => {
    load();
    const t = setInterval(load, 30_000);
    const net = () => (online = navigator.onLine);
    addEventListener('online', net);
    addEventListener('offline', net);
    return () => { clearInterval(t); removeEventListener('online', net); removeEventListener('offline', net); };
  });

  const TAG: Record<HalfDayStatus, string> = { on_time: 'in', late: 'late', absent: 'absent', excused: 'excused', pending: 'notyet', no_school: 'gone' };
  const afternoon = $derived(manilaMinute(now().toISOString()) >= 12 * 60);
  const half = $derived<Session>(afternoon ? 'pm' : 'am');
  const lateAfter = $derived(day?.windows.find(w => w.session === 'am' && w.kind === 'in')?.lateAfter);
  const attention = $derived(day ? needsAttention(day) : []);
  const bar = $derived(day ? [
    [day.counts.in - day.counts.late, 'var(--ink)'], [day.counts.late, 'var(--accent)'], [day.counts.absent, 'var(--bad)'], [day.counts.notYet, '#CFCFD6'],
  ] as [number, string][] : []);
  const results = $derived(query.trim() && day
    ? day.rows.filter(r => `${r.learner.firstName} ${r.learner.lastName}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6) : []);
  const noSchool = $derived(day && (day.dayType === 'holiday' || day.dayType === 'suspension'));
  const taps = (n: number) => `${n} ${n === 1 ? 'tap' : 'taps'}`;

  const notifications = $derived(day ? [
    ...(day.suspectTaps.length ? [{ title: `Reader clock looked wrong for ${taps(day.suspectTaps.length)}`, sub: 'Check the times on the Attendance page', tone: 'bad' }] : []),
    ...(day.unknownTaps.length ? [{ title: `${taps(day.unknownTaps.length)} from an unregistered card`, sub: day.unknownTaps.map(t => `${t.cardUid} · ${fmtTime(t.at)}`).join(', '), tone: 'warn' }] : []),
    ...(refused ? [{ title: `${refused} ${refused === 1 ? 'change' : 'changes'} the server refused`, sub: 'Kept on this device. Check the account or ask for help.', tone: 'bad' }] : []),
    ...(pending ? [{ title: `${pending} changes waiting to sync`, sub: online ? 'Sending now' : 'They send when the internet is back', tone: '' }] : []),
  ] : []);

  const todos = $derived(day ? [
    { id: 'reader', title: 'Pair your door reader', sub: 'Do this when your reader arrives', due: 'Later' },
    ...(noCard ? [{ id: 'cards', title: `Register cards for ${noCard} learners`, sub: 'No RFID card yet', due: '' }] : []),
    ...(day.unknownTaps.length ? [{ id: 'unknown', title: 'Check taps from unregistered cards', sub: day.unknownTaps.map(t => `${t.cardUid} · ${fmtTime(t.at)}`).join(', '), due: 'Today' }] : []),
    ...(day.suspectTaps.length ? [{ id: 'clock', title: `The reader's clock looked wrong for ${taps(day.suspectTaps.length)}. Check them.`, sub: 'The time on those taps may be off', due: 'Today' }] : []),
  ] : []);
  const left = $derived(todos.filter(t => !done[t.id]).length);

  /** The line under a name on the attention list, and which half-day a click corrects. */
  function why(r: LearnerDay): { text: string; session: Session; status: HalfDayStatus } {
    const stray = r.review[0];
    if (stray) return { text: `Tapped ${fmtTime(stray.at)}, outside tap times`, session: manilaMinute(stray.at) >= 12 * 60 ? 'pm' : 'am', status: r.am.status };
    const s: Session = r.pm.flags.includes('after_closing') && !r.am.flags.includes('after_closing') ? 'pm' : half;
    const tap = r.taps.find(x => x.id === r[s].inTapId);
    if (r[s].flags.includes('after_closing')) return { text: `Came after closing${tap ? ' · ' + fmtTime(tap.at) : ''}`, session: s, status: r[s].status };
    return { text: tap ? `Tapped ${fmtTime(tap.at)}` : afternoon ? 'No tap this afternoon' : 'No tap this morning', session: s, status: r[s].status };
  }
  function open(r: LearnerDay, s: Session = half) {
    editing = { row: r, session: s };
    query = '';
  }
</script>

<div class="page on fill" data-page="today">
  <div class="topbar">
    <div class="ttl"><h2>Good {afternoon ? 'afternoon' : 'morning'}, {displayName}</h2><p>{fmtLongDay(todayManila(now()))} · {className}</p></div>
    <div class="bellwrap">
      <button class="iconbtn" type="button" aria-label="Notifications, {notifications.length} new" aria-expanded={bellOpen} onclick={() => (bellOpen = !bellOpen)}><Icon name="bell" cls="ico" /></button>
      {#if notifications.length}<span class="bell-badge"></span>{/if}
      <div class="notif-pop" class:open={bellOpen} role="dialog" aria-label="Notifications">
        <div class="hrow" style="padding:6px 10px"><b>Notifications</b></div>
        {#each notifications as n}
          <div class="notif unread"><span class="ic" style={n.tone === 'bad' ? 'background:var(--bad-soft);color:var(--bad-ink)' : n.tone === 'warn' ? 'background:var(--accent-soft);color:var(--accent-ink)' : ''}><Icon name={n.tone === 'bad' ? 'clock' : n.tone === 'warn' ? 'info' : 'sync'} /></span><div><b>{n.title}</b><small>{n.sub}</small></div></div>
        {:else}
          <div class="notif"><div><b>You're all caught up</b><small>Nothing new right now</small></div></div>
        {/each}
      </div>
    </div>
    <div class="qfind">
      <label class="search"><Icon name="search" /><span class="sr">Find a student</span><input bind:value={query} placeholder="Find a student" autocomplete="off" aria-controls="qRes" /></label>
      <div class="qres" id="qRes" role="listbox" class:open={!!query.trim()}>
        {#each results as r}
          <button type="button" role="option" aria-selected="false" onclick={() => open(r)}><span class="avatar sm">{r.learner.firstName[0]}{r.learner.lastName[0]}</span>{r.learner.firstName} {r.learner.lastName}<span class="tag {TAG[r[half].status]}" style="margin-left:auto">{STATUS_LABEL[r[half].status]}</span></button>
        {:else}
          <div class="empty">No learner matches "{query.trim()}"</div>
        {/each}
      </div>
    </div>
    <span class="chip" style="white-space:nowrap"><span class="dot" style="background:#9C9CA6"></span>No reader yet</span>
    <a class="btn" href="#/seat">Open seat plan<Icon name="arrow" /></a>
  </div>

  {#if !online}
    <div class="warn net-banner" style="display:flex" role="status"><Icon name="wifi-off" /><span style="flex:1">No internet right now. Attendance keeps working: the door reader saves every tap and this page reads them over the classroom Wi-Fi. Your <b>{pending} changes</b> sync when the internet is back.</span></div>
  {/if}

  {#if noSchool && day}
    <div class="panel">
      <h3>No classes today</h3>
      <p class="sub2">{day.dayType === 'suspension' ? 'Classes are suspended.' : 'It is a weekend or a holiday.'} Nobody is marked absent.</p>
      <a class="link" href="#/attendance">See past days</a>
    </div>
  {:else if day?.needsSetup}
    <div class="panel">
      <h3>Set the tap times first</h3>
      <p class="sub2">Attendance starts once the morning and afternoon tap times are set.</p>
      <a class="btn" href="#/setup" style="width:auto;padding:0 18px;margin-top:12px">Set up tap times</a>
    </div>
  {:else if day}
    <div class="dkpis num">
      <div class="kpi" role="group" aria-label="In class">
        <div class="row1"><span>In class</span><small>of {day.counts.total} learners</small></div>
        <b data-testid="value">{day.counts.in}</b>
        <div class="segbar" style="margin:0" aria-hidden="true">{#each bar as [n, c]}{#if n}<i style="flex:{n};background:{c}"></i>{/if}{/each}</div>
      </div>
      <div class="kpi" role="group" aria-label="Late"><div class="row1"><span>Late</span><span class="sw" style="width:10px;height:10px;border-radius:3px;background:var(--accent)"></span></div>
        <b data-testid="value">{day.counts.late}</b><small>{lateAfter != null ? `after ${fmtMinutes(lateAfter)}` : ''}</small></div>
      <div class="kpi" role="group" aria-label="Absent"><div class="row1"><span>Absent</span><span class="sw" style="width:10px;height:10px;border-radius:3px;background:var(--bad)"></span></div>
        <b data-testid="value">{day.counts.absent}</b><small>this morning</small></div>
      <div class="kpi" role="group" aria-label="Not yet"><div class="row1"><span>Not yet</span><span class="sw" style="width:10px;height:10px;border-radius:3px;background:#CFCFD6"></span></div>
        <b data-testid="value">{day.counts.notYet}</b><small>no tap so far</small></div>
    </div>

    <div class="dmain">
      <div class="panel">
        <div class="panel-top"><div><h3>Needs your attention</h3><p class="sub2">Click a name to correct it</p></div><a class="link" href="#/seat" style="padding:0">Seat plan</a></div>
        <div class="scroll mini-rows">
          {#each attention as r (r.learner.id)}
            {@const w = why(r)}
            <button class="rowi" type="button" onclick={() => open(r, w.session)}>
              <div class="avatar sm">{r.learner.firstName[0]}{r.learner.lastName[0]}</div>
              <div class="txt"><b>{r.learner.firstName} {r.learner.lastName}</b><span class="num">{w.text}</span></div>
              <span class="tag {TAG[w.status]}">{STATUS_LABEL[w.status]}</span>
            </button>
          {:else}
            <p class="sub2">Nothing to check right now.</p>
          {/each}
        </div>
      </div>
      <div class="panel">
        <div class="panel-top"><div><h3>To do</h3><p class="sub2">{left ? `${left} left` : 'All done'}</p></div></div>
        <div class="scroll">
          {#each todos as t (t.id)}
            <div class="todo" class:done={done[t.id]}>
              <button class="tick" type="button" aria-label="Mark done" aria-pressed={!!done[t.id]} onclick={() => (done[t.id] = !done[t.id])}><Icon name="check" /></button>
              <div class="txt">{#if t.id === 'cards' && onregister}<button class="linkbtn" type="button" style="color:inherit;font-weight:700;padding:0" onclick={onregister}>{t.title}</button>{:else}<b>{t.title}</b>{/if}<span>{t.sub}</span></div><span class="due">{t.due}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

{#if editing && day}
  <CorrectionModal {db} {classId} date={day.date} day={editing.row} session={editing.session} {teacherId}
    onclose={() => (editing = undefined)} onsaved={() => { editing = undefined; load(); }} />
{/if}
