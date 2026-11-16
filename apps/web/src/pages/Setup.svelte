<script lang="ts">
  import { hm, validateWindows, windowLabel } from '@klasilid/core';
  import Icon from '../components/Icon.svelte';
  import Modal from '../components/Modal.svelte';
  import type { KlasilidDb } from '../lib/db';
  import {
    applySetup, DEFAULT_SCHOOL, DEFAULT_WINDOWS, parseLearnerList, SCHOOL_YEARS, SECTIONS, TIMES, timeLabel, validateSetup,
    type JoinSchool, type SetupInput,
  } from '../lib/setup';

  // Markup follows the mockup's first-time setup wizard (modal .box.wiz with five steps).
  // With `join` (signed up with a school code) the school is fixed, and so is the year when the school has one.
  let { db, now, onfinish, join }: { db: KlasilidDb; now: () => Date; onfinish: (classId: string) => void; join?: JoinSchool } = $props();

  const STEPS = ['Your class', 'Students', 'Cards', 'Seats', 'School hours'];
  let step = $state(0);
  let saving = $state(false);
  let s: SetupInput = $state({
    schoolName: join?.schoolName ?? DEFAULT_SCHOOL, yearLabel: SCHOOL_YEARS[0].label, startsOn: SCHOOL_YEARS[0].startsOn, endsOn: SCHOOL_YEARS[0].endsOn,
    grade: 6, section: '', rows: 8, cols: 5, windows: DEFAULT_WINDOWS.map(w => ({ ...w })), learners: [],
  });
  let paste = $state('');
  let pasteSex: 'M' | 'F' = $state('M');
  let alphabetical = $state(true);

  const learnerErrors = $derived(validateSetup(s).filter(e => /learner/i.test(e)));
  const windowErrors = $derived(validateWindows(s.windows.map(w => ({
    ...w, opens: hm(w.opens), closes: hm(w.closes), lateAfter: w.lateAfter ? hm(w.lateAfter) : null, effectiveFrom: s.startsOn,
  }))));
  const stepValid = $derived([!!s.schoolName.trim() && !!s.section, learnerErrors.length === 0, true, true, windowErrors.length === 0][step]);
  const last = $derived(step === STEPS.length - 1);

  function pickYear(label: string) {
    const y = SCHOOL_YEARS.find(y => y.label === label)!;
    Object.assign(s, { yearLabel: y.label, startsOn: y.startsOn, endsOn: y.endsOn });
  }
  function addFromList() {
    s.learners.push(...parseLearnerList(paste).map(l => ({ ...l, sex: pasteSex })));
    paste = '';
  }
  async function next() {
    if (!last) { step++; return; }
    if (validateSetup(s).length) return;
    saving = true;
    onfinish(await applySetup(db, $state.snapshot(s), now(), join));
  }
  const later = () => (location.hash = '#/today');
</script>

<Modal labelledby="wzTitle" onclose={later} wide>
  <h2 id="wzTitle" class="sr">Set up your class</h2>
  <div class="wiz-steps">
    {#each STEPS as label, i}<span class:on={i === step} class:done={i < step} aria-current={i === step ? 'step' : undefined}><i>{i + 1}</i>{label}</span>{/each}
  </div>
  <div class="wiz-body">
    {#if step === 0}
      <h4>Your advisory class</h4><p class="sub2">The class whose attendance the door reader takes.</p>
      <div class="fgrid">
        <div><label for="wzG">Grade</label><select id="wzG" bind:value={s.grade}>{#each [4, 5, 6] as g}<option value={g}>{g}</option>{/each}</select></div>
        <div><label for="wzS">Section</label>
          <select id="wzS" bind:value={s.section}><option value="" disabled>Choose a section…</option>{#each SECTIONS as sec}<option>{sec}</option>{/each}</select></div>
        {#if !join?.yearId}
          <div class="full"><label for="wzY">School year</label>
            <select id="wzY" value={s.yearLabel} onchange={e => pickYear(e.currentTarget.value)}>{#each SCHOOL_YEARS as y}<option>{y.label}</option>{/each}</select></div>
        {/if}
        <div class="full"><label for="wzSc">School</label><input id="wzSc" bind:value={s.schoolName} autocomplete="organization" readonly={!!join} /></div>
      </div>
    {:else if step === 1}
      <h4>Add your learners</h4><p class="sub2">Paste the names from your class record or SF1 file, one per line as "Last name, First name Middle name". You can fix anything after.</p>
      <div class="fgrid">
        <div class="full"><label for="wzP">Paste a list</label><textarea id="wzP" class="paste" bind:value={paste} placeholder={'Abad, Ana Cruz\nBautista, Ben'}></textarea></div>
        <div><label for="wzX">These learners are</label><select id="wzX" bind:value={pasteSex}><option value="M">Boys</option><option value="F">Girls</option></select></div>
        <div class="addrow"><button class="btn ghost" type="button" onclick={addFromList} disabled={!paste.trim()}>Add from list</button></div>
      </div>
      {#if s.learners.length}
        <div class="wiz-list">
          {#each s.learners as l, i}
            <div class="mrow lrow">
              <input aria-label="Last name {i + 1}" placeholder="Last name" bind:value={l.lastName} />
              <input aria-label="First name {i + 1}" placeholder="First name" bind:value={l.firstName} />
              <select aria-label="Sex {i + 1}" bind:value={l.sex}><option value="M">Male</option><option value="F">Female</option></select>
              <button class="iconbtn" type="button" aria-label="Remove {l.firstName || 'learner'}" onclick={() => s.learners.splice(i, 1)}><Icon name="x" /></button>
            </div>
          {/each}
        </div>
        <p class="sub2 mt3">{s.learners.length} learners</p>
      {/if}
      <p class="sub2 mt3">Or <button class="linkbtn" type="button" onclick={() => s.learners.push({ lastName: '', firstName: '', sex: 'M' })}>add learners one by one</button>.</p>
      {#each learnerErrors.filter(() => s.learners.length) as e}<p class="win-err">{e}</p>{/each}
    {:else if step === 2}
      <h4>Register the ID cards</h4><p class="sub2">Hand out cards in list order. Each tap on the door reader registers one card and moves to the next learner. About 5 minutes for a class of 40.</p>
      <div class="tapwait"><div class="ring"><svg aria-hidden="true"><use href="#i-wifi" /></svg></div><b>When your reader arrives</b><span>You can do this later from Students. Setup can finish now.</span></div>
    {:else if step === 3}
      <h4>Arrange the seats</h4><p class="sub2">How is your room set up? You can drag learners to their seats later.</p>
      <div class="fgrid">
        <div><label for="wzR">Rows</label><select id="wzR" bind:value={s.rows}>{#each Array(10) as _, i}<option value={i + 1}>{i + 1}</option>{/each}</select></div>
        <div><label for="wzC">Seats per row</label><select id="wzC" bind:value={s.cols}>{#each Array(10) as _, i}<option value={i + 1}>{i + 1}</option>{/each}</select></div>
      </div>
      <label class="chk mt3"><input type="checkbox" bind:checked={alphabetical} /> Seat everyone alphabetically for now</label>
      {#if s.rows * s.cols < s.learners.length}<p class="win-err">{s.rows * s.cols} seats for {s.learners.length} learners: not enough seats</p>{/if}
    {:else}
      <h4>School hours</h4><p class="sub2">The reader uses these to tell morning and afternoon taps apart and to mark late. Taps outside them go to your review list.</p>
      <div class="rows winset">
        <div class="win-head"><span>Tap</span><span>Opens</span><span>Late after</span><span>Closes</span></div>
        {#each s.windows as w}
          {@const label = windowLabel(w)}
          <div class="win"><b>{label}</b>
            <select class="tsel" aria-label="{label} opens" bind:value={w.opens}>{#each TIMES as t}<option value={t}>{timeLabel(t)}</option>{/each}</select>
            {#if w.lateAfter !== null}<select class="tsel" aria-label="{label} late after" bind:value={w.lateAfter}>{#each TIMES as t}<option value={t}>{timeLabel(t)}</option>{/each}</select>{:else}<span class="na">—</span>{/if}
            <select class="tsel" aria-label="{label} closes" bind:value={w.closes}>{#each TIMES as t}<option value={t}>{timeLabel(t)}</option>{/each}</select>
          </div>
        {/each}
        <p class="win-err" aria-live="polite">{windowErrors.join('. ')}</p>
      </div>
    {/if}
  </div>
  <div class="wiz-foot">
    <button class="btn ghost" type="button" style:visibility={step ? 'visible' : 'hidden'} onclick={() => step--}>Back</button>
    <div style="display:flex;gap:8px">
      <button class="btn ghost" type="button" onclick={later}>Finish later</button>
      <button class="btn" type="button" onclick={next} disabled={!stepValid || saving}>{last ? 'Finish' : 'Next'}</button>
    </div>
  </div>
</Modal>

<style>
  .paste { width: 100%; min-height: 96px; border: 1.5px solid var(--line); border-radius: 12px; padding: 10px 12px; font: inherit; font-size: 15px; background: var(--surface); color: var(--ink); }
  .addrow { display: flex; align-items: flex-end; }
  .addrow .btn { width: 100%; height: 46px; }
  .lrow { display: grid; grid-template-columns: 1fr 1fr 96px 44px; gap: 6px; padding: 6px 0; }
  .lrow input, .lrow select { height: 40px; border: 1.5px solid var(--line); border-radius: 10px; padding: 0 10px; font: inherit; font-size: 14px; background-color: var(--surface); color: var(--ink); min-width: 0; }
  .lrow .iconbtn { width: 40px; height: 40px; box-shadow: none; }
  .linkbtn { border: 0; background: none; color: var(--accent-ink); font: inherit; font-weight: 700; cursor: pointer; padding: 0; }
</style>
