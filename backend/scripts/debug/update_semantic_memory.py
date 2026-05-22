import sys

def modify_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find where `_normalize_cad_ocr_text` is
    start_idx = content.find("def _normalize_cad_ocr_text(")
    end_idx = content.find("def _classify_text_type(")
    
    if start_idx == -1 or end_idx == -1:
        print("Could not find start/end indices for replacement block.")
        return

    new_logic = """def _normalize_cad_ocr_text(text: str) -> tuple:
    from services.ocr_memory import resolve_ocr_text
    
    t = text.upper().strip()
    
    # 1. Check persistent OCR memory first
    trusted_text, text_type, is_trusted = resolve_ocr_text(t)
    if is_trusted and trusted_text:
        return trusted_text, text_type, True
    
    # Exact mapping for known hallucinations
    if t in COMMON_CORRECTIONS:
        return COMMON_CORRECTIONS[t], None, False
        
    # Replace common OCR glyph corruptions safely
    t = t.replace("VV", "W")
    
    return t, None, False

"""
    content = content[:start_idx] + new_logic + content[end_idx:]
    
    # Update _score_semantic_text to use the new return tuple
    old_score_start = "    norm_text = _normalize_cad_ocr_text(text)"
    new_score_start = """    norm_text, memory_type, is_trusted = _normalize_cad_ocr_text(text)
    if is_trusted:
        # High confidence override from persistent memory
        return 100, norm_text, memory_type
"""
    content = content.replace(old_score_start, new_score_start)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print("Integration with ocr_memory.py successful!")

if __name__ == '__main__':
    modify_file('d:/11.5/EzeFloor-main/backend/services/floor_ai_detect.py')
