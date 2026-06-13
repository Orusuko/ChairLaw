export type BreakType = 'silla1' | 'break' | 'silla2';
export type ScheduleMode = 'individual' | 'mass';

export interface Employee {
  id: string;
  name: string;
  entry: string;   // "HH:MM"
  exit: string;    // "HH:MM"
  offset: number;  // minutos de retraso manual (-60 a +120)
  area?: string;   // obligatorio en modo masivo
  /** Override manual de inicio (minutos desde medianoche) por tipo de break. null = usar algoritmo */
  breakOverrides?: Partial<Record<BreakType, number>>;
}

export interface BreakSlot {
  type: BreakType;
  start: number;    // minutos desde medianoche
  end: number;
  duration: number;
  conflict: boolean;
  /** True si la posición viene de un override manual, no del algoritmo */
  isOverride?: boolean;
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

export const BREAK_COLORS: Record<BreakType, string> = {
  silla1: 'var(--break-s1)',
  break:  'var(--break-br)',
  silla2: 'var(--break-s2)',
};
