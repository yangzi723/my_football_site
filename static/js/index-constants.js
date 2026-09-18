/* ============================================================
 * index 页面常量与 DOM 引用
 * 全局命名空间：window.IndexApp
 * ============================================================ */
(function () {
    "use strict";

    const App = window.IndexApp = window.IndexApp || {};

    // ---- 评分常量 ----
    App.LEAGUE_AVG_GOALS_SCORED = 1.5;
    App.LEAGUE_AVG_GOALS_CONCEDED = 1.5;
    App.LEAGUE_AVG_VALUE = 70.0;

    // ---- 工具 ----
    App.$ = function (id) { return document.getElementById(id); };

    // ---- DOM 引用（DOM 就绪后填充） ----
    App.dom = null;

    App.initDomRefs = function () {
        const $ = App.$;
        App.dom = {
            // 顶部元信息
            homeName: $('home-name'),
            awayName: $('away-name'),
            leagueName: $('league-name'),
            matchDate: $('match-date'),
            matchTime: $('match-time'),

            // 主队
            homeRank: $('home-rank'),
            homeScored: $('home-scored'),
            homeConceded: $('home-conceded'),
            homeRecent: $('home-recent'),
            homeHW: $('home-hw'),
            homeHD: $('home-hd'),
            homeHL: $('home-hl'),
            homeInjuries: $('home-injuries'),
            homeMotivation: $('home-motivation'),
            homeValue: $('home-value'),
            homeUnexpected: $('home-unexpected'),
            homeInjuryInfo: $('home-injury-info'),   // ★ 新增

            // 客队
            awayRank: $('away-rank'),
            awayScored: $('away-scored'),
            awayConceded: $('away-conceded'),
            awayRecent: $('away-recent'),
            awayAW: $('away-aw'),
            awayAD: $('away-ad'),
            awayAL: $('away-al'),
            awayInjuries: $('away-injuries'),
            awayMotivation: $('away-motivation'),
            awayValue: $('away-value'),
            awayUnexpected: $('away-unexpected'),
            awayInjuryInfo: $('away-injury-info'),   // ★ 新增

            // H2H
            h2hHomeWins: $('h2h-home-wins'),
            h2hDraws: $('h2h-draws'),
            h2hAwayWins: $('h2h-away-wins'),

            // 结果区
            resultArea: $('resultArea'),
            resultHomeName: $('result-home-name'),
            resultAwayName: $('result-away-name'),
            resultHomeScore: $('result-home-score'),
            resultAwayScore: $('result-away-score'),
            probHome: $('prob-home'),
            probDraw: $('prob-draw'),
            probAway: $('prob-away'),
            barHome: $('bar-home'),
            barDraw: $('bar-draw'),
            barAway: $('bar-away'),
            unexpectedDisplay: $('unexpected-display'),
            basicJudge: $('basic-judge'),
            saveBtn: $('saveBtn'),
            toast: $('toast'),

            // 按钮
            fetchBtn: $('fetchBtn'),
            calcBtn: $('calcBtn'),
            resetBtn: $('resetBtn'),

            // 模态框
            modal: $('matchModal'),
            modalClose: $('modalClose'),
            matchListBody: $('matchListBody'),
            loaderArea: $('loaderArea'),
            tableContainer: $('tableContainer'),
            progressFill: $('progressFill'),
            progressPercent: $('progressPercent'),

            // 权重滑块
            sliders: document.querySelectorAll('.w-slider')
        };
    };

    // ---- 权重默认值 ----
    App.DEFAULT_WEIGHTS = {
        strength: 25,
        form: 20,
        home_away: 15,
        personnel: 10,
        motivation: 10,
        value: 10,
        h2h: 10
    };

    // ---- Toast ----
    let toastTimer = null;
    App.showToast = function (msg, isError) {
        const toast = App.dom.toast;
        if (!toast) return;
        toast.textContent = msg;
        toast.style.background = isError ? '#dc2626' : '#1f3a5f';
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    };
})();