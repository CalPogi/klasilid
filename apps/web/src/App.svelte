<script lang="ts">
  import Shell from './components/Shell.svelte';
  import { openDb, pendingCount } from './lib/db';
  import { DEMO_CLASS_ID, DEMO_TEACHER_ID, seedDemo } from './lib/demo';
  import { go, route } from './lib/router';
  import Attendance from './pages/Attendance.svelte';
  import Setup from './pages/Setup.svelte';
  import Today from './pages/Today.svelte';

  const db = openDb();
  // Dev only: ?now=2026-11-13T01:00:00Z previews another moment (e.g. a school day).
  const fixed = import.meta.env.DEV ? new URLSearchParams(location.search).get('now') : null;
  const now = () => (fixed ? new Date(fixed) : new Date());
  let ready = $state(false);
  let pending = $state(0);
  (async () => {
    if (!(await db.meta.get('demoSeeded'))) await seedDemo(db, now());
    pending = await pendingCount(db);
    ready = true;
  })();
</script>

<Shell current={$route} className="Gr. 6 Diamond" pendingChanges={pending}>
  {#if !ready}
    <p>Loading…</p>
  {:else if $route === 'setup'}
    <Setup {db} {now} onfinish={() => go('today')} />
  {:else if $route === 'attendance'}
    <Attendance {db} classId={DEMO_CLASS_ID} teacherId={DEMO_TEACHER_ID} {now} />
  {:else}
    <Today {db} classId={DEMO_CLASS_ID} teacherId={DEMO_TEACHER_ID} displayName="Ma'am" {now} />
  {/if}
</Shell>
