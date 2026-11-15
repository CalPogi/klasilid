<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let { title, onclose, children, actions }: { title: string; onclose: () => void; children: Snippet; actions?: Snippet } = $props();
  let box: HTMLDivElement;
  const titleId = 'm-' + Math.random().toString(36).slice(2);

  // Keep keyboard focus inside the dialog while it is open; Escape closes it.
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onclose(); return; }
    if (e.key !== 'Tab') return;
    const f = [...box.querySelectorAll<HTMLElement>('button:not([disabled]),select,input,textarea,a[href]')];
    if (!f.length) return;
    const [first, last] = [f[0], f[f.length - 1]];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  $effect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.querySelector<HTMLElement>('select,input,textarea,button')?.focus();
    return () => before?.focus();
  });
</script>

<div class="scrim" role="presentation" onclick={e => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabindex="-1" bind:this={box} onkeydown={keydown}>
    <header>
      <h2 id={titleId}>{title}</h2>
      <button class="close" type="button" aria-label="Close" onclick={onclose}><Icon name="close" /></button>
    </header>
    <div class="content">{@render children()}</div>
    {#if actions}<footer>{@render actions()}</footer>{/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(16, 16, 24, .45); display: grid; place-items: center; padding: 16px; z-index: 30; }
  .modal { background: var(--surface); border-radius: var(--r-xl); width: min(480px, 100%); max-height: calc(100vh - 32px); overflow: auto;
    box-shadow: var(--shadow-float); padding: 22px; display: flex; flex-direction: column; gap: 16px; }
  header { display: flex; align-items: flex-start; gap: 12px; }
  h2 { font-size: 19px; flex: 1; }
  .close { width: 44px; height: 44px; margin: -10px -10px 0 0; border: 0; border-radius: 12px; background: none; display: grid; place-items: center; cursor: pointer; color: var(--muted); }
  .close:hover { background: var(--surface-2); color: var(--ink); }
  .content { display: flex; flex-direction: column; gap: 14px; }
  footer { display: flex; gap: 10px; justify-content: flex-end; }
  @media (max-width: 600px) {
    .scrim { place-items: end center; padding: 0; }
    .modal { width: 100%; border-radius: var(--r-xl) var(--r-xl) 0 0; max-height: 92vh; }
    footer :global(.btn) { flex: 1; }
  }
</style>
