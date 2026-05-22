import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { UploadPDFButton } from './UploadPDFButton';
import { UploadImageButton } from './UploadImageButton';
import { parsePDFFile, parseImageFile } from './upload.utils';
import { AlertCircle, Loader2, XCircle } from 'lucide-react';

export const UploadPanel: React.FC = () => {
  const { setImage, setPdfPages } = useStore();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePDFSelect = async (file: File) => {
    setLoading(true);
    setError(null);
    setProgress({ current: 0, total: 0 });
    try {
      const pages = await parsePDFFile(file, (current, total) => {
        setProgress({ current, total });
      });
      if (pages.length === 0) {
        throw new Error('PDF contains no readable pages.');
      }
      
      // Load parsed pages into store
      setPdfPages(pages);
      
      // Set the first page as active
      setImage(pages[0].image);
    } catch (err: any) {
      setError(err.message || 'Failed to parse PDF document.');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleImageSelect = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const img = await parseImageFile(file);
      setImage(img);
    } catch (err: any) {
      setError(err.message || 'Failed to decode image file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-[500px] flex items-center justify-center p-8 bg-[#0b0e14] relative overflow-hidden grid-background">
      {/* Decorative center circular target glow */}
      <div className="absolute w-[600px] h-[600px] rounded-full bg-[var(--accent-color)]/5 blur-[120px] pointer-events-none" />

      {/* Main Panel Box */}
      <div className="max-w-2xl w-full glass-panel rounded-2xl p-8 border border-[var(--border-color)] hover:border-[var(--accent-color)]/20 shadow-[0_20px_60px_rgba(0,0,0,0.6)] relative z-10 transition-all duration-500">
        
        {/* Glowing technical CAD corner marks */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-white/20 group-hover:border-[var(--accent-color)]/50" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-white/20 group-hover:border-[var(--accent-color)]/50" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-white/20 group-hover:border-[var(--accent-color)]/50" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-white/20 group-hover:border-[var(--accent-color)]/50" />

        {/* Header Title */}
        <div className="text-center mb-8">
          <span className="text-[10px] bg-[var(--accent-color)]/10 text-[var(--accent-color)] px-2.5 py-0.5 rounded border border-[var(--accent-color)]/20 uppercase tracking-widest font-bold shadow-[0_0_10px_rgba(78,201,176,0.1)]">
            EzeFloor BIM/CAD Workspace
          </span>
          <h2 className="text-lg font-bold text-[var(--text-primary)] uppercase tracking-widest mt-3">
            Initialize Floorplan Import
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
            Drag blueprints anywhere, or click one of the actions below to load a document.
          </p>
        </div>

        {/* Alert message */}
        {error && (
          <div className="mb-6 flex items-center justify-between p-3.5 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 text-xs animate-in">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400/60 hover:text-red-400 p-1 rounded-lg hover:bg-white/5 transition-colors"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Loading Overlay state */}
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 bg-black/20 rounded-xl border border-white/5 animate-in">
            <Loader2 className="w-10 h-10 text-[var(--accent-color)] animate-spin" />
            
            {progress && progress.total > 0 ? (
              <div className="mt-6 w-full max-w-[280px] text-center">
                <p className="text-[11px] font-semibold text-[var(--text-primary)] tracking-widest uppercase">
                  Processing PDF Blueprints
                </p>
                <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                  Parsing Page {progress.current} of {progress.total}
                </p>
                
                {/* Progress bar */}
                <div className="w-full h-1 bg-black/40 rounded-full mt-3 overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-[var(--accent-color)] transition-all duration-300 shadow-[0_0_8px_var(--accent-color)]"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-6 text-center">
                <p className="text-[11px] font-semibold text-[var(--text-primary)] tracking-widest uppercase animate-pulse">
                  Preloading Image Canvas
                </p>
                <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                  Decoding file and measuring scale bounds...
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Cards Grid layout */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <UploadPDFButton onFileSelect={handlePDFSelect} />
            <UploadImageButton onFileSelect={handleImageSelect} />
          </div>
        )}
      </div>
    </div>
  );
};
