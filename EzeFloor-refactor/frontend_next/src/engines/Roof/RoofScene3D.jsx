'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { ROOF_FACE_PALETTE, getPlaneNormalKey, getVertexCoords } from './Roof3DBuilder';
import { TrussEngine } from '../Truss/TrussEngine';

/**
 * 🏠 RoofMeshComponent: Renders 3D roof faces, walls, gables, and wireframe outlines.
 */
export function RoofMeshComponent({
  vertices = [],
  faces = [],
  roofMesh,
  wallMesh,
  gableMesh,
  roofColorMode = "palette",
  singleRoofColor = "#334155",
  showOutlines = true,
  xrayMode = false,
  hideRoofShell = false
}) {
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

      // Absolute coordinate mapping: X -> X, Z -> Y (up), Y -> -Z (depth)
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

      const color = isVerticalWall
        ? '#cbd5e1'
        : (roofColorMode === "single" ? (singleRoofColor || '#334155') : ROOF_FACE_PALETTE[idx % ROOF_FACE_PALETTE.length]);
      const opacity = isVerticalWall ? 0.7 : (xrayMode ? 0.3 : 0.95);
      const roughness = isVerticalWall ? 0.8 : 0.45;

      return { geometry, color, opacity, roughness, isVerticalWall, key: idx };
    });

    // Wireframe edges for boundary and ridge/hip/valley lines
    const points = [];
    if (showOutlines) {
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
    }
    const edgeGeo = points.length > 0 ? new THREE.BufferGeometry().setFromPoints(points) : null;

    return { faceMeshes: meshes, edgeSegments: edgeGeo };
  }, [rVerts, rTris, roofColorMode, singleRoofColor, showOutlines, xrayMode]);

  const wallGeom = useMemo(() => {
    const wVerts = wallMesh?.vertices || [];
    const wTris = wallMesh?.faces || [];
    if (!wVerts.length || !wTris.length) return null;
    const positions = [];
    wTris.forEach(tri => {
      if (!Array.isArray(tri) || tri.length < 3) return;
      const v0 = getVertexCoords(wVerts[tri[0]]);
      const v1 = getVertexCoords(wVerts[tri[1]]);
      const v2 = getVertexCoords(wVerts[tri[2]]);
      if (!v0 || !v1 || !v2) return;
      positions.push(v0[0], v0[2], -v0[1]);
      positions.push(v1[0], v1[2], -v1[1]);
      positions.push(v2[0], v2[2], -v2[1]);
    });
    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, [wallMesh]);

  const gableGeom = useMemo(() => {
    const gVerts = gableMesh?.vertices || [];
    const gTris = gableMesh?.faces || [];
    if (!gVerts.length || !gTris.length) return null;
    const positions = [];
    gTris.forEach(tri => {
      if (!Array.isArray(tri) || tri.length < 3) return;
      const v0 = getVertexCoords(gVerts[tri[0]]);
      const v1 = getVertexCoords(gVerts[tri[1]]);
      const v2 = getVertexCoords(gVerts[tri[2]]);
      if (!v0 || !v1 || !v2) return;
      positions.push(v0[0], v0[2], -v0[1]);
      positions.push(v1[0], v1[2], -v1[1]);
      positions.push(v2[0], v2[2], -v2[1]);
    });
    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, [gableMesh]);

  return (
    <group ref={groupRef}>
      {wallGeom && (
        <mesh geometry={wallGeom} castShadow receiveShadow>
          <meshStandardMaterial color="#f1f5f9" roughness={0.7} metalness={0.05} side={THREE.DoubleSide} />
        </mesh>
      )}

      {gableGeom && (
        <mesh geometry={gableGeom} castShadow receiveShadow>
          <meshStandardMaterial color="#cbd5e1" roughness={0.65} metalness={0.05} side={THREE.DoubleSide} />
        </mesh>
      )}

      {!hideRoofShell && faceMeshes.map(({ geometry, color, opacity, roughness, isVerticalWall, key }) => (
        <mesh key={key} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial
            color={color}
            side={THREE.DoubleSide}
            transparent={opacity < 1}
            opacity={opacity}
            roughness={roughness}
            metalness={isVerticalWall ? 0.05 : 0.1}
            depthWrite={opacity > 0.8}
          />
        </mesh>
      ))}

      {edgeSegments && !hideRoofShell && (
        <lineSegments geometry={edgeSegments}>
          <lineBasicMaterial color="#ffffff" linewidth={2} transparent={xrayMode} opacity={xrayMode ? 0.4 : 1.0} />
        </lineSegments>
      )}
    </group>
  );
}

/**
 * 🦴 TrussMeshComponent: Renders 3D Truss frames with distinct colors per member type.
 */
export function TrussMeshComponent({ segments3D = [] }) {
  const lineGroups = useMemo(() => {
    if (!segments3D || !segments3D.length) return [];
    const colorMap = {};

    for (const item of segments3D) {
      // Ẩn các đường dóng tham khảo tại valley và hộp phân chia trên 3D (tương tự 2D chỉ là đường tham khảo)
      if (
        item.type === 'partition_guide' ||
        item.type === 'partition_ridge' ||
        item.type === 'partition_box' ||
        item.type === 'partition_box_sub'
      ) {
        continue;
      }

      const isDashed = item.type === 'virtual_hip';
      const key = `${item.color || '#cbd5e1'}_${isDashed ? 'dashed' : 'solid'}`;
      if (!colorMap[key]) {
        colorMap[key] = {
          color: item.color || '#cbd5e1',
          isDashed,
          coords: []
        };
      }

      for (const [p1, p2] of item.segments) {
        // Absolute mapping: (x, z, -y)
        colorMap[key].coords.push(p1.x, p1.z, -p1.y);
        colorMap[key].coords.push(p2.x, p2.z, -p2.y);
      }
    }

    return Object.values(colorMap).map(({ color, isDashed, coords }) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
      if (isDashed) {
        geo.computeLineDistances();
      }
      return { color, isDashed, geometry: geo };
    });
  }, [segments3D]);

  if (!lineGroups.length) return null;

  return (
    <group>
      {lineGroups.map(({ color, isDashed, geometry }, idx) => (
        <lineSegments key={idx} geometry={geometry}>
          {isDashed ? (
            <lineDashedMaterial color={color} dashSize={300} gapSize={150} linewidth={2} />
          ) : (
            <lineBasicMaterial color={color} linewidth={2} />
          )}
        </lineSegments>
      ))}
    </group>
  );
}

/**
 * 🏠 RoofScene3D: Standalone React-Three-Fiber 3D Canvas component for Roof Models.
 */
export default function RoofScene3D({
  v3Data,
  height = "100%",
  width = "100%",
  roofColorMode = "palette",
  singleRoofColor = "#334155",
  showOutlines = true,
  showTruss = false,
  trussSpacingMm = 600,
  xrayMode = true,
  hideRoofShell = false,
  onTrussCalculated = null
}) {
  if (!v3Data) return null;

  const roofMesh = v3Data.roofMesh || v3Data.roof_mesh;
  const vertices = roofMesh?.vertices || v3Data.mesh3D?.vertices || [];
  const faces = roofMesh?.faces || v3Data.mesh3D?.faces || [];

  // NOTE: Phần Truss tạm thời comment lại theo yêu cầu, sẽ sử dụng lại nên không xóa hay revert lại comment đó.
  /*
  // Compute 3D trusses when showTruss is enabled
  const trussResult = useMemo(() => {
    if (!showTruss || !v3Data) return null;
    try {
      return TrussEngine.generateTrussesFromRoofV3(v3Data, { spacingMm: trussSpacingMm });
    } catch (e) {
      console.warn("Failed to generate trusses in RoofScene3D:", e);
      return null;
    }
  }, [showTruss, v3Data, trussSpacingMm]);

  useEffect(() => {
    if (onTrussCalculated && trussResult) {
      onTrussCalculated(trussResult);
    }
  }, [trussResult, onTrussCalculated]);
  */

  return (
    <div style={{ width, height, position: 'relative', background: '#0b0f19' }}>
      <Canvas shadows camera={{ position: [0, 5000, 10000], fov: 45, near: 10, far: 80000 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5000, 12000, 5000]} intensity={1.2} castShadow />
        <directionalLight position={[-5000, 6000, -5000]} intensity={0.5} />

        <RoofMeshComponent
          vertices={vertices}
          faces={faces}
          roofMesh={roofMesh}
          wallMesh={v3Data.wallMesh || v3Data.wall_mesh}
          gableMesh={v3Data.gableMesh || v3Data.gable_mesh}
          roofColorMode={roofColorMode}
          singleRoofColor={singleRoofColor}
          showOutlines={showOutlines}
          xrayMode={showTruss && xrayMode}
          hideRoofShell={showTruss && hideRoofShell}
        />

        {/* NOTE: Phần Truss tạm thời comment lại theo yêu cầu, sẽ sử dụng lại nên không xóa hay revert lại comment đó. */}
        {/*
        {showTruss && trussResult?.segments3D && (
          <TrussMeshComponent segments3D={trussResult.segments3D} />
        )}
        */}

        <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      </Canvas>
    </div>
  );
}
