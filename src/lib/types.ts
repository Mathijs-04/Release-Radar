export type DatePrecision = 'day' | 'month' | 'quarter' | 'half' | 'year' | 'tba';

/** A release date that may only be known roughly ("Q2 2027", "2028", "TBA"). */
export interface FuzzyDate {
  precision: DatePrecision;
  year?: number;
  /** 1–12 */
  month?: number;
  day?: number;
  quarter?: 1 | 2 | 3 | 4;
  half?: 1 | 2;
}

export type MilestoneKind = 'early-access' | 'full-release';

export interface DateChange {
  /** The date as it was before this change. */
  from: FuzzyDate;
  /** ISO timestamp of when the change was made. */
  changedAt: string;
}

export interface Milestone {
  id: string;
  kind: MilestoneKind;
  date: FuzzyDate;
  history: DateChange[];
}

export type GameStatus = 'tracking' | 'archived';

export interface Game {
  id: string;
  title: string;
  /** Id of an image in the image library (IndexedDB). */
  coverId?: string;
  milestones: Milestone[];
  platforms: string[];
  hype: 1 | 2 | 3;
  link?: string;
  notes?: string;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
}

/** One milestone of one game: the unit shown on the agenda and the timeline. */
export interface Entry {
  game: Game;
  milestone: Milestone;
}

export interface StoredImage {
  id: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: string;
}

export const PLATFORMS = ['PC', 'PS5', 'Xbox', 'Switch 2', 'Mobile', 'VR'] as const;
