import math

import cv2
import numpy as np

from services.wall_segment_service import (
    _align_collinear_wall_chain_axes,
    _bridge_visual_t_junction_gaps,
    _canonicalize_physical_wall_axes,
    _classify_outermost_walls_by_floodfill,
    _dedupe_near_parallel_centerlines,
    _filter_orphan_fragments,
    _rebuild_wall_geometry,
    _restore_supported_raw_walls,
    _split_walls_at_all_junctions,
    _annotate_wall_junctions,
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


def test_visual_gap_bridge_requires_raster_evidence_and_tiny_free_gap():
    # Target thickness is 8px, so an endpoint at x=52 is only ~4px outside the
    # target wall face (target center x=60). That is a plausible detector truncation.
    base_walls = [wall((10, 50), (52, 50), thickness=8), wall((60, 15), (60, 85), thickness=8)]
    blank = np.full((100, 100, 3), 255, dtype=np.uint8)
    no_bridge = _bridge_visual_t_junction_gaps(blank, [dict(w, centerline=[p[:] for p in w["centerline"]]) for w in base_walls], max_gap=24)
    assert no_bridge[0]["centerline"][1][0] == 52

    ink = blank.copy()
    cv2.line(ink, (10, 50), (60, 50), (0, 0, 0), 5)
    cv2.line(ink, (60, 15), (60, 85), (0, 0, 0), 5)
    bridged = _bridge_visual_t_junction_gaps(ink, [dict(w, centerline=[p[:] for p in w["centerline"]]) for w in base_walls], max_gap=24)
    assert math.isclose(bridged[0]["centerline"][1][0], 60.0, abs_tol=0.1)


def test_visual_gap_bridge_rejects_long_free_gap_even_when_a_thin_line_connects():
    # This resembles an electrical/dimension leader: black ink connects the endpoint
    # to a perpendicular stroke, but the free gap is much too large to be a wall endpoint
    # completion. The old bridge accepted this and extended dozens of endpoints.
    walls = [wall((10, 50), (40, 50), thickness=8), wall((70, 15), (70, 85), thickness=8)]
    image = np.full((100, 100, 3), 255, dtype=np.uint8)
    cv2.line(image, (10, 50), (70, 50), (0, 0, 0), 2)
    cv2.line(image, (70, 15), (70, 85), (0, 0, 0), 2)
    result = _bridge_visual_t_junction_gaps(image, [dict(w, centerline=[p[:] for p in w["centerline"]]) for w in walls], max_gap=24)
    assert result[0]["centerline"][1][0] == 40


def test_junction_annotation_keeps_one_physical_wall_object():
    main = wall((0, 50), (100, 50))
    stem = wall((50, 10), (50, 50))
    result = _annotate_wall_junctions([main, stem], touch_tolerance=2.5)
    assert len(result) == 2
    assert result[0]["centerline"] == [[0, 50], [100, 50]]
    assert result[1]["centerline"] == [[50, 10], [50, 50]]
    assert [50.0, 50.0] in result[0].get("junction_points", [])
    assert [50.0, 50.0] in result[1].get("junction_points", [])
    assert not any(w.get("junction_split") for w in result)


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



def test_physical_wall_edges_converge_to_one_canonical_axis():
    image = np.full((140, 320, 3), 255, dtype=np.uint8)
    # One hollow wall, two black boundary strokes. Detector emitted one wall per edge.
    cv2.line(image, (20, 58), (300, 58), (0, 0, 0), 3)
    cv2.line(image, (20, 78), (300, 78), (0, 0, 0), 3)
    a = wall((20, 58), (300, 58), thickness=20, confidence=0.8)
    b = wall((20, 78), (300, 78), thickness=20, confidence=0.7, source="visual_recovery")
    canon = _canonicalize_physical_wall_axes(image, [a, b])
    ys = [sum(p[1] for p in item["centerline"]) / 2.0 for item in canon]
    assert all(math.isclose(y, 68.0, abs_tol=1.5) for y in ys)
    final = _dedupe_near_parallel_centerlines(canon, image)
    assert len(final) == 1


def test_physical_axis_canonicalizer_keeps_two_real_parallel_walls_separate():
    image = np.full((180, 320, 3), 255, dtype=np.uint8)
    # Two separate hollow physical walls with a room/air gap between them.
    for y in (45, 55, 95, 105):
        cv2.line(image, (20, y), (300, y), (0, 0, 0), 3)
    a = wall((20, 50), (300, 50), thickness=10, confidence=0.8)
    b = wall((20, 100), (300, 100), thickness=10, confidence=0.8)
    result = _canonicalize_physical_wall_axes(image, [a, b])
    ya = sum(p[1] for p in result[0]["centerline"]) / 2.0
    yb = sum(p[1] for p in result[1]["centerline"]) / 2.0
    assert math.isclose(ya, 50.0, abs_tol=1.0)
    assert math.isclose(yb, 100.0, abs_tol=1.0)


def test_physical_axis_canonicalizer_recenters_offset_candidate():
    image = np.full((140, 320, 3), 255, dtype=np.uint8)
    cv2.line(image, (20, 62), (300, 62), (0, 0, 0), 3)
    cv2.line(image, (20, 78), (300, 78), (0, 0, 0), 3)
    # Candidate is on the upper edge instead of the physical centre.
    bad = wall((20, 62), (300, 62), thickness=16, confidence=0.85)
    result = _canonicalize_physical_wall_axes(image, [bad])
    y = sum(p[1] for p in result[0]["centerline"]) / 2.0
    assert math.isclose(y, 70.0, abs_tol=1.5)
    assert result[0].get("physical_wall_canonicalized") is True


def test_canonicalizer_uses_local_adjacent_edges_not_neighbour_wall_strokes():
    image = np.full((150, 320, 3), 255, dtype=np.uint8)
    # Two separate hollow walls only 12px apart between their nearest strokes.
    for y in (40, 50, 62, 72):
        cv2.line(image, (20, y), (300, y), (0, 0, 0), 3)
    # Detector landed on the lower edge of the first wall.
    cand = wall((20, 50), (300, 50), thickness=10, confidence=0.8)
    result = _canonicalize_physical_wall_axes(image, [cand])
    y = sum(p[1] for p in result[0]["centerline"]) / 2.0
    assert math.isclose(y, 45.0, abs_tol=1.5)


def test_raw_edge_is_not_restored_when_canonical_center_represents_same_band():
    image = np.full((150, 320, 3), 255, dtype=np.uint8)
    cv2.line(image, (20, 50), (300, 50), (0, 0, 0), 3)
    cv2.line(image, (20, 70), (300, 70), (0, 0, 0), 3)
    raw_edge = wall((20, 50), (300, 50), thickness=20, confidence=0.85)
    final_center = wall((20, 60), (300, 60), thickness=20, confidence=0.85)
    result = _restore_supported_raw_walls(image, [raw_edge], [final_center])
    assert len(result) == 1
    assert not any(w.get("restored_after_postprocess") for w in result)


def test_strict_merge_does_not_bridge_opening_gap():
    from services.wall_segment_service import _merge_collinear_walls
    a = wall((10, 50), (100, 50), thickness=10)
    b = wall((120, 50), (220, 50), thickness=10)
    result = _merge_collinear_walls([a, b], perp_dist_threshold=4.0, gap_threshold=4.0)
    assert len(result) == 2


def test_strict_merge_does_not_collapse_nearby_parallel_wall():
    from services.wall_segment_service import _merge_collinear_walls
    a = wall((10, 50), (220, 50), thickness=10)
    b = wall((10, 56), (220, 56), thickness=10)
    result = _merge_collinear_walls([a, b], perp_dist_threshold=4.0, gap_threshold=4.0)
    assert len(result) == 2


def test_local_orthogonalize_preserves_each_wall_lane():
    from services.wall_segment_service import _orthogonalize_walls
    a = wall((10, 50), (110, 52), thickness=10)
    b = wall((110, 57), (210, 55), thickness=10)
    result = _orthogonalize_walls([a, b], max_angle_deviation=5.0)
    ya = sum(p[1] for p in result[0]["centerline"]) / 2.0
    yb = sum(p[1] for p in result[1]["centerline"]) / 2.0
    assert math.isclose(ya, 51.0, abs_tol=0.1)
    assert math.isclose(yb, 56.0, abs_tol=0.1)
    assert not math.isclose(ya, yb, abs_tol=1.0)


def test_short_overlap_cleanup_keeps_real_parallel_wall_even_if_render_would_overlap():
    from services.wall_segment_service import _remove_short_overlapping_walls
    short = wall((40, 56), (100, 56), thickness=10)
    longw = wall((20, 50), (220, 50), thickness=10)
    result = _remove_short_overlapping_walls([short, longw], min_length=80.0)
    assert len(result) == 2


def test_short_overlap_cleanup_removes_same_lane_duplicate():
    from services.wall_segment_service import _remove_short_overlapping_walls
    short = wall((40, 50.5), (100, 50.5), thickness=10)
    longw = wall((20, 50), (220, 50), thickness=10)
    result = _remove_short_overlapping_walls([short, longw], min_length=80.0)
    assert len(result) == 1
    assert result[0]["centerline"] == longw["centerline"]


def test_locked_physical_axis_cannot_be_moved_by_later_visual_refine_passes():
    from services.wall_segment_service import _snap_walls_to_visual_axis, _refine_wall_axes_from_band_centers

    image = np.full((140, 320, 3), 255, dtype=np.uint8)
    # Deliberately put stronger ink a few pixels below the already-verified axis.
    cv2.rectangle(image, (20, 62), (300, 72), (0, 0, 0), -1)
    locked = wall((20, 60), (300, 60), thickness=11, confidence=0.9)
    locked["physical_axis_locked"] = True
    locked["physical_axis_support"] = 0.9
    before = [p[:] for p in locked["centerline"]]

    snapped = _snap_walls_to_visual_axis(image, [locked], max_offset=9)
    refined = _refine_wall_axes_from_band_centers(image, snapped, max_shift=9)
    assert refined[0]["centerline"] == before


def test_outside_envelope_whisker_cleanup_removes_short_outward_frame_only():
    from services.wall_segment_service import _filter_outside_envelope_whiskers

    # Short rail/frame entirely outside the building, attached at only one end.
    whisker = wall((100, 50), (150, 50), thickness=10)
    whisker["outside_ratio_sides"] = [1.0, 0.8]

    # Real perimeter wall: outside on only one side, must survive.
    perimeter = wall((20, 100), (250, 100), thickness=12)
    perimeter["outside_ratio_sides"] = [1.0, 0.0]

    # Short outside return but connected at both ends, fail open conservatively.
    return_piece = wall((250, 100), (250, 150), thickness=10)
    return_piece["outside_ratio_sides"] = [0.8, 0.8]
    other = wall((250, 150), (300, 150), thickness=10)
    other["outside_ratio_sides"] = [1.0, 0.0]
    anchor = wall((100, 50), (100, 100), thickness=10)
    anchor["outside_ratio_sides"] = [1.0, 0.0]

    result = _filter_outside_envelope_whiskers([whisker, perimeter, return_piece, other, anchor])
    assert whisker not in result
    assert perimeter in result
    assert return_piece in result


def test_adaptive_yolo_tiling_uses_multiple_high_resolution_strips_and_translates(monkeypatch):
    import services.wall_segment_service as ws
    from PIL import Image

    img = Image.new("RGB", (5054, 1703), "white")
    img_np = np.asarray(img)
    calls = []

    def fake_run(model, img_inference, img_w, img_h, inference_width, inference_height,
                 tile_np, confidence, imgsz, device, real_scale, model_label="best"):
        calls.append((img_w, img_h, inference_width, inference_height, model_label))
        return [{
            "class_name": "interior_wall",
            "confidence": 0.8,
            "centerline": [[10.0, 20.0], [100.0, 20.0]],
            "polygon": [[10.0, 18.0], [100.0, 18.0], [100.0, 22.0], [10.0, 22.0]],
            "raw_thickness_px": 5.0,
            "source_model": model_label,
        }]

    monkeypatch.setattr(ws, "_run_yolo_inference", fake_run)
    result = ws._run_yolo_adaptive_inference(
        object(), img, img_np, confidence=0.05, imgsz=1280, device="cpu", real_scale=1.0, model_label="best"
    )

    assert 2 <= len(calls) <= 5
    assert all(w < 5054 for w, _, _, _, _ in calls)
    # The full short dimension is retained in strip mode, avoiding a tiny-height full-plan resize.
    assert all(h == 1703 for _, h, _, _, _ in calls)
    assert len(result) == len(calls)
    assert max(item["centerline"][0][0] for item in result) > 1000
    assert all(item.get("inference_tile") for item in result)


def test_rebuild_geometry_uses_strong_raster_thickness_but_keeps_nominal_mm():
    item = wall((20, 60), (220, 60), cls="interior_wall", thickness=5)
    item["physical_thickness_px"] = 42.0
    item["physical_axis_support"] = 0.9
    item["physical_axis_locked"] = True
    rebuilt = _rebuild_wall_geometry([item], real_scale=2.0, wall_thicknesses={"int": 70})[0]
    assert rebuilt["thickness"] == 70
    assert rebuilt["thickness_px"] == 42.0
    assert rebuilt["render_thickness_source"] == "raster"


def test_single_thin_solid_stroke_is_not_axis_locked_as_a_physical_wall_band():
    image = np.full((120, 300, 3), 255, dtype=np.uint8)
    cv2.rectangle(image, (20, 58), (280, 63), (0, 0, 0), -1)
    candidate = wall((20, 60.5), (280, 60.5), thickness=5, confidence=0.8)
    result = _canonicalize_physical_wall_axes(image, [candidate])
    assert result[0].get("physical_axis_locked") is not True


def test_physical_band_cap_is_scale_aware_not_a_global_pixel_constant():
    from services.wall_segment_service import _physical_band_cap_px
    assert math.isclose(_physical_band_cap_px(4.77), 320.0 / 4.77, rel_tol=1e-3)
    assert _physical_band_cap_px(1.0) == 42.0
    assert _physical_band_cap_px(20.0) == 24.0
    assert _physical_band_cap_px(2.0) == 96.0
