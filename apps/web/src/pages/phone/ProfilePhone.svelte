<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import Modal from '../../components/Modal.svelte';
  import type { KlasilidDb } from '../../lib/db';
  import { go } from '../../lib/router';
  import { saveDisplayName, type AuthPort, type Session } from '../../lib/session';

  // The mockup's phone Profile (data-screen="profile"), without the reset-email field (deferred in plan 6c).
  // Same rules and messages as the laptop Account page.
  let { db, auth, session, className = '', onrenamed }: {
    db: KlasilidDb; auth: AuthPort | null; session: Session; className?: string; onrenamed: (name: string) => void;
  } = $props();

  const off = $derived(!auth || session.mode === 'demo');
  // svelte-ignore state_referenced_locally
  let name = $state(session.displayName);
  let msg = $state('');
  let changing = $state(false);
  let current = $state('');
  let next = $state('');
  let pwMsg = $state('');
  let pwErr = $state(false);
  const initials = $derived(name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());

  async function save() {
    msg = '';
    if (name.trim() && name.trim() !== session.displayName) {
      await saveDisplayName(db, session.userId, name.trim());
      onrenamed(name.trim());
    }
    msg = 'Profile saved';
  }
  async function changePassword() {
    pwErr = true;
    if (next.length < 8) { pwMsg = 'At least 8 characters'; return; }
    if (!navigator.onLine) { pwMsg = "Can't change the password offline"; return; }
    try {
      await auth?.changePassword?.(current, next);
      pwErr = false;
      pwMsg = 'Password changed';
      current = next = '';
    } catch (e) {
      pwMsg = e instanceof Error ? e.message : String(e);
    }
  }
  const back = () => (history.length > 1 ? history.back() : go('today'));
</script>

<div class="hrow"><button class="iconbtn" type="button" aria-label="Back" onclick={back}><Icon name="back" cls="ico" /></button><b style="font-size:16px">Profile</b><span class="spacer44"></span></div>
{#if off}<div class="warn mt4" style="display:flex" role="status">Accounts work once Klasilid is online.</div>{/if}
<div class="profile-hero"><div class="avatar">{initials}</div><b>{name}</b><span>Adviser{className ? `, ${className}` : ''}</span></div>
<div class="group-title">Your details</div>
<div class="rows" style="padding:4px 16px 16px">
  <div class="fld"><label for="tpName">Display name</label><input id="tpName" bind:value={name} disabled={off} /></div>
  <div class="fld"><label for="tpUser">Username</label><input id="tpUser" value={session.username ?? ''} readonly autocomplete="username" /></div>
  {#if msg}<p class="eyebrowless" role="status" style="margin:8px 0 0">{msg}</p>{/if}
  <button class="btn mt4" type="button" disabled={off} onclick={save}>Save</button>
</div>
<div class="group-title">Security</div>
<div class="rows">
  <button class="kv kvbtn" type="button" disabled={off} onclick={() => { pwMsg = ''; changing = true; }}><div class="k"><b>Change password</b></div><Icon name="right" /></button>
</div>

{#if changing}
  <Modal labelledby="pwTitle" onclose={() => (changing = false)}>
    <h4 id="pwTitle">Change password</h4>
    <div class="fld"><label for="pw0">Current password</label><input id="pw0" type="password" autocomplete="current-password" bind:value={current} /></div>
    <div class="fld"><label for="pw1">New password</label><input id="pw1" type="password" autocomplete="new-password" bind:value={next} /><div class="help">At least 8 characters.</div></div>
    {#if pwMsg}<p class={pwErr ? 'win-err' : 'eyebrowless'} role="status">{pwMsg}</p>{/if}
    <div class="actions"><button class="btn ghost" type="button" onclick={() => (changing = false)}>Cancel</button><button class="btn" type="button" onclick={changePassword}>Change password</button></div>
  </Modal>
{/if}

<style>
  .kvbtn { width: 100%; border: 0; background: none; font: inherit; text-align: left; cursor: pointer; color: inherit; }
</style>
