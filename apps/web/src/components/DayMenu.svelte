<script lang="ts">
  import { DAY_OPTIONS as OPTIONS, type DayKind } from '../lib/calendar';

  // The mockup's day menu (#dayMenu): pick what a day is.
  let { title, current, x, y, onpick, onclose }: {
    title: string; current: DayKind; x: number; y: number; onpick: (k: DayKind) => void; onclose: () => void;
  } = $props();
  let menu: HTMLDivElement;
  $effect(() => { menu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(); });
</script>

<svelte:window onclick={e => { if (!menu.contains(e.target as Node)) onclose(); }} onkeydown={e => e.key === 'Escape' && onclose()} />
<div class="daymenu open" role="menu" aria-labelledby="dmTitle" bind:this={menu} style="position:fixed;left:{x}px;top:{y}px">
  <div class="dm-title" id="dmTitle">{title}</div>
  {#each OPTIONS as [k, label, dot]}
    <button type="button" role="menuitemradio" aria-checked={current === k} class:cur={current === k} onclick={() => onpick(k)}><i class={dot}></i>{label}</button>
  {/each}
</div>
