# backend/services/file_loader.py
import io
import json
import re
from pathlib import Path
import fitz  # pymupdf
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def export_pdf_text_layers(filename: str, content: bytes) -> dict:
    """
    Extracts all text layers (vector text elements) and bounding box coordinates 
    from a PDF BEFORE converting pages to images.
    Exports the data into a JS file (and JSON file) in the exports/pdf_text_layers directory.
    """
    try:
        pdf = fitz.open(stream=content, filetype="pdf")
        stem_name = Path(filename).stem
        clean_name = re.sub(r"[^\w\-]", "_", stem_name)
        if not clean_name:
            clean_name = "plan"

        # Export directory inside backend/exports/pdf_text_layers
        export_dir = Path(__file__).resolve().parents[1] / "exports" / "pdf_text_layers"
        export_dir.mkdir(parents=True, exist_ok=True)

        pages_data = []
        pages_data = []
        total_texts_count = 0

        for page_idx, page in enumerate(pdf, start=1):
            page_rect = page.rect
            page_dict = page.get_text("dict")
            
            extracted_texts = []
            
            # Strategy A: PyMuPDF dict spans
            for block in page_dict.get("blocks", []):
                if block.get("type") == 0:  # Text block
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            txt = str(span.get("text", "")).strip()
                            if not txt:
                                continue
                            bbox = [round(float(c), 2) for c in span.get("bbox", [0, 0, 0, 0])]
                            center_x = round((bbox[0] + bbox[2]) / 2.0, 2)
                            center_y = round((bbox[1] + bbox[3]) / 2.0, 2)
                            font_name = str(span.get("font", "Unknown"))
                            font_size = round(float(span.get("size", 0)), 1)
                            flags = int(span.get("flags", 0))

                            extracted_texts.append({
                                "text": txt,
                                "bbox": bbox,
                                "center": {"x": center_x, "y": center_y},
                                "width": round(bbox[2] - bbox[0], 2),
                                "height": round(bbox[3] - bbox[1], 2),
                                "font": font_name,
                                "size": font_size,
                                "flags": flags,
                                "page": page_idx
                            })

            # Strategy B: PyMuPDF words fallback if dict spans was empty
            if not extracted_texts:
                words = page.get_text("words")
                for w in words:
                    txt = str(w[4]).strip()
                    if not txt:
                        continue
                    bbox = [round(float(w[0]), 2), round(float(w[1]), 2), round(float(w[2]), 2), round(float(w[3]), 2)]
                    center_x = round((bbox[0] + bbox[2]) / 2.0, 2)
                    center_y = round((bbox[1] + bbox[3]) / 2.0, 2)
                    extracted_texts.append({
                        "text": txt,
                        "bbox": bbox,
                        "center": {"x": center_x, "y": center_y},
                        "width": round(bbox[2] - bbox[0], 2),
                        "height": round(bbox[3] - bbox[1], 2),
                        "font": "PDF_Word",
                        "size": 10.0,
                        "flags": 0,
                        "page": page_idx
                    })

            # Strategy C: EasyOCR Fallback for Scanned PDF Images
            if not extracted_texts:
                try:
                    from services.ocr import run_ocr
                    pix = page.get_pixmap(dpi=150)
                    img_ocr = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
                    ocr_results = run_ocr(img_ocr, skip_tesseract=True)
                    
                    pdf_w, pdf_h = float(page_rect.width), float(page_rect.height)
                    scale_x = pdf_w / float(pix.width) if pix.width > 0 else 1.0
                    scale_y = pdf_h / float(pix.height) if pix.height > 0 else 1.0

                    for res in ocr_results:
                        txt = str(res.get("text", "")).strip()
                        if not txt:
                            continue
                        tb_bbox = res.get("bbox", {})
                        bx = float(tb_bbox.get("x", 0)) * scale_x
                        by = float(tb_bbox.get("y", 0)) * scale_y
                        bw = float(tb_bbox.get("w", 0)) * scale_x
                        bh = float(tb_bbox.get("h", 0)) * scale_y
                        bbox = [round(bx, 2), round(by, 2), round(bx + bw, 2), round(by + bh, 2)]
                        center_x = round(bx + bw / 2.0, 2)
                        center_y = round(by + bh / 2.0, 2)

                        extracted_texts.append({
                            "text": txt,
                            "bbox": bbox,
                            "center": {"x": center_x, "y": center_y},
                            "width": round(bw, 2),
                            "height": round(bh, 2),
                            "font": "OCR_Detected",
                            "size": round(bh, 1),
                            "flags": 0,
                            "page": page_idx
                        })
                except Exception as ocr_err:
                    print(f"[file_loader] EasyOCR fallback warning for PDF page {page_idx}: {ocr_err}")

            total_texts_count += len(extracted_texts)
            pages_data.append({
                "page": page_idx,
                "width": round(float(page_rect.width), 2),
                "height": round(float(page_rect.height), 2),
                "textCount": len(extracted_texts),
                "texts": extracted_texts
            })

        result_payload = {
            "filename": filename,
            "exportedAt": fitz.get_pdf_now(),
            "totalPages": len(pdf),
            "totalTextCount": total_texts_count,
            "pages": pages_data
        }

        # Export directory inside backend/exports/pdf_text_layers
        backend_export_dir = Path(__file__).resolve().parents[1] / "exports" / "pdf_text_layers"
        backend_export_dir.mkdir(parents=True, exist_ok=True)

        # Export directory inside frontend_next/public/pdf_text_layers
        frontend_export_dir = Path(__file__).resolve().parents[2] / "frontend_next" / "public" / "pdf_text_layers"
        frontend_export_dir.mkdir(parents=True, exist_ok=True)

        js_content = f"""// Auto-generated PDF Text Layers for '{filename}'
// Generated BEFORE PDF to Image conversion by EzeFloor Backend

export const pdfTextLayers = {json.dumps(result_payload, ensure_ascii=False, indent=2)};

if (typeof window !== 'undefined') {{
  window.pdfTextLayers = pdfTextLayers;
}}
"""

        for target_dir in [backend_export_dir, frontend_export_dir]:
            # Save under clean filename e.g. plan_text_layers.json
            with open(target_dir / f"{clean_name}_text_layers.json", "w", encoding="utf-8") as f_json:
                json.dump(result_payload, f_json, ensure_ascii=False, indent=2)
            with open(target_dir / f"{clean_name}_text_layers.js", "w", encoding="utf-8") as f_js:
                f_js.write(js_content)

            # ALSO save under fixed filename uploaded_plan_text_layers.json/js for immediate access
            with open(target_dir / "uploaded_plan_text_layers.json", "w", encoding="utf-8") as f_json:
                json.dump(result_payload, f_json, ensure_ascii=False, indent=2)
            with open(target_dir / "uploaded_plan_text_layers.js", "w", encoding="utf-8") as f_js:
                f_js.write(js_content)

        print(f"[file_loader] PDF Text layers exported BEFORE image conversion -> {backend_export_dir / 'uploaded_plan_text_layers.js'} ({total_texts_count} text items)")
        return result_payload

    except Exception as err:
        print(f"[file_loader] Error exporting PDF text layers for '{filename}': {err}")
        return {}


def load_images_from_file(filename: str, content: bytes):
    ext = filename.lower().split(".")[-1]

    # ===== IMAGE =====
    if ext in ["png", "jpg", "jpeg"]:
        img = Image.open(io.BytesIO(content)).convert("RGB")
        return [img]

    # ===== PDF =====
    if ext == "pdf":
        # 1. Extract and export PDF text layers & coordinates BEFORE converting PDF pages to images
        export_pdf_text_layers(filename, content)

        # 2. Convert PDF pages to image (existing logic preserved 100%)
        images = []
        pdf = fitz.open(stream=content, filetype="pdf")

        for page in pdf:
            pix = page.get_pixmap(dpi=700)  # 700 DPI for high resolution vector & text recognition
            img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            images.append(img)

        return images

    raise ValueError(f"Unsupported file type: {ext}")
