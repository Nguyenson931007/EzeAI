import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { polygonAreaM2 as polygonAreaM2Util, getWallClass, getBaseWallId, calcDoorWindowMetrics, getWallSideOffsets, mirrorPolygonAcrossLine, mirrorPolygonAcrossPerpendicular, mapFloorName, convertNameToClass } from "@/utils/geometry";
import { useAppModel } from "@/models/app.context";
import { useDialog } from "@/components/DialogContext";
import { ApiService, BASE_URL } from "@/models/api.service";
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
import { roundLintelLength } from "@/controllers/lintel.controller";

/* ================================================================
   SVG DASHBOARD ICONS
   ================================================================ */
const HomeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const ExternalIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <line x1="9" y1="22" x2="9" y2="16" />
    <line x1="15" y1="22" x2="15" y2="16" />
    <line x1="9" y1="16" x2="15" y2="16" />
  </svg>
);

const PolygonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M5 3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5z" strokeDasharray="3 3" />
    <path d="M19 14a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-3z" strokeDasharray="3 3" />
    <path d="M3 14a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" strokeDasharray="3 3" />
    <path d="M19 3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3z" strokeDasharray="3 3" />
    <line x1="8" y1="5" x2="16" y2="5" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="16" y1="19" x2="8" y2="19" />
    <line x1="5" y1="14" x2="5" y2="8" />
  </svg>
);

const WasteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);

const GrandTotalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const InfoIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "6px" }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const AreaSummaryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "6px" }}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

/* ================================================================
   REUSABLE DESIGN SYSTEM COMPONENTS
   Inspired by: Vercel, Linear, Stripe, Figma Inspect Panel
   ================================================================ */

/* — Section Header: small uppercase label for grouping — */
function SectionHeader({ children }) {
  return <div className="rp-section-header">{children}</div>;
}

/* — Accordion Header for Grouping — */
function CollapsibleSection({ title, isExpanded, onToggle, children, totalCount }) {
  return (
    <div className="rp-accordion">
      <div className="rp-accordion-header" onClick={onToggle}>
        <span className="rp-accordion-header__title">{title}</span>
        {totalCount !== undefined && totalCount > 0 && (
          <span className="rp-accordion-header__badge">{totalCount}</span>
        )}
        <span className="rp-accordion-header__arrow">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </div>
      <div
        className="rp-accordion-body"
        style={{
          maxHeight: isExpanded ? "2500px" : "0px",
          overflow: "hidden",
          transition: "max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="rp-accordion-content">{children}</div>
      </div>
    </div>
  );
}

/* — Section Subheader Row — */
function SubheadingRow({ title, icon, value, onChange }) {
  return (
    <div className="rp-subheading-row">
      <div className="rp-subheading-title">
        {icon}
        <span>{title}</span>
      </div>
      <div className="rp-waste-badge">
        <span className="rp-waste-badge__label">Waste</span>
        <select
          className="rp-select-noborder"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {[0, 5, 10, 15, 20, 25].map((v) => (
            <option key={v} value={v}>{v}%</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* — KPI Card: large number + small label, compact stat display — */
function KPICard({ value, label, unit = "", color, small = false }) {
  return (
    <div className={`rp-kpi${small ? " rp-kpi--sm" : ""}`}>
      <div className="rp-kpi__value" style={color ? { color } : undefined}>
        {value}
        {unit && <span className="rp-kpi__unit">{unit}</span>}
      </div>
      <div className="rp-kpi__label">{label}</div>
    </div>
  );
}

/* — Area Summary Card — */
function AreaCard({ label, value, dotColor, ratio = 0, parentLabel = "", onClick, isActive }) {
  return (
    <div className={`rp-area-card${isActive ? " rp-area-card--active" : ""}`} onClick={onClick}>
      <div className="rp-area-card__top">
        <div className="rp-area-card__left">
          <span className="rp-area-card__dot" style={{ background: dotColor }} />
          <div className="rp-area-card__label-container">
            <span className="rp-area-card__label">{label}</span>
            <span className="rp-area-card__sublabel">
              {(ratio * 100).toFixed(1)}% of {parentLabel}
            </span>
          </div>
        </div>
        <span className="rp-area-card__value">{value}</span>
      </div>
      <div className="rp-area-card__bar-row">
        <div className="rp-area-card__bar-wrapper">
          <div
            className="rp-area-card__bar-fill"
            style={{ width: `${Math.min(ratio * 100, 100)}%`, background: dotColor }}
          />
        </div>
        <span className="rp-area-card__percent" style={{ color: dotColor }}>
          {(ratio * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/* — KPI Row: flex container for 2-3 KPI cards side by side — */
function KPIRow({ children }) {
  return <div className="rp-kpi-row">{children}</div>;
}

/* — Stat Row: label ... value inline — */
function StatRow({ label, value, color, bold = false }) {
  return (
    <div className="rp-stat-row">
      <span className="rp-stat-row__label">{label}</span>
      <span
        className="rp-stat-row__value"
        style={{
          ...(color ? { color } : {}),
          ...(bold ? { fontWeight: 700, fontSize: 13 } : {}),
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* — Mini Bar: thin horizontal progress bar — */
function MiniBar({ ratio = 0, color = "#3b82f6" }) {
  return (
    <div className="rp-mini-bar">
      <div
        className="rp-mini-bar__fill"
        style={{ width: `${Math.min(ratio * 100, 100)}%`, background: color }}
      />
    </div>
  );
}

/* — Summary Card: elevated container for totals — */
function SummaryCard({ children, accent = "neutral" }) {
  const accents = {
    green: { bg: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.15)" },
    amber: { bg: "rgba(251,191,36,0.06)", border: "rgba(251,191,36,0.15)" },
    blue: { bg: "rgba(59,130,246,0.06)", border: "rgba(59,130,246,0.15)" },
    neutral: { bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.06)" },
  };
  const a = accents[accent] || accents.neutral;
  return (
    <div
      className="rp-summary-card"
      style={{ background: a.bg, borderColor: a.border }}
    >
      {children}
    </div>
  );
}

/* — Export Button — */
function ExportButton({ onClick, disabled = false, children }) {
  return (
    <button
      className={`rp-export-btn${disabled ? " rp-export-btn--disabled" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Set scale first to export" : ""}
    >
      {children}
    </button>
  );
}

/* — Reusable Smart Pitch Input Component — */
function PitchInput({ value, onChange, style, className }) {
  const [tempVal, setTempVal] = React.useState(null);
  const displayValue = tempVal !== null ? tempVal : (value === 0 ? "0" : (value ?? "0"));

  const handleChange = (e) => {
    let raw = e.target.value;
    raw = raw.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) {
      raw = parts[0] + '.' + parts.slice(1).join('');
    }
    if (/^0[0-9]/.test(raw)) {
      raw = raw.replace(/^0+/, '');
    }

    setTempVal(raw);

    if (raw === "" || raw === ".") {
      onChange(0);
    } else {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        const clamped = Math.max(0, Math.min(90, parsed));
        onChange(clamped);
      }
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onFocus={(e) => e.target.select()}
      onBlur={() => setTempVal(null)}
      onChange={handleChange}
      onClick={(e) => e.stopPropagation()}
      className={`no-spinner ${className || ''}`}
      style={{
        width: '50px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '4px',
        color: '#ffffff',
        textAlign: 'center',
        fontWeight: 700,
        fontSize: '12px',
        padding: '2px',
        outline: 'none',
        ...style
      }}
    />
  );
}

export function getDoorWindowDisplayWidthMm(d, realScale, scaleValue) {
  if (!d) return 1200;

  const isSliding = d.class === "sliding_door" || d.class === "double_sliding_door" || d.type === "sliding" || (d.doorTypeId && d.doorTypeId.includes("sliding"));
  const isWin = (d.class === 'window' || d.type === 'window' || d.is_window || (d.doorTypeId && d.doorTypeId.startsWith('win_')) || (d.door_name && d.door_name.startsWith('W-')) || (d.doorName && d.doorName.startsWith('W-'))) && !isSliding;

  const effScale = (typeof realScale === 'number' && realScale > 0 && realScale !== 1.0)
    ? realScale
    : ((typeof scaleValue === 'number' && scaleValue > 0) ? (scaleValue > 1 ? scaleValue : scaleValue * 1000) : 18.0);

  let displayWidthMm = null;

  // 1. Calculate from geometry (points / polygon / mask_polygon)
  if (d.points && d.points.length >= 2) {
    const p1 = Array.isArray(d.points[0]) ? { x: d.points[0][0], y: d.points[0][1] } : d.points[0];
    const p2 = Array.isArray(d.points[1]) ? { x: d.points[1][0], y: d.points[1][1] } : d.points[1];
    const lenPx = Math.hypot((p2.x || 0) - (p1.x || 0), (p2.y || 0) - (p1.y || 0));
    if (lenPx > 0) {
      displayWidthMm = Math.round(lenPx * effScale);
    }
  } else if (d.polygon || d.mask_polygon) {
    const poly = d.polygon || d.mask_polygon;
    const xs = poly.map(p => Array.isArray(p) ? p[0] : (p ? p.x : undefined)).filter(x => x !== undefined && !isNaN(x));
    const ys = poly.map(p => Array.isArray(p) ? p[1] : (p ? p.y : undefined)).filter(y => y !== undefined && !isNaN(y));
    if (xs.length >= 2 && ys.length >= 2) {
      const lenPx = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (lenPx > 0) {
        displayWidthMm = Math.round(lenPx * effScale);
      }
    }
  }

  // 2. Fallback to d.width_mm or defaults
  if (!displayWidthMm || displayWidthMm <= 0) {
    if (d.width_mm && d.width_mm > 0) {
      displayWidthMm = d.width_mm;
    } else {
      displayWidthMm = isWin ? 1200 : 760;
    }
  }

  // 3. Smart Architectural Dimension Snapping (FOR WINDOWS, identical to AIDoor.jsx)
  if (isWin && displayWidthMm) {
    const STANDARD_DIMENSIONS = [600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3600, 4200, 4800];
    for (const stdW of STANDARD_DIMENSIONS) {
      const snapTol = Math.max(120, stdW * 0.10);
      if (Math.abs(displayWidthMm - stdW) <= snapTol) {
        displayWidthMm = stdW;
        break;
      }
    }
  }

  if (d.width_source === "manual" && d.width_mm) {
    return d.width_mm;
  }

  return displayWidthMm;
}

/* ================================================================
   MAIN PANEL
   ================================================================ */
export default function RightPropertyPaneView({
  selectedRoom, selectedWall, selectedDoor, selectedType, selectedPointIndex, updateRoom, updateDoor, deleteDoor, scaleValue, realScale, rooms,
  highlightType, setHighlightType,
  selectedWallIds = [], setSelectedWallIds, setSelectedType, setSelectedId, updateWallsProperty, deleteWalls, interactionMode, setInteractionMode, pxToMm,
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
  applyDefaultSettingsToAll,
  updateRoofType,
  updateRoofEdgeAngle,
  updateRoofEdgeOverhang,
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
  pages = [],
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
  layerVisibility: layerVisibilityProp,
  setLayerVisibility: setLayerVisibilityProp,
  selectWall,
  onEditDoor
}) {
  const [defaultPitchInput, setDefaultPitchInput] = useState(22.5);
  const [defaultOverhangInput, setDefaultOverhangInput] = useState(0);
  const { showConfirm, showPrompt } = useDialog();
  const {
    wasteByPage, setWasteByPage,
    roofsByPage, setRoofsByPage,
    currentPage,
    currentProjectName, setCurrentProjectName,
    currentJobId, setCurrentJobId,
    setActiveTab,
    user,
    lintelsByPage,
    setShowFrameworkModal,
    setShowAreaSummaryModal,
    setShowInsulationModal,
    showLockoutModal,
    setShowLockoutModal
  } = useAppModel();

  // ── PANE TAB STATE ("explorer" | "summary" | "job_task") ──
  const [activePaneTab, setActivePaneTab] = React.useState("explorer");
  const [explorerViewMode, setExplorerViewMode] = React.useState("tree"); // "tree" | "properties"
  const [explorerSearch, setExplorerSearch] = React.useState("");
  const [showCustomThickness, setShowCustomThickness] = React.useState(false);
  const [showCustomHeight, setShowCustomHeight] = React.useState(false);
  const [expandedNodes, setExpandedNodes] = React.useState(() => new Set([
    "root",
    "floor_0"
  ]));

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
      setTaskError(err.message || "Không thể tải danh sách Task Groups HW");
      setTaskListJobs([]);
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

    // Lưu thông tin pendingEmsJob vào sessionStorage và localStorage để đồng bộ SQL
    sessionStorage.setItem("pendingEmsJob", JSON.stringify(task));
    localStorage.setItem("pendingEmsJob", JSON.stringify(task));

    // 1. Nếu Job đã có dữ liệu bản vẽ đã lưu trong hệ thống EzeFloor
    let loadedSuccess = false;
    if (task.has_local_job && task.local_job?.id) {
      try {
        setLoadingJobId(task.hw_id);
        const res = await ApiService.getJobData(task.local_job.id);
        if (res && res.status === "success" && res.data) {
          const parsed = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
          if (onLoadJob) {
            onLoadJob(parsed, task.local_job.project_name || targetName, task.local_job.id);
          }
          if (setActiveTab) setActiveTab("Home");
          loadedSuccess = true;
        }
      } catch (err) {
        console.warn("Could not load local job data, falling back to new project:", err);
      } finally {
        setLoadingJobId(null);
      }
    }

    if (!loadedSuccess) {
      // 2. Nếu chưa có bản vẽ hoặc không tìm thấy: Đặt tên dự án theo job_number, chuyển tab Home và kích hoạt mở file picker
      if (setCurrentProjectName) setCurrentProjectName(targetName);
      if (setCurrentJobId) setCurrentJobId(null);
      if (setActiveTab) setActiveTab("Home");

      // Tự động kích hoạt chọn bản vẽ PDF / Ảnh để người dùng bắt đầu vẽ ngay
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
        const cat = l.category || 'lintel';
        const desc = cat === 'beam' ? 'Beam' : (cat === 'bh' ? 'BH' : 'Lintel');
        const numMeasured = typeof l.measuredLength === 'number' ? l.measuredLength : (l.baseLength || 0);
        const finalLen = (l.isRounded && l.finalLength) ? l.finalLength : roundLintelLength(numMeasured);
        return {
          id: String(l.id),
          wall_id: String(l.wallId),
          start_offset: l.startOffset,
          end_offset: l.endOffset,
          measured_length: numMeasured,
          final_length: finalLen,
          catalog_id: l.catalogId,
          type: l.type || "LVL",
          size: l.size || 90,
          width: l.width || 35,
          height: l.height || 90,
          description: desc,
          ply: l.ply || 1,
          category: cat,
          lengthOffset: l.lengthOffset || 0
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

  return (
    <div className="cad-panel" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ── TOP MENU BAR: Explorer / Summary / Task HW ── */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-panel)",
        padding: "6px 8px",
        gap: "6px",
        position: "sticky",
        top: 0,
        zIndex: 30,
        flexShrink: 0
      }}>
        <button
          onClick={() => {
            setActivePaneTab("explorer");
          }}
          style={{
            flex: 1,
            padding: "6px 6px",
            fontSize: "11px",
            fontWeight: activePaneTab === "explorer" ? 700 : 500,
            color: activePaneTab === "explorer" ? "#ffffff" : "var(--text-dim)",
            background: activePaneTab === "explorer" ? "var(--blue)" : "transparent",
            border: activePaneTab === "explorer" ? "1px solid var(--blue)" : "1px solid transparent",
            borderRadius: "6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            boxShadow: activePaneTab === "explorer" ? "0 2px 5px rgba(37,99,235,0.25)" : "none",
            transition: "all 0.15s ease"
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
          Properties
        </button>

        <button
          onClick={() => setActivePaneTab("summary")}
          style={{
            flex: 1,
            padding: "6px 6px",
            fontSize: "11px",
            fontWeight: activePaneTab === "summary" ? 700 : 500,
            color: activePaneTab === "summary" ? "#ffffff" : "var(--text-dim)",
            background: activePaneTab === "summary" ? "var(--blue)" : "transparent",
            border: activePaneTab === "summary" ? "1px solid var(--blue)" : "1px solid transparent",
            borderRadius: "6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            boxShadow: activePaneTab === "summary" ? "0 2px 5px rgba(37,99,235,0.25)" : "none",
            transition: "all 0.15s ease"
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          Summary
        </button>

        <button
          onClick={() => setActivePaneTab("job_task")}
          style={{
            flex: 1,
            padding: "6px 4px",
            fontSize: "11px",
            fontWeight: activePaneTab === "job_task" ? 700 : 500,
            color: activePaneTab === "job_task" ? "#ffffff" : "var(--text-dim)",
            background: activePaneTab === "job_task" ? "var(--blue)" : "transparent",
            border: activePaneTab === "job_task" ? "1px solid var(--blue)" : "1px solid transparent",
            borderRadius: "6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "3px",
            boxShadow: activePaneTab === "job_task" ? "0 2px 5px rgba(37,99,235,0.25)" : "none",
            transition: "all 0.15s ease"
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          Task HW
          {taskListJobs.filter(t => t.has_local_job).length > 0 && (
            <span style={{
              background: "#10b981",
              color: "#fff",
              fontSize: "9px",
              padding: "1px 4px",
              borderRadius: "8px",
              fontWeight: 800
            }}>
              {taskListJobs.filter(t => t.has_local_job).length}
            </span>
          )}
        </button>
      </div>

      {activePaneTab === "explorer" && explorerViewMode === "tree" ? (
        /* ══════════════════════════════════════════════════════
           TAB: EXPLORER / LAYERS TREE VIEW
           ══════════════════════════════════════════════════════ */
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto", flex: 1 }}>
          {/* Project Title & Status Bar */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--blue)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              PROJECT: {currentProjectName || "Modern House"}
            </div>
          </div>

          {/* Search Box */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="🔍 Search (e.g. Wall #100, Living, Door...)"
              value={explorerSearch}
              onChange={(e) => setExplorerSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 24px 7px 9px",
                background: "#ffffff",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--text)",
                fontSize: "12px",
                outline: "none",
                boxSizing: "border-box",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
              }}
            />
            {explorerSearch && (
              <button
                onClick={() => setExplorerSearch("")}
                style={{
                  position: "absolute",
                  right: "6px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "12px"
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Tree Action Controls */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-dim)", padding: "0 2px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={expandAllNodes}
                style={{ background: "none", border: "none", color: "var(--blue)", cursor: "pointer", padding: 0, fontSize: "11px", fontWeight: 600 }}
              >
                Expand all
              </button>
              <span style={{ color: "var(--border)" }}>|</span>
              <button
                onClick={collapseAllNodes}
                style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: 0, fontSize: "11px", fontWeight: 500 }}
              >
                Collapse all
              </button>
            </div>
            {hiddenItemIds && hiddenItemIds.size > 0 && (
              <button
                onClick={showAllHidden}
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "4px",
                  color: "#2563eb",
                  cursor: "pointer",
                  padding: "2px 6px",
                  fontSize: "8px",
                  fontWeight: 800
                }}
              >
                👁️ Show all ({hiddenItemIds.size} hidden)
              </button>
            )}
          </div>

          {/* Explorer Tree Hierarchy */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            background: "#ffffff",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "8px 6px",
            fontSize: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
          }}>
            {/* Level 0: Root Project Node */}
            <div
              onClick={() => toggleNode("root")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 6px",
                borderRadius: "5px",
                cursor: "pointer",
                fontWeight: 700,
                color: "#0f172a",
                userSelect: "none"
              }}
            >
              <span style={{ fontSize: "10px", color: "#64748b", transition: "transform 0.15s ease", transform: expandedNodes.has("root") ? "rotate(90deg)" : "rotate(0deg)" }}>
                ▶
              </span>
              <span>🏠</span>
              <span style={{ flex: 1 }}>{currentProjectName || "Modern House"}</span>
            </div>

            {expandedNodes.has("root") && (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "12px" }}>
                {(pages.length > 0 ? pages : [{ id: 0, name: "Ground Floor" }]).map((page, pageIdx) => {
                  const floorKey = `floor_${pageIdx}`;
                  const isFloorExpanded = expandedNodes.has(floorKey);
                  const isCurrentFloor = (currentPage || 0) === pageIdx;

                  // Data for this floor
                  const pageWalls = wallsByPageProp[pageIdx] || (pageIdx === currentPage ? (walls || []) : []);
                  const pageRawDoors = doorsByPageProp[pageIdx] || (pageIdx === currentPage ? (doors || []) : []);
                  const pageDoors = pageRawDoors.filter(d => {
                    const isWinClass = d.is_window || d.type === 'window' || d.id?.startsWith('win_');
                    if (!isWinClass) return true; // non-window items always go to doors list
                    // Window on internal wall → treat as door (sliding)
                    const pw = pageWalls.find(w => w.id === d.parentWallId);
                    const isParentExt = pw && (pw.class_name === 'exterior_wall' || pw.type === 'ext' || pw.is_ext || pw.is_exterior);
                    return pw && !isParentExt && pw.class_name !== 'block_wall'; // window on internal wall → shows in doors
                  });
                  const pageWindows = pageRawDoors.filter(d => {
                    const isWinClass = d.is_window || d.type === 'window' || d.id?.startsWith('win_');
                    if (!isWinClass) return false; // non-window items never go to windows list
                    // Window on external wall → stays as window
                    const pw = pageWalls.find(w => w.id === d.parentWallId);
                    const isParentExt = pw && (pw.class_name === 'exterior_wall' || pw.type === 'ext' || pw.is_ext || pw.is_exterior);
                    return !pw || isParentExt || pw.class_name === 'block_wall'; // window on ext wall or no wall → stays as window
                  });
                  const pageRooms = roomsByPageProp[pageIdx] || (pageIdx === currentPage ? (rooms || []) : []);
                  const pageLintels = lintelsByPageProp ? (lintelsByPageProp[pageIdx] || []) : (lintelsByPage ? (lintelsByPage[pageIdx] || []) : []);
                  const pageRoofs = roofsByPageProp ? (roofsByPageProp[pageIdx] || []) : (roofsByPage ? (roofsByPage[pageIdx] || []) : []);

                  // Filter by search query
                  const q = explorerSearch.trim().toLowerCase();
                  const filterMatch = (item, type, label) => {
                    if (!q) return true;
                    const idStr = String(item.id || "").toLowerCase();
                    const labelStr = String(label || "").toLowerCase();
                    const typeStr = String(type || "").toLowerCase();
                    return idStr.includes(q) || labelStr.includes(q) || typeStr.includes(q);
                  };

                  const stripLeadingZero = (name) => {
                    if (!name || typeof name !== 'string') return name;
                    // Converts D-001 -> D-01, W-001 -> W-01, SD-001 -> SD-01, door_001 -> door_01
                    return name.replace(/^([A-Za-z]+[-_])0+(\d{2,})$/, '$1$2');
                  };

                  const getWallLabel = (w, idx) => {
                    if (w.name) return stripLeadingZero(w.name);
                    if (w.userLabel) return stripLeadingZero(w.userLabel);
                    if (w.id) {
                      const strId = String(w.id);
                      if (!strId.startsWith("man_wall_") && !strId.startsWith("wall-topo-") && !strId.startsWith("wall-") && !strId.startsWith("wall_") && strId.length <= 10) {
                        return stripLeadingZero(strId);
                      }
                    }
                    return `W-${idx + 1}`;
                  };

                  const getDoorLabel = (d, idx) => {
                    let raw = d.doorName || d.door_name || d.name;
                    if (raw) return stripLeadingZero(raw);
                    const isConvertedWindow = d.is_window || d.type === 'window' || d.id?.startsWith('win_') || d.windowConvertedToSliding;
                    const isSlidingDoor = d.class === 'sliding_door' || d.class === 'double_sliding_door' || d.type === 'sliding' || d.doorTypeId?.includes('sliding');
                    if (d.id) {
                      const strId = String(d.id);
                      if (!strId.startsWith("man_door_") && !strId.startsWith("door_") && !strId.startsWith("door-") && strId.length <= 10) {
                        return stripLeadingZero(strId);
                      }
                    }
                    const prefix = (isConvertedWindow || isSlidingDoor) ? "SD" : "D";
                    return `${prefix}-${String(idx + 1).padStart(2, '0')}`;
                  };

                  const getWindowLabel = (win, idx) => {
                    let raw = win.doorName || win.door_name || win.name;
                    if (raw) return stripLeadingZero(raw);
                    if (win.id) {
                      const strId = String(win.id);
                      if (!strId.startsWith("man_win_") && !strId.startsWith("win_") && !strId.startsWith("win-") && !strId.startsWith("window_") && strId.length <= 10) {
                        return stripLeadingZero(strId);
                      }
                    }
                    return `W-${String(idx + 1).padStart(2, '0')}`;
                  };

                  const getRoomLabel = (r, idx) => {
                    if (r.room_name) return r.room_name;
                    if (r.name) return r.name;
                    if (r.id) {
                      const strId = String(r.id);
                      if (!strId.startsWith("room_") && !strId.startsWith("rm_") && strId.length <= 10) {
                        return strId;
                      }
                    }
                    return `Room ${idx + 1}`;
                  };

                  const filteredWalls = pageWalls.filter((w, idx) => filterMatch(w, "wall", getWallLabel(w, idx)));
                  const filteredDoors = pageDoors.filter((d, idx) => filterMatch(d, "door", getDoorLabel(d, idx)));
                  const filteredWindows = pageWindows.filter((w, idx) => filterMatch(w, "window", getWindowLabel(w, idx)));
                  const filteredRooms = pageRooms.filter((r, idx) => filterMatch(r, "room", getRoomLabel(r, idx)));
                  const filteredLintels = pageLintels.filter((l, idx) => filterMatch(l, "lintel", l.description || `Lintel #${idx + 1}`));
                  const filteredRoofs = pageRoofs.filter((rf, idx) => filterMatch(rf, "roof", rf.name || `Roof #${idx + 1}`));

                  const floorTitle = mapFloorName(page.floor_name || page.name, pageIdx) || `Level ${pageIdx + 1}`;

                  const selectExclusiveRoof = (e, targetPageIdx, rf) => {
                    if (e) e.stopPropagation();
                    if (goPage && targetPageIdx !== currentPage) goPage(targetPageIdx);
                    if (setSelectedWallIds) setSelectedWallIds([]);
                    if (setSelectedDoorIds) setSelectedDoorIds([]);
                    if (setSelectedRoomIds) setSelectedRoomIds([]);
                    if (setSelectedLintelIds) setSelectedLintelIds([]);
                    if (setSelectedRoofId) setSelectedRoofId(rf.id);
                    if (setSelectedId) setSelectedId(rf.id);
                    if (setSelectedType) setSelectedType("roof");
                    setExplorerViewMode("properties");
                  };

                  const selectExclusiveWall = (e, targetPageIdx, w, isMulti = false) => {
                    if (e) e.stopPropagation();
                    if (goPage && targetPageIdx !== currentPage) goPage(targetPageIdx);
                    if (setSelectedRoofId) setSelectedRoofId(null);
                    if (setSelectedDoorIds) setSelectedDoorIds([]);
                    if (setSelectedRoomIds) setSelectedRoomIds([]);
                    if (setSelectedLintelIds) setSelectedLintelIds([]);
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
                  };

                  const selectExclusiveDoor = (e, targetPageIdx, d) => {
                    if (e) e.stopPropagation();
                    if (goPage && targetPageIdx !== currentPage) goPage(targetPageIdx);
                    if (setSelectedRoofId) setSelectedRoofId(null);
                    if (setSelectedWallIds) setSelectedWallIds([]);
                    if (setSelectedRoomIds) setSelectedRoomIds([]);
                    if (setSelectedLintelIds) setSelectedLintelIds([]);
                    if (setSelectedId) setSelectedId(d.id);
                    if (setSelectedType) setSelectedType("door");
                    if (setSelectedDoorIds) setSelectedDoorIds([d.id]);
                  };

                  const selectExclusiveRoom = (e, targetPageIdx, r) => {
                    if (e) e.stopPropagation();
                    if (goPage && targetPageIdx !== currentPage) goPage(targetPageIdx);
                    if (setSelectedRoofId) setSelectedRoofId(null);
                    if (setSelectedWallIds) setSelectedWallIds([]);
                    if (setSelectedDoorIds) setSelectedDoorIds([]);
                    if (setSelectedLintelIds) setSelectedLintelIds([]);
                    if (setSelectedId) setSelectedId(r.id);
                    if (setSelectedType) setSelectedType("room");
                    if (setSelectedRoomIds) setSelectedRoomIds([r.id]);
                  };

                  const selectExclusiveLintel = (e, targetPageIdx, l) => {
                    if (e) e.stopPropagation();
                    if (goPage && targetPageIdx !== currentPage) goPage(targetPageIdx);
                    if (setSelectedRoofId) setSelectedRoofId(null);
                    if (setSelectedWallIds) setSelectedWallIds([]);
                    if (setSelectedDoorIds) setSelectedDoorIds([]);
                    if (setSelectedRoomIds) setSelectedRoomIds([]);
                    if (setSelectedId) setSelectedId(l.id);
                    if (setSelectedType) setSelectedType("lintel");
                    if (setSelectedLintelIds) setSelectedLintelIds([l.id]);
                  };

                  return (
                    <div key={floorKey} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {/* Level 1: Floor / Page Node */}
                      <div
                        onClick={() => {
                          toggleNode(floorKey);
                          if (goPage) goPage(pageIdx);
                          else if (setCurrentPageProp) setCurrentPageProp(pageIdx);
                        }}
                        onDoubleClick={(e) => handleRenameFloor(e, pageIdx, page.floor_name || page.name)}
                        title="Nhấp đúp để đổi tên tầng (Double-click to rename floor)"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "5px 6px",
                          borderRadius: "5px",
                          cursor: "pointer",
                          fontWeight: 600,
                          color: isCurrentFloor ? "var(--blue)" : "#334155",
                          background: isCurrentFloor ? "#eff6ff" : "transparent",
                          userSelect: "none"
                        }}
                      >
                        <span style={{ fontSize: "9px", color: "#94a3b8", transition: "transform 0.15s ease", transform: isFloorExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                          ▶
                        </span>
                        <span>🏢</span>
                        <span style={{ flex: 1, fontWeight: 700 }}>{floorTitle}</span>
                        <button
                          title="Đổi tên tầng (Rename floor)"
                          onClick={(e) => handleRenameFloor(e, pageIdx, page.floor_name || page.name)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#64748b", opacity: 0.7, padding: "0 2px" }}
                        >
                          ✏️
                        </button>
                        {isCurrentFloor && (
                          <span style={{ fontSize: "9px", background: "var(--blue)", color: "#fff", padding: "1px 5px", borderRadius: "4px", fontWeight: 700 }}>
                            ACTIVE
                          </span>
                        )}
                      </div>

                      {isFloorExpanded && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "14px" }}>
                          {/* ── WALLS GROUP ── */}
                          {pageWalls.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <div
                                onClick={() => toggleNode(`${floorKey}_walls`)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 6px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "#475569",
                                  userSelect: "none"
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                  <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_walls`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                                  <span>🧱</span>
                                  <span>Walls</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>({pageWalls.length})</span>
                                  <button
                                    title="Toggle all walls visibility"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) {
                                        const allHidden = pageWalls.every(w => hiddenItemIds?.has(w.id));
                                        if (setHiddenItemIds) {
                                          setHiddenItemIds(prev => {
                                            const next = new Set(prev);
                                            pageWalls.forEach(w => allHidden ? next.delete(w.id) : next.add(w.id));
                                            return next;
                                          });
                                        }
                                      }
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "var(--blue)", padding: "0 2px" }}
                                  >
                                    {pageWalls.every(w => hiddenItemIds?.has(w.id)) ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>

                              {expandedNodes.has(`${floorKey}_walls`) && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                                  {filteredWalls.map((w, idx) => {
                                    const isSelected = selectedId === w.id || (selectedWallIds && selectedWallIds.includes(w.id));
                                    const isHidden = hiddenItemIds?.has(w.id);
                                    const c = w.centerline;
                                    let lengthStr = "";
                                    if (c && c.length === 2 && scaleValue) {
                                      const lenPx = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]);
                                      lengthStr = `${(lenPx * scaleValue).toFixed(1)}m`;
                                    }

                                    return (
                                      <div
                                        key={w.id ? `w_${w.id}_${idx}` : `wall_${idx}`}
                                        id={w.id ? `explorer-item-${w.id}` : undefined}
                                        onClick={(e) => selectExclusiveWall(e, pageIdx, w, e.ctrlKey || e.shiftKey)}
                                        onDoubleClick={(e) => {
                                          selectExclusiveWall(e, pageIdx, w, false);
                                          setExplorerViewMode("properties");
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          padding: "4px 8px",
                                          borderRadius: "5px",
                                          cursor: "pointer",
                                          fontSize: "12px",
                                          background: isSelected ? "#eff6ff" : "transparent",
                                          border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                          color: isSelected ? "#1d4ed8" : (isHidden ? "#94a3b8" : "var(--text)"),
                                          fontWeight: isSelected ? 700 : 500,
                                          textDecoration: isHidden ? "line-through" : "none",
                                          opacity: isHidden ? 0.6 : 1,
                                          transition: "all 0.12s ease"
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, overflow: "hidden", flex: 1, marginRight: "4px", whiteSpace: "nowrap" }}>
                                          <span style={{ fontSize: "11px", opacity: 0.8, flexShrink: 0 }}>🧱</span>
                                          <span style={{ fontWeight: isSelected ? 700 : 600, whiteSpace: "nowrap" }}>{getWallLabel(w, idx)}</span>
                                          {lengthStr && (
                                            <span style={{ fontSize: "10px", color: isSelected ? "#3b82f6" : "#64748b", fontWeight: 400, whiteSpace: "nowrap", flexShrink: 0 }}>
                                              ({lengthStr})
                                            </span>
                                          )}
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0, marginLeft: "auto" }}>
                                          {/* Quick Edit */}
                                          <button
                                            title="Edit wall properties"
                                            onClick={(e) => {
                                              selectExclusiveWall(e, pageIdx, w, false);
                                              setExplorerViewMode("properties");
                                            }}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#64748b", opacity: isSelected ? 1 : 0.6, padding: "0 2px" }}
                                          >
                                            ✏️
                                          </button>
                                          {/* Delete Wall */}
                                          {deleteWalls && (
                                            <button
                                              title="Delete wall"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deleteWalls([w.id]);
                                              }}
                                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#ef4444", opacity: isSelected ? 1 : 0.6, padding: "0 2px" }}
                                            >
                                              🗑️
                                            </button>
                                          )}
                                          {/* Visibility Toggle Eye Icon */}
                                          <button
                                            title={isHidden ? "Show wall" : "Hide wall"}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (toggleItemVisibility) toggleItemVisibility(w.id);
                                            }}
                                            style={{
                                              background: "none",
                                              border: "none",
                                              cursor: "pointer",
                                              fontSize: "12px",
                                              color: isHidden ? "#94a3b8" : "var(--blue)",
                                              fontWeight: 700,
                                              padding: "0 2px"
                                            }}
                                          >
                                            {isHidden ? "⊘" : "⊚"}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── DOORS GROUP ── */}
                          {pageDoors.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <div
                                onClick={() => toggleNode(`${floorKey}_doors`)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 6px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "#475569",
                                  userSelect: "none"
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                  <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_doors`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                                  <span>🚪</span>
                                  <span>Doors</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 600 }}>({pageDoors.length})</span>
                                  <button
                                    title="Toggle all doors visibility"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) {
                                        const allHidden = pageDoors.every(d => hiddenItemIds?.has(d.id));
                                        if (setHiddenItemIds) {
                                          setHiddenItemIds(prev => {
                                            const next = new Set(prev);
                                            pageDoors.forEach(d => allHidden ? next.delete(d.id) : next.add(d.id));
                                            return next;
                                          });
                                        }
                                      }
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "var(--blue)", padding: "0 2px" }}
                                  >
                                    {pageDoors.every(d => hiddenItemIds?.has(d.id)) ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>

                              {expandedNodes.has(`${floorKey}_doors`) && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                                  {filteredDoors.map((d, idx) => {
                                    const isSelected = (selectedId === d.id && selectedType === "door") || (selectedDoorIds && selectedDoorIds.includes(d.id));
                                    const isHidden = hiddenItemIds?.has(d.id);
                                    const label = d.hardware_type || d.type || `Door #${idx + 1}`;

                                    return (
                                      <div
                                        key={d.id ? `d_${d.id}_${idx}` : `door_${idx}`}
                                        id={d.id ? `explorer-item-${d.id}` : undefined}
                                        onClick={(e) => selectExclusiveDoor(e, pageIdx, d)}
                                        onDoubleClick={(e) => {
                                          selectExclusiveDoor(e, pageIdx, d);
                                          setExplorerViewMode("properties");
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          padding: "4px 8px",
                                          borderRadius: "5px",
                                          cursor: "pointer",
                                          fontSize: "12px",
                                          background: isSelected ? "#eff6ff" : "transparent",
                                          border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                          color: isSelected ? "#1d4ed8" : (isHidden ? "#94a3b8" : "var(--text)"),
                                          fontWeight: isSelected ? 700 : 500,
                                          textDecoration: isHidden ? "line-through" : "none",
                                          opacity: isHidden ? 0.6 : 1,
                                          transition: "all 0.12s ease"
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, overflow: "hidden", flex: 1, marginRight: "4px", whiteSpace: "nowrap" }}>
                                          {(() => {
                                            const isConvertedWindow = d.is_window || d.type === 'window' || d.id?.startsWith('win_') || d.windowConvertedToSliding;
                                            const isSlidingDoor = d.class === 'sliding_door' || d.class === 'double_sliding_door' || d.type === 'sliding' || d.doorTypeId?.includes('sliding');
                                            const icon = isConvertedWindow ? "↔️" : isSlidingDoor ? "↔️" : "🚪";
                                            const label = getDoorLabel(d, idx);
                                            return (
                                              <>
                                                <span style={{ flexShrink: 0 }}>{icon}</span>
                                                <span style={{ fontWeight: isSelected ? 700 : 600, whiteSpace: "nowrap" }}>{label}</span>
                                              </>
                                            );
                                          })()}
                                          {(() => {
                                            const dWidth = getDoorWindowDisplayWidthMm(d, realScale, scaleValue);
                                            return dWidth ? (
                                              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 400, whiteSpace: "nowrap", flexShrink: 0 }}>({dWidth}mm)</span>
                                            ) : null;
                                          })()}
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0, marginLeft: "auto" }}>
                                          <button
                                            title="Edit door properties"
                                            onClick={(e) => {
                                              selectExclusiveDoor(e, pageIdx, d);
                                              setExplorerViewMode("properties");
                                            }}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#64748b", opacity: isSelected ? 1 : 0.6, padding: "0 2px" }}
                                          >
                                            ✏️
                                          </button>
                                          {deleteDoor && (
                                            <button
                                              title="Delete door"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deleteDoor(d.id);
                                              }}
                                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#ef4444", opacity: isSelected ? 1 : 0.6, padding: "0 2px" }}
                                            >
                                              🗑️
                                            </button>
                                          )}
                                          <button
                                            title={isHidden ? "Show door" : "Hide door"}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (toggleItemVisibility) toggleItemVisibility(d.id);
                                            }}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: isHidden ? "#94a3b8" : "var(--blue)", fontWeight: 700, padding: "0 2px" }}
                                          >
                                            {isHidden ? "⊘" : "⊚"}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── WINDOWS GROUP ── */}
                          {pageWindows.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <div
                                onClick={() => toggleNode(`${floorKey}_windows`)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 6px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "#475569",
                                  userSelect: "none"
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                  <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_windows`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                                  <span>🪟</span>
                                  <span>Windows</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>({pageWindows.length})</span>
                                  <button
                                    title="Toggle all windows visibility"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) {
                                        const allHidden = pageWindows.every(w => hiddenItemIds?.has(w.id));
                                        if (setHiddenItemIds) {
                                          setHiddenItemIds(prev => {
                                            const next = new Set(prev);
                                            pageWindows.forEach(w => allHidden ? next.delete(w.id) : next.add(w.id));
                                            return next;
                                          });
                                        }
                                      }
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "var(--blue)", padding: "0 2px" }}
                                  >
                                    {pageWindows.every(w => hiddenItemIds?.has(w.id)) ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>

                              {expandedNodes.has(`${floorKey}_windows`) && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                                  {filteredWindows.map((win, idx) => {
                                    const isSelected = (selectedId === win.id && (selectedType === "window" || selectedType === "door")) || (selectedDoorIds && selectedDoorIds.includes(win.id));
                                    const isHidden = hiddenItemIds?.has(win.id);

                                    return (
                                      <div
                                        key={win.id ? `win_${win.id}_${idx}` : `window_${idx}`}
                                        id={win.id ? `explorer-item-${win.id}` : undefined}
                                        onClick={(e) => selectExclusiveDoor(e, pageIdx, win)}
                                        onDoubleClick={(e) => {
                                          selectExclusiveDoor(e, pageIdx, win);
                                          setExplorerViewMode("properties");
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          padding: "4px 8px",
                                          borderRadius: "5px",
                                          cursor: "pointer",
                                          fontSize: "12px",
                                          background: isSelected ? "#eff6ff" : "transparent",
                                          border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                          color: isSelected ? "#1d4ed8" : (isHidden ? "#94a3b8" : "var(--text)"),
                                          fontWeight: isSelected ? 700 : 500,
                                          textDecoration: isHidden ? "line-through" : "none",
                                          opacity: isHidden ? 0.6 : 1,
                                          transition: "all 0.12s ease"
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, overflow: "hidden", flex: 1, marginRight: "4px", whiteSpace: "nowrap" }}>
                                          <span style={{ flexShrink: 0 }}>🪟</span>
                                          <span style={{ fontWeight: isSelected ? 700 : 600, whiteSpace: "nowrap" }}>{getWindowLabel(win, idx)}</span>
                                          {(() => {
                                            const winWidth = getDoorWindowDisplayWidthMm(win, realScale, scaleValue);
                                            return winWidth ? (
                                              <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 400, whiteSpace: "nowrap", flexShrink: 0 }}>({winWidth}mm)</span>
                                            ) : null;
                                          })()}
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0, marginLeft: "auto" }}>
                                          <button
                                            title="Edit window properties"
                                            onClick={(e) => {
                                              selectExclusiveDoor(e, pageIdx, win);
                                              setExplorerViewMode("properties");
                                            }}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#64748b", opacity: isSelected ? 1 : 0.6, padding: "0 2px" }}
                                          >
                                            ✏️
                                          </button>
                                          {deleteDoor && (
                                            <button
                                              title="Delete window"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deleteDoor(win.id);
                                              }}
                                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#ef4444", opacity: isSelected ? 1 : 0.6, padding: "0 2px" }}
                                            >
                                              🗑️
                                            </button>
                                          )}
                                          <button
                                            title={isHidden ? "Show window" : "Hide window"}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (toggleItemVisibility) toggleItemVisibility(win.id);
                                            }}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: isHidden ? "#94a3b8" : "var(--blue)", fontWeight: 700, padding: "0 2px" }}
                                          >
                                            {isHidden ? "⊘" : "⊚"}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── ROOMS GROUP ── */}
                          {pageRooms.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <div
                                onClick={() => toggleNode(`${floorKey}_rooms`)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 6px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "#475569",
                                  userSelect: "none"
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                  <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_rooms`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                                  <span>📐</span>
                                  <span>Rooms</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>({pageRooms.length})</span>
                                  <button
                                    title="Toggle all rooms visibility"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) {
                                        const allHidden = pageRooms.every(r => hiddenItemIds?.has(r.id));
                                        if (setHiddenItemIds) {
                                          setHiddenItemIds(prev => {
                                            const next = new Set(prev);
                                            pageRooms.forEach(r => allHidden ? next.delete(r.id) : next.add(r.id));
                                            return next;
                                          });
                                        }
                                      }
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "var(--blue)", padding: "0 2px" }}
                                  >
                                    {pageRooms.every(r => hiddenItemIds?.has(r.id)) ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>

                              {expandedNodes.has(`${floorKey}_rooms`) && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                                  {filteredRooms.map((r, idx) => {
                                    const isSelected = (selectedId === r.id && selectedType === "room") || (selectedRoomIds && selectedRoomIds.includes(r.id));
                                    const isHidden = hiddenItemIds?.has(r.id);
                                    const roomName = getRoomLabel(r, idx);

                                    return (
                                      <div
                                        key={r.id ? `rm_${r.id}_${idx}` : `room_${idx}`}
                                        id={r.id ? `explorer-item-${r.id}` : undefined}
                                        onClick={(e) => selectExclusiveRoom(e, pageIdx, r)}
                                        onDoubleClick={(e) => handleRenameRoom(e, pageIdx, r)}
                                        title="Nhấp đúp để đổi tên phòng (Double-click to rename room)"
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          padding: "4px 8px",
                                          borderRadius: "5px",
                                          cursor: "pointer",
                                          fontSize: "12px",
                                          background: isSelected ? "#eff6ff" : "transparent",
                                          border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                          color: isSelected ? "#1d4ed8" : (isHidden ? "#94a3b8" : "var(--text)"),
                                          fontWeight: isSelected ? 700 : 500,
                                          textDecoration: isHidden ? "line-through" : "none",
                                          opacity: isHidden ? 0.6 : 1,
                                          transition: "all 0.12s ease"
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, whiteSpace: "nowrap" }}>
                                          <span style={{ flexShrink: 0 }}>📐</span>
                                          <span style={{ fontWeight: isSelected ? 700 : 600, whiteSpace: "nowrap" }}>{roomName}</span>
                                          {r.areaM2 && (
                                            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 400, whiteSpace: "nowrap", flexShrink: 0 }}>({r.areaM2.toFixed(1)} m²)</span>
                                          )}
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                          <button
                                            title="Mở thuộc tính phòng (Edit room properties)"
                                            onClick={(e) => {
                                              selectExclusiveRoom(e, pageIdx, r);
                                              setExplorerViewMode("properties");
                                            }}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#64748b", opacity: isSelected ? 1 : 0.6 }}
                                          >
                                            ✏️
                                          </button>
                                          {/* Delete Room */}
                                          {setRoomsByPage && (
                                            <button
                                              title="Delete room"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setRoomsByPage(prev => ({
                                                  ...prev,
                                                  [pageIdx]: (prev[pageIdx] || []).filter(rm => rm.id !== r.id)
                                                }));
                                              }}
                                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#ef4444", opacity: isSelected ? 1 : 0.4 }}
                                            >
                                              🗑️
                                            </button>
                                          )}
                                          <button
                                            title={isHidden ? "Show room" : "Hide room"}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (toggleItemVisibility) toggleItemVisibility(r.id);
                                            }}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: isHidden ? "#94a3b8" : "var(--blue)", fontWeight: 700 }}
                                          >
                                            {isHidden ? "⊘" : "⊚"}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── LINTELS GROUP ── */}
                          {pageLintels.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <div
                                onClick={() => toggleNode(`${floorKey}_lintels`)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 6px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "#475569",
                                  userSelect: "none"
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                  <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_lintels`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                                  <span>🏗️</span>
                                  <span>Lintels</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>({pageLintels.length})</span>
                                  <button
                                    title="Toggle all lintels visibility"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) {
                                        const allHidden = pageLintels.every(l => hiddenItemIds?.has(l.id));
                                        if (setHiddenItemIds) {
                                          setHiddenItemIds(prev => {
                                            const next = new Set(prev);
                                            pageLintels.forEach(l => allHidden ? next.delete(l.id) : next.add(l.id));
                                            return next;
                                          });
                                        }
                                      }
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "var(--blue)", padding: "0 2px" }}
                                  >
                                    {pageLintels.every(l => hiddenItemIds?.has(l.id)) ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>

                              {expandedNodes.has(`${floorKey}_lintels`) && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                                  {filteredLintels.map((l, idx) => {
                                    const isSelected = (selectedId === l.id && selectedType === "lintel") || (selectedLintelIds && selectedLintelIds.includes(l.id));
                                    const isHidden = hiddenItemIds?.has(l.id);

                                    return (
                                      <div
                                        key={l.id ? `lin_${l.id}_${idx}` : `lintel_${idx}`}
                                        id={l.id ? `explorer-item-${l.id}` : undefined}
                                        onClick={(e) => selectExclusiveLintel(e, pageIdx, l)}
                                        onDoubleClick={(e) => {
                                          selectExclusiveLintel(e, pageIdx, l);
                                          setExplorerViewMode("properties");
                                        }}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          padding: "4px 8px",
                                          borderRadius: "5px",
                                          cursor: "pointer",
                                          fontSize: "12px",
                                          background: isSelected ? "#eff6ff" : "transparent",
                                          border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                          color: isSelected ? "#1d4ed8" : (isHidden ? "#94a3b8" : "var(--text)"),
                                          fontWeight: isSelected ? 700 : 500,
                                          textDecoration: isHidden ? "line-through" : "none",
                                          opacity: isHidden ? 0.6 : 1,
                                          transition: "all 0.12s ease"
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, whiteSpace: "nowrap" }}>
                                          <span style={{ flexShrink: 0 }}>🏗️</span>
                                          <span style={{ fontWeight: isSelected ? 700 : 600, whiteSpace: "nowrap" }}>{l.description || `Lintel #${idx + 1}`}</span>
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                          <button
                                            title="Edit lintel properties"
                                            onClick={(e) => {
                                              selectExclusiveLintel(e, pageIdx, l);
                                              setExplorerViewMode("properties");
                                            }}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#64748b", opacity: isSelected ? 1 : 0.4 }}
                                          >
                                            ✏️
                                          </button>
                                          <button
                                            title={isHidden ? "Show lintel" : "Hide lintel"}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (toggleItemVisibility) toggleItemVisibility(l.id);
                                            }}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: isHidden ? "#94a3b8" : "var(--blue)", fontWeight: 700 }}
                                          >
                                            {isHidden ? "⊘" : "⊚"}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── ROOFS GROUP ── */}
                          {pageRoofs.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <div
                                onClick={() => toggleNode(`${floorKey}_roofs`)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "4px 6px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "#475569",
                                  userSelect: "none"
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                  <span style={{ fontSize: "8px", color: "#94a3b8", transform: expandedNodes.has(`${floorKey}_roofs`) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>▶</span>
                                  <span>🏠</span>
                                  <span>Roofs</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 500 }}>({pageRoofs.length})</span>
                                  <button
                                    title="Toggle all roofs visibility"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (toggleItemVisibility) {
                                        const allHidden = pageRoofs.every(rf => hiddenItemIds?.has(rf.id));
                                        if (setHiddenItemIds) {
                                          setHiddenItemIds(prev => {
                                            const next = new Set(prev);
                                            pageRoofs.forEach(rf => allHidden ? next.delete(rf.id) : next.add(rf.id));
                                            return next;
                                          });
                                        }
                                      }
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "var(--blue)", padding: "0 2px" }}
                                  >
                                    {pageRoofs.every(rf => hiddenItemIds?.has(rf.id)) ? "⊘" : "⊚"}
                                  </button>
                                </div>
                              </div>

                              {expandedNodes.has(`${floorKey}_roofs`) && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "16px" }}>
                                  {filteredRoofs.map((rf, idx) => {
                                    const isSelected = selectedRoofId === rf.id || selectedId === rf.id;
                                    const isHidden = hiddenItemIds?.has(rf.id);

                                    return (
                                      <div
                                        key={rf.id ? `rf_${rf.id}_${idx}` : `roof_${idx}`}
                                        id={rf.id ? `explorer-item-${rf.id}` : undefined}
                                        onClick={(e) => selectExclusiveRoof(e, pageIdx, rf)}
                                        onDoubleClick={(e) => selectExclusiveRoof(e, pageIdx, rf)}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          padding: "4px 8px",
                                          borderRadius: "5px",
                                          cursor: "pointer",
                                          fontSize: "12px",
                                          background: isSelected ? "#eff6ff" : "transparent",
                                          border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                                          color: isSelected ? "#1d4ed8" : (isHidden ? "#94a3b8" : "var(--text)"),
                                          fontWeight: isSelected ? 700 : 500,
                                          textDecoration: isHidden ? "line-through" : "none",
                                          opacity: isHidden ? 0.6 : 1,
                                          transition: "all 0.12s ease"
                                        }}
                                      >
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, whiteSpace: "nowrap" }}>
                                          <span style={{ flexShrink: 0 }}>🏠</span>
                                          <span style={{ fontWeight: isSelected ? 700 : 600, whiteSpace: "nowrap" }}>{rf.name || `Roof #${idx + 1}`}</span>
                                          {rf.pitchAngle !== undefined && (
                                            <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 400, whiteSpace: "nowrap", flexShrink: 0 }}>({rf.pitchAngle}°)</span>
                                          )}
                                        </div>

                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                                          <button
                                            title="Edit roof properties"
                                            onClick={(e) => selectExclusiveRoof(e, pageIdx, rf)}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#64748b", opacity: isSelected ? 1 : 0.4 }}
                                          >
                                            ✏️
                                          </button>
                                          {deleteRoof && (
                                            <button
                                              title="Delete roof"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                deleteRoof(rf.id);
                                              }}
                                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "11px", color: "#ef4444", opacity: isSelected ? 1 : 0.4 }}
                                            >
                                              🗑️
                                            </button>
                                          )}
                                          <button
                                            title={isHidden ? "Show roof" : "Hide roof"}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (toggleItemVisibility) toggleItemVisibility(rf.id);
                                            }}
                                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: isHidden ? "#94a3b8" : "var(--blue)", fontWeight: 700 }}
                                          >
                                            {isHidden ? "⊘" : "⊚"}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : activePaneTab === "job_task" ? (
        /* ══════════════════════════════════════════════════════
           TAB: TASK GROUPS HW (TaskList Web3 + Tích xanh hoàn thành)
           ══════════════════════════════════════════════════════ */
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto", flex: 1 }}>
          {/* Header & Refresh */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "#38bdf8" }}>📋 Task Groups HW</span>
              <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>
                ({Math.min(taskDisplayLimit, filteredTasks.length)}/{filteredTasks.length})
              </span>
            </div>
            <button
              onClick={() => fetchTasks(true)}
              disabled={taskLoading}
              title="Làm mới danh sách từ TaskList"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#e2e8f0",
                padding: "4px 8px",
                borderRadius: "5px",
                cursor: taskLoading ? "not-allowed" : "pointer",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              {taskLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {/* Search Box */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="🔍 Search Job HW, client, staff..."
              value={taskSearch}
              onChange={(e) => {
                setTaskSearch(e.target.value);
                setTaskDisplayLimit(30);
              }}
              style={{
                width: "100%",
                padding: "8px 26px 8px 10px",
                background: "#ffffff",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--text)",
                fontSize: "12px",
                outline: "none",
                boxSizing: "border-box",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
              }}
            />
            {taskSearch && (
              <button
                onClick={() => setTaskSearch("")}
                style={{
                  position: "absolute",
                  right: "6px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "13px"
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Scope Toggle: Task Của Tôi vs Tất Cả */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            <button
              onClick={() => { setStaffScope("my"); setTaskDisplayLimit(30); }}
              style={{
                padding: "7px 6px",
                fontSize: "11px",
                fontWeight: staffScope === "my" ? 700 : 500,
                color: staffScope === "my" ? "#ffffff" : "var(--text)",
                background: staffScope === "my" ? "var(--blue)" : "#ffffff",
                border: staffScope === "my" ? "1px solid var(--blue)" : "1px solid var(--border)",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                boxShadow: staffScope === "my" ? "0 1px 4px rgba(37,99,235,0.25)" : "none",
                transition: "all 0.15s ease"
              }}
            >
              <span>👤 My Tasks ({myStaffCode})</span>
            </button>
            <button
              onClick={() => { setStaffScope("all"); setTaskDisplayLimit(30); }}
              style={{
                padding: "7px 6px",
                fontSize: "11px",
                fontWeight: staffScope === "all" ? 700 : 500,
                color: staffScope === "all" ? "#ffffff" : "var(--text)",
                background: staffScope === "all" ? "var(--blue)" : "#ffffff",
                border: staffScope === "all" ? "1px solid var(--blue)" : "1px solid var(--border)",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                boxShadow: staffScope === "all" ? "0 1px 4px rgba(37,99,235,0.25)" : "none",
                transition: "all 0.15s ease"
              }}
            >
              <span>🌐 All HW Tasks</span>
            </button>
          </div>

          {/* Filter Pills */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
            <button
              onClick={() => { setTaskFilter("all"); setTaskDisplayLimit(30); }}
              style={{
                padding: "6px 2px",
                fontSize: "11px",
                fontWeight: taskFilter === "all" ? 700 : 500,
                color: taskFilter === "all" ? "#1d4ed8" : "var(--text-dim)",
                background: taskFilter === "all" ? "#eff6ff" : "#ffffff",
                border: taskFilter === "all" ? "1px solid #93c5fd" : "1px solid var(--border)",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              All ({filteredTasks.length})
            </button>
            <button
              onClick={() => { setTaskFilter("completed"); setTaskDisplayLimit(30); }}
              style={{
                padding: "6px 2px",
                fontSize: "11px",
                fontWeight: taskFilter === "completed" ? 700 : 500,
                color: taskFilter === "completed" ? "#059669" : "var(--text-dim)",
                background: taskFilter === "completed" ? "#ecfdf5" : "#ffffff",
                border: taskFilter === "completed" ? "1px solid #a7f3d0" : "1px solid var(--border)",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              ✅ Available ({filteredTasks.filter(t => t.has_local_job).length})
            </button>
            <button
              onClick={() => { setTaskFilter("pending"); setTaskDisplayLimit(30); }}
              style={{
                padding: "6px 2px",
                fontSize: "11px",
                fontWeight: taskFilter === "pending" ? 700 : 500,
                color: taskFilter === "pending" ? "#d97706" : "var(--text-dim)",
                background: taskFilter === "pending" ? "#fef3c7" : "#ffffff",
                border: taskFilter === "pending" ? "1px solid #fde68a" : "1px solid var(--border)",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              ⏳ Pending ({filteredTasks.filter(t => !t.has_local_job).length})
            </button>
          </div>

          {/* Job Task List */}
          {taskLoading ? (
            <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--text-dim)", fontSize: "13px" }}>
              <div style={{ marginBottom: "8px" }}>⏳ Loading Task Groups HW...</div>
            </div>
          ) : taskError ? (
            <div style={{ padding: "12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "6px", color: "#dc2626", fontSize: "12px" }}>
              ⚠️ {taskError}
              <button onClick={() => fetchTasks(true)} style={{ marginTop: "6px", display: "block", color: "var(--blue)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontWeight: 600 }}>Retry</button>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 10px", color: "var(--text-dim)", fontSize: "13px" }}>
              No matching Job Tasks found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filteredTasks.slice(0, taskDisplayLimit).map((task, idx) => {
                const isActiveJob = currentProjectName && task.job_number && currentProjectName.toLowerCase().trim() === task.job_number.toLowerCase().trim();
                const isLoadingThis = loadingJobId === task.hw_id;

                return (
                  <div
                    key={`task_${task.hw_id || task.id_job_ems || idx}_${idx}`}
                    style={{
                      background: isActiveJob ? "#eff6ff" : "#ffffff",
                      border: isActiveJob ? "1.5px solid var(--blue)" : "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {/* Header Row: Job Number & Checkmark Status */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                      <div style={{ fontWeight: 800, fontSize: "13px", color: isActiveJob ? "var(--blue)" : "var(--text)", display: "flex", alignItems: "center", gap: "6px" }}>
                        {task.job_number || "No Job Number"}
                        {isActiveJob && (
                          <span style={{ fontSize: "9px", background: "var(--blue)", color: "#fff", padding: "1px 5px", borderRadius: "4px", fontWeight: 700 }}>
                            ACTIVE
                          </span>
                        )}
                      </div>

                      {/* ✅ TÍCH XANH NẾU ĐÃ CÓ TRONG LOCAL DB */}
                      {task.has_local_job ? (
                        <div
                          title="Task HW has takeoff drawing in EzeFloor"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            background: "#ecfdf5",
                            color: "#059669",
                            border: "1px solid #a7f3d0",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Available</span>
                        </div>
                      ) : (
                        <div
                          title="Task HW does not have takeoff drawing in EzeFloor yet"
                          style={{
                            background: "#f1f5f9",
                            color: "#64748b",
                            border: "1px solid #e2e8f0",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            fontSize: "10px",
                            fontWeight: 600
                          }}
                        >
                          Pending
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div style={{ fontSize: "11px", color: "var(--text-dim)", display: "flex", flexDirection: "column", gap: "3px" }}>
                      {task.client && (
                        <div><strong style={{ color: "var(--text)" }}>Client:</strong> {task.client}</div>
                      )}
                      {task.builder && (
                        <div><strong style={{ color: "var(--text)" }}>Builder:</strong> {task.builder}</div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px", color: "#64748b", fontSize: "10px" }}>
                        {task.ma_nv && <span>Staff: <strong style={{ color: "var(--text)" }}>{task.ma_nv}</strong></span>}
                        {task.local_job?.room_count !== undefined && (
                          <span style={{ color: "#059669", fontWeight: 700 }}>{task.local_job.room_count} rooms ({(task.local_job.total_area || 0).toFixed(1)} m²)</span>
                        )}
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => handleOpenJobTask(task)}
                      disabled={isLoadingThis}
                      style={{
                        marginTop: "6px",
                        padding: "7px 10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        borderRadius: "6px",
                        border: "none",
                        cursor: isLoadingThis ? "not-allowed" : "pointer",
                        background: task.has_local_job
                          ? "#10b981"
                          : "var(--blue)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {isLoadingThis ? (
                        "⏳ Loading..."
                      ) : task.has_local_job ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                          Open Drawing
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                          Start Takeoff
                        </>
                      )}
                    </button>
                  </div>
                );
              })}

              {/* Load More Button */}
              {filteredTasks.length > taskDisplayLimit && (
                <button
                  onClick={() => setTaskDisplayLimit(prev => prev + 50)}
                  style={{
                    padding: "8px 12px",
                    background: "#eff6ff",
                    border: "1px dashed #93c5fd",
                    borderRadius: "6px",
                    color: "var(--blue)",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    marginTop: "4px",
                    transition: "all 0.15s ease"
                  }}
                >
                  ⬇️ Load more (+50 HW Tasks)... ({filteredTasks.length - taskDisplayLimit} remaining)
                </button>
              )}
            </div>
          )}
        </div>
      ) : (activePaneTab === "explorer" && explorerViewMode === "properties") || activePaneTab === "properties" ? (
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
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#1d4ed8", background: "#dbeafe", padding: "3px 8px", borderRadius: "12px", textTransform: "uppercase" }}>
              {selectedType ? selectedType.toUpperCase() : "PROPERTIES"}
            </span>
          </div>

          {/* ── PROPERTIES ── */}
          <div className="panel-section">
            <div className="panel-title">Properties</div>
            {selectedType === "room" && selectedRoom ? (
              <>
                <div className="panel-field">
                  <span className="panel-label">Location</span>
                  <select
                    className="panel-select"
                    value={selectedRoom.location || "internal"}
                    onChange={(e) => updateRoom("location", e.target.value)}
                  >
                    <option value="internal">Internal</option>
                    <option value="external">External</option>
                  </select>
                </div>

                <div className="panel-field">
                  <span className="panel-label">Room Name</span>
                  <input
                    className="panel-input"
                    value={selectedRoom.room_name || ""}
                    onChange={(e) => updateRoom("room_name", e.target.value)}
                  />
                  {selectedRoom.ocr_candidates && selectedRoom.ocr_candidates.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      <div style={{ width: "100%", fontSize: 9, color: "#6b7280", marginBottom: 2 }}>AI Detected Names:</div>
                      {selectedRoom.ocr_candidates.map((cand, idx) => (
                        <button
                          key={idx}
                          onClick={() => updateRoom("room_name", cand.text)}
                          title={`Score: ${cand.score} (Source: ${cand.source})`}
                          className="rp-ocr-tag"
                          style={{
                            background: selectedRoom.room_name === cand.text ? "#3b82f6" : undefined,
                          }}
                        >
                          {cand.text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel-field">
                  <span className="panel-label">Room Class</span>
                  <select
                    className="panel-select"
                    value={selectedRoom.room_class || "other"}
                    onChange={(e) => updateRoom("room_class", e.target.value)}
                  >
                    <option value="bedroom">Bedroom</option>
                    <option value="bathroom">Bathroom</option>
                    <option value="kitchen">Kitchen</option>
                    <option value="living">Living Room</option>
                    <option value="garage">Garage</option>
                    <option value="hallway">Hallway</option>
                    <option value="deck">Deck / Porch</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="panel-field">
                  <span className="panel-label">Classification</span>
                  <select
                    className="panel-select"
                    value={selectedRoom.type || selectedRoom.wetness || "dry"}
                    onChange={(e) => updateRoom("type", e.target.value)}
                  >
                    <option value="dry">Dry</option>
                    <option value="wet">Wet</option>
                    <option value="timber_deck">Timber Deck</option>
                    <option value="tile_deck">Tile Deck</option>
                  </select>
                </div>

                <div className="panel-field">
                  <span className="panel-label">Area</span>
                  <div style={{ fontSize: 16, color: "#3b82f6", fontWeight: "bold" }}>
                    {(scaleValue ? polygonAreaM2Util(selectedRoom.polygon, scaleValue) : 0).toFixed(2)} m²
                  </div>
                </div>
              </>
            ) : (selectedType === "wall" || selectedWallIds.length > 0) && (selectedWall || selectedWallIds.length > 0) ? (
              <>
                {selectedWallIds.length <= 1 && selectedWall && (() => {
                  const wallIdx = (walls || []).findIndex(w => w.id === selectedWall.id);
                  const formattedWallId = selectedWall.name || (wallIdx >= 0 ? `W-${wallIdx + 1}` : selectedWall.id);
                  return (
                    <div className="panel-field">
                      <span className="panel-label">Wall ID</span>
                      <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: "bold" }}>
                        {formattedWallId}
                        {selectedWall.id && selectedWall.id !== formattedWallId && (
                          <span style={{ fontSize: 10, color: "#64748b", marginLeft: 6, fontWeight: "normal" }}>({selectedWall.id})</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {selectedWallIds.length > 1 && (
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>
                    Selected: <b>{selectedWallIds.length} walls</b>
                  </div>
                )}

                {/* DYNAMIC SELECT ALL BUTTON - based on selected wall type */}
                {(() => {
                  const typeLabels = {
                    exterior_wall: { label: "Ext", color: "#0284c7" },
                    interior_wall: { label: "Int", color: "#6366f1" },
                    partition_wall: { label: "Part", color: "#8b5cf6" },
                    block_wall: { label: "Block", color: "#64748b" },
                  };

                  // Determine the type of currently selected wall
                  const selectedClass = selectedWall ? getWallClass(selectedWall) : null;
                  const sameTypeWalls = selectedClass
                    ? (walls || []).filter(w => getWallClass(w) === selectedClass)
                    : [];
                  const sameTypeCount = sameTypeWalls.length;
                  const typeInfo = typeLabels[selectedClass] || { label: selectedClass || "Wall", color: "#0284c7" };

                  // Check if all same-type walls are already selected
                  const allAlreadySelected = selectedWallIds.length === sameTypeCount && sameTypeCount > 0
                    && sameTypeWalls.every(w => selectedWallIds.includes(w.id));

                  return (
                    <div style={{ marginBottom: 10 }}>
                      {selectedClass && sameTypeCount > 1 && (
                        <button
                          className="rp-action-btn"
                          style={{
                            padding: "7px 12px",
                            fontSize: "12px",
                            fontWeight: 700,
                            background: allAlreadySelected ? "#10b981" : "var(--blue)",
                            color: "#ffffff",
                            width: "100%",
                            borderRadius: 6,
                            boxShadow: "0 2px 4px rgba(37,99,235,0.2)",
                            transition: "all 0.15s ease",
                          }}
                          onClick={() => {
                            const ids = sameTypeWalls.map(w => w.id);
                            if (typeof setSelectedWallIds === "function") setSelectedWallIds(ids);
                            if (typeof setSelectedType === "function") setSelectedType("wall");
                            if (typeof setSelectedId === "function") setSelectedId(ids[0]);
                          }}
                        >
                          {allAlreadySelected
                            ? `✓ All ${sameTypeCount} ${typeInfo.label} Walls Selected`
                            : `🎯 Select All ${typeInfo.label} Walls (${sameTypeCount})`
                          }
                        </button>
                      )}
                    </div>
                  );
                })()}

                <div className="panel-field">
                  <span className="panel-label">Wall Type</span>
                  {(() => {
                    const handleTypeChange = (newClass) => {
                      const targetIds = selectedWallIds.length > 0 ? [...selectedWallIds] : (selectedWall ? [selectedWall.id] : []);
                      if (targetIds.length === 0) return;
                      if (updateWallsProperty) {
                        updateWallsProperty(targetIds, "class_name", newClass);
                      }
                    };

                    // Get current type for display
                    const currentType = (() => {
                      if (selectedWallIds.length > 1) {
                        const types = new Set();
                        for (const id of selectedWallIds) {
                          const w = (walls || []).find(ww => ww.id === id);
                          if (w) {
                            types.add(getWallClass(w));
                          } else {
                            const bId = getBaseWallId ? getBaseWallId(id) : id;
                            const found = (walls || []).find(ww => (getBaseWallId ? getBaseWallId(ww.id) : ww.id) === bId);
                            if (found) types.add(getWallClass(found));
                          }
                        }
                        if (types.size === 0) return "exterior_wall";
                        if (types.size === 1) return [...types][0];
                        return "multiple";
                      }
                      return selectedWall ? getWallClass(selectedWall) : "exterior_wall";
                    })();

                    const isLbwSelected = (() => {
                      if (selectedWallIds.length > 1) {
                        return selectedWallIds.some(id => {
                          const w = (walls || []).find(ww => ww.id === id);
                          return w && Boolean(w.is_lbw || w.is_load_bearing || w.lbw);
                        });
                      }
                      return Boolean(selectedWall?.is_lbw || selectedWall?.is_load_bearing || selectedWall?.lbw);
                    })();

                    const handleToggleLbw = (checked) => {
                      const targetIds = selectedWallIds.length > 0 ? [...selectedWallIds] : (selectedWall ? [selectedWall.id] : []);
                      if (targetIds.length === 0) return;
                      if (updateWallsProperty) {
                        updateWallsProperty(targetIds, "is_lbw", checked);
                      }
                    };

                    // Use button group for multi-wall selection (immune to React controlled select re-render issues)
                    if (selectedWallIds.length > 1) {
                      const typeOptions = [
                        { value: "exterior_wall", label: "Ext" },
                        { value: "interior_wall", label: "Int" },
                        { value: "partition_wall", label: "Part" },
                        { value: "block_wall", label: "Block" },
                      ];
                      return (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, background: "var(--bg-panel)", padding: 3, borderRadius: 6, border: "1px solid var(--border)" }}>
                            {typeOptions.map(opt => (
                              <button
                                key={opt.value}
                                style={{
                                  padding: "6px 4px",
                                  fontSize: 11,
                                  fontWeight: currentType === opt.value ? 700 : 500,
                                  background: currentType === opt.value ? "var(--blue)" : "transparent",
                                  color: currentType === opt.value ? "#ffffff" : "var(--text-dim)",
                                  border: currentType === opt.value ? "1px solid transparent" : "1px solid transparent",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                }}
                                onClick={() => handleTypeChange(opt.value)}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          {/* LBW Toggle for Multi-Wall (Only when partition walls are selected) */}
                          {currentType === "partition_wall" && (
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 8px",
                              marginTop: "6px",
                              background: isLbwSelected ? "rgba(234, 88, 12, 0.08)" : "transparent",
                              border: isLbwSelected ? "1px solid #fdba74" : "1px dashed var(--border)",
                              borderRadius: "6px"
                            }}>
                              <span style={{ fontSize: "11px", fontWeight: 700, color: isLbwSelected ? "#c2410c" : "var(--text-main)" }}>
                                ⚡ Load-Bearing (LBW)
                              </span>
                              <input
                                type="checkbox"
                                checked={isLbwSelected}
                                onChange={(e) => handleToggleLbw(e.target.checked)}
                                style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#ea580c" }}
                              />
                            </div>
                          )}
                        </>
                      );
                    }

                    // Single wall: use select + LBW toggle (only for partition wall)
                    return (
                      <>
                        <select
                          className="panel-select"
                          value={currentType}
                          onChange={(e) => handleTypeChange(e.target.value)}
                        >
                          <option value="exterior_wall">Exterior Wall (ext)</option>
                          <option value="interior_wall">Interior Wall (int)</option>
                          <option value="partition_wall">Partition Wall (part)</option>
                          <option value="block_wall">Block Wall (block)</option>
                        </select>

                        {/* LBW Toggle ONLY shown when user selects Partition Wall */}
                        {currentType === "partition_wall" && (
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "6px 8px",
                            marginTop: "6px",
                            background: isLbwSelected ? "rgba(234, 88, 12, 0.08)" : "transparent",
                            border: isLbwSelected ? "1px solid #fdba74" : "1px dashed var(--border)",
                            borderRadius: "6px"
                          }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: isLbwSelected ? "#c2410c" : "var(--text-main)" }}>
                              ⚡ Load-Bearing Wall (LBW)
                            </span>
                            <input
                              type="checkbox"
                              checked={isLbwSelected}
                              onChange={(e) => handleToggleLbw(e.target.checked)}
                              style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#ea580c" }}
                            />
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="panel-field">
                  <span className="panel-label">Wall Thickness</span>
                  {(() => {
                    const handleThicknessChange = async (val) => {
                      const targetIds = selectedWallIds.length > 0 ? [...selectedWallIds] : (selectedWall ? [selectedWall.id] : []);
                      if (targetIds.length === 0) return;
                      if (val === "custom") {
                        setShowCustomThickness(true);
                        if (showPrompt) {
                          const input = await showPrompt("Enter custom wall thickness (mm) [Wall Thickness]:", String(currentThickness !== "multiple" ? currentThickness : 90));
                          if (input && !isNaN(parseInt(input, 10)) && parseInt(input, 10) > 0) {
                            const num = parseInt(input, 10);
                            if (updateWallsProperty) updateWallsProperty(targetIds, "thickness", num);
                          }
                        }
                        return;
                      }
                      setShowCustomThickness(false);
                      const numVal = parseInt(val, 10);
                      if (updateWallsProperty) {
                        updateWallsProperty(targetIds, "thickness", numVal);
                      }
                    };

                    const currentThickness = (() => {
                      if (selectedWallIds.length > 1) {
                        const vals = new Set();
                        for (const id of selectedWallIds) {
                          const w = (walls || []).find(ww => ww.id === id);
                          if (w) vals.add(w.thickness ?? 90);
                          else {
                            const bId = getBaseWallId ? getBaseWallId(id) : id;
                            const found = (walls || []).find(ww => (getBaseWallId ? getBaseWallId(ww.id) : ww.id) === bId);
                            if (found) vals.add(found.thickness ?? 90);
                          }
                        }
                        if (vals.size === 0) return 90;
                        if (vals.size === 1) return [...vals][0];
                        return "multiple";
                      }
                      return selectedWall?.thickness ?? 90;
                    })();

                    const isCustom = typeof currentThickness === "number" && ![70, 75, 90, 100, 110, 120, 140, 150, 190, 200].includes(currentThickness);

                    return (
                      <>
                        <select
                          className="panel-select"
                          value={currentThickness}
                          onChange={(e) => handleThicknessChange(e.target.value)}
                        >
                          {currentThickness === "multiple" && (
                            <option value="multiple" disabled>(Multiple thicknesses)</option>
                          )}
                          {[70, 75, 90, 100, 110, 120, 140, 150, 190, 200].map(v => (
                            <option key={v} value={v}>{v} mm</option>
                          ))}
                          {isCustom && (
                            <option value={currentThickness}>{currentThickness} mm (Custom)</option>
                          )}
                          <option value="custom">Custom...</option>
                        </select>
                      </>
                    );
                  })()}
                </div>

                <div className="panel-field">
                  <span className="panel-label">Wall Height</span>
                  {(() => {
                    const handleHeightChange = async (val) => {
                      const targetIds = selectedWallIds.length > 0 ? [...selectedWallIds] : (selectedWall ? [selectedWall.id] : []);
                      if (targetIds.length === 0) return;
                      if (val === "custom") {
                        setShowCustomHeight(true);
                        if (showPrompt) {
                          const input = await showPrompt("Enter custom wall height (mm) [Wall Height]:", String(currentHeight !== "multiple" ? currentHeight : 2700));
                          if (input && !isNaN(parseInt(input, 10)) && parseInt(input, 10) > 0) {
                            const num = parseInt(input, 10);
                            if (updateWallsProperty) updateWallsProperty(targetIds, "height", num);
                          }
                        }
                        return;
                      }
                      setShowCustomHeight(false);
                      const numVal = parseInt(val, 10);
                      if (updateWallsProperty) {
                        updateWallsProperty(targetIds, "height", numVal);
                      }
                    };

                    const currentHeight = (() => {
                      if (selectedWallIds.length > 1) {
                        const vals = new Set();
                        for (const id of selectedWallIds) {
                          const w = (walls || []).find(ww => ww.id === id);
                          if (w) vals.add(w.height ?? savedDefault);
                          else {
                            const bId = getBaseWallId ? getBaseWallId(id) : id;
                            const found = (walls || []).find(ww => (getBaseWallId ? getBaseWallId(ww.id) : ww.id) === bId);
                            if (found) vals.add(found.height ?? savedDefault);
                          }
                        }
                        if (vals.size === 0) return savedDefault;
                        if (vals.size === 1) return [...vals][0];
                        return "multiple";
                      }
                      return selectedWall?.height ?? savedDefault;
                    })();

                    const isCustom = typeof currentHeight === "number" && ![2400, 2700, 3000, 3300, 3600].includes(currentHeight);

                    return (
                      <>
                        <select
                          className="panel-select"
                          value={currentHeight}
                          onChange={(e) => handleHeightChange(e.target.value)}
                        >
                          {currentHeight === "multiple" && (
                            <option value="multiple" disabled>(Multiple heights)</option>
                          )}
                          {[2400, 2700, 3000, 3300, 3600].map(v => (
                            <option key={v} value={v}>{v} mm ({(v / 1000).toFixed(1)} m)</option>
                          ))}
                          {isCustom && (
                            <option value={currentHeight}>{currentHeight} mm (Custom)</option>
                          )}
                          <option value="custom">Custom...</option>
                        </select>
                      </>
                    );
                  })()}
                </div>

                {/* FLOOR BASE TYPE SELECTOR (Slab Floor vs Timber Floor) */}
                <div style={{ marginTop: 12, marginBottom: 8 }}>
                  <span className="panel-label" style={{ fontWeight: 700, color: "var(--blue-700)", marginBottom: 6, display: "block" }}>
                    🪵 FLOOR BASE TYPE
                  </span>
                  {(() => {
                    const targetIds = selectedWallIds.length > 0 ? selectedWallIds : (selectedWall ? [selectedWall.id] : []);
                    const targetWalls = (walls || []).filter(w => targetIds.includes(w.id));
                    const firstType = targetWalls[0]?.floor_type || "Timber";
                    const isMixed = targetWalls.length > 1 && targetWalls.some(w => (w.floor_type || "Timber") !== firstType);
                    const currentFloorType = isMixed ? "multiple" : firstType;

                    const floorOptions = [
                      { value: "Timber", label: "Timber Floor" },
                      { value: "Slab", label: "Concrete Slab" }
                    ];

                    return (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: "var(--bg-panel)", padding: 3, borderRadius: 6, border: "1px solid var(--border)" }}>
                          {floorOptions.map(opt => {
                            const isActive = currentFloorType === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                style={{
                                  padding: "7px 6px",
                                  fontSize: 12,
                                  fontWeight: isActive ? 700 : 500,
                                  background: isActive ? "var(--blue)" : "transparent",
                                  color: isActive ? "#ffffff" : "var(--text-dim)",
                                  border: isActive ? "1px solid var(--blue)" : "1px solid transparent",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  boxShadow: isActive ? "0 1px 4px rgba(37,99,235,0.25)" : "none",
                                  transition: "all 0.15s ease",
                                }}
                                onClick={() => {
                                  if (targetIds.length > 0 && updateWallsProperty) {
                                    updateWallsProperty(targetIds, "floor_type", opt.value);
                                  }
                                }}
                              >
                                {isActive ? `✓ ${opt.label}` : opt.label}
                              </button>
                            );
                          })}
                        </div>
                        {isMixed && (
                          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4, fontStyle: "italic", textAlign: "center" }}>
                            Multiple Floor Types selected. Click a floor type above to unify.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {selectedWallIds.length === 1 && selectedWall && selectedWallLengthM !== null && (
                  <div className="panel-field">
                    <span className="panel-label">Wall Length</span>
                    <div className="panel-value" style={{ fontSize: 13, color: "var(--text)" }}>
                      <b>{selectedWallLengthM.toFixed(2)}</b> m
                    </div>
                  </div>
                )}

                {/* DUAL-FACE WALL FINISHES & SKIRTING PROPERTIES (CAD/BIM FEATURE 4) */}
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--blue-700)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>🧱 SURFACE FINISH & SKIRTING SYSTEM</span>
                  </div>

                  {(() => {
                    const wallClass = selectedWall ? getWallClass(selectedWall) : "interior_wall";
                    const isExteriorWall = wallClass === "exterior_wall" || wallClass === "block_wall";

                    let isSideAHidden = false;
                    let isSideBHidden = false;

                    if (isExteriorWall && selectedWall && selectedWall.centerline && selectedWall.centerline.length === 2) {
                      const p1 = selectedWall.centerline[0];
                      const p2 = selectedWall.centerline[1];
                      const flipSides = Boolean(selectedWall.flipSides || selectedWall.skirting?.flipSides);
                      const { sideASign, sideBSign } = getWallSideOffsets(p1, p2, flipSides);
                      const midX = (p1[0] + p2[0]) / 2;
                      const midY = (p1[1] + p2[1]) / 2;
                      const dx = p2[0] - p1[0];
                      const dy = p2[1] - p1[1];
                      const len = Math.hypot(dx, dy) || 1;
                      const nx = -dy / len;
                      const ny = dx / len;
                      const thick = selectedWall.thickness_px || 20;

                      const isOutdoorRoom = (r) => {
                        if (!r) return false;
                        const nameStr = typeof r === "string" ? r : (r.room_name || r.roomName || r.name || r.label || "");
                        const typeStr = typeof r === "object" ? (r.room_type || r.type || r.category || "") : "";
                        const combined = `${nameStr} ${typeStr}`.toLowerCase().trim();
                        return combined === "0" || combined === "room_0" || combined === "" || /(balcony|deck|desk|alfresco|patio|porch|verandah|terrace|courtyard|outdoor|yard|carport|timber_deck|void|exterior)/i.test(combined);
                      };

                      const isPointInPoly = (px, py, poly) => {
                        if (!poly || poly.length < 3) return false;
                        let inside = false;
                        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                          const xi = poly[i][0] ?? poly[i].x, yi = poly[i][1] ?? poly[i].y;
                          const xj = poly[j][0] ?? poly[j].x, yj = poly[j][1] ?? poly[j].y;
                          if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi)) inside = !inside;
                        }
                        return inside;
                      };

                      let hasRoomA = false;
                      for (const off of [5, 15, 30]) {
                        const testX = midX + nx * sideASign * ((thick / 2) + off);
                        const testY = midY + ny * sideASign * ((thick / 2) + off);
                        for (const r of (rooms || [])) {
                          const poly = r.polygon || r.points || [];
                          if (poly.length >= 3 && isPointInPoly(testX, testY, poly)) {
                            if (!isOutdoorRoom(r)) { hasRoomA = true; break; }
                          }
                        }
                        if (hasRoomA) break;
                      }
                      isSideAHidden = !hasRoomA;

                      let hasRoomB = false;
                      for (const off of [5, 15, 30]) {
                        const testX = midX + nx * sideBSign * ((thick / 2) + off);
                        const testY = midY + ny * sideBSign * ((thick / 2) + off);
                        for (const r of (rooms || [])) {
                          const poly = r.polygon || r.points || [];
                          if (poly.length >= 3 && isPointInPoly(testX, testY, poly)) {
                            if (!isOutdoorRoom(r)) { hasRoomB = true; break; }
                          }
                        }
                        if (hasRoomB) break;
                      }
                      isSideBHidden = !hasRoomB;
                    }

                    const isHorizWall = (() => {
                      if (!selectedWall || !selectedWall.centerline || selectedWall.centerline.length !== 2) return true;
                      const p1 = selectedWall.centerline[0];
                      const p2 = selectedWall.centerline[1];
                      return Math.abs(p2[0] - p1[0]) >= Math.abs(p2[1] - p1[1]);
                    })();

                    const sideATitle = isHorizWall ? "Side A (Front Face)" : "Side A (Left Face)";
                    const sideBTitle = isHorizWall ? "Side B (Back Face)" : "Side B (Right Face)";

                    return (
                      <>
                        {/* Side A Card */}
                        {!isSideAHidden && (
                          <div style={{ background: "var(--bg-panel)", padding: "10px 12px", borderRadius: "6px", marginBottom: 10, border: "1px solid var(--border)" }}>
                            <div style={{ marginBottom: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--blue-700)" }}>{sideATitle}</span>
                            </div>

                            {/* Row 1: Type (Finish Type) */}
                            <div className="panel-field" style={{ marginBottom: 8 }}>
                              <span className="panel-label">type</span>
                              <select
                                className="panel-select"
                                value={selectedWall?.surface?.sideA?.finishType || selectedWall?.finishTypeSideA || "none"}
                                onChange={(e) => {
                                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                                  updateWallsProperty && updateWallsProperty(targetIds, "finishTypeSideA", e.target.value);
                                  updateWallsProperty && updateWallsProperty(targetIds, "surface.sideA.finishType", e.target.value);
                                }}
                              >
                                {getFinishTypeOptions().map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>

                            {/* Row 2: Grid 3 Columns for height, thickness & color */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                              <div className="panel-field">
                                <span className="panel-label">height</span>
                                <input
                                  type="number"
                                  className="panel-input"
                                  style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid var(--border)", background: "#ffffff", color: "var(--text)", boxSizing: "border-box" }}
                                  value={selectedWall?.skirting?.sideA?.height ?? selectedWall?.skirting?.height ?? 100}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                                    const rawVal = e.target.value;
                                    const val = rawVal === "" ? 0 : Number(rawVal);
                                    updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideA.height", val);
                                  }}
                                />
                              </div>
                              <div className="panel-field">
                                <span className="panel-label">thickness</span>
                                <input
                                  type="number"
                                  className="panel-input"
                                  style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid var(--border)", background: "#ffffff", color: "var(--text)", boxSizing: "border-box" }}
                                  value={selectedWall?.skirting?.sideA?.thickness ?? selectedWall?.skirting?.thickness ?? 15}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                                    const rawVal = e.target.value;
                                    const val = rawVal === "" ? 0 : Number(rawVal);
                                    updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideA.thickness", val);
                                  }}
                                />
                              </div>
                              <div className="panel-field">
                                <span className="panel-label">color</span>
                                <input
                                  type="color"
                                  style={{ width: "100%", height: "30px", padding: "2px 4px", border: "1px solid var(--border)", borderRadius: "4px", cursor: "pointer", background: "#ffffff", boxSizing: "border-box" }}
                                  value={selectedWall?.skirting?.sideA?.color || selectedWall?.skirting?.color || "#854d0e"}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                                    updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideA.color", e.target.value);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Side B Card */}
                        {!isSideBHidden && (
                          <div style={{ background: "var(--bg-panel)", padding: "10px 12px", borderRadius: "6px", marginBottom: 10, border: "1px solid var(--border)" }}>
                            <div style={{ marginBottom: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--blue-700)" }}>{sideBTitle}</span>
                            </div>

                            {/* Row 1: Type (Finish Type) */}
                            <div className="panel-field" style={{ marginBottom: 8 }}>
                              <span className="panel-label">type</span>
                              <select
                                className="panel-select"
                                value={selectedWall?.surface?.sideB?.finishType || selectedWall?.finishTypeSideB || "none"}
                                onChange={(e) => {
                                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                                  updateWallsProperty && updateWallsProperty(targetIds, "finishTypeSideB", e.target.value);
                                  updateWallsProperty && updateWallsProperty(targetIds, "surface.sideB.finishType", e.target.value);
                                }}
                              >
                                {getFinishTypeOptions().map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>

                            {/* Row 2: Grid 3 Columns for height, thickness & color */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                              <div className="panel-field">
                                <span className="panel-label">height</span>
                                <input
                                  type="number"
                                  className="panel-input"
                                  style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid var(--border)", background: "#ffffff", color: "var(--text)", boxSizing: "border-box" }}
                                  value={selectedWall?.skirting?.sideB?.height ?? selectedWall?.skirting?.height ?? 100}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                                    const rawVal = e.target.value;
                                    const val = rawVal === "" ? 0 : Number(rawVal);
                                    updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideB.height", val);
                                  }}
                                />
                              </div>
                              <div className="panel-field">
                                <span className="panel-label">thickness</span>
                                <input
                                  type="number"
                                  className="panel-input"
                                  style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid var(--border)", background: "#ffffff", color: "var(--text)", boxSizing: "border-box" }}
                                  value={selectedWall?.skirting?.sideB?.thickness ?? selectedWall?.skirting?.thickness ?? 15}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                                    const rawVal = e.target.value;
                                    const val = rawVal === "" ? 0 : Number(rawVal);
                                    updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideB.thickness", val);
                                  }}
                                />
                              </div>
                              <div className="panel-field">
                                <span className="panel-label">color</span>
                                <input
                                  type="color"
                                  style={{ width: "100%", height: "30px", padding: "2px 4px", border: "1px solid var(--border)", borderRadius: "4px", cursor: "pointer", background: "#ffffff", boxSizing: "border-box" }}
                                  value={selectedWall?.skirting?.sideB?.color || selectedWall?.skirting?.color || "#854d0e"}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                                    updateWallsProperty && updateWallsProperty(targetIds, "skirting.sideB.color", e.target.value);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* GLOBAL SKIRTING SETTINGS & BULK EDIT */}
                  <div style={{ background: "var(--bg-panel)", padding: "10px 12px", borderRadius: "6px", marginBottom: 10, border: "1px solid var(--border)" }}>
                    {/* BULK SELECTION & QUICK PRESETS BAR */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <button
                        className="rp-action-btn"
                        style={{
                          background: (selectedWallIds.length === (walls || []).length && (walls || []).length > 0) ? "#10b981" : "var(--blue)",
                          color: "#ffffff",
                          padding: "7px 8px",
                          fontSize: "11px",
                          fontWeight: 700,
                          width: "100%",
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          boxShadow: "0 2px 4px rgba(37,99,235,0.2)"
                        }}
                        onClick={() => {
                          const isAllSelected = selectedWallIds.length === (walls || []).length && (walls || []).length > 0;
                          if (isAllSelected) {
                            const targetId = lastSingleWallIdRef.current || selectedWall?.id || (selectedWallIds.length > 0 ? selectedWallIds[0] : null);
                            if (targetId) {
                              if (typeof setSelectedWallIds === "function") setSelectedWallIds([targetId]);
                              if (typeof setSelectedType === "function") setSelectedType("wall");
                              if (typeof setSelectedId === "function") setSelectedId(targetId);
                            } else {
                              if (typeof setSelectedWallIds === "function") setSelectedWallIds([]);
                            }
                          } else {
                            if (selectedWall?.id) {
                              lastSingleWallIdRef.current = selectedWall.id;
                            }
                            const allIds = (walls || []).map(w => w.id);
                            const activeId = lastSingleWallIdRef.current || selectedWall?.id || (allIds.length > 0 ? allIds[0] : null);
                            if (typeof setSelectedWallIds === "function") setSelectedWallIds(allIds);
                            if (typeof setSelectedType === "function") setSelectedType("wall");
                            if (activeId && typeof setSelectedId === "function") setSelectedId(activeId);
                          }
                        }}
                      >
                        {(selectedWallIds.length === (walls || []).length && (walls || []).length > 0)
                          ? `✓ ALL ${(walls || []).length} SKIRTINGS SELECTED (CLICK TO UNSELECT)`
                          : `🎯 SELECT ALL ${(walls || []).length} SKIRTINGS (EDIT ALL)`}
                      </button>

                      {selectedWallIds.length > 1 && (
                        <div style={{ background: "rgba(16, 185, 129, 0.12)", padding: "6px 8px", borderRadius: "4px", border: "1px solid rgba(16, 185, 129, 0.3)", fontSize: "10px", color: "var(--green)" }}>
                          ⚡ Bulk editing <b>{selectedWallIds.length}</b> skirtings simultaneously.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CALCULATED METRICS CARD */}
                  {selectedWallIds.length === 1 && selectedWallMetrics && (
                    <div style={{ background: "#eff6ff", padding: "10px 12px", borderRadius: "6px", marginTop: 10, border: "1px solid #bfdbfe" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", marginBottom: 6 }}>📏 CALCULATED METRICS (BOQ)</div>
                      <div style={{ fontSize: 11, color: "#334155", display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span>Skirting (2-Face + Open Ends):</span>
                        <b style={{ color: "#b45309" }}>{selectedWallMetrics.skirtingLengthLm.toFixed(2)} m</b>
                      </div>
                      {selectedWallMetrics.freeEndsCount > 0 && (
                        <div style={{ fontSize: 10, color: "#64748b", fontStyle: "italic", marginBottom: 4 }}>
                          (Includes {selectedWallMetrics.freeEndsCount} open ends +{selectedWallMetrics.endCapsLengthMm}mm)
                        </div>
                      )}
                      {selectedWallMetrics.sideA.finishType !== "none" && (
                        <div style={{ fontSize: 11, color: "#334155", display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span>Side A ({selectedWallMetrics.sideA.finishType}):</span>
                          <b style={{ color: "#1d4ed8" }}>{selectedWallMetrics.sideA.netAreaM2.toFixed(2)} m²</b>
                        </div>
                      )}
                      {selectedWallMetrics.sideB.finishType !== "none" && (
                        <div style={{ fontSize: 11, color: "#cbd5e1", display: "flex", justifyContent: "space-between" }}>
                          <span>Side B ({selectedWallMetrics.sideB.finishType}):</span>
                          <b style={{ color: "#38bdf8" }}>{selectedWallMetrics.sideB.netAreaM2.toFixed(2)} m²</b>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── WALL ACTION BUTTONS: EXPORT & DELETE ── */}
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" }}>
                    📤 Xuất Dữ Liệu Tường (Export Output)
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="rp-action-btn"
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        background: "var(--blue)",
                        color: "#ffffff",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        boxShadow: "0 1px 3px rgba(37,99,235,0.2)"
                      }}
                      onClick={() => {
                        const targetIds = selectedWallIds.length > 0 ? selectedWallIds : (selectedWall ? [selectedWall.id] : []);
                        exportWallExcel(targetIds.length > 0 ? targetIds : null);
                      }}
                      title="Xuất bảng tính Excel khối lượng và kích thước của tường đã chọn"
                    >
                      <span>📊 Xuất Excel (.xlsx)</span>
                    </button>
                    {/* Debug raw wall JSON export */}
                    <button
                      type="button"
                      className="rp-action-btn"
                      style={{
                        padding: "8px 12px",
                        fontSize: "11px",
                        fontWeight: 700,
                        background: "#f1f5f9",
                        color: "#334155",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px"
                      }}
                      onClick={() => {
                        const targetIds = selectedWallIds.length > 0 ? selectedWallIds : (selectedWall ? [selectedWall.id] : []);
                        exportWallJson(targetIds.length > 0 ? targetIds : null);
                      }}
                      title="Xuất file JSON / EZPlan của tường đã chọn"
                    >
                      <span>📄 JSON</span>
                    </button>

                  </div>

                  <button
                    type="button"
                    className="rp-action-btn rp-action-btn--danger"
                    style={{
                      padding: "8px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      width: "100%",
                      cursor: "pointer",
                      marginTop: 2
                    }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const targetIds = selectedWallIds.length > 0 ? selectedWallIds : (selectedWall ? [selectedWall.id] : []);
                      if (targetIds.length === 0) return;
                      const count = targetIds.length;
                      if (await showConfirm(`Are you sure you want to delete ${count > 1 ? `${count} selected walls` : "this wall"}?`)) {
                        if (deleteWalls) {
                          deleteWalls(targetIds);
                        } else if (deleteItem) {
                          deleteItem();
                        }
                        if (setSelectedWallIds) setSelectedWallIds([]);
                        if (setSelectedId) setSelectedId(null);
                        if (setSelectedType) setSelectedType(null);
                      }
                    }}
                  >
                    🗑️ Delete {selectedWallIds.length > 1 ? `${selectedWallIds.length} Selected Walls` : "Selected Wall"}
                  </button>
                </div>
              </>
            ) : (selectedType === "door" || selectedType === "window") && selectedDoor ? (
              (() => {
                const isSelectedWindow = (selectedDoor.type === 'window' ||
                  selectedDoor.class === 'window' ||
                  selectedDoor.doorTypeId === 'win_standard' ||
                  (selectedDoor.doorName && selectedDoor.doorName.startsWith('W-'))) &&
                  selectedDoor.class !== 'sliding_door' && selectedDoor.type !== 'sliding';

                if (isSelectedWindow) {
                  const effectiveWindowWidthMm = getDoorWindowDisplayWidthMm(selectedDoor, realScale, scaleValue);

                  const effectiveWindowHeightMm = selectedDoor.height_mm || 1200;

                  return (
                    <>
                      <div className="panel-field">
                        <span className="panel-label">Window ID</span>
                        <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: "bold" }}>
                          {selectedDoor.id}
                        </div>
                      </div>

                      <div className="panel-field">
                        <span className="panel-label">Window Name</span>
                        <input
                          className="panel-input"
                          value={selectedDoor.door_name || ""}
                          onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, door_name: e.target.value })}
                        />
                      </div>

                      <div className="panel-field">
                        <span className="panel-label">Window Type</span>
                        <select
                          className="panel-select"
                          value={selectedDoor.doorTypeId || selectedDoor.penetration_type || selectedDoor.penetrationType || "win_standard"}
                          onChange={(e) => {
                            const typeId = e.target.value;
                            const def = DOOR_TYPE_REGISTRY[typeId];
                            updateDoor && updateDoor({
                              ...selectedDoor,
                              doorTypeId: typeId,
                              penetration_type: def?.renderClass || 'window',
                              class: def?.renderClass || 'window',
                              type: def?.doorType || 'window'
                            });
                          }}
                        >
                          {getDoorTypeOptions().filter(o => {
                            const def = DOOR_TYPE_REGISTRY[o.value];
                            return def?.doorType === 'window' || def?.renderClass === 'window' || o.value.includes('win_');
                          }).map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="panel-field">
                        <span className="panel-label">Material</span>
                        <select
                          className="panel-select"
                          value={selectedDoor.material || "glass"}
                          onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, material: e.target.value })}
                        >
                          <option value="glass">Glass</option>
                          <option value="aluminum">Aluminum</option>
                          <option value="timber">Timber</option>
                        </select>
                      </div>

                      <div className="panel-field">
                        <span className="panel-label">Status</span>
                        <select
                          className="panel-select"
                          value={selectedDoor.status || "active"}
                          onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, status: e.target.value })}
                        >
                          <option value="active">Active</option>
                          <option value="deleted">Deleted</option>
                          <option value="superseded">Superseded</option>
                        </select>
                      </div>

                      <div className="panel-field">
                        <span className="panel-label">Width (mm)</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="number"
                            className="panel-input"
                            style={{ flex: 1 }}
                            value={effectiveWindowWidthMm}
                            onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value), width_source: "manual" })}
                          />
                          <select
                            className="panel-select"
                            style={{ width: '100px' }}
                            value={effectiveWindowWidthMm || ""}
                            onChange={(e) => {
                              if (e.target.value) {
                                updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value), width_source: "manual" });
                              }
                            }}
                          >
                            <option value="">Presets</option>
                            <option value={600}>600</option>
                            <option value={900}>900</option>
                            <option value={1200}>1200</option>
                            <option value={1500}>1500</option>
                            <option value={1800}>1800</option>
                            <option value={2100}>2100</option>
                            <option value={2400}>2400</option>
                            <option value={2700}>2700</option>
                            <option value={3000}>3000</option>
                          </select>
                        </div>
                      </div>

                      <div className="panel-field">
                        <span className="panel-label">Height (mm)</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="number"
                            className="panel-input"
                            style={{ flex: 1 }}
                            value={effectiveWindowHeightMm}
                            onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, height_mm: Number(e.target.value) })}
                          />
                          <select
                            className="panel-select"
                            style={{ width: '100px' }}
                            value={effectiveWindowHeightMm || ""}
                            onChange={(e) => {
                              if (e.target.value) {
                                updateDoor && updateDoor({ ...selectedDoor, height_mm: Number(e.target.value) });
                              }
                            }}
                          >
                            <option value="">Presets</option>
                            <option value={600}>600</option>
                            <option value={900}>900</option>
                            <option value={1200}>1200</option>
                            <option value={1500}>1500</option>
                            <option value={1800}>1800</option>
                            <option value={2100}>2100</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <button className="rp-action-btn rp-action-btn--danger" onClick={async (e) => {
                          e.stopPropagation();
                          if (await showConfirm("Are you sure you want to delete this window?")) {
                            deleteDoor && deleteDoor(selectedDoor.id);
                          }
                        }}
                        >
                          Delete Selected Window
                        </button>
                      </div>
                    </>
                  );
                }

                const parentWall = selectedDoor.parentWallId ? walls.find(w => w.id === selectedDoor.parentWallId) : null;
                const isParentWallExt = parentWall && (parentWall.class_name === 'exterior_wall' || parentWall.type === 'ext' || parentWall.is_ext || parentWall.is_exterior);
                const isExt = Boolean(
                  selectedDoor.is_ext || selectedDoor.is_exterior || selectedDoor.location === 'external' || isParentWallExt ||
                  (selectedDoor.class || '').includes('ext') || (selectedDoor.door_name || selectedDoor.doorName || '').toLowerCase().includes('external')
                );
                const category = isExt ? 'external' : 'internal';
                const isSlidingClass = selectedDoor.type === 'sliding' ||
                  (selectedDoor.class && (selectedDoor.class.includes('sliding') || selectedDoor.class.includes('slider'))) ||
                  (selectedDoor.penetration_type && (selectedDoor.penetration_type.includes('sliding') || selectedDoor.penetration_type.includes('slider'))) ||
                  (selectedDoor.door_name || selectedDoor.doorName || '').toLowerCase().includes('slider');

                let activeDoorTypeId = selectedDoor.doorTypeId;
                if (!activeDoorTypeId || !DOOR_TYPE_REGISTRY[activeDoorTypeId] || (isSlidingClass && activeDoorTypeId.includes('hinged'))) {
                  activeDoorTypeId = resolveDoorTypeId(isSlidingClass ? 'sliding' : (selectedDoor.doorTypeId || selectedDoor.class || selectedDoor.type || selectedDoor.penetration_type), category);
                }

                const effectiveDoorWidthMm = getDoorWindowDisplayWidthMm(selectedDoor, realScale, scaleValue);

                const effectiveDoorHeightMm = selectedDoor.height_mm || 1980;

                return (
                  <>
                    <div className="panel-field">
                      <span className="panel-label">Door ID</span>
                      <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: "bold" }}>
                        {selectedDoor.id}
                      </div>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Door Name</span>
                      <input
                        className="panel-input"
                        value={selectedDoor.door_name || ""}
                        onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, door_name: e.target.value })}
                      />
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Door Type</span>
                      <select
                        className="panel-select"
                        value={activeDoorTypeId}
                        onChange={(e) => {
                          const typeId = e.target.value;
                          const def = DOOR_TYPE_REGISTRY[typeId];
                          const isExtType = def?.category === 'external' || typeId.startsWith('ext_');
                          updateDoor && updateDoor({
                            ...selectedDoor,
                            doorTypeId: typeId,
                            is_ext: isExtType,
                            is_exterior: isExtType,
                            location: isExtType ? 'external' : 'internal',
                            penetration_type: def?.renderClass || 'single_door',
                            class: def?.renderClass || 'single_door',
                            type: def?.doorType || 'single'
                          });
                        }}
                      >
                        <optgroup label="External Penetrations">
                          {getDoorTypeOptions().filter(o => {
                            const def = DOOR_TYPE_REGISTRY[o.value];
                            const isWin = def?.doorType === 'window' || def?.renderClass === 'window' || o.value.includes('win_');
                            return o.category === 'external' && !isWin;
                          }).map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Internal Penetrations">
                          {getDoorTypeOptions().filter(o => {
                            const def = DOOR_TYPE_REGISTRY[o.value];
                            const isWin = def?.doorType === 'window' || def?.renderClass === 'window' || o.value.includes('win_');
                            return o.category === 'internal' && !isWin;
                          }).map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Hardware Type</span>
                      <select
                        className="panel-select"
                        value={selectedDoor.hardwareType || selectedDoor.hardware_type || "passage"}
                        onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, hardwareType: e.target.value, hardware_type: e.target.value })}
                      >
                        {HARDWARE_TYPES.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Material</span>
                      <select
                        className="panel-select"
                        value={selectedDoor.material || "timber"}
                        onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, material: e.target.value })}
                      >
                        {MATERIAL_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Fire Rating</span>
                      <select
                        className="panel-select"
                        value={selectedDoor.fireRating || "none"}
                        onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, fireRating: e.target.value })}
                      >
                        {FIRE_RATING_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Status</span>
                      <select
                        className="panel-select"
                        value={selectedDoor.status || "active"}
                        onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, status: e.target.value })}
                      >
                        <option value="active">Active</option>
                        <option value="deleted">Deleted</option>
                        <option value="superseded">Superseded</option>
                      </select>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Width (mm)</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="number"
                          className="panel-input"
                          style={{ flex: 1 }}
                          value={effectiveDoorWidthMm}
                          onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value), width_source: "manual" })}
                        />
                        <select
                          className="panel-select"
                          style={{ width: '100px' }}
                          value={effectiveDoorWidthMm || ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value), width_source: "manual" });
                            }
                          }}
                        >
                          <option value="">Presets</option>
                          <option value={520}>520</option>
                          <option value={620}>620</option>
                          <option value={720}>720</option>
                          <option value={760}>760</option>
                          <option value={820}>820</option>
                          <option value={870}>870</option>
                          <option value={920}>920</option>
                          <option value={1020}>1020</option>
                          <option value={1520}>1520</option>
                          <option value={1640}>1640</option>
                          <option value={1800}>1800</option>
                          <option value={2400}>2400</option>
                          <option value={5000}>5000</option>
                        </select>
                      </div>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Height (mm)</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="number"
                          className="panel-input"
                          style={{ flex: 1 }}
                          value={effectiveDoorHeightMm}
                          onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, height_mm: Number(e.target.value) })}
                        />
                        <select
                          className="panel-select"
                          style={{ width: '100px' }}
                          value={effectiveDoorHeightMm || ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              updateDoor && updateDoor({ ...selectedDoor, height_mm: Number(e.target.value) });
                            }
                          }}
                        >
                          <option value="">Presets</option>
                          <option value={1980}>1980</option>
                          <option value={2040}>2040</option>
                          <option value={2100}>2100</option>
                          <option value={2200}>2200</option>
                          <option value={2340}>2340</option>
                          <option value={2400}>2400</option>
                        </select>
                      </div>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Hinge Side</span>
                      <select
                        className="panel-select"
                        value={selectedDoor.hinge_side || selectedDoor.hingeSide || "left"}
                        onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, hinge_side: e.target.value, hingeSide: e.target.value })}
                      >
                        <option value="left">Left Hinge</option>
                        <option value="right">Right Hinge</option>
                      </select>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Swing</span>
                      <select
                        className="panel-select"
                        value={selectedDoor.swing_direction || selectedDoor.swing || "inward"}
                        onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, swing_direction: e.target.value, swing: e.target.value })}
                      >
                        <option value="inward">Inward Swing</option>
                        <option value="outward">Outward Swing</option>
                      </select>
                    </div>


                  </>
                );
              })()
            ) : selectedType === "lintel" ? (
              (() => {
                const pageLintels = lintelsByPage[currentPage] || [];
                const selectedLintel = pageLintels.find(l => l.id === selectedId);
                if (!selectedLintel) return <div className="panel-hint" style={{ padding: "8px 0" }}>Lintel not found.</div>;

                return (
                  <>
                    <div className="panel-field">
                      <span className="panel-label">Lintel ID</span>
                      <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: "bold" }}>
                        {selectedLintel.id}
                      </div>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Structural Category</span>
                      <select
                        className="panel-input"
                        value={selectedLintel.category || "lintel"}
                        onChange={(e) => {
                          if (lintelController) {
                            lintelController.updateLintel({
                              ...selectedLintel,
                              category: e.target.value
                            });
                          }
                        }}
                      >
                        <option value="lintel">Lintel (L)</option>
                        <option value="beam">Beam (B)</option>
                        <option value="bh">BH (BH)</option>
                      </select>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Size</span>
                      <div style={{ fontSize: 13 }}>
                        {selectedLintel.height}x{selectedLintel.width} mm
                      </div>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Ply</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="1"
                        className="panel-input"
                        onWheel={(e) => e.currentTarget.blur()}
                        value={selectedLintel.ply || ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? "" : parseInt(e.target.value);
                          if (val === "" || (!isNaN(val) && val > 0)) {
                            if (lintelController) {
                              lintelController.updateLintel({
                                ...selectedLintel,
                                ply: val === "" ? null : val
                              });
                            }
                          }
                        }}
                      />
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Global Length Offset (m)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="panel-input"
                        onWheel={(e) => e.currentTarget.blur()}
                        value={lintelController && lintelController.globalLengthOffset !== undefined ? lintelController.globalLengthOffset : 0}
                        onChange={(e) => {
                          const offset = parseFloat(e.target.value) || 0;
                          if (lintelController) {
                            lintelController.updateGlobalLengthOffset(offset);
                          }
                        }}
                      />
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Measured Length (m)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={Boolean(selectedLintel.isRounded)}
                        title={selectedLintel.isRounded ? "Click 'Revert Round' below to edit measured length" : "Enter measured length in metres"}
                        className="panel-input"
                        style={{
                          fontSize: 15,
                          color: selectedLintel.isRounded ? "#64748b" : "#3b82f6",
                          fontWeight: "bold",
                          cursor: selectedLintel.isRounded ? "not-allowed" : "text",
                          opacity: selectedLintel.isRounded ? 0.65 : 1,
                          background: selectedLintel.isRounded ? "rgba(15, 23, 42, 0.5)" : undefined
                        }}
                        onWheel={(e) => e.currentTarget.blur()}
                        value={selectedLintel.measuredLength !== undefined && selectedLintel.measuredLength !== "" ? (typeof selectedLintel.measuredLength === 'number' ? Number(selectedLintel.measuredLength.toFixed(3)) : selectedLintel.measuredLength) : ""}
                        onChange={(e) => {
                          if (selectedLintel.isRounded) return;
                          const raw = e.target.value;
                          if (raw === "") {
                            if (lintelController) {
                              lintelController.updateLintel({
                                ...selectedLintel,
                                measuredLength: ""
                              });
                            }
                            return;
                          }
                          const val = parseFloat(raw);
                          if (!isNaN(val) && val >= 0) {
                            if (lintelController) {
                              const offset = selectedLintel.lengthOffset !== undefined ? selectedLintel.lengthOffset : (lintelController.globalLengthOffset || 0);
                              lintelController.updateLintel({
                                ...selectedLintel,
                                baseLength: Math.max(0.01, val - offset),
                                measuredLength: val
                              });
                            }
                          }
                        }}
                        onBlur={() => {
                          if (selectedLintel.measuredLength === "" || selectedLintel.measuredLength === undefined || selectedLintel.measuredLength === null) {
                            if (lintelController) {
                              const offset = selectedLintel.lengthOffset !== undefined ? selectedLintel.lengthOffset : (lintelController.globalLengthOffset || 0);
                              const restoreVal = (selectedLintel.baseLength || 0.3) + offset;
                              lintelController.updateLintel({
                                ...selectedLintel,
                                measuredLength: restoreVal
                              });
                            }
                          }
                        }}
                      />
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Final Length (Rounded)</span>
                      <div style={{ fontSize: 18, color: "#f59e0b", fontWeight: "bold" }}>
                        {typeof selectedLintel.finalLength === 'number' ? `${selectedLintel.finalLength.toFixed(3)} m` : (selectedLintel.finalLength || "0.000 m")}
                      </div>
                      <button
                        className="rp-action-btn"
                        style={{
                          padding: '6px 8px',
                          fontSize: '11px',
                          background: selectedLintel.isRounded ? '#1e293b' : '#f59e0b',
                          marginTop: '6px',
                          marginBottom: 0,
                          width: '100%',
                          cursor: 'pointer',
                          border: selectedLintel.isRounded ? '1px solid rgba(255,255,255,0.2)' : 'none',
                          color: selectedLintel.isRounded ? '#38bdf8' : '#fff'
                        }}
                        onClick={() => {
                          if (lintelController) {
                            lintelController.roundSingleLintel(selectedLintel.id);
                          }
                        }}
                        title={selectedLintel.isRounded ? "Click to revert to original measured length" : "Round this lintel's length to the nearest 0.3m increment"}
                      >
                        {selectedLintel.isRounded ? " Revert Round" : " Round "}
                      </button>
                    </div>

                    <div className="panel-field">
                      <span className="panel-label">Parent Wall ID</span>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {selectedLintel.wallId || "None (Standalone)"}
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <button className="rp-action-btn rp-action-btn--danger" onClick={async (e) => {
                        e.stopPropagation();
                        if (await showConfirm("Are you sure you want to delete this lintel?")) {
                          if (lintelController) {
                            lintelController.deleteLintel(selectedLintel.id);
                          } else {
                            deleteItem && deleteItem();
                          }
                        }
                      }}
                      >
                        Delete Selected Lintel
                      </button>
                    </div>
                  </>
                );
              })()
            ) : (selectedType === "roof" || selectedRoofId) && (roofsByPage[currentPage] || []).find(r => r.id === (selectedRoofId || selectedId)) ? (
              (() => {
                const roof = (roofsByPage[currentPage] || []).find(r => r.id === (selectedRoofId || selectedId));
                if (!roof) return null;
                return (
                  <RoofInspectorCard
                    roof={roof}
                    scaleValue={scaleValue}
                    defaultPitchInput={defaultPitchInput}
                    setDefaultPitchInput={setDefaultPitchInput}
                    defaultOverhangInput={defaultOverhangInput}
                    setDefaultOverhangInput={setDefaultOverhangInput}
                    selectedRoofEdgeIndex={selectedRoofEdgeIndex}
                    setSelectedRoofEdgeIndex={setSelectedRoofEdgeIndex}
                    updateRoofType={updateRoofType}
                    applyDefaultPitchToAll={applyDefaultPitchToAll}
                    applyDefaultOverhangToAll={applyDefaultOverhangToAll}
                    applyDefaultSettingsToAll={applyDefaultSettingsToAll}
                    updateRoofEdgeAngle={updateRoofEdgeAngle}
                    updateRoofEdgeOverhang={updateRoofEdgeOverhang}
                    setRoofEdgeMode={setRoofEdgeMode}
                    toggleDutchEdge={toggleDutchEdge}
                    setRoofInteractionState={setRoofInteractionState}
                    setInteractionMode={setInteractionMode}
                    updateDutchOverhang={updateDutchOverhang}
                    setRoofEaveEdge={setRoofEaveEdge}
                    trimRoofEdge={trimRoofEdge}
                    deleteRoof={async (roofId) => {
                      if (await showConfirm("Are you sure you want to delete this roof?")) {
                        deleteRoof && deleteRoof(roofId);
                        setExplorerViewMode("tree");
                      }
                    }}
                    computeSelectedRoof={computeSelectedRoof}
                    exportRoofInput={exportRoofInput}
                    generateRoofFromWalls={generateRoofFromWalls}
                    realScale={realScale}
                    isComputingRoof={isComputingRoof}
                    onNameChange={(roofId, newName) => {
                      const updated = (roofsByPage[currentPage] || []).map(r => r.id === roofId ? { ...r, name: newName } : r);
                      if (setRoofsByPage) setRoofsByPage(prev => ({ ...prev, [currentPage]: updated }));
                    }}
                    isSelected={true}
                  />
                );
              })()
            ) : (
              <div className="panel-hint" style={{ padding: "8px 0" }}>Select a wall, room, door, lintel, or roof to edit properties.</div>
            )}
          </div>
        </div>
      ) : activePaneTab === "summary" ? (
        /* ══════════════════════════════════════════════════════
           TAB: SUMMARY (Tổng hợp Wall, Floor, Roof, Door, Skirting, Window & Export)
           ══════════════════════════════════════════════════════ */
        <div style={{ overflowY: "auto", flex: 1, paddingBottom: "20px" }}>
          {/* ── WALL SUMMARY COLLAPSIBLE GROUP ── */}
          <CollapsibleSection
            title="Wall Summary"
            isExpanded={isWallSummaryExpanded}
            onToggle={() => setIsWallSummaryExpanded(!isWallSummaryExpanded)}
            totalCount={totalWallCount}
          >
            {totalWallCount > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Wall Calculation Option Controls */}
                {/* Wall Calculation Option Controls */}
                <div style={{
                  background: "var(--bg-panel)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  border: "1px solid var(--border)"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)" }}>WALL SIDES:</span>
                    <div style={{ display: "flex", background: "#ffffff", padding: "2px", borderRadius: "6px", border: "1px solid var(--border)", gap: "2px" }}>
                      <button
                        onClick={() => setWallSides(2)}
                        style={{
                          padding: "4px 10px",
                          fontSize: "11px",
                          borderRadius: "4px",
                          border: "none",
                          background: wallSides === 2 ? "var(--blue)" : "transparent",
                          color: wallSides === 2 ? "#ffffff" : "var(--text)",
                          fontWeight: wallSides === 2 ? "700" : "500",
                          cursor: "pointer",
                          boxShadow: wallSides === 2 ? "0 1px 3px rgba(37, 99, 235, 0.2)" : "none"
                        }}
                      >
                        2 Sides (Default)
                      </button>
                      <button
                        onClick={() => setWallSides(1)}
                        style={{
                          padding: "4px 10px",
                          fontSize: "11px",
                          borderRadius: "4px",
                          border: "none",
                          background: wallSides === 1 ? "var(--blue)" : "transparent",
                          color: wallSides === 1 ? "#ffffff" : "var(--text)",
                          fontWeight: wallSides === 1 ? "700" : "500",
                          cursor: "pointer",
                          boxShadow: wallSides === 1 ? "0 1px 3px rgba(37, 99, 235, 0.2)" : "none"
                        }}
                      >
                        1 Side
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)" }}>DOOR OPENINGS:</span>
                    <div style={{ display: "flex", background: "#ffffff", padding: "2px", borderRadius: "6px", border: "1px solid var(--border)", gap: "2px" }}>
                      <button
                        onClick={() => setDeductDoors(false)}
                        style={{
                          padding: "4px 10px",
                          fontSize: "11px",
                          borderRadius: "4px",
                          border: "none",
                          background: !deductDoors ? "var(--blue)" : "transparent",
                          color: !deductDoors ? "#ffffff" : "var(--text)",
                          fontWeight: !deductDoors ? "700" : "500",
                          cursor: "pointer",
                          boxShadow: !deductDoors ? "0 1px 3px rgba(37, 99, 235, 0.2)" : "none"
                        }}
                      >
                        Gross Area
                      </button>
                      <button
                        onClick={() => setDeductDoors(true)}
                        style={{
                          padding: "4px 10px",
                          fontSize: "11px",
                          borderRadius: "4px",
                          border: "none",
                          background: deductDoors ? "var(--blue)" : "transparent",
                          color: deductDoors ? "#ffffff" : "var(--text)",
                          fontWeight: deductDoors ? "700" : "500",
                          cursor: "pointer",
                          boxShadow: deductDoors ? "0 1px 3px rgba(37, 99, 235, 0.2)" : "none"
                        }}
                      >
                        Net Area
                      </button>
                    </div>
                  </div>
                </div>

                {/* Project/Grand Wall Summary */}
                <div>
                  <SectionHeader>Totals</SectionHeader>
                  <SummaryCard accent="green">
                    <StatRow
                      label="Grand Total Area"
                      value={scaleValue ? `${grandTotalArea.toFixed(2)} m²` : "—"}
                      color="#10b981"
                      bold
                    />
                    <div className="rp-summary-divider" />
                    <StatRow
                      label="Total Walls"
                      value={totalWallCount}
                    />
                    <StatRow
                      label="Total Length"
                      value={scaleValue ? `${grandTotalLength.toFixed(2)} m` : "—"}
                    />
                  </SummaryCard>
                </div>

                {/* Interior Walls */}
                <div>
                  <SectionHeader>Interior Walls</SectionHeader>
                  <KPIRow>
                    <KPICard
                      value={wallData.interior_wall.walls.length}
                      label="Walls"
                    />
                    <KPICard
                      value={scaleValue ? sumOf(wallData.interior_wall, "lengthM").toFixed(1) : "—"}
                      label="Length"
                      unit={scaleValue ? " m" : ""}
                    />
                    <KPICard
                      value={scaleValue ? sumOf(wallData.interior_wall, "areaM2").toFixed(1) : "—"}
                      label="Area"
                      unit={scaleValue ? " m²" : ""}
                      color="#2563eb"
                    />
                  </KPIRow>
                  {scaleValue && sumOf(wallData.interior_wall, "areaM2") > 0 && (
                    <MiniBar ratio={sumOf(wallData.interior_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#2563eb" />
                  )}
                </div>

                {/* Exterior Walls */}
                <div>
                  <SectionHeader>Exterior Walls</SectionHeader>
                  <KPIRow>
                    <KPICard
                      value={wallData.exterior_wall.walls.length}
                      label="Walls"
                    />
                    <KPICard
                      value={scaleValue ? sumOf(wallData.exterior_wall, "lengthM").toFixed(1) : "—"}
                      label="Length"
                      unit={scaleValue ? " m" : ""}
                    />
                    <KPICard
                      value={scaleValue ? sumOf(wallData.exterior_wall, "areaM2").toFixed(1) : "—"}
                      label="Area"
                      unit={scaleValue ? " m²" : ""}
                      color="#d97706"
                    />
                  </KPIRow>
                  {scaleValue && sumOf(wallData.exterior_wall, "areaM2") > 0 && (
                    <MiniBar ratio={sumOf(wallData.exterior_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#d97706" />
                  )}
                </div>

                {/* Partition Walls */}
                {wallData.partition_wall.walls.length > 0 && (
                  <div>
                    <SectionHeader>Partition Walls</SectionHeader>
                    <KPIRow>
                      <KPICard
                        value={wallData.partition_wall.walls.length}
                        label="Walls"
                      />
                      <KPICard
                        value={scaleValue ? sumOf(wallData.partition_wall, "lengthM").toFixed(1) : "—"}
                        label="Length"
                        unit={scaleValue ? " m" : ""}
                      />
                      <KPICard
                        value={scaleValue ? sumOf(wallData.partition_wall, "areaM2").toFixed(1) : "—"}
                        label="Area"
                        unit={scaleValue ? " m²" : ""}
                        color="#7c3aed"
                      />
                    </KPIRow>
                    {scaleValue && sumOf(wallData.partition_wall, "areaM2") > 0 && (
                      <MiniBar ratio={sumOf(wallData.partition_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#7c3aed" />
                    )}
                  </div>
                )}

                {/* Block Walls */}
                {wallData.block_wall?.walls.length > 0 && (
                  <div>
                    <SectionHeader>Block Walls</SectionHeader>
                    <KPIRow>
                      <KPICard
                        value={wallData.block_wall.walls.length}
                        label="Walls"
                      />
                      <KPICard
                        value={scaleValue ? sumOf(wallData.block_wall, "lengthM").toFixed(1) : "—"}
                        label="Length"
                        unit={scaleValue ? " m" : ""}
                      />
                      <KPICard
                        value={scaleValue ? sumOf(wallData.block_wall, "areaM2").toFixed(1) : "—"}
                        label="Area"
                        unit={scaleValue ? " m²" : ""}
                        color="#57534e"
                      />
                    </KPIRow>
                    {scaleValue && sumOf(wallData.block_wall, "areaM2") > 0 && (
                      <MiniBar ratio={sumOf(wallData.block_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#57534e" />
                    )}
                  </div>
                )}

                {/* Export Wall Output & Takeoff */}
                <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <div style={{ flex: 1 }}>
                      <ExportButton onClick={() => exportWallExcel()} disabled={!scaleValue && (!walls || walls.length === 0)}>
                        📊 Xuất Excel Tường (.xlsx)
                      </ExportButton>
                    </div>
                    {/* Debug raw wall JSON export
                    <button
                      type="button"
                      onClick={() => exportWallJson()}
                      disabled={!walls || walls.length === 0}
                      style={{
                        padding: "8px 12px",
                        background: "#f8fafc",
                        border: "1px solid #cbd5e1",
                        borderRadius: "8px",
                        fontSize: "11px",
                        fontWeight: "700",
                        color: "#0f172a",
                        cursor: (!walls || walls.length === 0) ? "not-allowed" : "pointer",
                        opacity: (!walls || walls.length === 0) ? 0.6 : 1,
                        transition: "all 0.15s ease",
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                      title="Xuất dữ liệu tường định dạng JSON / EZPlan"
                    >
                      <span>📄 JSON</span>
                    </button>
                    */}
                  </div>

                  <ExportButton onClick={() => { lintelController?.roundAllLintels(); openTakeoffModal(); }} disabled={!scaleValue} >
                    📋 Export Takeoff Form (.xlsx)
                  </ExportButton>

                  {/* 4 Modals Quick Access (FrameWork, Area Summary, Insulation, LockUp) */}
                  <div style={{ display: "flex", gap: "5px", marginTop: "4px" }}>
                    <button
                      type="button"
                      onClick={() => setShowFrameworkModal(true)}
                      style={{
                        flex: 1,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: "3px", padding: "8px 2px", background: "#f8fafc",
                        border: "1px solid #cbd5e1", borderRadius: "8px",
                        color: "#0f172a", cursor: "pointer", fontSize: "10px", fontWeight: "800",
                        transition: "all 0.15s ease"
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#3b82f6"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                    >
                      <span style={{ fontSize: "15px" }}>🏗️</span>
                      <span style={{ color: "#0f172a" }}>FrameWork</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowAreaSummaryModal(true)}
                      style={{
                        flex: 1,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: "3px", padding: "8px 2px", background: "#f8fafc",
                        border: "1px solid #cbd5e1", borderRadius: "8px",
                        color: "#0f172a", cursor: "pointer", fontSize: "10px", fontWeight: "800",
                        transition: "all 0.15s ease"
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#3b82f6"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                    >
                      <span style={{ fontSize: "15px" }}>📐</span>
                      <span style={{ color: "#0f172a" }}>Area Summary</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowInsulationModal(true)}
                      style={{
                        flex: 1,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: "3px", padding: "8px 2px", background: "#f8fafc",
                        border: "1px solid #cbd5e1", borderRadius: "8px",
                        color: "#0f172a", cursor: "pointer", fontSize: "10px", fontWeight: "800",
                        transition: "all 0.15s ease"
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#3b82f6"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                    >
                      <span style={{ fontSize: "15px" }}>🧱</span>
                      <span style={{ color: "#0f172a" }}>Insulation</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowLockoutModal(true)}
                      style={{
                        flex: 1,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        gap: "3px", padding: "8px 2px", background: "#f8fafc",
                        border: "1px solid #cbd5e1", borderRadius: "8px",
                        color: "#0f172a", cursor: "pointer", fontSize: "10px", fontWeight: "800",
                        transition: "all 0.15s ease"
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#3b82f6"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#cbd5e1"; }}
                    >
                      <span style={{ fontSize: "15px" }}>🔒</span>
                      <span style={{ color: "#0f172a" }}>LockUp</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="panel-hint" style={{ padding: "8px 0" }}>No walls detected yet. Run Wall AI or draw walls manually.</div>
            )}
          </CollapsibleSection>

          {/* ── FLOOR SUMMARY COLLAPSIBLE GROUP ── */}
          <CollapsibleSection
            title="Floor Summary"
            isExpanded={isFloorSummaryExpanded}
            onToggle={() => setIsFloorSummaryExpanded(!isFloorSummaryExpanded)}
            totalCount={validRooms.length}
          >
            {validRooms.length > 0 ? (
              <div className="rp-floor-container">
                <div className="rp-floor-title">
                  <AreaSummaryIcon />
                  <span>Area Summary</span>
                </div>

                {/* Internal */}
                <SubheadingRow
                  title="Internal"
                  icon={<HomeIcon />}
                  value={wasteInternal}
                  onChange={(v) =>
                    setWasteByPage((prev) => ({
                      ...prev,
                      [currentPage]: { ...(prev[currentPage] || { external: 15 }), internal: v },
                    }))
                  }
                />
                {dry > 0 && (
                  <AreaCard
                    label="Dry"
                    value={`${dry.toFixed(2)} m²`}
                    dotColor="#ef4444"
                    ratio={totalInternal > 0 ? dry / totalInternal : 0}
                    parentLabel="internal"
                    isActive={highlightType === "dry"}
                    onClick={() => toggleRoomHighlight("dry")}
                  />
                )}
                {wet > 0 && (
                  <AreaCard
                    label="Wet"
                    value={`${wet.toFixed(2)} m²`}
                    dotColor="#2196F3"
                    ratio={totalInternal > 0 ? wet / totalInternal : 0}
                    parentLabel="internal"
                    isActive={highlightType === "wet"}
                    onClick={() => toggleRoomHighlight("wet")}
                  />
                )}

                {/* External */}
                <SubheadingRow
                  title="External"
                  icon={<ExternalIcon />}
                  value={wasteExternal}
                  onChange={(v) =>
                    setWasteByPage((prev) => ({
                      ...prev,
                      [currentPage]: { ...(prev[currentPage] || { internal: 10 }), external: v },
                    }))
                  }
                />
                {timber > 0 && (
                  <AreaCard
                    label="Timber Deck"
                    value={`${timber.toFixed(2)} m²`}
                    dotColor="#8B5E3C"
                    ratio={totalExternal > 0 ? timber / totalExternal : 0}
                    parentLabel="external"
                    isActive={highlightType === "timber_deck"}
                    onClick={() => toggleRoomHighlight("timber_deck")}
                  />
                )}
                {tile > 0 && (
                  <AreaCard
                    label="Tile Deck"
                    value={`${tile.toFixed(2)} m²`}
                    dotColor="#4CAF50"
                    ratio={totalExternal > 0 ? tile / totalExternal : 0}
                    parentLabel="external"
                    isActive={highlightType === "tile_deck"}
                    onClick={() => toggleRoomHighlight("tile_deck")}
                  />
                )}

                {/* Green Totals Card */}
                <div className="rp-totals-card">
                  <div className="rp-totals-row">
                    <span className="rp-totals-row__icon"><PolygonIcon /></span>
                    <span className="rp-totals-row__label">Total Area</span>
                    <span className="rp-totals-row__value">{totalRaw.toFixed(2)} m²</span>
                  </div>
                  <div className="rp-totals-row">
                    <span className="rp-totals-row__icon" style={{ color: "#fbbf24" }}><WasteIcon /></span>
                    <span className="rp-totals-row__label">Waste</span>
                    <span className="rp-totals-row__value" style={{ color: "#fbbf24" }}>+{totalWaste.toFixed(2)} m²</span>
                  </div>
                  <div className="rp-totals-divider" />
                  <div className="rp-totals-row rp-totals-row--grand">
                    <span className="rp-totals-row__icon" style={{ color: "#10b981" }}><GrandTotalIcon /></span>
                    <span className="rp-totals-row__label">Grand Total</span>
                    <span className="rp-totals-row__value">{totalWithWaste.toFixed(2)} m²</span>
                  </div>
                </div>

                <div className="rp-totals-info">
                  <InfoIcon />
                  <span>Waste is calculated based on the selected percentage.</span>
                </div>
              </div>
            ) : (
              <div className="panel-hint" style={{ padding: "8px 0" }}>No rooms detected yet. Draw rooms or run AI to generate areas.</div>
            )}
          </CollapsibleSection>

          {/* ── ROOF AREA SUMMARY COLLAPSIBLE GROUP ── */}
          <CollapsibleSection
            title="Roof Summary"
            isExpanded={isRoofSummaryExpanded}
            onToggle={() => setIsRoofSummaryExpanded(!isRoofSummaryExpanded)}
            totalCount={pageRoofs.length}
          >
            {pageRoofs.length > 0 ? (
              <div className="rp-floor-container">
                <div className="rp-floor-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "14px" }}>🏠</span>
                    <span>Roof Area Summary</span>
                  </div>
                  {/* Debug raw roof input export
                  {pageRoofs.length > 0 && (
                    <button
                      title="Export all roof inputs on this page to JSON (V3 format)"
                      onClick={(e) => {
                        e.stopPropagation();
                        pageRoofs.forEach(rf => {
                          if (exportRoofInput) {
                            exportRoofInput(rf.id);
                          } else if (typeof window !== "undefined" && window.RoofEngine) {
                            window.RoofEngine.exportRoofInput({ roof: rf, scaleFactor: scaleValue, realScale, download: true });
                          }
                        });
                      }}
                      style={{
                        padding: "2px 7px",
                        fontSize: "10px",
                        fontWeight: 700,
                        background: "rgba(59, 130, 246, 0.12)",
                        color: "#38bdf8",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "3px"
                      }}
                    >
                      <span>📥</span>
                      <span>Export Inputs</span>
                    </button>
                  )}
                  */}
                  {generateRoofFromWalls && (
                    <button
                      onClick={() => generateRoofFromWalls()}
                      title="Auto-generate 3D Roof from active exterior walls"
                      style={{
                        padding: "2px 7px",
                        fontSize: "10px",
                        fontWeight: 700,
                        background: "rgba(16, 185, 129, 0.12)",
                        color: "#10b981",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        borderRadius: "4px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "3px"
                      }}
                    >
                      <span>🏠</span>
                      <span>Wall → Roof</span>
                    </button>
                  )}
                </div>

                {roofCalculations.map((roof, idx) => (
                  <RoofInspectorCard
                    key={roof.id || idx}
                    roof={roof}
                    scaleValue={scaleValue}
                    defaultPitchInput={defaultPitchInput}
                    setDefaultPitchInput={setDefaultPitchInput}
                    defaultOverhangInput={defaultOverhangInput}
                    setDefaultOverhangInput={setDefaultOverhangInput}
                    selectedRoofEdgeIndex={selectedRoofEdgeIndex}
                    setSelectedRoofEdgeIndex={setSelectedRoofEdgeIndex}
                    updateRoofType={updateRoofType}
                    applyDefaultPitchToAll={applyDefaultPitchToAll}
                    applyDefaultOverhangToAll={applyDefaultOverhangToAll}
                    applyDefaultSettingsToAll={applyDefaultSettingsToAll}
                    updateRoofEdgeAngle={updateRoofEdgeAngle}
                    updateRoofEdgeOverhang={updateRoofEdgeOverhang}
                    setRoofEdgeMode={setRoofEdgeMode}
                    toggleDutchEdge={toggleDutchEdge}
                    setRoofInteractionState={setRoofInteractionState}
                    setInteractionMode={setInteractionMode}
                    updateDutchOverhang={updateDutchOverhang}
                    setRoofEaveEdge={setRoofEaveEdge}
                    trimRoofEdge={trimRoofEdge}
                    deleteRoof={deleteRoof}
                    computeSelectedRoof={computeSelectedRoof}
                    exportRoofInput={exportRoofInput}
                    generateRoofFromWalls={generateRoofFromWalls}
                    realScale={realScale}
                    isComputingRoof={isComputingRoof}
                    onNameChange={(roofId, newName) => {
                      const updated = (roofsByPage[currentPage] || []).map(r => r.id === roofId ? { ...r, name: newName } : r);
                      if (setRoofsByPage) setRoofsByPage(prev => ({ ...prev, [currentPage]: updated }));
                    }}
                    isSelected={selectedRoofId === roof.id}
                    onSelect={(roofId) => {
                      if (setSelectedRoofId) setSelectedRoofId(selectedRoofId === roofId ? null : roofId);
                      if (setSelectedId) setSelectedId(selectedRoofId === roofId ? null : roofId);
                      if (setSelectedType) setSelectedType(selectedRoofId === roofId ? null : "roof");
                    }}
                  />
                ))}

                {/* Total Roof Area Card */}
                <div className="rp-totals-card" style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.25)" }}>
                  <div className="rp-totals-row rp-totals-row--grand">
                    <span className="rp-totals-row__icon" style={{ color: "#f59e0b" }}>🏠</span>
                    <span className="rp-totals-row__label" style={{ fontWeight: 800 }}>Total Roof Area</span>
                    <span className="rp-totals-row__value" style={{ color: "#f59e0b", fontSize: "18px" }}>
                      {scaleValue ? `${totalRoofArea.toFixed(2)} m²` : "No Scale"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="panel-hint" style={{ padding: "8px 0" }}>No roofs drawn yet. Click 'Roof' in the top Ribbon to draw.</div>
            )}
          </CollapsibleSection>

          {/* ── DOOR SUMMARY COLLAPSIBLE GROUP ── */}
          <CollapsibleSection
            title="Door Summary"
            isExpanded={isDoorSummaryExpanded}
            onToggle={() => setIsDoorSummaryExpanded(!isDoorSummaryExpanded)}
            totalCount={totalDoorCount}
          >
            {totalDoorCount > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Totals KPI card */}
                <div>
                  <SectionHeader>Totals</SectionHeader>
                  <SummaryCard accent="green">
                    <StatRow
                      label="Total Doors"
                      value={doorMetrics.count}
                      color="#10b981"
                      bold
                    />
                    <StatRow
                      label="Total Door Length"
                      value={`${doorMetrics.totalLengthM} m`}
                    />
                    <StatRow
                      label="Total Door Perimeter"
                      value={`${doorMetrics.totalPerimeterM} m`}
                    />
                  </SummaryCard>
                </div>

                {/* Hardware Type breakdowns */}
                <div>
                  <SectionHeader>Hardware Breakdowns</SectionHeader>
                  {Object.entries(doorData).map(([key, group]) => {
                    const count = group.doors.length;
                    if (count === 0) return null;
                    return (
                      <div key={key} style={{ marginBottom: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text)", marginBottom: "2px" }}>
                          <span style={{ textTransform: "capitalize", color: "var(--text-dim)" }}>{group.label}</span>
                          <b>{count}</b>
                        </div>
                        <MiniBar ratio={count / Math.max(totalDoorCount, 1)} color={group.color} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="panel-hint" style={{ padding: "8px 0" }}>No doors detected yet. Draw doors or run AI to generate doors.</div>
            )}
          </CollapsibleSection>

          {/* ── SKIRTING SUMMARY COLLAPSIBLE GROUP ── */}
          <CollapsibleSection
            title="Skirting Summary"
            isExpanded={isSkirtingSummaryExpanded}
            onToggle={() => setIsSkirtingSummaryExpanded(!isSkirtingSummaryExpanded)}
            totalCount={skirtingSummaryMetrics.totalLengthsNeeded}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <SectionHeader>Totals</SectionHeader>
                <SummaryCard accent="green">
                  <StatRow
                    label="Total Skirting Length"
                    value={`${skirtingSummaryMetrics.totalSkirtingLm.toFixed(3)} m`}
                    color="#10b981"
                    bold
                  />
                  <div className="rp-summary-divider" />
                  <StatRow
                    label="Total Free End Caps"
                    value={`${skirtingSummaryMetrics.totalFreeEnds} ends`}
                  />
                  <StatRow
                    label="5.4m Lengths Needed"
                    value={`${skirtingSummaryMetrics.totalLengthsNeeded} Lengths`}
                    color="#f59e0b"
                    bold
                  />
                </SummaryCard>
              </div>

              {Object.keys(skirtingSummaryMetrics.materialMap).length > 0 && (
                <div>
                  <SectionHeader>Profile Breakdowns</SectionHeader>
                  {Object.entries(skirtingSummaryMetrics.materialMap).map(([mat, lm]) => (
                    <div key={mat} style={{ marginBottom: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text)", marginBottom: "2px" }}>
                        <span style={{ color: "var(--text-dim)" }}>{mat}</span>
                        <b>{lm.toFixed(2)} m</b>
                      </div>
                      <MiniBar ratio={lm / Math.max(skirtingSummaryMetrics.totalSkirtingLm, 1)} color="#38bdf8" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* ── WINDOW SUMMARY COLLAPSIBLE GROUP ── */}
          <CollapsibleSection
            title="Window Summary"
            isExpanded={isWindowSummaryExpanded}
            onToggle={() => setIsWindowSummaryExpanded(!isWindowSummaryExpanded)}
            totalCount={totalWindowCount}
          >
            {totalWindowCount > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Totals KPI card */}
                <div>
                  <SectionHeader>Totals</SectionHeader>
                  <SummaryCard accent="blue">
                    <StatRow
                      label="Total Windows"
                      value={windowMetrics.count}
                      color="#2196f3"
                      bold
                    />
                    <StatRow
                      label="Total Window Length"
                      value={`${windowMetrics.totalLengthM} m`}
                    />
                    <StatRow
                      label="Total Window Perimeter"
                      value={`${windowMetrics.totalPerimeterM} m`}
                    />
                  </SummaryCard>
                </div>
              </div>
            ) : (
              <div className="panel-hint" style={{ padding: "8px 0" }}>No windows drawn yet. Click 'Window' in the top Ribbon to draw.</div>
            )}
          </CollapsibleSection>
        </div>
      ) : null}

      {/* ── TAKEOFF EXPORT PROPERTIES MODAL ── */}
      {showTakeoffModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.5)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999
        }}>
          <div style={{
            background: "#ffffff",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "24px",
            width: "400px",
            maxWidth: "90%",
            boxShadow: "0 20px 50px rgba(15, 23, 42, 0.15)",
            color: "var(--text)"
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "700", color: "#0f172a", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
              📋 Export Takeoff Excel Form
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Project Name</label>
                <input
                  type="text"
                  value={takeoffForm.projectName}
                  onChange={e => setTakeoffForm(prev => ({ ...prev, projectName: e.target.value }))}
                  style={{
                    padding: "8px 12px",
                    background: "#ffffff",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Client Name</label>
                <input
                  type="text"
                  value={takeoffForm.clientName}
                  onChange={e => setTakeoffForm(prev => ({ ...prev, clientName: e.target.value }))}
                  style={{
                    padding: "8px 12px",
                    background: "#ffffff",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Detailer Name</label>
                <input
                  type="text"
                  value={takeoffForm.detailerName}
                  onChange={e => setTakeoffForm(prev => ({ ...prev, detailerName: e.target.value }))}
                  style={{
                    padding: "8px 12px",
                    background: "#ffffff",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Job No</label>
                <input
                  type="text"
                  value={takeoffForm.jobNo}
                  onChange={e => setTakeoffForm(prev => ({ ...prev, jobNo: e.target.value }))}
                  style={{
                    padding: "8px 12px",
                    background: "#ffffff",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Date</label>
                <input
                  type="text"
                  value={takeoffForm.date}
                  onChange={e => setTakeoffForm(prev => ({ ...prev, date: e.target.value }))}
                  style={{
                    padding: "8px 12px",
                    background: "#ffffff",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowTakeoffModal(false)}
                disabled={isExporting}
                style={{
                  padding: "8px 16px",
                  background: "#f1f5f9",
                  color: "#475569",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleExportTakeoff}
                disabled={isExporting}
                style={{
                  padding: "8px 16px",
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "13px",
                  cursor: isExporting ? "not-allowed" : "pointer",
                  opacity: isExporting ? 0.7 : 1
                }}
              >
                {isExporting ? "Exporting..." : "Export Excel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
