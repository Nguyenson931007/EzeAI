"""
door_refinement_engine.py
=========================
OpenCV Geometry Refinement Engine + Wall Snap Engine cho hệ thống nhận diện cửa EzeFloor.

Pipeline xử lý hình học cửa:
    Bounding box (YOLO) → Crop ROI → Canny Edge → HoughLinesP → Isolate Arc
    → Xác định bản lề (hinge) → Tính góc mở (opening angle) → Hướng quay (swing)
    → Snap vào tường gần nhất

Mô-đun này tinh chỉnh kết quả thô từ YOLO detector bằng các phép phân tích
hình học OpenCV cấp thấp, trả về thông tin chi tiết về hình học cửa bao gồm:
    - Vị trí bản lề (hinge point)
    - Đường cánh cửa (leaf line)
    - Tâm / bán kính / góc quét cung tròn (arc)
    - Hướng quay (clockwise / counterclockwise)
    - Độ tin cậy hình học (geometry confidence)

Dependencies:
    cv2, numpy, math
"""

import math
import logging
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────

_ROI_PAD = 25                  # Padding xung quanh bbox khi crop ROI
_CANNY_LOW = 50                # Ngưỡng Canny thấp
_CANNY_HIGH = 150              # Ngưỡng Canny cao
_HOUGH_THRESHOLD = 30          # Ngưỡng HoughLinesP
_HOUGH_MIN_LINE = 30           # Chiều dài tối thiểu đoạn thẳng
_HOUGH_MAX_GAP = 10            # Khoảng cách tối đa giữa các điểm trên cùng đoạn thẳng
_SNAP_ANGLE_TOL = 15.0         # Sai lệch góc tối đa khi snap tường (degrees)
_SNAP_DIST_TOL = 20.0          # Khoảng cách tối đa khi snap tường (pixels)
_LINE_MASK_THICKNESS = 3       # Độ dày mask khi xóa đoạn thẳng
_MIN_ARC_CONTOUR_AREA = 50     # Diện tích tối thiểu contour để fit arc
_MIN_ELLIPSE_POINTS = 5        # Số điểm tối thiểu cho fitEllipse


# ─────────────────────────────────────────────────────────────
# Helper Functions (standalone)
# ─────────────────────────────────────────────────────────────

def _line_intersection(
    p1: Tuple[float, float],
    p2: Tuple[float, float],
    p3: Tuple[float, float],
    p4: Tuple[float, float],
) -> Optional[Tuple[float, float]]:
    """Tính giao điểm của hai đoạn thẳng (p1-p2) và (p3-p4).

    Sử dụng công thức đại số tuyến tính Cramer's rule.
    Trả về None nếu hai đường song song hoặc trùng nhau.

    Args:
        p1: Điểm đầu đoạn 1 (x, y).
        p2: Điểm cuối đoạn 1 (x, y).
        p3: Điểm đầu đoạn 2 (x, y).
        p4: Điểm cuối đoạn 2 (x, y).

    Returns:
        Tọa độ giao điểm (x, y) hoặc None.
    """
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4

    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-10:
        return None

    t_num = (x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)
    t = t_num / denom

    ix = x1 + t * (x2 - x1)
    iy = y1 + t * (y2 - y1)
    return (float(ix), float(iy))


def _project_point_onto_line(
    point: Tuple[float, float],
    line_start: Tuple[float, float],
    line_end: Tuple[float, float],
) -> Tuple[float, float]:
    """Chiếu vuông góc một điểm lên đoạn thẳng.

    Nếu hình chiếu nằm ngoài đoạn thẳng, clamp về đầu/cuối gần nhất.

    Args:
        point: Điểm cần chiếu (x, y).
        line_start: Điểm đầu đoạn thẳng (x, y).
        line_end: Điểm cuối đoạn thẳng (x, y).

    Returns:
        Tọa độ điểm chiếu (x, y).
    """
    px, py = point
    ax, ay = line_start
    bx, by = line_end

    abx = bx - ax
    aby = by - ay
    ab_sq = abx * abx + aby * aby

    if ab_sq < 1e-10:
        return (ax, ay)

    t = ((px - ax) * abx + (py - ay) * aby) / ab_sq
    t = max(0.0, min(1.0, t))

    proj_x = ax + t * abx
    proj_y = ay + t * aby
    return (float(proj_x), float(proj_y))


def _find_dominant_line(
    lines: np.ndarray,
    box_center: Tuple[float, float],
    box_dims: Tuple[float, float],
) -> Optional[Dict[str, Any]]:
    """Tìm đoạn thẳng chủ đạo (cánh cửa / khung tường) từ kết quả HoughLinesP.

    Tiêu chí chọn:
        - Ưu tiên đoạn dài nhất
        - Ưu tiên đoạn gần tâm bbox
        - Chuẩn hóa bằng trọng số: 0.6 * length_score + 0.4 * proximity_score

    Args:
        lines: Mảng đoạn thẳng từ HoughLinesP, shape (N, 1, 4).
        box_center: Tâm bounding box (cx, cy).
        box_dims: Kích thước bbox (width, height).

    Returns:
        Dict chứa {p1, p2, angle, length} hoặc None.
    """
    if lines is None or len(lines) == 0:
        return None

    cx, cy = box_center
    bw, bh = box_dims
    diag = math.sqrt(bw * bw + bh * bh) + 1e-6

    best_score = -1.0
    best_line = None

    for line in lines:
        x1, y1, x2, y2 = line[0]
        length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        if length < 5:
            continue

        mid_x = (x1 + x2) / 2.0
        mid_y = (y1 + y2) / 2.0
        dist = math.sqrt((mid_x - cx) ** 2 + (mid_y - cy) ** 2)

        length_score = min(length / diag, 1.0)
        prox_score = max(0.0, 1.0 - dist / diag)
        score = 0.6 * length_score + 0.4 * prox_score

        if score > best_score:
            best_score = score
            angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
            best_line = {
                "p1": (float(x1), float(y1)),
                "p2": (float(x2), float(y2)),
                "angle": float(angle),
                "length": float(length),
            }

    return best_line


def _fit_arc_from_contours(
    contours: list,
    center_hint: Tuple[float, float],
    radius_hint: float,
) -> Dict[str, Any]:
    """Fit ellipse / circle vào các contours cong (cung quay cửa).

    Ưu tiên contour gần center_hint và có bán kính tương ứng radius_hint.

    Args:
        contours: Danh sách contours (từ cv2.findContours).
        center_hint: Tọa độ tâm gợi ý (thường là hinge point).
        radius_hint: Bán kính gợi ý (thường là chiều dài cánh cửa).

    Returns:
        Dict với: center, radius, start_angle, end_angle, fit_quality.
        Nếu không fit được, trả về dict mặc định với fit_quality=0.
    """
    default = {
        "center": center_hint,
        "radius": radius_hint,
        "start_angle": 0.0,
        "end_angle": 90.0,
        "fit_quality": 0.0,
    }

    if not contours:
        return default

    best_fit = None
    best_quality = 0.0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < _MIN_ARC_CONTOUR_AREA:
            continue

        if len(cnt) < _MIN_ELLIPSE_POINTS:
            continue

        try:
            ellipse = cv2.fitEllipse(cnt)
            (ecx, ecy), (ma, MA), angle = ellipse

            # Bán kính trung bình
            avg_radius = (ma + MA) / 4.0  # fitEllipse trả về đường kính

            # Khoảng cách từ tâm ellipse tới center_hint
            dist_to_hint = math.sqrt(
                (ecx - center_hint[0]) ** 2 + (ecy - center_hint[1]) ** 2
            )

            # Chất lượng fit: ưu tiên gần center_hint và bán kính tương đồng
            radius_ratio = min(avg_radius, radius_hint) / (
                max(avg_radius, radius_hint) + 1e-6
            )
            dist_penalty = max(0.0, 1.0 - dist_to_hint / (radius_hint * 2 + 1e-6))
            quality = 0.5 * radius_ratio + 0.5 * dist_penalty

            if quality > best_quality:
                best_quality = quality
                # Ước lượng start/end angle từ contour bounding
                pts = cnt.reshape(-1, 2).astype(float)
                angles = np.degrees(
                    np.arctan2(pts[:, 1] - ecy, pts[:, 0] - ecx)
                )
                start_angle = float(np.min(angles))
                end_angle = float(np.max(angles))

                best_fit = {
                    "center": (float(ecx), float(ecy)),
                    "radius": float(avg_radius),
                    "start_angle": start_angle,
                    "end_angle": end_angle,
                    "fit_quality": float(quality),
                }
        except cv2.error:
            continue

    return best_fit if best_fit is not None else default


def _measure_stroke_thickness(
    gray_image: np.ndarray,
    line: Dict[str, Any],
    num_samples: int = 5,
) -> float:
    """Đo độ dày nét vẽ trên ảnh xám dọc theo một đoạn thẳng.

    Lấy mẫu tại num_samples điểm dọc theo line, tại mỗi điểm quét
    vuông góc để đo bề rộng pixel tối (< 128).

    Args:
        gray_image: Ảnh grayscale (numpy array).
        line: Dict chứa p1, p2 của đoạn thẳng.
        num_samples: Số điểm lấy mẫu dọc đoạn thẳng.

    Returns:
        Độ dày trung bình (pixels). Trả về 1.0 nếu không đo được.
    """
    try:
        p1 = line.get("p1", (0, 0))
        p2 = line.get("p2", (0, 0))
        h, w = gray_image.shape[:2]

        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        length = math.sqrt(dx * dx + dy * dy)
        if length < 1:
            return 1.0

        # Vector vuông góc (normalized)
        nx = -dy / length
        ny = dx / length

        thicknesses = []
        for i in range(num_samples):
            t = (i + 1) / (num_samples + 1)
            sx = p1[0] + t * dx
            sy = p1[1] + t * dy

            # Quét vuông góc ±20 pixels
            count = 0
            for offset in range(-20, 21):
                px = int(round(sx + offset * nx))
                py = int(round(sy + offset * ny))
                if 0 <= px < w and 0 <= py < h:
                    if gray_image[py, px] < 128:
                        count += 1

            if count > 0:
                thicknesses.append(count)

        return float(np.mean(thicknesses)) if thicknesses else 1.0
    except Exception as e:
        logger.warning("Không thể đo stroke thickness: %s", e)
        return 1.0


# ─────────────────────────────────────────────────────────────
# DoorRefinementEngine
# ─────────────────────────────────────────────────────────────

class DoorRefinementEngine:
    """Engine tinh chỉnh hình học cửa sử dụng OpenCV.

    Nhận bounding box thô từ YOLO, phân tích edge/line/arc trong ROI
    để trích xuất:
        - Hinge point (bản lề)
        - Leaf line (cánh cửa)
        - Arc geometry (cung quay)
        - Swing direction (hướng quay)
        - Wall snap (gắn vào tường)

    Sử dụng:
        >>> engine = DoorRefinementEngine()
        >>> result = engine.refine_door_geometry(image_np, [100, 200, 300, 400], 'single_door')
        >>> print(result['opening_angle'])
    """

    def __init__(
        self,
        roi_padding: int = _ROI_PAD,
        canny_low: int = _CANNY_LOW,
        canny_high: int = _CANNY_HIGH,
    ) -> None:
        """Khởi tạo engine với các tham số tùy chỉnh.

        Args:
            roi_padding: Padding khi crop ROI (pixels).
            canny_low: Ngưỡng Canny thấp.
            canny_high: Ngưỡng Canny cao.
        """
        self.roi_padding = roi_padding
        self.canny_low = canny_low
        self.canny_high = canny_high

    # ── refine_door_geometry ──────────────────────────────

    def refine_door_geometry(
        self,
        image_np: np.ndarray,
        bbox: List[float],
        door_type: str,
        walls: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Tinh chỉnh hình học cửa từ ảnh gốc và bounding box.

        Pipeline:
            1. Crop ROI với padding
            2. Canny edge detection
            3. HoughLinesP → tìm đoạn thẳng cánh cửa và khung
            4. Mask đoạn thẳng → tìm contour cong → fit arc
            5. Xác định hinge = giao điểm leaf line & wall line
            6. Tính góc mở và hướng quay

        Args:
            image_np: Ảnh gốc dưới dạng numpy array (H, W, 3) RGB/BGR.
            bbox: Bounding box [x1, y1, x2, y2] (pixels).
            door_type: Loại cửa ('single_door', 'double_door', 'sliding_door', ...).
            walls: Danh sách wall segments (tùy chọn) [{p1: {x,y}, p2: {x,y}}].

        Returns:
            Dict chứa các thông số hình học:
                - hinge_point: (x, y)
                - leaf_line: {p1, p2, angle, length}
                - arc_center, arc_radius, arc_start_angle, arc_end_angle
                - swing_direction: 'clockwise' | 'counterclockwise'
                - hinge_side: 'left' | 'right' | 'top' | 'bottom'
                - opening_angle: float (degrees)
                - door_centerline: {p1, p2}
                - geometry_confidence: float (0.0-1.0)
        """
        result = self._default_geometry_result(bbox, door_type)

        try:
            x1, y1, x2, y2 = [int(v) for v in bbox]
            img_h, img_w = image_np.shape[:2]
            pad = self.roi_padding

            # ── Step 1: Crop ROI ──
            rx1 = max(0, x1 - pad)
            ry1 = max(0, y1 - pad)
            rx2 = min(img_w, x2 + pad)
            ry2 = min(img_h, y2 + pad)

            roi = image_np[ry1:ry2, rx1:rx2]
            if roi.size == 0:
                logger.warning("ROI rỗng cho bbox %s", bbox)
                return result

            # Chuyển sang grayscale
            if len(roi.shape) == 3:
                gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
            else:
                gray = roi.copy()

            roi_h, roi_w = gray.shape
            box_center = (roi_w / 2.0, roi_h / 2.0)
            box_dims = (float(roi_w), float(roi_h))

            # ── Step 2: Canny edge detection ──
            edges = cv2.Canny(gray, self.canny_low, self.canny_high)

            # ── Step 3: HoughLinesP → tìm đoạn thẳng ──
            lines = cv2.HoughLinesP(
                edges,
                rho=1,
                theta=np.pi / 180,
                threshold=_HOUGH_THRESHOLD,
                minLineLength=_HOUGH_MIN_LINE,
                maxLineGap=_HOUGH_MAX_GAP,
            )

            if lines is None or len(lines) == 0:
                logger.info("Không tìm thấy đoạn thẳng nào trong ROI")
                result["geometry_confidence"] = 0.1
                return result

            # Tìm đoạn thẳng chủ đạo (leaf line)
            leaf_line = _find_dominant_line(lines, box_center, box_dims)
            if leaf_line is None:
                result["geometry_confidence"] = 0.15
                return result

            # Offset leaf_line về tọa độ gốc
            leaf_line_global = {
                "p1": (leaf_line["p1"][0] + rx1, leaf_line["p1"][1] + ry1),
                "p2": (leaf_line["p2"][0] + rx1, leaf_line["p2"][1] + ry1),
                "angle": leaf_line["angle"],
                "length": leaf_line["length"],
            }
            result["leaf_line"] = leaf_line_global

            # Tìm đoạn thẳng thứ hai (wall frame) — đoạn dài nhất vuông góc ±30°
            wall_line = self._find_wall_frame_line(lines, leaf_line, box_center, box_dims)

            # ── Step 4: Isolate curved contours → fit arc ──
            line_mask = np.zeros_like(edges)
            for ln in lines:
                lx1, ly1, lx2, ly2 = ln[0]
                cv2.line(line_mask, (lx1, ly1), (lx2, ly2), 255, _LINE_MASK_THICKNESS)

            curves_only = cv2.bitwise_and(edges, cv2.bitwise_not(line_mask))
            contours, _ = cv2.findContours(
                curves_only, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )

            radius_hint = leaf_line["length"] / 2.0

            # ── Step 5: Xác định hinge point ──
            hinge_point = None
            if wall_line is not None:
                hinge_point = _line_intersection(
                    leaf_line["p1"], leaf_line["p2"],
                    wall_line["p1"], wall_line["p2"],
                )

            if hinge_point is None:
                # Fallback: hinge ở đầu leaf line gần góc bbox nhất
                corners = [
                    (0.0, 0.0),
                    (float(roi_w), 0.0),
                    (0.0, float(roi_h)),
                    (float(roi_w), float(roi_h)),
                ]
                d1 = min(
                    math.sqrt((c[0] - leaf_line["p1"][0]) ** 2 + (c[1] - leaf_line["p1"][1]) ** 2)
                    for c in corners
                )
                d2 = min(
                    math.sqrt((c[0] - leaf_line["p2"][0]) ** 2 + (c[1] - leaf_line["p2"][1]) ** 2)
                    for c in corners
                )
                if d1 <= d2:
                    hinge_point = leaf_line["p1"]
                else:
                    hinge_point = leaf_line["p2"]

            # Offset hinge về tọa độ gốc
            hinge_global = (hinge_point[0] + rx1, hinge_point[1] + ry1)
            result["hinge_point"] = hinge_global

            # Fit arc
            center_hint = hinge_point  # Arc center = hinge point
            arc_result = _fit_arc_from_contours(contours, center_hint, radius_hint)

            # Offset arc center về tọa độ gốc
            arc_center_global = (
                arc_result["center"][0] + rx1,
                arc_result["center"][1] + ry1,
            )
            result["arc_center"] = arc_center_global
            result["arc_radius"] = arc_result["radius"]
            result["arc_start_angle"] = arc_result["start_angle"]
            result["arc_end_angle"] = arc_result["end_angle"]

            # ── Step 6: Tính góc mở và hướng quay ──
            opening_angle = abs(arc_result["end_angle"] - arc_result["start_angle"])
            if opening_angle > 180:
                opening_angle = 360 - opening_angle
            result["opening_angle"] = float(opening_angle)

            # Hướng quay: cross product giữa leaf vector và arc tangent
            swing_direction = self._compute_swing_direction(
                leaf_line, hinge_point, arc_result
            )
            result["swing_direction"] = swing_direction

            # Hinge side
            result["hinge_side"] = self._compute_hinge_side(
                hinge_global, bbox
            )

            # Door centerline (cánh cửa kéo dài hoàn toàn từ hinge đến đầu mút)
            p1_x, p1_y = leaf_line_global["p1"]
            p2_x, p2_y = leaf_line_global["p2"]
            dist1 = math.sqrt((p1_x - hinge_global[0]) ** 2 + (p1_y - hinge_global[1]) ** 2)
            dist2 = math.sqrt((p2_x - hinge_global[0]) ** 2 + (p2_y - hinge_global[1]) ** 2)
            if dist1 <= dist2:
                far_end = (p2_x, p2_y)
            else:
                far_end = (p1_x, p1_y)
            result["door_centerline"] = {
                "p1": hinge_global,
                "p2": far_end,
            }

            # Tính confidence
            result["geometry_confidence"] = self.compute_geometry_confidence(result)

            # Wall snap nếu có wall data
            if walls:
                result = self.snap_to_wall(result, walls)

        except Exception as e:
            logger.error("Lỗi refine_door_geometry: %s", e, exc_info=True)
            result["geometry_confidence"] = 0.0

        return result

    # ── snap_to_wall ──────────────────────────────────────

    def snap_to_wall(
        self,
        door_geometry: Dict[str, Any],
        walls: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Snap hình học cửa vào tường gần nhất.

        Chiếu door centerline lên wall axis, kiểm tra alignment:
            - Sai lệch góc < 15°
            - Khoảng cách < 20px

        Args:
            door_geometry: Dict kết quả từ refine_door_geometry().
            walls: Danh sách wall segments [{p1: {x,y}, p2: {x,y}}, ...].

        Returns:
            door_geometry cập nhật thêm:
                - wall_attachment: {wall_index, projected_hinge, projected_end, distance}
                - snap_valid: bool
        """
        door_geometry.setdefault("wall_attachment", None)
        door_geometry.setdefault("snap_valid", False)

        if not walls:
            return door_geometry

        try:
            hinge = door_geometry.get("hinge_point")
            centerline = door_geometry.get("door_centerline")
            if hinge is None or centerline is None:
                return door_geometry

            # Door centerline direction
            cl_p1 = centerline["p1"]
            cl_p2 = centerline["p2"]
            door_dx = cl_p2[0] - cl_p1[0]
            door_dy = cl_p2[1] - cl_p1[1]
            door_angle = math.degrees(math.atan2(door_dy, door_dx))

            best_wall_idx = -1
            best_dist = float("inf")
            best_proj_hinge = None
            best_proj_end = None
            best_angle_dev = 180.0

            for i, wall in enumerate(walls):
                try:
                    wp1 = wall.get("p1", {})
                    wp2 = wall.get("p2", {})
                    wsx = float(wp1.get("x", 0))
                    wsy = float(wp1.get("y", 0))
                    wex = float(wp2.get("x", 0))
                    wey = float(wp2.get("y", 0))

                    wall_dx = wex - wsx
                    wall_dy = wey - wsy
                    wall_len = math.sqrt(wall_dx ** 2 + wall_dy ** 2)
                    if wall_len < 1:
                        continue

                    wall_angle = math.degrees(math.atan2(wall_dy, wall_dx))

                    # Sai lệch góc (chuẩn hóa 0-90°)
                    angle_dev = abs(door_angle - wall_angle) % 180
                    if angle_dev > 90:
                        angle_dev = 180 - angle_dev

                    # Chiếu hinge lên wall
                    proj_h = _project_point_onto_line(
                        hinge, (wsx, wsy), (wex, wey)
                    )
                    dist = math.sqrt(
                        (hinge[0] - proj_h[0]) ** 2 + (hinge[1] - proj_h[1]) ** 2
                    )

                    if dist < best_dist:
                        best_dist = dist
                        best_wall_idx = i
                        best_proj_hinge = proj_h
                        best_proj_end = _project_point_onto_line(
                            cl_p2, (wsx, wsy), (wex, wey)
                        )
                        best_angle_dev = angle_dev
                except (KeyError, TypeError, ValueError):
                    continue

            if best_wall_idx >= 0:
                snap_valid = (
                    best_angle_dev < _SNAP_ANGLE_TOL and best_dist < _SNAP_DIST_TOL
                )
                door_geometry["wall_attachment"] = {
                    "wall_index": best_wall_idx,
                    "projected_hinge": best_proj_hinge,
                    "projected_end": best_proj_end,
                    "distance": float(best_dist),
                    "angle_deviation": float(best_angle_dev),
                }
                door_geometry["snap_valid"] = snap_valid

                # Nếu snap hợp lệ, cập nhật hinge point
                if snap_valid and best_proj_hinge is not None:
                    door_geometry["hinge_point"] = best_proj_hinge
                    logger.info(
                        "Door snap to wall %d (dist=%.1f, angle_dev=%.1f°)",
                        best_wall_idx,
                        best_dist,
                        best_angle_dev,
                    )

        except Exception as e:
            logger.error("Lỗi snap_to_wall: %s", e, exc_info=True)

        return door_geometry

    # ── compute_geometry_confidence ───────────────────────

    def compute_geometry_confidence(
        self, door_geometry: Dict[str, Any]
    ) -> float:
        """Đánh giá chất lượng fit hình học tổng thể.

        Tiêu chí:
            - Có leaf line? (+0.25)
            - Leaf line đủ dài so với bbox? (+0.20)
            - Arc fit quality > 0? (+0.25)
            - Opening angle hợp lý (10°-120°)? (+0.15)
            - Hinge point nằm trong/gần bbox? (+0.15)

        Args:
            door_geometry: Dict kết quả hình học.

        Returns:
            Confidence score 0.0 - 1.0.
        """
        try:
            score = 0.0

            # (1) Có leaf line
            leaf = door_geometry.get("leaf_line")
            if leaf and leaf.get("length", 0) > 0:
                score += 0.25

                # (2) Leaf line dài hợp lý
                leaf_len = leaf["length"]
                if leaf_len > 20:
                    score += 0.20 * min(leaf_len / 100.0, 1.0)

            # (3) Arc fit quality
            arc_radius = door_geometry.get("arc_radius", 0)
            if arc_radius > 5:
                score += 0.25

            # (4) Opening angle hợp lý
            opening = door_geometry.get("opening_angle", 0)
            if 10.0 <= opening <= 120.0:
                score += 0.15
            elif 5.0 <= opening <= 150.0:
                score += 0.08

            # (5) Hinge point tồn tại
            hinge = door_geometry.get("hinge_point")
            if hinge is not None:
                score += 0.15

            return float(min(1.0, max(0.0, score)))

        except Exception:
            return 0.0

    # ── Private helpers ───────────────────────────────────

    def _default_geometry_result(
        self, bbox: List[float], door_type: str
    ) -> Dict[str, Any]:
        """Tạo dict kết quả mặc định (khi không phân tích được)."""
        x1, y1, x2, y2 = [float(v) for v in bbox]
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0

        return {
            "hinge_point": None,
            "leaf_line": None,
            "arc_center": (cx, cy),
            "arc_radius": 0.0,
            "arc_start_angle": 0.0,
            "arc_end_angle": 0.0,
            "swing_direction": "unknown",
            "hinge_side": "unknown",
            "opening_angle": 0.0,
            "door_centerline": {"p1": (x1, cy), "p2": (x2, cy)},
            "geometry_confidence": 0.0,
            "door_type": door_type,
            "wall_attachment": None,
            "snap_valid": False,
        }

    def _find_wall_frame_line(
        self,
        lines: np.ndarray,
        leaf_line: Dict[str, Any],
        box_center: Tuple[float, float],
        box_dims: Tuple[float, float],
    ) -> Optional[Dict[str, Any]]:
        """Tìm đoạn thẳng khung tường (vuông góc ±30° với leaf line).

        Args:
            lines: Mảng đoạn thẳng từ HoughLinesP.
            leaf_line: Đoạn thẳng cánh cửa đã tìm.
            box_center: Tâm ROI.
            box_dims: Kích thước ROI.

        Returns:
            Dict {p1, p2, angle, length} hoặc None.
        """
        if lines is None or leaf_line is None:
            return None

        leaf_angle = leaf_line["angle"]
        best_score = -1.0
        best_wall = None
        cx, cy = box_center
        diag = math.sqrt(box_dims[0] ** 2 + box_dims[1] ** 2) + 1e-6

        for ln in lines:
            x1, y1, x2, y2 = ln[0]
            length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            if length < 10:
                continue

            angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
            angle_diff = abs(angle - leaf_angle) % 180

            # Kiểm tra vuông góc (90° ± 30°)
            if 60 <= angle_diff <= 120:
                mid_x = (x1 + x2) / 2.0
                mid_y = (y1 + y2) / 2.0
                dist = math.sqrt((mid_x - cx) ** 2 + (mid_y - cy) ** 2)

                length_score = min(length / diag, 1.0)
                prox_score = max(0.0, 1.0 - dist / diag)
                score = 0.5 * length_score + 0.5 * prox_score

                if score > best_score:
                    best_score = score
                    best_wall = {
                        "p1": (float(x1), float(y1)),
                        "p2": (float(x2), float(y2)),
                        "angle": float(angle),
                        "length": float(length),
                    }

        return best_wall

    def _compute_swing_direction(
        self,
        leaf_line: Dict[str, Any],
        hinge_point: Tuple[float, float],
        arc_result: Dict[str, Any],
    ) -> str:
        """Xác định hướng quay (CW/CCW) bằng cross product.

        Cross product giữa:
            - Vector từ hinge tới cuối cánh cửa (leaf vector)
            - Vector từ hinge tới tâm arc

        Nếu cross product > 0 → counterclockwise, < 0 → clockwise.
        """
        try:
            # Leaf vector: từ hinge tới đầu xa của leaf
            lp1 = leaf_line["p1"]
            lp2 = leaf_line["p2"]

            # Chọn đầu xa hinge
            d1 = math.sqrt(
                (lp1[0] - hinge_point[0]) ** 2 + (lp1[1] - hinge_point[1]) ** 2
            )
            d2 = math.sqrt(
                (lp2[0] - hinge_point[0]) ** 2 + (lp2[1] - hinge_point[1]) ** 2
            )
            far_end = lp2 if d2 > d1 else lp1

            leaf_vx = far_end[0] - hinge_point[0]
            leaf_vy = far_end[1] - hinge_point[1]

            # Arc center vector
            ac = arc_result["center"]
            arc_vx = ac[0] - hinge_point[0]
            arc_vy = ac[1] - hinge_point[1]

            cross = leaf_vx * arc_vy - leaf_vy * arc_vx

            if cross > 0:
                return "counterclockwise"
            elif cross < 0:
                return "clockwise"
            else:
                return "unknown"
        except Exception:
            return "unknown"

    def _compute_hinge_side(
        self,
        hinge_point: Tuple[float, float],
        bbox: List[float],
    ) -> str:
        """Xác định bản lề ở cạnh nào của bbox.

        So sánh khoảng cách từ hinge tới 4 cạnh của bbox.
        """
        try:
            hx, hy = hinge_point
            x1, y1, x2, y2 = [float(v) for v in bbox]

            distances = {
                "left": abs(hx - x1),
                "right": abs(hx - x2),
                "top": abs(hy - y1),
                "bottom": abs(hy - y2),
            }
            return min(distances, key=distances.get)
        except Exception:
            return "unknown"
