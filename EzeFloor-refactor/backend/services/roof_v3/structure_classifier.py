"""
Structure Classifier Module for Roof V3 Engine.
Classifies and extracts 3D structural lines (ridge, hip, valley, eave, flashing_wall, gable)
from the RoofGraph for structural framing, truss engine (TrussEngine), and CAD rendering.
"""
from typing import List, Dict, Any, Optional
import math

try:
    from .roof_graph import RoofGraph, RoofVertex, RoofEdge, RoofFace
except ImportError:
    from roof_graph import RoofGraph, RoofVertex, RoofEdge, RoofFace


class StructureClassifier:
    """
    Analyzes roof graph edges and geometric properties to produce classified 3D structure lines.
    """

    @classmethod
    def get_vertex_z(cls, v: RoofVertex, graph: RoofGraph, preferred_face_id: Optional[int] = None) -> float:
        """Computes true 3D Z coordinate from roof plane equations if v.z is uninitialized (0.0)."""
        if v.fixed_z is not None:
            return float(v.fixed_z)
        if abs(v.z) > 1e-3:
            return float(v.z)

        # Try preferred face first
        if preferred_face_id is not None and preferred_face_id < len(graph.faces):
            f = graph.faces[preferred_face_id]
            if not getattr(f, "is_gable", False) and abs(f.pitch_angle - 90.0) >= 1.0:
                return float(f.plane_a * v.x + f.plane_b * v.y + f.plane_c)

        # Check adjacent faces
        for f_id in v.adjacent_faces:
            if f_id < len(graph.faces):
                f = graph.faces[f_id]
                if not getattr(f, "is_gable", False) and abs(f.pitch_angle - 90.0) >= 1.0:
                    return float(f.plane_a * v.x + f.plane_b * v.y + f.plane_c)

        # Fallback check any face containing v.id
        for f in graph.faces:
            if v.id in f.vertices and not getattr(f, "is_gable", False) and abs(f.pitch_angle - 90.0) >= 1.0:
                return float(f.plane_a * v.x + f.plane_b * v.y + f.plane_c)

        return float(v.z)

    @classmethod
    def classify_structure_lines(cls, graph: RoofGraph) -> List[Dict[str, Any]]:
        """
        Classifies all structural edges in the roof graph into distinct semantic types:
        - 'eave': Horizontal boundary edge at eave height
        - 'ridge': Horizontal or top intersection between upward roof slopes
        - 'hip': Inclined ridge line sloping down to an exterior/convex corner
        - 'valley': Inclined valley line sloping down to an interior/reflex corner
        - 'gable': Rake/verge edge along a vertical gable end
        - 'flashing_wall': Step-down flashing edge between different roof elevations

        Returns a list of structured dictionaries compatible with both TrussEngine.js
        (expecting .p1, .p2, .a, .b, .type) and 2D/3D CAD viewers.
        """
        structure_lines = []
        n_verts = len(graph.vertices)

        # 1. Process all explicit graph edges
        for edge in graph.edges:
            if edge.source >= n_verts or edge.target >= n_verts:
                continue

            v1 = graph.vertices[edge.source]
            v2 = graph.vertices[edge.target]

            # Calculate true 3D coordinates
            first_face = edge.incident_faces[0] if edge.incident_faces else None
            z1 = cls.get_vertex_z(v1, graph, first_face)
            z2 = cls.get_vertex_z(v2, graph, first_face)

            # Skip degenerate zero-length edges
            dx = v2.x - v1.x
            dy = v2.y - v1.y
            dz = z2 - z1
            dist_2d = math.hypot(dx, dy)
            dist_3d = math.sqrt(dx * dx + dy * dy + dz * dz)
            if dist_3d < 1e-2:
                continue

            # Determine semantic edge type
            edge_type = cls._determine_edge_type(edge, v1, v2, z1, z2, graph)

            # Build line payload with both {p1, p2} and {a, b} for complete backward compatibility
            p1_dict = {"x": float(v1.x), "y": float(v1.y), "z": float(z1)}
            p2_dict = {"x": float(v2.x), "y": float(v2.y), "z": float(z2)}

            line_entry = {
                "id": edge.id,
                "type": edge_type,
                "edge_type": edge_type,
                "p1": p1_dict,
                "p2": p2_dict,
                "a": p1_dict,  # For TrussEngine.js computeValleyTrusses backwards-compatibility
                "b": p2_dict,
                "is_contour": bool(edge.is_contour),
                "is_bisector": bool(edge.is_bisector),
                "incident_faces": getattr(edge, "incident_faces", []),
                "length": dist_3d,
                "length_2d": dist_2d,
            }
            structure_lines.append(line_entry)

        return structure_lines

    @classmethod
    def _determine_edge_type(
        cls,
        edge: RoofEdge,
        v1: RoofVertex,
        v2: RoofVertex,
        z1: float,
        z2: float,
        graph: RoofGraph
    ) -> str:
        # 1. If edge has explicit recognized type from trimmer or builder:
        if edge.edge_type in ["valley", "ridge", "hip", "eave", "gable", "flashing_wall"]:
            if edge.is_contour and edge.edge_type not in ["eave", "gable"]:
                return "eave"
            return edge.edge_type

        # 2. If it's a boundary contour edge:
        if edge.is_contour:
            return "eave"

        # 3. If any incident face is a gable face (pitch ~ 90 deg):
        if hasattr(edge, "incident_faces") and edge.incident_faces:
            for f_id in edge.incident_faces:
                if f_id < len(graph.faces):
                    f = graph.faces[f_id]
                    if getattr(f, "is_gable", False) or abs(f.pitch_angle - 90.0) < 1.0:
                        return "gable"

        # 4. Check vertex classifications:
        # If one vertex is reflex contour, water drains towards it -> valley
        if (v1.is_contour and v1.is_reflex) or (v2.is_contour and v2.is_reflex):
            return "valley"

        # If one vertex is non-reflex contour and the other is interior skeleton:
        if (v1.is_contour and not v2.is_contour) or (not v1.is_contour and v2.is_contour):
            return "hip"

        # 5. Check 3D face normals / gradients if edge has 2 incident faces:
        if hasattr(edge, "incident_faces") and len(edge.incident_faces) >= 2:
            f1_id, f2_id = edge.incident_faces[0], edge.incident_faces[1]
            if f1_id < len(graph.faces) and f2_id < len(graph.faces):
                f1 = graph.faces[f1_id]
                f2 = graph.faces[f2_id]

                dx = v2.x - v1.x
                dy = v2.y - v1.y
                length_2d = math.hypot(dx, dy)
                if length_2d > 1e-4:
                    # Left normal: (-dy, dx)
                    wx = -dy / length_2d
                    wy = dx / length_2d

                    # Check orientation of edge in f1.vertices
                    f1_verts = f1.vertices
                    is_f1_forward = False
                    n_v = len(f1_verts)
                    for i in range(n_v):
                        if f1_verts[i] == edge.source and f1_verts[(i + 1) % n_v] == edge.target:
                            is_f1_forward = True
                            break

                    if not is_f1_forward:
                        wx, wy = -wx, -wy

                    # Rate of change of (z1 - z2) into f1:
                    d_diff = (f1.plane_a - f2.plane_a) * wx + (f1.plane_b - f2.plane_b) * wy
                    if d_diff > 1e-4:
                        return "valley"
                    elif d_diff < -1e-4:
                        if abs(z1 - z2) < 20.0 or (not v1.is_contour and not v2.is_contour):
                            return "ridge"
                        else:
                            return "hip"

        # 6. Fallback based on height difference and contour status:
        if not v1.is_contour and not v2.is_contour:
            return "ridge"
        elif v1.is_contour or v2.is_contour:
            return "hip"

        return "ridge"
