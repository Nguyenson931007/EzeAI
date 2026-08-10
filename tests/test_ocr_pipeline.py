import pytest
import sys
from pathlib import Path

# Ensure backend directory is in path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from services.room_ocr_service import (
    parse_and_normalize_room_text,
    is_cad_noise,
    compute_multi_signal_confidence
)

def test_room_name_parsing_exact():
    res = parse_and_normalize_room_text("BED 5")
    assert res["is_valid_room"] is True
    assert res["category"] == "BED"
    assert res["number"] == 5
    assert res["normalized_text"] == "BED 5"

def test_room_name_ocr_misread_beo_5():
    res = parse_and_normalize_room_text("BEO 5")
    assert res["is_valid_room"] is True
    assert res["category"] == "BED"
    assert res["number"] == 5
    assert res["normalized_text"] == "BED 5"

def test_room_name_ocr_misread_8ed_2():
    res = parse_and_normalize_room_text("8ED 2")
    assert res["is_valid_room"] is True
    assert res["category"] == "BED"
    assert res["number"] == 2
    assert res["normalized_text"] == "BED 2"

def test_room_name_ocr_misread_bed_s():
    res = parse_and_normalize_room_text("BED S")
    assert res["is_valid_room"] is True
    assert res["category"] == "BED"
    assert res["number"] == 5
    assert res["normalized_text"] == "BED 5"

def test_room_name_ocr_misread_ensulte():
    res = parse_and_normalize_room_text("ENSUlTE")
    assert res["is_valid_room"] is True
    assert res["normalized_text"] in ["ENS", "ENSUITE"]

def test_room_name_ocr_misread_bathr0om():
    res = parse_and_normalize_room_text("BATHR0OM")
    assert res["is_valid_room"] is True
    assert res["normalized_text"] in ["BATH", "BATHROOM"]

def test_room_name_ocr_misread_famlly():
    res = parse_and_normalize_room_text("FAMlLY")
    assert res["is_valid_room"] is True
    assert res["normalized_text"] == "FAMILY"

def test_cad_noise_filtering_wall_id():
    res = parse_and_normalize_room_text("W-17")
    assert res["is_valid_room"] is False
    assert res["is_cad_noise"] is True

def test_cad_noise_filtering_dimension_720cs():
    res = parse_and_normalize_room_text("720CS")
    assert res["is_valid_room"] is False
    assert res["is_cad_noise"] is True

def test_cad_noise_filtering_pure_number_820():
    res = parse_and_normalize_room_text("820")
    assert res["is_valid_room"] is False
    assert res["is_cad_noise"] is True

def test_multi_signal_confidence_calculation():
    scores = compute_multi_signal_confidence(
        raw_conf=0.85,
        semantic_conf=0.95,
        spatial_dist=10.0,
        max_dist=100.0,
        bbox_h=35.0,
        topology_boost=30,
        multi_pass_bonus=10
    )
    assert scores["final_confidence"] > 0.80
    assert "ocr_score" in scores
    assert "semantic_score" in scores

def test_vertical_ocr_misread_wc_jm():
    res = parse_and_normalize_room_text("JM")
    assert res["is_valid_room"] is True
    assert res["category"] == "WC"
    assert res["normalized_text"] == "WC"

def test_vertical_ocr_misread_linen_lien():
    res = parse_and_normalize_room_text("LIEN")
    assert res["is_valid_room"] is True
    assert res["category"] == "LINEN"
    assert res["normalized_text"] == "LINEN"

def test_vertical_ocr_misread_linen_njn():
    res = parse_and_normalize_room_text("NJN")
    assert res["is_valid_room"] is True
    assert res["category"] == "LINEN"
    assert res["normalized_text"] == "LINEN"
