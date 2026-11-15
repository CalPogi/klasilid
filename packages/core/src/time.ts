import type { IsoDate, Minutes } from './types';

/** Manila is UTC+8 all year (no daylight saving). */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const manila = (iso: string): Date => new Date(Date.parse(iso) + MANILA_OFFSET_MS);

export function manilaDate(iso: string): IsoDate {
  return manila(iso).toISOString().slice(0, 10);
}

/** Minutes after Manila midnight; seconds are floored. */
export function manilaMinute(iso: string): Minutes {
  const d = manila(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** '07:15' -> 435 */
export function hm(s: string): Minutes {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}
