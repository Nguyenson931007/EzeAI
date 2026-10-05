"""Centralized runtime configuration for EzeFloor.

All deployment-specific values live in the repository root .env. Application
code imports values from this module and does not embed server addresses, ports,
external API URLs, HTTP methods, credentials, or integration timeouts.
"""
from pathlib import Path
import os
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
ENV_FILE = PROJECT_ROOT / ".env"
load_dotenv(dotenv_path=ENV_FILE, override=False)

def _csv(name: str):
    return [v.strip() for v in os.getenv(name, "").split(",") if v.strip()]

def _int(name: str, default: int):
    raw = os.getenv(name, "").strip()
    return int(raw) if raw else default

def _float(name: str, default: float):
    raw = os.getenv(name, "").strip()
    return float(raw) if raw else default

# Runtime flags
os.environ.setdefault("FLAGS_enable_pir_api", os.getenv("FLAGS_ENABLE_PIR_API", "0"))
os.environ.setdefault("FLAGS_enable_pir_in_executor", os.getenv("FLAGS_ENABLE_PIR_IN_EXECUTOR", "0"))
os.environ.setdefault("FLAGS_pir_apply_inplace_pass", os.getenv("FLAGS_PIR_APPLY_INPLACE_PASS", "0"))
os.environ.setdefault("FLAGS_use_mkldnn", os.getenv("FLAGS_USE_MKLDNN", "0"))
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", os.getenv("KMP_DUPLICATE_LIB_OK", "TRUE"))

# Application addresses
APP_HOST = os.getenv("APP_HOST", "").strip()
APP_PORT = _int("APP_PORT", 8090)
APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "").strip().rstrip("/")
FRONTEND_PUBLIC_URL = os.getenv("FRONTEND_PUBLIC_URL", "").strip().rstrip("/")

# Local application database
DB_TYPE = os.getenv("DB_TYPE", "sqlite").lower()
_sqlite_raw = os.getenv("SQLITE_PATH", "storage/ezefloor.db")
_sqlite_path = Path(_sqlite_raw).expanduser()
if not _sqlite_path.is_absolute():
    _sqlite_path = BACKEND_DIR / _sqlite_path
SQLITE_PATH = str(_sqlite_path.resolve())
if DB_TYPE == "sqlite":
    Path(SQLITE_PATH).parent.mkdir(parents=True, exist_ok=True)
MYSQL_HOST = os.getenv("MYSQL_HOST", "").strip()
MYSQL_PORT = _int("MYSQL_PORT", 3306)
MYSQL_USER = os.getenv("MYSQL_USER", "").strip()
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DB = os.getenv("MYSQL_DB", "").strip()

# MSSQL
MSSQL_HOST = os.getenv("MSSQL_HOST", "").strip()
MSSQL_PORT = _int("MSSQL_PORT", 1433)
MSSQL_USER = os.getenv("MSSQL_USER", "").strip()
MSSQL_PASSWORD = os.getenv("MSSQL_PASSWORD", "")
MSSQL_DB = os.getenv("MSSQL_DB", "").strip()
PROCUREMENT_DB = os.getenv("PROCUREMENT_DB", "").strip()
MSSQL_LOGIN_TIMEOUT_SEC = _int("MSSQL_LOGIN_TIMEOUT_SEC", 10)
MSSQL_QUERY_TIMEOUT_SEC = _int("MSSQL_QUERY_TIMEOUT_SEC", 30)

# CORS / proxy policy
CORS_ORIGINS = _csv("CORS_ORIGINS")
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", "").strip() or None

# TaskList integration
TASKLIST_AUTH_URL = os.getenv("TASKLIST_AUTH_URL", "").strip()
TASKLIST_AUTH_URLS = _csv("TASKLIST_AUTH_URLS") or ([TASKLIST_AUTH_URL] if TASKLIST_AUTH_URL else [])
_tasklist_origin = TASKLIST_AUTH_URL.split("/api/", 1)[0].rstrip("/") if "/api/" in TASKLIST_AUTH_URL else ""
TASKLIST_WORKFLOW_API_URL = (os.getenv("TASKLIST_WORKFLOW_API_URL", "").strip() or (f"{_tasklist_origin}/api/workflow" if _tasklist_origin else "")).rstrip("/")
TASKLIST_WORKFLOW_API_TOKEN = os.getenv("TASKLIST_WORKFLOW_API_TOKEN", "").strip()
TASKLIST_WORKFLOW_READ_METHOD = os.getenv("TASKLIST_WORKFLOW_READ_METHOD", "GET").strip().upper()
TASKLIST_WORKFLOW_WRITE_METHOD = os.getenv("TASKLIST_WORKFLOW_WRITE_METHOD", "PUT").strip().upper()
TASKLIST_API_TIMEOUT_SEC = _float("TASKLIST_API_TIMEOUT_SEC", 5.0)
TASKLIST_AUTH_TIMEOUT_SEC = _float("TASKLIST_AUTH_TIMEOUT_SEC", 1.5)
TASKLIST_VERIFY_SSL = os.getenv("TASKLIST_VERIFY_SSL", "true").strip().lower() in {"1","true","yes","on"}
TASKLIST_ALLOWED_ORIGINS = _csv("TASKLIST_ALLOWED_ORIGINS")

# Procurement integration
PROCUREMENT_WEB_URL = os.getenv("PROCUREMENT_WEB_URL", "").strip().rstrip("/")
PROCUREMENT_RECEIVE_JOB_URL = os.getenv("PROCUREMENT_RECEIVE_JOB_URL", "").strip()
PROCUREMENT_RECEIVE_JOB_METHOD = os.getenv("PROCUREMENT_RECEIVE_JOB_METHOD", "POST").strip().upper()
PROCUREMENT_API_TIMEOUT_SEC = _float("PROCUREMENT_API_TIMEOUT_SEC", 5.0)
PROCUREMENT_DEFAULT_EMPLOYEE_ID = os.getenv("PROCUREMENT_DEFAULT_EMPLOYEE_ID", "").strip()
SSO_DEFAULT_EMPLOYEE_ID = os.getenv("SSO_DEFAULT_EMPLOYEE_ID", "").strip()
DEFAULT_OFFICE_CODE = os.getenv("DEFAULT_OFFICE_CODE", "").strip()

# Upload
MAX_UPLOAD_SIZE = _int("MAX_UPLOAD_SIZE", 50 * 1024 * 1024)

# SMTP / notifications
SMTP_SERVER = os.getenv("SMTP_SERVER", "").strip()
SMTP_PORT = _int("SMTP_PORT", 587)
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_SENDER_NAME = os.getenv("SMTP_SENDER_NAME", "").strip()
ADMIN_NOTIFICATION_EMAIL = os.getenv("ADMIN_NOTIFICATION_EMAIL", "").strip()

# AI providers
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "").strip().rstrip("/")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "").strip()
OPENAI_TIMEOUT_SEC = _int("OPENAI_TIMEOUT_SEC", 180)
OPENAI_MAX_RETRIES = _int("OPENAI_MAX_RETRIES", 3)
OPENAI_REASONING_EFFORT = os.getenv("OPENAI_REASONING_EFFORT", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_API_URL = os.getenv("GEMINI_API_URL", "").strip()

# Session / security
SESSION_TIMEOUT_MINUTES = _int("SESSION_TIMEOUT_MINUTES", 30)
SESSION_COOKIE_MAX_AGE = _int("SESSION_COOKIE_MAX_AGE", 1800)
PASSWORD_SALT = os.getenv("PASSWORD_SALT", "")
MAX_FAILED_ATTEMPTS = _int("MAX_FAILED_ATTEMPTS", 5)
TOOL_AI_SSO_SECRET = os.getenv("TOOL_AI_SSO_SECRET", "")
