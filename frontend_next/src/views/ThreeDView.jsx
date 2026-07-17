"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cutWallsByDoors, getDoorCenterline, mapFloorName } from "@/utils/geometry";

export default function ThreeDView({
  pages = [],
  wallsByPage = {},
  doorsByPage = {},
  roomsByPage = {},
  roofsByPage = {},
  currentPage = 0,
  onClose,
  realScale = 1.0,
  image = null,
  imgSize = { w: 800, h: 600 }
}) {
  const containerRef = useRef(null);
  const [wallHeight, setWallHeight] = useState(150);
  const [showFloors, setShowFloors] = useState(true);
  const [showDoors, setShowDoors] = useState(true);
  const [showRoofs, setShowRoofs] = useState(true);
  const [showPDF, setShowPDF] = useState(true);
  const [enableShadows, setEnableShadows] = useState(true);
  const [visibleLevels, setVisibleLevels] = useState({});
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  
  // Store generated 3D meshes to dynamically update them (e.g. wall height)
  const wallMeshesRef = useRef([]);
  const floorMeshesRef = useRef([]);
  const doorMeshesRef = useRef([]);

  // Initialize visibleLevels
  useEffect(() => {
    const initial = {};
    pages.forEach((_, i) => {
      initial[i] = true;
    });
    setVisibleLevels(initial);
  }, [pages]);

  const getFloorLevel = (page, index) => {
    if (!page || !page.floor_name) return index;
    const norm = page.floor_name.toLowerCase().trim().replace(/[\s_]+/g, '_');
    if (norm === 'first_floor' || norm === 'ground_floor' || norm === 'floor_0') return 0;
    if (norm === 'upper_floor' || norm === 'second_floor' || norm === 'floor_1') return 1;
    if (norm === 'third_floor' || norm === 'floor_2') return 2;
    if (norm === 'fourth_floor' || norm === 'floor_3') return 3;
    if (norm === 'fifth_floor' || norm === 'floor_4') return 4;
    if (norm === 'roof') return 999;
    
    const match = norm.match(/^floor_(\d+)$/);
    if (match) return parseInt(match[1]);
    
    return index;
  };

  const sortedPageIndices = React.useMemo(() => {
    return pages
      .map((p, i) => ({ page: p, originalIndex: i, level: getFloorLevel(p, i) }))
      .sort((a, b) => a.level - b.level)
      .map(x => x.originalIndex);
  }, [pages]);

  // Calculate center of the floor plan for OrbitControls target
  const center = React.useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    pages.forEach((_, i) => {
      const walls = wallsByPage[i] || [];
      const rooms = roomsByPage[i] || [];
      
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
    });

    if (minX === Infinity) {
      return new THREE.Vector3(0, 0, 0);
    }

    const midX = (minX + maxX) / 2;
    const midZ = (minY + maxY) / 2;
    const midY = (pages.length * wallHeight) / 4;
    return new THREE.Vector3(midX - imgSize.w / 2, midY, midZ - imgSize.h / 2);
  }, [pages, wallsByPage, roomsByPage, wallHeight, imgSize]);

  // Utility to extract door properties using getDoorCenterline
  const getDoorProps = (door, pageWalls = []) => {
    const centerline = getDoorCenterline(door, pageWalls);
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

    // Loop through each page sorted by its level
    sortedPageIndices.forEach((originalIndex, k) => {
      // Check if this level is visible
      if (visibleLevels[originalIndex] === false) return;

      const page = pages[originalIndex];
      const pageWalls = wallsByPage[originalIndex] || [];
      const pageDoors = doorsByPage[originalIndex] || [];
      const pageRooms = roomsByPage[originalIndex] || [];
      
      const yOffset = k * wallHeight;

      // --- 1. RENDER ROOMS (FLOORS) ---
      if (showFloors) {
        pageRooms.forEach(room => {
          const poly = room.polygon;
          if (!poly || poly.length < 3) return;

          const shape = new THREE.Shape();
          shape.moveTo(poly[0].x, poly[0].y);
          for (let i = 1; i < poly.length; i++) {
            shape.lineTo(poly[i].x, poly[i].y);
          }
          shape.closePath();

          // Color theme based on room type
          let color = 0x475569;
          const rType = (room.type || "").toLowerCase();
          const rName = (room.room_name || "").toLowerCase();

          if (rType === "wet" || /(bath|wc|toilet|ensuite|powder|laundry|shower)/i.test(rName)) {
            color = 0x1e3a8a;
          } else if (rType === "dry" || /(bed|living|kitchen|dining|office|study|entry|hall)/i.test(rName)) {
            color = 0x7c2d12;
            if (/(bed|bedroom|study|office)/i.test(rName)) {
              color = 0x334155;
            }
          } else if (rType === "timber_deck") {
            color = 0x451a03;
          } else if (rType === "tile_deck" || /(balcony|deck|alfresco)/i.test(rName)) {
            color = 0x3f3f46;
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
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(-imgSize.w / 2, yOffset - 0.5, -imgSize.h / 2);
          mesh.receiveShadow = enableShadows;
          scene.add(mesh);
          floorMeshesRef.current.push(mesh);
        });
      }

      // --- 1b. RENDER PDF UNDERLAY (Only for level 0) ---
      if (showPDF && page.image && k === 0) {
        const loader = new THREE.TextureLoader();
        const texture = loader.load(page.image);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.flipY = false;
        
        const planeGeo = new THREE.PlaneGeometry(imgSize.w, imgSize.h);
        const planeMat = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65
        });
        
        const planeMesh = new THREE.Mesh(planeGeo, planeMat);
        planeMesh.rotation.x = Math.PI / 2;
        planeMesh.position.set(0, -1.5, 0);
        
        scene.add(planeMesh);
        floorMeshesRef.current.push(planeMesh);
      }

      // --- 2. RENDER WALLS ---
      const cutWalls = cutWallsByDoors(pageWalls, pageDoors, realScale, true);
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

        let activeWallHeight = wallHeight; // Scale to height slider

        const color = wall.class_name === "exterior_wall" ? 0x64748b : 0x94a3b8;
        const material = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.75,
          metalness: 0.15
        });

        const poly = wall.polygon;
        if (poly && poly.length >= 3) {
          const shape = new THREE.Shape();
          shape.moveTo(poly[0][0], poly[0][1]);
          for (let i = 1; i < poly.length; i++) {
            shape.lineTo(poly[i][0], poly[i][1]);
          }
          shape.closePath();

          const extrudeSettings = { depth: activeWallHeight, bevelEnabled: false };
          const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

          const mesh = new THREE.Mesh(geometry, material);
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(-imgSize.w / 2, yOffset + activeWallHeight, -imgSize.h / 2);
          mesh.castShadow = enableShadows;
          mesh.receiveShadow = enableShadows;

          scene.add(mesh);
          wallMeshesRef.current.push(mesh);
        } else {
          const geometry = new THREE.BoxGeometry(length, activeWallHeight, thickness);
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set((x1 + x2) / 2 - imgSize.w / 2, yOffset + activeWallHeight / 2, (y1 + y2) / 2 - imgSize.h / 2);
          mesh.rotation.y = -angle;
          mesh.castShadow = enableShadows;
          mesh.receiveShadow = enableShadows;

          scene.add(mesh);
          wallMeshesRef.current.push(mesh);
        }
      });

      // --- 3. RENDER DOORS ---
      if (showDoors) {
        pageDoors.forEach(door => {
          const { cx, cy, length, angle, thickness } = getDoorProps(door, pageWalls);
          
          let wallThickness = thickness;
          let hostWallAngle = angle;
          let hostWallCx = cx;
          let hostWallCy = cy;
          let hostWallClass = "interior_wall";
          let hostWallHeightPx = wallHeight;

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

              if (pageWalls && pageWalls.length > 0) {
                pageWalls.forEach(w => {
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
                hostWallHeightPx = wallHeight;

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
                        leftJambMesh.position.set(pt.x + (tGap / 2) * uxW - imgSize.w / 2, yOffset + hostWallHeightPx / 2, pt.y + (tGap / 2) * uyW - imgSize.h / 2);
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
                      const tGap = (pt.x - p2.x) * uxW + (pt.y - p2.y) * uyW;
                      const gapLen = Math.abs(tGap);
                      if (gapLen > 0.1) {
                        const fillerGeo = new THREE.BoxGeometry(gapLen, hostWallHeightPx, wallThickness);
                        rightJambMesh = new THREE.Mesh(fillerGeo, fillerMat);
                        rightJambMesh.position.set(p2.x + (tGap / 2) * uxW - imgSize.w / 2, yOffset + hostWallHeightPx / 2, p2.y + (tGap / 2) * uyW - imgSize.h / 2);
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

          const doorGroup = new THREE.Group();
          const dClass = door.class || "";
          const isWindow = dClass.includes("window") || (door.door_name && door.door_name.toLowerCase().includes("window")) || door.doorTypeId === "win_standard";

          if (isWindow) {
            const sillHeight = hostWallHeightPx * 0.375;
            const headerHeight = hostWallHeightPx * 0.875;
            const windowHeight = headerHeight - sillHeight;
            
            const wallColor = hostWallClass === "exterior_wall" ? 0x64748b : 0x94a3b8;
            const fillerMat = new THREE.MeshStandardMaterial({
              color: wallColor,
              roughness: 0.75,
              metalness: 0.15
            });

            // 1. Bottom Wall Filler
            if (sillHeight > 0.1) {
              const bottomWallGeo = new THREE.BoxGeometry(length, sillHeight, wallThickness);
              const bottomWallMesh = new THREE.Mesh(bottomWallGeo, fillerMat);
              bottomWallMesh.position.set(0, sillHeight / 2, 0);
              bottomWallMesh.castShadow = enableShadows;
              bottomWallMesh.receiveShadow = enableShadows;
              doorGroup.add(bottomWallMesh);
            }

            // 2. Top Wall Filler
            const topWallHeight = hostWallHeightPx - headerHeight;
            if (topWallHeight > 0.1) {
              const topWallGeo = new THREE.BoxGeometry(length, topWallHeight, wallThickness);
              const topWallMesh = new THREE.Mesh(topWallGeo, fillerMat);
              topWallMesh.position.set(0, headerHeight + topWallHeight / 2, 0);
              topWallMesh.castShadow = enableShadows;
              topWallMesh.receiveShadow = enableShadows;
              doorGroup.add(topWallMesh);
            }

            // 3. Window Frame
            const frameThickness = 2.5;
            const frameDepth = wallThickness + 2;
            const windowFrameMat = new THREE.MeshStandardMaterial({
              color: 0x334155, // anthracite dark gray
              roughness: 0.5,
              metalness: 0.8
            });

            // Left Post
            const leftPostGeo = new THREE.BoxGeometry(frameThickness, windowHeight, frameDepth);
            const leftPost = new THREE.Mesh(leftPostGeo, windowFrameMat);
            leftPost.position.set(-length/2 + frameThickness/2, sillHeight + windowHeight/2, 0);
            leftPost.castShadow = enableShadows;
            leftPost.receiveShadow = enableShadows;
            doorGroup.add(leftPost);

            // Right Post
            const rightPostGeo = new THREE.BoxGeometry(frameThickness, windowHeight, frameDepth);
            const rightPost = new THREE.Mesh(rightPostGeo, windowFrameMat);
            rightPost.position.set(length/2 - frameThickness/2, sillHeight + windowHeight/2, 0);
            rightPost.castShadow = enableShadows;
            rightPost.receiveShadow = enableShadows;
            doorGroup.add(rightPost);

            // Top Frame
            const topFrameGeo = new THREE.BoxGeometry(length, frameThickness, frameDepth);
            const topFrame = new THREE.Mesh(topFrameGeo, windowFrameMat);
            topFrame.position.set(0, headerHeight - frameThickness/2, 0);
            topFrame.castShadow = enableShadows;
            topFrame.receiveShadow = enableShadows;
            doorGroup.add(topFrame);

            // Bottom Frame
            const bottomFrameGeo = new THREE.BoxGeometry(length, frameThickness, frameDepth);
            const bottomFrame = new THREE.Mesh(bottomFrameGeo, windowFrameMat);
            bottomFrame.position.set(0, sillHeight + frameThickness/2, 0);
            bottomFrame.castShadow = enableShadows;
            bottomFrame.receiveShadow = enableShadows;
            doorGroup.add(bottomFrame);

            // 4. Glass Pane
            const glassGeo = new THREE.BoxGeometry(length - frameThickness * 2, windowHeight - frameThickness * 2, 1);
            const glassMat = new THREE.MeshPhysicalMaterial({
              color: 0xbae6fd, // cyan-200
              transparent: true,
              opacity: 0.4,
              roughness: 0.1,
              metalness: 0.9,
              transmission: 0.9,
              thickness: 1.0
            });
            const glassMesh = new THREE.Mesh(glassGeo, glassMat);
            glassMesh.position.set(0, sillHeight + windowHeight/2, 0);
            doorGroup.add(glassMesh);
          } else {
            const frameHeight = hostWallHeightPx * 0.85;

            const frameMat = new THREE.MeshStandardMaterial({
              color: 0x2e1a0c,
              roughness: 0.8,
              metalness: 0.1
            });

            const postThickness = 3;
            const frameDepth = wallThickness + 4;

            const leftPostGeo = new THREE.BoxGeometry(postThickness, frameHeight, frameDepth);
            const leftPost = new THREE.Mesh(leftPostGeo, frameMat);
            leftPost.position.set(-length/2, frameHeight/2, 0);
            leftPost.castShadow = enableShadows;
            leftPost.receiveShadow = enableShadows;
            doorGroup.add(leftPost);

            const rightPostGeo = new THREE.BoxGeometry(postThickness, frameHeight, frameDepth);
            const rightPost = new THREE.Mesh(rightPostGeo, frameMat);
            rightPost.position.set(length/2, frameHeight/2, 0);
            rightPost.castShadow = enableShadows;
            rightPost.receiveShadow = enableShadows;
            doorGroup.add(rightPost);

            const headerGeo = new THREE.BoxGeometry(length, postThickness, frameDepth);
            const header = new THREE.Mesh(headerGeo, frameMat);
            header.position.set(0, frameHeight - postThickness/2, 0);
            header.castShadow = enableShadows;
            header.receiveShadow = enableShadows;
            doorGroup.add(header);

            const isDouble = dClass.includes("double") || (door.door_name && door.door_name.toLowerCase().includes("2x"));
            const isSliding = dClass.includes("sliding") || dClass.includes("slider") || dClass.includes("cavity");
            const isBifold = dClass.includes("bifold") || dClass.includes("fold");
            const isGarage = dClass.includes("garage") || dClass.includes("roller");

            const slabHeight = frameHeight - postThickness;
            const slabThick = 4;
            const slabMat = new THREE.MeshStandardMaterial({
              color: 0x5c3a21,
              roughness: 0.85,
              metalness: 0.1,
              side: THREE.DoubleSide
            });

            const detailMat = new THREE.MeshStandardMaterial({
              color: 0x422817,
              roughness: 0.9,
              metalness: 0.1
            });

            const addHandleToPanel = (panel, dx, dy, dz, lever = false) => {
              const handleGroup = new THREE.Group();
              const plateGeo = new THREE.BoxGeometry(1.2, 5, 0.4);
              const plate = new THREE.Mesh(plateGeo, frameMat);
              plate.position.set(0, 0, 0);
              handleGroup.add(plate);

              if (lever) {
                const neckGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 8);
                const neck = new THREE.Mesh(neckGeo, frameMat);
                neck.rotation.x = Math.PI / 2;
                neck.position.set(0, 0, 0.75);
                handleGroup.add(neck);

                const barGeo = new THREE.BoxGeometry(3.5, 0.6, 0.4);
                const bar = new THREE.Mesh(barGeo, frameMat);
                bar.position.set(1.5, 0, 1.5);
                handleGroup.add(bar);
              } else {
                const knobGeo = new THREE.CylinderGeometry(1, 1, 1.2, 12);
                const knob = new THREE.Mesh(knobGeo, frameMat);
                knob.rotation.x = Math.PI / 2;
                knob.position.set(0, 0, 0.6);
                handleGroup.add(knob);
              }
              handleGroup.position.set(dx, dy, dz);
              panel.add(handleGroup);
            };

            if (isGarage) {
              const sectionGroup = new THREE.Group();
              const numSections = 4;
              const secH = slabHeight / numSections;
              const pWidth = length - postThickness;

              for (let sIdx = 0; sIdx < numSections; sIdx++) {
                const mainPanelGeo = new THREE.BoxGeometry(pWidth, secH - 1, 4);
                const panel = new THREE.Mesh(mainPanelGeo, slabMat);
                panel.position.set(0, sIdx * secH + secH/2, 0);
                panel.castShadow = enableShadows;
                panel.receiveShadow = enableShadows;
                sectionGroup.add(panel);

                if (secH > 10) {
                  const grooveGeo = new THREE.BoxGeometry(pWidth - 10, 1, 4.2);
                  const groove = new THREE.Mesh(grooveGeo, detailMat);
                  groove.position.set(0, sIdx * secH + secH/2, 0);
                  sectionGroup.add(groove);
                }
              }
              doorGroup.add(sectionGroup);
            } else if (isSliding) {
              const pWidth = (length - postThickness) / 2;
              const fixedGroup = new THREE.Group();
              const b1 = new THREE.Mesh(new THREE.BoxGeometry(2, slabHeight, slabThick), slabMat);
              const b2 = new THREE.Mesh(new THREE.BoxGeometry(2, slabHeight, slabThick), slabMat);
              const b3 = new THREE.Mesh(new THREE.BoxGeometry(pWidth, 2, slabThick), slabMat);
              const b4 = new THREE.Mesh(new THREE.BoxGeometry(pWidth, 2, slabThick), slabMat);
              b1.position.set(-pWidth/2, slabHeight/2, 0);
              b2.position.set(pWidth/2, slabHeight/2, 0);
              b3.position.set(0, 1, 0);
              b4.position.set(0, slabHeight - 1, 0);
              fixedGroup.add(b1, b2, b3, b4);
              const glassGeo = new THREE.BoxGeometry(pWidth - 4, slabHeight - 4, 1);
              const glassMat = new THREE.MeshPhysicalMaterial({
                color: 0xffffff, transparent: true, opacity: 0.25,
                roughness: 0.1, transmission: 0.9, thickness: 1.0
              });
              const glass = new THREE.Mesh(glassGeo, glassMat);
              glass.position.set(0, slabHeight/2, 0);
              fixedGroup.add(glass);
              fixedGroup.position.set(-pWidth/2, 0, -2);
              doorGroup.add(fixedGroup);

              const activeGroup = new THREE.Group();
              const ab1 = new THREE.Mesh(new THREE.BoxGeometry(2, slabHeight, slabThick), slabMat);
              const ab2 = new THREE.Mesh(new THREE.BoxGeometry(2, slabHeight, slabThick), slabMat);
              const ab3 = new THREE.Mesh(new THREE.BoxGeometry(pWidth, 2, slabThick), slabMat);
              const ab4 = new THREE.Mesh(new THREE.BoxGeometry(pWidth, 2, slabThick), slabMat);
              ab1.position.set(-pWidth/2, slabHeight/2, 0);
              ab2.position.set(pWidth/2, slabHeight/2, 0);
              ab3.position.set(0, 1, 0);
              ab4.position.set(0, slabHeight - 1, 0);
              activeGroup.add(ab1, ab2, ab3, ab4);
              const glassActive = new THREE.Mesh(glassGeo, glassMat);
              glassActive.position.set(0, slabHeight/2, 0);
              activeGroup.add(glassActive);

              addHandleToPanel(activeGroup, -pWidth/2 + 4, slabHeight/2, slabThick/2, false);
              addHandleToPanel(activeGroup, -pWidth/2 + 4, slabHeight/2, -slabThick/2, false);

              const openProgress = 0.5;
              const slideOffsetX = openProgress * (pWidth - 4);
              activeGroup.position.set(pWidth/2 - slideOffsetX, 0, 2);
              doorGroup.add(activeGroup);
            } else if (isBifold) {
              const pWidth = (length - postThickness) / 4;
              const bifoldContainer = new THREE.Group();

              const p1Mesh = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
              p1Mesh.position.set(pWidth/2, slabHeight/2, 0);
              p1Mesh.castShadow = enableShadows;
              p1Mesh.receiveShadow = enableShadows;

              const b1Group = new THREE.Group();
              b1Group.add(p1Mesh);

              const p2Mesh = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
              p2Mesh.position.set(pWidth/2, slabHeight/2, 0);
              p2Mesh.castShadow = enableShadows;
              p2Mesh.receiveShadow = enableShadows;

              const b2Group = new THREE.Group();
              b2Group.position.set(pWidth, 0, 0);
              b2Group.add(p2Mesh);
              b1Group.add(b2Group);

              const p3Mesh = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
              p3Mesh.position.set(-pWidth/2, slabHeight/2, 0);
              p3Mesh.castShadow = enableShadows;
              p3Mesh.receiveShadow = enableShadows;

              const b3Group = new THREE.Group();
              b3Group.add(p3Mesh);

              const p4Mesh = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
              p4Mesh.position.set(-pWidth/2, slabHeight/2, 0);
              p4Mesh.castShadow = enableShadows;
              p4Mesh.receiveShadow = enableShadows;

              const b4Group = new THREE.Group();
              b4Group.position.set(-pWidth, 0, 0);
              b4Group.add(p4Mesh);
              b3Group.add(b4Group);

              const foldAngleRad = (45 * Math.PI) / 180;
              b1Group.rotation.y = foldAngleRad;
              b2Group.rotation.y = -foldAngleRad * 2;

              b3Group.rotation.y = -foldAngleRad;
              b4Group.rotation.y = foldAngleRad * 2;

              b1Group.position.set(-length/2 + postThickness/2, 0, 0);
              b3Group.position.set(length/2 - postThickness/2, 0, 0);

              bifoldContainer.add(b1Group);
              bifoldContainer.add(b3Group);
              doorGroup.add(bifoldContainer);
            } else if (isDouble) {
              const pWidth = (length - postThickness) / 2;
              const openAngleRad = (35 * Math.PI) / 180;

              const leftPivot = new THREE.Group();
              leftPivot.position.set(-length/2 + postThickness/2, 0, 0);
              const leftSlab = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
              leftSlab.position.set(pWidth/2, slabHeight/2, 0);
              leftSlab.castShadow = enableShadows;
              leftSlab.receiveShadow = enableShadows;

              const leftGroup = new THREE.Group();
              leftGroup.add(leftSlab);
              const detailGeo = new THREE.BoxGeometry(pWidth - 10, slabHeight/2 - 10, 0.6);
              const topDetailL = new THREE.Mesh(detailGeo, detailMat);
              topDetailL.position.set(pWidth/2, slabHeight*0.75 - 5, slabThick/2 + 0.1);
              const bottomDetailL = new THREE.Mesh(detailGeo, detailMat);
              bottomDetailL.position.set(pWidth/2, slabHeight/4, slabThick/2 + 0.1);
              leftGroup.add(topDetailL);
              leftGroup.add(bottomDetailL);

              addHandleToPanel(leftGroup, pWidth - 4, slabHeight/2, slabThick/2, true);
              addHandleToPanel(leftGroup, pWidth - 4, slabHeight/2, -slabThick/2, true);

              leftPivot.add(leftGroup);
              leftPivot.rotation.y = openAngleRad;
              doorGroup.add(leftPivot);

              const rightPivot = new THREE.Group();
              rightPivot.position.set(length/2 - postThickness/2, 0, 0);
              const rightSlab = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
              rightSlab.position.set(-pWidth/2, slabHeight/2, 0);
              rightSlab.castShadow = enableShadows;
              rightSlab.receiveShadow = enableShadows;

              const rightGroup = new THREE.Group();
              rightGroup.add(rightSlab);
              const topDetailR = new THREE.Mesh(detailGeo, detailMat);
              topDetailR.position.set(-pWidth/2, slabHeight*0.75 - 5, slabThick/2 + 0.1);
              const bottomDetailR = new THREE.Mesh(detailGeo, detailMat);
              bottomDetailR.position.set(-pWidth/2, slabHeight/4, slabThick/2 + 0.1);
              rightGroup.add(topDetailR);
              rightGroup.add(bottomDetailR);

              addHandleToPanel(rightGroup, -pWidth + 4, slabHeight/2, slabThick/2, true);
              addHandleToPanel(rightGroup, -pWidth + 4, slabHeight/2, -slabThick/2, true);

              rightPivot.add(rightGroup);
              rightPivot.rotation.y = -openAngleRad;
              doorGroup.add(rightPivot);
            } else {
              const hingeSide = door.hingeSide || door.hinge_side || "left";
              const swing = door.swing || door.swing_direction || "inward";
              const angleVal = door.angle || door.opening_angle || 35;
              const openAngleRad = (angleVal * Math.PI) / 180;

              const pWidth = length - postThickness;
              const pivotGroup = new THREE.Group();
              const hingeFactor = hingeSide === "left" ? 1 : -1;
              const sideFactor = swing === "inward" ? -1 : 1;

              const pivotX = hingeSide === "left" ? -length/2 + postThickness/2 : length/2 - postThickness/2;
              pivotGroup.position.set(pivotX, 0, 0);

              const slab = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
              const slabCenterX = hingeSide === "left" ? pWidth/2 : -pWidth/2;
              slab.position.set(slabCenterX, slabHeight/2, 0);
              slab.castShadow = enableShadows;
              slab.receiveShadow = enableShadows;

              const panelGroup = new THREE.Group();
              panelGroup.add(slab);

              const detailGeo = new THREE.BoxGeometry(pWidth - 12, slabHeight/2 - 12, 0.6);
              const topDetailA = new THREE.Mesh(detailGeo, detailMat);
              const dxSlab = slabCenterX;
              topDetailA.position.set(dxSlab, slabHeight*0.75 - 6, slabThick/2 + 0.1);
              const bottomDetailA = new THREE.Mesh(detailGeo, detailMat);
              bottomDetailA.position.set(dxSlab, slabHeight/4, slabThick/2 + 0.1);
              panelGroup.add(topDetailA);
              panelGroup.add(bottomDetailA);

              const topDetailB = new THREE.Mesh(detailGeo, detailMat);
              topDetailB.position.set(dxSlab, slabHeight*0.75 - 6, -slabThick/2 - 0.1);
              const bottomDetailB = new THREE.Mesh(detailGeo, detailMat);
              bottomDetailB.position.set(dxSlab, slabHeight/4, -slabThick/2 - 0.1);
              panelGroup.add(topDetailB);
              panelGroup.add(bottomDetailB);

              const dxHandle = hingeSide === "left" ? pWidth - 6 : -pWidth + 6;
              addHandleToPanel(panelGroup, dxHandle, 0, slabThick/2, true);
              addHandleToPanel(panelGroup, dxHandle, 0, -slabThick/2, true);

              pivotGroup.add(panelGroup);
              pivotGroup.rotation.y = hingeFactor * sideFactor * openAngleRad;
              doorGroup.add(pivotGroup);
            }

            const wallColor = hostWallClass === "exterior_wall" ? 0x64748b : 0x94a3b8;
            const fillerMat = new THREE.MeshStandardMaterial({
              color: wallColor,
              roughness: 0.75,
              metalness: 0.15
            });

            const headerHeight = Math.max(0, hostWallHeightPx - frameHeight);
            if (headerHeight > 0.1) {
              const headerGeo = new THREE.BoxGeometry(length, headerHeight, wallThickness);
              const headerMesh = new THREE.Mesh(headerGeo, fillerMat);
              headerMesh.position.set(0, frameHeight + headerHeight / 2, 0);
              headerMesh.castShadow = enableShadows;
              headerMesh.receiveShadow = enableShadows;
              doorGroup.add(headerMesh);
            }
          }

          if (leftJambMesh) {
            scene.add(leftJambMesh);
            doorMeshesRef.current.push(leftJambMesh);
          }
          if (rightJambMesh) {
            scene.add(rightJambMesh);
            doorMeshesRef.current.push(rightJambMesh);
          }

          doorGroup.position.set(hostWallCx - imgSize.w / 2, yOffset, hostWallCy - imgSize.h / 2);
          doorGroup.rotation.y = -hostWallAngle;

          scene.add(doorGroup);
          doorMeshesRef.current.push(doorGroup);
        });
      }

      // --- 4. RENDER ROOFS ---
      if (showRoofs) {
        const pageRoofs = roofsByPage[originalIndex] || [];
        pageRoofs.forEach(roof => {
          const poly = roof.polygon;
          if (!poly || poly.length < 3) return;

          const isRoofPage = page.floor_name === 'roof';
          const baseHeight = isRoofPage ? yOffset : yOffset + wallHeight;
          const pitchAngle = roof.pitchAngle || 0;

          if (pitchAngle === 0) {
            // Render Flat Slab Roof
            const shape = new THREE.Shape();
            shape.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) {
              shape.lineTo(poly[i].x, poly[i].y);
            }
            shape.closePath();

            const extrudeSettings = { depth: 8, bevelEnabled: false };
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            const material = new THREE.MeshStandardMaterial({
              color: 0x334155, // Dark slate gray flat roof slab
              roughness: 0.8,
              metalness: 0.1,
              side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = Math.PI / 2;
            mesh.position.set(-imgSize.w / 2, baseHeight + 8, -imgSize.h / 2);
            mesh.castShadow = enableShadows;
            mesh.receiveShadow = enableShadows;
            scene.add(mesh);
            floorMeshesRef.current.push(mesh);
          } else {
            // Render Pitched Roof (Hipped or Gable shape)
            const rType = roof.roofType || "hip";

            // 1. Calculate bounding box and centroid
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            poly.forEach(pt => {
              minX = Math.min(minX, pt.x);
              maxX = Math.max(maxX, pt.x);
              minY = Math.min(minY, pt.y);
              maxY = Math.max(maxY, pt.y);
            });
            const midX = (minX + maxX) / 2;
            const midY = (minY + maxY) / 2;

            // Average distance to calculate height
            let sumX = 0, sumY = 0;
            poly.forEach(pt => {
              sumX += pt.x;
              sumY += pt.y;
            });
            const centroidX = sumX / poly.length;
            const centroidY = sumY / poly.length;

            let sumDist = 0;
            poly.forEach(pt => {
              const dx = pt.x - centroidX;
              const dy = pt.y - centroidY;
              sumDist += Math.sqrt(dx * dx + dy * dy);
            });
            const avgDist = sumDist / poly.length;

            const pitchRad = pitchAngle * (Math.PI / 180);
            const roofHeight = avgDist * Math.tan(pitchRad);

            const mapTo3D = (pt) => {
              return {
                x: pt.x - imgSize.w / 2,
                z: pt.y - imgSize.h / 2
              };
            };

            const geom = new THREE.BufferGeometry();
            const vertices = [];
            const indices = [];

            if (rType === "gable_horiz") {
              // Horizontal Ridge Gable Roof
              poly.forEach(pt => {
                const mapped = mapTo3D(pt);
                vertices.push(mapped.x, baseHeight, mapped.z);
              });

              poly.forEach(pt => {
                const mappedProj = mapTo3D({ x: pt.x, y: midY });
                vertices.push(mappedProj.x, baseHeight + roofHeight, mappedProj.z);
              });

              const peakOffset = poly.length;

              for (let i = 0; i < poly.length; i++) {
                const iNext = (i + 1) % poly.length;
                const v1 = i;
                const v2 = iNext;
                const v3 = i + peakOffset;
                const v4 = iNext + peakOffset;

                indices.push(v1, v2, v4);
                indices.push(v1, v4, v3);
              }
            } else if (rType === "gable_vert") {
              // Vertical Ridge Gable Roof
              poly.forEach(pt => {
                const mapped = mapTo3D(pt);
                vertices.push(mapped.x, baseHeight, mapped.z);
              });

              poly.forEach(pt => {
                const mappedProj = mapTo3D({ x: midX, y: pt.y });
                vertices.push(mappedProj.x, baseHeight + roofHeight, mappedProj.z);
              });

              const peakOffset = poly.length;

              for (let i = 0; i < poly.length; i++) {
                const iNext = (i + 1) % poly.length;
                const v1 = i;
                const v2 = iNext;
                const v3 = i + peakOffset;
                const v4 = iNext + peakOffset;

                indices.push(v1, v2, v4);
                indices.push(v1, v4, v3);
              }
            } else {
              // Default: Hipped (4-sided slope meeting at centroid)
              const peak = mapTo3D({ x: centroidX, y: centroidY });

              poly.forEach(pt => {
                const mapped = mapTo3D(pt);
                vertices.push(mapped.x, baseHeight, mapped.z);
              });

              vertices.push(peak.x, baseHeight + roofHeight, peak.z);
              const peakIndex = poly.length;

              for (let i = 0; i < poly.length; i++) {
                const iNext = (i + 1) % poly.length;
                indices.push(i, iNext, peakIndex);
              }
            }

            geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geom.setIndex(indices);
            geom.computeVertexNormals();

            const material = new THREE.MeshStandardMaterial({
              color: 0x991b1b, // Elegant premium dark red terracotta shingles
              roughness: 0.5,
              metalness: 0.1,
              side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geom, material);
            mesh.castShadow = enableShadows;
            mesh.receiveShadow = enableShadows;
            scene.add(mesh);
            floorMeshesRef.current.push(mesh);
          }
        });
      }
    });

  }, [pages, wallsByPage, doorsByPage, roomsByPage, roofsByPage, wallHeight, showFloors, showDoors, showRoofs, showPDF, enableShadows, realScale, image, imgSize, visibleLevels, sortedPageIndices]);

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
            <span>Show 3D Roofs</span>
            <input 
              type="checkbox" 
              checked={showRoofs} 
              onChange={() => setShowRoofs(v => !v)}
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

        {/* Floor Visibility Checklist */}
        {pages && pages.length > 1 && (
          <div 
            style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "8px", 
              borderTop: "1px solid rgba(255, 255, 255, 0.1)", 
              paddingTop: "12px",
              marginTop: "4px"
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: "bold", color: "#60a5fa", letterSpacing: "0.05em", marginBottom: "4px" }}>
              FLOOR VISIBILITY
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {sortedPageIndices.map((originalIndex) => {
                const page = pages[originalIndex];
                const floorName = page?.floor_name || `Floor ${originalIndex + 1}`;
                const isVisible = visibleLevels[originalIndex] !== false;
                return (
                  <label 
                    key={originalIndex} 
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      cursor: "pointer", 
                      fontSize: "12px", 
                      color: "#d1d5db" 
                    }}
                  >
                    <span>{floorName}</span>
                    <input 
                      type="checkbox" 
                      checked={isVisible} 
                      onChange={() => {
                        setVisibleLevels(prev => ({
                          ...prev,
                          [originalIndex]: !isVisible
                        }));
                      }}
                      style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "4px",
                        cursor: "pointer"
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}

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
