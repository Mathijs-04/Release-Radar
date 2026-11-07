import { describe, expect, it } from 'vitest';
import {
  agendaGroupOf,
  delayOptions,
  changePrecision,
  compareFuzzy,
  compareGroupOrder,
  countDelays,
  daysUntil,
  formatFuzzy,
  releaseState,
  windowOf,
} from './fuzzyDate';
import type { FuzzyDate } from './types';

const today = new Date(2026, 10, 7); // 7 Nov 2026

const day = (year: number, month: number, d: number): FuzzyDate => ({ precision: 'day', year, month, day: d });
const month = (year: number, m: number): FuzzyDate => ({ precision: 'month', year, month: m });
const quarter = (year: number, q: 1 | 2 | 3 | 4): FuzzyDate => ({ precision: 'quarter', year, quarter: q });
const half = (year: number, h: 1 | 2): FuzzyDate => ({ precision: 'half', year, half: h });
const year = (y: number): FuzzyDate => ({ precision: 'year', year: y });
const tba: FuzzyDate = { precision: 'tba' };

describe('windowOf', () => {
  it('covers whole quarters, including leap-year February', () => {
    const w = windowOf(quarter(2028, 1))!;
    expect(w.start).toEqual(new Date(2028, 0, 1));
    expect(w.end).toEqual(new Date(2028, 2, 31));
    expect(windowOf(month(2028, 2))!.end).toEqual(new Date(2028, 1, 29));
  });

  it('returns null for TBA', () => {
    expect(windowOf(tba)).toBeNull();
  });
});

describe('formatFuzzy', () => {
  it('formats every precision', () => {
    expect(formatFuzzy(day(2027, 8, 12))).toBe('12 Aug 2027');
    expect(formatFuzzy(month(2027, 8))).toBe('Aug 2027');
    expect(formatFuzzy(quarter(2027, 2))).toBe('Q2 2027');
    expect(formatFuzzy(half(2027, 1))).toBe('H1 2027');
    expect(formatFuzzy(year(2027))).toBe('2027');
    expect(formatFuzzy(tba)).toBe('TBA');
  });
});

describe('compareFuzzy', () => {
  it('sorts by end of window, finer precision first, TBA last', () => {
    const list = [tba, year(2027), quarter(2027, 2), month(2027, 6), day(2027, 5, 3), half(2027, 1)];
    const sorted = [...list].sort(compareFuzzy).map(formatFuzzy);
    expect(sorted).toEqual(['3 May 2027', 'Jun 2027', 'Q2 2027', 'H1 2027', '2027', 'TBA']);
  });
});

describe('releaseState', () => {
  it('handles exact and fuzzy dates', () => {
    expect(releaseState(day(2026, 11, 7), today)).toBe('released');
    expect(releaseState(day(2026, 11, 8), today)).toBe('upcoming');
    expect(releaseState(quarter(2026, 4), today)).toBe('in-window');
    expect(releaseState(quarter(2026, 3), today)).toBe('overdue');
    expect(releaseState(tba, today)).toBe('tba');
  });
});

describe('daysUntil', () => {
  it('only works for exact dates', () => {
    expect(daysUntil(day(2026, 11, 17), today)).toBe(10);
    expect(daysUntil(month(2026, 12), today)).toBeNull();
  });
});

describe('agendaGroupOf', () => {
  const label = (d: FuzzyDate) => agendaGroupOf(d, today).label;

  it('puts near dates in relative groups', () => {
    expect(label(day(2026, 11, 10))).toBe('This week');
    expect(label(day(2026, 11, 25))).toBe('This month');
    expect(label(month(2026, 11))).toBe('This month');
    expect(label(day(2026, 12, 20))).toBe('Next month');
    expect(label(day(2026, 11, 1))).toBe('Out now');
  });

  it('groups later dates by quarter, year or half', () => {
    expect(label(day(2027, 2, 14))).toBe('Q1 2027');
    expect(label(month(2027, 3))).toBe('Q1 2027');
    expect(label(quarter(2027, 1))).toBe('Q1 2027');
    expect(label(quarter(2026, 4))).toBe('Q4 2026');
    expect(label(year(2028))).toBe('2028 · sometime');
    expect(label(half(2027, 2))).toBe('H2 2027 · sometime');
    expect(label(tba)).toBe('To be announced');
    expect(label(quarter(2026, 3))).toBe('Window passed · needs update');
  });

  it('orders groups chronologically', () => {
    const dates = [tba, year(2027), quarter(2027, 4), half(2027, 2), day(2026, 11, 10), quarter(2027, 1), day(2026, 1, 1)];
    const groups = dates.map((d) => agendaGroupOf(d, today)).sort(compareGroupOrder);
    expect(groups.map((g) => g.label)).toEqual([
      'Out now',
      'This week',
      'Q1 2027',
      'Q4 2027',
      'H2 2027 · sometime',
      '2027 · sometime',
      'To be announced',
    ]);
  });
});

describe('countDelays', () => {
  it('counts only moves to a later window', () => {
    const history = [{ from: quarter(2026, 3) }, { from: quarter(2027, 1) }, { from: year(2027) }];
    // Q3'26 → Q1'27 (delay) → 2027 (delay) → Mar 2027 (earlier)
    expect(countDelays(history, month(2027, 3))).toBe(2);
  });
});

describe('changePrecision', () => {
  it('keeps the date as close as possible', () => {
    expect(changePrecision(day(2027, 8, 12), 'quarter')).toEqual(quarter(2027, 3));
    expect(changePrecision(quarter(2027, 3), 'month')).toEqual(month(2027, 7));
    expect(changePrecision(tba, 'year', today)).toEqual(year(2026));
  });
});

describe('delayOptions', () => {
  const labels = (d: FuzzyDate) => delayOptions(d, today).map((o) => `${o.hint}: ${formatFuzzy(o.date)}`);

  it('offers small steps for exact dates', () => {
    expect(labels(day(2026, 11, 12))).toEqual([
      '+1 week: 19 Nov 2026',
      '+1 month: 12 Dec 2026',
      'Next quarter: Q1 2027',
      'Next year: 2027',
      'No date: TBA',
    ]);
  });

  it('clamps month ends', () => {
    expect(labels(day(2027, 1, 31))[1]).toBe('+1 month: 28 Feb 2027');
  });

  it('moves fuzzy windows to the next one', () => {
    expect(labels(quarter(2027, 1))).toEqual([
      'Next quarter: Q2 2027',
      'Later this year: 2027',
      'Next year: 2028',
      'No date: TBA',
    ]);
    expect(labels(year(2027))).toEqual(['Next year: 2028', 'No date: TBA']);
    expect(labels(half(2027, 2))).toEqual(['Next half: H1 2028', 'Next year: 2028', 'No date: TBA']);
  });

  it('counts from today when the window already passed', () => {
    expect(labels(quarter(2026, 2))[0]).toBe('Next quarter: Q1 2027');
  });

  it('only offers a date for TBA', () => {
    expect(labels(tba)).toEqual([]);
  });
});
