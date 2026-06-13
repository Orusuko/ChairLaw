import type { ThemeId } from '../themes';
import type { ScheduleMode } from '../types';
import { ThemeSelector } from './ThemeSelector';
import { ScheduleModeSelector } from './ScheduleModeSelector';

interface Props {
  employeeCount: number;
  withBreaks: number;
  conflictCount: number;
  totalBreakMin: number;
  theme: ThemeId;
  onThemeChange: (id: ThemeId) => void;
  scheduleMode: ScheduleMode;
  onScheduleModeChange: (mode: ScheduleMode) => void;
}

export function AppHeader({ employeeCount, withBreaks, conflictCount, totalBreakMin, theme, onThemeChange, scheduleMode, onScheduleModeChange }: Props) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <span className="header-logo" aria-hidden="true">HR</span>
        <div className="header-titles">
          <h1 className="header-title">Generador de Horarios de Descanso</h1>
          <p className="header-sub">
            Algoritmo de no-traslape &nbsp;|&nbsp; Priority Queue &nbsp;|&nbsp; Detección de conflictos
          </p>
        </div>
      </div>

      <div className="header-right">
        <ScheduleModeSelector mode={scheduleMode} onChange={onScheduleModeChange} />
        <ThemeSelector theme={theme} onChange={onThemeChange} />
        <div className="header-stats no-screenshot" role="status" aria-live="polite" aria-label="Estadísticas">
          <div className="stat-box">
            <span className="stat-box-val">{employeeCount}</span>
            <span className="stat-box-lbl">Empleados</span>
          </div>
          <div className="stat-box">
            <span className="stat-box-val stat-box-val--green">{withBreaks}</span>
            <span className="stat-box-lbl">Con descansos</span>
          </div>
          <div className="stat-box">
            <span className={`stat-box-val${conflictCount ? ' stat-box-val--red' : ''}`}>
              {conflictCount}
            </span>
            <span className="stat-box-lbl">Conflictos</span>
          </div>
          <div className="stat-box">
            <span className="stat-box-val">{totalBreakMin}</span>
            <span className="stat-box-lbl">Min. asignados</span>
          </div>
        </div>
      </div>
    </header>
  );
}
