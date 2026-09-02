import React, { useState } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { useCatalog, catalogByGroup, canonicalProductValue } from "@/utils/catalogHelpers";

export default function CladdingTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  activeJobNumber
}) {
  const appModel = useAppModel ? useAppModel() : {};
  const activeCustomerShortName = getActiveClientShortName();
  const { items: catalogItems } = useCatalog(activeCustomerShortName, "cladding");

  const [wallHeight, setWallHeight] = useState("2.44");
  const [wallLength, setWallLength] = useState("");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isSection2Open, setIsSection2Open] = useState(true);

  const handleSaveToMSSQL = async () => {
    if (!entries || entries.length === 0) return;
    setIsSaving(true);
    setSaveStatus(null);
    try {
      let currentUsername = "";
      if (appModel?.user) {
        currentUsername = appModel.user.username || appModel.user.name || appModel.user.full_name || appModel.user.email || "";
      }
      if (!currentUsername) {
        try {
          const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
          if (userStr) {
            const u = JSON.parse(userStr);
            currentUsername = u.username || u.name || u.full_name || u.email || "";
          }
        } catch (e) {}
      }

      if (!currentUsername && typeof window !== "undefined") {
        currentUsername = localStorage.getItem("username") || localStorage.getItem("user_name") || "admin";
      }

      const savedJobId = activeJobNumber
        || appModel?.currentJobId 
        || appModel?.currentProjectName 
        || appModel?.current_hw_id 
        || (typeof window !== "undefined" ? (
            localStorage.getItem("ezefloor_last_active_job_id") 
            || localStorage.getItem("ezefloor_last_active_project_name") 
            || localStorage.getItem("currentJobId") 
            || localStorage.getItem("current_hw_id") 
            || sessionStorage.getItem("current_hw_id") 
            || "default"
          ) : "default");
      if (!savedJobId) {
        console.warn("Chưa chọn Job để lưu Cladding");
      }

      const payload = {
        user_update: currentUsername || "admin",
        jobs: [
          {
            id_job_hw: savedJobId || "default",
            walls: entries.map(e => {
              const hNum = parseFloat(String(e.height || "2.44").replace(/[^\d.]/g, "")) || 2.44;
              const lNum = parseFloat(String(e.length || "0").replace(/[^\d.]/g, "")) || 0.0;
              return {
                wall_height: hNum,
                wall_length: lNum,
                short_name: activeCustomerShortName
              };
            })
          }
        ]
      };

      const res = await ApiService.saveCladdingJobs(payload);
      if (res && res.success) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus(null), 3500);
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      console.error("Lỗi khi lưu Cladding vào MSSQL:", err);
      setSaveStatus("error");
      alert(`Lỗi khi lưu Cladding vào MSSQL: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInlineEdit = (id) => {
    const h = parseFloat(editRowData.height) || 2.44;
    const l = parseFloat(editRowData.length) || 0;
    const a = Number((h * l).toFixed(2));

    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData,
      height: editRowData.height ? (String(editRowData.height).includes("m") ? editRowData.height : `${h} m`) : item.height,
      length: editRowData.length ? (String(editRowData.length).includes("m") ? editRowData.length : `${l} m`) : item.length,
      area: `${a} m²`
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  const calcArea = () => {
    const h = parseFloat(wallHeight) || 0;
    const l = parseFloat(wallLength) || 0;
    return (h * l).toFixed(2);
  };

  const handleAddCladdingWall = () => {
    const hM = parseFloat(wallHeight) || 2.44;
    const lM = parseFloat(wallLength) || (cadMetrics.externalWallLength ? Number(cadMetrics.externalWallLength.toFixed(1)) : 14.5);
    const areaM2 = Number((hM * lM).toFixed(2));

    const newEntry = {
      id: "clad-" + Date.now(),
      height: `${hM} m`,
      length: `${lM} m`,
      area: `${areaM2} m²`
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setWallLength("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: EXTERNAL WALL MEASUREMENTS (MATCHING BUN-NSW-ACT) ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsSection1Open(!isSection1Open)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isSection1Open ? "1px solid #e2e8f0" : "none",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <span>1. External wall measurements</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection1Open ? "▲" : "▼"}
          </span>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px", display: "flex", alignItems: "flex-end", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 120px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Height</span>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>m</span>
              </div>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 2.44"
                value={wallHeight}
                onChange={(e) => setWallHeight(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "10.5px",
                  borderRadius: "5px",
                  border: "1px solid #fde047",
                  background: "#fffbeb",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div style={{ flex: "2.5 1 200px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Wall Length</span>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>m</span>
              </div>
              <input
                type="number"
                step="0.01"
                placeholder="Enter lineal metres"
                value={wallLength}
                onChange={(e) => setWallLength(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "10.5px",
                  borderRadius: "5px",
                  border: "1px solid #fde047",
                  background: "#fffbeb",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <button
              type="button"
              onClick={handleAddCladdingWall}
              style={{
                padding: "8px 12px",
                background: "#0f2744",
                color: "#ffffff",
                border: "none",
                borderRadius: "5px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer"
              }}
            >
              + Add Cladding Wall
            </button>
          </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED WALL MEASUREMENTS ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: "1px solid #e2e8f0",
            fontWeight: "800",
            fontSize: "13px",
            color: "#0f2744",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <span>2. Entered Cladding Walls ({(entries || []).length})</span>
        </div>
        <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "4px" }}>#</th>
                <th style={{ padding: "4px" }}>Wall Height</th>
                <th style={{ padding: "4px" }}>Wall Length</th>
                <th style={{ padding: "4px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((w, idx) => {
                const isRowEditing = editingRowId === w.id;

                return (
                  <tr key={w.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: isRowEditing ? "#fef3c7" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc") }}>
                    <td style={{ padding: "4px", fontWeight: 700 }}>{idx + 1}</td>
                    
                    {/* Height */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.height || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, height: e.target.value })}
                          style={{ width: "55px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.height
                      )}
                    </td>

                    {/* Length */}
                    <td style={{ padding: "4px" }}>
                      {isRowEditing ? (
                        <input
                          type="text"
                          value={editRowData.length || ""}
                          onChange={(e) => setEditRowData({ ...editRowData, length: e.target.value })}
                          style={{ width: "55px", padding: "2px 4px", fontSize: "10px", border: "1px solid #3b82f6", borderRadius: "3px" }}
                        />
                      ) : (
                        w.length
                      )}
                    </td>

                    {/* Actions: Edit on left of X */}
                    <td style={{ padding: "4px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {isRowEditing ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleSaveInlineEdit(w.id); }}
                            style={{ background: "none", border: "none", color: "#16a34a", cursor: "pointer", fontWeight: 800, fontSize: "13px", padding: "0 2px" }}
                            title="Save"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditingRowId(null); }}
                            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontWeight: 800, fontSize: "11px", padding: "0 2px" }}
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingRowId(w.id);
                              setEditRowData({
                                ...w,
                                height: String(w.height || "2.44").replace("m", "").trim(),
                                length: String(w.length || "0").replace("m", "").trim()
                              });
                            }}
                            style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveEntry(w.id); }}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 800, fontSize: "12px", padding: "0 2px" }}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!entries || entries.length === 0) && (
                <tr>
                  <td colSpan={5} style={{ padding: "10px", textAlign: "center", color: "#94a3b8" }}>
                    No cladding walls entered yet. Fill the inputs above and click '+ Add wall'.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── ACTION BUTTONS: SAVE & PROCUREMENT (ONLY WHEN RESULTS EXIST) ── */}
        {entries && entries.length > 0 && (
          <div style={{
            padding: "8px 12px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px"
          }}>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
              {entries.length} {entries.length === 1 ? "wall" : "walls"} calculated
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={handleSaveToMSSQL}
                disabled={isSaving}
                style={{
                  padding: "4px 10px",
                  background: saveStatus === "success" ? "#15803d" : (saveStatus === "error" ? "#b91c1c" : "#1e293b"),
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "10.5px",
                  fontWeight: "700",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                  opacity: isSaving ? 0.7 : 1,
                  transition: "all 0.2s ease"
                }}
              >
                {isSaving ? "⏳ Saving..." : (saveStatus === "success" ? "✓ Saved!" : (saveStatus === "error" ? "❌ Error" : "💾 Save"))}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}