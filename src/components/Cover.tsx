import { useImageUrl } from '../lib/image';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Portrait cover art, or a generated neon placeholder when there is none. */
export function Cover({ imageId, title, className = '' }: { imageId?: string; title: string; className?: string }) {
  const url = useImageUrl(imageId);
  if (url) return <img className={`cover ${className}`} src={url} alt="" draggable={false} />;

  const h = hash(title || '?');
  const hueA = 250 + (h % 50); // violet range
  const hueB = 185 + ((h >> 4) % 40); // cyan range
  const initials = (title || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <div
      className={`cover cover--placeholder ${className}`}
      style={{
        background: `radial-gradient(120% 80% at 20% 10%, hsl(${hueA} 80% 45% / .9), transparent 60%),
                     radial-gradient(100% 70% at 90% 100%, hsl(${hueB} 85% 45% / .8), transparent 60%), #10142a`,
      }}
      aria-hidden
    >
      <span>{initials}</span>
    </div>
  );
}
