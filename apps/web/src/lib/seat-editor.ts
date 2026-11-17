import type { LLearner } from './db';
import { shortName } from './format';
import { resize, unseated, type Layout } from './seats';

// The seat editor's rules (mockup's startEdit / clickSeat / act), shared by the laptop Seat plan and the phone editor.

/** What is picked: a learner from Not seated, or a seated learner. */
export type Pick = { type: 'stu'; id: string } | { type: 'seat'; idx: number } | null;

/** A tap on seat `idx`: seat the picked learner (moving the occupant out), swap two seats, or pick this seat. */
export function clickSeat(draft: Layout, sel: Pick, idx: number): { draft: Layout; sel: Pick; movedOut: string | null } {
  const seats = [...draft.seats];
  const v = seats[idx];
  if (sel?.type === 'stu') { seats[idx] = sel.id; return { draft: { ...draft, seats }, sel: null, movedOut: v }; }
  if (sel?.type === 'seat') {
    if (sel.idx !== idx) [seats[sel.idx], seats[idx]] = [seats[idx], seats[sel.idx]];
    return { draft: { ...draft, seats }, sel: null, movedOut: null };
  }
  return { draft, sel: v ? { type: 'seat', idx } : null, movedOut: null };
}

/** One row or seat more or fewer; `lost` learners no longer fit and become unseated. */
export function stepSize(draft: Layout, k: 'rows' | 'cols', d: number): { draft: Layout; lost: number } {
  const before = draft.seats.filter(Boolean).length;
  const next = resize(draft, k === 'rows' ? draft.rows + d : draft.rows, k === 'cols' ? draft.cols + d : draft.cols);
  return { draft: next, lost: before - next.seats.filter(Boolean).length };
}

/** The line under the editor. The laptop says "Click" and full names; the phone says "Tap" and short names. */
export function editorHint(draft: Layout, sel: Pick, learners: LLearner[], msg: string, verb: 'Click' | 'Tap'): string {
  if (msg) return msg;
  const v = verb.toLowerCase();
  const name = (id: string) => { const l = learners.find(x => x.id === id); return !l ? '' : verb === 'Tap' ? shortName(l) : `${l.firstName} ${l.lastName}`; };
  const end = (s: string) => (s.endsWith('.') ? s : s + '.'); // 'Ana G.' already ends the sentence
  if (sel?.type === 'stu') return end(`Now ${v} a seat for ${name(sel.id)}`);
  if (sel?.type === 'seat') return end(`${verb} another seat to move or swap ${name(draft.seats[sel.idx]!)}`);
  const n = unseated(draft, learners).length;
  return n ? `${n} learner${n > 1 ? 's' : ''} still without a seat.` : `${verb} a learner to move them. ${verb} two learners to swap them.`;
}
