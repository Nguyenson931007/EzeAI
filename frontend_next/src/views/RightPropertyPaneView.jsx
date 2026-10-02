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
import { roundLintelLength, syncLintelWithDoor, isLintelActive } from "@/controllers/lintel.controller";
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
  isLocalOnlyModuleId,
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
import DocumentAiReviewModal from "@/components/DocumentAiReviewModal";
import DocumentAiReportModal from "@/components/DocumentAiReportModal";
import TakeoffExportModal from "./right-property-pane/TakeoffExportModal";
import WallPropertyPanel from "./right-property-pane/property-panels/WallPropertyPanel";
import DoorWindowPropertyPanel from "./right-property-pane/property-panels/DoorWindowPropertyPanel";
import RoomPropertyPanel from "./right-property-pane/property-panels/RoomPropertyPanel";
import RoofPropertyPanel from "./right-property-pane/property-panels/RoofPropertyPanel";
import LintelPropertyPanel from "./right-property-pane/property-panels/LintelPropertyPanel";
import AnnotationPropertyPanel from "./right-property-pane/property-panels/AnnotationPropertyPanel";
import { formatLintelCalloutText } from "../controllers/lintel.controller";
import {
  buildFixoutRows,
  buildLockupRows,
  buildWindowRows,
  isWindowOpening,
  getDoorProcurementTask,
  normalizeDoorProcurementTask,
  buildFlooringRows,
  buildInsulationRows,
  buildInsulationAreaRow,
  replaceAutoFillRows,
  buildFrameRows,
  buildShelvingRows,
  buildFinalFitPatch,
  roomAreaM2,
  wallLengthMm,
  shouldIncludeWallInInsulation,
} from "@/utils/procurementAutoFill";
import { buildArchitecturalFloorLevelMap, resolveObjectFloorLevel, resolvePageFloorLevel } from "@/utils/floorLevel";
import { applyTaskRowsToPlan, linkLegacyInsulationRows, reconcileTaskRowsWithPlan, syncTaskRowsFromPlan } from "@/utils/taskPlanSync";
import { flooringTaskId, makeFlooringTaskTabs, normalizeTaskFloorCodes, parseFlooringTaskId } from "@/utils/taskFloorLevels";
import { buildSyncPayloadForTasks } from "@/features/floor-ceiling/controllers/FloorCeilingEngine";

function getPlanObjectBounds(objects = []) {
  const points = [];
  const addPoint = (point) => {
    if (Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))) {
      points.push([Number(point[0]), Number(point[1])]);
    } else if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
      points.push([Number(point.x), Number(point.y)]);
    }
  };

  objects.forEach((item) => {
    if (!item) return;
    const bbox = item.bbox || item.boundingBox || item.bounds;
    if (Array.isArray(bbox) && bbox.length >= 4 && bbox.slice(0, 4).every((value) => Number.isFinite(Number(value)))) {
      points.push([Number(bbox[0]), Number(bbox[1])], [Number(bbox[2]), Number(bbox[3])]);
    }
    [item.centerline, item.points, item.polygon, item.mask_polygon, item.vertices, item.corners, item.outline, item.poly, item.path]
      .filter(Array.isArray)
      .forEach((list) => list.forEach(addPoint));
    addPoint(item.p1);
    addPoint(item.p2);
    addPoint(item.start);
    addPoint(item.end);
    addPoint(item.position);
    addPoint(item.center);
    addPoint(item);
  });

  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  let x1 = Math.min(...xs);
  let y1 = Math.min(...ys);
  let x2 = Math.max(...xs);
  let y2 = Math.max(...ys);
  // Keep geometry bounds tight here. The viewport layer applies semantic
  // padding/zoom based on whether this is a wall, opening, room or a broad
  // task aggregate. Large fixed padding here made small task objects zoom out.
  const maxDim = Math.max(x2 - x1, y2 - y1);
  const padding = Math.max(8, Math.min(48, maxDim * 0.05));
  if (x2 - x1 < 12) { x1 -= 10; x2 += 10; }
  if (y2 - y1 < 12) { y1 -= 10; y2 += 10; }
  return [x1 - padding, y1 - padding, x2 + padding, y2 + padding];
}


const normalizeDoorTaskId = (value) => normalizeDoorProcurementTask(value) || "fixout";

const doorRowLinkId = (row) => row?.doorId ?? row?.door_id ?? null;
const sameDoorLink = (a, b) => {
  const aId = doorRowLinkId(a);
  const bId = doorRowLinkId(b);
  return aId !== null && aId !== undefined && bId !== null && bId !== undefined
    ? String(aId) === String(bId)
    : Boolean(a?.id && b?.id && String(a.id) === String(b.id));
};

const fixoutRowToLockup = (row = {}) => {
  const category = String(row.category || row.mode || "").toLowerCase();
  const loose = category.includes("loose");
  const scopeRaw = String(row.scope || row.location || "internal").toLowerCase();
  const scope = scopeRaw.includes("ext") ? "external" : "internal";
  const wallRaw = row.jamb_or_wall || row.wall_width || "";
  const wall = wallRaw && !/wall/i.test(String(wallRaw)) ? `${String(wallRaw).replace(/mm/gi, "").trim()}mm Wall` : wallRaw;
  const frame = String(row.door_frame || "").trim();
  const jambSize = row.jamb_size || ((frame && !/^(timber jamb|none|-|—)$/i.test(frame)) ? frame : "");
  return {
    ...row,
    procurement_task: "lock_up",
    procurementTask: "lock_up",
    id: row.id || `lock-route-${Date.now()}`,
    floorLevel: row.floorLevel || row.floor_level || "GF",
    mode: loose ? "Loose" : "Prehung",
    category: loose ? "Loose Jamb" : "Prehung",
    scope,
    location: scope === "external" ? "External" : "Internal",
    label: row.label || row.door_label || row.door_name || "",
    door_name: row.door_name || row.door_label || row.label || "",
    door_type: row.door_type || row.door || row.product || "",
    height: row.height || "",
    width: row.width || "",
    thickness: row.thickness || row.thicks || "",
    jamb_or_wall: wall,
    jamb_size: jambSize,
    hung: row.hung || row.handing || row.lift_off_pivot || "",
    type: row.type || "",
    internal_type: row.internal_type || row.hole || "",
    color: row.color || row.finish || "",
    door_stop: row.door_stop || row.stop || "",
    default_qty: Number(row.default_qty || row.qty || 1) || 1,
  };
};

const lockupRowToFixout = (row = {}) => {
  const modeRaw = String(row.mode || row.category || "").toLowerCase();
  const category = modeRaw.includes("loose") ? "loose-jamb" : (/cavity|slid/.test(modeRaw) ? "cavity" : "prehung");
  const wallValue = String(row.wall_width || row.jamb_or_wall || "").match(/\d+(?:\.\d+)?/)?.[0] || "";
  return {
    ...row,
    procurement_task: "fixout",
    procurementTask: "fixout",
    id: row.id || `fix-route-${Date.now()}`,
    floorLevel: row.floorLevel || row.floor_level || "GF",
    category,
    door_label: row.door_label || row.label || row.door_name || "",
    door_type: row.door_type || row.door || row.product || "",
    height: row.height || "",
    width: row.width || "",
    thicks: row.thicks || row.thickness || "",
    wall_width: wallValue,
    door_frame: row.door_frame || row.jamb_size || "Timber Jamb",
    lift_off_pivot: row.lift_off_pivot || "",
    handing: row.handing || row.hung || "",
    hole: row.hole || row.internal_type || "",
    finish: row.finish || row.color || "",
    door_furniture: row.door_furniture || row.furniture || "None",
    door_stop: row.door_stop || row.stop || "None",
    qty: Number(row.qty || row.default_qty || 1) || 1,
  };
};

const upsertDoorTaskRow = (rows = [], row) => {
  const list = Array.isArray(rows) ? rows : [];
  const index = list.findIndex((candidate) => sameDoorLink(candidate, row));
  if (index < 0) return [...list, row];
  const next = [...list];
  next[index] = { ...next[index], ...row, id: next[index]?.id || row?.id };
  return next;
};

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
  buildingFloorLevels: buildingFloorLevelsProp = ["GF"],
  onBuildingFloorLevelsChange,
  currentPage: currentPageProp,
  setCurrentPage: setCurrentPageProp,
  goPage,
  zoomToBbox,
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
  layerOrder, activeLayerTab, setActiveLayerTab, treeSearchQuery, setTreeSearchQuery, handleAutoGroupWalls,
  pushTaskHistory,
  currentPdfFile
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
    levels, setLevels,
    currentLevelIndex, setCurrentLevelIndex,
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
    isCanvasMoving,
    floorCeilingTakeoffData
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
  const effectiveDoorsByPage = (doorsByPageCtx && Object.keys(doorsByPageCtx).length > 0) ? doorsByPageCtx : (doorsByPageProp || {});
  const effectiveScalesByPage = (scalesByPageProp && Object.keys(scalesByPageProp).length > 0) ? scalesByPageProp : (scalesByPageCtx || {});
  const taskSyncFallbackScale = (realScale && realScale > 0)
    ? realScale
    : ((scaleValue && scaleValue > 0) ? scaleValue : 1);

  // All task forms commit linked rows back to the same canonical plan maps.
  // The wallId/doorId/roomId relation is the shared contract; unlinked manual
  // Procurement rows remain task-only and cannot accidentally mutate geometry.
  const commitTaskRowsToPlan = React.useCallback((taskId, rows) => {
    if (!Array.isArray(rows)) return;
    if (setWallsByPageCtx) {
      setWallsByPageCtx((prev) => applyTaskRowsToPlan({
        taskId,
        rows,
        wallsByPage: prev || {},
        doorsByPage: {},
        roomsByPage: {},
        scalesByPage: effectiveScalesByPage,
        fallbackScale: taskSyncFallbackScale,
      }).wallsByPage);
    }
    if (setDoorsByPageCtx) {
      setDoorsByPageCtx((prev) => applyTaskRowsToPlan({
        taskId,
        rows,
        wallsByPage: {},
        doorsByPage: prev || {},
        roomsByPage: {},
        scalesByPage: effectiveScalesByPage,
        fallbackScale: taskSyncFallbackScale,
      }).doorsByPage);
    }
    if (setRoomsByPage) {
      setRoomsByPage((prev) => applyTaskRowsToPlan({
        taskId,
        rows,
        wallsByPage: {},
        doorsByPage: {},
        roomsByPage: prev || {},
        scalesByPage: effectiveScalesByPage,
        fallbackScale: taskSyncFallbackScale,
      }).roomsByPage);
    }
  }, [
    setWallsByPageCtx,
    setDoorsByPageCtx,
    setRoomsByPage,
    effectiveScalesByPage,
    taskSyncFallbackScale,
  ]);

  const queueTaskRowsToPlan = React.useCallback((taskId, rows) => {
    Promise.resolve().then(() => commitTaskRowsToPlan(taskId, rows));
  }, [commitTaskRowsToPlan]);
  const floorLevelByPage = React.useMemo(() => buildArchitecturalFloorLevelMap(pages), [pages]);
  const floorLevelForPage = React.useCallback((pageIndex) => (
    floorLevelByPage.get(Number(pageIndex)) || resolvePageFloorLevel(pages, Number(pageIndex))
  ), [floorLevelByPage, pages]);

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
  const [flooringTaskFloors, setFlooringTaskFloors] = React.useState(() =>
    normalizeTaskFloorCodes(buildingFloorLevelsProp)
  );

  React.useEffect(() => {
    const next = normalizeTaskFloorCodes(buildingFloorLevelsProp);
    setFlooringTaskFloors((prev) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
  }, [buildingFloorLevelsProp]);

  const flooringBaseTab = React.useMemo(
    () => EXTRA_MODULE_TABS.find((mod) => mod.id === "flooring_decking"),
    []
  );
  const taskModuleTabs = React.useMemo(() => {
    const tabs = [];
    EXTRA_MODULE_TABS.forEach((mod) => {
      if (mod.id === "flooring_decking") {
        tabs.push(...makeFlooringTaskTabs(mod, flooringTaskFloors));
      } else {
        tabs.push(mod);
      }
    });
    return tabs;
  }, [flooringTaskFloors]);

  React.useEffect(() => {
    const onBuildingFloorSelected = (event) => {
      const floorLevel = normalizeTaskFloorCodes([event?.detail?.floor_level], { defaultGF: false })[0];
      if (!floorLevel) return;
      const flooring = parseFlooringTaskId(activePaneTab);
      if (activePaneTab === "flooring_decking" || flooring) {
        if (flooringTaskFloors.includes(floorLevel)) {
          setActivePaneTab(flooringTaskId(floorLevel));
        }
      }
    };
    window.addEventListener("building-floor-selected", onBuildingFloorSelected);
    return () => window.removeEventListener("building-floor-selected", onBuildingFloorSelected);
  }, [activePaneTab, flooringTaskFloors]);

  React.useEffect(() => {
    if (activePaneTab === "flooring_decking") {
      setActivePaneTab(flooringTaskId(flooringTaskFloors[0] || "GF"));
    } else {
      const flooring = parseFlooringTaskId(activePaneTab);
      if (flooring && !flooringTaskFloors.includes(flooring.floorLevel)) {
        setActivePaneTab(flooringTaskId(flooringTaskFloors[0] || "GF"));
      }
    }
  }, [activePaneTab, flooringTaskFloors]);

  const persistEnabledModules = React.useCallback(async (nextModuleIds) => {
    const normalized = sanitizeModuleIds(nextModuleIds, selectedCustomerClient);
    setEnabledModuleIds(normalized);

    let emsId = null;
    try {
      sessionStorage.setItem("selectedModules", JSON.stringify(normalized));
      localStorage.setItem("selectedModules", JSON.stringify(normalized));
      const pendingRaw = sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob");
      const pending = pendingRaw ? JSON.parse(pendingRaw) : {};
      pending.task_modules = normalized;
      pending.selected_modules = normalized;
      emsId = pending.id_job_ems || pending.ems_id || pending.id || null;
      sessionStorage.setItem("pendingEmsJob", JSON.stringify(pending));
      localStorage.setItem("pendingEmsJob", JSON.stringify(pending));
      window.dispatchEvent(new CustomEvent("task-modules-updated", {
        detail: { ...pending, task_modules: normalized, selected_modules: normalized, source: "ezefloor-manage-modules" }
      }));
    } catch (_) { }

    if (emsId) {
      try {
        const result = await ApiService.updateTaskModules(emsId, normalized);
        const serverModules = Array.isArray(result?.task_modules)
          ? result.task_modules
          : (Array.isArray(result?.data?.task_modules) ? result.data.task_modules : normalized);
        const confirmed = sanitizeModuleIds(serverModules, selectedCustomerClient);
        if (JSON.stringify(confirmed) !== JSON.stringify(normalized)) setEnabledModuleIds(confirmed);
      } catch (err) {
        console.warn("[task-modules] Could not sync module selection to shared TaskList workflow:", err);
      }
    }
    return normalized;
  }, [selectedCustomerClient]);

  const persistFlooringTaskFloors = React.useCallback(async (nextFloors) => {
    const normalized = normalizeTaskFloorCodes(nextFloors);
    setFlooringTaskFloors(normalized);

    if (onBuildingFloorLevelsChange) {
      await onBuildingFloorLevelsChange(normalized);
      return normalized;
    }

    let emsId = null;
    try {
      const pendingRaw = sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob");
      const pending = pendingRaw ? JSON.parse(pendingRaw) : {};
      pending.floor_levels = normalized;
      emsId = pending.id_job_ems || pending.ems_id || pending.id || null;
      sessionStorage.setItem("pendingEmsJob", JSON.stringify(pending));
      localStorage.setItem("pendingEmsJob", JSON.stringify(pending));
      window.dispatchEvent(new CustomEvent("task-floor-levels-updated", { detail: { floor_levels: normalized } }));
    } catch (_) { }
    if (emsId) {
      try { await ApiService.updateTaskFloorLevels(emsId, normalized); } catch (err) { console.warn("[floor-task] Không thể đồng bộ floor levels về TaskList:", err); }
    }
    return normalized;
  }, [onBuildingFloorLevelsChange]);

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
      WindowTask: pack.WindowTask || fallback.WindowTask || fallback2.WindowTask,
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
    WindowTask,
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
        String(pendingJob.job_number || pendingJob.job_num || "").trim().toLowerCase() === String(currentProjectName || "").trim().toLowerCase() ||
        String(pendingJob.hw_id || "").trim().toLowerCase() === String(currentProjectName || "").trim().toLowerCase() ||
        String(pendingJob.id_job_ems || pendingJob.ems_id || pendingJob.id || "").trim().toLowerCase() === String(currentProjectName || "").trim().toLowerCase()
      );

      if (pendingJob && isMatchingEmsJob) {
        const nextFloors = normalizeTaskFloorCodes(pendingJob.floor_levels);
        setFlooringTaskFloors((prev) => JSON.stringify(prev) === JSON.stringify(nextFloors) ? prev : nextFloors);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("task-floor-levels-updated", {
            detail: { floor_levels: nextFloors, source: "pending-ems-job" }
          }));
        }
      }

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
      !customerModuleIds.includes(parseFlooringTaskId(activePaneTab)?.baseId || activePaneTab) &&
      !isLocalOnlyModuleId(parseFlooringTaskId(activePaneTab)?.baseId || activePaneTab)
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
      const baseActiveId = parseFlooringTaskId(activePaneTab)?.baseId || activePaneTab;
      if (!enabledModuleIds.includes(baseActiveId) && !isLocalOnlyModuleId(baseActiveId)) {
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
    timber_posts: { location: "", timber_size: "", height: "2700", quantity: "1", floor_level: "GF", post_over: "timber", extra_support_qty: "0" },
    fow_plumbing: { fixture: "", pipe_spec: "", length: "", count: "1" },
    power_truss_braces: { truss_area: "", brace_type: "", length: "", hardware: "" },
    hardies_fire_walls: { location: "", wall_length: "", wall_height: "2.70", system_type: "", lining_spec: "" }
  });

  const [aiGeneratedSuccess, setAiGeneratedSuccess] = React.useState(null);
  const [showDocumentAi, setShowDocumentAi] = React.useState(false);
  const [gptTaskRows, setGptTaskRows] = React.useState({});
  const [gptFormProposals, setGptFormProposals] = React.useState({});
  const [gptReport, setGptReport] = React.useState(null);
  const [showGptReport, setShowGptReport] = React.useState(false);
  const [manuallyClearedTasks, setManuallyClearedTasks] = React.useState({});
  const manuallyClearedTasksRef = React.useRef({});

  const normalizeTaskStateKey = (moduleId) => {
    const flooring = parseFlooringTaskId(moduleId);
    if (flooring) return flooring.baseId;
    return ({
      eaves: "eaves_soffit",
      power_truss: "power_truss_braces",
      lockup: "lock_up",
    }[moduleId] || moduleId);
  };

  const handleModuleFormChange = (moduleId, field, value) => {
    const key = normalizeTaskStateKey(moduleId);
    setModuleFormData(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [field]: value
      }
    }));
  };

  const handleResetModuleData = (moduleId) => {
    const key = normalizeTaskStateKey(moduleId);

    // Explicit user Clear must win over all background/auto-sync effects.
    // The flag is removed only when the user explicitly asks to Auto Fill/apply data again.
    manuallyClearedTasksRef.current = {
      ...(manuallyClearedTasksRef.current || {}),
      [key]: true
    };
    setManuallyClearedTasks(prev => ({ ...prev, [key]: true }));

    // Clear every entered / auto-filled row for the active task.
    // This is intentionally an explicit UI action only; it does not write/delete DB records.
    if (key === "frame_hardware") setFrameWallEntries([]);
    if (key === "flooring_decking") {
      const flooringTask = parseFlooringTaskId(moduleId);
      if (flooringTask?.floorLevel) {
        setFlooringEntries((prev) => (prev || []).filter((row) => String(row.floorLevel || row.floor_level || "GF").toUpperCase() !== flooringTask.floorLevel));
      } else {
        setFlooringEntries([]);
      }
    }
    if (key === "hebel_flooring") setHebelFlooringEntries([]);
    if (key === "insulation") {
      setInsulationWallEntries([]);
      setInsulationAreaEntries([]);
      setCustomInsWallOverrides({});
      setCustomInsAreaOverrides({});
    }
    if (key === "eaves_soffit") setEavesEntries([]);
    if (key === "cladding") setCladdingWallEntries([]);
    if (key === "shelving") setShelvingEntries([]);
    if (key === "fow_plumbing") setFowPlumbingEntries([]);
    if (key === "timber_posts") setTimberPostEntries([]);
    if (key === "fixout") setFixoutDoorEntries([]);
    if (key === "windows") setWindowEntries([]);
    if (key === "power_truss_braces") setPowerTrussEntries([]);
    if (key === "lock_up") {
      setLockupEntries([]);
      setCustomLockupOverrides({});
    }
    if (key === "hardies_fire_walls") setHardiesFireWallEntries([]);

    // Clear all values that were loaded / auto-filled into this task form.
    // Keep only the small UI defaults required by the form after a clear.
    setModuleFormData(prev => ({
      ...prev,
      [key]: {
        ...(key === "cladding" || key === "flooring_decking" ? { waste_allowance: "10" } : {}),
        ...(key === "insulation" ? { stud_centres: "450" } : {}),
        ...(key === "timber_posts" ? { height: "2700", quantity: "1", floor_level: "GF", post_over: "timber", extra_support_qty: "0" } : {}),
        ...(key === "power_truss_braces" ? { wall_height: "2700", length: "4500", type: "Column", qty: "1" } : {}),
        ...(key === "doors_furniture" || key === "fow_plumbing" ? { quantity: "1", count: "1" } : {})
      }
    }));

    setAiGeneratedSuccess(null);
  };

  const focusPlanObjects = (objectType, objectIds = [], preferredPageIndex = -1) => {
    if (typeof zoomToBbox !== "function" || !objectIds.length) return;
    const idSet = new Set(objectIds.filter(Boolean).map(String));
    const pageMap = objectType === "wall"
      ? (effectiveWallsByPage || wallsByPageProp || {})
      : objectType === "room"
        ? (roomsByPageProp || {})
        : (doorsByPageProp || {});
    const fallbackItems = objectType === "wall" ? walls : objectType === "room" ? rooms : doors;
    const candidates = [];

    if (preferredPageIndex >= 0) candidates.push(preferredPageIndex);
    Object.keys(pageMap || {}).map(Number).filter(Number.isFinite).forEach((pageIndex) => {
      if (!candidates.includes(pageIndex)) candidates.push(pageIndex);
    });
    if (!candidates.includes(currentPage)) candidates.push(currentPage);

    for (const pageIndex of candidates) {
      const pageItems = Array.isArray(pageMap?.[pageIndex]) ? pageMap[pageIndex] : (pageIndex === currentPage ? fallbackItems : []);
      const matched = (pageItems || []).filter((item) => idSet.has(String(item?.id)));
      const bbox = getPlanObjectBounds(matched);
      if (bbox) {
        const count = matched.length;
        let profile = "detail";

        if (objectType === "door") {
          profile = "opening";
        } else if (objectType === "room") {
          profile = count > 1 ? "area-group" : "room";
        } else if (objectType === "wall") {
          // Procurement tasks do not all mean the same visual scope.
          // Insulation and Frame rows are often aggregates (all EXT/INT walls),
          // while Cladding/Eaves and direct wall rows are commonly inspectable
          // wall selections. Keep aggregate rows as a plan overview and zoom a
          // single physical wall close enough to inspect while retaining its full run.
          const aggregateWallTask = activePaneTab === "insulation" || activePaneTab === "frame_hardware";
          if (count === 1) profile = "wall";
          else if (aggregateWallTask || count >= 6) profile = "overview";
          else profile = "wall-group";
        }

        zoomToBbox(pageIndex, bbox, {
          profile,
          objectCount: count,
          taskId: activePaneTab,
          objectType,
        });
        return;
      }
    }
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
        if (p.isFloorCeilingWorkspace || p.source === "floor_ceiling_page" || p.source === "floor_ceiling_workspace") return false;
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
      focusPlanObjects("wall", entry.wallIds, targetPageIndex);
      return;
    }
    if (entry.wallId) {
      if (setSelectedWallIds) setSelectedWallIds([entry.wallId]);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("wall");
      if (setSelectedId) setSelectedId(entry.wallId);
      focusPlanObjects("wall", [entry.wallId], targetPageIndex);
      return;
    }
    if (entry.roomIds && entry.roomIds.length > 0) {
      if (setSelectedRoomIds) setSelectedRoomIds(entry.roomIds);
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("room");
      if (setSelectedId) setSelectedId(entry.roomIds[0]);
      focusPlanObjects("room", entry.roomIds, targetPageIndex);
      return;
    }
    if (entry.roomId) {
      if (setSelectedRoomIds) setSelectedRoomIds([entry.roomId]);
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("room");
      if (setSelectedId) setSelectedId(entry.roomId);
      focusPlanObjects("room", [entry.roomId], targetPageIndex);
      return;
    }
    if (entry.doorId) {
      const isWindowEntry = entry.objectType === "window" || isWindowOpening(entry);
      if (setSelectedDoorIds) setSelectedDoorIds([entry.doorId]);
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType(isWindowEntry ? "window" : "door");
      if (setSelectedId) setSelectedId(entry.doorId);
      focusPlanObjects("door", [entry.doorId], targetPageIndex);
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

      const wallPool = targetPageIndex >= 0 && Array.isArray(effectiveWallsByPage?.[targetPageIndex])
        ? effectiveWallsByPage[targetPageIndex]
        : (walls || []);
      const matchedWallIds = wallPool
        .filter(w => isSlabTarget ? isSlabWall(w) : !isSlabWall(w))
        .map(w => w.id);

      if (setSelectedWallIds) setSelectedWallIds(matchedWallIds);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("wall");
      if (setSelectedId) setSelectedId(matchedWallIds[0] || null);
      focusPlanObjects("wall", matchedWallIds, targetPageIndex);
      return;
    }

    // 2. EXTERNAL vs INTERNAL WALLS (Insulation Task)
    const typeStr = String(entry.type || entry.areaType || entry.category || "").toLowerCase();
    if (typeStr.includes("ext") || typeStr.includes("int") || typeStr.includes("party")) {
      const targetWallCategory = typeStr.includes("ext")
        ? "ext"
        : (typeStr.includes("party") || typeStr.includes("parti") ? "party" : "int");
      const getInsulationWallCategory = (w) => {
        const cName = String(w.class_name || "").toLowerCase();
        const wType = String(w.wall_type || "").toLowerCase();
        if (cName.includes("partition") || cName.includes("party") || cName.includes("parti") || wType === "part" || wType === "party") return "party";
        if (w.is_ext || w.is_exterior || wType === "ext" || cName.includes("exterior") || cName.includes("ext_wall")) return "ext";
        return "int";
      };
      const targetHeight = Number.parseFloat(String(entry.height ?? entry.wallHeight ?? entry.wall_height ?? "").replace(/[^0-9.]/g, ""));
      const wallPool = targetPageIndex >= 0 && Array.isArray(effectiveWallsByPage?.[targetPageIndex])
        ? effectiveWallsByPage[targetPageIndex]
        : (walls || []);

      const matchedWallIds = wallPool
        .filter((w) => {
          if (getInsulationWallCategory(w) !== targetWallCategory) return false;
          if (!Number.isFinite(targetHeight) || targetHeight <= 0) return true;
          const wallHeight = Number.parseFloat(String(w.height_mm ?? w.height ?? "").replace(/[^0-9.]/g, ""));
          return !Number.isFinite(wallHeight) || wallHeight <= 0 || Math.abs(wallHeight - targetHeight) <= 5;
        })
        .map(w => w.id);

      if (setSelectedWallIds) setSelectedWallIds(matchedWallIds);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setSelectedType) setSelectedType("wall");
      if (setSelectedId) setSelectedId(matchedWallIds[0] || null);
      focusPlanObjects("wall", matchedWallIds, targetPageIndex);
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
      focusPlanObjects("room", matchedRoomIds, targetPageIdx);
      return;
    }

    // 4. DOORS (Lockup Task, Fixout Task, Doors & Furniture Task)
    const doorLocStr = String(entry.location || entry.doorLabel || entry.door || entry.doorType || entry.name || "").toLowerCase().trim();
    const cleanId = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    const doorPool = targetPageIndex >= 0 && Array.isArray(doorsByPageProp?.[targetPageIndex])
      ? doorsByPageProp[targetPageIndex]
      : (doors || []);
    const matchedDoor = doorPool.find(d => {
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
      focusPlanObjects("door", [matchedDoor.id], targetPageIndex);
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
    const flooringTask = parseFlooringTaskId(moduleId);
    const requestedFloorLevel = flooringTask?.floorLevel || null;
    const rawModuleId = flooringTask?.baseId || moduleId;
    const normalizedModuleId = rawModuleId === "lockup" ? "lock_up" : rawModuleId;

    let aiValues = {};

    const effScale =
      realScale && realScale > 0
        ? realScale
        : scaleValue && scaleValue > 0
          ? scaleValue
          : 1.0;

    const curPageObj = pages && pages[currentPage];

    const isFCPage = Boolean(
      curPageObj?.isFloorCeilingWorkspace ||
      curPageObj?.source === "floor_ceiling_page" ||
      curPageObj?.source === "floor_ceiling_workspace"
    );
    const isFloorCeilingPageIndex = (pageIndex) => {
      const page = pages?.[Number(pageIndex)];
      return Boolean(
        page?.isFloorCeilingWorkspace ||
        page?.source === "floor_ceiling_page" ||
        page?.source === "floor_ceiling_workspace" ||
        page?.category === "floor_ceiling"
      );
    };

    const rawWalls = isFCPage
      ? []
      : wallsByPageProp && wallsByPageProp[currentPage]
        ? wallsByPageProp[currentPage]
        : walls || [];

    const curWalls = rawWalls.filter(
      (w) => !w.isFloorCeilingOnly && !w.excludeFromOtherTasks
    );

    const curDoors = isFCPage
      ? []
      : doorsByPageProp && doorsByPageProp[currentPage]
        ? doorsByPageProp[currentPage]
        : doors || [];

    const curRooms = isFCPage
      ? []
      : roomsByPageProp && roomsByPageProp[currentPage]
        ? roomsByPageProp[currentPage]
        : rooms || [];

    // Explicit Auto Fill re-enables generation after a manual Clear.
    if (manuallyClearedTasksRef.current?.[normalizedModuleId]) {
      const nextRef = { ...(manuallyClearedTasksRef.current || {}) };
      delete nextRef[normalizedModuleId];
      manuallyClearedTasksRef.current = nextRef;
    }
    setManuallyClearedTasks(prev => {
      if (!prev?.[normalizedModuleId]) return prev;
      const next = { ...prev };
      delete next[normalizedModuleId];
      return next;
    });
    const fallbackScale = (realScale && realScale > 0) ? realScale : ((scaleValue && scaleValue > 0) ? scaleValue : 1);

    const currentWalls = (wallsByPageProp && wallsByPageProp[currentPage]) ? wallsByPageProp[currentPage] : (walls || []);
    const currentDoors = (doorsByPageProp && doorsByPageProp[currentPage]) ? doorsByPageProp[currentPage] : (doors || []);
    const currentRooms = (roomsByPageProp && roomsByPageProp[currentPage]) ? roomsByPageProp[currentPage] : (rooms || []);

    const liveDoorsByPage =
      effectiveDoorsByPage && Object.keys(effectiveDoorsByPage).length
        ? effectiveDoorsByPage
        : doorsByPageProp;

    const allDoors = liveDoorsByPage && Object.keys(liveDoorsByPage).length
      ? Object.entries(liveDoorsByPage).flatMap(([pageKey, pageDoors]) => {
        const pIdx = Number(pageKey);
        return (pageDoors || []).map((door) => ({
          ...door,
          __floorLevel: resolveObjectFloorLevel(door, pages, pIdx),
          __sourcePageIndex: pIdx,
        }));
      })
      : (currentDoors || []).map((door) => ({
        ...door,
        __floorLevel: resolveObjectFloorLevel(door, pages, currentPage),
        __sourcePageIndex: currentPage,
      }));

    const allWallsForDoorRouting = effectiveWallsByPage && Object.keys(effectiveWallsByPage).length
      ? Object.entries(effectiveWallsByPage).flatMap(([pageKey, pageWalls]) => {
        const pIdx = Number(pageKey);
        if (isFloorCeilingPageIndex(pIdx)) return [];
        return (pageWalls || [])
          .filter((wall) => !wall?.isFloorCeilingOnly && !wall?.excludeFromOtherTasks)
          .map((wall) => ({ ...wall, __sourcePageIndex: pIdx }));
      })
      : (currentWalls || [])
        .filter((wall) => !wall?.isFloorCeilingOnly && !wall?.excludeFromOtherTasks)
        .map((wall) => ({ ...wall, __sourcePageIndex: currentPage }));

    let formPatch = {};
    let generatedCount = 0;

    // IMPORTANT: Auto Fill only writes values that can be derived from the
    // drawing/model or an existing explicit object property. Product/spec
    // choices that belong to Procurement catalog are intentionally left blank.
    // This avoids silently inventing material selections that Procurement will
    // later calculate from.
    if (normalizedModuleId === "frame_hardware") {
      const frameRows = buildFrameRows(
        (effectiveWallsByPage && Object.keys(effectiveWallsByPage).length) ? effectiveWallsByPage : { [currentPage]: currentWalls },
        pages || [],
        effectiveScalesByPage || {},
        fallbackScale,
      );
      setFrameWallEntries(frameRows);
      generatedCount = frameRows.length;
      if (frameRows[0]) {
        formPatch = {
          wall_height: frameRows[0].height,
          wall_length: String(frameRows.reduce((sum, row) => sum + (parseFloat(row.length) || 0), 0)),
          base_construction: frameRows[0].baseType || "",
        };
      }
    } else if (normalizedModuleId === "flooring_decking" || normalizedModuleId === "hebel_flooring") {
      const perPage = [];
      const roomPages = roomsByPageProp && Object.keys(roomsByPageProp).length ? roomsByPageProp : { [currentPage]: currentRooms };
      Object.entries(roomPages).forEach(([pageKey, pageRooms]) => {
        const pIdx = Number(pageKey);
        const floorLevel = floorLevelForPage(pIdx);
        if (requestedFloorLevel && floorLevel !== requestedFloorLevel) return;
        const pageScale = (effectiveScalesByPage && effectiveScalesByPage[pIdx] > 0) ? effectiveScalesByPage[pIdx] : fallbackScale;
        perPage.push(...buildFlooringRows(pageRooms || [], pageScale, floorLevel));
      });

      const dry = perPage.filter((r) => r.typeArea === "Dry").reduce((s, r) => s + Number(r.areaM2 || 0), 0);
      const wet = perPage.filter((r) => r.typeArea === "Wet").reduce((s, r) => s + Number(r.areaM2 || 0), 0);
      const balcony = perPage.filter((r) => r.typeArea === "Balcony Tiles").reduce((s, r) => s + Number(r.areaM2 || 0), 0);
      const decking = perPage.filter((r) => r.typeArea === "Decking Input").reduce((s, r) => s + Number(r.areaM2 || 0), 0);

      if (normalizedModuleId === "flooring_decking") {
        if (requestedFloorLevel) {
          setFlooringEntries((prev) => [
            ...(prev || []).filter((row) => String(row.floorLevel || row.floor_level || "GF").toUpperCase() !== requestedFloorLevel),
            ...perPage,
          ]);
        } else {
          setFlooringEntries(perPage);
        }
        formPatch = {
          dryArea: dry ? dry.toFixed(2) : "",
          wetArea: wet ? wet.toFixed(2) : "",
          balconyArea: balcony ? balcony.toFixed(2) : "",
          otherArea: decking ? decking.toFixed(2) : "",
          otherTypeArea: decking ? "Decking Input" : "",
        };
      } else {
        // Hebel rows reuse detected room areas but do not invent a Hebel product.
        setHebelFlooringEntries(perPage.map((row) => ({ ...row, id: String(row.id).replace("floor-ai-", "hebel-ai-"), product: "" })));
      }
      generatedCount = perPage.length;
    } else if (normalizedModuleId === "insulation") {
      const allRows = [];
      const wallPages = (effectiveWallsByPage && Object.keys(effectiveWallsByPage).length) ? effectiveWallsByPage : { [currentPage]: currentWalls };
      Object.entries(wallPages).forEach(([pageKey, pageWalls]) => {
        const pIdx = Number(pageKey);
        // Floor & Ceiling workspace walls are calculation helpers only. Never feed
        // them back into wall-based task Auto Fill.
        if (isFloorCeilingPageIndex(pIdx)) return;
        const pageScale = (effectiveScalesByPage && effectiveScalesByPage[pIdx] > 0) ? effectiveScalesByPage[pIdx] : fallbackScale;
        allRows.push(...buildInsulationRows(pageWalls || [], pageScale, floorLevelForPage(pIdx)));
      });
      setInsulationWallEntries((current) => replaceAutoFillRows(current, allRows));

      // Reuse the latest explicit Floor & Ceiling scan when Insulation is cleared
      // and Auto Fill is pressed again. Do NOT invent Ceiling/Floor from room area.
      const liveFloorCeilingRows =
        typeof window !== "undefined" &&
          Array.isArray(window.__EZEFLOOR_FC_INSULATION_ENTRIES__)
          ? window.__EZEFLOOR_FC_INSULATION_ENTRIES__
          : [];

      let cachedAreaRows = liveFloorCeilingRows.length > 0
        ? liveFloorCeilingRows
        : (Array.isArray(floorCeilingTakeoffData?.insulationEntries)
          ? floorCeilingTakeoffData.insulationEntries
          : []);

      // Clear Data removes task rows, not the Floor & Ceiling scan itself.
      // Rebuild the rows from the latest scan so Insulation Auto Fill alone
      // is enough to restore Floor/Ceiling.
      if (cachedAreaRows.length === 0) {
        const scanSources = [];
        if (floorCeilingTakeoffData?.areas) scanSources.push(floorCeilingTakeoffData);
        (pages || []).forEach((page) => {
          if (
            page?.lastScanResult &&
            (page?.isFloorCeilingWorkspace ||
              page?.source === "floor_ceiling_page" ||
              page?.source === "floor_ceiling_workspace" ||
              page?.category === "floor_ceiling")
          ) {
            scanSources.push(page.lastScanResult);
          }
        });

        const rebuilt = scanSources.flatMap((scan) => {
          const payload = buildSyncPayloadForTasks(scan);
          return Array.isArray(payload?.insulationEntries) ? payload.insulationEntries : [];
        });

        const seen = new Set();
        cachedAreaRows = rebuilt.filter((row) => {
          const key = [
            String(row?.type || ""),
            String(row?.floorLevel || row?.floor_level || "GF"),
            Number(row?.insulationArea || row?.totalArea || row?.area || 0).toFixed(2),
          ].join("|");
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      if (cachedAreaRows.length > 0) {
        setInsulationAreaEntries((current) => {
          const manualOnly = (Array.isArray(current) ? current : []).filter((row) => row?.source !== "floor_ceiling_sync");
          return [...manualOnly, ...cachedAreaRows];
        });
      }

      generatedCount = allRows.length + cachedAreaRows.length;
      formPatch = {
        ext_wall_area: String(allRows.filter((x) => x.type === "Ext wall").reduce((s, x) => s + Number(x.insulationArea || 0), 0).toFixed(2)),
        int_wall_area: String(allRows.filter((x) => x.type === "Int wall").reduce((s, x) => s + Number(x.insulationArea || 0), 0).toFixed(2)),
      };
    } else if (normalizedModuleId === "fixout") {
      const rows = buildFixoutRows(allDoors, allWallsForDoorRouting);
      const windowRevealRows = buildWindowRows(allDoors, allWallsForDoorRouting).map((row, index) => ({
        ...row,
        id: `window-reveal-${row.doorId || index}`,
        doorId: row.doorId || null,
        source: "window_autofill",
        autofill_source: "drawing",
        type: "window",
        label: row.label || `W-${index + 1}`,
        height: row.height || "",
        width: row.width || "",
        blockWork: "No",
        floorLevel: row.floorLevel || "GF",
      }));
      setFixoutDoorEntries(rows);
      handleModuleFormChange("fixout", "fixout_excluded_window_ids", "[]");

      const currentRevealRows = (() => {
        try {
          const raw = moduleFormData?.fixout?.fixout_reveal_openings;
          const parsed = raw ? JSON.parse(raw) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      })();
      const manualRevealRows = currentRevealRows.filter((row) => row?.source !== "window_autofill");
      handleModuleFormChange("fixout", "fixout_reveal_openings", JSON.stringify([...manualRevealRows, ...windowRevealRows]));

      generatedCount = rows.length + windowRevealRows.length;
    } else if (normalizedModuleId === "lock_up") {
      const rows = buildLockupRows(allDoors, allWallsForDoorRouting);
      setLockupEntries(rows);
      generatedCount = rows.length;
    } else if (normalizedModuleId === "windows") {
      const rows = buildWindowRows(allDoors);
      setWindowEntries(rows);
      const windowRevealRows = rows.map((row, index) => ({
        ...row,
        id: `window-reveal-${row.doorId || index}`,
        doorId: row.doorId || null,
        source: "window_autofill",
        autofill_source: "drawing",
        type: "window",
        label: row.label || `W-${index + 1}`,
        height: row.height || "",
        width: row.width || "",
        blockWork: "No",
        floorLevel: row.floorLevel || "GF",
      }));
      handleModuleFormChange("fixout", "fixout_excluded_window_ids", "[]");
      let currentRevealRows = [];
      try {
        const raw = moduleFormData?.fixout?.fixout_reveal_openings;
        const parsed = raw ? JSON.parse(raw) : [];
        currentRevealRows = Array.isArray(parsed) ? parsed : [];
      } catch (_) { }
      const rowsNotCreatedByAutoFill = currentRevealRows.filter((row) => row?.source !== "window_autofill");
      handleModuleFormChange("fixout", "fixout_reveal_openings", JSON.stringify([...rowsNotCreatedByAutoFill, ...windowRevealRows]));
      generatedCount = rows.length;
    } else if (normalizedModuleId === "shelving") {
      const roomPages = roomsByPageProp && Object.keys(roomsByPageProp).length ? Object.values(roomsByPageProp).flat() : currentRooms;
      const rows = buildShelvingRows(roomPages || []);
      setShelvingEntries(rows);
      generatedCount = rows.length;
    } else if (normalizedModuleId === "eaves_soffit") {
      // Geometry can fill measured length; brand/thickness/batten/bead stay catalog-driven.
      const length = Number(cadMetrics?.perimeterM || 0);
      setEavesEntries(length > 0 ? [{
        id: "eaves-ai-measured",
        floorLevel: floorLevelForPage(currentPage),
        level: floorLevelForPage(currentPage),
        width: "",
        length: Number(length.toFixed(2)),
        area: 0,
        autofill_source: "drawing",
      }] : []);
      generatedCount = length > 0 ? 1 : 0;
      formPatch = { floor_level: floorLevelForPage(currentPage), total_eave_length: length ? String(length.toFixed(2)) : "" };
    } else if (normalizedModuleId === "cladding") {
      // Build one measured row per explicit exterior wall. No fake opening deduction or product.
      const extWalls = currentWalls.filter((w) => {
        const cls = String(getWallClass(w) || w?.class_name || w?.wall_type || "").toLowerCase();
        return cls === "exterior_wall" || cls === "ext";
      });
      const rows = extWalls.map((w, idx) => {
        const c = w.centerline;
        let lenMm = 0;
        if (w.length_m) lenMm = Math.round(Number(w.length_m) * 1000);
        else if (Array.isArray(c) && c.length === 2) {
          const x1 = Array.isArray(c[0]) ? c[0][0] : c[0]?.x;
          const y1 = Array.isArray(c[0]) ? c[0][1] : c[0]?.y;
          const x2 = Array.isArray(c[1]) ? c[1][0] : c[1]?.x;
          const y2 = Array.isArray(c[1]) ? c[1][1] : c[1]?.y;
          const px = Math.hypot(Number(x2 || 0) - Number(x1 || 0), Number(y2 || 0) - Number(y1 || 0));
          lenMm = Math.round((fallbackScale < 0.5 ? px * fallbackScale * 1000 : px * fallbackScale));
        }
        const height = Number(w.height_mm || w.height || 0);
        const grossArea = lenMm && height ? (lenMm / 1000) * (height / 1000) : 0;
        return {
          id: `clad-ai-${w.id || idx}`,
          wallId: w.id,
          floorLevel: floorLevelForPage(currentPage),
          elevation: String(w.elevation || w.label || `Exterior wall ${idx + 1}`),
          height: height || "",
          length: lenMm || "",
          openings: 0,
          waste: 0,
          grossArea: Number(grossArea.toFixed(2)),
          netArea: Number(grossArea.toFixed(2)),
          totalArea: Number(grossArea.toFixed(2)),
          product: "",
          autofill_source: "drawing",
        };
      }).filter((row) => row.length);
      setCladdingWallEntries(rows);
      generatedCount = rows.length;
      formPatch = { floor_level: floorLevelForPage(currentPage) };
    } else if (normalizedModuleId === "timber_posts") {
      // Posts cannot be inferred safely from generic wall geometry. Use only explicit post objects.
      const explicitPosts = (cadMetrics?.posts || cadMetrics?.timberPosts || []).map((p, idx) => ({
        id: `post-ai-${p.id || idx}`,
        floorLevel: p.floorLevel || floorLevelForPage(currentPage),
        postType: p.postType || p.type || "Please Select",
        postHeight: p.postHeight || p.height || "",
        postSize: p.postSize || p.size || "Please Select",
        post: p.post || p.product || "",
        qty: p.qty || 1,
        postOver: p.postOver || p.post_over || "timber",
        galPostSupports: p.galPostSupports || 0,
        autofill_source: "drawing",
      }));
      setTimberPostEntries(explicitPosts);
      generatedCount = explicitPosts.length;
    } else if (normalizedModuleId === "power_truss_braces") {
      // Only consume explicitly detected/entered structural brace geometry.
      const braces = (cadMetrics?.powerTrussBraces || cadMetrics?.braces || []).map((b, idx) => ({
        id: `ptb-ai-${b.id || idx}`,
        floorLevel: b.floorLevel || floorLevelForPage(currentPage),
        wallHeight: String(b.wallHeight || b.wall_height || b.height || ""),
        length: String(b.length || b.length_mm || ""),
        type: b.type === "Brace" ? "Brace" : "Column",
        qty: Number(b.qty || 1),
        autofill_source: "drawing",
      })).filter((b) => b.wallHeight && b.length);
      setPowerTrussEntries(braces);
      generatedCount = braces.length;
    } else if (normalizedModuleId === "fow_plumbing") {
      // Plumbing product rows require Procurement catalog identity. Keep existing rows;
      // only expose deterministic room-derived counts in form metadata here.
      const roomList = roomsByPageProp && Object.keys(roomsByPageProp).length ? Object.values(roomsByPageProp).flat() : currentRooms;
      const names = (roomList || []).map((r) => String(r.room_name || r.name || r.label || "").toLowerCase());
      const wetRooms = names.filter((n) => /bath|ensuite|\bens\b|\bwc\b|toilet|powder|laundry|l['’]?dry|shower/.test(n)).length;
      formPatch = { detected_wet_rooms: String(wetRooms) };
      generatedCount = wetRooms;
    } else if (normalizedModuleId === "final_fit") {
      formPatch = buildFinalFitPatch(allDoors);
      generatedCount = allDoors.length;
    } else if (normalizedModuleId === "doors_furniture") {
      // This module is not a Procurement source-of-truth form; do not invent furniture.
      generatedCount = allDoors.length;
    } else if (normalizedModuleId === "sheet_schedule") {
      const area = Number(cadMetrics?.grandTotalArea || cadMetrics?.totalRoomArea || 0);
      formPatch = { total_area: area > 0 ? area.toFixed(2) : "" };
      generatedCount = area > 0 ? 1 : 0;
    }

    if (Object.keys(formPatch).length) {
      setModuleFormData((prev) => ({
        ...prev,
        [normalizedModuleId]: {
          ...(prev[normalizedModuleId] || {}),
          ...formPatch,
        },
      }));
    }

    setAiGeneratedSuccess(normalizedModuleId);
    setTimeout(() => setAiGeneratedSuccess(null), 2500);

    // Expose a small audit event so task forms/tests can inspect what Auto Fill
    // actually generated without writing anything to the database.
    try {
      window.dispatchEvent(new CustomEvent("ezefloor:procurement_autofill_complete", {
        detail: { moduleId: normalizedModuleId, generatedCount, formPatch },
      }));
    } catch (_) { }
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
    const newName = await showPrompt("Enter new floor name:", currentDisplayName);
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
    const newName = await showPrompt("Room Name:", currentName);
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
  const serverSearchActiveRef = React.useRef(false);

  // Read EMS jobs from the same ListJobs/ListClient source used by Procurement.
  // Search is sent to SQL instead of filtering only the first page in memory, so
  // older jobs (for example TESTAI) remain discoverable exactly like Procurement.
  const fetchTasks = React.useCallback(async (forceRefresh = false, searchTerm = "") => {
    const normalizedSearch = String(searchTerm || "").trim();
    try {
      setTaskLoading(true);
      setTaskError(null);
      const res = await ApiService.fetchTaskListJobs(500, forceRefresh, normalizedSearch || null);
      if (res && res.status === "success" && Array.isArray(res.data)) {
        setTaskListJobs(res.data);
        // Cache only the normal job list. Never replace it with a temporary search result.
        if (!normalizedSearch) {
          try {
            localStorage.setItem("cachedTaskListJobs", JSON.stringify(res.data));
          } catch (e) { }
        }
      } else {
        setTaskListJobs([]);
      }
    } catch (err) {
      console.error("Error fetching EMS jobs:", err);
      let loadedFromCache = false;
      if (!normalizedSearch) {
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
      }
      if (!loadedFromCache) {
        setTaskError(err.message || "Could not load EMS jobs");
        setTaskListJobs([]);
      }
    } finally {
      setTaskLoading(false);
    }
  }, []);

  // Initial EMS job list.
  React.useEffect(() => {
    if (!hasFetchedTasksRef.current) {
      hasFetchedTasksRef.current = true;
      fetchTasks(false, "");
    }
  }, [fetchTasks]);

  // Procurement searches the EMS database, not only the currently loaded rows.
  // Mirror that behavior here with a small debounce to avoid one SQL call per keypress.
  React.useEffect(() => {
    if (!hasFetchedTasksRef.current) return undefined;
    const q = String(taskSearch || "").trim();
    const shouldReloadFullList = !q && serverSearchActiveRef.current;
    if (!q && !shouldReloadFullList) return undefined;

    const timer = window.setTimeout(() => {
      serverSearchActiveRef.current = Boolean(q);
      fetchTasks(false, q);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [taskSearch, fetchTasks]);

  // Xử lý mở/chọn 1 Job Task
  const handleOpenJobTask = async (task) => {
    if (!task) return;
    const targetName = task.job_number || task.hw_id || "Project";

    // 0. If user clicks on the currently active project, do nothing
    if (currentProjectName && targetName === currentProjectName) {
      return;
    }

    // Check if the current workspace has active drawing data (pages, walls, etc.)
    const hasCurrentDrawing = (pagesProp && pagesProp.length > 0) ||
      (pagesContext && pagesContext.length > 0) ||
      (wallsByPageProp && Object.values(wallsByPageProp).some(arr => arr && arr.length > 0)) ||
      (wallsByPageCtx && Object.values(wallsByPageCtx).some(arr => arr && arr.length > 0));

    if (hasCurrentDrawing) {
      const confirmed = await showConfirm(
        `You have unsaved changes in project "${currentProjectName || "current"}".\n` +
        `Switching to project "${targetName}" will discard any unsaved changes.\n\n` +
        `Do you want to continue?`
      );
      if (!confirmed) {
        return;
      }
    }

    const taskListClient = task.client || null;
    const emsId = task.id_job_ems || task.ems_id || task.hw_id || task.id;
    const localJobId = task.local_job?.id;
    const localJobData = task.local_job?.data;
    const hasLocalKnown = Boolean(localJobId || localJobData || task.has_local_job);
    const activeLoadingKey = task.id || task.job_number || task.hw_id;

    // Helper: Reset all drawing states to empty immediately (0ms delay)
    const resetWorkspaceState = () => {
      // 1. Determine target floor levels immediately
      const initialFloors = normalizeTaskFloorCodes(task?.floor_levels);

      // 2. Immediately build & save the new job's pending metadata to sessionStorage & localStorage
      // so any background sync or event reading pendingEmsJob reads the new job and default floors!
      try {
        sessionStorage.setItem("ezefloor_skip_restore", "1");
        const cleanInitialMeta = {
          id: task.id || emsId,
          id_job_ems: emsId || task.id,
          hw_id: task.hw_id || null,
          job_number: targetName,
          job_num: targetName,
          floor_levels: initialFloors,
          client: taskListClient,
          task_client: taskListClient,
          local_job: task.local_job || null
        };
        sessionStorage.setItem("pendingEmsJob", JSON.stringify(cleanInitialMeta));
        localStorage.setItem("pendingEmsJob", JSON.stringify(cleanInitialMeta));
        if (taskListClient) {
          const clientKey = resolveCustomerPackKey(taskListClient);
          if (clientKey) {
            sessionStorage.setItem("selectedCustomerClient", clientKey);
            localStorage.setItem("selectedCustomerClient", clientKey);
          }
        }
      } catch (_) { }

      // 3. Clear React drawing states immediately
      if (setPagesProp) setPagesProp([]);
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

      // 4. Clear selection & interaction state
      if (setSelectedId) setSelectedId(null);
      if (setSelectedType) setSelectedType(null);
      if (setSelectedWallIds) setSelectedWallIds([]);
      if (setSelectedDoorIds) setSelectedDoorIds([]);
      if (setSelectedRoomIds) setSelectedRoomIds([]);
      if (setSelectedLintelIds) setSelectedLintelIds([]);
      if (setHighlightType) setHighlightType(null);
      if (setCurrentPageProp) setCurrentPageProp(0);

      // 5. Reset levels and selection immediately in Context & component state (0ms delay)
      if (setCurrentLevelIndex) setCurrentLevelIndex(0);
      if (setLevels) {
        setLevels(initialFloors.map((code, idx) => ({
          id: `lvl-${idx + 1}`,
          name: idx === 0 ? "Level 1" : `Level ${idx + 1}`,
          code: code
        })));
      }
      setFlooringTaskFloors(initialFloors);

      // 6. Synchronize shared building floor registry with initialFloors immediately
      if (onBuildingFloorLevelsChange) {
        void onBuildingFloorLevelsChange(initialFloors, { persist: false });
      }

      // 7. Set project name & job context for the new job
      if (setCurrentProjectName) setCurrentProjectName(targetName);
      if (setCurrentJobId) setCurrentJobId(null);
      if (setActiveTab) setActiveTab("Home");

      // 8. Broadcast reset events immediately
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("task-floor-levels-updated", {
          detail: { floor_levels: initialFloors, source: "reset-workspace" }
        }));
        window.dispatchEvent(new CustomEvent("ezefloor:reset_workspace", {
          detail: { floor_levels: initialFloors }
        }));
      }

      // Non-blocking cleanup in background
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("ezefloor_last_active_job_id");
          localStorage.removeItem("ezefloor_last_active_project_name");
        }
      } catch (_) { }
      clearWorkspaceState("active_session").catch(err => {
        console.warn("[handleOpenJobTask] Could not clear IndexedDB:", err);
      });
    };

    // Helper: Apply metadata & modules from task/EMS
    const applyTaskMetadata = (fullTask) => {
      const tClientKey = resolveCustomerPackKey(taskListClient || fullTask.client || fullTask.task_client);
      const tFloors = normalizeTaskFloorCodes(fullTask.floor_levels || task.floor_levels);
      setFlooringTaskFloors(tFloors);
      if (setCurrentLevelIndex) setCurrentLevelIndex(0);
      if (setLevels) {
        setLevels(tFloors.map((code, idx) => ({
          id: `lvl-${idx + 1}`,
          name: idx === 0 ? "Level 1" : `Level ${idx + 1}`,
          code: code
        })));
      }
      if (onBuildingFloorLevelsChange) {
        void onBuildingFloorLevelsChange(tFloors, { persist: false });
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("task-floor-levels-updated", {
          detail: { floor_levels: tFloors, source: "tasklist-job-api" }
        }));
      }

      try {
        const { local_job, ...metaWithoutDrawing } = fullTask;
        const cleanTaskMeta = {
          ...metaWithoutDrawing,
          id: fullTask.id || task.id || emsId,
          id_job_ems: fullTask.id_job_ems || emsId || task.id,
          job_number: fullTask.job_number || targetName,
          job_num: fullTask.job_num || fullTask.job_number || targetName,
          floor_levels: tFloors,
          client: taskListClient || metaWithoutDrawing.client || null,
          task_client: taskListClient || metaWithoutDrawing.task_client || metaWithoutDrawing.client || null,
          local_job: local_job ? {
            id: local_job.id,
            project_name: local_job.project_name,
            room_count: local_job.room_count,
            total_area: local_job.total_area
          } : null
        };
        sessionStorage.setItem("pendingEmsJob", JSON.stringify(cleanTaskMeta));
        try { localStorage.setItem("pendingEmsJob", JSON.stringify(cleanTaskMeta)); } catch (_) { }
        if (tClientKey) {
          sessionStorage.setItem("selectedCustomerClient", tClientKey);
          localStorage.setItem("selectedCustomerClient", tClientKey);
        }
      } catch (_) { }

      if (tClientKey) {
        setSelectedCustomerClient(tClientKey);
      }

      const authoritativeMods = Array.isArray(fullTask.task_modules)
        ? fullTask.task_modules
        : (Array.isArray(fullTask.selected_modules)
          ? fullTask.selected_modules.map(m => typeof m === "string" ? m : m.module_id).filter(Boolean)
          : null);

      if (Array.isArray(authoritativeMods)) {
        setEnabledModuleIds(authoritativeMods);
        try { sessionStorage.setItem("selectedModules", JSON.stringify(authoritativeMods)); } catch (_) { }
      } else {
        const taskModules = sanitizeModuleIds(resolveTaskModules(fullTask), tClientKey || selectedCustomerClient);
        if (taskModules && taskModules.length > 0) {
          setEnabledModuleIds(taskModules);
          try { sessionStorage.setItem("selectedModules", JSON.stringify(taskModules)); } catch (_) { }
        }
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("task-modules-updated", { detail: fullTask }));
      }
    };

    // ─────────────────────────────────────────────────────────────
    // BRANCH 1: Brand new Job without drawing in SQLite
    // ─────────────────────────────────────────────────────────────
    if (!hasLocalKnown) {
      // 1. INSTANT OPTIMISTIC RESET: Switch to empty workspace and apply task metadata immediately (0ms delay)
      resetWorkspaceState();
      applyTaskMetadata(task);

      // 2. Fetch EMS details in background (non-blocking) to configure client, floors & modules
      if (emsId) {
        ApiService.getJobByEmsId(emsId)
          .then((emsRes) => {
            if (emsRes?.status === "success" && emsRes.data) {
              const enriched = {
                ...task,
                ...emsRes.data,
                client: taskListClient || emsRes.data.client || null,
                task_client: taskListClient || emsRes.data.task_client || emsRes.data.client || null,
              };
              applyTaskMetadata(enriched);
            }
          })
          .catch((err) => {
            console.warn("Could not fetch EMS details for task in background:", err);
          });
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // BRANCH 2: Job has an existing drawing in SQLite
    // ─────────────────────────────────────────────────────────────
    // A. Inline local_job data available
    if (localJobData) {
      try {
        const parsed = typeof localJobData === "string" ? JSON.parse(localJobData) : localJobData;
        const savedPageFloors = Array.from(new Set(
          Array.from(buildArchitecturalFloorLevelMap(parsed?.pages || []).values())
        ));
        const combinedFloors = normalizeTaskFloorCodes([
          ...(task.floor_levels || []),
          ...savedPageFloors
        ]);

        if (onLoadJob) {
          onLoadJob(parsed, task.local_job?.project_name || targetName, localJobId);
        }
        if (setActiveTab) setActiveTab("Home");
        applyTaskMetadata({ ...task, floor_levels: combinedFloors });
        if (emsId) {
          ApiService.getJobByEmsId(emsId).then((res) => {
            if (res?.status === "success" && res.data) {
              const enrichedFloors = normalizeTaskFloorCodes([
                ...(res.data.floor_levels || combinedFloors),
                ...savedPageFloors
              ]);
              applyTaskMetadata({ ...task, ...res.data, floor_levels: enrichedFloors });
            }
          }).catch(() => null);
        }
        return;
      } catch (err) {
        console.warn("[handleOpenJobTask] Error parsing inline local_job data:", err);
      }
    }

    // B. Fetch EMS metadata and local job drawing in PARALLEL via Promise.all (halves network wait)
    setLoadingJobId(activeLoadingKey);
    try {
      const [emsRes, localJobRes] = await Promise.all([
        emsId ? ApiService.getJobByEmsId(emsId).catch((err) => {
          console.warn("Could not fetch EMS details:", err);
          return null;
        }) : Promise.resolve(null),
        localJobId
          ? ApiService.getJobData(localJobId).catch(() => null)
          : ApiService.findJob(targetName).catch(() => null)
      ]);

      const currentTask = (emsRes?.status === "success" && emsRes.data)
        ? {
          ...task,
          ...emsRes.data,
          client: taskListClient || emsRes.data.client || null,
          task_client: taskListClient || emsRes.data.task_client || emsRes.data.client || null,
        }
        : task;

      let drawingLoaded = false;
      if (localJobRes?.status === "success" && (localJobRes.data || (localJobRes.found && localJobRes.data))) {
        const rawData = localJobRes.data;
        const parsed = typeof rawData === "string" ? JSON.parse(rawData) : rawData;

        // Extract all floor codes from the saved drawing pages so all levels are preserved
        const savedPageFloors = Array.from(new Set(
          Array.from(buildArchitecturalFloorLevelMap(parsed?.pages || []).values())
        ));
        const combinedFloors = normalizeTaskFloorCodes([
          ...(currentTask.floor_levels || task.floor_levels || []),
          ...savedPageFloors
        ]);

        applyTaskMetadata({ ...currentTask, floor_levels: combinedFloors });

        if (onLoadJob) {
          onLoadJob(
            parsed,
            localJobRes.project_name || currentTask.local_job?.project_name || targetName,
            localJobId || localJobRes.job_id
          );
        }
        if (setActiveTab) setActiveTab("Home");
        drawingLoaded = true;
      } else {
        applyTaskMetadata(currentTask);
      }

      if (!drawingLoaded) {
        // Fallback: If drawing could not be loaded, reset workspace cleanly
        resetWorkspaceState();
      }
    } catch (err) {
      console.warn("[handleOpenJobTask] Error loading job:", err);
      resetWorkspaceState();
    } finally {
      setLoadingJobId(null);
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
  const isGptAdmin = isFullAdmin(user);
  const isHwOrAllUser = isGptAdmin || hasHwAccess(user) || userBophan === "hw" || userBophan === "all" || userBophan === "admin";

  // Auto-switch to explorer if task tabs are not allowed for this user
  React.useEffect(() => {
    if (!isHwOrAllUser && (activePaneTab === "job_task" || taskModuleTabs.some(t => t.id === activePaneTab))) {
      setActivePaneTab("explorer");
    }
  }, [isHwOrAllUser, activePaneTab, taskModuleTabs]);

  // ── DYNAMIC TASK EXPANSION & DRAG RESIZING STATE ──
  const isTaskModuleActive = isHwOrAllUser && taskModuleTabs.some(t => t.id === activePaneTab);
  const activeModuleTab = taskModuleTabs.find(t => t.id === activePaneTab);
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
      queueTaskRowsToPlan("frame_hardware", next);

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
  }, [selectedWallIds, selectedWall, updateWallsProperty, queueTaskRowsToPlan]);

  // Note: Frame Hardware wall calculation is managed in FrameHardwareTask with full multi-page & load-bearing support

  // 5. Flooring State & Custom Room Overrides
  const [flooringEntries, setFlooringEntries] = React.useState([]);
  const [hebelFlooringEntries, setHebelFlooringEntries] = React.useState([]);
  const [customRoomOverrides, setCustomRoomOverrides] = React.useState({});

  const handleSetFlooringEntries = React.useCallback((actionOrEntries) => {
    setFlooringEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      queueTaskRowsToPlan("flooring_decking", next);

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
  }, [selectedRoomIds, selectedRoom, queueTaskRowsToPlan]);

  const handleSetHebelFlooringEntries = React.useCallback((actionOrEntries) => {
    setHebelFlooringEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      queueTaskRowsToPlan("hebel_flooring", next);
      return next;
    });
  }, [queueTaskRowsToPlan]);

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

          // Product is a Procurement dropdown value. Never invent one here.
          // Keep only an explicit override/candidate; FlooringDeckingTask will
          // validate it against the active customer's dropdown catalog.
          const product = override.product || r.product || "";
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
            glueType: "",
            glueQty: 0
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
            product: "",
            hebelQty: 0
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
      queueTaskRowsToPlan("insulation", next);
      setTimeout(() => {
        if (Array.isArray(next) && next.length > 0) {
          const newOverrides = {};
          next.forEach(entry => {
            const ids = entry.wallIds && entry.wallIds.length > 0
              ? entry.wallIds
              : (entry.wallId ? [entry.wallId] : []);
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
  }, [queueTaskRowsToPlan]);

  const handleSetInsulationAreaEntries = React.useCallback((actionOrEntries) => {
    setInsulationAreaEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      queueTaskRowsToPlan("insulation_area", next);
      setTimeout(() => {
        if (Array.isArray(next) && next.length > 0) {
          const newOverrides = {};
          next.forEach(entry => {
            const ids = entry.roomIds && entry.roomIds.length > 0
              ? entry.roomIds
              : (entry.roomId ? [entry.roomId] : []);
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
  }, [queueTaskRowsToPlan]);

  // Listen for sync events from Floor & Ceiling Workspace
  React.useEffect(() => {
    const handleSync = (e) => {
      if (e.detail?.entries && Array.isArray(e.detail.entries)) {
        handleSetInsulationAreaEntries(prev => {
          const existing = Array.isArray(prev) ? [...prev] : [];
          // Keep manual user entries, replace prior synced Floor & Ceiling entries
          const manualOnly = existing.filter(x => x.source !== "floor_ceiling_sync");
          return [...manualOnly, ...e.detail.entries];
        });
      }
    };
    window.addEventListener("sync-floor-ceiling-insulation", handleSync);
    return () => window.removeEventListener("sync-floor-ceiling-insulation", handleSync);
  }, [handleSetInsulationAreaEntries]);

  // Listen for clear events from Floor & Ceiling Workspace to remove synced entries
  React.useEffect(() => {
    const handleClear = () => {
      if (handleSetInsulationAreaEntries) {
        handleSetInsulationAreaEntries(prev => {
          if (!Array.isArray(prev)) return prev;
          return prev.filter(item => item.source !== "floor_ceiling_sync");
        });
      }
    };
    window.addEventListener("sync-floor-ceiling-insulation-clear", handleClear);
    window.addEventListener("ezefloor:clear_floor_ceiling_scan", handleClear);
    return () => {
      window.removeEventListener("sync-floor-ceiling-insulation-clear", handleClear);
      window.removeEventListener("ezefloor:clear_floor_ceiling_scan", handleClear);
    };
  }, [handleSetInsulationAreaEntries]);

  const [insWallType, setInsWallType] = React.useState("external");
  const [insWallHeight, setInsWallHeight] = React.useState("2700");
  const [insWallLength, setInsWallLength] = React.useState("");
  const [insWallRValue, setInsWallRValue] = React.useState("");
  const [insWallProduct, setInsWallProduct] = React.useState("");
  const [insWallRaked, setInsWallRaked] = React.useState("0");
  const [insWallDoor, setInsWallDoor] = React.useState("0");

  const [insAreaType, setInsAreaType] = React.useState("ceiling");
  const [insAreaRValue, setInsAreaRValue] = React.useState("");
  const [insAreaProduct, setInsAreaProduct] = React.useState("");
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
    const code = codeMatch ? codeMatch[1] : "";

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
      netArea: Number(net.toFixed(2)),
      autofill_source: "manual"
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
    const code = codeMatch ? codeMatch[1] : "";

    const newEntry = {
      id: `ins-a-${Date.now()}`,
      type: insAreaType,
      rValue: insAreaRValue,
      productCode: code,
      productName: insAreaProduct,
      area: Number(a.toFixed(2)),
      autofill_source: "manual"
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
  const [flrType, setFlrType] = React.useState("");
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
          flooring_type: prev.flooring_decking?.flooring_type || "",
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
            areaNum = 0;
          }
          areaNum = Number(areaNum.toFixed(2));

          const isWet = /bath|ensuite|wc|powder|laundry|shower/i.test(roomName) || r.type === "wet";
          const isDeck = /deck|porch|verandah|patio/i.test(roomName) || (r.type && r.type.includes("timber"));
          const isBalcony = /balcony|alfresco|terrace/i.test(roomName) || (r.type && r.type.includes("tile"));
          const typeArea = isWet ? "Wet" : (isDeck ? "Decking Input" : (isBalcony ? "Balcony Tiles" : "Dry"));

          return {
            id: `flr-ai-${r.id || idx}-${Date.now()}`,
            roomId: r.id,
            roomIds: r.id ? [r.id] : [],
            floorLevel: floorLevelForPage(currentPage),
            typeArea,
            location: roomName,
            product: "",
            product_candidate: r.product || "",
            areaM2: areaNum,
            totalM2: areaNum,
            autofill_source: "drawing",
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
      setManuallyClearedTasks(prev => {
        if (!prev?.lock_up) return prev;
        const next = { ...prev };
        delete next.lock_up;
        return next;
      });
      const { doors: rawDoors = [], lockoutRows = [] } = e.detail;

      const sourceList = (lockoutRows.length > 0 ? lockoutRows : rawDoors)
        .filter((door) => !isWindowOpening(door))
        .map((door) => ({ ...door, procurement_task: "lock_up", procurementTask: "lock_up" }));
      if (sourceList.length > 0) {
        // Use the same shared builders as the task Auto Fill path. Dynamic
        // dropdown fields (Door Type/Jamb Size/Furniture) are staged as
        // candidates and only become values after task dropdown validation.
        const generated = buildLockupRows(sourceList, []);
        setLockupEntries(generated);
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
      setManuallyClearedTasks(prev => {
        if (!prev?.insulation) return prev;
        const next = { ...prev };
        delete next.insulation;
        return next;
      });
      const { insulationRows = [] } = e.detail;
      if (insulationRows.length > 0) {
        const wallRows = insulationRows.map((r, idx) => {
          const isExt = (r.wall_type || "").toLowerCase().includes("ext");
          const netA = Math.max(0, ((r.wall_height || 2700) / 1000) * ((r.wall_length || 0) / 1000) + (r.total_area_raked || 0) - (r.total_area_door || 0));
          return {
            id: `ins-w-ai-${Date.now()}-${idx}`,
            wallId: r.wallId || r.wall_id || r.id,
            wallIds: (r.wallId || r.wall_id || r.id) ? [r.wallId || r.wall_id || r.id] : [],
            type: isExt ? "Ext wall" : "Int wall",
            rValue: "",
            productCode: "",
            productName: "",
            height: r.wall_height || 2700,
            length: r.wall_length || 0,
            rakedArea: r.total_area_raked || 0,
            doorArea: r.total_area_door || 0,
            netArea: Number(netA.toFixed(2)),
            autofill_source: "drawing",
          };
        });
        setInsulationWallEntries((current) => replaceAutoFillRows(current, wallRows));
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

  // Local-only Window register. It is derived from plan objects and never
  // persisted through Procurement APIs.
  const [windowEntries, setWindowEntries] = React.useState([]);

  // 7. Lockup State & Custom Overrides
  const [lockupEntries, setLockupEntries] = React.useState([]);
  const [customLockupOverrides, setCustomLockupOverrides] = React.useState({});

  const handleSetLockupEntries = React.useCallback((actionOrEntries) => {
    setLockupEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      const doorOnlyRows = (Array.isArray(next) ? next : []).filter((row) => !isWindowOpening(row));
      queueTaskRowsToPlan("lock_up", doorOnlyRows);
      return doorOnlyRows;
    });
  }, [queueTaskRowsToPlan]);

  // When on Lockup task: dynamic door calculation and bidirectional synchronization with canvas selection
  React.useEffect(() => {
    if (activePaneTab === "lockup" || activePaneTab === "lock_up") {
      // Do not silently rebuild rows immediately after an explicit Clear data.
      if (manuallyClearedTasksRef.current?.lock_up || manuallyClearedTasks?.lock_up) return;
      // Opening a task must never populate it. Plan-derived rows are created
      // only by the explicit Auto Fill action; this effect only keeps rows that
      // already exist in sync with their linked plan doors.
      if (!lockupEntries || lockupEntries.length === 0) return;

      const curDoors = (doorsByPageProp && doorsByPageProp[currentPage]) ? doorsByPageProp[currentPage] : (doors || []);
      const curRoutingWalls = ((wallsByPageProp && wallsByPageProp[currentPage]) ? wallsByPageProp[currentPage] : (walls || []))
        .filter((wall) => !wall?.isFloorCeilingOnly && !wall?.excludeFromOtherTasks);
      const targetDoors = (curDoors || []).filter((door) => !isWindowOpening(door) && getDoorProcurementTask(door, curRoutingWalls) === "lock_up");

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

      const getLockupMode = (door, isExt, override = {}) => {
        const overrideCategory = String(override.category || "").trim().toLowerCase();
        if (overrideCategory.includes("cavity")) return "Cavity";
        if (overrideCategory.includes("loose")) return "Loose";
        if (overrideCategory.includes("prehung")) return "Prehung";

        const source = [
          door?.lockup_mode,
          door?.mode,
          door?.doorTypeId,
          door?.penetration_type,
          door?.class,
          door?.type,
          door?.door_name,
          door?.doorName,
          door?.label
        ].filter(Boolean).join(" ").toLowerCase();

        if (/cavity|sliding/.test(source)) return "Cavity";
        if (String(door?.lockup_mode || door?.mode || "").toLowerCase().includes("loose")) return "Loose";
        if (String(door?.lockup_mode || door?.mode || "").toLowerCase().includes("prehung")) return "Prehung";
        return isExt ? "Prehung" : "Loose";
      };

      const buildEntry = (d, idx) => {
        const override = customLockupOverrides[d.id] || {};
        const dLabel = (override.doorLabel || d.door_name || d.doorName || d.doorLabel || (d.label && !/single|sliding|window|door/i.test(d.label) ? d.label : null) || `D-${idx + 1}`).trim();
        const rawType = String(d.door_type || d.type || "").toLowerCase();
        const isExt = getDoorIsExt(d, dLabel, rawType);

        const dWidth = getDoorWidthInMm(d, realScale, scaleValue);
        const dHeight = getDoorHeightInMm(d);
        const wallThick = d.wall_thickness || d.thickness_mm || 90;
        const lockupMode = getLockupMode(d, isExt, override);
        const isLoose = lockupMode === "Loose";

        const dHinge = String(override.hung || d.hingeSide || d.hinge_side || d.handing || d.hung || "").toLowerCase();
        const isRight = dHinge.includes("right") || dHinge.includes("rh") || dHinge === "hung a";
        const isLeft = dHinge.includes("left") || dHinge.includes("lh") || dHinge === "hung b";
        const hungVal = isRight ? "Hung A" : (isLeft ? "Hung B" : (isExt ? "Hung B" : "Hung A"));

        const [built] = buildLockupRows([{
          ...d,
          scope: isExt ? "external" : "internal",
          location: isExt ? "External" : "Internal",
          mode: lockupMode,
          lockup_mode: lockupMode,
          procurement_task: "lock_up",
          procurementTask: "lock_up",
          width: dWidth,
          height: dHeight,
          wall_thickness: wallThick,
          hung: override.hung || d.hung || d.handing || hungVal,
          door_stop: override.stop || d.door_stop,
          internal_type: override.hfHo || d.internal_type,
          color: override.color || d.color,
          door_type: override.door_type || d.door_type || d.lockup_door_type || "",
          jamb_size: override.jambSize || d.jamb_size || d.jambSize || "",
        }], []);
        return {
          ...(built || {}),
          id: `lck-door-${d.id || Date.now()}-${idx}`,
          doorId: d.id,
          label: dLabel,
          door_name: dLabel,
          door_type_candidate: override.door_type || d.door_type || d.lockup_door_type || built?.door_type_candidate || "",
          jamb_size_candidate: override.jambSize || d.jamb_size || d.jambSize || built?.jamb_size_candidate || "",
          default_qty: override.qty || built?.default_qty || 1,
          autofill_source: "drawing",
        };
      };

      if (!lockupEntries || lockupEntries.length === 0) {
        setLockupEntries(targetDoors.map((d, idx) => buildEntry(d, idx)));
      } else {
        let changed = false;
        const existingEntries = [...lockupEntries].filter((entry) => !isWindowOpening(entry));
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
          const expectedModelCandidate = override.door_type || matchingDoor.door_type || matchingDoor.lockup_door_type || entry.door_type_candidate || "";
          const expectedMode = getLockupMode(matchingDoor, isExt, override);

          const isScopeDiff = entry.scope !== expectedScope || entry.location !== expectedLoc;
          const isModelDiff = String(entry.door_type_candidate || "") !== String(expectedModelCandidate || "");
          const isModeDiff = String(entry.mode || "").trim().toLowerCase() !== expectedMode.toLowerCase();

          if (isScopeDiff || isModelDiff || isModeDiff) {
            changed = true;
            return {
              ...entry,
              mode: expectedMode,
              lockup_mode: expectedMode,
              scope: expectedScope,
              location: expectedLoc,
              door_type: entry.door_type || "",
              door_type_candidate: expectedModelCandidate,
              thickness: expectedMode === "Loose" ? 38 : (isExt ? 40 : 35),
              jamb_size: expectedMode === "Loose" ? (entry.jamb_size || "") : "",
              jamb_size_candidate: expectedMode === "Loose" ? (entry.jamb_size_candidate || matchingDoor.jamb_size || matchingDoor.jambSize || "") : "",
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
  }, [activePaneTab, currentPage, doors, doorsByPageProp, customLockupOverrides, manuallyClearedTasks]);

  const [trussEntries, setTrussEntries] = React.useState([]);
  const [hardiesFireWallEntries, setHardiesFireWallEntries] = React.useState([]);
  const handleSetHardiesFireWallEntries = React.useCallback((actionOrEntries) => {
    setHardiesFireWallEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      queueTaskRowsToPlan("hardies_fire_walls", next);
      return next;
    });
  }, [queueTaskRowsToPlan]);

  const handleSetCladdingWallEntries = React.useCallback((actionOrEntries) => {
    setCladdingWallEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      queueTaskRowsToPlan("cladding", next);
      return next;
    });
  }, [queueTaskRowsToPlan]);

  const handleSetFixoutDoorEntries = React.useCallback((actionOrEntries) => {
    setFixoutDoorEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      const doorOnlyRows = (Array.isArray(next) ? next : []).filter((row) => !isWindowOpening(row));
      queueTaskRowsToPlan("fixout", doorOnlyRows);
      return doorOnlyRows;
    });
  }, [queueTaskRowsToPlan]);


  // Lockup/Fixout routing is deliberately EzeFloor-only metadata. The selected
  // destination moves the entered row between task states and, when linked to a
  // canvas door, stores procurement_task on that plan object. Neither task's DB
  // save payload contains this routing field.
  const handleMoveDoorTask = React.useCallback((sourceTask, row, requestedTarget) => {
    const source = normalizeDoorTaskId(sourceTask);
    const target = normalizeDoorTaskId(requestedTarget);
    if (!row || source === target) return;

    if (typeof pushTaskHistory === "function") pushTaskHistory(source);

    const linkedDoorId = doorRowLinkId(row);
    if (linkedDoorId !== null && linkedDoorId !== undefined && typeof setDoorsByPageCtx === "function") {
      setDoorsByPageCtx((prev) => {
        const base = prev && Object.keys(prev).length > 0 ? prev : (effectiveDoorsByPage || {});
        let changed = false;
        const next = { ...base };
        Object.entries(base).forEach(([pageKey, pageDoors]) => {
          let pageChanged = false;
          const mapped = (pageDoors || []).map((door) => {
            if (String(door?.id) !== String(linkedDoorId)) return door;
            pageChanged = true;
            changed = true;
            return {
              ...door,
              procurement_task: target,
              data_revision: Number(door?.data_revision || 0) + 1,
              updated_at: Date.now(),
            };
          });
          if (pageChanged) next[pageKey] = mapped;
        });
        return changed ? next : prev;
      });
    }

    if (source === "fixout") {
      const moved = fixoutRowToLockup(row);
      setFixoutDoorEntries((prev) => (prev || []).filter((candidate) => !sameDoorLink(candidate, row)));
      setLockupEntries((prev) => upsertDoorTaskRow(prev, moved));
    } else {
      const moved = lockupRowToFixout(row);
      setLockupEntries((prev) => (prev || []).filter((candidate) => !sameDoorLink(candidate, row)));
      setFixoutDoorEntries((prev) => upsertDoorTaskRow(prev, moved));
    }

    // Make the routing action visible immediately instead of making the row
    // appear to vanish from the current table.
    const targetPane = target === "lock_up" ? "lockup" : "fixout";
    setEnabledModuleIds((prev) => prev.includes(targetPane) ? prev : [...prev, targetPane]);
    setActivePaneTab(targetPane);
  }, [
    pushTaskHistory,
    setDoorsByPageCtx,
    effectiveDoorsByPage,
    setEnabledModuleIds,
    setActivePaneTab,
  ]);

  const handleSetShelvingEntries = React.useCallback((actionOrEntries) => {
    setShelvingEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      queueTaskRowsToPlan("shelving", next);
      return next;
    });
  }, [queueTaskRowsToPlan]);

  // Inline task-table edits participate in the same Ctrl+Z / Ctrl+Y history
  // as the drawing. The interaction controller asks synchronously for the
  // active task snapshot before a row is committed, then sends that snapshot
  // back here when Undo/Redo applies it. Raw setters are intentional: restoring
  // history must not immediately write the restored task rows back into the plan
  // a second time; the CAD snapshot is restored by the controller itself.
  const captureTaskHistoryState = React.useCallback((taskId) => {
    const id = String(taskId || "").trim().toLowerCase();
    const base = { version: 1, taskId: id };

    switch (id) {
      case "frame_hardware":
        return { ...base, entries: frameWallEntries, customWallOverrides };
      case "eaves_soffit":
        return { ...base, entries: eavesEntries };
      case "cladding":
        return { ...base, entries: claddingWallEntries };
      case "insulation":
        return {
          ...base,
          wallEntries: insulationWallEntries,
          areaEntries: insulationAreaEntries,
          customInsWallOverrides,
          customInsAreaOverrides,
        };
      case "flooring_decking":
        return { ...base, entries: flooringEntries, customRoomOverrides };
      case "hebel_flooring":
        return { ...base, entries: hebelFlooringEntries };
      case "timber_posts":
        return { ...base, entries: timberPostEntries };
      case "fixout":
      case "lockup":
      case "lock_up": {
        const doorTaskRoutes = Object.fromEntries(Object.entries(effectiveDoorsByPage || {}).map(([pageKey, pageDoors]) => [
          pageKey,
          Object.fromEntries((pageDoors || []).filter((door) => door?.id !== undefined && door?.id !== null).map((door) => [
            String(door.id),
            normalizeDoorProcurementTask(door?.procurement_task ?? door?.procurementTask ?? door?.task_route ?? door?.taskRoute),
          ])),
        ]));
        return {
          ...base,
          taskId: id === "fixout" ? "fixout" : "lock_up",
          fixoutEntries: fixoutDoorEntries,
          lockupEntries,
          customLockupOverrides,
          doorTaskRoutes,
        };
      }
      case "windows":
        return { ...base, entries: windowEntries };
      case "shelving":
        return { ...base, entries: shelvingEntries };
      case "fow_plumbing":
        return { ...base, entries: fowPlumbingEntries };
      case "power_truss_braces":
        return { ...base, entries: powerTrussEntries };
      case "hardies_fire_walls":
        return { ...base, entries: hardiesFireWallEntries };
      default:
        // Tasks without a parent-owned entered-row array still get a CAD
        // snapshot, but there is no local row state to serialize here.
        return base;
    }
  }, [
    frameWallEntries, customWallOverrides, eavesEntries, claddingWallEntries,
    insulationWallEntries, insulationAreaEntries, customInsWallOverrides, customInsAreaOverrides,
    flooringEntries, customRoomOverrides, hebelFlooringEntries, timberPostEntries,
    fixoutDoorEntries, lockupEntries, customLockupOverrides, effectiveDoorsByPage, windowEntries, shelvingEntries,
    fowPlumbingEntries, powerTrussEntries, hardiesFireWallEntries,
  ]);

  const restoreTaskHistoryState = React.useCallback((snapshot) => {
    if (!snapshot || typeof snapshot !== "object") return;
    const id = String(snapshot.taskId || "").trim().toLowerCase();

    switch (id) {
      case "frame_hardware":
        setFrameWallEntries(Array.isArray(snapshot.entries) ? snapshot.entries : []);
        setCustomWallOverrides(snapshot.customWallOverrides || {});
        break;
      case "eaves_soffit":
        setEavesEntries(Array.isArray(snapshot.entries) ? snapshot.entries : []);
        break;
      case "cladding":
        setCladdingWallEntries(Array.isArray(snapshot.entries) ? snapshot.entries : []);
        break;
      case "insulation":
        setInsulationWallEntries(Array.isArray(snapshot.wallEntries) ? snapshot.wallEntries : []);
        setInsulationAreaEntries(Array.isArray(snapshot.areaEntries) ? snapshot.areaEntries : []);
        setCustomInsWallOverrides(snapshot.customInsWallOverrides || {});
        setCustomInsAreaOverrides(snapshot.customInsAreaOverrides || {});
        break;
      case "flooring_decking":
        setFlooringEntries(Array.isArray(snapshot.entries) ? snapshot.entries : []);
        setCustomRoomOverrides(snapshot.customRoomOverrides || {});
        break;
      case "hebel_flooring":
        setHebelFlooringEntries(Array.isArray(snapshot.entries) ? snapshot.entries : []);
        break;
      case "timber_posts":
        setTimberPostEntries(Array.isArray(snapshot.entries) ? snapshot.entries : []);
        break;
      case "fixout":
      case "lockup":
      case "lock_up": {
        const restoredFixout = Array.isArray(snapshot.fixoutEntries)
          ? snapshot.fixoutEntries
          : (id === "fixout" && Array.isArray(snapshot.entries) ? snapshot.entries : []);
        const restoredLockup = Array.isArray(snapshot.lockupEntries)
          ? snapshot.lockupEntries
          : (id !== "fixout" && Array.isArray(snapshot.entries) ? snapshot.entries : []);
        setFixoutDoorEntries(restoredFixout);
        setLockupEntries(restoredLockup);
        setCustomLockupOverrides(snapshot.customLockupOverrides || {});

        if (snapshot.doorTaskRoutes && typeof setDoorsByPageCtx === "function") {
          setDoorsByPageCtx((prev) => {
            const base = prev && Object.keys(prev).length > 0 ? prev : (effectiveDoorsByPage || {});
            let changed = false;
            const next = { ...base };
            Object.entries(base).forEach(([pageKey, pageDoors]) => {
              const pageRoutes = snapshot.doorTaskRoutes?.[pageKey] || {};
              let pageChanged = false;
              const mapped = (pageDoors || []).map((door) => {
                if (door?.id === undefined || door?.id === null) return door;
                const hasRecordedRoute = Object.prototype.hasOwnProperty.call(pageRoutes, String(door.id));
                if (!hasRecordedRoute) return door;
                const route = normalizeDoorProcurementTask(pageRoutes[String(door.id)]);
                const current = normalizeDoorProcurementTask(door?.procurement_task ?? door?.procurementTask ?? door?.task_route ?? door?.taskRoute);
                if (route === current && !door?.procurementTask && !door?.task_route && !door?.taskRoute) return door;
                const updated = { ...door };
                if (route) updated.procurement_task = route;
                else delete updated.procurement_task;
                delete updated.procurementTask;
                delete updated.task_route;
                delete updated.taskRoute;
                pageChanged = true;
                changed = true;
                return updated;
              });
              if (pageChanged) next[pageKey] = mapped;
            });
            return changed ? next : prev;
          });
        }
        break;
      }
      case "windows":
        setWindowEntries(Array.isArray(snapshot.entries) ? snapshot.entries : []);
        break;
      case "shelving":
        setShelvingEntries(Array.isArray(snapshot.entries) ? snapshot.entries : []);
        break;
      case "fow_plumbing":
        setFowPlumbingEntries(Array.isArray(snapshot.entries) ? snapshot.entries : []);
        break;
      case "power_truss_braces":
        setPowerTrussEntries(Array.isArray(snapshot.entries) ? snapshot.entries : []);
        break;
      case "hardies_fire_walls":
        setHardiesFireWallEntries(Array.isArray(snapshot.entries) ? snapshot.entries : []);
        break;
      default:
        break;
    }
  }, [setDoorsByPageCtx, effectiveDoorsByPage]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleCaptureTaskHistory = (event) => {
      if (!event?.detail) return;
      event.detail.state = captureTaskHistoryState(event.detail.taskId);
    };
    const handleRestoreTaskHistory = (event) => {
      restoreTaskHistoryState(event?.detail?.state);
    };

    window.addEventListener("ezefloor:capture-task-history", handleCaptureTaskHistory);
    window.addEventListener("ezefloor:restore-task-history", handleRestoreTaskHistory);
    return () => {
      window.removeEventListener("ezefloor:capture-task-history", handleCaptureTaskHistory);
      window.removeEventListener("ezefloor:restore-task-history", handleRestoreTaskHistory);
    };
  }, [captureTaskHistoryState, restoreTaskHistoryState]);

  // Plan geometry is the source of truth. Every plan snapshot (including a
  // manual draw, delete, Ctrl+Z and Ctrl+Y) is reconciled into task rows. Raw
  // setters are used so a plan-originated refresh cannot bounce back into the
  // plan and create an update loop.
  const planDataRevision = React.useMemo(() => JSON.stringify({
    walls: Object.entries(effectiveWallsByPage || {}).map(([page, items]) => [page, (items || []).map((item) => [
      item?.id, item?.centerline, item?.class_name, item?.wall_type, item?.height_mm ?? item?.height,
      item?.is_lbw, item?.is_load_bearing, item?.lbw, item?.is_ext, item?.is_exterior,
      item?.fire_wall_system, item?.lining_spec,
    ])]),
    doors: Object.entries(effectiveDoorsByPage || {}).map(([page, items]) => [page, (items || []).map((item) => [
      item?.id, item?.points, item?.width_mm ?? item?.width, item?.height_mm ?? item?.height,
      item?.door_type, item?.scope, item?.location, item?.type, item?.class, item?.class_name,
      item?.renderClass, item?.doorTypeId, item?.is_window, item?.isWindow,
      item?.door_name, item?.doorName, item?.label, item?.category, item?.mode, item?.product,
      item?.procurement_task, item?.procurementTask, item?.task_route, item?.taskRoute,
    ])]),
    rooms: Object.entries(roomsByPageProp || {}).map(([page, items]) => [page, (items || []).map((item) => [
      item?.id, item?.polygon, item?.areaM2 ?? item?.area_m2 ?? item?.area, item?.type,
      item?.room_name ?? item?.name,
    ])]),
    scales: effectiveScalesByPage,
  }), [effectiveWallsByPage, effectiveDoorsByPage, roomsByPageProp, effectiveScalesByPage]);
  const previousPlanDataRevisionRef = React.useRef(null);

  React.useEffect(() => {
    const previousRevision = previousPlanDataRevisionRef.current;
    const planChanged = previousRevision !== null && previousRevision !== planDataRevision;
    previousPlanDataRevisionRef.current = planDataRevision;
    const fallbackScale = (realScale && realScale > 0) ? realScale : ((scaleValue && scaleValue > 0) ? scaleValue : 1);
    const planRoomsByPage = roomsByPageProp || {};

    const wallPages = {};
    Object.entries(effectiveWallsByPage || {}).forEach(([pageKey, pageWalls]) => {
      const pageIndex = Number(pageKey);
      const page = pages?.[pageIndex];
      const isFloorCeilingPage = Boolean(
        page?.isFloorCeilingWorkspace ||
        page?.source === "floor_ceiling_page" ||
        page?.source === "floor_ceiling_workspace" ||
        page?.category === "floor_ceiling"
      );
      wallPages[pageKey] = isFloorCeilingPage
        ? []
        : (pageWalls || []).filter((wall) => !wall?.isFloorCeilingOnly && !wall?.excludeFromOtherTasks);
    });

    const allDoors = Object.entries(effectiveDoorsByPage || {}).flatMap(([pageKey, pageDoors]) => {
      const pageIndex = Number(pageKey);
      return (pageDoors || []).map((door) => ({
        ...door,
        __sourcePageIndex: pageIndex,
        __floorLevel: resolveObjectFloorLevel(door, pages, pageIndex),
      }));
    });
    const allWallsForDoorRouting = Object.entries(wallPages).flatMap(([pageKey, pageWalls]) => {
      const pageIndex = Number(pageKey);
      return (pageWalls || []).map((wall) => ({ ...wall, __sourcePageIndex: pageIndex }));
    });
    const allRooms = Object.entries(planRoomsByPage).flatMap(([pageKey, pageRooms]) => {
      const pageIndex = Number(pageKey);
      return (pageRooms || []).map((room) => ({
        ...room,
        __sourcePageIndex: pageIndex,
        __floorLevel: resolveObjectFloorLevel(room, pages, pageIndex),
      }));
    });

    const insulationRows = [];
    const insulationAreaRows = [];
    const flooringRows = [];
    Object.entries(wallPages).forEach(([pageKey, pageWalls]) => {
      const pageIndex = Number(pageKey);
      const pageScale = Number(effectiveScalesByPage?.[pageIndex]) > 0 ? Number(effectiveScalesByPage[pageIndex]) : fallbackScale;
      buildInsulationRows(pageWalls || [], pageScale, floorLevelForPage(pageIndex)).forEach((row, index) => {
        insulationRows.push({ ...row, id: `ins-ai-${pageIndex}-${index}`, sourcePageIndex: pageIndex });
      });
    });
    Object.entries(planRoomsByPage).forEach(([pageKey, pageRooms]) => {
      const pageIndex = Number(pageKey);
      const pageScale = Number(effectiveScalesByPage?.[pageIndex]) > 0 ? Number(effectiveScalesByPage[pageIndex]) : fallbackScale;
      flooringRows.push(...buildFlooringRows(pageRooms || [], pageScale, floorLevelForPage(pageIndex)).map((row) => ({ ...row, sourcePageIndex: pageIndex })));
      // Floor/Ceiling insulation is intentionally not derived from room area.
      // The dedicated Floor & Ceiling workspace owns these rows.
    });

    const claddingRows = [];
    const hardiesRows = [];
    Object.entries(wallPages).forEach(([pageKey, pageWalls]) => {
      const pageIndex = Number(pageKey);
      const pageScale = Number(effectiveScalesByPage?.[pageIndex]) > 0 ? Number(effectiveScalesByPage[pageIndex]) : fallbackScale;
      (pageWalls || []).forEach((wall, index) => {
        const cls = String(getWallClass(wall) || "").toLowerCase();
        const lengthMm = wallLengthMm(wall, pageScale);
        const heightMm = Number(wall?.height_mm || wall?.height || 0);
        if ((cls === "exterior_wall" || cls === "ext") && lengthMm > 0) {
          const gross = heightMm > 0 ? (lengthMm / 1000) * (heightMm / 1000) : 0;
          claddingRows.push({
            id: `clad-ai-${wall?.id || `${pageIndex}-${index}`}`,
            wallId: wall?.id,
            wallIds: wall?.id ? [wall.id] : [],
            sourcePageIndex: pageIndex,
            floorLevel: floorLevelForPage(pageIndex),
            elevation: String(wall?.elevation || wall?.label || `Exterior wall ${index + 1}`),
            height: heightMm || "",
            length: lengthMm,
            openings: 0,
            waste: 0,
            grossArea: Number(gross.toFixed(2)),
            netArea: Number(gross.toFixed(2)),
            totalArea: Number(gross.toFixed(2)),
            product: "",
            autofill_source: "drawing",
          });
        }
        if ((wall?.is_fire_wall || wall?.fire_wall_system || wall?.lining_spec || wall?.fire_rating) && lengthMm > 0) {
          hardiesRows.push({
            id: `hardies-ai-${wall?.id || `${pageIndex}-${index}`}`,
            wallId: wall?.id,
            wallIds: wall?.id ? [wall.id] : [],
            sourcePageIndex: pageIndex,
            floorLevel: floorLevelForPage(pageIndex),
            location: wall?.location || wall?.label || `Wall ${index + 1}`,
            length: Number((lengthMm / 1000).toFixed(3)),
            height: Number((heightMm / 1000).toFixed(3)),
            systemType: wall?.fire_wall_system || "",
            liningSpec: wall?.lining_spec || "",
            fireRating: wall?.fire_rating || "",
            autofill_source: "drawing",
          });
        }
      });
    });

    const generatedByTask = {
      frame_hardware: buildFrameRows(wallPages, pages || [], effectiveScalesByPage || {}, fallbackScale),
      insulation: insulationRows,
      insulation_area: insulationAreaRows,
      flooring_decking: flooringRows,
      hebel_flooring: flooringRows,
      cladding: claddingRows,
      fixout: buildFixoutRows(allDoors, allWallsForDoorRouting),
      lock_up: buildLockupRows(allDoors, allWallsForDoorRouting),
      windows: buildWindowRows(allDoors),
      shelving: buildShelvingRows(allRooms),
      hardies_fire_walls: hardiesRows,
    };

    const reconcileRows = (taskId, setter, clearKey = taskId) => {
      const isManuallyCleared = Boolean(manuallyClearedTasksRef.current?.[clearKey]);
      if (isManuallyCleared && !planChanged) return;
      setter((previousRows) => {
        // Opening a task or changing the plan must not create task data by
        // itself. Database/manual rows stay untouched; only rows explicitly
        // created by Auto Fill continue following their linked plan objects.
        if (!Array.isArray(previousRows) || previousRows.length === 0) return previousRows;
        const hasPlanRows = previousRows.some((row) => {
          const source = String(row?.autofill_source || row?.source || "").toLowerCase();
          return source.includes("drawing") || source === "ai_generated";
        });
        if (!hasPlanRows) return previousRows;
        const legacyLinked = taskId === "insulation"
          ? linkLegacyInsulationRows(previousRows, generatedByTask[taskId])
          : previousRows;
        const reconciled = reconcileTaskRowsWithPlan(legacyLinked, generatedByTask[taskId]);
        return syncTaskRowsFromPlan({
          taskId,
          rows: reconciled,
          wallsByPage: wallPages,
          doorsByPage: effectiveDoorsByPage,
          roomsByPage: planRoomsByPage,
          scalesByPage: effectiveScalesByPage,
          fallbackScale,
        });
      });
    };

    reconcileRows("frame_hardware", setFrameWallEntries);
    reconcileRows("insulation", setInsulationWallEntries);
    // insulation_area is managed by Floor & Ceiling sync/manual entry, not by
    // generic plan reconciliation. This prevents a wall/door edit from wiping
    // valid Floor/Ceiling rows.
    reconcileRows("flooring_decking", setFlooringEntries);
    reconcileRows("hebel_flooring", setHebelFlooringEntries);
    reconcileRows("cladding", setCladdingWallEntries);
    reconcileRows("fixout", setFixoutDoorEntries);
    reconcileRows("lock_up", setLockupEntries);

    // Windows now belong to Fixout > Additional trim measurements > Reveals.
    // Keep this section live with plan window changes while preserving rows
    // entered manually by the user.
    if (!manuallyClearedTasksRef.current?.fixout || planChanged) {
      let excludedWindowIds = [];
      try {
        const parsed = moduleFormData?.fixout?.fixout_excluded_window_ids
          ? JSON.parse(moduleFormData.fixout.fixout_excluded_window_ids)
          : [];
        excludedWindowIds = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch (_) { }
      const excludedWindowIdSet = new Set(excludedWindowIds);
      const liveWindowRevealRows = generatedByTask.windows
        .filter((row) => !row?.doorId || !excludedWindowIdSet.has(String(row.doorId)))
        .map((row, index) => ({
          ...row,
          id: `window-reveal-${row.doorId || index}`,
          doorId: row.doorId || null,
          source: "window_autofill",
          autofill_source: "drawing",
          type: "window",
          label: row.label || `W-${index + 1}`,
          height: row.height || "",
          width: row.width || "",
          blockWork: "No",
          floorLevel: row.floorLevel || "GF",
        }));
      setModuleFormData((prev) => {
        const currentFixout = prev?.fixout || {};
        let currentRevealRows = [];
        try {
          const parsed = currentFixout.fixout_reveal_openings ? JSON.parse(currentFixout.fixout_reveal_openings) : [];
          currentRevealRows = Array.isArray(parsed) ? parsed : [];
        } catch (_) { }
        const hasPlanWindowRows = currentRevealRows.some((row) => row?.source === "window_autofill");
        if (!hasPlanWindowRows) return prev;
        const manualRevealRows = currentRevealRows.filter((row) => row?.source !== "window_autofill");
        const nextJson = JSON.stringify([...manualRevealRows, ...liveWindowRevealRows]);
        if (currentFixout.fixout_reveal_openings === nextJson) return prev;
        return {
          ...prev,
          fixout: {
            ...currentFixout,
            fixout_reveal_openings: nextJson,
          },
        };
      });
    }

    // Keep the internal derived list for summary/selection compatibility, but
    // there is no longer a standalone Window task tab.
    if (!manuallyClearedTasksRef.current?.windows || planChanged) {
      setWindowEntries((previousRows) => {
        const hasPlanWindowRows = (Array.isArray(previousRows) ? previousRows : [])
          .some((row) => row?.source === "window_autofill" || row?.autofill_source === "drawing");
        return hasPlanWindowRows ? generatedByTask.windows : previousRows;
      });
    }
    reconcileRows("shelving", setShelvingEntries);
    reconcileRows("hardies_fire_walls", setHardiesFireWallEntries);

    if (planChanged && Object.keys(manuallyClearedTasksRef.current || {}).length) {
      manuallyClearedTasksRef.current = {};
      setManuallyClearedTasks({});
    }
  }, [
    planDataRevision,
    effectiveWallsByPage,
    effectiveDoorsByPage,
    roomsByPageProp,
    effectiveScalesByPage,
    realScale,
    scaleValue,
    pages,
    floorLevelForPage,
    moduleFormData?.fixout?.fixout_excluded_window_ids,
  ]);
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
      interior_wall: { label: "Interior", color: "#facc15", walls: [] },
      exterior_wall: { label: "Exterior", color: "#ec4899", walls: [] },
      partition_wall: { label: "Partition", color: "#f97316", walls: [] },
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

      const rawPageLintels = lintelsByPage[currentPage] || [];
      const pageLintels = rawPageLintels.filter(l => {
        if (l.isActive !== undefined) return l.isActive !== false;
        return isLintelActive ? isLintelActive(l, pageWalls, doors) : true;
      });
      const mappedLintels = [];
      pageLintels.forEach(l => {
        const associatedDoor = (l.isAutoDoorLintel && l.doorId && doors && doors.length > 0)
          ? doors.find(d => String(d.id) === String(l.doorId))
          : null;
        const effL = associatedDoor
          ? syncLintelWithDoor(l, associatedDoor, pageWalls, realScale, scaleValue, (lintelController?.globalLengthOffset ?? l.lengthOffset))
          : l;

        if (effL.isActive === false) return;

        const cat = effL.category || 'lintel';
        const desc = cat === 'beam' ? 'Beam' : (cat === 'bh' ? 'BH' : 'Lintel');
        const numMeasured = typeof effL.measuredLength === 'number' ? effL.measuredLength : (effL.baseLength || 0);
        const finalLen = (effL.isRounded && effL.finalLength) ? effL.finalLength : roundLintelLength(numMeasured);
        mappedLintels.push({
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
        });
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

  // Auto Fill is only an initializer. Once a drawing-derived task row exists,
  // keep its aggregate fields live as the canonical plan changes.
  React.useEffect(() => {
    const measuredEaves = Number(cadMetrics?.perimeterM || 0);
    setEavesEntries((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const hasDrawingRow = list.some((row) => row?.id === "eaves-ai-measured" || String(row?.autofill_source || "").includes("drawing"));
      if (!hasDrawingRow) return prev;
      const next = list.flatMap((row) => {
        const isDrawing = row?.id === "eaves-ai-measured" || String(row?.autofill_source || "").includes("drawing");
        if (!isDrawing) return [row];
        if (!(measuredEaves > 0)) return [];
        if (Number(row?.length || 0) === Number(measuredEaves.toFixed(2))) return [row];
        return [{ ...row, length: Number(measuredEaves.toFixed(2)), autofill_source: "drawing" }];
      });
      return JSON.stringify(next) === JSON.stringify(list) ? prev : next;
    });

    const allRooms = roomsByPageProp && Object.keys(roomsByPageProp).length
      ? Object.values(roomsByPageProp).flat()
      : (rooms || []);
    const wetRooms = allRooms.filter((room) => /bath|ensuite|\bens\b|\bwc\b|toilet|powder|laundry|l['’]?dry|shower/i.test(String(room?.room_name || room?.name || room?.label || ""))).length;
    const doorPatch = buildFinalFitPatch(Object.values(effectiveDoorsByPage || {}).flat());
    const sheetArea = Number(cadMetrics?.grandTotalArea || 0);

    setModuleFormData((prev) => {
      const next = {
        ...prev,
        eaves_soffit: {
          ...(prev.eaves_soffit || {}),
          total_eave_length: measuredEaves > 0 ? String(measuredEaves.toFixed(2)) : "",
        },
        fow_plumbing: {
          ...(prev.fow_plumbing || {}),
          detected_wet_rooms: String(wetRooms),
        },
        final_fit: {
          ...(prev.final_fit || {}),
          ...doorPatch,
        },
        sheet_schedule: {
          ...(prev.sheet_schedule || {}),
          total_area: sheetArea > 0 ? sheetArea.toFixed(2) : "",
        },
      };
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [cadMetrics, effectiveDoorsByPage, roomsByPageProp, rooms]);


  const documentAiTaskContext = React.useMemo(() => ({
    frame_hardware: { mode: "rows", rows: frameWallEntries, form: moduleFormData.frame_hardware || {} },
    flooring_decking: { mode: "rows", rows: flooringEntries, form: moduleFormData.flooring_decking || {} },
    hebel_flooring: { mode: "rows", rows: hebelFlooringEntries, form: moduleFormData.hebel_flooring || {} },
    insulation: { mode: "rows", rows: [...(insulationWallEntries || []), ...(insulationAreaEntries || [])], form: moduleFormData.insulation || {} },
    eaves_soffit: { mode: "form", rows: eavesEntries, form: moduleFormData.eaves_soffit || {} },
    cladding: { mode: "rows", rows: claddingWallEntries, form: moduleFormData.cladding || {} },
    lock_up: { mode: "rows", rows: lockupEntries, form: moduleFormData.lock_up || {} },
    fixout: { mode: "rows", rows: fixoutDoorEntries, form: moduleFormData.fixout || {} },
    windows: { mode: "rows", rows: windowEntries, form: {} },
    shelving: { mode: "rows", rows: shelvingEntries, form: moduleFormData.shelving || {} },
    timber_posts: { mode: "rows", rows: timberPostEntries, form: moduleFormData.timber_posts || {} },
    power_truss_braces: { mode: "rows", rows: powerTrussEntries, form: moduleFormData.power_truss_braces || {} },
    fow_plumbing: { mode: "rows", rows: fowPlumbingEntries, form: moduleFormData.fow_plumbing || {} },
    final_fit: { mode: "form", rows: [], form: moduleFormData.final_fit || {} },
    hardies_fire_walls: { mode: "rows", rows: hardiesFireWallEntries, form: moduleFormData.hardies_fire_walls || {} },
  }), [
    frameWallEntries, flooringEntries, hebelFlooringEntries, insulationWallEntries, insulationAreaEntries,
    eavesEntries, claddingWallEntries, lockupEntries, fixoutDoorEntries, windowEntries, shelvingEntries,
    timberPostEntries, powerTrussEntries, fowPlumbingEntries, hardiesFireWallEntries, moduleFormData
  ]);

  const handleDocumentAiResult = React.useCallback((result) => {
    setGptReport(result);
    setShowDocumentAi(false);
    setShowGptReport(true);
    const nextRows = {};
    const nextForms = {};
    for (const task of result?.task_results || []) {
      if (task.mode === "rows") {
        nextRows[task.task_key] = (task.rows || []).map((row, index) => {
          const action = String(row?.action || "ADD").toUpperCase();
          const targetRowId = row?.row_id ?? row?.target_row_id ?? null;
          return {
            ...row,
            id: action === "ADD"
              ? (row.id || `gpt-${task.task_key}-${Date.now()}-${index}`)
              : (row.id || `gpt-proposal-${task.task_key}-${Date.now()}-${index}`),
            generatedByAI: true,
            ai_generated: true,
            generated_by: "gpt",
            source: "gpt_document_ai",
            _gptAction: action,
            _gptTargetRowId: targetRowId,
            _gptSourcePage: row?.source_page ?? null,
            _gptReason: row?.reason || "",
            _gptConfidence: Number(row?.confidence ?? task.confidence ?? 0) || 0,
          };
        });
      } else if ((task.field_updates || []).length) {
        // Stage single-form updates for review. Do not interrupt the report flow
        // with confirm dialogs or overwrite form data before the user reviews it.
        nextForms[task.task_key] = task.field_updates;
      }
    }
    setGptTaskRows(nextRows);
    setGptFormProposals(nextForms);
  }, []);

  const requestMountedTaskSave = React.useCallback((taskKey) => {
    if (typeof window === "undefined") return;
    const requestId = `gpt-save-${taskKey}-${Date.now()}`;
    // Give React time to commit the GPT rows/form value before the task's normal
    // Save handler reads its current state. Two RAFs also avoid stale closures.
    const dispatchSave = () => window.dispatchEvent(new CustomEvent("ezefloor:gpt-save-task", {
      detail: { requestId, taskKey, handled: false, source: "gpt" },
    }));
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(dispatchSave));
    } else {
      setTimeout(dispatchSave, 0);
    }
  }, []);

  const commitGptRowsToTask = React.useCallback((taskKey) => {
    const proposals = gptTaskRows?.[taskKey] || [];
    if (!proposals.length) return;

    const cleanProposal = (row) => {
      const next = { ...row };
      [
        "action", "row_id", "target_row_id", "source_page", "source_text", "confidence", "reason",
        "_gptAction", "_gptTargetRowId", "_gptSourcePage", "_gptReason", "_gptConfidence",
      ].forEach((key) => delete next[key]);
      return next;
    };

    const applyProposals = (setter) => setter((previous) => {
      let rows = [...(previous || [])];
      for (const proposal of proposals) {
        const action = String(proposal?._gptAction || proposal?.action || "ADD").toUpperCase();
        const targetId = proposal?._gptTargetRowId ?? proposal?.row_id ?? null;
        if (action === "KEEP" || action === "UNKNOWN") continue;

        if (action === "UPDATE") {
          const index = rows.findIndex((row) => String(row?.id ?? "") === String(targetId ?? ""));
          if (index < 0) continue;
          rows[index] = {
            ...rows[index],
            ...cleanProposal(proposal),
            id: rows[index]?.id,
            generatedByAI: true,
            ai_generated: true,
            generated_by: "gpt",
            source: "gpt_document_ai",
          };
          continue;
        }

        if (action === "DELETE") {
          const ok = typeof window === "undefined" || window.confirm(
            `GPT proposes deleting row ${targetId || ""} from ${taskKey}. Continue?`
          );
          if (ok && targetId != null) {
            rows = rows.filter((row) => String(row?.id ?? "") !== String(targetId));
          }
          continue;
        }

        const candidate = cleanProposal(proposal);
        const candidateId = String(candidate?.id ?? "");
        const alreadyExists = candidateId && rows.some((row) => String(row?.id ?? "") === candidateId);
        if (!alreadyExists) rows.push(candidate);
      }
      return rows;
    });

    if (taskKey === "frame_hardware") applyProposals(setFrameWallEntries);
    else if (taskKey === "flooring_decking") applyProposals(setFlooringEntries);
    else if (taskKey === "hebel_flooring") applyProposals(setHebelFlooringEntries);
    else if (taskKey === "cladding") applyProposals(setCladdingWallEntries);
    else if (taskKey === "lock_up") applyProposals(setLockupEntries);
    else if (taskKey === "fixout") applyProposals(setFixoutDoorEntries);
    else if (taskKey === "windows") applyProposals(setWindowEntries);
    else if (taskKey === "shelving") applyProposals(setShelvingEntries);
    else if (taskKey === "timber_posts") applyProposals(setTimberPostEntries);
    else if (taskKey === "power_truss_braces") applyProposals(setPowerTrussEntries);
    else if (taskKey === "fow_plumbing") applyProposals(setFowPlumbingEntries);
    else if (taskKey === "hardies_fire_walls") applyProposals(setHardiesFireWallEntries);
    else if (taskKey === "insulation") applyProposals(setInsulationAreaEntries);
    else return;

    setGptTaskRows((prev) => ({ ...prev, [taskKey]: [] }));
    requestMountedTaskSave(taskKey);
  }, [gptTaskRows, requestMountedTaskSave]);

  const clearNonGptTaskData = React.useCallback((taskKey) => {
    const confirmed = typeof window === "undefined" || window.confirm(
      `Clear all non-GPT rows from ${taskKey}? This only changes the current form state until you explicitly save the task.`
    );
    if (!confirmed) return;
    const keepAi = (rows) => (rows || []).filter((row) => row?.generatedByAI || row?.ai_generated || row?.generated_by === "gpt" || String(row?.source || "").startsWith("gpt_"));
    if (taskKey === "frame_hardware") setFrameWallEntries(keepAi);
    else if (taskKey === "flooring_decking") setFlooringEntries(keepAi);
    else if (taskKey === "hebel_flooring") setHebelFlooringEntries(keepAi);
    else if (taskKey === "cladding") setCladdingWallEntries(keepAi);
    else if (taskKey === "lock_up") setLockupEntries(keepAi);
    else if (taskKey === "fixout") setFixoutDoorEntries(keepAi);
    else if (taskKey === "windows") setWindowEntries(keepAi);
    else if (taskKey === "shelving") setShelvingEntries(keepAi);
    else if (taskKey === "timber_posts") setTimberPostEntries(keepAi);
    else if (taskKey === "power_truss_braces") setPowerTrussEntries(keepAi);
    else if (taskKey === "fow_plumbing") setFowPlumbingEntries(keepAi);
    else if (taskKey === "hardies_fire_walls") setHardiesFireWallEntries(keepAi);
    else if (taskKey === "insulation") {
      setInsulationWallEntries(keepAi);
      setInsulationAreaEntries(keepAi);
    }
  }, []);

  const applyGptFormProposal = React.useCallback((taskKey, proposalIndex, useGptValue) => {
    const proposals = gptFormProposals?.[taskKey] || [];
    const proposal = proposals[proposalIndex];
    if (!proposal) return;

    if (useGptValue && proposal.field) {
      const fieldPath = String(proposal.field).split(".").filter(Boolean);
      if (fieldPath.length) {
        setModuleFormData((prev) => {
          const next = { ...prev };
          const taskForm = { ...(next[taskKey] || {}) };
          let cursor = taskForm;
          for (let i = 0; i < fieldPath.length - 1; i += 1) {
            const part = fieldPath[i];
            cursor[part] = { ...(cursor[part] || {}) };
            cursor = cursor[part];
          }
          cursor[fieldPath[fieldPath.length - 1]] = proposal.new_value;
          next[taskKey] = taskForm;
          return next;
        });
      }
    }

    setGptFormProposals((prev) => ({
      ...prev,
      [taskKey]: (prev?.[taskKey] || []).filter((_, idx) => idx !== proposalIndex),
    }));

    // Single-form tasks only save after the user explicitly accepts GPT.
    if (useGptValue && taskKey !== "final_fit") requestMountedTaskSave(taskKey);
  }, [gptFormProposals, requestMountedTaskSave]);

  const openGptTask = React.useCallback((taskKey) => {
    const normalized = ({
      lockup: "lock_up",
      eaves: "eaves_soffit",
      power_truss: "power_truss_braces",
      flooring: "flooring_decking",
      frame: "frame_hardware",
    })[taskKey] || taskKey;

    const targetTab = normalized === "flooring_decking"
      ? flooringTaskId(flooringTaskFloors[0] || "GF")
      : normalized;

    setEnabledModuleIds((prev) => {
      const baseId = normalized;
      return prev.includes(baseId) ? prev : [...prev, baseId];
    });
    setShowGptReport(false);
    setActivePaneTab(targetTab);
  }, [flooringTaskFloors]);

  const reviewFirstGptResult = React.useCallback(() => {
    const firstTask = (gptReport?.task_results || []).find((task) => {
      if (task?.mode === "rows") return (task?.rows || []).length > 0;
      return (task?.field_updates || []).length > 0;
    });
    if (!firstTask) {
      setShowGptReport(false);
      return;
    }
    openGptTask(firstTask.task_key);
  }, [gptReport, openGptTask]);

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
          title={isTaskExpanded ? "Collapse task panel (»)" : "Expand task panel («)"}
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
          title="Drag and drop to change the width of the Task frame"
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
          gptTaskRows={gptTaskRows}
          gptFormProposals={gptFormProposals}
          onSaveGptRows={commitGptRowsToTask}
          onApplyGptFormProposal={applyGptFormProposal}
          onClearNonGpt={clearNonGptTaskData}
          aiGeneratedSuccess={aiGeneratedSuccess}
          handleResetModuleData={handleResetModuleData}
          setActivePaneTab={setActivePaneTab}
          handleModuleFormChange={handleModuleFormChange}
          handleAddDataAI={handleAddDataAI}
          handleSelectEntry={handleSelectEntry}
          manuallyClearedTasks={manuallyClearedTasks}
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
          WindowTask={WindowTask}
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
          setCladdingWallEntries={handleSetCladdingWallEntries}
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
          setFixoutDoorEntries={handleSetFixoutDoorEntries}
          shelvingEntries={shelvingEntries}
          setShelvingEntries={handleSetShelvingEntries}
          fowPlumbingEntries={fowPlumbingEntries}
          setFowPlumbingEntries={setFowPlumbingEntries}
          powerTrussEntries={powerTrussEntries}
          setPowerTrussEntries={setPowerTrussEntries}
          lockupEntries={lockupEntries}
          handleSetLockupEntries={handleSetLockupEntries}
          windowEntries={windowEntries}
          setWindowEntries={setWindowEntries}
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
          onMoveDoorTask={handleMoveDoorTask}
          pushTaskHistory={pushTaskHistory}
          taskFloorLevel={activeModuleTab?.floorLevel || "GF"}
        />
      )}

      {/* ── RIGHT VERTICAL TAB BAR ── */}
      <RightPropertyTabBar
        activePaneTab={activePaneTab}
        setActivePaneTab={setActivePaneTab}
        isHwOrAllUser={isHwOrAllUser}
        taskListJobs={taskListJobs}
        EXTRA_MODULE_TABS={EXTRA_MODULE_TABS}
        taskModuleTabs={taskModuleTabs}
        enabledModuleIds={enabledModuleIds}
        showAddModulePopup={showAddModulePopup}
        setShowAddModulePopup={setShowAddModulePopup}
        addModulePopupRef={addModulePopupRef}
        setEnabledModuleIds={setEnabledModuleIds}
        onModuleIdsChange={persistEnabledModules}
        selectedCustomerClient={selectedCustomerClient}
        customerModuleTabs={customerModuleTabs}
        customerModuleIds={customerModuleIds}
        flooringTaskFloors={flooringTaskFloors}
        onFlooringTaskFloorsChange={persistFlooringTaskFloors}
        showGptFeature={isGptAdmin}
        onOpenDocumentAi={() => {
          if (isGptAdmin) setShowDocumentAi(true);
        }}
      />

      {/* ── TAKEOFF EXPORT PROPERTIES MODAL ── */}
      {isGptAdmin && (
        <>
          <DocumentAiReviewModal
            open={showDocumentAi}
            onClose={() => setShowDocumentAi(false)}
            pdfFile={currentPdfFile}
            planPages={pages}
            customer={selectedCustomerClient}
            taskContext={documentAiTaskContext}
            onResult={handleDocumentAiResult}
          />

          <DocumentAiReportModal
            open={showGptReport}
            result={gptReport}
            onClose={() => setShowGptReport(false)}
            onOpenTask={openGptTask}
            onReviewResults={reviewFirstGptResult}
          />
        </>
      )}

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
