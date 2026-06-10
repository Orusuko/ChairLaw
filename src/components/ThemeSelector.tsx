import { useEffect, useRef, useState } from 'react';
import { THEMES } from '../themes';
import type { ThemeId } from '../themes';

interface Props {
  theme: ThemeId;
  onChange: (id: ThemeId) => void;
}

export function ThemeSelector({ theme, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = THEMES.find(t => t.id === theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [open]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="theme-selector no-screenshot" ref={containerRef} onKeyDown={handleKey}>
      <button
        type="button"
        className="theme-trigger"
        aria-label={`Tema actual: ${current.label}. Abrir selector de temas`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(o => !o)}
      >
        <span className="theme-trigger-swatches" aria-hidden="true">
          {current.swatches.slice(0, 3).map((c, i) => (
            <span key={i} className="theme-swatch-dot" style={{ background: c }} />
          ))}
        </span>
        <span className="theme-trigger-label">{current.label}</span>
        <span className="theme-trigger-arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          className="theme-panel"
          role="listbox"
          aria-label="Seleccionar tema"
          aria-activedescendant={`theme-opt-${theme}`}
        >
          <div className="theme-grid">
            {THEMES.map(t => (
              <button
                key={t.id}
                id={`theme-opt-${t.id}`}
                type="button"
                className={`theme-card${t.id === theme ? ' theme-card--active' : ''}`}
                role="option"
                aria-selected={t.id === theme}
                onClick={() => { onChange(t.id as ThemeId); setOpen(false); }}
              >
                <div className="theme-card-swatches" aria-hidden="true">
                  {t.swatches.map((c, i) => (
                    <span key={i} className="theme-card-strip" style={{ background: c }} />
                  ))}
                </div>
                <span className="theme-card-name">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
