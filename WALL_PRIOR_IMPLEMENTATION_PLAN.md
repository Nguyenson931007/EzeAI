# WALL PRIOR IMPLEMENTATION PLAN

## 1. Mục tiêu kiến trúc
Xây dựng tầng AI **Wall Prior Prediction** hoạt động như một lớp **Spatial Prior / Soft Guidance** trước mô hình YOLO11 Wall hiện tại:
- Không thay thế YOLO Wall hiện tại.
- Không hard-mask hoặc zero-out ảnh gốc.
- Không xóa các detection độ tin cậy cao của YOLO ($YOLO \ge 0.85$ luôn được giữ).
- Hỗ trợ tăng độ nhạy ở vùng có Prior cao, hỗ trợ nối các đoạn tường thẳng bị ngắt quãng (centerline bridging hint), giảm nhiễu ngoài vùng tường.
- Tự động fallback an toàn về pipeline YOLO gốc nếu Prior model không khả dụng.
- Cung cấp cờ cấu hình A/B test `wall_prior_enabled` (mặc định `false`).
- Lưu 9 ảnh chẩn đoán trực quan khi bật `WALL_PRIOR_DEBUG=true`.

---

## 2. Danh sách Files thêm mới & sửa đổi

### Files thêm mới:
1. `backend/ai/wall_prior/convert_wall_dataset.py`: Script chuyển đổi dataset multi-class sang binary (`0: wall`).
2. `backend/ai/wall_prior/train_wall_prior.py`: Script huấn luyện YOLO11 segmentation binary an toàn trên Windows (`if __name__ == '__main__': main()`).
3. `backend/services/wall_prior_service.py`: Service `WallPriorService` (Probability Map, Soft ROI, Centerline Prior, Soft Guidance).
4. `tests/test_wall_prior.py`: Bộ kiểm thử tự động toàn diện cho Wall Prior & fallback.

### Files sửa đổi:
1. `backend/services/wall_segment_service.py`:
   - Tích hợp gọi `WallPriorService` khi `wall_prior_enabled=True`.
   - Áp dụng Soft Guidance & thống kê metrics qua từng stage.
   - Thêm pipeline xuất 9 ảnh debug chẩn đoán (`01_original.png` $\rightarrow$ `09_final_wall.png`).
2. `backend/services/model_paths.py`:
   - Đăng ký đường dẫn candidate `wall_prior` trong `MODEL_CANDIDATES`.

---

## 3. Data Flow & Model Flow

```
   Original Floorplan Image
              │
              ▼
      WallPriorService
   (Binary YOLO11s-seg)
              │
     ┌────────┴────────┐
     ▼                 ▼
[Probability Map] [Soft ROI]
     │                 │
     └────────┬────────┘
              ▼
     Existing YOLO11 Wall
              │
              ▼
     Soft Guidance Engine
   (Prior weighting & boost)
              │
              ▼
  Existing Wall Geometry Engine
 (Collinear merge & Reconstruct)
              │
              ▼
         Final Walls
```

---

## 4. Debug Outputs & Stage Metrics (9 Stages)

Khi bật `WALL_PRIOR_DEBUG=true`, hệ thống lưu ảnh chẩn đoán vào `debug_outputs/wall_prior/{timestamp}/`:
1. `01_original.png`: Ảnh mặt bằng gốc.
2. `02_wall_prior_probability.png`: Heatmap xác suất liên tục $0.0 \rightarrow 1.0$.
3. `03_wall_prior_threshold.png`: Mask ngưỡng phân đoạn tường của Prior.
4. `04_wall_roi.png`: Các hộp bounding box ROI mở rộng (với padding configurable).
5. `05_yolo_raw.png`: Các polygon tường thô phát hiện từ YOLO.
6. `06_after_prior_guidance.png`: Các tường sau khi áp dụng Soft Guidance & lọc điểm tin cậy.
7. `07_after_merge.png`: Các tường sau khi ghép các đoạn thẳng đồng tuyến (Collinear Merge).
8. `08_after_geometry.png`: Các tường sau khi tái cấu trúc hình học (Junction Extensions).
9. `09_final_wall.png`: Kết quả tường hoàn chỉnh cuối cùng (Boundary filter + NMS).

Thống kê metrics chi tiết từng bước:
- `RAW YOLO`: Số lượng tường thô ban đầu.
- `PRIOR CANDIDATES`: Số lượng vùng Prior.
- `AFTER GUIDANCE`: Số lượng tường sau khi tinh chỉnh điểm tin cậy.
- `AFTER MERGE`: Số lượng tường sau ghép đồng tuyến.
- `AFTER GEOMETRY`: Số lượng tường sau mở rộng nút giao.
- `AFTER BOUNDARY`: Số lượng tường sau lọc bao ngoài nhà.
- `AFTER NMS`: Số lượng tường sau NMS cuối.

---

## 5. Kế hoạch Fallback & Rủi ro (Risk & Fallback)

| Kịch bản | Cơ chế xử lý |
| :--- | :--- |
| **Chưa train model Wall Prior** | Fallback êm xuôi: `WallPriorService` phát hiện model chưa có $\rightarrow$ log warning $\rightarrow$ chạy 100% pipeline YOLO gốc. |
| **Lỗi inference hoặc crash trong Prior** | Khối `try...except` bao bọc $\rightarrow$ tự động bỏ qua Prior và tiếp tục với pipeline YOLO chuẩn. |
| **Kích thước mask không khớp ảnh** | Tự động resize bilinear về kích thước ảnh gốc hoặc bỏ qua nếu không hợp lệ. |
| **Tường YOLO tự tin cao nhưng Prior thấp** | Luật bảo toàn: $Conf \ge 0.85 \implies$ giữ nguyên 100%, không bị loại bỏ. |
