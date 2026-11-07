import { agendaGroupOf, compareFuzzy, compareGroupOrder, type AgendaGroup } from '../lib/fuzzyDate';
import type { Entry, Game } from '../lib/types';
import { GameCard } from './GameCard';

export type { Entry };

interface Props {
  entries: Entry[];
  onOpen: (game: Game) => void;
  onQuick: (entry: Entry) => void;
}

/** Vertical list of releases, grouped from "Out now" to "To be announced". */
export function AgendaView({ entries, onOpen, onQuick }: Props) {
  const today = new Date();
  const groups = new Map<string, { group: AgendaGroup; entries: Entry[] }>();
  for (const e of entries) {
    const g = agendaGroupOf(e.milestone.date, today);
    if (!groups.has(g.key)) groups.set(g.key, { group: g, entries: [] });
    groups.get(g.key)!.entries.push(e);
  }
  const sorted = [...groups.values()].sort((a, b) => compareGroupOrder(a.group, b.group));

  return (
    <div className="agenda">
      {sorted.map(({ group, entries }) => {
        entries.sort(
          (a, b) => compareFuzzy(a.milestone.date, b.milestone.date) || a.game.title.localeCompare(b.game.title),
        );
        const list = (
          <div className="card-grid">
            {entries.map((e, i) => (
              <GameCard
                index={i}
                key={e.milestone.id}
                game={e.game}
                milestone={e.milestone}
                onOpen={() => onOpen(e.game)}
                onQuick={() => onQuick(e)}
              />
            ))}
          </div>
        );
        const heading = (
          <>
            <span className="agenda__label">{group.label}</span>
            <span className="agenda__count">{entries.length}</span>
            <span className="agenda__rule" />
          </>
        );
        return (
          <section key={group.key} className={`agenda__group agenda__group--${group.key.split('-')[0]}`}>
            {group.key === 'released' ? (
              <details>
                <summary className="agenda__heading">{heading}</summary>
                {list}
              </details>
            ) : (
              <>
                <h2 className="agenda__heading">{heading}</h2>
                {list}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
