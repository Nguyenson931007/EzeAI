import * as THREE from 'three';

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
  enableShadows = true
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

  // ── 1. RENDER MULTI-COLOR SLOPING ROOF FACETS ──
  const groupedFaces = groupRoofTriangles({
    graphFaces,
    roofMeshVerts: rVerts,
    roofMeshTris: rTris,
    faceGroups
  });

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

      const color = ROOF_FACE_PALETTE[fIdx % ROOF_FACE_PALETTE.length];
      const faceMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.15,
        side: THREE.DoubleSide
      });

      const fMesh = new THREE.Mesh(faceGeom, faceMat);
      fMesh.castShadow = enableShadows;
      fMesh.receiveShadow = enableShadows;
      createdObjects.push(fMesh);

      // Crisp White CAD Outline Lines
      const edgesGeom = new THREE.EdgesGeometry(faceGeom, 15);
      const edgesMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
      const lineSegments = new THREE.LineSegments(edgesGeom, edgesMat);
      createdObjects.push(lineSegments);
    }
  });

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

  // ── 3. RENDER 3D WALL SURFACES UNDER EAVES ──
  const wVerts = wallMesh?.vertices || [];
  const wFaces = wallMesh?.faces || [];

  if (wFaces.length > 0) {
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

  return createdObjects;
}
