# backend/services/file_loader.py
import io
import fitz  # pymupdf
from PIL import Image

def load_images_from_file(filename: str, content: bytes):
    ext = filename.lower().split(".")[-1]

    # ===== IMAGE =====
    if ext in ["png", "jpg", "jpeg"]:
        img = Image.open(io.BytesIO(content)).convert("RGB")
        return [img]

    # ===== PDF =====
    if ext == "pdf":
        images = []
        pdf = fitz.open(stream=content, filetype="pdf")

        for page in pdf:
            pix = page.get_pixmap(dpi=700)  # 700 DPI for high resolution vector & text recognition
            img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            images.append(img)

        return images

    raise ValueError(f"Unsupported file type: {ext}")
