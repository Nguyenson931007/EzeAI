import React from "react";

/**
 * TypeQtyFields — Shared Type select + Quantity number pair.
 *
 * Used by: Shelving, TimberPosts, PowerTruss, FowPlumbing.
 *
 * Props:
 *   typeValue, qtyValue
 *   onTypeChange, onQtyChange
 *   typeOptions — array of {value, label} or strings
 *   typeLabel, qtyLabel
 *   disabled
 */
export default function TypeQtyFields({
  typeValue,
  qtyValue,
  onTypeChange,
  onQtyChange,
  typeOptions = [],
  typeLabel = "Type",
  qtyLabel = "Qty",
  disabled = false,
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
    border: "1px solid #cbd5e1",
    boxSizing: "border-box",
  };

  return (
    <div className={className} style={{ display: "flex", gap: "8px", ...style }}>
      <div style={{ flex: "1 1 140px" }}>
        <span style={labelStyle}>{typeLabel}</span>
        <select
          value={typeValue}
          onChange={(e) => onTypeChange?.(e.target.value)}
          disabled={disabled}
          style={inputStyle}
        >
          {typeOptions.map((opt) => {
            const val = typeof opt === "string" ? opt : opt.value;
            const lab = typeof opt === "string" ? opt : opt.label;
            return (
              <option key={String(val)} value={val}>
                {lab}
              </option>
            );
          })}
        </select>
      </div>
      <div style={{ flex: "0 1 80px" }}>
        <span style={labelStyle}>{qtyLabel}</span>
        <input
          type="number"
          value={qtyValue}
          onChange={(e) => onQtyChange?.(e.target.value)}
          disabled={disabled}
          style={inputStyle}
        />
      </div>
    </div>
  );
}
