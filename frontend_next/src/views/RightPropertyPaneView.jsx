import React from "react";
import * as XLSX from "xlsx";
import { polygonAreaM2 as polygonAreaM2Util, getWallClass } from "@/utils/geometry";
import { useAppModel } from "@/models/app.context";
import { useDialog } from "@/components/DialogContext";
import { BASE_URL } from "@/models/api.service";
import {
  DOOR_TYPE_REGISTRY,
  getDoorTypeOptions,
  HARDWARE_TYPES,
  MATERIAL_OPTIONS,
  FIRE_RATING_OPTIONS
} from '@/models/DoorTypeRegistry';
import { WALL_HEIGHT_OPTIONS } from '@/components/WallThicknessDialog';

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
  selectedWallIds = [], updateWallsProperty, deleteWalls, interactionMode, setInteractionMode, pxToMm,
  autoMergeCollinearWalls,
  walls = [],
  doors = [],
  deleteItem,
  selectedRoofId,
  setSelectedRoofId,
  updateRoofPitch,
  deleteRoof,
  lintelController,
  selectedId
}) {
  const { showConfirm } = useDialog();
  const { wasteByPage, setWasteByPage, roofsByPage, setRoofsByPage, currentPage, currentProjectName, user, lintelsByPage } = useAppModel();
  const [isRoofSummaryExpanded, setIsRoofSummaryExpanded] = React.useState(true);

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

  // 1. Calculations for Walls
  const wallData = React.useMemo(() => {
    const groups = {
      interior_wall: { label: "Interior", color: "#3b82f6", walls: [] },
      exterior_wall: { label: "Exterior", color: "#f59e0b", walls: [] },
      partition_wall: { label: "Partition", color: "#8b5cf6", walls: [] },
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
      const areaM2 = lengthM != null ? lengthM * heightM : null;

      const type = getWallClass(w);
      const key = groups[type] ? type : "interior_wall";

      groups[key].walls.push({ id: w.id, lengthM, heightM, areaM2, thicknessMm: w.thickness || 90 });
    });

    return groups;
  }, [walls, scaleValue, savedDefault]);

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
      !(room.id && String(room.id).startsWith("text-"))
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
        s(r, 0, String(w.id)); s(r, 1, `${group.label} Wall`);
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

      const mappedWalls = walls.map(w => {
        const c = w.centerline;
        let lengthMm = 0;
        if (c && c.length === 2) {
          const dx = c[1][0] - c[0][0];
          const dy = c[1][1] - c[0][1];
          const lengthPx = Math.hypot(dx, dy);
          lengthMm = scaleValue ? lengthPx * scaleValue * 1000 : 0;
        }
        return {
          id: String(w.id),
          class_name: getWallClass(w),
          length_mm: lengthMm,
          height_mm: w.height ?? savedDefault,
          thickness_mm: w.thickness || 90
        };
      });

      const mappedDoors = doors.map(d => {
        let t = d.penetration_type || d.penetrationType || "";
        let cls = d.class || "";
        let type = d.type || "";
        const isWindow = type === 'window' || cls === 'window' || d.doorTypeId === 'win_standard' || (d.doorName && d.doorName.startsWith('W-'));
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

        return {
          id: String(d.id),
          door_type: doorType,
          width_mm: d.width_mm || 760,
          height_mm: d.height_mm || 1980,
          qty: 1
        };
      });

      const pageLintels = lintelsByPage[currentPage] || [];
      const mappedLintels = pageLintels.map(l => ({
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
        description: l.description || "Lintels"
      }));

      const payload = {
        walls: mappedWalls,
        doors: mappedDoors,
        lintels: mappedLintels,
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

  return (
    <div className="cad-panel">
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
        ) : selectedType === "wall" && (selectedWall || selectedWallIds.length > 0) ? (
          <>
            {selectedWallIds.length <= 1 && selectedWall && (
              <div className="panel-field">
                <span className="panel-label">Wall ID</span>
                <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: "bold" }}>
                  {selectedWall.id}
                </div>
              </div>
            )}

            {selectedWallIds.length > 1 && (
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>
                Selected: <b>{selectedWallIds.length} walls</b>
              </div>
            )}

            <div className="panel-field">
              <span className="panel-label">Wall Type</span>
              <select
                className="panel-select"
                value={
                  selectedWallIds.length > 1
                    ? "multiple"
                    : (selectedWall ? getWallClass(selectedWall) : "interior_wall")
                }
                onChange={(e) => {
                  if (e.target.value === "multiple") return;
                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                  updateWallsProperty && updateWallsProperty(targetIds, "class_name", e.target.value);
                }}
              >
                {selectedWallIds.length > 1 && <option value="multiple" disabled>-- Multiple Types --</option>}
                <option value="exterior_wall">Exterior Wall</option>
                <option value="interior_wall">Interior Wall</option>
                <option value="partition_wall">Partition Wall</option>
              </select>
            </div>

            <div className="panel-field">
              <span className="panel-label">Wall Thickness</span>
              <select
                className="panel-select"
                value={
                  selectedWallIds.length > 1
                    ? "multiple"
                    : (selectedWall?.thickness ?? (selectedWall && pxToMm ? Math.round(pxToMm(selectedWall.thickness_px, realScale)) : 90))
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

            {selectedWallIds.length === 1 && selectedWall && selectedWallLengthM !== null && (
              <div className="panel-field">
                <span className="panel-label">Wall Length</span>
                <div className="panel-value" style={{ fontSize: 13, color: "#e1e4ea" }}>
                  <b>{selectedWallLengthM.toFixed(2)}</b> m
                </div>
              </div>
            )}

            {selectedWallIds.length === 1 && selectedWall && (
              <div style={{ marginTop: 12 }}>
                <button
                  className="rp-action-btn"
                  style={{
                    background: interactionMode === "cut-wall" ? "#dc2626" : "#3b82f6",
                  }}
                  onClick={() => {
                    setInteractionMode && setInteractionMode((prev) => (prev === "cut-wall" ? "select" : "cut-wall"));
                  }}
                >
                  {interactionMode === "cut-wall" ? "Cancel Cut Mode" : "Cut/Split Wall"}
                </button>
              </div>
            )}

            <div style={{ marginTop: 4 }}>
              <button
                className="rp-action-btn"
                style={{ background: "#10b981" }}
                onClick={() => {
                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : selectedWall ? [selectedWall.id] : [];
                  autoMergeCollinearWalls && autoMergeCollinearWalls(targetIds);
                }}
              >
                Merge Aligned Walls
              </button>
            </div>

            <div style={{ marginTop: 4 }}>
              <button
                className="rp-action-btn rp-action-btn--danger"
                onClick={() => {
                  const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                  deleteWalls && deleteWalls(targetIds);
                }}
              >
                Delete Selected Wall(s)
              </button>
            </div>
          </>
        ) : (selectedType === "door" || selectedType === "window") && selectedDoor ? (
          (() => {
            const isSelectedWindow = selectedDoor.type === 'window' ||
              selectedDoor.class === 'window' ||
              selectedDoor.doorTypeId === 'win_standard' ||
              (selectedDoor.doorName && selectedDoor.doorName.startsWith('W-'));

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
                    value={selectedDoor.doorTypeId || selectedDoor.penetration_type || selectedDoor.penetrationType || "int_hinged_single"}
                    onChange={(e) => {
                      const typeId = e.target.value;
                      const def = DOOR_TYPE_REGISTRY[typeId];
                      updateDoor && updateDoor({
                        ...selectedDoor,
                        doorTypeId: typeId,
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

                <div className="panel-field">
                  <span className="panel-label">Xoay & Lật Cửa (Rotate & Flip)</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                    <button
                      className="rp-action-btn"
                      style={{ padding: '6px 8px', fontSize: '11px', background: '#3b82f6', marginBottom: 0 }}
                      onClick={() => {
                        const currentHinge = selectedDoor.hinge_side || selectedDoor.hingeSide || "left";
                        const nextHinge = currentHinge === "left" ? "right" : "left";
                        updateDoor && updateDoor({
                          ...selectedDoor,
                          hinge_side: nextHinge,
                          hingeSide: nextHinge
                        });
                      }}
                      title="Lật lề cửa Trái ↔ Phải"
                    >
                      ↔️ Lật Trái/Phải
                    </button>
                    <button
                      className="rp-action-btn"
                      style={{ padding: '6px 8px', fontSize: '11px', background: '#3b82f6', marginBottom: 0 }}
                      onClick={() => {
                        const currentSwing = selectedDoor.swing_direction || selectedDoor.swing || "inward";
                        const nextSwing = currentSwing === "inward" ? "outward" : "inward";
                        updateDoor && updateDoor({
                          ...selectedDoor,
                          swing_direction: nextSwing,
                          swing: nextSwing
                        });
                      }}
                      title="Lật chiều mở Trong ↔ Ngoài"
                    >
                      ↕️ Lật Trong/Ngoài
                    </button>
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
                      title="Xoay cửa 180 độ bằng cách đảo ngược hai điểm đầu cuối"
                    >
                      🔄 Đảo Đầu (180°)
                    </button>
                    <button
                      className="rp-action-btn"
                      style={{ padding: '6px 8px', fontSize: '11px', background: '#10b981', marginBottom: 0 }}
                      onClick={() => {
                        if (selectedDoor.points && selectedDoor.points.length === 2) {
                          const pts = selectedDoor.points.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
                          const rawP1 = pts[0];
                          const rawP2 = pts[1];

                          const poly = selectedDoor.polygon || selectedDoor.mask_polygon;
                          let hinge = rawP1;
                          let frameEnd = rawP2;
                          let determinedSwing = selectedDoor.swing || selectedDoor.swing_direction || selectedDoor.swingDirection || 'inward';

                          if (poly && poly.length >= 3) {
                            // 1. Find the apex point in poly furthest from the frame line rawP1 -> rawP2
                            const lineDx = rawP2.x - rawP1.x;
                            const lineDy = rawP2.y - rawP1.y;
                            const lineLen = Math.hypot(lineDx, lineDy);
                            let maxPerpDist = -1;
                            let apex = null;

                            if (lineLen > 1e-3) {
                              for (const pt of poly) {
                                const px = Array.isArray(pt) ? pt[0] : pt.x;
                                const py = Array.isArray(pt) ? pt[1] : pt.y;
                                const dist = Math.abs(lineDx * (py - rawP1.y) - lineDy * (px - rawP1.x)) / lineLen;
                                if (dist > maxPerpDist) {
                                  maxPerpDist = dist;
                                  apex = { x: px, y: py };
                                }
                              }
                            }

                            if (apex && maxPerpDist > 5) {
                              // 2. Identify hinge point: distance(apex, Hinge) is smaller than distance(apex, FrameEnd)
                              const distToP1 = Math.hypot(apex.x - rawP1.x, apex.y - rawP1.y);
                              const distToP2 = Math.hypot(apex.x - rawP2.x, apex.y - rawP2.y);
                              if (distToP1 <= distToP2) {
                                hinge = rawP1;
                                frameEnd = rawP2;
                              } else {
                                hinge = rawP2;
                                frameEnd = rawP1;
                              }

                              // 3. Compute swing direction relative to hinge -> frameEnd vector in 2D SVG space (+Y down)
                              const vFrame = { x: frameEnd.x - hinge.x, y: frameEnd.y - hinge.y };
                              const vLeaf = { x: apex.x - hinge.x, y: apex.y - hinge.y };
                              const vInward = { x: -vFrame.y, y: vFrame.x };
                              const dotInward = vLeaf.x * vInward.x + vLeaf.y * vInward.y;
                              determinedSwing = dotInward > 0 ? 'inward' : 'outward';
                            }
                          }

                          // Snap frameEnd to nearest 90-degree axis relative to hinge, preserving original width_mm
                          const dx = frameEnd.x - hinge.x;
                          const dy = frameEnd.y - hinge.y;
                          const angle = Math.atan2(dy, dx);
                          const step = Math.PI / 2;
                          const snappedAngle = Math.round(angle / step) * step;
                          const dist = (selectedDoor.width_mm && realScale) ? (selectedDoor.width_mm / realScale) : Math.hypot(dx, dy);
                          const snappedFrameEnd = {
                            x: hinge.x + dist * Math.cos(snappedAngle),
                            y: hinge.y + dist * Math.sin(snappedAngle)
                          };

                          updateDoor && updateDoor({
                            ...selectedDoor,
                            points: [hinge, snappedFrameEnd],
                            width_mm: selectedDoor.width_mm || (realScale ? Math.round(dist * realScale) : undefined),
                            hingeSide: 'left',
                            hinge_side: 'left',
                            swing: determinedSwing,
                            swingDirection: determinedSwing,
                            swing_direction: determinedSwing,
                            polygon: null,
                            mask_polygon: null
                          });
                        }
                      }}
                      title="Làm thẳng cửa theo trục 90 độ gần nhất"
                    >
                      📐 Làm Thẳng 90°
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <button className="rp-action-btn rp-action-btn--danger" onClick={async (e) => {
                    e.stopPropagation();
                    if (await showConfirm("Are you sure you want to delete this door?")) {
                      deleteDoor && deleteDoor(selectedDoor.id);
                    }
                  }}
                  >
                    Delete Selected Door
                  </button>
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
                  <span className="panel-label">Description</span>
                  <div style={{ fontSize: 13, color: "#f1f5f9" }}>
                    {selectedLintel.description || "Lintels"} ({selectedLintel.type || "LVL"})
                  </div>
                </div>

                <div className="panel-field">
                  <span className="panel-label">Size</span>
                  <div style={{ fontSize: 13, color: "#f1f5f9" }}>
                    {selectedLintel.height}x{selectedLintel.width} mm
                  </div>
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
                  {/* Per-lintel "Round Length" action */}
                  <button
                    className="rp-action-btn"
                    style={{ padding: '6px 8px', fontSize: '11px', background: '#f59e0b', marginTop: '6px', marginBottom: 0, width: '100%' }}
                    onClick={() => {
                      if (lintelController) {
                        lintelController.roundSingleLintel(selectedLintel.id);
                      }
                    }}
                    title="Round this lintel's length to the nearest 0.3m increment"
                  >
                    🔄 Round Length (0.3m increments)
                  </button>
                </div>

                <div className="panel-field">
                  <span className="panel-label">Parent Wall ID</span>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {selectedLintel.wallId}
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
            <AreaCard
              label="Dry"
              value={`${dry.toFixed(2)} m²`}
              dotColor="#2196F3"
              ratio={totalInternal > 0 ? dry / totalInternal : 0}
              parentLabel="internal"
              isActive={highlightType === "dry"}
              onClick={() => toggleRoomHighlight("dry")}
            />
            <AreaCard
              label="Wet"
              value={`${wet.toFixed(2)} m²`}
              dotColor="#ef4444"
              ratio={totalInternal > 0 ? wet / totalInternal : 0}
              parentLabel="internal"
              isActive={highlightType === "wet"}
              onClick={() => toggleRoomHighlight("wet")}
            />

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
            <AreaCard
              label="Timber Deck"
              value={`${timber.toFixed(2)} m²`}
              dotColor="#8B5E3C"
              ratio={totalExternal > 0 ? timber / totalExternal : 0}
              parentLabel="external"
              isActive={highlightType === "timber_deck"}
              onClick={() => toggleRoomHighlight("timber_deck")}
            />
            <AreaCard
              label="Tile Deck"
              value={`${tile.toFixed(2)} m²`}
              dotColor="#4CAF50"
              ratio={totalExternal > 0 ? tile / totalExternal : 0}
              parentLabel="external"
              isActive={highlightType === "tile_deck"}
              onClick={() => toggleRoomHighlight("tile_deck")}
            />

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
                  value={totalDoorCount}
                  color="#10b981"
                  bold
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
                  value={totalWindowCount}
                  color="#2196f3"
                  bold
                />
              </SummaryCard>
            </div>
          </div>
        ) : (
          <div className="panel-hint" style={{ padding: "8px 0" }}>No windows drawn yet. Click 'Window' in the top Ribbon to draw.</div>
        )}
      </CollapsibleSection>

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
