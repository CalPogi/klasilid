<script lang="ts">
  import { windowLabel } from '@klasilid/core';
  import Icon from '../../components/Icon.svelte';
  import { todayManila } from '../../lib/attendance';
  import type { KlasilidDb } from '../../lib/db';
  import { fmtMonth } from '../../lib/format';
  import { go } from '../../lib/router';
  import { applyTheme, downloadAttendance, loadSettings, saveTapWindows, savedTheme, setIgnoreRepeat, setLanguage, setReviewOutside, type Theme } from '../../lib/settings';
  import { DEFAULT_WINDOWS, TIMES, timeLabel, type SetupWindow } from '../../lib/setup';

  // The mockup's phone Settings (data-screen="settings"). Its Accounts group comes with parent accounts (plan 4);
  // the laptop's other settings (taps outside tap times, repeat taps, the CSV download) are rows in the same style.
  let { db, classId, userId, now, onregister }: { db: KlasilidDb; classId: string; userId: string; now: () => Date; onregister: () => void } = $props();

  const today = $derived(todayManila(now()));
  let windows: SetupWindow[] = $state(DEFAULT_WINDOWS.map(w => ({ ...w })));
  let errors: string[] = $state([]);
  let saved = $state('');
  let review = $state(true);
  let repeat: 1 | 3 | 5 | 10 = $state(3);
  let theme: Theme = $state(savedTheme());
  let language: 'en' | 'fil' = $state('en');
  let alerts: Record<string, boolean> = $state({});
  let months: string[] = $state([]);
  let month = $state('');
  const options = (v: string | null) => (v && !TIMES.includes(v) ? [...TIMES, v].sort() : TIMES);

  $effect(() => {
    loadSettings(db, classId, today).then(st => {
      ({ windows, review, repeat, language, alerts, months } = st);
      month ||= months[0] ?? today.slice(0, 7);
    });
  });
  async function saveTimes() {
    saved = '';
    errors = await saveTapWindows(db, classId, $state.snapshot(windows), now());
    if (!errors.length) saved = 'Saved. Applies from today.';
  }
  async function toggleAlert(k: string) {
    alerts[k] = !alerts[k];
    await db.prefs.put({ key: 'alerts', value: $state.snapshot(alerts) });
  }
  const back = () => (history.length > 1 ? history.back() : go('today'));
</script>

<div class="hrow"><button class="iconbtn" type="button" aria-label="Back" onclick={back}><Icon name="back" cls="ico" /></button><b style="font-size:16px">Settings</b><span class="spacer44"></span></div>

<div class="group-title">Tap times</div>
<p class="eyebrowless" style="font-size:13px;margin:0 4px 4px">The reader only accepts taps inside these times.</p>
<div data-winset>
  {#each windows as w}
    {@const label = windowLabel(w)}
    <div class="mwin"><b>{label}</b>
      <div class="g" class:two={w.lateAfter === null}>
        <div><label for="w-{label}-o">From</label><select id="w-{label}-o" class="tsel" aria-label="{label} opens" bind:value={w.opens}>{#each options(w.opens) as t}<option value={t}>{timeLabel(t)}</option>{/each}</select></div>
        {#if w.lateAfter !== null}
          <div><label for="w-{label}-l">Late after</label><select id="w-{label}-l" class="tsel" aria-label="{label} late after" bind:value={w.lateAfter}>{#each options(w.lateAfter) as t}<option value={t}>{timeLabel(t)}</option>{/each}</select></div>
        {/if}
        <div><label for="w-{label}-c">Until</label><select id="w-{label}-c" class="tsel" aria-label="{label} closes" bind:value={w.closes}>{#each options(w.closes) as t}<option value={t}>{timeLabel(t)}</option>{/each}</select></div>
      </div>
    </div>
  {/each}
  <p class="win-err" aria-live="polite" style="padding:8px 4px 0">{errors.join('. ')}</p>
  {#if saved}<p class="eyebrowless" role="status" style="margin:4px">{saved}</p>{/if}
  <button class="btn mt3" type="button" onclick={saveTimes}>Save tap times</button>
</div>

<div class="group-title">Rules</div>
<div class="rows">
  <div class="kv"><div class="k"><b>Taps outside these times</b><span>For example a tap at 10:00 AM</span></div>
    <div class="segset">
      <button type="button" class:on={review} aria-pressed={review} onclick={() => { review = true; setReviewOutside(db, classId, true); }}>Ask me to review</button>
      <button type="button" class:on={!review} aria-pressed={!review} onclick={() => { review = false; setReviewOutside(db, classId, false); }}>Ignore</button>
    </div></div>
  <div class="kv"><div class="k"><b>Ignore repeat taps within</b><span>Stops double taps from counting twice</span></div>
    <label class="sr" for="mRepeat">Ignore repeat taps within</label>
    <select id="mRepeat" class="vsel" bind:value={repeat} onchange={() => setIgnoreRepeat(db, classId, repeat)}>
      {#each [1, 3, 5, 10] as m}<option value={m}>{m} {m === 1 ? 'minute' : 'minutes'}</option>{/each}
    </select></div>
</div>

<div class="group-title">Door reader</div>
<div class="rows">
  <button class="kv kvbtn" type="button" onclick={() => go('reader')}><div class="k"><b>Door reader</b><span>No reader paired yet</span></div><Icon name="right" /></button>
  <button class="kv kvbtn" type="button" onclick={onregister}><div class="k"><b>Register a card</b><span>Tap a blank card on the reader</span></div><Icon name="right" /></button>
</div>

<div class="group-title">Notify me when</div>
<div class="rows">
  <div class="kv"><div class="k"><b>Reader goes offline</b></div><label class="switch"><input type="checkbox" checked={alerts.readerOffline} onchange={() => toggleAlert('readerOffline')} aria-label="Reader goes offline" /><i></i></label></div>
  <div class="kv"><div class="k"><b>Absent 2 days in a row</b></div><label class="switch"><input type="checkbox" checked={alerts.absent2} onchange={() => toggleAlert('absent2')} aria-label="Absent 2 days in a row" /><i></i></label></div>
</div>

<div class="group-title">Display</div>
<div class="rows">
  <div class="kv"><div class="k"><b>Appearance</b></div>
    <div class="segset">{#each [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']] as [v, label]}
      <button type="button" class:on={theme === v} aria-pressed={theme === v} onclick={() => { theme = v as Theme; applyTheme(theme); }}>{label}</button>{/each}</div></div>
  <div class="kv"><div class="k"><b>Language</b></div>
    <div class="segset">{#each [['en', 'English'], ['fil', 'Filipino']] as [v, label]}
      <button type="button" class:on={language === v} aria-pressed={language === v} onclick={() => { language = v as 'en' | 'fil'; setLanguage(db, userId, language); }}>{label}</button>{/each}</div></div>
</div>

<div class="group-title">Your data</div>
<div class="rows">
  <div class="kv"><div class="k"><b>Attendance for a month</b><span>The month grid as a spreadsheet file (CSV)</span></div>
    <label class="sr" for="mCsvMonth">Month</label>
    <select id="mCsvMonth" class="vsel" bind:value={month}>{#each months as m}<option value={m}>{fmtMonth(m)}</option>{/each}</select>
    <button class="mini-btn" type="button" onclick={() => downloadAttendance(db, classId, month, today, now())}>Download</button></div>
</div>

<style>
  .kvbtn { width: 100%; border: 0; background: none; font: inherit; text-align: left; cursor: pointer; color: inherit; }
</style>
