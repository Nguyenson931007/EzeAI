import React from "react";
import { normalizeFloorLevelCode } from "@/utils/floorLevel";
import "./taskUi.css";

/**
 * Shared separator row for every "Entered ..." task table.
 * Keep the visible floor format identical across tasks: "Level: GF",
 * "Level: FF", ... . TaskTableEnhancer also recognises this row through
 * data-task-group-row and only adds filtering/collapse behaviour.
 */
export default function FloorLevelGroupRow({ level, colSpan, count, unitLabel = "item", unitLabelPlural }) {
  const code = normalizeFloorLevelCode(level || "GF");
  const plural = unitLabelPlural || `${unitLabel}s`;
  const levelLabel = `Level: ${code}`;

  return (
    <tr
      data-task-group-row="true"
      data-floor-level={code}
      data-task-floor-level={code}
      className="task-floor-level-row"
    >
      <td
        colSpan={colSpan}
        data-task-level-code={code}
        data-task-level-label={levelLabel}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{levelLabel}</span>
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
