"""
Roof Constraint Solver Module (L-BFGS-B Optimization)
Optimizes vertex heights Z under hard/soft geometric constraints.
"""
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
from scipy.optimize import minimize

try:
    from .roof_graph import RoofGraph, RoofVertex, RoofFace
    from .plane_builder import DeterministicPlaneBuilder
except ImportError:
    from roof_graph import RoofGraph, RoofVertex, RoofFace
    from plane_builder import DeterministicPlaneBuilder


class RoofConstraintSolver:
    """
    Solves roof heights Z under hard/soft constraints using L-BFGS-B optimization.
    Provides fine-grained diagnostics per face and reports constraint conflicts.
    """

    @staticmethod
    def solve_conflicts(
        graph: RoofGraph,
        lock_horizontal_ridges: bool = True,
        weight_planarity: float = 100.0,
        weight_pitch: float = 10.0,
        weight_ridge: float = 50.0,
        max_iterations: int = 150
    ) -> Dict[str, Any]:
        """
        Runs constraint optimization on vertex heights Z.
        """
        n_verts = len(graph.vertices)
        if n_verts == 0:
            return {"status": "empty", "diagnostics": {}}

        DeterministicPlaneBuilder.build_all_planes(graph)
        z0 = np.array([v.z for v in graph.vertices], dtype=np.float64)

        # Bounds: fixed_z stays fixed
        bounds = []
        for v in graph.vertices:
            if v.fixed_z is not None:
                bounds.append((v.fixed_z - 1e-4, v.fixed_z + 1e-4))
            else:
                bounds.append((0.0, 50000.0))

        def objective(z_vec: np.ndarray) -> float:
            total_loss = 0.0

            # 1. Planarity loss per face
            for face in graph.faces:
                if getattr(face, "is_gable", False):
                    continue
                v_ids = face.vertices
                if len(v_ids) < 3:
                    continue
                for vid in v_ids:
                    if vid < n_verts:
                        v = graph.vertices[vid]
                        z_plane = face.plane_a * v.x + face.plane_b * v.y + face.plane_c
                        diff = z_vec[vid] - z_plane
                        total_loss += weight_planarity * (diff ** 2)

            # 2. Horizontal ridge constraint
            if lock_horizontal_ridges:
                for edge in graph.edges:
                    if edge.edge_type == "ridge":
                        u, v = edge.source, edge.target
                        if u < n_verts and v < n_verts:
                            diff_ridge = z_vec[u] - z_vec[v]
                            total_loss += weight_ridge * (diff_ridge ** 2)

            return total_loss

        res = minimize(
            objective,
            z0,
            method="L-BFGS-B",
            bounds=bounds,
            options={"maxiter": max_iterations, "ftol": 1e-7}
        )

        for i in range(n_verts):
            graph.vertices[i].z = float(res.x[i])

        # Compute diagnostics
        facet_diagnostics = {}
        max_planarity_err = 0.0
        for face in graph.faces:
            residuals = []
            for vid in face.vertices:
                if vid < n_verts:
                    v = graph.vertices[vid]
                    z_expected = face.plane_a * v.x + face.plane_b * v.y + face.plane_c
                    residuals.append(abs(graph.vertices[vid].z - z_expected))
            f_err = max(residuals) if residuals else 0.0
            face.planarity_error = f_err
            if f_err > max_planarity_err:
                max_planarity_err = f_err
            facet_diagnostics[str(face.id)] = {
                "max_residual_mm": round(f_err, 4),
                "pitch_deg": face.pitch_angle,
                "is_planar": f_err < 0.1
            }

        max_ridge_err = 0.0
        for edge in graph.edges:
            if edge.edge_type == "ridge":
                u, v = edge.source, edge.target
                if u < n_verts and v < n_verts:
                    diff = abs(graph.vertices[u].z - graph.vertices[v].z)
                    if diff > max_ridge_err:
                        max_ridge_err = diff

        return {
            "status": "optimal" if res.success else "suboptimal",
            "iterations": int(res.nit),
            "max_planarity_error_mm": round(max_planarity_err, 4),
            "max_ridge_error_mm": round(max_ridge_err, 4),
            "facet_diagnostics": facet_diagnostics,
        }
