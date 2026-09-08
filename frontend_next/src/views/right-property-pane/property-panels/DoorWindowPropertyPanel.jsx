import React from "react";
import {
  DOOR_TYPE_REGISTRY,
  resolveDoorTypeId,
  getDoorTypeOptions,
  MATERIAL_OPTIONS,
  FIRE_RATING_OPTIONS
} from "@/models/DoorTypeRegistry";
import { getDoorWindowDisplayWidthMm } from "../UIComponents";

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
      ? (selectedDoors.every((d) => (d.height_mm || 1200) === (activeDoor.height_mm || 1200))
          ? (activeDoor.height_mm || 1200)
          : "")
      : (activeDoor.height_mm || 1200);

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
          <select
            className="panel-select"
            value={activeDoor.doorTypeId || activeDoor.penetration_type || activeDoor.penetrationType || "win_standard"}
            onChange={(e) => {
              const typeId = e.target.value;
              const def = DOOR_TYPE_REGISTRY[typeId];
              handleApplyProperty({
                doorTypeId: typeId,
                penetration_type: def?.renderClass || "window",
                class: def?.renderClass || "window",
                type: def?.doorType || "window"
              });
            }}
          >
            {getDoorTypeOptions()
              .filter((o) => {
                const def = DOOR_TYPE_REGISTRY[o.value];
                return def?.doorType === "window" || def?.renderClass === "window" || o.value.includes("win_");
              })
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
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

        <div className="panel-field">
          <span className="panel-label">Height (mm)</span>
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
                  handleApplyProperty({ height_mm: val });
                }
              }}
            />
            <select
              className="panel-select"
              style={{ width: "100px" }}
              value={effectiveWindowHeightMm || ""}
              onChange={(e) => {
                if (e.target.value) {
                  handleApplyProperty({ height_mm: Number(e.target.value) });
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
            </select>
          </div>
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
    ? (selectedDoors.every((d) => (d.height_mm || 1980) === (activeDoor.height_mm || 1980))
        ? (activeDoor.height_mm || 1980)
        : "")
    : (activeDoor.height_mm || 1980);

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
            handleApplyProperty({
              is_ext: nextCat === "external",
              is_exterior: nextCat === "external",
              location: nextCat,
              doorTypeId: newTypeId,
              penetration_type: def?.renderClass || activeDoor.penetration_type,
              class: def?.renderClass || activeDoor.class
            });
          }}
        >
          <option value="internal">Internal Door</option>
          <option value="external">External Door</option>
        </select>
      </div>

      <div className="panel-field">
        <span className="panel-label">Door Type</span>
        <select
          className="panel-select"
          value={activeDoorTypeId}
          onChange={(e) => {
            const typeId = e.target.value;
            const def = DOOR_TYPE_REGISTRY[typeId];
            handleApplyProperty({
              doorTypeId: typeId,
              penetration_type: def?.renderClass || "door",
              class: def?.renderClass || "door",
              type: def?.doorType || "door"
            });
          }}
        >
          {getDoorTypeOptions(category).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
                handleApplyProperty({ height_mm: val });
              }
            }}
          />
          <select
            className="panel-select"
            style={{ width: "100px" }}
            value={effectiveDoorHeightMm || ""}
            onChange={(e) => {
              if (e.target.value) {
                handleApplyProperty({ height_mm: Number(e.target.value) });
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
