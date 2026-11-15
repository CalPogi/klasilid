<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Route } from '../lib/router';
  import Icon from './Icon.svelte';

  let { current, className, pendingChanges, userName = '', onsignout, children }: {
    current: Route; className: string; pendingChanges: number; userName?: string; onsignout?: () => void; children?: Snippet;
  } = $props();

  // Pages built in plan 2b: shown so the layout matches the mockup, disabled until then.
  const soon = [
    { label: 'Seat plan', icon: 'seat' },
    { label: 'Students', icon: 'students' },
    { label: 'School calendar', icon: 'calendar' },
    { label: 'Settings', icon: 'settings' },
  ] as const;
  let menuOpen = $state(false);
  const on = (r: Route) => (current === r ? 'page' : undefined);
</script>

<div class="app">
  <aside class="side">
    <div class="brand"><span class="logo">K</span>Klasilid</div>
    <nav class="snav" aria-label="Main">
      <a href="#/today" class:on={current === 'today'} aria-current={on('today')}><Icon name="today" />Today</a>
      <div class="grp">Advisory · {className}</div>
      <a class="sub" href="#/attendance" class:on={current === 'attendance'} aria-current={on('attendance')}><Icon name="attendance" />Attendance</a>
      {#each soon as s}
        <button class="sub soon" disabled title="Coming soon"><Icon name={s.icon} />{s.label}</button>
      {/each}
    </nav>
    {#if pendingChanges > 0}
      <p class="pending">{pendingChanges} changes waiting to sync</p>
    {/if}
    {#if onsignout}<button class="signout" type="button" onclick={onsignout}>Sign out{userName ? ` · ${userName}` : ''}</button>{/if}
  </aside>

  <main class="main">{@render children?.()}</main>

  <nav class="fnav" aria-label="Phone">
    <a href="#/today" class:on={current === 'today'} aria-current={on('today')}><Icon name="today" /><span>Today</span></a>
    <a href="#/attendance" class:on={current === 'attendance'} aria-current={on('attendance')}><Icon name="attendance" /><span>Attendance</span></a>
    <button aria-expanded={menuOpen} aria-controls="mdrop" onclick={() => (menuOpen = !menuOpen)}>
      <span class="burger" class:open={menuOpen} aria-hidden="true"><i></i><i></i><i></i></span><span>Menu</span>
    </button>
  </nav>
  {#if menuOpen}
    <div id="mdrop" class="mdrop" role="menu">
      {#each soon as s}
        <button role="menuitem" disabled title="Coming soon"><Icon name={s.icon} />{s.label}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .app { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 20px; padding: 20px; min-height: 100vh; background: var(--bg); }
  .side { background: var(--dark); color: var(--on-dark); border-radius: var(--r-xl); padding: 20px 14px 14px; display: flex; flex-direction: column;
    position: sticky; top: 20px; align-self: start; height: calc(100vh - 40px); max-height: 910px; box-shadow: var(--shadow-float); }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 17px; letter-spacing: -.02em; padding: 0 8px 20px; }
  .logo { width: 36px; height: 36px; border-radius: 11px; background: var(--accent); color: var(--on-accent); display: grid; place-items: center; }
  .snav a, .snav button { display: flex; align-items: center; gap: 12px; width: 100%; height: 42px; padding: 0 12px;
    border: 0; background: none; border-radius: 14px; color: var(--on-dark-muted); text-decoration: none; font: inherit; font-weight: 600; font-size: 14px;
    margin-bottom: 2px; cursor: pointer; transition: background var(--t-fast), color var(--t-fast); }
  .snav a:hover { background: var(--dark-2); color: var(--on-dark); }
  .snav .on { background: var(--accent); color: var(--on-accent); }
  .snav .on:hover { background: var(--accent); color: var(--on-accent); }
  .snav .sub { height: 38px; padding-left: 16px; }
  .snav .soon { opacity: .45; cursor: not-allowed; }
  .grp { font-size: 12.5px; color: #9C9CA6; padding: 14px 12px 6px; font-weight: 700; }
  .pending { margin: auto 0 0; background: var(--dark-2); border-radius: 14px; padding: 12px; font-size: 13px; color: var(--on-dark-muted); }
  .signout { margin-top: 8px; min-height: 44px; border: 0; border-radius: 14px; background: var(--dark-2); color: var(--on-dark); font-weight: 600; cursor: pointer; }
  .main { min-width: 0; }
  .fnav, .mdrop { display: none; }

  @media (max-width: 860px) {
    .app { grid-template-columns: minmax(0, 1fr); padding: 12px 12px 104px; }
    .side { display: none; }
    .fnav { display: flex; position: fixed; left: 12px; right: 12px; bottom: 14px; z-index: 10; background: var(--dark); border-radius: 26px;
      padding: 8px; gap: 6px; box-shadow: var(--shadow-float); }
    .fnav a, .fnav button { flex: 1; min-height: 52px; display: flex; align-items: center; justify-content: center; gap: 8px; border: 0; background: none;
      color: var(--on-dark-muted); font: inherit; font-weight: 700; font-size: 14px; border-radius: 18px; text-decoration: none; cursor: pointer; }
    .fnav .on { background: var(--accent); color: var(--on-accent); }
    .burger { position: relative; width: 18px; height: 14px; display: block; }
    .burger i { position: absolute; left: 0; right: 0; height: 2px; border-radius: 2px; background: currentColor;
      transition: transform 220ms var(--ease), opacity 150ms ease, top 220ms var(--ease); }
    .burger i:nth-child(1) { top: 0; }
    .burger i:nth-child(2) { top: 6px; }
    .burger i:nth-child(3) { top: 12px; }
    .burger.open i:nth-child(1) { top: 6px; transform: rotate(45deg); }
    .burger.open i:nth-child(2) { opacity: 0; }
    .burger.open i:nth-child(3) { top: 6px; transform: rotate(-45deg); }
    .mdrop { display: block; position: fixed; right: 16px; bottom: 92px; width: 220px; background: var(--surface); border-radius: 16px; padding: 6px;
      z-index: 11; box-shadow: 0 18px 40px -12px rgba(0, 0, 0, .45); border: 1px solid var(--line); }
    .mdrop button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 0 12px; border: 0; border-radius: 10px;
      background: none; font: inherit; font-size: 15px; font-weight: 600; color: var(--ink); opacity: .5; text-align: left; }
  }
  @media (max-width: 380px) { .fnav a span { display: none; } .fnav a.on span { display: inline; } }
  @media (prefers-reduced-motion: reduce) { .burger i { transition: none; } }
</style>
