import React from 'react';
import { Header } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { PropertyInspector } from './components/PropertyInspector';
import { Canvas } from './components/Canvas';
import { FloatingControls } from './components/FloatingControls';
import { useStore, isDoorTool, doorToolToDoorType } from './store/useStore';
import { DOOR_TYPE_LABELS } from './types/door';
import { UploadPanel } from './features/upload/UploadPanel';
import { DropOverlay } from './features/upload/DropOverlay';
import { parsePDFFile, parseImageFile } from './features/upload/upload.utils';
import { 
  Maximize, 
  MousePointer2, 
  Activity,
  Layers as LayersIcon,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const App: React.FC = () => {
  const { 
    image, 
    zoom, 
    annotations, 
    showSnap, 
    showGrid, 
    tool,
    pdfPages,
    currentPageIndex,
    setCurrentPageIndex,
    setImage,
    setPdfPages
  } = useStore();

  const handlePDFDrop = async (file: File) => {
    try {
      const pages = await parsePDFFile(file);
      if (pages.length > 0) {
        setPdfPages(pages);
        setImage(pages[0].image);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to parse dropped PDF.');
    }
  };

  const handleImageDrop = async (file: File) => {
    try {
      const img = await parseImageFile(file);
      setImage(img);
    } catch (err: any) {
      alert(err.message || 'Failed to decode dropped image.');
    }
  };

  const handleDropError = (errorMsg: string) => {
    alert(errorMsg);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans select-none overflow-hidden relative">
      {/* Global screen-wide drag-and-drop listener */}
      <DropOverlay 
        onPDFDrop={handlePDFDrop} 
        onImageDrop={handleImageDrop} 
        onError={handleDropError} 
      />

      <Header />
      
      {image === null ? (
        /* Center panel uploader when no floorplan is active */
        <UploadPanel />
      ) : (
        /* Full annotation workspace once file is loaded */
        <main className="flex-1 flex overflow-hidden animate-in">
          <Toolbar />
          
          <div className="flex-1 relative bg-black/20 flex flex-col">
            <Canvas />
            <FloatingControls />
            
            {/* Floating Tool Indicator */}
            <div className="absolute top-6 left-6 pointer-events-none animate-in z-20">
              <div className="glass-panel rounded-xl px-4 py-3 flex items-center gap-4 hover-glow transition-all border border-[var(--border-color)]">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent-color)]/20 flex items-center justify-center border border-[var(--accent-color)]/30 shadow-[inset_0_0_15px_rgba(78,201,176,0.2)]">
                  <Activity className="w-5 h-5 text-[var(--accent-color)]" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)]">Active Tool</p>
                  <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 uppercase tracking-wide">
                    {isDoorTool(tool) ? DOOR_TYPE_LABELS[doorToolToDoorType(tool)] : `${tool} Tool`}
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] animate-pulse shadow-[0_0_8px_var(--accent-color)]" />
                  </p>
                </div>
              </div>
            </div>

            {/* Floating PDF Multi-page Navigation */}
            {pdfPages.length > 1 && (
              <div className="absolute bottom-6 left-6 pointer-events-auto animate-in z-20">
                <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-4 hover-glow border border-[var(--border-color)]">
                  <button 
                    disabled={currentPageIndex === 0}
                    onClick={() => setCurrentPageIndex(currentPageIndex - 1)}
                    className="p-1 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none rounded transition-colors text-[var(--accent-color)]"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-secondary)] select-none">
                    Page {currentPageIndex + 1} of {pdfPages.length}
                  </span>
                  <button 
                    disabled={currentPageIndex === pdfPages.length - 1}
                    onClick={() => setCurrentPageIndex(currentPageIndex + 1)}
                    className="p-1 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none rounded transition-colors text-[var(--accent-color)]"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Mini Map placeholder */}
            <div className="absolute bottom-16 right-6 w-56 h-36 glass-panel rounded-xl overflow-hidden hidden md:flex flex-col hover-glow transition-all border border-[var(--border-color)]">
              <div className="h-7 bg-black/40 border-b border-[var(--border-color)] px-3 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Mini Map</span>
                <Maximize className="w-3.5 h-3.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer" />
              </div>
              <div className="flex-1 p-4 flex items-center justify-center opacity-20 relative">
                <LayersIcon className="w-16 h-16" />
                <div className="absolute w-20 h-12 border-2 border-[var(--accent-color)] bg-[var(--accent-color)]/10 rounded-sm" />
              </div>
            </div>
          </div>

          <div className="w-72 flex flex-col border-l border-[var(--border-color)] glass-panel z-10">
            <PropertyInspector />
            <Sidebar />
          </div>
        </main>
      )}

      {/* Status Bar */}
      <footer className="h-7 glass-panel border-t border-[var(--border-color)] flex items-center justify-between px-4 z-50 text-[11px] mono text-[var(--text-secondary)]">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <MousePointer2 className="w-3.5 h-3.5" />
            <span>X: 1024.45 | Y: 892.10</span>
          </div>
          <div className="h-4 w-[1px] bg-[var(--border-color)]" />
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            <span>IDLE</span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span>ZOOM: {(zoom * 100).toFixed(0)}%</span>
          </div>
          <div className="h-4 w-[1px] bg-[var(--border-color)]" />
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${showSnap ? 'bg-[var(--accent-color)] shadow-[0_0_5px_var(--accent-color)]' : 'bg-black/50 border border-[var(--border-color)]'}`} />
            <span>SNAP: {showSnap ? 'ON' : 'OFF'}</span>
          </div>
          <div className="h-4 w-[1px] bg-[var(--border-color)]" />
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${showGrid ? 'bg-[var(--accent-color)] shadow-[0_0_5px_var(--accent-color)]' : 'bg-black/50 border border-[var(--border-color)]'}`} />
            <span>GRID: {showGrid ? 'ON' : 'OFF'}</span>
          </div>
          <div className="h-4 w-[1px] bg-[var(--border-color)]" />
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            <span className="font-bold">ANNOTATIONS: {annotations.length}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
