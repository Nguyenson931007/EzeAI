import React from "react";

/**
 * DimensionPair — Shared Height x Length input pair.
 *
 * Used by: Wall (FrameHardware), Insulation, Cladding, Hardies, PowerTruss.
 * Unifies the common Height/Length fields without removing task-specific features.
 *
 * Props:
 *   heightValue, lengthValue — current values (string|number)
 *   onHeightChange, onLengthChange — change handlers
 *   unit — "mm" | "m" (default "mm")
 *   heightLabel, lengthLabel — field labels (default "Height" / "Length")
 *   heightOptions — if provided, renders select instead of number input
 *   heightPlaceholder, lengthPlaceholder
 *   disabled
 *   highlight — yellow highlight styling (default false)
 *   className, style — wrapper customization
 */
export default function DimensionPair({
  heightValue,
  lengthValue,
  onHeightChange,
  onLengthChange,
  unit = "mm",
  heightLabel = "Height",
  lengthLabel = "Length",
  heightOptions = null,
  heightPlaceholder = "",
  lengthPlaceholder = "",
  disabled = false,
  highlight = false,
  className = "",
  style = {},
}) {
  const labelStyle = {
    fontSize: "10.5px",
    color: "#475569",
    fontWeight: 700,
    display: "block",
    marginBottom: "4px",
  };
  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    fontSize: "10.5px",
    borderRadius: "5px",
    border: highlight ? "1px solid #fde047" : "1px solid #cbd5e1",
    background: highlight ? "#fffbeb" : undefined,
    boxSizing: "border-box",
  };

  return (
    <div className={className} style={{ display: "flex", gap: "8px", ...style }}>
      {/* Height */}
      <div style={{ flex: "1 1 120px" }}>
        <span style={labelStyle}>{heightLabel}</span>
        {heightOptions ? (
          <select
            value={heightValue}
            onChange={(e) => onHeightChange?.(e.target.value)}
            disabled={disabled}
            className="task-field-select"
            style={inputStyle}
          >
            {heightOptions.map((opt) => (
              <option key={String(opt)} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="number"
            placeholder={heightPlaceholder}
            value={heightValue}
            onChange={(e) => onHeightChange?.(e.target.value)}
            disabled={disabled}
            style={inputStyle}
          />
        )}
      </div>

      {/* Length */}
      <div style={{ flex: "1.4 1 150px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
          <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>
            {lengthLabel}
          </span>
          <span style={{ fontSize: "10px", color: "#94a3b8" }}>{unit}</span>
        </div>
        <input
          type="number"
          placeholder={lengthPlaceholder}
          value={lengthValue}
          onChange={(e) => onLengthChange?.(e.target.value)}
          disabled={disabled}
          style={inputStyle}
        />
      </div>
    </div>
  );
}
