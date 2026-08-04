"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { cutWallsByDoors, getDoorCenterline, mapFloorName, getBaseWallId, getWallClass, getWallType, distancePointToSegment } from "@/utils/geometry";

function insetPolygon3D(pts, offset = 20.0) {
  if (!pts || pts.length < 3) return pts;
  let cx = 0, cy = 0;
  pts.forEach(p => { cx += p.x; cy += p.y; });
  cx /= pts.length;
  cy /= pts.length;

  return pts.map(p => {
    const dx = cx - p.x;
    const dy = cy - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < offset * 1.5) return p;
    const ux = dx / dist;
    const uy = dy / dist;
    return {
      x: p.x + ux * offset,
      y: p.y + uy * offset
    };
  });
}

function distToSegment(p, v, w) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

export default function ThreeDView({
  pages = [],
  wallsByPage = {},
  setWallsByPage,
  doorsByPage = {},
  setDoorsByPage,
  updateDoor,
  roomsByPage = {},
  roofsByPage = {},
  currentPage = 0,
  onClose,
  realScale = 1.0,
  image = null,
  imgSize = { w: 800, h: 600 },
  selectedId = null,
  setSelectedId = null,
  setSelectedType = null
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

  // ── 3D Wall Color Mode & Custom Colors ──
  const [wallColorMode, setWallColorMode] = useState("type"); // "type" | "height" | "default"
  const [extWallColor, setExtWallColor] = useState("#ea580c"); // Terracotta / Exterior
  const [intWallColor, setIntWallColor] = useState("#cbd5e1"); // Slate 300 / Interior
  const [partWallColor, setPartWallColor] = useState("#64748b"); // Slate 500 / Partition

  // Height Tiers Colors
  const [heightTier1Color, setHeightTier1Color] = useState("#3b82f6"); // < 2500mm (Blue)
  const [heightTier2Color, setHeightTier2Color] = useState("#10b981"); // 2500-2850mm (Green)
  const [heightTier3Color, setHeightTier3Color] = useState("#f59e0b"); // 2850-3250mm (Amber/Orange)
  const [heightTier4Color, setHeightTier4Color] = useState("#8b5cf6"); // > 3250mm (Purple)

  // ── 3D Wall & Door Selection State ──
  const [selected3DWall, setSelected3DWall] = useState(null); // { wallId, pageIndex, wall }
  const [selected3DDoor, setSelected3DDoor] = useState(null); // { doorId, pageIndex, door }

  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const gridHelperRef = useRef(null);

  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseDownPosRef = useRef({ x: 0, y: 0 });

  // Store generated 3D meshes to dynamically update them (e.g. wall height)
  const wallMeshesRef = useRef([]);
  const floorMeshesRef = useRef([]);
  const doorMeshesRef = useRef([]);
  const roofMeshesRef = useRef([]);

  // Compute live wall height from wallsByPage for the selected 3D wall
  const liveSelectedWallHeight = React.useMemo(() => {
    if (!selected3DWall) return wallHeightMm;
    const targetPage = selected3DWall.pageIndex !== undefined ? selected3DWall.pageIndex : currentPage;
    const pageWalls = wallsByPage[targetPage] || [];
    const baseId = getBaseWallId ? getBaseWallId(selected3DWall.wallId) : selected3DWall.wallId;
    const liveWall = pageWalls.find(w => w.id === selected3DWall.wallId || getBaseWallId(w.id) === baseId);
    return liveWall ? (liveWall.height || liveWall.height_mm || wallHeightMm) : wallHeightMm;
  }, [selected3DWall, wallsByPage, currentPage, wallHeightMm]);

  const liveSelectedWallType = React.useMemo(() => {
    if (!selected3DWall) return "int";
    const targetPage = selected3DWall.pageIndex !== undefined ? selected3DWall.pageIndex : currentPage;
    const pageWalls = wallsByPage[targetPage] || [];
    const baseId = getBaseWallId ? getBaseWallId(selected3DWall.wallId) : selected3DWall.wallId;
    const liveWall = pageWalls.find(w => w.id === selected3DWall.wallId || getBaseWallId(w.id) === baseId);
    if (!liveWall) return "int";
    if (liveWall.wall_type) return liveWall.wall_type;
    if (liveWall.class_name === "exterior_wall") return "ext";
    if (liveWall.class_name === "partition_wall") return "part";
    return "int";
  }, [selected3DWall, wallsByPage, currentPage]);

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

  // Calculate exact cumulative height for each page level
  const pageHeightsMm = React.useMemo(() => {
    const scaleFactor = (realScale && realScale !== 1.0) ? realScale : 18.0;
    const heights = {};
    sortedPageIndices.forEach(idx => {
      const pageWalls = wallsByPage[idx] || [];
      if (pageWalls.length > 0) {
        let maxH = 0;
        pageWalls.forEach(w => {
          const h = (typeof w.height_mm === 'number' && w.height_mm >= 500)
            ? w.height_mm
            : ((typeof w.height === 'number' && w.height >= 500) ? w.height : wallHeightMm);
          if (h > maxH) maxH = h;
        });
        heights[idx] = (maxH >= 500 ? maxH : wallHeightMm) / scaleFactor;
      } else {
        heights[idx] = wallHeightMm / scaleFactor;
      }
    });
    return heights;
  }, [sortedPageIndices, wallsByPage, wallHeightMm, realScale]);

  const levelBaseYOffsets = React.useMemo(() => {
    const offsets = {};
    let cumulativeY = 0;
    sortedPageIndices.forEach((idx) => {
      offsets[idx] = cumulativeY;
      const h = pageHeightsMm[idx] || (wallHeightMm / ((realScale && realScale !== 1.0) ? realScale : 18.0));
      cumulativeY += h + floorDepth;
    });
    return offsets;
  }, [sortedPageIndices, pageHeightsMm, wallHeightMm, floorDepth, realScale]);

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
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(m => {
          if (m.map) m.map.dispose();
          if (m.lightMap) m.lightMap.dispose();
          if (m.bumpMap) m.bumpMap.dispose();
          if (m.normalMap) m.normalMap.dispose();
          if (m.specularMap) m.specularMap.dispose();
          if (m.envMap) m.envMap.dispose();
          m.dispose();
        });
      }
    });
  };

  const handleResetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(center.x, 600, center.z + 600);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
  };

  // Handle Update Selected Wall Height
  const handleUpdateSelectedWallHeight = (newHeightMm) => {
    if (!selected3DWall || !setWallsByPage) return;
    const { wallId, pageIndex } = selected3DWall;
    const baseId = getBaseWallId ? getBaseWallId(wallId) : wallId.split('-A-')[0].split('-B-')[0];
    const targetPage = pageIndex !== undefined ? pageIndex : currentPage;

    setWallsByPage(prev => {
      const pageWalls = prev[targetPage] || [];
      const updated = pageWalls.map(w => {
        const wBase = getBaseWallId ? getBaseWallId(w.id) : w.id.split('-A-')[0].split('-B-')[0];
        if (w.id === wallId || wBase === baseId) {
          return { ...w, height: newHeightMm, height_mm: newHeightMm };
        }
        return w;
      });
      return {
        ...prev,
        [targetPage]: updated
      };
    });

    setSelected3DWall(prev => prev ? {
      ...prev,
      wall: { ...prev.wall, height: newHeightMm, height_mm: newHeightMm }
    } : null);
  };

  // Handle Apply Height To All Walls
  const handleApplyHeightToAllWalls = (newHeightMm) => {
    if (!setWallsByPage) return;
    setWallsByPage(prev => {
      const updatedAll = {};
      Object.keys(prev).forEach(pIdx => {
        updatedAll[pIdx] = (prev[pIdx] || []).map(w => ({ ...w, height: newHeightMm, height_mm: newHeightMm }));
      });
      return updatedAll;
    });

    if (selected3DWall) {
      setSelected3DWall(prev => prev ? {
        ...prev,
        wall: { ...prev.wall, height: newHeightMm, height_mm: newHeightMm }
      } : null);
    }
  };

  // Handle Update Selected Wall Type
  const handleUpdateSelectedWallType = (newType) => {
    if (!selected3DWall || !setWallsByPage) return;
    const { wallId, pageIndex } = selected3DWall;
    const baseId = getBaseWallId ? getBaseWallId(wallId) : wallId.split('-A-')[0].split('-B-')[0];
    const targetPage = pageIndex !== undefined ? pageIndex : currentPage;

    const class_name = newType === "ext" ? "exterior_wall" : (newType === "part" ? "partition_wall" : "interior_wall");

    setWallsByPage(prev => {
      const pageWalls = prev[targetPage] || [];
      const updated = pageWalls.map(w => {
        const wBase = getBaseWallId ? getBaseWallId(w.id) : w.id.split('-A-')[0].split('-B-')[0];
        if (w.id === wallId || wBase === baseId) {
          return { ...w, wall_type: newType, class_name };
        }
        return w;
      });
      return {
        ...prev,
        [targetPage]: updated
      };
    });

    setSelected3DWall(prev => prev ? {
      ...prev,
      wall: { ...prev.wall, wall_type: newType, class_name }
    } : null);
  };

  // 1. SCENE INITIALIZATION
  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Dark slate background as before
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

      disposeObject3D(scene);

      if (renderer.domElement && container) {
        try { container.removeChild(renderer.domElement); } catch (_) { }
      }
      try {
        renderer.forceContextLoss();
        renderer.dispose();
      } catch (_) { }

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

  // ── 3D RAYCASTING CLICK LISTENER ──
  const handlePointerDown = (e) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e) => {
    const dx = e.clientX - mouseDownPosRef.current.x;
    const dy = e.clientY - mouseDownPosRef.current.y;
    if (Math.hypot(dx, dy) > 6) return;

    if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    const selectables = [...wallMeshesRef.current, ...doorMeshesRef.current];
    const intersects = raycaster.intersectObjects(selectables, true);
    if (intersects.length > 0) {
      let hitMesh = intersects[0].object;
      while (hitMesh && !hitMesh.userData?.isWallMesh && !hitMesh.userData?.isDoorMesh && hitMesh.parent) {
        hitMesh = hitMesh.parent;
      }
      if (hitMesh && hitMesh.userData?.isDoorMesh) {
        const uData = hitMesh.userData;
        setSelected3DDoor({ doorId: uData.doorId, pageIndex: uData.pageIndex, door: uData.door });
        setSelected3DWall(null);
        if (setSelectedId) {
          setSelectedId(uData.doorId);
          if (setSelectedType) setSelectedType(uData.door.type === "window" || uData.door.class === "window" ? "window" : "door");
        }
        return;
      }
      if (hitMesh && hitMesh.userData?.isWallMesh) {
        const uData = hitMesh.userData;
        setSelected3DWall({ wallId: uData.wallId, pageIndex: uData.pageIndex, wall: uData.wall });
        setSelected3DDoor(null);
        if (setSelectedId) {
          setSelectedId(uData.wallId);
          if (setSelectedType) setSelectedType("wall");
        }
        return;
      }
    }
    setSelected3DWall(null);
    setSelected3DDoor(null);
  };

  // Re-build scene elements whenever inputs, color modes, or selection change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear previous meshes
    wallMeshesRef.current.forEach(m => { scene.remove(m); disposeObject3D(m); });
    wallMeshesRef.current = [];

    floorMeshesRef.current.forEach(m => { scene.remove(m); disposeObject3D(m); });
    floorMeshesRef.current = [];

    doorMeshesRef.current.forEach(m => { scene.remove(m); disposeObject3D(m); });
    doorMeshesRef.current = [];

    roofMeshesRef.current.forEach(m => { scene.remove(m); disposeObject3D(m); });
    roofMeshesRef.current = [];

    sortedPageIndices.forEach((originalIndex, k) => {
      if (visibleLevels[originalIndex] === false) return;

      const page = pages[originalIndex];
      const pageWalls = wallsByPage[originalIndex] || [];
      const pageDoors = doorsByPage[originalIndex] || [];
      const pageRooms = roomsByPage[originalIndex] || [];

      const yOffset = levelBaseYOffsets[originalIndex] !== undefined ? levelBaseYOffsets[originalIndex] : k * (wallHeight + floorDepth);
      const levelWallHeight = pageHeightsMm[originalIndex] !== undefined ? pageHeightsMm[originalIndex] : wallHeight;

      // --- 1. RENDER ROOMS (FLOORS) ---
      if (showFloors) {
        // 1a. Render continuous subfloor slab under all room footprints to eliminate blueprint image gaps under door thresholds
        pageRooms.forEach(room => {
          const poly = room.polygon;
          if (!poly || poly.length < 3) return;

          const pts2d = poly.map(p => ({
            x: typeof p.x === 'number' ? p.x : (Array.isArray(p) && typeof p[0] === 'number' ? p[0] : 0),
            y: typeof p.y === 'number' ? p.y : (Array.isArray(p) && typeof p[1] === 'number' ? p[1] : 0)
          })).filter(p => !isNaN(p.x) && !isNaN(p.y));

          if (pts2d.length < 3) return;

          const shapeSub = new THREE.Shape();
          shapeSub.moveTo(pts2d[0].x, pts2d[0].y);
          for (let i = 1; i < pts2d.length; i++) {
            shapeSub.lineTo(pts2d[i].x, pts2d[i].y);
          }
          shapeSub.closePath();

          const subGeo = new THREE.ExtrudeGeometry(shapeSub, { depth: 0.4, bevelEnabled: false });
          const subMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0, // Architectural concrete subfloor foundation tone
            roughness: 0.7,
            metalness: 0.1,
            side: THREE.DoubleSide
          });
          const subMesh = new THREE.Mesh(subGeo, subMat);
          subMesh.rotation.x = Math.PI / 2;
          subMesh.position.set(-imgSize.w / 2, yOffset + 0.1, -imgSize.h / 2);
          subMesh.receiveShadow = enableShadows;
          scene.add(subMesh);
          floorMeshesRef.current.push(subMesh);
        });

        // 1b. Render refined room floor surface finishes (Oak, Tile, Carpet, Slate)
        pageRooms.forEach(room => {
          const poly = room.polygon;
          if (!poly || poly.length < 3) return;

          const pts2d = poly.map(p => ({
            x: typeof p.x === 'number' ? p.x : (Array.isArray(p) && typeof p[0] === 'number' ? p[0] : 0),
            y: typeof p.y === 'number' ? p.y : (Array.isArray(p) && typeof p[1] === 'number' ? p[1] : 0)
          })).filter(p => !isNaN(p.x) && !isNaN(p.y));

          if (pts2d.length < 3) return;

          // Inset room floor polygon slightly into room interior (4px)
          const insetPts = insetPolygon3D(pts2d, 4.0);

          const shape = new THREE.Shape();
          shape.moveTo(insetPts[0].x, insetPts[0].y);
          for (let i = 1; i < insetPts.length; i++) {
            shape.lineTo(insetPts[i].x, insetPts[i].y);
          }
          shape.closePath();

          let color = 0xd4a373; // Premium warm natural oak timber floor default
          let roughness = 0.35;
          let metalness = 0.05;

          const rType = (room.type || "").toLowerCase();
          const rName = (room.room_name || "").toLowerCase();

          if (rType === "wet" || /(bath|wc|toilet|ensuite|powder|laundry|shower)/i.test(rName)) {
            color = 0xf8fafc; // Luxury polished porcelain marble tile
            roughness = 0.15;
            metalness = 0.1;
          } else if (/(bed|bedroom|robe|wip|wic)/i.test(rName)) {
            color = 0xcbd5e1; // Plush modern neutral carpet
            roughness = 0.9;
            metalness = 0.0;
          } else if (/(garage|carport)/i.test(rName)) {
            color = 0x64748b; // Architectural polished slate concrete
            roughness = 0.5;
            metalness = 0.2;
          } else if (rType === "timber_deck" || /(balcony|deck|alfresco|patio|porch)/i.test(rName)) {
            color = 0xa16207; // Rich teak timber deck / outdoor pavers
            roughness = 0.6;
            metalness = 0.1;
          } else if (rType === "dry" || /(living|kitchen|dining|office|study|entry|hall)/i.test(rName)) {
            color = 0xd4a373; // Warm natural oak timber floor
            roughness = 0.35;
            metalness = 0.05;
          }

          const extrudeSettings = { depth: 0.5, bevelEnabled: false };
          const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: roughness,
            metalness: metalness,
            side: THREE.DoubleSide
          });

          const mesh = new THREE.Mesh(geometry, material);
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(-imgSize.w / 2, yOffset + 0.5, -imgSize.h / 2);
          mesh.receiveShadow = enableShadows;
          scene.add(mesh);
          floorMeshesRef.current.push(mesh);
        });
      }

      // --- 1b. RENDER ROOFS WITH 3D PITCH SLOPE ANGLE ---
      if (showRoofs) {
        const pageRoofs = roofsByPage[originalIndex] || [];
        pageRoofs.forEach(roof => {
          const poly = roof.polygon;
          if (!poly || poly.length < 3) return;

          const n = poly.length;
          const pts2d = poly.map(p => ({
            x: typeof p.x === 'number' ? p.x : p[0],
            y: typeof p.y === 'number' ? p.y : p[1]
          }));

          const topYOffset = yOffset + levelWallHeight;
          const scaleFactor = realScale && realScale !== 1.0 ? realScale : 18.0;
          const roofThickness = 120 / scaleFactor;

          const pitchDeg = typeof roof.pitchAngle === 'number' ? roof.pitchAngle : 0;
          const pitchRad = pitchDeg * (Math.PI / 180);

          const material = new THREE.MeshStandardMaterial({
            color: 0xd97706, // Warm terracotta amber roof
            roughness: 0.45,
            metalness: 0.15,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.88
          });

          if (pitchDeg == 0) {
            // Flat roof extrude
            const shape = new THREE.Shape();
            shape.moveTo(pts2d[0].x, pts2d[0].y);
            for (let i = 1; i < n; i++) shape.lineTo(pts2d[i].x, pts2d[i].y);
            shape.closePath();

            const extrudeSettings = { depth: roofThickness, bevelEnabled: false };
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = Math.PI / 2;
            mesh.position.set(-imgSize.w / 2, topYOffset + roofThickness, -imgSize.h / 2);
            mesh.castShadow = enableShadows;
            mesh.receiveShadow = enableShadows;
            scene.add(mesh);
            roofMeshesRef.current.push(mesh);
          } else {
            // 3D Pitched Slope Roof Mesh
            const tanPitch = Math.tan(pitchRad);

            // Compute centroid
            let cx = 0, cy = 0;
            pts2d.forEach(p => { cx += p.x; cy += p.y; });
            cx /= n; cy /= n;

            // Compute average distance from centroid to eave edges
            let totalDist = 0;
            for (let i = 0; i < n; i++) {
              const p1 = pts2d[i];
              const p2 = pts2d[(i + 1) % n];
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const len = Math.hypot(dx, dy);
              if (len > 0) {
                const dist = Math.abs(dx * (cy - p1.y) - dy * (cx - p1.x)) / len;
                totalDist += dist;
              }
            }

            const avgDist = totalDist / Math.max(1, n);
            const pitchHeight = avgDist * tanPitch;

            const positions = [];
            const normals = [];

            const apexX = cx - imgSize.w / 2;
            const apexY = topYOffset + roofThickness + pitchHeight;
            const apexZ = cy - imgSize.h / 2;

            for (let i = 0; i < n; i++) {
              const p1 = pts2d[i];
              const p2 = pts2d[(i + 1) % n];

              const v1x = p1.x - imgSize.w / 2;
              const v1y = topYOffset + roofThickness;
              const v1z = p1.y - imgSize.h / 2;

              const v2x = p2.x - imgSize.w / 2;
              const v2y = topYOffset + roofThickness;
              const v2z = p2.y - imgSize.h / 2;

              // Facet Triangle (V1, V2, Apex)
              positions.push(
                v1x, v1y, v1z,
                v2x, v2y, v2z,
                apexX, apexY, apexZ
              );

              const ax = v2x - v1x, ay = v2y - v1y, az = v2z - v1z;
              const bx = apexX - v1x, by = apexY - v1y, bz = apexZ - v1z;
              let nx = ay * bz - az * by;
              let ny = az * bx - ax * bz;
              let nz = ax * by - ay * bx;
              const normLen = Math.hypot(nx, ny, nz) || 1;
              nx /= normLen; ny /= normLen; nz /= normLen;

              normals.push(
                nx, ny, nz,
                nx, ny, nz,
                nx, ny, nz
              );

              // Underside Eave Triangle (V1, Apex_bottom, V2)
              positions.push(
                v1x, topYOffset, v1z,
                apexX, topYOffset, apexZ,
                v2x, topYOffset, v2z
              );
              normals.push(
                0, -1, 0,
                0, -1, 0,
                0, -1, 0
              );
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.computeVertexNormals();

            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = enableShadows;
            mesh.receiveShadow = enableShadows;
            scene.add(mesh);
            roofMeshesRef.current.push(mesh);
          }
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

      // --- 2. RENDER WALLS WITH CUSTOM COLOR MODES & SELECTION HIGHLIGHT ---
      // 3D Wall Meshes are cut by both doors and windows (so window openings exist)
      const cutWalls = cutWallsByDoors(pageWalls, pageDoors, realScale, true, false);
      // 3D Skirting Meshes are cut ONLY by doors (ignoring windows so skirting runs continuously across windows along the floor)
      const cutWallsForSkirting = cutWallsByDoors(pageWalls, pageDoors, realScale, true, true);

      // Sort walls so interior/partition walls render first (renderOrder 1)
      // and exterior walls render last (renderOrder 2) to eliminate T-junction stripe artifacts on exterior facade
      const sortedCutWalls = [...cutWalls].sort((a, b) => {
        const isExtA = getWallClass(a) === "exterior_wall" || getWallType(a) === "ext";
        const isExtB = getWallClass(b) === "exterior_wall" || getWallType(b) === "ext";
        if (!isExtA && isExtB) return -1;
        if (isExtA && !isExtB) return 1;
        return 0;
      });

      sortedCutWalls.forEach(wall => {
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
        const wallHeightMmVal = (typeof wall.height_mm === 'number' && wall.height_mm >= 500)
          ? wall.height_mm
          : ((typeof wall.height === 'number' && wall.height >= 500) ? wall.height : wallHeightMm);
        let activeWallHeight = wallHeightMmVal / scaleFactor;

        // Determine wall color based on mode
        let colorHex = "#f8fafc";
        const wClass = getWallClass(wall);
        const wType = getWallType(wall);
        const isExteriorWall = wClass === "exterior_wall" || wType === "ext";

        if (wallColorMode === "type") {
          if (wType === "ext") colorHex = extWallColor || "#f1f5f9";
          else if (wType === "part") colorHex = partWallColor || "#cbd5e1";
          else colorHex = intWallColor || "#f8fafc";
        } else if (wallColorMode === "height") {
          if (wallHeightMmVal < 2500) colorHex = heightTier1Color;
          else if (wallHeightMmVal < 2850) colorHex = heightTier2Color;
          else if (wallHeightMmVal < 3300) colorHex = heightTier3Color;
          else colorHex = heightTier4Color;
        } else {
          colorHex = isExteriorWall ? "#f8fafc" : "#f1f5f9";
        }

        const baseId = getBaseWallId ? getBaseWallId(wall.id) : wall.id.split('-A-')[0].split('-B-')[0];
        const selectedBaseId = selected3DWall ? (getBaseWallId ? getBaseWallId(selected3DWall.wallId) : selected3DWall.wallId.split('-A-')[0].split('-B-')[0]) : null;
        const isSelected3D = (selected3DWall && (selected3DWall.wallId === wall.id || selectedBaseId === baseId)) || (selectedId === wall.id);

        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(colorHex),
          roughness: 0.45,
          metalness: 0.05,
          polygonOffset: isExteriorWall,
          polygonOffsetFactor: isExteriorWall ? -2 : 0,
          polygonOffsetUnits: isExteriorWall ? -2 : 0,
          emissive: isSelected3D ? new THREE.Color(0xf97316) : new THREE.Color(0x000000),
          emissiveIntensity: isSelected3D ? 0.75 : 0
        });

        let mesh;
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

          mesh = new THREE.Mesh(geometry, material);
          mesh.rotation.x = Math.PI / 2;
          mesh.position.set(-imgSize.w / 2, yOffset + activeWallHeight, -imgSize.h / 2);
        } else {
          const geometry = new THREE.BoxGeometry(length, activeWallHeight, thickness);
          mesh = new THREE.Mesh(geometry, material);
          mesh.position.set((x1 + x2) / 2 - imgSize.w / 2, yOffset + activeWallHeight / 2, (y1 + y2) / 2 - imgSize.h / 2);
          mesh.rotation.y = -angle;
        }

        mesh.renderOrder = isExteriorWall ? 2 : 1;
        mesh.castShadow = enableShadows;
        mesh.receiveShadow = enableShadows;
        mesh.userData = { isWallMesh: true, wallId: wall.id, pageIndex: originalIndex, wall: wall };

        scene.add(mesh);
        wallMeshesRef.current.push(mesh);

        // ── 3D SURFACE FINISHES & SKIRTING MESHES (CAD/BIM FEATURE 6) ──
        const sideA = wall.surface?.sideA || {
          finishType: wall.finishTypeSideA || "none",
          finishHeight: wall.finishHeightSideAMm || activeWallHeight,
          color: "#e2e8f0",
          thickness: 10,
        };
        const sideB = wall.surface?.sideB || {
          finishType: wall.finishTypeSideB || "none",
          finishHeight: wall.finishHeightSideBMm || activeWallHeight,
          color: "#e2e8f0",
          thickness: 10,
        };
        const skirting = wall.skirting || {
          enabled: true,
          height: 100,
          thickness: 15,
          color: "#854d0e",
        };

        const midX = (x1 + x2) / 2 - imgSize.w / 2;
        const midZ = (y1 + y2) / 2 - imgSize.h / 2;
        const nx = Math.sin(-angle);
        const nz = Math.cos(-angle);

        // Render Side A Finish Mesh (Clamped Height)
        if (sideA.finishType && sideA.finishType !== "none" && (sideA.finishHeight || 0) > 0) {
          const scaleFactor = (realScale && realScale !== 1.0) ? realScale : 18.0;
          const rawHA = (Number(sideA.finishHeight) || 2400) / scaleFactor;
          const clampedHA = Math.min(activeWallHeight, rawHA);
          const thickA3D = (Number(sideA.thickness) || 10) / scaleFactor;
          const matA = new THREE.MeshStandardMaterial({
            color: new THREE.Color(sideA.color || "#e2e8f0"),
            roughness: 0.5,
            metalness: 0.1,
          });
          const geoA = new THREE.BoxGeometry(length, clampedHA, thickA3D);
          const meshA = new THREE.Mesh(geoA, matA);
          const offsetA = -(thickness / 2) - (thickA3D / 2) - 0.02;
          meshA.position.set(midX + nx * offsetA, yOffset + clampedHA / 2, midZ + nz * offsetA);
          meshA.rotation.y = -angle;
          scene.add(meshA);
          wallMeshesRef.current.push(meshA);
        }

        // Render Side B Finish Mesh (Clamped Height)
        if (sideB.finishType && sideB.finishType !== "none" && (sideB.finishHeight || 0) > 0) {
          const scaleFactor = (realScale && realScale !== 1.0) ? realScale : 18.0;
          const rawHB = (Number(sideB.finishHeight) || 2400) / scaleFactor;
          const clampedHB = Math.min(activeWallHeight, rawHB);
          const thickB3D = (Number(sideB.thickness) || 10) / scaleFactor;
          const matB = new THREE.MeshStandardMaterial({
            color: new THREE.Color(sideB.color || "#e2e8f0"),
            roughness: 0.5,
            metalness: 0.1,
          });
          const geoB = new THREE.BoxGeometry(length, clampedHB, thickB3D);
          const meshB = new THREE.Mesh(geoB, matB);
          const offsetB = (thickness / 2) + (thickB3D / 2) + 0.02;
          meshB.position.set(midX + nx * offsetB, yOffset + clampedHB / 2, midZ + nz * offsetB);
          meshB.rotation.y = -angle;
          scene.add(meshB);
          wallMeshesRef.current.push(meshB);
        }
      });

      // ── 3D SKIRTING MESHES LOOP (Door Openings Deducted, Window Openings Ignored & Corner Joint Seamless) ──
      cutWallsForSkirting.forEach(wall => {
        const centerline = wall.centerline;
        if (!centerline || centerline.length !== 2) return;

        const p1 = centerline[0];
        const p2 = centerline[1];
        const x1 = (p1[0] ?? p1.x ?? 0);
        const y1 = (p1[1] ?? p1.y ?? 0);
        const x2 = (p2[0] ?? p2.x ?? 0);
        const y2 = (p2[1] ?? p2.y ?? 0);

        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 0.1) return;

        const angle = Math.atan2(dy, dx);
        const thickness = wall.thickness_px || 20;

        const scaleFactor = (realScale && realScale !== 1.0) ? realScale : 18.0;
        const wallHeightMmVal = (typeof wall.height_mm === 'number' && wall.height_mm >= 500)
          ? wall.height_mm
          : ((typeof wall.height === 'number' && wall.height >= 500) ? wall.height : wallHeightMm);
        let activeWallHeight = wallHeightMmVal / scaleFactor;

        const skirting = wall.skirting || {
          enabled: true,
          height: 100,
          thickness: 15,
          color: "#854d0e",
        };

        const midX = (x1 + x2) / 2 - imgSize.w / 2;
        const midZ = (y1 + y2) / 2 - imgSize.h / 2;
        const wallUx = dx / length;
        const wallUy = dy / length;
        const nx = -wallUy;
        const nz = wallUx;

        const skirtingHeightMm = Number(skirting.height || wall.skirtingHeight || 100);
        const skirtingThickMm = Number(skirting.thickness || wall.skirtingThickness || 15);

        if (skirting.enabled !== false && skirtingHeightMm > 0) {
          // Read Side A Skirting parameters (height bounded by wall height / max 10000mm, thickness max 100mm)
          const maxAllowedHeight = Math.max(10000, wallHeightMmVal || 2400);
          const enableSkirtA = skirting.sideA?.enabled !== false && skirting.enabledA !== false && skirting.enabled !== false;
          const rawHA = Number(skirting.sideA?.height || skirtingHeightMm);
          const skirtH_A = (rawHA <= 0) ? 100 : Math.min(maxAllowedHeight, rawHA);
          const hSkirtA = Math.min(activeWallHeight, skirtH_A / scaleFactor);

          const rawTA = Number(skirting.thickness || skirting.sideA?.thickness || skirtingThickMm);
          const skirtT_A = (rawTA > 100 || rawTA <= 0) ? 15 : rawTA;
          const thickSkirtA = skirtT_A / scaleFactor;

          // Read Side B Skirting parameters
          const enableSkirtB = skirting.sideB?.enabled !== false && skirting.enabledB !== false && skirting.enabled !== false;
          const rawHB = Number(skirting.sideB?.height || skirtingHeightMm);
          const skirtH_B = (rawHB <= 0) ? 100 : Math.min(maxAllowedHeight, rawHB);
          const hSkirtB = Math.min(activeWallHeight, skirtH_B / scaleFactor);

          const rawTB = Number(skirting.thickness || skirting.sideB?.thickness || skirtingThickMm);
          const skirtT_B = (rawTB > 100 || rawTB <= 0) ? 15 : rawTB;
          const thickSkirtB = skirtT_B / scaleFactor;

          // Helper: Identify outdoor deck / patio / alfresco / balcony / desk room names to suppress skirting on outdoor deck walls
          const isOutdoorRoom = (r) => {
            if (!r) return false;
            const nameStr = typeof r === "string" ? r : (r.room_name || r.roomName || r.name || r.label || "");
            const typeStr = typeof r === "object" ? (r.room_type || r.type || r.category || "") : "";
            const combined = `${nameStr} ${typeStr}`.toLowerCase();
            return /(balcony|deck|desk|alfresco|patio|porch|verandah|terrace|courtyard|outdoor|yard|carport|timber_deck)/i.test(combined);
          };

          // Resolve Side A Skirting Material & Finish Type (Tile / Gạch vs Wood / Gỗ)
          const finishTypeA = String(skirting.sideA?.material || skirting.sideA?.finishType || wall.finishTypeSideA || skirting.material || wall.skirtingMaterial || "").toLowerCase();
          const isTileA = finishTypeA.includes("tile") || finishTypeA.includes("gạch") || finishTypeA.includes("stone") || finishTypeA.includes("ceramic");
          const isWoodA = finishTypeA.includes("wood") || finishTypeA.includes("gỗ") || finishTypeA.includes("timber");

          const defaultColorA = isTileA ? "#cbd5e1" : (isWoodA ? "#5c3a21" : "#854d0e");
          let colorSkirtA = skirting.sideA?.color || skirting.color || wall.skirtingColor;
          if (!colorSkirtA || colorSkirtA === "#854d0e") {
            colorSkirtA = defaultColorA;
          }

          // Resolve Side B Skirting Material & Finish Type (Tile / Gạch vs Wood / Gỗ)
          const finishTypeB = String(skirting.sideB?.material || skirting.sideB?.finishType || wall.finishTypeSideB || skirting.material || wall.skirtingMaterial || "").toLowerCase();
          const isTileB = finishTypeB.includes("tile") || finishTypeB.includes("gạch") || finishTypeB.includes("stone") || finishTypeB.includes("ceramic");
          const isWoodB = finishTypeB.includes("wood") || finishTypeB.includes("gỗ") || finishTypeB.includes("timber");

          const defaultColorB = isTileB ? "#cbd5e1" : (isWoodB ? "#5c3a21" : "#854d0e");
          let colorSkirtB = skirting.sideB?.color || skirting.color || wall.skirtingColor;
          if (!colorSkirtB || colorSkirtB === "#854d0e") {
            colorSkirtB = defaultColorB;
          }

          const parseColor = (hexStr, fallback = "#854d0e") => {
            try {
              if (!hexStr || typeof hexStr !== "string") return new THREE.Color(fallback);
              return new THREE.Color(hexStr);
            } catch (e) {
              return new THREE.Color(fallback);
            }
          };

          const matSkirtA = new THREE.MeshStandardMaterial({
            color: parseColor(colorSkirtA, defaultColorA),
            roughness: isTileA ? 0.15 : 0.4, // Glossy ceramic tile finish vs satin timber wood
            metalness: isTileA ? 0.05 : 0.02,
          });
          const matSkirtB = new THREE.MeshStandardMaterial({
            color: parseColor(colorSkirtB, defaultColorB),
            roughness: isTileB ? 0.15 : 0.4, // Glossy ceramic tile finish vs satin timber wood
            metalness: isTileB ? 0.05 : 0.02,
          });

          // Check if wall is exterior wall using getWallClass
          const isExterior = getWallClass(wall) === "exterior_wall";

          let renderSideA3D = enableSkirtA;
          let renderSideB3D = enableSkirtB;

          // Check room polygon for Side A vs Side B to suppress skirting on exterior facades and outdoor Deck/Balcony walls
          const thickPx = wall.thickness_px || 20;
          const p1c = wall.centerline[0];
          const p2c = wall.centerline[1];
          const p1cX = (p1c[0] ?? p1c.x ?? 0), p1cY = (p1c[1] ?? p1c.y ?? 0);
          const p2cX = (p2c[0] ?? p2c.x ?? 0), p2cY = (p2c[1] ?? p2c.y ?? 0);
          const dxC = p2cX - p1cX;
          const dyC = p2cY - p1cY;
          const lenC = Math.hypot(dxC, dyC) || 1;
          const nxC = -dyC / lenC;
          const nyC = dxC / lenC;

          const midXC = (p1cX + p2cX) / 2;
          const midYC = (p1cY + p2cY) / 2;

          const isPointInPoly = (px, py, poly) => {
            if (!poly || poly.length < 3) return false;
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
              const xi = poly[i][0] ?? poly[i].x, yi = poly[i][1] ?? poly[i].y;
              const xj = poly[j][0] ?? poly[j].x, yj = poly[j][1] ?? poly[j].y;
              if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi)) inside = !inside;
            }
            return inside;
          };

          // Test multi-distance offsets (5px, 15px, 30px) to catch room boundaries robustly
          let roomA = null;
          let roomB = null;

          for (const off of [5, 15, 30]) {
            const ptA = [midXC - nxC * ((thickPx / 2) + off), midYC - nyC * ((thickPx / 2) + off)];
            const ptB = [midXC + nxC * ((thickPx / 2) + off), midYC + nyC * ((thickPx / 2) + off)];

            for (const r of (pageRooms || [])) {
              const poly = r.polygon || r.points || [];
              if (poly.length >= 3) {
                if (!roomA && isPointInPoly(ptA[0], ptA[1], poly)) roomA = r;
                if (!roomB && isPointInPoly(ptB[0], ptB[1], poly)) roomB = r;
              }
            }
          }

          // Disable Side A skirting if facing outside or facing an outdoor deck / balcony / desk room
          if (!roomA || isOutdoorRoom(roomA)) {
            renderSideA3D = false;
          }

          // Disable Side B skirting if facing outside or facing an outdoor deck / balcony / desk room
          if (!roomB || isOutdoorRoom(roomB)) {
            renderSideB3D = false;
          }

          // Suppress skirting explicitly on w-28 or w28 wall
          const wallIdLower = String(wall.id || "").toLowerCase();
          const baseIdLower = getBaseWallId ? String(getBaseWallId(wall.id)).toLowerCase() : wallIdLower;
          if (baseIdLower.includes("w-28") || baseIdLower.includes("w28") || wallIdLower.includes("w-28") || wallIdLower.includes("w28")) {
            renderSideA3D = false;
            renderSideB3D = false;
          }

          // Check if endpoints P1 and P2 connect to other walls at corner joints
          const isEndpointConnected = (px, py) => {
            const baseId = getBaseWallId ? getBaseWallId(wall.id) : wall.id.split('-A-')[0].split('-B-')[0];
            return (pageWalls || []).some(ow => {
              const owBaseId = getBaseWallId ? getBaseWallId(ow.id) : ow.id.split('-A-')[0].split('-B-')[0];
              if (ow.id === wall.id || owBaseId === baseId || !ow.centerline || ow.centerline.length !== 2) return false;
              const op1 = ow.centerline[0];
              const op2 = ow.centerline[1];
              const l2 = (op2[0] - op1[0]) ** 2 + (op2[1] - op1[1]) ** 2;
              if (l2 === 0) return Math.hypot(px - op1[0], py - op1[1]) <= 60;
              let t = ((px - op1[0]) * (op2[0] - op1[0]) + (py - op1[1]) * (op2[1] - op1[1])) / l2;
              t = Math.max(-0.5, Math.min(1.5, t));
              const projX = op1[0] + t * (op2[0] - op1[0]);
              const projY = op1[1] + t * (op2[1] - op1[1]);
              const dist = Math.hypot(px - projX, py - projY);
              const owThick = ow.thickness_px || 20;
              return dist <= Math.max(60, owThick + 35);
            });
          };

          // Deterministic door endpoint detection from cutWallsByDoors naming convention:
          // Segment A (-A-) has P2 at door jamb; Segment B (-B-) has P1 at door jamb.
          const wallIdStr = String(wall.id || "");
          const p1NearDoor = wallIdStr.includes("-B-");
          const p2NearDoor = wallIdStr.includes("-A-");

          const p1Connected = isEndpointConnected(x1, y1);
          const p2Connected = isEndpointConnected(x2, y2);

          // Extend corners at connected wall joints, but stop flush (no extension) at door jambs.
          const cornerExt = (thickness / 2) + Math.max(thickSkirtA, thickSkirtB);
          const extStart = (p1Connected && !p1NearDoor) ? -cornerExt : 0;
          const extEnd = (p2Connected && !p2NearDoor) ? length + cornerExt : length;
          const segLen = extEnd - extStart;

          if (segLen >= 0.1) {
            const segCenterPos = (extStart + extEnd) / 2;
            const centerOffsetFromMid = segCenterPos - (length / 2);

            const segMidX = midX + wallUx * centerOffsetFromMid;
            const segMidZ = midZ + wallUy * centerOffsetFromMid;

            // Skirting Side A
            if (renderSideA3D) {
              const geoSkirtA = new THREE.BoxGeometry(segLen, hSkirtA, thickSkirtA);
              const meshSkirtA = new THREE.Mesh(geoSkirtA, matSkirtA);
              const offsetSkirtA = -(thickness / 2) - (thickSkirtA / 2) - 0.02;
              meshSkirtA.position.set(segMidX + nx * offsetSkirtA, yOffset + hSkirtA / 2, segMidZ + nz * offsetSkirtA);
              meshSkirtA.rotation.y = -angle;
              scene.add(meshSkirtA);
              wallMeshesRef.current.push(meshSkirtA);
            }

            // Skirting Side B
            if (renderSideB3D) {
              const geoSkirtB = new THREE.BoxGeometry(segLen, hSkirtB, thickSkirtB);
              const meshSkirtB = new THREE.Mesh(geoSkirtB, matSkirtB);
              const offsetSkirtB = (thickness / 2) + (thickSkirtB / 2) + 0.02;
              meshSkirtB.position.set(segMidX + nx * offsetSkirtB, yOffset + hSkirtB / 2, segMidZ + nz * offsetSkirtB);
              meshSkirtB.rotation.y = -angle;
              scene.add(meshSkirtB);
              wallMeshesRef.current.push(meshSkirtB);
            }
          }

          // Render 3D End Cap Skirting for Standalone / Free Wall Tips (never on exterior building facades)
          const matSkirtCap = renderSideA3D ? matSkirtA : matSkirtB;
          const thickSkirtCap = renderSideA3D ? thickSkirtA : thickSkirtB;
          const hSkirtCap = renderSideA3D ? hSkirtA : hSkirtB;

          // Cap at P1 (start tip)
          if (!p1Connected && !p1NearDoor && !isExterior) {
            const capWidth = (thickness + thickSkirtA + thickSkirtB);
            const geoCapP1 = new THREE.BoxGeometry(thickSkirtCap, hSkirtCap, capWidth);
            const meshCapP1 = new THREE.Mesh(geoCapP1, matSkirtCap);

            const p1MidX = midX - wallUx * (length / 2);
            const p1MidZ = midZ - wallUy * (length / 2);

            meshCapP1.position.set(
              p1MidX - wallUx * (thickSkirtCap / 2),
              yOffset + hSkirtCap / 2,
              p1MidZ - wallUy * (thickSkirtCap / 2)
            );
            meshCapP1.rotation.y = -angle;
            scene.add(meshCapP1);
            wallMeshesRef.current.push(meshCapP1);
          }

          // Cap at P2 (end tip)
          if (!p2Connected && !p2NearDoor && !isExterior) {
            const capWidth = (thickness + thickSkirtA + thickSkirtB);
            const geoCapP2 = new THREE.BoxGeometry(thickSkirtCap, hSkirtCap, capWidth);
            const meshCapP2 = new THREE.Mesh(geoCapP2, matSkirtCap);

            const p2MidX = midX + wallUx * (length / 2);
            const p2MidZ = midZ + wallUy * (length / 2);

            meshCapP2.position.set(
              p2MidX + wallUx * (thickSkirtCap / 2),
              yOffset + hSkirtCap / 2,
              p2MidZ + wallUy * (thickSkirtCap / 2)
            );
            meshCapP2.rotation.y = -angle;
            scene.add(meshCapP2);
            wallMeshesRef.current.push(meshCapP2);
          }
        }
      });

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
          let nearestWall = null;

          const points = door.points || [];
          let p1 = points[0] ? (Array.isArray(points[0]) ? { x: points[0][0], y: points[0][1] } : points[0]) : null;
          let p2 = points[1] ? (Array.isArray(points[1]) ? { x: points[1][0], y: points[1][1] } : points[1]) : null;

          if (p1 && p2) {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dLen = Math.sqrt(dx * dx + dy * dy);
            if (dLen > 0) {
              let minPerpDist = Infinity;

              if (pageWalls && pageWalls.length > 0) {
                // 1. Match by door.parentWallId (handling base wall IDs)
                if (door.parentWallId) {
                  const parentBaseId = getBaseWallId ? getBaseWallId(door.parentWallId) : door.parentWallId.split('-A-')[0].split('-B-')[0];
                  nearestWall = pageWalls.find(w => {
                    const wBaseId = getBaseWallId ? getBaseWallId(w.id) : w.id.split('-A-')[0].split('-B-')[0];
                    return w.id === door.parentWallId || wBaseId === parentBaseId;
                  });
                }

                // 2. Search by perpendicular distance if not found by parentWallId
                if (!nearestWall) {
                  const cxSeg = (p1.x + p2.x) / 2;
                  const cySeg = (p1.y + p2.y) / 2;

                  pageWalls.forEach(w => {
                    if (!w.centerline || w.centerline.length < 2) return;
                    const wp1 = { x: w.centerline[0][0], y: w.centerline[0][1] };
                    const wp2 = { x: w.centerline[1][0], y: w.centerline[1][1] };

                    const wdx = wp2.x - wp1.x;
                    const wdy = wp2.y - wp1.y;
                    const L2 = wdx * wdx + wdy * wdy;
                    if (L2 < 0.1) return;

                    const perpDist = Math.abs(wdx * (cySeg - wp1.y) - wdy * (cxSeg - wp1.x)) / Math.sqrt(L2);
                    if (perpDist < minPerpDist) {
                      minPerpDist = perpDist;
                      nearestWall = w;
                    }
                  });
                }
              }

              if (nearestWall) {
                wallThickness = nearestWall.thickness_px || thickness;
                const wallHeightMmVal = nearestWall.height || nearestWall.height_mm || wallHeightMm;
                hostWallHeightPx = wallHeightMmVal / scaleFactor;
                hostWallClass = getWallClass(nearestWall);

                const wp1 = { x: nearestWall.centerline[0][0], y: nearestWall.centerline[0][1] };
                const wp2 = { x: nearestWall.centerline[1][0], y: nearestWall.centerline[1][1] };
                const wdx = wp2.x - wp1.x;
                const wdy = wp2.y - wp1.y;
                const wLen = Math.hypot(wdx, wdy);

                if (wLen > 0.1) {
                  hostWallAngle = angle;
                  const uxW = wdx / wLen;
                  const uyW = wdy / wLen;
                  const tProj = (cx - wp1.x) * uxW + (cy - wp1.y) * uyW;
                  hostWallCx = wp1.x + tProj * uxW;
                  hostWallCy = wp1.y + tProj * uyW;
                }
              }
            }
          }

          // Determine exact host wall color to eliminate filler wall color mismatch
          let hostWallColorHex = "#c49a6c";
          if (nearestWall) {
            const wClass = getWallClass(nearestWall);
            const wType = getWallType(nearestWall);
            const wHeightVal = (typeof nearestWall.height_mm === 'number' && nearestWall.height_mm >= 500)
              ? nearestWall.height_mm
              : ((typeof nearestWall.height === 'number' && nearestWall.height >= 500) ? nearestWall.height : wallHeightMm);

            if (wallColorMode === "type") {
              if (wType === "ext") hostWallColorHex = extWallColor || "#c49a6c";
              else if (wType === "part") hostWallColorHex = partWallColor || "#cbd5e1";
              else hostWallColorHex = intWallColor || "#f4f1ea";
            } else if (wallColorMode === "height") {
              if (wHeightVal < 2500) hostWallColorHex = heightTier1Color;
              else if (wHeightVal < 2850) hostWallColorHex = heightTier2Color;
              else if (wHeightVal < 3300) hostWallColorHex = heightTier3Color;
              else hostWallColorHex = heightTier4Color;
            } else {
              hostWallColorHex = wClass === "exterior_wall" ? (extWallColor || "#c49a6c") : "#f4f1ea";
            }
          } else {
            hostWallColorHex = extWallColor || "#c49a6c";
          }

          const fillerMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(hostWallColorHex),
            roughness: 0.45,
            metalness: 0.05
          });

          const doorGroup = new THREE.Group();
          const dClass = door.class || "";
          const isWindow = dClass.includes("window") || (door.door_name && door.door_name.toLowerCase().includes("window")) || door.doorTypeId === "win_standard";

          if (isWindow) {
            const sillHeight = hostWallHeightPx * 0.375;
            const headerHeight = hostWallHeightPx * 0.875;
            const windowHeight = headerHeight - sillHeight;

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

            // High-End Anodized Architectural Window Frame System
            const frameThickness = 2.5;
            const frameDepth = wallThickness + 3;
            const windowFrameMat = new THREE.MeshStandardMaterial({
              color: 0x0f172a, // Anodized architectural dark slate charcoal frame
              roughness: 0.3,
              metalness: 0.85
            });

            // Outer Frame Posts & Headers
            const leftPostGeo = new THREE.BoxGeometry(frameThickness, windowHeight, frameDepth);
            const leftPost = new THREE.Mesh(leftPostGeo, windowFrameMat);
            leftPost.position.set(-length / 2 + frameThickness / 2, sillHeight + windowHeight / 2, 0);
            leftPost.castShadow = enableShadows;
            leftPost.receiveShadow = enableShadows;
            doorGroup.add(leftPost);

            const rightPostGeo = new THREE.BoxGeometry(frameThickness, windowHeight, frameDepth);
            const rightPost = new THREE.Mesh(rightPostGeo, windowFrameMat);
            rightPost.position.set(length / 2 - frameThickness / 2, sillHeight + windowHeight / 2, 0);
            rightPost.castShadow = enableShadows;
            rightPost.receiveShadow = enableShadows;
            doorGroup.add(rightPost);

            const topFrameGeo = new THREE.BoxGeometry(length, frameThickness, frameDepth);
            const topFrame = new THREE.Mesh(topFrameGeo, windowFrameMat);
            topFrame.position.set(0, headerHeight - frameThickness / 2, 0);
            topFrame.castShadow = enableShadows;
            topFrame.receiveShadow = enableShadows;
            doorGroup.add(topFrame);

            const bottomFrameGeo = new THREE.BoxGeometry(length, frameThickness, frameDepth);
            const bottomFrame = new THREE.Mesh(bottomFrameGeo, windowFrameMat);
            bottomFrame.position.set(0, sillHeight + frameThickness / 2, 0);
            bottomFrame.castShadow = enableShadows;
            bottomFrame.receiveShadow = enableShadows;
            doorGroup.add(bottomFrame);

            // Protruding Architectural Exterior Window Sill Cap
            const sillCapGeo = new THREE.BoxGeometry(length + 4, 1.8, frameDepth + 4);
            const sillCapMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.1 });
            const sillCapMesh = new THREE.Mesh(sillCapGeo, sillCapMat);
            sillCapMesh.position.set(0, sillHeight, 0);
            sillCapMesh.castShadow = enableShadows;
            doorGroup.add(sillCapMesh);

            // Vertical Center Mullion Divider for Windows > 1200mm
            if (length > 60) {
              const mullionGeo = new THREE.BoxGeometry(1.8, windowHeight - frameThickness * 2, frameDepth - 1);
              const mullionMesh = new THREE.Mesh(mullionGeo, windowFrameMat);
              mullionMesh.position.set(0, sillHeight + windowHeight / 2, 0);
              mullionMesh.castShadow = enableShadows;
              doorGroup.add(mullionMesh);
            }

            // High-Clarity Reflective Low-E Architectural Glass Panes
            const glassGeo = new THREE.BoxGeometry(length - frameThickness * 2, windowHeight - frameThickness * 2, 0.8);
            const glassMat = new THREE.MeshPhysicalMaterial({
              color: 0x38bdf8, // Subtle cyan-blue low-E glass tint
              transparent: true,
              opacity: 0.32,
              roughness: 0.05,
              metalness: 0.95,
              transmission: 0.95,
              thickness: 1.2,
              reflectivity: 0.95
            });
            const glassMesh = new THREE.Mesh(glassGeo, glassMat);
            glassMesh.position.set(0, sillHeight + windowHeight / 2, 0);
            doorGroup.add(glassMesh);
          } else {
            const calculatedDoorHeightPx = door.height_mm ? (door.height_mm / scaleFactor) : (hostWallHeightPx * 0.85);
            const frameHeight = Math.min(calculatedDoorHeightPx, hostWallHeightPx - 1);

            const topDoorWallHeight = hostWallHeightPx - frameHeight;
            if (topDoorWallHeight > 0.1) {
              const topDoorWallGeo = new THREE.BoxGeometry(length, topDoorWallHeight, wallThickness);
              const topDoorWallMesh = new THREE.Mesh(topDoorWallGeo, fillerMat);
              topDoorWallMesh.position.set(0, frameHeight + topDoorWallHeight / 2, 0);
              topDoorWallMesh.castShadow = enableShadows;
              topDoorWallMesh.receiveShadow = enableShadows;
              doorGroup.add(topDoorWallMesh);
            }

            const frameMat = new THREE.MeshStandardMaterial({
              color: 0x1e293b, // Modern architectural dark charcoal frame
              roughness: 0.5,
              metalness: 0.2
            });

            const postThickness = 3;
            const frameDepth = wallThickness + 4;

            // Render Door Threshold Transition Piece (covers floor gap under door opening)
            const thresholdHeight = 0.6;
            const thresholdDepth = frameDepth + 2;
            const thresholdGeo = new THREE.BoxGeometry(length + 2, thresholdHeight, thresholdDepth);
            const thresholdMat = new THREE.MeshStandardMaterial({
              color: hostWallClass === "exterior_wall" ? 0x475569 : 0xd4a373,
              roughness: 0.4,
              metalness: 0.1
            });
            const thresholdMesh = new THREE.Mesh(thresholdGeo, thresholdMat);
            thresholdMesh.position.set(0, thresholdHeight / 2, 0);
            thresholdMesh.receiveShadow = enableShadows;
            doorGroup.add(thresholdMesh);

            const leftPostGeo = new THREE.BoxGeometry(postThickness, frameHeight, frameDepth);
            const leftPost = new THREE.Mesh(leftPostGeo, frameMat);
            leftPost.position.set(-length / 2, frameHeight / 2, 0);
            leftPost.castShadow = enableShadows;
            leftPost.receiveShadow = enableShadows;
            doorGroup.add(leftPost);

            const rightPostGeo = new THREE.BoxGeometry(postThickness, frameHeight, frameDepth);
            const rightPost = new THREE.Mesh(rightPostGeo, frameMat);
            rightPost.position.set(length / 2, frameHeight / 2, 0);
            rightPost.castShadow = enableShadows;
            rightPost.receiveShadow = enableShadows;
            doorGroup.add(rightPost);

            const headerGeo = new THREE.BoxGeometry(length, postThickness, frameDepth);
            const header = new THREE.Mesh(headerGeo, frameMat);
            header.position.set(0, frameHeight - postThickness / 2, 0);
            header.castShadow = enableShadows;
            header.receiveShadow = enableShadows;
            doorGroup.add(header);

            const isDouble = dClass.includes("double") || (door.door_name && door.door_name.toLowerCase().includes("2x"));
            const isSliding = dClass.includes("sliding") || dClass.includes("slider") || dClass.includes("cavity");
            const isGarage = dClass.includes("garage") || dClass.includes("roller");

            const slabHeight = frameHeight - postThickness;
            const slabThick = 4;
            const slabMat = new THREE.MeshStandardMaterial({
              color: 0x78350f, // Warm rich walnut architectural timber
              roughness: 0.4,
              metalness: 0.05,
              side: THREE.DoubleSide
            });

            if (isGarage) {
              const numSections = 4;
              const secH = slabHeight / numSections;
              const pWidth = length - postThickness;

              for (let sIdx = 0; sIdx < numSections; sIdx++) {
                const mainPanelGeo = new THREE.BoxGeometry(pWidth, secH - 1, 4);
                const panel = new THREE.Mesh(mainPanelGeo, slabMat);
                panel.position.set(0, sIdx * secH + secH / 2, 0);
                panel.castShadow = enableShadows;
                panel.receiveShadow = enableShadows;
                doorGroup.add(panel);
              }
            } else if (isSliding) {
              const pWidth = (length - postThickness) / 2;
              const fixedGroup = new THREE.Group();
              const b1 = new THREE.Mesh(new THREE.BoxGeometry(2, slabHeight, slabThick), slabMat);
              const b2 = new THREE.Mesh(new THREE.BoxGeometry(2, slabHeight, slabThick), slabMat);
              b1.position.set(-pWidth / 2, slabHeight / 2, 0);
              b2.position.set(pWidth / 2, slabHeight / 2, 0);
              fixedGroup.add(b1, b2);
              fixedGroup.position.set(-pWidth / 2, 0, -2);
              doorGroup.add(fixedGroup);

              const activeGroup = new THREE.Group();
              const ab1 = new THREE.Mesh(new THREE.BoxGeometry(2, slabHeight, slabThick), slabMat);
              const ab2 = new THREE.Mesh(new THREE.BoxGeometry(2, slabHeight, slabThick), slabMat);
              ab1.position.set(-pWidth / 2, slabHeight / 2, 0);
              ab2.position.set(pWidth / 2, slabHeight / 2, 0);
              activeGroup.add(ab1, ab2);
              activeGroup.position.set(pWidth / 4, 0, 2);
              doorGroup.add(activeGroup);
            } else if (isDouble) {
              const pWidth = (length - postThickness) / 2;

              // Left panel group (pivot on left side)
              const leftGroup = new THREE.Group();
              leftGroup.position.set(-length / 2 + postThickness / 2, 0, 0);
              const leftSlab = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
              leftSlab.position.set(pWidth / 2, slabHeight / 2, 0);
              leftSlab.castShadow = enableShadows;
              leftSlab.receiveShadow = enableShadows;
              leftGroup.add(leftSlab);
              leftGroup.rotation.y = 0.8; // swing open 45 degrees

              // Right panel group (pivot on right side)
              const rightGroup = new THREE.Group();
              rightGroup.position.set(length / 2 - postThickness / 2, 0, 0);
              const rightSlab = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
              rightSlab.position.set(-pWidth / 2, slabHeight / 2, 0);
              rightSlab.castShadow = enableShadows;
              rightSlab.receiveShadow = enableShadows;
              rightGroup.add(rightSlab);
              rightGroup.rotation.y = -0.8; // swing open -45 degrees

              doorGroup.add(leftGroup, rightGroup);
            } else {
              const pWidth = length - postThickness;
              const panelGroup = new THREE.Group();

              const hingeSide = (door.hinge_side || door.hingeSide || "left").toLowerCase();
              const swingDir = (door.swing_direction || door.swing || "inward").toLowerCase();
              const isRightHinge = hingeSide === "right";
              const isOutward = swingDir === "outward";

              const pivotX = isRightHinge ? (length / 2 - postThickness / 2) : (-length / 2 + postThickness / 2);
              const slabOffsetX = isRightHinge ? -pWidth / 2 : pWidth / 2;

              let swingAngle = 0.85; // 48 degrees open
              if (isRightHinge) {
                swingAngle = isOutward ? 0.85 : -0.85;
              } else {
                swingAngle = isOutward ? -0.85 : 0.85;
              }

              panelGroup.position.set(pivotX, 0, 0);

              const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(pWidth, slabHeight, slabThick), slabMat);
              slabMesh.position.set(slabOffsetX, slabHeight / 2, 0);
              slabMesh.castShadow = enableShadows;
              slabMesh.receiveShadow = enableShadows;
              panelGroup.add(slabMesh);

              // Metallic Lever Handle
              const handleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.9 });
              const handleGroup = new THREE.Group();
              const knobMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 12), handleMat);
              knobMesh.rotation.x = Math.PI / 2;
              const leverMesh = new THREE.Mesh(new THREE.BoxGeometry(6, 1.0, 1.2), handleMat);
              const handleX = isRightHinge ? (-pWidth + 6) : (pWidth - 6);
              const handleZ = isOutward ? (-slabThick / 2 - 1.2) : (slabThick / 2 + 1.2);
              handleGroup.position.set(handleX, slabHeight * 0.5, handleZ);
              leverMesh.position.set(isRightHinge ? -2.0 : 2.0, 0, isOutward ? -1.2 : 1.2);
              handleGroup.add(knobMesh, leverMesh);
              panelGroup.add(handleGroup);

              panelGroup.rotation.y = swingAngle;
              doorGroup.add(panelGroup);
            }
          }

          doorGroup.userData = { isDoorMesh: true, doorId: door.id, pageIndex: originalIndex, door: door };
          doorGroup.position.set(hostWallCx - imgSize.w / 2, yOffset, hostWallCy - imgSize.h / 2);
          doorGroup.rotation.y = -hostWallAngle;

          scene.add(doorGroup);
          doorMeshesRef.current.push(doorGroup);
        });
      }
    });
  }, [
    pages, wallsByPage, doorsByPage, roomsByPage, roofsByPage, sortedPageIndices, visibleLevels,
    showFloors, showPDF, showDoors, showRoofs, wallHeight, floorDepth, realScale, enableShadows,
    wallColorMode, extWallColor, intWallColor, partWallColor, heightTier1Color, heightTier2Color, heightTier3Color, heightTier4Color,
    selected3DWall, selectedId, levelBaseYOffsets, pageHeightsMm
  ]);

  return (
    <div
      style={{
        position: "relative",
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
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          cursor: "grab"
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

        {/* Floor Depth Input & Quick Presets */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "#d1d5db" }}>
            <span>Floor Slab Depth</span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="number"
                min="0"
                max="5000"
                step="50"
                value={floorDepthMm}
                onChange={(e) => {
                  const str = e.target.value;
                  if (str === "") {
                    setFloorDepthMm(0);
                    return;
                  }
                  const val = Math.max(0, parseInt(str, 10) || 0);
                  setFloorDepthMm(val);
                }}
                style={{
                  width: "80px",
                  padding: "4px 8px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  fontFamily: "monospace",
                  color: "#60a5fa",
                  backgroundColor: "rgba(15, 23, 42, 0.7)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "6px",
                  outline: "none",
                  textAlign: "right"
                }}
              />
              <span style={{ fontSize: "11px", color: "#9ca3af" }}>mm</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {[0, 150, 300, 500].map((presetMm) => (
              <button
                key={presetMm}
                onClick={() => setFloorDepthMm(presetMm)}
                style={{
                  flex: 1,
                  padding: "3px 4px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  borderRadius: "4px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: floorDepthMm === presetMm ? "#3b82f6" : "rgba(15, 23, 42, 0.5)",
                  color: floorDepthMm === presetMm ? "#ffffff" : "#9ca3af",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                {presetMm === 0 ? "0 (Không Sàn)" : `${presetMm}mm`}
              </button>
            ))}
          </div>
        </div>

        {/* 🎨 WALL COLOR MODE & CUSTOMIZATION */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "12px" }}>
          <div style={{ fontSize: "11px", fontWeight: "bold", color: "#60a5fa", letterSpacing: "0.05em" }}>
            🎨 WALL COLORING
          </div>

          <div style={{ display: "flex", gap: "4px", backgroundColor: "rgba(15, 23, 42, 0.6)", padding: "4px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <button
              onClick={() => setWallColorMode("type")}
              style={{
                flex: 1,
                padding: "4px 6px",
                fontSize: "11px",
                fontWeight: "bold",
                borderRadius: "6px",
                border: "none",
                backgroundColor: wallColorMode === "type" ? "#3b82f6" : "transparent",
                color: wallColorMode === "type" ? "#ffffff" : "#9ca3af",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Ext / Int
            </button>
            <button
              onClick={() => setWallColorMode("height")}
              style={{
                flex: 1,
                padding: "4px 6px",
                fontSize: "11px",
                fontWeight: "bold",
                borderRadius: "6px",
                border: "none",
                backgroundColor: wallColorMode === "height" ? "#3b82f6" : "transparent",
                color: wallColorMode === "height" ? "#ffffff" : "#9ca3af",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              By Height
            </button>
            <button
              onClick={() => setWallColorMode("default")}
              style={{
                flex: 1,
                padding: "4px 6px",
                fontSize: "11px",
                fontWeight: "bold",
                borderRadius: "6px",
                border: "none",
                backgroundColor: wallColorMode === "default" ? "#3b82f6" : "transparent",
                color: wallColorMode === "default" ? "#ffffff" : "#9ca3af",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              Default
            </button>
          </div>

          {/* Color Pickers for Ext vs Int */}
          {wallColorMode === "type" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "#d1d5db" }}>
                <span>Exterior Wall</span>
                <input
                  type="color"
                  value={extWallColor}
                  onChange={(e) => setExtWallColor(e.target.value)}
                  style={{ width: "24px", height: "24px", padding: 0, border: "none", borderRadius: "4px", cursor: "pointer", backgroundColor: "transparent" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "#d1d5db" }}>
                <span>Interior Wall</span>
                <input
                  type="color"
                  value={intWallColor}
                  onChange={(e) => setIntWallColor(e.target.value)}
                  style={{ width: "24px", height: "24px", padding: 0, border: "none", borderRadius: "4px", cursor: "pointer", backgroundColor: "transparent" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "#d1d5db" }}>
                <span>Partition Wall</span>
                <input
                  type="color"
                  value={partWallColor}
                  onChange={(e) => setPartWallColor(e.target.value)}
                  style={{ width: "24px", height: "24px", padding: 0, border: "none", borderRadius: "4px", cursor: "pointer", backgroundColor: "transparent" }}
                />
              </div>
            </div>
          )}

          {/* Color Pickers for Height Tiers */}
          {wallColorMode === "height" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "#d1d5db" }}>
                <span>&lt; 2500mm</span>
                <input
                  type="color"
                  value={heightTier1Color}
                  onChange={(e) => setHeightTier1Color(e.target.value)}
                  style={{ width: "24px", height: "24px", padding: 0, border: "none", borderRadius: "4px", cursor: "pointer", backgroundColor: "transparent" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "#d1d5db" }}>
                <span>2500 - 2850mm</span>
                <input
                  type="color"
                  value={heightTier2Color}
                  onChange={(e) => setHeightTier2Color(e.target.value)}
                  style={{ width: "24px", height: "24px", padding: 0, border: "none", borderRadius: "4px", cursor: "pointer", backgroundColor: "transparent" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "#d1d5db" }}>
                <span>2850 - 3250mm</span>
                <input
                  type="color"
                  value={heightTier3Color}
                  onChange={(e) => setHeightTier3Color(e.target.value)}
                  style={{ width: "24px", height: "24px", padding: 0, border: "none", borderRadius: "4px", cursor: "pointer", backgroundColor: "transparent" }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: "#d1d5db" }}>
                <span>&gt; 3250mm</span>
                <input
                  type="color"
                  value={heightTier4Color}
                  onChange={(e) => setHeightTier4Color(e.target.value)}
                  style={{ width: "24px", height: "24px", padding: 0, border: "none", borderRadius: "4px", cursor: "pointer", backgroundColor: "transparent" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "12px" }}>
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
            <span>Show Grid helper</span>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={() => setShowGrid(v => !v)}
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

          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: "#d1d5db" }}>
            <span style={{ color: !showRoofs ? "#f87171" : "#d1d5db" }}>Hide Roof (Ẩn Mái)</span>
            <input
              type="checkbox"
              checked={!showRoofs}
              onChange={() => setShowRoofs(v => !v)}
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "4px",
                cursor: "pointer",
                accentColor: "#ef4444"
              }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: "#d1d5db" }}>
            <span style={{ color: visibleLevels[1] === false ? "#f87171" : "#d1d5db" }}>Hide Tầng 2 (Ẩn Lầu 1)</span>
            <input
              type="checkbox"
              checked={visibleLevels[1] === false}
              onChange={(e) => {
                const hideL2 = e.target.checked;
                setVisibleLevels(prev => ({
                  ...prev,
                  1: !hideL2
                }));
              }}
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "4px",
                cursor: "pointer",
                accentColor: "#ef4444"
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

      {/* 3D SELECTED WALL EDITING FLOATING CARD */}
      {selected3DWall && (
        <div
          style={{
            position: "absolute",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 20,
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(249, 115, 22, 0.6)",
            borderRadius: "16px",
            padding: "16px 20px",
            width: "360px",
            color: "#ffffff",
            boxShadow: "0 16px 48px rgba(0, 0, 0, 0.7), 0 0 20px rgba(249, 115, 22, 0.25)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            fontFamily: "'Outfit', 'Inter', sans-serif"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>🧱</span>
              <div>
                <div style={{ fontWeight: "bold", fontSize: "13px", color: "#f97316" }}>
                  Selected Wall ({liveSelectedWallType === "ext" ? "Exterior" : (liveSelectedWallType === "part" ? "Partition" : "Interior")})
                </div>
                <div style={{ fontSize: "10px", color: "#9ca3af", fontFamily: "monospace" }}>
                  ID: {selected3DWall.wallId}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelected3DWall(null)}
              style={{
                background: "none",
                border: "none",
                color: "#9ca3af",
                fontSize: "14px",
                cursor: "pointer",
                padding: "2px 6px"
              }}
            >
              ✕
            </button>
          </div>

          {/* Wall Type Dropdown */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
            <span style={{ color: "#d1d5db" }}>Wall Type:</span>
            <select
              value={liveSelectedWallType}
              onChange={(e) => handleUpdateSelectedWallType(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: "6px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                backgroundColor: "rgba(30, 41, 59, 0.9)",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer"
              }}
            >
              <option value="ext">Exterior Wall (Ngoại thất)</option>
              <option value="int">Interior Wall (Nội thất)</option>
              <option value="part">Partition Wall (Vách ngăn)</option>
            </select>
          </div>

          {/* Height Input Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
              <span style={{ color: "#d1d5db" }}>3D Height (mm):</span>
              <input
                type="number"
                step="50"
                min="500"
                max="10000"
                value={liveSelectedWallHeight}
                onChange={(e) => handleUpdateSelectedWallHeight(Number(e.target.value))}
                style={{
                  width: "90px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid rgba(249, 115, 22, 0.5)",
                  backgroundColor: "rgba(30, 41, 59, 0.8)",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: "bold",
                  textAlign: "center"
                }}
              />
            </div>



            {/* Quick Height Presets */}
            <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
              {[2400, 2700, 3000, 3600].map(hPreset => (
                <button
                  key={hPreset}
                  onClick={() => handleUpdateSelectedWallHeight(hPreset)}
                  style={{
                    flex: 1,
                    padding: "4px 0",
                    borderRadius: "6px",
                    border: liveSelectedWallHeight === hPreset ? "1px solid #f97316" : "1px solid rgba(255,255,255,0.1)",
                    backgroundColor: liveSelectedWallHeight === hPreset ? "rgba(249, 115, 22, 0.2)" : "rgba(30, 41, 59, 0.5)",
                    color: liveSelectedWallHeight === hPreset ? "#f97316" : "#cbd5e1",
                    fontSize: "11px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  {hPreset}mm
                </button>
              ))}
            </div>

            <button
              onClick={() => handleApplyHeightToAllWalls(liveSelectedWallHeight)}
              style={{
                marginTop: "4px",
                padding: "6px",
                borderRadius: "6px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                backgroundColor: "rgba(30, 41, 59, 0.7)",
                color: "#e2e8f0",
                fontSize: "11px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.2)"}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = "rgba(30, 41, 59, 0.7)"}
            >
              🌐 Apply this height to ALL walls
            </button>
          </div>
        </div>
      )}

      {/* 3D SELECTED DOOR EDITING FLOATING CARD */}
      {selected3DDoor && (() => {
        const pageIdx = selected3DDoor.pageIndex !== undefined ? selected3DDoor.pageIndex : currentPage;
        const liveDoor = (doorsByPage[pageIdx] || []).find(d => d.id === selected3DDoor.doorId) || selected3DDoor.door;
        const hingeSide = liveDoor.hinge_side || liveDoor.hingeSide || "left";
        const swingDir = liveDoor.swing_direction || liveDoor.swing || "inward";
        const widthMm = liveDoor.width_mm || 900;
        const heightMm = liveDoor.height_mm || 2100;

        const handleUpdate = (updates) => {
          const updatedDoor = { ...liveDoor, ...updates };
          if (updateDoor) updateDoor(updatedDoor);
          else if (setDoorsByPage) {
            setDoorsByPage(prev => {
              const pageDoors = prev[pageIdx] || [];
              return {
                ...prev,
                [pageIdx]: pageDoors.map(d => d.id === liveDoor.id ? updatedDoor : d)
              };
            });
          }
          setSelected3DDoor(prev => prev ? { ...prev, door: updatedDoor } : null);
        };

        return (
          <div
            style={{
              position: "absolute",
              bottom: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 20,
              backgroundColor: "rgba(15, 23, 42, 0.95)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "1px solid rgba(59, 130, 246, 0.6)",
              borderRadius: "16px",
              padding: "16px 20px",
              width: "380px",
              color: "#ffffff",
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.7), 0 0 20px rgba(59, 130, 246, 0.25)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              fontFamily: "'Outfit', 'Inter', sans-serif"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>🚪</span>
                <div>
                  <div style={{ fontWeight: "bold", fontSize: "13px", color: "#60a5fa" }}>
                    Selected 3D Door ({liveDoor.door_name || liveDoor.id})
                  </div>
                  <div style={{ fontSize: "10px", color: "#9ca3af", fontFamily: "monospace" }}>
                    Hinge: {hingeSide} | Swing: {swingDir}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelected3DDoor(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#9ca3af",
                  fontSize: "14px",
                  cursor: "pointer",
                  padding: "2px 6px"
                }}
              >
                ✕
              </button>
            </div>

            {/* Quick Flip Action Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button
                onClick={() => handleUpdate({ hinge_side: hingeSide === "left" ? "right" : "left", hingeSide: hingeSide === "left" ? "right" : "left" })}
                style={{
                  padding: "8px 10px",
                  fontSize: "11px",
                  fontWeight: "bold",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#3b82f6",
                  color: "#ffffff",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(59, 130, 246, 0.4)",
                  transition: "all 0.15s"
                }}
              >
                ↔️ Lật Trái/Phải
              </button>
              <button
                onClick={() => handleUpdate({ swing_direction: swingDir === "inward" ? "outward" : "inward", swing: swingDir === "inward" ? "outward" : "inward" })}
                style={{
                  padding: "8px 10px",
                  fontSize: "11px",
                  fontWeight: "bold",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#10b981",
                  color: "#ffffff",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(16, 185, 129, 0.4)",
                  transition: "all 0.15s"
                }}
              >
                ↕️ Lật Trong/Ngoài
              </button>
            </div>

            {/* Width & Height Inputs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "4px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "#9ca3af", display: "block", marginBottom: "4px" }}>Rộng Width (mm)</label>
                <input
                  type="number"
                  value={widthMm}
                  onChange={(e) => handleUpdate({ width_mm: Number(e.target.value) || 900 })}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    backgroundColor: "rgba(0,0,0,0.4)",
                    color: "#ffffff",
                    fontSize: "12px"
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "#9ca3af", display: "block", marginBottom: "4px" }}>Cao Height (mm)</label>
                <input
                  type="number"
                  value={heightMm}
                  onChange={(e) => handleUpdate({ height_mm: Number(e.target.value) || 2100 })}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    backgroundColor: "rgba(0,0,0,0.4)",
                    color: "#ffffff",
                    fontSize: "12px"
                  }}
                />
              </div>
            </div>
          </div>
        );
      })()}

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
        <div>🖱 <b>Click Wall:</b> Select & Edit 3D Height</div>
        <div>🖱 <b>Left Click + Drag:</b> Rotate Scene</div>
        <div>🖱 <b>Right Click + Drag:</b> Pan Camera</div>
        <div>🖱 <b>Scroll Wheel:</b> Zoom In / Out</div>
      </div>
    </div>
  );
}
