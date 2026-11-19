<script lang="ts">
  import type { SupabaseClient } from '@supabase/supabase-js';
  import Icon from '../../components/Icon.svelte';
  import Logo from '../../components/Logo.svelte';
  import { adminCall, AdminError, OFFLINE, OWNER_ONLY, twoStepNeed, type Overview } from '../../lib/admin';
  import { closeOnBack } from '../../lib/back';
  import { phone } from '../../lib/layout';
  import AdminReaders from './AdminReaders.svelte';
  import TwoStep from './TwoStep.svelte';

  // The owner's admin section (docs/2026-11-19-admin-design.md). Online only: nothing here touches the device's
  // offline database. Layout follows the approved boards docs/mockup/admin/Admin.dc.html (laptop) and AdminPhone.dc.html.
  let { sb, onsignout, now = () => new Date() }: { sb: SupabaseClient; onsignout: () => void; now?: () => Date } = $props();

  type Tab = 'schools' | 'teachers' | 'readers';
  const TABS: [Tab, string, string][] = [['schools', 'school', 'Schools'], ['teachers', 'users', 'Teachers'], ['readers', 'wifi', 'Readers']];
  let stage: 'check' | 'setup' | 'code' | 'ready' | 'offline' = $state('check');
  let tab: Tab = $state('readers');
  let overview: Overview | null = $state(null);
  let menu = $state(false);
  $effect(() => { if (menu) return closeOnBack(() => (menu = false)); });

  /** One admin action. A refused second step goes back to the code screen; a non-owner is signed out. */
  async function call<T>(action: string, body: object = {}): Promise<T> {
    try {
      return await adminCall<T>(sb, action, body);
    } catch (e) {
      if (e instanceof AdminError && e.status === 403) {
        if (e.message === OWNER_ONLY) onsignout();
        else stage = (await twoStepNeed(sb).catch(() => 'code')) === 'setup' ? 'setup' : 'code';
      }
      throw e;
    }
  }

  async function load() {
    try {
      overview = await call<Overview>('overview');
      stage = 'ready';
    } catch (e) {
      if (!(e instanceof AdminError && e.status === 403)) stage = 'offline';
    }
  }

  async function start() {
    const need = await twoStepNeed(sb).catch(() => null);
    if (need === null) stage = 'offline';
    else if (need === 'done') await load();
    else stage = need;
  }
  start();

  function signout() { menu = false; onsignout(); }
</script>

{#snippet section()}
  {#if stage === 'offline' || !overview}
    <div class="note adm-off" role="status"><span>{OFFLINE}</span><button type="button" class="btn" onclick={() => { stage = 'check'; start(); }}>Retry</button></div>
  {:else if tab === 'readers'}
    <AdminReaders {overview} {call} {now} onchange={load} />
  {/if}
{/snippet}

{#if stage === 'setup' || stage === 'code'}
  <TwoStep {sb} need={stage} ondone={load} onsignout={signout} />
{:else if stage === 'check'}
  <p class="boot">Loading…</p>
{:else if $phone}
  <div class="phone app-phone adm" id="tp">
    <div class="scr screen on">{@render section()}</div>
    <div class="mdrop-catch" class:open={menu} role="presentation" onclick={() => (menu = false)}></div>
    <div class="mdrop" class:open={menu} role="menu" aria-label="Menu" inert={!menu}>
      <button role="menuitem" type="button" class="danger" onclick={signout}><Icon name="logout" />Sign out</button>
    </div>
    <nav class="fnav" aria-label="Admin">
      {#each TABS as [t, icon, label] (t)}
        <button type="button" class:on={tab === t} aria-current={tab === t ? 'page' : undefined} onclick={() => { menu = false; tab = t; }}>
          <Icon name={icon} cls="ico" /><span>{label}</span></button>
      {/each}
      <button type="button" aria-haspopup="menu" aria-expanded={menu} aria-label="Menu" onclick={() => (menu = !menu)}>
        <span class="burger" aria-hidden="true"><i></i><i></i><i></i></span><span>Menu</span></button>
    </nav>
    <div class="homebar"></div>
  </div>
{:else}
  <div class="app full adm">
    <aside class="side">
      <div class="brand"><Logo size={36} />Klasilid<span class="badge">Admin</span></div>
      <nav aria-label="Admin">
        {#each TABS as [t, icon, label] (t)}
          <a href="#/admin" class:on={tab === t} aria-current={tab === t ? 'page' : undefined}
            onclick={e => { e.preventDefault(); tab = t; }}><Icon name={icon} />{label}</a>
        {/each}
      </nav>
      <div style="flex:1"></div>
      <div class="me-menu" class:open={menu} role="menu">
        <button role="menuitem" type="button" class="danger" onclick={signout}><Icon name="logout" />Sign out</button>
      </div>
      <button type="button" class="me2" aria-haspopup="menu" aria-expanded={menu} onclick={() => (menu = !menu)}>
        <span class="avatar sm">KO</span><span><b>Klasilid owner</b><span class="s">Admin · two-step on</span></span><Icon name="down" cls="ico-sm chev" /></button>
    </aside>
    <section class="main">{@render section()}</section>
  </div>
{/if}
