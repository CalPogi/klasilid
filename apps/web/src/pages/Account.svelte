<script lang="ts">
  import type { KlasilidDb } from '../lib/db';
  import { saveDisplayName, type AuthPort, type Session } from '../lib/session';

  // Markup follows the mockup's Account page.
  let { db, auth, session, school, onrenamed }: {
    db: KlasilidDb; auth: AuthPort | null; session: Session; school: string; onrenamed: (name: string) => void;
  } = $props();

  const off = $derived(!auth || session.mode === 'demo');
  let name = $state(session.displayName);
  let email = $state('');
  let current = $state('');
  let next = $state('');
  let profileMsg = $state('');
  let pwMsg = $state('');
  let pwErr = $state(false);
  const initials = $derived(name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());

  async function saveProfile() {
    profileMsg = '';
    if (name.trim() && name.trim() !== session.displayName) {
      await saveDisplayName(db, session.userId, name.trim());
      onrenamed(name.trim());
    }
    if (email.trim()) {
      try { await auth?.setEmail?.(email.trim()); } catch (e) { profileMsg = e instanceof Error ? e.message : String(e); return; }
    }
    profileMsg = 'Profile saved';
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
</script>

<div class="page on" data-page="account">
  <div class="cls-head"><div><h2>Account</h2><p>Your sign-in and profile.</p></div></div>
  {#if off}<div class="warn" style="display:flex;margin-bottom:12px" role="status">Accounts work once Klasilid is online.</div>{/if}
  <div class="grid2">
    <div class="panel">
      <div class="who" style="display:flex;gap:14px;align-items:center;margin-bottom:12px"><div class="avatar" style="width:56px;height:56px;font-size:18px">{initials}</div>
        <div><b style="font-size:18px;display:block">{name}</b><span class="sub2">Teacher{school ? ` · ${school}` : ''}</span></div></div>
      <div class="fld"><label for="acName">Display name</label><input id="acName" bind:value={name} disabled={off} /></div>
      <div class="fld"><label for="acUser">Username</label><input id="acUser" value={session.username ?? ''} readonly autocomplete="username" /></div>
      <div class="fld"><label for="acMail">Email for password resets</label><input id="acMail" type="email" placeholder="name@deped.gov.ph" autocomplete="email" bind:value={email} disabled={off} /></div>
      {#if profileMsg}<p class="sub2" role="status">{profileMsg}</p>{/if}
      <button class="btn mt4" type="button" style="width:auto;padding:0 20px" disabled={off} onclick={saveProfile}>Save</button>
    </div>
    <div class="panel">
      <h3 style="margin:0 0 6px;font-size:17px">Password</h3>
      <div class="fld"><label for="acP0">Current password</label><input id="acP0" type="password" autocomplete="current-password" bind:value={current} disabled={off} /></div>
      <div class="fld"><label for="acP1">New password</label><input id="acP1" type="password" autocomplete="new-password" bind:value={next} disabled={off} /><div class="help">At least 8 characters.</div></div>
      {#if pwMsg}<p class={pwErr ? 'win-err' : 'sub2'} role="status">{pwMsg}</p>{/if}
      <button class="btn ghost mt4" type="button" style="width:auto;padding:0 20px" disabled={off} onclick={changePassword}>Change password</button>
    </div>
  </div>
</div>
