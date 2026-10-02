from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "frontend_next" / "src"
VI_CHARS = "ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵÁÀẢÃẠẤẦẨẪẬẮẰẲẴẶÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ"
VI = re.compile("[" + re.escape(VI_CHARS) + "]")
UI_HINT = re.compile(r"alert\(|notify\(|showPrompt\(|title\s*=|placeholder\s*=|detail\s*:|>[^<{]*[" + re.escape(VI_CHARS) + r"]")

# Vietnamese aliases intentionally retained only for parsing legacy/external data.
INTERNAL_ALLOW = (
    "TRỆT", "TẦNG 1", "TẦNG 2", "TẦNG 3", "TẦNG TRỆT", "MÁI",
    "gạch", "gỗ", "cửa sổ", "quá số lần",
    ".replace(/Vùng giao", ".replace(/Dôi dư", ".replace(/Ban công đua",
    ".replace(/Sàn tầng trên", ".replace(/Mặc định là Trần", ".replace(/Sàn ban công",
)

failures = []
for path in SRC.rglob("*"):
    if path.suffix not in {".js", ".jsx", ".ts", ".tsx"}:
        continue
    for lineno, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
        stripped = line.strip()
        code = line.split("//", 1)[0]
        if not VI.search(code):
            continue
        if stripped.startswith(("//", "/*", "*", "{/*")):
            continue
        if any(token in code for token in INTERNAL_ALLOW):
            continue
        if UI_HINT.search(code):
            failures.append(f"{path.relative_to(ROOT)}:{lineno}: {stripped}")

if failures:
    print("[FAIL] Vietnamese user-facing text remains:")
    print("\n".join(failures))
    sys.exit(1)

print("[PASS] No Vietnamese text remains in audited user-facing UI strings")
