<script lang="ts">
  import { createClient } from '@supabase/supabase-js';
  import Shell from './components/Shell.svelte';
  import { openDb, pendingCount } from './lib/db';
  import { supabaseRemote } from './lib/remote-supabase';
  import { go, route } from './lib/router';
  import { modeFromEnv, signOut, startSession, supabaseAuth, type Session } from './lib/session';
  import { syncOnce } from './lib/sync';
  import Attendance from './pages/Attendance.svelte';
  import Setup from './pages/Setup.svelte';
  import SignIn from './pages/SignIn.svelte';
  import Today from './pages/Today.svelte';

  const db = openDb();
  const env = import.meta.env;
  const mode = modeFromEnv(env);
  const sb = mode === 'online' ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY) : null;
  const auth = sb ? supabaseAuth(sb) : null;
  const remote = sb ? supabaseRemote(sb) : null;
  // Dev only: ?now=2026-11-13T01:00:00Z previews another moment (e.g. a school day).
  const fixed = env.DEV ? new URLSearchParams(location.search).get('now') : null;
  const now = () => (fixed ? new Date(fixed) : new Date());

  let session: Session | null = $state(null);
  let ready = $state(false);
  let classId = $state('');
  let className = $state('');
  let pending = $state(0);

  async function refresh() {
    const saved = (await db.meta.get('classId'))?.value as string | undefined;
    const cls = (saved && (await db.classes.get(saved))) || (await db.classes.filter(c => c.isAdvisory).first());
    classId = cls?.id ?? '';
    className = cls ? `Gr. ${cls.grade} ${cls.section}` : '';
    pending = await pendingCount(db);
  }
  async function sync() {
    if (remote && session && navigator.onLine) await syncOnce(db, remote, now());
    await refresh();
  }
  async function opened(s: Session | null) {
    session = s;
    if (s) {
      await sync();
      if (!classId && $route !== 'setup') go('setup');
    }
    ready = true;
  }
  startSession(db, mode).then(opened);

  $effect(() => {
    if (!remote) return;
    const t = setInterval(sync, 60_000);
    addEventListener('online', sync);
    return () => { clearInterval(t); removeEventListener('online', sync); };
  });

  async function leave() {
    if (!auth) return;
    if (pending > 0 && !confirm(`${pending} changes haven't synced yet. They stay on this device and sync next time you sign in.`)) return;
    await signOut(db, auth);
    session = null;
  }
</script>

{#if !ready}
  <p class="boot">Loading…</p>
{:else if !session && auth}
  <SignIn {db} {auth} onsignedin={opened} />
{:else if session}
  {#if mode === 'demo'}<div class="demo">Demo · data stays on this device</div>{/if}
  <Shell current={$route} {className} pendingChanges={pending} userName={session.displayName} onsignout={auth ? leave : undefined}>
    {#if $route === 'setup' || !classId}
      <Setup {db} {now} onfinish={async () => { await sync(); go('today'); }} />
    {:else if $route === 'attendance'}
      <Attendance {db} {classId} teacherId={session.userId} {now} />
    {:else}
      <Today {db} {classId} teacherId={session.userId} displayName={session.displayName} {now} />
    {/if}
  </Shell>
{/if}

<style>
  .boot { padding: 40px; color: var(--muted); }
  .demo { position: fixed; top: 0; left: 50%; transform: translateX(-50%); z-index: 40; background: var(--dark); color: var(--on-dark); font-size: 12px;
    font-weight: 700; padding: 3px 12px; border-radius: 0 0 10px 10px; }
</style>
