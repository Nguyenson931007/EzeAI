"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cutWallsByDoors, getDoorCenterline } from "@/utils/geometry";

export default function ThreeDView({
  rooms = [],
  walls = [],
  doors = [],
  onClose,
  realScale = 1.0,
  image = null,
  imgSize = { w: 800, h: 600 }
}) {
  const containerRef = useRef(null);
  const [wallHeight, setWallHeight] = useState(150);
  const [showFloors, setShowFloors] = useState(true);
  const [showDoors, setShowDoors] = useState(true);
  const [showPDF, setShowPDF] = useState(true);
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

    if (minX === Infinity) return new THREE.Vector3(0, 0, 0);
    const midX = (minX + maxX) / 2;
    const midZ = (minY + maxY) / 2;
    return new THREE.Vector3(midX - imgSize.w / 2, 0, midZ - imgSize.h / 2);
  }, [walls, rooms, imgSize]);

  // Utility to extract door properties using getDoorCenterline
  const getDoorProps = (door) => {
    const centerline = getDoorCenterline(door, walls);
    const p1 = centerline.p1;
    const p2 = centerline.p2;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85); // Increased ambient light from 0.55
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1); // Increased directional light from 0.75
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

    // Opposite directional fill light to soften dark areas and shadows
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(center.x - 400, 600, center.z + 300);
    scene.add(fillLight);

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

    // Read default height from localStorage or project config
    const storedDefaultHeight = (typeof window !== "undefined") ? (localStorage.getItem("ezefloor_default_height") || "2400") : "2400";
    const defaultHeightMm = Number(storedDefaultHeight);
    const defaultHeightPx = (realScale && realScale > 0) ? (defaultHeightMm / realScale) : 150;

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
        mesh.position.set(-imgSize.w / 2, -0.5, -imgSize.h / 2); // Center floors on grid helper
        mesh.receiveShadow = enableShadows;
        scene.add(mesh);
        floorMeshesRef.current.push(mesh);
      });
    }

    // --- 1b. RENDER PDF UNDERLAY ---
    if (showPDF && image) {
      const loader = new THREE.TextureLoader();
      const texture = loader.load(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.flipY = false; // Disable default vertical flip to match SVG canvas coordinates exactly
      
      const planeGeo = new THREE.PlaneGeometry(imgSize.w, imgSize.h);
      const planeMat = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65
      });
      
      const planeMesh = new THREE.Mesh(planeGeo, planeMat);
      planeMesh.rotation.x = Math.PI / 2;
      planeMesh.position.set(0, -1.5, 0); // Center PDF on the grid
      
      scene.add(planeMesh);
      floorMeshesRef.current.push(planeMesh);
    }

    // --- 2. RENDER WALLS ---
    const cutWalls = cutWallsByDoors(walls, doors, realScale, true);
    cutWalls.forEach(wall => {
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

      // Convert mm to pixels. Fallback to default height.
      let activeWallHeight = defaultHeightPx;
      if (wall.height && realScale) {
        activeWallHeight = wall.height / realScale;
      }

      const color = wall.class_name === "exterior_wall" ? 0x64748b : 0x94a3b8;
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.75,
        metalness: 0.15
      });

      const poly = wall.polygon;
      if (poly && poly.length >= 3) {
        // Render exact 3D wall using its 2D polygon representation to eliminate corner gaps
        const shape = new THREE.Shape();
        shape.moveTo(poly[0][0], poly[0][1]);
        for (let i = 1; i < poly.length; i++) {
          shape.lineTo(poly[i][0], poly[i][1]);
        }
        shape.closePath();

        const extrudeSettings = { depth: activeWallHeight, bevelEnabled: false };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = Math.PI / 2; // Lie flat on X-Z plane
        mesh.position.set(-imgSize.w / 2, activeWallHeight, -imgSize.h / 2); // Align with extrusion direction
        mesh.castShadow = enableShadows;
        mesh.receiveShadow = enableShadows;

        scene.add(mesh);
        wallMeshesRef.current.push(mesh);
      } else {
        // Fallback to BoxGeometry
        const geometry = new THREE.BoxGeometry(length, activeWallHeight, thickness);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((x1 + x2) / 2 - imgSize.w / 2, activeWallHeight / 2, (y1 + y2) / 2 - imgSize.h / 2); // Center walls on grid
        mesh.rotation.y = -angle;
        mesh.castShadow = enableShadows;
        mesh.receiveShadow = enableShadows;

        scene.add(mesh);
        wallMeshesRef.current.push(mesh);
      }
    });

    if (showDoors) {
      doors.forEach(door => {
        const { cx, cy, length, angle, thickness } = getDoorProps(door);
        
        let wallThickness = thickness;
        let hostWallAngle = angle;
        let hostWallCx = cx;
        let hostWallCy = cy;
        let hostWallClass = "interior_wall";
        let hostWallHeightPx = defaultHeightPx;

        // Find closest wall for thickness, class_name (to match color/material) and cut endpoints
        const points = door.points || [];
        let p1 = points[0] ? (Array.isArray(points[0]) ? { x: points[0][0], y: points[0][1] } : points[0]) : null;
        let p2 = points[1] ? (Array.isArray(points[1]) ? { x: points[1][0], y: points[1][1] } : points[1]) : null;
        
        const jambOffsetMm = 150;
        const halfJamb = (realScale && realScale > 0) ? (jambOffsetMm / realScale) : 10.0;
        let leftJambMesh = null;
        let rightJambMesh = null;

        if (p1 && p2) {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dLen = Math.sqrt(dx * dx + dy * dy);
          if (dLen > 0) {
            const ux = dx / dLen;
            const uy = dy / dLen;

            let nearestWall = null;
            let minPerpDist = Infinity;

            if (walls && walls.length > 0) {
              walls.forEach(w => {
                if (!w.centerline || w.centerline.length < 2) return;
                const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
                const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };
                
                const cxSeg = (p1.x + p2.x) / 2;
                const cySeg = (p1.y + p2.y) / 2;
                const wdx = wp2.x - wp1.x;
                const wdy = wp2.y - wp1.y;
                const L2 = wdx * wdx + wdy * wdy;
                if (L2 < 0.1) return;

                const perpDist = Math.abs(wdx * (cySeg - wp1.y) - wdy * (cxSeg - wp1.x)) / Math.sqrt(L2);
                const tVal = ((cxSeg - wp1.x) * wdx + (cySeg - wp1.y) * wdy) / L2;

                if (perpDist < 50 && tVal >= -0.5 && tVal <= 1.5) {
                  if (perpDist < minPerpDist) {
                    minPerpDist = perpDist;
                    nearestWall = w;
                  }
                }
              });
            }

            if (nearestWall) {
              wallThickness = nearestWall.thickness_px || thickness;
              hostWallClass = nearestWall.class_name || "interior_wall";
              const wHeight = nearestWall.height || defaultHeightMm;
              if (realScale) {
                hostWallHeightPx = wHeight / realScale;
              }

              const wp1 = { x: nearestWall.centerline[0][0], y: nearestWall.centerline[0][1] };
              const wp2 = { x: nearestWall.centerline[1][0], y: nearestWall.centerline[1][1] };
              const wdx = wp2.x - wp1.x;
              const wdy = wp2.y - wp1.y;
              const wLen = Math.hypot(wdx, wdy);

              if (wLen > 0.1) {
                const wAngle = Math.atan2(wdy, wdx);
                const dot = Math.cos(angle) * Math.cos(wAngle) + Math.sin(angle) * Math.sin(wAngle);
                hostWallAngle = dot >= 0 ? wAngle : wAngle + Math.PI;

                const uxW = wdx / wLen;
                const uyW = wdy / wLen;
                const tProj = (cx - wp1.x) * uxW + (cy - wp1.y) * uyW;
                hostWallCx = wp1.x + tProj * uxW;
                hostWallCy = wp1.y + tProj * uyW;

                const wallColor = hostWallClass === "exterior_wall" ? 0x64748b : 0x94a3b8;
                const fillerMat = new THREE.MeshStandardMaterial({
                  color: wallColor,
                  roughness: 0.75,
                  metalness: 0.15
                });

                [wp1, wp2].forEach(pt => {
                  const dxPt1 = pt.x - p1.x;
                  const dyPt1 = pt.y - p1.y;
                  const t1 = dxPt1 * ux + dyPt1 * uy;
                  const projX1 = p1.x + t1 * ux;
                  const projY1 = p1.y + t1 * uy;
                  const distToP1 = Math.hypot(pt.x - projX1, pt.y - projY1);

                  if (distToP1 < 12.0 && t1 < 0 && t1 >= -halfJamb * 3) {
                    const tGap = (p1.x - pt.x) * uxW + (p1.y - pt.y) * uyW;
                    const gapLen = Math.abs(tGap);
                    if (gapLen > 0.1) {
                      const fillerGeo = new THREE.BoxGeometry(gapLen, hostWallHeightPx, wallThickness);
                      leftJambMesh = new THREE.Mesh(fillerGeo, fillerMat);
                      leftJambMesh.position.set(pt.x + (tGap / 2) * uxW - imgSize.w / 2, hostWallHeightPx / 2, pt.y + (tGap / 2) * uyW - imgSize.h / 2);
                      leftJambMesh.rotation.y = -wAngle;
                      leftJambMesh.castShadow = enableShadows;
                      leftJambMesh.receiveShadow = enableShadows;
                    }
                  }

                  const dxPt2 = pt.x - p2.x;
                  const dyPt2 = pt.y - p2.y;
                  const t2 = dxPt2 * ux + dyPt2 * uy;
                  const projX2 = p2.x + t2 * ux;
                  const projY2 = p2.y + t2 * uy;
                  const distToP2 = Math.hypot(pt.x - projX2, pt.y - projY2);

                  if (distToP2 < 12.0 && t2 > 0 && t2 <= halfJamb * 3) {
                    const tGap = (p2.x - pt.x) * uxW + (p2.y - pt.y) * uyW;
                    const gapLen = Math.abs(tGap);
                    if (gapLen > 0.1) {
                      const fillerGeo = new THREE.BoxGeometry(gapLen, hostWallHeightPx, wallThickness);
                      rightJambMesh = new THREE.Mesh(fillerGeo, fillerMat);
                      rightJambMesh.position.set(pt.x + (tGap / 2) * uxW - imgSize.w / 2, hostWallHeightPx / 2, pt.y + (tGap / 2) * uyW - imgSize.h / 2);
                      rightJambMesh.rotation.y = -wAngle;
                      rightJambMesh.castShadow = enableShadows;
                      rightJambMesh.receiveShadow = enableShadows;
                    }
                  }
                });
              }
            }
          }
        }

        // Group to manage the frame and slab together
        const doorGroup = new THREE.Group();
        const frameHeight = hostWallHeightPx * 0.85; // Doors are slightly shorter than walls
        const frameDepth = wallThickness + 4; // Frame depth matches wall thickness + 4px for lintel/trim

        // Frame post materials (wood style)
        const frameMat = new THREE.MeshStandardMaterial({
          color: 0x27160c, // Dark chocolate brown frame
          roughness: 0.7,
          metalness: 0.1
        });
        
        const slabMat = new THREE.MeshStandardMaterial({
          color: 0x5c3a21, // Warm teak brown door panel
          roughness: 0.5,
          metalness: 0.05
        });

        const glassMat = new THREE.MeshStandardMaterial({
          color: 0xa5f3fc, // Cyan/sky tint
          roughness: 0.1,
          metalness: 0.9,
          opacity: 0.35,
          transparent: true
        });

        const handleMat = new THREE.MeshStandardMaterial({
          color: 0xd4af37, // Gold brass handles
          roughness: 0.2,
          metalness: 0.8
        });

        // Frame posts (Left, Right, Top)
        const postThickness = 5;
        
        // Left Frame Post
        const leftPostGeo = new THREE.BoxGeometry(postThickness, frameHeight, frameDepth);
        const leftPost = new THREE.Mesh(leftPostGeo, frameMat);
        leftPost.position.set(-length / 2 + postThickness / 2, frameHeight / 2, 0);
        leftPost.castShadow = enableShadows;
        leftPost.receiveShadow = enableShadows;
        doorGroup.add(leftPost);

        // Right Frame Post
        const rightPostGeo = new THREE.BoxGeometry(postThickness, frameHeight, frameDepth);
        const rightPost = new THREE.Mesh(rightPostGeo, frameMat);
        rightPost.position.set(length / 2 - postThickness / 2, frameHeight / 2, 0);
        rightPost.castShadow = enableShadows;
        rightPost.receiveShadow = enableShadows;
        doorGroup.add(rightPost);

        // Top Frame Header
        const headerGeo = new THREE.BoxGeometry(length, postThickness, frameDepth);
        const header = new THREE.Mesh(headerGeo, frameMat);
        header.position.set(0, frameHeight - postThickness / 2, 0);
        header.castShadow = enableShadows;
        header.receiveShadow = enableShadows;
        doorGroup.add(header);

        // Door Classes:
        const dClass = door.class || "";
        const isSliding = dClass.includes("sliding") || dClass.includes("slider");
        const isBifold = dClass.includes("bifold");
        const isDouble = dClass.includes("double") || (door.door_name && door.door_name.toLowerCase().includes("2x"));
        const isGarage = dClass.includes("garage");

        // Helper to add handles
        const addHandleToPanel = (group, posX, posY, posZ, isLever = true) => {
          const handleGroup = new THREE.Group();
          handleGroup.position.set(posX, posY, posZ);

          // Handle base plate
          const plateGeo = new THREE.BoxGeometry(1.2, 5, 0.4);
          const plate = new THREE.Mesh(plateGeo, handleMat);
          handleGroup.add(plate);

          if (isLever) {
            // Latch cylinder sticking out in Z
            const neckGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 8);
            const neck = new THREE.Mesh(neckGeo, handleMat);
            neck.rotation.x = Math.PI / 2;
            neck.position.set(0, 0, 0.7);
            handleGroup.add(neck);

            // Handle bar pointing horizontally
            const barGeo = new THREE.BoxGeometry(3.5, 0.6, 0.4);
            const bar = new THREE.Mesh(barGeo, handleMat);
            bar.position.set(1.5, 0, 1.4);
            handleGroup.add(bar);
          } else {
            // Pull knob
            const knobGeo = new THREE.CylinderGeometry(1, 1, 1.2, 12);
            const knob = new THREE.Mesh(knobGeo, handleMat);
            knob.rotation.x = Math.PI / 2;
            knob.position.set(0, 0, 0.8);
            handleGroup.add(knob);
          }
          group.add(handleGroup);
        };

        const slabHeight = frameHeight - postThickness - 2;

        if (isGarage) {
          // Render Garage Door Panel: Large sectional panel with horizontal slots
          const pWidth = length - postThickness * 2 - 2;
          const sectionGroup = new THREE.Group();
          sectionGroup.position.set(0, slabHeight / 2, 0);

          const mainPanelGeo = new THREE.BoxGeometry(pWidth, slabHeight, 4);
          const mainPanel = new THREE.Mesh(mainPanelGeo, slabMat);
          mainPanel.castShadow = enableShadows;
          mainPanel.receiveShadow = enableShadows;
          sectionGroup.add(mainPanel);

          // Horizontal grid grooves
          const grooveColor = 0x1a0f0a;
          const grooveMat = new THREE.MeshStandardMaterial({ color: grooveColor, roughness: 0.8 });
          for (let yOffset = -slabHeight/2 + slabHeight/4; yOffset < slabHeight/2; yOffset += slabHeight/4) {
            const grooveGeo = new THREE.BoxGeometry(pWidth - 10, 1, 4.2);
            const groove = new THREE.Mesh(grooveGeo, grooveMat);
            groove.position.set(0, yOffset, 0);
            sectionGroup.add(groove);
          }
          doorGroup.add(sectionGroup);

        } else if (isSliding) {
          // Sliding Door: Two panels overlapping
          const pWidth = (length - postThickness * 2) / 2 + 5;
          const slabThick = 3;

          // Panel 1 (Fixed) - offset back in Z, aligned to right
          const fixedGroup = new THREE.Group();
          fixedGroup.position.set(length/4 - postThickness/2, slabHeight / 2, -2);
          
          // Framed glass structure
          const borderThick = 6;
          // Left border
          const b1 = new THREE.Mesh(new THREE.BoxGeometry(borderThick, slabHeight, slabThick), slabMat);
          b1.position.set(-pWidth/2 + borderThick/2, 0, 0);
          fixedGroup.add(b1);
          // Right border
          const b2 = new THREE.Mesh(new THREE.BoxGeometry(borderThick, slabHeight, slabThick), slabMat);
          b2.position.set(pWidth/2 - borderThick/2, 0, 0);
          fixedGroup.add(b2);
          // Top border
          const b3 = new THREE.Mesh(new THREE.BoxGeometry(pWidth, borderThick, slabThick), slabMat);
          b3.position.set(0, slabHeight/2 - borderThick/2, 0);
          fixedGroup.add(b3);
          // Bottom border
          const b4 = new THREE.Mesh(new THREE.BoxGeometry(pWidth, borderThick, slabThick), slabMat);
          b4.position.set(0, -slabHeight/2 + borderThick/2, 0);
          fixedGroup.add(b4);
          // Center glass
          const glassGeo = new THREE.BoxGeometry(pWidth - borderThick*2, slabHeight - borderThick*2, 1);
          const glass = new THREE.Mesh(glassGeo, glassMat);
          fixedGroup.add(glass);
          doorGroup.add(fixedGroup);

          // Panel 2 (Slidable - offset forward in Z, slid open slightly)
          const activeGroup = new THREE.Group();
          // Slid open by 30% of panel width
          const slideOffset = pWidth * 0.4;
          activeGroup.position.set(-length/4 + postThickness/2 + slideOffset, slabHeight / 2, 2);

          // Left border
          const ab1 = new THREE.Mesh(new THREE.BoxGeometry(borderThick, slabHeight, slabThick), slabMat);
          ab1.position.set(-pWidth/2 + borderThick/2, 0, 0);
          activeGroup.add(ab1);
          // Right border
          const ab2 = new THREE.Mesh(new THREE.BoxGeometry(borderThick, slabHeight, slabThick), slabMat);
          ab2.position.set(pWidth/2 - borderThick/2, 0, 0);
          activeGroup.add(ab2);
          // Top border
          const ab3 = new THREE.Mesh(new THREE.BoxGeometry(pWidth, borderThick, slabThick), slabMat);
          ab3.position.set(0, slabHeight/2 - borderThick/2, 0);
          activeGroup.add(ab3);
          // Bottom border
          const ab4 = new THREE.Mesh(new THREE.BoxGeometry(pWidth, borderThick, slabThick), slabMat);
          ab4.position.set(0, -slabHeight/2 + borderThick/2, 0);
          activeGroup.add(ab4);
          // Center glass
          const aglass = new THREE.Mesh(glassGeo, glassMat);
          activeGroup.add(aglass);

          // Add a sliding handle (pull knob style) on active panel
          addHandleToPanel(activeGroup, pWidth/2 - borderThick - 4, 0, slabThick/2, false);
          addHandleToPanel(activeGroup, pWidth/2 - borderThick - 4, 0, -slabThick/2, false);

          doorGroup.add(activeGroup);

        } else if (isBifold) {
          // Bifold Door: 4 folding panels
          const panelCount = 4;
          const pWidth = (length - postThickness * 2 - 4) / panelCount;
          const slabThick = 3;
          const borderThick = 5;

          // Pivot Group for accordion folding
          const bifoldContainer = new THREE.Group();
          bifoldContainer.position.set(-length/2 + postThickness + 1, slabHeight/2, 0);

          // We model a V-shape fold for 4 panels
          // Fold Angle: e.g. 45 degrees
          const foldAngle = Math.PI / 4; 

          // Panel 1: Swings from left hinge
          const p1Group = new THREE.Group();
          p1Group.rotation.y = foldAngle;
          
          const p1Mesh = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
          p1Mesh.position.set(pWidth/2, 0, 0);
          p1Group.add(p1Mesh);

          // Panel 2: Hinged on panel 1 tip, folds back
          const p2Group = new THREE.Group();
          p2Group.position.set(pWidth, 0, 0);
          p2Group.rotation.y = -foldAngle * 2;

          const p2Mesh = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
          p2Mesh.position.set(pWidth/2, 0, 0);
          p2Group.add(p2Mesh);
          p1Group.add(p2Group);

          // Panel 3: Hinged on panel 2 tip, folds forward
          const p3Group = new THREE.Group();
          p3Group.position.set(pWidth, 0, 0);
          p3Group.rotation.y = foldAngle * 2;

          const p3Mesh = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
          p3Mesh.position.set(pWidth/2, 0, 0);
          p3Group.add(p3Mesh);
          p2Group.add(p3Group);

          // Panel 4: Hinged on panel 3 tip, folds back
          const p4Group = new THREE.Group();
          p4Group.position.set(pWidth, 0, 0);
          p4Group.rotation.y = -foldAngle * 2;

          const p4Mesh = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
          p4Mesh.position.set(pWidth/2, 0, 0);
          p4Group.add(p4Mesh);
          p3Group.add(p4Group);

          bifoldContainer.add(p1Group);
          doorGroup.add(bifoldContainer);

        } else if (isDouble) {
          // Double Door: Two symmetrically opening panels
          const pWidth = (length - postThickness * 2 - 4) / 2;
          const slabThick = 4;
          
          // Left Pivot Group
          const leftPivot = new THREE.Group();
          leftPivot.position.set(-length/2 + postThickness, slabHeight / 2, 0);
          
          const leftPanelGroup = new THREE.Group();
          // Frame + recessed panels
          const leftSlab = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
          leftSlab.position.set(pWidth/2, 0, 0);
          leftPanelGroup.add(leftSlab);

          // Recessed panels detailing (2 rectangular border frames)
          const detailMat = new THREE.MeshStandardMaterial({ color: 0x482d19, roughness: 0.6 });
          const detailGeo = new THREE.BoxGeometry(pWidth - 10, slabHeight/2 - 10, 0.6);
          const topDetail = new THREE.Mesh(detailGeo, detailMat);
          topDetail.position.set(pWidth/2, slabHeight/4, slabThick/2 + 0.1);
          const bottomDetail = new THREE.Mesh(detailGeo, detailMat);
          bottomDetail.position.set(pWidth/2, -slabHeight/4, slabThick/2 + 0.1);
          leftPanelGroup.add(topDetail);
          leftPanelGroup.add(bottomDetail);

          // Mirror on the back
          const topDetailB = new THREE.Mesh(detailGeo, detailMat);
          topDetailB.position.set(pWidth/2, slabHeight/4, -slabThick/2 - 0.1);
          const bottomDetailB = new THREE.Mesh(detailGeo, detailMat);
          bottomDetailB.position.set(pWidth/2, -slabHeight/4, -slabThick/2 - 0.1);
          leftPanelGroup.add(topDetailB);
          leftPanelGroup.add(bottomDetailB);

          // Handle (lever style)
          addHandleToPanel(leftPanelGroup, pWidth - 6, 0, slabThick/2, true);
          addHandleToPanel(leftPanelGroup, pWidth - 6, 0, -slabThick/2, true);

          leftPivot.add(leftPanelGroup);
          leftPivot.rotation.y = Math.PI / 4; // Open at 45°
          doorGroup.add(leftPivot);

          // Right Pivot Group
          const rightPivot = new THREE.Group();
          rightPivot.position.set(length/2 - postThickness, slabHeight / 2, 0);
          
          const rightPanelGroup = new THREE.Group();
          const rightSlab = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
          rightSlab.position.set(-pWidth/2, 0, 0);
          rightPanelGroup.add(rightSlab);

          // Recessed panels detailing
          const topDetailR = new THREE.Mesh(detailGeo, detailMat);
          topDetailR.position.set(-pWidth/2, slabHeight/4, slabThick/2 + 0.1);
          const bottomDetailR = new THREE.Mesh(detailGeo, detailMat);
          bottomDetailR.position.set(-pWidth/2, -slabHeight/4, slabThick/2 + 0.1);
          rightPanelGroup.add(topDetailR);
          rightPanelGroup.add(bottomDetailR);

          const topDetailRB = new THREE.Mesh(detailGeo, detailMat);
          topDetailRB.position.set(-pWidth/2, slabHeight/4, -slabThick/2 - 0.1);
          const bottomDetailRB = new THREE.Mesh(detailGeo, detailMat);
          bottomDetailRB.position.set(-pWidth/2, -slabHeight/4, -slabThick/2 - 0.1);
          rightPanelGroup.add(topDetailRB);
          rightPanelGroup.add(bottomDetailRB);

          // Handle (lever style)
          addHandleToPanel(rightPanelGroup, -pWidth + 6, 0, slabThick/2, true);
          addHandleToPanel(rightPanelGroup, -pWidth + 6, 0, -slabThick/2, true);

          rightPivot.add(rightPanelGroup);
          rightPivot.rotation.y = -Math.PI / 4; // Open at 45°
          doorGroup.add(rightPivot);

        } else {
          // Single Swing Door
          const hingeSide = door.hingeSide || door.hinge_side || "left";
          const swing = door.swing || door.swing_direction || "inward";
          const angleVal = door.angle || door.opening_angle || 35; // default 35 for visualization

          const isRightHinge = hingeSide === "right";
          const isInward = swing === "inward";
          const hingeFactor = isRightHinge ? -1 : 1;
          const sideFactor = isInward ? 1 : -1;
          const openAngleRad = (angleVal * Math.PI) / 180;

          const pWidth = length - postThickness * 2 - 2;
          const slabThick = 4;

          const pivotGroup = new THREE.Group();
          if (isRightHinge) {
            pivotGroup.position.set(length / 2 - postThickness, slabHeight / 2, 0);
          } else {
            pivotGroup.position.set(-length / 2 + postThickness, slabHeight / 2, 0);
          }

          const dxSlab = isRightHinge ? -pWidth / 2 : pWidth / 2;
          const dxHandle = isRightHinge ? -pWidth + 8 : pWidth - 8;

          const panelGroup = new THREE.Group();
          const slab = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
          slab.position.set(dxSlab, 0, 0);
          slab.castShadow = enableShadows;
          slab.receiveShadow = enableShadows;
          panelGroup.add(slab);

          // Recessed detail panels
          const detailMat = new THREE.MeshStandardMaterial({ color: 0x482d19, roughness: 0.6 });
          const detailGeo = new THREE.BoxGeometry(pWidth - 12, slabHeight/2 - 12, 0.6);
          const topDetail = new THREE.Mesh(detailGeo, detailMat);
          topDetail.position.set(dxSlab, slabHeight/4, slabThick/2 + 0.1);
          const bottomDetail = new THREE.Mesh(detailGeo, detailMat);
          bottomDetail.position.set(dxSlab, -slabHeight/4, slabThick/2 + 0.1);
          panelGroup.add(topDetail);
          panelGroup.add(bottomDetail);

          const topDetailB = new THREE.Mesh(detailGeo, detailMat);
          topDetailB.position.set(dxSlab, slabHeight/4, -slabThick/2 - 0.1);
          const bottomDetailB = new THREE.Mesh(detailGeo, detailMat);
          bottomDetailB.position.set(dxSlab, -slabHeight/4, -slabThick/2 - 0.1);
          panelGroup.add(topDetailB);
          panelGroup.add(bottomDetailB);

          // Handle (lever style)
          addHandleToPanel(panelGroup, dxHandle, 0, slabThick/2, true);
          addHandleToPanel(panelGroup, dxHandle, 0, -slabThick/2, true);

          pivotGroup.add(panelGroup);

          // Swing open dynamically based on 2D properties
          pivotGroup.rotation.y = hingeFactor * sideFactor * openAngleRad;
          doorGroup.add(pivotGroup);
        }

        // --- 3D WALL FILLER BLOCK (Header above the door) ---
        const wallColor = hostWallClass === "exterior_wall" ? 0x64748b : 0x94a3b8;
        const fillerMat = new THREE.MeshStandardMaterial({
          color: wallColor,
          roughness: 0.75,
          metalness: 0.15
        });

        // 1. Header filler block (above the door frame)
        const headerHeight = Math.max(0, hostWallHeightPx - frameHeight);
        if (headerHeight > 0.1) {
          const headerGeo = new THREE.BoxGeometry(length, headerHeight, wallThickness);
          const headerMesh = new THREE.Mesh(headerGeo, fillerMat);
          headerMesh.position.set(0, frameHeight + headerHeight / 2, 0);
          headerMesh.castShadow = enableShadows;
          headerMesh.receiveShadow = enableShadows;
          doorGroup.add(headerMesh);
        }

        // Add side jambs directly to scene
        if (leftJambMesh) {
          scene.add(leftJambMesh);
          doorMeshesRef.current.push(leftJambMesh);
        }
        if (rightJambMesh) {
          scene.add(rightJambMesh);
          doorMeshesRef.current.push(rightJambMesh);
        }

        doorGroup.position.set(hostWallCx - imgSize.w / 2, 0, hostWallCy - imgSize.h / 2);
        doorGroup.rotation.y = -hostWallAngle;

        scene.add(doorGroup);
        doorMeshesRef.current.push(doorGroup);
      });
    }

  }, [rooms, walls, doors, wallHeight, showFloors, showDoors, showPDF, enableShadows, realScale, image, imgSize]);

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
            <span>Show PDF Underlay</span>
            <input 
              type="checkbox" 
              checked={showPDF} 
              onChange={() => setShowPDF(v => !v)}
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
