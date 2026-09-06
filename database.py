import sqlite3
from contextlib import closing

DB_PATH = 'football.db'

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with closing(get_db()) as conn:
        # 创建 matches 表（如果不存在）
        conn.execute('''
            CREATE TABLE IF NOT EXISTS matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                time TEXT,
                league TEXT,
                home_team TEXT,
                away_team TEXT,
                home_rank INTEGER,
                home_scored INTEGER,
                home_conceded INTEGER,
                home_recent INTEGER,
                home_wins INTEGER,
                home_draws INTEGER,
                home_losses INTEGER,
                home_injuries INTEGER,
                home_motivation INTEGER,
                home_value REAL,
                away_rank INTEGER,
                away_scored INTEGER,
                away_conceded INTEGER,
                away_recent INTEGER,
                away_wins INTEGER,
                away_draws INTEGER,
                away_losses INTEGER,
                away_injuries INTEGER,
                away_motivation INTEGER,
                away_value REAL,
                home_unexpected TEXT,
                away_unexpected TEXT,
                home_score REAL,
                away_score REAL,
                home_prob REAL,
                draw_prob REAL,
                away_prob REAL,
                judgment TEXT,
                result TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 获取现有列名
        cur = conn.execute("PRAGMA table_info(matches)")
        existing_cols = [row[1] for row in cur.fetchall()]

        # 添加 date, time, league（如果缺失）
        for col in ['date', 'time', 'league']:
            if col not in existing_cols:
                conn.execute(f'ALTER TABLE matches ADD COLUMN {col} TEXT')

        # 添加赔率相关字段
        odds_cols = ['pos1', 'pos2', 'asian_odds', 'range', 'initial_prediction', 'initial_analysis', 'final_analysis']
        for col in odds_cols:
            if col not in existing_cols:
                conn.execute(f'ALTER TABLE matches ADD COLUMN {col} TEXT')

        # 添加 ai_result 列
        if 'ai_result' not in existing_cols:
            conn.execute('ALTER TABLE matches ADD COLUMN ai_result TEXT')

        # 添加 review 列
        if 'review' not in existing_cols:
            conn.execute('ALTER TABLE matches ADD COLUMN review TEXT')

        conn.commit()

    # 初始化其他表
    init_fixtures_table()
    init_odds_table()
    init_user_table()

# ---------- matches 表操作 ----------
def save_match(data):
    with closing(get_db()) as conn:
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO matches (
                date, time, league,
                home_team, away_team,
                home_rank, home_scored, home_conceded, home_recent,
                home_wins, home_draws, home_losses,
                home_injuries, home_motivation, home_value,
                away_rank, away_scored, away_conceded, away_recent,
                away_wins, away_draws, away_losses,
                away_injuries, away_motivation, away_value,
                home_unexpected, away_unexpected,
                home_score, away_score,
                home_prob, draw_prob, away_prob,
                judgment
            ) VALUES (
                :date, :time, :league,
                :home_team, :away_team,
                :home_rank, :home_scored, :home_conceded, :home_recent,
                :home_wins, :home_draws, :home_losses,
                :home_injuries, :home_motivation, :home_value,
                :away_rank, :away_scored, :away_conceded, :away_recent,
                :away_wins, :away_draws, :away_losses,
                :away_injuries, :away_motivation, :away_value,
                :home_unexpected, :away_unexpected,
                :home_score, :away_score,
                :home_prob, :draw_prob, :away_prob,
                :judgment
            )
        ''', data)
        conn.commit()
        return cur.lastrowid
def get_all_matches(limit=100, offset=0, date_filter=None, league_filter=None):
    with closing(get_db()) as conn:
        cur = conn.cursor()
        sql = 'SELECT * FROM matches'
        conditions = []
        params = []
        if date_filter:
            conditions.append("date = ?")
            params.append(date_filter)
        if league_filter:
            conditions.append("league LIKE ?")
            params.append('%' + league_filter + '%')
        if conditions:
            sql += ' WHERE ' + ' AND '.join(conditions)
        sql += ' ORDER BY date DESC, time ASC LIMIT ? OFFSET ?'
        params.extend([limit, offset])
        cur.execute(sql, params)
        return cur.fetchall()

def get_all_matches_count(date_filter=None, league_filter=None):
    with closing(get_db()) as conn:
        cur = conn.cursor()
        sql = 'SELECT COUNT(*) as total FROM matches'
        conditions = []
        params = []
        if date_filter:
            conditions.append("date = ?")
            params.append(date_filter)
        if league_filter:
            conditions.append("league LIKE ?")
            params.append('%' + league_filter + '%')
        if conditions:
            sql += ' WHERE ' + ' AND '.join(conditions)
        cur.execute(sql, params)
        return cur.fetchone()['total']
def get_match_by_id(match_id):
    with closing(get_db()) as conn:
        cur = conn.cursor()
        cur.execute('SELECT * FROM matches WHERE id = ?', (match_id,))
        return cur.fetchone()

def update_match_result(match_id, result):
    with closing(get_db()) as conn:
        conn.execute('UPDATE matches SET result = ? WHERE id = ?', (result, match_id))
        conn.commit()

def delete_match(match_id):
    with closing(get_db()) as conn:
        conn.execute('DELETE FROM matches WHERE id = ?', (match_id,))
        conn.commit()

def update_match_full(match_id, data):
    # 为可能缺失的字段设置默认值，避免参数绑定错误
    data.setdefault('pos1', '')
    data.setdefault('pos2', '')
    data.setdefault('asian_odds', '')
    data.setdefault('range', '')
    data.setdefault('initial_prediction', '')
    data.setdefault('initial_analysis', '')
    data.setdefault('final_analysis', '')
    data.setdefault('ai_result', '')
    data.setdefault('review', '')   # review 字段默认值

    with closing(get_db()) as conn:
        conn.execute('''
            UPDATE matches SET
                date = :date,
                time = :time,
                league = :league,
                home_team = :home_team,
                away_team = :away_team,
                home_rank = :home_rank,
                home_scored = :home_scored,
                home_conceded = :home_conceded,
                home_recent = :home_recent,
                home_wins = :home_wins,
                home_draws = :home_draws,
                home_losses = :home_losses,
                home_injuries = :home_injuries,
                home_motivation = :home_motivation,
                home_value = :home_value,
                away_rank = :away_rank,
                away_scored = :away_scored,
                away_conceded = :away_conceded,
                away_recent = :away_recent,
                away_wins = :away_wins,
                away_draws = :away_draws,
                away_losses = :away_losses,
                away_injuries = :away_injuries,
                away_motivation = :away_motivation,
                away_value = :away_value,
                home_unexpected = :home_unexpected,
                away_unexpected = :away_unexpected,
                home_score = :home_score,
                away_score = :away_score,
                home_prob = :home_prob,
                draw_prob = :draw_prob,
                away_prob = :away_prob,
                judgment = :judgment,
                result = :result,
                pos1 = :pos1,
                pos2 = :pos2,
                asian_odds = :asian_odds,
                range = :range,
                initial_analysis = :initial_analysis,
                final_analysis = :final_analysis,
                initial_prediction = :initial_prediction,
                ai_result = :ai_result,
                review = :review
            WHERE id = :id
        ''', {**data, 'id': match_id})
        conn.commit()

def get_statistics():
    with closing(get_db()) as conn:
        cur = conn.cursor()
        cur.execute('SELECT COUNT(*) as total FROM matches')
        total = cur.fetchone()['total']
        cur.execute('''
            SELECT result, COUNT(*) as cnt
            FROM matches
            WHERE result IS NOT NULL
            GROUP BY result
        ''')
        result_counts = cur.fetchall()
        cur.execute('''
            SELECT judgment,
                   COUNT(*) as total,
                   SUM(CASE WHEN result='红' THEN 1 ELSE 0 END) as red,
                   SUM(CASE WHEN result='黑' THEN 1 ELSE 0 END) as black,
                   SUM(CASE WHEN result='走盘' THEN 1 ELSE 0 END) as draw
            FROM matches
            WHERE result IS NOT NULL
            GROUP BY judgment
        ''')
        judgment_stats = cur.fetchall()
        return {
            'total': total,
            'result_counts': result_counts,
            'judgment_stats': judgment_stats
        }

# ---------- fixtures 表 ----------
def init_fixtures_table():
    with closing(get_db()) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS fixtures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT,
                time TEXT,
                league TEXT,
                home_team TEXT,
                away_team TEXT,
                score TEXT,
                analyzed INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(date, home_team, away_team)
            )
        ''')
        cur = conn.execute("PRAGMA table_info(fixtures)")
        existing_cols = [row[1] for row in cur.fetchall()]
        if 'analyzed' not in existing_cols:
            conn.execute('ALTER TABLE fixtures ADD COLUMN analyzed INTEGER DEFAULT 0')
        conn.commit()

def save_fixtures(fixtures_list):
    with closing(get_db()) as conn:
        cur = conn.cursor()
        for f in fixtures_list:
            cur.execute('''
                INSERT OR IGNORE INTO fixtures (date, time, league, home_team, away_team, score, analyzed)
                VALUES (:date, :time, :league, :home_team, :away_team, :score, 0)
            ''', f)
        conn.commit()

def get_fixtures_by_date(date):
    with closing(get_db()) as conn:
        cur = conn.cursor()
        cur.execute('SELECT * FROM fixtures WHERE date = ? ORDER BY time', (date,))
        return cur.fetchall()

def get_all_fixtures(date_filter=None, limit=20, offset=0):
    with closing(get_db()) as conn:
        cur = conn.cursor()
        sql = 'SELECT * FROM fixtures'
        params = []
        if date_filter:
            sql += ' WHERE date = ?'
            params.append(date_filter)
        sql += ' ORDER BY date DESC, time LIMIT ? OFFSET ?'
        params.extend([limit, offset])
        cur.execute(sql, params)
        return cur.fetchall()

def count_fixtures(date_filter=None):
    with closing(get_db()) as conn:
        cur = conn.cursor()
        sql = 'SELECT COUNT(*) as total FROM fixtures'
        params = []
        if date_filter:
            sql += ' WHERE date = ?'
            params.append(date_filter)
        cur.execute(sql, params)
        return cur.fetchone()['total']

def get_fixture_by_id(fid):
    with closing(get_db()) as conn:
        cur = conn.cursor()
        cur.execute('SELECT * FROM fixtures WHERE id = ?', (fid,))
        return cur.fetchone()

def update_fixture(fid, data):
    with closing(get_db()) as conn:
        conn.execute('''
            UPDATE fixtures SET
                date=:date, time=:time, league=:league,
                home_team=:home_team, away_team=:away_team,
                score=:score, analyzed=:analyzed
            WHERE id=:id
        ''', {**data, 'id': fid})
        conn.commit()

def delete_fixture(fid):
    with closing(get_db()) as conn:
        conn.execute('DELETE FROM fixtures WHERE id = ?', (fid,))
        conn.commit()

def add_fixture(data):
    with closing(get_db()) as conn:
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO fixtures (date, time, league, home_team, away_team, score, analyzed)
            VALUES (:date, :time, :league, :home_team, :away_team, :score, 0)
        ''', data)
        conn.commit()
        return cur.lastrowid

# ---------- odds 表 ----------
def init_odds_table():
    with closing(get_db()) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS odds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                home_team TEXT,
                away_team TEXT,
                home_odds REAL,
                draw_odds REAL,
                away_odds REAL,
                prediction TEXT,
                result TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()

def save_odds(data):
    with closing(get_db()) as conn:
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO odds (home_team, away_team, home_odds, draw_odds, away_odds, prediction)
            VALUES (:home_team, :away_team, :home_odds, :draw_odds, :away_odds, :prediction)
        ''', data)
        conn.commit()
        return cur.lastrowid

# ---------- 用户表 ----------
def init_user_table():
    with closing(get_db()) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_admin INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()

def get_user_by_username(username):
    with closing(get_db()) as conn:
        cur = conn.execute('SELECT * FROM users WHERE username = ?', (username,))
        return cur.fetchone()

def get_user_by_id(user_id):
    with closing(get_db()) as conn:
        cur = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,))
        return cur.fetchone()

def create_user(username, password_hash, is_admin=0):
    with closing(get_db()) as conn:
        cur = conn.execute(
            'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)',
            (username, password_hash, is_admin)
        )
        conn.commit()
        return cur.lastrowid

def delete_user_by_id(user_id):
    with closing(get_db()) as conn:
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()

def update_user_password(user_id, new_password_hash):
    with closing(get_db()) as conn:
        conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_password_hash, user_id))
        conn.commit()

def update_user_admin(user_id, is_admin):
    with closing(get_db()) as conn:
        conn.execute('UPDATE users SET is_admin = ? WHERE id = ?', (1 if is_admin else 0, user_id))
        conn.commit()

def get_all_users():
    with closing(get_db()) as conn:
        cur = conn.execute('SELECT * FROM users ORDER BY id')
        return cur.fetchall()

if __name__ == '__main__':
    init_db()
    print('数据库初始化完成。')