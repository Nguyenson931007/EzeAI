"""
bim_semantic_engine.py
======================
BIM Semantic Room-Door-Wall Graph Engine cho EzeFloor.

Engine xây dựng đồ thị ngữ nghĩa liên kết Phòng ↔ Cửa ↔ Tường, phục vụ:
    - Kiểm tra tính hợp lệ ngữ nghĩa của cửa (ensuite → bedroom↔bathroom)
    - Phân loại phòng (wet/dry/outdoor/utility/circulation)
    - Tính confidence đa tầng (detect × geometry × OCR × semantic)

Cấu trúc đồ thị:
    nodes: [{id, name, type, polygon}]   — Các phòng
    edges: [{door_id, room_a, room_b, door_type}] — Cửa kết nối

Semantic Rules (tiêu chuẩn xây dựng Úc):
    1. Ensuite doors PHẢI nối Bedroom ↔ Bathroom/Wetroom
    2. Sliding doors thường nối interior ↔ outdoor (Alfresco, Balcony, Deck)
    3. Cavity sliders chỉ dùng cho vách ngăn nội bộ
    4. Cửa trôi (floating door) = không kết nối phòng nào → cảnh báo
    5. Cửa rộng hơn tường mở → geometry bất khả thi

Dependencies:
    shapely (Polygon, Point, LineString), math
"""

import logging
import math
import re
from typing import Any, Dict, List, Optional, Tuple

try:
    from shapely.geometry import LineString, Point, Polygon
    from shapely.ops import nearest_points
    _HAS_SHAPELY = True
except ImportError:
    _HAS_SHAPELY = False

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Room Type Classification Keywords
# ─────────────────────────────────────────────────────────────

_WET_KEYWORDS = {
    "bathroom", "bath", "ensuite", "ens", "laundry", "ldry", "ldy",
    "toilet", "wc", "powder", "pwdr", "pdr", "pwd", "wetroom",
    "shower", "washroom",
}

_OUTDOOR_KEYWORDS = {
    "alfresco", "balcony", "deck", "patio", "veranda", "courtyard",
    "porch", "terrace", "pergola", "outdoor",
}

_UTILITY_KEYWORDS = {
    "garage", "storage", "store", "pantry", "linen", "mud", "mudroom",
    "workshop", "shed", "cellar", "wir", "robe", "bir", "wil",
    "carport", "boiler",
}

_CIRCULATION_KEYWORDS = {
    "hallway", "hall", "foyer", "entry", "corridor", "stairs",
    "staircase", "landing", "lobby", "passage", "vestibule",
    "void", "lift",
}

# Door type semantic rules
_ENSUITE_DOOR_TYPES = {"single_door", "cavity_slider"}
_SLIDING_DOOR_TYPES = {"sliding_door", "bi_fold"}

# Proximity tolerance for room-door matching (pixels)
_DOOR_ROOM_PROXIMITY = 30.0

# Confidence weights
_W_DETECT = 0.30
_W_GEOMETRY = 0.30
_W_OCR = 0.10
_W_SEMANTIC = 0.30


# ─────────────────────────────────────────────────────────────
# BIMSemanticEngine
# ─────────────────────────────────────────────────────────────

class BIMSemanticEngine:
    """Engine ngữ nghĩa BIM cho hệ thống Room-Door-Wall graph.

    Chức năng chính:
        1. Xây dựng đồ thị phòng-cửa (room connectivity graph)
        2. Kiểm tra tính hợp lệ ngữ nghĩa cửa
        3. Phân loại loại phòng
        4. Tính confidence đa tầng

    Sử dụng:
        >>> engine = BIMSemanticEngine()
        >>> graph = engine.build_room_graph(rooms, doors, walls)
        >>> validation = engine.validate_door_semantics(door, connected_rooms)
    """

    def __init__(self) -> None:
        """Khởi tạo BIM Semantic Engine."""
        if not _HAS_SHAPELY:
            logger.warning(
                "Shapely không được cài đặt. "
                "Một số chức năng polygon sẽ bị giới hạn."
            )

    # ── build_room_graph ──────────────────────────────────

    def build_room_graph(
        self,
        rooms: List[Dict[str, Any]],
        doors: List[Dict[str, Any]],
        walls: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Xây dựng đồ thị kết nối phòng qua cửa.

        Với mỗi cửa, tìm 2 phòng mà endpoints của cửa giao hoặc liền kề.
        Kết quả là đồ thị nodes (phòng) và edges (cửa kết nối).

        Args:
            rooms: Danh sách phòng, mỗi phòng có:
                - name: str (tên phòng)
                - polygon: list of {x, y} (đỉnh đa giác)
                - Các trường tùy chọn khác (id, class_name, ...)
            doors: Danh sách cửa, mỗi cửa có:
                - id: str
                - bbox: [x1, y1, x2, y2] hoặc points: [{x,y}, ...]
                - type: str (loại cửa)
                - conf: float
            walls: Danh sách wall segments (tùy chọn), mỗi wall có:
                - p1: {x, y}
                - p2: {x, y}

        Returns:
            Dict:
                - nodes: [{id, name, type, polygon}]
                - edges: [{door_id, room_a, room_b, door_type}]
                - floating_doors: [door_ids không kết nối phòng nào]
        """
        graph: Dict[str, Any] = {
            "nodes": [],
            "edges": [],
            "floating_doors": [],
        }

        if not _HAS_SHAPELY:
            logger.error("Shapely cần thiết cho build_room_graph")
            return graph

        # ── Build room nodes ──
        room_polygons: List[Tuple[int, str, Polygon]] = []
        for i, room in enumerate(rooms):
            room_id = room.get("id", f"room_{i}")
            room_name = room.get("name", room.get("room_name", f"Room {i}"))
            poly_pts = room.get("polygon", [])

            room_type = self.classify_room_type(room_name)

            node = {
                "id": room_id,
                "name": room_name,
                "type": room_type,
                "polygon": poly_pts,
            }
            graph["nodes"].append(node)

            # Tạo Shapely polygon
            if len(poly_pts) >= 3:
                try:
                    coords = [(p["x"], p["y"]) for p in poly_pts]
                    poly = Polygon(coords)
                    if not poly.is_valid:
                        poly = poly.buffer(0)
                    room_polygons.append((i, room_id, poly))
                except Exception as e:
                    logger.debug("Polygon invalid cho room %s: %s", room_id, e)

        # ── Match doors to rooms ──
        for door in doors:
            door_id = door.get("id", "unknown_door")
            door_type = door.get("type", door.get("door_type", "single_door"))

            # Lấy door endpoints
            door_endpoints = self._get_door_endpoints(door)
            if not door_endpoints:
                graph["floating_doors"].append(door_id)
                continue

            # Tìm phòng chứa/liền kề
            connected_rooms = self._find_connected_rooms(
                door_endpoints, room_polygons
            )

            if len(connected_rooms) >= 2:
                # Kết nối 2 phòng
                graph["edges"].append({
                    "door_id": door_id,
                    "room_a": connected_rooms[0],
                    "room_b": connected_rooms[1],
                    "door_type": door_type,
                })
            elif len(connected_rooms) == 1:
                # Chỉ kết nối 1 phòng (có thể cửa ra ngoài)
                graph["edges"].append({
                    "door_id": door_id,
                    "room_a": connected_rooms[0],
                    "room_b": None,
                    "door_type": door_type,
                })
            else:
                graph["floating_doors"].append(door_id)

        logger.info(
            "Room graph: %d nodes, %d edges, %d floating doors",
            len(graph["nodes"]),
            len(graph["edges"]),
            len(graph["floating_doors"]),
        )
        return graph

    # ── validate_door_semantics ───────────────────────────

    def validate_door_semantics(
        self,
        door: Dict[str, Any],
        connected_rooms: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Kiểm tra tính hợp lệ ngữ nghĩa của cửa theo quy tắc xây dựng.

        Rules:
            1. Ensuite doors PHẢI nối Bedroom ↔ Bathroom/Wetroom
            2. Sliding doors thường nối interior ↔ outdoor
            3. Cavity sliders chỉ cho internal partition
            4. Floating doors (không nối phòng) → cảnh báo
            5. Cửa rộng hơn wall opening → geometry bất khả thi

        Args:
            door: Dict thông tin cửa (type, width_mm, bbox, ...).
            connected_rooms: Danh sách phòng kết nối [{name, type, ...}].

        Returns:
            Dict:
                - is_valid: bool
                - warnings: List[str]
                - semantic_confidence: float (0.0-1.0)
        """
        warnings: List[str] = []
        confidence = 1.0
        door_type = door.get("type", door.get("door_type", "single_door"))
        door_id = door.get("id", "unknown")
        door_width = door.get("width_mm", door.get("width", 0))

        # ── Rule 1: Floating door ──
        if not connected_rooms:
            warnings.append(
                f"[FLOATING] Door '{door_id}' không kết nối phòng nào."
            )
            confidence -= 0.4

        # Classify connected room types
        room_types = [
            self.classify_room_type(r.get("name", r.get("room_name", "")))
            for r in connected_rooms
        ]
        room_names = [
            r.get("name", r.get("room_name", "")).upper()
            for r in connected_rooms
        ]

        # ── Rule 2: Ensuite door validation ──
        if "ensuite" in door_type.lower() or any("ENS" in n for n in room_names):
            has_bedroom = "dry" in room_types or any(
                "BED" in n for n in room_names
            )
            has_wet = "wet" in room_types
            if len(connected_rooms) >= 2 and not (has_bedroom and has_wet):
                warnings.append(
                    f"[ENSUITE] Door '{door_id}' đánh dấu ensuite nhưng "
                    f"không nối Bedroom↔Bathroom. Rooms: {room_names}"
                )
                confidence -= 0.2

        # ── Rule 3: Sliding door → interior ↔ outdoor ──
        if door_type in _SLIDING_DOOR_TYPES:
            has_outdoor = "outdoor" in room_types
            if len(connected_rooms) >= 2 and not has_outdoor:
                warnings.append(
                    f"[SLIDING] Door '{door_id}' loại sliding/bi-fold nhưng "
                    f"không nối outdoor area. Rooms: {room_names}"
                )
                confidence -= 0.1  # Chỉ cảnh báo nhẹ (sliding cũng dùng nội bộ)

        # ── Rule 4: Cavity slider → internal only ──
        if door_type == "cavity_slider":
            has_outdoor = "outdoor" in room_types
            if has_outdoor:
                warnings.append(
                    f"[CAVITY] Door '{door_id}' cavity slider nhưng nối outdoor. "
                    f"Cavity sliders chỉ dùng cho internal partition."
                )
                confidence -= 0.25

        # ── Rule 5: Width validation ──
        if door_width:
            if door_width < 400:
                warnings.append(
                    f"[WIDTH] Door '{door_id}' quá hẹp ({door_width}mm < 400mm)."
                )
                confidence -= 0.15
            elif door_width > 2400:
                warnings.append(
                    f"[WIDTH] Door '{door_id}' quá rộng ({door_width}mm > 2400mm). "
                    f"Có thể sai OCR hoặc geometry."
                )
                confidence -= 0.2

            # Standard width check
            standard_widths = {620, 720, 770, 820, 870, 920, 1020, 1200, 1500, 1800, 2100, 2400}
            if door_width not in standard_widths:
                # Kiểm tra gần standard width (±30mm)
                closest = min(standard_widths, key=lambda w: abs(w - door_width))
                if abs(closest - door_width) > 30:
                    warnings.append(
                        f"[WIDTH] Door '{door_id}' width {door_width}mm "
                        f"không phải kích thước tiêu chuẩn. Gần nhất: {closest}mm."
                    )
                    confidence -= 0.05

        # Clamp confidence
        confidence = max(0.0, min(1.0, confidence))

        return {
            "is_valid": len(warnings) == 0,
            "warnings": warnings,
            "semantic_confidence": float(confidence),
        }

    # ── classify_room_type ────────────────────────────────

    def classify_room_type(self, room_name: str) -> str:
        """Phân loại phòng theo từ khóa trong tên.

        Categories:
            - 'wet': Bathroom, ensuite, laundry, toilet, WC, powder
            - 'outdoor': Alfresco, balcony, deck, patio, veranda, courtyard, porch
            - 'utility': Garage, storage, pantry, linen, mud, WIR, robe
            - 'circulation': Hallway, foyer, entry, corridor, stairs
            - 'dry': Mặc định (bedroom, living, kitchen, dining, study, ...)

        Args:
            room_name: Tên phòng (case-insensitive).

        Returns:
            Loại phòng: 'wet', 'dry', 'outdoor', 'utility', 'circulation'.
        """
        if not room_name:
            return "dry"

        name_lower = room_name.lower().strip()
        # Tách thành từ và kiểm tra
        words = set(re.split(r"[^a-zA-Z]+", name_lower))
        words.add(name_lower)  # Thêm full name để match multi-word

        # Thứ tự ưu tiên: wet > outdoor > utility > circulation > dry
        if words & _WET_KEYWORDS:
            return "wet"
        if words & _OUTDOOR_KEYWORDS:
            return "outdoor"
        if words & _UTILITY_KEYWORDS:
            return "utility"
        if words & _CIRCULATION_KEYWORDS:
            return "circulation"

        return "dry"

    # ── compute_confidence ────────────────────────────────

    def compute_confidence(
        self,
        door: Dict[str, Any],
        geometry: Dict[str, Any],
        ocr_result: Dict[str, Any],
        semantic_result: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Tính confidence đa tầng cho kết quả nhận diện cửa.

        Trọng số:
            - detect_confidence: 0.30 (từ YOLO detector)
            - geometry_confidence: 0.30 (từ geometry refinement)
            - ocr_confidence: 0.10 (từ OCR width extraction)
            - semantic_confidence: 0.30 (từ semantic validation)
            - final_confidence: weighted mean

        Args:
            door: Dict cửa gốc (chứa 'conf' từ YOLO).
            geometry: Dict từ DoorRefinementEngine.
            ocr_result: Dict từ DoorOCREngine.
            semantic_result: Dict từ validate_door_semantics.

        Returns:
            Dict:
                - detect_confidence: float
                - geometry_confidence: float
                - ocr_confidence: float
                - semantic_confidence: float
                - final_confidence: float
                - confidence_grade: str ('high', 'medium', 'low', 'very_low')
        """
        try:
            detect_conf = float(door.get("conf", 0.0))
            geo_conf = float(geometry.get("geometry_confidence", 0.0))
            ocr_conf = float(ocr_result.get("ocr_confidence", 0.0))
            sem_conf = float(semantic_result.get("semantic_confidence", 0.0))

            # Clamp tất cả vào [0, 1]
            detect_conf = max(0.0, min(1.0, detect_conf))
            geo_conf = max(0.0, min(1.0, geo_conf))
            ocr_conf = max(0.0, min(1.0, ocr_conf))
            sem_conf = max(0.0, min(1.0, sem_conf))

            final = (
                _W_DETECT * detect_conf
                + _W_GEOMETRY * geo_conf
                + _W_OCR * ocr_conf
                + _W_SEMANTIC * sem_conf
            )
            final = max(0.0, min(1.0, final))

            # Grade
            if final >= 0.8:
                grade = "high"
            elif final >= 0.6:
                grade = "medium"
            elif final >= 0.4:
                grade = "low"
            else:
                grade = "very_low"

            return {
                "detect_confidence": detect_conf,
                "geometry_confidence": geo_conf,
                "ocr_confidence": ocr_conf,
                "semantic_confidence": sem_conf,
                "final_confidence": float(final),
                "confidence_grade": grade,
            }

        except Exception as e:
            logger.error("Lỗi compute_confidence: %s", e)
            return {
                "detect_confidence": 0.0,
                "geometry_confidence": 0.0,
                "ocr_confidence": 0.0,
                "semantic_confidence": 0.0,
                "final_confidence": 0.0,
                "confidence_grade": "very_low",
            }

    # ── Private helpers ───────────────────────────────────

    def _get_door_endpoints(
        self, door: Dict[str, Any]
    ) -> Optional[List[Tuple[float, float]]]:
        """Trích xuất endpoints của cửa từ bbox hoặc points.

        Returns:
            List of (x, y) endpoints, hoặc None.
        """
        try:
            # Ưu tiên points
            points = door.get("points", [])
            if len(points) >= 2:
                return [
                    (float(p.get("x", p[0]) if isinstance(p, dict) else p[0]),
                     float(p.get("y", p[1]) if isinstance(p, dict) else p[1]))
                    for p in points[:2]
                ]

            # Fallback: bbox endpoints (midpoints of short sides)
            bbox = door.get("bbox", [])
            if len(bbox) >= 4:
                x1, y1, x2, y2 = [float(v) for v in bbox[:4]]
                w = x2 - x1
                h = y2 - y1
                if w > h:
                    # Horizontal door
                    return [(x1, (y1 + y2) / 2), (x2, (y1 + y2) / 2)]
                else:
                    # Vertical door
                    return [((x1 + x2) / 2, y1), ((x1 + x2) / 2, y2)]

            return None

        except Exception:
            return None

    def _find_connected_rooms(
        self,
        door_endpoints: List[Tuple[float, float]],
        room_polygons: List[Tuple[int, str, "Polygon"]],
    ) -> List[str]:
        """Tìm phòng mà door endpoints giao hoặc liền kề.

        Thuật toán:
            1. Kiểm tra point-in-polygon (contains)
            2. Kiểm tra khoảng cách gần nhất < threshold
            3. Kiểm tra LineString (door) intersects polygon

        Returns:
            Danh sách room_id kết nối (tối đa 2).
        """
        if not _HAS_SHAPELY:
            return []

        connected: List[str] = []
        scores: List[Tuple[str, float]] = []

        try:
            door_line = LineString(door_endpoints) if len(door_endpoints) >= 2 else None

            for idx, room_id, poly in room_polygons:
                try:
                    # (1) Point-in-polygon
                    for ep in door_endpoints:
                        pt = Point(ep)
                        if poly.contains(pt):
                            scores.append((room_id, 0.0))  # 0 = inside
                            break
                    else:
                        # (2) Distance check
                        min_dist = float("inf")
                        for ep in door_endpoints:
                            pt = Point(ep)
                            d = poly.boundary.distance(pt)
                            min_dist = min(min_dist, d)

                        if min_dist <= _DOOR_ROOM_PROXIMITY:
                            scores.append((room_id, min_dist))

                        # (3) LineString intersection
                        elif door_line is not None and poly.boundary.distance(door_line) <= _DOOR_ROOM_PROXIMITY:
                            scores.append((room_id, poly.boundary.distance(door_line)))

                except Exception:
                    continue

            # Sắp xếp theo khoảng cách (gần nhất trước), lấy tối đa 2
            scores.sort(key=lambda x: x[1])
            seen = set()
            for room_id, _ in scores:
                if room_id not in seen:
                    connected.append(room_id)
                    seen.add(room_id)
                if len(connected) >= 2:
                    break

        except Exception as e:
            logger.error("Lỗi _find_connected_rooms: %s", e)

        return connected
