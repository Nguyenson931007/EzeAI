import math

import cv2
import numpy as np

from services.wall_segment_service import (
    _align_collinear_wall_chain_axes,
    _bridge_visual_t_junction_gaps,
    _classify_outermost_walls_by_floodfill,
    _dedupe_near_parallel_centerlines,
    _filter_orphan_fragments,
    _rebuild_wall_geometry,
    _restore_supported_raw_walls,
    _split_walls_at_all_junctions,
)


def wall(p1, p2, *, cls="interior_wall", confidence=0.5, thickness=15, source="best"):
    return {
        "id": f"{p1}-{p2}",
        "centerline": [list(p1), list(p2)],
        "class_name": cls,
        "confidence": confidence,
        "raw_thickness_px": thickness,
        "source_model": source,
    }


def test_parallel_dedupe_is_conservative():
    same_a = wall((10, 100), (210, 100), source="best")
    same_b = wall((12, 103), (208, 103), confidence=0.2, source="visual_recovery")
    real_parallel = wall((10, 118), (210, 118), source="best")

    result = _dedupe_near_parallel_centerlines([same_a, same_b, real_parallel])

    assert len(result) == 2
    assert sum(bool(item.get("parallel_duplicate_collapsed")) for item in result) == 1
    ys = sorted(round(sum(p[1] for p in item["centerline"]) / 2) for item in result)
    assert ys == [100, 118]


def test_near_parallel_contact_does_not_create_false_junction():
    main = wall((0, 0), (100, 0))
    nearby_parallel = wall((45, 2), (80, 2))
    result = _split_walls_at_all_junctions([main, nearby_parallel], touch_tolerance=3.0)
    assert len(result) == 2
    assert not any(item.get("junction_split") for item in result)


def test_real_t_junction_is_split():
    main = wall((0, 50), (100, 50))
    stem = wall((50, 10), (50, 50))
    result = _split_walls_at_all_junctions([main, stem], touch_tolerance=2.5)
    main_pieces = [item for item in result if item.get("junction_parent_id") == main["id"]]
    assert len(main_pieces) == 2
    assert all(item.get("junction_split") for item in main_pieces)


def test_visual_gap_bridge_requires_raster_evidence():
    base_walls = [wall((10, 50), (40, 50), thickness=8), wall((60, 15), (60, 85), thickness=8)]
    blank = np.full((100, 100, 3), 255, dtype=np.uint8)
    no_bridge = _bridge_visual_t_junction_gaps(blank, [dict(w, centerline=[p[:] for p in w["centerline"]]) for w in base_walls], max_gap=30)
    assert no_bridge[0]["centerline"][1][0] == 40

    ink = blank.copy()
    cv2.line(ink, (10, 50), (60, 50), (0, 0, 0), 5)
    cv2.line(ink, (60, 15), (60, 85), (0, 0, 0), 5)
    bridged = _bridge_visual_t_junction_gaps(ink, [dict(w, centerline=[p[:] for p in w["centerline"]]) for w in base_walls], max_gap=30)
    assert math.isclose(bridged[0]["centerline"][1][0], 60.0, abs_tol=0.1)


def test_orphan_cleanup_removes_only_decisively_unsupported_fragment():
    blank = np.full((120, 120, 3), 255, dtype=np.uint8)
    orphan = wall((20, 20), (55, 20), confidence=0.05, thickness=8, source="visual_recovery")
    connected = wall((20, 80), (55, 80), confidence=0.05, thickness=8, source="visual_recovery")
    anchor = wall((55, 80), (55, 115), confidence=0.8, thickness=8)
    result = _filter_orphan_fragments(blank, [orphan, connected, anchor])
    assert orphan not in result
    assert connected in result
    assert anchor in result


def test_supported_raw_wall_is_restored_after_destructive_pass():
    image = np.full((100, 180, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (20, 46), (150, 54), (0, 0, 0), -1)
    raw = wall((20, 50), (150, 50), confidence=0.45, thickness=9)
    result = _restore_supported_raw_walls(image, [raw], [])
    assert len(result) == 1
    assert result[0].get("restored_after_postprocess") is True


def test_split_pieces_collectively_represent_raw_wall():
    image = np.full((100, 180, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (20, 46), (150, 54), (0, 0, 0), -1)
    raw = wall((20, 50), (150, 50), confidence=0.8, thickness=9)
    pieces = [wall((20, 50), (85, 50), thickness=9), wall((85, 50), (150, 50), thickness=9)]
    result = _restore_supported_raw_walls(image, [raw], pieces)
    assert len(result) == 2
    assert not any(item.get("restored_after_postprocess") for item in result)


def test_envelope_classification_ignores_yolo_ext_int_guess():
    perimeter = [
        wall((20, 20), (180, 20), cls="interior_wall"),
        wall((180, 20), (180, 180), cls="interior_wall"),
        wall((180, 180), (20, 180), cls="interior_wall"),
        wall((20, 180), (20, 20), cls="interior_wall"),
    ]
    internal = wall((100, 20), (100, 180), cls="exterior_wall")
    result = _classify_outermost_walls_by_floodfill(perimeter + [internal], 220, 220, max_dim=220)
    assert all(item["class_name"] == "exterior_wall" for item in result[:4])
    assert result[4]["class_name"] == "interior_wall"


def test_render_geometry_is_rebuilt_from_centerline_and_thickness():
    stale = wall((10, 30), (110, 30), cls="exterior_wall")
    stale["polygon"] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    rebuilt = _rebuild_wall_geometry([stale], real_scale=1.0, wall_thicknesses={"ext": 100})[0]
    assert rebuilt["geometry_source"] == "centerline+thickness"
    assert {tuple(point) for point in rebuilt["polygon"]} == {(10.0, 20.0), (110.0, 20.0), (110.0, 40.0), (10.0, 40.0)}
    assert rebuilt["area_px"] == 2000.0


def test_edge_pair_duplicate_collapses_only_with_shared_band_raster_evidence():
    image = np.full((120, 260, 3), 255, dtype=np.uint8)
    # One hollow wall band: two dark strokes around a shared center axis.
    cv2.line(image, (20, 55), (240, 55), (0, 0, 0), 2)
    cv2.line(image, (20, 65), (240, 65), (0, 0, 0), 2)
    a = wall((20, 55), (240, 55), thickness=12, source="best")
    b = wall((20, 65), (240, 65), thickness=12, confidence=0.25, source="visual_recovery")
    result = _dedupe_near_parallel_centerlines([a, b], image)
    assert len(result) == 1
    assert result[0].get("parallel_duplicate_collapsed") is True
    assert result[0].get("parallel_duplicate_mode") in {"shared_band", "near_axis"}


def test_two_real_parallel_walls_survive_when_midpoint_has_no_wall_band():
    image = np.full((140, 260, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (20, 44), (240, 50), (0, 0, 0), -1)
    cv2.rectangle(image, (20, 70), (240, 76), (0, 0, 0), -1)
    a = wall((20, 47), (240, 47), thickness=8, source="best")
    b = wall((20, 73), (240, 73), thickness=8, source="best")
    result = _dedupe_near_parallel_centerlines([a, b], image)
    assert len(result) == 2


def test_moderate_confidence_tiny_orphan_without_band_is_removed():
    blank = np.full((120, 120, 3), 255, dtype=np.uint8)
    orphan = wall((20, 20), (48, 20), confidence=0.35, thickness=8, source="best")
    result = _filter_orphan_fragments(blank, [orphan])
    assert result == []


def test_raw_restore_coverage_uses_raw_axis_coordinates():
    image = np.full((120, 260, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (20, 56), (240, 64), (0, 0, 0), -1)
    raw = wall((20, 60), (240, 60), confidence=0.8, thickness=9)
    # A short shifted final piece must not be mistaken for 62% coverage of the raw run.
    final_piece = wall((185, 60), (240, 60), confidence=0.8, thickness=9)
    result = _restore_supported_raw_walls(image, [raw], [final_piece])
    assert len(result) == 2
    assert any(item.get("restored_after_postprocess") for item in result)


def test_thick_edge_pair_duplicate_can_collapse_beyond_old_18px_cap():
    image = np.full((150, 300, 3), 255, dtype=np.uint8)
    # One hollow thick wall band with edges 26px apart. The old 18px hard cap
    # prevented this pair from ever reaching the shared-band evidence test.
    cv2.line(image, (20, 62), (280, 62), (0, 0, 0), 3)
    cv2.line(image, (20, 88), (280, 88), (0, 0, 0), 3)
    a = wall((20, 62), (280, 62), thickness=26, source="best")
    b = wall((20, 88), (280, 88), thickness=26, confidence=0.30, source="visual_recovery")
    result = _dedupe_near_parallel_centerlines([a, b], image)
    assert len(result) == 1
    assert result[0].get("parallel_duplicate_mode") == "shared_band"
    y = sum(p[1] for p in result[0]["centerline"]) / 2.0
    assert math.isclose(y, 75.0, abs_tol=1.5)


def test_chain_axis_alignment_fixes_small_lane_drift_only_when_raster_agrees():
    image = np.full((130, 300, 3), 255, dtype=np.uint8)
    # Actual wall band is centred at y=60 across the whole run. The second topology
    # piece drifted to y=64 after a previous edit/pass.
    cv2.rectangle(image, (20, 55), (270, 65), (0, 0, 0), -1)
    a = wall((20, 60), (145, 60), thickness=11, confidence=0.8)
    b = wall((145, 64), (270, 64), thickness=11, confidence=0.5)
    result = _align_collinear_wall_chain_axes(image, [a, b])
    ys = [sum(p[1] for p in item["centerline"]) / 2.0 for item in result]
    assert math.isclose(ys[0], 60.0, abs_tol=0.2)
    assert math.isclose(ys[1], 60.0, abs_tol=0.2)
    assert result[1].get("chain_axis_aligned_px") == 4.0


def test_chain_axis_alignment_does_not_pull_separate_parallel_wall():
    image = np.full((140, 300, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (20, 45), (145, 53), (0, 0, 0), -1)
    cv2.rectangle(image, (145, 68), (280, 76), (0, 0, 0), -1)
    a = wall((20, 49), (145, 49), thickness=9)
    b = wall((145, 72), (280, 72), thickness=9)
    result = _align_collinear_wall_chain_axes(image, [a, b])
    assert result[0]["centerline"] == a["centerline"]
    assert result[1]["centerline"] == b["centerline"]
