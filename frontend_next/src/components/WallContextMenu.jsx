import React, { useEffect, useRef, useState } from 'react';

/**
 * WallContextMenu — Floating right-click context menu for wall elements.
 *
 * Props:
 *   visible            — Boolean, whether to show the menu
 *   x, y               — Screen coordinates for positioning
 *   wall               — The wall data object that was right-clicked
 *   onClose            — Callback to dismiss the menu
 *   onDelete           — Callback to delete the wall
 *   onChangeClass      — Callback to change the wall class_name
 *   onStartCutMode     — Callback to enter "cut-wall" mode
 */
export default function WallContextMenu({
  visible,
  x,
  y,
  wall,
  onClose,
  onDelete,
  onChangeClass,
  onStartCutMode,
  onAddStepCorner
}) {
  const menuRef = useRef(null);
  const [activeSubmenu, setActiveSubmenu] = useState(null); // 'change-wall' | 'split-attach' | 'locks' | null

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

  if (!visible || !wall) return null;

  // Clamp position to viewport
  const menuWidth = 240;
  const menuHeight = 460;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 10);

  const submenuWidth = 190;
  const fitsRight = clampedX + menuWidth + submenuWidth < window.innerWidth;
  const submenuLeft = fitsRight ? clampedX + menuWidth - 4 : clampedX - submenuWidth + 4;

  const wallClasses = [
    { value: 'exterior_wall', label: '🏠 Exterior Wall (ext)' },
    { value: 'interior_wall', label: '🔲 Interior Wall (int)' },
    { value: 'partition_wall', label: '🧱 Partition Wall (part)' }
  ];

  return (
    <div
      ref={menuRef}
      onMouseLeave={() => setActiveSubmenu(null)}
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
        animation: 'contextMenuFadeIn 0.12s ease-out'
      }}
    >
      {/* ────────────────────────────────────────────────────────── */}
      {/* WALL OPTIONS HEADER */}
      {/* ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 14px 4px',
        fontSize: '11px',
        color: '#64748b',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        Wall Options
      </div>

      {/* Item: Split and Attach Wall */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveSubmenu(prev => prev === 'split-attach' ? null : 'split-attach');
          }}
          onMouseOver={() => setActiveSubmenu('split-attach')}
          style={getMenuButtonStyle(activeSubmenu === 'split-attach')}
        >
          <span style={getMenuLabelStyle()}>
            <span style={getMenuIconStyle()}>📐</span>
            <span>Split and Attach Wall</span>
          </span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>▶</span>
        </button>

        {activeSubmenu === 'split-attach' && (
          <div style={getSubmenuContainerStyle(submenuLeft, clampedY + 28, submenuWidth)}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onStartCutMode) onStartCutMode();
                onClose();
              }}
              style={getSubmenuItemStyle(false)}
              onMouseOver={highlightHover}
              onMouseOut={clearHighlight}
            >
              ✂️ Split Wall (Cut)
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                alert("Attach Wall triggered (Automatic snap handles endpoints).");
                onClose();
              }}
              style={getSubmenuItemStyle(false)}
              onMouseOver={highlightHover}
              onMouseOut={clearHighlight}
            >
              🔗 Attach Wall
            </button>
          </div>
        )}
      </div>

      {/* Item: Tạo Góc Cua (Add Step Corner) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onAddStepCorner) onAddStepCorner();
          onClose();
        }}
        style={getMenuButtonStyle(false)}
        onMouseOver={highlightHover}
        onMouseOut={clearHighlight}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>📐</span>
          <span>Tạo Góc Cua (Add Step Corner)</span>
        </span>
      </button>

      {/* Item: Add Partial Surface */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          alert("Add Partial Surface functionality.");
          onClose();
        }}
        style={getMenuButtonStyle(false)}
        onMouseOver={highlightHover}
        onMouseOut={clearHighlight}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>➕</span>
          <span>Add Partial Surface</span>
        </span>
      </button>

      {/* Item: Add Penetration */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          alert("Add Penetration functionality.");
          onClose();
        }}
        style={getMenuButtonStyle(false)}
        onMouseOver={highlightHover}
        onMouseOut={clearHighlight}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>🚪</span>
          <span>Add Penetration</span>
        </span>
      </button>

      {/* Item: Add/Edit Parapet */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          alert("Add/Edit Parapet functionality.");
          onClose();
        }}
        style={getMenuButtonStyle(false)}
        onMouseOver={highlightHover}
        onMouseOut={clearHighlight}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>🧱</span>
          <span>Add/Edit Parapet</span>
        </span>
      </button>

      {/* Item: Edit Wall Section */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onStartCutMode) onStartCutMode();
          onClose();
        }}
        style={getMenuButtonStyle(false, true)} // Highlight as selected/active
        onMouseOver={highlightHover}
        onMouseOut={clearHighlightActive}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>✏️</span>
          <strong>Edit Wall Section (E)</strong>
        </span>
      </button>

      {/* Item: Change Wall Submenu */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveSubmenu(prev => prev === 'change-wall' ? null : 'change-wall');
          }}
          onMouseOver={() => setActiveSubmenu('change-wall')}
          style={getMenuButtonStyle(activeSubmenu === 'change-wall')}
        >
          <span style={getMenuLabelStyle()}>
            <span style={getMenuIconStyle()}>🔄</span>
            <span>Change Wall</span>
          </span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>▶</span>
        </button>

        {activeSubmenu === 'change-wall' && (
          <div style={getSubmenuContainerStyle(submenuLeft, clampedY + 180, submenuWidth)}>
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
                  style={getSubmenuItemStyle(isCurrent)}
                  onMouseOver={highlightHover}
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

      {/* Item: Delete */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onDelete) onDelete();
          onClose();
        }}
        style={getMenuButtonStyle(false, false, true)} // Danger mode
        onMouseOver={highlightHover}
        onMouseOut={clearHighlight}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>🗑️</span>
          <span>Delete</span>
        </span>
        <span style={getShortcutStyle()}>Del</span>
      </button>

      {/* Item: Locks */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveSubmenu(prev => prev === 'locks' ? null : 'locks');
          }}
          onMouseOver={() => setActiveSubmenu('locks')}
          style={getMenuButtonStyle(activeSubmenu === 'locks')}
        >
          <span style={getMenuLabelStyle()}>
            <span style={getMenuIconStyle()}>🔒</span>
            <span>Locks</span>
          </span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>▶</span>
        </button>

        {activeSubmenu === 'locks' && (
          <div style={getSubmenuContainerStyle(submenuLeft, clampedY + 250, submenuWidth)}>
            <button
              onClick={(e) => { e.stopPropagation(); alert("Wall Position Locked."); onClose(); }}
              style={getSubmenuItemStyle(false)}
              onMouseOver={highlightHover}
              onMouseOut={clearHighlight}
            >
              🔒 Lock Position
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); alert("Wall Position Unlocked."); onClose(); }}
              style={getSubmenuItemStyle(false)}
              onMouseOver={highlightHover}
              onMouseOut={clearHighlight}
            >
              🔓 Unlock Position
            </button>
          </div>
        )}
      </div>

      {/* Item: Select Walls with Same Frame */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          alert("Selected all walls of class: " + (wall.class_name || "interior_wall"));
          onClose();
        }}
        style={getMenuButtonStyle(false)}
        onMouseOver={highlightHover}
        onMouseOut={clearHighlight}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>⛓️</span>
          <span>Select Walls with Same Frame</span>
        </span>
      </button>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '6px 8px' }} />

      {/* ────────────────────────────────────────────────────────── */}
      {/* MORE OPTIONS HEADER */}
      {/* ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '4px 14px 4px',
        fontSize: '11px',
        color: '#64748b',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}>
        More Options
      </div>

      {/* Item: Hide Trace Images */}
      <button
        onClick={(e) => { e.stopPropagation(); alert("Trace images hidden."); onClose(); }}
        style={getMenuButtonStyle(false)}
        onMouseOver={highlightHover}
        onMouseOut={clearHighlight}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>👁️‍🗨️</span>
          <span>Hide Trace Images</span>
        </span>
      </button>

      {/* Item: Show Trace Image Controls */}
      <button
        onClick={(e) => { e.stopPropagation(); alert("Trace image controls visible."); onClose(); }}
        style={getMenuButtonStyle(false)}
        onMouseOver={highlightHover}
        onMouseOut={clearHighlight}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>🛠️</span>
          <span>Show Trace Image Controls</span>
        </span>
      </button>

      {/* Item: Costing Engine */}
      <button
        onClick={(e) => { e.stopPropagation(); alert("Costing engine initialized."); onClose(); }}
        style={getMenuButtonStyle(false)}
        onMouseOver={highlightHover}
        onMouseOut={clearHighlight}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>💰</span>
          <span>Costing Engine...</span>
        </span>
      </button>

      {/* Item: Engineering */}
      <button
        onClick={(e) => { e.stopPropagation(); alert("Engineering controls initialized."); onClose(); }}
        style={getMenuButtonStyle(false)}
        onMouseOver={highlightHover}
        onMouseOut={clearHighlight}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>⚙️</span>
          <span>Engineering...</span>
        </span>
      </button>

      {/* Item: Administrator Options */}
      <button
        onClick={(e) => { e.stopPropagation(); alert("Admin panel opened."); onClose(); }}
        style={getMenuButtonStyle(false)}
        onMouseOver={highlightHover}
        onMouseOut={clearHighlight}
      >
        <span style={getMenuLabelStyle()}>
          <span style={getMenuIconStyle()}>🔑</span>
          <span>Administrator Options</span>
        </span>
      </button>

      {/* Inline keyframe animation */}
      <style>{`
        @keyframes contextMenuFadeIn {
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

const getMenuButtonStyle = (isActive = false, isAccent = false, isDanger = false) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '6px 14px',
  background: isAccent ? '#0284c7' : 'none',
  border: 'none',
  color: isDanger ? '#ef4444' : (isActive ? '#38bdf8' : '#e2e8f0'),
  fontSize: '12px',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 0.1s, color 0.1s',
  gap: '10px',
  fontFamily: 'inherit'
});

const getMenuLabelStyle = () => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

const getMenuIconStyle = () => ({
  fontSize: '14px',
  width: '18px',
  textAlign: 'center'
});

const getShortcutStyle = () => ({
  fontSize: '10px',
  color: '#475569',
  fontFamily: 'monospace',
  padding: '1px 4px',
  borderRadius: '3px',
  background: 'rgba(255,255,255,0.05)'
});

const getSubmenuContainerStyle = (left, top, minWidth) => ({
  position: 'fixed',
  left: left,
  top: top,
  zIndex: 10001,
  minWidth: minWidth,
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
  animation: 'contextMenuFadeIn 0.12s ease-out'
});

const getSubmenuItemStyle = (isCurrent = false) => ({
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
});

const highlightHover = (e) => {
  const isDanger = e.currentTarget.style.color === 'rgb(239, 68, 68)' || e.currentTarget.style.color === '#ef4444';
  const isAccent = e.currentTarget.style.backgroundColor === 'rgb(2, 132, 199)' || e.currentTarget.style.backgroundColor === '#0284c7';
  if (isDanger) {
    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
  } else if (isAccent) {
    e.currentTarget.style.background = '#0369a1';
  } else {
    e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
  }
};

const clearHighlight = (e) => {
  e.currentTarget.style.background = 'none';
};

const clearHighlightActive = (e) => {
  e.currentTarget.style.background = '#0284c7';
};
