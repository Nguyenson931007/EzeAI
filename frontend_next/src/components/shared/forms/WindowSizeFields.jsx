import React from "react";
import DimensionPair from "./DimensionPair";

/**
 * WindowSizeFields — Shared Height x Width for windows.
 *
 * Used by: WindowEditDialog (W1) + WindowTask table (W2) + DoorWindowPropertyPanel (W3).
 *
 * Handles Raked windows (two heights + Flip button).
 *
 * Props:
 *   heightValue, widthValue, height2Value (for Raked)
 *   onHeightChange, onWidthChange, onHeight2Change
 *   isRaked — show second height input
 *   onFlipHeights — callback for Flip button (Raked only)
 *   unit — default "mm"
 *   disabled
 */
export default function WindowSizeFields({
  heightValue,
  widthValue,
  height2Value,
  onHeightChange,
  onWidthChange,
  onHeight2Change,
  isRaked = false,
  onFlipHeights,
  unit = "mm",
  disabled = false,
  className = "",
  style = {},
}) {
  return (
    <div className={className} style={style}>
      <DimensionPair
        heightValue={heightValue}
        lengthValue={widthValue}
        onHeightChange={onHeightChange}
        onLengthChange={onWidthChange}
        unit={unit}
        heightLabel={isRaked ? "Height 1 (Left)" : "Height"}
        lengthLabel="Width"
        disabled={disabled}
      />
      {isRaked && (
        <div style={{ display: "flex", gap: "8px", marginTop: "8px", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontSize: "10.5px",
                color: "#475569",
                fontWeight: 700,
                display: "block",
                marginBottom: "4px",
              }}
            >
              Height 2 (Right)
            </span>
            <input
              type="number"
              value={height2Value || ""}
              onChange={(e) => onHeight2Change?.(e.target.value)}
              disabled={disabled}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: "10.5px",
                borderRadius: "5px",
                border: "1px solid #cbd5e1",
                boxSizing: "border-box",
              }}
            />
          </div>
          {onFlipHeights && (
            <button
              type="button"
              onClick={onFlipHeights}
              disabled={disabled}
              title="Flip heights"
              style={{
                padding: "6px 10px",
                fontSize: "12px",
                borderRadius: "5px",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                cursor: "pointer",
              }}
            >
              ⇄ Flip
            </button>
          )}
        </div>
      )}
    </div>
  );
}
