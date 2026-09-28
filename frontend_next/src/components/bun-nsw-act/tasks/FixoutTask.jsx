import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import useCurrentTaskFloorLevel from "./useCurrentTaskFloorLevel";
import FloorLevelGroupRow from "./FloorLevelGroupRow";
import { TaskActionButtons, TaskField as Field, TaskInlineEnteredSection, TaskSummaryTable, TaskEmptyRow, TaskSummaryFooter, TaskRowNumber } from "./TaskUi";
import { createPortal } from "react-dom";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";
import { getActiveClientShortName } from "@/constants/clients";
import { normalizeFloorLevelCode } from "@/utils/floorLevel";
import { isWindowOpening } from "@/utils/procurementAutoFill";
import {
  FIXOUT_HEIGHTS,
  FIXOUT_WIDTHS,
  FIXOUT_CAVITY_HEIGHTS,
  FIXOUT_CAVITY_WIDTHS,
  FIXOUT_WALL_WIDTHS,
  FIXOUT_THICKNESSES,
  FIXOUT_FRAME_TYPES,
  FIXOUT_LIFT_OFF,
  FIXOUT_HANDING,
  FIXOUT_HOLES,
  FIXOUT_FINISHES,
  FIXOUT_DOOR_STOPS,
  FIXOUT_FURNITURE,
  PREHUNG_DOOR_NAMES,
  LOOSE_JAMB_DOOR_NAMES,
  FIXOUT_SMART_ROBE_HEIGHTS,
  FIXOUT_SMART_ROBE_WALLS,
  FIXOUT_FINGER_GRIPS,
  FIXOUT_REVEAL_TYPES,
  FIXOUT_BLOCK_WORK,
  FIXOUT_ROBE_JAMB_SIZES,
  FIXOUT_TRIM_DESCRIPTIONS,
} from "@/constants/procurementFormParity";

// ══════════════════════════════════════════════════════
// INPUT OPTIONS FOR THE FIXOUT DATA-ENTRY FORM
// ══════════════════════════════════════════════════════

const FLOOR_LEVEL_OPTIONS = ["GF", "FF", "SF", "TF", "4F", "5F"];

const LEVEL_SORT_ORDER = {
  GF: 1, "G/F": 1, "GROUND FLOOR": 1, GROUND: 1, "LEVEL 1": 1, "0F": 1,
  FF: 2, "1/F": 2, "1F": 2, "FIRST FLOOR": 2, FIRST: 2, "LEVEL 2": 2,
  SF: 3, "2/F": 3, "2F": 3, "SECOND FLOOR": 3, SECOND: 3, "LEVEL 3": 3,
  TF: 4, "3/F": 4, "3F": 4, "THIRD FLOOR": 4, THIRD: 4, "LEVEL 4": 4,
  "4F": 5, "4/F": 5, "FOURTH FLOOR": 5, FOURTH: 5, "LEVEL 5": 5,
  "5F": 6, "5/F": 6, "FIFTH FLOOR": 6, FIFTH: 6, "LEVEL 6": 6,
  "6F": 7, "6/F": 7, "SIXTH FLOOR": 7, SIXTH: 7, "LEVEL 7": 7,
  "7F": 8, "7/F": 8, "SEVENTH FLOOR": 8, SEVENTH: 8, "LEVEL 8": 8,
  "8F": 9, "8/F": 9, "EIGHTH FLOOR": 9, EIGHTH: 9, "LEVEL 9": 9,
  "9F": 10, "9/F": 10, "NINTH FLOOR": 10, NINTH: 10, "LEVEL 10": 10,
  "10F": 11, "10/F": 11, "TENTH FLOOR": 11, TENTH: 11, "LEVEL 11": 11
};

const getFloorLevelDisplayName = (lvl) => {
  const raw = String(lvl || "").trim().toUpperCase();
  if (raw === "GF" || raw === "G/F" || raw === "GROUND" || raw === "GROUND FLOOR" || raw === "LEVEL 1" || raw === "0F") return "Ground Floor";
  if (raw === "FF" || raw === "1/F" || raw === "1F" || raw === "FIRST" || raw === "FIRST FLOOR" || raw === "LEVEL 2") return "First Floor";
  if (raw === "SF" || raw === "2/F" || raw === "2F" || raw === "SECOND" || raw === "SECOND FLOOR" || raw === "LEVEL 3") return "Second Floor";
  if (raw === "TF" || raw === "3/F" || raw === "3F" || raw === "THIRD" || raw === "THIRD FLOOR" || raw === "LEVEL 4") return "Third Floor";
  if (raw === "4F" || raw === "4/F" || raw === "FOURTH" || raw === "FOURTH FLOOR" || raw === "LEVEL 5") return "Fourth Floor";
  if (raw === "5F" || raw === "5/F" || raw === "FIFTH" || raw === "FIFTH FLOOR" || raw === "LEVEL 6") return "Fifth Floor";
  if (raw === "6F" || raw === "6/F" || raw === "SIXTH" || raw === "SIXTH FLOOR" || raw === "LEVEL 7") return "Sixth Floor";
  if (raw === "7F" || raw === "7/F" || raw === "SEVENTH" || raw === "SEVENTH FLOOR" || raw === "LEVEL 8") return "Seventh Floor";
  if (raw === "8F" || raw === "8/F" || raw === "EIGHTH" || raw === "EIGHTH FLOOR" || raw === "LEVEL 9") return "Eighth Floor";
  if (raw === "9F" || raw === "9/F" || raw === "NINTH" || raw === "NINTH FLOOR" || raw === "LEVEL 10") return "Ninth Floor";
  if (raw === "10F" || raw === "10/F" || raw === "TENTH" || raw === "TENTH FLOOR" || raw === "LEVEL 11") return "Tenth Floor";
  return `${lvl} Floor`;
};

const ROOM_LABELS = [
  "Bed 1", "Bed 2", "Bed 3", "Bed 4", "Bed 5", "Bath", "ENS", "WC", "PDR", "Study", "Media", "Hall", "Garage",
  "Ldry", "Pantry", "WIR", "Master", "Linen", "Robe", "Store", "Broom", "WC 1", "WC 2", "Bath 1", "Bath 2",
  "PDR 1", "PDR 2", "ENS 1", "ENS 2", "ENS 3", "Linen 1", "Linen 2", "Robe 1", "Robe 2", "Robe 3", "Robe 4",
  "Living", "Dining", "Kitchen", "Office", "Meeting", "Kid one", "MPR", "WIP", "WIL", "CPD",
];

const FALLBACK_PREHUNG_INTERNAL_DOORS = PREHUNG_DOOR_NAMES;

const FALLBACK_LOOSE_JAMB_INTERNAL_DOORS = LOOSE_JAMB_DOOR_NAMES;

const OPT = {
  // Cavity and internal-door inputs intentionally use different option lists.
  height: FIXOUT_HEIGHTS,
  width: FIXOUT_WIDTHS,
  cavityHeight: FIXOUT_CAVITY_HEIGHTS,
  cavityWidth: FIXOUT_CAVITY_WIDTHS,
  wallWidth: FIXOUT_WALL_WIDTHS,
  thicks: FIXOUT_THICKNESSES,
  frame: ["None", ...FIXOUT_FRAME_TYPES],
  liftOff: FIXOUT_LIFT_OFF.map((value) => value || "None"),
  handing: FIXOUT_HANDING.map((value) => value || "None"),
  hole: FIXOUT_HOLES.map((value) => value || "None"),
  finish: FIXOUT_FINISHES.map((value) => value || "None"),
  stop: FIXOUT_DOOR_STOPS,
};

const FURNITURE_OPTIONS_BY_MODE = FIXOUT_FURNITURE;

const FURNITURE_CODE_MAP = {
  "CSD Passage Set": "cavity-passage",
  "CSD Privacy Set": "cavity-privacy",
  "Face Door Passage Set": "face-door-passage",
  "Face Door Privacy Set": "face-door-privacy",
  "Passage Set": "passage",
  "Privacy Set": "privacy",
  "Dummy Set": "dummy",
  "Privacy Dummy": "privacy-dummy",
  "Passage Dummy": "passage-dummy",
  "None": "none",
  "none": "none",
  "cavity-passage": "CSD Passage Set",
  "cavity-privacy": "CSD Privacy Set",
  "face-door-passage": "Face Door Passage Set",
  "face-door-privacy": "Face Door Privacy Set",
  "passage": "Passage Set",
  "privacy": "Privacy Set",
  "dummy": "Dummy Set",
  "privacy-dummy": "Privacy Dummy",
  "passage-dummy": "Passage Dummy",
};

const normalizeFurnitureDisplay = (val) => {
  if (!val) return "None";
  if (FURNITURE_CODE_MAP[val]) {
    const mapped = FURNITURE_CODE_MAP[val];
    if (mapped.includes("Set") || mapped.includes("Dummy") || mapped === "None") return mapped;
  }
  return val;
};

const normalizeStopDisplay = (val) => {
  if (!val || val === "none") return "None";
  const s = String(val).toLowerCase();
  if (s.includes("ds2") || s.includes("riser")) return "DS2 with Riser";
  if (s.includes("cushion")) return "Cushion";
  return val;
};

const capitalize = (v) => v ? v.charAt(0).toUpperCase() + v.slice(1) : "None";
const modeLabel = (mode) => {
  const m = String(mode || "").toLowerCase();
  if (m === "cavity" || m.includes("cavity")) return "Cavity sliding";
  if (m === "loose-jamb" || m === "loose" || m.includes("loose")) return "Loose Jamb";
  return "Prehung";
};

// Suggestions for room labels
const ROOM_LABEL_SUGGESTIONS = {
  "Bed 1": ["Privacy Set", "Cushion", "HF"], "Bed 2": ["Passage Set", "Cushion", "HF"],
  "Bed 3": ["Passage Set", "Cushion", "HF"], "Bed 4": ["Passage Set", "Cushion", "HF"],
  "Bed 5": ["Passage Set", "Cushion", "HF"], "Bath": ["Privacy Set", "DS2 with Riser", "HF"],
  "ENS": ["Privacy Set", "DS2 with Riser", "HF"], "WC": ["Privacy Set", "DS2 with Riser", "HF"],
  "PDR": ["Privacy Set", "DS2 with Riser", "HF"], "Study": ["Passage Set", "Cushion", "HF"],
  "Media": ["Passage Set", "Cushion", "HF"], "Hall": ["Passage Set", "Cushion", "HF"],
  "Garage": ["Privacy Set", "Cushion", "HF"], "Ldry": ["Passage Set", "Cushion", "HF"],
  "Pantry": ["Passage Set", "Cushion", "HF"], "WIR": ["Passage Set", "Cushion", "HF"],
  "Master": ["Privacy Set", "Cushion", "HF"], "Linen": ["Dummy Set", "None", "HO"],
  "Robe": ["Dummy Set", "None", "HO"], "Store": ["Dummy Set", "None", "HO"],
  "Broom": ["Dummy Set", "None", "HO"], "WC 1": ["Privacy Set", "DS2 with Riser", "HF"],
  "WC 2": ["Privacy Set", "DS2 with Riser", "HF"], "Bath 1": ["Privacy Set", "DS2 with Riser", "HF"],
  "Bath 2": ["Privacy Set", "DS2 with Riser", "HF"], "PDR 1": ["Privacy Set", "DS2 with Riser", "HF"],
  "PDR 2": ["Privacy Set", "DS2 with Riser", "HF"], "ENS 1": ["Privacy Set", "DS2 with Riser", "HF"],
  "ENS 2": ["Privacy Set", "DS2 with Riser", "HF"], "ENS 3": ["Privacy Set", "DS2 with Riser", "HF"],
  "Linen 1": ["Dummy Set", "None", "HO"], "Linen 2": ["Dummy Set", "None", "HO"],
  "Robe 1": ["Dummy Set", "None", "HO"], "Robe 2": ["Dummy Set", "None", "HO"],
  "Robe 3": ["Dummy Set", "None", "HO"], "Robe 4": ["Dummy Set", "None", "HO"],
  "Living": ["Passage Set", "Cushion", "HF"], "Dining": ["Passage Set", "Cushion", "HF"],
  "Kitchen": ["Passage Set", "Cushion", "HF"], "Office": ["Passage Set", "Cushion", "HF"],
  "Meeting": ["Passage Set", "Cushion", "HF"], "Kid one": ["Passage Set", "Cushion", "HF"],
  "MPR": ["Passage Set", "Cushion", "HF"], "WIP": ["Passage Set", "Cushion", "HF"],
  "WIL": ["Passage Set", "Cushion", "HF"], "CPD": ["Dummy Set", "None", "HO"],
};

const ROOM_SUGGESTION_HOLE_OVERRIDE_HANDINGS = new Set(["SET of THREE", "RH LO", "DBL DOOR SET"]);
const DUMMY_FURNITURE_VARIANT = { "Privacy Set": "Privacy Dummy", "Passage Set": "Passage Dummy" };

function roomSuggestionPatch(mode, label, handing) {
  const base = ROOM_LABEL_SUGGESTIONS[label];
  if (!base || mode === "cavity") return {};
  const [baseFurniture, stop, baseHole] = base;
  if (mode !== "prehung") return { furniture: baseFurniture, stop };
  const hole = ROOM_SUGGESTION_HOLE_OVERRIDE_HANDINGS.has(handing) ? "HO" : baseHole;
  const furniture = handing === "DBL DOOR SET" ? (DUMMY_FURNITURE_VARIANT[baseFurniture] || baseFurniture) : baseFurniture;
  return { furniture, stop, hole };
}

const emptyDraft = (mode) => ({
  label: "",
  doorName: "",
  height: "2040",
  width: "820",
  qty: "1",
  wallWidth: "90",
  thickness: "35",
  frameType: mode === "cavity" ? "Timber Jamb" : "None",
  ezyJamb: "No",
  configuration: "single",
  liftOff: "None",
  handing: "None",
  hole: "None",
  finish: "None",
  furniture: mode === "cavity" ? "CSD Passage Set" : "None",
  stop: mode === "cavity" ? "None" : "None",
});

// ══════════════════════════════════════════════════════
// SHARED STYLES
// ══════════════════════════════════════════════════════

const S = {
  card: {
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    overflow: "visible",
  },
  cardTitle: {
    padding: "10px 14px",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    fontWeight: 800,
    fontSize: "13px",
    color: "#0f2744",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    userSelect: "none",
  },
  sectionHeader: (isOpen) => ({
    padding: "8px 12px",
    background: "#fcfcfd",
    borderBottom: isOpen ? "1px solid #f1f5f9" : "none",
    fontWeight: 700,
    fontSize: "12px",
    color: "#b45309",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    userSelect: "none",
  }),
  fieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: "10px",
    color: "#475569",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  input: {
    padding: "5px 6px",
    fontSize: "11px",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    background: "#ffffff",
    outline: "none",
    boxSizing: "border-box",
    minWidth: "50px",
    height: "28px",
    color: "#0f172a",
    fontWeight: 600,
  },
  select: {
    padding: "4px 6px",
    fontSize: "11px",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    background: "#ffffff",
    outline: "none",
    boxSizing: "border-box",
    cursor: "pointer",
    minWidth: "55px",
    height: "28px",
    color: "#0f172a",
    fontWeight: 600,
  },
  addBtn: {
    padding: "0 14px",
    height: "28px",
    background: "#0f2744",
    color: "#ffffff",
    border: "none",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
    alignSelf: "flex-end",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
    transition: "background 0.15s ease",
  },
  deleteBtn: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#ef4444",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "12px",
    borderRadius: "4px",
    padding: "2px 7px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    transition: "all 0.15s ease",
  },
  editBtn: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#2563eb",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: "11px",
    borderRadius: "4px",
    padding: "2px 6px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  note: {
    fontSize: "10px",
    color: "#94a3b8",
    fontStyle: "italic",
    padding: "6px 2px 2px",
  },
};

// ══════════════════════════════════════════════════════
// COMPACT SEARCHABLE DROPDOWN COMPONENT (Portal-backed)
// ══════════════════════════════════════════════════════

function SearchDropdown({
  label,
  value,
  options = [],
  placeholder = "Select or search...",
  onChange,
  disabled = false,
  width,
  style = {},
  isYellow = false,
  numeric = false,
  allowCustom = true,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, bottom: 0, left: 0, width: 0, dropUp: false });
  const containerRef = useRef(null);

  const isCommittedSelection = options.includes(value);

  const filtered = useMemo(() => {
    if (!open) return options;
    const query = String(value || "").trim().toLowerCase();
    if (!query || isCommittedSelection) return options;
    return options.filter((opt) => String(opt).toLowerCase().includes(query));
  }, [open, options, value, isCommittedSelection]);

  const updatePosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropUp = spaceBelow < 200 && spaceAbove > 150;
      setCoords({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        dropUp,
      });
    }
  }, []);

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
    }
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        const portalMenu = document.getElementById("fixout-search-portal-menu");
        if (portalMenu && portalMenu.contains(e.target)) return;
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  const menuElement = open && !disabled && (
    <div
      id="fixout-search-portal-menu"
      data-search-dropdown="true"
      style={{
        position: "fixed",
        ...(coords.dropUp
          ? { bottom: `${Math.max(6, window.innerHeight - coords.top + 3)}px` }
          : { top: `${coords.bottom + 3}px` }),
        left: `${coords.left}px`,
        zIndex: 999999,
        minWidth: Math.max(120, coords.width || 0),
        maxWidth: "280px",
        maxHeight: coords.dropUp
          ? `${Math.max(80, Math.min(220, coords.top - 12))}px`
          : `${Math.max(80, Math.min(220, window.innerHeight - coords.bottom - 12))}px`,
        overflowY: "auto",
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: "6px",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0, 0, 0, 0.1)",
        padding: "3px 0",
        boxSizing: "border-box",
      }}
    >
      {filtered.length === 0 ? (
        <div style={{ padding: "8px 10px", fontSize: "11px", color: "#94a3b8", fontStyle: "italic", textAlign: "center" }}>
          No matching options
        </div>
      ) : (
        filtered.map((opt, idx) => {
          const isSel = String(opt).toLowerCase() === String(value || "").toLowerCase();
          return (
            <div
              key={`${opt}-${idx}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setOpen(false);
              }}
              style={{
                padding: "5px 10px",
                fontSize: "11px",
                fontWeight: isSel ? 700 : 500,
                color: isSel ? "#1d4ed8" : "#1e293b",
                background: isSel ? "#eff6ff" : "transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
              onMouseEnter={(e) => {
                if (!isSel) e.currentTarget.style.background = "#f8fafc";
              }}
              onMouseLeave={(e) => {
                if (!isSel) e.currentTarget.style.background = "transparent";
              }}
            >
              <span>{opt || "—"}</span>
              {isSel && <span style={{ fontSize: "10px", color: "#2563eb", fontWeight: 800 }}>✓</span>}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      data-search-dropdown="true"
      style={{
        ...S.fieldWrap,
        width: width || "auto",
        flex: width ? `0 0 ${width}` : "1 1 0",
        position: "relative",
        ...style,
      }}
    >
      {label && <span style={S.fieldLabel}>{label}</span>}
      <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
        <input
          type={numeric ? "number" : "text"}
          value={value || ""}
          disabled={disabled}
          onChange={(e) => {
            if (allowCustom || numeric) {
              onChange(e.target.value);
            }
            if (!open) {
              updatePosition();
              setOpen(true);
            }
          }}
          onFocus={() => {
            updatePosition();
            setOpen(true);
          }}
          onClick={() => {
            if (!open) {
              updatePosition();
              setOpen(true);
            }
          }}
          style={{
            ...S.input,
            width: "100%",
            background: isYellow ? "#fffbeb" : "#ffffff",
            paddingRight: value ? "34px" : "20px",
          }}
          placeholder={placeholder}
        />

        <div style={{ position: "absolute", right: "4px", display: "flex", alignItems: "center", gap: "2px" }}>
          {value && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                updatePosition();
                setOpen(true);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: "10px",
                cursor: "pointer",
                padding: "1px 3px",
                lineHeight: 1,
                borderRadius: "50%",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
              title="Clear"
            >
              ✕
            </button>
          )}
          <span
            onClick={() => {
              if (!disabled) {
                updatePosition();
                setOpen((prev) => !prev);
              }
            }}
            style={{
              cursor: "pointer",
              color: "#64748b",
              fontSize: "8px",
              userSelect: "none",
              padding: "2px",
            }}
          >
            {coords.dropUp ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {typeof document !== "undefined" && menuElement ? createPortal(menuElement, document.body) : menuElement}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// CATEGORY SECTION (Cavity / Prehung / Loose-Jamb)
// ══════════════════════════════════════════════════════

function CategorySection({
  mode,
  title,
  addLabel,
  entries,
  onSetEntries,
  floorLevel = "GF",
  doorOptions = [],
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [draft, setDraft] = useState(() => emptyDraft(mode));

  const updateDraft = useCallback((patch) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleLabelChange = useCallback((label) => {
    setDraft((prev) => {
      const patch = roomSuggestionPatch(mode, label, prev.handing);
      return {
        ...prev,
        label,
        ...(patch.furniture ? { furniture: patch.furniture } : {}),
        ...(patch.stop !== undefined ? { stop: patch.stop } : {}),
        ...(patch.hole !== undefined ? { hole: patch.hole } : {}),
      };
    });
  }, [mode]);

  const handleHandingChange = useCallback((handing) => {
    setDraft((prev) => {
      const patch = roomSuggestionPatch(mode, prev.label, handing);
      return {
        ...prev,
        handing,
        ...(patch.furniture ? { furniture: patch.furniture } : {}),
        ...(patch.stop !== undefined ? { stop: patch.stop } : {}),
        ...(patch.hole !== undefined ? { hole: patch.hole } : {}),
      };
    });
  }, [mode]);

  const handleAdd = () => {
    const h = parseFloat(draft.height) || 2040;
    const w = parseFloat(draft.width) || 820;
    const q = parseInt(draft.qty, 10) || 1;
    if (!draft.doorName && !draft.label) return;

    let finalDoorFrame = draft.frameType || "Timber Jamb";
    if (mode === "cavity") {
      finalDoorFrame = draft.ezyJamb === "Yes" ? "Ezy Jamb" : "Timber Jamb";
    }

    const newEntry = {
      id: `fix-${mode}-${Date.now()}`,
      floorLevel: floorLevel || "GF",
      category: mode,
      door_label: draft.label || "",
      door_type: draft.doorName || "",
      height: h,
      width: w,
      thicks: draft.thickness || "35",
      qty: q,
      wall_width: draft.wallWidth || "90",
      door_frame: finalDoorFrame,
      configuration: draft.configuration || "single",
      lift_off_pivot: draft.liftOff === "None" ? "" : (draft.liftOff || ""),
      handing: draft.handing === "None" ? "" : (draft.handing || ""),
      hole: draft.hole === "None" ? "" : (draft.hole || ""),
      finish: draft.finish === "None" ? "" : (draft.finish || ""),
      door_furniture: draft.furniture === "None" ? "none" : (draft.furniture || (mode === "cavity" ? "CSD Passage Set" : "None")),
      door_stop: mode === "cavity" ? "none" : (draft.stop === "None" ? "none" : (draft.stop || "None")),
    };

    if (onSetEntries) {
      onSetEntries((prev) => [...(prev || []), newEntry]);
    }
    setDraft(emptyDraft(mode));
  };

  const isCavity = mode === "cavity";
  const isPrehung = mode === "prehung";
  const isLooseJamb = mode === "loose-jamb";
  const furnitureOpts = FURNITURE_OPTIONS_BY_MODE[mode] || FURNITURE_OPTIONS_BY_MODE.prehung;

  return (
    <div style={{ marginBottom: "6px" }}>
      {/* Subgroup Header */}
      <div onClick={() => setIsOpen(!isOpen)} style={S.sectionHeader(isOpen)}>
        <span>{title}</span>
        <span style={{ fontSize: "11px", color: "#64748b" }}>{isOpen ? "▲" : "▼"}</span>
      </div>

      {isOpen && (
        <div style={{ padding: "8px 10px" }}>
          {/* ── Input Row ── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "flex-end" }}>
            {/* Label */}
            {isCavity ? (
              <Field
                label="Door label"
                value={draft.label}
                width="110px"
                onChange={(v) => updateDraft({ label: v })}
                placeholder="Door label"
              />
            ) : (
              <SearchDropdown
                label="Label"
                value={draft.label}
                options={ROOM_LABELS}
                width="100px"
                onChange={handleLabelChange}
                placeholder="Label"
              />
            )}

            {/* Height */}
            <SearchDropdown
              label="Height"
              value={draft.height}
              options={isCavity ? OPT.cavityHeight : OPT.height}
              width="70px"
              numeric={true}
              onChange={(v) => updateDraft({ height: v })}
              placeholder="2040"
            />

            {/* Door Size / Width */}
            <SearchDropdown
              label={isCavity ? "Door Size" : "Width"}
              value={draft.width}
              options={isCavity ? OPT.cavityWidth : OPT.width}
              width="75px"
              numeric={true}
              onChange={(v) => updateDraft({ width: v })}
              placeholder="820"
            />

            {/* Qty */}
            <Field
              label={isCavity ? "Qty" : "QTY"}
              type="number"
              value={draft.qty}
              width="45px"
              onChange={(v) => updateDraft({ qty: v })}
            />

            {/* Wall Width / Steel Frame Jamb */}
            {isCavity ? (
              <Field
                label="Wall Width"
                type="select"
                value={draft.wallWidth}
                options={OPT.wallWidth}
                width="65px"
                onChange={(v) => updateDraft({ wallWidth: v })}
              />
            ) : (
              <Field
                label="Jamb or Wall for Steel Frame"
                value={draft.wallWidth}
                width="100px"
                placeholder="Jamb/Wall"
                onChange={(v) => updateDraft({ wallWidth: v })}
              />
            )}

            {/* Door Type */}
            <SearchDropdown
              label={isCavity ? "Door Type" : "Type"}
              value={draft.doorName}
              options={doorOptions}
              width="140px"
              onChange={(v) => updateDraft({ doorName: v })}
              placeholder={isCavity ? "Door Type" : "Type"}
            />

            {/* Thicks */}
            <Field
              label="Thicks"
              type="select"
              value={draft.thickness}
              options={OPT.thicks}
              width="55px"
              onChange={(v) => updateDraft({ thickness: v })}
            />

            {/* EzyJamb (for Cavity) or Door Frame (for Prehung / Loose-Jamb) */}
            {isCavity ? (
              <Field
                label="EzyJamb"
                type="select"
                value={draft.ezyJamb}
                options={["No", "Yes"]}
                width="75px"
                onChange={(v) => updateDraft({ ezyJamb: v })}
              />
            ) : (
              <Field
                label="Door Frame"
                type="select"
                value={draft.frameType}
                options={OPT.frame}
                width="95px"
                onChange={(v) => updateDraft({ frameType: v })}
              />
            )}

            {/* Unit Type (Cavity only) */}
            {isCavity && (
              <Field
                label="Unit Type"
                type="select"
                value={draft.configuration}
                options={["single", "double"]}
                optionLabels={{ single: "SINGLE", double: "DBL" }}
                width="80px"
                onChange={(v) => updateDraft({ configuration: v })}
              />
            )}

            {/* Lift Off / Pivot Frame (Prehung / Loose-Jamb) */}
            {!isCavity && (
              <Field
                label="Lift Off / Pivot Frame"
                type="select"
                value={draft.liftOff}
                options={OPT.liftOff}
                width="100px"
                onChange={(v) => updateDraft({ liftOff: v })}
              />
            )}

            {/* Door Stop (Prehung / Loose-Jamb) */}
            {!isCavity && (
              <Field
                label="Door Stop"
                type="select"
                value={draft.stop}
                options={OPT.stop}
                width="90px"
                onChange={(v) => updateDraft({ stop: v })}
              />
            )}

            {/* Door Furniture */}
            <Field
              label="Door Furniture"
              type="select"
              value={draft.furniture}
              options={furnitureOpts}
              width="135px"
              onChange={(v) => updateDraft({ furniture: v })}
            />

            {/* Prehung specific: Hole, Handing, Finish */}
            {isPrehung && (
              <>
                <Field
                  label="Hole"
                  type="select"
                  value={draft.hole}
                  options={OPT.hole}
                  width="55px"
                  onChange={(v) => updateDraft({ hole: v })}
                />
                <Field
                  label="Handing"
                  type="select"
                  value={draft.handing}
                  options={OPT.handing}
                  width="90px"
                  onChange={handleHandingChange}
                />
                <Field
                  label="Finish"
                  type="select"
                  value={draft.finish}
                  options={OPT.finish}
                  width="60px"
                  onChange={(v) => updateDraft({ finish: v })}
                />
              </>
            )}

            {/* Add Button */}
            <button type="button" onClick={handleAdd} style={S.addBtn}>
              + Add door
            </button>
          </div>

          <div style={S.note}>Enter the values above, then add the row to the entered-data table.</div>
        </div>
      )}
    </div>
  );
}


const safeParseJson = (value, fallback) => {
  try {
    if (Array.isArray(value) || (value && typeof value === "object")) return value;
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

function FixoutInputSections({ formData = {}, onChange, doorNames = [] }) {
  const read = (key, fallback = "") => formData?.[key] ?? fallback;
  const write = (key, value) => { if (onChange) onChange("fixout", key, value); };

  const [robeDraft, setRobeDraft] = useState({ label: "", unitHeight: "2040", unitSize: "", wall: "90", type: "", thicks: "16" });
  const [revealDraft, setRevealDraft] = useState({ type: "window", height: "", width: "", blockWork: "No" });
  const [isRobeOpen, setIsRobeOpen] = useState(false);
  const [isTrimOpen, setIsTrimOpen] = useState(false);
  const robeRows = safeParseJson(read("fixout_smart_robe_rows", "[]"), []);
  const revealRows = safeParseJson(read("fixout_reveal_openings", "[]"), []);

  const persistRows = (key, rows) => write(key, JSON.stringify(rows));
  const addRobe = () => {
    if (!robeDraft.label.trim() || !robeDraft.unitSize.trim() || !robeDraft.type.trim()) return;
    const next = [...robeRows, { ...robeDraft, id: `robe-${Date.now()}` }];
    persistRows("fixout_smart_robe_rows", next);
    setRobeDraft({ label: "", unitHeight: "2040", unitSize: "", wall: "90", type: "", thicks: "16" });
  };
  const removeRobe = (index) => persistRows("fixout_smart_robe_rows", robeRows.filter((_, rowIndex) => rowIndex !== index));

  const addReveal = () => {
    if (!String(revealDraft.height).trim() || !String(revealDraft.width).trim()) return;
    const next = [...revealRows, { ...revealDraft, id: `reveal-${Date.now()}` }];
    persistRows("fixout_reveal_openings", next);
    setRevealDraft({ type: "window", height: "", width: "", blockWork: "No" });
  };
  const removeReveal = (index) => persistRows("fixout_reveal_openings", revealRows.filter((_, rowIndex) => rowIndex !== index));

  const fieldStyle = { display: "flex", flexDirection: "column", gap: "3px", minWidth: "90px", flex: "1 1 110px" };
  const labelStyle = { fontSize: "10px", color: "#475569", fontWeight: 700 };
  const inputStyle = { width: "100%", boxSizing: "border-box", height: "29px", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "4px 6px", fontSize: "10.5px", background: "#fff" };
  const cardStyle = { border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", background: "#fff" };
  const titleStyle = { padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontWeight: 800, fontSize: "12px", color: "#0f2744" };

  const trimSelect = (label, key, defaultValue) => (
    <label style={fieldStyle}><span style={labelStyle}>{label}</span><select style={inputStyle} value={read(key, defaultValue)} onChange={(e) => write(key, e.target.value)}>{FIXOUT_TRIM_DESCRIPTIONS.map((v) => <option key={v} value={v === "spec" ? "" : v}>{v}</option>)}</select></label>
  );

  return (
    <>
      <div style={cardStyle}>
        <div onClick={() => setIsRobeOpen((v) => !v)} style={{ ...titleStyle, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", borderBottom: isRobeOpen ? "1px solid #e2e8f0" : "none", cursor: "pointer", userSelect: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", flex: 1 }}>
            <span>2. Smart Robe Door</span>
            <span style={{ fontSize: "11px", color: "#64748b" }}>{isRobeOpen ? "▲" : "▼"}</span>
          </div>
          <label onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px" }}><span>Finger Grips</span><select style={{ ...inputStyle, width: "70px" }} value={read("fixout_smart_robe_finger_grips", "No")} onChange={(e) => write("fixout_smart_robe_finger_grips", e.target.value)}>{FIXOUT_FINGER_GRIPS.map((v) => <option key={v}>{v}</option>)}</select></label>
        </div>
        {isRobeOpen && (
          <div className="fixout-procurement-card-body">
            <div style={{ padding: "10px", display: "flex", gap: "7px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={fieldStyle}><span style={labelStyle}>Label</span><input list="fixout-room-labels-parity" style={inputStyle} value={robeDraft.label} onChange={(e) => setRobeDraft({ ...robeDraft, label: e.target.value })}/></label>
              <label style={fieldStyle}><span style={labelStyle}>Unit Height</span><select style={inputStyle} value={robeDraft.unitHeight} onChange={(e) => setRobeDraft({ ...robeDraft, unitHeight: e.target.value })}>{FIXOUT_SMART_ROBE_HEIGHTS.map((v) => <option key={v}>{v}</option>)}</select></label>
              <label style={fieldStyle}><span style={labelStyle}>Unit Size</span><input style={inputStyle} inputMode="numeric" value={robeDraft.unitSize} onChange={(e) => setRobeDraft({ ...robeDraft, unitSize: e.target.value })}/></label>
              <label style={fieldStyle}><span style={labelStyle}>Wall</span><select style={inputStyle} value={robeDraft.wall} onChange={(e) => setRobeDraft({ ...robeDraft, wall: e.target.value })}>{FIXOUT_SMART_ROBE_WALLS.map((v) => <option key={v}>{v}</option>)}</select></label>
              <label style={{ ...fieldStyle, flex: "2 1 150px" }}><span style={labelStyle}>Type</span><input list="fixout-door-types-parity" style={inputStyle} value={robeDraft.type} onChange={(e) => setRobeDraft({ ...robeDraft, type: e.target.value })}/></label>
              <label style={fieldStyle}><span style={labelStyle}>Thicks</span><input style={inputStyle} inputMode="numeric" value={robeDraft.thicks} onChange={(e) => setRobeDraft({ ...robeDraft, thicks: e.target.value })}/></label>
              <button type="button" onClick={addRobe} style={{ height: "29px", padding: "0 10px", background: "#0f2744", color: "#fff", border: 0, borderRadius: "4px", fontSize: "10.5px", fontWeight: 700 }}>+ Add robe door</button>
              <datalist id="fixout-room-labels-parity">{ROOM_LABELS.map((v) => <option key={v} value={v}/>)}</datalist>
              <datalist id="fixout-door-types-parity">{doorNames.map((v) => <option key={v} value={v}/>)}</datalist>
            </div>

            <TaskInlineEnteredSection title="Entered robe door">
              <TaskSummaryTable className="fixout-summary-robe" compact>
                <thead><tr><th style={{ width: "30px" }}>#</th><th>Label</th><th>Unit Height</th><th>Unit Size</th><th>Wall</th><th>Type</th><th>Thicks</th><th style={{ width: "38px" }}></th></tr></thead>
                <tbody>
                  {robeRows.length === 0 ? (
                    <TaskEmptyRow colSpan={8}>No robe doors entered.</TaskEmptyRow>
                  ) : robeRows.map((row, index) => (
                    <tr key={row.id || index}>
                      <td style={{ textAlign: "center" }}><TaskRowNumber index={index} row={row} /></td>
                      <td>{row.label || "—"}</td><td>{row.unitHeight || "—"}</td><td>{row.unitSize || "—"}</td><td>{row.wall || "—"}</td><td>{row.type || "—"}</td><td>{row.thicks || "—"}</td>
                      <td style={{ textAlign: "center" }}><button type="button" onClick={() => removeRobe(index)} style={S.deleteBtn} title="Delete robe door">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </TaskSummaryTable>
            </TaskInlineEnteredSection>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div onClick={() => setIsTrimOpen((v) => !v)} style={{ ...titleStyle, borderBottom: isTrimOpen ? "1px solid #e2e8f0" : "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
          <span>3. Additional trim measurements</span>
          <span style={{ fontSize: "11px", color: "#64748b" }}>{isTrimOpen ? "▲" : "▼"}</span>
        </div>
        {isTrimOpen && (
          <div className="fixout-trim-groups-eze">
            <section className="fixout-trim-group-eze">
              <div className="fixout-trim-group-title-eze">Reveals</div>
              <div className="fixout-trim-group-grid-eze is-reveals">
                <label style={fieldStyle}><span style={labelStyle}>Type</span><select style={inputStyle} value={revealDraft.type} onChange={(e) => setRevealDraft({ ...revealDraft, type: e.target.value })}>{FIXOUT_REVEAL_TYPES.map((v) => <option key={v} value={v}>{v === "window" ? "Window" : "Door"}</option>)}</select></label>
                <label style={fieldStyle}><span style={labelStyle}>Height</span><input style={inputStyle} inputMode="numeric" value={revealDraft.height} onChange={(e) => setRevealDraft({ ...revealDraft, height: e.target.value })}/></label>
                <label style={fieldStyle}><span style={labelStyle}>Width</span><input style={inputStyle} inputMode="numeric" value={revealDraft.width} onChange={(e) => setRevealDraft({ ...revealDraft, width: e.target.value })}/></label>
                <label style={fieldStyle}><span style={labelStyle}>Block Work</span><select style={inputStyle} value={revealDraft.blockWork} onChange={(e) => setRevealDraft({ ...revealDraft, blockWork: e.target.value })}>{FIXOUT_BLOCK_WORK.map((v) => <option key={v}>{v}</option>)}</select></label>
                <button type="button" onClick={addReveal} style={{ height: "29px", padding: "0 10px", background: "#0f2744", color: "#fff", border: 0, borderRadius: "4px", fontSize: "10.5px", fontWeight: 700 }}>+ Add opening</button>
              </div>
              <TaskInlineEnteredSection title="Entered reveals">
                <TaskSummaryTable className="fixout-summary-openings" compact>
                  <thead><tr><th style={{ width: "30px" }}>#</th><th>Type</th><th>Height</th><th>Width</th><th>Block Work</th><th style={{ width: "38px" }}></th></tr></thead>
                  <tbody>
                    {revealRows.length === 0 ? (
                      <TaskEmptyRow colSpan={6}>No window/door openings entered.</TaskEmptyRow>
                    ) : revealRows.map((row, index) => (
                      <tr key={row.id || index}>
                        <td style={{ textAlign: "center" }}><TaskRowNumber index={index} row={row} /></td><td style={{ textTransform: "capitalize" }}>{row.type || "—"}</td><td>{row.height || "—"}</td><td>{row.width || "—"}</td><td>{row.blockWork || "—"}</td>
                        <td style={{ textAlign: "center" }}><button type="button" onClick={() => removeReveal(index)} style={S.deleteBtn} title="Delete opening">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </TaskSummaryTable>
              </TaskInlineEnteredSection>
            </section>

            <section className="fixout-trim-group-eze">
              <div className="fixout-trim-group-title-eze">Architrave</div>
              <div className="fixout-trim-group-grid-eze">
                <label style={fieldStyle}><span style={labelStyle}>Extras architrave</span><input style={inputStyle} inputMode="decimal" value={read("fixout_arch_extra_lengths", "0")} onChange={(e) => write("fixout_arch_extra_lengths", e.target.value)}/></label>
                {trimSelect("Architrave Type", "fixout_arch_description", "MDF DAR PRIMED++42X18MM 5.4M")}
              </div>
            </section>

            <section className="fixout-trim-group-eze">
              <div className="fixout-trim-group-title-eze">Skirting</div>
              <div className="fixout-trim-group-grid-eze">
                <label style={fieldStyle}><span style={labelStyle}>Skirting</span><input style={inputStyle} inputMode="decimal" value={read("fixout_skirting_lm", "0")} onChange={(e) => write("fixout_skirting_lm", e.target.value)}/></label>
                {trimSelect("Skirting Type", "fixout_skirting_description", "MDF DAR PRIMED++67X18MM 5.4M")}
              </div>
            </section>

            <section className="fixout-trim-group-eze">
              <div className="fixout-trim-group-title-eze">Robe &amp; Linen</div>
              <div className="fixout-trim-group-grid-eze">
                <label style={fieldStyle}><span style={labelStyle}>Robe Count</span><input style={inputStyle} inputMode="numeric" value={read("fixout_robe_count", "0")} onChange={(e) => write("fixout_robe_count", e.target.value)}/></label>
                <label style={fieldStyle}><span style={labelStyle}>Robe/Linen jamb size</span><select style={inputStyle} value={read("fixout_robe_jamb_size", "112x19")} onChange={(e) => write("fixout_robe_jamb_size", e.target.value)}>{FIXOUT_ROBE_JAMB_SIZES.map((v) => <option key={v}>{v}</option>)}</select></label>
              </div>
            </section>

            <section className="fixout-trim-group-eze">
              <div className="fixout-trim-group-title-eze">Wet Areas</div>
              <div className="fixout-trim-group-grid-eze">
                <label style={fieldStyle}><span style={labelStyle}>Wet-area architrave</span><input style={inputStyle} inputMode="decimal" value={read("fixout_wet_arch_lengths", "0")} onChange={(e) => write("fixout_wet_arch_lengths", e.target.value)}/></label>
                {trimSelect("Wet-area Architrave Type", "fixout_arch-wet_description", "MDF DAR PRIMED++42X18MM 5.4M")}
                <label style={fieldStyle}><span style={labelStyle}>Wet-area skirting</span><input style={inputStyle} inputMode="decimal" value={read("fixout_wet_skirting_lm", "0")} onChange={(e) => write("fixout_wet_skirting_lm", e.target.value)}/></label>
                {trimSelect("Wet-area Skirting Type", "fixout_skirting-wet_description", "MDF DAR PRIMED++67X18MM 5.4M")}
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════
// MAIN FIXOUT TASK COMPONENT
// ══════════════════════════════════════════════════════

export default function FixoutTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber,
  onClearData,
  onMoveDoorTask
}) {
  const { user, currentJobId, currentProjectName } = useAppModel();
  const activeCustomerShortName = getActiveClientShortName();

  const floorLevel = useCurrentTaskFloorLevel(formData);
  const [isDoorInformationOpen, setIsDoorInformationOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [reloadMsg, setReloadMsg] = useState(null);

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const editingRowIdRef = useRef(null);
  const editRowDataRef = useRef({});
  const entriesRef = useRef(entries);
  const loadedJobRef = useRef(null);

  const [prehungDoors, setPrehungDoors] = useState(FALLBACK_PREHUNG_INTERNAL_DOORS);
  const [looseJambDoors, setLooseJambDoors] = useState(FALLBACK_LOOSE_JAMB_INTERNAL_DOORS);

  const totalCount = (entries || []).length;
  useEffect(() => {
    editingRowIdRef.current = editingRowId;
  }, [editingRowId]);

  useEffect(() => {
    editRowDataRef.current = editRowData;
  }, [editRowData]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Load dropdown options from backend
  useEffect(() => {
    let isMounted = true;
    const loadOptions = async () => {
      try {
        let data = null;
        if (ApiService.getLockoutOptions) {
          const res = await ApiService.getLockoutOptions(activeCustomerShortName);
          data = res?.data || res;
        } else if (ApiService.getLockoutDoorTypes) {
          const res = await ApiService.getLockoutDoorTypes(activeCustomerShortName);
          data = res?.data || res;
        } else {
          const res = await fetch(`/api/lockout/options?customer_id=${encodeURIComponent(activeCustomerShortName)}`);
          if (res.ok) {
            const json = await res.json();
            data = json?.data || json;
          }
        }

        if (isMounted && data) {
          // Prefer current dropdown values from the backend; use local options
          // only when the backend returns no values.
          const rawPrehung = Array.isArray(data.prehung_internal) && data.prehung_internal.length > 0
            ? data.prehung_internal
            : (Array.isArray(data.internal) && data.internal.length > 0 ? data.internal : []);
          setPrehungDoors(rawPrehung.length > 0
            ? Array.from(new Set(rawPrehung.map((value) => String(value).trim()).filter(Boolean)))
            : FALLBACK_PREHUNG_INTERNAL_DOORS);

          const rawLoose = Array.isArray(data.loose_jamb_internal) && data.loose_jamb_internal.length > 0
            ? data.loose_jamb_internal
            : (Array.isArray(data.internal) && data.internal.length > 0 ? data.internal : []);
          setLooseJambDoors(rawLoose.length > 0
            ? Array.from(new Set(rawLoose.map((value) => String(value).trim()).filter(Boolean)))
            : FALLBACK_LOOSE_JAMB_INTERNAL_DOORS);
        }
      } catch (err) {
        console.warn("[FixoutTask] Could not fetch options from backend, using fallbacks:", err);
      }
    };

    loadOptions();
    return () => { isMounted = false; };
  }, [activeCustomerShortName]);

  // Group entries by FloorLevel
  const groupedDoorsByLevel = useMemo(() => {
    const groups = {};
    (entries || []).forEach((item) => {
      const lvl = normalizeFloorLevelCode(item.floorLevel || item.floor_level || "GF");
      if (!groups[lvl]) {
        groups[lvl] = [];
      }
      groups[lvl].push(item);
    });

    const sortedLevels = Object.keys(groups).sort((a, b) => {
      const orderA = LEVEL_SORT_ORDER[a] || 99;
      const orderB = LEVEL_SORT_ORDER[b] || 99;
      return orderA - orderB;
    });

    return sortedLevels.map((lvl) => ({
      level: lvl,
      items: groups[lvl],
    }));
  }, [entries]);

  const handleStartEdit = (item) => {
    setEditingRowId(item.id);
    const isCavity = (item.category || "cavity") === "cavity";
    const isEzyJamb = item.door_frame === "Ezy Jamb" || item.door_frame === "Eze Jamb";
    setEditRowData({
      ...item,
      floorLevel: item.floorLevel || item.floor_level || "GF",
      ezyJamb: isCavity ? (isEzyJamb ? "Yes" : "No") : "No",
    });
  };

  const handleSaveInlineEdit = (idToSave) => {
    const targetId = idToSave || editingRowIdRef.current;
    if (!targetId || !onSetEntries) return;
    const currentData = editRowDataRef.current;
    const q = parseInt(currentData.qty, 10) || 1;
    const isCavity = (currentData.category || "cavity") === "cavity";

    let finalDoorFrame = currentData.door_frame || "Timber Jamb";
    if (isCavity) {
      finalDoorFrame = currentData.ezyJamb === "Yes" ? "Ezy Jamb" : "Timber Jamb";
    }

    onSetEntries((prev) => {
      const currentList = Array.isArray(prev) ? prev : (entriesRef.current || []);
      return currentList.map((item) => (item.id === targetId ? {
        ...item,
        ...currentData,
        floorLevel: currentData.floorLevel || item.floorLevel || item.floor_level || "GF",
        door_frame: finalDoorFrame,
        qty: q,
      } : item));
    });
    setEditingRowId(null);
  };

  // Auto-save on outside click
  useEffect(() => {
    const handleDocumentMouseDown = (e) => {
      if (!editingRowIdRef.current) return;
      const editingTr = document.querySelector(`[data-editing-row-id="${editingRowIdRef.current}"]`);
      if (!editingTr) return;

      const path = e.composedPath ? e.composedPath() : [];
      const isInsideEditingTr = path.some((el) => 
        el === editingTr || 
        (el.getAttribute && (
          el.getAttribute("data-editing-row-id") === String(editingRowIdRef.current) ||
          el.getAttribute("data-search-dropdown") === "true"
        ))
      );

      if (isInsideEditingTr || (e.target && editingTr.contains(e.target))) {
        return;
      }

      handleSaveInlineEdit(editingRowIdRef.current);
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
    };
  }, []);

  const handleReloadFromDb = async (force = true) => {
    const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim();
    if (!force && (!target || target.toLowerCase() === "default" || target.toLowerCase() === "testai")) return;
    setIsLoadingDb(true);
    setReloadMsg(null);

    try {
      const res = await ApiService.fetchFixoutJobs(target);
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        const loaded = res.data
          .filter((r) => !isWindowOpening(r) && (r.door_label || r.door_type || r.height || r.width))
          .map((r, idx) => ({
            id: `fix-${r.fixout_id || Date.now()}-${idx}`,
            floorLevel: r.floor_level || r.floorLevel || "GF",
            category: r.category || "cavity",
            door_label: r.door_label || "",
            door_type: r.door_type || "",
            height: r.height || 2040,
            width: r.width || 820,
            thicks: r.thicks ? String(r.thicks) : "35",
            wall_width: r.wall_width ? String(r.wall_width) : "90",
            door_frame: r.door_frame || "Timber Jamb",
            lift_off_pivot: r.lift_off_pivot || "",
            handing: r.handing || "",
            hole: r.hole || "",
            finish: r.finish || "",
            door_furniture: r.door_furniture || (r.category === "cavity" ? "CSD Passage Set" : "None"),
            door_stop: r.door_stop || "None",
            qty: r.qty || 1,
          }));

        if (loaded.length > 0 && onSetEntries) {
          onSetEntries(loaded);
          const first = loaded[0];
          if (first && first.floorLevel) {
          }
          if (force) {
            setReloadMsg({ type: "success", text: `Loaded ${loaded.length} ${loaded.length === 1 ? "door" : "doors"} from SQL` });
          }
        } else {
          if (force) {
            setReloadMsg({ type: "info", text: "No saved data found in SQL" });
          }
        }
      } else {
        if (force) {
          setReloadMsg({ type: "info", text: "No data returned from SQL" });
        }
      }
    } catch (err) {
      console.error("Error loading Fixout from SQL:", err);
      if (force) {
        setReloadMsg({ type: "error", text: "SQL connection error" });
      }
    } finally {
      setIsLoadingDb(false);
      if (force) {
        setTimeout(() => setReloadMsg(null), 3500);
      }
    }
  };

  // Auto-load saved Fixout entries from DB if empty on job load
  useEffect(() => {
    const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim();
    if (!target || target.toLowerCase() === "default" || target.toLowerCase() === "testai") return;
    if (entries && entries.length > 0) return;
    if (loadedJobRef.current === target) return;
    loadedJobRef.current = target;

    handleReloadFromDb(false);
  }, [activeJobNumber, currentProjectName, currentJobId, entries]);

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries((prev) => (prev || []).filter((e) => e.id !== id));
    }
    if (editingRowId === id) {
      setEditingRowId(null);
      setEditRowData({});
    }
    if (selectedEntryId === id) {
      setSelectedEntryId(null);
    }
  };

  const handleSave = async () => {
    if (!entries || entries.length === 0) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const items = (entries || []).filter((item) => !isWindowOpening(item)).map((item) => ({
        floor_level: item.floorLevel || item.floor_level || "GF",
        category: item.category || null,
        door_label: item.door_label || null,
        door_type: item.door_type || null,
        height: item.height || null,
        width: item.width || null,
        thicks: item.thicks || null,
        wall_width: item.wall_width || null,
        door_frame: item.door_frame || null,
        lift_off_pivot: item.lift_off_pivot || null,
        handing: item.handing || null,
        hole: item.hole || null,
        finish: item.finish || null,
        door_furniture: item.door_furniture || null,
        door_stop: item.door_stop || null,
        qty: item.qty || 1,
      }));

      const targetJob = activeJobNumber || currentProjectName || currentJobId || "TestAI";
      const payload = {
        user_update: user?.username || user?.name || "admin",
        jobs: [
          {
            id_job_hw: String(targetJob),
            fixout_items: items,
          },
        ],
      };

      const res = await ApiService.saveFixoutJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        alert(res?.detail || res?.message || "Could not save Fixout records to database.");
      }
    } catch (err) {
      console.error("Save Fixout error:", err);
      alert("Error saving Fixout to database: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      <div style={S.card}>
        <div
          onClick={() => setIsDoorInformationOpen((v) => !v)}
          style={{ ...S.cardTitle, cursor: "pointer", userSelect: "none" }}
        >
          <span>1. Door information</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {reloadMsg && (
              <span style={{
                fontSize: "11px",
                fontWeight: 700,
                color: reloadMsg.type === "success" ? "#16a34a" : (reloadMsg.type === "error" ? "#dc2626" : "#2563eb")
              }}>
                {reloadMsg.text}
              </span>
            )}
            <TaskActionButtons
              onAutoFill={() => onAddDataAI?.("fixout")}
              onClear={onClearData}
              onSave={handleSave}
              saveDisabled={isSaving}
              saveStatus={isSaving ? "saving" : saveSuccess ? "success" : "idle"}
            />
            <span style={{ fontSize: "11px", color: "#64748b" }}>{isDoorInformationOpen ? "▲" : "▼"}</span>
          </div>
        </div>

        {isDoorInformationOpen && (
          <div style={{ padding: "8px" }}>

            <CategorySection
              mode="cavity"
              title="Cavity Sliding Door"
              addLabel="+ Add door"
              entries={entries}
              onSetEntries={onSetEntries}
              floorLevel={floorLevel}
              doorOptions={looseJambDoors}
            />
            <CategorySection
              mode="prehung"
              title="Internal prehung doors"
              addLabel="+ Add door"
              entries={entries}
              onSetEntries={onSetEntries}
              floorLevel={floorLevel}
              doorOptions={prehungDoors}
            />
            <CategorySection
              mode="loose-jamb"
              title="Internal loose-jamb doors"
              addLabel="+ Add door"
              entries={entries}
              onSetEntries={onSetEntries}
              floorLevel={floorLevel}
              doorOptions={looseJambDoors}
            />


          </div>
        )}
      </div>

      <FixoutInputSections formData={formData} onChange={onChange} doorNames={prehungDoors} />


      <TaskInlineEnteredSection
        title="4. Entered doors"
        footer={(
          <TaskSummaryFooter right={saveSuccess ? <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ Saved to SQL!</span> : null}>
            {totalCount} {totalCount === 1 ? "door item" : "door items"} entered
          </TaskSummaryFooter>
        )}
      >
        <TaskSummaryTable className="fixout-summary-main" minWidth="2050px">
          <thead>
            <tr>
              <th style={{ width: "38px", textAlign: "center" }}>#</th>
              <th style={{ width: "92px" }}>Label</th>
              <th style={{ width: "92px" }}>Task</th>
              <th style={{ width: "105px" }}>Door Type</th>
              <th style={{ width: "72px", textAlign: "center" }}>Height</th>
              <th style={{ width: "72px", textAlign: "center" }}>Width</th>
              <th style={{ width: "66px", textAlign: "center" }}>Thicks</th>
              <th style={{ width: "92px" }}>Jamb / wall</th>
              <th style={{ width: "108px" }}>Jamb Size</th>
              <th style={{ width: "92px" }}>Hung</th>
              <th style={{ width: "150px" }}>Type</th>
              <th style={{ width: "70px" }}>HF/HO</th>
              <th style={{ width: "82px" }}>Color</th>
              <th style={{ width: "118px" }}>Stop</th>
              <th style={{ width: "150px" }}>Door Furniture</th>
              <th style={{ width: "55px", textAlign: "center" }}>Qty</th>
              <th style={{ width: "42px" }}></th>
            </tr>
          </thead>
          <tbody>
            {totalCount === 0 ? (
              <TaskEmptyRow colSpan={17}>No Fixout doors entered. Fill the inputs above and add doors.</TaskEmptyRow>
            ) : groupedDoorsByLevel.map(({ level, items }) => (
              <React.Fragment key={level}>
                <FloorLevelGroupRow level={level} colSpan={17} count={items.length} unitLabel="door" unitLabelPlural="doors" />
                {items.map((item) => {
                  const globalIdx = (entries || []).findIndex((entry) => entry.id === item.id);
                  const idx = globalIdx >= 0 ? globalIdx : 0;
                  const isSelected = selectedEntryId === item.id;
                  const isCavity = item.category === "cavity";
                  const isPrehung = item.category === "prehung";

                  const frameDisplay = (() => {
                    if (isCavity) {
                      const isEzy = item.door_frame === "Ezy Jamb" || item.door_frame === "Eze Jamb" || item.door_frame === "Yes";
                      return isEzy ? "Eze Jamb" : "Timber Jamb";
                    }
                    return item.door_frame && item.door_frame !== "None" ? item.door_frame : "—";
                  })();
                  const liftOffStr = !isCavity && item.lift_off_pivot && item.lift_off_pivot !== "None" ? item.lift_off_pivot : "—";
                  const handingStr = isPrehung && item.handing && item.handing !== "None" ? item.handing : "—";
                  const holeStr = isPrehung && item.hole && item.hole !== "None" ? item.hole : "—";
                  const finishStr = isPrehung && item.finish && item.finish !== "None" ? item.finish : "—";
                  const furnitureStr = normalizeFurnitureDisplay(item.door_furniture);
                  const doorStopStr = isCavity ? "—" : normalizeStopDisplay(item.door_stop);
                  const jambWallStr = item.wall_width ? `${String(item.wall_width).replace(/mm/gi, "").trim()}mm Wall` : "—";
                  const hungStr = item.handing || item.lift_off_pivot || "—";

                  const isRowEditing = editingRowId === item.id;
                  const editCategory = isRowEditing ? (editRowData.category || item.category || "cavity") : item.category;
                  const editIsCavity = editCategory === "cavity";
                  const editIsLoose = editCategory === "loose-jamb" || editCategory === "loose";
                  const editHeightOptions = editIsCavity ? OPT.cavityHeight : OPT.height;
                  const editWidthOptions = editIsCavity ? OPT.cavityWidth : OPT.width;
                  const editDoorOptions = editIsLoose ? looseJambDoors : prehungDoors;
                  const editFurnitureOptions = FURNITURE_OPTIONS_BY_MODE[editCategory] || FURNITURE_OPTIONS_BY_MODE.prehung || [];
                  const controlStyle = {
                    width: "100%",
                    minWidth: 0,
                    height: "25px",
                    border: "1px solid #93c5fd",
                    borderRadius: "3px",
                    background: "#fff",
                    color: "#0f172a",
                    fontSize: "10px",
                    padding: "1px 3px",
                    boxSizing: "border-box",
                  };
                  const setEditField = (field, value) => setEditRowData((prev) => ({ ...prev, [field]: value }));

                  return (
                    <tr
                      key={item.id || idx}
                      className={isSelected ? "task-row-selected" : undefined}
                      data-editing-row-id={isRowEditing ? item.id : undefined}
                      onPointerDownCapture={(event) => {
                        if (event.button !== 0) return;
                        // Always finish the previous row before moving selection.
                        // Pointer capture fires even when the target is a select/input,
                        // so a nested control cannot leave the old row highlighted.
                        const activeId = editingRowIdRef.current;
                        if (activeId && activeId !== item.id) {
                          handleSaveInlineEdit(activeId);
                        }
                        setSelectedEntryId(item.id);
                        onSelectEntry?.(item);
                      }}
                      onClick={(event) => {
                        if (event.target.closest("button, input, select, textarea, a, [data-search-dropdown]")) return;
                        setSelectedEntryId(item.id);
                        onSelectEntry?.(item);
                      }}
                      onDoubleClick={(event) => {
                        if (event.target.closest("button, input, select, textarea, a, [data-search-dropdown]")) return;
                        event.preventDefault();
                        event.stopPropagation();
                        if (editingRowId && editingRowId !== item.id) handleSaveInlineEdit(editingRowId);
                        setSelectedEntryId(item.id);
                        onSelectEntry?.(item);
                        handleStartEdit(item);
                      }}
                      onKeyDown={(event) => {
                        if (!isRowEditing) return;
                        if (event.key === "Enter") { event.preventDefault(); handleSaveInlineEdit(item.id); }
                        else if (event.key === "Escape") { event.preventDefault(); setEditingRowId(null); }
                      }}
                      style={{ cursor: "pointer" }}
                      title="Click to select · Double-click to edit the whole row"
                    >
                      <td style={{ textAlign: "center", fontWeight: 600, color: "#64748b" }}><TaskRowNumber index={idx} row={item} /></td>
                      <td>
                        {isRowEditing ? (
                          <input value={editRowData.door_label || ""} onChange={(event) => setEditField("door_label", event.target.value)} style={controlStyle} />
                        ) : (
                          <span style={{
                            background: isSelected ? "#2563eb" : "#eff6ff",
                            color: isSelected ? "#ffffff" : "#1d4ed8",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            border: isSelected ? "1px solid #1d4ed8" : "1px solid #bfdbfe",
                            display: "inline-block",
                            fontWeight: 800
                          }}>
                            {item.door_label || "—"}
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {isRowEditing ? (
                          <select
                            value="fixout"
                            onClick={(event) => event.stopPropagation()}
                            onDoubleClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              event.stopPropagation();
                              onMoveDoorTask?.(item, event.target.value);
                            }}
                            style={{ ...controlStyle, width: "86px", borderColor: "#93c5fd", fontWeight: 700 }}
                            title="Move this door to another task. This routing is not saved to Procurement DB."
                          >
                            <option value="fixout">Fixout</option>
                            <option value="lock_up">Lockup</option>
                          </select>
                        ) : (
                          <span title="Double-click the row to change task">Fixout</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {isRowEditing ? (
                          <select value={editCategory} onChange={(event) => setEditField("category", event.target.value)} style={controlStyle}>
                            <option value="cavity">Cavity sliding</option>
                            <option value="prehung">Prehung</option>
                            <option value="loose-jamb">Loose Jamb</option>
                          </select>
                        ) : modeLabel(item.category)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {isRowEditing ? <select value={String(editRowData.height || item.height || 2040)} onChange={(event) => setEditField("height", event.target.value)} style={controlStyle}>{editHeightOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select> : (item.height || 2040)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {isRowEditing ? <select value={String(editRowData.width || item.width || 820)} onChange={(event) => setEditField("width", event.target.value)} style={controlStyle}>{editWidthOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select> : (item.width || 820)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {isRowEditing ? <select value={String(editRowData.thicks || item.thicks || 35)} onChange={(event) => setEditField("thicks", event.target.value)} style={controlStyle}>{OPT.thicks.map((value) => <option key={value} value={value}>{value}</option>)}</select> : (item.thicks || 35)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {isRowEditing ? (
                          <select value={String(editRowData.wall_width || item.wall_width || "")} onChange={(event) => setEditField("wall_width", event.target.value)} style={controlStyle}>
                            <option value="">—</option>
                            {OPT.wallWidth.map((value) => <option key={value} value={value}>{value}</option>)}
                          </select>
                        ) : jambWallStr}
                      </td>
                      <td>
                        {isRowEditing ? (
                          editIsCavity ? (
                            <select value={editRowData.ezyJamb || "No"} onChange={(event) => setEditField("ezyJamb", event.target.value)} style={controlStyle}>
                              <option value="No">Timber Jamb</option>
                              <option value="Yes">Eze Jamb</option>
                            </select>
                          ) : (
                            <select value={editRowData.door_frame || "Timber Jamb"} onChange={(event) => setEditField("door_frame", event.target.value)} style={controlStyle}>
                              {OPT.frame.map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                          )
                        ) : frameDisplay}
                      </td>
                      <td>
                        {isRowEditing ? (
                          <select
                            value={editRowData.handing || editRowData.lift_off_pivot || "None"}
                            onChange={(event) => {
                              if (editIsCavity || editIsLoose) setEditField("lift_off_pivot", event.target.value);
                              else setEditField("handing", event.target.value);
                            }}
                            style={controlStyle}
                          >
                            {Array.from(new Set([...(OPT.handing || []), ...(OPT.liftOff || [])])).map((value) => <option key={value} value={value}>{value}</option>)}
                          </select>
                        ) : hungStr}
                      </td>
                      <td>
                        {isRowEditing ? (
                          <select value={editRowData.door_type || ""} onChange={(event) => setEditField("door_type", event.target.value)} style={controlStyle}>
                            <option value="">—</option>
                            {editDoorOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                          </select>
                        ) : (item.door_type || "—")}
                      </td>
                      <td>{isRowEditing ? <select value={editRowData.hole || "None"} onChange={(event) => setEditField("hole", event.target.value)} style={controlStyle}>{OPT.hole.map((value) => <option key={value} value={value}>{value}</option>)}</select> : holeStr}</td>
                      <td>{isRowEditing ? <select value={editRowData.finish || "None"} onChange={(event) => setEditField("finish", event.target.value)} style={controlStyle}>{OPT.finish.map((value) => <option key={value} value={value}>{value}</option>)}</select> : finishStr}</td>
                      <td>
                        {isRowEditing ? (
                          editIsCavity ? <span>—</span> : <select value={editRowData.door_stop || "None"} onChange={(event) => setEditField("door_stop", event.target.value)} style={controlStyle}>{OPT.stop.map((value) => <option key={value} value={value}>{value}</option>)}</select>
                        ) : doorStopStr}
                      </td>
                      <td>{isRowEditing ? <select value={editRowData.door_furniture || "None"} onChange={(event) => setEditField("door_furniture", event.target.value)} style={controlStyle}>{editFurnitureOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select> : furnitureStr}</td>
                      <td style={{ textAlign: "center", fontWeight: 700, color: "#2563eb" }}>
                        {isRowEditing ? <input inputMode="numeric" value={editRowData.qty ?? 1} onChange={(event) => setEditField("qty", event.target.value)} style={{ ...controlStyle, textAlign: "center" }} /> : (item.qty || 1)}
                      </td>
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        {isRowEditing ? (
                          <>
                            <button type="button" onClick={(event) => { event.stopPropagation(); handleSaveInlineEdit(item.id); }} style={{ ...S.deleteBtn, color: "#16a34a" }} title="Save row">✓</button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); setEditingRowId(null); }} style={{ ...S.deleteBtn, color: "#64748b" }} title="Cancel edit">✕</button>
                          </>
                        ) : <button type="button" onClick={(event) => { event.stopPropagation(); handleRemoveEntry(item.id); }} style={S.deleteBtn} title="Remove door from entered data">✕</button>}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </TaskSummaryTable>
      </TaskInlineEnteredSection>

    </div>
  );
}
