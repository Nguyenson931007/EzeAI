"""
Dutch Gable Builder Module (Mái Bánh Ú kết hợp Đầu Hồi / Mái Hà Lan)
Decomposes hip faces (both simple triangles and complex polygons/trapezoids) into:
1. Hip Skirt (lower slope polygon)
2. Cap / Gablet (upper slope polygon retaining original algebraic plane)
3. Dutch Gable Wall (watertight vertical 90° polygon wall)
Applies 3-vector overhangs: Eave OVH, Dutch Front OVH, and Verge/Rake OVH.
"""
import math
from typing import List, Tuple, Dict, Any, Optional
import numpy as np

try:
    from .roof_graph import RoofGraph, RoofVertex, RoofFace, RoofEdge
    from .plane_builder import DeterministicPlaneBuilder
except ImportError:
    from roof_graph import RoofGraph, RoofVertex, RoofFace, RoofEdge
    from plane_builder import DeterministicPlaneBuilder


def segment_intersection_2d(
    p1: Tuple[float, float], p2: Tuple[float, float],
    p3: Tuple[float, float], p4: Tuple[float, float]
) -> Optional[Tuple[float, float]]:
    """Finds intersection point of segment p1->p2 with infinite line p3->p4."""
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4

    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-9:
        return None

    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    if -1e-6 <= t <= 1.0 + 1e-6:
        x = x1 + t * (x2 - x1)
        y = y1 + t * (y2 - y1)
        return (x, y)
    return None


def line_intersection_2d(
    p1: Tuple[float, float], p2: Tuple[float, float],
    p3: Tuple[float, float], p4: Tuple[float, float]
) -> Optional[Tuple[float, float]]:
    """Finds intersection point of infinite line p1->p2 with infinite line p3->p4."""
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

def clean_vids(vlist: List[int]) -> List[int]:
    """Loại bỏ trùng lặp liên tiếp trong danh sách đỉnh."""
    res: List[int] = []
    for v in vlist:
        if not res or res[-1] != v:
            res.append(v)
    if len(res) > 1 and res[0] == res[-1]:
        res.pop()
    return res


class DutchBuilder:
    @classmethod
    def apply_dutch_gables(
        cls,
        graph: RoofGraph,
        points: List[List[float]],
        angles: List[float],
        dutch_edges: Optional[List[int]] = None,
        dutch_overhangs: Optional[List[float]] = None,
        dutch_rake_overhangs: Optional[List[float]] = None,
        dutch_cut_points: Optional[List[Optional[List[float]]]] = None,
        wall_z: float = 2700.0,
    ) -> List[Dict[str, Any]]:
        if not dutch_edges:
            return []

        # 1. Đảm bảo toàn bộ phương trình mặt phẳng đã được tính toán
        DeterministicPlaneBuilder.compute_3d_heights(graph, default_eave_z=wall_z)

        n_pts = len(points)
        dutch_walls: List[Dict[str, Any]] = []

        for d_idx, edge_idx in enumerate(dutch_edges):
            if edge_idx < 0 or edge_idx >= n_pts:
                continue

            # Tìm mặt mái tương ứng với contour edge này
            matching_face: Optional[RoofFace] = None
            matching_face_idx: Optional[int] = None
            for f_idx, f in enumerate(graph.faces):
                if f.contour_edge_index == edge_idx and not getattr(f, "is_gable", False):
                    matching_face = f
                    matching_face_idx = f_idx
                    break

            p1 = (points[edge_idx][0], points[edge_idx][1])
            p2 = (points[(edge_idx + 1) % n_pts][0], points[(edge_idx + 1) % n_pts][1])

            # Fallback hình học nếu contour_edge_index không khớp
            if not matching_face:
                mid_x = (p1[0] + p2[0]) / 2.0
                mid_y = (p1[1] + p2[1]) / 2.0
                best_dist = float("inf")
                for f_idx, f in enumerate(graph.faces):
                    if getattr(f, "is_gable", False):
                        continue
                    f_verts = [graph.vertices[vid] for vid in f.vertices if vid < len(graph.vertices)]
                    for i in range(len(f_verts)):
                        v1 = f_verts[i]
                        v2 = f_verts[(i + 1) % len(f_verts)]
                        seg_dx = v2.x - v1.x
                        seg_dy = v2.y - v1.y
                        seg_len2 = seg_dx * seg_dx + seg_dy * seg_dy
                        if seg_len2 < 1e-4:
                            continue
                        t = max(0.0, min(1.0, ((mid_x - v1.x) * seg_dx + (mid_y - v1.y) * seg_dy) / seg_len2))
                        proj_x = v1.x + t * seg_dx
                        proj_y = v1.y + t * seg_dy
                        dist = math.hypot(mid_x - proj_x, mid_y - proj_y)
                        if dist < best_dist:
                            best_dist = dist
                            matching_face = f
                            matching_face_idx = f_idx

            if not matching_face or matching_face_idx is None:
                continue

            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            eave_len = math.hypot(dx, dy)
            if eave_len < 1e-6:
                continue

            # Inward normal và Tangent ban đầu
            nx = -dy / eave_len
            ny = dx / eave_len
            tx = dx / eave_len
            ty = dy / eave_len

            # Chuẩn hóa hướng nx, ny luôn chỉ vào trong lòng mặt mái matching_face
            face_verts = [graph.vertices[vid] for vid in matching_face.vertices if vid < len(graph.vertices)]
            skeleton_verts = [v for v in face_verts if not v.is_contour]

            if skeleton_verts:
                avg_inward = sum((v.x - p1[0]) * nx + (v.y - p1[1]) * ny for v in skeleton_verts) / len(skeleton_verts)
                if avg_inward < 0:
                    nx, ny = -nx, -ny
                    tx, ty = -tx, -ty
            elif face_verts:
                centroid_x = sum(v.x for v in face_verts) / len(face_verts)
                centroid_y = sum(v.y for v in face_verts) / len(face_verts)
                if (centroid_x - p1[0]) * nx + (centroid_y - p1[1]) * ny < 0:
                    nx, ny = -nx, -ny
                    tx, ty = -tx, -ty

            # Chiều sâu inward của các đỉnh Skeleton trong mặt này
            inward_distances = [(v.x - p1[0]) * nx + (v.y - p1[1]) * ny for v in skeleton_verts]

            t_max = max(inward_distances) if inward_distances else 2000.0

            # Xác định khoảng cách cắt delta_t
            delta_t: Optional[float] = None
            cp = None
            if dutch_cut_points and edge_idx < len(dutch_cut_points) and dutch_cut_points[edge_idx]:
                cp = dutch_cut_points[edge_idx]
                # Snap chính xác vào đỉnh Skeleton nếu điểm chọn cp nằm gần đỉnh (tolerance 50mm)
                matched_vert = None
                for sv in skeleton_verts:
                    if math.hypot(cp[0] - sv.x, cp[1] - sv.y) < 50.0:
                        matched_vert = sv
                        break
                if matched_vert:
                    delta_t = (matched_vert.x - p1[0]) * nx + (matched_vert.y - p1[1]) * ny
                else:
                    delta_t = (cp[0] - p1[0]) * nx + (cp[1] - p1[1]) * ny
                delta_t = max(0.0, delta_t)

            if delta_t is None:
                delta_t = 0.5 * t_max

            # Điểm gốc và đường cắt vô hạn
            base_cut_pt = (p1[0] + delta_t * nx, p1[1] + delta_t * ny)
            
            # Validate invariant to prevent degenerate cut point
            if cp:
                try:
                    graph.validate_dutch_cut_interior_invariant(cp, p1, (nx, ny), (-nx, -ny))
                except ValueError as e:
                    print(f"Dutch cut invariant failed for edge {edge_idx}: {e}")
                    # Fallback if invalid
                    base_cut_pt = (p1[0] + 0.5 * t_max * nx, p1[1] + 0.5 * t_max * ny)

            cut_p1 = (base_cut_pt[0] - 100000.0 * tx, base_cut_pt[1] - 100000.0 * ty)
            cut_p2 = (base_cut_pt[0] + 100000.0 * tx, base_cut_pt[1] + 100000.0 * ty)

            # Tính cao độ Z_break trực tiếp từ phương trình mặt phẳng
            z_break = matching_face.plane_a * base_cut_pt[0] + matching_face.plane_b * base_cut_pt[1] + matching_face.plane_c

            raw_front_ovh = dutch_overhangs[edge_idx] if (dutch_overhangs and edge_idx < len(dutch_overhangs)) else 0.0
            front_ovh = float(raw_front_ovh) if raw_front_ovh is not None else 0.0
            raw_rake_ovh = dutch_rake_overhangs[edge_idx] if (dutch_rake_overhangs and edge_idx < len(dutch_rake_overhangs)) else 0.0
            rake_ovh = float(raw_rake_ovh) if raw_rake_ovh is not None else 0.0

            wall_info = cls._split_face_by_boundary(
                graph=graph,
                face_idx=matching_face_idx,
                p1=p1,
                p2=p2,
                nx=nx,
                ny=ny,
                tx=tx,
                ty=ty,
                delta_t=delta_t,
                cut_p1=cut_p1,
                cut_p2=cut_p2,
                z_break=z_break,
                edge_idx=edge_idx,
                wall_z=wall_z,
                front_ovh=front_ovh,
                rake_ovh=rake_ovh
            )

            if wall_info:
                dutch_walls.append(wall_info)

        graph.rebuild_edges_from_faces()
        return dutch_walls

    @classmethod
    def _split_face_by_boundary(
        cls,
        graph: RoofGraph,
        face_idx: int,
        p1: Tuple[float, float],
        p2: Tuple[float, float],
        nx: float,
        ny: float,
        tx: float,
        ty: float,
        delta_t: float,
        cut_p1: Tuple[float, float],
        cut_p2: Tuple[float, float],
        z_break: float,
        edge_idx: int,
        wall_z: float,
        front_ovh: float = 0.0,
        rake_ovh: float = 0.0
    ) -> Optional[Dict[str, Any]]:
        face = graph.faces[face_idx]
        if len(face.vertices) < 3:
            return None

        # 1. Phân loại và cắt các cạnh
        skirt_vids, cap_vids, break_vids, edge_subdivisions = cls._classify_and_split_edges(
            graph, face, p1, nx, ny, delta_t, cut_p1, cut_p2
        )
        if len(skirt_vids) < 3 or len(cap_vids) < 3 or len(break_vids) < 2:
            return None

        # 2. Đồng bộ các cạnh dùng chung
        cls._propagate_edge_subdivisions(graph, face, edge_subdivisions)

        # 3. Sắp xếp b_left và b_right
        b_left_id, b_right_id = cls._sort_break_points(graph, break_vids, p1, p2)
        b_left, b_right = graph.vertices[b_left_id], graph.vertices[b_right_id]

        # Sửa Z cho b_left và b_right
        b_left.z = face.plane_a * b_left.x + face.plane_b * b_left.y + face.plane_c
        b_left.fixed_z = b_left.z
        b_right.z = face.plane_a * b_right.x + face.plane_b * b_right.y + face.plane_c
        b_right.fixed_z = b_right.z

        # Cập nhật mặt gốc thành Skirt
        face.vertices = skirt_vids

        # 4. Tìm và dựng các đỉnh đỉnh dông tường
        apex_wall_vids, wall_top_pts, ridge_top_verts = cls._build_wall_apex_vertices(
            graph, face, cap_vids, b_left, b_right, p1, nx, ny, delta_t, z_break
        )
        
        # 5. Tìm mặt trái, phải
        left_face, right_face = cls._find_adjacent_faces(
            graph, face, b_left_id, b_right_id, ridge_top_verts[0].id, ridge_top_verts[-1].id
        )

        # 6. Mái Đua (Overhang Cap Faces)
        has_overhang = (front_ovh > 0 or rake_ovh > 0)

        if has_overhang:
            cls._build_overhang_cap_faces(
                graph, face, b_left, b_right, p1, nx, ny, tx, ty,
                delta_t, front_ovh, rake_ovh, ridge_top_verts,
                left_face, right_face, apex_wall_vids, edge_subdivisions
            )

        # 7. Nối đỉnh tường vào mặt lân cận
        cls._splice_apex_into_adjacent_faces(
            graph, face, b_left_id, b_right_id, ridge_top_verts[0].id, ridge_top_verts[-1].id,
            apex_wall_vids[0], apex_wall_vids[-1]
        )

        # 8. Dữ liệu tường đứng
        wall_polygon_3d = [[b_left.x, b_left.y, b_left.z], [b_right.x, b_right.y, b_right.z]]
        for pt in reversed(wall_top_pts):
            wall_polygon_3d.append(pt)

        return {
            "edge_index": edge_idx,
            "wall_type": "dutch_gable",
            "c1": [b_left.x, b_left.y, b_left.z],
            "c2": [b_right.x, b_right.y, b_right.z],
            "wall_p1": [b_left.x, b_left.y, b_left.z],
            "wall_p2": [b_right.x, b_right.y, b_right.z],
            "base_p1": [b_left.x, b_left.y, wall_z],
            "base_p2": [b_right.x, b_right.y, wall_z],
            "ridge_top": [wall_top_pts[-1][0], wall_top_pts[-1][1], wall_top_pts[-1][2]],
            "wall_polygon": wall_polygon_3d,
            "z_cut": (b_left.z + b_right.z) / 2.0,
            "z_ridge": max([pt[2] for pt in wall_top_pts] or [b_left.z]),
        }

    @classmethod
    def _classify_and_split_edges(
        cls, graph: RoofGraph, face: RoofFace, p1: Tuple[float, float],
        nx: float, ny: float, delta_t: float, cut_p1: Tuple[float, float], cut_p2: Tuple[float, float]
    ) -> Tuple[List[int], List[int], List[int], List[Tuple[int, int, int]]]:
        skirt_vids: List[int] = []
        cap_vids: List[int] = []
        break_vids: List[int] = []
        edge_subdivisions: List[Tuple[int, int, int]] = []
        TOL = 1.0

        def get_dist(v: RoofVertex) -> float:
            return (v.x - p1[0]) * nx + (v.y - p1[1]) * ny

        face_vids = face.vertices
        n_v = len(face_vids)
        for i in range(n_v):
            curr_vid = face_vids[i]
            next_vid = face_vids[(i + 1) % n_v]
            curr_v = graph.vertices[curr_vid]
            next_v = graph.vertices[next_vid]

            d_curr = get_dist(curr_v)
            d_next = get_dist(next_v)

            is_curr_on_break = abs(d_curr - delta_t) <= TOL
            is_curr_skirt = (d_curr <= delta_t - TOL) or is_curr_on_break
            is_curr_cap = (d_curr >= delta_t + TOL) or is_curr_on_break

            if is_curr_on_break:
                skirt_vids.append(curr_vid)
                cap_vids.append(curr_vid)
                if curr_vid not in break_vids:
                    break_vids.append(curr_vid)
            elif is_curr_skirt:
                skirt_vids.append(curr_vid)
            elif is_curr_cap:
                cap_vids.append(curr_vid)

            strictly_skirt_curr = d_curr < delta_t - TOL
            strictly_cap_curr = d_curr > delta_t + TOL
            strictly_skirt_next = d_next < delta_t - TOL
            strictly_cap_next = d_next > delta_t + TOL

            if (strictly_skirt_curr and strictly_cap_next) or (strictly_cap_curr and strictly_skirt_next):
                inter = segment_intersection_2d((curr_v.x, curr_v.y), (next_v.x, next_v.y), cut_p1, cut_p2)
                if inter is None:
                    ratio = (delta_t - d_curr) / (d_next - d_curr) if abs(d_next - d_curr) > 1e-6 else 0.5
                    ratio = max(0.0, min(1.0, ratio))
                    inter = (curr_v.x + ratio * (next_v.x - curr_v.x), curr_v.y + ratio * (next_v.y - curr_v.y))

                inter_z = face.plane_a * inter[0] + face.plane_b * inter[1] + face.plane_c
                found_id = None
                for v in graph.vertices:
                    if math.hypot(v.x - inter[0], v.y - inter[1]) < TOL:
                        found_id = v.id
                        break

                if found_id is None:
                    new_id = len(graph.vertices)
                    new_v = RoofVertex(
                        id=new_id, x=inter[0], y=inter[1], z=inter_z, time=delta_t,
                        vertex_type="dutch_break", is_contour=False, is_skeleton=True,
                        fixed_z=inter_z, adjacent_faces=[face.id]
                    )
                    graph.vertices.append(new_v)
                    found_id = new_id

                skirt_vids.append(found_id)
                cap_vids.append(found_id)
                if found_id not in break_vids:
                    break_vids.append(found_id)
                edge_subdivisions.append((curr_vid, next_vid, found_id))

        return clean_vids(skirt_vids), clean_vids(cap_vids), break_vids, edge_subdivisions

    @classmethod
    def _propagate_edge_subdivisions(
        cls, graph: RoofGraph, face: RoofFace, edge_subdivisions: List[Tuple[int, int, int]]
    ) -> None:
        for (v_a, v_b, v_new) in edge_subdivisions:
            for other_f in graph.faces:
                if other_f.id == face.id or getattr(other_f, "is_gable", False):
                    continue
                o_vids = other_f.vertices
                n_o = len(o_vids)
                new_o_vids = []
                subdivided = False
                for j in range(n_o):
                    curr_j = o_vids[j]
                    next_j = o_vids[(j + 1) % n_o]
                    new_o_vids.append(curr_j)
                    if (curr_j == v_a and next_j == v_b) or (curr_j == v_b and next_j == v_a):
                        if v_new not in o_vids:
                            new_o_vids.append(v_new)
                            subdivided = True
                if subdivided:
                    other_f.vertices = clean_vids(new_o_vids)

    @classmethod
    def _sort_break_points(
        cls, graph: RoofGraph, break_vids: List[int], p1: Tuple[float, float], p2: Tuple[float, float]
    ) -> Tuple[int, int]:
        b1_v = graph.vertices[break_vids[0]]
        b2_v = graph.vertices[break_vids[1]]
        dx_eave, dy_eave = p2[0] - p1[0], p2[1] - p1[1]

        dot1 = (b1_v.x - p1[0]) * dx_eave + (b1_v.y - p1[1]) * dy_eave
        dot2 = (b2_v.x - p1[0]) * dx_eave + (b2_v.y - p1[1]) * dy_eave

        if dot1 < dot2:
            return break_vids[0], break_vids[1]
        return break_vids[1], break_vids[0]

    @classmethod
    def _build_wall_apex_vertices(
        cls, graph: RoofGraph, face: RoofFace, cap_vids: List[int],
        b_left: RoofVertex, b_right: RoofVertex, p1: Tuple[float, float],
        nx: float, ny: float, delta_t: float, z_break: float
    ) -> Tuple[List[int], List[List[float]], List[RoofVertex]]:
        ridge_top_verts = [graph.vertices[vid] for vid in cap_vids if vid not in (b_left.id, b_right.id)]
        if not ridge_top_verts:
            non_contour_verts = [graph.vertices[vid] for vid in face.vertices if not graph.vertices[vid].is_contour]
            if non_contour_verts:
                highest_v = max(non_contour_verts, key=lambda v: (v.z if v.z is not None else -1e9))
                ridge_top_verts = [highest_v]
            else:
                mid_x = (b_left.x + b_right.x) / 2.0
                mid_y = (b_left.y + b_right.y) / 2.0
                h_apex = z_break + 500.0
                synth_apex = RoofVertex(
                    id=len(graph.vertices), x=mid_x, y=mid_y, z=h_apex,
                    vertex_type="dutch_ridge", is_contour=False, is_skeleton=True, fixed_z=h_apex
                )
                graph.vertices.append(synth_apex)
                ridge_top_verts = [synth_apex]

        apex_wall_vids: List[int] = []
        wall_top_pts: List[List[float]] = []

        for rv in ridge_top_verts:
            d_rv = (rv.x - p1[0]) * nx + (rv.y - p1[1]) * ny
            excess = d_rv - delta_t
            x_wall = rv.x - excess * nx
            y_wall = rv.y - excess * ny
            z_wall = rv.z if rv.z is not None else (face.plane_a * rv.x + face.plane_b * rv.y + face.plane_c)

            new_apex_id = len(graph.vertices)
            new_apex_v = RoofVertex(
                id=new_apex_id, x=x_wall, y=y_wall, z=z_wall, time=delta_t,
                vertex_type="dutch_ridge", is_contour=False, is_skeleton=True, fixed_z=z_wall, adjacent_faces=[face.id]
            )
            graph.vertices.append(new_apex_v)
            apex_wall_vids.append(new_apex_id)
            wall_top_pts.append([x_wall, y_wall, z_wall])
            
        return apex_wall_vids, wall_top_pts, ridge_top_verts

    @classmethod
    def _find_adjacent_faces(
        cls, graph: RoofGraph, face: RoofFace, b_left_id: int, b_right_id: int,
        ridge_start_id: int, ridge_end_id: int
    ) -> Tuple[Optional[RoofFace], Optional[RoofFace]]:
        left_face: Optional[RoofFace] = None
        right_face: Optional[RoofFace] = None

        for other_f in graph.faces:
            if other_f.id == face.id or getattr(other_f, "is_gable", False):
                continue
            o_vids = other_f.vertices
            n_o = len(o_vids)
            for j in range(n_o):
                v_curr = o_vids[j]
                v_next = o_vids[(j + 1) % n_o]
                if (v_curr == b_left_id and v_next == ridge_start_id) or (v_curr == ridge_start_id and v_next == b_left_id):
                    left_face = other_f
                if (v_curr == ridge_end_id and v_next == b_right_id) or (v_curr == b_right_id and v_next == ridge_end_id):
                    right_face = other_f
        return left_face, right_face

    @classmethod
    def _build_overhang_cap_faces(
        cls, graph: RoofGraph, face: RoofFace, b_left: RoofVertex, b_right: RoofVertex,
        p1: Tuple[float, float], nx: float, ny: float, tx: float, ty: float,
        delta_t: float, front_ovh: float, rake_ovh: float, ridge_top_verts: List[RoofVertex],
        left_face: Optional[RoofFace], right_face: Optional[RoofFace],
        apex_wall_vids: List[int], edge_subdivisions: List[Tuple[int, int, int]]
    ) -> Tuple[int, int, List[int]]:
        
        nx_out, ny_out = -nx, -ny
        ovh_t = delta_t - front_ovh
        base_ovh_pt = (p1[0] + ovh_t * nx, p1[1] + ovh_t * ny)
        ovh_p1 = (base_ovh_pt[0] - 100000.0 * tx, base_ovh_pt[1] - 100000.0 * ty)
        ovh_p2 = (base_ovh_pt[0] + 100000.0 * tx, base_ovh_pt[1] + 100000.0 * ty)

        def get_best_outward_target(b_id: int, b_v: RoofVertex) -> Optional[RoofVertex]:
            outward_targets = []
            for (va, vb, vnew) in edge_subdivisions:
                if vnew == b_id:
                    for v_target_id in [va, vb]:
                        vt = graph.vertices[v_target_id]
                        if (vt.x - b_v.x) * nx + (vt.y - b_v.y) * ny < -1e-3:
                            outward_targets.append({'v': vt, 'type': 'split'})
            if not outward_targets:
                for edge in graph.edges:
                    if getattr(edge, 'is_contour', False):
                        continue
                    if edge.source == b_id or edge.target == b_id:
                        v_target_id = edge.target if edge.source == b_id else edge.source
                        vt = graph.vertices[v_target_id]
                        if (vt.x - b_v.x) * nx + (vt.y - b_v.y) * ny < -1e-3:
                            outward_targets.append({'v': vt, 'type': getattr(edge, 'edge_type', 'unknown')})
            if outward_targets:
                def rank(t):
                    typ = t['type']
                    if typ == 'ridge': return 0
                    if typ == 'hip': return 1
                    if typ == 'valley': return 2
                    return 3
                outward_targets.sort(key=rank)
                return outward_targets[0]['v']
            return None

        # K_left
        outward_v_left = get_best_outward_target(b_left.id, b_left)
        ray_target_left = outward_v_left if outward_v_left else ridge_top_verts[0]
        inter_left = line_intersection_2d(
            (b_left.x, b_left.y), (ray_target_left.x, ray_target_left.y), ovh_p1, ovh_p2
        )
        if inter_left is None:
            inter_left = line_intersection_2d(p1, (b_left.x, b_left.y), ovh_p1, ovh_p2)
        if inter_left is None:
            inter_left = (b_left.x + front_ovh * nx_out - rake_ovh * tx, b_left.y + front_ovh * ny_out - rake_ovh * ty)

        k_left_x, k_left_y = inter_left
        if rake_ovh > 0:
            k_left_x -= rake_ovh * tx
            k_left_y -= rake_ovh * ty

        ref_face_left = left_face if left_face else face
        k_left_z = ref_face_left.plane_a * k_left_x + ref_face_left.plane_b * k_left_y + ref_face_left.plane_c

        k_left_id = len(graph.vertices)
        graph.vertices.append(RoofVertex(
            id=k_left_id, x=k_left_x, y=k_left_y, z=k_left_z, time=ovh_t,
            vertex_type="dutch_overhang", is_contour=False, is_skeleton=True, fixed_z=k_left_z
        ))
        
        # K_right
        outward_v_right = get_best_outward_target(b_right.id, b_right)
        ray_target_right = outward_v_right if outward_v_right else ridge_top_verts[-1]
        inter_right = line_intersection_2d(
            (b_right.x, b_right.y), (ray_target_right.x, ray_target_right.y), ovh_p1, ovh_p2
        )
        if inter_right is None:
            inter_right = line_intersection_2d(p2, (b_right.x, b_right.y), ovh_p1, ovh_p2)
        if inter_right is None:
            inter_right = (b_right.x + front_ovh * nx_out + rake_ovh * tx, b_right.y + front_ovh * ny_out + rake_ovh * ty)

        k_right_x, k_right_y = inter_right
        if rake_ovh > 0:
            k_right_x += rake_ovh * tx
            k_right_y += rake_ovh * ty

        ref_face_right = right_face if right_face else face
        k_right_z = ref_face_right.plane_a * k_right_x + ref_face_right.plane_b * k_right_y + ref_face_right.plane_c

        k_right_id = len(graph.vertices)
        graph.vertices.append(RoofVertex(
            id=k_right_id, x=k_right_x, y=k_right_y, z=k_right_z, time=ovh_t,
            vertex_type="dutch_overhang", is_contour=False, is_skeleton=True, fixed_z=k_right_z
        ))

        # Apex OVH
        ovh_apex_vids: List[int] = []
        for i, rv in enumerate(ridge_top_verts):
            apex_w = graph.vertices[apex_wall_vids[i]]
            apex_ovh_x = apex_w.x + front_ovh * nx_out
            apex_ovh_y = apex_w.y + front_ovh * ny_out
            apex_ovh_z = apex_w.z

            apex_ovh_id = len(graph.vertices)
            graph.vertices.append(RoofVertex(
                id=apex_ovh_id, x=apex_ovh_x, y=apex_ovh_y, z=apex_ovh_z, time=ovh_t,
                vertex_type="dutch_overhang_ridge", is_contour=False, is_skeleton=True, fixed_z=apex_ovh_z,
            ))
            ovh_apex_vids.append(apex_ovh_id)

        # Build Faces
        first_wall_apex, last_wall_apex = apex_wall_vids[0], apex_wall_vids[-1]
        first_ovh_apex, last_ovh_apex = ovh_apex_vids[0], ovh_apex_vids[-1]

        cap_left_vids = clean_vids([b_left.id, k_left_id, first_ovh_apex, first_wall_apex])
        if len(cap_left_vids) >= 3:
            graph.faces.append(RoofFace(
                id=len(graph.faces), vertices=cap_left_vids, contour_edge_index=-1,
                pitch_angle=ref_face_left.pitch_angle, eave_height=ref_face_left.eave_height,
                plane_a=ref_face_left.plane_a, plane_b=ref_face_left.plane_b, plane_c=ref_face_left.plane_c,
                normal=list(ref_face_left.normal), planarity_error=0.0,
            ))

        cap_right_vids = clean_vids([b_right.id, last_wall_apex, last_ovh_apex, k_right_id])
        if len(cap_right_vids) >= 3:
            graph.faces.append(RoofFace(
                id=len(graph.faces), vertices=cap_right_vids, contour_edge_index=-1,
                pitch_angle=ref_face_right.pitch_angle, eave_height=ref_face_right.eave_height,
                plane_a=ref_face_right.plane_a, plane_b=ref_face_right.plane_b, plane_c=ref_face_right.plane_c,
                normal=list(ref_face_right.normal), planarity_error=0.0,
            ))

        if len(ovh_apex_vids) > 1:
            for k in range(len(ovh_apex_vids) - 1):
                a1, a2 = apex_wall_vids[k], apex_wall_vids[k + 1]
                o1, o2 = ovh_apex_vids[k], ovh_apex_vids[k + 1]
                ridge_cap_vids = clean_vids([a1, a2, o2, o1])
                if len(ridge_cap_vids) >= 3:
                    graph.faces.append(RoofFace(
                        id=len(graph.faces), vertices=ridge_cap_vids, contour_edge_index=-1,
                        pitch_angle=face.pitch_angle, eave_height=face.eave_height,
                        plane_a=0.0, plane_b=0.0, plane_c=graph.vertices[a1].z,
                        normal=[0.0, 0.0, 1.0], planarity_error=0.0,
                    ))

        return k_left_id, k_right_id, ovh_apex_vids

    @classmethod
    def _splice_apex_into_adjacent_faces(
        cls, graph: RoofGraph, face: RoofFace, b_left_id: int, b_right_id: int,
        ridge_start_id: int, ridge_end_id: int, first_wall_apex: int, last_wall_apex: int
    ) -> None:
        for other_f in graph.faces:
            if other_f.id == face.id or getattr(other_f, "is_gable", False):
                continue
            o_vids = other_f.vertices
            n_o = len(o_vids)
            new_o_vids = []
            modified = False

            for j in range(n_o):
                v_curr = o_vids[j]
                v_next = o_vids[(j + 1) % n_o]
                new_o_vids.append(v_curr)

                if (v_curr == b_left_id and v_next == ridge_start_id) or (v_curr == ridge_start_id and v_next == b_left_id):
                    new_o_vids.append(first_wall_apex)
                    modified = True
                elif (v_curr == ridge_end_id and v_next == b_right_id) or (v_curr == b_right_id and v_next == ridge_end_id):
                    new_o_vids.append(last_wall_apex)
                    modified = True

            if modified:
                other_f.vertices = clean_vids(new_o_vids)