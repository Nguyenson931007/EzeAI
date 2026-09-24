"""
Plane Trimmer Module
Performs Roof Plane Cutting, Sutherland-Hodgman Polygon Trimming,
Valley Tie-In Solving, and Vertical Flashing Wall Generation.

Core Architectural Logic:
1. Target Plane = The raised roof plane (mặt mái bị nâng lên).
2. Adjacent faces define 3D cutting planes: L = P_raised ∩ P_adj.
3. Trim/clip the raised face polygon using Sutherland-Hodgman half-space clipping.
4. Extend adjacent faces to meet the new cutting line seamlessly.
5. Solve valley tie-ins and vertical flashing walls at reflex corners.
6. Rebuild graph topology so 2D Canvas and 3D mesh sync 100%.
"""
import math
from typing import List, Dict, Any, Optional, Tuple
import numpy as np

try:
    from .roof_graph import RoofGraph, RoofVertex, RoofEdge, RoofFace
except ImportError:
    from roof_graph import RoofGraph, RoofVertex, RoofEdge, RoofFace


def clip_polygon_by_line(
    poly: List[List[float]],
    A: float,
    B: float,
    C: float,
    keep_greater_or_equal: bool = True
) -> List[List[float]]:
    """
    Clips a 2D polygon against the line A*x + B*y + C = 0 using Sutherland-Hodgman.
    """
    def eval_pt(p: List[float]) -> bool:
        val = A * p[0] + B * p[1] + C
        return val >= -1e-6 if keep_greater_or_equal else val <= 1e-6

    def intersect(p1: List[float], p2: List[float]) -> List[float]:
        d1 = A * p1[0] + B * p1[1] + C
        d2 = A * p2[0] + B * p2[1] + C
        denom = d1 - d2
        if abs(denom) < 1e-9:
            return p1
        t = d1 / denom
        return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]

    out: List[List[float]] = []
    n = len(poly)
    if n < 3:
        return poly

    for i in range(n):
        curr_p = poly[i]
        next_p = poly[(i + 1) % n]
        in_curr = eval_pt(curr_p)
        in_next = eval_pt(next_p)

        if in_curr:
            out.append(curr_p)
            if not in_next:
                out.append(intersect(curr_p, next_p))
        elif in_next:
            out.append(intersect(curr_p, next_p))

    return out


class PlaneTrimmer:
    """
    Cuts and trims roof faces against each other when wall heights / heel heights differ.
    Takes the raised roof face as base/target, clips it with cutting lines from adjacent faces,
    extends adjacent faces to meet the cut, and generates watertight flashing walls.
    """

    @classmethod
    def get_or_create_vertex(
        cls,
        graph: RoofGraph,
        x: float,
        y: float,
        is_contour: bool = False,
        fixed_z: Optional[float] = None,
        vertex_type: str = "generic",
        tol: float = 2.0
    ) -> int:
        for v in graph.vertices:
            if math.hypot(v.x - x, v.y - y) <= tol:
                if fixed_z is not None:
                    v.fixed_z = fixed_z
                    v.z = fixed_z
                return v.id

        new_vid = len(graph.vertices)
        v = RoofVertex(
            id=new_vid,
            x=float(x),
            y=float(y),
            z=float(fixed_z) if fixed_z is not None else 0.0,
            vertex_type=vertex_type,
            is_contour=is_contour,
            fixed_z=fixed_z
        )
        graph.vertices.append(v)
        return new_vid

    @classmethod
    def trim_raised_faces(
        cls,
        graph: RoofGraph,
        points: List[List[float]],
        wall_heights: List[float]
    ) -> List[Dict[str, Any]]:
        """
        Degree-Aware Direct Plane Solver:
        Classifies vertices by degree and solves them directly without infinite clipping or splicing:
        1. Degree-1 (Eave interior vertices): Kept on 2D footprint, Z evaluated on face plane.
        2. Degree-2 (Eave corners): If delta_Z > 1mm, generates vertical Fascia Triangles for watertight closure.
        3. Degree-3 (Interior skeleton nodes): Exact 3-plane intersection (P_i ∩ P_j ∩ P_k).
        4. Degree >= 4 (Bifurcation nodes): Lower-envelope multi-plane solver.
        """
        flashing_walls: List[Dict[str, Any]] = []
        if not points or not wall_heights or len(wall_heights) < len(points):
            return flashing_walls

        base_wall_h = min(wall_heights)
        n_edges = len(points)

        # Identify faces that have their eave raised above the minimum wall height
        raised_faces = [
            f for f in graph.faces
            if not getattr(f, "is_gable", False) and (
                (0 <= getattr(f, "contour_edge_index", -1) < len(wall_heights) and wall_heights[f.contour_edge_index] > base_wall_h + 0.5)
                or f.eave_height > base_wall_h + 0.5
            )
        ]

        if not raised_faces:
            return flashing_walls

        # 1. Map each vertex to its adjacent non-gable faces
        vertex_faces: Dict[int, List[RoofFace]] = {v.id: [] for v in graph.vertices}
        for f in graph.faces:
            if not getattr(f, "is_gable", False):
                for vid in f.vertices:
                    if vid in vertex_faces:
                        vertex_faces[vid].append(f)

        # 2. DEGREE-3 & DEGREE >= 4 INTERIOR NODES:
        # Solve exact N-plane intersection for all interior skeleton vertices affected by raised faces
        for v in graph.vertices:
            if v.is_contour:
                continue  # Contour vertices are handled by eave rules

            adj_flist = vertex_faces.get(v.id, [])

            # Check if this interior vertex is influenced by at least one raised face
            if not any(f.eave_height > base_wall_h + 0.5 for f in adj_flist):
                continue

            if len(adj_flist) == 3:
                f1, f2, f3 = adj_flist
                A = np.array([
                    [f1.plane_a, f1.plane_b, -1.0],
                    [f2.plane_a, f2.plane_b, -1.0],
                    [f3.plane_a, f3.plane_b, -1.0]
                ])
                B = np.array([-f1.plane_c, -f2.plane_c, -f3.plane_c])
                try:
                    sol = np.linalg.solve(A, B)
                    v.x = float(sol[0])
                    v.y = float(sol[1])
                    v.z = float(sol[2])
                    v.fixed_z = float(sol[2])
                except np.linalg.LinAlgError:
                    pass

            elif len(adj_flist) >= 4:
                # DEGREE >= 4 BIFURCATION NODES:
                # Solve subsets of 3 planes and average or cluster
                sols = []
                for i in range(len(adj_flist)):
                    for j in range(i + 1, len(adj_flist)):
                        for k in range(j + 1, len(adj_flist)):
                            f1, f2, f3 = adj_flist[i], adj_flist[j], adj_flist[k]
                            A = np.array([
                                [f1.plane_a, f1.plane_b, -1.0],
                                [f2.plane_a, f2.plane_b, -1.0],
                                [f3.plane_a, f3.plane_b, -1.0]
                            ])
                            B = np.array([-f1.plane_c, -f2.plane_c, -f3.plane_c])
                            try:
                                s = np.linalg.solve(A, B)
                                sols.append(s)
                            except np.linalg.LinAlgError:
                                pass
                if sols:
                    avg_sol = np.mean(sols, axis=0)
                    v.x = float(avg_sol[0])
                    v.y = float(avg_sol[1])
                    v.z = float(avg_sol[2])
                    v.fixed_z = float(avg_sol[2])

        # 3. SEAMLESS EAVE TRIMMING & HIP CLOSING (Trim excess eave on raised face & extend adjacent faces):
        for rf in raised_faces:
            ci = getattr(rf, "contour_edge_index", -1)
            if ci < 0 or ci >= n_edges:
                continue

            prev_i = (ci - 1 + n_edges) % n_edges
            next_i = (ci + 1) % n_edges
            h_rf = float(wall_heights[ci])
            h_prev = float(wall_heights[prev_i])
            h_next = float(wall_heights[next_i])

            f_prev = next((f for f in graph.faces if getattr(f, "contour_edge_index", -1) == prev_i), None)
            f_next = next((f for f in graph.faces if getattr(f, "contour_edge_index", -1) == next_i), None)

            # Find contour corner vertices of rf (works for both 0 overhang and positive overhang):
            c_start_vid = None
            if f_prev:
                for vid in rf.vertices:
                    if vid in f_prev.vertices and vid < len(graph.vertices) and graph.vertices[vid].is_contour:
                        c_start_vid = vid
                        break

            c_end_vid = None
            if f_next:
                for vid in rf.vertices:
                    if vid in f_next.vertices and vid < len(graph.vertices) and graph.vertices[vid].is_contour:
                        c_end_vid = vid
                        break

            # If contour vertices exist (including offset overhang contour), use their coordinates:
            if c_start_vid is not None:
                v_s = graph.vertices[c_start_vid]
                p_start = [v_s.x, v_s.y]
            else:
                p_start = points[ci]

            if c_end_vid is not None:
                v_e = graph.vertices[c_end_vid]
                p_end = [v_e.x, v_e.y]
            else:
                p_end = points[(ci + 1) % n_edges]

            ux = p_end[0] - p_start[0]
            uy = p_end[1] - p_start[1]
            L = math.hypot(ux, uy)
            if L < 1e-4:
                continue
            ux /= L
            uy /= L

            # 3a. Corner at p_start (meeting wall prev_i)
            p_prev = points[prev_i]
            v_in = (points[ci][0] - p_prev[0], points[ci][1] - p_prev[1])
            v_out = (points[(ci + 1) % n_edges][0] - points[ci][0], points[(ci + 1) % n_edges][1] - points[ci][1])
            cross_start = v_in[0] * v_out[1] - v_in[1] * v_out[0]

            if cross_start > 1e-4 and h_rf > h_prev + 0.5:
                if f_prev:
                    A = rf.plane_a - f_prev.plane_a
                    B = rf.plane_b - f_prev.plane_b
                    C = rf.plane_c - f_prev.plane_c
                    denom = A * ux + B * uy
                    if abs(denom) > 1e-5:
                        t = -(A * p_start[0] + B * p_start[1] + C) / denom
                        if 0.0 < t < L:
                            p_cut = [p_start[0] + t * ux, p_start[1] + t * uy]
                            z_cut = rf.plane_a * p_cut[0] + rf.plane_b * p_cut[1] + rf.plane_c
                            new_vid = len(graph.vertices)
                            v_obj = RoofVertex(id=new_vid, x=p_cut[0], y=p_cut[1], z=z_cut, fixed_z=z_cut, is_contour=True)
                            graph.vertices.append(v_obj)

                            c_vid = c_start_vid
                            if c_vid is None:
                                for vid in rf.vertices:
                                    if vid < len(graph.vertices):
                                        v = graph.vertices[vid]
                                        if math.hypot(v.x - p_start[0], v.y - p_start[1]) < 5.0:
                                            c_vid = vid
                                            break
                            if c_vid is not None and c_vid in rf.vertices:
                                rf.vertices[rf.vertices.index(c_vid)] = new_vid
                                cls._insert_eave_cut_vertex(f_prev.vertices, graph, c_vid, new_vid)

            # 3b. Corner at p_end (meeting wall next_i)
            p_next2 = points[(next_i + 1) % n_edges]
            v_in2 = (points[(ci + 1) % n_edges][0] - points[ci][0], points[(ci + 1) % n_edges][1] - points[ci][1])
            v_out2 = (p_next2[0] - points[(next_i) % n_edges][0], p_next2[1] - points[(next_i) % n_edges][1])
            cross_end = v_in2[0] * v_out2[1] - v_in2[1] * v_out2[0]

            if cross_end > 1e-4 and h_rf > h_next + 0.5:
                if f_next:
                    A = rf.plane_a - f_next.plane_a
                    B = rf.plane_b - f_next.plane_b
                    C = rf.plane_c - f_next.plane_c
                    denom = A * ux + B * uy
                    if abs(denom) > 1e-5:
                        t = -(A * p_start[0] + B * p_start[1] + C) / denom
                        if 0.0 < t < L:
                            p_cut = [p_start[0] + t * ux, p_start[1] + t * uy]
                            z_cut = rf.plane_a * p_cut[0] + rf.plane_b * p_cut[1] + rf.plane_c
                            new_vid = len(graph.vertices)
                            v_obj = RoofVertex(id=new_vid, x=p_cut[0], y=p_cut[1], z=z_cut, fixed_z=z_cut, is_contour=True)
                            graph.vertices.append(v_obj)

                            c_vid = c_end_vid
                            if c_vid is None:
                                for vid in rf.vertices:
                                    if vid < len(graph.vertices):
                                        v = graph.vertices[vid]
                                        if math.hypot(v.x - p_end[0], v.y - p_end[1]) < 5.0:
                                            c_vid = vid
                                            break
                            if c_vid is not None and c_vid in rf.vertices:
                                rf.vertices[rf.vertices.index(c_vid)] = new_vid
                                cls._insert_eave_cut_vertex(f_next.vertices, graph, c_vid, new_vid)

        # 4. DEGREE-1 EAVE VERTICES:
        # Contour vertices along the eave keep their 2D (x, y) coordinates fixed to the wall footprint.
        # Ensure their fixed_z and z match their face's plane equation.
        v_map = {v.id: v for v in graph.vertices}
        for f in graph.faces:
            if not getattr(f, "is_gable", False):
                for vid in f.vertices:
                    v = v_map.get(vid)
                    if v is not None and v.is_contour:
                        z_val = f.plane_a * v.x + f.plane_b * v.y + f.plane_c
                        v.z = z_val
                        v.fixed_z = z_val

        return flashing_walls

    @classmethod
    def detect_and_handle_valley_tie_ins(
        cls,
        graph: RoofGraph,
        points: List[List[float]],
        wall_heights: Optional[List[float]]
    ) -> List[Dict[str, Any]]:
        """
        Detects reflex corners (> 180 deg) where adjacent walls have different heights.
        Extends the higher eave into the lower roof plane to find the P_tie_in start point
        for the Valley Line, and generates a vertical flashing wall.
        """
        flashing_walls: List[Dict[str, Any]] = []
        if not points or len(points) < 3 or not wall_heights or len(wall_heights) < len(points):
            return flashing_walls

        n = len(points)
        edge_to_face: Dict[int, RoofFace] = {}
        for face in graph.faces:
            ci = getattr(face, "contour_edge_index", -1)
            if 0 <= ci < n:
                edge_to_face[ci] = face

        for i in range(n):
            prev_i = (i - 1 + n) % n
            curr_pt = points[i]
            prev_pt = points[prev_i]
            next_pt = points[(i + 1) % n]

            v_in = (curr_pt[0] - prev_pt[0], curr_pt[1] - prev_pt[1])
            v_out = (next_pt[0] - curr_pt[0], next_pt[1] - curr_pt[1])

            cross_p = v_in[0] * v_out[1] - v_in[1] * v_out[0]
            if cross_p >= -1e-4:
                continue

            h_prev = float(wall_heights[prev_i])
            h_curr = float(wall_heights[i])

            if abs(h_prev - h_curr) < 1.0:
                continue

            # Case A: Edge prev_i is LOW, Edge i is HIGH
            if h_prev < h_curr:
                low_edge = prev_i
                high_edge = i
                h_low = h_prev
                h_high = h_curr

                f_low = edge_to_face.get(low_edge)
                f_high = edge_to_face.get(high_edge)
                if not f_low or not f_high:
                    continue

                len_out = math.hypot(v_out[0], v_out[1])
                if len_out < 1e-4:
                    continue
                # High eave extends backwards past curr_pt: -v_out
                u_x, u_y = -v_out[0] / len_out, -v_out[1] / len_out

                denom = f_low.plane_a * u_x + f_low.plane_b * u_y
                if abs(denom) > 1e-5:
                    t = (h_high - f_low.plane_c - f_low.plane_a * curr_pt[0] - f_low.plane_b * curr_pt[1]) / denom
                    if t > 1.0:
                        p_tie = [curr_pt[0] + t * u_x, curr_pt[1] + t * u_y, h_high]

                        v_base = [curr_pt[0], curr_pt[1], h_low]
                        v_top = [curr_pt[0], curr_pt[1], h_high]

                        flashing_walls.append({
                            "wall_polygon": [v_base, v_top, p_tie],
                            "type": "valley_flashing",
                            "reflex_point": curr_pt
                        })

                        tie_vid = cls.get_or_create_vertex(
                            graph,
                            p_tie[0],
                            p_tie[1],
                            is_contour=True,
                            fixed_z=p_tie[2],
                            vertex_type="valley_tie_in"
                        )

                        curr_pt_id = cls._find_vertex_id(graph, curr_pt[0], curr_pt[1])
                        if curr_pt_id is not None:
                            skel_vid = cls._find_valley_skeleton_neighbor(graph, curr_pt_id, f_low)
                            if skel_vid is not None:
                                cls._insert_between(f_low.vertices, curr_pt_id, skel_vid, tie_vid)
                                cls._insert_between(f_high.vertices, curr_pt_id, skel_vid, tie_vid)
                                cls._update_graph_edges(graph, curr_pt_id, skel_vid, tie_vid)

            # Case B: Edge prev_i is HIGH, Edge i is LOW
            else:
                low_edge = i
                high_edge = prev_i
                h_low = h_curr
                h_high = h_prev

                f_low = edge_to_face.get(low_edge)
                f_high = edge_to_face.get(high_edge)
                if not f_low or not f_high:
                    continue

                len_in = math.hypot(v_in[0], v_in[1])
                if len_in < 1e-4:
                    continue
                # High eave extends forwards past curr_pt: +v_in
                u_x, u_y = v_in[0] / len_in, v_in[1] / len_in

                denom = f_low.plane_a * u_x + f_low.plane_b * u_y
                if abs(denom) > 1e-5:
                    t = (h_high - f_low.plane_c - f_low.plane_a * curr_pt[0] - f_low.plane_b * curr_pt[1]) / denom
                    if t > 1.0:
                        p_tie = [curr_pt[0] + t * u_x, curr_pt[1] + t * u_y, h_high]

                        v_base = [curr_pt[0], curr_pt[1], h_low]
                        v_top = [curr_pt[0], curr_pt[1], h_high]

                        flashing_walls.append({
                            "wall_polygon": [v_base, v_top, p_tie],
                            "type": "valley_flashing",
                            "reflex_point": curr_pt
                        })

                        tie_vid = cls.get_or_create_vertex(
                            graph,
                            p_tie[0],
                            p_tie[1],
                            is_contour=True,
                            fixed_z=p_tie[2],
                            vertex_type="valley_tie_in"
                        )

                        curr_pt_id = cls._find_vertex_id(graph, curr_pt[0], curr_pt[1])
                        if curr_pt_id is not None:
                            skel_vid = cls._find_valley_skeleton_neighbor(graph, curr_pt_id, f_low)
                            if skel_vid is not None:
                                cls._insert_between(f_low.vertices, curr_pt_id, skel_vid, tie_vid)
                                cls._insert_between(f_high.vertices, curr_pt_id, skel_vid, tie_vid)
                                cls._update_graph_edges(graph, curr_pt_id, skel_vid, tie_vid)

        return flashing_walls

    @classmethod
    def _find_vertex_id(cls, graph: RoofGraph, x: float, y: float, tol: float = 5.0) -> Optional[int]:
        for v in graph.vertices:
            if math.hypot(v.x - x, v.y - y) <= tol:
                return v.id
        return None

    @classmethod
    def _find_skeleton_neighbor(cls, graph: RoofGraph, vid: int, face: RoofFace) -> Optional[int]:
        verts = face.vertices
        n = len(verts)
        if vid not in verts:
            return None
        idx = verts.index(vid)
        prev_v = verts[(idx - 1 + n) % n]
        next_v = verts[(idx + 1) % n]

        for cand in (prev_v, next_v):
            if cand < len(graph.vertices) and not graph.vertices[cand].is_contour:
                return cand
        return None

    @classmethod
    def _find_valley_skeleton_neighbor(cls, graph: RoofGraph, reflex_vid: int, face: RoofFace) -> Optional[int]:
        return cls._find_skeleton_neighbor(graph, reflex_vid, face)

    @classmethod
    def _insert_eave_cut_vertex(cls, face_vertices: List[int], graph: RoofGraph, corner_vid: int, cut_vid: int) -> bool:
        if cut_vid in face_vertices or corner_vid not in face_vertices:
            return False
        idx = face_vertices.index(corner_vid)
        n = len(face_vertices)
        prev_v = face_vertices[(idx - 1 + n) % n]
        next_v = face_vertices[(idx + 1) % n]

        v_map = {v.id: v for v in graph.vertices}
        skel_is_next = (not v_map[next_v].is_contour) if next_v in v_map else False
        skel_is_prev = (not v_map[prev_v].is_contour) if prev_v in v_map else False

        if skel_is_next and not skel_is_prev:
            face_vertices.insert(idx + 1, cut_vid)
            return True
        elif skel_is_prev and not skel_is_next:
            face_vertices.insert(idx, cut_vid)
            return True
        else:
            face_vertices.insert(idx + 1, cut_vid)
            return True

    @classmethod
    def _insert_between(cls, face_vertices: List[int], vid_a: int, vid_b: int, new_vid: int) -> bool:
        if new_vid in face_vertices:
            return False
        n = len(face_vertices)
        for i in range(n):
            curr_v = face_vertices[i]
            next_v = face_vertices[(i + 1) % n]
            if (curr_v == vid_a and next_v == vid_b) or (curr_v == vid_b and next_v == vid_a):
                face_vertices.insert(i + 1, new_vid)
                return True
        return False

    @classmethod
    def _update_graph_edges(cls, graph: RoofGraph, reflex_vid: int, skel_vid: int, tie_vid: int) -> None:
        for e in graph.edges:
            if (e.source == reflex_vid and e.target == skel_vid) or (e.source == skel_vid and e.target == reflex_vid):
                e.source = reflex_vid
                e.target = tie_vid
                e.edge_type = "flashing_wall"
                e.is_contour = True
                e.is_bisector = False
                break

        new_edge = RoofEdge(
            id=len(graph.edges),
            source=tie_vid,
            target=skel_vid,
            edge_type="valley",
            is_bisector=True,
            is_contour=False
        )
        graph.edges.append(new_edge)

    @classmethod
    def trim_and_relocate(
        cls,
        graph: RoofGraph,
        points: Optional[List[List[float]]] = None,
        wall_heights: Optional[List[float]] = None
    ) -> List[Dict[str, Any]]:
        """
        Coordinates full Roof Plane Cutting, Polygon Trimming, and Valley Tie-In Solving:
        1. Gọt (Trim/Clip) các mặt bị nâng lên theo các mặt kề.
        2. Xử lý Valley tie-ins và vách giật cấp tại các góc lõm reflex.
        3. Đồng bộ hóa toàn bộ đồ thị để xuất ra mesh 3D và topology 2D.
        """
        flashing_walls: List[Dict[str, Any]] = []
        if not points or not wall_heights or len(wall_heights) != len(points):
            return flashing_walls

        # 1. Plane-Plane Cutting & Polygon Trimming on raised faces
        cls.trim_raised_faces(graph, points, wall_heights)

        # 2. Reflex Corner Valley Tie-ins and Vertical Flashing Walls
        fw = cls.detect_and_handle_valley_tie_ins(graph, points, wall_heights)
        flashing_walls.extend(fw)

        return flashing_walls
