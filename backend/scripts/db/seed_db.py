from database import get_db_connection, init_db
from api.auth import get_password_hash

def seed_db():
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if admin exists
    cursor.execute("SELECT id FROM users WHERE username = ?", ("admin",))
    if not cursor.fetchone():
        admin_pass = get_password_hash("admin123")
        cursor.execute(
            "INSERT INTO users (username, email, hashed_password, role) VALUES (?, ?, ?, ?)",
            ("admin", "admin@ezefloor.ai", admin_pass, "admin")
        )
        print("Admin user created: admin / admin123")
    
    # Check if user exists
    cursor.execute("SELECT id FROM users WHERE username = ?", ("user",))
    if not cursor.fetchone():
        user_pass = get_password_hash("user123")
        cursor.execute(
            "INSERT INTO users (username, email, hashed_password, role) VALUES (?, ?, ?, ?)",
            ("user", "user@ezefloor.ai", user_pass, "user")
        )
        print("Regular user created: user / user123")
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    seed_db()
