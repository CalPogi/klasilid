<script lang="ts">
  import type { IsoDate } from '@klasilid/core';
  import Icon from '../../components/Icon.svelte';
  import AdvisoryHead from '../../components/phone/AdvisoryHead.svelte';
  import { classDay, monthSummary, monthsWithAttendance, schoolDaysInMonth, todayManila, type ClassDay } from '../../lib/attendance';
  import type { KlasilidDb } from '../../lib/db';
  import { fmtMonth } from '../../lib/format';
  import { go } from '../../lib/router';

  // The mockup's phone attendance (data-screen="dAtt"): the month's three stats and its school days, newest first.
  // Each day opens that day's seat plan (canvas board "a past school day").
  let { db, classId, now }: { db: KlasilidDb; classId: string; now: () => Date } = $props();

  const today = $derived(todayManila(now()));
  let className = $state('');
  let months: string[] = $state([]);
  let month = $state('');
  let days: ClassDay[] = $state([]);
  const sum = $derived(monthSummary(days));
  const at = $derived(months.indexOf(month));
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  $effect(() => {
    db.classes.get(classId).then(c => (className = c ? `Gr. ${c.grade} ${c.section}` : ''));
    monthsWithAttendance(db, classId, today).then(m => { months = m; month ||= m[0] ?? today.slice(0, 7); });
  });
  $effect(() => {
    if (!month) return;
    const m = month;
    schoolDaysInMonth(db, classId, m, today).then(ds => Promise.all(ds.map((d: IsoDate) => classDay(db, classId, d, now())))).then(r => { if (m === month) days = r; });
  });
</script>

<AdvisoryHead {className} count={days[0]?.rows.length ?? 0} tab="attendance" />
<div class="stat3 num" style="margin-top:0">
  <div><b>{sum.presentPct == null ? '—' : `${sum.presentPct}%`}</b><span>Avg. present</span></div>
  <div class="k-late"><b>{sum.late}</b><span>Late taps</span></div>
  <div class="k-bad"><b>{sum.absent}</b><span>Absent</span></div>
</div>
<div class="mnav">
  <button type="button" aria-label="Previous month" disabled={at < 0 || at >= months.length - 1} onclick={() => (month = months[at + 1])}><Icon name="back" cls="" /></button>
  <b>{month ? fmtMonth(month) : ''}</b>
  <button type="button" aria-label="Next month" disabled={at <= 0} onclick={() => (month = months[at - 1])}><Icon name="right" cls="" /></button>
</div>
<div class="title-row"><h3>School days</h3><span class="eyebrowless" style="font-size:13px">Tap a day to see or correct it</span></div>
<div class="rows">
  {#each days as d (d.date)}
    <button type="button" class="day dayrow" onclick={() => go('day', { date: d.date })}>
      <div class="dt num"><b>{Number(d.date.slice(8))}</b><span>{WD[new Date(d.date + 'T00:00:00Z').getUTCDay()]}</span></div>
      <div class="txt num">{d.counts.in} present<small>{d.counts.late} late · {d.counts.absent} absent{d.date === today ? ' · today' : ''}</small></div>
      {#if d.counts.absent}<span class="tag absent">{d.counts.absent} absent</span>{:else}<span class="tag in">All in</span>{/if}
      <Icon name="right" cls="ico-sm chev" />
    </button>
  {:else}
    <div class="day"><div class="txt">No school days yet this month.</div></div>
  {/each}
</div>

<style>
  .dayrow { width: 100%; border-left: 0; border-right: 0; border-top: 0; background: none; font: inherit; text-align: left; cursor: pointer; color: inherit; }
</style>
