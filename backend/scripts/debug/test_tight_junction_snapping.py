import sys
import os

backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from services.floor_ai_detect import _smooth_polygon

def test_smooth_polygon():
    pts = [{"x": 100, "y": 100}, {"x": 300, "y": 100}, {"x": 300, "y": 200}, {"x": 100, "y": 200}]
    res = _smooth_polygon(pts, 1000, 1000)
    assert len(res) == 4
    print("✅ test_smooth_polygon PASSED")

if __name__ == "__main__":
    test_smooth_polygon()
    print("🎉 ALL TESTS PASSED!")
