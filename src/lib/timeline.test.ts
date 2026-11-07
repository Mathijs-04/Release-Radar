import { describe, expect, it } from 'vitest';
import { axisTicks, buildScale, packLanes, spreadCards } from './timeline';

const today = new Date(2026, 10, 7); // 7 Nov 2026
const t = (y: number, m: number, d = 1) => new Date(y, m - 1, d).getTime();
const opts = { cardW: 100, gap: 14, lanes: 2 };
const width = (scale: ReturnType<typeof buildScale>, from: number, to: number) => scale.x(to) - scale.x(from);

describe('buildScale', () => {
  const empty = buildScale(today, [], null, opts);

  it('starts two months back and runs to at least the 4th year', () => {
    expect(empty.start).toBe(t(2026, 9));
    expect(empty.x(empty.start)).toBe(0);
    expect(empty.end).toBe(t(2030, 1));
  });

  it('keeps an empty calendar compact', () => {
    // A whole empty timeline fits in a few screens.
    expect(empty.width).toBeLessThan(3200);
    // The current month stays readable.
    expect(width(empty, t(2026, 11), t(2026, 12))).toBeCloseTo(2 * 114);
  });

  it('widens busy periods and leaves empty ones narrow', () => {
    const anchors = [t(2027, 5, 3), t(2027, 5, 10), t(2027, 5, 20), t(2027, 5, 28), t(2027, 5, 30)];
    const scale = buildScale(today, anchors, null, opts);
    const may = width(scale, t(2027, 5), t(2027, 6));
    const april = width(scale, t(2027, 4), t(2027, 5));
    // 5 cards over 2 rows need 3 columns.
    expect(may).toBeCloseTo(3 * 114 + 14);
    expect(april).toBeLessThan(60);
  });

  it('gives fewer columns when more rows fit on screen', () => {
    const anchors = Array.from({ length: 6 }, (_, i) => t(2027, 2, 1 + i * 4));
    const two = buildScale(today, anchors, null, { ...opts, lanes: 2 });
    const three = buildScale(today, anchors, null, { ...opts, lanes: 3 });
    expect(width(three, t(2027, 2), t(2027, 3))).toBeLessThan(width(two, t(2027, 2), t(2027, 3)));
  });

  it('uses quarters and then years further out', () => {
    const anchors = [t(2028, 8, 15), t(2031, 3, 1)];
    const scale = buildScale(today, anchors, new Date(2031, 11, 31), opts);
    expect(scale.end).toBe(t(2032, 1));
    // The 2028 card makes Q3 2028 wide enough for one card.
    expect(width(scale, t(2028, 7), t(2028, 10))).toBeGreaterThanOrEqual(114);
    // 2031 is a single year slot holding its card.
    expect(width(scale, t(2031, 1), t(2032, 1))).toBeGreaterThanOrEqual(114);
  });

  it('is monotonic and invertible', () => {
    const scale = buildScale(today, [t(2027, 1, 5), t(2027, 1, 6)], null, opts);
    let prev = -Infinity;
    for (let ts = scale.start; ts < scale.end; ts += 9 * 86_400_000) {
      const x = scale.x(ts);
      expect(x).toBeGreaterThan(prev);
      expect(scale.t(x)).toBeCloseTo(ts, -3);
      prev = x;
    }
  });

  it('counts anchors before the start in the first slot', () => {
    const scale = buildScale(today, [t(2026, 1, 1), t(2026, 2, 1), t(2026, 3, 1)], null, opts);
    expect(width(scale, t(2026, 9), t(2026, 10))).toBeGreaterThanOrEqual(2 * 114);
  });
});

describe('axisTicks', () => {
  const anchors = [t(2026, 12, 4), t(2027, 2, 1), t(2027, 3, 18)];
  const { months, years } = axisTicks(buildScale(today, anchors, null, opts));

  it('labels months that have room, and only those', () => {
    expect(months.find((m) => m.year === 2026 && m.month === 10)!.label).toBe('Nov');
    for (const m of months) if (m.label && !m.label.startsWith('Q')) expect(m.width).toBeGreaterThanOrEqual(44);
  });

  it('has one span per year, without gaps', () => {
    expect(years.map((y) => y.year)).toEqual([2026, 2027, 2028, 2029]);
    for (let i = 1; i < years.length; i++) {
      expect(years[i].x).toBeCloseTo(years[i - 1].x + years[i - 1].width);
    }
  });
});

describe('packLanes', () => {
  it('reuses lanes when items do not overlap', () => {
    const { placed, lanes } = packLanes(
      [
        { id: 'a', left: 0, right: 100 },
        { id: 'b', left: 50, right: 150 },
        { id: 'c', left: 120, right: 200 },
        { id: 'd', left: 160, right: 260 },
      ],
      10,
    );
    expect(lanes).toBe(2);
    expect(Object.fromEntries(placed.map((p) => [p.id, p.lane]))).toEqual({ a: 0, b: 1, c: 0, d: 1 });
  });

  it('slides items right instead of opening a lane beyond the limit', () => {
    const items = [
      { id: 'a', left: 0, right: 100 },
      { id: 'b', left: 20, right: 120 },
      { id: 'c', left: 40, right: 140 },
    ];
    const limited = packLanes(items, 10, { maxLanes: 2, maxShift: 80 });
    expect(limited.lanes).toBe(2);
    const c = limited.placed.find((p) => p.id === 'c')!;
    expect(c.lane).toBe(0);
    expect(c.left).toBe(110);
    // Too far to slide: a new lane after all.
    expect(packLanes(items, 10, { maxLanes: 2, maxShift: 50 }).lanes).toBe(3);
  });
});

describe('spreadCards', () => {
  it('puts fuzzy cards that start on the same day side by side', () => {
    const jan1 = t(2027, 1, 1);
    const anchors = [jan1, jan1, jan1, jan1];
    const scale = buildScale(today, anchors, null, opts);
    const x = scale.x(jan1);
    const lefts = spreadCards(
      anchors.map((anchor) => ({ anchor, exact: false, naturalL: x })),
      scale,
      opts,
    );
    // 4 cards, 2 rows: two columns, two cards each.
    expect(new Set(lefts.map(Math.round)).size).toBe(2);
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeCloseTo(114);
  });

  it('keeps exact dates on their date', () => {
    const d = t(2027, 3, 18);
    const scale = buildScale(today, [d, t(2027, 3, 1)], null, opts);
    const lefts = spreadCards(
      [
        { anchor: t(2027, 3, 1), exact: false, naturalL: scale.x(t(2027, 3, 1)) },
        { anchor: d, exact: true, naturalL: scale.x(d) - 14 },
      ],
      scale,
      opts,
    );
    expect(lefts[1]).toBeCloseTo(scale.x(d) - 14);
  });
});
