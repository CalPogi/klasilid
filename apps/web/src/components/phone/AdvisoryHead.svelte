<script lang="ts">
  import type { Snippet } from 'svelte';

  // The mockup's Advisory header: class name, "Your advisory class · N learners", and the four tabs (.ctabs.m).
  type Tab = 'seat' | 'attendance' | 'students' | 'grades';
  let { className, count, tab, right }: { className: string; count: number; tab: Tab; right?: Snippet } = $props();
  const TABS: [Tab, string][] = [['seat', 'Seat plan'], ['attendance', 'Attendance'], ['students', 'Students'], ['grades', 'Report card']];
</script>

<div class="hrow">
  <span class="spacer44"></span>
  <div style="text-align:center"><b style="font-size:16px">{className}</b>
    <p class="eyebrowless" style="font-size:12.5px;margin:0">Your advisory class · {count} learners</p></div>
  {#if right}{@render right()}{:else}<span class="spacer44"></span>{/if}
</div>
<div class="ctabs m" role="tablist">
  {#each TABS as [t, label]}
    <button type="button" class:on={t === tab} aria-current={t === tab ? 'page' : undefined} onclick={() => (location.hash = '#/' + t)}>{label}</button>
  {/each}
</div>
