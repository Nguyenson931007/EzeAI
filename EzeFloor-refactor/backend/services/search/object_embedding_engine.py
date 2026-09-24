import torch
import torchvision.models as models
import torchvision.transforms as transforms
import numpy as np
from PIL import Image

class ObjectEmbeddingEngine:
    def __init__(self):
        # Set device
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Load pre-trained ResNet50 from local cache or download (local cache is resnet50-0676ba61.pth)
        try:
            from torchvision.models import ResNet50_Weights
            self.model = models.resnet50(weights=ResNet50_Weights.DEFAULT)
        except Exception:
            self.model = models.resnet50(pretrained=True)
            
        # Extract features (remove the final classification fc layer)
        self.feature_extractor = torch.nn.Sequential(*list(self.model.children())[:-1])
        self.feature_extractor.to(self.device)
        self.feature_extractor.eval()
        
        # Preprocessing transforms for ResNet50
        self.preprocess = transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
        
    def generate_embedding(self, pil_crop: Image.Image) -> np.ndarray:
        """
        Generates a 2048-dimensional L2-normalized feature embedding for the PIL image crop.
        """
        # Ensure RGB
        if pil_crop.mode != "RGB":
            pil_crop = pil_crop.convert("RGB")
            
        tensor = self.preprocess(pil_crop).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            features = self.feature_extractor(tensor)
            # Squeeze to shape [2048]
            features = torch.squeeze(features).cpu().numpy()
            
        # L2 normalization for cosine similarity
        norm = np.linalg.norm(features)
        if norm > 0:
            features = features / norm
            
        return features

# Singleton instance accessor
_embedding_engine = None

def get_embedding_generator() -> ObjectEmbeddingEngine:
    global _embedding_engine
    if _embedding_engine is None:
        _embedding_engine = ObjectEmbeddingEngine()
    return _embedding_engine
