import { PRECISION_LABEL, changePrecision } from '../lib/fuzzyDate';
import type { DatePrecision, FuzzyDate } from '../lib/types';

const PRECISIONS: DatePrecision[] = ['day', 'month', 'quarter', 'half', 'year', 'tba'];
const pad = (n: number | undefined) => String(n ?? 1).padStart(2, '0');

/** Date input that lets you say exactly how much you know: a day, a quarter, a year, or nothing. */
export function FuzzyDateInput({ value, onChange }: { value: FuzzyDate; onChange: (d: FuzzyDate) => void }) {
  const thisYear = new Date().getFullYear();
  const current = value.year ?? thisYear;
  const years = Array.from({ length: 12 }, (_, i) => thisYear - 1 + i);
  if (!years.includes(current)) years.push(current);
  years.sort((a, b) => a - b);
  const yearInput = (
    <select
      className="input input--year"
      value={current}
      onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
      aria-label="Year"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );

  return (
    <div className="fuzzy-input">
      <div className="segmented" role="radiogroup" aria-label="How precise is the date?">
        {PRECISIONS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value.precision === p}
            className={value.precision === p ? 'is-active' : ''}
            onClick={() => p !== value.precision && onChange(changePrecision(value, p))}
          >
            {PRECISION_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="fuzzy-input__fields">
        {value.precision === 'day' && (
          <input
            type="date"
            className="input"
            value={`${value.year}-${pad(value.month)}-${pad(value.day)}`}
            onChange={(e) => {
              const [y, m, d] = e.target.value.split('-').map(Number);
              if (y && m && d) onChange({ precision: 'day', year: y, month: m, day: d });
            }}
          />
        )}
        {value.precision === 'month' && (
          <input
            type="month"
            className="input"
            value={`${value.year}-${pad(value.month)}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              if (y && m) onChange({ precision: 'month', year: y, month: m });
            }}
          />
        )}
        {value.precision === 'quarter' && (
          <>
            <div className="segmented segmented--small">
              {([1, 2, 3, 4] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  className={value.quarter === q ? 'is-active' : ''}
                  onClick={() => onChange({ ...value, quarter: q })}
                >
                  Q{q}
                </button>
              ))}
            </div>
            {yearInput}
          </>
        )}
        {value.precision === 'half' && (
          <>
            <div className="segmented segmented--small">
              {([1, 2] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  className={value.half === h ? 'is-active' : ''}
                  onClick={() => onChange({ ...value, half: h })}
                >
                  H{h}
                </button>
              ))}
            </div>
            {yearInput}
          </>
        )}
        {value.precision === 'year' && yearInput}
        {value.precision === 'tba' && <span className="hint">No date announced yet.</span>}
      </div>
    </div>
  );
}
