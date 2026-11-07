import { countDelays, formatFuzzy } from '../lib/fuzzyDate';
import type { Entry, Game } from '../lib/types';
import { Cover } from './Cover';
import { Modal } from './Modal';
import { QuickActions } from './QuickActions';

interface Props {
  entry: Entry | null;
  onClose: () => void;
  onEdit: (game: Game) => void;
  onToast: (message: string) => void;
}

export function QuickUpdateDialog({ entry, onClose, onEdit, onToast }: Props) {
  return (
    <Modal open={!!entry} onClose={onClose} title="Update release" size="md">
      {entry && (
        <>
          <EntryHeader entry={entry} />
          <QuickActions
            entry={entry}
            onDone={(msg) => {
              onToast(msg);
              onClose();
            }}
            onEdit={() => {
              onClose();
              onEdit(entry.game);
            }}
          />
        </>
      )}
    </Modal>
  );
}

export function EntryHeader({ entry: { game, milestone } }: { entry: Entry }) {
  const delays = countDelays(milestone.history, milestone.date);
  const hasEa = game.milestones.some((m) => m.kind === 'early-access');
  return (
    <div className="entry-head">
      <div className="entry-head__art">
        <Cover imageId={game.coverId} title={game.title} />
      </div>
      <div>
        <h3>{game.title}</h3>
        <p>
          {milestone.kind === 'early-access' ? 'Early Access' : hasEa ? '1.0 release' : 'Release'} ·{' '}
          <span className={`date-chip date-chip--${milestone.date.precision}`}>{formatFuzzy(milestone.date)}</span>
          {delays > 0 && <span className="entry-head__delays">delayed {delays}× before</span>}
        </p>
      </div>
    </div>
  );
}
