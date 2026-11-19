<script lang="ts">
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';

  // A code, key or pairing code shown this once (admin boards: "Reader key shown once", "New school code shown once").
  // `value` is what Copy puts on the clipboard; `display` (optional) is how it reads on screen.
  let { title, meta, warn, rows, done, ondone }: {
    title: string; meta: string; warn: string; rows: { label: string; value: string; display?: string; big?: boolean }[];
    done: string; ondone: () => void;
  } = $props();
  const copy = (v: string) => navigator.clipboard?.writeText(v).catch(() => {});
</script>

<Modal labelledby="soTitle" onclose={ondone}>
  <h4 id="soTitle">{title}</h4>
  <div class="meta">{meta}</div>
  <div class="warn"><svg class="ico-sm" aria-hidden="true"><use href="#i-lock" /></svg><span>{warn}</span></div>
  {#each rows as r}
    <div class="secret"><div><span>{r.label}</span><b class:big={r.big}>{r.display ?? r.value}</b></div>
      <button type="button" class="cpy" aria-label="Copy {r.label.toLowerCase()}" onclick={() => copy(r.value)}><Icon name="copy" /></button></div>
  {/each}
  <div class="actions one"><button type="button" class="btn" onclick={ondone}>{done}</button></div>
</Modal>
