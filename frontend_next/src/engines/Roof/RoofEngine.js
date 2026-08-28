import { ApiService } from "@/models/api.service";

/**
 * RoofEngine (V3 Client Engine)
 * Handles input/output data transformations and connects to the Roof V3 backend endpoints:
 * - computeRoof2D: Straight Skeleton 2D Topology Calculation (CGAL / Mono-pitch Shed)
 * - buildRoof3D: Exact Algebraic Plane Equations & 3D Mesh Generation (Ear-Clipping Triangulated)
 * - trimRoofEave: CAD Eave Overhang Clipping along Wall Boundaries
 * - optimizeRoofGraph: Planar Solver for interactive graph modifications
 */
export function getMmPerPx(scaleFactor, realScale) {
  if (typeof realScale === 'number' && realScale > 0) {
    return realScale;
  }
  if (typeof scaleFactor === 'number' && scaleFactor > 0) {
    return scaleFactor > 1 ? scaleFactor : scaleFactor * 1000;
  }
  return 20.0; // fallback: 20 mm per pixel
}

export const getRealScaleMm = getMmPerPx;

const RoofEngine = {
  getMmPerPx,
  getRealScaleMm,
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
      raw_points_pixels: rawPointsPixels,
      dutch_edges: Array.isArray(roof.dutchEdges) ? roof.dutchEdges : [],
      dutch_overhangs: Array.isArray(roof.dutchOverhangs) ? roof.dutchOverhangs.map(v => typeof v === 'number' ? v : 0.0) : [],
      dutch_rake_overhangs: Array.isArray(roof.dutchRakeOverhangs) ? roof.dutchRakeOverhangs.map(v => typeof v === 'number' ? v : 0.0) : [],
      dutch_cut_points: Array.isArray(roof.dutchCutPoints) ? roof.dutchCutPoints.map(pt => {
        if (!pt || !Array.isArray(pt) || pt.length < 2) return null;
        return [pt[0] * mmPerPx, pt[1] * mmPerPx];
      }) : []
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
    holeAngles = [],
    dutch_edges = [],
    dutch_overhangs = [],
    dutch_rake_overhangs = [],
    dutch_cut_points = [],
    dutchEdges = [],
    dutchOverhangs = [],
    dutchRakeOverhangs = [],
    dutchCutPoints = []
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
      base_z: baseZ,
      dutch_edges: dutch_edges.length > 0 ? dutch_edges : dutchEdges,
      dutch_overhangs: (dutch_overhangs.length > 0 ? dutch_overhangs : dutchOverhangs).map(v => typeof v === 'number' ? v : 0.0),
      dutch_rake_overhangs: (dutch_rake_overhangs.length > 0 ? dutch_rake_overhangs : dutchRakeOverhangs).map(v => typeof v === 'number' ? v : 0.0),
      dutch_cut_points: (dutch_cut_points.length > 0 ? dutch_cut_points : dutchCutPoints).map(pt => (!pt || !Array.isArray(pt) || pt.length < 2) ? null : pt)
    };

    return await ApiService.buildRoof3D(buildPayload);
  },

  /**
   * Complete Pipeline: Computes 2D Straight Skeleton and 3D Mesh in one workflow.
   * Returns a ready-to-cache v3Data object.
   */
  computeRoofPipeline: async function({ roof, scaleFactor, realScale }) {
    const payload = this.createRoofPayload({ roof, scaleFactor, realScale });
    if (!payload) throw new Error("Invalid roof geometry (need at least 3 points)");

    // Step 1: Compute 2D Straight Skeleton topology
    const topoRes = await this.calculateTopology2D(payload);
    if (!topoRes || !topoRes.result) {
      throw new Error(topoRes?.detail || "Failed to calculate 2D roof topology");
    }
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
      holeAngles: payload.hole_angles || [],
      dutch_edges: payload.dutch_edges,
      dutch_overhangs: payload.dutch_overhangs,
      dutch_rake_overhangs: payload.dutch_rake_overhangs,
      dutch_cut_points: payload.dutch_cut_points
    });

    if (!planesRes || planesRes.detail || (!planesRes.graph && !rawTopology)) {
      throw new Error(planesRes?.detail || "Failed to generate 3D roof planes");
    }

    // Convert final 3D graph (with gable verge extensions) into 2D topology
    const finalGraph = planesRes.graph || rawTopology;
    if (!finalGraph) {
      throw new Error("No graph structure returned from 3D roof builder");
    }

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
  },

  /**
   * 4. Export exact roof input JSON payload matching roof_1_input_v3.json format
   * @param {Object} params
   * @param {Object} params.roof - Roof object
   * @param {number} params.scaleFactor - Scale factor
   * @param {number} params.realScale - Real calibrated mm per pixel
   * @param {boolean} [params.download=true] - Trigger file download
   * @param {string} [params.filename] - Custom output filename
   */
  exportRoofInput: function({ roof, scaleFactor, realScale, download = true, filename }) {
    if (!roof) {
      console.warn("RoofEngine.exportRoofInput: No roof provided.");
      return null;
    }

    const payload = RoofEngine.createRoofPayload({ roof, scaleFactor, realScale });
    if (!payload) {
      console.warn("RoofEngine.exportRoofInput: Could not create payload from roof.", roof);
      return null;
    }

    console.log("📦 [RoofEngine] Exported Roof Input JSON:", payload);

    if (download && typeof window !== 'undefined') {
      try {
        const jsonStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const safeName = (roof.name || `roof_${roof.id}`).replace(/[^a-z0-9_-]/gi, '_');
        a.href = url;
        a.download = filename || `${safeName}_input_v3.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Failed to trigger roof input download:", err);
      }
    }

    return payload;
  },

  /**
   * 5. Export full 2D and 3D Input & Output data for inspection, debugging, and backup
   */
  exportRoofIO: function({ roof, scaleFactor, realScale, download = true }) {
    if (!roof) {
      console.warn("RoofEngine.exportRoofIO: No roof provided.");
      return null;
    }

    const mmPerPx = getRealScaleMm(scaleFactor, realScale);
    const points = roof.polygon || [];
    const n = points.length;

    const pointsMm = points.map(pt => {
      const px = pt.x !== undefined ? pt.x : (pt.pdfX !== undefined ? pt.pdfX : pt[0]);
      const py = pt.y !== undefined ? pt.y : (pt.pdfY !== undefined ? pt.pdfY : pt[1]);
      return [px * mmPerPx, py * mmPerPx];
    });

    const pointsPixels = points.map(pt => {
      const px = pt.x !== undefined ? pt.x : (pt.pdfX !== undefined ? pt.pdfX : pt[0]);
      const py = pt.y !== undefined ? pt.y : (pt.pdfY !== undefined ? pt.pdfY : pt[1]);
      return [px, py];
    });

    const finalAngles = Array.isArray(roof.angles) && roof.angles.length === n
      ? roof.angles
      : Array(n).fill(roof.pitchAngle || 22.5);

    const finalOverhangs = Array.isArray(roof.overhangs) && roof.overhangs.length === n
      ? roof.overhangs
      : Array(n).fill(0.0);

    const exportBundle = {
      meta: {
        exported_at: new Date().toISOString(),
        version: "3.0",
        engine: "EzeFloor Roof V3 Engine",
        roof_id: roof.id,
        roof_name: roof.name || `Roof_${roof.id}`
      },
      input: {
        parameters: {
          roof_type: roof.roofType || 'hip_gable',
          pitch_angle_deg: roof.pitchAngle || 22.5,
          angles_deg: finalAngles,
          overhangs_mm: finalOverhangs,
          wall_height_mm: roof.wallHeight || 2700,
          scale_mm_per_px: mmPerPx,
          eave_edge_index: roof.eaveEdgeIndex || 0,
          dutch_config: {
            dutch_edges: Array.isArray(roof.dutchEdges) ? roof.dutchEdges : [],
            dutch_overhangs_mm: Array.isArray(roof.dutchOverhangs) ? roof.dutchOverhangs : [],
            dutch_rake_overhangs_mm: Array.isArray(roof.dutchRakeOverhangs) ? roof.dutchRakeOverhangs : [],
            dutch_cut_points_px: Array.isArray(roof.dutchCutPoints) ? roof.dutchCutPoints : [],
            dutch_cut_points_mm: Array.isArray(roof.dutchCutPoints) ? roof.dutchCutPoints.map(pt => pt ? [pt[0] * mmPerPx, pt[1] * mmPerPx] : null) : []
          }
        },
        geometry_2d: {
          points_pixels: pointsPixels,
          points_mm: pointsMm,
          point_count: n,
          holes_pixels: roof.holes || [],
          holes_mm: (roof.holes || []).map(h => h.map(pt => {
            const px = pt.x !== undefined ? pt.x : (pt.pdfX !== undefined ? pt.pdfX : pt[0]);
            const py = pt.y !== undefined ? pt.y : (pt.pdfY !== undefined ? pt.pdfY : pt[1]);
            return [px * mmPerPx, py * mmPerPx];
          }))
        }
      },
      output_2d: {
        topology: roof.v3Data?.topology2D || null,
        diagnostics_graph: roof.v3Data?.graph || null
      },
      output_3d: {
        mesh_3d: roof.v3Data?.mesh3D || null,
        roof_mesh: roof.v3Data?.roofMesh || roof.v3Data?.roof_mesh || null,
        wall_mesh: roof.v3Data?.wallMesh || roof.v3Data?.wall_mesh || null,
        gable_mesh: roof.v3Data?.gableMesh || roof.v3Data?.gable_mesh || null,
        planes: roof.v3Data?.planes || null,
        max_planarity_error_mm: roof.v3Data?.maxPlanarityErrorMm ?? 0.0
      }
    };

    console.log("📦 [RoofEngine] Exported Roof 2D/3D I/O:", exportBundle);

    if (download && typeof window !== 'undefined') {
      try {
        const jsonStr = JSON.stringify(exportBundle, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const safeName = (roof.name || `roof_${roof.id}`).replace(/[^a-z0-9_-]/gi, '_');
        a.href = url;
        a.download = `${safeName}_2d_3d_io.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Failed to trigger download:", err);
      }
    }

    return exportBundle;
  },

  /**
   * Calculates the intersection point of two 2D infinite lines passing through (p1, p2) and (p3, p4).
   * Returns { x, y } in pixels, or null if parallel / nearly collinear.
   */
  intersectInfiniteLines: function(p1, p2, p3, p4) {
    const x1 = p1.x ?? p1[0], y1 = p1.y ?? p1[1];
    const x2 = p2.x ?? p2[0], y2 = p2.y ?? p2[1];
    const x3 = p3.x ?? p3[0], y3 = p3.y ?? p3[1];
    const x4 = p4.x ?? p4[0], y4 = p4.y ?? p4[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-5) return null; // Parallel or nearly collinear

    const term1 = x1 * y2 - y1 * x2;
    const term2 = x3 * y4 - y3 * x4;

    const ix = (term1 * (x3 - x4) - (x1 - x2) * term2) / denom;
    const iy = (term1 * (y3 - y4) - (y1 - y2) * term2) / denom;

    return { x: ix, y: iy };
  },

  /**
   * Partitions walls into disjoint connected components (e.g. 2 detached buildings on canvas).
   */
  partitionWallComponents: function(walls, realScale) {
    if (!Array.isArray(walls) || walls.length === 0) return [];

    const mmPerPx = typeof realScale === 'number' && realScale > 0 ? realScale : 20.0;
    const snapTolPx = Math.max(3.0, 30.0 / mmPerPx);

    const endpoints = [];
    walls.forEach(w => {
      let p1 = null, p2 = null;
      if (Array.isArray(w.centerline_px) && w.centerline_px.length >= 2) {
        p1 = { x: w.centerline_px[0][0], y: w.centerline_px[0][1] };
        p2 = { x: w.centerline_px[1][0], y: w.centerline_px[1][1] };
      } else if (Array.isArray(w.centerline) && w.centerline.length >= 2) {
        const c1 = w.centerline[0], c2 = w.centerline[1];
        p1 = { x: Array.isArray(c1) ? c1[0] : (c1.x ?? 0), y: Array.isArray(c1) ? c1[1] : (c1.y ?? 0) };
        p2 = { x: Array.isArray(c2) ? c2[0] : (c2.x ?? 0), y: Array.isArray(c2) ? c2[1] : (c2.y ?? 0) };
      } else if (Array.isArray(w.centerline_mm) && w.centerline_mm.length >= 2) {
        p1 = { x: w.centerline_mm[0][0] / mmPerPx, y: w.centerline_mm[0][1] / mmPerPx };
        p2 = { x: w.centerline_mm[1][0] / mmPerPx, y: w.centerline_mm[1][1] / mmPerPx };
      }
      endpoints.push({ p1, p2, wall: w });
    });

    const n = endpoints.length;
    const adj = Array.from({ length: n }, () => []);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = endpoints[i], b = endpoints[j];
        if (!a.p1 || !a.p2 || !b.p1 || !b.p2) continue;
        const d1 = Math.hypot(a.p1.x - b.p1.x, a.p1.y - b.p1.y);
        const d2 = Math.hypot(a.p1.x - b.p2.x, a.p1.y - b.p2.y);
        const d3 = Math.hypot(a.p2.x - b.p1.x, a.p2.y - b.p1.y);
        const d4 = Math.hypot(a.p2.x - b.p2.x, a.p2.y - b.p2.y);
        if (Math.min(d1, d2, d3, d4) <= snapTolPx) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
    }

    const visited = new Set();
    const clusters = [];

    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue;
      const cluster = [];
      const queue = [i];
      visited.add(i);

      while (queue.length > 0) {
        const curr = queue.shift();
        if (endpoints[curr].wall) {
          cluster.push(endpoints[curr].wall);
        }
        for (const neighbor of adj[curr]) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      if (cluster.length >= 3) {
        clusters.push(cluster);
      }
    }

    return clusters.length > 0 ? clusters : [walls];
  },

  /**
   * Chains wall segments together and bridges any gaps (e.g. deselected recessed balcony/porch walls)
   * using infinite ray line intersections (for L-shapes) or collinear bridging (for U-shapes).
   */
  orderAndBridgeSegments: function(segments, snapTolPx) {
    if (!segments || segments.length === 0) return null;
    if (segments.length === 1) return null;

    const remaining = segments.map(s => ({ ...s }));
    const ordered = [remaining.shift()];

    while (remaining.length > 0) {
      const lastSeg = ordered[ordered.length - 1];
      const lastPt = lastSeg.p2;

      let bestIdx = -1;
      let bestDist = Infinity;
      let mustFlip = false;

      // 1. Try to find an directly snapped segment
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const dForward = Math.hypot(seg.p1.x - lastPt.x, seg.p1.y - lastPt.y);
        const dBackward = Math.hypot(seg.p2.x - lastPt.x, seg.p2.y - lastPt.y);

        if (dForward <= snapTolPx && dForward < bestDist) {
          bestDist = dForward;
          bestIdx = i;
          mustFlip = false;
        } else if (dBackward <= snapTolPx && dBackward < bestDist) {
          bestDist = dBackward;
          bestIdx = i;
          mustFlip = true;
        }
      }

      // 2. If not directly snapped, find the nearest candidate to bridge
      if (bestIdx === -1) {
        for (let i = 0; i < remaining.length; i++) {
          const seg = remaining[i];
          const dForward = Math.hypot(seg.p1.x - lastPt.x, seg.p1.y - lastPt.y);
          const dBackward = Math.hypot(seg.p2.x - lastPt.x, seg.p2.y - lastPt.y);
          const minD = Math.min(dForward, dBackward);
          if (minD < bestDist) {
            bestDist = minD;
            bestIdx = i;
            mustFlip = (dBackward < dForward);
          }
        }
      }

      if (bestIdx === -1) break;

      const nextSeg = remaining.splice(bestIdx, 1)[0];
      if (mustFlip) {
        const tmp = nextSeg.p1;
        nextSeg.p1 = nextSeg.p2;
        nextSeg.p2 = tmp;
      }
      ordered.push(nextSeg);
    }

    const finalVertices = [];
    const finalThicknesses = [];
    let avgHeight = 2700;
    const count = ordered.length;

    for (let i = 0; i < count; i++) {
      const prev = ordered[(i - 1 + count) % count];
      const curr = ordered[i];
      avgHeight = curr.heightMm || avgHeight;

      // Check gap between prev.p2 and curr.p1
      const gap = Math.hypot(curr.p1.x - prev.p2.x, curr.p1.y - prev.p2.y);
      if (gap > snapTolPx) {
        // Gap exists: calculate ray intersection between prev line and curr line
        const corner = this.intersectInfiniteLines(prev.p1, prev.p2, curr.p1, curr.p2);
        if (corner &&
            Math.hypot(corner.x - prev.p2.x, corner.y - prev.p2.y) < 50000 &&
            Math.hypot(corner.x - curr.p1.x, corner.y - curr.p1.y) < 50000) {
          // L-shaped or angled corner intersection: replaces the joint vertex cleanly
          finalVertices.push(corner);
          finalThicknesses.push(curr.thicknessMm);
        } else {
          // Collinear / Parallel (U-shaped recess bridge)
          finalVertices.push(prev.p2);
          finalThicknesses.push(prev.thicknessMm);
          finalVertices.push(curr.p1);
          finalThicknesses.push(curr.thicknessMm);
        }
      } else {
        // Normal continuous joint: vertex is curr.p1
        finalVertices.push(curr.p1);
        finalThicknesses.push(curr.thicknessMm);
      }
    }

    return {
      vertices: finalVertices,
      thicknesses: finalThicknesses,
      avgHeight
    };
  },

  /**
   * Traces the exterior wall boundary cycle from active walls in CCW order.
   * Supports selectedWallIds and auto-gap bridging for omitted balcony/porch walls.
   */
  traceExteriorWallLoop: function(walls, realScale, selectedWallIds = null) {
    if (!Array.isArray(walls) || walls.length < 3) return null;

    const mmPerPx = typeof realScale === 'number' && realScale > 0 ? realScale : 20.0;
    const snapTolPx = Math.max(3.0, 30.0 / mmPerPx); // ~30mm snap tolerance

    let targetWalls = [...walls];
    if (Array.isArray(selectedWallIds) && selectedWallIds.length >= 2) {
      const filtered = walls.filter(w => selectedWallIds.includes(w.id));
      if (filtered.length >= 2) {
        targetWalls = filtered;
      }
    } else {
      // 1. Filter exterior walls if not manually selected (excluding walls marked as exclude_from_roof)
      let extWalls = walls.filter(w => {
        if (w.exclude_from_roof || w.excludeFromRoof) return false;
        const cls = (w.class_name || w.type || w.wall_type || "").toLowerCase();
        return cls.includes("exterior") || cls.includes("ext") || cls === "ext_wall" || w.is_exterior;
      });

      if (extWalls.length < 3) {
        extWalls = walls.filter(w => {
          if (w.exclude_from_roof || w.excludeFromRoof) return false;
          const cls = (w.class_name || w.type || w.wall_type || "").toLowerCase();
          return !cls.includes("interior") && !cls.includes("partition") && !cls.includes("part");
        });
      }
      if (extWalls.length >= 2) {
        targetWalls = extWalls;
      }
    }

    // Ensure all walls marked as exclude_from_roof are omitted
    targetWalls = targetWalls.filter(w => !w.exclude_from_roof && !w.excludeFromRoof);

    // 2. Collect wall segments in pixel coordinates
    const segments = [];
    targetWalls.forEach((w, wIdx) => {
      let p1 = null;
      let p2 = null;

      if (Array.isArray(w.centerline_px) && w.centerline_px.length >= 2) {
        p1 = { x: w.centerline_px[0][0], y: w.centerline_px[0][1] };
        p2 = { x: w.centerline_px[1][0], y: w.centerline_px[1][1] };
      } else if (Array.isArray(w.centerline) && w.centerline.length >= 2) {
        const c1 = w.centerline[0];
        const c2 = w.centerline[1];
        p1 = { x: Array.isArray(c1) ? c1[0] : (c1.x ?? 0), y: Array.isArray(c1) ? c1[1] : (c1.y ?? 0) };
        p2 = { x: Array.isArray(c2) ? c2[0] : (c2.x ?? 0), y: Array.isArray(c2) ? c2[1] : (c2.y ?? 0) };
      } else if (Array.isArray(w.centerline_mm) && w.centerline_mm.length >= 2) {
        p1 = { x: w.centerline_mm[0][0] / mmPerPx, y: w.centerline_mm[0][1] / mmPerPx };
        p2 = { x: w.centerline_mm[1][0] / mmPerPx, y: w.centerline_mm[1][1] / mmPerPx };
      }

      if (p1 && p2 && Math.hypot(p2.x - p1.x, p2.y - p1.y) > 1.0) {
        let thickMm = 90.0;
        if (typeof w.thickness_mm === 'number' && w.thickness_mm > 0) {
          thickMm = w.thickness_mm;
        } else if (typeof w.thickness === 'number' && w.thickness > 0) {
          thickMm = w.thickness >= 30 ? w.thickness : w.thickness * mmPerPx;
        } else if (typeof w.thickness_px === 'number' && w.thickness_px > 0) {
          thickMm = w.thickness_px * mmPerPx;
        }

        let heightMm = 2700.0;
        if (typeof w.height_mm === 'number' && w.height_mm > 0) {
          heightMm = w.height_mm;
        } else if (typeof w.height_m === 'number' && w.height_m > 0) {
          heightMm = w.height_m * 1000;
        } else if (typeof w.height === 'number' && w.height > 0) {
          heightMm = w.height >= 500 ? w.height : w.height * 1000;
        }

        segments.push({
          id: w.id || `wall_${wIdx}`,
          p1,
          p2,
          thicknessMm: thickMm,
          heightMm: heightMm,
          wall: w
        });
      }
    });

    if (segments.length < 2) return null;

    // 3. Chain segments and bridge any gaps (L-shape / U-shape / T-junctions)
    const bridged = this.orderAndBridgeSegments(segments, snapTolPx);
    if (!bridged || !bridged.vertices || bridged.vertices.length < 3) return null;

    const loopVerticesPixels = bridged.vertices;
    const loopThicknessesMm = bridged.thicknesses;
    const avgWallHeightMm = bridged.avgHeight;

    // 4. Ensure CCW in Cartesian space (CW in screen space where Y points down)
    let signedArea = 0;
    const n = loopVerticesPixels.length;
    for (let i = 0; i < n; i++) {
      const p1 = loopVerticesPixels[i];
      const p2 = loopVerticesPixels[(i + 1) % n];
      signedArea += (p1.x * p2.y - p2.x * p1.y);
    }

    if (signedArea < 0) {
      loopVerticesPixels.reverse();
      loopThicknessesMm.reverse();
      loopThicknessesMm.push(loopThicknessesMm.shift());
    }

    return {
      verticesPixels: loopVerticesPixels,
      verticesMm: loopVerticesPixels.map(p => [p.x * mmPerPx, p.y * mmPerPx]),
      edgeThicknessesMm: loopThicknessesMm,
      wallHeightMm: avgWallHeightMm || 2700
    };
  },

  /**
   * Automatically generates a clean, production-ready Roof object from wall centerlines.
   * Stage 1: Computes outer wall offset (w_i / 2) via CGAL straight skeleton.
   * Stage 2: Extracts new eave contour as roof.polygon with OVH = 0.0mm.
   * Stage 3: Runs full 3D plane & mesh builder on the new roof.
   */
  generateAutoRoofFromWalls: async function({
    walls,
    selectedWallIds = null,
    realScale,
    scaleFactor,
    defaultPitch = 22.5,
    wallHeight = 2700,
    existingRoofsCount = 0,
    roofId = null,
    roofName = null
  }) {
    // 1. Partition all walls on canvas into connected building clusters
    const allClusters = this.partitionWallComponents(walls, realScale);

    // 2. Determine target clusters:
    // If selectedWallIds is provided, find the building cluster(s) that contain ANY of the selected walls
    let targetClusters = allClusters;
    if (Array.isArray(selectedWallIds) && selectedWallIds.length > 0) {
      const selectedSet = new Set(selectedWallIds);
      const matchedClusters = allClusters.filter(cluster =>
        cluster.some(w => selectedSet.has(w.id))
      );
      if (matchedClusters.length > 0) {
        targetClusters = matchedClusters;
      }
    }

    // 3. Generate clean roofs for each target cluster
    if (targetClusters.length > 1) {
      const results = [];
      for (let cIdx = 0; cIdx < targetClusters.length; cIdx++) {
        try {
          const roof = await this._generateSingleAutoRoof({
            walls: targetClusters[cIdx],
            selectedWallIds: null, // Pass entire cluster -> traceExteriorWallLoop honors exclude_from_roof & bridges gaps
            realScale,
            scaleFactor,
            defaultPitch,
            wallHeight,
            roofIndex: existingRoofsCount + cIdx,
            roofId: cIdx === 0 ? roofId : null,
            roofName: cIdx === 0 ? roofName : null
          });
          if (roof) results.push(roof);
        } catch (e) {
          console.warn("[RoofEngine] Skipped cluster", cIdx, e);
        }
      }
      return results.length > 0 ? (results.length === 1 ? results[0] : results) : null;
    }

    // Single target cluster
    const clusterWalls = (targetClusters && targetClusters[0]) || walls;
    return this._generateSingleAutoRoof({
      walls: clusterWalls,
      selectedWallIds: null, // Pass entire cluster -> traceExteriorWallLoop honors exclude_from_roof & bridges gaps
      realScale,
      scaleFactor,
      defaultPitch,
      wallHeight,
      roofIndex: existingRoofsCount,
      roofId,
      roofName
    });
  },

  /**
   * Helper: computes single roof from a given group of walls
   */
  _generateSingleAutoRoof: async function({
    walls,
    selectedWallIds = null,
    realScale,
    scaleFactor,
    defaultPitch = 22.5,
    wallHeight = 2700,
    roofIndex = 0,
    roofId = null,
    roofName = null
  }) {
    const loopData = this.traceExteriorWallLoop(walls, realScale, selectedWallIds);
    if (!loopData || !loopData.verticesPixels || loopData.verticesPixels.length < 3) {
      throw new Error("Could not trace a closed exterior wall loop. Please ensure walls are connected.");
    }

    const mmPerPx = getRealScaleMm(scaleFactor, realScale);
    const n = loopData.verticesMm.length;

    // Stage 1: Compute outer wall offset (W_i / 2)
    const wallHalfOffsets = loopData.edgeThicknessesMm.map(t => Math.max(10.0, (t || 90.0) / 2.0));
    const offsetPayload = {
      points: loopData.verticesMm,
      angles: Array(n).fill(defaultPitch),
      overhangs: wallHalfOffsets,
      mode: 'topology',
      roof_type: 'hip_gable',
      eave_edge_index: 0,
      wall_height: loopData.wallHeightMm || wallHeight,
      scale_factor: mmPerPx,
      raw_points_pixels: loopData.verticesPixels.map(p => [p.x, p.y])
    };

    const topoRes = await this.calculateTopology2D(offsetPayload);
    if (!topoRes || !topoRes.result) {
      throw new Error(topoRes?.detail || "Failed to compute outer wall polygon from CGAL.");
    }

    const rawTopology = topoRes.result;
    const nodes = rawTopology.nodes || [];
    const edges = rawTopology.edges || [];

    // Stage 2: Extract the ordered offset contour vertices from CGAL topology
    const contourEdges = edges.filter(e => e.is_contour || !e.is_bisector);
    let outerPolygonPixels = [];

    if (contourEdges.length >= 3) {
      const contourAdj = {};
      contourEdges.forEach(e => {
        if (!contourAdj[e.source]) contourAdj[e.source] = [];
        if (!contourAdj[e.target]) contourAdj[e.target] = [];
        contourAdj[e.source].push(e.target);
        contourAdj[e.target].push(e.source);
      });

      const startNodeId = contourEdges[0].source;
      const visited = new Set();
      let curr = startNodeId;
      let prev = null;
      let steps = nodes.length + 5;

      while (steps-- > 0) {
        visited.add(curr);
        const nodeObj = nodes.find(nd => nd.id === curr);
        if (nodeObj) {
          outerPolygonPixels.push({
            x: nodeObj.x / mmPerPx,
            y: nodeObj.y / mmPerPx
          });
        }

        const neighbors = (contourAdj[curr] || []).filter(nbr => nbr !== prev);
        if (neighbors.length === 0) break;
        const nextNode = neighbors.find(nbr => !visited.has(nbr)) || neighbors[0];
        if (nextNode === startNodeId && outerPolygonPixels.length >= 3) break;
        if (visited.has(nextNode)) break;

        prev = curr;
        curr = nextNode;
      }
    }

    // Fallback if contour tracing produced < 3 points: use raw points
    if (outerPolygonPixels.length < 3) {
      outerPolygonPixels = loopData.verticesPixels.map(p => ({ x: p.x, y: p.y }));
    }

    const m = outerPolygonPixels.length;
    const resolvedName = roofName || `Roof ${String.fromCharCode(65 + (roofIndex % 26))}`;
    const resolvedId = roofId || `roof_${Date.now()}_${roofIndex}`;

    // Stage 3: Create pristine Roof object (baseline OVH = 0mm)
    const newRoof = {
      id: resolvedId,
      name: resolvedName,
      polygon: outerPolygonPixels,
      angles: Array(m).fill(defaultPitch),
      overhangs: Array(m).fill(0.0), // Baseline OVH = 0mm
      roofType: 'hip_gable',
      eaveEdgeIndex: 0,
      wallHeight: loopData.wallHeightMm || wallHeight,
      holes: [],
      holeAngles: [],
      v3Data: null,
      isDirty: false
    };

    // Stage 4: Run full 3D pipeline on the new roof
    const v3Data = await this.computeRoofPipeline({
      roof: newRoof,
      scaleFactor,
      realScale
    });
    newRoof.v3Data = v3Data;

    return newRoof;
  }
};

if (typeof window !== 'undefined') {
  window.RoofEngine = RoofEngine;
}

export default RoofEngine;
