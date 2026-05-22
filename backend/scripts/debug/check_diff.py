import sqlite3
import os

SOURCE_DB = r'C:\Users\ADMIN\Documents\22-4-2026\EzeFloor-main\backend\ezefloor.db'
TARGET_DB = 'ezefloor.db'

def check_differences():
    if not os.path.exists(SOURCE_DB):
        return

    s_conn = sqlite3.connect(SOURCE_DB)
    s_conn.row_factory = sqlite3.Row
    s_cursor = s_conn.cursor()

    t_conn = sqlite3.connect(TARGET_DB)
    t_conn.row_factory = sqlite3.Row
    t_cursor = t_conn.cursor()

    s_cursor.execute("SELECT user_id, project_name, created_at FROM jobs")
    source_jobs = s_cursor.fetchall()
    
    diff_count = 0
    for job in source_jobs:
        t_cursor.execute(
            "SELECT created_at FROM jobs WHERE user_id = ? AND project_name = ?", 
            (job['user_id'], job['project_name'])
        )
        row = t_cursor.fetchone()
        if row and row['created_at'] != job['created_at']:
            print(f"Difference in '{job['project_name']}': Source {job['created_at']} vs Target {row['created_at']}")
            diff_count += 1
            
    print(f"Total differences found: {diff_count}")
    
    s_conn.close()
    t_conn.close()

if __name__ == "__main__":
    check_differences()
