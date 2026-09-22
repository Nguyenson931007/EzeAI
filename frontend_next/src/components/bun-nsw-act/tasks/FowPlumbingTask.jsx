import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import EnteredTaskActions from "./EnteredTaskActions";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";
import { getActiveClientShortName } from "@/constants/clients";
import { PROCUREMENT_TASK_KEYS } from "@/constants/procurementFormParity";
import { useCatalog } from "@/utils/catalogHelpers";

// ══════════════════════════════════════════════════════
// CONSTANTS & OPTIONS
// ══════════════════════════════════════════════════════

export const FLOOR_LEVEL_OPTIONS = ["GF", "FF", "SF", "TF", "4F", "5F"];

export const LEVEL_SORT_ORDER = {
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
};

export const getFloorLevelDisplayName = (lvl) => {
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
  return `${lvl} Floor`;
};

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
  fieldWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: "11px",
    color: "#475569",
    fontWeight: 600,
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  optionalTag: {
    fontSize: "9px",
    color: "#94a3b8",
    fontWeight: 400,
    fontStyle: "italic",
  },
  input: (isYellow = false) => ({
    padding: "7px 10px",
    fontSize: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: isYellow ? "#fefce8" : "#ffffff",
    outline: "none",
    boxSizing: "border-box",
    minWidth: "60px",
    height: "34px",
    width: "100%",
  }),
  addBtn: {
    padding: "7px 18px",
    background: "#0f2744",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
    alignSelf: "flex-end",
    flexShrink: 0,
    height: "34px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
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
    padding: "3px 8px",
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
    fontSize: "12px",
    borderRadius: "4px",
    padding: "3px 8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  },
  note: {
    fontSize: "11px",
    color: "#94a3b8",
    fontStyle: "italic",
    padding: "6px 2px 2px",
  },
};


// ══════════════════════════════════════════════════════
// BUNNINGS NSW-ACT FOW PLUMBING FIXTURES CATALOG
// ══════════════════════════════════════════════════════

export const FOW_OPTIONS = [
  ["dishwasher-inline-tap", "Dishwasher Inline Tap"],
  ["kitchen-sink", "Kitchen Sink"],
  ["kitchen-sink-mixer", "Kitchen Sink Mixer"],
  ["toilet", "Toilet"],
  ["toilet-wall-cock", "Toilet Wall Cock"],
  ["shower-rail-single", "Shower on Rail Single"],
  ["shower-rail-double", "Shower on Rail Double"],
  ["shower-mixer-body", "Shower Mixer Body"],
  ["shower-mixer-trim", "Shower Mixer Trim"],
  ["bathtub-built-in", "Bathtub Built In"],
  ["bath-mixer-body", "Bath Mixer Body"],
  ["bath-mixer-trim", "Bath Mixer Trim"],
  ["bath-spout", "Bath Spout"],
  ["wall-basin-mixer-body", "Wall Basin Mixer Body"],
  ["wall-basin-mixer-trim", "Wall Basin Mixer Trim"],
  ["laundry-trough", "Laundry Trough"],
  ["laundry-mixer", "Laundry Mixer"],
  ["washing-machine-stops", "Washing Machine Stops"],
  ["toilet-roll-holder", "Toilet Roll Holder"],
  ["soap-holder", "Soap Holder"],
  ["towel-rail-single", "Towel Rail Single"],
  ["towel-rail-double", "Towel Rail Double"],
  ["vanity-wall-hung", "Vanity Wall Hung"],
  ["vanity-900-freestanding", "Vanity 900 Freestanding"],
];

export const PLUMBING_FIXTURES_CATALOG = [
  {
    key: "dishwasher-inline-tap",
    itemName: "Dishwasher Inline Tap",
    code: "0571980",
    description: "Brasshards Loose Nut 2 Way Under Sink Valve ¼ Turn 20x15mm chrome Lead Free",
  },
  {
    key: "kitchen-sink",
    itemName: "Kitchen Sink",
    code: "0440339",
    description: "Franke Genesis 1200mm Double Bowl Sink + Drainer",
  },
  {
    key: "kitchen-sink-mixer",
    itemName: "Kitchen Sink Mixer",
    code: "0720684",
    description: "Mixx Basix Shea Sink Mixer Chrome",
  },
  {
    key: "toilet",
    itemName: "Toilet",
    code: "0192008",
    description: "ModiaWF CF Toilet Uni CLSC 191756",
  },
  {
    key: "toilet-wall-cock",
    itemName: "Toilet Wall Cock",
    code: "0571954",
    description: "Brasshards Mini Cistern Tap 15mm Chrome Lead Free",
  },
  {
    key: "shower-rail-single",
    itemName: "Shower on Rail Single",
    code: "0128486",
    description: "Mixx Matcha Rail Shower Chrome",
  },
  {
    key: "shower-rail-double",
    itemName: "Shower on Rail Double",
    code: "0128489",
    description: "Mixx Matcha 2 in 1 Shower Chrome",
  },
  {
    key: "shower-mixer-body",
    itemName: "Shower Mixer Body",
    code: "0829346",
    description: "Mixx Basix Universal Shower Mixer Body",
  },
  {
    key: "shower-mixer-trim",
    itemName: "Shower Mixer Trim",
    code: "0572037",
    description: "Mixx Shea Shower Mixer Trim Kit Chrome",
  },
  {
    key: "bathtub-built-in",
    itemName: "Bathtub Built In",
    code: "4822462",
    description: "Metro 1650mm Inset Bath",
  },
  {
    key: "bath-mixer-body",
    itemName: "Bath Mixer Body",
    code: "0829353",
    description: "Mixx Basix Universal Wall Plate Mixer Body",
  },
  {
    key: "bath-mixer-trim",
    itemName: "Bath Mixer Trim",
    code: "0829308",
    description: "Mixx Shea Wall Plate Mixer Trim Kit Chrome",
  },
  {
    key: "bath-spout",
    itemName: "Bath Spout",
    code: "0720859",
    description: "Mixx Matcha Bath Spout Chrome",
  },
  {
    key: "wall-basin-mixer-body",
    itemName: "Wall Basin Mixer Body",
    code: "0829353",
    description: "Mixx Basix Universal Wall Plate Mixer Body",
  },
  {
    key: "wall-basin-mixer-trim",
    itemName: "Wall Basin Mixer Trim",
    code: "0829308",
    description: "Mixx Shea Wall Plate Mixer Trim Kit Chrome",
  },
  {
    key: "laundry-trough",
    itemName: "Laundry Trough",
    code: "0975645",
    description: "Everhard Elements 45L Laundry Unit",
  },
  {
    key: "laundry-mixer",
    itemName: "Laundry Mixer",
    code: "0720684",
    description: "Mixx Shea Sink Mixer Chrome",
  },
  {
    key: "washing-machine-stops",
    itemName: "Washing Machine Stops",
    code: "0889221",
    description: "MIXX ¼ Turn Ceramic Disc Washing Machine Tap Non Return Chrome",
  },
  {
    key: "toilet-roll-holder",
    itemName: "Toilet Roll Holder",
    code: "0128552",
    description: "Mixx Chia Toilet Roll Holder Chrome",
  },
  {
    key: "soap-holder",
    itemName: "Soap Holder",
    code: "0128542",
    description: "MIXX Chia Soap Basket Chrome",
  },
  {
    key: "towel-rail-single",
    itemName: "Towel Rail Single",
    code: "0128258",
    description: "MIXX Chia Single Towel Rail 750mm Chrome",
  },
  {
    key: "towel-rail-double",
    itemName: "Towel Rail Double",
    code: "0128253",
    description: "Mixx Chia Double Towel Rail Chrome",
  },
  {
    key: "vanity-wall-hung",
    itemName: "Vanity Wall Hung",
    code: "",
    description: "Cibo 1200mm White Tonic Wall Hung Vanity",
  },
  {
    key: "vanity-900-freestanding",
    itemName: "Vanity 900 Freestanding",
    code: "0138266",
    description: "Cibo 900mm White Tonic Full Height Vanity",
  },
];

const ITEM_NAME_OPTIONS = PLUMBING_FIXTURES_CATALOG.map((i) => i.itemName);
const ITEM_DESCRIPTION_OPTIONS = PLUMBING_FIXTURES_CATALOG.filter((i) => Boolean(i.description)).map((i) => i.description);


// ══════════════════════════════════════════════════════
// BASIC INPUT FIELD COMPONENT
// ══════════════════════════════════════════════════════

function InputField({ label, optional, value, flex, minWidth, isYellow, onChange, placeholder, numeric }) {
  return (
    <div
      style={{
        ...S.fieldWrap,
        flex: flex || "1 1 auto",
        minWidth: minWidth || "90px",
      }}
    >
      {label && (
        <span style={S.fieldLabel}>
          {label}
          {optional && <span style={S.optionalTag}>optional</span>}
        </span>
      )}
      <input
        type={numeric ? "number" : "text"}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={S.input(isYellow)}
        placeholder={placeholder || label}
      />
    </div>
  );
}


// ══════════════════════════════════════════════════════
// CUSTOM COMBOBOX / DROPDOWN FIELD COMPONENT
// ══════════════════════════════════════════════════════

function ComboField({
  label,
  optional,
  value,
  options = [],
  flex,
  minWidth,
  isYellow = false,
  onChange,
  placeholder,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const isCommittedSelection = options.includes(value);

  const filtered = React.useMemo(() => {
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
        flex: flex || "1 1 auto",
        minWidth: minWidth || "120px",
        position: "relative",
      }}
    >
      {label && (
        <span style={S.fieldLabel}>
          {label}
          {optional && <span style={S.optionalTag}>optional</span>}
        </span>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type="text"
          value={value || ""}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          style={{
            ...S.input(isYellow),
            width: "100%",
            paddingRight: "24px",
          }}
          placeholder={placeholder || label}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((prev) => !prev)}
          style={{
            position: "absolute",
            right: "4px",
            background: "transparent",
            border: "none",
            color: "#64748b",
            fontSize: "9px",
            cursor: "pointer",
            padding: "4px",
            lineHeight: 1,
          }}
        >
          {open ? "▲" : "▼"}
        </button>
      </div>

      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
            maxHeight: "190px",
            overflowY: "auto",
            zIndex: 999,
          }}
        >
          {filtered.map((opt, i) => (
            <div
              key={i}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setOpen(false);
              }}
              style={{
                padding: "7px 10px",
                fontSize: "12px",
                cursor: "pointer",
                background: opt === value ? "#e0f2fe" : "#ffffff",
                color: opt === value ? "#0369a1" : "#1e293b",
                fontWeight: opt === value ? 600 : 400,
                borderBottom: i < filtered.length - 1 ? "1px solid #f1f5f9" : "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f8fafc";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = opt === value ? "#e0f2fe" : "#ffffff";
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════
// MAIN FOW PLUMBING TASK COMPONENT
// ══════════════════════════════════════════════════════

export default function FowPlumbingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  activeJobNumber,,
  onClearData
}) {
  const activeCustomerShortName = getActiveClientShortName();
  const { items: procurementCatalog } = useCatalog(activeCustomerShortName, PROCUREMENT_TASK_KEYS.plumbing);
  const plumbingItemNameOptions = useMemo(() => {
    const values = procurementCatalog
      .map((row) => String(row.usage_label || row.display_name || row.parameters?.dropdown_key || "").trim())
      .filter(Boolean);
    return values.length ? [...new Set(values)] : ITEM_NAME_OPTIONS;
  }, [procurementCatalog]);
  const plumbingDescriptionOptions = useMemo(() => {
    const values = procurementCatalog.map((row) => String(row.description || "").trim()).filter(Boolean);
    return values.length ? [...new Set(values)] : ITEM_DESCRIPTION_OPTIONS;
  }, [procurementCatalog]);

  const { user, currentJobId, currentProjectName } = useAppModel();

  const [isSection1Open, setIsSection1Open] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);

  // Floor level state
  const [floorLevel, setFloorLevel] = useState(formData.floor_level || "GF");

  // Draft input state matching screenshot
  const [itemNameDraft, setItemNameDraft] = useState("");
  const [codeDraft, setCodeDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [qtyDraft, setQtyDraft] = useState("1");
  const [noteDraft, setNoteDraft] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [reloadMsg, setReloadMsg] = useState({ text: "", type: "info" });
  const loadedJobRef = useRef(null);
  const editingRowIdRef = useRef(null);
  const editRowDataRef = useRef({});

  const totalCount = (entries || []).length;

  useEffect(() => {
    editingRowIdRef.current = editingId;
    editRowDataRef.current = editData;
  }, [editingId, editData]);

  // Click outside auto-save inline edit
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

  const handleSaveInlineEdit = (idToSave) => {
    const targetId = idToSave || editingRowIdRef.current;
    if (!targetId || !onSetEntries) return;
    const currentData = editRowDataRef.current;
    onSetEntries((prev) =>
      (prev || []).map((e) => (e.id === targetId ? { ...e, ...currentData } : e))
    );
    setEditingId(null);
    setEditData({});
  };

  // Auto-fill code and description when Item Name is selected
  const handleItemNameChange = (name) => {
    setItemNameDraft(name);
    const match = PLUMBING_FIXTURES_CATALOG.find(
      (item) => item.itemName.toLowerCase().trim() === String(name || "").toLowerCase().trim()
    );
    if (match) {
      if (match.code) setCodeDraft(match.code);
      if (match.description) setDescriptionDraft(match.description);
    }
  };

  // Auto-fill code and description when Item Name is edited in table
  const handleEditItemNameChange = (name) => {
    const match = PLUMBING_FIXTURES_CATALOG.find(
      (item) => item.itemName.toLowerCase().trim() === String(name || "").toLowerCase().trim()
    );
    if (match) {
      setEditData((prev) => ({
        ...prev,
        itemName: name,
        code: match.code || prev.code,
        description: match.description || prev.description,
      }));
    } else {
      setEditData((prev) => ({ ...prev, itemName: name }));
    }
  };

  // ── Reload FOW Plumbing entries from DB ──
  const handleReloadFromDb = useCallback(async (manual = false) => {
    const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim();
    if (!target || target.toLowerCase() === "default" || target.toLowerCase() === "testai") {
      if (manual) {
        setReloadMsg({ text: "Please select a valid Job first", type: "error" });
        setTimeout(() => setReloadMsg({ text: "", type: "info" }), 3500);
      }
      return;
    }

    setIsLoadingDb(true);
    if (manual) setReloadMsg({ text: "Loading...", type: "info" });

    try {
      const res = await ApiService.fetchFowPlumbingJobs(target);
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        const loaded = res.data
          .filter((r) => r.item_name || r.code || r.description)
          .map((r, idx) => {
            const fl = String(r.floor_level || r.FloorLevel || "GF").trim().toUpperCase();
            return {
              id: `plumb-${r.id || Date.now()}-${idx}`,
              itemName: r.item_name || "",
              code: r.code || "",
              description: r.description || "",
              qty: r.qty != null ? Number(r.qty) : 1,
              note: r.note || "",
              floorLevel: fl || "GF",
              floor_level: fl || "GF",
            };
          });
        if (loaded.length > 0 && onSetEntries) {
          onSetEntries(loaded);
          if (manual) {
            setReloadMsg({ text: `Loaded ${loaded.length} fixtures from SQL`, type: "success" });
            setTimeout(() => setReloadMsg({ text: "", type: "info" }), 3500);
          }
        } else if (manual) {
          setReloadMsg({ text: "No saved data found in SQL", type: "info" });
          setTimeout(() => setReloadMsg({ text: "", type: "info" }), 3500);
        }
      } else if (manual) {
        setReloadMsg({ text: "No saved data found in SQL", type: "info" });
        setTimeout(() => setReloadMsg({ text: "", type: "info" }), 3500);
      }
    } catch (err) {
      console.warn("Could not load FOW Plumbing data from DB:", err);
      if (manual) {
        setReloadMsg({ text: "Failed to reload from SQL", type: "error" });
        setTimeout(() => setReloadMsg({ text: "", type: "info" }), 3500);
      }
    } finally {
      setIsLoadingDb(false);
    }
  }, [activeJobNumber, currentProjectName, currentJobId, onSetEntries]);

  // ── Auto-load saved FOW Plumbing entries from DB if empty on job load ──
  useEffect(() => {
    const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim();
    if (!target || target.toLowerCase() === "default" || target.toLowerCase() === "testai") return;
    if (entries && entries.length > 0) return;
    if (loadedJobRef.current === target) return;
    loadedJobRef.current = target;

    handleReloadFromDb(false);
  }, [activeJobNumber, currentProjectName, currentJobId, entries, handleReloadFromDb]);

  const handleAdd = () => {
    const name = String(itemNameDraft || "").trim();
    const code = String(codeDraft || "").trim();
    const desc = String(descriptionDraft || "").trim();
    const q = parseFloat(qtyDraft) || 1;
    const n = String(noteDraft || "").trim();

    if (!name && !code && !desc) return;

    const newEntry = {
      id: `plumb-${Date.now()}`,
      itemName: name,
      code: code,
      description: desc,
      qty: q,
      note: n,
      floorLevel: floorLevel || "GF",
      floor_level: floorLevel || "GF",
    };

    if (onSetEntries) {
      onSetEntries((prev) => [...(prev || []), newEntry]);
    }

    // Reset draft fields
    setItemNameDraft("");
    setCodeDraft("");
    setDescriptionDraft("");
    setQtyDraft("1");
    setNoteDraft("");
  };

  const handleRemove = (id) => {
    if (onSetEntries) {
      onSetEntries((prev) => (prev || []).filter((e) => e.id !== id));
    }
    if (editingId === id) {
      setEditingId(null);
      setEditData({});
    }
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

  const handleSaveToDatabase = async () => {
    if (!entries || entries.length === 0) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const items = (entries || []).map((item) => ({
        item_name: item.itemName || item.item_name || "",
        code: item.code || "",
        description: item.description || "",
        qty: item.qty != null ? Number(item.qty) : 1,
        note: item.note || "",
        floor_level: item.floorLevel || item.floor_level || "GF",
      }));

      const targetJob = activeJobNumber || currentProjectName || currentJobId || "TestAI";
      const payload = {
        user_update: user?.username || user?.name || "EZE0098",
        jobs: [
          {
            id_job_hw: String(targetJob),
            items,
          },
        ],
      };

      const res = await ApiService.saveFowPlumbingJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        alert(res?.detail || res?.message || "Could not save FOW Plumbing records to database.");
      }
    } catch (err) {
      console.error("Save FOW Plumbing error:", err);
      alert("Error saving FOW Plumbing to database: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Group entries by FloorLevel
  const groupedPlumbingByLevel = useMemo(() => {
    const groups = {};
    (entries || []).forEach((item) => {
      const lvl = (item.floorLevel || item.floor_level || "GF").trim().toUpperCase();
      if (!groups[lvl]) groups[lvl] = [];
      groups[lvl].push(item);
    });

    return Object.keys(groups)
      .sort((a, b) => {
        const orderA = LEVEL_SORT_ORDER[a] || 99;
        const orderB = LEVEL_SORT_ORDER[b] || 99;
        return orderA - orderB;
      })
      .map((lvl) => ({
        level: lvl,
        items: groups[lvl],
      }));
  }, [entries]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* ═══ CARD 1: PLUMBING FIXTURES SETUP ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection1Open(!isSection1Open)} style={S.cardTitle}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>▶ 1. Plumbing fixtures</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {reloadMsg.text && (
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
              title="Reload FOW Plumbing from MSSQL"
            >
              {isLoadingDb ? "⏳ Loading..." : "↻ Reload SQL"}
            </button>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              {isSection1Open ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px" }}>
            {/* Shared Floor Level Selector at top of Card 1 */}
            <div style={{
              padding: "0 0 10px 0",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              borderBottom: "1px solid #f1f5f9",
              marginBottom: "12px"
            }}>
              <span style={{ fontSize: "11px", color: "#334155", fontWeight: 700 }}>Floor level:</span>
              <select
                value={floorLevel}
                onChange={(e) => {
                  setFloorLevel(e.target.value);
                  if (onChange) onChange("fow_plumbing", "floor_level", e.target.value);
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

            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "flex-end" }}>
              {/* Dropdown 1: Item Name (Combobox) */}
              <ComboField
                label="Item Name"
                value={itemNameDraft}
                options={plumbingItemNameOptions}
                isYellow={true}
                flex="1.5 1 150px"
                minWidth="130px"
                onChange={handleItemNameChange}
                placeholder="Item Name"
              />

              {/* Code */}
              <InputField
                label="Code"
                optional={true}
                value={codeDraft}
                isYellow={false}
                flex="1 1 90px"
                minWidth="80px"
                onChange={setCodeDraft}
                placeholder="Code"
              />

              {/* Dropdown 2: Item Description (Combobox) */}
              <ComboField
                label="Item Description"
                value={descriptionDraft}
                options={plumbingDescriptionOptions}
                isYellow={true}
                flex="2 1 200px"
                minWidth="160px"
                onChange={setDescriptionDraft}
                placeholder="Item Description"
              />

              {/* Quantity Field */}
              <InputField
                label="Qty"
                value={qtyDraft}
                isYellow={true}
                numeric={true}
                flex="0.8 1 70px"
                minWidth="60px"
                onChange={setQtyDraft}
                placeholder="1"
              />

              {/* Note */}
              <InputField
                label="Note"
                value={noteDraft}
                isYellow={false}
                flex="1.5 1 120px"
                minWidth="100px"
                onChange={setNoteDraft}
                placeholder="Note"
              />

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAdd}
                style={{ ...S.addBtn, flex: "0 0 auto" }}
              >
                + Add Fixture
              </button>
            </div>

            <div style={S.note}>
              Standard plumbing fixtures and fittings from Bunnings workbook.
            </div>
          </div>
        )}
      </div>

      {/* ═══ CARD 2: ENTERED PLUMBING TABLE ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection2Open(!isSection2Open)} style={S.cardTitle}>
          <span>2. Entered plumbing fixtures {totalCount > 0 ? `(${totalCount})` : ""}</span>
          <EnteredTaskActions
            onAutoFill={() => onAddDataAI?.("fow_plumbing")}
            onClear={onClearData}
            isOpen={isSection2Open}
            onToggle={() => setIsSection2Open((v) => !v)}
          />
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>{isSection2Open ? "▲" : "▼"}</span>
        </div>

        {isSection2Open && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", tableLayout: "auto" }}>
              <thead>
                <tr style={{ background: "#1e3a5f", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", width: "36px", textAlign: "center" }}>#</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", minWidth: "130px" }}>Item Name</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", width: "90px" }}>Code</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", minWidth: "160px" }}>Description</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", width: "60px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "8px 12px", fontWeight: 700, fontSize: "11px", minWidth: "110px" }}>Note</th>
                  <th style={{ padding: "8px 12px", width: "70px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {totalCount === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>
                      No plumbing fixtures entered.
                    </td>
                  </tr>
                ) : (
                  groupedPlumbingByLevel.map(({ level, items }) => {
                    const isLower = level === "GF" || level === "LEVEL 1" || level === "GROUND FLOOR" || level === "GROUND";
                    return (
                      <React.Fragment key={level}>
                        <tr style={{
                          background: isLower ? "#f0fdf4" : "#fefce8",
                          borderTop: "2px solid #cbd5e1",
                          borderBottom: "1px solid #e2e8f0"
                        }}>
                          <td colSpan={7} style={{ padding: "6px 10px", fontWeight: 800, fontSize: "11px" }}>
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
                                {items.length} {items.length === 1 ? "fixture" : "fixtures"}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {items.map((item) => {
                          const globalIdx = (entries || []).findIndex(e => e.id === item.id);
                          const idx = globalIdx >= 0 ? globalIdx : 0;
                          const isEditing = editingId === item.id;
                          const current = isEditing ? editData : item;

                          if (isEditing) {
                            return (
                              <tr
                                key={item.id || idx}
                                data-editing-row-id={item.id}
                                style={{ borderBottom: "1px solid #e2e8f0", background: "#fef9c3" }}
                              >
                                <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600, color: "#64748b" }}>{idx + 1}</td>
                                <td style={{ padding: "6px 8px", minWidth: "140px" }}>
                                  <ComboField
                                    value={current.itemName || ""}
                                    options={plumbingItemNameOptions}
                                    isYellow={true}
                                    onChange={handleEditItemNameChange}
                                    placeholder="Item Name"
                                  />
                                </td>
                                <td style={{ padding: "6px 8px" }}>
                                  <input
                                    type="text"
                                    value={current.code || ""}
                                    onChange={(e) => setEditData({ ...current, code: e.target.value })}
                                    style={{ ...S.input(false), height: "34px", fontSize: "11px", padding: "4px 8px" }}
                                  />
                                </td>
                                <td style={{ padding: "6px 8px", minWidth: "160px" }}>
                                  <ComboField
                                    value={current.description || ""}
                                    options={plumbingDescriptionOptions}
                                    isYellow={true}
                                    onChange={(v) => setEditData({ ...current, description: v })}
                                    placeholder="Item Description"
                                  />
                                </td>
                                <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                  <input
                                    type="number"
                                    value={current.qty || 1}
                                    onChange={(e) => setEditData({ ...current, qty: e.target.value })}
                                    style={{ ...S.input(true), minWidth: "45px", height: "34px", fontSize: "11px", textAlign: "center", padding: "4px 6px" }}
                                  />
                                </td>
                                <td style={{ padding: "6px 8px" }}>
                                  <input
                                    type="text"
                                    value={current.note || ""}
                                    onChange={(e) => setEditData({ ...current, note: e.target.value })}
                                    style={{ ...S.input(false), height: "34px", fontSize: "11px", padding: "4px 8px" }}
                                  />
                                </td>
                                <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                  <div style={{ display: "inline-flex", gap: "4px" }}>
                                    <button
                                      type="button"
                                      onClick={handleSaveEdit}
                                      style={{ ...S.editBtn, background: "#dcfce7", color: "#16a34a", borderColor: "#86efac" }}
                                      title="Save"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setEditingId(null); setEditData({}); }}
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

                          return (
                            <tr
                              key={item.id || idx}
                              onDoubleClick={() => handleStartEdit(item)}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                                background: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                                cursor: "pointer"
                              }}
                              title="Double-click to edit fixture inline"
                            >
                              {/* # */}
                              <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: "#64748b" }}>
                                {idx + 1}
                              </td>

                              {/* Item Name */}
                              <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1d4ed8" }}>
                                {item.itemName || item.item_name || "—"}
                              </td>

                              {/* Code */}
                              <td style={{ padding: "8px 12px", color: "#64748b", fontSize: "11px" }}>
                                {item.code || "—"}
                              </td>

                              {/* Description */}
                              <td style={{ padding: "8px 12px", color: "#334155" }}>
                                {item.description || "—"}
                              </td>

                              {/* Qty */}
                              <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#2563eb" }}>
                                {item.qty || 1}
                              </td>

                              {/* Note */}
                              <td style={{ padding: "8px 12px", color: "#64748b", fontSize: "11px" }}>
                                {item.note || "—"}
                              </td>

                              {/* Action Buttons */}
                              <td style={{ padding: "8px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                                <div style={{ display: "inline-flex", gap: "5px", alignItems: "center" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(item)}
                                    style={S.editBtn}
                                    title="Edit fixture"
                                  >
                                    ✎
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemove(item.id)}
                                    style={S.deleteBtn}
                                    title="Delete fixture"
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

        {/* Footer: Save to Database */}
        {totalCount > 0 && (
          <div style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ fontSize: "12px", color: "#475569", fontWeight: 600 }}>
              {totalCount} {totalCount === 1 ? "plumbing fixture" : "plumbing fixtures"} calculated
            </span>
            <button
              type="button"
              onClick={handleSaveToDatabase}
              disabled={isSaving}
              style={{
                padding: "8px 20px",
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
