"use client";
/**
 * App.jsx – Main Application Component
 * =====================================
 * Kiến trúc MVC:
 *   - Models:       models/app.context.jsx (global state), models/api.service.js (API calls)
 *   - Views:        views/RibbonView, CanvasView, RightPropertyPaneView, LoginView, etc.
 *   - Controllers:  controllers/ai, auth, document, interaction, project
 *
 * Flow:
 *   1. User login → AuthController
 *   2. Open file → DocumentController (loadPDF)
 *   3. AI detect → AIController (autoDetect, detectWall, detectDoor)
 *   4. Draw/Edit → InteractionController (click, drag, undo/redo)
 *   5. Save/Load → ProjectController (saveJob, loadJob)
 *   6. BOQ/Export → DocumentController (exportPDF)
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import dynamic from "next/dynamic";
import { polygonAreaM2 as polygonAreaM2Util, centroid, distancePointToSegment, pointInPolygon, getBaseWallId, snapRoomPolygonToWalls } from "@/utils/geometry";
import LoginView from "@/views/LoginView";
import RibbonView from "@/views/RibbonView";
import RightPropertyPaneView from "@/views/RightPropertyPaneView";
import CanvasView from "@/views/CanvasView";
import SearchSidebarView from "@/views/SearchSidebarView";
import ThumbnailSidebarView from "@/views/ThumbnailSidebarView";
import LeftRailView from "@/views/LeftRailView";
import FloorTabBarView from "@/views/FloorTabBarView";
import PdfModuleTabBarView from "@/views/PdfModuleTabBarView";
import DoorTypePanel from "@/components/DoorTypePanel";
import TrainButton from "@/components/TrainButton";
import AIConfidenceBar from "@/features/ai/AIConfidenceBar";
import { ApiService } from "@/models/api.service";

// Helper function to resolve the default hardware type based on room adjacency, walls, and door geometry.
function getHardwareType(door, pageRooms, pageWalls, realScale) {
  const dType = door.type || "single";
  const dClass = (door.class || "").toLowerCase();
  const dName = (door.door_name || "").toLowerCase();

  // 1. Dummy:
  // - Double doors, triple doors, or doors that contain "robe", "linen", "pantry", "cupboard", "closet"
  const isDouble = dType === "double" || dClass.includes("double") || dClass.includes("2x") || dName.includes("2x");
  const isTriple = dClass.includes("triple") || dClass.includes("3x") || dName.includes("3x");
  const isDummyName = dName.includes("robe") || dName.includes("linen") || dName.includes("pantry") || dName.includes("cupboard") || dName.includes("closet");

  if (isDouble || isTriple || isDummyName) {
    return "dummy";
  }

  // Calculate door midpoint to find closest room and wall
  const points = door.points || [];
  let p1 = points[0] ? (Array.isArray(points[0]) ? { x: points[0][0], y: points[0][1] } : points[0]) : null;
  let p2 = points[1] ? (Array.isArray(points[1]) ? { x: points[1][0], y: points[1][1] } : points[1]) : null;

  if (!p1 || !p2) {
    const poly = door.polygon || door.mask_polygon || [];
    if (poly.length >= 3) {
      const pts = poly.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
      p1 = pts[0];
      p2 = pts[1];
    }
  }

  if (p1 && p2) {
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;

    // 2. Entrance:
    // - Closest wall is external (class_name === "exterior_wall")
    // - Or door name/room label contains "entry", "entrance", "porch", "verandah", "garage", "external", "alfresco"
    let closestWall = null;
    let minDistWall = Infinity;
    if (pageWalls && pageWalls.length > 0) {
      pageWalls.forEach(w => {
        if (!w.centerline || w.centerline.length < 2) return;
        const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
        const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };

        const dx = wp2.x - wp1.x;
        const dy = wp2.y - wp1.y;
        const L2 = dx * dx + dy * dy;
        let t = L2 < 0.1 ? 0 : ((cx - wp1.x) * dx + (cy - wp1.y) * dy) / L2;
        t = Math.max(0, Math.min(1, t));
        const dist = Math.hypot(cx - (wp1.x + t * dx), cy - (wp1.y + t * dy));

        if (dist < minDistWall) {
          minDistWall = dist;
          closestWall = w;
        }
      });
    }

    if (closestWall && closestWall.class_name === "exterior_wall") {
      return "entrance";
    }

    // Find nearest room
    let nearestRoom = null;
    let minDistRoom = Infinity;
    if (pageRooms && pageRooms.length > 0) {
      pageRooms.forEach(r => {
        if (!r.polygon || r.polygon.length === 0) return;

        // Check if inside room
        if (pointInPolygon({ x: cx, y: cy }, r.polygon)) {
          minDistRoom = 0;
          nearestRoom = r;
          return;
        }

        const polyPoints = r.polygon.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
        for (let i = 0; i < polyPoints.length; i++) {
          const pA = polyPoints[i];
          const pB = polyPoints[(i + 1) % polyPoints.length];
          const proj = distancePointToSegment({ x: cx, y: cy }, pA, pB);
          if (proj.dist < minDistRoom) {
            minDistRoom = proj.dist;
            nearestRoom = r;
          }
        }
      });
    }

    if (nearestRoom) {
      const rName = (nearestRoom.name || nearestRoom.label || nearestRoom.room_name || "").toLowerCase();

      if (rName.includes("entry") || rName.includes("entrance") || rName.includes("porch") || rName.includes("verandah") || rName.includes("garage") || rName.includes("external") || rName.includes("alfresco")) {
        return "entrance";
      }

      // 3. Privacy:
      // - Bath, Ensuite, WC, Toilet, Powder room
      if (rName.includes("bath") || rName.includes("ens") || rName.includes("wc") || rName.includes("toilet") || rName.includes("powder") || rName.includes("pwd")) {
        return "privacy";
      }

      // 4. Dummy:
      // - Robe, Linen, Pantry, Cupboard, Closet, Cabinet
      if (rName.includes("robe") || rName.includes("linen") || rName.includes("pantry") || rName.includes("cupboard") || rName.includes("closet") || rName.includes("cabinet")) {
        return "dummy";
      }
    }
  }

  // 5. Pass (Passage):
  // - Default for other rooms (opposite of privacy)
  return "passage";
}

// Dynamic imports for heavy components (code-splitting)
const BOQTable = dynamic(() => import("@/components/BOQTable"), { ssr: false });
const UserManagement = dynamic(() => import("@/components/UserManagement"), { ssr: false });
const JobHistory = dynamic(() => import("@/components/JobHistory"), { ssr: false });
const ThreeDView = dynamic(() => import("@/views/ThreeDView"), { ssr: false });

// PDF.js worker — Next.js compatible (served from public/)
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}


const WET_KEYWORDS = /(wc|toilet|bath|shower|l'dry|ens|laundry|ensuite|ldry|pwd|pdr)/i;
const DRY_KEYWORDS = /(bed|living|kitchen|office|garage|entry|hall|study|robe|pantry|media|theater|lounge|store|meals|master|mud|ptry|rumpus|rumbus|gym|library|retreat|kids|sitting|wardrobe)/i;

/* ===================== APP ===================== */
import { useAppModel } from "@/models/app.context";
import { useAIController } from "@/controllers/ai.controller";
import { useProjectController } from "@/controllers/project.controller";
import { useAuthController } from "@/controllers/auth.controller";
import { useInteractionController } from "@/controllers/interaction.controller";
import { useDocumentController } from "@/controllers/document.controller";
import { saveWorkspaceState, loadWorkspaceState, clearWorkspaceState } from "@/utils/workspaceStorage";
import { getAppSettings } from "@/components/SettingsModal";

export default function App() {
  const svgRef = useRef(null);
  const panStart = useRef(null);

  // === MODEL (State from Context) ===
  const {
    pages, setPages,
    currentPage, setCurrentPage,
    levels, setLevels,
    currentLevelIndex, setCurrentLevelIndex,
    activePdfCategory, setActivePdfCategory,
    importTarget, setImportTarget,
    roomsByPage, setRoomsByPage,
    doorsByPage, setDoorsByPage,
    wallsByPage, setWallsByPage,
    user, setUser,
    isLoggedIn, setIsLoggedIn,
    currentProjectName, setCurrentProjectName,
    realScale, setRealScale,
    wasteByPage, setWasteByPage,
    pdfOffsetsByPage, setPdfOffsetsByPage,
    roofsByPage, setRoofsByPage,
    activeTab, setActiveTab,
    currentJobId, setCurrentJobId,
    lintelsByPage, setLintelsByPage,
    scalesByPage, setScalesByPage,
    defaultScale, setDefaultScale,
    annotationsByPage, setAnnotationsByPage,
    showFloorCeilingModal, setShowFloorCeilingModal,
    floorCeilingTakeoffData, setFloorCeilingTakeoffData
  } = useAppModel();

  // === LOCAL UI STATE (View-specific) ===
  // One central invalidation path for Floor & Ceiling scan/cache.
  // Any project/page reset can dispatch this event; the shared takeoff cache is
  // cleared here so old Floor/Ceiling rows cannot leak into another plan.
  useEffect(() => {
    const clearFloorCeilingCache = () => {
      setFloorCeilingTakeoffData(null);
      try {
        sessionStorage.removeItem("floor_ceiling_workspace");
        sessionStorage.removeItem("fc_workspace_state");
        localStorage.removeItem("floor_ceiling_workspace");
      } catch (_) { }
    };
    window.addEventListener("ezefloor:clear_floor_ceiling_scan", clearFloorCeilingCache);
    return () => window.removeEventListener("ezefloor:clear_floor_ceiling_scan", clearFloorCeilingCache);
  }, [setFloorCeilingTakeoffData]);

  const [image, setImage] = useState(null);
  const [showPDF, setShowPDF] = useState(true);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoStatusText, setSsoStatusText] = useState("Sync up with SSO login & Load Project...");

  // === SEARCH STATE (Smart Search & Auto Count) ===
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchThreshold, setSearchThreshold] = useState(0.90);
  const [searchScope, setSearchScope] = useState("project");
  const [isSearching, setIsSearching] = useState(false);
  const [searchCountData, setSearchCountData] = useState(null);
  const [searchResultsVisible, setSearchResultsVisible] = useState(true);
  const [hoveredSearchResultId, setHoveredSearchResultId] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 800, h: 600 });
  const [highlightType, setHighlightType] = useState(null);
  const [showBOQ, setShowBOQ] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState("2d"); // "2d" | "3d" | "split" - Default to 2D Plan on start
  const [splitRatio, setSplitRatio] = useState(70); // 70% 2D / 30% 3D default
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const splitContainerRef = useRef(null);

  const [show3D, setShow3D] = useState(false);
  const [appSettings, setAppSettings] = useState(getAppSettings());
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);

  const handleSetWorkspaceMode = useCallback((mode) => {
    setWorkspaceMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("ezefloor_workspace_mode", mode);
    }
  }, []);

  const handleSplitMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDraggingSplit(true);
  }, []);

  useEffect(() => {
    if (!isDraggingSplit) return;

    const handleMouseMove = (e) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      let newRatio = (relativeX / rect.width) * 100;
      if (newRatio < 20) newRatio = 20;
      if (newRatio > 80) newRatio = 80;
      setSplitRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsDraggingSplit(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingSplit]);
  const [layerVisibility, setLayerVisibility] = useState({
    floor: true,
    wall: true,
    door: true,
    ocr: true,
    labels: true,
    lintel: true,
    roof: true,
    truss: true
  });
  const [hiddenItemIds, setHiddenItemIds] = useState(new Set());
  const toggleItemVisibility = useCallback((id) => {
    setHiddenItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const [showExportPageSelector, setShowExportPageSelector] = useState(false);
  const [exportSelectedPages, setExportSelectedPages] = useState([]);
  const [showImportPageSelector, setShowImportPageSelector] = useState(false);
  const [importSelectedPages, setImportSelectedPages] = useState([]);
  const [pendingPages, setPendingPages] = useState([]);
  const [isAddingPagesMode, setIsAddingPagesMode] = useState(false);

  // Authentication UI State
  const [authData, setAuthData] = useState({ username: "", password: "", email: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const prevTabRef = useRef(activeTab);

  // === INTERACTION CONTROLLER ===
  const {
    scale, setScale,
    offset, setOffset,
    isPanning,
    drawing, setDrawing,
    isDrawingDoor, setIsDrawingDoor,
    showPenetrations, setShowPenetrations,
    isDrawingRoof, setIsDrawingRoof,
    roofInteractionState, setRoofInteractionState,
    selectedRoofId, setSelectedRoofId,
    selectedRoofEdgeIndex, setSelectedRoofEdgeIndex,
    hoveredRoofTarget, setHoveredRoofTarget,
    updateRoofPitch, applyDefaultPitchToAll, applyDefaultOverhangToAll, applyDefaultHeelHeightToAll, applyDefaultSettingsToAll, updateRoofType, updateRoofEdgeAngle, updateRoofEdgeOverhang, updateRoofEdgeHeelHeight, computeSelectedRoof, trimRoofEdge, isComputingRoof, setRoofEaveEdge, deleteRoof, deleteRoofVertex,
    setRoofEdgeMode,
    exportRoofIO,
    exportRoofInput,
    generateRoofFromWalls,
    toggleDutchEdge, updateDutchOverhang, updateDutchRakeOverhang, updateDutchCutPoints,
    undoRoof, redoRoof,
    currentPoly, setCurrentPoly,
    currentDoor, setCurrentDoor,
    currentMouse,
    doorPreset, setDoorPreset,
    history, future,
    pushHistory, pushTaskHistory, undo, redo,
    deleteItem, deleteAllRooms,
    isMeasuring, setIsMeasuring,
    measurePoints, setMeasurePoints,
    isDistancing, setIsDistancing,
    distancePoints, setDistancePoints,
    distanceResults, setDistanceResults,
    hoveredDistIdx, setHoveredDistIdx,
    isAddingPoint, setIsAddingPoint,
    isSnapMode, setIsSnapMode,
    isWallSnapEnabled, setIsWallSnapEnabled,
    straightenWall,
    isShiftDown,
    rect, setRect,
    hoverId, setHoverId,
    selectedId, setSelectedId,
    selectedType, setSelectedType,
    selectedPointIndex, setSelectedPointIndex,
    selectedWallIds, setSelectedWallIds,
    selectedDoorIds, setSelectedDoorIds,
    selectedRoomIds, setSelectedRoomIds,
    selectedLintelIds, setSelectedLintelIds,
    cutPreviewPoint,
    selectWall,
    deleteWalls,
    updateWallsProperty,
    selectDoor,
    updateDoorsProperty,
    deleteDoors,
    pxToMm,
    scaleValue,
    roiRect, setRoiRect, roiMode, setRoiMode, roiUpscale, setRoiUpscale,
    interactionMode, setInteractionMode, clearROI,
    handleClick, handleRoomDoubleClick, finishPolygon, finishRoof, finishDoor, updateDoor, deleteDoor,
    startDrawingRoof,
    startDrag, dragging, onMouseMove, onMouseDown, onMouseUp, onWheel,
    autoMergeCollinearWalls,
    handleWallDoubleClick,
    snapAllDoorsToWalls,
    selectedWallVertex, setSelectedWallVertex,
    drawingWall, setDrawingWall,
    drawingWallEnd, setDrawingWallEnd,
    doorController, // also expose the controller itself if needed
    lintelController,
    isDrawingLintel,
    lintelPreview,
    createDefaultExtEnvelope,
    pullStepInfo,
    setPullStepInfo,
    pullStepPreview,
    extRectStart,
    setExtRectStart,
    autoFitExtEnvelope,
    vertexMenu, setVertexMenu,
    wallBodyMenu, setWallBodyMenu,
    isWallMergeDisabled, setIsWallMergeDisabled,
    startDrawWallFromVertex,
    separateJunction,
    selectedVertices,
    setSelectedVertices,
    startVertexMove,
    snapAlignPoints,
    setSnapAlignPoints
  } = useInteractionController(svgRef, layerVisibility);

  useEffect(() => {
    const effectiveScale = (scalesByPage && scalesByPage[currentPage] !== undefined)
      ? scalesByPage[currentPage]
      : (defaultScale || null);
    setRealScale(effectiveScale);
  }, [currentPage, scalesByPage, defaultScale, setRealScale]);

  // Tự động reset selectedId/selectedType khi layer tương ứng bị tắt
  useEffect(() => {
    if (!layerVisibility.wall) {
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (selectedType === "wall") {
        setSelectedId(null);
        setSelectedType(null);
      }
    }
    if (!layerVisibility.floor && selectedType === "room") {
      setSelectedId(null);
      setSelectedType(null);
    }
    if (!layerVisibility.door && selectedType === "door") {
      setSelectedId(null);
      setSelectedType(null);
    }
    if (layerVisibility?.lintel === false) {
      if (setSelectedLintelIds) setSelectedLintelIds([]);
      if (selectedType === "lintel") {
        setSelectedId(null);
        setSelectedType(null);
      }
    }
    if (setHoverId) setHoverId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerVisibility]);

  // Thêm door_name (D-1, D-2) và page_index tự động cho các cửa để hiển thị đồng nhất và liên kết với tầng chính xác
  const processedDoorsByPage = useMemo(() => {
    const newObj = {};
    Object.keys(doorsByPage).forEach(page => {
      const pageIdx = parseInt(page, 10);
      const pageRooms = Array.isArray(roomsByPage[pageIdx]) ? roomsByPage[pageIdx] : [];
      const pageWalls = Array.isArray(wallsByPage[pageIdx]) ? wallsByPage[pageIdx] : [];

      let doorCount = 0;
      let windowCount = 0;

      newObj[page] = (Array.isArray(doorsByPage[page]) ? doorsByPage[page] : []).map((d) => {
        const isWindow = d.type === 'window' || d.class === 'window' || d.doorTypeId === 'win_standard';
        let defaultName;
        if (isWindow) {
          windowCount++;
          defaultName = `W-${windowCount}`;
        } else {
          doorCount++;
          defaultName = `D-${doorCount}`;
        }
        const doorName = d.door_name || defaultName;
        const autoHardware = getHardwareType({ ...d, door_name: doorName }, pageRooms, pageWalls, realScale);
        return {
          ...d,
          door_name: doorName,
          hardware_type: d.hardware_type || autoHardware,
          page_index: pageIdx
        };
      });
    });
    return newObj;
  }, [doorsByPage, roomsByPage, wallsByPage, realScale]);

  const processedRoomsByPage = useMemo(() => {
    return roomsByPage || {};
  }, [roomsByPage]);

  const rooms = Array.isArray(processedRoomsByPage[currentPage])
    ? processedRoomsByPage[currentPage]
    : (Array.isArray(roomsByPage[currentPage]) ? roomsByPage[currentPage] : []);

  const boqPages = useMemo(() =>
    pages.map((p, idx) => ({
      ...p,
      objects: Array.isArray(processedRoomsByPage[idx]) ? processedRoomsByPage[idx] : (Array.isArray(roomsByPage[idx]) ? roomsByPage[idx] : []),
      doors: Array.isArray(processedDoorsByPage[idx]) ? processedDoorsByPage[idx] : []
    })),
    [pages, processedRoomsByPage, roomsByPage, processedDoorsByPage]
  );

  const allDoors = useMemo(() => {
    return Object.values(processedDoorsByPage).flat();
  }, [processedDoorsByPage]);

  // === CONTROLLERS (Business Logic) ===
  const {
    isDetecting,
    roiProgress,
    cacheStatus,
    inferenceTiming,
    cancelROI,
    autoDetect,
    detectWallFromFloorAI,
    detectText,
    detectTemplate,
    detectDoorSeg,
    detectRoof,
    activeScanRoom,
    smartDetect,
    cancelSmartDetect,
    isSmartDetecting,
    smartProgress,
    generateRoomsFromWalls
  } = useAIController(image, currentPage, setRoomsByPage, realScale, roomsByPage, setDoorsByPage, setWallsByPage, doorsByPage, wallsByPage, pushHistory, setLayerVisibility);
  const { handleLogin: authLogin, handleLogout: authLogout } = useAuthController(user, setUser, setIsLoggedIn);
  const { handleSaveJob: apiSaveJob, handleLoadJob } = useProjectController(
    user, pages, roomsByPage, realScale, wasteByPage, setCurrentProjectName,
    setPages, setRoomsByPage, setRealScale, setWasteByPage, setCurrentPage, setImage, setImgSize, setActiveTab,
    currentJobId, setCurrentJobId, doorsByPage, setDoorsByPage, wallsByPage, setWallsByPage,
    pdfOffsetsByPage, setPdfOffsetsByPage,
    roofsByPage, setRoofsByPage,
    lintelsByPage, setLintelsByPage,
    scalesByPage, setScalesByPage,
    defaultScale, setDefaultScale,
    activePdfCategory, setActivePdfCategory,
    annotationsByPage, setAnnotationsByPage
  );

  // ── Global Capture Escape Handler: Cancel ROI & Active Operations Reliably ──
  useEffect(() => {
    const handleGlobalEscape = (e) => {
      if (e.key === "Escape" || e.code === "Escape") {
        if (roiRect) {
          clearROI();
          if (setRoiRect) setRoiRect(null);
        }
        if (cancelROI) cancelROI();
        if (cancelSmartDetect) cancelSmartDetect();
        if (lintelController?.setShowCatalogPanel) {
          lintelController.setShowCatalogPanel(false);
        }
        if (lintelController?.cancelLintelDraw) {
          lintelController.cancelLintelDraw();
        }
        if (selectedType === 'lintel') {
          setSelectedId(null);
          setSelectedType(null);
          if (setSelectedLintelIds) setSelectedLintelIds([]);
        }
      }
    };
    window.addEventListener("keydown", handleGlobalEscape, true);
    return () => window.removeEventListener("keydown", handleGlobalEscape, true);
  }, [roiRect, clearROI, setRoiRect, cancelROI, cancelSmartDetect, lintelController, selectedType, setSelectedId, setSelectedType, setSelectedLintelIds]);

  // ── 1. Tải project chia sẻ qua token bảo mật ──
  const loadSharedProject = useCallback(async (token) => {
    try {
      const res = await ApiService.getSharedJob(token);
      if (res.status === 'success') {
        const parsedData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        handleLoadJob(parsedData, res.project_name);
        setIsLoggedIn(true);
        setUser({ username: "Guest Viewer", role: "viewer" });
        setActiveTab("Editor");
      }
    } catch (err) {
      console.error("Shared load error:", err);
      alert("Link chia sẻ không hợp lệ hoặc đã hết hạn.");
      window.location.href = "/";
    }
  }, [handleLoadJob, setIsLoggedIn, setUser, setActiveTab]);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes("/share/")) {
      const token = path.split("/share/")[1];
      if (token) {
        loadSharedProject(token);
      }
    }
  }, [loadSharedProject]);

  // ── 2. Tự động mở đúng Job từ TaskList Web3 (deep-link theo EMS UUID) ──
  const handleLoadJobRef = useRef(handleLoadJob);
  handleLoadJobRef.current = handleLoadJob;

  const setCurrentProjectNameRef = useRef(setCurrentProjectName);
  setCurrentProjectNameRef.current = setCurrentProjectName;

  const setActiveTabRef = useRef(setActiveTab);
  setActiveTabRef.current = setActiveTab;

  const setCurrentJobIdRef = useRef(setCurrentJobId);
  setCurrentJobIdRef.current = setCurrentJobId;

  const lastLoadedEmsIdRef = useRef(null);
  const isLoadingEmsRef = useRef(false);

  const loadEmsJob = useCallback(async (idJobEms, force = false) => {
    if (!idJobEms) return;
    if (!force && (isLoadingEmsRef.current || lastLoadedEmsIdRef.current === idJobEms)) {
      console.log("[SSO] Skip calling loadEmsJob for:", idJobEms);
      return;
    }

    try {
      isLoadingEmsRef.current = true;
      lastLoadedEmsIdRef.current = idJobEms;
      console.log("[SSO] Loading Job information from TaskList by EMS ID:", idJobEms);
      const emsResult = await ApiService.getJobByEmsId(idJobEms);
      if (emsResult?.status === "success" && emsResult.data) {
        const jobInfo = emsResult.data;
        console.log("[SSO] Job information received:", jobInfo);

        // Lưu thông tin EMS job vào sessionStorage & localStorage để các modal và export sử dụng (bỏ data bản vẽ nặng để không vượt 5MB quota)
        try {
          const { local_job, ...metaWithoutDrawing } = jobInfo;
          const cleanJobMeta = {
            ...metaWithoutDrawing,
            local_job: local_job ? {
              id: local_job.id,
              project_name: local_job.project_name,
              room_count: local_job.room_count,
              total_area: local_job.total_area
            } : null
          };
          const metaStr = JSON.stringify(cleanJobMeta);
          sessionStorage.setItem("pendingEmsJob", metaStr);
          try { localStorage.setItem("pendingEmsJob", metaStr); } catch (_) { }
        } catch (storageErr) {
          console.warn("[SSO] Failed to save pendingEmsJob to Storage:", storageErr);
        }

        // Use the exact TaskList "Sheets to work" selection returned by the
        // backend. Persist [] as a valid selection and clear data left by a
        // previously opened job when this job has no explicit configuration.
        if (jobInfo.task_modules_configured === true && Array.isArray(jobInfo.selected_modules)) {
          const serializedModules = JSON.stringify(jobInfo.selected_modules);
          sessionStorage.setItem("selectedModules", serializedModules);
          try { localStorage.setItem("selectedModules", serializedModules); } catch (_) { }
        } else {
          sessionStorage.removeItem("selectedModules");
          try { localStorage.removeItem("selectedModules"); } catch (_) { }
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("task-modules-updated"));
        }

        const targetProjectName = jobInfo.job_number || ("Project " + String(idJobEms).slice(0, 8));

        // 1. Kiểm tra đối chiếu xem Job đã có bản vẽ lưu trong CSDL SQLite hay chưa
        let savedJobData = null;
        let savedJobId = null;
        let savedProjectName = targetProjectName;

        if (jobInfo.local_job?.data) {
          savedJobData = jobInfo.local_job.data;
          savedJobId = jobInfo.local_job.id;
          savedProjectName = jobInfo.local_job.project_name || targetProjectName;
        } else if (jobInfo.local_job?.id) {
          try {
            const dataRes = await ApiService.getJobData(jobInfo.local_job.id);
            if (dataRes?.status === "success" && dataRes.data) {
              savedJobData = dataRes.data;
              savedJobId = jobInfo.local_job.id;
              savedProjectName = jobInfo.local_job.project_name || targetProjectName;
            }
          } catch (err) {
            console.warn("[SSO] Failed to load drawing data from local_job.id:", err);
          }
        }

        // If no data, try to look up directly with SQLite by job_number
        if (!savedJobData && targetProjectName) {
          try {
            const findRes = await ApiService.findJob(targetProjectName);
            if (findRes?.status === "success" && findRes.found && findRes.data) {
              savedJobData = findRes.data;
              savedJobId = findRes.job_id;
              savedProjectName = findRes.project_name || targetProjectName;
            }
          } catch (findErr) {
            console.warn("[SSO] SQLite lookup by project name failed:", findErr);
          }
        }

        // 2. Nạp dữ liệu hoặc mở trang trắng mới tinh
        if (savedJobData) {
          console.log("[SSO] Found saved drawing data in SQLite for Job:", savedProjectName, "Loading to canvas...");
          const parsedData = typeof savedJobData === "string"
            ? JSON.parse(savedJobData)
            : savedJobData;
          handleLoadJobRef.current(parsedData, savedProjectName, savedJobId);
        } else {
          // If the job is new and has no drawing in EzeFloor (not in SQLite) -> Open a new white page
          console.log("[SSO] Job has no drawing in SQLite. Reset workspace and open a new white page:", targetProjectName);

          // 2a. Set skip restore flag to avoid reading old cache in useEffect
          try {
            sessionStorage.setItem("ezefloor_skip_restore", "1");
          } catch (_) { }

          // 2b. Xóa sạch IndexedDB workspace cache
          try {
            await clearWorkspaceState("active_session");
          } catch (_) { }

          // 2c. Xóa sạch localStorage liên quan đến job trước
          try {
            if (typeof window !== "undefined") {
              localStorage.removeItem("ezefloor_last_active_job_id");
              localStorage.removeItem("ezefloor_last_active_project_name");
            }
          } catch (_) { }

          // 2d. Xóa toàn bộ React state về rỗng / trắng tinh
          setPages([]);
          setRoomsByPage({});
          setWallsByPage({});
          setDoorsByPage({});
          setRoofsByPage({});
          setLintelsByPage({});
          setScalesByPage({});
          setWasteByPage({});
          setPdfOffsetsByPage({});
          setAnnotationsByPage({});
          setImage(null);
          setImgSize({ w: 800, h: 600 });
          setCurrentPage(0);
          setSelectedId(null);
          setSelectedType(null);
          setSelectedWallIds([]);
          setSelectedDoorIds([]);
          setSelectedRoomIds([]);
          setSelectedLintelIds([]);
          setHighlightType(null);

          setCurrentProjectNameRef.current(targetProjectName);
          if (setCurrentJobIdRef.current) setCurrentJobIdRef.current(null);
        }

        setActiveTabRef.current("Home");
      }
    } catch (emsErr) {
      console.warn("[SSO] Failed to load Job from TaskList:", emsErr);
    } finally {
      isLoadingEmsRef.current = false;
    }
  }, [
    setPages, setRoomsByPage, setWallsByPage, setDoorsByPage, setRoofsByPage,
    setLintelsByPage, setScalesByPage, setWasteByPage, setPdfOffsetsByPage,
    setAnnotationsByPage, setImage, setImgSize, setCurrentPage,
    setSelectedId, setSelectedType, setSelectedWallIds, setSelectedDoorIds,
    setSelectedRoomIds, setSelectedLintelIds, setHighlightType
  ]);

  // Expose loadEmsJob to window for debug and external integration
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.openEmsJob = (emsId, force = true) => loadEmsJob(emsId, force);
    window.loadEmsJob = (emsId, force = true) => loadEmsJob(emsId, force);
    return () => {
      try {
        delete window.openEmsJob;
        delete window.loadEmsJob;
      } catch (_) { }
    };
  }, [loadEmsJob]);

  // Kiểm tra tham số ?job=, ?token=, ?user=, ?modules= trên URL khi load trang
  const hasProcessedUrlSsoRef = useRef(false);

  useEffect(() => {
    if (hasProcessedUrlSsoRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const idJobEms = params.get("job");
    const urlToken = params.get("token") || params.get("sso_token");
    const urlUser = params.get("user") || params.get("username") || params.get("UserID");
    const urlModules = params.get("modules") || params.get("selectedModules") || params.get("tasks") || params.get("task_modules");

    if (urlModules) {
      sessionStorage.setItem("selectedModules", urlModules);
      localStorage.setItem("selectedModules", urlModules);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("task-modules-updated"));
      }
    }

    if (urlToken || urlUser) {
      hasProcessedUrlSsoRef.current = true;
      // Dọn sạch URL ngay lập tức để ngăn ngừa vòng lặp khi reload/re-render
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);

      console.log("[SSO] Verifying user from URL params:", { urlToken, urlUser });
      ApiService.tasklistSSO({ token: urlToken || "direct_url", username: urlUser })
        .then(res => res.json())
        .then(data => {
          if (data && data.status === "success") {
            const finalUsername = data.username || urlUser || "Liam";
            const userData = {
              username: finalUsername,
              role: data.role || "admin",
              ma_nv: data.manv || data.ma_nv || data.MaNV || "EZE0090",
              bophanlogin: data.bophanlogin || data.bophan || "",
              session_token: data.session_token,
              tasklist_token: urlToken || "",
            };
            setIsLoggedIn(true);
            setUser(userData);
            localStorage.setItem("isLoggedIn", "true");
            localStorage.setItem("user", JSON.stringify(userData));
            if (urlToken) {
              localStorage.setItem("tasklist_token", urlToken);
              localStorage.setItem("ems_token", urlToken);
            }
            console.log("[SSO] URL Login successful with:", userData.username);
            if (idJobEms) loadEmsJob(idJobEms);
          }
        })
        .catch(err => console.warn("[SSO] URL SSO error:", err));
      return;
    }

    if (isLoggedIn && idJobEms) {
      hasProcessedUrlSsoRef.current = true;
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      loadEmsJob(idJobEms);
    }
  }, [isLoggedIn, loadEmsJob, setIsLoggedIn, setUser]);

  // ── 2.5. Tự động lưu & Khôi phục Workspace khi F5 (Reload) qua IndexedDB ──
  const isRestoringSessionRef = useRef(false);
  const saveTimeoutRef = useRef(null);

  // 1. Tự động khôi phục toàn bộ Workspace khi load trang/F5
  useEffect(() => {
    if (!isLoggedIn || !user || pages.length > 0 || isRestoringSessionRef.current) return;

    // Nếu URL có ?job= thì để loadEmsJob xử lý
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("job")) {
      return;
    }

    // Nếu đang reset workspace cho job mới (từ handleOpenJobTask), bỏ qua restore
    if (typeof window !== "undefined" && sessionStorage.getItem("ezefloor_skip_restore") === "1") {
      console.log("[Restore] Skip restore — workspace đang được reset cho job mới");
      sessionStorage.removeItem("ezefloor_skip_restore");
      return;
    }

    const restoreWorkspace = async () => {
      try {
        isRestoringSessionRef.current = true;
        const savedSession = await loadWorkspaceState("active_session");

        if (savedSession && savedSession.pages && savedSession.pages.length > 0) {
          console.log("[Restore] Restore full drawing from IndexedDB:", savedSession.currentProjectName, savedSession.pages.length, "trang");
          setPages(savedSession.pages);
          if (savedSession.roomsByPage) setRoomsByPage(savedSession.roomsByPage);
          if (savedSession.wallsByPage) setWallsByPage(savedSession.wallsByPage);
          if (savedSession.doorsByPage) setDoorsByPage(savedSession.doorsByPage);
          if (savedSession.scalesByPage) setScalesByPage(savedSession.scalesByPage);
          if (savedSession.defaultScale && setDefaultScale) {
            setDefaultScale(savedSession.defaultScale);
          } else if (savedSession.realScale && setDefaultScale) {
            setDefaultScale(savedSession.realScale);
          } else if (savedSession.scalesByPage && savedSession.scalesByPage[0] && setDefaultScale) {
            setDefaultScale(savedSession.scalesByPage[0]);
          }
          if (savedSession.roofsByPage) setRoofsByPage(savedSession.roofsByPage);
          if (savedSession.lintelsByPage) setLintelsByPage(savedSession.lintelsByPage);
          if (savedSession.annotationsByPage && setAnnotationsByPage) setAnnotationsByPage(savedSession.annotationsByPage);
          if (savedSession.pdfOffsetsByPage && setPdfOffsetsByPage) setPdfOffsetsByPage(savedSession.pdfOffsetsByPage);
          if (savedSession.currentProjectName) setCurrentProjectName(savedSession.currentProjectName);
          if (savedSession.currentJobId) setCurrentJobId(savedSession.currentJobId);
          if (savedSession.realScale) setRealScale(savedSession.realScale);

          const targetPage = (savedSession.currentPage >= 0 && savedSession.currentPage < savedSession.pages.length)
            ? savedSession.currentPage
            : 0;
          setCurrentPage(targetPage);

          if (savedSession.pages[targetPage]) {
            setImage(savedSession.pages[targetPage].image);
            setImgSize({ w: savedSession.pages[targetPage].w, h: savedSession.pages[targetPage].h });
          }

          if (savedSession.activePdfCategory && setActivePdfCategory) {
            setActivePdfCategory(savedSession.activePdfCategory);
          }
          if (savedSession.activeTab) {
            setActiveTab(savedSession.activeTab);
          }
          return;
        }

        // Fallback sang API nếu IndexedDB chưa có nhưng có savedJobId
        const savedJobId = localStorage.getItem("ezefloor_last_active_job_id");
        const savedProjectName = localStorage.getItem("ezefloor_last_active_project_name");
        if (savedJobId) {
          const res = await ApiService.getJobData(savedJobId);
          if (res && res.status === "success" && res.data) {
            const parsed = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
            handleLoadJob(parsed, res.project_name || savedProjectName || "Project", savedJobId);
          }
        }
      } catch (err) {
        console.warn("[Restore] Failed to restore workspace:", err);
      } finally {
        isRestoringSessionRef.current = false;
      }
    };

    restoreWorkspace();
  }, [isLoggedIn, user, pages.length, handleLoadJob, setPages, setRoomsByPage, setWallsByPage, setDoorsByPage, setScalesByPage, setRoofsByPage, setLintelsByPage, setAnnotationsByPage, setPdfOffsetsByPage, setCurrentProjectName, setCurrentJobId, setRealScale, setCurrentPage, setImage, setImgSize, setActiveTab, setActivePdfCategory]);

  // 2. Tự động lưu Workspace vào IndexedDB khi có thay đổi (debounce 400ms)
  useEffect(() => {
    if (!isLoggedIn || pages.length === 0 || isRestoringSessionRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveWorkspaceState("active_session", {
        pages,
        roomsByPage,
        wallsByPage,
        doorsByPage,
        scalesByPage,
        defaultScale,
        roofsByPage,
        lintelsByPage,
        annotationsByPage,
        pdfOffsetsByPage,
        currentPage,
        currentProjectName,
        currentJobId,
        activeTab,
        realScale,
        activePdfCategory,
        savedAt: Date.now()
      });
    }, 400);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [pages, roomsByPage, wallsByPage, doorsByPage, scalesByPage, defaultScale, roofsByPage, lintelsByPage, annotationsByPage, pdfOffsetsByPage, currentPage, currentProjectName, currentJobId, activeTab, realScale, activePdfCategory, isLoggedIn]);

  // 2.5. Tự động lưu định kỳ theo thiết lập Cài đặt (Configurable Periodic Auto-Save)
  useEffect(() => {
    const handleSettingsUpdated = (e) => {
      if (e.detail) {
        setAppSettings(e.detail);
      }
    };
    window.addEventListener("ezefloor_settings_updated", handleSettingsUpdated);
    return () => window.removeEventListener("ezefloor_settings_updated", handleSettingsUpdated);
  }, []);

  useEffect(() => {
    if (!isLoggedIn || pages.length === 0 || isRestoringSessionRef.current) return;
    if (!appSettings.autoSaveEnabled) return;

    const intervalSeconds = Math.max(5, appSettings.autoSaveInterval || 30);
    const intervalMs = intervalSeconds * 1000;

    const autoSaveTimer = setInterval(async () => {
      try {
        setIsAutoSaving(true);

        // A. Lưu vào IndexedDB (Local Workspace Session)
        if (appSettings.autoSaveIndexedDB !== false) {
          await saveWorkspaceState("active_session", {
            pages,
            roomsByPage,
            wallsByPage,
            doorsByPage,
            scalesByPage,
            defaultScale,
            roofsByPage,
            lintelsByPage,
            annotationsByPage,
            pdfOffsetsByPage,
            currentPage,
            currentProjectName,
            currentJobId,
            activeTab,
            realScale,
            savedAt: Date.now()
          });
        }

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastAutoSaveTime(timeStr);
      } catch (err) {
        console.warn("[Auto-Save] Lỗi tự động lưu:", err);
      } finally {
        setTimeout(() => setIsAutoSaving(false), 600);
      }
    }, intervalMs);

    return () => clearInterval(autoSaveTimer);
  }, [
    isLoggedIn,
    pages,
    roomsByPage,
    wallsByPage,
    doorsByPage,
    scalesByPage,
    roofsByPage,
    lintelsByPage,
    annotationsByPage,
    pdfOffsetsByPage,
    currentPage,
    currentProjectName,
    currentJobId,
    activeTab,
    realScale,
    appSettings.autoSaveEnabled,
    appSettings.autoSaveInterval,
    appSettings.autoSaveIndexedDB
  ]);

  // ── 3D Multi-Monitor / Popout Synchronization via BroadcastChannel ──
  const handlePopout3D = useCallback(() => {
    if (typeof window === "undefined") return;
    const popout = window.open(
      "/3d-view",
      "EzeFloor_3D_Studio_Popout",
      "width=1280,height=850,menubar=no,toolbar=no,location=no,status=no,resizable=yes"
    );
    if (popout) {
      popout.focus();
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;

    const channel = new BroadcastChannel("ezefloor_3d_sync");

    const isLevel = (p) => !p || (p.source !== "pdf_tools" && !p.is_pdf_tool && !p.isPdfTool && (!p.category || p.category === "level"));
    const isCurrentLevel = isLevel(pages[currentPage]);
    const resolved3DCurrentPage = isCurrentLevel
      ? currentPage
      : (pages.findIndex(isLevel) >= 0 ? pages.findIndex(isLevel) : 0);

    const payload = {
      wallsByPage,
      doorsByPage: processedDoorsByPage,
      roomsByPage,
      roofsByPage,
      pages,
      currentPage: resolved3DCurrentPage,
      realScale,
      imgSize,
      currentProjectName
    };

    try {
      localStorage.setItem("ezefloor_3d_state", JSON.stringify(payload));
    } catch (e) { }

    channel.postMessage({
      type: "STATE_UPDATE",
      payload
    });

    channel.onmessage = (event) => {
      const { type, payload: msgPayload } = event.data || {};
      if (type === "REQUEST_INITIAL_STATE") {
        channel.postMessage({
          type: "STATE_UPDATE",
          payload
        });
      } else if (type === "WALLS_UPDATED_FROM_3D" && msgPayload?.wallsByPage) {
        setWallsByPage(msgPayload.wallsByPage);
      }
    };

    return () => {
      channel.close();
    };
  }, [wallsByPage, processedDoorsByPage, roomsByPage, roofsByPage, pages, currentPage, realScale, imgSize, currentProjectName]);

  // ── 3. TASK_LIST_WEB3_SSO Listener tốc độ cao (Tức thì < 50ms) ──
  const postMessageHandledRef = useRef(false);

  useEffect(() => {
    const allowedOrigins = new Set([
      "https://103.77.167.69:8081",
      "http://103.77.167.69:8081",
      "http://14.241.197.188:7749",
      "https://14.241.197.188:7749",
      "http://14.241.197.188",
      "https://14.241.197.188",
      "http://localhost:7749",
      "http://127.0.0.1:7749",
      "http://localhost:3011",
      "http://127.0.0.1:3011"
    ]);

    try {
      if (document.referrer) {
        allowedOrigins.add(new URL(document.referrer).origin);
      }
    } catch (_) { }

    const receiveSSO = async (event) => {
      if (!allowedOrigins.has(event.origin) && !event.origin?.includes("14.241.197.188") && !event.origin?.includes("103.77.167.69")) return;
      if (event.data?.type !== "TASK_LIST_WEB3_SSO") return;
      if (!event.data?.token) return;
      if (postMessageHandledRef.current) return;

      postMessageHandledRef.current = true;

      try {
        console.log("[SSO] Verifying SSO token from TaskList...", event.data);
        const extractedUser = event.data.username ||
          event.data.UserID ||
          event.data.user_id ||
          (event.data.user && (typeof event.data.user === "string" ? event.data.user : (event.data.user.username || event.data.user.UserID || event.data.user.user_id || event.data.user.name)));

        const ssoPayload = {
          token: event.data.token,
          username: extractedUser,
          user: event.data.user
        };
        const response = await ApiService.tasklistSSO(ssoPayload);
        if (!response.ok) {
          const errText = await response.text();
          console.warn("[SSO] TaskList SSO failed:", response.status, errText);
          postMessageHandledRef.current = false;
          return;
        }

        const data = await response.json();
        if (data.status !== "success") {
          console.error("[SSO] Invalid SSO response:", data);
          postMessageHandledRef.current = false;
          return;
        }

        const finalUsername = data.username || extractedUser;
        const rawToken = event.data.token || "";
        const userData = {
          username: finalUsername,
          role: data.role || "admin",
          ma_nv: data.manv || data.ma_nv || data.MaNV || (event.data.user && (event.data.user.ma_nv || event.data.user.MaNV || event.data.user.manv)) || "EZE0090",
          bophanlogin: data.bophanlogin || data.bophan || (event.data.user && (event.data.user.bophanlogin || event.data.user.bophan)) || "",
          session_token: data.session_token,
          tasklist_token: rawToken,
        };

        setIsLoggedIn(true);
        setUser(userData);
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("user", JSON.stringify(userData));
        if (rawToken) {
          localStorage.setItem("tasklist_token", rawToken);
          localStorage.setItem("ems_token", rawToken);
        }
        console.log("[SSO] Login success with account:", userData.username);

        const idJobEms = new URLSearchParams(window.location.search).get("job");
        if (idJobEms) {
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
          loadEmsJob(idJobEms);
        }
      } catch (err) {
        console.error("[SSO] Error during SSO processing:", err);
        postMessageHandledRef.current = false;
      }
    };

    window.addEventListener("message", receiveSSO);

    // Gửi tín hiệu READY liên tục ở các mốc thời gian siêu ngắn (0ms, 30ms, 100ms, 250ms, 600ms, 1200ms)
    // Tới cả window.opener (nếu là popup) và window.parent (nếu là iframe)
    const notifyReady = () => {
      const targets = [];
      if (window.opener && !window.opener.closed) targets.push(window.opener);
      if (window.parent && window.parent !== window) targets.push(window.parent);

      for (const target of targets) {
        try {
          target.postMessage({ type: "TASK_LIST_WEB3_READY" }, "*");
        } catch (_) { }
      }
    };

    notifyReady();
    const readyTimers = [30, 100, 250, 600, 1200, 2500].map((delay) =>
      window.setTimeout(notifyReady, delay)
    );

    return () => {
      window.removeEventListener("message", receiveSSO);
      readyTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [loadEmsJob, setIsLoggedIn, setUser]);

  // Pass down context for global access
  const contextValue = {
    user, pages, roomsByPage, doorsByPage: processedDoorsByPage, realScale, wasteByPage, setCurrentProjectName,
    currentProjectName,
    activeTab, setActiveTab
  };

  const handleSaveJob = async (isSaveAs = false) => {
    let name = currentProjectName;
    if (isSaveAs || !name) {
      const input = prompt("Enter project name:", name || "");
      if (!input) return;
      name = input;
    }
    await apiSaveJob(name, isSaveAs);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const result = await authLogin(authData, isSignup);
    if (result.success && isSignup) setIsSignup(false);
    if (result.locked) setIsLocked(true);
  };

  const handleLogout = authLogout;

  useEffect(() => {
    if (activeTab === "Home" && image) {
      const prevTab = prevTabRef.current;
      const isEditorTab = ["Home", "AI & Reports", "View"].includes(prevTab);
      if (!isEditorTab) {
        setTimeout(zoomTo100, 100);
      }
    }
    prevTabRef.current = activeTab;
  }, [activeTab, image]);

  function fitToScreen() {
    const container = svgRef.current?.parentElement;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;
    const safeW = imgSize.w || 1;
    const safeH = imgSize.h || 1;
    const scaleX = cw / safeW;
    const scaleY = ch / safeH;
    const newScale = Math.max(0.001, Math.min(scaleX, scaleY));
    setScale(newScale);
    setOffset({
      x: (cw - safeW * newScale) / 2,
      y: (ch - safeH * newScale) / 2
    });
  }

  function zoomTo100() {
    const container = svgRef.current?.parentElement;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;
    const safeW = imgSize.w || 1;
    const safeH = imgSize.h || 1;
    const newScale = 1.0;
    setScale(newScale);
    setOffset({
      x: (cw - safeW * newScale) / 2,
      y: (ch - safeH * newScale) / 2
    });
  }



  function goPage(index) {
    if (!pages[index]) return;
    if (interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") {
      if (setSnapAlignPoints) setSnapAlignPoints([]);
      if (setInteractionMode) setInteractionMode("select");
    }
    setCurrentPage(index);
    setImage(pages[index].image);
    setImgSize({ w: pages[index].w, h: pages[index].h });
    setTimeout(fitToScreen, 50);
  }

  const zoomToBbox = (pageIndex, bbox, focusOptions = {}) => {
    if (!pages[pageIndex] || !Array.isArray(bbox) || bbox.length < 4) return;

    const changingPage = currentPage !== pageIndex;
    if (changingPage) {
      if (interactionMode === "snap-align-pdf" || interactionMode === "align-pdf") {
        if (setSnapAlignPoints) setSnapAlignPoints([]);
        if (setInteractionMode) setInteractionMode("select");
      }
      setCurrentPage(pageIndex);
      setImage(pages[pageIndex].image);
      setImgSize({ w: pages[pageIndex].w, h: pages[pageIndex].h });
    }

    setTimeout(() => {
      const container = svgRef.current?.parentElement;
      if (!container) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (!cw || !ch) return;

      const [rawX1, rawY1, rawX2, rawY2] = bbox.map(Number);
      if (![rawX1, rawY1, rawX2, rawY2].every(Number.isFinite)) return;

      const x1 = Math.min(rawX1, rawX2);
      const x2 = Math.max(rawX1, rawX2);
      const y1 = Math.min(rawY1, rawY2);
      const y2 = Math.max(rawY1, rawY2);
      const bboxW = Math.max(1, x2 - x1);
      const bboxH = Math.max(1, y2 - y1);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;

      // Non-task callers (search results, OCR hits, etc.) keep the historical
      // zoom behaviour. Semantic task focus is opt-in via focusOptions below.
      if (!focusOptions || Object.keys(focusOptions).length === 0) {
        const scaleX = cw / bboxW;
        const scaleY = ch / bboxH;
        const legacyScale = Math.min(3.0, Math.max(1.0, Math.min(scaleX, scaleY) * 0.45));
        setScale(legacyScale);
        setOffset({
          x: cw / 2 - cx * legacyScale,
          y: ch / 2 - cy * legacyScale
        });
        return;
      }

      const page = pages[pageIndex] || {};
      const pageW = Math.max(1, Number(page.w) || imgSize.w || bboxW);
      const pageH = Math.max(1, Number(page.h) || imgSize.h || bboxH);
      const pageFitScale = Math.max(0.001, Math.min(cw / pageW, ch / pageH));
      const pageCoverage = Math.max(bboxW / pageW, bboxH / pageH);
      const objectCount = Math.max(1, Number(focusOptions.objectCount) || 1);

      let profile = focusOptions.profile || "auto";
      if (profile === "auto") {
        if (objectCount >= 8 || pageCoverage >= 0.58) profile = "overview";
        else if (objectCount > 1) profile = "group";
        else profile = "detail";
      }

      // Each selected component gets a different visual weight. A tiny door/window
      // should be close enough to inspect, a wall should remain fully visible, while
      // an aggregate task row (e.g. all external insulation walls) should read as an
      // overview instead of shrinking the plan to an arbitrary fixed scale.
      const presets = {
        opening: { fill: 0.56, minFit: 1.25, maxFit: 12.0, hardMax: 5.5 },
        wall: { fill: 0.90, minFit: 1.08, maxFit: 8.0, hardMax: 4.0 },
        room: { fill: 0.78, minFit: 1.04, maxFit: 4.5, hardMax: 3.0 },
        detail: { fill: 0.80, minFit: 1.05, maxFit: 6.0, hardMax: 4.0 },
        "wall-group": { fill: 0.90, minFit: 1.00, maxFit: 2.8, hardMax: 2.2 },
        "area-group": { fill: 0.84, minFit: 0.98, maxFit: 2.4, hardMax: 2.0 },
        group: { fill: 0.86, minFit: 1.00, maxFit: 2.6, hardMax: 2.2 },
        overview: { fill: 0.94, minFit: 0.96, maxFit: 1.65, hardMax: 1.6 },
      };
      const preset = presets[profile] || presets.detail;

      const fitScale = Math.min((cw * preset.fill) / bboxW, (ch * preset.fill) / bboxH);
      const minScale = pageFitScale * preset.minFit;
      const maxScale = Math.min(preset.hardMax, pageFitScale * preset.maxFit);
      let newScale = Math.max(minScale, Math.min(fitScale, Math.max(minScale, maxScale)));

      // Very broad selections should never zoom farther out than a sensible
      // whole-plan view. This is especially important for Insulation/Frame rows
      // containing many exterior/interior walls.
      if (profile === "overview" || pageCoverage >= 0.75) {
        newScale = Math.max(pageFitScale * 0.96, Math.min(newScale, pageFitScale * 1.5));
      }

      setScale(newScale);
      setOffset({
        x: cw / 2 - cx * newScale,
        y: ch / 2 - cy * newScale
      });
    }, changingPage ? 140 : 16);
  };

  const clearSearch = () => {
    setSearchResults([]);
    setSearchCountData(null);
    setSearchQuery("");
  };

  const runROISearch = async () => {
    if (!currentJobId) {
      alert("Please save your project first to initialize the search index!");
      return;
    }
    if (!roiRect) return;

    setIsSearching(true);
    try {
      const bbox = [
        Math.round(roiRect.x),
        Math.round(roiRect.y),
        Math.round(roiRect.x + roiRect.w),
        Math.round(roiRect.y + roiRect.h)
      ];

      const payload = {
        project_id: currentJobId,
        bbox: bbox,
        page_id: currentPage,
        threshold: searchThreshold,
        scope: searchScope
      };

      const results = await ApiService.searchObject(payload);
      setSearchResults(results || []);

      const matchedIds = (results || []).filter(r => r.object_id).map(r => r.object_id);
      if (matchedIds.length > 0) {
        const countRes = await ApiService.searchCount({
          project_id: currentJobId,
          search_result_ids: matchedIds,
          export_format: "csv"
        });
        setSearchCountData(countRes);
      } else {
        setSearchCountData(null);
      }
      clearROI();
    } catch (e) {
      console.error("ROI Search error:", e);
      alert("Region search failed: " + e.message);
    } finally {
      setIsSearching(false);
    }
  };

  function confirmImport(categoryAssignments = {}, forcedTarget = null) {
    const uniqueSelectedPages = Array.from(new Set(importSelectedPages)).sort((a, b) => a - b);
    if (uniqueSelectedPages.length === 0) {
      setShowImportPageSelector(false);
      setIsAddingPagesMode(false);
      return;
    }

    const effectiveTarget = forcedTarget || importTarget;
    const hasCategoryAssignments = categoryAssignments && Object.keys(categoryAssignments).length > 0;
    // An import is ONLY for architectural levels if explicitly target is "level" and no category assignments were selected
    const isLevel = effectiveTarget === "level" && !hasCategoryAssignments;
    const existingArchitecturalCount = isAddingPagesMode
      ? (pages || []).filter((page) => !page?.category && page?.source !== "pdf_tools" && !page?.isFloorCeilingWorkspace && page?.source !== "floor_ceiling_workspace" && page?.source !== "floor_ceiling_page" && !page?.isWorkspace).length
      : 0;
    const selectedData = uniqueSelectedPages.map((idx, selectedOrder) => {
      const p = pendingPages[idx];
      if (isLevel) {
        const architecturalOrder = existingArchitecturalCount + selectedOrder;
        const levelCode = ["GF", "FF", "SF", "TF"][architecturalOrder] || `${architecturalOrder}F`;
        return {
          ...p,
          id: p?.id || `level_pg_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
          code: levelCode,
          category: null,
          source: "design",
          pageNumber: p?.pageNumber || (idx + 1)
        };
      }
      const assignedCat = (categoryAssignments && categoryAssignments[idx]) || p?.category || activePdfCategory || "frame_hardware";
      return {
        ...p,
        id: `pdf_pg_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        category: assignedCat,
        source: "pdf_tools",
        pageNumber: p?.pageNumber || (idx + 1)
      };
    });

    if (isLevel) {
      // Architectural page changes invalidate the previous Floor & Ceiling scan.
      // This prevents a previous plan's Floor/Ceiling rows from surviving after
      // adding/replacing level pages.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ezefloor:clear_floor_ceiling_scan"));
        window.dispatchEvent(new CustomEvent("sync-floor-ceiling-insulation-clear"));
      }

      if (isAddingPagesMode) {
        const startIdx = pages.length;
        setPages(prev => [...prev, ...selectedData]);
        if (defaultScale && setScalesByPage) {
          setScalesByPage(prev => {
            const updated = { ...prev };
            selectedData.forEach((_, idx) => {
              if (updated[startIdx + idx] === undefined) {
                updated[startIdx + idx] = defaultScale;
              }
            });
            return updated;
          });
        }
        setCurrentPage(startIdx);
        setImage(selectedData[0].image);
        setImgSize({
          w: selectedData[0].w,
          h: selectedData[0].h
        });
      } else {
        // Clear previous drawing data when opening a new file for Level/Building
        setRoomsByPage({});
        setDoorsByPage({});
        setWallsByPage({});
        setWasteByPage({});
        setPdfOffsetsByPage({});
        setRoofsByPage({});
        setLintelsByPage({});
        setScalesByPage({});
        if (setDefaultScale) setDefaultScale(null);
        if (setAnnotationsByPage) setAnnotationsByPage({});
        if (!currentProjectName || currentProjectName === "Untitled Project" || currentProjectName === "New Project") {
          if (setCurrentJobId) setCurrentJobId(null);
        }

        setPages(selectedData);
        setCurrentPage(0);
        setImage(selectedData[0].image);
        setImgSize({
          w: selectedData[0].w,
          h: selectedData[0].h
        });
      }
    } else {
      // PDF Tools Import: ALWAYS preserve architectural level pages!
      const levelPages = pages.filter(p => !p.category && p.source !== "pdf_tools" && !p.isFloorCeilingWorkspace && p.source !== "floor_ceiling_workspace" && p.source !== "floor_ceiling_page" && !p.isWorkspace);
      const otherPdfToolsPages = isAddingPagesMode
        ? pages.filter(p => p.category || p.source === "pdf_tools" || p.source === "floor_ceiling_page" || p.source === "floor_ceiling_workspace" || p.isFloorCeilingWorkspace)
        : [];

      // Allow 1 page to be added to multiple tasks, but avoid identical duplicate in the SAME task
      const toAdd = [];
      for (const item of selectedData) {
        const alreadyInSameCat = otherPdfToolsPages.some(
          exist => exist.category === item.category &&
            ((item.pageNumber && exist.pageNumber === item.pageNumber) || (exist.image && exist.image === item.image))
        );
        if (!alreadyInSameCat) {
          toAdd.push(item);
        }
      }

      const newPages = [...levelPages, ...otherPdfToolsPages, ...(toAdd.length > 0 ? toAdd : selectedData)];
      setPages(newPages);

      const firstAdded = toAdd[0] || selectedData[0];
      const firstNewIdx = newPages.indexOf(firstAdded);
      if (firstNewIdx >= 0) {
        setCurrentPage(firstNewIdx);
        setImage(newPages[firstNewIdx].image);
        setImgSize({
          w: newPages[firstNewIdx].w,
          h: newPages[firstNewIdx].h
        });
      }
      if (setActivePdfCategory && firstAdded?.category) {
        setActivePdfCategory(firstAdded.category);
      }
    }

    setShowImportPageSelector(false);
    setImportSelectedPages([]);
    setIsAddingPagesMode(false);

    setTimeout(fitToScreen, 100);
  }

  const openAddPagesSelector = (file, targetCategory = null, targetMode = null) => {
    if (file) {
      const mode = targetMode || (targetCategory ? "pdf_tools" : (activeTab === "PDF Tools" ? "pdf_tools" : "level"));
      if (setImportTarget) setImportTarget(mode);
      if (targetCategory && setActivePdfCategory) {
        setActivePdfCategory(targetCategory);
      }
      if (file.type === "application/pdf") {
        loadPDF(file, true);
      } else {
        const url = URL.createObjectURL(file);
        const imgData = {
          id: `img_pg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          image: url,
          w: 2000,
          h: 1500,
          fileName: file.name ? file.name.replace(/\.[^/.]+$/, "") : "Image",
          pageNumber: 1,
          category: targetCategory || null
        };
        setPendingPages([imgData]);
        setImportSelectedPages([0]);
        setIsAddingPagesMode(true);
        setShowImportPageSelector(true);
      }
    }
  };

  const handleDeletePage = (eOrIdx, maybeIdx) => {
    const rawIdx = typeof eOrIdx === 'number' ? eOrIdx : (typeof maybeIdx === 'number' ? maybeIdx : parseInt(eOrIdx, 10));
    const pageIndexToDelete = isNaN(rawIdx) ? 0 : rawIdx;

    if (pages.length <= 1) {
      // Clear project if deleting the last page
      setRoomsByPage({});
      setDoorsByPage({});
      setWallsByPage({});
      setRoofsByPage({});
      setLintelsByPage({});
      setScalesByPage({});
      if (setDefaultScale) setDefaultScale(null);
      setWasteByPage({});
      setPdfOffsetsByPage({});
      if (setAnnotationsByPage) setAnnotationsByPage({});
      if (setFloorCeilingTakeoffData) setFloorCeilingTakeoffData(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ezefloor:clear_floor_ceiling_scan"));
        window.dispatchEvent(new CustomEvent("sync-floor-ceiling-insulation-clear"));
      }
      setPages([]);
      setCurrentPage(0);
      setImage(null);
      setImgSize({ w: 0, h: 0 });
      clearWorkspaceState("active_session");
      return;
    }

    const deletedPage = pages[pageIndexToDelete];
    const isFCPage = Boolean(
      deletedPage?.isFloorCeilingWorkspace ||
      deletedPage?.source === "floor_ceiling_page" ||
      deletedPage?.source === "floor_ceiling_workspace" ||
      deletedPage?.code === "FC"
    );

    // If deleting the Floor & Ceiling page OR deleting any level in a project that has FC:
    // clear the scan result and takeoff data completely so stale values are not retained
    if (isFCPage || pages.some(p => p?.isFloorCeilingWorkspace || p?.source === "floor_ceiling_page")) {
      if (setFloorCeilingTakeoffData) setFloorCeilingTakeoffData(null);
      try {
        sessionStorage.removeItem("floor_ceiling_workspace");
        sessionStorage.removeItem("fc_workspace_state");
        localStorage.removeItem("floor_ceiling_workspace");
      } catch (_) { }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ezefloor:clear_floor_ceiling_scan", {
          detail: { pageIndex: pageIndexToDelete, pageId: deletedPage?.id }
        }));
        window.dispatchEvent(new CustomEvent("sync-floor-ceiling-insulation-clear"));
      }
    }

    // Filter out the deleted page
    const newPages = pages.filter((_, i) => i !== pageIndexToDelete);
    setPages(newPages);

    // Shift data maps
    const shiftMap = (mapObj) => {
      if (!mapObj) return {};
      const newMap = {};
      Object.keys(mapObj).forEach(key => {
        const i = parseInt(key);
        if (i < pageIndexToDelete) newMap[i] = mapObj[i];
        if (i > pageIndexToDelete) newMap[i - 1] = mapObj[i];
      });
      return newMap;
    };

    setRoomsByPage(shiftMap(roomsByPage));
    setWallsByPage(shiftMap(wallsByPage));
    setDoorsByPage(shiftMap(doorsByPage));
    setRoofsByPage(shiftMap(roofsByPage));
    setLintelsByPage(shiftMap(lintelsByPage));
    setScalesByPage(shiftMap(scalesByPage));
    setWasteByPage(shiftMap(wasteByPage));
    setPdfOffsetsByPage(shiftMap(pdfOffsetsByPage));
    if (setAnnotationsByPage) setAnnotationsByPage(shiftMap(annotationsByPage));

    // Update current page if needed
    if (currentPage === pageIndexToDelete) {
      const nextIdx = Math.max(0, currentPage - 1);
      setCurrentPage(nextIdx);
      setImage(newPages[nextIdx].image);
      setImgSize({ w: newPages[nextIdx].w, h: newPages[nextIdx].h });
    } else if (currentPage > pageIndexToDelete) {
      setCurrentPage(currentPage - 1);
    }
  };



  function getClassId(type) {
    if (type === "dry") return 0;
    if (type === "wet") return 1;
    if (type === "timber_deck") return 2;
    if (type === "tile_deck") return 3;
    return -1;
  }

  function validateRooms() {
    for (let r of rooms) {
      if (getClassId(r.type) === -1) {
        alert(`Room "${r.room_name}" have invalid room type.`);
        return false;
      }
    }
    return true;
  }

  // === DOCUMENT CONTROLLER ===
  const { loadPDF, currentPdfFile, isExportingPdfText, exportPDFNativeText, rotatePlan90, updateRoom, addTrain, addTrainPages, exportPDF, exportWallLabels, exportDoorWindowLabels, exportRoomLabels } = useDocumentController({
    image, setImage,
    imgSize, setImgSize,
    pages, setPages,
    currentPage, setCurrentPage,
    roomsByPage, setRoomsByPage,
    wallsByPage, setWallsByPage,
    doorsByPage, setDoorsByPage,
    roofsByPage, setRoofsByPage,
    lintelsByPage, setLintelsByPage,
    user,
    currentProjectName,
    realScale,
    scaleValue,
    pushHistory,
    fitToScreen,
    validateRooms,
    getClassId,
    WET_KEYWORDS,
    DRY_KEYWORDS,
    selectedId,
    setPendingPages,
    setShowImportPageSelector,
    setImportSelectedPages,
    setIsAddingPagesMode,
    roiRect
  });

  const selectedRoom = rooms.find(r => r.id === selectedId);

  if (!isLoggedIn) {
    return (
      <LoginView
        authData={authData}
        setAuthData={setAuthData}
        isSignup={isSignup}
        setIsSignup={setIsSignup}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        isLocked={isLocked}
        handleLogin={handleLogin}
        ssoLoading={ssoLoading}
        ssoStatusText={ssoStatusText}
      />
    );
  }

  return (
    <div className="cad-root">
      <RibbonView
        currentPage={currentPage}
        drawing={drawing} setDrawing={setDrawing}
        createDefaultExtEnvelope={createDefaultExtEnvelope}
        autoFitExtEnvelope={autoFitExtEnvelope}
        isDrawingDoor={isDrawingDoor} setIsDrawingDoor={setIsDrawingDoor}
        showPenetrations={showPenetrations} setShowPenetrations={setShowPenetrations}
        doorController={doorController}
        lintelController={lintelController}
        isDrawingRoof={isDrawingRoof} setIsDrawingRoof={setIsDrawingRoof}
        generateRoofFromWalls={generateRoofFromWalls}
        selectedRoofId={selectedRoofId}
        setSelectedRoofId={setSelectedRoofId}
        setSelectedId={setSelectedId}
        setSelectedType={setSelectedType}
        isMeasuring={isMeasuring} setIsMeasuring={setIsMeasuring} setMeasurePoints={setMeasurePoints}
        isDistancing={isDistancing} setIsDistancing={setIsDistancing} setDistancePoints={setDistancePoints} setDistanceResults={setDistanceResults}
        isSnapMode={isSnapMode} setIsSnapMode={setIsSnapMode}
        isWallSnapEnabled={isWallSnapEnabled} setIsWallSnapEnabled={setIsWallSnapEnabled}
        isAddingPoint={isAddingPoint} setIsAddingPoint={setIsAddingPoint}
        interactionMode={interactionMode} setInteractionMode={setInteractionMode}
        scaleValue={scaleValue}
        rooms={rooms}
        isDetecting={isDetecting}
        roiProgress={roiProgress}
        cacheStatus={cacheStatus}
        inferenceTiming={inferenceTiming}
        cancelROI={cancelROI}
        showBOQ={showBOQ} setShowBOQ={setShowBOQ}
        show3D={workspaceMode === "3d"} setShow3D={setShow3D}
        workspaceMode={workspaceMode} setWorkspaceMode={handleSetWorkspaceMode}
        layerVisibility={layerVisibility} setLayerVisibility={setLayerVisibility}
        handleLogout={handleLogout}
        handleSaveJob={handleSaveJob}
        undo={undo} redo={redo}
        deleteItem={deleteItem} deleteAllRooms={deleteAllRooms}
        autoMergeCollinearWalls={autoMergeCollinearWalls}
        snapAllDoorsToWalls={snapAllDoorsToWalls}
        finishPolygon={finishPolygon} finishRoof={finishRoof} setCurrentPoly={setCurrentPoly}
        autoDetect={autoDetect} detectWallFromFloorAI={detectWallFromFloorAI} detectText={detectText} detectTemplate={detectTemplate} detectDoorSeg={detectDoorSeg} detectRoof={detectRoof}
        smartDetect={smartDetect} cancelSmartDetect={cancelSmartDetect} isSmartDetecting={isSmartDetecting} smartProgress={smartProgress}
        generateRoomsFromWalls={generateRoomsFromWalls}
        roiRect={roiRect} roiMode={roiMode} setRoiMode={setRoiMode} roiUpscale={roiUpscale} clearROI={clearROI}
        exportPDF={exportPDF}
        currentPdfFile={currentPdfFile}
        isExportingPdfText={isExportingPdfText}
        exportPDFNativeText={exportPDFNativeText}
        addTrain={addTrain}
        addTrainPages={addTrainPages}
        exportWallLabels={exportWallLabels}
        exportDoorWindowLabels={exportDoorWindowLabels}
        exportRoomLabels={exportRoomLabels}
        showExportPageSelector={showExportPageSelector}
        setShowExportPageSelector={setShowExportPageSelector}
        exportSelectedPages={exportSelectedPages}
        setExportSelectedPages={setExportSelectedPages}
        showImportPageSelector={showImportPageSelector}
        setShowImportPageSelector={setShowImportPageSelector}
        importSelectedPages={importSelectedPages}
        setImportSelectedPages={setImportSelectedPages}
        pendingPages={pendingPages}
        setPendingPages={setPendingPages}
        confirmImport={confirmImport}
        isAddingPagesMode={isAddingPagesMode}
        setIsAddingPagesMode={setIsAddingPagesMode}
        fitToScreen={fitToScreen} rotatePlan90={rotatePlan90} goPage={goPage}
        loadPDF={loadPDF} setImage={setImage} setImgSize={setImgSize}
        searchResultsVisible={searchResultsVisible}
        setSearchResultsVisible={setSearchResultsVisible}
        clearSearch={clearSearch}
        runROISearch={runROISearch}
        showPDF={showPDF}
        setShowPDF={setShowPDF}
        lastAutoSaveTime={lastAutoSaveTime}
        isAutoSaving={isAutoSaving}
        exportRoofInput={exportRoofInput}
        importTarget={importTarget}
        setImportTarget={setImportTarget}
      />

      {activeTab === "Admin" ? (
        <UserManagement onLoadJob={handleLoadJob} />
      ) : activeTab === "Saved Jobs" ? (
        <JobHistory
          username={user?.username}
          onLoadJob={handleLoadJob}
        />
      ) : (
        <div className="cad-body">
          {workspaceMode !== "3d" && (
            <LeftRailView
              interactionMode={interactionMode}
              setInteractionMode={setInteractionMode}
              drawing={drawing}
              setDrawing={setDrawing}
              isMeasuring={isMeasuring}
              setIsMeasuring={setIsMeasuring}
              setMeasurePoints={setMeasurePoints}
              isDistancing={isDistancing}
              setIsDistancing={setIsDistancing}
              setDistancePoints={setDistancePoints}
              isDrawingRoof={isDrawingRoof}
              setIsDrawingRoof={setIsDrawingRoof}
              showPenetrations={showPenetrations}
              doorController={doorController}
              lintelController={lintelController}
              setIsDrawingDoor={setIsDrawingDoor}
              setSelectedRoofId={setSelectedRoofId}
              setSelectedId={setSelectedId}
              setSelectedType={setSelectedType}
              setCurrentPoly={setCurrentPoly}
              pages={pages}
              currentPage={currentPage}
              onPageClick={goPage}
              roomsByPage={roomsByPage}
              onAddFloorClick={openAddPagesSelector}
              onDeleteFloor={handleDeletePage}
              levels={levels}
              setLevels={setLevels}
              currentLevelIndex={currentLevelIndex}
              setCurrentLevelIndex={setCurrentLevelIndex}
              onOpenFloorCeilingModal={() => setShowFloorCeilingModal(true)}
            />
          )}

          {showPenetrations && workspaceMode !== "3d" && (
            <div
              style={{
                opacity: currentDoor && currentDoor.length > 0 ? 0.15 : 1,
                pointerEvents: currentDoor && currentDoor.length > 0 ? 'none' : 'auto',
                transition: 'opacity 0.25s ease-in-out, transform 0.25s ease-in-out',
                zIndex: 10,
                display: 'flex',
                height: '100%'
              }}
            >
              <DoorTypePanel
                onSelectPreset={(preset) => {
                  if (doorController) {
                    doorController.startDoorDraw();
                    doorController.setDoorPreset(preset);
                    if (preset) {
                      const isWindow = preset.renderClass === 'window' || preset.class === 'window' || preset.id?.startsWith('win_');
                      doorController.setDoorPanelMode(isWindow ? 'window' : 'door');
                    }
                  } else {
                    setDoorPreset(preset);
                    setIsDrawingDoor(true);
                  }
                }}
                activePreset={doorPreset}
                mode={doorController?.doorPanelMode || 'door'}
              />
            </div>
          )}

          {/* ── 2D / 3D DUAL WORKSPACE CONTAINER ── */}
          <div
            className="cad-workspace-split-container"
            style={{
              display: "flex",
              flex: 1,
              width: "100%",
              height: "100%",
              overflow: "hidden",
              position: "relative"
            }}
          >
            {/* ── 2D WORKSPACE PANEL ── */}
            {(workspaceMode === "2d" || workspaceMode === "split") && (
              <div
                className="cad-workspace-panel"
                style={{
                  width: workspaceMode === "split" ? `${splitRatio}%` : "100%",
                  flexShrink: 0
                }}
              >
                {/* 2D Workspace Badge & Focus/Fullscreen button */}
                <div className="cad-workspace-badge">
                  <span>▦ 2D Floorplan</span>
                  <button
                    onClick={() => handleSetWorkspaceMode(workspaceMode === "2d" ? "split" : "2d")}
                    title={workspaceMode === "2d" ? "Return to split view (Split View)" : "Maximize 2D (Maximize 2D)"}
                  >
                    {workspaceMode === "2d" ? "◫" : "⛶"}
                  </button>
                </div>

                <div className="cad-canvas-container" style={{ width: "100%", height: "100%" }}>
                  {/* 2 PHẦN CỐ ĐỊNH CHỨA PDF (CLADDING & EAVES) THẾ CHỖ CHO THANH NGANG CŨ */}
                  <PdfModuleTabBarView
                    pages={pages}
                    setPages={setPages}
                    currentPage={currentPage}
                    onPageClick={goPage}
                    activeCategory={activePdfCategory}
                    setActiveCategory={setActivePdfCategory}
                    onAddPagesClick={(file, cat) => openAddPagesSelector(file, cat, "pdf_tools")}
                    onOpenFloorCeilingModal={() => setShowFloorCeilingModal(true)}
                    onOpenImportSelector={() => {
                      if (setImportTarget) setImportTarget("pdf_tools");
                      if (setIsAddingPagesMode) setIsAddingPagesMode(true);
                      if ((!pendingPages || pendingPages.length === 0) && pages.length > 0) {
                        const seen = new Set();
                        const uniqueList = [];
                        pages.forEach((p, i) => {
                          const key = p.pageNumber || p.image || i;
                          if (!seen.has(key)) {
                            seen.add(key);
                            uniqueList.push({
                              id: p.id,
                              image: p.image,
                              w: p.w,
                              h: p.h,
                              fileName: p.fileName || "PDF",
                              pageNumber: p.pageNumber || (uniqueList.length + 1)
                            });
                          }
                        });
                        if (uniqueList.length > 0) {
                          setPendingPages(uniqueList);
                          setImportSelectedPages(uniqueList.map((_, i) => i));
                        }
                      } else if (pendingPages && pendingPages.length > 0) {
                        setImportSelectedPages(pendingPages.map((_, i) => i));
                      }
                      setShowImportPageSelector(true);
                    }}
                    onDeletePage={handleDeletePage}
                  />
                  <CanvasView
                    svgRef={svgRef}
                    image={image}
                    imgSize={imgSize}
                    offset={offset}
                    scale={scale}
                    fitToScreen={fitToScreen}
                    drawing={drawing}
                    isDrawingDoor={isDrawingDoor}
                    isDrawingRoof={isDrawingRoof}
                    roofInteractionState={roofInteractionState}
                    selectedRoofId={selectedRoofId}
                    setSelectedRoofId={setSelectedRoofId}
                    hoveredRoofTarget={hoveredRoofTarget}
                    updateRoofPitch={updateRoofPitch}
                    updateRoofType={updateRoofType}
                    updateRoofEdgeAngle={updateRoofEdgeAngle}
                    updateRoofEdgeOverhang={updateRoofEdgeOverhang}
                    updateRoofEdgeHeelHeight={updateRoofEdgeHeelHeight}
                    setRoofEdgeMode={setRoofEdgeMode}
                    toggleDutchEdge={toggleDutchEdge}
                    updateDutchOverhang={updateDutchOverhang}
                    updateDutchCutPoints={updateDutchCutPoints}
                    trimRoofEdge={trimRoofEdge}
                    setRoofInteractionState={setRoofInteractionState}
                    setRoofEaveEdge={setRoofEaveEdge}
                    deleteRoof={deleteRoof}
                    exportRoofInput={exportRoofInput}
                    roofs={roofsByPage[currentPage] || []}
                    currentPoly={currentPoly}
                    currentDoor={currentDoor}
                    currentMouse={currentMouse}
                    rooms={rooms}
                    walls={wallsByPage[currentPage] || []}
                    underlayWalls={currentPage > 0 ? (wallsByPage[currentPage - 1] || []) : []}
                    snapAlignPoints={snapAlignPoints}
                    setSnapAlignPoints={setSnapAlignPoints}
                    doors={processedDoorsByPage[currentPage] || []}
                    pdfOffset={pdfOffsetsByPage[currentPage] || { x: 0, y: 0 }}
                    setPdfOffsetsByPage={setPdfOffsetsByPage}
                    scaleValue={scaleValue}
                    realScale={realScale}
                    highlightType={highlightType}
                    selectedId={selectedId}
                    setSelectedId={setSelectedId}
                    selectedType={selectedType}
                    setSelectedType={setSelectedType}
                    selectedPointIndex={selectedPointIndex}
                    setSelectedPointIndex={setSelectedPointIndex}
                    selectedWallIds={selectedWallIds}
                    setSelectedWallIds={setSelectedWallIds}
                    selectedDoorIds={selectedDoorIds}
                    setSelectedDoorIds={setSelectedDoorIds}
                    selectedRoomIds={selectedRoomIds}
                    setSelectedRoomIds={setSelectedRoomIds}
                    selectedLintelIds={selectedLintelIds}
                    setSelectedLintelIds={setSelectedLintelIds}
                    selectWall={selectWall}
                    selectDoor={selectDoor}
                    cutPreviewPoint={cutPreviewPoint}
                    interactionMode={interactionMode}
                    setInteractionMode={setInteractionMode}
                    hoverId={hoverId}
                    setHoverId={setHoverId}
                    layerVisibility={layerVisibility}
                    hiddenItemIds={hiddenItemIds}
                    isPanning={isPanning}
                    isDistancing={isDistancing}
                    setIsDistancing={setIsDistancing}
                    setDistancePoints={setDistancePoints}
                    isMeasuring={isMeasuring}
                    isAddingPoint={isAddingPoint}
                    measurePoints={measurePoints}
                    distancePoints={distancePoints}
                    distanceResults={distanceResults}
                    setDistanceResults={setDistanceResults}
                    hoveredDistIdx={hoveredDistIdx}
                    setHoveredDistIdx={setHoveredDistIdx}
                    isShiftDown={isShiftDown}
                    isSnapMode={isSnapMode}
                    isWallSnapEnabled={isWallSnapEnabled}
                    setIsWallSnapEnabled={setIsWallSnapEnabled}
                    setDrawingWall={setDrawingWall}
                    setDrawingWallEnd={setDrawingWallEnd}
                    straightenWall={straightenWall}
                    rect={rect}
                    roiRect={roiRect}
                    roiProgress={roiProgress}
                    cacheStatus={cacheStatus}
                    inferenceTiming={inferenceTiming}
                    isDetecting={isDetecting}
                    activeScanRoom={activeScanRoom}
                    cancelROI={cancelROI}
                    clearROI={clearROI}
                    setOffset={setOffset}
                    setScale={setScale}
                    currentPage={currentPage}
                    pages={pages}
                    handleClick={handleClick}
                    handleRoomDoubleClick={handleRoomDoubleClick}
                    finishPolygon={finishPolygon}
                    finishRoof={finishRoof}
                    finishDoor={finishDoor}
                    onMouseMove={onMouseMove}
                    onMouseDown={onMouseDown}
                    onMouseUp={onMouseUp}
                    onWheel={onWheel}
                    startDrag={startDrag}
                    dragging={dragging}
                    pushHistory={pushHistory}
                    updateDoor={updateDoor}
                    deleteDoor={deleteDoor}
                    doorController={doorController}
                    deleteWalls={deleteWalls}
                    autoMergeCollinearWalls={autoMergeCollinearWalls}
                    updateWallsProperty={updateWallsProperty}
                    pullStepPreview={pullStepPreview}
                    setPullStepInfo={setPullStepInfo}
                    extRectStart={extRectStart}
                    setExtRectStart={setExtRectStart}
                    searchResults={searchResults}
                    searchResultsVisible={searchResultsVisible}
                    hoveredSearchResultId={hoveredSearchResultId}
                    zoomToBbox={zoomToBbox}
                    showPDF={showPDF}
                    setShowPDF={setShowPDF}
                    selectedWallVertex={selectedWallVertex}
                    setSelectedWallVertex={setSelectedWallVertex}
                    drawingWall={drawingWall}
                    drawingWallEnd={drawingWallEnd}
                    handleWallDoubleClick={handleWallDoubleClick}
                    vertexMenu={vertexMenu}
                    setVertexMenu={setVertexMenu}
                    wallBodyMenu={wallBodyMenu}
                    setWallBodyMenu={setWallBodyMenu}
                    isWallMergeDisabled={isWallMergeDisabled}
                    setIsWallMergeDisabled={setIsWallMergeDisabled}
                    startDrawWallFromVertex={startDrawWallFromVertex}
                    separateJunction={separateJunction}
                    selectedVertices={selectedVertices}
                    setSelectedVertices={setSelectedVertices}
                    startVertexMove={startVertexMove}
                    lintelController={lintelController}
                    isDrawingLintel={isDrawingLintel}
                    lintelPreview={lintelPreview}
                    onDeletePage={handleDeletePage}
                  />
                </div>
              </div>
            )}

            {/* ── DRAGGABLE SPLIT DIVIDER ── */}
            {workspaceMode === "split" && (
              <div
                className={`cad-split-divider ${isDraggingSplit ? "dragging" : ""}`}
                onMouseDown={handleSplitMouseDown}
                onDoubleClick={() => setSplitRatio(70)}
                title="Drag left/right to adjust the ratio (Double-click to reset to 70/30)"
              />
            )}

            {/* ── 3D WORKSPACE PANEL (only in split mode) ── */}
            {workspaceMode === "split" && (
              <div
                className="cad-workspace-panel"
                style={{
                  width: `${100 - splitRatio}%`,
                  flexShrink: 0,
                  flexGrow: 1
                }}
              >
                {/* 3D Workspace Badge & Popout button */}
                <div className="cad-workspace-badge" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>🧊 3D View</span>
                  <button
                    onClick={() => {
                      handlePopout3D();
                      handleSetWorkspaceMode("2d");
                    }}
                    title="Pop out 3D Studio into a separate window and switch to 2D only"
                    style={{
                      padding: "2px 7px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: 700,
                      background: "rgba(59, 130, 246, 0.1)",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      color: "#2563eb",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "3px"
                    }}
                  >
                    ⧉ Pop out
                  </button>
                  <button
                    onClick={() => handleSetWorkspaceMode("2d")}
                    title="Close 3D panel"
                  >
                    ✕
                  </button>
                </div>

                <ThreeDView
                  pages={pages}
                  wallsByPage={wallsByPage}
                  setWallsByPage={setWallsByPage}
                  doorsByPage={processedDoorsByPage}
                  setDoorsByPage={setDoorsByPage}
                  updateDoor={updateDoor}
                  roomsByPage={roomsByPage}
                  roofsByPage={roofsByPage}
                  currentPage={
                    (pages[currentPage]?.category || pages[currentPage]?.source === "pdf_tools" || pages[currentPage]?.is_pdf_tool)
                      ? (pages.findIndex(p => !p.category && p.source !== "pdf_tools" && !p.is_pdf_tool) >= 0
                        ? pages.findIndex(p => !p.category && p.source !== "pdf_tools" && !p.is_pdf_tool)
                        : 0)
                      : currentPage
                  }
                  realScale={realScale}
                  image={
                    (pages[currentPage]?.category || pages[currentPage]?.source === "pdf_tools" || pages[currentPage]?.is_pdf_tool)
                      ? (pages.find(p => !p.category && p.source !== "pdf_tools" && !p.is_pdf_tool)?.image || null)
                      : image
                  }
                  imgSize={imgSize}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  setSelectedType={setSelectedType}
                  onClose={() => handleSetWorkspaceMode("2d")}
                />
              </div>
            )}
          </div>

          {workspaceMode !== "3d" && (
            activeTab === "Search" ? (
              <SearchSidebarView
                searchResults={searchResults}
                setSearchResults={setSearchResults}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchThreshold={searchThreshold}
                setSearchThreshold={setSearchThreshold}
                searchScope={searchScope}
                setSearchScope={setSearchScope}
                isSearching={isSearching}
                setIsSearching={setIsSearching}
                searchCountData={searchCountData}
                setSearchCountData={setSearchCountData}
                searchResultsVisible={searchResultsVisible}
                setSearchResultsVisible={setSearchResultsVisible}
                currentPage={currentPage}
                currentJobId={currentJobId}
                projectName={currentProjectName}
                selectedId={selectedId}
                selectedType={selectedType}
                roiRect={roiRect}
                clearROI={clearROI}
                zoomToBbox={zoomToBbox}
                setHoveredSearchResultId={setHoveredSearchResultId}
              />
            ) : (
              <RightPropertyPaneView
                selectedRoom={rooms.find(r => r.id === selectedId)}
                selectedWall={(wallsByPage[currentPage] || []).find(w => w.id === selectedId || getBaseWallId(w.id) === getBaseWallId(selectedId))}
                selectedDoor={(processedDoorsByPage[currentPage] || []).find(d => d.id === selectedId) || (processedDoorsByPage[currentPage] || []).find(d => (selectedDoorIds || []).includes(d.id))}
                selectedType={selectedType}
                selectedPointIndex={selectedPointIndex}
                updateRoom={updateRoom}
                updateDoor={updateDoor}
                deleteDoor={deleteDoor}
                deleteDoors={deleteDoors}
                scaleValue={scaleValue}
                realScale={realScale}
                scalesByPage={scalesByPage}
                rooms={rooms}
                highlightType={highlightType}
                setHighlightType={setHighlightType}
                selectedWallIds={selectedWallIds}
                setSelectedWallIds={setSelectedWallIds}
                selectedDoorIds={selectedDoorIds}
                setSelectedDoorIds={setSelectedDoorIds}
                selectedRoomIds={selectedRoomIds}
                setSelectedRoomIds={setSelectedRoomIds}
                selectedLintelIds={selectedLintelIds}
                setSelectedLintelIds={setSelectedLintelIds}
                setSelectedType={setSelectedType}
                setSelectedId={setSelectedId}
                selectDoor={selectDoor}
                updateDoorsProperty={updateDoorsProperty}
                updateWallsProperty={updateWallsProperty}
                deleteWalls={deleteWalls}
                interactionMode={interactionMode}
                setInteractionMode={setInteractionMode}
                pxToMm={pxToMm}
                autoMergeCollinearWalls={autoMergeCollinearWalls}
                walls={wallsByPage[currentPage] || []}
                doors={processedDoorsByPage[currentPage] || []}
                selectedRoofId={selectedRoofId}
                setSelectedRoofId={setSelectedRoofId}
                updateRoofPitch={updateRoofPitch}
                updateRoofType={updateRoofType}
                updateRoofEdgeAngle={updateRoofEdgeAngle}
                updateRoofEdgeOverhang={updateRoofEdgeOverhang}
                updateRoofEdgeHeelHeight={updateRoofEdgeHeelHeight}
                setRoofEdgeMode={setRoofEdgeMode}
                toggleDutchEdge={toggleDutchEdge}
                setRoofInteractionState={setRoofInteractionState}
                updateDutchOverhang={updateDutchOverhang}
                updateDutchRakeOverhang={updateDutchRakeOverhang}
                updateDutchCutPoints={updateDutchCutPoints}
                computeSelectedRoof={computeSelectedRoof}
                trimRoofEdge={trimRoofEdge}
                isComputingRoof={isComputingRoof}
                setRoofEaveEdge={setRoofEaveEdge}
                selectedRoofEdgeIndex={selectedRoofEdgeIndex}
                setSelectedRoofEdgeIndex={setSelectedRoofEdgeIndex}
                applyDefaultPitchToAll={applyDefaultPitchToAll}
                applyDefaultOverhangToAll={applyDefaultOverhangToAll}
                applyDefaultHeelHeightToAll={applyDefaultHeelHeightToAll}
                applyDefaultSettingsToAll={applyDefaultSettingsToAll}
                deleteRoof={deleteRoof}
                deleteRoofVertex={deleteRoofVertex}
                exportRoofIO={exportRoofIO}
                exportRoofInput={exportRoofInput}
                generateRoofFromWalls={generateRoofFromWalls}
                setShow3D={setShow3D}
                lintelController={lintelController}
                selectedId={selectedId}
                onLoadJob={handleLoadJob}
                loadPDF={loadPDF}
                setPendingPages={setPendingPages}
                setImportSelectedPages={setImportSelectedPages}
                setIsAddingPagesMode={setIsAddingPagesMode}
                setShowImportPageSelector={setShowImportPageSelector}
                pages={pages}
                currentPdfFile={currentPdfFile}
                currentPage={currentPage}
                setCurrentPage={goPage}
                goPage={goPage}
                zoomToBbox={zoomToBbox}
                currentProjectName={currentProjectName}
                wallsByPage={wallsByPage}
                doorsByPage={processedDoorsByPage}
                roomsByPage={roomsByPage}
                setRoomsByPage={setRoomsByPage}
                lintelsByPage={lintelsByPage}
                roofsByPage={roofsByPage}
                hiddenItemIds={hiddenItemIds}
                setHiddenItemIds={setHiddenItemIds}
                toggleItemVisibility={toggleItemVisibility}
                layerVisibility={layerVisibility}
                setLayerVisibility={setLayerVisibility}
                deleteItem={deleteItem}
                selectWall={selectWall}
                pushTaskHistory={pushTaskHistory}
              />
            )
          )}
          <AIConfidenceBar />
        </div>
      )}

      {showBOQ && (
        <>
          <div className="boq-overlay" onClick={() => setShowBOQ(false)} />
          <div className="boq-panel">
            <div className="boq-header">
              <h3>📊 BOQ – Enterprise</h3>
              <button className="boq-close-btn" onClick={() => setShowBOQ(false)}>✕ Close</button>
            </div>
            {Object.keys(scalesByPage).length > 0 || defaultScale ? (
              <BOQTable
                pages={boqPages}
                doors={allDoors}
                scalesByPage={scalesByPage}
                defaultScale={defaultScale}
                wasteInternal={wasteByPage[currentPage]?.internal ?? 10}
                wasteExternal={wasteByPage[currentPage]?.external ?? 15}
                initialPageIndex={currentPage}
              />
            ) : (
              <div style={{ padding: 20 }}>Please calibrate scale before viewing BOQ.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
