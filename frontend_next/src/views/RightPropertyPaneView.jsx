import React from "react";
import * as XLSX from "xlsx";
import { polygonAreaM2 as polygonAreaM2Util } from "@/utils/geometry";
import { useAppModel } from "@/models/app.context";

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
}) {
  const { wasteByPage, setWasteByPage, currentPage } = useAppModel();

  // Collapsible accordion expanded states (all true by default on load)
  const [isWallSummaryExpanded, setIsWallSummaryExpanded] = React.useState(true);
  const [isFloorSummaryExpanded, setIsFloorSummaryExpanded] = React.useState(true);
  const [isDoorSummaryExpanded, setIsDoorSummaryExpanded] = React.useState(true);

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
      const heightMm = w.height || 2400;
      const heightM = heightMm / 1000;
      const areaM2 = lengthM != null ? lengthM * heightM : null;

      const type = w.class_name || w.wall_type || "interior_wall";
      const key = groups[type] ? type : "interior_wall";

      groups[key].walls.push({ id: w.id, lengthM, heightM, areaM2, thicknessMm: w.thickness || 90 });
    });

    return groups;
  }, [walls, scaleValue]);

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

  // 3. Calculations for Doors
  const doorData = React.useMemo(() => {
    const groups = {
      privacy: { label: "Privacy", color: "#2196F3", doors: [] },
      passage: { label: "Passage", color: "#4CAF50", doors: [] },
      dummy: { label: "Dummy", color: "#8b5cf6", doors: [] },
      entrance: { label: "Entrance", color: "#f59e0b", doors: [] },
    };

    doors.forEach((d) => {
      const hw = d.hardware_type || "privacy";
      const key = groups[hw] ? hw : "privacy";
      groups[key].doors.push(d);
    });

    return groups;
  }, [doors]);

  const totalDoorCount = doors.length;

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
                      : selectedWall?.class_name || selectedWall?.wall_type || "interior_wall"
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
                      : selectedWall && pxToMm
                        ? Math.round(pxToMm(selectedWall.thickness_px, realScale))
                        : selectedWall?.thickness || 90
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
                <select
                  className="panel-select"
                  value={
                    selectedWallIds.length > 1
                      ? "multiple"
                      : selectedWall?.height || 2400
                  }
                  onChange={(e) => {
                    if (e.target.value === "multiple") return;
                    const targetIds = selectedWallIds.length > 0 ? selectedWallIds : [selectedWall.id];
                    updateWallsProperty && updateWallsProperty(targetIds, "height", Number(e.target.value));
                  }}
                >
                  {selectedWallIds.length > 1 && <option value="multiple" disabled>-- Multiple Heights --</option>}
                  <option value={2100}>2100 mm</option>
                  <option value={2400}>2400 mm</option>
                  <option value={2700}>2700 mm</option>
                  <option value={3000}>3000 mm</option>
                  <option value={3300}>3300 mm</option>
                  <option value={3600}>3600 mm</option>
                </select>
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
          ) : selectedType === "door" && selectedDoor ? (
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
                  value={selectedDoor.penetration_type || selectedDoor.penetrationType || (selectedDoor.class?.includes("double") ? "hinged_double" : "hinged_single")}
                  onChange={(e) => {
                    let cls = "single_door";
                    if (e.target.value === "hinged_double") cls = "double_door";
                    else if (e.target.value === "sliding") cls = "sliding_door";
                    else if (e.target.value === "bifold") cls = "bifold_door";
                    else if (e.target.value === "garage") cls = "garage_door";
                    else if (e.target.value === "cavity_slider") cls = "cavity_slider";
                    else if (e.target.value === "double_slider") cls = "double_slider";
                    updateDoor && updateDoor({ ...selectedDoor, penetration_type: e.target.value, class: cls });
                  }}
                >
                  <option value="hinged_single">Hinged Single Door</option>
                  <option value="hinged_double">Hinged Double Door</option>
                  <option value="sliding">Sliding Door</option>
                  <option value="cavity_slider">Cavity Slider Door</option>
                  <option value="double_slider">Double Slider Door</option>
                  <option value="bifold">Bifold Door</option>
                  <option value="garage">Garage Door</option>
                </select>
              </div>

              <div className="panel-field">
                <span className="panel-label">Hardware Type</span>
                <select
                  className="panel-select"
                  value={selectedDoor.hardware_type || "privacy"}
                  onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, hardware_type: e.target.value })}
                >
                  <option value="privacy">Privacy</option>
                  <option value="passage">Passage</option>
                  <option value="dummy">Dummy</option>
                  <option value="entrance">Entrance</option>
                </select>
              </div>

              <div className="panel-field">
                <span className="panel-label">Width</span>
                <select
                  className="panel-select"
                  value={selectedDoor.width_mm || 760}
                  onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value) })}
                >
                  <option value={520}>520 mm</option>
                  <option value={620}>620 mm</option>
                  <option value={720}>720 mm</option>
                  <option value={760}>760 mm</option>
                  <option value={820}>820 mm</option>
                  <option value={870}>870 mm</option>
                  <option value={920}>920 mm</option>
                  <option value={1020}>1020 mm</option>
                  <option value={1520}>1520 mm</option>
                  <option value={1640}>1640 mm</option>
                  <option value={1800}>1800 mm</option>
                  <option value={2400}>2400 mm</option>
                  <option value={5000}>5000 mm</option>
                </select>
              </div>

              <div className="panel-field">
                <span className="panel-label">Height</span>
                <select
                  className="panel-select"
                  value={selectedDoor.height_mm || 1980}
                  onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, height_mm: Number(e.target.value) })}
                >
                  <option value={1980}>1980 mm</option>
                  <option value={2040}>2040 mm</option>
                  <option value={2100}>2100 mm</option>
                  <option value={2200}>2200 mm</option>
                  <option value={2340}>2340 mm</option>
                  <option value={2400}>2400 mm</option>
                </select>
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

              <div style={{ marginTop: 12 }}>
                <button
                  className="rp-action-btn rp-action-btn--danger"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this door?")) {
                      deleteDoor && deleteDoor(selectedDoor.id);
                    }
                  }}
                >
                  Delete Selected Door
                </button>
              </div>
            </>
          ) : (
            <div className="panel-hint" style={{ padding: "8px 0" }}>Select a wall, room, or door to edit properties.</div>
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
            <div style={{ marginTop: "6px" }}>
              <ExportButton onClick={exportWallExcel} disabled={!scaleValue}>
                📥 Export Wall Summary (.xlsx)
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
    </div>
  );
}
