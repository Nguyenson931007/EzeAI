import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import useCurrentTaskFloorLevel from "./useCurrentTaskFloorLevel";
import FloorLevelGroupRow from "./FloorLevelGroupRow";
import { EnteredDataCard, TaskField as Field, TaskSummaryTable, TaskEmptyRow, TaskSummaryFooter, TaskRowNumber } from "./TaskUi";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";
import { SHELVING_TYPES, SHELVING_SIZES, SHELVING_EXTRA_FIELDS } from "@/constants/procurementFormParity";
import { normalizeFloorLevelCode } from "@/utils/floorLevel";
import { resolveDropdownValue } from "@/utils/dropdownValueGuard";
import { shouldApplyDatabaseTaskLoad } from "@/utils/procurementAutoFill";

const parseShelvingExtras = (value) => {
  try { if (value && typeof value === "object") return value; return value ? JSON.parse(value) : {}; } catch { return {}; }
};

// ══════════════════════════════════════════════════════
// CONSTANTS & OPTIONS (aligned with Bunnings workbook)
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

const normalizeShelvingSize = (s) => (s ? String(s).replace(/[×\u00d7X]/g, "x").trim() : "1500x450");

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
  },
  input: {
    padding: "7px 10px",
    fontSize: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#fefce8",
    outline: "none",
    boxSizing: "border-box",
    minWidth: "60px",
    height: "34px",
  },
  select: {
    padding: "6px 10px",
    fontSize: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
    cursor: "pointer",
    minWidth: "60px",
    height: "34px",
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

// ══════════════════════════════════════════════════════
// MAIN SHELVING TASK COMPONENT
// ══════════════════════════════════════════════════════

export default function ShelvingTask({
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
  const [isExtrasOpen, setIsExtrasOpen] = useState(false);

  // Draft input state
  const floorLevel = useCurrentTaskFloorLevel(formData);
  const [typeDraft, setTypeDraft] = useState("Robe");
  const [sizeDraft, setSizeDraft] = useState("1500x450");
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

  // Generated/GPT/cache rows must stay inside the same dropdown values used by the form.
  useEffect(() => {
    if (!onSetEntries || !Array.isArray(entries) || entries.length === 0) return;
    let changed = false;
    const next = entries.map((row) => {
      const isGenerated = row?.ai_generated || row?.generatedByAI || row?.generated_by === "gpt" || String(row?.autofill_source || "").includes("drawing");
      if (!isGenerated) return row;
      const type = resolveDropdownValue(row?.type, SHELVING_TYPES, { fallback: "" });
      const size = resolveDropdownValue(row?.size, SHELVING_SIZES, { fallback: "" });
      const floor = resolveDropdownValue(normalizeFloorLevelCode(row?.floorLevel || row?.floor_level || "GF"), FLOOR_LEVEL_OPTIONS, { fallback: "" });
      if (type === row?.type && size === row?.size && floor === (row?.floorLevel || row?.floor_level)) return row;
      changed = true;
      return { ...row, type, size, floorLevel: floor };
    });
    if (changed) onSetEntries(next);
  }, [entries, onSetEntries]);

  // Group entries by FloorLevel
  const groupedShelvingByLevel = useMemo(() => {
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
      type: item.type || "Robe",
      size: normalizeShelvingSize(item.size),
      qty: item.qty != null ? item.qty : 1,
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
        type: currentData.type || item.type || "Robe",
        size: normalizeShelvingSize(currentData.size || item.size),
        qty: q
      } : item);
    });
    setEditingRowId(null);
  };

  // Auto-save when clicking outside editing row
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
        const res = await ApiService.fetchShelvingJobs(resolvedJobKey);
        if (cancelled) return;
        if (!shouldApplyDatabaseTaskLoad("shelving")) return;
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const loaded = res.data
            .filter((r) => r.type || r.size || r.qty)
            .map((r, idx) => ({
              id: `shv-${r.shelving_id || Date.now()}-${idx}`,
              floorLevel: r.floor_level || r.floorLevel || "GF",
              type: r.type || "Robe",
              size: normalizeShelvingSize(r.size),
              qty: r.qty != null ? Number(r.qty) : 1,
              source: "db",
              autofill_source: "db",
            }));

          if (loaded.length > 0 && onSetEntries) {
            onSetEntries(loaded);
            const first = loaded[0];
            if (first) {
              setTypeDraft(first.type || "Robe");
              setSizeDraft(first.size || "1500x450");
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
          console.warn("Auto-load Shelving data from DB skipped:", err);
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
      const res = await ApiService.fetchShelvingJobs(target);
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        const loaded = res.data
          .filter((r) => r.type || r.size || r.qty)
          .map((r, idx) => ({
            id: `shv-${r.shelving_id || Date.now()}-${idx}`,
            floorLevel: r.floor_level || r.floorLevel || "GF",
            type: r.type || "Robe",
            size: normalizeShelvingSize(r.size),
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
            setTypeDraft(first.type || "Robe");
            setSizeDraft(first.size || "1500x450");
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
      console.error("Error loading Shelving from SQL:", err);
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
    const q = parseInt(qtyDraft, 10) || 1;
    if (!typeDraft || !sizeDraft) return;

    const newEntry = {
      id: `shv-${Date.now()}`,
      floorLevel: floorLevel || "GF",
      type: typeDraft,
      size: sizeDraft,
      qty: q,
    };

    if (onSetEntries) {
      onSetEntries((prev) => [...(prev || []), newEntry]);
    }
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
        type: item.type || "Robe",
        size: normalizeShelvingSize(item.size),
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

      const res = await ApiService.saveShelvingJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setDataSource("db");
        setIsReadOnly(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        alert(res?.detail || res?.message || "Could not save Shelving records to database.");
      }
    } catch (err) {
      console.error("Save Shelving error:", err);
      alert("Error saving Shelving to database: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* ═══ CARD 1: SHELVING UNITS SETUP ═══ */}
      <div style={S.card}>
        <div onClick={() => setIsSection1Open(!isSection1Open)} style={S.cardTitle}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>1. Shelving units</span>
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

              {/* Type Dropdown */}
              <Field
                label="Type"
                type="select"
                value={typeDraft}
                options={SHELVING_TYPES}
                flex="1.2 1 120px"
                minWidth="110px"
                onChange={setTypeDraft}
              />

              {/* Shelving size Dropdown */}
              <Field
                label="Shelving size"
                type="select"
                value={sizeDraft}
                options={SHELVING_SIZES}
                flex="2 1 160px"
                minWidth="140px"
                onChange={setSizeDraft}
              />

              {/* Quantity Field */}
              <Field
                label="Quantity"
                type="number"
                value={qtyDraft}
                flex="0.8 1 80px"
                minWidth="70px"
                onChange={setQtyDraft}
              />

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAdd}
                style={{ ...S.addBtn, flex: "0 0 auto" }}
              >
                + Add Shelving
              </button>
            </div>

            <div style={S.note}>
              Standard Robe and Linen shelving sizes from Bunnings workbook.
            </div>
          </div>
        )}
      </div>

      {/* ═══ CARD 2: MANUAL EXTRAS ═══ */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsExtrasOpen((v) => !v)}
          style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: isExtrasOpen ? "1px solid #e2e8f0" : "none", fontWeight: 800, fontSize: "12px", color: "#0f2744", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
        >
          <span>2. Manual extras</span>
          <span style={{ fontSize: "11px", color: "#64748b" }}>{isExtrasOpen ? "▲" : "▼"}</span>
        </div>
        {isExtrasOpen && (
          <div style={{ padding: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "8px" }}>
            {SHELVING_EXTRA_FIELDS.map(([key, label]) => {
              const extras = parseShelvingExtras(formData?.shelving_extras);
              return <label key={key} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700 }}>{label}</span>
                <input inputMode="decimal" value={extras[key] ?? "0"} onFocus={(e) => e.currentTarget.select()} onChange={(e) => {
                  if (!/^\d*(?:[.,]\d*)?$/.test(e.target.value)) return;
                  const next = { ...extras, [key]: e.target.value };
                  if (onChange) onChange("shelving", "shelving_extras", JSON.stringify(next));
                }} style={{ height: "29px", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "4px 6px", fontSize: "10.5px", boxSizing: "border-box" }} />
              </label>;
            })}
          </div>
        )}
      </div>

      {/* ═══ CARD 3: ENTERED SHELVING TABLE ═══ */}
      <EnteredDataCard
        title={`3. Entered shelving${totalCount > 0 ? ` (${totalCount})` : ""}`}
        isOpen={isSection2Open}
        onToggle={() => setIsSection2Open((v) => !v)}
        onAutoFill={() => onAddDataAI?.("shelving")}
        onAddData={() => handleReloadFromDb(true)}
        addDataDisabled={isLoadingDb}
        onClear={onClearData}
        onSave={handleSaveToDatabase}
        saveDisabled={isSaving}
        saveStatus={isSaving ? "saving" : saveSuccess ? "success" : "idle"}
        dataSource={dataSource}
        isReadOnly={isReadOnly}
        isLoadingFromDb={isLoadingDb}
        onEdit={() => setIsReadOnly(false)}
      >
          <TaskSummaryTable minWidth="560px" compact>
              <thead>
                <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 700, width: "36px", textAlign: "center" }}>#</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, width: "25%", minWidth: "110px" }}>Type</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, minWidth: "150px" }}>Size</th>
                  <th style={{ padding: "6px 8px", fontWeight: 700, width: "65px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "6px 8px", width: "70px", textAlign: "center" }}></th>
                </tr>
              </thead>
              <tbody>
                {totalCount === 0 ? (
                  <TaskEmptyRow colSpan={5}>
                    No shelving units entered. Fill the inputs above and click <b>+ Add Shelving</b>.
                  </TaskEmptyRow>
                ) : (
                  groupedShelvingByLevel.map(({ level, items }) => (
                    <React.Fragment key={level}>
                      <FloorLevelGroupRow level={level} colSpan={5} count={items.length} unitLabel="item" unitLabelPlural="items" />
                      {items.map((item) => {
                        const globalIdx = (entries || []).findIndex((entry) => entry.id === item.id);
                        const idx = globalIdx >= 0 ? globalIdx : 0;
                        const isSelected = selectedEntryId === item.id;
                        const isRowEditing = editingRowId === item.id;
                        const controlStyle = { width: "100%", minWidth: 0, height: "27px", border: "1px solid #93c5fd", borderRadius: "4px", background: "#fff", padding: "2px 5px", fontSize: "10.5px", boxSizing: "border-box" };
                        const selectRow = () => {
                          setSelectedEntryId(item.id);
                          setTypeDraft(item.type || "Robe");
                          setSizeDraft(normalizeShelvingSize(item.size));
                          setQtyDraft(String(item.qty || 1));
                        };
                        return (
                          <tr
                            key={item.id || idx}
                            data-editing-row-id={isRowEditing ? item.id : undefined}
                            onClick={(event) => {
                              if (event.target.closest("button, input, select, textarea, a, [data-search-dropdown]")) return;
                              selectRow();
                            }}
                            onDoubleClick={(event) => {
                              if (event.target.closest("button, input, select, textarea, a, [data-search-dropdown]")) return;
                              event.preventDefault();
                              event.stopPropagation();
                              if (editingRowId && editingRowId !== item.id) handleSaveInlineEdit(editingRowId);
                              selectRow();
                              handleStartEdit(item);
                            }}
                            onKeyDown={(event) => {
                              if (!isRowEditing) return;
                              if (event.key === "Enter") { event.preventDefault(); handleSaveInlineEdit(item.id); }
                              else if (event.key === "Escape") { event.preventDefault(); setEditingRowId(null); }
                            }}
                            style={{
                              background: isSelected ? "#dbeafe" : undefined,
                              cursor: "pointer",
                              outline: isSelected ? "2px solid #3b82f6" : "none",
                              outlineOffset: "-1px"
                            }}
                            title="Click to select · Double-click to edit"
                          >
                            <td style={{ textAlign: "center", fontWeight: 700 }}><TaskRowNumber index={idx} row={item} /></td>
                            <td>
                              {isRowEditing ? (
                                <select value={editRowData.type || "Robe"} onChange={(event) => setEditRowData((prev) => ({ ...prev, type: event.target.value }))} style={controlStyle}>
                                  {SHELVING_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
                                </select>
                              ) : <strong style={{ color: item.type === "Linen" ? "#0f766e" : "#1d4ed8" }}>{item.type || "Robe"}</strong>}
                            </td>
                            <td>
                              {isRowEditing ? (
                                <select value={normalizeShelvingSize(editRowData.size)} onChange={(event) => setEditRowData((prev) => ({ ...prev, size: event.target.value }))} style={controlStyle}>
                                  {SHELVING_SIZES.map((value) => <option key={value} value={value}>{value}</option>)}
                                </select>
                              ) : (item.size || "—")}
                            </td>
                            <td style={{ textAlign: "center", fontWeight: 700, color: "#2563eb" }}>
                              {isRowEditing ? (
                                <input inputMode="numeric" value={editRowData.qty ?? 1} onChange={(event) => setEditRowData((prev) => ({ ...prev, qty: event.target.value }))} style={{ ...controlStyle, width: "64px", textAlign: "center" }} />
                              ) : (item.qty || 1)}
                            </td>
                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {isRowEditing ? (
                                <>
                                  <button type="button" onClick={(event) => { event.stopPropagation(); handleSaveInlineEdit(item.id); }} style={{ background: "none", border: 0, color: "#16a34a", cursor: "pointer", fontWeight: 900 }} title="Save row">✓</button>
                                  <button type="button" onClick={(event) => { event.stopPropagation(); setEditingRowId(null); }} style={{ background: "none", border: 0, color: "#64748b", cursor: "pointer", fontWeight: 900 }} title="Cancel edit">✕</button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemove(item.id);
                                  }}
                                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px" }}
                                  title="Remove shelving item"
                                >
                                  ✕
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
          </TaskSummaryTable>

        {/* Footer: Save to Database */}
        {totalCount > 0 && (
          <TaskSummaryFooter
            right={saveSuccess ? <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ Saved to SQL!</span> : null}
          >
            {totalCount} {totalCount === 1 ? "shelving item" : "shelving items"} entered
          </TaskSummaryFooter>
        )}
      </EnteredDataCard>

    </div>
  );
}
