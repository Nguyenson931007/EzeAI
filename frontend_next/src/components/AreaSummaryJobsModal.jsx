import React, { useState, useEffect, useMemo } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { PROCUREMENT_TASK_KEYS } from "@/constants/procurementFormParity";
import { useCatalog, catalogByArea } from "@/utils/catalogHelpers";
import { resolveDropdownValue } from "@/utils/dropdownValueGuard";

/**
 * AreaSummaryJobsModal – Modal bóc tách diện tích phòng & khu vực sàn (MSSQL emsflow.dbo.AreaSummary)
 */
const FLOORING_AREA_KEY_BY_TYPE = {
  Dry: "dry",
  Wet: "wet",
  "Balcony Tiles": "balcony_tiles",
  "Tile Deck": "balcony_tiles",
  "Timber Deck": "decking",
  Internal: "dry",
  External: "balcony_tiles",
};


export default function AreaSummaryJobsModal({ visible, onClose, rooms = [], roomsByPage, scaleValue = 1.0, realScale, pages = [], currentPage = 0, activeJobNumber }) {
  const { user } = useAppModel();
  const isAdmin = user?.role === "admin";
  const activeCustomerShortName = getActiveClientShortName();
  const { items: flooringCatalogItems } = useCatalog(activeCustomerShortName, PROCUREMENT_TASK_KEYS.floor);
  const productOptionsForType = (type) => {
    const areaKey = FLOORING_AREA_KEY_BY_TYPE[type] || "";
    if (!areaKey) return [];
    return Array.from(new Set(
      catalogByArea(flooringCatalogItems, areaKey)
        .map((item) => String(item?.description || item?.label || "").trim())
        .filter(Boolean)
    ));
  };

  const [currentStep, setCurrentStep] = useState(1);
  const [jobsData, setJobsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedJobNumber, setSelectedJobNumber] = useState("ALL");

  // State lưu thông tin sửa đổi tạm thời của người dùng trên UI
  // Structure: { [rowKey]: { floor_level, floor_area_type, deduction_area } }
  const [editedData, setEditedData] = useState({});
  const [customRows, setCustomRows] = useState([]);
  const [savingKey, setSavingKey] = useState(null);
  const [savedKeys, setSavedKeys] = useState(new Set());
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
        const hwId = String(j.IDJob_HW || j.hw_id || "").toLowerCase();
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
      const res = await ApiService.fetchAreaSummaryJobs();
      if (res.success && res.data) {
        setJobsData(res.data);
        setEditedData({});
      } else {
        setError(res.detail || "Unable to load AreaSummary Jobs list from MSSQL.");
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
          job_status: j.job_status || "In Progress",
          hw_id: j.hw_id || j.IDJob_HW,
          count: jobsData.filter(x => x.job_number === j.job_number).length
        });
      }
    });
    return Array.from(map.values());
  }, [jobsData]);

  /** Step 1 filtered jobs */
  const filteredJobsListStep1 = useMemo(() => {
    if (!searchTerm) return uniqueJobsList;
    const term = searchTerm.toLowerCase();
    return uniqueJobsList.filter(j => (j.job_number || "").toLowerCase().includes(term));
  }, [uniqueJobsList, searchTerm]);

  /** Raw DB rows filtered for Step 2 */
  const filteredRawJobsStep2 = useMemo(() => {
    let result = jobsData;
    if (selectedJobNumber && selectedJobNumber !== "ALL") {
      result = result.filter(j => j.job_number === selectedJobNumber);
    }
    if (searchTerm && currentStep === 2) {
      const term = searchTerm.toLowerCase();
      result = result.filter(j => (j.job_number || "").toLowerCase().includes(term));
    }
    return result;
  }, [jobsData, selectedJobNumber, searchTerm, currentStep]);

  const getDefaultProductForType = (areaType) => {
    const options = productOptionsForType(areaType);
    return options[0] || "";
  };

  /** Map page index to the same floor-level labels used by the task forms. */
  const getFloorLevelByIndex = (idx) => {
    const labels = ["GF", "FF", "SF", "TF"];
    if (idx < labels.length) return labels[idx];
    return `${idx}F`;
  };

  const getFloorLevelByPage = (idx) => {
    if (pages && pages[idx]) {
      const page = pages[idx];
      const name = String(page.floor_name || page.name || "").trim();
      if (name) {
        const upper = name.toUpperCase();
        if (["LEVEL 1", "GROUND FLOOR", "GROUND", "GF", "TRỆT", "TẦNG TRỆT"].includes(upper)) return "GF";
        if (["LEVEL 2", "FIRST FLOOR", "FIRST", "FF", "TẦNG 1", "1F"].includes(upper)) return "FF";
        if (["LEVEL 3", "SECOND FLOOR", "SECOND", "SF", "TẦNG 2", "2F"].includes(upper)) return "SF";
        if (["LEVEL 4", "THIRD FLOOR", "THIRD", "TF", "TẦNG 3", "3F"].includes(upper)) return "TF";
        if (upper.startsWith("LEVEL ")) {
          const num = parseInt(upper.replace("LEVEL ", "").trim(), 10);
          if (num === 1) return "GF";
          if (num === 2) return "FF";
          if (num === 3) return "SF";
          if (num === 4) return "TF";
          if (Number.isFinite(num) && num > 4) return `${num - 1}F`;
        }
        return name;
      }
    }
    return getFloorLevelByIndex(idx);
  };

  const defaultFloorLevel = useMemo(() => getFloorLevelByPage(currentPage), [currentPage, pages]);

  /** Build AI area rows from detected rooms. Product values always come from the live dropdown catalog. */
  const groupedAIRooms = useMemo(() => {
    const results = [];

    const calcRoomsForList = (roomsList, pageFlLevel) => {
      if (!Array.isArray(roomsList) || roomsList.length === 0) return;
      let dry = 0, wet = 0, decking = 0, balcony = 0;

      roomsList.forEach((r) => {
        let areaM2 = 0;
        if (r.areaM2 && !isNaN(r.areaM2)) {
          areaM2 = parseFloat(r.areaM2);
        } else if (r.area && !isNaN(r.area)) {
          areaM2 = r.area > 10000 ? r.area / 1000000 : parseFloat(r.area);
        } else {
          const pts = r.polygon || r.poly;
          if (Array.isArray(pts) && pts.length >= 3) {
            let pxArea = 0;
            for (let j = 0; j < pts.length; j += 1) {
              const p1 = pts[j];
              const p2 = pts[(j + 1) % pts.length];
              pxArea += (p1.x * p2.y - p2.x * p1.y);
            }
            pxArea = Math.abs(pxArea) / 2;
            const effectiveScale = realScale || scaleValue || 1.0;
            areaM2 = (pxArea * Math.pow(effectiveScale, 2)) / 1000000;
          }
        }

        if (!areaM2 || areaM2 <= 0) return;

        const t = String(r.type || r.wetness || r.classification || r.room_class || "dry").toLowerCase();
        const name = String(r.room_name || r.name || "").toLowerCase();
        if (t === "wet" || /bath|ensuite|wc|powder|laundry|shower/i.test(name)) wet += areaM2;
        else if (t === "timber_deck" || /deck|timber/i.test(name)) decking += areaM2;
        else if (t === "tile_deck" || /balcony|porch|alfresco|patio|terrace/i.test(name)) balcony += areaM2;
        else dry += areaM2;
      });

      const pushArea = (type, value) => {
        if (value <= 0) return;
        results.push({
          floor_level: pageFlLevel,
          floor_area_type: type,
          calcAreaM2: parseFloat(value.toFixed(4)),
          product: getDefaultProductForType(type),
        });
      };

      pushArea("Dry", dry);
      pushArea("Wet", wet);
      pushArea("Decking Input", decking);
      pushArea("Balcony Tiles", balcony);
    };

    if (roomsByPage && Object.keys(roomsByPage).length > 0) {
      Object.keys(roomsByPage)
        .map((k) => parseInt(k, 10))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => a - b)
        .forEach((pIdx) => calcRoomsForList(roomsByPage[pIdx], getFloorLevelByPage(pIdx)));
    } else {
      calcRoomsForList(rooms, getFloorLevelByPage(currentPage));
    }

    return results;
  }, [rooms, roomsByPage, pages, currentPage, scaleValue, realScale, flooringCatalogItems]);

  /** Helper to determine numerical rank for floor level sorting. */
  const getFloorRank = (floorStr) => {
    if (!floorStr) return 999;
    const str = String(floorStr).trim().toUpperCase();
    if (str === "GF" || str.includes("GROUND") || str === "TRỆT" || str === "TẦNG TRỆT" || str === "LEVEL 1" || str === "L1") return 0;
    if (str === "FF" || str.includes("FIRST") || str === "TẦNG 1" || str === "1F" || str === "LEVEL 2" || str === "L2") return 1;
    if (str === "SF" || str.includes("SECOND") || str === "TẦNG 2" || str === "2F" || str === "LEVEL 3" || str === "L3") return 2;
    if (str === "TF" || str.includes("THIRD") || str === "TẦNG 3" || str === "3F" || str === "LEVEL 4" || str === "L4") return 3;
    const matchNum = str.match(/(\d+)/);
    if (matchNum) return parseInt(matchNum[1], 10);
    if (str.includes("ROOF") || str.includes("MÁI")) return 900;
    return 999;
  };

/** Formatted rows list for Step 2 table */
const groupedJobRows = useMemo(() => {
  const result = [];

  // Always show existing DB rows (previously saved data)
  filteredRawJobsStep2.forEach((dbRow, idx) => {
    if (!dbRow.area_summary_id) return; // Skip dummy default rows without actual DB record
    const rowKey = `db_area_${dbRow.area_summary_id}_${dbRow.IDJob_HW}`;
    result.push({
      rowKey,
      IDJob_HW: dbRow.IDJob_HW,
      job_number: dbRow.job_number,
      area_summary_id: dbRow.area_summary_id,
      floor_level: dbRow.floor_level || defaultFloorLevel,
      floor_area_type: dbRow.floor_area_type || "Dry",
      net_area: dbRow.net_area || 0.0,
      product: dbRow.product || "",
      isCustom: false,
      source: "db"
    });
  });

  // Append AI real-time rows
  customRows.forEach((cRow) => {
    result.push({
      ...cRow,
      isCustom: true,
      source: "ai"
    });
  });

  // Sort by floor rank (GF -> FF -> SF -> TF -> 4F...) then by area type
  result.sort((a, b) => {
    const flA = editedData[a.rowKey]?.floor_level !== undefined ? editedData[a.rowKey].floor_level : a.floor_level;
    const flB = editedData[b.rowKey]?.floor_level !== undefined ? editedData[b.rowKey].floor_level : b.floor_level;
    const rankA = getFloorRank(flA);
    const rankB = getFloorRank(flB);
    if (rankA !== rankB) return rankA - rankB;

    const typeA = (editedData[a.rowKey]?.floor_area_type !== undefined ? editedData[a.rowKey].floor_area_type : a.floor_area_type || "").toLowerCase();
    const typeB = (editedData[b.rowKey]?.floor_area_type !== undefined ? editedData[b.rowKey].floor_area_type : b.floor_area_type || "").toLowerCase();
    return typeA.localeCompare(typeB);
  });

  return result;
}, [filteredRawJobsStep2, customRows, defaultFloorLevel, editedData]);

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


const applyAIRoomsToAll = () => {
  if (groupedAIRooms.length === 0) return;

  const activeHwId = uniqueJobsList.find(j => j.job_number === selectedJobNumber)?.hw_id || jobsData[0]?.IDJob_HW || 1;
  const activeJobNum = selectedJobNumber !== "ALL" ? selectedJobNumber : (jobsData[0]?.job_number || "J-1001");

  // Tìm các dòng DB hiện có thuộc cùng Job
  const existingDbRows = filteredRawJobsStep2.filter(r => r.area_summary_id);

  // Nhóm dòng DB theo CẢ floor_level VÀ floor_area_type (ví dụ: "GF_DRY", "FF_DRY")
  const dbRowsByKey = {};
  existingDbRows.forEach(dbRow => {
    const fl = (dbRow.floor_level || defaultFloorLevel).toString().trim().toUpperCase();
    const type = (dbRow.floor_area_type || "Dry").toString().trim().toUpperCase();
    const key = `${fl}_${type}`;
    if (!dbRowsByKey[key]) dbRowsByKey[key] = [];
    dbRowsByKey[key].push(dbRow);
  });

  const newEdits = { ...editedData };
  const newCustomRows = [];

  groupedAIRooms.forEach((aiR, idx) => {
    const aiFl = (aiR.floor_level || defaultFloorLevel).toString().trim().toUpperCase();
    const aiType = (aiR.floor_area_type || "Dry").toString().trim().toUpperCase();
    const key = `${aiFl}_${aiType}`;
    const matchedDbRows = dbRowsByKey[key];

    if (matchedDbRows && matchedDbRows.length > 0) {
      // Cùng tầng và cùng loại khu vực → cập nhật dữ liệu cũ của tầng đó
      const targetDbRow = matchedDbRows[0];
      const targetRowKey = `db_area_${targetDbRow.area_summary_id}_${targetDbRow.IDJob_HW}`;
      newEdits[targetRowKey] = {
        ...newEdits[targetRowKey],
        net_area: aiR.calcAreaM2,
        floor_level: aiR.floor_level
      };
      // Xóa dòng đã match
      dbRowsByKey[key] = matchedDbRows.slice(1);
    } else {
      // Tầng khác hoặc chưa có dòng DB thuộc tầng này → tạo dòng mới cho tầng đó
      newCustomRows.push({
        rowKey: `ai_filled_${Date.now()}_${idx}`,
        IDJob_HW: activeHwId,
        job_number: activeJobNum,
        area_summary_id: null,
        floor_level: aiR.floor_level,
        floor_area_type: aiR.floor_area_type,
        net_area: aiR.calcAreaM2,
        product: resolveDropdownValue(aiR.product, productOptionsForType(aiR.floor_area_type), { fallback: "" })
      });
    }
  });

  setEditedData(newEdits);
  setCustomRows(prev => [...prev.filter(r => !r.rowKey.startsWith("ai_filled_")), ...newCustomRows]);

  // Broadcast calculated AI room areas to Flooring & Decking task pane
  let dryTotal = 0;
  let wetTotal = 0;
  let timberTotal = 0;
  let tileTotal = 0;

  groupedAIRooms.forEach(r => {
    const t = (r.floor_area_type || "").toLowerCase();
    const val = parseFloat(r.calcAreaM2) || 0;
    if (t === "dry") dryTotal += val;
    else if (t === "wet") wetTotal += val;
    else if (t.includes("timber")) timberTotal += val;
    else if (t.includes("tile") || t.includes("balcony")) tileTotal += val;
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ezefloor:apply_ai_rooms_to_flooring", {
      detail: {
        dryArea: dryTotal > 0 ? Number(dryTotal.toFixed(1)) : "",
        wetArea: wetTotal > 0 ? Number(wetTotal.toFixed(1)) : "",
        balconyArea: tileTotal > 0 ? Number(tileTotal.toFixed(1)) : "",
        otherArea: timberTotal > 0 ? Number(timberTotal.toFixed(1)) : "",
        otherTypeArea: "Decking Input",
        groupedAIRooms: groupedAIRooms,
        rooms: rooms
      }
    }));
  }
};

/** Auto-populate area data from rooms in real-time when entering Step 2, only if no DB records exist yet */
useEffect(() => {
  const hasDbRows = filteredRawJobsStep2.some(r => r.area_summary_id);
  if (currentStep === 2 && groupedAIRooms.length > 0 && customRows.length === 0 && !hasDbRows) {
    applyAIRoomsToAll();
  }
}, [currentStep, groupedAIRooms, filteredRawJobsStep2]);

/** Calculate summary statistics */
const totalsSummary = useMemo(() => {
  let dryM2 = 0;
  let wetM2 = 0;
  let grandTotalM2 = 0;

  groupedJobRows.forEach(row => {
    const net = parseFloat(getFieldValue(row, "net_area")) || 0;
    const areaType = (getFieldValue(row, "floor_area_type") || "").toLowerCase();
    if (areaType.includes("wet")) {
      wetM2 += net;
    } else {
      dryM2 += net;
    }
    grandTotalM2 += net;
  });

  return {
    dryM2: Math.round(dryM2 * 100) / 100,
    wetM2: Math.round(wetM2 * 100) / 100,
    grandTotalM2: Math.round(grandTotalM2 * 100) / 100,
    count: groupedJobRows.length
  };
}, [groupedJobRows, editedData]);

const saveSingleRow = async (targetRow) => {
  const hwId = targetRow.IDJob_HW;
  if (!hwId) return;

  setSavingKey(targetRow.rowKey);
  try {
    // Gom TẤT CẢ các dòng cùng IDJob_HW (vì backend sẽ đánh dấu tất cả record cũ IsOldData=1)
    const sameJobRows = groupedJobRows.filter(r => String(r.IDJob_HW) === String(hwId));
    const areasList = sameJobRows.map(row => ({
      floor_level: getFieldValue(row, "floor_level"),
      floor_area_type: getFieldValue(row, "floor_area_type"),
      net_area: parseFloat(getFieldValue(row, "net_area")) || 0,
      product: getFieldValue(row, "product") || ""
    })).filter(a => a.net_area > 0);

    if (areasList.length === 0) {
      setSavingKey(null);
      return;
    }

    const payload = {
      user_update: currentUserUpdate,
      jobs: [
        {
          id_job_hw: hwId,
          areas: areasList
        }
      ]
    };

    const res = await ApiService.saveAreaSummaryJobs(payload);
    if (res.success) {
      setSavedKeys(prev => new Set(prev).add(targetRow.rowKey));
      setTimeout(() => setSavedKeys(prev => {
        const n = new Set(prev);
        n.delete(targetRow.rowKey);
        return n;
      }), 2500);
      await loadJobsList();
    } else {
      alert(res.detail || "Error saving AreaSummary item.");
    }
  } catch (e) {
    alert("Save failed: " + e.message);
  } finally {
    setSavingKey(null);
  }
};

const saveAllJobs = async () => {
  if (groupedJobRows.length === 0) return;

  setLoading(true);
  try {
    // Group by IDJob_HW
    const jobsMap = {};
    groupedJobRows.forEach(row => {
      const hwId = row.IDJob_HW;
      if (!hwId) return;
      if (!jobsMap[hwId]) {
        jobsMap[hwId] = [];
      }
      const areaItem = {
        floor_level: getFieldValue(row, "floor_level"),
        floor_area_type: getFieldValue(row, "floor_area_type"),
        net_area: parseFloat(getFieldValue(row, "net_area")) || 0,
        product: getFieldValue(row, "product") || ""
      };
      jobsMap[hwId].push(areaItem);
    });

    const payload = {
      user_update: currentUserUpdate,
      jobs: Object.keys(jobsMap).map(hwId => ({
        id_job_hw: hwId,
        areas: jobsMap[hwId]
      }))
    };

    const res = await ApiService.saveAreaSummaryJobs(payload);
    if (res.success) {
      setCustomRows([]);
      setEditedData({});
      loadJobsList();
    } else {
      alert(res.detail || "Failed to save AreaSummary records.");
    }
  } catch (e) {
    alert("Save failed: " + e.message);
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
      background: "#ffffff",
      border: "1px solid #cbd5e1",
      borderRadius: 16, width: 1120, maxWidth: "96vw", maxHeight: "92vh",
      display: "flex", flexDirection: "column", boxShadow: "0 25px 60px rgba(0,0,0,0.18)",
      overflow: "hidden"
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 24px", background: "#f8fafc",
        borderBottom: "1px solid #e2e8f0",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 26 }}>📐</span>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e293b", letterSpacing: "0.5px" }}>
              Area Summary Takeoff & Management
            </h2>
            <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>
              📌 Active Job: {selectedJobNumber && selectedJobNumber !== "ALL" ? selectedJobNumber : activeJobNumber || "All Jobs"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {currentStep === 2 && isAdmin && (
            <button onClick={() => setCurrentStep(1)} style={btnStyle("#2563eb")}>
              ← Back To Jobs List
            </button>
          )}
          <button onClick={onClose} style={{
            background: "#f1f5f9", border: "1px solid #e2e8f0",
            color: "#64748b", borderRadius: 8, width: 32, height: 32, cursor: "pointer",
            fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            ✕
          </button>
        </div>
      </div>

      {/* Sub-Header Toolbar (Chỉ Admin mới có quyền thấy và chọn/tìm kiếm Job khác) */}
      {isAdmin && (
        <div style={{
          padding: "10px 24px", background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 12
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={selectedJobNumber}
              onChange={(e) => {
                setSelectedJobNumber(e.target.value);
                if (currentStep === 1) setCurrentStep(2);
              }}
              style={{
                background: "#ffffff", border: "1px solid #cbd5e1",
                borderRadius: 8, color: "#2563eb", padding: "6px 12px", fontSize: 12, fontWeight: 700
              }}
            >
              <option value="ALL">📂 All Jobs ({uniqueJobsList.length})</option>
              {uniqueJobsList.map(j => (
                <option key={j.job_number} value={j.job_number}>📌 {j.job_number}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="🔍 Search Job / Room..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: "#ffffff", border: "1px solid #cbd5e1",
                borderRadius: 8, color: "#1e293b", padding: "6px 12px", fontSize: 12, outline: "none"
              }}
            />
          </div>
        </div>
      )}

      {/* Content Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {error && (
          <div style={{
            padding: "12px 16px", background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#dc2626", fontSize: 13, marginBottom: 16
          }}>
            ⚠️ {error}
          </div>
        )}

        {currentStep === 1 ? (
          /* STEP 1: JOB SELECTION LIST */
          <div>
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                <div style={{ fontSize: 28, animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</div>
                <div>Loading AreaSummary jobs from MSSQL...</div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>JOB NUMBER</th>
                    <th style={thStyle}>STATUS</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobsListStep1.map((item, idx) => (
                    <tr
                      key={item.job_number}
                      style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                      onClick={() => handleSelectJob(item.job_number)}
                    >
                      <td style={{ padding: "12px 14px", color: "#64748b", fontSize: 12 }}>{idx + 1}</td>
                      <td style={{ padding: "12px 14px", color: "#2563eb", fontWeight: 700 }}>{item.job_number}</td>
                      <td style={{ padding: "12px 14px", color: "#64748b" }}>{item.job_status}</td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <button style={{
                          background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)",
                          color: "#2563eb", borderRadius: 6, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer"
                        }}>
                          Select Job →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          /* STEP 2: AREA SUMMARY CALCULATION TABLE */
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={applyAIRoomsToAll} style={{
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  border: "none", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)"
                }}>
                  ⚡ Auto-Calculate & Fill AI Rooms ({groupedAIRooms.length})
                </button>
                <button onClick={() => { setCustomRows([]); setEditedData({}); setSavedKeys(new Set()); loadJobsList(); }} style={{
                  background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)",
                  color: "#059669", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5
                }}>
                  🔄 Refresh
                </button>
              </div>

              <div style={{ fontSize: 12, color: "#64748b" }}>
                Showing <strong>{groupedJobRows.length}</strong> area summary rows
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "41%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ ...thStyle, textAlign: "center" }}>#</th>
                  <th style={thStyle}>SOURCE</th>
                  <th style={thStyle}>JOB NUMBER</th>
                  <th style={thStyle}>FLOOR LEVEL</th>
                  <th style={thStyle}>AREA TYPE</th>
                  <th style={thStyle}>PRODUCT</th>
                  <th style={{ ...thStyle, color: "#059669", textAlign: "right" }}>NET AREA (M²)</th>
                </tr>
              </thead>
              <tbody>
                {groupedJobRows.map((row, sIdx) => {
                  return (
                    <tr key={row.rowKey} style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: row.source === "db" ? "rgba(59,130,246,0.02)" : "rgba(139,92,246,0.03)"
                    }}>
                      <td style={{ padding: "8px 10px", color: "#64748b", textAlign: "center", fontWeight: 600 }}>{sIdx + 1}</td>
                      <td style={{ padding: "8px 10px" }}>
                        {row.source === "db" ? (
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(59,130,246,0.1)", color: "#2563eb", fontWeight: 700 }}>📦 Saved</span>
                        ) : (
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(139,92,246,0.1)", color: "#7c3aed", fontWeight: 700 }}>⚡ New</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 10px", color: "#2563eb", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.job_number}
                      </td>

                      {/* Floor Level */}
                      <td style={{ padding: "6px 8px" }}>
                        <input
                          type="text"
                          value={getFieldValue(row, "floor_level")}
                          onChange={(e) => handleFieldChange(row, "floor_level", e.target.value)}
                          style={inputStyle}
                        />
                      </td>

                      {/* Floor Area Type */}
                      <td style={{ padding: "6px 8px" }}>
                        <select
                          value={getFieldValue(row, "floor_area_type")}
                          onChange={(e) => {
                            const newType = e.target.value;
                            handleFieldChange(row, "floor_area_type", newType);
                            const defaultProd = "";
                            handleFieldChange(row, "product", defaultProd);
                          }}
                          style={selectStyle}
                        >
                          <option value="Dry">Dry</option>
                          <option value="Wet">Wet</option>
                          <option value="Balcony Tiles">Balcony Tiles</option>
                          <option value="Tile Deck">Tile Deck</option>
                          <option value="Timber Deck">Timber Deck</option>
                          <option value="Internal">Internal</option>
                          <option value="External">External</option>
                        </select>
                      </td>

                      {/* Product */}
                      <td style={{ padding: "6px 8px" }}>
                        {(() => {
                          const currentType = getFieldValue(row, "floor_area_type") || "Dry";
                          const opts = productOptionsForType(currentType);
                          const currentProd = resolveDropdownValue(getFieldValue(row, "product"), opts, { fallback: "" });

                          return (
                            <select
                              value={currentProd}
                              onChange={(e) => handleFieldChange(row, "product", e.target.value)}
                              style={selectStyle}
                            >
                              <option value="">Select...</option>
                              {opts.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          );
                        })()}
                      </td>

                      {/* Net Area (m²) */}
                      <td style={{ padding: "6px 8px" }}>
                        <input
                          type="number"
                          step="0.01"
                          value={getFieldValue(row, "net_area")}
                          onChange={(e) => handleFieldChange(row, "net_area", e.target.value)}
                          style={{ ...inputStyle, textAlign: "right", color: "#059669", fontWeight: 800, fontSize: 13 }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
          Total Rooms: <strong>{groupedJobRows.length}</strong> | Grand Area: <strong style={{ color: "#059669" }}>{totalsSummary.grandTotalM2} m²</strong>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {currentStep === 2 && (
            <button
              onClick={saveAllJobs}
              disabled={loading}
              style={{
                background: "#2563eb",
                border: "none", color: "#fff", borderRadius: 8, padding: "8px 18px",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                boxShadow: "0 2px 8px rgba(37,99,235,0.3)"
              }}
            >
              {loading ? "⏳ Saving..." : "💾 Save All AreaSummary"}
            </button>
          )}
          <button onClick={onClose} style={btnStyle("#64748b")}>
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
);
}

function StatCard({ children, color }) {
  return (
    <div style={{
      padding: "6px 14px", borderRadius: 8,
      background: "#f8fafc",
      border: `1px solid ${color}44`,
      textAlign: "center", display: "flex", flexDirection: "column"
    }}>
      {children}
    </div>
  );
}

const thStyle = {
  padding: "10px 12px", textAlign: "left", fontWeight: 700,
  color: "#475569", fontSize: 11, textTransform: "uppercase",
  whiteSpace: "nowrap", borderBottom: "2px solid #cbd5e1"
};

const statLabel = {
  fontSize: 9, color: "#64748b", textTransform: "uppercase", marginTop: 2
};

const inputStyle = {
  width: "100%", background: "#ffffff",
  border: "1px solid #cbd5e1", borderRadius: 6,
  color: "#1e293b", padding: "6px 10px", fontSize: 11, outline: "none",
  boxSizing: "border-box"
};

const selectStyle = {
  width: "100%", background: "#ffffff", border: "1px solid #cbd5e1",
  borderRadius: 6, color: "#1e293b", padding: "6px 8px", fontSize: 11, outline: "none",
  boxSizing: "border-box"
};

function btnStyle(color) {
  return {
    background: "#f1f5f9", border: "1px solid #cbd5e1",
    color: color, borderRadius: 8, padding: "6px 12px",
    fontSize: 11, fontWeight: 700, cursor: "pointer"
  };
}
