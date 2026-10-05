"""
app/mssql_db.py – MSSQL Connection Module (emsflow)
=====================================================
Cung cấp kết nối đến MSSQL Server [emsflow] để truy vấn
bảng FrameWork, ListJobs, AssignJob, v.v.

Sử dụng thư viện pymssql để kết nối TCP/IP đến SQL Server.
"""

import logging
from app.config import (
    MSSQL_HOST, MSSQL_PORT, MSSQL_USER, MSSQL_PASSWORD, MSSQL_DB, PROCUREMENT_DB,
    MSSQL_LOGIN_TIMEOUT_SEC, MSSQL_QUERY_TIMEOUT_SEC,
)

logger = logging.getLogger("ezefloor.mssql")


def get_mssql_connection():
    """
    Tạo kết nối mới đến MSSQL Server [emsflow].
    Trả về đối tượng pymssql.Connection.
    Caller chịu trách nhiệm đóng kết nối sau khi dùng xong.
    """
    try:
        import pymssql
    except ImportError as e:
        logger.error("Thư viện 'pymssql' chưa được cài đặt. Hãy chạy: pip install pymssql")
        raise RuntimeError("Thư viện 'pymssql' chưa được cài đặt trên máy chủ.") from e

    try:
        conn = pymssql.connect(
            server=MSSQL_HOST,
            port=MSSQL_PORT,
            user=MSSQL_USER,
            password=MSSQL_PASSWORD,
            database=MSSQL_DB,
            charset="utf8",
            login_timeout=MSSQL_LOGIN_TIMEOUT_SEC,
            timeout=MSSQL_QUERY_TIMEOUT_SEC,
        )
        return conn
    except Exception as e:
        logger.error(f"Không thể kết nối MSSQL Server {MSSQL_HOST}:{MSSQL_PORT} — {e}")
        raise


def get_procurement_connection():
    """Return a read/write connection whose default catalog is ProcurementApp.

    This is intentionally separate from ``get_mssql_connection`` (emsflow).
    Callers still control whether they execute read or explicit user-triggered
    write operations.
    """
    try:
        import pymssql
    except ImportError as e:
        logger.error("Thư viện 'pymssql' chưa được cài đặt. Hãy chạy: pip install pymssql")
        raise RuntimeError("Thư viện 'pymssql' chưa được cài đặt trên máy chủ.") from e

    try:
        return pymssql.connect(
            server=MSSQL_HOST,
            port=MSSQL_PORT,
            user=MSSQL_USER,
            password=MSSQL_PASSWORD,
            database=PROCUREMENT_DB,
            charset="utf8",
            login_timeout=MSSQL_LOGIN_TIMEOUT_SEC,
            timeout=MSSQL_QUERY_TIMEOUT_SEC,
        )
    except Exception as e:
        logger.error(
            f"Không thể kết nối Procurement MSSQL {MSSQL_HOST}:{MSSQL_PORT}/{PROCUREMENT_DB} — {e}"
        )
        raise


from contextlib import contextmanager


@contextmanager
def get_mssql_session(auto_commit: bool = True):
    """
    Context manager quản lý vòng đời kết nối MSSQL tự động:
    1. Mở kết nối: conn = get_mssql_connection()
    2. Thao tác dữ liệu an toàn
    3. Tự động commit nếu thành công, rollback nếu có lỗi
    4. Luôn luôn đóng kết nối (conn.close()) khi hoàn thành hoặc có lỗi
    """
    conn = get_mssql_connection()
    try:
        yield conn
        if auto_commit:
            conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        logger.error(f"MSSQL Session lỗi trong quá trình thao tác dữ liệu: {e}")
        raise
    finally:
        try:
            conn.close()
        except Exception:
            pass


def test_mssql_connection():
    """Kiểm tra kết nối MSSQL có hoạt động không (dùng cho health-check)."""
    try:
        with get_mssql_session(auto_commit=False) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return True
    except Exception as e:
        logger.error(f"MSSQL health-check thất bại: {e}")
        return False
