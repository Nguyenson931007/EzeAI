/**
 * Toolbar.tsx — Left sidebar toolbar with door sub-type flyout menu.
 *
 * The door tool button reveals a glassmorphic flyout panel listing
 * all 5 supported door types with color indicators and keyboard shortcuts.
 */

import React, { useState } from 'react';
import { 
  MousePointer2, 
  DoorOpen, 
  Square, 
  Hand, 
  Ruler, 
  Plus,
  ChevronRight,
  ArrowLeftRight,
  PanelRight,
  Columns2,
  FoldVertical
} from 'lucide-react';
import { useStore, isDoorTool, type ToolType } from '../store/useStore';
import { DOOR_TYPE_COLORS, DOOR_TYPE_LABELS, type DoorType } from '../types/door';

// ─── Door sub-type definitions ──────────────────────────────────────────────
interface DoorSubItem {
  tool: ToolType;
  doorType: DoorType;
  label: string;
  icon: React.ReactNode;
  shortcut: string;
}

const DOOR_SUB_ITEMS: DoorSubItem[] = [
  { tool: 'door_single',  doorType: 'single_door',   label: 'Single Door',   icon: <DoorOpen />,       shortcut: 'D1' },
  { tool: 'door_double',  doorType: 'double_door',   label: 'Double Door',   icon: <Columns2 />,       shortcut: 'D2' },
  { tool: 'door_sliding', doorType: 'sliding_door',  label: 'Sliding Door',  icon: <ArrowLeftRight />, shortcut: 'D3' },
  { tool: 'door_cavity',  doorType: 'cavity_slider',  label: 'Cavity Slider', icon: <PanelRight />,     shortcut: 'D4' },
  { tool: 'door_bifold',  doorType: 'bi_fold',        label: 'Bi-Fold Door',  icon: <FoldVertical />,   shortcut: 'D5' },
];

// ─── Generic Tool Item ──────────────────────────────────────────────────────
interface ToolItemProps {
  type: ToolType;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  children?: React.ReactNode;
}

const ToolItem: React.FC<ToolItemProps> = ({ type, icon, label, shortcut, children }) => {
  const { tool, setTool } = useStore();
  const isActive = tool === type || (type === 'door' && isDoorTool(tool));

  return (
    <div className="relative group/tool">
      <button
        onClick={() => setTool(type)}
        className={`relative w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-300 mb-3
          ${isActive 
            ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)] shadow-[inset_0_0_12px_rgba(78,201,176,0.25)] border border-[var(--accent-color)]/40 scale-105' 
            : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)] hover:scale-105'}`}
        title={`${label} (${shortcut})`}
      >
        {React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
          className: 'w-5 h-5 transition-transform group-hover/tool:scale-110 group-active/tool:scale-95',
        })}
      </button>
      
      {/* Tooltip */}
      <div className="absolute left-14 top-0 px-3 py-1.5 glass-panel rounded-md shadow-2xl opacity-0 invisible group-hover/tool:opacity-100 group-hover/tool:visible transition-all duration-200 whitespace-nowrap z-[100] flex items-center gap-3 translate-x-[-10px] group-hover/tool:translate-x-0 pointer-events-none">
        <span className="text-[11px] font-semibold tracking-wide text-[var(--text-primary)]">{label}</span>
        <span className="text-[10px] font-bold text-[var(--accent-color)] bg-black/40 px-1.5 py-0.5 rounded border border-[var(--border-color)] mono">{shortcut}</span>
      </div>

      {children}
    </div>
  );
};

// ─── Door Flyout Sub-menu ───────────────────────────────────────────────────
const DoorFlyout: React.FC = () => {
  const { tool, setTool } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const isDoorActive = isDoorTool(tool);

  return (
    <div
      className="relative group/door"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* Main door button */}
      <button
        onClick={() => setTool(isDoorActive ? tool : 'door_single')}
        className={`relative w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-300 mb-3
          ${isDoorActive 
            ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)] shadow-[inset_0_0_12px_rgba(78,201,176,0.25)] border border-[var(--accent-color)]/40 scale-105' 
            : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)] hover:scale-105'}`}
        title="Door Tools (D)"
      >
        <DoorOpen className="w-5 h-5 transition-transform group-hover/door:scale-110" />
        {/* Flyout indicator chevron */}
        <ChevronRight className="absolute -right-0.5 bottom-1 w-2.5 h-2.5 text-[var(--text-secondary)] opacity-40" />
      </button>

      {/* Flyout panel */}
      {isOpen && (
        <div className="absolute left-14 top-0 glass-panel rounded-xl shadow-2xl z-[200] min-w-[200px] py-2 animate-in border border-[var(--border-color)]">
          <div className="px-3 py-1.5 mb-1 border-b border-[var(--border-color)]">
            <span className="text-[9px] uppercase tracking-[0.15em] font-bold text-[var(--text-secondary)]">
              Door Drawing Tools
            </span>
          </div>

          {DOOR_SUB_ITEMS.map((item) => {
            const isItemActive = tool === item.tool;
            const typeColor = DOOR_TYPE_COLORS[item.doorType];
            return (
              <button
                key={item.tool}
                onClick={() => { setTool(item.tool); setIsOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-all duration-200
                  ${isItemActive 
                    ? 'bg-[var(--accent-color)]/10 text-[var(--text-primary)]' 
                    : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]'}`}
              >
                {/* Color indicator dot */}
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm"
                  style={{
                    backgroundColor: typeColor,
                    boxShadow: isItemActive ? `0 0 8px ${typeColor}` : 'none',
                  }}
                />
                {/* Icon */}
                {React.cloneElement(item.icon as React.ReactElement<{ className?: string }>, {
                  className: 'w-4 h-4 flex-shrink-0',
                })}
                {/* Label */}
                <span className="text-[11px] font-medium tracking-wide flex-1">{item.label}</span>
                {/* Shortcut badge */}
                <span className="text-[9px] font-bold text-[var(--accent-color)] bg-black/40 px-1.5 py-0.5 rounded border border-[var(--border-color)] mono">
                  {item.shortcut}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Toolbar Component ──────────────────────────────────────────────────────
export const Toolbar: React.FC = () => {
  return (
    <aside className="w-16 glass-panel border-r border-[var(--border-color)] flex flex-col items-center py-6 z-40">
      <ToolItem type="select" icon={<MousePointer2 />} label="Select Tool" shortcut="V" />
      
      {/* Door flyout replaces the old single door button */}
      <DoorFlyout />
      
      <ToolItem type="wall" icon={<Square />} label="Wall Tool" shortcut="W" />
      <ToolItem type="window" icon={<Plus />} label="Window Tool" shortcut="F" />
      <div className="w-8 h-[1px] bg-[var(--border-color)] my-4 shadow-sm" />
      <ToolItem type="pan" icon={<Hand />} label="Pan Tool" shortcut="Space" />
      <ToolItem type="measure" icon={<Ruler />} label="Measure Tool" shortcut="M" />
    </aside>
  );
};
