import { BREAK_COLORS, BREAK_LABEL } from '../types';
import type { Employee, ScheduledEmployee, ScheduleMode } from '../types';
import type { EmployeeFormData } from '../hooks/useEmployees';
import { shiftBounds } from '../algorithm';
import { formatShiftLine, formatSlotAmPm } from '../timeFormat';
import { EmployeeForm } from './EmployeeForm';

interface Props {
  emp: Employee;
  scheduled: ScheduledEmployee | undefined;
  isEditing: boolean;
  scheduleMode: ScheduleMode;
  onRemove: () => void;
  onNudgeOffset: (delta: number) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (data: EmployeeFormData) => import('../hooks/useEmployees').FormFieldErr;
  onClearOverrides: () => void;
}

export function EmployeeCard({
  emp, scheduled, isEditing, scheduleMode,
  onRemove, onNudgeOffset, onStartEdit, onCancelEdit, onSaveEdit, onClearOverrides,
}: Props) {
  const conflict = scheduled?.hasConflict ?? false;
  const hasOverrides = emp.breakOverrides && Object.keys(emp.breakOverrides).length > 0;

  return (
    <article
      className={`emp-card${conflict ? ' emp-card--conflict' : ''}`}
      aria-label={`Empleado: ${emp.name}`}
    >
      {isEditing ? (
        <div className="emp-edit-wrap">
          <p className="emp-edit-label">Editando: <strong>{emp.name}</strong></p>
          <EmployeeForm
            initialData={{ name: emp.name, entry: emp.entry, exit: emp.exit, area: emp.area }}
            submitLabel="Guardar cambios"
            scheduleMode={scheduleMode}
            onSubmit={onSaveEdit}
            onCancel={onCancelEdit}
          />
        </div>
      ) : (
        <>
          <div className="emp-card-row0">
            <span className={`emp-name${conflict ? ' emp-name--conflict' : ''}`}>
              {emp.name.length > 22 ? emp.name.slice(0, 21) + '…' : emp.name}
            </span>
            <div className="emp-card-actions">
              <button
                type="button"
                className="emp-edit"
                aria-label={`Editar ${emp.name}`}
                onClick={onStartEdit}
              >
                ✎
              </button>
              <button
                type="button"
                className="emp-remove"
                aria-label={`Eliminar ${emp.name}`}
                onClick={onRemove}
              >
                ✕
              </button>
            </div>
          </div>

          {scheduleMode === 'mass' && emp.area && (
            <div className="emp-area-badge">{emp.area}</div>
          )}

          <div className="emp-shift mono">
            {formatShiftLine(emp.entry, emp.exit, shiftBounds(emp.entry, emp.exit)[2])}
          </div>

          <div className="emp-offset-row">
            <span className="emp-offset-lbl">Offset:</span>
            <button
              type="button"
              className="emp-off-btn"
              aria-label="Reducir offset 5 minutos"
              onClick={() => onNudgeOffset(-5)}
              onKeyDown={e => e.key === 'ArrowLeft' && onNudgeOffset(-5)}
            >
              −
            </button>
            <span className={`emp-off-val mono${emp.offset !== 0 ? ' emp-off-val--amber' : ''}`}>
              {emp.offset > 0 ? '+' : ''}{emp.offset} m
            </span>
            <button
              type="button"
              className="emp-off-btn"
              aria-label="Aumentar offset 5 minutos"
              onClick={() => onNudgeOffset(5)}
              onKeyDown={e => e.key === 'ArrowRight' && onNudgeOffset(5)}
            >
              +
            </button>
          </div>

          {scheduled?.breaks.map((brk, bi) => (
            <div
              key={bi}
              className={`emp-brk-preview mono${brk.isOverride ? ' emp-brk-override' : ''}`}
              style={{ color: brk.conflict ? 'var(--red)' : BREAK_COLORS[brk.type] }}
              title={brk.isOverride ? 'Posición manual' : undefined}
            >
              &nbsp;&nbsp;{BREAK_LABEL[brk.type]} {formatSlotAmPm(brk)}
              {brk.isOverride && ' ✎'}
            </div>
          ))}

          {hasOverrides && (
            <button
              type="button"
              className="btn-reset-overrides"
              onClick={onClearOverrides}
              aria-label={`Restaurar horario automático de ${emp.name}`}
            >
              ↺ Restaurar automático
            </button>
          )}
        </>
      )}
    </article>
  );
}
