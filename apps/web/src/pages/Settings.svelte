<script lang="ts">
  import { windowLabel, windowsForDate } from '@klasilid/core';
  import { classDay, monthsWithAttendance, schoolDaysInMonth, todayManila } from '../lib/attendance';
  import type { KlasilidDb } from '../lib/db';
  import { fmtMonth } from '../lib/format';
  import { applyTheme, attendanceCsv, saveTapWindows, savedTheme, setIgnoreRepeat, setLanguage, setReviewOutside, type Theme } from '../lib/settings';
  import { DEFAULT_WINDOWS, TIMES, timeLabel, type SetupWindow } from '../lib/setup';

  // Markup follows the mockup's Settings page, split into its four tabs (.ctabs.stabs / .spanel).
  let { db, classId, userId, now, onregister }: { db: KlasilidDb; classId: string; userId: string; now: () => Date; onregister: () => void } = $props();

  const TABS = { tap: 'Tap times', reader: 'Reader and accounts', alerts: 'Alerts', display: 'Display and data' } as const;
  type Tab = keyof typeof TABS;
  let tab: Tab = $state('tap');
  let windows: SetupWindow[] = $state(DEFAULT_WINDOWS.map(w => ({ ...w })));
  let errors: string[] = $state([]);
  let saved = $state('');
  let review = $state(true);
  let repeat: 1 | 3 | 5 | 10 = $state(3);
  let theme: Theme = $state(savedTheme());
  let language: 'en' | 'fil' = $state('en');
  let alerts: Record<string, boolean> = $state({ readerOffline: true, absent2: true, parentApp: true });
  let months: string[] = $state([]);
  let month = $state('');
  const today = $derived(todayManila(now()));
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const options = (v: string | null) => (v && !TIMES.includes(v) ? [...TIMES, v].sort() : TIMES);

  $effect(() => {
    (async () => {
      const cls = await db.classes.get(classId);
      review = cls?.reviewOutside ?? true;
      repeat = cls?.ignoreRepeatMinutes ?? 3;
      const current = windowsForDate(await db.tapWindows.where('classId').equals(classId).toArray(), today);
      if (current.length === 4) windows = current.map(w => ({ session: w.session, kind: w.kind, opens: hhmm(w.opens), lateAfter: w.lateAfter == null ? null : hhmm(w.lateAfter), closes: hhmm(w.closes) }));
      language = ((await db.prefs.get('language'))?.value as 'en' | 'fil') ?? 'en';
      alerts = { ...alerts, ...(((await db.prefs.get('alerts'))?.value as Record<string, boolean>) ?? {}) };
      months = await monthsWithAttendance(db, classId, today);
      month ||= months[0] ?? today.slice(0, 7);
    })();
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
  async function download() {
    const days = (await schoolDaysInMonth(db, classId, month, today)).reverse();
    const csv = attendanceCsv(await Promise.all(days.map(d => classDay(db, classId, d, now()))));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `Attendance ${fmtMonth(month)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
</script>

<div class="page on" data-page="settings">
  <div class="pg-head"><div><h2>Settings</h2><p>Rules, the door reader, and accounts</p></div>
    <button class="btn ghost" type="button" style="width:auto;height:44px;padding:0 16px;font-size:15px" disabled title="Your class is already set up">Run first-time setup</button></div>
  <div class="ctabs stabs" role="tablist">
    {#each Object.entries(TABS) as [k, label]}
      <button type="button" role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => (tab = k as Tab)}>{label}</button>
    {/each}
  </div>

  {#if tab === 'tap'}
    <div class="spanel" role="tabpanel" style="max-width:760px">
      <div class="group-title" style="margin-top:0">Tap times</div>
      <p class="sub2" style="margin:0 0 8px">When students can tap in and out. The reader only accepts taps inside these times.</p>
      <div class="rows winset">
        <div class="win-head"><span>Tap</span><span>Opens</span><span>Late after</span><span>Closes</span></div>
        {#each windows as w}
          {@const label = windowLabel(w)}
          <div class="win"><b>{label}</b>
            <select class="tsel" aria-label="{label} opens" bind:value={w.opens}>{#each options(w.opens) as t}<option value={t}>{timeLabel(t)}</option>{/each}</select>
            {#if w.lateAfter !== null}<select class="tsel" aria-label="{label} late after" bind:value={w.lateAfter}>{#each options(w.lateAfter) as t}<option value={t}>{timeLabel(t)}</option>{/each}</select>{:else}<span class="na">—</span>{/if}
            <select class="tsel" aria-label="{label} closes" bind:value={w.closes}>{#each options(w.closes) as t}<option value={t}>{timeLabel(t)}</option>{/each}</select>
          </div>
        {/each}
        <p class="win-err" aria-live="polite">{errors.join('. ')}</p>
        <div class="kv"><div class="k"><b>Changes apply from today</b><span>Past days keep their times.</span></div>
          <div style="display:flex;align-items:center;gap:10px">{#if saved}<span class="sub2" role="status">{saved}</span>{/if}<button class="mini-btn primary" type="button" onclick={saveTimes}>Save tap times</button></div></div>
        <div class="kv"><div class="k"><b>Taps outside these times</b><span>For example a tap at 10:00 AM</span></div>
          <div class="segset">
            <button type="button" class:on={review} aria-pressed={review} onclick={() => { review = true; setReviewOutside(db, classId, true); }}>Ask me to review</button>
            <button type="button" class:on={!review} aria-pressed={!review} onclick={() => { review = false; setReviewOutside(db, classId, false); }}>Ignore</button>
          </div></div>
        <div class="kv"><div class="k"><b>Ignore repeat taps within</b><span>Stops double taps from counting twice</span></div>
          <label class="sr" for="repeatSel">Ignore repeat taps within</label>
          <select id="repeatSel" class="vsel" bind:value={repeat} onchange={() => setIgnoreRepeat(db, classId, repeat)}>
            {#each [1, 3, 5, 10] as m}<option value={m}>{m} {m === 1 ? 'minute' : 'minutes'}</option>{/each}
          </select></div>
      </div>
    </div>
  {:else if tab === 'reader'}
    <div class="spanel" role="tabpanel" style="max-width:760px">
      <div class="group-title" style="margin-top:0">Door reader</div>
      <div class="rows">
        <div class="kv"><div class="k"><b>Status</b><span>No reader paired yet</span></div><button class="mini-btn" type="button" disabled title="Pair the reader with the Windows or Android app">Pair reader</button></div>
        <div class="kv"><div class="k"><b>Register cards</b><span>One learner after another, tap by tap</span></div><button class="mini-btn" type="button" onclick={onregister}>Start</button></div>
      </div>
      <div class="group-title">Accounts</div>
      <div class="rows">
        <div class="kv"><div class="k"><b>Parent accounts</b><span>Login slips come with parent accounts</span></div><button class="mini-btn" type="button" disabled>Print login slips</button></div>
        <div class="kv"><div class="k"><b>Student accounts</b><span>Come with parent accounts</span></div><a class="mini-btn" href="#/students">Manage</a></div>
      </div>
    </div>
  {:else if tab === 'alerts'}
    <div class="spanel" role="tabpanel" style="max-width:760px">
      <p class="sub2" style="margin:0 0 8px">Saved on this device. Alerts go live with the parent app.</p>
      <div class="group-title" style="margin-top:0">Notify me when</div>
      <div class="rows">
        <div class="kv"><div class="k"><b>The reader goes offline</b></div><label class="switch"><input type="checkbox" checked={alerts.readerOffline} onchange={() => toggleAlert('readerOffline')} aria-label="The reader goes offline" /><i></i></label></div>
        <div class="kv"><div class="k"><b>A student is absent 2 days in a row</b></div><label class="switch"><input type="checkbox" checked={alerts.absent2} onchange={() => toggleAlert('absent2')} aria-label="A student is absent 2 days in a row" /><i></i></label></div>
      </div>
      <div class="group-title">Parent alerts</div>
      <div class="rows">
        <div class="kv"><div class="k"><b>App notifications</b><span>Free. Parents get a phone alert at each tap and when marked late or absent.</span></div><label class="switch"><input type="checkbox" checked={alerts.parentApp} onchange={() => toggleAlert('parentApp')} aria-label="App notifications to parents" /><i></i></label></div>
        <div class="kv"><div class="k"><b>Text messages (SMS)</b><span>Coming later. Works on any phone but costs per message.</span></div><span class="tag notyet">Later</span></div>
      </div>
    </div>
  {:else}
    <div class="spanel" role="tabpanel" style="max-width:760px">
      <div class="group-title" style="margin-top:0">Display</div>
      <div class="rows">
        <div class="kv"><div class="k"><b>Appearance</b></div>
          <div class="segset">{#each [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match device']] as [v, label]}
            <button type="button" class:on={theme === v} aria-pressed={theme === v} onclick={() => { theme = v as Theme; applyTheme(theme); }}>{label}</button>{/each}</div></div>
        <div class="kv"><div class="k"><b>Language</b><span>For the parent and student apps</span></div>
          <div class="segset">{#each [['en', 'English'], ['fil', 'Filipino']] as [v, label]}
            <button type="button" class:on={language === v} aria-pressed={language === v} onclick={() => { language = v as 'en' | 'fil'; setLanguage(db, userId, language); }}>{label}</button>{/each}</div></div>
      </div>
      <div class="group-title">Your data</div>
      <div class="rows">
        <div class="kv"><div class="k"><b>Attendance for a month</b><span>The month grid as a spreadsheet file (CSV)</span></div>
          <div style="display:flex;gap:8px;align-items:center">
            <label class="sr" for="csvMonth">Month</label>
            <select id="csvMonth" class="vsel" bind:value={month}>{#each months as m}<option value={m}>{fmtMonth(m)}</option>{/each}</select>
            <button class="mini-btn" type="button" onclick={download}>Download</button>
          </div></div>
      </div>
    </div>
  {/if}
</div>
