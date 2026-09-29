import React, { useState, useEffect } from "react";
import { ApiService } from "@/models/api.service";
import {
  DOOR_TYPE_REGISTRY,
  getStoredDoorConfig,
  resolveDoorTypeId,
  getDoorTypeOptions,
  MATERIAL_OPTIONS,
  FIRE_RATING_OPTIONS,
  findStackedLowerDoor,
  findStackedUpperWindow
} from "@/models/DoorTypeRegistry";
import { getDoorWindowDisplayWidthMm } from "../UIComponents";
import SearchableSelect from "@/components/SearchableSelect";

const FALLBACK_EXT_TYPES = [
  "TBA",
  "SCX1 D/C",
  "SCX1 P/PLY",
  "SCX1 PRIMECOAT",
  "SCX1 SPM",
  "JST1 CLR DBL GLAZE",
  "JST1 FROST DBL GLAZE",
  "JST1 TRANSLUCENT DBL GLAZE",
  "JST1 CLR SG",
  "JST1 FROST SG",
  "JST1 TRANSLUCENT SG",
  "JST2 CLR DBL GLAZE",
  "JST2 FROST DBL GLAZE",
  "JST2 TRANSLUCENT DBL GLAZE",
  "JST2 CLR SG",
  "JST2 FROST SG",
  "JST2 TRANSLUCENT SG",
  "JST4 CLR DBL GLAZE",
  "JST4 FROST DBL GLAZE",
  "JST4 TRANSLUCENT DBL GLAZE",
  "JST4 CLR SG",
  "JST4 FROST SG",
  "JST4 TRANSLUCENT SG",
  "JST6 CLR DBL GLAZE",
  "JST6 FROST DBL GLAZE",
  "JST6 TRANSLUCENT DBL GLAZE",
  "JST6 CLR SG",
  "JST6 FROST SG",
  "JST6 TRANSLUCENT SG",
  "SCX1 PCM",
  "STPC D/C",
  "STPC P/PLY",
  "STPC SPM",
  "X1 D/C",
  "X1 P/PLY",
  "X1 SPM",
  "XB2 OAK SOLID",
  "BFR1 D/C CLEAR",
  "BFR13 D/C",
  "BFR14 D/C CLEAR",
  "BFR14 D/C FROST",
  "BFR15 D/C CLEAR",
  "BFR15 D/C FROST",
  "BFR16 D/C CLEAR",
  "BFR16 D/C FROST",
  "BFR17 D/C CLEAR",
  "BFR17 D/C FROST",
  "BFR18 D/C CLEAR",
  "BFR18 D/C FROST",
  "BFR19 D/C CLEAR",
  "BFR19 D/C FROST",
  "BFR2 D/C CLEAR",
  "BFR20 D/C CLEAR",
  "BFR20 D/C FROST",
  "BFR21 D/C CLEAR",
  "BFR21 D/C FROST",
  "BFR22 D/C CLEAR",
  "BFR22 D/C FROST",
  "BFR23 D/C CLEAR",
  "BFR23 D/C FROST",
  "BFR4 D/C CLEAR",
  "BFR4 D/C FROST",
  "BFR5 D/C CLEAR",
  "BFR6 D/C CLEAR",
  "BFR7 D/C CLEAR",
  "BFR7 D/C FROST",
  "BFR8 D/C CLEAR",
  "BFR8 D/C FROST",
  "BFR9 D/C CLEAR",
  "BFR9 D/C FROST",
  "DURACOTE FLUSH SOLID",
  "FLUSH SOLID CORE",
  "HUME SOLID ENTRANCE",
  "CORINTHIAN PMAD 104"
];

const FALLBACK_INT_TYPES = [
  "H1 PCM",
  "SCX1 PCM",
  "HAG9",
  "HAG11",
  "LIN1 CLR",
  "HLR240",
  "H1 PCLC 4.75mm",
  "H1 SPM",
  "HA10",
  "HA15",
  "HA4",
  "HA40",
  "HA45",
  "HA5",
  "HAG12",
  "HAG14",
  "HAG18",
  "HAG6",
  "HAM1",
  "HAM1 CLEAR",
  "HAM1 MDF INFILL",
  "HAM1 TRANS",
  "HAM1 TRANS LAM",
  "HAM10 CLEAR",
  "HAM10 MDF INFILL",
  "HAM10 TRANS LAM",
  "HAM12 CLEAR",
  "HAM12 MDF INFILL",
  "HAM12 TRANS",
  "HAM12 TRANS LAM",
  "FLUSH PANEL HONEYCOMB",
  "REDICOTE FLUSH INTERNAL",
  "DECO 1S",
  "DECO 2S",
  "DECO 3S",
  "DECO 4S",
  "MOTIVE MOT1",
  "MOTIVE MOT2",
  "ACCENT LINEAR HAG11",
  "ACCENT LINEAR HAG12",
  "REGENCY 4-PANEL",
  "OAKFIELD 2-PANEL",
  "COLONIAL 4-PANEL",
  "CORINTHIAN INTERNAL FLUSH",
  "HUME INTERNAL FLUSH"
];

export default function DoorWindowPropertyPanel({
  selectedDoor,
  selectedType,
  walls = [],
  doors = [],
  updateDoor,
  deleteDoor,
  deleteDoors,
  selectedDoorIds = [],
  setSelectedDoorIds,
  setSelectedId,
  setSelectedType,
  updateDoorsProperty,
  selectDoor,
  realScale,
  scaleValue,
  showConfirm = window.confirm
}) {
  const [lockoutDoorTypes, setLockoutDoorTypes] = useState({
    internal: FALLBACK_INT_TYPES,
    external: FALLBACK_EXT_TYPES
  });

  useEffect(() => {
    let isMounted = true;
    const loadTypes = async () => {
      try {
        let data = null;
        if (ApiService.getLockoutOptions) {
          const res = await ApiService.getLockoutOptions();
          data = res?.data || res;
        } else if (ApiService.getLockoutDoorTypes) {
          const res = await ApiService.getLockoutDoorTypes();
          data = res?.data || res;
        } else {
          const res = await fetch("/api/lockout/options");
          if (res.ok) {
            const json = await res.json();
            data = json?.data || json;
          }
        }
        if (isMounted && data) {
          const rawExt = Array.isArray(data.external) && data.external.length > 0 ? data.external : [];
          const extSet = new Set([...rawExt, ...FALLBACK_EXT_TYPES]);
          extSet.add("SCX1 D/C");

          const rawInt = Array.isArray(data.internal) && data.internal.length > 0
            ? data.internal
            : (Array.isArray(data.prehung_internal) && data.prehung_internal.length > 0 ? data.prehung_internal : []);
          const intSet = new Set([...rawInt, ...FALLBACK_INT_TYPES]);
          intSet.add("H1 PCM");

          setLockoutDoorTypes({
            external: Array.from(extSet),
            internal: Array.from(intSet)
          });
        }
      } catch (_) { }
    };
    loadTypes();
    return () => { isMounted = false; };
  }, []);

  const isMulti = selectedDoorIds && selectedDoorIds.length > 1;
  const selectedDoors = (doors || []).filter((d) => (selectedDoorIds || []).includes(d.id));

  // Determine active door reference
  const activeDoor = selectedDoor || selectedDoors[0];
  if (!activeDoor && selectedDoors.length === 0) return null;

  const isWindowItem = (d) => {
    if (!d) return false;
    return (
      (d.type === "window" ||
        d.class === "window" ||
        d.doorTypeId === "win_standard" ||
        (d.doorTypeId && d.doorTypeId.startsWith("win_")) ||
        (d.doorName && d.doorName.startsWith("W-")) ||
        (d.door_name && d.door_name.startsWith("W-"))) &&
      d.class !== "sliding_door" &&
      d.type !== "sliding"
    );
  };

  const pageWindows = (doors || []).filter(isWindowItem);
  const pageDoorsOnly = (doors || []).filter((d) => !isWindowItem(d));

  const numWindows = selectedDoors.filter(isWindowItem).length;
  const numDoors = selectedDoors.length - numWindows;
  const isSelectedWindow = isMulti ? (numWindows > numDoors) : isWindowItem(activeDoor);

  // Apply property change to all selected doors (or single door)
  const handleApplyProperty = (patch) => {
    if (isMulti && updateDoorsProperty) {
      updateDoorsProperty(selectedDoorIds, patch);
    } else {
      if (updateDoorsProperty && activeDoor) {
        updateDoorsProperty([activeDoor.id], patch);
      }
      if (updateDoor && activeDoor) {
        updateDoor({ ...activeDoor, ...patch });
      }
    }
  };

  const handleDelete = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const count = isMulti ? selectedDoorIds.length : 1;
    const itemLabel = isSelectedWindow ? "window" : "door";
    const msg = count > 1
      ? `Are you sure you want to delete ${count} selected ${itemLabel}s?`
      : `Are you sure you want to delete this ${itemLabel}?`;

    if (await showConfirm(msg)) {
      if (count > 1) {
        if (deleteDoors) {
          deleteDoors(selectedDoorIds);
        } else if (deleteDoor) {
          selectedDoorIds.forEach((id) => deleteDoor(id));
        }
        if (setSelectedDoorIds) setSelectedDoorIds([]);
        if (setSelectedId) setSelectedId(null);
        if (setSelectedType) setSelectedType(null);
      } else {
        deleteDoor && deleteDoor(activeDoor.id);
        if (setSelectedDoorIds) setSelectedDoorIds([]);
        if (setSelectedId) setSelectedId(null);
        if (setSelectedType) setSelectedType(null);
      }
    }
  };

  // ══════════════════════════════════════════════════════════════
  // WINDOW PROPERTY PANEL
  // ══════════════════════════════════════════════════════════════
  if (isSelectedWindow) {
    const effectiveWindowWidthMm = isMulti
      ? (selectedDoors.every((d) => d.width_mm === activeDoor.width_mm)
          ? getDoorWindowDisplayWidthMm(activeDoor, realScale, scaleValue)
          : "")
      : getDoorWindowDisplayWidthMm(activeDoor, realScale, scaleValue);

    const effectiveWindowHeightMm = isMulti
      ? (selectedDoors.every((d) => (d.height_mm || d.height || 1200) === (activeDoor.height_mm || activeDoor.height || 1200))
          ? (activeDoor.height_mm || activeDoor.height || 1200)
          : "")
      : (activeDoor.height_mm || activeDoor.height || 1200);

    const getWinH2 = (d) => (d.height2_mm !== undefined && d.height2_mm !== null) ? Number(d.height2_mm) : Number(d.height_mm || d.height || 1200);
    const effectiveWindowHeight2Mm = isMulti
      ? (selectedDoors.every((d) => getWinH2(d) === getWinH2(activeDoor))
          ? getWinH2(activeDoor)
          : "")
      : getWinH2(activeDoor);

    const isRakedWindow = Number(effectiveWindowHeight2Mm) !== Number(effectiveWindowHeightMm) && Boolean(effectiveWindowHeight2Mm);

    const stackedLowerDoor = findStackedLowerDoor(activeDoor, doors, walls);
    const isStacked = Boolean(stackedLowerDoor);
    const stackedLowerHeight = isStacked
      ? Number(stackedLowerDoor.height_mm || stackedLowerDoor.height || 2040)
      : null;

    const handleFlipSlope = () => {
      const h1 = Number(activeDoor.height_mm || activeDoor.height || 1200);
      const h2 = Number(activeDoor.height2_mm !== undefined ? activeDoor.height2_mm : h1);
      handleApplyProperty({
        height_mm: h2,
        height: h2,
        heightMm: h2,
        height2_mm: h1,
        is_raked: h1 !== h2,
      });
    };

    return (
      <>
        {/* Multi-selection Banner */}
        {isMulti && (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(59,130,246,0.15) 100%)",
              border: "1px solid rgba(59,130,246,0.3)",
              borderRadius: "8px",
              padding: "10px 12px",
              marginBottom: "14px"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#1d4ed8", display: "flex", alignItems: "center", gap: 5 }}>
                🪟 Multi-Window Selection
              </span>
              <span style={{ fontSize: "11px", fontWeight: 700, background: "#2563eb", color: "#fff", padding: "2px 8px", borderRadius: "10px" }}>
                {selectedDoorIds.length} Selected
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginBottom: 8 }}>
              Properties changed below apply to all <b>{selectedDoorIds.length}</b> selected windows.
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              {pageWindows.length > 0 && (
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: "5px 8px",
                    fontSize: "11px",
                    fontWeight: 600,
                    background: "#fff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "5px",
                    cursor: "pointer",
                    color: "#1e293b",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                  }}
                  onClick={() => {
                    const ids = pageWindows.map((d) => d.id);
                    if (setSelectedDoorIds) setSelectedDoorIds(ids);
                    if (setSelectedType) setSelectedType("window");
                    if (setSelectedId && ids.length > 0) setSelectedId(ids[0]);
                  }}
                >
                  All Windows ({pageWindows.length})
                </button>
              )}
              <button
                type="button"
                style={{
                  padding: "5px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: "#fff",
                  border: "1px solid #fecaca",
                  borderRadius: "5px",
                  cursor: "pointer",
                  color: "#dc2626"
                }}
                onClick={() => {
                  if (setSelectedDoorIds) setSelectedDoorIds([]);
                  if (setSelectedId) setSelectedId(null);
                  if (setSelectedType) setSelectedType(null);
                }}
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Single Selection Header & Quick Select All */}
        {!isMulti && (
          <div style={{ marginBottom: 12 }}>
            <div className="panel-field">
              <span className="panel-label">Window ID</span>
              <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: "bold" }}>
                {activeDoor.id}
              </div>
            </div>
            {pageWindows.length > 1 && (
              <button
                type="button"
                className="rp-action-btn"
                style={{
                  padding: "6px 10px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: "rgba(37,99,235,0.08)",
                  border: "1px solid rgba(37,99,235,0.2)",
                  color: "#1d4ed8",
                  width: "100%",
                  borderRadius: 5,
                  marginBottom: 8,
                  cursor: "pointer"
                }}
                onClick={() => {
                  const ids = pageWindows.map((d) => d.id);
                  if (setSelectedDoorIds) setSelectedDoorIds(ids);
                  if (setSelectedType) setSelectedType("window");
                  if (setSelectedId && ids.length > 0) setSelectedId(ids[0]);
                }}
              >
                🎯 Select All Windows ({pageWindows.length})
              </button>
            )}
          </div>
        )}

        {/* Auto-Stacked Status Banner */}
        {isStacked && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              borderRadius: "8px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              marginBottom: "12px",
              fontSize: "12px",
              color: "#166534"
            }}
          >
            <span style={{ fontSize: "16px" }}>🧱</span>
            <div style={{ lineHeight: "1.4" }}>
              <div style={{ fontWeight: 700 }}>
                Auto-Stacked Over {stackedLowerDoor.doorName || stackedLowerDoor.door_name || "Lower Door"}
              </div>
              <div style={{ color: "#15803d", fontSize: "11px" }}>
                Base Sill Elevation: <strong>{stackedLowerHeight} mm</strong> (starts at top of door)
              </div>
            </div>
          </div>
        )}

        <div className="panel-field">
          <span className="panel-label">Window Name</span>
          <input
            className="panel-input"
            value={isMulti ? "(Multiple windows selected)" : (activeDoor.door_name || "")}
            disabled={isMulti}
            style={isMulti ? { opacity: 0.6, fontStyle: "italic" } : {}}
            onChange={(e) => updateDoor && updateDoor({ ...activeDoor, door_name: e.target.value })}
          />
        </div>

        <div className="panel-field">
          <span className="panel-label">Window Type</span>
          <SearchableSelect
            value={activeDoor.doorTypeId || activeDoor.penetration_type || activeDoor.penetrationType || "win_standard"}
            options={getDoorTypeOptions().filter((o) => {
              const def = DOOR_TYPE_REGISTRY[o.value];
              return def?.doorType === "window" || def?.renderClass === "window" || o.value.includes("win_");
            })}
            placeholder="Search window type..."
            onChange={(typeId) => {
              const def = DOOR_TYPE_REGISTRY[typeId];
              handleApplyProperty({
                doorTypeId: typeId,
                penetration_type: def?.renderClass || "window",
                class: def?.renderClass || "window",
                type: def?.doorType || "window"
              });
            }}
          />
        </div>

        <div className="panel-field">
          <span className="panel-label">Material</span>
          <select
            className="panel-select"
            value={activeDoor.material || "glass"}
            onChange={(e) => handleApplyProperty({ material: e.target.value })}
          >
            <option value="glass">Glass</option>
            <option value="aluminum">Aluminum</option>
            <option value="timber">Timber</option>
          </select>
        </div>

        <div className="panel-field">
          <span className="panel-label">Status</span>
          <select
            className="panel-select"
            value={activeDoor.status || "active"}
            onChange={(e) => handleApplyProperty({ status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="deleted">Deleted</option>
            <option value="superseded">Superseded</option>
          </select>
        </div>

        <div className="panel-field">
          <span className="panel-label">Width (mm)</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="number"
              className="panel-input"
              style={{ flex: 1 }}
              placeholder={isMulti && !effectiveWindowWidthMm ? "(Multiple values)" : ""}
              value={effectiveWindowWidthMm}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!isNaN(val) && val > 0) {
                  handleApplyProperty({ width_mm: val, width_source: "manual" });
                }
              }}
            />
            <select
              className="panel-select"
              style={{ width: "100px" }}
              value={effectiveWindowWidthMm || ""}
              onChange={(e) => {
                if (e.target.value) {
                  handleApplyProperty({ width_mm: Number(e.target.value), width_source: "manual" });
                }
              }}
            >
              <option value="">Presets</option>
              <option value={600}>600</option>
              <option value={900}>900</option>
              <option value={1200}>1200</option>
              <option value={1500}>1500</option>
              <option value={1800}>1800</option>
              <option value={2100}>2100</option>
              <option value={2400}>2400</option>
              <option value={2700}>2700</option>
              <option value={3000}>3000</option>
            </select>
          </div>
        </div>

        {/* Height 1 / Left (mm) */}
        <div className="panel-field">
          <span className="panel-label">Height 1 / Left (mm)</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="number"
              className="panel-input"
              style={{ flex: 1 }}
              placeholder={isMulti && !effectiveWindowHeightMm ? "(Multiple values)" : ""}
              value={effectiveWindowHeightMm}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!isNaN(val) && val > 0) {
                  handleApplyProperty({ height_mm: val, height: val });
                }
              }}
            />
            <select
              className="panel-select"
              style={{ width: "100px" }}
              value={effectiveWindowHeightMm || ""}
              onChange={(e) => {
                if (e.target.value) {
                  const val = Number(e.target.value);
                  handleApplyProperty({ height_mm: val, height: val });
                }
              }}
            >
              <option value="">Presets</option>
              <option value={600}>600</option>
              <option value={900}>900</option>
              <option value={1200}>1200</option>
              <option value={1500}>1500</option>
              <option value={1800}>1800</option>
              <option value={2100}>2100</option>
              <option value={2400}>2400</option>
            </select>
          </div>
        </div>

        {/* Height 2 / Right (mm) */}
        <div className="panel-field">
          <span className="panel-label">Height 2 / Right (mm)</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="number"
              className="panel-input"
              style={{ flex: 1 }}
              placeholder={isMulti && !effectiveWindowHeight2Mm ? "(Multiple values)" : ""}
              value={effectiveWindowHeight2Mm}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!isNaN(val) && val > 0) {
                  handleApplyProperty({ height2_mm: val, is_raked: val !== Number(effectiveWindowHeightMm) });
                }
              }}
            />
            <select
              className="panel-select"
              style={{ width: "100px" }}
              value={effectiveWindowHeight2Mm || ""}
              onChange={(e) => {
                if (e.target.value) {
                  const val = Number(e.target.value);
                  handleApplyProperty({ height2_mm: val, is_raked: val !== Number(effectiveWindowHeightMm) });
                }
              }}
            >
              <option value="">Presets</option>
              <option value={600}>600</option>
              <option value={900}>900</option>
              <option value={1200}>1200</option>
              <option value={1500}>1500</option>
              <option value={1800}>1800</option>
              <option value={2100}>2100</option>
              <option value={2400}>2400</option>
            </select>
          </div>
        </div>

        {/* Raked Slope Action & Badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 4 }}>
          {isRakedWindow ? (
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "2px 8px", borderRadius: "12px" }}>
              📐 Raked Window (Trapezoid)
            </span>
          ) : (
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              Rectangular Window
            </span>
          )}
          <button
            type="button"
            className="rp-action-btn rp-action-btn--secondary"
            style={{ width: "auto", padding: "4px 10px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={handleFlipSlope}
            title="Flip Left and Right Heights"
          >
            ⇄ Flip Slope
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            className="rp-action-btn rp-action-btn--danger"
            onClick={handleDelete}
          >
            {isMulti ? `Delete Selected (${selectedDoorIds.length}) Windows` : "Delete Selected Window"}
          </button>
        </div>
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DOOR PROPERTY PANEL
  // ══════════════════════════════════════════════════════════════
  const parentWall = activeDoor.parentWallId ? walls.find((w) => w.id === activeDoor.parentWallId) : null;
  const isParentWallExt = parentWall && (parentWall.class_name === "exterior_wall" || parentWall.type === "ext" || parentWall.is_ext || parentWall.is_exterior);
  const isExt = Boolean(
    activeDoor.is_ext ||
      activeDoor.is_exterior ||
      activeDoor.location === "external" ||
      isParentWallExt ||
      (activeDoor.class || "").includes("ext") ||
      (activeDoor.door_name || activeDoor.doorName || "").toLowerCase().includes("external")
  );
  const category = isExt ? "external" : "internal";
  const isSlidingClass =
    activeDoor.type === "sliding" ||
    (activeDoor.class && (activeDoor.class.includes("sliding") || activeDoor.class.includes("slider"))) ||
    (activeDoor.penetration_type && (activeDoor.penetration_type.includes("sliding") || activeDoor.penetration_type.includes("slider"))) ||
    (activeDoor.door_name || activeDoor.doorName || "").toLowerCase().includes("slider");

  let activeDoorTypeId = activeDoor.doorTypeId;
  if (!activeDoorTypeId || !DOOR_TYPE_REGISTRY[activeDoorTypeId] || (isSlidingClass && activeDoorTypeId.includes("hinged"))) {
    activeDoorTypeId = resolveDoorTypeId(
      isSlidingClass ? "sliding" : activeDoor.doorTypeId || activeDoor.class || activeDoor.type || activeDoor.penetration_type,
      category
    );
  }

  const effectiveDoorWidthMm = isMulti
    ? (selectedDoors.every((d) => d.width_mm === activeDoor.width_mm)
        ? getDoorWindowDisplayWidthMm(activeDoor, realScale, scaleValue)
        : "")
    : getDoorWindowDisplayWidthMm(activeDoor, realScale, scaleValue);

  const effectiveDoorHeightMm = isMulti
    ? (selectedDoors.every((d) => (d.height_mm || d.height || 2040) === (activeDoor.height_mm || activeDoor.height || 2040))
        ? (activeDoor.height_mm || activeDoor.height || 2040)
        : "")
    : (activeDoor.height_mm || activeDoor.height || 2040);

  const stackedUpperWin = findStackedUpperWindow(activeDoor, doors, walls);
  const hasStackedUpperWindow = Boolean(stackedUpperWin);

  return (
    <>
      {/* Upper Window Stacked Status */}
      {hasStackedUpperWindow && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "8px",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            marginBottom: "12px",
            fontSize: "12px",
            color: "#1e40af"
          }}
        >
          <span style={{ fontSize: "16px" }}>🪟</span>
          <div style={{ lineHeight: "1.4" }}>
            <div style={{ fontWeight: 700 }}>
              Window Stacked Above: {stackedUpperWin.doorName || stackedUpperWin.door_name || "Window"}
            </div>
            <div style={{ color: "#2563eb", fontSize: "11px" }}>
              Window starts at top header ({activeDoor.height_mm || activeDoor.height || 2040} mm)
            </div>
          </div>
        </div>
      )}
      {/* Multi-selection Banner */}
      {isMulti && (
        <div
          style={{
            background: "linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(59,130,246,0.15) 100%)",
            border: "1px solid rgba(59,130,246,0.3)",
            borderRadius: "8px",
            padding: "10px 12px",
            marginBottom: "14px"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#1d4ed8", display: "flex", alignItems: "center", gap: 5 }}>
              🚪 Multi-Door Selection
            </span>
            <span style={{ fontSize: "11px", fontWeight: 700, background: "#2563eb", color: "#fff", padding: "2px 8px", borderRadius: "10px" }}>
              {selectedDoorIds.length} Selected
            </span>
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginBottom: 8 }}>
            Properties changed below apply to all <b>{selectedDoorIds.length}</b> selected doors.
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {pageDoorsOnly.length > 0 && (
              <button
                type="button"
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "5px",
                  cursor: "pointer",
                  color: "#1e293b",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}
                onClick={() => {
                  const ids = pageDoorsOnly.map((d) => d.id);
                  if (setSelectedDoorIds) setSelectedDoorIds(ids);
                  if (setSelectedType) setSelectedType("door");
                  if (setSelectedId && ids.length > 0) setSelectedId(ids[0]);
                }}
              >
                All Doors ({pageDoorsOnly.length})
              </button>
            )}
            {pageWindows.length > 0 && (
              <button
                type="button"
                style={{
                  flex: 1,
                  padding: "5px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "5px",
                  cursor: "pointer",
                  color: "#1e293b",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}
                onClick={() => {
                  const ids = pageWindows.map((d) => d.id);
                  if (setSelectedDoorIds) setSelectedDoorIds(ids);
                  if (setSelectedType) setSelectedType("window");
                  if (setSelectedId && ids.length > 0) setSelectedId(ids[0]);
                }}
              >
                All Windows ({pageWindows.length})
              </button>
            )}
            <button
              type="button"
              style={{
                padding: "5px 8px",
                fontSize: "11px",
                fontWeight: 600,
                background: "#fff",
                border: "1px solid #fecaca",
                borderRadius: "5px",
                cursor: "pointer",
                color: "#dc2626"
              }}
              onClick={() => {
                if (setSelectedDoorIds) setSelectedDoorIds([]);
                if (setSelectedId) setSelectedId(null);
                if (setSelectedType) setSelectedType(null);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Single Selection Header & Quick Select All */}
      {!isMulti && (
        <div style={{ marginBottom: 12 }}>
          <div className="panel-field">
            <span className="panel-label">Door ID</span>
            <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: "bold" }}>
              {activeDoor.id}
            </div>
          </div>
          {pageDoorsOnly.length > 1 && (
            <button
              type="button"
              className="rp-action-btn"
              style={{
                padding: "6px 10px",
                fontSize: "11px",
                fontWeight: 600,
                background: "rgba(37,99,235,0.08)",
                border: "1px solid rgba(37,99,235,0.2)",
                color: "#1d4ed8",
                width: "100%",
                borderRadius: 5,
                marginBottom: 8,
                cursor: "pointer"
              }}
              onClick={() => {
                const ids = pageDoorsOnly.map((d) => d.id);
                if (setSelectedDoorIds) setSelectedDoorIds(ids);
                if (setSelectedType) setSelectedType("door");
                if (setSelectedId && ids.length > 0) setSelectedId(ids[0]);
              }}
            >
              🎯 Select All Doors ({pageDoorsOnly.length})
            </button>
          )}
        </div>
      )}

      <div className="panel-field">
        <span className="panel-label">Door Name</span>
        <input
          className="panel-input"
          value={isMulti ? "(Multiple doors selected)" : (activeDoor.door_name || "")}
          disabled={isMulti}
          style={isMulti ? { opacity: 0.6, fontStyle: "italic" } : {}}
          onChange={(e) => updateDoor && updateDoor({ ...activeDoor, door_name: e.target.value })}
        />
      </div>

      <div className="panel-field">
        <span className="panel-label">Location / Category</span>
        <select
          className="panel-select"
          value={category}
          onChange={(e) => {
            const nextCat = e.target.value;
            const newTypeId = resolveDoorTypeId(activeDoorTypeId, nextCat);
            const def = DOOR_TYPE_REGISTRY[newTypeId];
            const storedConfig = getStoredDoorConfig();
            const newModel = nextCat === "external" ? storedConfig.extDoorType : storedConfig.intDoorType;
            handleApplyProperty({
              is_ext: nextCat === "external",
              is_exterior: nextCat === "external",
              location: nextCat,
              scope: nextCat,
              doorTypeId: newTypeId,
              penetration_type: def?.renderClass || activeDoor.penetration_type,
              class: def?.renderClass || activeDoor.class,
              door_type: newModel,
              lockup_door_type: newModel,
              product: newModel
            });
          }}
        >
          <option value="internal">Internal Door</option>
          <option value="external">External Door</option>
        </select>
      </div>

      <div className="panel-field">
        <span className="panel-label">Door Type</span>
        <SearchableSelect
          value={activeDoorTypeId}
          options={getDoorTypeOptions(category)}
          placeholder="Search door type (e.g. Single, Sliding)..."
          onChange={(typeId) => {
            const def = DOOR_TYPE_REGISTRY[typeId];
            handleApplyProperty({
              doorTypeId: typeId,
              penetration_type: def?.renderClass || "door",
              class: def?.renderClass || "door",
              type: def?.doorType || "door"
            });
          }}
        />
      </div>

      <div className="panel-field">
        <span className="panel-label">Door Model (Lockup)</span>
        <SearchableSelect
          value={isMulti ? "" : (activeDoor.door_type || activeDoor.lockup_door_type || activeDoor.product || "")}
          options={category === "external" ? (lockoutDoorTypes.external.length > 0 ? lockoutDoorTypes.external : ["SCX1 D/C", "SCX1 P/PLY", "SCX1 PCM", "SCX1 SPM"]) : (lockoutDoorTypes.internal.length > 0 ? lockoutDoorTypes.internal : ["H1 PCM", "H1 SPM", "H1 PCLC 4.75mm"])}
          placeholder={isMulti ? "(Multiple door models)" : (category === "external" ? "Search model (e.g. SCX1 D/C)..." : "Search model (e.g. H1 PCM)...")}
          allowCustom={true}
          onChange={(val) => {
            handleApplyProperty({
              door_type: val,
              lockup_door_type: val,
              product: val
            });
          }}
        />
      </div>

      <div className="panel-field">
        <span className="panel-label">Material</span>
        <select
          className="panel-select"
          value={activeDoor.material || "timber"}
          onChange={(e) => handleApplyProperty({ material: e.target.value })}
        >
          {MATERIAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="panel-field">
        <span className="panel-label">Fire Rating</span>
        <select
          className="panel-select"
          value={activeDoor.fireRating || "none"}
          onChange={(e) => handleApplyProperty({ fireRating: e.target.value })}
        >
          {FIRE_RATING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="panel-field">
        <span className="panel-label">Status</span>
        <select
          className="panel-select"
          value={activeDoor.status || "active"}
          onChange={(e) => handleApplyProperty({ status: e.target.value })}
        >
          <option value="active">Active</option>
          <option value="deleted">Deleted</option>
          <option value="superseded">Superseded</option>
        </select>
      </div>

      <div className="panel-field">
        <span className="panel-label">Width (mm)</span>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="number"
            className="panel-input"
            style={{ flex: 1 }}
            placeholder={isMulti && !effectiveDoorWidthMm ? "(Multiple values)" : ""}
            value={effectiveDoorWidthMm}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!isNaN(val) && val > 0) {
                handleApplyProperty({ width_mm: val, width_source: "manual" });
              }
            }}
          />
          <select
            className="panel-select"
            style={{ width: "100px" }}
            value={effectiveDoorWidthMm || ""}
            onChange={(e) => {
              if (e.target.value) {
                handleApplyProperty({ width_mm: Number(e.target.value), width_source: "manual" });
              }
            }}
          >
            <option value="">Presets</option>
            <option value={520}>520</option>
            <option value={620}>620</option>
            <option value={720}>720</option>
            <option value={760}>760</option>
            <option value={820}>820</option>
            <option value={870}>870</option>
            <option value={920}>920</option>
            <option value={1020}>1020</option>
            <option value={1520}>1520</option>
            <option value={1640}>1640</option>
            <option value={1800}>1800</option>
            <option value={2400}>2400</option>
            <option value={5000}>5000</option>
          </select>
        </div>
      </div>

      <div className="panel-field">
        <span className="panel-label">Height (mm)</span>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="number"
            className="panel-input"
            style={{ flex: 1 }}
            placeholder={isMulti && !effectiveDoorHeightMm ? "(Multiple values)" : ""}
            value={effectiveDoorHeightMm}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!isNaN(val) && val > 0) {
                handleApplyProperty({ height_mm: val, height: val });
              }
            }}
          />
          <select
            className="panel-select"
            style={{ width: "100px" }}
            value={effectiveDoorHeightMm || ""}
            onChange={(e) => {
              if (e.target.value) {
                const val = Number(e.target.value);
                handleApplyProperty({ height_mm: val, height: val });
              }
            }}
          >
            <option value="">Presets</option>
            <option value={1980}>1980</option>
            <option value={2040}>2040</option>
            <option value={2100}>2100</option>
            <option value={2200}>2200</option>
            <option value={2340}>2340</option>
            <option value={2400}>2400</option>
          </select>
        </div>
      </div>

      <div className="panel-field">
        <span className="panel-label">Hinge Side</span>
        <select
          className="panel-select"
          value={activeDoor.hinge_side || activeDoor.hingeSide || "left"}
          onChange={(e) => handleApplyProperty({ hinge_side: e.target.value, hingeSide: e.target.value })}
        >
          <option value="left">Left Hinge</option>
          <option value="right">Right Hinge</option>
        </select>
      </div>

      <div className="panel-field">
        <span className="panel-label">Swing</span>
        <select
          className="panel-select"
          value={activeDoor.swing_direction || activeDoor.swing || "inward"}
          onChange={(e) => handleApplyProperty({ swing_direction: e.target.value, swing: e.target.value })}
        >
          <option value="inward">Inward Swing</option>
          <option value="outward">Outward Swing</option>
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          className="rp-action-btn rp-action-btn--danger"
          onClick={handleDelete}
        >
          {isMulti ? `Delete Selected (${selectedDoorIds.length}) Doors` : "Delete Selected Door"}
        </button>
      </div>
    </>
  );
}
