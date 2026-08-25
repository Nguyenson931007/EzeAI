'use client';

import React from 'react';
import RoofScene3D from './RoofScene3D';

/**
 * 🏠 RoofModal3D: Modal popup for inspecting 3D Roof models
 */
export default function RoofModal3D({ isOpen, onClose, v3Data, roofName = "Roof 3D Model" }) {
  const [roofColorMode, setRoofColorMode] = React.useState("palette"); // "palette" | "single"
  const [singleRoofColor, setSingleRoofColor] = React.useState("#334155");
  const [showOutlines, setShowOutlines] = React.useState(true);

  if (!isOpen || !v3Data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8">
      <div className="relative w-full max-w-5xl h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center px-6 py-3.5 bg-slate-800/95 border-b border-slate-700 gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">🏠</span>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">{roofName}</h2>
              <span className="text-xs text-emerald-400 font-semibold">V3 Deterministic 3D Mesh</span>
            </div>
          </div>

          {/* Quick Color Mode & Outline Toggles */}
          <div className="flex items-center gap-3 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-700/80">
            <div className="flex items-center bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setRoofColorMode("palette")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  roofColorMode === "palette" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🎨 Đa màu
              </button>
              <button
                onClick={() => setRoofColorMode("single")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  roofColorMode === "single" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🏠 1 Tone màu
              </button>
            </div>

            {roofColorMode === "single" && (
              <div className="flex items-center gap-1.5 border-l border-slate-700 pl-3">
                <input
                  type="color"
                  value={singleRoofColor}
                  onChange={(e) => setSingleRoofColor(e.target.value)}
                  className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                  title="Chọn màu ngói/mái"
                />
                {[
                  { name: "Xám", color: "#334155" },
                  { name: "Đỏ", color: "#b91c1c" },
                  { name: "Xanh", color: "#1e3a8a" }
                ].map(p => (
                  <button
                    key={p.color}
                    onClick={() => setSingleRoofColor(p.color)}
                    style={{ backgroundColor: p.color }}
                    className={`w-5 h-5 rounded-full border transition-transform ${
                      singleRoofColor === p.color ? "scale-110 border-white shadow-md" : "border-slate-600 hover:scale-105"
                    }`}
                    title={p.name}
                  />
                ))}
              </div>
            )}

            <label className="flex items-center gap-1.5 text-xs text-slate-300 border-l border-slate-700 pl-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOutlines}
                onChange={(e) => setShowOutlines(e.target.checked)}
                className="rounded text-blue-500 bg-slate-800 border-slate-600"
              />
              <span>Viền CAD</span>
            </label>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-red-500 rounded-full text-white transition-colors text-xs font-bold"
            title="Close 3D View"
          >
            ✕
          </button>
        </div>

        {/* 3D Scene Body */}
        <div className="flex-1 relative">
          <RoofScene3D
            v3Data={v3Data}
            roofColorMode={roofColorMode}
            singleRoofColor={singleRoofColor}
            showOutlines={showOutlines}
          />
          
          <div className="absolute bottom-4 left-4 text-xs text-slate-300 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-700 shadow-md backdrop-blur pointer-events-none">
            🖱️ <strong>Left Click:</strong> Rotate | <strong>Right Click:</strong> Pan | <strong>Scroll:</strong> Zoom
          </div>
        </div>
      </div>
    </div>
  );
}
