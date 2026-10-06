import React from "react";
import NameField from "./NameField";
import DimensionPair from "./DimensionPair";

/**
 * DoorCanvasFields — Shared fields for canvas door editing.
 *
 * Used by: DoorEditDialog (popup) + DoorWindowPropertyPanel (properties panel).
 * Unifies the 7 common fields without removing form-specific features.
 *
 * Common fields:
 *   - Name / Label (text)
 *   - Door Type / Penetration Type (select from registry)
 *   - Material (select)
 *   - Fire Rating (select)
 *   - Status (select: active/deleted/superseded)
 *   - Height x Width (number, mm)
 *
 * Props:
 *   values — object with field values {name, doorType, material, fireRating, status, height, width}
 *   onChange(field, value) — change handler
 *   doorTypeOptions, materialOptions, fireRatingOptions, statusOptions — option arrays
 *   variant — "dialog" | "panel" (for styling differences)
 *   disabled
 */
export default function DoorCanvasFields({
  values = {},
  onChange,
  doorTypeOptions = [],
  materialOptions = [],
  fireRatingOptions = [],
  statusOptions = [
    { value: "active", label: "Active" },
    { value: "deleted", label: "Deleted" },
    { value: "superseded", label: "Superseded" },
  ],
  variant = "dialog",
  disabled = false,
  className = "",
  style = {},
}) {
  const handleChange = (field) => (value) => {
    // Handle both event and direct value
    const val = value?.target ? value.target.value : value;
    onChange?.(field, val);
  };

  const selectStyle = {
    width: "100%",
    padding: "6px 8px",
    fontSize: "10.5px",
    borderRadius: "5px",
    border: "1px solid #cbd5e1",
    boxSizing: "border-box",
  };
  const labelStyle = {
    fontSize: "10.5px",
    color: "#475569",
    fontWeight: 700,
    display: "block",
    marginBottom: "4px",
  };

  const renderOptions = (opts) =>
    opts.map((opt) => {
      const val = typeof opt === "string" ? opt : opt.value;
      const lab = typeof opt === "string" ? opt : opt.label || opt.value;
      return (
        <option key={String(val)} value={val}>
          {lab}
        </option>
      );
    });

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: "8px", ...style }}>
      <NameField
        label="Name"
        value={values.name || ""}
        onChange={handleChange("name")}
        placeholder="e.g. D-02, Entry Door"
        disabled={disabled}
      />

      <div>
        <span style={labelStyle}>Door Type</span>
        <select
          value={values.doorType || ""}
          onChange={handleChange("doorType")}
          disabled={disabled}
          style={selectStyle}
        >
          <option value="">Select...</option>
          {renderOptions(doorTypeOptions)}
        </select>
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Material</span>
          <select
            value={values.material || ""}
            onChange={handleChange("material")}
            disabled={disabled}
            style={selectStyle}
          >
            <option value="">Select...</option>
            {renderOptions(materialOptions)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <span style={labelStyle}>Fire Rating</span>
          <select
            value={values.fireRating || ""}
            onChange={handleChange("fireRating")}
            disabled={disabled}
            style={selectStyle}
          >
            <option value="">Select...</option>
            {renderOptions(fireRatingOptions)}
          </select>
        </div>
      </div>

      <div>
        <span style={labelStyle}>Status</span>
        <select
          value={values.status || "active"}
          onChange={handleChange("status")}
          disabled={disabled}
          style={selectStyle}
        >
          {renderOptions(statusOptions)}
        </select>
      </div>

      <DimensionPair
        heightValue={values.height || ""}
        lengthValue={values.width || ""}
        onHeightChange={handleChange("height")}
        onLengthChange={handleChange("width")}
        unit="mm"
        heightLabel="Height"
        lengthLabel="Width"
        disabled={disabled}
      />
    </div>
  );
}
