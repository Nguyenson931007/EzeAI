import React, { useEffect, useRef, useState } from 'react';

export default function AIConfidenceHeader({ collapsed, onToggleCollapse, heatmapMode, onToggleHeatmap }) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const i = setInterval(() => setPulse(p => !p), 2000);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(8, 18, 36, 0.75)',
      backdropFilter: 'blur(16px)',
      userSelect: 'none',
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Glowing Brain/AI Icon */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22 }}>
          {/* Pulse effect */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: '#2f81ff',
            opacity: pulse ? 0.4 : 0.1,
            transform: pulse ? 'scale(1.5)' : 'scale(1)',
            transition: 'all 1s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
          <svg style={{ position: 'relative', width: 16, height: 16, color: '#2f81ff', filter: 'drop-shadow(0 0 6px rgba(47,129,255,0.8))' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#f5f7ff', letterSpacing: '1px', fontFamily: "'Inter', sans-serif" }}>
            AI CONFIGURATION
          </span>
          {!collapsed && (
            <span style={{ fontSize: 9, color: '#6b7a99', fontWeight: 500, letterSpacing: '0.3px' }}>
              Real-time threshold control
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Heatmap Toggle */}
        <button
          onClick={onToggleHeatmap}
          title="Toggle Canvas AI Heatmap"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 6,
            background: heatmapMode ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
            border: heatmapMode ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid transparent',
            color: heatmapMode ? '#fbbf24' : '#6b7a99',
            boxShadow: heatmapMode ? '0 0 10px rgba(251, 191, 36, 0.2)' : 'none',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseOver={(e) => { if (!heatmapMode) e.currentTarget.style.color = '#f5f7ff'; }}
          onMouseOut={(e) => { if (!heatmapMode) e.currentTarget.style.color = '#6b7a99'; }}
        >
          <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>

        {/* Collapse Button */}
        <button
          onClick={onToggleCollapse}
          title="Minimize Panel"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 6,
            background: 'transparent',
            border: '1px solid transparent',
            color: '#6b7a99',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#f5f7ff'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7a99'; }}
        >
          <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
