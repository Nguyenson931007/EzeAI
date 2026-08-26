# WALL PRIOR IMPLEMENTATION REPORT

**Project**: EzeFloor  
**Feature**: AI Wall Prior Spatial Guidance Layer  
**Date**: 2026-08-26  
**Status**: Completed & Verified (100% Automated Tests Passing)

---

## 1. Files Created & Modified

### New Files Created:
1. [`backend/ai/wall_prior/convert_wall_dataset.py`](file:///d:/EzeFloor-main/backend/ai/wall_prior/convert_wall_dataset.py):
   - Chuyển đổi dataset đa lớp (`ext_wall`, `int_wall`, `partition_wall`) sang binary dataset (`0: wall`).
   - Tự động chuẩn hóa tọa độ polygon, loại bỏ các nhãn suy biến, giữ nguyên ảnh gốc và sinh `data.yaml` (`nc: 1`).
2. [`backend/ai/wall_prior/train_wall_prior.py`](file:///d:/EzeFloor-main/backend/ai/wall_prior/train_wall_prior.py):
   - Script huấn luyện YOLO11 Segmentation an toàn trên Windows (`if __name__ == '__main__': main()`, `workers=0`).
   - Hỗ trợ đầy đủ các cờ CLI (`--data`, `--model`, `--epochs`, `--batch`, `--imgsz`, `--workers`, `--device`, `--project`, `--name`).
   - Tự động xuất model trọng số tốt nhất về `backend/models/WallPrior/best.pt`.
3. [`backend/services/wall_prior_service.py`](file:///d:/EzeFloor-main/backend/services/wall_prior_service.py):
   - Singleton service `WallPriorService` quản lý:
     - `load_model()` / `is_available()`: Quản lý và cache mô hình có thread-lock.
     - `generate_probability_map(img_np)`: Tạo 2D continuous probability map $[0.0, 1.0]$.
     - `generate_threshold_mask(prob_map, threshold)`: Tạo binary mask uint8.
     - `generate_soft_roi(prob_map, threshold, padding)`: Trích xuất các vùng Soft ROI mở rộng.
     - `generate_centerline_hint(prob_map)`: Tạo morphological skeleton hỗ trợ nối tường đồng tuyến.
     - `calculate_prior_score(polygon, prob_map)`: Tính xác suất trung bình dưới polygon tường.
     - `apply_soft_guidance(detected_walls, prob_map)`: Áp dụng luật Soft Guidance không làm mất tường độ tự tin cao ($Conf \ge 0.85$).
4. [`tests/test_wall_prior.py`](file:///d:/EzeFloor-main/tests/test_wall_prior.py):
   - 11 unit & integration tests kiểm thử toàn diện toàn bộ các kịch bản Soft Prior, Fallback, Mask, ROI, Guidance rules, Debug stages và Metrics.

### Files Modified:
1. [`backend/services/wall_segment_service.py`](file:///d:/EzeFloor-main/backend/services/wall_segment_service.py):
   - Tích hợp tầng `WallPriorService` vào luồng `WallSegmentService.predict`.
   - Bổ sung hàm xuất 9 ảnh chẩn đoán `_save_wall_prior_debug_artifacts`.
   - Thu thập đầy đủ stage metrics (`raw_yolo_count`, `high_conf_yolo_kept`, `prior_boosted_count`, `after_guidance_count`, v.v.).
2. [`backend/services/model_paths.py`](file:///d:/EzeFloor-main/backend/services/model_paths.py):
   - Đăng ký candidate path `"wall_prior"` trỏ tới `backend/models/WallPrior/best.pt`.

---

## 2. Architecture & Data Flow

```
                     Original Floorplan Image
                                │
                                ▼
                       WallPriorService
                     (Binary YOLO11s-seg)
                                │
                       ┌────────┴────────┐
                       ▼                 ▼
              [Probability Map]   [Soft ROIs]
              (values 0.0 - 1.0)  (dilated bounds)
                       │                 │
                       └────────┬────────┘
                                ▼
                      Existing YOLO11 Wall
                     (best.pt multi-class)
                                │
                                ▼
                       Soft Guidance Engine
                     (Rule of Conservation:
                     YOLO >= 0.85 NEVER deleted;
                     Low conf boosted in high prior)
                                │
                                ▼
                  Existing Wall Geometry Engine
                 (Collinear Merge & Extensions)
                                │
                                ▼
                           Final Walls
```

---

## 3. Dataset Conversion & Training Commands

### Chuyển đổi Dataset:
```bash
python backend/ai/wall_prior/convert_wall_dataset.py --input label_exports/wall --output wall_prior_dataset
```
*Kết quả mẫu*: 86 polygons được gom về class 0 (`wall`), sinh file `wall_prior_dataset/data.yaml` chuẩn YOLO11.

### Huấn luyện Model Wall Prior:
```bash
python backend/ai/wall_prior/train_wall_prior.py --data wall_prior_dataset/data.yaml --epochs 100 --batch 4 --imgsz 1280
```

---

## 4. Configuration (A/B Testing & Defaults)

Các biến môi trường cấu hình:
- `WALL_PRIOR_ENABLED`: `false` (mặc định tắt, bật khi muốn áp dụng Soft Prior Guidance).
- `WALL_PRIOR_DEBUG`: `false` (bật `true` để lưu 9 ảnh chẩn đoán cho mỗi request).
- `WALL_PRIOR_THRESHOLD`: `0.25` (ngưỡng xác suất phân biệt tường / nền).
- `WALL_PRIOR_WEIGHT`: `0.25` (trọng số ảnh hưởng của Prior tới confidence tường thấp).
- `WALL_PRIOR_ROI_PADDING`: `40` (khoảng đệm mở rộng pixel của Soft ROI).
- `WALL_PRIOR_HIGH_CONF`: `0.85` (ngưỡng bảo toàn tuyệt đối, không bao giờ bị Prior xóa).

---

## 5. 9 Diagnostic Debug Stages

Khi bật `WALL_PRIOR_DEBUG=true`, hệ thống lưu 9 file ảnh chẩn đoán tại `debug_outputs/wall_prior/{timestamp}_{filename}/`:
1. `01_original.png`: Ảnh mặt bằng gốc.
2. `02_wall_prior_probability.png`: Heatmap JET xác suất $0.0 \rightarrow 1.0$ phủ trên ảnh xám.
3. `03_wall_prior_threshold.png`: Mặt nạ nhị phân ngưỡng phân đoạn của Prior.
4. `04_wall_roi.png`: Các khung Soft ROI mở rộng.
5. `05_yolo_raw.png`: Các polygon tường thô do YOLO phát hiện.
6. `06_after_prior_guidance.png`: Các tường sau khi chấm điểm và tô màu theo trạng thái Guidance.
7. `07_after_merge.png`: Các tường sau ghép đoạn thẳng đồng tuyến (Collinear Merge).
8. `08_after_geometry.png`: Các tường sau tái cấu trúc hình học (Junction Extensions).
9. `09_final_wall.png`: Tường hoàn thiện cuối cùng sau khi qua Boundary Filter và Polygon NMS.

---

## 6. Test & Verification Results

### Unit & Integration Tests:
```bash
pytest ../tests
```
**Kết quả**: **68 / 68 Tests Passed (100%)**
- `test_wall_prior.py`: 11 / 11 PASSED
- `test_wall_segment.py`: 10 / 10 PASSED
- `test_door_merge.py`: 4 / 4 PASSED
- `test_ezplan_exporter.py`: 8 / 8 PASSED
- `test_ocr_assignment.py`: 9 / 9 PASSED
- `test_ocr_pipeline.py`: 14 / 14 PASSED
- `test_roi_search_engine.py`: 5 / 5 PASSED
- `test_room_gap_bridging.py`: 2 / 2 PASSED
- `test_search_system.py`: 5 / 5 PASSED

### Frontend Compilation:
```bash
npm run build --prefix frontend_next
```
**Kết quả**: **Compiled successfully with 0 errors (Turbopack + React 19)**.

---

## 7. Regression & Safety Guarantee

- Khi `WALL_PRIOR_ENABLED=false` (mặc định), pipeline thực thi 100% logic nguyên bản không có bất kỳ thay đổi nào về số lượng tường, ID hay hình học.
- Khi không có file model Prior hoặc khi xảy ra exception, hệ thống kích hoạt cơ chế fallback an toàn, ghi log warning và tiếp tục với pipeline YOLO tường hiện tại mà không làm fail API request.
- Các module khác như Door AI, Room OCR, Database SQLite hoàn toàn không bị ảnh hưởng.
