<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Route } from '../lib/router';
  import Icon from './Icon.svelte';

  // Markup and class names follow the mockup's web sidebar (docs/mockup, "Web, teacher on a laptop").
  let { current, className, userName = '', classes = [], onsignout, children }: {
    current: Route; className: string; userName?: string; classes?: { label: string; advisory: boolean }[];
    onsignout?: () => void; children?: Snippet;
  } = $props();

  let navOpen = $state(false);
  let classesOpen = $state(false); // My classes starts closed (owner decision)
  let meOpen = $state(false);
  const initials = $derived(userName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'T');
  const on = (r: Route) => (current === r ? 'page' : undefined);
  const close = () => { navOpen = false; meOpen = false; };
</script>

<svelte:window onhashchange={close} />

<div class="app full" class:nav-open={navOpen}>
  <aside class="side">
    <div class="brand"><span class="logo" style="font-weight:900;font-size:19px;letter-spacing:-.04em">k</span>Klasilid</div>
    <nav aria-label="Main">
      <a href="#/today" class:on={current === 'today'} aria-current={on('today')}><Icon name="home" />Today</a>
      <div class="glabel"><i style="background:var(--accent)"></i>Advisory · {className}</div>
      <a class="sub" href="#/seat" class:on={current === 'seat'} aria-current={on('seat')}><Icon name="seat" />Seat plan</a>
      <a class="sub" href="#/attendance" class:on={current === 'attendance'} aria-current={on('attendance')}><Icon name="cal" />Attendance</a>
      <a class="sub" href="#/students" class:on={current === 'students'} aria-current={on('students')}><Icon name="users" />Students</a>
      <a class="sub" href="#/grades" class:on={current === 'grades'} aria-current={on('grades')}><Icon name="chart" />Report card grades</a>
      <div class="grow">
        <button class="gtoggle" type="button" aria-expanded={classesOpen} aria-controls="clsList" onclick={() => (classesOpen = !classesOpen)}>
          <i style="background:#8E8E99"></i>My classes<svg aria-hidden="true"><use href="#i-down" /></svg></button>
        <a class="gmanage" href="#/manage" aria-label="Manage my classes" title="Manage my classes"><svg aria-hidden="true"><use href="#i-gear" /></svg></a>
      </div>
      <div id="clsList" hidden={!classesOpen}>
        {#each classes as c}
          <a class="sub" href="#/attendance"><span class="cdot" class:adv={c.advisory}></span>{c.label}{#if c.advisory}<span class="tagx">Advisory</span>{/if}</a>
        {/each}
      </div>
      <hr style="border:0;border-top:1px solid #34343B;margin:10px 8px" />
      <a href="#/reports" class:on={current === 'reports'} aria-current={on('reports')}><Icon name="file" />Reports</a>
      <a href="#/calendar" class:on={current === 'calendar'} aria-current={on('calendar')}><Icon name="cal" />School calendar</a>
      <a href="#/reader" class:on={current === 'reader'} aria-current={on('reader')}><Icon name="wifi" />Door reader</a>
      <a href="#/settings" class:on={current === 'settings'} aria-current={on('settings')}><Icon name="gear" />Settings</a>
    </nav>
    <div class="me-menu" class:open={meOpen} role="menu">
      <button role="menuitem" type="button" onclick={() => (location.hash = '#/account')}><Icon name="user" />Account</button>
      <button role="menuitem" type="button" onclick={() => (location.hash = '#/account')}><Icon name="help" />Help and feedback</button>
      {#if onsignout}<button role="menuitem" type="button" class="danger" onclick={() => { meOpen = false; onsignout?.(); }}><Icon name="logout" />Sign out</button>{/if}
    </div>
    <button class="me2" type="button" aria-haspopup="menu" aria-expanded={meOpen} onclick={() => (meOpen = !meOpen)}>
      <span class="avatar sm">{initials}</span><span><b>{userName}</b><span class="s">Adviser · {className}</span></span>
      <svg class="ico-sm chev" aria-hidden="true"><use href="#i-down" /></svg></button>
  </aside>
  <div class="wscrim" role="presentation" onclick={close}></div>
  <section class="main">
    <div class="wtop">
      <button class="iconbtn" type="button" aria-label="Open menu" aria-expanded={navOpen} onclick={() => (navOpen = !navOpen)}><Icon name="menu" cls="ico" /></button>
      <b><span class="logo">k</span>Klasilid</b>
    </div>
    {@render children?.()}
  </section>
</div>
