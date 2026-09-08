# Reference only — adapt to EzeFloor's existing backend structure.

KATHERINE_STANDARD_STEPS = {
    1: "Cladding",
    2: "Eaves Soffit",
    3: "Flooring & Decking",
    4: "Frame Hardware",
    5: "Insulation",
    6: "Lockup",
    7: "Fixout",
    8: "Final Fit",
    9: "Shelving",
    10: "Timber Post",
    11: "FOW Plumbing",
    12: "Power Truss Braces",
    13: "Hardies Fire Walls",
}


def is_cairns(customer: str | None) -> bool:
    value = str(customer or "").strip().upper()
    return "CAIRNS" in value


def get_expected_hw_steps(manager_code: str | None, customer: str | None):
    manager = str(manager_code or "").strip().upper()

    if manager == "EZE0098":
        if is_cairns(customer):
            return None  # keep EzeFloor's existing Cairns workflow
        return KATHERINE_STANDARD_STEPS

    return None  # keep existing legacy behavior for other managers
