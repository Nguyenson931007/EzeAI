import React, { useState, useEffect, useMemo } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { useCatalog, catalogByGroup, canonicalProductValue } from "@/utils/catalogHelpers";

export default function TimberPostsTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  activeJobNumber
}) {
  const {
    user,
    currentJobId,
    currentProjectName
  } = useAppModel ? useAppModel() : {};

  const activeCustomerShortName = getActiveClientShortName();
  const { items: catalogItems } = useCatalog(activeCustomerShortName, "beams-posts");

  const currentUserUpdate = user?.username || user?.name || (typeof window !== "undefined" && localStorage.getItem("user") ? JSON.parse(localStorage.getItem("user") || "{}")?.username : null) || "admin";

  const dynamicTypes = useMemo(() => {
    const groups = Array.from(new Set(catalogItems.map(i => i.groupKey).filter(Boolean)));
    return groups.length > 0 ? ["Please Select", ...groups] : [
      "Please Select",
      "HWD",
      "HWD F14",
      "MERBAU GL17 FJL POST",
      "PINE POST LOSP H3 FJ PRIMED",
      "POST LAMINATED MERBAU"
    ];
  }, [catalogItems]);

  const POST_TYPE_OPTIONS = dynamicTypes;

  const POST_SIZE_OPTIONS = [
    "Please Select",
    "90x90",
    "100x100",
    "115x115",
    "135x135",
    "140x140",
    "190x190"
  ];

  const [postType, setPostType] = useState("Please Select");
  const [postHeight, setPostHeight] = useState("");
  const [postSize, setPostSize] = useState("Please Select");
  const [postProduct, setPostProduct] = useState("Auto select by height");
  const [postQty, setPostQty] = useState("1");
  const [galSupports, setGalSupports] = useState("0");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const [isSection1Open, setIsSection1Open] = useState(false);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Tự động tải dữ liệu đã lưu từ MSSQL TimberPosts ──
  useEffect(() => {
    async function loadExistingSavedPosts() {
      if (entries && entries.length > 0) return;
      try {
        const res = await ApiService.fetchTimberPostsJobs();
        if (res && res.data) {
          const target = String(currentProjectName || currentJobId || activeJobNumber || "").trim().toLowerCase();
          const matchedJob = res.data.find(j => {
            const jn = String(j.job_number || "").trim().toLowerCase();
            const hw = String(j.IDJob_HW || j.hw_id || "").trim().toLowerCase();
            return (jn && jn === target) || (hw && hw === target);
          });
          if (matchedJob && matchedJob.posts && matchedJob.posts.length > 0 && onSetEntries) {
            const loaded = matchedJob.posts.map((p, idx) => ({
              id: p.id || `tp-loaded-${Date.now()}-${idx}`,
              postType: p.post_type || "HWD",
              postHeight: p.post_height ? (String(p.post_height).includes("mm") ? p.post_height : `${p.post_height} mm`) : "2700 mm",
              postSize: p.post_size || "90x90",
              post: p.post || `${p.post_type || "HWD"} ${p.post_size || "90x90"} @ ${p.post_height || "2700mm"}`,
              qty: p.qty || 1,
              galPostSupports: p.gal_post_supports !== undefined ? String(p.gal_post_supports) : "0"
            }));
            onSetEntries(loaded);
          }
        }
      } catch (e) {
        console.error("Auto load existing TimberPosts error:", e);
      }
    }
    loadExistingSavedPosts();
  }, [currentProjectName, currentJobId, activeJobNumber, onSetEntries]);

  const handleSaveInlineEdit = (id) => {
    const qty = parseInt(editRowData.qty, 10) || 1;
    const h = editRowData.postHeight || "2700";

    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData,
      postType: editRowData.postType || item.postType || "HWD",
      postHeight: editRowData.postHeight ? (String(editRowData.postHeight).includes("mm") ? editRowData.postHeight : `${h} mm`) : item.postHeight,
      postSize: editRowData.postSize || item.postSize || "90x90",
      post: editRowData.post || item.post,
      qty,
      galPostSupports: editRowData.galPostSupports !== undefined ? String(editRowData.galPostSupports) : (item.galPostSupports || "0")
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  const getSelectedStockDescription = () => {
    if (postType === "Please Select" || !postHeight) {
      return "Select type, size and enter post height.";
    }
    const size = postSize !== "Please Select" ? postSize : "90x90";
    return `${postType} ${size} @ ${postHeight}mm Post`;
  };

  const handleAddPost = () => {
    const h = postHeight || "2700";
    const qty = parseInt(postQty, 10) || 1;
    const type = postType !== "Please Select" ? postType : "HWD";
    const size = postSize !== "Please Select" ? postSize : "90x90";
    const stock = getSelectedStockDescription();
    const prod = postProduct !== "Auto select by height" ? postProduct : stock;
    const gal = galSupports !== "" ? String(galSupports).trim() : "0";

    const newEntry = {
      id: "post-" + Date.now() + "-" + Math.random().toString(36).substring(2, 5),
      postType: type,
      postHeight: String(h).includes("mm") ? h : `${h} mm`,
      postSize: size,
      post: prod !== "Select type, size and enter post height." ? prod : `${type} ${size} @ ${h}mm Post`,
      qty: qty,
      galPostSupports: gal
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
    setPostHeight("");
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
  };

  // ── Lưu danh sách TimberPosts vào MSSQL [ProcurementApp].[dbo].[TimberPosts] ──
  const handleSaveToDatabase = async () => {
    if (!entries || entries.length === 0) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const jobId = currentProjectName || currentJobId || activeJobNumber || (typeof window !== "undefined" ? (localStorage.getItem("currentJobId") || localStorage.getItem("current_hw_id")) : "");
      if (!jobId) {
        console.warn("Chưa chọn Job để lưu TimberPosts");
      }

      const payload = {
        user_update: currentUserUpdate,
        jobs: [{
          id_job_hw: jobId || "default",
          posts: entries.map(e => ({
            post_type: e.postType || e.type || "HWD",
            post_height: e.postHeight || e.height || "2700 mm",
            post_size: e.postSize || e.size || "90x90",
            post: e.post || e.stock || `${e.postType || "HWD"} ${e.postSize || "90x90"} @ ${e.postHeight || "2700mm"}`,
            qty: parseInt(String(e.qty || 1).replace("pcs", "").trim(), 10) || 1,
            gal_post_supports: String(e.galPostSupports !== undefined ? e.galPostSupports : (e.gal_post_supports || "0")).trim()
          }))
        }]
      };

      const res = await ApiService.saveTimberPostsJobs(payload);
      if (res && res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        alert(res?.detail || res?.message || "Lỗi khi lưu dữ liệu TimberPosts.");
      }
    } catch (err) {
      console.error("Save TimberPosts error:", err);
      alert("Lỗi khi lưu TimberPosts: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── CARD 1: TIMBER AND POST ── */}
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
          <span>1. Timber and Post</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection1Open ? "▲" : "▼"}
          </span>
        </div>

        {isSection1Open && (
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
            
            {/* ROW 1: Post Type & Post Height */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ flex: "1.4 1 140px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Post Type</span>
                <select
                  value={postType}
                  onChange={(e) => setPostType(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {POST_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div style={{ flex: "1 1 110px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700 }}>Post Height</span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>mm</span>
                </div>
                <input
                  type="number"
                  placeholder="Required"
                  value={postHeight}
                  onChange={(e) => setPostHeight(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                />
              </div>
            </div>

            {/* ROW 2: Post Size & Post */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 120px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Post Size</span>
                <select
                  value={postSize}
                  onChange={(e) => setPostSize(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  {POST_SIZE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div style={{ flex: "1.8 1 180px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Post</span>
                <select
                  value={postProduct}
                  onChange={(e) => setPostProduct(e.target.value)}
                  className="task-field-select"
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1" }}
                >
                  <option value="Auto select by height">Auto select by height</option>
                  <option value="90x90 Solid Post @ 2.4m">90x90 Solid Post @ 2.4m</option>
                  <option value="90x90 Solid Post @ 2.7m">90x90 Solid Post @ 2.7m</option>
                  <option value="90x90 Solid Post @ 3.0m">90x90 Solid Post @ 3.0m</option>
                  <option value="115x115 Hardwood Post @ 3.0m">115x115 Hardwood Post @ 3.0m</option>
                </select>
              </div>
            </div>

            {/* ROW 3: Qty, Gal Post Supports & + Add post button */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ flex: "0.8 1 80px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Qty</span>
                <input
                  type="number"
                  value={postQty}
                  onChange={(e) => setPostQty(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #fde047", background: "#fffbeb", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ flex: "1.2 1 120px" }}>
                <span style={{ fontSize: "10.5px", color: "#475569", fontWeight: 700, display: "block", marginBottom: "4px" }}>Gal Post Supports</span>
                <input
                  type="number"
                  value={galSupports}
                  onChange={(e) => setGalSupports(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", fontSize: "10.5px", borderRadius: "5px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                />
              </div>

              <button
                type="button"
                onClick={handleAddPost}
                style={{
                  padding: "7px 16px",
                  background: "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                + Add post
              </button>
            </div>

            {/* ROW 4: Helper Box */}
            <div style={{
              padding: "8px 12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "11px",
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span style={{ fontWeight: 700, color: "#475569" }}>Selected post:</span>
              <span>{getSelectedStockDescription()}</span>
            </div>

          </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED TIMBER POSTS ── */}
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
          <span>2. Entered timber posts ({(entries || []).length})</span>
        </div>

        <div style={{ padding: "8px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px" }}>
                <thead>
                  <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px", width: "24px" }}>#</th>
                    <th style={{ padding: "6px 8px", minWidth: "90px" }}>Post Type</th>
                    <th style={{ padding: "6px 8px", width: "80px" }}>Post Height</th>
                    <th style={{ padding: "6px 8px", width: "75px" }}>Post Size</th>
                    <th style={{ padding: "6px 8px", minWidth: "160px" }}>Post</th>
                    <th style={{ padding: "6px 8px", width: "45px", textAlign: "center" }}>Qty</th>
                    <th style={{ padding: "6px 8px", width: "95px", textAlign: "center" }}>Gal Post Supports</th>
                    <th style={{ padding: "6px 8px", textAlign: "right", width: "45px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(entries || []).map((item, idx) => {
                    const isRowEditing = editingRowId === item.id;
                    const pType = item.postType || item.type || "HWD";
                    const pHeight = item.postHeight || item.height || "2700 mm";
                    const pSize = item.postSize || item.size || "90x90";
                    const pPost = item.post || item.stock || `${pType} ${pSize} @ ${pHeight}`;
                    const pQty = item.qty !== undefined ? item.qty : 1;
                    const pGal = item.galPostSupports !== undefined ? item.galPostSupports : (item.gal_post_supports || "0");

                    return (
                      <tr key={item.id || idx} style={{ borderBottom: "1px solid #e2e8f0", background: isRowEditing ? "#fef3c7" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc") }}>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>{idx + 1}</td>

                        {/* Post Type */}
                        <td style={{ padding: "4px 8px" }}>
                          {isRowEditing ? (
                            <select
                              value={editRowData.postType || pType}
                              onChange={(e) => setEditRowData({ ...editRowData, postType: e.target.value })}
                              style={{ width: "100%", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                            >
                              {POST_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <span style={{ fontWeight: 600 }}>{pType}</span>
                          )}
                        </td>

                        {/* Post Height */}
                        <td style={{ padding: "4px 8px" }}>
                          {isRowEditing ? (
                            <input
                              type="text"
                              value={editRowData.postHeight || pHeight}
                              onChange={(e) => setEditRowData({ ...editRowData, postHeight: e.target.value })}
                              style={{ width: "65px", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                            />
                          ) : (
                            <span>{pHeight}</span>
                          )}
                        </td>

                        {/* Post Size */}
                        <td style={{ padding: "4px 8px" }}>
                          {isRowEditing ? (
                            <select
                              value={editRowData.postSize || pSize}
                              onChange={(e) => setEditRowData({ ...editRowData, postSize: e.target.value })}
                              style={{ width: "100%", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                            >
                              {POST_SIZE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <span>{pSize}</span>
                          )}
                        </td>

                        {/* Post */}
                        <td style={{ padding: "4px 8px", minWidth: "160px" }}>
                          {isRowEditing ? (
                            <input
                              type="text"
                              value={editRowData.post || pPost}
                              onChange={(e) => setEditRowData({ ...editRowData, post: e.target.value })}
                              style={{ width: "100%", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                            />
                          ) : (
                            <span style={{ fontSize: "10.5px", color: "#1e293b" }}>{pPost}</span>
                          )}
                        </td>

                        {/* Qty */}
                        <td style={{ padding: "4px 8px", textAlign: "center" }}>
                          {isRowEditing ? (
                            <input
                              type="number"
                              value={editRowData.qty !== undefined ? editRowData.qty : pQty}
                              onChange={(e) => setEditRowData({ ...editRowData, qty: e.target.value })}
                              style={{ width: "40px", padding: "2px 4px", fontSize: "10px", textAlign: "center", borderRadius: "3px", border: "1px solid #3b82f6" }}
                            />
                          ) : (
                            <span style={{ fontWeight: 700, color: "var(--blue)" }}>{pQty}</span>
                          )}
                        </td>

                        {/* Gal Post Supports */}
                        <td style={{ padding: "4px 8px", textAlign: "center" }}>
                          {isRowEditing ? (
                            <input
                              type="number"
                              value={editRowData.galPostSupports !== undefined ? editRowData.galPostSupports : pGal}
                              onChange={(e) => setEditRowData({ ...editRowData, galPostSupports: e.target.value })}
                              style={{ width: "45px", padding: "2px 4px", fontSize: "10px", textAlign: "center", borderRadius: "3px", border: "1px solid #3b82f6" }}
                            />
                          ) : (
                            <span>{pGal}</span>
                          )}
                        </td>

                        {/* Actions: Edit / Delete */}
                        <td style={{ padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {isRowEditing ? (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSaveInlineEdit(item.id); }}
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
                                  setEditingRowId(item.id);
                                  setEditRowData({
                                    ...item,
                                    postType: pType,
                                    postHeight: String(pHeight).replace("mm", "").trim(),
                                    postSize: pSize,
                                    post: pPost,
                                    qty: pQty,
                                    galPostSupports: pGal
                                  });
                                }}
                                style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleRemoveEntry(item.id); }}
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
                      <td colSpan={8} style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}>
                        No timber posts entered. Enter post specifications above and click <strong>+ Add post</strong>.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ── ACTION BUTTONS: SAVE TO SQL ── */}
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
                  {entries.length} {entries.length === 1 ? "post" : "posts"} entered
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {saveSuccess && (
                    <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: 700 }}>
                      ✓ Saved to ProcurementApp!
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveToDatabase}
                    disabled={isSaving}
                    style={{
                      padding: "5px 12px",
                      background: saveSuccess ? "#16a34a" : "#1e293b",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "5px",
                      fontSize: "11px",
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
                    <span>{isSaving ? "⏳" : "💾"}</span>
                    <span>{isSaving ? "Saving..." : (saveSuccess ? "Saved!" : "Save")}</span>
                  </button>
                </div>
              </div>
            )}
      </div>
    </div>
  );
}