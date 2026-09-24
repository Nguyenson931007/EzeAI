import React, { useEffect, useRef, useState } from 'react';

/**
 * WallVertexMenu — Floating popup menu when clicking a wall endpoint circle.
 *
 * Props:
 *   visible            — Boolean, whether to show the menu
 *   x, y               — Screen coordinates for positioning
 *   vertex             — The vertex data { wallId, index, pt: [x,y] }
 *   walls              — All walls on the current page
 *   onClose            — Callback to dismiss the menu
 *   onDrawHorizontal   — Callback to start drawing horizontal wall from this vertex
 *   onDrawVertical     — Callback to start drawing vertical wall from this vertex
 *   onSeparateJunction — Callback to un-snap walls at this junction point
 *   isWallMergeDisabled — Boolean toggle state
 *   onToggleWallMerge  — Callback to toggle wall merge on/off
 */
export default function WallVertexMenu({
  visible,
  x,
  y,
  vertex,
  walls = [],
  onClose,
  onDrawWall,
  onDrawHorizontal,
  onDrawVertical,
  onSeparateJunction,
  isWallMergeDisabled,
  onToggleWallMerge
}) {
  const menuRef = useRef(null);

  // Close on click outside or Escape
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  if (!visible || !vertex) return null;

  // Check if this vertex is a junction point (multiple walls share this coordinate)
  const junctionWalls = walls.filter(w => {
    if (!w.centerline || w.centerline.length !== 2) return false;
    if (w.id === vertex.wallId) return false;
    const pt = vertex.pt;
    return (
      (Math.hypot(w.centerline[0][0] - pt[0], w.centerline[0][1] - pt[1]) < 8) ||
      (Math.hypot(w.centerline[1][0] - pt[0], w.centerline[1][1] - pt[1]) < 8)
    );
  });

  const isJunction = junctionWalls.length > 0;

  // Clamp position to viewport
  const menuWidth = 220;
  const menuHeight = isJunction ? 220 : 130;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 10);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        zIndex: 10000,
        width: menuWidth,
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '10px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1)',
        padding: '6px 0',
        fontFamily: "'Inter', 'Outfit', sans-serif",
        fontSize: '13px',
        color: '#e2e8f0',
        userSelect: 'none',
        animation: 'vertexMenuFadeIn 0.12s ease-out'
      }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 14px 4px',
        fontSize: '11px',
        color: '#64748b',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        Draw Wall
      </div>

      {/* Draw Wall */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onDrawWall) onDrawWall();
          else if (onDrawHorizontal) onDrawHorizontal();
          onClose();
        }}
        style={btnStyle(false)}
        onMouseOver={hoverIn}
        onMouseOut={hoverOut}
      >
        <span style={lblStyle()}>
          <span style={iconStyle()}>🧱</span>
          <span>Draw Wall</span>
        </span>
      </button>

      {/* Junction-specific options */}
      {isJunction && (
        <>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '6px 8px' }} />

          <div style={{
            padding: '4px 14px 4px',
            fontSize: '11px',
            color: '#64748b',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Junction ({junctionWalls.length + 1} walls)
          </div>

          {/* Separate Junction */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onSeparateJunction) onSeparateJunction();
              onClose();
            }}
            style={btnStyle(false)}
            onMouseOver={hoverIn}
            onMouseOut={hoverOut}
          >
            <span style={lblStyle()}>
              <span style={iconStyle()}>🔓</span>
              <span>Separate Junction</span>
            </span>
          </button>

          {/* Toggle Wall Merge */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleWallMerge) onToggleWallMerge();
              onClose();
            }}
            style={btnStyle(false)}
            onMouseOver={hoverIn}
            onMouseOut={hoverOut}
          >
            <span style={lblStyle()}>
              <span style={iconStyle()}>{isWallMergeDisabled ? '🔗' : '🚫'}</span>
              <span>{isWallMergeDisabled ? 'Enable Wall Merge' : 'Disable Wall Merge'}</span>
            </span>
          </button>
        </>
      )}

      {/* Inline keyframe animation */}
      <style>{`
        @keyframes vertexMenuFadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// STYLING HELPERS
// ──────────────────────────────────────────────────────────
const btnStyle = (isActive = false) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '6px 14px',
  background: 'none',
  border: 'none',
  color: isActive ? '#38bdf8' : '#e2e8f0',
  fontSize: '12px',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 0.1s, color 0.1s',
  gap: '10px',
  fontFamily: 'inherit'
});

const lblStyle = () => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

const iconStyle = () => ({
  fontSize: '14px',
  width: '18px',
  textAlign: 'center'
});

const hoverIn = (e) => {
  e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
};

const hoverOut = (e) => {
  e.currentTarget.style.background = 'none';
};
