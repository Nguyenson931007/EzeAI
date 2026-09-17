"use client";
import React from "react";
import { useDialog } from "@/components/DialogContext";
import { useAppModel } from "@/models/app.context";

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
  const { setAnnotationsByPage } = useAppModel() || {};
  const [contextMenu, setContextMenu] = React.useState(null);

  React.useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    window.addEventListener("click", handleCloseMenu);
    return () => window.removeEventListener("click", handleCloseMenu);
  }, []);

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

  // Duplicate page on right-click
  const handleDuplicatePage = (originalIndex) => {
    if (!setPages || !pages || originalIndex < 0 || originalIndex >= pages.length) return;
    const pageToDup = pages[originalIndex];
    const newId = `pdf_pg_${Date.now()}_dup_${Math.random().toString(36).substring(2, 7)}`;
    const baseTitle = pageToDup.customName || (pageToDup.name && !pageToDup.name.startsWith("architectural-drawing") ? pageToDup.name : `Page ${pageToDup.pageNumber || (originalIndex + 1)}`);
    const newTitle = `${baseTitle} (Copy)`;

    const newPage = {
      ...pageToDup,
      id: newId,
      name: newTitle,
      customName: newTitle,
      pageNumber: pageToDup.pageNumber || (originalIndex + 1)
    };

    const newPages = [...pages];
    newPages.splice(originalIndex + 1, 0, newPage);
    setPages(newPages);

    if (setAnnotationsByPage) {
      setAnnotationsByPage((prev = {}) => {
        const updated = {};
        Object.keys(prev).forEach((k) => {
          const numK = Number(k);
          if (numK <= originalIndex) {
            updated[numK] = prev[numK];
          } else {
            updated[numK + 1] = prev[numK];
          }
        });
        if (prev[originalIndex]) {
          updated[originalIndex + 1] = JSON.parse(JSON.stringify(prev[originalIndex]));
        }
        return updated;
      });
    }

    if (onPageClick) {
      onPageClick(originalIndex + 1);
    }
  };

  // Rename page on right-click
  const handleRenamePage = (originalIndex) => {
    if (!setPages || !pages || originalIndex < 0 || originalIndex >= pages.length) return;
    const pageObj = pages[originalIndex];
    const currentTitle = pageObj.customName || (pageObj.name && !pageObj.name.startsWith("architectural-drawing") ? pageObj.name : `Page ${pageObj.pageNumber || (originalIndex + 1)}`);
    const newName = window.prompt("Rename Page:", currentTitle);
    if (newName && newName.trim()) {
      const cleanName = newName.trim();
      setPages((prev) =>
        prev.map((p, idx) => (idx === originalIndex ? { ...p, name: cleanName, customName: cleanName } : p))
      );
    }
  };



  return (
    <div className="pdf-module-tab-bar">
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    pageIndex: p.originalIndex,
                    pageTitle
                  });
                }}
                title={`${p.fileName ? `${p.fileName} - ` : ""}${pageTitle} (${p.w || 0} × ${p.h || 0} px) • Right-click to duplicate/rename`}
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

        {/* Custom Context Menu on Right-Click */}
        {contextMenu && (
          <div
            style={{
              position: "fixed",
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 99999,
              background: "#ffffff",
              borderRadius: "8px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
              border: "1px solid #cbd5e1",
              padding: "4px",
              minWidth: "165px",
              display: "flex",
              flexDirection: "column",
              gap: "2px"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "4px 8px", fontSize: "10.5px", color: "#64748b", fontWeight: 700, borderBottom: "1px solid #f1f5f9" }}>
              {contextMenu.pageTitle}
            </div>
            <button
              type="button"
              onClick={() => {
                handleDuplicatePage(contextMenu.pageIndex);
                setContextMenu(null);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 10px",
                borderRadius: "5px",
                border: "none",
                background: "transparent",
                color: "#1e293b",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                transition: "background 0.15s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#eff6ff"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span>📋</span>
              <span>Duplicate Page</span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleRenamePage(contextMenu.pageIndex);
                setContextMenu(null);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 10px",
                borderRadius: "5px",
                border: "none",
                background: "transparent",
                color: "#1e293b",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                transition: "background 0.15s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#eff6ff"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span>✏️</span>
              <span>Rename Page</span>
            </button>
            {pages.length > 1 && (
              <>
                <div style={{ height: "1px", background: "#f1f5f9", margin: "2px 0" }} />
                <button
                  type="button"
                  onClick={async () => {
                    const idx = contextMenu.pageIndex;
                    const title = contextMenu.pageTitle;
                    setContextMenu(null);
                    if (await showConfirm(`Delete ${title}?`)) {
                      if (onDeletePage) onDeletePage(idx);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 10px",
                    borderRadius: "5px",
                    border: "none",
                    background: "transparent",
                    color: "#dc2626",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "background 0.15s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#fee2e2"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <span>🗑️</span>
                  <span>Delete Page</span>
                </button>
              </>
            )}
          </div>
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

    </div>
  );
}
