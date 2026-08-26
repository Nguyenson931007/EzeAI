"""
Roof Clipper Module (CAD Trim & Polygon Clipping Engine)
Uses Sutherland-Hodgman clipping algorithm to trim roof faces against wall lines.
"""
import math
from typing import List, Tuple, Dict, Any, Optional

try:
    from .roof_graph import RoofGraph, RoofVertex, RoofFace
    from .plane_builder import DeterministicPlaneBuilder
except ImportError:
    from roof_graph import RoofGraph, RoofVertex, RoofFace
    from plane_builder import DeterministicPlaneBuilder


def line_intersection_2d(
    p1: Tuple[float, float], p2: Tuple[float, float],
    p3: Tuple[float, float], p4: Tuple[float, float]
) -> Optional[Tuple[float, float]]:
    """Intersection of line segment p1->p2 with line p3->p4."""
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4

    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-9:
        return None

    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    x = x1 + t * (x2 - x1)
    y = y1 + t * (y2 - y1)
    return (x, y)


def clip_polygon_by_line(
    poly: List[Tuple[float, float]],
    line_p1: Tuple[float, float],
    line_p2: Tuple[float, float],
    interior_point: Optional[Tuple[float, float]] = None,
    keep_left: bool = True
) -> List[Tuple[float, float]]:
    """Sutherland-Hodgman polygon clipping against an infinite line."""
    if len(poly) < 3:
        return []

    x1, y1 = line_p1
    x2, y2 = line_p2
    dx = x2 - x1
    dy = y2 - y1

    # Auto-orient keep_left based on interior_point so the inside of the house is ALWAYS preserved
    if interior_point is not None:
        c_cross = dx * (interior_point[1] - y1) - dy * (interior_point[0] - x1)
        if abs(c_cross) > 1e-6:
            keep_left = (c_cross > 0)

    def is_inside(p: Tuple[float, float]) -> bool:
        cross = dx * (p[1] - y1) - dy * (p[0] - x1)
        if keep_left:
            return cross >= -1e-7
        else:
            return cross <= 1e-7

    out_poly = []
    n = len(poly)
    for i in range(n):
        curr_p = poly[i]
        prev_p = poly[(i - 1 + n) % n]

        curr_in = is_inside(curr_p)
        prev_in = is_inside(prev_p)

        if curr_in:
            if not prev_in:
                inter = line_intersection_2d(prev_p, curr_p, line_p1, line_p2)
                if inter:
                    out_poly.append(inter)
            out_poly.append(curr_p)
        elif prev_in:
            inter = line_intersection_2d(prev_p, curr_p, line_p1, line_p2)
            if inter:
                out_poly.append(inter)

    return out_poly


class RoofClipper:
    """
    Performs CAD-like trim/clip operations on roof graph faces against wall boundaries.
    """

    @classmethod
    def trim_face_by_wall(
        cls,
        graph: RoofGraph,
        face_id: int,
        wall_p1: Tuple[float, float],
        wall_p2: Tuple[float, float],
        interior_point: Optional[Tuple[float, float]] = None,
        keep_left: bool = True
    ) -> bool:
        """
        Trims a single face against a wall line and updates graph vertices.
        """
        if face_id >= len(graph.faces):
            return False

        face = graph.faces[face_id]
        if getattr(face, "is_gable", False):
            return False

        verts_2d = [(graph.vertices[vid].x, graph.vertices[vid].y) for vid in face.vertices if vid < len(graph.vertices)]
        if len(verts_2d) < 3:
            return False

        clipped_2d = clip_polygon_by_line(verts_2d, wall_p1, wall_p2, interior_point=interior_point, keep_left=keep_left)
        if len(clipped_2d) < 3:
            return False

        # Reconstruct vertices for the clipped face
        new_face_verts = []
        for (cx, cy) in clipped_2d:
            # Check if this point already exists in graph
            found_id = None
            for v in graph.vertices:
                if math.hypot(v.x - cx, v.y - cy) < 1.0:  # 1mm tolerance
                    found_id = v.id
                    break

            if found_id is not None:
                new_face_verts.append(found_id)
            else:
                # Add new trimmed vertex with height evaluated from plane equation
                z_val = face.plane_a * cx + face.plane_b * cy + face.plane_c
                new_id = len(graph.vertices)
                new_v = RoofVertex(
                    id=new_id,
                    x=cx,
                    y=cy,
                    z=z_val,
                    is_contour=True,
                    fixed_z=z_val,
                    adjacent_faces=[face_id]
                )
                graph.vertices.append(new_v)
                new_face_verts.append(new_id)

        face.vertices = new_face_verts
        return True
