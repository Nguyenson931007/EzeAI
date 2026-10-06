import React, { useState, useEffect, useRef } from 'react';
import {
  DOOR_TYPE_REGISTRY,
  FIRE_RATING_OPTIONS,
  findStackedLowerDoor,
} from '@/models/DoorTypeRegistry';

import { mergeCollinearWalls } from '@/utils/geometry';

// ── Window-specific option lists ──

const WINDOW_TYPE_OPTIONS = [
  { value: 'win_standard', label: 'Standard Window' },
  { value: 'win_raked', label: 'Raked Window (Trapezoid)' },
  { value: 'win_custom', label: 'Custom Window' },
];

const GLAZING_TYPE_OPTIONS = [
  { value: 'single', label: 'Single Glazed' },
  { value: 'double', label: 'Double Glazed' },
  { value: 'triple', label: 'Triple Glazed' },
  { value: 'laminated', label: 'Laminated' },
  { value: 'tempered', label: 'Tempered' },
  { value: 'low_e', label: 'Low-E' },
  { value: 'frosted', label: 'Frosted' },
  { value: 'tinted', label: 'Tinted' },
];

const FRAME_MATERIAL_OPTIONS = [
  { value: 'aluminium', label: 'Aluminium' },
  { value: 'timber', label: 'Timber' },
  { value: 'upvc', label: 'uPVC' },
  { value: 'steel', label: 'Steel' },
  { value: 'composite', label: 'Composite' },
];

const OPERATION_TYPE_OPTIONS = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'sliding', label: 'Sliding' },
  { value: 'casement', label: 'Casement' },
  { value: 'awning', label: 'Awning' },
  { value: 'hopper', label: 'Hopper' },
  { value: 'double_hung', label: 'Double Hung' },
  { value: 'louvre', label: 'Louvre' },
];

/**
 * WindowEditDialog — Modal dialog for editing window properties.
 *
 * Props:
 *   visible      — Boolean
 *   door         — Window data object to edit (uses the same data model as doors)
 *   onSave       — Callback(updatedWindow) to save
 *   onClose      — Callback to dismiss
 *   walls        — Wall array (for distance calculations)
 *   realScale    — mm-per-pixel scale factor
 */
export default function WindowEditDialog({
  visible,
  door,
  onSave,
  onClose,
  walls = [],
  doors = [],
  realScale = 1.0
}) {
  const overlayRef = useRef(null);
  const originalDoorRef = useRef(null);

  const getInitialWindowType = () => {
    if (!door) return 'win_standard';
    if (door.doorTypeId && door.doorTypeId.startsWith('win_')) return door.doorTypeId;
    return 'win_standard';
  };

  const [displayName, setDisplayName] = useState('');
  const [windowType, setWindowType] = useState('win_standard');
  const [glazingType, setGlazingType] = useState('single');
  const [frameMaterial, setFrameMaterial] = useState('aluminium');
  const [operationType, setOperationType] = useState('fixed');
  const [fireRating, setFireRating] = useState('none');
  const [status, setStatus] = useState('active');
  const [distanceSide, setDistanceSide] = useState('left');
  const [distanceValue, setDistanceValue] = useState(0);
  const [sillHeight, setSillHeight] = useState(900);
  const [heightMm, setHeightMm] = useState(1200);
  const [height2Mm, setHeight2Mm] = useState(1200);
  const [widthMm, setWidthMm] = useState(1200);
  const [applyToAll, setApplyToAll] = useState(false);
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

    const distLeftPx = Math.max(0, t - doorWidthPx / 2);
    const distRightPx = Math.max(0, wLen - t - doorWidthPx / 2);

    const distLeftMm = Math.round(distLeftPx * realScale);
    const distRightMm = Math.round(distRightPx * realScale);

    const side = 'left';
    const value = distLeftMm;

    return { side, value, distLeftMm, distRightMm };
  };

  // Initialize form fields when window changes
  useEffect(() => {
    if (!door) return;
    try {
      originalDoorRef.current = typeof structuredClone === 'function' ? structuredClone(door) : JSON.parse(JSON.stringify(door));
    } catch (_) {
      originalDoorRef.current = { ...door };
    }
    setDisplayName(String(door.door_name || door.doorName || door.doorLabel || door.label || door.name || '').trim());
    setWindowType(getInitialWindowType());
    setGlazingType(door.glazingType || door.glazing_type || 'single');
    setFrameMaterial(door.frameMaterial || door.frame_material || door.material || 'aluminium');
    setOperationType(door.operationType || door.operation_type || 'fixed');
    setFireRating(door.fireRating || 'none');
    setStatus(door.status || 'active');
    
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
      let calcMm = Math.round(lenPx * scale);
      const STANDARD_DIMENSIONS = [600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3600, 4200, 4800];
      for (const stdW of STANDARD_DIMENSIONS) {
        const snapTol = Math.max(120, stdW * 0.10);
        if (Math.abs(calcMm - stdW) <= snapTol) {
          calcMm = stdW;
          break;
        }
      }
      effW = calcMm;
    }

    const stackedLower = findStackedLowerDoor(door, doors, walls);
    const defaultSill = stackedLower ? Number(stackedLower.height_mm || stackedLower.height || 2040) : 900;
    setSillHeight(door.sillHeight || door.sill_height || defaultSill);
    const initH1 = door.height_mm || 1200;
    setHeightMm(initH1);
    setHeight2Mm((door.height2_mm !== undefined && door.height2_mm !== null) ? door.height2_mm : initH1);
    setWidthMm(effW || 1200);
    setApplyToAll(false);
  }, [door, walls, doors, realScale]);

  if (!visible || !door) return null;

  const windowDef = DOOR_TYPE_REGISTRY[windowType];

  // Convert distance to display
  const distanceMmDisplay = distanceValue > 0
    ? `${Math.floor(distanceValue / 1000)}m ${distanceValue % 1000}mm`
    : '0mm';

  const heightVal = parseInt(heightMm) || 0;
  const heightDisplay = heightVal > 0
    ? `${Math.floor(heightVal / 1000)}m ${heightVal % 1000}mm`
    : '0mm';

  const sillVal = parseInt(sillHeight) || 0;
  const sillDisplay = sillVal > 0
    ? `${Math.floor(sillVal / 1000)}m ${sillVal % 1000}mm`
    : '0mm';

  const handleSave = () => {
    const parentWall = getParentWall();
    const isRaked = windowType === 'win_raked';
    const parsedHeight = Math.max(200, Math.min(3000, parseInt(heightMm) || 1200));
    const parsedHeight2 = isRaked
      ? Math.max(200, Math.min(3000, parseInt(height2Mm) || parsedHeight))
      : parsedHeight;
    const parsedWidth = Math.max(200, parseInt(widthMm) || 1200);
    const parsedSill = Math.max(0, Math.min(3500, parseInt(sillHeight) || 900));

    const normalizedName = String(displayName || '').trim();
    const updated = {
      ...door,
      ...(normalizedName ? {
        door_name: normalizedName,
        doorName: normalizedName,
        doorLabel: normalizedName,
        label: normalizedName,
        name: normalizedName,
      } : {}),
      doorTypeId: windowType,
      class: windowDef?.renderClass || 'window',
      type: windowDef?.doorType || 'window',
      penetration_type: 'window',
      glazingType: glazingType,
      glazing_type: glazingType,
      frameMaterial: frameMaterial,
      frame_material: frameMaterial,
      material: frameMaterial,
      operationType: operationType,
      operation_type: operationType,
      fireRating: fireRating,
      status: status,
      distance_from: { side: distanceSide, value: distanceValue },
      sillHeight: parsedSill,
      sill_height: parsedSill,
      height_mm: parsedHeight,
      height2_mm: parsedHeight2,
      height: parsedHeight,
      is_raked: isRaked && parsedHeight !== parsedHeight2,
      width_mm: parsedWidth,
      width_source: 'manual',
      parentWallId: parentWall?.id || door.parentWallId || null
    };
    onSave(updated, applyToAll, {
      stageOnly: true,
      taskKey: "windows",
      originalDoor: originalDoorRef.current || door,
    });
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
          background: '#eef2ff',
          borderRadius: '8px 8px 0 0'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e3a5f' }}>
            🪟 Edit Window
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
          {/* Drawing label / name — shared by plan + task rows */}
          <div style={rowStyle}>
            <span style={labelStyle}>Label / Name:</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder="e.g. W-01, Kitchen Window"
              style={{ ...inputStyle, flex: 1, fontWeight: 700 }}
            />
          </div>

          {/* Window Type */}
          <div style={rowStyle}>
            <span style={labelStyle}>Window Type:</span>
            <select
              value={windowType}
              onChange={(e) => {
                const newType = e.target.value;
                setWindowType(newType);
                if (newType !== 'win_raked') {
                  setHeight2Mm(heightMm);
                } else {
                  const h1 = parseInt(heightMm) || 1200;
                  const h2 = parseInt(height2Mm) || h1;
                  if (h1 === h2) {
                    setHeight2Mm(h1 > 1000 ? h1 - 300 : 900);
                  }
                }
              }}
              style={{ ...selectStyle, flex: 1 }}
            >
              {WINDOW_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Operation Type */}
          <div style={rowStyle}>
            <span style={labelStyle}>Operation Type:</span>
            <select
              value={operationType}
              onChange={(e) => setOperationType(e.target.value)}
              style={{ ...selectStyle, flex: 1 }}
            >
              {OPERATION_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Glazing Type */}
          <div style={rowStyle}>
            <span style={labelStyle}>Glazing Type:</span>
            <select
              value={glazingType}
              onChange={(e) => setGlazingType(e.target.value)}
              style={{ ...selectStyle, flex: 1 }}
            >
              {GLAZING_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Frame Material */}
          <div style={rowStyle}>
            <span style={labelStyle}>Frame Material:</span>
            <select
              value={frameMaterial}
              onChange={(e) => setFrameMaterial(e.target.value)}
              style={{ ...selectStyle, flex: 1 }}
            >
              {FRAME_MATERIAL_OPTIONS.map(o => (
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

          {/* Sill Height */}
          <div style={rowStyle}>
            <span style={labelStyle}>
              Sill Height <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>(mm)</span>
              <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span>
            </span>
            <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
              <input
                type="number"
                min="0"
                max="3500"
                value={sillHeight}
                onChange={(e) => setSillHeight(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <span style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap', minWidth: '70px' }}>
                {sillDisplay}
              </span>
            </div>
          </div>

          {/* Height section: Single input for standard window, side-by-side inputs for raked window */}
          {windowType !== 'win_raked' ? (
            <div style={rowStyle}>
              <span style={labelStyle}>
                Height <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>(mm)</span>
                <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span>
              </span>
              <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
                <input
                  type="number"
                  min="200"
                  max="3000"
                  value={heightMm}
                  onChange={(e) => {
                    setHeightMm(e.target.value);
                    setHeight2Mm(e.target.value);
                  }}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <span style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap', minWidth: '70px' }}>
                  {heightDisplay}
                </span>
              </div>
            </div>
          ) : (
            <div style={rowStyle}>
              <span style={labelStyle}>
                Heights <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>(L & R mm)</span>
                <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span>
              </span>
              <div style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>Height 1 / Left</div>
                  <input
                    type="number"
                    min="200"
                    max="3000"
                    value={heightMm}
                    onChange={(e) => setHeightMm(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>Height 2 / Right</div>
                  <input
                    type="number"
                    min="200"
                    max="3000"
                    value={height2Mm}
                    onChange={(e) => setHeight2Mm(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const temp = heightMm;
                    setHeightMm(height2Mm);
                    setHeight2Mm(temp);
                  }}
                  style={{
                    padding: '8px 10px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#1e293b',
                    whiteSpace: 'nowrap',
                    marginTop: '16px'
                  }}
                  title="Flip Left and Right Heights"
                >
                  ⇄ Flip
                </button>
              </div>
            </div>
          )}

          {/* Width */}
          <div style={rowStyle}>
            <span style={labelStyle}>
              Width <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 400 }}>(mm, min. 200)</span>
              <span style={{ color: '#dc2626', marginLeft: '2px' }}>*</span>
            </span>
            <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
              <input
                type="number"
                min="200"
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
              id="applyToAllWindows"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#6366f1' }}
            />
            <label htmlFor="applyToAllWindows" style={{ fontSize: '13px', color: '#4b5563', cursor: 'pointer' }}>
              Apply changes to all <b>windows</b> of the same (initial) type.
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
              border: '1px solid #4f46e5',
              background: '#6366f1',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              boxShadow: '0 1px 3px rgba(99,102,241,0.3)'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#4f46e5'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#6366f1'; }}
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
