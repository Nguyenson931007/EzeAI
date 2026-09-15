"""
Roof V3 Engine Package
A self-contained, deterministic CAD-grade 3D roof generation package.
Supports:
- C++ CGAL Straight Skeleton & Polygon Offset
- Exact Algebraic Deterministic Planes
- Gable 90° Verge Extension & Triangular Gable Walls
- Mono-Pitch Shed Roofs with 4-sided Overhangs & Sloping Trapezoidal Walls
- Sutherland-Hodgman CAD Trim
- L-BFGS-B Geometric Constraint Optimization
"""

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
from .dutch_builder import DutchBuilder
from .wall_builder import WallBuilder
from .clipper import RoofClipper
from .solver import RoofConstraintSolver
from .structure_classifier import StructureClassifier
from .router import router

__all__ = [
    "ComputeRoofRequestV3",
    "BuildPlanesRequestV3",
    "TrimEaveRequestV3",
    "OptimizeGraphRequestV3",
    "ComputeRoofResponse",
    "RoofGraph",
    "RoofVertex",
    "RoofEdge",
    "RoofFace",
    "DeterministicPlaneBuilder",
    "ShedBuilder",
    "GableBuilder",
    "DutchBuilder",
    "WallBuilder",
    "RoofClipper",
    "RoofConstraintSolver",
    "StructureClassifier",
    "router",
]
