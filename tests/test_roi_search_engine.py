import sys
import os
import json
import base64
import sqlite3
import numpy as np
import pytest
from pathlib import Path
from PIL import Image
import io

TEST_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = TEST_DIR.parent
BACKEND_DIR = WORKSPACE_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from services.search.roi_search_engine import ROISearchEngine
from services.search.ocr_search_engine import OCRSearchEngine, fuzzy_match

# Create a small dummy base64 image
def get_dummy_base64_image():
    img = Image.new("RGB", (100, 100), color="white")
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{img_str}"

@pytest.fixture
def mock_db(tmp_path, monkeypatch):
    db_path = tmp_path / "test_ezefloor_roi.db"
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    # Create tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            is_active INTEGER NOT NULL DEFAULT 1,
            is_online INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active'
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            project_name TEXT NOT NULL,
            room_count INTEGER DEFAULT 0,
            total_area REAL DEFAULT 0,
            data TEXT NOT NULL,
            thumbnail TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_trained INTEGER DEFAULT 0,
            share_token TEXT UNIQUE,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Insert mock user and job
    cursor.execute(
        "INSERT INTO users (username, email, hashed_password) VALUES (?, ?, ?)",
        ("test_user_roi", "test_roi@example.com", "hash")
    )
    user_id = cursor.lastrowid
    
    img_b64 = get_dummy_base64_image()
    project_data = {
        "roomsByPage": {
            "0": [
                {
                    "id": "room_001",
                    "room_name": "Master Bedroom",
                    "type": "bedroom",
                    "polygon": [{"x": 10, "y": 10}, {"x": 90, "y": 10}, {"x": 90, "y": 90}, {"x": 10, "y": 90}]
                }
            ]
        },
        "pages": [
            {
                "image": img_b64,
                "w": 100,
                "h": 100,
                "texts": [
                    {"text": "87O", "bbox": {"x": 12, "y": 12, "w": 10, "h": 5}},
                    {"text": "wc", "bbox": {"x": 40, "y": 40, "w": 10, "h": 5}}
                ],
                "doors": [
                    {
                        "id": "door_001",
                        "class_name": "single_door",
                        "width_mm": 870,
                        "polygon": [{"x": 15, "y": 15}, {"x": 30, "y": 15}, {"x": 30, "y": 20}, {"x": 15, "y": 20}]
                    }
                ]
            }
        ]
    }
    
    cursor.execute(
        "INSERT INTO jobs (user_id, project_name, data) VALUES (?, ?, ?)",
        (user_id, "Test Project ROI", json.dumps(project_data))
    )
    job_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    from app.database import DBConnection
    def get_test_conn():
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        return DBConnection(c, "sqlite")
        
    monkeypatch.setattr("app.database.get_db_connection", get_test_conn)
    import services.search.ocr_search_engine
    import services.search.roi_search_engine
    import services.search.search_index_manager
    import services.search.pattern_search_engine
    monkeypatch.setattr(services.search.ocr_search_engine, "get_db_connection", get_test_conn)
    monkeypatch.setattr(services.search.roi_search_engine, "get_db_connection", get_test_conn)
    monkeypatch.setattr(services.search.search_index_manager, "get_db_connection", get_test_conn)
    monkeypatch.setattr(services.search.pattern_search_engine, "get_db_connection", get_test_conn)
    return job_id

def test_fuzzy_match():
    # Exact match
    assert fuzzy_match("870", "870") == 1.0
    
    # Substring match
    assert fuzzy_match("870", "width 870") == 1.0
    
    # Digit confusion matching ('O' -> '0')
    assert fuzzy_match("870", "87O") >= 0.90
    assert fuzzy_match("870", "87D") >= 0.90
    assert fuzzy_match("820", "82o") >= 0.90

def test_roi_routing_text(mock_db, monkeypatch):
    roi_search = ROISearchEngine(mock_db)
    
    # Mock OCR returning a match
    def mock_run_ocr(image):
        return [{"text": "87O", "conf": 0.95, "bbox": {"x": 12, "y": 12, "w": 10, "h": 5}}]
    monkeypatch.setattr("services.search.roi_search_engine.run_ocr", mock_run_ocr)
    
    results = roi_search.search_by_roi(page_id=0, bbox=[10, 10, 30, 30], threshold=0.5)
    assert len(results) > 0
    # Must fuzzy match and find the indexed OCR item "87O"
    text_matches = [r for r in results if r.get("class") == "text"]
    assert len(text_matches) > 0
    assert text_matches[0]["text"] == "87O"

def test_roi_bounds_check(mock_db):
    roi_search = ROISearchEngine(mock_db)
    
    # Empty bbox
    assert roi_search.search_by_roi(page_id=0, bbox=[10, 10, 10, 10]) == []
    # Invalid bbox coordinates
    assert roi_search.search_by_roi(page_id=0, bbox=[20, 20, 10, 10]) == []
    # Malformed bbox length
    assert roi_search.search_by_roi(page_id=0, bbox=[10, 10]) == []

def test_semantic_dimensions(mock_db):
    # Test lookups for numeric dimensions which should find matching widths
    ocr_search = OCRSearchEngine(mock_db)
    
    # Search for "870" should return door_001 since its width is 870
    results = ocr_search.search_text("870")
    assert len(results) > 0
    door_matches = [r for r in results if r.get("object_id") == "door_001"]
    assert len(door_matches) > 0
    assert door_matches[0]["class"] == "single_door"

def test_semantic_room_labels(mock_db):
    # Search for room name "bedroom"
    ocr_search = OCRSearchEngine(mock_db)
    results = ocr_search.search_text("bedroom")
    assert len(results) > 0
    room_matches = [r for r in results if r.get("object_id") == "room_001"]
    assert len(room_matches) > 0
    assert room_matches[0]["class"] == "room"
