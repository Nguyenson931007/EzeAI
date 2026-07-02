import React, { useState, useEffect, useRef } from 'react';

/**
 * WALL_THICKNESS_OPTIONS — Standard wall thickness values in mm.
 */
const WALL_THICKNESS_OPTIONS = [70, 90, 140, 180, 200];

/**
 * WALL_HEIGHT_OPTIONS — Standard wall height values in mm.
 */
export const WALL_HEIGHT_OPTIONS = [2100, 2400, 2700, 3000, 3300, 3600];

const STORAGE_KEY = 'ezefloor_wall_thickness_config';

function loadSavedConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return null;
}

function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) { /* ignore */ }
}

/**
 * WallThicknessDialog — Modal dialog for configuring wall thicknesses
 * before running Wall AI detection.
 *
 * Props:
 *   visible      — Boolean to show/hide
 *   onConfirm    — Callback({ ext, int, part, defaultHeight }) when user clicks Detect
 *   onClose      — Callback to dismiss without running
 */
export default function WallThicknessDialog({ visible, onConfirm, onClose }) {
  const overlayRef = useRef(null);
  const saved = loadSavedConfig();

  const [extThickness, setExtThickness] = useState(saved?.ext || 90);
  const [intThickness, setIntThickness] = useState(saved?.int || 70);
  const [partThickness, setPartThickness] = useState(saved?.part || 70);
  const [defaultHeight, setDefaultHeight] = useState(saved?.defaultHeight || 2400);

  // Reload saved values when dialog opens
  useEffect(() => {
    if (visible) {
      const s = loadSavedConfig();
      if (s) {
        setExtThickness(s.ext || 90);
        setIntThickness(s.int || 70);
        setPartThickness(s.part || 70);
        setDefaultHeight(s.defaultHeight || 2400);
      }
    }
  }, [visible]);

  if (!visible) return null;

  const handleConfirm = () => {
    const config = {
      ext: extThickness,
      int: intThickness,
      part: partThickness,
      defaultHeight
    };
    saveConfig(config);
    onConfirm(config);
  };

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const selectStyle = {
    width: '100%',
    padding: '8px 12px',
    fontSize: 13,
    background: '#1e2028',
    color: '#e1e4ea',
    border: '1px solid #3f4451',
    borderRadius: 6,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239ca3af' d='M3 5l3 3 3-3'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    backgroundSize: '12px'
  };

  const labelStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: '#9ca3af',
    marginBottom: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 6
  };

  const rowStyle = {
    marginBottom: 14
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        animation: 'fadeIn 0.15s ease-out'
      }}
    >
      <div style={{
        background: '#1a1c24',
        border: '1px solid #2a2d38',
        borderRadius: 12,
        padding: '24px 28px',
        minWidth: 340,
        maxWidth: 400,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        animation: 'slideUp 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🧱</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#e1e4ea' }}>
              Wall Configuration
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: '#6b7280',
              fontSize: 18, cursor: 'pointer', padding: '2px 6px',
              borderRadius: 4, lineHeight: 1
            }}
            onMouseOver={e => e.target.style.color = '#ef4444'}
            onMouseOut={e => e.target.style.color = '#6b7280'}
          >✕</button>
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: 11, color: '#6b7280', marginBottom: 16,
          padding: '8px 10px', background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.15)', borderRadius: 6
        }}>
          Choose wall thickness for each type. These will be applied to AI-detected walls.
        </div>

        {/* Thickness Section */}
        <div style={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5,
          color: '#6b7280', marginBottom: 10, fontWeight: 600
        }}>Wall Thickness (mm)</div>

        {/* Exterior */}
        <div style={rowStyle}>
          <div style={labelStyle}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} />
            Exterior Wall
          </div>
          <select
            style={selectStyle}
            value={extThickness}
            onChange={e => setExtThickness(Number(e.target.value))}
          >
            {WALL_THICKNESS_OPTIONS.map(v => (
              <option key={v} value={v}>{v} mm</option>
            ))}
          </select>
        </div>

        {/* Interior */}
        <div style={rowStyle}>
          <div style={labelStyle}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#b45309', display: 'inline-block' }} />
            Interior Wall
          </div>
          <select
            style={selectStyle}
            value={intThickness}
            onChange={e => setIntThickness(Number(e.target.value))}
          >
            {WALL_THICKNESS_OPTIONS.map(v => (
              <option key={v} value={v}>{v} mm</option>
            ))}
          </select>
        </div>

        {/* Partition */}
        <div style={rowStyle}>
          <div style={labelStyle}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#eab308', display: 'inline-block' }} />
            Partition Wall
          </div>
          <select
            style={selectStyle}
            value={partThickness}
            onChange={e => setPartThickness(Number(e.target.value))}
          >
            {WALL_THICKNESS_OPTIONS.map(v => (
              <option key={v} value={v}>{v} mm</option>
            ))}
          </select>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#2a2d38', margin: '16px 0' }} />

        {/* Default Height */}
        <div style={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5,
          color: '#6b7280', marginBottom: 10, fontWeight: 600
        }}>Default Wall Height (mm)</div>

        <div style={rowStyle}>
          <div style={labelStyle}>
            <span style={{ fontSize: 14 }}>📏</span>
            Wall Height
          </div>
          <select
            style={selectStyle}
            value={defaultHeight}
            onChange={e => setDefaultHeight(Number(e.target.value))}
          >
            {WALL_HEIGHT_OPTIONS.map(v => (
              <option key={v} value={v}>{v} mm ({(v / 1000).toFixed(1)} m)</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 16px', fontSize: 12, fontWeight: 600,
              background: '#2a2d38', color: '#9ca3af', border: '1px solid #3f4451',
              borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s'
            }}
            onMouseOver={e => { e.target.style.background = '#3f4451'; e.target.style.color = '#e1e4ea'; }}
            onMouseOut={e => { e.target.style.background = '#2a2d38'; e.target.style.color = '#9ca3af'; }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex: 2, padding: '10px 16px', fontSize: 12, fontWeight: 700,
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              color: 'white', border: 'none',
              borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: '0 4px 12px rgba(59,130,246,0.3)'
            }}
            onMouseOver={e => e.target.style.boxShadow = '0 4px 20px rgba(59,130,246,0.5)'}
            onMouseOut={e => e.target.style.boxShadow = '0 4px 12px rgba(59,130,246,0.3)'}
          >
            🚀 Run Wall AI
          </button>
        </div>
      </div>
    </div>
  );
}
