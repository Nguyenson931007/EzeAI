import uuid
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Union, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

# ──────────────────────────────────────────────────────────
# CUSTOM EXCEPTIONS
# ──────────────────────────────────────────────────────────

class EZPlanExportError(Exception):
    """Base exception for EZPlan Export errors."""
    pass

class InvalidGeometryError(EZPlanExportError):
    """Raised when geometry validation fails (e.g. thickness <= 0 or start == end)."""
    pass

class InvalidLevelError(EZPlanExportError):
    """Raised when level validation fails (e.g. undefined LevelName)."""
    pass

# ──────────────────────────────────────────────────────────
# INPUT SCHEMAS (Unified Wall Model from Geometry Engine)
# ──────────────────────────────────────────────────────────

class InputWall(BaseModel):
    id: Union[str, int]
    wall_class: str = Field(..., alias="class")
    centerline: List[List[float]]
    thickness: float
    height: float = 2700.0
    frame_stud_spacing: Optional[str] = None
    frame_timber_grade: Optional[str] = None
    frame_stud_size: Optional[str] = None
    frame_stud_ply_count: Optional[int] = None
    frame_plate_ply_count: Optional[int] = None
    treated: Optional[str] = None

    @field_validator("wall_class")
    @classmethod
    def validate_class(cls, v: str) -> str:
        valid_classes = {"exterior_wall", "interior_wall", "partition_wall"}
        if v not in valid_classes:
            raise ValueError(f"Invalid wall class: '{v}'. Must be one of {valid_classes}")
        return v

    @field_validator("thickness")
    @classmethod
    def validate_thickness(cls, v: float) -> float:
        if v <= 0:
            raise ValueError(f"Thickness must be greater than 0, got {v}")
        return v

    @field_validator("height")
    @classmethod
    def validate_height(cls, v: float) -> float:
        if v <= 0:
            raise ValueError(f"Height must be greater than 0, got {v}")
        return v

    @model_validator(mode="after")
    def validate_coordinates(self) -> 'InputWall':
        cl = self.centerline
        if not isinstance(cl, list) or len(cl) != 2:
            raise ValueError("Centerline must contain exactly 2 points: [[x1, y1], [x2, y2]]")
        
        pt1, pt2 = cl[0], cl[1]
        if not isinstance(pt1, (list, tuple)) or len(pt1) < 2 or not isinstance(pt2, (list, tuple)) or len(pt2) < 2:
            raise ValueError("Each point in the centerline must contain at least [x, y] coordinates")
            
        if pt1[0] == pt2[0] and pt1[1] == pt2[1]:
            raise ValueError(f"Start and End points of the wall centerline cannot be identical: {pt1}")
            
        return self


class EZPlanExportRequest(BaseModel):
    walls: List[InputWall]
    job_name: str = ""
    customer_name: str = ""
    address: str = ""
    drafted_by: str = ""

# ──────────────────────────────────────────────────────────
# OUTPUT SCHEMAS (EZPlan JSON Document format)
# ──────────────────────────────────────────────────────────

class EZPlanWall(BaseModel):
    Id: str
    Shape: str = "Line"
    StartX: float
    StartY: float
    StartZ: float = 0.0
    EndX: float
    EndY: float
    EndZ: float = 0.0
    MidX: Optional[float] = None
    MidY: Optional[float] = None
    MidZ: Optional[float] = None
    EditLength: bool = False
    LengthMm: float = 0.0
    LengthAnchor: str = "Start"
    Thickness: float = 90.0
    Height: float = 2700.0
    RakeStartHeightMm: Optional[float] = None
    RakeMidHeightMm: Optional[float] = None
    RakeEndHeightMm: Optional[float] = None
    RakePointX: Optional[float] = None
    RakePointY: Optional[float] = None
    RakePointZ: Optional[float] = None
    Alignment: str = "Left"
    AllowAlignmentEdit: bool = True
    LevelName: str = "LEVEL_01"
    LocationLine: str = "FinishFaceExterior"
    Flipped: bool = False
    OffsetMm: float = 0.0
    ElevationOffsetMm: float = 0.0
    Interior: bool = False
    Exterior: bool = True
    DwarfWall: bool = False
    IsVirtualRoofWall: bool = False
    IsExisting: bool = False
    AllowInternalRibbonPlateEdit: bool = False
    LoadBearingWall: bool = True
    ExteriorPlasterFaceManuallyConfirmed: bool = False
    FrameStudSpacing: str = "450"
    FrameBottomPlateGrade: str = "MGP10"
    FrameRibbonPlateGrade: str = "MGP10"
    FrameTopPlateGrade: str = "MGP10"
    FrameStudGrade: str = "MGP10"
    FrameNogGrade: str = "MGP10"
    FrameBottomPlateSize: str = "90x35"
    FrameRibbonPlateSize: str = "90x35"
    FrameTopPlateSize: str = "90x35"
    FrameStudSize: str = "90x35"
    FrameNogSize: str = "90x35"
    FrameBottomPlatePlyCount: int = 1
    FrameRibbonPlatePlyCount: int = 1
    FrameTopPlatePlyCount: int = 1
    FrameStudPlyCount: int = 1
    FrameWallColorArgb: int = -16776961
    FrameExternalWallColorArgb: int = -16776961
    FrameInternalWallColorArgb: int = -65281
    FrameLoadBearingWallColorArgb: int = -16776961
    FrameNonLoadBearingWallColorArgb: int = -65281


class EZPlanDocument(BaseModel):
    Version: str = "0.5"
    JobName: str = ""
    CustomerName: str = ""
    JobAddress: str = ""
    DraftedBy: str = ""
    TargetWallCount: Optional[int] = None
    ExteriorPlasterFaceManuallyConfirmed: Optional[bool] = None
    Levels: Dict[str, float] = Field(default_factory=lambda: {"LEVEL_01": 0.0})
    CurrentLevelName: str = "LEVEL_01"
    LevelWallHeights: Dict[str, float] = Field(default_factory=lambda: {"LEVEL_01": 2700.0})
    LevelStoreyHeights: Dict[str, float] = Field(default_factory=lambda: {"LEVEL_01": 2700.0})
    LevelJoistHeights: Dict[str, float] = Field(default_factory=dict)
    
    Walls: List[EZPlanWall] = Field(default_factory=list)
    CriticalStuds: List[Any] = Field(default_factory=list)
    StripedLines: List[Any] = Field(default_factory=list)
    TextNotes: List[Any] = Field(default_factory=list)
    Openings: List[Any] = Field(default_factory=list)
    PlasterSheets: List[Any] = Field(default_factory=list)
    PlasterOffcuts: List[Any] = Field(default_factory=list)
    PlasterPlacedPieces: List[Any] = Field(default_factory=list)
    Beams: List[Any] = Field(default_factory=list)
    JoistSets: List[Any] = Field(default_factory=list)
    Blockings: List[Any] = Field(default_factory=list)
    Posts: List[Any] = Field(default_factory=list)
    Hangers: List[Any] = Field(default_factory=list)
    StructuralLabelOverrides: List[Any] = Field(default_factory=list)
    Roofs: List[Any] = Field(default_factory=list)
    RoofPlans: List[Any] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_document_levels(self) -> 'EZPlanDocument':
        valid_levels = set(self.Levels.keys())
        for wall in self.Walls:
            if wall.LevelName not in valid_levels:
                raise InvalidLevelError(f"Wall references undefined level: '{wall.LevelName}'. Valid levels: {valid_levels}")
        return self

# ──────────────────────────────────────────────────────────
# EXPORTER IMPLEMENTATION
# ──────────────────────────────────────────────────────────

class BaseExporter(ABC):
    @abstractmethod
    def export(self, request_data: Any) -> Any:
        """Export the internal component model to the target file representation."""
        pass


class EZPlanExporter(BaseExporter):
    def export(self, request: EZPlanExportRequest) -> EZPlanDocument:
        """
        Maps EZPlanExportRequest containing Unified Wall Models to an EZPlanDocument (v0.3).
        Validates geometries and level mappings dynamically.
        """
        output_walls = []
        generated_ids = set()

        for w in request.walls:
            # Map YOLO class to Interior/Exterior/LoadBearing
            if w.wall_class == "exterior_wall":
                is_interior = False
                is_exterior = True
                is_load_bearing = True
            elif w.wall_class in ("interior_wall", "partition_wall"):
                is_interior = True
                is_exterior = False
                is_load_bearing = False
            else:
                raise InvalidGeometryError(f"Unsupported wall class: {w.wall_class}")

            # Generate and ensure unique uppercase UUIDs
            while True:
                wall_uuid = str(uuid.uuid4()).upper()
                if wall_uuid not in generated_ids:
                    generated_ids.add(wall_uuid)
                    break

            p1, p2 = w.centerline[0], w.centerline[1]

            thick_val = float(w.thickness)
            stud_size = w.frame_stud_size or f"{int(thick_val)}x35"
            stud_spacing = w.frame_stud_spacing or "450"
            timber_grade = w.frame_timber_grade or "MGP10"
            stud_ply = w.frame_stud_ply_count or (2 if w.height > 2805 else 1)
            plate_ply = w.frame_plate_ply_count or 1

            ez_wall = EZPlanWall(
                Id=wall_uuid,
                StartX=float(p1[0]),
                StartY=float(p1[1]),
                EndX=float(p2[0]),
                EndY=float(p2[1]),
                Thickness=thick_val,
                Height=float(w.height),
                Alignment="Left",
                LocationLine="FinishFaceExterior",
                Interior=is_interior,
                Exterior=is_exterior,
                LoadBearingWall=is_load_bearing,
                ExteriorPlasterFaceManuallyConfirmed=False,
                FrameStudSpacing=stud_spacing,
                FrameBottomPlateGrade=timber_grade,
                FrameRibbonPlateGrade=timber_grade,
                FrameTopPlateGrade=timber_grade,
                FrameStudGrade=timber_grade,
                FrameNogGrade=timber_grade,
                FrameBottomPlateSize=stud_size,
                FrameRibbonPlateSize=stud_size,
                FrameTopPlateSize=stud_size,
                FrameStudSize=stud_size,
                FrameNogSize=stud_size,
                FrameBottomPlatePlyCount=plate_ply,
                FrameRibbonPlatePlyCount=plate_ply,
                FrameTopPlatePlyCount=plate_ply,
                FrameStudPlyCount=stud_ply,
                FrameWallColorArgb=-16776961 if is_exterior else -65281,
                FrameExternalWallColorArgb=-16776961,
                FrameInternalWallColorArgb=-65281,
                FrameLoadBearingWallColorArgb=-16776961,
                FrameNonLoadBearingWallColorArgb=-65281
            )
            output_walls.append(ez_wall)

        # Set level height default based on max wall height
        level_height = 2700.0
        if request.walls:
            level_height = max(w.height for w in request.walls)

        doc = EZPlanDocument(
            Version="0.5",
            JobName=request.job_name,
            CustomerName=request.customer_name,
            JobAddress=request.address,
            DraftedBy=request.drafted_by,
            TargetWallCount=len(output_walls),
            LevelWallHeights={"LEVEL_01": level_height},
            LevelStoreyHeights={"LEVEL_01": level_height},
            Walls=output_walls
        )

        return doc
