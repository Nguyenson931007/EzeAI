import React from "react";
import { useDialog } from "@/components/DialogContext";
import { mapFloorName, convertNameToClass } from "@/utils/geometry";

export default function ThumbnailSidebarView({ pages, currentPage, onPageClick, roomsByPage, setPages, onAddPagesClick, onDeletePage }) {
  const { showPrompt, showConfirm } = useDialog();
  if (pages.length === 0) return null;

  const handleDeleteClick = async (e, index) => {
    e.stopPropagation();
    const isConfirmed = await showConfirm(
      "Xóa trang bản vẽ?",
      "Việc này sẽ xóa toàn bộ phòng, tường, cửa trên trang này. Bạn có chắc chắn muốn xóa không?"
    );
    if (isConfirmed && onDeletePage) {
      onDeletePage(index);
    }
  };

  const handleRenameFloor = async (e, index, currentName) => {
    e.stopPropagation();
    const currentDisplayName = mapFloorName(currentName, index);
    const newName = await showPrompt("Nhập tên tầng (Floor Name):", currentDisplayName);
    if (newName !== null && setPages) {
      const classVal = convertNameToClass(newName, index);
      setPages(prev => prev.map((p, i) =>
        i === index ? { ...p, floor_name: classVal } : p
      ));
    }
  };

  const architecturalPages = (pages || [])
    .map((p, originalIndex) => ({ ...p, originalIndex }))
    .filter((p) => !p?.category && p?.source !== "pdf_tools");

  const displayPages = architecturalPages;

  return (
    <div className="cad-page-sidebar">
      <style>{`
        .hover-show-delete:hover .delete-page-btn {
          opacity: 1 !important;
        }
        .delete-page-btn:hover {
          background: rgba(220, 38, 38, 1) !important;
          transform: scale(1.1);
        }
      `}</style>
      <div style={{
        fontSize: 9, fontWeight: 700, color: "#6b7280",
        textAlign: "center", padding: "6px 0 8px",
        borderBottom: "1px solid #2a2d35", marginBottom: 8,
        letterSpacing: 1, textTransform: "uppercase"
      }}>
        Pages
      </div>

      {displayPages.map((p, archIdx) => {
        const i = p.originalIndex !== undefined ? p.originalIndex : archIdx;
        const roomCount = (roomsByPage && roomsByPage[i]) ? roomsByPage[i].length : 0;
        const floorDisplayName = mapFloorName(p.floor_name, archIdx);

        return (
          <div
            key={i}
            onClick={() => onPageClick(i)}
            title={`${floorDisplayName} — ${roomCount} rooms`}
            style={{ position: "relative" }}
            className={`page-thumb-card ${currentPage === i ? "active" : ""} hover-show-delete`}
          >
            {onDeletePage && (
              <div
                className="delete-page-btn"
                onClick={(e) => handleDeleteClick(e, i)}
                title="Xóa trang này"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "rgba(220, 38, 38, 0.8)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  cursor: "pointer",
                  zIndex: 10,
                  opacity: 0,
                  transition: "opacity 0.2s"
                }}
              >
                ✕
              </div>
            )}
            <img
              src={p.image}
              className="page-thumb-img"
              alt={floorDisplayName}
              draggable={false}
              loading="eager"
              decoding="async"
            />
            <div className="page-thumb-info" style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start", padding: "4px 8px", width: "100%", boxSizing: "border-box" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                <span className="page-thumb-number" style={{ fontSize: 11, fontWeight: "bold" }}>{i + 1}</span>
                <span
                  onClick={(e) => handleRenameFloor(e, i, p.floor_name)}
                  style={{
                    fontSize: 10,
                    color: "#9ca3af",
                    cursor: "pointer",
                    textDecoration: "underline",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    maxWidth: "70px"
                  }}
                  title="Click to rename the floor"
                >
                  {floorDisplayName} ✏️
                </span>
              </div>
              <select
                value={p.floor_name || `floor_${i}`}
                onChange={(e) => {
                  const val = e.target.value;
                  setPages(prev => prev.map((pg, idx) =>
                    idx === i ? { ...pg, floor_name: val } : pg
                  ));
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: "9px",
                  background: "#1f2937",
                  color: "#cbd5e1",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "4px",
                  padding: "2px 4px",
                  width: "100%",
                  marginTop: "2px",
                  outline: "none",
                  cursor: "pointer",
                  fontFamily: "Inter, sans-serif"
                }}
              >
                <option value="first_floor">GF (Ground)</option>
                <option value="upper_floor">FF (First Floor)</option>
                <option value="third_floor">SF (Second Floor)</option>
                <option value="fourth_floor">TF (Third Floor)</option>
                <option value="fifth_floor">4F (Fourth Floor)</option>
                <option value="roof">Roof</option>
                {p.floor_name && !["first_floor", "upper_floor", "third_floor", "fourth_floor", "fifth_floor", "roof"].includes(p.floor_name) && (
                  <option value={p.floor_name}>{floorDisplayName}</option>
                )}
              </select>
              {roomCount > 0 && (
                <span className="page-thumb-rooms" style={{ fontSize: 9, alignSelf: "flex-end", marginTop: "2px" }}>{roomCount} rooms</span>
              )}
            </div>
          </div>
        );
      })}

      {onAddPagesClick && (
        <label
          title="Add pages from a new PDF file"
          style={{ display: "block" }}
        >
          <input
            type="file" accept=".pdf,image/*" style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files[0];
              if (!file) return;
              onAddPagesClick(file);
              e.target.value = '';
            }}
          />
          <div
            className="page-thumb-card add-page-card"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              border: "2px dashed #4b5563",
              borderRadius: 8,
              height: 70,
              cursor: "pointer",
              margin: "8px 0",
              background: "rgba(255, 255, 255, 0.02)",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = "#3b82f6"}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = "#4b5563"}
          >
            <span style={{ fontSize: 18, fontWeight: "bold", color: "#9ca3af" }}>+</span>
            <span style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>Add Pages</span>
          </div>
        </label>
      )}
    </div>
  );
}
