"""
Centralized application configuration.

Runtime configuration is loaded from the single project-level ``.env`` file.
"""

from pathlib import Path
import os

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
ENV_FILE = PROJECT_ROOT / ".env"

# Explicit path makes configuration independent of the current working directory.
load_dotenv(dotenv_path=ENV_FILE, override=False)

# PaddlePaddle flags (must be set before importing Paddle).
os.environ.setdefault("FLAGS_enable_pir_api", os.getenv("FLAGS_ENABLE_PIR_API", "0"))
os.environ.setdefault("FLAGS_enable_pir_in_executor", os.getenv("FLAGS_ENABLE_PIR_IN_EXECUTOR", "0"))
os.environ.setdefault("FLAGS_pir_apply_inplace_pass", os.getenv("FLAGS_PIR_APPLY_INPLACE_PASS", "0"))
os.environ.setdefault("FLAGS_use_mkldnn", os.getenv("FLAGS_USE_MKLDNN", "0"))
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", os.getenv("KMP_DUPLICATE_LIB_OK", "TRUE"))

# Database
DB_TYPE = os.getenv("DB_TYPE", "sqlite").lower()
_sqlite_path_raw = os.getenv("SQLITE_PATH", "storage/ezefloor.db")
_sqlite_path = Path(_sqlite_path_raw).expanduser()
if not _sqlite_path.is_absolute():
    _sqlite_path = BACKEND_DIR / _sqlite_path
SQLITE_PATH = str(_sqlite_path.resolve())

if DB_TYPE == "sqlite" and SQLITE_PATH:
    Path(SQLITE_PATH).parent.mkdir(parents=True, exist_ok=True)

MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DB = os.getenv("MYSQL_DB", "ezefloor")

MSSQL_HOST = os.getenv("MSSQL_HOST", "")
MSSQL_PORT = int(os.getenv("MSSQL_PORT", "1433"))
MSSQL_USER = os.getenv("MSSQL_USER", "")
MSSQL_PASSWORD = os.getenv("MSSQL_PASSWORD", "")
MSSQL_DB = os.getenv("MSSQL_DB", "")
# ProcurementApp is a separate catalog/workflow database on the same SQL Server.
# Keep it explicit so EMS/emsflow queries and Procurement catalog queries never
# accidentally change each other's default database.
PROCUREMENT_DB = os.getenv("PROCUREMENT_DB", "ProcurementApp")

# CORS
_cors_env = os.getenv("CORS_ORIGINS", "http://localhost:3011,http://127.0.0.1:3011")
CORS_ORIGINS = [origin.strip() for origin in _cors_env.split(",") if origin.strip()]

# External services
TASKLIST_AUTH_URL = os.getenv("TASKLIST_AUTH_URL", "")
_tasklist_urls_env = os.getenv("TASKLIST_AUTH_URLS", TASKLIST_AUTH_URL)
TASKLIST_AUTH_URLS = [url.strip() for url in _tasklist_urls_env.split(",") if url.strip()]
_tasklist_origin = TASKLIST_AUTH_URL.split("/api/", 1)[0].rstrip("/") if "/api/" in TASKLIST_AUTH_URL else ""
TASKLIST_WORKFLOW_API_URL = os.getenv(
    "TASKLIST_WORKFLOW_API_URL",
    f"{_tasklist_origin}/api/workflow" if _tasklist_origin else "",
).rstrip("/")
TASKLIST_WORKFLOW_API_TOKEN = os.getenv("TASKLIST_WORKFLOW_API_TOKEN", "").strip()

# Upload limits
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", str(50 * 1024 * 1024)))

# SMTP
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_SENDER_NAME = os.getenv("SMTP_SENDER_NAME", "EzeFloor AI Support")

# Gemini wall rebuild (experimental, explicit user action only)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_WALL_MODEL = os.getenv("GEMINI_WALL_MODEL", "gemini-2.5-flash")

# Session / security
SESSION_TIMEOUT_MINUTES = int(os.getenv("SESSION_TIMEOUT_MINUTES", "30"))
SESSION_COOKIE_MAX_AGE = int(os.getenv("SESSION_COOKIE_MAX_AGE", "1800"))
PASSWORD_SALT = os.getenv("PASSWORD_SALT", "")
MAX_FAILED_ATTEMPTS = int(os.getenv("MAX_FAILED_ATTEMPTS", "5"))
TOOL_AI_SSO_SECRET = os.getenv("TOOL_AI_SSO_SECRET", "")
