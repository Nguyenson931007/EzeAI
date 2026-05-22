import sqlite3
import json

db_path = "backend/ezefloor.db"

def inspect_one():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT data FROM jobs LIMIT 1")
    row = cursor.fetchone()
    if row:
        data = json.loads(row[0])
        print(json.dumps(data, indent=2)[:2000])
    conn.close()

if __name__ == "__main__":
    inspect_one()
