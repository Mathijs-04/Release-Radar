import type { Entry } from './types';

/** Escape a TEXT value (RFC 5545 §3.3.11). */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Fold lines longer than 75 octets, never splitting a UTF-8 character (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateValue = (y: number, m: number, d: number) => `${y}${pad(m)}${pad(d)}`;

function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Builds an iCalendar file with an all-day event per exact release date.
 * Event UIDs are the milestone ids, so re-importing updates existing events
 * in calendar apps that support it instead of duplicating them.
 */
export function buildIcs(entries: Entry[], now = new Date()): { ics: string; count: number } {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Release Radar//Game releases//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Game releases',
  ];
  let count = 0;

  for (const { game, milestone } of entries) {
    const d = milestone.date;
    if (d.precision !== 'day' || !d.year || !d.month || !d.day) continue;
    const next = new Date(d.year, d.month - 1, d.day + 1);
    const hasEa = game.milestones.some((m) => m.kind === 'early-access');
    const suffix = milestone.kind === 'early-access' ? ' (Early Access)' : hasEa ? ' (1.0)' : '';
    const description = [
      game.platforms.length ? `Platforms: ${game.platforms.join(', ')}` : '',
      game.notes ?? '',
      game.link ?? '',
    ]
      .filter(Boolean)
      .join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${milestone.id}@release-radar`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART;VALUE=DATE:${dateValue(d.year, d.month, d.day)}`,
      `DTEND;VALUE=DATE:${dateValue(next.getFullYear(), next.getMonth() + 1, next.getDate())}`,
      `SUMMARY:${escapeText(`🎮 ${game.title}${suffix}`)}`,
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      ...(game.link ? [`URL:${game.link}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
    count++;
  }
  lines.push('END:VCALENDAR');
  return { ics: lines.map(foldLine).join('\r\n') + '\r\n', count };
}

export function downloadIcs(entries: Entry[]): number {
  const { ics, count } = buildIcs(entries);
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'game-releases.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return count;
}
