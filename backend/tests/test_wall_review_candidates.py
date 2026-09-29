import numpy as np

from services.wall_segment_service import (
    _axis_coverage,
    _build_wall_review_candidates,
    _filter_outdoor_whiskers,
)


def wall(p1, p2, confidence=0.5, thickness=10):
    return {
        "centerline": [list(p1), list(p2)],
        "class_name": "interior_wall",
        "confidence": confidence,
        "raw_thickness_px": thickness,
        "source_model": "best",
    }


def test_review_pool_keeps_stable_graph_and_only_uncovered_raw_runs():
    image = np.full((140, 320, 3), 255, dtype=np.uint8)
    final = wall((20, 60), (220, 60), confidence=0.9)
    covered_raw = wall((25, 61), (215, 61), confidence=0.8)
    missing_raw = wall((220, 60), (300, 60), confidence=0.6)

    pool = _build_wall_review_candidates(
        image,
        [final],
        [covered_raw, missing_raw],
        max_visual_recovery=0,
    )

    assert [item["id"] for item in pool] == ["F001", "R001"]
    assert [item["candidate_stage"] for item in pool] == ["local_final", "raw_yolo_gap"]
    assert pool[1]["centerline"] == missing_raw["centerline"]


def test_axis_coverage_detects_overlap_but_not_parallel_neighbour():
    candidate = wall((20, 60), (220, 60))
    mostly_covered = wall((25, 61), (205, 61))
    nearby_real_parallel = wall((20, 68), (220, 68))
    separate_lane = wall((20, 85), (220, 85))

    assert _axis_coverage(candidate, mostly_covered) > 0.78
    assert _axis_coverage(candidate, nearby_real_parallel) == 0.0
    assert _axis_coverage(candidate, separate_lane) == 0.0


def test_outdoor_floodfill_cannot_delete_reviewed_stable_wet_area_return():
    stable = wall((100, 50), (150, 50))
    stable["candidate_stage"] = "local_final"
    unrelated = [
        wall((20, 100), (80, 100)),
        wall((200, 100), (260, 100)),
        wall((20, 180), (80, 180)),
    ]

    result = _filter_outdoor_whiskers([stable, *unrelated], 300, 220)

    assert stable in result
