import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { polygonAreaM2 as polygonAreaM2Util, getWallClass, getBaseWallId, calcDoorWindowMetrics, getWallSideOffsets, mirrorPolygonAcrossLine, mirrorPolygonAcrossPerpendicular, mapFloorName, convertNameToClass, classifyWallsTouchingExtEndpoints } from "@/utils/geometry";
import { useAppModel } from "@/models/app.context";
import { useDialog } from "@/components/DialogContext";
import { ApiService, BASE_URL } from "@/models/api.service";
import { clearWorkspaceState } from "@/utils/workspaceStorage";
import {
  DOOR_TYPE_REGISTRY,
  getDoorTypeOptions,
  resolveDoorTypeId,
  HARDWARE_TYPES,
  MATERIAL_OPTIONS,
  FIRE_RATING_OPTIONS
} from '@/models/DoorTypeRegistry';
import { WALL_HEIGHT_OPTIONS } from '@/components/WallThicknessDialog';

import { computeWallAreas } from "@/engines/WallAreaCalculator";
import { getFinishTypeOptions, SKIRTING_MATERIALS, normalizeWallSurfaceAndSkirting } from "@/models/FinishRegistry";
import floorTypesConfig from "@/constants/floorTypes.json";
import RoofInspectorCard from "@/components/RoofInspectorCard";
import { roundLintelLength, syncLintelWithDoor } from "@/controllers/lintel.controller";
import * as CairnsHardwareTasks from "@/components/cairns-hardware/tasks";
import * as BunNswActTasks from "@/components/bun-nsw-act/tasks";
import * as AtsFtTasks from "@/components/ats-ft/tasks";
import * as BunSaTasks from "@/components/bun-sa/tasks";
import * as BunSeqldTasks from "@/components/bun-seqld/tasks";
import * as BunTasTasks from "@/components/bun-tas/tasks";
import * as BunVicTasks from "@/components/bun-vic/tasks";
import * as BunningsQldTasks from "@/components/bunnings-qld/tasks";
import { hasHwAccess, isFullAdmin, getDisplayRoleName } from "@/utils/permissions";
import {
  CUSTOMER_TASK_PACKS,
  HomeIcon,
  ExternalIcon,
  PolygonIcon,
  WasteIcon,
  GrandTotalIcon,
  InfoIcon,
  AreaSummaryIcon,
  SectionHeader,
  CollapsibleSection,
  SubheadingRow,
  KPICard,
  AreaCard,
  KPIRow,
  StatRow,
  MiniBar,
  SummaryCard,
  ExportButton,
  PitchInput,
  getDoorWindowDisplayWidthMm,
  getDoorWidthInMm,
  getDoorHeightInMm,
  EXTRA_MODULE_TABS,
  ALL_MODULE_IDS,
  normalizeCustomerKey,
  resolveCustomerPackKey,
  getCustomerModuleIds,
  sanitizeModuleIds,
  MODULE_KEY_MAP,
  normalizeModuleId,
  isSubtaskChecked,
  resolveTaskModules,
  getInitialEnabledModules,
  getCustomerFromPendingEmsJob
} from "./right-property-pane/UIComponents";
import {
  calculateRoomAreaM2,
  classifyRoomType,
  calculateWallMetrics,
  calculateTakeoffSummary
} from "@/engines/TakeoffSummaryEngine";
import TreeExplorerPanel from "./right-property-pane/TreeExplorerPanel";
import SummaryTakeoffPanel from "./right-property-pane/SummaryTakeoffPanel";
import TaskGroupsHwPanel from "./right-property-pane/TaskGroupsHwPanel";
import TaskModulesContainer from "./right-property-pane/TaskModulesContainer";
import RightPropertyTabBar from "./right-property-pane/RightPropertyTabBar";
import TakeoffExportModal from "./right-property-pane/TakeoffExportModal";
import WallPropertyPanel from "./right-property-pane/property-panels/WallPropertyPanel";
import DoorWindowPropertyPanel from "./right-property-pane/property-panels/DoorWindowPropertyPanel";
import RoomPropertyPanel from "./right-property-pane/property-panels/RoomPropertyPanel";
import RoofPropertyPanel from "./right-property-pane/property-panels/RoofPropertyPanel";
import LintelPropertyPanel from "./right-property-pane/property-panels/LintelPropertyPanel";
import AnnotationPropertyPanel from "./right-property-pane/property-panels/AnnotationPropertyPanel";
import { formatLintelCalloutText } from "../controllers/lintel.controller";

/* ================================================================
   MAIN PANEL
   ================================================================ */
export default function RightPropertyPaneView({
  selectedRoom, selectedWall, selectedDoor, selectedType, selectedPointIndex, updateRoom, updateDoor, deleteDoor, deleteDoors, scaleValue, realScale, rooms,
  highlightType, setHighlightType,
  selectedWallIds = [], setSelectedWallIds, setSelectedType, setSelectedId, updateWallsProperty, deleteWalls, selectDoor, updateDoorsProperty, interactionMode, setInteractionMode, pxToMm,
  selectedDoorIds = [], setSelectedDoorIds, selectedRoomIds = [], setSelectedRoomIds, selectedLintelIds = [], setSelectedLintelIds,
  autoMergeCollinearWalls,
  walls = [],
  doors = [],
  deleteItem,
  selectedRoofId,
  setSelectedRoofId,
  selectedRoofEdgeIndex,
  setSelectedRoofEdgeIndex,
  updateRoofPitch,
  applyDefaultPitchToAll,
  applyDefaultOverhangToAll,
  applyDefaultHeelHeightToAll,
  applyDefaultSettingsToAll,
  updateRoofType,
  updateRoofEdgeAngle,
  updateRoofEdgeOverhang,
  updateRoofEdgeHeelHeight,
  computeSelectedRoof,
  trimRoofEdge,
  isComputingRoof,
  setRoofEaveEdge,
  deleteRoof,
  deleteRoofVertex,
  exportRoofIO,
  exportRoofInput,
  setShow3D,
  lintelController,
  selectedId,
  onLoadJob,
  setRoofEdgeMode,
  toggleDutchEdge,
  setRoofInteractionState,
  updateDutchOverhang,
  updateDutchRakeOverhang,
  updateDutchCutPoints,
  generateRoofFromWalls,
  loadPDF,
  setPendingPages,
  setImportSelectedPages,
  setIsAddingPagesMode,
  setShowImportPageSelector,
  pages: pagesProp = [],
  setPages: setPagesProp,
  currentPage: currentPageProp,
  setCurrentPage: setCurrentPageProp,
  goPage,
  currentProjectName: currentProjectNameProp,
  wallsByPage: wallsByPageProp = {},
  doorsByPage: doorsByPageProp = {},
  roomsByPage: roomsByPageProp = {},
  setRoomsByPage,
  lintelsByPage: lintelsByPageProp,
  roofsByPage: roofsByPageProp,
  hiddenItemIds = new Set(),
  setHiddenItemIds,
  toggleItemVisibility,
  scalesByPage: scalesByPageProp = {},
  layerVisibility: layerVisibilityProp,
  setLayerVisibility: setLayerVisibilityProp,
  selectWall,
  onEditDoor,
  layerOrder, activeLayerTab, setActiveLayerTab, treeSearchQuery, setTreeSearchQuery, handleAutoGroupWalls
}) {
  const [defaultPitchInput, setDefaultPitchInput] = useState(22.5);
  const [defaultOverhangInput, setDefaultOverhangInput] = useState(0);
  const [defaultHeelHeightInput, setDefaultHeelHeightInput] = useState(0);
  const { showConfirm, showPrompt } = useDialog();
  const {
    pages: pagesContext,
    setPages: setPagesContext,
    wallsByPage: wallsByPageCtx, setWallsByPage: setWallsByPageCtx,
    doorsByPage: doorsByPageCtx, setDoorsByPage: setDoorsByPageCtx,
    wasteByPage, setWasteByPage,
    roofsByPage, setRoofsByPage,
    lintelsByPage, setLintelsByPage: setLintelsByPageCtx,
    trussesByPage, setTrussesByPage: setTrussesByPageCtx,
    scalesByPage: scalesByPageCtx, setScalesByPage: setScalesByPageCtx,
    currentPage,
    currentProjectName, setCurrentProjectName,
    currentJobId, setCurrentJobId,
    setActiveTab,
    user,
    setShowFrameworkModal,
    setShowAreaSummaryModal,
    setShowInsulationModal,
    showLockoutModal,
    setShowLockoutModal,
    annotationsByPage = {},
    setAnnotationsByPage,
    setAnnotationsHistory: setAnnotationsHistoryCtx,
    setAnnotationsFuture: setAnnotationsFutureCtx,
    selectedAnnotationId,
    setSelectedAnnotationId,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    setActiveAnnotationTool: setActiveAnnotationToolCtx,
    pushAnnotationHistory,
    setAnnotationColor,
    setAnnotationStrokeWidth,
    setAnnotationOpacity,
    setAnnotationFillOpacity,
    setAnnotationFillMode,
    setAnnotationFontSize,
    setTextColor,
    setTextOpacity,
    setTextFontSize,
    setTextBold,
    setTextItalic,
    setTextUnderline,
    setTextStrikethrough,
    setCalloutStrokeWidth,
    isCanvasMoving
  } = useAppModel();

  const selectedAnnotation = React.useMemo(() => {
    const list = annotationsByPage[currentPage] || [];
    if (selectedAnnotationId) {
      return list.find((a) => a.id === selectedAnnotationId) || null;
    }
    if (selectedAnnotationIds && selectedAnnotationIds.length > 0) {
      return list.find((a) => a.id === selectedAnnotationIds[selectedAnnotationIds.length - 1]) || null;
    }
    return null;
  }, [annotationsByPage, currentPage, selectedAnnotationId, selectedAnnotationIds]);

  const handleUpdateAnnotation = React.useCallback((annId, patch) => {
    if (typeof pushAnnotationHistory === "function") {
      pushAnnotationHistory(annotationsByPage);
    }
    const idsToUpdate = (selectedAnnotationIds && selectedAnnotationIds.includes(annId) && selectedAnnotationIds.length > 1)
      ? selectedAnnotationIds
      : [annId];

    if (setAnnotationsByPage) {
      setAnnotationsByPage((prev) => {
        const list = prev[currentPage] || [];
        return {
          ...prev,
          [currentPage]: list.map((a) => (idsToUpdate.includes(a.id) ? { ...a, ...patch } : a))
        };
      });
    }

    // Determine whether this is a text annotation or a drawing shape
    const currentList = annotationsByPage[currentPage] || [];
    const target = currentList.find((a) => a.id === annId);

    const isTextAnnotation = target && (target.type === "text" || target.type === "callout" || target.type === "sticky-note");

    if (target && target.type === "sticky-note") {
      // Sticky note: color is the note background color, not text color
      if (patch.color && setAnnotationColor) setAnnotationColor(patch.color);
      if (typeof patch.opacity === "number" && setTextOpacity) setTextOpacity(patch.opacity);
      if (typeof patch.fontSize === "number") {
        if (setTextFontSize) setTextFontSize(patch.fontSize);
        if (setAnnotationFontSize) setAnnotationFontSize(patch.fontSize);
      }
      if (typeof patch.isBold === "boolean" && setTextBold) setTextBold(patch.isBold);
      if (typeof patch.isItalic === "boolean" && setTextItalic) setTextItalic(patch.isItalic);
      if (typeof patch.isUnderline === "boolean" && setTextUnderline) setTextUnderline(patch.isUnderline);
      if (typeof patch.isStrikethrough === "boolean" && setTextStrikethrough) setTextStrikethrough(patch.isStrikethrough);
    } else if (isTextAnnotation) {
      // Persist ONLY to text defaults (does not affect drawing tools)
      if (patch.color && setTextColor) setTextColor(patch.color);
      if (typeof patch.opacity === "number" && setTextOpacity) setTextOpacity(patch.opacity);
      if (typeof patch.fontSize === "number") {
        if (setTextFontSize) setTextFontSize(patch.fontSize);
        if (setAnnotationFontSize) setAnnotationFontSize(patch.fontSize);
      }
      if (typeof patch.isBold === "boolean" && setTextBold) setTextBold(patch.isBold);
      if (typeof patch.isItalic === "boolean" && setTextItalic) setTextItalic(patch.isItalic);
      if (typeof patch.isUnderline === "boolean" && setTextUnderline) setTextUnderline(patch.isUnderline);
      if (typeof patch.strokeWidth === "number") {
        if (target && target.type === "callout" && setCalloutStrokeWidth) {
          setCalloutStrokeWidth(patch.strokeWidth);
        }
        if (setAnnotationStrokeWidth) {
          setAnnotationStrokeWidth(patch.strokeWidth);
        }
      }
    } else {
      // Persist ONLY to drawing defaults (does not affect text tools)
      if (patch.color && setAnnotationColor) setAnnotationColor(patch.color);
      if (typeof patch.strokeWidth === "number" && setAnnotationStrokeWidth) setAnnotationStrokeWidth(patch.strokeWidth);
      if (typeof patch.opacity === "number" && setAnnotationOpacity) setAnnotationOpacity(patch.opacity);
      if (typeof patch.fillOpacity === "number" && setAnnotationFillOpacity) setAnnotationFillOpacity(patch.fillOpacity);
      if (patch.fillMode && setAnnotationFillMode) setAnnotationFillMode(patch.fillMode);
    }
  }, [
    currentPage, setAnnotationsByPage, pushAnnotationHistory, annotationsByPage, selectedAnnotationIds,
    setAnnotationColor, setAnnotationStrokeWidth, setAnnotationOpacity, setAnnotationFillOpacity,
    setAnnotationFillMode, setAnnotationFontSize, setTextColor, setTextOpacity, setTextFontSize,
    setTextBold, setTextItalic, setTextUnderline, setTextStrikethrough, setCalloutStrokeWidth, setLintelsByPageCtx
  ]);

  const handleDeleteAnnotation = React.useCallback((annId) => {
    if (typeof pushAnnotationHistory === "function") {
      pushAnnotationHistory(annotationsByPage);
    }
    const idsToDelete = (selectedAnnotationIds && selectedAnnotationIds.includes(annId) && selectedAnnotationIds.length > 1)
      ? selectedAnnotationIds
      : [annId];

    if (setAnnotationsByPage) {
      setAnnotationsByPage((prev) => {
        const list = prev[currentPage] || [];
        return {
          ...prev,
          [currentPage]: list.filter((a) => !idsToDelete.includes(a.id))
        };
      });
    }
    if (setSelectedAnnotationId) {
      setSelectedAnnotationId(null);
    }
    if (setSelectedAnnotationIds) {
      setSelectedAnnotationIds([]);
    }
  }, [currentPage, setAnnotationsByPage, pushAnnotationHistory, annotationsByPage, selectedAnnotationIds, setSelectedAnnotationId, setSelectedAnnotationIds]);

  const handleDuplicateAnnotation = React.useCallback((annId) => {
    const list = annotationsByPage[currentPage] || [];
    const target = list.find((a) => a.id === annId);
    if (!target) return;
    if (typeof pushAnnotationHistory === "function") {
      pushAnnotationHistory(annotationsByPage);
    }
    const offset = 30;
    const duplicated = {
      ...target,
      id: `${target.type || "ann"}_dup_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      x: (target.x || 0) + offset,
      y: (target.y || 0) + offset,
      startPt: target.startPt ? { x: target.startPt.x + offset, y: target.startPt.y + offset } : undefined,
      currentPt: target.currentPt ? { x: target.currentPt.x + offset, y: target.currentPt.y + offset } : undefined,
      points: target.points ? target.points.map((p) => ({ x: p.x + offset, y: p.y + offset })) : undefined,
      boxX: target.boxX != null ? target.boxX + offset : undefined,
      boxY: target.boxY != null ? target.boxY + offset : undefined
    };
    if (setAnnotationsByPage) {
      setAnnotationsByPage((prev) => ({
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), duplicated]
      }));
    }
    if (setSelectedAnnotationId) {
      setSelectedAnnotationId(duplicated.id);
    }
  }, [currentPage, annotationsByPage, setAnnotationsByPage, setSelectedAnnotationId, pushAnnotationHistory]);

  const pages = (pagesProp && pagesProp.length > 0) ? pagesProp : (pagesContext || []);
  const setPages = setPagesProp || setPagesContext;
  const effectiveWallsByPage = (wallsByPageProp && Object.keys(wallsByPageProp).length > 0) ? wallsByPageProp : (wallsByPageCtx || {});
  const effectiveScalesByPage = (scalesByPageProp && Object.keys(scalesByPageProp).length > 0) ? scalesByPageProp : (scalesByPageCtx || {});

  // ── PANE TAB STATE ("explorer" | "summary" | "job_task" | custom module IDs) ──
  const [activePaneTab, setActivePaneTab] = React.useState("explorer");
  const [explorerViewMode, setExplorerViewMode] = React.useState("tree"); // "tree" | "properties"
  const pendingOpenAfterMoveRef = React.useRef(false);
  const prevCanvasMovingRef = React.useRef(false);
  const [explorerSearch, setExplorerSearch] = React.useState("");
  const [showCustomThickness, setShowCustomThickness] = React.useState(false);
  const [showCustomHeight, setShowCustomHeight] = React.useState(false);
  const [expandedNodes, setExpandedNodes] = React.useState(() => new Set([
    "root",
    "floor_0"
  ]));

  // ── CUSTOMER / CLIENT TASK FORM SELECTION ──
  const [selectedCustomerClient, setSelectedCustomerClient] = React.useState(() => {
    if (typeof window === "undefined") return "bun-nsw-act";
    return (
      getCustomerFromPendingEmsJob() ||
      resolveCustomerPackKey(sessionStorage.getItem("selectedCustomerClient")) ||
      resolveCustomerPackKey(localStorage.getItem("selectedCustomerClient")) ||
      "bun-nsw-act"
    );
  });

  const customerModuleIds = React.useMemo(
    () => getCustomerModuleIds(selectedCustomerClient),
    [selectedCustomerClient]
  );
  const customerModuleTabs = React.useMemo(
    () => EXTRA_MODULE_TABS.filter(mod => customerModuleIds.includes(mod.id)),
    [customerModuleIds]
  );

  // ── DYNAMIC MODULE TABS STATE (DRIVEN BY CUSTOMER + TASK CONTEXT) ──
  const [enabledModuleIds, setEnabledModuleIds] = React.useState(() =>
    getInitialEnabledModules(
      typeof window === "undefined"
        ? "bun-nsw-act"
        : (getCustomerFromPendingEmsJob() || resolveCustomerPackKey(sessionStorage.getItem("selectedCustomerClient")) || resolveCustomerPackKey(localStorage.getItem("selectedCustomerClient")) || "bun-nsw-act")
    )
  );
  const [showAddModulePopup, setShowAddModulePopup] = React.useState(false);
  const addModulePopupRef = React.useRef(null);

  const activeCustomerTasks = React.useMemo(() => {
    const pack = CUSTOMER_TASK_PACKS[selectedCustomerClient]?.tasks || BunNswActTasks;
    const fallback = BunNswActTasks;
    const fallback2 = CairnsHardwareTasks;
    return {
      FrameHardwareTask: pack.FrameHardwareTask || fallback.FrameHardwareTask || fallback2.FrameHardwareTask,
      EavesSoffitTask: pack.EavesSoffitTask || fallback.EavesSoffitTask || fallback2.EavesSoffitTask,
      CladdingTask: pack.CladdingTask || fallback.CladdingTask || fallback2.CladdingTask,
      InsulationTask: pack.InsulationTask || fallback.InsulationTask || fallback2.InsulationTask,
      FlooringDeckingTask: pack.FlooringDeckingTask || fallback.FlooringDeckingTask || fallback2.FlooringDeckingTask,
      HebelFlooringTask: pack.HebelFlooringTask || fallback.HebelFlooringTask || pack.FlooringDeckingTask || fallback.FlooringDeckingTask,
      TimberPostsTask: pack.TimberPostsTask || fallback.TimberPostsTask || fallback2.TimberPostsTask,
      FixoutTask: pack.FixoutTask || fallback.FixoutTask || fallback2.FixoutTask,
      LockupTask: pack.LockupTask || fallback.LockupTask || fallback2.LockupTask,
      ShelvingTask: pack.ShelvingTask || fallback.ShelvingTask || fallback2.ShelvingTask,
      DoorsFurnitureTask: pack.DoorsFurnitureTask || fallback.DoorsFurnitureTask || fallback2.DoorsFurnitureTask,
      FowPlumbingTask: pack.FowPlumbingTask || fallback.FowPlumbingTask || fallback2.FowPlumbingTask,
      PowerTrussBracesTask: pack.PowerTrussBracesTask || fallback.PowerTrussBracesTask || fallback2.PowerTrussBracesTask,
      FinalFitTask: pack.FinalFitTask || fallback.FinalFitTask || fallback2.FinalFitTask,
      SheetScheduleTask: pack.SheetScheduleTask || fallback.SheetScheduleTask || fallback2.SheetScheduleTask,
      HardiesFireWallsTask: pack.HardiesFireWallsTask || fallback.HardiesFireWallsTask || fallback2.HardiesFireWallsTask
    };
  }, [selectedCustomerClient]);

  const {
    FrameHardwareTask,
    EavesSoffitTask,
    CladdingTask,
    InsulationTask,
    FlooringDeckingTask,
    HebelFlooringTask,
    TimberPostsTask,
    FixoutTask,
    LockupTask,
    ShelvingTask,
    DoorsFurnitureTask,
    FowPlumbingTask,
    PowerTrussBracesTask,
    FinalFitTask,
    SheetScheduleTask,
    HardiesFireWallsTask
  } = activeCustomerTasks;

  // Dynamic sync: pending EMS customer is authoritative; module state is always
  // intersected with that customer's module contract so stale 15-module storage
  // can never re-enable modules from another customer.
  React.useEffect(() => {
    const syncTaskContext = () => {
      let pendingJob = null;
      try {
        const pendingJobStr = sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob");
        if (pendingJobStr) pendingJob = JSON.parse(pendingJobStr);
      } catch (_) { }

      // Kiểm tra xem pendingJob có trùng khớp với project đang mở hay không
      const isMatchingEmsJob = pendingJob && currentProjectName && (
        String(pendingJob.job_number || "").trim().toLowerCase() === String(currentProjectName || "").trim().toLowerCase() ||
        String(pendingJob.hw_id || "").trim().toLowerCase() === String(currentProjectName || "").trim().toLowerCase() ||
        String(pendingJob.id_job_ems || "").trim().toLowerCase() === String(currentProjectName || "").trim().toLowerCase()
      );

      const pendingCustomer = isMatchingEmsJob ? getCustomerFromPendingEmsJob() : null;
      const storedCustomer =
        resolveCustomerPackKey(sessionStorage.getItem("selectedCustomerClient")) ||
        resolveCustomerPackKey(localStorage.getItem("selectedCustomerClient"));
      const nextCustomer = pendingCustomer || storedCustomer || selectedCustomerClient || "bun-nsw-act";

      if (nextCustomer !== selectedCustomerClient) {
        setSelectedCustomerClient(nextCustomer);
      }

      try {
        sessionStorage.setItem("selectedCustomerClient", nextCustomer);
        localStorage.setItem("selectedCustomerClient", nextCustomer);
      } catch (_) { }

      // 1. Nếu là EMS Job đang mở và có cấu hình task_modules từ API -> ƯU TIÊN HÀNG ĐẦU
      const authMods = Array.isArray(pendingJob?.task_modules)
        ? pendingJob.task_modules
        : (Array.isArray(pendingJob?.selected_modules)
          ? pendingJob.selected_modules.map(m => typeof m === "string" ? m : m.module_id).filter(Boolean)
          : null);

      if (Array.isArray(authMods)) {
        const sanitizedAuth = sanitizeModuleIds(authMods, nextCustomer);
        setEnabledModuleIds(prev =>
          JSON.stringify(prev) === JSON.stringify(sanitizedAuth) ? prev : sanitizedAuth
        );
        return;
      }

      // 2. Kiểm tra cấu hình task tùy chỉnh người dùng đã chọn (selectedModules) trong sessionStorage
      let customModules = null;
      try {
        const storedModules = sessionStorage.getItem("selectedModules");
        if (storedModules) {
          const parsed = JSON.parse(storedModules);
          if (Array.isArray(parsed)) {
            customModules = sanitizeModuleIds(parsed, nextCustomer);
          }
        }
      } catch (_) { }

      if (Array.isArray(customModules)) {
        setEnabledModuleIds(prev =>
          JSON.stringify(prev) === JSON.stringify(customModules) ? prev : customModules
        );
        return;
      }

      // 3. Mặc định cho project thông thường: nạp toàn bộ module theo gói khách hàng
      const resolved = getInitialEnabledModules(nextCustomer);
      setEnabledModuleIds(prev =>
        JSON.stringify(prev) === JSON.stringify(resolved) ? prev : resolved
      );
    };

    syncTaskContext();
    window.addEventListener("storage", syncTaskContext);
    window.addEventListener("task-modules-updated", syncTaskContext);

    return () => {
      window.removeEventListener("storage", syncTaskContext);
      window.removeEventListener("task-modules-updated", syncTaskContext);
    };
  }, [currentProjectName, user, selectedCustomerClient]);

  // Đảm bảo activePaneTab hợp lệ khi đổi gói khách hàng
  React.useEffect(() => {
    if (
      activePaneTab !== "explorer" &&
      activePaneTab !== "summary" &&
      activePaneTab !== "job_task" &&
      activePaneTab !== "collapsed" &&
      !customerModuleIds.includes(activePaneTab)
    ) {
      setActivePaneTab("explorer");
    }
  }, [customerModuleIds, activePaneTab]);

  // Close Add Module popup on outside click
  React.useEffect(() => {
    if (!showAddModulePopup) return;
    const handleClickOutside = (e) => {
      if (addModulePopupRef.current && !addModulePopupRef.current.contains(e.target)) {
        setShowAddModulePopup(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAddModulePopup]);

  // If current active tab is a module that became disabled, fallback to explorer
  React.useEffect(() => {
    if (activePaneTab !== "explorer" && activePaneTab !== "summary" && activePaneTab !== "job_task" && activePaneTab !== "collapsed") {
      if (!enabledModuleIds.includes(activePaneTab)) {
        setActivePaneTab("explorer");
      }
    }
  }, [enabledModuleIds, activePaneTab]);

  // ── TASK CALCULATION FORMS STATE (10 MODULES) ──
  const [moduleFormData, setModuleFormData] = React.useState({
    frame_hardware: { wall_height: "", wall_length: "", wind_class: "", base_construction: "" },
    eaves_soffit: { building_level: "", eave_width: "", total_eave_length: "", soffit_material: "" },
    cladding: { elevation: "", cladding_type: "", cladding_area: "", waste_allowance: "10" },
    insulation: { area_type: "", r_value: "", area: "", stud_centres: "450" },
    shelving: { room_label: "", shelf_size: "", shelf_type: "", total_length: "" },
    flooring_decking: { location: "", flooring_type: "", floor_area: "", waste_allowance: "10" },
    doors_furniture: { category: "", finish: "", dimensions: "", quantity: "1" },
    timber_posts: { location: "", timber_size: "", height: "2700", quantity: "1" },
    fow_plumbing: { fixture: "", pipe_spec: "", length: "", count: "1" },
    power_truss_braces: { truss_area: "", brace_type: "", length: "", hardware: "" },
    hardies_fire_walls: { location: "", wall_length: "", wall_height: "2.70", system_type: "", lining_spec: "" }
  });

  const [aiGeneratedSuccess, setAiGeneratedSuccess] = React.useState(null);

  const handleModuleFormChange = (moduleId, field, value) => {
    setModuleFormData(prev => ({
      ...prev,
      [moduleId]: {
        ...(prev[moduleId] || {}),
        [field]: value
      }
    }));
  };

  const handleResetModuleData = (moduleId) => {
    if (moduleId === "shelving") setShelvingEntries([]);
    if (moduleId === "fow_plumbing") setFowPlumbingEntries([]);
    if (moduleId === "timber_posts") setTimberPostEntries([]);
    if (moduleId === "fixout") setFixoutDoorEntries([]);
    if (moduleId === "power_truss_braces") setPowerTrussEntries([]);
    if (moduleId === "lockup" || moduleId === "lock_up") setLockupEntries([]);
    setModuleFormData(prev => ({
      ...prev,
      [moduleId]: {
        ...(moduleId === "cladding" || moduleId === "flooring_decking" ? { waste_allowance: "10" } : {}),
        ...(moduleId === "insulation" ? { stud_centres: "450" } : {}),
        ...(moduleId === "timber_posts" ? { height: "2700", quantity: "1" } : {}),
        ...(moduleId === "power_truss_braces" ? { wall_height: "2700", length: "4500", type: "Column", qty: "1" } : {}),
        ...(moduleId === "doors_furniture" || moduleId === "fow_plumbing" ? { quantity: "1", count: "1" } : {})
      }
    }));
  };

  // Handler for selecting an entry in task tables — highlights matching objects on canvas
  const handleSelectEntry = (entry) => {
    if (!entry) {
      // Deselected — clear canvas highlight & selections
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedId) setSelectedId(null);
      if (setSelectedType) setSelectedType(null);
      return;
    }

    console.log("[TaskPanel] Entry selected for canvas highlight:", entry);

    // Auto-switch to the corresponding floor level / page if needed
    let targetPageIndex = -1;
    if (entry.wallIds && entry.wallIds.length > 0) {
      for (const [pIdxStr, pWalls] of Object.entries(effectiveWallsByPage || {})) {
        if (Array.isArray(pWalls) && pWalls.some(pw => entry.wallIds.includes(pw.id))) {
          targetPageIndex = Number(pIdxStr);
          break;
        }
      }
    }
    if (targetPageIndex < 0 && entry.floorLevel && pages && pages.length > 0) {
      const fl = (entry.floorLevel || entry.floor_level || "GF").toUpperCase().trim();
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

    if (targetPageIndex >= 0 && targetPageIndex !== currentPage) {
      if (typeof goPage === "function") goPage(targetPageIndex);
      else if (typeof setCurrentPage === "function") setCurrentPage(targetPageIndex);
    }

    // Direct object ID arrays
    if (entry.wallIds && entry.wallIds.length > 0) {
      if (setSelectedWallIds) setSelectedWallIds(entry.wallIds);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("wall");
      if (setSelectedId) setSelectedId(entry.wallIds[0]);
      return;
    }
    if (entry.wallId) {
      if (setSelectedWallIds) setSelectedWallIds([entry.wallId]);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("wall");
      if (setSelectedId) setSelectedId(entry.wallId);
      return;
    }
    if (entry.roomIds && entry.roomIds.length > 0) {
      if (setSelectedRoomIds) setSelectedRoomIds(entry.roomIds);
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("room");
      if (setSelectedId) setSelectedId(entry.roomIds[0]);
      return;
    }
    if (entry.roomId) {
      if (setSelectedRoomIds) setSelectedRoomIds([entry.roomId]);
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("room");
      if (setSelectedId) setSelectedId(entry.roomId);
      return;
    }
    if (entry.doorId) {
      if (setSelectedDoorIds) setSelectedDoorIds([entry.doorId]);
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("door");
      if (setSelectedId) setSelectedId(entry.doorId);
      return;
    }

    // 1. TIMBER vs SLAB WALLS (Frame Hardware Task)
    const wallAboveStr = String(entry.theWallAbove || entry.baseType || "").toLowerCase();
    if (wallAboveStr.includes("slab") || wallAboveStr.includes("timber")) {
      const isSlabTarget = wallAboveStr.includes("slab");
      const isSlabWall = (w) => {
        const fType = String(w.floor_type || "").toLowerCase();
        const cName = String(w.class_name || "").toLowerCase();
        const bType = String(w.base_type || "").toLowerCase();
        const bConst = String(w.base_construction || "").toLowerCase();
        const wAbove = String(w.the_wall_above || "").toLowerCase();
        return fType === "slab" || cName.includes("slab") || bType.includes("slab") || bConst.includes("slab") || wAbove.includes("slab");
      };

      const matchedWallIds = (walls || [])
        .filter(w => isSlabTarget ? isSlabWall(w) : !isSlabWall(w))
        .map(w => w.id);

      if (setSelectedWallIds) setSelectedWallIds(matchedWallIds);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("wall");
      if (setSelectedId) setSelectedId(matchedWallIds[0] || null);
      return;
    }

    // 2. EXTERNAL vs INTERNAL WALLS (Insulation Task)
    const typeStr = String(entry.type || entry.areaType || entry.category || "").toLowerCase();
    if (typeStr.includes("ext") || typeStr.includes("int") || typeStr.includes("party")) {
      const isExtTarget = typeStr.includes("ext");
      const isExtWall = (w) => {
        const cName = String(w.class_name || "").toLowerCase();
        const wType = String(w.wall_type || "").toLowerCase();
        return Boolean(w.is_ext || wType === "ext" || cName.includes("exterior") || cName.includes("ext_wall"));
      };

      const matchedWallIds = (walls || [])
        .filter(w => isExtTarget ? isExtWall(w) : !isExtWall(w))
        .map(w => w.id);

      if (setSelectedWallIds) setSelectedWallIds(matchedWallIds);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("wall");
      if (setSelectedId) setSelectedId(matchedWallIds[0] || null);
      return;
    }

    // 3. WET vs DRY ROOMS / FLOORING AREAS (Flooring & Decking / Hebel Flooring Task)
    const areaTypeStr = String(entry.typeArea || entry.location || entry.room || entry.type || "").toLowerCase();
    if (areaTypeStr.includes("wet") || areaTypeStr.includes("dry") || areaTypeStr.includes("balcony") || areaTypeStr.includes("deck") || areaTypeStr.includes("tile")) {
      let hlType = "dry";
      if (areaTypeStr.includes("wet")) {
        hlType = "wet";
      } else if (areaTypeStr.includes("timber") && areaTypeStr.includes("deck")) {
        hlType = "timber_deck";
      } else if (areaTypeStr.includes("tile") || areaTypeStr.includes("balcony")) {
        hlType = "tile_deck";
      } else {
        hlType = "dry";
      }

      // DO NOT set highlightType (keep null) so other rooms/areas on canvas remain completely visible
      if (setHighlightType) setHighlightType(null);

      // Auto switch canvas page if entry belongs to a specific floor level (e.g. GF, FF, SF, TF)
      const floorLvlStr = String(entry.floorLevel || entry.level || "").toUpperCase().trim();
      let targetPageIdx = -1;
      if (floorLvlStr) {
        (pages || []).forEach((p, pIdx) => {
          const pName = (p.floor_name || p.name || "").toUpperCase().trim();
          if (floorLvlStr === "GF" && (pIdx === 0 || pName.includes("GROUND") || pName.includes("GF") || pName === "LEVEL 1")) {
            if (targetPageIdx === -1) targetPageIdx = pIdx;
          } else if (floorLvlStr === "FF" && (pIdx === 1 || pName.includes("FIRST") || pName.includes("FF") || pName === "LEVEL 2")) {
            targetPageIdx = pIdx;
          } else if (floorLvlStr === "SF" && (pIdx === 2 || pName.includes("SECOND") || pName.includes("SF") || pName === "LEVEL 3")) {
            targetPageIdx = pIdx;
          } else if (floorLvlStr === "TF" && (pIdx === 3 || pName.includes("THIRD") || pName.includes("TF") || pName === "LEVEL 4")) {
            targetPageIdx = pIdx;
          }
        });
        if (targetPageIdx === -1) {
          if (floorLvlStr === "GF") targetPageIdx = 0;
          else if (floorLvlStr === "FF") targetPageIdx = 1;
          else if (floorLvlStr === "SF") targetPageIdx = 2;
          else if (floorLvlStr === "TF") targetPageIdx = 3;
        }

        if (targetPageIdx >= 0 && targetPageIdx < (pages || []).length) {
          const curP = (currentPageProp !== undefined) ? currentPageProp : (currentPage !== undefined ? currentPage : 0);
          if (targetPageIdx !== curP) {
            if (goPage) goPage(targetPageIdx);
            else if (setCurrentPageProp) setCurrentPageProp(targetPageIdx);
          }
        }
      }

      const activeRoomList = targetPageIdx >= 0 && roomsByPageProp && roomsByPageProp[targetPageIdx]
        ? roomsByPageProp[targetPageIdx]
        : (rooms || []);

      const matchedRoomIds = (activeRoomList || []).filter(r => {
        const rawType = String(r.type || r.wetness || r.zone || "").toLowerCase();
        const rName = String(r.name || r.room_name || "").toLowerCase();
        const isWet = rawType === "wet" || /(bath|ens|ensuite|wc|powder|toilet|l'dry|laundry|utility|shower)/i.test(rName);
        const isTileDeck = rawType === "tile_deck" || /(deck.*tile|tile.*deck|patio|alfresco|porch|verandah)/i.test(rName);
        const isTimberDeck = rawType === "timber_deck" || (rawType === "deck" && !isTileDeck) || /(deck.*timber|timber.*deck|balcony)/i.test(rName);

        if (hlType === "wet") return isWet;
        if (hlType === "tile_deck") return isTileDeck;
        if (hlType === "timber_deck") return isTimberDeck;
        return !isWet && !isTileDeck && !isTimberDeck;
      }).map(r => r.id);

      if (setSelectedRoomIds) setSelectedRoomIds(matchedRoomIds);
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setSelectedType) setSelectedType("room");
      if (setSelectedId) setSelectedId(matchedRoomIds[0] || null);
      return;
    }

    // 4. DOORS (Lockup Task, Fixout Task, Doors & Furniture Task)
    const doorLocStr = String(entry.location || entry.doorLabel || entry.door || entry.doorType || entry.name || "").toLowerCase().trim();
    const cleanId = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    const matchedDoor = (doors || []).find(d => {
      if (entry.doorId && d.id === entry.doorId) return true;
      if (entry.id && (d.id === entry.id || String(entry.id).includes(String(d.id)))) return true;
      const dLabel = String(d.label || d.name || d.door_name || "").toLowerCase().trim();
      if (dLabel && doorLocStr && (dLabel === doorLocStr || cleanId(dLabel) === cleanId(doorLocStr))) return true;
      return false;
    });

    if (matchedDoor) {
      if (setSelectedDoorIds) setSelectedDoorIds([matchedDoor.id]);
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedId) setSelectedId(matchedDoor.id);
      if (setSelectedType) setSelectedType("door");
    } else {
      const fallbackId = entry.doorId || entry.id;
      if (fallbackId) {
        if (setSelectedDoorIds) setSelectedDoorIds([fallbackId]);
        if (setSelectedWallIds) setSelectedWallIds([]);
        if (setSelectedRoomIds) setSelectedRoomIds([]);
        if (setHighlightType) setHighlightType(null);
        if (setSelectedId) setSelectedId(fallbackId);
        if (setSelectedType) setSelectedType("door");
      }
    }
  };

  const handleAddDataAI = (moduleId) => {
    let aiValues = {};
    const effScale = (realScale && realScale > 0) ? realScale : (scaleValue && scaleValue > 0 ? scaleValue : 1.0);
    const curWalls = (wallsByPageProp && wallsByPageProp[currentPage]) ? wallsByPageProp[currentPage] : (walls || []);
    const curDoors = (doorsByPageProp && doorsByPageProp[currentPage]) ? doorsByPageProp[currentPage] : (doors || []);
    const curRooms = (roomsByPageProp && roomsByPageProp[currentPage]) ? roomsByPageProp[currentPage] : (rooms || []);

    let extWallLenM = 0;
    let intWallLenM = 0;
    let grandTotLenM = 0;
    curWalls.forEach(w => {
      let lM = 0;
      if (w.length_m) lM = w.length_m;
      else if (w.centerline && w.centerline.length === 2) {
        const dx = w.centerline[1][0] - w.centerline[0][0];
        const dy = w.centerline[1][1] - w.centerline[0][1];
        const px = Math.hypot(dx, dy);
        lM = (effScale < 0.5 ? px * effScale * 1000 : px * effScale) / 1000;
      }
      grandTotLenM += lM;
      const wCls = typeof getWallClass === "function" ? getWallClass(w) : (w.class_name || w.wall_type || "interior_wall");
      if (wCls === "exterior_wall") extWallLenM += lM;
      else intWallLenM += lM;
    });

    const externalWallLength = cadMetrics?.externalWallLength || (extWallLenM > 0 ? extWallLenM : 0);
    const internalWallLength = cadMetrics?.internalWallLength || (intWallLenM > 0 ? intWallLenM : 0);
    const grandTotalLength = cadMetrics?.grandTotalLength || (grandTotLenM > 0 ? grandTotLenM : 0);
    const totalRoofArea = cadMetrics?.totalRoofArea || 0;
    const totalRoomArea = cadMetrics?.totalRoomArea || 0;

    if (moduleId === "frame_hardware") {
      const architecturalPages = (pages || [])
        .map((p, originalIndex) => ({ ...p, originalIndex }))
        .filter((p) => !p?.category && p?.source !== "pdf_tools");
      const architecturalIndices = architecturalPages.map(p => p.originalIndex);
      const validArchitecturalIndices = architecturalIndices.length > 0
        ? architecturalIndices
        : ((pages || []).length > 0 && !pages[0]?.category && pages[0]?.source !== "pdf_tools" ? [0] : []);

      const pageIndices = new Set([
        ...validArchitecturalIndices,
        ...Object.keys(effectiveWallsByPage || {}).map(Number).filter(idx => validArchitecturalIndices.includes(idx))
      ]);
      if (pageIndices.size === 0 && validArchitecturalIndices.length > 0) pageIndices.add(validArchitecturalIndices[0]);

      const _getFloorLevelByPage = (idx) => {
        const archOrderIdx = architecturalIndices.indexOf(idx);
        const effectiveOrderIdx = archOrderIdx >= 0 ? archOrderIdx : idx;

        if (pages && pages[idx]) {
          const page = pages[idx];
          const name = (page.floor_name || page.name || "").trim();
          if (name && !name.toLowerCase().startsWith("page ") && !name.toLowerCase().startsWith("cladding") && !name.toLowerCase().startsWith("image")) {
            const upper = name.toUpperCase();
            if (upper === "LEVEL 1" || upper === "GROUND FLOOR" || upper === "GROUND" || upper === "GF" || upper === "TRỆT" || upper === "TẦNG TRỆT") return "GF";
            if (upper === "LEVEL 2" || upper === "FIRST FLOOR" || upper === "FIRST" || upper === "FF" || upper === "TẦNG 1" || upper === "1F") return "FF";
            if (upper === "LEVEL 3" || upper === "SECOND FLOOR" || upper === "SECOND" || upper === "SF" || upper === "TẦNG 2" || upper === "2F") return "SF";
            if (upper === "LEVEL 4" || upper === "THIRD FLOOR" || upper === "THIRD" || upper === "TF" || upper === "TẦNG 3" || upper === "3F") return "TF";
            if (upper.startsWith("LEVEL ")) {
              const num = parseInt(upper.replace("LEVEL ", "").trim(), 10);
              if (num === 1) return "GF";
              if (num === 2) return "FF";
              if (num === 3) return "SF";
              if (num === 4) return "TF";
              return `${num - 1}F`;
            }
            return name;
          }
        }
        const labels = ["GF", "FF", "SF", "TF"];
        return effectiveOrderIdx < labels.length ? labels[effectiveOrderIdx] : `${effectiveOrderIdx}F`;
      };

      const _getQualifiedWallInfo = (w) => {
        const rawClass = String(w.class_name || w.wall_type || "").toLowerCase().trim();
        const isExt = rawClass === "exterior_wall" || rawClass === "ext" || Boolean(w.is_ext || w.is_exterior);
        const isLbw = Boolean(w.is_lbw === true || w.is_load_bearing === true || w.lbw === true);
        const isInt = rawClass === "interior_wall" || rawClass === "int";

        if (isExt) {
          return { qualified: true, wallClass: "exterior_wall" };
        }
        if ((isInt || !rawClass || rawClass === "wall") && isLbw) {
          return { qualified: true, wallClass: "interior_wall" };
        }
        if (isLbw && !isExt) {
          return { qualified: true, wallClass: "interior_wall" };
        }
        return { qualified: false };
      };

      const groupsMap = {};

      Array.from(pageIndices).forEach(pIdx => {
        const pageWalls = (effectiveWallsByPage && effectiveWallsByPage[pIdx]) ? effectiveWallsByPage[pIdx] : [];
        const pageScale = (effectiveScalesByPage && effectiveScalesByPage[pIdx] !== undefined) ? effectiveScalesByPage[pIdx] : null;
        const floorLevel = _getFloorLevelByPage(pIdx);

        pageWalls.forEach(w => {
          const qInfo = _getQualifiedWallInfo(w);
          if (!qInfo.qualified) return;

          let lenMm = 0;
          if (w.length_m) {
            lenMm = Math.round(w.length_m * 1000);
          } else if (w.centerline && Array.isArray(w.centerline) && w.centerline.length === 2) {
            const dx = w.centerline[1][0] - w.centerline[0][0];
            const dy = w.centerline[1][1] - w.centerline[0][1];
            const px = Math.hypot(dx, dy);
            const s = (pageScale !== undefined && pageScale !== null && pageScale > 0) ? pageScale : (realScale && realScale > 0 ? realScale : effScale);
            lenMm = s < 0.5 ? Math.round(px * s * 1000) : Math.round(px * s);
          }
          if (lenMm <= 0) return;

          const rawFloor = String(w.floor_type || w.floorType || w.base_construction || "").toLowerCase();
          const isSlab = rawFloor.includes("slab") || rawFloor.includes("concrete");
          const floorType = isSlab ? "Slab" : "Timber";
          const hMm = Number(w.height_mm || w.height || 2400);
          const wallClass = qInfo.wallClass;

          const key = `${floorLevel}_${floorType}_${wallClass}_${hMm}`;
          if (!groupsMap[key]) {
            groupsMap[key] = {
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

      const sortedGroups = Object.values(groupsMap).sort((a, b) => {
        if (a.floorLevel !== b.floorLevel) {
          if (a.floorLevel === "GF") return -1;
          if (b.floorLevel === "GF") return 1;
          return a.floorLevel.localeCompare(b.floorLevel);
        }
        if (a.floorType !== b.floorType) return a.floorType === "Slab" ? -1 : 1;
        if (a.wallClass !== b.wallClass) return a.wallClass === "exterior_wall" ? -1 : 1;
        return a.heightMm - b.heightMm;
      });

      const newEntries = sortedGroups.map((g) => {
        const spacingNum = 900;
        const rodCount = Math.ceil(g.totalMm / spacingNum) || 1;
        const rodLen = g.heightMm <= 2440 ? 2700 : (g.heightMm <= 2740 ? 3000 : 3600);
        return {
          id: `canvas-${g.floorLevel}-${g.floorType}-${g.wallClass}-${g.heightMm}`,
          baseType: g.baseType,
          theWallAbove: g.theWallAbove,
          height: `${g.heightMm} mm`,
          length: `${Math.round(g.totalMm)} mm`,
          spacing: `${spacingNum} mm`,
          rodSize: "M12",
          rodDemand: (g.totalMm / spacingNum).toFixed(2),
          rodMapping: `${rodCount} x M12 Rod ${rodLen}`,
          rodsQty: `${rodCount} pcs`,
          floorLevel: g.floorLevel || "GF",
          wallClass: g.wallClass,
          isCanvasWall: true,
          wallIds: g.wallIds
        };
      });

      setFrameWallEntries(newEntries);
      aiValues = {
        wall_height: newEntries[0]?.height || "2400 mm",
        wall_length: grandTotalLength ? grandTotalLength.toFixed(2) : "0",
        wind_class: "N2",
        base_construction: newEntries[0]?.baseType || "Concrete Slab"
      };
    } else if (moduleId === "flooring_decking" || moduleId === "hebel_flooring") {
      const groupsMap = {};

      curRooms.forEach(r => {
        const override = customRoomOverrides[r.id] || {};
        let areaM2 = 0;
        if (override.totalM2) {
          areaM2 = override.totalM2;
        } else if (r.areaM2 && !isNaN(r.areaM2)) {
          areaM2 = parseFloat(r.areaM2);
        } else if (r.area && !isNaN(r.area)) {
          areaM2 = r.area > 10000 ? r.area / 1000000 : parseFloat(r.area);
        } else if (r.area_m2 && !isNaN(r.area_m2)) {
          areaM2 = parseFloat(r.area_m2);
        } else {
          const pts = r.polygon || r.poly;
          if (pts && pts.length >= 3) {
            let pxArea = 0;
            for (let j = 0; j < pts.length; j++) {
              const p1 = pts[j];
              const p2 = pts[(j + 1) % pts.length];
              const x1 = typeof p1.x === 'number' ? p1.x : (Array.isArray(p1) ? p1[0] : 0);
              const y1 = typeof p1.y === 'number' ? p1.y : (Array.isArray(p1) ? p1[1] : 0);
              const x2 = typeof p2.x === 'number' ? p2.x : (Array.isArray(p2) ? p2[0] : 0);
              const y2 = typeof p2.y === 'number' ? p2.y : (Array.isArray(p2) ? p2[1] : 0);
              pxArea += (x1 * y2 - x2 * y1);
            }
            pxArea = Math.abs(pxArea) / 2;
            const effectiveScale = (realScale && realScale > 0) ? realScale : (scaleValue && scaleValue > 0 ? scaleValue : 1.0);
            const areaMm2 = pxArea * Math.pow(effectiveScale, 2);
            areaM2 = areaMm2 / 1000000;
          }
        }
        if (!areaM2 || areaM2 <= 0) return;

        const rawType = String(r.type || r.wetness || r.classification || r.room_class || r.room_type || "").toLowerCase();
        const rName = String(r.name || r.room_name || r.label || r.text || "").toLowerCase();

        const isWet = rawType === "wet" || /bath|ens|ensuite|wc|powder|laundry|shower|toilet/i.test(rName) || /bath|ens|ensuite|wc|powder|laundry|shower|toilet/i.test(rawType);
        const isBalcony = rawType === "tile_deck" || /balcony|porch|alfresco|patio|terrace|verand/i.test(rName) || /balcony|porch|alfresco|patio|terrace/i.test(rawType);
        const isDeck = rawType === "timber_deck" || (!isBalcony && /deck|timber/i.test(rName)) || /deck|timber/i.test(rawType);

        const defaultType = isWet ? "Wet" : (isBalcony ? "Balcony Tiles" : (isDeck ? "Decking Input" : "Dry"));
        const typeArea = override.typeArea || defaultType;

        let defaultProd = "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP";
        if (typeArea === "Wet") defaultProd = "FC FLOORING SECURA JH++2700X600X19MM INTERNAL 405592";
        else if (typeArea === "Balcony Tiles") defaultProd = "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592";
        else if (typeArea === "Decking Input") defaultProd = "HARDWOOD DECKING 90X19MM MERBAU";
        else if (typeArea === "T+G Flooring Area") defaultProd = "FLOORING SPOTTED GUM++85X19MM L/M PREM S&B T&G EM";

        const product = override.product || r.product || defaultProd;
        const groupKey = `${typeArea}___${product}`;

        if (!groupsMap[groupKey]) {
          groupsMap[groupKey] = {
            typeArea,
            product,
            areaM2: 0,
            count: 0,
            roomIds: []
          };
        }
        groupsMap[groupKey].areaM2 += areaM2;
        groupsMap[groupKey].count += 1;
        groupsMap[groupKey].roomIds.push(r.id);
      });

      const newFlrEntries = [];
      Object.entries(groupsMap).forEach(([key, g]) => {
        newFlrEntries.push({
          id: g.count === 1 && g.roomIds.length === 1 ? `flr-single-${g.roomIds[0]}` : `flr-grp-${key}`,
          roomId: g.count === 1 && g.roomIds.length === 1 ? g.roomIds[0] : undefined,
          roomIds: g.roomIds,
          typeArea: g.typeArea,
          location: g.typeArea,
          product: g.product,
          areaM2: Number(g.areaM2.toFixed(2)),
          wastePercent: 10,
          totalM2: Number(g.areaM2.toFixed(1)),
          glueType: "FLOORING ADHESIVE 600ML SAUSAGE",
          glueQty: Math.ceil((g.areaM2 * 1.1) / 12)
        });
      });

      setFlooringEntries(newFlrEntries);
      setHebelFlooringEntries(newFlrEntries.map(e => ({
        ...e,
        id: e.id.replace("flr-", "hebel-"),
        product: "HEBEL POWERFLOOR PANEL 1800X600X75MM",
        hebelQty: Math.ceil((e.totalM2 || e.areaM2) / 1.08)
      })));

      aiValues = {
        dryArea: dry > 0 ? dry.toFixed(2) : "",
        wetArea: wet > 0 ? wet.toFixed(2) : "",
        balconyArea: tile > 0 ? tile.toFixed(2) : "",
        otherArea: timber > 0 ? timber.toFixed(2) : "",
        totalFloorArea: totalRaw > 0 ? totalRaw.toFixed(2) : (totalRoomArea > 0 ? String(totalRoomArea) : "0"),
        location: "Ground Floor",
        flooring_type: "Hybrid / Vinyl Plank",
        floor_area: totalRaw > 0 ? totalRaw.toFixed(2) : (totalRoomArea > 0 ? String(totalRoomArea) : "0"),
        waste_allowance: "10"
      };
    } else if (moduleId === "insulation") {
      const extLen = externalWallLength > 0 ? externalWallLength : (grandTotalLength ? grandTotalLength * 0.6 : 0);
      const intLen = internalWallLength > 0 ? internalWallLength : (grandTotalLength ? grandTotalLength * 0.4 : 0);
      const extArea = Number((extLen * 2.4).toFixed(2));
      const intArea = Number((intLen * 2.4).toFixed(2));
      const ceilArea = Number((totalRoomArea > 0 ? totalRoomArea : (totalRaw > 0 ? totalRaw : 0)).toFixed(2));

      const newInsWalls = [];
      if (extLen > 0) {
        newInsWalls.push({ id: "ins-ai-ext-" + Date.now(), type: "Ext wall", height: 2400, length: Math.round(extLen * 1000), rValue: "R2.5", product: "0810602 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.5HP 90X430 PK12", raked: 0, door: 0, insulationArea: extArea });
      }
      if (intLen > 0) {
        newInsWalls.push({ id: "ins-ai-int-" + Date.now(), type: "Int wall", height: 2400, length: Math.round(intLen * 1000), rValue: "R2.0", product: "0810608 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.0 75X430 PK20", raked: 0, door: 0, insulationArea: intArea });
      }
      setInsulationWallEntries(newInsWalls);

      if (ceilArea > 0) {
        setInsulationAreaEntries([
          { id: "ins-ai-ceil-" + Date.now(), location: "Ceiling / Roof Space", areaType: "Ceiling", rValue: "R4.0", areaM2: ceilArea, totalArea: Number((ceilArea * 1.05).toFixed(2)) }
        ]);
      } else {
        setInsulationAreaEntries([]);
      }
      aiValues = {
        ext_wall_area: String(extArea),
        int_wall_area: String(intArea),
        ceiling_area: String(ceilArea)
      };
    } else if (moduleId === "eaves_soffit") {
      const len = totalRoofArea > 0 ? Number((Math.sqrt(totalRoofArea) * 4).toFixed(2)) : (cadMetrics?.perimeterM || (grandTotalLength ? Number((grandTotalLength * 0.55).toFixed(2)) : 0));
      if (len > 0) {
        setEavesEntries([
          { id: "eave-ai-1-" + Date.now(), level: "Ground Floor Perimeter", width: 450, length: len, area: Number((len * 0.45).toFixed(2)) }
        ]);
      } else {
        setEavesEntries([]);
      }
      aiValues = { building_level: "Level 1 (Ground)", eave_width: "450", total_eave_length: String(len), soffit_material: "4.5mm HardieFlex / FC Sheet" };
    } else if (moduleId === "cladding") {
      const extLen = externalWallLength > 0 ? externalWallLength : 0;
      if (extLen > 0) {
        setCladdingWallEntries([
          { id: "clad-ai-1-" + Date.now(), elevation: "Front & Side A Elevation", height: 2700, length: Math.round(extLen * 600), openings: 4.2, waste: 10, grossArea: Number((extLen * 0.6 * 2.7).toFixed(2)), netArea: Number((extLen * 0.6 * 2.7 - 4.2).toFixed(2)), totalArea: Number(((extLen * 0.6 * 2.7 - 4.2) * 1.1).toFixed(2)) },
          { id: "clad-ai-2-" + Date.now(), elevation: "Rear & Side B Elevation", height: 2700, length: Math.round(extLen * 400), openings: 3.1, waste: 10, grossArea: Number((extLen * 0.4 * 2.7).toFixed(2)), netArea: Number((extLen * 0.4 * 2.7 - 3.1).toFixed(2)), totalArea: Number(((extLen * 0.4 * 2.7 - 3.1) * 1.1).toFixed(2)) }
        ]);
      } else {
        setCladdingWallEntries([]);
      }
      aiValues = { elevation: "External Walls", cladding_type: "HardiePlank Weatherboard", cladding_area: (extLen * 2.7 * 0.9).toFixed(2), waste_allowance: "10" };
    } else if (moduleId === "timber_posts") {
      if (grandTotalLength > 0 || (curWalls && curWalls.length > 0)) {
        setTimberPostEntries([
          { id: "pst-ai-1-" + Date.now(), location: "Alfresco & Porch Support", spec: "90x90mm F7 / H3 Treated Pine", height: 2700, qty: 4, supportType: "Hot-Dip Galvanized Stirrup" }
        ]);
        aiValues = { location: "Alfresco & Porch", timber_size: "90x90mm F7 / H3 Treated Pine", height: "2700", quantity: "4" };
      } else {
        setTimberPostEntries([]);
      }
    } else if (moduleId === "fixout") {
      const skirtLm = skirtingSummaryMetrics?.totalSkirtingLm ? Number(skirtingSummaryMetrics.totalSkirtingLm.toFixed(2)) : (internalWallLength ? Number((internalWallLength * 2).toFixed(2)) : 0);
      if (curDoors && curDoors.length > 0) {
        const generated = curDoors.map((d, idx) => {
          const dLabel = d.label || d.name || d.door_name || `D-${idx + 1}`;
          const rawType = String(d.door_type || d.type || "").toLowerCase();
          const isCavity = /slide|sliding|cavity/i.test(dLabel) || /slide|cavity/i.test(rawType);
          const dWidth = getDoorWidthInMm(d, realScale, scaleValue);
          const dHeight = getDoorHeightInMm(d);
          return {
            id: `fix-ai-${d.id || idx}-${Date.now()}`,
            category: isCavity ? "cavity" : "prehung",
            door_label: dLabel,
            door_type: d.door_type || "ASC",
            height: dHeight,
            width: dWidth,
            thicks: "35",
            wall_width: String(d.wall_thickness || 90),
            door_frame: "Timber Jamb",
            lift_off_pivot: "",
            handing: isCavity ? "" : "RH",
            hole: isCavity ? "" : "HF",
            finish: isCavity ? "" : "CHR",
            door_furniture: isCavity ? "cavity-passage" : "passage",
            door_stop: isCavity ? "none" : "cushion",
            qty: 1
          };
        });
        setFixoutDoorEntries(generated);
      } else {
        setFixoutDoorEntries([]);
      }
      aiValues = { skirting_profile: "67x18mm MDF Single Rebatable / Colonial", architrave_size: "67x18mm MDF Architrave", jamb_type: "Single Rebated Pine Door Jamb Set", total_length: String(skirtLm) };
    } else if (moduleId === "lock_up" || moduleId === "lockup") {
      const extLen = externalWallLength > 0 ? externalWallLength : (grandTotalLength ? Number((grandTotalLength * 0.65).toFixed(2)) : 46.8);
      const generatedDoors = [];

      if (curDoors && curDoors.length > 0) {
        curDoors.forEach((d, idx) => {
          const dLabel = (d.door_name || d.doorName || d.doorLabel || (d.label && !/single|sliding|window|door/i.test(d.label) ? d.label : null) || `D-${idx + 1}`).trim();
          const rawType = String(d.door_type || d.type || "").toLowerCase();
          const isExt = Boolean(
            d.is_ext ||
            d.is_exterior ||
            d.isExternal ||
            d.location === "external" ||
            d.scope === "external" ||
            (d.doorTypeId && String(d.doorTypeId).startsWith("ext_")) ||
            (d.class && String(d.class).includes("ext")) ||
            (d.type && String(d.type).includes("ext")) ||
            /entry|front|sliding|patio|balcony|garage|external/i.test(dLabel) ||
            /entry|sliding|external/i.test(rawType)
          );
          const isSliding = /slide|sliding|cavity/i.test(dLabel) || /slide|cavity/i.test(rawType);

          const category = d.category || (d.mode === "Loose" ? "Loose Jamb" : (d.mode === "Prehung" ? "Prehung" : "-"));
          const isLoose = category === "Loose Jamb";
          const dWidth = getDoorWidthInMm(d, realScale, scaleValue);
          const dHeight = getDoorHeightInMm(d);
          const wallThick = d.wall_thickness || d.thickness_mm || 90;
          const dHinge = String(d.hingeSide || d.hinge_side || d.handing || d.hung || "").toLowerCase();
          const isRight = dHinge.includes("right") || dHinge.includes("rh") || dHinge === "hung a";
          const isLeft = dHinge.includes("left") || dHinge.includes("lh") || dHinge === "hung b";
          const hung = isRight ? "Hung A" : (isLeft ? "Hung B" : (isExt ? "Hung B" : "Hung A"));

          generatedDoors.push({
            id: `lck-door-${d.id || idx}-${Date.now()}`,
            doorId: d.id,
            category: category,
            mode: d.mode || (isLoose ? "Loose" : (category === "Prehung" ? "Prehung" : null)),
            scope: isExt ? "external" : "internal",
            location: isExt ? "External" : "Internal",
            label: dLabel,
            door_name: dLabel,
            height: dHeight,
            width: dWidth,
            thickness: isExt && !isSliding ? 40 : 35,
            jamb_or_wall: `${wallThick}mm Wall`,
            jamb_size: isLoose ? "112×19mm 5.4m Loose Jamb" : "",
            hung: hung,
            door_type: d.door_type || d.lockup_door_type || "",
            type: "-",
            door_stop: isExt ? "DS2 with Riser" : "Cushion",
            internal_type: isExt ? null : "HF",
            color: isExt ? null : "CHR",
            default_qty: 1
          });
        });
      }

      setLockupEntries(generatedDoors);
      aiValues = {
        building_level: "All Levels (Ground & Upper)",
        door_spec: "Solid Core Entry & Aluminium Sliding",
        weather_seal: "Parfix Sikaflex & Sarking Foil",
        perimeter_length: String(typeof extLen === "number" ? extLen.toFixed(2) : extLen)
      };
    } else if (moduleId === "power_truss_braces") {
      const spanM = cadMetrics.buildingWidth || (grandTotalLength ? Number((grandTotalLength * 0.25).toFixed(1)) : 8.5);
      const runM = cadMetrics.buildingLength || (grandTotalLength ? Number((grandTotalLength * 0.4).toFixed(1)) : 14.0);
      const qty = Math.floor(runM / 0.6) + 1;
      const totalLm = Number((spanM * 2.8 * qty).toFixed(1));
      setTrussEntries([
        { id: "truss-ai-1-" + Date.now(), label: "T01 - Common Standard Truss", trussType: "common", spanM, runLengthM: runM, spacingMm: 600, quantity: qty, totalTimberLm: totalLm, speedbraceRolls: Math.ceil((runM * 2.5) / 50) }
      ]);
      aiValues = { bracing_type: "Pryda Speedbrace Galvanised Strap", truss_span: String(spanM), brace_qty: String(Math.ceil((runM * 2.5) / 50)) };
    } else if (moduleId === "doors_furniture") {
      aiValues = {
        door_type: "Internal Flush Door",
        handle_style: "Lever on Rose Satin Chrome",
        hinge_type: "100mm Stainless Steel Butt Hinge"
      };
    } else if (moduleId === "shelving") {
      setShelvingEntries([
        { id: "shv-ai-1-" + Date.now(), type: "Robe", size: "1800×450", qty: 2 },
        { id: "shv-ai-2-" + Date.now(), type: "Linen", size: "1500×450", qty: 1 }
      ]);
      aiValues = {
        shelf_material: "16mm White Melamine Board",
        shelf_depth: "450 mm",
        total_runs: "4"
      };
    } else if (moduleId === "fow_plumbing") {
      setFowPlumbingEntries([
        { id: "plumb-ai-1-" + Date.now(), itemName: "Toilet Suite", code: "TS-01", description: "Dual flush 4.5/3L back to wall toilet suite", qty: 2, note: "Ensuite & Main Bath" },
        { id: "plumb-ai-2-" + Date.now(), itemName: "Basin Mixer", code: "BM-01", description: "Standard chrome finish, WELS 4 star", qty: 2, note: "Vanity basins" },
        { id: "plumb-ai-3-" + Date.now(), itemName: "Shower Mixer", code: "SM-01", description: "Ceramic disc mixer with swivel spout", qty: 2, note: "Showers" },
        { id: "plumb-ai-4-" + Date.now(), itemName: "Kitchen Mixer", code: "KM-01", description: "Standard chrome finish, WELS 4 star", qty: 1, note: "Kitchen sink" },
        { id: "plumb-ai-5-" + Date.now(), itemName: "Laundry Tub & Cabinet", code: "LT-01", description: "45L Stainless steel tub with polymer cabinet", qty: 1, note: "Laundry room" },
      ]);
      aiValues = {
        pipe_type: "PEX Flexible Water Pipe",
        drain_size: "100mm PVC DWV Pipe",
        fixtures_count: "8"
      };
    } else if (moduleId === "power_truss_braces") {
      setPowerTrussEntries([
        { id: "ptb-ai-1-" + Date.now(), wallHeight: "2700", length: "4500", type: "Column", qty: 2 },
        { id: "ptb-ai-2-" + Date.now(), wallHeight: "2700", length: "6000", type: "Brace", qty: 1 },
      ]);
      aiValues = {
        wall_height: "2700",
        length: "4500",
        type: "Column",
        qty: "2"
      };
    } else if (moduleId === "final_fit") {
      aiValues = {
        handle_set: "Gainsborough Choice Lever Set",
        latch_count: String(curDoors.length || 7),
        door_stop_type: "Baseboard Rubber Door Stop & 100mm SS Hinges",
        entrance_lock: "Gainsborough Trilock Keyed Set"
      };
    } else if (moduleId === "sheet_schedule") {
      aiValues = {
        wall_sheet: "10mm Gyprock RE Plasterboard",
        ceiling_sheet: "10mm Supaceil Ceiling Board",
        sheet_size: "3000 x 1200 mm",
        total_area: grandTotalArea ? (grandTotalArea * 2.2).toFixed(2) : "185.00"
      };
    }

    setModuleFormData(prev => ({
      ...prev,
      [moduleId]: {
        ...(prev[moduleId] || {}),
        ...aiValues
      }
    }));

    setAiGeneratedSuccess(moduleId);
    setTimeout(() => setAiGeneratedSuccess(null), 2500);
  };

  // Auto-expand floor when switching pages
  React.useEffect(() => {
    if (currentPage !== undefined) {
      setExpandedNodes(prev => {
        const next = new Set(prev);
        next.add("root");
        next.add(`floor_${currentPage}`);
        return next;
      });
    }
  }, [currentPage]);

  // Auto-expand group & scroll to selected element when user clicks any layer item on 2D/3D UI
  React.useEffect(() => {
    const targetId = selectedId || (selectedWallIds && selectedWallIds[0]) || selectedRoofId;
    if (!targetId) return;

    const pageIdx = currentPage !== undefined ? currentPage : 0;
    const floorKey = `floor_${pageIdx}`;

    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.add("root");
      next.add(floorKey);

      if (selectedType === "wall" || (selectedWallIds && selectedWallIds.length > 0)) {
        next.add(`${floorKey}_walls`);
      } else if (selectedType === "door" || selectedType === "window") {
        const pageDoors = doorsByPageProp[pageIdx] || (pageIdx === currentPage ? (doors || []) : []);
        const targetDoor = pageDoors.find(d => d.id === targetId);
        const isWin = selectedType === "window" || targetDoor?.is_window || targetDoor?.type === "window" || String(targetDoor?.id || "").startsWith("win_");
        if (isWin) {
          next.add(`${floorKey}_windows`);
        } else {
          next.add(`${floorKey}_doors`);
        }
      } else if (selectedType === "room") {
        next.add(`${floorKey}_rooms`);
      } else if (selectedType === "lintel") {
        next.add(`${floorKey}_lintels`);
      } else if (selectedType === "roof" || selectedRoofId) {
        next.add(`${floorKey}_roofs`);
      }
      return next;
    });

    // Auto-scroll to selected element in Explorer tree with smooth transition & highlight
    const timer = setTimeout(() => {
      const el = document.getElementById(`explorer-item-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [selectedId, selectedType, selectedWallIds, selectedRoofId, currentPage, doorsByPageProp, doors]);

  // ── HOTKEY 'E' TO DIRECTLY OPEN PROPERTIES OF SELECTED LAYER / ITEM ──
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isEditingText = activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.tagName === "SELECT" ||
        activeEl.isContentEditable
      );
      if (isEditingText) return;

      if ((e.key === "e" || e.key === "E" || e.code === "KeyE") && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const hasSelection = Boolean(
          selectedId ||
          selectedType ||
          (selectedWallIds && selectedWallIds.length > 0) ||
          (selectedDoorIds && selectedDoorIds.length > 0) ||
          (selectedRoomIds && selectedRoomIds.length > 0) ||
          (selectedLintelIds && selectedLintelIds.length > 0) ||
          selectedRoofId
        );

        if (hasSelection) {
          e.preventDefault();
          setActivePaneTab("explorer");
          setExplorerViewMode("properties");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, selectedType, selectedWallIds, selectedDoorIds, selectedRoomIds, selectedLintelIds, selectedRoofId]);

  const toggleNode = React.useCallback((nodeId) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const expandAllNodes = React.useCallback(() => {
    const all = new Set(["root"]);
    const pageList = pages.length > 0 ? pages : [{ id: 0, name: "Ground Floor" }];
    pageList.forEach((_, idx) => {
      all.add(`floor_${idx}`);
      all.add(`floor_${idx}_walls`);
      all.add(`floor_${idx}_doors`);
      all.add(`floor_${idx}_windows`);
      all.add(`floor_${idx}_rooms`);
      all.add(`floor_${idx}_lintels`);
      all.add(`floor_${idx}_roofs`);
    });
    setExpandedNodes(all);
  }, [pages]);

  const collapseAllNodes = React.useCallback(() => {
    setExpandedNodes(new Set(["root"]));
  }, []);

  const showAllHidden = React.useCallback(() => {
    if (setHiddenItemIds) setHiddenItemIds(new Set());
  }, [setHiddenItemIds]);

  // ── RENAME FLOOR HANDLER ──
  const handleRenameFloor = async (e, pageIdx, currentName) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const currentDisplayName = mapFloorName(currentName, pageIdx);
    const newName = await showPrompt("Nhập tên tầng mới (Floor Name):", currentDisplayName);
    if (newName !== null && newName.trim() && setPages) {
      const trimmed = newName.trim();
      const classVal = convertNameToClass(trimmed, pageIdx);
      setPages(prev => prev.map((p, i) =>
        i === pageIdx ? { ...p, floor_name: classVal, name: trimmed } : p
      ));
    }
  };

  // ── RENAME ROOM HANDLER ──
  const handleRenameRoom = async (e, pageIdx, r) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const currentName = r.room_name || r.name || "Room";
    const newName = await showPrompt("Nhập tên phòng mới (Room Name):", currentName);
    if (newName !== null && newName.trim()) {
      const trimmed = newName.trim();
      if (setRoomsByPage) {
        setRoomsByPage(prev => ({
          ...prev,
          [pageIdx]: (prev[pageIdx] || []).map(rm => rm.id === r.id ? { ...rm, room_name: trimmed, name: trimmed } : rm)
        }));
      }
      if (updateRoom && selectedId === r.id) {
        updateRoom("room_name", trimmed);
      }
    }
  };

  // ── SELECTION & NAVIGATION HANDLERS FOR TREE EXPLORER ──
  const selectExclusiveWall = React.useCallback((e, targetPageIdx, w, isMulti = false) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (goPage && targetPageIdx !== currentPage) goPage(targetPageIdx);
    if (setSelectedRoofId) setSelectedRoofId(null);
    if (setSelectedDoorIds) setSelectedDoorIds([]);
    if (setSelectedRoomIds) setSelectedRoomIds([]);
    if (setSelectedLintelIds) setSelectedLintelIds([]);
    if (setSelectedAnnotationId) setSelectedAnnotationId(null);
    if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
    if (isMulti) {
      if (selectedWallIds.includes(w.id)) {
        if (setSelectedWallIds) setSelectedWallIds(selectedWallIds.filter(id => id !== w.id));
      } else {
        if (setSelectedWallIds) setSelectedWallIds([...selectedWallIds, w.id]);
      }
    } else {
      if (setSelectedId) setSelectedId(w.id);
      if (setSelectedType) setSelectedType("wall");
      if (setSelectedWallIds) setSelectedWallIds([w.id]);
      if (selectWall) selectWall(w.id);
    }
  }, [goPage, currentPage, setSelectedRoofId, setSelectedDoorIds, setSelectedRoomIds, setSelectedLintelIds, setSelectedAnnotationId, setSelectedAnnotationIds, selectedWallIds, setSelectedWallIds, setSelectedId, setSelectedType, selectWall]);

  const selectExclusiveDoor = React.useCallback((e, targetPageIdx, d) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (goPage && targetPageIdx !== currentPage) goPage(targetPageIdx);
    if (setSelectedRoofId) setSelectedRoofId(null);
    if (setSelectedWallIds) setSelectedWallIds([]);
    if (setSelectedRoomIds) setSelectedRoomIds([]);
    if (setSelectedLintelIds) setSelectedLintelIds([]);
    if (setSelectedAnnotationId) setSelectedAnnotationId(null);
    if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
    const isMulti = e && (e.shiftKey || e.ctrlKey || e.metaKey);
    const isWin = d.class === 'window' || d.type === 'window' || (d.doorTypeId && d.doorTypeId.startsWith('win_'));
    if (isMulti) {
      if (selectDoor) {
        selectDoor(d.id, true, isWin ? "window" : "door");
      } else if (setSelectedDoorIds) {
        setSelectedDoorIds(prev => prev.includes(d.id) ? prev.filter(id => id !== d.id) : [...prev, d.id]);
        setSelectedId(d.id);
        setSelectedType(isWin ? "window" : "door");
      }
    } else {
      if (setSelectedId) setSelectedId(d.id);
      if (setSelectedType) setSelectedType(isWin ? "window" : "door");
      if (setSelectedDoorIds) setSelectedDoorIds([d.id]);
    }
  }, [goPage, currentPage, setSelectedRoofId, setSelectedWallIds, setSelectedRoomIds, setSelectedLintelIds, setSelectedAnnotationId, setSelectedAnnotationIds, setSelectedId, setSelectedType, setSelectedDoorIds, selectDoor]);

  const selectExclusiveRoom = React.useCallback((e, targetPageIdx, r) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (goPage && targetPageIdx !== currentPage) goPage(targetPageIdx);
    if (setSelectedRoofId) setSelectedRoofId(null);
    if (setSelectedWallIds) setSelectedWallIds([]);
    if (setSelectedDoorIds) setSelectedDoorIds([]);
    if (setSelectedLintelIds) setSelectedLintelIds([]);
    if (setSelectedAnnotationId) setSelectedAnnotationId(null);
    if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
    if (setSelectedId) setSelectedId(r.id);
    if (setSelectedType) setSelectedType("room");
    if (setSelectedRoomIds) setSelectedRoomIds([r.id]);
  }, [goPage, currentPage, setSelectedRoofId, setSelectedWallIds, setSelectedDoorIds, setSelectedLintelIds, setSelectedAnnotationId, setSelectedAnnotationIds, setSelectedId, setSelectedType, setSelectedRoomIds]);

  const selectExclusiveLintel = React.useCallback((e, targetPageIdx, l) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (goPage && targetPageIdx !== currentPage) goPage(targetPageIdx);
    if (setSelectedRoofId) setSelectedRoofId(null);
    if (setSelectedWallIds) setSelectedWallIds([]);
    if (setSelectedDoorIds) setSelectedDoorIds([]);
    if (setSelectedRoomIds) setSelectedRoomIds([]);
    if (setSelectedAnnotationId) setSelectedAnnotationId(null);
    if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
    if (setSelectedId) setSelectedId(l.id);
    if (setSelectedType) setSelectedType("lintel");
    if (setSelectedLintelIds) setSelectedLintelIds([l.id]);
  }, [goPage, currentPage, setSelectedRoofId, setSelectedWallIds, setSelectedDoorIds, setSelectedRoomIds, setSelectedAnnotationId, setSelectedAnnotationIds, setSelectedId, setSelectedType, setSelectedLintelIds]);

  const selectExclusiveRoof = React.useCallback((e, targetPageIdx, rf) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (goPage && targetPageIdx !== currentPage) goPage(targetPageIdx);
    if (setSelectedWallIds) setSelectedWallIds([]);
    if (setSelectedDoorIds) setSelectedDoorIds([]);
    if (setSelectedRoomIds) setSelectedRoomIds([]);
    if (setSelectedLintelIds) setSelectedLintelIds([]);
    if (setSelectedAnnotationId) setSelectedAnnotationId(null);
    if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
    if (setSelectedRoofId) setSelectedRoofId(rf.id);
    if (setSelectedId) setSelectedId(rf.id);
    if (setSelectedType) setSelectedType("roof");
    setExplorerViewMode("properties");
  }, [goPage, currentPage, setSelectedWallIds, setSelectedDoorIds, setSelectedRoomIds, setSelectedLintelIds, setSelectedAnnotationId, setSelectedAnnotationIds, setSelectedRoofId, setSelectedId, setSelectedType, setExplorerViewMode]);

  const [taskListJobs, setTaskListJobs] = React.useState([]);
  const [taskLoading, setTaskLoading] = React.useState(false);
  const [taskError, setTaskError] = React.useState(null);
  const [taskSearch, setTaskSearch] = React.useState("");
  const [taskFilter, setTaskFilter] = React.useState("all"); // "all" | "completed" | "pending"
  const [staffScope, setStaffScope] = React.useState("all"); // "all" | "my"
  const [taskDisplayLimit, setTaskDisplayLimit] = React.useState(30);
  const [loadingJobId, setLoadingJobId] = React.useState(null);

  // Mã nhân viên của người dùng hiện tại (e.g. EZE0098)
  const myStaffCode = React.useMemo(() => {
    if (user?.username && user.username.toUpperCase().startsWith("EZE")) {
      return user.username.toUpperCase();
    }
    return "EZE0098";
  }, [user]);

  const hasFetchedTasksRef = React.useRef(false);

  // Tải danh sách Task Groups HW từ TaskList Web3 / Local DB
  const fetchTasks = React.useCallback(async (forceRefresh = false) => {
    try {
      setTaskLoading(true);
      setTaskError(null);
      const res = await ApiService.fetchTaskListJobs(2000, forceRefresh);
      if (res && res.status === "success" && Array.isArray(res.data)) {
        setTaskListJobs(res.data);
        try {
          localStorage.setItem("cachedTaskListJobs", JSON.stringify(res.data));
        } catch (e) { }
      } else {
        setTaskListJobs([]);
      }
    } catch (err) {
      console.error("Error fetching Task Groups HW:", err);
      let loadedFromCache = false;
      try {
        const cached = localStorage.getItem("cachedTaskListJobs");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTaskListJobs(parsed);
            loadedFromCache = true;
          }
        }
      } catch (e) { }
      if (!loadedFromCache) {
        setTaskError(err.message || "Không thể tải danh sách Task Groups HW");
        setTaskListJobs([]);
      }
    } finally {
      setTaskLoading(false);
    }
  }, []);

  // Tự động tải ngầm danh sách Task Groups HW 1 lần duy nhất khi khởi tạo
  React.useEffect(() => {
    if (!hasFetchedTasksRef.current) {
      hasFetchedTasksRef.current = true;
      fetchTasks(false);
    }
  }, [fetchTasks]);

  // Xử lý mở/chọn 1 Job Task
  const handleOpenJobTask = async (task) => {
    if (!task) return;
    const targetName = task.job_number || task.hw_id || "Project";
    if (setCurrentProjectName) setCurrentProjectName(targetName);

    let currentTask = task;
    const emsId = task.id_job_ems || task.ems_id || task.hw_id || task.id;
    if (emsId) {
      try {
        const emsRes = await ApiService.getJobByEmsId(emsId);
        if (emsRes?.status === "success" && emsRes.data) {
          currentTask = { ...task, ...emsRes.data };
        }
      } catch (err) {
        console.warn("Could not fetch EMS details for task:", err);
      }
    }

    // 0. Sử dụng task_modules / selected_modules từ API làm nguồn chân lý cao nhất
    const authoritativeMods = Array.isArray(currentTask.task_modules)
      ? currentTask.task_modules
      : (Array.isArray(currentTask.selected_modules)
        ? currentTask.selected_modules.map(m => typeof m === "string" ? m : m.module_id).filter(Boolean)
        : null);

    if (Array.isArray(authoritativeMods)) {
      setEnabledModuleIds(authoritativeMods);
      try {
        sessionStorage.setItem("selectedModules", JSON.stringify(authoritativeMods));
      } catch (_) { }
    } else {
      const taskModules = sanitizeModuleIds(resolveTaskModules(currentTask), selectedCustomerClient);
      if (taskModules && taskModules.length > 0) {
        setEnabledModuleIds(taskModules);
        try {
          sessionStorage.setItem("selectedModules", JSON.stringify(taskModules));
        } catch (_) { }
      }
    }

    // Lưu thông tin pendingEmsJob vào sessionStorage để đồng bộ SQL (loại bỏ data bản vẽ nặng)
    try {
      const { local_job, ...metaWithoutDrawing } = currentTask;
      const cleanTaskMeta = {
        ...metaWithoutDrawing,
        local_job: local_job ? {
          id: local_job.id,
          project_name: local_job.project_name,
          room_count: local_job.room_count,
          total_area: local_job.total_area
        } : null
      };
      sessionStorage.setItem("pendingEmsJob", JSON.stringify(cleanTaskMeta));
    } catch (_) { }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("task-modules-updated", { detail: currentTask }));
    }

    // 1. Kiểm tra đối chiếu xem Job đã có dữ liệu bản vẽ đã lưu trong CSDL SQLite hay chưa
    let loadedSuccess = false;
    const localJobId = currentTask.local_job?.id || task.local_job?.id;
    const localJobData = currentTask.local_job?.data || task.local_job?.data;

    // A. Nếu có local_job data inline
    if (localJobData) {
      try {
        const parsed = typeof localJobData === "string" ? JSON.parse(localJobData) : localJobData;
        if (onLoadJob) {
          onLoadJob(parsed, currentTask.local_job?.project_name || task.local_job?.project_name || targetName, localJobId);
        }
        if (setActiveTab) setActiveTab("Home");
        loadedSuccess = true;
      } catch (err) {
        console.warn("[handleOpenJobTask] Lỗi parse inline local_job data:", err);
      }
    } else if (localJobId) {
      // B. Nếu có ID trong SQLite -> tải chi tiết bản vẽ
      try {
        setLoadingJobId(task.hw_id);
        const res = await ApiService.getJobData(localJobId);
        if (res && res.status === "success" && res.data) {
          const parsed = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
          if (onLoadJob) {
            onLoadJob(parsed, currentTask.local_job?.project_name || task.local_job?.project_name || targetName, localJobId);
          }
          if (setActiveTab) setActiveTab("Home");
          loadedSuccess = true;
        }
      } catch (err) {
        console.warn("[handleOpenJobTask] Could not load local job data by ID:", err);
      } finally {
        setLoadingJobId(null);
      }
    }

    // C. Nếu chưa tìm thấy qua task metadata, thử tìm trực tiếp trong SQLite qua ApiService.findJob
    if (!loadedSuccess && targetName) {
      try {
        setLoadingJobId(task.hw_id);
        const findRes = await ApiService.findJob(targetName);
        if (findRes && findRes.status === "success" && findRes.found && findRes.data) {
          const parsed = typeof findRes.data === "string" ? JSON.parse(findRes.data) : findRes.data;
          if (onLoadJob) {
            onLoadJob(parsed, findRes.project_name || targetName, findRes.job_id);
          }
          if (setActiveTab) setActiveTab("Home");
          loadedSuccess = true;
        }
      } catch (err) {
        console.warn("[handleOpenJobTask] Could not find job by name in SQLite:", err);
      } finally {
        setLoadingJobId(null);
      }
    }

    if (!loadedSuccess) {
      // 2. Nếu chưa có bản vẽ trong SQLite: XÓA SẠCH workspace cũ mở trang mới trắng
      console.log("[handleOpenJobTask] Job chưa có bản vẽ trong SQLite, reset sạch workspace mở trang trắng cho:", targetName);

      // 2a. ĐẶT FLAG chặn restore — phải đặt TRƯỚC khi clear state để App.jsx không restore lại data cũ
      try {
        sessionStorage.setItem("ezefloor_skip_restore", "1");
      } catch (_) { }

      // 2b. Clear IndexedDB workspace cache TRƯỚC (await để đảm bảo xóa xong trước khi state thay đổi)
      try {
        await clearWorkspaceState("active_session");
        console.log("[handleOpenJobTask] IndexedDB active_session cleared successfully");
      } catch (err) {
        console.warn("[handleOpenJobTask] Could not clear IndexedDB:", err);
      }

      // 2c. Clear relevant localStorage keys
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("ezefloor_last_active_job_id");
          localStorage.removeItem("ezefloor_last_active_project_name");
        }
      } catch (_) { }

      // 2d. Clear React state — pages, walls, rooms, doors, roofs, lintels, trusses, scales, annotations
      // (Phải thực hiện SAU khi IndexedDB đã xóa xong để restore effect không đọc được data cũ)
      if (setPagesContext) setPagesContext([]);
      if (setWallsByPageCtx) setWallsByPageCtx({});
      if (setDoorsByPageCtx) setDoorsByPageCtx({});
      if (setRoomsByPage) setRoomsByPage({});
      if (setRoofsByPage) setRoofsByPage({});
      if (setLintelsByPageCtx) setLintelsByPageCtx({});
      if (setTrussesByPageCtx) setTrussesByPageCtx({});
      if (setScalesByPageCtx) setScalesByPageCtx({});
      if (setWasteByPage) setWasteByPage({});
      if (setAnnotationsByPage) setAnnotationsByPage({});
      if (setAnnotationsHistoryCtx) setAnnotationsHistoryCtx([]);
      if (setAnnotationsFutureCtx) setAnnotationsFutureCtx([]);
      if (setSelectedAnnotationId) setSelectedAnnotationId(null);
      if (setSelectedAnnotationIds) setSelectedAnnotationIds([]);
      if (setActiveAnnotationToolCtx) setActiveAnnotationToolCtx(null);

      // 2e. Clear selection & interaction state
      if (setSelectedId) setSelectedId(null);
      if (setSelectedType) setSelectedType(null);
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setSelectedLintelIds) setSelectedLintelIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setCurrentPageProp) setCurrentPageProp(0);

      // 2f. Set project name & job context for the new job
      if (setCurrentProjectName) setCurrentProjectName(targetName);
      if (setCurrentJobId) setCurrentJobId(null);
      if (setActiveTab) setActiveTab("Home");

      // 2g. Tự động kích hoạt chọn bản vẽ PDF / Ảnh để người dùng bắt đầu vẽ ngay
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".pdf,image/*";
      fileInput.style.display = "none";
      fileInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Đảm bảo tên dự án luôn gắn chặt với job_number của Task HW để đồng bộ SQL
        if (setCurrentProjectName) setCurrentProjectName(targetName);

        if (file.type === "application/pdf") {
          if (loadPDF) loadPDF(file);
        } else {
          const url = URL.createObjectURL(file);
          const imgData = { image: url, w: 2000, h: 1500, fileName: targetName };
          if (setPendingPages) setPendingPages([imgData]);
          if (setImportSelectedPages) setImportSelectedPages([0]);
          if (setIsAddingPagesMode) setIsAddingPagesMode(false);
          if (setShowImportPageSelector) setShowImportPageSelector(true);
        }
      };
      document.body.appendChild(fileInput);
      fileInput.click();
      setTimeout(() => {
        try {
          if (document.body.contains(fileInput)) {
            document.body.removeChild(fileInput);
          }
        } catch (_) { }
      }, 1000);
    }
  };

  const [isRoofSummaryExpanded, setIsRoofSummaryExpanded] = React.useState(true);
  const lastSingleWallIdRef = React.useRef(null);

  // Auto-scroll to selected roof card and expand roof summary
  React.useEffect(() => {
    if (selectedRoofId) {
      setIsRoofSummaryExpanded(true);
      setTimeout(() => {
        const el = document.getElementById(`roof-card-${selectedRoofId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 100);
    }
  }, [selectedRoofId]);

  // Auto-scroll to selected roof edge row within the contour table
  React.useEffect(() => {
    if (selectedRoofId && selectedRoofEdgeIndex !== null && selectedRoofEdgeIndex !== undefined) {
      setTimeout(() => {
        const rowEl = document.getElementById(`roof-edge-row-${selectedRoofId}-${selectedRoofEdgeIndex}`);
        if (rowEl) {
          rowEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 60);
    }
  }, [selectedRoofId, selectedRoofEdgeIndex]);

  // Track single wall selection before bulk edit
  React.useEffect(() => {
    if (selectedWallIds.length === 1) {
      lastSingleWallIdRef.current = selectedWallIds[0];
    } else if (selectedWall?.id && selectedWallIds.length <= 1) {
      lastSingleWallIdRef.current = selectedWall.id;
    }
  }, [selectedWallIds, selectedWall]);

  // Auto-switch to properties mode when an annotation is selected
  React.useEffect(() => {
    if (selectedAnnotationId || (selectedAnnotationIds && selectedAnnotationIds.length > 0)) {
      if (isCanvasMoving) {
        pendingOpenAfterMoveRef.current = true;
      } else {
        setExplorerViewMode("properties");
        setActivePaneTab("explorer");
      }
    }
  }, [selectedAnnotationId, selectedAnnotationIds, isCanvasMoving]);

  // Resolve savedDefault wall height using the specified precedence rules
  const savedDefault = React.useMemo(() => {
    let def = 2700;
    try {
      const saved = localStorage.getItem('ezefloor_wall_thickness_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        def = parsed.defaultHeight ?? 2700;
      }
    } catch (e) { }
    return def;
  }, []);

  // Takeoff export modal state
  const [showTakeoffModal, setShowTakeoffModal] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [takeoffForm, setTakeoffForm] = React.useState({
    projectName: "",
    clientName: "",
    detailerName: "",
    jobNo: "",
    date: ""
  });

  // ── CHECK USER ACCESS FOR HW TASK MENU (Full Admin, HW roles, or bophanlogin "HW"/"All") ──
  const userBophan = String(user?.bophanlogin || user?.bophan || "").trim().toLowerCase();
  const isHwOrAllUser = isFullAdmin(user) || hasHwAccess(user) || userBophan === "hw" || userBophan === "all" || userBophan === "admin";

  // Auto-switch to explorer if task tabs are not allowed for this user
  React.useEffect(() => {
    if (!isHwOrAllUser && (activePaneTab === "job_task" || EXTRA_MODULE_TABS.some(t => t.id === activePaneTab))) {
      setActivePaneTab("explorer");
    }
  }, [isHwOrAllUser, activePaneTab]);

  // ── DYNAMIC TASK EXPANSION & DRAG RESIZING STATE ──
  const isTaskModuleActive = isHwOrAllUser && EXTRA_MODULE_TABS.some(t => t.id === activePaneTab);
  const activeModuleTab = EXTRA_MODULE_TABS.find(t => t.id === activePaneTab);
  const [isTaskExpanded, setIsTaskExpanded] = React.useState(false);
  const [taskPanelWidth, setTaskPanelWidth] = React.useState(420);
  const [isResizing, setIsResizing] = React.useState(false);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(0);

  const handleMouseDownResize = (e) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = taskPanelWidth;
  };

  React.useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const deltaX = startXRef.current - e.clientX;
      const maxW = typeof window !== "undefined" ? Math.round(window.innerWidth * 0.88) : 1450;
      const newWidth = Math.min(Math.max(startWidthRef.current + deltaX, 360), maxW);
      setTaskPanelWidth(newWidth);
      if (newWidth > 600) setIsTaskExpanded(true);
      else setIsTaskExpanded(false);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // ── AUTO SHOW / HIDE PROPERTIES PANE ON SELECTION CHANGE ──
  const prevSelectionKeyRef = React.useRef(null);
  React.useEffect(() => {
    const hasSelection = Boolean(
      selectedId ||
      selectedType ||
      (selectedWallIds && selectedWallIds.length > 0) ||
      (selectedDoorIds && selectedDoorIds.length > 0) ||
      (selectedRoomIds && selectedRoomIds.length > 0) ||
      (selectedLintelIds && selectedLintelIds.length > 0) ||
      selectedRoofId ||
      selectedWall ||
      selectedDoor ||
      selectedRoom ||
      selectedAnnotationId ||
      (selectedAnnotationIds && selectedAnnotationIds.length > 0)
    );

    const currentKey = hasSelection
      ? `${selectedType || ""}:${selectedId || ""}:${(selectedWallIds || []).join(",")}:${(selectedDoorIds || []).join(",")}:${(selectedRoomIds || []).join(",")}:${selectedRoofId || ""}:${selectedAnnotationId || ""}:${(selectedAnnotationIds || []).join(",")}`
      : "none";

    // Skip on initial mount to preserve initial view
    if (prevSelectionKeyRef.current === null) {
      prevSelectionKeyRef.current = currentKey;
      return;
    }

    if (currentKey !== prevSelectionKeyRef.current) {
      const isTaskActive = !!(activePaneTab && activePaneTab !== "explorer" && activePaneTab !== "summary" && activePaneTab !== "collapsed");

      if (hasSelection) {
        // Element selected (wall, door, room, roof, annotation, etc.):
        // If user was on a task, keep user on that task!
        // If user was on properties / explorer or collapsed, open Properties table
        if (!isTaskActive) {
          if (isCanvasMoving) {
            pendingOpenAfterMoveRef.current = true;
          } else {
            setActivePaneTab("explorer");
            setExplorerViewMode("properties");
          }
        }
      } else {
        // Deselected: auto hide right panel only if in properties/explorer
        if (!isTaskActive) {
          setActivePaneTab("collapsed");
        }
      }
      prevSelectionKeyRef.current = currentKey;
    }
  }, [
    selectedId,
    selectedType,
    selectedWall,
    selectedDoor,
    selectedRoom,
    selectedWallIds,
    selectedDoorIds,
    selectedRoomIds,
    selectedLintelIds,
    selectedRoofId,
    selectedAnnotationId,
    selectedAnnotationIds,
    activePaneTab,
    isCanvasMoving
  ]);

  // Open property panel when user completes moving an element on canvas
  React.useEffect(() => {
    if (prevCanvasMovingRef.current && !isCanvasMoving) {
      const isTaskActive = !!(activePaneTab && activePaneTab !== "explorer" && activePaneTab !== "summary" && activePaneTab !== "collapsed");
      const hasSelection = Boolean(
        selectedId ||
        (selectedWallIds && selectedWallIds.length > 0) ||
        (selectedDoorIds && selectedDoorIds.length > 0) ||
        (selectedRoomIds && selectedRoomIds.length > 0) ||
        (selectedLintelIds && selectedLintelIds.length > 0) ||
        selectedRoofId ||
        selectedWall ||
        selectedDoor ||
        selectedRoom ||
        selectedAnnotationId ||
        (selectedAnnotationIds && selectedAnnotationIds.length > 0)
      );

      if (!isTaskActive && (hasSelection || pendingOpenAfterMoveRef.current)) {
        pendingOpenAfterMoveRef.current = false;
        setActivePaneTab("explorer");
        setExplorerViewMode("properties");
      }
    }
    prevCanvasMovingRef.current = isCanvasMoving;
  }, [
    isCanvasMoving,
    activePaneTab,
    selectedId,
    selectedWallIds,
    selectedDoorIds,
    selectedRoomIds,
    selectedLintelIds,
    selectedRoofId,
    selectedWall,
    selectedDoor,
    selectedRoom,
    selectedAnnotationId,
    selectedAnnotationIds
  ]);

  // 4. Frame Hardware State & Custom Wall Overrides
  const [frameWallEntries, setFrameWallEntries] = React.useState([]);
  const [customWallOverrides, setCustomWallOverrides] = React.useState({});

  const handleSetFrameWallEntries = React.useCallback((actionOrEntries) => {
    setFrameWallEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;

      setTimeout(() => {
        if (Array.isArray(next) && next.length > 0) {
          const newOverrides = {};
          next.forEach(entry => {
            const ids = entry.wallIds && entry.wallIds.length > 0
              ? entry.wallIds
              : (entry.wallId ? [entry.wallId] : (selectedWallIds && selectedWallIds.length === 1 ? [selectedWallIds[0]] : (selectedWall?.id ? [selectedWall.id] : [])));

            ids.forEach(wId => {
              newOverrides[wId] = {
                height: entry.height ? parseInt(entry.height, 10) : undefined,
                length: entry.length ? parseFloat(entry.length) : undefined,
                spacing: entry.spacing ? parseInt(entry.spacing, 10) : undefined,
                rodSize: entry.rodSize,
                baseType: entry.baseType
              };
            });
          });

          if (Object.keys(newOverrides).length > 0) {
            setCustomWallOverrides(old => ({ ...old, ...newOverrides }));
            Object.entries(newOverrides).forEach(([wId, vals]) => {
              if (updateWallsProperty) {
                if (vals.height) updateWallsProperty([wId], "height_mm", vals.height);
                if (vals.spacing) updateWallsProperty([wId], "spacing", vals.spacing);
                if (vals.baseType) updateWallsProperty([wId], "floor_type", vals.baseType === "Concrete Slab" ? "Slab" : "Timber");
                if (vals.rodSize) updateWallsProperty([wId], "rod_size", vals.rodSize);
              }
            });
          }
        }
      }, 0);

      return next;
    });
  }, [selectedWallIds, selectedWall, updateWallsProperty]);

  // Note: Frame Hardware wall calculation is managed in FrameHardwareTask with full multi-page & load-bearing support

  // 5. Flooring State & Custom Room Overrides
  const [flooringEntries, setFlooringEntries] = React.useState([]);
  const [hebelFlooringEntries, setHebelFlooringEntries] = React.useState([]);
  const [customRoomOverrides, setCustomRoomOverrides] = React.useState({});

  const handleSetFlooringEntries = React.useCallback((actionOrEntries) => {
    setFlooringEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;

      setTimeout(() => {
        if (Array.isArray(next) && next.length > 0) {
          const newOverrides = {};
          next.forEach(entry => {
            const ids = entry.roomIds && entry.roomIds.length > 0
              ? entry.roomIds
              : (entry.roomId ? [entry.roomId] : (selectedRoomIds && selectedRoomIds.length === 1 ? [selectedRoomIds[0]] : (selectedRoom?.id ? [selectedRoom.id] : [])));

            ids.forEach(rId => {
              newOverrides[rId] = {
                typeArea: entry.typeArea || entry.location,
                product: entry.product,
                totalM2: typeof entry.totalM2 === "number" ? entry.totalM2 : (parseFloat(String(entry.totalM2 || "").replace("m²", "").trim()) || undefined),
                areaM2: typeof entry.areaM2 === "number" ? entry.areaM2 : (parseFloat(String(entry.areaM2 || "").replace("m²", "").trim()) || undefined)
              };
            });
          });

          if (Object.keys(newOverrides).length > 0) {
            setCustomRoomOverrides(old => ({ ...old, ...newOverrides }));
          }
        }
      }, 0);

      return next;
    });
  }, [selectedRoomIds, selectedRoom]);

  const handleSetHebelFlooringEntries = React.useCallback((actionOrEntries) => {
    setHebelFlooringEntries(actionOrEntries);
    handleSetFlooringEntries(actionOrEntries);
  }, [handleSetFlooringEntries]);

  // When on Flooring or Hebel Flooring task: if rooms are selected -> calculate selected rooms; if clicked outside -> calculate FULL FLOOR
  React.useEffect(() => {
    if (activePaneTab === "flooring_decking" || activePaneTab === "hebel_flooring") {
      const curRooms = (roomsByPageProp && roomsByPageProp[currentPage]) ? roomsByPageProp[currentPage] : (rooms || []);
      const effScale = (realScale && realScale > 0) ? realScale : (scaleValue && scaleValue > 0 ? scaleValue : 1.0);

      const targetRooms = (selectedRoomIds && selectedRoomIds.length > 0)
        ? curRooms.filter(r => selectedRoomIds.includes(r.id))
        : (selectedRoom ? [selectedRoom] : curRooms);

      if (targetRooms.length > 0) {
        const groupsMap = {};

        targetRooms.forEach(r => {
          const override = customRoomOverrides[r.id] || {};
          let areaM2 = 0;
          if (override.totalM2) {
            areaM2 = override.totalM2;
          } else if (r.areaM2 && !isNaN(r.areaM2)) {
            areaM2 = parseFloat(r.areaM2);
          } else if (r.area && !isNaN(r.area)) {
            areaM2 = r.area > 10000 ? r.area / 1000000 : parseFloat(r.area);
          } else if (r.area_m2 && !isNaN(r.area_m2)) {
            areaM2 = parseFloat(r.area_m2);
          } else {
            const pts = r.polygon || r.poly;
            if (pts && pts.length >= 3) {
              let pxArea = 0;
              for (let j = 0; j < pts.length; j++) {
                const p1 = pts[j];
                const p2 = pts[(j + 1) % pts.length];
                const x1 = typeof p1.x === 'number' ? p1.x : (Array.isArray(p1) ? p1[0] : 0);
                const y1 = typeof p1.y === 'number' ? p1.y : (Array.isArray(p1) ? p1[1] : 0);
                const x2 = typeof p2.x === 'number' ? p2.x : (Array.isArray(p2) ? p2[0] : 0);
                const y2 = typeof p2.y === 'number' ? p2.y : (Array.isArray(p2) ? p2[1] : 0);
                pxArea += (x1 * y2 - x2 * y1);
              }
              pxArea = Math.abs(pxArea) / 2;
              const effectiveScale = (realScale && realScale > 0) ? realScale : (scaleValue && scaleValue > 0 ? scaleValue : 1.0);
              const areaMm2 = pxArea * Math.pow(effectiveScale, 2);
              areaM2 = areaMm2 / 1000000;
            }
          }
          if (!areaM2 || areaM2 <= 0) return;

          const rawType = String(r.type || r.wetness || r.classification || r.room_class || r.room_type || "").toLowerCase();
          const rName = String(r.name || r.room_name || r.label || r.text || "").toLowerCase();

          const isWet = rawType === "wet" || /bath|ens|ensuite|wc|powder|laundry|shower|toilet/i.test(rName) || /bath|ens|ensuite|wc|powder|laundry|shower|toilet/i.test(rawType);
          const isBalcony = rawType === "tile_deck" || /balcony|porch|alfresco|patio|terrace|verand/i.test(rName) || /balcony|porch|alfresco|patio|terrace/i.test(rawType);
          const isDeck = rawType === "timber_deck" || (!isBalcony && /deck|timber/i.test(rName)) || /deck|timber/i.test(rawType);

          const defaultType = isWet ? "Wet" : (isBalcony ? "Balcony Tiles" : (isDeck ? "Decking Input" : "Dry"));
          const typeArea = override.typeArea || defaultType;

          let defaultProd = "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP";
          if (typeArea === "Wet") defaultProd = "FC FLOORING SECURA JH++2700X600X19MM INTERNAL 405592";
          else if (typeArea === "Balcony Tiles") defaultProd = "FC FLOORING SECURA JH++2700X600X19MM EXTERNAL 405592";
          else if (typeArea === "Decking Input") defaultProd = "HARDWOOD DECKING 90X19MM MERBAU";
          else if (typeArea === "T+G Flooring Area") defaultProd = "FLOORING SPOTTED GUM++85X19MM L/M PREM S&B T&G EM";

          const product = override.product || r.product || defaultProd;
          const groupKey = `${typeArea}___${product}`;

          if (!groupsMap[groupKey]) {
            groupsMap[groupKey] = {
              typeArea,
              product,
              areaM2: 0,
              count: 0,
              roomIds: []
            };
          }
          groupsMap[groupKey].areaM2 += areaM2;
          groupsMap[groupKey].count += 1;
          groupsMap[groupKey].roomIds.push(r.id);
        });

        const newFlrEntries = [];
        Object.entries(groupsMap).forEach(([key, g]) => {
          newFlrEntries.push({
            id: g.count === 1 && g.roomIds.length === 1 ? `flr-single-${g.roomIds[0]}` : `flr-grp-${key}`,
            roomId: g.count === 1 && g.roomIds.length === 1 ? g.roomIds[0] : undefined,
            roomIds: g.roomIds,
            typeArea: g.typeArea,
            location: g.typeArea,
            product: g.product,
            areaM2: Number(g.areaM2.toFixed(2)),
            wastePercent: 10,
            totalM2: Number(g.areaM2.toFixed(1)),
            glueType: "FLOORING ADHESIVE 600ML SAUSAGE",
            glueQty: Math.ceil((g.areaM2 * 1.1) / 12)
          });
        });

        if (newFlrEntries.length > 0) {
          // Do NOT overwrite if multi-level flooring entries already exist (e.g. GF, FF generated from Auto Fill AI or loaded from DB)
          if (flooringEntries && flooringEntries.length > 0 && flooringEntries.some(e => e.floorLevel)) {
            return;
          }
          setFlooringEntries(newFlrEntries);
          setHebelFlooringEntries(newFlrEntries.map(e => ({
            ...e,
            id: e.id.replace("flr-", "hebel-"),
            product: "HEBEL POWERFLOOR PANEL 1800X600X75MM",
            hebelQty: Math.ceil((e.totalM2 || e.areaM2) / 1.08)
          })));
        }
      }
    }
  }, [selectedRoomIds, selectedRoom, activePaneTab, currentPage, rooms, roomsByPageProp, realScale, scaleValue, customRoomOverrides]);

  const toggleTaskExpanded = () => {
    if (isTaskExpanded) {
      setTaskPanelWidth(420);
      setIsTaskExpanded(false);
    } else {
      const expandedW = typeof window !== "undefined" ? Math.max(Math.min(Math.round(window.innerWidth * 0.78), 1400), 980) : 1150;
      setTaskPanelWidth(expandedW);
      setIsTaskExpanded(true);
    }
  };

  const calculatedPanelWidth = React.useMemo(() => {
    if (activePaneTab === "collapsed") return 60;
    if (isTaskModuleActive) {
      return taskPanelWidth;
    }
    // Properties / Explorer / Summary / Job tasks standard fixed width
    return 380;
  }, [activePaneTab, isTaskModuleActive, taskPanelWidth]);

  // ── INSULATION MODULE MULTI-FORM STATE (3 FORMS MATCHING BUN-NSW-ACT) ──
  const [insulationWallEntries, setInsulationWallEntries] = React.useState([]);
  const [insulationAreaEntries, setInsulationAreaEntries] = React.useState([]);
  const [customInsWallOverrides, setCustomInsWallOverrides] = React.useState({});
  const [customInsAreaOverrides, setCustomInsAreaOverrides] = React.useState({});

  const handleSetInsulationWallEntries = React.useCallback((actionOrEntries) => {
    setInsulationWallEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      setTimeout(() => {
        if (Array.isArray(next) && next.length > 0) {
          const newOverrides = {};
          next.forEach(entry => {
            const ids = entry.wallIds && entry.wallIds.length > 0
              ? entry.wallIds
              : (entry.wallId ? [entry.wallId] : (selectedWallIds && selectedWallIds.length === 1 ? [selectedWallIds[0]] : (selectedWall?.id ? [selectedWall.id] : [])));
            ids.forEach(wId => {
              newOverrides[wId] = {
                type: entry.type,
                rValue: entry.rValue,
                product: entry.product || entry.productName,
                productCode: entry.productCode,
                height: entry.height,
                length: entry.length,
                raked: entry.raked || entry.rakedArea,
                door: entry.door || entry.doorArea,
                insulationArea: entry.insulationArea || entry.netArea
              };
            });
          });
          if (Object.keys(newOverrides).length > 0) {
            setCustomInsWallOverrides(old => ({ ...old, ...newOverrides }));
          }
        }
      }, 0);
      return next;
    });
  }, [selectedWallIds, selectedWall]);

  const handleSetInsulationAreaEntries = React.useCallback((actionOrEntries) => {
    setInsulationAreaEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      setTimeout(() => {
        if (Array.isArray(next) && next.length > 0) {
          const newOverrides = {};
          next.forEach(entry => {
            const ids = entry.roomIds && entry.roomIds.length > 0
              ? entry.roomIds
              : (entry.roomId ? [entry.roomId] : (selectedRoomIds && selectedRoomIds.length === 1 ? [selectedRoomIds[0]] : (selectedRoom?.id ? [selectedRoom.id] : [])));
            ids.forEach(rId => {
              newOverrides[rId] = {
                areaType: entry.areaType || entry.type,
                rValue: entry.rValue,
                product: entry.product || entry.productName,
                productCode: entry.productCode,
                areaM2: entry.areaM2 || entry.area,
                totalArea: entry.totalArea
              };
            });
          });
          if (Object.keys(newOverrides).length > 0) {
            setCustomInsAreaOverrides(old => ({ ...old, ...newOverrides }));
          }
        }
      }, 0);
      return next;
    });
  }, [selectedRoomIds, selectedRoom]);

  // When on Insulation task: dynamic wall & area calculations based on canvas selection
  // Skip auto-generation if insulationWallEntries already has entries (preserves AI-filled, entered, or calculated rows)
  React.useEffect(() => {
    if (activePaneTab === "insulation") {
      if (insulationWallEntries && insulationWallEntries.length > 0) return;

      const curWalls = (wallsByPageProp && wallsByPageProp[currentPage]) ? wallsByPageProp[currentPage] : (walls || []);
      const curRooms = (roomsByPageProp && roomsByPageProp[currentPage]) ? roomsByPageProp[currentPage] : (rooms || []);
      const effScale = (realScale && realScale > 0) ? realScale : (scaleValue && scaleValue > 0 ? scaleValue : 1.0);

      // 1. Calculate Wall Insulation on ALL walls
      const targetWalls = curWalls;

      if (targetWalls.length > 0) {
        const wallGroupsMap = {};

        targetWalls.forEach(w => {
          const override = customInsWallOverrides[w.id] || {};
          let lenMm = 0;
          if (override.length) {
            lenMm = Math.round(Number(override.length));
          } else if (w.length_m) {
            lenMm = Math.round(w.length_m * 1000);
          } else if (w.centerline && w.centerline.length === 2) {
            const dx = w.centerline[1][0] - w.centerline[0][0];
            const dy = w.centerline[1][1] - w.centerline[0][1];
            const px = Math.hypot(dx, dy);
            lenMm = effScale < 0.5 ? Math.round(px * effScale * 1000) : Math.round(px * effScale);
          }
          if (lenMm <= 0) return;

          const wCls = typeof getWallClass === "function" ? getWallClass(w) : (w.class_name || w.wall_type || "interior_wall");
          const isExt = wCls === "exterior_wall";
          const type = override.type || (isExt ? "Ext wall" : "Int wall");
          const rValue = override.rValue || (isExt ? "R2.5" : "R2.0");
          const h = Number(override.height || w.height_mm || w.height || 2400);
          const prodCode = override.productCode || (isExt ? "0810602" : "0810608");
          const prodName = override.product || override.productName || (isExt
            ? "0810602 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.5HP 90X430 PK12"
            : "0810608 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.0 75X430 PK20");

          const groupKey = `${type}_${rValue}_${h}_${prodCode}`;
          if (!wallGroupsMap[groupKey]) {
            wallGroupsMap[groupKey] = {
              type,
              rValue,
              height: h,
              productCode: prodCode,
              product: prodName,
              totalLenMm: 0,
              count: 0,
              wallIds: []
            };
          }
          wallGroupsMap[groupKey].totalLenMm += lenMm;
          wallGroupsMap[groupKey].count += 1;
          wallGroupsMap[groupKey].wallIds.push(w.id);
        });

        const newWallEntries = [];
        Object.entries(wallGroupsMap).forEach(([key, g]) => {
          const areaM2 = Number(((g.height / 1000) * (g.totalLenMm / 1000)).toFixed(2));
          newWallEntries.push({
            id: g.count === 1 && g.wallIds.length === 1 ? `ins-w-single-${g.wallIds[0]}` : `ins-w-grp-${key}`,
            wallId: g.count === 1 && g.wallIds.length === 1 ? g.wallIds[0] : undefined,
            wallIds: g.wallIds,
            type: g.type,
            height: g.height,
            length: g.totalLenMm,
            rValue: g.rValue,
            product: g.product,
            productCode: g.productCode,
            raked: 0,
            door: 0,
            insulationArea: areaM2,
            netArea: areaM2
          });
        });

        if (newWallEntries.length > 0) {
          setInsulationWallEntries(newWallEntries);
        }
      }

      // 2. Calculate Area / Ceiling Insulation on ALL rooms
      const targetRooms = curRooms;

      let ceilM2 = 0;
      const roomIdsList = [];
      targetRooms.forEach(r => {
        const override = customInsAreaOverrides[r.id] || {};
        let aM2 = 0;
        if (override.areaM2) {
          aM2 = override.areaM2;
        } else if (r.areaM2 && !isNaN(r.areaM2)) {
          aM2 = parseFloat(r.areaM2);
        } else if (r.area && !isNaN(r.area)) {
          aM2 = r.area > 10000 ? r.area / 1000000 : parseFloat(r.area);
        } else if (r.area_m2 && !isNaN(r.area_m2)) {
          aM2 = parseFloat(r.area_m2);
        } else {
          const pts = r.polygon || r.poly;
          if (pts && pts.length >= 3) {
            let pxArea = 0;
            for (let j = 0; j < pts.length; j++) {
              const p1 = pts[j];
              const p2 = pts[(j + 1) % pts.length];
              const x1 = typeof p1.x === 'number' ? p1.x : (Array.isArray(p1) ? p1[0] : 0);
              const y1 = typeof p1.y === 'number' ? p1.y : (Array.isArray(p1) ? p1[1] : 0);
              const x2 = typeof p2.x === 'number' ? p2.x : (Array.isArray(p2) ? p2[0] : 0);
              const y2 = typeof p2.y === 'number' ? p2.y : (Array.isArray(p2) ? p2[1] : 0);
              pxArea += (x1 * y2 - x2 * y1);
            }
            pxArea = Math.abs(pxArea) / 2;
            const areaMm2 = pxArea * Math.pow(effScale, 2);
            aM2 = areaMm2 / 1000000;
          }
        }
        if (aM2 > 0) {
          ceilM2 += aM2;
          roomIdsList.push(r.id);
        }
      });

      if (ceilM2 > 0) {
        const cVal = Number(ceilM2.toFixed(2));
        setInsulationAreaEntries([
          {
            id: roomIdsList.length === 1 ? `ins-a-single-${roomIdsList[0]}` : `ins-a-ceil-${Date.now()}`,
            roomId: roomIdsList.length === 1 ? roomIdsList[0] : undefined,
            roomIds: roomIdsList,
            location: roomIdsList.length === 1 ? (targetRooms[0]?.name || "Room Ceiling") : "Ceiling / Roof Space",
            areaType: "Ceiling",
            rValue: "R4.0",
            product: "0810620 · INS CEILING BATT R4.0 430MM",
            areaM2: cVal,
            area: cVal,
            totalArea: Number((cVal * 1.05).toFixed(2))
          }
        ]);
      }
    }
  }, [activePaneTab, currentPage, walls, wallsByPageProp, rooms, roomsByPageProp, realScale, scaleValue, customInsWallOverrides, customInsAreaOverrides]);

  const [insWallType, setInsWallType] = React.useState("external");
  const [insWallHeight, setInsWallHeight] = React.useState("2700");
  const [insWallLength, setInsWallLength] = React.useState("");
  const [insWallRValue, setInsWallRValue] = React.useState("R2.0");
  const [insWallProduct, setInsWallProduct] = React.useState("0810608 - INS BATT R2.0 430MM");
  const [insWallRaked, setInsWallRaked] = React.useState("0");
  const [insWallDoor, setInsWallDoor] = React.useState("0");

  const [insAreaType, setInsAreaType] = React.useState("ceiling");
  const [insAreaRValue, setInsAreaRValue] = React.useState("R4.0");
  const [insAreaProduct, setInsAreaProduct] = React.useState("0810620 - INS CEILING BATT R4.0 430MM");
  const [insAreaValue, setInsAreaValue] = React.useState("");

  const handleAddInsulationWall = (typeKey) => {
    const h = Number(insWallHeight) || 2700;
    const l = Number(insWallLength) || 0;
    const raked = Number(insWallRaked) || 0;
    const door = Number(insWallDoor) || 0;
    const gross = (h / 1000) * (l / 1000) + raked;
    const net = Math.max(0, gross - door);
    if (!l && !raked) return;

    const codeMatch = insWallProduct.match(/^(\d+)/);
    const code = codeMatch ? codeMatch[1] : "0810608";

    const newEntry = {
      id: `ins-w-${Date.now()}`,
      type: typeKey || insWallType,
      rValue: insWallRValue,
      productCode: code,
      productName: insWallProduct,
      height: h,
      length: l,
      rakedArea: raked,
      doorArea: door,
      netArea: Number(net.toFixed(2))
    };
    setInsulationWallEntries(prev => [...prev, newEntry]);
    setInsWallLength("");
  };

  const handleRemoveInsulationWall = (id) => {
    setInsulationWallEntries(prev => prev.filter(w => w.id !== id));
  };

  const handleAddInsulationArea = () => {
    const a = Number(insAreaValue);
    if (!a || a <= 0) return;
    const codeMatch = insAreaProduct.match(/^(\d+)/);
    const code = codeMatch ? codeMatch[1] : "0810620";

    const newEntry = {
      id: `ins-a-${Date.now()}`,
      type: insAreaType,
      rValue: insAreaRValue,
      productCode: code,
      productName: insAreaProduct,
      area: Number(a.toFixed(2))
    };
    setInsulationAreaEntries(prev => [...prev, newEntry]);
    setInsAreaValue("");
  };

  const handleRemoveInsulationArea = (id) => {
    setInsulationAreaEntries(prev => prev.filter(a => a.id !== id));
  };

  // ── MULTI-CARD FORM STATES FOR ALL OTHER MODULES ──
  // 1. Cladding Entries
  const [claddingWallEntries, setCladdingWallEntries] = React.useState([]);
  const [cladElev, setCladElev] = React.useState("Front Elevation");
  const [cladHeight, setCladHeight] = React.useState("2700");
  const [cladLength, setCladLength] = React.useState("");
  const [cladOpenings, setCladOpenings] = React.useState("0");
  const [cladWaste, setCladWaste] = React.useState("10");

  const handleAddCladdingWall = () => {
    const h = Number(cladHeight) || 2700;
    const l = Number(cladLength) || 0;
    const op = Number(cladOpenings) || 0;
    const wst = Number(cladWaste) || 10;
    if (!l) return;
    const gross = (h / 1000) * (l / 1000);
    const net = Math.max(0, gross - op);
    const total = net * (1 + wst / 100);
    setCladdingWallEntries(prev => [...prev, {
      id: `clad-${Date.now()}`,
      elevation: cladElev,
      height: h,
      length: l,
      openings: op,
      waste: wst,
      grossArea: Number(gross.toFixed(2)),
      netArea: Number(net.toFixed(2)),
      totalArea: Number(total.toFixed(2))
    }]);
    setCladLength("");
  };

  // 2. Eaves Entries
  const [eavesEntries, setEavesEntries] = React.useState([]);
  const [eaveLevel, setEaveLevel] = React.useState("Ground Floor");
  const [eaveWidth, setEaveWidth] = React.useState("450");
  const [eaveLength, setEaveLength] = React.useState("");

  const handleAddEaveEntry = () => {
    const w = Number(eaveWidth) || 450;
    const l = Number(eaveLength) || 0;
    if (!l) return;
    const area = (w / 1000) * l;
    setEavesEntries(prev => [...prev, {
      id: `eave-${Date.now()}`,
      level: eaveLevel,
      width: w,
      length: l,
      area: Number(area.toFixed(2))
    }]);
    setEaveLength("");
  };

  // 3. Flooring Quick Form State
  const [flrLevel, setFlrLevel] = React.useState("Ground Floor GF");
  const [flrRoom, setFlrRoom] = React.useState("");
  const [flrType, setFlrType] = React.useState("Hybrid / Vinyl Plank");
  const [flrArea, setFlrArea] = React.useState("");
  const [flrWaste, setFlrWaste] = React.useState("10");

  const handleAddFlooringEntry = () => {
    const a = Number(flrArea) || 0;
    const wst = Number(flrWaste) || 10;
    if (!a) return;
    const total = a * (1 + wst / 100);
    setFlooringEntries(prev => [...prev, {
      id: `flr-${Date.now()}`,
      level: flrLevel,
      room: flrRoom || "Room",
      type: flrType,
      area: a,
      waste: wst,
      totalArea: Number(total.toFixed(2))
    }]);
    setFlrArea("");
    setFlrRoom("");
  };

  // Global listener for Auto-Calculate & Fill AI Rooms from AreaSummary modal
  React.useEffect(() => {
    const handleGlobalApplyAIRooms = (e) => {
      if (!e.detail) return;
      const { dryArea: d, wetArea: w, balconyArea: b, otherArea: o, otherTypeArea: ot, rooms } = e.detail;

      setModuleFormData(prev => ({
        ...prev,
        flooring_decking: {
          ...(prev.flooring_decking || {}),
          dryArea: d ? String(d) : prev.flooring_decking?.dryArea || "",
          wetArea: w ? String(w) : prev.flooring_decking?.wetArea || "",
          balconyArea: b ? String(b) : prev.flooring_decking?.balconyArea || "",
          otherArea: o ? String(o) : prev.flooring_decking?.otherArea || "",
          otherTypeArea: ot || prev.flooring_decking?.otherTypeArea || "Decking Input",
          location: "Ground Floor",
          flooring_type: "Hybrid / Vinyl Plank",
          floor_area: d ? String(d) : String(w || 54.2),
          waste_allowance: "10"
        },
        hebel_flooring: {
          ...(prev.hebel_flooring || {}),
          dryArea: d ? String(d) : prev.hebel_flooring?.dryArea || "",
          wetArea: w ? String(w) : prev.hebel_flooring?.wetArea || "",
          balconyArea: b ? String(b) : prev.hebel_flooring?.balconyArea || "",
          otherArea: o ? String(o) : prev.hebel_flooring?.otherArea || "",
          otherTypeArea: ot || prev.hebel_flooring?.otherTypeArea || "Decking Input"
        }
      }));

      // Auto-generate room entries for Cairns Hardware & standard list
      const roomList = (rooms || []).filter(r => r.areaM2 || r.area || r.room_name || r.name || r.polygon);
      if (roomList.length > 0) {
        const generated = roomList.map((r, idx) => {
          const roomName = (r.room_name || r.name || r.label || `Room ${idx + 1}`).trim();
          let areaNum = 0;
          if (r.areaM2 && !isNaN(r.areaM2)) {
            areaNum = parseFloat(r.areaM2);
          } else if (r.area && !isNaN(r.area)) {
            areaNum = r.area > 10000 ? r.area / 1000000 : parseFloat(r.area);
          } else {
            areaNum = 14.5;
          }
          areaNum = Number(areaNum.toFixed(2));

          const isWet = /bath|ensuite|wc|powder|laundry|shower/i.test(roomName) || r.type === "wet";
          const isDeck = /deck|porch|verandah|patio/i.test(roomName) || (r.type && r.type.includes("timber"));
          const isBalcony = /balcony|alfresco|terrace/i.test(roomName) || (r.type && r.type.includes("tile"));
          const isGarage = /garage/i.test(roomName);

          const flType = isWet ? "Wet Area Ceramic Tile" : (isDeck ? "90mm Merbau Decking" : (isBalcony ? "Exterior Non-Slip Tile" : (isGarage ? "Concrete Epoxy / Sealed" : "Hybrid / Vinyl Plank")));

          return {
            id: `flr-ai-${r.id || idx}-${Date.now()}`,
            level: "Ground Floor GF",
            room: roomName,
            type: r.floor_type || flType,
            area: `${areaNum} m²`,
            waste: "10%",
            totalArea: `${Number((areaNum * 1.1).toFixed(2))} m²`
          };
        });
        setFlooringEntries(generated);
        setHebelFlooringEntries(generated);
      }

      // Auto-switch right pane tab to Flooring & Decking task so the user sees the filled form immediately
      setEnabledModuleIds(prev => prev.includes("flooring_decking") ? prev : [...prev, "flooring_decking"]);
      setActivePaneTab("flooring_decking");
      setTaskPanelWidth(prev => Math.max(prev, 420));

      setAiGeneratedSuccess("flooring_decking");
      setTimeout(() => setAiGeneratedSuccess(null), 3000);
    };

    // ── 2. LOCKUP EVENT LISTENER ──
    const handleGlobalApplyLockup = (e) => {
      if (!e.detail) return;
      const { doors: rawDoors = [], lockoutRows = [] } = e.detail;

      const sourceList = lockoutRows.length > 0 ? lockoutRows : rawDoors;
      if (sourceList.length > 0) {
        const generated = sourceList.map((d, idx) => {
          const dLabel = (d.door_name || d.doorName || d.doorLabel || (d.label && !/single|sliding|window|door/i.test(d.label) ? d.label : null) || `D${idx + 1}`).trim();
          const dW = d.width || 820;
          const dH = d.height || 2040;
          const isExt = d.scope === "external" || d.isExternal || /entry|front|back|patio|balcony|sliding/i.test(dLabel);
          const isLoose = !isExt && (d.mode === "Loose" || d.category === "Loose Jamb");

          const dHinge = String(d.hingeSide || d.hinge_side || d.handing || d.hung || "").toLowerCase();
          const isRight = dHinge.includes("right") || dHinge.includes("rh") || dHinge === "hung a";
          const isLeft = dHinge.includes("left") || dHinge.includes("lh") || dHinge === "hung b";
          const hungVal = isRight ? "Hung A" : (isLeft ? "Hung B" : (isExt ? "Hung B" : "Hung A"));

          return {
            id: `lck-ai-${d.id || idx}-${Date.now()}`,
            // NSW ACT columns
            category: isExt ? "Prehung" : (isLoose ? "Loose Jamb" : (d.category || "Prehung")),
            location: isExt ? "External" : "Internal",
            door: d.door || d.product || "",
            size: `${dH}×${dW}`,
            thicks: `${d.thickness || (isExt ? 40 : 35)}mm`,
            jambWall: d.jamb_or_wall || "90mm Wall",
            jambSize: isLoose ? (d.jamb_size || d.jambSize || "112×19mm 5.4m Loose Jamb") : "",
            hung: hungVal,
            type: "-",
            hfHo: d.internal_type || "HF",
            color: d.color || "CHR",
            stop: d.door_stop || "Cushion",
            qty: d.default_qty || d.qty || 1,

            // Cairns Hardware columns
            doorLabel: dLabel,
            configuration: isExt ? "Single Leaf External Entry" : "Single Swing Internal",
            frameMaterial: d.jamb_or_wall || "90mm Timber Stud Frame",
            weatherstrip: isExt ? "Raven RP4 Door Bottom Seal" : "Internal Draught Strip"
          };
        });

        setLockupEntries(generated);
        setFixoutDoorEntries(generated.map(g => ({
          id: `fix-${g.id}`,
          category: g.category === "Cavity" ? "cavity" : (g.mode === "Loose" ? "loose-jamb" : "prehung"),
          door_label: g.doorLabel || g.door || "",
          door_type: g.product || g.type || "ASC",
          height: g.height || 2040,
          width: g.width || 820,
          thicks: String(g.thickness || 35),
          wall_width: "90",
          door_frame: g.jambWall || "Timber Jamb",
          lift_off_pivot: "",
          handing: g.hung || "",
          hole: g.hfHo || "HF",
          finish: g.color || "CHR",
          door_furniture: "passage",
          door_stop: g.stop || "cushion",
          qty: g.qty || 1
        })));
      }

      setEnabledModuleIds(prev => prev.includes("lockup") ? prev : [...prev, "lockup"]);
      setActivePaneTab("lockup");
      setTaskPanelWidth(prev => Math.max(prev, 420));

      setAiGeneratedSuccess("lockup");
      setTimeout(() => setAiGeneratedSuccess(null), 3000);
    };

    // ── 3. FRAMEWORK EVENT LISTENER ──
    const handleGlobalApplyFramework = (e) => {
      if (!e.detail) return;
      const { wallEntries = [] } = e.detail;
      if (wallEntries.length > 0) {
        setFrameWallEntries(wallEntries);
      }

      setEnabledModuleIds(prev => prev.includes("frame_hardware") ? prev : [...prev, "frame_hardware"]);
      setActivePaneTab("frame_hardware");
      setTaskPanelWidth(prev => Math.max(prev, 420));

      setAiGeneratedSuccess("frame_hardware");
      setTimeout(() => setAiGeneratedSuccess(null), 3000);
    };

    // ── 4. INSULATION EVENT LISTENER ──
    const handleGlobalApplyInsulation = (e) => {
      if (!e.detail) return;
      const { insulationRows = [] } = e.detail;
      if (insulationRows.length > 0) {
        const wallRows = insulationRows.map((r, idx) => {
          const isExt = (r.wall_type || "").toLowerCase().includes("ext");
          const netA = Math.max(0, ((r.wall_height || 2700) / 1000) * ((r.wall_length || 0) / 1000) + (r.total_area_raked || 0) - (r.total_area_door || 0));
          return {
            id: `ins-w-ai-${Date.now()}-${idx}`,
            type: isExt ? "external" : "internal",
            rValue: isExt ? "R2.5" : "R2.0",
            productCode: isExt ? "0810610" : "0810608",
            productName: isExt ? "0810610 - INS BATT R2.5 430MM" : "0810608 - INS BATT R2.0 430MM",
            height: r.wall_height || 2700,
            length: r.wall_length || 0,
            rakedArea: r.total_area_raked || 0,
            doorArea: r.total_area_door || 0,
            netArea: Number(netA.toFixed(2))
          };
        });
        setInsulationWallEntries(wallRows);
      }

      setEnabledModuleIds(prev => prev.includes("insulation") ? prev : [...prev, "insulation"]);
      setActivePaneTab("insulation");
      setTaskPanelWidth(prev => Math.max(prev, 420));

      setAiGeneratedSuccess("insulation");
      setTimeout(() => setAiGeneratedSuccess(null), 3000);
    };

    window.addEventListener("ezefloor:apply_ai_rooms_to_flooring", handleGlobalApplyAIRooms);
    window.addEventListener("ezefloor:apply_ai_doors_to_lockup", handleGlobalApplyLockup);
    window.addEventListener("ezefloor:apply_ai_walls_to_framework", handleGlobalApplyFramework);
    window.addEventListener("ezefloor:apply_ai_insulation_to_task", handleGlobalApplyInsulation);

    return () => {
      window.removeEventListener("ezefloor:apply_ai_rooms_to_flooring", handleGlobalApplyAIRooms);
      window.removeEventListener("ezefloor:apply_ai_doors_to_lockup", handleGlobalApplyLockup);
      window.removeEventListener("ezefloor:apply_ai_walls_to_framework", handleGlobalApplyFramework);
      window.removeEventListener("ezefloor:apply_ai_insulation_to_task", handleGlobalApplyInsulation);
    };
  }, []);

  // 4. Frame Hardware Quick Form State
  const [frmHeight, setFrmHeight] = React.useState("2700");
  const [frmLength, setFrmLength] = React.useState("");
  const [frmStudSpacing, setFrmStudSpacing] = React.useState("450");
  const [frmWindClass, setFrmWindClass] = React.useState("N2");

  const handleAddFrameWall = () => {
    const h = Number(frmHeight) || 2700;
    const l = Number(frmLength) || 0;
    const spacing = Number(frmStudSpacing) || 450;
    if (!l) return;
    const plates = l * 2;
    const studs = Math.ceil((l * 1000) / spacing) + 4;
    setFrameWallEntries(prev => [...prev, {
      id: `frm-${Date.now()}`,
      height: h,
      length: l,
      studSpacing: spacing,
      windClass: frmWindClass,
      platesLm: Number(plates.toFixed(1)),
      studsQty: studs
    }]);
    setFrmLength("");
  };

  // 5. Timber Post Entries
  const [timberPostEntries, setTimberPostEntries] = React.useState([]);
  const [pstLocation, setPstLocation] = React.useState("");
  const [pstSpec, setPstSpec] = React.useState("90x90mm F7 / H3 Treated Pine");
  const [pstHeight, setPstHeight] = React.useState("2700");
  const [pstQty, setPstQty] = React.useState("1");
  const [pstSupport, setPstSupport] = React.useState("Hot-Dip Galvanized Stirrup");

  const handleAddTimberPost = () => {
    const q = Number(pstQty) || 1;
    const h = Number(pstHeight) || 2700;
    setTimberPostEntries(prev => [...prev, {
      id: `pst-${Date.now()}`,
      location: pstLocation || "Patio / Porch",
      spec: pstSpec,
      height: h,
      qty: q,
      supportType: pstSupport
    }]);
    setPstLocation("");
  };

  // 6. Fixout Door Entries
  const [fixoutDoorEntries, setFixoutDoorEntries] = React.useState([]);
  const [fixDoorType, setFixDoorType] = React.useState("Internal Swing Door");
  const [fixJambType, setFixJambType] = React.useState("Single Rebated Pine Jamb Set");
  const [fixArchitraveSpec, setFixArchitraveSpec] = React.useState("67x18mm MDF Architrave");
  const [fixDoorQty, setFixDoorQty] = React.useState("1");

  const handleAddFixoutDoor = () => {
    const q = Number(fixDoorQty) || 1;
    setFixoutDoorEntries(prev => [...prev, {
      id: `fix-${Date.now()}`,
      doorType: fixDoorType,
      jambType: fixJambType,
      architraveSpec: fixArchitraveSpec,
      qty: q
    }]);
  };

  // Shelving Entries
  const [shelvingEntries, setShelvingEntries] = React.useState([]);

  // FOW Plumbing Entries
  const [fowPlumbingEntries, setFowPlumbingEntries] = React.useState([]);

  // Power Truss Braces Entries
  const [powerTrussEntries, setPowerTrussEntries] = React.useState([]);

  // 7. Lockup State & Custom Overrides
  const [lockupEntries, setLockupEntries] = React.useState([]);
  const [customLockupOverrides, setCustomLockupOverrides] = React.useState({});

  const handleSetLockupEntries = React.useCallback((actionOrEntries) => {
    setLockupEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      return next;
    });
  }, []);

  // When on Lockup task: dynamic door calculation and bidirectional synchronization with canvas selection
  React.useEffect(() => {
    if (activePaneTab === "lockup" || activePaneTab === "lock_up") {
      const curDoors = (doorsByPageProp && doorsByPageProp[currentPage]) ? doorsByPageProp[currentPage] : (doors || []);
      const targetDoors = curDoors || [];

      if (!targetDoors || targetDoors.length === 0) {
        return;
      }

      const getDoorIsExt = (d, dLabel, rawType) => {
        return Boolean(
          d.is_ext ||
          d.is_exterior ||
          d.isExternal ||
          d.location === "external" ||
          d.scope === "external" ||
          (d.doorTypeId && String(d.doorTypeId).startsWith("ext_")) ||
          (d.class && String(d.class).includes("ext")) ||
          (d.type && String(d.type).includes("ext")) ||
          /entry|front|sliding|patio|balcony|garage|external/i.test(dLabel) ||
          /entry|sliding|external/i.test(rawType)
        );
      };

      const matchId = (id1, id2) => id1 !== undefined && id1 !== null && id2 !== undefined && id2 !== null && String(id1).trim() === String(id2).trim();

      const buildEntry = (d, idx) => {
        const override = customLockupOverrides[d.id] || {};
        const dLabel = (override.doorLabel || d.door_name || d.doorName || d.doorLabel || (d.label && !/single|sliding|window|door/i.test(d.label) ? d.label : null) || `D-${idx + 1}`).trim();
        const rawType = String(d.door_type || d.type || "").toLowerCase();
        const isExt = getDoorIsExt(d, dLabel, rawType);

        const dWidth = getDoorWidthInMm(d, realScale, scaleValue);
        const dHeight = getDoorHeightInMm(d);
        const wallThick = d.wall_thickness || d.thickness_mm || 90;
        const isLoose = override.category === "Loose Jamb" || (!isExt && d.mode === "Loose");

        const dHinge = String(override.hung || d.hingeSide || d.hinge_side || d.handing || d.hung || "").toLowerCase();
        const isRight = dHinge.includes("right") || dHinge.includes("rh") || dHinge === "hung a";
        const isLeft = dHinge.includes("left") || dHinge.includes("lh") || dHinge === "hung b";
        const hungVal = isRight ? "Hung A" : (isLeft ? "Hung B" : (isExt ? "Hung B" : "Hung A"));

        return {
          id: `lck-door-${d.id || Date.now()}-${idx}`,
          doorId: d.id,
          mode: override.category || (isExt ? "Prehung" : "Loose"),
          scope: isExt ? "external" : "internal",
          location: isExt ? "External" : "Internal",
          label: dLabel,
          door_name: dLabel,
          height: dHeight,
          width: dWidth,
          thickness: isExt ? 40 : 35,
          jamb_or_wall: `${wallThick}mm Wall`,
          jamb_size: isLoose ? (override.jambSize || "112×19mm 5.4m Loose Jamb") : "",
          hung: hungVal,
          door_type: override.door_type || d.door_type || d.lockup_door_type || "",
          type: "-",
          door_stop: override.stop || (isExt ? "DS2 with Riser" : "Cushion"),
          internal_type: override.hfHo || (isExt ? null : "HF"),
          color: override.color || (isExt ? null : "CHR"),
          default_qty: override.qty || 1
        };
      };

      if (!lockupEntries || lockupEntries.length === 0) {
        setLockupEntries(targetDoors.map((d, idx) => buildEntry(d, idx)));
      } else {
        let changed = false;
        const existingEntries = [...lockupEntries];
        const updatedEntries = existingEntries.map(entry => {
          if (!entry.doorId) return entry;
          const matchingDoor = targetDoors.find(d => matchId(d.id, entry.doorId));
          if (!matchingDoor) return entry;

          const override = customLockupOverrides[matchingDoor.id] || {};
          const dLabel = (override.doorLabel || matchingDoor.door_name || matchingDoor.doorName || matchingDoor.doorLabel || entry.label || "").trim();
          const rawType = String(matchingDoor.door_type || matchingDoor.type || "").toLowerCase();
          const isExt = getDoorIsExt(matchingDoor, dLabel, rawType);
          const expectedScope = isExt ? "external" : "internal";
          const expectedLoc = isExt ? "External" : "Internal";
          const expectedModel = override.door_type || matchingDoor.door_type || matchingDoor.lockup_door_type || entry.door_type || "";

          const isScopeDiff = entry.scope !== expectedScope || entry.location !== expectedLoc;
          const isModelDiff = !override.door_type && matchingDoor.door_type && entry.door_type !== matchingDoor.door_type;

          if (isScopeDiff || isModelDiff) {
            changed = true;
            return {
              ...entry,
              scope: expectedScope,
              location: expectedLoc,
              door_type: isModelDiff ? expectedModel : entry.door_type,
              thickness: isExt ? 40 : 35,
              label: dLabel || entry.label,
              door_name: dLabel || entry.door_name
            };
          }
          return entry;
        });

        // Add any targetDoors that don't have a matching lockup entry yet
        targetDoors.forEach((d, idx) => {
          const hasEntry = existingEntries.some(e => matchId(e.doorId, d.id));
          if (!hasEntry) {
            changed = true;
            updatedEntries.push(buildEntry(d, idx));
          }
        });

        if (changed) {
          setLockupEntries(updatedEntries);
        }
      }
    }
  }, [activePaneTab, currentPage, doors, doorsByPageProp, customLockupOverrides]);

  const [trussEntries, setTrussEntries] = React.useState([]);
  const [hardiesFireWallEntries, setHardiesFireWallEntries] = React.useState([]);
  const handleSetHardiesFireWallEntries = React.useCallback((actionOrEntries) => {
    setHardiesFireWallEntries(prev => (typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries));
  }, []);
  const [lckType, setLckType] = React.useState("Solid Core Entry Door");
  const [lckSpec, setLckSpec] = React.useState("2040x820x40mm Timber Entry");
  const [lckReveal, setLckReveal] = React.useState("100mm Timber Reveal");
  const [lckQty, setLckQty] = React.useState("1");

  const handleAddLockupEntry = () => {
    const q = Number(lckQty) || 1;
    setLockupEntries(prev => [...prev, {
      id: `lck-${Date.now()}`,
      type: lckType,
      spec: lckSpec,
      reveal: lckReveal,
      qty: q
    }]);
  };

  // Collapsible accordion expanded states (all true by default on load)
  const [isWallSummaryExpanded, setIsWallSummaryExpanded] = React.useState(true);
  const [isFloorSummaryExpanded, setIsFloorSummaryExpanded] = React.useState(true);
  const [isDoorSummaryExpanded, setIsDoorSummaryExpanded] = React.useState(true);
  const [isWindowSummaryExpanded, setIsWindowSummaryExpanded] = React.useState(true);
  const [isSkirtingSummaryExpanded, setIsSkirtingSummaryExpanded] = React.useState(true);

  // Wall calculation options: default is 2 sides (2 mặt), gross area (không trừ cửa)
  const [wallSides, setWallSides] = React.useState(2);
  const [deductDoors, setDeductDoors] = React.useState(false);

  // 1. Calculations for Walls
  const wallData = React.useMemo(() => {
    const groups = {
      interior_wall: { label: "Interior", color: "#3b82f6", walls: [] },
      exterior_wall: { label: "Exterior", color: "#f59e0b", walls: [] },
      partition_wall: { label: "Partition", color: "#8b5cf6", walls: [] },
      block_wall: { label: "Block", color: "#78716c", walls: [] },
    };

    walls.forEach((w) => {
      const c = w.centerline;
      if (!c || c.length !== 2) return;

      const dx = c[1][0] - c[0][0];
      const dy = c[1][1] - c[0][1];
      const lengthPx = Math.hypot(dx, dy);
      const lengthM = scaleValue ? lengthPx * scaleValue : null;
      const heightMm = w.height ?? savedDefault;
      const heightM = heightMm / 1000;

      let openingAreaM2 = 0;
      if (deductDoors && doors && scaleValue) {
        const wallBaseId = getBaseWallId ? getBaseWallId(w.id) : w.id;
        const wallDoors = doors.filter(d => {
          const dWallId = getBaseWallId ? getBaseWallId(d.parentWallId) : d.parentWallId;
          return dWallId === wallBaseId || d.parentWallId === w.id;
        });
        wallDoors.forEach(d => {
          const m = calcDoorWindowMetrics(d, scaleValue);
          openingAreaM2 += (m.lengthM || 0) * (m.heightM || 0);
        });
      }

      const rawGrossM2 = lengthM != null ? lengthM * heightM : 0;
      const netSingleM2 = Math.max(0, rawGrossM2 - openingAreaM2);
      const areaM2 = lengthM != null ? netSingleM2 * wallSides : null;

      const type = getWallClass(w);
      const key = groups[type] ? type : "interior_wall";

      groups[key].walls.push({ id: w.id, lengthM, heightM, areaM2, openingAreaM2, thicknessMm: w.thickness || 90 });
    });

    return groups;
  }, [walls, doors, scaleValue, savedDefault, wallSides, deductDoors]);

  const totalWallCount = walls.filter((w) => w.centerline && w.centerline.length === 2).length;
  const sumOf = (group, field) => group.walls.reduce((s, w) => s + (w[field] || 0), 0);
  const grandTotalLength = Object.values(wallData).reduce((s, g) => s + sumOf(g, "lengthM"), 0);
  const grandTotalArea = Object.values(wallData).reduce((s, g) => s + sumOf(g, "areaM2"), 0);

  // 2. Calculations for Rooms Area Summary
  const wasteInternal = (wasteByPage[currentPage] || {}).internal ?? 10;
  const wasteExternal = (wasteByPage[currentPage] || {}).external ?? 15;

  const validRooms = rooms.filter(
    (room) =>
      room?.polygon &&
      room.polygon.length >= 3 &&
      !(room.id && String(room.id).startsWith("text-")) &&
      (scaleValue ? polygonAreaM2Util(room.polygon, scaleValue) > 0.005 : true)
  );

  let dry = 0, wet = 0, timber = 0, tile = 0;
  rooms.forEach((room) => {
    if (!room?.polygon || room.polygon.length < 3) return;
    if (room.id && String(room.id).startsWith("text-")) return;
    const area = scaleValue ? polygonAreaM2Util(room.polygon, scaleValue) : 0;
    if (!area || area <= 0) return;
    const t = room.type || room.wetness || "dry";
    if (t === "dry") dry += area;
    else if (t === "wet") wet += area;
    else if (t === "timber_deck") timber += area;
    else if (t === "tile_deck") tile += area;
  });

  const toggleRoomHighlight = (type) => setHighlightType((prev) => (prev === type ? null : type));

  const totalInternal = dry + wet;
  const totalExternal = timber + tile;
  const totalRaw = totalInternal + totalExternal;
  const wasteAmtInternal = totalInternal * (wasteInternal / 100);
  const wasteAmtExternal = totalExternal * (wasteExternal / 100);
  const totalWaste = wasteAmtInternal + wasteAmtExternal;
  const totalWithWaste = totalRaw + totalWaste;

  // 3. Calculations for Doors & Windows
  const actualDoors = React.useMemo(() => {
    return doors.filter(d => d.type !== 'window' && d.class !== 'window');
  }, [doors]);

  const actualWindows = React.useMemo(() => {
    return doors.filter(d => d.type === 'window' || d.class === 'window');
  }, [doors]);

  const doorData = React.useMemo(() => {
    const groups = {
      privacy: { label: "Privacy", color: "#2196F3", doors: [] },
      passage: { label: "Passage", color: "#4CAF50", doors: [] },
      dummy: { label: "Dummy", color: "#8b5cf6", doors: [] },
      entrance: { label: "Entrance", color: "#f59e0b", doors: [] },
    };

    actualDoors.forEach((d) => {
      const hw = d.hardware_type || "privacy";
      const key = groups[hw] ? hw : "privacy";
      groups[key].doors.push(d);
    });

    return groups;
  }, [actualDoors]);

  const totalDoorCount = actualDoors.length;
  const totalWindowCount = actualWindows.length;

  const doorMetrics = React.useMemo(() => {
    let totalLengthM = 0;
    let totalPerimeterM = 0;
    actualDoors.forEach(d => {
      const m = calcDoorWindowMetrics(d, scaleValue);
      totalLengthM += m.lengthM;
      totalPerimeterM += m.framePerimeterM;
    });
    return {
      count: actualDoors.length,
      totalLengthM: Number(totalLengthM.toFixed(3)),
      totalPerimeterM: Number(totalPerimeterM.toFixed(3)),
    };
  }, [actualDoors, scaleValue]);

  const windowMetrics = React.useMemo(() => {
    let totalLengthM = 0;
    let totalPerimeterM = 0;
    actualWindows.forEach(w => {
      const m = calcDoorWindowMetrics(w, scaleValue);
      totalLengthM += m.lengthM;
      totalPerimeterM += m.framePerimeterM;
    });
    return {
      count: actualWindows.length,
      totalLengthM: Number(totalLengthM.toFixed(3)),
      totalPerimeterM: Number(totalPerimeterM.toFixed(3)),
    };
  }, [actualWindows, scaleValue]);

  // 4. Calculations for Roof Area Summary
  const pageRoofs = roofsByPage[currentPage] || [];
  const roofCalculations = pageRoofs.map(roof => {
    const footprintM2 = scaleValue ? polygonAreaM2Util(roof.polygon, scaleValue) : 0;
    const pitchRad = (roof.pitchAngle || 0) * (Math.PI / 180);
    const trueAreaM2 = pitchRad > 0 ? footprintM2 / Math.cos(pitchRad) : footprintM2;
    return { ...roof, footprintM2, trueAreaM2 };
  });
  const totalRoofArea = roofCalculations.reduce((acc, r) => acc + r.trueAreaM2, 0);

  const selectedWallLengthM = React.useMemo(() => {
    if (!selectedWall || !selectedWall.centerline || selectedWall.centerline.length !== 2) return null;
    const dx = selectedWall.centerline[1][0] - selectedWall.centerline[0][0];
    const dy = selectedWall.centerline[1][1] - selectedWall.centerline[0][1];
    const lengthPx = Math.hypot(dx, dy);
    return scaleValue ? lengthPx * scaleValue : null;
  }, [selectedWall, scaleValue]);

  const calcRealScale = React.useMemo(() => {
    if (typeof realScale === 'number' && realScale > 0) return realScale;
    if (typeof scaleValue === 'number' && scaleValue > 0) {
      return scaleValue > 1 ? scaleValue : scaleValue * 1000;
    }
    return 18.0;
  }, [realScale, scaleValue]);

  const selectedWallMetrics = React.useMemo(() => {
    if (!selectedWall) return null;
    return computeWallAreas(selectedWall, doors || [], calcRealScale, walls || []);
  }, [selectedWall, doors, calcRealScale, walls]);

  // Skirting summary calculation for Project Summary Pane (Image 2)
  const skirtingSummaryMetrics = React.useMemo(() => {
    let totalSkirtingLm = 0;
    let totalFreeEnds = 0;
    const materialMap = {};

    const pageWalls = (walls || []);
    const pageDoors = (doors || []);

    for (const w of pageWalls) {
      if (w.skirting?.enabled === false) continue;
      const res = computeWallAreas(w, pageDoors.filter(d => d.parentWallId === w.id), calcRealScale, pageWalls);
      if (res && res.skirtingLengthLm) {
        totalSkirtingLm += res.skirtingLengthLm;
        totalFreeEnds += (res.freeEndsCount || 0);

        const mat = w.skirting?.material || "92x18 DAR FJ";
        materialMap[mat] = (materialMap[mat] || 0) + res.skirtingLengthLm;
      }
    }

    const totalLengthsNeeded = Math.ceil(totalSkirtingLm / 5.4);

    return {
      totalSkirtingLm,
      totalFreeEnds,
      totalLengthsNeeded,
      materialMap
    };
  }, [walls, doors, calcRealScale]);

  // Excel export for walls (supports all walls or specific wall IDs)
  const exportWallExcel = React.useCallback((targetWallIds = null) => {
    if (!scaleValue && (!walls || walls.length === 0)) {
      alert("Please set drawing scale first to calculate wall dimensions.");
      return;
    }
    const targetWalls = Array.isArray(targetWallIds) && targetWallIds.length > 0
      ? (walls || []).filter(w => targetWallIds.includes(w.id))
      : (walls || []);

    if (targetWalls.length === 0) {
      alert("No walls found to export.");
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = {};
    const s = (r, c, v) => { ws[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: String(v ?? "") }; };
    const n = (r, c, v) => { ws[XLSX.utils.encode_cell({ r, c })] = { t: "n", v: parseFloat(Number(v || 0).toFixed(4)) }; };

    let r = 0;
    const isSubset = targetWalls.length !== (walls || []).length;
    s(r, 0, isSubset ? `Selected Wall Output Report (${targetWalls.length} walls)` : "Wall Summary Output Report"); r++;
    s(r, 0, `Project: ${currentProjectName || "EzeFloor Plan"} | Page ${currentPage + 1}`); r++;
    s(r, 0, `Scale: ${scaleValue ? scaleValue.toFixed(6) : "N/A"} m/px | Calculation: ${wallSides} Side(s), ${deductDoors ? "Net Area (Deducted Openings)" : "Gross Area"}`); r += 2;

    // Headers
    const headers = [
      "Wall ID", "Type", "Length (m)", "Height (m)", "Thickness (mm)",
      "Floor Base", "LBW", "Gross Area (m²)", "Openings (m²)", "Net Area (m²)",
      "Skirting (Lm)", "Start X (mm)", "Start Y (mm)", "End X (mm)", "End Y (mm)"
    ];
    headers.forEach((h, colIdx) => s(r, colIdx, h));
    r++;

    const typeOrder = ["exterior_wall", "interior_wall", "partition_wall", "block_wall"];
    const typeLabels = {
      exterior_wall: "Exterior",
      interior_wall: "Interior",
      partition_wall: "Partition",
      block_wall: "Block",
    };

    let grandLen = 0;
    let grandGrossArea = 0;
    let grandNetArea = 0;
    let grandSkirting = 0;

    for (const type of typeOrder) {
      const typeWalls = targetWalls.filter(w => getWallClass(w) === type);
      if (typeWalls.length === 0) continue;

      const groupLabel = typeLabels[type] || type;
      s(r, 0, `── ${groupLabel} Walls (${typeWalls.length}) ──`);
      r++;

      let groupLen = 0;
      let groupGross = 0;
      let groupNet = 0;
      let groupSkirt = 0;

      typeWalls.forEach((w) => {
        const wallIdx = (walls || []).findIndex(orig => orig.id === w.id);
        const strId = String(w.id);
        const wallIdFormatted = w.name || (wallIdx >= 0 ? `W-${wallIdx + 1}` : (strId.startsWith("man_wall_") || strId.startsWith("wall-topo-") || strId.startsWith("wall-") || strId.startsWith("wall_") || strId.length > 10 ? `W-${wallIdx + 1}` : strId));

        const c = w.centerline;
        let lenM = 0;
        let p1Mm = [0, 0], p2Mm = [0, 0];
        if (c && c.length === 2) {
          const dx = c[1][0] - c[0][0];
          const dy = c[1][1] - c[0][1];
          const lenPx = Math.hypot(dx, dy);
          lenM = scaleValue ? lenPx * scaleValue : 0;
          const scaleMult = (realScale && realScale > 0) ? realScale : (scaleValue ? scaleValue * 1000 : 1.0);
          p1Mm = [Math.round(c[0][0] * scaleMult), Math.round(c[0][1] * scaleMult)];
          p2Mm = [Math.round(c[1][0] * scaleMult), Math.round(c[1][1] * scaleMult)];
        }

        const heightMm = w.height ?? savedDefault;
        const heightM = heightMm / 1000;
        const thicknessMm = w.thickness || 90;
        const floorBase = w.floor_type || "Timber";
        const isLbw = Boolean(w.is_lbw || w.is_load_bearing || w.lbw);

        let openingAreaM2 = 0;
        if (doors && scaleValue) {
          const wallBaseId = getBaseWallId ? getBaseWallId(w.id) : w.id;
          const wallDoors = doors.filter(d => {
            const dWallId = getBaseWallId ? getBaseWallId(d.parentWallId) : d.parentWallId;
            return dWallId === wallBaseId || d.parentWallId === w.id;
          });
          wallDoors.forEach(d => {
            const m = calcDoorWindowMetrics(d, scaleValue);
            openingAreaM2 += (m.lengthM || 0) * (m.heightM || 0);
          });
        }

        const rawGrossM2 = lenM * heightM;
        const netSingleM2 = Math.max(0, rawGrossM2 - openingAreaM2);
        const calculatedAreaM2 = deductDoors ? netSingleM2 * wallSides : rawGrossM2 * wallSides;

        const metrics = computeWallAreas(w, (doors || []).filter(d => d.parentWallId === w.id), calcRealScale, walls || []);
        const skirtLm = metrics?.skirtingLengthLm || 0;

        groupLen += lenM;
        groupGross += rawGrossM2 * wallSides;
        groupNet += calculatedAreaM2;
        groupSkirt += skirtLm;

        s(r, 0, wallIdFormatted);
        s(r, 1, `${groupLabel} Wall`);
        n(r, 2, lenM);
        n(r, 3, heightM);
        n(r, 4, thicknessMm);
        s(r, 5, floorBase);
        s(r, 6, isLbw ? "Yes" : "No");
        n(r, 7, rawGrossM2 * wallSides);
        n(r, 8, openingAreaM2);
        n(r, 9, calculatedAreaM2);
        n(r, 10, skirtLm);
        n(r, 11, p1Mm[0]);
        n(r, 12, p1Mm[1]);
        n(r, 13, p2Mm[0]);
        n(r, 14, p2Mm[1]);
        r++;
      });

      // Group Subtotal
      s(r, 0, "");
      s(r, 1, `${groupLabel} Subtotal`);
      n(r, 2, groupLen);
      s(r, 3, "");
      s(r, 4, "");
      s(r, 5, "");
      s(r, 6, "");
      n(r, 7, groupGross);
      s(r, 8, "");
      n(r, 9, groupNet);
      n(r, 10, groupSkirt);
      r += 2;

      grandLen += groupLen;
      grandGrossArea += groupGross;
      grandNetArea += groupNet;
      grandSkirting += groupSkirt;
    }

    // Grand Total Row
    s(r, 0, "");
    s(r, 1, "GRAND TOTAL");
    n(r, 2, grandLen);
    s(r, 3, "");
    s(r, 4, "");
    s(r, 5, "");
    s(r, 6, "");
    n(r, 7, grandGrossArea);
    s(r, 8, "");
    n(r, 9, grandNetArea);
    n(r, 10, grandSkirting);
    r++;

    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: 14 } });
    ws["!cols"] = [
      { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Wall Summary");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeProject = (currentProjectName || "plan").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePrefix = isSubset ? `${safeProject}_Selected_Walls` : `${safeProject}_Wall_Summary`;
    a.href = url;
    a.download = `${filePrefix}_Pg${currentPage + 1}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [walls, doors, scaleValue, realScale, savedDefault, wallSides, deductDoors, currentProjectName, currentPage, calcRealScale]);

  // JSON export for walls
  const exportWallJson = React.useCallback((targetWallIds = null) => {
    const targetWalls = Array.isArray(targetWallIds) && targetWallIds.length > 0
      ? (walls || []).filter(w => targetWallIds.includes(w.id))
      : (walls || []);

    if (targetWalls.length === 0) {
      alert("No walls found to export.");
      return;
    }

    const scaleMult = (realScale && realScale > 0) ? realScale : (scaleValue ? scaleValue * 1000 : 1.0);
    const isSubset = targetWalls.length !== (walls || []).length;
    const payload = {
      project_name: currentProjectName || "EzeFloor Project",
      page: currentPage + 1,
      scale_m_per_px: scaleValue || null,
      real_scale_mm_per_px: scaleMult,
      wall_calculation_settings: {
        sides: wallSides,
        deduct_openings: deductDoors
      },
      exported_at: new Date().toISOString(),
      total_walls: targetWalls.length,
      walls: targetWalls.map((w) => {
        const wallIdx = (walls || []).findIndex(orig => orig.id === w.id);
        const strId = String(w.id);
        const wallIdFormatted = w.name || (wallIdx >= 0 ? `W-${wallIdx + 1}` : strId);
        const c = w.centerline || [];
        let lengthM = 0;
        let lengthMm = 0;
        let p1Mm = null, p2Mm = null;

        if (c.length === 2) {
          const dx = c[1][0] - c[0][0];
          const dy = c[1][1] - c[0][1];
          const lenPx = Math.hypot(dx, dy);
          lengthM = scaleValue ? Number((lenPx * scaleValue).toFixed(4)) : null;
          lengthMm = Math.round(lenPx * scaleMult);
          p1Mm = [Number((c[0][0] * scaleMult).toFixed(1)), Number((c[0][1] * scaleMult).toFixed(1))];
          p2Mm = [Number((c[1][0] * scaleMult).toFixed(1)), Number((c[1][1] * scaleMult).toFixed(1))];
        }

        const heightMm = w.height ?? savedDefault;
        const heightM = Number((heightMm / 1000).toFixed(3));
        const thicknessMm = w.thickness || 90;
        const wallType = getWallClass(w);
        const isLbw = Boolean(w.is_lbw || w.is_load_bearing || w.lbw);
        const floorType = w.floor_type || "Timber";

        return {
          id: w.id,
          label: wallIdFormatted,
          type: wallType,
          class_name: w.class_name || wallType,
          length_m: lengthM,
          length_mm: lengthMm,
          height_m: heightM,
          height_mm: heightMm,
          thickness_mm: thicknessMm,
          floor_type: floorType,
          is_load_bearing: isLbw,
          centerline_px: c,
          centerline_mm: p1Mm && p2Mm ? [p1Mm, p2Mm] : null,
          surface: w.surface || null,
          skirting: w.skirting || null
        };
      })
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeProject = (currentProjectName || "plan").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePrefix = isSubset ? `${safeProject}_Selected_Walls` : `${safeProject}_Walls`;
    a.href = url;
    a.download = `${filePrefix}_Pg${currentPage + 1}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [walls, scaleValue, realScale, savedDefault, wallSides, deductDoors, currentProjectName, currentPage]);

  useEffect(() => {
    const handleExportWallExcelEvent = () => exportWallExcel();
    const handleExportWallJsonEvent = () => exportWallJson();
    window.addEventListener('export-wall-excel', handleExportWallExcelEvent);
    window.addEventListener('export-wall-json', handleExportWallJsonEvent);
    return () => {
      window.removeEventListener('export-wall-excel', handleExportWallExcelEvent);
      window.removeEventListener('export-wall-json', handleExportWallJsonEvent);
    };
  }, [exportWallExcel, exportWallJson]);

  const handleExportTakeoff = async () => {
    try {
      setIsExporting(true);

      const mappedWalls = walls.map((w, idx) => {
        const c = w.centerline;
        let lengthMm = 0;
        if (c && c.length === 2) {
          const dx = c[1][0] - c[0][0];
          const dy = c[1][1] - c[0][1];
          const lengthPx = Math.hypot(dx, dy);
          lengthMm = scaleValue ? lengthPx * scaleValue * 1000 : 0;
        }
        const strId = String(w.id);
        const wallIdFormatted = w.name || (strId.startsWith("man_wall_") || strId.startsWith("wall-topo-") || strId.startsWith("wall-") || strId.startsWith("wall_") || strId.length > 10 ? `W-${idx + 1}` : strId);

        return {
          id: wallIdFormatted,
          class_name: getWallClass(w),
          length_mm: lengthMm,
          height_mm: w.height ?? savedDefault,
          thickness_mm: w.thickness || 90,
          floor_type: w.floor_type || "Timber"
        };
      });

      const pageWalls = walls || [];

      const mappedDoors = doors.map(d => {
        let t = d.penetration_type || d.penetrationType || "";
        let cls = d.class || "";
        let type = d.type || "";
        let isWindow = (type === 'window' || cls === 'window' || d.doorTypeId === 'win_standard' || (d.doorName && d.doorName.startsWith('W-'))) && cls !== 'sliding_door' && type !== 'sliding';
        const isGarage = cls.includes("garage") || t.includes("garage") || type === "garage" || d.doorTypeId === "ext_garage" || (d.door_name && d.door_name.toLowerCase().includes("garage")) || (d.doorName && d.doorName.toLowerCase().includes("garage"));

        // Rule: Window on internal wall → Sliding Door
        const parentWallForCheck = pageWalls.find(w => w.id === d.parentWallId);
        const isParentExtForCheck = parentWallForCheck && (parentWallForCheck.class_name === 'exterior_wall' || parentWallForCheck.type === 'ext' || parentWallForCheck.is_ext || parentWallForCheck.is_exterior);
        const windowOnIntWall = isWindow && parentWallForCheck && !isParentExtForCheck && parentWallForCheck.class_name !== 'block_wall';
        if (windowOnIntWall) {
          isWindow = false;
        }

        let doorType = "Single Door";
        if (isWindow) {
          doorType = "Window";
        } else if (isGarage) {
          doorType = "Garage Door";
        } else if (windowOnIntWall || cls.includes("sliding") || t.includes("sliding") || cls.includes("slider") || t.includes("slider") || type === "sliding" || type.includes("slider") || d.doorTypeId?.includes("sliding") || d.doorTypeId?.includes("slider") || (d.door_name || d.doorName || '').toLowerCase().includes('slider')) {
          doorType = "Sliding Door";
        } else if (cls.includes("double") || t.includes("double")) {
          doorType = "Double Door";
        }

        const parentWall = pageWalls.find(w => w.id === d.parentWallId);
        const isParentExt = parentWall ? (parentWall.class_name === 'exterior_wall' || parentWall.wall_type === 'ext') : false;
        const isParentBlock = parentWall ? (parentWall.class_name === 'block_wall' || parentWall.wall_type === 'block') : false;
        const doorTypeIdStr = String(d.doorTypeId || d.door_type_id || '');
        const doorClassStr = String(cls || t || type || '');
        const doorNameStr = String(d.doorName || d.door_name || d.name || '').toUpperCase();

        const isExt = !isParentBlock && !!(
          d.is_ext ||
          d.is_exterior ||
          d.location === 'external' ||
          d.location === 'ext' ||
          d.wetness === 'ext' ||
          isGarage ||
          isParentExt ||
          doorTypeIdStr.startsWith('ext_') ||
          doorClassStr.includes('ext') ||
          doorClassStr.includes('external') ||
          doorNameStr.includes('SGD') ||
          doorNameStr.includes('MSD') ||
          doorNameStr.includes('EXT') ||
          doorNameStr.includes('BALCONY') ||
          doorNameStr.includes('ALFRESCO') ||
          doorNameStr.includes('PATIO') ||
          doorNameStr.includes('ENTRY')
        );

        const isWin = isWindow || doorType === "Window";
        const defaultW = isWin ? 1200 : (doorType === "Double Door" ? 1520 : (doorType === "Sliding Door" ? 810 : 760));
        const defaultH = isWin ? 1200 : 1980;

        let width_mm = d.width_mm;
        if (!width_mm) {
          if (d.points && d.points.length >= 2 && realScale) {
            const p1 = Array.isArray(d.points[0]) ? { x: d.points[0][0], y: d.points[0][1] } : d.points[0];
            const p2 = Array.isArray(d.points[1]) ? { x: d.points[1][0], y: d.points[1][1] } : d.points[1];
            width_mm = Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) * realScale);
          }
        }
        if (!width_mm) width_mm = defaultW;

        let height_mm = d.height_mm;
        if (!height_mm) height_mm = defaultH;

        return {
          id: String(d.id),
          door_type: doorType,
          width_mm: Number(width_mm),
          height_mm: Number(height_mm),
          qty: 1,
          block_work: isParentBlock ? "Yes" : (d.block_work || d.blockWork || "No"),
          is_ext: isExt,
          location: isExt ? "ext" : "internal"
        };
      });

      // Automatically round all unrounded lintels before export
      if (lintelController?.roundAllLintels) {
        lintelController.roundAllLintels();
      }

      const pageLintels = lintelsByPage[currentPage] || [];
      const mappedLintels = pageLintels.map(l => {
        const associatedDoor = (l.isAutoDoorLintel && l.doorId && doors && doors.length > 0)
          ? doors.find(d => String(d.id) === String(l.doorId))
          : null;
        const effL = associatedDoor
          ? syncLintelWithDoor(l, associatedDoor, pageWalls, realScale, scaleValue, (lintelController?.globalLengthOffset ?? l.lengthOffset))
          : l;

        const cat = effL.category || 'lintel';
        const desc = cat === 'beam' ? 'Beam' : (cat === 'bh' ? 'BH' : 'Lintel');
        const numMeasured = typeof effL.measuredLength === 'number' ? effL.measuredLength : (effL.baseLength || 0);
        const finalLen = (effL.isRounded && effL.finalLength) ? effL.finalLength : roundLintelLength(numMeasured);
        return {
          id: String(effL.id),
          wall_id: String(effL.wallId),
          start_offset: effL.startOffset,
          end_offset: effL.endOffset,
          measured_length: numMeasured,
          final_length: finalLen,
          catalog_id: effL.catalogId || "800053733",
          type: effL.type || "LVL",
          size: effL.size || effL.height || 90,
          width: effL.width || 35,
          height: effL.height || 90,
          description: desc,
          ply: effL.ply || 1,
          category: cat,
          lengthOffset: effL.lengthOffset || 0
        };
      });

      const payload = {
        walls: mappedWalls,
        doors: mappedDoors,
        lintels: mappedLintels,
        wall_sides: wallSides,
        deduct_doors: deductDoors,
        project_name: takeoffForm.projectName,
        client_name: takeoffForm.clientName,
        detailer_name: takeoffForm.detailerName,
        job_no: takeoffForm.jobNo,
        date: takeoffForm.date
      };

      const headers = { "Content-Type": "application/json" };
      if (user) {
        if (user.username) headers["X-Username"] = user.username;
        if (user.session_token) headers["X-Session-Token"] = user.session_token;
      }

      const response = await fetch(`${BASE_URL}/api/export/takeoff`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${takeoffForm.projectName || "Takeoff"}_Form.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setShowTakeoffModal(false);
    } catch (error) {
      console.error("Export takeoff error:", error);
      alert("Failed to export Takeoff Form: " + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const openTakeoffModal = () => {
    if (lintelController?.roundAllLintels) {
      lintelController.roundAllLintels();
    }
    setTakeoffForm({
      projectName: "",
      clientName: "",
      detailerName: "",
      jobNo: "",
      date: ""
    });
    setShowTakeoffModal(true);
  };

  React.useEffect(() => {
    const handleOpenTakeoff = () => openTakeoffModal();
    window.addEventListener('open-takeoff-modal', handleOpenTakeoff);
    return () => window.removeEventListener('open-takeoff-modal', handleOpenTakeoff);
  }, []);

  // Danh sách các Task Groups HW sau khi lọc theo nhân viên, từ khóa và trạng thái
  const filteredTasks = React.useMemo(() => {
    let list = taskListJobs || [];
    if (staffScope === "my" && myStaffCode) {
      list = list.filter(t => t.ma_nv && t.ma_nv.toUpperCase() === myStaffCode.toUpperCase());
    }
    if (taskFilter === "completed") {
      list = list.filter(t => t.has_local_job);
    } else if (taskFilter === "pending") {
      list = list.filter(t => !t.has_local_job);
    }
    if (taskSearch.trim()) {
      const q = taskSearch.trim().toLowerCase();
      list = list.filter(t =>
        (t.job_number && t.job_number.toLowerCase().includes(q)) ||
        (t.client && t.client.toLowerCase().includes(q)) ||
        (t.builder && t.builder.toLowerCase().includes(q)) ||
        (t.ma_nv && t.ma_nv.toLowerCase().includes(q))
      );
    }
    return list;
  }, [taskListJobs, staffScope, myStaffCode, taskFilter, taskSearch]);

  const cadMetrics = React.useMemo(() => {
    const scale = realScale || 1;
    let totalLenM = 0;
    let extLenM = 0;
    if (Array.isArray(walls)) {
      const classifiedWalls = typeof classifyWallsTouchingExtEndpoints === "function" ? classifyWallsTouchingExtEndpoints(walls) : walls;
      classifiedWalls.forEach(w => {
        let lenM = 0;
        if (typeof w.length_m === "number") lenM = w.length_m;
        else if (typeof w.length === "number") lenM = w.length;
        else if (Array.isArray(w.points) && w.points.length >= 2) {
          const p1 = w.points[0];
          const p2 = w.points[1];
          const x1 = Array.isArray(p1) ? p1[0] : p1.x;
          const y1 = Array.isArray(p1) ? p1[1] : p1.y;
          const x2 = Array.isArray(p2) ? p2[0] : p2.x;
          const y2 = Array.isArray(p2) ? p2[1] : p2.y;
          const distPx = Math.hypot(x2 - x1, y2 - y1);
          lenM = (distPx * scale) / 1000;
        }
        totalLenM += lenM;
        const cls = typeof getWallClass === "function" ? getWallClass(w) : (w.class_name || w.type || "");
        if (cls === "exterior_wall" || cls === "ext" || w.is_ext || w.is_exterior) {
          extLenM += lenM;
        }
      });
    }

    let totalFloorM2 = 0;
    if (Array.isArray(rooms)) {
      rooms.forEach(r => {
        totalFloorM2 += r.areaM2 || (r.area ? r.area / 1000000 : 0) || 0;
      });
    }

    const currentRoofs = roofsByPage?.[currentPage] || [];
    let totalRoofM2 = 0;
    if (Array.isArray(currentRoofs)) {
      currentRoofs.forEach(rf => {
        totalRoofM2 += rf.areaM2 || rf.area || 0;
      });
    }

    const grandLen = Number(totalLenM.toFixed(2));
    const extLen = extLenM > 0 ? Number(extLenM.toFixed(2)) : Number((grandLen * 0.65).toFixed(2));
    const flrArea = Number(totalFloorM2.toFixed(2));
    const rfArea = Number(totalRoofM2.toFixed(2));
    const perim = rfArea > 0 ? Number((Math.sqrt(rfArea) * 4).toFixed(2)) : grandLen;

    return {
      grandTotalLength: grandLen || 0,
      grandTotalArea: flrArea || 0,
      externalWallLength: extLen || 0,
      totalFloorArea: flrArea || 0,
      totalRoofArea: rfArea || 0,
      perimeterM: perim || 0,
      doorCount: Array.isArray(doors) ? doors.length : 0,
      skirtingLm: Number((grandLen * 0.9).toFixed(1)) || 0
    };
  }, [walls, doors, rooms, realScale, roofsByPage, currentPage]);

  return (
    <div
      className="cad-panel"
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
        overflow: "visible",
        position: "relative",
        width: `${calculatedPanelWidth}px`,
        transition: isResizing ? "none" : "width 0.22s cubic-bezier(0.4, 0, 0.2, 1)"
      }}
    >
      {/* ── EXPAND / COLLAPSE TAB BUTTON ATTACHED TO LEFT EDGE (« / ») ── */}
      {isTaskModuleActive && activePaneTab !== "collapsed" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTaskExpanded();
          }}
          title={isTaskExpanded ? "Thu gọn form task (»)" : "Mở rộng form task hết cỡ («)"}
          style={{
            position: "absolute",
            left: "-20px",
            top: "12px",
            width: "20px",
            height: "40px",
            background: isTaskExpanded ? "#eff6ff" : "#ffffff",
            borderTop: isTaskExpanded ? "1px solid #93c5fd" : "1px solid #cbd5e1",
            borderBottom: isTaskExpanded ? "1px solid #93c5fd" : "1px solid #cbd5e1",
            borderLeft: isTaskExpanded ? "1px solid #93c5fd" : "1px solid #cbd5e1",
            borderRight: "none",
            borderRadius: "6px 0 0 6px",
            boxShadow: "-3px 2px 8px rgba(0,0,0,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 1001,
            color: isTaskExpanded ? "#1d4ed8" : "#3b82f6",
            fontSize: "14px",
            fontWeight: "900",
            padding: 0,
            transition: "all 0.15s ease",
            lineHeight: 1
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isTaskExpanded ? "#dbeafe" : "#eff6ff";
            e.currentTarget.style.color = "#1d4ed8";
            e.currentTarget.style.width = "22px";
            e.currentTarget.style.left = "-22px";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isTaskExpanded ? "#eff6ff" : "#ffffff";
            e.currentTarget.style.color = isTaskExpanded ? "#1d4ed8" : "#3b82f6";
            e.currentTarget.style.width = "20px";
            e.currentTarget.style.left = "-20px";
          }}
        >
          {isTaskExpanded ? "»" : "«"}
        </button>
      )}

      {/* ── RESIZE DRAG HANDLE (CHỈ HIỆN TRÊN FORM TASK ĐỂ KÉO THAY ĐỔI WIDTH) ── */}
      {isTaskModuleActive && activePaneTab !== "collapsed" && (
        <div
          onMouseDown={handleMouseDownResize}
          title="Kéo thả sang trái/phải để thay đổi độ rộng khung Task"
          style={{
            position: "absolute",
            left: "-4px",
            top: 0,
            bottom: 0,
            width: "9px",
            cursor: "ew-resize",
            zIndex: 9999,
            background: isResizing ? "rgba(37,99,235,0.7)" : "transparent",
            transition: "background 0.15s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => { if (!isResizing) e.currentTarget.style.background = "rgba(37,99,235,0.3)"; }}
          onMouseLeave={(e) => { if (!isResizing) e.currentTarget.style.background = "transparent"; }}
        />
      )}
      {/* ── LEFT COLUMN 1: PROPERTIES & MODEL EXPLORER / SUMMARY / JOB TASK (RENDERED ONLY WHEN EXPLORER TAB IS ACTIVE) ── */}
      {!isTaskModuleActive && activePaneTab !== "collapsed" && (
        <div style={{
          width: "100%",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
          background: "var(--bg-panel)"
        }}>
          {activePaneTab !== "summary" && activePaneTab !== "job_task" && explorerViewMode === "tree" ? (
            <TreeExplorerPanel
              currentProjectName={currentProjectName}
              explorerSearch={explorerSearch}
              setExplorerSearch={setExplorerSearch}
              expandAllNodes={expandAllNodes}
              collapseAllNodes={collapseAllNodes}
              hiddenItemIds={hiddenItemIds}
              showAllHidden={showAllHidden}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
              pages={pages}
              currentPage={currentPage}
              wallsByPageProp={wallsByPageProp}
              doorsByPageProp={doorsByPageProp}
              roomsByPageProp={roomsByPageProp}
              lintelsByPageProp={lintelsByPageProp}
              roofsByPageProp={roofsByPageProp}
              lintelsByPage={lintelsByPage}
              roofsByPage={roofsByPage}
              walls={walls}
              doors={doors}
              rooms={rooms}
              realScale={realScale}
              scaleValue={scaleValue}
              selectedId={selectedId}
              selectedType={selectedType}
              selectedWallIds={selectedWallIds}
              selectedDoorIds={selectedDoorIds}
              selectedRoomIds={selectedRoomIds}
              selectedLintelIds={selectedLintelIds}
              selectedRoofId={selectedRoofId}
              selectExclusiveWall={selectExclusiveWall}
              selectExclusiveDoor={selectExclusiveDoor}
              selectExclusiveRoom={selectExclusiveRoom}
              selectExclusiveLintel={selectExclusiveLintel}
              selectExclusiveRoof={selectExclusiveRoof}
              setExplorerViewMode={setExplorerViewMode}
              handleRenameRoom={handleRenameRoom}
              handleRenameFloor={handleRenameFloor}
              setPages={setPages}
              setRoomsByPage={setRoomsByPage}
              deleteWalls={deleteWalls}
              deleteDoor={deleteDoor}
              deleteRoof={deleteRoof}
              deleteItem={deleteItem}
              toggleItemVisibility={toggleItemVisibility}
              setHiddenItemIds={setHiddenItemIds}
              setActivePaneTab={setActivePaneTab}
              autoMergeCollinearWalls={autoMergeCollinearWalls}
            />
          ) : activePaneTab === "job_task" ? (
            <TaskGroupsHwPanel
              filteredTasks={filteredTasks}
              taskLoading={taskLoading}
              taskError={taskError}
              taskSearch={taskSearch}
              setTaskSearch={setTaskSearch}
              taskFilter={taskFilter}
              setTaskFilter={setTaskFilter}
              staffScope={staffScope}
              setStaffScope={setStaffScope}
              taskDisplayLimit={taskDisplayLimit}
              setTaskDisplayLimit={setTaskDisplayLimit}
              myStaffCode={myStaffCode}
              fetchTasks={fetchTasks}
              handleOpenJobTask={handleOpenJobTask}
              loadingJobId={loadingJobId}
              setActivePaneTab={setActivePaneTab}
            />
          ) : ((activePaneTab === "explorer" || isTaskModuleActive) && explorerViewMode === "properties") || activePaneTab === "properties" ? (
            /* ══════════════════════════════════════════════════════
               TAB: PROPERTIES (Thuộc tính đối tượng hiện tại + Nút quay lại Explorer)
               ══════════════════════════════════════════════════════ */
            <div style={{ overflowY: "auto", flex: 1, paddingBottom: "20px", display: "flex", flexDirection: "column" }}>
              {/* ── BACK BUTTON TO EXPLORER / LAYERS ── */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "#eff6ff",
                borderBottom: "1px solid #bfdbfe",
                position: "sticky",
                top: 0,
                zIndex: 25
              }}>
                <button
                  onClick={() => setExplorerViewMode("tree")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#ffffff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "6px",
                    padding: "5px 12px",
                    color: "var(--blue)",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(37,99,235,0.12)",
                    transition: "all 0.15s ease"
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: 900 }}>←</span>
                  <span>Back to Explorer / Layers</span>
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#1d4ed8", background: "#dbeafe", padding: "3px 8px", borderRadius: "12px", textTransform: "uppercase" }}>
                    {selectedType ? selectedType.toUpperCase() : selectedAnnotation ? (selectedAnnotation.type || "ANNOTATION").toUpperCase() : "PROPERTIES"}
                  </span>
                  <button
                    onClick={() => setActivePaneTab("collapsed")}
                    title="Close properties pane"
                    style={{
                      background: "transparent",
                      color: "#94a3b8",
                      border: "none",
                      borderRadius: "6px",
                      padding: "2px 5px",
                      fontSize: "16px",
                      fontWeight: "800",
                      cursor: "pointer",
                      lineHeight: 1,
                      transition: "color 0.15s ease"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = "#ef4444"}
                    onMouseLeave={(e) => e.currentTarget.style.color = "#94a3b8"}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* ── PROPERTIES ── */}
              <div className="panel-section">
                <div className="panel-title">Properties</div>
                {(() => {
                  let effectiveType = selectedType;
                  if (!effectiveType) {
                    if (selectedLintelIds && selectedLintelIds.length > 0) {
                      effectiveType = "lintel";
                    } else if (lintelController?.isDrawingLintel || lintelController?.showCatalogPanel) {
                      effectiveType = "lintel";
                    } else if ((selectedDoorIds && selectedDoorIds.length > 0) || (selectedDoor && selectedId === selectedDoor.id)) {
                      effectiveType = (selectedDoor?.class === "window" || selectedDoor?.type === "window") ? "window" : "door";
                    } else if ((selectedWallIds && selectedWallIds.length > 0) || (selectedWall && selectedId === selectedWall.id)) {
                      effectiveType = "wall";
                    } else if ((selectedRoomIds && selectedRoomIds.length > 0) || (selectedRoom && selectedId === selectedRoom.id)) {
                      effectiveType = "room";
                    } else if (selectedRoofId || ((roofsByPage[currentPage] || []).some((r) => r.id === selectedId))) {
                      effectiveType = "roof";
                    } else if (selectedAnnotation || selectedAnnotationId || (selectedAnnotationIds && selectedAnnotationIds.length > 0)) {
                      effectiveType = "annotation";
                    }
                  }

                  if (effectiveType === "lintel") {
                    const pageLintels = lintelsByPage[currentPage] || [];
                    const foundLintel = pageLintels.find((l) => l.id === selectedId) ||
                      (selectedLintelIds && selectedLintelIds.length > 0 ? pageLintels.find((l) => selectedLintelIds.includes(l.id)) : null);
                    return (
                      <LintelPropertyPanel
                        selectedLintel={foundLintel}
                        selectedLintelIds={selectedLintelIds}
                        lintelController={lintelController}
                        doors={doors && doors.length > 0 ? doors : (doorsByPageCtx?.[currentPage] || [])}
                        deleteItem={deleteItem}
                        showConfirm={showConfirm}
                        onClose={() => {
                          if (setSelectedId) setSelectedId(null);
                          if (setSelectedType) setSelectedType(null);
                          if (setSelectedLintelIds) setSelectedLintelIds([]);
                          if (lintelController?.setShowCatalogPanel) lintelController.setShowCatalogPanel(false);
                        }}
                        catalogInitialOpen={lintelController?.showCatalogPanel}
                        activeLintelConfig={lintelController?.activeLintelConfig}
                      />
                    );
                  }

                  if (effectiveType === "door" || effectiveType === "window") {
                    const activeDoor = selectedDoor || (doors || []).find((d) => (selectedDoorIds || []).includes(d.id));
                    return (
                      <DoorWindowPropertyPanel
                        selectedDoor={activeDoor}
                        selectedType={effectiveType || "door"}
                        walls={walls}
                        doors={doors}
                        updateDoor={updateDoor}
                        deleteDoor={deleteDoor}
                        deleteDoors={deleteDoors}
                        selectedDoorIds={selectedDoorIds}
                        setSelectedDoorIds={setSelectedDoorIds}
                        setSelectedId={setSelectedId}
                        setSelectedType={setSelectedType}
                        updateDoorsProperty={updateDoorsProperty}
                        selectDoor={selectDoor}
                        realScale={realScale}
                        scaleValue={scaleValue}
                        showConfirm={showConfirm}
                      />
                    );
                  }

                  if (effectiveType === "wall") {
                    return (
                      <WallPropertyPanel
                        walls={walls}
                        selectedWall={selectedWall}
                        selectedWallIds={selectedWallIds}
                        setSelectedWallIds={setSelectedWallIds}
                        setSelectedId={setSelectedId}
                        setSelectedType={setSelectedType}
                        updateWallsProperty={updateWallsProperty}
                        exportWallExcel={exportWallExcel}
                        exportWallJson={exportWallJson}
                        deleteWalls={deleteWalls}
                        deleteItem={deleteItem}
                        showConfirm={showConfirm}
                        showPrompt={showPrompt}
                        lastSingleWallIdRef={lastSingleWallIdRef}
                        savedDefault={savedDefault}
                        getBaseWallId={getBaseWallId}
                        selectedWallMetrics={selectedWallMetrics}
                        getFinishTypeOptions={getFinishTypeOptions}
                      />
                    );
                  }

                  if (effectiveType === "room") {
                    return (
                      <RoomPropertyPanel
                        selectedRoom={selectedRoom}
                        updateRoom={updateRoom}
                        scaleValue={scaleValue}
                        deleteRoom={deleteItem}
                      />
                    );
                  }

                  if (effectiveType === "roof") {
                    const activeRoof = (roofsByPage[currentPage] || []).find((r) => r.id === (selectedRoofId || selectedId));
                    if (activeRoof) {
                      return (
                        <RoofPropertyPanel
                          selectedRoof={activeRoof}
                          scaleValue={scaleValue}
                          realScale={realScale}
                          roofProps={{
                            defaultPitchInput,
                            setDefaultPitchInput,
                            defaultOverhangInput,
                            setDefaultOverhangInput,
                            defaultHeelHeightInput,
                            setDefaultHeelHeightInput,
                            selectedRoofEdgeIndex,
                            setSelectedRoofEdgeIndex,
                            updateRoofType,
                            applyDefaultPitchToAll,
                            applyDefaultOverhangToAll,
                            applyDefaultHeelHeightToAll,
                            applyDefaultSettingsToAll,
                            updateRoofEdgeAngle,
                            updateRoofEdgeOverhang,
                            updateRoofEdgeHeelHeight,
                            setRoofEdgeMode,
                            toggleDutchEdge,
                            setRoofInteractionState,
                            setInteractionMode,
                            updateDutchOverhang,
                            setRoofEaveEdge,
                            trimRoofEdge,
                            computeSelectedRoof,
                            exportRoofInput,
                            generateRoofFromWalls,
                            isComputingRoof,
                            onNameChange: (roofId, newName) => {
                              const updated = (roofsByPage[currentPage] || []).map((r) => (r.id === roofId ? { ...r, name: newName } : r));
                              if (setRoofsByPage) setRoofsByPage((prev) => ({ ...prev, [currentPage]: updated }));
                            }
                          }}
                          deleteRoof={deleteRoof}
                          showConfirm={showConfirm}
                        />
                      );
                    }
                  }

                  if (effectiveType === "annotation" || selectedAnnotation) {
                    return (
                      <AnnotationPropertyPanel
                        annotation={selectedAnnotation}
                        selectedAnnotationIds={selectedAnnotationIds}
                        annotations={annotationsByPage[currentPage] || []}
                        onUpdateAnnotation={handleUpdateAnnotation}
                        onDeleteAnnotation={handleDeleteAnnotation}
                        onDuplicateAnnotation={handleDuplicateAnnotation}
                        realScale={realScale}
                        scaleValue={scaleValue}
                      />
                    );
                  }

                  return (
                    <div className="panel-hint" style={{ padding: "8px 0" }}>
                      Select a wall, room, door, lintel, roof, or drawing to edit properties.
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : activePaneTab === "summary" ? (
            <SummaryTakeoffPanel
              walls={walls}
              scaleValue={scaleValue}
              realScale={realScale}
              wallData={wallData}
              totalWallCount={totalWallCount}
              grandTotalLength={grandTotalLength}
              grandTotalArea={grandTotalArea}
              sumOf={sumOf}
              wallSides={wallSides}
              setWallSides={setWallSides}
              deductDoors={deductDoors}
              setDeductDoors={setDeductDoors}
              exportWallExcel={exportWallExcel}
              exportWallJson={exportWallJson}
              openTakeoffModal={openTakeoffModal}
              setShowFrameworkModal={setShowFrameworkModal}
              setShowAreaSummaryModal={setShowAreaSummaryModal}
              setShowInsulationModal={setShowInsulationModal}
              setShowLockoutModal={setShowLockoutModal}
              validRooms={validRooms}
              wasteInternal={wasteInternal}
              wasteExternal={wasteExternal}
              setWasteByPage={setWasteByPage}
              currentPage={currentPage}
              dry={dry}
              wet={wet}
              timber={timber}
              tile={tile}
              totalInternal={totalInternal}
              totalExternal={totalExternal}
              totalRaw={totalRaw}
              totalWaste={totalWaste}
              totalWithWaste={totalWithWaste}
              highlightType={highlightType}
              toggleRoomHighlight={toggleRoomHighlight}
              pageRoofs={pageRoofs}
              roofCalculations={roofCalculations}
              totalRoofArea={totalRoofArea}
              generateRoofFromWalls={generateRoofFromWalls}
              roofProps={{
                defaultPitchInput,
                setDefaultPitchInput,
                defaultOverhangInput,
                setDefaultOverhangInput,
                defaultHeelHeightInput,
                setDefaultHeelHeightInput,
                selectedRoofEdgeIndex,
                setSelectedRoofEdgeIndex,
                updateRoofType,
                applyDefaultPitchToAll,
                applyDefaultOverhangToAll,
                applyDefaultHeelHeightToAll,
                applyDefaultSettingsToAll,
                updateRoofEdgeAngle,
                updateRoofEdgeOverhang,
                updateRoofEdgeHeelHeight,
                setRoofEdgeMode,
                toggleDutchEdge,
                setRoofInteractionState,
                setInteractionMode,
                updateDutchOverhang,
                setRoofEaveEdge,
                trimRoofEdge,
                deleteRoof,
                computeSelectedRoof,
                exportRoofInput,
                generateRoofFromWalls,
                isComputingRoof,
                onNameChange: (roofId, newName) => {
                  const updated = (roofsByPage[currentPage] || []).map((r) => (r.id === roofId ? { ...r, name: newName } : r));
                  if (setRoofsByPage) setRoofsByPage((prev) => ({ ...prev, [currentPage]: updated }));
                },
                isSelected: (roofId) => selectedRoofId === roofId,
                onSelect: (roofId) => {
                  if (setSelectedRoofId) setSelectedRoofId(selectedRoofId === roofId ? null : roofId);
                  if (setSelectedId) setSelectedId(selectedRoofId === roofId ? null : roofId);
                  if (setSelectedType) setSelectedType(selectedRoofId === roofId ? null : "roof");
                }
              }}
              doorMetrics={doorMetrics}
              totalDoorCount={totalDoorCount}
              doorData={doorData}
              skirtingSummaryMetrics={skirtingSummaryMetrics}
              totalWindowCount={totalWindowCount}
              windowMetrics={windowMetrics}
              isWallSummaryExpanded={isWallSummaryExpanded}
              setIsWallSummaryExpanded={setIsWallSummaryExpanded}
              isFloorSummaryExpanded={isFloorSummaryExpanded}
              setIsFloorSummaryExpanded={setIsFloorSummaryExpanded}
              isRoofSummaryExpanded={isRoofSummaryExpanded}
              setIsRoofSummaryExpanded={setIsRoofSummaryExpanded}
              isDoorSummaryExpanded={isDoorSummaryExpanded}
              setIsDoorSummaryExpanded={setIsDoorSummaryExpanded}
              isSkirtingSummaryExpanded={isSkirtingSummaryExpanded}
              setIsSkirtingSummaryExpanded={setIsSkirtingSummaryExpanded}
              isWindowSummaryExpanded={isWindowSummaryExpanded}
              setIsWindowSummaryExpanded={setIsWindowSummaryExpanded}
              setActivePaneTab={setActivePaneTab}
              lintelController={lintelController}
            />
          ) : null}
        </div>
      )}

      {/* ── SINGLE COLUMN TASK CALCULATION FORM PANEL (REPLACES PROPERTIES WHEN A TASK TAB IS ACTIVE) ── */}
      {isTaskModuleActive && activeModuleTab && activePaneTab !== "collapsed" && (
        <TaskModulesContainer
          activeModuleTab={activeModuleTab}
          selectedCustomerClient={selectedCustomerClient}
          setSelectedCustomerClient={setSelectedCustomerClient}
          CUSTOMER_TASK_PACKS={CUSTOMER_TASK_PACKS}
          getCustomerModuleIds={getCustomerModuleIds}
          setEnabledModuleIds={setEnabledModuleIds}
          aiGeneratedSuccess={aiGeneratedSuccess}
          handleResetModuleData={handleResetModuleData}
          setActivePaneTab={setActivePaneTab}
          handleModuleFormChange={handleModuleFormChange}
          handleAddDataAI={handleAddDataAI}
          handleSelectEntry={handleSelectEntry}
          moduleFormData={moduleFormData}
          cadMetrics={cadMetrics}
          currentProjectName={currentProjectName}
          currentJobId={currentJobId}
          goPage={goPage}
          FrameHardwareTask={FrameHardwareTask}
          EavesSoffitTask={EavesSoffitTask}
          CladdingTask={CladdingTask}
          InsulationTask={InsulationTask}
          FlooringDeckingTask={FlooringDeckingTask}
          HebelFlooringTask={HebelFlooringTask}
          TimberPostsTask={TimberPostsTask}
          FixoutTask={FixoutTask}
          LockupTask={LockupTask}
          ShelvingTask={ShelvingTask}
          DoorsFurnitureTask={DoorsFurnitureTask}
          FowPlumbingTask={FowPlumbingTask}
          PowerTrussBracesTask={PowerTrussBracesTask}
          FinalFitTask={FinalFitTask}
          SheetScheduleTask={SheetScheduleTask}
          HardiesFireWallsTask={HardiesFireWallsTask}
          frameWallEntries={frameWallEntries}
          handleSetFrameWallEntries={handleSetFrameWallEntries}
          eavesEntries={eavesEntries}
          setEavesEntries={setEavesEntries}
          claddingWallEntries={claddingWallEntries}
          setCladdingWallEntries={setCladdingWallEntries}
          insulationWallEntries={insulationWallEntries}
          handleSetInsulationWallEntries={handleSetInsulationWallEntries}
          insulationAreaEntries={insulationAreaEntries}
          handleSetInsulationAreaEntries={handleSetInsulationAreaEntries}
          flooringEntries={flooringEntries}
          handleSetFlooringEntries={handleSetFlooringEntries}
          hebelFlooringEntries={hebelFlooringEntries}
          handleSetHebelFlooringEntries={handleSetHebelFlooringEntries}
          timberPostEntries={timberPostEntries}
          setTimberPostEntries={setTimberPostEntries}
          fixoutDoorEntries={fixoutDoorEntries}
          setFixoutDoorEntries={setFixoutDoorEntries}
          shelvingEntries={shelvingEntries}
          setShelvingEntries={setShelvingEntries}
          fowPlumbingEntries={fowPlumbingEntries}
          setFowPlumbingEntries={setFowPlumbingEntries}
          powerTrussEntries={powerTrussEntries}
          setPowerTrussEntries={setPowerTrussEntries}
          lockupEntries={lockupEntries}
          handleSetLockupEntries={handleSetLockupEntries}
          hardiesFireWallEntries={hardiesFireWallEntries}
          handleSetHardiesFireWallEntries={handleSetHardiesFireWallEntries}
          selectedWall={selectedWall}
          selectedWallIds={selectedWallIds}
          selectedDoor={selectedDoor}
          selectedDoorIds={selectedDoorIds}
          selectedRoom={selectedRoom}
          selectedRoomIds={selectedRoomIds}
          selectedId={selectedId}
          selectedType={selectedType}
          wallsByPage={effectiveWallsByPage}
          pages={pages}
          scalesByPage={effectiveScalesByPage}
          realScale={realScale}
          scaleValue={scaleValue}
          walls={walls}
          updateWallsProperty={updateWallsProperty}
          updateDoor={updateDoor}
          updateDoorsProperty={updateDoorsProperty}
        />
      )}

      {/* ── RIGHT VERTICAL TAB BAR ── */}
      <RightPropertyTabBar
        activePaneTab={activePaneTab}
        setActivePaneTab={setActivePaneTab}
        isHwOrAllUser={isHwOrAllUser}
        taskListJobs={taskListJobs}
        EXTRA_MODULE_TABS={EXTRA_MODULE_TABS}
        enabledModuleIds={enabledModuleIds}
        showAddModulePopup={showAddModulePopup}
        setShowAddModulePopup={setShowAddModulePopup}
        addModulePopupRef={addModulePopupRef}
        setEnabledModuleIds={setEnabledModuleIds}
        selectedCustomerClient={selectedCustomerClient}
        customerModuleTabs={customerModuleTabs}
        customerModuleIds={customerModuleIds}
      />

      {/* ── TAKEOFF EXPORT PROPERTIES MODAL ── */}
      <TakeoffExportModal
        showTakeoffModal={showTakeoffModal}
        setShowTakeoffModal={setShowTakeoffModal}
        takeoffForm={takeoffForm}
        setTakeoffForm={setTakeoffForm}
        handleExportTakeoff={handleExportTakeoff}
        isExporting={isExporting}
      />
    </div>
  );
}
