import React, { useState, useEffect, useMemo } from "react";
import { useAppModel } from "@/models/app.context";
import { ApiService } from "@/models/api.service";

export default function LockupTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber,
  selectedDoor: selectedDoorProp,
  selectedDoorIds: selectedDoorIdsProp,
  selectedId: selectedIdProp,
  selectedType: selectedTypeProp
}) {
  const {
    user,
    walls = [],
    wallsByPage = {},
    doors = [],
    doorsByPage = {},
    pages = [],
    scalesByPage = {},
    realScale,
    scaleValue = 1.0,
    currentPage = 0,
    currentJobId,
    currentProjectName,
    selectedDoor,
    selectedDoorIds,
    selectedId,
    selectedType,
    hoveredDoorId
  } = useAppModel();

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

  // Collapsible States
  const [isCard1Collapsed, setIsCard1Collapsed] = useState(false);
  const [isPrehungCollapsed, setIsPrehungCollapsed] = useState(false);
  const [isPreExtCollapsed, setIsPreExtCollapsed] = useState(false);
  const [isPreIntCollapsed, setIsPreIntCollapsed] = useState(false);
  const [isLooseJambCollapsed, setIsLooseJambCollapsed] = useState(false);
  const [isLooseExtCollapsed, setIsLooseExtCollapsed] = useState(false);
  const [isLooseIntCollapsed, setIsLooseIntCollapsed] = useState(false);
  const [isCard2Collapsed, setIsCard2Collapsed] = useState(false);

  const handleStartEdit = (row) => {
    setEditingRowId(row.id);
    const isExt = row.scope === "external" || row.isExternal;
    setEditRowData({
      mode: row.mode || (isExt ? "Prehung" : "Loose"),
      scope: row.scope || (isExt ? "external" : "internal"),
      location: row.location || (isExt ? "External Patio / Balcony" : "Internal Room"),
      label: row.label || row.door_name || row.door || "D-1",
      height: row.height || 2040,
      width: row.width || 820,
      size: row.size || `${row.height || 2040} × ${row.width || 820}`,
      thickness: row.thickness || (isExt ? 40 : 35),
      thicks: row.thicks || `${row.thickness || (isExt ? 40 : 35)}mm`,
      jamb_or_wall: row.jamb_or_wall || row.jambWall || (isExt ? "110mm Brick Veneer" : "90mm Timber Stud"),
      jamb_size: row.jamb_size || row.jambSize || (isExt ? "135mm" : "110mm"),
      hung: row.hung || (isExt ? "LH Prehung" : "RH Loose"),
      door_type: row.door_type || row.type || "Hinged",
      internal_type: row.internal_type || row.hfHo || (isExt ? "HO" : "HF"),
      color: row.color || "Primed White",
      door_stop: row.door_stop || row.stop || "Cushion Rubber Stop",
      default_qty: row.default_qty || row.qty || 1
    });
  };

  const handleSaveInlineEdit = (id) => {
    if (!onSetEntries) return;
    onSetEntries(prev => (prev || []).map(item => {
      if (item.id !== id) return item;
      return {
        ...item,
        ...editRowData,
        door_name: editRowData.label || editRowData.door_name || item.door_name,
        door: editRowData.label || editRowData.door || item.door,
        category: editRowData.mode === "Prehung" ? "Prehung" : "Loose Jamb",
        jambWall: editRowData.jamb_or_wall,
        jambSize: editRowData.jamb_size,
        type: editRowData.door_type,
        hfHo: editRowData.internal_type,
        stop: editRowData.door_stop,
        qty: editRowData.default_qty
      };
    }));
    setEditingRowId(null);
  };

  const DOOR_HEIGHT_OPTIONS = ["2040", "2340", "2600", "2650", "Spec"];

  const DOOR_WIDTH_OPTIONS = [
    "520",
    "620",
    "720",
    "770",
    "804",
    "810",
    "820",
    "870",
    "920",
    "970",
    "1020",
    "1200",
    "1640",
    "Spec"
  ];

  const DOOR_THICK_OPTIONS = ["35", "38", "40"];

  const DOOR_MODE_OPTIONS = ["Prehung", "Loose"];

  const DOOR_HUNG_OPTIONS = [
    "Hung A",
    "Hung B",
    "Hung CG",
    "Hung DG",
    "Hung G",
    "Pivot Door",
    "Double Door Set",
    "RH Pre Hung"
  ];

  const DOOR_TYPE_OPTIONS = [
    "Type A",
    "Type B",
    "Type CC",
    "Type DG",
    "Type C",
    "Type CG",
    "Pivot Frame A",
    "Pivot Frame B",
    "Steel Frame"
  ];

  const DOOR_STOP_OPTIONS = ["Cushion", "DS2 with Riser"];

  const INTERNAL_TYPE_OPTIONS = ["HF", "HO"];

  const COLOR_OPTIONS = ["CHR", "SCH"];

  const JAMB_SIZE_OPTIONS = [
    "Steel Frame",
    "112×19mm 5.4m",
    "112×19mm 5.4m Loose Jamb",
    "112x19mm",
    "92x18mm",
    "PINE DAR FJ PENCIL ROUND CLEAR++92X18MM 5.4M CLEAR 4 EDGE"
  ];

  const DOOR_PRODUCT_OPTIONS = [
    "Select or search...",
    "FLUSH PANEL HONEYCOMB CORE 2040X820X35MM",
    "SOLID CORE TIMBER DOOR 2040X820X40MM",
    "ROBEMASTER CAVITY SLIDER 2040X820X35MM",
    "CORINTHIAN MOTIVE PREHUNG 2040X820X35MM",
    "HUME PROGRES PREHUNG 2040X820X35MM"
  ];

  // Prehung - External Door State
  const [preExtDoorName, setPreExtDoorName] = useState("");
  const [preExtDoorProduct, setPreExtDoorProduct] = useState("Select or search...");
  const [preExtHeight, setPreExtHeight] = useState("2040");
  const [preExtWidth, setPreExtWidth] = useState("820");
  const [preExtThick, setPreExtThick] = useState("35");
  const [preExtJambWall, setPreExtJambWall] = useState("");
  const [preExtQty, setPreExtQty] = useState("1");
  const [preExtHung, setPreExtHung] = useState("Hung A");
  const [preExtType, setPreExtType] = useState("Type A");
  const [preExtStop, setPreExtStop] = useState("Cushion");

  // Prehung - Internal Door State
  const [preIntDoorName, setPreIntDoorName] = useState("");
  const [preIntDoorProduct, setPreIntDoorProduct] = useState("Select or search...");
  const [preIntHeight, setPreIntHeight] = useState("2040");
  const [preIntWidth, setPreIntWidth] = useState("820");
  const [preIntThick, setPreIntThick] = useState("35");
  const [preIntJambWall, setPreIntJambWall] = useState("");
  const [preIntQty, setPreIntQty] = useState("1");
  const [preIntHung, setPreIntHung] = useState("Hung A");
  const [preIntType, setPreIntType] = useState("Type A");
  const [preIntStop, setPreIntStop] = useState("Cushion");
  const [preIntInternalType, setPreIntInternalType] = useState("HF");
  const [preIntColor, setPreIntColor] = useState("CHR");

  // Loose Jamb - External Door State
  const [looseExtDoorName, setLooseExtDoorName] = useState("");
  const [looseExtDoorProduct, setLooseExtDoorProduct] = useState("Select or search...");
  const [looseExtHeight, setLooseExtHeight] = useState("2040");
  const [looseExtWidth, setLooseExtWidth] = useState("820");
  const [looseExtThick, setLooseExtThick] = useState("38");
  const [looseExtJambWall, setLooseExtJambWall] = useState("");
  const [looseExtQty, setLooseExtQty] = useState("1");
  const [looseExtJambSize, setLooseExtJambSize] = useState("Steel Frame");
  const [looseExtStop, setLooseExtStop] = useState("Cushion");

  // Loose Jamb - Internal Door State
  const [looseIntDoorName, setLooseIntDoorName] = useState("");
  const [looseIntDoorProduct, setLooseIntDoorProduct] = useState("Select or search...");
  const [looseIntHeight, setLooseIntHeight] = useState("2040");
  const [looseIntWidth, setLooseIntWidth] = useState("820");
  const [looseIntThick, setLooseIntThick] = useState("38");
  const [looseIntJambWall, setLooseIntJambWall] = useState("");
  const [looseIntQty, setLooseIntQty] = useState("1");
  const [looseIntJambSize, setLooseIntJambSize] = useState("Steel Frame");
  const [looseIntStop, setLooseIntStop] = useState("Cushion");
  const [looseIntInternalType, setLooseIntInternalType] = useState("HF");
  const [looseIntColor, setLooseIntColor] = useState("CHR");

  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isPrehungOpen, setIsPrehungOpen] = useState(true);
  const [isPreExtOpen, setIsPreExtOpen] = useState(true);
  const [isPreIntOpen, setIsPreIntOpen] = useState(true);
  const [isLooseOpen, setIsLooseOpen] = useState(true);
  const [isLooseExtOpen, setIsLooseExtOpen] = useState(true);
  const [isLooseIntOpen, setIsLooseIntOpen] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const handleAddDoor = (item) => {
    const newEntry = {
      id: "door-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
      ...item
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  const handleRowFieldChange = (rowId, field, val) => {
    if (!onSetEntries) return;
    const finalVal = (val === "" || val === null || (typeof val === "string" && val.trim().toUpperCase() === "NULL")) ? null : val;
    onSetEntries(prev => (prev || []).map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r, [field]: finalVal };
      // Khi chọn mode là Loose -> tự động gán jamb_size là Loose Jamb, nếu không phải Loose (Prehung hoặc trống) -> gán null
      if (field === "mode") {
        if (finalVal === "Loose") {
          updated.jamb_size = "112×19mm 5.4m Loose Jamb";
        } else {
          updated.jamb_size = null;
        }
      }
      return updated;
    }));
  };

  const handleAddBlankRow = () => {
    const newRow = {
      id: `door-custom-${Date.now()}`,
      mode: null,
      scope: "internal",
      label: null,
      door_name: null,
      height: 2040,
      width: 820,
      thickness: 35,
      jamb_or_wall: "90mm Wall",
      jamb_size: "112×19mm 5.4m",
      hung: "Hung A",
      door_type: "Type A",
      door_stop: "Cushion",
      internal_type: "HF",
      color: "CHR",
      default_qty: 1
    };
    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newRow]);
    }
  };

  // ── Auto-Calculate & Fill LockUp trực tiếp từ bản vẽ Timber Doors ──
  // Gọi API backend calculateLockout giống hệt như LockoutJobsModal
  const handleAutoFillAI = async () => {
    setIsAutoFilling(true);
    try {
      const allDoors = [];
      const allWalls = [];

      if (doorsByPage && Object.keys(doorsByPage).length > 0) {
        Object.keys(doorsByPage).forEach(p => {
          (doorsByPage[p] || []).forEach(d => allDoors.push(d));
        });
      } else {
        (doors || []).forEach(d => allDoors.push(d));
      }

      if (wallsByPage && Object.keys(wallsByPage).length > 0) {
        Object.keys(wallsByPage).forEach(p => {
          (wallsByPage[p] || []).forEach(w => allWalls.push(w));
        });
      } else {
        (walls || []).forEach(w => allWalls.push(w));
      }

      // Filter timber doors only (same logic as LockoutJobsModal)
      const timberDoors = allDoors.filter(d => {
        const mat = String(d.material || d.door_material || d.material_type || "timber").trim().toLowerCase();
        return !mat || mat === "timber" || mat === "wood" || mat === "default";
      });

      const targetDoors = timberDoors.length > 0 ? timberDoors : allDoors;

      if (targetDoors.length === 0) {
        if (onSetEntries) onSetEntries([]);
        setIsAutoFilling(false);
        return;
      }

      // Enrich doors with wall thickness (same as LockoutJobsModal)
      const enrichedDoors = targetDoors.map((d, idx) => {
        const pWall = allWalls.find(w => w.id === d.parentWallId);
        const wallThick = pWall?.thickness || pWall?.thickness_mm || d.thickness_mm || d.wall_thickness || 90;
        const dName = (d.label || d.name || d.door_name || `D${idx + 1}`).trim();
        const dWidth = d.width ? Math.round(d.width > 200 ? d.width : (d.width * 1000 || 820)) : 820;
        const dHeight = d.height ? Math.round(d.height > 500 ? d.height : (d.height * 1000 || 2040)) : 2040;
        const isExt = Boolean(d.isExternal || /entry|front|sliding|patio|balcony|garage|external/i.test(dName));
        return {
          ...d,
          mode: isExt ? "Prehung" : "Loose",
          scope: isExt ? "external" : "internal",
          label: dName,
          door_name: dName,
          width: dWidth,
          height: dHeight,
          thickness: isExt ? 40 : 35,
          wall_thickness: `${wallThick}mm Wall`,
          jamb_or_wall: `${wallThick}mm Wall`,
          jamb_size: isExt ? "112×19mm 5.4m Loose Jamb" : "112×19mm 5.4m",
          hung: isExt ? "LH Prehung" : "RH Loose",
          door_type: isExt ? "Type CG" : "Type A",
          door_stop: isExt ? "DS2 with Riser" : "Cushion",
          internal_type: isExt ? null : "HF",
          color: isExt ? null : "CHR",
          default_qty: 1
        };
      });

      // Call backend API calculateLockout (same as LockoutJobsModal)
      let resRows = [];
      try {
        const res = await ApiService.calculateLockout({ doors: enrichedDoors });
        if (res.success && res.rows && res.rows.length > 0) {
          resRows = res.rows;
        }
      } catch (_) {}

      // Map rows to entries (same mapping as LockoutJobsModal)
      const finalRows = (resRows.length > 0 ? resRows : enrichedDoors).map((r, idx) => {
        const isExt = r.scope === "external" || r.isExternal;
        return {
          id: `door-ai-${Date.now()}-${idx}`,
          doorId: r.doorId || r.id,
          mode: r.mode || (isExt ? "Prehung" : "Loose"),
          scope: r.scope || (isExt ? "external" : "internal"),
          label: r.label || r.door_name || `D${idx + 1}`,
          door_name: r.door_name || r.label || `D${idx + 1}`,
          height: r.height || 2040,
          width: r.width || 820,
          thickness: r.thickness || (isExt ? 40 : 35),
          jamb_or_wall: r.jamb_or_wall || "90mm Wall",
          jamb_size: r.jamb_size || (isExt ? "112×19mm 5.4m Loose Jamb" : "112×19mm 5.4m"),
          hung: r.hung || (isExt ? "LH Prehung" : "RH Loose"),
          door_type: r.door_type || (isExt ? "Type CG" : "Type A"),
          door_stop: r.door_stop || (isExt ? "DS2 with Riser" : "Cushion"),
          internal_type: r.internal_type !== undefined ? r.internal_type : (isExt ? null : "HF"),
          color: r.color !== undefined ? r.color : (isExt ? null : "CHR"),
          default_qty: r.default_qty || 1
        };
      });

      if (onSetEntries) {
        onSetEntries(finalRows);
      }
    } catch (err) {
      console.error("Auto fill lockout error:", err);
      if (onAddDataAI) onAddDataAI("lock_up");
    } finally {
      setIsAutoFilling(false);
    }
  };

  // ── Đồng bộ từ sự kiện Modal LockOut ──
  useEffect(() => {
    const handleSyncFromModal = (e) => {
      if (e.detail?.lockoutRows && e.detail.lockoutRows.length > 0) {
        const mapped = e.detail.lockoutRows.map((r, idx) => ({
          id: `door-sync-${Date.now()}-${idx}`,
          mode: r.mode || null,
          scope: r.scope || "internal",
          label: r.label || r.door_name || `D-${idx + 1}`,
          door_name: r.door_name || r.label || `D-${idx + 1}`,
          height: r.height || 2040,
          width: r.width || 820,
          thickness: r.thickness || 35,
          jamb_or_wall: r.jamb_or_wall || "90mm Wall",
          jamb_size: r.jamb_size || "112×19mm 5.4m",
          hung: r.hung || "Hung A",
          door_type: r.door_type || "Type A",
          door_stop: r.door_stop || "Cushion",
          internal_type: r.internal_type || "HF",
          color: r.color || "CHR",
          default_qty: r.default_qty || 1
        }));
        if (onSetEntries) {
          onSetEntries(mapped);
        }
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("ezefloor:apply_ai_doors_to_lockup", handleSyncFromModal);
      return () => window.removeEventListener("ezefloor:apply_ai_doors_to_lockup", handleSyncFromModal);
    }
  }, [onSetEntries]);

  // ── Lưu toàn bộ danh sách LockUp vào [ProcurementApp].[dbo].[LockUp] ──
  const handleSaveToDatabase = async () => {
    if (!entries || entries.length === 0) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const parseNum = (v) => {
        if (v === null || v === undefined || v === "" || String(v).toUpperCase() === "NULL") return null;
        const num = parseFloat(v);
        return isNaN(num) ? null : num;
      };

      const parseStr = (v) => {
        if (v === null || v === undefined || v === "" || String(v).toUpperCase() === "NULL") return null;
        return String(v).trim();
      };

      const items = (entries || []).map(item => ({
        mode: parseStr(item.mode),
        scope: parseStr(item.scope),
        label: parseStr(item.label),
        door_name: parseStr(item.door_name),
        height: parseNum(item.height),
        width: parseNum(item.width),
        thickness: parseNum(item.thickness),
        jamb_or_wall: parseStr(item.jamb_or_wall),
        jamb_size: parseStr(item.jamb_size),
        hung: parseStr(item.hung),
        door_type: parseStr(item.door_type),
        door_stop: parseStr(item.door_stop),
        internal_type: parseStr(item.internal_type),
        color: parseStr(item.color),
        default_qty: parseNum(item.default_qty) || 1.0,
        short_name: "BUN-NSW-ACT"
      }));

      const targetJob = activeJobNumber || currentProjectName || currentJobId || "TestAI";
      const payload = {
        user_update: user?.username || user?.name || "EZE0098",
        jobs: [{
          id_job_hw: targetJob,
          items
        }]
      };

      const res = await ApiService.saveLockoutJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        alert(res?.detail || res?.message || "Could not save LockUp records to ProcurementApp.");
      }
    } catch (e) {
      console.error("Error saving LockUp to database:", e);
      alert("Error saving to database: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Tự động tính toán & điền cửa của Job hiện tại từ bản vẽ 2D / Tải từ DB nếu khớp chính xác ──
  useEffect(() => {
    let isCancelled = false;

    async function initLockoutEntries() {
      if (entries && entries.length > 0) return;

      // 1. First priority: If canvas has doors for current plan/job, auto-fill from 2D canvas!
      let hasCanvasDoors = false;
      if (doors && doors.length > 0) {
        hasCanvasDoors = true;
      } else if (doorsByPage && Object.values(doorsByPage).some(list => Array.isArray(list) && list.length > 0)) {
        hasCanvasDoors = true;
      }

      if (hasCanvasDoors) {
        handleAutoFillAI();
        return;
      }

      // 2. Secondary: If no canvas doors, check if specific non-empty activeJobNumber has saved records in DB
      const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim().toLowerCase();
      if (!target || target === "default" || target === "testai") {
        return;
      }

      try {
        const res = await ApiService.fetchLockoutJobs();
        if (isCancelled) return;
        if (res && res.data) {
          const matchedRows = res.data.filter(j => {
            const jn = String(j.job_number || "").trim().toLowerCase();
            const hw = String(j.IdJob_HW || j.hw_id || "").trim().toLowerCase();
            return (jn && jn === target) || (hw && hw === target);
          });
          const validRows = matchedRows.filter(r => r.door_name || r.height || r.width || r.jamb_or_wall || r.label);
          if (validRows.length > 0 && onSetEntries) {
            const loaded = validRows.map((r, idx) => ({
              id: `door-loaded-${Date.now()}-${idx}`,
              mode: r.mode || null,
              scope: r.scope || null,
              label: r.label || null,
              door_name: r.door_name || null,
              height: r.height || null,
              width: r.width || null,
              thickness: r.thickness || null,
              jamb_or_wall: r.jamb_or_wall || null,
              jamb_size: r.jamb_size || null,
              hung: r.hung || null,
              door_type: r.door_type || null,
              door_stop: r.door_stop || null,
              internal_type: r.internal_type || null,
              color: r.color || null,
              default_qty: r.default_qty || 1
            }));
            onSetEntries(loaded);
          }
        }
      } catch (e) {
        console.error("Auto load existing LockUp error:", e);
      }
    }

    initLockoutEntries();

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobNumber, currentProjectName, currentJobId, doors, doorsByPage]);

  // Render input matching Image 1
  const renderCellInput = (row, field, width = 80, isNumber = false, options = null) => {
    const rawVal = row[field];
    const displayVal = rawVal === null || rawVal === undefined ? "" : String(rawVal);
    const isNullValue = rawVal === null || rawVal === undefined || displayVal === "";

    if (options) {
      return (
        <select
          value={displayVal}
          onChange={(e) => handleRowFieldChange(row.id, field, e.target.value)}
          style={{
            width,
            padding: "4px 5px",
            fontSize: "11px",
            fontWeight: isNullValue ? 500 : 700,
            background: isNullValue ? "#f8fafc" : "#ffffff",
            border: isNullValue ? "1px dashed #cbd5e1" : "1px solid #ea580c",
            borderRadius: "4px",
            color: isNullValue ? "#94a3b8" : "#0f172a",
            outline: "none",
            cursor: "pointer",
            boxSizing: "border-box"
          }}
        >
          <option value="" style={{ background: "#ffffff", color: "#94a3b8" }}></option>
          {displayVal && !options.includes(displayVal) && (
            <option value={displayVal} style={{ background: "#ffffff", color: "#0f172a", fontWeight: 700 }}>
              {displayVal}
            </option>
          )}
          {options.map(opt => (
            <option key={opt} value={opt} style={{ background: "#ffffff", color: "#0f172a" }}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={isNumber ? "number" : "text"}
        value={displayVal}
        placeholder=""
        onChange={(e) => handleRowFieldChange(row.id, field, e.target.value)}
        style={{
          width,
          padding: "4px 5px",
          fontSize: "11px",
          fontWeight: isNullValue ? 500 : 700,
          background: isNullValue ? "#f8fafc" : "#ffffff",
          border: isNullValue ? "1px dashed #cbd5e1" : "1px solid #ea580c",
          borderRadius: "4px",
          color: isNullValue ? "#94a3b8" : "#0f172a",
          textAlign: isNumber ? "right" : "left",
          outline: "none",
          boxSizing: "border-box"
        }}
      />
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: DOOR INFORMATION ── */}
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
          <span>1. Door information</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection1Open ? "▲" : "▼"}
          </span>
        </div>

        {isSection1Open && (
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* GROUP 1: PREHUNG */}
          <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", overflow: "hidden" }}>
            <div
              onClick={() => setIsPrehungOpen(!isPrehungOpen)}
              style={{
                padding: "7px 10px",
                background: "#f1f5f9",
                borderBottom: isPrehungOpen ? "1px solid #e2e8f0" : "none",
                fontSize: "11px",
                fontWeight: 800,
                color: "#1e293b",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none"
              }}
            >
              <span>{isPrehungOpen ? "▼" : "▶"} Prehung</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                {isPrehungOpen ? "▲" : "▼"}
              </span>
            </div>

            {isPrehungOpen && (
            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* SUBSECTION: Prehung - External Door */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "5px", overflow: "hidden" }}>
                <div
                  onClick={() => setIsPreExtOpen(!isPreExtOpen)}
                  style={{
                    padding: "7px 10px",
                    background: "#fafafa",
                    borderBottom: isPreExtOpen ? "1px solid #e2e8f0" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155" }}>{isPreExtOpen ? "▼" : "▶"} External Door</span>
                    <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                      {preExtHeight} × {preExtWidth}
                    </span>
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                    {isPreExtOpen ? "▲" : "▼"}
                  </span>
                </div>

                {isPreExtOpen && (
                <div style={{ padding: "8px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", flexWrap: "wrap" }}>
                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Prehung Doors</span>
                    <input
                      type="text"
                      placeholder="e.g. Entry Door"
                      value={preExtDoorName}
                      onChange={(e) => setPreExtDoorName(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "2 1 150px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door name</span>
                    <select
                      value={preExtDoorProduct}
                      onChange={(e) => setPreExtDoorProduct(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb" }}
                    >
                      {DOOR_PRODUCT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Height</span>
                    <select value={preExtHeight} onChange={(e) => setPreExtHeight(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_HEIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Width</span>
                    <select value={preExtWidth} onChange={(e) => setPreExtWidth(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_WIDTH_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 55px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Thicks</span>
                    <select value={preExtThick} onChange={(e) => setPreExtThick(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_THICK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "1.4 1 120px" }}>
                    <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb or Wall for Steel Frame</span>
                    <input
                      type="text"
                      placeholder="Enter jamb or wall"
                      value={preExtJambWall}
                      onChange={(e) => setPreExtJambWall(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "0.5 1 45px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Qty</span>
                    <input
                      type="number"
                      value={preExtQty}
                      onChange={(e) => setPreExtQty(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "0.9 1 85px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Hung</span>
                    <select value={preExtHung} onChange={(e) => setPreExtHung(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_HUNG_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.9 1 85px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Type</span>
                    <select value={preExtType} onChange={(e) => setPreExtType(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 75px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Stop</span>
                    <select value={preExtStop} onChange={(e) => setPreExtStop(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_STOP_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddDoor({
                        category: "Prehung",
                        location: "External Door",
                        door: preExtDoorName || "Entry Door",
                        product: preExtDoorProduct !== "Select or search..." ? preExtDoorProduct : "Standard Prehung Door",
                        size: `${preExtHeight} × ${preExtWidth}`,
                        thicks: `${preExtThick}mm`,
                        jambWall: preExtJambWall || "-",
                        jambSize: "-",
                        hung: preExtHung,
                        type: preExtType,
                        hfHo: "-",
                        color: "-",
                        stop: preExtStop,
                        qty: preExtQty || "1"
                      });
                      setPreExtDoorName("");
                    }}
                    style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    + Add door
                  </button>
                </div>
                <div style={{ fontSize: "9.5px", color: "#94a3b8", marginTop: "3px" }}>Door name options loaded from List_Prehung.</div>
                </div>
                )}
              </div>

              {/* SUBSECTION: Prehung - Internal Door */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "5px", overflow: "hidden" }}>
                <div
                  onClick={() => setIsPreIntOpen(!isPreIntOpen)}
                  style={{
                    padding: "7px 10px",
                    background: "#fafafa",
                    borderBottom: isPreIntOpen ? "1px solid #e2e8f0" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155" }}>{isPreIntOpen ? "▼" : "▶"} Internal Door</span>
                    <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                      {preIntHeight} × {preIntWidth}
                    </span>
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                    {isPreIntOpen ? "▲" : "▼"}
                  </span>
                </div>

                {isPreIntOpen && (
                <div style={{ padding: "8px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", flexWrap: "wrap" }}>
                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Prehung Doors</span>
                    <input
                      type="text"
                      placeholder="e.g. Bedroom Door"
                      value={preIntDoorName}
                      onChange={(e) => setPreIntDoorName(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "1.8 1 140px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door name</span>
                    <select
                      value={preIntDoorProduct}
                      onChange={(e) => setPreIntDoorProduct(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb" }}
                    >
                      {DOOR_PRODUCT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Height</span>
                    <select value={preIntHeight} onChange={(e) => setPreIntHeight(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_HEIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Width</span>
                    <select value={preIntWidth} onChange={(e) => setPreIntWidth(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_WIDTH_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 55px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Thicks</span>
                    <select value={preIntThick} onChange={(e) => setPreIntThick(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_THICK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb or Wall</span>
                    <input
                      type="text"
                      placeholder="Enter jamb or wall"
                      value={preIntJambWall}
                      onChange={(e) => setPreIntJambWall(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "0.5 1 45px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Qty</span>
                    <input
                      type="number"
                      value={preIntQty}
                      onChange={(e) => setPreIntQty(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "0.8 1 80px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Hung</span>
                    <select value={preIntHung} onChange={(e) => setPreIntHung(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_HUNG_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 80px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Type</span>
                    <select value={preIntType} onChange={(e) => setPreIntType(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.7 1 70px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Stop</span>
                    <select value={preIntStop} onChange={(e) => setPreIntStop(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_STOP_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 60px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Internal</span>
                    <select value={preIntInternalType} onChange={(e) => setPreIntInternalType(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {INTERNAL_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 60px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Color</span>
                    <select value={preIntColor} onChange={(e) => setPreIntColor(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {COLOR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddDoor({
                        category: "Prehung",
                        location: "Internal Door",
                        door: preIntDoorName || "Internal Door",
                        product: preIntDoorProduct !== "Select or search..." ? preIntDoorProduct : "Standard Prehung Door",
                        size: `${preIntHeight} × ${preIntWidth}`,
                        thicks: `${preIntThick}mm`,
                        jambWall: preIntJambWall || "-",
                        jambSize: "-",
                        hung: preIntHung,
                        type: preIntType,
                        hfHo: preIntInternalType,
                        color: preIntColor,
                        stop: preIntStop,
                        qty: preIntQty || "1"
                      });
                      setPreIntDoorName("");
                    }}
                    style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    + Add door
                  </button>
                </div>
                </div>
                )}
              </div>
            </div>
            )}
          </div>

          {/* GROUP 2: LOOSE JAMB */}
          <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", overflow: "hidden" }}>
            <div
              onClick={() => setIsLooseOpen(!isLooseOpen)}
              style={{
                padding: "7px 10px",
                background: "#f1f5f9",
                borderBottom: isLooseOpen ? "1px solid #e2e8f0" : "none",
                fontSize: "11px",
                fontWeight: 800,
                color: "#1e293b",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none"
              }}
            >
              <span>{isLooseOpen ? "▼" : "▶"} Loose Jamb</span>
              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                {isLooseOpen ? "▲" : "▼"}
              </span>
            </div>

            {isLooseOpen && (
            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* SUBSECTION: Loose Jamb - External Door */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "5px", overflow: "hidden" }}>
                <div
                  onClick={() => setIsLooseExtOpen(!isLooseExtOpen)}
                  style={{
                    padding: "7px 10px",
                    background: "#fafafa",
                    borderBottom: isLooseExtOpen ? "1px solid #e2e8f0" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155" }}>{isLooseExtOpen ? "▼" : "▶"} External Door</span>
                    <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                      {looseExtHeight} × {looseExtWidth}
                    </span>
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                    {isLooseExtOpen ? "▲" : "▼"}
                  </span>
                </div>

                {isLooseExtOpen && (
                <div style={{ padding: "8px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", flexWrap: "wrap" }}>
                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Loose Jamb Doors</span>
                    <input
                      type="text"
                      placeholder="e.g. Entry Door"
                      value={looseExtDoorName}
                      onChange={(e) => setLooseExtDoorName(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "2 1 150px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door name</span>
                    <select
                      value={looseExtDoorProduct}
                      onChange={(e) => setLooseExtDoorProduct(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb" }}
                    >
                      {DOOR_PRODUCT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Height</span>
                    <select value={looseExtHeight} onChange={(e) => setLooseExtHeight(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_HEIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Width</span>
                    <select value={looseExtWidth} onChange={(e) => setLooseExtWidth(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_WIDTH_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 55px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Thicks</span>
                    <select value={looseExtThick} onChange={(e) => setLooseExtThick(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_THICK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "1.4 1 120px" }}>
                    <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb or Wall</span>
                    <input
                      type="text"
                      placeholder="Enter jamb or wall"
                      value={looseExtJambWall}
                      onChange={(e) => setLooseExtJambWall(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "0.5 1 45px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Qty</span>
                    <input
                      type="number"
                      value={looseExtQty}
                      onChange={(e) => setLooseExtQty(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "1.2 1 100px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb Size</span>
                    <select value={looseExtJambSize} onChange={(e) => setLooseExtJambSize(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {JAMB_SIZE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 75px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Stop</span>
                    <select value={looseExtStop} onChange={(e) => setLooseExtStop(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_STOP_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddDoor({
                        category: "Loose Jamb",
                        location: "External Door",
                        door: looseExtDoorName || "Entry Door",
                        product: looseExtDoorProduct !== "Select or search..." ? looseExtDoorProduct : "Loose Jamb Door",
                        size: `${looseExtHeight} × ${looseExtWidth}`,
                        thicks: `${looseExtThick}mm`,
                        jambWall: looseExtJambWall || "-",
                        jambSize: looseExtJambSize,
                        hung: "-",
                        type: "-",
                        hfHo: "-",
                        color: "-",
                        stop: looseExtStop,
                        qty: looseExtQty || "1"
                      });
                      setLooseExtDoorName("");
                    }}
                    style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    + Add door
                  </button>
                </div>
                <div style={{ fontSize: "9.5px", color: "#94a3b8", marginTop: "3px" }}>Door name options loaded from List_LooseJamb.</div>
                </div>
                )}
              </div>

              {/* SUBSECTION: Loose Jamb - Internal Door */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: "5px", overflow: "hidden" }}>
                <div
                  onClick={() => setIsLooseIntOpen(!isLooseIntOpen)}
                  style={{
                    padding: "7px 10px",
                    background: "#fafafa",
                    borderBottom: isLooseIntOpen ? "1px solid #e2e8f0" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155" }}>{isLooseIntOpen ? "▼" : "▶"} Internal Door</span>
                    <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                      {looseIntHeight} × {looseIntWidth}
                    </span>
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                    {isLooseIntOpen ? "▲" : "▼"}
                  </span>
                </div>

                {isLooseIntOpen && (
                <div style={{ padding: "8px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", flexWrap: "wrap" }}>
                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Loose Jamb Doors</span>
                    <input
                      type="text"
                      placeholder="e.g. Room Door"
                      value={looseIntDoorName}
                      onChange={(e) => setLooseIntDoorName(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "1.8 1 140px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door name</span>
                    <select
                      value={looseIntDoorProduct}
                      onChange={(e) => setLooseIntDoorProduct(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb" }}
                    >
                      {DOOR_PRODUCT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Height</span>
                    <select value={looseIntHeight} onChange={(e) => setLooseIntHeight(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_HEIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.8 1 65px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Width</span>
                    <select value={looseIntWidth} onChange={(e) => setLooseIntWidth(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_WIDTH_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 55px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Thicks</span>
                    <select value={looseIntThick} onChange={(e) => setLooseIntThick(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_THICK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "1.2 1 110px" }}>
                    <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb or Wall</span>
                    <input
                      type="text"
                      placeholder="Enter jamb or wall"
                      value={looseIntJambWall}
                      onChange={(e) => setLooseIntJambWall(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "0.5 1 45px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Qty</span>
                    <input
                      type="number"
                      value={looseIntQty}
                      onChange={(e) => setLooseIntQty(e.target.value)}
                      style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ flex: "1.2 1 100px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb Size</span>
                    <select value={looseIntJambSize} onChange={(e) => setLooseIntJambSize(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {JAMB_SIZE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.7 1 70px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Door Stop</span>
                    <select value={looseIntStop} onChange={(e) => setLooseIntStop(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {DOOR_STOP_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 60px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Internal</span>
                    <select value={looseIntInternalType} onChange={(e) => setLooseIntInternalType(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {INTERNAL_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <div style={{ flex: "0.6 1 60px" }}>
                    <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Color</span>
                    <select value={looseIntColor} onChange={(e) => setLooseIntColor(e.target.value)} style={{ width: "100%", padding: "5px 6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                      {COLOR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleAddDoor({
                        category: "Loose Jamb",
                        location: "Internal Door",
                        door: looseIntDoorName || "Internal Door",
                        product: looseIntDoorProduct !== "Select or search..." ? looseIntDoorProduct : "Loose Jamb Door",
                        size: `${looseIntHeight} × ${looseIntWidth}`,
                        thicks: `${looseIntThick}mm`,
                        jambWall: looseIntJambWall || "-",
                        jambSize: looseIntJambSize,
                        hung: "-",
                        type: "-",
                        hfHo: looseIntInternalType,
                        color: looseIntColor,
                        stop: looseIntStop,
                        qty: looseIntQty || "1"
                      });
                      setLooseIntDoorName("");
                    }}
                    style={{ padding: "6px 12px", background: "#1e293b", color: "#ffffff", border: "none", borderRadius: "5px", fontSize: "11px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    + Add door
                  </button>
                </div>
                </div>
                )}
              </div>
            </div>
            )}
          </div>

        </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED DOORS (Matching Image 2) ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsCard2Collapsed(!isCard2Collapsed)}
          style={{
            padding: "9px 14px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            fontWeight: "800",
            fontSize: "12px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "10px", color: "#64748b" }}>{isCard2Collapsed ? "▶" : "▼"}</span>
            <span>2. Entered doors ({(entries || []).length})</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {onAddDataAI && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddDataAI("lock_up");
                }}
                disabled={isAutoFilling}
                style={{
                  background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                  border: "1px solid #93c5fd",
                  color: "#1d4ed8",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "5px",
                  cursor: isAutoFilling ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}
              >
                <span>⚡</span>
                <span>{isAutoFilling ? "Calculating..." : "Auto Fill (AI)"}</span>
              </button>
            )}
          </div>
        </div>

        {!isCard2Collapsed && (
          <>
            <div style={{ padding: "0px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "11px", whiteSpace: "nowrap" }}>
                <thead>
                  <tr style={{ background: "#1e3a5f", color: "#ffffff", textAlign: "left" }}>
                    <th style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 10,
                      background: "#1e3a5f",
                      padding: "8px 6px",
                      width: "32px",
                      minWidth: "32px",
                      maxWidth: "32px",
                      textAlign: "center",
                      borderBottom: "2px solid #334155"
                    }}>#</th>
                    <th style={{
                      position: "sticky",
                      left: "32px",
                      zIndex: 10,
                      background: "#1e3a5f",
                      padding: "8px 8px",
                      width: "95px",
                      minWidth: "95px",
                      borderBottom: "2px solid #334155",
                      borderRight: "2px solid #475569",
                      boxShadow: "3px 0 5px -2px rgba(0,0,0,0.25)"
                    }}>Label</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Category</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Location</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Door</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Size</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Thicks</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Jamb / wall</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Jamb Size</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Hung</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Type</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>HF/HO</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Color</th>
                    <th style={{ padding: "8px 8px", borderBottom: "2px solid #334155" }}>Stop</th>
                    <th style={{ padding: "8px 8px", textAlign: "center", borderBottom: "2px solid #334155" }}>Qty</th>
                    <th style={{ padding: "8px 8px", width: "50px", textAlign: "right", borderBottom: "2px solid #334155" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(entries || []).map((row, idx) => {
                    const effDoor = selectedDoorProp || selectedDoor;
                    const effDoorIds = selectedDoorIdsProp || selectedDoorIds || [];
                    const effId = selectedIdProp || selectedId;
                    const effType = selectedTypeProp || selectedType;
                    const effHovered = hoveredDoorId;

                    const matchId = (id1, id2) => id1 !== undefined && id1 !== null && id2 !== undefined && id2 !== null && String(id1) === String(id2);
                    const hasDoorMatch = (targetId) => {
                      if (!targetId) return false;
                      return matchId(row.doorId, targetId) || matchId(row.id, targetId);
                    };

                    const isSelected = selectedEntryId === row.id ||
                      (effDoor && hasDoorMatch(effDoor.id)) ||
                      (effDoorIds.length > 0 && effDoorIds.some(sId => hasDoorMatch(sId))) ||
                      (effType === "door" && hasDoorMatch(effId));
                    const isHovered = effHovered && hasDoorMatch(effHovered);
                    const isRowEditing = editingRowId === row.id;
                    const rowBg = isRowEditing ? "#fef3c7" : (isSelected ? "#dbeafe" : (isHovered ? "#f1f5f9" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc")));

                    const isExt = row.scope === "external" || row.isExternal;
                    const categoryDisplay = row.mode === "Prehung" ? "Prehung" : (row.mode === "Loose" ? "Loose Jamb" : (row.category || (isExt ? "Prehung" : "Loose Jamb")));
                    const locationDisplay = row.location || (isExt ? "External Patio / Balcony" : (row.scope ? (row.scope.toLowerCase().includes("ext") ? "External Door" : `Internal Room ${idx + 1}`) : `Internal Room ${idx + 1}`));
                    const labelDisplay = row.label || row.door_name || row.door || `D-${idx + 1}`;
                    const doorDisplay = row.door_name || row.door || row.label || `D-${idx + 1}`;
                    const sizeDisplay = row.size || `${row.height || 2040} × ${row.width || 820}`;
                    const thicksDisplay = row.thicks || (row.thickness ? `${String(row.thickness).replace("mm", "")}mm` : (isExt ? "40mm" : "35mm"));
                    const jambWallDisplay = row.jambWall || row.jamb_or_wall || (isExt ? "110mm Brick Veneer" : "90mm Timber Stud");
                    const jambSizeDisplay = row.jambSize || (row.jamb_size ? String(row.jamb_size).replace("5.4m Loose Jamb", "110mm").replace("5.4m", "110mm").trim() : (isExt ? "135mm" : "110mm"));
                    const hungDisplay = row.hung || (isExt ? "LH Prehung" : "RH Loose");
                    const typeDisplay = row.type || (row.door_type === "Type A" || !row.door_type ? "Hinged" : row.door_type);
                    const hfHoDisplay = row.hfHo || row.internal_type || (isExt ? "HO" : "HF");
                    const colorDisplay = row.color === "CHR" || !row.color ? "Primed White" : row.color;
                    const stopDisplay = row.stop || row.door_stop || "Cushion Rubber Stop";
                    const qtyDisplay = row.qty || row.default_qty || 1;

                    return (
                      <tr
                        key={row.id || idx}
                        onClick={() => {
                          if (!isRowEditing) {
                            setSelectedEntryId(row.id);
                            if (onSelectEntry) onSelectEntry(row);
                          }
                        }}
                        style={{
                          background: rowBg,
                          cursor: isRowEditing ? "default" : "pointer",
                          outline: isSelected ? "2px solid #3b82f6" : "none",
                          outlineOffset: "-1px",
                          transition: "background 0.15s ease"
                        }}
                      >
                        {/* Sticky # column */}
                        <td style={{
                          position: "sticky",
                          left: 0,
                          zIndex: 2,
                          background: rowBg,
                          padding: "6px 8px",
                          fontWeight: 700,
                          textAlign: "center",
                          color: "#64748b",
                          width: "32px",
                          minWidth: "32px",
                          maxWidth: "32px",
                          borderBottom: "1px solid #e2e8f0"
                        }}>{idx + 1}</td>

                        {/* Sticky Label column (Primary Identifier) */}
                        <td style={{
                          position: "sticky",
                          left: "32px",
                          zIndex: 2,
                          background: rowBg,
                          padding: "6px 8px",
                          fontWeight: 800,
                          color: "#1e40af",
                          width: "95px",
                          minWidth: "95px",
                          borderBottom: "1px solid #e2e8f0",
                          borderRight: "2px solid #cbd5e1",
                          boxShadow: "3px 0 5px -2px rgba(0,0,0,0.12)"
                        }}>
                          {isRowEditing ? (
                            <input
                              type="text"
                              value={editRowData.label || ""}
                              onChange={(e) => setEditRowData({ ...editRowData, label: e.target.value })}
                              style={{ padding: "2px 4px", fontSize: "11px", width: "80px", fontWeight: 700 }}
                            />
                          ) : (
                            <span style={{
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              border: "1px solid #bfdbfe",
                              display: "inline-block",
                              fontWeight: 700
                            }}>
                              {labelDisplay}
                            </span>
                          )}
                        </td>

                        {isRowEditing ? (
                          <>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <select
                                value={editRowData.mode || "Loose"}
                                onChange={(e) => setEditRowData({ ...editRowData, mode: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px" }}
                              >
                                <option value="Loose">Loose Jamb</option>
                                <option value="Prehung">Prehung</option>
                              </select>
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <input
                                type="text"
                                value={editRowData.location || ""}
                                onChange={(e) => setEditRowData({ ...editRowData, location: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px", width: "120px" }}
                              />
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <input
                                type="text"
                                value={editRowData.door_name || editRowData.label || ""}
                                onChange={(e) => setEditRowData({ ...editRowData, door_name: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px", width: "80px" }}
                              />
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <input
                                type="text"
                                value={editRowData.size || `${editRowData.height || 2040} × ${editRowData.width || 820}`}
                                onChange={(e) => setEditRowData({ ...editRowData, size: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px", width: "80px" }}
                              />
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <select
                                value={editRowData.thickness || 35}
                                onChange={(e) => setEditRowData({ ...editRowData, thickness: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px" }}
                              >
                                <option value="35">35mm</option>
                                <option value="38">38mm</option>
                                <option value="40">40mm</option>
                              </select>
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <input
                                type="text"
                                value={editRowData.jamb_or_wall || ""}
                                onChange={(e) => setEditRowData({ ...editRowData, jamb_or_wall: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px", width: "100px" }}
                              />
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <input
                                type="text"
                                value={editRowData.jamb_size || ""}
                                onChange={(e) => setEditRowData({ ...editRowData, jamb_size: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px", width: "70px" }}
                              />
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <select
                                value={editRowData.hung || "RH Loose"}
                                onChange={(e) => setEditRowData({ ...editRowData, hung: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px" }}
                              >
                                {DOOR_HUNG_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <select
                                value={editRowData.door_type || "Hinged"}
                                onChange={(e) => setEditRowData({ ...editRowData, door_type: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px" }}
                              >
                                <option value="Hinged">Hinged</option>
                                {DOOR_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <select
                                value={editRowData.internal_type || "HF"}
                                onChange={(e) => setEditRowData({ ...editRowData, internal_type: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px" }}
                              >
                                <option value="HF">HF</option>
                                <option value="HO">HO</option>
                              </select>
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <input
                                type="text"
                                value={editRowData.color || "Primed White"}
                                onChange={(e) => setEditRowData({ ...editRowData, color: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px", width: "80px" }}
                              />
                            </td>
                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #e2e8f0" }}>
                              <input
                                type="text"
                                value={editRowData.door_stop || "Cushion Rubber Stop"}
                                onChange={(e) => setEditRowData({ ...editRowData, door_stop: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px", width: "110px" }}
                              />
                            </td>
                            <td style={{ padding: "4px 6px", textAlign: "center", borderBottom: "1px solid #e2e8f0" }}>
                              <input
                                type="number"
                                value={editRowData.default_qty || 1}
                                onChange={(e) => setEditRowData({ ...editRowData, default_qty: e.target.value })}
                                style={{ padding: "2px 4px", fontSize: "11px", width: "35px", textAlign: "center" }}
                              />
                            </td>
                            <td style={{ padding: "4px 6px", textAlign: "right", borderBottom: "1px solid #e2e8f0" }}>
                              <button
                                type="button"
                                onClick={() => handleSaveInlineEdit(row.id)}
                                style={{ background: "none", border: "none", color: "#059669", cursor: "pointer", fontSize: "13px", fontWeight: 700, marginRight: "4px" }}
                                title="Save"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingRowId(null)}
                                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "12px" }}
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{categoryDisplay}</td>
                            <td style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{locationDisplay}</td>
                            <td style={{ padding: "6px 8px", color: "#334155", borderBottom: "1px solid #e2e8f0" }}>{doorDisplay}</td>
                            <td style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{sizeDisplay}</td>
                            <td style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{thicksDisplay}</td>
                            <td style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{jambWallDisplay}</td>
                            <td style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{jambSizeDisplay}</td>
                            <td style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{hungDisplay}</td>
                            <td style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{typeDisplay}</td>
                            <td style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{hfHoDisplay}</td>
                            <td style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{colorDisplay}</td>
                            <td style={{ padding: "6px 8px", borderBottom: "1px solid #e2e8f0" }}>{stopDisplay}</td>
                            <td style={{ padding: "6px 8px", textAlign: "center", borderBottom: "1px solid #e2e8f0" }}>{qtyDisplay}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(row);
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#ea580c",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  padding: "2px 4px",
                                  marginRight: "2px"
                                }}
                                title="Edit door"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveEntry(row.id);
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#ef4444",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  padding: "2px 4px",
                                  fontWeight: 700
                                }}
                                title="Delete door"
                              >
                                ✕
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}

                  {(!entries || entries.length === 0) && (
                    <tr>
                      <td colSpan={16} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>
                        No doors entered. Click <strong>⚡ Auto Fill (AI)</strong> to calculate timber doors from project.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── ACTION BUTTONS: SAVE & SUMMARY (Image 2 style) ── */}
            <div style={{
              padding: "10px 14px",
              background: "#ffffff",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px"
            }}>
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                {(entries || []).length} doors calculated
              </span>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {saveSuccess && (
                  <span style={{ fontSize: "11px", color: "#059669", fontWeight: 700 }}>
                    ✓ Saved to ProcurementApp LockUp!
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveToDatabase}
                  disabled={isSaving || !entries || entries.length === 0}
                  style={{
                    padding: "6px 18px",
                    background: saveSuccess ? "#059669" : "#1e3a5f",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "5px",
                    fontSize: "11.5px",
                    fontWeight: "700",
                    cursor: (isSaving || !entries || entries.length === 0) ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    opacity: (!entries || entries.length === 0) ? 0.6 : 1,
                    transition: "background 0.2s ease"
                  }}
                >
                  <span>{isSaving ? "⏳" : "💾"}</span>
                  <span>{isSaving ? "Saving..." : (saveSuccess ? "Saved!" : "Save")}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
