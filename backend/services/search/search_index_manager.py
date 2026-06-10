import numpy as np
import faiss
import json
import sqlite3
import base64
import io
import logging
from PIL import Image
from typing import List, Dict, Any, Optional

from app.database import get_db_connection, DB_TYPE

logger = logging.getLogger("ezefloor.search_index_manager")

INDEX_CACHE = {}

def init_search_tables():
    """
    Initializes the embedding storage and search history tables for SQLite/MySQL.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if DB_TYPE == "mysql":
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS project_embeddings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    project_id INT NOT NULL,
                    object_id VARCHAR(255) NOT NULL,
                    class_name VARCHAR(255) NOT NULL,
                    embedding LONGBLOB NOT NULL,
                    bbox VARCHAR(255) NOT NULL,
                    page_index INT NOT NULL,
                    width_mm INT,
                    door_type VARCHAR(100),
                    room_type VARCHAR(100),
                    UNIQUE KEY uq_project_object (project_id, object_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS search_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    project_id INT NOT NULL,
                    query TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    result_count INT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ''')
        else:
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS project_embeddings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    object_id TEXT NOT NULL,
                    class_name TEXT NOT NULL,
                    embedding BLOB NOT NULL,
                    bbox TEXT NOT NULL,
                    page_index INTEGER NOT NULL,
                    width_mm INTEGER,
                    door_type TEXT,
                    room_type TEXT,
                    UNIQUE(project_id, object_id)
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS search_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id INTEGER NOT NULL,
                    query TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    result_count INTEGER DEFAULT 0
                )
            ''')
        conn.commit()
        conn.close()
        logger.info("Search index database tables initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing search index tables: {e}")

def clear_project_index_cache(project_id: int):
    """
    Clears the cached memory index and purges stored database records
    to force a clean rebuild on next search (e.g. when drawing is modified).
    """
    global INDEX_CACHE
    if project_id in INDEX_CACHE:
        del INDEX_CACHE[project_id]
        
    try:
        init_search_tables()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM project_embeddings WHERE project_id = ?", (project_id,))
        conn.commit()
        conn.close()
        logger.info(f"Purged persistent embeddings for project_id: {project_id}")
    except Exception as e:
        logger.error(f"Error purging embeddings for project_id {project_id}: {e}")

def log_search_history(project_id: int, query: str, result_count: int):
    """
    Logs search queries in the database for suggestions and recent history.
    """
    try:
        init_search_tables()
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO search_history (project_id, query, result_count) VALUES (?, ?, ?)",
            (project_id, query, result_count)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Error logging search history: {e}")

def get_or_create_project_index(project_id: int) -> Optional[dict]:
    """
    Retrieves or lazily builds/loads the FAISS index and metadata for a project.
    Loads from SQLite database if available, otherwise generates embeddings from base64 page images.
    """
    global INDEX_CACHE
    if project_id in INDEX_CACHE:
        return INDEX_CACHE[project_id]
        
    init_search_tables()
    
    # 1. Load job data
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT data FROM jobs WHERE id = ?", (project_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return None
        
    job_data = json.loads(row["data"])
    pages = job_data.get("pages", [])
    
    # 2. Check if persistent embeddings already exist in the database
    cursor.execute(
        "SELECT object_id, class_name, embedding, bbox, page_index, width_mm, door_type, room_type FROM project_embeddings WHERE project_id = ?",
        (project_id,)
    )
    db_rows = cursor.fetchall()
    
    faiss_index = faiss.IndexFlatIP(2048)
    metadata = []
    ocr_index = []
    
    # Extract OCR index (always loaded dynamically from job data to keep it updated)
    for page_idx, page in enumerate(pages):
        page_texts = page.get("texts") or page.get("annotations") or page.get("all_texts") or []
        for t in page_texts:
            bbox_dict = t.get("bbox", {})
            if isinstance(bbox_dict, dict):
                x = bbox_dict.get("x", 0)
                y = bbox_dict.get("y", 0)
                w = bbox_dict.get("w", 0)
                h = bbox_dict.get("h", 0)
                bbox = [x, y, x + w, y + h]
            elif isinstance(bbox_dict, list):
                bbox = bbox_dict
            else:
                bbox = [0, 0, 0, 0]
                
            ocr_index.append({
                "text": t.get("text", ""),
                "bbox": bbox,
                "page": page_idx
            })
            
    if db_rows:
        logger.info(f"Loading {len(db_rows)} embeddings from SQLite/MySQL for project_id: {project_id}")
        for r in db_rows:
            emb_bytes = r["embedding"]
            emb = np.frombuffer(emb_bytes, dtype=np.float32)
            faiss_index.add(np.expand_dims(emb, axis=0).astype('float32'))
            
            bbox_list = json.loads(r["bbox"])
            metadata.append({
                "object_id": r["object_id"],
                "class": r["class_name"],
                "bbox": bbox_list,
                "page": r["page_index"],
                "project_id": project_id,
                "width_mm": r["width_mm"],
                "door_type": r["door_type"],
                "room_type": r["room_type"]
            })
            
        INDEX_CACHE[project_id] = {
            "faiss_index": faiss_index,
            "metadata": metadata,
            "ocr_index": ocr_index
        }
        conn.close()
        return INDEX_CACHE[project_id]
        
    # 3. If no DB records, generate embeddings (lazy first-run index)
    logger.info(f"No persistent embeddings found. Generating new embeddings for project_id: {project_id}")
    from services.search.object_embedding_engine import get_embedding_generator
    emb_generator = get_embedding_generator()
    
    insert_records = []
    
    for page_idx, page in enumerate(pages):
        image_base64 = page.get("image")
        if not image_base64:
            continue
            
        try:
            if "," in image_base64:
                header, encoded = image_base64.split(",", 1)
            else:
                encoded = image_base64
            img_bytes = base64.b64decode(encoded)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        except Exception as e:
            logger.error(f"Error decoding image for page {page_idx}: {e}")
            continue
            
        objects_to_index = []
        
        # Parse doors
        for door in page.get("doors", []):
            objects_to_index.append({
                "id": door.get("id"),
                "class": door.get("class_name") or door.get("label") or "door",
                "polygon": door.get("polygon"),
                "width_mm": door.get("width_mm"),
                "door_type": door.get("type"),
                "room_type": None
            })
            
        # Parse windows
        for win in page.get("windows", []):
            objects_to_index.append({
                "id": win.get("id"),
                "class": win.get("class_name") or win.get("label") or "window",
                "polygon": win.get("polygon"),
                "width_mm": win.get("width_mm"),
                "door_type": None,
                "room_type": None
            })
            
        # Parse templates / symbols
        for temp in page.get("templates", []):
            objects_to_index.append({
                "id": temp.get("id"),
                "class": temp.get("class_name") or temp.get("label") or "symbol",
                "polygon": temp.get("polygon"),
                "width_mm": None,
                "door_type": None,
                "room_type": None
            })
            
        # Parse rooms
        for room in page.get("rooms", []):
            objects_to_index.append({
                "id": room.get("id"),
                "class": "room",
                "polygon": room.get("polygon"),
                "width_mm": None,
                "door_type": None,
                "room_type": room.get("room_type") or room.get("type")
            })
            
        for obj in objects_to_index:
            poly = obj.get("polygon", [])
            if not poly or len(poly) < 3:
                continue
                
            try:
                xs = [p.get("x") for p in poly if isinstance(p, dict)]
                ys = [p.get("y") for p in poly if isinstance(p, dict)]
                if not xs or not ys:
                    xs = [p[0] for p in poly if isinstance(p, (list, tuple))]
                    ys = [p[1] for p in poly if isinstance(p, (list, tuple))]
                if not xs or not ys:
                    continue
                x1, y1, x2, y2 = int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))
            except Exception:
                continue
                
            if x2 <= x1 or y2 <= y1:
                continue
                
            pad = 2
            w_img, h_img = img.size
            cx1 = max(0, x1 - pad)
            cy1 = max(0, y1 - pad)
            cx2 = min(w_img, x2 + pad)
            cy2 = min(h_img, y2 + pad)
            
            crop = img.crop((cx1, cy1, cx2, cy2))
            
            try:
                embedding = emb_generator.generate_embedding(crop)
                faiss_index.add(np.expand_dims(embedding, axis=0).astype('float32'))
                
                bbox_list = [x1, y1, x2, y2]
                
                meta_item = {
                    "object_id": obj["id"],
                    "class": obj["class"],
                    "bbox": bbox_list,
                    "page": page_idx,
                    "project_id": project_id,
                    "width_mm": obj["width_mm"],
                    "door_type": obj["door_type"],
                    "room_type": obj["room_type"]
                }
                metadata.append(meta_item)
                
                # Buffer for DB insert
                insert_records.append((
                    project_id,
                    obj["id"],
                    obj["class"],
                    embedding.tobytes(),
                    json.dumps(bbox_list),
                    page_idx,
                    obj["width_mm"],
                    obj["door_type"],
                    obj["room_type"]
                ))
            except Exception as e:
                logger.error(f"Error indexing object {obj['id']}: {e}")
                
    # 4. Insert records in batch to SQLite/MySQL
    if insert_records:
        try:
            cursor.executemany(
                """
                REPLACE INTO project_embeddings 
                (project_id, object_id, class_name, embedding, bbox, page_index, width_mm, door_type, room_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                insert_records
            )
            conn.commit()
            logger.info(f"Persisted {len(insert_records)} object embeddings in the database.")
        except Exception as e:
            logger.error(f"Error inserting embeddings into DB: {e}")
            
    conn.close()
    
    INDEX_CACHE[project_id] = {
        "faiss_index": faiss_index,
        "metadata": metadata,
        "ocr_index": ocr_index
    }
    return INDEX_CACHE[project_id]
