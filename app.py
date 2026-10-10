from flask import Flask, request, jsonify, render_template
from database import (
    init_db, save_match, get_all_matches, get_match_by_id,
    update_match_result, get_statistics, delete_match, update_match_full,
    save_fixtures, get_fixtures_by_date, get_all_fixtures,
    get_fixture_by_id, update_fixture, delete_fixture, add_fixture,
    save_odds, count_fixtures, get_all_matches_count, get_db
)
from datetime import datetime
import traceback

app = Flask(__name__)

# 初始化数据库
init_db()


# ============================================================
# 数据源隔离：自动迁移 + 辅助函数
# ============================================================
def migrate_add_source():
    """给 matches 表添加 source 字段（如果不存在），旧数据默认归为 'odds'"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(matches)")
        cols = [row[1] for row in cur.fetchall()]
        if 'source' not in cols:
            conn.execute("ALTER TABLE matches ADD COLUMN source TEXT NOT NULL DEFAULT 'odds'")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_matches_source ON matches(source)")
            conn.commit()
            print("✅ matches 表已添加 source 字段，旧数据归为 'odds'")
        else:
            print("ℹ️ matches 表 source 字段已存在")

migrate_add_source()
def migrate_add_value():
    """给 matches 表添加 value 字段（如果不存在）"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(matches)")
        cols = [row[1] for row in cur.fetchall()]
        if 'value' not in cols:
            conn.execute("ALTER TABLE matches ADD COLUMN value TEXT DEFAULT ''")
            conn.commit()
            print("✅ matches 表已添加 value 字段")
        else:
            print("ℹ️ matches 表 value 字段已存在")

migrate_add_value()

def get_source():
    """获取当前请求的数据来源：'odds'（默认）或 'ai'"""
    src = request.args.get('source', 'odds')
    return 'ai' if src == 'ai' else 'odds'
def migrate_add_stake():
    """给 matches 表添加 stake 字段（如果不存在），默认 0"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(matches)")
        cols = [row[1] for row in cur.fetchall()]
        if 'stake' not in cols:
            conn.execute("ALTER TABLE matches ADD COLUMN stake REAL DEFAULT 0")
            conn.commit()
            print("✅ matches 表已添加 stake 字段")
        else:
            print("ℹ️ matches 表 stake 字段已存在")

migrate_add_stake()
def migrate_add_odds():
    """给 matches 表添加 odds 字段（如果不存在），默认 0"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(matches)")
        cols = [row[1] for row in cur.fetchall()]
        if 'odds' not in cols:
            conn.execute("ALTER TABLE matches ADD COLUMN odds REAL DEFAULT 0")
            conn.commit()
            print("✅ matches 表已添加 odds 字段")
        else:
            print("ℹ️ matches 表 odds 字段已存在")

migrate_add_odds()

# ---------- 页面路由 ----------

@app.route('/index')
def index():
    return render_template('index.html')

@app.route('/history')
def history():
    return render_template('history.html')

@app.route('/stats')
def stats():
    return render_template('stats.html')

@app.route('/fixtures')
def fixtures():
    return render_template('fixtures.html')

@app.route('/odds')
def odds():
    return render_template('odds.html')

@app.route('/red_list')
def red_list():
    return render_template('red_list.html')

@app.route('/black_list')
def black_list():
    return render_template('black_list.html')

@app.route('/draw_list')
def draw_list():
    return render_template('draw_list.html')

@app.route('/pending_list')
def pending_list():
    return render_template('pending_list.html')

@app.route('/all_list')
def all_list():
    return render_template('all_list.html')

@app.route('/ai_prediction')
def ai_prediction():
    return render_template('ai_prediction.html')

@app.route('/ai_stats')
def ai_stats():
    return render_template('ai_stats.html')

@app.route('/ai_value_stats')
def ai_value_stats():
    return render_template('ai_value_stats.html')

@app.route('/ai_profit_stats')
def ai_profit_stats():
    return render_template('ai_profit_stats.html')


# ---------- API：保存预测记录 ----------
@app.route('/api/save', methods=['POST'])
def api_save():
    src = get_source()
    try:
        data = request.get_json()
        if data is None:
            return jsonify({'error': '请求体不是JSON'}), 400

        required = ['home_team', 'away_team', 'home_score', 'away_score', 'judgment']
        missing = [f for f in required if f not in data]
        if missing:
            return jsonify({'error': f'缺少字段: {", ".join(missing)}'}), 400

        match_data = {
            'date': data.get('date', ''),
            'time': data.get('time', ''),
            'league': data.get('league', ''),
            'home_team': data.get('home_team', ''),
            'away_team': data.get('away_team', ''),
            'home_rank': int(data.get('home_rank', 0)),
            'home_scored': int(data.get('home_scored', 0)),
            'home_conceded': int(data.get('home_conceded', 0)),
            'home_recent': int(data.get('home_recent', 0)),
            'home_wins': int(data.get('home_wins', 0)),
            'home_draws': int(data.get('home_draws', 0)),
            'home_losses': int(data.get('home_losses', 0)),
            'home_injuries': int(data.get('home_injuries', 0)),
            'home_motivation': int(data.get('home_motivation', 3)),
            'home_value': float(data.get('home_value', 0)),
            'away_rank': int(data.get('away_rank', 0)),
            'away_scored': int(data.get('away_scored', 0)),
            'away_conceded': int(data.get('away_conceded', 0)),
            'away_recent': int(data.get('away_recent', 0)),
            'away_wins': int(data.get('away_wins', 0)),
            'away_draws': int(data.get('away_draws', 0)),
            'away_losses': int(data.get('away_losses', 0)),
            'away_injuries': int(data.get('away_injuries', 0)),
            'away_motivation': int(data.get('away_motivation', 3)),
            'away_value': float(data.get('away_value', 0)),
            'home_unexpected': data.get('home_unexpected', ''),
            'away_unexpected': data.get('away_unexpected', ''),
            'home_score': float(data.get('home_score', 0)),
            'away_score': float(data.get('away_score', 0)),
            'home_prob': float(data.get('home_prob', 0)),
            'draw_prob': float(data.get('draw_prob', 0)),
            'away_prob': float(data.get('away_prob', 0)),
            'judgment': data.get('judgment', 'equal'),
            'value': data.get('value', ''),
            'stake': float(data.get('stake', 0)),
            'odds': float(data.get('odds', 0)),
            'h2h_home_wins': int(data.get('h2h_home_wins', 0)),
            'h2h_draws': int(data.get('h2h_draws', 0)),
            'h2h_away_wins': int(data.get('h2h_away_wins', 0)),
            'home_injury_info': data.get('home_injury_info', ''),   # ★ 新增
            'away_injury_info': data.get('away_injury_info', ''),   # ★ 新增
            'source': src,
        }

        with get_db() as conn:
            conn.execute(
                'DELETE FROM matches WHERE date = ? AND home_team = ? AND away_team = ? AND source = ?',
                (match_data['date'], match_data['home_team'], match_data['away_team'], src)
            )
            conn.commit()

        with get_db() as conn:
            cols = ', '.join(match_data.keys())
            placeholders = ', '.join('?' for _ in match_data)
            cur = conn.execute(
                f'INSERT INTO matches ({cols}) VALUES ({placeholders})',
                list(match_data.values())
            )
            conn.commit()
            match_id = cur.lastrowid

        return jsonify({'success': True, 'id': match_id, 'updated': True})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- API：历史记录 ----------
@app.route('/api/history')
def api_history():
    src = get_source()
    date_filter = request.args.get('date')
    league_filter = request.args.get('league')
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)

    conditions = ['source = ?']
    params = [src]
    if date_filter:
        conditions.append('date = ?')
        params.append(date_filter)
    if league_filter:
        conditions.append('league = ?')
        params.append(league_filter)
    where_sql = ' AND '.join(conditions)

    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                f'SELECT * FROM matches WHERE {where_sql} ORDER BY id DESC LIMIT ? OFFSET ?',
                params + [limit, offset]
            )
            rows = cur.fetchall()
            cur.execute(
                f'SELECT COUNT(*) FROM matches WHERE {where_sql}',
                params
            )
            total = cur.fetchone()[0]
        return jsonify({
            'data': [dict(row) for row in rows],
            'total': total,
            'limit': limit,
            'offset': offset
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/match/<int:match_id>', methods=['GET'])
def api_get_match(match_id):
    src = get_source()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT * FROM matches WHERE id = ? AND source = ?', (match_id, src))
        row = cur.fetchone()
    if not row:
        return jsonify({'error': '记录不存在'}), 404
    return jsonify(dict(row))


@app.route('/api/match/<int:match_id>/result', methods=['PUT'])
def api_update_result(match_id):
    src = get_source()
    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不是JSON'}), 400

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id FROM matches WHERE id = ? AND source = ?', (match_id, src))
        if not cur.fetchone():
            return jsonify({'error': '记录不存在或无权修改'}), 403

    if 'result' in data:
        result = data.get('result')
        if result not in ('红', '黑', '走盘', None):
            return jsonify({'error': '结果必须是 红/黑/走盘 或 null'}), 400
        update_match_result(match_id, result)

    if 'value' in data:
        value = data.get('value')
        if value not in ('红', '黑', '走盘', None):
            return jsonify({'error': '价值必须是 红/黑/走盘 或 null'}), 400
        with get_db() as conn:
            conn.execute(
                'UPDATE matches SET value = ? WHERE id = ? AND source = ?',
                (value, match_id, src)
            )
            conn.commit()

    if 'stake' in data:
        try:
            stake = float(data.get('stake') or 0)
        except (ValueError, TypeError):
            stake = 0
        with get_db() as conn:
            conn.execute(
                'UPDATE matches SET stake = ? WHERE id = ? AND source = ?',
                (stake, match_id, src)
            )
            conn.commit()

    if 'odds' in data:
        try:
            odds = float(data.get('odds') or 0)
        except (ValueError, TypeError):
            odds = 0
        with get_db() as conn:
            conn.execute(
                'UPDATE matches SET odds = ? WHERE id = ? AND source = ?',
                (odds, match_id, src)
            )
            conn.commit()

    return jsonify({'success': True})


@app.route('/api/match/<int:match_id>', methods=['PUT'])
def api_update_match(match_id):
    src = get_source()
    data = request.get_json()
    if data is None:
        return jsonify({'error': '请求体不是JSON'}), 400
    if 'home_team' not in data or 'away_team' not in data:
        return jsonify({'error': '缺少 home_team 或 away_team'}), 400

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id FROM matches WHERE id = ? AND source = ?', (match_id, src))
        if not cur.fetchone():
            return jsonify({'error': '记录不存在或无权修改'}), 403

    data.pop('id', None)
    data.pop('source', None)

    data.setdefault('date', '')
    data.setdefault('time', '')
    data.setdefault('league', '')
    data.setdefault('home_unexpected', '')
    data.setdefault('away_unexpected', '')
    data.setdefault('result', '')
    data.setdefault('value', '')
    data.setdefault('stake', 0)
    data.setdefault('odds', 0)
    data.setdefault('judgment', 'equal')
    data.setdefault('pos1', '')
    data.setdefault('pos2', '')
    data.setdefault('asian_odds', '')
    data.setdefault('range', '')
    data.setdefault('initial_prediction', '')
    data.setdefault('initial_analysis', '')
    data.setdefault('final_analysis', '')
    data.setdefault('odds_structure', '')
    data.setdefault('ai_result', '')
    data.setdefault('review', '')
    data.setdefault('bet', '否')
    data.setdefault('h2h_home_wins', 0)
    data.setdefault('h2h_draws', 0)
    data.setdefault('h2h_away_wins', 0)
    data.setdefault('home_injury_info', '')     # ★ 新增
    data.setdefault('away_injury_info', '')     # ★ 新增

    numeric_fields = ['home_rank', 'home_scored', 'home_conceded', 'home_recent',
                      'home_wins', 'home_draws', 'home_losses', 'home_injuries',
                      'home_motivation', 'home_value', 'away_rank', 'away_scored',
                      'away_conceded', 'away_recent', 'away_wins', 'away_draws',
                      'away_losses', 'away_injuries', 'away_motivation', 'away_value',
                      'home_score', 'away_score', 'home_prob', 'draw_prob', 'away_prob',
                      'h2h_home_wins', 'h2h_draws', 'h2h_away_wins']
    for field in numeric_fields:
        if field in data and data[field] is not None:
            try:
                data[field] = float(data[field]) if 'prob' in field or 'value' in field else int(data[field])
            except (ValueError, TypeError):
                data[field] = 0
        else:
            data[field] = 0

    try:
        update_match_full(match_id, data)
        return jsonify({'success': True})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/match/<int:match_id>', methods=['DELETE'])
def api_delete_match(match_id):
    src = get_source()
    try:
        with get_db() as conn:
            conn.execute('DELETE FROM matches WHERE id = ? AND source = ?', (match_id, src))
            conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- API：统计 ----------
@app.route('/api/stats')
def api_stats():
    src = get_source()
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute('SELECT COUNT(*) FROM matches WHERE source = ?', (src,))
            total = cur.fetchone()[0]

            cur.execute(
                '''SELECT result, COUNT(*) as cnt FROM matches
                   WHERE source = ? AND result IN ('红', '黑', '走盘')
                   GROUP BY result''',
                (src,)
            )
            result_counts = [{'result': row['result'], 'cnt': row['cnt']} for row in cur.fetchall()]

        return jsonify({
            'total': total,
            'result_counts': result_counts,
            'judgment_stats': []
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- fixtures API ----------

@app.route('/api/fetch_matches', methods=['GET'])
def api_fetch_matches():
    date_str = request.args.get('date')
    if not date_str:
        date_str = datetime.now().strftime('%Y-%m-%d')
    include_finished = request.args.get('include_finished', 'false').lower() == 'true'
    force = request.args.get('force', 'false').lower() == 'true'

    try:
        datetime.strptime(date_str, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': '日期格式无效，请使用 YYYY-MM-DD'}), 400

    if force:
        with get_db() as conn:
            conn.execute('DELETE FROM fixtures WHERE date = ?', (date_str,))
            conn.commit()

    cached = get_fixtures_by_date(date_str)
    if cached and not force:
        return jsonify([dict(row) for row in cached])

    try:
        from jczq_keywords0830 import JczqChineseScraper
    except ImportError as e:
        return jsonify({'error': f'爬虫模块未找到: {str(e)}'}), 500

    try:
        scraper = JczqChineseScraper()
        all_matches = []
        playids = [270, 271, 272]
        for playid in playids:
            for g in [2, 1]:
                try:
                    url = f"{scraper.base_url}?playid={playid}&g={g}&date={date_str}"
                    resp = scraper.session.get(url, timeout=15)
                    resp.encoding = 'gb2312'
                    if resp.text:
                        matches = scraper.parse_html(resp.text, date_str)
                        all_matches.extend(matches)
                except Exception:
                    continue

        if include_finished:
            for status in ['0', '1']:
                for playid in playids:
                    try:
                        url = f"{scraper.base_url}?playid={playid}&g=2&date={date_str}&status={status}"
                        resp = scraper.session.get(url, timeout=15)
                        resp.encoding = 'gb2312'
                        if resp.text:
                            matches = scraper.parse_html(resp.text, date_str)
                            all_matches.extend(matches)
                    except Exception:
                        continue

        seen = set()
        unique = []
        for m in all_matches:
            key = (m.get('比赛日期', ''), m.get('主队VS客队', ''))
            if key not in seen:
                seen.add(key)
                unique.append(m)

        if not unique:
            return jsonify([])

        LEAGUE_NAME_MAP = {'芬兰超级联赛': '芬超'}

        fixtures = []
        for m in unique:
            matchup = m.get('主队VS客队', '')
            home, away = '', ''
            if ' VS ' in matchup:
                parts = matchup.split(' VS ')
                home = parts[0].strip()
                away = parts[1].strip()
            raw_league = m.get('联赛', '')
            league = LEAGUE_NAME_MAP.get(raw_league, raw_league)
            fixtures.append({
                'date': m.get('比赛日期', ''),
                'time': m.get('比赛时间', ''),
                'league': league,
                'home_team': home,
                'away_team': away,
                'score': m.get('比分', '')
            })
        save_fixtures(fixtures)
        return jsonify(fixtures)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'抓取失败: {str(e)}'}), 500


@app.route('/api/fixtures')
def api_get_fixtures():
    date_filter = request.args.get('date')
    league_filter = request.args.get('league')
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)
    try:
        fixtures = get_all_fixtures(date_filter, league_filter, limit, offset)
        total = count_fixtures(date_filter, league_filter)
        return jsonify({
            'data': [dict(row) for row in fixtures],
            'total': total,
            'limit': limit,
            'offset': offset
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/fixtures/<int:fid>', methods=['GET', 'PUT', 'DELETE'])
def api_fixture_detail(fid):
    if request.method == 'GET':
        f = get_fixture_by_id(fid)
        if not f:
            return jsonify({'error': '赛事不存在'}), 404
        return jsonify(dict(f))
    elif request.method == 'PUT':
        data = request.get_json()
        if not data:
            return jsonify({'error': '请求体不是JSON'}), 400
        existing = get_fixture_by_id(fid)
        if not existing:
            return jsonify({'error': '赛事不存在'}), 404
        existing_dict = dict(existing)
        for key in ['date', 'time', 'league', 'home_team', 'away_team', 'score', 'analyzed']:
            if key in data:
                existing_dict[key] = data[key]
        try:
            update_fixture(fid, existing_dict)
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    elif request.method == 'DELETE':
        try:
            delete_fixture(fid)
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500


@app.route('/api/fixtures', methods=['POST'])
def api_add_fixture():
    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不是JSON'}), 400
    required = ['date', 'time', 'league', 'home_team', 'away_team']
    for f in required:
        if f not in data or not data[f]:
            return jsonify({'error': f'缺少字段: {f}'}), 400
    try:
        fid = add_fixture(data)
        return jsonify({'success': True, 'id': fid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/match/find', methods=['GET'])
def api_find_match():
    src = get_source()
    date = request.args.get('date')
    home_team = request.args.get('home_team')
    away_team = request.args.get('away_team')
    if not date or not home_team or not away_team:
        return jsonify({'error': '缺少参数: date, home_team, away_team'}), 400
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            '''SELECT * FROM matches
               WHERE date = ? AND home_team = ? AND away_team = ? AND source = ?
               ORDER BY id DESC LIMIT 1''',
            (date, home_team, away_team, src)
        )
        row = cur.fetchone()
        if row:
            return jsonify(dict(row))
        else:
            return jsonify(None), 200

@app.route('/api/ai_predictions')
def api_ai_predictions():
    """返回所有 AI 记录的 (date, home_team, away_team, initial_prediction) 列表"""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                '''SELECT date, home_team, away_team, initial_prediction
                   FROM matches WHERE source = ?''',
                ('ai',)
            )
            rows = cur.fetchall()
        result = []
        for row in rows:
            result.append({
                'date': row['date'] or '',
                'home_team': row['home_team'] or '',
                'away_team': row['away_team'] or '',
                'initial_prediction': row['initial_prediction'] or ''
            })
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
# ---------- 权重学习接口 ----------
@app.route('/weight_learning')
def weight_learning():
    return render_template('weight_learning.html')


@app.route('/api/weight_analysis')
def api_weight_analysis():
    """基于历史数据，用因子差值与比赛结果的相关性，给出建议权重"""
    try:
        src = get_source()

        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                '''SELECT home_rank, home_scored, home_conceded, home_recent,
                          home_wins, home_draws, home_losses,
                          home_injuries, home_motivation, home_value,
                          away_rank, away_scored, away_conceded, away_recent,
                          away_wins, away_draws, away_losses,
                          away_injuries, away_motivation, away_value,
                          h2h_home_wins, h2h_draws, h2h_away_wins,
                          result
                   FROM matches
                   WHERE source = ? AND result IN ('红', '黑', '走盘')''',
                (src,)
            )
            rows = cur.fetchall()

        total = len(rows)
        if total < 30:
            return jsonify({
                'success': False,
                'total': total,
                'error': f'样本量不足（当前 {total} 条，至少需要 30 条已出结果的记录）'
            })

        # ---- 因子计算（与前端 index-scoring.js 保持一致） ----
        LEAGUE_AVG_S = 1.5
        LEAGUE_AVG_C = 1.5
        LEAGUE_AVG_V = 70.0

        def rank_score(rank):
            rank = int(rank or 0) or 10
            if rank <= 1: return 100.0
            if rank >= 20: return 0.0
            return max(0.0, 100.0 - (rank - 1) * (100.0 / 19.0))

        def goal_score(gs, gc):
            gs = float(gs or 0); gc = float(gc or 0)
            attack = min(100.0, (gs / LEAGUE_AVG_S) * 50.0)
            defense = min(100.0, max(0.0, 1 - gc / LEAGUE_AVG_C) * 50.0)
            return (attack + defense) / 2.0

        def form_score(recent):
            recent = float(recent or 0)
            return min(100.0, (recent / 9.0) * 100.0)

        def ha_score(w, d, l):
            w = float(w or 0); d = float(d or 0); l = float(l or 0)
            tot = w + d + l
            return 50.0 if tot == 0 else (w / tot) * 100.0

        def personnel_score(inj):
            inj = float(inj or 0)
            return max(0.0, 100.0 - min(100.0, inj * 10))

        def motivation_score(level):
            level = int(level or 3)
            return min(100.0, level * 20.0)

        def value_score(v):
            v = float(v or 0)
            return min(100.0, (v / LEAGUE_AVG_V) * 50.0)

        def h2h_score(wins, draws, losses):
            wins = float(wins or 0); draws = float(draws or 0); losses = float(losses or 0)
            tot = wins + draws + losses
            if tot == 0: return 50.0
            return ((wins * 3 + draws * 1) / (tot * 3.0)) * 100.0

        # ---- 收集每个因子的差值 + 结果 ----
        factor_names = ['strength', 'form', 'home_away', 'personnel',
                        'motivation', 'value', 'h2h']
        factor_data = {k: [] for k in factor_names}   # [(diff, target), ...]
        result_counts = {'红': 0, '黑': 0, '走盘': 0}

        for r in rows:
            result_counts[r['result']] = result_counts.get(r['result'], 0) + 1

            # 目标值：红=1，走盘=0.5，黑=0
            if r['result'] == '红':
                target = 1.0
            elif r['result'] == '走盘':
                target = 0.5
            else:
                target = 0.0

            # 实力差值
            h_strength = 0.5 * rank_score(r['home_rank']) + 0.5 * goal_score(r['home_scored'], r['home_conceded'])
            a_strength = 0.5 * rank_score(r['away_rank']) + 0.5 * goal_score(r['away_scored'], r['away_conceded'])
            factor_data['strength'].append((h_strength - a_strength, target))

            # 状态
            h_form = form_score(r['home_recent'])
            a_form = form_score(r['away_recent'])
            factor_data['form'].append((h_form - a_form, target))

            # 主客场
            h_ha = ha_score(r['home_wins'], r['home_draws'], r['home_losses'])
            a_ha = ha_score(r['away_wins'], r['away_draws'], r['away_losses'])
            factor_data['home_away'].append((h_ha - a_ha, target))

            # 人员
            h_pers = personnel_score(r['home_injuries'])
            a_pers = personnel_score(r['away_injuries'])
            factor_data['personnel'].append((h_pers - a_pers, target))

            # 战意
            h_mot = motivation_score(r['home_motivation'])
            a_mot = motivation_score(r['away_motivation'])
            factor_data['motivation'].append((h_mot - a_mot, target))

            # 身价
            h_val = value_score(r['home_value'])
            a_val = value_score(r['away_value'])
            factor_data['value'].append((h_val - a_val, target))

            # 交战（主队视角）
            h2h_h = h2h_score(r['h2h_home_wins'], r['h2h_draws'], r['h2h_away_wins'])
            h2h_a = h2h_score(r['h2h_away_wins'], r['h2h_draws'], r['h2h_home_wins'])
            factor_data['h2h'].append((h2h_h - h2h_a, target))

        # ---- 计算每个因子的预测力 = |Pearson 相关系数| ----
        def pearson(xs, ys):
            n = len(xs)
            if n < 2: return 0.0
            mx = sum(xs) / n
            my = sum(ys) / n
            num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
            dx = sum((x - mx) ** 2 for x in xs) ** 0.5
            dy = sum((y - my) ** 2 for y in ys) ** 0.5
            if dx == 0 or dy == 0: return 0.0
            return num / (dx * dy)

        strengths = {}
        for k in factor_names:
            pairs = factor_data[k]
            xs = [p[0] for p in pairs]
            ys = [p[1] for p in pairs]
            r_val = pearson(xs, ys)
            strengths[k] = abs(r_val)   # 取绝对值，正相关/负相关都算预测力

        total_strength = sum(strengths.values())
        if total_strength == 0:
            weights = {k: 1.0 / len(factor_names) for k in factor_names}
        else:
            weights = {k: strengths[k] / total_strength for k in factor_names}

        # 归一化到整数（百分制，总和 = 100）
        scaled = {k: v * 100 for k, v in weights.items()}
        # 四舍五入
        int_w = {k: int(round(v)) for k, v in scaled.items()}
        # 修正总和到 100
        diff = 100 - sum(int_w.values())
        if diff != 0:
            # 把差值加到最大值上
            top = max(int_w, key=int_w.get)
            int_w[top] += diff

        # 按预测力排序输出
        sorted_factors = sorted(strengths.items(), key=lambda x: -x[1])

        return jsonify({
            'success': True,
            'total': total,
            'result_counts': result_counts,
            'strengths': {k: round(v, 4) for k, v in strengths.items()},
            'weights': int_w,
            'sorted': [{'key': k, 'strength': round(v, 4)} for k, v in sorted_factors]
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500
# ---------- odds API ----------
@app.route('/api/odds/save', methods=['POST'])
def api_odds_save():
    try:
        data = request.get_json()
        if data is None:
            return jsonify({'error': '请求体不是JSON'}), 400
        required = ['home_team', 'away_team', 'home_odds', 'draw_odds', 'away_odds', 'prediction']
        missing = [f for f in required if f not in data]
        if missing:
            return jsonify({'error': f'缺少字段: {", ".join(missing)}'}), 400
        odds_data = {
            'home_team': data['home_team'],
            'away_team': data['away_team'],
            'home_odds': float(data['home_odds']),
            'draw_odds': float(data['draw_odds']),
            'away_odds': float(data['away_odds']),
            'prediction': data['prediction']
        }
        odds_id = save_odds(odds_data)
        return jsonify({'success': True, 'id': odds_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ---------- CSV 导出接口 ----------
@app.route('/api/export_matches_csv')
def api_export_matches_csv():
    """导出 matches 记录为 CSV 文件，支持按 date / league 筛选"""
    import csv
    import io
    from flask import Response

    try:
        src = get_source()
        date_filter = request.args.get('date')
        league_filter = request.args.get('league')

        conditions = ['source = ?']
        params = [src]
        if date_filter:
            conditions.append('date = ?')
            params.append(date_filter)
        if league_filter:
            conditions.append('league = ?')
            params.append(league_filter)
        where_sql = ' AND '.join(conditions)

        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(f'SELECT * FROM matches WHERE {where_sql} ORDER BY id DESC', params)
            rows = cur.fetchall()

        if not rows:
            return jsonify({'error': '无数据可导出'}), 404

        fieldnames = list(rows[0].keys())

        output = io.StringIO()
        output.write('\ufeff')  # BOM，让 Excel 正确识别 UTF-8
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row[k] for k in fieldnames})

        csv_bytes = output.getvalue().encode('utf-8')
        filename = f'matches_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'

        return Response(
            csv_bytes,
            mimetype='text/csv; charset=utf-8',
            headers={'Content-Disposition': f'attachment; filename={filename}'}
        )
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
if __name__ == '__main__':
    print("🚀 启动 Flask 服务器...")
    app.run(debug=True, host='127.0.0.1', port=5000)