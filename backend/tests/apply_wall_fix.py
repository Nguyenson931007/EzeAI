# -*- coding: utf-8 -*-
"""
Patch: wall pipeline fixes (#1,#2,#5,#7,#8,#9).
Chay tu thu muc goc repo (EzeFloor-refactor):   python apply_wall_fix.py
Tao file .bak canh file goc. Chay lai lan 2 se bao "da patch" va khong lam gi.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SVC = ROOT / "backend" / "services" / "wall_segment_service.py"
GEO = ROOT / "frontend_next" / "src" / "utils" / "geometry.js"
CVS = ROOT / "frontend_next" / "src" / "views" / "CanvasView.jsx"
MARK = "_collapse_same_band_parallel_walls"


def read(p):
    return p.read_text(encoding="utf-8")


def write(p, s):
    bak = p.with_suffix(p.suffix + ".bak")
    if not bak.exists():
        bak.write_text(read(p), encoding="utf-8")
    p.write_text(s, encoding="utf-8")


def sub(src, old, new, count, label):
    n = src.count(old)
    if n != count:
        sys.exit(f"[LOI] {label}: mong doi {count} cho khop, tim thay {n}. Dung lai, khong ghi gi.")
    return src.replace(old, new)


# ----------------------------------------------------------------- backend
HELPERS = r'''
def _wall_thickness_hint(wall: dict) -> float:
    try:
        t = float(wall.get("raw_thickness_px") or wall.get("thickness_px") or 12.0)
    except Exception:
        t = 12.0
    return max(6.0, min(30.0, t))


def _walls_near_parallel(a: dict, b: dict, min_cos: float = 0.98) -> bool:
    """True when the two walls run in (nearly) the same direction.

    Unknown geometry returns True so callers keep their previous behaviour.
    """
    am, bm = _line_metrics(a), _line_metrics(b)
    if am is None or bm is None:
        return True
    return abs(am[4] * bm[4] + am[5] * bm[5]) >= min_cos


def _parallel_pair_geometry(a: dict, b: dict, min_cos: float = 0.985):
    """Express wall b in wall a's (along, normal) frame. None if not parallel."""
    am, bm = _line_metrics(a), _line_metrics(b)
    if am is None or bm is None:
        return None
    ax1, ay1, _, _, aux, auy, alen = am
    if abs(aux * bm[4] + auy * bm[5]) < min_cos:
        return None
    nx, ny = -auy, aux
    d1 = (bm[0] - ax1) * nx + (bm[1] - ay1) * ny
    d2 = (bm[2] - ax1) * nx + (bm[3] - ay1) * ny
    t1 = (bm[0] - ax1) * aux + (bm[1] - ay1) * auy
    t2 = (bm[2] - ax1) * aux + (bm[3] - ay1) * auy
    lo, hi = sorted((t1, t2))
    overlap = max(0.0, min(alen, hi) - max(0.0, lo))
    return {
        "origin": (ax1, ay1), "u": (aux, auy), "n": (nx, ny),
        "sep": 0.5 * (d1 + d2), "skew": abs(d1 - d2),
        "t_lo": max(0.0, lo), "t_hi": min(alen, hi),
        "t_min": min(0.0, lo), "t_max": max(alen, hi),
        "overlap": overlap,
        "ratio": overlap / max(1.0, min(alen, bm[6])),
    }


def _same_band_probe(img_np, a: dict, b: dict, min_ratio: float = 0.70):
    """Decide whether two near-parallel axes are the SAME raster wall band.

    Both axes must lie inside one contiguous dark run whose total width is that of
    a single wall.  Two real walls (light gap between them, or a band ~2x thick)
    fail this test, so genuine parallel walls are never collapsed.
    Returns {"shift": signed centre of the real band relative to a's axis, ...} or None.
    """
    if img_np is None:
        return None
    g = _parallel_pair_geometry(a, b)
    if g is None or g["skew"] > 3.0 or g["ratio"] < min_ratio or g["overlap"] < 20.0:
        return None
    sep = g["sep"]
    asep = abs(sep)
    t_est = max(_wall_thickness_hint(a), _wall_thickness_hint(b))
    # < 2px is already handled by the exact-duplicate pass.
    if asep < 2.0 or asep > min(1.25 * t_est, 28.0):
        return None

    h, w = img_np.shape[:2]

    def dark(x, y):
        ix, iy = int(round(x)), int(round(y))
        if ix < 0 or ix >= w or iy < 0 or iy >= h:
            return False
        px = img_np[iy, ix]
        v = float(px) if np.ndim(px) == 0 else 0.299 * float(px[0]) + 0.587 * float(px[1]) + 0.114 * float(px[2])
        return v <= 120.0

    ox, oy = g["origin"]
    ux, uy = g["u"]
    nx, ny = g["n"]
    max_band = 1.35 * t_est + 3.0
    reach = int(max_band + asep + 4)
    n = max(5, min(15, int(g["overlap"] / 20.0)))
    ok = 0
    centers = []
    for i in range(n):
        t = g["t_lo"] + g["overlap"] * (0.12 + 0.76 * i / max(1, n - 1))
        px = ox + t * ux + 0.5 * sep * nx
        py = oy + t * uy + 0.5 * sep * ny
        if not dark(px, py):
            continue
        hi_q = 0
        while hi_q < reach and dark(px + (hi_q + 1) * nx, py + (hi_q + 1) * ny):
            hi_q += 1
        lo_q = 0
        while lo_q > -reach and dark(px + (lo_q - 1) * nx, py + (lo_q - 1) * ny):
            lo_q -= 1
        width = hi_q - lo_q + 1
        half = asep / 2.0
        if width > max_band or lo_q - 1.5 > -half or hi_q + 1.5 < half:
            continue
        ok += 1
        centers.append(0.5 * sep + 0.5 * (lo_q + hi_q))
    if ok < 3 or ok < 0.75 * n:
        return None
    centers.sort()
    shift = centers[len(centers) // 2]
    shift = max(-max(asep, 6.0), min(max(asep, 6.0), shift))
    out = dict(g)
    out["shift"] = shift
    out["ok_ratio"] = ok / float(n)
    return out


def _collapse_same_band_parallel_walls(img_np, walls: List[dict]) -> List[dict]:
    """Merge two centerlines that trace the two edges of ONE wall band.

    Conservative by construction: needs continuous dark ink spanning both axes,
    a single-wall band width, near-parallel direction and >=70% overlap.  The merged
    axis is moved to the measured band centre (also fixes off-centre axes).
    """
    if img_np is None or len(walls) < 2:
        return walls
    order = sorted(
        range(len(walls)),
        key=lambda i: (_line_metrics(walls[i]) or (0, 0, 0, 0, 0, 0, 0))[-1],
        reverse=True,
    )
    kept: List[dict] = []
    merged = 0
    for i in order:
        wall = dict(walls[i])
        if _line_metrics(wall) is None:
            kept.append(wall)
            continue
        hit = None
        for k, acc in enumerate(kept):
            probe = _same_band_probe(img_np, acc, wall)
            if probe is not None:
                hit = (k, probe)
                break
        if hit is None:
            kept.append(wall)
            continue
        k, probe = hit
        acc = kept[k]
        ox, oy = probe["origin"]
        ux, uy = probe["u"]
        nx, ny = probe["n"]
        s = probe["shift"]
        ta, tb = probe["t_min"], probe["t_max"]
        acc["centerline"] = [
            [ox + ta * ux + s * nx, oy + ta * uy + s * ny],
            [ox + tb * ux + s * nx, oy + tb * uy + s * ny],
        ]
        acc["confidence"] = max(float(acc.get("confidence", 0) or 0), float(wall.get("confidence", 0) or 0))
        acc["duplicate_sources"] = sorted(set(
            list(acc.get("duplicate_sources") or []) + list(wall.get("duplicate_sources") or [])
            + [str(acc.get("source_model") or "unknown"), str(wall.get("source_model") or "unknown")]
        ))
        acc["same_band_collapsed"] = True
        merged += 1
    if merged:
        logger.info("[wall_segment_service] Same-band parallel collapse: merged %d duplicate axis(es)", merged)
    return kept

'''

WHISKER_OLD = '''        if connections:
            kept.append(wall)
            continue
'''
WHISKER_NEW = '''        if connections and 12.0 <= length <= max(30.0, 2.2 * thickness):
            # One-ended whisker (symbol/door/fixture/dimension stub): one end touches a
            # wall, the other end is free, and there is no wall-band ink under it.
            tol = max(5.0, 0.55 * thickness)
            touching = [
                any(
                    _point_to_segment_distance_helper(pt, o["centerline"][0], o["centerline"][1]) <= tol
                    for j2, o in enumerate(walls)
                    if j2 != idx and o.get("centerline") and len(o["centerline"]) == 2
                )
                for pt in wall["centerline"]
            ]
            if sum(touching) == 1:
                w_score, w_cont, _ = _wall_band_evidence_score(img_np, wall, 0.0)
                w_conf = float(wall.get("confidence", 0) or 0)
                w_recovery = str(wall.get("source_model") or "").startswith("visual")
                if w_cont < 0.30 and w_score < 0.22 and (w_recovery or w_conf < 0.30):
                    removed += 1
                    continue
        if connections:
            kept.append(wall)
            continue
'''

RESTORE_OLD = '''    for raw in raw_walls or []:
        if represented(raw):
            continue
'''
RESTORE_NEW = '''    for raw in raw_walls or []:
        if represented(raw):
            continue
        # A raw axis on the other edge of a wall band we already kept is the same wall,
        # not a missing one: restoring it here is what produced the double wall.
        if any(_same_band_probe(img_np, w, raw, min_ratio=0.60) is not None for w in result):
            continue
'''

SPLIT_OLD = '''        snapped_walls = _split_walls_at_all_junctions(
            snapped_walls, touch_tolerance=2.5, min_piece_len=10.0
        )
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls)
'''
SPLIT_NEW = '''        snapped_walls = _collapse_same_band_parallel_walls(img_np, snapped_walls)
        snapped_walls = _split_walls_at_all_junctions(
            snapped_walls, touch_tolerance=2.5, min_piece_len=10.0
        )
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls)
'''

RESTORE_CALL_OLD = '''        snapped_walls = _restore_supported_raw_walls(img_np, raw_yolo_walls, snapped_walls)
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls)
'''
RESTORE_CALL_NEW = '''        snapped_walls = _restore_supported_raw_walls(img_np, raw_yolo_walls, snapped_walls)
        snapped_walls = _dedupe_near_parallel_centerlines(snapped_walls)
        snapped_walls = _collapse_same_band_parallel_walls(img_np, snapped_walls)
        # Restored/collapsed walls were added after the first noding pass: node again
        # (only real touches/crossings; near-but-not-touching walls are left alone).
        snapped_walls = _split_walls_at_all_junctions(
            snapped_walls, touch_tolerance=2.5, min_piece_len=10.0
        )
'''

NMS_OLD = '''                    continue
                try:
                    acc_geom = ShapelyPolygon(accepted_w["polygon"])'''
NMS_NEW = '''                    continue
                # Perpendicular walls (T/L stubs) are never duplicates of each other.
                if not _walls_near_parallel(w, accepted_w):
                    continue
                try:
                    acc_geom = ShapelyPolygon(accepted_w["polygon"])'''


def patch_backend():
    s = read(SVC)
    if MARK in s:
        print("[backend] da patch, bo qua")
        return
    s = sub(s, "def _filter_orphan_fragments(img_np, walls: List[dict]) -> List[dict]:",
            HELPERS.lstrip("\n") + "\ndef _filter_orphan_fragments(img_np, walls: List[dict]) -> List[dict]:", 1, "chen helpers")
    s = sub(s, WHISKER_OLD, WHISKER_NEW, 1, "orphan whisker")
    s = sub(s, RESTORE_OLD, RESTORE_NEW, 1, "restore shadow")
    s = sub(s, SPLIT_OLD, SPLIT_NEW, 2, "collapse truoc split (predict + stream)")
    s = sub(s, RESTORE_CALL_OLD, RESTORE_CALL_NEW, 2, "collapse+split sau restore (predict + stream)")
    s = sub(s, NMS_OLD, NMS_NEW, 2, "NMS chi cho tuong song song")
    # Junction extension only inflated the temporary polygons used by cleanup passes
    # (final geometry is rebuilt from centerline+thickness) -> remove the drift.
    s = sub(s, "ext1 = get_ext_factor(p1, idx, snapped_walls, ux, uy)", "ext1 = 0.0", 2, "ext1")
    s = sub(s, "ext2 = get_ext_factor(p2, idx, snapped_walls, ux, uy)", "ext2 = 0.0", 2, "ext2")
    write(SVC, s)
    print("[backend] OK")


# ---------------------------------------------------------------- frontend
GEO_FN = '''
/**
 * Polygon used to draw/hit-test a wall.  centerline + thickness_px is the source of
 * truth: a stored polygon is reused only while it still agrees with the centerline
 * (junction-mitered polygons are fine); a stale one is rebuilt as a plain rectangle.
 */
export function getWallRenderPolygon(w) {
  const poly = Array.isArray(w?.polygon) && w.polygon.length >= 3 ? w.polygon : null;
  const c = w?.centerline;
  if (!Array.isArray(c) || c.length !== 2) return poly || [];
  const x1 = Number(c[0][0]), y1 = Number(c[0][1]);
  const x2 = Number(c[1][0]), y2 = Number(c[1][1]);
  const L = Math.hypot(x2 - x1, y2 - y1);
  if (!Number.isFinite(L) || L < 1e-6) return poly || [];
  const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
  const nx = -uy, ny = ux;
  const th = Number(w.thickness_px) > 0 ? Number(w.thickness_px) : 20;

  if (poly) {
    let tMin = Infinity, tMax = -Infinity, nMax = 0;
    for (const p of poly) {
      const px = Array.isArray(p) ? Number(p[0]) : Number(p?.x);
      const py = Array.isArray(p) ? Number(p[1]) : Number(p?.y);
      const t = (px - x1) * ux + (py - y1) * uy;
      const q = Math.abs((px - x1) * nx + (py - y1) * ny);
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
      if (q > nMax) nMax = q;
    }
    const tol = 1.25 * th;
    if (Math.abs(tMin) <= tol && Math.abs(tMax - L) <= tol && nMax <= 2 * th) return poly;
  }
  const d = th / 2;
  return [
    [x1 + d * nx, y1 + d * ny],
    [x2 + d * nx, y2 + d * ny],
    [x2 - d * nx, y2 - d * ny],
    [x1 - d * nx, y1 - d * ny],
  ];
}
'''


def patch_frontend():
    g = read(GEO)
    if "getWallRenderPolygon" not in g:
        anchor = "/**\n * Remove duplicate AI centerlines without collapsing legitimate nearby walls."
        g = sub(g, anchor, GEO_FN.lstrip("\n") + "\n" + anchor, 1, "geometry.js anchor")
        write(GEO, g)
        print("[geometry.js] OK")
    else:
        print("[geometry.js] da patch, bo qua")

    v = read(CVS)
    if "getWallRenderPolygon" not in v:
        v = sub(v, "  classifyWallsTouchingExtEndpoints,\n  ADD_POINT_SNAP_DISTANCE,",
                "  classifyWallsTouchingExtEndpoints,\n  getWallRenderPolygon,\n  ADD_POINT_SNAP_DISTANCE,", 1, "CanvasView import")
        v = sub(v, "const pointsStr = (w.polygon || []).map(p => `${p[0]},${p[1]}`).join(\" \");",
                "const pointsStr = (getWallRenderPolygon(w) || []).map(p => `${p[0]},${p[1]}`).join(\" \");", 3, "CanvasView pointsStr")
        write(CVS, v)
        print("[CanvasView.jsx] OK")
    else:
        print("[CanvasView.jsx] da patch, bo qua")


if __name__ == "__main__":
    for p in (SVC, GEO, CVS):
        if not p.exists():
            sys.exit(f"[LOI] khong thay {p}. Hay chay script tu thu muc goc EzeFloor-refactor.")
    patch_backend()
    patch_frontend()
