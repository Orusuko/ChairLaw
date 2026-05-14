export type BreakType = 'silla1' | 'break' | 'silla2';

export interface Employee {
  id: string;
  name: string;
  entry: string;   // "HH:MM"
  exit: string;    // "HH:MM"
  offset: number;  // minutos de retraso manual (-60 a +120)
}

export interface BreakSlot {
  type: BreakType;
  start: number;    // minutos desde medianoche
  end: number;
  duration: number;
  conflict: boolean;
}

export interface ScheduledEmployee extends Employee {
  breaks: BreakSlot[];
  shiftHours: number;
  hasConflict: boolean;
}

export const BREAK_LABEL: Record<BreakType, string> = {
  silla1: 'Silla 1',
  break:  'Break',
  silla2: 'Silla 2',
};
