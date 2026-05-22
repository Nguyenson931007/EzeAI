import React, { useState } from 'react';
import { 
  Layers, 
  List, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Search,
  Download,
  Trash2
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { executeDeleteAnnotations } from '../store/commands';
import { DOOR_TYPE_COLORS, DOOR_TYPE_LABELS, type DoorType } from '../types/door';

export const Sidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'layers' | 'list'>('list');
  const { annotations, selectedIds, setSelectedIds } = useStore();
  const [search, setSearch] = useState('');

  const filteredAnnotations = annotations.filter(a => 
    a.id.toLowerCase().includes(search.toLowerCase()) ||
    a.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-72 bg-[#252526] border-l border-[#3C3C3C] flex flex-col z-40">
      {/* Tabs */}
      <div className="flex h-10 border-b border-[#3C3C3C]">
        <button
          onClick={() => setActiveTab('layers')}
          className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all
            ${activeTab === 'layers' ? 'bg-[#1E1E1E] text-[#4EC9B0]' : 'text-[#9DA5B4] hover:bg-white/5'}`}
        >
          <Layers className="w-3.5 h-3.5" />
          Layers
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all
            ${activeTab === 'list' ? 'bg-[#1E1E1E] text-[#4EC9B0]' : 'text-[#9DA5B4] hover:bg-white/5'}`}
        >
          <List className="w-3.5 h-3.5" />
          Annotations
        </button>
      </div>

      {activeTab === 'layers' ? (
        <div className="flex-1 p-4 space-y-4">
          <div className="space-y-1">
            <LayerItem name="Background Image" />
            <LayerItem name="Walls" active count={24} />
            <LayerItem name="Doors" active count={annotations.length} />
            <LayerItem name="Windows" />
            <LayerItem name="Guides" locked />
          </div>
          
          <div className="pt-4 border-t border-[#3C3C3C]">
            <label className="cad-label">Master Opacity</label>
            <input type="range" className="w-full accent-[#4EC9B0] h-1 bg-[#1E1E1E] rounded-lg appearance-none cursor-pointer" />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Search */}
          <div className="p-3 border-b border-[#3C3C3C]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9DA5B4]" />
              <input
                type="text"
                placeholder="Search annotations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#1E1E1E] border border-[#3C3C3C] rounded px-8 py-1.5 text-xs text-[#D4D4D4] focus:outline-none focus:border-[#4EC9B0]/50"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-[#252526] z-10 border-b border-[#3C3C3C]">
                <tr className="text-[9px] uppercase font-bold text-[#9DA5B4] text-left">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Width</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3C3C3C]/30">
                {filteredAnnotations.map(ann => (
                  <tr 
                    key={ann.id}
                    onClick={() => setSelectedIds([ann.id])}
                    className={`group cursor-pointer transition-colors
                      ${selectedIds.includes(ann.id) ? 'bg-[#4EC9B0]/10' : 'hover:bg-white/5'}`}
                  >
                    <td className="px-3 py-3 mono text-[10px] text-[#D4D4D4]">
                      {ann.id.slice(0, 6)}
                    </td>
                    <td className="px-2 py-3">
                      {(() => {
                        const dt = (ann.semantics?.type as DoorType) || null;
                        const dtColor = dt ? DOOR_TYPE_COLORS[dt] : undefined;
                        const dtLabel = dt ? DOOR_TYPE_LABELS[dt] : ann.type;
                        return (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-[#1E1E1E] border border-[#3C3C3C] rounded text-[#9DA5B4] flex items-center gap-1.5 w-fit">
                            {dtColor && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dtColor }} />}
                            {dtLabel}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-3 mono text-[10px] text-[#4EC9B0]">
                      {ann.semantics?.width?.toFixed(0) || '-'}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); /* Download logic */ }}
                          className="p-1 text-[#9DA5B4] hover:text-[#4EC9B0]"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); executeDeleteAnnotations([ann.id]); }}
                          className="p-1 text-[#9DA5B4] hover:text-[#F14C4C]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const LayerItem: React.FC<{ name: string; active?: boolean; locked?: boolean; count?: number }> = ({ 
  name, active = false, locked = false, count = 0 
}) => (
  <div className={`flex items-center justify-between p-2 rounded transition-colors ${active ? 'bg-white/5' : 'hover:bg-white/5 opacity-50'}`}>
    <div className="flex items-center gap-2">
      {active ? <Eye className="w-3.5 h-3.5 text-[#4EC9B0]" /> : <EyeOff className="w-3.5 h-3.5 text-[#9DA5B4]" />}
      <span className="text-[11px] font-medium text-[#D4D4D4]">{name}</span>
      {count > 0 && (
        <span className="text-[9px] px-1 bg-[#1E1E1E] rounded text-[#9DA5B4] mono">{count}</span>
      )}
    </div>
    <button className="text-[#9DA5B4] hover:text-[#D4D4D4]">
      {locked ? <Lock className="w-3.5 h-3.5 text-[#F14C4C]" /> : <Unlock className="w-3.5 h-3.5" />}
    </button>
  </div>
);
