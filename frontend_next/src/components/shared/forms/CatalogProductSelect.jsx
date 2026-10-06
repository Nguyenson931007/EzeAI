import React from "react";

/**
 * CatalogProductSelect — Shared product/material select from catalog.
 *
 * Used by: Insulation (Product), TimberPosts (Product), Flooring/Decking (Product),
 *          Cladding (Description), FowPlumbing (Item Name).
 *
 * Props:
 *   value, onChange
 *   options — array of {value, label} or strings
 *   label — field label
 *   placeholder
 *   disabled
 */
export default function CatalogProductSelect({
  value,
  onChange,
  options = [],
  label = "Product",
  placeholder = "Select...",
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

  return (
    <div className={className} style={style}>
      <span style={labelStyle}>{label}</span>
      <select
        value={value}
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
        <option value="">{placeholder}</option>
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
