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

# ---------- 页面路由 ----------

@app.route('/')
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

# ---------- API：保存预测记录 ----------
@app.route('/api/save', methods=['POST'])
def api_save():
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
            'judgment': data.get('judgment', 'equal')
        }

        # 删除可能存在的重复记录
        with get_db() as conn:
            conn.execute(
                'DELETE FROM matches WHERE date = ? AND home_team = ? AND away_team = ?',
                (match_data['date'], match_data['home_team'], match_data['away_team'])
            )
            conn.commit()

        match_id = save_match(match_data)
        return jsonify({'success': True, 'id': match_id, 'updated': True})

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ---------- API：历史记录 ----------
@app.route('/api/history')
def api_history():
    date_filter = request.args.get('date')
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)
    try:
        matches = get_all_matches(limit, offset, date_filter)
        total = get_all_matches_count(date_filter)
        return jsonify({
            'data': [dict(row) for row in matches],
            'total': total,
            'limit': limit,
            'offset': offset
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/match/<int:match_id>', methods=['GET'])
def api_get_match(match_id):
    match = get_match_by_id(match_id)
    if not match:
        return jsonify({'error': '记录不存在'}), 404
    return jsonify(dict(match))

@app.route('/api/match/<int:match_id>/result', methods=['PUT'])
def api_update_result(match_id):
    data = request.get_json()
    if not data:
        return jsonify({'error': '请求体不是JSON'}), 400
    result = data.get('result')
    if result not in ('红', '黑', '走盘', None):
        return jsonify({'error': '结果必须是 红/黑/走盘 或 null'}), 400
    update_match_result(match_id, result)
    return jsonify({'success': True})

@app.route('/api/match/<int:match_id>', methods=['PUT'])
def api_update_match(match_id):
    data = request.get_json()
    if data is None:
        return jsonify({'error': '请求体不是JSON'}), 400
    if 'home_team' not in data or 'away_team' not in data:
        return jsonify({'error': '缺少 home_team 或 away_team'}), 400
    data.setdefault('date', '')
    data.setdefault('time', '')
    data.setdefault('league', '')
    try:
        update_match_full(match_id, data)
        return jsonify({'success': True})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/match/<int:match_id>', methods=['DELETE'])
def api_delete_match(match_id):
    try:
        delete_match(match_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats')
def api_stats():
    try:
        stats = get_statistics()
        stats['result_counts'] = [dict(row) for row in stats['result_counts']]
        stats['judgment_stats'] = [dict(row) for row in stats['judgment_stats']]
        return jsonify(stats)
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

    try:
        datetime.strptime(date_str, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': '日期格式无效，请使用 YYYY-MM-DD'}), 400

    cached = get_fixtures_by_date(date_str)
    if cached:
        return jsonify([dict(row) for row in cached])

    try:
        from jczq_keywords0830 import JczqChineseScraper
    except ImportError as e:
        return jsonify({'error': f'爬虫模块未找到: {str(e)}'}), 500

    try:
        scraper = JczqChineseScraper()
        all_matches = []

        default_url = f"{scraper.base_url}?playid=270&g=2&date={date_str}"
        default_resp = scraper.session.get(default_url, timeout=15)
        default_resp.encoding = 'gb2312'
        default_html = default_resp.text
        if default_html:
            matches = scraper.parse_html(default_html, date_str)
            all_matches.extend(matches)

        if include_finished:
            for status in ['0', '1']:
                finished_url = f"{scraper.base_url}?playid=270&g=2&date={date_str}&status={status}"
                finished_resp = scraper.session.get(finished_url, timeout=15)
                finished_resp.encoding = 'gb2312'
                finished_html = finished_resp.text
                if finished_html:
                    matches = scraper.parse_html(finished_html, date_str)
                    all_matches.extend(matches)
                    break

        seen = set()
        unique = []
        for m in all_matches:
            key = (m.get('比赛日期', ''), m.get('主队VS客队', ''))
            if key not in seen:
                seen.add(key)
                unique.append(m)

        if not unique:
            return jsonify([])

        fixtures = []
        for m in unique:
            matchup = m.get('主队VS客队', '')
            home, away = '', ''
            if ' VS ' in matchup:
                parts = matchup.split(' VS ')
                home = parts[0].strip()
                away = parts[1].strip()
            fixtures.append({
                'date': m.get('比赛日期', ''),
                'time': m.get('比赛时间', ''),
                'league': m.get('联赛', ''),
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
    limit = request.args.get('limit', 20, type=int)
    offset = request.args.get('offset', 0, type=int)
    try:
        fixtures = get_all_fixtures(date_filter, limit, offset)
        total = count_fixtures(date_filter)
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
        for key in ['date', 'time', 'league', 'home_team', 'away_team', 'score']:
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
    date = request.args.get('date')
    home_team = request.args.get('home_team')
    away_team = request.args.get('away_team')
    if not date or not home_team or not away_team:
        return jsonify({'error': '缺少参数: date, home_team, away_team'}), 400
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'SELECT * FROM matches WHERE date = ? AND home_team = ? AND away_team = ? ORDER BY created_at DESC LIMIT 1',
            (date, home_team, away_team)
        )
        row = cur.fetchone()
        if row:
            return jsonify(dict(row))
        else:
            return jsonify(None), 200  # 返回 null
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

if __name__ == '__main__':
    print("🚀 启动 Flask 服务器...")
    app.run(debug=True, host='127.0.0.1', port=5000)