import { describe, expect, it } from 'vitest';
import { hm } from '../src/time';
import { validateWindows, windowsForDate } from '../src/windows';
import { amIn, amOut, pmIn, pmOut, W } from './fixtures';

describe('validateWindows', () => {
  it('accepts a valid set', () => {
    expect(validateWindows(W)).toEqual([]);
  });
  it('rejects late-after outside opens..closes', () => {
    expect(validateWindows([{ ...amIn, lateAfter: hm('08:30') }, amOut, pmIn, pmOut]))
      .toContain('Morning in: "late after" must be between opens and closes');
  });
  it('rejects overlapping windows', () => {
    expect(validateWindows([amIn, { ...amOut, opens: hm('07:50') }, pmIn, pmOut]))
      .toContain('Morning out overlaps Morning in');
  });
  it('requires late-after on in windows', () => {
    expect(validateWindows([{ ...amIn, lateAfter: null }, amOut, pmIn, pmOut]))
      .toContain('Morning in: "late after" is required');
  });
  it('rejects late-after on out windows', () => {
    expect(validateWindows([amIn, { ...amOut, lateAfter: hm('12:00') }, pmIn, pmOut]))
      .toContain('Morning out: "late after" is not used for out taps');
  });
  it('rejects opens not before closes', () => {
    expect(validateWindows([amIn, amOut, pmIn, { ...pmOut, opens: hm('17:00') }]))
      .toContain('Afternoon out: opens must be before closes');
  });
});

describe('windowsForDate', () => {
  const later = { ...amIn, lateAfter: hm('07:30'), effectiveFrom: '2026-11-10' };
  const amInOn = (d: string) => windowsForDate([...W, later], d).find(w => w.session === 'am' && w.kind === 'in')!;
  it('past days keep the old window', () => {
    expect(amInOn('2026-11-09').lateAfter).toBe(hm('07:15'));
  });
  it('the change applies from its date', () => {
    expect(amInOn('2026-11-10').lateAfter).toBe(hm('07:30'));
  });
  it('nothing before the first effective date', () => {
    expect(windowsForDate(W, '2026-05-31')).toEqual([]);
  });
  it('returns windows sorted by opens', () => {
    expect(windowsForDate([pmOut, amIn, pmIn, amOut], '2026-11-13').map(w => w.opens)).toEqual(W.map(w => w.opens));
  });
});
