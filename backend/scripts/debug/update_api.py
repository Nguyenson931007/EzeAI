import sys
import os

def update_schemas():
    path = 'd:/11.5/EzeFloor-main/backend/schemas.py'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if "OCRCorrectionRequest" not in content:
        new_schema = """
class OCRCorrectionRequest(BaseModel):
    room_id: str
    original_text: str
    corrected_text: str
    text_type: str = "ROOM_NAME"
    apply_to_all: bool = False
    context: Optional[dict] = None
    source_confidence: Optional[float] = None
"""
        with open(path, 'a', encoding='utf-8') as f:
            f.write(new_schema)
        print("Updated schemas.py")

def update_routes():
    path = 'd:/11.5/EzeFloor-main/backend/api/routes.py'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if '@router.post("/api/ocr-corrections")' not in content:
        import_stmt = "from schemas import LabelRequest, RoomNameModel"
        new_import = "from schemas import LabelRequest, RoomNameModel, OCRCorrectionRequest"
        content = content.replace(import_stmt, new_import)
        
        # Add after save-label
        insert_marker = '@router.post("/save-label")'
        idx = content.find(insert_marker)
        
        new_endpoint = """
@router.post("/api/ocr-corrections")
def save_ocr_correction(req: OCRCorrectionRequest, username: str = Depends(validate_session)):
    from services.ocr_memory import add_correction
    try:
        add_correction(
            original_text=req.original_text,
            corrected_text=req.corrected_text,
            text_type=req.text_type,
            apply_to_all=req.apply_to_all,
            context=req.context,
            source="human_verified"
        )
        return {"status": "success", "message": "Correction saved."}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))

"""
        content = content[:idx] + new_endpoint + content[idx:]
        
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Updated routes.py")

if __name__ == '__main__':
    update_schemas()
    update_routes()
