'use client';

import React, { useState } from 'react';
import RoofScene3D from './RoofScene3D';
// NOTE: Phần Truss tạm thời comment lại theo yêu cầu, sẽ sử dụng lại nên không xóa hay revert lại comment đó.
// import TrussEngine, { TRUSS_SPACINGS, TRUSS_COLORS, exportTrussDebugInfo } from '../Truss/TrussEngine';

/**
 * 🏠 RoofModal3D: Modal popup for inspecting 3D Roof & Truss models
 */
export default function RoofModal3D({ isOpen, onClose, v3Data, roofName = "Roof 3D Model" }) {
  const [roofColorMode, setRoofColorMode] = useState("palette"); // "palette" | "single"
  const [singleRoofColor, setSingleRoofColor] = useState("#334155");
  const [showOutlines, setShowOutlines] = useState(true);

  // NOTE: Phần Truss tạm thời comment lại theo yêu cầu, sẽ sử dụng lại nên không xóa hay revert lại comment đó.
  /*
  // Truss View States
  const [showTruss, setShowTruss] = useState(false);
  const [trussSpacingMm, setTrussSpacingMm] = useState(600);
  const [xrayMode, setXrayMode] = useState(true);
  const [hideRoofShell, setHideRoofShell] = useState(false);
  const [trussStats, setTrussStats] = useState(null);
  */

  if (!isOpen || !v3Data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8">
      <div className="relative w-full max-w-6xl h-[88vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center px-6 py-3 bg-slate-800/95 border-b border-slate-700 gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">🏠</span>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">{roofName}</h2>
              <span className="text-xs text-emerald-400 font-semibold">V3 Deterministic 3D &amp; Truss Engine</span>
            </div>
          </div>

          {/* Quick Controls */}
          <div className="flex items-center flex-wrap gap-2.5 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700/80">
            {/* NOTE: Phần Truss tạm thời comment lại theo yêu cầu, sẽ sử dụng lại nên không xóa hay revert lại comment đó. */}
            {/*
            <button
              onClick={() => setShowTruss(!showTruss)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${showTruss
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
            >
              <span>🦴</span>
              <span>{showTruss ? "Trusses Enabled" : "View Trusses"}</span>
            </button>

            {showTruss && (
              <div className="flex items-center gap-2 border-l border-slate-700 pl-2 text-xs">
                <select
                  value={trussSpacingMm}
                  onChange={(e) => setTrussSpacingMm(Number(e.target.value))}
                  className="bg-slate-800 text-slate-200 border border-slate-600 rounded px-2 py-0.5 text-xs focus:outline-none"
                  title="Spacing between truss centres"
                >
                  {TRUSS_SPACINGS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>

                <label className="flex items-center gap-1 text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={xrayMode}
                    onChange={(e) => setXrayMode(e.target.checked)}
                    className="rounded text-amber-500 bg-slate-800 border-slate-600 w-3.5 h-3.5"
                  />
                  <span>X-Ray Roof</span>
                </label>

                <label className="flex items-center gap-1 text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideRoofShell}
                    onChange={(e) => setHideRoofShell(e.target.checked)}
                    className="rounded text-amber-500 bg-slate-800 border-slate-600 w-3.5 h-3.5"
                  />
                  <span>Hide Roof Shell</span>
                </label>
               
                <button
                  onClick={() => {
                    exportTrussDebugInfo(trussStats || v3Data, {
                      download: true,
                      logConsole: true,
                      roofName
                    });
                  }}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white font-semibold transition-all shadow-sm cursor-pointer ml-1"
                  title="Xuất toàn bộ thông tin & tọa độ 2D/3D các thanh Truss ra file JSON để debug"
                >
                  <span>🐞</span>
                  <span>Xuất Debug Truss</span>
                </button>
              </div>
            )}
            */}

            {/* Roof Color Mode Toggles */}
            <div className="flex items-center bg-slate-800 p-0.5 rounded-lg text-xs font-semibold border-l border-slate-700 pl-2">
              <button
                onClick={() => setRoofColorMode("palette")}
                className={`px-2 py-0.5 rounded transition-all ${roofColorMode === "palette" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                🎨 Multi-Color
              </button>
              <button
                onClick={() => setRoofColorMode("single")}
                className={`px-2 py-0.5 rounded transition-all ${roofColorMode === "single" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                🏠 Single Tone
              </button>
            </div>

            {roofColorMode === "single" && (
              <div className="flex items-center gap-1 border-l border-slate-700 pl-2">
                <input
                  type="color"
                  value={singleRoofColor}
                  onChange={(e) => setSingleRoofColor(e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                  title="Select roof color"
                />
              </div>
            )}

            <label className="flex items-center gap-1 text-xs text-slate-300 border-l border-slate-700 pl-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOutlines}
                onChange={(e) => setShowOutlines(e.target.checked)}
                className="rounded text-blue-500 bg-slate-800 border-slate-600 w-3.5 h-3.5"
              />
              <span>CAD Outlines</span>
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
            // NOTE: Phần Truss tạm thời comment lại theo yêu cầu, sẽ sử dụng lại nên không xóa hay revert lại comment đó.
            /*
            showTruss={showTruss}
            trussSpacingMm={trussSpacingMm}
            xrayMode={xrayMode}
            hideRoofShell={hideRoofShell}
            onTrussCalculated={setTrussStats}
            */
          />

          {/* Navigation Hint */}
          <div className="absolute bottom-4 left-4 text-xs text-slate-300 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-700 shadow-md backdrop-blur pointer-events-none">
            🖱️ <strong>Left Click:</strong> Rotate 3D | <strong>Right Click:</strong> Pan | <strong>Scroll:</strong> Zoom
          </div>

          {/* NOTE: Phần Truss tạm thời comment lại theo yêu cầu, sẽ sử dụng lại nên không xóa hay revert lại comment đó. */}
          {/*
          // Truss Legend & Stats Badge
          showTruss && trussStats && (
            <div className="absolute top-4 right-4 bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 shadow-xl backdrop-blur-md text-xs max-w-xs">
              <div className="font-bold text-amber-400 mb-2 flex items-center justify-between border-b border-slate-700 pb-1.5">
                <span>ROOF TRUSS SYSTEM</span>
                <span className="bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded text-[11px]">
                  {trussStats.totalCount} units
                </span>
              </div>
              <div className="space-y-1 text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-1.5 rounded-sm inline-block" style={{ background: TRUSS_COLORS.girder }}></span>
                    Girder Truss (2-ply):
                  </span>
                  <span className="font-bold text-white">{trussStats.counts.girder || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-1.5 rounded-sm inline-block" style={{ background: TRUSS_COLORS.standard }}></span>
                    Standard Truss:
                  </span>
                  <span className="font-bold text-white">{trussStats.counts.standard || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-1.5 rounded-sm inline-block" style={{ background: TRUSS_COLORS.hip }}></span>
                    Hip / Gable End:
                  </span>
                  <span className="font-bold text-white">{(trussStats.counts.hip || 0) + (trussStats.counts.gable || 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-1.5 rounded-sm inline-block" style={{ background: TRUSS_COLORS.sidejack }}></span>
                    Side Jack (Hip):
                  </span>
                  <span className="font-bold text-white">{trussStats.counts.sidejack || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-1.5 rounded-sm inline-block" style={{ background: TRUSS_COLORS.valleytruss }}></span>
                    Valley Truss:
                  </span>
                  <span className="font-bold text-white">{trussStats.counts.valleytruss || 0}</span>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-700/60 text-[11px] text-slate-400 flex justify-between">
                <span>Total Timber Length:</span>
                <span className="font-semibold text-emerald-400">{trussStats.totalTimberLm} m</span>
              </div>

              {trussStats.partitionBoxes && trussStats.partitionBoxes.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-700/60 text-[11px]">
                  <div className="font-bold text-fuchsia-400 mb-1.5 flex items-center justify-between">
                    <span>PHÂN RÃ HỘP ẢO</span>
                    <span className="bg-fuchsia-500/20 text-fuchsia-300 px-1.5 py-0.5 rounded text-[10px]">
                      {trussStats.partitionBoxes.length} Boxes
                    </span>
                  </div>
                  {trussStats.dominantBox && (
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-1.5 rounded-sm inline-block" style={{ background: '#f59e0b' }}></span>
                        Mái Hip Chính:
                      </span>
                      <span className="font-bold text-amber-400">{trussStats.dominantBox.areaM2} m²</span>
                    </div>
                  )}
                  {(trussStats.subordinateBoxes || []).map((sb, sIdx) => (
                    <div key={sIdx} className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-1.5 rounded-sm inline-block" style={{ background: sb.color || '#06b6d4' }}></span>
                        {`Khối Phụ ${sIdx + 1}`}:
                      </span>
                      <span className="font-bold text-cyan-400">{sb.areaM2} m²</span>
                    </div>
                  ))}
                  {trussStats.guideLines && trussStats.guideLines.length > 0 && (
                    <div className="flex items-center justify-between text-slate-300 mt-1">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-1.5 rounded-sm inline-block" style={{ background: '#ec4899' }}></span>
                        Đường Dóng Magenta:
                      </span>
                      <span className="font-bold text-pink-400">{trussStats.guideLines.filter(g => g.type === 'eave_extension').length} cuts</span>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 pt-2 border-t border-slate-700/80 flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    exportTrussDebugInfo(trussStats || v3Data, {
                      download: true,
                      logConsole: true,
                      roofName
                    });
                  }}
                  className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-center transition-all shadow flex items-center justify-center gap-1.5 text-xs cursor-pointer"
                  title="Tải file JSON và in bảng console tọa độ 2D & 3D của các thanh vì kèo"
                >
                  <span>🐞</span>
                  <span>Xuất Tọa Độ Truss (2D &amp; 3D)</span>
                </button>
              </div>
            </div>
          )
          */}
        </div>
      </div>
    </div>
  );
}
