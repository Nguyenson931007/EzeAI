"""Customer/task identity aligned with ProcurementApp's workflow contract.

This registry only describes UI/workflow identity. Product/dropdown rows are
always read from ProcurementApp by exact ``customer_id`` + ``task_key``.
"""

_BUNNINGS_TASKS = [
    ("cladding", "Cladding", "Cladding", "External cladding schedule."),
    ("eaves-soffits", "Eaves Soffit", "Eaves & Soffits", "Eaves and soffits material schedule."),
    ("frame-hardware", "Frame Hardware", "Frame Hardware", "Frame hardware schedule."),
    ("insulation", "Insulation", "Insulation", "Wall and ceiling insulation schedule."),
    ("flooring-gf", "Flooring & Decking - GF", "Flooring & Decking - GF", "Ground-floor flooring and decking schedule."),
    ("flooring-ff", "Flooring & Decking - FF", "Flooring & Decking - FF", "First-floor flooring and decking schedule."),
    ("flooring-sf", "Flooring & Decking - SF", "Flooring & Decking - SF", "Second-floor flooring and decking schedule."),
    ("ground-floor-frame", "Ground Floor Frame", "GROUND FLOOR", "Ground-floor frame schedule."),
    ("first-floor-frame", "First Floor Frame", "FIRST FLOOR", "First-floor frame schedule."),
    ("second-floor-frame", "Second Floor Frame", "SECOND FLOOR", "Second-floor frame schedule."),
    ("third-floor-frame", "Third Floor Frame", "THIRD FLOOR", "Third-floor frame schedule."),
    ("lock-up", "Lockup", "Lock Up", "External doors, windows and lock-up schedule."),
    ("fixout", "Fixout", "Fixout", "Internal doors, jambs, architraves and skirting schedule."),
    ("reveal", "Reveal", "Reveal", "Window and door reveal calculation schedule."),
    ("final-fit", "Final Fit", "Final Fit", "Door furniture and final-fit schedule."),
    ("beams-posts", "Timber Post", "Beams & Posts", "Beam, post and post-support schedule."),
    ("shelving", "Shelving", "Shelving", "Robe and linen shelving schedule."),
    ("fow-plumbing", "FOW Plumbing", "FOW Plumbing", "Whole-of-house plumbing schedule."),
    ("power-truss-braces", "Power Truss Braces", "Power Truss Braces", "Power truss bracing schedule."),
    ("hardies-fire-walls", "Hardies Fire Walls", "Hardies Fire Walls", "Hardies fire wall material schedule."),
]

# ProcurementApp currently exposes the full Bunnings task contract for NSW/ACT,
# VIC and SEQLD. Other modules are discovered from using_find_items until their
# task contracts are promoted in ProcurementApp.
CUSTOMER_TASKS = {
    "BUN-NSW-ACT": _BUNNINGS_TASKS,
    "BUN-VIC": _BUNNINGS_TASKS,
    "BUN-SEQLD": _BUNNINGS_TASKS,
    "BUN-SA": [],
    "BUN-TAS": [],
    "CAIRNS-WOH": [],
    "ATS-FT": [],
    "CQBS": [],
    "GJG-HS": [],
    "DAH-ACT": [],
    "DAH-VIC": [],
    "DAH-NSW": [],
    "LANGS-HW": [],
    "FIN-WOH": [],
    "VBS": [],
}

CUSTOMER_META = {
    "BUN-NSW-ACT": ("Bunnings Trade NSW & ACT State", "BUN NSW/ACT DB-driven"),
    "BUN-VIC": ("Bunnings Trade Victoria State", "Quantities - Bunnings VIC (26.06.2026).xlsm"),
    "BUN-SEQLD": ("Bunnings Trade SEQLD State", "Template - Bunnings QLD (22.07.2026).xlsm"),
    "BUN-SA": ("Bunnings Trade South Australia State", "Bunnings South Australia workbook"),
    "BUN-TAS": ("Bunnings Trade Tasmania State", "Bunnings Tasmania workbook"),
    "CAIRNS-WOH": ("Cairns Hardware Whole Of House", "Cairns Hardware workbook"),
    "ATS-FT": ("ATS Frames & Trusses - Estimating", "ATS Frames & Trusses workbook"),
    "CQBS": ("CQ Building Supplies", "CQ Building Supplies workbook"),
    "GJG-HS": ("GJ Gardner Helensvale South", "GJ Gardner Helensvale South workbook"),
    "DAH-ACT": ("Dahlsens Trade ACT", "Dahlsens ACT workbook"),
    "DAH-VIC": ("Dahlsens Trade Victoria", "Dahlsens Victoria workbook"),
    "DAH-NSW": ("Dahlsens Trade NSW", "Dahlsens NSW workbook"),
    "LANGS-HW": ("Langs Timber - Hardware", "Langs Timber Hardware workbook"),
    "FIN-WOH": ("Finlaysons Trade Whole Of House", "Finlaysons Whole Of House workbook"),
    "VBS": ("Virginia Building Supplies", "Virginia Building Supplies workbook"),
}


def customer_rows():
    """Return ProcurementApp's WorkflowCustomer shape."""
    rows = []
    for code in CUSTOMER_TASKS:
        name, template_file = CUSTOMER_META.get(code, (code, ""))
        tasks = task_rows(code)
        rows.append({
            "id": code,
            "name": name,
            "short_name": code,
            "template_file": template_file,
            "template_type": "Customer-isolated job processing module",
            "description": "Customer-specific workflow and export processing.",
            "api_contract": f"/workflow/customers/{code}/process-job",
            "default_selected_file_ids": [row["id"] for row in tasks],
            "source_template_path": None,
            "tasks": tasks,
            "hardware_files": tasks,
        })
    return rows


def task_rows(customer_id: str):
    return [
        {"id": task_id, "name": name, "sheet": sheet, "description": description}
        for task_id, name, sheet, description in CUSTOMER_TASKS.get(str(customer_id or "").strip(), [])
    ]
