import { countDelays, daysUntil, formatFuzzy, releaseState } from '../lib/fuzzyDate';
import type { Game, Milestone } from '../lib/types';
import { Cover } from './Cover';

interface Props {
  game: Game;
  milestone: Milestone;
  onOpen: () => void;
  onQuick: () => void;
  /** Position in its group, used to stagger the entrance animation. */
  index?: number;
}

function countdown(days: number | null): string | null {
  if (days === null || days < 0) return null;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 60) return `in ${days} days`;
  return null;
}

export function QuickButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="card-quick" onClick={onClick} title="Delay or update the release" aria-label={label}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <circle cx="8" cy="8.5" r="5.5" />
        <path d="M8 5.5v3l2 1.5M6.5 1.5h3" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function GameCard({ game, milestone, onOpen, onQuick, index = 0 }: Props) {
  const hasEa = game.milestones.some((m) => m.kind === 'early-access');
  const kindLabel =
    milestone.kind === 'early-access' ? 'Early Access' : hasEa ? '1.0 · Leaves EA' : 'Full release';
  const delays = countDelays(milestone.history, milestone.date);
  const state = releaseState(milestone.date);
  const soon = countdown(daysUntil(milestone.date));

  return (
    <div
      className={`game-card hype-${game.hype} state-${state}`}
      style={{ '--i': Math.min(index, 10) } as React.CSSProperties}
    >
      <button type="button" className="game-card__open" onClick={onOpen}>
        <div className="game-card__art">
          <Cover imageId={game.coverId} title={game.title} />
          <span className="badge game-card__kind" data-kind={milestone.kind}>
            {kindLabel}
          </span>
          {delays > 0 && (
            <span className="badge badge--delay game-card__delay" title={`Release date pushed back ${delays}×`}>
              ⏱ Delayed{delays > 1 ? ` ${delays}×` : ''}
            </span>
          )}
        </div>
        <div className="game-card__body">
          <h3 className="game-card__title">{game.title}</h3>
          <div className="game-card__date">
            <span className={`date-chip date-chip--${milestone.date.precision}`}>{formatFuzzy(milestone.date)}</span>
            {soon && <span className="game-card__soon">{soon}</span>}
            {state === 'in-window' && <span className="game-card__soon">any day now</span>}
            {state === 'overdue' && <span className="game-card__soon is-warn">window passed</span>}
          </div>
          <div className="game-card__meta">
            <span className="hype" aria-label={`Hype ${game.hype} of 3`}>
              {'◆'.repeat(game.hype)}
              <span className="hype__off">{'◆'.repeat(3 - game.hype)}</span>
            </span>
            <span className="game-card__platforms">{game.platforms.join(' · ')}</span>
          </div>
        </div>
      </button>
      {state !== 'released' && <QuickButton onClick={onQuick} label={`Update release date of ${game.title}`} />}
    </div>
  );
}
