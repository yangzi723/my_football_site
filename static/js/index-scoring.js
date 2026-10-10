/* ============================================================
 * 六维基本面评分与预测（严格按《六维量化》逻辑实现）
 *
 *   实力 30% · 状态 25% · 主客场 20% · 阵容 15% · 战意 5% · 交锋 5%
 *   每个维度 0~10 分
 *   加权总分 0~10 → 总分差查表 → 真实概率 → 主场优势修正
 * ============================================================ */
(function () {
    "use strict";

    const App = window.IndexApp = window.IndexApp || {};

    const TOTAL_TEAMS = 20;

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    // ============================================================
    // 一、实力 (30%) = 联赛排名 50% + 身价 30% + 底蕴 20%
    // ============================================================

    // 排名：第1名=10分，末位=1分，线性赋分
    function rankTo10(rank, total) {
        total = total || TOTAL_TEAMS;
        if (!rank || rank < 1) return 5;
        const r = clamp(rank, 1, total);
        if (total <= 1) return 10;
        return clamp(10 - (r - 1) * (9 / (total - 1)), 1, 10);
    }

    // 身价：联赛平均=5分，两倍平均=10分（线性）
    function valueTo10(v) {
        const avg = App.LEAGUE_AVG_VALUE || 70;
        if (!v || v <= 0) return 5;          // 缺失按中性
        return clamp((v / avg) * 5, 0, 10);
    }

    // 底蕴：用近3赛季平均排名（缺失则用当前排名）
    function pedigreeTo10(avgRank, fallbackRank) {
        const r = (avgRank && avgRank > 0) ? avgRank : fallbackRank;
        return rankTo10(r);
    }

    function strengthScore(d) {
        const rankS = rankTo10(d.rank);
        const valS = valueTo10(d.teamValue);
        const pedS = pedigreeTo10(d.pedigree, d.rank);
        return clamp(0.5 * rankS + 0.3 * valS + 0.2 * pedS, 0, 10);
    }

    // ============================================================
    // 二、状态 (25%) = 近5场积分 50% + 净胜球 30% + 士气 20%
    // ============================================================

    // 近5场积分 0-15 → 0-10
    function formPointsTo10(pts) {
        return clamp((pts || 0) / 15 * 10, 0, 10);
    }

    // 净胜球：≥+5=10分，0=5分，≤-5=1分（线性）
    function goalDiffTo10(gd) {
        gd = gd || 0;
        if (gd >= 5) return 10;
        if (gd <= -5) return 1;
        return clamp(5 + gd, 1, 10);
    }

    // 士气：-2 ~ +2 → 1 ~ 9 分
    function moraleTo10(m) {
        return clamp(5 + (m || 0) * 2, 1, 9);
    }

    function formScore(d) {
        const ptsS = formPointsTo10(d.recentPoints);
        const gdS = goalDiffTo10(d.goalDiff);
        const morS = moraleTo10(d.morale);
        return clamp(0.5 * ptsS + 0.3 * gdS + 0.2 * morS, 0, 10);
    }

    // ============================================================
    // 三、主客场 (20%) = 胜率 60% + 近6场战绩 40%
    //     主队用主场数据，客队用客场数据
    // ============================================================

    function homeAwayScore(d, isHome) {
        const w = isHome ? (d.homeWins || 0) : (d.awayWins || 0);
        const dr = isHome ? (d.homeDraws || 0) : (d.awayDraws || 0);
        const l = isHome ? (d.homeLosses || 0) : (d.awayLosses || 0);
        const total = w + dr + l;
        if (total === 0) return 5;   // 无数据 → 中性

        const winRate = w / total;

        // 胜率分：主场 (0.10→0, 0.70→10)；客场 (0.10→0, 0.60→10)
        const rateScore = isHome
            ? clamp((winRate - 0.10) / 0.60 * 10, 0, 10)
            : clamp((winRate - 0.10) / 0.50 * 10, 0, 10);

        // 战绩分：近6场积分 / 满分
        const recScore = clamp((w * 3 + dr) / (total * 3) * 10, 0, 10);

        return clamp(0.6 * rateScore + 0.4 * recScore, 0, 10);
    }

    // ============================================================
    // 四、阵容 (15%) = 基础 6 分 + 伤停扣分 + 回归加分
    // ============================================================

    function personnelScore(d) {
        let s = 6;
        // 主力伤停：每名 -1，最多 -5
        s -= Math.min(d.keyInjuries || 0, 5);
        // 核心位置（门将/中卫/组织核心）：每处 -2，最多 -4
        s -= Math.min(d.coreOut || 0, 2) * 2;
        // 回归利好：每人 +2，最多 +4
        s += Math.min(d.returning || 0, 2) * 2;
        return clamp(s, 0.5, 10);
    }

    // ============================================================
    // 五、战意 (5%) = 等级 1-5 → 2/4/6/8/10
    // ============================================================

    const MOTIVATION_MAP = { 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 };

    function motivationScore(d) {
        return MOTIVATION_MAP[d.motivation] || 6;
    }

    // ============================================================
    // 六、交锋 (5%) = 近5次战绩 80% + 最近一次 20%
    // ============================================================

    function h2hScore(h2h, isHome) {
        const w = isHome ? (h2h.homeWins || 0) : (h2h.awayWins || 0);
        const dr = h2h.draws || 0;
        const l = isHome ? (h2h.awayWins || 0) : (h2h.homeWins || 0);
        const total = w + dr + l;

        let base = 5;
        if (total > 0) {
            base = clamp((w * 3 + dr) / (total * 3) * 10, 0, 10);
        }

        let last = base;
        if (h2h.last) {
            if (h2h.last === 'draw') last = 5;
            else if (h2h.last === 'home') last = isHome ? 10 : 0;
            else if (h2h.last === 'away') last = isHome ? 0 : 10;
        }

        return clamp(0.8 * base + 0.2 * last, 0, 10);
    }

    // ============================================================
    // 权重
    // ============================================================

    function getWeights() {
        const raw = {};
        let total = 0;
        App.dom.sliders.forEach(s => {
            const v = parseFloat(s.value) || 0;
            raw[s.dataset.key] = v;
            total += v;
        });
        if (total <= 0) total = 1;
        const norm = {};
        App.DIM_KEYS.forEach(k => { norm[k] = (raw[k] || 0) / total; });
        return norm;
    }

    // ============================================================
    // 六维计算 + 加权总分
    // ============================================================

    function calcDimensions(d, isHome, h2h) {
        return {
            strength: strengthScore(d),
            form: formScore(d),
            home_away: homeAwayScore(d, isHome),
            personnel: personnelScore(d),
            motivation: motivationScore(d),
            h2h: h2hScore(h2h, isHome)
        };
    }

    function weightedTotal(dims, weights) {
        let sum = 0, wSum = 0;
        App.DIM_KEYS.forEach(k => {
            const w = weights[k] || 0;
            sum += dims[k] * w;
            wSum += w;
        });
        return wSum > 0 ? sum / wSum : 0;
    }

    // ============================================================
    // 总分差 → 真实概率（附件表格）
    // ============================================================

    const PROB_TABLE = [
        { min: 1.0,        p: [0.60, 0.22, 0.18] },
        { min: 0.5,        p: [0.52, 0.26, 0.22] },
        { min: 0.2,        p: [0.46, 0.28, 0.26] },
        { min: -0.2,       p: [0.43, 0.27, 0.30] },
        { min: -0.5,       p: [0.40, 0.27, 0.33] },
        { min: -1.0,       p: [0.35, 0.26, 0.39] },
        { min: -Infinity,  p: [0.28, 0.24, 0.48] }
    ];

    function diffToProbs(diff) {
        for (let i = 0; i < PROB_TABLE.length; i++) {
            if (diff >= PROB_TABLE[i].min) return PROB_TABLE[i].p.slice();
        }
        return [0.43, 0.27, 0.30];
    }

    // 主场优势修正（附件表）
    function applyHomeAdvantage(probs, homeWinRate) {
        if (homeWinRate === null || homeWinRate === undefined) return probs;
        let [h, d, a] = probs;

        if (homeWinRate >= 0.60)      { h += 5; a -= 3; }   // 主队主场强
        else if (homeWinRate <= 0.35) { h -= 3; a += 5; }   // 主队主场弱
        else                          { h += 2; a -= 1; }   // 一般

        h = Math.max(1, h);
        a = Math.max(1, a);
        const t = h + d + a;
        return [h / t, d / t, a / t];
    }

    // ============================================================
    // 预测主函数
    // ============================================================

    function predictMatch(homeData, awayData, h2h) {
        const weights = getWeights();

        const homeDims = calcDimensions(homeData, true, h2h);
        const awayDims = calcDimensions(awayData, false, h2h);

        const hs = weightedTotal(homeDims, weights);
        const as = weightedTotal(awayDims, weights);
        const diff = hs - as;

        let probs = diffToProbs(diff);

        // 主场优势修正（仅当主队有主场数据时）
        const hTotal = (homeData.homeWins || 0) + (homeData.homeDraws || 0) + (homeData.homeLosses || 0);
        if (hTotal > 0) {
            probs = applyHomeAdvantage(probs, (homeData.homeWins || 0) / hTotal);
        }

        return {
            homeScore: hs,
            awayScore: as,
            diff: diff,
            homeProb: probs[0],
            drawProb: probs[1],
            awayProb: probs[2],
            homeDims: homeDims,
            awayDims: awayDims
        };
    }

    // ============================================================
    // 基本面判断自动推荐
    // ============================================================

    function autoSelectJudgment(hs, as) {
        const diff = hs - as;
        let val = 'equal';
        if (diff > 2.5)        val = 'home_dominant';
        else if (diff > 1.2)   val = 'home_strong';
        else if (diff > 0.5)   val = 'home_advantage';
        else if (diff < -2.5)  val = 'away_dominant';
        else if (diff < -1.2)  val = 'away_strong';
        else if (diff < -0.5)  val = 'away_advantage';
        else if (hs < 4 && as < 4) val = 'both_weak';
        App.dom.basicJudge.value = val;
    }

    // ============================================================
    // 读取表单数据
    // ============================================================

    function readTeamData(prefix) {
        const $ = App.$;
        const raw = id => { const el = $(prefix + '-' + id); return el ? el.value : ''; };
        const num = id => { const v = parseFloat(raw(id)); return isNaN(v) ? 0 : v; };
        const int = id => Math.round(num(id));

        const data = {
            // 实力
            rank: int('rank'),
            pedigree: int('pedigree'),
            teamValue: num('value'),
            // 状态
            recentPoints: int('recent'),
            goalDiff: int('gd'),
            morale: parseInt(raw('morale'), 10) || 0,
            // 阵容
            keyInjuries: int('injuries'),
            coreOut: int('core-out'),
            returning: int('return'),
            injuryInfo: raw('injury-info') || '',
            // 战意
            motivation: parseInt(raw('motivation'), 10) || 3,
            // 意外
            unexpected: raw('unexpected') || ''
        };

        if (prefix === 'home') {
            data.homeWins = int('hw');
            data.homeDraws = int('hd');
            data.homeLosses = int('hl');
        } else {
            data.awayWins = int('aw');
            data.awayDraws = int('ad');
            data.awayLosses = int('al');
        }
        return data;
    }

    function readH2H() {
        const d = App.dom;
        return {
            homeWins: parseInt(d.h2hHomeWins.value, 10) || 0,
            draws: parseInt(d.h2hDraws.value, 10) || 0,
            awayWins: parseInt(d.h2hAwayWins.value, 10) || 0,
            last: d.h2hLast ? d.h2hLast.value : ''
        };
    }

    // ============================================================
    // 结果渲染
    // ============================================================

    function renderDims(homeDims, awayDims) {
        const box = App.dom.resultDetail;
        if (!box) return;

        const rows = App.DIM_KEYS.map(k => {
            const h = homeDims[k], a = awayDims[k];
            const df = h - a;
            const cls = df > 0.05 ? 'pos' : (df < -0.05 ? 'neg' : '');
            const color = df > 0.05 ? '#16a34a' : (df < -0.05 ? '#dc2626' : '#64748b');
            return `<tr>
                <td>${App.DIM_LABELS[k]}</td>
                <td style="text-align:right">${h.toFixed(2)}</td>
                <td style="text-align:right">${a.toFixed(2)}</td>
                <td style="text-align:right;color:${color};font-weight:600">
                    ${df > 0 ? '+' : ''}${df.toFixed(2)}
                </td>
            </tr>`;
        }).join('');

        box.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px">
                <thead>
                    <tr style="background:#f1f5f9">
                        <th style="text-align:left;padding:6px 8px">维度</th>
                        <th style="text-align:right;padding:6px 8px">主队</th>
                        <th style="text-align:right;padding:6px 8px">客队</th>
                        <th style="text-align:right;padding:6px 8px">差值</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

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

        renderDims(result.homeDims, result.awayDims);

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

    // ============================================================
    // 导出
    // ============================================================

    App.scoring = {
        // 子评分
        rankTo10, valueTo10, strengthScore,
        formPointsTo10, goalDiffTo10, moraleTo10, formScore,
        homeAwayScore, personnelScore, motivationScore, h2hScore,
        // 主流程
        getWeights, calcDimensions, weightedTotal,
        diffToProbs, applyHomeAdvantage, predictMatch,
        autoSelectJudgment, readTeamData, readH2H,
        displayResult, renderDims, compute
    };
})();