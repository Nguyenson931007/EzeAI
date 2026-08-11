"""
app/mssql_db.py – MSSQL Connection Module (emsflow)
=====================================================
Cung cấp kết nối đến MSSQL Server [emsflow] để truy vấn
bảng FrameWork, ListJobs, AssignJob, v.v.

Sử dụng thư viện pymssql để kết nối TCP/IP đến SQL Server.
"""

import logging
import pymssql
from app.config import MSSQL_HOST, MSSQL_PORT, MSSQL_USER, MSSQL_PASSWORD, MSSQL_DB

logger = logging.getLogger("ezefloor.mssql")


def get_mssql_connection():
    """
    Tạo kết nối mới đến MSSQL Server [emsflow].
    Trả về đối tượng pymssql.Connection.
    Caller chịu trách nhiệm đóng kết nối sau khi dùng xong.
    """
    try:
        conn = pymssql.connect(
            server=MSSQL_HOST,
            port=MSSQL_PORT,
            user=MSSQL_USER,
            password=MSSQL_PASSWORD,
            database=MSSQL_DB,
            charset="utf8",
            login_timeout=10,
            timeout=30,
        )
        return conn
    except Exception as e:
        logger.error(f"Không thể kết nối MSSQL Server {MSSQL_HOST}:{MSSQL_PORT} — {e}")
        raise


def test_mssql_connection():
    """Kiểm tra kết nối MSSQL có hoạt động không (dùng cho health-check)."""
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"MSSQL health-check thất bại: {e}")
        return False
