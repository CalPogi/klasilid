<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import Modal from '../../components/Modal.svelte';
  import { todayManila } from '../../lib/attendance';
  import { calendarStats, DAY_OPTIONS, KIND_LABEL, monthCells, setDayType, specialGroups, type DayCell, type DayKind } from '../../lib/calendar';
  import type { KlasilidDb } from '../../lib/db';
  import { fmtMonth } from '../../lib/format';
  import { go } from '../../lib/router';
  import { SCHOOL_YEARS } from '../../lib/setup';

  // The mockup's phone School calendar (data-screen="pcal"). Tapping a day opens the day menu as a sheet.
  let { db, classId, schoolYearId, now }: { db: KlasilidDb; classId: string; schoolYearId: string; now: () => Date } = $props();

  const today = $derived(todayManila(now()));
  const MONTHS = (() => {
    const out: string[] = [];
    const d = new Date(SCHOOL_YEARS[0].startsOn.slice(0, 7) + '-01T00:00:00Z');
    while (d.toISOString().slice(0, 10) <= SCHOOL_YEARS[0].endsOn) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
    return out;
  })();
  const ICON = { holiday: 'star', half: 'half', suspension: 'cloud' } as const;
  const CLS = { holiday: 'hol', half: 'half', suspension: 'sus' } as const;
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MN = (m: string) => fmtMonth(m).split(' ')[0];

  let month = $state('');
  let cells: DayCell[] = $state([]);
  let picking: DayCell | undefined = $state();
  $effect(() => { month ||= MONTHS.includes(today.slice(0, 7)) ? today.slice(0, 7) : MONTHS[0]; });
  async function load() { if (month) cells = await monthCells(db, classId, month, today, now()); }
  $effect(() => { month; load(); });

  const lead = $derived(cells.length ? (new Date(cells[0].date + 'T00:00:00Z').getUTCDay() + 6) % 7 : 0);
  const stats = $derived(calendarStats(cells));
  const groups = $derived(specialGroups(cells));
  const label = (c: DayCell) => {
    const dm = `${MN(month)} ${Number(c.date.slice(8))}`;
    return c.kind ? `${dm}, ${KIND_LABEL[c.kind]}${c.name && c.name !== KIND_LABEL[c.kind] ? ', ' + c.name : ''}` : `${dm}, school day${c.isToday ? `, today, ${c.inCount ?? 0} in` : ''}`;
  };
  async function pick(k: DayKind) {
    const c = picking!;
    picking = undefined;
    await setDayType(db, schoolYearId, c.date, k);
    await load();
  }
  const step = (d: number) => { month = MONTHS[Math.min(MONTHS.length - 1, Math.max(0, MONTHS.indexOf(month) + d))]; };
  const back = () => (history.length > 1 ? history.back() : go('today'));
  const longDay = (d: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(d + 'T00:00:00Z'));
</script>

<div class="hrow"><button class="iconbtn" type="button" aria-label="Back" onclick={back}><Icon name="back" cls="ico" /></button><b style="font-size:16px">School calendar</b><span class="spacer44"></span></div>
<div class="monthnav m mt4">
  <button class="icon-btn" type="button" aria-label="Previous month" disabled={MONTHS.indexOf(month) <= 0} onclick={() => step(-1)}><Icon name="back" /></button>
  <b class="calTitle num">{month ? fmtMonth(month) : ''}</b>
  <button class="icon-btn" type="button" aria-label="Next month" disabled={MONTHS.indexOf(month) >= MONTHS.length - 1} onclick={() => step(1)}><Icon name="right" /></button>
</div>
<div class="cstats m num"><div><b>{stats.school}</b><span>School days</span></div><div class="k-hol"><b>{stats.holiday}</b><span>Holidays</span></div><div class="k-half"><b>{stats.half}</b><span>Half days</span></div><div class="k-sus"><b>{stats.suspension}</b><span>Suspensions</span></div></div>
<div class="card mt3" style="padding:12px 10px">
  <div class="cweek m"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
  <div class="cgrid m num">
    {#each Array(lead) as _}<span class="cday pad" aria-hidden="true"></span>{/each}
    {#each cells as c (c.date)}
      {#if c.weekend}
        <span class="cday we"><span class="dn">{Number(c.date.slice(8))}</span></span>
      {:else}
        <button type="button" class="cday {c.kind ? CLS[c.kind] : 'school'}" class:today={c.isToday} class:past={c.past && !c.isToday} aria-label={label(c)} onclick={() => (picking = c)}>
          <span class="dn">{Number(c.date.slice(8))}</span>
          {#if c.kind}
            <span class="sico" aria-hidden="true"><svg><use href="#i-{ICON[c.kind]}" /></svg></span>
            <span class="dname">{c.name && c.name !== KIND_LABEL[c.kind] ? c.name : KIND_LABEL[c.kind]}</span><span class="dtag">{KIND_LABEL[c.kind]}</span>
          {:else if c.isToday}
            <span class="dfoot"><span class="pct now2">Today · {c.inCount ?? 0} in</span><span class="att"><i style="width:{c.pct ?? 0}%"></i></span></span>
          {:else if c.past && c.pct != null}
            <span class="dfoot"><span class="pct">{c.pct}%</span><span class="att" class:low={c.pct < 90}><i style="width:{c.pct}%"></i></span></span>
          {/if}
        </button>
      {/if}
    {/each}
  </div>
</div>
<div class="title-row"><h3>Special days</h3><span class="eyebrowless" style="font-size:13px">Tap a day to change it</span></div>
<div class="rows" style="padding:0 14px">
  {#each groups as g}
    {@const kind = g.start.kind!}
    <button type="button" class="sday m" onclick={() => (picking = g.start)}>
      <span class="sdate">{#if g.days === 1}<small>{WD[new Date(g.start.date + 'T00:00:00Z').getUTCDay()]}</small><b>{Number(g.start.date.slice(8))}</b>{:else}<small>{MN(month).slice(0, 3)}</small><b class="rng">{Number(g.start.date.slice(8))}–{Number(g.end.date.slice(8))}</b>{/if}</span>
      <span class="stxt"><b>{g.start.name || KIND_LABEL[kind]}</b><span class="dtag {CLS[kind]}">{KIND_LABEL[kind]}{g.days > 1 ? ` · ${g.days} days` : ''}</span></span>
      <Icon name="edit" />
    </button>
  {:else}
    <p class="eyebrowless" style="margin:12px 0">No holidays or special days this month.</p>
  {/each}
</div>

{#if picking}
  <Modal labelledby="dmTitle" onclose={() => (picking = undefined)}>
    <h4 id="dmTitle">{longDay(picking.date)}</h4>
    <div class="daymenu open sheetmenu" role="menu" aria-labelledby="dmTitle">
      {#each DAY_OPTIONS as [k, text, dot]}
        <button type="button" role="menuitemradio" aria-checked={(picking.kind ?? 'school') === k} class:cur={(picking.kind ?? 'school') === k} onclick={() => pick(k)}><i class={dot}></i>{text}</button>
      {/each}
    </div>
  </Modal>
{/if}

<style>
  .sheetmenu { position: static; width: auto; box-shadow: none; border: 0; margin-top: 10px; opacity: 1; transform: none; pointer-events: auto; }
  .sheetmenu button { min-height: 48px; }
</style>
