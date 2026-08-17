import pytest
import sys
from pathlib import Path

# Ensure backend directory is in path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from services.floor_ai_detect import (
    map_ocr_bbox_to_global,
    classify_text_category,
    is_text_spatially_in_room,
    _score_room_name,
    _match_text_to_rooms
)
from services.room_ocr_service import (
    is_title_annotation,
    parse_and_normalize_room_text
)


def test_map_ocr_bbox_to_global_angle_0():
    local_bbox = {"x": 20.0, "y": 10.0, "w": 30.0, "h": 15.0}
    res = map_ocr_bbox_to_global(local_bbox, crop_w=200, crop_h=100, angle=0, scale_x=1.0, scale_y=1.0, crop_x1=500, crop_y1=300)
    assert res["x"] == pytest.approx(520.0)
    assert res["y"] == pytest.approx(310.0)
    assert res["w"] == pytest.approx(30.0)
    assert res["h"] == pytest.approx(15.0)


def test_map_ocr_bbox_to_global_angle_90_clockwise():
    # Rotated image W_rot=100, H_rot=200
    # Original point (20, 10), size (30, 15) in crop of size (200, 100)
    # Rotated point x_rot = 100 - 10 - 15 = 75, y_rot = 20, w_rot = 15, h_rot = 30
    local_bbox = {"x": 75.0, "y": 20.0, "w": 15.0, "h": 30.0}
    res = map_ocr_bbox_to_global(local_bbox, crop_w=200, crop_h=100, angle=90, scale_x=1.0, scale_y=1.0, crop_x1=500, crop_y1=300)
    assert res["x"] == pytest.approx(520.0)
    assert res["y"] == pytest.approx(310.0)
    assert res["w"] == pytest.approx(30.0)
    assert res["h"] == pytest.approx(15.0)


def test_map_ocr_bbox_to_global_angle_180():
    local_bbox = {"x": 150.0, "y": 75.0, "w": 30.0, "h": 15.0}
    res = map_ocr_bbox_to_global(local_bbox, crop_w=200, crop_h=100, angle=180, scale_x=1.0, scale_y=1.0, crop_x1=500, crop_y1=300)
    assert res["x"] == pytest.approx(520.0)
    assert res["y"] == pytest.approx(310.0)
    assert res["w"] == pytest.approx(30.0)
    assert res["h"] == pytest.approx(15.0)


def test_map_ocr_bbox_to_global_angle_270():
    local_bbox = {"x": 10.0, "y": 150.0, "w": 15.0, "h": 30.0}
    res = map_ocr_bbox_to_global(local_bbox, crop_w=200, crop_h=100, angle=270, scale_x=1.0, scale_y=1.0, crop_x1=500, crop_y1=300)
    assert res["x"] == pytest.approx(520.0)
    assert res["y"] == pytest.approx(310.0)
    assert res["w"] == pytest.approx(30.0)
    assert res["h"] == pytest.approx(15.0)


def test_text_classification_hierarchy():
    assert classify_text_category("UPPER FLOOR AREAS") == "TITLE_ANNOTATION"
    assert classify_text_category("GROUND FLOOR PLAN") == "TITLE_ANNOTATION"
    assert classify_text_category("SITE PLAN") == "TITLE_ANNOTATION"
    assert classify_text_category("BED 2") == "ROOM_NAME"
    assert classify_text_category("BATH") == "ROOM_NAME"
    assert classify_text_category("ENSUITE") == "ROOM_NAME"
    assert classify_text_category("17906") == "DIMENSION"
    assert classify_text_category("820") == "DIMENSION"
    assert classify_text_category("720CS") == "DIMENSION"


def test_is_title_annotation_helper():
    assert is_title_annotation("UPPER FLOOR AREAS") is True
    assert is_title_annotation("FIRST FLOOR LEVEL") is True
    assert is_title_annotation("BED 2") is False


def test_score_room_name_rejects_upper_floor_areas():
    assert _score_room_name("UPPER FLOOR AREAS") == -1
    assert _score_room_name("GROUND FLOOR PLAN") == -1
    assert _score_room_name("17906") == -1
    assert _score_room_name("BED 2") > 0


def test_is_text_spatially_in_room():
    room_polygon = [
        {"x": 100.0, "y": 100.0},
        {"x": 400.0, "y": 100.0},
        {"x": 400.0, "y": 400.0},
        {"x": 100.0, "y": 400.0}
    ]
    inside_bbox = {"x": 200.0, "y": 200.0, "w": 50.0, "h": 20.0}
    outside_bbox = {"x": 500.0, "y": 500.0, "w": 150.0, "h": 30.0}

    is_in, _, _ = is_text_spatially_in_room(inside_bbox, room_polygon)
    assert is_in is True

    is_out, _, _ = is_text_spatially_in_room(outside_bbox, room_polygon)
    assert is_out is False


def test_match_text_to_rooms_bed2_vs_upper_floor_areas():
    rooms = [{
        "id": "bed2_room",
        "polygon": [
            {"x": 100.0, "y": 100.0},
            {"x": 400.0, "y": 100.0},
            {"x": 400.0, "y": 400.0},
            {"x": 100.0, "y": 400.0}
        ],
        "room_name": "ROOM"
    }]

    texts = [
        {
            "text": "BED 2",
            "bbox": {"x": 200.0, "y": 200.0, "w": 60.0, "h": 25.0},
            "conf": 0.95
        },
        {
            "text": "UPPER FLOOR AREAS",
            "bbox": {"x": 450.0, "y": 450.0, "w": 180.0, "h": 30.0},
            "conf": 0.99
        },
        {
            "text": "17906",
            "bbox": {"x": 250.0, "y": 250.0, "w": 40.0, "h": 15.0},
            "conf": 0.98
        }
    ]

    matched_rooms = _match_text_to_rooms(rooms, texts)
    assert matched_rooms[0]["room_name"] == "BED 2"
    assert matched_rooms[0]["room_name_source"] == "yolo_ocr_matched"
