/**
 * PropertyInspector.tsx — Right sidebar property editor for selected annotations.
 *
 * Shows door type selector, hinge/swing controls, geometry metrics,
 * confidence scores, and BIM export actions for all 5 door types.
 */

import React from 'react';
import { useStore, isDoorTool } from '../store/useStore';
import { 
  Trash2, Shield, Info, Download, MoveHorizontal, RotateCw,
  Gauge, FileJson, Building2
} from 'lucide-react';
import { executeDeleteAnnotations } from '../store/commands';
import { downloadBIMExport } from '../export/bimExport';
import { DOOR_TYPE_LABELS, DOOR_TYPE_COLORS, type DoorType } from '../types/door';

const DOOR_TYPES: DoorType[] = ['single_door', 'double_door', 'sliding_door', 'cavity_slider', 'bi_fold'];

export const PropertyInspector: React.FC = () => {
  const { annotations, selectedIds, updateAnnotation } = useStore();
  const selected = annotations.filter(a => selectedIds.includes(a.id));

  // ── Empty state ─────────────────────────────────────────────────────────
  if (selected.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#9DA5B4] p-8 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-[#3C3C3C] flex items-center justify-center mb-4">
          <Info className="w-6 h-6 opacity-20" />
        </div>
        <p className="text-xs font-medium uppercase tracking-widest opacity-50">Context Properties</p>
        <p className="text-[11px] mt-2">Select a room, wall, or door to edit properties</p>
      </div>
    );
  }

  // ── Single annotation export ────────────────────────────────────────────
  const handleExportSingle = (ann: any) => {
    const data = {
      id: ann.id,
      type: ann.type,
      door_type: ann.semantics?.type || 'single_door',
      semantics: ann.semantics,
      polygon: ann.polygon,
      metadata: ann.metadata
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `door_${ann.id.slice(0, 8)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── BIM Export all doors ────────────────────────────────────────────────
  const handleBIMExport = () => {
    downloadBIMExport(annotations);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-6">
      {selected.map(ann => {
        const doorType: DoorType = (ann.semantics?.type as DoorType) || 'single_door';
        const typeColor = DOOR_TYPE_COLORS[doorType] || '#3b82f6';
        const isSwingDoor = doorType === 'single_door' || doorType === 'double_door';
        const isSlidingType = doorType === 'sliding_door' || doorType === 'cavity_slider';

        // Confidence values
        const detectConf = (ann.metadata?.conf as number) ?? 0.9;
        const geomConf = (ann.metadata?.geometry_confidence as number) ?? 0.85;
        const ocrConf = (ann.metadata?.ocr_confidence as number) ?? 0.0;
        const semConf = (ann.metadata?.semantic_confidence as number) ?? 0.9;
        const finalConf = 0.3 * detectConf + 0.3 * geomConf + 0.1 * ocrConf + 0.3 * semConf;

        return (
          <div key={ann.id} className="space-y-6 animate-in">
            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="flex items-center justify-between pb-3 border-b border-[#3C3C3C]">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: typeColor, boxShadow: `0 0 8px ${typeColor}` }} />
                <span className="text-[11px] font-bold uppercase tracking-tight text-[#D4D4D4]">
                  {DOOR_TYPE_LABELS[doorType] || 'Door'} Annotation
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleExportSingle(ann)}
                  className="p-1.5 hover:bg-[#4EC9B0]/10 text-[#4EC9B0] rounded transition-colors" title="Export JSON">
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => executeDeleteAnnotations([ann.id])}
                  className="p-1.5 hover:bg-[#F14C4C]/10 text-[#F14C4C] rounded transition-colors" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ── 1. Door Type ─────────────────────────────────────────── */}
            <div className="space-y-2">
              <label className="cad-label">1. Door Type</label>
              <div className="grid grid-cols-1 gap-1">
                {DOOR_TYPES.map((dt) => {
                  const isActive = doorType === dt;
                  const c = DOOR_TYPE_COLORS[dt];
                  return (
                    <button
                      key={dt}
                      onClick={() => updateAnnotation(ann.id, { semantics: { ...ann.semantics, type: dt } as any })}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-all text-[10px] font-semibold uppercase tracking-wide
                        ${isActive
                          ? 'bg-white/10 text-[var(--text-primary)] border border-white/15'
                          : 'text-[#9DA5B4] hover:bg-white/5'}`}
                    >
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                      {DOOR_TYPE_LABELS[dt]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── 2. Hinge Side (for swing doors) ──────────────────────── */}
            {isSwingDoor && (
              <div className="space-y-2">
                <label className="cad-label">2. Hinge Side</label>
                <div className="flex gap-2 p-1 bg-[#1E1E1E] rounded border border-[#3C3C3C]">
                  {(doorType === 'double_door' ? ['dual'] : ['left', 'right']).map((side) => (
                    <button
                      key={side}
                      onClick={() => updateAnnotation(ann.id, { semantics: { ...ann.semantics, hingeSide: side } as any })}
                      className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all
                        ${(ann.semantics?.hingeSide || 'left') === side
                          ? 'bg-[#4EC9B0] text-[#1E1E1E]'
                          : 'text-[#9DA5B4] hover:bg-white/5'}`}
                    >
                      {side}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── 3. Swing Direction (for swing doors) ─────────────────── */}
            {isSwingDoor && (
              <div className="space-y-2">
                <label className="cad-label">3. Swing Direction</label>
                <div className="flex gap-2 p-1 bg-[#1E1E1E] rounded border border-[#3C3C3C]">
                  {['inward', 'outward'].map((dir) => (
                    <button
                      key={dir}
                      onClick={() => updateAnnotation(ann.id, { semantics: { ...ann.semantics, swing: dir } as any })}
                      className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all
                        ${(ann.semantics?.swing || 'inward') === dir
                          ? 'bg-[#4EC9B0] text-[#1E1E1E]'
                          : 'text-[#9DA5B4] hover:bg-white/5'}`}
                    >
                      {dir}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── 4. Geometry ──────────────────────────────────────────── */}
            <div className="space-y-3 pt-2">
              <label className="cad-label">4. Geometry</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#1E1E1E] p-2 rounded border border-[#3C3C3C]">
                  <div className="flex items-center gap-1.5 mb-1 opacity-50">
                    <MoveHorizontal className="w-3 h-3" />
                    <span className="text-[9px] uppercase font-bold">Width</span>
                  </div>
                  <span className="mono text-xs text-[#4EC9B0] font-medium">
                    {ann.semantics?.width?.toFixed(1) || '0.0'} px
                  </span>
                </div>
                <div className="bg-[#1E1E1E] p-2 rounded border border-[#3C3C3C]">
                  <div className="flex items-center gap-1.5 mb-1 opacity-50">
                    <RotateCw className="w-3 h-3" />
                    <span className="text-[9px] uppercase font-bold">Angle</span>
                  </div>
                  <span className="mono text-xs text-[#4EC9B0] font-medium">
                    {ann.semantics?.angle?.toFixed(1) || '0.0'}°
                  </span>
                </div>
              </div>
            </div>

            {/* ── 5. Confidence Scores ─────────────────────────────────── */}
            <div className="space-y-3 pt-2">
              <label className="cad-label flex items-center gap-1.5">
                <Gauge className="w-3 h-3" /> 5. Confidence
              </label>
              <div className="space-y-1.5">
                {[
                  { label: 'DETECT', value: detectConf },
                  { label: 'GEOMETRY', value: geomConf },
                  { label: 'OCR', value: ocrConf },
                  { label: 'SEMANTIC', value: semConf },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[9px] uppercase font-bold text-[#9DA5B4] w-16">{label}</span>
                    <div className="flex-1 h-1.5 bg-[#1E1E1E] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${value * 100}%`,
                          backgroundColor: value > 0.7 ? '#4EC9B0' : value > 0.4 ? '#f59e0b' : '#ef4444',
                        }}
                      />
                    </div>
                    <span className="mono text-[10px] text-[#D4D4D4] w-10 text-right">
                      {(value * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1 border-t border-[#3C3C3C]/50">
                  <span className="text-[9px] uppercase font-bold text-[var(--accent-color)] w-16">FINAL</span>
                  <div className="flex-1 h-2 bg-[#1E1E1E] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#4EC9B0] to-[#5EEAD4] transition-all duration-500"
                      style={{ width: `${finalConf * 100}%` }}
                    />
                  </div>
                  <span className="mono text-[10px] text-[var(--accent-color)] w-10 text-right font-bold">
                    {(finalConf * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* ── 6. Metadata ──────────────────────────────────────────── */}
            <div className="space-y-3 pt-2">
              <label className="cad-label">6. Metadata</label>
              <div className="space-y-2 text-[10px] mono">
                <div className="flex justify-between p-2 bg-[#1E1E1E]/50 rounded border border-[#3C3C3C]/50">
                  <span className="text-[#9DA5B4]">ANN ID</span>
                  <span className="text-[#D4D4D4]">{ann.id.slice(0, 12)}...</span>
                </div>
                <div className="flex justify-between p-2 bg-[#1E1E1E]/50 rounded border border-[#3C3C3C]/50">
                  <span className="text-[#9DA5B4]">IFC ENTITY</span>
                  <span className="text-[#D4D4D4]">IfcDoor</span>
                </div>
                {ann.polygon[0] && (
                  <>
                    <div className="flex justify-between p-2 bg-[#1E1E1E]/50 rounded border border-[#3C3C3C]/50">
                      <span className="text-[#9DA5B4]">COORD X</span>
                      <span className="text-[#D4D4D4]">{ann.polygon[0]?.x.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-[#1E1E1E]/50 rounded border border-[#3C3C3C]/50">
                      <span className="text-[#9DA5B4]">COORD Y</span>
                      <span className="text-[#D4D4D4]">{ann.polygon[0]?.y.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* ── BIM Export Button (at bottom) ────────────────────────────────── */}
      <div className="pt-4 border-t border-[#3C3C3C] space-y-2">
        <button
          onClick={handleBIMExport}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-r from-[#4EC9B0]/20 to-[#3b82f6]/20 border border-[#4EC9B0]/30 text-[var(--accent-color)] hover:from-[#4EC9B0]/30 hover:to-[#3b82f6]/30 transition-all duration-300 hover:shadow-[0_0_20px_rgba(78,201,176,0.15)]"
        >
          <Building2 className="w-4 h-4" />
          <span className="text-[11px] font-bold uppercase tracking-wider">IFC BIM Export</span>
        </button>
        <p className="text-[9px] text-[#9DA5B4] text-center">
          Exports all {annotations.filter(a => isDoorTool(a.type)).length} doors as IFC-ready JSON
        </p>
      </div>
    </div>
  );
};
