import React from 'react';
import { useStore } from '../store/useStore';

export const MiniMap: React.FC = () => {
  const { image, imageSize, scale, position } = useStore();

  if (!image) return null;

  const mapWidth = 200;
  const ratio = imageSize.width / imageSize.height;
  const mapHeight = mapWidth / ratio;

  const viewWidth = window.innerWidth / scale;
  const viewHeight = window.innerHeight / scale;
  
  const viewportX = (-position.x / scale / imageSize.width) * mapWidth;
  const viewportY = (-position.y / scale / imageSize.height) * mapHeight;
  const viewportW = (viewWidth / imageSize.width) * mapWidth;
  const viewportH = (viewHeight / imageSize.height) * mapHeight;

  return (
    <div className="absolute bottom-6 right-6 w-[200px] bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-20 pointer-events-none">
      <div className="p-2 border-b border-white/5 text-[9px] font-bold uppercase tracking-widest text-white/30 bg-black/20">
        Mini-Map Navigator
      </div>
      <div className="relative" style={{ height: mapHeight }}>
        <img 
          src={image.src} 
          className="w-full h-full object-contain opacity-30 grayscale" 
          alt="Minimap"
        />
        <div 
          className="absolute border border-blue-500 bg-blue-500/10 transition-all duration-100"
          style={{
            left: Math.max(0, viewportX),
            top: Math.max(0, viewportY),
            width: Math.min(mapWidth, viewportW),
            height: Math.min(mapHeight, viewportH)
          }}
        />
      </div>
    </div>
  );
};
