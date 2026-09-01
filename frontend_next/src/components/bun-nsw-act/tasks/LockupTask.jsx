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
  activeJobNumber
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
    currentProjectName
  } = useAppModel();

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Collapsible States
  const [isCard1Collapsed, setIsCard1Collapsed] = useState(false);
  const [isPrehungCollapsed, setIsPrehungCollapsed] = useState(false);
  const [isPreExtCollapsed, setIsPreExtCollapsed] = useState(false);
  const [isPreIntCollapsed, setIsPreIntCollapsed] = useState(false);
  const [isLooseJambCollapsed, setIsLooseJambCollapsed] = useState(false);
  const [isLooseExtCollapsed, setIsLooseExtCollapsed] = useState(false);
  const [isLooseIntCollapsed, setIsLooseIntCollapsed] = useState(false);
  const [isCard2Collapsed, setIsCard2Collapsed] = useState(false);

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
        if (onAddDataAI) onAddDataAI("lock_up");
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
        return {
          ...d,
          label: dName,
          door_name: dName,
          width: dWidth,
          height: dHeight,
          wall_thickness: `${wallThick}mm Wall`,
          jamb_or_wall: `${wallThick}mm Wall`
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
      const finalRows = (resRows.length > 0 ? resRows : enrichedDoors).map((r, idx) => ({
        id: `door-ai-${Date.now()}-${idx}`,
        mode: r.mode !== undefined ? r.mode : null,
        scope: r.scope !== undefined ? r.scope : (r.isExternal ? "external" : "internal"),
        label: r.label || r.door_name || `D${idx + 1}`,
        door_name: r.door_name || r.label || `D${idx + 1}`,
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

  // ── Tự động tải dữ liệu đã lưu từ [ProcurementApp].[dbo].[LockUp] ──
  useEffect(() => {
    async function loadExistingSavedLockout() {
      if (entries && entries.length > 0) return;
      try {
        const res = await ApiService.fetchLockoutJobs();
        if (res && res.data) {
          const target = String(activeJobNumber || currentProjectName || currentJobId || "").trim().toLowerCase();
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
    loadExistingSavedLockout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobNumber, currentProjectName, currentJobId]);

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
      {/* ── CARD 1: DOOR INFORMATION (COLLAPSIBLE) ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", transition: "all 0.2s ease" }}>
        <div
          onClick={() => setIsCard1Collapsed(!isCard1Collapsed)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isCard1Collapsed ? "none" : "1px solid #e2e8f0",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
          title="Click to collapse / expand Door Information"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#0f172a", transition: "transform 0.2s ease" }}>
              {isCard1Collapsed ? "►" : "▼"}
            </span>
            <span>1. Door information</span>
          </div>

          <span style={{
            fontSize: "10.5px",
            color: "#64748b",
            fontWeight: 600,
            background: "#e2e8f0",
            padding: "2px 8px",
            borderRadius: "4px"
          }}>
            {isCard1Collapsed ? "Click to expand" : "Click to collapse"}
          </span>
        </div>

        {!isCard1Collapsed && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* GROUP 1: PREHUNG */}
            <div style={{ border: "1px solid #cbd5e1", borderRadius: "6px", overflow: "hidden" }}>
              <div
                onClick={() => setIsPrehungCollapsed(!isPrehungCollapsed)}
                style={{
                  padding: "7px 10px",
                  background: "#f1f5f9",
                  borderBottom: isPrehungCollapsed ? "none" : "1px solid #e2e8f0",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "#1e293b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  userSelect: "none"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ color: "#2563eb" }}>{isPrehungCollapsed ? "►" : "▼"}</span>
                  <span>Prehung</span>
                </div>
                <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600 }}>
                  {isPrehungCollapsed ? "Expand" : "Collapse"}
                </span>
              </div>

              {!isPrehungCollapsed && (
                <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* SUBSECTION: Prehung - External Door */}
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: "5px", overflow: "hidden" }}>
                    <div
                      onClick={() => setIsPreExtCollapsed(!isPreExtCollapsed)}
                      style={{
                        padding: "6px 10px",
                        background: "#f8fafc",
                        borderBottom: isPreExtCollapsed ? "none" : "1px solid #e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        userSelect: "none"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155", display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ color: "#2563eb", fontSize: "10px" }}>{isPreExtCollapsed ? "►" : "▼"}</span>
                          <span>External Door</span>
                        </span>
                        <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "1px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                          {preExtHeight} × {preExtWidth}
                        </span>
                      </div>
                      <span style={{ fontSize: "9.5px", color: "#94a3b8" }}>{isPreExtCollapsed ? "Expand" : "Collapse"}</span>
                    </div>

                    {!isPreExtCollapsed && (
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
                            <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "3px" }}>Jamb or Wall</span>
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
                                mode: "Prehung",
                                scope: "external",
                                label: preExtDoorName || "Entry Door",
                                door_name: preExtDoorProduct !== "Select or search..." ? preExtDoorProduct : "D-101",
                                height: parseFloat(preExtHeight) || 2040,
                                width: parseFloat(preExtWidth) || 820,
                                thickness: parseFloat(preExtThick) || 35,
                                jamb_or_wall: preExtJambWall || "90mm Wall",
                                jamb_size: "112×19mm 5.4m",
                                hung: preExtHung || "Hung A",
                                door_type: preExtType || "Type A",
                                door_stop: preExtStop || "Cushion",
                                internal_type: null,
                                color: null,
                                default_qty: parseFloat(preExtQty) || 1
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
                      onClick={() => setIsPreIntCollapsed(!isPreIntCollapsed)}
                      style={{
                        padding: "6px 10px",
                        background: "#f8fafc",
                        borderBottom: isPreIntCollapsed ? "none" : "1px solid #e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        userSelect: "none"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155", display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ color: "#2563eb", fontSize: "10px" }}>{isPreIntCollapsed ? "►" : "▼"}</span>
                          <span>Internal Door</span>
                        </span>
                        <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "1px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                          {preIntHeight} × {preIntWidth}
                        </span>
                      </div>
                      <span style={{ fontSize: "9.5px", color: "#94a3b8" }}>{isPreIntCollapsed ? "Expand" : "Collapse"}</span>
                    </div>

                    {!isPreIntCollapsed && (
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
                                mode: "Prehung",
                                scope: "internal",
                                label: preIntDoorName || "Bedroom Door",
                                door_name: preIntDoorProduct !== "Select or search..." ? preIntDoorProduct : "D-201",
                                height: parseFloat(preIntHeight) || 2040,
                                width: parseFloat(preIntWidth) || 820,
                                thickness: parseFloat(preIntThick) || 35,
                                jamb_or_wall: preIntJambWall || "90mm Wall",
                                jamb_size: "112×19mm 5.4m",
                                hung: preIntHung || "Hung A",
                                door_type: preIntType || "Type A",
                                door_stop: preIntStop || "Cushion",
                                internal_type: preIntInternalType || "HF",
                                color: preIntColor || "CHR",
                                default_qty: parseFloat(preIntQty) || 1
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
                onClick={() => setIsLooseJambCollapsed(!isLooseJambCollapsed)}
                style={{
                  padding: "7px 10px",
                  background: "#f1f5f9",
                  borderBottom: isLooseJambCollapsed ? "none" : "1px solid #e2e8f0",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "#1e293b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  userSelect: "none"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ color: "#2563eb" }}>{isLooseJambCollapsed ? "►" : "▼"}</span>
                  <span>Loose Jamb</span>
                </div>
                <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600 }}>
                  {isLooseJambCollapsed ? "Expand" : "Collapse"}
                </span>
              </div>

              {!isLooseJambCollapsed && (
                <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* SUBSECTION: Loose Jamb - External Door */}
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: "5px", overflow: "hidden" }}>
                    <div
                      onClick={() => setIsLooseExtCollapsed(!isLooseExtCollapsed)}
                      style={{
                        padding: "6px 10px",
                        background: "#f8fafc",
                        borderBottom: isLooseExtCollapsed ? "none" : "1px solid #e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        userSelect: "none"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155", display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ color: "#2563eb", fontSize: "10px" }}>{isLooseExtCollapsed ? "►" : "▼"}</span>
                          <span>External Door</span>
                        </span>
                        <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "1px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                          {looseExtHeight} × {looseExtWidth}
                        </span>
                      </div>
                      <span style={{ fontSize: "9.5px", color: "#94a3b8" }}>{isLooseExtCollapsed ? "Expand" : "Collapse"}</span>
                    </div>

                    {!isLooseExtCollapsed && (
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

                          <div style={{ flex: "1.8 1 140px" }}>
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
                                mode: "Loose",
                                scope: "external",
                                label: looseExtDoorName || "Entry Door",
                                door_name: looseExtDoorProduct !== "Select or search..." ? looseExtDoorProduct : "D-301",
                                height: parseFloat(looseExtHeight) || 2040,
                                width: parseFloat(looseExtWidth) || 820,
                                thickness: parseFloat(looseExtThick) || 38,
                                jamb_or_wall: looseExtJambWall || "Steel Frame",
                                jamb_size: looseExtJambSize || "Steel Frame",
                                hung: null,
                                door_type: null,
                                door_stop: looseExtStop || "Cushion",
                                internal_type: null,
                                color: null,
                                default_qty: parseFloat(looseExtQty) || 1
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
                      onClick={() => setIsLooseIntCollapsed(!isLooseIntCollapsed)}
                      style={{
                        padding: "6px 10px",
                        background: "#f8fafc",
                        borderBottom: isLooseIntCollapsed ? "none" : "1px solid #e2e8f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        userSelect: "none"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155", display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ color: "#2563eb", fontSize: "10px" }}>{isLooseIntCollapsed ? "►" : "▼"}</span>
                          <span>Internal Door</span>
                        </span>
                        <span style={{ fontSize: "10px", background: "#e2e8f0", padding: "1px 6px", borderRadius: "4px", fontWeight: 700, color: "#475569" }}>
                          {looseIntHeight} × {looseIntWidth}
                        </span>
                      </div>
                      <span style={{ fontSize: "9.5px", color: "#94a3b8" }}>{isLooseIntCollapsed ? "Expand" : "Collapse"}</span>
                    </div>

                    {!isLooseIntCollapsed && (
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
                                mode: "Loose",
                                scope: "internal",
                                label: looseIntDoorName || "Internal Door",
                                door_name: looseIntDoorProduct !== "Select or search..." ? looseIntDoorProduct : "D-202",
                                height: parseFloat(looseIntHeight) || 2040,
                                width: parseFloat(looseIntWidth) || 820,
                                thickness: parseFloat(looseIntThick) || 38,
                                jamb_or_wall: looseIntJambWall || "90mm Wall",
                                jamb_size: "112×19mm 5.4m",
                                hung: null,
                                door_type: null,
                                door_stop: looseIntStop || "Cushion",
                                internal_type: looseIntInternalType || "HF",
                                color: looseIntColor || "CHR",
                                default_qty: parseFloat(looseIntQty) || 1
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

      {/* ── CARD 2: ENTERED DOORS (MATCHING EXACT DATABASE STRUCTURE & COLLAPSIBLE) ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div
          onClick={() => setIsCard2Collapsed(!isCard2Collapsed)}
          style={{
            padding: "9px 12px",
            background: "#f8fafc",
            borderBottom: isCard2Collapsed ? "none" : "1px solid #e2e8f0",
            fontWeight: "800",
            fontSize: "12px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
            cursor: "pointer",
            userSelect: "none"
          }}
          title="Click to collapse / expand Entered doors"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#0f172a" }}>
              {isCard2Collapsed ? "►" : "▼"}
            </span>
            <span>2. Entered doors ({(entries || []).length})</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={handleAutoFillAI}
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
                opacity: isAutoFilling ? 0.7 : 1
              }}
            >
              <span>⚡</span>
              <span>{isAutoFilling ? "Calculating..." : "Auto Fill (AI)"}</span>
            </button>
          </div>
        </div>

        {!isCard2Collapsed && (
          <>
            <div style={{ padding: "0px", overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: "1250px", borderCollapse: "collapse", fontSize: "11px", whiteSpace: "nowrap" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", color: "#334155", borderBottom: "2px solid #cbd5e1", textAlign: "left" }}>
                    <th style={{ padding: "8px 6px", width: "24px" }}>#</th>
                    <th style={{ padding: "8px 6px", width: "95px" }}>mode</th>
                    <th style={{ padding: "8px 6px", width: "80px" }}>scope</th>
                    <th style={{ padding: "8px 6px", minWidth: "110px" }}>label</th>
                    <th style={{ padding: "8px 6px", minWidth: "170px" }}>door_name</th>
                    <th style={{ padding: "8px 6px", width: "65px", textAlign: "right" }}>height</th>
                    <th style={{ padding: "8px 6px", width: "65px", textAlign: "right" }}>width</th>
                    <th style={{ padding: "8px 6px", width: "55px", textAlign: "right" }}>thickness</th>
                    <th style={{ padding: "8px 6px", minWidth: "100px" }}>jamb_or_wall</th>
                    <th style={{ padding: "8px 6px", minWidth: "130px" }}>jamb_size</th>
                    <th style={{ padding: "8px 6px", width: "110px" }}>hung</th>
                    <th style={{ padding: "8px 6px", width: "90px" }}>door_type</th>
                    <th style={{ padding: "8px 6px", width: "85px" }}>door_stop</th>
                    <th style={{ padding: "8px 6px", width: "65px" }}>internal_type</th>
                    <th style={{ padding: "8px 6px", width: "60px" }}>color</th>
                    <th style={{ padding: "8px 6px", width: "50px", textAlign: "right" }}>default_qty</th>
                    <th style={{ padding: "8px 6px", width: "30px", textAlign: "center" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(entries || []).map((row, idx) => {
                    const isSelected = selectedEntryId === row.id;
                    const isLooseMode = row.mode === "Loose";
                    const rowJambOptions = [
                      "112×19mm 5.4m Loose Jamb",
                      "Steel Frame",
                      "112×19mm 5.4m",
                      "112x19mm",
                      "92x18mm",
                      "PINE DAR FJ PENCIL ROUND CLEAR++92X18MM 5.4M CLEAR 4 EDGE"
                    ];
                    const doorProductOptions = DOOR_PRODUCT_OPTIONS.filter(p => p !== "Select or search...");

                    return (
                      <tr
                        key={row.id || idx}
                        onClick={() => {
                          setSelectedEntryId(row.id);
                          if (onSelectEntry) onSelectEntry(row);
                        }}
                        style={{
                          borderBottom: "1px solid #e2e8f0",
                          background: isSelected ? "#dbeafe" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc"),
                          cursor: "pointer",
                          outline: isSelected ? "2px solid #3b82f6" : "none",
                          outlineOffset: "-1px",
                          transition: "background 0.15s ease"
                        }}
                      >
                        <td style={{ padding: "6px 8px", fontWeight: 700, color: "#64748b" }}>{idx + 1}</td>

                        {/* Columns in exact order matching Image 1 - with dropdowns */}
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "mode", 95, false, DOOR_MODE_OPTIONS)}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "scope", 80, false, ["internal", "external"])}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "label", 110)}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "door_name", 170, false, doorProductOptions)}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "height", 65, false, DOOR_HEIGHT_OPTIONS)}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "width", 65, false, DOOR_WIDTH_OPTIONS)}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "thickness", 55, false, DOOR_THICK_OPTIONS)}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "jamb_or_wall", 100)}</td>
                        <td style={{ padding: "4px 6px" }}>{isLooseMode ? renderCellInput(row, "jamb_size", 130, false, rowJambOptions) : null}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "hung", 110, false, DOOR_HUNG_OPTIONS)}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "door_type", 90, false, DOOR_TYPE_OPTIONS)}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "door_stop", 100, false, DOOR_STOP_OPTIONS)}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "internal_type", 65, false, INTERNAL_TYPE_OPTIONS)}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "color", 60, false, COLOR_OPTIONS)}</td>
                        <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "default_qty", 50, true)}</td>

                        {/* Delete Action */}
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
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
                              fontWeight: 800,
                              fontSize: "12px",
                              padding: "2px"
                            }}
                            title="Delete row"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {(!entries || entries.length === 0) && (
                    <tr>
                      <td colSpan={17} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>
                        No doors entered. Click <strong>⚡ Auto Fill (AI)</strong> to calculate timber doors from project.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── ACTION BUTTONS: SAVE & SUMMARY ── */}
            <div style={{
              padding: "8px 14px",
              background: "#f8fafc",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              flexWrap: "wrap"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  onClick={handleAddBlankRow}
                  style={{
                    padding: "4px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    background: "#ffffff",
                    border: "1px dashed #cbd5e1",
                    color: "#334155",
                    borderRadius: "5px",
                    cursor: "pointer"
                  }}
                >
                  ➕ Add Custom Row
                </button>
                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                  Total LockUp Rows: <strong>{(entries || []).length}</strong>
                </span>
              </div>

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
                    padding: "5px 14px",
                    background: saveSuccess ? "#059669" : "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "5px",
                    fontSize: "11px",
                    fontWeight: "700",
                    cursor: (isSaving || !entries || entries.length === 0) ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
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