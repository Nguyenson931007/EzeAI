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
import * as CairnsHardwareTasks from "@/components/cairns-hardware/tasks";
import * as BunNswActTasks from "@/components/bun-nsw-act/tasks";
import * as AtsFtTasks from "@/components/ats-ft/tasks";
import * as BunSaTasks from "@/components/bun-sa/tasks";
import * as BunSeqldTasks from "@/components/bun-seqld/tasks";
import * as BunTasTasks from "@/components/bun-tas/tasks";
import * as BunVicTasks from "@/components/bun-vic/tasks";
import * as BunningsQldTasks from "@/components/bunnings-qld/tasks";

export const CUSTOMER_TASK_PACKS = {
  "bun-nsw-act": { name: "Bunnings NSW / ACT", short: "NSW / ACT", tasks: BunNswActTasks },
  "cairns-hardware": { name: "Cairns Hardware", short: "Cairns HW", tasks: CairnsHardwareTasks },
  "bunnings-qld": { name: "Bunnings QLD", short: "BUN QLD", tasks: BunningsQldTasks },
  "bun-vic": { name: "Bunnings VIC", short: "BUN VIC", tasks: BunVicTasks },
  "bun-seqld": { name: "Bunnings SEQLD", short: "BUN SEQLD", tasks: BunSeqldTasks },
  "bun-sa": { name: "Bunnings SA", short: "BUN SA", tasks: BunSaTasks },
  "bun-tas": { name: "Bunnings TAS", short: "BUN TAS", tasks: BunTasTasks },
  "ats-ft": { name: "ATS - FT", short: "ATS FT", tasks: AtsFtTasks }
};

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

// ── EXTRA TAKEOFF & CONFIG MODULE TABS ──
const EXTRA_MODULE_TABS = [
  {
    id: "frame_hardware",
    label: "Frame",
    title: "Frame Hardware",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    )
  },
  {
    id: "flooring_decking",
    label: "Floor",
    title: "Flooring & Decking - GF",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v6M15 9v6M9 15v6" />
      </svg>
    )
  },
  {
    id: "hebel_flooring",
    label: "Hebel",
    title: "Hebel Flooring",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    )
  },
  {
    id: "insulation",
    label: "Insu",
    title: "Insulation",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    )
  },
  {
    id: "eaves_soffit",
    label: "Eaves",
    title: "Eaves & Soffit",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M3 9l9-6 9 6" />
        <path d="M4 10v10h16V10" />
        <path d="M2 10h20" strokeWidth="2" />
      </svg>
    )
  },
  {
    id: "cladding",
    label: "Cladding",
    title: "Cladding",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <rect x="3" y="3" width="18" height="5" rx="1" />
        <rect x="3" y="10" width="18" height="5" rx="1" />
        <rect x="3" y="17" width="18" height="5" rx="1" />
      </svg>
    )
  },
  {
    id: "lock_up",
    label: "Lockup",
    title: "Lockup",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    )
  },
  {
    id: "shelving",
    label: "Shelving",
    title: "Shelving",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M4 4v16M20 4v16M4 7h16M4 12h16M4 17h16" />
      </svg>
    )
  },
  {
    id: "timber_posts",
    label: "Beams",
    title: "Beams & Posts",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <rect x="6" y="3" width="12" height="18" rx="1" />
        <path d="M6 8h12M6 16h12M12 3v18" />
      </svg>
    )
  },
  {
    id: "power_truss_braces",
    label: "Truss",
    title: "Power Truss Braces",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M3 20h18L12 4z" />
        <path d="M12 4v16M7.5 12l4.5 8M16.5 12l-4.5 8" />
      </svg>
    )
  },
  {
    id: "doors_furniture",
    label: "Furniture",
    title: "Doors & Furniture",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" />
        <path d="M3 11v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
        <path d="M5 18v2M19 18v2" />
      </svg>
    )
  },
  {
    id: "fow_plumbing",
    label: "Plumbing",
    title: "FOW Plumbing",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M6 3v6a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V3" />
        <path d="M12 12v9" />
        <circle cx="12" cy="18" r="2.5" />
      </svg>
    )
  },
  {
    id: "fixout",
    label: "Fixout",
    title: "Fixout & Trims",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
        <path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
      </svg>
    )
  },
  {
    id: "final_fit",
    label: "Final",
    title: "Final Fit & Hardware",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <circle cx="7.5" cy="15.5" r="4.5" />
        <path d="m21 2-9.6 9.6M15.5 7.5l3 3" />
      </svg>
    )
  },
  {
    id: "sheet_schedule",
    label: "Sheet",
    title: "Sheet Schedule (Gyprock & FC)",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    )
  }
];

const ALL_MODULE_IDS = EXTRA_MODULE_TABS.map(m => m.id);

const MODULE_KEY_MAP = {
  "frame_hardware": "frame_hardware",
  "frame hardware": "frame_hardware",
  "frame": "frame_hardware",
  "hardware": "frame_hardware",
  "frame_hw": "frame_hardware",
  "frame hw": "frame_hardware",
  "eaves_soffit": "eaves_soffit",
  "eaves_soffits": "eaves_soffit",
  "eaves & soffit": "eaves_soffit",
  "eaves & soffits": "eaves_soffit",
  "eaves and soffit": "eaves_soffit",
  "eaves and soffits": "eaves_soffit",
  "eaves soffit": "eaves_soffit",
  "eaves": "eaves_soffit",
  "soffit": "eaves_soffit",
  "soffits": "eaves_soffit",
  "cladding": "cladding",
  "clad": "cladding",
  "wall_cladding": "cladding",
  "wall cladding": "cladding",
  "insulation": "insulation",
  "insulations": "insulation",
  "lock_up": "lock_up",
  "lock up": "lock_up",
  "lockup": "lock_up",
  "lock-up": "lock_up",
  "shelving": "shelving",
  "shelves": "shelving",
  "shelf": "shelving",
  "shelvings": "shelving",
  "timber_posts": "timber_posts",
  "timber posts": "timber_posts",
  "timber_post": "timber_posts",
  "timber post": "timber_posts",
  "posts": "timber_posts",
  "post": "timber_posts",
  "beams_posts": "timber_posts",
  "beams & posts": "timber_posts",
  "beams and posts": "timber_posts",
  "beams posts": "timber_posts",
  "beams": "timber_posts",
  "flooring_decking": "flooring_decking",
  "flooring & decking": "flooring_decking",
  "flooring": "flooring_decking",
  "decking": "flooring_decking",
  "flooring decking": "flooring_decking",
  "floor_decking": "flooring_decking",
  "hebel": "flooring_decking",
  "hebel flooring": "flooring_decking",
  "hebel_flooring": "flooring_decking",
  "hebel floor": "flooring_decking",
  "power_truss_braces": "power_truss_braces",
  "power truss braces": "power_truss_braces",
  "truss_braces": "power_truss_braces",
  "truss braces": "power_truss_braces",
  "truss": "power_truss_braces",
  "braces": "power_truss_braces",
  "power truss": "power_truss_braces",
  "doors_furniture": "doors_furniture",
  "doors & furniture": "doors_furniture",
  "doors furniture": "doors_furniture",
  "furniture": "doors_furniture",
  "doors": "doors_furniture",
  "door_furniture": "doors_furniture",
  "opening": "doors_furniture",
  "fow_plumbing": "fow_plumbing",
  "fow plumbing": "fow_plumbing",
  "plumbing": "fow_plumbing",
  "fow": "fow_plumbing",
  "plumb": "fow_plumbing",
  "fixout": "fixout",
  "fix out": "fixout",
  "fix-out": "fixout",
  "final_fit": "final_fit",
  "final fit": "final_fit",
  "final-fit": "final_fit",
  "sheet_schedule": "sheet_schedule",
  "sheet schedule": "sheet_schedule",
  "sheet-schedule": "sheet_schedule",
  "sheets": "sheet_schedule",
  "plasterboard": "sheet_schedule",
  "gyprock": "sheet_schedule"
};

function normalizeModuleId(rawStr) {
  if (!rawStr || typeof rawStr !== "string") return null;
  const clean = rawStr.trim().toLowerCase().replace(/[\-_]+/g, " ");
  if (MODULE_KEY_MAP[clean]) return MODULE_KEY_MAP[clean];
  const underscore = rawStr.trim().toLowerCase().replace(/\s+/g, "_");
  if (MODULE_KEY_MAP[underscore]) return MODULE_KEY_MAP[underscore];
  for (const [key, val] of Object.entries(MODULE_KEY_MAP)) {
    if (clean === key || clean.includes(key) || key.includes(clean)) return val;
  }
  return null;
}

function isSubtaskChecked(item) {
  if (!item) return false;
  if (typeof item === "string") return true;
  if (typeof item !== "object") return false;

  // Explicit false/0 flags
  if (item.checked === false || item.checked === 0 || item.checked === "false" || item.checked === "0") return false;
  if (item.enabled === false || item.enabled === 0 || item.enabled === "false" || item.enabled === "0") return false;
  if (item.selected === false || item.selected === 0 || item.selected === "false" || item.selected === "0") return false;
  if (item.is_selected === false || item.is_selected === 0 || item.is_selected === "false" || item.is_selected === "0") return false;
  if (item.is_checked === false || item.is_checked === 0 || item.is_checked === "false" || item.is_checked === "0") return false;
  if (item.active === false || item.active === 0 || item.active === "false" || item.active === "0") return false;
  if (item.status === false || item.status === 0 || item.status === "0" || item.status === "false" || item.status === "inactive" || item.status === "unchecked") return false;
  if (typeof item.percent === "number" && item.percent === 0) return false;
  if (typeof item.percentage === "number" && item.percentage === 0) return false;
  if (typeof item.progress === "number" && item.progress === 0 && item.checked === undefined && item.status === undefined) return false;

  return true;
}

function resolveTaskModules(taskContext) {
  if (!taskContext) return null;

  if (Array.isArray(taskContext)) {
    const list = taskContext.map(item => {
      if (typeof item === "string") return normalizeModuleId(item);
      if (item && typeof item === "object") {
        if (!isSubtaskChecked(item)) return null;
        const nameCandidate = item.id || item.name || item.title || item.label || item.module || item.key || item.task_name || item.subtask || item.scope || item.type || item.task;
        if (nameCandidate) return normalizeModuleId(nameCandidate);
      }
      return null;
    }).filter(Boolean);
    return list.length > 0 ? Array.from(new Set(list)) : null;
  }

  if (typeof taskContext === "string") {
    try {
      const parsed = JSON.parse(taskContext);
      if (parsed) {
        const res = resolveTaskModules(parsed);
        if (res && res.length > 0) return res;
      }
    } catch (_) { }
    const items = taskContext.split(/[,;|]/).map(s => normalizeModuleId(s)).filter(Boolean);
    return items.length > 0 ? Array.from(new Set(items)) : null;
  }

  if (typeof taskContext === "object") {
    const candidateFields = [
      "selectedModules", "selected_modules", "modules", "task_modules",
      "subtasks", "tasks", "items", "scopes", "task_list", "checklist", "active_modules", "data"
    ];
    for (const f of candidateFields) {
      if (taskContext[f]) {
        const res = resolveTaskModules(taskContext[f]);
        if (res && res.length > 0) return res;
      }
    }
    const matched = [];
    for (const [k, v] of Object.entries(taskContext)) {
      if (v === true || v === 1 || v === "1" || v === "true" || (typeof v === "object" && isSubtaskChecked(v))) {
        const norm = normalizeModuleId(k);
        if (norm && !matched.includes(norm)) matched.push(norm);
      }
    }
    if (matched.length > 0) return matched;
  }

  return null;
}

function getInitialEnabledModules() {
  if (typeof window === "undefined") return ALL_MODULE_IDS;

  // 1. URL Query Search Params
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const qModules = urlParams.get("modules") || urlParams.get("selectedModules") || urlParams.get("tasks") || urlParams.get("task_modules");
    if (qModules) {
      const parsed = resolveTaskModules(qModules);
      if (parsed && parsed.length > 0) return parsed;
    }
  } catch (_) { }

  // 2. Local/Session Storage explicit selectedModules
  try {
    const stored = sessionStorage.getItem("selectedModules") || localStorage.getItem("selectedModules");
    if (stored) {
      const parsed = resolveTaskModules(stored);
      if (parsed && parsed.length > 0) return parsed;
    }
  } catch (_) { }

  // 3. Pending EMS Job Task
  try {
    const pendingJobStr = sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob");
    if (pendingJobStr) {
      const parsed = resolveTaskModules(JSON.parse(pendingJobStr));
      if (parsed && parsed.length > 0) return parsed;
    }
  } catch (_) { }

  // 4. Safe fallback: All modules enabled
  return ALL_MODULE_IDS;
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

  // ── PANE TAB STATE ("explorer" | "summary" | "job_task" | custom module IDs) ──
  const [activePaneTab, setActivePaneTab] = React.useState("explorer");
  const [explorerViewMode, setExplorerViewMode] = React.useState("tree"); // "tree" | "properties"
  const [explorerSearch, setExplorerSearch] = React.useState("");
  const [showCustomThickness, setShowCustomThickness] = React.useState(false);
  const [showCustomHeight, setShowCustomHeight] = React.useState(false);
  const [expandedNodes, setExpandedNodes] = React.useState(() => new Set([
    "root",
    "floor_0"
  ]));

  // ── DYNAMIC MODULE TABS STATE (DRIVEN BY WEB3 TASK CONTEXT) ──
  const [enabledModuleIds, setEnabledModuleIds] = React.useState(() => getInitialEnabledModules());
  const [showAddModulePopup, setShowAddModulePopup] = React.useState(false);
  const addModulePopupRef = React.useRef(null);

  // ── CUSTOMER / CLIENT TASK FORM SELECTION ──
  const [selectedCustomerClient, setSelectedCustomerClient] = React.useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selectedCustomerClient") || sessionStorage.getItem("selectedCustomerClient") || "bun-nsw-act";
    }
    return "bun-nsw-act";
  });

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
      SheetScheduleTask: pack.SheetScheduleTask || fallback.SheetScheduleTask || fallback2.SheetScheduleTask
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
    SheetScheduleTask
  } = activeCustomerTasks;

  // Dynamic sync enabledModuleIds when pendingEmsJob or selectedModules or URL params update
  React.useEffect(() => {
    const syncModulesFromContext = () => {
      const resolved = getInitialEnabledModules();
      if (resolved && resolved.length > 0) {
        setEnabledModuleIds(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(resolved)) {
            return resolved;
          }
          return prev;
        });
      }
    };

    syncModulesFromContext();

    window.addEventListener("storage", syncModulesFromContext);
    window.addEventListener("task-modules-updated", syncModulesFromContext);

    return () => {
      window.removeEventListener("storage", syncModulesFromContext);
      window.removeEventListener("task-modules-updated", syncModulesFromContext);
    };
  }, [currentProjectName, user]);

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
    power_truss_braces: { truss_area: "", brace_type: "", length: "", hardware: "" }
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
    setModuleFormData(prev => ({
      ...prev,
      [moduleId]: {
        ...(moduleId === "cladding" || moduleId === "flooring_decking" ? { waste_allowance: "10" } : {}),
        ...(moduleId === "insulation" ? { stud_centres: "450" } : {}),
        ...(moduleId === "timber_posts" ? { height: "2700", quantity: "1" } : {}),
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

    const externalWallLength = cadMetrics?.externalWallLength || (extWallLenM > 0 ? extWallLenM : 46.8);
    const internalWallLength = cadMetrics?.internalWallLength || (intWallLenM > 0 ? intWallLenM : 28.5);
    const grandTotalLength = cadMetrics?.grandTotalLength || (grandTotLenM > 0 ? grandTotLenM : 75.3);
    const totalRoofArea = cadMetrics?.totalRoofArea || 142.0;
    const totalRoomArea = cadMetrics?.totalRoomArea || 112.5;

    if (moduleId === "frame_hardware") {
      const groupsMap = {}; // key: `${baseType}_${height}_${spacing}` -> { baseType, height, spacing, totalMm, count, rodSize }

      curWalls.forEach(w => {
        let lenMm = 0;
        if (w.length_m) {
          lenMm = Math.round(w.length_m * 1000);
        } else if (w.centerline && w.centerline.length === 2) {
          const dx = w.centerline[1][0] - w.centerline[0][0];
          const dy = w.centerline[1][1] - w.centerline[0][1];
          const px = Math.hypot(dx, dy);
          lenMm = effScale < 0.5 ? Math.round(px * effScale * 1000) : Math.round(px * effScale);
        }
        if (lenMm <= 0) return;
        const h = String(w.height_mm || w.height || 2400);
        const sp = String(w.spacing || w.stud_spacing || 900);
        const rodSz = w.rod_size || "M12";

        const rawFloor = String(w.floor_type || w.floorType || w.base_construction || "").toLowerCase();
        const isSlab = rawFloor === "slab" || rawFloor === "concrete slab" || rawFloor.includes("slab") || rawFloor.includes("concrete");
        const baseType = isSlab ? "Concrete Slab" : "Timber Floor";

        const groupKey = `${baseType}_${h}_${sp}_${rodSz}`;
        if (!groupsMap[groupKey]) {
          groupsMap[groupKey] = {
            baseType,
            height: h,
            spacing: sp,
            rodSize: rodSz,
            totalMm: 0,
            count: 0
          };
        }
        groupsMap[groupKey].totalMm += lenMm;
        groupsMap[groupKey].count += 1;
      });

      const newEntries = [];
      Object.entries(groupsMap).forEach(([key, g]) => {
        const spacingNum = Number(g.spacing) || 900;
        const rodCount = Math.ceil(g.totalMm / spacingNum) || 1;
        const rodLen = Number(g.height) <= 2440 ? 2700 : (Number(g.height) <= 2740 ? 3000 : 3600);
        newEntries.push({
          id: `frame-ai-${key}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          baseType: g.baseType,
          theWallAbove: g.baseType === "Concrete Slab" ? "ON CONCRETE SLAB FLOOR" : "ON TIMBER FLOOR",
          height: `${g.height} mm`,
          length: `${g.totalMm} mm`,
          spacing: `${g.spacing} mm`,
          rodSize: g.rodSize || "M12",
          rodDemand: (g.totalMm / spacingNum).toFixed(2),
          rodMapping: `${rodCount} x ${g.rodSize || "M12"} Rod ${rodLen}`,
          rodsQty: `${rodCount} pcs`
        });
      });

      if (newEntries.length === 0) {
        const totalLen = grandTotalLength ? Math.round(grandTotalLength * 1000) : 42500;
        const rodCount = Math.ceil(totalLen / 900);
        newEntries.push({
          id: `slab-ai-default-${Date.now()}`,
          baseType: "Concrete Slab",
          theWallAbove: "ON CONCRETE SLAB FLOOR",
          height: "2400 mm",
          length: `${totalLen} mm`,
          spacing: "900 mm",
          rodSize: "M12",
          rodDemand: (totalLen / 900).toFixed(2),
          rodMapping: `${rodCount} x M12 Rod 2700`,
          rodsQty: `${rodCount} pcs`
        });
      }

      setFrameWallEntries(newEntries);
      aiValues = {
        wall_height: "2400 mm",
        wall_length: grandTotalLength ? grandTotalLength.toFixed(2) : "42.50",
        wind_class: "N2",
        base_construction: "Concrete Slab"
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

      if (newFlrEntries.length === 0) {
        const rmArea = totalRoomArea > 0 ? Number(totalRoomArea.toFixed(2)) : (totalRaw > 0 ? Number(totalRaw.toFixed(2)) : 112.5);
        newFlrEntries.push({
          id: "flr-auto-all-" + Date.now(),
          typeArea: "Dry",
          location: "Dry",
          product: "PB STRUCTAFLOR YELLOW TONGUE++3600X800MM 19MM GP",
          areaM2: rmArea,
          wastePercent: 10,
          totalM2: Number(rmArea.toFixed(1)),
          glueType: "FLOORING ADHESIVE 600ML SAUSAGE",
          glueQty: Math.ceil((rmArea * 1.1) / 12)
        });
      }

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
        totalFloorArea: totalRaw > 0 ? totalRaw.toFixed(2) : String(totalRoomArea || 112.5),
        location: "Ground Floor",
        flooring_type: "Hybrid / Vinyl Plank",
        floor_area: totalRaw > 0 ? totalRaw.toFixed(2) : String(totalRoomArea || 112.5),
        waste_allowance: "10"
      };
    } else if (moduleId === "insulation") {
      const extLen = externalWallLength > 0 ? externalWallLength : (grandTotalLength ? grandTotalLength * 0.6 : 42.0);
      const intLen = internalWallLength > 0 ? internalWallLength : (grandTotalLength ? grandTotalLength * 0.4 : 26.0);
      const extArea = Number((extLen * 2.4).toFixed(2));
      const intArea = Number((intLen * 2.4).toFixed(2));
      const ceilArea = Number((totalRoomArea > 0 ? totalRoomArea : (totalRaw > 0 ? totalRaw : 112.5)).toFixed(2));

      setInsulationWallEntries([
        { id: "ins-ai-ext-" + Date.now(), type: "Ext wall", height: 2400, length: Math.round(extLen * 1000), rValue: "R2.5", product: "0810602 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.5HP 90X430 PK12", raked: 0, door: 0, insulationArea: extArea },
        { id: "ins-ai-int-" + Date.now(), type: "Int wall", height: 2400, length: Math.round(intLen * 1000), rValue: "R2.0", product: "0810608 · INS BATTS ACOUSTIC GWOOL KNAUF++EARTHWOOL R2.0 75X430 PK20", raked: 0, door: 0, insulationArea: intArea }
      ]);
      setInsulationAreaEntries([
        { id: "ins-ai-ceil-" + Date.now(), location: "Ceiling / Roof Space", areaType: "Ceiling", rValue: "R4.0", areaM2: ceilArea, totalArea: Number((ceilArea * 1.05).toFixed(2)) }
      ]);
      aiValues = {
        ext_wall_area: String(extArea),
        int_wall_area: String(intArea),
        ceiling_area: String(ceilArea)
      };
    } else if (moduleId === "eaves_soffit") {
      const len = totalRoofArea > 0 ? Number((Math.sqrt(totalRoofArea) * 4).toFixed(2)) : (grandTotalLength ? Number((grandTotalLength * 0.55).toFixed(2)) : 38.6);
      setEavesEntries([
        { id: "eave-ai-1-" + Date.now(), level: "Ground Floor Perimeter", width: 450, length: len, area: Number((len * 0.45).toFixed(2)) }
      ]);
      aiValues = { building_level: "Level 1 (Ground)", eave_width: "450", total_eave_length: String(len), soffit_material: "4.5mm HardieFlex / FC Sheet" };
    } else if (moduleId === "cladding") {
      const extLen = externalWallLength > 0 ? externalWallLength : (grandTotalLength ? Number((grandTotalLength * 0.65).toFixed(2)) : 46.8);
      setCladdingWallEntries([
        { id: "clad-ai-1-" + Date.now(), elevation: "Front & Side A Elevation", height: 2700, length: Math.round(extLen * 600), openings: 4.2, waste: 10, grossArea: Number((extLen * 0.6 * 2.7).toFixed(2)), netArea: Number((extLen * 0.6 * 2.7 - 4.2).toFixed(2)), totalArea: Number(((extLen * 0.6 * 2.7 - 4.2) * 1.1).toFixed(2)) },
        { id: "clad-ai-2-" + Date.now(), elevation: "Rear & Side B Elevation", height: 2700, length: Math.round(extLen * 400), openings: 3.1, waste: 10, grossArea: Number((extLen * 0.4 * 2.7).toFixed(2)), netArea: Number((extLen * 0.4 * 2.7 - 3.1).toFixed(2)), totalArea: Number(((extLen * 0.4 * 2.7 - 3.1) * 1.1).toFixed(2)) }
      ]);
      aiValues = { elevation: "External Walls", cladding_type: "HardiePlank Weatherboard", cladding_area: (extLen * 2.7 * 0.9).toFixed(2), waste_allowance: "10" };
    } else if (moduleId === "timber_posts") {
      setTimberPostEntries([
        { id: "pst-ai-1-" + Date.now(), location: "Alfresco & Porch Support", spec: "90x90mm F7 / H3 Treated Pine", height: 2700, qty: 4, supportType: "Hot-Dip Galvanized Stirrup" }
      ]);
      aiValues = { location: "Alfresco & Porch", timber_size: "90x90mm F7 / H3 Treated Pine", height: "2700", quantity: "4" };
    } else if (moduleId === "fixout") {
      const skirtLm = skirtingSummaryMetrics?.totalSkirtingLm ? Number(skirtingSummaryMetrics.totalSkirtingLm.toFixed(2)) : 98.5;
      const doorCnt = curDoors.length || 7;
      setFixoutDoorEntries([
        { id: "fix-ai-1-" + Date.now(), doorType: "Internal Swing Door", jambType: "Single Rebated Pine Jamb Set", architraveSpec: "67x18mm MDF Architrave", qty: doorCnt }
      ]);
      aiValues = { skirting_profile: "67x18mm MDF Single Rebatable / Colonial", architrave_size: "67x18mm MDF Architrave", jamb_type: "Single Rebated Pine Door Jamb Set", total_length: String(skirtLm) };
    } else if (moduleId === "lock_up" || moduleId === "lockup") {
      const extLen = externalWallLength > 0 ? externalWallLength : (grandTotalLength ? Number((grandTotalLength * 0.65).toFixed(2)) : 46.8);
      const generatedDoors = [];

      if (curDoors && curDoors.length > 0) {
        curDoors.forEach((d, idx) => {
          const dLabel = d.label || d.name || d.door_name || `Door D-${idx + 1}`;
          const rawType = String(d.door_type || d.type || "").toLowerCase();
          const isExt = /entry|front|sliding|patio|balcony|garage|external/i.test(dLabel) || /entry|sliding|external/i.test(rawType);
          const isSliding = /slide|sliding|cavity/i.test(dLabel) || /slide|cavity/i.test(rawType);

          const category = isExt ? "Prehung" : "Loose Jamb";
          const dWidth = d.width ? Math.round(d.width > 200 ? d.width : (d.width * 1000 || 820)) : 820;
          const dHeight = d.height ? Math.round(d.height > 500 ? d.height : (d.height * 1000 || 2040)) : 2040;
          const wallThick = d.wall_thickness || d.thickness_mm || 90;
          const hung = isExt ? (isSliding ? "Sliding Track" : "LH Prehung") : "RH Loose";

          generatedDoors.push({
            id: `lck-door-${d.id || idx}-${Date.now()}`,
            doorId: d.id,
            mode: category === "Loose Jamb" ? "Loose" : "Prehung",
            scope: isExt ? "external" : "internal",
            label: dLabel,
            door_name: dLabel,
            height: dHeight,
            width: dWidth,
            thickness: isExt && !isSliding ? 40 : 35,
            jamb_or_wall: `${wallThick}mm Wall`,
            jamb_size: category === "Loose Jamb" ? "112×19mm 5.4m Loose Jamb" : "112×19mm 5.4m",
            hung: hung || "RH Loose",
            door_type: isExt ? "Type CG" : "Type A",
            door_stop: isExt ? "DS2 with Riser" : "Cushion",
            internal_type: isExt ? null : "HF",
            color: isExt ? null : "CHR",
            default_qty: 1
          });
        });
      }

      if (generatedDoors.length === 0) {
        generatedDoors.push(
          {
            id: "lck-ai-1-" + Date.now(),
            mode: "Prehung",
            scope: "external",
            label: "D01 - Front Entry",
            door_name: "SOLID TIMBER ENTRY DOOR 2040X820X40MM",
            height: 2040,
            width: 820,
            thickness: 40,
            jamb_or_wall: "110mm Brick",
            jamb_size: "135mm",
            hung: "LH Prehung",
            door_type: "Type CG",
            door_stop: "DS2 with Riser",
            internal_type: null,
            color: "CHR",
            default_qty: 1
          },
          {
            id: "lck-ai-2-" + Date.now(),
            mode: "Prehung",
            scope: "external",
            label: "D02 - Patio Sliding Door",
            door_name: "ALUMINIUM SLIDING DOOR 2100X1800MM",
            height: 2100,
            width: 1800,
            thickness: 35,
            jamb_or_wall: "110mm Stud",
            jamb_size: "135mm",
            hung: "Sliding Track",
            door_type: "Type CG",
            door_stop: "Rubber Bumper",
            internal_type: null,
            color: "CHR",
            default_qty: 1
          },
          {
            id: "lck-ai-3-" + Date.now(),
            mode: "Loose",
            scope: "internal",
            label: "D03 - Internal Flush Door",
            door_name: "HUME FLUSH DOOR HONEYCOMB CORE 2040X820X35MM",
            height: 2040,
            width: 820,
            thickness: 35,
            jamb_or_wall: "90mm Stud",
            jamb_size: "112×19mm 5.4m Loose Jamb",
            hung: "RH Loose",
            door_type: "Type A",
            door_stop: "Cushion",
            internal_type: "HF",
            color: "CHR",
            default_qty: curDoors?.length ? Math.max(1, curDoors.length - 2) : 5
          }
        );
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
      aiValues = {
        shelf_material: "16mm White Melamine Board",
        shelf_depth: "450 mm",
        total_runs: "4"
      };
    } else if (moduleId === "fow_plumbing") {
      aiValues = {
        pipe_type: "PEX Flexible Water Pipe",
        drain_size: "100mm PVC DWV Pipe",
        fixtures_count: String(curDoors.length ? Math.max(3, Math.floor(curDoors.length * 0.6)) : 5)
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

    // 0. Tự động trích xuất danh sách module được tick từ Task Web3 nếu có
    const taskModules = resolveTaskModules(task);
    if (taskModules && taskModules.length > 0) {
      setEnabledModuleIds(taskModules);
      try {
        sessionStorage.setItem("selectedModules", JSON.stringify(taskModules));
        localStorage.setItem("selectedModules", JSON.stringify(taskModules));
      } catch (_) { }
    }

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

  // ── DYNAMIC TASK EXPANSION & DRAG RESIZING STATE ──
  const isTaskModuleActive = EXTRA_MODULE_TABS.some(t => t.id === activePaneTab);
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
      selectedRoom
    );

    const currentKey = hasSelection
      ? `${selectedType || ""}:${selectedId || ""}:${(selectedWallIds || []).join(",")}:${(selectedDoorIds || []).join(",")}:${(selectedRoomIds || []).join(",")}:${selectedRoofId || ""}`
      : "none";

    // Skip on initial mount to preserve initial view
    if (prevSelectionKeyRef.current === null) {
      prevSelectionKeyRef.current = currentKey;
      return;
    }

    if (currentKey !== prevSelectionKeyRef.current) {
      const isTaskActive = !!(activePaneTab && activePaneTab !== "explorer" && activePaneTab !== "summary" && activePaneTab !== "job_task" && activePaneTab !== "collapsed");

      if (hasSelection) {
        // Element selected (wall, door, room, roof, etc.):
        // If user was on a task, keep user on that task!
        // If user was on properties / explorer or collapsed, open Properties table
        if (!isTaskActive) {
          setActivePaneTab("explorer");
          setExplorerViewMode("properties");
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
    activePaneTab
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

  // When on Frame task: dynamic wall calculation based on canvas walls
  // Skip auto-generation if frameWallEntries already has entries (don't overwrite AI-filled, DB-loaded, or entered data)
  React.useEffect(() => {
    if (activePaneTab === "frame_hardware") {
      // Do NOT overwrite if frameWallEntries already exist (preserves all entered/calculated walls)
      if (frameWallEntries && frameWallEntries.length > 0) return;

      const curWalls = (wallsByPageProp && wallsByPageProp[currentPage]) ? wallsByPageProp[currentPage] : (walls || []);
      const effScale = (realScale && realScale > 0) ? realScale : (scaleValue && scaleValue > 0 ? scaleValue : 1.0);
      
      const targetWalls = curWalls;

      if (targetWalls.length > 0) {
        const groupsMap = {};

        targetWalls.forEach(w => {
          const override = customWallOverrides[w.id] || {};
          let lenMm = 0;
          if (override.length) {
            lenMm = override.length;
          } else if (w.length_m) {
            lenMm = Math.round(w.length_m * 1000);
          } else if (w.centerline && w.centerline.length === 2) {
            const dx = w.centerline[1][0] - w.centerline[0][0];
            const dy = w.centerline[1][1] - w.centerline[0][1];
            const px = Math.hypot(dx, dy);
            lenMm = effScale < 0.5 ? Math.round(px * effScale * 1000) : Math.round(px * effScale);
          }
          if (lenMm <= 0) return;

          const h = String(override.height || w.height_mm || w.height || 2400);
          const sp = String(override.spacing || w.spacing || w.stud_spacing || 900);
          const rodSz = override.rodSize || w.rod_size || "M12";
          const rawFloor = String(override.baseType || w.floor_type || w.floorType || w.base_construction || "").toLowerCase();
          const isSlab = rawFloor === "slab" || rawFloor === "concrete slab" || rawFloor.includes("slab") || rawFloor.includes("concrete");
          const baseType = isSlab ? "Concrete Slab" : "Timber Floor";

          const groupKey = `${baseType}_${h}_${sp}_${rodSz}`;
          if (!groupsMap[groupKey]) {
            groupsMap[groupKey] = {
              baseType,
              height: h,
              spacing: sp,
              rodSize: rodSz,
              totalMm: 0,
              count: 0,
              wallIds: []
            };
          }
          groupsMap[groupKey].totalMm += lenMm;
          groupsMap[groupKey].count += 1;
          groupsMap[groupKey].wallIds.push(w.id);
        });

        const newEntries = [];
        Object.entries(groupsMap).forEach(([key, g]) => {
          const spacingNum = Number(g.spacing) || 900;
          const rodCount = Math.ceil(g.totalMm / spacingNum) || 1;
          const rodLen = Number(g.height) <= 2440 ? 2700 : (Number(g.height) <= 2740 ? 3000 : 3600);
          newEntries.push({
            id: g.count === 1 && g.wallIds.length === 1 ? `wall-single-${g.wallIds[0]}` : `wall-grp-${key}`,
            wallId: g.count === 1 && g.wallIds.length === 1 ? g.wallIds[0] : undefined,
            wallIds: g.wallIds,
            baseType: g.baseType,
            height: `${g.height} mm`,
            length: `${g.totalMm} mm`,
            spacing: `${g.spacing} mm`,
            rodSize: g.rodSize || "M12",
            rodDemand: (g.totalMm / spacingNum).toFixed(2),
            rodMapping: `${rodCount} x ${g.rodSize || "M12"} Rod ${rodLen}`,
            rodsQty: `${rodCount} pcs`
          });
        });

        if (newEntries.length > 0) {
          setFrameWallEntries(newEntries);
        }
      }
    }
  }, [activePaneTab, currentPage, walls, wallsByPageProp, realScale, scaleValue]);

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
          const dLabel = (d.label || d.door_name || d.name || `D${idx + 1}`).trim();
          const dW = d.width || 820;
          const dH = d.height || 2040;
          const isExt = d.scope === "external" || d.isExternal || /entry|front|back|patio|balcony|sliding/i.test(dLabel);

          return {
            id: `lck-ai-${d.id || idx}-${Date.now()}`,
            // NSW ACT columns
            category: isExt ? "External Door" : "Internal Loose Jamb",
            location: dLabel,
            door: d.door || d.product || (isExt ? "SOLID CORE TIMBER DOOR 2040X820X40MM" : "FLUSH PANEL HONEYCOMB CORE 2040X820X35MM"),
            size: `${dH}×${dW}`,
            thicks: `${d.thickness || (isExt ? 40 : 35)}mm`,
            jambWall: d.jamb_or_wall || "90mm Wall",
            jambSize: d.jamb_size || "112×19mm 5.4m Loose Jamb",
            hung: d.hung || (isExt ? "RH Pre Hung" : "Hung A"),
            type: d.door_type || (isExt ? "Solid Core Entry" : "Type A"),
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
          doorType: g.door,
          jambType: g.jambSize,
          architraveSpec: "67x18mm MDF Single Rebate Architrave",
          qty: g.qty
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

  // 7. Lockup State & Custom Overrides
  const [lockupEntries, setLockupEntries] = React.useState([]);
  const [customLockupOverrides, setCustomLockupOverrides] = React.useState({});

  const handleSetLockupEntries = React.useCallback((actionOrEntries) => {
    setLockupEntries(prev => {
      const next = typeof actionOrEntries === "function" ? actionOrEntries(prev) : actionOrEntries;
      return next;
    });
  }, []);

  // When on Lockup task: dynamic door calculation based on canvas selection
  // Only auto-generate if lockupEntries is empty (don't overwrite AI-filled or DB-loaded data)
  React.useEffect(() => {
    if (activePaneTab === "lockup" || activePaneTab === "lock_up") {
      // Skip auto-generation if entries already exist (from Auto Fill AI, DB load, or manual add)
      if (lockupEntries && lockupEntries.length > 0) return;

      const curDoors = (doorsByPageProp && doorsByPageProp[currentPage]) ? doorsByPageProp[currentPage] : (doors || []);
      const targetDoors = curDoors;

      if (targetDoors.length > 0) {
        const generated = targetDoors.map((d, idx) => {
          const override = customLockupOverrides[d.id] || {};
          const dLabel = override.doorLabel || d.label || d.name || d.door_name || `D-${idx + 1}`;
          const rawType = String(d.door_type || d.type || "").toLowerCase();
          const isExt = /entry|front|sliding|patio|balcony|garage|external/i.test(dLabel) || /entry|sliding|external/i.test(rawType);

          const dWidth = d.width ? Math.round(d.width > 200 ? d.width : (d.width * 1000 || 820)) : 820;
          const dHeight = d.height ? Math.round(d.height > 500 ? d.height : (d.height * 1000 || 2040)) : 2040;
          const wallThick = d.wall_thickness || d.thickness_mm || 90;

          return {
            id: `lck-door-${d.id || Date.now()}-${idx}`,
            doorId: d.id,
            mode: override.category || null,
            scope: isExt ? "external" : "internal",
            label: dLabel,
            door_name: dLabel,
            height: dHeight,
            width: dWidth,
            thickness: isExt ? 40 : 35,
            jamb_or_wall: `${wallThick}mm Wall`,
            jamb_size: override.jambSize || "112×19mm 5.4m",
            hung: override.hung || "Hung A",
            door_type: override.type || (isExt ? "Type CG" : "Type A"),
            door_stop: override.stop || (isExt ? "DS2 with Riser" : "Cushion"),
            internal_type: override.hfHo || (isExt ? null : "HF"),
            color: override.color || (isExt ? null : "CHR"),
            default_qty: override.qty || 1
          };
        });

        setLockupEntries(generated);
      }
    }
  }, [activePaneTab, currentPage, doors, doorsByPageProp]);

  const [trussEntries, setTrussEntries] = React.useState([]);
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

  const cadMetrics = React.useMemo(() => {
    const scale = realScale || 1;
    let totalLenM = 0;
    let extLenM = 0;
    if (Array.isArray(walls)) {
      walls.forEach(w => {
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
      grandTotalLength: grandLen || 42.5,
      grandTotalArea: flrArea || 112.5,
      externalWallLength: extLen || 28.4,
      totalFloorArea: flrArea || 112.5,
      totalRoofArea: rfArea || 145.0,
      perimeterM: perim || 45.0,
      doorCount: Array.isArray(doors) ? doors.length : 8,
      skirtingLm: Number((grandLen * 0.9).toFixed(1)) || 38.0
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
            left: 0,
            top: 0,
            bottom: 0,
            width: "7px",
            cursor: "ew-resize",
            zIndex: 999,
            background: isResizing ? "rgba(37,99,235,0.6)" : "transparent",
            transition: "background 0.2s ease"
          }}
          onMouseEnter={(e) => { if (!isResizing) e.currentTarget.style.background = "rgba(37,99,235,0.25)"; }}
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
            /* ══════════════════════════════════════════════════════
               TAB: EXPLORER / LAYERS TREE VIEW
               ══════════════════════════════════════════════════════ */
            <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto", flex: 1 }}>
              {/* Project Title & Status Bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--blue)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  PROJECT: {currentProjectName || "Modern House"}
                </div>
                <button
                  onClick={() => setActivePaneTab("collapsed")}
                  title="Close panel"
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
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
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
                  <button
                    onClick={() => setActivePaneTab("collapsed")}
                    title="Close task pane"
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
                    {selectedType ? selectedType.toUpperCase() : "PROPERTIES"}
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
                          <span className="panel-label">Opening / Base Length (m)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={Boolean(selectedLintel.isRounded)}
                            title={selectedLintel.isRounded ? "Click 'Revert Round' below to edit opening length" : "Enter opening/base length in metres"}
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
                            value={selectedLintel.baseLength !== undefined && selectedLintel.baseLength !== "" ? (typeof selectedLintel.baseLength === 'number' ? Number(selectedLintel.baseLength.toFixed(3)) : selectedLintel.baseLength) : ""}
                            onChange={(e) => {
                              if (selectedLintel.isRounded) return;
                              const raw = e.target.value;
                              if (raw === "") {
                                if (lintelController) {
                                  lintelController.updateLintel({
                                    ...selectedLintel,
                                    baseLength: "",
                                    measuredLength: ""
                                  });
                                }
                                return;
                              }
                              const val = parseFloat(raw);
                              if (!isNaN(val) && val >= 0) {
                                if (lintelController) {
                                  const offset = selectedLintel.lengthOffset !== undefined ? selectedLintel.lengthOffset : (lintelController.globalLengthOffset || 0);
                                  const baseLen = Math.max(0.01, val);
                                  lintelController.updateLintel({
                                    ...selectedLintel,
                                    baseLength: baseLen,
                                    measuredLength: baseLen + offset
                                  });
                                }
                              }
                            }}
                            onBlur={() => {
                              if (selectedLintel.baseLength === "" || selectedLintel.baseLength === undefined || selectedLintel.baseLength === null) {
                                if (lintelController) {
                                  const offset = selectedLintel.lengthOffset !== undefined ? selectedLintel.lengthOffset : (lintelController.globalLengthOffset || 0);
                                  const restoreBase = 0.3;
                                  lintelController.updateLintel({
                                    ...selectedLintel,
                                    baseLength: restoreBase,
                                    measuredLength: restoreBase + offset
                                  });
                                }
                              }
                            }}
                          />
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                            = Measured: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{typeof selectedLintel.measuredLength === 'number' ? `${selectedLintel.measuredLength.toFixed(3)} m` : (selectedLintel.measuredLength || "0.000 m")}</span>
                            <span style={{ opacity: 0.8 }}> (Base + {selectedLintel.lengthOffset !== undefined ? selectedLintel.lengthOffset : (lintelController?.globalLengthOffset || 0)}m offset)</span>
                          </div>
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
              {/* Summary Header with Close Button */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                position: "sticky",
                top: 0,
                zIndex: 25
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                  <span style={{ fontSize: "12.5px", fontWeight: "800", color: "#0f2744" }}>Summary & Takeoffs</span>
                </div>
                <button
                  onClick={() => setActivePaneTab("collapsed")}
                  title="Close summary pane"
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
        </div>
      )}

      {/* ── SINGLE COLUMN TASK CALCULATION FORM PANEL (REPLACES PROPERTIES WHEN A TASK TAB IS ACTIVE) ── */}
      {isTaskModuleActive && activeModuleTab && activePaneTab !== "collapsed" && (
        <div style={{
          width: "100%",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflowY: "auto",
          background: "#ffffff",
          boxSizing: "border-box",
          padding: "12px",
          gap: "12px"
        }}>
          {/* Header */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "6px",
                  background: "rgba(37,99,235,0.1)",
                  color: "var(--blue)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  {activeModuleTab.icon}
                </div>
                <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "800", color: "#0f2744", letterSpacing: "-0.3px" }}>
                  {activeModuleTab.title}
                </h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  onClick={() => handleResetModuleData(activeModuleTab.id)}
                  title="Reset data"
                  style={{
                    background: "#ffffff",
                    color: "#b91c1c",
                    border: "1px solid #fecaca",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "11px",
                    fontWeight: "700",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  Reset data
                </button>
                <button
                  onClick={() => setActivePaneTab("collapsed")}
                  title="Close task pane"
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
            {/* Customer Form Selector Toolbar */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "6px 10px",
              marginTop: "2px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: "700", color: "#475569", display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>🏢 Client:</span>
                </span>
                <select
                  value={selectedCustomerClient}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedCustomerClient(val);
                    try {
                      localStorage.setItem("selectedCustomerClient", val);
                      sessionStorage.setItem("selectedCustomerClient", val);
                    } catch (_) { }
                  }}
                  style={{
                    padding: "3px 8px",
                    fontSize: "11.5px",
                    fontWeight: "700",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "#ffffff",
                    color: "#0f2744",
                    cursor: "pointer",
                    outline: "none",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
                  }}
                >
                  {Object.entries(CUSTOMER_TASK_PACKS).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.name}
                    </option>
                  ))}
                </select>
              </div>
              <span style={{
                fontSize: "10.5px",
                fontWeight: "700",
                color: "#2563eb",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                padding: "2px 7px",
                borderRadius: "12px"
              }}>
                {CUSTOMER_TASK_PACKS[selectedCustomerClient]?.short || selectedCustomerClient}
              </span>
            </div>

            {aiGeneratedSuccess === activeModuleTab.id && (
              <div style={{
                background: "#ecfdf5",
                color: "#065f46",
                border: "1px solid #a7f3d0",
                borderRadius: "6px",
                padding: "5px 8px",
                fontSize: "10.5px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}>
                <span>✨ Automatically analyzed & populated AI data from drawing!</span>
              </div>
            )}
          </div>

          {/* 1. Frame Hardware */}
          {activeModuleTab.id === "frame_hardware" && (
            <FrameHardwareTask
              formData={moduleFormData.frame_hardware || {}}
              onChange={handleModuleFormChange}
              cadMetrics={{ grandTotalLength: cadMetrics.grandTotalLength }}
              entries={frameWallEntries}
              onSetEntries={handleSetFrameWallEntries}
              onAddDataAI={handleAddDataAI}
              onSelectEntry={handleSelectEntry}
              activeJobNumber={currentProjectName || currentJobId}
              selectedWall={selectedWall}
              selectedWallIds={selectedWallIds}
              selectedId={selectedId}
              selectedType={selectedType}
            />
          )}

          {/* 2. Eaves Soffit */}
          {activeModuleTab.id === "eaves_soffit" && (
            <EavesSoffitTask
              formData={moduleFormData.eaves_soffit || {}}
              onChange={handleModuleFormChange}
              cadMetrics={{ perimeterM: cadMetrics.perimeterM }}
              entries={eavesEntries}
              onSetEntries={setEavesEntries}
              onAddDataAI={handleAddDataAI}
            />
          )}

          {/* 3. Cladding */}
          {activeModuleTab.id === "cladding" && (
            <CladdingTask
              formData={moduleFormData.cladding || {}}
              onChange={handleModuleFormChange}
              cadMetrics={{ externalWallLength: cadMetrics.externalWallLength }}
              entries={claddingWallEntries}
              onSetEntries={setCladdingWallEntries}
              onAddDataAI={handleAddDataAI}
            />
          )}

          {/* 4. Insulation */}
          {activeModuleTab.id === "insulation" && (
            <InsulationTask
              formData={moduleFormData.insulation || {}}
              onChange={handleModuleFormChange}
              cadMetrics={cadMetrics}
              wallEntries={insulationWallEntries}
              onSetWallEntries={handleSetInsulationWallEntries}
              areaEntries={insulationAreaEntries}
              onSetAreaEntries={handleSetInsulationAreaEntries}
              onAddDataAI={handleAddDataAI}
              onSelectEntry={handleSelectEntry}
              activeJobNumber={currentProjectName || currentJobId}
              selectedWall={selectedWall}
              selectedWallIds={selectedWallIds}
              selectedId={selectedId}
              selectedType={selectedType}
            />
          )}

          {/* 5. Flooring & Decking - GF */}
          {activeModuleTab.id === "flooring_decking" && (
            <FlooringDeckingTask
              formData={moduleFormData.flooring_decking || {}}
              onChange={handleModuleFormChange}
              cadMetrics={{ totalFloorArea: cadMetrics.totalFloorArea }}
              entries={flooringEntries}
              onSetEntries={handleSetFlooringEntries}
              onAddDataAI={handleAddDataAI}
              onSelectEntry={handleSelectEntry}
              activeJobNumber={currentProjectName || currentJobId}
              goPage={goPage}
              selectedRoom={selectedRoom}
              selectedRoomIds={selectedRoomIds}
              selectedId={selectedId}
              selectedType={selectedType}
            />
          )}

          {/* 6. Hebel Flooring */}
          {activeModuleTab.id === "hebel_flooring" && (
            <HebelFlooringTask
              formData={moduleFormData.hebel_flooring || {}}
              onChange={handleModuleFormChange}
              cadMetrics={{ totalFloorArea: cadMetrics.totalFloorArea }}
              entries={hebelFlooringEntries}
              onSetEntries={handleSetHebelFlooringEntries}
              onAddDataAI={handleAddDataAI}
              onSelectEntry={handleSelectEntry}
              activeJobNumber={currentProjectName || currentJobId}
              goPage={goPage}
              selectedRoom={selectedRoom}
              selectedRoomIds={selectedRoomIds}
              selectedId={selectedId}
              selectedType={selectedType}
            />
          )}

          {/* 7. Timber Posts */}
          {activeModuleTab.id === "timber_posts" && (
            <TimberPostsTask
              formData={moduleFormData.timber_posts || {}}
              onChange={handleModuleFormChange}
              cadMetrics={cadMetrics}
              entries={timberPostEntries}
              onSetEntries={setTimberPostEntries}
              onAddDataAI={handleAddDataAI}
              activeJobNumber={currentProjectName || currentJobId}
            />
          )}

          {/* 8. Fixout */}
          {activeModuleTab.id === "fixout" && (
            <FixoutTask
              formData={moduleFormData.fixout || {}}
              onChange={handleModuleFormChange}
              cadMetrics={cadMetrics}
              entries={fixoutDoorEntries}
              onSetEntries={setFixoutDoorEntries}
              onAddDataAI={handleAddDataAI}
              onSelectEntry={handleSelectEntry}
            />
          )}

          {/* 9. Lockup */}
          {(activeModuleTab.id === "lockup" || activeModuleTab.id === "lock_up") && (
            <LockupTask
              formData={moduleFormData.lockup || moduleFormData.lock_up || {}}
              onChange={handleModuleFormChange}
              cadMetrics={cadMetrics}
              entries={lockupEntries}
              onSetEntries={handleSetLockupEntries}
              onAddDataAI={handleAddDataAI}
              onSelectEntry={handleSelectEntry}
              activeJobNumber={currentProjectName || currentJobId}
              selectedDoor={selectedDoor}
              selectedDoorIds={selectedDoorIds}
              selectedId={selectedId}
              selectedType={selectedType}
            />
          )}

          {/* 10. Shelving */}
          {activeModuleTab.id === "shelving" && (
            <ShelvingTask
              formData={moduleFormData.shelving || {}}
              onChange={handleModuleFormChange}
              cadMetrics={cadMetrics}
              onAddDataAI={handleAddDataAI}
            />
          )}

          {/* 11. Doors & Furniture */}
          {activeModuleTab.id === "doors_furniture" && (
            <DoorsFurnitureTask
              formData={moduleFormData.doors_furniture || {}}
              onChange={handleModuleFormChange}
              cadMetrics={cadMetrics}
              onAddDataAI={handleAddDataAI}
              onSelectEntry={handleSelectEntry}
            />
          )}

          {/* 12. FOW Plumbing */}
          {activeModuleTab.id === "fow_plumbing" && (
            <FowPlumbingTask
              formData={moduleFormData.fow_plumbing || {}}
              onChange={handleModuleFormChange}
              cadMetrics={cadMetrics}
              onAddDataAI={handleAddDataAI}
            />
          )}

          {/* 13. Power Truss Braces */}
          {activeModuleTab.id === "power_truss_braces" && (
            <PowerTrussBracesTask
              formData={moduleFormData.power_truss_braces || {}}
              onChange={handleModuleFormChange}
              cadMetrics={cadMetrics}
              onAddDataAI={handleAddDataAI}
            />
          )}

          {/* 14. Final Fit */}
          {activeModuleTab.id === "final_fit" && (
            <FinalFitTask
              formData={moduleFormData.final_fit || {}}
              onChange={handleModuleFormChange}
              cadMetrics={cadMetrics}
              onAddDataAI={handleAddDataAI}
            />
          )}

          {/* 15. Sheet Schedule */}
          {activeModuleTab.id === "sheet_schedule" && (
            <SheetScheduleTask
              formData={moduleFormData.sheet_schedule || {}}
              onChange={handleModuleFormChange}
              cadMetrics={cadMetrics}
              onAddDataAI={handleAddDataAI}
            />
          )}

        </div>
      )}

      {/* ── RIGHT VERTICAL TAB BAR: Explorer / Summary / Task HW / Extra Modules ── */}
      <div className="rp-side-tab-bar">
        {/* Properties / Explorer tab */}
        <button
          title="Properties & Model Explorer"
          onClick={() => {
            setActivePaneTab(prev => prev === "explorer" ? "collapsed" : "explorer");
          }}
          className={`rp-side-tab-btn ${activePaneTab === "explorer" ? "active" : ""}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "-0.2px", lineHeight: "1.15", textAlign: "center" }}>Properties</span>
        </button>

        {/* Summary tab */}
        <button
          title="Takeoff & Geometry Summary"
          onClick={() => setActivePaneTab(prev => prev === "summary" ? "collapsed" : "summary")}
          className={`rp-side-tab-btn ${activePaneTab === "summary" ? "active" : ""}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "-0.2px", lineHeight: "1.15", textAlign: "center" }}>Summary</span>
        </button>

        {/* Task HW tab */}
        <button
          title="Task Groups HW"
          onClick={() => setActivePaneTab(prev => prev === "job_task" ? "collapsed" : "job_task")}
          className={`rp-side-tab-btn ${activePaneTab === "job_task" ? "active" : ""}`}
        >
          <div style={{ position: "relative", display: "inline-flex" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            {taskListJobs.filter(t => t.has_local_job).length > 0 && (
              <span style={{
                position: "absolute",
                top: "-5px",
                right: "-8px",
                background: "#10b981",
                color: "#fff",
                fontSize: "8.5px",
                padding: "0 3px",
                borderRadius: "8px",
                fontWeight: 800,
                minWidth: "13px",
                height: "13px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
              }}>
                {taskListJobs.filter(t => t.has_local_job).length}
              </span>
            )}
          </div>
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "-0.2px", lineHeight: "1.15", textAlign: "center" }}>Task HW</span>
        </button>

        {/* Divider */}
        <div style={{ width: "80%", height: "1px", background: "var(--border)", margin: "3px 0", flexShrink: 0 }} />

        {/* ── DYNAMIC MODULE TABS (ONLY DISPLAY CHECKED / ENABLED MODULES) ── */}
        {EXTRA_MODULE_TABS.filter(mod => enabledModuleIds.includes(mod.id)).map((mod) => (
          <button
            key={mod.id}
            title={mod.title}
            onClick={() => setActivePaneTab(prev => prev === mod.id ? "collapsed" : mod.id)}
            className={`rp-side-tab-btn ${activePaneTab === mod.id ? "active" : ""}`}
          >
            {mod.icon}
            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "-0.2px", lineHeight: "1.15", textAlign: "center", wordBreak: "break-word" }}>
              {mod.label}
            </span>
          </button>
        ))}

        {/* ── ADD MODULE [+] BUTTON & POPUP ── */}
        <div style={{ position: "relative", width: "100%", marginTop: "2px" }}>
          <button
            title="Add Module (+)"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddModulePopup(prev => !prev);
            }}
            className="rp-side-tab-btn"
            style={{
              border: "1.5px dashed #94a3b8",
              background: showAddModulePopup ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.7)",
              color: showAddModulePopup ? "var(--blue)" : "#334155",
              padding: "6px 2px",
              boxShadow: "none"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <span style={{ fontSize: "9.5px", fontWeight: 800, letterSpacing: "-0.2px" }}>
              + Add
            </span>
          </button>

          {/* Floating Add Module Popup */}
          {showAddModulePopup && (
            <div
              ref={addModulePopupRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                right: "60px",
                bottom: "30px",
                width: "270px",
                maxHeight: "440px",
                background: "#ffffff",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                boxShadow: "0 16px 40px rgba(15, 23, 42, 0.25)",
                zIndex: 99999,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden"
              }}
            >
              {/* Header */}
              <div style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#f8fafc"
              }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>📦 Manage Modules</span>
                  <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 500 }}>
                    ({enabledModuleIds.length}/{EXTRA_MODULE_TABS.length})
                  </span>
                </div>
                <button
                  onClick={() => setShowAddModulePopup(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "2px 6px",
                    fontWeight: 700
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Module Checklist List */}
              <div style={{ padding: "6px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "280px" }}>
                {EXTRA_MODULE_TABS.map((mod) => {
                  const isEnabled = enabledModuleIds.includes(mod.id);
                  return (
                    <div
                      key={mod.id}
                      onClick={() => {
                        let next;
                        if (isEnabled) {
                          next = enabledModuleIds.filter(id => id !== mod.id);
                          if (activePaneTab === mod.id) setActivePaneTab("explorer");
                        } else {
                          next = [...enabledModuleIds, mod.id];
                          setActivePaneTab(mod.id);
                        }
                        setEnabledModuleIds(next);
                        try {
                          sessionStorage.setItem("selectedModules", JSON.stringify(next));
                          localStorage.setItem("selectedModules", JSON.stringify(next));
                        } catch (_) { }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "7px 10px",
                        borderRadius: "6px",
                        background: isEnabled ? "rgba(37,99,235,0.08)" : "#ffffff",
                        border: isEnabled ? "1px solid rgba(37,99,235,0.3)" : "1px solid #f1f5f9",
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          color: isEnabled ? "var(--blue)" : "#94a3b8",
                          display: "flex",
                          alignItems: "center"
                        }}>
                          {mod.icon}
                        </div>
                        <span style={{ fontSize: "11.5px", fontWeight: isEnabled ? 700 : 500, color: isEnabled ? "var(--blue)" : "var(--text)" }}>
                          {mod.title}
                        </span>
                      </div>
                      <span style={{
                        fontSize: "12px",
                        fontWeight: 800,
                        color: isEnabled ? "#10b981" : "#94a3b8",
                        background: isEnabled ? "#ecfdf5" : "#f1f5f9",
                        padding: "1px 6px",
                        borderRadius: "4px"
                      }}>
                        {isEnabled ? "✓ Enabled" : "+ Add"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Footer Quick Action */}
              <div style={{
                padding: "8px 10px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: "6px",
                background: "#f8fafc"
              }}>
                <button
                  onClick={() => {
                    setEnabledModuleIds(ALL_MODULE_IDS);
                    try {
                      sessionStorage.setItem("selectedModules", JSON.stringify(ALL_MODULE_IDS));
                      localStorage.setItem("selectedModules", JSON.stringify(ALL_MODULE_IDS));
                    } catch (_) { }
                  }}
                  style={{
                    flex: 1,
                    padding: "6px",
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "var(--blue)",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: "5px",
                    cursor: "pointer"
                  }}
                >
                  Enable all ({EXTRA_MODULE_TABS.length})
                </button>
                <button
                  onClick={() => {
                    const initial = getInitialEnabledModules();
                    setEnabledModuleIds(initial);
                    try {
                      sessionStorage.removeItem("selectedModules");
                      localStorage.removeItem("selectedModules");
                    } catch (_) { }
                  }}
                  style={{
                    flex: 1,
                    padding: "6px",
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "#64748b",
                    background: "#ffffff",
                    border: "1px solid var(--border)",
                    borderRadius: "5px",
                    cursor: "pointer"
                  }}
                >
                  Reset default
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

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
