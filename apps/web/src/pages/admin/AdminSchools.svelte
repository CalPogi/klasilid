<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import Modal from '../../components/Modal.svelte';
  import ShownOnce from '../../components/ShownOnce.svelte';
  import { shortDate, type Overview } from '../../lib/admin';
  import { phone } from '../../lib/layout';

  // Markup and copy follow the approved boards docs/mockup/admin/Admin.dc.html and AdminPhone.dc.html (Schools).
  type School = Overview['schools'][number];
  type Call = <T>(action: string, body?: object) => Promise<T>;
  let { overview, call, onchange }: { overview: Overview; call: Call; onchange: () => void } = $props();

  const INVITE = 'https://klasilid.pages.dev/app/#/signup?invite=';
  const NOTE = 'Codes are shown only once, when you make them. Lost one? Make a new code; the old one stops working.';
  let adding = $state(false);
  let name = $state('');
  let asking: School | null = $state(null);
  let shown: { title: string; meta: string; code: string } | null = $state(null);
  let busy = $state(false);
  let error = $state('');

  const codeState = (s: School) => (s.codeMadeAt ? `Working · made ${shortDate(s.codeMadeAt)}` : 'No code yet');

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (busy) return;
    busy = true;
    error = '';
    try { return await fn(); } catch (e) { error = e instanceof Error ? e.message : String(e); } finally { busy = false; }
  }

  async function add() {
    const n = name.trim();
    if (!n) { error = 'Enter the school name'; return; }
    const r = await run(() => call<{ schoolId: string; code: string }>('addSchool', { name: n }));
    if (!r) return;
    adding = false;
    shown = { title: `Sign-up code for ${n}`, meta: 'Give it to the school’s advisers, or send them the invite link.', code: r.code };
  }

  async function newCode(s: School) {
    const r = await run(() => call<{ code: string }>('newSchoolCode', { schoolId: s.id }));
    if (!r) return;
    asking = null;
    shown = { title: 'New sign-up code', meta: `For ${s.name}. The old code no longer works.`, code: r.code };
  }
</script>

{#if $phone}
  <div class="hrow"><div><h2 class="ptitle">Schools</h2><span class="badge">Admin</span></div>
    <button type="button" class="iconbtn" aria-label="Add school" onclick={() => { name = ''; error = ''; adding = true; }}><Icon name="plus" cls="ico" /></button></div>
  <div class="rows mt3">
    {#each overview.schools as s (s.id)}
      <div class="rowi"><span class="rid" aria-hidden="true"><Icon name="school" /></span>
        <div class="txt"><b>{s.name}</b><span>{s.advisers} advisers · {s.codeMadeAt ? `code made ${shortDate(s.codeMadeAt)}` : 'no code yet'}</span></div>
        <button type="button" class="mini-btn" onclick={() => { error = ''; asking = s; }}>New code</button></div>
    {/each}
  </div>
  <div class="note"><Icon name="info" /><span>{NOTE}</span></div>
{:else}
  <div class="cls-head"><div><h2>Schools</h2><p>Advisers join a school with its sign-up code.</p></div>
    <div class="hd-actions"><button type="button" class="btn" onclick={() => { name = ''; error = ''; adding = true; }}><Icon name="plus" />Add school</button></div></div>
  <div class="panel"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>School</th><th>Advisers</th><th>Sign-up code</th><th><span class="sr">Actions</span></th></tr></thead>
    <tbody>
      {#each overview.schools as s (s.id)}
        <tr><td><b>{s.name}</b></td><td>{s.advisers}</td>
          <td>{#if s.codeMadeAt}<span class="dot inl"></span>{/if}{codeState(s)}</td>
          <td><div class="acts"><button type="button" class="mini-btn" onclick={() => { error = ''; asking = s; }}>New code</button></div></td></tr>
      {/each}
    </tbody>
  </table></div></div>
  <div class="note"><Icon name="info" /><span>{NOTE}</span></div>
{/if}

{#if adding}
  <Modal labelledby="asTitle" onclose={() => (adding = false)}>
    <h4 id="asTitle">Add a school</h4>
    <div class="meta">Makes its sign-up code. Advisers use it to create their accounts.</div>
    <div class="fld"><label for="asName">School name</label><input id="asName" autocomplete="off" bind:value={name} /></div>
    {#if error}<p class="win-err" role="alert">{error}</p>{/if}
    <div class="actions"><button type="button" class="btn ghost" onclick={() => (adding = false)}>Cancel</button>
      <button type="button" class="btn" disabled={busy} aria-busy={busy} onclick={add}>Add school</button></div>
  </Modal>
{/if}

{#if asking}
  {@const s = asking}
  <Modal labelledby="ncTitle" onclose={() => (asking = null)}>
    <h4 id="ncTitle">Make a new code for {s.name}?</h4>
    <div class="meta">The old code stops working right away. Advisers who already signed up aren’t affected.</div>
    {#if error}<p class="win-err" role="alert">{error}</p>{/if}
    <div class="actions"><button type="button" class="btn ghost" onclick={() => (asking = null)}>Cancel</button>
      <button type="button" class="btn" disabled={busy} aria-busy={busy} onclick={() => newCode(s)}>Make new code</button></div>
  </Modal>
{/if}

{#if shown}
  <ShownOnce title={shown.title} meta={shown.meta} warn="Copy it now. It’s shown only this once." done="Done, I’ve copied it"
    rows={[{ label: 'Sign-up code', value: shown.code, big: true }, { label: 'Invite link for advisers', value: INVITE + shown.code, display: (INVITE + shown.code).replace('https://', '') }]}
    ondone={() => { shown = null; onchange(); }} />
{/if}
