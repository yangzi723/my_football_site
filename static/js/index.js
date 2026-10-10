/* ============================================================
 * index 页面主入口：事件绑定、保存、重置、抓取
 * 依赖：index-constants.js / index-scoring.js / index-api.js
 * ============================================================ */
(function () {
    "use strict";

    const App = window.IndexApp = window.IndexApp || {};

    // ---- 保存 ----
    function savePrediction() {
        const d = App.dom;
        const hName = d.homeName.value.trim() || '主队';
        const aName = d.awayName.value.trim() || '客队';

        const homeData = App.scoring.readTeamData('home');
        const awayData = App.scoring.readTeamData('away');
        const h2h = App.scoring.readH2H();
        const result = App.scoring.predictMatch(homeData, awayData, h2h);

        const payload = {
            date: d.matchDate.value || '',
            time: d.matchTime.value || '',
            league: d.leagueName.value || '',
            home_team: hName,
            away_team: aName,

            // ===== 主队 · 六维 =====
            home_rank: homeData.rank,
            home_pedigree: homeData.pedigree,
            home_value: homeData.teamValue,

            home_recent: homeData.recentPoints,
            home_gd: homeData.goalDiff,
            home_morale: homeData.morale,

            home_wins: homeData.homeWins || 0,
            home_draws: homeData.homeDraws || 0,
            home_losses: homeData.homeLosses || 0,

            home_injuries: homeData.keyInjuries,
            home_core_out: homeData.coreOut,
            home_return: homeData.returning,
            home_injury_info: homeData.injuryInfo || '',

            home_motivation: homeData.motivation,
            home_unexpected: homeData.unexpected || '',

            // 旧字段（后端兼容，保留占位）
            home_scored: 0,
            home_conceded: 0,

            // ===== 客队 · 六维 =====
            away_rank: awayData.rank,
            away_pedigree: awayData.pedigree,
            away_value: awayData.teamValue,

            away_recent: awayData.recentPoints,
            away_gd: awayData.goalDiff,
            away_morale: awayData.morale,

            away_wins: awayData.awayWins || 0,
            away_draws: awayData.awayDraws || 0,
            away_losses: awayData.awayLosses || 0,

            away_injuries: awayData.keyInjuries,
            away_core_out: awayData.coreOut,
            away_return: awayData.returning,
            away_injury_info: awayData.injuryInfo || '',

            away_motivation: awayData.motivation,
            away_unexpected: awayData.unexpected || '',

            away_scored: 0,
            away_conceded: 0,

            // ===== 结果 =====
            home_score: result.homeScore,
            away_score: result.awayScore,
            home_prob: result.homeProb,
            draw_prob: result.drawProb,
            away_prob: result.awayProb,
            judgment: d.basicJudge.value,

            // ===== 交锋 =====
            h2h_home_wins: h2h.homeWins,
            h2h_draws: h2h.draws,
            h2h_away_wins: h2h.awayWins,
            h2h_last: h2h.last || ''
        };

        fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                App.showToast('✅ 预测保存成功！ID: ' + res.id);
                const url = new URL(window.location);
                url.searchParams.set('id', res.id);
                window.history.replaceState({}, '', url);
            } else {
                App.showToast('❌ 保存失败: ' + (res.error || '未知错误'), true);
            }
        })
        .catch(err => App.showToast('❌ 请求出错: ' + err.message, true));
    }

    // ---- 重置 ----
    function resetForm() {
        const d = App.dom;
        document.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]')
            .forEach(inp => inp.value = '');
        document.querySelectorAll('textarea').forEach(t => t.value = '');

        // 下拉框回到各自默认
        d.homeMorale.value = '0';
        d.awayMorale.value = '0';
        d.homeMotivation.value = '3';
        d.awayMotivation.value = '3';
        if (d.h2hLast) d.h2hLast.value = '';
        if (d.basicJudge) d.basicJudge.value = 'equal';

        d.h2hHomeWins.value = 0;
        d.h2hDraws.value = 0;
        d.h2hAwayWins.value = 0;

        d.resultArea.style.display = 'none';
        if (d.resultDetail) d.resultDetail.innerHTML = '';

        // 重置权重
        const defaults = App.DEFAULT_WEIGHTS;
        d.sliders.forEach(s => {
            const key = s.dataset.key;
            if (defaults[key] !== undefined) {
                s.value = defaults[key];
                s.parentElement.querySelector('.weight-val').textContent = s.value;
            }
        });
        if (d.weightPreset) d.weightPreset.value = 'balanced';

        App.showToast('已重置');
    }

    // ---- 抓取比赛（占位） ----
    function fetchMatches() {
        const d = App.dom;
        d.modal.style.display = 'flex';
        d.loaderArea.style.display = 'block';
        d.tableContainer.style.display = 'none';
        let progress = 0;

        const interval = setInterval(() => {
            progress += 10;
            if (progress > 100) progress = 100;
            d.progressFill.style.width = progress + '%';
            d.progressPercent.textContent = progress + '%';
            if (progress === 100) {
                clearInterval(interval);
                setTimeout(() => {
                    d.loaderArea.style.display = 'none';
                    d.tableContainer.style.display = 'block';
                    d.matchListBody.innerHTML = `
                        <tr><td>2026-09-06</td><td>19:30</td><td>Premier League</td><td>Arsenal</td><td>Chelsea</td><td>2-1</td></tr>
                        <tr><td>2026-09-06</td><td>20:00</td><td>La Liga</td><td>Barcelona</td><td>Real Madrid</td><td>1-1</td></tr>
                    `;
                }, 300);
            }
        }, 300);
    }

    // ---- 把默认权重写入滑块 ----
    function applyDefaultWeightsToSliders() {
        const d = App.dom;
        if (!d || !d.sliders) return;
        const dw = App.DEFAULT_WEIGHTS || {};
        d.sliders.forEach(s => {
            const key = s.dataset.key;
            if (dw[key] !== undefined) {
                s.value = dw[key];
                s.parentElement.querySelector('.weight-val').textContent = s.value;
            }
        });
    }

    // ---- 事件绑定 ----
    function bindEvents() {
        const d = App.dom;

        // 权重滑块显示
        d.sliders.forEach(s => {
            s.addEventListener('input', function () {
                this.parentElement.querySelector('.weight-val').textContent = this.value;
            });
        });

        // 权重方案切换
        if (d.weightPreset) {
            d.weightPreset.addEventListener('change', function () {
                const preset = App.WEIGHT_PRESETS && App.WEIGHT_PRESETS[this.value];
                if (!preset) return;
                d.sliders.forEach(s => {
                    const key = s.dataset.key;
                    if (preset.values[key] !== undefined) {
                        s.value = preset.values[key];
                        s.parentElement.querySelector('.weight-val').textContent = s.value;
                    }
                });
                App.showToast('✅ 已切换到：' + preset.name);
            });
        }

        // 主按钮
        d.calcBtn.addEventListener('click', App.scoring.compute);
        d.resetBtn.addEventListener('click', resetForm);
        d.fetchBtn.addEventListener('click', fetchMatches);
        d.saveBtn.addEventListener('click', savePrediction);

        // 模态框
        d.modalClose.addEventListener('click', function () {
            d.modal.style.display = 'none';
        });
        window.addEventListener('click', function (e) {
            if (e.target === d.modal) d.modal.style.display = 'none';
        });

        // 抓取列表点击行 → 填充比赛信息
        d.matchListBody.addEventListener('click', function (e) {
            const row = e.target.closest('tr');
            if (!row) return;
            const cells = row.querySelectorAll('td');
            if (cells.length < 5) return;
            d.matchDate.value = cells[0].textContent.trim();
            d.matchTime.value = cells[1].textContent.trim();
            d.leagueName.value = cells[2].textContent.trim();
            d.homeName.value = cells[3].textContent.trim();
            d.awayName.value = cells[4].textContent.trim();
            d.modal.style.display = 'none';
            App.showToast('已填充比赛信息，请补充六维数据并点击计算');
        });
    }

    // ---- 初始化 ----
    function init() {
        App.initDomRefs();
        bindEvents();
        applyDefaultWeightsToSliders();
        App.api.fillFromUrlParams();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();