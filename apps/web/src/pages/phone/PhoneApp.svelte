<script lang="ts">
  import type { Snippet } from 'svelte';
  import PhoneShell from '../../components/phone/PhoneShell.svelte';
  import { hash, laptopRoute, SOON, type Route, type SoonRoute } from '../../lib/router';
  import SoonPhone from './SoonPhone.svelte';

  // The phone app: the bottom-bar frame and one phone screen per route. A route without a phone screen yet
  // shows its laptop page (`fallback`) inside the screen area.
  let { current, onsignout, fallback }: { current: Route; onsignout?: () => void; fallback: Snippet<[Route]> } = $props();
</script>

<PhoneShell {current} {onsignout}>
  {#key $hash}
    <div class="scr screen on">
      {#if current in SOON}
        <SoonPhone title={SOON[current as SoonRoute]} />
      {:else}
        {@render fallback(laptopRoute(current))}
      {/if}
    </div>
  {/key}
</PhoneShell>
