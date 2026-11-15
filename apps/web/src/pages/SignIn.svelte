<script lang="ts">
  import type { KlasilidDb } from '../lib/db';
  import { signIn, type AuthPort, type Session } from '../lib/session';

  let { db, auth, onsignedin }: { db: KlasilidDb; auth: AuthPort; onsignedin: (s: Session) => void } = $props();

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);
  let help = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { error = 'Enter your username and password'; return; }
    busy = true;
    error = '';
    try {
      onsignedin(await signIn(db, auth, username, password));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="web-signin">
  <form class="signin" onsubmit={submit} novalidate>
    <div class="logo-lg">k</div>
    <h1>Sign in to Klasilid</h1>
    <p class="meta">One sign-in for everyone. Klasilid opens the right view for your account.</p>
    <div class="fld"><label for="wsUser">Username</label>
      <input id="wsUser" type="text" autocomplete="username" placeholder="e.g. lou.plaza" bind:value={username} /></div>
    <div class="fld"><label for="wsPass">Password</label>
      <input id="wsPass" type="password" autocomplete="current-password" bind:value={password} /></div>
    <div class="hrow"><button type="button" class="linkbtn" onclick={() => (help = !help)}>Forgot password?</button></div>
    {#if help}<p class="note">A reset link goes to your email. Parents: ask the adviser for a new login slip.</p>{/if}
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <button class="btn" type="submit" disabled={busy}>Sign in</button>
    <p class="signin-foot">Parents and students: use the login slip from your adviser.</p>
  </form>
</div>

<style>
  .web-signin { min-height: 100vh; display: grid; place-items: center; background: var(--bg); padding: 48px 16px; }
  .signin { width: min(400px, 100%); display: flex; flex-direction: column; }
  .logo-lg { width: 56px; height: 56px; border-radius: 17px; background: var(--accent); color: var(--on-accent); display: grid; place-items: center;
    font-weight: 900; font-size: 28px; letter-spacing: -.04em; }
  h1 { font-size: 24px; letter-spacing: -.02em; margin: 18px 0 4px; }
  .meta { color: var(--muted); font-size: 14px; margin: 0 0 18px; }
  .fld { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
  .fld input { height: 48px; border: 1.5px solid var(--line); border-radius: 12px; padding: 0 12px; font-size: 15px; }
  .hrow { display: flex; justify-content: flex-end; margin-top: 10px; }
  .linkbtn { border: 0; background: none; color: var(--accent-ink); font-weight: 700; font-size: 14px; cursor: pointer; min-height: 44px; padding: 0 4px; }
  .note { margin: 0 0 8px; font-size: 13.5px; color: var(--ink-2); background: var(--surface-2); padding: 10px 12px; border-radius: 12px; }
  .err { margin: 0 0 8px; color: var(--bad-ink); font-weight: 600; font-size: 14px; }
  .btn { width: 100%; height: 52px; margin-top: 16px; }
  .signin-foot { margin-top: 18px; font-size: 13.5px; color: var(--muted); text-align: center; }
</style>
