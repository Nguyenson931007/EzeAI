from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

SCAN_ROOTS = [
    ROOT / "backend",
    ROOT / "frontend_next" / "src",
]

EXCLUDED_DIRS = {
    ".git",
    ".venv",
    "venv",
    "env",
    "node_modules",
    ".next",
    "__pycache__",
    "site-packages",
    "dist",
    "build",
    "tmp",
    "models",
    "datasets",
    ".pytest_cache",
}

ALLOWED_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx",
    ".json", ".yml", ".yaml",
}

patterns = [
    re.compile(r'https?://(?:localhost|127\.0\.0\.1)(?::\d+)?', re.I),
    re.compile(
        r'https?://(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?',
        re.I
    ),
]

hits = []

for scan_root in SCAN_ROOTS:
    if not scan_root.exists():
        continue

    for path in scan_root.rglob("*"):
        if not path.is_file():
            continue

        try:
            relative = path.relative_to(ROOT)
        except ValueError:
            continue

        if any(part in EXCLUDED_DIRS for part in relative.parts):
            continue

        if path.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue

        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        for lineno, line in enumerate(content.splitlines(), 1):
            if any(pattern.search(line) for pattern in patterns):
                hits.append((relative, lineno, line.strip()))

if hits:
    print("Runtime/deployment URL hard-codes found:")
    for path, lineno, line in hits:
        print(f"{path}:{lineno}: {line}")
    raise SystemExit(1)

print(
    "OK: no runtime/deployment IP/localhost URL hard-codes "
    "found in application source."
)
