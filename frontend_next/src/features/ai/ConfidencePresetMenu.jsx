import React, { useState } from 'react';

const PRESETS = [
  {
    name: 'Balanced Mode',
    config: { rooms: 0.55, doors: 0.20, walls: 0.01, ocr: 0.45, symbols: 0.60 },
    description: 'Standard optimal CAD defaults.'
  },
  {
    name: 'Fast Detection',
    config: { rooms: 0.35, doors: 0.10, walls: 0.01, ocr: 0.25, symbols: 0.40 },
    description: 'Maximum recall, lowest confidence thresholds.'
  },
  {
    name: 'High Accuracy',
    config: { rooms: 0.75, doors: 0.60, walls: 0.50, ocr: 0.70, symbols: 0.80 },
    description: 'Precision extraction, minimal false positives.'
  },
  {
    name: 'OCR Focus',
    config: { rooms: 0.50, doors: 0.35, walls: 0.45, ocr: 0.15, symbols: 0.50 },
    description: 'Ultra-sensitive text/label OCR parsing.'
  },
  {
    name: 'Door Focus',
    config: { rooms: 0.55, doors: 0.10, walls: 0.01, ocr: 0.45, symbols: 0.60 },
    description: 'Optimized specifically for detailed door annotations.'
  }
];

export default function ConfidencePresetMenu({ currentConfig, onSelectPreset }) {
  const [open, setOpen] = useState(false);

  // Find currently active preset if there is one
  const matchedPreset = PRESETS.find(p => 
    Math.abs(p.config.rooms - currentConfig.rooms) < 0.01 &&
    Math.abs(p.config.doors - currentConfig.doors) < 0.01 &&
    Math.abs(p.config.walls - currentConfig.walls) < 0.01 &&
    Math.abs(p.config.ocr - currentConfig.ocr) < 0.01 &&
    Math.abs(p.config.symbols - currentConfig.symbols) < 0.01
  );

  const selectedName = matchedPreset ? matchedPreset.name : 'Custom Preset';

  return (
    <div className="relative w-full text-[10px] uppercase font-bold tracking-wider mb-2 select-none">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-black/50 hover:bg-black/80 border border-[#3C3C3C] text-[#9DA5B4] px-2 py-1.5 rounded transition-all cursor-pointer"
      >
        <span className="truncate text-white font-mono">{selectedName}</span>
        <svg 
          className={`w-3 h-3 text-[#4EC9B0] ml-1 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop to capture outside clicks */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          
          <div className="absolute left-0 right-0 top-full mt-1 bg-[#1A1A1A] border border-[#3C3C3C] rounded shadow-[0_6px_20px_rgba(0,0,0,0.8)] z-50 overflow-hidden divide-y divide-[#2C2C2C]">
            {PRESETS.map((p, idx) => {
              const isSelected = p.name === selectedName;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    onSelectPreset(p.config);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2 py-2 block hover:bg-[#252526] transition-all cursor-pointer group`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-mono ${isSelected ? 'text-[#4EC9B0]' : 'text-[#D4D4D4] group-hover:text-white'}`}>
                      {p.name}
                    </span>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4EC9B0] shadow-[0_0_6px_#4EC9B0]" />
                    )}
                  </div>
                  <div className="text-[8px] text-[#808080] lowercase normal-case mt-0.5 group-hover:text-[#9DA5B4]">
                    {p.description}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
