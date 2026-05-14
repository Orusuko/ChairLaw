import { useState, useRef, useCallback } from 'react';
import { generateSchedule, timeToMin, minToTime } from './algorithm';
import type { Employee, BreakType, ScheduledEmployee } from './types';
import { BREAK_LABEL } from './types';

// ─── Datos iniciales ──────────────────────────────────────────────────────────

const INITIAL_EMPLOYEES: Employee[] = [];

const BREAK_COLORS: Record<BreakType, string> = {
  silla1: 'var(--color-blue)',
  break:  'var(--color-green)',
  silla2: 'var(--color-amber)',
};

// ─── Timeline SVG ─────────────────────────────────────────────────────────────

function Timeline({ scheduled }: { scheduled: ScheduledEmployee[] }) {
  if (scheduled.length === 0) return null;

  const all = scheduled.flatMap(e => [
    timeToMin(e.entry),
    timeToMin(e.exit),
    ...e.breaks.flatMap(b => [b.start, b.end]),
  ]);
  const minT  = Math.min(...all);
  const maxT  = Math.max(...all);
  const range = Math.max(maxT - minT, 60);

  const ROW_H    = 34;
  const ROW_GAP  = 6;
  const LABEL_W  = 140;
  const TL_W     = 680;
  const AXIS_H   = 28;
  const PAD_TOP  = 4;

  const toX = (m: number) => LABEL_W + ((m - minT) / range) * TL_W;
  const totalH = PAD_TOP + scheduled.length * (ROW_H + ROW_GAP) + AXIS_H;

  const tickStart = Math.ceil(minT / 60) * 60;
  const ticks: number[] = [];
  for (let t = tickStart; t <= maxT; t += 60) ticks.push(t);

  const halfTicks: number[] = [];
  for (let t = tickStart - 30; t <= maxT; t += 60) {
    if (t > minT && t < maxT) halfTicks.push(t);
  }

  return (
    <div className="timeline-scroll">
      <svg
        width={LABEL_W + TL_W + 8}
        height={totalH}
        style={{ display: 'block', minWidth: 560 }}
      >
        {/* Fondo de filas alternadas */}
        {scheduled.map((_, i) => (
          <rect
            key={i}
            x={LABEL_W}
            y={PAD_TOP + i * (ROW_H + ROW_GAP)}
            width={TL_W}
            height={ROW_H}
            fill={i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}
          />
        ))}

        {/* Líneas de media hora (sutiles) */}
        {halfTicks.map(t => (
          <line
            key={`h${t}`}
            x1={toX(t)} y1={PAD_TOP}
            x2={toX(t)} y2={totalH - AXIS_H}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
        ))}

        {/* Líneas de hora completa */}
        {ticks.map(t => (
          <line
            key={`t${t}`}
            x1={toX(t)} y1={PAD_TOP}
            x2={toX(t)} y2={totalH - AXIS_H}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}

        {/* Eje inferior */}
        <line
          x1={LABEL_W} y1={totalH - AXIS_H}
          x2={LABEL_W + TL_W} y2={totalH - AXIS_H}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
        />

        {/* Etiquetas del eje */}
        {ticks.map(t => (
          <g key={`label${t}`}>
            <line
              x1={toX(t)} y1={totalH - AXIS_H}
              x2={toX(t)} y2={totalH - AXIS_H + 5}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={1}
            />
            <text
              x={toX(t)} y={totalH - 7}
              textAnchor="middle"
              fontSize={10}
              fontFamily="var(--font-mono)"
              fill="rgba(255,255,255,0.38)"
            >
              {minToTime(t)}
            </text>
          </g>
        ))}

        {/* Filas de empleados */}
        {scheduled.map((emp, i) => {
          const y       = PAD_TOP + i * (ROW_H + ROW_GAP);
          const entryX  = toX(timeToMin(emp.entry));
          const exitX   = toX(timeToMin(emp.exit));
          const label   = emp.name.length > 18 ? emp.name.slice(0, 17) + '…' : emp.name;
          const cy      = y + ROW_H / 2;

          return (
            <g key={emp.id}>
              {/* Nombre */}
              <text
                x={LABEL_W - 10}
                y={cy + 4}
                textAnchor="end"
                fontSize={11.5}
                fontFamily="var(--font-sans)"
                fontWeight={emp.hasConflict ? '600' : '400'}
                fill={emp.hasConflict ? 'var(--color-red)' : 'rgba(255,255,255,0.78)'}
              >
                {label}
              </text>

              {/* Barra de turno */}
              <rect
                x={entryX} y={y + 10}
                width={exitX - entryX} height={ROW_H - 20}
                fill="rgba(255,255,255,0.06)"
                rx={3}
              />

              {/* Offset badge si existe */}
              {emp.offset !== 0 && (
                <text
                  x={LABEL_W - 10}
                  y={cy + 15}
                  textAnchor="end"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill="var(--color-amber)"
                >
                  {emp.offset > 0 ? `+${emp.offset}m` : `${emp.offset}m`}
                </text>
              )}

              {/* Bloques de descanso */}
              {emp.breaks.map((brk, j) => {
                const bx = toX(brk.start);
                const bw = Math.max(toX(brk.end) - bx, 3);
                const by = y + 4;
                const bh = ROW_H - 8;

                return (
                  <g key={j}>
                    <rect
                      x={bx} y={by}
                      width={bw} height={bh}
                      fill={brk.conflict ? 'var(--color-red)' : BREAK_COLORS[brk.type]}
                      opacity={brk.conflict ? 0.9 : 0.78}
                      rx={3}
                    />
                    {bw > 22 && (
                      <text
                        x={bx + bw / 2} y={by + bh / 2 + 4}
                        textAnchor="middle"
                        fontSize={9}
                        fontFamily="var(--font-sans)"
                        fontWeight="500"
                        fill="rgba(0,0,0,0.72)"
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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function App() {
  const [employees, setEmployees]   = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [view, setView]             = useState<'table' | 'timeline'>('timeline');
  const [editorOpen, setEditorOpen] = useState(true);
  const [newName, setNewName]       = useState('');
  const [newEntry, setNewEntry]     = useState('08:00');
  const [newExit, setNewExit]       = useState('16:00');
  const printRef = useRef<HTMLDivElement>(null);

  const scheduled   = generateSchedule(employees);
  const conflicts   = scheduled.filter(e => e.hasConflict);
  const totalBreak  = scheduled.reduce((s, e) => s + e.breaks.reduce((a, b) => a + b.duration, 0), 0);
  const withBreaks  = scheduled.filter(e => e.breaks.length > 0).length;

  const addEmployee = () => {
    if (!newName.trim()) return;
    setEmployees(prev => [
      ...prev,
      { id: String(Date.now()), name: newName.trim(), entry: newEntry, exit: newExit, offset: 0 },
    ]);
    setNewName('');
    setNewEntry('08:00');
    setNewExit('16:00');
  };

  const removeEmployee = (id: string) =>
    setEmployees(prev => prev.filter(e => e.id !== id));

  const updateField = useCallback(
    (id: string, field: keyof Employee, value: string | number) =>
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e)),
    [],
  );

  const nudgeOffset = (id: string, delta: number) =>
    setEmployees(prev => prev.map(e =>
      e.id === id
        ? { ...e, offset: Math.max(-60, Math.min(120, e.offset + delta)) }
        : e,
    ));

  const handlePrint = () => window.print();

  // Construir filas de la tabla
  type TableRow = { cells: string[]; conflict: boolean; isFirst: boolean };
  const rows: TableRow[] = [];
  for (const emp of scheduled) {
    if (emp.breaks.length === 0) {
      rows.push({ cells: [emp.name, emp.entry, emp.exit, 'Sin descanso', '—', '—', '—', '—'], conflict: false, isFirst: true });
    } else {
      emp.breaks.forEach((brk, i) => {
        rows.push({
          cells: [
            i === 0 ? emp.name : '',
            i === 0 ? emp.entry : '',
            i === 0 ? emp.exit : '',
            BREAK_LABEL[brk.type],
            minToTime(brk.start),
            minToTime(brk.end),
            `${brk.duration} min`,
            brk.conflict ? 'CONFLICTO' : 'OK',
          ],
          conflict: brk.conflict,
          isFirst: i === 0,
        });
      });
    }
  }

  return (
    <div className="app">
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo">HR</span>
          <div>
            <p className="sidebar-title">Horarios</p>
            <p className="sidebar-sub">Generador</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${view === 'timeline' ? 'active' : ''}`}
            onClick={() => setView('timeline')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="4" width="14" height="2.5" rx="1.25" fill="currentColor" opacity=".3"/>
              <rect x="1" y="7.5" width="8" height="2.5" rx="1.25" fill="currentColor"/>
              <rect x="1" y="11" width="11" height="2.5" rx="1.25" fill="currentColor" opacity=".6"/>
            </svg>
            Timeline
          </button>
          <button
            className={`nav-item ${view === 'table' ? 'active' : ''}`}
            onClick={() => setView('table')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="14" height="2.5" rx="1" fill="currentColor" opacity=".4"/>
              <rect x="1" y="5" width="14" height="8.5" rx="1" fill="none" stroke="currentColor" strokeOpacity=".5"/>
              <line x1="1" y1="8.75" x2="15" y2="8.75" stroke="currentColor" strokeOpacity=".3"/>
              <line x1="6" y1="5" x2="6" y2="13.5" stroke="currentColor" strokeOpacity=".3"/>
            </svg>
            Tabla
          </button>
        </nav>

        <div className="sidebar-section">
          <p className="sidebar-label">Métricas</p>
          <div className="stat-list">
            <div className="stat-item">
              <span className="stat-value">{employees.length}</span>
              <span className="stat-label">Empleados</span>
            </div>
            <div className="stat-item">
              <span className="stat-value" style={{ color: 'var(--color-green)' }}>{withBreaks}</span>
              <span className="stat-label">Con descansos</span>
            </div>
            <div className="stat-item">
              <span
                className="stat-value"
                style={{ color: conflicts.length > 0 ? 'var(--color-red)' : undefined }}
              >
                {conflicts.length}
              </span>
              <span className="stat-label">Conflictos</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{totalBreak}</span>
              <span className="stat-label">Min. descanso</span>
            </div>
          </div>
        </div>

        <div className="sidebar-section rules-section">
          <p className="sidebar-label">Reglas</p>
          <div className="rule-card">
            <span className="rule-badge green">≥ 7 h</span>
            <div className="rule-detail">
              <span>S1 15 · Break 30 · S2 15</span>
              <span className="rule-total">60 min</span>
            </div>
          </div>
          <div className="rule-card">
            <span className="rule-badge blue">≥ 6 h</span>
            <div className="rule-detail">
              <span>S1 12 · Break 20 · S2 12</span>
              <span className="rule-total">44 min</span>
            </div>
          </div>
          <div className="rule-card">
            <span className="rule-badge amber">&gt; 5 h</span>
            <div className="rule-detail">
              <span>S1 10 · S2 10</span>
              <span className="rule-total">20 min</span>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="btn-print" onClick={handlePrint}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="1" width="10" height="7" rx="1" fill="none" stroke="currentColor"/>
              <rect x="3" y="8" width="8" height="5" rx="1" fill="none" stroke="currentColor"/>
              <line x1="4" y1="10.5" x2="10" y2="10.5" stroke="currentColor" strokeOpacity=".6"/>
              <line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" strokeOpacity=".4"/>
            </svg>
            Exportar / Imprimir
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="main" ref={printRef}>

        {/* Header */}
        <header className="main-header">
          <div>
            <h1 className="main-title">Generador de Horarios de Descanso</h1>
            <p className="main-sub">
              Algoritmo de no-traslape · Priority Queue · Detección de conflictos automática
            </p>
          </div>
          <div className="header-actions">
            <div className="legend">
              {(['silla1', 'break', 'silla2'] as BreakType[]).map(t => (
                <div key={t} className="legend-item">
                  <span className="legend-dot" style={{ background: BREAK_COLORS[t] }} />
                  <span>{BREAK_LABEL[t]}</span>
                </div>
              ))}
              <div className="legend-item">
                <span className="legend-dot conflict-dot" />
                <span>Conflicto</span>
              </div>
            </div>
          </div>
        </header>

        {/* Alert de conflictos */}
        {conflicts.length > 0 && (
          <div className="alert-conflict">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L14.5 13H1.5L8 1.5Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <line x1="8" y1="6" x2="8" y2="9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="11.5" r=".75" fill="currentColor"/>
            </svg>
            <div>
              <strong>Descansos fuera de turno:</strong>{' '}
              {conflicts.map(e => e.name).join(', ')}.
              Ajusta el offset o redistribuye los turnos.
            </div>
          </div>
        )}

        {/* ── Editor de empleados ─────────────────────────────────── */}
        <section className="section">
          <button
            className="section-toggle"
            onClick={() => setEditorOpen(o => !o)}
          >
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              style={{ transform: editorOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .2s' }}
            >
              <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Empleados
            <span className="badge">{employees.length}</span>
          </button>

          {editorOpen && (
            <div className="editor-body">
              <div className="editor-grid-header">
                <span>Nombre</span>
                <span>Entrada</span>
                <span>Salida</span>
                <span>Offset</span>
                <span></span>
              </div>

              {employees.map(emp => (
                <div key={emp.id} className="editor-row">
                  <input
                    className="inp"
                    value={emp.name}
                    onChange={e => updateField(emp.id, 'name', e.target.value)}
                    placeholder="Nombre…"
                  />
                  <input
                    className="inp inp-time"
                    value={emp.entry}
                    onChange={e => updateField(emp.id, 'entry', e.target.value)}
                    placeholder="08:00"
                  />
                  <input
                    className="inp inp-time"
                    value={emp.exit}
                    onChange={e => updateField(emp.id, 'exit', e.target.value)}
                    placeholder="16:00"
                  />
                  <div className="offset-ctrl">
                    <button className="offset-btn" onClick={() => nudgeOffset(emp.id, -5)}>−</button>
                    <span
                      className="offset-val"
                      style={{ color: emp.offset !== 0 ? 'var(--color-amber)' : undefined }}
                    >
                      {emp.offset > 0 ? `+${emp.offset}` : emp.offset}m
                    </span>
                    <button className="offset-btn" onClick={() => nudgeOffset(emp.id, 5)}>+</button>
                  </div>
                  <button className="btn-remove" onClick={() => removeEmployee(emp.id)} title="Eliminar">
                    ✕
                  </button>
                </div>
              ))}

              <div className="editor-row add-row">
                <input
                  className="inp"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Nuevo empleado…"
                  onKeyDown={e => e.key === 'Enter' && addEmployee()}
                />
                <input
                  className="inp inp-time"
                  value={newEntry}
                  onChange={e => setNewEntry(e.target.value)}
                  placeholder="08:00"
                />
                <input
                  className="inp inp-time"
                  value={newExit}
                  onChange={e => setNewExit(e.target.value)}
                  placeholder="16:00"
                />
                <div />
                <button
                  className="btn-add"
                  onClick={addEmployee}
                  disabled={!newName.trim()}
                >
                  + Agregar
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Vista principal ─────────────────────────────────────── */}
        <section className="section section-main">
          {view === 'timeline' ? (
            <>
              <div className="section-title">
                <h2>Timeline de Descansos</h2>
                <p className="section-hint">Sin bloques superpuestos = cero traslapes garantizados</p>
              </div>
              <Timeline scheduled={scheduled} />
            </>
          ) : (
            <>
              <div className="section-title">
                <h2>Horario Generado</h2>
              </div>
              <div className="table-wrap">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Entrada</th>
                      <th>Salida</th>
                      <th>Descanso</th>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th className="right">Duración</th>
                      <th className="center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={row.conflict ? 'row-conflict' : row.isFirst ? 'row-first' : ''}>
                        {row.cells.map((cell, j) => (
                          <td
                            key={j}
                            className={
                              j === 6 ? 'right mono' :
                              j === 7 ? `center status-cell ${row.conflict ? 'status-conflict' : 'status-ok'}` :
                              j === 3 ? `break-type break-${row.cells[3]?.toLowerCase().replace(' ', '')}` :
                              j >= 4 && j <= 5 ? 'mono' : ''
                            }
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
