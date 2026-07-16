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

export function getDoorBoundingBox(d) {
  if (!d || !d.points || d.points.length < 2) return null;
  const p1 = d.points[0];
  const p2 = d.points[1];
  if (!p1 || !p2) return null;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);

  if (len < 1e-3) {
    return [p1, p2, p2, p1];
  }

  const type = d.type || "single";
  const pad = 5;

  const typeLower = type.toLowerCase();
  const classLower = (d.class || d.class_name || "").toLowerCase();
  const isWindow = typeLower === "window" || classLower === "window";

  if (type === "sliding" || isWindow) {
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const halfT = isWindow ? 10 : 6; // 20px thickness for window selection, 12px for sliding door
    const p1_ext = { x: p1.x - ux * pad, y: p1.y - uy * pad };
    const p2_ext = { x: p2.x + ux * pad, y: p2.y + uy * pad };
    return [
      { x: p1_ext.x + nx * halfT, y: p1_ext.y + ny * halfT },
      { x: p2_ext.x + nx * halfT, y: p2_ext.y + ny * halfT },
      { x: p2_ext.x - nx * halfT, y: p2_ext.y - ny * halfT },
      { x: p1_ext.x - nx * halfT, y: p1_ext.y - ny * halfT }
    ];
  }

  const xs = [p1.x, p2.x];
  const ys = [p1.y, p2.y];

  const angle = d.angle || d.opening_angle || 90;
  const openAngleRad = (angle * Math.PI) / 180;

  if (type === "double") {
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const halfLen = len / 2;
    const isInward = (d.swing || d.swing_direction || "inward") === "inward";
    const sideFactor = isInward ? 1 : -1;

    const ang1Start = Math.atan2(midY - p1.y, midX - p1.x);
    const ang2Start = Math.atan2(midY - p2.y, midX - p2.x);

    for (let t of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      const a1 = ang1Start + t * sideFactor * openAngleRad;
      xs.push(p1.x + halfLen * Math.cos(a1));
      ys.push(p1.y + halfLen * Math.sin(a1));

      const a2 = ang2Start - t * sideFactor * openAngleRad;
      xs.push(p2.x + halfLen * Math.cos(a2));
      ys.push(p2.y + halfLen * Math.sin(a2));
    }
  } else {
    const isRightHinge = (d.hingeSide || d.hinge_side || "left") === "right";
    const hinge = isRightHinge ? p2 : p1;
    const other = isRightHinge ? p1 : p2;
    const isInward = (d.swing || d.swing_direction || "inward") === "inward";
    const sideFactor = isInward ? 1 : -1;
    const hingeFactor = isRightHinge ? -1 : 1;

    const startAngle = Math.atan2(other.y - hinge.y, other.x - hinge.x);
    const sweepAngle = hingeFactor * sideFactor * openAngleRad;

    for (let t of [0.0, 0.25, 0.5, 0.75, 1.0]) {
      const a = startAngle + sweepAngle * t;
      xs.push(hinge.x + len * Math.cos(a));
      ys.push(hinge.y + len * Math.sin(a));
    }
  }

  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;

  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY }
  ];
}
