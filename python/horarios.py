#!/usr/bin/env python3
"""
Generador de Horarios de Descanso
Algoritmo de no-traslape · Priority Queue · Detección de conflictos
"""

import csv
import os
import sys

# Forzar UTF-8 en consolas Windows (cmd / PowerShell)
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stdin.encoding and sys.stdin.encoding.lower() != "utf-8":
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from rich import box
from rich.columns import Columns
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm, Prompt
from rich.rule import Rule
from rich.table import Table
from rich.text import Text

console = Console()

# ─── Colores del tema ────────────────────────────────────────────────────────
C_BLUE   = "bold #4a9eff"
C_GREEN  = "#3fa266"
C_AMBER  = "#e09a30"
C_RED    = "bold #e0505a"
C_DIM    = "dim white"
C_TITLE  = "bold white"

BREAK_COLORS = {
    "silla1": C_BLUE,
    "break":  C_GREEN,
    "silla2": C_AMBER,
}
BREAK_LABELS = {
    "silla1": "Silla 1",
    "break":  "Break  ",
    "silla2": "Silla 2",
}

# ─── Tipos de datos ──────────────────────────────────────────────────────────

@dataclass
class Employee:
    name:   str
    entry:  str          # "HH:MM"
    exit:   str          # "HH:MM"
    offset: int = 0      # minutos de retraso manual (-60 a +120)


@dataclass
class BreakSlot:
    type:     str    # "silla1" | "break" | "silla2"
    start:    int    # minutos desde medianoche
    end:      int
    duration: int
    conflict: bool


@dataclass
class ScheduledEmployee:
    name:         str
    entry:        str
    exit:         str
    offset:       int
    breaks:       list[BreakSlot] = field(default_factory=list)
    shift_hours:  float = 0.0
    has_conflict: bool = False


# ─── Algoritmo ───────────────────────────────────────────────────────────────

def time_to_min(t: str) -> int:
    """Convierte "HH:MM" a minutos desde medianoche."""
    try:
        h, m = t.strip().split(":")
        return int(h) * 60 + int(m)
    except ValueError:
        return 0


def min_to_time(m: int) -> str:
    """Convierte minutos desde medianoche a "HH:MM"."""
    total = m % 1440
    return f"{total // 60:02d}:{total % 60:02d}"


def get_durations(shift_hours: float) -> Optional[dict]:
    """Retorna las duraciones de descanso según la jornada."""
    if shift_hours >= 7:
        return {"s1": 15, "br": 30, "s2": 15}
    if shift_hours >= 6:
        return {"s1": 12, "br": 20, "s2": 12}
    if shift_hours > 5:
        return {"s1": 10, "br": None, "s2": 10}
    return None


def shift_bounds(entry: str, exit_: str) -> tuple:
    """Retorna (em, xm, sh) normalizando turnos que cruzan medianoche.
    Si xm == em, sh=0 (se usa para rechazar turnos de duración cero)."""
    em = time_to_min(entry)
    xm = time_to_min(exit_)
    if xm < em:
        xm += 1440
    return em, xm, (xm - em) / 60


def _find_slot(earliest: int, latest: int, preferred: int, duration: int,
               occupied: list, *, forward_first: bool = False) -> Optional[int]:
    """Slot libre más cercano a `preferred`.
    forward_first=True: busca hacia adelante primero (breaks, el 2° emp queda después).
    forward_first=False: busca hacia atrás primero (Silla2, el 2° emp queda antes)."""
    def is_free(s: int) -> bool:
        e = s + duration
        return all(e <= oc_s or s >= oc_e for oc_s, oc_e in occupied)
    if forward_first:
        s = preferred
        while s <= latest:
            if is_free(s): return s
            s += 5
        s = preferred - 5
        while s >= earliest:
            if is_free(s): return s
            s -= 5
    else:
        s = preferred
        while s >= earliest:
            if is_free(s): return s
            s -= 5
        s = preferred + 5
        while s <= latest:
            if is_free(s): return s
            s += 5
    return None


def generate_schedule(employees: list[Employee]) -> list[ScheduledEmployee]:
    """
    Fases globales de asignación (sin traslapes):

      Fase 1 — Ley Silla 1 para TODOS los empleados (emp1 → empN)
      Fase 2 — Break        para todos con jornada >= 6 h (emp1 → empN)
      Fase 3 — Ley Silla 2  por ventana legal ~75 min antes de salida, sin cola global
    """
    sorted_emps = sorted(employees, key=lambda e: time_to_min(e.entry))
    n = len(sorted_emps)

    emp_data:   list[tuple] = []
    breaks_map: list[list[BreakSlot]] = [[] for _ in range(n)]
    s1_ends:    list[int]  = [0] * n
    br_ends:    list[int]  = [0] * n
    has_break:  list[bool] = [False] * n

    for emp in sorted_emps:
        em, xm, sh = shift_bounds(emp.entry, emp.exit)
        emp_data.append((emp, em, xm, sh, get_durations(sh)))

    busy = 0

    # ── Fase 1: Ley Silla 1 ───────────────────────────────────────────
    for i, (emp, em, xm, sh, dur) in enumerate(emp_data):
        if not dur or sh <= 0:
            continue
        s1s = max(em + 75 + emp.offset, busy)
        s1e = s1s + dur["s1"]
        breaks_map[i].append(BreakSlot("silla1", s1s, s1e, dur["s1"], s1e > xm))
        busy       = s1e
        s1_ends[i] = s1e

    # ── Fase 2: Break (solo jornadas >= 6 h) ──────────────────────────
    # Regla: Break solo evita traslapes con:
    #   - Silla 1 de empleados con la MISMA hora de entrada o anterior
    #   - Breaks ya asignados (nadie puede coincidir en almuerzo)
    # Se permite cruzar con Silla1 de empleados que entran DESPUÉS.
    silla1_occ_ph2: dict[int, tuple[int, int]] = {}
    for k in range(n):
        s1_slot = next((b for b in breaks_map[k] if b.type == "silla1"), None)
        if s1_slot:
            silla1_occ_ph2[k] = (s1_slot.start, s1_slot.end)

    br_assigned: list[tuple[int, int]] = []
    for i, (emp, em, xm, sh, dur) in enumerate(emp_data):
        if not dur or sh <= 0 or dur["br"] is None:
            continue
        br_len   = dur["br"]
        occupied = list(br_assigned)
        for k, s1_iv in silla1_occ_ph2.items():
            if emp_data[k][1] <= em:
                occupied.append(s1_iv)
        earliest  = s1_ends[i]
        latest    = xm - br_len
        mid       = em + (xm - em) // 2
        ideal     = mid - br_len // 2
        preferred = max(earliest, min(ideal, latest))
        slot = _find_slot(earliest, latest, preferred, br_len, occupied, forward_first=True)
        bs   = slot if slot is not None else earliest
        be   = bs + br_len
        breaks_map[i].append(BreakSlot("break", bs, be, br_len, be > xm))
        br_ends[i]  = be
        has_break[i] = True
        br_assigned.append((bs, be))

    # ── Fase 3: Ley Silla 2 (objetivo: ~75 min antes de salida) ───────
    # Silla 2 solo evita traslapes con Silla1 de todos, Silla2 ya asignadas,
    # y breaks de empleados con la misma hora de entrada o anterior.
    # Se permite cruzar con breaks de empleados que entran DESPUÉS.
    silla1_occ: list[tuple[int, int]] = [
        (b.start, b.end) for lst in breaks_map for b in lst if b.type == "silla1"
    ]
    break_occ_by_idx: dict[int, tuple[int, int]] = {}
    for k in range(n):
        brk_slot = next((b for b in breaks_map[k] if b.type == "break"), None)
        if brk_slot:
            break_occ_by_idx[k] = (brk_slot.start, brk_slot.end)

    s2_assigned: list[tuple[int, int]] = []
    phase3_order = sorted(range(n), key=lambda i: (emp_data[i][2] - 75, -i))
    for i in phase3_order:
        emp, em, xm, sh, dur = emp_data[i]
        if not dur or sh <= 0:
            continue
        occupied = list(silla1_occ) + list(s2_assigned)
        for k, brk_interval in break_occ_by_idx.items():
            if emp_data[k][1] <= em:
                occupied.append(brk_interval)
        prev      = br_ends[i] if has_break[i] else s1_ends[i]
        earliest  = prev
        latest    = xm - dur["s2"]
        ideal     = xm - 75
        preferred = max(earliest, min(ideal, latest))
        slot = _find_slot(earliest, latest, preferred, dur["s2"], occupied)
        if slot is None:
            s2s, conflict = earliest, True
        else:
            s2s     = slot
            conflict = s2s + dur["s2"] > xm
        s2e = s2s + dur["s2"]
        breaks_map[i].append(BreakSlot("silla2", s2s, s2e, dur["s2"], conflict))
        s2_assigned.append((s2s, s2e))

    result: list[ScheduledEmployee] = []
    for i, (emp, em, xm, sh, _) in enumerate(emp_data):
        brks = breaks_map[i]
        result.append(ScheduledEmployee(
            name=emp.name, entry=emp.entry, exit=emp.exit,
            offset=emp.offset, breaks=brks, shift_hours=sh,
            has_conflict=any(b.conflict for b in brks),
        ))
    return result


# ─── Helpers de UI ───────────────────────────────────────────────────────────

def clear() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def banner() -> None:
    title = Text()
    title.append("  GENERADOR DE HORARIOS DE DESCANSO  ", style="bold black on #4a9eff")
    console.print()
    console.print(title, justify="center")
    console.print(
        "  Algoritmo de no-traslape · Priority Queue · Detección de conflictos  ",
        style="dim",
        justify="center",
    )
    console.print()


def rule(label: str = "") -> None:
    console.print(Rule(label, style="dim #333333"))


def validate_time(t: str) -> bool:
    """Valida formato HH:MM y rango."""
    try:
        h, m = t.strip().split(":")
        return 0 <= int(h) <= 23 and 0 <= int(m) <= 59
    except Exception:
        return False


def ask_time(prompt: str, default: str = "") -> str:
    """Pide una hora en formato HH:MM con validación."""
    while True:
        val = Prompt.ask(prompt, default=default, console=console)
        if validate_time(val):
            return val
        console.print("  [red]Formato inválido. Usa HH:MM (ej. 08:30)[/red]")


# ─── Entrada de empleados ─────────────────────────────────────────────────────

def input_employees(existing: list[Employee] | None = None) -> list[Employee]:
    """Pantalla interactiva para ingresar empleados."""
    employees: list[Employee] = list(existing) if existing else []

    console.print(Panel(
        "[dim]Ingresa el nombre de cada empleado seguido de su hora de entrada y salida.\n"
        "Deja el nombre en blanco y presiona [bold]Enter[/bold] para terminar.[/dim]",
        title="[bold white]Registro de Empleados[/bold white]",
        border_style="dim",
        padding=(0, 2),
    ))
    console.print()

    if employees:
        console.print(f"  [dim]Empleados actuales: {len(employees)}[/dim]")
        console.print()

    n = len(employees) + 1
    while True:
        console.print(f"  [dim]Empleado #{n}[/dim]")
        name = Prompt.ask("  [bold]Nombre[/bold]", default="", console=console)

        if not name.strip():
            if not employees:
                console.print("  [yellow]Debes ingresar al menos un empleado.[/yellow]\n")
                continue
            break

        entry = ask_time("  Entrada (HH:MM)", default="08:00")
        exit_ = ask_time("  Salida  (HH:MM)", default="16:00")

        if shift_bounds(entry, exit_)[2] <= 0:
            console.print("  [yellow]La hora de salida debe ser diferente a la entrada.[/yellow]\n")
            continue

        employees.append(Employee(name=name.strip(), entry=entry, exit=exit_))
        console.print(f"  [dim #3fa266]✓ {name} agregado ({entry} → {exit_})[/dim #3fa266]\n")
        n += 1

    return employees


# ─── Renderizado de resultados ────────────────────────────────────────────────

def render_schedule(scheduled: list[ScheduledEmployee]) -> None:
    """Muestra la tabla de horarios generados."""
    table = Table(
        box=box.SIMPLE_HEAD,
        show_header=True,
        header_style="dim",
        border_style="dim #333333",
        pad_edge=False,
        expand=False,
    )

    table.add_column("Empleado",  style="bold white",   min_width=18)
    table.add_column("Entrada",   style="dim",          min_width=7,  justify="center")
    table.add_column("Salida",    style="dim",          min_width=7,  justify="center")
    table.add_column("Jornada",   style="dim",          min_width=7,  justify="center")
    table.add_column("Descanso",  min_width=9,          justify="left")
    table.add_column("Inicio",    min_width=7,          justify="center")
    table.add_column("Fin",       min_width=7,          justify="center")
    table.add_column("Dur.",      min_width=5,          justify="right")
    table.add_column("Horas",     min_width=7,          justify="center")

    conflicts: list[str] = []

    for emp in scheduled:
        shift_str = f"{emp.shift_hours:.1f} h"

        if not emp.breaks:
            table.add_row(
                emp.name, emp.entry, emp.exit, shift_str,
                "[dim]Sin descanso[/dim]", "—", "—", "—", "[dim]—[/dim]",
            )
            continue

        for i, brk in enumerate(emp.breaks):
            name_cell  = emp.name if i == 0 else ""
            entry_cell = emp.entry if i == 0 else ""
            exit_cell  = emp.exit  if i == 0 else ""
            shift_cell = shift_str if i == 0 else ""

            label = Text(BREAK_LABELS[brk.type], style=BREAK_COLORS[brk.type])
            start = Text(min_to_time(brk.start), style="white")
            end   = Text(min_to_time(brk.end),   style="white")
            dur   = Text(f"{brk.duration} m",    style="dim")

            if brk.conflict:
                start = Text(min_to_time(brk.start), style=C_RED)
                end   = Text(min_to_time(brk.end),   style=C_RED)
                dur   = Text(f"{brk.duration} m",    style=C_RED)
                if emp.name not in conflicts:
                    conflicts.append(emp.name)

            offset_hint = ""
            if i == 0 and emp.offset != 0:
                sign = "+" if emp.offset > 0 else ""
                offset_hint = f" [dim #e09a30]({sign}{emp.offset}m)[/dim #e09a30]"

            table.add_row(
                name_cell + offset_hint,
                entry_cell, exit_cell, shift_cell,
                label, start, end, dur, shift_cell,
                end_section=(i == len(emp.breaks) - 1),
            )

    console.print(table)

    # Alerta de conflictos
    if conflicts:
        console.print()
        msg = Text()
        msg.append("  CONFLICTO  ", style="bold black on #e0505a")
        msg.append(f"  {', '.join(conflicts)}", style="bold #e0505a")
        msg.append(" tienen descansos fuera de su turno.", style="white")
        msg.append("\n  Usa la opción [A] para ajustar el offset de esos empleados.", style="dim")
        console.print(msg)


def render_timeline(scheduled: list[ScheduledEmployee]) -> None:
    """Dibuja una línea de tiempo ASCII en la terminal."""
    if not scheduled:
        return

    all_times = []
    for e in scheduled:
        em_t, xm_t, _ = shift_bounds(e.entry, e.exit)
        all_times += [em_t, xm_t]
        for b in e.breaks:
            all_times += [b.start, b.end]

    min_t = min(all_times)
    max_t = max(all_times)
    width = 60  # caracteres de ancho para la línea de tiempo
    ratio = width / max(max_t - min_t, 60)

    def to_col(m: int) -> int:
        return int((m - min_t) * ratio)

    BREAK_CHARS = {"silla1": "▓", "break": "▒", "silla2": "░"}

    console.print()
    console.print("  [dim]Timeline de descansos[/dim]")
    console.print()

    label_w = max(len(e.name) for e in scheduled) + 2

    for emp in scheduled:
        # Construir barra de turno
        bar = list(" " * (width + 2))
        entry_col = to_col(shift_bounds(emp.entry, emp.exit)[0])
        exit_col  = to_col(shift_bounds(emp.entry, emp.exit)[1])
        for c in range(entry_col, min(exit_col, width)):
            bar[c] = "─"

        for brk in emp.breaks:
            sc = to_col(brk.start)
            ec = to_col(brk.end)
            ch = BREAK_CHARS[brk.type]
            for c in range(sc, min(ec, width)):
                bar[c] = ch

        label = emp.name.ljust(label_w)
        bar_str = "".join(bar)

        line = Text()
        line.append(f"  {label}", style="bold white" if not emp.has_conflict else C_RED)
        line.append("│", style="dim")

        # Colorear bloques en la barra
        pos = 0
        while pos < len(bar_str):
            ch = bar_str[pos]
            if ch == "▓":
                run_end = pos
                while run_end < len(bar_str) and bar_str[run_end] == "▓":
                    run_end += 1
                line.append(bar_str[pos:run_end], style=C_BLUE)
                pos = run_end
            elif ch == "▒":
                run_end = pos
                while run_end < len(bar_str) and bar_str[run_end] == "▒":
                    run_end += 1
                line.append(bar_str[pos:run_end], style=C_GREEN)
                pos = run_end
            elif ch == "░":
                run_end = pos
                while run_end < len(bar_str) and bar_str[run_end] == "░":
                    run_end += 1
                line.append(bar_str[pos:run_end], style=C_AMBER)
                pos = run_end
            else:
                run_end = pos
                while run_end < len(bar_str) and bar_str[run_end] not in "▓▒░":
                    run_end += 1
                line.append(bar_str[pos:run_end], style="dim")
                pos = run_end

        line.append("│", style="dim")
        console.print(line)

    # Eje de horas
    axis_str = " " * label_w + " │"
    tick_labels: list[tuple[int, str]] = []
    tick_start = (min_t // 60 + 1) * 60
    for t in range(tick_start, max_t + 1, 60):
        col = to_col(t)
        if 0 <= col <= width:
            tick_labels.append((col, min_to_time(t)))

    axis_chars = list(" " * (width + 2))
    for col, _ in tick_labels:
        if col < len(axis_chars):
            axis_chars[col] = "┴"

    console.print(Text(f"  {' ' * label_w}│{''.join(axis_chars)}│", style="dim"))

    label_line = f"  {' ' * label_w} "
    for col, lbl in tick_labels:
        spaces_needed = col - len(label_line) + label_w + 3
        if spaces_needed >= 0:
            label_line += " " * max(0, spaces_needed) + lbl
    console.print(Text(label_line, style="dim"))

    # Leyenda
    console.print()
    legend = Text("  ")
    legend.append("▓ Silla 1  ", style=C_BLUE)
    legend.append("▒ Break  ",   style=C_GREEN)
    legend.append("░ Silla 2  ", style=C_AMBER)
    legend.append("── Turno",    style="dim")
    console.print(legend)


# ─── Exportar CSV ─────────────────────────────────────────────────────────────

def export_csv(scheduled: list[ScheduledEmployee]) -> None:
    """Exporta el horario a un archivo CSV."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename  = f"horarios_{timestamp}.csv"
    filepath  = os.path.join(os.path.dirname(__file__), filename)

    with open(filepath, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["Empleado", "Entrada", "Salida", "Jornada (h)",
                         "Descanso", "Inicio", "Fin", "Duración (min)", "Horas"])
        for emp in scheduled:
            sh_str = f"{emp.shift_hours:.1f}"
            if not emp.breaks:
                writer.writerow([emp.name, emp.entry, emp.exit,
                                  sh_str, "Sin descanso", "", "", "", sh_str])
            for brk in emp.breaks:
                writer.writerow([
                    emp.name, emp.entry, emp.exit, sh_str,
                    BREAK_LABELS[brk.type].strip(),
                    min_to_time(brk.start), min_to_time(brk.end),
                    brk.duration,
                    sh_str,
                ])

    console.print(f"\n  [#3fa266]✓ Exportado:[/] [dim]{filepath}[/dim]")


# ─── Ajuste de offset ─────────────────────────────────────────────────────────

def adjust_offsets(employees: list[Employee], scheduled: list[ScheduledEmployee]) -> list[Employee]:
    """Permite ajustar el offset de empleados con conflicto (o cualquiera)."""
    console.print()
    rule("Ajuste de Offset")
    console.print()
    console.print(
        "  El offset retrasa el inicio del primer descanso de un empleado.\n"
        "  Útil cuando la operación no permite liberar al empleado a tiempo.\n",
        style="dim",
    )

    names = [e.name for e in employees]
    for i, n in enumerate(names, 1):
        emp_s = next((s for s in scheduled if s.name == n), None)
        mark  = " [bold #e0505a](!)[/]" if emp_s and emp_s.has_conflict else ""
        console.print(f"  [dim]{i}.[/] {n}{mark}")

    console.print()
    choice = Prompt.ask(
        "  Número del empleado a ajustar (Enter para cancelar)",
        default="", console=console,
    )

    if not choice.strip():
        return employees

    try:
        idx = int(choice) - 1
        if not (0 <= idx < len(employees)):
            raise ValueError
    except ValueError:
        console.print("  [yellow]Selección inválida.[/yellow]")
        return employees

    emp = employees[idx]
    current = emp.offset
    sign = "+" if current > 0 else ""
    console.print(f"\n  Empleado: [bold]{emp.name}[/bold]  Offset actual: [bold]{sign}{current} min[/bold]")

    try:
        new_val_str = Prompt.ask(
            "  Nuevo offset en minutos (ej. +15, -10, 0)",
            default=str(current), console=console,
        )
        new_val = int(new_val_str.replace("+", ""))
        new_val = max(-60, min(120, new_val))
    except ValueError:
        console.print("  [yellow]Valor inválido, sin cambios.[/yellow]")
        return employees

    employees[idx] = Employee(emp.name, emp.entry, emp.exit, offset=new_val)
    sign2 = "+" if new_val > 0 else ""
    console.print(f"  [#3fa266]✓ Offset de {emp.name} ajustado a {sign2}{new_val} min[/]")
    return employees


# ─── Loop principal ───────────────────────────────────────────────────────────

def main() -> None:
    clear()
    banner()

    employees: list[Employee] = input_employees()

    while True:
        clear()
        banner()

        scheduled = generate_schedule(employees)
        conflicts = [e for e in scheduled if e.has_conflict]

        # ── Stats rápidas ──────────────────────────────────────────────
        stats = Columns([
            Panel(f"[bold white]{len(employees)}[/]\n[dim]Empleados[/dim]",
                  border_style="dim", padding=(0, 3)),
            Panel(f"[bold #3fa266]{len([e for e in scheduled if e.breaks])}[/]\n[dim]Con descansos[/dim]",
                  border_style="dim", padding=(0, 3)),
            Panel(
                f"[bold {'#e0505a' if conflicts else 'white'}]{len(conflicts)}[/]\n[dim]Conflictos[/dim]",
                border_style="dim", padding=(0, 3),
            ),
            Panel(
                f"[bold white]{sum(b.duration for e in scheduled for b in e.breaks)}[/]\n[dim]Min. asignados[/dim]",
                border_style="dim", padding=(0, 3),
            ),
        ], equal=True, expand=False)
        console.print(stats)

        # ── Horario ────────────────────────────────────────────────────
        rule("Horario Generado")
        render_schedule(scheduled)

        # ── Timeline ───────────────────────────────────────────────────
        render_timeline(scheduled)

        # ── Menú ───────────────────────────────────────────────────────
        console.print()
        rule("Opciones")
        console.print()
        console.print("  [bold][A][/bold] Ajustar offset de un empleado")
        console.print("  [bold][N][/bold] Agregar empleados")
        console.print("  [bold][R][/bold] Reiniciar lista de empleados")
        console.print("  [bold][E][/bold] Exportar a CSV")
        console.print("  [bold][S][/bold] Salir")
        console.print()

        action = Prompt.ask(
            "  Elige una opción",
            choices=["a", "n", "r", "e", "s", "A", "N", "R", "E", "S"],
            default="s",
            show_choices=False,
            console=console,
        ).lower()

        if action == "a":
            employees = adjust_offsets(employees, scheduled)
            input("\n  Presiona Enter para continuar…")

        elif action == "n":
            clear()
            banner()
            employees = input_employees(existing=employees)

        elif action == "r":
            if Confirm.ask("\n  ¿Seguro que quieres borrar todos los empleados?", console=console):
                employees = []
                clear()
                banner()
                employees = input_employees()

        elif action == "e":
            export_csv(scheduled)
            input("\n  Presiona Enter para continuar…")

        elif action == "s":
            console.print()
            console.print("  [dim]Hasta luego.[/dim]")
            console.print()
            sys.exit(0)


if __name__ == "__main__":
    main()
