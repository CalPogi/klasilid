import { describe, expect, it } from 'vitest';
import { computeDay, type DayInput } from '../src/status';
import type { Correction, Tap } from '../src/types';
import { W } from './fixtures';

const DATE = '2026-11-13';
/** Manila wall-clock time on DATE -> ISO UTC */
const at = (hms: string, date = DATE): string => {
  const [h, m, s = 0] = hms.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m, s) - 8 * 3600_000).toISOString();
};
const tap = (id: string, hms: string): Tap => ({ id, cardUid: '04A1B2C3', at: at(hms) });
const day = (over: Partial<DayInput> = {}): DayInput => ({
  date: DATE, taps: [], windows: W, dayType: 'school', corrections: [], now: at('20:00'), ignoreRepeatMinutes: 3, ...over,
});

describe('morning in', () => {
  it('on time at 07:15:59, late at 07:16:00', () => {
    expect(computeDay(day({ taps: [tap('a', '07:15:59')] })).am.status).toBe('on_time');
    expect(computeDay(day({ taps: [tap('a', '07:16:00')] })).am.status).toBe('late');
  });
  it('tap exactly at closes 08:00:00 is late, not after_closing', () => {
    const r = computeDay(day({ taps: [tap('a', '08:00:00')] }));
    expect(r.am).toMatchObject({ status: 'late', inTapId: 'a' });
    expect(r.am.flags).not.toContain('after_closing');
  });
  it('08:20 with no earlier in-tap is late + after_closing', () => {
    const r = computeDay(day({ taps: [tap('a', '08:20:00')] }));
    expect(r.am).toMatchObject({ status: 'late', inTapId: 'a' });
    expect(r.am.flags).toContain('after_closing');
    expect(r.review).toEqual([]);
  });
  it('08:20 after a 07:10 tap goes to review, status stays on_time', () => {
    const r = computeDay(day({ taps: [tap('a', '07:10:00'), tap('b', '08:20:00')] }));
    expect(r.am.status).toBe('on_time');
    expect(r.review).toEqual([{ tapId: 'b', at: at('08:20:00'), why: 'outside_window' }]);
  });
  it('a 10:00 tap with no in-tap counts as after_closing late', () => {
    const r = computeDay(day({ taps: [tap('a', '10:00:00')] }));
    expect(r.am.flags).toContain('after_closing');
  });
  it('a 10:00 tap after a 07:00 tap goes to review', () => {
    const r = computeDay(day({ taps: [tap('a', '07:00:00'), tap('b', '10:00:00')] }));
    expect(r.review.map(x => x.tapId)).toEqual(['b']);
  });
});

describe('no tap', () => {
  it('pending at 07:59 Manila, absent at 08:01', () => {
    expect(computeDay(day({ now: at('07:59:00') })).am.status).toBe('pending');
    expect(computeDay(day({ now: at('08:01:00') })).am.status).toBe('absent');
  });
  it('a past date is absent whatever the time of day', () => {
    expect(computeDay(day({ now: at('06:00:00', '2026-11-14') })).pm.status).toBe('absent');
  });
});

describe('repeat taps', () => {
  it('repeat taps within ignoreRepeatMinutes are dropped, not reviewed', () => {
    const r = computeDay(day({ taps: [tap('b', '07:12:00'), tap('a', '07:10:00')] }));
    expect(r.am.inTapId).toBe('a');
    expect(r.review).toEqual([]);
  });
  it('a second in-window tap after the repeat time is ignored, not reviewed', () => {
    const r = computeDay(day({ taps: [tap('a', '07:00:00'), tap('b', '07:20:00')] }));
    expect(r.am).toMatchObject({ status: 'on_time', inTapId: 'a' });
    expect(r.review).toEqual([]);
  });
});

describe('time out', () => {
  it('missing out-tap adds no_time_out once its window closed', () => {
    const r = computeDay(day({ taps: [tap('a', '07:00:00')] }));
    expect(r.am.flags).toContain('no_time_out');
    expect(r.am.status).toBe('on_time');
  });
  it('no no_time_out before the out window closes', () => {
    const r = computeDay(day({ taps: [tap('a', '07:00:00')], now: at('12:00:00') }));
    expect(r.am.flags).not.toContain('no_time_out');
  });
  it('an out tap sets outTapId and no flag', () => {
    const r = computeDay(day({ taps: [tap('a', '07:00:00'), tap('o', '11:45:00')] }));
    expect(r.am).toMatchObject({ outTapId: 'o', flags: [] });
  });
  it('an absent half-day gets no no_time_out flag', () => {
    expect(computeDay(day()).pm.flags).toEqual([]);
  });
  it('a tap after the last window closes goes to review', () => {
    const r = computeDay(day({ taps: [tap('p', '13:00:00'), tap('z', '17:30:00')] }));
    expect(r.review.map(x => x.tapId)).toEqual(['z']);
  });
});

describe('no school', () => {
  it('holiday: both halves no_school and no review', () => {
    const r = computeDay(day({ dayType: 'holiday', taps: [tap('a', '07:00:00'), tap('b', '10:00:00')] }));
    expect(r.am).toEqual({ status: 'no_school', flags: [] });
    expect(r.pm).toEqual({ status: 'no_school', flags: [] });
    expect(r.review).toEqual([]);
  });
  it('half day: afternoon no_school, morning counted', () => {
    const r = computeDay(day({ dayType: 'half', taps: [tap('a', '07:00:00'), tap('p', '12:40:00')] }));
    expect(r.am.status).toBe('on_time');
    expect(r.pm).toEqual({ status: 'no_school', flags: [] });
    expect(r.review).toEqual([]);
  });
});

describe('corrections', () => {
  const c = (id: string, status: Correction['status'], atIso: string, session: Correction['session'] = 'am'): Correction =>
    ({ id, session, status, reason: 'tapped_by_classmate', at: atIso });
  it('newest correction wins and keeps flags', () => {
    const r = computeDay(day({
      taps: [tap('a', '08:20:00')],
      corrections: [c('c2', 'absent', '2026-11-13T02:00:00Z'), c('c1', 'on_time', '2026-11-13T01:00:00Z')],
    }));
    expect(r.am).toMatchObject({ status: 'absent', correctionId: 'c2' });
    expect(r.am.flags).toContain('after_closing');
  });
  it('excused via correction', () => {
    const r = computeDay(day({ corrections: [{ ...c('e', 'excused', '2026-11-13T05:00:00Z', 'pm'), reason: 'sick' }] }));
    expect(r.pm).toMatchObject({ status: 'excused', correctionId: 'e' });
  });
});
