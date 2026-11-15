<script lang="ts">
  // Icons come from the mockup's sprite, inlined in index.html (ids i-home, i-seat, …).
  let { name, cls = 'ico-sm' }: { name: string; cls?: string } = $props();
</script>

<svg class={cls} aria-hidden="true"><use href="#i-{name}" /></svg>
