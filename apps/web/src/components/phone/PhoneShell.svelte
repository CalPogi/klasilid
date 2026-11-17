<script lang="ts">
  import type { Snippet } from 'svelte';
  import { closeOnBack } from '../../lib/back';
  import type { Route } from '../../lib/router';
  import Icon from '../Icon.svelte';

  // The mockup's teacher phone (#tp) without its frame: screens, the menu (.mdrop) and the bottom bar (.fnav).
  let { current, onsignout, children }: { current: Route; onsignout?: () => void; children: Snippet } = $props();

  const ADVISORY: Route[] = ['seat', 'attendance', 'students', 'grades', 'student', 'day', 'seat-edit'];
  const TABS: [Route, string, string][] = [['today', 'home', 'Home'], ['seat', 'users', 'Advisory'], ['classes', 'book', 'Classes'], ['reports', 'file', 'Reports']];
  const on = (r: Route) => (r === 'seat' ? ADVISORY.includes(current) : r === current);
  /** Screens reached from the menu light up Menu, as in the mockup. */
  const inMenu = $derived((['account', 'settings', 'calendar', 'reader'] as Route[]).includes(current));
  let menu = $state(false);
  $effect(() => { if (menu) return closeOnBack(() => (menu = false)); });
  // Replacing the menu's history entry means back from the new screen returns to the old one, not to the menu.
  function open(r: Route) { location.replace('#/' + r); menu = false; }
</script>

<div class="phone app-phone" id="tp" class:editing={current === 'seat-edit'}>
  {@render children()}
  <div class="mdrop-catch" class:open={menu} role="presentation" onclick={() => (menu = false)}></div>
  <div class="mdrop" class:open={menu} role="menu" aria-label="Menu">
    <button role="menuitem" type="button" onclick={() => open('account')}><Icon name="user" cls="ico-sm" />Profile</button>
    <button role="menuitem" type="button" onclick={() => open('settings')}><Icon name="gear" cls="ico-sm" />Settings</button>
    <button role="menuitem" type="button" onclick={() => open('calendar')}><Icon name="cal" cls="ico-sm" />School calendar</button>
    <hr />
    <button role="menuitem" type="button" onclick={() => open('account')}><Icon name="help" cls="ico-sm" />Help and feedback</button>
    {#if onsignout}<button role="menuitem" type="button" class="danger" onclick={() => { menu = false; onsignout?.(); }}><Icon name="logout" cls="ico-sm" />Sign out</button>{/if}
  </div>
  {#if current !== 'seat-edit'}<!-- the seat editor's Cancel / Save bar takes its place (mockup .phone.editing) -->
  <nav class="fnav" aria-label="Main">
    {#each TABS as [r, icon, label]}
      <button type="button" class:on={on(r)} aria-current={on(r) ? 'page' : undefined} aria-label={label} onclick={() => (location.hash = '#/' + r)}>
        <Icon name={icon} cls="ico" /><span>{label}</span></button>
    {/each}
    <button type="button" class:on={inMenu} aria-haspopup="menu" aria-expanded={menu} aria-label="Menu" onclick={() => (menu = !menu)}>
      <span class="burger" aria-hidden="true"><i></i><i></i><i></i></span><span>Menu</span></button>
  </nav>
  {/if}
  <div class="homebar"></div>
</div>
