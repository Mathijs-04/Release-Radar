import { useEffect, useState } from 'react';
import { deleteGame, newId, saveGame } from '../lib/db';
import { countDelays, delayOptions, formatFuzzy, sameFuzzy } from '../lib/fuzzyDate';
import { PLATFORMS, type Game, type Milestone, type MilestoneKind } from '../lib/types';
import { CoverPicker } from './CoverPicker';
import { FuzzyDateInput } from './FuzzyDateInput';
import { Modal } from './Modal';

interface Props {
  /** null = closed, 'new' = add a game, otherwise the game to edit. */
  game: Game | 'new' | null;
  onClose: () => void;
}

const KIND_LABEL: Record<MilestoneKind, string> = {
  'early-access': 'Early Access launch',
  'full-release': 'Full release / 1.0',
};

function blankGame(): Game {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: '',
    milestones: [{ id: newId(), kind: 'full-release', date: { precision: 'tba' }, history: [] }],
    platforms: ['PC'],
    hype: 2,
    status: 'tracking',
    createdAt: now,
    updatedAt: now,
  };
}

export function GameDialog({ game, onClose }: Props) {
  const [draft, setDraft] = useState<Game>(blankGame);
  const [original, setOriginal] = useState<Game | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!game) return;
    setError(undefined);
    if (game === 'new') {
      setDraft(blankGame());
      setOriginal(null);
    } else {
      setDraft(structuredClone(game));
      setOriginal(game);
    }
  }, [game]);

  const set = <K extends keyof Game>(key: K, value: Game[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setMilestone = (id: string, patch: Partial<Milestone>) =>
    set(
      'milestones',
      draft.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );

  const hasKind = (k: MilestoneKind) => draft.milestones.some((m) => m.kind === k);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      setError('Give the game a title.');
      return;
    }
    // Early Access first, then the full release.
    const milestones = [...draft.milestones].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'early-access' ? -1 : 1));
    await saveGame({ ...draft, title: draft.title.trim(), milestones });
    onClose();
  };

  const remove = async () => {
    if (!original || !confirm(`Remove "${original.title}" from your calendar?`)) return;
    await deleteGame(original.id);
    onClose();
  };

  return (
    <Modal
      open={!!game}
      onClose={onClose}
      title={original ? 'Edit game' : 'Add game'}
      size="lg"
      dismissible={false}
      footer={
        <>
          {original && (
            <button type="button" className="btn btn--danger" onClick={remove}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="game-form" className="btn btn--primary">
            {original ? 'Save changes' : 'Add to calendar'}
          </button>
        </>
      }
    >
      <form
        id="game-form"
        className="game-form"
        onSubmit={submit}
        onKeyDown={(e) => {
          // Enter in a single-line field would submit and close; only the Save button does that.
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
        }}
      >
        <CoverPicker title={draft.title} coverId={draft.coverId} onChange={(id) => set('coverId', id)} />

        <div className="game-form__fields">
          <label className="field">
            <span className="field__label">Title</span>
            <input
              className="input input--lg"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Hollow Knight: Silksong"
              data-autofocus
            />
          </label>
          {error && <p className="form-error">{error}</p>}

          <div className="field">
            <span className="field__label">Release</span>
            <div className="milestones">
              {draft.milestones.map((m) => {
                const before = original?.milestones.find((o) => o.id === m.id);
                const changed = before && !sameFuzzy(before.date, m.date);
                const delays = countDelays(m.history, m.date);
                return (
                  <div key={m.id} className={`milestone milestone--${m.kind}`}>
                    <div className="milestone__head">
                      <span className="badge" data-kind={m.kind}>
                        {KIND_LABEL[m.kind]}
                      </span>
                      {draft.milestones.length > 1 && (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Remove milestone"
                          onClick={() => set('milestones', draft.milestones.filter((x) => x.id !== m.id))}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <FuzzyDateInput value={m.date} onChange={(date) => setMilestone(m.id, { date })} />
                    {before && m.date.precision !== 'tba' && (
                      <div className="delay-row">
                        <span className="hint">Delayed?</span>
                        {delayOptions(m.date)
                          .filter((o) => o.date.precision !== 'tba')
                          .map((o) => (
                            <button
                              key={o.hint}
                              type="button"
                              className="chip chip--small"
                              title={o.hint}
                              onClick={() => setMilestone(m.id, { date: o.date })}
                            >
                              {formatFuzzy(o.date)}
                            </button>
                          ))}
                      </div>
                    )}
                    {changed && (
                      <p className="hint hint--warn">
                        Was {formatFuzzy(before.date)}. The old date is kept in the history.
                      </p>
                    )}
                    {m.history.length > 0 && (
                      <details className="history">
                        <summary>
                          Date history · {m.history.length} change{m.history.length > 1 ? 's' : ''}
                          {delays > 0 && ` · delayed ${delays}×`}
                        </summary>
                        <ol>
                          {m.history.map((h, i) => (
                            <li key={i}>
                              <s>{formatFuzzy(h.from)}</s>
                              <time>changed {new Date(h.changedAt).toLocaleDateString()}</time>
                            </li>
                          ))}
                          <li className="is-current">{formatFuzzy(m.date)} (current)</li>
                        </ol>
                      </details>
                    )}
                  </div>
                );
              })}
              <div className="milestones__add">
                {!hasKind('early-access') && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() =>
                      set('milestones', [
                        { id: newId(), kind: 'early-access', date: { precision: 'tba' }, history: [] },
                        ...draft.milestones,
                      ])
                    }
                  >
                    + Early Access launch
                  </button>
                )}
                {!hasKind('full-release') && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() =>
                      set('milestones', [
                        ...draft.milestones,
                        { id: newId(), kind: 'full-release', date: { precision: 'tba' }, history: [] },
                      ])
                    }
                  >
                    + Full release / 1.0
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="field">
            <span className="field__label">Platforms</span>
            <div className="chip-row">
              {PLATFORMS.map((p) => {
                const on = draft.platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className={`chip${on ? ' is-active' : ''}`}
                    aria-pressed={on}
                    onClick={() => set('platforms', on ? draft.platforms.filter((x) => x !== p) : [...draft.platforms, p])}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <span className="field__label">Hype</span>
            <div className="hype-input" role="radiogroup" aria-label="Hype level">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={draft.hype === n}
                  className={draft.hype >= n ? 'is-on' : ''}
                  onClick={() => set('hype', n)}
                  title={['Curious', 'Excited', 'Day one'][n - 1]}
                >
                  ◆
                </button>
              ))}
              <span className="hint">{['Curious', 'Excited', 'Day one'][draft.hype - 1]}</span>
            </div>
          </div>

          <label className="field">
            <span className="field__label">Store / info link</span>
            <input
              className="input"
              type="url"
              value={draft.link ?? ''}
              onChange={(e) => set('link', e.target.value || undefined)}
              placeholder="https://store.steampowered.com/app/…"
            />
          </label>

          <label className="field">
            <span className="field__label">Notes</span>
            <textarea
              className="input"
              rows={3}
              value={draft.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || undefined)}
              placeholder="Wishlisted, waiting for reviews, co-op with friends…"
            />
          </label>

          {original && (
            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.status === 'archived'}
                onChange={(e) => set('status', e.target.checked ? 'archived' : 'tracking')}
              />
              <span>Archived (hidden from the calendar)</span>
            </label>
          )}
        </div>
      </form>
    </Modal>
  );
}
