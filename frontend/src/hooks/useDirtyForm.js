import { useEffect, useMemo, useRef } from 'react';

/**
 * useDirtyForm — track whether the current form values differ from an initial
 * snapshot. Returns `isDirty: boolean` so callers can decorate the Save button
 * (e.g. with a "modifiche non salvate" dot) and optionally block navigation.
 *
 * Snapshot strategy: a `JSON.stringify` of the watched fields is taken when
 * `active` flips to true (modal opens) and re-evaluated against the current
 * `formData` on every render. This is fast enough for small forms (~20 fields)
 * and avoids surprising memo references for nested objects (e.g. hours map).
 *
 * @param {object} formData       Current form state.
 * @param {boolean} active        Whether the form is currently mounted / open.
 *                                When this flips to true we re-snapshot.
 * @returns {{isDirty: boolean, resetBaseline: Function}}
 */
const stringify = (v) => {
  try { return JSON.stringify(v ?? null); } catch { return ''; }
};

export const useDirtyForm = (formData, active) => {
  const baselineRef = useRef('');

  // Re-snapshot whenever the form becomes active (e.g. modal opens with a
  // fresh entity). This is the only place we capture the baseline so any
  // subsequent edit registers as "dirty".
  useEffect(() => {
    if (active) baselineRef.current = stringify(formData);
    // We snapshot ONLY on `active` transitions, not on every keystroke
    // (that's the whole point — keystrokes are what we want to detect).
  }, [active]);

  const isDirty = useMemo(() => {
    if (!active) return false;
    return baselineRef.current !== '' && baselineRef.current !== stringify(formData);
  }, [formData, active]);

  // Allow callers to mark the current state as the new baseline (e.g. after
  // a successful save so the user can keep editing without the dirty dot).
  const resetBaseline = () => { baselineRef.current = stringify(formData); };

  return { isDirty, resetBaseline };
};

/**
 * DirtyDot — tiny visual indicator (amber pulsing dot) for use inside the
 * Save button label when the form has unsaved changes. Kept inline so it
 * inherits the button's text size.
 */
export const DirtyDot = ({ className = '' }) => (
  <span
    aria-hidden="true"
    className={`inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse mr-1.5 align-middle ${className}`}
    data-testid="dirty-form-dot"
  />
);

export default useDirtyForm;
