import sqlite3

# 检查 footbal 数据库
try:
    conn = sqlite3.connect('footbal')
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
    print("footbal 数据库中的表名:", [t[0] for t in tables])
    conn.close()
except Exception as e:
    print("footbal 数据库出错:", e)

# 检查 matches 数据库
try:
    conn = sqlite3.connect('matches')
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
    print("matches 数据库中的表名:", [t[0] for t in tables])
    conn.close()
except Exception as e:
    print("matches 数据库出错:", e)