import { useState } from 'react';
import type { Employee, BreakType, ScheduleMode } from '../types';
import { shiftBounds } from '../algorithm';
import { validTime } from '../timeFormat';
import { isValidArea, normalizeArea } from '../areas';

export interface EmployeeFormData {
  name: string;
  entry: string;
  exit: string;
  area?: string;
}

export type FormFieldErr = 'name' | 'entry' | 'exit' | 'area' | null;

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  function addEmployee(data: EmployeeFormData, mode: ScheduleMode = 'individual'): FormFieldErr {
    const { name, entry, exit, area } = data;
    if (!name.trim()) return 'name';
    if (!validTime(entry)) return 'entry';
    if (!validTime(exit)) return 'exit';
    if (shiftBounds(entry, exit)[2] <= 0) return 'exit';
    if (mode === 'mass' && !isValidArea(area)) return 'area';

    setEmployees(prev => [
      ...prev,
      {
        id: String(Date.now()),
        name: name.trim(),
        entry,
        exit,
        offset: 0,
        area: mode === 'mass' ? normalizeArea(area) : undefined,
      },
    ]);
    return null;
  }

  function removeEmployee(id: string) {
    setEmployees(prev => prev.filter(e => e.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function nudgeOffset(id: string, delta: number) {
    setEmployees(prev =>
      prev.map(e =>
        e.id === id
          ? { ...e, offset: Math.max(-60, Math.min(120, e.offset + delta)) }
          : e,
      ),
    );
  }

  function startEdit(id: string) {
    setEditingId(id);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function saveEdit(id: string, data: EmployeeFormData, mode: ScheduleMode = 'individual'): FormFieldErr {
    const { name, entry, exit, area } = data;
    if (!name.trim()) return 'name';
    if (!validTime(entry)) return 'entry';
    if (!validTime(exit)) return 'exit';
    if (shiftBounds(entry, exit)[2] <= 0) return 'exit';
    if (mode === 'mass' && !isValidArea(area)) return 'area';

    setEmployees(prev =>
      prev.map(e =>
        e.id === id
          ? {
              ...e,
              name: name.trim(),
              entry,
              exit,
              area: mode === 'mass' ? normalizeArea(area) : e.area,
              // Limpiar overrides al cambiar horario o área
              breakOverrides: {},
            }
          : e,
      ),
    );
    setEditingId(null);
    return null;
  }

  function setBreakOverride(empId: string, type: BreakType, startMin: number) {
    setEmployees(prev =>
      prev.map(e =>
        e.id === empId
          ? { ...e, breakOverrides: { ...e.breakOverrides, [type]: startMin } }
          : e,
      ),
    );
  }

  function clearBreakOverrides(empId: string) {
    setEmployees(prev =>
      prev.map(e =>
        e.id === empId ? { ...e, breakOverrides: {} } : e,
      ),
    );
  }

  return {
    employees,
    editingId,
    addEmployee,
    removeEmployee,
    nudgeOffset,
    startEdit,
    cancelEdit,
    saveEdit,
    setBreakOverride,
    clearBreakOverrides,
  };
}
