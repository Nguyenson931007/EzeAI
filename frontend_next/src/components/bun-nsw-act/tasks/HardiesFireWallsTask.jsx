import React, { useState, useEffect, useMemo } from "react";
import { ApiService } from "@/models/api.service";
import { useAppModel } from "@/models/app.context";
import { getActiveClientShortName } from "@/constants/clients";
import { useCatalog } from "@/utils/catalogHelpers";

export default function HardiesFireWallsTask({
  formData = {},
  onChange,
  cadMetrics = {},
  entries = [],
  onSetEntries,
  onAddDataAI,
  onSelectEntry,
  activeJobNumber,
  selectedWall,
  selectedWallIds = [],
  selectedId,
  selectedType
}) {
  const appModel = useAppModel ? useAppModel() : {};
  const activeCustomerShortName = getActiveClientShortName();

  // Catalog items if available under hardies or cladding or fire-walls
  const { items: catalogItems } = useCatalog(activeCustomerShortName, "cladding");

  // Local state when external state setter isn't passed
  const [localEntries, setLocalEntries] = useState([]);
  const wallEntries = entries && entries.length > 0 ? entries : localEntries;

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
  const [isSpecOpen, setIsSpecOpen] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(true);

  // ── INLINE EDITING ──
  const [editingRowId, setEditingRowId] = useState(null);
  const [editRowData, setEditRowData] = useState({});

  // ── SAVING STATE ──
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  // ── LOAD SAVED DATA FROM LOCALSTORAGE ON MOUNT ──
  useEffect(() => {
    try {
      const savedJobId = activeJobNumber
        || appModel?.currentJobId
        || appModel?.currentProjectName
        || "default";
      const key = `ezefloor_hardies_fire_walls_${savedJobId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && (!entries || entries.length === 0)) {
          setEntries(parsed);
        }
      }
    } catch (e) {
      console.warn("Could not load cached Hardies Fire Walls:", e);
    }
  }, [activeJobNumber]);

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

  // ── HELPER CALCULATIONS PER ROW ──
  const calculateRowMetrics = (len, h) => {
    const l = parseFloat(String(len || "0").replace(/[^\d.]/g, "")) || 0;
    const height = parseFloat(String(h || "2.70").replace(/[^\d.]/g, "")) || 2.70;
    const areaM2 = l * height;
    // Standard 1200mm wide fire board / sheets
    const sheetsQty = Math.ceil((l * 1000) / 1200);
    // Sealant: ~1 tube per 6 linear meters of joints & perimeter
    const perimeterM = 2 * (l + height);
    const sealantTubes = Math.max(1, Math.ceil(perimeterM / 6));
    // Perimeter angle top and bottom
    const angleLm = l * 2;

    return {
      areaM2: Number(areaM2.toFixed(2)),
      sheetsQty: sheetsQty || 1,
      sealantTubes: sealantTubes || 1,
      angleLm: Number(angleLm.toFixed(2))
    };
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

    const metrics = calculateRowMetrics(l, h);
    const newEntry = {
      id: `hfw_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      location: locationName.trim() || `Fire Wall ${wallEntries.length + 1}`,
      length: l.toFixed(2),
      height: h.toFixed(2),
      systemType: defaultSystem,
      liningSpec: defaultLining,
      framing: defaultFraming,
      sealant: defaultSealant,
      angle: defaultAngle,
      areaM2: metrics.areaM2,
      sheetsQty: metrics.sheetsQty,
      sealantTubes: metrics.sealantTubes,
      angleLm: metrics.angleLm,
      notes: notes.trim()
    };

    const updated = [...wallEntries, newEntry];
    setEntries(updated);

    // Save to local cache
    try {
      const savedJobId = activeJobNumber || appModel?.currentJobId || appModel?.currentProjectName || "default";
      localStorage.setItem(`ezefloor_hardies_fire_walls_${savedJobId}`, JSON.stringify(updated));
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
      const savedJobId = activeJobNumber || appModel?.currentJobId || appModel?.currentProjectName || "default";
      localStorage.setItem(`ezefloor_hardies_fire_walls_${savedJobId}`, JSON.stringify(updated));
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
      const savedJobId = activeJobNumber || appModel?.currentJobId || appModel?.currentProjectName || "default";
      localStorage.setItem(`ezefloor_hardies_fire_walls_${savedJobId}`, JSON.stringify(updated));
    } catch (_) {}
  };

  // ── START EDITING ──
  const handleStartEdit = (item) => {
    setEditingRowId(item.id);
    setEditRowData({ ...item });
  };

  const handleSaveEdit = () => {
    const metrics = calculateRowMetrics(editRowData.length, editRowData.height);
    const updated = wallEntries.map((w) =>
      w.id === editingRowId
        ? {
            ...editRowData,
            areaM2: metrics.areaM2,
            sheetsQty: metrics.sheetsQty,
            sealantTubes: metrics.sealantTubes,
            angleLm: metrics.angleLm
          }
        : w
    );
    setEntries(updated);
    setEditingRowId(null);
    setEditRowData({});
    try {
      const savedJobId = activeJobNumber || appModel?.currentJobId || appModel?.currentProjectName || "default";
      localStorage.setItem(`ezefloor_hardies_fire_walls_${savedJobId}`, JSON.stringify(updated));
    } catch (_) {}
  };

  // ── SUMMARY STATS ──
  const summary = useMemo(() => {
    let totalLen = 0;
    let totalArea = 0;
    let totalSheets = 0;
    let totalSealant = 0;
    let totalAngle = 0;

    wallEntries.forEach((w) => {
      totalLen += parseFloat(w.length) || 0;
      totalArea += parseFloat(w.areaM2) || 0;
      totalSheets += parseInt(w.sheetsQty, 10) || 0;
      totalSealant += parseInt(w.sealantTubes, 10) || 0;
      totalAngle += parseFloat(w.angleLm) || 0;
    });

    return {
      count: wallEntries.length,
      totalLen: totalLen.toFixed(2),
      totalArea: totalArea.toFixed(2),
      totalSheets,
      totalSealant,
      totalAngle: totalAngle.toFixed(2)
    };
  }, [wallEntries]);

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
      localStorage.setItem(`ezefloor_hardies_fire_walls_${savedJobId}`, JSON.stringify(wallEntries));

      // Attempt to save through ApiService if endpoint is available
      try {
        if (typeof ApiService.saveCladdingJobs === "function") {
          await ApiService.saveCladdingJobs({
            user_update: currentUsername || "admin",
            jobs: [{ id_job_hw: savedJobId, walls: wallEntries, task: "hardies_fire_walls" }]
          });
        }
      } catch (apiErr) {
        console.warn("Backend API save optional fallback:", apiErr);
      }

      setSaveStatus("success");
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

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {onAddDataAI && (
            <button
              type="button"
              onClick={onAddDataAI}
              style={{
                background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
              title="Import walls from CAD drawing"
            >
              <span>✨</span>
              <span>AI Import</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveToMSSQL}
            disabled={isSaving}
            style={{
              background: saveStatus === "success" ? "#10b981" : saveStatus === "error" ? "#ef4444" : "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: isSaving ? "not-allowed" : "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
            }}
          >
            {isSaving ? "Saving..." : saveStatus === "success" ? "✓ Saved" : "💾 Save"}
          </button>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Walls Count</div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>{summary.count}</div>
          <div style={{ fontSize: "11px", color: "#3b82f6", fontWeight: 700 }}>{summary.totalLen} Lm</div>
        </div>

        <div style={{ background: "#ffffff", border: "1.5px solid #ef4444", borderRadius: "8px", padding: "10px", textAlign: "center", boxShadow: "0 1px 4px rgba(239,68,68,0.12)" }}>
          <div style={{ fontSize: "11px", color: "#b91c1c", fontWeight: 700, textTransform: "uppercase" }}>Total Fire Area</div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#b91c1c", marginTop: "2px" }}>{summary.totalArea}</div>
          <div style={{ fontSize: "11px", color: "#dc2626", fontWeight: 700 }}>m²</div>
        </div>

        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Est. Materials</div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>{summary.totalSheets} shts</div>
          <div style={{ fontSize: "11px", color: "#f59e0b", fontWeight: 700 }}>{summary.totalSealant} tubes sealant</div>
        </div>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "3px" }}>
                  Wall Length (m) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 6.80"
                  value={wallLength}
                  onChange={(e) => setWallLength(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700 }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "#475569", display: "block", marginBottom: "3px" }}>
                  Wall Height (m)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2.70"
                  value={wallHeight}
                  onChange={(e) => setWallHeight(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 700 }}
                />
              </div>
            </div>

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
              + Add to Hardies Fire Walls Takeoff
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
            <span>Fire Walls Takeoff Schedule ({wallEntries.length})</span>
          </div>
          <span style={{ fontSize: "12px", color: "#64748b" }}>
            Total: {summary.totalArea} m²
          </span>
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
                  <th style={{ padding: "6px 8px" }}>Location</th>
                  <th style={{ padding: "6px 8px" }}>Len (m)</th>
                  <th style={{ padding: "6px 8px" }}>Height</th>
                  <th style={{ padding: "6px 8px" }}>Area (m²)</th>
                  <th style={{ padding: "6px 8px" }}>System / Spec</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {wallEntries.map((w, idx) => {
                  const isEditing = editingRowId === w.id;
                  if (isEditing) {
                    return (
                      <tr key={w.id} style={{ background: "#fef3c7", borderBottom: "1px solid #fcd34d" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>{idx + 1}</td>
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
                        <td style={{ padding: "6px 8px", fontWeight: 800, color: "#b91c1c" }}>
                          {((parseFloat(editRowData.length) || 0) * (parseFloat(editRowData.height) || 0)).toFixed(2)}
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
                      style={{
                        borderBottom: "1px solid #e2e8f0",
                        background: idx % 2 === 0 ? "#ffffff" : "#f8fafc"
                      }}
                    >
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: "#64748b" }}>{idx + 1}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: "#1e293b" }}>
                        {w.location}
                        {w.notes && <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 400 }}>{w.notes}</div>}
                      </td>
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>{w.length}m</td>
                      <td style={{ padding: "6px 8px" }}>{w.height}m</td>
                      <td style={{ padding: "6px 8px", fontWeight: 800, color: "#b91c1c" }}>{w.areaM2} m²</td>
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
