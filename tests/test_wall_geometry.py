"""
tests/test_wall_geometry.py
===========================
Validation unit tests for the EzeFloor Wall Segmentation Refactor.
Validates:
- Polygon vertex reduction (> 70%)
- Orientation error (< 3 degrees)
- Thickness error (< 5%)
- Self-intersection checks (must be valid polygons)
- Merge accuracy for parallel adjacent walls
"""

import sys
from typing import Tuple, List
import numpy as np
import pytest
from pathlib import Path
from shapely.geometry import Polygon as ShapelyPolygon

# Add backend directory to path
TEST_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = TEST_DIR.parent
BACKEND_DIR = WORKSPACE_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from services.wall_polygon_refiner import refine_wall_polygon, orthogonalize_polygon, reconstruct_wall_rectangle, snap_polygon_to_cad_edges, recover_wall_thickness
from services.wall_merge_engine import merge_wall_segments

def generate_noisy_rect(
    p1: Tuple[float, float], 
    p2: Tuple[float, float], 
    thickness: float, 
    num_noise_points: int = 40
) -> List[List[float]]:
    """Generates a noisy rectangle polygon along the path from p1 to p2 with thickness."""
    pt1 = np.array(p1, dtype=float)
    pt2 = np.array(p2, dtype=float)
    
    # Direction vectors
    v = pt2 - pt1
    length = np.linalg.norm(v)
    v_dir = v / length
    # Normal vector
    n_dir = np.array([-v_dir[1], v_dir[0]])
    
    # 4 clean corners of the rectangle
    c0 = pt1 - (thickness / 2.0) * n_dir
    c1 = pt2 - (thickness / 2.0) * n_dir
    c2 = pt2 + (thickness / 2.0) * n_dir
    c3 = pt1 + (thickness / 2.0) * n_dir
    
    # Interpolate noisy coordinates along the edges
    coords = []
    
    # Edge 0: c0 to c1
    for t in np.linspace(0, 1, num_noise_points // 4):
        p = c0 * (1 - t) + c1 * t
        # Add random perturbation perpendicular to the edge
        p += np.random.uniform(-0.8, 0.8) * n_dir
        coords.append([float(p[0]), float(p[1])])
        
    # Edge 1: c1 to c2
    for t in np.linspace(0, 1, max(3, num_noise_points // 8)):
        p = c1 * (1 - t) + c2 * t
        p += np.random.uniform(-0.8, 0.8) * v_dir
        coords.append([float(p[0]), float(p[1])])
        
    # Edge 2: c2 to c3
    for t in np.linspace(0, 1, num_noise_points // 4):
        p = c2 * (1 - t) + c3 * t
        p += np.random.uniform(-0.8, 0.8) * n_dir
        coords.append([float(p[0]), float(p[1])])
        
    # Edge 3: c3 to c0
    for t in np.linspace(0, 1, max(3, num_noise_points // 8)):
        p = c3 * (1 - t) + c0 * t
        p += np.random.uniform(-0.8, 0.8) * v_dir
        coords.append([float(p[0]), float(p[1])])
        
    return coords


def test_horizontal_wall_geometry():
    """Validates horizontal wall cleanup, snapping, and reconstruction metrics."""
    gt_p1 = (10.0, 100.0)
    gt_p2 = (310.0, 100.0)
    gt_thickness = 30.0  # px
    gt_orientation = 0.0  # degrees (horizontal)
    
    # 1. Generate noisy polygon
    raw_coords = generate_noisy_rect(gt_p1, gt_p2, gt_thickness, num_noise_points=60)
    num_raw_vertices = len(raw_coords)
    assert num_raw_vertices >= 40
    
    # 2. Pipeline processing
    cleaned = refine_wall_polygon(raw_coords)
    ortho = orthogonalize_polygon(cleaned)
    reconstructed = reconstruct_wall_rectangle(ortho, real_scale=1.0)
    
    final_poly = reconstructed["polygon"]
    final_thickness = reconstructed["thickness_px"]
    final_orientation = reconstructed["orientation_deg"]
    
    # 3. Assertions
    # Metric 1: Vertex count reduction > 70%
    num_final_vertices = len(final_poly)
    reduction = (num_raw_vertices - num_final_vertices) / num_raw_vertices
    assert reduction > 0.70, f"Vertex reduction is only {reduction:.2%}, expected > 70%"
    
    # Metric 2: Thickness error < 5%
    thickness_error = abs(final_thickness - gt_thickness) / gt_thickness
    assert thickness_error < 0.05, f"Thickness error is {thickness_error:.2%}, expected < 5%"
    
    # Metric 3: Orientation error < 3 degrees (handling modulo 180)
    orient_err = abs(final_orientation - gt_orientation)
    orient_err = min(orient_err, 180.0 - orient_err)
    assert orient_err < 3.0, f"Orientation error is {orient_err} degrees, expected < 3 deg"
    
    # Metric 4: No self-intersections (valid polygon)
    poly_obj = ShapelyPolygon(final_poly)
    assert poly_obj.is_valid, "Reconstructed polygon is self-intersecting or invalid"


def test_vertical_wall_geometry():
    """Validates vertical wall cleanup, snapping, and reconstruction metrics."""
    gt_p1 = (200.0, 50.0)
    gt_p2 = (200.0, 450.0)
    gt_thickness = 24.0  # px
    gt_orientation = 90.0  # degrees (vertical)
    
    # 1. Generate noisy polygon
    raw_coords = generate_noisy_rect(gt_p1, gt_p2, gt_thickness, num_noise_points=70)
    num_raw_vertices = len(raw_coords)
    
    # 2. Pipeline processing
    cleaned = refine_wall_polygon(raw_coords)
    ortho = orthogonalize_polygon(cleaned)
    reconstructed = reconstruct_wall_rectangle(ortho, real_scale=1.0)
    
    final_poly = reconstructed["polygon"]
    final_thickness = reconstructed["thickness_px"]
    final_orientation = reconstructed["orientation_deg"]
    
    # 3. Assertions
    # Vertex reduction > 70%
    num_final_vertices = len(final_poly)
    reduction = (num_raw_vertices - num_final_vertices) / num_raw_vertices
    assert reduction > 0.70, f"Vertex reduction is only {reduction:.2%}, expected > 70%"
    
    # Thickness error < 5%
    thickness_error = abs(final_thickness - gt_thickness) / gt_thickness
    assert thickness_error < 0.05, f"Thickness error is {thickness_error:.2%}, expected < 5%"
    
    # Orientation error < 3 degrees
    orient_err = abs(final_orientation - gt_orientation)
    orient_err = min(orient_err, 180.0 - orient_err)
    assert orient_err < 3.0, f"Orientation error is {orient_err} degrees, expected < 3 deg"
    
    # No self-intersections
    poly_obj = ShapelyPolygon(final_poly)
    assert poly_obj.is_valid, "Reconstructed polygon is invalid"


def test_wall_merge_accuracy():
    """Validates the merge engine correctly combines parallel/collinear close wall segments."""
    # Segment 1: Horizontal wall segment 1
    w1_poly = [[10, 90], [100, 90], [100, 110], [10, 110]]
    # Segment 2: Parallel adjacent horizontal segment 2 (5px gap on x-axis)
    w2_poly = [[105, 90], [200, 90], [200, 110], [105, 110]]
    
    candidate_walls = [
        {
            "polygon": w1_poly,
            "orientation_deg": 0.0,
            "thickness_px": 20.0,
            "confidence": 0.95
        },
        {
            "polygon": w2_poly,
            "orientation_deg": 0.0,
            "thickness_px": 20.0,
            "confidence": 0.90
        }
    ]
    
    # Merge segments
    merged_results = merge_wall_segments(candidate_walls, distance_threshold=10.0, angle_threshold=10.0)
    
    # Should result in exactly 1 merged wall polygon
    assert len(merged_results) == 1, f"Expected 1 merged wall, got {len(merged_results)}"
    
    merged_poly, merged_conf = merged_results[0]
    assert merged_poly.geom_type == "Polygon"
    # Merged confidence should be average (0.925)
    assert abs(merged_conf - 0.925) < 1e-3
    
    # Reconstruct merged shape
    coords = [[float(p[0]), float(p[1])] for p in list(merged_poly.exterior.coords)[:-1]]
    final_rect = reconstruct_wall_rectangle(coords, real_scale=1.0)
    
    # Reconstructed length should cover the combined span of both walls (approx 10 to 200 -> length ~190)
    assert final_rect["length_px"] > 185.0
    assert abs(final_rect["thickness_px"] - 20.0) < 1.5
    assert abs(final_rect["orientation_deg"] - 0.0) < 1.0

def test_snap_polygon_to_cad_edges():
    """Asserts that KDTree snaps coordinates within 15px perfectly to mock CAD lines (offset < 3px)."""
    # Create 200x200 mock CAD edges map
    edges_map = np.zeros((200, 200), dtype=np.uint8)
    # Draw vertical wall edge line at x = 100
    edges_map[50:150, 100] = 255
    
    noisy_vertices = [
        [95.0, 60.0],
        [104.0, 80.0],
        [97.0, 100.0],
        [103.0, 120.0],
        [96.0, 140.0]
    ]
    
    snapped = snap_polygon_to_cad_edges(noisy_vertices, edges_map, max_dist=15.0)
    
    # All snapped vertices should have X coordinate exactly at 100.0 (offset = 0px < 3px target)
    for idx, pt in enumerate(snapped):
        offset = abs(pt[0] - 100.0)
        assert offset < 3.0, f"Vertex {idx} offset is {offset}px, expected < 3px"
        # Y coordinates should remain unchanged
        assert pt[1] == noisy_vertices[idx][1]

def test_recover_wall_thickness():
    """Asserts ray-casting thickness recovery measures distance between opposite CAD faces accurately (< 5% error)."""
    # Create 200x200 mock CAD edges map
    edges_map = np.zeros((200, 200), dtype=np.uint8)
    # Draw two opposite parallel wall face lines at x=90 and x=114 (thickness = 24px)
    edges_map[50:150, 90] = 255
    edges_map[50:150, 114] = 255
    
    # Vertical centerline exactly at the middle (x = 102)
    centerline = [
        [102.0, 60.0],
        [102.0, 140.0]
    ]
    
    recovered = recover_wall_thickness(centerline, edges_map, fallback_thickness=30.0)
    
    # Ground truth is 24px
    assert abs(recovered["thickness"] - 24.0) < 1e-3
    thickness_error = abs(recovered["thickness"] - 24.0) / 24.0
    assert thickness_error < 0.05, f"Thickness error is {thickness_error:.2%}, expected < 5%"

from services.wall_polygon_refiner import (
    align_centerline_to_axes,
    apply_centerline_shift,
    cleanup_wall_junctions
)

def test_align_centerline_to_axes():
    """Asserts that centerlines within 15 degrees are forced to horizontal/vertical axes."""
    # Near horizontal (dx=100, dy=5 => angle ~ 2.8 degrees)
    p1 = [10.0, 100.0]
    p2 = [110.0, 105.0]
    p1_new, p2_new = align_centerline_to_axes(p1, p2)
    assert p1_new[1] == p2_new[1]  # Y should be equal (horizontal)
    assert p1_new[1] == 102.5  # Average Y
    
    # Near vertical (dx=5, dy=100 => angle ~ 87.1 degrees)
    p1 = [100.0, 10.0]
    p2 = [105.0, 110.0]
    p1_new, p2_new = align_centerline_to_axes(p1, p2)
    assert p1_new[0] == p2_new[0]  # X should be equal (vertical)
    assert p1_new[0] == 102.5  # Average X

def test_apply_centerline_shift():
    """Asserts that shifting centerline moves it by shift amount along perpendicular normal."""
    # Horizontal centerline: y=100, p1=[0, 100], p2=[100, 100]
    # v = [100, 0] => v_dir = [1, 0] => normal = [-0, 1] = [0, 1]
    # Shift of 5px should move Y to 105
    centerline = [[0.0, 100.0], [100.0, 100.0]]
    shifted = apply_centerline_shift(centerline, 5.0)
    assert shifted[0][1] == 105.0
    assert shifted[1][1] == 105.0
    
    # Vertical centerline: x=100, p1=[100, 0], p2=[100, 100]
    # v = [0, 100] => v_dir = [0, 1] => normal = [-1, 0]
    # Shift of 5px should move X to 95
    centerline = [[100.0, 0.0], [100.0, 100.0]]
    shifted = apply_centerline_shift(centerline, 5.0)
    assert shifted[0][0] == 95.0
    assert shifted[1][0] == 95.0

def test_cleanup_wall_junctions():
    """Asserts endpoints of different walls within 8px are merged to their centroid."""
    # Wall A: centerline from [0, 100] to [98.0, 100.0], thickness 10px
    # Wall B: centerline from [101.0, 102.0] to [101.0, 200.0], thickness 10px
    # Endpoint distance: sqrt((101-98)^2 + (102-100)^2) = sqrt(9 + 4) = 3.6 px < 8px
    # They should merge to centroid of [98, 100] and [101, 102]: [(98+101)/2, (100+102)/2] = [99.5, 101.0]
    walls = [
        {
            "id": "wall_A",
            "centerline": [[0.0, 100.0], [98.0, 100.0]],
            "thickness_px": 10.0,
            "polygon": []
        },
        {
            "id": "wall_B",
            "centerline": [[101.0, 102.0], [101.0, 200.0]],
            "thickness_px": 10.0,
            "polygon": []
        }
    ]
    
    cleanup_wall_junctions(walls, snap_dist=8.0, real_scale=1.0)
    
    # Wall A end point and Wall B start point should be [99.5, 101.0]
    assert walls[0]["centerline"][1] == [99.5, 101.0]
    assert walls[1]["centerline"][0] == [99.5, 101.0]
    
    # Polygons should be reconstructed and not empty
    assert len(walls[0]["polygon"]) == 4
    assert len(walls[1]["polygon"]) == 4

