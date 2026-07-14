import React, { useState } from 'react';
import { getPresetCategories } from '@/models/DoorTypeRegistry';

// Preset door list — dynamically derived from the centralized DoorTypeRegistry
const PRESET_CATEGORIES = getPresetCategories();


// Helper: Generates SVG icon depending on door class
function getDoorSVGIcon(doorClass) {
  const isDouble = doorClass.includes('double');
  const isSliding = doorClass.includes('sliding') || doorClass.includes('slider');
  const isBifold = doorClass.includes('bifold');
  const isGarage = doorClass.includes('garage');

  if (isGarage) {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="5" y="8" width="30" height="24" rx="2" stroke="#475569" strokeWidth="2" fill="#f1f5f9" />
        <line x1="5" y1="14" x2="35" y2="14" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="5" y1="20" x2="35" y2="20" stroke="#94a3b8" strokeWidth="1.5" />
        <line x1="5" y1="26" x2="35" y2="26" stroke="#94a3b8" strokeWidth="1.5" />
      </svg>
    );
  }
  if (isBifold) {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="6" width="32" height="28" stroke="#475569" strokeWidth="2" fill="#f1f5f9" />
        <path d="M4 20 L12 14 L20 20 L28 14 L36 20" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  if (isSliding) {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="6" width="32" height="28" stroke="#475569" strokeWidth="2" fill="#f1f5f9" />
        <line x1="20" y1="6" x2="20" y2="34" stroke="#94a3b8" strokeWidth="2" />
        <rect x="8" y="10" width="10" height="20" stroke="#3b82f6" strokeWidth="1.5" fill="rgba(59, 130, 246, 0.1)" />
        <rect x="22" y="10" width="10" height="20" stroke="#475569" strokeWidth="1.5" fill="none" />
      </svg>
    );
  }
  if (isDouble) {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="6" width="32" height="28" stroke="#475569" strokeWidth="2" fill="#f1f5f9" />
        <line x1="20" y1="6" x2="20" y2="34" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3,3" />
        <path d="M4 20 C4 10, 12 6, 20 6" stroke="#3b82f6" strokeWidth="1.5" fill="none" />
        <line x1="4" y1="20" x2="20" y2="20" stroke="#3b82f6" strokeWidth="2" />
        <path d="M36 20 C36 10, 28 6, 20 6" stroke="#3b82f6" strokeWidth="1.5" fill="none" />
        <line x1="36" y1="20" x2="20" y2="20" stroke="#3b82f6" strokeWidth="2" />
      </svg>
    );
  }

  // Single swing door (Default)
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <rect x="6" y="6" width="28" height="28" stroke="#475569" strokeWidth="2" fill="#f1f5f9" />
      <path d="M6 20 C6 8, 18 6, 34 6" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="2,2" fill="none" />
      <line x1="6" y1="20" x2="34" y2="20" stroke="#3b82f6" strokeWidth="2" />
    </svg>
  );
}

export default function DoorTypePanel({
  onSelectPreset,
  activePreset
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSection, setExpandedSection] = useState('internal'); // 'external' or 'internal' or 'all'
  const [expandedItems, setExpandedItems] = useState({});

  const toggleSection = (sectionId) => {
    setExpandedSection(expandedSection === sectionId ? null : sectionId);
  };

  const toggleItem = (itemId, e) => {
    e.stopPropagation();
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  return (
    <div 
      style={{
        width: '280px',
        background: '#0f172a',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        color: '#f8fafc',
        fontFamily: "'Inter', 'Outfit', sans-serif",
        boxSizing: 'border-box'
      }}
    >
      {/* Search Header */}
      <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>
          Penetrations
        </h3>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search door types..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '6px',
              padding: '6px 10px 6px 28px',
              color: '#fff',
              fontSize: '12px',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
          <span style={{ position: 'absolute', left: '10px', top: '7px', fontSize: '12px', color: '#64748b' }}>
            🔍
          </span>
        </div>
      </div>

      {/* Accordion Lists */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
        {PRESET_CATEGORIES.map(category => {
          // Apply search filtering
          const filteredItems = category.items.filter(item => 
            item.name.toLowerCase().includes(searchTerm.toLowerCase())
          );

          if (filteredItems.length === 0) return null;

          const isSectionExpanded = expandedSection === category.id || searchTerm !== '';

          return (
            <div key={category.id} style={{ marginBottom: '8px' }}>
              {/* Category Header */}
              <div
                onClick={() => toggleSection(category.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 14px',
                  cursor: 'pointer',
                  background: isSectionExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                  transition: 'background 0.2s',
                  userSelect: 'none'
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>
                  {category.label}
                </span>
                <span style={{ fontSize: '10px', color: '#475569' }}>
                  {isSectionExpanded ? '▼' : '►'}
                </span>
              </div>

              {/* Sub-Items List */}
              {isSectionExpanded && (
                <div style={{ padding: '4px 8px 8px' }}>
                  {filteredItems.map(item => {
                    const isItemExpanded = expandedItems[item.id] || searchTerm !== '';

                    return (
                      <div key={item.id} style={{ marginBottom: '6px', borderRadius: '6px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)' }}>
                        {/* Item Name header */}
                        <div
                          onClick={(e) => toggleItem(item.id, e)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#e2e8f0',
                            userSelect: 'none'
                          }}
                        >
                          <span style={{ flex: 1 }}>{item.name}</span>
                          <span style={{ fontSize: '9px', color: '#64748b', marginLeft: '6px' }}>
                            {isItemExpanded ? '▼' : '►'}
                          </span>
                        </div>

                        {/* Sizes Grid */}
                        {isItemExpanded && (
                          <div style={{
                            padding: '4px 8px 8px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '6px'
                          }}>
                            {item.sizes.map((size, sIdx) => {
                              const isActive = activePreset && 
                                activePreset.id === item.id && 
                                activePreset.width === size.w && 
                                activePreset.height === size.h;

                              return (
                                <div
                                  key={sIdx}
                                  onClick={() => onSelectPreset({
                                    id: item.id,
                                    name: item.name,
                                    class: item.class,
                                    width: size.w,
                                    height: size.h
                                  })}
                                  style={{
                                    border: isActive ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.05)',
                                    borderRadius: '6px',
                                    padding: '8px 4px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                                    transition: 'all 0.15s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                  onMouseOver={(e) => {
                                    if (!isActive) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                                  }}
                                  onMouseOut={(e) => {
                                    if (!isActive) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                                  }}
                                >
                                  {/* Icon */}
                                  <div style={{ opacity: isActive ? 1.0 : 0.75 }}>
                                    {getDoorSVGIcon(item.class)}
                                  </div>
                                  
                                  {/* Title Label */}
                                  <span style={{ fontSize: '10px', fontWeight: 600, color: isActive ? '#60a5fa' : '#cbd5e1' }}>
                                    {size.label}
                                  </span>

                                  {/* Hint Subtitle */}
                                  <span style={{ fontSize: '8px', color: '#64748b' }}>
                                    Select Height and Width
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
