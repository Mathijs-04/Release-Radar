import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteImage } from '../lib/db';
import { useImageUrl } from '../lib/image';
import type { StoredImage } from '../lib/types';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  selectedId?: string;
  onSelect: (id: string) => void;
  onUpload: () => void;
}

/** Every uploaded cover, reusable for any game. */
export function ImageLibrary({ open, onClose, selectedId, onSelect, onUpload }: Props) {
  const images = useLiveQuery(() => db.images.orderBy('createdAt').reverse().toArray(), []);
  const games = useLiveQuery(() => db.games.toArray(), []);

  const usage = new Map<string, string[]>();
  for (const g of games ?? []) {
    if (g.coverId) usage.set(g.coverId, [...(usage.get(g.coverId) ?? []), g.title]);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Image library"
      size="lg"
      footer={
        <button type="button" className="btn btn--primary" onClick={onUpload}>
          ⬆ Upload new image
        </button>
      }
    >
      {images && images.length === 0 && (
        <p className="empty-note">No images yet. Upload one and it will be kept here for reuse.</p>
      )}
      <div className="library-grid">
        {images?.map((img) => (
          <LibraryTile
            key={img.id}
            image={img}
            selected={img.id === selectedId}
            usedBy={usage.get(img.id) ?? []}
            onSelect={() => onSelect(img.id)}
          />
        ))}
      </div>
    </Modal>
  );
}

function LibraryTile({
  image,
  selected,
  usedBy,
  onSelect,
}: {
  image: StoredImage;
  selected: boolean;
  usedBy: string[];
  onSelect: () => void;
}) {
  const url = useImageUrl(image.id);
  const remove = () => {
    const msg = usedBy.length
      ? `Delete this image? It is the cover of: ${usedBy.join(', ')}. Those games will show a placeholder.`
      : 'Delete this image from the library?';
    if (confirm(msg)) void deleteImage(image.id);
  };
  return (
    <div className={`library-tile${selected ? ' is-selected' : ''}`}>
      <button type="button" className="library-tile__pick" onClick={onSelect} title={image.name}>
        {url && <img src={url} alt={image.name} />}
      </button>
      <div className="library-tile__meta">
        <span className="library-tile__usage">{usedBy.length ? `Used by ${usedBy.length}` : 'Unused'}</span>
        <button type="button" className="icon-btn icon-btn--danger" onClick={remove} aria-label="Delete image">
          🗑
        </button>
      </div>
    </div>
  );
}
