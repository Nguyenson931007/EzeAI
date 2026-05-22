export interface Point {
  x: number;
  y: number;
}

export const VectorMath = {
  add: (p1: Point, p2: Point): Point => ({ x: p1.x + p2.x, y: p1.y + p2.y }),
  sub: (p1: Point, p2: Point): Point => ({ x: p1.x - p2.x, y: p1.y - p2.y }),
  mul: (p: Point, s: number): Point => ({ x: p.x * s, y: p.y * s }),
  div: (p: Point, s: number): Point => ({ x: p.x / s, y: p.y / s }),
  
  dot: (p1: Point, p2: Point): number => p1.x * p2.x + p1.y * p2.y,
  cross: (p1: Point, p2: Point): number => p1.x * p2.y - p1.y * p2.x,
  
  lengthSq: (p: Point): number => p.x * p.x + p.y * p.y,
  length: (p: Point): number => Math.sqrt(p.x * p.x + p.y * p.y),
  
  normalize: (p: Point): Point => {
    const len = VectorMath.length(p);
    return len === 0 ? { x: 0, y: 0 } : VectorMath.div(p, len);
  },
  
  distSq: (p1: Point, p2: Point): number => VectorMath.lengthSq(VectorMath.sub(p2, p1)),
  dist: (p1: Point, p2: Point): number => Math.sqrt(VectorMath.distSq(p1, p2)),
  
  angle: (p: Point): number => Math.atan2(p.y, p.x),
  angleBetween: (p1: Point, p2: Point): number => Math.atan2(VectorMath.cross(p1, p2), VectorMath.dot(p1, p2)),
  
  rotate: (p: Point, angleRad: number): Point => ({
    x: p.x * Math.cos(angleRad) - p.y * Math.sin(angleRad),
    y: p.x * Math.sin(angleRad) + p.y * Math.cos(angleRad)
  }),
  
  project: (p: Point, onto: Point): Point => {
    const d = VectorMath.dot(onto, onto);
    if (d === 0) return { x: 0, y: 0 };
    return VectorMath.mul(onto, VectorMath.dot(p, onto) / d);
  }
};
