import React, { useRef, useEffect } from 'react';

const RoofContextMenu = ({
  visible,
  x,
  y,
  roof,
  edgeIndex,
  onClose,
  onSetEaveEdge,
  onUpdateEdgeAngle,
  onTrimEdge,
  onDeleteRoof
}) => {
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose]);

  if (!visible || !roof || edgeIndex == null) return null;

  const currentAngle = Array.isArray(roof.angles) && roof.angles[edgeIndex] !== undefined
    ? roof.angles[edgeIndex]
    : 22.5;
  const isGable = currentAngle === 90;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        backgroundColor: '#1e293b',
        border: '1px solid #475569',
        borderRadius: '6px',
        padding: '4px 0',
        zIndex: 9999,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
        minWidth: '180px',
        color: '#f8fafc',
        fontSize: '12px',
        userSelect: 'none'
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div style={{ padding: '4px 12px', fontSize: '11px', color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 600 }}>
        Edge #{edgeIndex + 1} ({isGable ? 'Gable 90°' : `${currentAngle}°`})
      </div>

      {/* Toggle Gable 90° vs Hip 22.5° */}
      <div
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        onClick={(e) => {
          e.stopPropagation();
          onUpdateEdgeAngle?.(roof.id, edgeIndex, isGable ? 22.5 : 90);
          onClose();
        }}
      >
        <span>{isGable ? '🏠' : '🏛️'}</span>
        <span>{isGable ? 'Switch to Hip (22.5°)' : 'Set as Gable Wall (90°)'}</span>
      </div>

      {/* Trim Eave Overhang */}
      <div
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#f87171'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        onClick={(e) => {
          e.stopPropagation();
          onTrimEdge?.(roof.id, edgeIndex);
          onClose();
        }}
      >
        <span>✂️</span>
        <span>Trim Eave Overhang</span>
      </div>

      {/* Set Low Eave for Shed Roof */}
      {roof.roofType === 'shed' && (
        <div
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: (roof.eaveEdgeIndex || 0) === edgeIndex ? '#22d3ee' : '#f8fafc'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          onClick={(e) => {
            e.stopPropagation();
            onSetEaveEdge?.(roof.id, edgeIndex);
            onClose();
          }}
        >
          <span>📍</span>
          <span>{(roof.eaveEdgeIndex || 0) === edgeIndex ? 'Current Low Eave (Eave Under)' : 'Set as Low Eave (Eave Under)'}</span>
        </div>
      )}

      {/* Delete Roof Action */}
      <div
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#ef4444',
          borderTop: '1px solid #334155'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        onClick={(e) => {
          e.stopPropagation();
          onDeleteRoof?.(roof.id);
          onClose();
        }}
      >
        <span>🗑️</span>
        <span>Delete Roof</span>
      </div>
    </div>
  );
};

export default RoofContextMenu;
