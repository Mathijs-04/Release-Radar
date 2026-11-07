import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { compareFuzzy, countDelays, formatFuzzy, releaseState, startOfDay, windowOf } from '../lib/fuzzyDate';
import { CARD_SIZES, DAY_MS, axisTicks, buildScale, packLanes, spreadCards, type Zoom } from '../lib/timeline';
import type { Game } from '../lib/types';
import type { Entry } from './AgendaView';
import { Cover } from './Cover';
import { QuickButton } from './GameCard';

interface Props {
  entries: Entry[];
  onOpen: (game: Game) => void;
  onQuick: (entry: Entry) => void;
}

const BAND_H = 10;
const AXIS_H = 58;
const TOP_PAD = 18;
const GAP = 14;

/** Card geometry for a zoom level. */
function cardMetrics(zoom: Zoom) {
  const cardW = CARD_SIZES[zoom];
  const compact = zoom === 'compact';
  return {
    cardW,
    // band + gap + cover + title/date + spacing; compact is tighter so 3 rows fit a laptop screen
    laneH: BAND_H + (compact ? 6 : 8) + cardW * 1.5 + (compact ? 40 : 52) + (compact ? 8 : 16),
    /** Exact dates: the pin sits this far into the card, so the card "hangs" from its date. */
    pinOffset: Math.round(cardW * 0.14),
  };
}
const ZOOM_KEY = 'release-radar:zoom';

function loadZoom(): Zoom {
  try {
    const z = localStorage.getItem(ZOOM_KEY);
    if (z && z in CARD_SIZES) return z as Zoom;
  } catch {
    /* ignore */
  }
  return 'compact';
}

export function TimelineView({ entries, onOpen, onQuick }: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [zoom, setZoomState] = useState<Zoom>(loadZoom);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const pendingCenter = useRef<number | null>(null);
  /** Set once the user pans, scrolls, zooms or jumps; stops the automatic "now" positioning. */
  const userMoved = useRef(false);
  const { cardW, laneH, pinOffset } = cardMetrics(zoom);
  const shelfRef = useRef<HTMLDivElement>(null);
  // The shelf only scrolls sideways, so let a normal mouse wheel do that.
  useEffect(() => {
    const el = shelfRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // How many card rows fit on screen; the scale makes busy months wide enough to fill them.
  // The timeline may use the screen height below it, minus the To Be Announced shelf.
  // Measured on every render, so banners appearing or disappearing above it are taken into account.
  const [viewH, setViewH] = useState(600);
  const shelfSectionRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      const phone = window.matchMedia('(max-width: 720px)').matches;
      // On phones the page scrolls anyway; just keep the timeline within one screen.
      const top = phone ? 120 : el.getBoundingClientRect().top + window.scrollY;
      // Real shelf height when it is rendered (titles can wrap); the estimate before that.
      const shelfEl = shelfSectionRef.current;
      const shelf = shelfEl ? shelfEl.offsetHeight + 12 : 0;
      const h = Math.max(300, Math.min(1400, window.innerHeight - top - shelf - 24)); // 24 = page bottom padding
      setViewH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });
  const visibleLanes = Math.max(1, Math.min(6, Math.floor((viewH - AXIS_H - TOP_PAD + 24) / laneH)));

  const dated = useMemo(() => entries.filter((e) => windowOf(e.milestone.date)), [entries]);
  const tba = entries
    .filter((e) => !windowOf(e.milestone.date))
    .sort((a, b) => b.game.hype - a.game.hype || a.game.title.localeCompare(b.game.title));

  const lastEnd = dated.reduce<Date | null>((max, e) => {
    const end = windowOf(e.milestone.date)!.end;
    return !max || end > max ? end : max;
  }, null);

  const lastEndTime = lastEnd?.getTime() ?? null;

  // Where cards start. Exact releases from before the visible past are left out (they're in the Agenda).
  const anchorKey = useMemo(() => {
    const visibleFrom = new Date(today.getFullYear(), today.getMonth() - 2, 1).getTime();
    return dated
      .filter((e) => {
        const w = windowOf(e.milestone.date)!;
        return w.end.getTime() >= visibleFrom || releaseState(e.milestone.date) === 'overdue';
      })
      .map((e) => windowOf(e.milestone.date)!.start.getTime())
      .sort((a, b) => a - b)
      .join(',');
  }, [dated, today]);

  const scale = useMemo(
    () =>
      buildScale(
        today,
        anchorKey ? anchorKey.split(',').map(Number) : [],
        lastEndTime === null ? null : new Date(lastEndTime),
        { cardW, gap: GAP, lanes: visibleLanes },
      ),
    [today, anchorKey, lastEndTime, cardW, visibleLanes],
  );
  const ticks = useMemo(() => axisTicks(scale), [scale]);
  const nowX = scale.x(today.getTime());

  // Lay out every dated milestone: a band over its window, and a card hanging from its start.
  const layout = useMemo(() => {
    const raw = dated
      .map((entry) => {
        const w = windowOf(entry.milestone.date)!;
        const exact = entry.milestone.date.precision === 'day';
        const rawL = scale.x(w.start.getTime());
        const rawR = exact ? rawL : scale.x(w.end.getTime() + DAY_MS);
        const bandL = Math.max(0, rawL);
        return {
          entry,
          exact,
          yearOnly: entry.milestone.date.precision === 'year',
          rawR,
          pinX: rawL,
          bandL,
          bandR: Math.max(bandL, rawR),
          anchor: Math.max(w.start.getTime(), scale.start),
          naturalL: Math.max(0, exact ? rawL - pinOffset : bandL),
        };
      })
      .filter((i) => i.rawR >= 0 || releaseState(i.entry.milestone.date) === 'overdue') // older releases: Agenda only
      .sort((a, b) => compareFuzzy(a.entry.milestone.date, b.entry.milestone.date));

    const packGroup = (items: typeof raw) => {
      const lefts = spreadCards(items, scale, { cardW, gap: GAP, lanes: visibleLanes });
      // Only cards take up room in a row; bands may run underneath later cards.
      return packLanes(
        items.map((item, i) => ({ ...item, left: lefts[i], right: lefts[i] + cardW })),
        GAP,
        // Rather slide a card a bit to the right than push it into a row off screen.
        { maxLanes: visibleLanes, maxShift: cardW * 1.5 },
      );
    };
    const specific = raw.filter((item) => !item.yearOnly);
    const yearOnly = raw.filter((item) => item.yearOnly);
    const specificPacked = packGroup(specific);
    const yearPacked = packGroup(yearOnly);
    const placed = [
      ...specificPacked.placed.map((p) => ({ ...p, cardL: p.left })),
      ...yearPacked.placed.map((p) => ({ ...p, lane: p.lane + specificPacked.lanes, cardL: p.left })),
    ];
    const yearOnlyLaneStart = specificPacked.lanes;
    const lanes = specificPacked.lanes + yearPacked.lanes;

    // A band stops where the next card in its row begins (hovering shows it in full).
    const byLane = new Map<number, typeof placed>();
    placed.forEach((p) => byLane.set(p.lane, [...(byLane.get(p.lane) ?? []), p]));
    const visibleBandR = new Map<string, number>();
    for (const row of byLane.values()) {
      row.sort((a, b) => a.left - b.left);
      row.forEach((p, i) => {
        const next = row[i + 1];
        visibleBandR.set(p.entry.milestone.id, next ? Math.min(p.bandR, next.left - 6) : p.bandR);
      });
    }
    return { placed, lanes, yearOnlyLaneStart, visibleBandR };
  }, [scale, dated, cardW, pinOffset, visibleLanes]);

  const hiddenOld = dated.length - layout.placed.length; // exact releases older than the visible past
  const rows = Math.max(1, layout.lanes);
  const totalW = scale.width + 24;
  const totalH = AXIS_H + TOP_PAD + rows * laneH;
  const scrollerH = Math.min(viewH, Math.max(460, totalH + 24));

  // Keep "now" near the left edge until the user starts moving around
  // (the layout settles once the screen height is measured).
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || userMoved.current) return;
    el.scrollLeft = nowX - Math.min(140, el.clientWidth * 0.15);
  }, [nowX]);

  // Keep the same date centred when zooming.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || pendingCenter.current === null) return;
    el.scrollLeft = scale.x(pendingCenter.current) - el.clientWidth / 2;
    pendingCenter.current = null;
  }, [scale]);

  const setZoom = (z: Zoom) => {
    userMoved.current = true;
    const el = scrollerRef.current;
    if (el) pendingCenter.current = scale.t(el.scrollLeft + el.clientWidth / 2);
    setZoomState(z);
    try {
      localStorage.setItem(ZOOM_KEY, z);
    } catch {
      /* ignore */
    }
  };

  const jumpTo = (x: number) => {
    userMoved.current = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollerRef.current?.scrollTo({ left: Math.max(0, x - 40), behavior: reduced ? 'auto' : 'smooth' });
  };

  // Mouse wheel: over the axis (or when there is nothing to scroll vertically) scroll sideways.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      userMoved.current = true;
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const overAxis = axisRef.current?.contains(e.target as Node);
      const noVertical = el.scrollHeight <= el.clientHeight + 1;
      if (overAxis || noVertical) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Drag to pan with the mouse (touch already scrolls natively).
  const dragged = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollerRef.current;
    userMoved.current = true;
    if (!el || e.pointerType !== 'mouse' || e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    dragged.current = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!dragged.current && Math.hypot(dx, dy) < 5) return;
      dragged.current = true;
      el.classList.add('is-panning');
      el.scrollLeft = start.left - dx;
      el.scrollTop = start.top - dy;
    };
    const up = () => {
      el.classList.remove('is-panning');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragged.current) {
      e.stopPropagation();
      e.preventDefault();
      dragged.current = false;
    }
  };

  return (
    <div className={`timeline timeline--${zoom}${tba.length ? ' timeline--with-shelf' : ''}`}>
      <div className="timeline__toolbar">
        <div className="timeline__jumps">
          <button type="button" className="chip is-now" onClick={() => jumpTo(nowX - 100)}>
            Today
          </button>
          {ticks.years
            .filter((y) => y.year > today.getFullYear())
            .map((y) => (
              <button key={y.year} type="button" className="chip" onClick={() => jumpTo(y.x)}>
                {y.year}
              </button>
            ))}
        </div>
        <span className="timeline__hint">Drag to pan · Shift + scroll to move through time</span>
        <div className="segmented segmented--small" role="radiogroup" aria-label="Zoom">
          {(Object.keys(CARD_SIZES) as Zoom[]).map((z) => (
            <button
              key={z}
              type="button"
              role="radio"
              aria-checked={zoom === z}
              className={zoom === z ? 'is-active' : ''}
              onClick={() => setZoom(z)}
            >
              {z[0].toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="timeline__scroller"
        style={{ height: scrollerH }}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
      >
        <div className="timeline__content" style={{ width: totalW, height: totalH }}>
          {/* Axis (sticky to the top of the scroller) */}
          <div ref={axisRef} className="tl-axis" style={{ width: totalW }}>
            <div className="tl-axis__years">
              {ticks.years.map((y) => (
                <div key={y.year} className="tl-axis__year" style={{ left: y.x, width: y.width }}>
                  <span>{y.year}</span>
                </div>
              ))}
            </div>
            <div className="tl-axis__months">
              {ticks.months.map((m) =>
                m.label ? (
                  <span
                    key={`${m.year}-${m.month}`}
                    className={`tl-axis__month${m.label.startsWith('Q') ? ' is-quarter' : ''}`}
                    style={{ left: m.x }}
                  >
                    {m.label}
                  </span>
                ) : null,
              )}
              {ticks.weeks.map((w) => (
                <span key={w.x} className="tl-axis__week" style={{ left: w.x }}>
                  {w.label}
                </span>
              ))}
            </div>
            <span className="tl-axis__today" style={{ left: nowX }}>
              Today
            </span>
          </div>

          {/* Background: past region, grid lines, now line */}
          <div className="tl-past" style={{ width: nowX }}>
            <span>
              Released
              {hiddenOld > 0 && ` · ${hiddenOld} older in Agenda`}
            </span>
          </div>
          {ticks.months.map((m) => (
            <div
              key={`g-${m.year}-${m.month}`}
              className={`tl-grid${m.month === 0 ? ' tl-grid--year' : m.month % 3 === 0 ? ' tl-grid--quarter' : ''}`}
              style={{ left: m.x }}
            />
          ))}
          <div className="tl-now" style={{ left: nowX }} />
          {layout.yearOnlyLaneStart < layout.lanes && (
            <div
              className="tl-year-only-divider"
              style={{ top: AXIS_H + TOP_PAD + layout.yearOnlyLaneStart * laneH, width: totalW }}
            >
              <span>Year-only estimates</span>
            </div>
          )}

          {/* Dated releases */}
          {layout.placed.map((item) => {
            const { game, milestone } = item.entry;
            const top = AXIS_H + TOP_PAD + item.lane * laneH;
            return (
              <div key={milestone.id} className="tl-item">
                {item.exact ? (
                  <>
                    {item.cardL > item.pinX - pinOffset + 2 && (
                      // The card slid right to make room: link it to its date.
                      <div
                        className="tl-pin-link"
                        style={{ left: item.pinX, top: top + 4, width: item.cardL + pinOffset - item.pinX }}
                      />
                    )}
                    <div className="tl-pin" style={{ left: item.pinX, top }} />
                  </>
                ) : (
                  <BandView
                    className={`tl-band tl-band--${milestone.date.precision}${
                      releaseState(milestone.date) === 'overdue' ? ' tl-band--overdue' : ''
                    }`}
                    kind={milestone.kind}
                    left={item.bandL}
                    top={top}
                    fullWidth={item.bandR - item.bandL}
                    visibleWidth={(layout.visibleBandR.get(milestone.id) ?? item.bandR) - item.bandL}
                    title={`${game.title}: ${formatFuzzy(milestone.date)}`}
                  />
                )}
                <TimelineCard
                  entry={item.entry}
                  style={{ left: item.cardL, top: top + BAND_H + (zoom === 'compact' ? 6 : 8), width: cardW }}
                  onOpen={() => onOpen(game)}
                  onQuick={() => onQuick(item.entry)}
                />
              </div>
            );
          })}

        </div>
      </div>

      {tba.length > 0 && (
        <section className="tba-shelf" aria-label="To Be Announced" ref={shelfSectionRef}>
          <div className="tba-shelf__label">
            <strong>To Be Announced</strong>
            <span>{tba.length}</span>
          </div>
          <div className="tba-shelf__list" ref={shelfRef}>
            {tba.map((entry) => (
              <TimelineCard
                key={entry.milestone.id}
                entry={entry}
                style={{ position: 'relative', width: cardW, flex: `0 0 ${cardW}px` }}
                onOpen={() => onOpen(entry.game)}
                onQuick={() => onQuick(entry)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TimelineCard({
  entry,
  style,
  onOpen,
  onQuick,
}: {
  entry: Entry;
  style: React.CSSProperties;
  onOpen: () => void;
  onQuick: () => void;
}) {
  const { game, milestone } = entry;
  const delays = countDelays(milestone.history, milestone.date);
  const state = releaseState(milestone.date);
  return (
    <div className={`tl-card hype-${game.hype} state-${state}`} style={style}>
      <button type="button" className="tl-card__open" onClick={onOpen} title={game.title}>
        <div className="tl-card__art">
          <Cover imageId={game.coverId} title={game.title} />
          {milestone.kind === 'early-access' && (
            <span className="badge tl-card__ea" data-kind="early-access">
              EA
            </span>
          )}
          {milestone.kind === 'full-release' && game.milestones.some((m) => m.kind === 'early-access') && (
            <span className="badge tl-card__ea">1.0</span>
          )}
          {state === 'overdue' && (
            <span className="tl-card__flag" title="Release window passed: update it">
              ?
            </span>
          )}
          {delays > 0 && (
            <span className="tl-card__delay" title={`Delayed ${delays}×`}>
              ⏱{delays > 1 ? delays : ''}
            </span>
          )}
        </div>
        <span className="tl-card__title">{game.title}</span>
        <span className={`date-chip date-chip--${milestone.date.precision}`}>{formatFuzzy(milestone.date)}</span>
      </button>
      {state !== 'released' && <QuickButton onClick={onQuick} label={`Update release date of ${game.title}`} />}
    </div>
  );
}

function BandView({
  className,
  kind,
  left,
  top,
  fullWidth,
  visibleWidth,
  title,
}: {
  className: string;
  kind: string;
  left: number;
  top: number;
  fullWidth: number;
  visibleWidth: number;
  title: string;
}) {
  const clipped = visibleWidth < fullWidth - 1;
  return (
    <div
      className={`${className}${clipped ? ' is-clipped' : ''}`}
      data-kind={kind}
      style={{ left, top, width: Math.max(8, visibleWidth), '--full': `${fullWidth}px` } as React.CSSProperties}
      title={title}
    />
  );
}
