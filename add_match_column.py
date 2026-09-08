import sqlite3

conn = sqlite3.connect('football.db')
try:
    conn.execute('ALTER TABLE matches ADD COLUMN fundamental_match TEXT DEFAULT "否"')
    conn.commit()
    print('✅ 列添加成功')
except sqlite3.OperationalError as e:
    if 'duplicate column name' in str(e):
        print('ℹ️ 列已存在，无需添加')
    else:
        print('❌ 错误:', e)
finally:
    conn.close()