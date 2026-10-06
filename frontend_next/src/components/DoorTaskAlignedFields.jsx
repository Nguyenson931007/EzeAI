import React, { useEffect, useMemo, useState } from "react";
import { getActiveClientShortName } from "@/constants/clients";
import { getFixoutParity, getLockupParity, FIXOUT_FURNITURE } from "@/constants/procurementFormParity";
import { getDoorProcurementTask } from "@/utils/doorTaskFieldBridge";
import { ApiService } from "@/models/api.service";

const uniq = (items = []) => Array.from(new Set(items.filter((v) => v !== undefined && v !== null).map(String)));
const withCurrent = (items, value) => uniq([...(items || []), ...(value !== undefined && value !== null && String(value) ? [value] : [])]);
const lower = (v) => String(v || "").trim().toLowerCase();
const isCavity = (v) => ["cavity", "sliding", "bifold"].includes(lower(v));
const firstFilled = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
const inferOpeningCategory = (door = {}) => {
  const explicit = lower(door.category);
  if (["cavity", "sliding", "bifold", "prehung", "loose-jamb"].includes(explicit)) return explicit;
  const source = [door.doorTypeId, door.penetration_type, door.class, door.class_name, door.type]
    .filter(Boolean).join(" ").toLowerCase();
  if (/bifold|bi-fold/.test(source)) return "bifold";
  if (/sliding|slider/.test(source)) return "sliding";
  if (/cavity/.test(source)) return "cavity";
  return lower(door.mode).includes("loose") ? "loose-jamb" : "prehung";
};

function Field({ label, value, onChange, options, type = "text", disabled = false }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</span>
      {options ? (
        <select value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", height: 34, border: "1px solid #cbd5e1", borderRadius: 5, padding: "0 8px", background: disabled ? "#f1f5f9" : "#fff", fontSize: 12 }}>
          <option value="">—</option>
          {withCurrent(options, value).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      ) : (
        <input type={type} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", height: 34, boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 5, padding: "0 8px", background: disabled ? "#f1f5f9" : "#fff", fontSize: 12 }} />
      )}
    </label>
  );
}

export function buildTaskDraft(door = {}) {
  const task = getDoorProcurementTask(door);
  const ext = lower(door.scope || door.location).includes("ext") || door.is_ext || door.is_exterior || door.isExternal || String(door.doorTypeId || "").startsWith("ext_");
  const label = door.door_label || door.door_name || door.doorName || door.doorLabel || door.label || door.name || "";
  if (task === "fixout") {
    return {
      task: "fixout",
      door_label: label,
      category: inferOpeningCategory(door),
      // Canvas location stays separate from Fixout category.
      location: ext ? "External" : "Internal",
      height: String(door.height_mm ?? door.height ?? "2040"),
      width: String(door.width_mm ?? door.width ?? "820"),
      thicks: String(firstFilled(door.fixout_thicks, door.procurement_thickness, door.thicks, door.leaf_thickness, door.door_thickness, "35")).replace(/mm/gi, ""),
      wall_width: String(door.wall_width ?? "90").replace(/mm/gi, "").replace(/\s*wall$/i, ""),
      door_frame: door.door_frame || door.jamb_size || "",
      handing: door.handing || door.hung || "",
      lift_off_pivot: door.lift_off_pivot || "",
      hole: door.hole || door.internal_type || "",
      finish: door.finish || door.color || "",
      door_type: door.door_type || door.product || "",
      door_stop: door.door_stop || door.stop || "",
      door_furniture: door.door_furniture || "",
    };
  }
  return {
    task: "lockup",
    category: door.category || (ext ? "Prehung" : "Loose Jamb"),
    location: ext ? "External" : "Internal",
    label,
    door_type: door.door_type || door.lockup_door_type || door.product || "",
    height: String(door.height_mm ?? door.height ?? "2040"),
    width: String(door.width_mm ?? door.width ?? "820"),
    thickness: String(firstFilled(door.lockup_thickness, door.procurement_thickness, door.door_thickness, door.thicks, "35")).replace(/mm/gi, ""),
    jamb_or_wall: door.jamb_or_wall || door.jambWall || (ext ? "110mm Brick Veneer" : "90mm Timber Stud"),
    jamb_size: door.jamb_size || door.jambSize || "",
    hung: door.hung || door.handing || "",
    type: door.lockup_type || (door.type && !/^(single|sliding|door|hinged|bifold|window)$/i.test(String(door.type)) ? door.type : ""),
    internal_type: door.internal_type || door.hole || "",
    color: door.color || door.finish || "",
    door_stop: door.door_stop || door.stop || "",
    door_furniture: door.door_furniture || "",
  };
}

const procurementHungToCanvasHinge = (value = "") => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("left") || raw.startsWith("lh") || raw === "hung b") return "left";
  if (raw.includes("right") || raw.startsWith("rh") || raw === "hung a") return "right";
  return "";
};

export function taskDraftToDoorPatch(draft = {}) {
  const label = String(draft.door_label || draft.label || "").trim();
  const common = label ? { door_label: label, door_name: label, doorName: label, doorLabel: label, label, name: label } : {};
  if (draft.task === "fixout") {
    const hung = draft.handing || draft.lift_off_pivot || "";
    const hinge = procurementHungToCanvasHinge(hung);
    const ext = draft.location === "External";
    return {
      ...common,
      procurementTask: "fixout", procurement_task: "fixout",
      category: draft.category,
      // Location is canvas metadata only; keep it independent from Fixout category.
      location: ext ? "external" : "internal", scope: ext ? "external" : "internal",
      is_ext: ext, is_exterior: ext, isExternal: ext,
      height: Number(draft.height) || draft.height, height_mm: Number(draft.height) || undefined,
      width: Number(draft.width) || draft.width, width_mm: Number(draft.width) || undefined, width_source: "manual",
      thicks: draft.thicks, fixout_thicks: draft.thicks, procurement_thickness: draft.thicks,
      door_thickness: draft.thicks, leaf_thickness: draft.thicks,
      wall_width: draft.wall_width, door_frame: draft.door_frame, handing: draft.handing, lift_off_pivot: draft.lift_off_pivot,
      hung, ...(hinge ? { hinge_side: hinge, hingeSide: hinge } : {}), hole: draft.hole, finish: draft.finish, door_type: draft.door_type, product: draft.door_type,
      door_stop: draft.door_stop, stop: draft.door_stop, door_furniture: draft.door_furniture,
    };
  }
  const ext = draft.location === "External";
  const hinge = procurementHungToCanvasHinge(draft.hung);
  return {
    ...common,
    procurementTask: "lockup", procurement_task: "lockup",
    category: draft.category, location: ext ? "external" : "internal", scope: ext ? "external" : "internal",
    is_ext: ext, is_exterior: ext, isExternal: ext,
    door_type: draft.door_type, lockup_door_type: draft.door_type, product: draft.door_type,
    height: Number(draft.height) || draft.height, height_mm: Number(draft.height) || undefined,
    width: Number(draft.width) || draft.width, width_mm: Number(draft.width) || undefined, width_source: "manual",
    lockup_thickness: draft.thickness, procurement_thickness: draft.thickness,
    door_thickness: draft.thickness, thicks: draft.thickness,
    jamb_or_wall: draft.jamb_or_wall, jambWall: draft.jamb_or_wall, jamb_size: draft.jamb_size, jambSize: draft.jamb_size,
    hung: draft.hung, ...(hinge ? { hinge_side: hinge, hingeSide: hinge } : {}), lockup_type: draft.type, internal_type: draft.internal_type, hole: draft.internal_type,
    color: draft.color, finish: draft.color, door_stop: draft.door_stop, stop: draft.door_stop,
    door_furniture: draft.door_furniture,
  };
}

export default function DoorTaskAlignedFields({ door, draft: controlledDraft, onDraftChange, compact = false }) {
  const customer = getActiveClientShortName();
  const [localDraft, setLocalDraft] = useState(() => buildTaskDraft(door));
  const draft = controlledDraft || localDraft;
  const setDraft = (next) => { if (onDraftChange) onDraftChange(next); else setLocalDraft(next); };
  useEffect(() => { if (!controlledDraft) setLocalDraft(buildTaskDraft(door)); }, [door, controlledDraft]);
  const task = draft.task || getDoorProcurementTask(door);
  const lock = useMemo(() => getLockupParity(customer), [customer]);
  const fix = useMemo(() => getFixoutParity(customer), [customer]);
  const [doorLists, setDoorLists] = useState({ internal: [], external: [], prehung: [], loose: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = ApiService.getLockoutOptions ? await ApiService.getLockoutOptions(customer) : null;
        const data = res?.data || res || {};
        if (!alive) return;
        setDoorLists({
          internal: data.internal || data.prehung_internal || [], external: data.external || [],
          prehung: data.prehung_internal || data.internal || [], loose: data.loose_jamb_internal || data.internal || [],
        });
      } catch (_) {}
    })();
    return () => { alive = false; };
  }, [customer]);

  const change = (key, value) => {
    const next = { ...draft, [key]: value };

    // Keep the same linked behaviour as the Lockup table for external doors:
    // Hung A <-> Type A and Hung B <-> Type B. Do not overwrite custom types.
    if ((draft.task || getDoorProcurementTask(door)) === "lockup" && draft.location === "External") {
      if (key === "hung") {
        const pairedType = value === "Hung A" ? "Type A" : value === "Hung B" ? "Type B" : null;
        const currentType = String(draft.type || "").trim();
        if (pairedType && (!currentType || currentType === "-" || currentType === "Type A" || currentType === "Type B")) {
          next.type = pairedType;
        }
      } else if (key === "type") {
        if (value === "Type A") next.hung = "Hung A";
        else if (value === "Type B") next.hung = "Hung B";
      }
    }

    setDraft(next);
  };
  const grid = { display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(2,minmax(0,1fr))", gap: 10 };

  if (task === "fixout") {
    const cavity = isCavity(draft.category);
    const loose = ["loose-jamb", "loose"].includes(lower(draft.category));
    const heightOptions = cavity ? fix.cavityHeight : fix.height;
    const widthOptions = cavity ? fix.cavityWidth : fix.width;
    const productOptions = cavity || loose ? doorLists.loose : doorLists.prehung;
    const hungOptions = uniq([...(fix.handing || []), ...(fix.liftOff || [])]);
    const furniture = FIXOUT_FURNITURE[cavity ? "cavity" : (loose ? "loose-jamb" : "prehung")] || [];
    return <div style={grid}>
      <Field label="Label" value={draft.door_label} onChange={(v) => change("door_label", v)} />
      <Field label="Category" value={draft.category} onChange={(v) => change("category", v)} options={["cavity","sliding","bifold","prehung","loose-jamb"]} />
      <Field label="Location" value={draft.location} onChange={(v) => change("location", v)} options={["Internal", "External"]} />
      <Field label="Height" value={draft.height} onChange={(v) => change("height", v)} options={heightOptions} />
      <Field label="Width" value={draft.width} onChange={(v) => change("width", v)} options={widthOptions} />
      <Field label="Thicks" value={draft.thicks} onChange={(v) => change("thicks", v)} options={fix.thicks} />
      <Field label="Jamb / wall" value={draft.wall_width} onChange={(v) => change("wall_width", v)} options={fix.wallWidth} />
      <Field label="Jamb Size" value={draft.door_frame} onChange={(v) => change("door_frame", v)} options={fix.frame} />
      <Field label="Hung" value={draft.handing || draft.lift_off_pivot} onChange={(v) => change("handing", v)} options={hungOptions} disabled={cavity} />
      <Field label="Door Type" value={draft.door_type} onChange={(v) => change("door_type", v)} options={productOptions} />
      <Field label="HF/HO" value={draft.hole} onChange={(v) => change("hole", v)} options={fix.hole} disabled={cavity} />
      <Field label="Color" value={draft.finish} onChange={(v) => change("finish", v)} options={fix.finish} disabled={cavity} />
      <Field label="Stop" value={draft.door_stop} onChange={(v) => change("door_stop", v)} options={fix.stop} disabled={cavity} />
      <Field label="Door Furniture" value={draft.door_furniture} onChange={(v) => change("door_furniture", v)} options={furniture} />
    </div>;
  }

  const ext = draft.location === "External";
  const productOptions = ext ? doorLists.external : doorLists.internal;
  const lockFurniture = FIXOUT_FURNITURE[
    isCavity(draft.category) ? "cavity" : (lower(draft.category).includes("loose") ? "loose-jamb" : "prehung")
  ] || FIXOUT_FURNITURE.prehung;
  return <div style={grid}>
    <Field label="Label" value={draft.label} onChange={(v) => change("label", v)} />
    <Field label="Location" value={draft.location} onChange={(v) => change("location", v)} options={["Internal", "External"]} />
    <Field label="Door Type" value={draft.door_type} onChange={(v) => change("door_type", v)} options={productOptions} />
    <Field label="Height" value={draft.height} onChange={(v) => change("height", v)} options={lock.heights} />
    <Field label="Width" value={draft.width} onChange={(v) => change("width", v)} options={lock.widths} />
    <Field label="Thicks" value={draft.thickness} onChange={(v) => change("thickness", v)} options={ext ? lock.externalThicknesses : lock.thicknesses} />
    <Field label="Jamb / wall" value={draft.jamb_or_wall} onChange={(v) => change("jamb_or_wall", v)} options={ext ? [] : lock.internalJambOrWall} />
    <Field label="Jamb Size" value={draft.jamb_size} onChange={(v) => change("jamb_size", v)} options={lock.looseJambs} />
    <Field label="Hung" value={draft.hung} onChange={(v) => change("hung", v)} options={ext ? lock.externalHung : lock.internalHung} />
    <Field label="Type" value={draft.type} onChange={(v) => change("type", v)} options={ext ? lock.externalTypes : ["-", ...(lock.internalTypes || [])]} />
    <Field label="HF/HO" value={draft.internal_type} onChange={(v) => change("internal_type", v)} options={lock.internalHoles} disabled={ext} />
    <Field label="Color" value={draft.color} onChange={(v) => change("color", v)} options={lock.internalFinishes} disabled={ext} />
    <Field label="Stop" value={draft.door_stop} onChange={(v) => change("door_stop", v)} options={lock.doorStops} />
    <Field label="Door Furniture" value={draft.door_furniture} onChange={(v) => change("door_furniture", v)} options={lockFurniture} />
  </div>;
}
