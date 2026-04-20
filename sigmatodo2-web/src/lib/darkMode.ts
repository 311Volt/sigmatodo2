import { useState, useEffect } from 'react';

function applyDark(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => { applyDark(isDark); }, [isDark]);

  const toggle = () => {
    setIsDark(d => {
      localStorage.setItem('theme', !d ? 'dark' : 'light');
      return !d;
    });
  };

  return { isDark, toggle };
}
