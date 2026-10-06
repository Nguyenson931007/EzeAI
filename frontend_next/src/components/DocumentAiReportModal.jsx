"use client";
import React, { useMemo } from "react";
import { createPortal } from "react-dom";

const ACTIONS = ["ADD", "UPDATE", "DELETE", "KEEP", "UNKNOWN"];
const STATUSES = ["CHANGE", "KEEP", "NO_EVIDENCE", "UNRESOLVED"];
const TASK_LABELS = {
  frame_hardware: "Frame Hardware",
  flooring_decking: "Flooring & Decking",
  insulation: "Insulation",
  eaves_soffit: "Eaves & Soffit",
  cladding: "Cladding",
  lock_up: "Lockup",
  fixout: "Fixout",
  windows: "Windows",
  shelving: "Shelving",
  timber_posts: "Timber Posts",
  power_truss_braces: "Power Truss Braces",
  fow_plumbing: "FOW Plumbing",
  final_fit: "Final Fit",
  hardies_fire_walls: "Hardies Fire Walls",
};

const STATUS_UI = {
  CHANGE: { label: "Changes", fg: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe" },
  KEEP: { label: "Verified", fg: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
  NO_EVIDENCE: { label: "No evidence", fg: "#475569", bg: "#f8fafc", border: "#cbd5e1" },
  UNRESOLVED: { label: "Unresolved", fg: "#92400e", bg: "#fffbeb", border: "#fde68a" },
};

function normalizeStatus(value) {
  const status = String(value || "UNRESOLVED").toUpperCase();
  return STATUSES.includes(status) ? status : "UNRESOLVED";
}

function actionCounts(task) {
  const counts = Object.fromEntries(ACTIONS.map((key) => [key, 0]));
  if (task?.mode === "rows") {
    for (const row of task?.rows || []) {
      const action = String(row?.action || "ADD").toUpperCase();
      counts[action] = (counts[action] || 0) + 1;
    }
  } else {
    counts.UPDATE = (task?.field_updates || []).length;
  }
  return counts;
}

export default function DocumentAiReportModal({ open, result, onClose, onReviewResults, onOpenTask }) {
  const tasks = Array.isArray(result?.task_results) ? result.task_results : [];
  const failed = result?.success === false || Boolean(result?.error);
  const expectedTasks = Number(result?.coverage?.expected_tasks || tasks.length || 0);
  const modelReturnedTasks = Number(result?.coverage?.model_returned_tasks ?? tasks.length);

  const actionTotals = useMemo(() => {
    const next = Object.fromEntries(ACTIONS.map((key) => [key, 0]));
    tasks.forEach((task) => {
      const counts = actionCounts(task);
      ACTIONS.forEach((key) => { next[key] += counts[key] || 0; });
    });
    return next;
  }, [tasks]);

  const statusTotals = useMemo(() => {
    const next = Object.fromEntries(STATUSES.map((key) => [key, 0]));
    tasks.forEach((task) => { next[normalizeStatus(task?.status)] += 1; });
    return next;
  }, [tasks]);

  if (!open || typeof document === "undefined") return null;

  const modal = (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", backdropFilter: "blur(4px)", zIndex: 21000 }} />
      <div role="dialog" aria-modal="true" aria-label="EzeIn Review Report" style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(900px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 16, boxShadow: "0 24px 70px rgba(15,23,42,.28)", zIndex: 21001, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#f3e8ff", color: "#7c3aed", display: "grid", placeItems: "center", fontSize: 20, fontWeight: 900 }}>✦</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 850, color: "#0f172a" }}>EzeIn Review Report</div>
            <div style={{ fontSize: 12, color: failed ? "#b91c1c" : "#64748b", marginTop: 2 }}>{failed ? (result?.error || result?.summary || "EzeIn review failed.") : (result?.summary || "Document review completed.")}</div>
          </div>
          <button onClick={onClose} title="Close" style={{ marginLeft: "auto", border: 0, background: "transparent", color: "#94a3b8", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: "14px 20px", overflowY: "auto" }}>
          <div style={{ border: `1px solid ${failed ? "#fecaca" : "#bbf7d0"}`, background: failed ? "#fef2f2" : "#f0fdf4", color: failed ? "#991b1b" : "#166534", borderRadius: 9, padding: "8px 10px", marginBottom: 12, fontSize: 11.5, fontWeight: 750 }}>
            {failed ? "EzeIn finished with an error. No task data was changed." : `EzeIn reviewed ${tasks.length}/${expectedTasks || tasks.length} selected task(s). ${modelReturnedTasks}/${expectedTasks || tasks.length} were returned directly by the model.`}
          </div>

          {!failed && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 14 }}>
              {STATUSES.map((status) => {
                const ui = STATUS_UI[status];
                return <div key={status} style={{ border: `1px solid ${ui.border}`, background: ui.bg, borderRadius: 10, padding: "9px 10px" }}><div style={{ fontSize: 18, fontWeight: 900, color: ui.fg }}>{statusTotals[status]}</div><div style={{ fontSize: 10.5, fontWeight: 800, color: ui.fg }}>{ui.label}</div></div>;
              })}
            </div>
          )}

          {tasks.length === 0 ? (
            <div style={{ border: "1px dashed #cbd5e1", borderRadius: 10, padding: 18, color: "#64748b", fontSize: 13 }}>No task review results were returned.</div>
          ) : tasks.map((task) => {
            const counts = actionCounts(task);
            const rows = task?.mode === "rows" ? (task?.rows || []) : [];
            const fields = task?.mode === "rows" ? [] : (task?.field_updates || []);
            const status = normalizeStatus(task?.status);
            const statusUi = STATUS_UI[status];
            const unresolved = Array.isArray(task?.unresolved) ? task.unresolved : [];
            return (
              <div key={task.task_key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ padding: "9px 11px", background: "#f8fafc", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ color: "#0f2744", fontSize: 12 }}>{TASK_LABELS[task.task_key] || task.task_key}</b>
                  <span style={{ border: `1px solid ${statusUi.border}`, background: statusUi.bg, color: statusUi.fg, borderRadius: 999, padding: "2px 7px", fontSize: 9.5, fontWeight: 900 }}>{statusUi.label}</span>
                  {Number(task?.confidence) > 0 && <span style={{ color: "#64748b", fontSize: 10 }}>{Math.round(Number(task.confidence) * 100)}%</span>}
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                    {ACTIONS.map((action) => counts[action] > 0 && <span key={action} style={{ fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 999, background: "#ede9fe", color: "#6d28d9" }}>{action} {counts[action]}</span>)}
                    <button type="button" disabled={failed} onClick={() => onOpenTask?.(task.task_key)} style={{ marginLeft: 4, border: "1px solid #c4b5fd", background: "#fff", color: "#6d28d9", borderRadius: 6, padding: "3px 7px", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Open task</button>
                  </div>
                </div>
                <div style={{ padding: "7px 11px", maxHeight: 180, overflowY: "auto" }}>
                  {task?.summary ? <div style={{ fontSize: 11, color: "#475569", marginBottom: rows.length || fields.length || unresolved.length ? 6 : 0 }}>{task.summary}</div> : null}
                  {rows.map((row, idx) => <div key={row.id || row.row_id || idx} style={{ padding: "5px 0", borderTop: idx ? "1px solid #f1f5f9" : 0, fontSize: 11, color: "#334155" }}><b>{String(row.action || "ADD").toUpperCase()}</b>{row.source_page ? ` · page ${row.source_page}` : ""}{Number(row.confidence) > 0 ? ` · ${Math.round(Number(row.confidence) * 100)}%` : ""}{row.reason ? ` · ${row.reason}` : ""}</div>)}
                  {fields.map((item, idx) => <div key={`${item.field}-${idx}`} style={{ padding: "5px 0", borderTop: idx ? "1px solid #f1f5f9" : 0, fontSize: 11, color: "#334155" }}><b>UPDATE</b> · {item.field}: {String(item.old_value ?? "—")} → {String(item.value ?? item.new_value ?? "—")}{item.source_page ? ` · page ${item.source_page}` : ""}</div>)}
                  {unresolved.map((item, idx) => <div key={`unresolved-${idx}`} style={{ padding: "5px 0", color: "#92400e", fontSize: 10.5 }}>⚠ {typeof item === "string" ? item : JSON.stringify(item)}</div>)}
                  {!rows.length && !fields.length && !unresolved.length && !task?.summary ? <div style={{ color: "#94a3b8", fontSize: 10.5 }}>No proposed form changes.</div> : null}
                </div>
              </div>
            );
          })}

          {!failed && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>{ACTIONS.map((action) => actionTotals[action] > 0 && <span key={action} style={{ border: "1px solid #ddd6fe", background: "#faf5ff", color: "#6d28d9", borderRadius: 999, padding: "5px 9px", fontSize: 10, fontWeight: 800 }}>{action}: {actionTotals[action]}</span>)}</div>}
        </div>

        <div style={{ borderTop: "1px solid #e2e8f0", padding: "12px 20px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, color: "#475569", fontWeight: 700, cursor: "pointer" }}>Acknowledge</button>
          {!failed && statusTotals.CHANGE > 0 ? <button onClick={onReviewResults} style={{ padding: "8px 16px", border: 0, background: "#7c3aed", borderRadius: 8, color: "#fff", fontWeight: 800, cursor: "pointer" }}>Review Changes</button> : null}
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
