"use client";
import React from "react";
import CalloutStylePicker from "../../../components/CalloutStylePicker";

// Quick Palette Colors
const PALETTE_COLORS = [
  "#facc15", // Vàng highlight / chú thích
  "#ef4444", // Đỏ cảnh báo / đánh dấu
  "#3b82f6", // Xanh dương
  "#10b981", // Xanh lá
  "#f97316", // Cam
  "#a855f7", // Tím
  "#06b6d4", // Cyan
  "#0f172a", // Đen / Xám đậm
  "#ffffff"  // Trắng
];

const STROKE_WIDTH_OPTIONS = [1, 2, 4, 8, 12, 16, 24, 32];
const FONT_SIZE_PT_OPTIONS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

export default function AnnotationPropertyPanel({
  annotation,
  selectedAnnotationIds = [],
  annotations = [],
  onUpdateAnnotation,
  onDeleteAnnotation,
  onDuplicateAnnotation,
  realScale
}) {
  if (!annotation) return null;

  const mmPerPx = (typeof realScale === "number" && realScale > 0) ? realScale : 20;

  const isMulti = Boolean(selectedAnnotationIds && selectedAnnotationIds.length > 1);
  const selectedList = isMulti
    ? (annotations || []).filter((a) => selectedAnnotationIds.includes(a.id))
    : [annotation];

  // If multi-selected, sum up total area and perimeter across all area shapes
  let multiTotalAreaM2 = 0;
  let multiTotalPerimM = 0;
  let multiAreaCount = 0;

  if (isMulti) {
    selectedList.forEach((ann) => {
      if (ann.points && ann.points.length >= 3) {
        let a = 0;
        let p = 0;
        const pts = ann.points;
        for (let i = 0; i < pts.length; i++) {
          const j = (i + 1) % pts.length;
          a += pts[i].x * pts[j].y;
          a -= pts[j].x * pts[i].y;
          p += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
        }
        const areaMm2 = (Math.abs(a) / 2) * (mmPerPx ** 2);
        multiTotalAreaM2 += areaMm2 / 1000000;
        multiTotalPerimM += (p * mmPerPx) / 1000;
        multiAreaCount++;
      } else if (ann.width && ann.height) {
        const wM = (ann.width * mmPerPx) / 1000;
        const hM = (ann.height * mmPerPx) / 1000;
        multiTotalAreaM2 += wM * hM;
        multiTotalPerimM += 2 * (wM + hM);
        multiAreaCount++;
      }
    });
  }

  // Geometry calculations for single selection
  let geometryInfo = null;
  if (!isMulti) {
    if (annotation.points && annotation.points.length >= 3) {
      let area = 0;
      let perimeter = 0;
      const pts = annotation.points;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        area += pts[i].x * pts[j].y;
        area -= pts[j].x * pts[i].y;
        perimeter += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      }
      const areaMm2 = (Math.abs(area) / 2) * (mmPerPx ** 2);
      const areaM2 = areaMm2 / 1000000;
      const perimM = (perimeter * mmPerPx) / 1000;
      geometryInfo = {
        areaM2: areaM2.toFixed(2),
        perimM: perimM.toFixed(2),
        pointsCount: pts.length
      };
    } else if (annotation.width && annotation.height) {
      const wM = (annotation.width * mmPerPx) / 1000;
      const hM = (annotation.height * mmPerPx) / 1000;
      const areaM2 = wM * hM;
      const perimM = 2 * (wM + hM);
      geometryInfo = {
        areaM2: areaM2.toFixed(2),
        perimM: perimM.toFixed(2),
        wM: wM.toFixed(2),
        hM: hM.toFixed(2)
      };
    }
  }

  // Type labels and badges
  const typeLabels = {
    "highlight": "Highlight Brush",
    "highlight-brush": "Highlight Brush",
    "highlight-poly": "Highlight Area",
    "text": "Text Note",
    "sticky-note": "Sticky Note",
    "callout": "Callout Box",
    "measure-area-poly": "Area Polygon",
    "measure-area": "Area Box",
    "measure-perimeter": "Perimeter Box",
    "measure-perimeter-poly": "Perimeter",
    "rect": "Rectangle",
    "oval": "Oval / Circle",
    "cloud": "Cloud",
    "polygon": "Polygon",
    "line": "Line",
    "polyline": "Polyline",
    "arrow": "Arrow",
    "underline": "Underline",
    "strikethrough": "Strikethrough",
    "stamp": "Stamp"
  };

  const typeName = typeLabels[annotation.type] || annotation.type || "Annotation";

  const isTextLike = !isMulti && ["text", "callout", "sticky-note"].includes(annotation.type);
  const isCallout = !isMulti && annotation.type === "callout";
  const isHighlight = !isMulti && annotation.type?.startsWith("highlight");
  const isFillable = isMulti
    ? selectedList.some((a) => ["rect", "oval", "cloud", "polygon", "measure-area-poly", "measure-area", "highlight-poly"].includes(a.type))
    : ["rect", "oval", "cloud", "polygon", "measure-area-poly", "measure-area", "highlight-poly"].includes(annotation.type);
  const hasStroke = isMulti
    ? selectedList.some((a) => !["sticky-note", "text"].includes(a.type))
    : !["sticky-note", "text"].includes(annotation.type);

  const currentColor = annotation.color || (isHighlight ? "#facc15" : "#3b82f6");
  const currentOpacity = typeof annotation.opacity === "number" ? annotation.opacity : (isHighlight ? 0.45 : 1.0);
  const currentFillMode = annotation.fillMode || "both";
  const currentFillOpacity = typeof annotation.fillOpacity === "number" ? annotation.fillOpacity : (isHighlight ? 0.4 : 0.25);
  const currentStrokeWidth = typeof annotation.strokeWidth === "number" ? annotation.strokeWidth : (isHighlight ? 24 : (isCallout ? 3.5 : 3));
  const currentDpi = annotation.dpi || (typeof window !== "undefined" && localStorage.getItem("ezefloor_dpi") ? parseFloat(localStorage.getItem("ezefloor_dpi")) : 250);
  const currentFontSizePt = (typeof annotation.fontSizePt === "number" && annotation.fontSizePt > 0)
    ? annotation.fontSizePt
    : Math.max(1, Math.round((annotation.fontSize || 50) * 72 / currentDpi));
  const currentFontSizePx = annotation.fontSize || Math.max(6, Math.round(currentFontSizePt * (currentDpi / 72)));

  const handleUpdate = (field, val) => {
    if (onUpdateAnnotation) {
      onUpdateAnnotation(annotation.id, { [field]: val });
    }
  };

  const handleFontSizePtChange = (newPt) => {
    const ptVal = Math.max(1, parseInt(newPt, 10) || 1);
    const pxVal = Math.max(6, Math.round(ptVal * (currentDpi / 72)));
    if (onUpdateAnnotation) {
      onUpdateAnnotation(annotation.id, {
        fontSize: pxVal,
        fontSizePt: ptVal,
        dpi: currentDpi
      });
    }
  };

  return (
    <div className="annotation-property-panel" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "4px 2px" }}>
      {/* 1. Header with Type Badge */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: isMulti
          ? "linear-gradient(135deg, rgba(37,99,235,0.14), rgba(59,130,246,0.06))"
          : "linear-gradient(135deg, rgba(49,69,110,0.12), rgba(49,69,110,0.04))",
        border: isMulti ? "1.5px solid #3b82f6" : "1px solid rgba(49,69,110,0.2)",
        borderRadius: "8px",
        padding: "10px 12px"
      }}>
        <div>
          <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: isMulti ? "#1d4ed8" : "#64748b", fontWeight: 700 }}>
            {isMulti ? `MULTI-SELECTION (${selectedList.length} OBJECTS)` : "OBJECT PROPERTIES"}
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b", marginTop: "2px" }}>
            {isMulti
              ? (multiAreaCount > 0 ? `${multiAreaCount} Areas Selected` : `${selectedList.length} Objects Selected`)
              : typeName}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {!isMulti && onDuplicateAnnotation && (
            <button
              type="button"
              onClick={() => onDuplicateAnnotation(annotation.id)}
              title="Duplicate"
              style={{
                background: "#f1f5f9",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "6px 9px",
                cursor: "pointer",
                fontSize: "12px",
                color: "#334155",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              📋
            </button>
          )}
          {onDeleteAnnotation && (
            <button
              type="button"
              onClick={() => onDeleteAnnotation(annotation.id)}
              title={isMulti ? `Delete all ${selectedList.length} selected objects` : "Delete"}
              style={{
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: "6px",
                padding: "6px 9px",
                cursor: "pointer",
                fontSize: "12px",
                color: "#dc2626",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <span>🗑️</span>
              {isMulti && <span style={{ fontSize: "11px" }}>Delete ({selectedList.length})</span>}
            </button>
          )}
        </div>
      </div>

      {/* Multi-Area Total Summary Box */}
      {isMulti && multiTotalAreaM2 > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
          border: "1.5px solid #3b82f6",
          borderRadius: "8px",
          padding: "12px 14px",
          boxShadow: "0 2px 6px rgba(37,99,235,0.12)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              📐 TOTAL AREA ({multiAreaCount} Areas)
            </span>
            <span style={{ fontSize: "10px", background: "#bfdbfe", color: "#1e3a8a", fontWeight: 700, padding: "2px 6px", borderRadius: "10px" }}>
              Batch Applied
            </span>
          </div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#1e3a8a", marginTop: "4px" }}>
            {multiTotalAreaM2.toFixed(2)} <span style={{ fontSize: "14px", fontWeight: 600 }}>m²</span>
          </div>
          <div style={{ fontSize: "11px", color: "#475569", marginTop: "2px" }}>
            Total Perimeter: {multiTotalPerimM.toFixed(2)} m
          </div>
        </div>
      )}

      {/* Callout Style Preset Gallery (14 Thumbnails) */}
      {isCallout && (
        <div style={{
          background: "#ffffff",
          border: "1.5px solid #cbd5e1",
          borderRadius: "8px",
          padding: "10px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b" }}>
              🎨 CALLOUT STYLES
            </span>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
              {annotation.isCloudy ? "Cloudy" : "Standard"}
            </span>
          </div>
          <CalloutStylePicker
            selectedStyleId={annotation.calloutStyle}
            selectedColor={annotation.color}
            isCloudy={annotation.isCloudy}
            onSelectStyle={(styleItem) => {
              if (onUpdateAnnotation) {
                onUpdateAnnotation(annotation.id, {
                  color: styleItem.color,
                  bgColor: styleItem.bgColor,
                  isCloudy: styleItem.isCloudy,
                  calloutStyle: styleItem.id
                });
              }
            }}
            size="compact"
          />
        </div>
      )}

      {/* 2. Color Selection (Palette & Custom Picker) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
            {annotation.type === "sticky-note" ? "Note Background Color" : (annotation.type === "text" ? "Text Color" : "Color")}
          </label>
          <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#64748b", fontWeight: 600 }}>
            {currentColor}
          </span>
        </div>

        {/* Swatches */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          {PALETTE_COLORS.map((c) => {
            const isPicked = currentColor.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => handleUpdate("color", c)}
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "6px",
                  background: c,
                  border: isPicked ? "2.5px solid #2563eb" : "1px solid rgba(0,0,0,0.2)",
                  boxShadow: isPicked ? "0 0 0 2px rgba(37,99,235,0.3)" : "none",
                  cursor: "pointer",
                  transition: "transform 0.1s ease",
                  transform: isPicked ? "scale(1.15)" : "scale(1)"
                }}
                title={c}
              />
            );
          })}

          {/* Native HTML5 Color Picker */}
          <div style={{ position: "relative", width: "26px", height: "26px" }}>
            <input
              type="color"
              value={currentColor.startsWith("#") ? currentColor : "#facc15"}
              onChange={(e) => handleUpdate("color", e.target.value)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                cursor: "pointer"
              }}
              title="Choose custom color..."
            />
            <div
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "6px",
                background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
                border: "1px solid rgba(0,0,0,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: "bold",
                color: "#fff",
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                pointerEvents: "none"
              }}
            >
              +
            </div>
          </div>
        </div>
      </div>

      {/* 3. Opacity (Alpha) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
            Opacity
          </label>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#31456E" }}>
            {Math.round(currentOpacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.05"
          value={currentOpacity}
          onChange={(e) => handleUpdate("opacity", parseFloat(e.target.value))}
          style={{ width: "100%", cursor: "pointer", accentColor: "#31456E" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#94a3b8" }}>
          <span>10% (Light)</span>
          <span>50%</span>
          <span>100% (Solid)</span>
        </div>
      </div>

      {/* 4. Stroke Width */}
      {hasStroke && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
              {isCallout ? "Pointer Line Width" : "Stroke Width"}
            </label>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#31456E" }}>
              {currentStrokeWidth} px
            </span>
          </div>
          <input
            type="range"
            min={isHighlight ? "6" : "1"}
            max={isHighlight ? "60" : (isCallout ? "12" : "36")}
            step={isCallout ? "0.5" : "1"}
            value={currentStrokeWidth}
            onChange={(e) => handleUpdate("strokeWidth", parseFloat(e.target.value))}
            style={{ width: "100%", cursor: "pointer", accentColor: "#31456E" }}
          />
          {/* Quick preset buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {(isHighlight ? [12, 18, 24, 32, 44, 56] : (isCallout ? [2, 3, 3.5, 5, 8] : STROKE_WIDTH_OPTIONS)).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => handleUpdate("strokeWidth", w)}
                style={{
                  background: currentStrokeWidth === w ? "#31456E" : "#f1f5f9",
                  color: currentStrokeWidth === w ? "#ffffff" : "#475569",
                  border: "1px solid #cbd5e1",
                  borderRadius: "4px",
                  padding: "2px 7px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                {w}px
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5. Fill Mode & Fill Opacity */}
      {isFillable && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
            Fill Mode
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
            {[
              { id: "stroke", label: "Stroke" },
              { id: "fill", label: "Fill" },
              { id: "both", label: "Both" }
            ].map((m) => {
              const active = currentFillMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleUpdate("fillMode", m.id)}
                  style={{
                    background: active ? "#31456E" : "#f8fafc",
                    color: active ? "#ffffff" : "#334155",
                    border: active ? "1px solid #31456E" : "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "6px 2px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "center"
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {currentFillMode !== "stroke" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b" }}>
                <span>Fill Opacity:</span>
                <span style={{ fontWeight: 700, color: "#31456E" }}>{Math.round(currentFillOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="1.0"
                step="0.05"
                value={currentFillOpacity}
                onChange={(e) => handleUpdate("fillOpacity", parseFloat(e.target.value))}
                style={{ width: "100%", cursor: "pointer", accentColor: "#31456E" }}
              />
            </div>
          )}
        </div>
      )}

      {/* 6. Text Formatting & Sizing (For Text, Callout, Sticky Note) */}
      {isTextLike && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Font Size (pt) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                Font Size (pt)
              </label>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#31456E" }}>
                {currentFontSizePt} pt <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>(= {currentFontSizePx}px @ {currentDpi} DPI)</span>
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="72"
              step="1"
              value={currentFontSizePt}
              onChange={(e) => handleFontSizePtChange(e.target.value)}
              style={{ width: "100%", cursor: "pointer", accentColor: "#31456E" }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {FONT_SIZE_PT_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleFontSizePtChange(s)}
                  style={{
                    background: currentFontSizePt === s ? "#31456E" : "#f1f5f9",
                    color: currentFontSizePt === s ? "#ffffff" : "#475569",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  {s}pt
                </button>
              ))}
            </div>
          </div>


          {/* Editable Text Content */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
              Text Content
            </label>
            <textarea
              rows={3}
              value={annotation.text || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (onUpdateAnnotation) {
                  onUpdateAnnotation(annotation.id, {
                    text: val,
                    html: val.replace(/\n/g, "<br>")
                  });
                }
              }}
              placeholder="Enter note content..."
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                fontFamily: "inherit",
                resize: "vertical",
                boxSizing: "border-box"
              }}
            />
          </div>
        </div>
      )}

      {/* 7. Geometry Info Readout */}
      {geometryInfo && (
        <div style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: "6px"
        }}>
          <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>
            Measurements
          </div>
          {geometryInfo.areaM2 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
              <span style={{ color: "#475569" }}>Area:</span>
              <span style={{ fontWeight: 800, color: "#0f172a" }}>{geometryInfo.areaM2} m²</span>
            </div>
          )}
          {geometryInfo.perimM && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
              <span style={{ color: "#475569" }}>Perimeter:</span>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>{geometryInfo.perimM} m</span>
            </div>
          )}
          {geometryInfo.pointsCount && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "#64748b" }}>Nodes:</span>
              <span style={{ fontWeight: 600, color: "#334155" }}>{geometryInfo.pointsCount} nodes</span>
            </div>
          )}
          {geometryInfo.wM && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "#64748b" }}>Dimensions:</span>
              <span style={{ fontWeight: 600, color: "#334155" }}>{geometryInfo.wM}m × {geometryInfo.hM}m</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
