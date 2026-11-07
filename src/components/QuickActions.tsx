import { useState } from 'react';
import { setGameStatus, setMilestoneDate } from '../lib/db';
import { delayOptions, formatFuzzy, releaseState, todayAsFuzzy } from '../lib/fuzzyDate';
import type { Entry, FuzzyDate } from '../lib/types';

interface Props {
  entry: Entry;
  /** Called after an action was saved, with a short message for a toast. */
  onDone: (message: string) => void;
  onEdit?: () => void;
  compact?: boolean;
}

const KIND = { 'early-access': 'Early Access', 'full-release': 'Release' } as const;

/** One-click updates for a release: delay it, mark it as out, or archive the game. */
export function QuickActions({ entry: { game, milestone }, onDone, onEdit, compact }: Props) {
  const state = releaseState(milestone.date);
  // Start from the current exact date if there is one, otherwise from today.
  const initial = milestone.date.precision === 'day' ? milestone.date : todayAsFuzzy();
  const [outDate, setOutDate] = useState(
    `${initial.year}-${String(initial.month).padStart(2, '0')}-${String(initial.day).padStart(2, '0')}`,
  );

  const move = async (date: FuzzyDate, message: string) => {
    await setMilestoneDate(game.id, milestone.id, date);
    onDone(message);
  };

  const options = delayOptions(milestone.date);

  return (
    <div className={`quick${compact ? ' quick--compact' : ''}`}>
      {options.length > 0 && (
        <div className="quick__section">
          <span className="field__label">{milestone.date.precision === 'tba' ? 'Set a date' : 'Delayed to'}</span>
          <div className="quick__options">
            {options.map((o) => (
              <button
                key={o.hint}
                type="button"
                className="delay-opt"
                onClick={() => move(o.date, `${game.title}: ${KIND[milestone.kind]} moved to ${formatFuzzy(o.date)}`)}
              >
                <small>{o.hint}</small>
                <strong>{formatFuzzy(o.date)}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      {state !== 'released' && (
        <div className="quick__section">
          <span className="field__label">{state === 'overdue' ? 'It came out' : 'Got an exact date / it is out'}</span>
          <form
            className="quick__out"
            onSubmit={(e) => {
              e.preventDefault();
              const [y, m, d] = outDate.split('-').map(Number);
              if (!y || !m || !d) return;
              const date: FuzzyDate = { precision: 'day', year: y, month: m, day: d };
              void move(date, `${game.title}: ${KIND[milestone.kind]} set to ${formatFuzzy(date)}`);
            }}
          >
            <input type="date" className="input" value={outDate} onChange={(e) => setOutDate(e.target.value)} />
            <button type="submit" className="btn btn--small">
              Set date
            </button>
          </form>
        </div>
      )}

      <div className="quick__more">
        {onEdit && (
          <button type="button" className="chip" onClick={onEdit}>
            Edit everything…
          </button>
        )}
        <button
          type="button"
          className="chip"
          onClick={async () => {
            await setGameStatus(game.id, 'archived');
            onDone(`${game.title} archived`);
          }}
        >
          Archive game
        </button>
      </div>
    </div>
  );
}
