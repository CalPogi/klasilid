<script lang="ts">
  import { hm, validateWindows, windowLabel } from '@klasilid/core';
  import type { KlasilidDb } from '../lib/db';
  import {
    applySetup, DEFAULT_WINDOWS, parseLearnerList, SCHOOL_YEARS, SECTIONS, TIMES, validateSetup,
    type SetupInput, type SetupLearner,
  } from '../lib/setup';

  let { db, now, onfinish }: { db: KlasilidDb; now: () => Date; onfinish: (classId: string) => void } = $props();

  const STEPS = ['Your class', 'Students', 'Cards', 'Seats', 'School hours'];
  let step = $state(0);
  let saving = $state(false);
  let s: SetupInput = $state({
    schoolName: '', yearLabel: SCHOOL_YEARS[0].label, startsOn: SCHOOL_YEARS[0].startsOn, endsOn: SCHOOL_YEARS[0].endsOn,
    grade: 6, section: '', rows: 8, cols: 5, windows: DEFAULT_WINDOWS.map(w => ({ ...w })), learners: [],
  });
  let paste = $state('');
  let pasteSex: 'M' | 'F' = $state('M');

  const learnerErrors = $derived(validateSetup(s).filter(e => /learner/i.test(e)));
  const windowErrors = $derived(validateWindows(s.windows.map(w => ({
    ...w, opens: hm(w.opens), closes: hm(w.closes), lateAfter: w.lateAfter ? hm(w.lateAfter) : null, effectiveFrom: s.startsOn,
  }))));
  const stepValid = $derived([
    !!s.schoolName.trim() && !!s.section,
    learnerErrors.length === 0,
    true,
    true,
    windowErrors.length === 0,
  ][step]);
  const last = $derived(step === STEPS.length - 1);

  function pickYear(label: string) {
    const y = SCHOOL_YEARS.find(y => y.label === label)!;
    Object.assign(s, { yearLabel: y.label, startsOn: y.startsOn, endsOn: y.endsOn });
  }
  function addFromList() {
    s.learners.push(...parseLearnerList(paste).map(l => ({ ...l, sex: pasteSex })));
    paste = '';
  }
  function addRow() {
    s.learners.push({ lastName: '', firstName: '', sex: 'M' } satisfies SetupLearner);
  }
  async function next() {
    if (!last) { step++; return; }
    if (validateSetup(s).length) return;
    saving = true;
    onfinish(await applySetup(db, $state.snapshot(s), now()));
  }
</script>

<section class="setup card" aria-labelledby="setup-title">
  <h1 id="setup-title">Set up your class</h1>
  <ol class="steps">
    {#each STEPS as label, i}
      <li class:on={i === step} class:done={i < step} aria-current={i === step ? 'step' : undefined}><span>{i + 1}</span>{label}</li>
    {/each}
  </ol>

  <div class="body">
    {#if step === 0}
      <div class="grid2">
        <div class="field wide"><label for="sc">School</label><input id="sc" type="text" bind:value={s.schoolName} autocomplete="organization" /></div>
        <div class="field"><label for="sy">School year</label>
          <select id="sy" value={s.yearLabel} onchange={e => pickYear(e.currentTarget.value)}>
            {#each SCHOOL_YEARS as y}<option>{y.label}</option>{/each}
          </select></div>
        <div class="field"><label for="gr">Grade</label>
          <select id="gr" bind:value={s.grade}>{#each [4, 5, 6] as g}<option value={g}>Grade {g}</option>{/each}</select></div>
        <div class="field"><label for="se">Section</label>
          <select id="se" bind:value={s.section}>
            <option value="" disabled>Choose a section…</option>
            {#each SECTIONS as sec}<option>{sec}</option>{/each}
          </select></div>
      </div>
      <p class="hint">This becomes your advisory class. Attendance is taken for this class only.</p>
    {:else if step === 1}
      <div class="paste">
        <div class="field wide"><label for="pl">Paste a list</label>
          <textarea id="pl" bind:value={paste} placeholder={'One per line: Last name, First name Middle name\nAbad, Ana Cruz'}></textarea></div>
        <div class="row">
          <div class="field"><label for="ps">These learners are</label>
            <select id="ps" bind:value={pasteSex}><option value="M">Boys</option><option value="F">Girls</option></select></div>
          <button class="btn ghost" type="button" onclick={addFromList} disabled={!paste.trim()}>Add from list</button>
          <button class="btn ghost" type="button" onclick={addRow}>Add one learner</button>
        </div>
      </div>
      {#if s.learners.length}
        <ul class="learners">
          {#each s.learners as l, i}
            <li>
              <input type="text" aria-label="Last name {i + 1}" placeholder="Last name" bind:value={l.lastName} />
              <input type="text" aria-label="First name {i + 1}" placeholder="First name" bind:value={l.firstName} />
              <input type="text" aria-label="Middle name {i + 1}" placeholder="Middle name" bind:value={l.middleName} />
              <select aria-label="Sex {i + 1}" bind:value={l.sex}><option value="M">Male</option><option value="F">Female</option></select>
              <button class="x" type="button" aria-label="Remove {l.firstName || 'learner'}" onclick={() => s.learners.splice(i, 1)}>×</button>
            </li>
          {/each}
        </ul>
        <p class="hint">{s.learners.length} learners</p>
      {/if}
      {#each learnerErrors as e}<p class="err">{e}</p>{/each}
    {:else if step === 2}
      <div class="later">
        <b>When your reader arrives</b>
        <p>You'll pair the door reader and tap each learner's card once to register it. Both are in Settings, so you can finish setup now.</p>
      </div>
    {:else if step === 3}
      <div class="grid2">
        <div class="field"><label for="rw">Rows</label>
          <select id="rw" bind:value={s.rows}>{#each Array(10) as _, i}<option value={i + 1}>{i + 1}</option>{/each}</select></div>
        <div class="field"><label for="cl">Seats per row</label>
          <select id="cl" bind:value={s.cols}>{#each Array(10) as _, i}<option value={i + 1}>{i + 1}</option>{/each}</select></div>
      </div>
      <p class="hint" class:warn={s.rows * s.cols < s.learners.length}>
        {s.rows * s.cols} seats for {s.learners.length} learners{s.rows * s.cols < s.learners.length ? ' — not enough seats' : ''}
      </p>
    {:else}
      <table class="hours">
        <thead><tr><th scope="col">Tap</th><th scope="col">Opens</th><th scope="col">Late after</th><th scope="col">Closes</th></tr></thead>
        <tbody>
          {#each s.windows as w}
            {@const label = windowLabel(w)}
            <tr>
              <th scope="row">{label}</th>
              <td data-label="Opens"><select aria-label="{label} opens" bind:value={w.opens}>{#each TIMES as t}<option>{t}</option>{/each}</select></td>
              <td data-label="Late after">{#if w.lateAfter !== null}<select aria-label="{label} late after" bind:value={w.lateAfter}>{#each TIMES as t}<option>{t}</option>{/each}</select>{:else}<span class="na">—</span>{/if}</td>
              <td data-label="Closes"><select aria-label="{label} closes" bind:value={w.closes}>{#each TIMES as t}<option>{t}</option>{/each}</select></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="hint">Taps outside these times go to your review list. You can change them later; changes apply from that day on.</p>
      {#each windowErrors as e}<p class="err">{e}</p>{/each}
    {/if}
  </div>

  <div class="actions">
    {#if step > 0}<button class="btn ghost" type="button" onclick={() => step--}>Back</button>{/if}
    <a class="later-link" href="#/today">Finish later</a>
    <button class="btn" type="button" onclick={next} disabled={!stepValid || saving}>{last ? 'Finish' : 'Next'}</button>
  </div>
</section>

<style>
  .setup { max-width: 760px; margin: 24px auto; border-radius: var(--r-xl); padding: 28px; display: flex; flex-direction: column; gap: 18px; }
  h1 { font-size: 24px; }
  .steps { display: flex; gap: 8px; list-style: none; padding: 0; margin: 0; flex-wrap: wrap; }
  .steps li { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--muted); padding: 6px 12px 6px 6px;
    border-radius: 999px; background: var(--surface-2); }
  .steps li span { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); font-size: 12px; }
  .steps li.on { background: var(--dark); color: var(--on-dark); }
  .steps li.on span { background: var(--accent); color: var(--on-accent); }
  .steps li.done span { background: var(--ink); color: var(--surface); }
  .body { min-height: 300px; display: flex; flex-direction: column; gap: 12px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .wide { grid-column: 1 / -1; }
  .hint { margin: 0; font-size: 13px; color: var(--muted); }
  .hint.warn, .err { color: var(--bad-ink); }
  .err { margin: 0; font-size: 13px; font-weight: 600; }
  .paste .row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-top: 10px; }
  .paste .row .field { min-width: 160px; }
  .learners { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow: auto; }
  .learners li { display: grid; grid-template-columns: 1fr 1fr 1fr 110px 44px; gap: 6px; }
  .x { border: 0; background: var(--surface-2); border-radius: var(--r-sm); font-size: 20px; cursor: pointer; min-height: 44px; }
  .later { background: var(--accent-soft); border-radius: var(--r-md); padding: 16px; }
  .later p { margin: 6px 0 0; color: var(--ink-2); }
  .hours { width: 100%; border-collapse: collapse; }
  .hours th, .hours td { text-align: left; padding: 6px; font-size: 14px; }
  .hours thead th { font-size: 12px; color: var(--muted); font-weight: 700; }
  .na { color: var(--muted); padding-left: 12px; }
  .actions { display: flex; align-items: center; gap: 12px; }
  .later-link { margin-left: auto; color: var(--muted); font-weight: 600; font-size: 14px; padding: 12px; }
  @media (max-width: 600px) {
    .setup { margin: 0; padding: 18px; }
    .grid2 { grid-template-columns: 1fr; }
    .learners li { grid-template-columns: 1fr 1fr; }
    .hours thead { display: none; }
    .hours tr { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 8px 0; border-bottom: 1px solid var(--line); }
    .hours th[scope='row'] { grid-column: 1 / -1; padding: 0; }
    .hours td { padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .hours td::before { content: attr(data-label); font-size: 12px; color: var(--muted); font-weight: 600; }
    .hours select { padding: 0 4px; }
    .na { padding: 12px 0 0 6px; }
    .actions { flex-wrap: wrap; }
  }
</style>
