/**
 * Header.tsx — Top navigation bar with file upload, undo/redo, grid/snap toggles,
 * and dataset export with label check images.
 */

import React from 'react';
import { 
  FileText, 
  Image as ImageIcon,
  RotateCcw,
  Undo2, 
  Redo2, 
  Zap, 
  Maximize,
  Settings,
  Database,
  ImageDown
} from 'lucide-react';
import { useStore, isDoorTool } from '../store/useStore';
import { commandManager } from '../store/CommandHistory';
import { parsePDFFile, parseImageFile } from '../features/upload/upload.utils';
import { exportYOLOSegmentation, exportCOCO } from '../export/exporter';
import { downloadLabelCheckImage } from '../export/labelCheck';

export const Header: React.FC = () => {
  const { 
    image,
    imageSize,
    imageName,
    annotations,
    setImage, 
    toggleGrid, 
    showGrid, 
    toggleSnap, 
    showSnap,
    setPdfPages,
    clearWorkspace
  } = useStore();
  
  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const pages = await parsePDFFile(file);
        if (pages.length > 0) {
          setPdfPages(pages);
          setImage(pages[0].image, file.name);
        }
      } catch (err: any) {
        alert(err.message || 'Failed to parse PDF document.');
      } finally {
        e.target.value = '';
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const img = await parseImageFile(file);
        setImage(img, file.name);
      } catch (err: any) {
        alert(err.message || 'Failed to decode image file.');
      } finally {
        e.target.value = '';
      }
    }
  };

  // ── Export Dataset (YOLO + check/ folder) ──
  const handleExportDataset = async () => {
    if (!image) return;
    const doorCount = annotations.filter(a => isDoorTool(a.type)).length;
    if (doorCount === 0) {
      alert('No door annotations to export. Draw some doors first.');
      return;
    }
    try {
      await exportYOLOSegmentation(
        annotations,
        imageSize,
        imageName,
        [],  // Uses default 5 door classes
        image
      );
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    }
  };

  // ── Download standalone label check image ──
  const handleDownloadCheck = async () => {
    if (!image) return;
    try {
      const baseName = imageName.split('.').slice(0, -1).join('.') || "floorplan";
      await downloadLabelCheckImage(image, annotations, `${baseName}_check.png`);
    } catch (err: any) {
      alert(`Label check failed: ${err.message}`);
    }
  };

  return (
    <header className="h-14 glass-panel border-b border-[var(--border-color)] flex items-center justify-between px-5 z-50 select-none shadow-md">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={clearWorkspace}>
          <div className="w-7 h-7 bg-[var(--accent-color)] rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(78,201,176,0.4)] group-hover:scale-105 transition-transform duration-300">
            <Maximize className="w-4 h-4 text-[var(--bg-primary)]" />
          </div>
          <span className="font-bold text-[15px] tracking-tight text-[var(--text-primary)]">
            DoorAnnotator{' '}
            <span className="text-[10px] bg-[var(--accent-color)]/20 text-[var(--accent-color)] px-1.5 py-0.5 rounded border border-[var(--accent-color)]/40 ml-1 uppercase tracking-widest shadow-[0_0_8px_rgba(78,201,176,0.25)]">PRO</span>
          </span>
        </div>
        
        <div className="h-5 w-[1px] bg-[var(--border-color)]" />
        
        {/* File upload + export actions */}
        {image && (
          <div className="flex items-center gap-1.5 animate-in">
            <label className="cad-btn bg-white/5 hover:bg-white/10 cursor-pointer border border-transparent hover:border-white/10 text-[var(--accent-color)]" title="Import PDF (.pdf)">
              <FileText className="w-4 h-4" />
              <input type="file" className="hidden" accept=".pdf" onChange={handlePDFUpload} />
            </label>
            <label className="cad-btn bg-white/5 hover:bg-white/10 cursor-pointer border border-transparent hover:border-white/10 text-[var(--accent-color)]" title="Import Image (.png, .jpg, .webp)">
              <ImageIcon className="w-4 h-4" />
              <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
            </label>
            <button 
              onClick={clearWorkspace} 
              className="cad-btn bg-white/5 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 text-[var(--text-secondary)] hover:text-red-400" 
              title="Close File"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="h-4 w-[1px] bg-[var(--border-color)] mx-1" />

            {/* Export Dataset (YOLO ZIP with check/ folder) */}
            <button
              onClick={handleExportDataset}
              className="cad-btn bg-white/5 hover:bg-[var(--accent-color)]/10 border border-transparent hover:border-[var(--accent-color)]/20 text-[var(--text-primary)] hover:text-[var(--accent-color)]"
              title="Export YOLO Dataset + Label Check (Ctrl+E)"
            >
              <Database className="w-4 h-4" />
            </button>

            {/* Standalone Label Check Download */}
            <button
              onClick={handleDownloadCheck}
              className="cad-btn bg-white/5 hover:bg-[var(--accent-color)]/10 border border-transparent hover:border-[var(--accent-color)]/20 text-[var(--text-primary)] hover:text-[var(--accent-color)]"
              title="Download Label Check Image"
            >
              <ImageDown className="w-4 h-4" />
            </button>
          </div>
        )}

        {image && <div className="h-5 w-[1px] bg-[var(--border-color)]" />}

        <div className="flex items-center gap-1.5">
          <button className="cad-btn hover:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" onClick={() => commandManager.undo()} title="Undo (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </button>
          <button className="cad-btn hover:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" onClick={() => commandManager.redo()} title="Redo (Ctrl+Y)">
            <Redo2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 border border-[var(--border-color)] shadow-inner">
          <button 
            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all duration-300 ${showGrid ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)] shadow-[inset_0_0_8px_rgba(78,201,176,0.2)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            onClick={toggleGrid}
          >
            GRID
          </button>
          <button 
            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all duration-300 ${showSnap ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)] shadow-[inset_0_0_8px_rgba(78,201,176,0.2)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            onClick={toggleSnap}
          >
            SNAP
          </button>
        </div>

        <button className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30 rounded-lg text-[var(--accent-color)] text-[11px] tracking-widest font-bold hover:bg-[var(--accent-color)]/20 hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_15px_rgba(78,201,176,0.15)] group">
          <Zap className="w-3.5 h-3.5 fill-[var(--accent-color)] group-hover:animate-pulse" />
          SYNTHETIC GENERATE
        </button>
        
        <button className="cad-btn ml-2 hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
