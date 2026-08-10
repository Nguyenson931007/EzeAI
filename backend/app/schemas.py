from typing import List, Optional
import random

from pydantic import BaseModel, field_validator
from utils.class_names import normalize_room_name


class Point(BaseModel):
    x: float
    y: float


class RoomNameModel(BaseModel):
    room_name: str

    @field_validator("room_name", mode="before")
    @classmethod
    def _normalize_room_name_val(cls, v):
        if v is None:
            raise ValueError("room_name is required")
        return normalize_room_name(v)


class Room(RoomNameModel):
    id: int
    class_id: Optional[int] = None
    room_class: Optional[str] = None
    polygon: List[Point]

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v):
        """Accept float/string IDs from frontend (Date.now() etc.) → int."""
        try:
            return int(float(str(v)))
        except (ValueError, TypeError):
            return random.randint(1, 2**31)

    @field_validator("polygon", mode="before")
    @classmethod
    def _normalize_polygon(cls, v):
        if v is None:
            return []
        if not isinstance(v, list):
            raise ValueError("polygon must be a list")
        out = []
        for p in v:
            if isinstance(p, dict):
                out.append(p)
                continue
            if isinstance(p, (list, tuple)) and len(p) >= 2:
                out.append({"x": float(p[0]), "y": float(p[1])})
                continue
            out.append(p)
        return out


class Wall(BaseModel):
    id: int
    wall_type: str
    points: List[Point]
    isClosed: bool
    thickness: float

class Door(BaseModel):
    id: int
    wall_id: Optional[int] = None
    points: List[Point]
    width: Optional[float] = 0
    height: Optional[float] = 0
    type: Optional[str] = "single"
    door_type: Optional[str] = "single"
    hingeSide: Optional[str] = None
    swing: Optional[str] = None
    angle: Optional[float] = None

class LabelRequest(BaseModel):
    rooms: List[Room]
    walls: Optional[List[Wall]] = None
    doors: Optional[List[Door]] = None
    width: float
    height: float
    name: str
    project_name: Optional[str] = None
    username: Optional[str] = None
    roi: Optional[dict] = None

class OCRCorrectionRequest(BaseModel):
    room_id: str
    original_text: str
    corrected_text: str
    text_type: str = "ROOM_NAME"
    apply_to_all: bool = False
    context: Optional[dict] = None
    source_confidence: Optional[float] = None
    roi: Optional[dict] = None

class ExportWallLabelsRequest(BaseModel):
    image_name: str
    image_data: str
    width: int
    height: int
    walls: List[dict]

class ExportDoorLabelsRequest(BaseModel):
    image_name: str
    image_data: str
    width: int
    height: int
    doors: List[dict]

class ExportRoomLabelsRequest(BaseModel):
    image_name: str
    image_data: str
    width: int
    height: int
    rooms: List[dict]

