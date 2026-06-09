import { useCallback, useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { generateSchedule, shiftBounds } from './algorithm';
import type { BreakSlot, BreakType, Employee, ScheduledEmployee } from './types';
import { BREAK_LABEL } from './types';
import {
  axisLabelMinToTime,
  formatShiftLine,
  formatSlotAmPm,
  timeStrAmPm,
  validTime,
} from './timeFormat';
import './App.css';

const INITIAL_EMPLOYEES: Employee[] = [];

const BREAK_COLORS: Record<BreakType, string> = {
  silla1: '#4a9eff',
  break:  '#3fa266',
  silla2: '#e09a30',
};

function slotByType(brks: BreakSlot[], btype: BreakType): BreakSlot | undefined {
  return brks.find(b => b.type === btype);
}

function escapeCsvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function buildCsv(scheduled: ScheduledEmployee[]): string {
  const BOM = '\uFEFF';
  const lines: string[] = [
    [
      'Empleado',
      'Entrada (24 h)',
      'Salida (24 h)',
      'Entrada (AM/PM)',
      'Salida (AM/PM)',
      'Ley Silla 1',
      'Break',
      'Ley Silla 2',
      'Horas',
    ].map(escapeCsvCell).join(','),
  ];

  for (const emp of scheduled) {
    const entAmpm = emp.entry ? timeStrAmPm(emp.entry) : '';
    const salAmpm = emp.exit ? timeStrAmPm(emp.exit) : '';
    if (!emp.breaks.length) {
      lines.push(
        [
          emp.name,
          emp.entry,
          emp.exit,
          entAmpm,
          salAmpm,
          '',
          '',
          '',
          emp.shiftHours.toFixed(1) + ' h',
        ].map(escapeCsvCell).join(','),
      );
      continue;
    }
    const s1 = slotByType(emp.breaks, 'silla1');
    const bk = slotByType(emp.breaks, 'break');
    const s2 = slotByType(emp.breaks, 'silla2');
    lines.push(
      [
        emp.name,
        emp.entry,
        emp.exit,
        entAmpm,
        salAmpm,
        formatSlotAmPm(s1),
        bk ? formatSlotAmPm(bk) : '—',
        formatSlotAmPm(s2),
        emp.shiftHours.toFixed(1) + ' h',
      ].map(escapeCsvCell).join(','),
    );
  }
  return BOM + lines.join('\r\n');
}

function downloadBlob(filename: string, mime: string, content: string | Blob) {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function timestampForFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

type TimelineProps = { scheduled: ScheduledEmployee[]; widthAvail: number };

function Timeline({ scheduled, widthAvail }: TimelineProps) {
  if (scheduled.length === 0) return null;

  const all = scheduled.flatMap(e => {
    const [em, xm] = shiftBounds(e.entry, e.exit);
    return [em, xm, ...e.breaks.flatMap(b => [b.start, b.end])];
  });
  const minT = Math.min(...all);
  const maxT = Math.max(...all);
  const range = Math.max(maxT - minT, 60);

  const LABEL_W = 150;
  const MARGIN = 20;
  const TL_W = Math.max(480, Math.min(widthAvail - LABEL_W - MARGIN * 2, 920));
  const dx = Math.max(MARGIN / 2, Math.floor((widthAvail - LABEL_W - TL_W) / 2));

  const ROW_H = 40;
  const ROW_GAP = 0;
  const AXIS_H = 34;
  const PAD_TOP = 12;

  const toX = (m: number) => dx + LABEL_W + ((m - minT) / range) * TL_W;
  const totalH = PAD_TOP + scheduled.length * ROW_H + AXIS_H;

  const tickStart = Math.ceil(minT / 60) * 60;
  const ticks: number[] = [];
  for (let t = tickStart; t <= maxT; t += 60) ticks.push(t);

  return (
    <div className="timeline-canvas-wrap">
      <svg
        width={dx + LABEL_W + TL_W + MARGIN}
        height={totalH}
        className="timeline-svg"
        style={{ display: 'block', minWidth: dx + LABEL_W + TL_W }}
      >
        {scheduled.map((_, i) => {
          const y = PAD_TOP + i * (ROW_H + ROW_GAP);
          const fill = i % 2 === 0 ? '#141414' : 'transparent';
          return (
            <rect
              key={i}
              x={dx + LABEL_W}
              y={y}
              width={TL_W}
              height={ROW_H}
              fill={fill}
            />
          );
        })}

        {ticks.map(t => (
          <line
            key={`v${t}`}
            x1={toX(t)}
            y1={PAD_TOP}
            x2={toX(t)}
            y2={PAD_TOP + scheduled.length * ROW_H}
            stroke="#2a2a2a"
            strokeWidth={1}
          />
        ))}

        {ticks.map(t => (
          <g key={`a${t}`}>
            <line
              x1={toX(t)}
              y1={PAD_TOP + scheduled.length * ROW_H}
              x2={toX(t)}
              y2={PAD_TOP + scheduled.length * ROW_H + 6}
              stroke="#555555"
              strokeWidth={1}
            />
            <text
              x={toX(t)}
              y={PAD_TOP + scheduled.length * ROW_H + 22}
              textAnchor="middle"
              fontSize={10}
              fontFamily="Segoe UI, var(--font-sans)"
              fill="rgba(255,255,255,0.53)"
            >
              {axisLabelMinToTime(t)}
            </text>
          </g>
        ))}

        <line
          x1={dx + LABEL_W}
          y1={PAD_TOP + scheduled.length * ROW_H}
          x2={dx + LABEL_W + TL_W}
          y2={PAD_TOP + scheduled.length * ROW_H}
          stroke="#3a3a3a"
          strokeWidth={1}
        />

        {scheduled.map((emp, i) => {
          const y = PAD_TOP + i * (ROW_H + ROW_GAP);
          const cy = y + ROW_H / 2;
          const lbl = emp.name.length > 20 ? emp.name.slice(0, 19) + '…' : emp.name;
          const [emPx, xmPx] = shiftBounds(emp.entry, emp.exit);
          const ex = toX(emPx);
          const sx = toX(xmPx);

          return (
            <g key={emp.id}>
              <text
                x={dx + LABEL_W - 8}
                y={cy + 4}
                textAnchor="end"
                fontSize={12}
                fontFamily="var(--font-sans)"
                fontWeight={400}
                fill={emp.hasConflict ? '#e0505a' : 'rgba(255,255,255,0.91)'}
              >
                {lbl}
              </text>
              {emp.offset !== 0 && (
                <text
                  x={dx + LABEL_W - 8}
                  y={cy + 16}
                  textAnchor="end"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill="#e09a30"
                >
                  {emp.offset > 0 ? `+${emp.offset}` : emp.offset}m
                </text>
              )}
              <rect
                x={ex}
                y={y + ROW_H * 0.36}
                width={Math.max(sx - ex, 2)}
                height={ROW_H * 0.28}
                fill="#282828"
              />
              {emp.breaks.map((brk, j) => {
                const x1 = toX(brk.start);
                const x2 = Math.max(toX(brk.end), x1 + 4);
                const col = brk.conflict ? '#e0505a' : BREAK_COLORS[brk.type];
                return (
                  <g key={j}>
                    <rect
                      x={x1}
                      y={y + 4}
                      width={x2 - x1}
                      height={ROW_H - 8}
                      fill={col}
                    />
                    {brk.conflict && (
                      <rect
                        x={x1}
                        y={y + 4}
                        width={x2 - x1}
                        height={ROW_H - 8}
                        fill="none"
                        stroke="#e0505a"
                        strokeWidth={2}
                      />
                    )}
                    {x2 - x1 > 32 && (
                      <text
                        x={(x1 + x2) / 2}
                        y={cy + 4}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={700}
                        fontFamily="var(--font-sans)"
                        fill="#050505"
                      >
                        {brk.duration}m
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function App() {
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [newName, setNewName] = useState('');
  const [newEntry, setNewEntry] = useState('08:00');
  const [newExit, setNewExit] = useState('16:00');
  const [fieldErr, setFieldErr] = useState<'name' | 'entry' | 'exit' | null>(null);

  const timelineHostRef = useRef<HTMLDivElement>(null);
  const [timelineInnerW, setTimelineInnerW] = useState(900);
  const captureWideRef = useRef<HTMLDivElement>(null);
  const captureTableRef = useRef<HTMLDivElement>(null);

  const scheduled = generateSchedule(employees);
  const conflicts = scheduled.filter(e => e.hasConflict);
  const withBreaks = scheduled.filter(e => e.breaks.length > 0).length;
  const totalBreakMin = scheduled.reduce(
    (s, e) => s + e.breaks.reduce((a, b) => a + b.duration, 0),
    0,
  );

  const schedById = useCallback(
    (id: string) => scheduled.find(s => s.id === id),
    [scheduled],
  );

  useEffect(() => {
    const el = timelineHostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setTimelineInnerW(Math.max(w, 400));
    });
    ro.observe(el);
    setTimelineInnerW(Math.max(el.clientWidth, 400));
    return () => ro.disconnect();
  }, []);

  const addEmployee = () => {
    const name = newName.trim();
    const entry = newEntry.trim();
    const exit = newExit.trim();

    let err: 'name' | 'entry' | 'exit' | null = null;
    if (!name) err = 'name';
    else if (!validTime(entry)) err = 'entry';
    else if (!validTime(exit)) err = 'exit';
    else if (shiftBounds(entry, exit)[2] <= 0) {
      err = 'exit';
    }
    setFieldErr(err);
    if (err) return;

    setEmployees(prev => [
      ...prev,
      { id: String(Date.now()), name, entry, exit, offset: 0 },
    ]);
    setNewName('');
    setNewEntry('08:00');
    setNewExit('16:00');
    setFieldErr(null);
  };

  const removeEmployee = (id: string) =>
    setEmployees(prev => prev.filter(e => e.id !== id));

  const nudgeOffset = (id: string, delta: number) =>
    setEmployees(prev =>
      prev.map(e =>
        e.id === id
          ? { ...e, offset: Math.max(-60, Math.min(120, e.offset + delta)) }
          : e,
      ),
    );

  const exportCsv = () => {
    downloadBlob(`horarios_${timestampForFile()}.csv`, 'text/csv;charset=utf-8', buildCsv(scheduled));
  };

  const pngOpts = {
    pixelRatio: 2,
    cacheBust: true,
    filter: (node: Element) => !node.classList?.contains('no-screenshot'),
  } as const;

  const exportPng = async (node: HTMLElement | null, baseName: string) => {
    if (!node || !scheduled.length) {
      window.alert('Añade empleados con horario antes de exportar la imagen.');
      return;
    }
    try {
      const dataUrl = await toPng(node, { ...pngOpts });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      downloadBlob(`${baseName}_${timestampForFile()}.png`, blob.type, blob);
    } catch (e) {
      console.error(e);
      window.alert('No se pudo generar la imagen. Prueba otra vez o usa Imprimir.');
    }
  };

  const handlePrint = () => window.print();

  type TRow = { zebra: boolean; conflict: boolean; cells: string[] };
  const tableRows: TRow[] = [];
  scheduled.forEach((emp, rowIdx) => {
    let nombre = emp.name;
    if (emp.offset !== 0) {
      const sgn = emp.offset > 0 ? '+' : '';
      nombre = `${emp.name} (${sgn}${emp.offset}m)`;
    }
    const ent = emp.entry ? timeStrAmPm(emp.entry) : '—';
    const sal = emp.exit ? timeStrAmPm(emp.exit) : '—';

    if (!emp.breaks.length) {
      tableRows.push({
        zebra: rowIdx % 2 === 1,
        conflict: emp.hasConflict,
        cells: [nombre, ent, sal, '—', '—', '—', emp.shiftHours.toFixed(1) + ' h'],
      });
      return;
    }
    const s1 = slotByType(emp.breaks, 'silla1');
    const bk = slotByType(emp.breaks, 'break');
    const s2 = slotByType(emp.breaks, 'silla2');
    tableRows.push({
      zebra: rowIdx % 2 === 1,
      conflict: emp.hasConflict,
      cells: [
        nombre,
        ent,
        sal,
        formatSlotAmPm(s1),
        bk ? formatSlotAmPm(bk) : '—',
        formatSlotAmPm(s2),
        emp.shiftHours.toFixed(1) + ' h',
      ],
    });
  });

  const TABLE_HEADERS = [
    'Empleado',
    'Entrada',
    'Salida',
    'Ley Silla 1',
    'Break',
    'Ley Silla 2',
    'Horas',
  ] as const;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <span className="header-logo">HR</span>
          <div className="header-titles">
            <h1 className="header-title">Generador de Horarios de Descanso</h1>
            <p className="header-sub">
              Algoritmo de no-traslape &nbsp;|&nbsp; Priority Queue &nbsp;|&nbsp; Detección de conflictos
            </p>
          </div>
        </div>
        <div className="header-stats no-screenshot">
          <div className="stat-box">
            <span className="stat-box-val">{employees.length}</span>
            <span className="stat-box-lbl">Empleados</span>
          </div>
          <div className="stat-box">
            <span className="stat-box-val stat-box-val--green">{withBreaks}</span>
            <span className="stat-box-lbl">Con descansos</span>
          </div>
          <div className="stat-box">
            <span
              className={`stat-box-val ${conflicts.length ? 'stat-box-val--red' : ''}`}
            >
              {conflicts.length}
            </span>
            <span className="stat-box-lbl">Conflictos</span>
          </div>
          <div className="stat-box">
            <span className="stat-box-val">{totalBreakMin}</span>
            <span className="stat-box-lbl">Min. asignados</span>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="left-panel no-screenshot">
          <div className="left-form">
            <p className="left-section-label">NUEVO EMPLEADO</p>
            <input
              className={`left-inp ${fieldErr === 'name' ? 'left-inp--err' : ''}`}
              placeholder="Nombre completo"
              value={newName}
              onChange={e => {
                setNewName(e.target.value);
                setFieldErr(null);
              }}
              onKeyDown={e => e.key === 'Enter' && addEmployee()}
            />
            <input
              className={`left-inp mono ${fieldErr === 'entry' ? 'left-inp--err' : ''}`}
              placeholder="Entrada  (08:00)"
              value={newEntry}
              onChange={e => {
                setNewEntry(e.target.value);
                setFieldErr(null);
              }}
              onKeyDown={e => e.key === 'Enter' && addEmployee()}
            />
            <input
              className={`left-inp mono ${fieldErr === 'exit' ? 'left-inp--err' : ''}`}
              placeholder="Salida   (16:00)"
              value={newExit}
              onChange={e => {
                setNewExit(e.target.value);
                setFieldErr(null);
              }}
              onKeyDown={e => e.key === 'Enter' && addEmployee()}
            />
            <button type="button" className="btn-add-emp" onClick={addEmployee}>
              + Agregar empleado
            </button>
          </div>
          <div className="left-divider" />
          <div className="left-list-head">
            <span className="left-section-label left-section-label--inline">EMPLEADOS</span>
            <span className="left-count">{employees.length}</span>
          </div>
          <div className="left-list-scroll">
            {employees.map(emp => {
              const s = schedById(emp.id);
              const conflict = s?.hasConflict ?? false;
              return (
                <div
                  key={emp.id}
                  className={`emp-card ${conflict ? 'emp-card--conflict' : ''}`}
                >
                  <div className="emp-card-row0">
                    <span className={`emp-name ${conflict ? 'emp-name--conflict' : ''}`}>
                      {emp.name.length > 22 ? emp.name.slice(0, 21) + '…' : emp.name}
                    </span>
                    <button
                      type="button"
                      className="emp-remove"
                      title="Eliminar"
                      onClick={() => removeEmployee(emp.id)}
                    >
                      X
                    </button>
                  </div>
                  <div className="emp-shift mono">
                    {formatShiftLine(
                      emp.entry,
                      emp.exit,
                      shiftBounds(emp.entry, emp.exit)[2],
                    )}
                  </div>
                  <div className="emp-offset-row">
                    <span className="emp-offset-lbl">Offset:</span>
                    <button type="button" className="emp-off-btn" onClick={() => nudgeOffset(emp.id, -5)}>
                      −
                    </button>
                    <span
                      className={`emp-off-val mono ${emp.offset !== 0 ? 'emp-off-val--amber' : ''}`}
                    >
                      {emp.offset > 0 ? '+' : ''}{emp.offset} m
                    </span>
                    <button type="button" className="emp-off-btn" onClick={() => nudgeOffset(emp.id, 5)}>
                      +
                    </button>
                  </div>
                  {s?.breaks.map((brk, bi) => (
                    <div
                      key={bi}
                      className="emp-brk-preview mono"
                      style={{ color: brk.conflict ? '#e0505a' : BREAK_COLORS[brk.type] }}
                    >
                      &nbsp;&nbsp;{BREAK_LABEL[brk.type]} {formatSlotAmPm(brk)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>

        <main className="right-panel">
          {conflicts.length > 0 && (
            <div className="alert-bar">
              <strong>Descanso fuera de turno:</strong>{' '}
              {conflicts.map(e => e.name).join(', ')}
              {'  ·  '}Ajusta el offset desde la lista
            </div>
          )}

          <div ref={captureWideRef} className="capture-wide">
            <div className="schedule-block-head">
              <h2 className="block-title">Horario Generado</h2>
              <div className="export-btns">
                <button type="button" className="btn-exp btn-exp--muted" onClick={exportCsv}>
                  Exportar CSV
                </button>
                <button
                  type="button"
                  className="btn-exp btn-exp--blue"
                  onClick={() => exportPng(captureWideRef.current, 'horarios_pc')}
                >
                  Imagen PC / HD
                </button>
                <button
                  type="button"
                  className="btn-exp btn-exp--green"
                  onClick={() => exportPng(captureTableRef.current, 'horarios_tabla_movil')}
                >
                  Tabla · teléfono
                </button>
                <button
                  type="button"
                  className="btn-exp btn-exp--wa"
                  onClick={() => exportPng(captureWideRef.current, 'horarios_whatsapp')}
                >
                  Imagen WhatsApp
                </button>
              </div>
            </div>

            <div ref={captureTableRef} className="table-outer">
              <div className="table-accent-top" />
              <div className="table-head-grid">
                {TABLE_HEADERS.map((h, i) => (
                  <div key={h} className={`th-cell th-c${i}`}>
                    {h}
                  </div>
                ))}
              </div>
              <div className="table-accent-bot" />
              <div className="table-body-scroll">
                {tableRows.map((row, ri) => (
                  <div key={ri} className="gui-table-row">
                    {row.cells.map((cell, ci) => {
                      const est = ci === 6 && row.conflict ? 'est-bad' : '';
                      return (
                        <div
                          key={ci}
                          className={[
                            'gui-td',
                            `col-${ci}`,
                            row.zebra ? 'zebra-alt' : '',
                            row.conflict ? 'row-conflict' : '',
                            est,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {cell}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="timeline-block-head">
              <h2 className="block-title">Timeline de Descansos</h2>
              <div className="timeline-legend">
                {(['silla1', 'break', 'silla2'] as BreakType[]).map(t => (
                  <div key={t} className="tl-leg-item">
                    <span className="tl-dot" style={{ background: BREAK_COLORS[t] }} />
                    <span>{BREAK_LABEL[t]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div ref={timelineHostRef} className="timeline-host">
              <Timeline scheduled={scheduled} widthAvail={timelineInnerW} />
            </div>
          </div>

          <div className="print-footer no-screenshot">
            <button type="button" className="btn-print-bottom" onClick={handlePrint}>
              Imprimir / PDF
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
