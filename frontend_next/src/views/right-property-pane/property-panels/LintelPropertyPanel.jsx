import React from "react";

export default function LintelPropertyPanel({
  selectedLintel,
  lintelController,
  deleteItem,
  showConfirm = window.confirm
}) {
  if (!selectedLintel) {
    return <div className="panel-hint" style={{ padding: "8px 0" }}>Lintel not found.</div>;
  }

  return (
    <>
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

      <div className="panel-field">
        <span className="panel-label">Parent Wall ID</span>
        <div style={{ fontSize: 11, color: "#94a3b8" }}>
          {selectedLintel.wallId || "None (Standalone)"}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          className="rp-action-btn rp-action-btn--danger"
          onClick={async (e) => {
            e.stopPropagation();
            if (await showConfirm("Are you sure you want to delete this lintel?")) {
              if (lintelController) {
                lintelController.deleteLintel(selectedLintel.id);
              } else if (deleteItem) {
                deleteItem();
              }
            }
          }}
        >
          Delete Selected Lintel
        </button>
      </div>
    </>
  );
}
