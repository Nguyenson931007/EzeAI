import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export default function Wall3DView({ walls = [], rooms = [], image, imgSize, onClose, realScale }) {
  const mountRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const mmToPx = realScale ? (1 / realScale) : (1 / 20);
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const imgW = imgSize?.w || 2000;
    const imgH = imgSize?.h || 2000;
    const centerX = imgW / 2;
    const centerY = imgH / 2;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e); // Premium dark background

    const maxDim = Math.max(imgW, imgH);
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, maxDim * 20);
    camera.position.set(maxDim * 0.5, maxDim * 0.5, maxDim * 0.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    // === LIGHTING ===
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(maxDim, maxDim, maxDim);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0xffaa00, 0.5);
    pointLight.position.set(0, maxDim * 0.2, 0);
    scene.add(pointLight);

    // === TEXTURE GENERATORS ===
    const createWoodTexture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#8B5E3C";
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = "#5D3A1A";
      ctx.lineWidth = 2;
      for (let i = 0; i < 256; i += 10) {
        ctx.beginPath();
        ctx.moveTo(0, i + Math.random() * 5);
        ctx.lineTo(256, i + Math.random() * 5);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(5, 5);
      return tex;
    };

    const createTileTexture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#e0e0e0";
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = "#999999";
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, 256, 256);
      ctx.strokeRect(128, 0, 128, 128);
      ctx.strokeRect(0, 128, 128, 128);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(10, 10);
      return tex;
    };

    const woodTex = createWoodTexture();
    const tileTex = createTileTexture();

    // === MATERIALS ===
    const wallMaterial = new THREE.MeshStandardMaterial({ 
      color: '#ffffff', 
      roughness: 0.8, 
      metalness: 0.1 
    });
    
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.2 });

    const getMiterPoints = (points, thicknessMm, isClosed) => {
      const thicknessPx = thicknessMm * mmToPx;
      const half = thicknessPx / 2;
      const left = [], right = [];
      const n = points.length;

      for (let i = 0; i < n; i++) {
        const curr = points[i];
        const prev = points[i === 0 ? (isClosed ? n - 1 : 0) : i - 1];
        const next = points[i === n - 1 ? (isClosed ? 0 : n - 1) : i + 1];

        const v1x = curr.x - prev.x, v1y = curr.y - prev.y;
        const v2x = next.x - curr.x, v2y = next.y - curr.y;
        const mag1 = Math.hypot(v1x, v1y) || 1;
        const mag2 = Math.hypot(v2x, v2y) || 1;
        const u1x = v1x / mag1, u1y = v1y / mag1;
        const u2x = v2x / mag2, u2y = v2y / mag2;
        const n1x = -u1y, n1y = u1x;
        const n2x = -u2y, n2y = u2x;

        let bx, by, miterLen;
        if (i === 0 && !isClosed) {
          bx = n2x; by = n2y; miterLen = half;
        } else if (i === n - 1 && !isClosed) {
          bx = n1x; by = n1y; miterLen = half;
        } else {
          const tx = u1x + u2x, ty = u1y + u2y;
          const magT = Math.hypot(tx, ty) || 1;
          bx = -ty / magT; by = tx / magT;
          const dot = bx * n1x + by * n1y;
          miterLen = half / (dot || 1);
          if (Math.abs(miterLen) > thicknessPx * 2) miterLen = Math.sign(miterLen) * thicknessPx * 2;
        }

        const cx = curr.x - centerX;
        const cy = centerY - curr.y;
        left.push(new THREE.Vector2(cx + bx * miterLen, cy - by * miterLen));
        right.push(new THREE.Vector2(cx - bx * miterLen, cy + by * miterLen));
      }
      return { left, right };
    };

    const renderWallPiece = (pts, thickness, heightPx, bottomPx = 0) => {
      if (pts.length < 2) return;
      const { left, right } = getMiterPoints(pts, thickness, false);
      const shape = new THREE.Shape();
      shape.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < left.length; i++) shape.lineTo(left[i].x, left[i].y);
      for (let i = right.length - 1; i >= 0; i--) shape.lineTo(right[i].x, right[i].y);
      shape.closePath();

      const geometry = new THREE.ExtrudeGeometry(shape, { depth: heightPx, bevelEnabled: false });
      const mesh = new THREE.Mesh(geometry, wallMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = bottomPx;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      scene.add(mesh);

      const edges = new THREE.EdgesGeometry(geometry);
      const line = new THREE.LineSegments(edges, edgeMaterial);
      line.rotation.x = -Math.PI / 2;
      line.position.y = bottomPx;
      scene.add(line);
    };

    // Render Walls
    walls.forEach(wall => {
      const wallHeightPx = (wall.height || 2400) * mmToPx;
      const wallThickness = wall.thickness || 90;

      const { left, right } = getMiterPoints(wall.points, wallThickness, wall.isClosed);
      const shape = new THREE.Shape();
      shape.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < left.length; i++) shape.lineTo(left[i].x, left[i].y);
      if (wall.isClosed) {
        const innerPath = new THREE.Path();
        innerPath.moveTo(right[0].x, right[0].y);
        for (let i = 1; i < right.length; i++) innerPath.lineTo(right[i].x, right[i].y);
        innerPath.closePath();
        shape.holes.push(innerPath);
      } else {
        for (let i = right.length - 1; i >= 0; i--) shape.lineTo(right[i].x, right[i].y);
        shape.closePath();
      }
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: wallHeightPx, bevelEnabled: false });
      const mesh = new THREE.Mesh(geometry, wallMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      scene.add(mesh);
    });

    // === RENDER ROOMS WITH TEXTURES ===
    rooms.forEach(room => {
      const pts = room.polygon;
      if (!pts || pts.length < 3) return;
      const shape = new THREE.Shape();
      shape.moveTo(pts[0].x - centerX, centerY - pts[0].y);
      for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x - centerX, centerY - pts[i].y);
      shape.closePath();
      
      const isWet = room.type === "wet" || room.room_type === "wet";
      const roomMat = new THREE.MeshStandardMaterial({ 
        map: isWet ? tileTex : woodTex,
        roughness: 0.7,
        metalness: 0.2
      });
      
      const roomGeo = new THREE.ExtrudeGeometry(shape, { depth: 10, bevelEnabled: false });
      const roomMesh = new THREE.Mesh(roomGeo, roomMat);
      roomMesh.rotation.x = -Math.PI / 2;
      roomMesh.position.y = -10;
      roomMesh.receiveShadow = true;
      scene.add(roomMesh);
    });

    const animate = () => { 
      requestAnimationFrame(animate); 
      controls.update(); 
      renderer.render(scene, camera); 
    };
    animate();

    const handleResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (container && renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
      renderer.dispose();
      scene.clear();
    };
  }, [walls, rooms, image, imgSize, realScale]);

  return (
    <div className="boq-overlay">
      <div className="boq-panel" style={{ width: '95%', height: '95%', background: '#111', borderRadius: 20, overflow: 'hidden', position: 'relative', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
        <div className="boq-header" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, background: 'rgba(20,20,40,0.7)', backdropFilter: 'blur(15px)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '15px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <span style={{ fontSize: 32 }}>🏠</span>
            <div>
              <h3 style={{ margin: 0, color: '#fff', fontSize: 20 }}>Realistic 3D Interior Preview</h3>
              <p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>Auto-textured (Wood for Dry, Tile for Wet)</p>
            </div>
          </div>
          <button className="boq-close-btn" style={{ fontSize: 28, color: '#fff', opacity: 0.8 }} onClick={onClose}>✕</button>
        </div>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
