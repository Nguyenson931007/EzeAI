import React, { useState, useEffect, useMemo } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";

/**
 * InsulationJobsModal – Modal bóc tách diện tích cách nhiệt tường Insulation (MSSQL emsflow.dbo.Insulation)
 */
export default function InsulationJobsModal({
  visible,
  onClose,
  rooms = [],
  walls = [],
  doors = [],
  scaleValue = 1.0,
  realScale,
  pages = [],
  currentPage = 0,
  wallsByPage,
  doorsByPage,
  activeJobNumber
}) {
  const { user } = useAppModel();
  const isAdmin = user?.role === "admin";

  const [currentStep, setCurrentStep] = useState(1);
  const [jobsData, setJobsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedJobNumber, setSelectedJobNumber] = useState("ALL");

  // State lưu thông tin sửa đổi tạm thời của người dùng trên UI
  const [editedData, setEditedData] = useState({});
  const [customRows, setCustomRows] = useState([]);
  const [currentUserUpdate, setCurrentUserUpdate] = useState(() => {
    try {
      const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      if (userStr) {
        const u = JSON.parse(userStr);
        return u.username || u.name || u.full_name || u.email || "admin";
      }
    } catch (e) {}
    return "admin";
  });

  // State mở xem chi tiết phân tách từng tầng (Floor Breakdown Modal)
  const [viewingBreakdownRow, setViewingBreakdownRow] = useState(null);

  useEffect(() => {
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const u = JSON.parse(userStr);
        const nameVal = u.username || u.name || u.full_name || u.email;
        if (nameVal) setCurrentUserUpdate(nameVal);
      }
    } catch (e) {
      console.warn("Could not read username from localStorage:", e);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadJobsList();
      setSearchTerm("");
      setCustomRows([]);
    }
  }, [visible]);

  // Tự động chuyển thẳng sang Step 2 nếu đang mở một Saved Job cụ thể
  useEffect(() => {
    if (visible && activeJobNumber) {
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

  // Tự động tính toán & điền bảng ngay lập tức khi mở modal cho Job hiện tại
  useEffect(() => {
    if (visible && activeJobNumber && currentStep === 2) {
      applyAIInsulationToAll();
    }
  }, [visible, activeJobNumber, currentStep, jobsData.length]);

  const loadJobsList = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiService.fetchInsulationJobs();
      if (res.success && res.data) {
        setJobsData(res.data);
      } else {
        setError(res.detail || "Unable to load Insulation Jobs list from MSSQL.");
      }
    } catch (err) {
      console.error("Error loading Insulation jobs:", err);
      setError("Connection error to backend server: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  /** Unique Jobs List for Step 1 */
  const uniqueJobsList = useMemo(() => {
    const map = new Map();
    jobsData.forEach(item => {
      const jn = item.job_number || "UNASSIGNED";
      if (!map.has(jn)) {
        map.set(jn, {
          job_number: jn,
          hw_id: item.IdJob_HW || item.hw_id,
          last_update: item.datetime_update,
          user_update: item.user_update,
          count: 0
        });
      }
      if (item.insulation_id) {
        map.get(jn).count += 1;
      }
    });
    return Array.from(map.values());
  }, [jobsData]);

  /** Filtered jobs for Step 1 search */
  const filteredJobsStep1 = useMemo(() => {
    if (!searchTerm) return uniqueJobsList;
    const term = searchTerm.toLowerCase();
    return uniqueJobsList.filter(j => (j.job_number || "").toLowerCase().includes(term));
  }, [uniqueJobsList, searchTerm]);

  /** Filtered raw Insulation DB items for Step 2 */
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

  /**
   * Build wall payload from canvas data across ALL PAGES (Floors) for backend calculation.
   * Each wall includes its own doors (matched by parentWallId) and page_name (Tầng 1, Tầng 2...).
   */
  const buildWallPayload = () => {
    const effectiveScale = realScale || scaleValue || 1.0;
    const getBaseId = (id) => id ? String(id).split('-A-')[0].split('-B-')[0] : '';
    const payloadWalls = [];

    const processWalls = (wallList, doorList, pageName) => {
      (wallList || []).forEach(w => {
        let lengthM = 0;
        if (w.length_m) {
          lengthM = w.length_m;
        } else if (w.centerline && w.centerline.length === 2) {
          const dx = w.centerline[1][0] - w.centerline[0][0];
          const dy = w.centerline[1][1] - w.centerline[0][1];
          const pxLen = Math.hypot(dx, dy);
          lengthM = (pxLen * effectiveScale) / 1000;
        }

        let className = w.class_name || "interior_wall";
        const rawType = (w.wall_type || w.type || w.classification || "").toLowerCase();
        if (rawType.includes("ext")) className = "exterior_wall";
        else if (rawType.includes("part")) className = "partition_wall";
        else if (rawType.includes("int")) className = "interior_wall";

        const heightMm = w.height_mm || w.height || 2400;

        const wallBaseId = getBaseId(w.id);
        const wallDoors = (doorList || []).filter(d => {
          const dBaseId = getBaseId(d.parentWallId);
          return dBaseId === wallBaseId || d.parentWallId === w.id;
        }).map(d => ({
          width_mm: d.width_mm || (d.width_px ? d.width_px * effectiveScale : 820),
          height_mm: d.height_mm || 2040
        }));

        payloadWalls.push({
          id: w.id,
          class_name: className,
          length_m: Math.round(lengthM * 10000) / 10000,
          height_mm: heightMm,
          page_name: pageName,
          doors: wallDoors
        });
      });
    };

    if (wallsByPage && Object.keys(wallsByPage).length > 0) {
      Object.keys(wallsByPage).forEach(pIdxStr => {
        const pIdx = parseInt(pIdxStr, 10);
        const pObj = pages && pages[pIdx];
        if (pObj && (pObj.isFloorCeilingWorkspace || pObj.source === "floor_ceiling_page" || pObj.source === "floor_ceiling_workspace" || pObj.category === "floor_ceiling")) {
          return;
        }
        const pWalls = (wallsByPage[pIdx] || []).filter(w => !w.isFloorCeilingOnly && !w.excludeFromOtherTasks);
        const pDoors = (doorsByPage && doorsByPage[pIdx]) ? doorsByPage[pIdx] : [];
        const pageName = pObj ? (pObj.name || `Floor ${pIdx + 1}`) : `Floor ${pIdx + 1}`;
        processWalls(pWalls, pDoors, pageName);
      });
    } else {
      const curPageObj = pages && pages[currentPage];
      if (!curPageObj || (!curPageObj.isFloorCeilingWorkspace && curPageObj.source !== "floor_ceiling_page" && curPageObj.source !== "floor_ceiling_workspace" && curPageObj.category !== "floor_ceiling")) {
        const pageName = curPageObj ? (curPageObj.name || `Floor ${currentPage + 1}`) : `Floor ${currentPage + 1}`;
        const validWalls = (walls || []).filter(w => !w.isFloorCeilingOnly && !w.excludeFromOtherTasks);
        processWalls(validWalls, doors, pageName);
      }
    }

    return payloadWalls;
  };

  /**
   * Call backend /api/insulation/calculate to compute insulation areas.
   * Backend handles: 1-side calculation, door area per wall, grouping by (WallType, WallHeight), and page_breakdown per floor.
   * Merges results directly into existing DB rows (if same wall_type & wall_height) without creating new row/IDs.
   */
  const applyAIInsulationToAll = async () => {
    const wallPayload = buildWallPayload();
    if (wallPayload.length === 0) return;

    setLoading(true);
    try {
      const res = await ApiService.calculateInsulation({ walls: wallPayload });
      if (res.success && res.rows && res.rows.length > 0) {
        const activeHwId = uniqueJobsList.find(j => j.job_number === selectedJobNumber)?.hw_id || jobsData[0]?.IdJob_HW || 1;
        const jobNum = selectedJobNumber !== "ALL" ? selectedJobNumber : (jobsData[0]?.job_number || "J-1001");

        const dbRows = filteredRawJobsStep2.filter(r => r.insulation_id);

        const newCustomRows = [];
        const newEditedData = { ...editedData };
        const matchedDbRowKeys = new Set();

        res.rows.forEach((calcRow, idx) => {
          const calcType = calcRow.wall_type;
          const calcHeight = parseFloat(calcRow.wall_height);

          // Find an existing DB row with same wall_type & wall_height that hasn't been matched yet
          const existingDbRow = dbRows.find(r => 
            !matchedDbRowKeys.has(`db_ins_${r.insulation_id}_${r.IdJob_HW}`) &&
            (r.wall_type || "Ext wall") === calcType &&
            parseFloat(r.wall_height || 2400) === calcHeight
          );

          if (existingDbRow) {
            // MERGE into existing DB row! Do NOT create a new row/ID!
            const rowKey = `db_ins_${existingDbRow.insulation_id}_${existingDbRow.IdJob_HW}`;
            matchedDbRowKeys.add(rowKey);

            newEditedData[rowKey] = {
              ...newEditedData[rowKey],
              wall_type: calcRow.wall_type,
              wall_height: calcRow.wall_height,
              wall_length: calcRow.wall_length,
              total_area_raked: calcRow.total_area_raked,
              total_area_door: calcRow.total_area_door,
              page_breakdown: calcRow.page_breakdown || []
            };
          } else {
            // No matching existing DB row found, create a new custom row (⚡ New)
            newCustomRows.push({
              rowKey: `ai_calc_${Date.now()}_${idx}`,
              IdJob_HW: activeHwId,
              job_number: jobNum,
              insulation_id: null,
              wall_type: calcRow.wall_type,
              wall_height: calcRow.wall_height,
              wall_length: calcRow.wall_length,
              total_area_raked: calcRow.total_area_raked,
              total_area_door: calcRow.total_area_door,
              page_breakdown: calcRow.page_breakdown || []
            });
          }
        });

        setEditedData(newEditedData);
        setCustomRows(newCustomRows);

        if (typeof window !== "undefined" && res.rows.length > 0) {
          window.dispatchEvent(new CustomEvent("ezefloor:apply_ai_insulation_to_task", {
            detail: {
              insulationRows: res.rows,
              walls: walls
            }
          }));
        }
      }
    } catch (e) {
      console.error("Error calculating insulation:", e);
    } finally {
      setLoading(false);
    }
  };

  /** Auto-populate insulation data when entering Step 2, only if no DB records exist yet */
  useEffect(() => {
    const hasDbRows = filteredRawJobsStep2.some(r => r.insulation_id);
    if (currentStep === 2 && (walls || []).length > 0 && customRows.length === 0 && !hasDbRows) {
      applyAIInsulationToAll();
    }
  }, [currentStep, filteredRawJobsStep2]);

  /** Formatted rows list for Step 2 table */
  const groupedJobRows = useMemo(() => {
    const result = [];

    filteredRawJobsStep2.forEach((dbRow) => {
      if (!dbRow.insulation_id) return;
      const rowKey = `db_ins_${dbRow.insulation_id}_${dbRow.IdJob_HW}`;
      result.push({
        rowKey,
        IdJob_HW: dbRow.IdJob_HW,
        job_number: dbRow.job_number,
        insulation_id: dbRow.insulation_id,
        wall_type: dbRow.wall_type || "Ext wall",
        wall_height: dbRow.wall_height || 2400,
        wall_length: dbRow.wall_length || 0.0,
        total_area_raked: dbRow.total_area_raked || 0.0,
        total_area_door: dbRow.total_area_door || 0.0,
        isCustom: false,
        source: "db"
      });
    });

    customRows.forEach((cRow) => {
      result.push({
        ...cRow,
        isCustom: true,
        source: "ai"
      });
    });

    return result;
  }, [filteredRawJobsStep2, customRows]);

  const handleSelectJob = (jn) => {
    setSelectedJobNumber(jn);
    setCurrentStep(2);
  };

  const getFieldValue = (row, field) => {
    if (editedData[row.rowKey]?.[field] !== undefined) {
      return editedData[row.rowKey][field];
    }
    return row[field];
  };

  const handleFieldChange = (row, field, val) => {
    setEditedData(prev => ({
      ...prev,
      [row.rowKey]: {
        ...prev[row.rowKey],
        [field]: val
      }
    }));
  };

  /** Calculate totals summary */
  const totalsSummary = useMemo(() => {
    let totalLengthMm = 0;
    let totalRakedM2 = 0;
    let totalDoorM2 = 0;

    groupedJobRows.forEach(row => {
      totalLengthMm += parseFloat(getFieldValue(row, "wall_length")) || 0;
      totalRakedM2 += parseFloat(getFieldValue(row, "total_area_raked")) || 0;
      totalDoorM2 += parseFloat(getFieldValue(row, "total_area_door")) || 0;
    });

    const totalLengthM = Math.round((totalLengthMm / 1000.0) * 10000) / 10000;

    return {
      totalLengthMm: Math.round(totalLengthMm * 10000) / 10000,
      totalLengthM,
      totalRakedM2: Math.round(totalRakedM2 * 100) / 100,
      totalDoorM2: Math.round(totalDoorM2 * 100) / 100,
      count: groupedJobRows.length
    };
  }, [groupedJobRows, editedData]);

  const saveAllJobs = async () => {
    if (groupedJobRows.length === 0) return;

    setLoading(true);
    try {
      const jobsMap = {};
      groupedJobRows.forEach(row => {
        const hwId = row.IdJob_HW;
        if (!hwId) return;
        if (!jobsMap[hwId]) {
          jobsMap[hwId] = [];
        }
        const item = {
          wall_type: getFieldValue(row, "wall_type") || "Ext wall",
          wall_height: parseFloat(getFieldValue(row, "wall_height")) || 2400,
          wall_length: parseFloat(getFieldValue(row, "wall_length")) || 0,
          total_area_raked: parseFloat(getFieldValue(row, "total_area_raked")) || 0,
          total_area_door: parseFloat(getFieldValue(row, "total_area_door")) || 0
        };
        jobsMap[hwId].push(item);
      });

      const payload = {
        user_update: currentUserUpdate,
        jobs: Object.keys(jobsMap).map(hwId => ({
          id_job_hw: hwId,
          items: jobsMap[hwId]
        }))
      };

      const res = await ApiService.saveInsulationJobs(payload);
      if (res.success) {
        setError(null);
        setCustomRows([]);
        setEditedData({});
        loadJobsList();
      } else {
        setError(res.detail || "Failed to save Insulation records.");
      }
    } catch (e) {
      setError("Save failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(15, 23, 42, 0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        background: "#ffffff", border: "1px solid #cbd5e1",
        borderRadius: 16, width: 1180, maxWidth: "96vw", maxHeight: "90vh",
        boxShadow: "0 25px 60px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column", overflow: "hidden", color: "#1e293b"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 24px", background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18
            }}>
              🧱
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
                Insulation Wall Measurements
              </h3>
              <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>
                📌 Active Job: {selectedJobNumber && selectedJobNumber !== "ALL" ? selectedJobNumber : activeJobNumber || "All Jobs"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Step indicators (Chỉ Admin mới thấy và bấm chuyển chọn Job) */}
            {isAdmin && (
              <div style={{ display: "flex", gap: 6, background: "#f1f5f9", padding: 4, borderRadius: 8 }}>
                <button
                  onClick={() => setCurrentStep(1)}
                  style={stepBtnStyle(currentStep === 1)}
                >
                  1. Select Job ({uniqueJobsList.length})
                </button>
              </div>
            )}

            <button onClick={onClose} style={closeBtnStyle}>✕</button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {error && (
            <div style={{
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 12, marginBottom: 14
            }}>
              ⚠️ {error}
            </div>
          )}

          {currentStep === 1 ? (
            /* STEP 1: SELECT JOB NUMBER */
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                <input
                  type="text"
                  placeholder="🔍 Search Job Number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={inputSearchStyle}
                />
              </div>

              {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                  Loading Insulation jobs from MSSQL...
                </div>
              ) : (
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>JOB NUMBER</th>
                        <th style={thStyle}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJobsStep1.map((j, idx) => (
                        <tr key={j.job_number + idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 12px", color: "#64748b" }}>{idx + 1}</td>
                          <td style={{ padding: "10px 12px", color: "#2563eb", fontWeight: 700 }}>{j.job_number}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <button
                              onClick={() => handleSelectJob(j.job_number)}
                              style={{
                                background: "#2563eb", border: "none", color: "#fff",
                                padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer"
                              }}
                            >
                              Select Job →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* STEP 2: INSULATION CALCULATION TABLE */
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={applyAIInsulationToAll} disabled={loading} style={{
                    background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                    border: "none", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    opacity: loading ? 0.6 : 1,
                    boxShadow: "0 2px 8px rgba(37, 99, 235, 0.25)"
                  }}>
                    {loading ? "⏳ Calculating..." : `⚡ Auto-Calculate & Fill Insulation (${(walls || []).length} walls)`}
                  </button>
                  <button onClick={() => { setCustomRows([]); setEditedData({}); loadJobsList(); }} style={{
                    background: "#f1f5f9", border: "1px solid #cbd5e1",
                    color: "#2563eb", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5
                  }}>
                    🔄 Refresh
                  </button>
                </div>

                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Showing <strong>{groupedJobRows.length}</strong> insulation rows
                </div>
              </div>

              <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>SOURCE</th>
                      <th style={thStyle}>JOB NUMBER</th>
                      <th style={thStyle}>WALL TYPE*</th>
                      <th style={thStyle}>WALL HEIGHT (mm)*</th>
                      <th style={thStyle}>WALL LENGTH (mm)*</th>
                      <th style={thStyle}>TOTAL AREA RAKED WALL (m²)*</th>
                      <th style={{ ...thStyle, color: "#059669", textAlign: "right" }}>TOTAL AREA DOOR (m²)*</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>VIEW BREAKDOWN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedJobRows.map((row, sIdx) => (
                      <tr key={row.rowKey} style={{
                        borderBottom: "1px solid #e2e8f0",
                        background: row.source === "db" ? "rgba(59,130,246,0.02)" : "rgba(139,92,246,0.03)"
                      }}>
                        <td style={{ padding: "8px 10px", color: "#64748b" }}>{sIdx + 1}</td>
                        <td style={{ padding: "8px 10px" }}>
                          {row.source === "db" ? (
                            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(37,99,235,0.08)", border: "1px solid #bfdbfe", color: "#2563eb", fontWeight: 700 }}>📦 Saved</span>
                          ) : (
                            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(124,58,237,0.08)", border: "1px solid #ddd6fe", color: "#7c3aed", fontWeight: 700 }}>⚡ New</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px", color: "#2563eb", fontWeight: 700 }}>{row.job_number}</td>

                        {/* Wall Type */}
                        <td style={{ padding: "4px 6px" }}>
                          <select
                            value={getFieldValue(row, "wall_type")}
                            onChange={(e) => handleFieldChange(row, "wall_type", e.target.value)}
                            style={selectStyle}
                          >
                            <option value="Ext wall">Ext wall</option>
                            <option value="Int Wall">Int Wall</option>
                            <option value="Partial wall">Partial wall</option>
                          </select>
                        </td>

                        {/* Wall Height */}
                        <td style={{ padding: "4px 6px" }}>
                          <input
                            type="number"
                            step="10"
                            value={getFieldValue(row, "wall_height")}
                            onChange={(e) => handleFieldChange(row, "wall_height", e.target.value)}
                            style={inputStyle}
                          />
                        </td>

                        {/* Wall Length */}
                        <td style={{ padding: "4px 6px" }}>
                          <input
                            type="number"
                            step="0.0001"
                            value={getFieldValue(row, "wall_length")}
                            onChange={(e) => handleFieldChange(row, "wall_length", e.target.value)}
                            style={inputStyle}
                          />
                        </td>

                        {/* Total Area Raked Wall */}
                        <td style={{ padding: "4px 6px" }}>
                          <input
                            type="number"
                            step="0.01"
                            value={getFieldValue(row, "total_area_raked")}
                            onChange={(e) => handleFieldChange(row, "total_area_raked", e.target.value)}
                            style={inputStyle}
                          />
                        </td>

                        {/* Total Area Door */}
                        <td style={{ padding: "4px 6px" }}>
                          <input
                            type="number"
                            step="0.01"
                            value={getFieldValue(row, "total_area_door")}
                            onChange={(e) => handleFieldChange(row, "total_area_door", e.target.value)}
                            style={{ ...inputStyle, textAlign: "right", color: "#059669", fontWeight: 800 }}
                          />
                        </td>

                        {/* View Floor Breakdown Button */}
                        <td style={{ padding: "4px 6px", textAlign: "center" }}>
                          {(() => {
                            const pb = getFieldValue(row, "page_breakdown") || row.page_breakdown;
                            if (pb && pb.length > 0) {
                              const updatedRow = {
                                ...row,
                                wall_type: getFieldValue(row, "wall_type"),
                                wall_height: getFieldValue(row, "wall_height"),
                                wall_length: getFieldValue(row, "wall_length"),
                                total_area_raked: getFieldValue(row, "total_area_raked"),
                                total_area_door: getFieldValue(row, "total_area_door"),
                                page_breakdown: pb
                              };
                              return (
                                <button
                                  onClick={() => setViewingBreakdownRow(updatedRow)}
                                  title="View floor-by-floor breakdown"
                                  style={{
                                    background: "#f1f5f9",
                                    border: "1px solid #cbd5e1",
                                    color: "#2563eb",
                                    padding: "4px 10px",
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4
                                  }}
                                >
                                  👁️ View ({pb.length})
                                </button>
                              );
                            }
                            return <span style={{ color: "#64748b", fontSize: 11 }}>—</span>;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: "14px 24px", background: "#f8fafc",
          borderTop: "1px solid #e2e8f0",
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Total Rows: <strong>{groupedJobRows.length}</strong> | Total Length: <strong style={{ color: "#059669" }}>{totalsSummary.totalLengthM} m</strong>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {currentStep === 2 && (
              <button
                onClick={saveAllJobs}
                disabled={loading}
                style={{
                  ...btnStyle("#2563eb"),
                  padding: "8px 20px", fontSize: 13, fontWeight: 700,
                  boxShadow: "0 2px 8px rgba(37, 99, 235, 0.3)"
                }}
              >
                {loading ? "⏳ Saving..." : "💾 Save All Insulation"}
              </button>
            )}
            <button onClick={onClose} style={btnStyle("#64748b")}>
              Close
            </button>
          </div>
        </div>
      </div>

      {/* MODAL BREAKDOWN OVERLAY */}
      {viewingBreakdownRow && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(15, 23, 42, 0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#ffffff", border: "1px solid #cbd5e1",
            borderRadius: 12, width: 580, maxWidth: "90vw", padding: 22,
            boxShadow: "0 15px 40px rgba(0,0,0,0.18)", color: "#1e293b"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "1px solid #e2e8f0", paddingBottom: 12 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 16, color: "#2563eb", fontWeight: 700 }}>
                  📊 Floor Breakdown Details
                </h4>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  Type: <strong style={{ color: "#1e293b" }}>{viewingBreakdownRow.wall_type}</strong> | Height: <strong style={{ color: "#1e293b" }}>{viewingBreakdownRow.wall_height} mm</strong>
                </div>
              </div>
              <button onClick={() => setViewingBreakdownRow(null)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#64748b", width: 30, height: 30, borderRadius: 6, fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
              <thead>
                <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", color: "#475569" }}>FLOOR / PAGE</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", color: "#475569" }}>WALL LENGTH (mm)</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", color: "#475569" }}>RAKED AREA (m²)</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", color: "#059669" }}>DOOR AREA (m²)</th>
                </tr>
              </thead>
              <tbody>
                {(viewingBreakdownRow.page_breakdown || []).map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, color: "#2563eb" }}>{p.page_name}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#1e293b", fontFamily: "monospace" }}>{p.wall_length}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#1e293b", fontFamily: "monospace" }}>{p.total_area_raked}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: "#059669", fontWeight: 700, fontFamily: "monospace" }}>{p.total_area_door}</td>
                  </tr>
                ))}
                <tr style={{ background: "#f8fafc", fontWeight: 700, borderTop: "2px solid #e2e8f0" }}>
                  <td style={{ padding: "10px 12px", color: "#1e293b" }}>TOTAL COMBINED</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#2563eb", fontFamily: "monospace" }}>{viewingBreakdownRow.wall_length}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#1e293b", fontFamily: "monospace" }}>{viewingBreakdownRow.total_area_raked}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "#059669", fontFamily: "monospace" }}>{viewingBreakdownRow.total_area_door}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setViewingBreakdownRow(null)}
                style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", padding: "7px 18px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: "10px 12px", textAlign: "left", color: "#475569",
  fontWeight: 700, fontSize: 11, letterSpacing: "0.5px"
};

const inputStyle = {
  width: "100%", background: "#ffffff", border: "1px solid #cbd5e1",
  color: "#1e293b", padding: "6px 8px", borderRadius: 6, fontSize: 12, outline: "none"
};

const selectStyle = {
  width: "100%", background: "#ffffff", border: "1px solid #cbd5e1",
  color: "#1e293b", padding: "6px 8px", borderRadius: 6, fontSize: 12, outline: "none"
};

const inputSearchStyle = {
  width: 280, background: "#ffffff", border: "1px solid #cbd5e1",
  color: "#1e293b", padding: "8px 12px", borderRadius: 8, fontSize: 12, outline: "none"
};

const stepBtnStyle = (active) => ({
  background: active ? "#2563eb" : "transparent",
  border: "none", color: active ? "#fff" : "#64748b",
  padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer"
});

const btnStyle = (bg) => ({
  background: bg === "#64748b" ? "#f1f5f9" : bg,
  border: bg === "#64748b" ? "1px solid #cbd5e1" : "none",
  color: bg === "#64748b" ? "#475569" : "#fff",
  padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer"
});

const closeBtnStyle = {
  background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#64748b",
  width: 32, height: 32, borderRadius: 8, fontSize: 16, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center"
};
