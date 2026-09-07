"use client";
import React from "react";

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
const FONT_SIZE_OPTIONS = [14, 18, 22, 28, 32, 40, 48, 64];

export default function AnnotationPropertyPanel({
  annotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onDuplicateAnnotation,
  realScale,
  scaleValue
}) {
  if (!annotation) return null;

  const mmPerPx = (typeof realScale === "number" && realScale > 0) ? realScale : 20;

  // Geometry calculations
  let geometryInfo = null;
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

  // Type labels and badges
  const typeLabels = {
    "highlight": "Cọ tô sáng (Highlight Brush)",
    "highlight-brush": "Cọ tô sáng (Highlight Brush)",
    "highlight-poly": "Vùng tô sáng (Highlight Area)",
    "text": "Văn bản ghi chú (Text Note)",
    "sticky-note": "Ghi chú dán (Sticky Note)",
    "callout": "Hộp chú thích (Callout)",
    "measure-area-poly": "Vùng đo diện tích (Area Polygon)",
    "measure-area": "Vùng đo diện tích (Area Box)",
    "measure-perimeter": "Đo chu vi (Perimeter)",
    "rect": "Hình chữ nhật (Rectangle)",
    "oval": "Hình elip / tròn (Oval)",
    "cloud": "Đám mây (Cloud)",
    "polygon": "Đa giác (Polygon)",
    "line": "Đường thẳng (Line)",
    "arrow": "Mũi tên (Arrow)",
    "underline": "Gạch chân (Underline)",
    "strikethrough": "Gạch ngang (Strikethrough)",
    "stamp": "Hình đóng dấu (Stamp)"
  };

  const typeName = typeLabels[annotation.type] || annotation.type || "Nét vẽ";

  const isTextLike = ["text", "callout", "sticky-note"].includes(annotation.type);
  const isHighlight = annotation.type?.startsWith("highlight");
  const isFillable = ["rect", "oval", "cloud", "polygon", "measure-area-poly", "measure-area", "highlight-poly"].includes(annotation.type);
  const hasStroke = !["sticky-note"].includes(annotation.type);

  const currentColor = annotation.color || (isHighlight ? "#facc15" : "#3b82f6");
  const currentOpacity = typeof annotation.opacity === "number" ? annotation.opacity : (isHighlight ? 0.45 : 1.0);
  const currentFillOpacity = typeof annotation.fillOpacity === "number" ? annotation.fillOpacity : (isHighlight ? 0.4 : 0.25);
  const currentStrokeWidth = annotation.strokeWidth || (isHighlight ? 24 : 3);
  const currentFillMode = annotation.fillMode || (isHighlight ? "both" : "stroke");
  const currentFontSize = annotation.fontSize || (annotation.type === "text" ? 32 : 20);

  const handleUpdate = (field, val) => {
    if (onUpdateAnnotation) {
      onUpdateAnnotation(annotation.id, { [field]: val });
    }
  };

  return (
    <div className="annotation-property-panel" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "4px 2px" }}>
      {/* 1. Header with Type Badge */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "linear-gradient(135deg, rgba(49,69,110,0.12), rgba(49,69,110,0.04))",
        border: "1px solid rgba(49,69,110,0.2)",
        borderRadius: "8px",
        padding: "10px 12px"
      }}>
        <div>
          <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#64748b", fontWeight: 700 }}>
            Thuộc tính đối tượng
          </div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b", marginTop: "2px" }}>
            {typeName}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {onDuplicateAnnotation && (
            <button
              type="button"
              onClick={() => onDuplicateAnnotation(annotation.id)}
              title="Nhân bản (Duplicate)"
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
              title="Xóa đối tượng (Delete)"
              style={{
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: "6px",
                padding: "6px 9px",
                cursor: "pointer",
                fontSize: "12px",
                color: "#dc2626",
                fontWeight: 600
              }}
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {/* 2. Color Selection (Palette & Custom Picker) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
            Màu sắc (Color)
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
              title="Chọn màu khác tùy chỉnh..."
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

      {/* 3. Opacity (Độ đậm nhạt / Alpha) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
            Độ đậm nhạt (Opacity)
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
          <span>10% (Rất mờ)</span>
          <span>50%</span>
          <span>100% (Đậm đặc)</span>
        </div>
      </div>

      {/* 4. Stroke Width (Độ dày nét vẽ) */}
      {hasStroke && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
              Độ dày nét (Stroke Width)
            </label>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#31456E" }}>
              {currentStrokeWidth} px
            </span>
          </div>
          <input
            type="range"
            min={isHighlight ? "6" : "1"}
            max={isHighlight ? "60" : "36"}
            step="1"
            value={currentStrokeWidth}
            onChange={(e) => handleUpdate("strokeWidth", parseInt(e.target.value, 10))}
            style={{ width: "100%", cursor: "pointer", accentColor: "#31456E" }}
          />
          {/* Quick preset buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {(isHighlight ? [12, 18, 24, 32, 44, 56] : STROKE_WIDTH_OPTIONS).map((w) => (
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

      {/* 5. Fill Mode & Fill Opacity (For shapes & areas) */}
      {isFillable && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
            Chế độ tô màu (Fill Mode)
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
            {[
              { id: "stroke", label: "Viền nét" },
              { id: "fill", label: "Tô màu" },
              { id: "both", label: "Cả viền & tô" }
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
                <span>Độ mờ phần tô (Fill Opacity):</span>
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
          {/* Font Size */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                Cỡ chữ (Font Size)
              </label>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#31456E" }}>
                {currentFontSize} px
              </span>
            </div>
            <input
              type="range"
              min="14"
              max="72"
              step="2"
              value={currentFontSize}
              onChange={(e) => handleUpdate("fontSize", parseInt(e.target.value, 10))}
              style={{ width: "100%", cursor: "pointer", accentColor: "#31456E" }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {FONT_SIZE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleUpdate("fontSize", s)}
                  style={{
                    background: currentFontSize === s ? "#31456E" : "#f1f5f9",
                    color: currentFontSize === s ? "#ffffff" : "#475569",
                    border: "1px solid #cbd5e1",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Text Style: Bold, Italic, Underline, Strike */}
          {annotation.type !== "sticky-note" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                Kiểu chữ (Font Style)
              </label>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => handleUpdate("isBold", !(annotation.isBold !== false))}
                  style={{
                    flex: 1,
                    background: annotation.isBold !== false ? "#31456E" : "#f8fafc",
                    color: annotation.isBold !== false ? "#ffffff" : "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "6px 0",
                    fontWeight: 800,
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdate("isItalic", !annotation.isItalic)}
                  style={{
                    flex: 1,
                    background: annotation.isItalic ? "#31456E" : "#f8fafc",
                    color: annotation.isItalic ? "#ffffff" : "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "6px 0",
                    fontStyle: "italic",
                    fontFamily: "serif",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer"
                  }}
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdate("isUnderline", !annotation.isUnderline)}
                  style={{
                    flex: 1,
                    background: annotation.isUnderline ? "#31456E" : "#f8fafc",
                    color: annotation.isUnderline ? "#ffffff" : "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "6px 0",
                    textDecoration: "underline",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  U
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdate("isStrikethrough", !annotation.isStrikethrough)}
                  style={{
                    flex: 1,
                    background: annotation.isStrikethrough ? "#31456E" : "#f8fafc",
                    color: annotation.isStrikethrough ? "#ffffff" : "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    padding: "6px 0",
                    textDecoration: "line-through",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  S
                </button>
              </div>
            </div>
          )}

          {/* Editable Text Content */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
              Nội dung văn bản (Text Content)
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
              placeholder="Nhập nội dung ghi chú..."
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
            Thông số đo đạc (Measurements)
          </div>
          {geometryInfo.areaM2 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
              <span style={{ color: "#475569" }}>Diện tích:</span>
              <span style={{ fontWeight: 800, color: "#0f172a" }}>{geometryInfo.areaM2} m²</span>
            </div>
          )}
          {geometryInfo.perimM && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
              <span style={{ color: "#475569" }}>Chu vi:</span>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>{geometryInfo.perimM} m</span>
            </div>
          )}
          {geometryInfo.pointsCount && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "#64748b" }}>Số đỉnh (Nodes):</span>
              <span style={{ fontWeight: 600, color: "#334155" }}>{geometryInfo.pointsCount} đỉnh</span>
            </div>
          )}
          {geometryInfo.wM && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "#64748b" }}>Kích thước:</span>
              <span style={{ fontWeight: 600, color: "#334155" }}>{geometryInfo.wM}m × {geometryInfo.hM}m</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
