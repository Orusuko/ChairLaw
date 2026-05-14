import { timeToMin } from './algorithm';
import type { BreakSlot } from './types';

/** Igual que Python `min_to_ampm`: 12:45 PM */
export function minToAmPm(m: number): string {
  const total = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const mins = total % 60;
  const suf = h < 12 ? 'AM' : 'PM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${suf}`;
}

/** 'HH:MM' 24 h → texto 12 h (Python `time_str_ampm`) */
export function timeStrAmPm(hhMm: string): string {
  try {
    return minToAmPm(timeToMin(hhMm));
  } catch {
    return hhMm;
  }
}

/** Rango inicio–fin en 12 h (Python `format_slot_ampm`, em dash corto) */
export function formatSlotAmPm(brk: BreakSlot | undefined): string {
  if (!brk) return '—';
  return `${minToAmPm(brk.start)} – ${minToAmPm(brk.end)}`;
}

/** Etiqueta de eje: misma lógica que timeline Python */
export function axisLabelMinToTime(m: number): string {
  return minToAmPm(m);
}

export function validTime(t: string): boolean {
  try {
    const [h, m] = t.trim().split(':');
    const hi = parseInt(h, 10);
    const mi = parseInt(m, 10);
    return 0 <= hi && hi <= 23 && 0 <= mi && mi <= 59;
  } catch {
    return false;
  }
}

/** Hora en timeline debajo del nombre (24 h como en editor; barra usa minutos internos) */
export function formatShiftLine(entry: string, exit: string, shiftHours: number): string {
  return `${entry}  →  ${exit}   (${shiftHours.toFixed(1)} h)`;
}
