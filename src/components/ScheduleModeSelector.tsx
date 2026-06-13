import type { ScheduleMode } from '../types';

interface Props {
  mode: ScheduleMode;
  onChange: (mode: ScheduleMode) => void;
}

export function ScheduleModeSelector({ mode, onChange }: Props) {
  return (
    <div className="mode-selector no-screenshot" role="group" aria-label="Modo de horario">
      <button
        type="button"
        className={`mode-btn${mode === 'individual' ? ' mode-btn--active' : ''}`}
        aria-pressed={mode === 'individual'}
        onClick={() => onChange('individual')}
      >
        Individual
      </button>
      <button
        type="button"
        className={`mode-btn${mode === 'mass' ? ' mode-btn--active' : ''}`}
        aria-pressed={mode === 'mass'}
        onClick={() => onChange('mass')}
      >
        Masivo
      </button>
    </div>
  );
}
