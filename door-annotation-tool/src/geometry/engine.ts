export interface Point {
  x: number;
  y: number;
}

export interface DoorGeometry {
  width: number;
  angle: number;
  hingeSide: 'left' | 'right';
  swingDirection: 'inward' | 'outward';
  arcStartAngle: number;
  arcEndAngle: number;
  polygon: Point[];
  leafLine: { start: Point; end: Point };
}

export const getDistance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const getAngle = (p1: Point, p2: Point): number => {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
};

export const crossProduct = (p1: Point, p2: Point, p3: Point): number => {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
};

/**
 * Calculates door geometry based on 3 points:
 * p1: Hinge point
 * p2: Leaf end point
 * p3: Direction point (defines swing side and direction)
 */
export const calculateDoorGeometry = (
  p1: Point,
  p2: Point,
  p3: Point,
  thickness: number = 2
): DoorGeometry => {
  const width = getDistance(p1, p2);
  const baseAngle = getAngle(p1, p2); // Angle of the leaf in closed position (if p2 is on the wall)
  
  const cp = crossProduct(p1, p2, p3);
  
  // We assume p1-p2 is the "closed" position or the wall line
  // The door leaf actually swings 90 degrees from the wall.
  // However, the tool allows setting p2 as the "leaf end" in open position.
  // Standard CAD door: 
  // - Line from p1 to p2 (leaf)
  // - Arc from p2 to "wall point" (p2 rotated -90 or +90)
  
  // Determine hinge side and swing based on p3
  // This is a bit subjective, but let's define:
  // If we look from p1 towards p2, and p3 is to the left, it's a "left" swing arc.
  const hingeSide = cp > 0 ? 'right' : 'left';
  
  // In a real floorplan, "inward/outward" depends on the wall. 
  // For training data, we just need a consistent coordinate system.
  const swingDirection = cp > 0 ? 'outward' : 'inward';

  // For a 90 degree arc:
  const leafAngle = baseAngle;
  const startAngle = hingeSide === 'right' ? leafAngle : leafAngle - 90;
  const endAngle = hingeSide === 'right' ? leafAngle + 90 : leafAngle;

  // Generate polygon for YOLO (4 points for the leaf rectangle)
  const angleRad = (leafAngle * Math.PI) / 180;
  const perpAngleRad = angleRad + Math.PI / 2;
  
  const p1_offset = {
    x: p1.x + Math.cos(perpAngleRad) * (thickness / 2),
    y: p1.y + Math.sin(perpAngleRad) * (thickness / 2),
  };
  const p2_offset = {
    x: p2.x + Math.cos(perpAngleRad) * (thickness / 2),
    y: p2.y + Math.sin(perpAngleRad) * (thickness / 2),
  };
  const p2_offset2 = {
    x: p2.x - Math.cos(perpAngleRad) * (thickness / 2),
    y: p2.y - Math.sin(perpAngleRad) * (thickness / 2),
  };
  const p1_offset2 = {
    x: p1.x - Math.cos(perpAngleRad) * (thickness / 2),
    y: p1.y - Math.sin(perpAngleRad) * (thickness / 2),
  };

  const polygon = [p1_offset, p2_offset, p2_offset2, p1_offset2];

  return {
    width,
    angle: leafAngle,
    hingeSide,
    swingDirection,
    arcStartAngle: startAngle,
    arcEndAngle: endAngle,
    polygon,
    leafLine: { start: p1, end: p2 },
  };
};
