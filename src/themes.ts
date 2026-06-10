// [bg, surface, accent, breakS1, breakBr, breakS2]
export type ThemeSwatch = readonly [string, string, string, string, string, string];

export interface ThemeMeta {
  id: string;
  label: string;
  swatches: ThemeSwatch;
}

export const THEMES: readonly ThemeMeta[] = [
  { id: 'dark',          label: '◼  Oscuro',         swatches: ['#0d0d0d', '#181818', '#4a9eff', '#4a9eff', '#3fa266', '#e09a30'] },
  { id: 'light',         label: '◻  Claro',           swatches: ['#f0f4f8', '#ffffff', '#2563eb', '#3b82f6', '#10b981', '#f59e0b'] },
  { id: 'neubrutal',     label: '▲  Neubrutal',       swatches: ['#fffff0', '#ffffff', '#0051ff', '#0051ff', '#00c936', '#ffd600'] },
  { id: 'editorial',     label: '✦  Editorial',       swatches: ['#f9f7f2', '#ffffff', '#c0392b', '#c0392b', '#27ae60', '#e67e22'] },
  { id: 'retro',         label: '⌨  Retro‑Tech',      swatches: ['#080c08', '#0a120a', '#00ff41', '#00ccff', '#00ff41', '#ffff33'] },
  { id: 'neon-arcade',   label: '★  Neon Arcade',     swatches: ['#06040f', '#0e0820', '#00d4ff', '#00d4ff', '#00ffcc', '#ffcc00'] },
  { id: 'blueprint',     label: '⬡  Blueprint',       swatches: ['#0b1929', '#0f2238', '#00b4d8', '#00b4d8', '#7bff91', '#ffb703'] },
  { id: 'zen',           label: '☯  Zen',             swatches: ['#faf9f7', '#ffffff', '#7a9e8a', '#7a9e8a', '#6a9e7a', '#c4a060'] },
  { id: 'glass',         label: '🪟  Glassmorphism',  swatches: ['#c8d8f0', '#e8f0fc', '#5a78e8', '#5a78e8', '#3ab88a', '#d49830'] },
  { id: 'material',      label: '📐  Material',        swatches: ['#fffbfe', '#e8def8', '#6750a4', '#6750a4', '#386a20', '#7e5700'] },
  { id: 'cyberpunk',     label: '⚡  Cyberpunk',       swatches: ['#050508', '#0a0a12', '#00aaff', '#00aaff', '#aaff00', '#ff00aa'] },
  { id: 'vintage',       label: '📜  Vintage',         swatches: ['#f5e6c8', '#fdf4e3', '#6a5030', '#6a5030', '#5a7040', '#c08020'] },
  { id: 'flat-pastel',   label: '🎨  Flat Pastel',     swatches: ['#f0f8ff', '#ffffff', '#7090e8', '#7090e8', '#60c890', '#f0a860'] },
  { id: 'dark-glass',    label: '🌑  Dark Glass',      swatches: ['#0f0e1a', '#1a1630', '#a78bfa', '#a78bfa', '#4ade80', '#fbbf24'] },
  { id: 'nature',        label: '🌿  Nature',          swatches: ['#f2f5ec', '#f8faf4', '#4a7c59', '#4a7c59', '#3a6e48', '#9a7040'] },
  { id: 'high-contrast', label: '♿  Alto Contraste',  swatches: ['#ffffff', '#ffffff', '#0000ee', '#0000ee', '#006600', '#885500'] },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
