import React from "react";

export default function TakeoffExportModal({
  showTakeoffModal,
  setShowTakeoffModal,
  takeoffForm = {
    projectName: "",
    clientName: "",
    detailerName: "",
    jobNo: "",
    date: ""
  },
  setTakeoffForm,
  handleExportTakeoff,
  isExporting = false
}) {
  if (!showTakeoffModal) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
          width: "400px",
          maxWidth: "90%",
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.15)",
          color: "var(--text)"
        }}
      >
        <h3
          style={{
            margin: "0 0 16px 0",
            fontSize: "16px",
            fontWeight: "700",
            color: "#0f172a",
            borderBottom: "1px solid #f1f5f9",
            paddingBottom: "12px"
          }}
        >
          📋 Export Takeoff Excel Form
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Project Name</label>
            <input
              type="text"
              value={takeoffForm.projectName}
              onChange={(e) => setTakeoffForm((prev) => ({ ...prev, projectName: e.target.value }))}
              style={{
                padding: "8px 12px",
                background: "#ffffff",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                outline: "none"
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Client Name</label>
            <input
              type="text"
              value={takeoffForm.clientName}
              onChange={(e) => setTakeoffForm((prev) => ({ ...prev, clientName: e.target.value }))}
              style={{
                padding: "8px 12px",
                background: "#ffffff",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                outline: "none"
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Detailer Name</label>
            <input
              type="text"
              value={takeoffForm.detailerName}
              onChange={(e) => setTakeoffForm((prev) => ({ ...prev, detailerName: e.target.value }))}
              style={{
                padding: "8px 12px",
                background: "#ffffff",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                outline: "none"
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Job No</label>
            <input
              type="text"
              value={takeoffForm.jobNo}
              onChange={(e) => setTakeoffForm((prev) => ({ ...prev, jobNo: e.target.value }))}
              style={{
                padding: "8px 12px",
                background: "#ffffff",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                outline: "none"
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#475569" }}>Date</label>
            <input
              type="text"
              value={takeoffForm.date}
              onChange={(e) => setTakeoffForm((prev) => ({ ...prev, date: e.target.value }))}
              style={{
                padding: "8px 12px",
                background: "#ffffff",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "13px",
                outline: "none"
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            onClick={() => setShowTakeoffModal(false)}
            disabled={isExporting}
            style={{
              padding: "8px 16px",
              background: "#f1f5f9",
              color: "#475569",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleExportTakeoff}
            disabled={isExporting}
            style={{
              padding: "8px 16px",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "13px",
              cursor: isExporting ? "not-allowed" : "pointer",
              opacity: isExporting ? 0.7 : 1
            }}
          >
            {isExporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>
    </div>
  );
}
