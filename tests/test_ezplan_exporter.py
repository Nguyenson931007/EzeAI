import sys
import pytest
from pathlib import Path
from pydantic import ValidationError

# Add backend directory to Python path for imports
TEST_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = TEST_DIR.parent
BACKEND_DIR = WORKSPACE_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from exporters.ezplan_exporter import (
    EZPlanExporter,
    EZPlanExportRequest,
    InputWall,
    EZPlanWall,
    EZPlanDocument,
    InvalidLevelError
)

def test_single_exterior_wall():
    exporter = EZPlanExporter()
    request = EZPlanExportRequest(
        walls=[
            InputWall(
                id="wall_1",
                thickness=90.0,
                height=2700.0,
                centerline=[[0.0, 0.0], [3000.0, 0.0]],
                **{"class": "exterior_wall"} # alias mapping
            )
        ],
        job_name="Single Wall Test"
    )

    doc = exporter.export(request)
    assert doc.Version == "0.3"
    assert doc.JobName == "Single Wall Test"
    assert len(doc.Walls) == 1

    wall = doc.Walls[0]
    assert wall.Thickness == 90.0
    assert wall.Height == 2700.0
    assert wall.StartX == 0.0
    assert wall.StartY == 0.0
    assert wall.EndX == 3000.0
    assert wall.EndY == 0.0
    assert wall.Exterior is True
    assert wall.Interior is False
    assert wall.LoadBearingWall is True
    assert wall.Id is not None
    assert len(wall.Id) > 0

def test_multiple_walls():
    exporter = EZPlanExporter()
    request = EZPlanExportRequest(
        walls=[
            InputWall(id=1, thickness=150.0, height=3000.0, centerline=[[0, 0], [1000, 0]], **{"class": "exterior_wall"}),
            InputWall(id=2, thickness=90.0, height=2700.0, centerline=[[1000, 0], [1000, 2000]], **{"class": "interior_wall"}),
            InputWall(id=3, thickness=70.0, height=2400.0, centerline=[[1000, 2000], [0, 2000]], **{"class": "partition_wall"})
        ],
        job_name="Multi Wall Test"
    )

    doc = exporter.export(request)
    assert len(doc.Walls) == 3
    assert doc.LevelWallHeights["LEVEL_01"] == 3000.0 # Max height from inputs
    
    # Assert unique generated IDs
    ids = [w.Id for w in doc.Walls]
    assert len(ids) == len(set(ids))

def test_wall_class_mappings():
    exporter = EZPlanExporter()
    
    # Exterior
    req_ext = EZPlanExportRequest(
        walls=[InputWall(id=1, thickness=90, centerline=[[0, 0], [100, 0]], **{"class": "exterior_wall"})]
    )
    doc_ext = exporter.export(req_ext)
    assert doc_ext.Walls[0].Exterior is True
    assert doc_ext.Walls[0].Interior is False
    assert doc_ext.Walls[0].LoadBearingWall is True

    # Interior
    req_int = EZPlanExportRequest(
        walls=[InputWall(id=2, thickness=90, centerline=[[0, 0], [100, 0]], **{"class": "interior_wall"})]
    )
    doc_int = exporter.export(req_int)
    assert doc_int.Walls[0].Exterior is False
    assert doc_int.Walls[0].Interior is True
    assert doc_int.Walls[0].LoadBearingWall is False

    # Partition
    req_part = EZPlanExportRequest(
        walls=[InputWall(id=3, thickness=90, centerline=[[0, 0], [100, 0]], **{"class": "partition_wall"})]
    )
    doc_part = exporter.export(req_part)
    assert doc_part.Walls[0].Exterior is False
    assert doc_part.Walls[0].Interior is True
    assert doc_part.Walls[0].LoadBearingWall is False

def test_invalid_coordinates():
    # Start and End coordinates are identical
    with pytest.raises(ValidationError) as excinfo:
        InputWall(
            id="invalid_wall",
            thickness=90,
            centerline=[[100, 200], [100, 200]],
            **{"class": "exterior_wall"}
        )
    assert "Start and End points of the wall centerline cannot be identical" in str(excinfo.value)

    # Malformed centerline format
    with pytest.raises(ValidationError) as excinfo:
        InputWall(
            id="invalid_format",
            thickness=90,
            centerline=[[100, 200]],
            **{"class": "exterior_wall"}
        )
    assert "Centerline must contain exactly 2 points" in str(excinfo.value)

def test_invalid_thickness():
    # Thickness <= 0
    with pytest.raises(ValidationError) as excinfo:
        InputWall(
            id="invalid_thickness",
            thickness=0,
            centerline=[[0, 0], [100, 0]],
            **{"class": "exterior_wall"}
        )
    assert "Thickness must be greater than 0" in str(excinfo.value)

def test_invalid_height():
    # Height <= 0
    with pytest.raises(ValidationError) as excinfo:
        InputWall(
            id="invalid_height",
            thickness=90,
            height=-10,
            centerline=[[0, 0], [100, 0]],
            **{"class": "exterior_wall"}
        )
    assert "Height must be greater than 0" in str(excinfo.value)

def test_empty_wall_list():
    exporter = EZPlanExporter()
    request = EZPlanExportRequest(walls=[])
    doc = exporter.export(request)
    assert len(doc.Walls) == 0
    assert doc.Version == "0.3"
    assert doc.LevelWallHeights["LEVEL_01"] == 2700.0 # Default fallback height

def test_invalid_level_name():
    # Attempting to construct a document with a wall level name not present in doc levels
    wall = EZPlanWall(
        Id="SOME_UUID",
        StartX=0, StartY=0, EndX=100, EndY=0,
        Thickness=90, Height=2700,
        LevelName="LEVEL_02", # Invalid level name
        Interior=False, Exterior=True, LoadBearingWall=True
    )
    with pytest.raises(InvalidLevelError) as excinfo:
        EZPlanDocument(
            CurrentLevelName="LEVEL_01",
            Walls=[wall]
        )
    assert "Wall references undefined level: 'LEVEL_02'" in str(excinfo.value)
