import sqlite3
conn = sqlite3.connect('ezefloor.db')
conn.execute("UPDATE users SET status = 'active'")
conn.commit()
conn.close()
print("Successfully approved all database users!")
