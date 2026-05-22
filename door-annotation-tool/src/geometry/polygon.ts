import { VectorMath, type Point } from './vectors';
import { ArcMath } from './arcs';
import type { DoorSemantics } from './semantics';

export const PolygonMath = {
  generateDoorPolygon: (
    hinge: Point,
    leafEnd: Point,
    semantics: DoorSemantics
  ): Point[] => {
    const leafVec = VectorMath.sub(leafEnd, hinge);
    
    
    // 2. Arc sweep polygon
    // To make a "sweep" polygon suitable for YOLO, we want the area covered by the door opening.
    // This is often represented as a pie-slice shape in CAD or a thick arc.
    // For YOLO segmentation, we usually want the most prominent visual features.
    
    // Let's create a combined polygon of the leaf and the arc area.
    const startAngle = VectorMath.angle(leafVec);
    const sweepAngle = semantics.hingeSide === 'left' ? -Math.PI / 2 : Math.PI / 2;
    const endAngle = startAngle + sweepAngle;
    
    const arcPoints = ArcMath.getPoints({
      center: hinge,
      radius: semantics.width,
      startAngle,
      endAngle,
      clockwise: semantics.hingeSide === 'left'
    }, 16);
    
    // Return a polygon that follows: hinge -> leafEnd -> arcPoints -> hinge
    return [hinge, ...arcPoints, hinge];
  },

  generateThickArcPolygon: (
    center: Point,
    radius: number,
    startAngle: number,
    endAngle: number,
    thickness: number,
    clockwise: boolean
  ): Point[] => {
    const outerPoints = ArcMath.getPoints({ center, radius: radius + thickness/2, startAngle, endAngle, clockwise }, 16);
    const innerPoints = ArcMath.getPoints({ center, radius: radius - thickness/2, startAngle, endAngle, clockwise }, 16).reverse();
    
    return [...outerPoints, ...innerPoints];
  }
};
