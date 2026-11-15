<script lang="ts">
  import Shell from './components/Shell.svelte';
  import { openDb } from './lib/db';
  import { go, route } from './lib/router';
  import Setup from './pages/Setup.svelte';

  const db = openDb();
</script>

<Shell current={$route} className="Gr. 6 Diamond" pendingChanges={0}>
  {#if $route === 'setup'}
    <Setup {db} now={() => new Date()} onfinish={() => go('today')} />
  {:else}
    <h1>{$route}</h1>
  {/if}
</Shell>
