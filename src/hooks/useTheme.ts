import { useEffect, useState } from 'react';
import type { ThemeId } from '../themes';

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(
    () => (localStorage.getItem('hr-theme') as ThemeId | null) ?? 'dark',
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hr-theme', theme);
  }, [theme]);

  return { theme, setTheme: setThemeState };
}
