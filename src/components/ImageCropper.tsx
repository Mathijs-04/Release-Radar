import { useEffect, useRef, useState } from 'react';
import { addImage } from '../lib/db';
import {
  COVER_HEIGHT,
  COVER_WIDTH,
  clampCrop,
  containZoom,
  coverZoom,
  drawCrop,
  loadImage,
  renderCover,
  type CropState,
  type Drawable,
} from '../lib/image';
import { Modal } from './Modal';

interface Props {
  file: File | null;
  onClose: () => void;
  /** Called with the id of the newly stored image. */
  onSaved: (imageId: string) => void;
}

const FRAME_W = 280;

/** Lets the user frame any uploaded image as a 2:3 portrait cover. */
export function ImageCropper({ file, onClose, onSaved }: Props) {
  const [img, setImg] = useState<Drawable | null>(null);
  const [crop, setCrop] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    setImg(null);
    setError(undefined);
    if (!file) return;
    let cancelled = false;
    loadImage(file)
      .then((loaded) => {
        if (cancelled) return;
        setImg(loaded);
        setCrop({ zoom: coverZoom(loaded), x: 0, y: 0 });
      })
      .catch(() => !cancelled && setError('This file could not be read as an image.'));
    return () => {
      cancelled = true;
    };
  }, [file]);

  // The frame is fluid (max 280px wide), so redraw on crop changes and on resize.
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !img || !canvas.clientWidth) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    drawCrop(canvas.getContext('2d')!, img, cropRef.current, canvas.width, canvas.height);
  };
  useEffect(redraw, [img, crop]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [img]);

  const minZoom = img ? containZoom(img) : 1;
  const maxZoom = img ? coverZoom(img) * 4 : 4;
  const setZoom = (zoom: number | ((z: number) => number)) =>
    img &&
    setCrop((c) => {
      const z = typeof zoom === 'function' ? zoom(c.zoom) : zoom;
      return clampCrop(img, { ...c, zoom: Math.min(maxZoom, Math.max(minZoom, z)) });
    });

  // Wheel zoom needs a non-passive listener so the dialog doesn't scroll at the same time.
  const setZoomRef = useRef(setZoom);
  setZoomRef.current = setZoom;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoomRef.current((z) => z * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [img]);

  const save = async () => {
    if (!img || !file) return;
    setSaving(true);
    try {
      const blob = await renderCover(img, crop);
      const id = await addImage({ name: file.name || 'Pasted image', blob, width: COVER_WIDTH, height: COVER_HEIGHT });
      onSaved(id);
    } catch {
      setError('Saving the image failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!file}
      onClose={onClose}
      title="Frame your cover"
      size="sm"
      dismissible={false}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={!img || saving}>
            {saving ? 'Saving…' : 'Use image'}
          </button>
        </>
      }
    >
      {error && <p className="form-error">{error}</p>}
      <div className="cropper">
        <canvas
          ref={canvasRef}
          className="cropper__canvas"
          style={{ maxWidth: FRAME_W }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const r = e.currentTarget.getBoundingClientRect();
            drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y, w: r.width, h: r.height };
          }}
          onPointerMove={(e) => {
            if (!drag.current || !img) return;
            const d = drag.current;
            setCrop((c) =>
              clampCrop(img, { ...c, x: d.x + (e.clientX - d.px) / d.w, y: d.y + (e.clientY - d.py) / d.h }),
            );
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
        <div className="cropper__controls">
          <button type="button" className="chip" onClick={() => img && setCrop({ zoom: minZoom, x: 0, y: 0 })}>
            Fit whole image
          </button>
          <button type="button" className="chip" onClick={() => img && setCrop({ zoom: coverZoom(img), x: 0, y: 0 })}>
            Fill frame
          </button>
        </div>
        <label className="cropper__zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={minZoom}
            max={maxZoom}
            step={0.001}
            value={crop.zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <p className="hint">Drag to move, scroll or use the slider to zoom. Empty space is filled with a blurred copy.</p>
      </div>
    </Modal>
  );
}
