import { useEffect, useState, useCallback } from 'react';
import SunCalc from 'suncalc';

/**
 * Theme management hook with sunrise/sunset auto mode.
 *
 * Resolution order:
 *   1. If user has explicitly toggled the theme → respect that choice (`qrhub_theme`)
 *   2. Otherwise → compute light/dark from real solar times via suncalc
 *      (defaults to Rome 41.9°N 12.5°E; city differences in Italy are < 15 min)
 *   3. Re-check every 5 minutes so the theme flips around sunrise/sunset
 *      without a page reload.
 */
const STORAGE_KEY = 'qrhub_theme';
const ROME_LAT = 41.9028;
const ROME_LNG = 12.4964;

const readManualPref = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* ignore */ }
  return null;
};

const computeAutoTheme = (now = new Date()) => {
  try {
    const times = SunCalc.getTimes(now, ROME_LAT, ROME_LNG);
    // Light between civil dawn and dusk (a few minutes wider than sunrise/sunset
    // so the dashboard switches to light before sunrise feels harsh).
    const dawn = times.dawn || times.sunrise;
    const dusk = times.dusk || times.sunset;
    if (now >= dawn && now < dusk) return 'light';
    return 'dark';
  } catch {
    return 'dark';
  }
};

const readInitial = () => readManualPref() || computeAutoTheme();

const applyTheme = (mode) => {
  const html = document.documentElement;
  if (mode === 'dark') html.classList.add('dark');
  else html.classList.remove('dark');
};

// Apply immediately on import so the very first paint matches the resolved theme.
applyTheme(readInitial());

export const useTheme = () => {
  const [theme, setTheme] = useState(readInitial);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Auto re-evaluate every 5 minutes (only when the user has NOT made an
  // explicit choice — otherwise we'd overwrite their preference).
  useEffect(() => {
    const tick = () => {
      if (readManualPref()) return; // user override wins
      const next = computeAutoTheme();
      setTheme((t) => (t === next ? t : next));
    };
    const id = setInterval(tick, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      // Persist as explicit user override.
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const resetToAuto = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setTheme(computeAutoTheme());
  }, []);

  return { theme, toggle, resetToAuto, isDark: theme === 'dark', isAuto: !readManualPref() };
};

export default useTheme;
