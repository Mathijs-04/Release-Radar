import { daysUntil, releaseState } from './fuzzyDate';
import type { Entry, Game } from './types';

const SEEN_KEY = 'release-radar:seen-out-now';
/** How long a release counts as "out now" for the banner. */
const OUT_NOW_DAYS = 14;
/** Fully released games older than this are suggested for archiving. */
const STALE_DAYS = 30;

export interface Attention {
  /** Fuzzy windows that ended without an exact date: released or delayed? */
  overdue: Entry[];
  /** Games whose every milestone came out a while ago. */
  stale: Entry[];
  /** Exact releases from the last two weeks. */
  outNow: Entry[];
}

export function computeAttention(games: Game[], today = new Date()): Attention {
  const overdue: Entry[] = [];
  const stale: Entry[] = [];
  const outNow: Entry[] = [];

  for (const game of games) {
    if (game.status !== 'tracking') continue;
    for (const milestone of game.milestones) {
      const state = releaseState(milestone.date, today);
      if (state === 'overdue') overdue.push({ game, milestone });
      const days = daysUntil(milestone.date, today);
      if (state === 'released' && days !== null && days >= -OUT_NOW_DAYS) outNow.push({ game, milestone });
    }
    const allOldReleases = game.milestones.every((m) => {
      const days = daysUntil(m.date, today);
      return days !== null && days <= -STALE_DAYS;
    });
    if (game.milestones.length && allOldReleases) {
      stale.push({ game, milestone: game.milestones[game.milestones.length - 1] });
    }
  }
  return { overdue, stale, outNow };
}

export function getSeenOutNow(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Remember dismissed "out now" milestones. Only ids still in the list are kept, so it never grows forever. */
export function markOutNowSeen(ids: string[], stillRelevant: string[]): Set<string> {
  const keep = new Set(stillRelevant);
  const next = new Set([...getSeenOutNow()].filter((id) => keep.has(id)));
  ids.forEach((id) => next.add(id));
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
  } catch {
    /* ignore */
  }
  return next;
}
