<script lang="ts">
  import DayMenu from '../components/DayMenu.svelte';
  import Icon from '../components/Icon.svelte';
  import { todayManila } from '../lib/attendance';
  import { calendarStats, KIND_LABEL, monthCells, setDayType, specialGroups, type DayCell, type DayKind } from '../lib/calendar';
  import type { KlasilidDb } from '../lib/db';
  import { fmtMonth } from '../lib/format';
  import { SCHOOL_YEARS } from '../lib/setup';

  // Markup follows the mockup's School calendar page (renderCal: v37 day cards, stats, grouped special days, day menu).
  let { db, classId, schoolYearId, now }: { db: KlasilidDb; classId: string; schoolYearId: string; now: () => Date } = $props();

  const today = $derived(todayManila(now()));
  const MONTHS = (() => {
    const out: string[] = [];
    const d = new Date(SCHOOL_YEARS[0].startsOn.slice(0, 7) + '-01T00:00:00Z');
    while (d.toISOString().slice(0, 10) <= SCHOOL_YEARS[0].endsOn) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
    return out;
  })();
  const ICON = { holiday: 'star', half: 'half', suspension: 'cloud' } as const;
  const CLS = { holiday: 'hol', half: 'half', suspension: 'sus' } as const; // the mockup's class names
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MN = (m: string) => fmtMonth(m).split(' ')[0];

  let month = $state('');
  let cells: DayCell[] = $state([]);
  let menu: { cell: DayCell; x: number; y: number } | undefined = $state();
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
  function open(c: DayCell, e: MouseEvent) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    menu = { cell: c, x: Math.max(8, Math.min(r.left, innerWidth - 228)), y: r.bottom + 236 > innerHeight ? Math.max(8, r.top - 230) : r.bottom + 6 };
  }
  async function pick(k: DayKind) {
    const c = menu!.cell;
    menu = undefined;
    await setDayType(db, schoolYearId, c.date, k);
    await load();
  }
  const step = (d: number) => { month = MONTHS[Math.min(MONTHS.length - 1, Math.max(0, MONTHS.indexOf(month) + d))]; };
</script>

<div class="page on fill" data-page="calendar">
  <div class="cls-head"><div><h2>School calendar</h2><p>Days that count for attendance and SF2. Click a day to change it.</p></div>
    <div class="hd-actions">
      <div class="monthnav">
        <button class="icon-btn" type="button" aria-label="Previous month" disabled={MONTHS.indexOf(month) <= 0} onclick={() => step(-1)}><Icon name="back" /></button>
        <b class="calTitle num">{month ? fmtMonth(month) : ''}</b>
        <button class="icon-btn" type="button" aria-label="Next month" disabled={MONTHS.indexOf(month) >= MONTHS.length - 1} onclick={() => step(1)}><Icon name="right" /></button>
      </div>
      <button class="btn ghost" type="button" style="width:auto;padding:0 16px" onclick={() => (month = today.slice(0, 7))}>Today</button>
    </div>
  </div>
  <div class="calwrap">
    <div class="panel calpanel">
      <div class="cweek"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
      <div class="cgrid num">
        {#each Array(lead) as _}<span class="cday pad" aria-hidden="true"></span>{/each}
        {#each cells as c (c.date)}
          {#if c.weekend}
            <span class="cday we"><span class="dn">{Number(c.date.slice(8))}</span></span>
          {:else}
            <button type="button" class="cday {c.kind ? CLS[c.kind] : 'school'}" class:today={c.isToday} class:past={c.past && !c.isToday} aria-label={label(c)} onclick={e => open(c, e)}>
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
    <div class="calside">
      <div class="cstats num"><div><b>{stats.school}</b><span>School days</span></div><div class="k-hol"><b>{stats.holiday}</b><span>Holidays</span></div><div class="k-half"><b>{stats.half}</b><span>Half days</span></div><div class="k-sus"><b>{stats.suspension}</b><span>Suspensions</span></div></div>
      <div class="panel" style="padding:14px 16px"><h3 style="margin:0 0 4px;font-size:16px">Special days</h3>
        <div id="calList">
          {#each groups as g}
            {@const kind = g.start.kind!}
            <button type="button" class="sday" onclick={e => open(g.start, e)}>
              <span class="sdate">{#if g.days === 1}<small>{WD[new Date(g.start.date + 'T00:00:00Z').getUTCDay()]}</small><b>{Number(g.start.date.slice(8))}</b>{:else}<small>{MN(month).slice(0, 3)}</small><b class="rng">{Number(g.start.date.slice(8))}–{Number(g.end.date.slice(8))}</b>{/if}</span>
              <span class="stxt"><b>{g.start.name || KIND_LABEL[kind]}</b><span class="dtag {kind === 'holiday' ? 'hol' : kind === 'suspension' ? 'sus' : 'half'}">{KIND_LABEL[kind]}{g.days > 1 ? ` · ${g.days} days` : ''}</span></span>
              <svg class="ico-sm" aria-hidden="true"><use href="#i-edit" /></svg>
            </button>
          {:else}
            <p class="sub2" style="margin:8px 0">No holidays or special days this month.</p>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

{#if menu}
  <DayMenu title={new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(menu.cell.date + 'T00:00:00Z'))}
    current={menu.cell.kind ?? 'school'} x={menu.x} y={menu.y} onpick={pick} onclose={() => (menu = undefined)} />
{/if}
