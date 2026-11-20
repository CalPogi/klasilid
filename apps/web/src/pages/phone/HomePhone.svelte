<script lang="ts">
  import { manilaMinute, type HalfDayStatus, type Session } from '@klasilid/core';
  import CorrectionModal from '../../components/CorrectionModal.svelte';
  import Icon from '../../components/Icon.svelte';
  import Modal from '../../components/Modal.svelte';
  import { classDay, needsAttention, todayManila, type ClassDay, type LearnerDay } from '../../lib/attendance';
  import { pendingCount, type KlasilidDb } from '../../lib/db';
  import { fmtDay, shortName, STATUS_LABEL } from '../../lib/format';
  import { attentionLine, todayNotices, todayTodos } from '../../lib/today';

  // The mockup's phone Home (data-screen="home") plus the canvas's To do card. Same data as the laptop Today page.
  let { db, classId, teacherId, displayName, now, onregister }: {
    db: KlasilidDb; classId: string; teacherId: string; displayName: string; now: () => Date; onregister?: () => void;
  } = $props();

  let day: ClassDay | undefined = $state();
  let pending = $state(0);
  let refused = $state(0);
  let noCard = $state(0);
  let online = $state(navigator.onLine);
  let editing: { row: LearnerDay; session: Session } | undefined = $state();
  let bell = $state(false);
  let done: Record<string, boolean> = $state({});

  let hasReader = $state(false);  // a tap has arrived: the door reader is paired
  async function load() {
    day = await classDay(db, classId, todayManila(now()), now());
    pending = await pendingCount(db);
    refused = await db.rejected.count();
    const carded = new Set((await db.cards.toArray()).filter(c => c.active).map(c => c.learnerId));
    noCard = day.rows.filter(r => !carded.has(r.learner.id)).length;
    hasReader = !!(await db.taps.orderBy('at').last());
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
  const attention = $derived(day ? needsAttention(day) : []);
  const notices = $derived(day ? todayNotices(day, refused, pending, online) : []);
  const todos = $derived(day ? todayTodos(day, noCard, hasReader) : []);
  const left = $derived(todos.filter(t => !done[t.id]).length);
  const noSchool = $derived(day && (day.dayType === 'holiday' || day.dayType === 'suspension'));
  const initials = $derived(displayName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'T');
  const legend = $derived(day ? [
    [day.counts.in - day.counts.late, 'var(--ink)', 'On time'], [day.counts.late, 'var(--accent)', 'Late'],
    [day.counts.absent, 'var(--bad)', 'Absent'], [day.counts.notYet, '#CFCFD6', 'Not yet'],
  ] as [number, string, string][] : []);
</script>

<div class="hrow">
  <div style="display:flex;gap:12px;align-items:center">
    <div class="avatar">{initials}</div>
    <div><p style="margin:0;font-weight:800;font-size:17px">{displayName}</p>
      <p class="eyebrowless" style="display:flex;align-items:center;gap:6px;margin:0">{fmtDay(todayManila(now()))} ·
        <span class="sync"><i></i><span>{pending ? `${pending} to sync` : 'Synced'}</span></span></p></div>
  </div>
  <button class="iconbtn" type="button" aria-label="Notifications, {notices.length} new" style="position:relative" onclick={() => (bell = true)}>
    <Icon name="bell" cls="ico" />{#if notices.length}<span class="bell-badge"></span>{/if}</button>
</div>

{#if !online}
  <div class="warn mt4 net-banner" style="display:flex" role="status"><Icon name="wifi-off" /><span>No internet. Attendance still works: taps come straight from the door reader over the classroom Wi-Fi. <b>{pending} changes</b> will sync later.</span></div>
{/if}

{#if noSchool && day}
  <div class="card mt5"><h3 style="margin:0 0 4px">No classes today</h3>
    <p class="eyebrowless" style="margin:0">{day.dayType === 'suspension' ? 'Classes are suspended.' : 'It is a weekend or a holiday.'} Nobody is marked absent.</p>
    <a class="btn ghost mt4" href="#/attendance">See past days</a></div>
{:else if day?.needsSetup}
  <div class="card mt5"><h3 style="margin:0 0 4px">Set the tap times first</h3>
    <p class="eyebrowless" style="margin:0">Attendance starts once the morning and afternoon tap times are set.</p>
    <a class="btn mt4" href="#/settings">Set up tap times</a></div>
{:else if day}
  <div class="card mt5">
    <div class="big-count num"><b>{day.counts.in}</b><span>of {day.counts.total} in class</span></div>
    <div class="segbar" aria-hidden="true">{#each legend as [n, c]}{#if n}<i style="flex:{n};background:{c}"></i>{/if}{/each}</div>
    <div class="legend num">{#each legend as [n, c, label]}<div><b>{n}</b><span class="sw" style="background:{c}"></span>{label}</div>{/each}</div>
    <a class="btn mt4" href="#/seat">Open seat plan<Icon name="arrow" cls="ico" /></a>
  </div>

  <div class="title-row"><h3>Needs your attention</h3><a class="link" href="#/seat">See all</a></div>
  <div class="rows">
    {#each attention as r (r.learner.id)}
      {@const w = attentionLine(r, afternoon)}
      <button class="rowi" type="button" onclick={() => (editing = { row: r, session: w.session })}>
        <div class="avatar sm">{r.learner.firstName[0]}{r.learner.lastName[0]}</div>
        <div class="txt"><b>{shortName(r.learner)}</b><span class="num">{w.text}</span></div>
        <span class="tag {TAG[w.status]}">{STATUS_LABEL[w.status]}</span>
      </button>
    {:else}
      <div class="rowi" style="cursor:default"><div class="txt"><span>Nothing to check right now.</span></div></div>
    {/each}
  </div>

  <div class="title-row"><h3>To do</h3><span class="eyebrowless" style="font-size:13px">{left ? `${left} left` : 'All done'}</span></div>
  <div class="rows" style="padding:0 16px">
    {#each todos as t (t.id)}
      <div class="todo" class:done={done[t.id]}>
        <button class="tickhit" type="button" aria-label="Mark done: {t.title}" aria-pressed={!!done[t.id]} onclick={() => (done[t.id] = !done[t.id])}>
          <span class="tick"><Icon name="check" /></span></button>
        {#if t.id === 'cards' && onregister}
          <button class="txt linkrow" type="button" onclick={onregister}><b>{t.title}</b><span>{t.sub}</span></button><Icon name="right" cls="ico-sm chev" />
        {:else}
          <div class="txt"><b>{t.title}</b><span>{t.sub}</span></div>{#if t.due}<span class="due">{t.due}</span>{/if}
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if bell}
  <Modal labelledby="ntTitle" onclose={() => (bell = false)}>
    <h4 id="ntTitle">Notifications</h4>
    <div class="rows mt3" style="padding:4px 8px">
      {#each notices as n}
        <div class="notif unread"><span class="ic" style={n.tone === 'bad' ? 'background:var(--bad-soft);color:var(--bad-ink)' : n.tone === 'warn' ? 'background:var(--accent-soft);color:var(--accent-ink)' : ''}><Icon name={n.tone === 'bad' ? 'clock' : n.tone === 'warn' ? 'info' : 'sync'} /></span><div><b>{n.title}</b><small>{n.sub}</small></div></div>
      {:else}
        <div class="notif"><div><b>You're all caught up</b><small>Nothing new right now</small></div></div>
      {/each}
    </div>
  </Modal>
{/if}
{#if editing && day}
  <CorrectionModal {db} {classId} date={day.date} day={editing.row} session={editing.session} {teacherId}
    onclose={() => (editing = undefined)} onsaved={() => { editing = undefined; load(); }} />
{/if}

<style>
  .tickhit { width: 44px; height: 44px; margin: -11px; border: 0; background: none; display: grid; place-items: center; cursor: pointer; flex: none; }
  .linkrow { flex: 1; min-width: 0; border: 0; background: none; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
  .linkrow b { display: block; font-size: 14.5px; }
  .linkrow span { font-size: 13px; color: var(--muted); }
  :global(.chev) { color: var(--muted); flex: none; }
</style>
