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
import React, { useState, useRef, useEffect, useMemo } from "react";
import * as pdfjsLib from "pdfjs-dist";
import dynamic from "next/dynamic";
import { polygonAreaM2 as polygonAreaM2Util, centroid, distancePointToSegment, pointInPolygon, getBaseWallId } from "@/utils/geometry";
import LoginView from "@/views/LoginView";
import RibbonView from "@/views/RibbonView";
import RightPropertyPaneView from "@/views/RightPropertyPaneView";
import CanvasView from "@/views/CanvasView";
import SearchSidebarView from "@/views/SearchSidebarView";
import ThumbnailSidebarView from "@/views/ThumbnailSidebarView";
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

export default function App() {
  const svgRef = useRef(null);
  const panStart = useRef(null);

  // === MODEL (State from Context) ===
  const {
    pages, setPages,
    currentPage, setCurrentPage,
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
    currentJobId, setCurrentJobId
  } = useAppModel();

  // === LOCAL UI STATE (View-specific) ===
  const [image, setImage] = useState(null);
  const [showPDF, setShowPDF] = useState(true);

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
  const [show3D, setShow3D] = useState(false);
  const [showLayer, setShowLayer] = useState("all"); // 'all', 'floor'
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
    hoveredRoofTarget, setHoveredRoofTarget,
    updateRoofPitch, updateRoofType, deleteRoof,
    undoRoof, redoRoof,
    currentPoly, setCurrentPoly,
    currentDoor, setCurrentDoor,
    currentMouse,
    doorPreset, setDoorPreset,
    history, future,
    pushHistory, undo, redo,
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
    selectedPointIndex,
    selectedWallIds,
    cutPreviewPoint,
    selectWall,
    deleteWalls,
    updateWallsProperty,
    pxToMm,
    scaleValue,
    roiRect, setRoiRect, roiMode, setRoiMode, roiUpscale, setRoiUpscale,
    interactionMode, setInteractionMode, clearROI,
    handleClick, finishPolygon, finishRoof, finishDoor, updateDoor, deleteDoor,
    startDrag, dragging, onMouseMove, onMouseDown, onMouseUp, onWheel,
    autoMergeCollinearWalls,
    handleWallDoubleClick,
    snapAllDoorsToWalls,
    selectedWallVertex, setSelectedWallVertex,
    drawingWall, setDrawingWall,
    drawingWallEnd, setDrawingWallEnd,
    doorController, // also expose the controller itself if needed
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
    startVertexMove
  } = useInteractionController(svgRef);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes("/share/")) {
      const token = path.split("/share/")[1];
      if (token) {
        loadSharedProject(token);
      }
    }
  }, []);

  const loadSharedProject = async (token) => {
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
  };

  const rooms = Array.isArray(roomsByPage[currentPage]) ? roomsByPage[currentPage] : [];




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

  const boqPages = useMemo(() =>
    pages.map((p, idx) => ({
      ...p,
      objects: Array.isArray(roomsByPage[idx]) ? roomsByPage[idx] : [],
      doors: Array.isArray(processedDoorsByPage[idx]) ? processedDoorsByPage[idx] : []
    })),
    [pages, roomsByPage, processedDoorsByPage]
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
  } = useAIController(image, currentPage, setRoomsByPage, realScale, roomsByPage, setDoorsByPage, setWallsByPage, doorsByPage, wallsByPage, pushHistory);
  const { handleLogin: authLogin, handleLogout: authLogout } = useAuthController(user, setUser, setIsLoggedIn);
  const { handleSaveJob: apiSaveJob, handleLoadJob } = useProjectController(
    user, pages, roomsByPage, realScale, wasteByPage, setCurrentProjectName,
    setPages, setRoomsByPage, setRealScale, setWasteByPage, setCurrentPage, setImage, setImgSize, setActiveTab,
    currentJobId, setCurrentJobId, doorsByPage, setDoorsByPage, wallsByPage, setWallsByPage,
    pdfOffsetsByPage, setPdfOffsetsByPage,
    roofsByPage, setRoofsByPage
  );

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
      const isEditorTab = ["Home", "Measure", "AI & Reports", "View"].includes(prevTab);
      if (!isEditorTab) {
        setTimeout(zoomTo100, 100);
      }
    }
    prevTabRef.current = activeTab;
  }, [activeTab, image]);

  function fitToScreen() {
    const container = svgRef.current.parentElement;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scaleX = cw / imgSize.w;
    const scaleY = ch / imgSize.h;
    const newScale = Math.min(scaleX, scaleY);
    setScale(newScale);
    setOffset({
      x: (cw - imgSize.w * newScale) / 2,
      y: (ch - imgSize.h * newScale) / 2
    });
  }

  function zoomTo100() {
    const container = svgRef.current?.parentElement;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const newScale = 1.0;
    setScale(newScale);
    setOffset({
      x: (cw - imgSize.w * newScale) / 2,
      y: (ch - imgSize.h * newScale) / 2
    });
  }

  function goPage(index) {
    if (!pages[index]) return;
    setCurrentPage(index);
    setImage(pages[index].image);
    setImgSize({ w: pages[index].w, h: pages[index].h });
    setTimeout(fitToScreen, 50);
  }

  const zoomToBbox = (pageIndex, bbox) => {
    if (!pages[pageIndex]) return;

    if (currentPage !== pageIndex) {
      setCurrentPage(pageIndex);
      setImage(pages[pageIndex].image);
      setImgSize({ w: pages[pageIndex].w, h: pages[pageIndex].h });
    }

    setTimeout(() => {
      const container = svgRef.current?.parentElement;
      if (!container) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const [x1, y1, x2, y2] = bbox;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const bboxW = x2 - x1;
      const bboxH = y2 - y1;

      const scaleX = cw / (bboxW || 1);
      const scaleY = ch / (bboxH || 1);
      const newScale = Math.min(3.0, Math.max(1.0, Math.min(scaleX, scaleY) * 0.45));

      setScale(newScale);
      setOffset({
        x: cw / 2 - cx * newScale,
        y: ch / 2 - cy * newScale
      });
    }, currentPage !== pageIndex ? 150 : 20);
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

  function confirmImport() {
    if (importSelectedPages.length === 0) return;

    const selectedData = importSelectedPages.sort((a, b) => a - b).map(idx => pendingPages[idx]);

    if (isAddingPagesMode) {
      // Shifting existing page data to their new indices
      const newRoomsByPage = {};
      const newWallsByPage = {};
      const newDoorsByPage = {};

      selectedData.forEach((newPage, newIdx) => {
        const oldIdx = pages.findIndex(p => p.image === newPage.image);
        if (oldIdx !== -1) {
          if (roomsByPage[oldIdx]) newRoomsByPage[newIdx] = roomsByPage[oldIdx];
          if (wallsByPage[oldIdx]) newWallsByPage[newIdx] = wallsByPage[oldIdx];
          if (doorsByPage[oldIdx]) newDoorsByPage[newIdx] = doorsByPage[oldIdx];
        }
      });

      setRoomsByPage(newRoomsByPage);
      setWallsByPage(newWallsByPage);
      setDoorsByPage(newDoorsByPage);

      setPages(selectedData);

      const stillExists = selectedData.some(p => p.image === image);
      if (!stillExists) {
        setCurrentPage(0);
        setImage(selectedData[0].image);
        setImgSize({
          w: selectedData[0].w,
          h: selectedData[0].h
        });
      } else {
        const newCurrentIdx = selectedData.findIndex(p => p.image === image);
        if (newCurrentIdx !== -1) {
          setCurrentPage(newCurrentIdx);
        }
      }
    } else {
      // Clear ALL previous data when opening new file
      setRoomsByPage({});
      setDoorsByPage({});
      setWallsByPage({});

      setPages(selectedData);
      setCurrentPage(0);
      setImage(selectedData[0].image);
      setImgSize({
        w: selectedData[0].w,
        h: selectedData[0].h
      });
    }

    setShowImportPageSelector(false);
    setImportSelectedPages([]);
    setIsAddingPagesMode(false);

    setTimeout(fitToScreen, 100);
  }

  const openAddPagesSelector = () => {
    if (!pendingPages || pendingPages.length === 0) {
      alert("Không tìm thấy tệp gốc để thêm trang. Vui lòng tải lại tệp PDF!");
      return;
    }
    const currentIndices = pages.map(p => pendingPages.findIndex(pending => pending.image === p.image)).filter(idx => idx !== -1);
    setImportSelectedPages(currentIndices);
    setIsAddingPagesMode(true);
    setShowImportPageSelector(true);
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
        alert(`Room "${r.room_name}" có loại phòng không hợp lệ.`);
        return false;
      }
    }
    return true;
  }

  // === DOCUMENT CONTROLLER ===
  const { loadPDF, rotatePlan90, updateRoom, addTrain, addTrainPages, exportPDF, exportWallLabels } = useDocumentController({
    image, setImage,
    imgSize, setImgSize,
    pages, setPages,
    currentPage, setCurrentPage,
    roomsByPage, setRoomsByPage,
    wallsByPage,
    doorsByPage, setDoorsByPage,
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
        isDrawingRoof={isDrawingRoof} setIsDrawingRoof={setIsDrawingRoof}
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
        show3D={show3D} setShow3D={setShow3D}
        showLayer={showLayer} setShowLayer={setShowLayer}
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
        addTrain={addTrain}
        addTrainPages={addTrainPages}
        exportWallLabels={exportWallLabels}
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
          {!show3D && (
            <ThumbnailSidebarView
              pages={pages}
              setPages={setPages}
              currentPage={currentPage}
              onPageClick={goPage}
              roomsByPage={roomsByPage}
              onAddPagesClick={openAddPagesSelector}
            />
          )}

          {showPenetrations && !show3D && (
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

          {show3D ? (
            <ThreeDView
              pages={pages}
              wallsByPage={wallsByPage}
              setWallsByPage={setWallsByPage}
              doorsByPage={processedDoorsByPage}
              setDoorsByPage={setDoorsByPage}
              updateDoor={updateDoor}
              roomsByPage={roomsByPage}
              roofsByPage={roofsByPage}
              currentPage={currentPage}
              realScale={realScale}
              image={image}
              imgSize={imgSize}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              setSelectedType={setSelectedType}
              onClose={() => setShow3D(false)}
            />
          ) : (
            <CanvasView
              svgRef={svgRef}
              image={image}
              imgSize={imgSize}
              offset={offset}
              scale={scale}
              drawing={drawing}
              isDrawingDoor={isDrawingDoor}
              isDrawingRoof={isDrawingRoof}
              roofInteractionState={roofInteractionState}
              selectedRoofId={selectedRoofId}
              setSelectedRoofId={setSelectedRoofId}
              hoveredRoofTarget={hoveredRoofTarget}
              updateRoofPitch={updateRoofPitch}
              updateRoofType={updateRoofType}
              deleteRoof={deleteRoof}
              currentPoly={currentPoly}
              currentDoor={currentDoor}
              currentMouse={currentMouse}
              rooms={rooms}
              walls={wallsByPage[currentPage] || []}
              underlayWalls={currentPage > 0 ? (wallsByPage[currentPage - 1] || []) : []}
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
              selectedWallIds={selectedWallIds}
              selectWall={selectWall}
              cutPreviewPoint={cutPreviewPoint}
              interactionMode={interactionMode}
              setInteractionMode={setInteractionMode}
              hoverId={hoverId}
              setHoverId={setHoverId}
              showLayer={showLayer}
              isPanning={isPanning}
              isDistancing={isDistancing}
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
              setOffset={setOffset}
              setScale={setScale}
              currentPage={currentPage}
              pages={pages}
              handleClick={handleClick}
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
              setDrawingWall={setDrawingWall}
              drawingWallEnd={drawingWallEnd}
              setDrawingWallEnd={setDrawingWallEnd}
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
            />
          )}

          {!show3D && (
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
                selectedDoor={(processedDoorsByPage[currentPage] || []).find(d => d.id === selectedId)}
                selectedType={selectedType}
                selectedPointIndex={selectedPointIndex}
                updateRoom={updateRoom}
                updateDoor={updateDoor}
                deleteDoor={deleteDoor}
                scaleValue={scaleValue}
                realScale={realScale}
                rooms={rooms}
                highlightType={highlightType}
                setHighlightType={setHighlightType}
                selectedWallIds={selectedWallIds}
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
                deleteRoof={deleteRoof}
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
            {scaleValue ? (
              <BOQTable
                pages={boqPages}
                doors={allDoors}
                scaleValue={scaleValue}
                wasteInternal={wasteByPage[currentPage]?.internal ?? 10}
                wasteExternal={wasteByPage[currentPage]?.external ?? 15}
                initialPageIndex={currentPage}
              />
            ) : (
              <div style={{ padding: 20 }}>Vui lòng thiết lập Scale trước khi xem BOQ.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
