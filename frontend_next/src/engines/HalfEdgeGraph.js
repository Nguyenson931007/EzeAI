/**
 * HalfEdgeGraph.js
 * EzeFloor Production CAD/BIM System
 * 
 * Formal Half-Edge Data Structure & Planar Subgraph Analysis Engine.
 * Extracts closed planar face cycles, resolves T/L/Z junctions, and validates
 * spatial adjacency for Rooms, Floors, Roofs, and Wall Topology.
 */

export class HalfEdgeVertex {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.leavingHalfEdge = null;
  }
}

export class HalfEdge {
  constructor(id, origin) {
    this.id = id;
    this.origin = origin; // HalfEdgeVertex
    this.twin = null;     // HalfEdge
    this.next = null;     // HalfEdge
    this.prev = null;     // HalfEdge
    this.face = null;     // PlanarFace
    this.angle = 0;       // Angle in radians from origin to twin.origin
  }
}

export class PlanarFace {
  constructor(id) {
    this.id = id;
    this.outerHalfEdge = null;
    this.holes = [];
  }

  getPolygonPoints() {
    if (!this.outerHalfEdge) return [];
    const pts = [];
    let curr = this.outerHalfEdge;
    const start = curr;
    let guard = 0;
    do {
      pts.push({ x: curr.origin.x, y: curr.origin.y });
      curr = curr.next;
      guard++;
    } while (curr && curr !== start && guard < 1000);
    return pts;
  }

  getArea() {
    const pts = this.getPolygonPoints();
    if (pts.length < 3) return 0;
    let area = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      area += (p1.x * p2.y - p2.x * p1.y);
    }
    return Math.abs(area) / 2;
  }
}

export class HalfEdgeGraph {
  constructor() {
    this.vertices = new Map(); // id -> HalfEdgeVertex
    this.halfEdges = [];
    this.faces = [];
  }

  static fromWallCenterlines(walls = [], snapTolerance = 5.0) {
    const graph = new HalfEdgeGraph();
    const rawVertices = [];

    const findOrCreateVertex = (x, y) => {
      for (const v of rawVertices) {
        if (Math.hypot(v.x - x, v.y - y) <= snapTolerance) {
          return v;
        }
      }
      const newV = new HalfEdgeVertex(`v_${rawVertices.length}`, x, y);
      rawVertices.push(newV);
      graph.vertices.set(newV.id, newV);
      return newV;
    };

    walls.forEach(w => {
      if (!w.centerline || w.centerline.length !== 2) return;
      const v1 = findOrCreateVertex(w.centerline[0][0], w.centerline[0][1]);
      const v2 = findOrCreateVertex(w.centerline[1][0], w.centerline[1][1]);
      if (v1.id === v2.id) return;

      const he1 = new HalfEdge(`he_${graph.halfEdges.length}`, v1);
      const he2 = new HalfEdge(`he_${graph.halfEdges.length + 1}`, v2);

      he1.twin = he2;
      he2.twin = he1;

      he1.angle = Math.atan2(v2.y - v1.y, v2.x - v1.x);
      he2.angle = Math.atan2(v1.y - v2.y, v1.x - v2.x);

      v1.leavingHalfEdge = he1;
      v2.leavingHalfEdge = he2;

      graph.halfEdges.push(he1, he2);
    });

    graph.buildPointers();
    graph.extractFaces();
    return graph;
  }

  buildPointers() {
    // Group leaving half-edges by vertex and sort by angle counter-clockwise
    this.vertices.forEach(v => {
      const leaving = this.halfEdges.filter(he => he.origin === v);
      leaving.sort((a, b) => a.angle - b.angle);

      const n = leaving.length;
      for (let i = 0; i < n; i++) {
        const curr = leaving[i];
        const prevTwin = leaving[(i - 1 + n) % n].twin;
        prevTwin.next = curr;
        curr.prev = prevTwin;
      }
    });
  }

  extractFaces() {
    const visited = new Set();
    this.faces = [];

    this.halfEdges.forEach(he => {
      if (visited.has(he.id)) return;

      const face = new PlanarFace(`face_${this.faces.length}`);
      let curr = he;
      let guard = 0;
      let isClosed = true;

      while (curr && !visited.has(curr.id) && guard < 1000) {
        visited.add(curr.id);
        curr.face = face;
        curr = curr.next;
        guard++;
      }

      if (curr === he && guard >= 3) {
        face.outerHalfEdge = he;
        // Keep non-outer infinite faces (area > 10px2)
        if (face.getArea() > 10.0) {
          this.faces.push(face);
        }
      }
    });
  }
}
