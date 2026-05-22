import React from 'react';

export default function ConfidenceFooter({ onResetAll, onImport, onExport }) {
  return (
    <div style={{
      position: 'sticky', bottom: 0, zIndex: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 14px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(8, 18, 36, 0.75)',
      backdropFilter: 'blur(16px)',
      userSelect: 'none',
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
    }}>
      {/* Reset All Button */}
      <button
        onClick={onResetAll}
        title="Restore all confidence parameters to factory defaults"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          color: '#fca5a5',
          fontSize: 10, fontWeight: 700, fontFamily: "'Inter', sans-serif",
          letterSpacing: '0.5px', textTransform: 'uppercase',
          cursor: 'pointer', transition: 'all 0.2s',
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)'; e.currentTarget.style.color = '#fff'; }}
        onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.color = '#fca5a5'; }}
      >
        <span style={{ fontSize: 12 }}>⟲</span>
        FACTORY RESET
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Import JSON */}
        <button
          onClick={onImport}
          title="Import configuration JSON"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#9aa7c7',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(47,129,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(47,129,255,0.3)'; e.currentTarget.style.color = '#5ba3ff'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#9aa7c7'; }}
        >
          <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </button>

        {/* Export JSON */}
        <button
          onClick={onExport}
          title="Export configuration to clipboard"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#9aa7c7',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(47,129,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(47,129,255,0.3)'; e.currentTarget.style.color = '#5ba3ff'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#9aa7c7'; }}
        >
          <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
