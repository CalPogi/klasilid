<script lang="ts">
  import AuthShell from '../components/AuthShell.svelte';
  import PasswordInput from '../components/PasswordInput.svelte';
  import type { KlasilidDb } from '../lib/db';
  import { signIn, WRONG_LOGIN, type AuthPort, type Session } from '../lib/session';

  // Markup, sizes and copy follow the approved canvas boards "Sign in, laptop" and "Sign in, phone".
  let { db, auth, onsignedin }: { db: KlasilidDb; auth: AuthPort; onsignedin: (s: Session) => void } = $props();

  const EMPTY = 'Enter your username and password.';
  let username = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);
  let forgot = $state(false);
  const invalid = $derived(error === WRONG_LOGIN || error === EMPTY);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { error = EMPTY; return; }
    busy = true;
    error = '';
    try {
      onsignedin(await signIn(db, auth, username.trim(), password));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<AuthShell title="Sign in" sub="For advisers, parents and learners." width={380} alt={['New adviser?', '#/signup', 'Create an account']}
  phones={['phone-seats', 'phone-today']}>
  {#if error}
    <div class="si-alert alert" role="alert">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 7v6M12 17h.01"></path></svg>
      <span>{error}</span>
    </div>
  {/if}
  <form onsubmit={submit} novalidate>
    <label class="kl-label" for="siUser">Username</label>
    <input class="kl-input" id="siUser" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false"
      aria-invalid={invalid} bind:value={username} />
    <div class="prow">
      <label class="kl-label" for="siPass">Password</label>
      <button type="button" class="si-link" aria-expanded={forgot} aria-controls="siForgot" onclick={() => (forgot = !forgot)}>Forgot password?</button>
    </div>
    {#if forgot}
      <div class="forgot" id="siForgot">
        <p><b>Advisers:</b> Ask the Klasilid admin to reset it.</p>
        <p><b>Parents and learners:</b> Ask the adviser for a new login slip.</p>
      </div>
    {/if}
    <PasswordInput id="siPass" autocomplete="current-password" {invalid} bind:value={password} />
    <button type="submit" class="si-go" aria-busy={busy} disabled={busy}>
      {#if busy}<span class="kl-spin" aria-hidden="true"></span>{/if}
      {busy ? 'Signing in…' : 'Sign in'}
    </button>
  </form>
  <p class="si-note">Parents and learners: your username and password are on the login slip from the adviser.</p>
</AuthShell>

<style>
  .alert { display: flex; gap: 10px; align-items: flex-start; font-weight: 600; }
  .alert svg { flex: none; margin-top: 2px; }
  .prow { display: flex; justify-content: space-between; align-items: baseline; margin: 16px 0 6px; }
  .prow .kl-label { margin: 0; }
  .si-link { border: 0; background: none; padding: 4px 0; font: inherit; font-size: 14px; font-weight: 600; color: #B04A00; cursor: pointer; min-height: 44px; margin: -12px 0; }
  .si-link:hover { color: #8A3A00; }
  .forgot { background: #F6F6F8; border-radius: 12px; padding: 10px 14px; margin: 0 0 10px; font-size: 14px; color: #4A4A52; }
  .forgot p { margin: 2px 0; }
</style>
