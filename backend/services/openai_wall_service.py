import base64
import io
import json
import math
import os
from typing import Any, Dict, List

from PIL import Image, ImageDraw

from services.azure_openai_client import azure_chat_completion, extract_chat_text


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
                    },
                    "required": ["candidate_id", "class_name", "confidence"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["selections"],
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


def _encode_jpeg(img: Image.Image, max_side: int = 1400, quality: int = 78) -> str:
    send = img.convert("RGB")
    if max(send.size) > max_side:
        r = max_side / max(send.size)
        send = send.resize((max(1, int(send.width * r)), max(1, int(send.height * r))))
    b = io.BytesIO()
    send.save(b, format="JPEG", quality=quality, optimize=True)
    return base64.b64encode(b.getvalue()).decode("ascii")


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
    deployment = (model or os.getenv("AZURE_OPENAI_DEPLOYMENT", "")).strip() or None
    timeout_sec = int(os.getenv("AZURE_OPENAI_WALL_TIMEOUT_SEC", "180"))
    max_candidates = int(os.getenv("AZURE_OPENAI_WALL_MAX_RAW_CANDIDATES", "160"))
    image_max_side = int(os.getenv("AZURE_OPENAI_WALL_IMAGE_MAX_SIDE", "1400"))
    image_quality = int(os.getenv("AZURE_OPENAI_WALL_IMAGE_QUALITY", "78"))
    current_limit = int(os.getenv("AZURE_OPENAI_WALL_MAX_CURRENT_WALLS", "80"))
    max_output_tokens = int(os.getenv("AZURE_OPENAI_WALL_MAX_OUTPUT_TOKENS", "5000"))

    original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    ow, oh = original.size
    candidates = sorted(raw_candidates, key=lambda x: float(x.get("confidence", 0)), reverse=True)[:max_candidates]
    candidate_map = {str(c.get("id")): c for c in candidates if c.get("id")}
    overlay = _make_overlay(original, candidates, image_max_side)

    # Compact tuple format drastically reduces input tokens:
    # [id, local_class, local_confidence, sx, sy, ex, ey]
    compact = []
    for c in candidates:
        cl = c.get("centerline") or [[0, 0], [0, 0]]
        compact.append([
            c.get("id"),
            c.get("class_name"),
            round(float(c.get("confidence", 0)), 3),
            round(cl[0][0] / ow, 4),
            round(cl[0][1] / oh, 4),
            round(cl[1][0] / ow, 4),
            round(cl[1][1] / oh, 4),
        ])

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

    page_context_text = json.dumps(page_context or {}, separators=(",", ":"), ensure_ascii=False)
    if len(page_context_text) > 3500:
        page_context_text = page_context_text[:3500] + "..."

    prompt = f"""You are the architectural reasoning stage in EzeFloor wall extraction.
The BLUE overlay lines are wall candidates produced by EzeFloor Local AI. Use them as the geometry source and review/classify/select them from the drawing.
You MUST NOT invent coordinates or new wall segments. Select only candidate IDs from the supplied list.

Rules:
- YOLO/local geometry is the primary detector; you are a support/review layer.
- Prefer visible thick wall bands / paired wall edges, not annotation lines.
- Ignore dimensions, leaders, text, grids, cabinetry, furniture, electrical symbols/wiring, hatch, door swing arcs and roof/eave dashed lines.
- Preserve short nib walls and real T/L junctions.
- Do not bridge visible door/opening gaps unless the candidate genuinely represents the wall centerline through an opening that EzeFloor will later cut by door geometry.
- Exterior = building envelope; interior = internal partition. Touching the envelope alone does NOT make a wall exterior.
- Local class/confidence is only a hint. Correct it when visual/topological evidence disagrees.
- If uncertain, reject the candidate rather than hallucinate.
- Return a COMPLETE selection of valid candidate IDs, not merely the mistakes.
- Keep output compact: candidate_id + class_name + confidence only.

RAW_CANDIDATES_FORMAT=[id,local_class,local_confidence,sx,sy,ex,ey]
RAW_CANDIDATES={json.dumps(compact, separators=(',', ':'))}
CURRENT_CANVAS_WALLS_FORMAT=[class,sx,sy,ex,ey]
CURRENT_CANVAS_WALLS={json.dumps(current_context, separators=(',', ':'))}
PAGE_CONTEXT={page_context_text}
"""

    messages = [
        {
            "role": "system",
            "content": "You are the EzeFloor architectural wall-review support model. Local YOLO geometry is primary; never invent wall geometry.",
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {
                        # Overlay already contains the original drawing, so a second
                        # high-detail image only doubles image-token usage.
                        "url": f"data:image/jpeg;base64,{_encode_jpeg(overlay, image_max_side, image_quality)}",
                        "detail": "high",
                    },
                },
            ],
        },
    ]
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "ezefloor_wall_review",
            "strict": True,
            "schema": _schema(),
        },
    }

    raw = azure_chat_completion(
        messages=messages,
        response_format=response_format,
        temperature=0.05,
        timeout_sec=timeout_sec,
        deployment=deployment,
        max_tokens=max_output_tokens,
    )

    try:
        parsed = json.loads(extract_chat_text(raw))
    except Exception as exc:
        raise RuntimeError("Azure OpenAI returned invalid structured wall response") from exc

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
        cls = item.get("class_name") or src.get("class_name") or "interior_wall"
        wt = "ext" if cls == "exterior_wall" else ("part" if cls == "partition_wall" else "int")
        mm = thicknesses.get(wt, thicknesses.get("int", 70))
        tpx = max(2.0, float(mm) * px_per_mm)
        p1 = [float(cl[0][0]), float(cl[0][1])]
        p2 = [float(cl[1][0]), float(cl[1][1])]
        walls.append({
            "id": f"azure_openai_{cid}",
            "candidate_id": cid,
            "class_name": cls,
            "centerline": [p1, p2],
            "polygon": _line_polygon(p1, p2, tpx),
            "confidence": float(item.get("confidence", src.get("confidence", 0.5))),
            "reason": "",
            "source": "azure_openai_raw_candidate_review",
            "local_class_name": src.get("class_name"),
            "local_confidence": src.get("confidence"),
        })

    return {
        "status": "success",
        "provider": "azure_openai",
        "deployment": deployment or os.getenv("AZURE_OPENAI_DEPLOYMENT", ""),
        "width": ow,
        "height": oh,
        "local_candidate_count": len(raw_candidates),
        "raw_candidate_count": len(raw_candidates),
        "candidate_count_sent": len(candidates),
        "walls": walls,
        "count": len(walls),
    }
