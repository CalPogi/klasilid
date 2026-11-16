<script lang="ts">
  // The Ribbon K (approved brand canvas): ink tile, orange stroke, white chevron woven over it.
  let { size = 36 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style="flex:none">
  <rect width="64" height="64" rx="19" fill="#16161A"></rect>
  <path d="M22 12v40" stroke="#FF7A1A" stroke-width="10" stroke-linecap="round"></path>
  <path d="M45 13L25 32l20 19" fill="none" stroke="#16161A" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"></path>
  <path d="M45 13L25 32l20 19" fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"></path>
</svg>
