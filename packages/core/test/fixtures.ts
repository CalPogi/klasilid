import type { TapWindow } from '../src/types';
import { hm } from '../src/time';

export const amIn: TapWindow = { session: 'am', kind: 'in', opens: hm('06:30'), lateAfter: hm('07:15'), closes: hm('08:00'), effectiveFrom: '2026-06-01' };
export const amOut: TapWindow = { session: 'am', kind: 'out', opens: hm('11:30'), lateAfter: null, closes: hm('12:15'), effectiveFrom: '2026-06-01' };
export const pmIn: TapWindow = { session: 'pm', kind: 'in', opens: hm('12:30'), lateAfter: hm('13:00'), closes: hm('13:30'), effectiveFrom: '2026-06-01' };
export const pmOut: TapWindow = { session: 'pm', kind: 'out', opens: hm('16:00'), lateAfter: null, closes: hm('17:00'), effectiveFrom: '2026-06-01' };
export const W: TapWindow[] = [amIn, amOut, pmIn, pmOut];
