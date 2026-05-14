import type { Employee, BreakSlot, ScheduledEmployee } from './types';

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

function getDurations(shiftH: number): { s1: number; br: number | null; s2: number } | null {
  if (shiftH >= 7) return { s1: 15, br: 30, s2: 15 };
  if (shiftH >= 6) return { s1: 12, br: 20, s2: 12 };
  if (shiftH > 5)  return { s1: 10, br: null, s2: 10 };
  return null;
}

/**
 * Genera el horario de descansos en 3 fases globales (sin traslapes):
 *
 *   Fase 1 — Ley Silla 1 para TODOS los empleados (emp1 → empN)
 *   Fase 2 — Break        para todos con jornada >= 6 h (emp1 → empN)
 *   Fase 3 — Ley Silla 2  para TODOS los empleados (emp1 → empN)
 */
export function generateSchedule(employees: Employee[]): ScheduledEmployee[] {
  const sorted = [...employees].sort((a, b) => timeToMin(a.entry) - timeToMin(b.entry));
  const n = sorted.length;

  const breaksMap: BreakSlot[][]  = Array.from({ length: n }, () => []);
  const s1Ends:    number[]       = new Array(n).fill(0);
  const brEnds:    number[]       = new Array(n).fill(0);
  const hasBreak:  boolean[]      = new Array(n).fill(false);

  const exitMins  = sorted.map(e => timeToMin(e.exit));
  const entryMins = sorted.map(e => timeToMin(e.entry));
  const shifts    = sorted.map((_, i) => (exitMins[i] - entryMins[i]) / 60);
  const durs      = sorted.map((_, i) => getDurations(shifts[i]));

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
  for (let i = 0; i < n; i++) {
    const d = durs[i];
    if (!d || shifts[i] <= 0 || d.br === null) continue;
    const brLen = d.br!;
    const earliest = Math.max(s1Ends[i], busy);
    const latest = exitMins[i] - brLen;
    let bs: number;
    if (earliest > latest) {
      bs = earliest;
    } else {
      const mid = entryMins[i] + Math.floor((exitMins[i] - entryMins[i]) / 2);
      const ideal = mid - Math.floor(brLen / 2);
      bs = Math.max(earliest, Math.min(ideal, latest));
    }
    const be = bs + brLen;
    breaksMap[i].push({ type: 'break', start: bs, end: be, duration: brLen, conflict: be > exitMins[i] });
    busy = be;
    brEnds[i]  = be;
    hasBreak[i] = true;
  }

  // ── Fase 3: Ley Silla 2 ──────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const d = durs[i];
    if (!d || shifts[i] <= 0) continue;
    const prev = hasBreak[i] ? brEnds[i] : s1Ends[i];
    const s2s  = Math.max(prev, busy);
    const s2e  = s2s + d.s2;
    breaksMap[i].push({ type: 'silla2', start: s2s, end: s2e, duration: d.s2, conflict: s2e > exitMins[i] });
    busy = s2e;
  }

  return sorted.map((emp, i) => ({
    ...emp,
    breaks:      breaksMap[i],
    shiftHours:  shifts[i],
    hasConflict: breaksMap[i].some(b => b.conflict),
  }));
}
