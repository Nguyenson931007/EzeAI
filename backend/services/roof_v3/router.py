"""
FastAPI Router for Roof V3 Engine.
Handles Topology generation, Exact Algebraic Planes, Gable Extension, Shed Roofs, and CAD Trim.
"""
import os
import json
import math
import subprocess
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException

from .models import (
    ComputeRoofRequestV3,
    BuildPlanesRequestV3,
    TrimEaveRequestV3,
    OptimizeGraphRequestV3,
    ComputeRoofResponse,
)
from .roof_graph import RoofGraph, RoofVertex, RoofEdge, RoofFace
from .plane_builder import DeterministicPlaneBuilder
from .shed_builder import ShedBuilder
from .gable_builder import GableBuilder
from .wall_builder import WallBuilder
from .clipper import RoofClipper
from .solver import RoofConstraintSolver

router = APIRouter(prefix="/api/v3", tags=["Roof V3 Engine"])

# Resolve path to ezefloor_roof_v3.exe
# Looks in current directory, parent directory, and bin/ directory
POSSIBLE_EXE_PATHS = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "roof_kernel", "ezefloor_roof_v3.exe"),
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "ezefloor_roof_v3.exe"),
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "roof_kernel", "ezefloor_roof_v3.exe"),
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "ezefloor_roof_v3.exe"),
    os.path.join(os.path.dirname(__file__), "ezefloor_roof_v3.exe"),
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "bin", "ezefloor_roof_v3.exe"),
]

EXE_PATH_V3 = next((p for p in POSSIBLE_EXE_PATHS if os.path.exists(p)), POSSIBLE_EXE_PATHS[0])
SUBPROCESS_TIMEOUT = 10  # seconds


# ─── Helpers ───
def angles_to_weights(angles: List[float], mode: str = "extrusion") -> List[float]:
    weights = []
    for angle in angles:
        if angle <= 0 or angle >= 180:
            raise ValueError(f"Angle must be in (0, 180), got {angle}")
        if angle == 90:
            weights.append(1e9 if mode == "topology" else 0.0)
        else:
            weights.append(math.tan(math.radians(angle)))
    return weights


def ensure_ccw_all(
    points: List[List[float]],
    weights: Optional[List[float]] = None,
    angles: Optional[List[float]] = None,
    overhangs: Optional[List[float]] = None
) -> tuple:
    n = len(points)
    signed_area = 0.0
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        signed_area += (x1 * y2 - x2 * y1)

    is_reversed = False
    if signed_area < 0:
        points = points[::-1]
        if weights is not None and len(weights) == n:
            weights = weights[::-1]
            weights = weights[1:] + weights[:1]
        if angles is not None and len(angles) == n:
            angles = angles[::-1]
            angles = angles[1:] + angles[:1]
        if overhangs is not None and len(overhangs) == n:
            overhangs = overhangs[::-1]
            overhangs = overhangs[1:] + overhangs[:1]
        is_reversed = True

    return points, weights, angles, overhangs, is_reversed


def ensure_ccw(points: List[List[float]], weights: List[float]) -> tuple:
    pts, w, _, _, is_rev = ensure_ccw_all(points, weights)
    return pts, w, is_rev


def call_ezefloor_v3(input_data: dict, mode: str = "topology") -> str:
    if not os.path.exists(EXE_PATH_V3):
        raise HTTPException(
            status_code=500,
            detail=f"Engine V3 executable not found at {EXE_PATH_V3}. Please ensure ezefloor_roof_v3.exe is built."
        )

    args = [EXE_PATH_V3, "--mode", mode]
    input_str = json.dumps(input_data)

    try:
        process = subprocess.run(
            args,
            input=input_str,
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=408,
            detail=f"Computation timed out after {SUBPROCESS_TIMEOUT}s."
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to execute engine V3: {str(e)}"
        )

    if process.returncode != 0:
        stderr_msg = process.stderr.strip() if process.stderr else "Unknown error"
        raise HTTPException(
            status_code=422,
            detail=f"Engine V3 computation failed (exit code {process.returncode}): {stderr_msg}"
        )

    return process.stdout


# ─── Endpoints ───
@router.get("/health")
async def health_v3():
    return {
        "status": "ok",
        "version": "v3",
        "engine_v3_exists": os.path.exists(EXE_PATH_V3),
        "engine_path": EXE_PATH_V3,
    }


@router.post("/compute-roof", response_model=ComputeRoofResponse)
async def compute_roof_v3(req: ComputeRoofRequestV3):
    wall_h = req.wall_height if req.wall_height is not None else 2700.0

    # 1. Resolve weights
    if req.angles is not None:
        if len(req.angles) != len(req.points):
            raise HTTPException(
                status_code=422,
                detail=f"Number of angles ({len(req.angles)}) must equal number of edges ({len(req.points)})"
            )
        try:
            weights = angles_to_weights(req.angles, req.mode)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
    elif req.weights is not None:
        if len(req.weights) != len(req.points):
            raise HTTPException(
                status_code=422,
                detail=f"Number of weights ({len(req.weights)}) must equal number of edges ({len(req.points)})"
            )
        weights = req.weights
    else:
        weights = [1.0] * len(req.points)

    # 2. Ensure outer boundary is CCW with synchronized angles and overhangs
    ovhs = req.overhangs.copy() if req.overhangs else [0.0] * len(req.points)
    angles_list = req.angles.copy() if req.angles else [22.5] * len(req.points)
    points, weights, angles_list, ovhs, is_reversed = ensure_ccw_all(req.points, weights, angles_list, ovhs)

    # 3. Handle Shed Roof (Mono-pitch) directly
    if req.roof_type == "shed":
        pitch = angles_list[0] if angles_list else 22.5
        eave_idx = req.eave_edge_index or 0
        if is_reversed:
            eave_idx = (len(req.points) - 2 - eave_idx) % len(req.points)
        shed_topo = ShedBuilder.compute_shed_topology(
            points,
            pitch_angle=pitch,
            overhangs=ovhs,
            eave_edge_index=eave_idx,
            wall_height=wall_h,
        )
        return ComputeRoofResponse(mode="topology", result=shed_topo)

    # 4. Prepare input for C++ CGAL Engine V3
    engine_input = {
        "points": points,
        "weights": weights,
    }

    if req.overhangs is not None:
        final_ovh = ovhs.copy()
        # For gable edges (90 deg), pass 0.0 overhang to CGAL to prevent collapse
        for idx, ang in enumerate(angles_list):
            if abs(ang - 90.0) < 1.0 and idx < len(final_ovh):
                final_ovh[idx] = 0.0
        engine_input["overhangs"] = final_ovh

    # Handle inner courtyards / holes
    if req.holes:
        holes_processed = []
        holes_weights = []
        for h_idx, hole in enumerate(req.holes):
            if len(hole) < 3:
                continue
            h_angles = req.hole_angles[h_idx] if req.hole_angles and h_idx < len(req.hole_angles) else None
            h_w = req.hole_weights[h_idx] if req.hole_weights and h_idx < len(req.hole_weights) else None
            if h_angles:
                h_w = angles_to_weights(h_angles, req.mode)
            elif not h_w:
                h_w = [1.0] * len(hole)

            h_pts, h_w, _ = ensure_ccw(hole, h_w)
            h_pts = h_pts[::-1]  # Holes must be CW
            h_w = h_w[::-1]
            h_w = h_w[1:] + h_w[:1]

            holes_processed.append(h_pts)
            holes_weights.append(h_w)

        if holes_processed:
            engine_input["holes"] = holes_processed
            engine_input["hole_weights"] = holes_weights

    # Execute CGAL engine
    stdout = call_ezefloor_v3(engine_input, "topology")
    try:
        result = json.loads(stdout)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail=f"Engine returned invalid JSON: {stdout[:500]}"
        )

    return ComputeRoofResponse(mode="topology", result=result)


@router.post("/build-planes")
async def build_planes_v3(req: BuildPlanesRequestV3):
    wall_h = req.wall_height if req.wall_height is not None else 2700.0

    # 1. Handle Shed Roof (Mono-pitch) directly
    if req.roof_type == "shed" and req.points:
        pitch = req.angles[0] if req.angles else 22.5
        ovhs = req.overhangs.copy() if req.overhangs else [0.0] * len(req.points)
        angles_list = req.angles.copy() if req.angles else [22.5] * len(req.points)
        ccw_points, _, ccw_angles, ccw_ovhs, is_rev = ensure_ccw_all(req.points, None, angles_list, ovhs)
        eave_idx = req.eave_edge_index or 0
        if is_rev:
            eave_idx = (len(req.points) - 2 - eave_idx) % len(req.points)

        shed_3d = ShedBuilder.generate_shed_3d_mesh(
            ccw_points,
            pitch_angle=pitch,
            overhangs=ccw_ovhs,
            eave_edge_index=eave_idx,
            wall_height=wall_h,
            base_z=req.base_z,
        )
        return shed_3d

    # 2. Multi-pitch / Hip & Gable Roof
    ovhs = req.overhangs.copy() if req.overhangs else [0.0] * len(req.points)
    angles_list = req.angles.copy() if req.angles else [22.5] * len(req.points)
    ccw_points, _, ccw_angles, ccw_ovhs, is_rev = ensure_ccw_all(req.points, None, angles_list, ovhs)

    all_angles = ccw_angles.copy() if ccw_angles else []
    if req.hole_angles:
        for ha in req.hole_angles:
            all_angles.extend(ha)

    graph = RoofGraph.from_cgal_json(req.topology, all_angles if all_angles else None, default_eave_z=wall_h)

    # 2a. Correct eave_height for hip faces with CGAL overhang offset
    if ccw_ovhs and ccw_angles:
        for face in graph.faces:
            ci = face.contour_edge_index
            if 0 <= ci < len(ccw_angles) and ci < len(ccw_ovhs):
                angle_deg = ccw_angles[ci]
                ovh_val = ccw_ovhs[ci]
                if abs(angle_deg - 90.0) > 1.0 and ovh_val > 0:
                    drop = ovh_val * math.tan(math.radians(angle_deg))
                    face.eave_height = wall_h - drop

    # 2b. Compute exact plane equations
    DeterministicPlaneBuilder.build_all_planes(graph, default_eave_z=wall_h, force_recompute=True)

    # 2c. Recalculate fixed_z for contour vertices of offset hip faces
    if ccw_ovhs:
        for face in graph.faces:
            if abs(face.eave_height - wall_h) > 0.1:
                for vid in face.vertices:
                    if vid < len(graph.vertices):
                        v = graph.vertices[vid]
                        if v.is_contour:
                            z_plane = face.plane_a * v.x + face.plane_b * v.y + face.plane_c
                            v.fixed_z = z_plane
                            v.z = z_plane

    # 2d. Apply Gable Verge Extension & Gable Walls if gable edges exist
    if ccw_points and ccw_angles:
        gable_walls = GableBuilder.extend_gable_verge(graph, ccw_points, ccw_angles, ccw_ovhs, wall_z=wall_h)
        graph.gable_walls = gable_walls

    # 2e. Generate pure Roof 3D Mesh
    mesh_data = DeterministicPlaneBuilder.generate_3d_mesh(graph)

    # 2f. Generate separate 3D Wall Shell & Gable Walls
    wall_mesh_data = {"vertices": [], "faces": [], "gable_mesh": {"vertices": [], "faces": []}, "wall_height": wall_h, "base_z": req.base_z}
    if req.points:
        ovhs = req.overhangs.copy() if req.overhangs else [0.0] * len(req.points)
        angles_list = req.angles.copy() if req.angles else [22.5] * len(req.points)
        ccw_points, _, ccw_angles, _, _ = ensure_ccw_all(req.points, None, angles_list, ovhs)
        wall_mesh_data = WallBuilder.generate_wall_mesh(
            ccw_points,
            ccw_angles,
            wall_height=wall_h,
            base_z=req.base_z,
            gable_walls=getattr(graph, "gable_walls", []),
        )

    # Combined mesh
    combined_verts = [list(v) for v in mesh_data["vertices"]]
    combined_faces = [list(f) for f in mesh_data["faces"]]

    wall_v_offset = len(combined_verts)
    for v in wall_mesh_data["vertices"]:
        combined_verts.append(list(v))
    for f in wall_mesh_data["faces"]:
        combined_faces.append([f[0] + wall_v_offset, f[1] + wall_v_offset, f[2] + wall_v_offset])

    return {
        "status": "success",
        "mesh": {
            "vertices": combined_verts,
            "faces": combined_faces,
        },
        "roof_mesh": {
            "vertices": mesh_data["vertices"],
            "faces": mesh_data["faces"],
            "face_groups": mesh_data.get("face_groups", []),
        },
        "wall_mesh": wall_mesh_data,
        "gable_mesh": wall_mesh_data.get("gable_mesh", {"vertices": [], "faces": []}),
        "wall_height": wall_h,
        "graph": graph.to_dict(),
        "max_planarity_error_mm": mesh_data["max_planarity_error"],
        "optimization_status": mesh_data["status"],
    }


@router.post("/trim-eave")
async def trim_eave_v3(req: TrimEaveRequestV3):
    """Trims face polygons against wall boundary line (CAD Trim Tool) while preserving 3D walls."""
    wall_h = req.wall_height if req.wall_height is not None else 2700.0

    # Reconstruct graph from dict
    g_data = req.graph
    graph = RoofGraph()
    v_list = g_data.get("vertices") or g_data.get("nodes") or []
    for v in v_list:
        graph.vertices.append(RoofVertex(
            id=v["id"],
            x=float(v["x"]),
            y=float(v["y"]),
            z=float(v.get("z", wall_h)),
            time=float(v.get("time", 0.0)),
            vertex_type=v.get("vertex_type", "generic"),
            is_contour=v.get("is_contour", False),
            is_reflex=v.get("is_reflex", False),
            is_skeleton=v.get("is_skeleton", False),
            fixed_z=v.get("fixed_z"),
            adjacent_edges=v.get("adjacent_edges", []),
            adjacent_faces=v.get("adjacent_faces", []),
        ))

    for e in g_data.get("edges", []):
        graph.edges.append(RoofEdge(
            id=e["id"],
            source=e["source"],
            target=e["target"],
            edge_type=e.get("edge_type", "eave"),
            is_bisector=e.get("is_bisector", False),
            is_contour=e.get("is_contour", False),
            incident_faces=e.get("incident_faces", []),
        ))

    for f in g_data.get("faces", []):
        plane_dict = f.get("plane", {})
        graph.faces.append(RoofFace(
            id=f["id"],
            vertices=f["vertices"],
            contour_edge_index=f.get("contour_edge_index", -1),
            pitch_angle=f.get("pitch_angle", 30.0),
            eave_height=f.get("eave_height", wall_h),
            plane_a=plane_dict.get("a", f.get("plane_a", 0.0)),
            plane_b=plane_dict.get("b", f.get("plane_b", 0.0)),
            plane_c=plane_dict.get("c", f.get("plane_c", wall_h)),
            normal=plane_dict.get("normal", f.get("normal", [0.0, 0.0, 1.0])),
        ))

    # Apply trim
    p1 = (req.wall_p1[0], req.wall_p1[1])
    p2 = (req.wall_p2[0], req.wall_p2[1])

    # Calculate building interior reference point to ensure we always keep the inner roof and cut the overhang
    interior_pt = None
    if req.points and len(req.points) >= 3:
        cx = sum(p[0] for p in req.points) / len(req.points)
        cy = sum(p[1] for p in req.points) / len(req.points)
        interior_pt = (cx, cy)

    if req.face_id is not None:
        RoofClipper.trim_face_by_wall(graph, req.face_id, p1, p2, interior_point=interior_pt)
    else:
        for f_idx in range(len(graph.faces)):
            RoofClipper.trim_face_by_wall(graph, f_idx, p1, p2, interior_point=interior_pt)

    graph.rebuild_edges_from_faces()
    mesh_data = DeterministicPlaneBuilder.generate_3d_mesh(graph)

    # Re-generate 3D wall mesh
    wall_mesh_data = {"vertices": [], "faces": [], "wall_height": wall_h, "base_z": req.base_z}
    if req.points:
        if req.roof_type == "shed":
            if graph.faces and (graph.faces[0].plane_a != 0 or graph.faces[0].plane_b != 0):
                a_w, b_w, c_w = graph.faces[0].plane_a, graph.faces[0].plane_b, graph.faces[0].plane_c
            else:
                e_idx = max(0, min(len(req.points) - 1, req.eave_edge_index or 0))
                p1_e = (req.points[e_idx][0], req.points[e_idx][1])
                p2_e = (req.points[(e_idx + 1) % len(req.points)][0], req.points[(e_idx + 1) % len(req.points)][1])
                pitch_w = req.angles[0] if req.angles else 22.5
                a_w, b_w, c_w, _ = ShedBuilder.compute_shed_plane(p1_e, p2_e, pitch_w, wall_h)

            wall_mesh_data = WallBuilder.generate_sloping_wall_mesh(
                req.points,
                plane_a=a_w,
                plane_b=b_w,
                plane_c=c_w,
                wall_height=wall_h,
                base_z=req.base_z,
            )
        else:
            wall_mesh_data = WallBuilder.generate_wall_mesh(
                req.points,
                req.angles,
                wall_height=wall_h,
                base_z=req.base_z,
                gable_walls=getattr(graph, "gable_walls", []),
            )

    combined_verts = [list(v) for v in mesh_data["vertices"]]
    combined_faces = [list(f) for f in mesh_data["faces"]]

    wall_v_offset = len(combined_verts)
    for v in wall_mesh_data["vertices"]:
        combined_verts.append(list(v))
    for f in wall_mesh_data["faces"]:
        combined_faces.append([f[0] + wall_v_offset, f[1] + wall_v_offset, f[2] + wall_v_offset])

    return {
        "status": "success",
        "mesh": {
            "vertices": combined_verts,
            "faces": combined_faces,
        },
        "roof_mesh": {
            "vertices": mesh_data["vertices"],
            "faces": mesh_data["faces"],
        },
        "wall_mesh": wall_mesh_data,
        "gable_mesh": wall_mesh_data.get("gable_mesh", {"vertices": [], "faces": []}),
        "wall_height": wall_h,
        "graph": graph.to_dict(),
        "max_planarity_error_mm": mesh_data["max_planarity_error"],
        "optimization_status": mesh_data["status"],
    }


@router.post("/optimize-graph")
async def optimize_graph_v3(req: OptimizeGraphRequestV3):
    """Optimizes vertex heights Z using L-BFGS-B under hard/soft geometric constraints."""
    wall_h = req.wall_height if req.wall_height is not None else 2700.0

    g_data = req.graph
    graph = RoofGraph()
    v_list = g_data.get("vertices") or g_data.get("nodes") or []
    for v in v_list:
        graph.vertices.append(RoofVertex(
            id=v["id"],
            x=float(v["x"]),
            y=float(v["y"]),
            z=float(v.get("z", wall_h)),
            time=float(v.get("time", 0.0)),
            vertex_type=v.get("vertex_type", "generic"),
            is_contour=v.get("is_contour", False),
            is_reflex=v.get("is_reflex", False),
            is_skeleton=v.get("is_skeleton", False),
            fixed_z=v.get("fixed_z"),
            adjacent_edges=v.get("adjacent_edges", []),
            adjacent_faces=v.get("adjacent_faces", []),
        ))

    for e in g_data.get("edges", []):
        graph.edges.append(RoofEdge(
            id=e["id"],
            source=e["source"],
            target=e["target"],
            edge_type=e.get("edge_type", "eave"),
            is_bisector=e.get("is_bisector", False),
            is_contour=e.get("is_contour", False),
            incident_faces=e.get("incident_faces", []),
        ))

    for f in g_data.get("faces", []):
        plane_dict = f.get("plane", {})
        graph.faces.append(RoofFace(
            id=f["id"],
            vertices=f["vertices"],
            contour_edge_index=f.get("contour_edge_index", -1),
            pitch_angle=f.get("pitch_angle", 30.0),
            eave_height=f.get("eave_height", wall_h),
            plane_a=plane_dict.get("a", f.get("plane_a", 0.0)),
            plane_b=plane_dict.get("b", f.get("plane_b", 0.0)),
            plane_c=plane_dict.get("c", f.get("plane_c", wall_h)),
            normal=plane_dict.get("normal", f.get("normal", [0.0, 0.0, 1.0])),
        ))

    solver_res = RoofConstraintSolver.solve_conflicts(
        graph,
        lock_horizontal_ridges=req.lock_horizontal_ridges,
    )

    mesh_data = DeterministicPlaneBuilder.generate_3d_mesh(graph)

    return {
        "status": "success",
        "solver": solver_res,
        "mesh": mesh_data,
        "graph": graph.to_dict(),
        "max_planarity_error_mm": solver_res["max_planarity_error_mm"],
    }
