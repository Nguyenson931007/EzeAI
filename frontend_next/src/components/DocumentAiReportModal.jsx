"use client";
import React, { useMemo } from "react";
import { createPortal } from "react-dom";

const ACTIONS = ["ADD", "UPDATE", "DELETE", "KEEP", "UNKNOWN"];

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
  const totals = useMemo(() => {
    const next = Object.fromEntries(ACTIONS.map((key) => [key, 0]));
    tasks.forEach((task) => {
      const counts = actionCounts(task);
      ACTIONS.forEach((key) => { next[key] += counts[key] || 0; });
    });
    return next;
  }, [tasks]);

  if (!open || typeof document === "undefined") return null;

  const modal = (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", backdropFilter: "blur(4px)", zIndex: 21000 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="GPT Review Report"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: "min(820px, 92vw)", maxHeight: "86vh", display: "flex", flexDirection: "column",
          background: "#fff", border: "1px solid #cbd5e1", borderRadius: 16,
          boxShadow: "0 24px 70px rgba(15,23,42,.28)", zIndex: 21001, overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#f3e8ff", color: "#7c3aed", display: "grid", placeItems: "center", fontSize: 20, fontWeight: 900 }}>✦</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 850, color: "#0f172a" }}>GPT Review Report</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{result?.summary || "Document review completed."}</div>
          </div>
          <button onClick={onClose} title="Close" style={{ marginLeft: "auto", border: 0, background: "transparent", color: "#94a3b8", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: "14px 20px", overflowY: "auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {ACTIONS.map((action) => totals[action] > 0 && (
              <span key={action} style={{ border: "1px solid #ddd6fe", background: "#faf5ff", color: "#6d28d9", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 800 }}>
                {action}: {totals[action]}
              </span>
            ))}
            <span style={{ border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 800 }}>
              Tasks: {tasks.length}
            </span>
          </div>

          {tasks.length === 0 ? (
            <div style={{ border: "1px dashed #cbd5e1", borderRadius: 10, padding: 18, color: "#64748b", fontSize: 13 }}>No confident task changes were returned.</div>
          ) : tasks.map((task) => {
            const counts = actionCounts(task);
            const rows = task?.mode === "rows" ? (task?.rows || []) : [];
            const fields = task?.mode === "rows" ? [] : (task?.field_updates || []);
            return (
              <div key={task.task_key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ padding: "9px 11px", background: "#f8fafc", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ color: "#0f2744", fontSize: 12 }}>{task.task_key}</b>
                  <span style={{ color: "#64748b", fontSize: 11 }}>{task.mode === "rows" ? `${rows.length} proposal(s)` : `${fields.length} field update(s)`}</span>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                    {ACTIONS.map((action) => counts[action] > 0 && <span key={action} style={{ fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 999, background: "#ede9fe", color: "#6d28d9" }}>{action} {counts[action]}</span>)}
                    <button
                      type="button"
                      onClick={() => onOpenTask?.(task.task_key)}
                      style={{ marginLeft: 4, border: "1px solid #c4b5fd", background: "#fff", color: "#6d28d9", borderRadius: 6, padding: "3px 7px", fontSize: 10, fontWeight: 800, cursor: "pointer" }}
                    >
                      Open task
                    </button>
                  </div>
                </div>
                <div style={{ padding: "7px 11px", maxHeight: 150, overflowY: "auto" }}>
                  {rows.map((row, idx) => (
                    <div key={row.id || row.row_id || idx} style={{ padding: "5px 0", borderTop: idx ? "1px solid #f1f5f9" : 0, fontSize: 11, color: "#334155" }}>
                      <b>{String(row.action || "ADD").toUpperCase()}</b>
                      {row.source_page ? ` · page ${row.source_page}` : ""}
                      {Number(row.confidence) > 0 ? ` · ${Math.round(Number(row.confidence) * 100)}%` : ""}
                      {row.reason ? ` · ${row.reason}` : ""}
                    </div>
                  ))}
                  {fields.map((item, idx) => (
                    <div key={`${item.field}-${idx}`} style={{ padding: "5px 0", borderTop: idx ? "1px solid #f1f5f9" : 0, fontSize: 11, color: "#334155" }}>
                      <b>UPDATE</b> · {item.field}: {String(item.old_value ?? "—")} → {String(item.new_value ?? "—")}
                      {item.source_page ? ` · page ${item.source_page}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: "1px solid #e2e8f0", padding: "12px 20px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, color: "#475569", fontWeight: 700, cursor: "pointer" }}>Close</button>
          <button onClick={onReviewResults} style={{ padding: "8px 16px", border: 0, background: "#7c3aed", borderRadius: 8, color: "#fff", fontWeight: 800, cursor: "pointer" }}>Review Results</button>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
