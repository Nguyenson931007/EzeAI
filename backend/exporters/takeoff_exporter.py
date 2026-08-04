import io
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from pydantic import BaseModel
from typing import List, Optional
from collections import defaultdict

# ──────────────────────────────────────────────────────────
# INPUT SCHEMAS
# ──────────────────────────────────────────────────────────

class WallInput(BaseModel):
    id: str
    class_name: str  # 'exterior_wall', 'interior_wall', 'partition_wall'
    length_mm: float
    height_mm: float
    thickness_mm: float

class DoorInput(BaseModel):
    id: str
    door_type: str  # e.g., 'Single Door', 'Double Door', 'Sliding Door', etc.
    width_mm: float
    height_mm: float
    qty: int = 1
    block_work: Optional[str] = "No"
    is_ext: Optional[bool] = False
    location: Optional[str] = "internal"

class LintelInput(BaseModel):
    id: str
    wall_id: Optional[str] = None
    start_offset: Optional[float] = None
    end_offset: Optional[float] = None
    measured_length: float
    final_length: float
    catalog_id: str
    type: str
    size: float
    width: float
    height: float
    description: str
    category: Optional[str] = "lintel"
    lengthOffset: Optional[float] = 0.0

class TakeoffExportRequest(BaseModel):
    walls: List[WallInput]
    doors: List[DoorInput]
    lintels: List[LintelInput] = []
    project_name: Optional[str] = ""
    client_name: Optional[str] = ""
    detailer_name: Optional[str] = ""
    job_no: Optional[str] = ""
    date: Optional[str] = ""

# ──────────────────────────────────────────────────────────
# EXPORTER IMPLEMENTATION
# ──────────────────────────────────────────────────────────

class TakeoffExporter:
    def export(self, request: TakeoffExportRequest) -> io.BytesIO:
        wb = Workbook()
        ws = wb.active
        ws.title = "Material Takeoff"

        FONT_NAME = "Arial"
        thin = Side(style="thin", color="000000")
        border_all = Border(left=thin, right=thin, top=thin, bottom=thin)

        header_fill = PatternFill("solid", fgColor="A6A6A6")
        subheader_fill = PatternFill("solid", fgColor="D9D9D9")
        colhead_fill = PatternFill("solid", fgColor="F2F2F2")
        total_fill = PatternFill("solid", fgColor="FFF2CC")
        grand_fill = PatternFill("solid", fgColor="FFD966")
        dark_fill = PatternFill("solid", fgColor="404040")

        bold = Font(name=FONT_NAME, bold=True, size=11)
        bold_white = Font(name=FONT_NAME, bold=True, size=11, color="FFFFFF")
        normal = Font(name=FONT_NAME, size=11)
        input_font = Font(name=FONT_NAME, size=11, color="0000FF")     # blue = editable input
        italic = Font(name=FONT_NAME, size=10, italic=True, color="404040")
        title_font = Font(name=FONT_NAME, bold=True, size=16)

        center = Alignment(horizontal="center", vertical="center")
        left = Alignment(horizontal="left", vertical="center")
        left_indent = Alignment(horizontal="left", vertical="center", indent=1)
        right_indent = Alignment(horizontal="right", vertical="center", indent=1)

        widths = {"A": 24, "B": 13, "C": 13, "D": 12, "E": 10, "F": 14, "G": 13, "H": 10, "I": 10}
        for col, w in widths.items():
            ws.column_dimensions[col].width = w

        def rh(r, h=18):
            ws.row_dimensions[r].height = h

        def style_range(cell_range, font=None, fill=None, align=None, border=True):
            for row_cells in ws[cell_range]:
                for cell in row_cells:
                    if font: cell.font = font
                    if fill: cell.fill = fill
                    if align: cell.alignment = align
                    if border: cell.border = border_all

        def merge_and_label(cell_range, text, font=bold, fill=None, align=center):
            ws.merge_cells(cell_range)
            ws[cell_range.split(":")[0]] = text
            style_range(cell_range, font=font, fill=fill, align=align)

        row = 1

        # ---------- Title ----------
        ws.merge_cells(f"A{row}:G{row}")
        ws[f"A{row}"] = "WALL & DOOR MATERIAL TAKE-OFF"
        ws[f"A{row}"].font = title_font
        ws[f"A{row}"].alignment = center
        rh(row, 26); row += 1

        ws.merge_cells(f"A{row}:G{row}")
        ws[f"A{row}"] = "For Supplier Quotation Purposes"
        ws[f"A{row}"].font = italic
        ws[f"A{row}"].alignment = center
        row += 2

        # Draw a custom bottom border under row 3 (columns A to G) to stop it at G
        for col in ["A", "B", "C", "D", "E", "F", "G"]:
            ws[f"{col}3"].border = Border(bottom=thin)

        # ---------- Project info ----------
        info_start = row
        ws[f"A{row}"] = "Client:"; ws[f"A{row}"].font = bold
        ws.merge_cells(f"B{row}:C{row}")
        style_range(f"B{row}:C{row}", font=normal)
        ws[f"B{row}"] = request.client_name or ""

        ws[f"D{row}"] = "Job No:"; ws[f"D{row}"].font = bold
        ws.merge_cells(f"E{row}:G{row}")
        style_range(f"E{row}:G{row}", font=normal)
        ws[f"E{row}"] = request.job_no or ""
        rh(row, 18); row += 1

        ws[f"A{row}"] = "Project:"; ws[f"A{row}"].font = bold
        ws.merge_cells(f"B{row}:C{row}")
        style_range(f"B{row}:C{row}", font=normal)
        ws[f"B{row}"] = request.project_name or ""
        rh(row, 18); row += 1

        ws[f"A{row}"] = "Detailer:"; ws[f"A{row}"].font = bold
        ws.merge_cells(f"B{row}:C{row}")
        style_range(f"B{row}:C{row}", font=normal)
        ws[f"B{row}"] = request.detailer_name or ""

        ws[f"D{row}"] = "Date:"; ws[f"D{row}"].font = bold
        ws.merge_cells(f"E{row}:G{row}")
        style_range(f"E{row}:G{row}", font=normal)
        ws[f"E{row}"] = request.date or ""
        rh(row, 18); row += 2

        # ---------- helpers ----------
        def add_section_header(r, text, fill=header_fill, font=bold_white):
            merge_and_label(f"A{r}:I{r}", text, font=font, fill=fill, align=center)
            rh(r, 20)

        def add_sub_header(r, text):
            ws.merge_cells(f"A{r}:I{r}")
            ws[f"A{r}"] = text
            ws[f"A{r}"].font = bold
            ws[f"A{r}"].alignment = left_indent
            style_range(f"A{r}:I{r}", fill=subheader_fill, border=True)
            rh(r, 17)

        def add_wall_col_headers(r):
            ws.merge_cells(f"A{r}:C{r}")
            ws[f"A{r}"] = "Description"
            ws[f"D{r}"] = "Length (mm)"
            ws[f"E{r}"] = "Height (mm)"
            ws[f"F{r}"] = "Qty"
            ws[f"G{r}"] = "Area (m2)"
            ws.merge_cells(f"G{r}:I{r}")
            style_range(f"A{r}:I{r}", font=bold, fill=colhead_fill, align=center)
            rh(r, 18)
            return r

        def add_wall_data_row(r):
            ws.merge_cells(f"A{r}:C{r}")
            for col in ["A", "D", "E", "F", "G"]:
                ws[f"{col}{r}"].border = border_all
                ws[f"{col}{r}"].alignment = center if col != "A" else left_indent
            ws[f"D{r}"].font = input_font
            ws[f"E{r}"].font = input_font
            ws[f"F{r}"].fill = PatternFill("solid", fgColor="E7E6E6")
            ws[f"F{r}"].font = Font(name=FONT_NAME, size=11, color="BFBFBF")
            ws[f"G{r}"].font = normal
            # Area = Length x Height / 1,000,000 x Qty x 2 sides
            ws[f"G{r}"] = f'=IF(OR(D{r}="",E{r}=""),"",D{r}*E{r}/1000000*IF(F{r}="",1,F{r})*2)'
            ws[f"G{r}"].number_format = "0.00"
            rh(r, 17)

        def add_wall_subtotal(r, label, first, last, wall_count=0):
            ws.merge_cells(f"A{r}:C{r}")
            ws[f"A{r}"] = label
            ws[f"A{r}"].font = bold
            ws[f"A{r}"].alignment = right_indent
            # Total Length (mm) in column D
            # Guard against a self-referencing SUM when there are no data rows
            # (first == last == r, i.e. the subtotal row summing itself → circular ref)
            no_data = wall_count == 0 or first == r or last == r
            ws[f"D{r}"] = 0 if no_data else f"=SUM(D{first}:D{last})"
            ws[f"D{r}"].number_format = "#,##0"
            ws[f"D{r}"].font = bold
            ws[f"D{r}"].alignment = center
            # Column E empty
            ws[f"E{r}"] = ""
            ws[f"E{r}"].font = bold
            ws[f"E{r}"].alignment = center
            # Qty (wall count) in column F
            ws[f"F{r}"] = wall_count
            ws[f"F{r}"].font = bold
            ws[f"F{r}"].alignment = center
            # Total Area (m2) in column G
            ws[f"G{r}"] = 0 if no_data else f"=SUM(G{first}:G{last})"
            ws[f"G{r}"].number_format = "0.00"
            ws[f"G{r}"].font = bold
            style_range(f"A{r}:G{r}", fill=total_fill, border=True)
            rh(r, 18)

        height_value_font = Font(name=FONT_NAME, bold=True, size=11, color="006100")  # distinct red = height-group figures

        def add_wall_height_row(r, data_rows, height_mm):
            """Total-style row for walls at a specific height (same font/fill as the grand total row, no label text; values highlighted)."""
            ws.merge_cells(f"A{r}:C{r}")
            ws[f"A{r}"] = ""
            ws[f"A{r}"].font = bold
            ws[f"A{r}"].alignment = right_indent
            # Length sum from non-contiguous rows
            length_parts = "+".join([f"D{dr}" for dr in data_rows])
            ws[f"D{r}"] = f"={length_parts}"
            ws[f"D{r}"].number_format = "#,##0"
            ws[f"D{r}"].font = height_value_font
            ws[f"D{r}"].alignment = center
            # Height column shows the actual height value for this group
            ws[f"E{r}"] = height_mm
            ws[f"E{r}"].number_format = "#,##0"
            ws[f"E{r}"].font = height_value_font
            ws[f"E{r}"].alignment = center
            # Qty = number of walls in this height group
            ws[f"F{r}"] = len(data_rows)
            ws[f"F{r}"].font = height_value_font
            ws[f"F{r}"].alignment = center
            # Area sum from non-contiguous rows
            area_parts = "+".join([f"G{dr}" for dr in data_rows])
            ws[f"G{r}"] = f"={area_parts}"
            ws[f"G{r}"].number_format = "0.00"
            ws[f"G{r}"].font = height_value_font
            style_range(f"A{r}:G{r}", fill=total_fill, border=True)
            rh(r, 18)

        def add_wall_total_from_refs(r, label, ref_rows, wall_count):
            """Total row that sums specific referenced rows (height subtotals)."""
            ws.merge_cells(f"A{r}:C{r}")
            ws[f"A{r}"] = label
            ws[f"A{r}"].font = bold
            ws[f"A{r}"].alignment = right_indent
            # Total Length
            length_parts = "+".join([f"D{rr}" for rr in ref_rows])
            ws[f"D{r}"] = f"={length_parts}"
            ws[f"D{r}"].number_format = "#,##0"
            ws[f"D{r}"].font = bold
            ws[f"D{r}"].alignment = center
            ws[f"E{r}"] = ""
            ws[f"E{r}"].font = bold
            ws[f"E{r}"].alignment = center
            # Qty
            ws[f"F{r}"] = wall_count
            ws[f"F{r}"].font = bold
            ws[f"F{r}"].alignment = center
            # Area
            area_parts = "+".join([f"G{rr}" for rr in ref_rows])
            ws[f"G{r}"] = f"={area_parts}"
            ws[f"G{r}"].number_format = "0.00"
            ws[f"G{r}"].font = bold
            style_range(f"A{r}:G{r}", fill=total_fill, border=True)
            rh(r, 18)

        def write_walls_with_height_groups(walls_list, label_prefix, row_start):
            """Write wall data rows, then (if 2+ distinct heights) height-grouped total-style rows.
            Returns (next_row, height_sub_rows_or_None, first_data_row, last_data_row).
            When only one height is present, height_sub_rows is None and the caller should
            total directly off first_data_row:last_data_row instead."""
            r = row_start
            if not walls_list:
                return r, None, None, None

            first_data_row = r
            height_to_rows = defaultdict(list)
            for w in walls_list:
                add_wall_data_row(r)
                ws[f"A{r}"] = f"{label_prefix} {w.id}"
                ws[f"D{r}"] = round(w.length_mm)
                ws[f"E{r}"] = round(w.height_mm)
                height_to_rows[round(w.height_mm)].append(r)
                r += 1
            last_data_row = r - 1

            # Only break out per-height total-style rows when there's more than one height group
            if len(height_to_rows) < 2:
                return r, None, first_data_row, last_data_row

            height_sub_rows = []
            for h_mm, data_rows in sorted(height_to_rows.items()):
                add_wall_height_row(r, data_rows, h_mm)
                height_sub_rows.append(r)
                r += 1

            return r, height_sub_rows, first_data_row, last_data_row

        # ---------- EXTERIOR WALL ----------
        add_section_header(row, "EXTERIOR WALL"); row += 1
        row = add_wall_col_headers(row) + 1
        
        ext_walls = [w for w in request.walls if w.class_name == "exterior_wall"]
        first_ext = row
        if ext_walls:
            row, ext_height_refs, ext_first_row, ext_last_row = write_walls_with_height_groups(ext_walls, "Exterior Wall", row)
            if ext_height_refs:
                add_wall_total_from_refs(row, "Total Exterior Wall", ext_height_refs, wall_count=len(ext_walls))
            else:
                add_wall_subtotal(row, "Total Exterior Wall", ext_first_row, ext_last_row, wall_count=len(ext_walls))
        else:
            add_wall_subtotal(row, "Total Exterior Wall", row, row, wall_count=0)
            ws[f"G{row}"] = 0.00
        ext_total_row = row
        row += 1

        # ---------- INTERIOR WALL ----------
        add_section_header(row, "INTERIOR WALL"); row += 1
        row = add_wall_col_headers(row) + 1

        # Load Bearing Wall (All interior_walls)
        add_sub_header(row, "Load Bearing Wall"); row += 1
        lb_walls = [w for w in request.walls if w.class_name == "interior_wall"]
        first_lb = row
        if lb_walls:
            row, lb_height_refs, lb_first_row, lb_last_row = write_walls_with_height_groups(lb_walls, "Load Bearing Wall", row)
            if lb_height_refs:
                add_wall_total_from_refs(row, "Subtotal - Load Bearing", lb_height_refs, wall_count=len(lb_walls))
            else:
                add_wall_subtotal(row, "Subtotal - Load Bearing", lb_first_row, lb_last_row, wall_count=len(lb_walls))
        else:
            add_wall_subtotal(row, "Subtotal - Load Bearing", row, row, wall_count=0)
            ws[f"G{row}"] = 0.00
        lb_total_row = row
        row += 1

        # Non-Load Bearing Wall (Partition Walls)
        add_sub_header(row, "Non-Load Bearing Wall"); row += 1
        nlb_walls = [w for w in request.walls if w.class_name == "partition_wall"]
        first_nlb = row
        if nlb_walls:
            row, nlb_height_refs, nlb_first_row, nlb_last_row = write_walls_with_height_groups(nlb_walls, "Partition Wall", row)
            if nlb_height_refs:
                add_wall_total_from_refs(row, "Subtotal - Non-Load Bearing", nlb_height_refs, wall_count=len(nlb_walls))
            else:
                add_wall_subtotal(row, "Subtotal - Non-Load Bearing", nlb_first_row, nlb_last_row, wall_count=len(nlb_walls))
        else:
            add_wall_subtotal(row, "Subtotal - Non-Load Bearing", row, row, wall_count=0)
            ws[f"G{row}"] = 0.00
        nlb_total_row = row
        row += 1

        # Total Interior Wall Area
        int_wall_count = len(lb_walls) + len(nlb_walls)
        ws.merge_cells(f"A{row}:C{row}")
        ws[f"A{row}"] = "Total Interior Wall"
        ws[f"A{row}"].font = bold
        ws[f"A{row}"].alignment = right_indent
        # Total Length (mm) in column D
        ws[f"D{row}"] = f"=D{lb_total_row}+D{nlb_total_row}"
        ws[f"D{row}"].number_format = "#,##0"
        ws[f"D{row}"].font = bold
        ws[f"D{row}"].alignment = center
        # Column E empty
        ws[f"E{row}"] = ""
        ws[f"E{row}"].font = bold
        ws[f"E{row}"].alignment = center
        # Qty (wall count) in column F
        ws[f"F{row}"] = int_wall_count
        ws[f"F{row}"].font = bold
        ws[f"F{row}"].alignment = center
        # Total Area (m2) in column G
        ws[f"G{row}"] = f"=G{lb_total_row}+G{nlb_total_row}"
        ws[f"G{row}"].number_format = "0.00"
        ws[f"G{row}"].font = bold
        style_range(f"A{row}:I{row}", fill=total_fill, border=True)
        rh(row, 18)
        int_total_row = row
        row += 2
        # ---------- DOORS & WINDOWS ----------
        add_section_header(row, "DOORS & WINDOWS"); row += 1

        def add_door_col_headers(r):
            ws[f"A{r}"] = "Description / Size"
            ws[f"B{r}"] = "Height (mm)"
            ws[f"C{r}"] = "Width (mm)"
            ws[f"D{r}"] = "Block Work"
            ws[f"E{r}"] = "Qty"
            ws[f"F{r}"] = "Area (m2)"
            ws[f"G{r}"] = "Perimeter (m)"
            ws[f"H{r}"] = "5.4/2"
            ws[f"I{r}"] = "Reveal"
            style_range(f"A{r}:I{r}", font=bold, fill=colhead_fill, align=center)
            rh(r, 18)
            return r

        add_door_col_headers(row); row += 1

        def add_door_data_row(r, desc, h_mm, w_mm, qty=1, block_work="No"):
            ws[f"A{r}"] = desc
            ws[f"A{r}"].alignment = left_indent
            ws[f"A{r}"].font = normal
            ws[f"A{r}"].border = border_all

            ws[f"B{r}"] = round(h_mm)
            ws[f"B{r}"].alignment = center
            ws[f"B{r}"].font = input_font
            ws[f"B{r}"].border = border_all

            ws[f"C{r}"] = round(w_mm)
            ws[f"C{r}"].alignment = center
            ws[f"C{r}"].font = input_font
            ws[f"C{r}"].border = border_all

            ws[f"D{r}"] = block_work
            ws[f"D{r}"].alignment = center
            ws[f"D{r}"].font = input_font
            ws[f"D{r}"].border = border_all

            # Qty
            ws[f"E{r}"] = qty
            ws[f"E{r}"].alignment = center
            ws[f"E{r}"].font = bold
            ws[f"E{r}"].border = border_all

            # Area = (Height/1000) * (Width/1000) * Qty
            ws[f"F{r}"] = f'=IF(OR(B{r}="",C{r}=""),"",(B{r}/1000)*(C{r}/1000)*E{r})'
            ws[f"F{r}"].number_format = "0.00"
            ws[f"F{r}"].alignment = center
            ws[f"F{r}"].font = normal
            ws[f"F{r}"].border = border_all

            # Perimeter = 2 * (Height/1000 + Width/1000) * Qty
            ws[f"G{r}"] = f'=IF(OR(B{r}="",C{r}=""),"",2*(B{r}/1000+C{r}/1000)*E{r})'
            ws[f"G{r}"].number_format = "0.00"
            ws[f"G{r}"].alignment = center
            ws[f"G{r}"].font = normal
            ws[f"G{r}"].border = border_all

            # 5.4/2 = 2.7 * Qty
            ws[f"H{r}"] = f'=IF(OR(E{r}="",E{r}=0),"",2.7*E{r})'
            ws[f"H{r}"].number_format = "0.0"
            ws[f"H{r}"].alignment = center
            ws[f"H{r}"].font = normal
            ws[f"H{r}"].border = border_all

            # Reveal Count = piecewise condition on 1-door Perimeter * Qty
            ws[f"I{r}"] = f'=IF(OR(B{r}="",C{r}=""),"",IF(2*(B{r}+C{r})/1000=0,0,IF(2*(B{r}+C{r})/1000<=2.7,0.5,IF(2*(B{r}+C{r})/1000<=5.4,1,IF(2*(B{r}+C{r})/1000<=7.5,1.5,IF(2*(B{r}+C{r})/1000<=10.8,2,2.5)))))*E{r})'
            ws[f"I{r}"].number_format = "0.00"
            ws[f"I{r}"].alignment = center
            ws[f"I{r}"].font = bold
            ws[f"I{r}"].border = border_all
            rh(r, 17)

        def add_door_subtotal(r, label, first, last):
            no_data = first > last
            ws.merge_cells(f"A{r}:D{r}")
            ws[f"A{r}"] = label
            ws[f"A{r}"].font = bold
            ws[f"A{r}"].alignment = right_indent

            ws[f"E{r}"] = 0 if no_data else f"=SUM(E{first}:E{last})"
            ws[f"E{r}"].font = bold
            ws[f"E{r}"].alignment = center

            ws[f"F{r}"] = 0 if no_data else f"=SUM(F{first}:F{last})"
            ws[f"F{r}"].number_format = "0.00"
            ws[f"F{r}"].font = bold
            ws[f"F{r}"].alignment = center

            ws[f"G{r}"] = 0 if no_data else f"=SUM(G{first}:G{last})"
            ws[f"G{r}"].number_format = "0.00"
            ws[f"G{r}"].font = bold
            ws[f"G{r}"].alignment = center

            ws[f"H{r}"] = 0 if no_data else f"=SUM(H{first}:H{last})"
            ws[f"H{r}"].number_format = "0.0"
            ws[f"H{r}"].font = bold
            ws[f"H{r}"].alignment = center

            ws[f"I{r}"] = 0 if no_data else f"=SUM(I{first}:I{last})"
            ws[f"I{r}"].number_format = "0.00"
            ws[f"I{r}"].font = bold
            ws[f"I{r}"].alignment = center

            style_range(f"A{r}:I{r}", fill=total_fill, border=True)
            rh(r, 18)

        # Categorize doors
        grouped_doors = defaultdict(int)
        for d in request.doors:
            t = d.door_type
            t_lower = t.lower()
            loc_lower = (d.location or "").lower()
            is_ext = bool(
                d.is_ext or 
                loc_lower in ("ext", "external") or 
                any(k in t_lower for k in ["ext", "exterior", "garage", "sgd", "msd", "entry", "balcony", "alfresco", "patio", "french", "bifold"])
            )
            grouped_doors[(t, d.width_mm, d.height_mm, d.block_work or "No", is_ext)] += d.qty

        single_grouped = []
        double_grouped = []
        sliding_grouped = []
        garage_grouped = []
        window_grouped = []

        for (t, w_mm, h_mm, bw, is_ext), qty in grouped_doors.items():
            t_lower = t.lower()
            item = {"width": w_mm, "height": h_mm, "qty": qty, "block_work": bw, "is_ext": is_ext}
            if "window" in t_lower:
                window_grouped.append(item)
            elif "garage" in t_lower or "roller" in t_lower:
                garage_grouped.append(item)
            elif "double" in t_lower:
                double_grouped.append(item)
            elif "sliding" in t_lower or "slider" in t_lower:
                sliding_grouped.append(item)
            else:
                single_grouped.append(item)

        door_subtotal_rows = []
        int_door_data_rows = []
        ext_door_data_rows = []
        window_data_rows = []

        def calc_reveal_count(h_mm, w_mm, qty):
            p_unit = 2 * (h_mm + w_mm) / 1000.0
            if p_unit == 0: base = 0
            elif p_unit <= 2.7: base = 0.5
            elif p_unit <= 5.4: base = 1.0
            elif p_unit <= 7.5: base = 1.5
            elif p_unit <= 10.8: base = 2.0
            else: base = 2.5
            return base * qty

        blockwork_reveal_count = 0

        # Single Door Section
        add_sub_header(row, "Single Door"); row += 1
        first_single = row
        if single_grouped:
            sorted_single = sorted(single_grouped, key=lambda x: 1 if x.get("is_ext") else 0)
            for item in sorted_single:
                bw = item.get("block_work", "No")
                if bw == "Yes": blockwork_reveal_count += calc_reveal_count(item['height'], item['width'], item['qty'])
                is_ext = item.get("is_ext")
                tag = "External" if is_ext else "Internal"
                if is_ext: ext_door_data_rows.append(row)
                else: int_door_data_rows.append(row)
                add_door_data_row(row, f"Single Door {tag} {item['width']:.1f}x{item['height']:.1f}", item['height'], item['width'], item['qty'], bw)
                row += 1
            add_door_subtotal(row, "Subtotal - Single Door", first_single, row - 1)
        else:
            add_door_subtotal(row, "Subtotal - Single Door", row, row - 1)
        door_subtotal_rows.append(row)
        row += 1

        # Double Door Section
        add_sub_header(row, "Double Door"); row += 1
        first_double = row
        if double_grouped:
            sorted_double = sorted(double_grouped, key=lambda x: 1 if x.get("is_ext") else 0)
            for item in sorted_double:
                bw = item.get("block_work", "No")
                if bw == "Yes": blockwork_reveal_count += calc_reveal_count(item['height'], item['width'], item['qty'])
                is_ext = item.get("is_ext")
                tag = "External" if is_ext else "Internal"
                if is_ext: ext_door_data_rows.append(row)
                else: int_door_data_rows.append(row)
                add_door_data_row(row, f"Double Door {tag} {item['width']:.1f}x{item['height']:.1f}", item['height'], item['width'], item['qty'], bw)
                row += 1
            add_door_subtotal(row, "Subtotal - Double Door", first_double, row - 1)
        else:
            add_door_subtotal(row, "Subtotal - Double Door", row, row - 1)
        door_subtotal_rows.append(row)
        row += 1

        # Sliding Door Section
        add_sub_header(row, "Sliding Door"); row += 1
        first_sliding = row
        if sliding_grouped:
            sorted_sliding = sorted(sliding_grouped, key=lambda x: 1 if x.get("is_ext") else 0)
            for item in sorted_sliding:
                bw = item.get("block_work", "No")
                if bw == "Yes": blockwork_reveal_count += calc_reveal_count(item['height'], item['width'], item['qty'])
                is_ext = item.get("is_ext")
                tag = "External" if is_ext else "Internal"
                if is_ext: ext_door_data_rows.append(row)
                else: int_door_data_rows.append(row)
                add_door_data_row(row, f"Sliding Door {tag} {item['width']:.1f}x{item['height']:.1f}", item['height'], item['width'], item['qty'], bw)
                row += 1
            add_door_subtotal(row, "Subtotal - Sliding Door", first_sliding, row - 1)
        else:
            add_door_subtotal(row, "Subtotal - Sliding Door", row, row - 1)
        door_subtotal_rows.append(row)
        row += 1

        # Garage Door Section
        add_sub_header(row, "Garage Door"); row += 1
        first_garage = row
        if garage_grouped:
            sorted_garage = sorted(garage_grouped, key=lambda x: 1 if x.get("is_ext") else 0)
            for item in sorted_garage:
                bw = item.get("block_work", "No")
                if bw == "Yes": blockwork_reveal_count += calc_reveal_count(item['height'], item['width'], item['qty'])
                is_ext = item.get("is_ext")
                tag = "External" if is_ext else "Internal"
                if is_ext: ext_door_data_rows.append(row)
                else: int_door_data_rows.append(row)
                add_door_data_row(row, f"Garage Door {tag} {item['width']:.1f}x{item['height']:.1f}", item['height'], item['width'], item['qty'], bw)
                row += 1
            add_door_subtotal(row, "Subtotal - Garage Door", first_garage, row - 1)
        else:
            add_door_subtotal(row, "Subtotal - Garage Door", row, row - 1)
        door_subtotal_rows.append(row)
        row += 1

        # TOTAL DOORS
        ws.merge_cells(f"A{row}:D{row}")
        ws[f"A{row}"] = "TOTAL DOORS"
        ws[f"A{row}"].font = bold
        ws[f"A{row}"].alignment = right_indent
        ws[f"E{row}"] = f'={"+".join([f"E{r}" for r in door_subtotal_rows])}'
        ws[f"E{row}"].font = bold
        ws[f"E{row}"].alignment = center
        ws[f"F{row}"] = f'={"+".join([f"F{r}" for r in door_subtotal_rows])}'
        ws[f"F{row}"].number_format = "0.00"
        ws[f"F{row}"].font = bold
        ws[f"F{row}"].alignment = center
        ws[f"G{row}"] = f'={"+".join([f"G{r}" for r in door_subtotal_rows])}'
        ws[f"G{row}"].number_format = "0.00"
        ws[f"G{row}"].font = bold
        ws[f"G{row}"].alignment = center
        ws[f"H{row}"] = f'={"+".join([f"H{r}" for r in door_subtotal_rows])}'
        ws[f"H{row}"].number_format = "0.0"
        ws[f"H{row}"].font = bold
        ws[f"H{row}"].alignment = center
        ws[f"I{row}"] = f'={"+".join([f"I{r}" for r in door_subtotal_rows])}'
        ws[f"I{row}"].number_format = "0.00"
        ws[f"I{row}"].font = bold
        ws[f"I{row}"].alignment = center
        style_range(f"A{row}:I{row}", fill=total_fill, border=True)
        rh(row, 18)
        door_total_row = row
        row += 2

        # ---------- WINDOWS ----------
        add_section_header(row, "WINDOWS"); row += 1
        add_door_col_headers(row); row += 1

        add_sub_header(row, "Standard Window"); row += 1
        first_window = row
        if window_grouped:
            for item in window_grouped:
                bw = item.get("block_work", "No")
                if bw == "Yes": blockwork_reveal_count += calc_reveal_count(item['height'], item['width'], item['qty'])
                window_data_rows.append(row)
                add_door_data_row(row, f"Window {item['width']:.1f}x{item['height']:.1f}", item['height'], item['width'], item['qty'], bw)
                row += 1
            add_door_subtotal(row, "Subtotal - Windows", first_window, row - 1)
        else:
            add_door_subtotal(row, "Subtotal - Windows", row, row - 1)
        window_subtotal_row = row
        window_total_row = row
        row += 2

        # --- Overall Timber Reveal & Area Summary Box (Image 3) ---
        ws.merge_cells(f"A{row}:H{row}")
        ws[f"A{row}"] = "Reveal For Block Work"
        ws[f"A{row}"].font = bold
        ws[f"A{row}"].alignment = right_indent
        ws[f"I{row}"] = blockwork_reveal_count
        ws[f"I{row}"].font = bold
        ws[f"I{row}"].alignment = center
        style_range(f"A{row}:I{row}", fill=PatternFill("solid", fgColor="00BCFF"), border=True)
        rh(row, 18); row += 1

        ws.merge_cells(f"A{row}:H{row}")
        ws[f"A{row}"] = "Total Reveal All"
        ws[f"A{row}"].font = bold
        ws[f"A{row}"].alignment = right_indent
        all_subtotal_rows = door_subtotal_rows + [window_subtotal_row]
        total_reveal_terms = "+".join([f"I{r}" for r in all_subtotal_rows])
        ws[f"I{row}"] = f"={total_reveal_terms}"
        ws[f"I{row}"].font = bold
        ws[f"I{row}"].alignment = center
        style_range(f"A{row}:I{row}", fill=PatternFill("solid", fgColor="00FF00"), border=True)
        rh(row, 18); row += 1

        int_door_terms = "+".join([f"F{r}" for r in int_door_data_rows]) if int_door_data_rows else "0.00"
        ext_door_terms = "+".join([f"F{r}" for r in ext_door_data_rows]) if ext_door_data_rows else "0.00"
        win_terms = "+".join([f"F{r}" for r in window_data_rows]) if window_data_rows else "0.00"

        # Total Area Internal Doors (m2)
        ws.merge_cells(f"A{row}:E{row}")
        ws[f"A{row}"] = "Total Area Internal Doors (m2)"
        ws[f"A{row}"].font = bold
        ws[f"A{row}"].alignment = right_indent
        ws[f"F{row}"] = f"={int_door_terms}"
        ws[f"F{row}"].number_format = "0.00"
        ws[f"F{row}"].font = bold
        ws[f"F{row}"].alignment = center
        ws.merge_cells(f"G{row}:I{row}")
        style_range(f"A{row}:I{row}", fill=PatternFill("solid", fgColor="BFDBFE"), border=True)
        rh(row, 18)
        int_door_area_row = row; row += 1

        # Total Area External Doors (m2)
        ws.merge_cells(f"A{row}:E{row}")
        ws[f"A{row}"] = "Total Area External Doors (m2)"
        ws[f"A{row}"].font = bold
        ws[f"A{row}"].alignment = right_indent
        ws[f"F{row}"] = f"={ext_door_terms}"
        ws[f"F{row}"].number_format = "0.00"
        ws[f"F{row}"].font = bold
        ws[f"F{row}"].alignment = center
        ws.merge_cells(f"G{row}:I{row}")
        style_range(f"A{row}:I{row}", fill=PatternFill("solid", fgColor="BFDBFE"), border=True)
        rh(row, 18)
        ext_door_area_row = row; row += 1

        # Total Area Windows (m2)
        ws.merge_cells(f"A{row}:E{row}")
        ws[f"A{row}"] = "Total Area Windows (m2)"
        ws[f"A{row}"].font = bold
        ws[f"A{row}"].alignment = right_indent
        ws[f"F{row}"] = f"={win_terms}"
        ws[f"F{row}"].number_format = "0.00"
        ws[f"F{row}"].font = bold
        ws[f"F{row}"].alignment = center
        ws.merge_cells(f"G{row}:I{row}")
        style_range(f"A{row}:I{row}", fill=PatternFill("solid", fgColor="BFDBFE"), border=True)
        rh(row, 18)
        win_area_row = row; row += 1

        # Total Area Window and Door Grand Total Row
        ws.merge_cells(f"A{row}:E{row}")
        ws[f"A{row}"] = "Total Area Window and Door (m2)"
        ws[f"A{row}"].font = bold
        ws[f"A{row}"].alignment = right_indent
        ws[f"F{row}"] = f"=F{int_door_area_row}+F{ext_door_area_row}+F{win_area_row}"
        ws[f"F{row}"].number_format = "0.00"
        ws[f"F{row}"].font = bold
        ws[f"F{row}"].alignment = center
        ws.merge_cells(f"G{row}:I{row}")
        style_range(f"A{row}:I{row}", fill=PatternFill("solid", fgColor="93C5FD"), border=True)
        rh(row, 18); row += 2

        # ---------- LINTELS ----------
        add_section_header(row, "LINTELS"); row += 1

        ws.merge_cells(f"A{row}:C{row}")
        ws[f"A{row}"] = "Description"
        ws[f"D{row}"] = "Size"
        ws[f"E{row}"] = "Length (m)"
        ws[f"F{row}"] = "Qty"
        ws[f"G{row}"] = "Total LM"
        ws[f"H{row}"] = "Size/Qty Breakdown"
        style_range(f"A{row}:H{row}", font=bold, fill=colhead_fill, align=center)
        rh(row, 18)
        row += 1

        first_lintel = row
        if request.lintels:
            # Group lintels by catalog Size AND Description (Lintel, Beam, BH)
            by_group = defaultdict(list)
            for l in request.lintels:
                desc_key = l.description if l.description else "Lintel"
                by_group[(l.catalog_id, desc_key)].append(l)

            def size_label(l):
                return f"{int(l.height)}x{int(l.width)}"

            # Sort groups by description first, then by size size_label
            sorted_groups = sorted(
                by_group.keys(),
                key=lambda gkey: (gkey[1], size_label(by_group[gkey][0]))
            )

            for gkey in sorted_groups:
                catalog_id, desc_label = gkey
                items = by_group[gkey]
                size_str = size_label(items[0])

                length_qty = defaultdict(int)
                for l in items:
                    length_qty[l.final_length] += 1
                sorted_lengths = sorted(length_qty.items())

                group_first_row = row
                for length, qty in sorted_lengths:
                    ws.merge_cells(f"A{row}:C{row}")
                    ws[f"A{row}"] = desc_label
                    ws[f"A{row}"].border = border_all
                    ws[f"A{row}"].alignment = left_indent
                    ws[f"A{row}"].font = input_font

                    for col in ["D", "E", "F", "G"]:
                        ws[f"{col}{row}"].border = border_all
                        ws[f"{col}{row}"].alignment = center
                        ws[f"{col}{row}"].font = input_font
                    ws[f"H{row}"].border = border_all

                    ws[f"D{row}"] = size_str
                    ws[f"E{row}"] = length
                    ws[f"E{row}"].number_format = "0.00"
                    ws[f"F{row}"] = qty
                    ws[f"G{row}"] = f"=E{row}*F{row}"
                    ws[f"G{row}"].number_format = "0.00"
                    rh(row, 17)
                    row += 1
                group_last_row = row - 1

                # One copy-paste-ready breakdown per group, e.g. "0.90/1, 1.20/1, 3.00/1"
                breakdown_text = ", ".join(f"{length:.2f}/{qty}" for length, qty in sorted_lengths)
                ws.merge_cells(f"H{group_first_row}:H{group_last_row}")
                ws[f"H{group_first_row}"] = breakdown_text
                ws[f"H{group_first_row}"].font = italic
                ws[f"H{group_first_row}"].alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
                ws[f"H{group_first_row}"].border = border_all

            add_door_subtotal(row, "Subtotal - Lintels", first_lintel, row - 1)
            ws[f"H{row}"].fill = total_fill
            ws[f"H{row}"].border = border_all
        else:
            add_door_subtotal(row, "Subtotal - Lintels", row, row)
            ws[f"F{row}"] = 0
            ws[f"G{row}"] = 0.00
            ws[f"H{row}"].fill = total_fill
            ws[f"H{row}"].border = border_all
        lintel_total_row = row
        row += 2

        # ---------- SUMMARY ----------
        add_section_header(row, "SUMMARY", fill=dark_fill); row += 1

        total_wall_count = len(ext_walls) + len(lb_walls) + len(nlb_walls)

        # Row: Total Wall summary with length, qty, and area
        ws.merge_cells(f"A{row}:C{row}")
        ws[f"A{row}"] = "Total Wall Area - Both Sides (m2)"
        ws[f"A{row}"].font = bold
        ws[f"A{row}"].alignment = right_indent
        ws[f"D{row}"] = f"=D{ext_total_row}+D{int_total_row}"
        ws[f"D{row}"].number_format = "#,##0"
        ws[f"D{row}"].font = bold
        ws[f"D{row}"].alignment = center
        ws[f"E{row}"] = ""
        ws[f"F{row}"] = total_wall_count
        ws[f"F{row}"].font = bold
        ws[f"F{row}"].alignment = center
        ws[f"G{row}"] = f"=G{ext_total_row}+G{int_total_row}"
        ws[f"G{row}"].number_format = "0.00"
        ws[f"G{row}"].font = bold
        style_range(f"A{row}:G{row}", fill=grand_fill, border=True)
        rh(row, 19)
        row += 1

        # Door and window summary rows
        simple_sums = [
            ("Total Internal Door Area (m2)", f"=F{int_door_area_row}"),
            ("Total External Door Area (m2)", f"=F{ext_door_area_row}"),
            ("Total Door Opening Area (m2)", f"=G{door_total_row}"),
            ("Total Door Quantity (pcs)", f"=F{door_total_row}"),
            ("Total Window Opening Area (m2)", f"=G{window_total_row}"),
            ("Total Window Quantity (pcs)", f"=F{window_total_row}"),
            ("Total Lintel Length (LM)", f"=G{lintel_total_row}"),
            ("Total Lintel Quantity (pcs)", f"=F{lintel_total_row}"),
        ]
        for label, formula in simple_sums:
            ws.merge_cells(f"A{row}:F{row}")
            ws[f"A{row}"] = label
            ws[f"A{row}"].font = bold
            ws[f"A{row}"].alignment = right_indent
            ws[f"G{row}"] = formula
            ws[f"G{row}"].number_format = "0.00" if "Area" in label else "0"
            ws[f"G{row}"].font = bold
            style_range(f"A{row}:G{row}", fill=grand_fill, border=True)
            rh(row, 19)
            row += 1

        row += 1

        # ---------- Notes ----------
        ws.merge_cells(f"A{row}:G{row}")
        ws[f"A{row}"].font = italic
        ws[f"A{row}"].alignment = left
        ws.merge_cells(f"A{row+1}:G{row+1}")

        ws.sheet_view.showGridLines = False
        ws.print_area = f"A1:I{row+1}"

        # Save to buffer and return bytes
        file_stream = io.BytesIO()
        wb.save(file_stream)
        file_stream.seek(0)
        return file_stream
