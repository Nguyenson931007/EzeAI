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

class TakeoffExportRequest(BaseModel):
    walls: List[WallInput]
    doors: List[DoorInput]
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

        widths = {"A": 9.57, "B": 22, "C": 14, "D": 13, "E": 13, "F": 9, "G": 15, "H": 4}
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
            merge_and_label(f"A{r}:G{r}", text, font=font, fill=fill, align=center)
            rh(r, 20)

        def add_sub_header(r, text):
            ws.merge_cells(f"A{r}:G{r}")
            ws[f"A{r}"] = text
            ws[f"A{r}"].font = bold
            ws[f"A{r}"].alignment = left_indent
            style_range(f"A{r}:G{r}", fill=subheader_fill, border=True)
            rh(r, 17)

        def add_wall_col_headers(r):
            ws.merge_cells(f"A{r}:C{r}")
            ws[f"A{r}"] = "Description"
            ws[f"D{r}"] = "Length (mm)"
            ws[f"E{r}"] = "Height (mm)"
            ws[f"F{r}"] = "Qty"
            ws[f"G{r}"] = "Area (m2)"
            style_range(f"A{r}:G{r}", font=bold, fill=colhead_fill, align=center)
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

        def add_wall_subtotal(r, label, first, last):
            ws.merge_cells(f"A{r}:F{r}")
            ws[f"A{r}"] = label
            ws[f"A{r}"].font = bold
            ws[f"A{r}"].alignment = right_indent
            ws[f"G{r}"] = f"=SUM(G{first}:G{last})"
            ws[f"G{r}"].number_format = "0.00"
            ws[f"G{r}"].font = bold
            style_range(f"A{r}:G{r}", fill=total_fill, border=True)
            rh(r, 18)

        # ---------- EXTERIOR WALL ----------
        add_section_header(row, "EXTERIOR WALL"); row += 1
        row = add_wall_col_headers(row) + 1
        
        ext_walls = [w for w in request.walls if w.class_name == "exterior_wall"]
        first_ext = row
        if ext_walls:
            for idx, w in enumerate(ext_walls):
                add_wall_data_row(row)
                ws[f"A{row}"] = f"Exterior Wall {w.id}"
                ws[f"D{row}"] = round(w.length_mm)
                ws[f"E{row}"] = round(w.height_mm)
                row += 1
            add_wall_subtotal(row, "Total Exterior Wall Area (m2)", first_ext, row - 1)
        else:
            add_wall_subtotal(row, "Total Exterior Wall Area (m2)", row, row)
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
            for idx, w in enumerate(lb_walls):
                add_wall_data_row(row)
                ws[f"A{row}"] = f"Load Bearing Wall {w.id}"
                ws[f"D{row}"] = round(w.length_mm)
                ws[f"E{row}"] = round(w.height_mm)
                row += 1
            add_wall_subtotal(row, "Subtotal - Load Bearing (m2)", first_lb, row - 1)
        else:
            add_wall_subtotal(row, "Subtotal - Load Bearing (m2)", row, row)
            ws[f"G{row}"] = 0.00
        lb_total_row = row
        row += 1

        # Non-Load Bearing Wall (Currently Empty)
        add_sub_header(row, "Non-Load Bearing Wall"); row += 1
        add_wall_subtotal(row, "Subtotal - Non-Load Bearing (m2)", row, row)
        ws[f"G{row}"] = 0.00
        nlb_total_row = row
        row += 1

        # Total Interior Wall Area
        ws.merge_cells(f"A{row}:F{row}")
        ws[f"A{row}"] = "Total Interior Wall Area (m2)"
        ws[f"A{row}"].font = bold
        ws[f"A{row}"].alignment = right_indent
        ws[f"G{row}"] = f"=G{lb_total_row}+G{nlb_total_row}"
        ws[f"G{row}"].number_format = "0.00"
        ws[f"G{row}"].font = bold
        style_range(f"A{row}:G{row}", fill=total_fill, border=True)
        rh(row, 18)
        int_total_row = row
        row += 2

        # ---------- DOORS ----------
        add_section_header(row, "DOORS"); row += 1

        ws.merge_cells(f"A{row}:C{row}")
        ws[f"A{row}"] = "Door Type / Size"
        ws[f"D{row}"] = "Width (mm)"
        ws[f"E{row}"] = "Height (mm)"
        ws[f"F{row}"] = "Qty"
        ws[f"G{row}"] = "Area (m2)"
        style_range(f"A{row}:G{row}", font=bold, fill=colhead_fill, align=center)
        rh(row, 18)
        row += 1

        def add_door_data_row(r):
            ws.merge_cells(f"A{r}:C{r}")
            for col in ["A", "D", "E", "F", "G"]:
                ws[f"{col}{r}"].border = border_all
                ws[f"{col}{r}"].alignment = center if col != "A" else left_indent
            ws[f"D{r}"].font = input_font
            ws[f"E{r}"].font = input_font
            ws[f"F{r}"].font = input_font
            ws[f"G{r}"] = f'=IF(OR(D{r}="",E{r}=""),"",D{r}*E{r}/1000000*IF(F{r}="",1,F{r}))'
            ws[f"G{r}"].number_format = "0.00"
            rh(r, 17)

        def add_door_subtotal(r, label, first, last):
            ws.merge_cells(f"A{r}:C{r}")
            ws[f"A{r}"] = label
            ws[f"A{r}"].font = bold
            ws[f"A{r}"].alignment = right_indent
            ws[f"F{r}"] = f"=SUM(F{first}:F{last})"
            ws[f"F{r}"].font = bold
            ws[f"F{r}"].alignment = center
            ws[f"G{r}"] = f"=SUM(G{first}:G{last})"
            ws[f"G{r}"].number_format = "0.00"
            ws[f"G{r}"].font = bold
            style_range(f"A{r}:G{r}", fill=total_fill, border=True)
            rh(r, 17)

        # Categorize doors
        grouped_doors = defaultdict(int)
        for d in request.doors:
            t = d.door_type
            grouped_doors[(t, d.width_mm, d.height_mm)] += d.qty

        single_grouped = []
        double_grouped = []
        sliding_grouped = []
        window_grouped = []

        for (t, w_mm, h_mm), qty in grouped_doors.items():
            t_lower = t.lower()
            item = {"width": w_mm, "height": h_mm, "qty": qty}
            if "window" in t_lower:
                window_grouped.append(item)
            elif "double" in t_lower:
                double_grouped.append(item)
            elif "sliding" in t_lower or "slider" in t_lower:
                sliding_grouped.append(item)
            else:
                single_grouped.append(item)

        door_subtotal_rows = []

        # Single Door Section
        add_sub_header(row, "Single Door"); row += 1
        first_single = row
        if single_grouped:
            for item in single_grouped:
                add_door_data_row(row)
                ws[f"A{row}"] = f"Single Door {item['width']}x{item['height']}"
                ws[f"D{row}"] = round(item["width"])
                ws[f"E{row}"] = round(item["height"])
                ws[f"F{row}"] = item["qty"]
                row += 1
            add_door_subtotal(row, "Subtotal - Single Door", first_single, row - 1)
        else:
            add_door_subtotal(row, "Subtotal - Single Door", row, row)
            ws[f"F{row}"] = 0
            ws[f"G{row}"] = 0.00
        door_subtotal_rows.append(row)
        row += 1

        # Double Door Section
        add_sub_header(row, "Double Door"); row += 1
        first_double = row
        if double_grouped:
            for item in double_grouped:
                add_door_data_row(row)
                ws[f"A{row}"] = f"Double Door {item['width']}x{item['height']}"
                ws[f"D{row}"] = round(item["width"])
                ws[f"E{row}"] = round(item["height"])
                ws[f"F{row}"] = item["qty"]
                row += 1
            add_door_subtotal(row, "Subtotal - Double Door", first_double, row - 1)
        else:
            add_door_subtotal(row, "Subtotal - Double Door", row, row)
            ws[f"F{row}"] = 0
            ws[f"G{row}"] = 0.00
        door_subtotal_rows.append(row)
        row += 1

        # Sliding Door Section
        add_sub_header(row, "Sliding Door"); row += 1
        first_sliding = row
        if sliding_grouped:
            for item in sliding_grouped:
                add_door_data_row(row)
                ws[f"A{row}"] = f"Sliding Door {item['width']}x{item['height']}"
                ws[f"D{row}"] = round(item["width"])
                ws[f"E{row}"] = round(item["height"])
                ws[f"F{row}"] = item["qty"]
                row += 1
            add_door_subtotal(row, "Subtotal - Sliding Door", first_sliding, row - 1)
        else:
            add_door_subtotal(row, "Subtotal - Sliding Door", row, row)
            ws[f"F{row}"] = 0
            ws[f"G{row}"] = 0.00
        door_subtotal_rows.append(row)
        row += 1

        # TOTAL DOORS
        ws.merge_cells(f"A{row}:E{row}")
        ws[f"A{row}"] = "TOTAL DOORS"
        ws[f"A{row}"].font = bold
        ws[f"A{row}"].alignment = right_indent
        qty_terms = "+".join([f"F{r}" for r in door_subtotal_rows])
        area_terms = "+".join([f"G{r}" for r in door_subtotal_rows])
        ws[f"F{row}"] = f"={qty_terms}"
        ws[f"F{row}"].font = bold
        ws[f"F{row}"].alignment = center
        ws[f"G{row}"] = f"={area_terms}"
        ws[f"G{row}"].number_format = "0.00"
        ws[f"G{row}"].font = bold
        style_range(f"A{row}:G{row}", fill=total_fill, border=True)
        rh(row, 18)
        door_total_row = row
        row += 2

        # ---------- WINDOWS ----------
        add_section_header(row, "WINDOWS"); row += 1

        ws.merge_cells(f"A{row}:C{row}")
        ws[f"A{row}"] = "Window Type / Size"
        ws[f"D{row}"] = "Width (mm)"
        ws[f"E{row}"] = "Height (mm)"
        ws[f"F{row}"] = "Qty"
        ws[f"G{row}"] = "Area (m2)"
        style_range(f"A{row}:G{row}", font=bold, fill=colhead_fill, align=center)
        rh(row, 18)
        row += 1

        add_sub_header(row, "Standard Window"); row += 1
        first_window = row
        if window_grouped:
            for item in window_grouped:
                add_door_data_row(row)
                ws[f"A{row}"] = f"Window {item['width']}x{item['height']}"
                ws[f"D{row}"] = round(item["width"])
                ws[f"E{row}"] = round(item["height"])
                ws[f"F{row}"] = item["qty"]
                row += 1
            add_door_subtotal(row, "Subtotal - Windows", first_window, row - 1)
        else:
            add_door_subtotal(row, "Subtotal - Windows", row, row)
            ws[f"F{row}"] = 0
            ws[f"G{row}"] = 0.00
        window_total_row = row
        row += 2

        # ---------- SUMMARY ----------
        add_section_header(row, "SUMMARY", fill=dark_fill); row += 1
        sums = [
            ("Total Wall Area - Both Sides (m2)", f"=G{ext_total_row}+G{int_total_row}"),
            ("Total Door Opening Area (m2)", f"=G{door_total_row}"),
            ("Total Door Quantity (pcs)", f"=F{door_total_row}"),
            ("Total Window Opening Area (m2)", f"=G{window_total_row}"),
            ("Total Window Quantity (pcs)", f"=F{window_total_row}"),
        ]
        for label, formula in sums:
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
        ws.print_area = f"A1:G{row+1}"

        # Save to buffer and return bytes
        file_stream = io.BytesIO()
        wb.save(file_stream)
        file_stream.seek(0)
        return file_stream
