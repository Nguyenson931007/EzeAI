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
  updateDoor,
  deleteDoor,
  realScale,
  scaleValue,
  showConfirm = window.confirm
}) {
  if (!selectedDoor) return null;

  const isSelectedWindow =
    (selectedDoor.type === "window" ||
      selectedDoor.class === "window" ||
      selectedDoor.doorTypeId === "win_standard" ||
      (selectedDoor.doorName && selectedDoor.doorName.startsWith("W-"))) &&
    selectedDoor.class !== "sliding_door" &&
    selectedDoor.type !== "sliding";

  if (isSelectedWindow) {
    const effectiveWindowWidthMm = getDoorWindowDisplayWidthMm(selectedDoor, realScale, scaleValue);
    const effectiveWindowHeightMm = selectedDoor.height_mm || 1200;

    return (
      <>
        <div className="panel-field">
          <span className="panel-label">Window ID</span>
          <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: "bold" }}>
            {selectedDoor.id}
          </div>
        </div>

        <div className="panel-field">
          <span className="panel-label">Window Name</span>
          <input
            className="panel-input"
            value={selectedDoor.door_name || ""}
            onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, door_name: e.target.value })}
          />
        </div>

        <div className="panel-field">
          <span className="panel-label">Window Type</span>
          <select
            className="panel-select"
            value={selectedDoor.doorTypeId || selectedDoor.penetration_type || selectedDoor.penetrationType || "win_standard"}
            onChange={(e) => {
              const typeId = e.target.value;
              const def = DOOR_TYPE_REGISTRY[typeId];
              updateDoor &&
                updateDoor({
                  ...selectedDoor,
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
            value={selectedDoor.material || "glass"}
            onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, material: e.target.value })}
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
            value={selectedDoor.status || "active"}
            onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, status: e.target.value })}
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
              value={effectiveWindowWidthMm}
              onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value), width_source: "manual" })}
            />
            <select
              className="panel-select"
              style={{ width: "100px" }}
              value={effectiveWindowWidthMm || ""}
              onChange={(e) => {
                if (e.target.value) {
                  updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value), width_source: "manual" });
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
              value={effectiveWindowHeightMm}
              onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, height_mm: Number(e.target.value) })}
            />
            <select
              className="panel-select"
              style={{ width: "100px" }}
              value={effectiveWindowHeightMm || ""}
              onChange={(e) => {
                if (e.target.value) {
                  updateDoor && updateDoor({ ...selectedDoor, height_mm: Number(e.target.value) });
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
            onClick={async (e) => {
              e.stopPropagation();
              if (await showConfirm("Are you sure you want to delete this window?")) {
                deleteDoor && deleteDoor(selectedDoor.id);
              }
            }}
          >
            Delete Selected Window
          </button>
        </div>
      </>
    );
  }

  const parentWall = selectedDoor.parentWallId ? walls.find((w) => w.id === selectedDoor.parentWallId) : null;
  const isParentWallExt = parentWall && (parentWall.class_name === "exterior_wall" || parentWall.type === "ext" || parentWall.is_ext || parentWall.is_exterior);
  const isExt = Boolean(
    selectedDoor.is_ext ||
      selectedDoor.is_exterior ||
      selectedDoor.location === "external" ||
      isParentWallExt ||
      (selectedDoor.class || "").includes("ext") ||
      (selectedDoor.door_name || selectedDoor.doorName || "").toLowerCase().includes("external")
  );
  const category = isExt ? "external" : "internal";
  const isSlidingClass =
    selectedDoor.type === "sliding" ||
    (selectedDoor.class && (selectedDoor.class.includes("sliding") || selectedDoor.class.includes("slider"))) ||
    (selectedDoor.penetration_type && (selectedDoor.penetration_type.includes("sliding") || selectedDoor.penetration_type.includes("slider"))) ||
    (selectedDoor.door_name || selectedDoor.doorName || "").toLowerCase().includes("slider");

  let activeDoorTypeId = selectedDoor.doorTypeId;
  if (!activeDoorTypeId || !DOOR_TYPE_REGISTRY[activeDoorTypeId] || (isSlidingClass && activeDoorTypeId.includes("hinged"))) {
    activeDoorTypeId = resolveDoorTypeId(isSlidingClass ? "sliding" : selectedDoor.doorTypeId || selectedDoor.class || selectedDoor.type || selectedDoor.penetration_type, category);
  }

  const effectiveDoorWidthMm = getDoorWindowDisplayWidthMm(selectedDoor, realScale, scaleValue);
  const effectiveDoorHeightMm = selectedDoor.height_mm || 1980;

  return (
    <>
      <div className="panel-field">
        <span className="panel-label">Door ID</span>
        <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: "bold" }}>
          {selectedDoor.id}
        </div>
      </div>

      <div className="panel-field">
        <span className="panel-label">Door Name</span>
        <input
          className="panel-input"
          value={selectedDoor.door_name || ""}
          onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, door_name: e.target.value })}
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
            updateDoor &&
              updateDoor({
                ...selectedDoor,
                is_ext: nextCat === "external",
                is_exterior: nextCat === "external",
                location: nextCat,
                doorTypeId: newTypeId,
                penetration_type: def?.renderClass || selectedDoor.penetration_type,
                class: def?.renderClass || selectedDoor.class
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
            updateDoor &&
              updateDoor({
                ...selectedDoor,
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
          value={selectedDoor.material || "timber"}
          onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, material: e.target.value })}
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
          value={selectedDoor.fireRating || "none"}
          onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, fireRating: e.target.value })}
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
          value={selectedDoor.status || "active"}
          onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, status: e.target.value })}
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
            value={effectiveDoorWidthMm}
            onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value), width_source: "manual" })}
          />
          <select
            className="panel-select"
            style={{ width: "100px" }}
            value={effectiveDoorWidthMm || ""}
            onChange={(e) => {
              if (e.target.value) {
                updateDoor && updateDoor({ ...selectedDoor, width_mm: Number(e.target.value), width_source: "manual" });
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
            value={effectiveDoorHeightMm}
            onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, height_mm: Number(e.target.value) })}
          />
          <select
            className="panel-select"
            style={{ width: "100px" }}
            value={effectiveDoorHeightMm || ""}
            onChange={(e) => {
              if (e.target.value) {
                updateDoor && updateDoor({ ...selectedDoor, height_mm: Number(e.target.value) });
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
          value={selectedDoor.hinge_side || selectedDoor.hingeSide || "left"}
          onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, hinge_side: e.target.value, hingeSide: e.target.value })}
        >
          <option value="left">Left Hinge</option>
          <option value="right">Right Hinge</option>
        </select>
      </div>

      <div className="panel-field">
        <span className="panel-label">Swing</span>
        <select
          className="panel-select"
          value={selectedDoor.swing_direction || selectedDoor.swing || "inward"}
          onChange={(e) => updateDoor && updateDoor({ ...selectedDoor, swing_direction: e.target.value, swing: e.target.value })}
        >
          <option value="inward">Inward Swing</option>
          <option value="outward">Outward Swing</option>
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          className="rp-action-btn rp-action-btn--danger"
          onClick={async (e) => {
            e.stopPropagation();
            if (await showConfirm("Are you sure you want to delete this door?")) {
              deleteDoor && deleteDoor(selectedDoor.id);
            }
          }}
        >
          Delete Selected Door
        </button>
      </div>
    </>
  );
}
