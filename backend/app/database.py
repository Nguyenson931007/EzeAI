"""
app/database.py
===============
Lớp trừu tượng hóa cơ sở dữ liệu (Database Abstraction Layer) hỗ trợ cả SQLite và MySQL.
Người dùng có thể chuyển đổi linh hoạt bằng cách thiết lập DB_TYPE="mysql" trong file cấu hình .env.
Mặc định: SQLite được sử dụng để duy trì tính tương thích ngược và chạy trực tiếp mà không cần cấu hình thêm.
"""

import sqlite3
from contextlib import contextmanager

from app.config import (
    DB_TYPE, SQLITE_PATH,
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB,
)

# ── Connection Pool cho MySQL (Khởi tạo lazy khi cần thiết) ──
_mysql_pool = None


def _get_mysql_pool():
    """
    Khởi tạo và trả về Connection Pool kết nối MySQL bằng thư viện DBUtils và PyMySQL.
    Điều này giúp tái sử dụng kết nối và tối ưu hóa hiệu năng khi có nhiều request đồng thời.
    """
    global _mysql_pool
    if _mysql_pool is None:
        import pymysql
        from dbutils.pooled_db import PooledDB
        _mysql_pool = PooledDB(
            creator=pymysql,
            maxconnections=10,
            mincached=2,
            maxcached=5,
            blocking=True,
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DB,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
        )
    return _mysql_pool


class DBConnection:
    """
    Lớp bao bọc (Wrapper) kết nối hợp nhất cho cả SQLite và MySQL.
    Giúp che giấu sự khác biệt về cú pháp giữa hai hệ quản trị CSDL.
    """

    def __init__(self, conn, db_type):
        self._conn = conn
        self._db_type = db_type
        self._cursor = None

    def cursor(self):
        """Khởi tạo và trả về Cursor hợp nhất để thực thi truy vấn."""
        if self._db_type == "mysql":
            self._cursor = self._conn.cursor()
        else:
            self._cursor = self._conn.cursor()
        return DBCursor(self._cursor, self._db_type)

    def commit(self):
        """Xác nhận giao dịch (Commit Transaction)."""
        self._conn.commit()

    def close(self):
        """Đóng kết nối cơ sở dữ liệu."""
        self._conn.close()

    @property
    def placeholder(self):
        """Trả về ký tự giữ chỗ cho tham số truy vấn (%s cho MySQL, ? cho SQLite)."""
        return "%s" if self._db_type == "mysql" else "?"


class DBCursor:
    """
    Lớp bao bọc Cursor hợp nhất để đồng bộ hóa cú pháp truy vấn.
    Tự động chuyển đổi các ký tự giữ chỗ tham số giữa SQLite và MySQL.
    """

    def __init__(self, cursor, db_type):
        self._cursor = cursor
        self._db_type = db_type

    def execute(self, query, params=None):
        """
        Thực thi câu lệnh SQL. Tự động chuyển đổi từ ? sang %s 
        đối với cơ sở dữ liệu MySQL để tránh lỗi cú pháp.
        """
        # Tự động thay thế dấu hỏi chấm bằng %s nếu cơ sở dữ liệu hiện tại là MySQL
        if self._db_type == "mysql" and "?" in query:
            query = query.replace("?", "%s")
        if params:
            self._cursor.execute(query, params)
        else:
            self._cursor.execute(query)

    def fetchone(self):
        """Lấy ra một hàng kết quả truy vấn dưới dạng dict hoặc row-factory."""
        row = self._cursor.fetchone()
        if row is None:
            return None
        if self._db_type == "mysql":
            # pymysql DictCursor tự động trả về kiểu dữ liệu dict
            return row
        else:
            # sqlite3.Row cho phép truy xuất cột dưới dạng dict
            return row

    def fetchall(self):
        """Lấy ra toàn bộ hàng kết quả của truy vấn."""
        rows = self._cursor.fetchall()
        if self._db_type == "mysql":
            return rows
        return rows

    @property
    def lastrowid(self):
        """Trả về ID tự tăng của hàng cuối cùng vừa được chèn vào bảng."""
        return self._cursor.lastrowid


def get_db_connection():
    """
    Mở và trả về kết nối cơ sở dữ liệu phù hợp (SQLite hoặc MySQL) 
    dựa trên cấu hình trong file môi trường .env.
    """
    if DB_TYPE == "mysql":
        pool = _get_mysql_pool()
        conn = pool.connection()
        return DBConnection(conn, "mysql")
    else:
        conn = sqlite3.connect(SQLITE_PATH)
        conn.row_factory = sqlite3.Row
        # Bật WAL Mode (Write-Ahead Logging) cho SQLite để tối ưu hóa hiệu năng đọc/ghi đồng thời
        conn.execute("PRAGMA temp_store = 2")
        conn.execute("PRAGMA journal_mode = WAL")
        return DBConnection(conn, "sqlite")


def init_db():
    """Initialize database tables."""
    conn = get_db_connection()
    cursor = conn.cursor()

    if DB_TYPE == "mysql":
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                hashed_password VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'user',
                is_active TINYINT NOT NULL DEFAULT 1,
                is_online TINYINT NOT NULL DEFAULT 0,
                status VARCHAR(50) NOT NULL DEFAULT 'active',
                session_token VARCHAR(255),
                last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                failed_attempts INT DEFAULT 0,
                is_locked TINYINT NOT NULL DEFAULT 0
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS jobs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                project_name VARCHAR(255) NOT NULL,
                room_count INT DEFAULT 0,
                total_area DOUBLE DEFAULT 0,
                data LONGTEXT NOT NULL,
                thumbnail LONGTEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_trained TINYINT DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users (id),
                INDEX idx_user_id (user_id),
                INDEX idx_project (user_id, project_name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS job_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                job_id INT NOT NULL,
                project_name VARCHAR(255) NOT NULL,
                old_user_id INT,
                new_user_id INT NOT NULL,
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ''')
    else:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                hashed_password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                is_active INTEGER NOT NULL DEFAULT 1,
                is_online INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'active'
            )
        ''')

        # Check if columns exist, if not add them (for existing databases)
        cursor.execute("PRAGMA table_info(users)")
        columns = [column["name"] if isinstance(column, dict) else column[1] for column in cursor.fetchall()]
        if 'is_active' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")
        if 'is_online' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN is_online INTEGER NOT NULL DEFAULT 0")
        if 'status' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
        if 'session_token' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN session_token TEXT")
        if 'last_active' not in columns:
            # SQLite does not allow dynamic defaults in ALTER TABLE
            cursor.execute("ALTER TABLE users ADD COLUMN last_active TEXT DEFAULT '2000-01-01 00:00:00'")
        if 'failed_attempts' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0")
        if 'is_locked' not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0")

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                project_name TEXT NOT NULL,
                room_count INTEGER DEFAULT 0,
                total_area REAL DEFAULT 0,
                data TEXT NOT NULL,
                thumbnail TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_trained INTEGER DEFAULT 0,
                share_token TEXT UNIQUE,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS job_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                project_name TEXT NOT NULL,
                old_user_id INTEGER,
                new_user_id INTEGER NOT NULL,
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
            )
        ''')

        # Check if thumbnail column exists
        cursor.execute("PRAGMA table_info(jobs)")
        job_columns = [column["name"] if isinstance(column, dict) else column[1] for column in cursor.fetchall()]
        if 'thumbnail' not in job_columns:
            cursor.execute("ALTER TABLE jobs ADD COLUMN thumbnail TEXT")
        if 'is_trained' not in job_columns:
            cursor.execute("ALTER TABLE jobs ADD COLUMN is_trained INTEGER DEFAULT 0")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print(f"Database initialized (type={DB_TYPE})")
