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
        default_eave_z: float = 2700.0,
        points: Optional[List[List[float]]] = None
    ) -> Tuple[float, float, float, List[float]]:
        """
        Computes plane coefficients (a, b, c) and normal vector for a roof face.
        Plane equation: z = a*x + b*y + c
        Uses exact wall polygon edge points[ci] -> points[ci+1] whenever available
        to guarantee 100% accurate plane orientation regardless of face vertex count.
        """
        base_z = face.eave_height if face.eave_height > 0 else default_eave_z

        # Gable (90 deg) or marked gable face is vertical / non-sloping in roof mesh
        if abs(face.pitch_angle - 90.0) < 1.0 or getattr(face, "is_gable", False):
            return (0.0, 0.0, base_z, [0.0, 0.0, 1.0])

        pitch_rad = math.radians(face.pitch_angle)
        slope = math.tan(pitch_rad)

        p1_x, p1_y = 0.0, 0.0
        p2_x, p2_y = 0.0, 0.0
        found_edge = False

        # 1. Preferred: Use exact original wall polygon edge from points[ci] -> points[ci+1]
        ci = getattr(face, "contour_edge_index", -1)
        if points and 0 <= ci < len(points):
            p1_pt = points[ci]
            p2_pt = points[(ci + 1) % len(points)]
            w_dx = float(p2_pt[0]) - float(p1_pt[0])
            w_dy = float(p2_pt[1]) - float(p1_pt[1])
            w_len = math.hypot(w_dx, w_dy)

            # Validate directional alignment with actual contour vertices on this face (if any)
            direction_mismatch = False
            n_v = len(face.vertices)
            if n_v >= 2 and w_len > 1e-4:
                for k in range(n_v):
                    v1_id = face.vertices[k]
                    v2_id = face.vertices[(k + 1) % n_v]
                    if v1_id < len(graph.vertices) and v2_id < len(graph.vertices):
                        v1 = graph.vertices[v1_id]
                        v2 = graph.vertices[v2_id]
                        if v1.is_contour and v2.is_contour:
                            c_dx = v2.x - v1.x
                            c_dy = v2.y - v1.y
                            c_len = math.hypot(c_dx, c_dy)
                            if c_len > 1e-4:
                                dot = (w_dx * c_dx + w_dy * c_dy) / (w_len * c_len)
                                if dot < 0.5:
                                    direction_mismatch = True
                            break

            if not direction_mismatch:
                p1_x, p1_y = float(p1_pt[0]), float(p1_pt[1])
                p2_x, p2_y = float(p2_pt[0]), float(p2_pt[1])
                found_edge = True

        # 2. Fallback: Find consecutive contour vertices along this face
        if not found_edge:
            contour_verts = []
            n_v = len(face.vertices)
            for i in range(n_v):
                vid = face.vertices[i]
                if vid < len(graph.vertices) and graph.vertices[vid].is_contour:
                    contour_verts.append((i, graph.vertices[vid]))

            if len(contour_verts) < 2:
                return (0.0, 0.0, base_z, [0.0, 0.0, 1.0])

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

            p1_x, p1_y = p1.x, p1.y
            p2_x, p2_y = p2.x, p2.y

        # Vector along eave: p1 -> p2
        dx = p2_x - p1_x
        dy = p2_y - p1_y
        length = math.hypot(dx, dy)

        if length < 1e-6:
            return (0.0, 0.0, base_z, [0.0, 0.0, 1.0])

        # Inward normal for CCW face: left of vector p1->p2
        nx = -dy / length
        ny = dx / length

        # Plane gradient: z increases in inward normal direction by tan(pitch)
        a = slope * nx
        b = slope * ny

        # If anchored at wall polygon edge (points[ci]), use wall_z (elevation at wall top).
        # Otherwise if fallback to outer overhang contour, use face.eave_height.
        wall_z = getattr(face, "wall_z", None)
        plane_ref_z = float(wall_z) if (found_edge and wall_z is not None) else base_z
        c = plane_ref_z - (a * p1_x + b * p1_y)

        # 3D Normal vector: (-a, -b, 1) normalized
        n_len = math.sqrt(a * a + b * b + 1.0)
        normal = [-a / n_len, -b / n_len, 1.0 / n_len]

        return (a, b, c, normal)

    @classmethod
    def build_all_planes(
        cls,
        graph: RoofGraph,
        default_eave_z: float = 2700.0,
        force_recompute: bool = False,
        points: Optional[List[List[float]]] = None
    ):
        """Computes and assigns plane equations to all faces in the graph."""
        for face in graph.faces:
            if getattr(face, "is_gable", False) or abs(face.pitch_angle - 90.0) < 1.0:
                continue
            if force_recompute or (face.plane_a == 0.0 and face.plane_b == 0.0 and face.plane_c == 0.0):
                a, b, c, normal = cls.compute_face_plane(face, graph, default_eave_z, points=points)
                face.plane_a = a
                face.plane_b = b
                face.plane_c = c
                face.normal = normal
                face.normal = normal

    @classmethod
    def compute_3d_heights(cls, graph: RoofGraph, default_eave_z: float = 2700.0) -> float:
        """
        Computes 3D height Z for all vertices based on incident face plane equations.
        Returns the maximum planarity error across all faces in mm.
        """
        cls.build_all_planes(graph, default_eave_z)

        # Compute vertex heights by evaluating heights from incident non-gable faces
        for v in graph.vertices:
            incident_non_gable = []
            for f_idx in v.adjacent_faces:
                if f_idx < len(graph.faces):
                    f = graph.faces[f_idx]
                    if not getattr(f, "is_gable", False) and abs(f.pitch_angle - 90.0) >= 1.0:
                        incident_non_gable.append(f)

            if v.fixed_z is not None:
                # If it's a contour vertex with custom eave height on its incident face, evaluate on its face plane
                if v.is_contour and incident_non_gable:
                    z_samples = [f.plane_a * v.x + f.plane_b * v.y + f.plane_c for f in incident_non_gable]
                    v.z = float(np.mean(z_samples))
                else:
                    v.z = v.fixed_z
                continue

            z_samples = []
            for f in incident_non_gable:
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
        Guarantees robust triangulation for concave (L/U-shaped) faces and overhang cap polygons.
        """
        poly_2d = []
        for vid in face.vertices:
            if vid < len(graph.vertices):
                v = graph.vertices[vid]
                if not poly_2d or (math.hypot(poly_2d[-1][0] - v.x, poly_2d[-1][1] - v.y) > 0.5):
                    poly_2d.append((v.x, v.y, vid))

        if len(poly_2d) > 1 and math.hypot(poly_2d[0][0] - poly_2d[-1][0], poly_2d[0][1] - poly_2d[-1][1]) <= 0.5:
            poly_2d.pop()

        n = len(poly_2d)
        if n < 3:
            return []
        if n == 3:
            if poly_2d[0][2] != poly_2d[1][2] and poly_2d[1][2] != poly_2d[2][2] and poly_2d[0][2] != poly_2d[2][2]:
                return [[poly_2d[0][2], poly_2d[1][2], poly_2d[2][2]]]
            return []

        # Ensure CCW winding order for 2D ear clipping
        signed_area = 0.0
        for i in range(n):
            x1, y1 = poly_2d[i][0], poly_2d[i][1]
            x2, y2 = poly_2d[(i + 1) % n][0], poly_2d[(i + 1) % n][1]
            signed_area += (x1 * y2 - x2 * y1)

        if signed_area < 0:
            poly_2d = poly_2d[::-1]

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
                # Fallback fan triangulation if ear clipping stalls
                for k in range(1, len(indices) - 1):
                    triangles.append([poly_2d[indices[0]][2], poly_2d[indices[k]][2], poly_2d[indices[k + 1]][2]])
                indices = []
                break

        if len(indices) == 3:
            triangles.append([poly_2d[indices[0]][2], poly_2d[indices[1]][2], poly_2d[indices[2]][2]])

        # Filter non-degenerate triangles
        valid_triangles = []
        for t in triangles:
            if t[0] != t[1] and t[1] != t[2] and t[0] != t[2]:
                valid_triangles.append(t)

        return valid_triangles

    @classmethod
    def generate_3d_mesh(cls, graph: RoofGraph) -> Dict[str, Any]:
        """
        Generates 3D vertex and triangular face lists from the roof graph.
        Each face gets its own independent 3D vertices computed strictly from its plane equation,
        preventing any distortion or coupling when individual face heights are modified.
        """
        cls.build_all_planes(graph)

        vertices_3d: List[List[float]] = []
        faces_3d: List[List[int]] = []
        face_groups = []

        for face in graph.faces:
            if getattr(face, "is_gable", False) or abs(face.pitch_angle - 90.0) < 1.0:
                continue  # Skip degenerate gable face

            tris = cls.triangulate_face_2d(face, graph)
            if not tris:
                continue

            # Extract distinct vertices for this face and calculate exact Z strictly from this face's plane
            # Map original vertex ID -> new disjoint vertex index in vertices_3d
            vid_map = {}
            for vid in face.vertices:
                if vid < len(graph.vertices):
                    v = graph.vertices[vid]
                    # Exact Z from this face's own plane equation (0 residual guaranteed)
                    z_face = face.plane_a * v.x + face.plane_b * v.y + face.plane_c
                    new_idx = len(vertices_3d)
                    vertices_3d.append([float(v.x), float(v.y), float(z_face)])
                    vid_map[vid] = new_idx

            # Remap triangles to the new disjoint vertex indices
            remapped_tris = []
            for tri in tris:
                if all(v_id in vid_map for v_id in tri):
                    remapped_tri = [vid_map[tri[0]], vid_map[tri[1]], vid_map[tri[2]]]
                    remapped_tris.append(remapped_tri)
                    faces_3d.append(remapped_tri)

            face_groups.append({
                "face_id": face.id,
                "contour_edge_index": face.contour_edge_index,
                "triangles": remapped_tris,
                "plane": {
                    "a": face.plane_a,
                    "b": face.plane_b,
                    "c": face.plane_c,
                    "normal": face.normal,
                },
                "eave_height": face.eave_height,
            })

        return {
            "vertices": vertices_3d,
            "faces": faces_3d,
            "face_groups": face_groups,
            "max_planarity_error": 0.0,
            "status": "planar"
        }
