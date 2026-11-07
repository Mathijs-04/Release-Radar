import { describe, expect, it } from 'vitest';
import { buildIcs, foldLine } from './ics';
import type { Entry, Game } from './types';

const game = (over: Partial<Game> = {}): Game => ({
  id: 'g1',
  title: 'Starfall Tactics',
  milestones: [],
  platforms: ['PC', 'PS5'],
  hype: 2,
  status: 'tracking',
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('buildIcs', () => {
  const g = game({
    notes: 'Co-op; with friends, maybe',
    milestones: [
      { id: 'm1', kind: 'early-access', date: { precision: 'day', year: 2026, month: 12, day: 31 }, history: [] },
      { id: 'm2', kind: 'full-release', date: { precision: 'quarter', year: 2027, quarter: 2 }, history: [] },
    ],
  });
  const entries: Entry[] = g.milestones.map((milestone) => ({ game: g, milestone }));
  const { ics, count } = buildIcs(entries, new Date(Date.UTC(2026, 10, 7, 12, 0, 0)));

  it('exports only exact dates', () => {
    expect(count).toBe(1);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it('writes an all-day event that rolls over the year end', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101\r\n');
    expect(ics).toContain('DTSTAMP:20261107T120000Z');
    expect(ics).toContain('UID:m1@release-radar');
  });

  it('escapes text and uses CRLF', () => {
    expect(ics).toContain('SUMMARY:🎮 Starfall Tactics (Early Access)');
    expect(ics).toContain('Platforms: PC\\, PS5\\nCo-op\\; with friends\\, maybe');
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

describe('foldLine', () => {
  it('folds at 75 octets without splitting characters', () => {
    const line = 'SUMMARY:' + '🎮'.repeat(40);
    const folded = foldLine(line).split('\r\n');
    const enc = new TextEncoder();
    expect(folded.length).toBeGreaterThan(1);
    folded.forEach((part) => expect(enc.encode(part).length).toBeLessThanOrEqual(75));
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line);
  });
});
