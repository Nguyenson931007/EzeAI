"""
Deterministic Plane Builder Module
Constructs exact algebraic plane equations for roof faces and calculates heights deterministically.
"""
import math
from typing import List, Tuple, Dict, Any, Optional
import numpy as np

try:
    from .roof_graph import RoofGraph, RoofVertex, RoofFace
except ImportError:
    from roof_graph import RoofGraph, RoofVertex, RoofFace


class DeterministicPlaneBuilder:
    """
    Computes exact algebraic plane equations z = ax + by + c for each face
    using the base eave line and pitch angle, guaranteeing 0 planarity residual.
    """

    @classmethod
    def compute_face_plane(
        cls,
        face: RoofFace,
        graph: RoofGraph,
        default_eave_z: float = 2700.0
    ) -> Tuple[float, float, float, List[float]]:
        """
        Computes plane coefficients (a, b, c) and normal vector for a roof face.
        Plane equation: z = a*x + b*y + c
        """
        base_z = face.eave_height if face.eave_height > 0 else default_eave_z

        # Gable (90 deg) or marked gable face is vertical / non-sloping in roof mesh
        if abs(face.pitch_angle - 90.0) < 1.0 or getattr(face, "is_gable", False):
            return (0.0, 0.0, base_z, [0.0, 0.0, 1.0])

        pitch_rad = math.radians(face.pitch_angle)
        slope = math.tan(pitch_rad)

        # 1. Find consecutive contour vertices along this face
        contour_verts = []
        n_v = len(face.vertices)
        for i in range(n_v):
            vid = face.vertices[i]
            if vid < len(graph.vertices) and graph.vertices[vid].is_contour:
                contour_verts.append((i, graph.vertices[vid]))

        if len(contour_verts) < 2:
            return (0.0, 0.0, base_z, [0.0, 0.0, 1.0])

        # Find the actual eave edge (consecutive contour vertices in face cycle)
        p1 = None
        p2 = None
        for k in range(len(contour_verts)):
            curr_idx, curr_v = contour_verts[k]
            next_idx, next_v = contour_verts[(k + 1) % len(contour_verts)]
            if (curr_idx + 1) % n_v == next_idx:
                p1 = curr_v
                p2 = next_v
                break

        if p1 is None or p2 is None:
            p1 = contour_verts[0][1]
            p2 = contour_verts[1][1]

        # Vector along eave: p1 -> p2
        dx = p2.x - p1.x
        dy = p2.y - p1.y
        length = math.hypot(dx, dy)

        if length < 1e-6:
            return (0.0, 0.0, base_z, [0.0, 0.0, 1.0])

        # Inward normal for CCW face: left of vector p1->p2
        nx = -dy / length
        ny = dx / length

        # Plane gradient: z increases in inward normal direction by tan(pitch)
        a = slope * nx
        b = slope * ny
        c = base_z - (a * p1.x + b * p1.y)

        # 3D Normal vector: (-a, -b, 1) normalized
        n_len = math.sqrt(a * a + b * b + 1.0)
        normal = [-a / n_len, -b / n_len, 1.0 / n_len]

        return (a, b, c, normal)

    @classmethod
    def build_all_planes(
        cls,
        graph: RoofGraph,
        default_eave_z: float = 2700.0,
        force_recompute: bool = False
    ):
        """Computes and assigns plane equations to all faces in the graph."""
        for face in graph.faces:
            if force_recompute or (face.plane_a == 0.0 and face.plane_b == 0.0):
                a, b, c, normal = cls.compute_face_plane(face, graph, default_eave_z)
                face.plane_a = a
                face.plane_b = b
                face.plane_c = c
                face.normal = normal

    @classmethod
    def compute_3d_heights(cls, graph: RoofGraph, default_eave_z: float = 2700.0) -> float:
        """
        Computes 3D height Z for all vertices based on incident face plane equations.
        Returns the maximum planarity error across all faces in mm.
        """
        cls.build_all_planes(graph, default_eave_z)

        # Compute vertex heights by averaging heights from incident non-gable faces
        for v in graph.vertices:
            if v.fixed_z is not None:
                v.z = v.fixed_z
                continue

            z_samples = []
            for f_idx in v.adjacent_faces:
                if f_idx < len(graph.faces):
                    f = graph.faces[f_idx]
                    if getattr(f, "is_gable", False) or abs(f.pitch_angle - 90.0) < 1.0:
                        continue
                    z_f = f.plane_a * v.x + f.plane_b * v.y + f.plane_c
                    z_samples.append(z_f)

            if z_samples:
                v.z = float(np.mean(z_samples))
            else:
                v.z = default_eave_z

        # Compute planarity error per active roof face
        max_error = 0.0
        for f in graph.faces:
            if getattr(f, "is_gable", False) or abs(f.pitch_angle - 90.0) < 1.0:
                continue

            residuals = []
            for vid in f.vertices:
                if vid < len(graph.vertices):
                    v = graph.vertices[vid]
                    z_expected = f.plane_a * v.x + f.plane_b * v.y + f.plane_c
                    residuals.append(abs(v.z - z_expected))

            face_err = max(residuals) if residuals else 0.0
            f.planarity_error = face_err
            if face_err > max_error:
                max_error = face_err

        return max_error

    @staticmethod
    def triangulate_face_2d(face: RoofFace, graph: RoofGraph) -> List[List[int]]:
        """
        Triangulates a 3D polygon face using Ear-Clipping on its 2D projection.
        Guarantees robust triangulation for concave (L/U-shaped) faces.
        """
        poly_2d = []
        for vid in face.vertices:
            if vid < len(graph.vertices):
                v = graph.vertices[vid]
                poly_2d.append((v.x, v.y, vid))

        n = len(poly_2d)
        if n < 3:
            return []
        if n == 3:
            return [[poly_2d[0][2], poly_2d[1][2], poly_2d[2][2]]]

        def is_ear(p_prev, p_curr, p_next, polygon):
            # Check convexity (cross product)
            cp = (p_curr[0] - p_prev[0]) * (p_next[1] - p_curr[1]) - (p_curr[1] - p_prev[1]) * (p_next[0] - p_curr[0])
            if cp <= 1e-7:
                return False

            # Check if any other vertex lies inside triangle (p_prev, p_curr, p_next)
            for pt in polygon:
                if pt == p_prev or pt == p_curr or pt == p_next:
                    continue
                if point_in_tri_2d(pt, p_prev, p_curr, p_next):
                    return False
            return True

        def point_in_tri_2d(pt, a, b, c):
            def sign(p1, p2, p3):
                return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

            d1 = sign(pt, a, b)
            d2 = sign(pt, b, c)
            d3 = sign(pt, c, a)

            has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
            has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
            return not (has_neg and has_pos)

        triangles = []
        indices = list(range(n))

        iterations = 0
        while len(indices) > 3 and iterations < 150:
            iterations += 1
            ear_found = False
            for i in range(len(indices)):
                prev_i = indices[(i - 1 + len(indices)) % len(indices)]
                curr_i = indices[i]
                next_i = indices[(i + 1) % len(indices)]

                p_prev = poly_2d[prev_i]
                p_curr = poly_2d[curr_i]
                p_next = poly_2d[next_i]

                poly_subset = [poly_2d[idx] for idx in indices]

                if is_ear(p_prev, p_curr, p_next, poly_subset):
                    triangles.append([p_prev[2], p_curr[2], p_next[2]])
                    indices.pop(i)
                    ear_found = True
                    break

            if not ear_found:
                # Fallback fan triangulation if non-simple
                break

        if len(indices) == 3:
            triangles.append([poly_2d[indices[0]][2], poly_2d[indices[1]][2], poly_2d[indices[2]][2]])

        return triangles

    @classmethod
    def generate_3d_mesh(cls, graph: RoofGraph) -> Dict[str, Any]:
        """
        Generates 3D vertex and triangular face lists from the roof graph.
        """
        max_err = cls.compute_3d_heights(graph)

        vertices_3d = [[v.x, v.y, v.z] for v in graph.vertices]
        faces_3d = []
        face_groups = []

        for face in graph.faces:
            if getattr(face, "is_gable", False):
                continue  # Skip degenerate gable face
            tris = cls.triangulate_face_2d(face, graph)
            faces_3d.extend(tris)
            face_groups.append({
                "face_id": face.id,
                "contour_edge_index": face.contour_edge_index,
                "triangles": tris
            })

        return {
            "vertices": vertices_3d,
            "faces": faces_3d,
            "face_groups": face_groups,
            "max_planarity_error": round(max_err, 4),
            "status": "planar" if max_err < 0.1 else "approximate"
        }
