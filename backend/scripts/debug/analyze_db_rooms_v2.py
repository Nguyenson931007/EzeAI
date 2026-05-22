import sqlite3
import json
from collections import Counter
import re

db_path = "backend/ezefloor.db"

def clean_text(s):
    if not s: return ""
    s = str(s).upper().strip()
    s = re.sub(r'[^A-Z0-9\s/]', '', s)
    # Remove dimensions like 3.2X4.5
    s = re.sub(r'\d+(\.\d+)?\s*X\s*\d+(\.\d+)?', '', s)
    return s.strip()

def analyze_db():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id, project_name, data FROM jobs")
        rows = cursor.fetchall()
        print(f"Total jobs: {len(rows)}")
        
        all_room_names = []
        
        for job_id, p_name, p_data in rows:
            try:
                data = json.loads(p_data)
                pages = data.get('pages', [])
                if not pages:
                    # check if data itself is a project object
                    if 'objects' in data:
                        pages = [{'objects': data['objects']}]
                
                for page in pages:
                    for obj in page.get('objects', []):
                        # The 'source' field or 'type' field might identify it
                        # In EzeFloor, rooms usually have room_name
                        if 'room_name' in obj:
                            name = obj.get('room_name')
                            if name:
                                all_room_names.append(clean_text(name))
            except Exception as e:
                # print(f"Error parsing job {job_id}: {e}")
                continue
                
        print("\n=== Room Name Distribution (Top 50) ===")
        name_counts = Counter(all_room_names)
        for name, count in name_counts.most_common(50):
            print(f"{name:25}: {count}")
            
    except Exception as e:
        print(f"Error: {e}")
        
    conn.close()

if __name__ == "__main__":
    analyze_db()
