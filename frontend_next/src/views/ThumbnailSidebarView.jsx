import React from "react";
import { useDialog } from "@/components/DialogContext";
import { mapFloorName, convertNameToClass } from "@/utils/geometry";

export default function ThumbnailSidebarView({ pages, currentPage, onPageClick, roomsByPage, setPages, onAddPagesClick }) {
  const { showPrompt } = useDialog();
  if (pages.length === 0) return null;

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

  return (
    <div className="cad-page-sidebar">
      <div style={{
        fontSize: 9, fontWeight: 700, color: "#6b7280",
        textAlign: "center", padding: "6px 0 8px",
        borderBottom: "1px solid #2a2d35", marginBottom: 8,
        letterSpacing: 1, textTransform: "uppercase"
      }}>
        Pages
      </div>

      {pages.map((p, i) => {
        const roomCount = (roomsByPage && roomsByPage[i]) ? roomsByPage[i].length : 0;
        const floorDisplayName = mapFloorName(p.floor_name, i);
        
        return (
          <div
            key={i}
            onClick={() => onPageClick(i)}
            className={`page-thumb-card ${currentPage === i ? "active" : ""}`}
            title={`${floorDisplayName} — ${roomCount} rooms`}
            style={{ position: "relative" }}
          >
            <img
              src={p.image}
              className="page-thumb-img"
              alt={floorDisplayName}
              draggable={false}
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
                  title="Click để đổi tên tầng"
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
                <option value="first_floor">Tầng 1</option>
                <option value="upper_floor">Tầng 2</option>
                <option value="third_floor">Tầng 3</option>
                <option value="fourth_floor">Tầng 4</option>
                <option value="fifth_floor">Tầng 5</option>
                <option value="roof">Mái (Roof)</option>
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
        <div
          onClick={onAddPagesClick}
          className="page-thumb-card add-page-card"
          title="Thêm trang nếu chọn thiếu"
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
      )}
    </div>
  );
}
