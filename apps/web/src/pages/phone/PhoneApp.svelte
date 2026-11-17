<script lang="ts">
  import type { Snippet } from 'svelte';
  import PhoneShell from '../../components/phone/PhoneShell.svelte';
  import type { KlasilidDb, LLearner } from '../../lib/db';
  import { hash, laptopRoute, SOON, type Route, type SoonRoute } from '../../lib/router';
  import type { AuthPort, Mode, Session } from '../../lib/session';
  import HomePhone from './HomePhone.svelte';
  import SoonPhone from './SoonPhone.svelte';

  // The phone app: the bottom-bar frame and one phone screen per route. A route without a phone screen
  // shows its laptop page (`fallback`) inside the screen area; so do setup and the "connect once" message.
  export interface PhoneCtx {
    db: KlasilidDb; classId: string; className: string; schoolYearId: string; session: Session; mode: Mode; auth: AuthPort | null;
    now: () => Date; register: (t: { learner?: LLearner; bulk?: boolean }) => void; pageKey: number;
  }
  let { current, onsignout, fallback, ctx }: { current: Route; onsignout?: () => void; fallback: Snippet<[Route]>; ctx: PhoneCtx } = $props();
</script>

<PhoneShell {current} {onsignout}>
  {#key `${$hash}|${ctx.pageKey}`}
    <div class="scr screen on">
      {#if !ctx.classId}
        {@render fallback(current)}
      {:else if current in SOON}
        <SoonPhone title={SOON[current as SoonRoute]} />
      {:else if current === 'today'}
        <HomePhone db={ctx.db} classId={ctx.classId} teacherId={ctx.session.userId} displayName={ctx.session.displayName} now={ctx.now}
          onregister={() => ctx.register({ bulk: true })} />
      {:else}
        {@render fallback(laptopRoute(current))}
      {/if}
    </div>
  {/key}
</PhoneShell>
