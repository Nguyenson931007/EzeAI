import React, { useState, useRef, useEffect, useMemo } from "react";
import useCurrentTaskFloorLevel from "./useCurrentTaskFloorLevel";
import { ApiService } from "@/models/api.service";
import { FRAME_WALL_HEIGHTS, FRAME_HARDWARE_EXTRA_FIELDS, BUN_VIC_FRAME_HARDWARE_EXTRA_FIELDS, isBunVicCustomer } from "@/constants/procurementFormParity";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { getWallClass } from "@/utils/geometry";
import { normalizeFloorLevelCode, resolveObjectFloorLevel } from "@/utils/floorLevel";
import { buildArchitecturalFloorLevelMap, getArchitecturalPageIndices, normalizeFloorLevel, shouldApplyDatabaseTaskLoad } from "@/utils/procurementAutoFill";
import { calculateEnteredWallsByLevel } from "@/engines/TakeoffSummaryEngine";
import { groupByFloorLevel } from "@/utils/floorLevelDisplay";
import FloorLevelGroupRow from "./FloorLevelGroupRow";
import { resolveDropdownValue } from "@/utils/dropdownValueGuard";
import {
  EnteredDataCard,
  TaskCard,
  TaskEmptyRow,
  TaskFieldGrid,
  TaskRowNumber,
  TaskSectionHeader,
  TaskSummaryFooter,
  TaskSummaryTable,
} from "./TaskUi";

const parseFrameExtras = (value) => {
  try {
    if (value && typeof value === "object") return value;
    return value ? JSON.parse(value) : {};
  } catch { return {}; }
};

const parseFrameNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", ".").replace(/[^\d.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const activeCustomerShortName = getActiveClientShortName();
  const isBunVic = isBunVicCustomer(activeCustomerShortName);
  const frameExtraFields = isBunVic ? BUN_VIC_FRAME_HARDWARE_EXTRA_FIELDS : FRAME_HARDWARE_EXTRA_FIELDS;
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
  // ── Auto-load from DB: read-only / edit mode ──
  const [dataSource, setDataSource] = useState(null);       // "db" | "local" | null
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(false);
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(null);
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isSlabOpen, setIsSlabOpen] = useState(false);
  const [isTimberOpen, setIsTimberOpen] = useState(false);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const [isExtrasOpen, setIsExtrasOpen] = useState(false);

  // Slab Floor State
  const [slabWallHeight, setSlabWallHeight] = useState("Select...");
  const [slabWallLength, setSlabWallLength] = useState("");
  const [slabSpacing, setSlabSpacing] = useState("900");
  const [slabInputError, setSlabInputError] = useState("");
  const [slabRodSize, setSlabRodSize] = useState("M12");
  const currentFloorLevel = useCurrentTaskFloorLevel(formData);
  const [slabWallClass, setSlabWallClass] = useState("exterior_wall");

  // Timber Floor State
  const [timberWallHeight, setTimberWallHeight] = useState("Select...");
  const [timberWallLength, setTimberWallLength] = useState("");
  const [timberSpacing, setTimberSpacing] = useState("900");
  const [timberRodSize, setTimberRodSize] = useState("M12");

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
      const pageFloorLevel = _getFloorLevelByPage(pIdx);

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
        // Current BUN-VIC ProcurementApp Frame Hardware is slab-only.
        // Keep NSW/QLD behaviour unchanged.
        const isSlab = isBunVic || rawFloor.includes("slab") || rawFloor.includes("concrete");
        const floorType = isSlab ? "Slab" : "Timber";
        const hMm = Number(w.height_mm || w.height || 2400);
        const wallClass = qInfo.wallClass;

        // Prefer level metadata carried by a generated wall (for example
        // sourceLevelCode from the Floor & Ceiling engine).  Otherwise use the
        // architectural page -> level map that also drives the left GF/FF rail.
        const floorLevel = resolveObjectFloorLevel(w, pages, pIdx) || pageFloorLevel;
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
  }, [pages, wallsByPage, scalesByPage, realScale, architecturalPageIndices, floorLevelByPage, isBunVic]);

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
        wallIds: g.wallIds,
        // Preserve AI provenance whenever canvas-derived rows are rebuilt.
        // This effect runs again when switching tasks / restoring cache; without
        // these markers the shared TaskRowNumber loses the AI badge.
        ai_generated: existing?.ai_generated ?? true,
        generatedByAI: existing?.generatedByAI ?? true,
        autofill_source: existing?.autofill_source || "drawing",
        source: existing?.source || "frame_hardware_ai"
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
      if (isBunVic) {
        const rawAbove = String(w.theWallAbove || w.baseType || "").toUpperCase();
        if (rawAbove.includes("TIMBER")) return false;
      }
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
  }, [entries, wallPageById, floorLevelByPage, isBunVic]);

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
    setIsReadOnly(false);
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
    const enteredLength = parseFrameNumber(slabWallLength);
    const enteredSpacing = parseFrameNumber(slabSpacing);
    if (isBunVic && (enteredLength <= 0 || enteredSpacing <= 0)) {
      setSlabInputError("Enter Wall Length and Spacing greater than 0.");
      return;
    }

    const lenMm = enteredLength || (cadMetrics.grandTotalLength ? Math.round(cadMetrics.grandTotalLength * 1000) : 18500);
    const hMm = slabWallHeight !== "Select..." ? parseInt(slabWallHeight, 10) : 2440;
    const spacingMm = enteredSpacing || 900;
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
      floorLevel: currentFloorLevel || "GF",
      wallClass: slabWallClass || "exterior_wall"
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setSlabInputError("");
    setSlabWallLength("");
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  };

  // Manual "Add data" button: re-check DB for framework data
  const handleAddDataFromDb = async () => {
    if (!resolvedJobKey || resolvedJobKey.toLowerCase() === "default" || resolvedJobKey.toLowerCase() === "testai") return;
    setIsLoadingFromDb(true);
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Framework DB load timeout")), 10000)
      );
      const res = await Promise.race([
        ApiService.fetchFrameworkJobs(),
        timeoutPromise
      ]);
      if (res && res.success && res.data && Array.isArray(res.data) && res.data.length > 0) {
        const target = resolvedJobKey.toLowerCase();
        const matchedRows = res.data.filter(j => {
          const jn = String(j.job_number || "").trim().toLowerCase();
          const hw = String(j.IDJob_HW || j.hw_id || "").trim().toLowerCase();
          return (jn && jn === target) || (hw && hw === target);
        });
        if (matchedRows.length > 0) {
          setDataSource("db");
          setIsReadOnly(true);
        } else {
          setDataSource(null);
          setIsReadOnly(false);
        }
      }
    } catch (err) {
      console.warn("Add Framework data from DB failed:", err);
      setDataSource(null);
      setIsReadOnly(false);
    } finally {
      setIsLoadingFromDb(false);
    }
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
      floorLevel: currentFloorLevel || "GF",
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
          rodSize: resolveDropdownValue("M12", ROD_SIZE_OPTIONS, { fallback: "" }),
          rodDemand: demand,
          rodMapping: `${rodCount} x M12 Rod ${rodLength}`,
          rodsQty: `${rodCount} pcs`,
          floorLevel: resolveDropdownValue(g.floorLevel || "GF", LEVEL_OPTIONS, { getValue: (option) => option.value, fallback: "" }),
          sourcePageIndex: g.sourcePageIndex,
          wallClass: resolveDropdownValue(g.wallClass, WALL_CLASS_OPTIONS, { getValue: (option) => option.value, fallback: "" }),
          isCanvasWall: true,
          wallIds: g.wallIds,
          ai_generated: true,
          generatedByAI: true,
          autofill_source: "drawing",
          source: "frame_hardware_ai"
        };
      });
    } else {
      // No verified drawing rows -> do not invent Frame Hardware rows.
      generatedEntries = [];
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

  // ── Auto-load saved data from DB when job changes ──
  const resolvedJobKey = String(activeJobNumber || currentProjectName || currentJobId || "").trim();
  useEffect(() => {
    if (!resolvedJobKey || resolvedJobKey.toLowerCase() === "default" || resolvedJobKey.toLowerCase() === "testai") return;
    if (autoLoadAttempted === resolvedJobKey) return;
    setAutoLoadAttempted(resolvedJobKey);

    let cancelled = false;
    const autoLoad = async () => {
      setIsLoadingFromDb(true);
      try {
        // Timeout after 10s to prevent stuck Loading... if backend hangs
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Framework DB load timeout")), 10000)
        );
        const res = await Promise.race([
          ApiService.fetchFrameworkJobs(),
          timeoutPromise
        ]);
        if (cancelled) return;
        if (!shouldApplyDatabaseTaskLoad()) return;
        if (res && res.success && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const target = resolvedJobKey.toLowerCase();
          const matchedRows = res.data.filter(j => {
            const jn = String(j.job_number || "").trim().toLowerCase();
            const hw = String(j.IDJob_HW || j.hw_id || "").trim().toLowerCase();
            return (jn && jn === target) || (hw && hw === target);
          });
          if (matchedRows.length > 0) {
            setDataSource("db");
            setIsReadOnly(true);
          } else {
            setDataSource(null);
            setIsReadOnly(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Auto-load Framework data from DB skipped:", err);
          setDataSource(null);
          setIsReadOnly(false);
        }
      } finally {
        if (!cancelled) setIsLoadingFromDb(false);
      }
    };
    autoLoad();
    return () => { cancelled = true; };
  }, [resolvedJobKey]);

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
        const heightMm = parseFrameNumber(w.height, 2700);
        const lengthMm = parseFrameNumber(w.length);
        const spacingMm = parseFrameNumber(w.spacing, 900);
        const rodSize = w.rodSize || "M12";
        const floorLevel = (w.floorLevel || w.floor_level || "GF").trim().toUpperCase();

        return {
          floor_type: floorType,
          wall_height: heightMm,
          wall_length: lengthMm,
          spacing: spacingMm,
          rod_size: rodSize,
          short_name: activeCustomerShortName,
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
          ...(isBunVic ? {
            // Procurement keeps this workbook-only value outside its slab-wall
            // shape. The EzeFloor API stores it as a non-wall metadata row in
            // the existing FrameWork version so no new table is needed.
            upper_floors: parseFrameNumber(parseFrameExtras(formData?.frame_hardware_extras).upperFloors),
          } : {}),
          walls: wallsList
        }]
      };

      const res = await ApiService.saveFrameworkJobs(payload);
      if (res.success) {
        setSaveSuccess(true);
        setDataSource("db");
        setIsReadOnly(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Lỗi khi lưu FrameWork từ Task Panel:", err);
      alert("Failed to save FrameWork data: " + (err.message || err));
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
    const rawAbove = w.theWallAbove || "";
    const isTimber = rawAbove.toUpperCase().includes("TIMBER") || w.baseType === "Timber Floor" || w.baseType === "Timber";
    const wallAboveLabel = isTimber ? "Timber" : "Slab";
    const rodSizeVal = w.rodSize || (isTimber ? (formData.timber_rod_size || "M12") : (formData.slab_rod_size || "M12"));
    const wallCls = w.wallClass || w.wall_class || "exterior_wall";
    const isExternal = wallCls === "exterior_wall";

    const handleSelectWallRow = (targetWall) => {
      const nextSelected = targetWall;
      setSelectedEntryId(targetWall.id);

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
          const fl = normalizeFloorLevelCode(targetWall.floorLevel || targetWall.floor_level || "GF");
          const preferredIndex = fl === "GF" ? 0 : fl === "FF" ? 1 : fl === "SF" ? 2 : fl === "TF" ? 3 : Number.parseInt(fl, 10);
          if (Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < pages.length) {
            targetPageIndex = preferredIndex;
          }
        }

        if (targetPageIndex >= 0 && Number(targetPageIndex) !== Number(currentPage)) {
          if (typeof goPage === "function") goPage(targetPageIndex);
          else if (typeof setCurrentPage === "function") setCurrentPage(targetPageIndex);
        }
      }

      onSelectEntry?.(nextSelected);
    };

    const isRowEditing = editingRowId === w.id;
    const controlStyle = {
      width: "100%",
      minWidth: 0,
      height: "27px",
      boxSizing: "border-box",
      border: "1px solid #93c5fd",
      borderRadius: "4px",
      background: "#fff",
      color: "#0f172a",
      fontSize: "10.5px",
      padding: "2px 5px"
    };

    return (
      <tr
        key={w.id || rowIdx}
        data-editing-row-id={isRowEditing ? w.id : undefined}
        onClick={(event) => {
          if (event.target.closest("button, input, select, textarea, a, [data-search-dropdown]")) return;
          handleSelectWallRow(w);
        }}
        onDoubleClick={(event) => {
          if (event.target.closest("button, input, select, textarea, a, [data-search-dropdown]")) return;
          event.preventDefault();
          event.stopPropagation();
          if (editingRowId && editingRowId !== w.id) handleSaveInlineEdit(editingRowId);
          setSelectedEntryId(w.id);
          onSelectEntry?.(w);
          handleStartEdit(w);
        }}
        onKeyDown={(event) => {
          if (!isRowEditing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            handleSaveInlineEdit(w.id);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setEditingRowId(null);
          }
        }}
        style={{
          background: isSelected ? "#dbeafe" : (isHovered ? "#f1f5f9" : undefined),
          cursor: "pointer",
          outline: isSelected ? "2px solid #3b82f6" : "none",
          outlineOffset: "-1px",
          transition: "background 0.15s ease"
        }}
        title="Click to select · Double-click to edit"
      >
        <td style={{ fontWeight: 700, width: "24px" }}><TaskRowNumber index={rowIdx} row={w} /></td>
        {isBunVic ? (
          <>
            <td>
              {isRowEditing ? (
                <input inputMode="decimal" value={editRowData.length || ""} onChange={(event) => setEditRowData((prev) => ({ ...prev, length: event.target.value }))} style={controlStyle} />
              ) : (w.length || "—")}
            </td>
            <td>
              {isRowEditing ? (
                <input inputMode="decimal" value={editRowData.spacing || "900"} onChange={(event) => setEditRowData((prev) => ({ ...prev, spacing: event.target.value }))} style={controlStyle} />
              ) : (w.spacing || "—")}
            </td>
            <td style={{ fontWeight: 700 }}>
              {(() => {
                const length = parseFrameNumber(w.length);
                const spacing = parseFrameNumber(w.spacing, 900);
                const tiedowns = spacing > 0 ? length / spacing : 0;
                return tiedowns > 0 ? Number(tiedowns.toFixed(2)).toString() : "0";
              })()}
            </td>
            <td style={{ fontWeight: 700 }}>
              {normalizeFloorLevelCode(w.floorLevel || w.floor_level || currentFloorLevel || "GF") || "GF"}
            </td>
          </>
        ) : (
          <>
        <td>
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
        <td>
          {isRowEditing ? (
            <select
              value={editRowData.wallClass || "exterior_wall"}
              onChange={(event) => setEditRowData((prev) => ({ ...prev, wallClass: event.target.value }))}
              style={controlStyle}
            >
              {WALL_CLASS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
        <td>
          {isRowEditing ? (
            <select
              value={String(editRowData.height || "2700").replace(/mm/gi, "").trim()}
              onChange={(event) => setEditRowData((prev) => ({ ...prev, height: event.target.value }))}
              style={controlStyle}
            >
              {WALL_HEIGHT_OPTIONS.filter((value) => value !== "Select...").map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          ) : (w.height || "—")}
        </td>
        <td>
          {isRowEditing ? (
            <input
              inputMode="decimal"
              value={editRowData.length || ""}
              onChange={(event) => setEditRowData((prev) => ({ ...prev, length: event.target.value }))}
              style={controlStyle}
            />
          ) : (w.length || "—")}
        </td>
        <td>
          {isRowEditing ? (
            <input
              inputMode="decimal"
              value={editRowData.spacing || "900"}
              onChange={(event) => setEditRowData((prev) => ({ ...prev, spacing: event.target.value }))}
              style={controlStyle}
            />
          ) : (w.spacing || "—")}
        </td>
        <td>
          {isRowEditing ? (
            <select
              value={editRowData.rodSize || "M12"}
              onChange={(event) => setEditRowData((prev) => ({ ...prev, rodSize: event.target.value }))}
              style={controlStyle}
            >
              {ROD_SIZE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          ) : <strong style={{ color: "#1e3a5f" }}>{rodSizeVal || "—"}</strong>}
        </td>
          </>
        )}
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          {isRowEditing ? (
            <>
              <button type="button" onClick={(event) => { event.stopPropagation(); handleSaveInlineEdit(w.id); }} style={{ background: "none", border: 0, color: "#16a34a", cursor: "pointer", fontWeight: 900 }} title="Save row">✓</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); setEditingRowId(null); }} style={{ background: "none", border: 0, color: "#64748b", cursor: "pointer", fontWeight: 900 }} title="Cancel edit">✕</button>
            </>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleRemoveEntry(w.id);
              }}
              style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px", padding: "0 2px" }}
              title="Remove wall from entered data"
            >
              ✕
            </button>
          )}
        </td>
      </tr>
    );
  };

  if (isBunVic) {
    const vicExtras = parseFrameExtras(formData?.frame_hardware_extras);
    const updateVicExtra = (key, value) => {
      if (!/^\d*(?:[.,]\d*)?$/.test(value)) return;
      const next = { ...vicExtras, [key]: value };
      onChange?.("frame_hardware", "frame_hardware_extras", JSON.stringify(next));
    };
    const vicExtraFields = frameExtraFields.filter(([key]) => key !== "upperFloors");

    return (
      <div className="proc-task-content frame-hardware-vic-task">
        <TaskCard>
          <TaskSectionHeader title="1. Walls on slab & additional hardware" />
          <TaskFieldGrid columns={4} className="frame-hardware-vic-primary-fields">
              <label className="task-ui-field">
                <span className="task-ui-field-label">Wall Length <span className="task-field-unit">mm</span></span>
                <input
                  className="task-ui-control task-ui-input frame-hardware-vic-required"
                  type="text"
                  inputMode="decimal"
                  placeholder={cadMetrics.grandTotalLength ? `${Math.round(cadMetrics.grandTotalLength * 1000)}` : "Enter millimetres..."}
                  value={slabWallLength}
                  onChange={(e) => /^\d*(?:[.,]\d*)?$/.test(e.target.value) && setSlabWallLength(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddSlabWall()}
                />
              </label>
              <label className="task-ui-field">
                <span className="task-ui-field-label">Spacing <span className="task-field-unit">mm</span></span>
                <input
                  className="task-ui-control task-ui-input frame-hardware-vic-required"
                  type="text"
                  inputMode="decimal"
                  value={slabSpacing}
                  onChange={(e) => /^\d*(?:[.,]\d*)?$/.test(e.target.value) && setSlabSpacing(e.target.value)}
                  onBlur={() => parseFrameNumber(slabSpacing) <= 0 && setSlabSpacing("900")}
                  onKeyDown={(e) => e.key === "Enter" && handleAddSlabWall()}
                />
              </label>
              <label className="task-ui-field">
                <span className="task-ui-field-label">Upper Floor (number of timber floors)</span>
                <input
                  className="task-ui-control task-ui-input"
                  type="text"
                  inputMode="decimal"
                  value={vicExtras.upperFloors ?? "0"}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => updateVicExtra("upperFloors", e.target.value)}
                />
              </label>
              <button
                className="frame-hardware-vic-add"
                type="button"
                onClick={handleAddSlabWall}
              >
                + Add wall
              </button>
          </TaskFieldGrid>
          {slabInputError ? <div className="frame-hardware-vic-error">{slabInputError}</div> : null}

            <TaskFieldGrid columns={5} className="frame-hardware-vic-extra-fields">
              {vicExtraFields.map(([key, label]) => (
                <label className="task-ui-field" key={key}>
                  <span className="task-ui-field-label">{label}</span>
                  <input
                    className="task-ui-control task-ui-input"
                    type="text"
                    inputMode="decimal"
                    value={vicExtras[key] ?? "0"}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => updateVicExtra(key, e.target.value)}
                  />
                </label>
              ))}
            </TaskFieldGrid>
        </TaskCard>

        <EnteredDataCard
          title={`2. Entered walls (${qualifiedWalls.length})`}
          isOpen={isSection2Open}
          onToggle={() => setIsSection2Open((open) => !open)}
          onAutoFill={handleAutoFillAI}
          onAddData={handleAddDataFromDb}
          onClear={onClearData}
          onSave={handleSaveToDatabase}
          saveDisabled={isSaving || qualifiedWalls.length === 0}
          saveStatus={isSaving ? "saving" : saveSuccess ? "success" : "idle"}
          dataSource={dataSource}
          isReadOnly={isReadOnly}
          isLoadingFromDb={isLoadingFromDb}
          onEdit={() => setIsReadOnly(false)}
          footer={(
            <TaskSummaryFooter>
              {qualifiedWalls.length} slab wall{qualifiedWalls.length === 1 ? "" : "s"} ready to save to FrameWork
            </TaskSummaryFooter>
          )}
        >
          <TaskSummaryTable minWidth="720px" compact>
            <thead>
              <tr>
                <th style={{ width: "24px" }}>#</th>
                <th>Wall Length</th>
                <th>Spacing</th>
                <th>Tiedowns</th>
                <th>Floor Level</th>
                <th style={{ textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {groupedWallsByLevel.map(({ level, walls }) => (
                <React.Fragment key={level}>
                  <FloorLevelGroupRow level={level} colSpan={6} count={walls.length} unitLabel="wall" />
                  {walls.map((wall) => {
                    const globalIndex = qualifiedWalls.findIndex((item) => item.id === wall.id);
                    return renderWallRow(wall, globalIndex >= 0 ? globalIndex : 0);
                  })}
                </React.Fragment>
              ))}
              {qualifiedWalls.length === 0 ? (
                <TaskEmptyRow colSpan={6}>No walls entered. Add a wall above or use Fill.</TaskEmptyRow>
              ) : null}
            </tbody>
          </TaskSummaryTable>
        </EnteredDataCard>
      </div>
    );
  }

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
                  {!isBunVic && (<>
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
                  </>)}

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

                  {!isBunVic && (<>
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
                  </>)}

                  {!isBunVic && (<>
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
                  </>)}

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

            {/* Current ProcurementApp BUN-VIC Frame Hardware is slab-only. */}
            {!isBunVic && (
            <>
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
            </>
            )}

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
            {frameExtraFields.map(([key, label]) => {
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
      <EnteredDataCard
        title={`3. Entered walls (${qualifiedWalls.length})`}
        isOpen={isSection2Open}
        onToggle={() => setIsSection2Open((v) => !v)}
        onAutoFill={() => onAddDataAI?.("frame_hardware")}
        onAddData={handleAddDataFromDb}
        onClear={onClearData}
        onSave={handleSaveToDatabase}
        saveDisabled={isSaving}
        saveStatus={isSaving ? "saving" : saveSuccess ? "success" : "idle"}
        dataSource={dataSource}
        isReadOnly={isReadOnly}
        isLoadingFromDb={isLoadingFromDb}
        onEdit={() => setIsReadOnly(false)}
      >
            <div style={{ padding: "8px" }}>
              <TaskSummaryTable minWidth="760px" compact>
                <thead>
                  <tr style={{ background: "#1e3a5f", color: "#ffffff", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px", width: "24px" }}>#</th>
                    {!isBunVic && <th style={{ padding: "6px 8px" }}>The Wall Above</th>}
                    {!isBunVic && <th style={{ padding: "6px 8px" }}>Wall Type</th>}
                    {!isBunVic && <th style={{ padding: "6px 8px" }}>Wall Height</th>}
                    <th style={{ padding: "6px 8px" }}>Wall Length</th>
                    <th style={{ padding: "6px 8px" }}>Tiedown Spacing</th>
                    {!isBunVic && <th style={{ padding: "6px 8px" }}>Rod size</th>}
                    <th style={{ padding: "6px 8px", textAlign: "right", width: "45px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {groupedWallsByLevel.map(({ level, walls }) => (
                    <React.Fragment key={level}>
                      <FloorLevelGroupRow level={level} colSpan={isBunVic ? 4 : 8} count={walls.length} unitLabel="wall" />
                      {walls.map((w) => {
                        const globalIdx = qualifiedWalls.findIndex(qw => qw.id === w.id);
                        return renderWallRow(w, globalIdx >= 0 ? globalIdx : 0);
                      })}
                    </React.Fragment>
                  ))}
                  {qualifiedWalls.length === 0 && (
                    <TaskEmptyRow colSpan={isBunVic ? 4 : 8}>
                      No walls entered. Enter wall specifications above or click Fill.
                    </TaskEmptyRow>
                  )}
                </tbody>
              </TaskSummaryTable>
            </div>

            {/* ── ACTION BUTTONS: SAVE & COUNT (MATCHING IMAGE 3) ── */}
            {qualifiedWalls.length > 0 && (
              <TaskSummaryFooter>
                {qualifiedWalls.length} {qualifiedWalls.length === 1 ? "wall" : "walls"} entered
              </TaskSummaryFooter>
            )}
      </EnteredDataCard>

    </div>
  );
}
