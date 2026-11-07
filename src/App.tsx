import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AgendaView, type Entry } from './components/AgendaView';
import { Cover } from './components/Cover';
import { FilterBar } from './components/FilterBar';
import { GameDialog } from './components/GameDialog';
import { QuickUpdateDialog } from './components/QuickUpdateDialog';
import { ReviewDialog } from './components/ReviewDialog';
import { TimelineView } from './components/TimelineView';
import { computeAttention, getSeenOutNow, markOutNowSeen } from './lib/attention';
import { exportBackup, getLastBackup, importBackup } from './lib/backup';
import { downloadIcs } from './lib/ics';
import { db } from './lib/db';
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
  loadFilters,
  saveFilters,
  type Filters,
} from './lib/filters';
import { compareFuzzy, daysUntil, formatFuzzy, releaseState } from './lib/fuzzyDate';
import type { Game } from './lib/types';

type View = 'timeline' | 'agenda';
const BACKUP_NAG_DAYS = 30;
const VIEW_KEY = 'release-radar:view';

function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'timeline' || v === 'agenda') return v;
  } catch {
    /* ignore */
  }
  // Phones start on the agenda; the timeline is best with some width.
  return window.matchMedia('(max-width: 720px)').matches ? 'agenda' : 'timeline';
}

const TimelineIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M1.5 8h13" />
    <rect x="2.5" y="3" width="4" height="3" rx="1" />
    <rect x="8" y="10" width="5.5" height="3" rx="1" />
  </svg>
);
const AgendaIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="M2 3.5h12M2 8h12M2 12.5h8" />
  </svg>
);

export default function App() {
  const games = useLiveQuery(() => db.games.toArray(), []);
  const [editing, setEditing] = useState<Game | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFiltersState] = useState<Filters>(loadFilters);
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilterCount(loadFilters()) > 0);
  const setFilters = (f: Filters) => {
    setFiltersState(f);
    saveFilters(f);
  };
  const filterCount = activeFilterCount(filters);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  // Archived games are only shown as a list.
  const activeView: View = showArchived ? 'agenda' : view;
  const [toast, setToast] = useState<string>();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [lastBackup, setLastBackup] = useState(getLastBackup);
  const [quick, setQuick] = useState<Entry | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [seenOut, setSeenOut] = useState(getSeenOutNow);
  const importRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts: N add · / search · F filters · T timeline · A agenda
  const shortcuts = useRef<(e: KeyboardEvent) => void>(undefined);
  shortcuts.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    const key = e.key.toLowerCase();
    if (key === 'n') setEditing('new');
    else if (key === '/') searchRef.current?.focus();
    else if (key === 'f') setFiltersOpen((v) => !v);
    else if (key === 't') {
      setShowArchived(false);
      setView('timeline');
    } else if (key === 'a') setView('agenda');
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcuts.current?.(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(undefined), 3500);
  };

  const attention = useMemo(() => computeAttention(games ?? []), [games]);
  const reviewCount = attention.overdue.length + attention.stale.length;
  const freshOut = attention.outNow.filter((e) => !seenOut.has(e.milestone.id));
  const dismissOutNow = () =>
    setSeenOut(
      markOutNowSeen(
        freshOut.map((e) => e.milestone.id),
        attention.outNow.map((e) => e.milestone.id),
      ),
    );

  const allEntries: Entry[] = useMemo(
    () =>
      (games ?? [])
        .filter((g) => (showArchived ? g.status === 'archived' : g.status !== 'archived'))
        .flatMap((game) => game.milestones.map((milestone) => ({ game, milestone }))),
    [games, showArchived],
  );
  const entries = useMemo(() => applyFilters(allEntries, filters, query), [allEntries, filters, query]);

  const nextUp = useMemo(() => {
    const upcoming = (games ?? [])
      .filter((g) => g.status !== 'archived')
      .flatMap((game) => game.milestones.map((milestone) => ({ game, milestone })))
      .filter((e) => releaseState(e.milestone.date) === 'upcoming' && e.milestone.date.precision === 'day')
      .sort((a, b) => compareFuzzy(a.milestone.date, b.milestone.date));
    return upcoming[0];
  }, [games]);

  const gameCount = games?.filter((g) => g.status !== 'archived').length ?? 0;
  const needsBackup =
    gameCount > 0 &&
    (!lastBackup || Date.now() - lastBackup.getTime() > BACKUP_NAG_DAYS * 86_400_000);

  const exportCalendar = () => {
    const tracked = (games ?? [])
      .filter((g) => g.status !== 'archived')
      .flatMap((game) => game.milestones.map((milestone) => ({ game, milestone })));
    const count = downloadIcs(tracked);
    const skipped = tracked.length - count;
    flash(
      count
        ? `Exported ${count} release${count > 1 ? 's' : ''} with an exact date${skipped ? ` (${skipped} without one skipped)` : ''}`
        : 'No releases with an exact date to export yet',
    );
  };

  const doExport = async () => {
    await exportBackup();
    setLastBackup(getLastBackup());
    flash('Backup downloaded');
  };

  return (
    <div className="app">
      <div className="bg-grid" aria-hidden />

      <header className="topbar">
        <div className="brand">
          <img src="./favicon.svg" alt="" width={34} height={34} />
          <div>
            <h1>
              Release<span>Radar</span>
            </h1>
            <p>{gameCount} game{gameCount === 1 ? '' : 's'} on your radar</p>
          </div>
        </div>

        <div className="topbar__tools">
          <div className="segmented view-toggle" role="radiogroup" aria-label="View">
            <button
              type="button"
              role="radio"
              aria-checked={activeView === 'timeline'}
              className={activeView === 'timeline' ? 'is-active' : ''}
              onClick={() => {
                setShowArchived(false);
                setView('timeline');
              }}
            >
              <TimelineIcon /> Timeline
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={activeView === 'agenda'}
              className={activeView === 'agenda' ? 'is-active' : ''}
              onClick={() => setView('agenda')}
            >
              <AgendaIcon /> Agenda
            </button>
          </div>
          <input
            ref={searchRef}
            className="input search"
            type="search"
            placeholder="Search games…  /"
            aria-label="Search games"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                e.currentTarget.blur();
              }
            }}
          />
          <button
            type="button"
            className={`btn btn--ghost filter-toggle${filtersOpen ? ' is-open' : ''}`}
            aria-expanded={filtersOpen}
            aria-label="Filters"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <path d="M2 3.5h12M4.5 8h7M7 12.5h2" strokeLinecap="round" />
            </svg>
            <span className="hide-sm">Filters</span>
            {filterCount > 0 && <span className="btn__count btn__count--accent">{filterCount}</span>}
          </button>
          <details className="menu" ref={menuRef}>
            <summary className="btn btn--ghost" aria-label="More">
              ⋯
            </summary>
            <div
              className="menu__panel"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button') && menuRef.current) menuRef.current.open = false;
              }}
            >
              <button type="button" onClick={doExport}>
                Export backup
              </button>
              <button type="button" onClick={() => importRef.current?.click()}>
                Import backup…
              </button>
              <button type="button" onClick={exportCalendar}>
                Export to calendar (.ics)
              </button>
              <button type="button" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? 'Show calendar' : 'Show archived games'}
              </button>
              <p className="menu__note">
                {lastBackup ? `Last backup ${lastBackup.toLocaleDateString()}` : 'Never backed up'}
              </p>
              <p className="menu__note menu__keys">
                <kbd>N</kbd> add · <kbd>/</kbd> search · <kbd>F</kbd> filters · <kbd>T</kbd>/<kbd>A</kbd> view
              </p>
            </div>
          </details>
          {reviewCount > 0 && (
            <button
              type="button"
              className="btn btn--warn"
              onClick={() => setReviewOpen(true)}
              title="Release windows that passed and games released a while ago"
            >
              Review <span className="btn__count">{reviewCount}</span>
            </button>
          )}
          <button type="button" className="btn btn--primary topbar__add" onClick={() => setEditing('new')}>
            + Add<span className="hide-sm"> game</span>
          </button>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const r = await importBackup(f);
              flash(`Imported ${r.games} games and ${r.images} images`);
            } catch (err) {
              flash(err instanceof Error ? err.message : 'Import failed');
            }
          }}
        />
        {filtersOpen && (
          <FilterBar filters={filters} onChange={setFilters} shown={entries.length} total={allEntries.length} />
        )}
      </header>

      {freshOut.length > 0 && !showArchived && (
        <div className="banner banner--out" role="status">
          <span className="banner__icon" aria-hidden>
            ▶
          </span>
          <span>
            <strong>Out now:</strong>{' '}
            {freshOut.map((e, i) => (
              <span key={e.milestone.id}>
                {i > 0 && ', '}
                <button type="button" className="link" onClick={() => setEditing(e.game)}>
                  {e.game.title}
                </button>
                {e.milestone.kind === 'early-access' && ' (Early Access)'}
              </span>
            ))}
          </span>
          <button type="button" className="btn btn--small" onClick={dismissOutNow}>
            Got it
          </button>
        </div>
      )}

      {needsBackup && (
        <div className="banner">
          <span>
            Your calendar only lives in this browser.{' '}
            {lastBackup ? `Last backup was ${lastBackup.toLocaleDateString()}.` : 'You have no backup yet.'}
          </span>
          <button type="button" className="btn btn--small" onClick={doExport}>
            Export backup
          </button>
        </div>
      )}

      {nextUp && activeView === 'agenda' && !showArchived && (
        <button type="button" className="hero" onClick={() => setEditing(nextUp.game)}>
          <div className="hero__bg">
            <Cover imageId={nextUp.game.coverId} title={nextUp.game.title} />
          </div>
          <div className="hero__art">
            <Cover imageId={nextUp.game.coverId} title={nextUp.game.title} />
          </div>
          <div className="hero__text">
            <span className="hero__eyebrow">Next up</span>
            <h2>{nextUp.game.title}</h2>
            <p>
              {nextUp.milestone.kind === 'early-access' ? 'Early Access · ' : ''}
              {formatFuzzy(nextUp.milestone.date)}
            </p>
          </div>
          <div className="hero__count">
            <strong>{daysUntil(nextUp.milestone.date)}</strong>
            <span>{daysUntil(nextUp.milestone.date) === 1 ? 'day' : 'days'}</span>
          </div>
        </button>
      )}

      <main>
        {showArchived && <h2 className="view-title">Archived games</h2>}
        {games && entries.length === 0 ? (
          <div className="empty">
            {gameCount === 0 && !showArchived ? (
              <>
                <div className="empty__radar" aria-hidden />
                <h2>Nothing on your radar yet</h2>
                <p>Add the games you're waiting for. Exact date, a quarter, a year or no date at all: it all works.</p>
                <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
                  + Add your first game
                </button>
              </>
            ) : (
              <p>
                No games match{filterCount > 0 ? ' these filters' : ''}.{' '}
                {filterCount > 0 && (
                  <button type="button" className="link" onClick={() => setFilters(DEFAULT_FILTERS)}>
                    Clear filters
                  </button>
                )}
              </p>
            )}
          </div>
        ) : activeView === 'timeline' ? (
          <TimelineView entries={entries} onOpen={setEditing} onQuick={setQuick} />
        ) : (
          <AgendaView entries={entries} onOpen={setEditing} onQuick={setQuick} />
        )}
      </main>

      <GameDialog game={editing} onClose={() => setEditing(null)} />
      <QuickUpdateDialog entry={quick} onClose={() => setQuick(null)} onEdit={setEditing} onToast={flash} />
      <ReviewDialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        attention={attention}
        onEdit={setEditing}
        onToast={flash}
      />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
