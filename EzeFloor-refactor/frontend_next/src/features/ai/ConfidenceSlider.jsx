import React, { useRef, useState, useCallback, useEffect } from 'react';

const COLORS = {
  rooms: { accent: '#38bdf8', glow: 'rgba(56, 189, 248, 0.5)', grad: 'linear-gradient(90deg, #0e7490, #38bdf8)' },
  doors: { accent: '#f97316', glow: 'rgba(249, 115, 22, 0.5)', grad: 'linear-gradient(90deg, #c2410c, #f97316)' },
  walls: { accent: '#a855f7', glow: 'rgba(168, 85, 247, 0.5)', grad: 'linear-gradient(90deg, #7e22ce, #a855f7)' },
  ocr:   { accent: '#22c55e', glow: 'rgba(34, 197, 94, 0.5)',  grad: 'linear-gradient(90deg, #15803d, #22c55e)' },
  symbols: { accent: '#fbbf24', glow: 'rgba(251, 191, 36, 0.5)', grad: 'linear-gradient(90deg, #b45309, #fbbf24)' }
};

const TICKS = [0, 0.25, 0.5, 0.75, 1.0];

export default function ConfidenceSlider({ category, value, onChange }) {
  const c = COLORS[category] || COLORS.rooms;
  const pct = value * 100;
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const computeValue = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return value;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return Math.round((x / rect.width) * 100) / 100;
  }, [value]);

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    setDragging(true);
    onChange(computeValue(e.clientX));
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    onChange(computeValue(e.clientX));
  };

  const handlePointerUp = () => setDragging(false);

  return (
    <div
      style={{ position: 'relative', width: '100%', padding: '6px 0 12px', userSelect: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Track container */}
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          width: '100%',
          height: hovered || dragging ? 6 : 4,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 99,
          cursor: 'pointer',
          transition: 'height 0.2s ease',
          overflow: 'visible',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Active fill */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${pct}%`,
          background: c.grad,
          borderRadius: 99,
          boxShadow: `0 0 8px ${c.glow}`,
          transition: dragging ? 'none' : 'width 0.15s ease',
        }} />

        {/* Thumb */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: `${pct}%`,
          transform: 'translate(-50%, -50%)',
          width: dragging ? 16 : (hovered ? 14 : 12),
          height: dragging ? 16 : (hovered ? 14 : 12),
          borderRadius: '50%',
          background: c.accent,
          border: '2px solid rgba(255,255,255,0.9)',
          boxShadow: `0 0 10px ${c.glow}, 0 0 20px ${c.glow}`,
          transition: dragging ? 'none' : 'all 0.2s ease',
          cursor: 'grab',
          zIndex: 2,
        }} />

        {/* Hover tooltip */}
        {(hovered || dragging) && (
          <div style={{
            position: 'absolute',
            left: `${pct}%`,
            top: -28,
            transform: 'translateX(-50%)',
            background: 'rgba(8,18,36,0.95)',
            border: `1px solid ${c.accent}40`,
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 10,
            fontWeight: 700,
            fontFamily: "'Inter', monospace",
            color: c.accent,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: `0 2px 8px rgba(0,0,0,0.4)`,
            zIndex: 10,
          }}>
            {Math.round(pct)}%
          </div>
        )}
      </div>

      {/* Tick marks */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, padding: '0 1px' }}>
        {TICKS.map(t => (
          <span key={t} style={{
            fontSize: 8,
            fontFamily: "'Inter', monospace",
            color: Math.abs(value - t) < 0.02 ? c.accent : 'rgba(255,255,255,0.2)',
            fontWeight: Math.abs(value - t) < 0.02 ? 700 : 400,
            transition: 'color 0.2s',
          }}>
            {(t * 100).toFixed(0)}
          </span>
        ))}
      </div>
    </div>
  );
}
