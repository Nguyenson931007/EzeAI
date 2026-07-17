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
const PENETRATION_TYPE_OPTIONS = getDoorTypeOptions();


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

  // Determine the initial penetration type from the door class
  const getInitialPenetType = () => {
    if (!door) return 'int_hinged_single';
    if (door.doorTypeId) return door.doorTypeId;
    const cls = door.class || '';
    const isExt = door.class?.includes('ext') || door.doorName?.toLowerCase().includes('external') || door.door_name?.toLowerCase().includes('external');
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

  const [penetrationType, setPenetrationType] = useState('int_hinged_single');
  const [hardwareType, setHardwareType] = useState('passage');
  const [material, setMaterial] = useState('timber');
  const [fireRating, setFireRating] = useState('none');
  const [status, setStatus] = useState('active');
  const [distanceSide, setDistanceSide] = useState('left');
  const [distanceValue, setDistanceValue] = useState(0);
  const [heightMm, setHeightMm] = useState(1980);
  const [widthMm, setWidthMm] = useState(760);
  const [applyToAll, setApplyToAll] = useState(true);
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

  // Initialize form fields when door changes
  useEffect(() => {
    if (!door) return;
    setPenetrationType(getInitialPenetType());
    setHardwareType(door.hardwareType || door.hardware_type || 'passage');
    setMaterial(door.material || 'timber');
    setFireRating(door.fireRating || 'none');
    setStatus(door.status || 'active');
    
    const actDist = getActualCurrentDistance();
    setDistanceSide(actDist.side);
    setDistanceValue(actDist.value);
    setComputedDistances({
      left: actDist.distLeftMm ?? 0,
      right: actDist.distRightMm ?? 0
    });
    
    setHeightMm(door.height_mm || 1980);
    setWidthMm(door.width_mm || 760);
    setApplyToAll(false);
  }, [door, walls, realScale]);

  if (!visible || !door) return null;

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

  const handleSave = () => {
    const parentWall = getParentWall();
    const parsedHeight = Math.max(300, Math.min(2420, parseInt(heightMm) || 1980));
    const parsedWidth = Math.max(300, parseInt(widthMm) || 760);

    const updated = {
      ...door,
      doorTypeId: penetrationType,
      class: doorDef?.renderClass || door.class || 'single_door',
      type: doorDef?.doorType || door.type || 'single',
      penetration_type: doorDef?.renderClass || door.penetration_type || 'single_door',
      hardwareType: hardwareType,
      hardware_type: hardwareType, // legacy
      material: material,
      fireRating: fireRating,
      status: status,
      distance_from: { side: distanceSide, value: distanceValue },
      height_mm: parsedHeight,
      width_mm: parsedWidth,
      width_source: 'manual',
      parentWallId: parentWall?.id || door.parentWallId || null
    };
    onSave(updated, applyToAll);
    onClose();
  };

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
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
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
        width: '520px',
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
            onClick={onClose}
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
          {/* Penetration Type */}
          <div style={rowStyle}>
            <span style={labelStyle}>Penetration Type:</span>
            <select
              value={penetrationType}
              onChange={(e) => setPenetrationType(e.target.value)}
              style={{ ...selectStyle, flex: 1 }}
            >
              {PENETRATION_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Penetration (read-only derived label) */}
          <div style={rowStyle}>
            <span style={labelStyle}>Penetration:</span>
            <input
              type="text"
              readOnly
              value={`${prefix} ${typeLabel.replace(' (Custom Size)', '')} - ${isExternal ? 'External' : 'Internal'}`}
              style={{ ...inputStyle, flex: 1, background: '#f3f4f6', color: '#6b7280', cursor: 'default' }}
            />
          </div>

          {/* Door Hardware Type */}
          <div style={rowStyle}>
            <span style={labelStyle}>Door Hardware Type:</span>
            <select
              value={hardwareType}
              onChange={(e) => setHardwareType(e.target.value)}
              style={{ ...selectStyle, flex: 1 }}
            >
              {HARDWARE_TYPES.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Material */}
          <div style={rowStyle}>
            <span style={labelStyle}>Material:</span>
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              style={{ ...selectStyle, flex: 1 }}
            >
              {MATERIAL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Fire Rating */}
          <div style={rowStyle}>
            <span style={labelStyle}>Fire Rating:</span>
            <select
              value={fireRating}
              onChange={(e) => setFireRating(e.target.value)}
              style={{ ...selectStyle, flex: 1 }}
            >
              {FIRE_RATING_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div style={rowStyle}>
            <span style={labelStyle}>Status:</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ ...selectStyle, flex: 1 }}
            >
              <option value="active">Active</option>
              <option value="deleted">Deleted</option>
              <option value="superseded">Superseded</option>
            </select>
          </div>

          {/* Distance From */}
          <div style={rowStyle}>
            <span style={labelStyle}>
              Distance from <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span>
            </span>
            <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
              <select
                value={distanceSide}
                onChange={(e) => {
                  const newSide = e.target.value;
                  setDistanceSide(newSide);
                  setDistanceValue(newSide === 'left' ? computedDistances.left : computedDistances.right);
                }}
                style={{ ...selectStyle, width: '80px', flex: 'none' }}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
              <input
                type="number"
                min="0"
                value={distanceValue}
                onChange={(e) => setDistanceValue(Math.max(0, parseInt(e.target.value) || 0))}
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap', minWidth: '70px' }}>
                {distanceMmDisplay}
              </span>
            </div>
          </div>

          {/* Height */}
          <div style={rowStyle}>
            <span style={labelStyle}>
              Height <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>(mm, min. 300, max. 2420)</span>
              <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span>
            </span>
            <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
              <input
                type="number"
                min="300"
                max="2420"
                value={heightMm}
                onChange={(e) => setHeightMm(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap', minWidth: '70px' }}>
                {heightDisplay}
              </span>
            </div>
          </div>

          {/* Width */}
          <div style={rowStyle}>
            <span style={labelStyle}>
              Width <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>(mm, min. 300)</span>
              <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span>
            </span>
            <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
              <input
                type="number"
                min="300"
                value={widthMm}
                onChange={(e) => setWidthMm(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap', minWidth: '70px' }}>
                {parseInt(widthMm) || 0}mm
              </span>
            </div>
          </div>

          {/* Apply to all checkbox */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '8px',
            padding: '10px 0',
            borderTop: '1px solid #f3f4f6'
          }}>
            <input
              type="checkbox"
              id="applyToAll"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#3b82f6' }}
            />
            <label htmlFor="applyToAll" style={{ fontSize: '13px', color: '#4b5563', cursor: 'pointer' }}>
              Apply changes to all <b>doors</b> of the same (initial) type.
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '16px 20px',
          borderTop: '1px solid #e5e7eb',
          background: '#f9fafb',
          borderRadius: '0 0 8px 8px',
          gap: '12px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 28px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              fontSize: '13px',
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
            onClick={handleSave}
            style={{
              padding: '8px 28px',
              borderRadius: '4px',
              border: '1px solid #2563eb',
              background: '#3b82f6',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              boxShadow: '0 1px 3px rgba(59,130,246,0.3)'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#2563eb'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#3b82f6'; }}
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
