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

# Create a small dummy base64 image
def get_dummy_base64_image():
    img = Image.new("RGB", (100, 100), color="white")
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{img_str}"

@pytest.fixture
def mock_db(tmp_path, monkeypatch):
    """
    Sets up a temporary SQLite database with a mock job containing page objects.
    """
    db_path = tmp_path / "test_ezefloor.db"
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
        ("test_user", "test@example.com", "hash")
    )
    user_id = cursor.lastrowid
    
    # Mock project data containing pages with doors and text
    img_b64 = get_dummy_base64_image()
    project_data = {
        "pages": [
            {
                "image": img_b64,
                "w": 100,
                "h": 100,
                "texts": [
                    {"text": "820", "bbox": {"x": 10, "y": 10, "w": 15, "h": 8}},
                    {"text": "D01", "bbox": {"x": 50, "y": 50, "w": 12, "h": 8}}
                ],
                "doors": [
                    {
                        "id": "door_001",
                        "class_name": "single_door",
                        "polygon": [{"x": 10, "y": 20}, {"x": 25, "y": 20}, {"x": 25, "y": 25}, {"x": 10, "y": 25}]
                    },
                    {
                        "id": "door_002",
                        "class_name": "single_door",
                        "polygon": [{"x": 40, "y": 40}, {"x": 55, "y": 40}, {"x": 55, "y": 45}, {"x": 40, "y": 45}]
                    }
                ]
            }
        ]
    }
    
    cursor.execute(
        "INSERT INTO jobs (user_id, project_name, data) VALUES (?, ?, ?)",
        (user_id, "Test Project", json.dumps(project_data))
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
    return job_id

def test_ocr_search_engine(mock_db):
    from services.search.ocr_search_engine import OCRSearchEngine
    search_engine = OCRSearchEngine(mock_db)
    
    # Search for "820"
    results = search_engine.search_text("820")
    assert len(results) == 1
    assert results[0]["text"] == "820"
    assert results[0]["page"] == 0
    
    # Search case-insensitively
    results_lower = search_engine.search_text("d01")
    assert len(results_lower) == 1
    assert results_lower[0]["text"] == "D01"

def test_vector_search_engine(mock_db):
    from services.search.vector_search_engine import get_or_create_project_index, VectorSearchEngine
    
    index_data = get_or_create_project_index(mock_db)
    assert index_data is not None
    assert index_data["faiss_index"].ntotal == 2  # 2 doors indexed
    assert len(index_data["metadata"]) == 2
    assert len(index_data["ocr_index"]) == 2
    
    # Test vector search directly
    vector_search = VectorSearchEngine(mock_db)
    # Generate random query embedding of shape (2048,)
    q_emb = np.random.randn(2048)
    q_emb /= np.linalg.norm(q_emb)
    
    matches = vector_search.search_similar(q_emb, threshold=-1.0)
    assert len(matches) > 0
    assert "similarity" in matches[0]

def test_pattern_search_engine(mock_db):
    from services.search.pattern_search_engine import PatternSearchEngine
    search_engine = PatternSearchEngine(mock_db)
    
    # Test search by object_id
    matches = search_engine.search_by_object_id("door_001", threshold=0.5)
    assert len(matches) > 0
    matched_ids = [m["object_id"] for m in matches]
    assert "door_001" in matched_ids
    
    # Test search by custom ROI
    roi_matches = search_engine.search_by_roi(page_id=0, bbox=[10, 20, 25, 25], threshold=0.5)
    assert len(roi_matches) > 0

def test_count_engine():
    from services.search.count_engine import CountEngine
    
    matched_objects = [
        {"object_id": "door_001", "class": "single_door", "page": 0, "bbox": [10, 20, 25, 25], "similarity": 1.0},
        {"object_id": "door_002", "class": "single_door", "page": 0, "bbox": [40, 40, 55, 45], "similarity": 0.95},
        {"object_id": "temp_001", "class": "sliding_door", "page": 0, "bbox": [50, 50, 70, 70], "similarity": 0.92}
    ]
    
    summary = CountEngine.count_results(matched_objects)
    assert summary["total_count"] == 3
    assert summary["groups"]["single_door"] == 2
    assert summary["groups"]["sliding_door"] == 1
    
    # Test report export
    csv_report = CountEngine.export_report(matched_objects, "csv")
    assert "single_door" in csv_report
    assert "sliding_door" in csv_report
