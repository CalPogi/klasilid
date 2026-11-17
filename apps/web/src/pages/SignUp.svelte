<script lang="ts">
  import { tick } from 'svelte';
  import AuthShell from '../components/AuthShell.svelte';
  import PasswordInput from '../components/PasswordInput.svelte';
  import { checkSignup, OLD_LINK, type SignupField, type SignupInput, type SignupResult } from '../lib/signup';

  // The canvas boards "Sign up, laptop" and "Sign up, phone" (invite-link version). The school code is not typed:
  // it comes from the adviser's invite link (`invite`), and any problem with it means the link is old or broken.
  let { invite, signup, onsignedup }: {
    invite: string;
    signup: (i: SignupInput) => Promise<SignupResult>;
    onsignedup: (i: SignupInput, r: Extract<SignupResult, { ok: true }>) => void | Promise<void>;
  } = $props();

  const IDS: Record<SignupField, string> = { code: '', displayName: 'suName', username: 'suUser', password: 'suPass' };
  const ORDER: SignupField[] = ['displayName', 'username', 'password'];
  // svelte-ignore state_referenced_locally
  let v: SignupInput = $state({ code: invite, displayName: '', username: '', password: '' });
  let errors: Partial<Record<SignupField, string>> = $state({});
  let general = $state(''); // a problem with no field: offline, too many tries
  let busy = $state(false);
  let summary: HTMLDivElement | undefined = $state();
  const listed = $derived(ORDER.filter(f => errors[f]));
  const count = $derived(listed.length + (general ? 1 : 0));

  async function show(e: typeof errors, g = '') {
    const { code, ...fields } = e;
    errors = fields;
    general = code ? OLD_LINK : g;
    await tick();
    summary?.focus();
  }
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const local = checkSignup(v);
    if (Object.keys(local).length) return show(local);
    busy = true;
    try {
      const r = await signup($state.snapshot(v));
      if (r.ok) {
        errors = {};
        general = '';
        history.replaceState(null, '', `${location.pathname}${location.search}#/signup`); // the code doesn't stay in the address bar or history
        await onsignedup($state.snapshot(v), r);
      }
      else await show(r.field ? { [r.field]: r.message } : {}, r.field ? '' : r.message);
    } finally {
      busy = false;
    }
  }
</script>

{#if !invite}
<AuthShell title="Ask for your sign-up link" width={400} alt={['Have an account?', '#/signin', 'Sign in']} phones={['phone-attendance', 'phone-seats']}
  sub="Advisers join Klasilid with a link from the Klasilid admin. Open that link on this phone or computer to create your account.">
  <p class="si-note">Parents and learners don’t sign up. They use the login slip from the adviser.</p>
</AuthShell>
{:else}
<AuthShell title="Create your adviser account" sub="Next, Klasilid helps you set up your class." width={400} alt={['Have an account?', '#/signin', 'Sign in']}
  phones={['phone-attendance', 'phone-seats']}>
  {#if count}
    <div class="si-alert" class:plain={!listed.length} role="alert" tabindex="-1" bind:this={summary}>
      {#if listed.length}
        <b>Fix {count} {count === 1 ? 'thing' : 'things'} to continue</b>
        {#if general}<span>{general}</span>{/if}
        {#each listed as f}<a href="#{IDS[f]}" onclick={ev => { ev.preventDefault(); document.getElementById(IDS[f])?.focus(); }}>{errors[f]}</a>{/each}
      {:else}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 7v6M12 17h.01"></path></svg>
        <span>{general}</span>
      {/if}
    </div>
  {/if}
  <form onsubmit={submit} novalidate>
    <label class="kl-label" for="suName">Your name in Klasilid</label>
    <input class="kl-input" id="suName" name="displayName" type="text" autocomplete="name" placeholder="e.g. Ma’am Santos"
      aria-describedby={errors.displayName ? 'suNameMsg' : undefined} aria-invalid={!!errors.displayName} bind:value={v.displayName} />
    {#if errors.displayName}<p class="kl-err" id="suNameMsg">{errors.displayName}</p>{/if}

    <label class="kl-label gap" for="suUser">Username</label>
    <input class="kl-input" id="suUser" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false"
      aria-describedby="suUserMsg" aria-invalid={!!errors.username} bind:value={v.username} />
    {#if errors.username}<p class="kl-err" id="suUserMsg">{errors.username}</p>
    {:else}<p class="kl-help" id="suUserMsg">You’ll sign in with this. Small letters, numbers and dots.</p>{/if}

    <label class="kl-label gap" for="suPass">Password</label>
    <PasswordInput id="suPass" autocomplete="new-password" describedby="suPassMsg" invalid={!!errors.password} bind:value={v.password} />
    {#if errors.password}<p class="kl-err" id="suPassMsg">{errors.password}</p>
    {:else}<p class="kl-help" id="suPassMsg">At least 8 characters.</p>{/if}

    <button type="submit" class="si-go" aria-busy={busy} disabled={busy}>
      {#if busy}<span class="kl-spin" aria-hidden="true"></span>{/if}
      {busy ? 'Creating your account…' : 'Create account'}
    </button>
  </form>
  <p class="si-note">Parents and learners don’t sign up. They use the login slip from the adviser.</p>
</AuthShell>
{/if}

<style>
  .si-alert b, .si-alert span, .si-alert a { display: block; }
  .si-alert b { margin-bottom: 4px; }
  .si-alert a { color: #B0202C; padding: 2px 0; }
  .si-alert:focus-visible { outline: 3px solid #FF7A1A; outline-offset: 2px; }
  .si-alert.plain { display: flex; gap: 10px; align-items: flex-start; font-weight: 600; }
  .si-alert.plain svg { flex: none; margin-top: 2px; }
  .gap { margin-top: 16px; }
</style>
