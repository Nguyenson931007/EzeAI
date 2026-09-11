import React from "react";

export const CALLOUT_STYLES = [
  // ── Standard Styles ──
  {
    id: "red",
    label: "Red",
    color: "#ef4444",
    bgColor: "#ffffff",
    isCloudy: false
  },
  {
    id: "purple",
    label: "Purple",
    color: "#a855f7",
    bgColor: "#ffffff",
    isCloudy: false
  },
  {
    id: "indigo",
    label: "Indigo",
    color: "#6366f1",
    bgColor: "#ffffff",
    isCloudy: false
  },
  {
    id: "blue",
    label: "Blue",
    color: "#3b82f6",
    bgColor: "#ffffff",
    isCloudy: false
  },
  {
    id: "green",
    label: "Green",
    color: "#22c55e",
    bgColor: "#ffffff",
    isCloudy: false
  },
  {
    id: "yellow",
    label: "Yellow",
    color: "#eab308",
    bgColor: "#ffffff",
    isCloudy: false
  },
  {
    id: "black",
    label: "Black",
    color: "#0f172a",
    bgColor: "#ffffff",
    isCloudy: false
  },

  // ── Cloudy Styles ──
  {
    id: "red-cloudy",
    label: "Red Cloudy",
    color: "#ef4444",
    bgColor: "rgba(254, 226, 226, 0.45)",
    isCloudy: true
  },
  {
    id: "purple-cloudy",
    label: "Purple Cloudy",
    color: "#a855f7",
    bgColor: "rgba(243, 232, 255, 0.45)",
    isCloudy: true
  },
  {
    id: "indigo-cloudy",
    label: "Indigo Cloudy",
    color: "#6366f1",
    bgColor: "rgba(224, 231, 255, 0.45)",
    isCloudy: true
  },
  {
    id: "blue-cloudy",
    label: "Blue Cloudy",
    color: "#3b82f6",
    bgColor: "rgba(219, 234, 254, 0.45)",
    isCloudy: true
  },
  {
    id: "green-cloudy",
    label: "Green Cloudy",
    color: "#22c55e",
    bgColor: "rgba(220, 252, 231, 0.45)",
    isCloudy: true
  },
  {
    id: "yellow-cloudy",
    label: "Yellow Cloudy",
    color: "#eab308",
    bgColor: "rgba(254, 249, 195, 0.45)",
    isCloudy: true
  },
  {
    id: "black-cloudy",
    label: "Black Cloudy",
    color: "#0f172a",
    bgColor: "rgba(226, 232, 240, 0.45)",
    isCloudy: true
  }
];

/**
 * CalloutThumbnail:
 * Miniature preview showing:
 * 1. Callout frame (rounded rect or cloudy scallops) with theme border & fill
 * 2. Leader line extending from frame
 * 3. Arrowhead at anchor end
 */
export function CalloutThumbnail({ styleItem, isSelected, onClick, size = "normal" }) {
  const isCompact = size === "compact";
  const w = isCompact ? 76 : 88;
  const h = isCompact ? 48 : 56;
  const color = styleItem.color;
  const bg = styleItem.bgColor;

  return (
    <button
      type="button"
      onClick={() => onClick && onClick(styleItem)}
      title={`${styleItem.label} Callout`}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: `${w}px`,
        padding: "4px 3px 5px 3px",
        background: isSelected ? "rgba(37, 99, 235, 0.08)" : "#ffffff",
        border: isSelected ? "2px solid #2563eb" : "1.5px solid #e2e8f0",
        borderRadius: "8px",
        cursor: "pointer",
        transition: "all 0.15s ease-in-out",
        boxShadow: isSelected
          ? "0 0 0 3px rgba(37, 99, 235, 0.22), 0 3px 8px rgba(0,0,0,0.12)"
          : "0 1px 3px rgba(0,0,0,0.06)",
        outline: "none",
        userSelect: "none"
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = "#94a3b8";
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 4px 10px rgba(0,0,0,0.1)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = "#e2e8f0";
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
        }
      }}
    >
      {/* Selected Checkmark Badge */}
      {isSelected && (
        <div
          style={{
            position: "absolute",
            top: "3px",
            right: "3px",
            width: "14px",
            height: "14px",
            borderRadius: "50%",
            background: "#2563eb",
            color: "#ffffff",
            fontSize: "9px",
            fontWeight: "800",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            zIndex: 2
          }}
        >
          ✓
        </div>
      )}

      {/* SVG Preview: Frame + Leader + Arrow */}
      <svg
        viewBox="0 0 74 46"
        style={{ width: "100%", height: isCompact ? "32px" : "38px", overflow: "visible" }}
      >
        {/* Leader Line */}
        <line
          x1="26"
          y1="24"
          x2="8"
          y2="38"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Arrow Head at tip (8, 38) */}
        <polygon
          points="6,40 14,35 11,42"
          fill={color}
        />

        {/* Callout Frame (Cloudy or Rounded Rect) */}
        {styleItem.isCloudy ? (
          <path
            d="M 22 8 
               Q 31 3, 40 8 
               Q 50 3, 60 8 
               Q 69 4, 70 12 
               Q 75 18, 70 24 
               Q 62 29, 52 25 
               Q 41 29, 32 25 
               Q 23 29, 21 21 
               Q 16 14, 22 8 Z"
            fill={bg}
            stroke={color}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        ) : (
          <rect
            x="20"
            y="6"
            width="50"
            height="20"
            rx="4"
            fill={bg}
            stroke={color}
            strokeWidth="1.6"
          />
        )}

        {/* Simulated Text Lines inside Frame */}
        <line
          x1="24"
          y1="12"
          x2="64"
          y2="12"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.65"
        />
        <line
          x1="24"
          y1="18"
          x2="52"
          y2="18"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.4"
        />
      </svg>

      {/* Style Label */}
      <span
        style={{
          fontSize: isCompact ? "10px" : "11px",
          fontWeight: isSelected ? "700" : "500",
          color: isSelected ? "#1d4ed8" : "#334155",
          marginTop: "2px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "100%",
          lineHeight: 1.1
        }}
      >
        {styleItem.label}
      </span>
    </button>
  );
}

/**
 * CalloutStylePicker:
 * Interactive gallery displaying all 14 Callout styles (7 Standard + 7 Cloudy).
 */
export default function CalloutStylePicker({
  selectedStyleId,
  selectedColor,
  isCloudy,
  onSelectStyle,
  size = "normal"
}) {
  // Determine currently active style item
  const currentId = selectedStyleId || (() => {
    const matched = CALLOUT_STYLES.find(
      (s) => s.isCloudy === !!isCloudy && (selectedColor ? s.color.toLowerCase() === selectedColor.toLowerCase() : true)
    );
    return matched ? matched.id : (isCloudy ? "red-cloudy" : "red");
  })();

  const standardStyles = CALLOUT_STYLES.filter((s) => !s.isCloudy);
  const cloudyStyles = CALLOUT_STYLES.filter((s) => s.isCloudy);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
      {/* 1. Standard Styles Section */}
      <div>
        <div
          style={{
            fontSize: "11px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "#64748b",
            marginBottom: "6px",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          <span>Standard Callouts</span>
          <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: "normal" }}>(Solid Border)</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(82px, 1fr))",
            gap: "7px"
          }}
        >
          {standardStyles.map((item) => (
            <CalloutThumbnail
              key={item.id}
              styleItem={item}
              isSelected={currentId === item.id}
              onClick={onSelectStyle}
              size={size}
            />
          ))}
        </div>
      </div>

      {/* 2. Cloudy Styles Section */}
      <div>
        <div
          style={{
            fontSize: "11px",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "#64748b",
            marginBottom: "6px",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          <span>Cloudy Callouts</span>
          <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: "normal" }}>(Cloud Border)</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(82px, 1fr))",
            gap: "7px"
          }}
        >
          {cloudyStyles.map((item) => (
            <CalloutThumbnail
              key={item.id}
              styleItem={item}
              isSelected={currentId === item.id}
              onClick={onSelectStyle}
              size={size}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
