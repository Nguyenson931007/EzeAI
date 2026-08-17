import { centroid } from "../utils/geometry.js";

/**
 * Extracts standard {x, y} coordinate from a point object or array.
 */
function _getCoord(pt) {
  if (!pt) return { x: 0, y: 0 };
  const x = typeof pt.x === 'number' ? pt.x : (Array.isArray(pt) ? pt[0] : 0);
  const y = typeof pt.y === 'number' ? pt.y : (Array.isArray(pt) ? pt[1] : 0);
  return { x, y };
}

/**
 * Computes the 3D plane for a roof facet based on its 2D polygon, pitch angle, and eave edge.
 */
export function getRoofPlane(polygon, pitchAngleDeg, eaveEdgeIndex, baseHeight) {
  if (eaveEdgeIndex == null || eaveEdgeIndex >= polygon.length) {
    return { isFlat: true, baseHeight };
  }
  const p1 = polygon[eaveEdgeIndex];
  const p2 = polygon[(eaveEdgeIndex + 1) % polygon.length];

  const pt1 = _getCoord(p1);
  const pt2 = _getCoord(p2);

  const dx = pt2.x - pt1.x;
  const dy = pt2.y - pt1.y;
  const len = Math.hypot(dx, dy);

  if (len < 1e-5) return { isFlat: true, baseHeight };

  // Normal pointing inward (left of vector P1->P2)
  let nx = -dy / len;
  let ny = dx / len;

  // Ensure normal points towards centroid
  const cent = centroid(polygon);
  const dot = (cent.x - pt1.x) * nx + (cent.y - pt1.y) * ny;
  if (dot < 0) {
    nx = -nx;
    ny = -ny;
  }

  const tanPitch = Math.tan((pitchAngleDeg || 0) * Math.PI / 180);

  return {
    isFlat: false,
    baseHeight,
    P1: pt1,
    N2D: { x: nx, y: ny },
    tanPitch
  };
}

/**
 * Gets the Z height (or Y height in ThreeJS) of a plane at a specific 2D (x,y) point.
 */
export function getHeightOnPlane(plane, x, y) {
  if (plane.isFlat) return plane.baseHeight;
  const dx = x - plane.P1.x;
  const dy = y - plane.P1.y;
  const dist = dx * plane.N2D.x + dy * plane.N2D.y;
  return plane.baseHeight + dist * plane.tanPitch;
}

/**
 * Internal helper to get A, B, C coefficients of height plane equation H(x,y) = A*x + B*y + C
 */
export function _getPlaneCoeffs(plane) {
  if (plane.isFlat) return { cx: 0, cy: 0, c0: plane.baseHeight };
  const cx = plane.N2D.x * plane.tanPitch;
  const cy = plane.N2D.y * plane.tanPitch;
  const c0 = plane.baseHeight - (plane.P1.x * plane.N2D.x + plane.P1.y * plane.N2D.y) * plane.tanPitch;
  return { cx, cy, c0 };
}

/**
 * Solves the 3D position of a vertex shared by 2 planes. 
 * Projects the original 2D vertex onto the 2D intersection line of the planes.
 */
export function intersectTwoPlanes(planeA, planeB, originalPt) {
  const A = _getPlaneCoeffs(planeA);
  const B = _getPlaneCoeffs(planeB);

  const a = A.cx - B.cx;
  const b = A.cy - B.cy;
  const c = A.c0 - B.c0;

  // If planes are parallel (a=0, b=0), we can't intersect. Return original with averaged height.
  if (Math.abs(a) < 1e-5 && Math.abs(b) < 1e-5) {
    const zA = getHeightOnPlane(planeA, originalPt.x, originalPt.y);
    const zB = getHeightOnPlane(planeB, originalPt.x, originalPt.y);
    return { x: originalPt.x, y: originalPt.y, z: (zA + zB) / 2 };
  }

  // Line is: a*x + b*y + c = 0
  // Project originalPt (x0, y0) onto this line.
  const x0 = originalPt.x;
  const y0 = originalPt.y;
  const denominator = a * a + b * b;
  const x = (b * (b * x0 - a * y0) - a * c) / denominator;
  const y = (a * (a * y0 - b * x0) - b * c) / denominator;

  return { x, y, z: getHeightOnPlane(planeA, x, y) };
}

/**
 * Solves the exact 3D point where 3 planes intersect.
 */
export function intersectThreePlanes(planeA, planeB, planeC) {
  if (!planeA || !planeB || !planeC) return null;

  const A = _getPlaneCoeffs(planeA);
  const B = _getPlaneCoeffs(planeB);
  const C = _getPlaneCoeffs(planeC);

  const a1 = A.cx - B.cx;
  const b1 = A.cy - B.cy;
  const c1 = B.c0 - A.c0;

  const a2 = B.cx - C.cx;
  const b2 = B.cy - C.cy;
  const c2 = C.c0 - B.c0;

  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-5) {
    return null; // Planes do not intersect at a single point (parallel intersection lines)
  }

  const x = (c1 * b2 - c2 * b1) / det;
  const y = (a1 * c2 - a2 * c1) / det;

  return { x, y, z: getHeightOnPlane(planeA, x, y) };
}

/**
 * Builds a topology graph linking shared 2D vertices across multiple roof facets.
 * Vertices within 14px tolerance are merged into a single topological node.
 */
export function buildRoofAdjacency(roofs) {
  const graph = {
    vertices: [], // Array of { id: string, x, y, sharedBy: [{roofId, vIdx}] }
  };

  if (!roofs || roofs.length === 0) return graph;

  const TOLERANCE = 14;

  for (const roof of roofs) {
    if (!roof.polygon) continue;

    for (let i = 0; i < roof.polygon.length; i++) {
      const pt = _getCoord(roof.polygon[i]);

      let foundV = null;
      for (const v of graph.vertices) {
        if (Math.hypot(v.x - pt.x, v.y - pt.y) < TOLERANCE) {
          foundV = v;
          break;
        }
      }

      if (foundV) {
        // Average coordinates to cluster tightly
        const n = foundV.sharedBy.length;
        foundV.x = (foundV.x * n + pt.x) / (n + 1);
        foundV.y = (foundV.y * n + pt.y) / (n + 1);
        foundV.sharedBy.push({ roofId: roof.id, vIdx: i });
      } else {
        graph.vertices.push({
          id: `v_${graph.vertices.length}`,
          x: pt.x,
          y: pt.y,
          sharedBy: [{ roofId: roof.id, vIdx: i }]
        });
      }
    }
  }

  return graph;
}
