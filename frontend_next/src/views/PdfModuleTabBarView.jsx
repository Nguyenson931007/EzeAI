"use client";
import React from "react";
import { useDialog } from "@/components/DialogContext";
import { useAppModel } from "@/models/app.context";
import { exportPdfToolsDocument } from "@/utils/pdfExportUtils";

export const DEFAULT_TASK_STEPS = [
  { id: "frame_hardware", label: "Frame", name: "Frame Hardware", icon: "", color: "#2563eb" },
  { id: "flooring_decking", label: "Floor", name: "Flooring & Decking", icon: "", color: "#0284c7" },
  { id: "insulation", label: "Insu", name: "Insulation", icon: "", color: "#059669" },
  { id: "eaves_soffit", label: "Eaves", name: "Eaves Soffit", icon: "", color: "#d97706", aliases: ["eaves"] },
  { id: "cladding", label: "Cladding", name: "Cladding", icon: "", color: "#ea580c" },
  { id: "lock_up", label: "Lockup", name: "Lockup", icon: "", color: "#4f46e5" },
  { id: "power_truss_braces", label: "Truss", name: "Power Truss Braces", icon: "", color: "#db2777" },
  { id: "fow_plumbing", label: "Plumbing", name: "FOW Plumbing", icon: "", color: "#0891b2" },
  { id: "fixout", label: "Fixout", name: "Fixout", icon: "", color: "#0d9488" },
  { id: "hardies_fire_walls", label: "Fire Wall", name: "Hardies Fire Walls", icon: "", color: "#dc2626" },
  { id: "shelving", label: "Shelving", name: "Shelving", icon: "", color: "#7c3aed" },
  { id: "timber_posts", label: "Beams", name: "Beams & Posts", icon: "", color: "#9333ea" },
  { id: "final_fit", label: "Final", name: "Final Fit", icon: "", color: "#ca8a04" }
];

export const isCategoryMatch = (pageCat, stepId) => {
  if (!pageCat || !stepId) return false;
  const p = String(pageCat).toLowerCase().trim();
  const s = String(stepId).toLowerCase().trim();
  if (p === s) return true;
  if ((p === "eaves" || p === "eaves_soffit") && (s === "eaves" || s === "eaves_soffit")) return true;
  if ((p === "lockup" || p === "lock_up") && (s === "lockup" || s === "lock_up")) return true;
  if ((p === "frame" || p === "frame_hardware") && (s === "frame" || s === "frame_hardware")) return true;
  if ((p === "floor" || p === "flooring_decking") && (s === "floor" || s === "flooring_decking")) return true;
  if ((p === "insu" || p === "insulation") && (s === "insu" || s === "insulation")) return true;
  if ((p === "truss" || p === "power_truss_braces") && (s === "truss" || s === "power_truss_braces")) return true;
  if ((p === "plumbing" || p === "fow_plumbing") && (s === "plumbing" || s === "fow_plumbing")) return true;
  if ((p === "firewall" || p === "hardies_fire_walls") && (s === "firewall" || s === "hardies_fire_walls")) return true;
  return false;
};

export default function PdfModuleTabBarView({
  pages = [],
  setPages,
  currentPage = 0,
  onPageClick,
  activeCategory = "cladding",
  setActiveCategory,
  onAddPagesClick,
  onOpenImportSelector,
  onDeletePage,
}) {
  const { showConfirm } = useDialog();

  // Đọc danh sách module/step được cấu hình từ TaskList API (nguồn chân lý của Job)
  const activeTaskListStepIds = React.useMemo(() => {
    try {
      if (typeof window === "undefined") return null;
      const stored = sessionStorage.getItem("selectedModules") || localStorage.getItem("selectedModules");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(m => typeof m === "string" ? m : m.module_id).filter(Boolean);
        }
      }
      const pendingStr = sessionStorage.getItem("pendingEmsJob") || localStorage.getItem("pendingEmsJob");
      if (pendingStr) {
        const parsed = JSON.parse(pendingStr);
        const raw = parsed?.task_modules || parsed?.selected_modules;
        if (Array.isArray(raw) && raw.length > 0) {
          return raw.map(m => typeof m === "string" ? m : m.module_id).filter(Boolean);
        }
      }
    } catch (_) {}
    return null;
  }, []);

  const availableTaskSteps = React.useMemo(() => {
    if (activeTaskListStepIds && activeTaskListStepIds.length > 0) {
      const filtered = DEFAULT_TASK_STEPS.filter(s =>
        activeTaskListStepIds.some(m => isCategoryMatch(m, s.id))
      );
      if (filtered.length > 0) return filtered;
    }
    return DEFAULT_TASK_STEPS;
  }, [activeTaskListStepIds]);

  // Helper to get pages for a given step
  const getPagesForStep = (stepId) => {
    return pages
      .map((p, originalIndex) => ({ ...p, originalIndex }))
      .filter((p) => isCategoryMatch(p?.category, stepId));
  };

  // Determine which steps should be shown in the switcher bar
  // Only show steps that have pages added to them
  const visibleSteps = availableTaskSteps.filter(step => {
    return pages.some(p => isCategoryMatch(p?.category, step.id));
  });

  // Automatically select the first step with pages if activeCategory has no pages
  React.useEffect(() => {
    if (visibleSteps.length > 0 && !visibleSteps.some(s => isCategoryMatch(activeCategory, s.id))) {
      if (setActiveCategory) setActiveCategory(visibleSteps[0].id);
    }
  }, [pages, visibleSteps, activeCategory, setActiveCategory]);

  const currentModulePages = getPagesForStep(activeCategory);
  const activeStepObj = availableTaskSteps.find(s => isCategoryMatch(activeCategory, s.id)) || (visibleSteps[0] || availableTaskSteps[0]);

  // Move page between any of the steps
  const handleMovePageCategory = (originalIndex, targetCat) => {
    if (!setPages) return;
    setPages((prev) =>
      prev.map((p, idx) => (idx === originalIndex ? { ...p, category: targetCat } : p))
    );
  };

  const {
    annotationsByPage = {},
    currentProjectName = "Project",
    realScale = 20
  } = useAppModel();

  const [isExporting, setIsExporting] = React.useState(false);
  const [showExportMenu, setShowExportMenu] = React.useState(false);

  const handleExport = async (mode = "step") => {
    try {
      setIsExporting(true);
      setShowExportMenu(false);
      await exportPdfToolsDocument({
        pages,
        currentPage,
        annotationsByPage,
        activeCategory,
        projectName: currentProjectName || "EzeFloor_Project",
        realScale: (typeof realScale === "number" && realScale > 0) ? realScale : 20,
        mode
      });
    } catch (err) {
      console.error("[TabBar Export PDF Error]", err);
      alert("Failed to export PDF: " + (err?.message || "Unknown error"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="pdf-module-tab-bar">
      {/* Left: Step Group Switcher with dynamic badges */}
      <div className="pdf-module-group-switcher" style={{ maxWidth: '65vw', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {visibleSteps.map((step) => {
          const isActive = isCategoryMatch(activeCategory, step.id);
          const stepPages = getPagesForStep(step.id);
          const activeColor = step.id === "cladding" ? "#2563eb" : ((step.id === "eaves" || step.id === "eaves_soffit") ? "#d97706" : (step.color || "#4f46e5"));

          return (
            <button
              key={step.id}
              type="button"
              className={`pdf-module-switch-btn ${step.id} ${isActive ? "active" : ""}`}
              style={isActive ? {
                background: activeColor,
                color: "#ffffff",
                boxShadow: `0 2px 6px ${activeColor}55`
              } : {}}
              onClick={() => {
                if (setActiveCategory) setActiveCategory(step.id);
                const firstMatching = pages.findIndex(p => isCategoryMatch(p?.category, step.id));
                if (firstMatching >= 0 && firstMatching !== currentPage) {
                  onPageClick && onPageClick(firstMatching);
                }
              }}
              title={`${step.name || step.label} Pages (${stepPages.length})`}
            >
              <span>{step.label}</span>
              <span className="badge" style={isActive ? { background: "rgba(255,255,255,0.3)", color: "#fff" } : {}}>
                {stepPages.length}
              </span>

              {/* Quick delete / close step button */}
              <span
                className="step-close-x"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (await showConfirm(`Delete all pages in ${step.name || step.label}?`)) {
                    if (setPages) {
                      setPages((prev) => prev.filter((p) => !isCategoryMatch(p?.category, step.id)));
                    }
                  }
                }}
                title={`Delete ${step.label} step`}
                style={{
                  marginLeft: "4px",
                  fontSize: "11px",
                  lineHeight: 1,
                  padding: "2px 4px",
                  borderRadius: "4px",
                  opacity: 0.7,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "rgba(0,0,0,0.2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; e.currentTarget.style.background = "transparent"; }}
              >
                ✕
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ width: "1px", height: "20px", background: "#e2e8f0", margin: "0 2px" }} />

      {/* Middle: PDF Pages belonging to active module */}
      <div className="pdf-pages-scroll-row">
        {currentModulePages.length === 0 ? (
          <div style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic", padding: "0 8px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>No pages in {activeStepObj.label || activeStepObj.name}.</span>
          </div>
        ) : (
          currentModulePages.map((p) => {
            const isActive = p.originalIndex === currentPage;
            const pageNum = p.pageNumber || (p.originalIndex !== undefined ? p.originalIndex + 1 : 1);
            const pageTitle = p.customName || (p.name && p.name !== p.fileName && !p.name.startsWith("architectural-drawing") ? p.name : `Page ${pageNum}`);

            return (
              <div
                key={p.originalIndex}
                className={`pdf-page-tab ${isActive ? "active" : ""}`}
                onClick={() => onPageClick && onPageClick(p.originalIndex)}
                title={`${p.fileName ? `${p.fileName} - ` : ""}${pageTitle} (${p.w || 0} × ${p.h || 0} px)`}
              >
                <span style={{ fontSize: "12px", opacity: 0.85 }}>📄</span>
                <span>{pageTitle}</span>

                {/* Move to another step dropdown */}
                <select
                  value={p.category || activeCategory}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleMovePageCategory(p.originalIndex, e.target.value);
                  }}
                  style={{
                    background: isActive ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.06)",
                    color: isActive ? "#ffffff" : "#475569",
                    border: "none",
                    borderRadius: "4px",
                    padding: "1px 4px",
                    fontSize: "10px",
                    fontWeight: 700,
                    cursor: "pointer",
                    outline: "none"
                  }}
                  title="Move page to another step"
                >
                  {availableTaskSteps.map(s => (
                    <option key={s.id} value={s.id} style={{ color: '#1e293b', background: '#ffffff' }}>
                      {s.label}
                    </option>
                  ))}
                </select>

                {/* Delete Page button */}
                {pages.length > 1 && (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await showConfirm(`Delete ${pageTitle}?`)) {
                        if (onDeletePage) onDeletePage(p.originalIndex);
                      }
                    }}
                    title="Delete this page"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: isActive ? "#ffffff" : "#94a3b8",
                      fontSize: "12px",
                      cursor: "pointer",
                      padding: "0 2px",
                      lineHeight: 1
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })
        )}

        {/* Add single file directly into active module */}
        <label
          title={`Add PDF / Image to ${activeCategory === "cladding" ? "Cladding" : "Eaves"}`}
          style={{ display: "flex", alignItems: "center", cursor: "pointer", margin: 0 }}
        >
          <input
            type="file"
            accept=".pdf,image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (onAddPagesClick) onAddPagesClick(file, activeCategory);
              e.target.value = "";
            }}
          />
          <div
            style={{
              height: "26px",
              padding: "0 8px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              fontWeight: 600,
              color: "#3b82f6",
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px dashed #93c5fd",
              borderRadius: "6px",
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            <span>+ Add Page</span>
          </div>
        </label>
      </div>

      {/* Right: Actions (Export PDF & Assign PDF Pages) */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, position: "relative" }}>
        {/* Export PDF Menu Trigger */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowExportMenu(prev => !prev)}
            disabled={isExporting}
            title="Export markups & drawings to PDF"
            style={{
              height: "26px",
              padding: "0 10px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "11px",
              fontWeight: 700,
              color: "#059669",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              borderRadius: "6px",
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}
          >
            <span>📥</span>
            <span>{isExporting ? "Exporting..." : "Export PDF ▾"}</span>
          </button>

          {showExportMenu && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                zIndex: 3000,
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
                padding: "6px",
                minWidth: "200px",
                display: "flex",
                flexDirection: "column",
                gap: "3px"
              }}
            >
              <button
                type="button"
                onClick={() => handleExport("current")}
                style={{
                  width: "100%", textAlign: "left", padding: "6px 10px", border: "none",
                  background: "#f8fafc", borderRadius: "5px", cursor: "pointer", fontSize: "11px",
                  fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px"
                }}
              >
                <span>📄</span> Export Current Page
              </button>
              <button
                type="button"
                onClick={() => handleExport("step")}
                style={{
                  width: "100%", textAlign: "left", padding: "6px 10px", border: "none",
                  background: "#f8fafc", borderRadius: "5px", cursor: "pointer", fontSize: "11px",
                  fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px"
                }}
              >
                <span>📑</span> Export All {activeCategory ? (activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)) : "Task"} Pages
              </button>
              <button
                type="button"
                onClick={() => handleExport("all")}
                style={{
                  width: "100%", textAlign: "left", padding: "6px 10px", border: "none",
                  background: "#f8fafc", borderRadius: "5px", cursor: "pointer", fontSize: "11px",
                  fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px"
                }}
              >
                <span>📚</span> Export All Project Pages
              </button>
            </div>
          )}
        </div>

        {/* Import / Assign PDF Pages Modal Trigger */}
        <button
          type="button"
          onClick={() => onOpenImportSelector && onOpenImportSelector()}
          title="Import PDF & Assign Pages to Cladding / Eaves"
          style={{
            height: "26px",
            padding: "0 10px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "11px",
            fontWeight: 700,
            color: "#1d4ed8",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "6px",
            cursor: "pointer",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
          }}
        >
          <span>📑</span>
          <span>Assign PDF Pages</span>
        </button>
      </div>
    </div>
  );
}
