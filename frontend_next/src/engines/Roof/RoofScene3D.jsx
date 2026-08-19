'use client';

import React, { useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { ROOF_FACE_PALETTE, getPlaneNormalKey, getVertexCoords } from './Roof3DBuilder';

/**
 * 🏠 RoofScene3D: Standalone React-Three-Fiber 3D Canvas component for Roof Models.
 * Accepts v3Data or { vertices, faces, roofMesh, wallMesh, gableMesh }
 */
export function RoofMeshComponent({ vertices = [], faces = [], roofMesh, wallMesh, gableMesh }) {
  const groupRef = useRef(null);

  const rVerts = roofMesh?.vertices || vertices || [];
  const rTris = roofMesh?.faces || faces || [];

  const { faceMeshes, edgeSegments } = useMemo(() => {
    if (!rVerts.length || !rTris.length) return { faceMeshes: [], edgeSegments: null };

    // Group triangles by plane normal key
    const normalGroups = {};
    const edgeMap = {};

    rTris.forEach(tri => {
      if (!Array.isArray(tri) || tri.length < 3) return;
      const v0 = getVertexCoords(rVerts[tri[0]]);
      const v1 = getVertexCoords(rVerts[tri[1]]);
      const v2 = getVertexCoords(rVerts[tri[2]]);
      if (!v0 || !v1 || !v2) return;

      const normalKey = getPlaneNormalKey(v0, v1, v2);
      if (!normalGroups[normalKey]) normalGroups[normalKey] = [];

      normalGroups[normalKey].push(v0[0], v0[2], -v0[1]);
      normalGroups[normalKey].push(v1[0], v1[2], -v1[1]);
      normalGroups[normalKey].push(v2[0], v2[2], -v2[1]);

      for (let i = 0; i < 3; i++) {
        const idx1 = tri[i];
        const idx2 = tri[(i + 1) % 3];
        const minIdx = Math.min(idx1, idx2);
        const maxIdx = Math.max(idx1, idx2);
        const edgeKey = `${minIdx},${maxIdx}`;
        if (!edgeMap[edgeKey]) edgeMap[edgeKey] = [];
        edgeMap[edgeKey].push(normalKey);
      }
    });

    const meshes = Object.entries(normalGroups).map(([normalKey, positions], idx) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();

      const [nx, ny, nz] = normalKey.split(',').map(Number);
      const isVerticalWall = Math.abs(ny) < 0.15;

      const color = isVerticalWall ? '#cbd5e1' : ROOF_FACE_PALETTE[idx % ROOF_FACE_PALETTE.length];
      const opacity = isVerticalWall ? 0.7 : 0.9;
      const roughness = isVerticalWall ? 0.8 : 0.35;

      return { geometry, color, opacity, roughness, isVerticalWall, key: idx };
    });

    // Wireframe edges for boundary and ridge/hip/valley lines
    const points = [];
    for (const [edgeKey, normals] of Object.entries(edgeMap)) {
      if (normals.length === 1 || (normals.length >= 2 && normals[0] !== normals[1])) {
        const [idx1, idx2] = edgeKey.split(',').map(Number);
        const v1 = getVertexCoords(rVerts[idx1]);
        const v2 = getVertexCoords(rVerts[idx2]);
        if (v1 && v2) {
          points.push(new THREE.Vector3(v1[0], v1[2], -v1[1]));
          points.push(new THREE.Vector3(v2[0], v2[2], -v2[1]));
        }
      }
    }
    const edgeGeo = points.length > 0 ? new THREE.BufferGeometry().setFromPoints(points) : null;

    return { faceMeshes: meshes, edgeSegments: edgeGeo };
  }, [rVerts, rTris]);

  return (
    <group ref={groupRef}>
      {faceMeshes.map(({ geometry, color, opacity, roughness, isVerticalWall, key }) => (
        <mesh key={key} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial
            color={color}
            side={THREE.DoubleSide}
            transparent={opacity < 1}
            opacity={opacity}
            roughness={roughness}
            metalness={isVerticalWall ? 0.05 : 0.15}
          />
        </mesh>
      ))}

      {edgeSegments && (
        <lineSegments geometry={edgeSegments}>
          <lineBasicMaterial color="#ffffff" linewidth={2} />
        </lineSegments>
      )}
    </group>
  );
}

export default function RoofScene3D({ v3Data, height = "100%", width = "100%" }) {
  if (!v3Data) return null;

  const roofMesh = v3Data.roofMesh || v3Data.roof_mesh;
  const vertices = roofMesh?.vertices || v3Data.mesh3D?.vertices || [];
  const faces = roofMesh?.faces || v3Data.mesh3D?.faces || [];

  return (
    <div style={{ width, height, position: 'relative', background: '#0b0f19' }}>
      <Canvas shadows camera={{ position: [0, 4000, 8000], fov: 45, near: 10, far: 50000 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5000, 10000, 5000]} intensity={1.2} castShadow />
        <directionalLight position={[-5000, 5000, -5000]} intensity={0.5} />
        
        <RoofMeshComponent
          vertices={vertices}
          faces={faces}
          roofMesh={roofMesh}
          wallMesh={v3Data.wallMesh || v3Data.wall_mesh}
          gableMesh={v3Data.gableMesh || v3Data.gable_mesh}
        />

        <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      </Canvas>
    </div>
  );
}
