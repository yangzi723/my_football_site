import sqlite3

conn = sqlite3.connect('football.db')
conn.execute("UPDATE fixtures SET league='芬超' WHERE league='芬兰超级联赛'")
conn.execute("UPDATE matches SET league='芬超' WHERE league='芬兰超级联赛'")
conn.commit()
conn.close()
print('更新完成')