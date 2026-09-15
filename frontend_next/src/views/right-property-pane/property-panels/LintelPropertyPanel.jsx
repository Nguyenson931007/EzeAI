import React from "react";

export default function LintelPropertyPanel({
  selectedLintel,
  selectedLintelIds = [],
  lintelController,
  deleteItem,
  showConfirm = window.confirm,
  onOpenPdfCallout,
  onClose
}) {
  if (!selectedLintel) {
    return <div className="panel-hint" style={{ padding: "8px 0" }}>Lintel not found.</div>;
  }

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (lintelController?.deselectLintel) {
      lintelController.deselectLintel();
    } else {
      if (lintelController?.setShowCatalogPanel) lintelController.setShowCatalogPanel(false);
    }
  };

  return (
    <>
      {selectedLintelIds && selectedLintelIds.length > 1 && (
        <div style={{
          background: "rgba(59, 130, 246, 0.15)",
          border: "1px solid rgba(59, 130, 246, 0.3)",
          color: "#60a5fa",
          borderRadius: 4,
          padding: "6px 10px",
          marginBottom: 10,
          fontSize: 12,
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>Multiple Lintels Selected</span>
          <span style={{
            background: "#2563eb",
            color: "#fff",
            borderRadius: 10,
            padding: "1px 7px",
            fontSize: 11
          }}>{selectedLintelIds.length}</span>
        </div>
      )}
      <div className="panel-field">
        <span className="panel-label">Lintel ID</span>
        <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: "bold" }}>
          {selectedLintel.id}
        </div>
      </div>

      <div className="panel-field">
        <span className="panel-label">Structural Category</span>
        <select
          className="panel-input"
          value={selectedLintel.category || "lintel"}
          onChange={(e) => {
            if (lintelController) {
              lintelController.updateLintel({
                ...selectedLintel,
                category: e.target.value
              });
            }
          }}
        >
          <option value="lintel">Lintel (L)</option>
          <option value="beam">Beam (B)</option>
          <option value="bh">BH (BH)</option>
        </select>
      </div>

      {/* <div className="panel-field">
        <span className="panel-label">Callout Tag / Label</span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input
            type="text"
            className="panel-input"
            placeholder={selectedLintel.category === 'beam' ? 'B1' : (selectedLintel.category === 'bh' ? 'BH1' : 'L1')}
            value={selectedLintel.label || ""}
            onChange={(e) => {
              if (lintelController) {
                lintelController.updateLintel({
                  ...selectedLintel,
                  label: e.target.value
                });
              }
            }}
          />
          {selectedLintel.calloutOffset && (
            <button
              className="rp-action-btn"
              title="Reset callout position back to default"
              style={{
                fontSize: 10,
                padding: "4px 6px",
                background: "#334155",
                color: "#94a3b8",
                whiteSpace: "nowrap",
                cursor: "pointer"
              }}
              onClick={() => {
                if (lintelController) {
                  const updated = { ...selectedLintel };
                  delete updated.calloutOffset;
                  lintelController.updateLintel(updated);
                }
              }}
            >
              Reset Pos
            </button>
          )}
        </div>
      </div> */}
      <div className="panel-field">
        <span className="panel-label">Size</span>
        <div style={{ fontSize: 13 }}>
          {selectedLintel.height}x{selectedLintel.width} mm
        </div>
      </div>

      <div className="panel-field">
        <span className="panel-label">Ply</span>
        <input
          type="number"
          min="1"
          placeholder="1"
          className="panel-input"
          onWheel={(e) => e.currentTarget.blur()}
          value={selectedLintel.ply || ""}
          onChange={(e) => {
            const val = e.target.value === "" ? "" : parseInt(e.target.value, 10);
            if (val === "" || (!isNaN(val) && val > 0)) {
              if (lintelController) {
                lintelController.updateLintel({
                  ...selectedLintel,
                  ply: val === "" ? null : val
                });
              }
            }
          }}
        />
      </div>

      <div className="panel-field">
        <span className="panel-label">Grade</span>
        <input
          type="text"
          className="panel-input"
          placeholder="14"
          value={selectedLintel.grade !== undefined && selectedLintel.grade !== null ? selectedLintel.grade : "14"}
          onChange={(e) => {
            if (lintelController) {
              lintelController.updateLintel({
                ...selectedLintel,
                grade: e.target.value
              });
            }
          }}
        />
      </div>

      <div className="panel-field">
        <span className="panel-label">Global Length Offset (m)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          className="panel-input"
          onWheel={(e) => e.currentTarget.blur()}
          value={lintelController && lintelController.globalLengthOffset !== undefined ? lintelController.globalLengthOffset : 0}
          onChange={(e) => {
            const offset = parseFloat(e.target.value) || 0;
            if (lintelController) {
              lintelController.updateGlobalLengthOffset(offset);
            }
          }}
        />
      </div>

      <div className="panel-field">
        <span className="panel-label">Opening / Base Length (m)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          disabled={Boolean(selectedLintel.isRounded)}
          title={selectedLintel.isRounded ? "Click 'Revert Round' below to edit opening length" : "Enter opening/base length in metres"}
          className="panel-input"
          style={{
            fontSize: 15,
            color: selectedLintel.isRounded ? "#64748b" : "#3b82f6",
            fontWeight: "bold",
            cursor: selectedLintel.isRounded ? "not-allowed" : "text",
            opacity: selectedLintel.isRounded ? 0.65 : 1,
            background: selectedLintel.isRounded ? "rgba(15, 23, 42, 0.5)" : undefined
          }}
          onWheel={(e) => e.currentTarget.blur()}
          value={selectedLintel.baseLength !== undefined && selectedLintel.baseLength !== "" ? (typeof selectedLintel.baseLength === "number" ? Number(selectedLintel.baseLength.toFixed(3)) : selectedLintel.baseLength) : ""}
          onChange={(e) => {
            if (selectedLintel.isRounded) return;
            const raw = e.target.value;
            if (raw === "") {
              if (lintelController) {
                lintelController.updateLintel({
                  ...selectedLintel,
                  baseLength: "",
                  measuredLength: ""
                });
              }
              return;
            }
            const val = parseFloat(raw);
            if (!isNaN(val) && val >= 0) {
              if (lintelController) {
                const offset = selectedLintel.lengthOffset !== undefined ? selectedLintel.lengthOffset : (lintelController.globalLengthOffset || 0);
                const baseLen = Math.max(0.01, val);
                lintelController.updateLintel({
                  ...selectedLintel,
                  baseLength: baseLen,
                  measuredLength: baseLen + offset
                });
              }
            }
          }}
          onBlur={() => {
            if (selectedLintel.baseLength === "" || selectedLintel.baseLength === undefined || selectedLintel.baseLength === null) {
              if (lintelController) {
                const offset = selectedLintel.lengthOffset !== undefined ? selectedLintel.lengthOffset : (lintelController.globalLengthOffset || 0);
                const restoreBase = 0.3;
                lintelController.updateLintel({
                  ...selectedLintel,
                  baseLength: restoreBase,
                  measuredLength: restoreBase + offset
                });
              }
            }
          }}
        />
        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
          = Measured: <span style={{ color: "#38bdf8", fontWeight: 600 }}>{typeof selectedLintel.measuredLength === "number" ? `${selectedLintel.measuredLength.toFixed(3)} m` : (selectedLintel.measuredLength || "0.000 m")}</span>
          <span style={{ opacity: 0.8 }}> (Base + {selectedLintel.lengthOffset !== undefined ? selectedLintel.lengthOffset : (lintelController?.globalLengthOffset || 0)}m offset)</span>
        </div>
      </div>



      {/* <div className="panel-field">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="panel-label">Callout Font Size (pt)</span>
          <span style={{ fontSize: "12px", color: "#38bdf8", fontWeight: "bold" }}>
            {selectedLintel.fontSizePt !== undefined ? selectedLintel.fontSizePt : 14} pt
            {` (= ${Math.round((selectedLintel.fontSizePt !== undefined ? Number(selectedLintel.fontSizePt) : 14) * ((selectedLintel.dpi || 250) / 72))} px)`}
          </span>
        </div>
        <input
          type="number"
          min="1"
          max="120"
          step="1"
          className="panel-input"
          value={selectedLintel.fontSizePt !== undefined ? selectedLintel.fontSizePt : 14}
          onChange={(e) => {
            const val = e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value, 10) || 1);
            if (lintelController) {
              lintelController.updateLintel({
                ...selectedLintel,
                fontSizePt: val
              });
            }
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
          {[10, 12, 14, 16, 18, 24, 36].map((pt) => {
            const curPt = selectedLintel.fontSizePt !== undefined ? Number(selectedLintel.fontSizePt) : 14;
            return (
              <button
                key={pt}
                type="button"
                onClick={() => {
                  if (lintelController) {
                    lintelController.updateLintel({
                      ...selectedLintel,
                      fontSizePt: pt
                    });
                  }
                }}
                style={{
                  background: curPt === pt ? "#3b82f6" : "#1e293b",
                  color: curPt === pt ? "#ffffff" : "#94a3b8",
                  border: "1px solid #475569",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                {pt}pt
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel-field">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="panel-label">DPI Setting</span>
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>
            {selectedLintel.dpi || 250} DPI
          </span>
        </div>
        <input
          type="number"
          min="50"
          max="1200"
          step="10"
          className="panel-input"
          value={selectedLintel.dpi || 250}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10) || 250;
            if (typeof window !== "undefined") {
              localStorage.setItem("ezefloor_dpi", String(val));
            }
            if (lintelController) {
              lintelController.updateLintel({
                ...selectedLintel,
                dpi: val
              });
            }
          }}
        />
        <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>
          Formula: px = pt * (DPI / 72). Default: 250 DPI.
        </div>
      </div> */}

      {onOpenPdfCallout && (
        <button
          type="button"
          className="rp-action-btn"
          style={{
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: "#ffffff",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            marginTop: "6px",
            padding: "8px 10px",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer"
          }}
          onClick={() => onOpenPdfCallout(selectedLintel)}
        >
          <span>🎨 Open in PDF Callout Tool</span>
        </button>
      )}



      <div className="panel-field">
        <span className="panel-label">Final Length (Rounded)</span>
        <div style={{ fontSize: 18, color: "#f59e0b", fontWeight: "bold" }}>
          {typeof selectedLintel.finalLength === "number" ? `${selectedLintel.finalLength.toFixed(3)} m` : (selectedLintel.finalLength || "0.000 m")}
        </div>
        <button
          className="rp-action-btn"
          style={{
            padding: "6px 8px",
            fontSize: "11px",
            background: selectedLintel.isRounded ? "#1e293b" : "#f59e0b",
            marginTop: "6px",
            marginBottom: 0,
            width: "100%",
            cursor: "pointer",
            border: selectedLintel.isRounded ? "1px solid rgba(255,255,255,0.2)" : "none",
            color: selectedLintel.isRounded ? "#38bdf8" : "#fff"
          }}
          onClick={() => {
            if (lintelController) {
              lintelController.roundSingleLintel(selectedLintel.id);
            }
          }}
          title={selectedLintel.isRounded ? "Click to revert to original measured length" : "Round this lintel's length to the nearest 0.3m increment"}
        >
          {selectedLintel.isRounded ? " Revert Round" : " Round "}
        </button>
      </div>

      {/* <div className="panel-field">
        <span className="panel-label">Parent Wall ID</span>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>
          {selectedLintel.wallId || "None (Standalone)"}
        </div>
      </div> */}

      <div style={{ marginTop: 12 }}>
        <button
          className="rp-action-btn rp-action-btn--danger"
          onClick={async (e) => {
            e.stopPropagation();
            const count = (selectedLintelIds && selectedLintelIds.length > 1) ? selectedLintelIds.length : 1;
            const confirmMsg = count > 1
              ? `Are you sure you want to delete ${count} selected lintels?`
              : "Are you sure you want to delete this lintel?";
            if (await showConfirm(confirmMsg)) {
              if (deleteItem) {
                deleteItem();
              } else if (lintelController) {
                if (count > 1 && lintelController.deleteLintels) {
                  lintelController.deleteLintels(selectedLintelIds);
                } else {
                  lintelController.deleteLintel(selectedLintel.id);
                }
              }
              handleClose();
            }
          }}
        >
          {selectedLintelIds && selectedLintelIds.length > 1
            ? `Delete All Selected Lintels (${selectedLintelIds.length})`
            : "Delete Selected Lintel"}
        </button>
      </div>
    </>
  );
}
