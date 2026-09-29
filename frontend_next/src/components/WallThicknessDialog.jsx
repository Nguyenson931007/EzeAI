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
export default function WallThicknessDialog({ visible, onConfirm, onOpenAIConfirm, onClose }) {
  const overlayRef = useRef(null);
  const saved = loadSavedConfig();
  const initialHeight = saved?.defaultHeight || 2700;
  const isInitialCustom = !WALL_HEIGHT_OPTIONS.includes(initialHeight);

  const [extThickness, setExtThickness] = useState(saved?.ext || 90);
  const [intThickness, setIntThickness] = useState(saved?.int || 70);
  const [partThickness, setPartThickness] = useState(saved?.part || 70);
  const [defaultHeight, setDefaultHeight] = useState(isInitialCustom ? 'custom' : initialHeight);
  const [isCustomHeight, setIsCustomHeight] = useState(isInitialCustom);
  const [customHeightVal, setCustomHeightVal] = useState(isInitialCustom ? initialHeight : 2700);

  // Reload saved values when dialog opens
  useEffect(() => {
    if (visible) {
      const s = loadSavedConfig();
      if (s) {
        setExtThickness(s.ext || 90);
        setIntThickness(s.int || 70);
        setPartThickness(s.part || 70);

        const h = s.defaultHeight || 2700;
        if (WALL_HEIGHT_OPTIONS.includes(h)) {
          setDefaultHeight(h);
          setIsCustomHeight(false);
        } else {
          setDefaultHeight('custom');
          setCustomHeightVal(h);
          setIsCustomHeight(true);
        }
      }
    }
  }, [visible]);

  if (!visible) return null;

  const handleHeightSelectChange = (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      setDefaultHeight('custom');
      setIsCustomHeight(true);
    } else {
      const num = Number(val);
      setDefaultHeight(num);
      setIsCustomHeight(false);
    }
  };

  const buildConfig = () => {
    const finalHeight = isCustomHeight ? Number(customHeightVal) : Number(defaultHeight);
    return {
      ext: extThickness,
      int: intThickness,
      part: partThickness,
      defaultHeight: finalHeight
    };
  };

  const handleConfirm = () => {
    const config = buildConfig();
    saveConfig(config);
    onConfirm(config);
  };

  const handleOpenAIConfirm = () => {
    const config = buildConfig();
    saveConfig(config);
    if (onOpenAIConfirm) onOpenAIConfirm({ ...config, provider: 'openai' });
  };

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const selectStyle = {
    width: '100%',
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 600,
    background: '#ffffff',
    color: '#0f172a',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M3 5l3 3 3-3'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    backgroundSize: '12px',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    transition: 'border-color 0.15s, box-shadow 0.15s'
  };

  const labelStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: '#334155',
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 6
  };

  const rowStyle = {
    marginBottom: 16
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        animation: 'fadeIn 0.15s ease-out'
      }}
    >
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: '24px 28px',
        minWidth: 360,
        maxWidth: 420,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.03)',
        animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🧱</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>
              Wall Configuration
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: '#94a3b8',
              fontSize: 16, cursor: 'pointer', padding: '4px 8px',
              borderRadius: 6, lineHeight: 1, transition: 'all 0.15s'
            }}
            onMouseOver={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fef2f2'; }}
            onMouseOut={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
          >✕</button>
        </div>

        {/* Thickness Section */}
        <div style={{
          fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
          color: '#64748b', marginBottom: 12, fontWeight: 700
        }}>Wall Thickness (mm)</div>

        {/* Exterior */}
        <div style={rowStyle}>
          <div style={labelStyle}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} />
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
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c', display: 'inline-block' }} />
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

        {/* Divider */}
        <div style={{ height: 1, background: '#e2e8f0', margin: '18px 0' }} />

        {/* Default Height */}
        <div style={{
          fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
          color: '#64748b', marginBottom: 12, fontWeight: 700
        }}>Default Wall Height (mm)</div>

        <div style={rowStyle}>
          <div style={labelStyle}>
            <span style={{ fontSize: 14 }}>📏</span>
            Wall Height
          </div>
          <select
            style={selectStyle}
            value={defaultHeight}
            onChange={handleHeightSelectChange}
          >
            {WALL_HEIGHT_OPTIONS.map(v => (
              <option key={v} value={v}>{v} mm ({(v / 1000).toFixed(1)} m)</option>
            ))}
            <option value="custom">Custom...</option>
          </select>

          {isCustomHeight && (
            <div style={{ marginTop: 8 }}>
              <input
                type="number"
                value={customHeightVal}
                onChange={e => setCustomHeightVal(Number(e.target.value))}
                placeholder="Enter custom height (mm)"
                style={{
                  ...selectStyle,
                  backgroundImage: 'none',
                  cursor: 'text'
                }}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 16px', fontSize: 13, fontWeight: 600,
              background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1',
              borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s'
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#1e293b'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#475569'; }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex: 1.5, padding: '10px 12px', fontSize: 12, fontWeight: 700,
              background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
              color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer'
            }}
          >
            Local AI
          </button>
          <button
            type="button"
            onClick={handleOpenAIConfirm}
            title="GPT Luna support review using the OpenAI API"
            style={{
              flex: 1.5, padding: '10px 12px', fontSize: 12, fontWeight: 700,
              background: 'linear-gradient(135deg, #111827 0%, #374151 100%)',
              color: 'white', border: 'none', borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            GPT Luna
          </button>
        </div>
      </div>
    </div>
  );
}
