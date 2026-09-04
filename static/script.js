(function() {
    "use strict";

    const LEAGUE_AVG_GOALS_SCORED = 1.5;
    const LEAGUE_AVG_GOALS_CONCEDED = 1.5;
    const LEAGUE_AVG_VALUE = 70.0;

    const $ = id => document.getElementById(id);
    const homeName = $('home-name');
    const awayName = $('away-name');
    const leagueName = $('league-name');
    const matchDate = $('match-date');
    const homeRank = $('home-rank');
    const homeScored = $('home-scored');
    const homeConceded = $('home-conceded');
    const homeRecent = $('home-recent');
    const homeHW = $('home-hw');
    const homeHD = $('home-hd');
    const homeHL = $('home-hl');
    const homeInjuries = $('home-injuries');
    const homeMotivation = $('home-motivation');
    const homeValue = $('home-value');
    const homeUnexpected = $('home-unexpected');
    const awayRank = $('away-rank');
    const awayScored = $('away-scored');
    const awayConceded = $('away-conceded');
    const awayRecent = $('away-recent');
    const awayAW = $('away-aw');
    const awayAD = $('away-ad');
    const awayAL = $('away-al');
    const awayInjuries = $('away-injuries');
    const awayMotivation = $('away-motivation');
    const awayValue = $('away-value');
    const awayUnexpected = $('away-unexpected');

    const resultArea = $('resultArea');
    const resultHomeName = $('result-home-name');
    const resultAwayName = $('result-away-name');
    const resultHomeScore = $('result-home-score');
    const resultAwayScore = $('result-away-score');
    const probHome = $('prob-home');
    const probDraw = $('prob-draw');
    const probAway = $('prob-away');
    const barHome = $('bar-home');
    const barDraw = $('bar-draw');
    const barAway = $('bar-away');
    const unexpectedDisplay = $('unexpected-display');
    const basicJudge = $('basic-judge');
    const saveBtn = $('saveBtn');
    const toast = $('toast');
    const fetchBtn = $('fetchBtn');
    const modal = $('matchModal');
    const modalClose = $('modalClose');
    const matchListBody = $('matchListBody');
    const loaderArea = $('loaderArea');
    const tableContainer = $('tableContainer');
    const progressFill = $('progressFill');
    const progressPercent = $('progressPercent');

    const sliders = document.querySelectorAll('.w-slider');

    // 设置默认日期为今天
    (function setDefaultDate() {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        matchDate.value = y + '-' + m + '-' + d;
    })();

    // 权重获取
    function getWeights() {
        const raw = {};
        sliders.forEach(s => raw[s.dataset.key] = parseFloat(s.value));
        let total = 0; for (let k in raw) total += raw[k];
        if (total === 0) total = 1;
        const norm = {}; for (let k in raw) norm[k] = raw[k] / total;
        return norm;
    }
    sliders.forEach(s => s.addEventListener('input', function() {
        const span = this.parentElement.querySelector('.weight-val');
        if (span) span.textContent = this.value;
    }));

    // 评分函数
    function rankScore(rank, totalTeams=20) {
        if (totalTeams <= 1) return 100;
        return Math.max(0, 100 - (rank - 1) * (100 / (totalTeams - 1)));
    }
    function goalScore(gs, gc) {
        const avgS = Math.max(LEAGUE_AVG_GOALS_SCORED, 0.1);
        const avgC = Math.max(LEAGUE_AVG_GOALS_CONCEDED, 0.1);
        const attack = Math.min(100, (gs / avgS) * 50);
        const defenseRatio = Math.max(0, 1 - (gc / avgC));
        const defense = Math.min(100, defenseRatio * 50);
        return (attack + defense) / 2;
    }
    function formScore(recent, games=3) {
        const maxP = games * 3;
        if (maxP === 0) return 50;
        return Math.min(100, (recent / maxP) * 100);
    }
    function homeAwayScore(w, d, l) {
        const total = w + d + l;
        if (total === 0) return 50;
        return (w / total) * 100;
    }
    function personnelScore(inj) { return Math.max(0, 100 - Math.min(100, inj * 10)); }
    function motivationScore(level) { return Math.min(100, level * 20); }
    function valueScore(v) { const avg = Math.max(LEAGUE_AVG_VALUE, 0.1); return Math.min(100, (v / avg) * 50); }

    function calculateTeamScore(data, isHome) {
        const rank = data.rank || 10;
        const strength = 0.5 * rankScore(rank) + 0.5 * goalScore(data.goalsScored || 0, data.goalsConceded || 0);
        const form = formScore(data.recentPoints || 0, 3);
        let w, d, l;
        if (isHome) { w = data.homeWins||0; d = data.homeDraws||0; l = data.homeLosses||0; }
        else { w = data.awayWins||0; d = data.awayDraws||0; l = data.awayLosses||0; }
        const ha = homeAwayScore(w, d, l);
        const pers = personnelScore(data.keyInjuries||0);
        const mot = motivationScore(data.motivation||3);
        const val = valueScore(data.teamValue||0);
        const weights = getWeights();
        return weights.strength * strength + weights.form * form + weights.home_away * ha +
               weights.personnel * pers + weights.motivation * mot + weights.value * val;
    }

    function predictMatch(homeData, awayData) {
        const hs = calculateTeamScore(homeData, true);
        const as = calculateTeamScore(awayData, false);
        const diff = hs - as;
        const pDraw = 0.35 * Math.exp(-(diff*diff)/2000);
        const pHomeRaw = 1 / (1 + Math.exp(-diff/20));
        const pAwayRaw = 1 / (1 + Math.exp(diff/20));
        const total = pHomeRaw + pAwayRaw + pDraw;
        return { homeScore: hs, awayScore: as, homeProb: pHomeRaw/total, drawProb: pDraw/total, awayProb: pAwayRaw/total };
    }

    function autoSelectJudgment(hs, as) {
        const diff = hs - as;
        let val = 'equal';
        if (diff > 25) val = 'home_dominant';
        else if (diff > 12) val = 'home_strong';
        else if (diff > 5) val = 'home_advantage';
        else if (diff < -25) val = 'away_dominant';
        else if (diff < -12) val = 'away_strong';
        else if (diff < -5) val = 'away_advantage';
        else {
            if (hs < 40 && as < 40) val = 'both_weak';
            else val = 'equal';
        }
        basicJudge.value = val;
    }

    // 读取球队数据
    function readTeamData(prefix) {
        const getVal = id => document.getElementById(prefix + '-' + id).value;
        const getInt = id => parseInt(getVal(id)) || 0;
        const getFloat = id => parseFloat(getVal(id)) || 0;
        const isHome = prefix === 'home';
        const data = {
            rank: getInt('rank'),
            goalsScored: getInt('scored'),
            goalsConceded: getInt('conceded'),
            recentPoints: getInt('recent'),
            keyInjuries: getInt('injuries'),
            motivation: parseInt(document.getElementById(prefix + '-motivation').value, 10) || 3,
            teamValue: getFloat('value'),
            unexpected: getVal('unexpected') || ''
        };
        if (isHome) {
            data.homeWins = getInt('hw');
            data.homeDraws = getInt('hd');
            data.homeLosses = getInt('hl');
        } else {
            data.awayWins = getInt('aw');
            data.awayDraws = getInt('ad');
            data.awayLosses = getInt('al');
        }
        return data;
    }

    // 显示结果
    function displayResult(homeStr, awayStr, homeData, awayData, result) {
        resultArea.style.display = 'block';
        resultHomeName.textContent = homeStr;
        resultAwayName.textContent = awayStr;
        resultHomeScore.textContent = result.homeScore.toFixed(2);
        resultAwayScore.textContent = result.awayScore.toFixed(2);
        const pH = result.homeProb * 100, pD = result.drawProb * 100, pA = result.awayProb * 100;
        probHome.textContent = pH.toFixed(1) + '%';
        probDraw.textContent = pD.toFixed(1) + '%';
        probAway.textContent = pA.toFixed(1) + '%';
        barHome.style.width = pH + '%';
        barHome.textContent = pH >= 5 ? '主胜' : '';
        barDraw.style.width = pD + '%';
        barDraw.textContent = pD >= 5 ? '平局' : '';
        barAway.style.width = pA + '%';
        barAway.textContent = pA >= 5 ? '客胜' : '';
        const hU = homeData.unexpected || '', aU = awayData.unexpected || '';
        if (hU || aU) {
            unexpectedDisplay.style.display = 'block';
            let html = '⚠️ 意外因素：';
            if (hU) html += `<br>🏠 ${homeStr}: ${hU}`;
            if (aU) html += `<br>✈️ ${awayStr}: ${aU}`;
            unexpectedDisplay.innerHTML = html;
        } else unexpectedDisplay.style.display = 'none';
        autoSelectJudgment(result.homeScore, result.awayScore);
    }

    // 计算
    function compute() {
        const hName = homeName.value.trim() || '主队';
        const aName = awayName.value.trim() || '客队';
        const homeData = readTeamData('home');
        const awayData = readTeamData('away');
        const result = predictMatch(homeData, awayData);
        displayResult(hName, aName, homeData, awayData, result);
    }

    // 保存比赛
    function saveCurrentMatch() {
        if (resultArea.style.display === 'none') {
            showToast('请先点击“计算评分与预测”');
            return;
        }
        const data = {
            home_team: homeName.value.trim() || '主队',
            away_team: awayName.value.trim() || '客队',
            home_rank: parseInt(homeRank.value) || 0,
            home_scored: parseInt(homeScored.value) || 0,
            home_conceded: parseInt(homeConceded.value) || 0,
            home_recent: parseInt(homeRecent.value) || 0,
            home_wins: parseInt(homeHW.value) || 0,
            home_draws: parseInt(homeHD.value) || 0,
            home_losses: parseInt(homeHL.value) || 0,
            home_injuries: parseInt(homeInjuries.value) || 0,
            home_motivation: parseInt(homeMotivation.value) || 3,
            home_value: parseFloat(homeValue.value) || 0,
            away_rank: parseInt(awayRank.value) || 0,
            away_scored: parseInt(awayScored.value) || 0,
            away_conceded: parseInt(awayConceded.value) || 0,
            away_recent: parseInt(awayRecent.value) || 0,
            away_wins: parseInt(awayAW.value) || 0,
            away_draws: parseInt(awayAD.value) || 0,
            away_losses: parseInt(awayAL.value) || 0,
            away_injuries: parseInt(awayInjuries.value) || 0,
            away_motivation: parseInt(awayMotivation.value) || 3,
            away_value: parseFloat(awayValue.value) || 0,
            home_unexpected: homeUnexpected.value || '',
            away_unexpected: awayUnexpected.value || '',
            home_score: parseFloat(resultHomeScore.textContent) || 0,
            away_score: parseFloat(resultAwayScore.textContent) || 0,
            home_prob: parseFloat(probHome.textContent) / 100 || 0,
            draw_prob: parseFloat(probDraw.textContent) / 100 || 0,
            away_prob: parseFloat(probAway.textContent) / 100 || 0,
            judgment: basicJudge.value
        };

        fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(res => {
            if (!res.ok) return res.json().then(err => { throw new Error(err.error || 'HTTP ' + res.status); });
            return res.json();
        })
        .then(res => {
            if (res.success) showToast('✅ 比赛已保存！ID: ' + res.id);
            else showToast('❌ 保存失败: ' + (res.error || '未知错误'));
        })
        .catch(err => showToast('❌ 请求出错: ' + err.message));
    }

    // Toast
    let toastTimer;
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // 抓取指定日期比赛（支持缓存）
    function fetchMatches() {
        let date = matchDate.value;
        if (!date) {
            const today = new Date();
            date = today.toISOString().split('T')[0];
            matchDate.value = date;
        }
        modal.style.display = 'flex';
        loaderArea.style.display = 'block';
        tableContainer.style.display = 'none';
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';

        let progress = 0;
        const interval = setInterval(() => {
            const increment = Math.random() * 8 + 2;
            progress = Math.min(progress + increment, 95);
            progressFill.style.width = progress + '%';
            progressPercent.textContent = Math.round(progress) + '%';
        }, 200);

        fetch('/api/fetch_matches?date=' + date)
        .then(res => {
            clearInterval(interval);
            if (!res.ok) return res.json().then(err => { throw new Error(err.error || 'HTTP ' + res.status); });
            return res.json();
        })
        .then(data => {
            progressFill.style.width = '100%';
            progressPercent.textContent = '100%';
            setTimeout(() => {
                loaderArea.style.display = 'none';
                tableContainer.style.display = 'block';
                if (data.error) {
                    matchListBody.innerHTML = `<tr><td colspan="5" class="no-data">❌ ${data.error}</td></tr>`;
                    return;
                }
                if (!data || data.length === 0) {
                    matchListBody.innerHTML = '<tr><td colspan="5" class="no-data">该日无比赛或抓取失败</td></tr>';
                    return;
                }
                let html = '';
                data.forEach(m => {
                    html += `<tr class="clickable" data-home="${m.home_team}" data-away="${m.away_team}" data-league="${m.league}">
                        <td>${m.time || ''}</td>
                        <td>${m.league || ''}</td>
                        <td>${m.home_team}</td>
                        <td>${m.away_team}</td>
                        <td>${m.score || '未赛'}</td>
                    </tr>`;
                });
                matchListBody.innerHTML = html;
                document.querySelectorAll('#matchListBody tr.clickable').forEach(row => {
                    row.addEventListener('click', function() {
                        homeName.value = this.dataset.home || '';
                        awayName.value = this.dataset.away || '';
                        leagueName.value = this.dataset.league || '';
                        modal.style.display = 'none';
                        showToast('✅ 已填充：' + this.dataset.home + ' vs ' + this.dataset.away);
                    });
                });
            }, 400);
        })
        .catch(err => {
            clearInterval(interval);
            loaderArea.style.display = 'none';
            tableContainer.style.display = 'block';
            matchListBody.innerHTML = `<tr><td colspan="5" class="no-data">❌ 请求出错: ${err.message}</td></tr>`;
        });
    }

    // 模态框控制
    function closeModal() { modal.style.display = 'none'; }
    modalClose.addEventListener('click', closeModal);
    window.addEventListener('click', e => { if (e.target === modal) closeModal(); });
// 在 index.html 的 script 中，loadExample 之后或之前添加
function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
        fetch('/api/match/' + id)
        .then(res => res.json())
        .then(data => {
            if (data.error) { showToast('加载失败: ' + data.error); return; }
            // 填充所有字段
            homeName.value = data.home_team || '';
            awayName.value = data.away_team || '';
            homeRank.value = data.home_rank || '';
            homeScored.value = data.home_scored || '';
            homeConceded.value = data.home_conceded || '';
            homeRecent.value = data.home_recent || '';
            homeHW.value = data.home_wins || '';
            homeHD.value = data.home_draws || '';
            homeHL.value = data.home_losses || '';
            homeInjuries.value = data.home_injuries || '';
            homeMotivation.value = data.home_motivation || 3;
            homeValue.value = data.home_value || '';
            homeUnexpected.value = data.home_unexpected || '';
            awayRank.value = data.away_rank || '';
            awayScored.value = data.away_scored || '';
            awayConceded.value = data.away_conceded || '';
            awayRecent.value = data.away_recent || '';
            awayAW.value = data.away_wins || '';
            awayAD.value = data.away_draws || '';
            awayAL.value = data.away_losses || '';
            awayInjuries.value = data.away_injuries || '';
            awayMotivation.value = data.away_motivation || 3;
            awayValue.value = data.away_value || '';
            awayUnexpected.value = data.away_unexpected || '';
            // 触发计算
            compute();
            showToast('已加载历史记录 ID: ' + id);
        })
        .catch(err => showToast('加载失败: ' + err.message));
    }
}

// 在 window.onload 中调用
window.addEventListener('load', function() {
    loadExample();  // 原有
    loadFromUrl();  // 新增
	const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const home = params.get('home');
    const away = params.get('away');
    const date = params.get('date');
    const time = params.get('time');
    const league = params.get('league');

    if (id) {
        // 加载历史记录（只读模式）
        loadMatchById(id);
    } else if (home && away) {
        // 从赛事列表跳转（只填充球队名）
        homeName.value = home;
        awayName.value = away;
        if (date) document.getElementById('match-date').value = date;
        if (time) document.getElementById('match-time').value = time;
        if (league) leagueName.value = league;
        clearReadonlyMode();
        // 触发计算或保持手动
        // 可选自动计算
        // compute();
        showToast('已从赛事列表导入数据');
    } else {
        // 无参数，加载最近记录（可编辑）
        loadLatestMatch();
    }
});
// 从 URL 参数填充数据
// ---------- 从 URL 参数填充数据 ----------
function fillFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const date = params.get('date');
    const time = params.get('time');
    const league = params.get('league');
    const home = params.get('home');
    const away = params.get('away');

    // 填充数据（如果 DOM 元素存在）
    const matchDateInput = document.getElementById('match-date');
    const matchTimeInput = document.getElementById('match-time');
    const leagueNameInput = document.getElementById('league-name');
    const homeNameInput = document.getElementById('home-name');
    const awayNameInput = document.getElementById('away-name');

    if (date && matchDateInput) matchDateInput.value = date;
    if (time && matchTimeInput) matchTimeInput.value = time;
    if (league && leagueNameInput) leagueNameInput.value = league;
    if (home && homeNameInput) homeNameInput.value = home;
    if (away && awayNameInput) awayNameInput.value = away;

    // 如果同时有主队和客队，自动计算预测
    if (home && away) {
        // 延迟执行以确保 DOM 完全渲染
        setTimeout(function() {
            if (typeof compute === 'function') {
                compute();
            } else {
                console.warn('compute 函数未定义，请检查 index.html 的 JavaScript');
            }
        }, 150);
    }
}
    // 示例和重置
    function loadExample() {
        homeName.value = '利物浦';
        leagueName.value = 'Premier League';
        homeRank.value = '2'; homeScored.value = '75'; homeConceded.value = '28';
        homeRecent.value = '7'; homeHW.value = '2'; homeHD.value = '1'; homeHL.value = '0';
        homeInjuries.value = '1'; homeMotivation.value = '4'; homeValue.value = '950';
        homeUnexpected.value = '萨拉赫回归，士气高涨';
        awayName.value = '阿森纳';
        awayRank.value = '3'; awayScored.value = '70'; awayConceded.value = '30';
        awayRecent.value = '6'; awayAW.value = '1'; awayAD.value = '1'; awayAL.value = '1';
        awayInjuries.value = '0'; awayMotivation.value = '4'; awayValue.value = '780';
        awayUnexpected.value = '多名主力轮换，体能占优';
        const defs = { strength:30, form:25, home_away:15, personnel:10, motivation:10, value:10 };
        sliders.forEach(s => { const k = s.dataset.key; if (defs.hasOwnProperty(k)) { s.value = defs[k]; const sp = s.parentElement.querySelector('.weight-val'); if (sp) sp.textContent = defs[k]; } });
        compute();
    }
    function resetAll() {
        document.querySelectorAll('input[type="number"]').forEach(inp => {
            if (inp.id.includes('value')) inp.value = '0';
            else if (inp.id.includes('rank')) inp.value = '10';
            else if (inp.id.includes('recent')) inp.value = '0';
            else if (inp.id.includes('hw') || inp.id.includes('hd') || inp.id.includes('hl') ||
                     inp.id.includes('aw') || inp.id.includes('ad') || inp.id.includes('al')) inp.value = '0';
            else if (inp.id.includes('injuries')) inp.value = '0';
            else if (inp.id.includes('scored') || inp.id.includes('conceded')) inp.value = '0';
        });
        document.querySelectorAll('select').forEach(s => { if (s.id === 'basic-judge') s.value = 'equal'; else s.value = '3'; });
        document.querySelectorAll('input[type="text"]').forEach(inp => {
            if (inp.id === 'home-name') inp.value = '主队';
            else if (inp.id === 'away-name') inp.value = '客队';
            else if (inp.id === 'league-name') inp.value = '';
            else inp.value = '';
        });
        const defs = { strength:30, form:25, home_away:15, personnel:10, motivation:10, value:10 };
        sliders.forEach(s => { const k = s.dataset.key; if (defs.hasOwnProperty(k)) { s.value = defs[k]; const sp = s.parentElement.querySelector('.weight-val'); if (sp) sp.textContent = defs[k]; } });
        resultArea.style.display = 'none';
    }

    // 事件绑定
    fetchBtn.addEventListener('click', fetchMatches);
    document.getElementById('calcBtn').addEventListener('click', compute);
    document.getElementById('loadExampleBtn').addEventListener('click', loadExample);
    document.getElementById('resetBtn').addEventListener('click', resetAll);
    saveBtn.addEventListener('click', saveCurrentMatch);
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.form-group')) compute(); });
    function fillFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const home = params.get('home');
    const away = params.get('away');
    if (home) homeName.value = home;
    if (away) awayName.value = away;
    // 如果有填充，可自动计算或提醒
    if (home || away) {
        showToast('已从赛事列表导入球队名称');
        // 可自动触发计算或等待用户点击
    }
}
	// 从 URL 参数填充球队名称
function fillFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const home = params.get('home');
    const away = params.get('away');
    if (home) homeName.value = home;
    if (away) awayName.value = away;
    if (home || away) {
        showToast('已从赛事列表导入球队名称');
        // 可选：自动计算
        // compute();
    }
}
	window.addEventListener('load', function() {

    fillFromUrl();
	fillFromUrlParams();
	// 检查是否有 URL 参数（来自赛事列表跳转）
    const params = new URLSearchParams(window.location.search);
    const hasParams = params.has('date') || params.has('time') || params.has('league') || params.has('home') || params.has('away');

    if (hasParams) {
        // 优先填充 URL 参数
        fillFromUrlParams();
        // 如果只有主客队，自动计算，否则不覆盖其他数据（如示例数据）
        // 但为了确保示例数据被清理，我们可以选择不清除示例，但覆盖主客队后自动计算
        // 注意：如果示例数据已被加载，可能会覆盖部分字段，因此我们应在 loadExample 之前填充
        // 但 loadExample 可能在之前已调用，我们需调整顺序
        // 我们可以先不调用 loadExample，直接由 fillFromUrlParams 填充
        // 由于 fillFromUrlParams 已填充，且 compute 被调用，不再需要 loadExample
    } else {
        // 无参数时加载最近记录（或示例）
        // 请根据您的实际逻辑选择：
        // loadLatestMatch();  // 如果存在此函数
        loadExample(); // 否则加载示例
    }
});
})();