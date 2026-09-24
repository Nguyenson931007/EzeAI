"use client";
import React from "react";
import { useDialog } from "@/components/DialogContext";

export default function FloorTabBarView({
  pages = [],
  currentPage = 0,
  onPageClick,
  roomsByPage = {},
  onAddPagesClick,
  onDeletePage,
}) {
  const { showConfirm } = useDialog();

  const getLevelLabel = (p, idx) => {
    const raw = (p?.floor_name || p?.name || p?.player_name || p?.layer_name || "").trim();
    if (raw) {
      if (/roof|mái/i.test(raw)) return "Roof";
      if (/^floor\s*/i.test(raw)) {
        return raw.replace(/^floor\s*/i, "Level ");
      }
      return raw;
    }
    return `Level ${idx + 1}`;
  };

  // Only display architectural Level pages (exclude PDF Tools / any task category pages)
  const architecturalPages = pages
    .map((p, originalIndex) => ({ ...p, originalIndex }))
    .filter((p) => !p?.category && p?.source !== "pdf_tools" && !p?.isFloorCeilingWorkspace && p?.source !== "floor_ceiling_workspace" && p?.source !== "floor_ceiling_page" && !p?.isWorkspace);

  const displayPages = architecturalPages;

  return (
    <div className="cad-floor-tabs">
      {displayPages.map((p, idx) => {
        const isActive = p.originalIndex === currentPage;
        const pageRooms = roomsByPage[p.originalIndex] || [];
        const levelName = getLevelLabel(p, idx);

        return (
          <div
            key={p.originalIndex}
            className={`cad-floor-tab ${isActive ? "active" : ""}`}
            onClick={() => onPageClick && onPageClick(p.originalIndex)}
            title={`${levelName} (${pageRooms.length} rooms)`}
          >
            <span className="tab-icon" style={{ color: isActive ? "var(--blue)" : "var(--text-dim)" }}>■</span>
            <span>{levelName}</span>
            {pageRooms.length > 0 && (
              <span style={{
                fontSize: "10px",
                padding: "1px 5px",
                borderRadius: "4px",
                background: isActive ? "var(--blue-50)" : "rgba(0,0,0,0.05)",
                color: isActive ? "var(--blue-700)" : "var(--text-dim)",
                fontWeight: 600
              }}>
                {pageRooms.length}
              </span>
            )}
            <span
              className="tab-close"
              onClick={async (e) => {
                e.stopPropagation();
                if (await showConfirm(`Delete level ${levelName}?`)) {
                  if (onDeletePage) onDeletePage(p.originalIndex);
                }
              }}
              title="Delete level"
            >
              ✕
            </span>
          </div>
        );
      })}

      {/* Add new floor / page button with file input */}
      <label
        title="Add a layer from a PDF file or image"
        style={{ display: "flex", alignItems: "center", cursor: "pointer", margin: 0 }}
      >
        <input
          type="file"
          accept=".pdf,image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (onAddPagesClick) onAddPagesClick(file);
            e.target.value = "";
          }}
        />
        <div className="cad-floor-tab-add" title="Add Floor / Page">
          +
        </div>
      </label>
    </div>
  );
}
