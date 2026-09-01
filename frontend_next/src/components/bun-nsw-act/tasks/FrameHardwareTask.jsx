import React, { useState, useRef, useEffect, useMemo } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";

export default function FrameHardwareTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber
}) {
  const tableRef = useRef(null);
  const {
    user,
    pages = [],
    wallsByPage = {},
    scalesByPage = {},
    realScale,
    currentJobId,
    currentProjectName
  } = useAppModel();

  const currentUserUpdate = user?.username || user?.name || (typeof window !== "undefined" && localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user") || "{}")?.username : null) || "admin";

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSection1Open, setIsSection1Open] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);

  // Slab Floor State
  const [slabWallHeight, setSlabWallHeight] = useState("Select...");
  const [slabWallLength, setSlabWallLength] = useState("");
  const [slabSpacing, setSlabSpacing] = useState("900");
  const [slabRodSize, setSlabRodSize] = useState("M12");

  // Timber Floor State
  const [timberWallHeight, setTimberWallHeight] = useState("Select...");
  const [timberWallLength, setTimberWallLength] = useState("");
  const [timberSpacing, setTimberSpacing] = useState("900");
  const [timberRodSize, setTimberRodSize] = useState("M12");

  // Helper tính mm từ px và scale (chuẩn hóa giống FrameworkJobsModal)
  const computeMmLength = (lenPx, pScale, pRealScale) => {
    if (!lenPx || lenPx <= 0) return 0;
    const s = (pScale !== undefined && pScale !== null && pScale > 0)
      ? pScale
      : (pRealScale && pRealScale > 0 ? pRealScale : null);

    if (!s) return Math.round(lenPx);

    if (s < 0.5) {
      return Math.round(lenPx * s * 1000);
    } else {
      return Math.round(lenPx * s);
    }
  };

  // Tính toán tất cả các tường từ AI Canvas của tất cả các trang
  const aiCanvasWallsGrouped = useMemo(() => {
    const pageIndices = new Set([
      ...pages.map((_, i) => i),
      ...Object.keys(wallsByPage || {}).map(Number)
    ]);
    if (pageIndices.size === 0) pageIndices.add(0);

    const groupsMap = {}; // key: `${floorType}_${height}` -> { floorType, heightMm, totalMm }

    Array.from(pageIndices).forEach(pIdx => {
      const pageWalls = (wallsByPage && wallsByPage[pIdx]) ? wallsByPage[pIdx] : [];
      const pageScale = (scalesByPage && scalesByPage[pIdx] !== undefined) ? scalesByPage[pIdx] : null;

      pageWalls.forEach(w => {
        const c = w.centerline;
        if (!c || !Array.isArray(c) || c.length !== 2) return;
        const dx = c[1][0] - c[0][0];
        const dy = c[1][1] - c[0][1];
        const lenPx = Math.hypot(dx, dy);
        const lenMm = computeMmLength(lenPx, pageScale, realScale);
        if (lenMm <= 0) return;

        const rawType = (w.floor_type || "").toLowerCase();
        const rawClass = (w.class_name || "").toLowerCase();
        const isSlab = rawType.includes("slab") || rawClass.includes("slab");
        const floorType = isSlab ? "Slab" : "Timber";
        const hMm = Number(w.height_mm || w.height || 2700);

        const key = `${floorType}_${hMm}`;
        if (!groupsMap[key]) {
          groupsMap[key] = { floorType, heightMm: hMm, totalMm: 0 };
        }
        groupsMap[key].totalMm += lenMm;
      });
    });

    return Object.values(groupsMap);
  }, [pages, wallsByPage, scalesByPage, realScale]);

  // ── Listen for Auto-Calculate & Fill event from FrameworkJobsModal ──
  useEffect(() => {
    const handleAutoApplyFramework = (e) => {
      if (!e.detail) return;
      const { wallEntries = [] } = e.detail;
      if (wallEntries.length > 0 && onSetEntries) {
        onSetEntries(wallEntries);
      }
    };
    window.addEventListener("ezefloor:apply_ai_walls_to_framework", handleAutoApplyFramework);
    return () => window.removeEventListener("ezefloor:apply_ai_walls_to_framework", handleAutoApplyFramework);
  }, [onSetEntries]);

  // ── Tự động tải dữ liệu tường đã lưu từ ProcurementApp.dbo.FrameWork của Job này ──
  useEffect(() => {
    async function loadExistingSavedWalls() {
      if (entries && entries.length > 0) return;
      try {
        const res = await ApiService.fetchFrameworkJobs();
        if (res && res.data) {
          const target = String(currentProjectName || activeJobNumber || "").trim().toLowerCase();
          const matchedRows = res.data.filter(j => {
            const jn = String(j.job_number || "").trim().toLowerCase();
            const hw = String(j.IDJob_HW || j.hw_id || "").trim().toLowerCase();
            return (jn && jn === target) || (hw && hw === target);
          });

          const validRows = matchedRows.filter(r => r.wall_length && parseFloat(r.wall_length) > 0);
          if (validRows.length > 0 && onSetEntries) {
            const loadedEntries = validRows.map((r, idx) => {
              const isTimber = (r.wall_above || "").toUpperCase().includes("TIMBER") || (r.floor_type || "").toUpperCase().includes("TIMBER");
              const hMm = parseInt(r.wall_height, 10) || 2700;
              const lenMm = Math.round(parseFloat(r.wall_length)) || 0;
              const spacingMm = parseInt(r.spacing, 10) || 900;
              const rodSize = r.rod_size ? (String(r.rod_size).startsWith("M") ? r.rod_size : `M${Math.round(parseFloat(r.rod_size))}`) : "M12";
              const demand = (lenMm / spacingMm).toFixed(2);
              const rodCount = Math.ceil(lenMm / spacingMm) || 1;
              const rodLength = hMm <= 2440 ? 2700 : (hMm <= 2740 ? 3000 : 3600);

              return {
                id: (isTimber ? "tmb-" : "slab-") + Date.now() + "-" + idx,
                baseType: isTimber ? "Timber Floor" : "Concrete Slab",
                theWallAbove: isTimber ? "ON TIMBER FLOOR" : "ON CONCRETE SLAB FLOOR",
                height: `${hMm} mm`,
                length: `${lenMm} mm`,
                spacing: `${spacingMm} mm`,
                rodSize: rodSize,
                rodDemand: demand,
                rodMapping: `${rodCount} x ${rodSize} Rod ${rodLength}`,
                rodsQty: `${rodCount} pcs`
              };
            });

            if (loadedEntries.length > 0) {
              onSetEntries(loadedEntries);
            }
          }
        }
      } catch (e) {
        console.error("Auto load existing framework walls error:", e);
      }
    }
    loadExistingSavedWalls();
  }, [currentProjectName, activeJobNumber]);

  const handleSaveInlineEdit = (id) => {
    const lenVal = parseFloat(editRowData.length) || 0;
    const spacingVal = parseFloat(editRowData.spacing) || 900;
    const hVal = parseFloat(editRowData.height) || 2700;
    const demand = (lenVal / spacingVal).toFixed(2);
    const rodCount = Math.ceil(lenVal / spacingVal) || 1;
    const rodLen = hVal <= 2440 ? 2700 : (hVal <= 2740 ? 3000 : 3600);

    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData,
      height: editRowData.height ? (String(editRowData.height).includes("mm") ? editRowData.height : `${editRowData.height} mm`) : item.height,
      length: editRowData.length ? (String(editRowData.length).includes("mm") ? editRowData.length : `${editRowData.length} mm`) : item.length,
      spacing: editRowData.spacing ? (String(editRowData.spacing).includes("mm") ? editRowData.spacing : `${editRowData.spacing} mm`) : item.spacing,
      rodDemand: demand,
      rodsQty: `${rodCount} pcs`,
      rodMapping: `${rodCount} x ${item.rodSize || "M12"} Rod ${rodLen}`
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  const WALL_HEIGHT_OPTIONS = [
    "Select...",
    "2440",
    "2740",
    "3000",
    "3300",
    "3400",
    "3600",
    "5200",
    "5800",
    "6400",
    "7000",
    "8800"
  ];

  const ROD_SIZE_OPTIONS = ["M12", "M16"];

  const handleUpdateEntryRodSize = (id, newSize) => {
    const next = (entries || []).map(w => {
      if (w.id !== id) return w;
      const hMm = parseInt(String(w.height || "2700").replace(/mm/gi, "").trim(), 10) || 2700;
      const lenMm = parseInt(String(w.length || "0").replace(/mm/gi, "").trim(), 10) || 0;
      const spacingMm = parseInt(String(w.spacing || "900").replace(/mm/gi, "").trim(), 10) || 900;
      const rodCount = Math.ceil(lenMm / spacingMm) || 1;
      const rodLength = hMm <= 2440 ? 2700 : (hMm <= 2740 ? 3000 : 3600);
      return {
        ...w,
        rodSize: newSize,
        rodMapping: `${rodCount} x ${newSize} Rod ${rodLength}`
      };
    });
    if (onSetEntries) {
      onSetEntries(next);
    }
  };

  const handleAddSlabWall = () => {
    const lenMm = parseFloat(slabWallLength) || (cadMetrics.grandTotalLength ? Math.round(cadMetrics.grandTotalLength * 1000) : 18500);
    const hMm = slabWallHeight !== "Select..." ? parseInt(slabWallHeight, 10) : 2440;
    const spacingMm = parseInt(slabSpacing, 10) || 900;
    const demand = (lenMm / spacingMm).toFixed(2);
    const rodCount = Math.ceil(lenMm / spacingMm) || 1;
    const rodLength = hMm <= 2440 ? 2700 : (hMm <= 2740 ? 3000 : 3600);

    const newEntry = {
      id: "slab-" + Date.now(),
      baseType: "Concrete Slab",
      theWallAbove: "ON CONCRETE SLAB FLOOR",
      height: `${hMm} mm`,
      length: `${lenMm} mm`,
      spacing: `${spacingMm} mm`,
      rodSize: slabRodSize,
      rodDemand: demand,
      rodMapping: `${rodCount} x ${slabRodSize} Rod ${rodLength}`,
      rodsQty: `${rodCount} pcs`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setSlabWallLength("");
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  const handleAddTimberWall = () => {
    const lenMm = parseFloat(timberWallLength) || (cadMetrics.grandTotalLength ? Math.round(cadMetrics.grandTotalLength * 1000) : 18500);
    const hMm = timberWallHeight !== "Select..." ? parseInt(timberWallHeight, 10) : 2440;
    const spacingMm = parseInt(timberSpacing, 10) || 900;
    const demand = (lenMm / spacingMm).toFixed(2);
    const rodCount = Math.ceil(lenMm / spacingMm) || 1;
    const rodLength = hMm <= 2440 ? 2700 : (hMm <= 2740 ? 3000 : 3600);

    const newEntry = {
      id: "tmb-" + Date.now(),
      baseType: "Timber Floor",
      theWallAbove: "ON TIMBER FLOOR",
      height: `${hMm} mm`,
      length: `${lenMm} mm`,
      spacing: `${spacingMm} mm`,
      rodSize: timberRodSize,
      rodDemand: demand,
      rodMapping: `${rodCount} x ${timberRodSize} Rod ${rodLength}`,
      rodsQty: `${rodCount} pcs`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setTimberWallLength("");
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  // ── Auto-Calculate & Fill from AI Canvas ──
  const handleAutoFillAI = () => {
    let generatedEntries = [];

    if (aiCanvasWallsGrouped.length > 0) {
      generatedEntries = aiCanvasWallsGrouped.map((g, idx) => {
        const isSlab = g.floorType === "Slab";
        const spacingMm = 900;
        const demand = (g.totalMm / spacingMm).toFixed(2);
        const rodCount = Math.ceil(g.totalMm / spacingMm) || 1;
        const rodLength = g.heightMm <= 2440 ? 2700 : (g.heightMm <= 2740 ? 3000 : 3600);
        return {
          id: (isSlab ? "slab-" : "tmb-") + Date.now() + "-" + idx,
          baseType: isSlab ? "Concrete Slab" : "Timber Floor",
          theWallAbove: isSlab ? "ON CONCRETE SLAB FLOOR" : "ON TIMBER FLOOR",
          height: `${g.heightMm} mm`,
          length: `${Math.round(g.totalMm)} mm`,
          spacing: `${spacingMm} mm`,
          rodSize: "M12",
          rodDemand: demand,
          rodMapping: `${rodCount} x M12 Rod ${rodLength}`,
          rodsQty: `${rodCount} pcs`
        };
      });
    } else {
      // Fallback: nếu chưa vẽ centerline, dùng grandTotalLength hoặc giá trị ước tính
      const totalMm = cadMetrics?.grandTotalLength
        ? Math.round(cadMetrics.grandTotalLength * 1000)
        : 138922;
      const timberMm = Math.round(totalMm * 0.85);
      const slabMm = totalMm - timberMm;

      generatedEntries = [
        {
          id: "tmb-" + Date.now() + "-1",
          baseType: "Timber Floor",
          theWallAbove: "ON TIMBER FLOOR",
          height: "2700 mm",
          length: `${timberMm} mm`,
          spacing: "900 mm",
          rodSize: "M12",
          rodDemand: (timberMm / 900).toFixed(2),
          rodMapping: `${Math.ceil(timberMm / 900)} x M12 Rod 3000`,
          rodsQty: `${Math.ceil(timberMm / 900)} pcs`
        },
        {
          id: "slab-" + Date.now() + "-2",
          baseType: "Concrete Slab",
          theWallAbove: "ON CONCRETE SLAB FLOOR",
          height: "3000 mm",
          length: `${slabMm} mm`,
          spacing: "900 mm",
          rodSize: "M12",
          rodDemand: (slabMm / 900).toFixed(2),
          rodMapping: `${Math.ceil(slabMm / 900)} x M12 Rod 3600`,
          rodsQty: `${Math.ceil(slabMm / 900)} pcs`
        }
      ];
    }

    if (onSetEntries) {
      onSetEntries(generatedEntries);
    }

    if (onAddDataAI) {
      onAddDataAI("frame_hardware");
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ezefloor:apply_ai_walls_to_framework", {
        detail: { wallEntries: generatedEntries }
      }));
    }

    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  // ── Save to database via API ──
  const handleSaveToDatabase = async () => {
    if (!entries || entries.length === 0) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const seenHeights = {};
      const wallsList = [];

      entries.forEach(w => {
        const rawAbove = w.theWallAbove || "";
        const isTimber = rawAbove.toUpperCase().includes("TIMBER") || w.baseType === "Timber Floor" || w.baseType === "Timber";
        const floorType = isTimber ? "Timber" : "Slab";
        const heightMm = parseInt(String(w.height || "2700").replace(/mm/gi, "").trim(), 10) || 2700;
        const lengthMm = parseInt(String(w.length || "0").replace(/mm/gi, "").trim(), 10) || 0;
        const spacingMm = parseInt(String(w.spacing || "900").replace(/mm/gi, "").trim(), 10) || 900;
        const rodSize = w.rodSize || "M12";
        const heightKey = `${floorType}_${heightMm}`;

        if (!seenHeights[heightKey]) {
          seenHeights[heightKey] = {
            floor_type: floorType,
            wall_height: heightMm,
            wall_length: lengthMm,
            spacing: spacingMm,
            rod_size: rodSize,
            short_name: getActiveClientShortName()
          };
        } else {
          seenHeights[heightKey].wall_length += lengthMm;
        }
      });

      wallsList.push(...Object.values(seenHeights));

      if (wallsList.length === 0) return;

      const jobId = currentProjectName || activeJobNumber || "TestAI";

      const payload = {
        user_update: currentUserUpdate,
        jobs: [{
          id_job_hw: jobId,
          walls: wallsList
        }]
      };

      const res = await ApiService.saveFrameworkJobs(payload);
      if (res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Lỗi khi lưu FrameWork từ Task Panel:", err);
      alert("Lỗi khi lưu dữ liệu FrameWork: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  // Tổng số mét tường Timber & Slab để hiển thị trên Banner
  const timberAiMm = aiCanvasWallsGrouped.length > 0
    ? aiCanvasWallsGrouped.filter(g => g.floorType === "Timber").reduce((sum, g) => sum + g.totalMm, 0)
    : (entries || [])
        .filter(w => {
          const rawAbove = w.theWallAbove || "";
          return rawAbove.toUpperCase().includes("TIMBER") || w.baseType === "Timber Floor" || w.baseType === "Timber";
        })
        .reduce((sum, w) => sum + (parseInt(String(w.length || "0").replace(/mm/gi, "").trim(), 10) || 0), 0);

  const slabAiMm = aiCanvasWallsGrouped.length > 0
    ? aiCanvasWallsGrouped.filter(g => g.floorType === "Slab").reduce((sum, g) => sum + g.totalMm, 0)
    : (entries || [])
        .filter(w => {
          const rawAbove = w.theWallAbove || "";
          return rawAbove.toUpperCase().includes("SLAB") || rawAbove.toUpperCase().includes("CONCRETE") || w.baseType === "Concrete Slab" || w.baseType === "Slab";
        })
        .reduce((sum, w) => sum + (parseInt(String(w.length || "0").replace(/mm/gi, "").trim(), 10) || 0), 0);

  const hasAIData = timberAiMm > 0 || slabAiMm > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>



      {/* ── CARD 1: WALL INFORMATION (MATCHING BUN-NSW-ACT) ── */}
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
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            userSelect: "none"
          }}
          title="Click to collapse / expand Wall information"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#0f172a", transition: "transform 0.2s ease" }}>
              {isSection1Open ? "▼" : "►"}
            </span>
            <span>1. Wall information</span>
          </div>
          <span style={{
            fontSize: "10.5px",
            color: "#64748b",
            fontWeight: 600,
            background: "#e2e8f0",
            padding: "2px 8px",
            borderRadius: "4px"
          }}>
            {isSection1Open ? "Click to collapse" : "Click to expand"}
          </span>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          
          {/* SECTION: ON CONCRETE SLAB FLOOR */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{
              padding: "7px 10px",
              background: "#f1f5f9",
              borderBottom: "1px solid #e2e8f0",
              fontSize: "11px",
              fontWeight: 800,
              color: "#334155"
            }}>
              ▼ ON CONCRETE SLAB FLOOR
            </div>
            <div style={{ padding: "10px", display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              {/* Wall Height */}
              <div style={{ flex: "1 1 120px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Wall Height</span>
                <select
                  value={slabWallHeight}
                  onChange={(e) => setSlabWallHeight(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {WALL_HEIGHT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Wall Length */}
              <div style={{ flex: "1.4 1 150px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Length</span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder={cadMetrics.grandTotalLength ? `${Math.round(cadMetrics.grandTotalLength * 1000)}` : "Enter millimetres..."}
                  value={slabWallLength}
                  onChange={(e) => setSlabWallLength(e.target.value)}
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

              {/* Spacing */}
              <div style={{ flex: "1 1 100px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Spacing</span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  value={slabSpacing}
                  onChange={(e) => setSlabSpacing(e.target.value)}
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

              {/* Rod Size */}
              <div style={{ flex: "1 1 110px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Rod Size</span>
                <select
                  value={slabRodSize}
                  onChange={(e) => setSlabRodSize(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  <option value="M12">M12</option>
                  <option value="M16">M16</option>
                </select>
              </div>

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAddSlabWall}
                style={{
                  padding: "7px 14px",
                  background: "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                + Add wall
              </button>
            </div>
          </div>

          {/* SECTION: ON TIMBER FLOOR */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{
              padding: "7px 10px",
              background: "#f1f5f9",
              borderBottom: "1px solid #e2e8f0",
              fontSize: "11px",
              fontWeight: 800,
              color: "#334155"
            }}>
              ▼ ON TIMBER FLOOR
            </div>
            <div style={{ padding: "10px", display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              {/* Wall Height */}
              <div style={{ flex: "1 1 120px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Wall Height</span>
                <select
                  value={timberWallHeight}
                  onChange={(e) => setTimberWallHeight(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {WALL_HEIGHT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Wall Length */}
              <div style={{ flex: "1.4 1 150px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Length</span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder={cadMetrics.grandTotalLength ? `${Math.round(cadMetrics.grandTotalLength * 1000)}` : "Enter millimetres..."}
                  value={timberWallLength}
                  onChange={(e) => setTimberWallLength(e.target.value)}
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

              {/* Spacing */}
              <div style={{ flex: "1 1 100px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Spacing</span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  value={timberSpacing}
                  onChange={(e) => setTimberSpacing(e.target.value)}
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

              {/* Rod Size */}
              <div style={{ flex: "1 1 110px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Rod Size</span>
                <select
                  value={timberRodSize}
                  onChange={(e) => setTimberRodSize(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  <option value="M12">M12</option>
                  <option value="M16">M16</option>
                </select>
              </div>

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAddTimberWall}
                style={{
                  padding: "7px 14px",
                  background: "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                + Add wall
              </button>
            </div>
          </div>

        </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED WALLS ── */}
      <div ref={tableRef} style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsSection2Open(!isSection2Open)}
          style={{
            padding: "9px 12px",
            background: "#f8fafc",
            borderBottom: isSection2Open ? "1px solid #e2e8f0" : "none",
            fontWeight: "800",
            fontSize: "12px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none",
            gap: "6px"
          }}
          title="Click to collapse / expand Entered walls"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#0f172a", transition: "transform 0.2s ease" }}>
              {isSection2Open ? "▼" : "►"}
            </span>
            <span>2. Entered walls ({(entries || []).length})</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={handleAutoFillAI}
              style={{
                background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                border: "1px solid #93c5fd",
                color: "#1d4ed8",
                fontSize: "10.5px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "3px"
              }}
            >
              <span>⚡</span>
              <span>Auto Fill (AI)</span>
            </button>
            <span style={{
              fontSize: "10.5px",
              color: "#64748b",
              fontWeight: 600,
              background: "#e2e8f0",
              padding: "2px 8px",
              borderRadius: "4px"
            }}>
              {isSection2Open ? "Click to collapse" : "Click to expand"}
            </span>
          </div>
        </div>

        {isSection2Open && (
          <>
            <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
            <thead>
              <tr style={{ background: "#1e3a5f", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "6px 8px", width: "24px" }}>#</th>
                <th style={{ padding: "6px 8px" }}>The Wall Above</th>
                <th style={{ padding: "6px 8px" }}>Wall Height</th>
                <th style={{ padding: "6px 8px" }}>Wall Length</th>
                <th style={{ padding: "6px 8px" }}>Spacing</th>
                <th style={{ padding: "6px 8px" }}>Rod size</th>
                <th style={{ padding: "6px 8px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((w, idx) => {
                const isSelected = selectedEntryId === w.id;
                const isRowEditing = editingRowId === w.id;
                const rawAbove = w.theWallAbove || "";
                const isTimber = rawAbove.toUpperCase().includes("TIMBER") || w.baseType === "Timber Floor" || w.baseType === "Timber";
                const wallAboveLabel = isTimber ? "Timber" : "Slab";
                const rodSizeVal = w.rodSize || (isTimber ? (formData.timber_rod_size || "M12") : (formData.slab_rod_size || "M12"));

                return (
                  <tr
                    key={w.id || idx}
                    onClick={() => {
                      if (!isRowEditing) {
                        setSelectedEntryId(isSelected ? null : w.id);
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
                    <td style={{ padding: "6px 8px", fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{
                        background: isTimber ? "#fef3c7" : "#fee2e2",
                        color: isTimber ? "#92400e" : "#991b1b",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        fontWeight: 800,
                        fontSize: "9.5px",
                        letterSpacing: "0.3px",
                        display: "inline-block",
                        textTransform: "uppercase"
                      }}>
                        {wallAboveLabel}
                      </span>
                    </td>

                    {/* Wall Height */}
                    <td style={{ padding: "6px 8px" }}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.height ? String(editRowData.height).replace("mm", "").trim() : "2700"}
                          onChange={(e) => setEditRowData({ ...editRowData, height: e.target.value })}
                          style={{ padding: "2px 4px", fontSize: "10.5px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        >
                          {WALL_HEIGHT_OPTIONS.filter(opt => opt !== "Select...").map(opt => (
                            <option key={opt} value={opt}>{opt} mm</option>
                          ))}
                        </select>
                      ) : (
                        w.height
                      )}
                    </td>

                    {/* Wall Length */}
                    <td style={{ padding: "6px 8px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.length || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, length: e.target.value })}
                          style={{ width: "75px", padding: "2px 4px", fontSize: "10.5px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.length
                      )}
                    </td>

                    {/* Spacing */}
                    <td style={{ padding: "6px 8px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.spacing || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, spacing: e.target.value })}
                          style={{ width: "60px", padding: "2px 4px", fontSize: "10.5px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.spacing
                      )}
                    </td>

                    {/* Rod Size */}
                    <td style={{ padding: "4px 8px" }} onClick={(e) => e.stopPropagation()}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.rodSize !== undefined ? editRowData.rodSize : (rodSizeVal || "M12")}
                          onChange={(e) => setEditRowData({ ...editRowData, rodSize: e.target.value })}
                          style={{
                            padding: "3px 6px",
                            fontSize: "11px",
                            fontWeight: 700,
                            border: "1.5px solid #3b82f6",
                            borderRadius: "4px",
                            background: "#eff6ff",
                            color: "#1e3a5f",
                            cursor: "pointer",
                            outline: "none"
                          }}
                        >
                          {ROD_SIZE_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={rodSizeVal || "M12"}
                          onChange={(e) => handleUpdateEntryRodSize(w.id, e.target.value)}
                          style={{
                            padding: "3px 6px",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#1e3a5f",
                            background: "#f8fafc",
                            border: "1px solid #cbd5e1",
                            borderRadius: "4px",
                            cursor: "pointer",
                            outline: "none"
                          }}
                        >
                          {ROD_SIZE_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Actions: Edit on left of X */}
                    <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
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
                                height: String(w.height || "2700").replace("mm", "").trim(),
                                length: String(w.length || "0").replace("mm", "").replace("m", "").trim(),
                                spacing: String(w.spacing || "900").replace("mm", "").trim()
                              });
                            }}
                            style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                            title="Edit wall"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveEntry(w.id); }}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px", padding: "0 2px" }}
                            title="Remove wall"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!entries || entries.length === 0) && (
                <tr>
                  <td colSpan={7} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No walls entered. Enter wall specifications above or click Auto-Calculate & Fill.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── ACTION BUTTONS: SAVE & PROCUREMENT (ONLY WHEN RESULTS EXIST) ── */}
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
                onClick={handleSaveToDatabase}
                disabled={isSaving}
                style={{
                  padding: "4px 8px",
                  background: saveSuccess ? "#16a34a" : "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "10.5px",
                  fontWeight: "700",
                  cursor: isSaving ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                  opacity: isSaving ? 0.7 : 1,
                  transition: "background 0.2s ease"
                }}
              >
                {isSaving ? "⏳ Saving..." : saveSuccess ? "✅ Saved!" : "💾 Save"}
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