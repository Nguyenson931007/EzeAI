"""
door_ocr.py
===========
Multi-pass Rotated OCR Engine cho nhận diện kích thước cửa EzeFloor.

Pipeline OCR cửa:
    Crop door region → Xoay 0°/90°/180°/270° → Enhance (CLAHE, bilateral, sharpen)
    → OCR (EasyOCR qua services.ocr.run_ocr) → Regex match kích thước
    → Fuzzy semantic correction → Kết quả cuối cùng

Mô-đun này trích xuất chiều rộng cửa (mm) từ ảnh mặt bằng CAD,
hỗ trợ các pattern phổ biến trong bản vẽ Úc:
    - Số thuần: 820, 870, 920, 1020, 1200
    - Có prefix: SD820, CSD920, CS870, BF1200

Tính năng:
    - Multi-orientation OCR (4 hướng xoay)
    - Image enhancement pipeline (bilateral + CLAHE + sharpen)
    - Fuzzy OCR error correction (8→B, Z→2, O→0, ...)
    - Persistent correction memory (ocr_correction_memory.json)

Dependencies:
    cv2, numpy, re, json, PIL, services.ocr
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────

_CROP_PAD = 60  # Padding khi crop vùng cửa

# Regex: kích thước cửa phổ biến Úc (mm) — 460 → 1450, bội số 5 hoặc 0
_WIDTH_PATTERN = re.compile(r"\b([456789]\d[05]|1[01234]\d[05])\b")

# Regex: kích thước có prefix (SD, CSD, CS, BF)
_PREFIX_PATTERN = re.compile(r"(SD|CSD|CS|BF)\s*(\d{3,4})")

# Sharpening kernel
_SHARPEN_KERNEL = np.array(
    [[ 0, -1,  0],
     [-1,  5, -1],
     [ 0, -1,  0]],
    dtype=np.float32,
)

# Correction memory file path (trong thư mục backend/services/)
_MEMORY_FILE = Path(__file__).parent / "ocr_correction_memory.json"

# Common OCR confusion mapping (ký tự hay bị nhận nhầm)
_CHAR_CONFUSION: Dict[str, str] = {
    "O": "0",
    "o": "0",
    "Z": "2",
    "z": "2",
    "S": "5",
    "s": "5",
    "I": "1",
    "l": "1",
    "B": "8",
    "G": "6",
    "T": "7",
    "q": "9",
}

# Từ khóa prefix hợp lệ
_VALID_PREFIXES = {"SD", "CSD", "CS", "BF"}


# ─────────────────────────────────────────────────────────────
# DoorOCREngine
# ─────────────────────────────────────────────────────────────

class DoorOCREngine:
    """Engine OCR chuyên dụng cho kích thước cửa trên bản vẽ CAD.

    Quy trình:
        1. Crop vùng cửa từ ảnh gốc (có padding)
        2. Xoay crop 4 hướng (0°, 90°, 180°, 270°)
        3. Enhance mỗi hướng (bilateral filter + CLAHE + sharpen)
        4. OCR bằng EasyOCR (qua services.ocr.run_ocr)
        5. Regex match + fuzzy correction → trích xuất width (mm)

    Sử dụng:
        >>> engine = DoorOCREngine()
        >>> result = engine.extract_door_width(image_np, [100, 200, 300, 400])
        >>> print(result['width_mm'])  # 820
    """

    def __init__(self, memory_path: Optional[str] = None) -> None:
        """Khởi tạo OCR engine.

        Args:
            memory_path: Đường dẫn tới file correction memory (tùy chọn).
                         Mặc định: ocr_correction_memory.json cùng thư mục.
        """
        self.memory_path = Path(memory_path) if memory_path else _MEMORY_FILE
        self._correction_memory: Dict[str, str] = {}
        self._load_correction_memory()

    # ── extract_door_width ────────────────────────────────

    def extract_door_width(
        self,
        image_np: np.ndarray,
        bbox: List[float],
        real_scale: float = 1.0,
    ) -> Dict[str, Any]:
        """Trích xuất chiều rộng cửa (mm) từ ảnh và bounding box.

        Pipeline:
            1. Crop vùng cửa + padding
            2. Xoay 4 hướng
            3. OCR + enhance mỗi hướng
            4. Tìm pattern kích thước
            5. Chọn kết quả tốt nhất

        Args:
            image_np: Ảnh gốc numpy array (H, W, 3).
            bbox: Bounding box [x1, y1, x2, y2].
            real_scale: Tỉ lệ pixel → mm (mặc định 1.0).

        Returns:
            Dict:
                - width_mm: int hoặc None
                - raw_text: str (text thô OCR)
                - corrected_text: str (text đã correction)
                - prefix: str hoặc None (SD, CSD, CS, BF)
                - ocr_confidence: float (0.0-1.0)
                - orientation_found: int (góc xoay tìm được)
        """
        result = {
            "width_mm": None,
            "raw_text": "",
            "corrected_text": "",
            "prefix": None,
            "ocr_confidence": 0.0,
            "orientation_found": -1,
        }

        try:
            # ── Step 1: Crop ROI ──
            x1, y1, x2, y2 = [int(v) for v in bbox]
            img_h, img_w = image_np.shape[:2]
            pad = _CROP_PAD

            cx1 = max(0, x1 - pad)
            cy1 = max(0, y1 - pad)
            cx2 = min(img_w, x2 + pad)
            cy2 = min(img_h, y2 + pad)

            crop = image_np[cy1:cy2, cx1:cx2]
            if crop.size == 0:
                logger.warning("Crop rỗng cho bbox %s", bbox)
                return result

            # ── Step 2-4: Multi-orientation OCR ──
            orientations = [0, 90, 180, 270]
            best_width = None
            best_conf = 0.0
            best_raw = ""
            best_corrected = ""
            best_prefix = None
            best_angle = -1

            for angle in orientations:
                try:
                    rotated = self._rotate_crop(crop, angle)

                    # Thử OCR trên ảnh gốc trước
                    ocr_results = self._run_ocr_on_crop(rotated)

                    # Nếu ít kết quả, thử enhance
                    if not ocr_results or all(r.get("conf", 0) < 0.3 for r in ocr_results):
                        enhanced = self._enhance_image(rotated)
                        ocr_results_enhanced = self._run_ocr_on_crop(enhanced)
                        if ocr_results_enhanced:
                            ocr_results = ocr_results + ocr_results_enhanced

                    # Phân tích kết quả OCR
                    for ocr_item in ocr_results:
                        raw_text = ocr_item.get("text", "")
                        conf = float(ocr_item.get("conf", 0))

                        if not raw_text.strip():
                            continue

                        corrected = self._semantic_correct(raw_text)
                        width, prefix = self._extract_width_from_text(corrected)

                        if width is not None and conf > best_conf:
                            best_width = width
                            best_conf = conf
                            best_raw = raw_text
                            best_corrected = corrected
                            best_prefix = prefix
                            best_angle = angle

                except Exception as e:
                    logger.debug("OCR orientation %d° failed: %s", angle, e)
                    continue

            # ── Populate result ──
            if best_width is not None:
                result["width_mm"] = int(best_width)
                result["raw_text"] = best_raw
                result["corrected_text"] = best_corrected
                result["prefix"] = best_prefix
                result["ocr_confidence"] = float(best_conf)
                result["orientation_found"] = best_angle

        except Exception as e:
            logger.error("Lỗi extract_door_width: %s", e, exc_info=True)

        return result

    # ── _semantic_correct ─────────────────────────────────

    def _semantic_correct(self, raw_text: str) -> str:
        """Sửa lỗi OCR phổ biến bằng fuzzy semantic rules.

        Áp dụng:
            1. Tra cứu persistent memory trước
            2. Áp dụng các mapping cụ thể (8ZO → 820, B2O → 820, ...)
            3. Sửa ký tự trong ngữ cảnh số (O→0, Z→2, S→5, ...)

        Args:
            raw_text: Text thô từ OCR.

        Returns:
            Text đã được sửa lỗi.
        """
        text = raw_text.strip()
        if not text:
            return text

        # (1) Persistent memory lookup
        upper_text = text.upper()
        if upper_text in self._correction_memory:
            return self._correction_memory[upper_text]

        # (2) Specific mappings (thường gặp nhất)
        specific_fixes: Dict[str, str] = {
            "8ZO": "820",
            "8Z0": "820",
            "B2O": "820",
            "B20": "820",
            "82O": "820",
            "8T0": "870",
            "8TO": "870",
            "87O": "870",
            "B7O": "870",
            "B70": "870",
            "9ZO": "920",
            "9Z0": "920",
            "92O": "920",
            "1O20": "1020",
            "10Z0": "1020",
            "1OZO": "1020",
            "12OO": "1200",
            "1Z00": "1200",
            "I200": "1200",
            "l200": "1200",
            "5D920": "SD920",
            "S0920": "SD920",
            "50920": "SD920",
            "CSD9ZO": "CSD920",
            "C5D920": "CSD920",
            "C50920": "CSD920",
            "CS0920": "CSD920",
            "C5D9Z0": "CSD920",
            "5D820": "SD820",
            "5D870": "SD870",
            "8F1200": "BF1200",
            "BFI200": "BF1200",
            "8F12OO": "BF1200",
        }

        if upper_text in specific_fixes:
            return specific_fixes[upper_text]

        # (3) Context-aware character correction
        corrected = self._correct_chars_in_context(text)

        return corrected

    def _correct_chars_in_context(self, text: str) -> str:
        """Sửa ký tự dựa trên ngữ cảnh (prefix vs numeric).

        Logic:
            - Nếu đoạn đầu match prefix (SD, CSD, CS, BF) → giữ nguyên prefix
            - Phần còn lại (số) → sửa O→0, Z→2, S→5, I→1, ...
        """
        upper = text.upper()

        # Tách prefix nếu có
        prefix_match = re.match(r"^(CSD|SD|CS|BF)\s*", upper)
        if prefix_match:
            prefix = prefix_match.group(1)
            numeric_part = upper[prefix_match.end():]
        else:
            prefix = ""
            numeric_part = upper

        # Sửa ký tự trong phần số
        corrected_digits = []
        for ch in numeric_part:
            if ch.isdigit():
                corrected_digits.append(ch)
            elif ch in _CHAR_CONFUSION:
                corrected_digits.append(_CHAR_CONFUSION[ch])
            elif ch.isspace():
                continue  # Bỏ qua khoảng trắng trong phần số
            else:
                corrected_digits.append(ch)

        corrected_numeric = "".join(corrected_digits)
        return f"{prefix}{corrected_numeric}" if prefix else corrected_numeric

    # ── _enhance_image ────────────────────────────────────

    def _enhance_image(self, crop_np: np.ndarray) -> np.ndarray:
        """Enhance ảnh crop để cải thiện OCR.

        Pipeline:
            1. Bilateral filter (giảm noise, giữ edge)
            2. CLAHE contrast enhancement
            3. Sharpening kernel

        Args:
            crop_np: Ảnh crop numpy array.

        Returns:
            Ảnh đã enhance.
        """
        try:
            img = crop_np.copy()

            # (1) Bilateral filter
            if len(img.shape) == 3:
                img = cv2.bilateralFilter(img, d=9, sigmaColor=75, sigmaSpace=75)
            else:
                img = cv2.bilateralFilter(img, d=9, sigmaColor=75, sigmaSpace=75)

            # (2) CLAHE contrast
            if len(img.shape) == 3:
                # Chuyển sang LAB, apply CLAHE trên L channel
                lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
                l_channel = lab[:, :, 0]
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                l_channel = clahe.apply(l_channel)
                lab[:, :, 0] = l_channel
                img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
            else:
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                img = clahe.apply(img)

            # (3) Sharpening
            img = cv2.filter2D(img, -1, _SHARPEN_KERNEL)

            return img

        except Exception as e:
            logger.warning("Image enhancement failed: %s", e)
            return crop_np

    # ── save_correction ───────────────────────────────────

    def save_correction(self, raw_text: str, corrected_text: str) -> None:
        """Lưu cặp correction vào persistent memory.

        Ghi thêm vào file ocr_correction_memory.json để engine
        học dần các lỗi OCR đặc thù cho project.

        Args:
            raw_text: Text thô gốc từ OCR.
            corrected_text: Text đã được sửa đúng.
        """
        try:
            key = raw_text.strip().upper()
            value = corrected_text.strip()

            if not key or not value:
                return

            self._correction_memory[key] = value

            # Đọc file hiện tại (nếu có) rồi merge
            existing: Dict[str, str] = {}
            if self.memory_path.exists():
                try:
                    with open(self.memory_path, "r", encoding="utf-8") as f:
                        existing = json.load(f)
                except (json.JSONDecodeError, IOError):
                    existing = {}

            existing[key] = value

            with open(self.memory_path, "w", encoding="utf-8") as f:
                json.dump(existing, f, indent=2, ensure_ascii=False)

            logger.info("Saved OCR correction: '%s' → '%s'", key, value)

        except Exception as e:
            logger.error("Không thể lưu OCR correction: %s", e)

    # ── Private helpers ───────────────────────────────────

    def _load_correction_memory(self) -> None:
        """Load persistent correction memory từ JSON file."""
        if self.memory_path.exists():
            try:
                with open(self.memory_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    self._correction_memory = {
                        k.upper(): v for k, v in data.items()
                    }
                    logger.info(
                        "Loaded %d OCR corrections from %s",
                        len(self._correction_memory),
                        self.memory_path,
                    )
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(
                    "Không thể đọc correction memory: %s", e
                )
                self._correction_memory = {}

    def _rotate_crop(self, crop: np.ndarray, angle: int) -> np.ndarray:
        """Xoay ảnh crop theo góc (0, 90, 180, 270).

        Args:
            crop: Ảnh numpy array.
            angle: Góc xoay (0, 90, 180, 270).

        Returns:
            Ảnh đã xoay.
        """
        if angle == 0:
            return crop
        elif angle == 90:
            return cv2.rotate(crop, cv2.ROTATE_90_CLOCKWISE)
        elif angle == 180:
            return cv2.rotate(crop, cv2.ROTATE_180)
        elif angle == 270:
            return cv2.rotate(crop, cv2.ROTATE_90_COUNTERCLOCKWISE)
        else:
            return crop

    def _run_ocr_on_crop(self, crop_np: np.ndarray) -> List[Dict[str, Any]]:
        """Chạy OCR trên crop, trả về list of {text, conf, bbox}.

        Sử dụng services.ocr.run_ocr (EasyOCR).
        Chuyển numpy → PIL Image trước khi gọi.
        """
        try:
            from services.ocr import run_ocr

            # Đảm bảo RGB
            if len(crop_np.shape) == 3 and crop_np.shape[2] == 3:
                # OpenCV BGR → RGB
                rgb = cv2.cvtColor(crop_np, cv2.COLOR_BGR2RGB)
            elif len(crop_np.shape) == 2:
                rgb = cv2.cvtColor(crop_np, cv2.COLOR_GRAY2RGB)
            else:
                rgb = crop_np

            pil_img = Image.fromarray(rgb)
            results = run_ocr(pil_img)
            return results if results else []

        except ImportError:
            logger.warning("Không thể import services.ocr.run_ocr")
            return []
        except Exception as e:
            logger.error("OCR execution error: %s", e)
            return []

    def _extract_width_from_text(
        self, text: str
    ) -> Tuple[Optional[int], Optional[str]]:
        """Trích xuất chiều rộng (mm) từ text đã correction.

        Tìm theo thứ tự ưu tiên:
            1. Prefix pattern (SD820, CSD920, ...)
            2. Standalone number (820, 920, ...)

        Args:
            text: Text đã qua semantic correction.

        Returns:
            Tuple (width_mm, prefix) hoặc (None, None).
        """
        if not text:
            return None, None

        upper = text.upper().strip()

        # (1) Prefix pattern
        prefix_match = _PREFIX_PATTERN.search(upper)
        if prefix_match:
            prefix = prefix_match.group(1)
            width_str = prefix_match.group(2)
            try:
                width = int(width_str)
                if 400 <= width <= 2400:
                    return width, prefix
            except ValueError:
                pass

        # (2) Standalone width pattern
        width_match = _WIDTH_PATTERN.search(upper)
        if width_match:
            try:
                width = int(width_match.group(1))
                if 400 <= width <= 2400:
                    return width, None
            except ValueError:
                pass

        # (3) Fallback: tìm bất kỳ số 3-4 chữ số nào trong range hợp lý
        all_nums = re.findall(r"\b(\d{3,4})\b", upper)
        for num_str in all_nums:
            try:
                num = int(num_str)
                if 400 <= num <= 2400:
                    return num, None
            except ValueError:
                continue

        return None, None
