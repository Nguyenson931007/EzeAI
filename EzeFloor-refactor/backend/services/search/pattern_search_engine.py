from typing import List, Dict, Any, Optional
import numpy as np
from PIL import Image
import base64
import io
import json
from services.search.object_embedding_engine import get_embedding_generator
from services.search.vector_search_engine import VectorSearchEngine, get_or_create_project_index
from app.database import get_db_connection

class PatternSearchEngine:
    def __init__(self, project_id: int):
        self.project_id = project_id
        self.vector_engine = VectorSearchEngine(project_id)
        
    def predict_roi_class(self, query_embedding: np.ndarray, index_data: dict) -> str:
        """
        Predicts the class name of a cropped visual region (ROI) by finding its
        nearest neighbor objects in the vector database index (Requirement 3).
        """
        if not index_data or "faiss_index" not in index_data or index_data["faiss_index"].ntotal == 0:
            return "symbol"
            
        faiss_index = index_data["faiss_index"]
        metadata = index_data["metadata"]
        
        q_emb = np.expand_dims(query_embedding, axis=0).astype('float32')
        # Fetch top 5 matches
        distances, indices = faiss_index.search(q_emb, min(5, faiss_index.ntotal))
        
        class_votes = {}
        for i in range(len(indices[0])):
            idx = indices[0][i]
            if idx != -1:
                meta = metadata[idx]
                cls = meta.get("class", "symbol")
                dist = float(distances[0][i])
                class_votes[cls] = class_votes.get(cls, 0.0) + dist
                
        if class_votes:
            return max(class_votes, key=class_votes.get)
        return "symbol"

    def search_by_roi(self, page_id: int, bbox: List[int], threshold: float = 0.90, scope: str = "project") -> List[Dict[str, Any]]:
        """
        Generates embedding for a specific cropped ROI on a page, predicts its class, 
        and finds visually similar patterns using composite ranking.
        """
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM jobs WHERE id = ?", (self.project_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return []
            
        job_data = json.loads(row["data"])
        pages = job_data.get("pages", [])
        if page_id < 0 or page_id >= len(pages):
            return []
            
        page = pages[page_id]
        image_base64 = page.get("image")
        if not image_base64:
            return []
            
        try:
            if "," in image_base64:
                header, encoded = image_base64.split(",", 1)
            else:
                encoded = image_base64
            img_bytes = base64.b64decode(encoded)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        except Exception as e:
            print(f"Error decoding image in search_by_roi: {e}")
            return []
            
        x1, y1, x2, y2 = bbox
        crop = img.crop((x1, y1, x2, y2))
        
        emb_gen = get_embedding_generator()
        query_embedding = emb_gen.generate_embedding(crop)
        
        # 1. Zero-shot nearest class prediction
        index_data = get_or_create_project_index(self.project_id)
        predicted_class = self.predict_roi_class(query_embedding, index_data)
        
        # 2. Vector search using composite ranking (Requirement 5)
        matches = self.vector_engine.search_similar(
            query_embedding, 
            threshold=threshold,
            query_class=predicted_class,
            query_bbox=bbox
        )
        
        # Inject predicted class into matches for frontend display (Requirement 6)
        for m in matches:
            m["predicted_class"] = predicted_class
            
        # Apply scope filtering
        if scope == "page":
            matches = [m for m in matches if m["page"] == page_id]
            
        return matches

    def search_by_object_id(self, object_id: str, threshold: float = 0.90, scope: str = "project") -> List[Dict[str, Any]]:
        """
        Finds the object_id in the index, gets its embedding, and searches for similar objects using composite ranking.
        """
        index_data = get_or_create_project_index(self.project_id)
        if not index_data:
            return []
            
        metadata = index_data["metadata"]
        faiss_index = index_data["faiss_index"]
        
        # Find index of the object_id
        target_idx = -1
        for i, meta in enumerate(metadata):
            if meta["object_id"] == object_id:
                target_idx = i
                break
                
        if target_idx == -1:
            return []
            
        target_meta = metadata[target_idx]
        query_class = target_meta.get("class")
        query_bbox = target_meta.get("bbox")
        
        # Extract query embedding
        try:
            query_embedding = faiss_index.reconstruct(target_idx)
        except Exception:
            # Fallback
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM jobs WHERE id = ?", (self.project_id,))
            row = cursor.fetchone()
            conn.close()
            if not row:
                return []
            job_data = json.loads(row["data"])
            pages = job_data.get("pages", [])
            page_id = target_meta["page"]
            if page_id >= len(pages):
                return []
            page = pages[page_id]
            image_base64 = page.get("image")
            if "," in image_base64:
                header, encoded = image_base64.split(",", 1)
            else:
                encoded = image_base64
            img_bytes = base64.b64decode(encoded)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            x1, y1, x2, y2 = query_bbox
            crop = img.crop((x1, y1, x2, y2))
            emb_gen = get_embedding_generator()
            query_embedding = emb_gen.generate_embedding(crop)
        
        # Search similar objects using composite ranking
        matches = self.vector_engine.search_similar(
            query_embedding, 
            threshold=threshold,
            query_class=query_class,
            query_bbox=query_bbox
        )
        
        # Apply scope filtering
        if scope == "page" and target_idx < len(metadata):
            target_page = metadata[target_idx]["page"]
            matches = [m for m in matches if m["page"] == target_page]
            
        return matches
