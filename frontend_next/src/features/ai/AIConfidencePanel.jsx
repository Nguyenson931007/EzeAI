import React, { useState, useEffect, useRef } from 'react';
import { useAIConfigStore } from '@/store/useAIConfigStore';
import AIConfidenceHeader from './AIConfidenceHeader';
import ConfidenceRow from './ConfidenceRow';
import ConfidencePresetBar from './ConfidencePresetBar';
import ConfidenceFooter from './ConfidenceFooter';

const DEFAULT_DEFAULTS = {
  rooms: 0.55,
  doors: 0.20,
  walls: 0.001,
  ocr: 0.45,
  symbols: 0.60
};

export default function AIConfidencePanel() {
  return null;

  const [collapsed, setCollapsed] = useState(false);
  const panelRef = useRef(null);

  // Position coordinates state
  const [position, setPosition] = useState({ x: 0, y: 110 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const panelWidth = collapsed ? 44 : 285;

  useEffect(() => {
    const handleInitAndResize = () => {
      try {
        const savedPos = localStorage.getItem('ezefloor_aiconf_pos');
        if (savedPos) {
          const parsed = JSON.parse(savedPos);
          const clampedX = Math.max(10, Math.min(window.innerWidth - panelWidth - 10, parsed.x));
          const clampedY = Math.max(95, Math.min(window.innerHeight - 150, parsed.y));
          setPosition({ x: clampedX, y: clampedY });
          return;
        }
      } catch (e) {}

      // Default layout position: right-side floating beside Properties panel
      const defaultX = window.innerWidth - 290 - panelWidth - 15; 
      setPosition({ x: defaultX, y: 110 });
    };

    handleInitAndResize();
    window.addEventListener('resize', handleInitAndResize);
    return () => window.removeEventListener('resize', handleInitAndResize);
  }, [collapsed, panelWidth]);

  const handleMouseDown = (e) => {
    // Prevent dragging when clicking interactive elements
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('.interactive-area')) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      let newX = e.clientX - dragStartRef.current.x;
      let newY = e.clientY - dragStartRef.current.y;
      
      const propertiesLeftEdge = window.innerWidth - 290;
      const snapThreshold = 25;

      if (Math.abs((newX + panelWidth) - propertiesLeftEdge) < snapThreshold) {
        newX = propertiesLeftEdge - panelWidth - 12;
      } else if (Math.abs((newX + panelWidth) - window.innerWidth) < snapThreshold) {
        newX = window.innerWidth - panelWidth - 12;
      } else if (Math.abs(newX) < snapThreshold) {
        newX = 12;
      }

      if (Math.abs(newY - 95) < snapThreshold) newY = 98;

      const clampedX = Math.max(10, Math.min(window.innerWidth - panelWidth - 10, newX));
      const clampedY = Math.max(95, Math.min(window.innerHeight - 60, newY));

      const updated = { x: clampedX, y: clampedY };
      setPosition(updated);
      localStorage.setItem('ezefloor_aiconf_pos', JSON.stringify(updated));
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, panelWidth]);

  const handleResetField = (field) => {
    const def = DEFAULT_DEFAULTS[field];
    if (field === 'rooms') setRoomConfidence(def);
    if (field === 'doors') setDoorConfidence(def);
    if (field === 'walls') setWallConfidence(def);
    if (field === 'ocr') setOCRConfidence(def);
    if (field === 'symbols') setSymbolConfidence(def);
  };

  const handleExport = () => {
    const data = exportConfig();
    navigator.clipboard.writeText(data).then(() => {
      alert('AI config preset copied to clipboard as JSON!');
    }).catch(() => {
      alert('Failed to copy. Config JSON:\n' + data);
    });
  };

  const handleImport = () => {
    const jsonStr = prompt('Paste your AI Confidence configuration JSON string:');
    if (!jsonStr) return;
    if (importConfig(jsonStr)) {
      alert('AI Confidence configuration loaded successfully.');
    } else {
      alert('Invalid configuration format. Please verify configuration JSON.');
    }
  };

  // --- COMPACT MODE ---
  if (collapsed) {
    return (
      <div
        ref={panelRef}
        onMouseDown={handleMouseDown}
        onClick={() => setCollapsed(false)}
        title="Click to expand AI Configuration"
        style={{
          position: 'fixed', zIndex: 100,
          left: position.x, top: position.y,
          width: panelWidth, height: 260,
          background: 'rgba(17, 25, 40, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(47,129,255,0.3)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.1)',
          cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '16px 0',
          gap: 16,
          userSelect: 'none',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(17, 25, 40, 0.95)'; e.currentTarget.style.borderColor = 'rgba(47,129,255,0.6)'; }}
        onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(17, 25, 40, 0.85)'; e.currentTarget.style.borderColor = 'rgba(47,129,255,0.3)'; }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{
            position: 'absolute', width: 14, height: 14, borderRadius: '50%',
            background: heatmapMode ? '#fbbf24' : '#3b82f6',
            opacity: 0.5, animation: 'pulse 2s infinite',
          }} />
          <span style={{
            position: 'relative', width: 10, height: 10, borderRadius: '50%',
            background: heatmapMode ? '#fbbf24' : '#3b82f6',
            boxShadow: `0 0 8px ${heatmapMode ? '#fbbf24' : '#3b82f6'}`
          }} />
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{
            fontSize: 12, fontWeight: 800, color: '#f5f7ff',
            letterSpacing: '0.3em', fontFamily: "'Inter', sans-serif",
            transform: 'rotate(-90deg)', transformOrigin: 'center',
            whiteSpace: 'nowrap',
          }}>
            AI CONFIG
          </span>
        </div>

        <div style={{ color: '#5ba3ff' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </div>
      </div>
    );
  }

  // --- FULL PANEL ---
  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed', zIndex: 100,
        left: position.x, top: position.y,
        width: panelWidth,
        maxHeight: 'calc(100vh - 140px)',
        background: 'rgba(17, 25, 40, 0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s',
      }}
    >
      {/* Draggable Header */}
      <div 
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }} 
        onMouseDown={handleMouseDown}
      >
        <AIConfidenceHeader 
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(true)}
          heatmapMode={heatmapMode}
          onToggleHeatmap={toggleHeatmap}
        />
      </div>

      {/* Scrollable Content */}
      <div className="interactive-area" style={{
        flex: 1, overflowY: 'auto',
        padding: '16px 14px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <ConfidencePresetBar currentConfig={config} onSelectPreset={applyConfig} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.5px',
            color: '#6b7a99', fontWeight: 700,
            fontFamily: "'Inter', monospace",
          }}>
            Threshold Settings
          </div>
          
          <ConfidenceRow category="rooms" value={config.rooms} onChange={setRoomConfidence} onReset={() => handleResetField('rooms')} isDefault={config.rooms === DEFAULT_DEFAULTS.rooms} />
          <ConfidenceRow category="doors" value={config.doors} onChange={setDoorConfidence} onReset={() => handleResetField('doors')} isDefault={config.doors === DEFAULT_DEFAULTS.doors} />
          <ConfidenceRow category="walls" value={config.walls} onChange={setWallConfidence} onReset={() => handleResetField('walls')} isDefault={config.walls === DEFAULT_DEFAULTS.walls} />
          <ConfidenceRow category="ocr" value={config.ocr} onChange={setOCRConfidence} onReset={() => handleResetField('ocr')} isDefault={config.ocr === DEFAULT_DEFAULTS.ocr} />
          <ConfidenceRow category="symbols" value={config.symbols} onChange={setSymbolConfidence} onReset={() => handleResetField('symbols')} isDefault={config.symbols === DEFAULT_DEFAULTS.symbols} />
        </div>
      </div>

      <div className="interactive-area">
        <ConfidenceFooter onResetAll={resetDefaults} onImport={handleImport} onExport={handleExport} />
      </div>
    </div>
  );
}
