import React, { useState, useRef, useEffect, useMemo } from "react";
import EnteredTaskActions from "./EnteredTaskActions";
import { ApiService } from "@/models/api.service";
import { FRAME_WALL_HEIGHTS, FRAME_HARDWARE_EXTRA_FIELDS } from "@/constants/procurementFormParity";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { getWallClass } from "@/utils/geometry";
import { normalizeFloorLevelCode } from "@/utils/floorLevel";
import { buildArchitecturalFloorLevelMap, getArchitecturalPageIndices, normalizeFloorLevel } from "@/utils/procurementAutoFill";
import { calculateEnteredWallsByLevel } from "@/engines/TakeoffSummaryEngine";
import { groupByFloorLevel } from "@/utils/floorLevelDisplay";
import FloorLevelGroupRow from "./FloorLevelGroupRow";

const parseFrameExtras = (value) => {
  try {
    if (value && typeof value === "object") return value;
    return value ? JSON.parse(value) : {};
  } catch { return {}; }
};

export default function FrameHardwareTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber,
  selectedWall: selectedWallProp,
  selectedWallIds: selectedWallIdsProp,
  selectedId: selectedIdProp,
  selectedType: selectedTypeProp,
  wallsByPage: wallsByPageProp,
  pages: pagesProp,
  scalesByPage: scalesByPageProp,
  realScale: realScaleProp,
  scaleValue: scaleValueProp,
  walls: wallsProp,
  updateWallsProperty,
  goPage,
  onClearData
}) {
  const tableRef = useRef(null);
  const {
    user,
    pages: pagesCtx = [],
    wallsByPage: wallsByPageCtx = {},
    scalesByPage: scalesByPageCtx = {},
    realScale: realScaleCtx,
    currentPage,
    setCurrentPage,
    currentJobId,
    currentProjectName,
    selectedWall,
    selectedWallIds,
    selectedId,
    selectedType,
    hoveredWallId
  } = useAppModel();

  const pages = (pagesProp && pagesProp.length > 0) ? pagesProp : pagesCtx;
  const wallsByPage = (wallsByPageProp && Object.keys(wallsByPageProp).length > 0) ? wallsByPageProp : wallsByPageCtx;
  const scalesByPage = (scalesByPageProp && Object.keys(scalesByPageProp).length > 0) ? scalesByPageProp : scalesByPageCtx;
  const realScale = realScaleProp || realScaleCtx;

  const architecturalPageIndices = useMemo(() => getArchitecturalPageIndices(pages), [pages]);

  const floorLevelByPage = useMemo(() => buildArchitecturalFloorLevelMap(pages), [pages]);

  const wallPageById = useMemo(() => {
    const result = new Map();
    Object.entries(wallsByPage || {}).forEach(([pageKey, pageWalls]) => {
      const pageIndex = Number(pageKey);
      (pageWalls || []).forEach((wall) => {
        if (wall?.id === undefined || wall?.id === null) return;
        const wallId = String(wall.id);
        const pageSet = result.get(wallId) || new Set();
        pageSet.add(pageIndex);
        result.set(wallId, pageSet);
      });
    });
    return result;
  }, [wallsByPage]);

  const currentUserUpdate = user?.username || user?.name || (typeof window !== "undefined" && localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user") || "{}")?.username : null) || "admin";

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isSlabOpen, setIsSlabOpen] = useState(true);
  const [isTimberOpen, setIsTimberOpen] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const [isExtrasOpen, setIsExtrasOpen] = useState(true);

  // Slab Floor State
  const [slabWallHeight, setSlabWallHeight] = useState("Select...");
  const [slabWallLength, setSlabWallLength] = useState("");
  const [slabSpacing, setSlabSpacing] = useState("900");
  const [slabRodSize, setSlabRodSize] = useState("M12");
  const [slabFloorLevel, setSlabFloorLevel] = useState("GF");
  const [slabWallClass, setSlabWallClass] = useState("exterior_wall");

  // Timber Floor State
  const [timberWallHeight, setTimberWallHeight] = useState("Select...");
  const [timberWallLength, setTimberWallLength] = useState("");
  const [timberSpacing, setTimberSpacing] = useState("900");
  const [timberRodSize, setTimberRodSize] = useState("M12");
  const [timberFloorLevel, setTimberFloorLevel] = useState("GF");
  const [timberWallClass, setTimberWallClass] = useState("exterior_wall");

  const LEVEL_OPTIONS = [
    { value: "GF", label: "GF (Ground Floor)" },
    { value: "FF", label: "FF (First Floor)" },
    { value: "SF", label: "SF (Second Floor)" },
    { value: "TF", label: "TF (Third Floor)" }
  ];

  const WALL_CLASS_OPTIONS = [
    { value: "exterior_wall", label: "External Wall" },
    { value: "interior_wall", label: "Internal Load Bearing" }
  ];

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

  // Helper: Xác định tường có đủ điều kiện tính vào bảng Frame Hardware:
  // CHỈ TÍNH:
  // 1. External Wall (exterior_wall / ext / is_ext / is_exterior)
  // 2. Internal Load Bearing Wall (interior_wall / int VÀ is_lbw == true / is_load_bearing == true)
  // Tường non-load bearing (is_lbw == false) hoặc partition_wall không chọn Load Bearing -> LOẠI TRỪ
  const getQualifiedWallInfo = (w) => {
    const rawClass = String(w.class_name || w.wall_type || "").toLowerCase().trim();
    const isExt = rawClass === "exterior_wall" || rawClass === "ext" || Boolean(w.is_ext || w.is_exterior);
    const isLbw = Boolean(w.is_lbw === true || w.is_load_bearing === true || w.lbw === true);
    const isInt = rawClass === "interior_wall" || rawClass === "int";

    if (isExt) {
      return { qualified: true, wallClass: "exterior_wall", isExternal: true };
    }
    if ((isInt || !rawClass || rawClass === "wall") && isLbw) {
      return { qualified: true, wallClass: "interior_wall", isExternal: false };
    }
    if (isLbw && !isExt) {
      return { qualified: true, wallClass: "interior_wall", isExternal: false };
    }
    return { qualified: false };
  };

  // Tính toán tất cả các tường từ AI Canvas của tất cả các trang
  const aiCanvasWallsGrouped = useMemo(() => {
    // ONLY take architectural floor pages (exclude pdf_tools / task category pages)
    const validArchitecturalIndices = architecturalPageIndices.length > 0
      ? architecturalPageIndices
      : ((pages || []).length > 0 && !pages[0]?.category && pages[0]?.source !== "pdf_tools" ? [0] : []);

    const pageIndices = new Set([
      ...validArchitecturalIndices,
      ...Object.keys(wallsByPage || {}).map(Number).filter(idx => validArchitecturalIndices.includes(idx))
    ]);
    if (pageIndices.size === 0 && validArchitecturalIndices.length > 0) pageIndices.add(validArchitecturalIndices[0]);

    // Helper: determine FloorLevel label from page index
    const _getFloorLevelByPage = (idx) => {
      const archOrderIdx = architecturalPageIndices.indexOf(idx);
      const effectiveOrderIdx = archOrderIdx >= 0 ? archOrderIdx : idx;
      return floorLevelByPage.get(idx) || normalizeFloorLevel(pages?.[idx], effectiveOrderIdx);
    };

    const groupsMap = {};

    Array.from(pageIndices).forEach(pIdx => {
      const pageWalls = (wallsByPage && wallsByPage[pIdx]) ? wallsByPage[pIdx] : [];
      const pageScale = (scalesByPage && scalesByPage[pIdx] !== undefined) ? scalesByPage[pIdx] : null;
      const floorLevel = _getFloorLevelByPage(pIdx);

      pageWalls.forEach(w => {
        const qInfo = getQualifiedWallInfo(w);
        if (!qInfo.qualified) return;

        let lenMm = 0;
        if (w.length_m) {
          lenMm = Math.round(w.length_m * 1000);
        } else if (w.centerline && Array.isArray(w.centerline) && w.centerline.length === 2) {
          const dx = w.centerline[1][0] - w.centerline[0][0];
          const dy = w.centerline[1][1] - w.centerline[0][1];
          const lenPx = Math.hypot(dx, dy);
          lenMm = computeMmLength(lenPx, pageScale, realScale);
        }
        if (lenMm <= 0) return;

        const rawFloor = String(w.floor_type || w.floorType || w.base_construction || "").toLowerCase();
        const isSlab = rawFloor.includes("slab") || rawFloor.includes("concrete");
        const floorType = isSlab ? "Slab" : "Timber";
        const hMm = Number(w.height_mm || w.height || 2400);
        const wallClass = qInfo.wallClass;

        const key = `${pIdx}_${floorLevel}_${floorType}_${wallClass}_${hMm}`;
        if (!groupsMap[key]) {
          groupsMap[key] = {
            sourcePageIndex: pIdx,
            floorLevel,
            floorType,
            baseType: isSlab ? "Concrete Slab" : "Timber Floor",
            theWallAbove: isSlab ? "ON CONCRETE SLAB FLOOR" : "ON TIMBER FLOOR",
            wallClass,
            heightMm: hMm,
            totalMm: 0,
            wallIds: []
          };
        }
        groupsMap[key].totalMm += lenMm;
        groupsMap[key].wallIds.push(w.id);
      });
    });

    return Object.values(groupsMap).sort((a, b) => {
      if (a.floorLevel !== b.floorLevel) {
        if (a.floorLevel === "GF") return -1;
        if (b.floorLevel === "GF") return 1;
        return a.floorLevel.localeCompare(b.floorLevel);
      }
      if (a.floorType !== b.floorType) {
        return a.floorType === "Slab" ? -1 : 1;
      }
      if (a.wallClass !== b.wallClass) {
        return a.wallClass === "exterior_wall" ? -1 : 1;
      }
      return a.heightMm - b.heightMm;
    });
  }, [pages, wallsByPage, scalesByPage, realScale, architecturalPageIndices, floorLevelByPage]);

  // ── Tự động đồng bộ các thay đổi từ properties / AI Canvas vào bảng Entered walls ──
  useEffect(() => {
    if (!aiCanvasWallsGrouped || aiCanvasWallsGrouped.length === 0) return;

    const newCanvasEntries = aiCanvasWallsGrouped.map((g) => {
      const isSlab = g.floorType === "Slab";
      const spacingMm = 900;
      const stableId = `canvas-page-${g.sourcePageIndex}-${g.floorLevel}-${g.floorType}-${g.wallClass}-${g.heightMm}`;

      const existing = (entries || []).find(e =>
        e.id === stableId ||
        (e.floorLevel === g.floorLevel &&
          (e.baseType === g.baseType || (isSlab ? e.baseType === "Concrete Slab" : e.baseType === "Timber Floor")) &&
          e.wallClass === g.wallClass &&
          parseInt(String(e.height).replace(/mm/g, "").trim(), 10) === g.heightMm)
      );

      const curRodSize = existing?.rodSize || "M12";
      const curSpacing = existing?.spacing ? parseInt(String(existing.spacing).replace(/mm/g, "").trim(), 10) : spacingMm;
      const curDemand = (g.totalMm / curSpacing).toFixed(2);
      const curRodCount = Math.ceil(g.totalMm / curSpacing) || 1;
      const rodLen = g.heightMm <= 2440 ? 2700 : (g.heightMm <= 2740 ? 3000 : 3600);

      return {
        id: stableId,
        baseType: g.baseType,
        theWallAbove: g.theWallAbove,
        height: `${g.heightMm} mm`,
        length: `${Math.round(g.totalMm)} mm`,
        spacing: `${curSpacing} mm`,
        rodSize: curRodSize,
        rodDemand: curDemand,
        rodMapping: `${curRodCount} x ${curRodSize} Rod ${rodLen}`,
        rodsQty: `${curRodCount} pcs`,
        floorLevel: g.floorLevel || "GF",
        sourcePageIndex: g.sourcePageIndex,
        wallClass: g.wallClass,
        isCanvasWall: true,
        wallIds: g.wallIds
      };
    });

    const manualEntries = (entries || []).filter(e => e.isManual || (e.id && String(e.id).startsWith("manual-")));
    const merged = [...newCanvasEntries, ...manualEntries];

    const serializeKey = (list) => (list || []).map(e => `${e.id}_${e.sourcePageIndex ?? ""}_${e.length}_${e.height}_${e.baseType}_${e.wallClass}_${e.floorLevel}_${e.rodSize}_${e.spacing}`).join("|");
    if (serializeKey(merged) !== serializeKey(entries)) {
      if (onSetEntries) {
        onSetEntries(merged);
      }
    }
  }, [aiCanvasWallsGrouped]);

  // ── Phân nhóm Level và chỉ tính External + Internal Load Bearing Wall ──
  const levelGrouped = useMemo(() => {
    return calculateEnteredWallsByLevel({
      entries: entries || [],
      wallsByPage,
      pages,
      scalesByPage,
      realScale
    });
  }, [entries, wallsByPage, pages, scalesByPage, realScale]);

  // ── Danh sách tường chỉ gồm External Wall & Internal Load Bearing Wall (chuẩn phẳng như Hình 3) ──
  const qualifiedWalls = useMemo(() => {
    return (entries || []).filter(w => {
      const cls = w.wallClass || w.wall_class || w.class_name;
      if (!cls) return true;
      const c = String(cls).toLowerCase().trim();
      return c === "exterior_wall" || c === "interior_wall";
    }).map((entry) => {
      const explicitPageIndex = Number(entry.sourcePageIndex ?? entry.source_page_index ?? entry.__sourcePageIndex);
      const linkedWallIds = entry.wallIds?.length ? entry.wallIds : (entry.wallId ? [entry.wallId] : []);
      const resolvedPageSets = linkedWallIds
        .map((wallId) => wallPageById.get(String(wallId)))
        .filter((pageSet) => pageSet?.size === 1);
      const resolvedPages = Array.from(new Set(resolvedPageSets.map((pageSet) => Array.from(pageSet)[0])));
      const sourcePageIndex = Number.isFinite(explicitPageIndex)
        ? explicitPageIndex
        : (resolvedPages.length === 1 ? resolvedPages[0] : null);
      if (!Number.isFinite(sourcePageIndex)) return entry;
      const sourceFloorLevel = floorLevelByPage.get(sourcePageIndex);
      if (!sourceFloorLevel) return entry;
      return {
        ...entry,
        floorLevel: sourceFloorLevel,
        __sourcePageIndex: sourcePageIndex,
      };
    });
  }, [entries, wallPageById, floorLevelByPage]);

  // Level sort order + display name + grouping now live in
  // "@/utils/floorLevelDisplay" and are shared by every Entered-items task
  // table (see that file for why). Do not re-add local copies here.
  const groupedWallsByLevel = useMemo(() => {
    const grouped = groupByFloorLevel(
      qualifiedWalls || [],
      (w) => normalizeFloorLevelCode(w.floorLevel || w.floor_level || "GF")
    );
    return grouped.map(({ level, items }) => ({ level, walls: items }));
  }, [qualifiedWalls]);

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

  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const editRowDataRef = useRef(editRowData);
  editRowDataRef.current = editRowData;
  const editingRowIdRef = useRef(editingRowId);
  editingRowIdRef.current = editingRowId;

  const handleStartEdit = (w) => {
    setEditingRowId(w.id);
    setEditRowData({
      height: w.height ? String(w.height).replace("mm", "").trim() : "2700",
      length: w.length ? String(w.length).replace("mm", "").trim() : "",
      spacing: w.spacing ? String(w.spacing).replace("mm", "").trim() : "900",
      rodSize: w.rodSize || "M12",
      floorLevel: w.floorLevel || w.floor_level || "GF",
      wallClass: w.wallClass || w.wall_class || "exterior_wall"
    });
  };

  const handleSaveInlineEdit = (idToSave) => {
    const targetId = idToSave || editingRowIdRef.current;
    if (!targetId || !onSetEntries) return;
    const currentData = editRowDataRef.current;
    const lenVal = parseFloat(currentData.length) || 0;
    const spacingVal = parseFloat(currentData.spacing) || 900;
    const hVal = parseFloat(currentData.height) || 2700;
    const demand = (lenVal / spacingVal).toFixed(2);
    const rodCount = Math.ceil(lenVal / spacingVal) || 1;
    const rodLen = hVal <= 2440 ? 2700 : (hVal <= 2740 ? 3000 : 3600);

    const updatedList = (entries || []).map(item => item.id === targetId ? {
      ...item,
      ...currentData,
      height: currentData.height ? (String(currentData.height).includes("mm") ? currentData.height : `${currentData.height} mm`) : item.height,
      length: currentData.length ? (String(currentData.length).includes("mm") ? currentData.length : `${currentData.length} mm`) : item.length,
      spacing: currentData.spacing ? (String(currentData.spacing).includes("mm") ? currentData.spacing : `${currentData.spacing} mm`) : item.spacing,
      floorLevel: currentData.floorLevel || item.floorLevel || "GF",
      wallClass: currentData.wallClass || item.wallClass || "exterior_wall",
      rodDemand: demand,
      rodsQty: `${rodCount} pcs`,
      rodMapping: `${rodCount} x ${currentData.rodSize || item.rodSize || "M12"} Rod ${rodLen}`
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
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

  const WALL_HEIGHT_OPTIONS = ["Select...", ...FRAME_WALL_HEIGHTS.map(String)];

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
      id: "manual-slab-" + Date.now(),
      isManual: true,
      baseType: "Concrete Slab",
      theWallAbove: "ON CONCRETE SLAB FLOOR",
      height: `${hMm} mm`,
      length: `${lenMm} mm`,
      spacing: `${spacingMm} mm`,
      rodSize: slabRodSize,
      rodDemand: demand,
      rodMapping: `${rodCount} x ${slabRodSize} Rod ${rodLength}`,
      rodsQty: `${rodCount} pcs`,
      floorLevel: slabFloorLevel || "GF",
      wallClass: slabWallClass || "exterior_wall"
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
      id: "manual-tmb-" + Date.now(),
      isManual: true,
      baseType: "Timber Floor",
      theWallAbove: "ON TIMBER FLOOR",
      height: `${hMm} mm`,
      length: `${lenMm} mm`,
      spacing: `${spacingMm} mm`,
      rodSize: timberRodSize,
      rodDemand: demand,
      rodMapping: `${rodCount} x ${timberRodSize} Rod ${rodLength}`,
      rodsQty: `${rodCount} pcs`,
      floorLevel: timberFloorLevel || "GF",
      wallClass: timberWallClass || "exterior_wall"
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
      generatedEntries = aiCanvasWallsGrouped.map((g) => {
        const isSlab = g.floorType === "Slab";
        const spacingMm = 900;
        const demand = (g.totalMm / spacingMm).toFixed(2);
        const rodCount = Math.ceil(g.totalMm / spacingMm) || 1;
        const rodLength = g.heightMm <= 2440 ? 2700 : (g.heightMm <= 2740 ? 3000 : 3600);
        return {
          id: `canvas-page-${g.sourcePageIndex}-${g.floorLevel}-${g.floorType}-${g.wallClass}-${g.heightMm}`,
          baseType: g.baseType,
          theWallAbove: g.theWallAbove,
          height: `${g.heightMm} mm`,
          length: `${Math.round(g.totalMm)} mm`,
          spacing: `${spacingMm} mm`,
          rodSize: "M12",
          rodDemand: demand,
          rodMapping: `${rodCount} x M12 Rod ${rodLength}`,
          rodsQty: `${rodCount} pcs`,
          floorLevel: g.floorLevel || "GF",
          sourcePageIndex: g.sourcePageIndex,
          wallClass: g.wallClass,
          isCanvasWall: true,
          wallIds: g.wallIds
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
          rodsQty: `${Math.ceil(timberMm / 900)} pcs`,
          floorLevel: "GF",
          wallClass: "exterior_wall"
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
          rodsQty: `${Math.ceil(slabMm / 900)} pcs`,
          floorLevel: "GF",
          wallClass: "exterior_wall"
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
      const wallsList = (qualifiedWalls || []).map(w => {
        const rawAbove = w.theWallAbove || "";
        const isTimber = rawAbove.toUpperCase().includes("TIMBER") || w.baseType === "Timber Floor" || w.baseType === "Timber";
        const floorType = isTimber ? "Timber" : "Slab";
        const heightMm = parseInt(String(w.height || "2700").replace(/mm/gi, "").trim(), 10) || 2700;
        const lengthMm = parseInt(String(w.length || "0").replace(/mm/gi, "").trim(), 10) || 0;
        const spacingMm = parseInt(String(w.spacing || "900").replace(/mm/gi, "").trim(), 10) || 900;
        const rodSize = w.rodSize || "M12";
        const floorLevel = (w.floorLevel || w.floor_level || "GF").trim().toUpperCase();

        return {
          floor_type: floorType,
          wall_height: heightMm,
          wall_length: lengthMm,
          spacing: spacingMm,
          rod_size: rodSize,
          short_name: getActiveClientShortName(),
          floor_level: floorLevel
        };
      });

      const jobId = currentProjectName || activeJobNumber || (typeof window !== "undefined" ? (localStorage.getItem("currentJobId") || localStorage.getItem("current_hw_id")) : "");
      if (!jobId) {
        console.warn("Chưa chọn Job để lưu FrameWork");
      }

      const payload = {
        user_update: currentUserUpdate,
        jobs: [{
          id_job_hw: jobId || "default",
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

  const renderWallRow = (w, rowIdx) => {
    const effWall = selectedWallProp || selectedWall;
    const effWallIds = selectedWallIdsProp || selectedWallIds || [];
    const effId = selectedIdProp || selectedId;
    const effType = selectedTypeProp || selectedType;
    const effHovered = hoveredWallId;

    const matchId = (id1, id2) => id1 !== undefined && id1 !== null && id2 !== undefined && id2 !== null && String(id1) === String(id2);
    const hasMatch = (targetId) => {
      if (!targetId) return false;
      if (matchId(w.wallId, targetId) || matchId(w.id, targetId)) return true;
      if (Array.isArray(w.wallIds) && w.wallIds.some(id => matchId(id, targetId))) return true;
      return false;
    };

    const isSelected = selectedEntryId === w.id ||
      (effWall && hasMatch(effWall.id)) ||
      (effWallIds.length > 0 && effWallIds.some(id => hasMatch(id))) ||
      (effType === "wall" && hasMatch(effId));
    const isHovered = effHovered && hasMatch(effHovered);
    const isRowEditing = editingRowId === w.id;
    const rawAbove = w.theWallAbove || "";
    const isTimber = rawAbove.toUpperCase().includes("TIMBER") || w.baseType === "Timber Floor" || w.baseType === "Timber";
    const wallAboveLabel = isTimber ? "Timber" : "Slab";
    const rodSizeVal = w.rodSize || (isTimber ? (formData.timber_rod_size || "M12") : (formData.slab_rod_size || "M12"));
    const flVal = (w.floorLevel || w.floor_level || "GF").toUpperCase();
    const isLower = flVal === "GF" || flVal === "LEVEL 1" || flVal === "GROUND FLOOR" || flVal === "GROUND";
    const wallCls = w.wallClass || w.wall_class || "exterior_wall";
    const isExternal = wallCls === "exterior_wall";

    const handleSelectWallRow = (targetWall) => {
      const isCurrentlySelected = selectedEntryId === targetWall.id;
      const nextSelected = isCurrentlySelected ? null : targetWall;
      setSelectedEntryId(nextSelected ? targetWall.id : null);

      if (nextSelected) {
        let targetPageIndex = -1;
        if (Array.isArray(targetWall.wallIds) && targetWall.wallIds.length > 0) {
          for (const [pIdxStr, pWalls] of Object.entries(wallsByPage || {})) {
            if (Array.isArray(pWalls) && pWalls.some(pw => targetWall.wallIds.includes(pw.id))) {
              targetPageIndex = Number(pIdxStr);
              break;
            }
          }
        }

        if (targetPageIndex < 0 && pages && pages.length > 0) {
          const fl = (targetWall.floorLevel || targetWall.floor_level || "GF").toUpperCase().trim();
          targetPageIndex = pages.findIndex((p, idx) => {
            const pName = (p.floor_name || p.name || "").toUpperCase().trim();
            if (fl === "GF" && (pName === "GF" || pName.includes("GROUND") || pName === "LEVEL 1" || pName.includes("TRỆT") || idx === 0)) return true;
            if (fl === "FF" && (pName === "FF" || pName.includes("FIRST") || pName === "LEVEL 2" || pName.includes("TẦNG 1") || pName.includes("1F") || idx === 1)) return true;
            if (fl === "SF" && (pName === "SF" || pName.includes("SECOND") || pName === "LEVEL 3" || pName.includes("TẦNG 2") || pName.includes("2F") || idx === 2)) return true;
            if (fl === "TF" && (pName === "TF" || pName.includes("THIRD") || pName === "LEVEL 4" || pName.includes("TẦNG 3") || pName.includes("3F") || idx === 3)) return true;
            if (pName.includes(fl)) return true;
            return false;
          });
          if (targetPageIndex < 0) {
            if (fl === "GF") targetPageIndex = 0;
            else if (fl === "FF" && pages.length > 1) targetPageIndex = 1;
            else if (fl === "SF" && pages.length > 2) targetPageIndex = 2;
            else if (fl === "TF" && pages.length > 3) targetPageIndex = 3;
          }
        }

        if (targetPageIndex >= 0) {
          if (typeof goPage === "function") goPage(targetPageIndex);
          else if (typeof setCurrentPage === "function") setCurrentPage(targetPageIndex);
        }
      }

      if (onSelectEntry) {
        onSelectEntry(nextSelected);
      }
    };

    return (
      <tr
        key={w.id || rowIdx}
        data-editing-row-id={isRowEditing ? w.id : undefined}
        onDoubleClick={(e) => {
          if (isRowEditing) return;
          if (e.target.closest && e.target.closest("button")) return;
          if (editingRowId && editingRowId !== w.id) {
            handleSaveInlineEdit(editingRowId);
          }
          handleSelectWallRow(w);
          handleStartEdit(w);
        }}
        onClick={() => {
          if (!isRowEditing) {
            if (editingRowId && editingRowId !== w.id) {
              handleSaveInlineEdit(editingRowId);
            }
            handleSelectWallRow(w);
          }
        }}
        style={{
          borderBottom: "1px solid #e2e8f0",
          background: isRowEditing ? "#fef3c7" : (isSelected ? "#dbeafe" : (isHovered ? "#f1f5f9" : (rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc"))),
          cursor: isRowEditing ? "default" : "pointer",
          outline: isSelected ? "2px solid #3b82f6" : "none",
          outlineOffset: "-1px",
          transition: "background 0.15s ease"
        }}
      >
        <td style={{ padding: "6px 8px", fontWeight: 700, width: "24px" }}>{rowIdx + 1}</td>

        {/* The Wall Above */}
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

        {/* Wall Type */}
        <td style={{ padding: "6px 8px" }}>
          {isRowEditing ? (
            <select
              value={editRowData.wallClass || "exterior_wall"}
              onChange={(e) => setEditRowData({ ...editRowData, wallClass: e.target.value })}
              style={{ padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
            >
              {WALL_CLASS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <span style={{
              background: isExternal ? "#ecfdf5" : "#f5f3ff",
              color: isExternal ? "#047857" : "#6d28d9",
              padding: "2px 6px",
              borderRadius: "4px",
              fontWeight: 700,
              fontSize: "9.5px",
              whiteSpace: "nowrap"
            }}>
              {isExternal ? "External" : "Load Bearing Wall"}
            </span>
          )}
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

        {/* Tiedown Spacing */}
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

        {/* Actions */}
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
                  handleStartEdit(w);
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
  };

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
          <span>1. Wall information</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection1Open ? "▲" : "▼"}
          </span>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "12px" }}>

            {/* SECTION: ON CONCRETE SLAB FLOOR */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
              <div
                onClick={() => setIsSlabOpen(!isSlabOpen)}
                style={{
                  padding: "7px 10px",
                  background: "#f1f5f9",
                  borderBottom: isSlabOpen ? "1px solid #e2e8f0" : "none",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "#334155",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  userSelect: "none"
                }}
              >
                <span>ON CONCRETE SLAB FLOOR</span>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                  {isSlabOpen ? "▲" : "▼"}
                </span>
              </div>
              {isSlabOpen && (
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

                  {/* Tiedown Spacing */}
                  <div style={{ flex: "1 1 100px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Tiedown Spacing</span>
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
                  <div style={{ flex: "1 1 90px" }}>
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

                  {/* Floor Level */}
                  <div style={{ flex: "1 1 110px" }}>
                    <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Floor Level</span>
                    <select
                      value={slabFloorLevel}
                      onChange={(e) => setSlabFloorLevel(e.target.value)}
                      className="task-field-select"
                      style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                    >
                      {LEVEL_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Wall Type */}
                  <div style={{ flex: "1.2 1 130px" }}>
                    <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Wall Type</span>
                    <select
                      value={slabWallClass}
                      onChange={(e) => setSlabWallClass(e.target.value)}
                      className="task-field-select"
                      style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                    >
                      {WALL_CLASS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
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
              )}
            </div>

            {/* SECTION: ON TIMBER FLOOR */}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
              <div
                onClick={() => setIsTimberOpen(!isTimberOpen)}
                style={{
                  padding: "7px 10px",
                  background: "#f1f5f9",
                  borderBottom: isTimberOpen ? "1px solid #e2e8f0" : "none",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "#334155",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  userSelect: "none"
                }}
              >
                <span>ON TIMBER FLOOR</span>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                  {isTimberOpen ? "▲" : "▼"}
                </span>
              </div>
              {isTimberOpen && (
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

                  {/* Tiedown Spacing */}
                  <div style={{ flex: "1 1 100px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Tiedown Spacing</span>
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
                  <div style={{ flex: "1 1 90px" }}>
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

                  {/* Floor Level */}
                  <div style={{ flex: "1 1 110px" }}>
                    <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Floor Level</span>
                    <select
                      value={timberFloorLevel}
                      onChange={(e) => setTimberFloorLevel(e.target.value)}
                      className="task-field-select"
                      style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                    >
                      {LEVEL_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Wall Type */}
                  <div style={{ flex: "1.2 1 130px" }}>
                    <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Wall Type</span>
                    <select
                      value={timberWallClass}
                      onChange={(e) => setTimberWallClass(e.target.value)}
                      className="task-field-select"
                      style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                    >
                      {WALL_CLASS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
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
              )}
            </div>

          </div>
        )}
      </div>

      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsExtrasOpen((v) => !v)}
          style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: isExtrasOpen ? "1px solid #e2e8f0" : "none", fontWeight: 800, fontSize: "12px", color: "#0f2744", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
        >
          <span>2. Additional hardware - enter only when required</span>
          <span style={{ fontSize: "11px", color: "#64748b" }}>{isExtrasOpen ? "▲" : "▼"}</span>
        </div>
        {isExtrasOpen && (
          <div style={{ padding: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "8px" }}>
            {FRAME_HARDWARE_EXTRA_FIELDS.map(([key, label]) => {
              const extras = parseFrameExtras(formData?.frame_hardware_extras);
              return <label key={key} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700 }}>{label}</span>
                <input
                  inputMode="decimal"
                  value={extras[key] ?? "0"}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    if (!/^\d*(?:[.,]\d*)?$/.test(e.target.value)) return;
                    const next = { ...extras, [key]: e.target.value };
                    if (onChange) onChange("frame_hardware", "frame_hardware_extras", JSON.stringify(next));
                  }}
                  style={{ height: "29px", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "4px 6px", fontSize: "10.5px", boxSizing: "border-box" }}
                />
              </label>;
            })}
          </div>
        )}
      </div>


      {/* ── CARD 3: ENTERED WALLS (GROUPED BY LEVEL: GF vs FF+) ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsSection2Open((v) => !v)}
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
            gap: "6px",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <span>3. Entered walls ({qualifiedWalls.length})</span>
          <EnteredTaskActions
            onAutoFill={() => onAddDataAI?.("frame_hardware")}
            onClear={onClearData}
            isOpen={isSection2Open}
            onToggle={() => setIsSection2Open((v) => !v)}
          
            onSave={handleSaveToDatabase}
            saveDisabled={isSaving}
            saveStatus={isSaving ? "saving" : saveSuccess ? "success" : "idle"}
          />
        </div>

        {isSection2Open && (
          <>
            <div style={{ padding: "8px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
                <thead>
                  <tr style={{ background: "#1e3a5f", color: "#ffffff", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px", width: "24px" }}>#</th>
                    <th style={{ padding: "6px 8px" }}>The Wall Above</th>
                    <th style={{ padding: "6px 8px" }}>Wall Type</th>
                    <th style={{ padding: "6px 8px" }}>Wall Height</th>
                    <th style={{ padding: "6px 8px" }}>Wall Length</th>
                    <th style={{ padding: "6px 8px" }}>Tiedown Spacing</th>
                    <th style={{ padding: "6px 8px" }}>Rod size</th>
                    <th style={{ padding: "6px 8px", textAlign: "right", width: "45px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedWallsByLevel.map(({ level, walls }) => (
                    <React.Fragment key={level}>
                      <FloorLevelGroupRow level={level} colSpan={8} count={walls.length} unitLabel="wall" />
                      {walls.map((w) => {
                        const globalIdx = qualifiedWalls.findIndex(qw => qw.id === w.id);
                        return renderWallRow(w, globalIdx >= 0 ? globalIdx : 0);
                      })}
                    </React.Fragment>
                  ))}
                  {qualifiedWalls.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>
                        No walls entered. Enter wall specifications above or click Auto Fill (AI).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── ACTION BUTTONS: SAVE & COUNT (MATCHING IMAGE 3) ── */}
            {qualifiedWalls.length > 0 && (
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
                  {qualifiedWalls.length} {qualifiedWalls.length === 1 ? "wall" : "walls"} entered
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
