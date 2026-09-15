"use client";
import React, { useState, useEffect, useMemo } from "react";
import { ApiService } from "@/models/api.service";

export default function LockoutJobsModal({
  visible,
  onClose,
  activeJobNumber,
  user,
  doors = [],
  walls = []
}) {
  const [jobsData, setJobsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(null);
  const [savedKeys, setSavedKeys] = useState(new Set());
  const [error, setError] = useState(null);

  // Active user code for UserUpdate column
  const currentUserUpdate = useMemo(() => {
    return user?.username || user?.name || user?.full_name || user?.ma_nv || "admin";
  }, [user]);

  // Check admin role
  const isAdmin = useMemo(() => {
    const role = (user?.role || "").toLowerCase();
    return role === "admin" || role === "administrator" || currentUserUpdate === "ADMIN";
  }, [user, currentUserUpdate]);

  // Step 1: Job list selection | Step 2: Detailed LockOut table
  const [currentStep, setCurrentStep] = useState(2);
  const [selectedJobNumber, setSelectedJobNumber] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // Temporary local edits & custom AI calculated rows
  const [editedData, setEditedData] = useState({});
  const [customRows, setCustomRows] = useState([]);

  useEffect(() => {
    if (visible) {
      loadJobsList();
      setSavedKeys(new Set());
    }
  }, [visible]);

  useEffect(() => {
    if (visible && activeJobNumber && jobsData.length > 0) {
      const targetStr = String(activeJobNumber).trim().toLowerCase();
      const matchedJob = jobsData.find(j => {
        const jn = String(j.job_number || "").toLowerCase();
        const hwId = String(j.IdJob_HW || j.hw_id || "").toLowerCase();
        return jn === targetStr || jn.includes(targetStr) || hwId === targetStr;
      });

      if (matchedJob && matchedJob.job_number) {
        setSelectedJobNumber(matchedJob.job_number);
        setCurrentStep(2);
      } else {
        setSelectedJobNumber(activeJobNumber);
        setCurrentStep(2);
      }
    } else if (visible && !activeJobNumber) {
      setSelectedJobNumber("ALL");
      setCurrentStep(1);
    }
  }, [visible, jobsData, activeJobNumber]);

  const loadJobsList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiService.fetchLockoutJobs();
      if (res.success && res.data) {
        setJobsData(res.data);
        setEditedData({});
        setCustomRows([]);
      } else {
        setError(res.detail || "Unable to load LockUp Jobs list from MSSQL.");
      }
    } catch (e) {
      setError(e.message || "Connection error to API backend.");
    } finally {
      setLoading(false);
    }
  };

  /** Unique jobs list for Step 1 */
  const uniqueJobsList = useMemo(() => {
    const map = new Map();
    jobsData.forEach(j => {
      if (j.job_number && !map.has(j.job_number)) {
        map.set(j.job_number, {
          job_number: j.job_number,
          hw_id: j.IdJob_HW || j.hw_id,
          last_update: j.datetime_update,
          user_update: j.user_update,
          count: jobsData.filter(x => x.job_number === j.job_number).length
        });
      }
    });
    return Array.from(map.values());
  }, [jobsData]);

  /** Filtered raw LockOut DB items for Step 2 */
  const filteredRawJobsStep2 = useMemo(() => {
    let result = jobsData;
    if (selectedJobNumber !== "ALL") {
      result = result.filter(j => j.job_number === selectedJobNumber);
    }
    if (searchTerm && currentStep === 2) {
      const term = searchTerm.toLowerCase();
      result = result.filter(j => (j.job_number || "").toLowerCase().includes(term));
    }
    return result;
  }, [jobsData, selectedJobNumber, searchTerm, currentStep]);

  /** Filter ONLY Timber doors (ignore Steel, Aluminum, Glass, Composite, etc.) */
  const timberDoors = useMemo(() => {
    return (doors || []).filter(d => {
      const mat = String(d.material || d.door_material || d.material_type || "timber").trim().toLowerCase();
      return !mat || mat === "timber" || mat === "wood" || mat === "default";
    });
  }, [doors]);

  /** Compute LockOut from canvas Timber doors only */
  const applyAILockoutToAll = async () => {
    const targetDoors = timberDoors.length > 0 ? timberDoors : (doors || []);
    if (targetDoors.length === 0) {
      setCustomRows([]);
      return;
    }
    setLoading(true);
    try {
      const enrichedDoors = targetDoors.map((d, idx) => {
        const pWall = (walls || []).find(w => w.id === d.parentWallId);
        const wallThick = pWall?.thickness || pWall?.thickness_mm || d.thickness_mm || d.wall_thickness || 90;
        const dName = (d.door_name || d.doorName || d.doorLabel || (d.label && !/single|sliding|window|door/i.test(d.label) ? d.label : null) || `D${idx + 1}`).trim();
        const dWidth = d.width ? Math.round(d.width > 200 ? d.width : (d.width * 1000 || 820)) : 820;
        const dHeight = d.height ? Math.round(d.height > 500 ? d.height : (d.height * 1000 || 2040)) : 2040;
        const isExtDoor = Boolean(
          d.is_ext ||
          d.is_exterior ||
          d.isExternal ||
          d.location === "external" ||
          d.scope === "external" ||
          (d.doorTypeId && String(d.doorTypeId).startsWith("ext_")) ||
          (d.class && String(d.class).includes("ext")) ||
          (d.type && String(d.type).includes("ext")) ||
          /entry|front|sliding|patio|balcony|garage|external/i.test(dName)
        );
        return {
          ...d,
          label: dName,
          door_name: dName,
          scope: isExtDoor ? "external" : (d.scope || "internal"),
          location: isExtDoor ? "External" : (d.location || "Internal"),
          width: dWidth,
          height: dHeight,
          wall_thickness: `${wallThick}mm Wall`,
          jamb_or_wall: `${wallThick}mm Wall`
        };
      });

      let resRows = [];
      try {
        const res = await ApiService.calculateLockout({ doors: enrichedDoors });
        if (res.success && res.rows && res.rows.length > 0) {
          resRows = res.rows;
        }
      } catch (_) {}

      const activeHwId = uniqueJobsList.find(j => j.job_number === selectedJobNumber)?.hw_id || jobsData[0]?.IdJob_HW || 1;
      const jobNum = selectedJobNumber !== "ALL" ? selectedJobNumber : (jobsData[0]?.job_number || "J-1001");

      const newCustomRows = (resRows.length > 0 ? resRows : enrichedDoors).map((r, idx) => {
        const origDoor = enrichedDoors[idx] || targetDoors[idx] || {};
        const isExt = Boolean(
          r.scope === "external" ||
          r.isExternal ||
          origDoor.is_ext ||
          origDoor.is_exterior ||
          origDoor.isExternal ||
          origDoor.location === "external" ||
          origDoor.scope === "external" ||
          (origDoor.doorTypeId && String(origDoor.doorTypeId).startsWith("ext_")) ||
          (origDoor.class && String(origDoor.class).includes("ext")) ||
          String(r.location || "").toLowerCase().includes("ext")
        );
        const rawHinge = String(r.hung || (isExt ? "left" : "right")).toLowerCase();
        const hungVal = (rawHinge.includes("right") || rawHinge.includes("rh") || rawHinge === "hung a")
          ? "Hung A"
          : ((rawHinge.includes("left") || rawHinge.includes("lh") || rawHinge === "hung b") ? "Hung B" : (r.hung || "Hung A"));

        const isCadDoorType = (t) => {
          if (!t || t === "-" || t === "Type A" || t === "Type CG") return true;
          return /^(single|sliding|window|double|bifold|pocket|cavity|door|hinged|french|timber)$/i.test(String(t).trim());
        };

        return {
          rowKey: `ai_lockout_${Date.now()}_${idx}`,
          IdJob_HW: activeHwId,
          job_number: jobNum,
          lockout_id: null,
          mode: r.mode !== undefined ? r.mode : null,
          scope: isExt ? "external" : "internal",
          location: isExt ? "External" : "Internal",
          label: r.label || r.door_name || `D${idx + 1}`,
          door_name: r.door_name || r.label || `D${idx + 1}`,
          height: r.height || 2040,
          width: r.width || 820,
          thickness: r.thickness || (isExt ? 40 : 35),
          jamb_or_wall: r.jamb_or_wall || "90mm Wall",
          jamb_size: r.mode === "Loose" ? (r.jamb_size || "112×19mm 5.4m Loose Jamb") : null,
          hung: hungVal,
          type: isCadDoorType(r.type) ? "-" : (r.type || "-"),
          door_type: r.door_type || null,
          door_stop: r.door_stop || "Cushion",
          internal_type: r.internal_type || "HF",
          color: r.color || "CHR",
          default_qty: r.default_qty || 1,
          isCustom: true
        };
      });

      setCustomRows(newCustomRows);

      // Broadcast to Lockup task form
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ezefloor:apply_ai_doors_to_lockup", {
          detail: {
            doors: enrichedDoors,
            lockoutRows: newCustomRows
          }
        }));
      }
    } catch (e) {
      console.error("Error calculating lockout:", e);
    } finally {
      setLoading(false);
    }
  };

  /** Auto-populate lockout data when entering Step 2, only if no DB records exist yet */
  useEffect(() => {
    if (!loading && currentStep === 2 && (doors || []).length > 0) {
      const hasDbRows = filteredRawJobsStep2.some(r => r.lockout_id);
      if (!hasDbRows && customRows.length === 0) {
        applyAILockoutToAll();
      }
    }
  }, [loading, currentStep, filteredRawJobsStep2]);

  /** Formatted rows list for Step 2 table */
  const groupedJobRows = useMemo(() => {
    const result = [];

    filteredRawJobsStep2.forEach((dbRow) => {
      if (!dbRow.lockout_id) return;
      const rowKey = `db_lock_${dbRow.lockout_id}_${dbRow.IdJob_HW}`;
      result.push({
        rowKey,
        IdJob_HW: dbRow.IdJob_HW,
        job_number: dbRow.job_number,
        lockout_id: dbRow.lockout_id,
        mode: dbRow.mode !== undefined ? dbRow.mode : null,
        scope: dbRow.scope !== undefined ? dbRow.scope : null,
        label: dbRow.label !== undefined ? dbRow.label : null,
        door_name: dbRow.door_name !== undefined ? dbRow.door_name : null,
        height: dbRow.height !== undefined ? dbRow.height : null,
        width: dbRow.width !== undefined ? dbRow.width : null,
        thickness: dbRow.thickness !== undefined ? dbRow.thickness : null,
        jamb_or_wall: dbRow.jamb_or_wall !== undefined ? dbRow.jamb_or_wall : null,
        jamb_size: dbRow.jamb_size !== undefined ? dbRow.jamb_size : null,
        hung: dbRow.hung !== undefined ? dbRow.hung : null,
        door_type: dbRow.door_type !== undefined ? dbRow.door_type : null,
        door_stop: dbRow.door_stop !== undefined ? dbRow.door_stop : null,
        internal_type: dbRow.internal_type !== undefined ? dbRow.internal_type : null,
        color: dbRow.color !== undefined ? dbRow.color : null,
        default_qty: dbRow.default_qty !== undefined ? dbRow.default_qty : 1,
        isCustom: false,
        source: "db"
      });
    });

    customRows.forEach(cRow => {
      result.push({
        ...cRow,
        source: "ai"
      });
    });

    return result;
  }, [filteredRawJobsStep2, customRows]);

  const getFieldValue = (row, field) => {
    if (editedData[row.rowKey]?.[field] !== undefined) {
      return editedData[row.rowKey][field];
    }
    return row[field];
  };

  const handleCellEdit = (rowKey, field, val) => {
    // Treat string "NULL" or empty string as null
    const finalVal = (val === "" || val === null || (typeof val === "string" && val.trim().toUpperCase() === "NULL")) ? null : val;
    setEditedData(prev => ({
      ...prev,
      [rowKey]: {
        ...prev[rowKey],
        [field]: finalVal
      }
    }));
  };

  const handleAddRow = () => {
    const activeHwId = uniqueJobsList.find(j => j.job_number === selectedJobNumber)?.hw_id || jobsData[0]?.IdJob_HW || 1;
    const jobNum = selectedJobNumber !== "ALL" ? selectedJobNumber : (jobsData[0]?.job_number || "J-1001");

    const newRow = {
      rowKey: `custom_lock_${Date.now()}`,
      IdJob_HW: activeHwId,
      job_number: jobNum,
      lockout_id: null,
      mode: null,
      scope: "internal",
      label: null,
      door_name: null,
      height: null,
      width: null,
      thickness: null,
      jamb_or_wall: null,
      jamb_size: null,
      hung: null,
      door_type: null,
      door_stop: null,
      internal_type: null,
      color: null,
      default_qty: 1,
      isCustom: true
    };
    setCustomRows(prev => [...prev, newRow]);
  };

  const handleDeleteRow = (rowKey) => {
    setCustomRows(prev => prev.filter(r => r.rowKey !== rowKey));
    setEditedData(prev => {
      const copy = { ...prev };
      delete copy[rowKey];
      return copy;
    });
  };

  const saveAllLockoutJobs = async () => {
    setSavingKey("ALL");
    try {
      const jobGroups = {};

      groupedJobRows.forEach(row => {
        const hwId = row.IdJob_HW;
        if (!hwId) return;

        if (!jobGroups[hwId]) {
          jobGroups[hwId] = [];
        }

        const parseNum = (v) => {
          if (v === null || v === undefined || v === "" || String(v).toUpperCase() === "NULL") return null;
          const num = parseFloat(v);
          return isNaN(num) ? null : num;
        };

        const parseStr = (v) => {
          if (v === null || v === undefined || v === "" || String(v).toUpperCase() === "NULL") return null;
          return String(v).trim();
        };

        jobGroups[hwId].push({
          mode: parseStr(getFieldValue(row, "mode")),
          scope: parseStr(getFieldValue(row, "scope")),
          label: parseStr(getFieldValue(row, "label")),
          door_name: parseStr(getFieldValue(row, "door_name")),
          height: parseNum(getFieldValue(row, "height")),
          width: parseNum(getFieldValue(row, "width")),
          thickness: parseNum(getFieldValue(row, "thickness")),
          jamb_or_wall: parseStr(getFieldValue(row, "jamb_or_wall")),
          jamb_size: parseStr(getFieldValue(row, "jamb_size")),
          hung: parseStr(getFieldValue(row, "hung")),
          door_type: parseStr(getFieldValue(row, "door_type")),
          door_stop: parseStr(getFieldValue(row, "door_stop")),
          internal_type: parseStr(getFieldValue(row, "internal_type")),
          color: parseStr(getFieldValue(row, "color")),
          default_qty: parseNum(getFieldValue(row, "default_qty")) || 1.0,
          short_name: "BUN-NSW-ACT"
        });
      });

      const payloadJobs = Object.keys(jobGroups).map(hwId => ({
        id_job_hw: hwId,
        items: jobGroups[hwId]
      }));

      const res = await ApiService.saveLockoutJobs({
        user_update: currentUserUpdate,
        jobs: payloadJobs
      });

      if (res.success) {
        await loadJobsList();
        setCustomRows([]);
        setEditedData({});
        const newSaved = new Set();
        groupedJobRows.forEach(r => newSaved.add(r.rowKey));
        setSavedKeys(newSaved);
      } else {
        alert(res.message || "Failed to save LockUp data.");
      }
    } catch (e) {
      alert("Error saving LockUp: " + e.message);
    } finally {
      setSavingKey(null);
    }
  };

  const renderCellInput = (row, field, width = 85, isNumber = false, options = null) => {
    const rawVal = getFieldValue(row, field);
    const displayVal = rawVal === null || rawVal === undefined ? "" : String(rawVal);
    const isNullValue = rawVal === null || rawVal === undefined || displayVal === "";

    if (options) {
      return (
        <select
          value={displayVal}
          onChange={(e) => handleCellEdit(row.rowKey, field, e.target.value)}
          style={{
            width,
            padding: "4px 6px",
            fontSize: 11,
            fontWeight: isNullValue ? 500 : 700,
            background: isNullValue ? "#f8fafc" : "#ffffff",
            border: isNullValue ? "1px dashed #cbd5e1" : "1px solid #f97316",
            borderRadius: 4,
            color: isNullValue ? "#94a3b8" : "#0f172a",
            outline: "none",
            cursor: "pointer"
          }}
        >
          <option value="" style={{ background: "#ffffff", color: "#94a3b8" }}></option>
          {options.map(opt => (
            <option key={opt} value={opt} style={{ background: "#ffffff", color: "#0f172a" }}>
              {opt}
            </option>
          ))}
          {displayVal && !options.includes(displayVal) && (
            <option value={displayVal} style={{ background: "#ffffff", color: "#0f172a" }}>
              {displayVal}
            </option>
          )}
        </select>
      );
    }

    return (
      <input
        type={isNumber ? "text" : "text"}
        value={displayVal}
        placeholder=""
        onChange={(e) => handleCellEdit(row.rowKey, field, e.target.value)}
        style={{
          width,
          padding: "4px 6px",
          fontSize: 11,
          fontWeight: isNullValue ? 500 : 700,
          background: isNullValue ? "#f8fafc" : "#ffffff",
          border: isNullValue ? "1px dashed #cbd5e1" : "1px solid #f97316",
          borderRadius: 4,
          color: isNullValue ? "#94a3b8" : "#0f172a",
          textAlign: isNumber ? "right" : "left",
          outline: "none"
        }}
      />
    );
  };

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(6px)",
      zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        width: "98%", maxWidth: 1650, height: "92vh",
        background: "#ffffff", border: "1px solid #cbd5e1",
        borderRadius: 16, boxShadow: "0 25px 60px -12px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column", overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 24px", borderBottom: "1px solid #e2e8f0",
          background: "linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(255,255,255,1) 100%)",
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: "linear-gradient(135deg, #2563eb, #3b82f6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, boxShadow: "0 4px 12px rgba(37,99,235,0.25)"
            }}>
              🔒
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 }}>
                LockUp Management
              </h2>
              <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>
                📌 Active Job: <strong style={{ color: "#2563eb" }}>{selectedJobNumber !== "ALL" ? selectedJobNumber : activeJobNumber || "All Jobs"}</strong>
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isAdmin && (
              <div style={{ display: "flex", gap: 6, background: "#f1f5f9", padding: 4, borderRadius: 8 }}>
                <button
                  style={{
                    background: "#2563eb", color: "#fff", border: "none",
                    padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "default"
                  }}
                >
                  1. Select Job ({uniqueJobsList.length})
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0",
                background: "#f1f5f9", color: "#64748b",
                fontSize: 16, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center"
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Toolbar for Admin Search / Job Selector */}
        {isAdmin && (
          <div style={{
            padding: "10px 24px", borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc", display: "flex", gap: 16, alignItems: "center"
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <select
                value={selectedJobNumber}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedJobNumber(val);
                  if (val !== "ALL") setCurrentStep(2);
                }}
                style={{
                  width: "100%", padding: "7px 12px", fontSize: 13, fontWeight: 700,
                  background: "#eff6ff", border: "1px solid #93c5fd",
                  borderRadius: 8, color: "#1d4ed8", outline: "none", cursor: "pointer"
                }}
              >
                <option value="ALL" style={{ background: "#ffffff", color: "#0f172a" }}>
                  📂 All Jobs ({uniqueJobsList.length})
                </option>
                {uniqueJobsList.map(j => (
                  <option key={j.job_number} value={j.job_number} style={{ background: "#ffffff", color: "#0f172a" }}>
                    📌 {j.job_number}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1.5, minWidth: 260 }}>
              <input
                type="text"
                placeholder="🔍 Search Job Number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%", padding: "7px 12px", fontSize: 13,
                  background: "#ffffff", border: "1px solid #cbd5e1",
                  borderRadius: 8, color: "#0f172a", outline: "none"
                }}
              />
            </div>
          </div>
        )}

        {/* Main Table Area */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px", background: "#ffffff" }}>
          {/* Action Row: Auto-Calculate Fill & Refresh Buttons + Count (Synchronized with Insulation Modal) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={applyAILockoutToAll}
                disabled={loading}
                style={{
                  background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                  border: "none", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  opacity: loading ? 0.6 : 1,
                  boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)",
                  display: "flex", alignItems: "center", gap: 6
                }}
              >
                {loading ? "⏳ Calculating..." : `⚡ Auto-Calculate & Fill Timber Doors (${timberDoors.length})`}
              </button>
              <button
                onClick={() => { setCustomRows([]); setEditedData({}); loadJobsList(); }}
                style={{
                  background: "#f1f5f9", border: "1px solid #cbd5e1",
                  color: "#2563eb", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5
                }}
              >
                🔄 Refresh
              </button>
            </div>

            <div style={{ fontSize: 12, color: "#64748b" }}>
              Showing <strong>{groupedJobRows.length}</strong> LockUp rows
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
              ⏳ Loading LockUp data from MSSQL...
            </div>
          ) : error ? (
            <div style={{ padding: 20, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, color: "#991b1b" }}>
              ⚠️ {error}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, whiteSpace: "nowrap" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", color: "#334155", borderBottom: "2px solid #cbd5e1" }}>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>#</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>SRC</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>JOB NUMBER</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>mode</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>scope</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>label</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>door_name</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>height</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>width</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>thickness</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>jamb_or_wall</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>jamb_size</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>hung</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>door_type</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>door_stop</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>internal_type</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>color</th>
                    <th style={{ padding: "8px 10px", textAlign: "right" }}>default_qty</th>
                    <th style={{ padding: "8px 10px", textAlign: "center" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedJobRows.map((row, idx) => (
                    <tr key={row.rowKey} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "6px 8px", color: "#94a3b8" }}>{idx + 1}</td>
                      <td style={{ padding: "6px 8px" }}>
                        {row.source === "db" ? (
                          <span style={{ background: "#d1fae5", color: "#047857", padding: "2px 6px", borderRadius: 4, fontWeight: 700, fontSize: 10 }}>
                            📦 SAVE
                          </span>
                        ) : (
                          <span style={{ background: "#eff6ff", color: "#2563eb", padding: "2px 6px", borderRadius: 4, fontWeight: 700, fontSize: 10 }}>
                            ⚡ New
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#0284c7", fontWeight: 700 }}>{row.job_number}</td>

                      {/* Columns matching MSSQL table order exact */}
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "mode", 95, false, ["Prehung", "Loose"])}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "scope", 85)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "label", 110)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "door_name", 90)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "height", 65, true)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "width", 65, true)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "thickness", 55, true)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "jamb_or_wall", 100)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "jamb_size", 85)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "hung", 110, false, ["-", "Hung A", "Hung B", "Hung CG", "Hung DG", "Hung G", "Pivot Door", "Double Door Set", "RH Pre Hung", "LH Prehung", "LH Pre Hung", "RH Loose", "LH Loose"])}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "door_type", 100)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "door_stop", 85)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "internal_type", 65)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "color", 65)}</td>
                      <td style={{ padding: "4px 6px" }}>{renderCellInput(row, "default_qty", 50, true)}</td>

                      <td style={{ padding: "4px 6px", textAlign: "center" }}>
                        {row.isCustom && (
                          <button
                            onClick={() => handleDeleteRow(row.rowKey)}
                            style={{ background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 4, padding: "3px 6px", cursor: "pointer", fontSize: 10 }}
                          >
                            🗑️ Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 14, display: "flex", gap: 12 }}>
                <button
                  onClick={handleAddRow}
                  style={{
                    padding: "8px 16px", fontSize: 12, fontWeight: 700,
                    background: "#f8fafc", border: "1px dashed #cbd5e1",
                    color: "#334155", borderRadius: 8, cursor: "pointer"
                  }}
                >
                  ➕ Add Custom LockUp Row
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 24px", borderTop: "1px solid #e2e8f0",
          background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ fontSize: 13, color: "#475569" }}>
            Total LockUp Rows: <strong style={{ color: "#0f172a" }}>{groupedJobRows.length}</strong>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={saveAllLockoutJobs}
              disabled={savingKey === "ALL"}
              style={{
                padding: "10px 24px", fontSize: 13, fontWeight: 800,
                background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(37,99,235,0.3)"
              }}
            >
              {savingKey === "ALL" ? "⏳ Saving..." : "💾 Save All LockUp"}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "10px 20px", fontSize: 13, fontWeight: 600,
                background: "#ffffff", border: "1px solid #cbd5e1",
                color: "#475569", borderRadius: 8, cursor: "pointer"
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
