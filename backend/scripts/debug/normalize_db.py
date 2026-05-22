"""
normalize_db.py
================
Standardizes room names and class assignments in the ezefloor.db database.
Maps all existing rooms to the 6 super-classes and canonical names.
"""

import sqlite3
import json
import re

db_path = "backend/ezefloor.db"

# Normalization Mapping (Canonical Name -> Super Class ID)
MAPPING = {
    # 0: bedroom
    "BED": 0, "BEDROOM": 0, "MASTER": 0, "KIDS": 0, "SITTING": 0, "ROBE": 0, "WIR": 0, "LINEN": 0, "GUEST": 0, "SLEEP": 0,
    
    # 1: bathroom
    "WC": 1, "BATH": 1, "BATHROOM": 1, "ENS": 1, "ENSUITE": 1, "LAUNDRY": 1, "LDRY": 1, "PWD": 1, "PDR": 1, "POWDER": 1, "SQSET": 1, "SHOWER": 1, "TOILET": 1,
    
    # 2: living
    "LIVING": 2, "LOUNGE": 2, "KITCHEN": 2, "DINING": 2, "MEALS": 2, "STUDY": 2, "OFFICE": 2, "MEDIA": 2, "THEATER": 2, "GYM": 2, 
    "LIBRARY": 2, "RETREAT": 2, "RUMPUS": 2, "ROOM": 2, "UNKNOWN": 2, "FAMILY": 2, "KIT": 2, "DNG": 2, "SITTING": 2, "THEATRE": 2,
    
    # 3: hallway
    "HALL": 3, "HALLWAY": 3, "ENTRY": 3, "FOYER": 3, "MUD": 3, "PASSAGE": 3,
    
    # 4: outdoor
    "DECK": 4, "BALCONY": 4, "ALFRESCO": 4, "COURTYARD": 4, "TERRACE": 4, "PATIO": 4, "VERANDA": 4, "PORCH": 4,
    
    # 5: utility
    "STORE": 5, "STORAGE": 5, "PANTRY": 5, "PTRY": 5, "GARAGE": 5, "CAR": 5, "WIP": 5, "WORK": 5, "LIFT": 5
}

SUPER_CLASS_NAMES = {
    0: "Bedroom",
    1: "Bathroom",
    2: "Living",
    3: "Hallway",
    4: "Outdoor",
    5: "Utility"
}

WET_CLASSES = {1}  # bathroom is wet

def get_super_class(name):
    if not name: return 2, "Living"
    clean = re.sub(r'[^A-Z]', '', name.upper())
    
    # Check exact match
    if clean in MAPPING:
        cid = MAPPING[clean]
        return cid, SUPER_CLASS_NAMES[cid]
    
    # Check partial match
    for key, cid in MAPPING.items():
        if key in clean or clean in key:
            return cid, SUPER_CLASS_NAMES[cid]
            
    return 2, "Living" # Default

def normalize():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, data FROM jobs")
    rows = cursor.fetchall()
    
    updates = 0
    total_rooms = 0
    
    print(f"Normalizing {len(rows)} jobs...")
    
    for job_id, p_data in rows:
        try:
            data = json.loads(p_data)
            modified = False
            
            # Structure A: { roomsByPage: { "0": [...] } }
            if "roomsByPage" in data:
                for page_id in data["roomsByPage"]:
                    for room in data["roomsByPage"][page_id]:
                        total_rooms += 1
                        old_name = room.get("room_name", "")
                        cid, new_name = get_super_class(old_name)
                        
                        # Update room properties
                        room["room_name"] = new_name
                        room["class_id"] = cid
                        room["type"] = "wet" if cid in WET_CLASSES else "dry"
                        room["wetness"] = room["type"]
                        room["room_type"] = room["type"]
                        room["zone"] = "outdoor" if cid == 4 else "indoor"
                        modified = True
            
            # Structure B: { pages: [ { objects: [...] } ] }
            if "pages" in data:
                for page in data["pages"]:
                    if "objects" in page:
                        for obj in page["objects"]:
                            if "room_name" in obj:
                                total_rooms += 1
                                old_name = obj.get("room_name", "")
                                cid, new_name = get_super_class(old_name)
                                
                                obj["room_name"] = new_name
                                obj["class_id"] = cid
                                obj["type"] = "wet" if cid in WET_CLASSES else "dry"
                                obj["wetness"] = obj["type"]
                                obj["room_type"] = obj["type"]
                                obj["zone"] = "outdoor" if cid == 4 else "indoor"
                                modified = True
                                
            if modified:
                cursor.execute("UPDATE jobs SET data = ? WHERE id = ?", (json.dumps(data), job_id))
                updates += 1
                
        except Exception as e:
            print(f"Error job {job_id}: {e}")
            
    conn.commit()
    conn.close()
    
    print(f"\nNormalization Complete!")
    print(f"Processed {total_rooms} rooms across {len(rows)} jobs.")
    print(f"Updated {updates} database records.")

if __name__ == "__main__":
    normalize()
