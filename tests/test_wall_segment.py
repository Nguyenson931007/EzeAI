import sys
import math
from pathlib import Path

TEST_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = TEST_DIR.parent
BACKEND_DIR = WORKSPACE_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from services.wall_segment_service import _compute_centerline_and_thickness

def test_compute_centerline_and_thickness_simple_rectangle():
    # A simple vertical rectangle of width 10 (thickness) and height 100
    # corners: (0,0), (10,0), (10,100), (0,100)
    polygon_coords = [[0, 0], [10, 0], [10, 100], [0, 100]]
    centerline, thickness = _compute_centerline_and_thickness(polygon_coords)
    
    assert thickness == 10.0
    assert centerline is not None
    # Endpoints should be midpoints of short edges: (5, 0) and (5, 100)
    # The order might depend on how Shapely lists the corners, but the coordinates should match
    endpoints = sorted(centerline)
    assert endpoints[0] == [5.0, 0.0]
    assert endpoints[1] == [5.0, 100.0]

def test_compute_centerline_and_thickness_invalid():
    # Line or point instead of polygon
    polygon_coords = [[0, 0], [10, 10]]
    centerline, thickness = _compute_centerline_and_thickness(polygon_coords)
    assert centerline is None
    assert thickness == 0.0

def test_merge_collinear_walls():
    from services.wall_segment_service import _merge_collinear_walls
    # Two parallel vertical walls of same class 'ext_wall'
    # Wall 1: centerline from (10, 0) to (10, 100)
    # Wall 2: centerline from (11, 80) to (11, 180) -- overlaps from y=80 to y=100
    walls = [
        {"class_name": "ext_wall", "confidence": 0.8, "centerline": [[10, 0], [10, 100]]},
        {"class_name": "ext_wall", "confidence": 0.9, "centerline": [[11, 80], [11, 180]]}
    ]
    merged = _merge_collinear_walls(walls)
    assert len(merged) == 1
    # The merged centerline should span from y=0 to y=180
    c = merged[0]["centerline"]
    endpoints = sorted(c, key=lambda p: p[1])
    assert endpoints[0][1] == 0.0
    assert endpoints[1][1] == 180.0
    # Confidence should be the max (0.9)
    assert merged[0]["confidence"] == 0.9

def test_snap_perpendicular_corners():
    from services.wall_segment_service import _snap_perpendicular_corners
    # Two perpendicular ext_walls: one horizontal, one vertical
    # Wall 1: horizontal from (0, 100) to (95, 100)
    # Wall 2: vertical from (100, 105) to (100, 200)
    # Their endpoints (95, 100) and (100, 105) are close to their intersection point (100, 100)
    walls = [
        {"class_name": "ext_wall", "confidence": 0.8, "centerline": [[0, 100], [95, 100]]},
        {"class_name": "ext_wall", "confidence": 0.8, "centerline": [[100, 105], [100, 200]]}
    ]
    snapped = _snap_perpendicular_corners(walls)
    # Check that they meet exactly at (100, 100)
    c1 = snapped[0]["centerline"]
    c2 = snapped[1]["centerline"]
    
    # Sort endpoints to find the snapped ones
    endpoints1 = sorted(c1, key=lambda p: p[0])
    endpoints2 = sorted(c2, key=lambda p: p[1])
    
    # Snapped endpoint should be (100.0, 100.0)
    assert endpoints1[1] == [100.0, 100.0]
    assert endpoints2[0] == [100.0, 100.0]

def test_snap_perpendicular_corners_non_ext():
    from services.wall_segment_service import _snap_perpendicular_corners
    # Perpendicular interior walls should also snap
    walls = [
        {"class_name": "interior_wall", "confidence": 0.8, "centerline": [[0, 100], [95, 100]]},
        {"class_name": "partition_wall", "confidence": 0.8, "centerline": [[100, 105], [100, 200]]}
    ]
    snapped = _snap_perpendicular_corners(walls)
    c1 = snapped[0]["centerline"]
    c2 = snapped[1]["centerline"]
    
    endpoints1 = sorted(c1, key=lambda p: p[0])
    endpoints2 = sorted(c2, key=lambda p: p[1])
    
    assert endpoints1[1] == [100.0, 100.0]
    assert endpoints2[0] == [100.0, 100.0]

def test_snap_t_junctions():
    from services.wall_segment_service import _snap_t_junctions
    # Wall 1 runs horizontally: from (50, 100) to (150, 100)
    # Wall 2 is vertical, ending near Wall 1: from (100, 115) to (100, 200)
    # The endpoint (100, 115) of Wall 2 should snap to Wall 1's centerline at (100, 100)
    walls = [
        {"class_name": "exterior_wall", "confidence": 0.8, "centerline": [[50, 100], [150, 100]]},
        {"class_name": "interior_wall", "confidence": 0.8, "centerline": [[100, 115], [100, 200]]}
    ]
    snapped = _snap_t_junctions(walls)
    
    # Wall 1 (exterior) should be unchanged
    assert snapped[0]["centerline"] == [[50, 100], [150, 100]]
    # Wall 2 (interior) should have its top endpoint snapped to (100, 100)
    c2 = snapped[1]["centerline"]
    endpoints2 = sorted(c2, key=lambda p: p[1])
    assert endpoints2[0] == [100.0, 100.0]
    assert endpoints2[1] == [100.0, 200.0]


def test_split_walls_at_t_junctions():
    from services.wall_segment_service import _split_walls_at_t_junctions
    # Wall 1 (horizontal): from (0, 100) to (100, 100)
    # Wall 2 (vertical perpendicular, ending at (30, 100)): from (30, 100) to (30, 200)
    # Wall 3 (vertical perpendicular, ending at (70, 100)): from (70, 100) to (70, 200)
    # Wall 1 should be split into 3 segments:
    # Segment A: (0, 100) to (30, 100)
    # Segment B: (30, 100) to (70, 100)
    # Segment C: (70, 100) to (100, 100)
    walls = [
        {"class_name": "exterior_wall", "confidence": 0.8, "centerline": [[0, 100], [100, 100]]},
        {"class_name": "interior_wall", "confidence": 0.8, "centerline": [[30, 100], [30, 200]]},
        {"class_name": "interior_wall", "confidence": 0.8, "centerline": [[70, 100], [70, 200]]}
    ]
    
    result = _split_walls_at_t_junctions(walls)
    
    # Wall 1 is split into 3 segments, plus 2 perpendicular walls = 5 total wall segments
    assert len(result) == 5
    centerlines = [w["centerline"] for w in result]
    assert [[0.0, 100.0], [30.0, 100.0]] in centerlines
    assert [[30.0, 100.0], [70.0, 100.0]] in centerlines
    assert [[70.0, 100.0], [100.0, 100.0]] in centerlines


def test_merge_collinear_walls_skewed_rejection():
    from services.wall_segment_service import _merge_collinear_walls
    # Two horizontal walls that are parallel but offset by a noticeable vertical step (20px)
    # Wall 1: horizontal from (0, 100) to (200, 100)
    # Wall 2: horizontal from (150, 120) to (350, 120) -- offset of 20px
    # If merged, they would form a single line from (0, 100) to (350, 120), which is skewed (slope = 20/350 = ~0.057).
    # Since this introduces a significant skew, they should NOT be merged.
    walls = [
        {"class_name": "interior_wall", "confidence": 0.8, "centerline": [[0, 100], [200, 100]]},
        {"class_name": "interior_wall", "confidence": 0.9, "centerline": [[150, 120], [350, 120]]}
    ]
    merged = _merge_collinear_walls(walls)
    # Merged list should still have 2 walls because the merge was rejected!
    assert len(merged) == 2


def test_snap_corners_larger_gap():
    from services.wall_segment_service import _snap_perpendicular_corners
    # Two perpendicular walls with a gap of 85px (larger than old 60px limit but within new 100px limit)
    # Horizontal: ends at (15, 100). Intersection point is (100, 100). Dist = 85px.
    # Vertical: starts at (100, 115). Intersection point is (100, 100). Dist = 15px.
    walls = [
        {"class_name": "ext_wall", "confidence": 0.8, "centerline": [[0, 100], [15, 100]]},
        {"class_name": "ext_wall", "confidence": 0.8, "centerline": [[100, 115], [100, 200]]}
    ]
    snapped = _snap_perpendicular_corners(walls)
    assert snapped[0]["centerline"][-1] == [100.0, 100.0]
    assert snapped[1]["centerline"][0] == [100.0, 100.0]


def test_snap_corners_skewed_angle():
    from services.wall_segment_service import _snap_perpendicular_corners
    # Angle is 72 degrees (tilted), which gives a dot product of cos(72) = 0.309.
    # This was rejected under the old 0.25 limit, but should be accepted under the new 0.35 limit.
    # Wall 1 direction: [1, 0] (horizontal)
    # Wall 2 direction: [cos(72), sin(72)] = [0.309, 0.951]
    # Centerlines ending near intersection (100, 100)
    walls = [
        {"class_name": "ext_wall", "confidence": 0.8, "centerline": [[0, 100], [90, 100]]},
        {"class_name": "ext_wall", "confidence": 0.8, "centerline": [[100 + 3.09, 100 + 9.51], [130.9, 200]]}
    ]
    snapped = _snap_perpendicular_corners(walls)
    c1 = snapped[0]["centerline"]
    c2 = snapped[1]["centerline"]
    # Check that they have been snapped to the same intersection point (approx (100, 100))
    assert math.isclose(c1[1][0], 100.0, abs_tol=0.5)
    assert math.isclose(c1[1][1], 100.0, abs_tol=0.5)
    assert math.isclose(c2[0][0], 100.0, abs_tol=0.5)
    assert math.isclose(c2[0][1], 100.0, abs_tol=0.5)





