import React, { useState, useEffect, useMemo } from "react";

/**
 * LintelCatalogPicker — Shared lintel catalog search + select + ply.
 *
 * Used by: LintelCatalogPanel (L1, standalone sidebar) +
 *          LintelPropertyPanel Card 1 (L2, properties panel).
 * L1 is essentially a standalone version of L2's Card 1.
 *
 * Props:
 *   catalog — array of catalog items [{id, height, width, description, type, code, unit}]
 *             (if not provided, fetches from /lintel_catalog.json)
 *   catalogUrl — custom catalog URL (default "/lintel_catalog.json")
 *   selectedId — currently selected item id
 *   onSelect(item) — called when an item is clicked
 *   plyValues — {itemId: ply} map for per-item ply inputs
 *   onPlyChange(itemId, ply) — called when ply changes
 *   showPly — show ply input per item (default true)
 *   showClose — show close button (default false, for L1)
 *   onClose — close handler
 *   searchPlaceholder
 */
export default function LintelCatalogPicker({
  catalog: catalogProp,
  catalogUrl = "/lintel_catalog.json",
  selectedId,
  onSelect,
  plyValues = {},
  onPlyChange,
  showPly = true,
  showClose = false,
  onClose,
  searchPlaceholder = "Filter by height (e.g. 90, 170)...",
  className = "",
  style = {},
}) {
  const [catalog, setCatalog] = useState(catalogProp || []);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(!catalogProp);

  useEffect(() => {
    if (catalogProp) {
      setCatalog(catalogProp);
      setLoading(false);
      return;
    }
    fetch(catalogUrl)
      .then((res) => res.json())
      .then((data) => {
        setCatalog(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading lintel catalog:", err);
        setLoading(false);
      });
  }, [catalogProp, catalogUrl]);

  const filteredCatalog = useMemo(() => {
    if (!searchTerm) return catalog;
    const query = searchTerm.toLowerCase();
    return catalog.filter((item) => {
      const sizeStr = `${item.height}x${item.width}`.toLowerCase();
      const sizeStrAlt = `${item.width}x${item.height}`.toLowerCase();
      return (
        String(item.height).includes(query) ||
        String(item.width).includes(query) ||
        sizeStr.includes(query) ||
        sizeStrAlt.includes(query) ||
        String(item.id || "").toLowerCase().includes(query)
      );
    });
  }, [catalog, searchTerm]);

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", ...style }}>
      {/* Search */}
      <div style={{ padding: "8px", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <span style={{ fontSize: "13px", fontWeight: 700 }}>Lintel Catalog</span>
          {showClose && onClose && (
            <button
              onClick={onClose}
              title="Close"
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                fontSize: "16px",
                cursor: "pointer",
                padding: "2px 6px",
              }}
            >
              ✕
            </button>
          )}
        </div>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            fontSize: "11px",
            borderRadius: "5px",
            border: "1px solid #cbd5e1",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px" }}>Loading...</div>
        ) : filteredCatalog.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px" }}>No items found</div>
        ) : (
          filteredCatalog.map((item) => {
            const isSelected = String(item.id) === String(selectedId);
            const ply = plyValues[item.id] ?? "";
            return (
              <div
                key={item.id}
                onClick={() => onSelect?.(item)}
                style={{
                  padding: "8px",
                  marginBottom: "6px",
                  borderRadius: "6px",
                  border: isSelected ? "2px solid #3b82f6" : "1px solid #e2e8f0",
                  background: isSelected ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: "12px" }}>
                    {item.height}x{item.width} {item.description || ""}
                  </span>
                  {item.type && (
                    <span
                      style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "#f1f5f9",
                        color: "#475569",
                      }}
                    >
                      {item.type}
                    </span>
                  )}
                </div>
                {(item.code || item.unit) && (
                  <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                    {item.code && <span>Code: {item.code} </span>}
                    {item.unit && <span>Unit: {item.unit}</span>}
                  </div>
                )}
                {showPly && (
                  <div
                    style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span style={{ fontSize: "10px", color: "#475569" }}>Ply:</span>
                    <input
                      type="number"
                      value={ply}
                      onChange={(e) => onPlyChange?.(item.id, e.target.value)}
                      style={{
                        width: "60px",
                        padding: "4px 6px",
                        fontSize: "11px",
                        borderRadius: "4px",
                        border: "1px solid #cbd5e1",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
