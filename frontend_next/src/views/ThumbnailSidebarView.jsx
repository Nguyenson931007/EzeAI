import React from "react";

export default function ThumbnailSidebarView({ pages, currentPage, onPageClick, roomsByPage, setPages }) {
  if (pages.length === 0) return null;

  const handleRenameFloor = (e, index, currentName) => {
    e.stopPropagation();
    const newName = prompt("Nhập tên tầng (Floor Name):", currentName || `Floor_${index}`);
    if (newName !== null && setPages) {
      setPages(prev => prev.map((p, i) => 
        i === index ? { ...p, floor_name: newName } : p
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
        const floorName = p.floor_name || `Floor_${i}`;
        
        return (
          <div
            key={i}
            onClick={() => onPageClick(i)}
            className={`page-thumb-card ${currentPage === i ? "active" : ""}`}
            title={`${floorName} — ${roomCount} rooms`}
            style={{ position: "relative" }}
          >
            <img
              src={p.image}
              className="page-thumb-img"
              alt={floorName}
              draggable={false}
            />
            <div className="page-thumb-info" style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start", padding: "4px 8px" }}>
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
                  {p.floor_name || `Floor_${i}`} ✏️
                </span>
              </div>
              {roomCount > 0 && (
                <span className="page-thumb-rooms" style={{ fontSize: 9, alignSelf: "flex-end" }}>{roomCount} rooms</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
