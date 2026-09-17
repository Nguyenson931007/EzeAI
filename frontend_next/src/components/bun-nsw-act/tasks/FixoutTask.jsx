import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";

// ══════════════════════════════════════════════════════
// CONSTANTS & OPTIONS (aligned with FixoutForm.tsx)
// ══════════════════════════════════════════════════════

const FLOOR_LEVEL_OPTIONS = ["GF", "FF", "SF", "TF", "4F", "5F"];

const LEVEL_SORT_ORDER = {
  GF: 1,
  "G/F": 1,
  "GROUND FLOOR": 1,
  GROUND: 1,
  "LEVEL 1": 1,
  "0F": 1,
  FF: 2,
  "1/F": 2,
  "1F": 2,
  "FIRST FLOOR": 2,
  FIRST: 2,
  "LEVEL 2": 2,
  SF: 3,
  "2/F": 3,
  "2F": 3,
  "SECOND FLOOR": 3,
  SECOND: 3,
  "LEVEL 3": 3,
  TF: 4,
  "3/F": 4,
  "3F": 4,
  "THIRD FLOOR": 4,
  THIRD: 4,
  "LEVEL 4": 4,
  "4F": 5,
  "4/F": 5,
  "FOURTH FLOOR": 5,
  FOURTH: 5,
  "LEVEL 5": 5,
  "5F": 6,
  "5/F": 6,
  "FIFTH FLOOR": 6,
  FIFTH: 6,
  "LEVEL 6": 6,
  "6F": 7,
  "6/F": 7,
  "SIXTH FLOOR": 7,
  SIXTH: 7,
  "LEVEL 7": 7,
  "7F": 8,
  "7/F": 8,
  "SEVENTH FLOOR": 8,
  SEVENTH: 8,
  "LEVEL 8": 8,
  "8F": 9,
  "8/F": 9,
  "EIGHTH FLOOR": 9,
  EIGHTH: 9,
  "LEVEL 9": 9,
  "9F": 10,
  "9/F": 10,
  "NINTH FLOOR": 10,
  NINTH: 10,
  "LEVEL 10": 10,
  "10F": 11,
  "10/F": 11,
  "TENTH FLOOR": 11,
  TENTH: 11,
  "LEVEL 11": 11
};

const getFloorLevelDisplayName = (lvl) => {
  const raw = String(lvl || "").trim().toUpperCase();
  if (raw === "GF" || raw === "G/F" || raw === "GROUND" || raw === "GROUND FLOOR" || raw === "LEVEL 1" || raw === "0F") {
    return "Ground Floor";
  }
  if (raw === "FF" || raw === "1/F" || raw === "1F" || raw === "FIRST" || raw === "FIRST FLOOR" || raw === "LEVEL 2") {
    return "First Floor";
  }
  if (raw === "SF" || raw === "2/F" || raw === "2F" || raw === "SECOND" || raw === "SECOND FLOOR" || raw === "LEVEL 3") {
    return "Second Floor";
  }
  if (raw === "TF" || raw === "3/F" || raw === "3F" || raw === "THIRD" || raw === "THIRD FLOOR" || raw === "LEVEL 4") {
    return "Third Floor";
  }
  if (raw === "4F" || raw === "4/F" || raw === "FOURTH" || raw === "FOURTH FLOOR" || raw === "LEVEL 5") {
    return "Fourth Floor";
  }
  if (raw === "5F" || raw === "5/F" || raw === "FIFTH" || raw === "FIFTH FLOOR" || raw === "LEVEL 6") {
    return "Fifth Floor";
  }
  if (raw === "6F" || raw === "6/F" || raw === "SIXTH" || raw === "SIXTH FLOOR" || raw === "LEVEL 7") {
    return "Sixth Floor";
  }
  if (raw === "7F" || raw === "7/F" || raw === "SEVENTH" || raw === "SEVENTH FLOOR" || raw === "LEVEL 8") {
    return "Seventh Floor";
  }
  if (raw === "8F" || raw === "8/F" || raw === "EIGHTH" || raw === "EIGHTH FLOOR" || raw === "LEVEL 9") {
    return "Eighth Floor";
  }
  if (raw === "9F" || raw === "9/F" || raw === "NINTH" || raw === "NINTH FLOOR" || raw === "LEVEL 10") {
    return "Ninth Floor";
  }
  if (raw === "10F" || raw === "10/F" || raw === "TENTH" || raw === "TENTH FLOOR" || raw === "LEVEL 11") {
    return "Tenth Floor";
  }
  return `${lvl} Floor`;
};

const ROOM_LABELS = [
  "Bed 1", "Bed 2", "Bed 3", "Bed 4", "Bed 5", "Bath", "ENS", "WC", "PDR", "Study", "Media", "Hall", "Garage",
  "Ldry", "Pantry", "WIR", "Master", "Linen", "Robe", "Store", "Broom", "WC 1", "WC 2", "Bath 1", "Bath 2",
  "PDR 1", "PDR 2", "ENS 1", "ENS 2", "ENS 3", "Linen 1", "Linen 2", "Robe 1", "Robe 2", "Robe 3", "Robe 4",
  "Living", "Dining", "Kitchen", "Office", "Meeting", "Kid one", "MPR", "WIP", "WIL", "CPD",
];

const DOOR_NAMES = [
  "ASC",
  "ASC-G CLEAR",
  "ASC-G UNGLAZED",
  "BF1 PCM",
  "BF1 SPM",
  "BF18",
  "BF19 CLEAR",
  "BF19 UNGLAZED",
  "BF26",
  "BF27",
  "BF28 CLEAR",
  "BF28 UNGLAZED",
  "BF29 PCM",
  "BF30 PCM CLEAR",
  "BF30 PCM UNGLAZED",
  "BF34",
  "BF6",
  "BFHA10",
  "BFHA45",
  "BFHA5",
  "CAP",
  "DEN",
  "FBDS1 PCM",
  "FBDS2 PCM",
  "FBDS3 PCM",
  "FBDS4 PCM",
  "FBDS5 PCM",
  "FBDU1 PCM",
  "FBDU2 PCM",
  "FBDU3 PCM",
  "FBDU4 PCM",
  "FBDU5 PCM",
  "H1 PCLC 4.75mm",
  "H1 PCM",
  "H1 SPM",
  "HA10",
  "HA15",
  "HA4",
  "HA40",
  "HA45",
  "HA5",
  "HAG11",
  "HAG12",
  "HAG14",
  "HAG18",
  "HAG6",
  "HAG9",
  "HAM1",
  "HAM1 CLEAR",
  "HAM1 MDF INFILL",
  "HAM1 TRANS",
  "HAM1 TRANS LAM",
  "HAM10 CLEAR",
  "HAM10 MDF INFILL",
  "HAM10 TRANS LAM",
  "HAM12 CLEAR",
  "HAM12 MDF INFILL",
  "HAM12 TRANS",
  "HAM12 TRANS LAM",
  "HAM16 CLEAR",
  "HAM16 MDF INFILL",
  "HAM16 TRANS",
  "HAM16 TRANS LAM",
  "HAM4 CLEAR",
  "HAM4 MDF INFILL",
  "HAM4 TRANS LAM",
  "HAM5 CLEAR",
  "HAM5 MDF INFILL",
  "HAM5 TRANS LAM",
  "HAM6 CLEAR",
  "HAM6 MDF INFILL",
  "HAM6 TRANS LAM",
  "HAY",
  "HLR210 PCM U/G",
  "HLR220 PCM U/G",
  "HLR230",
  "HLR230 PCM",
  "HLR240",
  "HLR240 PCM",
  "HLR250 SPM",
  "HLR270 PCM",
  "HLR400 SPM",
  "HLR410 SPM",
  "HLR500 SPM",
  "HLR600 SPM",
  "HMC1 PCM",
  "HMC10 PCM",
  "HMC11 PCM CLEAR",
  "HMC2 PCM",
  "HMC4 PCM",
  "HMC7 PCM",
  "HMC8 PCM",
  "HMC9 PCM",
  "HST1",
  "HST1M",
  "HST4",
  "HST4M",
  "HST5",
  "LIN1 CLAM",
  "LIN1 CLR",
  "LIN1 CLR TGH",
  "LIN1 SPM CLEAR",
  "LIN1 SPM CLEAR LAM",
  "LIN1 SPM CLEAR TGH",
  "LIN1 SPM UNGLAZED",
  "LIN10 SPM CLEAR",
  "LIN10 SPM TRANSLAM",
  "LIN10 SPM UNGLAZED",
  "LIN2 SPM",
  "LIN3 SPM CLEAR",
  "LIN3 SPM UNGLAZED",
  "MF1 LEAF PCM",
  "MF1 LEAF SPM",
  "MF18 LEAF",
  "MF19 LEAF CLEAR",
  "MF19 LEAF UNGLAZED",
  "MF26 LEAF",
  "MF27 LEAF",
  "MF28 LEAF CLEAR",
  "MF28 LEAF UNGLAZED",
  "MF29 LEAF PCM",
  "MF30 LEAF PCM CLR",
  "MF30 LEAF PCM UNG",
  "MF34 LEAF",
  "MF6 LEAF",
  "MFHA10 LEAF",
  "MFHAG11 LEAF",
  "MFHAG12 LEAF",
  "MFHAG9 LEAF",
  "MFSOR1 LEAF",
  "OAK",
  "OAK G CLEAR",
  "OAK G UNGLAZED",
  "OAK GBR",
  "PCSG 6mm",
  "PRE11",
  "PRE18",
  "PRE4",
  "PRE40",
  "PRE44",
  "PRE9",
  "SCX1 D/C",
  "SCX1 P/PLY",
  "SCX1 PCM",
  "SCX1 SPM",
  "SOR1",
  "SOR11",
  "SOR12",
  "SOR2",
  "SOR5",
  "SOR6",
  "SOR7",
  "SOR8",
  "STPC D/C",
  "STPC P/PLY",
  "STPC SPM",
  "TO",
  "X1 D/C",
  "X1 P/PLY",
  "X1 SPM",
  "XB2 OAK SOLID",
];

const OPT = {
  height:      ["2040", "2340", "2150", "2450"],
  width:       ["320", "370", "420", "460", "520", "570", "620", "720", "770", "820", "870", "920", "970", "1020", "1200"],
  cavityWidth: ["620", "720", "770", "820", "870", "920", "970", "1020", "1200", "1000"],
  wallWidth:   ["70", "90"],
  thicks:      ["35", "38", "40"],
  frame:       ["Timber Jamb", "Ezy Jamb", "Steel Frame"],
  liftOff:     ["", "LH LO", "RH LO", "PIVOT DOOR"],
  handing:     ["", "RH", "LH", "RH LO", "LH LO", "DBL DOOR SET", "SET of THREE", "SET of FOUR", "SET of SIX", "Set of EIGHT"],
  hole:        ["", "HF", "HO"],
  finish:      ["", "CHR", "SCH"],
  stop:        ["cushion", "ds2-riser", "none"],
};

const FURNITURE_BY_MODE = {
  cavity:      ["cavity-passage", "cavity-privacy", "face-door-passage", "face-door-privacy", "none"],
  prehung:     ["passage", "privacy", "dummy", "privacy-dummy", "passage-dummy", "none"],
  "loose-jamb": ["passage", "privacy", "dummy", "privacy-dummy", "passage-dummy", "none"],
};

const FURNITURE_LABELS = {
  passage: "Passage Set",
  privacy: "Privacy Set",
  dummy: "Dummy Set",
  "cavity-passage": "CSD Passage Set",
  "cavity-privacy": "CSD Privacy Set",
  "privacy-dummy": "Privacy Dummy",
  "passage-dummy": "Passage Dummy",
  "face-door-passage": "Face Door Passage Set",
  "face-door-privacy": "Face Door Privacy Set",
  none: "None",
};

const STOP_LABELS = {
  cushion: "Cushion",
  "ds2-riser": "DS2 with Riser",
  none: "None",
};

const capitalize = (v) => v ? v.charAt(0).toUpperCase() + v.slice(1) : "None";
const modeLabel = (mode) => {
  const m = String(mode || "").toLowerCase();
  if (m === "cavity" || m.includes("cavity")) return "Cavity sliding";
  if (m === "loose-jamb" || m === "loose" || m.includes("loose")) return "Loose Jamb";
  return "Prehung";
};

// Per-Label default Door Furniture / Door Stop / Hole for Prehung and
// Loose-jamb doors (aligned with FixoutForm.tsx ROOM_LABEL_SUGGESTIONS).
// Format: [furniture, stop, hole]
const ROOM_LABEL_SUGGESTIONS = {
  "Bed 1": ["privacy", "cushion", "HF"], "Bed 2": ["passage", "cushion", "HF"],
  "Bed 3": ["passage", "cushion", "HF"], "Bed 4": ["passage", "cushion", "HF"],
  "Bed 5": ["passage", "cushion", "HF"], "Bath": ["privacy", "ds2-riser", "HF"],
  "ENS": ["privacy", "ds2-riser", "HF"], "WC": ["privacy", "ds2-riser", "HF"],
  "PDR": ["privacy", "ds2-riser", "HF"], "Study": ["passage", "cushion", "HF"],
  "Media": ["passage", "cushion", "HF"], "Hall": ["passage", "cushion", "HF"],
  "Garage": ["privacy", "cushion", "HF"], "Ldry": ["passage", "cushion", "HF"],
  "Pantry": ["passage", "cushion", "HF"], "WIR": ["passage", "cushion", "HF"],
  "Master": ["privacy", "cushion", "HF"], "Linen": ["dummy", "none", "HO"],
  "Robe": ["dummy", "none", "HO"], "Store": ["dummy", "none", "HO"],
  "Broom": ["dummy", "none", "HO"], "WC 1": ["privacy", "ds2-riser", "HF"],
  "WC 2": ["privacy", "ds2-riser", "HF"], "Bath 1": ["privacy", "ds2-riser", "HF"],
  "Bath 2": ["privacy", "ds2-riser", "HF"], "PDR 1": ["privacy", "ds2-riser", "HF"],
  "PDR 2": ["privacy", "ds2-riser", "HF"], "ENS 1": ["privacy", "ds2-riser", "HF"],
  "ENS 2": ["privacy", "ds2-riser", "HF"], "ENS 3": ["privacy", "ds2-riser", "HF"],
  "Linen 1": ["dummy", "none", "HO"], "Linen 2": ["dummy", "none", "HO"],
  "Robe 1": ["dummy", "none", "HO"], "Robe 2": ["dummy", "none", "HO"],
  "Robe 3": ["dummy", "none", "HO"], "Robe 4": ["dummy", "none", "HO"],
  "Living": ["passage", "cushion", "HF"], "Dining": ["passage", "cushion", "HF"],
  "Kitchen": ["passage", "cushion", "HF"], "Office": ["passage", "cushion", "HF"],
  "Meeting": ["passage", "cushion", "HF"], "Kid one": ["passage", "cushion", "HF"],
  "MPR": ["passage", "cushion", "HF"], "WIP": ["passage", "cushion", "HF"],
  "WIL": ["passage", "cushion", "HF"], "CPD": ["dummy", "none", "HO"],
};

// Handing values that force Hole to HO regardless of the Label's default.
const ROOM_SUGGESTION_HOLE_OVERRIDE_HANDINGS = new Set(["SET of THREE", "RH LO", "DBL DOOR SET"]);
// When handing is "DBL DOOR SET", swap base furniture to its dummy variant.
const DUMMY_FURNITURE_VARIANT = { privacy: "privacy-dummy", passage: "passage-dummy" };

// Recomputed whenever Label or (Prehung-only) Handing changes;
// Cavity doors and unrecognised Labels are left untouched.
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
  label: "", doorName: "", height: "2040", width: "820", qty: "1",
  configuration: "single", thickness: "35", wallWidth: "90",
  frameType: "Timber Jamb", liftOff: "", handing: "", hole: "", finish: "",
  furniture: mode === "cavity" ? "cavity-passage" : "passage",
  stop: "cushion",
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
    background: "#fff",
    borderBottom: isOpen ? "1px solid #f1f5f9" : "none",
    fontWeight: 700,
    fontSize: "12px",
    color: "#d97706",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    userSelect: "none",
  }),
  fieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: "10px",
    color: "#64748b",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  input: {
    padding: "5px 6px",
    fontSize: "11px",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    background: "#fefce8",
    outline: "none",
    boxSizing: "border-box",
    minWidth: "55px",
  },
  select: {
    padding: "5px 6px",
    fontSize: "11px",
    border: "1px solid #cbd5e1",
    borderRadius: "4px",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
    cursor: "pointer",
    minWidth: "55px",
  },
  addBtn: {
    padding: "6px 14px",
    background: "#0f2744",
    color: "#ffffff",
    border: "none",
    borderRadius: "5px",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
    alignSelf: "flex-end",
    flexShrink: 0,
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
    fontSize: "9px",
    color: "#94a3b8",
    fontStyle: "italic",
    padding: "4px 10px 8px",
  },
};

// ══════════════════════════════════════════════════════
// COMPACT CUSTOM COMBOBOX COMPONENT
// ══════════════════════════════════════════════════════

function ComboField({ label, value, options = [], width, onChange, placeholder, numeric, openUp = false }) {
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
      const dropUp = openUp || (spaceBelow < 180 && spaceAbove > 140);
      setCoords({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        dropUp,
      });
    }
  }, [openUp]);

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
        const portalMenu = document.getElementById("fixout-combofield-portal-menu");
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

  const menuElement = open && filtered.length > 0 ? (
    <div
      id="fixout-combofield-portal-menu"
      style={{
        position: "fixed",
        ...(coords.dropUp
          ? { bottom: `${Math.max(6, window.innerHeight - coords.top + 3)}px` }
          : { top: `${coords.bottom + 3}px` }),
        left: `${coords.left}px`,
        zIndex: 999999,
        minWidth: Math.max(110, coords.width || 0),
        maxWidth: "260px",
        maxHeight: coords.dropUp
          ? `${Math.max(80, Math.min(200, coords.top - 12))}px`
          : `${Math.max(80, Math.min(200, window.innerHeight - coords.bottom - 12))}px`,
        overflowY: "auto",
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: "5px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        padding: "2px 0",
      }}
    >
      {filtered.map((opt) => {
        const isSel = opt === value;
        return (
          <div
            key={opt}
            onMouseDown={(e) => {
              e.preventDefault();
              onChange(opt);
              setOpen(false);
            }}
            style={{
              padding: "5px 10px",
              fontSize: "11px",
              fontWeight: isSel ? 700 : 400,
              color: isSel ? "#1d4ed8" : "#1e293b",
              background: isSel ? "#eff6ff" : "transparent",
              cursor: "pointer",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            onMouseEnter={(e) => {
              if (!isSel) e.currentTarget.style.background = "#f1f5f9";
            }}
            onMouseLeave={(e) => {
              if (!isSel) e.currentTarget.style.background = "transparent";
            }}
          >
            {opt}
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      ref={containerRef}
      style={{
        ...S.fieldWrap,
        width: width || "auto",
        flex: width ? `0 0 ${width}` : "1 1 0",
        position: "relative",
      }}
    >
      {label ? <span style={S.fieldLabel}>{label}</span> : null}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type={numeric ? "number" : "text"}
          value={value || ""}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) {
              updatePosition();
              setOpen(true);
            }
          }}
          onFocus={() => {
            updatePosition();
            setOpen(true);
          }}
          style={{
            ...S.input,
            width: "100%",
            paddingRight: "16px",
          }}
          placeholder={placeholder || label}
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            updatePosition();
            setOpen((prev) => !prev);
          }}
          style={{
            position: "absolute",
            right: "2px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "8px",
            color: "#64748b",
            padding: "2px",
            lineHeight: 1,
          }}
        >
          {coords.dropUp ? "▲" : "▼"}
        </button>
      </div>

      {typeof document !== "undefined" && menuElement ? createPortal(menuElement, document.body) : menuElement}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// BASIC FIELD COMPONENT (label + select/input)
// ══════════════════════════════════════════════════════

function Field({ label, type = "text", value, options, labels, width, onChange }) {
  const isSelect = type === "select" || Array.isArray(options);
  return (
    <div style={{ ...S.fieldWrap, width: width || "auto", flex: width ? `0 0 ${width}` : "1 1 0" }}>
      <span style={S.fieldLabel}>{label}</span>
      {isSelect ? (
        <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={S.select}>
          {(options || []).map((opt) => (
            <option key={opt} value={opt}>{labels?.[opt] || capitalize(opt) || "—"}</option>
          ))}
        </select>
      ) : (
        <input
          type={type === "number" ? "number" : "text"}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...S.input, width: "100%" }}
          placeholder={label}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// CATEGORY SECTION (Cavity / Prehung / Loose-Jamb)
// ══════════════════════════════════════════════════════

function CategorySection({ mode, title, addLabel, entries, onSetEntries, floorLevel = "GF" }) {
  const [isOpen, setIsOpen] = useState(true);
  const [draft, setDraft] = useState(() => emptyDraft(mode));

  const catEntries = useMemo(
    () => (entries || []).filter((e) => e.category === mode),
    [entries, mode]
  );

  const updateDraft = useCallback((patch) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleLabelChange = useCallback((label) => {
    setDraft((prev) => {
      const patch = roomSuggestionPatch(mode, label, prev.handing);
      return { ...prev, label, ...patch };
    });
  }, [mode]);

  const handleHandingChange = useCallback((handing) => {
    setDraft((prev) => {
      const patch = roomSuggestionPatch(mode, prev.label, handing);
      return { ...prev, handing, ...patch };
    });
  }, [mode]);

  const handleAdd = () => {
    const h = parseFloat(draft.height) || 2040;
    const w = parseFloat(draft.width) || 820;
    const q = parseInt(draft.qty, 10) || 1;
    if (!draft.doorName && !draft.label) return;

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
      door_frame: draft.frameType || "Timber Jamb",
      configuration: draft.configuration || "single",
      lift_off_pivot: draft.liftOff || "",
      handing: draft.handing || "",
      hole: draft.hole || "",
      finish: draft.finish || "",
      door_furniture: draft.furniture || (mode === "cavity" ? "cavity-passage" : "passage"),
      door_stop: mode === "cavity" ? "none" : (draft.stop || "cushion"),
    };

    if (onSetEntries) {
      onSetEntries((prev) => [...(prev || []), newEntry]);
    }
    setDraft(emptyDraft(mode));
  };

  const handleRemove = (id) => {
    if (onSetEntries) {
      onSetEntries((prev) => (prev || []).filter((e) => e.id !== id));
    }
  };

  const isCavity = mode === "cavity";
  const isPrehung = mode === "prehung";
  const isLooseJamb = mode === "loose-jamb";
  const furnitureOpts = FURNITURE_BY_MODE[mode] || FURNITURE_BY_MODE.prehung;

  return (
    <div style={{ marginBottom: "10px" }}>
      {/* Header */}
      <div onClick={() => setIsOpen(!isOpen)} style={S.sectionHeader(isOpen)}>
        <span>▼ {title}</span>
        <span style={{ fontSize: "11px", color: "#64748b" }}>{isOpen ? "▲" : "▼"}</span>
      </div>

      {isOpen && (
        <div style={{ padding: "8px 10px" }}>
          {/* ── Input Row ── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "flex-end" }}>
            <ComboField label="Door label" value={draft.label} options={ROOM_LABELS} width="85px" onChange={handleLabelChange} />
            <ComboField label="Door type" value={draft.doorName} options={DOOR_NAMES} width="125px" onChange={(v) => updateDraft({ doorName: v })} />
            <Field label="Height (mm)" type="number" value={draft.height} width="70px" onChange={(v) => updateDraft({ height: v })} />
            <Field label={isCavity ? "Door Size (mm)" : "Width (mm)"} type="number" value={draft.width} width="70px" onChange={(v) => updateDraft({ width: v })} />
            <Field label="Quantity" type="number" value={draft.qty} width="50px" onChange={(v) => updateDraft({ qty: v })} />
            <Field label="Wall width" type="select" value={draft.wallWidth} options={OPT.wallWidth} width="65px" onChange={(v) => updateDraft({ wallWidth: v })} />
            <Field label="Thickness" type="select" value={draft.thickness} options={OPT.thicks} width="60px" onChange={(v) => updateDraft({ thickness: v })} />

            {isCavity ? (
              <>
                <Field label="Frame" type="select" value={draft.frameType} options={["Timber Jamb", "Ezy Jamb"]} width="95px" onChange={(v) => updateDraft({ frameType: v })} />
                <Field label="Configuration" type="select" value={draft.configuration} options={["single", "double"]} width="90px" onChange={(v) => updateDraft({ configuration: v })} />
              </>
            ) : (
              <Field label="Frame" type="select" value={draft.frameType} options={OPT.frame} width="95px" onChange={(v) => updateDraft({ frameType: v })} />
            )}

            {isLooseJamb && (
              <Field label="Lift off / pivot" type="select" value={draft.liftOff} options={OPT.liftOff} width="95px" onChange={(v) => updateDraft({ liftOff: v })} />
            )}

            {isPrehung && (
              <>
                <Field label="Handing" type="select" value={draft.handing} options={OPT.handing} width="85px" onChange={handleHandingChange} />
                <Field label="Hole" type="select" value={draft.hole} options={OPT.hole} width="50px" onChange={(v) => updateDraft({ hole: v })} />
                <Field label="Finish" type="select" value={draft.finish} options={OPT.finish} width="50px" onChange={(v) => updateDraft({ finish: v })} />
              </>
            )}

            <Field label="Furniture" type="select" value={draft.furniture} options={furnitureOpts} labels={FURNITURE_LABELS} width="105px" onChange={(v) => updateDraft({ furniture: v })} />

            {!isCavity && (
              <Field label="Door stop" type="select" value={draft.stop} options={OPT.stop} labels={STOP_LABELS} width="75px" onChange={(v) => updateDraft({ stop: v })} />
            )}

            <button type="button" onClick={handleAdd} style={S.addBtn}>{addLabel}</button>
          </div>

          <div style={S.note}>
            Door and material codes are looked up automatically from the Bunnings workbook.
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════
// SECTION 2: ENTERED DOORS TABLE (GROUPED BY FLOOR LEVEL)
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
}) {
  const { user, currentJobId, currentProjectName } = useAppModel();

  const [floorLevel, setFloorLevel] = useState("GF");
  const [isSection1Open, setIsSection1Open] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);
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

  // Group entries by FloorLevel
  const groupedDoorsByLevel = useMemo(() => {
    const groups = {};
    (entries || []).forEach(item => {
      const lvl = String(item.floorLevel || item.floor_level || "GF").toUpperCase().trim() || "GF";
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

    return sortedLevels.map(lvl => ({
      level: lvl,
      items: groups[lvl]
    }));
  }, [entries]);

  const handleStartEdit = (item) => {
    setEditingRowId(item.id);
    setEditRowData({
      ...item,
      floorLevel: item.floorLevel || item.floor_level || "GF",
    });
  };

  const handleSaveInlineEdit = (idToSave) => {
    const targetId = idToSave || editingRowIdRef.current;
    if (!targetId || !onSetEntries) return;
    const currentData = editRowDataRef.current;
    const q = parseInt(currentData.qty, 10) || 1;

    onSetEntries(prev => {
      const currentList = Array.isArray(prev) ? prev : (entriesRef.current || []);
      return currentList.map(item => item.id === targetId ? {
        ...item,
        ...currentData,
        floorLevel: currentData.floorLevel || item.floorLevel || item.floor_level || "GF",
        qty: q,
      } : item);
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
      const isInsideEditingTr = path.some(el => 
        el === editingTr || 
        (el.getAttribute && el.getAttribute("data-editing-row-id") === String(editingRowIdRef.current))
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
          .filter((r) => r.door_label || r.door_type || r.height || r.width)
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
            door_furniture: r.door_furniture || (r.category === "cavity" ? "cavity-passage" : "passage"),
            door_stop: r.door_stop || (r.category === "cavity" ? "none" : "cushion"),
            qty: r.qty || 1,
          }));

        if (loaded.length > 0 && onSetEntries) {
          onSetEntries(loaded);
          const first = loaded[0];
          if (first && first.floorLevel) {
            setFloorLevel(first.floorLevel);
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

  // ── Auto-load saved Fixout entries from DB if empty on job load ──
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
      const items = (entries || []).map((item) => ({
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

      {/* ═══ CARD 1: DOOR INFORMATION ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection1Open(!isSection1Open)} style={S.cardTitle}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>1. Door Information</span>
          </div>
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
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleReloadFromDb(true); }}
              disabled={isLoadingDb}
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                color: "#1e293b",
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "5px",
                cursor: isLoadingDb ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px"
              }}
              title="Reload Fixout doors from MSSQL"
            >
              {isLoadingDb ? "⏳ Loading..." : "↻ Reload SQL"}
            </button>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              {isSection1Open ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {isSection1Open && (
          <div style={{ padding: "8px" }}>
            {/* Shared Floor Level Selector at top of Card 1 */}
            <div style={{
              padding: "6px 10px 10px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              borderBottom: "1px solid #f1f5f9",
              marginBottom: "8px"
            }}>
              <span style={{ fontSize: "11px", color: "#334155", fontWeight: 700 }}>Floor level:</span>
              <select
                value={floorLevel}
                onChange={(e) => {
                  setFloorLevel(e.target.value);
                  if (onChange) onChange("fixout", "floor_level", e.target.value);
                }}
                className="task-field-select"
                style={{
                  padding: "5px 8px",
                  fontSize: "11px",
                  borderRadius: "5px",
                  border: "1px solid #cbd5e1",
                  fontWeight: 700,
                  background: "#f8fafc",
                  minWidth: "140px",
                  boxSizing: "border-box",
                  height: "30px"
                }}
              >
                {FLOOR_LEVEL_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt} ({getFloorLevelDisplayName(opt)})</option>
                ))}
              </select>
            </div>

            {/* 3 Categories all use shared floorLevel */}
            <CategorySection mode="cavity"     title="Cavity sliding units + doors" addLabel="+ Add Cavity"  entries={entries} onSetEntries={onSetEntries} floorLevel={floorLevel} />
            <CategorySection mode="prehung"    title="Internal prehung doors"       addLabel="+ Add Prehung" entries={entries} onSetEntries={onSetEntries} floorLevel={floorLevel} />
            <CategorySection mode="loose-jamb" title="Internal loose-jamb doors"    addLabel="+ Add Jamb"    entries={entries} onSetEntries={onSetEntries} floorLevel={floorLevel} />
          </div>
        )}
      </div>

      {/* ═══ CARD 2: ENTERED DOORS (GROUPED BY FLOOR LEVEL) ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection2Open(!isSection2Open)} style={S.cardTitle}>
          <span>2. Entered doors {totalCount > 0 ? `(${totalCount})` : ""}</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>{isSection2Open ? "▲" : "▼"}</span>
        </div>

        {isSection2Open && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", tableLayout: "auto" }}>
              <thead>
                <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", width: "24px", textAlign: "center" }}>#</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", minWidth: "90px" }}>Category</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", minWidth: "130px" }}>Label / door</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", minWidth: "95px" }}>Size</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", minWidth: "110px" }}>Wall / frame</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", minWidth: "65px" }}>Lift off</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", minWidth: "65px" }}>Handing</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", minWidth: "50px" }}>Hole</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", minWidth: "55px" }}>Finish</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", minWidth: "105px" }}>Furniture</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", minWidth: "75px" }}>Door stop</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, fontSize: "10px", width: "40px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "6px 8px", width: "50px", textAlign: "center" }}></th>
                </tr>
              </thead>
              <tbody>
                {totalCount === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>
                      No Fixout doors entered. Fill the inputs above and add doors.
                    </td>
                  </tr>
                ) : (
                  groupedDoorsByLevel.map(({ level, items }) => {
                    const isLower = level === "GF" || level === "LEVEL 1" || level === "GROUND FLOOR" || level === "GROUND";
                    return (
                      <React.Fragment key={level}>
                        <tr style={{
                          background: isLower ? "#f0fdf4" : "#fefce8",
                          borderTop: "2px solid #cbd5e1",
                          borderBottom: "1px solid #e2e8f0"
                        }}>
                          <td colSpan={13} style={{ padding: "6px 10px", fontWeight: 800, fontSize: "11px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                                <span style={{
                                  background: isLower ? "#dcfce7" : "#fef08a",
                                  color: isLower ? "#15803d" : "#854d0e",
                                  border: isLower ? "1px solid #bbf7d0" : "1px solid #fef08a",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontWeight: 800,
                                  fontSize: "10.5px",
                                  letterSpacing: "0.5px"
                                }}>
                                  {level}
                                </span>
                                <span style={{ color: "#1e293b", fontWeight: 800, fontSize: "11.5px" }}>
                                  {getFloorLevelDisplayName(level)}
                                </span>
                              </div>
                              <span style={{ fontSize: "10.5px", color: "#64748b", fontWeight: 600 }}>
                                {items.length} {items.length === 1 ? "door" : "doors"}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {items.map((item) => {
                          const globalIdx = (entries || []).findIndex(e => e.id === item.id);
                          const idx = globalIdx >= 0 ? globalIdx : 0;
                          const isSelected = selectedEntryId === item.id;
                          const isRowEditing = editingRowId === item.id;
                          const isCavity = (isRowEditing ? editRowData.category : item.category) === "cavity";
                          const isPrehung = (isRowEditing ? editRowData.category : item.category) === "prehung";
                          const isLooseJamb = (isRowEditing ? editRowData.category : item.category) === "loose-jamb";

                          if (isRowEditing) {
                            return (
                              <tr
                                key={item.id || idx}
                                data-editing-row-id={item.id}
                                style={{ borderBottom: "1px solid #e2e8f0", background: "#fef9c3" }}
                              >
                                <td style={{ padding: "4px", textAlign: "center", fontWeight: 600, color: "#64748b" }}>{idx + 1}</td>
                                <td style={{ padding: "4px" }}>
                                  <select
                                    value={editRowData.category || "cavity"}
                                    onChange={(e) => setEditRowData({ ...editRowData, category: e.target.value })}
                                    style={{ ...S.select, width: "95px", fontSize: "10px" }}
                                  >
                                    <option value="cavity">Cavity sliding</option>
                                    <option value="prehung">Prehung</option>
                                    <option value="loose-jamb">Loose Jamb</option>
                                  </select>
                                </td>
                                <td style={{ padding: "4px" }}>
                                  <div style={{ display: "flex", gap: "2px" }}>
                                    <ComboField
                                      value={editRowData.door_label || ""}
                                      options={ROOM_LABELS}
                                      width="55px"
                                      openUp={true}
                                      onChange={(v) => {
                                        const mode = editRowData.category || "prehung";
                                        const patch = roomSuggestionPatch(mode, v, editRowData.handing || "");
                                        setEditRowData({
                                          ...editRowData,
                                          door_label: v,
                                          ...(patch.furniture ? { door_furniture: patch.furniture } : {}),
                                          ...(patch.stop !== undefined ? { door_stop: patch.stop } : {}),
                                          ...(patch.hole !== undefined ? { hole: patch.hole } : {}),
                                        });
                                      }}
                                      placeholder="Label"
                                    />
                                    <ComboField
                                      value={editRowData.door_type || ""}
                                      options={DOOR_NAMES}
                                      width="85px"
                                      openUp={true}
                                      onChange={(v) => setEditRowData({ ...editRowData, door_type: v })}
                                      placeholder="Type"
                                    />
                                  </div>
                                </td>
                                <td style={{ padding: "4px" }}>
                                  <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
                                    <input
                                      type="number"
                                      value={editRowData.height || 2040}
                                      onChange={(e) => setEditRowData({ ...editRowData, height: e.target.value })}
                                      style={{ ...S.input, width: "45px", fontSize: "10px" }}
                                    />
                                    <span>×</span>
                                    <input
                                      type="number"
                                      value={editRowData.width || 820}
                                      onChange={(e) => setEditRowData({ ...editRowData, width: e.target.value })}
                                      style={{ ...S.input, width: "40px", fontSize: "10px" }}
                                    />
                                    <span>×</span>
                                    <select
                                      value={editRowData.thicks || "35"}
                                      onChange={(e) => setEditRowData({ ...editRowData, thicks: e.target.value })}
                                      style={{ ...S.select, width: "40px", fontSize: "10px" }}
                                    >
                                      {OPT.thicks.map((o) => <option key={o}>{o}</option>)}
                                    </select>
                                  </div>
                                </td>
                                <td style={{ padding: "4px" }}>
                                  <div style={{ display: "flex", gap: "2px" }}>
                                    <select
                                      value={editRowData.wall_width || "90"}
                                      onChange={(e) => setEditRowData({ ...editRowData, wall_width: e.target.value })}
                                      style={{ ...S.select, width: "45px", fontSize: "10px" }}
                                    >
                                      {OPT.wallWidth.map((o) => <option key={o}>{o}</option>)}
                                    </select>
                                    <select
                                      value={editRowData.door_frame || "Timber Jamb"}
                                      onChange={(e) => setEditRowData({ ...editRowData, door_frame: e.target.value })}
                                      style={{ ...S.select, width: "80px", fontSize: "10px" }}
                                    >
                                      {(isCavity ? ["Timber Jamb", "Ezy Jamb"] : OPT.frame).map((o) => <option key={o}>{o}</option>)}
                                    </select>
                                  </div>
                                </td>
                                <td style={{ padding: "4px" }}>
                                  {isLooseJamb ? (
                                    <select
                                      value={editRowData.lift_off_pivot || ""}
                                      onChange={(e) => setEditRowData({ ...editRowData, lift_off_pivot: e.target.value })}
                                      style={{ ...S.select, width: "65px", fontSize: "10px" }}
                                    >
                                      {OPT.liftOff.map((o) => <option key={o} value={o}>{capitalize(o)}</option>)}
                                    </select>
                                  ) : <span style={{ color: "#94a3b8" }}>—</span>}
                                </td>
                                <td style={{ padding: "4px" }}>
                                  {isPrehung ? (
                                    <select
                                      value={editRowData.handing || ""}
                                      onChange={(e) => {
                                        const handing = e.target.value;
                                        const mode = editRowData.category || "prehung";
                                        const patch = roomSuggestionPatch(mode, editRowData.door_label || "", handing);
                                        setEditRowData({
                                          ...editRowData,
                                          handing,
                                          ...(patch.furniture ? { door_furniture: patch.furniture } : {}),
                                          ...(patch.stop !== undefined ? { door_stop: patch.stop } : {}),
                                          ...(patch.hole !== undefined ? { hole: patch.hole } : {}),
                                        });
                                      }}
                                      style={{ ...S.select, width: "65px", fontSize: "10px" }}
                                    >
                                      {OPT.handing.map((o) => <option key={o} value={o}>{capitalize(o)}</option>)}
                                    </select>
                                  ) : <span style={{ color: "#94a3b8" }}>—</span>}
                                </td>
                                <td style={{ padding: "4px" }}>
                                  {isPrehung ? (
                                    <select
                                      value={editRowData.hole || ""}
                                      onChange={(e) => setEditRowData({ ...editRowData, hole: e.target.value })}
                                      style={{ ...S.select, width: "50px", fontSize: "10px" }}
                                    >
                                      {OPT.hole.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                                    </select>
                                  ) : <span style={{ color: "#94a3b8" }}>—</span>}
                                </td>
                                <td style={{ padding: "4px" }}>
                                  {isPrehung ? (
                                    <select
                                      value={editRowData.finish || ""}
                                      onChange={(e) => setEditRowData({ ...editRowData, finish: e.target.value })}
                                      style={{ ...S.select, width: "55px", fontSize: "10px" }}
                                    >
                                      {OPT.finish.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                                    </select>
                                  ) : <span style={{ color: "#94a3b8" }}>—</span>}
                                </td>
                                <td style={{ padding: "4px" }}>
                                  <select
                                    value={editRowData.door_furniture || ""}
                                    onChange={(e) => setEditRowData({ ...editRowData, door_furniture: e.target.value })}
                                    style={{ ...S.select, width: "105px", fontSize: "10px" }}
                                  >
                                    {(FURNITURE_BY_MODE[editRowData.category] || FURNITURE_BY_MODE.prehung).map((o) => (
                                      <option key={o} value={o}>{FURNITURE_LABELS[o] || o}</option>
                                    ))}
                                  </select>
                                </td>
                                <td style={{ padding: "4px" }}>
                                  {!isCavity ? (
                                    <select
                                      value={editRowData.door_stop || "cushion"}
                                      onChange={(e) => setEditRowData({ ...editRowData, door_stop: e.target.value })}
                                      style={{ ...S.select, width: "70px", fontSize: "10px" }}
                                    >
                                      {OPT.stop.map((o) => <option key={o} value={o}>{STOP_LABELS[o] || capitalize(o)}</option>)}
                                    </select>
                                  ) : <span style={{ color: "#94a3b8" }}>—</span>}
                                </td>
                                <td style={{ padding: "4px", textAlign: "center" }}>
                                  <input
                                    type="number"
                                    value={editRowData.qty !== undefined ? editRowData.qty : item.qty}
                                    onChange={(e) => setEditRowData({ ...editRowData, qty: e.target.value })}
                                    style={{ ...S.input, width: "35px", fontSize: "10px", textAlign: "center" }}
                                  />
                                </td>
                                <td style={{ padding: "4px", textAlign: "center" }}>
                                  <div style={{ display: "inline-flex", gap: "3px" }}>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleSaveInlineEdit(item.id); }}
                                      style={{ ...S.editBtn, background: "#dcfce7", color: "#16a34a", borderColor: "#86efac" }}
                                      title="Save"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setEditingRowId(null); setEditRowData({}); }}
                                      style={S.deleteBtn}
                                      title="Cancel"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          // ── Display Mode Row ──
                          const sizeStr = `${item.height || 2040}×${item.width || 820}×${item.thicks || 35}`;
                          const wallFrameStr = `${item.wall_width || 90} · ${item.door_frame || "Timber Jamb"}`;
                          const liftOffStr = isLooseJamb ? (item.lift_off_pivot || "—") : "—";
                          const handingStr = isPrehung ? (item.handing || "—") : "—";
                          const holeStr = isPrehung ? (item.hole || "—") : "—";
                          const finishStr = isPrehung ? (item.finish || "—") : "—";
                          const furnitureStr = item.door_furniture || (isCavity ? "cavity-passage" : "passage");
                          const doorStopStr = isCavity ? "—" : (item.door_stop || "cushion");

                          return (
                            <tr
                              key={item.id || idx}
                              data-editing-row-id={isRowEditing ? item.id : undefined}
                              onDoubleClick={(e) => {
                                if (isRowEditing) return;
                                if (e.target.closest && e.target.closest("button")) return;
                                if (editingRowId && editingRowId !== item.id) {
                                  handleSaveInlineEdit(editingRowId);
                                }
                                setSelectedEntryId(item.id);
                                if (onSelectEntry) onSelectEntry(item);
                                handleStartEdit(item);
                              }}
                              onClick={() => {
                                if (!isRowEditing) {
                                  if (editingRowId && editingRowId !== item.id) {
                                    handleSaveInlineEdit(editingRowId);
                                  }
                                  const nextSelected = isSelected ? null : item.id;
                                  setSelectedEntryId(nextSelected);
                                  if (onSelectEntry) onSelectEntry(isSelected ? null : item);
                                }
                              }}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                                background: isSelected ? "#dbeafe" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc"),
                                cursor: "pointer",
                                outline: isSelected ? "2px solid #3b82f6" : "none",
                                outlineOffset: "-1px",
                                transition: "background 0.15s ease"
                              }}
                            >
                              {/* # */}
                              <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600, color: "#64748b" }}>
                                {idx + 1}
                              </td>

                              {/* Category */}
                              <td style={{ padding: "6px 8px", fontWeight: 600, color: "#334155" }}>
                                {modeLabel(item.category)}
                              </td>

                              {/* Label / door */}
                              <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                                <span style={{ fontWeight: 700, color: "#0f172a", marginRight: "6px" }}>
                                  {item.door_label || "—"}
                                </span>
                                <span style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase" }}>
                                  {item.door_type || ""}
                                </span>
                              </td>

                              {/* Size */}
                              <td style={{ padding: "6px 8px", color: "#334155", whiteSpace: "nowrap" }}>
                                {sizeStr}
                              </td>

                              {/* Wall / frame */}
                              <td style={{ padding: "6px 8px", color: "#334155", whiteSpace: "nowrap" }}>
                                {wallFrameStr}
                              </td>

                              {/* Lift off */}
                              <td style={{ padding: "6px 8px", color: liftOffStr === "—" ? "#94a3b8" : "#334155" }}>
                                {liftOffStr}
                              </td>

                              {/* Handing */}
                              <td style={{ padding: "6px 8px", color: handingStr === "—" ? "#94a3b8" : "#334155" }}>
                                {handingStr}
                              </td>

                              {/* Hole */}
                              <td style={{ padding: "6px 8px", color: holeStr === "—" ? "#94a3b8" : "#334155" }}>
                                {holeStr}
                              </td>

                              {/* Finish */}
                              <td style={{ padding: "6px 8px", color: finishStr === "—" ? "#94a3b8" : "#334155" }}>
                                {finishStr}
                              </td>

                              {/* Furniture */}
                              <td style={{ padding: "6px 8px", color: "#0f766e", fontWeight: 500 }}>
                                {FURNITURE_LABELS[furnitureStr] || furnitureStr}
                              </td>

                              {/* Door stop */}
                              <td style={{ padding: "6px 8px", color: doorStopStr === "—" ? "#94a3b8" : "#0369a1" }}>
                                {STOP_LABELS[doorStopStr] || doorStopStr}
                              </td>

                              {/* Qty */}
                              <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#2563eb" }}>
                                {item.qty || 1}
                              </td>

                              {/* Action: Edit & Delete */}
                              <td style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                                <div style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartEdit(item);
                                    }}
                                    style={S.editBtn}
                                    title="Edit door"
                                  >
                                    ✎
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveEntry(item.id);
                                    }}
                                    style={S.deleteBtn}
                                    title="Delete door"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer: Save */}
        {totalCount > 0 && (
          <div style={{
            padding: "8px 12px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px"
          }}>
            <span style={{ fontSize: "11px", color: "#475569", fontWeight: 600 }}>
              {totalCount} {totalCount === 1 ? "door item" : "door items"} entered
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {saveSuccess && (
                <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: 700 }}>
                  ✓ Saved to SQL!
                </span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  padding: "5px 14px",
                  background: saveSuccess ? "#16a34a" : "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: "700",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                  opacity: isSaving ? 0.7 : 1,
                  transition: "all 0.2s ease"
                }}
              >
                <span>{isSaving ? "⏳" : "💾"}</span>
                <span>{isSaving ? "Saving..." : (saveSuccess ? "Saved!" : "Save")}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}