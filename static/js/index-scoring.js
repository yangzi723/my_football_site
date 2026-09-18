/* ============================================================
 * 评分算法（纯函数，不依赖 DOM）
 * ============================================================ */
(function () {
    "use strict";

    const App = window.IndexApp = window.IndexApp || {};

    // ---- 基础评分函数 ----

    // 联赛排名得分（假设联赛 20 队）
    function rankScore(rank, totalTeams) {
        totalTeams = totalTeams || 20;
        if (totalTeams <= 1) return 100;
        return Math.max(0, 100 - (rank - 1) * (100 / (totalTeams - 1)));
    }

    // 攻防得分
    function goalScore(gs, gc) {
        const avgS = Math.max(App.LEAGUE_AVG_GOALS_SCORED, 0.1);
        const avgC = Math.max(App.LEAGUE_AVG_GOALS_CONCEDED, 0.1);
        const attack = Math.min(100, (gs / avgS) * 50);
        const defenseRatio = Math.max(0, 1 - (gc / avgC));
        const defense = Math.min(100, defenseRatio * 50);
        return (attack + defense) / 2;
    }

    // 近期状态得分
    function formScore(recent, games) {
        games = games || 3;
        const maxP = games * 3;
        if (maxP === 0) return 50;
        return Math.min(100, (recent / maxP) * 100);
    }

    // 主客场得分
    function homeAwayScore(w, d, l) {
        const total = w + d + l;
        if (total === 0) return 50;
        return (w / total) * 100;
    }

    // 人员得分
    function personnelScore(inj) {
        return Math.max(0, 100 - Math.min(100, inj * 10));
    }

    // 战意得分
    function motivationScore(level) {
        return Math.min(100, level * 20);
    }

    // 身价得分
    function valueScore(v) {
        const avg = Math.max(App.LEAGUE_AVG_VALUE, 0.1);
        return Math.min(100, (v / avg) * 50);
    }

    // H2H 得分（胜 3 分、平 1 分、负 0 分，归一化到 0-100）
    function h2hScore(wins, draws, losses) {
        const total = wins + draws + losses;
        if (total === 0) return 50;
        const points = wins * 3 + draws * 1;
        const maxPoints = total * 3;
        return (points / maxPoints) * 100;
    }

    // ---- 权重归一化 ----
    function getWeights() {
        const raw = {};
        App.dom.sliders.forEach(s => {
            raw[s.dataset.key] = parseFloat(s.value);
        });
        let total = 0;
        for (const k in raw) total += raw[k];
        if (total === 0) total = 1;
        const norm = {};
        for (const k in raw) norm[k] = raw[k] / total;
        return norm;
    }

    // ---- 单队综合得分 ----
    function calculateTeamScore(data, isHome, h2h) {
        const rank = data.rank || 10;
        const strength = 0.5 * rankScore(rank) + 0.5 * goalScore(data.goalsScored || 0, data.goalsConceded || 0);
        const form = formScore(data.recentPoints || 0, 3);

        let w, d, l;
        if (isHome) {
            w = data.homeWins || 0;
            d = data.homeDraws || 0;
            l = data.homeLosses || 0;
        } else {
            w = data.awayWins || 0;
            d = data.awayDraws || 0;
            l = data.awayLosses || 0;
        }
        const ha = homeAwayScore(w, d, l);
        const pers = personnelScore(data.keyInjuries || 0);
        const mot = motivationScore(data.motivation || 3);
        const val = valueScore(data.teamValue || 0);

        // H2H 因子
        const h2hData = h2h || { homeWins: 0, draws: 0, awayWins: 0 };
        const h2hSc = isHome
            ? h2hScore(h2hData.homeWins, h2hData.draws, h2hData.awayWins)
            : h2hScore(h2hData.awayWins, h2hData.draws, h2hData.homeWins);

        const weights = getWeights();
        return weights.strength * strength
             + weights.form * form
             + weights.home_away * ha
             + weights.personnel * pers
             + weights.motivation * mot
             + weights.value * val
             + (weights.h2h || 0) * h2hSc;
    }

    // ---- 比赛预测 ----
    function predictMatch(homeData, awayData, h2h) {
        const hs = calculateTeamScore(homeData, true, h2h);
        const as = calculateTeamScore(awayData, false, h2h);
        const diff = hs - as;
        const pDraw = 0.35 * Math.exp(-(diff * diff) / 2000);
        const pHomeRaw = 1 / (1 + Math.exp(-diff / 20));
        const pAwayRaw = 1 / (1 + Math.exp(diff / 20));
        const total = pHomeRaw + pAwayRaw + pDraw;
        return {
            homeScore: hs,
            awayScore: as,
            homeProb: pHomeRaw / total,
            drawProb: pDraw / total,
            awayProb: pAwayRaw / total
        };
    }

    // ---- 自动推荐基本面判断 ----
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
        App.dom.basicJudge.value = val;
    }

    // ---- 读取表单 ----
    function readTeamData(prefix) {
        const $ = App.$;
        const getVal = id => $(prefix + '-' + id).value;
        const getInt = id => parseInt(getVal(id)) || 0;
        const getFloat = id => parseFloat(getVal(id)) || 0;

        const data = {
            rank: getInt('rank'),
            goalsScored: getInt('scored'),
            goalsConceded: getInt('conceded'),
            recentPoints: getInt('recent'),
            keyInjuries: getInt('injuries'),
            motivation: parseInt($(prefix + '-motivation').value, 10) || 3,
            teamValue: getFloat('value'),
            unexpected: getVal('unexpected') || ''
        };
        if (prefix === 'home') {
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

    function readH2H() {
        const d = App.dom;
        return {
            homeWins: parseInt(d.h2hHomeWins.value) || 0,
            draws: parseInt(d.h2hDraws.value) || 0,
            awayWins: parseInt(d.h2hAwayWins.value) || 0
        };
    }

    // ---- 结果展示 ----
    function displayResult(homeStr, awayStr, homeData, awayData, result) {
        const d = App.dom;
        d.resultArea.style.display = 'block';
        d.resultHomeName.textContent = homeStr;
        d.resultAwayName.textContent = awayStr;
        d.resultHomeScore.textContent = result.homeScore.toFixed(2);
        d.resultAwayScore.textContent = result.awayScore.toFixed(2);

        const pH = result.homeProb * 100;
        const pD = result.drawProb * 100;
        const pA = result.awayProb * 100;

        d.probHome.textContent = pH.toFixed(1) + '%';
        d.probDraw.textContent = pD.toFixed(1) + '%';
        d.probAway.textContent = pA.toFixed(1) + '%';

        d.barHome.style.width = pH + '%';
        d.barHome.textContent = pH >= 5 ? '主胜' : '';
        d.barDraw.style.width = pD + '%';
        d.barDraw.textContent = pD >= 5 ? '平局' : '';
        d.barAway.style.width = pA + '%';
        d.barAway.textContent = pA >= 5 ? '客胜' : '';

        const hU = homeData.unexpected || '';
        const aU = awayData.unexpected || '';
        if (hU || aU) {
            d.unexpectedDisplay.style.display = 'block';
            let html = '⚠️ 意外因素：';
            if (hU) html += `<br>🏠 ${homeStr}: ${hU}`;
            if (aU) html += `<br>✈️ ${awayStr}: ${aU}`;
            d.unexpectedDisplay.innerHTML = html;
        } else {
            d.unexpectedDisplay.style.display = 'none';
        }

        autoSelectJudgment(result.homeScore, result.awayScore);
    }

    // ---- 计算入口 ----
    function compute() {
        const d = App.dom;
        const hName = d.homeName.value.trim() || '主队';
        const aName = d.awayName.value.trim() || '客队';
        const homeData = readTeamData('home');
        const awayData = readTeamData('away');
        const h2h = readH2H();
        const result = predictMatch(homeData, awayData, h2h);
        displayResult(hName, aName, homeData, awayData, result);
    }

    // ---- 导出 ----
    App.scoring = {
        rankScore, goalScore, formScore, homeAwayScore,
        personnelScore, motivationScore, valueScore, h2hScore,
        getWeights, calculateTeamScore, predictMatch,
        autoSelectJudgment, readTeamData, readH2H,
        displayResult, compute
    };
})();