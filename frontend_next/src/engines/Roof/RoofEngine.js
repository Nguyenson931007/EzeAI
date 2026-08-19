import { ApiService } from "@/models/api.service";

/**
 * RoofEngine (V3 Client Engine)
 * Handles input/output data transformations and connects to the Roof V3 backend endpoints:
 * - computeRoof2D: Straight Skeleton 2D Topology Calculation (CGAL / Mono-pitch Shed)
 * - buildRoof3D: Exact Algebraic Plane Equations & 3D Mesh Generation (Ear-Clipping Triangulated)
 * - trimRoofEave: CAD Eave Overhang Clipping along Wall Boundaries
 * - optimizeRoofGraph: Planar Solver for interactive graph modifications
 */
function getRealScaleMm(scaleFactor, realScale) {
  if (typeof realScale === 'number' && realScale > 0) {
    return realScale;
  }
  if (typeof scaleFactor === 'number' && scaleFactor > 0) {
    return scaleFactor > 1 ? scaleFactor : scaleFactor * 1000;
  }
  return 20.0; // fallback: 20 mm per pixel
}

const RoofEngine = {
  /**
   * Prepares payload matching roof_1_input_v3.json format
   * @param {Object} params
   * @param {Object} params.roof - Roof state object from app context
   * @param {number} params.scaleFactor - Scale factor (e.g. scaleValue)
   * @param {number} params.realScale - Calibrated mm per pixel from Scale tool
   */
  createRoofPayload: function({ roof, scaleFactor, realScale }) {
    if (!roof || !roof.polygon || roof.polygon.length < 3) return null;

    const points = roof.polygon;
    const n = points.length;
    const mmPerPx = getRealScaleMm(scaleFactor, realScale);

    // Convert PDF-space points to millimeter coordinates (pixel * mmPerPx)
    const pointsMm = points.map(pt => {
      const px = pt.x !== undefined ? pt.x : (pt.pdfX !== undefined ? pt.pdfX : pt[0]);
      const py = pt.y !== undefined ? pt.y : (pt.pdfY !== undefined ? pt.pdfY : pt[1]);
      return [px * mmPerPx, py * mmPerPx];
    });

    const rawPointsPixels = points.map(pt => {
      const px = pt.x !== undefined ? pt.x : (pt.pdfX !== undefined ? pt.pdfX : pt[0]);
      const py = pt.y !== undefined ? pt.y : (pt.pdfY !== undefined ? pt.pdfY : pt[1]);
      return [px, py];
    });

    const finalAngles = Array.isArray(roof.angles) && roof.angles.length === n
      ? roof.angles
      : Array(n).fill(22.5);

    const finalOverhangs = Array.isArray(roof.overhangs) && roof.overhangs.length === n
      ? roof.overhangs
      : Array(n).fill(0.0);

    const payload = {
      points: pointsMm,
      angles: finalAngles,
      overhangs: finalOverhangs,
      mode: 'topology',
      roof_type: roof.roofType || 'hip_gable',
      eave_edge_index: roof.eaveEdgeIndex || 0,
      wall_height: roof.wallHeight || 2700,
      scale_factor: mmPerPx,
      raw_points_pixels: rawPointsPixels
    };

    if (roof.holes && roof.holes.length > 0) {
      payload.holes = roof.holes.map(h => h.map(pt => {
        const px = pt.x !== undefined ? pt.x : (pt.pdfX !== undefined ? pt.pdfX : pt[0]);
        const py = pt.y !== undefined ? pt.y : (pt.pdfY !== undefined ? pt.pdfY : pt[1]);
        return [px * mmPerPx, py * mmPerPx];
      }));
      payload.hole_angles = Array.isArray(roof.holeAngles) && roof.holeAngles.length === roof.holes.length
        ? roof.holeAngles
        : roof.holes.map(h => Array(h.length).fill(22.5));
    }

    return payload;
  },

  /**
   * 1. Calculate 2D Topology (Straight Skeleton & Facet Graph)
   */
  calculateTopology2D: async function(payload) {
    return await ApiService.computeRoof2D(payload);
  },

  /**
   * 2. Build Exact 3D Algebraic Planes and Mesh
   */
  generate3DMesh: async function({
    topology,
    pointsMm,
    angles,
    overhangs,
    wallHeight = 2700,
    roofType = 'hip_gable',
    eaveEdgeIndex = 0,
    baseZ = 0.0,
    holeAngles = []
  }) {
    const buildPayload = {
      topology,
      points: pointsMm,
      angles,
      overhangs,
      hole_angles: holeAngles,
      wall_height: wallHeight,
      roof_type: roofType,
      eave_edge_index: eaveEdgeIndex,
      base_z: baseZ
    };

    return await ApiService.buildRoof3D(buildPayload);
  },

  /**
   * Complete Pipeline: Computes 2D Straight Skeleton and 3D Mesh in one workflow.
   * Returns a ready-to-cache v3Data object.
   */
  computeRoofPipeline: async function({ roof, scaleFactor }) {
    const payload = this.createRoofPayload({ roof, scaleFactor });
    if (!payload) throw new Error("Invalid roof geometry (need at least 3 points)");

    // Step 1: Compute 2D Straight Skeleton topology
    const topoRes = await this.calculateTopology2D(payload);
    const rawTopology = topoRes.result;

    // Step 2: Build exact 3D algebraic planes, gable extensions, and wall shell
    const planesRes = await this.generate3DMesh({
      topology: rawTopology,
      pointsMm: payload.points,
      angles: payload.angles,
      overhangs: payload.overhangs,
      wallHeight: payload.wall_height,
      roofType: payload.roof_type,
      eaveEdgeIndex: payload.eave_edge_index,
      holeAngles: payload.hole_angles || []
    });

    // Convert final 3D graph (with gable verge extensions) into 2D topology
    const finalGraph = planesRes.graph || rawTopology;
    const finalTopology2D = {
      nodes: (finalGraph.vertices || finalGraph.nodes || []).map(v => ({
        id: v.id,
        x: v.x,
        y: v.y,
        time: v.time || 0,
        is_skeleton: v.is_skeleton || false,
        is_contour: v.is_contour !== undefined ? v.is_contour : true,
        is_reflex: v.is_reflex || false
      })),
      edges: (finalGraph.edges || []).map(e => ({
        source: e.source,
        target: e.target,
        is_bisector: e.is_bisector || false,
        is_contour: e.is_contour !== undefined ? e.is_contour : true,
        edge_type: e.edge_type
      })),
      faces: (finalGraph.faces || []).map(f => ({
        id: f.id,
        vertices: f.vertices,
        contour_edge_index: f.contour_edge_index
      }))
    };

    return {
      topology2D: finalTopology2D,
      mesh3D: planesRes.mesh,
      roofMesh: planesRes.roof_mesh,
      wallMesh: planesRes.wall_mesh,
      gableMesh: planesRes.gable_mesh || planesRes.wall_mesh?.gable_mesh,
      graph: planesRes.graph,
      maxPlanarityErrorMm: planesRes.max_planarity_error_mm || 0.0,
      isDirty: false
    };
  },

  /**
   * 3. CAD Trim Eave Tool: Clip overhang along a wall edge
   */
  trimEave: async function({ roof, edgeIndex, scaleFactor, realScale }) {
    if (!roof || !roof.v3Data || !roof.v3Data.graph || !roof.polygon || edgeIndex === undefined) {
      throw new Error("Cannot trim: Roof must be computed (v3Data.graph required)");
    }

    const points = roof.polygon;
    const n = points.length;
    const mmPerPx = getRealScaleMm(scaleFactor, realScale);

    const p1 = points[edgeIndex];
    const p2 = points[(edgeIndex + 1) % n];

    const p1Mm = [
      (p1.x !== undefined ? p1.x : (p1.pdfX !== undefined ? p1.pdfX : p1[0])) * mmPerPx,
      (p1.y !== undefined ? p1.y : (p1.pdfY !== undefined ? p1.pdfY : p1[1])) * mmPerPx
    ];

    const p2Mm = [
      (p2.x !== undefined ? p2.x : (p2.pdfX !== undefined ? p2.pdfX : p2[0])) * mmPerPx,
      (p2.y !== undefined ? p2.y : (p2.pdfY !== undefined ? p2.pdfY : p2[1])) * mmPerPx
    ];

    const pointsMm = points.map(pt => {
      const px = pt.x !== undefined ? pt.x : (pt.pdfX !== undefined ? pt.pdfX : pt[0]);
      const py = pt.y !== undefined ? pt.y : (pt.pdfY !== undefined ? pt.pdfY : pt[1]);
      return [px * mmPerPx, py * mmPerPx];
    });

    const finalAngles = Array.isArray(roof.angles) && roof.angles.length === n
      ? roof.angles
      : Array(n).fill(22.5);

    const trimPayload = {
      graph: roof.v3Data.graph,
      wall_p1: p1Mm,
      wall_p2: p2Mm,
      points: pointsMm,
      angles: finalAngles,
      wall_height: roof.wallHeight || 2700,
      roof_type: roof.roofType || 'hip_gable',
      eave_edge_index: roof.eaveEdgeIndex || 0,
      base_z: 0.0
    };

    const trimRes = await ApiService.trimRoofEave(trimPayload);

    // Update overhang of trimmed edge to 0 in array
    const updatedOverhangs = Array.isArray(roof.overhangs) ? [...roof.overhangs] : Array(n).fill(0.0);
    updatedOverhangs[edgeIndex] = 0.0;

    // Convert clipped graph to topology2D so 2D Canvas renders the trimmed boundary immediately
    const newGraph = trimRes.graph || {};
    const updatedTopology2D = {
      nodes: (newGraph.vertices || newGraph.nodes || []).map(v => ({
        id: v.id,
        x: v.x,
        y: v.y,
        time: v.time || 0,
        is_skeleton: v.is_skeleton || false,
        is_contour: v.is_contour !== undefined ? v.is_contour : true,
        is_reflex: v.is_reflex || false
      })),
      edges: (newGraph.edges || []).map(e => ({
        source: e.source,
        target: e.target,
        is_bisector: e.is_bisector || false,
        is_contour: e.is_contour !== undefined ? e.is_contour : true,
        edge_type: e.edge_type
      })),
      faces: (newGraph.faces || []).map(f => ({
        id: f.id,
        vertices: f.vertices,
        contour_edge_index: f.contour_edge_index
      }))
    };

    return {
      overhangs: updatedOverhangs,
      v3Data: {
        topology2D: updatedTopology2D,
        mesh3D: trimRes.mesh,
        roofMesh: trimRes.roof_mesh,
        wallMesh: trimRes.wall_mesh,
        gableMesh: trimRes.gable_mesh || trimRes.wall_mesh?.gable_mesh,
        graph: trimRes.graph,
        maxPlanarityErrorMm: trimRes.max_planarity_error_mm || 0.0,
        isDirty: false
      }
    };
  }
};

export default RoofEngine;
