import * as THREE from 'three';
import TrussEngine, { TRUSS_COLORS } from '../Truss/TrussEngine.js';

/**
 * 🎨 10 Curated Harmonious Palette Colors for Multi-Color Roof Facets
 */
export const ROOF_FACE_PALETTE = [
  '#10b981', // Vibrant Emerald Green
  '#3b82f6', // Royal Blue / Cobalt
  '#db2777', // Rose Magenta
  '#8b5cf6', // Violet Purple
  '#06b6d4', // Cyan Teal
  '#f59e0b', // Amber Gold
  '#14b8a6', // Teal Green
  '#ec4899', // Pink
  '#6366f1', // Electric Indigo
  '#ef4444'  // Crimson Red
];

/**
 * Helper to safely extract [x, y, z] from a vertex (array or object format)
 */
export function getVertexCoords(v) {
  if (!v) return null;
  if (Array.isArray(v)) {
    return [v[0] || 0, v[1] || 0, v[2] !== undefined ? v[2] : 2700];
  }
  if (typeof v === 'object') {
    return [v.x || 0, v.y || 0, v.z !== undefined ? v.z : 2700];
  }
  return null;
}

/**
 * Normalizes 3D plane normal key for grouping coplanar triangles
 */
export function getPlaneNormalKey(v0, v1, v2) {
  const p0 = new THREE.Vector3(v0[0], v0[2], -v0[1]);
  const p1 = new THREE.Vector3(v1[0], v1[2], -v1[1]);
  const p2 = new THREE.Vector3(v2[0], v2[2], -v2[1]);

  const cb = new THREE.Vector3().subVectors(p2, p1);
  const ab = new THREE.Vector3().subVectors(p0, p1);
  cb.cross(ab).normalize();

  let nx = cb.x;
  let ny = cb.y;
  let nz = cb.z;

  if (ny < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }

  if (Math.abs(nx) < 0.005) nx = 0;
  if (Math.abs(ny) < 0.005) ny = 0;
  if (Math.abs(nz) < 0.005) nz = 0;

  return `${nx.toFixed(2)},${ny.toFixed(2)},${nz.toFixed(2)}`;
}

/**
 * Groups roof mesh triangles into distinct face groups for multi-color rendering.
 * Guarantees 100% of triangles in roof_mesh.faces are assigned without any missing gaps.
 */
export function groupRoofTriangles({ graphFaces, roofMeshVerts, roofMeshTris, faceGroups }) {
  // Method 1: If backend already provided face_groups
  if (Array.isArray(faceGroups) && faceGroups.length > 0) {
    return faceGroups.map((fg, idx) => ({
      triangles: fg.triangles || [],
      faceId: fg.face_id !== undefined ? fg.face_id : idx,
      contourEdgeIndex: fg.contour_edge_index
    }));
  }

  // Method 2: Match roof_mesh triangles to graph.faces (excluding 90° gable degenerate faces)
  if (Array.isArray(graphFaces) && graphFaces.length > 0 && Array.isArray(roofMeshTris) && roofMeshTris.length > 0) {
    const slopingFaces = graphFaces.filter(f => !f.is_gable && f.pitch_angle !== 90);
    const assignedTris = new Set();
    const resultGroups = [];

    slopingFaces.forEach((face, fIdx) => {
      const fVertSet = new Set(face.vertices || []);
      const matchingTris = [];

      roofMeshTris.forEach((tri, tIdx) => {
        if (!assignedTris.has(tIdx) && tri.every(v => fVertSet.has(v))) {
          matchingTris.push(tri);
          assignedTris.add(tIdx);
        }
      });

      if (matchingTris.length > 0) {
        resultGroups.push({
          triangles: matchingTris,
          faceId: face.id !== undefined ? face.id : fIdx,
          contourEdgeIndex: face.contour_edge_index
        });
      }
    });

    // Capture any remaining triangles using normal plane grouping
    if (assignedTris.size < roofMeshTris.length) {
      const remainingTris = roofMeshTris.filter((_, tIdx) => !assignedTris.has(tIdx));
      const normalGroups = {};
      remainingTris.forEach(tri => {
        const v0 = getVertexCoords(roofMeshVerts[tri[0]]);
        const v1 = getVertexCoords(roofMeshVerts[tri[1]]);
        const v2 = getVertexCoords(roofMeshVerts[tri[2]]);
        if (v0 && v1 && v2) {
          const key = getPlaneNormalKey(v0, v1, v2);
          if (!normalGroups[key]) normalGroups[key] = [];
          normalGroups[key].push(tri);
        }
      });

      Object.values(normalGroups).forEach((tris, rIdx) => {
        resultGroups.push({
          triangles: tris,
          faceId: `rem_${rIdx}`,
          contourEdgeIndex: -1
        });
      });
    }

    if (resultGroups.length > 0) {
      return resultGroups;
    }
  }

  // Method 3: Pure plane-normal grouping (like Scene3D.jsx)
  if (Array.isArray(roofMeshTris) && roofMeshTris.length > 0) {
    const normalGroups = {};
    roofMeshTris.forEach(tri => {
      const v0 = getVertexCoords(roofMeshVerts[tri[0]]);
      const v1 = getVertexCoords(roofMeshVerts[tri[1]]);
      const v2 = getVertexCoords(roofMeshVerts[tri[2]]);
      if (v0 && v1 && v2) {
        const key = getPlaneNormalKey(v0, v1, v2);
        if (!normalGroups[key]) normalGroups[key] = [];
        normalGroups[key].push(tri);
      }
    });

    return Object.values(normalGroups).map((tris, idx) => ({
      triangles: tris,
      faceId: idx,
      contourEdgeIndex: -1
    }));
  }

  return [];
}

/**
 * Builds all 3D Three.js scene objects for a given roof
 * @returns {Array<THREE.Object3D>} List of meshes and line segments to add to Three.js scene
 */
export function buildRoof3DSceneObjects({
  roof,
  mmPerPx,
  imgSize,
  topYOffset,
  wallHeightMm,
  enableShadows = true,
  roofColorMode = "palette", // "palette" | "single"
  singleRoofColor = "#334155", // default uniform color (or customizable)
  showOutlines = true,
  renderSampleWalls = true,
  hasUserWalls = false,
  showTrusses = false,
  trussSpacingMm = 600,
  trussXrayMode = true,
  hideRoofShell = false
}) {
  const createdObjects = [];
  if (!roof || !roof.v3Data) return createdObjects;

  const roofMesh = roof.v3Data.roofMesh || roof.v3Data.roof_mesh;
  const wallMesh = roof.v3Data.wallMesh || roof.v3Data.wall_mesh;
  const graph = roof.v3Data.graph;
  const graphFaces = graph?.faces || roof.v3Data.topology2D?.faces || [];
  const rVerts = roofMesh?.vertices || graph?.vertices || [];
  const rTris = roofMesh?.faces || [];
  const faceGroups = roofMesh?.face_groups;

  // Convert mm world coordinates to Three.js scene coordinates
  const toSceneCoords = (x, y, z) => [
    x / mmPerPx - imgSize.w / 2,
    topYOffset + (z - wallHeightMm) / mmPerPx,
    y / mmPerPx - imgSize.h / 2
  ];

  // ── 1. RENDER SLOPING ROOF FACETS (SINGLE TONE VS MULTI-COLOR PALETTE) ──
  if (!hideRoofShell) {
    const groupedFaces = groupRoofTriangles({
      graphFaces,
      roofMeshVerts: rVerts,
      roofMeshTris: rTris,
      faceGroups
    });

    const isXray = showTrusses && trussXrayMode;

    if (roofColorMode === "single") {
      // ── UNIFIED SINGLE TONE ROOF MESH ──
      const allPositions = [];
      groupedFaces.forEach(faceGroup => {
        const triangles = faceGroup.triangles || [];
        triangles.forEach(tri => {
          const v0 = getVertexCoords(rVerts[tri[0]]);
          const v1 = getVertexCoords(rVerts[tri[1]]);
          const v2 = getVertexCoords(rVerts[tri[2]]);
          if (!v0 || !v1 || !v2) return;

          const p0 = toSceneCoords(v0[0], v0[1], v0[2]);
          const p1 = toSceneCoords(v1[0], v1[1], v1[2]);
          const p2 = toSceneCoords(v2[0], v2[1], v2[2]);

          allPositions.push(...p0, ...p1, ...p2);
        });
      });

      if (allPositions.length > 0) {
        const unifiedGeom = new THREE.BufferGeometry();
        unifiedGeom.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
        unifiedGeom.computeVertexNormals();

        const faceMat = new THREE.MeshStandardMaterial({
          color: singleRoofColor || "#334155",
          roughness: 0.45,
          metalness: 0.1,
          side: THREE.DoubleSide,
          transparent: isXray,
          opacity: isXray ? 0.35 : 1.0,
          depthWrite: !isXray
        });

        const fMesh = new THREE.Mesh(unifiedGeom, faceMat);
        fMesh.castShadow = enableShadows && !isXray;
        fMesh.receiveShadow = enableShadows;
        createdObjects.push(fMesh);

        // Clean crease-only CAD lines (only at > 15 deg ridges, hips, valleys)
        if (showOutlines) {
          const edgesGeom = new THREE.EdgesGeometry(unifiedGeom, 15);
          const edgesMat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            linewidth: 1.5,
            transparent: isXray,
            opacity: isXray ? 0.4 : 1.0
          });
          const lineSegments = new THREE.LineSegments(edgesGeom, edgesMat);
          createdObjects.push(lineSegments);
        }
      }
    } else {
      // ── MULTI-COLOR PALETTE ROOF FACETS ──
      groupedFaces.forEach((faceGroup, fIdx) => {
        const triangles = faceGroup.triangles || [];
        if (triangles.length === 0) return;

        const positions = [];
        triangles.forEach(tri => {
          const v0 = getVertexCoords(rVerts[tri[0]]);
          const v1 = getVertexCoords(rVerts[tri[1]]);
          const v2 = getVertexCoords(rVerts[tri[2]]);
          if (!v0 || !v1 || !v2) return;

          const p0 = toSceneCoords(v0[0], v0[1], v0[2]);
          const p1 = toSceneCoords(v1[0], v1[1], v1[2]);
          const p2 = toSceneCoords(v2[0], v2[1], v2[2]);

          positions.push(...p0, ...p1, ...p2);
        });

        if (positions.length > 0) {
          const faceGeom = new THREE.BufferGeometry();
          faceGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          faceGeom.computeVertexNormals();

          const edgeIdx = (faceGroup.contourEdgeIndex !== undefined && faceGroup.contourEdgeIndex !== null && faceGroup.contourEdgeIndex >= 0)
            ? faceGroup.contourEdgeIndex
            : fIdx;
          const color = ROOF_FACE_PALETTE[edgeIdx % ROOF_FACE_PALETTE.length];
          const faceMat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.35,
            metalness: 0.15,
            side: THREE.DoubleSide,
            transparent: isXray,
            opacity: isXray ? 0.35 : 1.0,
            depthWrite: !isXray
          });

          const fMesh = new THREE.Mesh(faceGeom, faceMat);
          fMesh.userData = {
            faceId: faceGroup.faceId,
            contourEdgeIndex: faceGroup.contourEdgeIndex,
            edgeIndex: edgeIdx,
            roofId: roof.id
          };
          fMesh.castShadow = enableShadows && !isXray;
          fMesh.receiveShadow = enableShadows;
          createdObjects.push(fMesh);

          // Crisp White CAD Outline Lines
          if (showOutlines) {
            const edgesGeom = new THREE.EdgesGeometry(faceGeom, 15);
            const edgesMat = new THREE.LineBasicMaterial({
              color: 0xffffff,
              linewidth: 2,
              transparent: isXray,
              opacity: isXray ? 0.4 : 1.0
            });
            const lineSegments = new THREE.LineSegments(edgesGeom, edgesMat);
            createdObjects.push(lineSegments);
          }
        }
      });
    }
  }

  // ── 2. RENDER GABLE WALLS (TƯỜNG THU HỒI ĐẦU HỒI) ──
  const gMesh = roof.v3Data.gableMesh || roof.v3Data.gable_mesh || wallMesh?.gable_mesh;
  const gVerts = gMesh?.vertices || [];
  const gFaces = gMesh?.faces || [];

  if (gFaces.length > 0) {
    const gPositions = [];
    gFaces.forEach(face => {
      if (!Array.isArray(face) || face.length < 3) return;
      const v0 = getVertexCoords(gVerts[face[0]]);
      const v1 = getVertexCoords(gVerts[face[1]]);
      const v2 = getVertexCoords(gVerts[face[2]]);
      if (!v0 || !v1 || !v2) return;

      const p0 = toSceneCoords(v0[0], v0[1], v0[2]);
      const p1 = toSceneCoords(v1[0], v1[1], v1[2]);
      const p2 = toSceneCoords(v2[0], v2[1], v2[2]);

      gPositions.push(...p0, ...p1, ...p2);
    });

    if (gPositions.length > 0) {
      const gGeom = new THREE.BufferGeometry();
      gGeom.setAttribute('position', new THREE.Float32BufferAttribute(gPositions, 3));
      gGeom.computeVertexNormals();

      const gMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1, // Wall Material Color
        roughness: 0.8,
        metalness: 0.05,
        side: THREE.DoubleSide
      });

      const gableWallMesh = new THREE.Mesh(gGeom, gMat);
      gableWallMesh.castShadow = enableShadows;
      gableWallMesh.receiveShadow = enableShadows;
      createdObjects.push(gableWallMesh);

      const gEdgesGeom = new THREE.EdgesGeometry(gGeom, 15);
      const gEdgesMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 1.5 });
      const gLineSegments = new THREE.LineSegments(gEdgesGeom, gEdgesMat);
      createdObjects.push(gLineSegments);
    }
  }

  // ── 3. RENDER 3D WALL SURFACES UNDER EAVES (SKIPPED IF USER HAS DRAWN WALLS) ──
  const shouldRenderSampleWalls = renderSampleWalls && !hasUserWalls;
  const wVerts = wallMesh?.vertices || [];
  const wFaces = wallMesh?.faces || [];

  if (shouldRenderSampleWalls && wFaces.length > 0) {
    const wPositions = [];
    wFaces.forEach(face => {
      if (!Array.isArray(face) || face.length < 3) return;
      const v0 = getVertexCoords(wVerts[face[0]]);
      const v1 = getVertexCoords(wVerts[face[1]]);
      const v2 = getVertexCoords(wVerts[face[2]]);
      if (!v0 || !v1 || !v2) return;

      const p0 = toSceneCoords(v0[0], v0[1], v0[2]);
      const p1 = toSceneCoords(v1[0], v1[1], v1[2]);
      const p2 = toSceneCoords(v2[0], v2[1], v2[2]);

      wPositions.push(...p0, ...p1, ...p2);
    });

    if (wPositions.length > 0) {
      const wGeom = new THREE.BufferGeometry();
      wGeom.setAttribute('position', new THREE.Float32BufferAttribute(wPositions, 3));
      wGeom.computeVertexNormals();

      const wMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.85,
        metalness: 0.05,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
      });

      const eaveWallMesh = new THREE.Mesh(wGeom, wMat);
      createdObjects.push(eaveWallMesh);
    }
  }

  // NOTE: Phần Truss tạm thời comment lại theo yêu cầu, sẽ sử dụng lại nên không xóa hay revert lại comment đó.
  /*
  // ── 4. RENDER ROOF TRUSS FRAMING (3D TIMBER SYSTEM) ──
  if (showTrusses) {
    try {
      let polyMm = (roof.v3Data && Array.isArray(roof.v3Data.points) && roof.v3Data.points.length >= 3)
        ? roof.v3Data.points
        : (Array.isArray(roof.polygon) && roof.polygon.length >= 3
          ? roof.polygon.map(p => [
              (typeof p.x === 'number' ? p.x : p[0]) * mmPerPx,
              (typeof p.y === 'number' ? p.y : p[1]) * mmPerPx
            ])
          : null);

      const trussResult = TrussEngine.generateTrussesFromRoofV3(roof.v3Data, {
        spacingMm: trussSpacingMm,
        wallHeightMm,
        polygon: polyMm,
        points: polyMm
      });

      if (trussResult && Array.isArray(trussResult.segments3D) && trussResult.segments3D.length > 0) {
        const colorMap = {};
        for (const item of trussResult.segments3D) {
          const colorHex = item.color || TRUSS_COLORS[item.type] || '#94a3b8';
          if (!colorMap[colorHex]) colorMap[colorHex] = [];
          for (const [p1, p2] of item.segments) {
            const sp1 = toSceneCoords(p1.x, p1.y, p1.z);
            const sp2 = toSceneCoords(p2.x, p2.y, p2.z);
            colorMap[colorHex].push(...sp1, ...sp2);
          }
        }

        Object.entries(colorMap).forEach(([colorHex, coords]) => {
          if (!coords.length) return;
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
          const mat = new THREE.LineBasicMaterial({
            color: colorHex,
            linewidth: 2,
            depthTest: true
          });
          const lineSegments = new THREE.LineSegments(geom, mat);
          lineSegments.userData = { isTruss: true, roofId: roof.id };
          createdObjects.push(lineSegments);
        });
      }
    } catch (err) {
      console.warn("Could not generate 3D trusses in buildRoof3DSceneObjects:", err);
    }
  }
  */

  return createdObjects;
}
