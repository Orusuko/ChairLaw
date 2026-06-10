import { useRef, useState } from 'react';
import { shiftBounds, snapToGrid, getLegalWindow } from '../algorithm';
import { axisLabelMinToTime } from '../timeFormat';
import { BREAK_COLORS } from '../types';
import type { BreakSlot, BreakType, ScheduledEmployee } from '../types';

interface DragState {
  empId: string;
  type: BreakType;
  duration: number;
  origStart: number;
}

interface Ghost {
  empId: string;
  type: BreakType;
  x1: number;
  x2: number;
  valid: boolean;
}

interface Props {
  scheduled: ScheduledEmployee[];
  widthAvail: number;
  onBreakOverride: (empId: string, type: BreakType, startMin: number) => void;
}

export function Timeline({ scheduled, widthAvail, onBreakOverride }: Props) {
  if (scheduled.length === 0) return null;

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);

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

  const ROW_H = 44;
  const AXIS_H = 34;
  const PAD_TOP = 12;

  const toX = (m: number) => dx + LABEL_W + ((m - minT) / range) * TL_W;
  const toMin = (svgX: number) => minT + ((svgX - dx - LABEL_W) / TL_W) * range;
  const totalH = PAD_TOP + scheduled.length * ROW_H + AXIS_H;

  const tickStart = Math.ceil(minT / 60) * 60;
  const ticks: number[] = [];
  for (let t = tickStart; t <= maxT; t += 60) ticks.push(t);

  function isValidDragPosition(empId: string, type: BreakType, newStart: number): boolean {
    const emp = scheduled.find(e => e.id === empId);
    if (!emp) return false;
    const brk = emp.breaks.find(b => b.type === type);
    if (!brk) return false;
    const [em, xm] = shiftBounds(emp.entry, emp.exit);
    const s1End = emp.breaks.find(b => b.type === 'silla1')?.end ?? em + 75;
    const brEnd = emp.breaks.find(b => b.type === 'break')?.end ?? s1End;
    const { earliest, latest } = getLegalWindow(em, xm, type, s1End, brEnd, brk.duration);
    return newStart >= earliest && newStart + brk.duration <= xm && newStart <= latest;
  }

  function handlePointerDown(e: React.PointerEvent<SVGRectElement>, emp: ScheduledEmployee, brk: BreakSlot) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      empId: emp.id,
      type: brk.type,
      duration: brk.duration,
      origStart: brk.start,
    };
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current;
    if (!d) return;
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const rawMin = toMin(svgX);
    const snapped = snapToGrid(rawMin - d.duration / 2);
    const x1 = toX(snapped);
    const x2 = toX(snapped + d.duration);
    const valid = isValidDragPosition(d.empId, d.type, snapped);
    setGhost({ empId: d.empId, type: d.type, x1, x2, valid });
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) { setGhost(null); return; }

    const svgEl = svgRef.current;
    if (svgEl) {
      const rect = svgEl.getBoundingClientRect();
      const svgX = e.clientX - rect.left;
      const rawMin = toMin(svgX);
      const snapped = snapToGrid(rawMin - d.duration / 2);
      if (isValidDragPosition(d.empId, d.type, snapped)) {
        onBreakOverride(d.empId, d.type, snapped);
      }
    }
    setGhost(null);
  }

  return (
    <div className="timeline-canvas-wrap">
      <svg
        ref={svgRef}
        width={dx + LABEL_W + TL_W + MARGIN}
        height={totalH}
        className="timeline-svg"
        style={{ display: 'block', minWidth: dx + LABEL_W + TL_W }}
        role="img"
        aria-label="Timeline de descansos"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Row backgrounds */}
        {scheduled.map((_, i) => (
          <rect
            key={i}
            x={dx + LABEL_W} y={PAD_TOP + i * ROW_H}
            width={TL_W} height={ROW_H}
            style={{ fill: i % 2 === 0 ? 'var(--tl-row-even)' : 'var(--tl-row-odd)' }}
          />
        ))}

        {/* Grid lines */}
        {ticks.map(t => (
          <line key={`v${t}`}
            x1={toX(t)} y1={PAD_TOP} x2={toX(t)} y2={PAD_TOP + scheduled.length * ROW_H}
            style={{ stroke: 'var(--tl-grid)' }} strokeWidth={1}
          />
        ))}

        {/* Axis ticks + labels */}
        {ticks.map(t => (
          <g key={`a${t}`}>
            <line
              x1={toX(t)} y1={PAD_TOP + scheduled.length * ROW_H}
              x2={toX(t)} y2={PAD_TOP + scheduled.length * ROW_H + 6}
              style={{ stroke: 'var(--tl-axis-tick)' }} strokeWidth={1}
            />
            <text
              x={toX(t)} y={PAD_TOP + scheduled.length * ROW_H + 22}
              textAnchor="middle" fontSize={10} fontFamily="var(--font-sans)"
              style={{ fill: 'var(--tl-axis-label)' }}
            >
              {axisLabelMinToTime(t)}
            </text>
          </g>
        ))}

        {/* Axis baseline */}
        <line
          x1={dx + LABEL_W} y1={PAD_TOP + scheduled.length * ROW_H}
          x2={dx + LABEL_W + TL_W} y2={PAD_TOP + scheduled.length * ROW_H}
          style={{ stroke: 'var(--tl-axis)' }} strokeWidth={1}
        />

        {/* Employee rows */}
        {scheduled.map((emp, i) => {
          const y = PAD_TOP + i * ROW_H;
          const cy = y + ROW_H / 2;
          const lbl = emp.name.length > 20 ? emp.name.slice(0, 19) + '…' : emp.name;
          const [emPx, xmPx] = shiftBounds(emp.entry, emp.exit);
          const ex = toX(emPx);
          const sx = toX(xmPx);

          return (
            <g key={emp.id}>
              {/* Name label */}
              <text
                x={dx + LABEL_W - 8} y={cy + 4}
                textAnchor="end" fontSize={12} fontFamily="var(--font-sans)" fontWeight={400}
                style={{ fill: emp.hasConflict ? 'var(--red)' : 'var(--tl-emp-label)' }}
              >
                {lbl}
              </text>
              {emp.offset !== 0 && (
                <text
                  x={dx + LABEL_W - 8} y={cy + 16}
                  textAnchor="end" fontSize={9} fontFamily="var(--font-mono)"
                  style={{ fill: 'var(--tl-offset)' }}
                >
                  {emp.offset > 0 ? `+${emp.offset}` : emp.offset}m
                </text>
              )}

              {/* Shift bar */}
              <rect
                x={ex} y={y + ROW_H * 0.36}
                width={Math.max(sx - ex, 2)} height={ROW_H * 0.28}
                style={{ fill: 'var(--tl-shift-bar)' }}
              />

              {/* Break rects (draggable) */}
              {emp.breaks.map((brk, j) => {
                const isDragging = ghost?.empId === emp.id && ghost.type === brk.type;
                const x1 = toX(brk.start);
                const x2 = Math.max(toX(brk.end), x1 + 4);
                const col = brk.conflict ? 'var(--red)' : BREAK_COLORS[brk.type];
                return (
                  <g key={j}>
                    <rect
                      x={x1} y={y + 4}
                      width={x2 - x1} height={ROW_H - 8}
                      style={{
                        fill: col,
                        cursor: 'grab',
                        opacity: isDragging ? 0.4 : 1,
                        touchAction: 'none',
                      }}
                      role="slider"
                      aria-label={`${brk.type} de ${emp.name}`}
                      aria-valuenow={brk.start}
                      onPointerDown={ev => handlePointerDown(ev, emp, brk)}
                    />
                    {brk.isOverride && (
                      <rect
                        x={x1} y={y + 4}
                        width={x2 - x1} height={ROW_H - 8}
                        fill="none"
                        stroke="rgba(255,255,255,0.55)"
                        strokeWidth={1.5}
                        strokeDasharray="3 2"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    {brk.conflict && (
                      <rect
                        x={x1} y={y + 4}
                        width={x2 - x1} height={ROW_H - 8}
                        fill="none"
                        style={{ stroke: 'var(--red)', pointerEvents: 'none' }}
                        strokeWidth={2}
                      />
                    )}
                    {x2 - x1 > 32 && (
                      <text
                        x={(x1 + x2) / 2} y={cy + 4}
                        textAnchor="middle" fontSize={10} fontWeight={700}
                        fontFamily="var(--font-sans)"
                        style={{ fill: 'var(--tl-break-text)', pointerEvents: 'none' }}
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

        {/* Drag ghost */}
        {ghost && (() => {
          const empIdx = scheduled.findIndex(e => e.id === ghost.empId);
          if (empIdx < 0) return null;
          const y = PAD_TOP + empIdx * ROW_H;
          const col = ghost.valid ? BREAK_COLORS[ghost.type] : 'var(--red)';
          return (
            <rect
              x={ghost.x1} y={y + 4}
              width={Math.max(ghost.x2 - ghost.x1, 4)} height={ROW_H - 8}
              style={{ fill: col, opacity: 0.65, pointerEvents: 'none' }}
            />
          );
        })()}
      </svg>
    </div>
  );
}
