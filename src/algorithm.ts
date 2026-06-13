import type { Employee, BreakSlot, BreakType, ScheduledEmployee, ScheduleMode } from './types';
import { normalizeArea } from './areas';

export function timeToMin(t: string): number {
  const [h = '0', m = '0'] = t.split(':');
  return parseInt(h) * 60 + parseInt(m);
}

export function minToTime(m: number): string {
  const total = ((m % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Normaliza turnos que cruzan medianoche. Si xm == em, sh = 0 (jornada inválida). */
export function shiftBounds(entry: string, exit: string): [number, number, number] {
  const em = timeToMin(entry);
  let xm = timeToMin(exit);
  if (xm < em) xm += 1440;
  return [em, xm, (xm - em) / 60];
}

/** Snappea un valor al múltiplo de `step` más cercano. */
export function snapToGrid(min: number, step = 5): number {
  return Math.round(min / step) * step;
}

/** Ventana legal de inicio para un break de tipo `type` dado un empleado. */
export function getLegalWindow(
  em: number, xm: number, type: BreakType,
  s1End: number, brEnd: number, duration: number,
): { earliest: number; latest: number } {
  switch (type) {
    case 'silla1': return { earliest: em + 75,  latest: xm - duration };
    case 'break':  return { earliest: s1End,    latest: xm - duration };
    case 'silla2': return { earliest: brEnd > s1End ? brEnd : s1End, latest: xm - duration };
  }
}

function getDurations(shiftH: number): { s1: number; br: number | null; s2: number } | null {
  if (shiftH >= 7) return { s1: 15, br: 30, s2: 15 };
  if (shiftH >= 6) return { s1: 12, br: 20, s2: 12 };
  if (shiftH > 5)  return { s1: 10, br: null, s2: 10 };
  return null;
}

/**
 * Slot libre más cercano a `preferred`.
 * forwardFirst=true : busca hacia adelante primero (breaks, el 2° emp queda después).
 * forwardFirst=false: busca hacia atrás primero (Silla2, el 2° emp queda antes).
 */
function findSlot(
  earliest: number, latest: number, preferred: number,
  duration: number, occupied: [number, number][],
  forwardFirst = false,
): number | null {
  const isFree = (s: number) => {
    const e = s + duration;
    return occupied.every(([os, oe]) => e <= os || s >= oe);
  };
  if (forwardFirst) {
    for (let s = preferred; s <= latest; s += 5) {
      if (isFree(s)) return s;
    }
    for (let s = preferred - 5; s >= earliest; s -= 5) {
      if (isFree(s)) return s;
    }
  } else {
    for (let s = preferred; s >= earliest; s -= 5) {
      if (isFree(s)) return s;
    }
    for (let s = preferred + 5; s <= latest; s += 5) {
      if (isFree(s)) return s;
    }
  }
  return null;
}

/**
 * Genera el horario de descansos en 3 fases globales:
 *
 *   Fase 1 — Ley Silla 1 para TODOS los empleados (emp1 → empN)
 *   Fase 2 — Break        para todos con jornada >= 6 h (emp1 → empN)
 *   Fase 3 — Ley Silla 2  por ventana legal ~75 min antes de salida, sin cola global
 */
export function generateSchedule(employees: Employee[]): ScheduledEmployee[] {
  const sorted = [...employees].sort((a, b) => timeToMin(a.entry) - timeToMin(b.entry));
  const n = sorted.length;

  const breaksMap: BreakSlot[][]  = Array.from({ length: n }, () => []);
  const s1Ends:    number[]       = new Array(n).fill(0);
  const brEnds:    number[]       = new Array(n).fill(0);
  const hasBreak:  boolean[]      = new Array(n).fill(false);

  const bounds     = sorted.map(e => shiftBounds(e.entry, e.exit));
  const entryMins  = bounds.map(b => b[0]);
  const exitMins   = bounds.map(b => b[1]);
  const shifts     = bounds.map(b => b[2]);
  const durs       = sorted.map((_, i) => getDurations(shifts[i]));

  let busy = 0;

  // ── Fase 1: Ley Silla 1 ──────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const d = durs[i];
    if (!d || shifts[i] <= 0) continue;
    const s1s = Math.max(entryMins[i] + 75 + (sorted[i].offset ?? 0), busy);
    const s1e = s1s + d.s1;
    breaksMap[i].push({ type: 'silla1', start: s1s, end: s1e, duration: d.s1, conflict: s1e > exitMins[i] });
    busy = s1e;
    s1Ends[i] = s1e;
  }

  // ── Fase 2: Break (solo jornadas >= 6 h) ──────────────────────────────────
  const silla1OccPh2 = new Map<number, [number, number]>();
  for (let k = 0; k < n; k++) {
    const s1 = breaksMap[k].find(b => b.type === 'silla1');
    if (s1) silla1OccPh2.set(k, [s1.start, s1.end]);
  }

  const brAssigned: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const d = durs[i];
    if (!d || shifts[i] <= 0 || d.br === null) continue;
    const brLen = d.br!;
    const occupied: [number, number][] = [...brAssigned];
    silla1OccPh2.forEach(([s1s, s1e], k) => {
      if (entryMins[k] <= entryMins[i]) occupied.push([s1s, s1e]);
    });
    const earliest  = s1Ends[i];
    const latest    = exitMins[i] - brLen;
    const mid       = entryMins[i] + Math.floor((exitMins[i] - entryMins[i]) / 2);
    const ideal     = mid - Math.floor(brLen / 2);
    const preferred = Math.max(earliest, Math.min(ideal, latest));
    const slot = findSlot(earliest, latest, preferred, brLen, occupied, true);
    const bs = slot !== null ? slot : earliest;
    const be = bs + brLen;
    breaksMap[i].push({ type: 'break', start: bs, end: be, duration: brLen, conflict: be > exitMins[i] });
    brEnds[i]   = be;
    hasBreak[i] = true;
    brAssigned.push([bs, be]);
  }

  // ── Fase 3: Ley Silla 2 (objetivo: ~75 min antes de salida) ──────────────
  const silla1Occ: [number, number][] = breaksMap
    .flatMap(lst => lst)
    .filter(b => b.type === 'silla1')
    .map(b => [b.start, b.end] as [number, number]);

  const breakOccByIdx = new Map<number, [number, number]>();
  for (let k = 0; k < n; k++) {
    const brk = breaksMap[k].find(b => b.type === 'break');
    if (brk) breakOccByIdx.set(k, [brk.start, brk.end]);
  }

  const s2Assigned: [number, number][] = [];
  const phase3Order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (exitMins[a] - 75) - (exitMins[b] - 75) || b - a,
  );
  for (const i of phase3Order) {
    const d = durs[i];
    if (!d || shifts[i] <= 0) continue;
    const occupied: [number, number][] = [...silla1Occ, ...s2Assigned];
    for (const [k, brkInterval] of breakOccByIdx) {
      if (entryMins[k] <= entryMins[i]) {
        occupied.push(brkInterval);
      }
    }
    const prev      = hasBreak[i] ? brEnds[i] : s1Ends[i];
    const earliest  = prev;
    const latest    = exitMins[i] - d.s2;
    const ideal     = exitMins[i] - 75;
    const preferred = Math.max(earliest, Math.min(ideal, latest));
    const slot      = findSlot(earliest, latest, preferred, d.s2, occupied);
    let s2s: number;
    let conflict: boolean;
    if (slot === null) {
      s2s      = earliest;
      conflict = true;
    } else {
      s2s      = slot;
      conflict = s2s + d.s2 > exitMins[i];
    }
    const s2e = s2s + d.s2;
    breaksMap[i].push({ type: 'silla2', start: s2s, end: s2e, duration: d.s2, conflict });
    s2Assigned.push([s2s, s2e]);
  }

  return sorted.map((emp, i) => ({
    ...emp,
    breaks:      breaksMap[i],
    shiftHours:  shifts[i],
    hasConflict: breaksMap[i].some(b => b.conflict),
  }));
}

/**
 * Aplica los overrides manuales de posición a una lista ya calculada.
 */
function applyOverrides(base: ScheduledEmployee[]): ScheduledEmployee[] {
  return base.map(emp => {
    const overrides = emp.breakOverrides;
    if (!overrides || Object.keys(overrides).length === 0) return emp;

    const [, exitMin] = shiftBounds(emp.entry, emp.exit);

    const breaks = emp.breaks.map(brk => {
      const overrideStart = overrides[brk.type];
      if (overrideStart === undefined) return brk;

      const newEnd = overrideStart + brk.duration;
      return {
        ...brk,
        start: overrideStart,
        end:   newEnd,
        conflict: newEnd > exitMin,
        isOverride: true,
      };
    });

    return {
      ...emp,
      breaks,
      hasConflict: breaks.some(b => b.conflict),
    };
  });
}

/**
 * Genera el horario base con `generateSchedule` y luego aplica los overrides manuales
 * de posición de break que cada empleado pueda tener en `breakOverrides`.
 */
export function applyScheduleWithOverrides(employees: Employee[]): ScheduledEmployee[] {
  return applyOverrides(generateSchedule(employees));
}

/**
 * Agrupa empleados por área y corre `generateSchedule` por grupo.
 * Los descansos solo compiten dentro de la misma área; entre áreas se pueden cruzar.
 */
export function generateMassSchedule(employees: Employee[]): ScheduledEmployee[] {
  const groups = new Map<string, Employee[]>();
  for (const emp of employees) {
    const key = normalizeArea(emp.area);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(emp);
  }

  const all: ScheduledEmployee[] = [];
  for (const group of groups.values()) {
    all.push(...generateSchedule(group));
  }

  return all.sort((a, b) =>
    (a.area ?? '').localeCompare(b.area ?? '') ||
    timeToMin(a.entry) - timeToMin(b.entry) ||
    a.name.localeCompare(b.name),
  );
}

/**
 * Versión masiva con overrides aplicados.
 */
export function applyScheduleWithOverridesMass(employees: Employee[]): ScheduledEmployee[] {
  return applyOverrides(generateMassSchedule(employees));
}

/**
 * Punto de entrada unificado según el modo.
 */
export function applySchedule(
  employees: Employee[],
  mode: ScheduleMode,
): ScheduledEmployee[] {
  return mode === 'mass'
    ? applyScheduleWithOverridesMass(employees)
    : applyScheduleWithOverrides(employees);
}
