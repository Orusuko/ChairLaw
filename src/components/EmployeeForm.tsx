import { useState } from 'react';
import type { EmployeeFormData, FormFieldErr } from '../hooks/useEmployees';
import type { ScheduleMode } from '../types';
import { validTime } from '../timeFormat';
import { shiftBounds } from '../algorithm';
import { AREAS, isValidArea } from '../areas';

interface Props {
  initialData?: EmployeeFormData;
  submitLabel?: string;
  scheduleMode?: ScheduleMode;
  onSubmit: (data: EmployeeFormData) => FormFieldErr;
  onCancel?: () => void;
}

export function EmployeeForm({
  initialData,
  submitLabel = '+ Agregar empleado',
  scheduleMode = 'individual',
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName]   = useState(initialData?.name  ?? '');
  const [entry, setEntry] = useState(initialData?.entry ?? '08:00');
  const [exit, setExit]   = useState(initialData?.exit  ?? '16:00');
  const [area, setArea]   = useState(initialData?.area  ?? '');
  const [err, setErr]     = useState<FormFieldErr>(null);

  const isMass = scheduleMode === 'mass';

  function validate(): FormFieldErr {
    if (!name.trim()) return 'name';
    if (!validTime(entry)) return 'entry';
    if (!validTime(exit)) return 'exit';
    if (shiftBounds(entry, exit)[2] <= 0) return 'exit';
    if (isMass && !isValidArea(area)) return 'area';
    return null;
  }

  function handleSubmit() {
    const fieldErr = validate();
    setErr(fieldErr);
    if (fieldErr) return;
    const result = onSubmit({ name: name.trim(), entry, exit, area: isMass ? area : undefined });
    if (result) { setErr(result); return; }
    if (!initialData) {
      setName('');
      setEntry('08:00');
      setExit('16:00');
      setArea('');
      setErr(null);
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape' && onCancel) onCancel();
  };

  return (
    <div className="emp-form">
      <input
        className={`left-inp${err === 'name' ? ' left-inp--err' : ''}`}
        placeholder="Nombre completo"
        value={name}
        aria-label="Nombre del empleado"
        aria-invalid={err === 'name'}
        onChange={e => { setName(e.target.value); setErr(null); }}
        onKeyDown={onKey}
      />
      <input
        className={`left-inp mono${err === 'entry' ? ' left-inp--err' : ''}`}
        placeholder="Entrada  (08:00)"
        value={entry}
        aria-label="Hora de entrada"
        aria-invalid={err === 'entry'}
        onChange={e => { setEntry(e.target.value); setErr(null); }}
        onKeyDown={onKey}
      />
      <input
        className={`left-inp mono${err === 'exit' ? ' left-inp--err' : ''}`}
        placeholder="Salida   (16:00)"
        value={exit}
        aria-label="Hora de salida"
        aria-invalid={err === 'exit'}
        onChange={e => { setExit(e.target.value); setErr(null); }}
        onKeyDown={onKey}
      />
      {isMass && (
        <select
          className={`left-inp left-sel${err === 'area' ? ' left-inp--err' : ''}`}
          value={area}
          aria-label="Área de trabajo"
          aria-required="true"
          aria-invalid={err === 'area'}
          onChange={e => { setArea(e.target.value); setErr(null); }}
        >
          <option value="">Área…</option>
          {AREAS.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      )}
      <div className="emp-form-btns">
        <button type="button" className="btn-add-emp" onClick={handleSubmit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-cancel-edit" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
