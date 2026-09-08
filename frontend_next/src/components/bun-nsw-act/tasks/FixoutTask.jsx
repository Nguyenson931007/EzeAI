import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";

// ══════════════════════════════════════════════════════
// CONSTANTS & OPTIONS (aligned with FixoutForm.tsx)
// ══════════════════════════════════════════════════════

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
  "cavity-passage": "cavity-passage",
  "cavity-privacy": "cavity-privacy",
  "privacy-dummy": "Privacy Dummy",
  "passage-dummy": "Passage Dummy",
  "face-door-passage": "face-door-passage",
  "face-door-privacy": "face-door-privacy",
};

const STOP_LABELS = {
  "cushion": "cushion",
  "ds2-riser": "DS2 with Riser",
  "none": "none"
};

const capitalize = (v) => v ? v.charAt(0).toUpperCase() + v.slice(1) : "None";
const modeLabel = (mode) => {
  const m = String(mode || "").toLowerCase();
  if (m === "cavity" || m.includes("cavity")) return "Cavity sliding";
  if (m === "loose-jamb" || m === "loose" || m.includes("loose")) return "Loose Jamb";
  return "Prehung";
};

// Per-Label defaults for Prehung/LooseJamb: [furniture, stop, hole]
const ROOM_DEFAULTS = {
  "Bed 1": ["privacy", "cushion", "HF"], "Bed 2": ["passage", "cushion", "HF"],
  "Bed 3": ["passage", "cushion", "HF"], "Bed 4": ["passage", "cushion", "HF"],
  "Bed 5": ["passage", "cushion", "HF"], Bath: ["privacy", "ds2-riser", "HF"],
  ENS: ["privacy", "ds2-riser", "HF"], WC: ["privacy", "ds2-riser", "HF"],
  PDR: ["privacy", "ds2-riser", "HF"], Study: ["passage", "cushion", "HF"],
  Media: ["passage", "cushion", "HF"], Hall: ["passage", "cushion", "HF"],
  Garage: ["privacy", "cushion", "HF"], Ldry: ["passage", "cushion", "HF"],
  Pantry: ["passage", "cushion", "HF"], WIR: ["passage", "cushion", "HF"],
  Master: ["privacy", "cushion", "HF"], Linen: ["dummy", "none", "HO"],
  Robe: ["dummy", "none", "HO"], Store: ["dummy", "none", "HO"],
  Broom: ["dummy", "none", "HO"],
};

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

function ComboField({ label, value, options = [], width, onChange, placeholder, numeric }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const isCommittedSelection = options.includes(value);

  const filtered = useMemo(() => {
    if (!open) return options;
    const query = String(value || "").trim().toLowerCase();
    if (!query || isCommittedSelection) return options;
    return options.filter((opt) => String(opt).toLowerCase().includes(query));
  }, [open, options, value, isCommittedSelection]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
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
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
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
          ▼
        </button>
      </div>

      {/* Sleek Compact Dropdown Menu */}
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 9999,
            minWidth: "110px",
            maxWidth: "220px",
            maxHeight: "160px",
            overflowY: "auto",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "5px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            marginTop: "2px",
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
                  padding: "4px 8px",
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
      )}
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

function CategorySection({ mode, title, addLabel, entries, onSetEntries }) {
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
    const defaults = ROOM_DEFAULTS[label];
    if (defaults && mode !== "cavity") {
      updateDraft({ label, furniture: defaults[0], stop: defaults[1], hole: defaults[2] });
    } else {
      updateDraft({ label });
    }
  }, [mode, updateDraft]);

  const handleAdd = () => {
    const h = parseFloat(draft.height) || 2040;
    const w = parseFloat(draft.width) || 820;
    const q = parseInt(draft.qty, 10) || 1;
    if (!draft.doorName && !draft.label) return;

    const newEntry = {
      id: `fix-${mode}-${Date.now()}`,
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
                <Field label="Handing" type="select" value={draft.handing} options={OPT.handing} width="85px" onChange={(v) => updateDraft({ handing: v })} />
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

          {/* Compact Section Summary Table */}
          {catEntries.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: "6px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                <tbody>
                  {catEntries.map((item, idx) => (
                    <tr
                      key={item.id || idx}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: idx % 2 === 0 ? "#fff" : "#f8fafc",
                      }}
                    >
                      <td style={{ padding: "4px 4px", fontWeight: 600, color: "#64748b" }}>{item.door_label || "—"}</td>
                      <td style={{ padding: "4px 4px", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.door_type}>{item.door_type || "—"}</td>
                      <td style={{ padding: "4px 4px" }}>{item.height}×{item.width}×{item.thicks}</td>
                      <td style={{ padding: "4px 4px" }}>{item.wall_width} · {item.door_frame}</td>
                      <td style={{ padding: "4px 4px" }}>{FURNITURE_LABELS[item.door_furniture] || item.door_furniture}</td>
                      <td style={{ padding: "4px 4px", fontWeight: 700, color: "#2563eb" }}>{item.qty}</td>
                      <td style={{ padding: "4px 2px", textAlign: "right" }}>
                        <button type="button" onClick={() => handleRemove(item.id)} style={S.deleteBtn} title="Delete">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={S.note}>
            Door and material codes are looked up automatically from the Bunnings workbook.
          </div>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════
// SECTION 2: ENTERED DOORS TABLE (COMPACT 10-COLUMN LAYOUT)
// Columns: # | Category | Label / door | Size | Wall / frame | Lift off | Handing | Furniture | Door stop | Qty | Action
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const loadedJobRef = useRef(null);

  const totalCount = (entries || []).length;

  // ── Auto-load saved Fixout entries from DB if empty on job load ──
  useEffect(() => {
    let isCancelled = false;
    const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim();
    if (!target || target.toLowerCase() === "default" || target.toLowerCase() === "testai") return;
    if (entries && entries.length > 0) return;
    if (loadedJobRef.current === target) return;
    loadedJobRef.current = target;

    async function loadFromDb() {
      try {
        const res = await ApiService.fetchFixoutJobs(target);
        if (isCancelled) return;
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const loaded = res.data
            .filter((r) => r.door_label || r.door_type || r.height || r.width)
            .map((r, idx) => ({
              id: `fix-${r.fixout_id || Date.now()}-${idx}`,
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
          }
        }
      } catch (err) {
        console.warn("Could not load Fixout data from DB:", err);
      }
    }

    loadFromDb();
    return () => { isCancelled = true; };
  }, [activeJobNumber, currentProjectName, currentJobId, entries, onSetEntries]);

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries((prev) => (prev || []).filter((e) => e.id !== id));
    }
    if (editingId === id) { setEditingId(null); setEditData({}); }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditData({ ...item });
  };

  const handleSaveEdit = () => {
    if (onSetEntries && editingId) {
      onSetEntries((prev) =>
        (prev || []).map((e) => (e.id === editingId ? { ...e, ...editData } : e))
      );
    }
    setEditingId(null);
    setEditData({});
  };

  const handleSave = async () => {
    if (!entries || entries.length === 0) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const items = (entries || []).map((item) => ({
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
        user_update: user?.username || user?.name || "EZE0098",
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
        <div style={S.cardTitle}>
          <span>▼ 1. Door Information</span>
        </div>
        <div style={{ padding: "8px" }}>
          <CategorySection mode="cavity"     title="Cavity sliding units + doors" addLabel="+ Add Cavity"  entries={entries} onSetEntries={onSetEntries} />
          <CategorySection mode="prehung"    title="Internal prehung doors"       addLabel="+ Add Prehung" entries={entries} onSetEntries={onSetEntries} />
          <CategorySection mode="loose-jamb" title="Internal loose-jamb doors"    addLabel="+ Add Jamb"    entries={entries} onSetEntries={onSetEntries} />
        </div>
      </div>

      {/* ═══ CARD 2: ENTERED DOORS ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection2Open(!isSection2Open)} style={S.cardTitle}>
          <span>▼ 2. Entered doors {totalCount > 0 ? `(${totalCount})` : ""}</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>{isSection2Open ? "▲" : "▼"}</span>
        </div>

        {isSection2Open && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", tableLayout: "auto" }}>
              <thead>
                <tr style={{ background: "#1e3a5f", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "7px 8px", fontWeight: 700, fontSize: "10px", width: "24px", textAlign: "center" }}>#</th>
                  <th style={{ padding: "7px 8px", fontWeight: 700, fontSize: "10px", minWidth: "90px" }}>Category</th>
                  <th style={{ padding: "7px 8px", fontWeight: 700, fontSize: "10px", minWidth: "130px" }}>Label / door</th>
                  <th style={{ padding: "7px 8px", fontWeight: 700, fontSize: "10px", minWidth: "95px" }}>Size</th>
                  <th style={{ padding: "7px 8px", fontWeight: 700, fontSize: "10px", minWidth: "110px" }}>Wall / frame</th>
                  <th style={{ padding: "7px 8px", fontWeight: 700, fontSize: "10px", minWidth: "65px" }}>Lift off</th>
                  <th style={{ padding: "7px 8px", fontWeight: 700, fontSize: "10px", minWidth: "65px" }}>Handing</th>
                  <th style={{ padding: "7px 8px", fontWeight: 700, fontSize: "10px", minWidth: "100px" }}>Furniture</th>
                  <th style={{ padding: "7px 8px", fontWeight: 700, fontSize: "10px", minWidth: "75px" }}>Door stop</th>
                  <th style={{ padding: "7px 8px", fontWeight: 700, fontSize: "10px", width: "40px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "7px 8px", width: "50px", textAlign: "center" }}></th>
                </tr>
              </thead>
              <tbody>
                {totalCount === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>
                      No Fixout doors entered.
                    </td>
                  </tr>
                ) : (
                  (entries || []).map((item, idx) => {
                    const isEditing = editingId === item.id;
                    const current = isEditing ? editData : item;
                    const isCavity = current.category === "cavity";
                    const isPrehung = current.category === "prehung";
                    const isLooseJamb = current.category === "loose-jamb";

                    if (isEditing) {
                      return (
                        <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: "#fef9c3" }}>
                          <td style={{ padding: "4px", textAlign: "center", fontWeight: 600, color: "#64748b" }}>{idx + 1}</td>
                          <td style={{ padding: "4px" }}>
                            <select
                              value={current.category || "cavity"}
                              onChange={(e) => setEditData({ ...current, category: e.target.value })}
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
                                value={current.door_label || ""}
                                options={ROOM_LABELS}
                                width="55px"
                                onChange={(v) => setEditData({ ...current, door_label: v })}
                                placeholder="Label"
                              />
                              <ComboField
                                value={current.door_type || ""}
                                options={DOOR_NAMES}
                                width="85px"
                                onChange={(v) => setEditData({ ...current, door_type: v })}
                                placeholder="Type"
                              />
                            </div>
                          </td>
                          <td style={{ padding: "4px" }}>
                            <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
                              <input
                                type="number"
                                value={current.height || 2040}
                                onChange={(e) => setEditData({ ...current, height: e.target.value })}
                                style={{ ...S.input, width: "45px", fontSize: "10px" }}
                              />
                              <span>×</span>
                              <input
                                type="number"
                                value={current.width || 820}
                                onChange={(e) => setEditData({ ...current, width: e.target.value })}
                                style={{ ...S.input, width: "40px", fontSize: "10px" }}
                              />
                              <span>×</span>
                              <select
                                value={current.thicks || "35"}
                                onChange={(e) => setEditData({ ...current, thicks: e.target.value })}
                                style={{ ...S.select, width: "40px", fontSize: "10px" }}
                              >
                                {OPT.thicks.map((o) => <option key={o}>{o}</option>)}
                              </select>
                            </div>
                          </td>
                          <td style={{ padding: "4px" }}>
                            <div style={{ display: "flex", gap: "2px" }}>
                              <select
                                value={current.wall_width || "90"}
                                onChange={(e) => setEditData({ ...current, wall_width: e.target.value })}
                                style={{ ...S.select, width: "45px", fontSize: "10px" }}
                              >
                                {OPT.wallWidth.map((o) => <option key={o}>{o}</option>)}
                              </select>
                              <select
                                value={current.door_frame || "Timber Jamb"}
                                onChange={(e) => setEditData({ ...current, door_frame: e.target.value })}
                                style={{ ...S.select, width: "80px", fontSize: "10px" }}
                              >
                                {(isCavity ? ["Timber Jamb", "Ezy Jamb"] : OPT.frame).map((o) => <option key={o}>{o}</option>)}
                              </select>
                            </div>
                          </td>
                          <td style={{ padding: "4px" }}>
                            {isLooseJamb ? (
                              <select
                                value={current.lift_off_pivot || ""}
                                onChange={(e) => setEditData({ ...current, lift_off_pivot: e.target.value })}
                                style={{ ...S.select, width: "65px", fontSize: "10px" }}
                              >
                                {OPT.liftOff.map((o) => <option key={o} value={o}>{capitalize(o)}</option>)}
                              </select>
                            ) : <span style={{ color: "#94a3b8" }}>—</span>}
                          </td>
                          <td style={{ padding: "4px" }}>
                            {isPrehung ? (
                              <select
                                value={current.handing || ""}
                                onChange={(e) => setEditData({ ...current, handing: e.target.value })}
                                style={{ ...S.select, width: "65px", fontSize: "10px" }}
                              >
                                {OPT.handing.map((o) => <option key={o} value={o}>{capitalize(o)}</option>)}
                              </select>
                            ) : <span style={{ color: "#94a3b8" }}>—</span>}
                          </td>
                          <td style={{ padding: "4px" }}>
                            <select
                              value={current.door_furniture || ""}
                              onChange={(e) => setEditData({ ...current, door_furniture: e.target.value })}
                              style={{ ...S.select, width: "95px", fontSize: "10px" }}
                            >
                              {(FURNITURE_BY_MODE[current.category] || FURNITURE_BY_MODE.prehung).map((o) => (
                                <option key={o} value={o}>{FURNITURE_LABELS[o] || o}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "4px" }}>
                            {!isCavity ? (
                              <select
                                value={current.door_stop || "cushion"}
                                onChange={(e) => setEditData({ ...current, door_stop: e.target.value })}
                                style={{ ...S.select, width: "70px", fontSize: "10px" }}
                              >
                                {OPT.stop.map((o) => <option key={o} value={o}>{STOP_LABELS[o] || capitalize(o)}</option>)}
                              </select>
                            ) : <span style={{ color: "#94a3b8" }}>—</span>}
                          </td>
                          <td style={{ padding: "4px", textAlign: "center" }}>
                            <input
                              type="number"
                              value={current.qty || 1}
                              onChange={(e) => setEditData({ ...current, qty: e.target.value })}
                              style={{ ...S.input, width: "35px", fontSize: "10px", textAlign: "center" }}
                            />
                          </td>
                          <td style={{ padding: "4px", textAlign: "center" }}>
                            <div style={{ display: "inline-flex", gap: "3px" }}>
                              <button type="button" onClick={handleSaveEdit} style={{ ...S.editBtn, background: "#dcfce7", color: "#16a34a", borderColor: "#86efac" }} title="Save">✓</button>
                              <button type="button" onClick={() => { setEditingId(null); setEditData({}); }} style={S.deleteBtn} title="Cancel">✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    // ── Display Mode Row (Matching Image 1) ──
                    const sizeStr = `${item.height || 2040}×${item.width || 820}×${item.thicks || 35}`;
                    const wallFrameStr = `${item.wall_width || 90} · ${item.door_frame || "Timber Jamb"}`;
                    const liftOffStr = isLooseJamb ? (item.lift_off_pivot || "—") : "—";
                    const handingStr = isPrehung ? (item.handing || "—") : "—";
                    const furnitureStr = item.door_furniture || (isCavity ? "cavity-passage" : "passage");
                    const doorStopStr = isCavity ? "—" : (item.door_stop || "cushion");

                    return (
                      <tr
                        key={item.id || idx}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
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

                        {/* Furniture */}
                        <td style={{ padding: "6px 8px", color: "#0f766e", fontWeight: 500 }}>
                          {furnitureStr}
                        </td>

                        {/* Door stop */}
                        <td style={{ padding: "6px 8px", color: doorStopStr === "—" ? "#94a3b8" : "#0369a1" }}>
                          {doorStopStr}
                        </td>

                        {/* Qty */}
                        <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#2563eb" }}>
                          {item.qty || 1}
                        </td>

                        {/* Action: Delete */}
                        <td style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              style={S.editBtn}
                              title="Edit door"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveEntry(item.id)}
                              style={S.deleteBtn}
                              title="Delete door"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
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
            padding: "10px 14px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ fontSize: "11px", color: "#475569", fontWeight: 600 }}>
              {totalCount} {totalCount === 1 ? "door item" : "door items"} calculated
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              style={{
                padding: "7px 18px",
                background: saveSuccess ? "#059669" : (isSaving ? "#64748b" : "#0f2744"),
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: isSaving ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                transition: "background 0.2s ease",
              }}
            >
              {isSaving ? "⏳ Saving..." : saveSuccess ? "✅ Saved to DB!" : "💾 Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}