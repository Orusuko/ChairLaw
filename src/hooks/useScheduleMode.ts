import { useState } from 'react';
import type { ScheduleMode } from '../types';

const STORAGE_KEY = 'hr-schedule-mode';

export function useScheduleMode() {
  const [scheduleMode, setScheduleModeState] = useState<ScheduleMode>(
    () => (localStorage.getItem(STORAGE_KEY) as ScheduleMode | null) ?? 'individual',
  );

  function setScheduleMode(mode: ScheduleMode) {
    setScheduleModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }

  return { scheduleMode, setScheduleMode };
}
