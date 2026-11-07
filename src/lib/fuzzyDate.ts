import type { DatePrecision, FuzzyDate } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/** Finer precisions rank lower, so "May 2027" sorts before "Q2 2027" when both end on the same day. */
export const PRECISION_RANK: Record<DatePrecision, number> = {
  day: 0,
  month: 1,
  quarter: 2,
  half: 3,
  year: 4,
  tba: 5,
};

export const PRECISION_LABEL: Record<DatePrecision, string> = {
  day: 'Day',
  month: 'Month',
  quarter: 'Quarter',
  half: 'Half',
  year: 'Year',
  tba: 'TBA',
};

export interface DateWindow {
  /** First day of the window (local midnight). */
  start: Date;
  /** Last day of the window (local midnight). */
  end: Date;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** The range of days a fuzzy date covers, or null for TBA / incomplete dates. */
export function windowOf(d: FuzzyDate): DateWindow | null {
  const { year } = d;
  if (d.precision === 'tba' || year === undefined) return null;
  switch (d.precision) {
    case 'day': {
      if (!d.month || !d.day) return null;
      const day = new Date(year, d.month - 1, d.day);
      return { start: day, end: day };
    }
    case 'month': {
      if (!d.month) return null;
      return {
        start: new Date(year, d.month - 1, 1),
        end: new Date(year, d.month - 1, lastDayOfMonth(year, d.month)),
      };
    }
    case 'quarter': {
      if (!d.quarter) return null;
      const firstMonth = (d.quarter - 1) * 3 + 1;
      const lastMonth = firstMonth + 2;
      return {
        start: new Date(year, firstMonth - 1, 1),
        end: new Date(year, lastMonth - 1, lastDayOfMonth(year, lastMonth)),
      };
    }
    case 'half': {
      if (!d.half) return null;
      return d.half === 1
        ? { start: new Date(year, 0, 1), end: new Date(year, 5, 30) }
        : { start: new Date(year, 6, 1), end: new Date(year, 11, 31) };
    }
    case 'year':
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
  }
}

/** Human label: "12 Aug 2027", "Aug 2027", "Q2 2027", "H1 2027", "2027", "TBA". */
export function formatFuzzy(d: FuzzyDate): string {
  if (d.precision === 'tba' || d.year === undefined) return 'TBA';
  switch (d.precision) {
    case 'day':
      return `${d.day} ${MONTHS[(d.month ?? 1) - 1]} ${d.year}`;
    case 'month':
      return `${MONTHS[(d.month ?? 1) - 1]} ${d.year}`;
    case 'quarter':
      return `Q${d.quarter} ${d.year}`;
    case 'half':
      return `H${d.half} ${d.year}`;
    case 'year':
      return `${d.year}`;
  }
}

/**
 * Sort by the latest day a release could land on (end of its window), so a
 * game is placed where it is *guaranteed* to be out. TBA always sorts last.
 */
export function compareFuzzy(a: FuzzyDate, b: FuzzyDate): number {
  const wa = windowOf(a);
  const wb = windowOf(b);
  if (!wa && !wb) return 0;
  if (!wa) return 1;
  if (!wb) return -1;
  const diff = wa.end.getTime() - wb.end.getTime();
  if (diff !== 0) return diff;
  return PRECISION_RANK[a.precision] - PRECISION_RANK[b.precision];
}

export function sameFuzzy(a: FuzzyDate, b: FuzzyDate): boolean {
  return formatFuzzy(a) === formatFuzzy(b) && a.precision === b.precision;
}

/** Keep only the fields that matter for the precision, so stored data stays clean. */
export function normalizeFuzzy(d: FuzzyDate): FuzzyDate {
  switch (d.precision) {
    case 'tba':
      return { precision: 'tba' };
    case 'day':
      return { precision: 'day', year: d.year, month: d.month, day: d.day };
    case 'month':
      return { precision: 'month', year: d.year, month: d.month };
    case 'quarter':
      return { precision: 'quarter', year: d.year, quarter: d.quarter };
    case 'half':
      return { precision: 'half', year: d.year, half: d.half };
    case 'year':
      return { precision: 'year', year: d.year };
  }
}

/** Convert a date to another precision, keeping it as close to the original as possible. */
export function changePrecision(d: FuzzyDate, precision: DatePrecision, today = new Date()): FuzzyDate {
  const w = windowOf(d);
  const ref = w ? w.start : today;
  const year = ref.getFullYear();
  const month = ref.getMonth() + 1;
  switch (precision) {
    case 'tba':
      return { precision };
    case 'day':
      return { precision, year, month, day: ref.getDate() };
    case 'month':
      return { precision, year, month };
    case 'quarter':
      return { precision, year, quarter: (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4 };
    case 'half':
      return { precision, year, half: month <= 6 ? 1 : 2 };
    case 'year':
      return { precision, year };
  }
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days from `today` until the date (negative when in the past). Only for exact dates. */
export function daysUntil(d: FuzzyDate, today = new Date()): number | null {
  if (d.precision !== 'day') return null;
  const w = windowOf(d);
  if (!w) return null;
  return Math.round((w.start.getTime() - startOfDay(today).getTime()) / DAY_MS);
}

export type ReleaseState = 'released' | 'overdue' | 'in-window' | 'upcoming' | 'tba';

/**
 * - released: an exact date that has come
 * - overdue: a fuzzy window that ended without an exact date being set
 *   ("Q3 2026" in November). It either came out or slipped, so it needs an update.
 * - in-window: today falls inside a fuzzy window ("Q4 2026" while it's November 2026)
 */
export function releaseState(d: FuzzyDate, today = new Date()): ReleaseState {
  const w = windowOf(d);
  if (!w) return 'tba';
  const t = startOfDay(today).getTime();
  if (d.precision === 'day') return w.start.getTime() <= t ? 'released' : 'upcoming';
  if (w.end.getTime() < t) return 'overdue';
  if (w.start.getTime() <= t) return 'in-window';
  return 'upcoming';
}

export interface AgendaGroup {
  key: string;
  label: string;
  /** Used to order groups; matches compareFuzzy ordering of their members. */
  order: [number, number];
}

/** Which agenda section a date belongs to, relative to today. */
export function agendaGroupOf(d: FuzzyDate, today = new Date()): AgendaGroup {
  const w = windowOf(d);
  if (!w) return { key: 'tba', label: 'To be announced', order: [Infinity, 0] };

  const t0 = startOfDay(today);
  const end = w.end.getTime();
  const state = releaseState(d, today);
  if (state === 'overdue') {
    return { key: 'overdue', label: 'Window passed · needs update', order: [-Infinity, -1] };
  }
  if (state === 'released') {
    return { key: 'released', label: 'Out now', order: [-Infinity, 0] };
  }

  // Relative groups always come first, in a fixed order.
  const REL = Number.MIN_SAFE_INTEGER;
  const weekEnd = t0.getTime() + 7 * DAY_MS;
  const monthEnd = new Date(t0.getFullYear(), t0.getMonth() + 1, 0).getTime();
  const nextMonthEnd = new Date(t0.getFullYear(), t0.getMonth() + 2, 0).getTime();
  const rank = PRECISION_RANK[d.precision];

  if (d.precision === 'day' || d.precision === 'month') {
    if (d.precision === 'day' && end < weekEnd) {
      return { key: 'week', label: 'This week', order: [REL, 1] };
    }
    if (end <= monthEnd) return { key: 'month', label: 'This month', order: [REL, 2] };
    if (end <= nextMonthEnd) return { key: 'next-month', label: 'Next month', order: [REL, 3] };
  }

  const y = w.end.getFullYear();
  if (d.precision === 'year') {
    return { key: `y-${y}`, label: `${y} · sometime`, order: [end, rank] };
  }
  if (d.precision === 'half') {
    const h = w.end.getMonth() < 6 ? 1 : 2;
    return { key: `h-${y}-${h}`, label: `H${h} ${y} · sometime`, order: [end, rank] };
  }
  // day, month, quarter → grouped by calendar quarter
  const q = Math.floor(w.end.getMonth() / 3) + 1;
  const qEnd = new Date(y, q * 3, 0).getTime();
  return { key: `q-${y}-${q}`, label: `Q${q} ${y}`, order: [qEnd, 0] };
}

export function compareGroupOrder(a: AgendaGroup, b: AgendaGroup): number {
  if (a.order[0] !== b.order[0]) return a.order[0] < b.order[0] ? -1 : 1;
  return a.order[1] - b.order[1];
}

/** Number of times a date was pushed back (moved to a later window). */
export function countDelays(history: { from: FuzzyDate }[], current: FuzzyDate): number {
  let delays = 0;
  const dates = [...history.map((h) => h.from), current];
  for (let i = 1; i < dates.length; i++) {
    if (compareFuzzy(dates[i], dates[i - 1]) > 0) delays++;
  }
  return delays;
}

function addMonths(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const day = Math.min(d.getDate(), lastDayOfMonth(target.getFullYear(), target.getMonth() + 1));
  return new Date(target.getFullYear(), target.getMonth(), day);
}

const dayDate = (d: Date): FuzzyDate => ({
  precision: 'day',
  year: d.getFullYear(),
  month: d.getMonth() + 1,
  day: d.getDate(),
});

export interface DelayOption {
  /** Short description of the step, e.g. "+1 week" or "Next quarter". */
  hint: string;
  date: FuzzyDate;
}

/**
 * Typical "it got delayed" moves for a date, counted from the end of its
 * current window (or from today, if the window already passed).
 */
export function delayOptions(d: FuzzyDate, today = new Date()): DelayOption[] {
  const w = windowOf(d);
  const t0 = startOfDay(today);
  const opts: DelayOption[] = [];

  if (w) {
    const base = w.end.getTime() > t0.getTime() ? w.end : t0;
    if (d.precision === 'day') {
      opts.push({ hint: '+1 week', date: dayDate(new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate() + 7)) });
      opts.push({ hint: '+1 month', date: dayDate(addMonths(w.start, 1)) });
    }
    if (d.precision === 'month') {
      const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
      opts.push({ hint: 'Next month', date: { precision: 'month', year: next.getFullYear(), month: next.getMonth() + 1 } });
    }
    if (d.precision !== 'year' && d.precision !== 'half') {
      const q = Math.floor(base.getMonth() / 3) + 1;
      const next = q === 4 ? { year: base.getFullYear() + 1, quarter: 1 } : { year: base.getFullYear(), quarter: q + 1 };
      opts.push({ hint: 'Next quarter', date: { precision: 'quarter', year: next.year, quarter: next.quarter as 1 | 2 | 3 | 4 } });
    }
    if (d.precision === 'half') {
      const next = base.getMonth() < 6 ? { year: base.getFullYear(), half: 2 } : { year: base.getFullYear() + 1, half: 1 };
      opts.push({ hint: 'Next half', date: { precision: 'half', year: next.year, half: next.half as 1 | 2 } });
    }
    if (d.precision !== 'year' && base.getMonth() < 9) {
      opts.push({ hint: 'Later this year', date: { precision: 'year', year: base.getFullYear() } });
    }
    opts.push({ hint: 'Next year', date: { precision: 'year', year: base.getFullYear() + 1 } });
  }
  opts.push({ hint: 'No date', date: { precision: 'tba' } });

  // Drop no-ops and duplicates.
  const seen = new Set<string>([formatFuzzy(d)]);
  return opts.filter((o) => {
    const key = formatFuzzy(o.date);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function todayAsFuzzy(today = new Date()): FuzzyDate {
  return dayDate(startOfDay(today));
}
