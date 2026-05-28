import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

/**
 * Structured opening-hours editor — Google-Business style, mobile-friendly.
 * Stores a `{ mon: {closed, open, close, break_start, break_end}, tue: ... }` object.
 *
 * Each day is a card so users can read it like a list, not a tight grid.
 * Lunch break is collapsed behind a small toggle to keep the editor calm.
 *
 * Props:
 *   value:    the hours object (may be null/undefined)
 *   onChange: (newHours) => void
 */
export const DAYS = [
  { key: 'mon', label: 'Lunedì', short: 'Lun' },
  { key: 'tue', label: 'Martedì', short: 'Mar' },
  { key: 'wed', label: 'Mercoledì', short: 'Mer' },
  { key: 'thu', label: 'Giovedì', short: 'Gio' },
  { key: 'fri', label: 'Venerdì', short: 'Ven' },
  { key: 'sat', label: 'Sabato', short: 'Sab' },
  { key: 'sun', label: 'Domenica', short: 'Dom' },
];

const emptyDay = () => ({ closed: false, open: '', close: '', break_start: '', break_end: '' });

export const ensureHoursShape = (h) => {
  const out = {};
  for (const d of DAYS) {
    const v = (h && h[d.key]) || {};
    out[d.key] = {
      closed: !!v.closed,
      open: v.open || '',
      close: v.close || '',
      break_start: v.break_start || '',
      break_end: v.break_end || '',
    };
  }
  return out;
};

/**
 * Build a human-readable Italian summary of the structured hours, e.g.
 *   "Lun-Ven: 09:00-13:00 / 15:00-19:30\nSab: 09:00-13:00\nDom: Chiuso"
 * Days with identical schedules get grouped into ranges.
 */
export const formatHoursText = (hours) => {
  if (!hours) return '';
  const h = ensureHoursShape(hours);
  const sig = (d) => {
    const x = h[d.key];
    if (x.closed) return 'CLOSED';
    if (!x.open || !x.close) return '';
    const lunch = x.break_start && x.break_end
      ? `${x.open}-${x.break_start} / ${x.break_end}-${x.close}`
      : `${x.open}-${x.close}`;
    return lunch;
  };
  const signatures = DAYS.map(d => sig(d));
  const lines = [];
  let i = 0;
  while (i < DAYS.length) {
    const s = signatures[i];
    if (!s) { i += 1; continue; }
    let j = i;
    while (j + 1 < DAYS.length && signatures[j + 1] === s) j += 1;
    const startLabel = DAYS[i].short;
    const endLabel = DAYS[j].short;
    const range = i === j ? startLabel : `${startLabel}-${endLabel}`;
    lines.push(`${range}: ${s === 'CLOSED' ? 'Chiuso' : s}`);
    i = j + 1;
  }
  return lines.join('\n');
};

// ─────────────────────────────────────────────────────────────────────────
// Real-time "open now" computation. Pure function so it can be unit-tested.
// Returns { status: 'open' | 'closed' | 'closing_soon' | 'opening_soon',
//           label: string,  detail: string }
// `now` defaults to current time but is injectable for tests.
// ─────────────────────────────────────────────────────────────────────────
const DAY_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const parseHM = (s) => {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
};

const buildIntervals = (day) => {
  if (!day || day.closed) return [];
  const open = parseHM(day.open);
  const close = parseHM(day.close);
  if (open == null || close == null) return [];
  const bStart = parseHM(day.break_start);
  const bEnd = parseHM(day.break_end);
  if (bStart != null && bEnd != null && bStart < bEnd && bStart > open && bEnd < close) {
    return [[open, bStart], [bEnd, close]];
  }
  return [[open, close]];
};

export const computeOpenStatus = (hours, now = new Date()) => {
  const h = ensureHoursShape(hours);
  const todayKey = DAY_ORDER[now.getDay()];
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const today = h[todayKey];
  const todayIntervals = buildIntervals(today);

  // Are we currently inside an open interval?
  for (const [start, end] of todayIntervals) {
    if (minutesNow >= start && minutesNow < end) {
      const minutesLeft = end - minutesNow;
      if (minutesLeft <= 30) {
        return {
          status: 'closing_soon',
          label: 'Chiude a breve',
          detail: `Chiude alle ${formatHM(end)}`,
        };
      }
      return {
        status: 'open',
        label: 'Aperto adesso',
        detail: `Chiude alle ${formatHM(end)}`,
      };
    }
  }

  // We're closed — find the next opening today, then in the upcoming week.
  for (const [start] of todayIntervals) {
    if (start > minutesNow) {
      const minutesUntil = start - minutesNow;
      if (minutesUntil <= 60) {
        return {
          status: 'opening_soon',
          label: 'Apre a breve',
          detail: `Apre alle ${formatHM(start)}`,
        };
      }
      return {
        status: 'closed',
        label: 'Chiuso adesso',
        detail: `Apre alle ${formatHM(start)}`,
      };
    }
  }

  // Look at the next 7 days for the next opening day.
  for (let i = 1; i <= 7; i += 1) {
    const k = DAY_ORDER[(now.getDay() + i) % 7];
    const iv = buildIntervals(h[k]);
    if (iv.length > 0) {
      const day = DAYS.find(d => d.key === k);
      const [nextOpen] = iv[0];
      return {
        status: 'closed',
        label: 'Chiuso adesso',
        detail: i === 1
          ? `Apre domani alle ${formatHM(nextOpen)}`
          : `Apre ${day.label.toLowerCase()} alle ${formatHM(nextOpen)}`,
      };
    }
  }

  return { status: 'closed', label: 'Chiuso', detail: '' };
};

const formatHM = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ─────────────────────────────────────────────────────────────────────────
// Editor UI
// ─────────────────────────────────────────────────────────────────────────
const DayCard = ({ day, value, onChange }) => {
  const disabled = value.closed;
  const showBreak = !disabled && (value.break_start || value.break_end);
  const toggleBreak = () => {
    if (showBreak) {
      onChange({ ...value, break_start: '', break_end: '' });
    } else {
      // Smart default: half-day pause around 13:00–15:00
      onChange({ ...value, break_start: '13:00', break_end: '15:00' });
    }
  };
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/10 p-3 sm:p-4 bg-gray-50/50 dark:bg-white/[0.02]">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-sm text-gray-900 dark:text-white">{day.label}</div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className={`text-xs ${disabled ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-500 dark:text-[#6a6a72]'}`}>
            {disabled ? 'Chiuso' : 'Aperto'}
          </span>
          <Switch
            checked={!disabled}
            onCheckedChange={(v) => {
              // v === true → open the day (apply defaults if previously empty),
              // v === false → close the day (preserve hours so re-opening restores them).
              if (v) {
                onChange({
                  ...value,
                  closed: false,
                  open: value.open || '09:00',
                  close: value.close || '19:00',
                });
              } else {
                onChange({ ...value, closed: true });
              }
            }}
            data-testid={`hours-switch-${day.key}`}
          />
        </label>
      </div>
      {!disabled && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-[#6a6a72] font-semibold block mb-1">Apertura</label>
              <Input
                type="time"
                value={value.open}
                onChange={(e) => onChange({ ...value, open: e.target.value })}
                className="h-10"
                data-testid={`hours-open-${day.key}`}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-[#6a6a72] font-semibold block mb-1">Chiusura</label>
              <Input
                type="time"
                value={value.close}
                onChange={(e) => onChange({ ...value, close: e.target.value })}
                className="h-10"
                data-testid={`hours-close-${day.key}`}
              />
            </div>
          </div>
          {showBreak ? (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-1">
              <div>
                <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-[#6a6a72] font-semibold block mb-1">Pausa inizio</label>
                <Input
                  type="time"
                  value={value.break_start}
                  onChange={(e) => onChange({ ...value, break_start: e.target.value })}
                  className="h-10"
                  data-testid={`hours-break-start-${day.key}`}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-[#6a6a72] font-semibold block mb-1">Pausa fine</label>
                <Input
                  type="time"
                  value={value.break_end}
                  onChange={(e) => onChange({ ...value, break_end: e.target.value })}
                  className="h-10"
                  data-testid={`hours-break-end-${day.key}`}
                />
              </div>
              <button
                type="button"
                onClick={toggleBreak}
                className="col-span-2 text-[11px] text-gray-500 dark:text-[#6a6a72] hover:text-gray-700 dark:hover:text-[#a8a8b0] text-left"
              >
                − Rimuovi pausa pranzo
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={toggleBreak}
              className="text-[11px] text-[#D2FA46] hover:text-[#bce63d] font-medium"
              data-testid={`hours-add-break-${day.key}`}
            >
              + Aggiungi pausa pranzo
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const HoursEditor = ({ value, onChange }) => {
  const hours = ensureHoursShape(value);

  const copyMondayToWeekdays = () => {
    const mon = hours.mon;
    const next = { ...hours };
    ['tue', 'wed', 'thu', 'fri'].forEach((k) => { next[k] = { ...mon }; });
    onChange(next);
  };

  const setAllClosed = () => {
    const next = {};
    DAYS.forEach((d) => { next[d.key] = { ...emptyDay(), closed: true }; });
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyMondayToWeekdays}
          className="text-[11px] px-3 py-1.5 rounded-full border border-gray-200 dark:border-white/10 text-gray-700 dark:text-[#a8a8b0] hover:bg-gray-50 dark:hover:bg-white/5"
          data-testid="hours-copy-weekdays"
        >
          Copia Lun → Mar-Ven
        </button>
        <button
          type="button"
          onClick={setAllClosed}
          className="text-[11px] px-3 py-1.5 rounded-full border border-gray-200 dark:border-white/10 text-gray-700 dark:text-[#a8a8b0] hover:bg-gray-50 dark:hover:bg-white/5"
          data-testid="hours-clear-all"
        >
          Tutti chiusi
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="hours-editor">
        {DAYS.map((d) => (
          <DayCard
            key={d.key}
            day={d}
            value={hours[d.key]}
            onChange={(newDay) => onChange({ ...hours, [d.key]: newDay })}
          />
        ))}
      </div>
    </div>
  );
};

export default HoursEditor;
