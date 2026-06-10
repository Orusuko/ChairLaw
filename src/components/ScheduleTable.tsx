import { forwardRef } from 'react';
import type { BreakType, ScheduledEmployee } from '../types';
import { BREAK_COLORS, BREAK_LABEL } from '../types';
import { formatSlotAmPm, timeStrAmPm } from '../timeFormat';

const TABLE_HEADERS = [
  'Empleado', 'Entrada', 'Salida', 'Ley Silla 1', 'Break', 'Ley Silla 2', 'Horas',
] as const;

function slotByType(brks: ScheduledEmployee['breaks'], t: BreakType) {
  return brks.find(b => b.type === t);
}

interface Props {
  scheduled: ScheduledEmployee[];
}

export const ScheduleTable = forwardRef<HTMLDivElement, Props>(({ scheduled }, ref) => {
  type TRow = { zebra: boolean; conflict: boolean; cells: string[] };

  const tableRows: TRow[] = [];
  scheduled.forEach((emp, rowIdx) => {
    let nombre = emp.name;
    if (emp.offset !== 0) {
      nombre = `${emp.name} (${emp.offset > 0 ? '+' : ''}${emp.offset}m)`;
    }
    const ent = emp.entry ? timeStrAmPm(emp.entry) : '—';
    const sal = emp.exit  ? timeStrAmPm(emp.exit)  : '—';

    if (!emp.breaks.length) {
      tableRows.push({ zebra: rowIdx % 2 === 1, conflict: emp.hasConflict,
        cells: [nombre, ent, sal, '—', '—', '—', emp.shiftHours.toFixed(1) + ' h'] });
      return;
    }
    const s1 = slotByType(emp.breaks, 'silla1');
    const bk = slotByType(emp.breaks, 'break');
    const s2 = slotByType(emp.breaks, 'silla2');
    tableRows.push({
      zebra: rowIdx % 2 === 1,
      conflict: emp.hasConflict,
      cells: [nombre, ent, sal, formatSlotAmPm(s1), bk ? formatSlotAmPm(bk) : '—', formatSlotAmPm(s2), emp.shiftHours.toFixed(1) + ' h'],
    });
  });

  return (
    <>
      {/* ── Desktop table ── */}
      <div ref={ref} className="table-outer" role="region" aria-label="Tabla de horarios">
        <div className="table-accent-top" />
        <div className="table-head-grid" role="row">
          {TABLE_HEADERS.map((h, i) => (
            <div key={h} className={`th-cell th-c${i}`} role="columnheader">{h}</div>
          ))}
        </div>
        <div className="table-accent-bot" />
        <div className="table-body-scroll" role="rowgroup">
          {tableRows.map((row, ri) => (
            <div key={ri} className="gui-table-row" role="row">
              {row.cells.map((cell, ci) => {
                const est = ci === 6 && row.conflict ? 'est-bad' : '';
                return (
                  <div
                    key={ci}
                    role="cell"
                    className={['gui-td', `col-${ci}`, row.zebra ? 'zebra-alt' : '', row.conflict ? 'row-conflict' : '', est].filter(Boolean).join(' ')}
                  >
                    {cell}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile cards (visible only < 640 px via CSS) ── */}
      <div className="schedule-cards" role="list" aria-label="Horarios (vista móvil)">
        {scheduled.map(emp => {
          const s1 = slotByType(emp.breaks, 'silla1');
          const bk = slotByType(emp.breaks, 'break');
          const s2 = slotByType(emp.breaks, 'silla2');
          return (
            <div
              key={emp.id}
              className={`sc-card${emp.hasConflict ? ' sc-card--conflict' : ''}`}
              role="listitem"
            >
              <div className="sc-card-head">
                <span className="sc-card-name">{emp.name}</span>
                <span className="sc-card-hours">{emp.shiftHours.toFixed(1)} h</span>
              </div>
              <div className="sc-card-times mono">
                {timeStrAmPm(emp.entry)} → {timeStrAmPm(emp.exit)}
              </div>
              {emp.breaks.length > 0 && (
                <div className="sc-card-breaks">
                  {s1 && <div className="sc-break" style={{ borderLeftColor: BREAK_COLORS.silla1 }}>
                    <span className="sc-break-lbl">{BREAK_LABEL.silla1}</span>
                    <span className="sc-break-time mono">{formatSlotAmPm(s1)}</span>
                  </div>}
                  {bk && <div className="sc-break" style={{ borderLeftColor: BREAK_COLORS.break }}>
                    <span className="sc-break-lbl">{BREAK_LABEL.break}</span>
                    <span className="sc-break-time mono">{formatSlotAmPm(bk)}</span>
                  </div>}
                  {s2 && <div className="sc-break" style={{ borderLeftColor: BREAK_COLORS.silla2 }}>
                    <span className="sc-break-lbl">{BREAK_LABEL.silla2}</span>
                    <span className="sc-break-time mono">{formatSlotAmPm(s2)}</span>
                  </div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
});

ScheduleTable.displayName = 'ScheduleTable';
