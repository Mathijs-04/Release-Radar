import { useRef, useState } from 'react';
import { imageFromDataTransfer } from '../lib/image';
import { Cover } from './Cover';
import { ImageCropper } from './ImageCropper';
import { ImageLibrary } from './ImageLibrary';

interface Props {
  title: string;
  coverId?: string;
  onChange: (coverId: string | undefined) => void;
}

/** Cover slot in the game form: upload, drop, paste or pick from the library. */
export function CoverPicker({ title, coverId, onChange }: Props) {
  const [pending, setPending] = useState<File | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="cover-picker">
      <div
        className={`cover-picker__slot${dragOver ? ' is-drag' : ''}`}
        tabIndex={0}
        onPaste={(e) => {
          const f = imageFromDataTransfer(e.clipboardData);
          if (f) {
            e.preventDefault();
            setPending(f);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = imageFromDataTransfer(e.dataTransfer);
          if (f) setPending(f);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        role="button"
        aria-label="Upload cover image"
      >
        <Cover imageId={coverId} title={title} />
        <div className="cover-picker__overlay">
          <span>⬆</span>
          <small>Click, drop or paste an image</small>
        </div>
      </div>
      <div className="cover-picker__actions">
        <button type="button" className="chip" onClick={() => setLibraryOpen(true)}>
          Library
        </button>
        {coverId && (
          <button type="button" className="chip" onClick={() => onChange(undefined)}>
            Remove
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPending(f);
          e.target.value = '';
        }}
      />

      <ImageLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        selectedId={coverId}
        onSelect={(id) => {
          onChange(id);
          setLibraryOpen(false);
        }}
        onUpload={() => inputRef.current?.click()}
      />
      <ImageCropper
        file={pending}
        onClose={() => setPending(null)}
        onSaved={(id) => {
          setPending(null);
          setLibraryOpen(false);
          onChange(id);
        }}
      />
    </div>
  );
}
