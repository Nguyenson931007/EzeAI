import React, { useState, useEffect, useRef } from 'react';
import {
  DOOR_TYPE_REGISTRY,
  getDoorTypeOptions,
  HARDWARE_TYPES,
  MATERIAL_OPTIONS,
  FIRE_RATING_OPTIONS,
  computeDoorHeight,
  WALL_TYPE_DEFAULTS
} from '@/models/DoorTypeRegistry';

import { mergeCollinearWalls } from '@/utils/geometry';
import { getActiveClientShortName } from '@/constants/clients';
import { getDoorProcurementTask } from '@/utils/doorTaskFieldBridge';
import DoorTaskAlignedFields, { buildTaskDraft, taskDraftToDoorPatch } from '@/components/DoorTaskAlignedFields';
const PENETRATION_TYPE_OPTIONS = getDoorTypeOptions();

const getPenetrationTypeUiLabel = (option = {}) => {
  const value = String(option.value || "").toLowerCase();
  const label = String(option.label || "");
  if (value === "int_cavity_slider" || /cavity\s+slider/i.test(label)) return "Cavity";
  return label;
};


/**
 * DoorEditDialog — Modal dialog for editing door properties.
 *
 * Props:
 *   visible      — Boolean
 *   door         — Door data object to edit
 *   onSave       — Callback(updatedDoor) to save
 *   onClose      — Callback to dismiss
 *   walls        — Wall array (for distance calculations)
 *   realScale    — mm-per-pixel scale factor
 */
export default function DoorEditDialog({
  visible,
  door,
  onSave,
  onClose,
  walls = [],
  realScale = 1.0
}) {
  const overlayRef = useRef(null);
  const originalDoorRef = useRef(null);
  const hydratingRef = useRef(false);
  const hasLiveChangesRef = useRef(false);

  // Determine the initial penetration type from the door class
  const getInitialPenetType = () => {
    if (!door) return 'int_hinged_single';
    if (door.doorTypeId) return door.doorTypeId;
    const parentWall = door.parentWallId ? walls.find(w => w.id === door.parentWallId) : null;
    const cls = String(door.class || door.class_name || door.penetration_type || door.type || 'single_door');
    const isExtWall = parentWall && (parentWall.class_name === 'exterior_wall' || parentWall.type === 'ext' || parentWall.is_ext || parentWall.is_exterior);
    const isExt = door.is_ext || door.is_exterior || door.location === 'external' || isExtWall || door.class?.includes('ext') || door.doorName?.toLowerCase().includes('external') || door.door_name?.toLowerCase().includes('external');
    const category = isExt ? 'external' : 'internal';
    const prefix = isExt ? 'ext_' : 'int_';
    for (const [key, def] of Object.entries(DOOR_TYPE_REGISTRY)) {
      if (def.renderClass === cls && key.startsWith(prefix)) {
        return key;
      }
    }
    for (const [key, def] of Object.entries(DOOR_TYPE_REGISTRY)) {
      if (def.renderClass === cls) {
        return key;
      }
    }
    return 'int_hinged_single';
  };

  const [displayName, setDisplayName] = useState('');
  const [penetrationType, setPenetrationType] = useState('int_hinged_single');
  const [hardwareType, setHardwareType] = useState('passage');
  const [material, setMaterial] = useState('timber');
  const [fireRating, setFireRating] = useState('none');
  const [status, setStatus] = useState('active');
  const [taskDraft, setTaskDraft] = useState(() => buildTaskDraft(door || {}));
  const [distanceSide, setDistanceSide] = useState('left');
  const [distanceValue, setDistanceValue] = useState(0);
  const [heightMm, setHeightMm] = useState(1980);
  const [widthMm, setWidthMm] = useState(760);
  const [swingDirection, setSwingDirection] = useState('inward');
  const [computedDistances, setComputedDistances] = useState({ left: 0, right: 0 });

  const healedWalls = React.useMemo(() => {
    if (!walls || walls.length === 0) return [];
    return mergeCollinearWalls(walls);
  }, [walls]);

  const getParentWall = () => {
    if (!door || !healedWalls || healedWalls.length === 0) return null;
    if (door.parentWallId) {
      return healedWalls.find(w => w.id === door.parentWallId) || 
             walls.find(w => w.id === door.parentWallId) || null;
    }
    // Proximity lookup
    const points = door.points || [];
    let p1 = points[0] ? (Array.isArray(points[0]) ? { x: points[0][0], y: points[0][1] } : points[0]) : null;
    let p2 = points[1] ? (Array.isArray(points[1]) ? { x: points[1][0], y: points[1][1] } : points[1]) : null;
    if (!p1 || !p2) {
      const poly = door.polygon || door.mask_polygon || [];
      if (poly.length >= 3) {
        const pts = poly.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
        p1 = pts[0];
        p2 = pts[1];
      } else {
        return null;
      }
    }
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    let closestWall = null;
    let minDist = 100;
    healedWalls.forEach(w => {
      if (!w.centerline || w.centerline.length < 2) return;
      const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
      const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
      const dx = wp2.x - wp1.x;
      const dy = wp2.y - wp1.y;
      const L2 = dx * dx + dy * dy;
      let t = L2 < 0.1 ? 0 : ((cx - wp1.x) * dx + (cy - wp1.y) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const dist = Math.hypot(cx - (wp1.x + t * dx), cy - (wp1.y + t * dy));
      if (dist < minDist) {
        minDist = dist;
        closestWall = w;
      }
    });
    return closestWall;
  };

  const getActualCurrentDistance = () => {
    if (!door || !healedWalls || healedWalls.length === 0 || !realScale) return { side: 'left', value: 0 };

    const points = door.points || [];
    let p1 = points[0] ? (Array.isArray(points[0]) ? { x: points[0][0], y: points[0][1] } : points[0]) : null;
    let p2 = points[1] ? (Array.isArray(points[1]) ? { x: points[1][0], y: points[1][1] } : points[1]) : null;

    if (!p1 || !p2) {
      const poly = door.polygon || door.mask_polygon || [];
      if (poly.length >= 3) {
        const pts = poly.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
        p1 = pts[0];
        p2 = pts[1];
      } else {
        return { side: 'left', value: 0 };
      }
    }

    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const doorWidthPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    const closestWall = getParentWall();
    if (!closestWall) return { side: 'left', value: 0 };

    const w1 = { x: closestWall.centerline[0][0], y: closestWall.centerline[0][1] };
    const w2 = { x: closestWall.centerline[1][0], y: closestWall.centerline[1][1] };

    const wdx = w2.x - w1.x;
    const wdy = w2.y - w1.y;
    const wLen = Math.hypot(wdx, wdy);

    const doorDx = p2.x - p1.x;
    const doorDy = p2.y - p1.y;
    const dot = doorDx * wdx + doorDy * wdy;
    const alignedW1 = dot >= 0 ? w1 : w2;
    const alignedW2 = dot >= 0 ? w2 : w1;

    const ux = (alignedW2.x - alignedW1.x) / wLen;
    const uy = (alignedW2.y - alignedW1.y) / wLen;
    const t = (cx - alignedW1.x) * ux + (cy - alignedW1.y) * uy;

    const hingeSide = door.hingeSide || door.hinge_side || 'left';
    const distLeftPx = Math.max(0, t - doorWidthPx / 2);
    const distRightPx = Math.max(0, wLen - t - doorWidthPx / 2);

    const distLeftMm = Math.round(distLeftPx * realScale);
    const distRightMm = Math.round(distRightPx * realScale);

    const side = hingeSide === 'right' ? 'right' : 'left';
    const value = side === 'left' ? distLeftMm : distRightMm;

    return { side, value, distLeftMm, distRightMm };
  };

  // Initialize only when the dialog opens or switches to a different door.
  // Live preview replaces the door object in the parent after every field
  // change; re-hydrating for that new object would immediately reset the
  // dropdown the user just selected.
  useEffect(() => {
    if (!visible || !door) return;
    hydratingRef.current = true;
    hasLiveChangesRef.current = false;
    try {
      originalDoorRef.current = typeof structuredClone === 'function' ? structuredClone(door) : JSON.parse(JSON.stringify(door));
    } catch (_) {
      originalDoorRef.current = { ...door };
    }
    setDisplayName(String(door.door_name || door.doorName || door.doorLabel || door.label || door.name || '').trim());
    setPenetrationType(getInitialPenetType());
    setHardwareType(door.hardwareType || door.hardware_type || 'passage');
    setMaterial(door.material || 'timber');
    setFireRating(door.fireRating || 'none');
    setStatus(door.status || 'active');
    setTaskDraft(buildTaskDraft(door));
    
    const actDist = getActualCurrentDistance();
    setDistanceSide(actDist.side);
    setDistanceValue(actDist.value);
    setComputedDistances({
      left: actDist.distLeftMm ?? 0,
      right: actDist.distRightMm ?? 0
    });
    
    let effW = door.width_mm;
    if (!effW && door.points && door.points.length >= 2) {
      const p1 = Array.isArray(door.points[0]) ? { x: door.points[0][0], y: door.points[0][1] } : door.points[0];
      const p2 = Array.isArray(door.points[1]) ? { x: door.points[1][0], y: door.points[1][1] } : door.points[1];
      const lenPx = Math.hypot((p2.x || 0) - (p1.x || 0), (p2.y || 0) - (p1.y || 0));
      const scale = (typeof realScale === 'number' && realScale > 0) ? realScale : 18.0;
      effW = Math.round(lenPx * scale);
    }

    setHeightMm(door.height_mm || 1980);
    setWidthMm(effW || 760);
    setSwingDirection(door.swing_direction || door.swing || 'inward');

    // Let all initialization state updates settle before live-sync starts.
    const timer = setTimeout(() => { hydratingRef.current = false; }, 0);
    return () => clearTimeout(timer);
  }, [visible, door?.id]);

  // Derive the "Penetration" read-only label
  const doorDef = DOOR_TYPE_REGISTRY[penetrationType];
  const typeLabel = doorDef?.label || 'Custom Door';
  const isExternal = penetrationType.startsWith('ext_');
  const prefix = isExternal ? 'ext_' : 'int_';

  // Convert distance to display
  const distanceMmDisplay = distanceValue > 0
    ? `${Math.floor(distanceValue / 1000)}m ${distanceValue % 1000}mm`
    : '0mm';

  const heightVal = parseInt(heightMm) || 0;
  const heightDisplay = heightVal > 0
    ? `${Math.floor(heightVal / 1000)}m ${heightVal % 1000}mm`
    : '0mm';

  const buildUpdatedDoor = () => {
    const parentWall = getParentWall();
    const parsedHeight = Math.max(300, Math.min(2420, parseInt(heightMm) || 1980));
    const parsedWidth = Math.max(300, parseInt(widthMm) || 760);

    // Lockup uses only three categories/modes: Prehung, Loose and Cavity.
    // Any cavity or sliding penetration is treated as Cavity.
    const lockupModeSource = [
      penetrationType,
      doorDef?.renderClass,
      doorDef?.doorType,
      doorDef?.label
    ].filter(Boolean).join(" ").toLowerCase();
    const lockupMode = /cavity|sliding/.test(lockupModeSource)
      ? "Cavity"
      : (isExternal ? "Prehung" : "Loose");

    const normalizedName = String(displayName || '').trim();
    const updated = {
      ...door,
      ...(normalizedName ? {
        door_name: normalizedName,
        doorName: normalizedName,
        doorLabel: normalizedName,
        door_label: normalizedName,
        name: normalizedName,
      } : {}),
      doorTypeId: penetrationType,
      class: doorDef?.renderClass || door.class || 'single_door',
      type: doorDef?.doorType || door.type || 'single',
      penetration_type: doorDef?.renderClass || door.penetration_type || 'single_door',
      hardwareType: hardwareType,
      hardware_type: hardwareType, // legacy
      material: material,
      fireRating: fireRating,
      status: status,
      // Plan-only geometry fields remain editable even though the procurement fields mirror the task table.
      distance_from: { side: distanceSide, value: distanceValue },
      swing_direction: swingDirection,
      swing: swingDirection,
      parentWallId: parentWall?.id || door.parentWallId || null,
      // Procurement/table fields are applied last so the table-aligned editor is the source of truth.
      // doorTypeId/class/penetration_type above stay the original canvas Penetration Type.
      ...taskDraftToDoorPatch(taskDraft),
      ...(taskDraft.task === "lockup" ? {
        mode: ["cavity", "sliding", "bifold"].includes(String(taskDraft.category || "").toLowerCase()) ? "Cavity" : (String(taskDraft.category || "").toLowerCase().includes("loose") ? "Loose" : "Prehung"),
        lockup_mode: ["cavity", "sliding", "bifold"].includes(String(taskDraft.category || "").toLowerCase()) ? "Cavity" : (String(taskDraft.category || "").toLowerCase().includes("loose") ? "Loose" : "Prehung")
      } : {})
    };
    return updated;
  };

  // Keep the canvas Properties panel and every linked task row on the same
  // in-memory door object while this dialog is open. The task-level Save is
  // still the only database commit point.
  useEffect(() => {
    if (!visible || !door || hydratingRef.current || typeof onSave !== 'function') return;
    hasLiveChangesRef.current = true;
    const updatedDoor = buildUpdatedDoor();
    onSave(updatedDoor, false, {
      stageOnly: true,
      livePreview: true,
      taskKey: getDoorProcurementTask(updatedDoor),
      originalDoor: originalDoorRef.current || door,
    });
  }, [
    visible,
    displayName,
    penetrationType,
    hardwareType,
    material,
    fireRating,
    status,
    taskDraft,
    distanceSide,
    distanceValue,
    heightMm,
    widthMm,
    swingDirection,
  ]);

  const commitAndClose = () => {
    if (door && typeof onSave === 'function') {
      const updatedDoor = buildUpdatedDoor();
      const taskKey = getDoorProcurementTask(updatedDoor);
      // SAVE in this popup is cache-only: stage the plan/task change.
      // The task-level Save button is the actual commit point.
      onSave(updatedDoor, false, {
        stageOnly: true,
        taskKey,
        originalDoor: originalDoorRef.current || door,
      });
    }
    hasLiveChangesRef.current = false;
    onClose();
  };

  const cancelAndClose = () => {
    if (hasLiveChangesRef.current && originalDoorRef.current && typeof onSave === 'function') {
      onSave(originalDoorRef.current, false, { rollback: true });
    }
    hasLiveChangesRef.current = false;
    onClose();
  };

  // Popup edits are staged locally. Only SAVE commits them to the plan/task data.
  // CANCEL / Esc / X / outside click close without applying changes.
  useEffect(() => {
    if (!visible) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelAndClose();
      } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        commitAndClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  if (!visible || !door) return null;

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fff',
    color: '#1e293b',
    transition: 'border-color 0.2s'
  };

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'auto'
  };

  const labelStyle = {
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
    minWidth: '160px',
    display: 'flex',
    alignItems: 'center'
  };

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px'
  };

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) cancelAndClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        animation: 'editDialogFadeIn 0.15s ease-out'
      }}
    >
      <div style={{
        background: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        width: '760px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          background: '#f9fafb',
          borderRadius: '8px 8px 0 0'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>
            Edit Penetration
          </h3>
          <button
            onClick={cancelAndClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '4px',
              lineHeight: 1,
              borderRadius: '4px',
              transition: 'background 0.15s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#e5e7eb'}
            onMouseOut={(e) => e.currentTarget.style.background = 'none'}
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: '20px' }}>
          {/* Penetration Type is intentionally kept separate from Procurement task fields. */}
          <div style={rowStyle}>
            <span style={labelStyle}>Penetration Type:</span>
            <select
              value={penetrationType}
              onChange={(e) => {
                const nextType = e.target.value;
                setPenetrationType(nextType);
                // Location follows the original canvas Penetration Type, while procurement
                // Category/Type remain independent and continue to use task rules.
                const nextLocation = String(nextType).startsWith('ext_') ? 'External' : 'Internal';
                setTaskDraft((prev) => ({ ...prev, location: nextLocation }));
              }}
              style={{ ...selectStyle, flex: 1 }}
            >
              {PENETRATION_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{getPenetrationTypeUiLabel(o)}</option>
              ))}
            </select>
          </div>


          <DoorTaskAlignedFields
            door={door}
            draft={taskDraft}
            onDraftChange={setTaskDraft}
          />

          {/* Keep plan-specific geometry controls that do not belong to the procurement table. */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
              Plan Geometry
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.03em' }}>Distance From</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    value={distanceSide}
                    onChange={(e) => {
                      const side = e.target.value;
                      setDistanceSide(side);
                      setDistanceValue(side === 'left' ? computedDistances.left : computedDistances.right);
                    }}
                    style={{ ...selectStyle, width: 88, flex: 'none', height: 34, padding: '0 8px', fontSize: 12 }}
                  >
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={distanceValue}
                    onChange={(e) => setDistanceValue(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ ...inputStyle, minWidth: 0, height: 34, padding: '0 8px', fontSize: 12 }}
                  />
                </div>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.03em' }}>Swing</span>
                <select
                  value={swingDirection}
                  onChange={(e) => setSwingDirection(e.target.value)}
                  style={{ ...selectStyle, height: 34, padding: '0 8px', fontSize: 12 }}
                >
                  <option value="inward">Inward Swing</option>
                  <option value="outward">Outward Swing</option>
                </select>
              </label>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '10px 16px',
          borderTop: '1px solid #e5e7eb',
          background: '#f9fafb',
          borderRadius: '0 0 8px 8px',
          gap: '8px'
        }}>
          <button
            onClick={cancelAndClose}
            style={{
              minWidth: '78px',
              padding: '6px 14px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; }}
          >
            CANCEL
          </button>
          <button
            onClick={commitAndClose}
            style={{
              minWidth: '78px',
              padding: '6px 14px',
              borderRadius: '4px',
              border: '1px solid #4f6fed',
              background: '#5b7cfa',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#4f6fed'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#5b7cfa'; }}
          >
            SAVE
          </button>
        </div>
      </div>

      <style>{`
        @keyframes editDialogFadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
