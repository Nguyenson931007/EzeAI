import React, { useState } from 'react';

const PRESETS = [
  { id: 'fast', name: 'Fast', icon: '⚡', config: { rooms: 0.35, doors: 0.45, walls: 0.55, ocr: 0.25, symbols: 0.40 }, tooltip: 'Maximize speed & recall' },
  { id: 'balanced', name: 'Balanced', icon: '⚖', config: { rooms: 0.55, doors: 0.72, walls: 0.80, ocr: 0.45, symbols: 0.60 }, tooltip: 'Standard optimal default values' },
  { id: 'accuracy', name: 'Accuracy', icon: '🎯', config: { rooms: 0.75, doors: 0.85, walls: 0.90, ocr: 0.70, symbols: 0.80 }, tooltip: 'High accuracy & minimal noise' }
];

export default function ConfidencePresetBar({ currentConfig, onSelectPreset }) {
  const [hoveredId, setHoveredId] = useState(null);

  const activePreset = PRESETS.find(p =>
    Math.abs(p.config.rooms - currentConfig.rooms) < 0.01 &&
    Math.abs(p.config.doors - currentConfig.doors) < 0.01 &&
    Math.abs(p.config.walls - currentConfig.walls) < 0.01 &&
    Math.abs(p.config.ocr - currentConfig.ocr) < 0.01 &&
    Math.abs(p.config.symbols - currentConfig.symbols) < 0.01
  );

  return (
    <div>
      {/* Section label */}
      <div style={{
        fontSize: 9, textTransform: 'uppercase', letterSpacing: '1.5px',
        color: '#6b7a99', fontWeight: 700, marginBottom: 6,
        fontFamily: "'Inter', monospace",
      }}>
        Inference Presets
      </div>

      {/* Segmented control */}
      <div style={{
        display: 'flex', gap: 3,
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 10, padding: 3,
        border: '1px solid rgba(255,255,255,0.04)',
      }}>
        {PRESETS.map((preset) => {
          const isActive = activePreset?.id === preset.id;
          const isHovered = hoveredId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => onSelectPreset(preset.config)}
              onMouseEnter={() => setHoveredId(preset.id)}
              onMouseLeave={() => setHoveredId(null)}
              title={preset.tooltip}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                padding: '7px 8px',
                fontSize: 10,
                fontWeight: 700,
                fontFamily: "'Inter', sans-serif",
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                borderRadius: 8,
                border: isActive ? '1px solid rgba(47,129,255,0.35)' : '1px solid transparent',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(47,129,255,0.15), rgba(47,129,255,0.05))'
                  : (isHovered ? 'rgba(255,255,255,0.04)' : 'transparent'),
                color: isActive ? '#5ba3ff' : (isHovered ? '#c8d2e6' : '#6b7a99'),
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                boxShadow: isActive ? '0 0 12px rgba(47,129,255,0.15), inset 0 1px 2px rgba(0,0,0,0.3)' : 'none',
              }}
            >
              <span style={{ fontSize: 11 }}>{preset.icon}</span>
              {preset.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
