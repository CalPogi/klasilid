<script lang="ts">
  import type { SupabaseClient } from '@supabase/supabase-js';
  import Logo from '../../components/Logo.svelte';
  import { startSetup, verifyCode } from '../../lib/admin';

  // Markup, sizes and copy follow the approved board docs/mockup/admin/TwoStep.dc.html (laptop and phone).
  let { sb, need, ondone, onsignout }: { sb: SupabaseClient; need: 'setup' | 'code'; ondone: () => void; onsignout: () => void } = $props();

  const WRONG = 'That code isn’t right, or it changed. Type the code the app shows now.';
  let code = $state('');
  let error = $state('');
  let busy = $state(false);
  let setup: { factorId: string; qr: string; secret: string } | null = $state(null);

  $effect(() => {
    if (need !== 'setup') return;
    startSetup(sb).then(s => (setup = s), e => (error = e instanceof Error ? e.message : String(e)));
  });

  const grouped = (s: string) => s.replace(/(.{4})(?=.)/g, '$1 ');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) { error = WRONG; return; }
    busy = true;
    error = '';
    try {
      if (await verifyCode(sb, need === 'setup' ? (setup?.factorId ?? null) : null, code.trim())) ondone();
      else error = WRONG;
    } catch {
      error = "Can't reach Klasilid right now. Check the internet and try again.";
    } finally {
      busy = false;
    }
  }
</script>

<div class="kl-page">
  <main class="kl-main">
    <div class="kl-box">
      <div class="brand"><Logo size={40} /><span>Klasilid</span><span class="badge">Admin</span></div>
      {#if need === 'setup'}
        <h1>Turn on two-step sign-in</h1>
        <p class="sub" style="margin-bottom:18px">The admin section needs a code from your phone as well as your password. You set this up once.</p>
        <ol class="steps">
          <li><b class="n">1</b><span>Install an authenticator app, like Google Authenticator.</span></li>
          <li><b class="n">2</b><span>In the app, add an account and scan this code.</span></li>
          <li><b class="n">3</b><span>Type the 6-digit code the app shows.</span></li>
        </ol>
        <div class="qr">
          {#if setup}<img src={setup.qr} alt="QR code to scan with the authenticator app" width="168" height="168" />{:else}<span class="qr-wait">Loading…</span>{/if}
        </div>
        {#if setup}<p class="key">Can’t scan? Enter this key in the app:<br /><b>{grouped(setup.secret)}</b></p>{/if}
      {:else}
        <h1>Enter your code</h1>
        <p class="sub">Open your authenticator app and type the 6-digit code for Klasilid.</p>
      {/if}

      {#if error}
        <div class="alert" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 7v6M12 17h.01"></path></svg>
          <span>{error}</span>
        </div>
      {/if}

      <form onsubmit={submit} novalidate>
        <label class="label" for="tsCode">6-digit code</label>
        <input class="code" id="tsCode" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
          aria-invalid={error === WRONG} bind:value={code} />
        <button type="submit" class="go" aria-busy={busy} disabled={busy || (need === 'setup' && !setup)}>
          {need === 'setup' ? 'Turn on two-step sign-in' : 'Continue'}
        </button>
      </form>

      {#if need === 'code'}
        <details class="lost"><summary>Lost your phone?</summary><p>In the Supabase dashboard, open Authentication, find your owner account and remove its two-step factor. Then sign in again here and set it up on your new phone.</p></details>
      {/if}
      <p class="out"><button type="button" class="link" onclick={onsignout}>Sign out</button></p>
    </div>
  </main>
</div>

<style>
  .kl-page { container-type: inline-size; width: 100%; min-height: 100vh; box-sizing: border-box; background: #FFFFFF; color: #16161A;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 16px; line-height: 1.5; display: flex; flex-direction: column; }
  .kl-main { flex: 1; box-sizing: border-box; padding: 40px 16px 16px; display: flex; align-items: center; justify-content: center; }
  .kl-box { width: 400px; max-width: 100%; box-sizing: border-box; border: 1px solid #E4E4E9; border-radius: 20px; padding: 32px 32px 28px; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 26px; letter-spacing: -.04em; font-weight: 800; }
  .badge { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 11px; background: #FF7A1A; font-size: 11.5px; font-weight: 800; letter-spacing: 0; }
  h1 { margin: 26px 0 4px; font-size: 24px; letter-spacing: -.02em; font-weight: 800; }
  .sub { margin: 0 0 20px; font-size: 15px; color: #6B6B74; }
  .steps { margin: 0 0 18px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; font-size: 14.5px; color: #4A4A52; }
  .steps li { display: flex; gap: 10px; align-items: flex-start; }
  .steps .n { flex: none; width: 24px; height: 24px; border-radius: 50%; background: #16161A; color: #FFFFFF; font-size: 12.5px; display: grid; place-items: center; }
  .qr { display: flex; justify-content: center; margin: 0 0 10px; }
  .qr img, .qr-wait { width: 168px; height: 168px; border-radius: 14px; }
  .qr-wait { border: 2px dashed #D5D5DC; box-sizing: border-box; display: grid; place-items: center; font-size: 13px; color: #6B6B74; }
  .key { margin: 0 0 18px; font-size: 13px; color: #4A4A52; text-align: center; }
  .key b { font-size: 14px; letter-spacing: .06em; color: #16161A; }
  .alert { display: flex; gap: 10px; align-items: flex-start; background: #FDEBEC; color: #B0202C; border-radius: 12px; padding: 12px 14px; margin: 0 0 18px; font-size: 14px; font-weight: 600; }
  .alert svg { flex: none; margin-top: 2px; }
  form { display: flex; flex-direction: column; }
  .label { display: block; font-size: 14px; font-weight: 700; margin: 0 0 6px; }
  .code { box-sizing: border-box; width: 100%; height: 56px; border: 1.5px solid #D5D5DC; border-radius: 12px; padding: 0 14px; font: inherit; font-size: 24px;
    font-weight: 700; letter-spacing: .3em; text-align: center; font-variant-numeric: tabular-nums; background: #FFFFFF; color: #16161A; }
  .code:focus { border-color: #16161A; }
  .code[aria-invalid='true'] { border-color: #D92D3A; }
  .go { margin-top: 22px; width: 100%; height: 48px; border: 0; border-radius: 12px; background: #FF7A1A; color: #16161A; font: inherit; font-size: 16px; font-weight: 700; cursor: pointer; }
  .go:disabled { opacity: .7; cursor: default; }
  .lost { margin-top: 16px; font-size: 14px; color: #4A4A52; }
  .lost summary { cursor: pointer; font-weight: 600; padding: 8px 0; }
  .lost p { margin: 4px 0 0; }
  .out { margin: 14px 0 0; text-align: center; }
  .link { border: 0; background: none; font: inherit; font-size: 14px; font-weight: 600; color: #B04A00; cursor: pointer; padding: 8px 2px; min-height: 44px; }
  .link:hover { color: #8A3A00; }
  :is(.go, .link, .code, summary):focus-visible { outline: 3px solid #FF7A1A; outline-offset: 2px; }
  @container (max-width: 760px) { .kl-box { border-color: transparent; padding: 8px 4px 4px; } .kl-main { padding-top: 20px; } }
</style>
