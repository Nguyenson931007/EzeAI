import sqlite3
import hashlib

DATABASE_PATH = "ezefloor.db"
SALT = "ezefloor_salt_123"

def get_password_hash(password: str) -> str:
    return hashlib.sha256((password + SALT).encode()).hexdigest()

def create_user(username, password, email, role="user", status="active"):
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    hashed_pwd = get_password_hash(password)
    
    try:
        cursor.execute(
            "INSERT INTO users (username, email, hashed_password, role, status, is_active) VALUES (?, ?, ?, ?, ?, ?)",
            (username, email, hashed_pwd, role, status, 1)
        )
        conn.commit()
        print(f"SUCCESS: Created user '{username}' ({role})")
    except sqlite3.IntegrityError:
        # If exists, update the password
        cursor.execute(
            "UPDATE users SET hashed_password = ?, role = ?, status = ?, is_active = 1 WHERE username = ?",
            (hashed_pwd, role, status, username)
        )
        conn.commit()
        print(f"SUCCESS: Updated existing user '{username}' password.")
    except Exception as e:
        print(f"ERROR: {str(e)}")


    finally:
        conn.close()

if __name__ == "__main__":
    print("--- CREATING ACCOUNTS ---")
    
    # Danh sách tài khoản mẫu (Username, Password, Email, Role)
    users_to_create = [
        ("admin", "admin123", "admin@ezefloor.ai", "admin"),
        ("user01", "123456", "user01@gmail.com", "user"),
        ("test", "test", "test@ezefloor.ai", "user"),
        ("01", "01", "01@ezefloor.ai", "user"),
    ]
    
    for u, p, e, r in users_to_create:
        create_user(u, p, e, r)
