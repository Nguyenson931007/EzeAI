"""
migrate_sqlite_to_mysql.py
==========================
Migrate data from SQLite to MySQL.

Prerequisites:
1. Install MySQL Server: https://dev.mysql.com/downloads/installer/
2. Create database: CREATE DATABASE ezefloor CHARACTER SET utf8mb4;
3. Set environment variables:
   - DB_TYPE=mysql
   - MYSQL_HOST=localhost
   - MYSQL_PORT=3306
   - MYSQL_USER=root
   - MYSQL_PASSWORD=your_password
   - MYSQL_DB=ezefloor

Usage:
    python migrate_sqlite_to_mysql.py
"""

import os
import sqlite3
import pymysql


SQLITE_PATH = "ezefloor.db"

# MySQL config (same as database.py)
MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DB = os.getenv("MYSQL_DB", "ezefloor")


def migrate():
    print("=" * 60)
    print("SQLite -> MySQL Migration")
    print("=" * 60)

    # 1. Connect SQLite
    print(f"\n1. Connecting to SQLite: {SQLITE_PATH}")
    sqlite_conn = sqlite3.connect(SQLITE_PATH)
    sqlite_conn.row_factory = sqlite3.Row

    # 2. Connect MySQL
    print(f"2. Connecting to MySQL: {MYSQL_USER}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}")
    try:
        mysql_conn = pymysql.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DB,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
        )
    except pymysql.err.OperationalError as e:
        print(f"\nERROR: Cannot connect to MySQL: {e}")
        print("\nPlease ensure:")
        print("  1. MySQL Server is installed and running")
        print("  2. Database 'ezefloor' exists (CREATE DATABASE ezefloor CHARACTER SET utf8mb4;)")
        print("  3. Environment variables MYSQL_USER and MYSQL_PASSWORD are set")
        return

    mysql_cursor = mysql_conn.cursor()

    # 3. Create tables in MySQL
    print("\n3. Creating tables in MySQL...")
    mysql_cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            hashed_password VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'user',
            is_active TINYINT NOT NULL DEFAULT 1,
            is_online TINYINT NOT NULL DEFAULT 0,
            status VARCHAR(50) NOT NULL DEFAULT 'active'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ''')

    mysql_cursor.execute('''
        CREATE TABLE IF NOT EXISTS jobs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            project_name VARCHAR(255) NOT NULL,
            room_count INT DEFAULT 0,
            total_area DOUBLE DEFAULT 0,
            data LONGTEXT NOT NULL,
            thumbnail LONGTEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_trained TINYINT DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users (id),
            INDEX idx_user_id (user_id),
            INDEX idx_project (user_id, project_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ''')
    mysql_conn.commit()

    # 4. Migrate users
    print("\n4. Migrating users...")
    sqlite_cursor = sqlite_conn.cursor()
    sqlite_cursor.execute("SELECT * FROM users")
    users = sqlite_cursor.fetchall()
    print(f"   Found {len(users)} users")

    for user in users:
        u = dict(user)
        try:
            mysql_cursor.execute(
                """INSERT INTO users (id, username, email, hashed_password, role, is_active, is_online, status)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   ON DUPLICATE KEY UPDATE username=username""",
                (u["id"], u["username"], u["email"], u["hashed_password"],
                 u.get("role", "user"), u.get("is_active", 1),
                 u.get("is_online", 0), u.get("status", "active"))
            )
        except pymysql.err.IntegrityError:
            print(f"   [skip] User '{u['username']}' already exists")
    mysql_conn.commit()
    print(f"   Users migrated successfully")

    # 5. Migrate jobs
    print("\n5. Migrating jobs...")
    sqlite_cursor.execute("SELECT * FROM jobs")
    jobs = sqlite_cursor.fetchall()
    print(f"   Found {len(jobs)} jobs")

    migrated = 0
    for job in jobs:
        j = dict(job)
        try:
            mysql_cursor.execute(
                """INSERT INTO jobs (id, user_id, project_name, room_count, total_area, data, thumbnail, created_at, is_trained)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON DUPLICATE KEY UPDATE project_name=project_name""",
                (j["id"], j["user_id"], j["project_name"],
                 j.get("room_count", 0), j.get("total_area", 0),
                 j["data"], j.get("thumbnail"),
                 j.get("created_at"), j.get("is_trained", 0))
            )
            migrated += 1
        except pymysql.err.IntegrityError:
            print(f"   [skip] Job #{j['id']} already exists")
        except Exception as e:
            print(f"   [error] Job #{j['id']}: {e}")

    mysql_conn.commit()
    print(f"   {migrated}/{len(jobs)} jobs migrated successfully")

    # 6. Reset auto-increment to continue after max ID
    mysql_cursor.execute("SELECT MAX(id) as max_id FROM users")
    max_user_id = mysql_cursor.fetchone()["max_id"] or 0
    mysql_cursor.execute(f"ALTER TABLE users AUTO_INCREMENT = {max_user_id + 1}")

    mysql_cursor.execute("SELECT MAX(id) as max_id FROM jobs")
    max_job_id = mysql_cursor.fetchone()["max_id"] or 0
    mysql_cursor.execute(f"ALTER TABLE jobs AUTO_INCREMENT = {max_job_id + 1}")
    mysql_conn.commit()

    # Done
    print("\n" + "=" * 60)
    print("Migration complete!")
    print(f"  Users: {len(users)}")
    print(f"  Jobs:  {migrated}")
    print("\nTo switch to MySQL, set environment variable:")
    print("  set DB_TYPE=mysql")
    print("  set MYSQL_PASSWORD=your_password")
    print("=" * 60)

    sqlite_conn.close()
    mysql_conn.close()


if __name__ == "__main__":
    migrate()
