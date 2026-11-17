<script lang="ts">
  import type { Snippet } from 'svelte';
  import { closeOnBack } from '../lib/back';
  import { phone } from '../lib/layout';

  // The mockup's modal: .modal.open > .box. Escape or a click outside the box closes it; focus stays inside.
  // On a phone it is the mockup's bottom sheet (.scrim + .sheet with a grab bar), and back closes it.
  let { labelledby, onclose, wide = false, children }: { labelledby: string; onclose: () => void; wide?: boolean; children: Snippet } = $props();
  let box: HTMLDivElement;

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
  $effect(() => { if ($phone) return closeOnBack(onclose); });
</script>

{#if $phone}
  <div class="scrim open" role="presentation" onclick={onclose}></div>
  <div class="sheet open" class:wiz={wide} role="dialog" aria-modal="true" aria-labelledby={labelledby} tabindex="-1" onkeydown={keydown} bind:this={box}>
    <div class="grab"></div>{@render children()}
  </div>
{:else}
  <div class="modal open" role="dialog" aria-modal="true" aria-labelledby={labelledby} tabindex="-1" onkeydown={keydown}
    onclick={e => { if (e.target === e.currentTarget) onclose(); }}>
    <div class="box" class:wiz={wide} bind:this={box}>{@render children()}</div>
  </div>
{/if}
