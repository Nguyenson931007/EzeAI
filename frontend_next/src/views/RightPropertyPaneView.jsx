import React from "react";
import * as XLSX from "xlsx";
import { polygonAreaM2 as polygonAreaM2Util, getWallClass, getBaseWallId, calcDoorWindowMetrics, getWallSideOffsets, mirrorPolygonAcrossLine, mirrorPolygonAcrossPerpendicular } from "@/utils/geometry";
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
        const clamped = Math.max(0, Math.min(85, parsed));
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

/* ================================================================
   MAIN PANEL
   ================================================================ */
export default function RightPropertyPaneView({
  selectedRoom, selectedWall, selectedDoor, selectedType, selectedPointIndex, updateRoom, updateDoor, deleteDoor, scaleValue, realScale, rooms,
  highlightType, setHighlightType,
  selectedWallIds = [], setSelectedWallIds, setSelectedType, setSelectedId, updateWallsProperty, deleteWalls, interactionMode, setInteractionMode, pxToMm,
  autoMergeCollinearWalls,
  walls = [],
  doors = [],
  deleteItem,
  selectedRoofId,
  setSelectedRoofId,
  updateRoofPitch,
  deleteRoof,
  lintelController,
  selectedId,
  onLoadJob
}) {
  const { showConfirm } = useDialog();
  const {
    wasteByPage, setWasteByPage,
    roofsByPage, setRoofsByPage,
    currentPage,
    currentProjectName, setCurrentProjectName,
    currentJobId, setCurrentJobId,
    setActiveTab,
    user,
    lintelsByPage
  } = useAppModel();

  // ── PANE TAB STATE ("properties" | "job_task") ──
  const [activePaneTab, setActivePaneTab] = React.useState("properties");
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
  const fetchTasks = React.useCallback(async (force = false) => {
    try {
      setTaskLoading(true);
      setTaskError(null);
      const res = await ApiService.getTaskListJobs(null, null, 150, force);
      if (res && res.status === "success" && Array.isArray(res.data)) {
        setTaskListJobs(res.data);
      } else {
        setTaskListJobs([]);
      }
    } catch (err) {
      console.error("Error fetching Task Groups HW:", err);
      setTaskError(err.message || "Không thể tải danh sách Task Groups HW");
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
    const targetName = task.job_number || "Project";

    // 1. Nếu Job đã có dữ liệu bản vẽ đã lưu trong hệ thống EzeFloor
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
        }
      } catch (err) {
        console.error("Error loading job:", err);
      } finally {
        setLoadingJobId(null);
      }
    } else {
      // 2. Nếu chưa có bản vẽ, đặt tên dự án và chuyển sang tab Home/Editor để bắt đầu
      if (setCurrentProjectName) setCurrentProjectName(targetName);
      if (setCurrentJobId) setCurrentJobId(null);
      if (setActiveTab) setActiveTab("Home");
    }

    // Lưu thông tin pendingEmsJob vào sessionStorage
    sessionStorage.setItem("pendingEmsJob", JSON.stringify(task));
  };

  const [isRoofSummaryExpanded, setIsRoofSummaryExpanded] = React.useState(true);
  const lastSingleWallIdRef = React.useRef(null);

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

  // Excel export for walls
  const exportWallExcel = () => {
    if (!scaleValue) return;
    const wb = XLSX.utils.book_new();
    const ws = {};
    const s = (r, c, v) => { ws[XLSX.utils.encode_cell({ r, c })] = { t: "s", v }; };
    const n = (r, c, v) => { ws[XLSX.utils.encode_cell({ r, c })] = { t: "n", v: parseFloat(Number(v).toFixed(4)) }; };

    let r = 0;
    s(r, 0, "Wall Summary Report"); r++;
    s(r, 0, `Scale: ${scaleValue.toFixed(6)} m/px`); r += 2;
    s(r, 0, "Wall ID"); s(r, 1, "Type"); s(r, 2, "Length (m)"); s(r, 3, "Height (m)"); s(r, 4, "Area (m²)"); s(r, 5, "Thickness (mm)"); r++;

    const typeOrder = ["interior_wall", "exterior_wall", "partition_wall"];
    for (const type of typeOrder) {
      const group = wallData[type];
      if (group.walls.length === 0) continue;
      s(r, 0, `── ${group.label} Wall (${group.walls.length}) ──`); r++;
      group.walls.forEach((w) => {
        const wallIdx = (walls || []).findIndex(orig => orig.id === w.id);
        const strId = String(w.id);
        const wallIdFormatted = w.name || (wallIdx >= 0 ? `W-${wallIdx + 1}` : (strId.startsWith("man_wall_") || strId.startsWith("wall-topo-") || strId.startsWith("wall-") || strId.startsWith("wall_") || strId.length > 10 ? `W-${wallIdx + 1}` : strId));
        s(r, 0, wallIdFormatted); s(r, 1, `${group.label} Wall`);
        n(r, 2, w.lengthM || 0); n(r, 3, w.heightM || 0);
        n(r, 4, w.areaM2 || 0); n(r, 5, w.thicknessMm); r++;
      });
      s(r, 0, ""); s(r, 1, `${group.label} Total`);
      n(r, 2, sumOf(group, "lengthM")); s(r, 3, "");
      n(r, 4, sumOf(group, "areaM2")); r += 2;
    }
    s(r, 0, ""); s(r, 1, "GRAND TOTAL");
    n(r, 2, grandTotalLength); s(r, 3, ""); n(r, 4, grandTotalArea); r++;

    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: 5 } });
    ws["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "Wall Summary");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "Wall_Summary.xlsx"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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
        const isWindow = (type === 'window' || cls === 'window' || d.doorTypeId === 'win_standard' || (d.doorName && d.doorName.startsWith('W-'))) && cls !== 'sliding_door' && type !== 'sliding';
        const isGarage = cls.includes("garage") || t.includes("garage") || type === "garage" || d.doorTypeId === "ext_garage" || (d.door_name && d.door_name.toLowerCase().includes("garage")) || (d.doorName && d.doorName.toLowerCase().includes("garage"));

        let doorType = "Single Door";
        if (isWindow) {
          doorType = "Window";
        } else if (isGarage) {
          doorType = "Garage Door";
        } else if (cls.includes("double") || t.includes("double")) {
          doorType = "Double Door";
        } else if (cls.includes("sliding") || t.includes("sliding") || cls.includes("slider") || t.includes("slider")) {
          doorType = "Sliding Door";
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

        return {
          id: String(d.id),
          door_type: doorType,
          width_mm: d.width_mm || 760,
          height_mm: d.height_mm || 1980,
          qty: 1,
          block_work: isParentBlock ? "Yes" : (d.block_work || d.blockWork || "No"),
          is_ext: isExt,
          location: isExt ? "ext" : "internal"
        };
      });

      const pageLintels = lintelsByPage[currentPage] || [];
      const mappedLintels = pageLintels.map(l => {
        const cat = l.category || 'lintel';
        const desc = cat === 'beam' ? 'Beam' : (cat === 'bh' ? 'BH' : 'Lintel');
        return {
          id: String(l.id),
          wall_id: String(l.wallId),
          start_offset: l.startOffset,
          end_offset: l.endOffset,
          measured_length: l.measuredLength,
          final_length: l.finalLength,
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
      {/* ── TOP MENU BAR: Properties / Job Task ── */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        background: "rgba(15, 23, 42, 0.95)",
        padding: "6px 8px",
        gap: "6px",
        position: "sticky",
        top: 0,
        zIndex: 30,
        flexShrink: 0
      }}>
        <button
          onClick={() => setActivePaneTab("properties")}
          style={{
            flex: 1,
            padding: "7px 10px",
            fontSize: "12px",
            fontWeight: activePaneTab === "properties" ? 700 : 500,
            color: activePaneTab === "properties" ? "#ffffff" : "#94a3b8",
            background: activePaneTab === "properties" ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "rgba(255,255,255,0.03)",
            border: activePaneTab === "properties" ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.06)",
            borderRadius: "6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            transition: "all 0.15s ease"
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M14 9h5"/><path d="M14 15h5"/></svg>
          Properties
        </button>
        <button
          onClick={() => setActivePaneTab("job_task")}
          style={{
            flex: 1,
            padding: "7px 10px",
            fontSize: "12px",
            fontWeight: activePaneTab === "job_task" ? 700 : 500,
            color: activePaneTab === "job_task" ? "#ffffff" : "#94a3b8",
            background: activePaneTab === "job_task" ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "rgba(255,255,255,0.03)",
            border: activePaneTab === "job_task" ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.06)",
            borderRadius: "6px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            transition: "all 0.15s ease"
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Task Groups HW
          {taskListJobs.filter(t => t.has_local_job).length > 0 && (
            <span style={{
              background: "#10b981",
              color: "#fff",
              fontSize: "10px",
              padding: "1px 5px",
              borderRadius: "10px",
              fontWeight: 800
            }}>
              {taskListJobs.filter(t => t.has_local_job).length}
            </span>
          )}
        </button>
      </div>

      {activePaneTab === "job_task" ? (
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
                <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              {taskLoading ? "Đang tải..." : "Refresh"}
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
                padding: "7px 26px 7px 9px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "12px",
                outline: "none",
                boxSizing: "border-box"
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
            <button
              onClick={() => { setStaffScope("my"); setTaskDisplayLimit(30); }}
              style={{
                padding: "6px 4px",
                fontSize: "11px",
                fontWeight: staffScope === "my" ? 700 : 500,
                color: staffScope === "my" ? "#ffffff" : "#94a3b8",
                background: staffScope === "my" ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "rgba(255,255,255,0.03)",
                border: staffScope === "my" ? "1px solid #60a5fa" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px"
              }}
            >
              <span>👤 My Tasks ({myStaffCode})</span>
            </button>
            <button
              onClick={() => { setStaffScope("all"); setTaskDisplayLimit(30); }}
              style={{
                padding: "6px 4px",
                fontSize: "11px",
                fontWeight: staffScope === "all" ? 700 : 500,
                color: staffScope === "all" ? "#ffffff" : "#94a3b8",
                background: staffScope === "all" ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "rgba(255,255,255,0.03)",
                border: staffScope === "all" ? "1px solid #60a5fa" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px"
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
                padding: "5px 2px",
                fontSize: "11px",
                fontWeight: taskFilter === "all" ? 700 : 500,
                color: taskFilter === "all" ? "#fff" : "#94a3b8",
                background: taskFilter === "all" ? "rgba(59, 130, 246, 0.3)" : "rgba(255,255,255,0.03)",
                border: taskFilter === "all" ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: "5px",
                cursor: "pointer"
              }}
            >
              All ({filteredTasks.length})
            </button>
            <button
              onClick={() => { setTaskFilter("completed"); setTaskDisplayLimit(30); }}
              style={{
                padding: "5px 2px",
                fontSize: "11px",
                fontWeight: taskFilter === "completed" ? 700 : 500,
                color: taskFilter === "completed" ? "#10b981" : "#94a3b8",
                background: taskFilter === "completed" ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.03)",
                border: taskFilter === "completed" ? "1px solid #10b981" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: "5px",
                cursor: "pointer"
              }}
            >
              ✅ Available ({filteredTasks.filter(t => t.has_local_job).length})
            </button>
            <button
              onClick={() => { setTaskFilter("pending"); setTaskDisplayLimit(30); }}
              style={{
                padding: "5px 2px",
                fontSize: "11px",
                fontWeight: taskFilter === "pending" ? 700 : 500,
                color: taskFilter === "pending" ? "#f59e0b" : "#94a3b8",
                background: taskFilter === "pending" ? "rgba(245, 158, 11, 0.2)" : "rgba(255,255,255,0.03)",
                border: taskFilter === "pending" ? "1px solid #f59e0b" : "1px solid rgba(255,255,255,0.06)",
                borderRadius: "5px",
                cursor: "pointer"
              }}
            >
              ⏳ Pending ({filteredTasks.filter(t => !t.has_local_job).length})
            </button>
          </div>

          {/* Job Task List */}
          {taskLoading ? (
            <div style={{ textAlign: "center", padding: "40px 10px", color: "#94a3b8", fontSize: "13px" }}>
              <div style={{ marginBottom: "8px" }}>⏳ Loading Task Groups HW...</div>
            </div>
          ) : taskError ? (
            <div style={{ padding: "12px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", color: "#f87171", fontSize: "12px" }}>
              ⚠️ {taskError}
              <button onClick={() => fetchTasks(true)} style={{ marginTop: "6px", display: "block", color: "#38bdf8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Retry</button>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 10px", color: "#64748b", fontSize: "13px" }}>
              No matching Job Tasks found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filteredTasks.slice(0, taskDisplayLimit).map((task) => {
                const isActiveJob = currentProjectName && task.job_number && currentProjectName.toLowerCase().trim() === task.job_number.toLowerCase().trim();
                const isLoadingThis = loadingJobId === task.hw_id;

                return (
                  <div
                    key={task.hw_id || task.id_job_ems || Math.random()}
                    style={{
                      background: isActiveJob ? "rgba(59, 130, 246, 0.15)" : "rgba(30, 41, 59, 0.6)",
                      border: isActiveJob ? "1.5px solid #3b82f6" : (task.has_local_job ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(255,255,255,0.08)"),
                      borderRadius: "8px",
                      padding: "10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    {/* Header Row: Job Number & Checkmark Status */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                      <div style={{ fontWeight: 800, fontSize: "13px", color: isActiveJob ? "#60a5fa" : "#ffffff", display: "flex", alignItems: "center", gap: "6px" }}>
                        {task.job_number || "No Job Number"}
                        {isActiveJob && (
                          <span style={{ fontSize: "9px", background: "#3b82f6", color: "#fff", padding: "1px 5px", borderRadius: "4px", fontWeight: 700 }}>
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
                            background: "rgba(16, 185, 129, 0.18)",
                            color: "#10b981",
                            border: "1px solid rgba(16, 185, 129, 0.4)",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            fontSize: "11px",
                            fontWeight: 700
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          <span>Available</span>
                        </div>
                      ) : (
                        <div
                          title="Task HW does not have takeoff drawing in EzeFloor yet"
                          style={{
                            background: "rgba(148, 163, 184, 0.1)",
                            color: "#64748b",
                            border: "1px solid rgba(148, 163, 184, 0.2)",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            fontSize: "10px",
                            fontWeight: 500
                          }}
                        >
                          Pending
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div style={{ fontSize: "11px", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "2px" }}>
                      {task.client && (
                        <div><strong style={{ color: "#cbd5e1" }}>Client:</strong> {task.client}</div>
                      )}
                      {task.builder && (
                        <div><strong style={{ color: "#cbd5e1" }}>Builder:</strong> {task.builder}</div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px", color: "#64748b", fontSize: "10px" }}>
                        {task.ma_nv && <span>Staff: <strong style={{ color: "#94a3b8" }}>{task.ma_nv}</strong></span>}
                        {task.local_job?.room_count !== undefined && (
                          <span style={{ color: "#10b981", fontWeight: 600 }}>{task.local_job.room_count} rooms ({(task.local_job.total_area || 0).toFixed(1)} m²)</span>
                        )}
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => handleOpenJobTask(task)}
                      disabled={isLoadingThis}
                      style={{
                        marginTop: "4px",
                        padding: "6px 10px",
                        fontSize: "11px",
                        fontWeight: 700,
                        borderRadius: "5px",
                        border: "none",
                        cursor: isLoadingThis ? "not-allowed" : "pointer",
                        background: task.has_local_job
                          ? "linear-gradient(135deg, #059669, #10b981)"
                          : "linear-gradient(135deg, #2563eb, #3b82f6)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {isLoadingThis ? (
                        "⏳ Loading..."
                      ) : task.has_local_job ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                          Open Drawing
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          + Start Takeoff
                        </>
                      )}
                    </button>
                  </div>
                );
              })}

              {/* Load More Button */}
              {filteredTasks.length > taskDisplayLimit && (
                <button
                  onClick={() => setTaskDisplayLimit(prev => prev + 30)}
                  style={{
                    padding: "8px 12px",
                    background: "rgba(59, 130, 246, 0.15)",
                    border: "1px dashed rgba(59, 130, 246, 0.4)",
                    borderRadius: "6px",
                    color: "#60a5fa",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    marginTop: "4px"
                  }}
                >
                  ⬇️ Load more (+30 HW Tasks)...
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════
           TAB: PROPERTIES (Thuộc tính đối tượng hiện tại)
           ══════════════════════════════════════════════════════ */
        <div style={{ overflowY: "auto", flex: 1, paddingBottom: "20px" }}>
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
                        background: allAlreadySelected ? "#10b981" : typeInfo.color,
                        width: "100%",
                        borderRadius: 8,
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

                // Use button group for multi-wall selection (immune to React controlled select re-render issues)
                if (selectedWallIds.length > 1) {
                  const typeOptions = [
                    { value: "exterior_wall", label: "Ext", color: "#0284c7" },
                    { value: "interior_wall", label: "Int", color: "#6366f1" },
                    { value: "partition_wall", label: "Part", color: "#8b5cf6" },
                    { value: "block_wall", label: "Block", color: "#64748b" },
                  ];
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                      {typeOptions.map(opt => (
                        <button
                          key={opt.value}
                          style={{
                            padding: "6px 4px",
                            fontSize: 11,
                            fontWeight: currentType === opt.value ? 800 : 600,
                            background: currentType === opt.value ? opt.color : "#1e293b",
                            color: "#fff",
                            border: currentType === opt.value ? `2px solid ${opt.color}` : "1px solid #334155",
                            borderRadius: 6,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            opacity: currentType === opt.value ? 1 : 0.7,
                          }}
                          onClick={() => handleTypeChange(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  );
                }

                // Single wall: use normal select
                return (
                  <select
                    className="panel-select"
                    value={currentType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                  >
                    <option value="exterior_wall">Exterior Wall</option>
                    <option value="interior_wall">Interior Wall</option>
                    <option value="partition_wall">Partition Wall</option>
                    <option value="block_wall">Block Wall</option>
                  </select>
                );
              })()}
            </div>

            <div className="panel-field">
              <span className="panel-label">Wall Thickness</span>
              <select
                className="panel-select"
                value={
                  selectedWallIds.length > 1
                    ? "multiple"
                    : (selectedWall?.thickness ?? (selectedWall && pxToMm ? Math.round(pxToMm(selectedWall.thickness_px, realScale)) : 70))
                }
                onChange={(e) => {
                  if (e.target.value === "multiple") return;
                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                  updateWallsProperty && updateWallsProperty(targetIds, "thickness", Number(e.target.value));
                }}
              >
                {selectedWallIds.length > 1 && <option value="multiple" disabled>-- Multiple Thicknesses --</option>}
                <option value={70}>70 mm</option>
                <option value={90}>90 mm</option>
                <option value={140}>140 mm</option>
                <option value={180}>180 mm</option>
                <option value={200}>200 mm</option>
              </select>
            </div>

            <div className="panel-field">
              <span className="panel-label">Wall Height</span>
              {(() => {
                const currentHeight = selectedWallIds.length > 1 ? "multiple" : (selectedWall?.height ?? savedDefault);
                const isCustom = currentHeight !== "multiple" && !WALL_HEIGHT_OPTIONS.includes(Number(currentHeight));
                return (
                  <>
                    <select
                      className="panel-select"
                      value={isCustom ? "custom" : currentHeight}
                      onChange={(e) => {
                        if (e.target.value === "multiple") return;
                        const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                        if (e.target.value === "custom") {
                          // Prompt for custom value
                          const val = prompt("Enter custom wall height (mm):", String(currentHeight));
                          if (val && !isNaN(Number(val)) && Number(val) > 0) {
                            updateWallsProperty && updateWallsProperty(targetIds, "height", Number(val));
                          }
                        } else {
                          updateWallsProperty && updateWallsProperty(targetIds, "height", Number(e.target.value));
                        }
                      }}
                    >
                      {selectedWallIds.length > 1 && <option value="multiple" disabled>-- Multiple Heights --</option>}
                      {WALL_HEIGHT_OPTIONS.map(v => (
                        <option key={v} value={v}>{v} mm ({(v / 1000).toFixed(1)} m)</option>
                      ))}
                      <option value="custom">{isCustom ? `Custom: ${currentHeight} mm` : "Custom..."}</option>
                    </select>
                  </>
                );
              })()}
            </div>

            {/* FLOOR BASE TYPE SELECTOR (Slab Floor vs Timber Floor) */}
            <div style={{ marginTop: 12, marginBottom: 8 }}>
              <span className="panel-label" style={{ fontWeight: 700, color: "#38bdf8", marginBottom: 6, display: "block" }}>
                🪵 FLOOR BASE TYPE
              </span>
              {(() => {
                const targetIds = selectedWallIds.length > 0 ? selectedWallIds : (selectedWall ? [selectedWall.id] : []);
                const targetWalls = (walls || []).filter(w => targetIds.includes(w.id));
                const firstType = targetWalls[0]?.floor_type || "Timber";
                const isMixed = targetWalls.length > 1 && targetWalls.some(w => (w.floor_type || "Timber") !== firstType);
                const currentFloorType = isMixed ? "multiple" : firstType;

                const floorOptions = [
                  { value: "Timber", label: "Timber Floor", color: "#eab308" },
                  { value: "Slab", label: "Concrete Slab", color: "#0284c7" }
                ];

                return (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {floorOptions.map(opt => {
                        const isActive = currentFloorType === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            style={{
                              padding: "8px 6px",
                              fontSize: 12,
                              fontWeight: isActive ? 800 : 600,
                              background: isActive ? opt.color : "#1e293b",
                              color: isActive ? "#0f172a" : "#cbd5e1",
                              border: isActive ? `2px solid ${opt.color}` : "1px solid #334155",
                              borderRadius: 6,
                              cursor: "pointer",
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
                      <div style={{ fontSize: 10, color: "#cbd5e1", marginTop: 4, fontStyle: "italic", textAlign: "center" }}>
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
                <div className="panel-value" style={{ fontSize: 13, color: "#e1e4ea" }}>
                  <b>{selectedWallLengthM.toFixed(2)}</b> m
                </div>
              </div>
            )}

            {/* DUAL-FACE WALL FINISHES & SKIRTING PROPERTIES (CAD/BIM FEATURE 4) */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
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
                      <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "10px 12px", borderRadius: "6px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8" }}>{sideATitle}</span>
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
                              style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.15)", background: "#0f172a", color: "#fff", boxSizing: "border-box" }}
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
                              style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.15)", background: "#0f172a", color: "#fff", boxSizing: "border-box" }}
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
                              style={{ width: "100%", height: "30px", padding: "2px 4px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", cursor: "pointer", background: "#0f172a", boxSizing: "border-box" }}
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
                      <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "10px 12px", borderRadius: "6px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8" }}>{sideBTitle}</span>
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
                              style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.15)", background: "#0f172a", color: "#fff", boxSizing: "border-box" }}
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
                              style={{ width: "100%", height: "30px", padding: "4px 6px", fontSize: "12px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.15)", background: "#0f172a", color: "#fff", boxSizing: "border-box" }}
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
                              style={{ width: "100%", height: "30px", padding: "2px 4px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", cursor: "pointer", background: "#0f172a", boxSizing: "border-box" }}
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
              <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "10px 12px", borderRadius: "6px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
                {/* BULK SELECTION & QUICK PRESETS BAR */}
                <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    className="rp-action-btn"
                    style={{
                      background: (selectedWallIds.length === (walls || []).length && (walls || []).length > 0) ? "#10b981" : "#0284c7",
                      padding: "6px 8px",
                      fontSize: "11px",
                      fontWeight: 700,
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6
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
                    <div style={{ background: "rgba(16, 185, 129, 0.15)", padding: "6px 8px", borderRadius: "4px", border: "1px solid rgba(16, 185, 129, 0.4)", fontSize: "10px", color: "#34d399" }}>
                      ⚡ Bulk editing <b>{selectedWallIds.length}</b> skirtings simultaneously.
                    </div>
                  )}
                </div>
              </div>

              {/* CALCULATED METRICS CARD */}
              {selectedWallIds.length === 1 && selectedWallMetrics && (
                <div style={{ background: "rgba(30, 41, 59, 0.7)", padding: "10px 12px", borderRadius: "6px", marginTop: 10, border: "1px solid #38bdf8" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", marginBottom: 6 }}>📏 CALCULATED METRICS (BOQ)</div>
                  <div style={{ fontSize: 11, color: "#cbd5e1", display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span>Skirting (2-Face + Open Ends):</span>
                    <b style={{ color: "#facc15" }}>{selectedWallMetrics.skirtingLengthLm.toFixed(2)} m</b>
                  </div>
                  {selectedWallMetrics.freeEndsCount > 0 && (
                    <div style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic", marginBottom: 4 }}>
                      (Includes {selectedWallMetrics.freeEndsCount} open ends +{selectedWallMetrics.endCapsLengthMm}mm)
                    </div>
                  )}
                  {selectedWallMetrics.sideA.finishType !== "none" && (
                    <div style={{ fontSize: 11, color: "#cbd5e1", display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span>Side A ({selectedWallMetrics.sideA.finishType}):</span>
                      <b style={{ color: "#38bdf8" }}>{selectedWallMetrics.sideA.netAreaM2.toFixed(2)} m²</b>
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


          </>
        ) : (selectedType === "door" || selectedType === "window") && selectedDoor ? (
          (() => {
            const isSelectedWindow = (selectedDoor.type === 'window' ||
              selectedDoor.class === 'window' ||
              selectedDoor.doorTypeId === 'win_standard' ||
              (selectedDoor.doorName && selectedDoor.doorName.startsWith('W-'))) &&
              selectedDoor.class !== 'sliding_door' && selectedDoor.type !== 'sliding';

            if (isSelectedWindow) {
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
                        value={selectedDoor.width_mm || 1200}
                        onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value) })}
                      />
                      <select
                        className="panel-select"
                        style={{ width: '100px' }}
                        value={selectedDoor.width_mm || ""}
                        onChange={(e) => {
                          if (e.target.value) {
                            updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value) });
                          }
                        }}
                      >
                        <option value="">Presets</option>
                        <option value={600}>600</option>
                        <option value={900}>900</option>
                        <option value={1200}>1200</option>
                        <option value={1500}>1500</option>
                        <option value={1800}>1800</option>
                        <option value={2400}>2400</option>
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
                        value={selectedDoor.height_mm || 1200}
                        onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, height_mm: Number(e.target.value) })}
                      />
                      <select
                        className="panel-select"
                        style={{ width: '100px' }}
                        value={selectedDoor.height_mm || ""}
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

                  <div className="panel-field">
                    <span className="panel-label">Rotate & Align</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                      <button
                        className="rp-action-btn"
                        style={{ padding: '6px 8px', fontSize: '11px', background: '#3b82f6', marginBottom: 0 }}
                        onClick={() => {
                          if (selectedDoor.points && selectedDoor.points.length === 2) {
                            const newPoints = [selectedDoor.points[1], selectedDoor.points[0]];
                            updateDoor && updateDoor({
                              ...selectedDoor,
                              points: newPoints
                            });
                          }
                        }}
                        title="Rotate window 180 degrees"
                      >
                        🔄 Đảo Đầu (180°)
                      </button>
                      <button
                        className="rp-action-btn"
                        style={{ padding: '6px 8px', fontSize: '11px', background: '#10b981', marginBottom: 0 }}
                        onClick={() => {
                          if (selectedDoor.points && selectedDoor.points.length === 2) {
                            const p1 = selectedDoor.points[0];
                            const p2 = selectedDoor.points[1];
                            const dx = p2.x - p1.x;
                            const dy = p2.y - p1.y;
                            const angle = Math.atan2(dy, dx);
                            const step = Math.PI / 2;
                            const snappedAngle = Math.round(angle / step) * step;
                            const dist = Math.hypot(dx, dy);
                            const snappedP2 = {
                              x: p1.x + dist * Math.cos(snappedAngle),
                              y: p1.y + dist * Math.sin(snappedAngle)
                            };
                            updateDoor && updateDoor({
                              ...selectedDoor,
                              points: [p1, snappedP2],
                              polygon: null,
                              mask_polygon: null
                            });
                          }
                        }}
                        title="Align window straight on nearest 90 axis"
                      >
                        📐 Làm Thẳng 90°
                      </button>
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

            const rawTypeId = selectedDoor.doorTypeId || selectedDoor.penetration_type || selectedDoor.penetrationType || selectedDoor.class || 'int_hinged_single';
            const activeDoorTypeId = (DOOR_TYPE_REGISTRY[rawTypeId] ? rawTypeId : resolveDoorTypeId(rawTypeId, category));

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
                      value={selectedDoor.width_mm || 760}
                      onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value) })}
                    />
                    <select
                      className="panel-select"
                      style={{ width: '100px' }}
                      value={selectedDoor.width_mm || ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value) });
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
                      value={selectedDoor.height_mm || 1980}
                      onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, height_mm: Number(e.target.value) })}
                    />
                    <select
                      className="panel-select"
                      style={{ width: '100px' }}
                      value={selectedDoor.height_mm || ""}
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
                  <div style={{ fontSize: 13, color: "#f1f5f9" }}>
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
                  <span className="panel-label">Measured Length</span>
                  <div style={{ fontSize: 16, color: "#3b82f6", fontWeight: "bold" }}>
                    {selectedLintel.measuredLength ? `${selectedLintel.measuredLength.toFixed(3)} m` : "0.000 m"}
                  </div>
                </div>

                <div className="panel-field">
                  <span className="panel-label">Final Length (Rounded)</span>
                  <div style={{ fontSize: 18, color: "#f59e0b", fontWeight: "bold" }}>
                    {selectedLintel.finalLength ? `${selectedLintel.finalLength.toFixed(3)} m` : "0.000 m"}
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
                      border: selectedLintel.isRounded ? '1px solid rgba(255,255,255,0.1)' : 'none',
                      color: selectedLintel.isRounded ? '#94a3b8' : '#fff'
                    }}
                    onClick={() => {
                      if (lintelController) {
                        lintelController.roundSingleLintel(selectedLintel.id);
                      }
                    }}
                    title="Round this lintel's length to the nearest 0.3m increment"
                  >
                    {selectedLintel.isRounded ? "✓ Length Rounded" : "🔄 Round Length (0.3m increments)"}
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
        ) : (
          <div className="panel-hint" style={{ padding: "8px 0" }}>Select a wall, room, door, or lintel to edit properties.</div>
        )}
      </div>

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
            <div style={{
              background: "#1e293b",
              borderRadius: "8px",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              border: "1px solid rgba(255, 255, 255, 0.08)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#94a3b8" }}>WALL SIDES:</span>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    onClick={() => setWallSides(2)}
                    style={{
                      padding: "3px 8px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "none",
                      background: wallSides === 2 ? "#10b981" : "#334155",
                      color: "#fff",
                      fontWeight: wallSides === 2 ? "bold" : "normal",
                      cursor: "pointer"
                    }}
                  >
                    2 Sides (Default)
                  </button>
                  <button
                    onClick={() => setWallSides(1)}
                    style={{
                      padding: "3px 8px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "none",
                      background: wallSides === 1 ? "#10b981" : "#334155",
                      color: "#fff",
                      fontWeight: wallSides === 1 ? "bold" : "normal",
                      cursor: "pointer"
                    }}
                  >
                    1 Side
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: "600", color: "#94a3b8" }}>DOOR OPENINGS:</span>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    onClick={() => setDeductDoors(false)}
                    style={{
                      padding: "3px 8px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "none",
                      background: !deductDoors ? "#3b82f6" : "#334155",
                      color: "#fff",
                      fontWeight: !deductDoors ? "bold" : "normal",
                      cursor: "pointer"
                    }}
                  >
                    Gross Area
                  </button>
                  <button
                    onClick={() => setDeductDoors(true)}
                    style={{
                      padding: "3px 8px",
                      fontSize: "11px",
                      borderRadius: "4px",
                      border: "none",
                      background: deductDoors ? "#3b82f6" : "#334155",
                      color: "#fff",
                      fontWeight: deductDoors ? "bold" : "normal",
                      cursor: "pointer"
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
                  color="#e1e4ea"
                />
                <KPICard
                  value={scaleValue ? sumOf(wallData.interior_wall, "lengthM").toFixed(1) : "—"}
                  label="Length"
                  unit={scaleValue ? " m" : ""}
                  color="#e1e4ea"
                />
                <KPICard
                  value={scaleValue ? sumOf(wallData.interior_wall, "areaM2").toFixed(1) : "—"}
                  label="Area"
                  unit={scaleValue ? " m²" : ""}
                  color="#3b82f6"
                />
              </KPIRow>
              {scaleValue && sumOf(wallData.interior_wall, "areaM2") > 0 && (
                <MiniBar ratio={sumOf(wallData.interior_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#3b82f6" />
              )}
            </div>

            {/* Exterior Walls */}
            <div>
              <SectionHeader>Exterior Walls</SectionHeader>
              <KPIRow>
                <KPICard
                  value={wallData.exterior_wall.walls.length}
                  label="Walls"
                  color="#e1e4ea"
                />
                <KPICard
                  value={scaleValue ? sumOf(wallData.exterior_wall, "lengthM").toFixed(1) : "—"}
                  label="Length"
                  unit={scaleValue ? " m" : ""}
                  color="#e1e4ea"
                />
                <KPICard
                  value={scaleValue ? sumOf(wallData.exterior_wall, "areaM2").toFixed(1) : "—"}
                  label="Area"
                  unit={scaleValue ? " m²" : ""}
                  color="#f59e0b"
                />
              </KPIRow>
              {scaleValue && sumOf(wallData.exterior_wall, "areaM2") > 0 && (
                <MiniBar ratio={sumOf(wallData.exterior_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#f59e0b" />
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
                    color="#e1e4ea"
                  />
                  <KPICard
                    value={scaleValue ? sumOf(wallData.partition_wall, "lengthM").toFixed(1) : "—"}
                    label="Length"
                    unit={scaleValue ? " m" : ""}
                    color="#e1e4ea"
                  />
                  <KPICard
                    value={scaleValue ? sumOf(wallData.partition_wall, "areaM2").toFixed(1) : "—"}
                    label="Area"
                    unit={scaleValue ? " m²" : ""}
                    color="#8b5cf6"
                  />
                </KPIRow>
                {scaleValue && sumOf(wallData.partition_wall, "areaM2") > 0 && (
                  <MiniBar ratio={sumOf(wallData.partition_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#8b5cf6" />
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
                    color="#e1e4ea"
                  />
                  <KPICard
                    value={scaleValue ? sumOf(wallData.block_wall, "lengthM").toFixed(1) : "—"}
                    label="Length"
                    unit={scaleValue ? " m" : ""}
                    color="#e1e4ea"
                  />
                  <KPICard
                    value={scaleValue ? sumOf(wallData.block_wall, "areaM2").toFixed(1) : "—"}
                    label="Area"
                    unit={scaleValue ? " m²" : ""}
                    color="#78716c"
                  />
                </KPIRow>
                {scaleValue && sumOf(wallData.block_wall, "areaM2") > 0 && (
                  <MiniBar ratio={sumOf(wallData.block_wall, "areaM2") / Math.max(grandTotalArea, 1)} color="#78716c" />
                )}
              </div>
            )}

            {/* Export */}
            <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {/* <ExportButton onClick={exportWallExcel} disabled={!scaleValue}>
                📥 Export Wall Summary (.xlsx)
              </ExportButton> */}
              <ExportButton onClick={() => { lintelController?.roundAllLintels(); openTakeoffModal(); }} disabled={!scaleValue} >
                📊 Export Takeoff Form (.xlsx)
              </ExportButton>
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
                dotColor="#2196F3"
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
                dotColor="#ef4444"
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
            <div className="rp-floor-title">
              <span style={{ fontSize: "14px" }}>🏠</span>
              <span>Roof Area Summary</span>
            </div>

            {roofCalculations.map((roof, idx) => {
              const isSelected = selectedRoofId === roof.id;
              return (
                <div
                  key={roof.id || idx}
                  className={`rp-area-card${isSelected ? " rp-area-card--active" : ""}`}
                  onClick={() => setSelectedRoofId && setSelectedRoofId(isSelected ? null : roof.id)}
                  style={{ cursor: "pointer", borderLeft: isSelected ? "4px solid #f59e0b" : undefined }}
                >
                  <div className="rp-area-card__top">
                    <div className="rp-area-card__left">
                      <span className="rp-area-card__dot" style={{ background: "#f59e0b" }} />
                      <div className="rp-area-card__label-container">
                        <span className="rp-area-card__label" style={{ fontWeight: 700 }}>
                          {roof.name || `Roof ${idx + 1}`}
                        </span>
                        <span className="rp-area-card__sublabel">
                          Footprint: {scaleValue ? `${roof.footprintM2.toFixed(2)} m²` : "No Scale"}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span className="rp-area-card__value" style={{ fontSize: "15px", fontWeight: 800, color: "#f59e0b" }}>
                        {scaleValue ? `${roof.trueAreaM2.toFixed(2)} m²` : "No Scale"}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px", paddingTop: "6px", borderTop: "1px dashed rgba(255,255,255,0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                      <span>Pitch Slope:</span>
                      <PitchInput
                        value={roof.pitchAngle || 0}
                        onChange={(val) => updateRoofPitch && updateRoofPitch(roof.id, val)}
                      />
                      <span>°</span>
                    </div>

                    {deleteRoof && (
                      <button
                        title="Delete Roof"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRoof(roof.id);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "13px",
                          opacity: 0.8
                        }}
                      >
                        🗑️ Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

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
                  color="#e1e4ea"
                />
                <StatRow
                  label="Total Door Perimeter"
                  value={`${doorMetrics.totalPerimeterM} m`}
                  color="#e1e4ea"
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
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#e1e4ea", marginBottom: "2px" }}>
                      <span style={{ textTransform: "capitalize" }}>{group.label}</span>
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
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#e1e4ea", marginBottom: "2px" }}>
                    <span>{mat}</span>
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
                  color="#e1e4ea"
                />
                <StatRow
                  label="Total Window Perimeter"
                  value={`${windowMetrics.totalPerimeterM} m`}
                  color="#e1e4ea"
                />
              </SummaryCard>
            </div>
          </div>
        ) : (
          <div className="panel-hint" style={{ padding: "8px 0" }}>No windows drawn yet. Click 'Window' in the top Ribbon to draw.</div>
        )}
      </CollapsibleSection>
        </div>
      )}

      {/* ── TAKEOFF EXPORT PROPERTIES MODAL ── */}
      {showTakeoffModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999
        }}>
          <div style={{
            background: "#181a20",
            border: "1px solid #2d3139",
            borderRadius: "12px",
            padding: "24px",
            width: "400px",
            maxWidth: "90%",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
            color: "#e1e4ea"
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "bold", borderBottom: "1px solid #2d3139", paddingBottom: "12px" }}>
              📋 Export Takeoff Excel Form
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af" }}>Project Name</label>
                <input
                  type="text"
                  value={takeoffForm.projectName}
                  onChange={e => setTakeoffForm(prev => ({ ...prev, projectName: e.target.value }))}
                  style={{
                    padding: "8px 12px",
                    background: "#1e2028",
                    color: "#e1e4ea",
                    border: "1px solid #3f4451",
                    borderRadius: "6px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af" }}>Client Name</label>
                <input
                  type="text"
                  value={takeoffForm.clientName}
                  onChange={e => setTakeoffForm(prev => ({ ...prev, clientName: e.target.value }))}
                  style={{
                    padding: "8px 12px",
                    background: "#1e2028",
                    color: "#e1e4ea",
                    border: "1px solid #3f4451",
                    borderRadius: "6px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af" }}>Detailer Name</label>
                <input
                  type="text"
                  value={takeoffForm.detailerName}
                  onChange={e => setTakeoffForm(prev => ({ ...prev, detailerName: e.target.value }))}
                  style={{
                    padding: "8px 12px",
                    background: "#1e2028",
                    color: "#e1e4ea",
                    border: "1px solid #3f4451",
                    borderRadius: "6px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af" }}>Job No</label>
                <input
                  type="text"
                  value={takeoffForm.jobNo}
                  onChange={e => setTakeoffForm(prev => ({ ...prev, jobNo: e.target.value }))}
                  style={{
                    padding: "8px 12px",
                    background: "#1e2028",
                    color: "#e1e4ea",
                    border: "1px solid #3f4451",
                    borderRadius: "6px",
                    fontSize: "13px",
                    outline: "none"
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af" }}>Date</label>
                <input
                  type="text"
                  value={takeoffForm.date}
                  onChange={e => setTakeoffForm(prev => ({ ...prev, date: e.target.value }))}
                  style={{
                    padding: "8px 12px",
                    background: "#1e2028",
                    color: "#e1e4ea",
                    border: "1px solid #3f4451",
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
                  background: "transparent",
                  color: "#e1e4ea",
                  border: "1px solid #3f4451",
                  borderRadius: "6px",
                  fontSize: "13px",
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
