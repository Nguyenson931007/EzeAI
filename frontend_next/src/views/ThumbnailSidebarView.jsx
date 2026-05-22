import React from "react";

export default function ThumbnailSidebarView({ pages, currentPage, onPageClick, roomsByPage }) {
  if (pages.length === 0) return null;

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
        return (
          <div
            key={i}
            onClick={() => onPageClick(i)}
            className={`page-thumb-card ${currentPage === i ? "active" : ""}`}
            title={`Page ${i + 1} — ${roomCount} rooms`}
          >
            <img
              src={p.image}
              className="page-thumb-img"
              alt={`Page ${i + 1}`}
              draggable={false}
            />
            <div className="page-thumb-info">
              <span className="page-thumb-number">{i + 1}</span>
              {roomCount > 0 && (
                <span className="page-thumb-rooms">{roomCount}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
