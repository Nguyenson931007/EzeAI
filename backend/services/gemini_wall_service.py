import base64
import io
import json
import math
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List

from PIL import Image, ImageDraw

from app.config import GEMINI_API_URL


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
            "selections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "candidate_id": {"type": "string"},
                        "class_name": {
                            "type": "string",
                            "enum": ["exterior_wall", "interior_wall", "partition_wall", "block_wall"],
                        },
                        "confidence": {"type": "number"},
                        "reason": {"type": "string"},
                    },
                    "required": ["candidate_id", "class_name", "confidence"],
                },
            }
        },
        "required": ["selections"],
    }


def _make_overlay(original: Image.Image, candidates: List[Dict[str, Any]]) -> Image.Image:
    overlay = original.copy().convert("RGB")
    draw = ImageDraw.Draw(overlay)
    sx = min(1.0, 2048.0 / max(overlay.size))
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
        mx, my = (p1[0]+p2[0])/2, (p1[1]+p2[1])/2
        draw.text((mx+2, my+2), str(c.get("id", "")), fill=(220, 0, 0))
    return overlay


def _encode_jpeg(img: Image.Image, max_side: int = 2048) -> str:
    send = img.convert("RGB")
    if max(send.size) > max_side:
        r = max_side / max(send.size)
        send = send.resize((max(1, int(send.width*r)), max(1, int(send.height*r))))
    b = io.BytesIO()
    send.save(b, format="JPEG", quality=90, optimize=True)
    return base64.b64encode(b.getvalue()).decode("ascii")


def review_raw_candidates_with_gemini(
    image_bytes: bytes,
    raw_candidates: List[Dict[str, Any]],
    real_scale: float = 1.0,
    wall_thicknesses: Dict[str, int] | None = None,
    existing_walls: List[Dict[str, Any]] | None = None,
    page_context: Dict[str, Any] | None = None,
    model: str | None = None,
) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    model = (model or os.getenv("GEMINI_WALL_MODEL", "gemini-2.5-pro")).strip()
    timeout_sec = int(os.getenv("GEMINI_WALL_TIMEOUT_SEC", "180"))
    max_candidates = int(os.getenv("GEMINI_WALL_MAX_RAW_CANDIDATES", "450"))

    original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    ow, oh = original.size
    candidates = sorted(raw_candidates, key=lambda x: float(x.get("confidence", 0)), reverse=True)[:max_candidates]
    candidate_map = {str(c.get("id")): c for c in candidates if c.get("id")}
    overlay = _make_overlay(original, candidates)

    compact = []
    for c in candidates:
        cl = c.get("centerline") or [[0,0],[0,0]]
        compact.append({
            "id": c.get("id"),
            "local_class": c.get("class_name"),
            "local_confidence": round(float(c.get("confidence", 0)), 3),
            "start": [round(cl[0][0]/ow, 5), round(cl[0][1]/oh, 5)],
            "end": [round(cl[1][0]/ow, 5), round(cl[1][1]/oh, 5)],
        })

    current_context = []
    for w in (existing_walls or [])[:300]:
        cl = w.get("centerline") or []
        if len(cl) == 2:
            current_context.append({
                "class_name": w.get("class_name") or w.get("wall_type"),
                "start": [round(float(cl[0][0])/ow,5), round(float(cl[0][1])/oh,5)],
                "end": [round(float(cl[1][0])/ow,5), round(float(cl[1][1])/oh,5)],
            })

    prompt = f"""You are the architectural reasoning stage in EzeFloor wall extraction.
The BLUE overlay lines are RAW local-YOLO wall candidates captured BEFORE any merge, semantic split, exterior-boundary filter, or final NMS.
You MUST NOT invent coordinates or new wall segments. Select only candidate IDs from the supplied list.

Use the original drawing plus your architectural reasoning to decide which candidates are real architectural walls.
Rules:
- Prefer visible thick wall bands / paired wall edges, not single annotation lines.
- Ignore dimensions, leaders, text, grids, cabinetry, furniture, electrical symbols/wiring, hatch, door swing arcs and roof/eave dashed lines.
- Preserve short nib walls and real T/L junctions.
- Do not bridge visible door/opening gaps unless the candidate genuinely represents the wall centerline through an opening that EzeFloor will later cut by door geometry.
- Exterior = building envelope; interior = internal partition. Touching the envelope alone does NOT make a wall exterior.
- The local class/confidence is only a hint. Correct it when visual/topological evidence disagrees.
- If uncertain, reject the candidate rather than hallucinate.
- Return a COMPLETE selection of valid candidate IDs, not merely the mistakes.

RAW_CANDIDATES={json.dumps(compact, separators=(',', ':'))}
CURRENT_CANVAS_WALLS={json.dumps(current_context, separators=(',', ':'))}
PAGE_CONTEXT={json.dumps(page_context or {}, separators=(',', ':'))}
"""

    payload = {
        "contents": [{"parts": [
            {"inlineData": {"mimeType": "image/jpeg", "data": _encode_jpeg(original)}},
            {"inlineData": {"mimeType": "image/jpeg", "data": _encode_jpeg(overlay)}},
            {"text": prompt},
        ]}],
        "generationConfig": {
            "temperature": 0.05,
            "responseMimeType": "application/json",
            "responseSchema": _schema(),
        },
    }
    req = urllib.request.Request(
        GEMINI_API_URL.format(model=model),
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type":"application/json", "x-goog-api-key":api_key},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini API HTTP {exc.code}: {body[:1600]}") from exc
    except Exception as exc:
        raise RuntimeError(f"Gemini API request failed: {exc}") from exc

    try:
        parsed = json.loads(raw["candidates"][0]["content"]["parts"][0]["text"])
    except Exception as exc:
        raise RuntimeError("Gemini returned invalid structured response") from exc

    thicknesses = wall_thicknesses or {"ext":90,"int":70,"part":70}
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
        cls = item.get("class_name") or src.get("class_name") or "interior_wall"
        wt = "ext" if cls == "exterior_wall" else ("part" if cls == "partition_wall" else "int")
        mm = thicknesses.get(wt, thicknesses.get("int",70))
        tpx = max(2.0, float(mm) * px_per_mm)
        p1 = [float(cl[0][0]), float(cl[0][1])]
        p2 = [float(cl[1][0]), float(cl[1][1])]
        walls.append({
            "id": f"gemini_{cid}",
            "candidate_id": cid,
            "class_name": cls,
            "centerline": [p1,p2],
            "polygon": _line_polygon(p1,p2,tpx),
            "confidence": float(item.get("confidence", src.get("confidence",0.5))),
            "reason": item.get("reason", ""),
            "source": "gemini_raw_candidate_review",
            "local_class_name": src.get("class_name"),
            "local_confidence": src.get("confidence"),
        })

    return {
        "status":"success", "provider":"gemini", "model":model,
        "width":ow, "height":oh,
        "raw_candidate_count":len(raw_candidates),
        "candidate_count_sent":len(candidates),
        "walls":walls, "count":len(walls),
    }

# Backward-compatible name used by older imports.
def rebuild_walls_with_gemini(*args, **kwargs):
    raw_candidates = kwargs.pop("raw_candidates", None)
    if raw_candidates is None:
        raise RuntimeError("Gemini wall review now requires raw_candidates from WallSegmentService.predict_raw_candidates")
    return review_raw_candidates_with_gemini(raw_candidates=raw_candidates, *args, **kwargs)
