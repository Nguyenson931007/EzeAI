# EzeFloor - AI-Powered Floor Plan Detection & CAD Ecosystem

EzeFloor là một nền tảng chuyên nghiệp hỗ trợ nhận diện mặt bằng kiến trúc bằng AI, cho phép biên tập 2D/3D và xuất bảng khối lượng (BOQ) tự động.

## 🛠 Tech Stack
- **Backend:** FastAPI (Python 3.9+)
- **Frontend:** Next.js 16 + React 19
- **Database:** SQLite (với logic Session quản lý qua HttpOnly Cookies)
- **AI Models:** YOLO (v8/v11) cho nhận diện Phòng, Tường, Cửa + EasyOCR cho nhận diện tên phòng.
- **3D Engine:** Three.js với vật liệu thực tế.


## 📁 Cấu trúc repository

```text
EzeFloor/
├─ backend/                 # FastAPI + AI/services/exporters
├─ frontend_next/           # Next.js app chính
├─ tools/
│  ├─ door-annotation-tool/ # Vite/React annotation utility
│  ├─ scripts/              # DB/dev/training utilities
│  └─ cleanup-legacy-root.ps1
├─ tests/                   # benchmark/validation
├─ docs/                    # tài liệu + reference snapshots
├─ package.json             # dependency cho utility Node ở root
├─ package-lock.json
└─ .gitignore
```

Root chỉ giữ source và cấu hình cần cho ứng dụng. Snapshot, dataset training và benchmark fixture không nằm trong runtime package.

## 🌟 Tính năng đã hoàn thiện

### 1. Engine AI & Xử lý Hình ảnh
- **Nhận diện đa lớp:** Tách biệt Phòng, Tường, Cửa với độ chính xác cao.
- **Hệ thống OCR:** Tự động gán tên phòng (Bedroom, Living...) từ văn bản trên bản vẽ.
- **GPU Acceleration:** Hỗ trợ CUDA và FP16 giúp tốc độ xử lý nhanh gấp 5-10 lần (từ 10s xuống ~1s).
- **Post-processing:** Thuật toán làm mượt Polygon và hít góc vuông (Orthogonal snapping) cho bản vẽ kỹ thuật.

### 2. Editor & Trải nghiệm CAD
- **Snap System:** Hỗ trợ hít lưới (Grid Snap 20px) và khóa góc 45 độ (Shift Snap) giúp vẽ tay chuẩn xác.
- **3D Visualization:** Chế độ xem 3D với vân gỗ cho phòng khô và gạch men cho phòng ướt, tích hợp ánh sáng đổ bóng chuyên nghiệp.
- **Multi-page PDF:** Hỗ trợ nhập và xử lý PDF nhiều trang, cho phép chọn trang cần convert.

### 3. Quản lý & Bảo mật
- **Security Hardening:** Chuyển đổi toàn bộ hệ thống Session từ LocalStorage sang **HttpOnly Cookies** để chống tấn công XSS.
- **Account Protection:** Cơ chế khóa tài khoản khi nhập sai mật khẩu quá nhiều lần và đặt lại mật khẩu qua Email.
- **Public Share Link:** Sinh mã Token bảo mật để chia sẻ dự án cho khách hàng xem ở chế độ Read-only.

### 4. Hệ thống BOQ (Bill of Quantities)
- Tự động tính toán Diện tích (m2), Chu vi tường, Số lượng cửa.
- Phân loại khu vực Ướt/Khô dựa trên từ khóa kiến trúc.

## 📈 Lộ trình Active Learning (Học tập chủ động)
Hệ thống đã tích hợp sẵn cột `is_corrected` trong Database.
- **Luồng dữ liệu:** Khi người dùng sửa lại kết quả AI, hệ thống đánh dấu dự án đó là "High Quality".
- **Huấn luyện:** Dữ liệu này sẽ được dùng để Retrain Model YOLO, giúp AI càng dùng càng thông minh và hiểu phong cách bản vẽ của người dùng hơn.

## 🚀 Cách tiếp tục nâng cấp
Khi bắt đầu một phiên làm việc mới, hãy kiểm tra:
1. `backend/api/auth.py`: Quản lý xác thực qua Cookie.
2. `frontend_next/src/controllers/interaction.controller.js`: Logic vẽ và Snap.
3. `backend/services/floor_ai_detect.py`: Pipeline xử lý AI.
4. `database.py`: Schema của toàn bộ hệ thống.

---
*README này được tạo tự động để ghi nhớ quá trình phát triển giữa USER và AI Assistant (Antigravity).*
## Environment

The repository uses **one runtime environment file only**:

```text
EzeFloor/.env
```

Both the Python backend and Next.js frontend load this same file. Do not create `backend/.env` or `frontend_next/.env.local`.

Important frontend values are kept in the same root file:

```env
BACKEND_URL=http://127.0.0.1:8090
NEXT_PUBLIC_API_BASE_URL=
```

`BACKEND_URL` is server-side only. Only variables intentionally prefixed with `NEXT_PUBLIC_` are exposed to browser code. The root `.env` is ignored by Git.
