import React, { useState, useEffect, useMemo, useRef } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { useCatalog, catalogByGroup, canonicalProductValue } from "@/utils/catalogHelpers";

export default function EavesSoffitTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber
}) {
  const appModel = useAppModel ? useAppModel() : {};
  const activeCustomerShortName = getActiveClientShortName();
  const { items: catalogItems } = useCatalog(activeCustomerShortName, "eaves-soffits");

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const SHEET_BRAND_OPTIONS = ["FC", "BGC"];
  const SHEET_THICKNESS_OPTIONS = ["4.5mm", "6mm"];

  const battenCatalogItems = useMemo(() => catalogByGroup(catalogItems, "soffit_batten"), [catalogItems]);
  const beadCatalogItems = useMemo(() => catalogByGroup(catalogItems, "soffit_bead"), [catalogItems]);

  const SOFFIT_BATTEN_OPTIONS = useMemo(() => {
    if (battenCatalogItems.length > 0) {
      return battenCatalogItems.map(i => canonicalProductValue(i)).filter(Boolean);
    }
    return [];
  }, [battenCatalogItems]);

  const SOFFIT_BEAD_OPTIONS = useMemo(() => {
    if (beadCatalogItems.length > 0) {
      return beadCatalogItems.map(i => canonicalProductValue(i)).filter(Boolean);
    }
    return [];
  }, [beadCatalogItems]);

  // Material Setup State
  const [sheetBrand, setSheetBrand] = useState("FC");
  const [sheetThickness, setSheetThickness] = useState("4.5mm");
  const [soffitBatten, setSoffitBatten] = useState("");
  const [soffitBead, setSoffitBead] = useState("");

  // Keep the same raw inputs Procurement manual mode uses.
  const [inputData, setInputData] = useState({});

  const standardEavesWidths = useMemo(() => {
    if (sheetThickness === "6mm") return sheetBrand === "BGC" ? ["900"] : [];
    return ["450", "600", "750", "900"];
  }, [sheetBrand, sheetThickness]);

  const soffitLengths = useMemo(() => {
    if (sheetBrand === "FC" && sheetThickness === "6mm") return ["2400", "2700", "3000"];
    return ["1800", "2400", "2700", "3000"];
  }, [sheetBrand, sheetThickness]);

  const setInputNumber = (key, value) => {
    if (/^\d*(?:[.,]\d*)?$/.test(value)) {
      setInputData(prev => ({ ...prev, [key]: value }));
    }
  };

  useEffect(() => {
    if (SOFFIT_BATTEN_OPTIONS.length > 0 && (!soffitBatten || !SOFFIT_BATTEN_OPTIONS.includes(soffitBatten))) {
      const initial = SOFFIT_BATTEN_OPTIONS[0];
      setSoffitBatten(initial);
      if (onChange) onChange("eaves", "soffit_batten", initial);
    }
  }, [SOFFIT_BATTEN_OPTIONS]);

  useEffect(() => {
    if (SOFFIT_BEAD_OPTIONS.length > 0 && (!soffitBead || !SOFFIT_BEAD_OPTIONS.includes(soffitBead))) {
      const initial = SOFFIT_BEAD_OPTIONS[0];
      setSoffitBead(initial);
      if (onChange) onChange("eaves", "soffit_bead", initial);
    }
  }, [SOFFIT_BEAD_OPTIONS]);

  // ── Auto-load saved Eaves & Soffit entries from MSSQL if empty on job load ──
  const loadedJobRef = useRef(null);
  useEffect(() => {
    let isCancelled = false;
    const target = String(activeJobNumber || appModel?.currentProjectName || appModel?.currentJobId || "").trim().toLowerCase();
    if (!target || target === "default" || target === "testai") return;
    if (entries && entries.length > 0) return;
    if (loadedJobRef.current === target) return;
    loadedJobRef.current = target;

    async function loadFromDb() {
      try {
        const res = await ApiService.fetchEavesJobs();
        if (isCancelled) return;
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const matchedRows = res.data.filter(j => {
            const jn = String(j.job_number || "").trim().toLowerCase();
            const hw = String(j.IDJob_HW || j.hw_id || "").trim().toLowerCase();
            return (jn && jn === target) || (hw && hw === target);
          });
          if (matchedRows.length > 0 && onSetEntries) {
            const loaded = matchedRows.map((r, idx) => ({
              id: r.eaves_id ? `eave-${r.eaves_id}` : `eave-loaded-${Date.now()}-${idx}`,
              brand: r.sheet_brand || "FC",
              thickness: r.sheet_thickness || "4.5mm",
              batten: r.sofit_batten || "",
              bead: r.sofit_bead || "",
              inputData: r.input_data || {}
            }));
            onSetEntries(loaded);
          }
        }
      } catch (err) {
        console.warn("Could not auto-load Eaves from DB:", err);
      }
    }

    loadFromDb();
    return () => { isCancelled = true; };
  }, [activeJobNumber, appModel?.currentProjectName, appModel?.currentJobId, entries, onSetEntries]);

  // Inline editing state for Card 2
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});
  const [isSection1Open, setIsSection1Open] = useState(true);
  const [isSection2Open, setIsSection2Open] = useState(true);
  const [openSections, setOpenSections] = useState({
    spec: true,
    standard: true,
    soffit: true,
    extras: true
  });

  const toggleSubSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleResetData = () => {
    setSheetBrand("FC");
    setSheetThickness("4.5mm");
    if (SOFFIT_BATTEN_OPTIONS.length > 0) setSoffitBatten(SOFFIT_BATTEN_OPTIONS[0]);
    if (SOFFIT_BEAD_OPTIONS.length > 0) setSoffitBead(SOFFIT_BEAD_OPTIONS[0]);
    setInputData({});
  };

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
        console.warn("Chưa chọn Job để lưu Eaves Soffit");
      }

      const payload = {
        user_update: currentUsername || "admin",
        jobs: [
          {
            id_job_hw: String(savedJobId || appModel?.currentProjectName || "default"),
            eaves: (entries && entries.length > 0) ? entries.map(e => ({
              sheet_brand: e.brand || e.sheetBrand || sheetBrand || "FC",
              sheet_thickness: e.thickness || e.sheetThickness || sheetThickness || "4.5mm",
              sofit_batten: e.batten || e.soffitBatten || soffitBatten || (SOFFIT_BATTEN_OPTIONS.length > 0 ? SOFFIT_BATTEN_OPTIONS[0] : "42x19 H3 Treated Pine Batten"),
              sofit_bead: e.bead || e.soffitBead || soffitBead || (SOFFIT_BEAD_OPTIONS.length > 0 ? SOFFIT_BEAD_OPTIONS[0] : "4.5mm PVC Joint Mould"),
              short_name: activeCustomerShortName || "BUN-NSW-ACT",
              input_data: e.inputData || e.input_data || inputData || {}
            })) : [
              {
                sheet_brand: sheetBrand || "FC",
                sheet_thickness: sheetThickness || "4.5mm",
                sofit_batten: soffitBatten || (SOFFIT_BATTEN_OPTIONS.length > 0 ? SOFFIT_BATTEN_OPTIONS[0] : "42x19 H3 Treated Pine Batten"),
                sofit_bead: soffitBead || (SOFFIT_BEAD_OPTIONS.length > 0 ? SOFFIT_BEAD_OPTIONS[0] : "4.5mm PVC Joint Mould"),
                short_name: activeCustomerShortName || "BUN-NSW-ACT",
                input_data: inputData || {}
              }
            ]
          }
        ]
      };

      const res = await ApiService.saveEavesJobs(payload);
      if (res && res.success) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus(null), 3500);
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      console.error("Lỗi khi lưu Eaves vào MSSQL:", err);
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddEave = () => {
    const newEntry = {
      id: "eave-" + Date.now(),
      brand: sheetBrand,
      thickness: sheetThickness,
      batten: soffitBatten,
      bead: soffitBead,
      inputData: { ...inputData }
    };

    if (onSetEntries) {
      onSetEntries(prev => [...(prev || []), newEntry]);
    }
  };

  const handleRemoveEntry = (id) => {
    if (onSetEntries) {
      onSetEntries(prev => (prev || []).filter(e => e.id !== id));
    }
    if (selectedEntryId === id) setSelectedEntryId(null);
  };

  const handleSaveInlineEdit = (id) => {
    const updatedList = (entries || []).map(item => item.id === id ? {
      ...item,
      ...editRowData
    } : item);

    if (onSetEntries) onSetEntries(updatedList);
    setEditingRowId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* ── CARD 1: MATERIAL SETUP ── */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span>1. Material setup</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleResetData(); }}
              style={{
                background: "#ffffff",
                border: "1px solid #fca5a5",
                color: "#b91c1c",
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "5px",
                cursor: "pointer"
              }}
            >
              Reset data
            </button>
            {onAddDataAI && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAddDataAI("eaves"); }}
                style={{
                  background: "#ffffff",
                  border: "1px solid #93c5fd",
                  color: "#1d4ed8",
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "5px",
                  cursor: "pointer"
                }}
              >
                + Add data AI
              </button>
            )}
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              {isSection1Open ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {isSection1Open && (
          <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Subsection 1: Specification */}
            <div>
              <div
                onClick={() => toggleSubSection("spec")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  padding: "2px 0",
                  marginBottom: openSections.spec ? "6px" : "0",
                  userSelect: "none"
                }}
              >
                <span style={{ fontSize: "10.5px", color: "#0f2744", fontWeight: 700 }}>1. Eaves specification</span>
                <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>
                  {openSections.spec ? "▲ Collapse" : "▼ Expand"}
                </span>
              </div>

              {openSections.spec && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {/* Row 1: Brand & Thickness */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px" }}>Sheet brand</span>
                      <select
                        value={sheetBrand}
                        onChange={(e) => {
                          setSheetBrand(e.target.value);
                          if (onChange) onChange("eaves", "sheet_brand", e.target.value);
                        }}
                        className="task-field-select"
                        style={{ width: "100%", height: "25px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        {SHEET_BRAND_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>

                    <div>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px" }}>Sheet thickness</span>
                      <select
                        value={sheetThickness}
                        onChange={(e) => {
                          setSheetThickness(e.target.value);
                          if (onChange) onChange("eaves", "sheet_thickness", e.target.value);
                        }}
                        className="task-field-select"
                        style={{ width: "100%", height: "25px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        {SHEET_THICKNESS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Soffit Batten & Soffit Bead */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px" }}>Soffit batten</span>
                      <select
                        value={soffitBatten}
                        onChange={(e) => {
                          setSoffitBatten(e.target.value);
                          if (onChange) onChange("eaves", "soffit_batten", e.target.value);
                        }}
                        className="task-field-select"
                        style={{ width: "100%", height: "25px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        {SOFFIT_BATTEN_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>

                    <div>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px" }}>Soffit bead</span>
                      <select
                        value={soffitBead}
                        onChange={(e) => {
                          setSoffitBead(e.target.value);
                          if (onChange) onChange("eaves", "soffit_bead", e.target.value);
                        }}
                        className="task-field-select"
                        style={{ width: "100%", height: "25px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      >
                        {SOFFIT_BEAD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Subsection 2: Standard eaves */}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
              <div
                onClick={() => toggleSubSection("standard")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  padding: "2px 0",
                  marginBottom: openSections.standard ? "6px" : "0",
                  userSelect: "none"
                }}
              >
                <span style={{ fontSize: "10.5px", color: "#0f2744", fontWeight: 700 }}>2. Standard eaves</span>
                <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>
                  {openSections.standard ? "▲ Collapse" : "▼ Expand"}
                </span>
              </div>

              {openSections.standard && (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${standardEavesWidths.length || 4}, minmax(0, 1fr))`, gap: "6px" }}>
                  {standardEavesWidths.map(width => (
                    <div key={`eaves-${width}`}>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {width}mm · Lm
                      </span>
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={inputData[`eaves_${width}`] ?? ""}
                        onChange={(e) => setInputNumber(`eaves_${width}`, e.target.value)}
                        style={{ width: "100%", height: "24px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subsection 3: Soffit lengths */}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
              <div
                onClick={() => toggleSubSection("soffit")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  padding: "2px 0",
                  marginBottom: openSections.soffit ? "6px" : "0",
                  userSelect: "none"
                }}
              >
                <span style={{ fontSize: "10.5px", color: "#0f2744", fontWeight: 700 }}>3. Soffit lengths</span>
                <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>
                  {openSections.soffit ? "▲ Collapse" : "▼ Expand"}
                </span>
              </div>

              {openSections.soffit && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {["single", "double", "multi"].map(kind => (
                    <div key={kind} style={{ marginBottom: kind === "multi" ? "0" : "2px" }}>
                      <span style={{ fontSize: "9.5px", color: "#475569", fontWeight: 600, display: "block", marginBottom: "2px", textTransform: "capitalize" }}>
                        {kind} sheet
                      </span>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${soffitLengths.length || 4}, minmax(0, 1fr))`, gap: "6px" }}>
                        {soffitLengths.map(length => (
                          <div key={`${kind}-${length}`}>
                            <span style={{ fontSize: "9px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {kind === "double" ? Number(length) * 2 : length}mm · Lm
                            </span>
                            <input
                              inputMode="decimal"
                              placeholder="0"
                              value={inputData[`${kind}_${length}`] ?? ""}
                              onChange={(e) => setInputNumber(`${kind}_${length}`, e.target.value)}
                              style={{ width: "100%", height: "24px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subsection 4: Extras */}
            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
              <div
                onClick={() => toggleSubSection("extras")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  padding: "2px 0",
                  marginBottom: openSections.extras ? "6px" : "0",
                  userSelect: "none"
                }}
              >
                <span style={{ fontSize: "10.5px", color: "#0f2744", fontWeight: 700 }}>4. Extras</span>
                <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>
                  {openSections.extras ? "▲ Collapse" : "▼ Expand"}
                </span>
              </div>

              {openSections.extras && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px" }}>
                  {[
                    ["extra_batten", "Extra battens · Lm"],
                    ["extra_bead", "Extra bead · Lm"],
                    ["metal_batten_m2", "Metal battens @450c · m²"]
                  ].map(([key, label]) => (
                    <div key={key}>
                      <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600, display: "block", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {label}
                      </span>
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={inputData[key] ?? ""}
                        onChange={(e) => setInputNumber(key, e.target.value)}
                        style={{ width: "100%", height: "24px", padding: "2px 6px", fontSize: "10px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Button */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "2px" }}>
              <button
                type="button"
                onClick={handleAddEave}
                style={{
                  padding: "5px 14px",
                  background: "#1e3a5f",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                + Add Eave
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── CARD 2: ENTERED EAVES ── */}
      <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden" }}>
        <div
          onClick={() => setIsSection2Open(!isSection2Open)}
          style={{
            padding: "10px 14px",
            background: "#f8fafc",
            borderBottom: isSection2Open ? "1px solid #e2e8f0" : "none",
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
          <span>2. Entered Eaves ({(entries || []).length})</span>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
            {isSection2Open ? "▲" : "▼"}
          </span>
        </div>

        {isSection2Open && (
          <>
            <div style={{ padding: "8px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            <thead>
              <tr style={{ background: "#1e293b", color: "#ffffff", textAlign: "left" }}>
                <th style={{ padding: "5px 6px" }}>#</th>
                <th style={{ padding: "5px 6px" }}>Brand</th>
                <th style={{ padding: "5px 6px" }}>Thick</th>
                <th style={{ padding: "5px 6px" }}>Soffit Batten</th>
                <th style={{ padding: "5px 6px" }}>Soffit Bead</th>
                <th style={{ padding: "5px 6px", textAlign: "right", width: "45px" }}></th>
              </tr>
            </thead>
            <tbody>
              {(entries || []).map((item, idx) => {
                const isSelected = selectedEntryId === item.id;
                const isRowEditing = editingRowId === item.id;

                return (
                  <tr
                    key={item.id || idx}
                    onClick={() => {
                      if (!isRowEditing) {
                        const nextSelected = isSelected ? null : item.id;
                        setSelectedEntryId(nextSelected);
                        if (!isSelected) {
                          setSheetBrand(item.brand || "FC");
                          setSheetThickness(item.thickness || "4.5mm");
                          setSoffitBatten(item.batten || "");
                          setSoffitBead(item.bead || "");
                          setInputData({ ...(item.inputData || item.input_data || {}) });
                        }
                        if (onSelectEntry) onSelectEntry(isSelected ? null : item);
                      }
                    }}
                    style={{
                      borderBottom: "1px solid #e2e8f0",
                      background: isRowEditing ? "#fef3c7" : (isSelected ? "#dbeafe" : (idx % 2 === 0 ? "#ffffff" : "#f8fafc")),
                      cursor: isRowEditing ? "default" : "pointer",
                      outline: isSelected ? "2px solid #3b82f6" : "none",
                      outlineOffset: "-1px",
                      transition: "background 0.15s ease"
                    }}
                  >
                    <td style={{ padding: "5px 6px", fontWeight: 700 }}>{idx + 1}</td>

                    {/* Brand */}
                    <td style={{ padding: "5px 6px" }}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.brand || item.brand}
                          onChange={(e) => setEditRowData({ ...editRowData, brand: e.target.value })}
                          style={{ padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                        >
                          {SHEET_BRAND_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        item.brand || "FC"
                      )}
                    </td>

                    {/* Thickness */}
                    <td style={{ padding: "5px 6px" }}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.thickness || item.thickness}
                          onChange={(e) => setEditRowData({ ...editRowData, thickness: e.target.value })}
                          style={{ padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                        >
                          {SHEET_THICKNESS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        item.thickness || "4.5mm"
                      )}
                    </td>

                    {/* Batten */}
                    <td style={{ padding: "5px 6px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.batten}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.batten || item.batten}
                          onChange={(e) => setEditRowData({ ...editRowData, batten: e.target.value })}
                          style={{ maxWidth: "120px", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                        >
                          {SOFFIT_BATTEN_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        item.batten
                      )}
                    </td>

                    {/* Bead */}
                    <td style={{ padding: "5px 6px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.bead}>
                      {isRowEditing ? (
                        <select
                          value={editRowData.bead || item.bead}
                          onChange={(e) => setEditRowData({ ...editRowData, bead: e.target.value })}
                          style={{ maxWidth: "120px", padding: "2px 4px", fontSize: "10px", borderRadius: "3px", border: "1px solid #3b82f6" }}
                        >
                          {SOFFIT_BEAD_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        item.bead
                      )}
                    </td>

                    {/* Actions: Edit & Remove */}
                    <td style={{ padding: "5px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
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
                              setEditRowData({ ...item });
                            }}
                            style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", fontSize: "11px", padding: "0 2px" }}
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
                  <td colSpan={6} style={{ padding: "12px", textAlign: "center", color: "#94a3b8" }}>
                    No eaves entered. Select materials above and click <b>+ Add Eave</b>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Action button if results exist */}
        {(entries || []).length > 0 && (
          <div style={{
            padding: "8px 12px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
              {(entries || []).length} eave{(entries || []).length > 1 ? "s" : ""} configured
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {saveStatus === "success" && (
                <span style={{ color: "#16a34a", fontSize: "11px", fontWeight: 700 }}>
                  ✓ Saved to MSSQL!
                </span>
              )}
              {saveStatus === "error" && (
                <span style={{ color: "#dc2626", fontSize: "11px", fontWeight: 700 }}>
                  ✕ Save failed
                </span>
              )}
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveToMSSQL}
                style={{
                  padding: "5px 12px",
                  background: isSaving ? "#64748b" : "#1e293b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: isSaving ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <span>💾</span>
                <span>{isSaving ? "Saving..." : "Save"}</span>
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}