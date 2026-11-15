<script lang="ts">
  import { createClient } from '@supabase/supabase-js';
  import Shell from './components/Shell.svelte';
  import { openDb, pendingCount } from './lib/db';
  import { supabaseRemote } from './lib/remote-supabase';
  import { go, route, SOON, type SoonRoute } from './lib/router';
  import { dbName, modeFromEnv, signOut, startSession, supabaseAuth, type Session } from './lib/session';
  import { syncOnce } from './lib/sync';
  import Attendance from './pages/Attendance.svelte';
  import SeatPlan from './pages/SeatPlan.svelte';
  import Students from './pages/Students.svelte';
  import Calendar from './pages/Calendar.svelte';
  import Settings from './pages/Settings.svelte';
  import Account from './pages/Account.svelte';
  import { DEFAULT_SCHOOL } from './lib/setup';
  import { applyTheme, savedTheme } from './lib/settings';
  import RegisterCardModal from './components/RegisterCardModal.svelte';
  import type { LLearner } from './lib/db';
  import Setup from './pages/Setup.svelte';
  import SignIn from './pages/SignIn.svelte';
  import Soon from './pages/Soon.svelte';
  import Today from './pages/Today.svelte';

  import type { AuthPort, Mode } from './lib/session';
  import type { KlasilidDb } from './lib/db';
  import type { Remote } from './lib/sync';

  // Tests pass their own pieces; the real app builds them from the environment.
  let { deps }: { deps?: { db: KlasilidDb; mode: Mode; auth: AuthPort | null; remote: Remote | null } } = $props();
  const env = import.meta.env;
  const mode = deps?.mode ?? modeFromEnv(env);
  const db = deps?.db ?? openDb(dbName(mode));
  const sb = !deps && mode === 'online' ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY) : null;
  const auth = deps ? deps.auth : sb ? supabaseAuth(sb) : null;
  const remote = deps ? deps.remote : sb ? supabaseRemote(sb, db) : null;
  // Dev only: ?now=2026-11-13T01:00:00Z previews another moment (e.g. a school day).
  const fixed = env.DEV ? new URLSearchParams(location.search).get('now') : null;
  const now = () => (fixed ? new Date(fixed) : new Date());

  applyTheme(savedTheme());
  let session: Session | null = $state(null);
  let ready = $state(false);
  let classId = $state('');
  let className = $state('');
  let schoolYearId = $state('');
  let pending = $state(0);
  let firstSyncFailed = $state(false);
  let registering: { learners: LLearner[]; bulk: boolean } | undefined = $state();
  let pageKey = $state(0); // remount the page after a registration so it shows the new card

  /** One learner, or everyone enrolled without an active card, in name order. */
  async function register(t: { learner?: LLearner; bulk?: boolean }) {
    if (t.learner) { registering = { learners: [t.learner], bulk: false }; return; }
    const carded = new Set((await db.cards.toArray()).filter(c => c.active).map(c => c.learnerId));
    const enrolled = (await db.enrollments.where('classId').equals(classId).toArray()).filter(e => !e.leftOn).map(e => e.learnerId);
    const learners = (await db.learners.bulkGet(enrolled)).filter((l): l is LLearner => !!l && !carded.has(l.id))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    registering = { learners, bulk: true };
  }

  async function refresh() {
    const saved = (await db.meta.get('classId'))?.value as string | undefined;
    const cls = (saved && (await db.classes.get(saved))) || (await db.classes.filter(c => c.isAdvisory).first());
    classId = cls?.id ?? '';
    className = cls ? `Gr. ${cls.grade} ${cls.section}` : '';
    schoolYearId = cls?.schoolYearId ?? '';
    pending = await pendingCount(db);
  }
  async function sync(): Promise<boolean> {
    const r = remote && session && navigator.onLine ? await syncOnce(db, remote, now()) : null;
    await refresh();
    return !!r?.pulled;
  }
  /** Opens from local data at once; only a device with no class yet waits for the first sync before offering setup. */
  async function opened(s: Session | null) {
    session = s;
    if (s) await refresh();
    ready = true;
    if (!s || classId) { if (s) sync(); return; }
    if (mode === 'demo' || (await sync()) || !remote) { if (!classId) go('setup'); }
    else firstSyncFailed = !classId;
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
  <Shell current={$route} {className} userName={session.displayName} onsignout={auth ? leave : undefined}
    classes={classId ? [{ label: `Advisory · ${className}`, advisory: true }] : []}>
    {#if !classId && firstSyncFailed}
      <div class="page on"><div class="cls-head"><div><h2>Connect once to load your class</h2><p>This device hasn't downloaded your class yet. Connect to the internet and it loads by itself.</p></div></div></div>
    {:else if !classId}
      <Setup {db} {now} onfinish={async () => { await refresh(); go('today'); sync(); }} />
    {:else if $route === 'setup'}
      <div class="page on"><div class="cls-head"><div><h2>Your class is already set up</h2><p>Tap times and the seat layout move to Settings in the next update.</p></div></div>
        <a class="btn ghost" href="#/today" style="width:auto;padding:0 18px">Back to Today</a></div>
    {:else if $route in SOON}
      <Soon title={SOON[$route as SoonRoute]} />
    {:else if $route === 'account'}
      <Account {db} {auth} {session} school={DEFAULT_SCHOOL} onrenamed={name => { if (session) session = { ...session, displayName: name }; }} />
    {:else if $route === 'settings'}
      <Settings {db} {classId} userId={session.userId} {now} onregister={() => register({ bulk: true })} />
    {:else if $route === 'calendar'}
      <Calendar {db} {classId} {schoolYearId} {now} />
    {:else if $route === 'students'}
      {#key pageKey}<Students {db} {classId} teacherId={session.userId} {now} {mode} onregister={register} />{/key}
    {:else if $route === 'seat'}
      <SeatPlan {db} {classId} teacherId={session.userId} {now} />
    {:else if $route === 'attendance'}
      <Attendance {db} {classId} teacherId={session.userId} {now} />
    {:else}
      {#key pageKey}<Today {db} {classId} teacherId={session.userId} displayName={session.displayName} {now} onregister={() => register({ bulk: true })} />{/key}
    {/if}
  </Shell>
  {#if registering}
    <RegisterCardModal {db} learners={registering.learners} bulk={registering.bulk} {mode} {now} poll={async () => { await sync(); }}
      onclose={() => { registering = undefined; pageKey++; }} />
  {/if}
{/if}

<style>
  .boot { padding: 40px; color: var(--muted); }
  .demo { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); z-index: 40; pointer-events: none; white-space: nowrap; background: var(--dark); color: var(--on-dark); font-size: 12px;
    font-weight: 700; padding: 3px 12px; border-radius: 10px 10px 0 0; }
</style>
