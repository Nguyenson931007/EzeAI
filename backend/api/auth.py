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
    """Xác minh mật khẩu thô nhận được từ client với mật khẩu đã mã hóa trong cơ sở dữ liệu."""
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


@router.post("/login")
def login(user: UserLogin, response: Response):
    """
    Đăng nhập hệ thống.
    - Thực hiện kiểm tra cơ chế Brute Force (khóa tài khoản nếu nhập sai mật khẩu quá 5 lần).
    - Tạo session_token ngẫu nhiên duy nhất (UUID), lưu trữ vào DB và thiết lập HTTP-Only Cookie.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Tìm thông tin người dùng trong DB
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

        # 1. Kiểm tra trạng thái Khóa (Anti-Brute Force)
        if row["is_locked"] == 1 or row["failed_attempts"] >= 5:
            if row["is_locked"] == 0:  # Chuyển trạng thái sang Khóa nếu đây là lần đầu tiên vượt ngưỡng
                cursor.execute("UPDATE users SET is_locked = 1 WHERE id = ?", (row["id"],))
                conn.commit()
            print(f"🚨 [SECURITY ALERT] Tài khoản '{user.username}' bị khóa do nhập sai mật khẩu quá 5 lần!")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS, 
                detail="Tài khoản đã bị khóa do nhập sai mật khẩu quá số lần quy định. Vui lòng liên hệ Admin để mở khóa."
            )

        # 2. Kiểm tra mật khẩu hợp lệ
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
        
        # 3. Kiểm tra trạng thái phê duyệt và hoạt động
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
        
        # 4. Thành công: Khởi tạo Session mới (Đăng xuất tự động các phiên cũ ở thiết bị khác)
        new_token = str(uuid.uuid4())
        cursor.execute(
            "UPDATE users SET is_online = 1, session_token = ?, last_active = ?, failed_attempts = 0 WHERE id = ?", 
            (new_token, datetime.now().isoformat(), row["id"])
        )
        conn.commit()
        
        # Thiết lập HTTP-Only Cookie để chống tấn công XSS
        response.set_cookie(
            key="session_token",
            value=new_token,
            httponly=True,
            max_age=1800,  # Thời gian sống phiên: 30 phút
            samesite="lax",
            secure=False   # Thiết lập bằng True nếu triển khai HTTPS trên production
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
        cursor.execute("SELECT session_token, last_active FROM users WHERE username = ?", (auth_username,))
        row = cursor.fetchone()

        if not row or row["session_token"] != session_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Phiên đăng nhập không hợp lệ hoặc đã bị thay thế."
            )

        # Check 30-minute inactivity timeout
        last_active = datetime.fromisoformat(row["last_active"])
        if datetime.now() - last_active > timedelta(minutes=30):
            cursor.execute("UPDATE users SET is_online = 0, session_token = NULL WHERE username = ?", (auth_username,))
            conn.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Phiên đăng nhập đã hết hạn."
            )

        return {"status": "valid", "username": auth_username}
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
    - Kiểm tra tính hợp lệ của Token và hết hạn phiên (Session Timeout: 30 phút không hoạt động).
    - Tự động cập nhật mốc thời gian hoạt động cuối cùng (last_active) để gia hạn phiên.
    """
    session_token = session_token_cookie or session_token_header
    
    print(f"[AUTH] Đang xác thực phiên cho người dùng: {auth_username}")
    print(f"[AUTH] Có cookie token: {bool(session_token_cookie)}, Có header token: {bool(session_token_header)}")
    
    if not auth_username or not session_token:
        logger.warning(f"[AUTH] Thiếu username hoặc session token cho người dùng {auth_username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Yêu cầu chưa được xác thực: Thiếu thông tin phiên đăng nhập."
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
        
        # Kiểm tra hết hạn phiên 30 phút do không tương tác
        last_active = datetime.fromisoformat(row["last_active"])
        if datetime.now() - last_active > timedelta(minutes=30):
            cursor.execute("UPDATE users SET is_online = 0, session_token = NULL WHERE username = ?", (auth_username,))
            conn.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Phiên làm việc đã hết hạn do không hoạt động trong 30 phút."
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
