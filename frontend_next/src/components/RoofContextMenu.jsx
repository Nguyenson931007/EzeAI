import React, { useRef, useEffect } from 'react';

const RoofContextMenu = ({ visible, x, y, roof, edgeIndex, onClose, onSetEaveEdge }) => {
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

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        top: y,
        left: x,
        backgroundColor: '#1f2937', // gray-800
        border: '1px solid #374151', // gray-700
        borderRadius: '6px',
        padding: '6px 0',
        zIndex: 1000,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        minWidth: '160px',
        color: '#f3f4f6', // gray-100
        fontSize: '13px',
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        style={{
          padding: '8px 16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#374151')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        onClick={(e) => {
          e.stopPropagation();
          onSetEaveEdge(roof.id, edgeIndex);
          onClose();
        }}
      >
        <span style={{ fontSize: '14px' }}>📐</span> Set as Eave (Hinge) Edge
      </div>
    </div>
  );
};

export default RoofContextMenu;
