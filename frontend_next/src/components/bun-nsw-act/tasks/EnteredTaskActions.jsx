import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function EnteredTaskActions({
  onAutoFill,
  onAddData,
  onClear,
  onSave,
  isOpen,
  onToggle,
  autoFillDisabled = false,
  addDataDisabled = false,
  saveDisabled = false,
  saveStatus = "idle",
  autoFillLabel = "Auto Fill",
  addDataLabel = "Add data",
  saveLabel = "Save",
  // ── New: Read-only / Edit mode for DB-loaded data ──
  dataSource = null,      // "db" | "local" | null
  isReadOnly = false,     // true when data loaded from DB is in view-only mode
  onEdit = null,          // callback to switch from read-only to edit mode
  isLoadingFromDb = false // true while auto-loading data from DB
}) {
  const [portalHost, setPortalHost] = useState(null);
  const onSaveRef = useRef(onSave);
  const saveDisabledRef = useRef(saveDisabled);
  const isReadOnlyRef = useRef(isReadOnly);
  onSaveRef.current = onSave;
  saveDisabledRef.current = saveDisabled;
  isReadOnlyRef.current = isReadOnly;
  const isSaving = saveStatus === "saving";
  const isSaved = saveStatus === "success";
  const isSaveError = saveStatus === "error";
  const isDbSource = dataSource === "db";

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const resolveHost = () => setPortalHost(document.getElementById("task-global-actions-slot"));
    resolveHost();
    window.addEventListener("ezefloor:task-action-slot-ready", resolveHost);
    return () => window.removeEventListener("ezefloor:task-action-slot-ready", resolveHost);
  }, []);

  // GPT Save must reuse the exact same save contract as the visible Save/Update button.
  // Only the currently mounted task action bar will claim the request.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleGptSaveRequest = async (event) => {
      const detail = event?.detail || {};
      if (detail.handled || typeof onSaveRef.current !== "function") return;
      detail.handled = true;

      const resultDetail = {
        requestId: detail.requestId || null,
        taskKey: detail.taskKey || null,
        handled: true,
        ok: false,
      };

      if (saveDisabledRef.current || isReadOnlyRef.current) {
        resultDetail.error = isReadOnlyRef.current
          ? "Task data is read-only. Enter Edit mode before saving GPT changes."
          : "Task save is currently disabled.";
        window.dispatchEvent(new CustomEvent("ezefloor:gpt-save-result", { detail: resultDetail }));
        return;
      }

      try {
        await onSaveRef.current();
        resultDetail.ok = true;
      } catch (error) {
        resultDetail.error = error?.message || String(error);
      }
      window.dispatchEvent(new CustomEvent("ezefloor:gpt-save-result", { detail: resultDetail }));
    };

    window.addEventListener("ezefloor:gpt-save-task", handleGptSaveRequest);
    return () => window.removeEventListener("ezefloor:gpt-save-task", handleGptSaveRequest);
  }, []);

  // Determine effective save label
  const effectiveSaveLabel = isDbSource && !isReadOnly ? "Update" : saveLabel;

  const actionButtons = (onAutoFill || onAddData || onClear || onSave || isDbSource || isLoadingFromDb) ? (
    <div
      className="entered-task-actions"
      style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "nowrap", marginLeft: "auto" }}
    >
      {/* Loading indicator while auto-fetching from DB */}
      {isLoadingFromDb && (
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            color: "#6366f1",
            whiteSpace: "nowrap",
            padding: "3px 8px",
            background: "#eef2ff",
            border: "1px solid #c7d2fe",
            borderRadius: "5px",
            minHeight: "28px",
            display: "inline-flex",
            alignItems: "center"
          }}
        >
          ⏳ Loading...
        </span>
      )}

      {/* DB source badge — shown when data comes from database */}
      {isDbSource && !isLoadingFromDb && (
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: isReadOnly ? "#0369a1" : "#b45309",
            whiteSpace: "nowrap",
            padding: "3px 8px",
            background: isReadOnly ? "#e0f2fe" : "#fef3c7",
            border: `1px solid ${isReadOnly ? "#7dd3fc" : "#fcd34d"}`,
            borderRadius: "5px",
            minHeight: "28px",
            display: "inline-flex",
            alignItems: "center"
          }}
          title={isReadOnly ? "Data loaded from database — press Edit to modify" : "Editing DB data — press Update to save changes"}
        >
          {isReadOnly ? "📋 Saved" : "✏️ Editing"}
        </span>
      )}

      {/* Edit button — only visible when DB data is in read-only mode */}
      {isDbSource && isReadOnly && onEdit && !isLoadingFromDb && (
        <button
          className="entered-task-action entered-task-action--edit"
          type="button"
          style={{
            background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
            border: "1px solid #fbbf24",
            color: "#b45309",
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
            onEdit();
          }}
          title="Unlock editing to modify saved data"
        >
          ✏ Edit
        </button>
      )}

      {/* Auto Fill — hidden in read-only mode */}
      {onAutoFill && !isReadOnly && !isLoadingFromDb && (
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

      {/* Add data — hidden in read-only mode */}
      {onAddData && !isReadOnly && !isLoadingFromDb && (
        <button
          className="entered-task-action entered-task-action--add-data"
          type="button"
          style={{
            background: "#f8fafc",
            border: "1px solid #94a3b8",
            color: "#334155",
            fontSize: "10.5px",
            fontWeight: 700,
            padding: "3px 10px",
            minHeight: "28px",
            borderRadius: "5px",
            cursor: addDataDisabled ? "not-allowed" : "pointer",
            opacity: addDataDisabled ? 0.65 : 1,
            whiteSpace: "nowrap"
          }}
          onClick={(e) => {
            e.stopPropagation();
            onAddData();
          }}
          disabled={addDataDisabled}
          title="Add saved data from database"
        >
          {addDataLabel}
        </button>
      )}

      {/* Clear data — hidden in read-only mode */}
      {onClear && !isReadOnly && !isLoadingFromDb && (
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

      {/* Save / Update button — disabled in read-only mode */}
      {onSave && !isLoadingFromDb && (
        <button
          className={`entered-task-action entered-task-action--confirm${isSaved ? " is-saved" : ""}${isSaveError ? " is-error" : ""}`}
          type="button"
          style={{
            background: isSaveError ? "#fef2f2" : isSaved ? "#dcfce7" : isReadOnly ? "#f1f5f9" : "#f0fdf4",
            border: "1px solid",
            borderColor: isSaveError ? "#fca5a5" : isSaved ? "#4ade80" : isReadOnly ? "#cbd5e1" : "#86efac",
            color: isSaveError ? "#b91c1c" : isReadOnly ? "#94a3b8" : "#15803d",
            fontSize: "10.5px",
            fontWeight: 700,
            padding: "3px 10px",
            minHeight: "28px",
            borderRadius: "5px",
            cursor: saveDisabled || isSaving || isReadOnly ? "not-allowed" : "pointer",
            opacity: saveDisabled || isSaving || isReadOnly ? 0.65 : 1,
            whiteSpace: "nowrap"
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!isReadOnly) onSave();
          }}
          disabled={saveDisabled || isSaving || isReadOnly}
          title={isReadOnly ? "Data already saved — press Edit to modify" : "Save"}
        >
          {isSaving ? "Saving..." : isSaved ? "✓ Saved" : isSaveError ? "Retry Save" : isReadOnly ? "✓ Saved" : `💾 ${effectiveSaveLabel}`}
        </button>
      )}
    </div>
  ) : null;

  return (
    <>
      {actionButtons ? (portalHost ? createPortal(actionButtons, portalHost) : actionButtons) : null}
      {onToggle && (
        <button
          className="entered-task-toggle"
          type="button"
          style={{
            width: "20px",
            height: "28px",
            minWidth: "20px",
            border: 0,
            background: "transparent",
            color: "#64748b",
            borderRadius: "3px",
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
    </>
  );
}
