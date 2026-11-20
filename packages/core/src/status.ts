import { manilaDate, manilaMinute } from './time';
import type {
  Correction, DayResult, DayType, HalfDay, IsoDate, ReviewItem, Session, Tap, TapWindow,
} from './types';

export interface DayInput {
  date: IsoDate;
  /** This learner's taps for this date, any order. */
  taps: Tap[];
  /** Already filtered with windowsForDate. */
  windows: TapWindow[];
  dayType: DayType;
  /** This learner, this date. */
  corrections: Correction[];
  /** ISO UTC. For past dates pass any time after the day ends. */
  now: string;
  ignoreRepeatMinutes: 1 | 3 | 5 | 10;
  /** Teacher setting: false ignores taps outside every window instead of listing them for review. Default true. */
  reviewOutside?: boolean;
}

const END_OF_DAY = 24 * 60;

/** Attendance status for one learner on one day (spec §7.1). Pure: time comes only from `now`. */
export function computeDay(input: DayInput): DayResult {
  const { date, windows, dayType, corrections, now } = input;
  const ws = [...windows].sort((a, b) => a.opens - b.opens);
  const noSchool: Record<Session, boolean> = {
    am: dayType === 'holiday' || dayType === 'suspension',
    pm: dayType !== 'school',
  };
  const half: Record<Session, HalfDay> = { am: { status: 'pending', flags: [] }, pm: { status: 'pending', flags: [] } };
  const hasIn: Record<Session, boolean> = { am: false, pm: false };
  const review: ReviewItem[] = [];

  // A window has closed when `now` is on a later date, or past its closing minute today.
  const nowDate = manilaDate(now);
  const nowMinute = manilaMinute(now);
  const closed = (w: TapWindow) => nowDate > date || (nowDate === date && nowMinute > w.closes);

  const pmStart = ws.find(w => w.session === 'pm')?.opens ?? END_OF_DAY;
  const sessionOf = (minute: number): Session => (minute < pmStart ? 'am' : 'pm');

  for (const t of dropRepeats(input.taps, input.ignoreRepeatMinutes)) {
    if (manilaDate(t.at) !== date) continue;
    const m = manilaMinute(t.at);
    const w = ws.find(x => x.opens <= m && m <= x.closes);
    if (w) {
      if (noSchool[w.session]) continue;
      const h = half[w.session];
      if (w.kind === 'in' && !hasIn[w.session]) {
        hasIn[w.session] = true;
        h.inTapId = t.id;
        h.status = m <= (w.lateAfter ?? w.closes) ? 'on_time' : 'late';
      } else if (w.kind === 'out' && !hasIn[w.session]) {
        // Evidence they were here without a time-in: let the teacher decide rather than hiding it.
        review.push({ tapId: t.id, at: t.at, why: 'no_time_in' });
      } else if (w.kind === 'out' && !h.outTapId) {
        h.outTapId = t.id;
      }
      continue; // later matching taps are ignored, not reviewed
    }
    // Between an in-window's close and the next window's open: a late arrival, if no in-tap yet.
    const i = ws.findIndex((x, k) => x.kind === 'in' && x.closes < m && m < (ws[k + 1]?.opens ?? END_OF_DAY));
    const late = i >= 0 ? ws[i] : undefined;
    if (late && !noSchool[late.session] && !hasIn[late.session]) {
      hasIn[late.session] = true;
      Object.assign(half[late.session], { inTapId: t.id, status: 'late' });
      half[late.session].flags.push('after_closing');
      continue;
    }
    if (!noSchool[sessionOf(m)]) review.push({ tapId: t.id, at: t.at, why: 'outside_window' });
  }

  for (const s of ['am', 'pm'] as const) {
    if (noSchool[s]) {
      half[s] = { status: 'no_school', flags: [] };
    } else {
      const inW = ws.find(w => w.session === s && w.kind === 'in');
      const outW = ws.find(w => w.session === s && w.kind === 'out');
      if (!hasIn[s] && inW && closed(inW)) half[s].status = 'absent';
      if (hasIn[s] && outW && closed(outW) && !half[s].outTapId) half[s].flags.push('no_time_out');
    }
    const newest = corrections
      .filter(c => c.session === s)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    if (newest) {
      half[s].status = newest.status;
      half[s].correctionId = newest.id;
    }
  }
  return { am: half.am, pm: half.pm, review: input.reviewOutside === false ? [] : review };
}

/** Sorted by time; drops any tap within `minutes` of the last kept tap. */
function dropRepeats(taps: Tap[], minutes: number): Tap[] {
  const kept: Tap[] = [];
  let last = -Infinity;
  for (const t of [...taps].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const ms = Date.parse(t.at);
    if (ms - last < minutes * 60_000) continue;
    kept.push(t);
    last = ms;
  }
  return kept;
}
