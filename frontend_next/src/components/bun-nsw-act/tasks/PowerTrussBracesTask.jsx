import React, { useState, useEffect, useMemo, useRef } from "react";
import useCurrentTaskFloorLevel from "./useCurrentTaskFloorLevel";
import EnteredTaskActions from "@/components/shared/EnteredTaskActions";
import FloorLevelGroupRow from "./FloorLevelGroupRow";
import { TaskRowNumber } from "./TaskUi";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";
import { POWER_TRUSS_TYPES } from "@/constants/procurementFormParity";
import { normalizeFloorLevelCode } from "@/utils/floorLevel";
import { resolveDropdownValue } from "@/utils/dropdownValueGuard";
import { shouldApplyDatabaseTaskLoad } from "@/utils/procurementAutoFill";
import DimensionPair from "@/components/shared/forms/DimensionPair";
import TypeQtyFields from "@/components/shared/forms/TypeQtyFields";

// ══════════════════════════════════════════════════════
// CONSTANTS & OPTIONS
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
  unitTag: {
    fontSize: "9px",
    color: "#94a3b8",
    fontWeight: 400,
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
  select: {
    padding: "6px 10px",
    fontSize: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#ffffff",
    outline: "none",
    boxSizing: "border-box",
    cursor: "pointer",
    minWidth: "60px",
    height: "34px",
    width: "100%",
  },
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

function InputField({ label, unit, value, flex, minWidth, isYellow, onChange, placeholder, numeric }) {
  return (
    <div
      style={{
        ...S.fieldWrap,
        flex: flex || "1 1 auto",
        minWidth: minWidth || "80px",
      }}
    >
      {label && (
        <span style={S.fieldLabel}>
          {label}
          {unit && <span style={S.unitTag}>{unit}</span>}
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

function SelectField({ label, value, options = [], flex, minWidth, onChange }) {
  return (
    <div
      style={{
        ...S.fieldWrap,
        flex: flex || "1 1 auto",
        minWidth: minWidth || "90px",
      }}
    >
      {label && <span style={S.fieldLabel}>{label}</span>}
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={S.select}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// ══════════════════════════════════════════════════════
// MAIN POWER TRUSS BRACES TASK COMPONENT
// ══════════════════════════════════════════════════════

export default function PowerTrussBracesTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  activeJobNumber,
  onClearData
}) {
  const { user, currentJobId, currentProjectName } = useAppModel();

  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isSection2Open, setIsSection2Open] = useState(true);

  // Draft input state
  const floorLevel = useCurrentTaskFloorLevel(formData);
  const [wallHeightDraft, setWallHeightDraft] = useState("");
  const [lengthDraft, setLengthDraft] = useState("");
  const [typeDraft, setTypeDraft] = useState("Column");
  const [qtyDraft, setQtyDraft] = useState("1");

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const editingRowIdRef = useRef(null);
  const editRowDataRef = useRef({});
  const entriesRef = useRef(entries);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [reloadMsg, setReloadMsg] = useState(null);
  // ── Auto-load from DB: read-only / edit mode ──
  const [dataSource, setDataSource] = useState(null);       // "db" | "local" | null
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(null);

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

  // Generated/GPT/cache rows may only keep values exposed by this task's dropdowns.
  useEffect(() => {
    if (!onSetEntries || !Array.isArray(entries) || entries.length === 0) return;
    let changed = false;
    const next = entries.map((row) => {
      const isGenerated = row?.ai_generated || row?.generatedByAI || row?.generated_by === "gpt" || String(row?.autofill_source || "").includes("drawing");
      if (!isGenerated) return row;
      const type = resolveDropdownValue(row?.type, POWER_TRUSS_TYPES, { fallback: "" });
      const floor = resolveDropdownValue(normalizeFloorLevelCode(row?.floorLevel || row?.floor_level || "GF"), FLOOR_LEVEL_OPTIONS, { fallback: "" });
      if (type === row?.type && floor === (row?.floorLevel || row?.floor_level)) return row;
      changed = true;
      return { ...row, type, floorLevel: floor };
    });
    if (changed) onSetEntries(next);
  }, [entries, onSetEntries]);

  // Group entries by FloorLevel
  const groupedTrussByLevel = useMemo(() => {
    const groups = {};
    (entries || []).forEach(item => {
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

    return sortedLevels.map(lvl => ({
      level: lvl,
      items: groups[lvl]
    }));
  }, [entries]);

  const handleStartEdit = (item) => {
    setIsReadOnly(false);
    setEditingRowId(item.id);
    setEditRowData({
      ...item,
      floorLevel: item.floorLevel || item.floor_level || "GF",
      wallHeight: item.wallHeight || item.wall_height || "",
      length: item.length || "",
      type: item.type || "Column",
      qty: item.qty != null ? item.qty : 1,
    });
  };

  const handleSaveInlineEdit = (idToSave) => {
    const targetId = idToSave || editingRowIdRef.current;
    if (!targetId || !onSetEntries) return;
    const currentData = editRowDataRef.current;
    const q = parseFloat(currentData.qty) || 1;

    onSetEntries(prev => {
      const currentList = Array.isArray(prev) ? prev : (entriesRef.current || []);
      return currentList.map(item => item.id === targetId ? {
        ...item,
        ...currentData,
        floorLevel: currentData.floorLevel || item.floorLevel || item.floor_level || "GF",
        wallHeight: currentData.wallHeight !== undefined ? currentData.wallHeight : item.wallHeight,
        length: currentData.length !== undefined ? currentData.length : item.length,
        type: currentData.type || item.type || "Column",
        qty: q
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

  // ── Auto-load saved data from DB when job changes ──
  const resolvedJobKey = String(activeJobNumber || currentProjectName || currentJobId || "").trim();
  useEffect(() => {
    if (!resolvedJobKey || resolvedJobKey.toLowerCase() === "default" || resolvedJobKey.toLowerCase() === "testai") return;
    if (autoLoadAttempted === resolvedJobKey) return;
    setAutoLoadAttempted(resolvedJobKey);

    let cancelled = false;
    const autoLoad = async () => {
      setIsLoadingDb(true);
      try {
        const res = await ApiService.fetchPowerTrussJobs(resolvedJobKey);
        if (cancelled) return;
        if (!shouldApplyDatabaseTaskLoad()) return;
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const loaded = res.data
            .filter((r) => r.wall_height || r.length || r.type)
            .map((r, idx) => ({
              id: `ptb-${r.id || Date.now()}-${idx}`,
              floorLevel: r.floor_level || r.floorLevel || "GF",
              wallHeight: r.wall_height || r.wallHeight || "",
              length: r.length || "",
              type: r.type || "Column",
              qty: r.qty != null ? Number(r.qty) : 1,
              source: "db",
              autofill_source: "db",
            }));

          if (loaded.length > 0 && onSetEntries) {
            onSetEntries(loaded);
            const first = loaded[0];
            if (first) {
              setWallHeightDraft(first.wallHeight || "");
              setLengthDraft(first.length || "");
              setTypeDraft(first.type || "Column");
              setQtyDraft(String(first.qty || 1));
            }
            setDataSource("db");
            setIsReadOnly(true);
          } else {
            setDataSource(null);
            setIsReadOnly(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Auto-load Power Truss data from DB skipped:", err);
          setDataSource(null);
          setIsReadOnly(false);
        }
      } finally {
        if (!cancelled) setIsLoadingDb(false);
      }
    };
    autoLoad();
    return () => { cancelled = true; };
  }, [resolvedJobKey]);

  const handleReloadFromDb = async (force = true) => {
    const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim();
    if (!force && (!target || target.toLowerCase() === "default" || target.toLowerCase() === "testai")) return;
    setIsLoadingDb(true);
    setReloadMsg(null);

    try {
      const res = await ApiService.fetchPowerTrussJobs(target);
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        const loaded = res.data
          .filter((r) => r.wall_height || r.length || r.type)
          .map((r, idx) => ({
            id: `ptb-${r.id || Date.now()}-${idx}`,
            floorLevel: r.floor_level || r.floorLevel || "GF",
            wallHeight: r.wall_height || r.wallHeight || "",
            length: r.length || "",
            type: r.type || "Column",
            qty: r.qty != null ? Number(r.qty) : 1,
            source: "manual",
            autofill_source: "manual",
          }));

        if (loaded.length > 0 && onSetEntries) {
          onSetEntries(loaded);
          setDataSource("db");
          setIsReadOnly(true);
          const first = loaded[0];
          if (first) {
            setWallHeightDraft(first.wallHeight || "");
            setLengthDraft(first.length || "");
            setTypeDraft(first.type || "Column");
            setQtyDraft(String(first.qty || 1));
          }
          if (force) {
            setReloadMsg({ type: "success", text: `Loaded ${loaded.length} ${loaded.length === 1 ? "row" : "rows"} from SQL` });
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
      console.error("Error loading Power Truss Braces from SQL:", err);
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

  const handleAdd = () => {
    const wh = String(wallHeightDraft || "").trim();
    const len = String(lengthDraft || "").trim();
    const t = typeDraft || "Column";
    const q = parseFloat(qtyDraft) || 1;

    if (!wh && !len) return;

    const newEntry = {
      id: `ptb-${Date.now()}`,
      floorLevel: floorLevel || "GF",
      wallHeight: wh,
      length: len,
      type: t,
      qty: q,
    };

    if (onSetEntries) {
      onSetEntries((prev) => [...(prev || []), newEntry]);
    }

    // Reset draft fields
    setWallHeightDraft("");
    setLengthDraft("");
    setTypeDraft("Column");
    setQtyDraft("1");
  };

  const handleRemove = (id) => {
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

  const handleSaveToDatabase = async () => {
    if (!entries || entries.length === 0) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const items = (entries || []).map((item) => ({
        floor_level: item.floorLevel || item.floor_level || "GF",
        wall_height: item.wallHeight || item.wall_height || "",
        length: item.length || "",
        type: item.type || "Column",
        qty: item.qty != null ? Number(item.qty) : 1,
      }));

      const targetJob = activeJobNumber || currentProjectName || currentJobId || "TestAI";
      const payload = {
        user_update: user?.username || user?.name || "admin",
        jobs: [
          {
            id_job_hw: String(targetJob),
            items,
          },
        ],
      };

      const res = await ApiService.savePowerTrussJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setDataSource("db");
        setIsReadOnly(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        alert(res?.detail || res?.message || "Could not save Power Truss Braces records to database.");
      }
    } catch (err) {
      console.error("Save Power Truss Braces error:", err);
      alert("Error saving Power Truss Braces to database: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* ═══ CARD 1: POWER TRUSS BRACES SETUP ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection1Open(!isSection1Open)} style={S.cardTitle}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>1. Power truss braces</span>
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
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              {isSection1Open ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "flex-end" }}>

              {/* Wall Height + Length — shared DimensionPair */}
              <DimensionPair
                heightValue={wallHeightDraft}
                lengthValue={lengthDraft}
                onHeightChange={setWallHeightDraft}
                onLengthChange={setLengthDraft}
                unit="mm"
                heightLabel="Wall Height"
                lengthLabel="Length"
                heightPlaceholder="Wall Height"
                lengthPlaceholder="Length"
                style={{ flex: "2 1 280px" }}
              />

              {/* Type + Qty — shared TypeQtyFields */}
              <TypeQtyFields
                typeValue={typeDraft}
                qtyValue={qtyDraft}
                onTypeChange={setTypeDraft}
                onQtyChange={setQtyDraft}
                typeOptions={POWER_TRUSS_TYPES}
                typeLabel="Type"
                qtyLabel="Qty"
                style={{ flex: "1.5 1 180px" }}
              />

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAdd}
                style={{ ...S.addBtn, flex: "0 0 auto" }}
              >
                + Add Power Truss
              </button>
            </div>

            <div style={S.note}>
              Standard Power Truss Braces specification from Bunnings workbook.
            </div>
          </div>
        )}
      </div>

      {/* ═══ CARD 2: ENTERED POWER TRUSS TABLE ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection2Open(!isSection2Open)} style={S.cardTitle}>
          <span>2. Entered power truss braces {totalCount > 0 ? `(${totalCount})` : ""}</span>
          <EnteredTaskActions
            onAutoFill={() => onAddDataAI?.("power_truss_braces")}
            onAddData={() => handleReloadFromDb(true)}
            addDataDisabled={isLoadingDb}
            onClear={onClearData}
            isOpen={isSection2Open}
            onToggle={() => setIsSection2Open((v) => !v)}
            onSave={handleSaveToDatabase}
            saveDisabled={isSaving}
            saveStatus={isSaving ? "saving" : saveSuccess ? "success" : "idle"}
            dataSource={dataSource}
            isReadOnly={isReadOnly}
            isLoadingFromDb={isLoadingDb}
            onEdit={() => setIsReadOnly(false)}
          />
        </div>

        {isSection2Open && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", tableLayout: "auto" }}>
              <thead>
                <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 700, width: "36px", textAlign: "center" }}>#</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, minWidth: "130px" }}>Wall Height (mm)</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, minWidth: "130px" }}>Length (mm)</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, minWidth: "110px" }}>Type</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, width: "65px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "6px 8px", width: "70px", textAlign: "center" }}></th>
                </tr>
              </thead>
              <tbody>
                {totalCount === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "11px" }}>
                      No power truss braces entered. Fill the inputs above and click <b>+ Add Power Truss</b>.
                    </td>
                  </tr>
                ) : (
                  groupedTrussByLevel.map(({ level, items }) => {
                  return (
                    <React.Fragment key={level}>
                      <FloorLevelGroupRow level={level} colSpan={6} count={items.length} unitLabel="item" unitLabelPlural="items" />
                      {items.map((item) => {
                          const globalIdx = (entries || []).findIndex(e => e.id === item.id);
                          const idx = globalIdx >= 0 ? globalIdx : 0;
                          const isSelected = selectedEntryId === item.id;
                          const isRowEditing = editingRowId === item.id;

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
                                handleStartEdit(item);
                              }}
                              onClick={() => {
                                if (!isRowEditing) {
                                  if (editingRowId && editingRowId !== item.id) {
                                    handleSaveInlineEdit(editingRowId);
                                  }
                                  const nextSelected = isSelected ? null : item.id;
                                  setSelectedEntryId(nextSelected);
                                  if (!isSelected) {
                                    setWallHeightDraft(item.wallHeight || item.wall_height || "");
                                    setLengthDraft(item.length || "");
                                    setTypeDraft(item.type || "Column");
                                    setQtyDraft(String(item.qty || 1));
                                  }
                                }
                              }}
                              style={{
                                borderBottom: "1px solid #e2e8f0",
                                background: isRowEditing ? "#fef3c7" : (isSelected ? "#dbeafe" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc")),
                                cursor: isRowEditing ? "default" : "pointer",
                                outline: isSelected ? "2px solid #3b82f6" : "none",
                                outlineOffset: "-1px",
                                transition: "background 0.15s ease"
                              }}
                            >
                              <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}><TaskRowNumber index={idx} row={item} /></td>

                              {/* Wall Height */}
                              <td style={{ padding: "4px 8px" }}>
                                {isRowEditing ? (
                                  <input
                                    type="text"
                                    value={editRowData.wallHeight || ""}
                                    onChange={(e) => setEditRowData({ ...editRowData, wallHeight: e.target.value })}
                                    style={{ width: "90px", padding: "2px 4px", fontSize: "10.5px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                                  />
                                ) : (
                                  <span style={{ fontWeight: 700, color: "#1e293b" }}>{item.wallHeight || item.wall_height || "—"}</span>
                                )}
                              </td>

                              {/* Length */}
                              <td style={{ padding: "4px 8px" }}>
                                {isRowEditing ? (
                                  <input
                                    type="text"
                                    value={editRowData.length || ""}
                                    onChange={(e) => setEditRowData({ ...editRowData, length: e.target.value })}
                                    style={{ width: "90px", padding: "2px 4px", fontSize: "10.5px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                                  />
                                ) : (
                                  <span style={{ color: "#334155" }}>{item.length || "—"}</span>
                                )}
                              </td>

                              {/* Type */}
                              <td style={{ padding: "4px 8px" }}>
                                {isRowEditing ? (
                                  <select
                                    value={editRowData.type || "Column"}
                                    onChange={(e) => setEditRowData({ ...editRowData, type: e.target.value })}
                                    style={{ width: "100%", padding: "2px 4px", fontSize: "10.5px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                                  >
                                    {POWER_TRUSS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                ) : (
                                  <span style={{ fontWeight: 600, color: item.type === "Brace" ? "#d97706" : "#2563eb" }}>
                                    {item.type || "Column"}
                                  </span>
                                )}
                              </td>

                              {/* Qty */}
                              <td style={{ padding: "4px 8px", textAlign: "center" }}>
                                {isRowEditing ? (
                                  <input
                                    type="number"
                                    value={editRowData.qty !== undefined ? editRowData.qty : item.qty}
                                    onChange={(e) => setEditRowData({ ...editRowData, qty: e.target.value })}
                                    style={{ width: "45px", padding: "2px 4px", fontSize: "10.5px", textAlign: "center", borderRadius: "3px", border: "1px solid #3b82f6" }}
                                  />
                                ) : (
                                  <span style={{ fontWeight: 700, color: "#2563eb" }}>{item.qty || 1}</span>
                                )}
                              </td>

                              {/* Actions */}
                              <td style={{ padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                                {isRowEditing ? (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleSaveInlineEdit(item.id); }}
                                      style={{ background: "none", border: "none", color: "#16a34a", cursor: "pointer", fontWeight: 800, fontSize: "13px", padding: "0 2px" }}
                                      title="Save"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setEditingRowId(null); }}
                                      style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontWeight: 800, fontSize: "11px", padding: "0 2px" }}
                                      title="Cancel"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStartEdit(item);
                                      }}
                                      style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                                      title="Edit"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleRemove(item.id); }}
                                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px", padding: "0 2px" }}
                                      title="Delete"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                )}
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
            padding: "8px 12px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px"
          }}>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
              {totalCount} {totalCount === 1 ? "item" : "items"} entered
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {saveSuccess && (
                <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: 700 }}>
                  ✓ Saved to SQL!
                </span>
              )}
              
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
