/**
 * DoorArcLabelEngine.js
 * =======================
 * CAD/BIM-Grade Door Geometry and Arc Label calculations.
 * Calculates center, sweep angles, text rotations with upside-down flip protection.
 */

export function calculateDoorGeometry({
  p1,
  p2,
  type = "single",
  hingeSide = "left",
  swing = "inward",
  angle = 90
}) {
  if (!p1 || !p2) return null;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  const wallAngle = Math.atan2(dy, dx);

  const isRightHinge = hingeSide === "right";
  const isInward = swing === "inward";
  const hinge = isRightHinge ? p2 : p1;
  const other = isRightHinge ? p1 : p2;

  const sideFactor = isInward ? 1 : -1;
  const hingeFactor = isRightHinge ? -1 : 1;

  const openAngleRad = (angle * Math.PI) / 180;
  const startAngle = Math.atan2(other.y - hinge.y, other.x - hinge.x);
  const sweepAngleRad = hingeFactor * sideFactor * openAngleRad;
  const endAngle = startAngle + sweepAngleRad;

  // Arc midpoint angle
  const midAngle = startAngle + sweepAngleRad / 2;

  // Arc midpoint coordinate
  const arcMidpoint = {
    x: hinge.x + len * Math.cos(midAngle),
    y: hinge.y + len * Math.sin(midAngle)
  };

  // Tangent angle for text rotation
  let tangentAngle = midAngle + Math.PI / 2;
  let rotDeg = (tangentAngle * 180) / Math.PI;

  // Normalize rotation to [-180, 180]
  rotDeg = ((rotDeg + 180) % 360);
  if (rotDeg < 0) rotDeg += 360;
  rotDeg -= 180;

  // Upside-down protection: standard technical drawings read from bottom to top and left to right.
  // If rotation is outside [-90, 90], flip 180 degrees.
  let isFlipped = false;
  if (rotDeg > 90 || rotDeg < -90) {
    rotDeg += 180;
    rotDeg = ((rotDeg + 180) % 360);
    if (rotDeg < 0) rotDeg += 360;
    rotDeg -= 180;
    isFlipped = true;
  }

  // Text label position: offset slightly outward from the arc line along the normal vector
  const offsetDistance = 12; // 12px offset
  const labelX = arcMidpoint.x + offsetDistance * Math.cos(midAngle) * sideFactor;
  const labelY = arcMidpoint.y + offsetDistance * Math.sin(midAngle) * sideFactor;

  // Endpoint of the door flap
  const arcEndX = hinge.x + len * Math.cos(endAngle);
  const arcEndY = hinge.y + len * Math.sin(endAngle);

  return {
    widthPx: len,
    hinge,
    other,
    arcCenter: hinge,
    arcMidpoint,
    arcEnd: { x: arcEndX, y: arcEndY },
    startAngle,
    endAngle,
    sweepAngleRad,
    midAngle,
    labelPos: { x: labelX, y: labelY },
    labelRotation: rotDeg,
    isFlipped,
    swingDirection: swing,
    openingAngle: angle,
    type
  };
}

/**
 * Returns properties for drawing an SVG text label with the glow filter
 */
export function getSVGLabelProps(geom) {
  if (!geom) return null;
  return {
    x: geom.labelPos.x,
    y: geom.labelPos.y,
    transform: `rotate(${geom.labelRotation}, ${geom.labelPos.x}, ${geom.labelPos.y})`,
    textAnchor: "middle",
    dominantBaseline: "middle"
  };
}
