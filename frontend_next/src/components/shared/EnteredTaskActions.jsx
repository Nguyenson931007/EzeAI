import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiService } from "@/models/api.service";
import {
  getTaskDraftStatus,
  markTaskDirty,
  markTaskSaved,
  TASK_DRAFT_RESET_EVENT,
  TASK_DRAFT_STATUS_EVENT,
} from "@/utils/taskDraftRegistry";

const DATABASE_TASKS = new Set([
  "frame_hardware", "flooring_decking", "insulation",
  "eaves_soffit", "cladding", "hardies_fire_walls", "lockup", "lock_up",
  "fixout", "window", "windows", "shelving", "timber_posts", "fow_plumbing",
  "power_truss_braces",
]);

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
  autoFillLabel = "Fill",
  addDataLabel = "Add data",
  saveLabel = "Save",
  // ── New: Read-only / Edit mode for DB-loaded data ──
  dataSource = null,      // "db" | "local" | null
  isReadOnly = false,     // true when data loaded from DB is in view-only mode
  onEdit = null,          // callback to switch from read-only to edit mode
  isLoadingFromDb = false // true while auto-loading data from DB
}) {
  const [portalHost, setPortalHost] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const onSaveRef = useRef(onSave);
  const onAutoFillRef = useRef(onAutoFill);
  const saveDisabledRef = useRef(saveDisabled);
  const saveStatusRef = useRef(saveStatus);
  const isReadOnlyRef = useRef(isReadOnly);
  const onEditRef = useRef(onEdit);
  const dirtyRef = useRef(false);
  const [draftStatus, setDraftStatus] = useState("saved");
  const wasLoadingFromDbRef = useRef(isLoadingFromDb);
  const didRunPlanFallbackRef = useRef(false);
  onSaveRef.current = onSave;
  onAutoFillRef.current = onAutoFill;
  saveDisabledRef.current = saveDisabled;
  saveStatusRef.current = saveStatus;
  isReadOnlyRef.current = isReadOnly;
  onEditRef.current = onEdit;
  const isSaving = saveStatus === "saving";
  const isSaved = saveStatus === "success";
  const isSaveError = saveStatus === "error";
  const isDbSource = dataSource === "db";

  const getActiveTaskKeys = () => {
    if (typeof window === "undefined") return [];
    const context = window.__ezefloorActiveTaskContext || {};
    return Array.from(new Set([context.statusTaskKey, context.taskKey].filter(Boolean)));
  };

  const readDraftStatus = () => {
    const keys = getActiveTaskKeys();
    return keys.some((key) => getTaskDraftStatus(key) === "dirty") ? "dirty" : "saved";
  };

  const isEditing = draftStatus === "dirty";
  // "Saved" is the read-only state of the task draft, including a valid
  // empty task. Database presence only controls where the data came from.
  const showSavedState = !isEditing;

  const markDirty = () => {
    dirtyRef.current = true;
    setDraftStatus("dirty");
    getActiveTaskKeys().forEach((key) => markTaskDirty(key, "task-edit"));
  };

  const clearDirty = () => {
    dirtyRef.current = false;
    setDraftStatus("saved");
  };

  const markSaved = () => {
    clearDirty();
    getActiveTaskKeys().forEach((key) => markTaskSaved(key, "save"));
  };

  const deleteTaskData = async () => {
    const confirmed = typeof window !== "undefined" && window.appDialog?.showConfirm
      ? await window.appDialog.showConfirm("Delete this task's saved data from the database?")
      : window.confirm("Delete this task's saved data from the database?");
    if (!confirmed) return;

    const context = typeof window !== "undefined" ? window.__ezefloorActiveTaskContext : null;
    const taskKey = String(context?.taskKey || "").trim().toLowerCase();
    try {
      setIsDeleting(true);
      if (DATABASE_TASKS.has(taskKey)) {
        if (!context?.jobId) throw new Error("No active job was found for this task.");
        await ApiService.deleteTaskData(taskKey, context.jobId);
      }
      await onClear?.();
      markSaved();
    } catch (error) {
      const message = error?.message || "Could not delete this task's saved data.";
      if (typeof window !== "undefined" && window.appDialog?.showAlert) {
        await window.appDialog.showAlert(message);
      } else if (typeof window !== "undefined") {
        window.alert(message);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const commitVisibleInlineEdits = () => {
    if (typeof document === "undefined") return 0;

    const editingRows = Array.from(document.querySelectorAll(
      "tbody tr[data-editing-row-id], tbody tr[data-editing-area-row-id]"
    ));
    let committedCount = 0;

    editingRows.forEach((row) => {
      const saveButton = Array.from(row.querySelectorAll("button")).find((button) => {
        const title = String(button.getAttribute("title") || "").trim().toLowerCase();
        const ariaLabel = String(button.getAttribute("aria-label") || "").trim().toLowerCase();
        const text = String(button.textContent || "").trim();
        return title === "save" || title === "save row" ||
          ariaLabel === "save" || ariaLabel === "save row" ||
          text === "✓" || text === "✔";
      });

      if (saveButton && !saveButton.disabled) {
        saveButton.click();
        committedCount += 1;
      }
    });

    return committedCount;
  };

  const saveLatestTaskState = async () => {
    if (saveDisabledRef.current || !dirtyRef.current || typeof onSaveRef.current !== "function") return;

    // A number of task tables keep the value currently being edited in a
    // row-level draft and commit that draft when focus leaves the editor.
    // Calling Save in the same click used to run the API handler with the
    // previous render's rows, so the UI showed "Saved" but a reload restored
    // the old database values. Commit the active row, then give React a render
    // turn and invoke the latest save callback (not the stale click callback).
    if (typeof document !== "undefined") {
      // Commit the row draft explicitly. The global Save action is rendered in
      // a portal outside the task table, so relying on blur/outside-click alone
      // is not reliable for every task editor.
      commitVisibleInlineEdits();
      const activeElement = document.activeElement;
      if (activeElement && typeof activeElement.blur === "function") activeElement.blur();
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ezefloor:commit-pending-task-edits"));
      // React may need more than one render boundary when the row state lives
      // in the task and the persisted entries live in its parent.
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    }

    const result = await onSaveRef.current?.();
    if (typeof window !== "undefined") {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    }
    if (saveStatusRef.current === "error") {
      throw new Error("The task was not saved. Please fix the error and try again.");
    }
    // Some task save handlers intentionally no-op for an empty table. That is
    // still a valid saved/read-only draft and must not surface as an error.
    if (dirtyRef.current) markSaved();
    return result;
  };

  useEffect(() => {
    if (saveStatus === "success") markSaved();
  }, [saveStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refresh = () => {
      const status = readDraftStatus();
      dirtyRef.current = status === "dirty";
      setDraftStatus(status);
    };
    refresh();
    window.addEventListener(TASK_DRAFT_STATUS_EVENT, refresh);
    window.addEventListener(TASK_DRAFT_RESET_EVENT, refresh);
    return () => {
      window.removeEventListener(TASK_DRAFT_STATUS_EVENT, refresh);
      window.removeEventListener(TASK_DRAFT_RESET_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (isLoadingFromDb) {
      wasLoadingFromDbRef.current = true;
      return;
    }
    if (
      wasLoadingFromDbRef.current &&
      !didRunPlanFallbackRef.current &&
      dataSource !== "db" &&
      !window.__ezefloorActiveTaskDraft?.skipPlanFallback &&
      typeof onAutoFillRef.current === "function"
    ) {
      didRunPlanFallbackRef.current = true;
      onAutoFillRef.current();
      // Auto fallback can legitimately find no plan rows. Wait for the task
      // state to settle and only enter Editing when there is actually data to
      // save; an empty task must not appear dirty on first open.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const taskPanel = document.querySelector(".task-panel");
          const hasEnteredRows = Array.from(taskPanel?.querySelectorAll?.("tbody tr") || []).some((row) => (
            !row.querySelector("td[colspan]") && row.querySelectorAll("td").length > 1
          ));
          if (hasEnteredRows && !saveDisabledRef.current) markDirty();
          else markSaved();
        });
      });
    }
    wasLoadingFromDbRef.current = false;
  }, [isLoadingFromDb, dataSource]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const guard = {
      get dirty() { return dirtyRef.current; },
      save: saveLatestTaskState,
      discard: clearDirty,
    };
    window.__ezefloorActiveTaskDraft = guard;

    const markFromTaskControl = (event) => {
      if (!event.target?.closest?.(".task-panel")) return;
      if (isReadOnlyRef.current) onEditRef.current?.();
      markDirty();
    };
    const beforeUnload = (event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const markFromStagedPopupEdit = () => {
      markDirty();
    };
    document.addEventListener("input", markFromTaskControl, true);
    document.addEventListener("change", markFromTaskControl, true);
    window.addEventListener("ezefloor:task-cache-staged", markFromStagedPopupEdit);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      if (window.__ezefloorActiveTaskDraft === guard) delete window.__ezefloorActiveTaskDraft;
      document.removeEventListener("input", markFromTaskControl, true);
      document.removeEventListener("change", markFromTaskControl, true);
      window.removeEventListener("ezefloor:task-cache-staged", markFromStagedPopupEdit);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

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

      if (saveDisabledRef.current || !dirtyRef.current) {
        resultDetail.error = saveDisabledRef.current
          ? "Task save is currently disabled."
          : "There are no task changes to save.";
        window.dispatchEvent(new CustomEvent("ezefloor:gpt-save-result", { detail: resultDetail }));
        return;
      }

      try {
        await saveLatestTaskState();
        resultDetail.ok = true;
      } catch (error) {
        resultDetail.error = error?.message || String(error);
      }
      window.dispatchEvent(new CustomEvent("ezefloor:gpt-save-result", { detail: resultDetail }));
    };

    window.addEventListener("ezefloor:gpt-save-task", handleGptSaveRequest);
    return () => window.removeEventListener("ezefloor:gpt-save-task", handleGptSaveRequest);
  }, []);

  // Saving is always explicit. "Saved" is a status, never a second disabled
  // Save button beside the status badge.
  const effectiveSaveLabel = saveLabel;

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
            alignItems: "center",
          }}
        >
          ⏳ Loading...
        </span>
      )}

      {/* DB source badge — shown when data comes from database */}
      {!isLoadingFromDb && showSavedState && (
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: showSavedState ? "#0369a1" : "#b45309",
            whiteSpace: "nowrap",
            padding: "3px 8px",
            background: showSavedState ? "#e0f2fe" : "#fef3c7",
            border: `1px solid ${showSavedState ? "#7dd3fc" : "#fcd34d"}`,
            borderRadius: "5px",
            minHeight: "28px",
            display: "inline-flex",
            alignItems: "center",
            order: showSavedState ? 2 : 0,
          }}
          title={showSavedState ? "Saved data — press Edit to modify" : "Changes are local until you press Save"}
        >
          {showSavedState ? "✓ Saved" : "✏️ Editing"}
        </span>
      )}

      {/* Edit button — only visible when DB data is in read-only mode */}
      {!isEditing && !isLoadingFromDb && (onEdit || onAutoFill || onClear || onSave) && (
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
            whiteSpace: "nowrap",
            order: 1,
          }}
          onClick={(e) => {
            e.stopPropagation();
            markDirty();
            onEdit?.();
          }}
          title="Unlock editing to modify saved data"
        >
          ✏ Edit
        </button>
      )}

      {/* Auto Fill — hidden in read-only mode */}
      {onAutoFill && isEditing && !isLoadingFromDb && (
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
            markDirty();
            onAutoFill();
          }}
          disabled={autoFillDisabled}
          title="Fill from plan"
        >
          ⚡ {autoFillLabel}
        </button>
      )}

      {/* Add data — hidden in read-only mode */}
      {onAddData && isEditing && !isLoadingFromDb && (
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
            markDirty();
            onAddData();
          }}
          disabled={addDataDisabled}
          title="Add saved data from database"
        >
          {addDataLabel}
        </button>
      )}

      {/* Clear data — hidden in read-only mode */}
      {onClear && isEditing && !isLoadingFromDb && (
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
            void deleteTaskData();
          }}
          disabled={isDeleting}
          title="Delete task data from the database"
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      )}

      {/* Save / Update button — disabled in read-only mode */}
      {onSave && !isLoadingFromDb && isEditing && (
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
            void saveLatestTaskState().catch(async (error) => {
              const message = error?.message || "Could not save this task.";
              if (window.appDialog?.showAlert) await window.appDialog.showAlert(message);
              else window.alert(message);
            });
          }}
          disabled={saveDisabled || isSaving}
          title="Save"
        >
          {isSaving ? "Saving..." : isSaveError ? "Retry Save" : `💾 ${effectiveSaveLabel}`}
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
