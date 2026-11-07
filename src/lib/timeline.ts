import { startOfDay } from './fuzzyDate';

export const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Zoom sets the card size: smaller cards fit more games on screen. */
export const CARD_SIZES = { compact: 72, normal: 100, large: 128 } as const;
export type Zoom = keyof typeof CARD_SIZES;

export interface TimeScale {
  start: number;
  end: number;
  width: number;
  /** Timestamp → x in px. */
  x(t: number): number;
  /** x in px → timestamp. */
  t(x: number): number;
  /** The calendar slot (month, quarter or year) a timestamp falls in, in px. */
  slotAt(t: number): { x0: number; width: number };
}

export interface ScaleOptions {
  /** Card width in px. */
  cardW: number;
  /** Horizontal gap between cards. */
  gap: number;
  /** How many card rows fit on screen; busy periods are made wide enough to fill them. */
  lanes: number;
}

type SlotKind = 'past' | 'month' | 'quarter' | 'year';

interface Slot {
  start: number;
  end: number;
  kind: SlotKind;
  x0: number;
  width: number;
}

/**
 * Calendar slots that get coarser further out: the last 2 months and the next
 * 12 as months, then quarters up to the 4th year, then whole years.
 */
function calendarSlots(today: Date, end: number): Omit<Slot, 'x0' | 'width'>[] {
  const y = today.getFullYear();
  const m = today.getMonth();
  const slots: Omit<Slot, 'x0' | 'width'>[] = [];
  const push = (from: Date, to: Date, kind: SlotKind) => slots.push({ start: from.getTime(), end: to.getTime(), kind });

  for (let i = -2; i < 12; i++) push(new Date(y, m + i, 1), new Date(y, m + i + 1, 1), i < 0 ? 'past' : 'month');
  let cursor = new Date(y, m + 12, 1);
  while (cursor.getMonth() % 3 !== 0) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    push(cursor, next, 'month');
    cursor = next;
  }
  const quartersEnd = new Date(y + 4, 0, 1).getTime();
  while (cursor.getTime() < Math.min(quartersEnd, end)) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
    push(cursor, next, 'quarter');
    cursor = next;
  }
  while (cursor.getTime() < end) {
    const next = new Date(cursor.getFullYear() + 1, 0, 1);
    push(cursor, next, 'year');
    cursor = next;
  }
  return slots;
}

/**
 * A content-aware time axis. Every calendar slot gets a small minimum width,
 * and slots with releases grow until their cards fit in the visible rows.
 * Empty stretches collapse, so far-away games come into view sooner.
 *
 * @param anchors timestamps where cards start (exact dates and window starts)
 * @param lastDate the latest date that must fit (end of the furthest window)
 */
export function buildScale(today: Date, anchors: number[], lastDate: Date | null, opts: ScaleOptions): TimeScale {
  const minEnd = new Date(today.getFullYear() + 4, 0, 1).getTime();
  const neededEnd = lastDate ? new Date(lastDate.getFullYear() + 1, 0, 1).getTime() : 0;
  const end = Math.max(minEnd, neededEnd);
  const per = opts.cardW + opts.gap;
  const lanes = Math.max(1, opts.lanes);

  const base = calendarSlots(today, end);
  const counts = new Array<number>(base.length).fill(0);
  for (const a of anchors) {
    let i = base.findIndex((s) => a < s.end);
    if (i === -1) i = base.length - 1;
    counts[i]++;
  }

  const t0 = startOfDay(today).getTime();
  const minWidth = (s: (typeof base)[number]): number => {
    if (s.start <= t0 && t0 < s.end) return 2 * per; // keep the current month readable
    switch (s.kind) {
      case 'past':
        return 0.4 * per;
      case 'month':
        return 0.42 * per;
      case 'quarter':
        return 0.7 * per;
      case 'year':
        return 0.9 * per;
    }
  };

  let x = 0;
  const slots: Slot[] = base.map((s, i) => {
    const n = counts[i];
    const needed = n ? Math.ceil(n / lanes) * per + opts.gap : 0;
    const width = Math.max(minWidth(s), needed);
    const slot = { ...s, x0: x, width };
    x += width;
    return slot;
  });

  const first = slots[0];
  const last = slots[slots.length - 1];
  const at = (t: number) => (t < first.start ? first : (slots.find((s) => t < s.end) ?? last));

  return {
    start: first.start,
    end,
    width: x,
    x(t) {
      const s = at(t);
      return s.x0 + ((t - s.start) / (s.end - s.start)) * s.width;
    },
    t(px) {
      const s = px < 0 ? first : (slots.find((sl) => px < sl.x0 + sl.width) ?? last);
      return s.start + ((px - s.x0) / s.width) * (s.end - s.start);
    },
    slotAt(t) {
      const s = at(t);
      return { x0: s.x0, width: s.width };
    },
  };
}

export interface CardItem {
  /** Natural card position (exact date minus pin offset, or window start). */
  naturalL: number;
  /** Exact dates keep their position; fuzzy ones may slide right within their slot. */
  exact: boolean;
  /** Timestamp the card belongs to (used to find its slot). */
  anchor: number;
}

/**
 * Spread cards that share a slot over the columns the scale made room for,
 * so fuzzy dates that all start on the same day (e.g. "2027" and "Q1 2027")
 * sit side by side instead of piling up. Returns the card left per item.
 */
export function spreadCards(items: CardItem[], scale: TimeScale, opts: ScaleOptions): number[] {
  const per = opts.cardW + opts.gap;
  const lanes = Math.max(1, opts.lanes);
  const result = items.map((i) => i.naturalL);
  const bySlot = new Map<number, number[]>();
  items.forEach((item, idx) => {
    const key = scale.slotAt(item.anchor).x0;
    bySlot.set(key, [...(bySlot.get(key) ?? []), idx]);
  });
  for (const [x0, idxs] of bySlot) {
    const { width } = scale.slotAt(items[idxs[0]].anchor);
    const cols = Math.max(1, Math.floor((width - opts.gap) / per));
    idxs.sort((a, b) => items[a].naturalL - items[b].naturalL);
    idxs.forEach((idx, rank) => {
      if (items[idx].exact) return;
      const col = Math.floor(rank / lanes) % cols;
      result[idx] = Math.max(items[idx].naturalL, x0 + opts.gap / 2 + col * per);
    });
  }
  return result;
}

export interface MonthTick {
  x: number;
  width: number;
  year: number;
  month: number;
  /** "Jan", "Q2", or null when there is no room for a label. */
  label: string | null;
}

export interface YearSpan {
  year: number;
  x: number;
  width: number;
}

export interface WeekTick {
  x: number;
  label: string;
}

export function axisTicks(scale: TimeScale) {
  const months: MonthTick[] = [];
  const years: YearSpan[] = [];
  const weeks: WeekTick[] = [];

  const s = new Date(scale.start);
  let cursor = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cursor.getTime() < scale.end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const next = new Date(y, m + 1, 1);
    const x = Math.max(0, scale.x(cursor.getTime()));
    const width = scale.x(Math.min(next.getTime(), scale.end)) - x;
    let label: string | null = null;
    if (width >= 44) label = MONTHS[m];
    else if (m % 3 === 0) {
      const qWidth = scale.x(new Date(y, m + 3, 1).getTime()) - x;
      if (qWidth >= 34) label = `Q${m / 3 + 1}`;
    }
    months.push({ x, width, year: y, month: m, label });
    cursor = next;
  }

  for (let y = s.getFullYear(); new Date(y, 0, 1).getTime() < scale.end; y++) {
    const x = Math.max(0, scale.x(new Date(y, 0, 1).getTime()));
    const width = scale.x(Math.min(new Date(y + 1, 0, 1).getTime(), scale.end)) - x;
    if (width > 0) years.push({ year: y, x, width });
  }

  // Monday ticks, only where weeks are wide enough to read.
  const monday = new Date(s);
  monday.setDate(s.getDate() + ((8 - s.getDay()) % 7));
  for (let d = monday; d.getTime() < scale.end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
    const x = scale.x(d.getTime());
    const weekWidth = scale.x(d.getTime() + 7 * DAY_MS) - x;
    if (weekWidth < 40) continue;
    // Keep clear of month labels: skip ticks right after or just before a month start.
    const monthStart = scale.x(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
    const nextMonth = scale.x(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime());
    if (x - monthStart < 34 || nextMonth - x < 22) continue;
    weeks.push({ x, label: String(d.getDate()) });
  }

  return { months, years, weeks };
}

export interface Span {
  left: number;
  right: number;
}

/**
 * Greedy interval packing: each item goes into the first lane where it fits.
 * When all `maxLanes` lanes are taken, an item may slide right by up to
 * `maxShift` px into the lane that frees up first, before a new lane is opened.
 * Returned items carry their final `left`/`right`.
 */
export function packLanes<T extends Span>(
  items: T[],
  gap = 12,
  { maxLanes = Infinity, maxShift = 0 }: { maxLanes?: number; maxShift?: number } = {},
): { placed: (T & { lane: number })[]; lanes: number } {
  const sorted = [...items].sort((a, b) => a.left - b.left || a.right - b.right);
  const laneEnds: number[] = [];
  const placed = sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end + gap <= item.left);
    let shift = 0;
    if (lane === -1 && laneEnds.length >= maxLanes) {
      const earliest = laneEnds.reduce((best, end, i) => (end < laneEnds[best] ? i : best), 0);
      const needed = laneEnds[earliest] + gap - item.left;
      if (needed <= maxShift) {
        lane = earliest;
        shift = needed;
      }
    }
    const left = item.left + shift;
    const right = item.right + shift;
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(right);
    } else {
      laneEnds[lane] = right;
    }
    return { ...item, left, right, lane };
  });
  return { placed, lanes: laneEnds.length };
}
