"""Plan-level AI review for walls, openings and unmapped drawing fields.

Local YOLO/OCR stays authoritative for geometry. The vision model reviews a
low-threshold candidate pool, can reclassify/remove candidates, and can extract
semantic values that are not yet mapped into EzeFloor forms.
"""
from __future__ import annotations

import base64
import io
import json
import os
from typing import Any, Dict, Iterable, List, Optional, Tuple

from PIL import Image, ImageDraw

from services.vision_ai_client import current_provider, vision_chat_completion, vision_extract_text


WALL_CLASSES = ["exterior_wall", "interior_wall", "partition_wall", "block_wall"]
OPENING_TYPES = ["door", "window"]


def _image_b64(image: Image.Image, max_side: int = 2000, quality: int = 86) -> str:
    img = image.convert("RGB")
    if max(img.size) > max_side:
        ratio = max_side / max(img.size)
        img = img.resize((max(1, int(img.width * ratio)), max(1, int(img.height * ratio))))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=quality, optimize=True)
    return base64.b64encode(out.getvalue()).decode("ascii")


def _point_xy(value: Any) -> Optional[Tuple[float, float]]:
    if isinstance(value, dict) and "x" in value and "y" in value:
        return float(value["x"]), float(value["y"])
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return float(value[0]), float(value[1])
    return None


def _draw_candidates(image: Image.Image, walls: List[dict], doors: List[dict], windows: List[dict]) -> Image.Image:
    overlay = image.convert("RGB").copy()
    draw = ImageDraw.Draw(overlay)

    for idx, wall in enumerate(walls):
        wall.setdefault("_ai_candidate_id", f"W{idx + 1:04d}")
        centerline = wall.get("centerline") or []
        if len(centerline) >= 2:
            p1, p2 = _point_xy(centerline[0]), _point_xy(centerline[1])
            if p1 and p2:
                draw.line([p1, p2], fill=(0, 110, 255), width=4)
                mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
                draw.text((mx + 3, my + 3), wall["_ai_candidate_id"], fill=(210, 0, 0))

    for prefix, items, color in (("D", doors, (0, 170, 0)), ("O", windows, (180, 90, 0))):
        for idx, item in enumerate(items):
            item.setdefault("_ai_candidate_id", f"{prefix}{idx + 1:04d}")
            bbox = item.get("bbox") or []
            if len(bbox) >= 4:
                x1, y1, x2, y2 = map(float, bbox[:4])
                draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
                draw.text((x1 + 2, y1 + 2), item["_ai_candidate_id"], fill=color)
            else:
                poly = item.get("polygon") or []
                pts = [_point_xy(p) for p in poly]
                pts = [p for p in pts if p]
                if len(pts) >= 3:
                    draw.line(pts + [pts[0]], fill=color, width=3)
                    draw.text((pts[0][0] + 2, pts[0][1] + 2), item["_ai_candidate_id"], fill=color)
    return overlay


def _compact_wall(wall: dict) -> dict:
    return {
        "candidate_id": wall.get("_ai_candidate_id"),
        "class_name": wall.get("class_name"),
        "confidence": wall.get("confidence"),
        "centerline": wall.get("centerline"),
        "source": wall.get("source"),
    }


def _compact_opening(item: dict) -> dict:
    return {
        "candidate_id": item.get("_ai_candidate_id"),
        "object_type": item.get("type"),
        "class_name": item.get("class") or item.get("class_name"),
        "confidence": item.get("confidence"),
        "bbox": item.get("bbox"),
        "ocr_text": item.get("ocr_text") or item.get("text"),
        "width_mm": item.get("width_mm") or item.get("detected_width_mm"),
    }


def _response_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "confidence": {"type": "number"},
            "wall_decisions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "candidate_id": {"type": "string"},
                        "decision": {"type": "string", "enum": ["keep", "remove", "review"]},
                        "class_name": {"type": "string", "enum": WALL_CLASSES},
                        "confidence": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["candidate_id", "decision", "class_name", "confidence", "reason"],
                    "additionalProperties": False,
                },
            },
            "opening_decisions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "candidate_id": {"type": "string"},
                        "decision": {"type": "string", "enum": ["keep", "remove", "review"]},
                        "object_type": {"type": "string", "enum": OPENING_TYPES},
                        "class_name": {"type": "string"},
                        "confidence": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["candidate_id", "decision", "object_type", "class_name", "confidence", "reason"],
                    "additionalProperties": False,
                },
            },
            "discovered_fields": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string"},
                        "label": {"type": "string"},
                        "value": {"type": "string"},
                        "unit": {"type": "string"},
                        "suggested_task": {"type": "string"},
                        "suggested_field": {"type": "string"},
                        "mapping_status": {"type": "string", "enum": ["mapped", "unmapped", "ambiguous"]},
                        "evidence": {"type": "string"},
                        "confidence": {"type": "number"},
                    },
                    "required": ["key", "label", "value", "unit", "suggested_task", "suggested_field", "mapping_status", "evidence", "confidence"],
                    "additionalProperties": False,
                },
            },
            "missing_objects": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "object_type": {"type": "string", "enum": ["wall", "door", "window", "other"]},
                        "description": {"type": "string"},
                        "region": {"type": "string"},
                        "confidence": {"type": "number"},
                    },
                    "required": ["object_type", "description", "region", "confidence"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["summary", "confidence", "wall_decisions", "opening_decisions", "discovered_fields", "missing_objects"],
        "additionalProperties": False,
    }


SYSTEM_PROMPT = """You are the EzeFloor plan review engine.

GOAL
Review a residential/construction floor plan after local YOLO/OCR has produced a LOW-THRESHOLD candidate pool. Improve precision and semantic understanding without inventing geometry.

RULES
- Candidate geometry comes only from EzeFloor. Never create replacement coordinates.
- For every supplied wall/opening candidate, decide keep, remove, or review. Reclassify when drawing evidence is clear.
- Door swing arcs, dimension lines, text, furniture, cabinetry, hatches and electrical symbols are not walls.
- Distinguish doors vs windows using symbol shape, swing/sliding conventions, nearby labels and schedule/legend context.
- If the drawing contains a likely wall/door/window that is absent from the supplied candidates, put it in missing_objects. Describe the region in human-readable terms only; do NOT fabricate coordinates.
- Extract useful plan facts even if EzeFloor does not yet have a mapped form field: ceiling heights, wall heights, door tags, window tags, construction notes, material/type labels, room notes, dimensions and similar takeoff-relevant fields.
- Compare extracted facts against known_form_schemas. If an exact supplied field exists, mapping_status=mapped and suggest it. Otherwise mapping_status=unmapped or ambiguous.
- Never invent product codes/SKUs/database IDs.
- Return JSON only.
"""


def review_plan_with_ai(
    *,
    image_bytes: bytes,
    walls: List[dict],
    doors: List[dict],
    windows: List[dict],
    known_form_schemas: Optional[Dict[str, Any]] = None,
    page_context: Optional[Dict[str, Any]] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    overlay = _draw_candidates(image, walls, doors, windows)

    timeout = int(os.getenv("OPENAI_PLAN_TIMEOUT_SEC", os.getenv("OPENAI_TIMEOUT_SEC", "180")))

    evidence = {
        "page_context": page_context or {},
        "known_form_schemas": known_form_schemas or {},
        "wall_candidates": [_compact_wall(w) for w in walls],
        "door_candidates": [_compact_opening(d) for d in doors],
        "window_candidates": [_compact_opening(w) for w in windows],
    }

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": json.dumps(evidence, ensure_ascii=False)},
                {"type": "text", "text": "Original plan:"},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{_image_b64(image)}"}},
                {"type": "text", "text": "Candidate overlay with IDs:"},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{_image_b64(overlay)}"}},
            ],
        },
    ]
    response_format = {
        "type": "json_schema",
        "json_schema": {"name": "ezefloor_plan_review", "strict": True, "schema": _response_schema()},
    }
    raw = vision_chat_completion(
        messages=messages,
        response_format=response_format,
        temperature=0.02,
        timeout_sec=timeout,
        model=model,
    )
    parsed = json.loads(vision_extract_text(raw))

    wall_map = {w.get("_ai_candidate_id"): w for w in walls}
    opening_map = {x.get("_ai_candidate_id"): x for x in [*doors, *windows]}

    reviewed_walls: List[dict] = []
    review_queue: List[dict] = []
    for d in parsed.get("wall_decisions") or []:
        src = wall_map.get(d.get("candidate_id"))
        if not src:
            continue
        item = dict(src)
        item.pop("_ai_candidate_id", None)
        item["class_name"] = d.get("class_name") or item.get("class_name")
        item["ai_review"] = d
        item["source"] = "local_yolo+vision_review"
        if d.get("decision") == "keep":
            reviewed_walls.append(item)
        elif d.get("decision") == "review":
            review_queue.append({"kind": "wall", "candidate": item, "decision": d})

    reviewed_doors: List[dict] = []
    reviewed_windows: List[dict] = []
    for d in parsed.get("opening_decisions") or []:
        src = opening_map.get(d.get("candidate_id"))
        if not src:
            continue
        item = dict(src)
        item.pop("_ai_candidate_id", None)
        item["type"] = d.get("object_type") or item.get("type")
        if d.get("class_name"):
            item["class"] = d["class_name"]
        item["ai_review"] = d
        item["source"] = "local_yolo+vision_review"
        if d.get("decision") == "keep":
            (reviewed_windows if item.get("type") == "window" else reviewed_doors).append(item)
        elif d.get("decision") == "review":
            review_queue.append({"kind": "opening", "candidate": item, "decision": d})

    return {
        "status": "success",
        "provider": current_provider(),
        "model": "gpt-5.6-luna",
        "width": image.width,
        "height": image.height,
        "summary": parsed.get("summary", ""),
        "confidence": parsed.get("confidence", 0),
        "walls": reviewed_walls,
        "doors": reviewed_doors,
        "windows": reviewed_windows,
        "review_queue": review_queue,
        "discovered_fields": parsed.get("discovered_fields") or [],
        "unmapped_fields": [x for x in (parsed.get("discovered_fields") or []) if x.get("mapping_status") != "mapped"],
        "missing_objects": parsed.get("missing_objects") or [],
        "raw_decisions": {
            "wall_decisions": parsed.get("wall_decisions") or [],
            "opening_decisions": parsed.get("opening_decisions") or [],
        },
    }
