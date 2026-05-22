import sqlite3
import json

conn = sqlite3.connect("ezefloor.db")
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT data FROM jobs LIMIT 1")
row = cursor.fetchone()
if row:
    data = json.loads(row['data'])
    print("Keys in job data:", data.keys())
    if 'pages' in data:
        print("Number of pages:", len(data['pages']))
        if len(data['pages']) > 0:
            print("First page keys:", data['pages'][0].keys())
else:
    print("No jobs found in database.")

conn.close()
