import type { Point } from './vectors';

export interface ArcParams {
  center: Point;
  radius: number;
  startAngle: number; // radians
  endAngle: number;   // radians
  clockwise?: boolean;
}

export const ArcMath = {
  getPoints: (params: ArcParams, segments: number = 32): Point[] => {
    const { center, radius, startAngle, endAngle, clockwise = false } = params;
    const points: Point[] = [];
    
    let diff = endAngle - startAngle;
    
    // Normalize angle difference based on clockwise flag
    if (clockwise && diff > 0) diff -= 2 * Math.PI;
    if (!clockwise && diff < 0) diff += 2 * Math.PI;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + diff * t;
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
      });
    }
    
    return points;
  }
};
