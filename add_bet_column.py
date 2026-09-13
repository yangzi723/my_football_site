import sqlite3

conn = sqlite3.connect('football.db')
try:
    conn.execute('ALTER TABLE matches ADD COLUMN bet TEXT DEFAULT "否"')
    conn.commit()
    print('✅ bet 列添加成功')
except sqlite3.OperationalError as e:
    if 'duplicate column' in str(e):
        print('ℹ️ bet 列已存在')
    else:
        print('❌ 错误:', e)
finally:
    conn.close()