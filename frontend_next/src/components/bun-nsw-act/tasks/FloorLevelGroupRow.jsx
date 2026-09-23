import React from "react";

/**
 * Standard floor-level separator row for "Entered ..." task tables
 * (Frame Hardware, Lock Up, Insulation, Cladding, Fixout, Flooring &
 * Decking, Hebel Flooring, FOW/Plumbing, Power Truss & Braces, Shelving,
 * Timber Posts, Eaves & Soffits).
 *
 * Every task previously rendered this row with its own slightly different
 * markup ("Level: {level}", "Level: {level} ({name})", colored badges,
 * with/without an item count...). Use this component instead so every task
 * table shows the exact same compact "Level: GF" format.
 *
 * `data-task-group-row="true"` is required — TaskTableEnhancer relies on it
 * to recognize a manually-rendered group row and leave it alone.
 */
export default function FloorLevelGroupRow({ level, colSpan, count, unitLabel = "item", unitLabelPlural }) {
  const plural = unitLabelPlural || `${unitLabel}s`;
  return (
    <tr data-task-group-row="true" data-floor-level={level} style={{ background: "#eaf2ff", borderTop: "2px solid #93c5fd" }}>
      <td colSpan={colSpan} style={{ padding: "6px 10px", fontSize: "10.5px", fontWeight: 800, color: "#1e3a5f" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Level: {level}</span>
          {typeof count === "number" && (
            <span style={{ color: "#64748b", fontWeight: 600 }}>
              {count} {count === 1 ? unitLabel : plural}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
