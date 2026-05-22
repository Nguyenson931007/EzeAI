import React, { useEffect, useState, useRef } from 'react';
import { Upload, FileText, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { validateFile } from './upload.utils';

interface DropOverlayProps {
  onPDFDrop: (file: File) => void;
  onImageDrop: (file: File) => void;
  onError: (errorMsg: string) => void;
}

export const DropOverlay: React.FC<DropOverlayProps> = ({
  onPDFDrop,
  onImageDrop,
  onError,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [draggedType, setDraggedType] = useState<'pdf' | 'image' | 'invalid' | null>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
        const files = Array.from(e.dataTransfer.items);
        const hasPDF = files.some(item => item.type === 'application/pdf' || item.kind === 'file' && item.type === '');
        const hasImage = files.some(item => item.type.startsWith('image/'));
        
        if (hasPDF) {
          setDraggedType('pdf');
        } else if (hasImage) {
          setDraggedType('image');
        } else {
          setDraggedType('invalid');
        }
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setIsDragging(false);
        setDraggedType(null);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setDraggedType(null);
      dragCounter.current = 0;

      const file = e.dataTransfer?.files?.[0];
      if (file) {
        const errorMsg = await validateFile(file);
        if (errorMsg) {
          onError(errorMsg);
          return;
        }

        const name = file.name.toLowerCase();
        const type = file.type.toLowerCase();

        if (name.endsWith('.pdf') || type === 'application/pdf') {
          onPDFDrop(file);
        } else {
          onImageDrop(file);
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onPDFDrop, onImageDrop, onError]);

  if (!isDragging) return null;

  const renderContent = () => {
    switch (draggedType) {
      case 'pdf':
        return (
          <div className="flex flex-col items-center animate-in">
            <div className="w-16 h-16 rounded-2xl bg-[#4EC9B0]/20 flex items-center justify-center border-2 border-[var(--accent-color)] shadow-[0_0_30px_rgba(78,201,176,0.3)] animate-pulse mb-6">
              <FileText className="w-8 h-8 text-[var(--accent-color)]" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--accent-color)]">
              Route to PDF blueprint pipeline
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-2">
              Drop file to extract high-res page vectors.
            </p>
          </div>
        );
      case 'image':
        return (
          <div className="flex flex-col items-center animate-in">
            <div className="w-16 h-16 rounded-2xl bg-[#4EC9B0]/20 flex items-center justify-center border-2 border-[var(--accent-color)] shadow-[0_0_30px_rgba(78,201,176,0.3)] animate-pulse mb-6">
              <ImageIcon className="w-8 h-8 text-[var(--accent-color)]" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--accent-color)]">
              Route to Image AI pipeline
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-2">
              Drop file to initialize direct canvas & OCR inferences.
            </p>
          </div>
        );
      case 'invalid':
        return (
          <div className="flex flex-col items-center animate-in">
            <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center border-2 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)] mb-6">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-red-400">
              Unsupported File Format
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-2">
              Only PDFs and images (.png, .jpg, .jpeg, .webp) are accepted.
            </p>
          </div>
        );
      default:
        return (
          <div className="flex flex-col items-center animate-in">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-[var(--border-color)] mb-6">
              <Upload className="w-8 h-8 text-[var(--text-secondary)]" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-primary)]">
              Drop floorplan document
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-2">
              Automatically routes into correct importer workflow.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0B0C10]/80 backdrop-blur-md z-[10000] flex items-center justify-center p-8 transition-all duration-300">
      {/* Blueprint Grid Layout */}
      <div className="absolute inset-4 border border-dashed border-[var(--accent-color)]/30 rounded-2xl pointer-events-none grid-background flex items-center justify-center">
        {/* Glow corners */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[var(--accent-color)]" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[var(--accent-color)]" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[var(--accent-color)]" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[var(--accent-color)]" />
      </div>

      <div className="glass-panel max-w-md w-full rounded-2xl p-8 flex flex-col items-center border border-[var(--accent-color)]/35 shadow-[0_0_50px_rgba(78,201,176,0.15)] z-10 pointer-events-none">
        {renderContent()}
      </div>
    </div>
  );
};
