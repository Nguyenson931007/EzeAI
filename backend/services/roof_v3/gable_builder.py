"""
Gable Builder Module
Handles Verge Extension for Gable Ends and generates Gable Wall triangles (Tường thu hồi).
"""
import math
from typing import List, Tuple, Dict, Any, Optional

try:
    from .roof_graph import RoofGraph, RoofVertex, RoofFace
except ImportError:
    from roof_graph import RoofGraph, RoofVertex, RoofFace


class GableBuilder:
    """
    Extends roof eaves and ridges outward for gable edges (pitch = 90 deg)
    and produces triangular gable walls from eave height up to ridge height.
    """

    @classmethod
    def extend_gable_verge(
        cls,
        graph: RoofGraph,
        points: List[List[float]],
        angles: List[float],
        overhangs: List[float],
        wall_z: float = 2700.0,
    ) -> List[Dict[str, Any]]:
        """
        Extends the ridge apex and adjacent roof slopes along gable edge normal by OVH,
        and generates gable wall triangles.
        """
        n_pts = len(points)
        gable_walls = []

        signed_area = 0.0
        for k in range(n_pts):
            x1, y1 = points[k]
            x2, y2 = points[(k + 1) % n_pts]
            signed_area += (x1 * y2 - x2 * y1)
        is_ccw = signed_area > 0

        for i in range(n_pts):
            angle = angles[i] if i < len(angles) else 22.5
            ovh = overhangs[i] if i < len(overhangs) else 0.0

            if abs(angle - 90.0) < 1.0:  # Gable edge
                p1_orig = (points[i][0], points[i][1])
                p2_orig = (points[(i + 1) % n_pts][0], points[(i + 1) % n_pts][1])

                dx = p2_orig[0] - p1_orig[0]
                dy = p2_orig[1] - p1_orig[1]
                length = math.hypot(dx, dy)
                if length < 1e-6:
                    continue

                # Outward normal: right side for CCW, left side for CW
                if is_ccw:
                    nx = dy / length
                    ny = -dx / length
                else:
                    nx = -dy / length
                    ny = dx / length

                # 1. Find the degenerate gable face (contour_edge_index == i)
                gable_face = None
                for f in graph.faces:
                    if f.contour_edge_index == i:
                        gable_face = f
                        break

                # Find ridge apex vertex belonging to this gable face
                apex_vertex = None
                adjacent_roof_faces = []

                if gable_face:
                    for vid in gable_face.vertices:
                        v = graph.vertices[vid]
                        if not v.is_contour:
                            apex_vertex = v
                            break

                # Find non-gable adjacent faces sharing the apex
                if apex_vertex:
                    for f_idx in apex_vertex.adjacent_faces:
                        if f_idx < len(graph.faces):
                            f = graph.faces[f_idx]
                            if f != gable_face and not getattr(f, "is_gable", False):
                                adjacent_roof_faces.append(f)

                # 2. Record Gable Wall Triangle at the original wall position
                if apex_vertex:
                    verge_z = apex_vertex.z

                    # Height of ridge at the wall line
                    for f in adjacent_roof_faces:
                        z_at_ridge = f.plane_a * apex_vertex.x + f.plane_b * apex_vertex.y + f.plane_c
                        if abs(z_at_ridge) > 1.0:
                            verge_z = z_at_ridge
                            break

                    gable_walls.append({
                        "edge_index": i,
                        "wall_p1": [p1_orig[0], p1_orig[1], wall_z],
                        "wall_p2": [p2_orig[0], p2_orig[1], wall_z],
                        "ridge_top": [apex_vertex.x, apex_vertex.y, verge_z],
                    })

                    # If gable overhang > 0, extend the apex out by ovh
                    if ovh > 0:
                        apex_vertex.x += ovh * nx
                        apex_vertex.y += ovh * ny
                        apex_vertex.z = verge_z
                        apex_vertex.fixed_z = verge_z

                # 3. Extend the corner eave endpoints of the gable face out to the gable verge line
                if ovh > 0 and gable_face:
                    for vid in gable_face.vertices:
                        v = graph.vertices[vid]
                        if apex_vertex and v.id != apex_vertex.id and v.is_contour:
                            v.x += ovh * nx
                            v.y += ovh * ny
                            # Recalculate Z from adjacent non-gable face's plane
                            for fid in v.adjacent_faces:
                                if fid < len(graph.faces):
                                    f = graph.faces[fid]
                                    if f != gable_face and not getattr(f, "is_gable", False):
                                        v.z = f.plane_a * v.x + f.plane_b * v.y + f.plane_c
                                        v.fixed_z = v.z
                                        break

                # 4. Mark the degenerate gable face as non-sloping and label its verge edges
                if gable_face:
                    gable_face.is_gable = True
                    gable_face.pitch_angle = 90.0
                    for edge in graph.edges:
                        if edge.source in gable_face.vertices and edge.target in gable_face.vertices:
                            edge.edge_type = 'gable'

        return gable_walls
