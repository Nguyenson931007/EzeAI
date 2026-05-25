"""
app/config.py – Centralized Configuration
==========================================
All environment variable loading and application-level constants in one place.
Imported by main.py, database.py, auth.py, and other modules as needed.
"""

import os
from dotenv import load_dotenv

# Load .env before anything else
load_dotenv()

# ── PaddlePaddle Flags (must be set before importing Paddle) ──
os.environ.setdefault("FLAGS_enable_pir_api", "0")
os.environ.setdefault("FLAGS_enable_pir_in_executor", "0")
os.environ.setdefault("FLAGS_pir_apply_inplace_pass", "0")
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

# ── Database Configuration ──
DB_TYPE = os.getenv("DB_TYPE", "sqlite").lower()

# SQLite
SQLITE_PATH = os.getenv("SQLITE_PATH", os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage", "ezefloor.db"))

# Ensure SQLite directory exists
if DB_TYPE == "sqlite" and SQLITE_PATH:
    _sqlite_dir = os.path.dirname(os.path.abspath(SQLITE_PATH))
    os.makedirs(_sqlite_dir, exist_ok=True)

# MySQL
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DB = os.getenv("MYSQL_DB", "ezefloor")

# ── CORS Configuration ──
CORS_ORIGINS = [
    "http://localhost:3010",
    "http://127.0.0.1:3010",
    "http://localhost:8090",
]
CORS_ORIGIN_REGEX = r"https?://.*"

# ── SMTP Configuration ──
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "your-system-email@gmail.com")
SMTP_PASS = os.getenv("SMTP_PASS", "your-app-password")
SMTP_SENDER_NAME = "EzeFloor AI Support"

# ── Session Configuration ──
SESSION_TIMEOUT_MINUTES = 30
SESSION_COOKIE_MAX_AGE = 1800  # 30 minutes in seconds

# ── Security ──
PASSWORD_SALT = "ezefloor_salt_123"
MAX_FAILED_ATTEMPTS = 5
