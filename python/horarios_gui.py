#!/usr/bin/env python3
"""
Generador de Horarios de Descanso — Interfaz Gráfica
Requiere: pip install customtkinter
"""

import csv
import os
import sys
import textwrap
from dataclasses import dataclass, field
from datetime import datetime
from tkinter import messagebox, filedialog
import tkinter as tk

try:
    import customtkinter as ctk
except ImportError:
    os.system(f'"{sys.executable}" -m pip install customtkinter')
    import customtkinter as ctk

# ─── Algoritmo ───────────────────────────────────────────────────────────────

@dataclass
class Employee:
    name:   str
    entry:  str
    exit:   str
    offset: int = 0

@dataclass
class BreakSlot:
    type:     str
    start:    int
    end:      int
    duration: int
    conflict: bool

@dataclass
class ScheduledEmployee:
    name:         str
    entry:        str
    exit:         str
    offset:       int
    breaks:       list = field(default_factory=list)
    shift_hours:  float = 0.0
    has_conflict: bool = False

def time_to_min(t: str) -> int:
    try:
        h, m = t.strip().split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return 0

def min_to_time(m: int) -> str:
    total = ((m % 1440) + 1440) % 1440
    return f"{total // 60:02d}:{total % 60:02d}"

def min_to_ampm(m: int) -> str:
    """Convierte minutos desde medianoche a texto tipo 12:45 PM."""
    total = ((m % 1440) + 1440) % 1440
    h = total // 60
    mins = total % 60
    suf = "AM" if h < 12 else "PM"
    h12 = h % 12
    if h12 == 0:
        h12 = 12
    return f"{h12}:{mins:02d} {suf}"

def time_str_ampm(hh_mm: str) -> str:
    """Convierte 'HH:MM' (24 h) del formulario a 12 h."""
    try:
        return min_to_ampm(time_to_min(hh_mm))
    except Exception:
        return hh_mm

def format_slot_ampm(brk: BreakSlot | None) -> str:
    """Rango inicio-fin en formato 12 h; em dash corto."""
    if brk is None:
        return "—"
    return f"{min_to_ampm(brk.start)} – {min_to_ampm(brk.end)}"

def get_durations(sh: float):
    if sh >= 7: return {"s1": 15, "br": 30,  "s2": 15}
    if sh >= 6: return {"s1": 12, "br": 20,  "s2": 12}
    if sh > 5:  return {"s1": 10, "br": None, "s2": 10}
    return None

def generate_schedule(employees):
    """
    Fases globales de asignación:
      Fase 1 — Silla 1 para TODOS los empleados (emp1 → empN)
      Fase 2 — Break    para todos los de jornada >= 6 h (emp1 → empN)
      Fase 3 — Silla 2  para TODOS los empleados (emp1 → empN)
    Dentro de cada fase se respeta global_busy_until para evitar traslapes.
    """
    sorted_emps = sorted(employees, key=lambda e: time_to_min(e.entry))
    n = len(sorted_emps)

    emp_data   = []
    breaks_map = [[] for _ in range(n)]
    s1_ends    = [0] * n   # fin de Silla 1 de cada empleado
    br_ends    = [0] * n   # fin de Break  de cada empleado
    has_break  = [False] * n

    for emp in sorted_emps:
        em  = time_to_min(emp.entry)
        xm  = time_to_min(emp.exit)
        sh  = (xm - em) / 60
        emp_data.append((emp, em, xm, sh, get_durations(sh)))

    busy = 0

    # ── Fase 1: Silla 1 ───────────────────────────────────────────────
    for i, (emp, em, xm, sh, dur) in enumerate(emp_data):
        if not dur or sh <= 0:
            continue
        s1s = max(em + 75 + emp.offset, busy)
        s1e = s1s + dur["s1"]
        breaks_map[i].append(BreakSlot("silla1", s1s, s1e, dur["s1"], s1e > xm))
        busy      = s1e
        s1_ends[i] = s1e

    # ── Fase 2: Break (solo jornadas >= 6 h) ─────────────────────────
    # Inicio del break lo más cercano posible al centro de la jornada
    # (sin salir antes del fin de Silla 1 ni del recurso global), para
    # que el almuerzo no quede muy adelante ni muy al final del turno.
    for i, (emp, em, xm, sh, dur) in enumerate(emp_data):
        if not dur or sh <= 0 or dur["br"] is None:
            continue
        br_len = dur["br"]
        earliest = max(s1_ends[i], busy)
        latest = xm - br_len
        if earliest > latest:
            bs = earliest
        else:
            mid = em + (xm - em) // 2
            ideal = mid - br_len // 2
            bs = max(earliest, min(ideal, latest))
        be = bs + br_len
        breaks_map[i].append(BreakSlot("break", bs, be, br_len, be > xm))
        busy       = be
        br_ends[i] = be
        has_break[i] = True

    # ── Fase 3: Silla 2 ───────────────────────────────────────────────
    for i, (emp, em, xm, sh, dur) in enumerate(emp_data):
        if not dur or sh <= 0:
            continue
        prev = br_ends[i] if has_break[i] else s1_ends[i]
        s2s  = max(prev, busy)
        s2e  = s2s + dur["s2"]
        breaks_map[i].append(BreakSlot("silla2", s2s, s2e, dur["s2"], s2e > xm))
        busy = s2e

    result = []
    for i, (emp, em, xm, sh, dur) in enumerate(emp_data):
        brks = breaks_map[i]
        result.append(ScheduledEmployee(
            emp.name, emp.entry, emp.exit, emp.offset,
            brks, sh, any(b.conflict for b in brks),
        ))
    return result

# ─── Paleta ──────────────────────────────────────────────────────────────────

BG     = "#0d0d0d"
SURF   = "#181818"
RAISED = "#222222"
BORDER = "#2e2e2e"
TEXT1  = "#e8e8e8"
TEXT2  = "#888888"
TEXT3  = "#4a4a4a"
BLUE   = "#4a9eff"
GREEN  = "#3fa266"
AMBER  = "#e09a30"
RED    = "#e0505a"
FONT   = "Segoe UI"

BREAK_COLOR = {"silla1": BLUE, "break": GREEN, "silla2": AMBER}
BREAK_LABEL = {"silla1": "Silla 1", "break": "Break", "silla2": "Silla 2"}

# Tabla (UI + export tabla-móvil) — tonos alineados con la timeline
TBL_BORDER    = "#30363d"
TBL_SURFACE   = "#0d1117"
TBL_HEADER_BG = "#161b22"
TBL_GRIDLINE  = "#30363d"
TBL_CELL_NAME = "#1c2128"
TBL_CELL_NAME_ALT = "#14181f"
TBL_CELL_TIME = "#272e3a"
TBL_CELL_TIME_ALT = "#222933"
TBL_CELL_S1   = "#172636"
TBL_CELL_S1_ALT = "#142230"
TBL_CELL_BR   = "#152c22"
TBL_CELL_BR_ALT = "#12261d"
TBL_CELL_S2   = "#342a17"
TBL_CELL_S2_ALT = "#2a2213"
TBL_CELL_EST  = "#252a33"
TBL_CELL_EST_ALT = "#20242c"
TBL_CONFLICT_BG = "#3f1f29"
TABLE_HEADERS = ("Empleado", "Entrada", "Salida",
                 "Ley Silla 1", "Break", "Ley Silla 2", "Estado")
# Anchos mínimos en px (sin stretch al ancho de la ventana): la tabla queda compacta a la izquierda.
TABLE_COL_MIN_PX = (110, 72, 72, 148, 148, 148, 68)

# Tabla GUI: mismos paddings y anclas cabecera ↔ filas para alinear texto.
TBL_CELL_GRID_PAD = 2
TBL_CELL_INNER_PADX = (6, 6)
TBL_CELL_INNER_PADY = (6, 8)
TBL_CELL_ANCHORS = (
    "w", "center", "center", "center", "center", "center", "center")

DEFAULT_EMPLOYEES: list[Employee] = []


def _pil_rgb(css: str) -> tuple[int, int, int]:
    s = css.strip().lstrip("#")
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def pil_load_font(size: int, bold: bool = False):
    """Carga fuente TrueType para texto en español dentro de PNG."""
    try:
        from PIL import ImageFont
    except ImportError:
        return None

    windir = os.environ.get("WINDIR", os.path.join(os.sep, "Windows"))
    fonts_dir = os.path.join(windir, "Fonts")
    names = []
    if bold:
        names = ["seguiemj.ttf", "segoeuib.ttf", "arialbd.ttf", "Calibrib.ttf"]
    else:
        names = ["segoeui.ttf", "arial.ttf", "calibri.ttf"]
    paths: list[str] = []
    for n in names:
        fp = os.path.join(fonts_dir, n)
        if os.path.isfile(fp):
            paths.append(fp)

    err: OSError | None = None
    for p in paths:
        try:
            return ImageFont.truetype(p, size)  # type: ignore[attr-defined]
        except OSError as ex:
            err = ex
    try:
        return ImageFont.load_default()
    except Exception:
        raise err if err else RuntimeError("No PIL font")


def draw_round_rect(draw, bbox, radius: float, fill, outline=None, width=1):
    if hasattr(draw, "rounded_rectangle"):
        draw.rounded_rectangle(bbox, radius=radius, fill=fill, outline=outline, width=width)
    else:
        draw.rectangle(bbox, fill=fill, outline=outline, width=max(1, width))


def _pil_line_width(draw, text: str, font) -> int:
    if not text:
        return 0
    bb = draw.textbbox((0, 0), text, font=font)
    return max(0, bb[2] - bb[0])


def _pil_text_lines_fit(draw, text: str, font, max_inner_px: int) -> list[str]:
    """Parte texto en líneas según anchura máxima en píxeles (textbbox + fuente)."""
    rest = ((text or "").strip() or "—")
    mip = max(24, max_inner_px)
    if _pil_line_width(draw, rest, font) <= mip:
        return [rest]

    lines: list[str] = []
    while rest:
        if _pil_line_width(draw, rest, font) <= mip:
            lines.append(rest.strip())
            break

        lo, hi = 1, len(rest)
        best = 1
        while lo <= hi:
            mid = (lo + hi) // 2
            sub = rest[:mid]
            if _pil_line_width(draw, sub, font) <= mip:
                best = mid
                lo = mid + 1
            else:
                hi = mid - 1

        chunk_bin = rest[:best]
        cut_at = best
        bp = chunk_bin.rfind(" ")
        if bp >= 14:
            cand = chunk_bin[:bp].rstrip()
            if cand and _pil_line_width(draw, cand, font) <= mip:
                chunk_bin = rest[: bp]
                cut_at = bp
        chunk = chunk_bin.rstrip()
        if not chunk:
            chunk = rest[0]
            cut_at = 1
        lines.append(chunk.strip())
        rest = rest[cut_at:].lstrip()

    return lines if lines else ["—"]


def _table_cell_palette(zebra: bool, conflict: bool) -> tuple[str, ...]:
    """Siete colores de celda por fila."""
    if conflict:
        return (TBL_CONFLICT_BG,) * 7
    if zebra:
        return (
            TBL_CELL_NAME_ALT, TBL_CELL_TIME_ALT, TBL_CELL_TIME_ALT,
            TBL_CELL_S1_ALT, TBL_CELL_BR_ALT, TBL_CELL_S2_ALT, TBL_CELL_EST_ALT,
        )
    return (
        TBL_CELL_NAME, TBL_CELL_TIME, TBL_CELL_TIME,
        TBL_CELL_S1, TBL_CELL_BR, TBL_CELL_S2, TBL_CELL_EST,
    )


# ─── Aplicacion ───────────────────────────────────────────────────────────────

class HorariosApp(ctk.CTk):

    def __init__(self):
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        self.title("Generador de Horarios de Descanso")
        self.geometry("1180x700")
        self.minsize(1080, 560)
        self.configure(fg_color=BG)

        self._employees = list(DEFAULT_EMPLOYEES)
        self._scheduled = []

        # Referencias directas a widgets que se actualizan
        self._stat_vars       = {}
        self._conflict_lbl    = None   # label del contador de conflictos
        self._count_lbl       = None
        self._list_frame      = None
        self._table_scroll    = None
        self._canvas          = None
        self._alert_frame     = None
        self._alert_lbl       = None
        self._alert_visible   = False

        self._schedule_header_row = None
        self._table_outer         = None
        self._tlh_frame           = None
        self._timeline_outer      = None

        self._build_ui()
        self._refresh()

    # ═══ Construccion de UI ══════════════════════════════════════════════════

    def _build_ui(self):
        self.grid_rowconfigure(1, weight=1)
        self.grid_columnconfigure(1, weight=1)
        self._build_header()
        self._build_left_panel()
        self._build_right_panel()

    # ── Header ───────────────────────────────────────────────────────────────

    def _build_header(self):
        hdr = ctk.CTkFrame(self, fg_color=SURF, corner_radius=0, height=58)
        hdr.grid(row=0, column=0, columnspan=2, sticky="ew")
        hdr.grid_propagate(False)
        hdr.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            hdr, text="HR", font=(FONT, 13, "bold"),
            fg_color=BLUE, text_color="#0a1a2e",
            width=34, height=34, corner_radius=6,
        ).grid(row=0, column=0, padx=(18, 10), pady=12)

        tf = ctk.CTkFrame(hdr, fg_color="transparent")
        tf.grid(row=0, column=1, sticky="w")
        ctk.CTkLabel(tf, text="Generador de Horarios de Descanso",
                     font=(FONT, 14, "bold"), text_color=TEXT1).pack(anchor="w")
        ctk.CTkLabel(tf, text="Algoritmo de no-traslape  |  Priority Queue  |  Deteccion de conflictos",
                     font=(FONT, 11), text_color=TEXT3).pack(anchor="w")

        sf = ctk.CTkFrame(hdr, fg_color="transparent")
        sf.grid(row=0, column=2, padx=18, pady=10, sticky="e")

        for key, label in [("empleados",  "Empleados"),
                            ("descansos",  "Con descansos"),
                            ("conflictos", "Conflictos"),
                            ("total_min",  "Min. asignados")]:
            box = ctk.CTkFrame(sf, fg_color=RAISED, corner_radius=6, width=84, height=38)
            box.pack(side="left", padx=3)
            box.pack_propagate(False)

            var = tk.StringVar(value="0")
            self._stat_vars[key] = var

            val = ctk.CTkLabel(box, textvariable=var, font=(FONT, 15, "bold"), text_color=TEXT1)
            val.place(relx=0.5, rely=0.30, anchor="center")
            ctk.CTkLabel(box, text=label, font=(FONT, 9), text_color=TEXT3).place(
                relx=0.5, rely=0.76, anchor="center")

            if key == "conflictos":
                self._conflict_lbl = val

    # ── Panel izquierdo ──────────────────────────────────────────────────────

    def _build_left_panel(self):
        panel = ctk.CTkFrame(self, fg_color=SURF, corner_radius=0, width=306)
        panel.grid(row=1, column=0, sticky="nsew")
        panel.grid_propagate(False)
        panel.grid_columnconfigure(0, weight=1)
        # row 0 = form, row 1 = divider, row 2 = list header, row 3 = list
        panel.grid_rowconfigure(3, weight=1)

        # ── Formulario (row 0) ────────────────────────────────────────
        form = ctk.CTkFrame(panel, fg_color="transparent")
        form.grid(row=0, column=0, sticky="ew", padx=14, pady=(14, 8))

        ctk.CTkLabel(form, text="NUEVO EMPLEADO",
                     font=(FONT, 10, "bold"), text_color=TEXT3).pack(anchor="w", pady=(0, 7))

        self._inp_name  = self._entry(form, "Nombre completo")
        self._inp_entry = self._entry(form, "Entrada  (08:00)")
        self._inp_exit  = self._entry(form, "Salida   (16:00)")

        ctk.CTkButton(
            form, text="+ Agregar empleado", height=34,
            font=(FONT, 12, "bold"), fg_color=BLUE, text_color="#0a1a2e",
            hover_color="#6ab4ff", corner_radius=6,
            command=self._add_employee,
        ).pack(fill="x", pady=(7, 0))

        self._inp_name.bind("<Return>",  lambda _e: self._inp_entry.focus())
        self._inp_entry.bind("<Return>", lambda _e: self._inp_exit.focus())
        self._inp_exit.bind("<Return>",  lambda _e: self._add_employee())

        # ── Divisor (row 1) ────────────────────────────────────────────
        ctk.CTkFrame(panel, fg_color=BORDER, height=1).grid(
            row=1, column=0, sticky="ew")

        # ── Encabezado de lista (row 2) ────────────────────────────────
        lh = ctk.CTkFrame(panel, fg_color="transparent")
        lh.grid(row=2, column=0, sticky="ew", padx=14, pady=(8, 3))
        ctk.CTkLabel(lh, text="EMPLEADOS",
                     font=(FONT, 10, "bold"), text_color=TEXT3).pack(side="left")
        self._count_lbl = ctk.CTkLabel(lh, text="0",
                                       font=(FONT, 10), text_color=BLUE)
        self._count_lbl.pack(side="left", padx=(5, 0))

        # ── Lista scrollable (row 3) ───────────────────────────────────
        scroll = ctk.CTkScrollableFrame(
            panel, fg_color="transparent",
            scrollbar_button_color=BORDER,
            scrollbar_button_hover_color=TEXT3,
        )
        scroll.grid(row=3, column=0, sticky="nsew", padx=2, pady=(0, 4))
        scroll.grid_columnconfigure(0, weight=1)
        self._list_frame = scroll

    # ── Panel derecho ─────────────────────────────────────────────────────────

    def _build_right_panel(self):
        panel = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        panel.grid(row=1, column=1, sticky="nsew")
        self._right_panel = panel

        panel.grid_columnconfigure(0, weight=1)
        panel.grid_columnconfigure(1, weight=0)
        panel.grid_columnconfigure(2, weight=1)
        # row 0 = alerta (opcional), row 1 = tabla header, row 2 = tabla (centrada)
        # row 3 = timeline header,   row 4 = timeline (usa todo el ancho)
        panel.grid_rowconfigure(2, weight=2)
        panel.grid_rowconfigure(4, weight=3)

        # ── Alerta de conflictos (row 0, oculta al inicio) ─────────────
        self._alert_frame = ctk.CTkFrame(panel, fg_color="#2a0a0c",
                                         corner_radius=0, height=36)
        self._alert_frame.grid_columnconfigure(0, weight=1)
        self._alert_lbl = ctk.CTkLabel(
            self._alert_frame, text="",
            font=(FONT, 11, "bold"), text_color=RED, anchor="w",
        )
        self._alert_lbl.pack(side="left", padx=16)
        # No llamamos .grid() aqui — se muestra/oculta en _refresh_alert

        # ── Cabecera tabla (row 1) ─────────────────────────────────────
        th = ctk.CTkFrame(panel, fg_color="transparent")
        self._schedule_header_row = th
        th.grid(row=1, column=0, columnspan=3, sticky="ew",
                padx=16, pady=(12, 4))
        ctk.CTkLabel(th, text="Horario Generado",
                     font=(FONT, 13, "bold"), text_color=TEXT1).pack(side="left")

        btn_row = ctk.CTkFrame(th, fg_color="transparent")
        btn_row.pack(side="right")
        ctk.CTkButton(
            btn_row, text="Imagen WhatsApp", height=28, width=148,
            font=(FONT, 11, "bold"), fg_color="#2d7fc4", text_color="#f0f0f0",
            hover_color="#4a93d9", corner_radius=5,
            command=self._export_image_mobile_vertical,
        ).pack(side="right", padx=(8, 0))
        ctk.CTkButton(
            btn_row, text="Tabla · teléfono", height=28, width=140,
            font=(FONT, 11, "bold"), fg_color="#256d4a", text_color="#f0fbf5",
            hover_color="#2f8f62", corner_radius=5,
            command=self._export_image_mobile_table,
        ).pack(side="right", padx=(8, 0))
        ctk.CTkButton(
            btn_row, text="Imagen PC / HD", height=28, width=126,
            font=(FONT, 11, "bold"), fg_color=BLUE, text_color="#0a1a2e",
            hover_color="#6ab4ff", corner_radius=5,
            command=self._export_image_wide_screen,
        ).pack(side="right", padx=(6, 0))
        ctk.CTkButton(
            btn_row, text="Exportar CSV", height=28, width=110,
            font=(FONT, 11), fg_color=RAISED, text_color=TEXT2,
            hover_color=BORDER, corner_radius=5,
            command=self._export_csv,
        ).pack(side="right")

        # ── Tabla (row 2) ──────────────────────────────────────────────
        self._build_table(panel)

        # ── Cabecera timeline (row 3) ──────────────────────────────────
        tlh = ctk.CTkFrame(panel, fg_color="transparent")
        self._tlh_frame = tlh
        tlh.grid(row=3, column=0, columnspan=3, sticky="ew",
                 padx=16, pady=(8, 2))
        ctk.CTkLabel(tlh, text="Timeline de Descansos",
                     font=(FONT, 13, "bold"), text_color=TEXT1).pack(side="left")

        leg = ctk.CTkFrame(tlh, fg_color="transparent")
        leg.pack(side="right")
        for btype, color in BREAK_COLOR.items():
            dot = tk.Canvas(leg, width=10, height=10, bg=SURF, highlightthickness=0)
            dot.create_rectangle(0, 0, 10, 10, fill=color, outline="")
            dot.pack(side="left", padx=(8, 2))
            ctk.CTkLabel(leg, text=BREAK_LABEL[btype],
                         font=(FONT, 10), text_color=TEXT3).pack(side="left")

        # ── Canvas timeline (row 4) ────────────────────────────────────
        self._timeline_outer = tk.Frame(panel, bg=BG)
        self._timeline_outer.grid(row=4, column=0, columnspan=3,
                                   sticky="nsew", pady=(0, 14))
        self._timeline_outer.columnconfigure(0, weight=1)

        self._timeline_outer.rowconfigure(0, weight=1)

        self._canvas = tk.Canvas(self._timeline_outer, bg=BG, highlightthickness=0)
        self._canvas.grid(row=0, column=0, sticky="nsew")
        self._canvas.bind("<Configure>", lambda _e: self._draw_timeline())

    # ── Tabla compacta (celdas coloreadas, legible) ─────────────────────────

    def _build_table(self, parent):
        container = ctk.CTkFrame(
            parent,
            fg_color=TBL_SURFACE,
            corner_radius=10,
            border_width=1,
            border_color=TBL_BORDER,
        )
        self._table_outer = container
        container.grid(row=2, column=1, sticky="nsw", padx=(0, 0), pady=(0, 8))
        container.grid_rowconfigure(1, weight=1)
        container.grid_columnconfigure(0, weight=1)

        head_wrap = ctk.CTkFrame(container, fg_color="transparent")
        head_wrap.grid(row=0, column=0, sticky="nw", padx=10, pady=(10, 0))

        top_ac = ctk.CTkFrame(head_wrap, fg_color=BLUE, height=3, corner_radius=0)
        top_ac.pack(fill="x")

        tb_head = ctk.CTkFrame(head_wrap, fg_color=TBL_HEADER_BG, corner_radius=0)
        tb_head.pack(anchor="w")

        self._tbl_header_inner = ctk.CTkFrame(tb_head, fg_color="transparent")
        self._tbl_header_inner.pack(fill="x", padx=6, pady=10)

        for ci, wpx in enumerate(TABLE_COL_MIN_PX):
            self._tbl_header_inner.columnconfigure(ci, weight=0, minsize=wpx)

        hdr_fonts = (
            (FONT, 11, "bold"),
            ("Consolas", 11),
            ("Consolas", 11),
            (FONT, 11, "bold"),
            (FONT, 11, "bold"),
            (FONT, 11, "bold"),
            (FONT, 11, "bold"),
        )
        apx = TBL_CELL_INNER_PADX
        apy = TBL_CELL_INNER_PADY
        gpd = TBL_CELL_GRID_PAD
        for col_i, hdr in enumerate(TABLE_HEADERS):
            ax = TBL_CELL_ANCHORS[col_i]
            hf = ctk.CTkFrame(self._tbl_header_inner, fg_color="transparent")
            hf.grid(row=0, column=col_i, sticky="nsew",
                    padx=gpd, pady=gpd)

            ctk.CTkLabel(
                hf,
                text=hdr,
                font=hdr_fonts[col_i],
                text_color="#c9d1d9",
                anchor=ax,
                justify="center" if ax == "center" else "left",
            ).pack(
                expand=True,
                fill="both",
                padx=apx,
                pady=apy,
            )

        bot_ln = ctk.CTkFrame(head_wrap, fg_color=BLUE, height=2, corner_radius=0)
        bot_ln.pack(fill="x")

        self._table_scroll = ctk.CTkScrollableFrame(
            container,
            fg_color=TBL_SURFACE,
            corner_radius=0,
            scrollbar_button_color=RAISED,
            scrollbar_button_hover_color=BORDER,
        )
        self._table_scroll.grid(row=1, column=0, sticky="nsew", padx=10, pady=(6, 10))

    def _add_gui_table_row(
            self,
            zebra: bool,
            conflict: bool,
            valores: tuple[str, ...],
        ) -> None:
        palettes = _table_cell_palette(zebra, conflict)
        row_fr = ctk.CTkFrame(self._table_scroll, fg_color="transparent")
        row_fr.pack(fill="none", anchor="w", pady=(0, 3))

        for ci, wpx in enumerate(TABLE_COL_MIN_PX):
            row_fr.columnconfigure(ci, weight=0, minsize=wpx)

        fonts = (
            (FONT, 11, "bold"),
            ("Consolas", 11),
            ("Consolas", 11),
            (FONT, 11),
            (FONT, 11),
            (FONT, 11),
            (FONT, 11, "bold"),
        )
        anchors = TBL_CELL_ANCHORS

        est_txt = valores[6]

        def fg_for_cell(i: int) -> str:
            if conflict:
                return "#fde8ea" if i == 6 else TEXT1
            if i == 6:
                return GREEN if est_txt == "OK" else RED
            return TEXT1

        wrap_by_col = (
            108,
            0,
            0,
            128,
            128,
            128,
            0,
        )

        for col_i in range(7):
            txt = valores[col_i]
            cf = ctk.CTkFrame(
                row_fr,
                fg_color=palettes[col_i],
                corner_radius=6,
                border_width=1,
                border_color=TBL_GRIDLINE,
            )
            cf.grid(
                row=0,
                column=col_i,
                sticky="nsew",
                padx=TBL_CELL_GRID_PAD,
                pady=TBL_CELL_GRID_PAD,
            )

            opt = {}
            wl = wrap_by_col[col_i]
            if wl > 0:
                opt["wraplength"] = wl

            ctk.CTkLabel(
                cf,
                text=txt,
                font=fonts[col_i],
                text_color=fg_for_cell(col_i),
                anchor=anchors[col_i],
                justify="center" if anchors[col_i] == "center" else "left",
                **opt,
            ).pack(
                expand=True,
                fill="both",
                padx=TBL_CELL_INNER_PADX,
                pady=TBL_CELL_INNER_PADY,
            )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _entry(self, parent, placeholder):
        e = ctk.CTkEntry(
            parent, placeholder_text=placeholder, height=32,
            font=(FONT, 12), fg_color=RAISED, border_color=BORDER,
            border_width=1, text_color=TEXT1,
            placeholder_text_color=TEXT3, corner_radius=5,
        )
        e.pack(fill="x", pady=3)
        return e

    def _valid_time(self, t):
        try:
            h, m = t.strip().split(":")
            return 0 <= int(h) <= 23 and 0 <= int(m) <= 59
        except Exception:
            return False

    # ── CRUD empleados ────────────────────────────────────────────────────────

    def _add_employee(self):
        name  = self._inp_name.get().strip()
        entry = self._inp_entry.get().strip()
        exit_ = self._inp_exit.get().strip()

        err_fields = []
        if not name:                   err_fields.append(self._inp_name)
        if not self._valid_time(entry): err_fields.append(self._inp_entry)
        if not self._valid_time(exit_): err_fields.append(self._inp_exit)
        if time_to_min(exit_) <= time_to_min(entry) and not err_fields:
            messagebox.showwarning("Horario invalido",
                                   "La hora de salida debe ser posterior a la entrada.",
                                   parent=self)
            return

        for e in err_fields:
            e.configure(border_color=RED)
        if err_fields:
            err_fields[0].focus(); return

        for e in (self._inp_name, self._inp_entry, self._inp_exit):
            e.configure(border_color=BORDER)

        self._employees.append(Employee(name, entry, exit_))
        for e in (self._inp_name, self._inp_entry, self._inp_exit):
            e.delete(0, "end")
        self._inp_name.focus()
        self._refresh()

    def _remove_employee(self, idx):
        self._employees.pop(idx)
        self._refresh()

    def _nudge_offset(self, idx, delta):
        emp = self._employees[idx]
        new = max(-60, min(120, emp.offset + delta))
        self._employees[idx] = Employee(emp.name, emp.entry, emp.exit, new)
        self._refresh()

    # ── Refresh central ───────────────────────────────────────────────────────

    def _refresh(self):
        self._scheduled = generate_schedule(self._employees)
        self._refresh_stats()
        self._refresh_alert()
        self._refresh_list()
        self._refresh_table()
        self._draw_timeline()

    def _refresh_stats(self):
        conflicts  = sum(1 for e in self._scheduled if e.has_conflict)
        w_breaks   = sum(1 for e in self._scheduled if e.breaks)
        total_min  = sum(b.duration for e in self._scheduled for b in e.breaks)
        self._stat_vars["empleados"].set(str(len(self._employees)))
        self._stat_vars["descansos"].set(str(w_breaks))
        self._stat_vars["conflictos"].set(str(conflicts))
        self._stat_vars["total_min"].set(str(total_min))
        if self._conflict_lbl:
            self._conflict_lbl.configure(text_color=RED if conflicts else TEXT1)

    def _refresh_alert(self):
        conflicts = [e.name for e in self._scheduled if e.has_conflict]
        if conflicts:
            text = "Descanso fuera de turno: " + ", ".join(conflicts) + \
                   "  -  Ajusta el offset desde la lista"
            self._alert_lbl.configure(text=text)
            if not self._alert_visible:
                self._alert_frame.grid(row=0, column=0,
                                       columnspan=3, sticky="ew")
                self._alert_visible = True
        else:
            if self._alert_visible:
                self._alert_frame.grid_forget()
                self._alert_visible = False

    def _refresh_list(self):
        for w in self._list_frame.winfo_children():
            w.destroy()
        self._count_lbl.configure(text=str(len(self._employees)))

        sched_map = {e.name: e for e in self._scheduled}

        for idx, emp in enumerate(self._employees):
            sched       = sched_map.get(emp.name)
            conflict    = sched.has_conflict if sched else False
            card_border = RED if conflict else BORDER

            card = ctk.CTkFrame(self._list_frame, fg_color=RAISED,
                                corner_radius=6, border_width=1,
                                border_color=card_border)
            card.grid(row=idx, column=0, sticky="ew", padx=8, pady=3)
            card.grid_columnconfigure(0, weight=1)

            # Fila 0: nombre + boton eliminar
            row0 = ctk.CTkFrame(card, fg_color="transparent")
            row0.grid(row=0, column=0, sticky="ew", padx=8, pady=(6, 2))
            row0.grid_columnconfigure(0, weight=1)

            label = emp.name[:22] + ("..." if len(emp.name) > 22 else "")
            ctk.CTkLabel(row0, text=label, font=(FONT, 12, "bold"),
                         text_color=RED if conflict else TEXT1,
                         anchor="w").grid(row=0, column=0, sticky="w")
            ctk.CTkButton(row0, text="X", width=22, height=22,
                          font=(FONT, 10, "bold"), fg_color="transparent",
                          text_color=TEXT3, hover_color="#3a1012",
                          corner_radius=4,
                          command=lambda i=idx: self._remove_employee(i)
                          ).grid(row=0, column=1, sticky="e")

            # Fila 1: horario
            sh = (time_to_min(emp.exit) - time_to_min(emp.entry)) / 60
            ctk.CTkLabel(card, text=f"{emp.entry}  ->  {emp.exit}   ({sh:.1f} h)",
                         font=(FONT, 10), text_color=TEXT2,
                         anchor="w").grid(row=1, column=0, sticky="w", padx=8)

            # Fila 2: offset
            off_row = ctk.CTkFrame(card, fg_color="transparent")
            off_row.grid(row=2, column=0, sticky="w", padx=8, pady=(4, 4))
            ctk.CTkLabel(off_row, text="Offset:", font=(FONT, 10),
                         text_color=TEXT3).pack(side="left")
            ctk.CTkButton(off_row, text="-", width=26, height=22,
                          font=(FONT, 13), fg_color=SURF, text_color=TEXT2,
                          hover_color=BORDER, corner_radius=4,
                          command=lambda i=idx: self._nudge_offset(i, -5)
                          ).pack(side="left", padx=(5, 0))

            off_sign  = "+" if emp.offset > 0 else ""
            off_color = AMBER if emp.offset != 0 else TEXT3
            ctk.CTkLabel(off_row, text=f"{off_sign}{emp.offset} m",
                         font=(FONT, 11, "bold"), text_color=off_color,
                         width=46, anchor="center").pack(side="left")

            ctk.CTkButton(off_row, text="+", width=26, height=22,
                          font=(FONT, 13), fg_color=SURF, text_color=TEXT2,
                          hover_color=BORDER, corner_radius=4,
                          command=lambda i=idx: self._nudge_offset(i, 5)
                          ).pack(side="left")

            # Fila 3: preview descansos
            if sched and sched.breaks:
                for brk in sched.breaks:
                    c = RED if brk.conflict else BREAK_COLOR[brk.type]
                    txt = f"  {BREAK_LABEL[brk.type]}  {format_slot_ampm(brk)}"
                    ctk.CTkLabel(card, text=txt, font=("Consolas", 10),
                                 text_color=c, anchor="w"
                                 ).grid(row=3 + sched.breaks.index(brk),
                                        column=0, sticky="w", padx=6, pady=1)

    def _slot_by_type(self, brks: list, btype: str):
        for b in brks:
            if b.type == btype:
                return b
        return None

    def _refresh_table(self):
        if self._table_scroll is None:
            return
        for child in list(self._table_scroll.winfo_children()):
            child.destroy()

        row_idx = 0
        for emp in self._scheduled:
            nombre = emp.name
            if emp.offset != 0:
                sgn = "+" if emp.offset > 0 else ""
                nombre = f"{emp.name} ({sgn}{emp.offset}m)"

            ent = time_str_ampm(emp.entry) if emp.entry else "—"
            sal = time_str_ampm(emp.exit) if emp.exit else "—"

            if not emp.breaks:
                valores = (
                    nombre, ent, sal,
                    "—", "—", "—",
                    "—",
                )
                self._add_gui_table_row(row_idx % 2 == 1, emp.has_conflict, valores)
                row_idx += 1
                continue

            s1 = self._slot_by_type(emp.breaks, "silla1")
            bk = self._slot_by_type(emp.breaks, "break")
            s2 = self._slot_by_type(emp.breaks, "silla2")
            valores = (
                nombre,
                ent,
                sal,
                format_slot_ampm(s1),
                format_slot_ampm(bk) if bk else "—",
                format_slot_ampm(s2),
                "CONFLICTO" if emp.has_conflict else "OK",
            )
            self._add_gui_table_row(row_idx % 2 == 1, emp.has_conflict, valores)
            row_idx += 1

    # ── Timeline canvas ───────────────────────────────────────────────────────

    def _draw_timeline(self):
        c = self._canvas
        c.delete("all")
        if not self._scheduled:
            return

        cw = max(c.winfo_width(), 10)
        ch = max(c.winfo_height(), 10)

        all_t = []
        for e in self._scheduled:
            all_t += [time_to_min(e.entry), time_to_min(e.exit)]
            for b in e.breaks:
                all_t += [b.start, b.end]

        min_t = min(all_t)
        max_t = max(all_t)
        rng   = float(max(max_t - min_t, 60))

        LABEL_W   = 150
        AXIS_H    = 34
        PAD_TOP   = 12
        n         = len(self._scheduled)

        margin    = 20
        tw_avail  = max(480, cw - LABEL_W - margin * 2)
        TL_W      = int(min(tw_avail, 920))
        dx        = max(margin // 2, (cw - LABEL_W - TL_W) // 2)

        row_h = max(
            32,
            min(52, (ch - PAD_TOP - AXIS_H - 14) // max(n, 1)),
        )

        def tx(m: int) -> float:
            return dx + LABEL_W + (m - min_t) / rng * TL_W

        x_left  = dx + LABEL_W
        x_right = dx + LABEL_W + TL_W

        for i in range(n):
            y    = PAD_TOP + i * row_h
            fill = "#141414" if i % 2 == 0 else BG
            c.create_rectangle(x_left, y, x_right, y + row_h, fill=fill, outline="")

        tick0 = int((min_t // 60 + 1) * 60)
        for tm in range(tick0, max_t + 1, 60):
            x = tx(tm)
            c.create_line(x, PAD_TOP, x, PAD_TOP + n * row_h, fill="#2a2a2a", width=1)
            c.create_line(x, PAD_TOP + n * row_h, x, PAD_TOP + n * row_h + 6,
                          fill="#555555", width=1)
            c.create_text(x, PAD_TOP + n * row_h + 22,
                          text=min_to_ampm(tm), fill=TEXT2,
                          font=("Segoe UI", 10), anchor="center")

        axis_y = PAD_TOP + n * row_h
        c.create_line(x_left, axis_y, x_right, axis_y, fill="#3a3a3a", width=1)

        for i, emp in enumerate(self._scheduled):
            y  = PAD_TOP + i * row_h
            cy = y + row_h // 2

            lbl = emp.name[:20] + ("..." if len(emp.name) > 20 else "")
            c.create_text(dx + LABEL_W - 8, cy, text=lbl, anchor="e",
                          fill=RED if emp.has_conflict else TEXT1,
                          font=(FONT, 12))

            if emp.offset != 0:
                s = "+" if emp.offset > 0 else ""
                c.create_text(dx + LABEL_W - 8, cy + 12,
                              text=f"{s}{emp.offset}m",
                              anchor="e",
                              fill=AMBER,
                              font=("Consolas", 9))

            ex = tx(time_to_min(emp.entry))
            sx = tx(time_to_min(emp.exit))
            c.create_rectangle(ex, y + row_h * 0.36,
                               sx, y + row_h * 0.64,
                               fill="#282828", outline="")

            for brk in emp.breaks:
                x1 = tx(brk.start)
                x2 = max(tx(brk.end), x1 + 4)
                col = RED if brk.conflict else BREAK_COLOR[brk.type]
                c.create_rectangle(x1, y + 4, x2, y + row_h - 4,
                                   fill=col, outline="")
                if brk.conflict:
                    c.create_rectangle(x1, y + 4, x2, y + row_h - 4,
                                       outline=RED, width=2)
                if (x2 - x1) > 32:
                    c.create_text((x1 + x2) / 2, cy, anchor="center",
                                  text=f"{brk.duration}m",
                                  fill="#050505",
                                  font=(FONT, 10, "bold"))

    def _compose_whatsapp_vertical_image(self):
        """Imagen estrecha (~1170 px) apilada: tarjetas por empleado + timeline."""
        try:
            from PIL import Image, ImageDraw
        except ImportError:
            return None

        sch = self._scheduled
        if not sch:
            return None

        W = 1170
        Hcanvas = 9000
        mx = 48
        x = mx
        rgb_bg = _pil_rgb(BG)

        img = Image.new("RGB", (W, Hcanvas), rgb_bg)
        dr = ImageDraw.Draw(img)

        ft_title = pil_load_font(52, True)
        ft_name = pil_load_font(40, True)
        ft_body = pil_load_font(34)
        ft_body_b = pil_load_font(34, True)
        ft_small = pil_load_font(30)
        ft_axis = pil_load_font(28)

        def lines(txt: str, wch: int) -> list[str]:
            return textwrap.wrap(txt.strip(), width=max(8, wch)) or [" "]

        yy = 52
        for ln in lines("Horarios de descanso", 20):
            dr.text((x, yy), ln, fill=_pil_rgb(TEXT1), font=ft_title)
            yy = dr.textbbox((x, yy), ln, font=ft_title)[3] + 10
        yy += 6

        dt_now = datetime.now().strftime("%d/%m/%Y  %I:%M %p")
        dr.text((x, yy), dt_now, fill=_pil_rgb(TEXT2), font=ft_small)
        yy = dr.textbbox((x, yy), dt_now, font=ft_small)[3] + 40

        conflict_names = [e.name for e in sch if e.has_conflict]
        if conflict_names:
            for ln in lines(
                    "Conflicto: descansos fuera de turno para "
                    + ", ".join(conflict_names),
                    35,
            ):
                dr.text((x, yy), ln, fill=_pil_rgb(RED), font=ft_small)
                yy = dr.textbbox((x, yy), ln, font=ft_small)[3] + 8
            yy += 34

        for emp in sch:
            dr.line([mx, yy, W - mx, yy], fill=_pil_rgb("#2e2e2e"), width=4)
            yy += 26

            for ln in lines(emp.name, 26):
                dr.text((x, yy), ln, fill=_pil_rgb(TEXT1), font=ft_name)
                yy = dr.textbbox((x, yy), ln, font=ft_name)[3] + 12
            yy += 10

            off = ""
            if emp.offset != 0:
                sgn = "+" if emp.offset > 0 else ""
                off = f"  |  offset {sgn}{emp.offset} min"
            hdr = (
                f"Entrada {time_str_ampm(emp.entry)}   ·   "
                f"Salida {time_str_ampm(emp.exit)}{off}   ·   "
                f"{emp.shift_hours:.1f} h jornada")
            for ln in lines(hdr, 38):
                dr.text((x, yy), ln, fill=_pil_rgb(TEXT2), font=ft_small)
                yy = dr.textbbox((x, yy), ln, font=ft_small)[3] + 12
            yy += 22

            if not emp.breaks:
                dr.text((x, yy), "(Sin descanso asignado)",
                        fill=_pil_rgb(TEXT3), font=ft_body)
                yy = dr.textbbox((x, yy), "(Sin descanso asignado)", font=ft_body)[3] + 44
                continue

            for title, tp, clr in (
                ("Ley Silla 1", "silla1", BLUE),
                ("Break", "break", GREEN),
                ("Ley Silla 2", "silla2", AMBER),
            ):
                sl = self._slot_by_type(emp.breaks, tp)
                if tp == "break" and sl is None:
                    val = "—"
                else:
                    val = format_slot_ampm(sl)

                dr.text((x, yy), title, fill=_pil_rgb(clr), font=ft_body_b)
                yy = dr.textbbox((x, yy), title, font=ft_body_b)[3] + 12
                dr.text((x, yy), val, fill=_pil_rgb(TEXT1), font=ft_body)
                yy = dr.textbbox((x, yy), val, font=ft_body)[3] + 26

            estado = ("CONFLICTO (revisa turno)" if emp.has_conflict else "OK")
            st_clr = RED if emp.has_conflict else GREEN
            dr.text((x, yy), f"Estado: {estado}",
                    fill=_pil_rgb(st_clr), font=ft_body_b)
            yy = dr.textbbox((x, yy), f"Estado: {estado}",
                             font=ft_body_b)[3] + 54

        yy += 32
        dr.text((x, yy), "Timeline de descansos",
                fill=_pil_rgb(TEXT1), font=ft_name)
        yy = dr.textbbox((x, yy), "Timeline de descansos", font=ft_name)[3] + 28

        lx, ly = x, yy
        for _bt, clr in BREAK_COLOR.items():
            dr.rectangle([lx, ly + 8, lx + 40, ly + 42], fill=_pil_rgb(clr))
            dr.text((lx + 50, ly + 13), BREAK_LABEL[_bt],
                    fill=_pil_rgb(TEXT2), font=ft_axis)
            lx += 280
        yy = ly + 58

        all_t = []
        for e in sch:
            all_t.append(time_to_min(e.entry))
            all_t.append(time_to_min(e.exit))
            for b in e.breaks:
                all_t.extend([b.start, b.end])
        min_tt = min(all_t)
        max_tt = max(all_t)
        rng_tt = float(max(max_tt - min_tt, 60))

        LABEL_W = 246
        TW = W - 2 * mx - LABEL_W - 16
        n = len(sch)
        ROW_H = max(60, min(84, max(620 // max(n, 1), 60)))
        PAD_T = 16
        AXIS = 62

        x_grid_l = mx + LABEL_W - 12
        x_grid_r = x_grid_l + TW
        row0_y = yy + PAD_T

        for i in range(n):
            y0 = row0_y + i * ROW_H
            stripe = SURF if i % 2 == 1 else "#111111"
            dr.rectangle([x_grid_l, y0, x_grid_r, y0 + ROW_H],
                         fill=_pil_rgb(stripe))

        def txv(mm: float) -> float:
            return x_grid_l + (mm - min_tt) / rng_tt * TW

        y_bot = row0_y + n * ROW_H
        t0 = int((min_tt // 60 + 1) * 60)
        for tm in range(t0, max_tt + 1, 60):
            xv = txv(tm)
            dr.line([xv, row0_y, xv, y_bot], fill=_pil_rgb("#393939"), width=2)
            dr.text((xv, y_bot + 12), min_to_ampm(tm),
                    fill=_pil_rgb(TEXT2), font=ft_axis, anchor="mt")

        dr.line([x_grid_l, y_bot, x_grid_r, y_bot],
                fill=_pil_rgb("#6a6a6a"), width=3)

        for i, emp in enumerate(sch):
            y0 = row0_y + i * ROW_H
            cy = y0 + ROW_H // 2
            lbl = emp.name[:28] + ("..." if len(emp.name) > 28 else "")
            clr_tx = RED if emp.has_conflict else TEXT2
            dr.text((x_grid_l - 24, cy), lbl, fill=_pil_rgb(clr_tx),
                    font=ft_small, anchor="rm")

            if emp.offset != 0:
                sg = "+" if emp.offset > 0 else ""
                dr.text((x_grid_l - 24, cy + ROW_H // 5),
                        f"{sg}{emp.offset}m", fill=_pil_rgb(AMBER),
                        font=ft_axis, anchor="rm")

            xa = txv(time_to_min(emp.entry))
            xb = txv(time_to_min(emp.exit))
            dr.rectangle([xa, y0 + ROW_H * 0.34, xb, y0 + ROW_H * 0.67],
                         fill=_pil_rgb("#2c2c2c"))

            for brk in emp.breaks:
                x1 = txv(brk.start)
                x2 = max(txv(brk.end), x1 + 6)
                col = RED if brk.conflict else BREAK_COLOR[brk.type]
                dr.rectangle([x1, y0 + 8, x2, y0 + ROW_H - 8],
                             fill=_pil_rgb(col))

        final_bottom = min(y_bot + AXIS + mx, Hcanvas - 10)
        return img.crop((0, 0, W, final_bottom))

    def _compose_phone_table_layout_image(self):
        """Vista tabla para móvil: anchos desde el contenido y saltos por píxeles."""
        try:
            from PIL import Image, ImageDraw
        except ImportError:
            return None

        sch = self._scheduled
        if not sch:
            return None

        mx = 36
        gap = 10
        pad_in = 11
        frame_pad = 3
        line_gap = 6

        meas = Image.new("RGB", (8, 8), (0, 0, 0))
        dx = ImageDraw.Draw(meas)

        f_title = pil_load_font(40, True)
        f_hint = pil_load_font(26)
        f_hdr = pil_load_font(28, True)
        f_nm = pil_load_font(27, True)
        f_mid = pil_load_font(26)
        f_est = pil_load_font(27, True)
        fonts_body = (f_nm, f_mid, f_mid, f_mid, f_mid, f_mid, f_est)

        def row_strings(emp: ScheduledEmployee):
            nombre = emp.name
            if emp.offset != 0:
                sg = "+" if emp.offset > 0 else ""
                nombre = f"{emp.name} ({sg}{emp.offset}m)"
            ent = time_str_ampm(emp.entry) if emp.entry else "—"
            sal = time_str_ampm(emp.exit) if emp.exit else "—"

            if not emp.breaks:
                return nombre, ent, sal, "—", "—", "—", "—"
            s1 = self._slot_by_type(emp.breaks, "silla1")
            bk = self._slot_by_type(emp.breaks, "break")
            s2 = self._slot_by_type(emp.breaks, "silla2")
            return (
                nombre,
                ent,
                sal,
                format_slot_ampm(s1),
                format_slot_ampm(bk) if bk else "—",
                format_slot_ampm(s2),
                ("CONFLICTO" if emp.has_conflict else "OK"),
            )

        row_data: list[tuple[tuple[str, ...], bool]] = [
            (row_strings(emp), emp.has_conflict) for emp in sch]

        extras = (32, 44, 44, 120, 120, 120, 42)
        col_w = [TABLE_COL_MIN_PX[j] + extras[j] for j in range(7)]

        def inner_px(j: int) -> int:
            return max(40, col_w[j] - 2 * pad_in - 2 * frame_pad)

        for __ in range(10):
            changed = False
            for j in range(7):
                iw = inner_px(j)

                widest = 0
                for ln in _pil_text_lines_fit(dx, TABLE_HEADERS[j], f_hdr, iw):
                    widest = max(widest, _pil_line_width(dx, ln, f_hdr))

                fh_j = fonts_body[j]
                for vals, _ in row_data:
                    for ln in _pil_text_lines_fit(dx, vals[j], fh_j, iw):
                        widest = max(widest, _pil_line_width(dx, ln, fh_j))

                need = widest + 2 * pad_in + 2 * frame_pad + 8
                if need > col_w[j]:
                    col_w[j] = need
                    changed = True
            if not changed:
                break

        table_inner_w = sum(col_w) + gap * 6
        dt_now = datetime.now().strftime("%d/%m/%Y  %I:%M %p")
        tit_w = _pil_line_width(dx, "Horarios · vista tabla (móvil)", f_title)

        W = max(
            table_inner_w + 2 * mx,
            mx * 2 + tit_w + 48,
            mx * 2 + _pil_line_width(dx, dt_now, f_hint) + 48,
            940,
        )
        nrows = len(sch)
        Hcanvas = min(9600, 640 + nrows * 178)

        img = Image.new("RGB", (W, Hcanvas), _pil_rgb(BG))
        dr = ImageDraw.Draw(img)

        yy = mx + 18
        dr.text((mx, yy), "Horarios · vista tabla (móvil)",
                fill=_pil_rgb(TEXT1), font=f_title)
        yy = dr.textbbox((mx, yy), "Horarios · vista tabla (móvil)",
                         font=f_title)[3] + 10

        dr.text((mx, yy), dt_now, fill=_pil_rgb(TEXT2), font=f_hint)
        yy = dr.textbbox((mx, yy), dt_now, font=f_hint)[3] + 34

        bad_n = [e.name for e in sch if e.has_conflict]
        if bad_n:
            warn = ("Conflicto: descansos fuera de turno — "
                    + ", ".join(bad_n))
            for wln in _pil_text_lines_fit(dr, warn, f_hint, W - 2 * mx - 16):
                dr.text((mx, yy), wln, fill=_pil_rgb(RED), font=f_hint)
                yy = dr.textbbox((mx, yy), wln, font=f_hint)[3] + 6
            yy += 18

        col_x: list[int] = []
        cx = mx
        for jc in range(7):
            col_x.append(cx)
            cx += col_w[jc] + gap

        hdr_line_sets: list[list[str]] = []
        hdr_row_inner_h: list[int] = []

        for j_, hdr_txt in enumerate(TABLE_HEADERS):
            h_lines = _pil_text_lines_fit(dr, hdr_txt, f_hdr, inner_px(j_))
            hdr_line_sets.append(h_lines)
            h_sum = pad_in + line_gap * max(0, len(h_lines) - 1)
            for ln_h in h_lines:
                bxh = dr.textbbox((0, 0), ln_h, font=f_hdr)
                h_sum += bxh[3] - bxh[1]
            hdr_row_inner_h.append(h_sum + pad_in)

        hdr_row_h = max(52, max(hdr_row_inner_h) + 4)

        y_hdr = yy
        for j_ in range(7):
            x_a = col_x[j_] + frame_pad
            x_b = col_x[j_] + col_w[j_] - frame_pad
            draw_round_rect(
                dr, [x_a, y_hdr, x_b, y_hdr + hdr_row_h], 10,
                fill=_pil_rgb(TBL_HEADER_BG),
                outline=_pil_rgb(BLUE), width=2,
            )

            vy = float(y_hdr + pad_in)
            for ln_h in hdr_line_sets[j_]:
                wln = _pil_line_width(dr, ln_h, f_hdr)
                tx = int((x_a + x_b - wln) / 2)
                dr.text((tx, vy), ln_h, fill=_pil_rgb("#cdd9e5"), font=f_hdr)
                box = dr.textbbox((tx, vy), ln_h, font=f_hdr)
                vy = float(box[3] + line_gap)

        yy = y_hdr + hdr_row_h + 14

        for ri, (vals, is_conf) in enumerate(row_data):
            pal = _table_cell_palette(bool(ri % 2), is_conf)

            cols_lines: list[list[str]] = []
            for jj_, vv in enumerate(vals):
                cols_lines.append(
                    _pil_text_lines_fit(dr, vv, fonts_body[jj_],
                                          inner_px(jj_)))

            cell_hs: list[int] = []
            for jj_, ln_set in enumerate(cols_lines):
                fh_b = fonts_body[jj_]
                h_acc = pad_in + line_gap * max(0, len(ln_set) - 1)
                for ln_b in ln_set:
                    bx2 = dr.textbbox((0, 0), ln_b, font=fh_b)
                    h_acc += bx2[3] - bx2[1]
                cell_hs.append(max(38, h_acc + pad_in))

            rh = max(cell_hs) + 8
            y0 = yy

            for jj_ in range(7):
                x_a = col_x[jj_] + frame_pad
                x_b = col_x[jj_] + col_w[jj_] - frame_pad

                fg_txt = _pil_rgb(TEXT1)
                if is_conf:
                    if jj_ == 6:
                        fg_txt = _pil_rgb("#fde8ea")
                elif jj_ == 6:
                    fg_txt = (
                        _pil_rgb(GREEN) if vals[jj_] == "OK"
                        else _pil_rgb(RED))

                draw_round_rect(
                    dr, [x_a, y0, x_b, y0 + rh], 8,
                    fill=_pil_rgb(pal[jj_]),
                    outline=_pil_rgb(TBL_GRIDLINE),
                    width=1,
                )

                fh_b = fonts_body[jj_]
                lines_cell = cols_lines[jj_]
                bh_sum = pad_in + line_gap * max(0, len(lines_cell) - 1)
                for zb in lines_cell:
                    zb_b = dr.textbbox((0, 0), zb, font=fh_b)
                    bh_sum += zb_b[3] - zb_b[1]
                bh_sum += pad_in

                vy_b = float(y0 + max(pad_in, (rh - int(bh_sum)) // 2))
                for lj in lines_cell:
                    ww = _pil_line_width(dr, lj, fh_b)
                    tx = (x_a + pad_in if jj_ == 0
                          else int((x_a + x_b - ww) / 2))
                    dr.text((tx, vy_b), lj, fill=fg_txt, font=fh_b)
                    jb = dr.textbbox((tx, vy_b), lj, font=fh_b)
                    vy_b = float(jb[3] + line_gap)

            yy += rh + gap

        footer = mx + 26
        return img.crop((0, 0, W, min(int(yy + footer), Hcanvas)))

    # ── Exportar CSV ──────────────────────────────────────────────────────────

    def _export_csv(self):
        ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV", "*.csv"), ("Todos", "*.*")],
            initialfile=f"horarios_{ts}.csv",
            parent=self,
        )
        if not path:
            return

        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["Empleado", "Entrada (24 h)", "Salida (24 h)",
                        "Entrada (AM/PM)", "Salida (AM/PM)",
                        "Ley Silla 1", "Break", "Ley Silla 2", "Estado"])
            for emp in self._scheduled:
                ent_ampm = time_str_ampm(emp.entry) if emp.entry else ""
                sal_ampm = time_str_ampm(emp.exit) if emp.exit else ""
                if not emp.breaks:
                    w.writerow([emp.name, emp.entry, emp.exit, ent_ampm, sal_ampm,
                                "", "", "", "Sin descanso"])
                    continue
                s1 = self._slot_by_type(emp.breaks, "silla1")
                bk = self._slot_by_type(emp.breaks, "break")
                s2 = self._slot_by_type(emp.breaks, "silla2")
                w.writerow([
                    emp.name,
                    emp.entry,
                    emp.exit,
                    ent_ampm,
                    sal_ampm,
                    format_slot_ampm(s1),
                    format_slot_ampm(bk) if bk else "—",
                    format_slot_ampm(s2),
                    "CONFLICTO" if emp.has_conflict else "OK",
                ])

        messagebox.showinfo("Exportado",
                            f"Archivo guardado en:\n{path}", parent=self)

    def _export_region_bbox_screen(self):
        pad = 8
        widgets = []
        if self._alert_visible:
            try:
                if self._alert_frame.winfo_ismapped():
                    widgets.append(self._alert_frame)
            except tk.TclError:
                pass
        for ref in (
            self._schedule_header_row,
            self._table_outer,
            self._tlh_frame,
            self._timeline_outer,
        ):
            if ref is None:
                continue
            try:
                if ref.winfo_ismapped():
                    widgets.append(ref)
            except tk.TclError:
                continue
        if not widgets:
            return None

        xs, ys, xe, ye = [], [], [], []
        for ww in widgets:
            ww.update_idletasks()
            x1 = ww.winfo_rootx()
            y1 = ww.winfo_rooty()
            x2 = x1 + max(ww.winfo_width(), 2)
            y2 = y1 + max(ww.winfo_height(), 2)
            xs.append(x1); ys.append(y1); xe.append(x2); ye.append(y2)

        return (
            max(0, min(xs) - pad),
            max(0, min(ys) - pad),
            max(xe) + pad,
            max(ye) + pad,
        )

    def _export_image_mobile_vertical(self):
        """PNG/JPEG alto y legible en telefono vertical (WhatsApp)."""
        try:
            from PIL import Image
        except ImportError:
            messagebox.showerror(
                "Falta Pillow",
                "Instala la libreria con:\n\npip install pillow\n\n"
                "y vuelve a intentar.",
                parent=self,
            )
            return

        if not self._scheduled:
            messagebox.showwarning(
                "Sin horario",
                "Calcula primero los horarios antes de exportar la imagen.",
                parent=self,
            )
            return

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = filedialog.asksaveasfilename(
            defaultextension=".png",
            filetypes=[
                ("PNG", "*.png"),
                ("JPEG", "*.jpg"),
                ("JPEG", "*.jpeg"),
                ("Todos", "*.*"),
            ],
            initialfile=f"horarios_whatsapp_{ts}.png",
            parent=self,
        )
        if not path:
            return

        pic = self._compose_whatsapp_vertical_image()
        if pic is None:
            messagebox.showerror(
                "Error",
                "No se pudo generar la imagen para movil.", parent=self)
            return

        ext = os.path.splitext(path)[1].lower()
        try:
            if ext in (".jpg", ".jpeg"):
                pic.convert("RGB").save(path, "JPEG", quality=96,
                                        optimize=True)
            elif ext == ".png":
                pic.save(path, "PNG", optimize=True, compress_level=6)
            else:
                path = os.path.splitext(path)[0] + ".png"
                pic.save(path, "PNG", optimize=True, compress_level=6)
        except OSError as e:
            messagebox.showerror("Error al guardar", str(e), parent=self)
            return

        messagebox.showinfo(
            "Exportado",
            f"Imagen optimizada para telefono ({pic.size[0]}x{pic.size[1]} px).\n\n"
            f"{path}",
            parent=self,
        )

    def _export_image_mobile_table(self):
        """Exporta la tabla coloreada a ancho móvil (WhatsApp); distinto del modo tarjetas + timeline."""
        try:
            from PIL import Image
        except ImportError:
            messagebox.showerror(
                "Falta Pillow",
                "Instala la libreria con:\n\npip install pillow\n\n"
                "y vuelve a intentar.",
                parent=self,
            )
            return

        if not self._scheduled:
            messagebox.showwarning(
                "Sin horario",
                "Calcula primero los horarios antes de exportar la imagen.",
                parent=self,
            )
            return

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = filedialog.asksaveasfilename(
            defaultextension=".png",
            filetypes=[
                ("PNG", "*.png"),
                ("JPEG", "*.jpg"),
                ("JPEG", "*.jpeg"),
                ("Todos", "*.*"),
            ],
            initialfile=f"horarios_tabla_movil_{ts}.png",
            parent=self,
        )
        if not path:
            return

        pic = self._compose_phone_table_layout_image()
        if pic is None:
            messagebox.showerror(
                "Error",
                "No se pudo generar la vista tabla para móvil.", parent=self)
            return

        ext = os.path.splitext(path)[1].lower()
        try:
            if ext in (".jpg", ".jpeg"):
                pic.convert("RGB").save(path, "JPEG", quality=96,
                                        optimize=True)
            elif ext == ".png":
                pic.save(path, "PNG", optimize=True, compress_level=6)
            else:
                path = os.path.splitext(path)[0] + ".png"
                pic.save(path, "PNG", optimize=True, compress_level=6)
        except OSError as e:
            messagebox.showerror("Error al guardar", str(e), parent=self)
            return

        messagebox.showinfo(
            "Exportado",
            "Vista tabla para teléfono "
            f"({pic.size[0]}x{pic.size[1]} px).\n\n{path}",
            parent=self,
        )

    def _export_image_wide_screen(self):
        """Captura cabecera, tabla compacta y timeline (recorte ajustado); escala alta para claridad."""
        try:
            from PIL import Image, ImageGrab
        except ImportError:
            messagebox.showerror(
                "Falta Pillow",
                "Instala la libreria con:\n\npip install pillow\n\ny vuelve a intentar.",
                parent=self,
            )
            return

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = filedialog.asksaveasfilename(
            defaultextension=".png",
            filetypes=[
                ("PNG", "*.png"),
                ("JPEG", "*.jpg"),
                ("JPEG", "*.jpeg"),
                ("Todos", "*.*"),
            ],
            initialfile=f"horarios_{ts}.png",
            parent=self,
        )
        if not path:
            return

        self.update_idletasks()
        self.update()
        try:
            self.lift()
            self.focus_force()
            self.update()
        except Exception:
            pass

        bbox = self._export_region_bbox_screen()
        if bbox is None:
            messagebox.showwarning("Sin contenido",
                                   "Agrega empleados antes de exportar.", parent=self)
            return

        try:
            try:
                img = ImageGrab.grab(bbox=bbox, all_screens=True)
            except TypeError:
                img = ImageGrab.grab(bbox=bbox)
        except Exception as e:
            messagebox.showerror("Error al capturar",
                                 f"No se pudo capturar la pantalla:\n{e}", parent=self)
            return

        if img.size[0] < 2 or img.size[1] < 2:
            messagebox.showwarning("Captura vacia",
                                   "Hay un problema con la captura. Reintenta con la ventana visible.",
                                   parent=self)
            return

        scale = 3
        try:
            resample = Image.Resampling.LANCZOS
        except AttributeError:
            resample = getattr(Image, "LANCZOS", 1)

        tgt_w = max(1100, int(img.width * scale))
        tgt_h = max(820, int(img.height * scale))
        img_hi = img.resize((tgt_w, tgt_h), resample)

        ext = os.path.splitext(path)[1].lower()
        try:
            if ext in (".jpg", ".jpeg"):
                img_hi.convert("RGB").save(path, "JPEG", quality=96, optimize=True)
            elif ext == ".png":
                img_hi.save(path, "PNG", optimize=True, compress_level=6)
            else:
                path = os.path.splitext(path)[0] + ".png"
                img_hi.save(path, "PNG", optimize=True, compress_level=6)
        except OSError as e:
            messagebox.showerror("Error al guardar", str(e), parent=self)
            return

        messagebox.showinfo(
            "Exportado",
            f"Imagen guardada a escala alta (aprox. {tgt_w}x{tgt_h} px).\n\n{path}",
            parent=self,
        )


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app = HorariosApp()
    app.mainloop()
