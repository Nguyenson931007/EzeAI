import React from "react";

/**
 * NameField — Shared name/label text input.
 *
 * Used by: Roof (name), Room (room_name), Text/Label (text),
 *          Window (Label), Door (Name).
 *
 * Props:
 *   value, onChange
 *   label — field label (default "Name")
 *   placeholder
 *   disabled
 *   maxLength
 */
export default function NameField({
  value,
  onChange,
  label = "Name",
  placeholder = "",
  disabled = false,
  maxLength = undefined,
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

  return (
    <div className={className} style={style}>
      <span style={labelStyle}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
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
  );
}
