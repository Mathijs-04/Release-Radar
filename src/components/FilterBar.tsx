import { DEFAULT_FILTERS, activeFilterCount, type Filters } from '../lib/filters';
import { PLATFORMS } from '../lib/types';

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  /** Number of releases shown with the current filters. */
  shown: number;
  total: number;
}

const HYPE_LABEL = { 1: 'Any', 2: 'Excited+', 3: 'Day one' } as const;

export function FilterBar({ filters, onChange, shown, total }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const togglePlatform = (p: string) =>
    set({
      platforms: filters.platforms.includes(p)
        ? filters.platforms.filter((x) => x !== p)
        : [...filters.platforms, p],
    });

  return (
    <div className="filter-bar">
      <div className="filter-bar__group">
        <span className="field__label">Release</span>
        <div className="segmented segmented--small" role="radiogroup" aria-label="Release type">
          {(
            [
              ['all', 'All'],
              ['early-access', 'Early Access'],
              ['full-release', 'Full / 1.0'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={filters.kind === k}
              className={filters.kind === k ? 'is-active' : ''}
              onClick={() => set({ kind: k })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-bar__group">
        <span className="field__label">Platform</span>
        <div className="chip-row">
          {PLATFORMS.map((p) => {
            const on = filters.platforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                className={`chip chip--small${on ? ' is-active' : ''}`}
                aria-pressed={on}
                onClick={() => togglePlatform(p)}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      <div className="filter-bar__group">
        <span className="field__label">Hype</span>
        <div className="segmented segmented--small" role="radiogroup" aria-label="Minimum hype">
          {([1, 2, 3] as const).map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={filters.minHype === h}
              className={filters.minHype === h ? 'is-active' : ''}
              onClick={() => set({ minHype: h })}
            >
              {h > 1 && <span className="filter-bar__hype">{'◆'.repeat(h)}</span>} {HYPE_LABEL[h]}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-bar__summary">
        <span>
          {shown} of {total} releases
        </span>
        {activeFilterCount(filters) > 0 && (
          <button type="button" className="chip chip--small" onClick={() => onChange(DEFAULT_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
