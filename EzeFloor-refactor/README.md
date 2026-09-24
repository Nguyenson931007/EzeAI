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

## 🚀 Setup và chạy dự án

### 1. Yêu cầu hệ thống

- Python 3.9 trở lên (khuyến nghị Python 3.11).
- Node.js 20.9 trở lên và npm.
- Git.
- Poppler cần thiết nếu sử dụng tính năng nhập/chuyển đổi PDF. Trên Windows, thêm thư mục `bin` của Poppler vào `PATH`.
- GPU NVIDIA/CUDA là tùy chọn. Ứng dụng vẫn chạy bằng CPU nhưng các tác vụ AI sẽ chậm hơn.

### 2. Chuẩn bị biến môi trường

Toàn bộ backend và frontend dùng chung **một file duy nhất** tại `EzeFloor/.env`. Không tạo thêm `backend/.env` hoặc `frontend_next/.env.local`.

Nếu chưa có `.env`, tạo file này tại thư mục gốc với cấu hình tối thiểu để chạy local:

```env
DB_TYPE=sqlite
SQLITE_PATH=storage/ezefloor.db

BACKEND_URL=http://127.0.0.1:8090
NEXT_PUBLIC_API_BASE_URL=
CORS_ORIGINS=http://localhost:3011,http://127.0.0.1:3011

YOLO_MODELS_DIR=models
PASSWORD_SALT=thay-bang-mot-chuoi-bi-mat-rieng
SESSION_TIMEOUT_MINUTES=30
SESSION_COOKIE_MAX_AGE=1800
MAX_FAILED_ATTEMPTS=5
MAX_UPLOAD_SIZE=52428800
```

`NEXT_PUBLIC_API_BASE_URL` nên để trống khi chạy local để frontend gọi API qua proxy của Next.js. Không commit `.env` vì file này có thể chứa mật khẩu và khóa bí mật.

Các tích hợp MySQL, MSSQL/Procurement, SMTP và Task List SSO là tùy chọn. Chỉ điền các biến `MYSQL_*`, `MSSQL_*`, `SMTP_*`, `TASKLIST_AUTH_*` khi cần dùng các hệ thống tương ứng.

### 3. Chuẩn bị AI models

Các file trọng số `*.pt` không được lưu trong Git. Đặt model runtime đúng cấu trúc sau:

```text
models/
├─ doors/best.pt
├─ roof/best.pt
├─ rooms/best.pt
└─ walls/best.pt
```

Có thể chạy giao diện và các chức năng không dùng AI khi thiếu model, nhưng các API nhận diện tương ứng sẽ không hoạt động.

### 4. Cài và chạy backend

Mở PowerShell tại thư mục gốc của repository:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8090 --reload
```

Nếu PowerShell chặn script kích hoạt virtual environment, chạy một lần trong cửa sổ hiện tại rồi kích hoạt lại:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Backend tự tạo database SQLite và các bảng cần thiết khi khởi động. Kiểm tra tại:

- API health: <http://127.0.0.1:8090/>
- Swagger API docs: <http://127.0.0.1:8090/docs>

Trên macOS/Linux, phần tương đương là:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8090 --reload
```

### 5. Cài và chạy frontend

Giữ backend đang chạy, mở terminal thứ hai tại thư mục gốc:

```powershell
cd frontend_next
npm install
npm run dev
```

Mở ứng dụng tại <http://127.0.0.1:3011/> hoặc <http://localhost:3011/>.

### 6. Chạy nhanh ở những lần sau

Terminal 1 — backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 0.0.0.0 --port 8090 --reload
```

Terminal 2 — frontend:

```powershell
cd frontend_next
npm run dev
```

### 7. Build và chạy chế độ production

```powershell
cd frontend_next
npm run build
npm run start
```

Frontend production vẫn chạy ở cổng `3011`; backend cần được chạy riêng ở cổng `8090` và không dùng cờ `--reload`:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 0.0.0.0 --port 8090
```

### 8. Kiểm tra lỗi thường gặp

- Frontend báo lỗi API: kiểm tra backend tại cổng `8090`, sau đó xác nhận `BACKEND_URL` trong `.env`.
- Lỗi CORS hoặc không giữ được phiên đăng nhập: mở app bằng đúng host đã khai báo trong `CORS_ORIGINS`; không trộn `localhost` và `127.0.0.1` trong cùng phiên.
- AI báo không tìm thấy model: kiểm tra `YOLO_MODELS_DIR=models` và tên file trong thư mục `models/`.
- Đổi `.env` nhưng chưa có hiệu lực: dừng rồi khởi động lại cả backend lẫn frontend.
- Lỗi xử lý PDF: cài Poppler và kiểm tra lệnh `pdftoppm -h` chạy được trong terminal.

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

## 🧭 Cách tiếp tục nâng cấp
Khi bắt đầu một phiên làm việc mới, hãy kiểm tra:
1. `backend/api/auth.py`: Quản lý xác thực qua Cookie.
2. `frontend_next/src/controllers/interaction.controller.js`: Logic vẽ và Snap.
3. `backend/services/floor_ai_detect.py`: Pipeline xử lý AI.
4. `database.py`: Schema của toàn bộ hệ thống.
