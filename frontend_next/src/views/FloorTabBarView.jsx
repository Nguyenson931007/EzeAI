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

  return (
    <div className="cad-floor-tabs">
      {pages.map((p, idx) => {
        const isActive = idx === currentPage;
        const pageRooms = roomsByPage[idx] || [];
        const levelName = getLevelLabel(p, idx);

        return (
          <div
            key={idx}
            className={`cad-floor-tab ${isActive ? "active" : ""}`}
            onClick={() => onPageClick && onPageClick(idx)}
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
            {pages.length > 1 && (
              <span
                className="tab-close"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (await showConfirm(`Delete ${levelName}?`)) {
                    if (onDeletePage) onDeletePage(e, idx);
                  }
                }}
                title="Delete Level"
              >
                ✕
              </span>
            )}
          </div>
        );
      })}

      {/* Add new floor / page button with file input */}
      <label
        title="Thêm tầng từ file PDF hoặc Ảnh"
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
