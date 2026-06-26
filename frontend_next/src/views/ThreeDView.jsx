"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function ThreeDView({
  rooms = [],
  walls = [],
  doors = [],
  onClose,
  realScale = 1.0
}) {
  const containerRef = useRef(null);
  const [wallHeight, setWallHeight] = useState(150);
  const [showFloors, setShowFloors] = useState(true);
  const [showDoors, setShowDoors] = useState(true);
  const [enableShadows, setEnableShadows] = useState(true);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  
  // Store generated 3D meshes to dynamically update them (e.g. wall height)
  const wallMeshesRef = useRef([]);
  const floorMeshesRef = useRef([]);
  const doorMeshesRef = useRef([]);

  // Calculate center of the floor plan for OrbitControls target
  const center = React.useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    // Check walls
    walls.forEach(w => {
      if (w.centerline && w.centerline.length === 2) {
        w.centerline.forEach(p => {
          minX = Math.min(minX, p[0]);
          maxX = Math.max(maxX, p[0]);
          minY = Math.min(minY, p[1]);
          maxY = Math.max(maxY, p[1]);
        });
      }
    });

    // Check rooms
    rooms.forEach(r => {
      if (r.polygon) {
        r.polygon.forEach(p => {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        });
      }
    });

    if (minX === Infinity) return new THREE.Vector3(400, 0, 300);
    return new THREE.Vector3((minX + maxX) / 2, 0, (minY + maxY) / 2);
  }, [walls, rooms]);

  // Utility to extract door properties
  const getDoorProps = (door) => {
    const poly = door.polygon;
    if (!poly || poly.length < 3) {
      const [x1, y1, x2, y2] = door.bbox || [0, 0, 100, 20];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      return { cx, cy, length, angle, thickness: 15 };
    }
    
    let maxDist = 0;
    let pA = poly[0], pB = poly[1];
    for (let i = 0; i < poly.length; i++) {
      for (let j = i + 1; j < poly.length; j++) {
        const dx = poly[i][0] - poly[j][0];
        const dy = poly[i][1] - poly[j][1];
        const d = dx * dx + dy * dy;
        if (d > maxDist) {
          maxDist = d;
          pA = poly[i];
          pB = poly[j];
        }
      }
    }
    const length = Math.sqrt(maxDist);
    const cx = door.centroid ? door.centroid[0] : (pA[0] + pB[0]) / 2;
    const cy = door.centroid ? door.centroid[1] : (pA[1] + pB[1]) / 2;
    const angle = Math.atan2(pB[1] - pA[1], pB[0] - pA[0]);
    return { cx, cy, length, angle, thickness: 15 };
  };

  // Helper: recursively dispose all GPU resources from an Object3D
  const disposeObject3D = (obj) => {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. SCENE CREATION
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Slate-900 background (Premium dark theme)
    sceneRef.current = scene;

    // 2. CAMERA CREATION
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 10000);
    // Position camera isometric-style, looking down at center
    camera.position.set(center.x, 600, center.z + 600);
    cameraRef.current = camera;

    // 3. RENDERER CREATION
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = enableShadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. LIGHTS
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
    dirLight.position.set(center.x + 400, 800, center.z - 300);
    dirLight.castShadow = enableShadows;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 3000;
    // Set orthographic shadow boundaries wide enough for the floor plan
    const d = 1000;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x3b82f6, 0.4, 1000); // Aesthetic blue point light
    pointLight.position.set(center.x, 300, center.z);
    scene.add(pointLight);

    // 5. GRID HELPER
    const gridHelper = new THREE.GridHelper(5000, 100, 0x3b82f6, 0x1e293b);
    gridHelper.position.y = -2;
    scene.add(gridHelper);

    // 6. ORBIT CONTROLS
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent camera from going underground
    controls.target.copy(center);
    controls.update();
    controlsRef.current = controls;

    // 7. RENDER ANIMATION LOOP
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 8. RESIZE HANDLING via ResizeObserver (reliable for flex containers)
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    // ResizeObserver fires when the container's layout dimensions change
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);

    // Also listen for window resize as fallback
    window.addEventListener("resize", handleResize);

    // Initial resize safety fallbacks
    const t1 = setTimeout(handleResize, 100);
    const t2 = setTimeout(handleResize, 300);

    // Capture container ref for cleanup
    const container = containerRef.current;

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      clearTimeout(t1);
      clearTimeout(t2);

      // Dispose orbit controls
      controls.dispose();

      // Dispose all scene objects (geometries, materials, textures)
      scene.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });

      // Remove canvas from DOM and dispose renderer (releases WebGL context)
      if (renderer.domElement && container) {
        try { container.removeChild(renderer.domElement); } catch (_) {}
      }
      renderer.dispose();

      // Clear refs
      rendererRef.current = null;
      sceneRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
      wallMeshesRef.current = [];
      floorMeshesRef.current = [];
      doorMeshesRef.current = [];
    };
  }, [center]);

  // Handle Shadows Toggle
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.shadowMap.enabled = enableShadows;
      // Recompile materials
      sceneRef.current?.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = enableShadows;
          object.receiveShadow = enableShadows;
          if (object.material) object.material.needsUpdate = true;
        }
      });
    }
  }, [enableShadows]);

  // Re-build scene elements whenever inputs or visibility toggles change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear previous meshes and dispose their GPU resources
    wallMeshesRef.current.forEach(m => { scene.remove(m); disposeObject3D(m); });
    wallMeshesRef.current = [];

    floorMeshesRef.current.forEach(m => { scene.remove(m); disposeObject3D(m); });
    floorMeshesRef.current = [];

    doorMeshesRef.current.forEach(m => { scene.remove(m); disposeObject3D(m); });
    doorMeshesRef.current = [];

    // --- 1. RENDER ROOMS (FLOORS) ---
    if (showFloors) {
      rooms.forEach(room => {
        const poly = room.polygon;
        if (!poly || poly.length < 3) return;

        const shape = new THREE.Shape();
        shape.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          shape.lineTo(poly[i].x, poly[i].y);
        }
        shape.closePath();

        // Color theme based on room type
        let color = 0x475569; // default slate gray
        const rType = (room.type || "").toLowerCase();
        const rName = (room.room_name || "").toLowerCase();

        if (rType === "wet" || /(bath|wc|toilet|ensuite|powder|laundry|shower)/i.test(rName)) {
          color = 0x1e3a8a; // Ocean Blue tiles
        } else if (rType === "dry" || /(bed|living|kitchen|dining|office|study|entry|hall)/i.test(rName)) {
          color = 0x7c2d12; // Timber/wood brown
          if (/(bed|bedroom|study|office)/i.test(rName)) {
            color = 0x334155; // Cozy carpet grey
          }
        } else if (rType === "timber_deck") {
          color = 0x451a03; // Dark timber deck
        } else if (rType === "tile_deck" || /(balcony|deck|alfresco)/i.test(rName)) {
          color = 0x3f3f46; // Stone gray tiles
        }

        const extrudeSettings = { depth: 1, bevelEnabled: false };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const material = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.85,
          metalness: 0.1,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = Math.PI / 2; // Lie flat on X-Z plane
        mesh.position.y = -0.5; // Avoid Z-fighting with grid helper
        mesh.receiveShadow = enableShadows;
        scene.add(mesh);
        floorMeshesRef.current.push(mesh);
      });
    }

    // --- 2. RENDER WALLS ---
    walls.forEach(wall => {
      const centerline = wall.centerline;
      if (!centerline || centerline.length !== 2) return;

      const p1 = centerline[0];
      const p2 = centerline[1];
      const x1 = p1[0], y1 = p1[1];
      const x2 = p2[0], y2 = p2[1];

      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const thickness = wall.thickness_px || 20;

      const geometry = new THREE.BoxGeometry(length, wallHeight, thickness);
      
      // Material: concrete texture simulation
      const color = wall.class_name === "exterior_wall" ? 0x64748b : 0x94a3b8;
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.75,
        metalness: 0.15
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set((x1 + x2) / 2, wallHeight / 2, (y1 + y2) / 2);
      mesh.rotation.y = -angle;
      mesh.castShadow = enableShadows;
      mesh.receiveShadow = enableShadows;
      
      scene.add(mesh);
      wallMeshesRef.current.push(mesh);
    });

    // --- 3. RENDER DOORS ---
    if (showDoors) {
      doors.forEach(door => {
        const { cx, cy, length, angle, thickness } = getDoorProps(door);
        
        // Group to manage the frame and slab together
        const doorGroup = new THREE.Group();
        doorGroup.position.set(cx, 0, cy);
        doorGroup.rotation.y = -angle;

        const frameHeight = wallHeight * 0.85; // Doors are slightly shorter than walls

        // Frame post materials (wood style)
        const frameMat = new THREE.MeshStandardMaterial({
          color: 0x451a03,
          roughness: 0.65,
          metalness: 0.1
        });

        // Left Frame Post
        const leftPostGeo = new THREE.BoxGeometry(6, frameHeight, thickness + 4);
        const leftPost = new THREE.Mesh(leftPostGeo, frameMat);
        leftPost.position.set(-length / 2 + 3, frameHeight / 2, 0);
        leftPost.castShadow = enableShadows;
        leftPost.receiveShadow = enableShadows;
        doorGroup.add(leftPost);

        // Right Frame Post
        const rightPostGeo = new THREE.BoxGeometry(6, frameHeight, thickness + 4);
        const rightPost = new THREE.Mesh(rightPostGeo, frameMat);
        rightPost.position.set(length / 2 - 3, frameHeight / 2, 0);
        rightPost.castShadow = enableShadows;
        rightPost.receiveShadow = enableShadows;
        doorGroup.add(rightPost);

        // Top Frame Header
        const headerGeo = new THREE.BoxGeometry(length, 6, thickness + 4);
        const header = new THREE.Mesh(headerGeo, frameMat);
        header.position.set(0, frameHeight - 3, 0);
        header.castShadow = enableShadows;
        header.receiveShadow = enableShadows;
        doorGroup.add(header);

        const isDouble = (door.class && door.class.includes("double_door")) || (door.door_name && door.door_name.toLowerCase().includes("2x"));

        // Door Slab(s) Pivot Group (for opening rotation)
        const slabHeight = frameHeight - 8;
        const slabMat = new THREE.MeshStandardMaterial({
          color: 0x78350f,
          roughness: 0.55,
          metalness: 0.05
        });

        if (isDouble) {
          const halfWidth = (length - 12) / 2;
          
          // Left Slab Hinge Pivot
          const leftPivot = new THREE.Group();
          leftPivot.position.set(-length / 2 + 6, slabHeight / 2, 0);
          
          const leftSlabGeo = new THREE.BoxGeometry(halfWidth, slabHeight, 4);
          const leftSlab = new THREE.Mesh(leftSlabGeo, slabMat);
          leftSlab.position.set(halfWidth / 2, 0, 0);
          leftSlab.castShadow = enableShadows;
          leftSlab.receiveShadow = enableShadows;
          leftPivot.add(leftSlab);
          leftPivot.rotation.y = Math.PI / 4;
          doorGroup.add(leftPivot);

          // Right Slab Hinge Pivot
          const rightPivot = new THREE.Group();
          rightPivot.position.set(length / 2 - 6, slabHeight / 2, 0);
          
          const rightSlabGeo = new THREE.BoxGeometry(halfWidth, slabHeight, 4);
          const rightSlab = new THREE.Mesh(rightSlabGeo, slabMat);
          rightSlab.position.set(-halfWidth / 2, 0, 0);
          rightSlab.castShadow = enableShadows;
          rightSlab.receiveShadow = enableShadows;
          rightPivot.add(rightSlab);
          rightPivot.rotation.y = -Math.PI / 4;
          doorGroup.add(rightPivot);
        } else {
          const slabWidth = length - 12;
          const pivotGroup = new THREE.Group();
          pivotGroup.position.set(-length / 2 + 6, slabHeight / 2, 0);
          
          const slabGeo = new THREE.BoxGeometry(slabWidth, slabHeight, 4);
          const slab = new THREE.Mesh(slabGeo, slabMat);
          slab.position.set(slabWidth / 2, 0, 0);
          slab.castShadow = enableShadows;
          slab.receiveShadow = enableShadows;
          pivotGroup.add(slab);

          // Open door 45 degrees for visualization
          pivotGroup.rotation.y = Math.PI / 4; 
          doorGroup.add(pivotGroup);
        }

        scene.add(doorGroup);
        doorMeshesRef.current.push(doorGroup);
      });
    }

  }, [rooms, walls, doors, wallHeight, showFloors, showDoors, enableShadows]);

  // Reset Camera View
  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(center.x, 600, center.z + 600);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
  };

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: "#0f172a",
        width: "100%",
        height: "100%"
      }}
    >
      {/* 3D View WebGL Canvas Container */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0
        }}
      />

      {/* Floating Control Panel */}
      <div
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          zIndex: 10,
          backgroundColor: "rgba(30, 41, 59, 0.9)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
          padding: "16px",
          width: "288px",
          color: "#ffffff",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 2px rgba(255, 255, 255, 0.05)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          fontFamily: "'Outfit', 'Inter', sans-serif"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            paddingBottom: "8px"
          }}
        >
          <span style={{ fontWeight: "bold", fontSize: "12px", letterSpacing: "0.05em", color: "#60a5fa" }}>
            3D VIEWER CONTROLS
          </span>
          <button 
            onClick={onClose} 
            style={{
              color: "#9ca3af",
              fontSize: "11px",
              fontWeight: "bold",
              padding: "4px 8px",
              borderRadius: "4px",
              backgroundColor: "rgba(15, 23, 42, 0.5)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = "#fca5a5"; e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.2)"; }}
            onMouseOut={(e) => { e.currentTarget.style.color = "#9ca3af"; e.currentTarget.style.backgroundColor = "rgba(15, 23, 42, 0.5)"; }}
          >
            ✕ Exit 3D
          </button>
        </div>

        {/* Height Slider */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#d1d5db" }}>
            <span>Wall Height</span>
            <span style={{ fontFamily: "monospace", color: "#60a5fa" }}>{wallHeight}px</span>
          </div>
          <input 
            type="range" 
            min="50" 
            max="300" 
            value={wallHeight} 
            onChange={(e) => setWallHeight(Number(e.target.value))}
            style={{
              width: "100%",
              height: "4px",
              borderRadius: "4px",
              cursor: "pointer",
              accentColor: "#3b82f6"
            }}
          />
        </div>

        {/* Toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: "#d1d5db" }}>
            <span>Show Room Floors</span>
            <input 
              type="checkbox" 
              checked={showFloors} 
              onChange={() => setShowFloors(v => !v)}
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: "#d1d5db" }}>
            <span>Show Wood Doors</span>
            <input 
              type="checkbox" 
              checked={showDoors} 
              onChange={() => setShowDoors(v => !v)}
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: "#d1d5db" }}>
            <span>Realistic Shadows</span>
            <input 
              type="checkbox" 
              checked={enableShadows} 
              onChange={() => setEnableShadows(v => !v)}
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            />
          </label>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
          <button 
            onClick={handleResetCamera}
            style={{
              flex: 1,
              padding: "6px 12px",
              borderRadius: "6px",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              color: "#60a5fa",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.2)"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.1)"}
          >
            🎥 Reset Camera
          </button>
        </div>
      </div>

      {/* Floating Instruction Tips */}
      <div 
        style={{
          position: "absolute",
          bottom: "16px",
          left: "16px",
          zIndex: 10,
          backgroundColor: "rgba(15, 23, 42, 0.7)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          borderRadius: "8px",
          padding: "8px 12px",
          fontSize: "10px",
          color: "#9ca3af",
          pointerEvents: "none",
          userSelect: "none",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          fontFamily: "'Outfit', 'Inter', sans-serif"
        }}
      >
        <div>🖱 <b>Left Click + Drag:</b> Rotate Scene</div>
        <div>🖱 <b>Right Click + Drag:</b> Pan Camera</div>
        <div>🖱 <b>Scroll Wheel:</b> Zoom In / Out</div>
      </div>
    </div>
  );
}
