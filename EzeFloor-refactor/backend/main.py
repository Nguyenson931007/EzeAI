"""
main.py – Điểm khởi đầu của hệ thống EzeFloor Backend
======================================================
Khởi tạo ứng dụng FastAPI, cấu hình chính sách CORS, đăng ký các router nghiệp vụ
và thiết lập các sự kiện vòng đời ứng dụng (lifespan).

Cách chạy thủ công:
  uvicorn main:app --host 0.0.0.0 --port 8090 --reload

Các định tuyến phân chia theo router:
  - api.routes    : Các API suy luận AI (Nhận diện phòng, tường, cửa, văn bản), nạp nhãn và huấn luyện.
  - api.auth      : Quản lý vòng đời đăng nhập / đăng ký / đăng xuất / xác thực phiên làm việc.
  - api.admin     : Các tác vụ quản trị hệ thống dành riêng cho tài khoản quản trị (Admin).
  - api.jobs      : Lưu trữ, tải, đổi tên, xóa và chia sẻ dự án bản vẽ.
"""

from fastapi.datastructures import Default
import logging
from contextlib import asynccontextmanager
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# ── Cấu hình tập trung (PaddlePaddle flags, .env, DB, SMTP) ──
# Phải import trước mọi thư viện khác để thiết lập biến môi trường
import app.config  # noqa: F401 – side-effect import

from api.routes import router as api_router
from api.auth import router as auth_router
from api.admin import router as admin_router
from api.jobs import router as jobs_router
from api.framework_routes import router as framework_router
from api.eaves_routes import router as eaves_router
from api.cladding_routes import router as cladding_router
from api.area_summary_routes import router as area_summary_router
from api.lockup_routes import router as lockout_router
from api.insulation_routes import router as insulation_router
from api.timber_posts_routes import router as timber_posts_router
from api.catalog_routes import router as catalog_router
from api.procurement_routes import router as procurement_router
from api.Fixout_routes import router as fixout_router
from api.shelving_routes import router as shelving_router
from api.fow_plumbing_routes import router as fow_plumbing_router
from api.power_truss_routes import router as power_truss_router
from services.roof_v3 import router as roof_v3_router
from app.config import CORS_ORIGINS, MAX_UPLOAD_SIZE
from app.limiter import limiter

# Cấu hình logging tập trung
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("ezefloor_backend.log", encoding="utf-8")
    ]
)
logger = logging.getLogger("ezefloor")


class LimitUploadSizeMiddleware(BaseHTTPMiddleware):
    """Middleware giới hạn kích thước tệp tải lên để bảo vệ server khỏi tràn bộ nhớ (OOM)"""
    def __init__(self, app, max_upload_size: int = MAX_UPLOAD_SIZE):
        super().__init__(app)
        self.max_upload_size = max_upload_size

    async def dispatch(self, request: Request, call_next):
        if request.method == "POST":
            content_length = request.headers.get("content-length")
            if content_length:
                
                if int(content_length) > self.max_upload_size:

                    logger.warning(
                        f"Từ chối tệp tải lên lớn từ {request.client.host if request.client else 'Unknown'}: "
                        f"{content_length} bytes (Tối đa {self.max_upload_size} bytes)"
                    )
                    return Response(
                        content="Tệp tải lên vượt quá giới hạn cho phép (Tối đa 50MB).",
                        status_code=413
                    )
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Quản lý vòng đời ứng dụng bằng Lifespan context manager.
    - Tạo các bảng CSDL cần thiết cho SQLite/MySQL.
    - Thực hiện dọn dẹp các phiên đăng nhập lỗi thời khi khởi động.
    """
    from app.database import init_db, get_db_connection
    logger.info("Khởi chạy hệ thống EzeFloor Backend, đang khởi tạo cơ sở dữ liệu...")
    init_db()
    
    # Giữ nguyên các session hợp lệ khi backend restart/reload.
    # validate_session đã tự kiểm tra timeout 5 giờ và vô hiệu token hết hạn.
    logger.info("Giữ nguyên session hợp lệ khi backend khởi động/reload.")
    # ── Pre-warm AI models & Background Task Sync in background thread ──
    import threading
    def _background_startup_tasks():
        try:
            logger.info("Pre-warming EasyOCR reader...")
            from services.ocr import _init_easyocr
            _init_easyocr()
            logger.info("EasyOCR reader pre-warmed successfully.")
        except Exception as e:
            logger.warning(f"EasyOCR pre-warm failed (non-fatal): {e}")
        try:
            logger.info("Pre-warming Door YOLO model...")
            from services.door_segment_service import _get_models
            _get_models()
            logger.info("Door YOLO model pre-warmed successfully.")
        except Exception as e:
            logger.warning(f"Door model pre-warm failed (non-fatal): {e}")
        # Task/DB synchronization is intentionally not run at startup.
        # Writes are triggered only by explicit UI/API actions.

    threading.Thread(target=_background_startup_tasks, daemon=True).start()
    yield
    logger.info("EzeFloor Backend đang dừng hoạt động...")


# Khởi tạo đối tượng ứng dụng FastAPI
app = FastAPI(
    title="EzeFloor AI Engine Backend",
    description="Hệ thống lõi phân đoạn bản vẽ, bóc tách khối lượng và quản trị dự án thông minh.",
    version="1.0.0",
    lifespan=lifespan
)


# Đăng ký slowapi
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Cấu hình chính sách chia sẻ tài nguyên nguồn gốc chéo (CORS Middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,  # Bắt buộc bằng True để cookie phiên (session_token) có thể truyền tải
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=r"https://.*\.ngrok-free\.dev",
)

# Thêm middleware giới hạn kích thước tệp upload
app.add_middleware(LimitUploadSizeMiddleware, max_upload_size=MAX_UPLOAD_SIZE)


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
app.include_router(framework_router, tags=["framework"])
app.include_router(eaves_router, tags=["Eaves-router"])
app.include_router(cladding_router, tags=["Cladding-router"])
app.include_router(area_summary_router, tags=["area_summary"])
app.include_router(insulation_router, tags=["insulation"])
app.include_router(lockout_router, tags=["lockout"])
app.include_router(timber_posts_router, tags=["TimberPosts-router"])
app.include_router(catalog_router, tags=["Catalog-router"])
app.include_router(procurement_router)
app.include_router(fixout_router, tags=["Fixout-router"])
app.include_router(shelving_router, tags=["Shelving-router"])
app.include_router(fow_plumbing_router, tags=["FOWPlumbing-router"])
app.include_router(power_truss_router, tags=["PowerTrussBraces-router"])
app.include_router(roof_v3_router)


