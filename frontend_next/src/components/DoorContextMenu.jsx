import React, { useEffect, useRef, useState } from 'react';
import { getPenetrationTypeOptions } from '@/models/DoorTypeRegistry';

/**
 * DoorContextMenu — Floating right-click context menu for door elements.
 *
 * Props:
 *   visible    — Boolean, whether to show the menu
 *   x, y       — Screen coordinates for positioning
 *   door       — The door data object that was right-clicked
 *   onClose    — Callback to dismiss the menu
 *   onRotateLeft   — Rotate door 90° CCW
 *   onRotateRight  — Rotate door 90° CW
 *   onFlipSwing    — Toggle swing direction
 *   onFlipHinge    — Toggle hinge side
 *   onEdit         — Open edit dialog
 *   onDelete       — Delete the door
 *   onSwapFrameLeaf - Swap active frame index
 *   onChangeType   - Directly select penetration type
 */
export default function DoorContextMenu({
  visible,
  x,
  y,
  door,
  onClose,
  onFlipHorizontal,
  onFlipVertical,
  onReverseEndpoints,
  onStraighten90,
  onRotateLeft,
  onRotateRight,
  onFlipSwing,
  onFlipHinge,
  onEdit,
  onDelete,
  onSwapFrameLeaf,
  onChangeType
}) {
  const menuRef = useRef(null);
  const [showSubmenu, setShowSubmenu] = useState(false);

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

  if (!visible || !door) return null;

  // Clamp position to viewport
  const menuWidth = 230;
  const menuHeight = 420;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 10);

  const submenuWidth = 170;
  const fitsRight = clampedX + menuWidth + submenuWidth < window.innerWidth;
  const submenuLeft = fitsRight ? clampedX + menuWidth - 4 : clampedX - submenuWidth + 4;
  const clampedSubmenuY = Math.min(clampedY + 170, window.innerHeight - 260 - 10);

  const penetrationTypes = getPenetrationTypeOptions();

  const menuItems = [
    { icon: '↔️', label: 'Flip Horizontal', action: onFlipHorizontal, shortcut: '' },
    { icon: '↕️', label: 'Flip Vertical', action: onFlipVertical, shortcut: '' },
    { icon: '🔄', label: 'Reverse Direction (180°)', action: onReverseEndpoints, shortcut: '' },
    { icon: '📐', label: 'Snap to 90° Axis', action: onStraighten90, shortcut: '' },
    { type: 'divider' },
    { icon: '↩️', label: 'Rotate Left (-90°)', action: onRotateLeft, shortcut: '' },
    { icon: '↪️', label: 'Rotate Right (+90°)', action: onRotateRight, shortcut: '' },
    { icon: '🔀', label: 'Swap Frame & Leaf', action: onSwapFrameLeaf, shortcut: '' },
    { type: 'divider' },
    { icon: '🚪', label: 'Penetration Type', action: () => {}, hasSubmenu: true },
    { icon: '✏️', label: 'Edit Door...', action: onEdit, shortcut: '' },
    { type: 'divider' },
    { icon: '🗑️', label: 'Delete Selected Door', action: onDelete, danger: true, shortcut: 'Del' }
  ];

  return (
    <div
      ref={menuRef}
      onMouseLeave={() => setShowSubmenu(false)}
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        zIndex: 10000,
        minWidth: menuWidth,
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
      {/* Header showing door info */}
      <div style={{
        padding: '8px 14px 6px',
        fontSize: '11px',
        color: '#64748b',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: '4px'
      }}>
        {door.door_name || door.id} — {door.class || 'single_door'}
      </div>

      {menuItems.map((item, i) => {
        if (item.type === 'divider') {
          return (
            <div key={`divider-${i}`} style={{
              height: '1px',
              background: 'rgba(255,255,255,0.06)',
              margin: '4px 8px'
            }} />
          );
        }

        return (
          <button
            key={item.label}
            onClick={(e) => {
              e.stopPropagation();
              if (item.hasSubmenu) {
                setShowSubmenu(!showSubmenu);
              } else {
                item.action();
                onClose();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '7px 14px',
              background: 'none',
              border: 'none',
              color: item.danger ? '#ef4444' : '#e2e8f0',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.1s',
              gap: '10px',
              fontFamily: 'inherit'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = item.danger
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(255,255,255,0.07)';
              if (item.hasSubmenu) {
                setShowSubmenu(true);
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'none';
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
              <span>{item.label}</span>
            </span>
            {item.hasSubmenu ? (
              <span style={{ fontSize: '11px', color: '#64748b' }}>▶</span>
            ) : item.shortcut ? (
              <span style={{
                fontSize: '11px',
                color: '#475569',
                fontFamily: 'monospace',
                padding: '1px 5px',
                borderRadius: '3px',
                background: 'rgba(255,255,255,0.05)'
              }}>
                {item.shortcut}
              </span>
            ) : null}
          </button>
        );
      })}

      {showSubmenu && (
        <div
          style={{
            position: 'fixed',
            left: submenuLeft,
            top: clampedSubmenuY,
            zIndex: 10001,
            minWidth: submenuWidth,
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            padding: '6px 0',
            fontFamily: "'Inter', 'Outfit', sans-serif",
            fontSize: '13px',
            color: '#e2e8f0',
            userSelect: 'none',
            animation: 'contextMenuFadeIn 0.12s ease-out'
          }}
        >
          {penetrationTypes.map((t) => {
            const isCurrent = door.class === t.value;
            return (
              <button
                key={t.value}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onChangeType) onChangeType(t.value);
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '7px 14px',
                  background: isCurrent ? 'rgba(255,255,255,0.08)' : 'none',
                  border: 'none',
                  color: isCurrent ? '#22c55e' : '#e2e8f0',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                  fontFamily: 'inherit'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                }}
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
