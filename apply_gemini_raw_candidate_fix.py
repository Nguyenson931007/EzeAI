from pathlib import Path
import re, shutil, sys, textwrap, time

ROOT = Path(r'D:\JobDevNova\EzeFloor') if sys.platform.startswith('win') else Path.cwd()
if len(sys.argv) > 1:
    ROOT = Path(sys.argv[1]).resolve()

backend = ROOT / 'backend'
frontend = ROOT / 'frontend_next'
files = {
    'wall': backend / 'services' / 'wall_segment_service.py',
    'gemini': backend / 'services' / 'gemini_wall_service.py',
    'routes': backend / 'api' / 'routes.py',
    'api': frontend / 'src' / 'models' / 'api.service.js',
    'controller': frontend / 'src' / 'controllers' / 'ai.controller.js',
}
for k,p in files.items():
    if not p.exists():
        raise SystemExit(f'Missing {k}: {p}')

stamp = time.strftime('%Y%m%d_%H%M%S')
backup_dir = ROOT / f'_gemini_raw_candidate_backup_{stamp}'
backup_dir.mkdir(parents=True, exist_ok=True)
for p in files.values():
    dst = backup_dir / p.relative_to(ROOT)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dst)

# 1) Add a RAW-YOLO candidate method. It deliberately stops BEFORE mixed split,
# merge, boundary filter and final NMS.
wall_path = files['wall']
wall = wall_path.read_text(encoding='utf-8-sig')
method = r'''
    @staticmethod
    def predict_raw_candidates(
        image_bytes: bytes,
        confidence: float = 0.001,
        imgsz: int = 1280,
        real_scale: float = 1.0,
        filename: str = "plan.png",
        wall_thicknesses: Dict[str, int] = None,
    ) -> dict:
        """Return raw YOLO wall candidates before any destructive post-processing.

        Gemini review MUST use this method, not predict()/predict_stream(), because
        those paths may split semantic classes, merge runs, remove walls by the
        exterior-boundary heuristic and run final NMS.
        """
        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cpu" and torch.get_num_threads() > 4:
            torch.set_num_threads(4)
        if device == "cpu" and imgsz > 1280:
            imgsz = 1280

        confidence = float(confidence * 0.5)
        model = _get_model()
        img_original = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_w, img_h = img_original.size
        img_np = np.array(img_original)

        if img_w >= img_h:
            inference_width = imgsz
            inference_height = max(1, int(imgsz * img_h / img_w))
        else:
            inference_height = imgsz
            inference_width = max(1, int(imgsz * img_w / img_h))
        img_inference = img_original.resize((inference_width, inference_height))

        detected_walls = _run_yolo_inference(
            model, img_inference, img_w, img_h,
            inference_width, inference_height, img_np,
            confidence, imgsz, device, real_scale, model_label="best"
        )

        # Optional ensemble is allowed, but NO semantic split or geometric filters.
        last_model = _get_last_model()
        if last_model is not None:
            detected_last = _run_yolo_inference(
                last_model, img_inference, img_w, img_h,
                inference_width, inference_height, img_np,
                confidence, imgsz, device, real_scale, model_label="last"
            )
            detected_walls = _merge_ensemble_walls(detected_walls, detected_last)

        wt = wall_thicknesses or {}
        candidates = []
        for idx, w in enumerate(detected_walls):
            c = w.get("centerline")
            if not c or len(c) != 2:
                continue
            p1, p2 = c[0], c[1]
            dx, dy = p2[0] - p1[0], p2[1] - p1[1]
            length = math.hypot(dx, dy)
            if length < 3:
                continue
            cls = w.get("class_name", "interior_wall")
            if cls == "exterior_wall":
                thickness_mm = wt.get("ext", 90)
            elif cls == "partition_wall":
                thickness_mm = wt.get("part", 70)
            else:
                thickness_mm = wt.get("int", 70)
            thickness_px = float(thickness_mm) / real_scale if real_scale and real_scale != 1.0 else (20.0 if cls == "exterior_wall" else 15.0)
            ux, uy = dx / length, dy / length
            nx, ny = -uy, ux
            d = thickness_px / 2.0
            polygon = [
                [round(p1[0] + d * nx, 1), round(p1[1] + d * ny, 1)],
                [round(p2[0] + d * nx, 1), round(p2[1] + d * ny, 1)],
                [round(p2[0] - d * nx, 1), round(p2[1] - d * ny, 1)],
                [round(p1[0] - d * nx, 1), round(p1[1] - d * ny, 1)],
            ]
            candidates.append({
                "id": f"raw_{idx+1:04d}",
                "class_name": cls,
                "confidence": float(w.get("confidence", 0.0)),
                "centerline": [[float(p1[0]), float(p1[1])], [float(p2[0]), float(p2[1])]],
                "polygon": polygon,
                "thickness": thickness_mm,
                "thickness_px": thickness_px,
                "source": "raw_yolo",
            })

        logger.info(
            "[wall_segment_service] Gemini RAW candidate path: %d candidates; no split/merge/boundary/NMS",
            len(candidates),
        )
        return {"width": img_w, "height": img_h, "walls": candidates, "count": len(candidates)}

'''
if 'def predict_raw_candidates(' not in wall:
    marker = '    @staticmethod\n    def predict_stream('
    if marker not in wall:
        raise SystemExit('Could not find WallSegmentService.predict_stream marker')
    wall = wall.replace(marker, method + marker, 1)
    wall_path.write_text(wall, encoding='utf-8')

# 2) Replace Gemini service with a constrained selector: Gemini may ONLY select
# candidate IDs; it cannot invent coordinates.
gemini_code = r'''import base64
import io
import json
import math
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List

from PIL import Image, ImageDraw

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


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
'''
files['gemini'].write_text(gemini_code, encoding='utf-8')

# 3) Replace API endpoint so it obtains RAW candidates itself and never calls
# predict()/predict_stream().
routes_path = files['routes']
routes = routes_path.read_text(encoding='utf-8-sig')
new_endpoint = r'''@router.post("/api/gemini/rebuild-walls")
async def gemini_rebuild_walls(
    file: UploadFile = File(...),
    confidence: float = Form(0.001),
    real_scale: Optional[float] = Form(1.0),
    ext_thickness: Optional[int] = Form(90),
    int_thickness: Optional[int] = Form(70),
    part_thickness: Optional[int] = Form(70),
    existing_walls: Optional[str] = Form(None),
    username: str = Depends(validate_session)
):
    """Gemini reviews RAW YOLO candidates before destructive wall post-processing."""
    import json as _json
    from services.wall_segment_service import WallSegmentService
    from services.gemini_wall_service import review_raw_candidates_with_gemini

    content = await file.read()
    wall_thicknesses = {
        "ext": ext_thickness or 90,
        "int": int_thickness or 70,
        "part": part_thickness or 70,
    }
    try:
        current = _json.loads(existing_walls) if existing_walls else []
        raw = await run_in_threadpool(
            WallSegmentService.predict_raw_candidates,
            image_bytes=content,
            confidence=confidence,
            real_scale=real_scale or 1.0,
            filename=file.filename or "plan.png",
            wall_thicknesses=wall_thicknesses,
        )
        result = await run_in_threadpool(
            review_raw_candidates_with_gemini,
            image_bytes=content,
            raw_candidates=raw.get("walls") or [],
            real_scale=real_scale or 1.0,
            wall_thicknesses=wall_thicknesses,
            existing_walls=current,
        )
        logger.info(
            "Gemini RAW review: %s raw -> %s selected",
            result.get("raw_candidate_count"), result.get("count")
        )
        return result
    except RuntimeError as exc:
        logger.error("Gemini raw-candidate review failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        logger.error("Unexpected Gemini raw-candidate review error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))

'''
pat = re.compile(r'@router\.post\("/api/gemini/rebuild-walls"\)[\s\S]*?(?=\n@router\.post\("/predict_wall_stream"\))')
if not pat.search(routes):
    raise SystemExit('Could not find Gemini endpoint block in routes.py')
routes = pat.sub(new_endpoint.rstrip(), routes, count=1)
routes_path.write_text(routes, encoding='utf-8')

# 4) Frontend API: send confidence + current walls to Gemini endpoint.
api_path = files['api']
api = api_path.read_text(encoding='utf-8-sig')
api_func = r'''  async rebuildWallsWithGemini(imageBlob, realScale = 1.0, wallThicknesses = null, signal = null, confidence = "0.001", existingWalls = []) {
    const fd = new FormData();
    fd.append("file", imageBlob);
    fd.append("confidence", confidence || "0.001");
    fd.append("real_scale", realScale || 1.0);
    if (wallThicknesses) {
      fd.append("ext_thickness", wallThicknesses.ext || 90);
      fd.append("int_thickness", wallThicknesses.int || 70);
      fd.append("part_thickness", wallThicknesses.part || 70);
    }
    try {
      const compactWalls = (existingWalls || []).slice(0, 300).map(w => ({
        class_name: w.class_name || w.wall_type,
        centerline: w.centerline,
        confidence: w.confidence
      }));
      fd.append("existing_walls", JSON.stringify(compactWalls));
    } catch (e) {
      fd.append("existing_walls", "[]");
    }
    const res = await fetch(`${BASE_URL}/api/gemini/rebuild-walls`, {
      method: "POST",
      headers: getHeaders(null),
      body: fd,
      credentials: "include",
      signal
    });
    return handleResponse(res);
  },'''
pat_api = re.compile(r'  async rebuildWallsWithGemini\([\s\S]*?\n  \},(?=\n\n  async detectWallSegStream)')
if not pat_api.search(api):
    raise SystemExit('Could not find rebuildWallsWithGemini in api.service.js')
api = pat_api.sub(api_func, api, count=1)
api_path.write_text(api, encoding='utf-8')

# 5) Controller: Gemini branch calls ONLY /api/gemini/rebuild-walls.
ctrl_path = files['controller']
ctrl = ctrl_path.read_text(encoding='utf-8-sig')
old_call = 'ApiService.rebuildWallsWithGemini(blob, realScale, activeThicknesses, job.controller.signal)'
new_call = 'ApiService.rebuildWallsWithGemini(blob, realScale, activeThicknesses, job.controller.signal, conf, existingWallsSnapshot)'
if old_call in ctrl:
    ctrl = ctrl.replace(old_call, new_call)
else:
    # Patch newer variants that already added arguments but may still differ.
    ctrl = re.sub(
        r'ApiService\.rebuildWallsWithGemini\(blob,\s*realScale,\s*activeThicknesses,\s*job\.controller\.signal[^)]*\)',
        new_call,
        ctrl,
        count=1,
    )
# Strong guard: inside Gemini branch, remove an accidental local stream pre-pass
# only when it is textually before rebuildWallsWithGemini in that branch.
branch_match = re.search(r'if \(provider === "gemini"\) \{([\s\S]*?)\n\s*\}\n\n\s*await ApiService\.detectWallSegStream', ctrl)
if branch_match:
    body = branch_match.group(1)
    # If a newer patch inserted detectWallSegStream inside this body, remove the call statement block.
    body2 = re.sub(r'\n\s*await ApiService\.detectWallSegStream\([\s\S]*?\n\s*\);', '', body, count=1)
    if body2 != body:
        ctrl = ctrl[:branch_match.start(1)] + body2 + ctrl[branch_match.end(1):]
ctrl_path.write_text(ctrl, encoding='utf-8')

print('Applied Gemini RAW-candidate review fix.')
print('Backup:', backup_dir)
print('Changed:')
for p in files.values(): print(' -', p)
