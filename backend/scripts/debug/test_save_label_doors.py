import requests
import json

URL = "http://localhost:8090/save-label"

def test_save_label_with_doors():
    payload = {
        "rooms": [],
        "walls": [
            {
                "id": 123,
                "wall_type": "ext",
                "points": [{"x": 100, "y": 100}, {"x": 500, "y": 100}],
                "isClosed": False,
                "thickness": 240
            }
        ],
        "doors": [
            {
                "id": 456,
                "wall_id": 123,
                "points": [{"x": 200, "y": 100}, {"x": 300, "y": 100}],
                "width": 1000,
                "height": 2100,
                "type": "single"
            }
        ],
        "width": 1024,
        "height": 1024,
        "name": "test_job_with_doors",
        "project_name": "TestProject",
        "username": "TestUser"
    }
    
    print("Sending save-label request with doors...")
    try:
        response = requests.post(URL, json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        # Check if label file was created
        label_file = "d:/Copy_test/EzeFloor-main/backend/dataset_walls/train/labels/test_job_with_doors.txt"
        if os.path.exists(label_file):
            print(f"Label file created: {label_file}")
            with open(label_file, "r") as f:
                content = f.read()
                print("Label Content:")
                print(content)
                if "2 " in content:
                    print("SUCCESS: Found class 2 (Door) in label file.")
                else:
                    print("FAILURE: Class 2 (Door) not found in label file.")
        else:
            print(f"FAILURE: Label file not found at {label_file}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    import os
    test_save_label_with_doors()
