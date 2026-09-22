import React from "react";

export default function TaskDataActions({
  taskId,
  onAutoFill,
  onClear,
  autoFillDisabled = false,
  clearDisabled = false
}) {
  if (!taskId) return null;

  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "8px",
        flexShrink: 0
      }}
    >
      {onAutoFill && (
        <button
          type="button"
          onClick={() => onAutoFill(taskId)}
          disabled={autoFillDisabled}
          title="Auto Fill from detected drawing data using the Procurement field contract"
          style={{
            background: "#eff6ff",
            color: "#1d4ed8",
            border: "1px solid #93c5fd",
            borderRadius: "6px",
            padding: "5px 10px",
            fontSize: "11px",
            fontWeight: 800,
            cursor: autoFillDisabled ? "not-allowed" : "pointer",
            opacity: autoFillDisabled ? 0.65 : 1
          }}
        >
          ⚡ Auto Fill
        </button>
      )}

      {onClear && (
        <button
          type="button"
          onClick={() => onClear(taskId)}
          disabled={clearDisabled}
          title="Clear all data currently loaded in this task form"
          style={{
            background: "#ffffff",
            color: "#b91c1c",
            border: "1px solid #fecaca",
            borderRadius: "6px",
            padding: "5px 10px",
            fontSize: "11px",
            fontWeight: 700,
            cursor: clearDisabled ? "not-allowed" : "pointer",
            opacity: clearDisabled ? 0.65 : 1
          }}
        >
          Clear data
        </button>
      )}
    </div>
  );
}
