"""Gemini wall reconstruction service.

Experimental second-pass wall reconstruction. It does not replace the local wall
pipeline automatically; callers must explicitly choose Gemini.
"""
from __future__ import annotations

import base64
import io
import json
import math
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List

from PIL import Image

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _clamp01(value: Any) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except Exception:
        return 0.0


def _distance(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _snap_endpoints(walls: List[Dict[str, Any]], tolerance_px: float = 10.0) -> None:
    """Snap near endpoints only; never changes semantic wall class."""
    endpoints = []
    for wi, wall in enumerate(walls):
        endpoints.append((wi, 0, wall["centerline"][0]))
        endpoints.append((wi, 1, wall["centerline"][1]))

    visited = set()
    for i, (wi, ei, p) in enumerate(endpoints):
        if i in visited:
            continue
        cluster = [i]
        for j in range(i + 1, len(endpoints)):
            if _distance(p, endpoints[j][2]) <= tolerance_px:
                cluster.append(j)
        if len(cluster) < 2:
            continue
        xs = [endpoints[k][2][0] for k in cluster]
        ys = [endpoints[k][2][1] for k in cluster]
        target = [sum(xs) / len(xs), sum(ys) / len(ys)]
        for k in cluster:
            cwi, cei, _ = endpoints[k]
            walls[cwi]["centerline"][cei] = target[:]
            visited.add(k)


def _dedupe(walls: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Conservative duplicate removal for almost-identical lines of same class."""
    kept: List[Dict[str, Any]] = []
    for wall in sorted(walls, key=lambda w: float(w.get("confidence", 0.0)), reverse=True):
        a1, a2 = wall["centerline"]
        duplicate = False
        for other in kept:
            if other.get("class_name") != wall.get("class_name"):
                continue
            b1, b2 = other["centerline"]
            same_dir = _distance(a1, b1) <= 12 and _distance(a2, b2) <= 12
            rev_dir = _distance(a1, b2) <= 12 and _distance(a2, b1) <= 12
            if same_dir or rev_dir:
                duplicate = True
                break
        if not duplicate:
            kept.append(wall)
    return kept


def _line_polygon(p1, p2, thickness_px: float):
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


def _response_schema() -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "walls": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "class_name": {
                            "type": "string",
                            "enum": ["exterior_wall", "interior_wall", "partition_wall", "block_wall"],
                        },
                        "start": {
                            "type": "array",
                            "items": {"type": "number", "minimum": 0, "maximum": 1},
                            "minItems": 2,
                            "maxItems": 2,
                        },
                        "end": {
                            "type": "array",
                            "items": {"type": "number", "minimum": 0, "maximum": 1},
                            "minItems": 2,
                            "maxItems": 2,
                        },
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "reason": {"type": "string"},
                    },
                    "required": ["class_name", "start", "end", "confidence"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["walls"],
        "additionalProperties": False,
    }


def rebuild_walls_with_gemini(
    image_bytes: bytes,
    real_scale: float = 1.0,
    wall_thicknesses: Dict[str, int] | None = None,
    model: str | None = None,
) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured in the project .env file")

    model = (model or os.getenv("GEMINI_WALL_MODEL", "gemini-2.5-flash")).strip()
    max_side = int(os.getenv("GEMINI_WALL_MAX_SIDE", "2048"))
    timeout_sec = int(os.getenv("GEMINI_WALL_TIMEOUT_SEC", "120"))

    original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    orig_w, orig_h = original.size
    send_img = original.copy()
    if max(send_img.size) > max_side:
        ratio = max_side / max(send_img.size)
        send_img = send_img.resize((max(1, int(send_img.width * ratio)), max(1, int(send_img.height * ratio))))

    encoded = io.BytesIO()
    send_img.save(encoded, format="JPEG", quality=88, optimize=True)
    b64 = base64.b64encode(encoded.getvalue()).decode("ascii")

    prompt = """
You are reconstructing architectural wall centerlines from a residential floor plan.
Return ONLY walls that are visibly supported by the drawing.

Rules:
- Detect architectural walls only. Ignore dimensions, text, furniture, cabinetry, electrical symbols, door swing arcs, windows symbols, roof/eave dashed lines and hatching.
- Preserve wall openings. Do not draw a continuous wall across a visible doorway/opening.
- Preserve short nib walls, T junctions and L junctions.
- Exterior walls are normally perimeter/building-envelope walls; interior walls are internal partitions.
- Do not classify a wall as exterior merely because it touches an exterior wall.
- start/end coordinates MUST be normalized to [0,1] relative to this exact image, origin top-left.
- Each returned item is a wall CENTERLINE segment, not a polygon.
- Prefer one clean segment per straight continuous run. Split only at real corners, junction changes, or openings.
- If uncertain, omit rather than invent.
""".strip()

    payload = {
        "contents": [{
            "parts": [
                {"inlineData": {"mimeType": "image/jpeg", "data": b64}},
                {"text": prompt},
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json",
            "responseSchema": _response_schema(),
        },
    }

    request = urllib.request.Request(
        GEMINI_API_URL.format(model=model),
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout_sec) as response:
            raw_response = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini API HTTP {exc.code}: {body[:1200]}") from exc
    except Exception as exc:
        raise RuntimeError(f"Gemini API request failed: {exc}") from exc

    try:
        text = raw_response["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
    except Exception as exc:
        raise RuntimeError("Gemini returned an invalid structured response") from exc

    thicknesses = wall_thicknesses or {"ext": 90, "int": 70, "part": 70}
    px_per_mm = (1.0 / float(real_scale)) if real_scale and float(real_scale) > 0 else 1.0

    result_walls: List[Dict[str, Any]] = []
    for idx, item in enumerate(parsed.get("walls") or []):
        start = item.get("start") or [0, 0]
        end = item.get("end") or [0, 0]
        p1 = [_clamp01(start[0]) * orig_w, _clamp01(start[1]) * orig_h]
        p2 = [_clamp01(end[0]) * orig_w, _clamp01(end[1]) * orig_h]
        if _distance(p1, p2) < 8:
            continue

        cls = item.get("class_name") or "interior_wall"
        wall_type = "ext" if cls == "exterior_wall" else ("part" if cls == "partition_wall" else ("block" if cls == "block_wall" else "int"))
        thickness_mm = thicknesses.get(wall_type, thicknesses.get("int", 70))
        thickness_px = max(2.0, float(thickness_mm) * px_per_mm)
        result_walls.append({
            "id": f"gemini_wall_{idx}",
            "class_name": cls,
            "centerline": [p1, p2],
            "polygon": _line_polygon(p1, p2, thickness_px),
            "confidence": float(item.get("confidence", 0.5)),
            "reason": item.get("reason", ""),
            "source": "gemini_wall_rebuild",
        })

    result_walls = _dedupe(result_walls)
    _snap_endpoints(result_walls, tolerance_px=float(os.getenv("GEMINI_WALL_SNAP_PX", "10")))
    for wall in result_walls:
        cls = wall["class_name"]
        wall_type = "ext" if cls == "exterior_wall" else ("part" if cls == "partition_wall" else ("block" if cls == "block_wall" else "int"))
        thickness_mm = thicknesses.get(wall_type, thicknesses.get("int", 70))
        thickness_px = max(2.0, float(thickness_mm) * px_per_mm)
        wall["polygon"] = _line_polygon(wall["centerline"][0], wall["centerline"][1], thickness_px)

    return {
        "status": "success",
        "provider": "gemini",
        "model": model,
        "width": orig_w,
        "height": orig_h,
        "walls": result_walls,
        "count": len(result_walls),
    }
