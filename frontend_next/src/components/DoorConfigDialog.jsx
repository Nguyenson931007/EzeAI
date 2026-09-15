import React, { useState, useEffect, useRef } from 'react';
import { ApiService } from '@/models/api.service';
import SearchableSelect from '@/components/SearchableSelect';

const STORAGE_KEY = 'ezefloor_door_config';

// const FALLBACK_EXTERNAL_DOOR_TYPES = [
//   "SCX1 D/C",
//   "SCX1 P/PLY",
//   "SCX1 PCM",
//   "SCX1 SPM",
//   "STPC D/C",
//   "STPC P/PLY",
//   "STPC SPM",
//   "X1 D/C",
//   "X1 P/PLY",
//   "X1 SPM",
//   "XB2 OAK SOLID",
//   "BFR1 D/C CLEAR",
//   "BFR13 D/C",
//   "BFR14 D/C CLEAR",
//   "BFR14 D/C FROST",
//   "BFR15 D/C CLEAR",
//   "BFR15 D/C FROST",
//   "BFR16 D/C CLEAR",
//   "BFR16 D/C FROST",
//   "BFR17 D/C CLEAR",
//   "BFR17 D/C FROST",
//   "BFR18 D/C CLEAR",
//   "BFR18 D/C FROST",
//   "BFR19 D/C CLEAR",
//   "BFR19 D/C FROST",
//   "BFR2 D/C CLEAR",
//   "BFR20 D/C CLEAR",
//   "BFR20 D/C FROST",
//   "BFR21 D/C CLEAR",
//   "BFR21 D/C FROST",
//   "BFR22 D/C CLEAR",
//   "BFR22 D/C FROST",
//   "BFR23 D/C CLEAR",
//   "BFR23 D/C FROST",
//   "BFR4 D/C CLEAR",
//   "BFR4 D/C FROST",
//   "BFR5 D/C CLEAR",
//   "BFR6 D/C CLEAR",
//   "BFR7 D/C CLEAR",
//   "BFR7 D/C FROST",
//   "BFR8 D/C CLEAR",
//   "BFR8 D/C FROST",
//   "BFR9 D/C CLEAR",
//   "BFR9 D/C FROST",
//   "DURACOTE FLUSH SOLID",
//   "FLUSH SOLID CORE",
//   "HUME SOLID ENTRANCE",
//   "CORINTHIAN PMAD 104"
// ];

// const FALLBACK_INTERNAL_DOOR_TYPES = [
//   "H1 PCM",
//   "H1 PCLC 4.75mm",
//   "H1 SPM",
//   "HA10",
//   "HA15",
//   "HA4",
//   "HA40",
//   "HA45",
//   "HA5",
//   "HAG11",
//   "HAG12",
//   "HAG14",
//   "HAG18",
//   "HAG6",
//   "HAG9",
//   "HAM1",
//   "HAM1 CLEAR",
//   "HAM1 MDF INFILL",
//   "HAM1 TRANS",
//   "HAM1 TRANS LAM",
//   "HAM10 CLEAR",
//   "HAM10 MDF INFILL",
//   "HAM10 TRANS LAM",
//   "HAM12 CLEAR",
//   "HAM12 MDF INFILL",
//   "HAM12 TRANS",
//   "HAM12 TRANS LAM",
//   "FLUSH PANEL HONEYCOMB",
//   "REDICOTE FLUSH INTERNAL",
//   "DECO 1S",
//   "DECO 2S",
//   "DECO 3S",
//   "DECO 4S",
//   "MOTIVE MOT1",
//   "MOTIVE MOT2",
//   "ACCENT LINEAR HAG11",
//   "ACCENT LINEAR HAG12",
//   "REGENCY 4-PANEL",
//   "OAKFIELD 2-PANEL",
//   "COLONIAL 4-PANEL",
//   "CORINTHIAN INTERNAL FLUSH",
//   "HUME INTERNAL FLUSH"
// ];

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
 * DoorConfigDialog — Modal dialog for configuring door height and
 * external/internal door types before running Door AI detection.
 *
 * Props:
 *   visible      — Boolean to show/hide
 *   onConfirm    — Callback({ doorHeight, extDoorType, intDoorType }) when user clicks Run Door AI
 *   onClose      — Callback to dismiss without running
 */
export default function DoorConfigDialog({ visible, onConfirm, onClose }) {
  const overlayRef = useRef(null);
  const saved = loadSavedConfig();

  const [doorHeight, setDoorHeight] = useState(saved?.doorHeight || 2040);
  const [extDoorType, setExtDoorType] = useState(saved?.extDoorType || "SCX1 D/C");
  const [intDoorType, setIntDoorType] = useState(saved?.intDoorType || "H1 PCM");

  const [extOptions, setExtOptions] = useState();
  const [intOptions, setIntOptions] = useState();
  const [isLoading, setIsLoading] = useState(false);

  // Load door types from API when modal is mounted/opened
  useEffect(() => {
    if (!visible) return;

    // Reload saved configuration values on open
    const s = loadSavedConfig();
    if (s) {
      setDoorHeight(s.doorHeight || 2040);
      if (s.extDoorType) setExtDoorType(s.extDoorType);
      if (s.intDoorType) setIntDoorType(s.intDoorType);
    }

    let isMounted = true;
    setIsLoading(true);

    const fetchDoorTypes = async () => {
      try {
        let data = null;
        if (ApiService.getLockoutDoorTypes) {
          const res = await ApiService.getLockoutDoorTypes();
          data = res?.data;
        } else {
          const res = await fetch("/api/lockout/door-types");
          if (res.ok) {
            const json = await res.json();
            data = json?.data;
          }
        }

        if (isMounted && data) {
          // Merge external options ensuring 'SCX1 D/C' is included
          const rawExt = Array.isArray(data.external) && data.external.length > 0
            ? data.external
            : FALLBACK_EXTERNAL_DOOR_TYPES;
          const extSet = new Set(rawExt);
          extSet.add("SCX1 D/C");
          const finalExt = Array.from(extSet).sort();
          setExtOptions(finalExt);

          // Merge internal options ensuring 'H1 PCM' is included
          const rawInt = Array.isArray(data.internal) && data.internal.length > 0
            ? data.internal
            : FALLBACK_INTERNAL_DOOR_TYPES;
          const intSet = new Set(rawInt);
          intSet.add("H1 PCM");
          const finalInt = Array.from(intSet).sort();
          setIntOptions(finalInt);
        }
      } catch (err) {
        console.warn("[DoorConfigDialog] Could not fetch door types from backend, using fallbacks:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchDoorTypes();

    return () => {
      isMounted = false;
    };
  }, [visible]);

  if (!visible) return null;

  const handleConfirm = () => {
    const finalHeight = Number(doorHeight) > 0 ? Number(doorHeight) : 2040;
    const finalConfig = {
      doorHeight: finalHeight,
      extDoorType: extDoorType || "SCX1 D/C",
      intDoorType: intDoorType || "H1 PCM"
    };
    saveConfig(finalConfig);
    onConfirm(finalConfig);
  };

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 600,
    background: '#ffffff',
    color: '#0f172a',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    outline: 'none',
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
        minWidth: 380,
        maxWidth: 440,
        width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.03)',
        animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🚪</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>
              Door Configuration
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

        {/* Height Section */}
        <div style={{
          fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
          color: '#64748b', marginBottom: 12, fontWeight: 700
        }}>Default Door Height (mm)</div>

        <div style={rowStyle}>
          <div style={labelStyle}>
            <span style={{ fontSize: 14 }}>📏</span>
            Door Height
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              value={doorHeight}
              onChange={e => setDoorHeight(e.target.value)}
              placeholder="2040"
              style={{ ...inputStyle, flex: 1 }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>mm</span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#e2e8f0', margin: '18px 0' }} />

        {/* Door Types Section */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12
        }}>
          <span style={{
            fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
            color: '#64748b', fontWeight: 700
          }}>Door Type</span>
          {isLoading && (
            <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>Loading models...</span>
          )}
        </div>

        {/* External Door Type */}
        <div style={rowStyle}>
          <div style={labelStyle}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} />
            External
          </div>
          <SearchableSelect
            value={extDoorType}
            onChange={val => setExtDoorType(val)}
            options={extOptions}
            placeholder="SCX1 D/C"
          />
        </div>

        {/* Internal Door Type */}
        <div style={rowStyle}>
          <div style={labelStyle}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c', display: 'inline-block' }} />
            Internal
          </div>
          <SearchableSelect
            value={intDoorType}
            onChange={val => setIntDoorType(val)}
            options={intOptions}
            placeholder="H1 PCM"
          />
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
              flex: 2, padding: '10px 16px', fontSize: 13, fontWeight: 700,
              background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
              color: 'white', border: 'none',
              borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}
            onMouseOver={e => { e.currentTarget.style.boxShadow = '0 6px 18px rgba(37,99,235,0.45)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseOut={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.3)'; e.currentTarget.style.transform = 'none'; }}
          >
            <span>🚀</span> Run Door AI
          </button>
        </div>
      </div>
    </div>
  );
}
