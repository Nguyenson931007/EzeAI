import React, { useEffect, useRef, useState } from 'react';
import { getWallClass } from '@/utils/geometry';

/**
 * WallContextMenu — Simplified floating menu for wall body clicks.
 *
 * Props:
 *   visible            — Boolean, whether to show the menu
 *   x, y               — Screen coordinates for positioning
 *   wall               — The wall data object
 *   onClose            — Callback to dismiss the menu
 *   onDelete           — Callback to delete the wall
 *   onChangeClass      — Callback to change the wall class_name
 *   onAddPoint         — Callback to enter "add point" / split wall mode
 */
export default function WallContextMenu({
  visible,
  x,
  y,
  wall,
  selectedCount = 1,
  onClose,
  onDrawWall,
  onCutWall,
  onMergeAligned,
  onDelete,
  onChangeClass,
  onAddPoint,
  onToggleLock,
  onToggleLbw,
  onToggleRoofInclusion
}) {
  const menuRef = useRef(null);
  const [showTypeSubmenu, setShowTypeSubmenu] = useState(false);

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

  // Reset submenu when menu closes
  useEffect(() => {
    if (!visible) setShowTypeSubmenu(false);
  }, [visible]);

  if (!visible || !wall) return null;

  // Clamp position to viewport
  const menuWidth = 220;
  const menuHeight = 270;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 10);

  const submenuWidth = 190;
  const fitsRight = clampedX + menuWidth + submenuWidth < window.innerWidth;

  const wallClasses = [
    { value: 'exterior_wall', label: '🏠 Exterior Wall (ext)' },
    { value: 'interior_wall', label: '🔲 Interior Wall (int)' },
    { value: 'partition_wall', label: '🧱 Partition Wall (part)' },
    { value: 'block_wall', label: '🧱 Block Wall (block)' }
  ];

  const isPartWall = (getWallClass ? getWallClass(wall) === "partition_wall" : (wall.class_name === "partition_wall" || wall.wall_type === "part"));
  const isLbw = Boolean(wall.is_lbw || wall.is_load_bearing || wall.lbw);

  return (
    <div
      ref={menuRef}
      onMouseLeave={() => setShowTypeSubmenu(false)}
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
        animation: 'wallMenuFadeIn 0.12s ease-out'
      }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 14px 4px',
        fontSize: '11px',
        color: selectedCount > 1 ? '#38bdf8' : '#64748b',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        {selectedCount > 1 ? `Wall Options (${selectedCount} walls)` : 'Wall Options'}
      </div>

      {/* Item: Toggle Load-Bearing (LBW) — ONLY for Partition Walls */}
      {isPartWall && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleLbw) onToggleLbw();
            onClose();
          }}
          style={btnStyle(false)}
          onMouseOver={(e) => { setShowTypeSubmenu(false); hoverIn(e); }}
          onMouseOut={hoverOut}
        >
          <span style={lblStyle()}>
            <span style={iconStyle()}>⚡</span>
            <span style={{ color: isLbw ? '#fb923c' : '#e2e8f0', fontWeight: isLbw ? 700 : 500 }}>
              {isLbw ? 'Remove LBW Flag' : 'Mark as Load-Bearing (LBW)'}
            </span>
          </span>
        </button>
      )}

      {/* Item: Cut / Split Wall */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onCutWall) onCutWall();
          onClose();
        }}
        style={btnStyle(false)}
        onMouseOver={(e) => { setShowTypeSubmenu(false); hoverIn(e); }}
        onMouseOut={hoverOut}
      >
        <span style={lblStyle()}>
          <span style={iconStyle()}>✂️</span>
          <span>Cut / Split Wall</span>
        </span>
      </button>

      {/* Item: Merge Aligned Walls */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onMergeAligned) onMergeAligned();
          onClose();
        }}
        style={btnStyle(false)}
        onMouseOver={(e) => { setShowTypeSubmenu(false); hoverIn(e); }}
        onMouseOut={hoverOut}
      >
        <span style={lblStyle()}>
          <span style={iconStyle()}>🔗</span>
          <span>Merge Aligned Walls</span>
        </span>
      </button>

      {/* Item: Draw Wall */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onDrawWall) onDrawWall();
          onClose();
        }}
        style={btnStyle(false)}
        onMouseOver={(e) => { setShowTypeSubmenu(false); hoverIn(e); }}
        onMouseOut={hoverOut}
      >
        <span style={lblStyle()}>
          <span style={iconStyle()}>🧱</span>
          <span>Draw Wall</span>
        </span>
      </button>

      {/* Item: Lock / Unlock Wall */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onToggleLock) onToggleLock();
          onClose();
        }}
        style={btnStyle(false)}
        onMouseOver={(e) => { setShowTypeSubmenu(false); hoverIn(e); }}
        onMouseOut={hoverOut}
      >
        <span style={lblStyle()}>
          <span style={iconStyle()}>{wall.locked ? '🔓' : '🔒'}</span>
          <span>{wall.locked ? 'Unlock Wall' : 'Lock Wall'}</span>
        </span>
      </button>

      {/* Item: Deselect / Include in Roof */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onToggleRoofInclusion) onToggleRoofInclusion();
          onClose();
        }}
        style={btnStyle(false)}
        onMouseOver={(e) => { setShowTypeSubmenu(false); hoverIn(e); }}
        onMouseOut={hoverOut}
      >
        <span style={lblStyle()}>
          <span style={iconStyle()}>{wall.exclude_from_roof ? '🏠' : '🚫'}</span>
          <span style={{ color: wall.exclude_from_roof ? '#34d399' : '#fca5a5' }}>
            {wall.exclude_from_roof ? 'Include in Roof' : 'Deselect from Roof'}
            {selectedCount > 1 ? ` (${selectedCount})` : ''}
          </span>
        </span>
      </button>

      {/* Item: Change Wall Type (submenu) */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowTypeSubmenu(prev => !prev);
          }}
          onMouseOver={(e) => { setShowTypeSubmenu(true); hoverIn(e); }}
          onMouseOut={hoverOut}
          style={btnStyle(showTypeSubmenu)}
        >
          <span style={lblStyle()}>
            <span style={iconStyle()}>🔄</span>
            <span>Change Wall Type{selectedCount > 1 ? ` (${selectedCount})` : ''}</span>
          </span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>▶</span>
        </button>

        {showTypeSubmenu && (
          <div style={{
            position: 'absolute',
            left: fitsRight ? 'calc(100% + 4px)' : 'auto',
            right: fitsRight ? 'auto' : 'calc(100% + 4px)',
            top: '-4px',
            zIndex: 10001,
            minWidth: submenuWidth,
            background: 'rgba(15, 23, 42, 0.96)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            padding: '4px 0',
            fontFamily: "'Inter', 'Outfit', sans-serif",
            fontSize: '12px',
            color: '#e2e8f0',
            userSelect: 'none',
            animation: 'wallMenuFadeIn 0.12s ease-out'
          }}>
            {wallClasses.map((t) => {
              const isCurrent = wall.class_name === t.value;
              return (
                <button
                  key={t.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onChangeClass) onChangeClass(t.value);
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '6px 14px',
                    background: isCurrent ? 'rgba(255,255,255,0.08)' : 'none',
                    border: 'none',
                    color: isCurrent ? '#22c55e' : '#e2e8f0',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.1s',
                    fontFamily: 'inherit'
                  }}
                  onMouseOver={hoverIn}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = isCurrent ? 'rgba(255,255,255,0.08)' : 'none';
                  }}
                >
                  <span style={{ marginRight: '8px', fontSize: '11px', color: isCurrent ? '#22c55e' : '#475569' }}>
                    {isCurrent ? '●' : '○'}
                  </span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '6px 8px' }} />

      {/* Item: Delete Wall */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onDelete) onDelete();
          onClose();
        }}
        style={{
          ...btnStyle(false),
          color: '#ef4444'
        }}
        onMouseOver={(e) => {
          setShowTypeSubmenu(false);
          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
        }}
        onMouseOut={hoverOut}
      >
        <span style={lblStyle()}>
          <span style={iconStyle()}>🗑️</span>
          <span>Delete Wall</span>
        </span>
        <span style={{
          fontSize: '10px',
          color: '#475569',
          fontFamily: 'monospace',
          padding: '1px 4px',
          borderRadius: '3px',
          background: 'rgba(255,255,255,0.05)'
        }}>Del</span>
      </button>

      {/* Inline keyframe animation */}
      <style>{`
        @keyframes wallMenuFadeIn {
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
