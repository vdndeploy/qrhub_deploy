import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Structured opening-hours editor — Google-Business style.
 * Stores a `{ mon: {closed, open, close, break_start, break_end}, tue: ... }` object.
 *
 * Props:
 *   value:    the hours object (may be null/undefined)
 *   onChange: (newHours) => void
 */
export const DAYS = [
  { key: 'mon', label: 'Lunedì' },
  { key: 'tue', label: 'Martedì' },
  { key: 'wed', label: 'Mercoledì' },
  { key: 'thu', label: 'Giovedì' },
  { key: 'fri', label: 'Venerdì' },
  { key: 'sat', label: 'Sabato' },
  { key: 'sun', label: 'Domenica' },
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
    const lunch = x.break_start && x.break_end ? `${x.open}-${x.break_start} / ${x.break_end}-${x.close}` : `${x.open}-${x.close}`;
    return lunch;
  };
  const signatures = DAYS.map(d => sig(d));
  // Group consecutive equal signatures
  const lines = [];
  let i = 0;
  while (i < DAYS.length) {
    const s = signatures[i];
    if (!s) { i += 1; continue; }
    let j = i;
    while (j + 1 < DAYS.length && signatures[j + 1] === s) j += 1;
    const startLabel = DAYS[i].label.slice(0, 3);
    const endLabel = DAYS[j].label.slice(0, 3);
    const range = i === j ? startLabel : `${startLabel}-${endLabel}`;
    lines.push(`${range}: ${s === 'CLOSED' ? 'Chiuso' : s}`);
    i = j + 1;
  }
  return lines.join('\n');
};

const HoursEditor = ({ value, onChange }) => {
  const hours = ensureHoursShape(value);
  const setDay = (key, patch) => {
    const next = { ...hours, [key]: { ...hours[key], ...patch } };
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-gray-500 dark:text-[#6a6a72] uppercase tracking-wide px-1">
        <div className="col-span-3">Giorno</div>
        <div className="col-span-2 text-center">Chiuso</div>
        <div className="col-span-3">Apertura</div>
        <div className="col-span-2">Pausa</div>
        <div className="col-span-2">Chiusura</div>
      </div>
      {DAYS.map(d => {
        const dh = hours[d.key];
        const disabled = dh.closed;
        return (
          <div key={d.key} className="grid grid-cols-12 gap-2 items-center" data-testid={`hours-row-${d.key}`}>
            <div className="col-span-3 text-sm font-medium">{d.label}</div>
            <div className="col-span-2 flex justify-center">
              <Checkbox
                checked={dh.closed}
                onCheckedChange={(v) => setDay(d.key, { closed: !!v, ...(v ? emptyDay() : {}) })}
                data-testid={`hours-closed-${d.key}`}
              />
            </div>
            <div className="col-span-3">
              <Input
                type="time"
                value={dh.open}
                disabled={disabled}
                onChange={(e) => setDay(d.key, { open: e.target.value })}
                className="h-8 text-sm"
                data-testid={`hours-open-${d.key}`}
              />
            </div>
            <div className="col-span-2 flex gap-1">
              <Input
                type="time"
                value={dh.break_start}
                disabled={disabled}
                onChange={(e) => setDay(d.key, { break_start: e.target.value })}
                placeholder="—"
                className="h-8 text-xs px-1.5"
                data-testid={`hours-break-start-${d.key}`}
              />
              <Input
                type="time"
                value={dh.break_end}
                disabled={disabled}
                onChange={(e) => setDay(d.key, { break_end: e.target.value })}
                placeholder="—"
                className="h-8 text-xs px-1.5"
                data-testid={`hours-break-end-${d.key}`}
              />
            </div>
            <div className="col-span-2">
              <Input
                type="time"
                value={dh.close}
                disabled={disabled}
                onChange={(e) => setDay(d.key, { close: e.target.value })}
                className="h-8 text-sm"
                data-testid={`hours-close-${d.key}`}
              />
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-gray-500 dark:text-[#6a6a72] pt-1">
        Lascia i campi vuoti per non specificare. Compila la pausa (es. 13:00 / 15:00) solo se chiudi a pranzo.
      </p>
    </div>
  );
};

export default HoursEditor;
