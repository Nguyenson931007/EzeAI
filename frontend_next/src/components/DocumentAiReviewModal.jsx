"use client";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import { ApiService } from "@/models/api.service";

if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

const card = { border: "1px solid #e2e8f0", borderRadius: "10px", background: "#fff" };

const TASK_LABELS = {
  frame_hardware: "Frame Hardware",
  flooring_decking: "Flooring & Decking",
  hebel_flooring: "Hebel Flooring",
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

export default function DocumentAiReviewModal({ open, onClose, pdfFile, planPages = [], customer, taskContext, onResult }) {
  const [reviewFile, setReviewFile] = useState(null);
  const [reviewFileSource, setReviewFileSource] = useState("current");
  const [pages, setPages] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [pageRules, setPageRules] = useState({});
  const [loadingPages, setLoadingPages] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const taskKeys = useMemo(() => Object.keys(taskContext || {}), [taskContext]);

  const fileStem = useMemo(
    () => String(reviewFile?.name || "").replace(/\.[^/.]+$/, "").toLowerCase(),
    [reviewFile]
  );

  useEffect(() => {
    if (!open) return;
    setReviewFile(pdfFile || null);
    setReviewFileSource("current");
    setPages([]);
    setSelected(new Set());
    setSelectedTasks(new Set(taskKeys));
    setPageRules({});
    setResult(null);
    setError("");
  }, [open, pdfFile, taskKeys]);

  useEffect(() => {
    if (!open || !reviewFile) return;
    let cancelled = false;
    (async () => {
      setLoadingPages(true); setError(""); setResult(null);
      try {
        const buffer = await reviewFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer, wasmUrl: `${window.location.origin}/wasm/` }).promise;
        const next = [];
        const auto = new Set();
        for (let n = 1; n <= pdf.numPages; n += 1) {
          const page = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: 0.32 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width; canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          const planIndex = planPages.findIndex((p) => {
            const samePage = Number(p?.pageNumber) === n;
            const pageFile = String(p?.fileName || "").toLowerCase();
            return samePage && (!fileStem || !pageFile || pageFile === fileStem);
          });
          const inPlan = planIndex >= 0;
          if (inPlan) auto.add(n);
          next.push({
            pageNumber: n,
            thumbnail: canvas.toDataURL("image/jpeg", 0.72),
            w: Math.round(viewport.width),
            h: Math.round(viewport.height),
            inPlan,
            planPageIndex: inPlan ? planIndex : null,
            floorLevel: inPlan ? (planPages[planIndex]?.floor_name || planPages[planIndex]?.floorLevel || planPages[planIndex]?.floor_level || null) : null,
          });
        }
        if (!cancelled) {
          const initialRules = {};
          next.forEach((page) => {
            initialRules[page.pageNumber] = {
              mode: "auto",
              targetPlanIndex: page.inPlan ? page.planPageIndex : null,
            };
          });
          setPages(next);
          setSelected(auto);
          setPageRules(initialRules);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Unable to open PDF.");
      } finally { if (!cancelled) setLoadingPages(false); }
    })();
    return () => { cancelled = true; };
  }, [open, reviewFile, planPages, fileStem]);

  if (!open || typeof document === "undefined") return null;
  const toggle = (n) => setSelected((prev) => { const next = new Set(prev); next.has(n) ? next.delete(n) : next.add(n); return next; });
  const toggleTask = (taskKey) => setSelectedTasks((prev) => {
    const next = new Set(prev);
    next.has(taskKey) ? next.delete(taskKey) : next.add(taskKey);
    return next;
  });
  const allTasksSelected = taskKeys.length > 0 && selectedTasks.size === taskKeys.length;
  const toggleAllTasks = () => setSelectedTasks(allTasksSelected ? new Set() : new Set(taskKeys));

  const openReviewPdf = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !String(file.name || "").toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }
    setReviewFile(file);
    setReviewFileSource("custom");
    setResult(null);
    setError("");
  };

  const useCurrentPdf = () => {
    if (!pdfFile) return;
    setReviewFile(pdfFile);
    setReviewFileSource("current");
    setResult(null);
    setError("");
  };

  const updateRule = (pageNumber, patch) => {
    setPageRules((prev) => ({
      ...prev,
      [pageNumber]: {
        mode: "auto",
        targetPlanIndex: null,
        ...(prev[pageNumber] || {}),
        ...patch,
      },
    }));
  };

  const getResolvedRule = (page) => {
    const rule = pageRules[page.pageNumber] || {
      mode: "auto",
      targetPlanIndex: page.inPlan ? page.planPageIndex : null,
    };

    let usePlanContext = false;
    let targetPlanIndex = rule.targetPlanIndex;

    if (rule.mode === "position") {
      usePlanContext = Number.isInteger(Number(targetPlanIndex)) && planPages[Number(targetPlanIndex)];
    } else if (rule.mode === "text") {
      usePlanContext = false;
    } else {
      usePlanContext = page.inPlan;
      targetPlanIndex = page.inPlan ? page.planPageIndex : null;
    }

    const target = usePlanContext ? planPages[Number(targetPlanIndex)] : null;
    return {
      mode: rule.mode,
      usePlanContext: Boolean(usePlanContext),
      targetPlanIndex: usePlanContext ? Number(targetPlanIndex) : null,
      floorLevel: usePlanContext
        ? (target?.floor_name || target?.floorLevel || target?.floor_level || page.floorLevel || null)
        : null,
    };
  };

  const run = async () => {
    if (!reviewFile || selected.size === 0 || selectedTasks.size === 0) return;
    setRunning(true);
    setError("");
    try {
      const selectedPages = pages
        .filter((page) => selected.has(page.pageNumber))
        .map((page) => {
          const resolved = getResolvedRule(page);
          return {
            page_number: page.pageNumber,
            in_plan: page.inPlan,
            use_plan_context: resolved.usePlanContext,
            evidence_mode: resolved.usePlanContext ? "plan_context" : "text_only",
            plan_page_index: resolved.targetPlanIndex,
            floor_level: resolved.floorLevel,
            text_only: !resolved.usePlanContext,
          };
        });

      const selectedTaskContext = Object.fromEntries(
        Object.entries(taskContext || {}).filter(([taskKey]) => selectedTasks.has(taskKey))
      );

      const res = await ApiService.reviewDocumentWithAI({
        file: reviewFile,
        selectedPages,
        customer,
        tasks: selectedTaskContext,
      });
      setResult(res);
      onResult?.(res);
    } catch (e) {
      const message = e?.message || "Document AI failed.";
      setError(message);
      onResult?.({
        success: false,
        summary: "EzeIn review failed.",
        error: message,
        task_results: [],
      });
    } finally {
      setRunning(false);
    }
  };

  const modal = (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.5)",
          backdropFilter: "blur(4px)",
          zIndex: 20000,
        }}
        onClick={running ? undefined : onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select Pages for EzeIn Review"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: 16,
          padding: "20px 24px",
          zIndex: 20001,
          width: "min(980px, 94vw)",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 60px rgba(0,0,0,0.18)",
          color: "#1e293b",
          boxSizing: "border-box",
        }}
      >
      {/* Same layout as Add Page / Import PDF, with GPT-only controls added. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          borderBottom: "1px solid #e2e8f0",
          paddingBottom: 12,
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              color: "#2563eb",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>📁</span> Select Pages for EzeIn Review
          </h3>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
            Total: <b>{pages.length}</b> page(s) found • Selected:{" "}
            <b style={{ color: "#2563eb" }}>{selected.size}</b>
            {reviewFile?.name ? <> • {reviewFile.name}</> : null}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <label
            style={{
              background: "#0f172a",
              border: "1px solid #0f172a",
              color: "#ffffff",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              cursor: running ? "not-allowed" : "pointer",
              fontWeight: 700,
              opacity: running ? 0.6 : 1,
            }}
          >
            Open PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={openReviewPdf}
              disabled={running}
              style={{ display: "none" }}
            />
          </label>

          {reviewFileSource === "custom" && pdfFile && (
            <button
              type="button"
              onClick={useCurrentPdf}
              disabled={running}
              style={{
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                color: "#334155",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Current PDF
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (selected.size === pages.length) setSelected(new Set());
              else setSelected(new Set(pages.map((p) => p.pageNumber)));
            }}
            disabled={running || loadingPages}
            style={{
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              color: "#2563eb",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 700,
              transition: "all 0.15s",
            }}
          >
            {selected.size === pages.length && pages.length > 0 ? "Deselect All" : "Select All"}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={running}
            style={{
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              color: "#64748b",
              borderRadius: 6,
              width: 32,
              height: 32,
              cursor: "pointer",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div
        style={{
          ...card,
          padding: 12,
          marginBottom: 14,
          background: "#f8fafc",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>Tasks to review</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
              Selected: <b>{selectedTasks.size}</b> / {taskKeys.length}
            </div>
          </div>
          <button
            type="button"
            onClick={toggleAllTasks}
            disabled={running || taskKeys.length === 0}
            style={{
              background: allTasksSelected ? "#dbeafe" : "#ffffff",
              border: "1px solid #93c5fd",
              color: "#1d4ed8",
              borderRadius: 7,
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 800,
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            {allTasksSelected ? "Clear All Tasks" : "All Tasks"}
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {taskKeys.map((taskKey) => {
            const checked = selectedTasks.has(taskKey);
            return (
              <label
                key={`gpt-task-${taskKey}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 9px",
                  borderRadius: 999,
                  border: checked ? "1px solid #60a5fa" : "1px solid #cbd5e1",
                  background: checked ? "#eff6ff" : "#ffffff",
                  color: checked ? "#1d4ed8" : "#475569",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: running ? "not-allowed" : "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={running}
                  onChange={() => toggleTask(taskKey)}
                  style={{ accentColor: "#2563eb" }}
                />
                {TASK_LABELS[taskKey] || taskKey}
              </label>
            );
          })}
        </div>
      </div>

      {loadingPages && (
        <div style={{ padding: "18px 0", color: "#64748b" }}>Loading PDF pages...</div>
      )}

      {!reviewFile && !loadingPages && (
        <div style={{ padding: "18px 0", color: "#64748b" }}>
          Choose <b>Open PDF</b> to select a review file.
        </div>
      )}

      {!loadingPages && reviewFile && (
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            marginBottom: 16,
            paddingRight: 4,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
            maxHeight: "calc(90vh - 160px)",
          }}
        >
          {pages.map((page) => {
            const isChecked = selected.has(page.pageNumber);
            const rule = pageRules[page.pageNumber] || {
              mode: "auto",
              targetPlanIndex: page.inPlan ? page.planPageIndex : null,
            };
            const resolved = getResolvedRule(page);

            return (
              <div
                key={`gpt-review-page-${page.pageNumber}`}
                onClick={() => toggle(page.pageNumber)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: 12,
                  borderRadius: 12,
                  cursor: "pointer",
                  background: isChecked ? "#eff6ff" : "#f8fafc",
                  border: isChecked ? "2px solid #3b82f6" : "1px solid #cbd5e1",
                  boxShadow: isChecked
                    ? "0 4px 16px rgba(0, 0, 0, 0.08)"
                    : "0 2px 8px rgba(0,0,0,0.03)",
                  transition: "all 0.15s ease",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      readOnly
                      style={{
                        accentColor: "#2563eb",
                        width: 18,
                        height: 18,
                        cursor: "pointer",
                        pointerEvents: "none",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: isChecked ? "#2563eb" : "#1e293b",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Page {page.pageNumber}
                    </span>
                  </div>

                  <div
                    onClick={(event) => event.stopPropagation()}
                    style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}
                  >
                    <select
                      aria-label="Evidence rule"
                      value={rule.mode}
                      onChange={(event) => {
                        const mode = event.target.value;
                        const fallbackTarget =
                          page.inPlan
                            ? page.planPageIndex
                            : (planPages.length > 0 ? 0 : null);

                        updateRule(page.pageNumber, {
                          mode,
                          targetPlanIndex:
                            mode === "position"
                              ? (rule.targetPlanIndex ?? fallbackTarget)
                              : rule.targetPlanIndex,
                        });
                      }}
                      style={{
                        width: 94,
                        height: 26,
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        background: "#ffffff",
                        color: "#0f172a",
                        fontSize: 10,
                        padding: "0 5px",
                      }}
                    >
                      <option value="auto">Auto</option>
                      <option value="text">Text only</option>
                      <option value="position">Plan position</option>
                    </select>

                    <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>
                      {page.w} × {page.h} px
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    height: 210,
                    background: "#ffffff",
                    borderRadius: 8,
                    overflow: "hidden",
                    border: isChecked ? "2px solid #3b82f6" : "1px solid #cbd5e1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={page.thumbnail}
                    alt={`Page ${page.pageNumber}`}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />

                  <div
                    style={{
                      position: "absolute",
                      top: 7,
                      left: 7,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 5,
                      pointerEvents: "none",
                    }}
                  >
                    {page.inPlan && (
                      <span
                        style={{
                          borderRadius: 999,
                          padding: "3px 7px",
                          fontSize: 10,
                          fontWeight: 800,
                          background: "#dcfce7",
                          color: "#166534",
                          border: "1px solid #86efac",
                        }}
                      >
                        IN PLAN
                      </span>
                    )}

                    <span
                      style={{
                        borderRadius: 999,
                        padding: "3px 7px",
                        fontSize: 10,
                        fontWeight: 800,
                        background: resolved.usePlanContext ? "#dbeafe" : "#f8fafc",
                        color: resolved.usePlanContext ? "#1d4ed8" : "#64748b",
                        border: `1px solid ${resolved.usePlanContext ? "#93c5fd" : "#cbd5e1"}`,
                      }}
                    >
                      {resolved.usePlanContext ? "PLAN CONTEXT" : "TEXT ONLY"}
                    </span>
                  </div>
                </div>

                {isChecked && rule.mode === "position" && (
                  <div
                    onClick={(event) => event.stopPropagation()}
                    style={{ marginTop: 8 }}
                  >
                    <select
                      aria-label="Match to plan page"
                      value={rule.targetPlanIndex ?? ""}
                      onChange={(event) =>
                        updateRule(page.pageNumber, {
                          targetPlanIndex:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                      style={{
                        width: "100%",
                        height: 30,
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        background: "#ffffff",
                        color: "#0f172a",
                        fontSize: 11,
                        padding: "0 7px",
                      }}
                    >
                      <option value="">Select plan page...</option>
                      {planPages.map((planPage, planIndex) => {
                        const level =
                          planPage?.floor_name ||
                          planPage?.floorLevel ||
                          planPage?.floor_level ||
                          "";
                        const pageNo =
                          planPage?.pageNumber ??
                          planPage?.page_number ??
                          planIndex + 1;

                        return (
                          <option key={`plan-context-${planIndex}`} value={planIndex}>
                            Page {pageNo}{level ? ` · ${level}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {result && (
        <div
          style={{
            borderTop: "1px solid #e2e8f0",
            paddingTop: 10,
            marginTop: 2,
            maxHeight: 150,
            overflowY: "auto",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>EzeIn Report</div>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 8 }}>
            {result.summary || "Review completed."}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(result.task_results || []).map((r) => (
              <span
                key={r.task_key}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 999,
                  padding: "4px 8px",
                  fontSize: 10,
                  background: "#f8fafc",
                }}
              >
                <b>{r.task_key}</b>
                {" · "}
                {r.mode === "rows"
                  ? `${(r.rows || []).length} row(s)`
                  : `${(r.field_updates || []).length} update(s)`}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 14,
          marginTop: 2,
          borderTop: "1px solid #e2e8f0",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {error ? (
            <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>
          ) : (
            <span style={{ fontSize: 13, color: "#64748b" }}>
              Ready to review: <b>{selected.size}</b> page(s) • <b>{selectedTasks.size}</b> task(s)
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            disabled={running}
            style={{
              padding: "8px 20px",
              background: "#f1f5f9",
              color: "#475569",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Cancel
          </button>

          <button
            onClick={run}
            disabled={running || !reviewFile || selected.size === 0 || selectedTasks.size === 0}
            style={{
              padding: "8px 20px",
              background:
                running || !reviewFile || selected.size === 0 || selectedTasks.size === 0
                  ? "#94a3b8"
                  : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor:
                running || !reviewFile || selected.size === 0 || selectedTasks.size === 0
                  ? "not-allowed"
                  : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {running ? "Reviewing..." : `Run EzeIn Review (${selected.size} page${selected.size === 1 ? "" : "s"}, ${selectedTasks.size} task${selectedTasks.size === 1 ? "" : "s"})`}
          </button>
        </div>
      </div>
      </div>
    </>
  );

  // Render at document.body so transformed/scrolling task panes cannot become
  // the containing block for position:fixed. This matches the Import PDF modal
  // behaviour and guarantees the GPT dialog stays above the whole application.
  return createPortal(modal, document.body);
}
