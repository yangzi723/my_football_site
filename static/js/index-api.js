/* ============================================================
 * index 页面数据加载 / 填充
 * ============================================================ */
(function () {
    "use strict";

    const App = window.IndexApp = window.IndexApp || {};

    // ---- 表单回填 ----
    function fillMatchData(m) {
        const d = App.dom;
        d.homeName.value = m.home_team;
        d.awayName.value = m.away_team;
        d.leagueName.value = m.league || '';
        d.matchDate.value = m.date || '';
        d.matchTime.value = m.time || '';

        d.homeRank.value = m.home_rank;
        d.homeScored.value = m.home_scored;
        d.homeConceded.value = m.home_conceded;
        d.homeRecent.value = m.home_recent;
        d.homeHW.value = m.home_wins;
        d.homeHD.value = m.home_draws;
        d.homeHL.value = m.home_losses;
        d.homeInjuries.value = m.home_injuries;
        d.homeMotivation.value = m.home_motivation;
        d.homeValue.value = m.home_value;
        d.homeUnexpected.value = m.home_unexpected || '';
        d.homeInjuryInfo.value = m.home_injury_info || '';   // ★ 新增

        d.awayRank.value = m.away_rank;
        d.awayScored.value = m.away_scored;
        d.awayConceded.value = m.away_conceded;
        d.awayRecent.value = m.away_recent;
        d.awayAW.value = m.away_wins;
        d.awayAD.value = m.away_draws;
        d.awayAL.value = m.away_losses;
        d.awayInjuries.value = m.away_injuries;
        d.awayMotivation.value = m.away_motivation;
        d.awayValue.value = m.away_value;
        d.awayUnexpected.value = m.away_unexpected || '';
        d.awayInjuryInfo.value = m.away_injury_info || '';   // ★ 新增

        // H2H 回填
        d.h2hHomeWins.value = (m.h2h_home_wins != null) ? m.h2h_home_wins : 0;
        d.h2hDraws.value = (m.h2h_draws != null) ? m.h2h_draws : 0;
        d.h2hAwayWins.value = (m.h2h_away_wins != null) ? m.h2h_away_wins : 0;

        // 结果区
        d.resultArea.style.display = 'block';
        d.resultHomeName.textContent = m.home_team;
        d.resultAwayName.textContent = m.away_team;
        d.resultHomeScore.textContent = Number(m.home_score).toFixed(2);
        d.resultAwayScore.textContent = Number(m.away_score).toFixed(2);

        const pH = m.home_prob * 100;
        const pD = m.draw_prob * 100;
        const pA = m.away_prob * 100;
        d.probHome.textContent = pH.toFixed(1) + '%';
        d.probDraw.textContent = pD.toFixed(1) + '%';
        d.probAway.textContent = pA.toFixed(1) + '%';
        d.barHome.style.width = pH + '%';
        d.barHome.textContent = pH >= 5 ? '主胜' : '';
        d.barDraw.style.width = pD + '%';
        d.barDraw.textContent = pD >= 5 ? '平局' : '';
        d.barAway.style.width = pA + '%';
        d.barAway.textContent = pA >= 5 ? '客胜' : '';

        d.basicJudge.value = m.judgment || 'equal';

        const hU = m.home_unexpected || '';
        const aU = m.away_unexpected || '';
        if (hU || aU) {
            d.unexpectedDisplay.style.display = 'block';
            let html = '⚠️ 意外因素：';
            if (hU) html += `<br>🏠 ${m.home_team}: ${hU}`;
            if (aU) html += `<br>✈️ ${m.away_team}: ${aU}`;
            d.unexpectedDisplay.innerHTML = html;
        } else {
            d.unexpectedDisplay.style.display = 'none';
        }
    }

    // ---- 按 ID 加载 ----
    function loadMatchById(id) {
        return fetch('/api/match/' + id)
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(m => {
                if (m && m.error) {
                    App.showToast('未找到该记录');
                    return;
                }
                fillMatchData(m);
            })
            .catch(() => {
                App.showToast('加载失败');
            });
    }

    // ---- 加载最新一条 ----
    function loadLatestMatch() {
        return fetch('/api/history?limit=1')
            .then(res => res.json())
            .then(data => {
                if (data.data && data.data.length > 0) {
                    fillMatchData(data.data[0]);
                }
            })
            .catch(() => {});
    }

    // ---- 按日期 + 主客队查询 ----
    function findMatch(date, home, away) {
        const url = '/api/match/find?date=' + encodeURIComponent(date)
                  + '&home_team=' + encodeURIComponent(home)
                  + '&away_team=' + encodeURIComponent(away);
        return fetch(url).then(res => res.json());
    }

    // ---- 处理 URL 参数 ----
    function fillFromUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        const date = params.get('date');
        const time = params.get('time');
        const league = params.get('league');
        const home = params.get('home');
        const away = params.get('away');
        const d = App.dom;

        if (id) {
            return loadMatchById(id);
        }

        if (date && home && away) {
            return findMatch(date, home, away)
                .then(data => {
                    if (data && data.id) {
                        fillMatchData(data);
                    } else {
                        d.matchDate.value = date;
                        d.matchTime.value = time || '';
                        d.leagueName.value = league || '';
                        d.homeName.value = home;
                        d.awayName.value = away;
                        setTimeout(App.scoring.compute, 200);
                    }
                })
                .catch(() => {});
        }

        if (home) d.homeName.value = home;
        if (away) d.awayName.value = away;
        if (league) d.leagueName.value = league;
        if (date) d.matchDate.value = date;
        if (time) d.matchTime.value = time;
        return loadLatestMatch();
    }

    App.api = {
        fillMatchData,
        loadMatchById,
        loadLatestMatch,
        findMatch,
        fillFromUrlParams
    };
})();