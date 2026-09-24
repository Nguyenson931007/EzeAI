"use client";
import React, { useState, useMemo } from "react";
import { useAppModel } from "@/models/app.context";
import {
  createFloorCeilingWorkspace,
  getNormalizedLevelCode,
  LEVEL_THEME_COLORS
} from "../controllers/FloorCeilingEngine";

export default function FloorCeilingPageSelectorModal({
  isOpen,
  onClose,
  onWorkspaceCreated
}) {
  const {
    pages = [],
    setPages,
    setCurrentPage,
    wallsByPage = {},
    setWallsByPage,
    scalesByPage = {},
    setScalesByPage,
    defaultScale,
    setFloorCeilingTakeoffData
  } = useAppModel();

  // Get only architectural floor levels (non-pdf-tools pages)
  const architecturalPages = useMemo(() => {
    return pages
      .map((p, originalIndex) => ({ ...p, originalIndex }))
      .filter((p) => !p?.category && p?.source !== "pdf_tools" && !p?.isWorkspace);
  }, [pages]);

  // Initially select the first two levels by default, or all if <= 2
  const [selectedIndices, setSelectedIndices] = useState(() => {
    if (architecturalPages.length >= 2) {
      return [architecturalPages[0].originalIndex, architecturalPages[1].originalIndex];
    }
    return architecturalPages.map((p) => p.originalIndex);
  });

  const [workspaceTitle, setWorkspaceTitle] = useState("Floor & Ceiling Page");
  const [includeInterior, setIncludeInterior] = useState(true);

  if (!isOpen) return null;

  const handleToggleSelect = (pIdx) => {
    setSelectedIndices((prev) => {
      if (prev.includes(pIdx)) {
        return prev.filter((i) => i !== pIdx);
      } else {
        // Keep order consistent with pages array
        const next = [...prev, pIdx];
        return next.sort((a, b) => a - b);
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedIndices.length === architecturalPages.length) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(architecturalPages.map((p) => p.originalIndex));
    }
  };

  const handleConfirm = () => {
    if (selectedIndices.length === 0) {
      alert("Please select at least one level to copy walls from.");
      return;
    }

    try {
      const { newPage, clonedWalls, baseScale } = createFloorCeilingWorkspace({
        pages,
        wallsByPage,
        scalesByPage,
        selectedLevelIndices: selectedIndices,
        workspaceTitle: workspaceTitle.trim()
      });

      // Filter out interior walls if user opted out
      const filteredWalls = includeInterior
        ? clonedWalls
        : clonedWalls.filter(w => {
            const cls = (w.class_name || w.wall_type || "").toLowerCase();
            return cls === "exterior_wall" || cls.includes("ext") || w.is_ext;
          });

      const newPageIndex = pages.length;

      // 1. Append new workspace page to pages
      setPages((prev) => [...prev, newPage]);

      // 2. Set walls for the new workspace page
      setWallsByPage((prev) => ({
        ...prev,
        [newPageIndex]: filteredWalls
      }));

      // 3. Set scale for workspace
      if (setScalesByPage) {
        setScalesByPage((prev) => ({
          ...prev,
          [newPageIndex]: baseScale || defaultScale || 1.0
        }));
      }

      // 4. Switch to the newly created workspace
      if (setCurrentPage) {
        setCurrentPage(newPageIndex);
      }

      // Reset any previous calculations or cache for a fresh workspace
      if (setFloorCeilingTakeoffData) {
        setFloorCeilingTakeoffData(null);
      }
      try {
        sessionStorage.removeItem("floor_ceiling_workspace");
        sessionStorage.removeItem("fc_workspace_state");
        localStorage.removeItem("floor_ceiling_workspace");
      } catch (_) {}
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ezefloor:clear_floor_ceiling_scan"));
        window.dispatchEvent(new CustomEvent("sync-floor-ceiling-insulation-clear"));
      }

      if (onWorkspaceCreated) {
        onWorkspaceCreated(newPage, newPageIndex);
      }

      onClose();
    } catch (err) {
      console.error("Failed to create Floor & Ceiling workspace:", err);
      alert(err.message || "Failed to create workspace.");
    }
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.55)",
          backdropFilter: "blur(4px)",
          zIndex: 9998
        }}
        onClick={onClose}
      />

      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: "16px",
          padding: "22px 26px",
          zIndex: 9999,
          width: "min(960px, 95vw)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 60px rgba(0,0,0,0.22)",
          color: "#1e293b",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif"
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            borderBottom: "1px solid #e2e8f0",
            paddingBottom: "14px"
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "20px" }}>📐</span>
              <h3 style={{ margin: 0, fontSize: "18px", color: "#1e293b", fontWeight: 800 }}>
                Create Floor &amp; Ceiling Page
              </h3>
              <span
                style={{
                  background: "#eff6ff",
                  color: "#2563eb",
                  border: "1px solid #bfdbfe",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "12px"
                }}
              >
                Multi-Level Overlay
              </span>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
              Select PDF levels to combine into an independent overlay page for Floor &amp; Ceiling takeoff. Original levels remain 100% untouched.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={handleSelectAll}
              style={{
                background: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                color: "#2563eb",
                borderRadius: "6px",
                padding: "6px 14px",
                fontSize: "12px",
                cursor: "pointer",
                fontWeight: 700,
                transition: "all 0.15s"
              }}
            >
              {selectedIndices.length === architecturalPages.length ? "Deselect All" : "Select All Floors"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                color: "#64748b",
                borderRadius: "6px",
                width: "32px",
                height: "32px",
                cursor: "pointer",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Level List / Table */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            marginBottom: "16px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "14px",
            maxHeight: "calc(90vh - 220px)",
            padding: "2px"
          }}
        >
          {architecturalPages.map((flr, orderIdx) => {
            const originalIdx = flr.originalIndex;
            const isSelected = selectedIndices.includes(originalIdx);
            const levelCode = getNormalizedLevelCode(flr.floor_name || flr.name, orderIdx);
            const pageWalls = wallsByPage[originalIdx] || [];
            const extWalls = pageWalls.filter(w => {
              const cls = (w.class_name || w.wall_type || "").toLowerCase();
              return cls === "exterior_wall" || cls.includes("ext") || w.is_ext;
            });
            const themeColor = LEVEL_THEME_COLORS[orderIdx % LEVEL_THEME_COLORS.length];

            return (
              <div
                key={flr.id || originalIdx}
                onClick={() => handleToggleSelect(originalIdx)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "12px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  background: isSelected ? "#f8fafc" : "#ffffff",
                  border: isSelected ? `2px solid ${themeColor}` : "1px solid #cbd5e1",
                  boxShadow: isSelected ? "0 4px 14px rgba(0, 0, 0, 0.08)" : "0 1px 4px rgba(0,0,0,0.03)",
                  transition: "all 0.15s ease",
                  position: "relative"
                }}
              >
                {/* Header card */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(originalIdx);
                      }}
                      style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: themeColor }}
                    />
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 800,
                        color: "#ffffff",
                        background: themeColor,
                        padding: "2px 8px",
                        borderRadius: "6px"
                      }}
                    >
                      {levelCode}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                      {flr.floor_name || flr.name || `Level ${orderIdx + 1}`}
                    </span>
                  </div>

                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                    Page {flr.pageNumber || (originalIdx + 1)}
                  </span>
                </div>

                {/* Preview Thumbnail */}
                <div
                  style={{
                    width: "100%",
                    height: "170px",
                    background: "#f1f5f9",
                    borderRadius: "8px",
                    overflow: "hidden",
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative"
                  }}
                >
                  {flr.image ? (
                    <img src={flr.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: "12px" }}>No Preview</span>
                  )}
                </div>

                {/* Info Bar */}
                <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <span style={{ color: "#3b82f6", fontWeight: 700 }}>
                      🧱 {pageWalls.length} walls
                    </span>
                    <span style={{ color: "#64748b" }}>
                      ({extWalls.length} ext)
                    </span>
                  </div>
                  <span style={{ color: isSelected ? themeColor : "#94a3b8", fontWeight: 700 }}>
                    {isSelected ? "✓ Included" : "Click to select"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Options & Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "14px",
            borderTop: "1px solid #e2e8f0",
            flexWrap: "wrap",
            gap: "10px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#475569", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includeInterior}
                onChange={(e) => setIncludeInterior(e.target.checked)}
                style={{ accentColor: "#2563eb", cursor: "pointer" }}
              />
              <span>Copy Interior partition walls</span>
            </label>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Selected: <b style={{ color: "#2563eb" }}>{selectedIndices.length}</b> level(s)
            </span>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "9px 18px",
                background: "#f1f5f9",
                color: "#475569",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedIndices.length === 0}
              style={{
                padding: "9px 24px",
                background: selectedIndices.length > 0 ? "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)" : "#94a3b8",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                cursor: selectedIndices.length > 0 ? "pointer" : "not-allowed",
                fontSize: "13px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: selectedIndices.length > 0 ? "0 4px 14px rgba(37,99,235,0.3)" : "none"
              }}
            >
              <span>🚀</span>
              <span>Create Page ({selectedIndices.length} Levels)</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
