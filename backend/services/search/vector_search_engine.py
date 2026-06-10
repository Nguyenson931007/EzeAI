import numpy as np
import faiss
from typing import List, Dict, Any, Tuple, Optional

# Redirect to persistent database-backed search index manager
from services.search.search_index_manager import (
    get_or_create_project_index, 
    clear_project_index_cache,
    INDEX_CACHE
)

class VectorSearchEngine:
    def __init__(self, project_id: int):
        self.project_id = project_id
        # Trigger database load or generation of index
        self.index_data = get_or_create_project_index(project_id)
        
    def add_embedding(self, embedding: np.ndarray, metadata: Dict[str, Any]):
        """
        Adds a single embedding to the project index (in-memory).
        """
        if self.index_data:
            faiss_index = self.index_data["faiss_index"]
            faiss_index.add(np.expand_dims(embedding, axis=0).astype('float32'))
            self.index_data["metadata"].append(metadata)
            
    def search_similar(self, query_embedding: np.ndarray, threshold: float = 0.90, top_k: int = 100,
                       query_class: Optional[str] = None, query_bbox: Optional[List[int]] = None) -> List[Dict[str, Any]]:
        """
        Searches the index for similar objects and ranks them using a composite formula (Requirement 5):
        score = 0.7 * visual_similarity + 0.2 * class_match + 0.1 * size_similarity
        """
        if not self.index_data or self.index_data["faiss_index"].ntotal == 0:
            return []
            
        faiss_index = self.index_data["faiss_index"]
        metadata = self.index_data["metadata"]
        
        # Query shape: [1, 2048]
        q_emb = np.expand_dims(query_embedding, axis=0).astype('float32')
        
        distances, indices = faiss_index.search(q_emb, min(top_k, faiss_index.ntotal))
        
        results = []
        for i in range(len(indices[0])):
            idx = indices[0][i]
            dist = float(distances[0][i])  # Cosine similarity (L2 normalized)
            
            if idx != -1:
                meta = metadata[idx].copy()
                
                # Visual similarity score
                visual_similarity = dist
                
                # Class match score (20%)
                class_match = 0.0
                cand_class = meta.get("class", "").lower()
                if query_class:
                    q_class_lower = query_class.lower()
                    if q_class_lower in cand_class or cand_class in q_class_lower:
                        class_match = 1.0
                        
                # Size similarity score (10%)
                size_similarity = 0.0
                if query_bbox and meta.get("bbox"):
                    wq = query_bbox[2] - query_bbox[0]
                    hq = query_bbox[3] - query_bbox[1]
                    wc = meta["bbox"][2] - meta["bbox"][0]
                    hc = meta["bbox"][3] - meta["bbox"][1]
                    
                    w_sim = min(wq, wc) / max(wq, wc) if max(wq, wc) > 0 else 0.0
                    h_sim = min(hq, hc) / max(hq, hc) if max(hq, hc) > 0 else 0.0
                    size_similarity = 0.5 * w_sim + 0.5 * h_sim
                    
                # Compute composite score
                if query_class is not None or query_bbox is not None:
                    final_score = 0.7 * visual_similarity + 0.2 * class_match + 0.1 * size_similarity
                else:
                    final_score = visual_similarity
                    
                if final_score >= threshold:
                    meta["similarity"] = final_score
                    meta["visual_similarity"] = visual_similarity
                    meta["class_match"] = class_match
                    meta["size_similarity"] = size_similarity
                    results.append(meta)
                    
        # Sort by composite score descending
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results
