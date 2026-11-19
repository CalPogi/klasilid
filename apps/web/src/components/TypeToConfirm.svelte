<script lang="ts">
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';

  // Retire a reader / delete an account (admin boards): the danger button stays off until `expected` is typed exactly.
  let { title, meta, warn, expected, action, onconfirm, oncancel }: {
    title: string; meta: string; warn?: string; expected: string; action: string;
    onconfirm: () => Promise<void>; oncancel: () => void;
  } = $props();
  let typed = $state('');
  let busy = $state(false);
  let error = $state('');

  async function go() {
    busy = true;
    error = '';
    try { await onconfirm(); } catch (e) { error = e instanceof Error ? e.message : String(e); } finally { busy = false; }
  }
</script>

<Modal labelledby="tcTitle" onclose={oncancel}>
  <h4 id="tcTitle">{title}</h4>
  <div class="meta">{meta}</div>
  {#if warn}<div class="warn"><Icon name="info" /><span>{warn}</span></div>{/if}
  <div class="fld"><label for="tcIn">Type {expected} to confirm</label>
    <input id="tcIn" autocomplete="off" autocapitalize="none" spellcheck="false" bind:value={typed} /></div>
  {#if error}<p class="win-err" role="alert">{error}</p>{/if}
  <div class="actions"><button type="button" class="btn ghost" onclick={oncancel}>Cancel</button>
    <button type="button" class="btn danger" disabled={typed !== expected || busy} aria-busy={busy} onclick={go}>{action}</button></div>
</Modal>
