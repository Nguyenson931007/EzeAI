import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import io
import json
import logging
import math
import os
import time
from typing import Any, Dict, List

from PIL import Image, ImageDraw

from services.openai_client import extract_response_text, get_openai_model, openai_response


logger = logging.getLogger("ezefloor.openai_wall_service")


def _distance(a, b):
    return math.hypot(float(a[0]) - float(b[0]), float(a[1]) - float(b[1]))


def _line_polygon(p1, p2, thickness_px):
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    length = math.hypot(dx, dy)
    if length <= 1e-6:
        return [p1, p1, p1, p1]
    nx, ny = -dy / length, dx / length
    half = max(1.5, float(thickness_px) / 2.0)
    return [
        [p1[0] + nx * half, p1[1] + ny * half],
        [p2[0] + nx * half, p2[1] + ny * half],
        [p2[0] - nx * half, p2[1] - ny * half],
        [p1[0] - nx * half, p1[1] - ny * half],
    ]


def _schema():
    return {
        "type": "object",
        "properties": {
            "decisions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "candidate_id": {"type": "string"},
                        "action": {"type": "string", "enum": ["keep", "reject", "uncertain"]},
                        "confidence": {"type": "number"},
                        "reason_code": {
                            "type": "string",
                            "enum": [
                                "building_envelope",
                                "room_boundary",
                                "wall_continuity",
                                "door_or_opening_context",
                                "duplicate_or_offset",
                                "dimension_or_annotation",
                                "furniture_or_fixture",
                                "outside_building",
                                "weak_visual_evidence",
                                "other",
                            ],
                        },
                    },
                    "required": ["candidate_id", "action", "confidence", "reason_code"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["decisions"],
        "additionalProperties": False,
    }


def _final_qa_schema():
    return {
        "type": "object",
        "properties": {
            "reject_ids": {
                "type": "array",
                "items": {"type": "string"},
            }
        },
        "required": ["reject_ids"],
        "additionalProperties": False,
    }


def _rescue_schema():
    return {
        "type": "object",
        "properties": {
            "rescue_ids": {
                "type": "array",
                "items": {"type": "string"},
            }
        },
        "required": ["rescue_ids"],
        "additionalProperties": False,
    }


def _make_overlay(original: Image.Image, candidates: List[Dict[str, Any]], max_side: int) -> Image.Image:
    overlay = original.copy().convert("RGB")
    sx = min(1.0, float(max_side) / max(overlay.size))
    if sx < 1.0:
        overlay = overlay.resize((max(1, int(overlay.width * sx)), max(1, int(overlay.height * sx))))
    draw = ImageDraw.Draw(overlay)
    for c in candidates:
        cl = c.get("centerline") or []
        if len(cl) != 2:
            continue
        p1 = (cl[0][0] * sx, cl[0][1] * sx)
        p2 = (cl[1][0] * sx, cl[1][1] * sx)
        draw.line([p1, p2], fill=(0, 140, 255), width=2)
        mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
        draw.text((mx + 2, my + 2), str(c.get("id", "")), fill=(220, 0, 0))
    return overlay



def _candidate_midpoint(candidate: Dict[str, Any]):
    cl = candidate.get("centerline") or [[0, 0], [0, 0]]
    return ((float(cl[0][0]) + float(cl[1][0])) / 2.0, (float(cl[0][1]) + float(cl[1][1])) / 2.0)


def _spatial_sort(candidates: List[Dict[str, Any]], width: int, height: int) -> List[Dict[str, Any]]:
    # Keep nearby walls in the same batch. Confidence-sorted batching scatters
    # candidates across the whole drawing and makes visual review unnecessarily hard.
    band_h = max(1.0, height / 4.0)
    return sorted(
        candidates,
        key=lambda c: (
            int(_candidate_midpoint(c)[1] / band_h),
            _candidate_midpoint(c)[0],
            _candidate_midpoint(c)[1],
        ),
    )


def _make_focus_overlay(
    original: Image.Image,
    candidates: List[Dict[str, Any]],
    max_side: int,
    retained_context: List[Dict[str, Any]] | None = None,
) -> Image.Image:
    if not candidates:
        return _make_overlay(original, candidates, max_side)
    xs, ys = [], []
    for c in candidates:
        cl = c.get("centerline") or []
        if len(cl) != 2:
            continue
        xs.extend([float(cl[0][0]), float(cl[1][0])])
        ys.extend([float(cl[0][1]), float(cl[1][1])])
    if not xs or not ys:
        return _make_overlay(original, candidates, max_side)
    pad_x = max(80.0, (max(xs) - min(xs)) * 0.18)
    pad_y = max(80.0, (max(ys) - min(ys)) * 0.28)
    left = max(0, int(min(xs) - pad_x))
    top = max(0, int(min(ys) - pad_y))
    right = min(original.width, int(max(xs) + pad_x))
    bottom = min(original.height, int(max(ys) + pad_y))
    crop = original.crop((left, top, right, bottom)).convert("RGB")
    sx = min(1.0, float(max_side) / max(crop.size))
    if sx < 1.0:
        crop = crop.resize((max(1, int(crop.width * sx)), max(1, int(crop.height * sx))))
    draw = ImageDraw.Draw(crop)
    # Stable YOLO geometry is context only and is always retained. Draw it first
    # in green without labels so Luna judges whether blue gaps add missing walls.
    for c in retained_context or []:
        cl = c.get("centerline") or []
        if len(cl) != 2:
            continue
        if max(float(cl[0][0]), float(cl[1][0])) < left or min(float(cl[0][0]), float(cl[1][0])) > right:
            continue
        if max(float(cl[0][1]), float(cl[1][1])) < top or min(float(cl[0][1]), float(cl[1][1])) > bottom:
            continue
        p1 = ((float(cl[0][0]) - left) * sx, (float(cl[0][1]) - top) * sx)
        p2 = ((float(cl[1][0]) - left) * sx, (float(cl[1][1]) - top) * sx)
        draw.line([p1, p2], fill=(0, 175, 75), width=2)
    for c in candidates:
        cl = c.get("centerline") or []
        if len(cl) != 2:
            continue
        p1 = ((float(cl[0][0]) - left) * sx, (float(cl[0][1]) - top) * sx)
        p2 = ((float(cl[1][0]) - left) * sx, (float(cl[1][1]) - top) * sx)
        draw.line([p1, p2], fill=(0, 130, 255), width=3)
        mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
        draw.text((mx + 3, my + 3), str(c.get("id", "")), fill=(220, 0, 0))
    return crop

def _encode_png(img: Image.Image, max_side: int = 2048) -> str:
    """Lossless encoding for dense plans where thin strokes carry semantics."""
    send = img.convert("RGB")
    if max(send.size) > max_side:
        r = max_side / max(send.size)
        send = send.resize(
            (max(1, int(send.width * r)), max(1, int(send.height * r))),
            Image.Resampling.LANCZOS,
        )
    b = io.BytesIO()
    send.save(b, format="PNG", optimize=True)
    return base64.b64encode(b.getvalue()).decode("ascii")


def _select_review_candidates(candidates: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    """Prefer the stable local graph, then spend remaining budget on gap fillers."""
    limit = max(1, int(limit))
    stable = [c for c in candidates if c.get("candidate_stage") == "local_final"]
    fillers = [c for c in candidates if c.get("candidate_stage") != "local_final"]
    stable.sort(key=lambda c: float(c.get("confidence", 0)), reverse=True)
    fillers.sort(
        key=lambda c: (
            1 if c.get("candidate_stage") == "raw_yolo_gap" else 0,
            float(c.get("visual_support", 0)),
            float(c.get("confidence", 0)),
        ),
        reverse=True,
    )
    return (stable + fillers)[:limit]


def _select_gap_candidates(candidates: List[Dict[str, Any]], limit: int) -> List[Dict[str, Any]]:
    """Select only additive gap candidates; stable Local-AI walls are immutable."""
    fillers = [c for c in candidates if c.get("candidate_stage") != "local_final"]
    fillers.sort(
        key=lambda c: (
            1 if c.get("candidate_stage") == "raw_yolo_gap" else 0,
            float(c.get("visual_support", 0)),
            float(c.get("confidence", 0)),
        ),
        reverse=True,
    )
    return fillers[:max(1, int(limit))]


def _normalize_batch_decisions(
    decisions: List[Dict[str, Any]],
    batch_candidates: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Make model omissions fail open instead of silently deleting real walls."""
    allowed = {str(c.get("id")) for c in batch_candidates if c.get("id")}
    by_id: Dict[str, Dict[str, Any]] = {}
    for decision in decisions or []:
        cid = str(decision.get("candidate_id") or "")
        if cid not in allowed or cid in by_id:
            continue
        action = str(decision.get("action") or "uncertain")
        if action not in {"keep", "reject", "uncertain"}:
            action = "uncertain"
        normalized = dict(decision)
        normalized["candidate_id"] = cid
        normalized["action"] = action
        by_id[cid] = normalized
    for cid in allowed - set(by_id):
        by_id[cid] = {
            "candidate_id": cid,
            "action": "uncertain",
            "confidence": 0.0,
            "reason_code": "other",
        }
    return [by_id[str(c.get("id"))] for c in batch_candidates if str(c.get("id")) in by_id]


def _protect_stable_local_walls(
    decisions: List[Dict[str, Any]],
    candidate_map: Dict[str, Dict[str, Any]],
) -> tuple[List[Dict[str, Any]], int]:
    """Require decisive semantic evidence before Luna may delete Local-AI walls.

    Short wet-area returns and robe partitions are visually similar to fixture
    outlines. A single low/medium-confidence vision judgment must not override
    geometry that already survived the deterministic Local-AI pipeline.
    """
    decisive_false_positive_reasons = {
        "dimension_or_annotation",
        "furniture_or_fixture",
        "outside_building",
    }
    protected = 0
    result: List[Dict[str, Any]] = []
    for decision in decisions:
        item = dict(decision)
        cid = str(item.get("candidate_id") or "")
        candidate = candidate_map.get(cid) or {}
        if item.get("action") == "reject" and candidate.get("candidate_stage") == "local_final":
            reason = str(item.get("reason_code") or "")
            try:
                confidence = float(item.get("confidence", 0) or 0)
            except (TypeError, ValueError):
                confidence = 0.0
            if confidence < 0.92 or reason not in decisive_false_positive_reasons:
                item["action"] = "uncertain"
                item["stable_wall_protected"] = True
                protected += 1
        result.append(item)
    return result, protected


def _select_additive_decisions(
    decisions: List[Dict[str, Any]],
    min_confidence: float = 0.90,
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Keep immutable baseline decisions plus only decisive Luna gap additions."""
    positive_reasons = {
        "building_envelope",
        "room_boundary",
        "wall_continuity",
        "door_or_opening_context",
    }
    accepted: List[Dict[str, Any]] = []
    declined: List[Dict[str, Any]] = []
    for decision in decisions:
        if decision.get("stable_auto_kept"):
            accepted.append(decision)
            continue
        try:
            confidence = float(decision.get("confidence", 0) or 0)
        except (TypeError, ValueError):
            confidence = 0.0
        if (
            decision.get("action") == "keep"
            and confidence >= min_confidence
            and decision.get("reason_code") in positive_reasons
        ):
            accepted.append(decision)
        else:
            declined.append(decision)
    return accepted, declined


def _extract_output_text(raw: Dict[str, Any]) -> str:
    if isinstance(raw.get("output_text"), str) and raw["output_text"].strip():
        return raw["output_text"].strip()
    for item in raw.get("output") or []:
        if item.get("type") != "message":
            continue
        for part in item.get("content") or []:
            if part.get("type") == "output_text" and isinstance(part.get("text"), str):
                return part["text"].strip()
    raise RuntimeError("OpenAI returned no output text")


def review_raw_candidates_with_openai(
    image_bytes: bytes,
    raw_candidates: List[Dict[str, Any]],
    real_scale: float = 1.0,
    wall_thicknesses: Dict[str, int] | None = None,
    existing_walls: List[Dict[str, Any]] | None = None,
    page_context: Dict[str, Any] | None = None,
    model: str | None = None,
) -> Dict[str, Any]:
    model_name = get_openai_model()
    if model and model.strip() and model.strip() != model_name:
        raise RuntimeError(f"EzeFloor is locked to {model_name}; requested model {model!r} is not allowed")
    timeout_sec = int(os.getenv("OPENAI_WALL_TIMEOUT_SEC", os.getenv("OPENAI_TIMEOUT_SEC", "180")))
    max_candidates = int(os.getenv("OPENAI_WALL_MAX_RAW_CANDIDATES", "320"))
    image_max_side = int(os.getenv("OPENAI_WALL_IMAGE_MAX_SIDE", "2048"))
    current_limit = int(os.getenv("OPENAI_WALL_MAX_CURRENT_WALLS", "80"))
    max_output_tokens = int(os.getenv("OPENAI_WALL_MAX_OUTPUT_TOKENS", os.getenv("OPENAI_MAX_OUTPUT_TOKENS", "5000")))

    original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    ow, oh = original.size
    stable_candidates = [
        c for c in raw_candidates
        if c.get("candidate_stage") == "local_final" and c.get("id")
    ]
    # Luna is additive: it reviews only gap candidates. Every stable YOLO wall
    # bypasses model judgment and is copied into the output unchanged.
    candidates = _select_gap_candidates(raw_candidates, max_candidates)
    candidates = _spatial_sort(candidates, ow, oh)
    candidate_map = {
        str(c.get("id")): c
        for c in [*stable_candidates, *candidates]
        if c.get("id")
    }

    # Existing canvas walls are context only; keep a small compact sample.
    current_context = []
    for w in (existing_walls or [])[:current_limit]:
        cl = w.get("centerline") or []
        if len(cl) == 2:
            current_context.append([
                w.get("class_name") or w.get("wall_type"),
                round(float(cl[0][0]) / ow, 4),
                round(float(cl[0][1]) / oh, 4),
                round(float(cl[1][0]) / ow, 4),
                round(float(cl[1][1]) / oh, 4),
            ])

    # Context is data only. Do not let a caller-provided free-text "instruction"
    # compete with the fixed wall-review contract above.
    allowed_context_keys = {"current_page", "roi", "current_wall_count", "door_count", "room_count"}
    safe_page_context = {
        key: value for key, value in (page_context or {}).items()
        if key in allowed_context_keys
    }
    page_context_text = json.dumps(safe_page_context, separators=(",", ":"), ensure_ascii=False)
    if len(page_context_text) > 3500:
        page_context_text = page_context_text[:3500] + "..."

    batch_size = max(5, int(os.getenv("OPENAI_WALL_BATCH_SIZE", "20")))

    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "ezefloor_wall_decisions",
            "strict": True,
            "schema": _schema(),
        },
    }

    def _parse_batch(raw: Dict[str, Any], batch_index: int) -> Dict[str, Any]:
        status = str(raw.get("status") or "")
        if status and status != "completed":
            details = raw.get("incomplete_details") or raw.get("error") or {}
            raise RuntimeError(
                f"OpenAI wall review batch {batch_index} did not complete: "
                f"status={status}, details={json.dumps(details, ensure_ascii=False)[:800]}"
            )
        try:
            text = extract_response_text(raw).strip()
        except Exception as exc:
            raise RuntimeError(
                f"OpenAI wall review batch {batch_index} returned no usable output text; "
                f"status={status or 'unknown'}"
            ) from exc

        # Structured Outputs should already be pure JSON. This small fallback makes
        # the parser tolerant of accidental markdown fences without accepting prose.
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()
            if text.lower().startswith("json\n"):
                text = text[5:].lstrip()
        try:
            parsed = json.loads(text)
        except Exception as exc:
            preview = text[:1000].replace("\n", " ")
            raise RuntimeError(
                f"OpenAI returned invalid structured wall response in batch {batch_index}. "
                f"Output preview: {preview!r}"
            ) from exc
        if not isinstance(parsed, dict) or not isinstance(parsed.get("decisions"), list):
            raise RuntimeError(
                f"OpenAI wall review batch {batch_index} returned JSON without a decisions array"
            )
        return parsed

    parsed_selections: List[Dict[str, Any]] = [
        {
            "candidate_id": str(c.get("id")),
            "action": "keep",
            "confidence": float(c.get("confidence", 1.0) or 1.0),
            "reason_code": "wall_continuity",
            "stable_auto_kept": True,
        }
        for c in stable_candidates
    ]

    def _review_batch(batch_candidates: List[Dict[str, Any]], batch_index: str) -> List[Dict[str, Any]]:
        # Build both the compact coordinates and the overlay from ONLY this batch.
        # This keeps the vision task focused and substantially reduces output size.
        batch = []
        for c in batch_candidates:
            cl = c.get("centerline") or [[0, 0], [0, 0]]
            batch.append([
                c.get("id"),
                c.get("candidate_stage") or "legacy_local",
                c.get("class_name"),
                round(float(c.get("confidence", 0)), 3),
                round(cl[0][0] / ow, 4),
                round(cl[0][1] / oh, 4),
                round(cl[1][0] / ow, 4),
                round(cl[1][1] / oh, 4),
            ])

        batch_overlay = _make_focus_overlay(
            original,
            batch_candidates,
            image_max_side,
            retained_context=stable_candidates,
        )
        prompt = f"""Review this floor plan and decide whether every blue candidate is a real architectural wall centerline.

INPUTS
- CLEAN FULL PLAN: use it to understand the footprint, rooms, openings, and required enclosure.
- FOCUSED OVERLAY: green lines are immutable retained YOLO walls; blue segments with red IDs are optional gap candidates.
- You decide only raw_yolo_gap and visual_wall_band candidates. Green YOLO walls are already accepted and are not in the decision list.

SUCCESS CRITERIA
- Return exactly one keep, reject, or uncertain decision for every ID.
- This is precision-first additive review: YOLO already protects recall. KEEP only with confidence >= 0.90 and clear positive evidence.
- Keep a candidate only when it aligns with a visible thick/paired wall band AND also closes/continues a required room boundary, envelope, connected wall run, or genuine short nib/return.
- Reject clear dimensions, leaders, text/grid lines, fences/property lines, furniture/cabinet/fixture outlines, door arcs, hatches, electrical lines, outside-building strokes, and duplicate/offset representations of the same wall.
- A long/dark/high-confidence line is not automatically a wall. A short segment is not automatically false.
- Use uncertain for partial occlusion or genuinely ambiguous evidence. UNCERTAIN is not added as geometry.
- Do not invent coordinates or classify exterior/interior. Deterministic geometry code handles class, snap, thickness, and deduplication after selection.

FINAL TEST
Hide the overlay mentally. If a real wall band or necessary room boundary remains at that exact location, keep it. If clearly not, reject it. Otherwise uncertain.

BATCH={batch_index}
RAW_CANDIDATES_FORMAT=[id,candidate_stage,local_class,local_confidence,sx,sy,ex,ey]
RAW_CANDIDATES={json.dumps(batch, separators=(',', ':'))}
CURRENT_CANVAS_WALLS_FORMAT=[class,sx,sy,ex,ey]
CURRENT_CANVAS_WALLS={json.dumps(current_context, separators=(',', ':'))}
PAGE_CONTEXT={page_context_text}
"""

        messages = [
            {
                "role": "system",
                "content": "You are a precision-first architectural wall-gap reviewer. YOLO walls are already retained. Approve an additive gap only with strong visual and topological evidence; uncertainty must remain uncertain and will not be drawn.",
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{_encode_png(original, image_max_side)}",
                            "detail": "original",
                        },
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{_encode_png(batch_overlay, image_max_side)}",
                            "detail": "original",
                        },
                    },
                ],
            },
        ]

        # With reasoning disabled, 20 candidates normally fit comfortably.
        # Keep enough headroom for strict JSON and allow the env limit to raise it.
        batch_max_tokens = min(max_output_tokens, max(3200, 260 * len(batch)))
        raw = openai_response(
            messages=messages,
            response_format=response_format,
            temperature=0.05,
            timeout_sec=timeout_sec,
            max_tokens=batch_max_tokens,
            reasoning_effort=os.getenv("OPENAI_WALL_REASONING_EFFORT", "medium"),
        )

        status = str(raw.get("status") or "")
        details = raw.get("incomplete_details") or {}
        if status == "incomplete" and details.get("reason") == "max_output_tokens":
            # Never fail the whole wall rebuild because one batch used too many
            # tokens. Split that batch and retry each half independently.
            if len(batch_candidates) > 5:
                mid = len(batch_candidates) // 2
                left = _review_batch(batch_candidates[:mid], f"{batch_index}a")
                right = _review_batch(batch_candidates[mid:], f"{batch_index}b")
                return left + right

        parsed_batch = _parse_batch(raw, batch_index)
        return _normalize_batch_decisions(parsed_batch.get("decisions") or [], batch_candidates)

    total_batches = max(1, math.ceil(len(candidates) / batch_size))
    for batch_number, offset in enumerate(range(0, len(candidates), batch_size), start=1):
        batch_candidates = candidates[offset: offset + batch_size]
        parsed_selections.extend(_review_batch(batch_candidates, f"{batch_number}/{total_batches}"))

    parsed_selections, protected_stable_rejections = _protect_stable_local_walls(
        parsed_selections,
        candidate_map,
    )

    # YOLO already protects recall. Add a Luna gap only with a decisive KEEP;
    # UNCERTAIN, low-confidence KEEP, and all REJECT decisions are not geometry.
    min_gap_confidence = float(os.getenv("OPENAI_WALL_MIN_GAP_CONFIDENCE", "0.90"))
    parsed_selections, rejected_decisions = _select_additive_decisions(
        parsed_selections,
        min_confidence=min_gap_confidence,
    )

    # Global rescue pass for locally rejected candidates. This is deliberately the
    # opposite of the first pass: look at rejected candidates together and rescue
    # any that are required by the full-plan room topology or visible wall bands.
    if rejected_decisions and os.getenv("OPENAI_WALL_RESCUE_REJECTED", "0") == "1":
        rejected_candidates = [candidate_map.get(str(item.get("candidate_id") or "")) for item in rejected_decisions]
        rejected_candidates = [c for c in rejected_candidates if c]
        if rejected_candidates:
            rescue_overlay = _make_overlay(original, rejected_candidates, image_max_side)
            rescue_ids_allowed = [str(c.get("id")) for c in rejected_candidates if c.get("id")]
            rescue_messages = [
                {
                    "role": "system",
                    "content": "You are a false-negative recovery reviewer for architectural wall extraction. Rescue rejected candidates that are actually real wall centerlines. Use the clean full plan and room topology. Return only IDs that should be restored.",
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "These candidates were rejected by local QA. Re-check them globally. "
                                "RESCUE an ID if it overlays a visible wall band, closes a required room boundary, "
                                "continues a real wall run, or forms a genuine nib/return. Do NOT rescue dimensions, "
                                "leaders, furniture, fence/property lines, or lines in the dimension zone. "
                                "When uncertain but topology strongly expects a wall, rescue it. "
                                f"Allowed IDs={json.dumps(rescue_ids_allowed, separators=(',', ':'))}"
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{_encode_png(original, image_max_side)}",
                                "detail": "original",
                            },
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{_encode_png(rescue_overlay, image_max_side)}",
                                "detail": "original",
                            },
                        },
                    ],
                },
            ]
            rescue_format = {
                "type": "json_schema",
                "json_schema": {
                    "name": "ezefloor_wall_rescue",
                    "strict": True,
                    "schema": _rescue_schema(),
                },
            }
            try:
                rescue_raw = openai_response(
                    messages=rescue_messages,
                    response_format=rescue_format,
                    temperature=0.0,
                    timeout_sec=timeout_sec,
                    max_tokens=min(max_output_tokens, 2200),
                    reasoning_effort=os.getenv("OPENAI_WALL_REASONING_EFFORT", "medium"),
                )
                rescue_parsed = json.loads(extract_response_text(rescue_raw).strip())
                rescue_ids = {str(x) for x in (rescue_parsed.get("rescue_ids") or []) if str(x) in candidate_map}
                rejected_by_id = {str(d.get("candidate_id") or ""): d for d in rejected_decisions}
                for rid in rescue_ids:
                    d = dict(rejected_by_id.get(rid) or {})
                    if d:
                        d["action"] = "keep"
                        parsed_selections.append(d)
            except Exception:
                pass

    # Final global pruning pass: show ALL batch-kept candidates together on the full
    # plan and ask the model only for obvious false positives to reject. This catches
    # dimension/property lines and globally inconsistent segments that can survive a
    # local batch review.
    if parsed_selections:
        selected_candidates = [candidate_map.get(str(item.get("candidate_id") or "")) for item in parsed_selections]
        selected_candidates = [c for c in selected_candidates if c]
        qa_overlay = _make_overlay(original, selected_candidates, image_max_side)
        qa_ids = [str(c.get("id")) for c in selected_candidates if c.get("id")]
        qa_messages = [
            {
                "role": "system",
                "content": "You are the final architectural wall-map QA gate. Return an ID only when it is CLEARLY not a real wall centerline. Preserve ambiguous candidates and genuine room boundaries; false negatives are more damaging than minor residual noise.",
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Compare the clean full plan with the proposed blue wall map. "
                            "Reject only proposed candidates that are clearly dimensions, annotations, furniture, fence/property lines, obvious duplicates, or clearly outside the architectural wall system. "
                            "Preserve any candidate that plausibly overlays a real wall band or required room boundary. "
                            "Do not reject genuine wall nibs, returns, or partially obscured valid walls. "
                            f"Allowed IDs={json.dumps(qa_ids, separators=(',', ':'))}"
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{_encode_png(original, image_max_side)}",
                            "detail": "original",
                        },
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{_encode_png(qa_overlay, image_max_side)}",
                            "detail": "original",
                        },
                    },
                ],
            },
        ]
        qa_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "ezefloor_wall_final_qa",
                "strict": True,
                "schema": _final_qa_schema(),
            },
        }
        qa_raw = openai_response(
            messages=qa_messages,
            response_format=qa_format,
            temperature=0.0,
            timeout_sec=timeout_sec,
            max_tokens=min(max_output_tokens, 1800),
            reasoning_effort=os.getenv("OPENAI_WALL_REASONING_EFFORT", "medium"),
        )
        try:
            qa_text = extract_response_text(qa_raw).strip()
            qa_parsed = json.loads(qa_text)
            # The global overview is useful for pruning high-recall fillers, but
            # its labels are too dense to safely delete stable Local-AI walls.
            reject_ids = {
                str(x) for x in (qa_parsed.get("reject_ids") or [])
                if str(x) in candidate_map
                and candidate_map[str(x)].get("candidate_stage") != "local_final"
            }
            if reject_ids:
                parsed_selections = [
                    item for item in parsed_selections
                    if str(item.get("candidate_id") or "") not in reject_ids
                ]
        except Exception:
            # Final QA is additive safety, not a reason to fail an otherwise valid review.
            pass

    parsed = {"selections": parsed_selections}

    thicknesses = wall_thicknesses or {"ext": 90, "int": 70, "part": 70}
    px_per_mm = (1.0 / float(real_scale)) if real_scale and float(real_scale) > 0 else 1.0
    walls = []
    seen = set()
    for item in parsed.get("selections") or []:
        cid = str(item.get("candidate_id") or "")
        if cid in seen or cid not in candidate_map:
            continue
        seen.add(cid)
        src = candidate_map[cid]
        cl = src.get("centerline")
        if not cl or len(cl) != 2 or _distance(cl[0], cl[1]) < 3:
            continue
        # GPT is a QA selector only. Never let the LLM overwrite EzeFloor's
        # deterministic exterior/interior classification. The final class is
        # rebuilt from geometry/topology after the selected set is known.
        cls = src.get("class_name") or "interior_wall"
        wt = "ext" if cls == "exterior_wall" else ("part" if cls == "partition_wall" else "int")
        mm = thicknesses.get(wt, thicknesses.get("int", 70))
        tpx = max(2.0, float(mm) * px_per_mm)
        p1 = [float(cl[0][0]), float(cl[0][1])]
        p2 = [float(cl[1][0]), float(cl[1][1])]
        walls.append({
            "id": f"openai_{cid}",
            "candidate_id": cid,
            "class_name": cls,
            "centerline": [p1, p2],
            "polygon": _line_polygon(p1, p2, tpx),
            "confidence": float(item.get("confidence", src.get("confidence", 0.5))),
            "reason": "",
            "source": "openai_raw_candidate_review",
            "local_class_name": src.get("class_name"),
            "local_confidence": src.get("confidence"),
            "candidate_stage": src.get("candidate_stage") or "legacy_local",
        })

    # YOLO final geometry is an immutable baseline. Normalize only Luna-approved
    # gap fillers, remove fillers already represented by that baseline, then append.
    pre_topology_count = len(walls)
    if walls:
        try:
            from services.wall_segment_service import (
                _classify_outermost_walls_by_raycast,
                _dedupe_near_parallel_centerlines,
                _axis_coverage,
                _filter_outdoor_whiskers,
                _merge_collinear_walls,
                _orthogonalize_walls,
                _rebuild_wall_geometry,
                _same_band_probe,
                _snap_perpendicular_corners,
                _snap_t_junctions,
            )
            img_np = __import__("numpy").asarray(original)
            stable_walls = [w for w in walls if w.get("candidate_stage") == "local_final"]
            extra_walls = [w for w in walls if w.get("candidate_stage") != "local_final"]

            # Normalize extras in isolation so no operation can move, merge, or
            # replace a YOLO-final centerline.
            extra_walls = _orthogonalize_walls(extra_walls, max_angle_deviation=5.0)
            extra_walls = _merge_collinear_walls(
                extra_walls,
                perp_dist_threshold=4.0,
                gap_threshold=6.0,
            )
            extra_walls = _snap_perpendicular_corners(extra_walls, max_dist_to_corner=12.0)
            extra_walls = _snap_t_junctions(extra_walls, max_dist_to_segment=12.0)
            extra_walls = _dedupe_near_parallel_centerlines(extra_walls)

            additive_extras = []
            for extra in extra_walls:
                already_present = any(
                    _axis_coverage(extra, stable) >= 0.62
                    or _same_band_probe(img_np, stable, extra, min_ratio=0.60) is not None
                    for stable in stable_walls
                )
                if not already_present:
                    additive_extras.append(extra)
            walls = stable_walls + additive_extras

            # Classify the combined graph, but restore the original YOLO class on
            # stable walls so their thickness/rendering also remains unchanged.
            walls = _classify_outermost_walls_by_raycast(walls, ow, oh)
            for wall in walls:
                if wall.get("candidate_stage") == "local_final" and wall.get("local_class_name"):
                    wall["class_name"] = wall["local_class_name"]
            walls = _filter_outdoor_whiskers(walls, ow, oh)
            walls = _classify_outermost_walls_by_raycast(walls, ow, oh)
            for wall in walls:
                if wall.get("candidate_stage") == "local_final" and wall.get("local_class_name"):
                    wall["class_name"] = wall["local_class_name"]
            walls = _rebuild_wall_geometry(walls, real_scale or 1.0, thicknesses)
        except Exception as exc:
            # QA should still return usable geometry if the deterministic classifier
            # fails unexpectedly; caller logs can expose the fallback via metadata.
            topology_error = str(exc)
        else:
            topology_error = None
    else:
        topology_error = None

    # Give final walls stable OpenAI IDs again after geometry rebuild.
    for idx, wall in enumerate(walls):
        wall["id"] = wall.get("id") or f"openai_final_{idx + 1:03d}"
        wall["source"] = (
            "local_yolo_immutable_baseline"
            if wall.get("candidate_stage") == "local_final"
            else "openai_additive_gap_then_ezefloor_topology"
        )

    exterior_count = sum(1 for w in walls if w.get("class_name") == "exterior_wall")
    interior_count = sum(1 for w in walls if w.get("class_name") in {"interior_wall", "partition_wall", "block_wall"})
    candidate_stage_counts: Dict[str, int] = {}
    for candidate in raw_candidates:
        stage = str(candidate.get("candidate_stage") or "legacy_local")
        candidate_stage_counts[stage] = candidate_stage_counts.get(stage, 0) + 1

    return {
        "status": "success",
        "provider": "openai",
        "model": model_name,
        "width": ow,
        "height": oh,
        "local_candidate_count": len(raw_candidates),
        "raw_candidate_count": len(raw_candidates),
        "candidate_count_sent": len(candidates),
        "candidate_count_dropped_by_budget": max(
            0,
            len([c for c in raw_candidates if c.get("candidate_stage") != "local_final"]) - len(candidates),
        ),
        "stable_yolo_auto_kept_count": len(stable_candidates),
        "gap_candidate_count_sent": len(candidates),
        "candidate_stage_counts": candidate_stage_counts,
        "protected_stable_rejections": protected_stable_rejections,
        "post_ai_topology_reclassified": True if walls else False,
        "post_ai_topology_input_count": pre_topology_count,
        "exterior_count": exterior_count,
        "interior_count": interior_count,
        "topology_error": topology_error,
        "walls": walls,
        "count": len(walls),
    }


# ---------------------------------------------------------------------------
# Regional YOLO auditor (v2)
# ---------------------------------------------------------------------------

_POSITIVE_WALL_REASONS = {
    "building_envelope",
    "room_boundary",
    "wall_continuity",
    "door_or_opening_context",
}
_FALSE_POSITIVE_REASONS = {
    "duplicate_or_offset",
    "dimension_or_annotation",
    "furniture_or_fixture",
    "outside_building",
}


def _audit_schema():
    """Sparse change list: omission means KEEP the YOLO baseline unchanged."""
    return {
        "type": "object",
        "properties": {
            "findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["add", "delete", "replace"]},
                        "target_id": {"type": "string"},
                        "replacement_id": {"type": ["string", "null"]},
                        "confidence": {"type": "number"},
                        "reason_code": {
                            "type": "string",
                            "enum": sorted(_POSITIVE_WALL_REASONS | _FALSE_POSITIVE_REASONS | {"weak_visual_evidence", "other"}),
                        },
                        "evidence": {"type": "string"},
                    },
                    "required": [
                        "action", "target_id", "replacement_id", "confidence",
                        "reason_code", "evidence",
                    ],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["findings"],
        "additionalProperties": False,
    }


def _change_confirmation_schema():
    return {
        "type": "object",
        "properties": {
            "decisions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "change_id": {"type": "string"},
                        "approve": {"type": "boolean"},
                        "confidence": {"type": "number"},
                        "evidence": {"type": "string"},
                    },
                    "required": ["change_id", "approve", "confidence", "evidence"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["decisions"],
        "additionalProperties": False,
    }


def _candidate_bbox(candidate: Dict[str, Any]):
    cl = candidate.get("centerline") or []
    if len(cl) != 2:
        return None
    x1, y1 = map(float, cl[0])
    x2, y2 = map(float, cl[1])
    return min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)


def _bbox_intersects(a, b, margin: float = 0.0) -> bool:
    return not (
        a[2] < b[0] - margin or a[0] > b[2] + margin
        or a[3] < b[1] - margin or a[1] > b[3] + margin
    )


def _build_audit_regions(
    candidates: List[Dict[str, Any]],
    width: int,
    height: int,
    columns: int = 3,
    rows: int = 3,
    overlap: float = 0.14,
    max_targets: int = 42,
) -> List[Dict[str, Any]]:
    """Assign every wall once by midpoint while retaining overlapping context.

    The previous implementation grouped spatially sorted candidates in arbitrary
    batches. A batch could span several rooms, so Luna saw a wide low-detail crop.
    These regions are stable floor-plan tiles with context overlap; dense tiles are
    split without changing the crop.
    """
    valid = [c for c in candidates if c.get("id") and _candidate_bbox(c)]
    regions: List[Dict[str, Any]] = []
    cell_w = float(width) / max(1, columns)
    cell_h = float(height) / max(1, rows)
    pad_x = cell_w * overlap
    pad_y = cell_h * overlap
    for row in range(rows):
        for col in range(columns):
            core = (
                col * cell_w,
                row * cell_h,
                width if col == columns - 1 else (col + 1) * cell_w,
                height if row == rows - 1 else (row + 1) * cell_h,
            )
            crop = (
                max(0.0, core[0] - pad_x),
                max(0.0, core[1] - pad_y),
                min(float(width), core[2] + pad_x),
                min(float(height), core[3] + pad_y),
            )
            targets = []
            for candidate in valid:
                mx, my = _candidate_midpoint(candidate)
                if core[0] <= mx <= core[2] and core[1] <= my <= core[3]:
                    targets.append(candidate)
            if not targets:
                continue
            context = [
                c for c in valid
                if _bbox_intersects(_candidate_bbox(c), crop, margin=8.0)
            ]
            for offset in range(0, len(targets), max_targets):
                regions.append({
                    "id": f"r{row + 1}c{col + 1}-{offset // max_targets + 1}",
                    "crop": crop,
                    "targets": targets[offset:offset + max_targets],
                    "context": context,
                })
    return regions


def _make_region_overlay(
    original: Image.Image,
    region: Dict[str, Any],
    max_side: int,
) -> Image.Image:
    left, top, right, bottom = region["crop"]
    crop = original.crop((int(left), int(top), int(right), int(bottom))).convert("RGB")
    scale = min(1.0, float(max_side) / max(crop.size))
    if scale < 1.0:
        crop = crop.resize(
            (max(1, int(crop.width * scale)), max(1, int(crop.height * scale))),
            Image.Resampling.LANCZOS,
        )
    draw = ImageDraw.Draw(crop)
    target_ids = {str(c.get("id")) for c in region["targets"]}
    for candidate in region["context"]:
        cl = candidate.get("centerline") or []
        if len(cl) != 2:
            continue
        cid = str(candidate.get("id"))
        is_stable = candidate.get("candidate_stage") == "local_final"
        is_target = cid in target_ids
        color = (0, 170, 70) if is_stable else (0, 120, 255)
        p1 = ((float(cl[0][0]) - left) * scale, (float(cl[0][1]) - top) * scale)
        p2 = ((float(cl[1][0]) - left) * scale, (float(cl[1][1]) - top) * scale)
        draw.line([p1, p2], fill=color, width=4 if is_target else 2)
        if is_target:
            mx, my = (p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0
            draw.rectangle((mx - 2, my - 2, mx + 28, my + 10), fill=(255, 255, 255))
            draw.text((mx, my), cid, fill=(190, 0, 0))
    return crop


def _compact_candidate(candidate: Dict[str, Any], width: int, height: int):
    cl = candidate.get("centerline") or [[0, 0], [0, 0]]
    return [
        str(candidate.get("id")),
        candidate.get("candidate_stage") or "local_final",
        round(float(candidate.get("confidence", 0) or 0), 3),
        round(float(cl[0][0]) / width, 5),
        round(float(cl[0][1]) / height, 5),
        round(float(cl[1][0]) / width, 5),
        round(float(cl[1][1]) / height, 5),
    ]


def _parse_structured(raw: Dict[str, Any], array_key: str, label: str) -> Dict[str, Any]:
    status = str(raw.get("status") or "")
    if status and status != "completed":
        raise RuntimeError(f"OpenAI {label} incomplete: status={status}")
    text = extract_response_text(raw).strip()
    if text.startswith("```"):
        lines = text.splitlines()[1:]
        if lines and lines[-1].strip() == "```":
            lines.pop()
        text = "\n".join(lines).strip()
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    parsed = json.loads(text)
    if not isinstance(parsed, dict) or not isinstance(parsed.get(array_key), list):
        raise RuntimeError(f"OpenAI {label} returned no {array_key} array")
    return parsed


def _replacement_is_local(old: Dict[str, Any], new: Dict[str, Any], width: int, height: int) -> bool:
    """A replacement may extend/shift a wall, but cannot jump to another room."""
    old_cl = old.get("centerline") or []
    new_cl = new.get("centerline") or []
    if len(old_cl) != 2 or len(new_cl) != 2:
        return False
    om = _candidate_midpoint(old)
    nm = _candidate_midpoint(new)
    max_shift = max(32.0, math.hypot(width, height) * 0.075)
    if _distance(om, nm) > max_shift:
        return False
    ov = (float(old_cl[1][0]) - float(old_cl[0][0]), float(old_cl[1][1]) - float(old_cl[0][1]))
    nv = (float(new_cl[1][0]) - float(new_cl[0][0]), float(new_cl[1][1]) - float(new_cl[0][1]))
    ol, nl = math.hypot(*ov), math.hypot(*nv)
    if ol < 3 or nl < 3:
        return False
    alignment = abs((ov[0] * nv[0] + ov[1] * nv[1]) / (ol * nl))
    return alignment >= 0.94


def _normalize_audit_findings(
    findings: List[Dict[str, Any]],
    target_ids: set[str],
    candidate_map: Dict[str, Dict[str, Any]],
    width: int,
    height: int,
) -> List[Dict[str, Any]]:
    normalized = []
    seen = set()
    add_min = float(os.getenv("OPENAI_WALL_AUDIT_ADD_CONFIDENCE", "0.94"))
    delete_min = float(os.getenv("OPENAI_WALL_AUDIT_DELETE_CONFIDENCE", "0.98"))
    replace_min = float(os.getenv("OPENAI_WALL_AUDIT_REPLACE_CONFIDENCE", "0.97"))
    for finding in findings or []:
        action = str(finding.get("action") or "")
        target_id = str(finding.get("target_id") or "")
        replacement_id = str(finding.get("replacement_id") or "") or None
        if target_id not in target_ids or target_id not in candidate_map:
            continue
        key = (action, target_id, replacement_id)
        if key in seen:
            continue
        seen.add(key)
        target = candidate_map[target_id]
        confidence = float(finding.get("confidence", 0) or 0)
        reason = str(finding.get("reason_code") or "other")
        valid = False
        if action == "add":
            valid = (
                target.get("candidate_stage") != "local_final"
                and replacement_id is None
                and confidence >= add_min
                and reason in _POSITIVE_WALL_REASONS
            )
        elif action == "delete":
            valid = (
                target.get("candidate_stage") == "local_final"
                and replacement_id is None
                and confidence >= delete_min
                and reason in _FALSE_POSITIVE_REASONS
            )
        elif action == "replace" and replacement_id in candidate_map:
            replacement = candidate_map[replacement_id]
            valid = (
                target.get("candidate_stage") == "local_final"
                and replacement.get("candidate_stage") != "local_final"
                and confidence >= replace_min
                and reason in _POSITIVE_WALL_REASONS
                and _replacement_is_local(target, replacement, width, height)
            )
        if valid:
            item = dict(finding)
            item["target_id"] = target_id
            item["replacement_id"] = replacement_id
            normalized.append(item)
    return normalized


def _dedupe_change_conflicts(changes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """One action per target; prefer replace, then delete, then add."""
    priority = {"replace": 3, "delete": 2, "add": 1}
    best: Dict[str, Dict[str, Any]] = {}
    for change in changes:
        target = str(change.get("target_id"))
        old = best.get(target)
        if old is None or (
            priority.get(str(change.get("action")), 0), float(change.get("confidence", 0))
        ) > (
            priority.get(str(old.get("action")), 0), float(old.get("confidence", 0))
        ):
            best[target] = change
    return list(best.values())


def _make_change_overlay(
    original: Image.Image,
    changes: List[Dict[str, Any]],
    candidate_map: Dict[str, Dict[str, Any]],
    max_side: int,
) -> Image.Image:
    overlay = original.copy().convert("RGB")
    scale = min(1.0, float(max_side) / max(overlay.size))
    if scale < 1.0:
        overlay = overlay.resize(
            (max(1, int(overlay.width * scale)), max(1, int(overlay.height * scale))),
            Image.Resampling.LANCZOS,
        )
    draw = ImageDraw.Draw(overlay)
    for change in changes:
        action = change["action"]
        old = candidate_map.get(change["target_id"])
        new = candidate_map.get(change.get("replacement_id") or change["target_id"])
        if action in {"delete", "replace"} and old:
            cl = old.get("centerline") or []
            if len(cl) == 2:
                pts = [(float(p[0]) * scale, float(p[1]) * scale) for p in cl]
                draw.line(pts, fill=(230, 35, 35), width=5)
        if action in {"add", "replace"} and new:
            cl = new.get("centerline") or []
            if len(cl) == 2:
                pts = [(float(p[0]) * scale, float(p[1]) * scale) for p in cl]
                draw.line(pts, fill=(0, 190, 220), width=5)
        anchor = new or old
        if anchor:
            mx, my = _candidate_midpoint(anchor)
            draw.text((mx * scale + 3, my * scale + 3), change["change_id"], fill=(130, 0, 150))
    return overlay


def audit_yolo_walls_with_openai(
    image_bytes: bytes,
    raw_candidates: List[Dict[str, Any]],
    real_scale: float = 1.0,
    wall_thicknesses: Dict[str, int] | None = None,
    existing_walls: List[Dict[str, Any]] | None = None,
    page_context: Dict[str, Any] | None = None,
    model: str | None = None,
) -> Dict[str, Any]:
    """Audit YOLO region-by-region, then confirm and apply sparse changes.

    The baseline is never reconstructed by the LLM. Model failure, omission, or
    ambiguity returns the original Local-AI/YOLO wall graph unchanged.
    """
    model_name = get_openai_model()
    if model and model.strip() and model.strip() != model_name:
        raise RuntimeError(f"EzeFloor is locked to {model_name}; requested model {model!r} is not allowed")
    original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    width, height = original.size
    timeout_sec = int(os.getenv("OPENAI_WALL_TIMEOUT_SEC", os.getenv("OPENAI_TIMEOUT_SEC", "180")))
    image_max_side = int(os.getenv("OPENAI_WALL_IMAGE_MAX_SIDE", "2048"))
    max_output_tokens = int(os.getenv("OPENAI_WALL_MAX_OUTPUT_TOKENS", "5000"))

    stable = [dict(c) for c in raw_candidates if c.get("candidate_stage") == "local_final" and c.get("id")]
    gaps = [dict(c) for c in raw_candidates if c.get("candidate_stage") != "local_final" and c.get("id")]
    # Backward-compatible safety: if provenance is absent, treat every wall as baseline.
    if not stable:
        stable = [dict(c, candidate_stage="local_final") for c in raw_candidates if c.get("id")]
        gaps = []
    max_gap_candidates = int(os.getenv("OPENAI_WALL_MAX_RAW_CANDIDATES", "320"))
    gaps = _select_gap_candidates(gaps, max_gap_candidates) if gaps else []
    all_candidates = stable + gaps
    candidate_map = {str(c["id"]): c for c in all_candidates}

    columns = max(2, int(os.getenv("OPENAI_WALL_AUDIT_COLUMNS", "3")))
    rows = max(2, int(os.getenv("OPENAI_WALL_AUDIT_ROWS", "3")))
    max_targets = max(12, int(os.getenv("OPENAI_WALL_AUDIT_MAX_TARGETS", "42")))
    regions = _build_audit_regions(all_candidates, width, height, columns, rows, max_targets=max_targets)
    response_format = {
        "type": "json_schema",
        "json_schema": {"name": "ezefloor_regional_wall_audit", "strict": True, "schema": _audit_schema()},
    }
    proposed_changes: List[Dict[str, Any]] = []
    audit_errors: List[str] = []
    reasoning_effort = os.getenv("OPENAI_WALL_REASONING_EFFORT", "medium")
    region_jobs = []

    for region in regions:
        targets = region["targets"]
        target_ids = {str(c["id"]) for c in targets}
        visible_gap_ids = [
            str(c["id"]) for c in region["context"]
            if c.get("candidate_stage") != "local_final"
        ]
        compact = [_compact_candidate(c, width, height) for c in targets]
        overlay = _make_region_overlay(original, region, image_max_side)
        prompt = f"""Audit one local region of an architectural floor plan. YOLO is the baseline, not a draft to redraw.

IMAGE LEGEND
- Green: current YOLO-final walls. They stay unless a specific DELETE or REPLACE finding survives confirmation.
- Blue: alternative/gap candidates produced by YOLO or deterministic wall-band recovery. They are not walls unless specifically ADDed or used as a REPLACEment.
- Red labels identify the target IDs for this audit region.

OUTPUT CONTRACT
- Return only defects requiring a change. An omitted ID means KEEP exactly as-is.
- ADD: target_id must be a blue target; replacement_id must be null.
- DELETE: target_id must be a green target; replacement_id must be null.
- REPLACE: target_id must be a green target and replacement_id must be one visible blue ID.
- Never invent coordinates, IDs, wall type, thickness, or geometry.
- Do not change a wall merely to make endpoints prettier; deterministic snapping handles that.
- Use DELETE only for a clear dimension/annotation, fixture/furniture edge, outside-building line, or duplicate offset.
- Use ADD/REPLACE only where a visible wall band and room/envelope topology both support it.
- Door leaves/arcs and intentional openings are not missing walls. Robes, cabinets, tubs, benches, stairs and sanitary fixtures are not walls.
- Short wet-area returns and robe partitions can be genuine walls. If uncertain, emit no finding.

TARGET_FORMAT=[id,stage,local_confidence,sx,sy,ex,ey]
TARGETS={json.dumps(compact, separators=(',', ':'))}
VISIBLE_REPLACEMENT_IDS={json.dumps(visible_gap_ids, separators=(',', ':'))}
REGION={region['id']}
"""
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a conservative architectural QA auditor. Inspect one region, report only "
                    "high-confidence defects in the YOLO wall graph, and preserve the baseline by default."
                ),
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{_encode_png(overlay, image_max_side)}", "detail": "original"}},
                ],
            },
        ]
        region_jobs.append({
            "region_id": region["id"],
            "target_ids": target_ids,
            "target_count": len(targets),
            "messages": messages,
        })

    def _run_region_job(job: Dict[str, Any]):
        started = time.perf_counter()
        try:
            raw = openai_response(
                messages=job["messages"],
                response_format=response_format,
                temperature=0.0,
                timeout_sec=timeout_sec,
                max_tokens=min(max_output_tokens, max(2400, 180 * job["target_count"])),
                reasoning_effort=reasoning_effort,
            )
            parsed = _parse_structured(raw, "findings", f"regional wall audit {job['region_id']}")
            changes = _normalize_audit_findings(
                parsed["findings"], job["target_ids"], candidate_map, width, height,
            )
            logger.info(
                "Regional wall audit %s finished in %.1fs: %s target(s), %s gated finding(s)",
                job["region_id"], time.perf_counter() - started, job["target_count"], len(changes),
            )
            return changes, None
        except Exception as exc:
            # A failed region contributes no edits. It must never delete or replace
            # the YOLO baseline, nor fail the complete wall-detection request.
            return [], f"{job['region_id']}: {str(exc)[:240]}"

    # Regions are visually and logically independent. Running a small bounded
    # number in parallel removes cumulative network/model latency without changing
    # any audit or confirmation thresholds. Keep the default conservative to avoid
    # rate-limit bursts on lower API tiers.
    concurrency = max(1, min(4, int(os.getenv("OPENAI_WALL_AUDIT_CONCURRENCY", "3"))))
    logger.info(
        "Starting %s regional Luna audit call(s) with concurrency=%s and reasoning=%s",
        len(region_jobs), concurrency, reasoning_effort,
    )
    with ThreadPoolExecutor(max_workers=min(concurrency, max(1, len(region_jobs)))) as executor:
        futures = [executor.submit(_run_region_job, job) for job in region_jobs]
        for future in as_completed(futures):
            changes, error = future.result()
            proposed_changes.extend(changes)
            if error:
                audit_errors.append(error)

    proposed_changes = _dedupe_change_conflicts(proposed_changes)
    for index, change in enumerate(proposed_changes, start=1):
        change["change_id"] = f"C{index:03d}"

    approved_changes: List[Dict[str, Any]] = []
    if proposed_changes:
        change_overlay = _make_change_overlay(original, proposed_changes, candidate_map, image_max_side)
        compact_changes = [
            [
                c["change_id"], c["action"], c["target_id"], c.get("replacement_id"),
                round(float(c.get("confidence", 0)), 3), c.get("reason_code"), c.get("evidence", "")[:180],
            ]
            for c in proposed_changes
        ]
        confirm_prompt = f"""Independently verify these proposed edits against the clean plan and change overlay.
Red geometry is proposed for deletion; cyan geometry is proposed for addition; REPLACE shows both.
Approve only if the edit clearly makes the YOLO wall map more faithful to the architectural plan.
Reject edits based only on labels, line darkness, endpoint neatness, furniture outlines, door arcs, or guesswork.
For DELETE/REPLACE, false deletion is worse than leaving a questionable YOLO wall. When uncertain, reject.
Return exactly one decision per change_id.
CHANGE_FORMAT=[change_id,action,target_id,replacement_id,audit_confidence,reason,evidence]
CHANGES={json.dumps(compact_changes, separators=(',', ':'), ensure_ascii=False)}
"""
        confirmation_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "ezefloor_wall_change_confirmation",
                "strict": True,
                "schema": _change_confirmation_schema(),
            },
        }
        try:
            confirm_raw = openai_response(
                messages=[
                    {"role": "system", "content": "You are the final safety gate for sparse architectural wall edits. Default to rejection unless the visual evidence is decisive."},
                    {"role": "user", "content": [
                        {"type": "text", "text": confirm_prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{_encode_png(original, image_max_side)}", "detail": "original"}},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{_encode_png(change_overlay, image_max_side)}", "detail": "original"}},
                    ]},
                ],
                response_format=confirmation_format,
                temperature=0.0,
                timeout_sec=timeout_sec,
                max_tokens=min(max_output_tokens, max(1800, 140 * len(proposed_changes))),
                reasoning_effort=reasoning_effort,
            )
            confirmation = _parse_structured(confirm_raw, "decisions", "wall change confirmation")
            allowed = {c["change_id"]: c for c in proposed_changes}
            confirmation_min = float(os.getenv("OPENAI_WALL_AUDIT_CONFIRM_CONFIDENCE", "0.96"))
            approved_ids = {
                str(d.get("change_id")) for d in confirmation["decisions"]
                if d.get("approve") is True
                and float(d.get("confidence", 0) or 0) >= confirmation_min
                and str(d.get("change_id")) in allowed
            }
            approved_changes = [allowed[cid] for cid in approved_ids]
        except Exception as exc:
            # No confirmation means no mutation. The caller still receives the
            # complete YOLO baseline and a diagnostic in audit_errors.
            audit_errors.append(f"confirmation: {str(exc)[:240]}")
            approved_changes = []

    deleted_ids = {
        c["target_id"] for c in approved_changes if c["action"] in {"delete", "replace"}
    }
    added_ids = {
        c.get("replacement_id") or c["target_id"]
        for c in approved_changes if c["action"] in {"add", "replace"}
    }
    selected = [c for c in stable if str(c.get("id")) not in deleted_ids]
    selected.extend(candidate_map[cid] for cid in added_ids if cid in candidate_map)

    thicknesses = wall_thicknesses or {"ext": 90, "int": 70, "part": 70}
    px_per_mm = (1.0 / float(real_scale)) if real_scale and float(real_scale) > 0 else 1.0
    walls = []
    for source in selected:
        cl = source.get("centerline") or []
        if len(cl) != 2 or _distance(cl[0], cl[1]) < 3:
            continue
        cls = source.get("class_name") or "interior_wall"
        wall_type = "ext" if cls == "exterior_wall" else ("part" if cls == "partition_wall" else "int")
        thickness_px = max(2.0, float(thicknesses.get(wall_type, 70)) * px_per_mm)
        p1 = [float(cl[0][0]), float(cl[0][1])]
        p2 = [float(cl[1][0]), float(cl[1][1])]
        walls.append({
            **source,
            "id": f"openai_{source.get('id')}",
            "candidate_id": str(source.get("id")),
            "centerline": [p1, p2],
            "polygon": _line_polygon(p1, p2, thickness_px),
            "source": "yolo_baseline_after_regional_audit" if source.get("candidate_stage") == "local_final" else "luna_confirmed_candidate",
            "local_class_name": cls,
            "local_confidence": source.get("confidence"),
        })

    topology_error = None
    try:
        from services.wall_segment_service import (
            _axis_coverage,
            _classify_outermost_walls_by_raycast,
            _dedupe_near_parallel_centerlines,
            _filter_outdoor_whiskers,
            _merge_collinear_walls,
            _orthogonalize_walls,
            _rebuild_wall_geometry,
            _same_band_probe,
            _snap_perpendicular_corners,
            _snap_t_junctions,
        )
        img_np = __import__("numpy").asarray(original)
        baseline_walls = [w for w in walls if w.get("candidate_stage") == "local_final"]
        extras = [w for w in walls if w.get("candidate_stage") != "local_final"]
        extras = _orthogonalize_walls(extras, max_angle_deviation=5.0)
        extras = _merge_collinear_walls(extras, perp_dist_threshold=4.0, gap_threshold=6.0)
        extras = _snap_perpendicular_corners(extras, max_dist_to_corner=12.0)
        extras = _snap_t_junctions(extras, max_dist_to_segment=12.0)
        extras = _dedupe_near_parallel_centerlines(extras)
        extras = [
            extra for extra in extras
            if not any(
                _axis_coverage(extra, stable_wall) >= 0.62
                or _same_band_probe(img_np, stable_wall, extra, min_ratio=0.60) is not None
                for stable_wall in baseline_walls
            )
        ]
        walls = _classify_outermost_walls_by_raycast(baseline_walls + extras, width, height)
        walls = _filter_outdoor_whiskers(walls, width, height)
        walls = _classify_outermost_walls_by_raycast(walls, width, height)
        # Preserve YOLO classes on surviving baseline walls.
        for wall in walls:
            if wall.get("candidate_stage") == "local_final" and wall.get("local_class_name"):
                wall["class_name"] = wall["local_class_name"]
        walls = _rebuild_wall_geometry(walls, real_scale or 1.0, thicknesses)
    except Exception as exc:
        topology_error = str(exc)

    exterior_count = sum(1 for w in walls if w.get("class_name") == "exterior_wall")
    interior_count = len(walls) - exterior_count
    return {
        "status": "success",
        "provider": "openai",
        "model": model_name,
        "audit_mode": "regional_sparse_changes_v2",
        "width": width,
        "height": height,
        "raw_candidate_count": len(raw_candidates),
        "stable_yolo_auto_kept_count": len(stable),
        "gap_candidate_count_sent": len(gaps),
        "audit_region_count": len(regions),
        "audit_concurrency": concurrency,
        "audit_error_count": len(audit_errors),
        "audit_errors": audit_errors,
        "proposed_change_count": len(proposed_changes),
        "approved_change_count": len(approved_changes),
        "approved_changes": approved_changes,
        "deleted_yolo_count": len(deleted_ids),
        "added_candidate_count": len(added_ids),
        "topology_error": topology_error,
        "post_ai_topology_reclassified": True,
        "exterior_count": exterior_count,
        "interior_count": interior_count,
        "walls": walls,
        "count": len(walls),
    }
