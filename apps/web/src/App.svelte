<script lang="ts">
  import Shell from './components/Shell.svelte';
  import { route } from './lib/router';
</script>

<Shell current={$route} className="Gr. 6 Diamond" pendingChanges={0}>
  <h1>{$route}</h1>
</Shell>
