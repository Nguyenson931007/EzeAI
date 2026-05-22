import React, { useState } from 'react';
import ConfidenceSlider from './ConfidenceSlider';
import ConfidenceInput from './ConfidenceInput';

const LABELS = {
  rooms:   { name: 'Rooms',        icon: '⬡', color: '#38bdf8' },
  doors:   { name: 'Doors',        icon: '◫', color: '#f97316' },
  walls:   { name: 'Walls',        icon: '▬', color: '#a855f7' },
  ocr:     { name: 'OCR Labeling', icon: '𝐀', color: '#22c55e' },
  symbols: { name: 'Symbols',      icon: '◉', color: '#fbbf24' }
};

export default function ConfidenceRow({ category, value, onChange, onReset, isDefault }) {
  const info = LABELS[category] || { name: category, icon: '●', color: '#fff' };
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? `linear-gradient(135deg, ${info.color}08, ${info.color}04)`
          : 'rgba(255,255,255,0.015)',
        border: `1px solid ${hovered ? `${info.color}25` : 'rgba(255,255,255,0.04)'}`,
        borderRadius: 10,
        padding: '10px 12px 4px',
        transition: 'all 0.25s ease',
        position: 'relative',
      }}
    >
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Icon dot with glow */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, borderRadius: 6,
            background: `${info.color}15`,
            color: info.color,
            fontSize: 11,
            fontWeight: 700,
            boxShadow: hovered ? `0 0 8px ${info.color}30` : 'none',
            transition: 'box-shadow 0.3s',
          }}>
            {info.icon}
          </span>
          <span style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: '#e8ecf5',
            fontFamily: "'Inter', 'Outfit', sans-serif",
            letterSpacing: '0.3px',
          }}>
            {info.name}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ConfidenceInput value={value} onChange={onChange} />

          {/* Reset button */}
          <button
            onClick={onReset}
            disabled={isDefault}
            title="Reset to default"
            style={{
              width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isDefault ? 'transparent' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isDefault ? 'transparent' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 6,
              color: isDefault ? 'rgba(255,255,255,0.1)' : '#9aa7c7',
              fontSize: 12,
              cursor: isDefault ? 'default' : 'pointer',
              transition: 'all 0.2s',
              fontFamily: 'sans-serif',
              padding: 0,
            }}
            onMouseOver={(e) => { if (!isDefault) { e.currentTarget.style.color = '#fbbf24'; e.currentTarget.style.borderColor = '#fbbf2440'; }}}
            onMouseOut={(e) => { e.currentTarget.style.color = isDefault ? 'rgba(255,255,255,0.1)' : '#9aa7c7'; e.currentTarget.style.borderColor = isDefault ? 'transparent' : 'rgba(255,255,255,0.06)'; }}
          >
            ⟲
          </button>
        </div>
      </div>

      {/* Slider */}
      <ConfidenceSlider category={category} value={value} onChange={onChange} />
    </div>
  );
}
