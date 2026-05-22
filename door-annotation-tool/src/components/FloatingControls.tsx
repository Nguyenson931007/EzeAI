import React from 'react';
import { useStore } from '../store/useStore';
import { MoveLeft, MoveRight, RotateCw, Trash2 } from 'lucide-react';
import { executeDeleteAnnotations } from '../store/commands';

export const FloatingControls: React.FC = () => {
  const { selectedIds, annotations, updateAnnotation } = useStore();
  const selected = annotations.find(a => selectedIds.includes(a.id));

  if (!selected || selectedIds.length !== 1) return null;

  // Simplified screen positioning for the floating toolbar
  // In a real app, you'd calculate the bounding box of the annotation in screen space
  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-auto animate-in z-[100]">
      <div className="bg-[#252526] border border-[#4EC9B0]/50 rounded-full px-4 py-2 flex items-center gap-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-2 pr-4 border-r border-[#3C3C3C]">
          <span className="text-[10px] font-bold uppercase text-[#9DA5B4]">Handle</span>
          <button 
            onClick={() => updateAnnotation(selected.id, { semantics: { ...selected.semantics, hingeSide: 'left' } as any })}
            className={`p-1.5 rounded-full transition-all ${selected.semantics?.hingeSide === 'left' ? 'bg-[#4EC9B0] text-[#1E1E1E]' : 'hover:bg-white/5 text-[#D4D4D4]'}`}
          >
            <MoveLeft className="w-4 h-4" />
          </button>
          <button 
            onClick={() => updateAnnotation(selected.id, { semantics: { ...selected.semantics, hingeSide: 'right' } as any })}
            className={`p-1.5 rounded-full transition-all ${selected.semantics?.hingeSide === 'right' ? 'bg-[#4EC9B0] text-[#1E1E1E]' : 'hover:bg-white/5 text-[#D4D4D4]'}`}
          >
            <MoveRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 pr-4 border-r border-[#3C3C3C]">
          <span className="text-[10px] font-bold uppercase text-[#9DA5B4]">Swing</span>
          <button 
            onClick={() => updateAnnotation(selected.id, { semantics: { ...selected.semantics, swing: selected.semantics?.swing === 'inward' ? 'outward' : 'inward' } as any })}
            className="p-1.5 hover:bg-white/5 text-[#D4D4D4] rounded-full transition-all"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <button 
          onClick={() => executeDeleteAnnotations([selected.id])}
          className="p-1.5 hover:bg-[#F14C4C]/20 text-[#F14C4C] rounded-full transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
