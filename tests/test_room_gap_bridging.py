import sys
from pathlib import Path

# Add backend directory to path so we can import modules
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

import pytest
from api.routes import api_generate_rooms_from_walls, GenerateRoomsRequest

def test_dangling_to_dangling_gap_bridging():
    # A 300x300 square with an 80px gap on the left wall
    walls = [
        {"centerline": [[0, 0], [300, 0]]},     # Top wall
        {"centerline": [[300, 0], [300, 300]]}, # Right wall
        {"centerline": [[300, 300], [0, 300]]}, # Bottom wall
        {"centerline": [[0, 300], [0, 190]]},   # Left wall lower segment
        {"centerline": [[0, 110], [0, 0]]}      # Left wall upper segment
    ]

    # Test 1: gap_threshold (25.0) < gap (80.0) -> No room should be detected
    req_no_bridge = GenerateRoomsRequest(walls=walls, gap_threshold=25.0)
    res_no_bridge = api_generate_rooms_from_walls(req_no_bridge, username="test_user")
    assert res_no_bridge["success"] is True
    assert len(res_no_bridge["rooms"]) == 0

    # Test 2: gap_threshold (120.0) > gap (80.0) -> Gap should be bridged, 1 room detected
    req_bridge = GenerateRoomsRequest(walls=walls, gap_threshold=120.0)
    res_bridge = api_generate_rooms_from_walls(req_bridge, username="test_user")
    assert res_bridge["success"] is True
    assert len(res_bridge["rooms"]) == 1
    
    # Check that the detected room is approx the 300x300 square
    room = res_bridge["rooms"][0]
    poly_coords = room["polygon"]
    xs = [p["x"] for p in poly_coords]
    ys = [p["y"] for p in poly_coords]
    assert min(xs) == 0.0
    assert max(xs) == 300.0
    assert min(ys) == 0.0
    assert max(ys) == 300.0

def test_t_junction_gap_bridging():
    # A 300x300 square with a vertical middle divider that stops 80px short of the top wall (T-junction gap)
    walls = [
        {"centerline": [[0, 0], [300, 0]]},     # Top wall
        {"centerline": [[300, 0], [300, 300]]}, # Right wall
        {"centerline": [[300, 300], [0, 300]]}, # Bottom wall
        {"centerline": [[0, 300], [0, 0]]},     # Left wall
        {"centerline": [[150, 300], [150, 80]]} # Divider wall with 80px gap at the top
    ]

    # Test 1: gap_threshold (25.0) < gap (80.0) -> No split, 1 large room (the outer square)
    req_no_bridge = GenerateRoomsRequest(walls=walls, gap_threshold=25.0)
    res_no_bridge = api_generate_rooms_from_walls(req_no_bridge, username="test_user")
    assert res_no_bridge["success"] is True
    assert len(res_no_bridge["rooms"]) == 1

    # Test 2: gap_threshold (120.0) > gap (80.0) -> Divider bridges to top wall, splitting into 2 rooms
    req_bridge = GenerateRoomsRequest(walls=walls, gap_threshold=120.0)
    res_bridge = api_generate_rooms_from_walls(req_bridge, username="test_user")
    assert res_bridge["success"] is True
    assert len(res_bridge["rooms"]) == 2
