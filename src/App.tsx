import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { applyScheduleWithOverrides } from './algorithm';
import type { BreakType } from './types';
import { BREAK_COLORS, BREAK_LABEL } from './types';
import { timeStrAmPm, formatSlotAmPm } from './timeFormat';
import { useTheme } from './hooks/useTheme';
import { useEmployees } from './hooks/useEmployees';
import { AppHeader } from './components/AppHeader';
import { EmployeeForm } from './components/EmployeeForm';
import { EmployeeList } from './components/EmployeeList';
import { ScheduleTable } from './components/ScheduleTable';
import { Timeline } from './components/Timeline';
import './App.css';

function slotByType(brks: ReturnType<typeof applyScheduleWithOverrides>[0]['breaks'], t: BreakType) {
  return brks.find(b => b.type === t);
}

function escapeCsvCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function buildCsv(scheduled: ReturnType<typeof applyScheduleWithOverrides>): string {
  const BOM = '\uFEFF';
  const header = ['Empleado','Entrada (24 h)','Salida (24 h)','Entrada (AM/PM)','Salida (AM/PM)','Ley Silla 1','Break','Ley Silla 2','Horas'];
  const lines: string[] = [header.map(escapeCsvCell).join(',')];
  for (const emp of scheduled) {
    const s1 = slotByType(emp.breaks, 'silla1');
    const bk = slotByType(emp.breaks, 'break');
    const s2 = slotByType(emp.breaks, 'silla2');
    lines.push([
      emp.name, emp.entry, emp.exit,
      emp.entry ? timeStrAmPm(emp.entry) : '',
      emp.exit  ? timeStrAmPm(emp.exit)  : '',
      formatSlotAmPm(s1),
      bk ? formatSlotAmPm(bk) : '—',
      formatSlotAmPm(s2),
      emp.shiftHours.toFixed(1) + ' h',
    ].map(escapeCsvCell).join(','));
  }
  return BOM + lines.join('\r\n');
}

function downloadBlob(filename: string, mime: string, content: string | Blob) {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function timestampForFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const {
    employees, editingId,
    addEmployee, removeEmployee, nudgeOffset,
    startEdit, cancelEdit, saveEdit,
    setBreakOverride, clearBreakOverrides,
  } = useEmployees();

  const scheduled = applyScheduleWithOverrides(employees);
  const conflicts = scheduled.filter(e => e.hasConflict);
  const withBreaks = scheduled.filter(e => e.breaks.length > 0).length;
  const totalBreakMin = scheduled.reduce((s, e) => s + e.breaks.reduce((a, b) => a + b.duration, 0), 0);

  const timelineHostRef = useRef<HTMLDivElement>(null);
  const [timelineInnerW, setTimelineInnerW] = useState(900);
  const captureWideRef = useRef<HTMLDivElement>(null);
  const captureTableRef = useRef<HTMLDivElement>(null!);
  const captureCardsRef = useRef<HTMLDivElement>(null!);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const tableRefs = { tableRef: captureTableRef, cardsRef: captureCardsRef };

  useEffect(() => {
    const el = timelineHostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTimelineInnerW(Math.max(el.clientWidth, 400)));
    ro.observe(el);
    setTimelineInnerW(Math.max(el.clientWidth, 400));
    return () => ro.disconnect();
  }, []);

  const pngOpts = { pixelRatio: 2, cacheBust: true, filter: (n: Element) => !n.classList?.contains('no-screenshot') } as const;

  async function exportPng(node: HTMLElement | null, baseName: string) {
    if (!node || !scheduled.length) { setExportErr('Añade empleados antes de exportar.'); return; }
    setExportErr(null);
    try {
      const dataUrl = await toPng(node, { ...pngOpts });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      downloadBlob(`${baseName}_${timestampForFile()}.png`, blob.type, blob);
    } catch { setExportErr('No se pudo generar la imagen.'); }
  }

  return (
    <div className="app">
      <AppHeader
        employeeCount={employees.length}
        withBreaks={withBreaks}
        conflictCount={conflicts.length}
        totalBreakMin={totalBreakMin}
        theme={theme}
        onThemeChange={setTheme}
      />

      <div className="app-body">
        <aside className="left-panel no-screenshot" aria-label="Panel de empleados">
          <div className="left-form">
            <p className="left-section-label" id="add-emp-label">NUEVO EMPLEADO</p>
            <EmployeeForm onSubmit={addEmployee} />
          </div>
          <div className="left-divider" />
          <EmployeeList
            employees={employees}
            scheduled={scheduled}
            editingId={editingId}
            onRemove={removeEmployee}
            onNudgeOffset={nudgeOffset}
            onStartEdit={startEdit}
            onCancelEdit={cancelEdit}
            onSaveEdit={saveEdit}
            onClearOverrides={clearBreakOverrides}
          />
        </aside>

        <main className="right-panel">
          {conflicts.length > 0 && (
            <div className="alert-bar" role="alert" aria-live="assertive">
              <strong>Descanso fuera de turno:</strong>{' '}
              {conflicts.map(e => e.name).join(', ')}
              {'  ·  '}Ajusta el offset o arrastra el break
            </div>
          )}

          {exportErr && (
            <div className="alert-bar alert-bar--warn" role="alert">
              {exportErr}
              <button type="button" className="alert-close" onClick={() => setExportErr(null)} aria-label="Cerrar">✕</button>
            </div>
          )}

          <div ref={captureWideRef} className="capture-wide">
            <div className="schedule-block-head">
              <h2 className="block-title">Horario Generado</h2>
              <div className="export-btns">
                <button type="button" className="btn-exp btn-exp--muted"
                  onClick={() => downloadBlob(`horarios_${timestampForFile()}.csv`, 'text/csv;charset=utf-8', buildCsv(scheduled))}>
                  Exportar CSV
                </button>
                <button type="button" className="btn-exp btn-exp--blue"
                  onClick={() => exportPng(captureWideRef.current, 'horarios_pc')}>
                  Imagen PC / HD
                </button>
                <button type="button" className="btn-exp btn-exp--green"
                  onClick={async () => {
                    const node = captureTableRef.current;
                    if (!node) return;
                    // Temporalmente sacar la tabla del off-screen para que html-to-image la capture
                    const prev = { position: node.style.position, left: node.style.left, top: node.style.top };
                    node.style.position = 'static';
                    node.style.left = 'auto';
                    node.style.top = 'auto';
                    await exportPng(node, 'horarios_tabla_movil');
                    node.style.position = prev.position;
                    node.style.left = prev.left;
                    node.style.top = prev.top;
                  }}>
                  Tabla · teléfono
                </button>
                <button type="button" className="btn-exp btn-exp--wa"
                  onClick={() => exportPng(captureWideRef.current, 'horarios_whatsapp')}>
                  Imagen WhatsApp
                </button>
              </div>
            </div>

            <ScheduleTable refs={tableRefs} scheduled={scheduled} />

            <div className="timeline-block-head">
              <h2 className="block-title">Timeline de Descansos</h2>
              <div className="timeline-legend" aria-label="Leyenda">
                {(['silla1', 'break', 'silla2'] as BreakType[]).map(t => (
                  <div key={t} className="tl-leg-item">
                    <span className="tl-dot" style={{ background: BREAK_COLORS[t] }} aria-hidden="true" />
                    <span>{BREAK_LABEL[t]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div ref={timelineHostRef} className="timeline-host">
              <Timeline
                scheduled={scheduled}
                widthAvail={timelineInnerW}
                onBreakOverride={setBreakOverride}
              />
            </div>
          </div>

          <div className="print-footer no-screenshot">
            <button type="button" className="btn-print-bottom" onClick={() => window.print()}>
              Imprimir / PDF
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
