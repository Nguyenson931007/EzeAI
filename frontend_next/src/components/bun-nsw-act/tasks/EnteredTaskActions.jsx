import React from "react";

export default function EnteredTaskActions({
  onAutoFill,
  onClear,
  onSave,
  isOpen,
  onToggle,
  autoFillDisabled = false,
  saveDisabled = false,
  saveStatus = "idle",
  autoFillLabel = "Auto Fill",
  saveLabel = "Save"
}) {
  const isSaving = saveStatus === "saving";
  const isSaved = saveStatus === "success";
  const isSaveError = saveStatus === "error";

  return (
    <div className="entered-task-actions" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap" }}>
      {onAutoFill && (
        <button
          className="entered-task-action entered-task-action--autofill"
          type="button"
          style={{
            background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
            border: "1px solid #93c5fd",
            color: "#1d4ed8",
            fontSize: "10.5px",
            fontWeight: 700,
            padding: "3px 10px",
            minHeight: "28px",
            borderRadius: "5px",
            cursor: autoFillDisabled ? "not-allowed" : "pointer",
            opacity: autoFillDisabled ? 0.65 : 1,
            whiteSpace: "nowrap"
          }}
          onClick={(e) => {
            e.stopPropagation();
            onAutoFill();
          }}
          disabled={autoFillDisabled}
          title="Auto Fill"
        >
          ⚡ {autoFillLabel}
        </button>
      )}

      {onClear && (
        <button
          className="entered-task-action entered-task-action--clear"
          type="button"
          style={{
            background: "#ffffff",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            fontSize: "10.5px",
            fontWeight: 700,
            padding: "3px 10px",
            minHeight: "28px",
            borderRadius: "5px",
            cursor: "pointer",
            whiteSpace: "nowrap"
          }}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          title="Clear data"
        >
          Clear data
        </button>
      )}

      {onSave && (
        <button
          className={`entered-task-action entered-task-action--confirm${isSaved ? " is-saved" : ""}${isSaveError ? " is-error" : ""}`}
          type="button"
          style={{
            background: isSaveError ? "#fef2f2" : isSaved ? "#dcfce7" : "#f0fdf4",
            border: "1px solid",
            borderColor: isSaveError ? "#fca5a5" : isSaved ? "#4ade80" : "#86efac",
            color: isSaveError ? "#b91c1c" : "#15803d",
            fontSize: "10.5px",
            fontWeight: 700,
            padding: "3px 10px",
            minHeight: "28px",
            borderRadius: "5px",
            cursor: saveDisabled || isSaving ? "not-allowed" : "pointer",
            opacity: saveDisabled || isSaving ? 0.65 : 1,
            whiteSpace: "nowrap"
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          disabled={saveDisabled || isSaving}
          title="Save"
        >
          {isSaving ? "Saving..." : isSaved ? "✓ Saved" : isSaveError ? "Retry Save" : `💾 ${saveLabel}`}
        </button>
      )}

      {onToggle && (
        <button
          className="entered-task-toggle"
          type="button"
          style={{
            width: "28px",
            height: "28px",
            minWidth: "28px",
            border: 0,
            background: "transparent",
            color: "#64748b",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={isOpen ? "hide section" : "show section"}
          title={isOpen ? "hide" : "show"}
        >
          {isOpen ? "▲" : "▼"}
        </button>
      )}
    </div>
  );
}
