"""
backend/api/auth.py
===================
Module xử lý xác thực người dùng (Authentication), quản lý phiên làm việc (Session Management),
và cơ chế bảo mật (như chống Brute Force, Khóa tài khoản và gửi Email thông báo).
"""

from fastapi import APIRouter, HTTPException, status, Response, Cookie, Header
from pydantic import BaseModel
from typing import Optional
import hashlib
import os
import uuid
from datetime import datetime, timedelta
import logging
from app.database import get_db_connection
from app.config import TASKLIST_AUTH_URL

# Khởi tạo APIRouter cho các API liên quan đến xác thực
router = APIRouter()

# Thiết lập Logger để ghi nhận vết hoạt động xác thực
logger = logging.getLogger(__name__)

# ── Pydantic Schemas (Mô hình dữ liệu đầu vào) ──

class UserCreate(BaseModel):
    """Mô hình dữ liệu khi người dùng đăng ký tài khoản mới."""
    username: str
    password: str
    email: str
    role: str = "user"  # Mặc định là tài khoản thường ('user')


class UserLogin(BaseModel):
    """Mô hình dữ liệu khi người dùng đăng nhập hệ thống."""
    username: str
    password: str


class UserLogout(BaseModel):
    """Mô hình dữ liệu khi yêu cầu đăng xuất."""
    username: str


# ── Helper Functions (Hàm bổ trợ) ──

def verify_google_email(email: str) -> bool:
    """
    Xác minh xem email đăng ký có thuộc hệ sinh thái Google hay không.
    Hỗ trợ:
      1. Kiểm tra trực tiếp đuôi @gmail.com hoặc @googlemail.com.
      2. Cho phép email hệ thống nội bộ @ezequote.com.au.
    """
    email = email.lower().strip()
    if email.endswith("@gmail.com") or email.endswith("@googlemail.com") or email.endswith("@ezequote.com.au"):
        return True
    
    try:
        import socket
        domain = email.split("@")[1]
        # Trong môi trường thực tế, có thể sử dụng thư viện dnspython để kiểm tra bản ghi MX của tên miền.
        # Ở đây áp dụng kiểm tra cơ bản để bảo mật nghiêm ngặt.
        return False  # Mặc định trả về False cho các tên miền lạ để đảm bảo bảo mật
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """
    Tạo mã băm SHA-256 từ mật khẩu thô và chuỗi muối (salt).
    Sử dụng giải pháp zero-dependency (không phụ thuộc thư viện ngoài) để tránh lỗi build môi trường.
    """
    salt = "ezefloor_salt_123"
    return hashlib.sha256((password + salt).encode()).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Xác minh mật khẩu thô nhận được từ client.
    Hỗ trợ cả mã băm BCrypt ($2a$, $2b$, $2y$) từ MSSQL dbo.Account
    và mã băm SHA-256 từ cơ sở dữ liệu cục bộ SQLite/MySQL.
    """
    if not hashed_password or not plain_password:
        return False

    # 1. Mã hóa BCrypt ($2a$, $2b$, $2y$) dùng cho MSSQL dbo.Account
    if hashed_password.startswith("$2a$") or hashed_password.startswith("$2b$") or hashed_password.startswith("$2y$"):
        try:
            import bcrypt
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception as e:
            logger.error(f"Lỗi kiểm tra BCrypt password: {e}")
            return False

    # 2. Mã hóa SHA-256 cục bộ
    return get_password_hash(plain_password) == hashed_password


def send_email_core(to_email: str, subject: str, body: str):
    """
    Hàm lõi gửi email thông báo thông qua SMTP.
    Hỗ trợ chế độ Giả lập (Simulation Mode) nếu chưa cấu hình thông tin SMTP_USER thực tế.
    """
    import smtplib
    from email.mime.text import MIMEText
    
    # Đọc cấu hình SMTP từ các biến môi trường
    SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "your-system-email@gmail.com")
    SMTP_PASS = os.getenv("SMTP_PASS", "your-app-password")
    SENDER_NAME = "EzeFloor AI Support"

    # Chế độ giả lập khi chưa có thông tin SMTP thật
    if SMTP_USER == "your-system-email@gmail.com":
        print(f"⚠️ [SIMULATED EMAIL to {to_email}] Subject: {subject}\nBody: {body}")
        return

    try:
        # Khởi tạo nội dung email dạng text thuần
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = f"{SENDER_NAME} <{SMTP_USER}>"
        msg['To'] = to_email
        
        # Kết nối tới SMTP Server sử dụng mã hóa TLS
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)
        server.quit()
        print(f"✅ Gửi email thành công tới {to_email}")
    except Exception as e:
        print(f"❌ Gửi email tới {to_email} thất bại: {str(e)}")


def send_signup_notification(username: str, email: str):
    """Gửi thông báo tới quản trị viên hệ thống khi có người dùng mới đăng ký chờ phê duyệt."""
    subject = "New User Registration - EzeFloor AI"
    body = (
        f"Có một người dùng mới vừa đăng ký tài khoản và đang chờ phê duyệt:\n\n"
        f"Username: {username}\n"
        f"Email: {email}\n\n"
        f"Vui lòng đăng nhập vào Admin Panel trên EzeFloor để xem xét và duyệt yêu cầu."
    )
    send_email_core("admin@ezefloor.ai", subject, body)


def send_credentials_email(email: str, username: str, password: str, action: str = "created"):
    """
    Gửi thông tin đăng nhập tài khoản trực tiếp tới email người dùng.
    Hỗ trợ hai hoạt động (action):
      - 'created': Tài khoản được khởi tạo trực tiếp bởi Admin.
      - 'reset': Mật khẩu được Admin khôi phục lại khi bị khóa.
    """
    if action == "created":
        subject = "Welcome to EzeFloor AI - Your Account Details"
        body = (
            f"Xin chào {username},\n\n"
            f"Tài khoản EzeFloor của bạn đã được khởi tạo thành công bởi Quản trị viên.\n\n"
            f"Thông tin đăng nhập:\n"
            f"Username: {username}\n"
            f"Password: {password}\n\n"
            f"Vui lòng truy cập hệ thống tại: http://localhost:3011 để bắt đầu trải nghiệm.\n\n"
            f"Trân trọng!"
        )
    else:
        subject = "EzeFloor AI - Password Reset"
        body = (
            f"Xin chào {username},\n\n"
            f"Mật khẩu tài khoản của bạn đã được quản trị viên đặt lại (Reset).\n\n"
            f"Thông tin đăng nhập mới:\n"
            f"Username: {username}\n"
            f"Password: {password}\n\n"
            f"Để đảm bảo an toàn, hãy đổi mật khẩu của bạn ngay sau khi đăng nhập thành công."
        )
    
    send_email_core(email, subject, body)


# ── API Endpoints (Các định tuyến giao tiếp) ──

@router.post("/signup")
def signup(user: UserCreate):
    """
    Đăng ký tài khoản người dùng mới.
    - Ràng buộc: Email phải thuộc hệ sinh thái Google.
    - Trạng thái ban đầu: 'pending' (chờ phê duyệt của Admin).
    """
    if not verify_google_email(user.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Email không hợp lệ hoặc không thuộc hệ thống Google. Vui lòng sử dụng tài khoản Google."
        )

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Kiểm tra xem tên đăng nhập đã được sử dụng hay chưa
        cursor.execute("SELECT id FROM users WHERE username = ?", (user.username,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Tên đăng nhập đã tồn tại trong hệ thống."
            )
        
        # Băm mật khẩu và lưu người dùng mới với trạng thái chờ phê duyệt
        hashed_pwd = get_password_hash(user.password)
        cursor.execute(
            "INSERT INTO users (username, email, hashed_password, role, status) VALUES (?, ?, ?, ?, ?)",
            (user.username, user.email, hashed_pwd, user.role, "pending")
        )
        conn.commit()
        
        # Gửi email thông báo tới Admin phê duyệt
        send_signup_notification(user.username, user.email)
        
        return {
            "message": "Đăng ký thành công. Đang chờ Quản trị viên duyệt tài khoản.",
            "user": {"username": user.username, "role": user.role}
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        conn.close()


def get_mssql_account_user(username_or_manv: str):
    """
    Truy vấn thông tin tài khoản từ MSSQL Server (dbo.Account JOIN dbo.roles).
    Lấy 4 cột: MaNV, UserID, Password, IsManagement kèm tên nhãn Role (từ dbo.roles).
    Ưu tiên tìm theo UserID trước, nếu không tìm thấy mới tìm theo MaNV.
    """
    try:
        from app.mssql_db import get_mssql_connection
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)
        
        # 1. Ưu tiên khớp chính xác theo UserID
        query_user = """
            SELECT TOP 1 
                a.MaNV, 
                a.UserID, 
                a.Password, 
                a.IsManagement, 
                r.name AS RoleName 
            FROM dbo.Account a 
            LEFT JOIN dbo.roles r ON a.IsManagement = r.id 
            WHERE a.UserID = %s
        """
        cursor.execute(query_user, (username_or_manv,))
        row = cursor.fetchone()

        # 2. Nếu không tìm thấy theo UserID, mới tìm theo MaNV
        if not row:
            query_manv = """
                SELECT TOP 1 
                    a.MaNV, 
                    a.UserID, 
                    a.Password, 
                    a.IsManagement, 
                    r.name AS RoleName 
                FROM dbo.Account a 
                LEFT JOIN dbo.roles r ON a.IsManagement = r.id 
                WHERE a.MaNV = %s
            """
            cursor.execute(query_manv, (username_or_manv,))
            row = cursor.fetchone()

        conn.close()
        return row
    except Exception as e:
        logger.warning(f"Không thể truy vấn MSSQL dbo.Account: {e}")
        return None


@router.post("/login")
def login(user: UserLogin, response: Response):
    """
    Đăng nhập hệ thống.
    - Ưu tiên xác thực qua CSDL MSSQL (dbo.Account hợp nhất dbo.roles).
    - Hỗ trợ mã hóa BCrypt ($2b$, $2a$) và tự động đồng bộ tài khoản về CSDL cục bộ.
    - Dự phòng xác thực qua CSDL cục bộ (SQLite/MySQL) nếu tài khoản không tồn tại trên MSSQL.
    """
    # ── 1. Thử xác thực qua MSSQL Server (dbo.Account & dbo.roles) ──
    mssql_user = get_mssql_account_user(user.username)
    if mssql_user:
        if not verify_password(user.password, mssql_user["Password"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tên đăng nhập hoặc mật khẩu không chính xác."
            )

        # Chuẩn hóa tên quyền (Role)
        raw_role_name = (mssql_user.get("RoleName") or "User").strip()
        role_lower = raw_role_name.lower()
        if mssql_user.get("IsManagement") == 1 or role_lower in ["admin", "adminsteel"]:
            role = "admin"
        else:
            role = role_lower

        username = mssql_user["UserID"]
        manv = mssql_user["MaNV"]
        new_token = str(uuid.uuid4())

        # Đồng bộ tài khoản vào CSDL cục bộ (SQLite / MySQL) để duy trì phiên làm việc
        local_conn = get_db_connection()
        local_cursor = local_conn.cursor()
        try:
            local_cursor.execute(
                "SELECT id, is_active, status, failed_attempts, is_locked FROM users WHERE username = ?",
                (username,)
            )
            local_row = local_cursor.fetchone()

            if local_row:
                if local_row["is_locked"] == 1:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Tài khoản đã bị khóa. Vui lòng liên hệ Admin để mở khóa."
                    )
                if local_row["is_active"] == 0:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Tài khoản của bạn đã bị tạm dừng hoạt động."
                    )

                local_cursor.execute(
                    "UPDATE users SET role = ?, is_online = 1, session_token = ?, last_active = ?, failed_attempts = 0 WHERE username = ?",
                    (role, new_token, datetime.now().isoformat(), username)
                )
            else:
                dummy_email = f"{username.lower()}@ezefloor.ai"
                local_cursor.execute(
                    "INSERT INTO users (username, email, hashed_password, role, is_active, is_online, status, session_token, last_active) VALUES (?, ?, ?, ?, 1, 1, 'active', ?, ?)",
                    (username, dummy_email, mssql_user["Password"], role, new_token, datetime.now().isoformat())
                )
            local_conn.commit()
        finally:
            local_conn.close()

        # Thiết lập HTTP-Only Cookie
        response.set_cookie(
            key="session_token",
            value=new_token,
            httponly=True,
            max_age=18000,
            samesite="lax",
            secure=False
        )

        return {
            "status": "success",
            "username": username,
            "manv": manv,
            "role": role,
            "is_management": mssql_user["IsManagement"],
            "session_token": new_token
        }

    # ── 2. Dự phòng: Xác thực qua CSDL cục bộ (SQLite / MySQL) ──
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT id, username, hashed_password, role, is_active, status, failed_attempts, is_locked FROM users WHERE username = ?", 
            (user.username,)
        )
        row = cursor.fetchone()
        
        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Tên đăng nhập hoặc mật khẩu không chính xác."
            )

        if row["is_locked"] == 1 or row["failed_attempts"] >= 5:
            if row["is_locked"] == 0:
                cursor.execute("UPDATE users SET is_locked = 1 WHERE id = ?", (row["id"],))
                conn.commit()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS, 
                detail="Tài khoản đã bị khóa do nhập sai mật khẩu quá số lần quy định."
            )

        if not verify_password(user.password, row["hashed_password"]):
            new_attempts = row["failed_attempts"] + 1
            if new_attempts >= 5:
                cursor.execute("UPDATE users SET failed_attempts = ?, is_locked = 1 WHERE id = ?", (new_attempts, row["id"]))
            else:
                cursor.execute("UPDATE users SET failed_attempts = ? WHERE id = ?", (new_attempts, row["id"]))
            conn.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Tên đăng nhập hoặc mật khẩu không chính xác."
            )
        
        if row["status"] == "pending":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Tài khoản của bạn đang chờ quản trị viên phê duyệt."
            )

        if row["is_active"] == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Tài khoản của bạn đã bị tạm dừng hoạt động."
            )
        
        new_token = str(uuid.uuid4())
        cursor.execute(
            "UPDATE users SET is_online = 1, session_token = ?, last_active = ?, failed_attempts = 0 WHERE id = ?", 
            (new_token, datetime.now().isoformat(), row["id"])
        )
        conn.commit()
        
        response.set_cookie(
            key="session_token",
            value=new_token,
            httponly=True,
            max_age=18000,
            samesite="lax",
            secure=False
        )
        
        mssql_info = get_mssql_account_user(row["username"])
        manv = mssql_info["MaNV"] if mssql_info else ("ADMIN01" if row["username"] == "admin" else "")
        
        return {
            "status": "success",
            "username": row["username"],
            "manv": manv,
            "ma_nv": manv,
            "role": row["role"],
            "session_token": new_token
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        conn.close()


@router.post("/logout")
def logout(user: UserLogout):
    """
    Đăng xuất tài khoản người dùng.
    - Cập nhật trạng thái offline và xóa bỏ session_token tương ứng trong DB.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE users SET is_online = 0, session_token = NULL WHERE username = ?", 
            (user.username,)
        )
        conn.commit()
        return {"status": "success", "message": "Đăng xuất thành công."}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        conn.close()


@router.get("/validate-session")
@router.get("/api/auth/validate-session")
def validate_session_endpoint(
    auth_username: Optional[str] = Header(None, alias="X-Username"),
    session_token_cookie: Optional[str] = Cookie(None, alias="session_token"),
    session_token_header: Optional[str] = Header(None, alias="X-Session-Token")
):
    """
    Kiểm tra tính hợp lệ của phiên đăng nhập hiện tại (lightweight, trả về 200 OK nếu hợp lệ).
    Hỗ trợ xác thực qua Cookie session_token hoặc Header X-Session-Token và Header X-Username.
    """
    session_token = session_token_cookie or session_token_header

    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Thiếu session token."
        )

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if auth_username:
            cursor.execute("SELECT username, role, session_token, last_active FROM users WHERE username = ?", (auth_username,))
        else:
            cursor.execute("SELECT username, role, session_token, last_active FROM users WHERE session_token = ?", (session_token,))
        
        row = cursor.fetchone()

        if not row or row["session_token"] != session_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Phiên đăng nhập không hợp lệ hoặc đã bị thay thế."
            )

        row_dict = dict(row)

        # Check 5-hour inactivity timeout
        if row_dict.get("last_active"):
            try:
                last_active = datetime.fromisoformat(row_dict["last_active"])
                if datetime.now() - last_active > timedelta(hours=5):
                    cursor.execute("UPDATE users SET is_online = 0, session_token = NULL WHERE username = ?", (row_dict["username"],))
                    conn.commit()
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Phiên đăng nhập đã hết hạn."
                    )
            except HTTPException:
                raise
            except Exception:
                pass

        mssql_info = get_mssql_account_user(row_dict["username"])
        manv = mssql_info["MaNV"] if mssql_info else ("ADMIN01" if row_dict["username"] == "admin" else "")

        return {
            "status": "valid",
            "username": row_dict["username"],
            "manv": manv,
            "ma_nv": manv,
            "role": row_dict.get("role", "user"),
            "session_token": session_token
        }
    finally:
        conn.close()


# ── Dependency Xác thực Phiên làm việc (Session Validation) ──

def validate_session(
    auth_username: str = Header(..., alias="X-Username"), 
    session_token_cookie: Optional[str] = Cookie(None, alias="session_token"),
    session_token_header: Optional[str] = Header(None, alias="X-Session-Token")
):
    """
    Dependency dùng để bảo vệ các API riêng tư.
    - Đọc session_token từ HTTP-Only Cookie hoặc Header X-Session-Token để tăng độ tương thích.
    - Kiểm tra tính hợp lệ của Token và hết hạn phiên (Session Timeout: 5 giờ không hoạt động).
    - Tự động cập nhật mốc thời gian hoạt động cuối cùng (last_active) để gia hạn phiên.
    """
    session_token = session_token_cookie or session_token_header
    
    print(f"[AUTH] Validating session for user: {auth_username}")
    print(f"[AUTH] Cookie token present: {bool(session_token_cookie)}, Header token present: {bool(session_token_header)}")
    
    if not session_token:
        logger.warning(f"[AUTH] Thiếu session token cho người dùng {auth_username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Yêu cầu chưa được xác thực: Thiếu session token."
        )
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT session_token, last_active FROM users WHERE username = ?", (auth_username,))
        row = cursor.fetchone()
        
        if not row:
            logger.warning(f"[AUTH] Không tìm thấy người dùng {auth_username} trong cơ sở dữ liệu")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Phiên làm việc không hợp lệ: Không tìm thấy người dùng."
            )
            
        # Kiểm tra token trùng khớp (chống việc đăng nhập nhiều nơi ghi đè session)
        if row["session_token"] != session_token:
            logger.warning(f"[AUTH] Token không khớp cho người dùng {auth_username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Phiên đăng nhập đã bị vô hiệu hóa (Tài khoản đã đăng nhập ở thiết bị khác)."
            )
            
        logger.debug(f"[AUTH] Xác thực thành công cho người dùng: {auth_username}")
        
        # Kiểm tra hết hạn phiên 5 giờ do không tương tác
        last_active = datetime.fromisoformat(row["last_active"])
        if datetime.now() - last_active > timedelta(hours=5):
            cursor.execute("UPDATE users SET is_online = 0, session_token = NULL WHERE username = ?", (auth_username,))
            conn.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Phiên làm việc đã hết hạn do không hoạt động trong 5 giờ."
            )
        
        # Cập nhật mốc thời gian hoạt động mới nhất
        cursor.execute(
            "UPDATE users SET last_active = ? WHERE username = ?", 
            (datetime.now().isoformat(), auth_username)
        )
        conn.commit()
        return auth_username
    finally:
        conn.close()

@router.post("/api/auth/tasklist-sso")
@router.post("/tasklist-sso")
async def tasklist_sso(payload: dict, response: Response):
    """
    Xác thực đăng nhập một lần (SSO) từ TaskList Web3.
    Gửi token xác thực tới máy chủ TaskList (https://103.77.167.69:8081/api/auth/me),
    đồng bộ tài khoản và tạo phiên làm việc (session) cho Web AI EzeFloor.
    """
    token = payload.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="Tasklist token is required")

    import httpx
    try:
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
            result = await client.get(
                TASKLIST_AUTH_URL,
                headers={"Authorization": f"Bearer {token}"}
            )
    except Exception as e:
        logger.error(f"[SSO] Lỗi kết nối tới Tasklist API ({TASKLIST_AUTH_URL}): {e}")
        raise HTTPException(status_code=502, detail=f"Không thể kết nối máy chủ xác thực Tasklist: {e}")

    if result.status_code != 200:
        logger.warning(f"[SSO] Tasklist token không hợp lệ (status={result.status_code}, url={TASKLIST_AUTH_URL}, body={result.text[:200]})")
        raise HTTPException(status_code=401, detail="Tasklist token không hợp lệ")

    res_json = result.json()
    logger.info(f"[SSO] Tasklist auth response: {res_json}")
    user_data = res_json.get("data") or res_json.get("user") or res_json

    def _find_val(obj, keys):
        if not isinstance(obj, dict):
            return ""
        lower_map = {str(k).lower(): str(v).strip() for k, v in obj.items() if v is not None}
        for k in keys:
            v = lower_map.get(k.lower())
            if v and v.lower() not in ["none", "null", "undefined", ""]:
                return v
        return ""

    username_keys = ["userid", "user_id", "username", "user_name", "account", "login_name", "name", "fullname", "full_name", "displayname"]
    manv_keys = ["ma_nv", "manv", "staff_id", "employee_id"]

    extracted_user = (
        _find_val(payload, username_keys) or
        _find_val(payload.get("user"), username_keys) or
        _find_val(user_data, username_keys) or
        _find_val(res_json, username_keys)
    )

    extracted_manv = (
        _find_val(payload, manv_keys) or
        _find_val(payload.get("user"), manv_keys) or
        _find_val(user_data, manv_keys) or
        _find_val(res_json, manv_keys)
    )

    # Ưu tiên lấy thông tin theo UserID từ MSSQL
    mssql_user = None
    if extracted_user:
        mssql_user = get_mssql_account_user(extracted_user)
    if not mssql_user and extracted_manv:
        mssql_user = get_mssql_account_user(extracted_manv)

    if extracted_user:
        username = mssql_user.get("UserID") if mssql_user else extracted_user
    elif mssql_user:
        username = str(mssql_user.get("UserID") or extracted_manv or "sso_user").strip()
    else:
        username = extracted_manv or "sso_user"

    manv = mssql_user.get("MaNV") if mssql_user else (extracted_manv or "")

    raw_role = user_data.get("RoleName") or user_data.get("role") or (mssql_user.get("RoleName") if mssql_user else "User")
    is_mgmt = user_data.get("IsManagement") == 1 or (mssql_user and mssql_user.get("IsManagement") == 1)
    role = "admin" if (str(raw_role).lower() in ["admin", "adminsteel"] or is_mgmt) else str(raw_role).lower()

    new_token = str(uuid.uuid4())

    # Đồng bộ tài khoản vào CSDL cục bộ (SQLite / MySQL) để duy trì phiên làm việc
    local_conn = get_db_connection()
    local_cursor = local_conn.cursor()
    try:
        local_cursor.execute(
            "SELECT id, is_active, status, is_locked FROM users WHERE username = ?",
            (username,)
        )
        local_row = local_cursor.fetchone()

        if local_row:
            if local_row["is_locked"] == 1:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Tài khoản đã bị khóa. Vui lòng liên hệ Admin để mở khóa."
                )
            if local_row["is_active"] == 0:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Tài khoản của bạn đã bị tạm dừng hoạt động."
                )

            local_cursor.execute(
                "UPDATE users SET role = ?, is_online = 1, session_token = ?, last_active = ?, failed_attempts = 0 WHERE username = ?",
                (role, new_token, datetime.now().isoformat(), username)
            )
        else:
            dummy_email = user_data.get("email") or f"{username.lower()}@ezefloor.ai"
            local_cursor.execute(
                "INSERT INTO users (username, email, hashed_password, role, is_active, is_online, status, session_token, last_active) VALUES (?, ?, ?, ?, 1, 1, 'active', ?, ?)",
                (username, dummy_email, "sso_managed", role, new_token, datetime.now().isoformat())
            )
        local_conn.commit()
    finally:
        local_conn.close()

    # Thiết lập HTTP-Only Cookie
    response.set_cookie(
        key="session_token",
        value=new_token,
        httponly=True,
        max_age=18000,
        samesite="lax",
        secure=False
    )

    return {
        "status": "success",
        "username": username,
        "manv": manv,
        "role": role,
        "session_token": new_token,
        "data": user_data
    }


class UserProfileUpdate(BaseModel):
    full_name_en: Optional[str] = None
    full_name_vi: Optional[str] = None
    age: Optional[int] = None
    position: Optional[str] = None
    team: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


@router.get("/users/me")
@router.get("/api/users/me")
def get_current_user_profile(
    auth_username: Optional[str] = Header(None, alias="X-Username"),
    session_token_cookie: Optional[str] = Cookie(None, alias="session_token"),
    session_token_header: Optional[str] = Header(None, alias="X-Session-Token")
):
    session_token = session_token_cookie or session_token_header
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if auth_username:
            cursor.execute(
                "SELECT id, username, email, role, full_name_en, full_name_vi, age, position, team, phone, is_active, is_online, status FROM users WHERE username = ?", 
                (auth_username,)
            )
        elif session_token:
            cursor.execute(
                "SELECT id, username, email, role, full_name_en, full_name_vi, age, position, team, phone, is_active, is_online, status FROM users WHERE session_token = ?", 
                (session_token,)
            )
        else:
            raise HTTPException(status_code=401, detail="Unauthorized")
        
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(row)
    finally:
        conn.close()


@router.put("/users/me")
@router.put("/api/users/me")
def update_current_user_profile(
    profile_data: UserProfileUpdate,
    auth_username: Optional[str] = Header(None, alias="X-Username"),
    session_token_cookie: Optional[str] = Cookie(None, alias="session_token"),
    session_token_header: Optional[str] = Header(None, alias="X-Session-Token")
):
    session_token = session_token_cookie or session_token_header
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        user_row = None
        if auth_username:
            cursor.execute("SELECT id, username FROM users WHERE username = ?", (auth_username,))
            user_row = cursor.fetchone()
        elif session_token:
            cursor.execute("SELECT id, username FROM users WHERE session_token = ?", (session_token,))
            user_row = cursor.fetchone()
        
        if not user_row:
            raise HTTPException(status_code=401, detail="Unauthorized")
        
        user_id = user_row["id"]
        updates = []
        params = []

        if profile_data.full_name_en is not None:
            updates.append("full_name_en = ?")
            params.append(profile_data.full_name_en)
        if profile_data.full_name_vi is not None:
            updates.append("full_name_vi = ?")
            params.append(profile_data.full_name_vi)
        if profile_data.age is not None:
            updates.append("age = ?")
            params.append(profile_data.age)
        if profile_data.position is not None:
            updates.append("position = ?")
            params.append(profile_data.position)
        if profile_data.team is not None:
            updates.append("team = ?")
            params.append(profile_data.team)
        if profile_data.phone is not None:
            updates.append("phone = ?")
            params.append(profile_data.phone)
        if profile_data.email is not None and profile_data.email.strip():
            updates.append("email = ?")
            params.append(profile_data.email.strip())

        if updates:
            params.append(user_id)
            cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", tuple(params))
            conn.commit()

        cursor.execute(
            "SELECT id, username, email, role, full_name_en, full_name_vi, age, position, team, phone, is_active, is_online, status FROM users WHERE id = ?", 
            (user_id,)
        )
        updated_row = cursor.fetchone()
        return {"status": "success", "user": dict(updated_row)}
    finally:
        conn.close()

