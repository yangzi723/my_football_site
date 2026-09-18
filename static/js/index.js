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
            home_rank: homeData.rank,
            home_scored: homeData.goalsScored,
            home_conceded: homeData.goalsConceded,
            home_recent: homeData.recentPoints,
            home_wins: homeData.homeWins || 0,
            home_draws: homeData.homeDraws || 0,
            home_losses: homeData.homeLosses || 0,
            home_injuries: homeData.keyInjuries,
            home_motivation: homeData.motivation,
            home_value: homeData.teamValue,
            home_unexpected: homeData.unexpected,
            away_rank: awayData.rank,
            away_scored: awayData.goalsScored,
            away_conceded: awayData.goalsConceded,
            away_recent: awayData.recentPoints,
            away_wins: awayData.awayWins || 0,
            away_draws: awayData.awayDraws || 0,
            away_losses: awayData.awayLosses || 0,
            away_injuries: awayData.keyInjuries,
            away_motivation: awayData.motivation,
            away_value: awayData.teamValue,
            away_unexpected: awayData.unexpected,
            home_score: result.homeScore,
            away_score: result.awayScore,
            home_prob: result.homeProb,
            draw_prob: result.drawProb,
            away_prob: result.awayProb,
            judgment: d.basicJudge.value,
            h2h_home_wins: h2h.homeWins,
            h2h_draws: h2h.draws,
            h2h_away_wins: h2h.awayWins
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
        document.querySelectorAll('select').forEach(sel => sel.selectedIndex = 0);

        d.h2hHomeWins.value = 0;
        d.h2hDraws.value = 0;
        d.h2hAwayWins.value = 0;

        d.resultArea.style.display = 'none';

        const defaults = App.DEFAULT_WEIGHTS;
        d.sliders.forEach(s => {
            s.value = defaults[s.dataset.key] || 10;
            s.parentElement.querySelector('.weight-val').textContent = s.value;
        });

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

    // ---- 事件绑定 ----
    function bindEvents() {
        const d = App.dom;

        // 权重滑块显示
        d.sliders.forEach(s => {
            s.addEventListener('input', function () {
                this.parentElement.querySelector('.weight-val').textContent = this.value;
            });
        });

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

        // 抓取列表点击行 -> 填充比赛信息
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
            App.showToast('已填充比赛信息，请补充统计数据并点击计算');
        });
    }

    // ---- 初始化 ----
    function init() {
        App.initDomRefs();
        bindEvents();
        App.api.fillFromUrlParams();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();