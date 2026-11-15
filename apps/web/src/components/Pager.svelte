<script lang="ts">
  let { page = $bindable(1), pages }: { page: number; pages: number } = $props();
</script>

{#if pages > 1}
  <nav class="pager" aria-label="Pages">
    <button type="button" aria-label="Previous page" disabled={page <= 1} onclick={() => page--}>‹</button>
    <span>Page {page} of {pages}</span>
    <button type="button" aria-label="Next page" disabled={page >= pages} onclick={() => page++}>›</button>
  </nav>
{/if}

<style>
  .pager { display: flex; align-items: center; gap: 10px; justify-content: flex-end; font-size: 13.5px; font-weight: 600; color: var(--muted); }
  button { width: 44px; height: 44px; border: 0; border-radius: 12px; background: var(--surface-2); color: var(--ink); font-size: 20px; cursor: pointer; }
  button:disabled { opacity: .4; cursor: not-allowed; }
</style>
