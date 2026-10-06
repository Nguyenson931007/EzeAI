import React from "react";

/**
 * WindowStatusField — Shared status select for windows.
 *
 * Used by: WindowEditDialog (W1) + DoorWindowPropertyPanel (W3).
 * Options: Active / Deleted / Superseded.
 */
const DEFAULT_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "deleted", label: "Deleted" },
  { value: "superseded", label: "Superseded" },
];

export default function WindowStatusField({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  label = "Status",
  disabled = false,
  className = "",
  style = {},
}) {
  return (
    <div className={className} style={style}>
      <span
        style={{
          fontSize: "10.5px",
          color: "#475569",
          fontWeight: 700,
          display: "block",
          marginBottom: "4px",
        }}
      >
        {label}
      </span>
      <select
        value={value || "active"}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "6px 8px",
          fontSize: "10.5px",
          borderRadius: "5px",
          border: "1px solid #cbd5e1",
          boxSizing: "border-box",
        }}
      >
        {options.map((opt) => {
          const val = typeof opt === "string" ? opt : opt.value;
          const lab = typeof opt === "string" ? opt : opt.label || opt.value;
          return (
            <option key={String(val)} value={val}>
              {lab}
            </option>
          );
        })}
      </select>
    </div>
  );
}
