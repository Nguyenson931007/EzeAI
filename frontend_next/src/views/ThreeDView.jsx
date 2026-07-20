"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cutWallsByDoors, getDoorCenterline, mapFloorName, getBaseWallId } from "@/utils/geometry";

export default function ThreeDView({
  pages = [],
  wallsByPage = {},
  setWallsByPage,
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
  const [wallHeightMm, setWallHeightMm] = useState(2700);
  const [floorDepthMm, setFloorDepthMm] = useState(300);
  const [showGrid, setShowGrid] = useState(true);
  const wallHeight = wallHeightMm / (realScale && realScale !== 1.0 ? realScale : 18.0);
  const floorDepth = floorDepthMm / (realScale && realScale !== 1.0 ? realScale : 18.0);
  const [showFloors, setShowFloors] = useState(true);
  const [showDoors, setShowDoors] = useState(true);
  const [showRoofs, setShowRoofs] = useState(true);
  const [showPDF, setShowPDF] = useState(true);
  const [enableShadows, setEnableShadows] = useState(true);
  const [visibleLevels, setVisibleLevels] = useState({});

  // 3D Wall Coloring & Selection States
  const [colorMode, setColorMode] = useState("wall_type"); // "default" | "wall_type" | "height_based"
  const [customExtColor, setCustomExtColor] = useState("#f59e0b"); // Amber gold
  const [customIntColor, setCustomIntColor] = useState("#3b82f6"); // Sky blue
  const [customPartColor, setCustomPartColor] = useState("#8b5cf6"); // Purple
  const [selected3DWall, setSelected3DWall] = useState(null); // { wallId, pageIndex, wall, height_mm }

  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const gridHelperRef = useRef(null);
  const pointerDownPosRef = useRef({ x: 0, y: 0 });

  // Store generated 3D meshes to dynamically update them
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

  // Handle Pointer Selection on 3D Canvas
  const handleContainerPointerDown = (e) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleContainerPointerUp = (e) => {
    const dx = Math.abs(e.clientX - pointerDownPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerDownPosRef.current.y);
    if (dx > 5 || dy > 5) return; // Ignore drag / orbit rotation

    if (!rendererRef.current || !cameraRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const meshes = wallMeshesRef.current || [];
    const intersects = raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      let hitMesh = intersects[0].object;
      while (hitMesh && !hitMesh.userData.wallId && hitMesh.parent) {
        hitMesh = hitMesh.parent;
      }
      if (hitMesh && hitMesh.userData.wallId) {
        const { wallId, pageIndex, wall } = hitMesh.userData;
        const currentWallMm = wall.height || wall.height_mm || wallHeightMm;
        setSelected3DWall({
          wallId,
          pageIndex,
          wall,
          height_mm: currentWallMm
        });
        return;
      }
    }
    setSelected3DWall(null);
  };

  // Handle direct height update for selected 3D wall
  const handleUpdate3DWallHeight = (newHeightMm) => {
    if (!selected3DWall) return;
    const targetWallId = selected3DWall.wallId;
    const targetPageIndex = selected3DWall.pageIndex;
    const baseTargetId = getBaseWallId(targetWallId);

    if (setWallsByPage) {
      setWallsByPage(prev => {
        const pageWalls = prev[targetPageIndex] || [];
        const updated = pageWalls.map(w => {
          if (w.id === targetWallId || getBaseWallId(w.id) === baseTargetId) {
            return {
              ...w,
              height: Number(newHeightMm),
              height_mm: Number(newHeightMm)
            };
          }
          return w;
        });
        return {
          ...prev,
          [targetPageIndex]: updated
        };
      });
    }

    setSelected3DWall(prev => prev ? { ...prev, height_mm: Number(newHeightMm) } : null);
  };

  // 1. SCENE CREATION & INITIALIZATION
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Slate-900 background
    sceneRef.current = scene;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 10000);
    camera.position.set(center.x, 600, center.z + 600);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = enableShadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(center.x + 400, 800, center.z - 300);
    dirLight.castShadow = enableShadows;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 3000;
    const d = 1000;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(center.x - 400, 600, center.z + 300);
    scene.add(fillLight);

    const pointLight = new THREE.PointLight(0x3b82f6, 0.4, 1000);
    pointLight.position.set(center.x, 300, center.z);
    scene.add(pointLight);

    const gridHelper = new THREE.GridHelper(5000, 100, 0x3b82f6, 0x1e293b);
    gridHelper.position.y = -2;
    gridHelper.visible = showGrid;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.target.copy(center);
    controls.update();
    controlsRef.current = controls;

    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);

    window.addEventListener("resize", handleResize);

    const t1 = setTimeout(handleResize, 100);
    const t2 = setTimeout(handleResize, 300);

    const container = containerRef.current;

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      clearTimeout(t1);
      clearTimeout(t2);

      controls.dispose();

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

      if (renderer.domElement && container) {
        try { container.removeChild(renderer.domElement); } catch (_) {}
      }
      renderer.dispose();

      rendererRef.current = null;
      sceneRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
      wallMeshesRef.current = [];
      floorMeshesRef.current = [];
      doorMeshesRef.current = [];
    };
  }, [center]);

  // Handle Grid Toggle
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Handle Shadows Toggle
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.shadowMap.enabled = enableShadows;
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

    wallMeshesRef.current.forEach(m => { scene.remove(m); disposeObject3D(m); });
    wallMeshesRef.current = [];

    floorMeshesRef.current.forEach(m => { scene.remove(m); disposeObject3D(m); });
    floorMeshesRef.current = [];

    doorMeshesRef.current.forEach(m => { scene.remove(m); disposeObject3D(m); });
    doorMeshesRef.current = [];

    sortedPageIndices.forEach((originalIndex, k) => {
      if (visibleLevels[originalIndex] === false) return;

      const page = pages[originalIndex];
      const pageWalls = wallsByPage[originalIndex] || [];
      const pageDoors = doorsByPage[originalIndex] || [];
      const pageRooms = roomsByPage[originalIndex] || [];
      
      const yOffset = k * (wallHeight + floorDepth);

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

          const extrudeSettings = { depth: k > 0 ? floorDepth : 1, bevelEnabled: false };
          const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.85,
            metalness: 0.1,
            side: THREE.DoubleSide
          });

          const mesh = new THREE.Mesh(geometry, material);
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(-imgSize.w / 2, k > 0 ? yOffset : yOffset - 0.5, -imgSize.h / 2);
          mesh.receiveShadow = enableShadows;
          scene.add(mesh);
          floorMeshesRef.current.push(mesh);
        });
      }

      // --- 1b. RENDER PDF UNDERLAY ---
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

        const scaleFactor = (realScale && realScale !== 1.0) ? realScale : 18.0;
        const wallHeightMmVal = wall.height || wall.height_mm || wallHeightMm;
        let activeWallHeight = wallHeightMmVal / scaleFactor;

        // Color Calculation based on colorMode
        let wallColor = new THREE.Color(0x94a3b8);
        if (colorMode === "wall_type") {
          if (wall.wall_type === "ext" || wall.class_name === "exterior_wall") {
            wallColor = new THREE.Color(customExtColor);
          } else if (wall.wall_type === "part" || wall.class_name === "partition_wall") {
            wallColor = new THREE.Color(customPartColor);
          } else {
            wallColor = new THREE.Color(customIntColor);
          }
        } else if (colorMode === "height_based") {
          if (wallHeightMmVal <= 2400) wallColor = new THREE.Color("#3b82f6");      // Blue
          else if (wallHeightMmVal <= 2700) wallColor = new THREE.Color("#10b981"); // Green
          else if (wallHeightMmVal <= 3000) wallColor = new THREE.Color("#f59e0b"); // Amber
          else if (wallHeightMmVal <= 3300) wallColor = new THREE.Color("#ef4444"); // Red
          else wallColor = new THREE.Color("#ec4899");                              // Pink
        } else {
          wallColor = new THREE.Color(wall.class_name === "exterior_wall" ? 0x64748b : 0x94a3b8);
        }

        const isWallSelected = selected3DWall && (
          selected3DWall.wallId === wall.id ||
          (wall.id && selected3DWall.wallId && getBaseWallId(wall.id) === getBaseWallId(selected3DWall.wallId))
        );

        const material = new THREE.MeshStandardMaterial({
          color: wallColor,
          roughness: 0.75,
          metalness: 0.15,
          emissive: isWallSelected ? new THREE.Color(0x38bdf8) : new THREE.Color(0x000000),
          emissiveIntensity: isWallSelected ? 0.6 : 0
        });

        const poly = wall.polygon;
        let mesh = null;

        if (poly && poly.length >= 3) {
          const shape = new THREE.Shape();
          shape.moveTo(poly[0][0], poly[0][1]);
          for (let i = 1; i < poly.length; i++) {
            shape.lineTo(poly[i][0], poly[i][1]);
          }
          shape.closePath();

          const extrudeSettings = { depth: activeWallHeight, bevelEnabled: false };
          const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

          mesh = new THREE.Mesh(geometry, material);
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(-imgSize.w / 2, yOffset + activeWallHeight, -imgSize.h / 2);
          mesh.castShadow = enableShadows;
          mesh.receiveShadow = enableShadows;
        } else {
          const geometry = new THREE.BoxGeometry(length, activeWallHeight, thickness);
          mesh = new THREE.Mesh(geometry, material);
          mesh.position.set((x1 + x2) / 2 - imgSize.w / 2, yOffset + activeWallHeight / 2, (y1 + y2) / 2 - imgSize.h / 2);
          mesh.rotation.y = -angle;
          mesh.castShadow = enableShadows;
          mesh.receiveShadow = enableShadows;
        }

        mesh.userData = { wallId: wall.id, pageIndex: originalIndex, wall: wall };
        scene.add(mesh);
        wallMeshesRef.current.push(mesh);
      });

      // --- 3. RENDER DOORS ---
      if (showDoors) {
        pageDoors.forEach(door => {
          const { cx, cy, length, angle, thickness } = getDoorProps(door, pageWalls);
          const scaleFactor = (realScale && realScale !== 1.0) ? realScale : 18.0;
          
          let wallThickness = thickness;
          let hostWallAngle = angle;
          let hostWallCx = cx;
          let hostWallCy = cy;
          let hostWallClass = "interior_wall";
          let hostWallHeightPx = wallHeight;

          const points = door.points || [];
          let p1 = points[0] ? (Array.isArray(points[0]) ? { x: points[0][0], y: points[0][1] } : points[0]) : null;
          let p2 = points[1] ? (Array.isArray(points[1]) ? { x: points[1][0], y: points[1][1] } : points[1]) : null;
          
          let leftJambMesh = null;
          let rightJambMesh = null;

          if (p1 && p2) {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dLen = Math.sqrt(dx * dx + dy * dy);
            if (dLen > 0) {
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
                const wallHeightMmVal = nearestWall.height || nearestWall.height_mm || wallHeightMm;
                hostWallHeightPx = wallHeightMmVal / scaleFactor;

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

            if (sillHeight > 0.1) {
              const bottomWallGeo = new THREE.BoxGeometry(length, sillHeight, wallThickness);
              const bottomWallMesh = new THREE.Mesh(bottomWallGeo, fillerMat);
              bottomWallMesh.position.set(0, sillHeight / 2, 0);
              bottomWallMesh.castShadow = enableShadows;
              bottomWallMesh.receiveShadow = enableShadows;
              doorGroup.add(bottomWallMesh);
            }

            const topWallHeight = hostWallHeightPx - headerHeight;
            if (topWallHeight > 0.1) {
              const topWallGeo = new THREE.BoxGeometry(length, topWallHeight, wallThickness);
              const topWallMesh = new THREE.Mesh(topWallGeo, fillerMat);
              topWallMesh.position.set(0, headerHeight + topWallHeight / 2, 0);
              topWallMesh.castShadow = enableShadows;
              topWallMesh.receiveShadow = enableShadows;
              doorGroup.add(topWallMesh);
            }

            const frameThickness = 2.5;
            const frameDepth = wallThickness + 2;
            const windowFrameMat = new THREE.MeshStandardMaterial({
              color: 0x334155,
              roughness: 0.5,
              metalness: 0.8
            });

            const leftPostGeo = new THREE.BoxGeometry(frameThickness, windowHeight, frameDepth);
            const leftPost = new THREE.Mesh(leftPostGeo, windowFrameMat);
            leftPost.position.set(-length/2 + frameThickness/2, sillHeight + windowHeight/2, 0);
            leftPost.castShadow = enableShadows;
            leftPost.receiveShadow = enableShadows;
            doorGroup.add(leftPost);

            const rightPostGeo = new THREE.BoxGeometry(frameThickness, windowHeight, frameDepth);
            const rightPost = new THREE.Mesh(rightPostGeo, windowFrameMat);
            rightPost.position.set(length/2 - frameThickness/2, sillHeight + windowHeight/2, 0);
            rightPost.castShadow = enableShadows;
            rightPost.receiveShadow = enableShadows;
            doorGroup.add(rightPost);

            const topFrameGeo = new THREE.BoxGeometry(length, frameThickness, frameDepth);
            const topFrame = new THREE.Mesh(topFrameGeo, windowFrameMat);
            topFrame.position.set(0, headerHeight - frameThickness/2, 0);
            topFrame.castShadow = enableShadows;
            topFrame.receiveShadow = enableShadows;
            doorGroup.add(topFrame);

            const bottomFrameGeo = new THREE.BoxGeometry(length, frameThickness, frameDepth);
            const bottomFrame = new THREE.Mesh(bottomFrameGeo, windowFrameMat);
            bottomFrame.position.set(0, sillHeight + frameThickness/2, 0);
            bottomFrame.castShadow = enableShadows;
            bottomFrame.receiveShadow = enableShadows;
            doorGroup.add(bottomFrame);

            const glassGeo = new THREE.BoxGeometry(length - frameThickness * 2, windowHeight - frameThickness * 2, 1);
            const glassMat = new THREE.MeshPhysicalMaterial({
              color: 0xbae6fd,
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
            const calculatedDoorHeightPx = door.height_mm ? (door.height_mm / scaleFactor) : (hostWallHeightPx * 0.85);
            const frameHeight = Math.min(calculatedDoorHeightPx, hostWallHeightPx - 1);

            const topDoorWallHeight = hostWallHeightPx - frameHeight;
            if (topDoorWallHeight > 0.1) {
              const wallColor = hostWallClass === "exterior_wall" ? 0x64748b : 0x94a3b8;
              const fillerMat = new THREE.MeshStandardMaterial({
                color: wallColor,
                roughness: 0.75,
                metalness: 0.15
              });
              const topDoorWallGeo = new THREE.BoxGeometry(length, topDoorWallHeight, wallThickness);
              const topDoorWallMesh = new THREE.Mesh(topDoorWallGeo, fillerMat);
              topDoorWallMesh.position.set(0, frameHeight + topDoorWallHeight / 2, 0);
              topDoorWallMesh.castShadow = enableShadows;
              topDoorWallMesh.receiveShadow = enableShadows;
              doorGroup.add(topDoorWallMesh);
            }

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
                const knobGeo = new THREE.SphereGeometry(1.0, 12, 12);
                const knob = new THREE.Mesh(knobGeo, frameMat);
                knob.position.set(0, 0, 0.8);
                handleGroup.add(knob);
              }

              handleGroup.position.set(dx, dy, dz);
              panel.add(handleGroup);
            };

            if (isSliding) {
              const pWidth = (length - postThickness) / 2;
              const fixedGroup = new THREE.Group();
              const fb1 = new THREE.Mesh(new THREE.BoxGeometry(2, slabHeight, slabThick), slabMat);
              const fb2 = new THREE.Mesh(new THREE.BoxGeometry(2, slabHeight, slabThick), slabMat);
              const fb3 = new THREE.Mesh(new THREE.BoxGeometry(pWidth, 2, slabThick), slabMat);
              const fb4 = new THREE.Mesh(new THREE.BoxGeometry(pWidth, 2, slabThick), slabMat);
              fb1.position.set(-pWidth/2, slabHeight/2, 0);
              fb2.position.set(pWidth/2, slabHeight/2, 0);
              fb3.position.set(0, 1, 0);
              fb4.position.set(0, slabHeight - 1, 0);
              fixedGroup.add(fb1, fb2, fb3, fb4);

              const glassGeo = new THREE.BoxGeometry(pWidth - 4, slabHeight - 4, 0.5);
              const glassMat = new THREE.MeshPhysicalMaterial({
                color: 0xe2e8f0, transparent: true, opacity: 0.4, roughness: 0.1, transmission: 0.85
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

              pivotGroup.add(panelGroup);
              pivotGroup.rotation.y = hingeFactor * sideFactor * openAngleRad;
              doorGroup.add(pivotGroup);
            }

            const headerHeight = Math.max(0, hostWallHeightPx - frameHeight);
            if (headerHeight > 0.1) {
              const wallColor = hostWallClass === "exterior_wall" ? 0x64748b : 0x94a3b8;
              const fillerMat = new THREE.MeshStandardMaterial({
                color: wallColor,
                roughness: 0.75,
                metalness: 0.15
              });
              const headerGeo = new THREE.BoxGeometry(length, headerHeight, wallThickness);
              const headerMesh = new THREE.Mesh(headerGeo, fillerMat);
              headerMesh.position.set(0, frameHeight + headerHeight / 2, 0);
              headerMesh.castShadow = enableShadows;
              headerMesh.receiveShadow = enableShadows;
              doorGroup.add(headerMesh);
            }
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

          const shape = new THREE.Shape();
          shape.moveTo(poly[0].x, poly[0].y);
          for (let i = 1; i < poly.length; i++) {
            shape.lineTo(poly[i].x, poly[i].y);
          }
          shape.closePath();

          const extrudeSettings = { depth: 8, bevelEnabled: false };
          const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          const material = new THREE.MeshStandardMaterial({
            color: 0x334155,
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
        });
      }
    });
  }, [
    sortedPageIndices, visibleLevels, showFloors, showPDF, showDoors, showRoofs, enableShadows,
    wallHeight, floorDepth, wallsByPage, doorsByPage, roomsByPage, roofsByPage, realScale, imgSize,
    colorMode, customExtColor, customIntColor, customPartColor, selected3DWall
  ]);

  const handleResetCamera = () => {
    if (controlsRef.current && cameraRef.current) {
      cameraRef.current.position.set(center.x, 600, center.z + 600);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
  };

  return (
    <div 
      ref={containerRef} 
      style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", userSelect: "none" }}
      onPointerDown={handleContainerPointerDown}
      onPointerUp={handleContainerPointerUp}
    >
      {/* Top Header Controls */}
      <div 
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          zIndex: 10,
          display: "flex",
          gap: "12px",
          alignItems: "center"
        }}
      >
        <button
          onClick={onClose}
          style={{
            backgroundColor: "#ef4444",
            color: "#ffffff",
            padding: "8px 16px",
            borderRadius: "8px",
            border: "none",
            fontWeight: "bold",
            fontSize: "13px",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(239, 68, 68, 0.4)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.2s"
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#dc2626"}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#ef4444"}
        >
          ✖ Exit 3D View
        </button>
      </div>

      {/* Floating Selected 3D Wall Height Edit HUD */}
      {selected3DWall && (
        <div
          style={{
            position: "absolute",
            top: "80px",
            right: "20px",
            zIndex: 100,
            width: "300px",
            backgroundColor: "rgba(15, 23, 42, 0.88)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(56, 189, 248, 0.4)",
            borderRadius: "12px",
            padding: "16px",
            boxShadow: "0 16px 32px rgba(0, 0, 0, 0.5)",
            color: "#fff",
            fontFamily: "'Outfit', 'Inter', sans-serif"
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>🧱</span>
              <span style={{ fontSize: "14px", fontWeight: "bold", color: "#38bdf8" }}>Chỉnh Độ Cao Tường 3D</span>
            </div>
            <button
              onClick={() => setSelected3DWall(null)}
              style={{
                background: "none", border: "none", color: "#94a3b8", fontSize: "16px", cursor: "pointer", padding: "2px 6px"
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "12px" }}>
            Mã tường: <code style={{ color: "#e2e8f0" }}>{selected3DWall.wallId}</code>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px" }}>
                Độ cao tường (Height): <b style={{ color: "#38bdf8" }}>{selected3DWall.height_mm}mm</b>
              </label>
              <input
                type="range"
                min="1500"
                max="5000"
                step="50"
                value={selected3DWall.height_mm}
                onChange={(e) => handleUpdate3DWallHeight(Number(e.target.value))}
                style={{ width: "100%", cursor: "pointer", accentColor: "#38bdf8" }}
              />
            </div>

            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {[2400, 2700, 3000, 3300, 3600].map(h => (
                <button
                  key={h}
                  onClick={() => handleUpdate3DWallHeight(h)}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: selected3DWall.height_mm === h ? "bold" : "normal",
                    backgroundColor: selected3DWall.height_mm === h ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.05)",
                    border: selected3DWall.height_mm === h ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.1)",
                    color: selected3DWall.height_mm === h ? "#38bdf8" : "#cbd5e1",
                    cursor: "pointer"
                  }}
                >
                  {h}mm
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "12px", color: "#cbd5e1" }}>Nhập số mm:</span>
              <input
                type="number"
                value={selected3DWall.height_mm}
                onChange={(e) => handleUpdate3DWallHeight(Number(e.target.value))}
                style={{
                  width: "100px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: "bold"
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Control Panel Sidebar */}
      <div 
        style={{
          position: "absolute",
          top: "80px",
          left: "16px",
          zIndex: 10,
          backgroundColor: "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "12px",
          padding: "16px",
          width: "280px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
          color: "#ffffff",
          fontFamily: "'Outfit', 'Inter', sans-serif",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          maxHeight: "calc(100vh - 120px)",
          overflowY: "auto"
        }}
      >
        <div style={{ fontSize: "13px", fontWeight: "bold", color: "#38bdf8", letterSpacing: "0.05em" }}>
          ⚙ 3D VIEW SETTINGS
        </div>

        {/* Global Wall Height */}
        <div>
          <label style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px" }}>
            <span>Wall Height (Global)</span>
            <b style={{ color: "#38bdf8" }}>{wallHeightMm} mm</b>
          </label>
          <input 
            type="range" 
            min="1500" 
            max="4500" 
            step="100"
            value={wallHeightMm} 
            onChange={(e) => setWallHeightMm(Number(e.target.value))}
            style={{ width: "100%", cursor: "pointer", accentColor: "#38bdf8" }}
          />
        </div>

        {/* 3D Wall Color Mode Options */}
        <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "10px" }}>
          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#60a5fa", marginBottom: "8px" }}>
            🎨 3D WALL COLOR MODES
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer", color: "#e2e8f0" }}>
              <input
                type="radio"
                name="colorMode"
                value="wall_type"
                checked={colorMode === "wall_type"}
                onChange={() => setColorMode("wall_type")}
                style={{ accentColor: "#38bdf8" }}
              />
              <span>Phân loại Tường (Ext / Int / Part)</span>
            </label>

            {colorMode === "wall_type" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginLeft: "20px", padding: "6px", backgroundColor: "rgba(255, 255, 255, 0.03)", borderRadius: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                  <span>Tường Ext (Ngoại thất):</span>
                  <input type="color" value={customExtColor} onChange={(e) => setCustomExtColor(e.target.value)} style={{ width: "24px", height: "20px", border: "none", cursor: "pointer", background: "none" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                  <span>Tường Int (Nội thất):</span>
                  <input type="color" value={customIntColor} onChange={(e) => setCustomIntColor(e.target.value)} style={{ width: "24px", height: "20px", border: "none", cursor: "pointer", background: "none" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                  <span>Vách ngăn (Part):</span>
                  <input type="color" value={customPartColor} onChange={(e) => setCustomPartColor(e.target.value)} style={{ width: "24px", height: "20px", border: "none", cursor: "pointer", background: "none" }} />
                </div>
              </div>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer", color: "#e2e8f0" }}>
              <input
                type="radio"
                name="colorMode"
                value="height_based"
                checked={colorMode === "height_based"}
                onChange={() => setColorMode("height_based")}
                style={{ accentColor: "#38bdf8" }}
              />
              <span>Màu sắc theo Độ cao Tường</span>
            </label>

            {colorMode === "height_based" && (
              <div style={{ fontSize: "10px", color: "#94a3b8", marginLeft: "20px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                <span>🔵 ≤2.4m</span>
                <span>🟢 ≤2.7m</span>
                <span>🟠 ≤3.0m</span>
                <span>🔴 ≤3.3m</span>
                <span>🟣 &gt;3.3m</span>
              </div>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", cursor: "pointer", color: "#e2e8f0" }}>
              <input
                type="radio"
                name="colorMode"
                value="default"
                checked={colorMode === "default"}
                onChange={() => setColorMode("default")}
                style={{ accentColor: "#38bdf8" }}
              />
              <span>Màu Slate Mặc định</span>
            </label>
          </div>
        </div>

        {/* Element Toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "10px" }}>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: "#d1d5db" }}>
            <span>Show Grid</span>
            <input 
              type="checkbox" 
              checked={showGrid} 
              onChange={() => setShowGrid(v => !v)}
              style={{ width: "16px", height: "16px", borderRadius: "4px", cursor: "pointer" }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: "#d1d5db" }}>
            <span>Show Floors & Rooms</span>
            <input 
              type="checkbox" 
              checked={showFloors} 
              onChange={() => setShowFloors(v => !v)}
              style={{ width: "16px", height: "16px", borderRadius: "4px", cursor: "pointer" }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: "#d1d5db" }}>
            <span>Show PDF Underlay</span>
            <input 
              type="checkbox" 
              checked={showPDF} 
              onChange={() => setShowPDF(v => !v)}
              style={{ width: "16px", height: "16px", borderRadius: "4px", cursor: "pointer" }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: "#d1d5db" }}>
            <span>Show Wood Doors & Windows</span>
            <input 
              type="checkbox" 
              checked={showDoors} 
              onChange={() => setShowDoors(v => !v)}
              style={{ width: "16px", height: "16px", borderRadius: "4px", cursor: "pointer" }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: "#d1d5db" }}>
            <span>Show 3D Roofs</span>
            <input 
              type="checkbox" 
              checked={showRoofs} 
              onChange={() => setShowRoofs(v => !v)}
              style={{ width: "16px", height: "16px", borderRadius: "4px", cursor: "pointer" }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: "#d1d5db" }}>
            <span>Realistic Shadows</span>
            <input 
              type="checkbox" 
              checked={enableShadows} 
              onChange={() => setEnableShadows(v => !v)}
              style={{ width: "16px", height: "16px", borderRadius: "4px", cursor: "pointer" }}
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
                      style={{ width: "16px", height: "16px", borderRadius: "4px", cursor: "pointer" }}
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
        <div>🖱 <b>Click 3D Wall:</b> Select & Change Height</div>
        <div>🖱 <b>Left Click + Drag:</b> Rotate Scene</div>
        <div>🖱 <b>Right Click + Drag:</b> Pan Camera</div>
      </div>
    </div>
  );
}
