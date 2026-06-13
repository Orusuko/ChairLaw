import { useState } from 'react';
import type { Employee, ScheduledEmployee, ScheduleMode } from '../types';
import type { EmployeeFormData, FormFieldErr } from '../hooks/useEmployees';
import { EmployeeCard } from './EmployeeCard';

interface Props {
  employees: Employee[];
  scheduled: ScheduledEmployee[];
  editingId: string | null;
  scheduleMode: ScheduleMode;
  onRemove: (id: string) => void;
  onNudgeOffset: (id: string, delta: number) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string, data: EmployeeFormData) => FormFieldErr;
  onClearOverrides: (id: string) => void;
}

export function EmployeeList({
  employees, scheduled, editingId, scheduleMode,
  onRemove, onNudgeOffset, onStartEdit, onCancelEdit, onSaveEdit, onClearOverrides,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const schedById = (id: string) => scheduled.find(s => s.id === id);

  return (
    <div className="left-list-section">
      <div className="left-list-head">
        <button
          type="button"
          className="left-list-toggle"
          aria-expanded={!collapsed}
          aria-controls="emp-list-body"
          onClick={() => setCollapsed(c => !c)}
        >
          <span className="left-section-label left-section-label--inline">EMPLEADOS</span>
          <span className="left-count" aria-label={`${employees.length} empleados`}>
            {employees.length}
          </span>
          <span className="left-toggle-arrow" aria-hidden="true">
            {collapsed ? '▶' : '▼'}
          </span>
        </button>
      </div>

      <div
        id="emp-list-body"
        className={`left-list-scroll${collapsed ? ' left-list-hidden' : ''}`}
        role="list"
        aria-label="Lista de empleados"
      >
        {employees.map(emp => (
          <div key={emp.id} role="listitem">
            <EmployeeCard
              emp={emp}
              scheduled={schedById(emp.id)}
              isEditing={editingId === emp.id}
              scheduleMode={scheduleMode}
              onRemove={() => onRemove(emp.id)}
              onNudgeOffset={delta => onNudgeOffset(emp.id, delta)}
              onStartEdit={() => onStartEdit(emp.id)}
              onCancelEdit={onCancelEdit}
              onSaveEdit={data => onSaveEdit(emp.id, data)}
              onClearOverrides={() => onClearOverrides(emp.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
