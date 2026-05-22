import type { Annotation } from '../store/useStore';

export const generateSyntheticVariations = (
  annotations: Annotation[],
  count: number = 10
): Annotation[][] => {
  const variations: Annotation[][] = [];

  for (let i = 0; i < count; i++) {
    const jittered = annotations.map(ann => {
      if (ann.type !== 'door' || !(ann.polygon || ann.geometry)) return ann;

      // Random jitter for points
      const jitter = () => (Math.random() - 0.5) * 5;
      const newPoints = ann.points.map(p => ({
        x: p.x + jitter(),
        y: p.y + jitter()
      }));

      // Re-calculate geometry with small variations
      // (Simplified: in a real generator we might change door width/angle randomly)
      
      return {
        ...ann,
        id: `${ann.id}-v${i}`,
        points: newPoints,
        // In a real implementation, we would re-run calculateDoorGeometry here
      };
    });
    variations.push(jittered);
  }

  return variations;
};

export const applyImageNoise = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 20;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i+1] = Math.min(255, Math.max(0, data[i+1] + noise));
    data[i+2] = Math.min(255, Math.max(0, data[i+2] + noise));
  }

  ctx.putImageData(imageData, 0, 0);
};
