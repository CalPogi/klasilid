import { expect, it } from 'vitest';
import { hm, manilaDate, manilaMinute } from '../src/time';

it('hm converts HH:MM to minutes', () => {
  expect(hm('07:15')).toBe(435);
  expect(hm('00:00')).toBe(0);
});

it('manilaDate rolls over at Manila midnight', () => {
  expect(manilaDate('2026-11-12T16:30:00Z')).toBe('2026-11-13');
  expect(manilaDate('2026-11-12T15:59:59Z')).toBe('2026-11-12');
});

it('manilaMinute floors seconds', () => {
  expect(manilaMinute('2026-11-12T23:15:59Z')).toBe(hm('07:15'));
  expect(manilaMinute('2026-11-12T23:16:00Z')).toBe(hm('07:16'));
});
