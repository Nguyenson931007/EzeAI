import sqlite3
import os

SOURCE_DB = r'C:\Users\ADMIN\Documents\22-4-2026\EzeFloor-main\backend\ezefloor.db'
TARGET_DB = 'ezefloor.db'

def count_jobs(db_path):
    if not os.path.exists(db_path):
        return -1
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM jobs")
    count = cursor.fetchone()[0]
    conn.close()
    return count

if __name__ == "__main__":
    s_count = count_jobs(SOURCE_DB)
    t_count = count_jobs(TARGET_DB)
    print(f"Source Jobs: {s_count}")
    print(f"Target Jobs: {t_count}")
