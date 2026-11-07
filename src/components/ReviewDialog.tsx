import { setGameStatus } from '../lib/db';
import type { Attention } from '../lib/attention';
import { formatFuzzy } from '../lib/fuzzyDate';
import type { Game } from '../lib/types';
import { Cover } from './Cover';
import { Modal } from './Modal';
import { QuickActions } from './QuickActions';
import { EntryHeader } from './QuickUpdateDialog';

interface Props {
  open: boolean;
  onClose: () => void;
  attention: Attention;
  onEdit: (game: Game) => void;
  onToast: (message: string) => void;
}

/** Everything that needs a decision: passed release windows and long-released games. */
export function ReviewDialog({ open, onClose, attention, onEdit, onToast }: Props) {
  const { overdue, stale } = attention;
  const empty = overdue.length === 0 && stale.length === 0;

  return (
    <Modal open={open} onClose={onClose} title="Review releases" size="lg">
      {empty && (
        <div className="review-empty">
          <span aria-hidden>✓</span>
          <p>All caught up. Nothing needs an update.</p>
        </div>
      )}

      {overdue.length > 0 && (
        <section className="review-section">
          <h3>
            Release window passed <span className="agenda__count">{overdue.length}</span>
          </h3>
          <p className="hint">These windows ended without an exact date. Did they come out, or slip?</p>
          <div className="review-list">
            {overdue.map((entry) => (
              <div key={entry.milestone.id} className="review-item">
                <EntryHeader entry={entry} />
                <QuickActions
                  entry={entry}
                  compact
                  onDone={onToast}
                  onEdit={() => {
                    onClose();
                    onEdit(entry.game);
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {stale.length > 0 && (
        <section className="review-section">
          <h3>
            Released a while ago <span className="agenda__count">{stale.length}</span>
            <button
              type="button"
              className="btn btn--small review-section__all"
              onClick={async () => {
                await Promise.all(stale.map((e) => setGameStatus(e.game.id, 'archived')));
                onToast(`Archived ${stale.length} game${stale.length > 1 ? 's' : ''}`);
              }}
            >
              Archive all
            </button>
          </h3>
          <p className="hint">Out for over a month. Archive them to keep the calendar focused on what's coming.</p>
          <div className="stale-list">
            {stale.map(({ game, milestone }) => (
              <div key={game.id} className="stale-item">
                <div className="stale-item__art">
                  <Cover imageId={game.coverId} title={game.title} />
                </div>
                <div className="stale-item__text">
                  <strong>{game.title}</strong>
                  <span>Out since {formatFuzzy(milestone.date)}</span>
                </div>
                <button
                  type="button"
                  className="chip"
                  onClick={async () => {
                    await setGameStatus(game.id, 'archived');
                    onToast(`${game.title} archived`);
                  }}
                >
                  Archive
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </Modal>
  );
}
