# backend/services/pdf_export_service.py
"""
PDF Native Text & Coordinates Export Service.
Isolated module for extracting native PDF text layers and coordinates using PyMuPDF (fitz)
without any OCR or AI dependencies.
Integrates PdfTextReconstructor for direction-aware glyph reconstruction.
Includes OCR fallback for scanned/vector-path PDFs and watermark tagging.
"""

import csv
import io
import fitz  # pymupdf
from fastapi import HTTPException
from services.pdf_text_reconstructor import reconstruct_pdf_text

WATERMARK_KEYWORDS = [
    "pdf", "xchang", "chang", "edit", "track", "rack", "soft", "ware",
    "eval", "auto", "watermark", "demo", "click", "buy", "now", "www",
    "created with", "tracker", "educational"
]


def is_watermark_text(text: str) -> bool:
    """Checks if a string matches common PDF editor watermark keywords."""
    txt_lower = str(text or "").lower().strip()
    if not txt_lower:
        return False
    return any(kw in txt_lower for kw in WATERMARK_KEYWORDS)


def extract_pdf_native_text_layers(filename: str, pdf_bytes: bytes) -> dict:
    """
    Extracts native vector text layer and exact PDF coordinates using PyMuPDF (fitz).
    Runs PdfTextReconstructor for direction-aware character/glyph grouping.
    Preserves exact PDF native float coordinates, rotation, font, and 2-layer output (rawTexts + texts).
    Triggers EasyOCR fallback when vector layer is watermark-only or scanned drawings.
    """
    if not (filename.lower().endswith(".pdf") or pdf_bytes.startswith(b"%PDF")):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only PDF files are supported for native text extraction."
        )

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as err:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to open PDF document: {str(err)}"
        )

    page_count = len(doc)
    pages_data = []
    total_raw_text_objects = 0
    total_reconstructed_text_objects = 0

    # Extract document metadata
    raw_meta = doc.metadata or {}
    pdf_metadata = {
        "title": str(raw_meta.get("title", "") or ""),
        "author": str(raw_meta.get("author", "") or ""),
        "creator": str(raw_meta.get("creator", "") or ""),
        "producer": str(raw_meta.get("producer", "") or "")
    }

    for page_idx, page in enumerate(doc, start=1):
        page_rect = page.rect
        page_w = float(page_rect.width)
        page_h = float(page_rect.height)
        page_rotation = int(page.rotation)

        # 1. Extract raw words/spans using page.get_text("words")
        words = page.get_text("words") or []

        # 2. Enrich with font, size, & direction metadata using page.get_text("dict")
        span_font_map = {}
        try:
            page_dict = page.get_text("dict") or {}
            for block in page_dict.get("blocks", []):
                if block.get("type") == 0:  # Text block
                    for line in block.get("lines", []):
                        line_dir = list(line.get("dir", (1.0, 0.0)))
                        for span in line.get("spans", []):
                            txt = str(span.get("text", "")).strip()
                            if txt:
                                s_bbox = span.get("bbox", [0, 0, 0, 0])
                                cx = round((s_bbox[0] + s_bbox[2]) / 2.0, 1)
                                cy = round((s_bbox[1] + s_bbox[3]) / 2.0, 1)
                                span_font_map[(cx, cy)] = {
                                    "font": str(span.get("font", "Unknown")),
                                    "size": float(span.get("size", 0.0)),
                                    "direction": line_dir,
                                    "flags": int(span.get("flags", 0))
                                }
        except Exception:
            pass

        raw_page_texts = []
        for w in words:
            if len(w) < 8:
                continue
            x0 = float(w[0])
            y0 = float(w[1])
            x1 = float(w[2])
            y1 = float(w[3])
            text_str = str(w[4])
            block_no = int(w[5])
            line_no = int(w[6])
            word_no = int(w[7])

            width = float(x1 - x0)
            height = float(y1 - y0)

            cx = round((x0 + x1) / 2.0, 1)
            cy = round((y0 + y1) / 2.0, 1)
            meta = span_font_map.get((cx, cy), {})
            is_wm = is_watermark_text(text_str)

            raw_page_texts.append({
                "text": text_str,
                "bbox": {
                    "x0": x0,
                    "y0": y0,
                    "x1": x1,
                    "y1": y1,
                    "width": width,
                    "height": height
                },
                "block": block_no,
                "line": line_no,
                "word": word_no,
                "rotation": page_rotation,
                "font": meta.get("font", "Unknown"),
                "size": meta.get("size", 0.0),
                "direction": meta.get("direction", [1.0, 0.0]),
                "isWatermark": is_wm
            })

        # 3. Run direction-aware text reconstruction engine
        reconstructed_texts = reconstruct_pdf_text(raw_page_texts)

        for t in reconstructed_texts:
            if is_watermark_text(t.get("text", "")):
                t["isWatermark"] = True
            else:
                t["isWatermark"] = False

        non_watermark_vector_texts = [t for t in reconstructed_texts if not t.get("isWatermark", False)]

        # 4. OCR Fallback for Vector-Path / Scanned / Watermark-Only PDFs
        # If non-watermark vector text count is small (< 10), run EasyOCR on rendered PDF page image
        if len(non_watermark_vector_texts) < 10:
            print(f"[PDF_TEXT] Page {page_idx} non-watermark vector text count ({len(non_watermark_vector_texts)}) < 10. Running EasyOCR fallback on floor plan image...")
            try:
                from PIL import Image
                import numpy as np
                from services.ocr import _init_easyocr

                reader = _init_easyocr()
                if reader is not None:
                    pix = page.get_pixmap(dpi=150)
                    img_ocr = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
                    img_np = np.array(img_ocr)

                    ocr_raw_results = reader.readtext(img_np, detail=1)

                    scale_x = page_w / float(pix.width) if pix.width > 0 else 1.0
                    scale_y = page_h / float(pix.height) if pix.height > 0 else 1.0

                    ocr_added_count = 0
                    for (bbox_pts, text_str, conf) in ocr_raw_results:
                        txt = str(text_str).strip()
                        if not txt or float(conf) < 0.15:
                            continue

                        xs = [pt[0] for pt in bbox_pts]
                        ys = [pt[1] for pt in bbox_pts]
                        bx0 = float(min(xs)) * scale_x
                        by0 = float(min(ys)) * scale_y
                        bx1 = float(max(xs)) * scale_x
                        by1 = float(max(max_y for max_y in ys)) * scale_y
                        bw = bx1 - bx0
                        bh = by1 - by0

                        is_wm = is_watermark_text(txt)

                        reconstructed_texts.append({
                            "text": txt,
                            "bbox": {
                                "x0": round(bx0, 2),
                                "y0": round(by0, 2),
                                "x1": round(bx1, 2),
                                "y1": round(by1, 2),
                                "width": round(bw, 2),
                                "height": round(bh, 2)
                            },
                            "source": "ocr_floor_plan",
                            "confidence": round(float(conf), 2),
                            "rotation": page_rotation,
                            "font": "OCR_Detected",
                            "size": round(bh, 1),
                            "direction": [1.0, 0.0],
                            "block": 0,
                            "line": 0,
                            "isWatermark": is_wm
                        })
                        if not is_wm:
                            ocr_added_count += 1

                    print(f"[PDF_TEXT] EasyOCR extracted {ocr_added_count} floor plan text objects for page {page_idx}")
            except Exception as ocr_err:
                print(f"[PDF_TEXT] EasyOCR fallback warning for page {page_idx}: {ocr_err}")

        total_raw_text_objects += len(raw_page_texts)
        total_reconstructed_text_objects += len(reconstructed_texts)

        print(f"[PDF_TEXT] Page {page_idx} | Raw text objects: {len(raw_page_texts)} | Reconstructed text objects: {len(reconstructed_texts)}")

        # Log sample reconstruction for debugging
        sample_reconstructed = [t for t in reconstructed_texts if not t.get("isWatermark", False)]
        if sample_reconstructed:
            sample = sample_reconstructed[0]
            print(f'[PDF_TEXT] Sample floor plan text: "{sample["text"]}" at bbox {sample["bbox"]}')

        pages_data.append({
            "page": page_idx,
            "width": page_w,
            "height": page_h,
            "rotation": page_rotation,
            "rawTextCount": len(raw_page_texts),
            "textCount": len(reconstructed_texts),
            "rawTexts": raw_page_texts,
            "texts": reconstructed_texts
        })

    doc.close()

    success_msg = (
        "Extracted and reconstructed text layer successfully"
        if total_reconstructed_text_objects > 0
        else "No text layer found in this PDF."
    )

    print(f"[PDF_NATIVE_TEXT] File: {filename} | Pages: {page_count} | Raw: {total_raw_text_objects} -> Reconstructed: {total_reconstructed_text_objects}")

    result_payload = {
        "success": True,
        "source": "pymupdf_with_ocr_fallback",
        "fileName": filename,
        "pageCount": page_count,
        "totalTextObjects": total_reconstructed_text_objects,
        "totalRawTextObjects": total_raw_text_objects,
        "message": success_msg,
        "coordinateSystem": {
            "type": "pdf",
            "origin": "top-left",
            "unit": "point"
        },
        "metadata": pdf_metadata,
        "pages": pages_data
    }

    return result_payload


def generate_pdf_native_text_csv(json_payload: dict) -> str:
    """Generates CSV format string from extracted & reconstructed PDF native text JSON payload."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["page", "text", "x0", "y0", "x1", "y1", "width", "height", "block", "line", "font", "size", "source", "isWatermark"])

    for page in json_payload.get("pages", []):
        page_num = page.get("page", 1)
        for t in page.get("texts", []):
            bbox = t.get("bbox", {})
            writer.writerow([
                page_num,
                t.get("text", ""),
                bbox.get("x0", 0.0),
                bbox.get("y0", 0.0),
                bbox.get("x1", 0.0),
                bbox.get("y1", 0.0),
                bbox.get("width", 0.0),
                bbox.get("height", 0.0),
                t.get("block", 0),
                t.get("line", 0),
                t.get("font", ""),
                t.get("size", 0.0),
                t.get("source", "pymupdf_reconstructed"),
                t.get("isWatermark", False)
            ])

    return output.getvalue()
