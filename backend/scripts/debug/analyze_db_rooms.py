import sqlite3
from collections import Counter
import json

db_path = "backend/ezefloor.db"

def analyze_db():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print(f"Tables: {tables}")
    
    # Assume there is a 'projects' or 'rooms' table. 
    # Let's check for 'rooms' or similar.
    # Looking at the codebase, it likely stores project data in a 'projects' table as JSON.
    
    try:
        cursor.execute("SELECT id, name, data FROM projects")
        projects = cursor.fetchall()
        print(f"Total projects: {len(projects)}")
        
        all_room_names = []
        all_class_ids = []
        
        for p_id, p_name, p_data in projects:
            try:
                data = json.loads(p_data)
                # Structure is likely { pages: [ { objects: [...] } ] }
                for page in data.get('pages', []):
                    for obj in page.get('objects', []):
                        if obj.get('type') == 'room' or 'room_name' in obj:
                            name = obj.get('room_name') or obj.get('name')
                            if name:
                                all_room_names.append(name.upper().strip())
                            cid = obj.get('class_id')
                            if cid is not None:
                                all_class_ids.append(cid)
            except:
                continue
                
        print("\n=== Top 30 Room Names in Database ===")
        name_counts = Counter(all_room_names)
        for name, count in name_counts.most_common(30):
            print(f"{name:20}: {count}")
            
        print("\n=== Class ID Distribution ===")
        cid_counts = Counter(all_class_ids)
        for cid, count in sorted(cid_counts.items(), key=lambda x: -x[1]):
            print(f"ID {cid:2}: {count}")
            
    except Exception as e:
        print(f"Error analyzing projects: {e}")
        
    conn.close()

if __name__ == "__main__":
    analyze_db()
