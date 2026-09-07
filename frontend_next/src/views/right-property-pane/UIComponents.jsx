import React from "react";
import * as BunNswActTasks from "@/components/bun-nsw-act/tasks";
import * as CairnsHardwareTasks from "@/components/cairns-hardware/tasks";
import * as AtsFtTasks from "@/components/ats-ft/tasks";
import * as BunSaTasks from "@/components/bun-sa/tasks";
import * as BunSeqldTasks from "@/components/bun-seqld/tasks";
import * as BunTasTasks from "@/components/bun-tas/tasks";
import * as BunVicTasks from "@/components/bun-vic/tasks";
import * as BunningsQldTasks from "@/components/bunnings-qld/tasks";

export const CUSTOMER_TASK_PACKS = {
  "bun-nsw-act": {
    name: "Bunnings NSW / ACT",
    short: "NSW / ACT",
    aliases: ["BUN-NSW-ACT", "BUN NSW ACT", "BUNNINGS NSW / ACT"],
    moduleIds: [
      "cladding",
      "eaves_soffit",
      "flooring_decking",
      "frame_hardware",
      "insulation",
      "lock_up",
      "fixout",
      "final_fit",
      "shelving",
      "timber_posts",
      "fow_plumbing",
      "power_truss_braces"
    ],
    tasks: BunNswActTasks
  },
  "cairns-hardware": {
    name: "Cairns Hardware",
    short: "Cairns HW",
    aliases: ["CAIRNS-WOH", "CAIRNS HARDWARE"],
    tasks: CairnsHardwareTasks
  },
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
export const HomeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

export const ExternalIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <line x1="9" y1="22" x2="9" y2="16" />
    <line x1="15" y1="22" x2="15" y2="16" />
    <line x1="9" y1="16" x2="15" y2="16" />
  </svg>
);

export const PolygonIcon = () => (
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

export const WasteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);

export const GrandTotalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

export const InfoIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "6px" }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export const AreaSummaryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: "6px" }}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

/* ================================================================
   REUSABLE DESIGN SYSTEM COMPONENTS
   ================================================================ */

export function SectionHeader({ children }) {
  return <div className="rp-section-header">{children}</div>;
}

export function CollapsibleSection({ title, isExpanded, onToggle, children, totalCount }) {
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

export function SubheadingRow({ title, icon, value, onChange }) {
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

export function KPICard({ value, label, unit = "", color, small = false }) {
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

export function AreaCard({ label, value, dotColor, ratio = 0, parentLabel = "", onClick, isActive }) {
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

export function KPIRow({ children }) {
  return <div className="rp-kpi-row">{children}</div>;
}

export function StatRow({ label, value, color, bold = false }) {
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

export function MiniBar({ ratio = 0, color = "#3b82f6" }) {
  return (
    <div className="rp-mini-bar">
      <div
        className="rp-mini-bar__fill"
        style={{ width: `${Math.min(ratio * 100, 100)}%`, background: color }}
      />
    </div>
  );
}

export function SummaryCard({ children, accent = "neutral" }) {
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

export function ExportButton({ onClick, disabled = false, children }) {
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

export function PitchInput({ value, onChange, style, className }) {
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
export const EXTRA_MODULE_TABS = [
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

export const ALL_MODULE_IDS = EXTRA_MODULE_TABS.map(m => m.id);

// ── Katherine (EZE0098) 13-Task Standard HW Contract ──
export const KATHERINE_STANDARD_STEPS = {
  1: "Cladding",
  2: "Eaves Soffit",
  3: "Flooring & Decking",
  4: "Frame Hardware",
  5: "Insulation",
  6: "Lockup",
  7: "Fixout",
  8: "Final Fit",
  9: "Shelving",
  10: "Timber Post",
  11: "FOW Plumbing",
  12: "Power Truss Braces",
  13: "Hardies Fire Walls",
};

export const isCairnsCustomer = (customer) =>
  String(customer || "").trim().toUpperCase().includes("CAIRNS");

export const isKatherineStandardJob = (managerCode, customer) =>
  String(managerCode || "").trim().toUpperCase() === "EZE0098" &&
  !isCairnsCustomer(customer);

export const KATHERINE_STEP_TO_MODULE = {
  1: "cladding",
  2: "eaves_soffit",
  3: "flooring_decking",
  4: "frame_hardware",
  5: "insulation",
  6: "lock_up",
  7: "fixout",
  8: "final_fit",
  9: "shelving",
  10: "timber_posts",
  11: "fow_plumbing",
  12: "power_truss_braces",
  13: null, // Hardies Fire Walls — module pending
};

export const KATHERINE_STANDARD_MODULE_IDS = [
  "cladding",
  "eaves_soffit",
  "flooring_decking",
  "frame_hardware",
  "insulation",
  "lock_up",
  "fixout",
  "final_fit",
  "shelving",
  "timber_posts",
  "fow_plumbing",
  "power_truss_braces"
];

export function normalizeCustomerKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveCustomerPackKey(value) {
  const normalized = normalizeCustomerKey(value);
  if (!normalized) return null;
  if (CUSTOMER_TASK_PACKS[normalized]) return normalized;

  for (const [key, pack] of Object.entries(CUSTOMER_TASK_PACKS)) {
    const aliases = [pack.name, pack.short, ...(pack.aliases || [])];
    if (aliases.some(alias => normalizeCustomerKey(alias) === normalized)) return key;
  }
  return null;
}

export function getCustomerModuleIds(customerKey, managerCode = null) {
  let mgr = managerCode;
  let cust = customerKey;
  if (!mgr && typeof window !== "undefined") {
    try {
      const pendingStr = sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob");
      if (pendingStr) {
        const pending = JSON.parse(pendingStr);
        mgr = pending?.manager_code || pending?.ma_nv || pending?.MaNV;
        cust = pending?.customer || pending?.customer_short_name || pending?.client || customerKey;
      }
    } catch (_) { }
  }

  if (isKatherineStandardJob(mgr, cust)) {
    return KATHERINE_STANDARD_MODULE_IDS;
  }

  const pack = CUSTOMER_TASK_PACKS[customerKey];
  return Array.isArray(pack?.moduleIds) && pack.moduleIds.length > 0
    ? pack.moduleIds.filter(id => ALL_MODULE_IDS.includes(id))
    : ALL_MODULE_IDS;
}

export function sanitizeModuleIds(moduleIds, customerKey, managerCode = null) {
  const allowed = getCustomerModuleIds(customerKey, managerCode);
  const input = Array.isArray(moduleIds) ? moduleIds : [];
  return Array.from(new Set(input.filter(id => allowed.includes(id))));
}

export const MODULE_KEY_MAP = {
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

export function normalizeModuleId(rawStr) {
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

export function isSubtaskChecked(item) {
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

export function resolveTaskModules(taskContext) {
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

export function getInitialEnabledModules(customerKey = null) {
  // 0. Pending EMS job task_modules is the highest-priority authoritative source
  if (typeof window !== "undefined") {
    try {
      const pendingJobStr = sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob");
      if (pendingJobStr) {
        const pendingJob = JSON.parse(pendingJobStr);
        if (Array.isArray(pendingJob?.task_modules)) {
          return pendingJob.task_modules;
        }
      }
    } catch (_) { }
  }

  const resolvedCustomer = customerKey || (() => {
    if (typeof window === "undefined") return "bun-nsw-act";
    const storedCustomer =
      sessionStorage.getItem("selectedCustomerClient") ||
      localStorage.getItem("selectedCustomerClient");
    return resolveCustomerPackKey(storedCustomer) || "bun-nsw-act";
  })();

  const allowed = getCustomerModuleIds(resolvedCustomer);
  if (typeof window === "undefined") return allowed;

  const resolveAndLimit = (value) => {
    if (Array.isArray(value)) {
      if (value.length === 0) return [];
      return sanitizeModuleIds(value, resolvedCustomer);
    }
    if (value === "[]") return [];
    const parsed = resolveTaskModules(value);
    if (Array.isArray(parsed)) {
      return sanitizeModuleIds(parsed, resolvedCustomer);
    }
    return null;
  };

  // 1. URL task/module context
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const qModules = urlParams.get("modules") || urlParams.get("selectedModules") || urlParams.get("tasks") || urlParams.get("task_modules");
    if (qModules !== null) {
      const resolved = resolveAndLimit(qModules);
      if (resolved !== null) return resolved;
    }
  } catch (_) { }

  // 2. Explicit local/session override, always intersected with customer contract
  try {
    const stored = sessionStorage.getItem("selectedModules") || localStorage.getItem("selectedModules");
    if (stored !== null) {
      if (stored === "[]") return [];
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return sanitizeModuleIds(parsed, resolvedCustomer);
        }
      } catch (_) { }
      const resolved = resolveAndLimit(stored);
      if (resolved !== null) return resolved;
    }
  } catch (_) { }

  // 3. Pending EMS job task context fallback (non-authoritative object/string format)
  try {
    const pendingJobStr = sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob");
    if (pendingJobStr) {
      const parsedJob = JSON.parse(pendingJobStr);
      if (Array.isArray(parsedJob?.task_modules)) {
        return parsedJob.task_modules;
      }
      const resolved = resolveAndLimit(parsedJob);
      if (resolved !== null) return resolved;
    }
  } catch (_) { }

  // 4. Customer contract is the authoritative fallback.
  return allowed;
}

export function getCustomerFromPendingEmsJob() {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob");
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    const candidate = parsed?.client || parsed?.customer || parsed?.customer_name || parsed?.short_name || parsed?.pack;
    return resolveCustomerPackKey(candidate);
  } catch (_) {
    return null;
  }
}
