import React, { useState, useEffect, useMemo, useRef } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { PROCUREMENT_TASK_KEYS } from "@/constants/procurementFormParity";
import { useCatalog } from "@/utils/catalogHelpers";

export default function CladdingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber
}) {
  const appModel = useAppModel ? useAppModel() : {};
  const activeCustomerShortName = getActiveClientShortName();
  const { items: catalogItems } = useCatalog(activeCustomerShortName, PROCUREMENT_TASK_KEYS.cladding);

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

  const groupedWallsByLevel = useMemo(() => {
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

  const [floorLevel, setFloorLevel] = useState("GF");
  const [wallHeight, setWallHeight] = useState("2.44");
  const [wallLength, setWallLength] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const editingRowIdRef = useRef(null);
  const editRowDataRef = useRef({});
  const entriesRef = useRef(entries);

  useEffect(() => {
    editingRowIdRef.current = editingRowId;
  }, [editingRowId]);

  useEffect(() => {
    editRowDataRef.current = editRowData;
  }, [editRowData]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const handleStartEdit = (w) => {
    setEditingRowId(w.id);
    setEditRowData({
      ...w,
      height: String(w.height || "2.44").replace("m", "").trim(),
      length: String(w.length || "0").replace("m", "").trim(),
      floorLevel: w.floorLevel || w.floor_level || "GF"
    });
  };

  const handleSaveInlineEdit = (idToSave) => {
    const targetId = idToSave || editingRowIdRef.current;
    if (!targetId || !onSetEntries) return;
    const currentData = editRowDataRef.current;
    const h = parseFloat(currentData.height) || 2.44;
    const l = parseFloat(currentData.length) || 0;
    const a = Number((h * l).toFixed(2));

    onSetEntries(prev => {
      const currentList = Array.isArray(prev) ? prev : (entriesRef.current || []);
      return currentList.map(item => item.id === targetId ? {
        ...item,
        ...currentData,
        floorLevel: currentData.floorLevel || item.floorLevel || "GF",
        height: currentData.height !== undefined ? (String(currentData.height).includes("m") ? currentData.height : `${h} m`) : item.height,
        length: currentData.length !== undefined ? (String(currentData.length).includes("m") ? currentData.length : `${l} m`) : item.length,
        area: `${a} m²`
      } : item);
    });
    setEditingRowId(null);
  };

  // Tự động lưu khi click ra ngoài dòng đang chỉnh sửa
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

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [isSection1Open, setIsSection1Open] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [reloadMsg, setReloadMsg] = useState(null);

  const handleResetData = () => {
    setFloorLevel("GF");
    setWallHeight("2.44");
    setWallLength("");
  };

  const handleReloadFromDb = async (force = true) => {
    const target = String(activeJobNumber || appModel?.currentProjectName || appModel?.currentJobId || "").trim().toLowerCase();
    if (!force && (!target || target === "default" || target === "testai")) return;
    setIsLoadingDb(true);
    setReloadMsg(null);
    try {
      const res = await ApiService.fetchCladdingJobs();
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        const matchedRows = res.data.filter(j => {
          if (!target || target === "default" || target === "testai") return true;
          const jn = String(j.job_number || "").trim().toLowerCase();
          const hw = String(j.IDJob_HW || j.hw_id || "").trim().toLowerCase();
          return (jn && jn === target) || (hw && hw === target);
        });

        if (matchedRows.length > 0) {
          const loaded = matchedRows.map((r, idx) => {
            const h = parseFloat(r.wall_height) || 2.44;
            const l = parseFloat(r.wall_length) || 0.0;
            const a = Number((h * l).toFixed(2));
            return {
              id: r.cladding_id ? `clad-${r.cladding_id}` : `clad-loaded-${Date.now()}-${idx}`,
              floorLevel: r.floor_level || "GF",
              height: `${h} m`,
              length: `${l} m`,
              area: `${a} m²`
            };
          });

          if (onSetEntries) {
            onSetEntries(loaded);
          }
          const first = loaded[0];
          if (first) {
            setFloorLevel(first.floorLevel || "GF");
            setWallHeight(String(parseFloat(first.height) || 2.44));
            setWallLength(String(parseFloat(first.length) || ""));
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
      console.error("Error loading Cladding from SQL:", err);
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

  const loadedJobRef = useRef(null);
  useEffect(() => {
    const target = String(activeJobNumber || appModel?.currentProjectName || appModel?.currentJobId || "").trim().toLowerCase();
    if (!target || target === "default" || target === "testai") return;
    if (entries && entries.length > 0) return;
    if (loadedJobRef.current === target) return;
    loadedJobRef.current = target;

    handleReloadFromDb(false);
  }, [activeJobNumber, appModel?.currentProjectName, appModel?.currentJobId, entries]);

  const handleSaveToMSSQL = async () => {
    if (!entries || entries.length === 0) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      let currentUsername = "";
      if (appModel?.user) {
        currentUsername = appModel.user.username || appModel.user.name || appModel.user.full_name || appModel.user.email || "";
      }
      if (!currentUsername) {
        try {
          const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
          if (userStr) {
            const u = JSON.parse(userStr);
            currentUsername = u.username || u.name || u.full_name || u.email || "";
          }
        } catch (e) {}
      }

      if (!currentUsername && typeof window !== "undefined") {
        currentUsername = localStorage.getItem("username") || localStorage.getItem("user_name") || "admin";
      }

      const savedJobId = activeJobNumber
        || appModel?.currentJobId 
        || appModel?.currentProjectName 
        || appModel?.current_hw_id 
        || (typeof window !== "undefined" ? (
            localStorage.getItem("ezefloor_last_active_job_id") 
            || localStorage.getItem("ezefloor_last_active_project_name") 
            || localStorage.getItem("currentJobId") 
            || localStorage.getItem("current_hw_id") 
            || sessionStorage.getItem("current_hw_id") 
            || "default"
          ) : "default");
      if (!savedJobId) {
        console.warn("Chưa chọn Job để lưu Cladding");
      }

      const payload = {
        user_update: currentUsername || "admin",
        jobs: [
          {
            id_job_hw: savedJobId || "default",
            walls: entries.map(e => {
              const hNum = parseFloat(String(e.height || "2.44").replace(/[^\d.]/g, "")) || 2.44;
              const lNum = parseFloat(String(e.length || "0").replace(/[^\d.]/g, "")) || 0.0;
              return {
                floor_level: e.floorLevel || e.floor_level || floorLevel || "GF",
                wall_height: hNum,
                wall_length: lNum,
                short_name: activeCustomerShortName
              };
            })
          }
        ]
      };

      const res = await ApiService.saveCladdingJobs(payload);
      if (res && res.success) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus(null), 3500);
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      console.error("Lỗi khi lưu Cladding vào MSSQL:", err);
      setSaveStatus("error");
      alert(`Lỗi khi lưu Cladding vào MSSQL: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCladdingWall = () => {
    const hM = parseFloat(wallHeight) || 2.44;
    const lM = parseFloat(wallLength) || (cadMetrics.externalWallLength ? Number(cadMetrics.externalWallLength.toFixed(1)) : 14.5);
    const areaM2 = Number((hM * lM).toFixed(2));

    const newEntry = {
      id: "clad-" + Date.now(),
      floorLevel: floorLevel || "GF",
      height: `${hM} m`,
      length: `${lM} m`,
      area: `${areaM2} m²`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setWallLength("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
    if (selectedEntryId === id) setSelectedEntryId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: EXTERNAL WALL MEASUREMENTS (MATCHING BUN-NSW-ACT) ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsSection1Open(!isSection1Open)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isSection1Open ? "1px solid #e2e8f0" : "none",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>1. External wall measurements</span>
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
              title="Reload Cladding data from MSSQL"
            >
              {isLoadingDb ? "⏳ Loading..." : "↻ Reload SQL"}
            </button>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              {isSection1Open ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px", display: "flex", alignItems: "flex-end", gap: "10px", flexWrap: "wrap" }}>
            {/* Floor Level */}
            <div style={{ flex: "1 1 120px" }}>
              <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Floor level</span>
              <select
                value={floorLevel}
                onChange={(e) => {
                  setFloorLevel(e.target.value);
                  if (onChange) onChange("cladding", "floor_level", e.target.value);
                }}
                className="task-field-select"
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "10.5px",
                  borderRadius: "5px",
                  border: "1px solid #cbd5e1",
                  fontWeight: 700,
                  background: "#f8fafc",
                  boxSizing: "border-box"
                }}
              >
                {FLOOR_LEVEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt} ({getFloorLevelDisplayName(opt)})</option>)}
              </select>
            </div>

            {/* Wall Height */}
            <div style={{ flex: "1 1 100px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Height</span>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>m</span>
              </div>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 2.44"
                value={wallHeight}
                onChange={(e) => setWallHeight(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "10.5px",
                  borderRadius: "5px",
                  border: "1px solid #fde047",
                  background: "#fffbeb",
                  boxSizing: "border-box"
                }}
              />
            </div>

            {/* Wall Length */}
            <div style={{ flex: "2 1 150px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Length</span>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>m</span>
              </div>
              <input
                type="number"
                step="0.01"
                placeholder="Enter lineal metres"
                value={wallLength}
                onChange={(e) => setWallLength(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "10.5px",
                  borderRadius: "5px",
                  border: "1px solid #fde047",
                  background: "#fffbeb",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <button
              type="button"
              onClick={handleAddCladdingWall}
              style={{
                padding: "8px 12px",
                background: "#0f2744",
                color: "#ffffff",
                border: "none",
                borderRadius: "5px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer"
              }}
            >
              + Add Cladding Wall
            </button>
          </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED WALL MEASUREMENTS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsSection2Open(!isSection2Open)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isSection2Open ? "1px solid #e2e8f0" : "none",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <span>2. Entered Cladding Walls ({(entries || []).length})</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection2Open ? "▲" : "▼"}
          </span>
        </div>

        {isSection2Open && (
          <>
            <div style={{ padding: "8px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                <thead>
                  <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                    <th style={{ padding: "5px 6px" }}>#</th>
                    <th style={{ padding: "5px 6px" }}>Wall Height</th>
                    <th style={{ padding: "5px 6px" }}>Wall Length</th>
                    <th style={{ padding: "5px 6px", textAlign: "right", width: "45px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedWallsByLevel.map(({ level, items }) => {
                    const isLower = level === "GF" || level === "LEVEL 1" || level === "GROUND FLOOR" || level === "GROUND";
                    return (
                      <React.Fragment key={level}>
                        <tr style={{
                          background: isLower ? "#f0fdf4" : "#fefce8",
                          borderTop: "2px solid #cbd5e1",
                          borderBottom: "1px solid #e2e8f0"
                        }}>
                          <td colSpan={4} style={{ padding: "6px 10px", fontWeight: 800, fontSize: "11px" }}>
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
                                {items.length} {items.length === 1 ? "wall" : "walls"}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {items.map((w) => {
                          const globalIdx = (entries || []).findIndex(e => e.id === w.id);
                          const idx = globalIdx >= 0 ? globalIdx : 0;
                          const isSelected = selectedEntryId === w.id;
                          const isRowEditing = editingRowId === w.id;

                          return (
                            <tr
                              key={w.id || idx}
                              data-editing-row-id={isRowEditing ? w.id : undefined}
                              onDoubleClick={(e) => {
                                if (isRowEditing) return;
                                if (e.target.closest && e.target.closest("button")) return;
                                if (editingRowId && editingRowId !== w.id) {
                                  handleSaveInlineEdit(editingRowId);
                                }
                                setSelectedEntryId(w.id);
                                if (onSelectEntry) onSelectEntry(w);
                                handleStartEdit(w);
                              }}
                              onClick={() => {
                                if (!isRowEditing) {
                                  if (editingRowId && editingRowId !== w.id) {
                                    handleSaveInlineEdit(editingRowId);
                                  }
                                  const nextSelected = isSelected ? null : w.id;
                                  setSelectedEntryId(nextSelected);
                                  if (!isSelected) {
                                    setFloorLevel(w.floorLevel || w.floor_level || "GF");
                                    setWallHeight(String(parseFloat(w.height) || 2.44));
                                    setWallLength(String(parseFloat(w.length) || ""));
                                  }
                                  if (onSelectEntry) onSelectEntry(isSelected ? null : w);
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
                              <td style={{ padding: "5px 6px", fontWeight: 700 }}>{idx + 1}</td>
                              
                              {/* Height */}
                              <td style={{ padding: "5px 6px" }}>
                                {isRowEditing ? (
                                  <input
                                    type="text"
                                    value={editRowData.height || ""}
                                    onChange={(e) => setEditRowData({ ...editRowData, height: e.target.value })}
                                    style={{ width: "65px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                                  />
                                ) : (
                                  w.height
                                )}
                              </td>

                              {/* Length */}
                              <td style={{ padding: "5px 6px" }}>
                                {isRowEditing ? (
                                  <input
                                    type="text"
                                    value={editRowData.length || ""}
                                    onChange={(e) => setEditRowData({ ...editRowData, length: e.target.value })}
                                    style={{ width: "65px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                                  />
                                ) : (
                                  w.length
                                )}
                              </td>

                              {/* Actions: Edit & Remove */}
                              <td style={{ padding: "5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                                {isRowEditing ? (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleSaveInlineEdit(w.id); }}
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
                                        setEditingRowId(w.id);
                                        setEditRowData({
                                          ...w,
                                          height: String(w.height || "2.44").replace("m", "").trim(),
                                          length: String(w.length || "0").replace("m", "").trim()
                                        });
                                      }}
                                      style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                                      title="Edit"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleRemoveEntry(w.id); }}
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
                  })}
                  {(!entries || entries.length === 0) && (
                    <tr>
                      <td colSpan={4} style={{ padding: "12px", textAlign: "center", color: "#94a3b8" }}>
                        No cladding walls entered yet. Fill the inputs above and click <b>+ Add Cladding Wall</b>.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── ACTION BUTTONS: SAVE (ONLY WHEN RESULTS EXIST) ── */}
            {entries && entries.length > 0 && (
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
                  {entries.length} {entries.length === 1 ? "wall" : "walls"} calculated
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={handleSaveToMSSQL}
                    disabled={isSaving}
                    style={{
                      padding: "4px 10px",
                      background: saveStatus === "success" ? "#15803d" : (saveStatus === "error" ? "#b91c1c" : "#1e293b"),
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "5px",
                      fontSize: "10.5px",
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
                    {isSaving ? "⏳ Saving..." : (saveStatus === "success" ? "✓ Saved!" : (saveStatus === "error" ? "❌ Error" : "💾 Save"))}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}