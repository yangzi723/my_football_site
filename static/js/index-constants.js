/* ============================================================
 * index 页面常量与 DOM 引用
 * 全局命名空间：window.IndexApp
 * 六维量化模型：实力 / 状态 / 主客场 / 阵容 / 战意 / 交锋
 * ============================================================ */
(function () {
    "use strict";

    const App = window.IndexApp = window.IndexApp || {};

    // ---- 评分常量 ----
    App.LEAGUE_AVG_VALUE = 70.0;   // 联赛平均身价基准（百万欧）
    App.TOTAL_TEAMS = 20;          // 联赛球队数（用于排名归一化）

    // ---- 维度定义（与滑块 data-key 对应）----
    App.DIM_KEYS = ['strength', 'form', 'home_away', 'personnel', 'motivation', 'h2h'];
    App.DIM_LABELS = {
        strength: '实力',
        form: '状态',
        home_away: '主客场',
        personnel: '阵容',
        motivation: '战意',
        h2h: '交锋'
    };

    // ---- 工具 ----
    App.$ = function (id) { return document.getElementById(id); };

    // ---- DOM 引用（DOM 就绪后填充） ----
    App.dom = null;

    App.initDomRefs = function () {
        const $ = App.$;
        App.dom = {
            homeName: $('home-name'),
            awayName: $('away-name'),
            leagueName: $('league-name'),
            matchDate: $('match-date'),
            matchTime: $('match-time'),

            // 主队 —— 六维
            homeRank: $('home-rank'),
            homePedigree: $('home-pedigree'),
            homeValue: $('home-value'),
            homeRecent: $('home-recent'),
            homeGd: $('home-gd'),
            homeMorale: $('home-morale'),
            homeHW: $('home-hw'),
            homeHD: $('home-hd'),
            homeHL: $('home-hl'),
            homeInjuries: $('home-injuries'),
            homeCoreOut: $('home-core-out'),
            homeReturn: $('home-return'),
            homeInjuryInfo: $('home-injury-info'),
            homeMotivation: $('home-motivation'),
            homeUnexpected: $('home-unexpected'),

            // 客队 —— 六维
            awayRank: $('away-rank'),
            awayPedigree: $('away-pedigree'),
            awayValue: $('away-value'),
            awayRecent: $('away-recent'),
            awayGd: $('away-gd'),
            awayMorale: $('away-morale'),
            awayAW: $('away-aw'),
            awayAD: $('away-ad'),
            awayAL: $('away-al'),
            awayInjuries: $('away-injuries'),
            awayCoreOut: $('away-core-out'),
            awayReturn: $('away-return'),
            awayInjuryInfo: $('away-injury-info'),
            awayMotivation: $('away-motivation'),
            awayUnexpected: $('away-unexpected'),

            // 交锋
            h2hHomeWins: $('h2h-home-wins'),
            h2hDraws: $('h2h-draws'),
            h2hAwayWins: $('h2h-away-wins'),
            h2hLast: $('h2h-last'),

            // 权重方案
            weightPreset: $('weight-preset'),

            // 结果区
            resultArea: $('resultArea'),
            resultHomeName: $('result-home-name'),
            resultAwayName: $('result-away-name'),
            resultHomeScore: $('result-home-score'),
            resultAwayScore: $('result-away-score'),
            resultDetail: $('result-detail'),
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

            fetchBtn: $('fetchBtn'),
            calcBtn: $('calcBtn'),
            resetBtn: $('resetBtn'),

            modal: $('matchModal'),
            modalClose: $('modalClose'),
            matchListBody: $('matchListBody'),
            loaderArea: $('loaderArea'),
            tableContainer: $('tableContainer'),
            progressFill: $('progressFill'),
            progressPercent: $('progressPercent'),

            sliders: document.querySelectorAll('.w-slider')
        };
    };

    // ---- 权重方案预设 ----
    App.WEIGHT_PRESETS = {
        balanced: {
            name: '稳健型（默认，赛季中后期）',
            values: { strength: 30, form: 25, home_away: 20, personnel: 15, motivation: 5, h2h: 5 }
        },
        early: {
            name: '赛季初型（1-10 轮，重实力/身价）',
            values: { strength: 38, form: 15, home_away: 18, personnel: 14, motivation: 5, h2h: 10 }
        },
        keyMatch: {
            name: '关键战型（德比/保级/欧战，重状态/战意）',
            values: { strength: 25, form: 25, home_away: 18, personnel: 15, motivation: 12, h2h: 5 }
        }
    };

    // ---- 默认权重（稳健型）----
    App.DEFAULT_WEIGHTS = Object.assign({}, App.WEIGHT_PRESETS.balanced.values);

    // 尝试读取用户自定义权重（权重学习页面设置），只接受六维键
    try {
        const custom = localStorage.getItem('index_custom_weights');
        if (custom) {
            const parsed = JSON.parse(custom);
            if (parsed && typeof parsed === 'object') {
                const clean = {};
                App.DIM_KEYS.forEach(k => {
                    const v = parseFloat(parsed[k]);
                    if (!isNaN(v) && v >= 0) clean[k] = v;
                });
                if (Object.keys(clean).length === App.DIM_KEYS.length) {
                    App.DEFAULT_WEIGHTS = clean;
                    console.log('✅ 已加载自定义权重:', App.DEFAULT_WEIGHTS);
                }
            }
        }
    } catch (e) {
        console.warn('读取自定义权重失败:', e);
    }

    // ---- Toast ----
    let toastTimer = null;
    App.showToast = function (msg, isError) {
        const toast = App.dom && App.dom.toast;
        if (!toast) return;
        toast.textContent = msg;
        toast.style.background = isError ? '#dc2626' : '#1f3a5f';
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    };
})();