import type { Entry, MilestoneKind } from './types';

export interface Filters {
  kind: 'all' | MilestoneKind;
  /** Empty = all platforms. Otherwise a game must have at least one of these. */
  platforms: string[];
  minHype: 1 | 2 | 3;
}

export const DEFAULT_FILTERS: Filters = { kind: 'all', platforms: [], minHype: 1 };
const KEY = 'release-radar:filters';

export function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...(JSON.parse(raw) as Partial<Filters>) };
  } catch {
    /* ignore */
  }
  return DEFAULT_FILTERS;
}

export function saveFilters(f: Filters) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}

export function activeFilterCount(f: Filters): number {
  return (f.kind !== 'all' ? 1 : 0) + (f.platforms.length ? 1 : 0) + (f.minHype > 1 ? 1 : 0);
}

export function applyFilters(entries: Entry[], f: Filters, query = ''): Entry[] {
  const q = query.trim().toLowerCase();
  return entries.filter(({ game, milestone }) => {
    if (f.kind !== 'all' && milestone.kind !== f.kind) return false;
    if (f.platforms.length && !game.platforms.some((p) => f.platforms.includes(p))) return false;
    if (game.hype < f.minHype) return false;
    if (q && !game.title.toLowerCase().includes(q) && !game.notes?.toLowerCase().includes(q)) return false;
    return true;
  });
}
