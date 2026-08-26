"""
Shed Roof Engine (Mono-Pitch / Skillion Architecture)
Handles exact algebraic plane construction, general polygon offset for 4-sided/n-sided overhangs,
and 3D sloping trapezoidal wall shells for single-pitch roofs.
"""
import math
from typing import List, Dict, Tuple, Optional, Any
import numpy as np

try:
    from .roof_graph import RoofGraph, RoofVertex, RoofFace, RoofEdge
    from .plane_builder import DeterministicPlaneBuilder
    from .wall_builder import WallBuilder
except ImportError:
    from roof_graph import RoofGraph, RoofVertex, RoofFace, RoofEdge
    from plane_builder import DeterministicPlaneBuilder
    from wall_builder import WallBuilder


class ShedBuilder:
    """
    Constructs deterministic 3D single-pitch (Shed / Mono-pitch) roofs:
    1. Computes exact algebraic plane equation z = ax + by + c from the chosen Eave Edge.
    2. Offsets the base wall polygon outward by per-edge overhangs (OVH).
    3. Evaluates exact Z elevations for all outer roof vertices (low eave, high wall, rakes).
    4. Generates 3D trapezoidal wall shells matching the sloping roof underside.
    """

    @staticmethod
    def compute_edge_vectors(p1: Tuple[float, float], p2: Tuple[float, float]) -> Tuple[Tuple[float, float], Tuple[float, float], float]:
        """
        Computes unit tangent (dx, dy) and inward unit normal for directed segment p1 -> p2 of CCW polygon.
        Inward normal for CCW polygon points to the left: (-dy, dx) / length.
        Outward normal points to the right: (dy, -dx) / length.
        """
        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        length = math.hypot(dx, dy)
        if length < 1e-7:
            return ((1.0, 0.0), (0.0, 1.0), 0.0)
        tangent = (dx / length, dy / length)
        inward_normal = (-dy / length, dx / length)
        return (tangent, inward_normal, length)

    @classmethod
    def compute_shed_plane(
        cls,
        p1: Tuple[float, float],
        p2: Tuple[float, float],
        pitch_angle: float,
        wall_height: float = 2700.0
    ) -> Tuple[float, float, float, Tuple[float, float]]:
        """
        Computes plane equation z = ax + by + c for a shed roof.
        p1 -> p2 is the low eave edge.
        The slope rises in the direction of the inward normal of p1 -> p2.
        """
        _, inward_normal, _ = cls.compute_edge_vectors(p1, p2)
        nx, ny = inward_normal
        slope = math.tan(math.radians(pitch_angle))

        a = slope * nx
        b = slope * ny
        c = wall_height - (a * p1[0] + b * p1[1])

        return (a, b, c, inward_normal)

    @staticmethod
    def intersect_lines_2d(
        p1: Tuple[float, float], d1: Tuple[float, float],
        p2: Tuple[float, float], d2: Tuple[float, float]
    ) -> Optional[Tuple[float, float]]:
        """
        Computes intersection of line 1 (p1 + t*d1) and line 2 (p2 + u*d2).
        """
        det = d1[0] * d2[1] - d1[1] * d2[0]
        if abs(det) < 1e-9:
            return None  # Parallel lines

        dp = (p2[0] - p1[0], p2[1] - p1[1])
        t = (dp[0] * d2[1] - dp[1] * d2[0]) / det
        return (p1[0] + t * d1[0], p1[1] + t * d1[1])

    @classmethod
    def offset_polygon_by_overhangs(
        cls,
        points: List[Tuple[float, float]],
        overhangs: List[float]
    ) -> List[Tuple[float, float]]:
        """
        Offsets a 2D CCW polygon outward by per-edge overhang distances.
        Edge i connects points[i] -> points[(i+1)%n] with outward offset overhangs[i].
        """
        n = len(points)
        if n < 3:
            return list(points)

        offset_lines = []
        for i in range(n):
            p1 = points[i]
            p2 = points[(i + 1) % n]
            ovh = overhangs[i] if i < len(overhangs) else 0.0

            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            length = math.hypot(dx, dy)
            if length < 1e-7:
                outward_normal = (0.0, 0.0)
                tangent = (1.0, 0.0)
            else:
                outward_normal = (dy / length, -dx / length)  # Right of CCW edge
                tangent = (dx / length, dy / length)

            # A point on the offset line
            p_offset = (p1[0] + ovh * outward_normal[0], p1[1] + ovh * outward_normal[1])
            offset_lines.append((p_offset, tangent))

        # Intersect consecutive offset lines: line[i-1] and line[i] -> new vertex i
        new_vertices = []
        for i in range(n):
            prev_i = (i - 1 + n) % n
            line_prev = offset_lines[prev_i]
            line_curr = offset_lines[i]

            inter = cls.intersect_lines_2d(line_prev[0], line_prev[1], line_curr[0], line_curr[1])
            if inter is not None:
                new_vertices.append(inter)
            else:
                new_vertices.append(points[i])

        return new_vertices

    @classmethod
    def compute_shed_topology(
        cls,
        points: List[List[float]],
        pitch_angle: float,
        overhangs: List[float],
        eave_edge_index: int = 0,
        wall_height: float = 2700.0
    ) -> Dict[str, Any]:
        """
        Generates 2D topology (nodes, edges, faces) compatible with V3 PDF viewer.
        """
        n = len(points)
        pts_2d = [(float(p[0]), float(p[1])) for p in points]
        eave_idx = max(0, min(n - 1, eave_edge_index))

        p1 = pts_2d[eave_idx]
        p2 = pts_2d[(eave_idx + 1) % n]
        a, b, c, inward_normal = cls.compute_shed_plane(p1, p2, pitch_angle, wall_height)

        # 1. Offset polygon for roof eaves
        roof_pts_2d = cls.offset_polygon_by_overhangs(pts_2d, overhangs)

        # 2. Build nodes (roof contour vertices)
        nodes = []
        for idx, (rx, ry) in enumerate(roof_pts_2d):
            z_val = a * rx + b * ry + c
            nodes.append({
                "id": idx,
                "x": rx,
                "y": ry,
                "z": z_val,
                "is_contour": True,
                "is_skeleton": False,
                "is_reflex": False,
                "time": 0.0,
                "vertex_type": "eave"
            })

        # 3. Build edges
        edges = []
        for i in range(n):
            edges.append({
                "id": i,
                "source": i,
                "target": (i + 1) % n,
                "is_contour": True,
                "is_bisector": False,
                "edge_type": "eave" if i == eave_idx else "rake"
            })

        # 4. Single continuous sloping face
        face = {
            "id": 0,
            "vertices": list(range(n)),
            "contour_edge_index": eave_idx,
            "pitch_angle": pitch_angle,
            "plane": {
                "a": a,
                "b": b,
                "c": c,
                "normal": [-a / math.sqrt(a * a + b * b + 1.0), -b / math.sqrt(a * a + b * b + 1.0), 1.0 / math.sqrt(a * a + b * b + 1.0)]
            }
        }

        return {
            "nodes": nodes,
            "vertices": nodes,
            "edges": edges,
            "faces": [face],
            "mode": "shed",
            "eave_edge_index": eave_idx,
            "slope_direction": [inward_normal[0], inward_normal[1]]
        }

    @classmethod
    def generate_shed_3d_mesh(
        cls,
        points: List[List[float]],
        pitch_angle: float,
        overhangs: List[float],
        eave_edge_index: int = 0,
        wall_height: float = 2700.0,
        base_z: float = 0.0
    ) -> Dict[str, Any]:
        """
        Generates full 3D mesh (roof_mesh, wall_mesh, combined mesh, graph) for a Shed Roof.
        Planarity error is guaranteed 0.0000 mm.
        """
        n = len(points)
        if n < 3:
            return {
                "mesh": {"vertices": [], "faces": []},
                "roof_mesh": {"vertices": [], "faces": []},
                "wall_mesh": {"vertices": [], "faces": [], "wall_height": wall_height},
                "graph": {},
                "max_planarity_error_mm": 0.0
            }

        pts_2d = [(float(p[0]), float(p[1])) for p in points]
        eave_idx = max(0, min(n - 1, eave_edge_index))

        p1 = pts_2d[eave_idx]
        p2 = pts_2d[(eave_idx + 1) % n]
        a, b, c, inward_normal = cls.compute_shed_plane(p1, p2, pitch_angle, wall_height)

        # 1. Offset polygon for roof eaves
        roof_pts_2d = cls.offset_polygon_by_overhangs(pts_2d, overhangs)

        # 2. Roof 3D Vertices
        roof_vertices_3d = []
        for (rx, ry) in roof_pts_2d:
            rz = a * rx + b * ry + c
            roof_vertices_3d.append([rx, ry, rz])

        # 3. Triangulate roof polygon using Ear-Clipping
        temp_graph = RoofGraph()
        for idx, v3 in enumerate(roof_vertices_3d):
            temp_graph.vertices.append(RoofVertex(id=idx, x=v3[0], y=v3[1], z=v3[2], is_contour=True))

        face_obj = RoofFace(
            id=0,
            vertices=list(range(n)),
            contour_edge_index=eave_idx,
            pitch_angle=pitch_angle,
            plane_a=a,
            plane_b=b,
            plane_c=c
        )
        temp_graph.faces.append(face_obj)
        roof_faces_3d = DeterministicPlaneBuilder.triangulate_face_2d(face_obj, temp_graph)

        # 4. Generate 3D Sloping Wall Shell
        wall_data = WallBuilder.generate_sloping_wall_mesh(
            pts_2d,
            plane_a=a,
            plane_b=b,
            plane_c=c,
            wall_height=wall_height,
            base_z=base_z,
        )

        # 5. Combined mesh
        combined_verts = [list(v) for v in roof_vertices_3d]
        combined_faces = [list(f) for f in roof_faces_3d]

        w_offset = len(combined_verts)
        for v in wall_data["vertices"]:
            combined_verts.append(list(v))
        for f in wall_data["faces"]:
            combined_faces.append([f[0] + w_offset, f[1] + w_offset, f[2] + w_offset])

        # 6. Roof Graph representation
        topo_data = cls.compute_shed_topology(points, pitch_angle, overhangs, eave_idx, wall_height)

        return {
            "status": "success",
            "mesh": {
                "vertices": combined_verts,
                "faces": combined_faces
            },
            "roof_mesh": {
                "vertices": roof_vertices_3d,
                "faces": roof_faces_3d
            },
            "wall_mesh": wall_data,
            "gable_mesh": wall_data.get("gable_mesh", {"vertices": [], "faces": []}),
            "wall_height": wall_height,
            "graph": topo_data,
            "max_planarity_error_mm": 0.0,
            "optimization_status": "optimal"
        }
