<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import Modal from '../../components/Modal.svelte';
  import ShownOnce from '../../components/ShownOnce.svelte';
  import TypeToConfirm from '../../components/TypeToConfirm.svelte';
  import { ago, shortDate, type Overview } from '../../lib/admin';
  import { phone } from '../../lib/layout';

  // Markup and copy follow the approved boards docs/mockup/admin/Admin.dc.html and AdminPhone.dc.html (Readers).
  type Reader = Overview['readers'][number];
  type Call = <T>(action: string, body?: object) => Promise<T>;
  let { overview, call, now, onchange }: { overview: Overview; call: Call; now: () => Date; onchange: () => void } = $props();

  const classes = $derived(overview.teachers.flatMap(t => t.classes.map(c => ({
    id: c.id, label: `Gr. ${c.grade} ${c.section} · ${t.displayName} · ${t.schoolName ?? 'No school'}`, name: `Gr. ${c.grade} ${c.section}`,
  }))));
  const pairing = (p: string) => `${p.slice(0, 4)} ${p.slice(4)}`;
  const WARN = 'Copy them now. They’re shown only this once and aren’t stored anywhere.';

  let adding = $state(false);
  let classId = $state('');
  let asking: Reader | null = $state(null);
  let retiring: Reader | null = $state(null);
  let shown: { title: string; meta: string; rows: { label: string; value: string; display?: string }[] } | null = $state(null);
  let busy = $state(false);
  let error = $state('');

  function openAdd() { classId = classes[0]?.id ?? ''; error = ''; adding = true; }

  async function add() {
    if (busy || !classId) return;
    busy = true;
    error = '';
    try {
      const r = await call<{ id: string; key: string; pairingCode: string }>('addReader', { classId });
      adding = false;
      shown = {
        title: `Reader ${r.id} is ready`,
        meta: `For ${classes.find(c => c.id === classId)?.name ?? 'the class'}. Type these into the reader’s setup page at 192.168.4.1.`,
        rows: [{ label: 'Reader ID', value: r.id }, { label: 'Reader key', value: r.key }, { label: 'Pairing code', value: r.pairingCode, display: pairing(r.pairingCode) }],
      };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function newKey(r: Reader) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const k = await call<{ key: string; pairingCode: string }>('newReaderKey', { readerId: r.id });
      asking = null;
      shown = {
        title: `New key for ${r.id}`,
        meta: 'On the reader’s setup page, enter the old pairing code, then these.',
        rows: [{ label: 'Reader ID', value: r.id }, { label: 'Reader key', value: k.key }, { label: 'Pairing code', value: k.pairingCode, display: pairing(k.pairingCode) }],
      };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function retire(r: Reader) {
    await call('retireReader', { readerId: r.id, confirm: r.id });
    retiring = null;
    onchange();
  }
</script>

{#if $phone}
  <div class="hrow"><div><h2 class="ptitle">Readers</h2><span class="badge">Admin</span></div>
    <button type="button" class="iconbtn" aria-label="Add reader" onclick={openAdd}><Icon name="plus" cls="ico" /></button></div>
  <div class="rows mt3">
    {#each overview.readers as r (r.id)}
      <div class="rowi" class:retired={r.retiredAt}>
        <span class="rid" aria-hidden="true"><Icon name="wifi" /></span>
        <div class="txt"><b>{r.id}</b><span>{r.retiredAt ? `Retired ${shortDate(r.retiredAt)} · taps kept` : `${r.className} · ${r.lastSeenAt ? ago(r.lastSeenAt, now()) : 'never connected'}`}</span></div>
        {#if !r.retiredAt}<div class="acts"><button type="button" class="mini-btn" onclick={() => { error = ''; asking = r; }}>New key</button>
          <button type="button" class="mini-btn danger" onclick={() => (retiring = r)}>Retire</button></div>{/if}
      </div>
    {/each}
  </div>
{:else}
  <div class="cls-head"><div><h2>Readers</h2><p>Door readers and the class each one takes attendance for.</p></div>
    <div class="hd-actions"><button type="button" class="btn" onclick={openAdd}><Icon name="plus" />Add reader</button></div></div>
  <div class="panel"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Reader</th><th>Class</th><th>School</th><th>Last connected</th><th><span class="sr">Actions</span></th></tr></thead>
    <tbody>
      {#each overview.readers as r (r.id)}
        {#if r.retiredAt}
          <tr class="retired"><td>{r.id}</td><td>{r.className} · {r.teacherName}</td><td>{r.schoolName}</td><td>Retired {shortDate(r.retiredAt)} · taps kept</td><td></td></tr>
        {:else}
          <tr><td><b>{r.id}</b></td><td>{r.className} · {r.teacherName}</td><td>{r.schoolName}</td>
            <td>{#if r.lastSeenAt}<span class="dot inl"></span>{ago(r.lastSeenAt, now())}{r.firmware ? ` · ${r.firmware}` : ''}{:else}<span class="muted">Never connected</span>{/if}</td>
            <td><div class="acts"><button type="button" class="mini-btn" onclick={() => { error = ''; asking = r; }}>New key</button>
              <button type="button" class="mini-btn danger" onclick={() => (retiring = r)}>Retire</button></div></td></tr>
        {/if}
      {/each}
    </tbody>
  </table></div></div>
{/if}

{#if adding}
  <Modal labelledby="arTitle" onclose={() => (adding = false)}>
    <h4 id="arTitle">Add a reader</h4>
    <div class="meta">Makes a reader ID, key and pairing code for one class. You type them into the reader’s setup page.</div>
    <div class="fld"><label for="arCls">Class</label>
      <select id="arCls" bind:value={classId}>{#each classes as c (c.id)}<option value={c.id}>{c.label}</option>{/each}</select></div>
    {#if error}<p class="win-err" role="alert">{error}</p>{/if}
    <div class="actions"><button type="button" class="btn ghost" onclick={() => (adding = false)}>Cancel</button>
      <button type="button" class="btn" disabled={busy || !classId} aria-busy={busy} onclick={add}>Add reader</button></div>
  </Modal>
{/if}

{#if asking}
  {@const r = asking}
  <Modal labelledby="nkTitle" onclose={() => (asking = null)}>
    <h4 id="nkTitle">Make a new key for {r.id}?</h4>
    <div class="meta">The reader stops working until you type the new key and pairing code into its setup page. Its taps are kept.</div>
    {#if error}<p class="win-err" role="alert">{error}</p>{/if}
    <div class="actions"><button type="button" class="btn ghost" onclick={() => (asking = null)}>Cancel</button>
      <button type="button" class="btn" disabled={busy} aria-busy={busy} onclick={() => newKey(r)}>Make new key</button></div>
  </Modal>
{/if}

{#if retiring}
  {@const r = retiring}
  <TypeToConfirm title="Retire reader {r.id}?" expected={r.id} action="Retire reader" oncancel={() => (retiring = null)} onconfirm={() => retire(r)}
    meta="It stops working right away. Its taps stay, so {r.className} keeps its attendance history. A retired reader can’t come back; add a new one instead." />
{/if}

{#if shown}
  <ShownOnce title={shown.title} meta={shown.meta} warn={WARN} rows={shown.rows} done="Done, I’ve copied them" ondone={() => { shown = null; onchange(); }} />
{/if}
