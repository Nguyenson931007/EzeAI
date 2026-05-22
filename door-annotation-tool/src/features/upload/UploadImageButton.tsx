import React, { useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface UploadImageButtonProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export const UploadImageButton: React.FC<UploadImageButtonProps> = ({
  onFileSelect,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      e.target.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      aria-label="Upload Image Floorplan"
      className="group relative flex flex-col items-center justify-center p-6 bg-black/35 hover:bg-black/50 border border-[var(--border-color)] hover:border-[var(--accent-color)]/50 rounded-xl transition-all duration-300 w-full text-center hover-glow cursor-pointer disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/60 focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]"
    >
      {/* Hidden native input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/jpg, image/webp"
        className="hidden"
        onChange={handleFileChange}
        tabIndex={-1}
      />

      {/* Interactive Neural/Image Icon container */}
      <div className="w-12 h-12 rounded-lg bg-[var(--accent-color)]/10 flex items-center justify-center border border-[var(--accent-color)]/20 shadow-[inset_0_0_12px_rgba(78,201,176,0.1)] group-hover:scale-105 group-hover:shadow-[0_0_15px_rgba(78,201,176,0.25)] transition-all duration-300 mb-4">
        <ImageIcon className="w-6 h-6 text-[var(--accent-color)] group-hover:text-[var(--accent-secondary)] transition-colors duration-300" />
      </div>

      <h3 className="text-xs uppercase font-bold tracking-widest text-[var(--text-primary)] group-hover:text-[var(--accent-color)] transition-colors duration-200">
        Upload Image
      </h3>
      <p className="text-[10px] text-[var(--text-secondary)] mt-1.5 leading-relaxed max-w-[200px]">
        Render directly on the canvas and trigger intelligent AI walls/doors detection.
      </p>

      {/* Format badge */}
      <div className="mt-4 px-2 py-0.5 rounded bg-black/40 border border-white/5 text-[9px] font-bold text-[var(--text-secondary)] tracking-wide uppercase mono">
        PNG, JPG, WEBP
      </div>

      {/* Tooltip */}
      <div className="absolute bottom-[-45px] left-1/2 -translate-x-1/2 px-3 py-1.5 glass-panel rounded-md shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-[100] border border-[var(--border-color)]">
        <span className="text-[10px] font-bold text-[var(--text-primary)]">Preloads raw dimensions and aspect ratios</span>
      </div>
    </button>
  );
};
