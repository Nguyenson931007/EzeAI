import { getRoofPlane, getHeightOnPlane, intersectTwoPlanes, intersectThreePlanes, buildRoofAdjacency } from "./PlaneSolver";

const RoofEngine = {
  /**
   * Solves the 3D topology and heights for a set of roofs based on their pitch and edges.
   * @param {Object[]} roofs - The list of roof objects.
   * @returns {Object[]} The list of roof objects with their solved 3D polygons attached.
   */
  solve: function(roofs) {
    if (!roofs || roofs.length === 0) return [];
    
    const graph = buildRoofAdjacency(roofs);
    const roofPlanes = {};
    for (const r of roofs) {
      roofPlanes[r.id] = getRoofPlane(r.polygon, r.pitchAngle, r.eaveEdgeIndex, r.baseHeight || 0);
    }
    
    const solvedNodes = {};
    for (const v of graph.vertices) {
      const sharedCount = v.sharedBy.length;
      let solvedPt = null;
      
      if (sharedCount >= 3) {
        const pA = roofPlanes[v.sharedBy[0].roofId];
        const pB = roofPlanes[v.sharedBy[1].roofId];
        const pC = roofPlanes[v.sharedBy[2].roofId];
        solvedPt = intersectThreePlanes(pA, pB, pC) || intersectTwoPlanes(pA, pB, v);
      } else if (sharedCount === 2) {
        const pA = roofPlanes[v.sharedBy[0].roofId];
        const pB = roofPlanes[v.sharedBy[1].roofId];
        solvedPt = intersectTwoPlanes(pA, pB, v);
      } else if (sharedCount === 1) {
        const pA = roofPlanes[v.sharedBy[0].roofId];
        solvedPt = { x: v.x, y: v.y, z: getHeightOnPlane(pA, v.x, v.y) };
      }
      
      solvedNodes[v.id] = solvedPt;
    }
    
    return roofs.map(r => {
      const solvedPolygon3D = [];
      for (let i = 0; i < r.polygon.length; i++) {
        const node = graph.vertices.find(v => v.sharedBy.some(s => s.roofId === r.id && s.vIdx === i));
        if (node && solvedNodes[node.id]) {
          solvedPolygon3D.push(solvedNodes[node.id]);
        } else {
          const plane = roofPlanes[r.id];
          const pt = r.polygon[i];
          const px = pt.x !== undefined ? pt.x : pt[0];
          const py = pt.y !== undefined ? pt.y : pt[1];
          solvedPolygon3D.push({ x: px, y: py, z: getHeightOnPlane(plane, px, py) });
        }
      }
      return { ...r, solvedPolygon3D };
    });
  }
};

export default RoofEngine;
