import React from "react";

export default function EnteredTaskActions({
  onAutoFill,
  onClear,
  isOpen,
  onToggle,
  autoFillDisabled = false,
  autoFillLabel = "Auto Fill"
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
      {onAutoFill && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAutoFill();
          }}
          disabled={autoFillDisabled}
          style={{
            background: "#eff6ff",
            border: "1px solid #93c5fd",
            color: "#1d4ed8",
            fontSize: "10.5px",
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: "4px",
            cursor: autoFillDisabled ? "not-allowed" : "pointer",
            opacity: autoFillDisabled ? 0.65 : 1,
            whiteSpace: "nowrap"
          }}
        >
          ⚡ {autoFillLabel}
        </button>
      )}

      {onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          style={{
            background: "#fff",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            fontSize: "10.5px",
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: "4px",
            cursor: "pointer",
            whiteSpace: "nowrap"
          }}
        >
          Clear data
        </button>
      )}

      {onToggle && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={isOpen ? "Hide section" : "Show section"}
          title={isOpen ? "Hide" : "Show"}
          style={{
            border: 0,
            background: "transparent",
            color: "#64748b",
            fontSize: "12px",
            fontWeight: 800,
            padding: "1px 2px",
            cursor: "pointer",
            lineHeight: 1
          }}
        >
          {isOpen ? "▲" : "▼"}
        </button>
      )}
    </div>
  );
}
