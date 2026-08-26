"""
Wall Builder Module (Draft 3D Wall Shell & Gable Walls)
Generates 3D wall geometry (default height = 2700mm) completely separated from the roof mesh.
Supports vertical walls, triangular gable walls, and sloping trapezoidal walls for shed roofs.
"""
from typing import List, Tuple, Dict, Any, Optional


class WallBuilder:
    """
    Builds 3D Wall geometry from 2D building footprint:
    1. 3D vertical wall quads from floor z=0 to wall_height (default 2700mm).
    2. Vertical triangular Gable Walls from wall_height up to roof ridge.
    3. 3D sloping trapezoidal walls for shed roofs.
    """

    DEFAULT_WALL_HEIGHT = 2700.0

    @classmethod
    def generate_wall_mesh(
        cls,
        points: List[List[float]],
        angles: Optional[List[float]] = None,
        wall_height: float = 2700.0,
        base_z: float = 0.0,
        gable_walls: Optional[List[Dict[str, Any]]] = None,
        dutch_walls: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Generates full 3D wall mesh (vertical walls + gable walls).
        Returns { vertices: [[x, y, z], ...], faces: [[v0, v1, v2], ...] }
        """
        n_pts = len(points)
        if n_pts < 3:
            return {"vertices": [], "faces": [], "wall_height": wall_height}

        vertices_3d: List[List[float]] = []
        faces_3d: List[List[int]] = []

        # 1. Generate 3D vertical wall shell from base_z to base_z + wall_height
        for i in range(n_pts):
            p1 = points[i]
            p2 = points[(i + 1) % n_pts]

            v_b1 = [p1[0], p1[1], base_z]
            v_b2 = [p2[0], p2[1], base_z]
            v_t1 = [p1[0], p1[1], base_z + wall_height]
            v_t2 = [p2[0], p2[1], base_z + wall_height]

            idx = len(vertices_3d)
            vertices_3d.extend([v_b1, v_b2, v_t2, v_t1])

            faces_3d.append([idx, idx + 1, idx + 2])
            faces_3d.append([idx, idx + 2, idx + 3])

        # 2. Add Gable Wall triangles (Tường thu hồi) from wall_height up to ridge top
        gable_vertices: List[List[float]] = []
        gable_faces: List[List[int]] = []

        if gable_walls:
            for gw in gable_walls:
                wall_p1 = gw.get("wall_p1", [0, 0, 0])
                wall_p2 = gw.get("wall_p2", [0, 0, 0])
                ridge_top = gw.get("ridge_top", [0, 0, 0])

                v1 = [wall_p1[0], wall_p1[1], wall_p1[2]]
                v2 = [wall_p2[0], wall_p2[1], wall_p2[2]]
                v_ridge = [ridge_top[0], ridge_top[1], ridge_top[2]]

                # Add to full combined walls
                idx = len(vertices_3d)
                vertices_3d.extend([v1, v2, v_ridge])
                faces_3d.append([idx, idx + 1, idx + 2])

                # Also store separately in pure gable_mesh
                g_idx = len(gable_vertices)
                gable_vertices.extend([v1, v2, v_ridge])
                gable_faces.append([g_idx, g_idx + 1, g_idx + 2])

        # 3. Add Dutch Gable Wall polygons (Tường thu hồi Dutch) from Z_cut up to ridge top
        if dutch_walls:
            for dw in dutch_walls:
                wall_polygon = dw.get("wall_polygon")
                if wall_polygon and len(wall_polygon) >= 3:
                    start_idx = len(vertices_3d)
                    g_start_idx = len(gable_vertices)
                    for pt in wall_polygon:
                        pt_3d = [float(pt[0]), float(pt[1]), float(pt[2])]
                        vertices_3d.append(pt_3d)
                        gable_vertices.append(pt_3d)
                    n_v = len(wall_polygon)
                    for k in range(1, n_v - 1):
                        faces_3d.append([start_idx, start_idx + k, start_idx + k + 1])
                        gable_faces.append([g_start_idx, g_start_idx + k, g_start_idx + k + 1])
                else:
                    c1 = dw.get("c1", [0, 0, 0])
                    c2 = dw.get("c2", [0, 0, 0])
                    ridge_top = dw.get("ridge_top", [0, 0, 0])

                    v1 = [float(c1[0]), float(c1[1]), float(c1[2])]
                    v2 = [float(c2[0]), float(c2[1]), float(c2[2])]
                    v_ridge = [float(ridge_top[0]), float(ridge_top[1]), float(ridge_top[2])]

                    idx = len(vertices_3d)
                    vertices_3d.extend([v1, v2, v_ridge])
                    faces_3d.append([idx, idx + 1, idx + 2])

                    g_idx = len(gable_vertices)
                    gable_vertices.extend([v1, v2, v_ridge])
                    gable_faces.append([g_idx, g_idx + 1, g_idx + 2])

        return {
            "vertices": vertices_3d,
            "faces": faces_3d,
            "gable_mesh": {
                "vertices": gable_vertices,
                "faces": gable_faces
            },
            "wall_height": wall_height,
            "base_z": base_z,
        }

    @classmethod
    def generate_sloping_wall_mesh(
        cls,
        points: List[List[float]],
        plane_a: float,
        plane_b: float,
        plane_c: float,
        wall_height: float = 2700.0,
        base_z: float = 0.0
    ) -> Dict[str, Any]:
        """
        Generates 3D trapezoidal sloping wall mesh for a shed roof.
        """
        n = len(points)
        vertices_3d = []
        faces_3d = []
        gable_vertices = []
        gable_faces = []

        for i in range(n):
            pa = points[i]
            pb = points[(i + 1) % n]

            za_top = plane_a * pa[0] + plane_b * pa[1] + plane_c
            zb_top = plane_a * pb[0] + plane_b * pb[1] + plane_c

            v_b1 = [pa[0], pa[1], base_z]
            v_b2 = [pb[0], pb[1], base_z]
            v_t2 = [pb[0], pb[1], zb_top]
            v_t1 = [pa[0], pa[1], za_top]

            v_offset = len(vertices_3d)
            vertices_3d.extend([v_b1, v_b2, v_t2, v_t1])
            faces_3d.append([v_offset, v_offset + 1, v_offset + 2])
            faces_3d.append([v_offset, v_offset + 2, v_offset + 3])

            # Upper sloping wall wedge from wall_height to top
            if (za_top - wall_height > 0.5) or (zb_top - wall_height > 0.5):
                w_b1 = [pa[0], pa[1], wall_height]
                w_b2 = [pb[0], pb[1], wall_height]
                w_t2 = [pb[0], pb[1], zb_top]
                w_t1 = [pa[0], pa[1], za_top]

                g_offset = len(gable_vertices)
                gable_vertices.extend([w_b1, w_b2, w_t2, w_t1])
                gable_faces.append([g_offset, g_offset + 1, g_offset + 2])
                gable_faces.append([g_offset, g_offset + 2, g_offset + 3])

        return {
            "vertices": vertices_3d,
            "faces": faces_3d,
            "gable_mesh": {
                "vertices": gable_vertices,
                "faces": gable_faces
            },
            "wall_height": wall_height,
            "base_z": base_z
        }
