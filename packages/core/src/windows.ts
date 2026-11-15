import type { IsoDate, Session, TapKind, TapWindow } from './types';

const ORDER: [Session, TapKind][] = [['am', 'in'], ['am', 'out'], ['pm', 'in'], ['pm', 'out']];

export function windowLabel(w: Pick<TapWindow, 'session' | 'kind'>): string {
  return `${w.session === 'am' ? 'Morning' : 'Afternoon'} ${w.kind}`;
}

/** Human-readable problems; [] means valid. */
export function validateWindows(ws: TapWindow[]): string[] {
  const errors: string[] = [];
  for (const w of ws) {
    const label = windowLabel(w);
    if (w.opens >= w.closes) errors.push(`${label}: opens must be before closes`);
    if (w.kind === 'in') {
      if (w.lateAfter === null) errors.push(`${label}: "late after" is required`);
      else if (w.lateAfter < w.opens || w.lateAfter > w.closes)
        errors.push(`${label}: "late after" must be between opens and closes`);
    } else if (w.lateAfter !== null) {
      errors.push(`${label}: "late after" is not used for out taps`);
    }
  }
  const ordered = ORDER.map(([s, k]) => ws.find(w => w.session === s && w.kind === k)).filter(
    (w): w is TapWindow => w !== undefined,
  );
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i - 1].closes >= ordered[i].opens)
      errors.push(`${windowLabel(ordered[i])} overlaps ${windowLabel(ordered[i - 1])}`);
  }
  return errors;
}

/** For each (session, kind), the window with the latest effectiveFrom <= date; sorted by opens. */
export function windowsForDate(all: TapWindow[], date: IsoDate): TapWindow[] {
  const picked = new Map<string, TapWindow>();
  for (const w of all) {
    if (w.effectiveFrom > date) continue;
    const key = `${w.session}-${w.kind}`;
    const cur = picked.get(key);
    if (!cur || w.effectiveFrom > cur.effectiveFrom) picked.set(key, w);
  }
  return [...picked.values()].sort((a, b) => a.opens - b.opens);
}
