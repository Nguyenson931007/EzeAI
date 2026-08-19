"""
Roof Graph Data Structure
Represents a roof as a planar graph of vertices, edges, and faces.
"""
from typing import List, Optional, Dict, Any, Tuple
import math


class RoofVertex:
    def __init__(
        self,
        id: int,
        x: float,
        y: float,
        z: float = 0.0,
        time: float = 0.0,
        vertex_type: str = "generic",
        is_contour: bool = False,
        is_reflex: bool = False,
        is_skeleton: bool = False,
        fixed_z: Optional[float] = None,
        adjacent_edges: Optional[List[int]] = None,
        adjacent_faces: Optional[List[int]] = None,
    ):
        self.id = id
        self.x = x
        self.y = y
        self.z = z
        self.time = time
        self.vertex_type = vertex_type
        self.is_contour = is_contour
        self.is_reflex = is_reflex
        self.is_skeleton = is_skeleton
        self.fixed_z = fixed_z
        self.adjacent_edges = adjacent_edges if adjacent_edges is not None else []
        self.adjacent_faces = adjacent_faces if adjacent_faces is not None else []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "x": self.x,
            "y": self.y,
            "z": self.z,
            "time": self.time,
            "vertex_type": self.vertex_type,
            "is_contour": self.is_contour,
            "is_reflex": self.is_reflex,
            "is_skeleton": self.is_skeleton,
            "fixed_z": self.fixed_z,
            "adjacent_edges": self.adjacent_edges,
            "adjacent_faces": self.adjacent_faces,
        }


class RoofEdge:
    def __init__(
        self,
        id: int,
        source: int,
        target: int,
        edge_type: str = "eave",
        is_bisector: bool = False,
        is_contour: bool = False,
        incident_faces: Optional[List[int]] = None,
    ):
        self.id = id
        self.source = source
        self.target = target
        self.edge_type = edge_type
        self.is_bisector = is_bisector
        self.is_contour = is_contour
        self.incident_faces = incident_faces if incident_faces is not None else []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "source": self.source,
            "target": self.target,
            "edge_type": self.edge_type,
            "is_bisector": self.is_bisector,
            "is_contour": self.is_contour,
            "incident_faces": self.incident_faces,
        }


class RoofFace:
    def __init__(
        self,
        id: int,
        vertices: List[int],
        contour_edge_index: int = -1,
        pitch_angle: float = 30.0,
        eave_height: float = 0.0,
        plane_a: float = 0.0,
        plane_b: float = 0.0,
        plane_c: float = 0.0,
        normal: Optional[List[float]] = None,
        planarity_error: float = 0.0,
        is_gable: bool = False,
    ):
        self.id = id
        self.vertices = vertices
        self.contour_edge_index = contour_edge_index
        self.pitch_angle = pitch_angle
        self.eave_height = eave_height
        self.plane_a = plane_a
        self.plane_b = plane_b
        self.plane_c = plane_c
        self.normal = normal if normal is not None else [0.0, 0.0, 1.0]
        self.planarity_error = planarity_error
        self.is_gable = is_gable or (abs(self.pitch_angle - 90.0) < 1.0)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "vertices": self.vertices,
            "contour_edge_index": self.contour_edge_index,
            "pitch_angle": self.pitch_angle,
            "eave_height": self.eave_height,
            "is_gable": getattr(self, "is_gable", False) or (abs(self.pitch_angle - 90.0) < 1.0),
            "plane": {
                "a": self.plane_a,
                "b": self.plane_b,
                "c": self.plane_c,
                "normal": self.normal,
            },
            "planarity_error": self.planarity_error,
        }


class RoofGraph:
    def __init__(self):
        self.vertices: List[RoofVertex] = []
        self.edges: List[RoofEdge] = []
        self.faces: List[RoofFace] = []
        self.gable_walls: List[Dict[str, Any]] = []

    @classmethod
    def from_cgal_json(
        cls,
        cgal_data: Dict[str, Any],
        angles: Optional[List[float]] = None,
        default_eave_z: float = 2700.0,
    ) -> "RoofGraph":
        graph = cls()

        # 1. Parse vertices / nodes
        nodes = cgal_data.get("nodes", []) or cgal_data.get("vertices", [])
        for n in nodes:
            v_type = "eave" if n.get("is_contour", False) else ("ridge" if n.get("is_skeleton", False) else "generic")
            is_c = n.get("is_contour", False)
            init_z = default_eave_z if is_c else 0.0
            fixed_z = default_eave_z if is_c else None

            v = RoofVertex(
                id=n["id"],
                x=float(n["x"]),
                y=float(n["y"]),
                z=init_z,
                time=float(n.get("time", 0.0)),
                vertex_type=v_type,
                is_contour=is_c,
                is_reflex=n.get("is_reflex", False),
                is_skeleton=n.get("is_skeleton", False),
                fixed_z=fixed_z,
            )
            graph.vertices.append(v)

        # 2. Parse edges
        for e in cgal_data.get("edges", []):
            edge = RoofEdge(
                id=len(graph.edges),
                source=e["source"],
                target=e["target"],
                edge_type=e.get("edge_type", "eave" if e.get("is_contour") else "bisector"),
                is_bisector=e.get("is_bisector", False),
                is_contour=e.get("is_contour", False),
            )
            graph.edges.append(edge)
            if edge.source < len(graph.vertices):
                graph.vertices[edge.source].adjacent_edges.append(edge.id)
            if edge.target < len(graph.vertices):
                graph.vertices[edge.target].adjacent_edges.append(edge.id)

        # 3. Parse faces
        for f in cgal_data.get("faces", []):
            contour_idx = f.get("contour_edge_index", -1)
            pitch = 30.0
            if angles and 0 <= contour_idx < len(angles):
                pitch = angles[contour_idx]

            face = RoofFace(
                id=f["id"],
                vertices=f["vertices"],
                contour_edge_index=contour_idx,
                pitch_angle=pitch,
                eave_height=default_eave_z,
            )
            graph.faces.append(face)

        # Link adjacent faces to vertices
        for f_idx, f in enumerate(graph.faces):
            for vid in f.vertices:
                if vid < len(graph.vertices):
                    graph.vertices[vid].adjacent_faces.append(f_idx)

        # Link incident faces to edges
        for edge in graph.edges:
            for f in graph.faces:
                v_set = set(f.vertices)
                if edge.source in v_set and edge.target in v_set:
                    n_v = len(f.vertices)
                    for i in range(n_v):
                        v1 = f.vertices[i]
                        v2 = f.vertices[(i + 1) % n_v]
                        if (v1 == edge.source and v2 == edge.target) or (v1 == edge.target and v2 == edge.source):
                            edge.incident_faces.append(f.id)
                            break

        return graph

    def rebuild_edges_from_faces(self):
        """
        Reconstructs graph edges and vertex adjacencies from face loops.
        Keeps edge semantic classifications (ridge, hip, valley, eave).
        """
        existing_edge_types = {}
        for e in self.edges:
            pair = tuple(sorted([e.source, e.target]))
            existing_edge_types[pair] = (e.edge_type, e.is_bisector)

        for v in self.vertices:
            v.adjacent_edges = []
            v.adjacent_faces = []

        for f_idx, f in enumerate(self.faces):
            for vid in f.vertices:
                if vid < len(self.vertices) and f_idx not in self.vertices[vid].adjacent_faces:
                    self.vertices[vid].adjacent_faces.append(f_idx)

        edge_map: Dict[Tuple[int, int], List[int]] = {}
        for f in self.faces:
            n_v = len(f.vertices)
            for i in range(n_v):
                v1 = f.vertices[i]
                v2 = f.vertices[(i + 1) % n_v]
                pair = tuple(sorted([v1, v2]))
                if pair not in edge_map:
                    edge_map[pair] = []
                edge_map[pair].append(f.id)

        new_edges: List[RoofEdge] = []
        for e_id, (pair, inc_faces) in enumerate(edge_map.items()):
            src, tgt = pair
            v_src = self.vertices[src]
            v_tgt = self.vertices[tgt]

            is_contour = len(inc_faces) == 1
            is_bisector = len(inc_faces) > 1

            if pair in existing_edge_types:
                edge_type, was_bi = existing_edge_types[pair]
                if is_contour and not was_bi:
                    edge_type = "eave"
            elif is_contour:
                edge_type = "eave"
            else:
                if v_src.is_contour and not v_tgt.is_contour:
                    edge_type = "valley" if v_src.is_reflex else "hip"
                elif not v_src.is_contour and v_tgt.is_contour:
                    edge_type = "valley" if v_tgt.is_reflex else "hip"
                elif not v_src.is_contour and not v_tgt.is_contour:
                    edge_type = "ridge"
                else:
                    edge_type = "valley"

            roof_edge = RoofEdge(
                id=e_id,
                source=src,
                target=tgt,
                edge_type=edge_type,
                is_bisector=is_bisector,
                is_contour=is_contour,
                incident_faces=inc_faces,
            )
            new_edges.append(roof_edge)
            v_src.adjacent_edges.append(e_id)
            v_tgt.adjacent_edges.append(e_id)

        self.edges = new_edges

    def to_dict(self) -> Dict[str, Any]:
        return {
            "vertices": [v.to_dict() for v in self.vertices],
            "edges": [e.to_dict() for e in self.edges],
            "faces": [f.to_dict() for f in self.faces],
            "gable_walls": self.gable_walls,
        }
