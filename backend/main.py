"""
main.py – Điểm khởi đầu của hệ thống EzeFloor Backend
======================================================
Khởi tạo ứng dụng FastAPI, cấu hình chính sách CORS, đăng ký các router nghiệp vụ
và thiết lập các sự kiện vòng đời ứng dụng (startup hook).

Cách chạy thủ công:
  uvicorn main:app --host 0.0.0.0 --port 8090 --reload

Các định tuyến phân chia theo router:
  - api.routes    : Các API suy luận AI (Nhận diện phòng, tường, cửa, văn bản), nạp nhãn và huấn luyện.
  - api.auth      : Quản lý vòng đời đăng nhập / đăng ký / đăng xuất / xác thực phiên làm việc.
  - api.admin     : Các tác vụ quản trị hệ thống dành riêng cho tài khoản quản trị (Admin).
  - api.jobs      : Lưu trữ, tải, đổi tên, xóa và chia sẻ dự án bản vẽ.

Sự kiện Khởi động (Startup):
  - Khởi tạo cấu trúc các bảng Cơ sở dữ liệu nếu chưa có.
  - Dọn dẹp trạng thái trực tuyến (Đặt `is_online = 0` và xóa `session_token`) trên toàn bộ người dùng 
    để ép buộc đăng nhập lại sau khi khởi chạy lại máy chủ.
"""

# ── Cấu hình tập trung (PaddlePaddle flags, .env, DB, SMTP) ──
# Phải import trước mọi thư viện khác để thiết lập biến môi trường
import app.config  # noqa: F401 – side-effect import

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router as api_router
from api.auth import router as auth_router
from api.admin import router as admin_router
from api.jobs import router as jobs_router
from app.database import init_db

# Khởi tạo đối tượng ứng dụng FastAPI
app = FastAPI(
    title="EzeFloor AI Engine Backend",
    description="Hệ thống lõi phân đoạn bản vẽ, bóc tách khối lượng và quản trị dự án thông minh.",
    version="1.0.0"
)

# Cấu hình chính sách chia sẻ tài nguyên nguồn gốc chéo (CORS Middleware)
# Cho phép Frontend chạy trên cổng 3010 giao tiếp an toàn với Backend trên cổng 8090
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3010", "http://127.0.0.1:3010", "http://localhost:8090"],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,  # Bắt buộc bằng True để cookie phiên (session_token) có thể truyền tải
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """
    Sự kiện tự động chạy khi máy chủ FastAPI bắt đầu khởi động.
    - Tạo các bảng CSDL cần thiết cho SQLite/MySQL.
    - Thực hiện dọn dẹp các phiên đăng nhập lỗi thời để bảo mật dữ liệu.
    """
    from app.database import init_db, get_db_connection
    init_db()
    
    # Ép buộc đăng xuất tất cả các tài khoản khi server khởi động lại (để bảo mật tối ưu)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        print("Đang dọn dẹp các phiên đăng nhập cũ và đánh dấu người dùng offline trên máy chủ khởi động...")
        cursor.execute("UPDATE users SET is_online = 0, session_token = NULL")
        conn.commit()
    except Exception as e:
        print(f"Lỗi xảy ra khi dọn dẹp phiên đăng nhập khởi động: {e}")
    finally:
        conn.close()


@app.get("/")
async def root():
    """Endpoint gốc dùng để kiểm tra nhanh trạng thái kết nối máy chủ."""
    return {"status": "online", "message": "EzeFloor Backend is running on port 8090"}


@app.get("/favicon.ico")
async def favicon():
    """Định tuyến chặn favicon tránh ghi log rác 404 trên trình duyệt client."""
    from fastapi.responses import Response
    return Response(content=b"", media_type="image/x-icon")


# Đăng ký các router nghiệp vụ tương ứng vào FastAPI app
app.include_router(api_router)
app.include_router(auth_router, tags=["auth"])
app.include_router(admin_router, tags=["admin"])
app.include_router(jobs_router, tags=["jobs"])
