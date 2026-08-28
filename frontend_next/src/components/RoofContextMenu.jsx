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
  onSetRoofEdgeMode,
  onToggleDutchEdge,
  onStartDrawDutch,
  onCancelDrawDutch,
  onUpdateRoofType,
  onTrimEdge,
  onExportRoofInput,
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
  const isGable = Math.abs(currentAngle - 90.0) < 1.0;
  const isDutch = Array.isArray(roof.dutchEdges) && roof.dutchEdges.includes(edgeIndex);
  const isShed = roof.roofType === 'shed';
  const isShedEave = isShed && (roof.eaveEdgeIndex === edgeIndex);

  let edgeTypeLabel = "Hip";
  if (isDutch) edgeTypeLabel = "Dutch Gable";
  else if (isGable) edgeTypeLabel = "Gable 90°";
  else if (isShed) edgeTypeLabel = isShedEave ? "Shed Eave Low" : "Shed Slope";

  const normalPitch = (typeof roof.pitchAngle === 'number' && roof.pitchAngle > 0 && Math.abs(roof.pitchAngle - 90.0) >= 1.0)
    ? roof.pitchAngle
    : 22.5;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        backgroundColor: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '8px',
        padding: '5px 0',
        zIndex: 99999,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0,0,0,0.4)',
        minWidth: '210px',
        color: '#f8fafc',
        fontSize: '12px',
        userSelect: 'none'
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div style={{ padding: '6px 12px', fontSize: '11px', color: '#94a3b8', borderBottom: '1px solid #1e293b', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{roof.name || 'Roof'} (Edge #{edgeIndex})</span>
        <span style={{ color: isDutch ? '#fb7185' : isGable ? '#c084fc' : isShed ? '#38bdf8' : '#34d399', fontSize: '10px' }}>
          {edgeTypeLabel}
        </span>
      </div>

      {!isShed ? (
        <>
          {/* 1. Set as Hip */}
          <div
            style={{
              padding: '7px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: !isDutch && !isGable ? '#34d399' : '#f8fafc',
              fontWeight: !isDutch && !isGable ? 700 : 400
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={(e) => {
              e.stopPropagation();
              if (onSetRoofEdgeMode) {
                onSetRoofEdgeMode(roof.id, edgeIndex, 'hip');
              } else {
                if (isDutch && onToggleDutchEdge) onToggleDutchEdge(roof.id, edgeIndex);
                if (onUpdateEdgeAngle) onUpdateEdgeAngle(roof.id, edgeIndex, normalPitch);
              }
              if (onCancelDrawDutch) onCancelDrawDutch();
              onClose();
            }}
          >
            <span>🏠</span>
            <span>Set as Hip</span>
          </div>

          {/* 2. Set as Gable Wall */}
          <div
            style={{
              padding: '7px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: isGable ? '#c084fc' : '#f8fafc',
              fontWeight: isGable ? 700 : 400
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={(e) => {
              e.stopPropagation();
              if (onSetRoofEdgeMode) {
                onSetRoofEdgeMode(roof.id, edgeIndex, 'gable');
              } else {
                if (isDutch && onToggleDutchEdge) onToggleDutchEdge(roof.id, edgeIndex);
                if (onUpdateEdgeAngle) onUpdateEdgeAngle(roof.id, edgeIndex, 90.0);
              }
              if (onCancelDrawDutch) onCancelDrawDutch();
              onClose();
            }}
          >
            <span>🏛️</span>
            <span>Set as Gable Wall</span>
          </div>

          {/* 3. Set as Dutch Gable (Draw Cut) */}
          <div
            style={{
              padding: '7px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: isDutch ? '#fb7185' : '#f8fafc',
              fontWeight: isDutch ? 700 : 400
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={(e) => {
              e.stopPropagation();
              if (onSetRoofEdgeMode) {
                onSetRoofEdgeMode(roof.id, edgeIndex, 'dutch');
              } else {
                if (isGable && onUpdateEdgeAngle) onUpdateEdgeAngle(roof.id, edgeIndex, normalPitch);
                if (!isDutch && onToggleDutchEdge) onToggleDutchEdge(roof.id, edgeIndex);
              }
              if (onStartDrawDutch) onStartDrawDutch(roof.id, edgeIndex);
              onClose();
            }}
          >
            <span>🎨</span>
            <span>Set as Dutch Gable {isDutch ? '(Re-draw Cut)' : ''}</span>
          </div>

          {/* 4. Convert to Shed (using this edge as eave) */}
          <div
            style={{
              padding: '7px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderTop: '1px solid #1e293b'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={(e) => {
              e.stopPropagation();
              if (onSetRoofEdgeMode) onSetRoofEdgeMode(roof.id, edgeIndex, 'hip');
              if (onCancelDrawDutch) onCancelDrawDutch();
              if (onUpdateRoofType) onUpdateRoofType(roof.id, 'shed', edgeIndex);
              onClose();
            }}
          >
            <span>📐</span>
            <span>Convert to Shed Roof</span>
          </div>
        </>
      ) : (
        <>
          {/* Shed mode: Convert back to Hip/Gable */}
          <div
            style={{
              padding: '7px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={(e) => {
              e.stopPropagation();
              if (onCancelDrawDutch) onCancelDrawDutch();
              if (onUpdateRoofType) onUpdateRoofType(roof.id, 'hip_gable');
              onClose();
            }}
          >
            <span>🏠</span>
            <span>Convert to Gable / Dutch / Hip</span>
          </div>
        </>
      )}

      {/* Trim Eave Overhang */}
      <div
        style={{
          padding: '7px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderTop: '1px solid #1e293b',
          color: '#cbd5e1'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
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

      {/* Debug raw roof input JSON export
      <div
        style={{
          padding: '7px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderTop: '1px solid #1e293b',
          color: '#38bdf8'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        onClick={(e) => {
          e.stopPropagation();
          onExportRoofInput?.(roof.id);
          onClose();
        }}
      >
        <span>📥</span>
        <span>Export Input (JSON)</span>
      </div>
      */}

      {/* Delete Roof Action */}
      <div
        style={{
          padding: '7px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#ef4444',
          borderTop: '1px solid #1e293b'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
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
