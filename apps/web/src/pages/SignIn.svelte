<script lang="ts">
  import Logo from '../components/Logo.svelte';
  import type { KlasilidDb } from '../lib/db';
  import { platform } from '../lib/native';
  import { signIn, WRONG_LOGIN, type AuthPort, type Session } from '../lib/session';

  // Markup, sizes and copy follow the approved canvas board "Sign in, laptop" / "Sign in, phone".
  let { db, auth, onsignedin }: { db: KlasilidDb; auth: AuthPort; onsignedin: (s: Session) => void } = $props();

  const EMPTY = 'Enter your username and password.';
  const DL = 'https://github.com/CalPogi/klasilid-releases/releases/latest/download/';
  const web = platform() === 'web';
  let username = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);
  let shown = $state(false);
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

<div class="kl-page">
  <main class="kl-main">
    <div class="si-col">
      <div class="kl-box si-card">
        <div class="si-brand"><Logo size={40} /><span>Klasilid</span></div>
        <h1>Sign in</h1>
        <p class="si-sub">For advisers, parents and learners.</p>
        {#if error}
          <div class="alert" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 7v6M12 17h.01"></path></svg>
            <span>{error}</span>
          </div>
        {/if}
        <form onsubmit={submit} novalidate>
          <label class="kl-label" for="siUser">Username</label>
          <input class="kl-input" class:bad={invalid} id="siUser" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false"
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
          <div class="pw">
            <input class="kl-input" class:bad={invalid} id="siPass" name="password" type={shown ? 'text' : 'password'} autocomplete="current-password"
              aria-invalid={invalid} bind:value={password} />
            <button type="button" class="eye" aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} onclick={() => (shown = !shown)}>
              {#if shown}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10 10 0 0 1 12 4c6 0 10 8 10 8a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s4 8 10 8a9.7 9.7 0 0 0 5.4-1.6"></path></svg>
              {:else}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              {/if}
            </button>
          </div>
          <button type="submit" class="go" aria-busy={busy} disabled={busy}>
            {#if busy}<span class="kl-spin" aria-hidden="true"></span>{/if}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p class="si-slip">Parents and learners: your username and password are on the login slip from the adviser.</p>
      </div>
      <div class="kl-box new">New adviser? <a href="#/signup">Create an account</a></div>
      {#if web}
        <div class="get">
          <span>Get the app</span>
          <a href="{DL}Klasilid.apk"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"></rect><path d="M11 18h2"></path></svg>Android</a>
          <a href="{DL}Klasilid-Setup.exe"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg>Windows</a>
        </div>
      {/if}
    </div>
    <div class="kl-phones" aria-hidden="true">
      <div class="ph a"><img src="./auth/phone-seats.png" alt="" /></div>
      <div class="ph b"><img src="./auth/phone-today.png" alt="" /></div>
    </div>
  </main>
  {#if web}
    <footer>
      <a href="../">About Klasilid</a>
      <a href="../#request">Request a door reader</a>
    </footer>
  {/if}
</div>

<style>
  .kl-page { container-type: inline-size; width: 100%; min-height: 100vh; box-sizing: border-box; background: #FFFFFF; color: #16161A;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 16px; line-height: 1.5; display: flex; flex-direction: column; }
  a { color: #B04A00; } a:hover { color: #8A3A00; }
  a:focus-visible, button:focus-visible, input:focus-visible { outline: 3px solid #FF7A1A; outline-offset: 2px; }
  .kl-main { flex: 1; box-sizing: border-box; padding: 40px 16px 16px; display: flex; flex-direction: row-reverse; flex-wrap: wrap; align-items: center;
    justify-content: center; gap: 32px 48px; }
  .si-col { width: 380px; max-width: 100%; display: flex; flex-direction: column; gap: 12px; }
  .kl-box { box-sizing: border-box; border: 1px solid #E4E4E9; border-radius: 20px; }
  .si-card { padding: 32px 32px 28px; }
  .si-brand { display: flex; align-items: center; gap: 12px; font-size: 26px; letter-spacing: -.04em; font-weight: 800; }
  h1 { margin: 26px 0 4px; font-size: 24px; letter-spacing: -.02em; font-weight: 800; }
  .si-sub { margin: 0 0 20px; font-size: 15px; color: #6B6B74; }
  .alert { display: flex; gap: 10px; align-items: flex-start; background: #FDEBEC; color: #B0202C; border-radius: 12px; padding: 12px 14px; margin: 0 0 18px;
    font-size: 14px; font-weight: 600; }
  .alert svg { flex: none; margin-top: 2px; }
  form { display: flex; flex-direction: column; }
  .kl-label { display: block; font-size: 14px; font-weight: 700; margin: 0 0 6px; }
  .kl-input { box-sizing: border-box; width: 100%; height: 48px; border: 1.5px solid #D5D5DC; border-radius: 12px; padding: 0 14px; font: inherit; font-size: 16px;
    background: #FFFFFF; color: #16161A; }
  .kl-input:focus { border-color: #16161A; }
  .kl-input.bad { border-color: #D92D3A; }
  .prow { display: flex; justify-content: space-between; align-items: baseline; margin: 16px 0 6px; }
  .prow .kl-label { margin: 0; }
  .si-link { border: 0; background: none; padding: 4px 0; font: inherit; font-size: 14px; font-weight: 600; color: #B04A00; cursor: pointer; min-height: 44px; margin: -12px 0; }
  .si-link:hover { color: #8A3A00; }
  .forgot { background: #F6F6F8; border-radius: 12px; padding: 10px 14px; margin: 0 0 10px; font-size: 14px; color: #4A4A52; }
  .forgot p { margin: 2px 0; }
  .pw { position: relative; }
  .pw .kl-input { padding-right: 50px; }
  .eye { position: absolute; right: 2px; top: 2px; width: 44px; height: 44px; border: 0; background: transparent; border-radius: 10px; color: #4A4A52;
    display: grid; place-items: center; cursor: pointer; }
  .go { margin-top: 22px; width: 100%; height: 48px; border: 0; border-radius: 12px; background: #FF7A1A; color: #16161A; font: inherit; font-size: 16px;
    font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; }
  .go:disabled { opacity: .7; cursor: default; }
  .kl-spin { width: 18px; height: 18px; border-radius: 50%; border: 2.5px solid rgba(22,22,26,.25); border-top-color: #16161A; animation: kl-spin .8s linear infinite; }
  @keyframes kl-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .kl-spin { animation: none; } }
  .si-slip { margin: 18px 0 0; font-size: 14px; color: #4A4A52; }
  .new { padding: 16px 20px; text-align: center; font-size: 15px; }
  .new a { font-weight: 700; text-decoration: none; display: inline-block; padding: 8px 2px; }
  .get { display: flex; justify-content: center; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
  .get span { font-size: 14px; color: #4A4A52; margin-right: 4px; }
  .get a { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; border-radius: 12px; background: #16161A; color: #FFFFFF;
    text-decoration: none; font-size: 14px; font-weight: 700; }
  .kl-phones { position: relative; width: 380px; height: 580px; flex: none; }
  .ph { position: absolute; width: 250px; border-radius: 36px; background: #16161A; padding: 9px; box-sizing: border-box; }
  .ph.a { left: 0; top: 0; box-shadow: 0 30px 60px -36px rgba(16,16,24,.5); }
  .ph.b { right: 0; top: 52px; box-shadow: 0 40px 80px -30px rgba(16,16,24,.6); }
  .ph img { display: block; width: 100%; height: auto; border-radius: 28px; }
  footer { box-sizing: border-box; padding: 16px 16px 32px; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 18px; font-size: 13px; }
  footer a { color: #6B6B74; text-decoration: none; padding: 8px 4px; }
  @container (max-width: 760px) {
    .kl-phones { display: none; }
    .kl-box { border-color: transparent; }
    .si-card { padding: 8px 4px 4px; }
    .kl-main { padding-top: 20px; }
  }
</style>
