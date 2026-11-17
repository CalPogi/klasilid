<script lang="ts">
  import Icon from '../../components/Icon.svelte';
  import { classDay, todayManila } from '../../lib/attendance';
  import type { KlasilidDb, LLearner } from '../../lib/db';
  import { shortName } from '../../lib/format';
  import { go } from '../../lib/router';
  import { clickSeat, editorHint, stepSize, type Pick } from '../../lib/seat-editor';
  import { fillAZ, saveSeatPlan, seatPlanFor, unseated, type Layout } from '../../lib/seats';

  // The mockup's phone seat editor (data-screen="seatEdit") with its fixed Cancel / Save bar (#mEdActions).
  let { db, classId, now }: { db: KlasilidDb; classId: string; now: () => Date } = $props();

  let learners: LLearner[] = $state([]);
  let draft: Layout = $state({ rows: 8, cols: 5, seats: [] });
  let sel: Pick = $state(null);
  let msg = $state('');
  let saving = $state(false);

  $effect(() => {
    (async () => {
      const today = todayManila(now());
      learners = (await classDay(db, classId, today, now())).rows.map(r => r.learner);
      const { layout } = await seatPlanFor(db, classId, today);
      const ids = new Set(learners.map(l => l.id));
      draft = { ...layout, seats: layout.seats.map(id => (id && ids.has(id) ? id : null)) };
    })();
  });

  const byId = $derived(new Map(learners.map(l => [l.id, l])));
  const uns = $derived(unseated(draft, learners));
  const cap = $derived(draft.rows * draft.cols);
  const hint = $derived(editorHint(draft, sel, learners, msg, 'Tap'));
  const name = (id: string) => { const l = byId.get(id); return l ? shortName(l) : ''; };

  function step(k: 'rows' | 'cols', d: number) {
    const r = stepSize(draft, k, d);
    draft = r.draft;
    sel = null;
    msg = r.lost ? `${r.lost} learner${r.lost > 1 ? 's' : ''} moved to Not seated.` : '';
  }
  function tap(idx: number) {
    const r = clickSeat(draft, sel, idx);
    draft = r.draft;
    sel = r.sel;
    msg = r.movedOut ? `${name(r.movedOut)} moved to Not seated.` : '';
  }
  const leave = () => (history.length > 1 ? history.back() : go('seat'));
  async function save() {
    saving = true;
    await saveSeatPlan(db, classId, $state.snapshot(draft), now());
    leave();
  }
</script>

<div class="hrow">
  <button class="iconbtn" type="button" aria-label="Back" onclick={leave}><Icon name="back" cls="ico" /></button>
  <b style="font-size:16px">Edit seat plan</b>
  <span class="spacer44"></span>
</div>
<div class="m-steppers">
  <div class="stepper" data-k="rows"><span class="lbl">Rows</span><div class="ctl">
    <button type="button" aria-label="Fewer rows" disabled={draft.rows <= 1} onclick={() => step('rows', -1)}>−</button><b class="num">{draft.rows}</b>
    <button type="button" aria-label="More rows" disabled={draft.rows >= 10} onclick={() => step('rows', 1)}>+</button></div></div>
  <div class="stepper" data-k="cols"><span class="lbl">Seats per row</span><div class="ctl">
    <button type="button" aria-label="Fewer seats per row" disabled={draft.cols <= 1} onclick={() => step('cols', -1)}>−</button><b class="num">{draft.cols}</b>
    <button type="button" aria-label="More seats per row" disabled={draft.cols >= 10} onclick={() => step('cols', 1)}>+</button></div></div>
</div>
<p class="ed-total" style="margin:10px 0 0"><b>{cap}</b> seats · <b>{learners.length}</b> learners · {#if cap >= learners.length}{cap - learners.length} spare{:else}<span style="color:var(--bad-ink)">{learners.length - cap} short</span>{/if}</p>
<div class="title-row" style="margin-top:14px"><h3>Not seated</h3>
  <button class="link" type="button" style="padding:0" onclick={() => { draft = fillAZ(draft, learners); sel = null; msg = ''; }}>Fill A–Z</button></div>
<div class="m-unseated uchips" role="group" aria-label="Not seated">
  {#each uns as l (l.id)}
    <button type="button" class="uchip" class:sel={sel?.type === 'stu' && sel.id === l.id} aria-pressed={sel?.type === 'stu' && sel.id === l.id}
      onclick={() => (sel = sel?.type === 'stu' && sel.id === l.id ? null : { type: 'stu', id: l.id })}>{shortName(l)}</button>
  {:else}
    <span style="font-size:13.5px;color:var(--muted);font-weight:600">Everyone has a seat.</span>
  {/each}
</div>
<p class="hint eyebrowless" style="font-size:13px;margin:8px 0 12px">{hint}</p>
<div class="front"><Icon name="board" />Front of the room</div>
<div class="desk-scroll"><div class="eseats" style="--cols:{draft.cols}" role="group" aria-label="Seats">
  {#each draft.seats as v, idx (idx)}
    {@const r = Math.floor(idx / draft.cols) + 1}
    {@const c = (idx % draft.cols) + 1}
    {#if !v}
      <button type="button" class="eseat empty" class:target={!!sel} aria-label="Row {r} seat {c}, empty" onclick={() => tap(idx)}>
        <span class="plus" aria-hidden="true"><svg><use href="#i-plus" /></svg></span><small>R{r} · {c}</small></button>
    {:else}
      {@const l = byId.get(v)}
      <button type="button" class="eseat" class:sel={sel?.type === 'seat' && sel.idx === idx} aria-label="Row {r} seat {c}, {name(v)}"
        aria-pressed={sel?.type === 'seat' && sel.idx === idx} onclick={() => tap(idx)}>
        <span class="av" aria-hidden="true">{l ? `${l.firstName[0]}${l.lastName[0]}` : ''}</span><b>{name(v)}</b><small>R{r} · {c}</small></button>
    {/if}
  {/each}
</div></div>
{#if sel?.type === 'seat'}
  <button class="btn ghost mt3" type="button" onclick={() => { if (sel?.type === 'seat') draft.seats[sel.idx] = null; sel = null; }}>Remove from seat</button>
{/if}
<div style="height:90px"></div>
<div class="m-ed-actions"><button class="btn ghost" type="button" onclick={leave}>Cancel</button>
  <button class="btn" type="button" disabled={saving} onclick={save}>Save seat plan</button></div>
