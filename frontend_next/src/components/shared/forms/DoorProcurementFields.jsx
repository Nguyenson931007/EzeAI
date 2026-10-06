import React from "react";

/**
 * DoorProcurementFields — Shared fields for door procurement table editing.
 *
 * Used by: LockupTask (table inline) + FixoutTask (table inline).
 * Unifies the 9 common fields without removing task-specific features.
 *
 * Common fields:
 *   - label / door_label (text) — field name differs per task!
 *   - category (select)
 *   - door_type (select)
 *   - height (select)
 *   - width (select)
 *   - thickness / thicks (select) — field name differs per task!
 *   - door_stop (select)
 *   - qty (number)
 *   - task move (select: Lockup/Fixout)
 *
 * Props:
 *   values — object with field values
 *   onChange(field, value) — change handler (use canonical field names)
 *   fieldNameMap — maps canonical -> actual, e.g. {label: "door_label", thickness: "thicks"}
 *                  (for FixoutTask; LockupTask uses defaults)
 *   options — {categoryOptions, doorTypeOptions, heightOptions, widthOptions,
 *              thicknessOptions, doorStopOptions}
 *   showTaskMove — show the Lockup/Fixout switcher (default true)
 *   disabled
 *
 * NOTE: Does NOT rename fields in the data model. The parent maps
 * canonical names to actual field names via fieldNameMap.
 */
export default function DoorProcurementFields({
  values = {},
  onChange,
  fieldNameMap = {},
  options = {},
  showTaskMove = true,
  disabled = false,
  className = "",
  style = {},
}) {
  // Resolve actual field names
  const labelField = fieldNameMap.label || "label";
  const thicknessField = fieldNameMap.thickness || "thickness";

  const handleChange = (canonicalField) => (e) => {
    const val = e?.target ? e.target.value : e;
    onChange?.(canonicalField, val);
  };

  const {
    categoryOptions = [],
    doorTypeOptions = [],
    heightOptions = [],
    widthOptions = [],
    thicknessOptions = [],
    doorStopOptions = [],
  } = options;

  const selectStyle = {
    width: "100%",
    padding: "4px 6px",
    fontSize: "11px",
    borderRadius: "4px",
    border: "1px solid #cbd5e1",
    boxSizing: "border-box",
  };
  const inputStyle = { ...selectStyle };
  const labelStyle = {
    fontSize: "10px",
    color: "#475569",
    fontWeight: 700,
    display: "block",
    marginBottom: "2px",
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

  const Field = ({ label, children }) => (
    <div style={{ flex: "1 1 100px", minWidth: "90px" }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  );

  return (
    <div
      className={className}
      style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "flex-end", ...style }}
    >
      <Field label="Label">
        <input
          type="text"
          value={values[labelField] || values.label || values.door_label || ""}
          onChange={handleChange("label")}
          disabled={disabled}
          style={inputStyle}
        />
      </Field>

      <Field label="Category">
        <select
          value={values.category || ""}
          onChange={handleChange("category")}
          disabled={disabled}
          style={selectStyle}
        >
          <option value="">Select...</option>
          {renderOptions(categoryOptions)}
        </select>
      </Field>

      {showTaskMove && (
        <Field label="Task">
          <select
            value={values._taskMove || ""}
            onChange={handleChange("_taskMove")}
            disabled={disabled}
            style={selectStyle}
          >
            <option value="lockup">Lockup</option>
            <option value="fixout">Fixout</option>
          </select>
        </Field>
      )}

      <Field label="Door Type">
        <select
          value={values.door_type || ""}
          onChange={handleChange("door_type")}
          disabled={disabled}
          style={selectStyle}
        >
          <option value="">Select...</option>
          {renderOptions(doorTypeOptions)}
        </select>
      </Field>

      <Field label="Height">
        <select
          value={values.height || ""}
          onChange={handleChange("height")}
          disabled={disabled}
          style={selectStyle}
        >
          <option value="">Select...</option>
          {renderOptions(heightOptions)}
        </select>
      </Field>

      <Field label="Width">
        <select
          value={values.width || ""}
          onChange={handleChange("width")}
          disabled={disabled}
          style={selectStyle}
        >
          <option value="">Select...</option>
          {renderOptions(widthOptions)}
        </select>
      </Field>

      <Field label="Thickness">
        <select
          value={values[thicknessField] || values.thickness || values.thicks || ""}
          onChange={handleChange("thickness")}
          disabled={disabled}
          style={selectStyle}
        >
          <option value="">Select...</option>
          {renderOptions(thicknessOptions)}
        </select>
      </Field>

      <Field label="Door Stop">
        <select
          value={values.door_stop || ""}
          onChange={handleChange("door_stop")}
          disabled={disabled}
          style={selectStyle}
        >
          <option value="">Select...</option>
          {renderOptions(doorStopOptions)}
        </select>
      </Field>

      <Field label="Qty">
        <input
          type="number"
          value={values.qty || ""}
          onChange={handleChange("qty")}
          disabled={disabled}
          style={{ ...inputStyle, width: "60px" }}
        />
      </Field>
    </div>
  );
}
