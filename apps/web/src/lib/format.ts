import type { HalfDayStatus } from '@klasilid/core';

const MANILA = 'Asia/Manila';

/** '7:31 AM' in Manila time, whatever the device's zone. */
export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: MANILA, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** 'Fri, Nov 13' for a Manila calendar date. */
export function fmtDay(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(date + 'T00:00:00Z'));
}

/** 'Friday, November 13' for a Manila calendar date. */
export function fmtLongDay(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(date + 'T00:00:00Z'));
}

/** Labels follow the approved mockup: on time shows as "Present". */
export const STATUS_LABEL: Record<HalfDayStatus, string> = {
  on_time: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused', pending: 'Not yet', no_school: 'No school',
};

/** Minutes after Manila midnight → '7:15 AM'. */
export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** '2026-11' → 'November 2026'. */
export function fmtMonth(month: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(month + '-01T00:00:00Z'));
}
