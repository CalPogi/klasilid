<script lang="ts">
  // Password field with the canvas's show/hide button (44 px target, aria-pressed).
  let { id, value = $bindable(''), autocomplete, invalid = false, describedby }: {
    id: string; value?: string; autocomplete: 'current-password' | 'new-password'; invalid?: boolean; describedby?: string;
  } = $props();
  let shown = $state(false);
</script>

<div class="pw">
  <input class="kl-input" {id} name="password" type={shown ? 'text' : 'password'} {autocomplete} aria-invalid={invalid} aria-describedby={describedby} bind:value />
  <button type="button" class="eye" aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} onclick={() => (shown = !shown)}>
    {#if shown}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10 10 0 0 1 12 4c6 0 10 8 10 8a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s4 8 10 8a9.7 9.7 0 0 0 5.4-1.6"></path></svg>
    {:else}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    {/if}
  </button>
</div>

<style>
  .pw { position: relative; }
  .pw input { padding-right: 50px; }
  .eye { position: absolute; right: 2px; top: 2px; width: 44px; height: 44px; border: 0; background: transparent; border-radius: 10px; color: #4A4A52;
    display: grid; place-items: center; cursor: pointer; }
</style>
