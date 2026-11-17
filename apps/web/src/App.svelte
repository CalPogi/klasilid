<script lang="ts">
  import { createClient } from '@supabase/supabase-js';
  import Shell from './components/Shell.svelte';
  import { openDb, pendingCount } from './lib/db';
  import { supabaseRemote } from './lib/remote-supabase';
  import { go, inviteOf, laptopRoute, route, SOON, type Route, type SoonRoute } from './lib/router';
  import { phone } from './lib/layout';
  import PhoneApp from './pages/phone/PhoneApp.svelte';
  import { dbName, modeFromEnv, signIn, signOut, startSession, supabaseAuth, type Session } from './lib/session';
  import { syncOnce } from './lib/sync';
  import Attendance from './pages/Attendance.svelte';
  import SeatPlan from './pages/SeatPlan.svelte';
  import Students from './pages/Students.svelte';
  import Calendar from './pages/Calendar.svelte';
  import Settings from './pages/Settings.svelte';
  import Account from './pages/Account.svelte';
  import { DEFAULT_SCHOOL, type ClaimPort, type JoinSchool } from './lib/setup';
  import { signUpRemote, type SignupInput, type SignupResult } from './lib/signup';
  import SignUp from './pages/SignUp.svelte';
  import { applyTheme, savedTheme } from './lib/settings';
  import RegisterCardModal from './components/RegisterCardModal.svelte';
  import type { LLearner } from './lib/db';
  import Setup from './pages/Setup.svelte';
  import SignIn from './pages/SignIn.svelte';
  import Soon from './pages/Soon.svelte';
  import Today from './pages/Today.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import { platform } from './lib/native';
  import { findUpdate, tauriUpdateDeps, type Update } from './lib/updates';

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
  let join: JoinSchool | undefined = $state();
  let refused = $state('');
  // Online: a joining adviser's section is claimed on the server at Finish (lib/setup claimSection).
  const claim: ClaimPort | undefined = sb ? {
    rpc: async (fn, args) => ({ error: (await sb.rpc(fn, args)).error }),
    yearByLabel: async (schoolId, label) =>
      (await sb.from('school_years').select('id').eq('school_id', schoolId).eq('label', label).maybeSingle()).data?.id ?? null,
  } : undefined;
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
    join = (await db.meta.get('join'))?.value as JoinSchool | undefined;
    // With no class, say why the server turned down the last setup (e.g. the section already has an adviser).
    refused = classId ? '' : (await db.rejected.toArray()).reverse().find(r => r.op.kind === 'rpc' && r.op.fn === 'setup_class')?.error ?? '';
    pending = await pendingCount(db);
  }
  /** After a school-code sign-up: sign in, remember the school until setup finishes, then open the wizard. */
  async function signedUp(i: SignupInput, r: Extract<SignupResult, { ok: true }>) {
    const j: JoinSchool = { schoolId: r.schoolId, schoolName: r.schoolName, yearId: r.yearId };
    let s: Session;
    try {
      s = await signIn(db, auth!, i.username, i.password); // may clear this device's data, so 'join' is written after
    } catch {
      // The account exists; let her sign in by hand. ponytail: a different previous owner's data clear would drop 'join' then.
      await db.meta.put({ key: 'join', value: j });
      go('signin');
      return;
    }
    await db.meta.put({ key: 'join', value: j });
    await opened(s);
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

  // Windows and Android apps: look for a new version at start and once a day (design §4). The website skips this.
  let update: Update | null = $state(null);
  $effect(() => {
    const p = platform();
    if (deps || p === 'web') return;
    const look = async () => { update = (await findUpdate(tauriUpdateDeps(p))) ?? update; };
    look();
    const t = setInterval(look, 24 * 60 * 60 * 1000);
    return () => clearInterval(t);
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
{:else if !session && auth && $route === 'signup'}
  <SignUp invite={inviteOf(location.hash)} signup={i => signUpRemote(fetch, env.VITE_SUPABASE_URL, i)} onsignedup={signedUp} />
{:else if !session && auth}
  <SignIn {db} {auth} onsignedin={opened} />
{:else if session}
  {#if mode === 'demo'}<div class="demo">Demo · data stays on this device</div>{/if}
  {#if $phone}
    <PhoneApp current={$route} onsignout={auth ? leave : undefined} fallback={pages}
      ctx={{ db, classId, className, schoolYearId, session, mode, auth, now, register, pageKey }} />
  {:else}
    <Shell current={laptopRoute($route)} {className} userName={session.displayName} onsignout={auth ? leave : undefined}
      classes={classId ? [{ label: `Advisory · ${className}`, advisory: true }] : []}>
      {@render pages(laptopRoute($route))}
    </Shell>
  {/if}
  {#if registering}
    <RegisterCardModal {db} learners={registering.learners} bulk={registering.bulk} {mode} {now} poll={async () => { await sync(); }}
      onclose={() => { registering = undefined; pageKey++; }} />
  {/if}
{/if}

{#snippet pages(r: Route)}
  {#if session}
    {#if update}<UpdateBanner {update} />{/if}
    {#if !classId && firstSyncFailed}
      <div class="page on"><div class="cls-head"><div><h2>Connect once to load your class</h2><p>This device hasn't downloaded your class yet. Connect to the internet and it loads by itself.</p></div></div></div>
    {:else if !classId}
      <Setup {db} {now} {join} {claim} {refused} onfinish={async () => { await refresh(); go('today'); sync(); }} />
    {:else if r === 'setup'}
      <div class="page on"><div class="cls-head"><div><h2>Your class is already set up</h2><p>Tap times and the seat layout move to Settings in the next update.</p></div></div>
        <a class="btn ghost" href="#/today" style="width:auto;padding:0 18px">Back to Today</a></div>
    {:else if r in SOON}
      <Soon title={SOON[r as SoonRoute]} />
    {:else if r === 'account'}
      <Account {db} {auth} {session} school={DEFAULT_SCHOOL} onrenamed={name => { if (session) session = { ...session, displayName: name }; }} />
    {:else if r === 'settings'}
      <Settings {db} {classId} userId={session.userId} {now} onregister={() => register({ bulk: true })} />
    {:else if r === 'calendar'}
      <Calendar {db} {classId} {schoolYearId} {now} />
    {:else if r === 'students'}
      {#key pageKey}<Students {db} {classId} teacherId={session.userId} {now} {mode} onregister={register} />{/key}
    {:else if r === 'seat'}
      <SeatPlan {db} {classId} teacherId={session.userId} {now} />
    {:else if r === 'attendance'}
      <Attendance {db} {classId} teacherId={session.userId} {now} />
    {:else}
      {#key pageKey}<Today {db} {classId} teacherId={session.userId} displayName={session.displayName} {now} onregister={() => register({ bulk: true })} />{/key}
    {/if}
  {/if}
{/snippet}

<style>
  .boot { padding: 40px; color: var(--muted); }
  .demo { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); z-index: 40; pointer-events: none; white-space: nowrap; background: var(--dark); color: var(--on-dark); font-size: 12px;
    font-weight: 700; padding: 3px 12px; border-radius: 10px 10px 0 0; }
  @media (max-width: 760px), (max-height: 500px) { .demo { bottom: auto; top: 0; border-radius: 0 0 10px 10px; } }
</style>
