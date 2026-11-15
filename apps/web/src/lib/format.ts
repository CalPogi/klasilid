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
