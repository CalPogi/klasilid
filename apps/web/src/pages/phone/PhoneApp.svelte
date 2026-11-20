<script lang="ts">
  import type { Snippet } from 'svelte';
  import PhoneShell from '../../components/phone/PhoneShell.svelte';
  import type { KlasilidDb, LLearner } from '../../lib/db';
  import AdvisoryHead from '../../components/phone/AdvisoryHead.svelte';
  import { hash, laptopRoute, param, SOON, type Route, type SoonRoute } from '../../lib/router';
  import AttendancePhone from './AttendancePhone.svelte';
  import SeatEditPhone from './SeatEditPhone.svelte';
  import SeatPlanPhone from './SeatPlanPhone.svelte';
  import StudentPhone from './StudentPhone.svelte';
  import StudentsPhone from './StudentsPhone.svelte';
  import type { AuthPort, Mode, Session } from '../../lib/session';
  import CalendarPhone from './CalendarPhone.svelte';
  import HomePhone from './HomePhone.svelte';
  import ProfilePhone from './ProfilePhone.svelte';
  import SettingsPhone from './SettingsPhone.svelte';
  import SoonPhone from './SoonPhone.svelte';
  import UpdateBanner from '../../components/UpdateBanner.svelte';
  import type { Update } from '../../lib/updates';

  // The phone app: the bottom-bar frame and one phone screen per route. A route without a phone screen
  // shows its laptop page (`fallback`) inside the screen area; so do setup and the "connect once" message.
  export interface PhoneCtx {
    db: KlasilidDb; classId: string; className: string; schoolYearId: string; session: Session; mode: Mode; auth: AuthPort | null;
    now: () => Date; register: (t: { learner?: LLearner; bulk?: boolean; replace?: boolean }) => void; pageKey: number; rename: (name: string) => void;
    update: Update | null;
  }
  let { current, onsignout, fallback, ctx }: { current: Route; onsignout?: () => void; fallback: Snippet<[Route]>; ctx: PhoneCtx } = $props();
</script>

<PhoneShell {current} {onsignout}>
  {#if !ctx.classId}
    <!-- setup or "connect once": not keyed, so closing the wizard (which changes the hash) keeps what was typed -->
    <div class="scr screen on">{@render fallback(current)}</div>
  {:else}
  {#key `${$hash}|${ctx.pageKey}`}
    <div class="scr screen on">
      {#if ctx.update}<UpdateBanner update={ctx.update} />{/if}
      {#if current === 'grades'}
        <AdvisoryHead className={ctx.className} count={0} tab="grades" />
        <SoonPhone title={SOON.grades} />
      {:else if current in SOON}
        <SoonPhone title={SOON[current as SoonRoute]} />
      {:else if current === 'today'}
        <HomePhone db={ctx.db} classId={ctx.classId} teacherId={ctx.session.userId} displayName={ctx.session.displayName} now={ctx.now}
          onregister={() => ctx.register({ bulk: true })} />
      {:else if current === 'seat' || current === 'day'}
        <SeatPlanPhone db={ctx.db} classId={ctx.classId} teacherId={ctx.session.userId} now={ctx.now} date={current === 'day' ? param('date') : undefined} />
      {:else if current === 'attendance'}
        <AttendancePhone db={ctx.db} classId={ctx.classId} now={ctx.now} />
      {:else if current === 'settings'}
        <SettingsPhone db={ctx.db} classId={ctx.classId} userId={ctx.session.userId} now={ctx.now} onregister={() => ctx.register({ bulk: true })} />
      {:else if current === 'account'}
        <ProfilePhone db={ctx.db} auth={ctx.auth} session={ctx.session} className={ctx.className} onrenamed={ctx.rename} />
      {:else if current === 'calendar'}
        <CalendarPhone db={ctx.db} classId={ctx.classId} schoolYearId={ctx.schoolYearId} now={ctx.now} />
      {:else if current === 'seat-edit'}
        <SeatEditPhone db={ctx.db} classId={ctx.classId} now={ctx.now} />
      {:else if current === 'students'}
        <StudentsPhone db={ctx.db} classId={ctx.classId} teacherId={ctx.session.userId} now={ctx.now} mode={ctx.mode} onregister={ctx.register} />
      {:else if current === 'student'}
        <StudentPhone db={ctx.db} classId={ctx.classId} teacherId={ctx.session.userId} now={ctx.now} mode={ctx.mode} id={param('id')} onregister={ctx.register} />
      {:else}
        {@render fallback(laptopRoute(current))}
      {/if}
    </div>
  {/key}
  {/if}
</PhoneShell>
