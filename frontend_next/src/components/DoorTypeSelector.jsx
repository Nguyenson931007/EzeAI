import React, { useState, useEffect, useRef } from 'react';
import { DOOR_TYPE_REGISTRY, getPresetCategories } from '@/models/DoorTypeRegistry';

/**
 * Door SVG icon generator — renders a small door type icon.
 */
function DoorIcon({ iconType, size = 36, isActive = false }) {
  const color = isActive ? '#60a5fa' : '#94a3b8';
  const fill = isActive ? 'rgba(96, 165, 250, 0.12)' : 'rgba(255,255,255,0.03)';

  if (iconType === 'garage') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <rect x="5" y="8" width="30" height="24" rx="2" stroke={color} strokeWidth="2" fill={fill} />
        <line x1="5" y1="14" x2="35" y2="14" stroke={color} strokeWidth="1" opacity="0.5" />
        <line x1="5" y1="20" x2="35" y2="20" stroke={color} strokeWidth="1" opacity="0.5" />
        <line x1="5" y1="26" x2="35" y2="26" stroke={color} strokeWidth="1" opacity="0.5" />
      </svg>
    );
  }
  if (iconType === 'bifold') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <rect x="4" y="6" width="32" height="28" stroke={color} strokeWidth="2" fill={fill} />
        <path d="M4 20 L12 14 L20 20 L28 14 L36 20" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  if (iconType === 'sliding') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <rect x="4" y="6" width="32" height="28" stroke={color} strokeWidth="2" fill={fill} />
        <line x1="20" y1="6" x2="20" y2="34" stroke={color} strokeWidth="1.5" opacity="0.4" />
        <rect x="8" y="10" width="10" height="20" stroke={color} strokeWidth="1.5" fill={isActive ? 'rgba(96,165,250,0.15)' : 'none'} />
        <path d="M22 20 L30 20" stroke={color} strokeWidth="1" strokeDasharray="2,2" />
      </svg>
    );
  }
  if (iconType === 'double') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <rect x="4" y="6" width="32" height="28" stroke={color} strokeWidth="2" fill={fill} />
        <line x1="20" y1="6" x2="20" y2="34" stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
        <path d="M4 20 C4 10, 12 6, 20 6" stroke={color} strokeWidth="1.5" fill="none" />
        <line x1="4" y1="20" x2="20" y2="20" stroke={color} strokeWidth="2" />
        <path d="M36 20 C36 10, 28 6, 20 6" stroke={color} strokeWidth="1.5" fill="none" />
        <line x1="36" y1="20" x2="20" y2="20" stroke={color} strokeWidth="2" />
      </svg>
    );
  }

  // Single swing door (default)
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="6" y="6" width="28" height="28" stroke={color} strokeWidth="2" fill={fill} />
      <path d="M6 20 C6 8, 18 6, 34 6" stroke={color} strokeWidth="1.5" strokeDasharray="2,2" fill="none" />
      <line x1="6" y1="20" x2="34" y2="20" stroke={color} strokeWidth="2" />
    </svg>
  );
}

/**
 * DoorTypeSelector — Contextual popup for selecting door type after geometry is drawn.
 *
 * Appears near the door location on canvas. Clicking a type updates the preview.
 * ENTER confirms, ESC cancels.
 *
 * Props:
 *   visible        — Boolean
 *   position       — {x, y} in screen coordinates (for canvas-relative placement)
 *   selectedTypeId — Currently selected door type registry key
 *   onSelect       — Callback(typeId) when user clicks a type
 *   onConfirm      — Callback when user presses ENTER or clicks Confirm
 *   onCancel       — Callback when user presses ESC or clicks Cancel
 *   scale          — Canvas scale (for coordinate transform)
 *   offset         — Canvas offset (for coordinate transform)
 */
export default function DoorTypeSelector({
  visible,
  position,
  selectedTypeId,
  onSelect,
  onConfirm,
  onCancel,
  scale = 1,
  offset = { x: 0, y: 0 },
}) {
  const panelRef = useRef(null);
  const [hoveredType, setHoveredType] = useState(null);

  // Keyboard handler: ENTER to confirm, ESC to cancel
  useEffect(() => {
    if (!visible) return;

    const handleKey = (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [visible, onConfirm, onCancel]);

  if (!visible) return null;

  // Convert canvas position to screen position
  const screenX = position ? (position.x * scale + offset.x) : window.innerWidth / 2;
  const screenY = position ? (position.y * scale + offset.y) : window.innerHeight / 2;

  // Clamp to viewport
  const panelWidth = 320;
  const panelHeight = 400;
  const clampedX = Math.max(10, Math.min(screenX - panelWidth / 2, window.innerWidth - panelWidth - 10));
  const clampedY = Math.max(10, Math.min(screenY + 30, window.innerHeight - panelHeight - 10));

  // Build type groups
  const typeGroups = [
    { label: 'Hinged', types: ['single_door', 'double_door'] },
    { label: 'Sliding', types: ['sliding_door', 'cavity_slider_door', 'double_slider_door'] },
    { label: 'Other', types: ['bifold_door', 'garage_door'] },
  ];

  // Find all registry entries grouped by renderClass
  const typeCards = [];
  const seen = new Set();
  for (const [key, def] of Object.entries(DOOR_TYPE_REGISTRY)) {
    // Prefer internal versions for the selector
    if (seen.has(def.renderClass)) continue;
    seen.add(def.renderClass);
    typeCards.push({
      typeId: key,
      renderClass: def.renderClass,
      label: def.shortLabel,
      fullLabel: def.label,
      iconType: def.iconType,
      doorType: def.doorType,
    });
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: clampedX,
        top: clampedY,
        zIndex: 10010,
        width: panelWidth,
        background: 'rgba(15, 23, 42, 0.96)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1), 0 0 40px rgba(59,130,246,0.1)',
        padding: '0',
        fontFamily: "'Inter', 'Outfit', sans-serif",
        color: '#e2e8f0',
        userSelect: 'none',
        animation: 'doorSelectorFadeIn 0.18s ease-out',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.01em' }}>
            Select Door Type
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            Choose type, then press <span style={{
              background: 'rgba(255,255,255,0.08)',
              padding: '1px 6px',
              borderRadius: '3px',
              fontSize: '10px',
              fontFamily: 'monospace',
              color: '#94a3b8',
            }}>Enter</span> to confirm
          </div>
        </div>
        <button
          onClick={onCancel}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            lineHeight: 1,
            transition: 'color 0.15s',
          }}
          onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
          onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
        >
          ✕
        </button>
      </div>

      {/* Type Grid */}
      <div style={{
        padding: '12px 12px 8px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
      }}>
        {typeCards.map((card) => {
          const isActive = selectedTypeId && DOOR_TYPE_REGISTRY[selectedTypeId]?.renderClass === card.renderClass;
          const isHovered = hoveredType === card.renderClass;

          return (
            <button
              key={card.renderClass}
              onClick={() => {
                // Find the best matching typeId for current category
                const currentDef = DOOR_TYPE_REGISTRY[selectedTypeId];
                const currentCategory = currentDef?.category || 'internal';
                let bestKey = card.typeId;
                for (const [key, def] of Object.entries(DOOR_TYPE_REGISTRY)) {
                  if (def.renderClass === card.renderClass && def.category === currentCategory) {
                    bestKey = key;
                    break;
                  }
                }
                onSelect(bestKey);
              }}
              onMouseOver={() => setHoveredType(card.renderClass)}
              onMouseOut={() => setHoveredType(null)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 6px',
                background: isActive
                  ? 'rgba(59, 130, 246, 0.15)'
                  : isHovered
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(255,255,255,0.02)',
                border: isActive
                  ? '1.5px solid rgba(59, 130, 246, 0.5)'
                  : '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit',
                color: isActive ? '#60a5fa' : '#cbd5e1',
                transform: isActive ? 'scale(1.02)' : 'scale(1)',
              }}
            >
              <DoorIcon iconType={card.iconType} size={32} isActive={isActive} />
              <span style={{
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                textAlign: 'center',
                lineHeight: 1.2,
                letterSpacing: '-0.01em',
              }}>
                {card.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer Buttons */}
      <div style={{
        padding: '8px 12px 12px',
        display: 'flex',
        gap: '8px',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        marginTop: '4px',
      }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.03)',
            color: '#94a3b8',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.25) 100%)',
            color: '#60a5fa',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.15s',
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.15)',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(37, 99, 235, 0.35) 100%)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.25)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.25) 100%)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.15)';
          }}
        >
          Confirm ↵
        </button>
      </div>

      {/* Animation */}
      <style>{`
        @keyframes doorSelectorFadeIn {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
