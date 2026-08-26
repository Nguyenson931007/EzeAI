"""
backend/api/admin.py
====================
Module quản trị hệ thống (Admin Panel Interface) của EzeFloor.
Dành riêng cho người dùng quản trị (Role = Admin) để quản lý danh sách người dùng,
phê duyệt hoặc từ chối đăng ký mới, cập nhật hồ sơ, xóa người dùng, và mở khóa
tài khoản bị khóa do nhập sai mật khẩu (Anti-Brute Force Lock) kèm tự động cấp lại mật khẩu qua Email.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from app.database import get_db_connection
from .auth import get_password_hash, verify_google_email, send_credentials_email

# Khởi tạo APIRouter dành cho các API quản trị
router = APIRouter()

# ── Pydantic Schemas (Mô hình đầu vào và đầu ra) ──

class UserUpdate(BaseModel):
    """Mô hình dữ liệu gửi lên khi Admin cập nhật thông tin một người dùng."""
    username: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[int] = None
    password: Optional[str] = None
    full_name_en: Optional[str] = None
    full_name_vi: Optional[str] = None
    age: Optional[int] = None
    position: Optional[str] = None
    team: Optional[str] = None
    phone: Optional[str] = None


class UserResponse(BaseModel):
    """Mô hình phản hồi thông tin chi tiết của người dùng hiển thị trên trang Admin Dashboard."""
    id: int
    username: str
    email: str
    role: str
    is_active: int
    is_online: int
    status: str
    is_locked: int
    failed_attempts: int
    full_name_en: Optional[str] = None
    full_name_vi: Optional[str] = None
    age: Optional[int] = None
    position: Optional[str] = None
    team: Optional[str] = None
    phone: Optional[str] = None


# ── API Endpoints (Các định tuyến giao tiếp quản trị) ──

@router.get("/users", response_model=List[UserResponse])
def get_users():
    """
    Lấy danh sách tất cả các tài khoản người dùng có trên hệ thống.
    Cho phép Admin kiểm tra trạng thái hoạt động (active/inactive), trạng thái trực tuyến (online/offline),
    và trạng thái khóa tài khoản do nhập sai mật khẩu (locked/unlocked).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT id, username, email, role, is_active, is_online, status, is_locked, failed_attempts, full_name_en, full_name_vi, age, position, team, phone FROM users"
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/users/{user_id}/approve")
def approve_user(user_id: int):
    """
    Phê duyệt một tài khoản người dùng đăng ký mới.
    Chuyển trạng thái từ 'pending' sang 'active', cho phép họ đăng nhập vào hệ thống.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE users SET status = 'active' WHERE id = ?", (user_id,))
        conn.commit()
        return {"message": "Đã phê duyệt tài khoản thành công."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/users/{user_id}/reject")
def reject_user(user_id: int):
    """
    Từ chối đăng ký và xóa bỏ hoàn toàn thông tin đăng ký của tài khoản ra khỏi hệ thống.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        return {"message": "Đã từ chối đăng ký và xóa thông tin tài khoản."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/users/{user_id}")
def update_user(user_id: int, user_data: UserUpdate):
    """
    Cập nhật thông tin chi tiết tài khoản người dùng (bao gồm đổi tên, email, vai trò, kích hoạt/tạm khóa và đổi mật khẩu).
    - Email mới bắt buộc phải thuộc hệ thống Google được phê duyệt.
    - Nếu có thay đổi mật khẩu: Hệ thống tự động băm mật khẩu mới và gửi email thông báo thông tin đăng nhập trực tiếp tới người dùng.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Kiểm tra xem người dùng có tồn tại hay không
        cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản người dùng.")

        updates = []
        params = []
        
        # Kiểm tra và gom nhóm các trường dữ liệu yêu cầu thay đổi
        if user_data.username is not None:
            updates.append("username = ?")
            params.append(user_data.username)
            
        if user_data.email is not None:
            if not verify_google_email(user_data.email):
                raise HTTPException(
                    status_code=400, 
                    detail="Email không hợp lệ hoặc không thuộc miền Google được hỗ trợ."
                )
            updates.append("email = ?")
            params.append(user_data.email)
            
        if user_data.role is not None:
            updates.append("role = ?")
            params.append(user_data.role)
            
        if user_data.is_active is not None:
            updates.append("is_active = ?")
            params.append(user_data.is_active)
            
        if user_data.password is not None:
            updates.append("hashed_password = ?")
            params.append(get_password_hash(user_data.password))

        if user_data.full_name_en is not None:
            updates.append("full_name_en = ?")
            params.append(user_data.full_name_en)

        if user_data.full_name_vi is not None:
            updates.append("full_name_vi = ?")
            params.append(user_data.full_name_vi)

        if user_data.age is not None:
            updates.append("age = ?")
            params.append(user_data.age)

        if user_data.position is not None:
            updates.append("position = ?")
            params.append(user_data.position)

        if user_data.team is not None:
            updates.append("team = ?")
            params.append(user_data.team)

        if user_data.phone is not None:
            updates.append("phone = ?")
            params.append(user_data.phone)

        # Nếu không có thông tin cập nhật nào được gửi lên
        if not updates:
            return {"message": "Không nhận thấy thông tin thay đổi nào."}

        # Xây dựng và thực thi câu lệnh UPDATE động
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
        params.append(user_id)
        cursor.execute(query, tuple(params))
        conn.commit()

        # Nếu Admin thực hiện đặt lại mật khẩu, tự động gửi email thông tin đăng nhập mới tới người dùng
        if user_data.password is not None:
            cursor.execute("SELECT email, username FROM users WHERE id = ?", (user_id,))
            user_info = cursor.fetchone()
            if user_info:
                send_credentials_email(
                    user_info["email"], 
                    user_info["username"], 
                    user_data.password, 
                    action="created"
                )

        return {"message": "Cập nhật hồ sơ tài khoản thành công."}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/users/{user_id}")
def delete_user(user_id: int):
    """
    Xóa tài khoản người dùng trực tiếp qua ID.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        return {"message": "Đã xóa tài khoản người dùng thành công khỏi hệ thống."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


class UnlockRequest(BaseModel):
    """Mô hình yêu cầu mở khóa tài khoản bị tạm khóa do cơ chế Brute Force."""
    user_id: int
    new_password: str


@router.post("/users/unlock")
def unlock_user(req: UnlockRequest):
    """
    Mở khóa tài khoản người dùng (Đặt lại trạng thái `is_locked = 0`, khôi phục số lần thử `failed_attempts = 0`),
    đồng thời thiết lập mật khẩu mới do Admin cấp và gửi email mật khẩu mới trực tiếp cho người dùng.
    Mục đích: Khôi phục quyền truy cập an toàn cho tài khoản người dùng bị khóa do cơ chế bảo mật chống dò mật khẩu.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Băm mật khẩu mới được cấp bởi Admin
        hashed_pwd = get_password_hash(req.new_password)
        cursor.execute(
            "UPDATE users SET is_locked = 0, failed_attempts = 0, hashed_password = ? WHERE id = ?",
            (hashed_pwd, req.user_id)
        )
        conn.commit()

        # Gửi email thông tin mật khẩu đăng nhập mới tới người dùng
        cursor.execute("SELECT email, username FROM users WHERE id = ?", (req.user_id,))
        user_info = cursor.fetchone()
        if user_info:
            send_credentials_email(
                user_info["email"], 
                user_info["username"], 
                req.new_password, 
                action="reset"
            )

        return {
            "status": "success", 
            "message": "Mở khóa tài khoản và thiết lập lại mật khẩu đăng nhập thành công."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
