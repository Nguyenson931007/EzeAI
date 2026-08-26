"""
Pydantic Data Models and Validation Schemas for Roof V3 Engine.
"""
import math
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, field_validator, model_validator


class ComputeRoofRequestV3(BaseModel):
    points: List[List[float]]                        # [[x,y], [x,y], ...]
    angles: Optional[List[float]] = None             # roof pitch angles in degrees per edge
    weights: Optional[List[float]] = None            # raw weights per edge (fallback)
    overhangs: Optional[List[float]] = None          # eaves overhang per edge (mm)
    holes: Optional[List[List[List[float]]]] = None  # inner courtyards [[[x,y], ...], ...]
    hole_angles: Optional[List[List[float]]] = None  # pitch angles per edge for each hole
    hole_weights: Optional[List[List[float]]] = None # weights per edge for each hole
    mode: str = "topology"                           # "topology" or "extrusion"
    roof_type: str = "hip_gable"                     # "hip_gable" or "shed"
    eave_edge_index: Optional[int] = 0               # low eave edge for shed roof
    wall_height: Optional[float] = 2700.0            # wall height in mm

    # Dutch Gable extensions
    dutch_edges: Optional[List[int]] = None          # absolute edge indices for dutch gable
    dutch_overhangs: Optional[List[float]] = None    # front overhangs for dutch gablet in mm
    dutch_rake_overhangs: Optional[List[float]] = None # rake overhangs for dutch gablet in mm
    dutch_cut_points: Optional[List[Optional[List[float]]]] = None # sparse array of cut points [x, y] per edge

    @model_validator(mode="before")
    @classmethod
    def map_camel_case_dutch(cls, data: Any):
        if isinstance(data, dict):
            if "dutchEdges" in data and "dutch_edges" not in data:
                data["dutch_edges"] = data["dutchEdges"]
            if "dutchOverhangs" in data and "dutch_overhangs" not in data:
                data["dutch_overhangs"] = data["dutchOverhangs"]
            if "dutchRakeOverhangs" in data and "dutch_rake_overhangs" not in data:
                data["dutch_rake_overhangs"] = data["dutchRakeOverhangs"]
            if "dutchCutPoints" in data and "dutch_cut_points" not in data:
                data["dutch_cut_points"] = data["dutchCutPoints"]
        return data

    @field_validator("points")
    @classmethod
    def validate_points(cls, v):
        if len(v) < 3:
            raise ValueError("Polygon must have at least 3 points")
        for pt in v:
            if len(pt) != 2:
                raise ValueError(f"Each point must be [x, y], got {pt}")
        return v

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v):
        if v not in ("topology", "extrusion"):
            raise ValueError(f"mode must be 'topology' or 'extrusion', got '{v}'")
        return v


class BuildPlanesRequestV3(BaseModel):
    topology: Dict[str, Any]
    points: Optional[List[List[float]]] = None
    angles: Optional[List[float]] = None
    overhangs: Optional[List[float]] = None
    hole_angles: Optional[List[List[float]]] = None
    default_eave_z: float = 0.0
    wall_height: Optional[float] = 2700.0
    base_z: float = 0.0
    roof_type: str = "hip_gable"
    eave_edge_index: Optional[int] = 0

    # Dutch Gable extensions
    dutch_edges: Optional[List[int]] = None          # absolute edge indices for dutch gable
    dutch_overhangs: Optional[List[float]] = None    # front overhangs for dutch gablet in mm
    dutch_rake_overhangs: Optional[List[float]] = None # rake overhangs for dutch gablet in mm
    dutch_cut_points: Optional[List[Optional[List[float]]]] = None # sparse array of cut points [x, y] per edge

    @model_validator(mode="before")
    @classmethod
    def map_camel_case_dutch(cls, data: Any):
        if isinstance(data, dict):
            if "dutchEdges" in data and "dutch_edges" not in data:
                data["dutch_edges"] = data["dutchEdges"]
            if "dutchOverhangs" in data and "dutch_overhangs" not in data:
                data["dutch_overhangs"] = data["dutchOverhangs"]
            if "dutchRakeOverhangs" in data and "dutch_rake_overhangs" not in data:
                data["dutch_rake_overhangs"] = data["dutchRakeOverhangs"]
            if "dutchCutPoints" in data and "dutch_cut_points" not in data:
                data["dutch_cut_points"] = data["dutchCutPoints"]
        return data


class TrimEaveRequestV3(BaseModel):
    graph: Dict[str, Any]
    wall_p1: List[float]
    wall_p2: List[float]
    face_id: Optional[int] = None
    points: Optional[List[List[float]]] = None
    angles: Optional[List[float]] = None
    wall_height: Optional[float] = 2700.0
    base_z: float = 0.0
    roof_type: str = "hip_gable"
    eave_edge_index: Optional[int] = 0


class OptimizeGraphRequestV3(BaseModel):
    graph: Dict[str, Any]
    lock_horizontal_ridges: bool = True
    points: Optional[List[List[float]]] = None
    angles: Optional[List[float]] = None
    wall_height: Optional[float] = 2700.0
    base_z: float = 0.0


class ComputeRoofResponse(BaseModel):
    mode: str
    result: dict  # nodes, edges, faces for topology; mesh data for extrusion
