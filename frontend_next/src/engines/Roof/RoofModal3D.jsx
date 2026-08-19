'use client';

import React from 'react';
import RoofScene3D from './RoofScene3D';

/**
 * 🏠 RoofModal3D: Modal popup for inspecting 3D Roof models
 */
export default function RoofModal3D({ isOpen, onClose, v3Data, roofName = "Roof 3D Model" }) {
  if (!isOpen || !v3Data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8">
      <div className="relative w-full max-w-5xl h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <span className="text-xl">🏠</span>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">{roofName}</h2>
              <span className="text-xs text-emerald-400 font-semibold">V3 Deterministic 3D Mesh</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center bg-slate-700 hover:bg-red-500 rounded-full text-white transition-colors text-sm font-bold"
            title="Close 3D View"
          >
            ✕
          </button>
        </div>

        {/* 3D Scene Body */}
        <div className="flex-1 relative">
          <RoofScene3D v3Data={v3Data} />
          
          <div className="absolute bottom-4 left-4 text-xs text-slate-300 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-700 shadow-md backdrop-blur pointer-events-none">
            🖱️ <strong>Left Click:</strong> Rotate | <strong>Right Click:</strong> Pan | <strong>Scroll:</strong> Zoom
          </div>
        </div>
      </div>
    </div>
  );
}
