import Dexie, { type EntityTable } from 'dexie';
import { normalizeFuzzy, sameFuzzy } from './fuzzyDate';
import type { FuzzyDate, Game, GameStatus, Milestone, StoredImage } from './types';

export const db = new Dexie('release-radar') as Dexie & {
  games: EntityTable<Game, 'id'>;
  images: EntityTable<StoredImage, 'id'>;
};

db.version(1).stores({
  games: 'id, title, status, coverId, updatedAt',
  images: 'id, createdAt',
});

export const newId = () => crypto.randomUUID();

/** Ask the browser not to evict our data under storage pressure. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Save a game. When a milestone's date changed compared to what is stored,
 * the previous date is appended to that milestone's history.
 */
export async function saveGame(game: Game): Promise<void> {
  await db.transaction('rw', db.games, async () => {
    const existing = await db.games.get(game.id);
    const now = new Date().toISOString();
    const milestones: Milestone[] = game.milestones.map((m) => {
      const date = normalizeFuzzy(m.date);
      const before = existing?.milestones.find((o) => o.id === m.id);
      if (before && !sameFuzzy(before.date, date)) {
        return { ...m, date, history: [...before.history, { from: before.date, changedAt: now }] };
      }
      return { ...m, date, history: before?.history ?? m.history };
    });
    await db.games.put({
      ...game,
      milestones,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  });
  void requestPersistentStorage();
}

/** Change one milestone's date; the old date goes into its history. */
export async function setMilestoneDate(gameId: string, milestoneId: string, date: FuzzyDate): Promise<void> {
  const game = await db.games.get(gameId);
  if (!game) return;
  await saveGame({ ...game, milestones: game.milestones.map((m) => (m.id === milestoneId ? { ...m, date } : m)) });
}

export async function setGameStatus(id: string, status: GameStatus): Promise<void> {
  await db.games.update(id, { status, updatedAt: new Date().toISOString() });
}

export async function deleteGame(id: string): Promise<void> {
  await db.games.delete(id);
}

export async function addImage(img: Omit<StoredImage, 'id' | 'createdAt'>): Promise<string> {
  const id = newId();
  await db.images.add({ ...img, id, createdAt: new Date().toISOString() });
  void requestPersistentStorage();
  return id;
}

/** Deletes an image and unlinks it from every game that used it as a cover. */
export async function deleteImage(id: string): Promise<void> {
  await db.transaction('rw', db.games, db.images, async () => {
    await db.games.where('coverId').equals(id).modify((g) => {
      delete g.coverId;
    });
    await db.images.delete(id);
  });
}
