export type Session = 'am' | 'pm';
export type TapKind = 'in' | 'out';
/** Minutes after Manila midnight, 0..1439. */
export type Minutes = number;
/** 'YYYY-MM-DD', a Manila calendar date. */
export type IsoDate = string;

export interface TapWindow {
  session: Session;
  kind: TapKind;
  opens: Minutes;
  /** null for 'out' windows */
  lateAfter: Minutes | null;
  closes: Minutes;
  effectiveFrom: IsoDate;
}

export interface Tap {
  id: string;
  cardUid: string;
  /** ISO 8601 UTC */
  at: string;
}

/** 'half' = no school in the afternoon */
export type DayType = 'school' | 'holiday' | 'suspension' | 'half';
export type HalfDayStatus = 'on_time' | 'late' | 'absent' | 'excused' | 'pending' | 'no_school';
export type Flag = 'after_closing' | 'no_time_out';
export type CorrectionReason =
  | 'forgot_card'
  | 'card_not_working'
  | 'tapped_by_classmate'
  | 'sick'
  | 'school_activity'
  | 'arrived_no_tap'
  | 'other';

export interface Correction {
  id: string;
  session: Session;
  status: 'on_time' | 'late' | 'absent' | 'excused';
  reason: CorrectionReason;
  reasonText?: string;
  /** ISO 8601 UTC */
  at: string;
}

export interface HalfDay {
  status: HalfDayStatus;
  flags: Flag[];
  inTapId?: string;
  outTapId?: string;
  correctionId?: string;
}

export interface ReviewItem {
  tapId: string;
  at: string;
  why: 'outside_window';
}

export interface DayResult {
  am: HalfDay;
  pm: HalfDay;
  review: ReviewItem[];
}
