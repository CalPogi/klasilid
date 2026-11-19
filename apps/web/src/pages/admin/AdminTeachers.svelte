<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import Modal from '../../components/Modal.svelte';
  import TypeToConfirm from '../../components/TypeToConfirm.svelte';
  import type { Overview } from '../../lib/admin';
  import { phone } from '../../lib/layout';

  // Markup and copy follow the approved boards docs/mockup/admin/Admin.dc.html and AdminPhone.dc.html (Teachers).
  type Teacher = Overview['teachers'][number];
  type Call = <T>(action: string, body?: object) => Promise<T>;
  let { overview, call, onchange }: { overview: Overview; call: Call; onchange: () => void } = $props();

  let picked: Teacher | null = $state(null);   // phone: the teacher sheet
  let deleting: Teacher | null = $state(null);
  let photosLeft: string[] = $state([]);
  let busy = $state(false);

  const cls = (c: Teacher['classes'][number]) => `Gr. ${c.grade} ${c.section}`;
  const initials = (n: string) => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const copy = (v: string) => navigator.clipboard?.writeText(v).catch(() => {});

  async function remove(t: Teacher) {
    const r = await call<{ ok: true; photosLeft: string[] }>('deleteTeacher', { teacherId: t.id, confirm: t.username });
    deleting = null;
    picked = null;
    photosLeft = r.photosLeft;
    if (!photosLeft.length) onchange();
  }

  async function retryPhotos() {
    busy = true;
    try {
      photosLeft = (await call<{ photosLeft: string[] }>('removeClassPhotos', { classIds: photosLeft })).photosLeft;
    } catch { /* keep the list; the button stays */ } finally {
      busy = false;
    }
    if (!photosLeft.length) onchange();
  }
</script>

{#snippet classIds(t: Teacher)}
  {#each t.classes as c (c.id)}
    <span class="idcell">{cls(c)}<button type="button" class="cpy" aria-label="Copy class id of {cls(c)}" onclick={() => copy(c.id)}><Icon name="copy" /></button></span>
  {/each}
{/snippet}

{#if $phone}
  <div class="hrow"><div><h2 class="ptitle">Teachers</h2><span class="badge">Admin</span></div><span class="spacer44"></span></div>
  <div class="rows mt3">
    {#each overview.teachers as t (t.id)}
      <div class="rowi"><button type="button" class="rowopen" onclick={() => (picked = t)}><div class="avatar sm">{initials(t.displayName)}</div>
        <div class="txt"><b>{t.displayName}</b><span>{t.username} · {t.classes.map(cls).join(', ') || 'no class yet'}</span></div></button>
        {#each t.classes.slice(0, 1) as c (c.id)}<button type="button" class="cpy" aria-label="Copy class id of {cls(c)}" onclick={() => copy(c.id)}><Icon name="copy" /></button>{/each}
      </div>
    {/each}
  </div>
  <p class="sub2" style="margin-top:12px">Tap a teacher to see their school or delete the account.</p>
{:else}
  <div class="cls-head"><div><h2>Teachers</h2><p>Every adviser account, by school. Class data stays private to each teacher.</p></div></div>
  <div class="panel"><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Name</th><th>Username</th><th>School</th><th>Classes</th><th><span class="sr">Actions</span></th></tr></thead>
    <tbody>
      {#each overview.teachers as t (t.id)}
        <tr><td><b>{t.displayName}</b></td><td>{t.username}</td><td>{t.schoolName ?? '—'}</td><td>{@render classIds(t)}</td>
          <td><div class="acts"><button type="button" class="mini-btn danger" onclick={() => (deleting = t)}>Delete account</button></div></td></tr>
      {/each}
    </tbody>
  </table></div></div>
{/if}

{#if picked && !deleting}
  {@const t = picked}
  <Modal labelledby="tdTitle" onclose={() => (picked = null)}>
    <h4 id="tdTitle">{t.displayName}</h4>
    <div class="meta">{t.username} · {t.schoolName ?? 'No school'}</div>
    <div>{@render classIds(t)}</div>
    <div class="actions"><button type="button" class="btn ghost" onclick={() => (picked = null)}>Close</button>
      <button type="button" class="btn danger" onclick={() => (deleting = t)}>Delete account</button></div>
  </Modal>
{/if}

{#if deleting}
  {@const t = deleting}
  <TypeToConfirm title="Delete {t.displayName}’s account?" expected={t.username} action="Delete account"
    meta="This deletes the login and everything in it: {t.classes.map(cls).join(', ') || 'no classes'}, its learners, cards, attendance, excuse letters and its reader. It can’t be undone."
    warn="Only for test accounts, or when the school asks in writing after the teacher has exported her data."
    oncancel={() => (deleting = null)} onconfirm={() => remove(t)} />
{/if}

{#if photosLeft.length}
  <Modal labelledby="plTitle" onclose={() => { photosLeft = []; onchange(); }}>
    <h4 id="plTitle">Account deleted</h4>
    <div class="meta">Some excuse-letter photos weren’t deleted.</div>
    <div class="actions"><button type="button" class="btn ghost" onclick={() => { photosLeft = []; onchange(); }}>Close</button>
      <button type="button" class="btn" disabled={busy} aria-busy={busy} onclick={retryPhotos}>Retry</button></div>
  </Modal>
{/if}
