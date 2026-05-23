import { useEffect, useState, useCallback } from 'react';

/**
 * Theme management hook.
 *
 * Persists the user's preference in localStorage and keeps the `dark` class
 * on <html> in sync so both Tailwind `dark:` variants and shadcn CSS
 * variables react to the switch.
 *
 * Default = dark (matches the platform's brand). Users can opt into the
 * light theme from the dashboard header toggle.
 */
const STORAGE_KEY = 'qrhub_theme';

const readInitial = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* ignore */ }
  // No saved preference yet — respect the OS-level setting on first visit.
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  } catch { /* ignore */ }
  return 'dark';
};

const applyTheme = (mode) => {
  const html = document.documentElement;
  if (mode === 'dark') html.classList.add('dark');
  else html.classList.remove('dark');
};

// Apply immediately on import so the very first paint matches the saved theme.
applyTheme(readInitial());

export const useTheme = () => {
  const [theme, setTheme] = useState(readInitial);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle, isDark: theme === 'dark' };
};

export default useTheme;
