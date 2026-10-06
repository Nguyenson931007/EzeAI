import React, { useState, useEffect } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { useCatalog } from "@/utils/catalogHelpers";
import { normalizeFloorLevel } from "@/utils/procurementAutoFill";
import { resolveDropdownValue } from "@/utils/dropdownValueGuard";
import EnteredTaskActions from "@/components/shared/EnteredTaskActions";
import DimensionPair from "@/components/shared/forms/DimensionPair";
import { TaskRowNumber } from "./TaskUi";

export default function HardiesFireWallsTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onClearData,
  onSelectEntry,
  activeJobNumber,
  selectedWall,
  selectedWallIds = [],
  selectedId,
  selectedType
}) {
  const appModel = useAppModel ? useAppModel() : {};
  const activeCustomerShortName = getActiveClientShortName();

  const hardiesCacheKey = React.useMemo(() => {
    const jobKey = String(activeJobNumber || appModel?.currentJobId || appModel?.currentProjectName || "default").trim() || "default";
    const unitKey = String(appModel?.activeWorkPackUnit || "Unit 1").trim() || "Unit 1";
    return `ezefloor_hardies_fire_walls_v2_${encodeURIComponent(jobKey)}_${encodeURIComponent(unitKey)}`;
  }, [activeJobNumber, appModel?.currentJobId, appModel?.currentProjectName, appModel?.activeWorkPackUnit]);

  // Catalog items if available under hardies or cladding or fire-walls
  const { items: catalogItems } = useCatalog(activeCustomerShortName, "hardies-fire-walls");

  // Local state when external state setter isn't passed
  const [localEntries, setLocalEntries] = useState([]);
  const wallEntries = typeof onSetEntries === "function"
    ? (Array.isArray(entries) ? entries : [])
    : localEntries;

  const setEntries = (updater) => {
    if (typeof onSetEntries === "function") {
      onSetEntries(updater);
    } else {
      setLocalEntries(updater);
    }
  };

  // ── SPECIFICATION PRESETS ──
  const SYSTEM_TYPE_OPTIONS = [
    "HardieSmart™ Boundary Wall System (FRL 60/60/60)",
    "HardieSmart™ Zero Lot Line System (FRL 60/60/60)",
    "HardieSmart™ Blade Wall System (FRL 60/60/60)",
    "HardieFire™ Intertenancy Wall (FRL 90/90/90)",
    "HardieFire™ Shaft Liner Barrier (FRL 120/120/120)",
    "HardieSmart™ Non-combustible Boundary System",
    "Custom Fire-Rated Wall System"
  ];

  const LINING_SPEC_OPTIONS = [
    "8.5mm HardieFire™ Mineral Wool + 6mm Villaboard™",
    "16mm HardieSmart™ Fire Board",
    "10mm HardiePanel™ Compressed Sheet",
    "10mm Gyprock Fyrechek™ + 16mm HardieFire™",
    "13mm Fire-rated Plasterboard + 9mm HardieFlex™",
    "9mm HardiePlank™ Fire Rated System",
    "8.5mm HardieFire™ Insulation Only"
  ];

  const FRAMING_OPTIONS = [
    "90mm Timber Studs @ 450mm crs",
    "90mm Timber Studs @ 600mm crs",
    "92mm Steel Studs @ 450mm crs",
    "92mm Steel Studs @ 600mm crs",
    "70mm Timber Studs @ 450mm crs"
  ];

  const SEALANT_OPTIONS = [
    "Fire Mastic / Acoustic Sealant (310ml cartridge)",
    "HardieFire™ Joint Sealant (600ml sausage)",
    "Intumescent Fire Strip & Sealant"
  ];

  const ANGLE_OPTIONS = [
    "50x50x0.7mm Galv Aluminum Fire Angle",
    "HardieSmart™ Aluminum Perimeter Extrusion",
    "Standard Steel Track & Angle"
  ];

  // ── SETUP STATES ──
  const [defaultSystem, setDefaultSystem] = useState(SYSTEM_TYPE_OPTIONS[0]);
  const [defaultLining, setDefaultLining] = useState(LINING_SPEC_OPTIONS[0]);
  const [defaultFraming, setDefaultFraming] = useState(FRAMING_OPTIONS[0]);
  const [defaultSealant, setDefaultSealant] = useState(SEALANT_OPTIONS[0]);
  const [defaultAngle, setDefaultAngle] = useState(ANGLE_OPTIONS[0]);

  // ── QUICK ENTRY FORM STATES ──
  const [locationName, setLocationName] = useState("");
  const [wallLength, setWallLength] = useState("");
  const [wallHeight, setWallHeight] = useState("2.70");
  const [notes, setNotes] = useState("");

  // ── UI COLLAPSIBLE STATES ──
  const [isSpecOpen, setIsSpecOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // ── INLINE EDITING ──
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

  // ── SAVING STATE ──
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  // ── Auto-load from DB: read-only / edit mode ──
  const [dataSource, setDataSource] = useState(null);       // "db" | "local" | null
  const [isReadOnly, setIsReadOnly] = useState(false);

  // Generated/GPT/cache rows may only contain values exposed by these task dropdowns.
  useEffect(() => {
    if (!wallEntries.length) return;
    let changed = false;
    const next = wallEntries.map((row) => {
      const isGenerated = row?.ai_generated || row?.generatedByAI || row?.generated_by === "gpt" || String(row?.autofill_source || "").includes("drawing");
      if (!isGenerated) return row;
      const systemType = resolveDropdownValue(row?.systemType || row?.system_type, SYSTEM_TYPE_OPTIONS, { fallback: "" });
      const liningSpec = resolveDropdownValue(row?.liningSpec || row?.lining_spec, LINING_SPEC_OPTIONS, { fallback: "" });
      const framing = resolveDropdownValue(row?.framing, FRAMING_OPTIONS, { fallback: "" });
      const sealant = resolveDropdownValue(row?.sealant, SEALANT_OPTIONS, { fallback: "" });
      const angle = resolveDropdownValue(row?.angle, ANGLE_OPTIONS, { fallback: "" });
      const same = systemType === (row?.systemType || row?.system_type || "")
        && liningSpec === (row?.liningSpec || row?.lining_spec || "")
        && framing === (row?.framing || "")
        && sealant === (row?.sealant || "")
        && angle === (row?.angle || "");
      if (same) return row;
      changed = true;
      return { ...row, systemType, liningSpec, framing, sealant, angle };
    });
    if (changed) setEntries(next);
  }, [wallEntries]);

  // ── LOAD SAVED DATA FROM LOCALSTORAGE ON MOUNT ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem(hardiesCacheKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && (!entries || entries.length === 0)) {
          setEntries(parsed);
          setDataSource("db");
          setIsReadOnly(true);
        }
      }
    } catch (e) {
      console.warn("Could not load cached Hardies Fire Walls:", e);
    }
  }, [hardiesCacheKey]);

  // ── SYNC SELECTED WALL FROM CANVAS IF USER CLICKS "Use Selected Wall" ──
  const handleUseSelectedWall = () => {
    if (!selectedWall) {
      alert("Please select a wall on the drawing canvas first.");
      return;
    }

    let lengthM = 0;
    if (selectedWall.centerline && selectedWall.centerline.length === 2) {
      const p1 = selectedWall.centerline[0];
      const p2 = selectedWall.centerline[1];
      const realScale = appModel?.realScale || 20; // px to mm
      const lenPx = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const lenMm = lenPx * realScale;
      lengthM = lenMm / 1000;
    } else if (selectedWall.length) {
      lengthM = Number(selectedWall.length) > 100 ? Number(selectedWall.length) / 1000 : Number(selectedWall.length);
    }

    const heightMm = Number(selectedWall.height || selectedWall.wall_height) || 2700;
    const heightM = heightMm > 100 ? heightMm / 1000 : heightMm;

    const name = selectedWall.name || selectedWall.label || (selectedWall.type ? `${selectedWall.type} Wall` : "Boundary Wall");
    setLocationName(name);
    setWallLength(lengthM > 0 ? lengthM.toFixed(2) : "");
    setWallHeight(heightM > 0 ? heightM.toFixed(2) : "2.70");
  };

  // ── ADD ENTRY ──
  const handleAddEntry = (e) => {
    e?.preventDefault();
    const l = parseFloat(String(wallLength).replace(/[^\d.]/g, "")) || 0;
    const h = parseFloat(String(wallHeight).replace(/[^\d.]/g, "")) || 2.70;

    if (l <= 0) {
      alert("Please enter a valid wall length greater than 0.");
      return;
    }

    const newEntry = {
      id: `hfw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      wallId: selectedWall?.id || null,
      floorLevel: selectedWall?.floorLevel || selectedWall?.floor_level || normalizeFloorLevel(appModel?.pages?.[appModel?.currentPage], appModel?.currentPage || 0),
      location: locationName.trim() || `Fire Wall ${wallEntries.length + 1}`,
      length: l.toFixed(2),
      height: h.toFixed(2),
      systemType: defaultSystem,
      liningSpec: defaultLining,
      framing: defaultFraming,
      sealant: defaultSealant,
      angle: defaultAngle,
      notes: notes.trim()
    };

    const updated = [...wallEntries, newEntry];
    setEntries(updated);

    // Save to local cache
    try {
      localStorage.setItem(hardiesCacheKey, JSON.stringify(updated));
    } catch (_) {}

    // Reset inputs
    setLocationName("");
    setWallLength("");
    setNotes("");
  };

  // ── DELETE ENTRY ──
  const handleDeleteEntry = (id) => {
    const updated = wallEntries.filter((w) => w.id !== id);
    setEntries(updated);
    try {
      localStorage.setItem(hardiesCacheKey, JSON.stringify(updated));
    } catch (_) {}
  };

  // ── DUPLICATE ENTRY ──
  const handleDuplicateEntry = (item) => {
    const dup = {
      ...item,
      id: `hfw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      location: `${item.location} (Copy)`
    };
    const updated = [...wallEntries, dup];
    setEntries(updated);
    try {
      localStorage.setItem(hardiesCacheKey, JSON.stringify(updated));
    } catch (_) {}
  };

  // ── START EDITING ──
  const handleStartEdit = (item) => {
    setIsReadOnly(false);
    setEditingRowId(item.id);
    setEditRowData({ ...item });
  };

  const handleSaveEdit = () => {
    const updated = wallEntries.map((w) =>
      w.id === editingRowId
        ? { ...editRowData }
        : w
    );
    setEntries(updated);
    setEditingRowId(null);
    setEditRowData({});
    try {
      localStorage.setItem(hardiesCacheKey, JSON.stringify(updated));
    } catch (_) {}
  };

  const handleClearEntries = () => {
    try {
      localStorage.removeItem(hardiesCacheKey);
    } catch (_) {}
    onClearData?.();
  };

  // ── SAVE TO DATABASE (MSSQL / API) ──
  const handleSaveToMSSQL = async () => {
    if (wallEntries.length === 0) {
      alert("No fire wall entries to save.");
      return;
    }
    setIsSaving(true);
    setSaveStatus(null);
    try {
      let currentUsername = "";
      if (appModel?.user) {
        currentUsername = appModel.user.username || appModel.user.name || appModel.user.full_name || appModel.user.email || "";
      }
      if (!currentUsername && typeof window !== "undefined") {
        currentUsername = localStorage.getItem("username") || "admin";
      }

      const savedJobId = activeJobNumber || appModel?.currentJobId || appModel?.currentProjectName || "default";

      // Store in local cache always
      localStorage.setItem(hardiesCacheKey, JSON.stringify(wallEntries));

      if (typeof ApiService.saveCladdingJobs !== "function") {
        throw new Error("The Hardies database endpoint is unavailable.");
      }
      const response = await ApiService.saveCladdingJobs({
        user_update: currentUsername || "admin",
        jobs: [{ id_job_hw: savedJobId, walls: wallEntries, task: "hardies_fire_walls" }]
      });
      if (!response?.success) {
        throw new Error(response?.message || response?.detail || "The database did not confirm the save.");
      }

      setSaveStatus("success");
      setDataSource("db");
      setIsReadOnly(true);
      setTimeout(() => setSaveStatus(null), 3500);
    } catch (err) {
      console.error("Error saving Hardies Fire Walls:", err);
      setSaveStatus("error");
      alert(`Error saving Hardies Fire Walls: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="task-panel hardies-fire-walls-task" style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "4px 2px" }}>
      {/* ── TOP HEADER BANNER ── */}
      <div style={{
        background: "linear-gradient(135deg, #1e293b, #0f172a)",
        color: "#ffffff",
        borderRadius: "10px",
        padding: "14px 16px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "38px",
            height: "38px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #ef4444, #b91c1c)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "20px",
            boxShadow: "0 2px 6px rgba(239,68,68,0.4)"
          }}>
            🔥
          </div>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 800, letterSpacing: "-0.2px" }}>
              Hardies Fire Walls
            </div>
            <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>
              HardieSmart™ Boundary & Zero Lot Line Fire Rated Systems
            </div>
          </div>
        </div>

        <EnteredTaskActions
          onAutoFill={onAddDataAI}
          onClear={handleClearEntries}
          onSave={handleSaveToMSSQL}
          saveDisabled={isSaving}
          saveStatus={isSaving ? "saving" : (saveStatus || "idle")}
          autoFillLabel="Fill"
          dataSource={dataSource}
          isReadOnly={isReadOnly}
          onEdit={() => setIsReadOnly(false)}
        />
      </div>

      {/* ── SECTION 1: SPECIFICATION SETUP (Collapsible) ── */}
      <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", background: "#ffffff", overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setIsSpecOpen(!isSpecOpen)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: "#f8fafc",
            border: "none",
            borderBottom: isSpecOpen ? "1px solid #e2e8f0" : "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "13px",
            color: "#1e293b"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>⚙️</span>
            <span>Fire Wall Specifications & Standards</span>
          </div>
          <span style={{ fontSize: "12px", color: "#64748b" }}>{isSpecOpen ? "▲" : "▼"}</span>
        </button>

        {isSpecOpen && (
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                Default Fire System Type
              </label>
              <select
                value={defaultSystem}
                onChange={(e) => setDefaultSystem(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 600, color: "#1e293b" }}
              >
                {SYSTEM_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                  Lining / Sheet Material
                </label>
                <select
                  value={defaultLining}
                  onChange={(e) => setDefaultLining(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#1e293b" }}
                >
                  {LINING_SPEC_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                  Wall Framing
                </label>
                <select
                  value={defaultFraming}
                  onChange={(e) => setDefaultFraming(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#1e293b" }}
                >
                  {FRAMING_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                  Sealant & Accessories
                </label>
                <select
                  value={defaultSealant}
                  onChange={(e) => setDefaultSealant(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#1e293b" }}
                >
                  {SEALANT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                  Track / Perimeter Angle
                </label>
                <select
                  value={defaultAngle}
                  onChange={(e) => setDefaultAngle(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", color: "#1e293b" }}
                >
                  {ANGLE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 2: ADD FIRE WALL ENTRY ── */}
      <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", background: "#ffffff", overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setIsFormOpen(!isFormOpen)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: "#f8fafc",
            border: "none",
            borderBottom: isFormOpen ? "1px solid #e2e8f0" : "none",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "13px",
            color: "#1e293b"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>➕</span>
            <span>Add Fire Wall Entry</span>
          </div>
          <span style={{ fontSize: "12px", color: "#64748b" }}>{isFormOpen ? "▲" : "▼"}</span>
        </button>

        {isFormOpen && (
          <form onSubmit={handleAddEntry} style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>Entry Details</span>
              {selectedWall && (
                <button
                  type="button"
                  onClick={handleUseSelectedWall}
                  style={{
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    border: "1px solid #bfdbfe",
                    borderRadius: "5px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  📌 Use Selected Wall on Canvas
                </button>
              )}
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "3px" }}>
                Location / Wall Label
              </label>
              <input
                type="text"
                placeholder="e.g. Boundary Left (Zero Lot Line), Party Wall"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
              />
            </div>

            <DimensionPair
              heightValue={wallHeight}
              lengthValue={wallLength}
              onHeightChange={setWallHeight}
              onLengthChange={setWallLength}
              unit="m"
              heightLabel="Wall Height"
              lengthLabel="Wall Length"
              heightPlaceholder="e.g. 2.70"
              lengthPlaceholder="e.g. 6.80"
            />

            <div>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "3px" }}>
                Notes / Requirements
              </label>
              <input
                type="text"
                placeholder="e.g. Check boundary setback with certifier"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px" }}
              />
            </div>

            <button
              type="submit"
              style={{
                marginTop: "4px",
                background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 14px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(37,99,235,0.25)"
              }}
            >
              + Add fire wall
            </button>
          </form>
        )}
      </div>

      {/* ── SECTION 3: TAKEOFF ENTRIES TABLE ── */}
      <div style={{ border: "1px solid #e2e8f0", borderRadius: "8px", background: "#ffffff", overflow: "hidden" }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          fontWeight: 700,
          fontSize: "13px",
          color: "#1e293b"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📋</span>
            <span>Entered Fire Walls ({wallEntries.length})</span>
          </div>
        </div>

        {wallEntries.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
            No fire walls added yet. Add an entry above or select a wall on the drawing.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f1f5f9", color: "#475569", borderBottom: "1px solid #cbd5e1" }}>
                  <th style={{ padding: "6px 8px" }}>#</th>
                  <th style={{ padding: "6px 8px" }}>Floor Level</th>
                  <th style={{ padding: "6px 8px" }}>Location</th>
                  <th style={{ padding: "6px 8px" }}>Len (m)</th>
                  <th style={{ padding: "6px 8px" }}>Height</th>
                  <th style={{ padding: "6px 8px" }}>System / Spec</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {wallEntries.map((w, idx) => {
                  const isEditing = editingRowId === w.id;
                  if (isEditing) {
                    return (
                      <tr
                        key={w.id}
                        data-editing-row-id={w.id}
                        style={{ background: "#fef3c7", borderBottom: "1px solid #fcd34d" }}
                      >
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}><TaskRowNumber index={idx} row={w} /></td>
                        <td style={{ padding: "6px 8px", fontWeight: 700, color: "#2563eb" }}>{w.floorLevel || w.floor_level || "GF"}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <input
                            type="text"
                            value={editRowData.location || ""}
                            onChange={(e) => setEditRowData({ ...editRowData, location: e.target.value })}
                            style={{ width: "100%", padding: "4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                          />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input
                            type="text"
                            value={editRowData.length || ""}
                            onChange={(e) => setEditRowData({ ...editRowData, length: e.target.value })}
                            style={{ width: "50px", padding: "4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", fontWeight: 700 }}
                          />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input
                            type="text"
                            value={editRowData.height || ""}
                            onChange={(e) => setEditRowData({ ...editRowData, height: e.target.value })}
                            style={{ width: "50px", padding: "4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1", fontWeight: 700 }}
                          />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <select
                            value={editRowData.systemType || SYSTEM_TYPE_OPTIONS[0]}
                            onChange={(e) => setEditRowData({ ...editRowData, systemType: e.target.value })}
                            style={{ width: "100%", padding: "4px", fontSize: "11px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                          >
                            {SYSTEM_TYPE_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              title="Save row"
                              style={{ background: "#10b981", color: "#ffffff", border: "none", borderRadius: "4px", padding: "3px 6px", cursor: "pointer", fontSize: "10px", fontWeight: 700 }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRowId(null)}
                              style={{ background: "#94a3b8", color: "#ffffff", border: "none", borderRadius: "4px", padding: "3px 6px", cursor: "pointer", fontSize: "10px" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={w.id}
                      onClick={(event) => {
                        if (event.target.closest("button, input, select, textarea, a")) return;
                        if (onSelectEntry) onSelectEntry(w);
                      }}
                      onDoubleClick={(event) => {
                        if (event.target.closest("button, input, select, textarea, a")) return;
                        event.preventDefault();
                        event.stopPropagation();
                        if (onSelectEntry) onSelectEntry(w);
                        handleStartEdit(w);
                      }}
                      title="Double-click to edit row"
                      style={{
                        borderBottom: "1px solid #e2e8f0",
                        background: idx % 2 === 0 ? "#ffffff" : "#f8fafc"
                      }}
                    >
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: "#64748b" }}><TaskRowNumber index={idx} row={w} /></td>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: "#2563eb" }}>{w.floorLevel || w.floor_level || "GF"}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: "#1e293b" }}>
                        {w.location}
                        {w.notes && <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 400 }}>{w.notes}</div>}
                      </td>
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>{w.length}m</td>
                      <td style={{ padding: "6px 8px" }}>{w.height}m</td>
                      <td style={{ padding: "6px 8px", color: "#334155" }}>
                        <div style={{ fontWeight: 600 }}>{w.systemType?.split("(")[0]?.trim() || w.systemType}</div>
                        <div style={{ fontSize: "10px", color: "#64748b" }}>{w.liningSpec}</div>
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(w)}
                            title="Edit row"
                            style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 5px", cursor: "pointer", fontSize: "11px" }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateEntry(w)}
                            title="Duplicate row"
                            style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 5px", cursor: "pointer", fontSize: "11px" }}
                          >
                            📋
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(w.id)}
                            title="Delete row"
                            style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: "4px", padding: "2px 5px", cursor: "pointer", fontSize: "11px", color: "#dc2626" }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
