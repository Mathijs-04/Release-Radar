import { db } from './db';
import type { Game, StoredImage } from './types';

const LAST_BACKUP_KEY = 'release-radar:last-backup';
const BACKUP_VERSION = 1;

interface BackupFile {
  app: 'release-radar';
  version: number;
  exportedAt: string;
  games: Game[];
  images: (Omit<StoredImage, 'blob'> & { dataUrl: string })[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** Downloads everything (games + images) as one JSON file. */
export async function exportBackup(): Promise<void> {
  const [games, images] = await Promise.all([db.games.toArray(), db.images.toArray()]);
  const file: BackupFile = {
    app: 'release-radar',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    games,
    images: await Promise.all(
      images.map(async ({ blob, ...rest }) => ({ ...rest, dataUrl: await blobToDataUrl(blob) })),
    ),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `release-radar-backup-${file.exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setLastBackup(file.exportedAt);
}

/**
 * Merges a backup into the current data. Items with the same id are replaced
 * by the backup's version; nothing that exists only locally is removed.
 */
export async function importBackup(file: File): Promise<{ games: number; images: number }> {
  const parsed = JSON.parse(await file.text()) as Partial<BackupFile>;
  if (parsed.app !== 'release-radar' || !Array.isArray(parsed.games) || !Array.isArray(parsed.images)) {
    throw new Error('This file is not a Release Radar backup.');
  }
  const images: StoredImage[] = await Promise.all(
    parsed.images.map(async ({ dataUrl, ...rest }) => ({ ...rest, blob: await dataUrlToBlob(dataUrl) })),
  );
  await db.transaction('rw', db.games, db.images, async () => {
    await db.images.bulkPut(images);
    await db.games.bulkPut(parsed.games!);
  });
  return { games: parsed.games.length, images: images.length };
}

export function getLastBackup(): Date | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

function setLastBackup(iso: string) {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, iso);
  } catch {
    /* storage unavailable: the reminder will just show again */
  }
}
