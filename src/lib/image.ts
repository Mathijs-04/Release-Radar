import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';

/** Covers are stored at a fixed 2:3 portrait size, like store/library art. */
export const COVER_WIDTH = 600;
export const COVER_HEIGHT = 900;
export const COVER_RATIO = COVER_WIDTH / COVER_HEIGHT;

/** Anything we can draw: a decoded bitmap or an <img>. */
export type Drawable = ImageBitmap | HTMLImageElement;

/**
 * Decode an uploaded file. createImageBitmap is fast, honours EXIF rotation and
 * does not depend on the page being visible; the <img> fallback covers
 * formats a browser can show but not decode into a bitmap (e.g. SVG).
 */
export async function loadImage(file: Blob): Promise<Drawable> {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Not an image'));
        img.src = url;
      });
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

export interface CropState {
  /** Image scale relative to the frame (1 = image width equals frame width). */
  zoom: number;
  /** Image centre offset from the frame centre, as a fraction of frame width/height. */
  x: number;
  y: number;
}

/** Zoom at which the image exactly covers the frame. */
export function coverZoom(img: { width: number; height: number }): number {
  const imgRatio = img.width / img.height;
  return imgRatio > COVER_RATIO ? imgRatio / COVER_RATIO : 1;
}

/** Zoom at which the whole image fits inside the frame. */
export function containZoom(img: { width: number; height: number }): number {
  const imgRatio = img.width / img.height;
  return imgRatio > COVER_RATIO ? 1 : imgRatio / COVER_RATIO;
}

/** Keep the image covering the frame on each axis where it is big enough to. */
export function clampCrop(img: { width: number; height: number }, c: CropState): CropState {
  const w = c.zoom; // image width in frame widths
  const h = (c.zoom * (img.height / img.width)) / (1 / COVER_RATIO); // image height in frame heights
  const clampAxis = (v: number, size: number) => {
    const limit = Math.abs(size - 1) / 2;
    return Math.min(limit, Math.max(-limit, v));
  };
  return { zoom: c.zoom, x: clampAxis(c.x, w), y: clampAxis(c.y, h) };
}

/**
 * Draws the crop into a W×H canvas. Areas the image does not cover are filled
 * with a blurred, enlarged copy of the image so wide key art still looks good.
 */
export function drawCrop(ctx: CanvasRenderingContext2D, img: Drawable, c: CropState, W: number, H: number) {
  ctx.clearRect(0, 0, W, H);
  const dw = c.zoom * W;
  const dh = dw * (img.height / img.width);

  if (dw < W - 0.5 || dh < H - 0.5) {
    const s = Math.max(W / img.width, H / img.height) * 1.15;
    ctx.save();
    ctx.filter = `blur(${Math.round(W / 20)}px) brightness(0.6) saturate(1.2)`;
    ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    ctx.restore();
  }

  const dx = W / 2 + c.x * W - dw / 2;
  const dy = H / 2 + c.y * H - dh / 2;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** Renders the final cover. Prefers WebP, falls back to JPEG where WebP encoding is unsupported. */
export async function renderCover(img: Drawable, c: CropState): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;
  drawCrop(canvas.getContext('2d')!, img, c, COVER_WIDTH, COVER_HEIGHT);
  const toBlob = (type: string, q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));
  const webp = await toBlob('image/webp', 0.88);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob('image/jpeg', 0.9);
  if (!jpeg) throw new Error('Could not encode image');
  return jpeg;
}

/** Object URL for a stored image; revoked automatically. */
export function useImageUrl(id: string | undefined): string | undefined {
  const blob = useLiveQuery(async () => (id ? (await db.images.get(id))?.blob : undefined), [id]);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** Pull the first image out of a paste or drop event. */
export function imageFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  for (const f of Array.from(dt.files ?? [])) {
    if (f.type.startsWith('image/')) return f;
  }
  return null;
}
