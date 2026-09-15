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

# ★ 新增路由
@app.route('/ai_value_stats')
def ai_value_stats():
    return render_template('ai_value_stats.html')

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
            'value': data.get('value', ''),   # ★ 新增
            'source': src,   # ★ 关键：标记数据来源
        }

        # 删除同一 source 下可能存在的重复记录
        with get_db() as conn:
            conn.execute(
                'DELETE FROM matches WHERE date = ? AND home_team = ? AND away_team = ? AND source = ?',
                (match_data['date'], match_data['home_team'], match_data['away_team'], src)
            )
            conn.commit()

        # 直接用 SQL 插入（保证 source 字段被写入）
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

    # 校验记录存在且属于当前 source
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id FROM matches WHERE id = ? AND source = ?', (match_id, src))
        if not cur.fetchone():
            return jsonify({'error': '记录不存在或无权修改'}), 403

    # 处理 result 字段（兼容旧调用）
    if 'result' in data:
        result = data.get('result')
        if result not in ('红', '黑', '走盘', None):
            return jsonify({'error': '结果必须是 红/黑/走盘 或 null'}), 400
        update_match_result(match_id, result)

    # ★ 新增：处理 value 字段
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

    return jsonify({'success': True})


@app.route('/api/match/<int:match_id>', methods=['PUT'])
def api_update_match(match_id):
    src = get_source()
    data = request.get_json()
    if data is None:
        return jsonify({'error': '请求体不是JSON'}), 400
    if 'home_team' not in data or 'away_team' not in data:
        return jsonify({'error': '缺少 home_team 或 away_team'}), 400

    # 校验记录存在且属于当前 source
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT id FROM matches WHERE id = ? AND source = ?', (match_id, src))
        if not cur.fetchone():
            return jsonify({'error': '记录不存在或无权修改'}), 403

    # 禁止修改 id / source
    data.pop('id', None)
    data.pop('source', None)

    # 为可能缺失的字段设置默认值，避免SQL绑定错误
    data.setdefault('date', '')
    data.setdefault('time', '')
    data.setdefault('league', '')
    data.setdefault('home_unexpected', '')
    data.setdefault('away_unexpected', '')
    data.setdefault('result', '')
    data.setdefault('value', '')   # ★ 新增
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

    numeric_fields = ['home_rank', 'home_scored', 'home_conceded', 'home_recent',
                      'home_wins', 'home_draws', 'home_losses', 'home_injuries',
                      'home_motivation', 'home_value', 'away_rank', 'away_scored',
                      'away_conceded', 'away_recent', 'away_wins', 'away_draws',
                      'away_losses', 'away_injuries', 'away_motivation', 'away_value',
                      'home_score', 'away_score', 'home_prob', 'draw_prob', 'away_prob']
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
        # 只删除属于当前 source 的记录
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
            'judgment_stats': []   # 兼容旧版前端，不再使用
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ---------- fixtures API（保持不变） ----------

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


# ---------- odds API（保持不变） ----------
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



if __name__ == '__main__':
    print("🚀 启动 Flask 服务器...")
    app.run(debug=True, host='127.0.0.1', port=5000)