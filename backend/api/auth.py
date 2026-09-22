"""
backend/api/auth.py
===================
Module xử lý xác thực người dùng (Authentication), quản lý phiên làm việc (Session Management),
và cơ chế bảo mật (như chống Brute Force, Khóa tài khoản và gửi Email thông báo).
"""

from fastapi import APIRouter, HTTPException, status, Response, Cookie, Header, Request, Query, Body
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Optional, Tuple
import hashlib
import os
import uuid
from datetime import datetime, timedelta
import logging
from app.database import get_db_connection
from app.config import (
    PASSWORD_SALT, SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASS,
    SMTP_SENDER_NAME, TASKLIST_AUTH_URLS, TOOL_AI_SSO_SECRET,
)

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
    if not PASSWORD_SALT:
        raise RuntimeError("PASSWORD_SALT is not configured in .env")
    return hashlib.sha256((password + PASSWORD_SALT).encode()).hexdigest()


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
    
    # Chế độ giả lập khi chưa có thông tin SMTP thật
    if not SMTP_USER or SMTP_USER == "your-system-email@gmail.com":
        print(f"⚠️ [SIMULATED EMAIL to {to_email}] Subject: {subject}\nBody: {body}")
        return

    try:
        # Khởi tạo nội dung email dạng text thuần
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = f"{SMTP_SENDER_NAME} <{SMTP_USER}>"
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
    """
    try:
        from app.mssql_db import get_mssql_connection
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)
        query = """
            SELECT TOP 1 
                a.MaNV, 
                a.UserID, 
                a.Password, 
                a.IsManagement,
                a.bophanlogin,
                nv.MaChucVu,
                nv.MaBoPhan,
                nv.TenNV,
                nv.TenEng,
                COALESCE(r_nv.id, r_acc.id, nv.MaChucVu, a.IsManagement) AS RoleID,
                COALESCE(r_nv.name, r_acc.name) AS RoleName,
                COALESCE(r_nv.description, r_acc.description) AS RoleDescription
            FROM dbo.Account a 
            LEFT JOIN dbo.NhanVien nv ON a.MaNV = nv.MaNV 
            LEFT JOIN dbo.roles r_nv ON nv.MaChucVu = r_nv.id 
            LEFT JOIN dbo.roles r_acc ON a.IsManagement = r_acc.id 
            WHERE a.UserID = %s OR a.MaNV = %s OR CAST(a.ID AS VARCHAR) = %s
        """
        cursor.execute(query, (username_or_manv, username_or_manv, username_or_manv))
        row = cursor.fetchone()
        conn.close()
        return row
    except Exception as e:
        logger.warning(f"Không thể truy vấn MSSQL dbo.Account: {e}")
        return None


# Danh sách chuẩn 21 roles từ bảng [emsflow].[dbo].[roles]
ROLES_REGISTRY_MAP: dict[int, Tuple[str, str]] = {
    1: ("admin", "Admin"),
    2: ("manager", "Manager"),
    3: ("employee", "Employee"),
    4: ("leader", "Leader"),
    5: ("employeesteel", "EmployeeSteel"),
    6: ("managersteel", "ManagerSteel"),
    7: ("leadersteel", "LeaderSteel"),
    8: ("checkersteel", "CheckerSteel"),
    9: ("adminsteel", "AdminSteel"),
    10: ("viewer", "Viewer"),
    11: ("employeepryda", "EmployeePryda"),
    12: ("checkerpryda", "CheckerPryda"),
    13: ("leaderhw", "LeaderHW"),
    14: ("employeehw", "EmployeeHW"),
    15: ("adminhw", "AdminHW"),
    16: ("admindindas", "AdminDindas"),
    17: ("leaderdindas", "LeaderDindas"),
    18: ("employeedindas", "EmployeeDindas"),
    19: ("admincsd", "AdminCSD"),
    20: ("leadercsd", "LeaderCSD"),
    21: ("employeecsd", "EmployeeCSD"),
}

ROLES_BY_NAME_LOWER: dict[str, Tuple[str, str]] = {
    "admin": ("admin", "Admin"),
    "manager": ("manager", "Manager"),
    "employee": ("employee", "Employee"),
    "leader": ("leader", "Leader"),
    "employeesteel": ("employeesteel", "EmployeeSteel"),
    "managersteel": ("managersteel", "ManagerSteel"),
    "leadersteel": ("leadersteel", "LeaderSteel"),
    "checkersteel": ("checkersteel", "CheckerSteel"),
    "adminsteel": ("adminsteel", "AdminSteel"),
    "viewer": ("viewer", "Viewer"),
    "employeepryda": ("employeepryda", "EmployeePryda"),
    "checkerpryda": ("checkerpryda", "CheckerPryda"),
    "leaderhw": ("leaderhw", "LeaderHW"),
    "employeehw": ("employeehw", "EmployeeHW"),
    "adminhw": ("adminhw", "AdminHW"),
    "admindindas": ("admindindas", "AdminDindas"),
    "leaderdindas": ("leaderdindas", "LeaderDindas"),
    "employeedindas": ("employeedindas", "EmployeeDindas"),
    "admincsd": ("admincsd", "AdminCSD"),
    "leadercsd": ("leadercsd", "LeaderCSD"),
    "employeecsd": ("employeecsd", "EmployeeCSD"),
}


def normalize_role_from_mssql(raw_role_name: Optional[str] = None, role_id: Optional[int] = None) -> Tuple[str, str]:
    """
    Chuẩn hóa role lấy theo danh sách bảng [emsflow].[dbo].[roles] (21 roles).
    Không lấy theo cờ boolean IsManagement.
    """
    # 1. Tra cứu theo RoleID (r.id từ dbo.roles hoặc a.IsManagement)
    if role_id is not None:
        try:
            r_id = int(role_id)
            if r_id in ROLES_REGISTRY_MAP:
                return ROLES_REGISTRY_MAP[r_id]
        except (ValueError, TypeError):
            pass

    # 2. Tra cứu theo RoleName (r.name từ dbo.roles)
    if raw_role_name:
        clean = str(raw_role_name).strip()
        clean_lower = clean.lower()
        if clean_lower in ROLES_BY_NAME_LOWER:
            return ROLES_BY_NAME_LOWER[clean_lower]
        return clean_lower, clean

    return "user", "User"


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

        # Chuẩn hóa tên quyền (Role) theo MaChucVu từ bảng NhanVien
        resolved_role_id = mssql_user.get("MaChucVu") or mssql_user.get("RoleID") or mssql_user.get("IsManagement")
        role, role_name = normalize_role_from_mssql(
            raw_role_name=mssql_user.get("RoleName"), 
            role_id=resolved_role_id
        )

        username = mssql_user["UserID"]
        manv = mssql_user["MaNV"]
        bophanlogin = str(mssql_user.get("bophanlogin") or "").strip()
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
                    "UPDATE users SET role = ?, is_online = 1, session_token = ?, last_active = ?, failed_attempts = 0, bophanlogin = ? WHERE username = ?",
                    (role, new_token, datetime.now().isoformat(), bophanlogin, username)
                )
            else:
                dummy_email = f"{username.lower()}@ezefloor.ai"
                local_cursor.execute(
                    "INSERT INTO users (username, email, hashed_password, role, is_active, is_online, status, session_token, last_active, bophanlogin) VALUES (?, ?, ?, ?, 1, 1, 'active', ?, ?, ?)",
                    (username, dummy_email, mssql_user["Password"], role, new_token, datetime.now().isoformat(), bophanlogin)
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
            "role_id": resolved_role_id,
            "role_name": role_name,
            "bophanlogin": bophanlogin,
            "full_name_vi": mssql_user.get("TenNV"),
            "full_name_en": mssql_user.get("TenEng"),
            "is_management": mssql_user.get("IsManagement"),
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
        
        return {
            "status": "success",
            "username": row["username"],
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
def logout(user: UserLogout, response: Response):
    """
    Đăng xuất tài khoản người dùng.
    - Cập nhật trạng thái offline và xóa bỏ session_token tương ứng trong DB.
    - Xóa session_token cookie trên trình duyệt.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE users SET is_online = 0, session_token = NULL WHERE username = ?", 
            (user.username,)
        )
        conn.commit()
        response.delete_cookie(key="session_token")
        return {"status": "success", "message": "Đăng xuất thành công."}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        conn.close()


@router.get("/validate-session")
def validate_session_endpoint(
    auth_username: str = Header(..., alias="X-Username"),
    session_token_cookie: Optional[str] = Cookie(None, alias="session_token"),
    session_token_header: Optional[str] = Header(None, alias="X-Session-Token")
):
    """
    Kiểm tra tính hợp lệ của phiên đăng nhập hiện tại (lightweight, không cập nhật last_active).
    Frontend gọi endpoint này khi app load để xác minh session còn hiệu lực hay không.
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
        cursor.execute("SELECT session_token, last_active, role, bophanlogin FROM users WHERE username = ?", (auth_username,))
        row = cursor.fetchone()

        if not row or row["session_token"] != session_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Phiên đăng nhập không hợp lệ hoặc đã bị thay thế."
            )

        # Check 5-hour inactivity timeout
        last_active = datetime.fromisoformat(row["last_active"])
        if datetime.now() - last_active > timedelta(hours=5):
            cursor.execute("UPDATE users SET is_online = 0, session_token = NULL WHERE username = ?", (auth_username,))
            conn.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Phiên đăng nhập đã hết hạn."
            )

        bophanlogin = ""
        try:
            bophanlogin = row["bophanlogin"] or ""
        except Exception:
            pass

        if not bophanlogin:
            mssql_user = get_mssql_account_user(auth_username)
            if mssql_user:
                bophanlogin = str(mssql_user.get("bophanlogin") or "").strip()

        user_role = row["role"] if (row and "role" in row.keys() and row["role"]) else "user"
        display_role = user_role
        manv = None

        # Tự động đồng bộ role mới nhất từ MSSQL Server nếu có (theo MaChucVu trong NhanVien)
        role_id_val = None
        full_name_vi = None
        full_name_en = None
        try:
            mssql_user = get_mssql_account_user(auth_username)
            if mssql_user:
                role_id_val = mssql_user.get("MaChucVu") or mssql_user.get("RoleID") or mssql_user.get("IsManagement")
                norm_role, norm_name = normalize_role_from_mssql(
                    raw_role_name=mssql_user.get("RoleName"), 
                    role_id=role_id_val
                )
                user_role = norm_role
                display_role = norm_name
                manv = mssql_user.get("MaNV")
                full_name_vi = mssql_user.get("TenNV")
                full_name_en = mssql_user.get("TenEng")
                cursor.execute("UPDATE users SET role = ? WHERE username = ?", (user_role, auth_username))
                conn.commit()
        except Exception as sync_err:
            logger.debug(f"[validate-session] Lỗi đồng bộ role từ MSSQL: {sync_err}")

        return {
            "status": "valid",
            "username": auth_username,
            "bophanlogin": bophanlogin,
            "role": user_role,
            "role_id": role_id_val,
            "role_name": display_role,
            "manv": manv,
            "full_name_vi": full_name_vi,
            "full_name_en": full_name_en
        }
    finally:
        conn.close()


# ── Dependency Xác thực Phiên làm việc (Session Validation) ──

def validate_session(
    auth_username: Optional[str] = Header(None, alias="X-Username"), 
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
    
    print(f"[AUTH] Validating session for user: {auth_username or '(from cookie/header)'}")
    print(f"[AUTH] Cookie token present: {bool(session_token_cookie)}, Header token present: {bool(session_token_header)}")
    
    if not session_token:
        logger.warning(f"[AUTH] Thiếu session token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Yêu cầu chưa được xác thực: Thiếu session token."
        )
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if auth_username:
            cursor.execute("SELECT username, session_token, last_active FROM users WHERE username = ?", (auth_username,))
        else:
            cursor.execute("SELECT username, session_token, last_active FROM users WHERE session_token = ?", (session_token,))
        row = cursor.fetchone()
        
        if not row:
            logger.warning(f"[AUTH] Không tìm thấy phiên làm việc trong cơ sở dữ liệu")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Phiên làm việc không hợp lệ: Không tìm thấy người dùng."
            )
            
        auth_username = row["username"]
            
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

def _execute_tasklist_sso(token: Optional[str] = None, raw_username_param: Optional[str] = None):
    """
    Xử lý logic lõi SSO: xác thực token Tasklist hoặc username, trích xuất thông tin
    người dùng từ MSSQL, và đồng bộ session vào cơ sở dữ liệu SQLite cục bộ.
    Trả về: (username, manv, role, role_name, bophanlogin, new_token, user_data)
    """
    token = (token or "").strip()
    raw_username_param = (raw_username_param or "").strip()

    import httpx
    import json
    import base64

    user_data = None

    if token and token != "direct_url":
        # 1. Giải mã trực tiếp JWT payload trước (nếu token là JWT) để phản hồi tức thì (< 1ms)
        try:
            parts = token.strip().split(".")
            if len(parts) >= 2:
                padded = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
                decoded_bytes = base64.urlsafe_b64decode(padded.encode("utf-8"))
                jwt_payload = json.loads(decoded_bytes.decode("utf-8"))
                if isinstance(jwt_payload, dict) and any(k in jwt_payload for k in ["ma_nv", "manv", "MaNV", "username", "UserID", "user_id", "sub", "email", "id", "name"]):
                    user_data = jwt_payload
                    logger.info(f"[SSO] Giải mã trực tiếp Tasklist JWT token thành công: {jwt_payload}")
        except Exception as jwt_err:
            logger.debug(f"[SSO] Không thể parse JWT payload: {jwt_err}")

        # 2. Nếu chưa có user_data, thử xác thực qua các endpoint máy chủ Tasklist khả dụng
        if not user_data:
            candidate_urls = TASKLIST_AUTH_URLS
            seen = set()
            urls_to_try = [u for u in candidate_urls if u and not (u in seen or seen.add(u))]

            for url in urls_to_try:
                try:
                    with httpx.Client(verify=False, timeout=1.5) as client:
                        res = client.get(
                            url,
                            headers={"Authorization": f"Bearer {token}"}
                        )
                        if res.status_code == 200:
                            res_json = res.json()
                            user_data = res_json.get("data") or res_json
                            logger.info(f"[SSO] Xác thực Tasklist thành công qua endpoint: {url}")
                            break
                except Exception:
                    continue

    # 3. Fallback khi không có token hoặc token không chứa claims nhưng có username từ caller
    if not user_data and raw_username_param:
        user_data = {"username": raw_username_param, "ma_nv": raw_username_param}

    if not user_data:
        logger.warning("[SSO] Tasklist token không hợp lệ hoặc không thể xác thực.")
        raise HTTPException(status_code=401, detail="Tasklist token không hợp lệ")

    # 4. Trích xuất thông tin user từ Tasklist / MSSQL
    manv = str(user_data.get("ma_nv") or user_data.get("manv") or user_data.get("MaNV") or "").strip()
    raw_username = str(user_data.get("username") or user_data.get("UserID") or user_data.get("user_id") or user_data.get("sub") or user_data.get("name") or "").strip()
    user_id_val = str(user_data.get("id") or "").strip()

    mssql_user = None
    if manv:
        mssql_user = get_mssql_account_user(manv)
    if not mssql_user and raw_username:
        mssql_user = get_mssql_account_user(raw_username)
    if not mssql_user and user_id_val:
        mssql_user = get_mssql_account_user(user_id_val)
    if not mssql_user and raw_username_param:
        mssql_user = get_mssql_account_user(raw_username_param)

    bophanlogin = ""
    if mssql_user:
        username = mssql_user["UserID"]
        manv = str(mssql_user.get("MaNV") or manv).strip()
        raw_role = mssql_user.get("RoleName") or user_data.get("RoleName") or user_data.get("role") or "User"
        r_id = mssql_user.get("RoleID") or mssql_user.get("IsManagement")
        bophanlogin = str(mssql_user.get("bophanlogin") or "").strip()
    else:
        username = raw_username or manv or "EZE0098"
        manv = manv or username
        raw_role = user_data.get("RoleName") or user_data.get("role") or "User"
        r_id = user_data.get("RoleID") or user_data.get("IsManagement")
        bophanlogin = str(user_data.get("bophanlogin") or user_data.get("bophan") or "").strip()

    role, role_name = normalize_role_from_mssql(raw_role_name=raw_role, role_id=r_id)

    new_token = str(uuid.uuid4())

    # 5. Đồng bộ tài khoản vào CSDL cục bộ (SQLite / MySQL) để duy trì phiên làm việc
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
                "UPDATE users SET role = ?, is_online = 1, session_token = ?, last_active = ?, failed_attempts = 0, bophanlogin = ? WHERE username = ?",
                (role, new_token, datetime.now().isoformat(), bophanlogin, username)
            )
        else:
            dummy_email = user_data.get("email") or f"{username.lower()}@ezefloor.ai"
            local_cursor.execute(
                "INSERT INTO users (username, email, hashed_password, role, is_active, is_online, status, session_token, last_active, bophanlogin) VALUES (?, ?, ?, ?, 1, 1, 'active', ?, ?, ?)",
                (username, dummy_email, "sso_managed", role, new_token, datetime.now().isoformat(), bophanlogin)
            )
        local_conn.commit()
    finally:
        local_conn.close()

    return username, manv, role, role_name, bophanlogin, new_token, user_data


@router.post("/api/auth/tasklist-sso")
@router.post("/tasklist-sso")
async def tasklist_sso(
    request: Request,
    response: Response,
    payload: Optional[dict] = Body(default=None),
    token: Optional[str] = Query(None),
    username: Optional[str] = Query(None)
):
    """
    Xác thực đăng nhập một lần (SSO) từ TaskList Web3 qua POST payload hoặc query params.
    """
    if payload is None:
        try:
            payload = await request.json()
        except Exception:
            payload = {}

    t = (payload.get("token") or token or "").strip()
    raw_user = (
        payload.get("username")
        or payload.get("user")
        or payload.get("UserID")
        or payload.get("user_id")
        or username
    )
    if isinstance(raw_user, dict):
        raw_user = raw_user.get("username") or raw_user.get("UserID") or raw_user.get("user_id") or raw_user.get("name")

    username_res, manv, role, role_name, bophanlogin, new_token, user_data = _execute_tasklist_sso(t, raw_user)

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
        "username": username_res,
        "manv": manv,
        "role": role,
        "role_name": role_name,
        "bophanlogin": bophanlogin,
        "session_token": new_token,
        "data": user_data
    }


@router.get("/api/auth/tasklist-sso")
@router.get("/tasklist-sso")
async def tasklist_sso_get(
    request: Request,
    response: Response,
    token: Optional[str] = Query(None),
    sso_token: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    user: Optional[str] = Query(None),
    UserID: Optional[str] = Query(None),
    job: Optional[str] = Query(None),
    session_token: Optional[str] = Cookie(None, alias="session_token")
):
    """
    Xác thực đăng nhập một lần (SSO) từ TaskList Web3 qua GET request (URL params).
    Hỗ trợ redirect tự động nếu người dùng mở URL trực tiếp trên trình duyệt.
    """
    raw_token = token or sso_token
    raw_user = username or user or UserID
    is_html = "text/html" in request.headers.get("accept", "").lower()

    if not raw_token and not raw_user:
        # Kiểm tra nếu đã có phiên hợp lệ từ cookie trước đó
        if session_token:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT username, role, bophanlogin FROM users WHERE session_token = ? AND is_active = 1", (session_token,))
            u_row = cur.fetchone()
            conn.close()
            if u_row:
                if is_html:
                    target = f"/?job={job}" if job else "/"
                    return RedirectResponse(url=target, status_code=302)
                return {
                    "status": "success",
                    "username": u_row["username"],
                    "role": u_row["role"],
                    "bophanlogin": u_row["bophanlogin"] or "",
                    "session_token": session_token
                }
        if is_html:
            target = f"/?job={job}" if job else "/"
            return RedirectResponse(url=target, status_code=302)
        raise HTTPException(status_code=400, detail="Tasklist token or username is required")

    username, manv, role, role_name, bophanlogin, new_token, user_data = _execute_tasklist_sso(raw_token, raw_user)

    if is_html:
        target = f"/?job={job}" if job else "/"
        red_resp = RedirectResponse(url=target, status_code=302)
        red_resp.set_cookie(
            key="session_token",
            value=new_token,
            httponly=True,
            max_age=18000,
            samesite="lax",
            secure=False
        )
        return red_resp

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
        "role_name": role_name,
        "bophanlogin": bophanlogin,
        "session_token": new_token,
        "data": user_data
    }


def generate_procurement_sso_token(ma_nv: str, expires_in_seconds: int = 300) -> str:
    """Tạo HS256 JWT Token cho Procurement SSO"""
    import base64
    import hmac
    import hashlib
    import json
    import time
    if not TOOL_AI_SSO_SECRET:
        raise RuntimeError("TOOL_AI_SSO_SECRET is not configured in .env")

    clean_ma_nv = str(ma_nv or "EZE0090").strip() or "EZE0090"
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "ma_nv": clean_ma_nv,
        "iat": now,
        "exp": now + expires_in_seconds
    }

    def b64url(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")

    header_b64 = b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")

    signature = hmac.new(TOOL_AI_SSO_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    signature_b64 = b64url(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


@router.post("/api/auth/procurement-sso-token")
@router.post("/procurement-sso-token")
async def get_procurement_sso_token(payload: dict):
    """
    Sinh JWT token xác thực SSO cho hệ thống Procurement.
    Payload: { "ma_nv": "<mã nhân viên>" }
    """
    ma_nv = payload.get("ma_nv") or payload.get("manv") or "EZE0090"
    token = generate_procurement_sso_token(str(ma_nv))
    return {
        "status": "success",
        "token": token,
        "ma_nv": ma_nv
    }

