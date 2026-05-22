import sqlite3
import os

SOURCE_DB = r'C:\Users\ADMIN\Documents\22-4-2026\EzeFloor-main\backend\ezefloor.db'
TARGET_DB = 'ezefloor.db'

def get_user_map(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT id, username FROM users")
    return {row[1]: row[0] for row in cursor.fetchall()}

def migrate_jobs():
    if not os.path.exists(SOURCE_DB):
        print(f"Source DB not found at {SOURCE_DB}")
        return

    s_conn = sqlite3.connect(SOURCE_DB)
    s_conn.row_factory = sqlite3.Row
    s_cursor = s_conn.cursor()

    t_conn = sqlite3.connect(TARGET_DB)
    t_conn.row_factory = sqlite3.Row
    t_cursor = t_conn.cursor()

    source_user_map_rev = {v: k for k, v in get_user_map(s_conn).items()}
    target_user_map = get_user_map(t_conn)

    s_cursor.execute("SELECT user_id, project_name, room_count, total_area, data, created_at, is_trained FROM jobs")
    source_jobs = s_cursor.fetchall()
    
    print(f"Found {len(source_jobs)} jobs in source database.")

    added_count = 0
    skipped_count = 0
    user_missing_count = 0

    for job in source_jobs:
        source_user_id = job['user_id']
        username = source_user_map_rev.get(source_user_id)
        
        if not username:
            print(f"Warning: User ID {source_user_id} not found in source users table. Skipping job '{job['project_name']}'.")
            user_missing_count += 1
            continue
            
        target_user_id = target_user_map.get(username)
        if not target_user_id:
            print(f"Warning: User '{username}' not found in target database. Skipping job '{job['project_name']}'.")
            user_missing_count += 1
            continue

        # Check if job exists in target (match by target_user_id and project_name)
        t_cursor.execute(
            "SELECT id FROM jobs WHERE user_id = ? AND project_name = ?", 
            (target_user_id, job['project_name'])
        )
        if t_cursor.fetchone():
            skipped_count += 1
            continue

        try:
            t_cursor.execute(
                """
                INSERT INTO jobs (user_id, project_name, room_count, total_area, data, created_at, is_trained) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    target_user_id, 
                    job['project_name'], 
                    job['room_count'], 
                    job['total_area'], 
                    job['data'], 
                    job['created_at'], 
                    job['is_trained']
                )
            )
            added_count += 1
        except Exception as e:
            print(f"Error inserting job '{job['project_name']}': {e}")

    t_conn.commit()
    s_conn.close()
    t_conn.close()

    print(f"Migration completed.")
    print(f"Jobs added: {added_count}")
    print(f"Jobs skipped (already exists): {skipped_count}")
    print(f"Jobs skipped (user missing): {user_missing_count}")

if __name__ == "__main__":
    migrate_jobs()
