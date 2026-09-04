import sqlite3
conn = sqlite3.connect('football.db')
cur = conn.execute("SELECT id, pos1, pos2 FROM matches WHERE id = 你的ID")
row = cur.fetchone()
print(row)
conn.close()