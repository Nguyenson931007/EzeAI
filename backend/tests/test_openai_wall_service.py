import io
import json
import threading
import time

from PIL import Image

import services.openai_wall_service as wall_review
from services.openai_wall_service import (
    _build_audit_regions,
    _normalize_audit_findings,
    _normalize_batch_decisions,
    _protect_stable_local_walls,
    _replacement_is_local,
    _select_additive_decisions,
    _select_gap_candidates,
    _select_review_candidates,
)


def candidate(cid, stage, confidence=0.5):
    return {
        "id": cid,
        "candidate_stage": stage,
        "confidence": confidence,
        "centerline": [[0, 0], [100, 0]],
    }


def test_candidate_budget_prioritizes_stable_local_graph_then_gap_fillers():
    items = [
        candidate("V001", "visual_wall_band", 0.99),
        candidate("R001", "raw_yolo_gap", 0.3),
        candidate("F001", "local_final", 0.2),
        candidate("F002", "local_final", 0.8),
    ]

    selected = _select_review_candidates(items, 3)

    assert [item["id"] for item in selected] == ["F002", "F001", "R001"]


def test_luna_review_budget_contains_only_additive_gaps():
    items = [
        candidate("F001", "local_final", 0.9),
        candidate("R001", "raw_yolo_gap", 0.3),
        candidate("V001", "visual_wall_band", 0.8),
    ]

    selected = _select_gap_candidates(items, 10)

    assert [item["id"] for item in selected] == ["R001", "V001"]


def test_additive_policy_discards_uncertain_and_low_confidence_gap_decisions():
    stable = {
        "candidate_id": "F001",
        "action": "keep",
        "confidence": 0.2,
        "reason_code": "wall_continuity",
        "stable_auto_kept": True,
    }
    uncertain = {
        "candidate_id": "R001",
        "action": "uncertain",
        "confidence": 0.99,
        "reason_code": "room_boundary",
    }
    weak_keep = {
        "candidate_id": "R002",
        "action": "keep",
        "confidence": 0.70,
        "reason_code": "wall_continuity",
    }
    strong_keep = {
        "candidate_id": "R003",
        "action": "keep",
        "confidence": 0.95,
        "reason_code": "wall_continuity",
    }

    accepted, declined = _select_additive_decisions(
        [stable, uncertain, weak_keep, strong_keep],
        min_confidence=0.90,
    )

    assert [item["candidate_id"] for item in accepted] == ["F001", "R003"]
    assert [item["candidate_id"] for item in declined] == ["R001", "R002"]


def test_omitted_model_decision_fails_open_as_uncertain():
    batch = [
        candidate("F001", "local_final"),
        candidate("R001", "raw_yolo_gap"),
    ]
    model_output = [
        {
            "candidate_id": "F001",
            "action": "keep",
            "confidence": 0.9,
            "reason_code": "room_boundary",
        },
        {
            "candidate_id": "UNKNOWN",
            "action": "reject",
            "confidence": 1.0,
            "reason_code": "other",
        },
    ]

    normalized = _normalize_batch_decisions(model_output, batch)

    assert normalized[0]["action"] == "keep"
    assert normalized[1] == {
        "candidate_id": "R001",
        "action": "uncertain",
        "confidence": 0.0,
        "reason_code": "other",
    }


def test_short_stable_wet_area_wall_survives_ambiguous_rejection():
    stable = candidate("F069", "local_final", 0.65)
    decisions = [{
        "candidate_id": "F069",
        "action": "reject",
        "confidence": 0.84,
        "reason_code": "furniture_or_fixture",
    }]

    guarded, protected = _protect_stable_local_walls(decisions, {"F069": stable})

    assert protected == 1
    assert guarded[0]["action"] == "uncertain"
    assert guarded[0]["stable_wall_protected"] is True


def test_stable_wall_can_still_be_removed_with_decisive_false_positive_evidence():
    stable = candidate("F010", "local_final", 0.4)
    decisions = [{
        "candidate_id": "F010",
        "action": "reject",
        "confidence": 0.97,
        "reason_code": "dimension_or_annotation",
    }]

    guarded, protected = _protect_stable_local_walls(decisions, {"F010": stable})

    assert protected == 0
    assert guarded[0]["action"] == "reject"


def test_end_to_end_luna_is_additive_and_cannot_delete_yolo_baseline(monkeypatch):
    stable = candidate("F001", "local_final", 0.88)
    stable.update({"class_name": "exterior_wall", "centerline": [[10, 20], [110, 20]]})
    gap = candidate("R001", "raw_yolo_gap", 0.45)
    gap.update({"class_name": "interior_wall", "centerline": [[110, 20], [110, 90]]})

    def fake_openai_response(*, response_format, **kwargs):
        name = response_format["json_schema"]["name"]
        if name == "ezefloor_wall_decisions":
            payload = {"decisions": [{
                "candidate_id": "R001",
                "action": "keep",
                "confidence": 0.95,
                "reason_code": "wall_continuity",
            }]}
        elif name == "ezefloor_wall_final_qa":
            # Even a mistaken global rejection cannot delete immutable F001.
            payload = {"reject_ids": ["F001"]}
        else:
            payload = {"rescue_ids": []}
        return {"status": "completed", "output_text": json.dumps(payload)}

    monkeypatch.setattr(wall_review, "openai_response", fake_openai_response)
    image = Image.new("RGB", (160, 120), "white")
    buf = io.BytesIO()
    image.save(buf, format="PNG")

    result = wall_review.review_raw_candidates_with_openai(
        image_bytes=buf.getvalue(),
        raw_candidates=[stable, gap],
        wall_thicknesses={"ext": 90, "int": 70, "part": 70},
    )

    baseline = next(w for w in result["walls"] if w.get("candidate_id") == "F001")
    assert baseline["centerline"] == [[10.0, 20.0], [110.0, 20.0]]
    assert baseline["class_name"] == "exterior_wall"
    assert baseline["source"] == "local_yolo_immutable_baseline"
    assert result["stable_yolo_auto_kept_count"] == 1
    assert result["topology_error"] is None


def test_regional_audit_assigns_every_candidate_to_exactly_one_target_region():
    items = [
        {**candidate(f"F{i:03d}", "local_final", 0.8), "centerline": [[i * 25, 10], [i * 25, 90]]}
        for i in range(1, 9)
    ]

    regions = _build_audit_regions(items, width=240, height=120, columns=3, rows=2)
    audited_ids = [str(item["id"]) for region in regions for item in region["targets"]]

    assert sorted(audited_ids) == sorted(item["id"] for item in items)
    assert len(audited_ids) == len(set(audited_ids))


def test_regional_change_gates_block_weak_or_invented_edits():
    stable = candidate("F001", "local_final", 0.8)
    gap = candidate("R001", "raw_yolo_gap", 0.4)
    far_gap = candidate("R999", "raw_yolo_gap", 0.7)
    far_gap["centerline"] = [[900, 900], [1000, 900]]
    candidate_map = {item["id"]: item for item in [stable, gap, far_gap]}
    findings = [
        {"action": "delete", "target_id": "F001", "replacement_id": None, "confidence": 0.90,
         "reason_code": "dimension_or_annotation", "evidence": "weak"},
        {"action": "add", "target_id": "R001", "replacement_id": None, "confidence": 0.97,
         "reason_code": "room_boundary", "evidence": "paired wall band"},
        {"action": "replace", "target_id": "F001", "replacement_id": "R999", "confidence": 0.99,
         "reason_code": "wall_continuity", "evidence": "invented remote replacement"},
    ]

    accepted = _normalize_audit_findings(
        findings, {"F001", "R001"}, candidate_map, width=1200, height=1000,
    )

    assert [(item["action"], item["target_id"]) for item in accepted] == [("add", "R001")]
    assert _replacement_is_local(stable, far_gap, 1200, 1000) is False


def test_regional_auditor_applies_only_confirmed_sparse_change(monkeypatch):
    stable = candidate("F001", "local_final", 0.88)
    stable.update({"class_name": "exterior_wall", "centerline": [[10, 20], [110, 20]]})
    gap = candidate("R001", "raw_yolo_gap", 0.45)
    gap.update({"class_name": "interior_wall", "centerline": [[110, 20], [110, 90]]})

    def fake_openai_response(*, response_format, messages, **kwargs):
        name = response_format["json_schema"]["name"]
        prompt = messages[-1]["content"][0]["text"]
        if name == "ezefloor_regional_wall_audit":
            findings = []
            if 'R001' in prompt:
                findings.append({
                    "action": "add", "target_id": "R001", "replacement_id": None,
                    "confidence": 0.98, "reason_code": "wall_continuity",
                    "evidence": "visible paired band continues the exterior corner",
                })
            payload = {"findings": findings}
        else:
            payload = {"decisions": [{
                "change_id": "C001", "approve": True, "confidence": 0.99,
                "evidence": "clean plan confirms the missing return",
            }]}
        return {"status": "completed", "output_text": json.dumps(payload)}

    monkeypatch.setattr(wall_review, "openai_response", fake_openai_response)
    image = Image.new("RGB", (160, 120), "white")
    buf = io.BytesIO()
    image.save(buf, format="PNG")

    result = wall_review.audit_yolo_walls_with_openai(
        image_bytes=buf.getvalue(),
        raw_candidates=[stable, gap],
        wall_thicknesses={"ext": 90, "int": 70, "part": 70},
    )

    assert result["audit_mode"] == "regional_sparse_changes_v2"
    assert result["proposed_change_count"] == 1
    assert result["approved_change_count"] == 1
    assert {wall["candidate_id"] for wall in result["walls"]} == {"F001", "R001"}
    baseline = next(w for w in result["walls"] if w["candidate_id"] == "F001")
    assert baseline["centerline"] == [[10.0, 20.0], [110.0, 20.0]]


def test_regional_auditor_api_failure_returns_yolo_baseline(monkeypatch):
    stable = candidate("F001", "local_final", 0.88)
    stable.update({"class_name": "interior_wall", "centerline": [[10, 20], [110, 20]]})

    def failed_openai_response(**kwargs):
        raise RuntimeError("temporary upstream failure")

    monkeypatch.setattr(wall_review, "openai_response", failed_openai_response)
    image = Image.new("RGB", (160, 120), "white")
    buf = io.BytesIO()
    image.save(buf, format="PNG")

    result = wall_review.audit_yolo_walls_with_openai(
        image_bytes=buf.getvalue(), raw_candidates=[stable],
    )

    assert result["audit_error_count"] >= 1
    assert result["approved_change_count"] == 0
    assert [wall["candidate_id"] for wall in result["walls"]] == ["F001"]


def test_independent_regional_audits_run_with_bounded_parallelism(monkeypatch):
    items = []
    for index, (x, y) in enumerate([(25, 25), (150, 25), (275, 25), (25, 275)], start=1):
        item = candidate(f"F{index:03d}", "local_final", 0.85)
        item.update({"class_name": "interior_wall", "centerline": [[x, y], [x + 20, y]]})
        items.append(item)

    state = {"active": 0, "maximum": 0}
    lock = threading.Lock()

    def slow_openai_response(**kwargs):
        with lock:
            state["active"] += 1
            state["maximum"] = max(state["maximum"], state["active"])
        time.sleep(0.04)
        with lock:
            state["active"] -= 1
        return {"status": "completed", "output_text": json.dumps({"findings": []})}

    monkeypatch.setattr(wall_review, "openai_response", slow_openai_response)
    monkeypatch.setenv("OPENAI_WALL_AUDIT_CONCURRENCY", "3")
    image = Image.new("RGB", (320, 320), "white")
    buf = io.BytesIO()
    image.save(buf, format="PNG")

    result = wall_review.audit_yolo_walls_with_openai(
        image_bytes=buf.getvalue(), raw_candidates=items,
    )

    assert result["audit_region_count"] >= 3
    assert result["audit_concurrency"] == 3
    assert state["maximum"] >= 2
