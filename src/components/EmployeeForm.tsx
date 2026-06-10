import { useState } from 'react';
import type { EmployeeFormData, FormFieldErr } from '../hooks/useEmployees';
import { validTime } from '../timeFormat';
import { shiftBounds } from '../algorithm';

interface Props {
  initialData?: EmployeeFormData;
  submitLabel?: string;
  onSubmit: (data: EmployeeFormData) => FormFieldErr;
  onCancel?: () => void;
}

export function EmployeeForm({ initialData, submitLabel = '+ Agregar empleado', onSubmit, onCancel }: Props) {
  const [name, setName]   = useState(initialData?.name  ?? '');
  const [entry, setEntry] = useState(initialData?.entry ?? '08:00');
  const [exit, setExit]   = useState(initialData?.exit  ?? '16:00');
  const [err, setErr]     = useState<FormFieldErr>(null);

  function validate(): FormFieldErr {
    if (!name.trim()) return 'name';
    if (!validTime(entry)) return 'entry';
    if (!validTime(exit)) return 'exit';
    if (shiftBounds(entry, exit)[2] <= 0) return 'exit';
    return null;
  }

  function handleSubmit() {
    const fieldErr = validate();
    setErr(fieldErr);
    if (fieldErr) return;
    const result = onSubmit({ name: name.trim(), entry, exit });
    if (result) { setErr(result); return; }
    if (!initialData) {
      setName('');
      setEntry('08:00');
      setExit('16:00');
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
