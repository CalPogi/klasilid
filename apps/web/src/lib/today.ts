import { manilaMinute, type HalfDayStatus, type Session } from '@klasilid/core';
import type { ClassDay, LearnerDay } from './attendance';
import { fmtTime } from './format';

// What the Today page (laptop) and Home (phone) both show: the to-do list, the attention line, the bell's notices.

export interface Todo { id: 'reader' | 'cards' | 'unknown' | 'clock'; title: string; sub: string; due: string }
export interface Notice { title: string; sub: string; tone: '' | 'bad' | 'warn' }

const taps = (n: number) => `${n} ${n === 1 ? 'tap' : 'taps'}`;

/** hasReader: a tap has arrived from a door reader, so it is paired and working. */
export function todayTodos(day: ClassDay, noCard: number, hasReader = false): Todo[] {
  return [
    ...(hasReader ? [] : [{ id: 'reader' as const, title: 'Pair your door reader', sub: 'Do this when your reader arrives', due: 'Later' }]),
    ...(noCard ? [{ id: 'cards' as const, title: `Register cards for ${noCard} learners`, sub: 'No RFID card yet', due: '' }] : []),
    ...(day.unknownTaps.length ? [{ id: 'unknown' as const, title: 'Check taps from unregistered cards', sub: day.unknownTaps.map(t => `${t.cardUid} · ${fmtTime(t.at)}`).join(', '), due: 'Today' }] : []),
    ...(day.suspectTaps.length ? [{ id: 'clock' as const, title: `The reader's clock looked wrong for ${taps(day.suspectTaps.length)}. Check them.`, sub: 'The time on those taps may be off', due: 'Today' }] : []),
  ];
}

export function todayNotices(day: ClassDay, refused: number, pending: number, online: boolean): Notice[] {
  return [
    ...(day.suspectTaps.length ? [{ title: `Reader clock looked wrong for ${taps(day.suspectTaps.length)}`, sub: 'Check the times on the Attendance page', tone: 'bad' as const }] : []),
    ...(day.unknownTaps.length ? [{ title: `${taps(day.unknownTaps.length)} from an unregistered card`, sub: day.unknownTaps.map(t => `${t.cardUid} · ${fmtTime(t.at)}`).join(', '), tone: 'warn' as const }] : []),
    ...(refused ? [{ title: `${refused} ${refused === 1 ? 'change' : 'changes'} the server refused`, sub: 'Kept on this device. Check the account or ask for help.', tone: 'bad' as const }] : []),
    ...(pending ? [{ title: `${pending} changes waiting to sync`, sub: online ? 'Sending now' : 'They send when the internet is back', tone: '' as const }] : []),
  ];
}

/** The line under a name on the attention list, and which half-day a tap corrects. */
export function attentionLine(r: LearnerDay, afternoon: boolean): { text: string; session: Session; status: HalfDayStatus } {
  const half: Session = afternoon ? 'pm' : 'am';
  const stray = r.review[0];
  if (stray) return { text: stray.why === 'no_time_in' ? `Tapped out ${fmtTime(stray.at)} with no time-in` : `Tapped ${fmtTime(stray.at)}, outside tap times`, session: manilaMinute(stray.at) >= 12 * 60 ? 'pm' : 'am', status: r.am.status };
  const s: Session = r.pm.flags.includes('after_closing') && !r.am.flags.includes('after_closing') ? 'pm' : half;
  const tap = r.taps.find(x => x.id === r[s].inTapId);
  if (r[s].flags.includes('after_closing')) return { text: `Came after closing${tap ? ' · ' + fmtTime(tap.at) : ''}`, session: s, status: r[s].status };
  return { text: tap ? `Tapped ${fmtTime(tap.at)}` : afternoon ? 'No tap this afternoon' : 'No tap this morning', session: s, status: r[s].status };
}
