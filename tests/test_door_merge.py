import sys
import math
import pytest
from pathlib import Path

# Math copy of NMS formulas from floor_ai_detect.py
def compute_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    
    interArea = max(0.0, xB - xA) * max(0.0, yB - yA)
    if interArea <= 0:
        return 0.0
        
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    
    unionArea = boxAArea + boxBArea - interArea
    if unionArea <= 0:
        return 0.0
    return interArea / unionArea

def compute_overlap_coefficient(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    
    interArea = max(0.0, xB - xA) * max(0.0, yB - yA)
    if interArea <= 0:
        return 0.0
        
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    
    minArea = min(boxAArea, boxBArea)
    if minArea <= 0:
        return 0.0
    return interArea / minArea

def test_iou_overlapping():
    box1 = [0, 0, 10, 10]
    box2 = [5, 0, 15, 10] # overlaps by 5x10 = 50 area
    # Box1 area: 100, Box2 area: 100, Union area: 150
    # IoU: 50 / 150 = 0.3333
    assert abs(compute_iou(box1, box2) - 0.3333) < 0.001

def test_iou_non_overlapping():
    box1 = [0, 0, 10, 10]
    box2 = [20, 20, 30, 30]
    assert compute_iou(box1, box2) == 0.0

def test_overlap_coefficient():
    box1 = [0, 0, 10, 10] # Area: 100
    box2 = [2, 2, 6, 6]   # Area: 16 (fully contained)
    # Overlap coeff should be 1.0 (intersection = 16, smaller area = 16)
    assert compute_overlap_coefficient(box1, box2) == 1.0

def test_nms_edge_cases():
    # Empty box (zero width/height)
    box1 = [0, 0, 0, 0]
    box2 = [0, 0, 10, 10]
    assert compute_iou(box1, box2) == 0.0
    assert compute_overlap_coefficient(box1, box2) == 0.0
    
    # Malformed coordinate bounds (x2 < x1)
    box1 = [10, 10, 0, 0]
    assert compute_iou(box1, box2) == 0.0
