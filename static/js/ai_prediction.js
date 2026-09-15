(function() {
    "use strict";

    // HTML 转义（用于 textarea 内容安全输出）
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // textarea 自动增高（最高 200px）
    function autoResizeTextarea(el) {
        if (!el) return;
        el.style.height = 'auto';
        const h = Math.min(el.scrollHeight, 200);
        el.style.height = h + 'px';
        el.style.overflowY = el.scrollHeight > 200 ? 'auto' : 'hidden';
    }

    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    /* ============================================================
     * 读取 URL 上的 result 参数（如 ?result=红 / ?result=待定）
     * ============================================================ */
    const urlParams = new URLSearchParams(window.location.search);
    const urlResultFilter = urlParams.get('result') || '';
    let clientFilterCache = { key: '', data: [] };

    const tbody = document.getElementById('historyBody');
    const loading = document.getElementById('loading');
    const tableWrap = document.getElementById('tableWrap');
    const filterDate = document.getElementById('filter-date');
    const filterLeague = document.getElementById('filter-league');
    const filterBtn = document.getElementById('filterBtn');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    const analysisModal = document.getElementById('aiAnalysisModal');
    const analysisModalTitle = document.getElementById('aiAnalysisModalTitle');
    const analysisInfoContainer = document.getElementById('aiAnalysisInfoContainer');
    const closeAnalysisBtn = document.getElementById('aiCloseAnalysisBtn');
    const saveAnalysisBtn = document.getElementById('aiSaveAnalysisBtn');

    const editModal = document.getElementById('editModal');
    const editTitle = document.getElementById('editTitle');
    const editFormContainer = document.getElementById('editFormContainer');
    const saveEditBtn = document.getElementById('saveEditBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const addMatchBtn = document.getElementById('addMatchBtn');

    const pagination = document.getElementById('pagination');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageNumbers = document.getElementById('pageNumbers');
    const perPageSelect = document.getElementById('perPageSelect');
    const totalCountSpan = document.getElementById('totalCount');
    const toast = document.getElementById('toast');

    let currentOffset = 0, currentLimit = 20, currentDateFilter = '', currentLeagueFilter = '', totalItems = 0;

    const judgmentMap = {
        'home_advantage': '主队占优',
        'away_advantage': '客队占优',
        'equal': '两队实力相当',
        'home_strong': '主队较强优势',
        'away_strong': '客队较强优势',
        'home_dominant': '主队绝对优势',
        'away_dominant': '客队绝对优势',
        'both_weak': '两队菜鸡',
        'home_slight': '主队略占优',
        'away_slight': '客队略占优'
    };

    let toastTimer;

    function showToast(msg, isError = false) {
        toast.textContent = msg;
        toast.style.background = isError ? '#dc2626' : '#1f3a5f';
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function getPredictionDisplay(initialPrediction) {
        if (!initialPrediction) return '';
        if (typeof initialPrediction === 'string') {
            try {
                const parsed = JSON.parse(initialPrediction);
                if (Array.isArray(parsed)) return parsed.join('、');
                return initialPrediction;
            } catch (e) { return initialPrediction; }
        }
        return initialPrediction;
    }

    function getInitialPredictionArray(data) {
        let val = data.initial_prediction || '';
        if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) return parsed;
                return [];
            } catch (e) { return val ? [val] : []; }
        }
        return [];
    }

    function saveField(id, field, value) {
        return fetch('/api/match/' + id + '?source=ai')
            .then(res => { if (!res.ok) throw new Error('获取数据失败'); return res.json(); })
            .then(data => {
                const payload = { ...data };
                payload[field] = value;
                return fetch('/api/match/' + id + '?source=ai', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            })
            .then(res => {
                if (!res.ok) return res.json().then(err => { throw new Error(err.error || '保存失败'); });
                return res.json();
            });
    }

    function updateLeagueSelect(matches) {
        const select = document.getElementById('filter-league');
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = '<option value="">全部联赛</option>';
        const leagues = new Set();
        matches.forEach(m => { if (m.league) leagues.add(m.league); });
        Array.from(leagues).sort().forEach(league => {
            const opt = document.createElement('option');
            opt.value = league;
            opt.textContent = league;
            select.appendChild(opt);
        });
        if (currentValue && leagues.has(currentValue)) {
            select.value = currentValue;
        }
    }

    function renderRows(matches) {
        if (matches.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:30px;">暂无预测记录</td></tr>';
            return;
        }

        let html = '';
        matches.forEach(m => {
            const result = m.result || '未定';
            let resultHtml = result;
            if (result === '红') resultHtml = `<span style="color:#dc2626;font-weight:600;">红</span>`;
            else if (result === '黑') resultHtml = `<span style="color:#1f2937;font-weight:600;">黑</span>`;
            else if (result === '走盘') resultHtml = `<span style="color:#d97706;font-weight:600;">走盘</span>`;

            const judgmentDisplay = judgmentMap[m.judgment] || m.judgment || '';

            let fundDisplay = [];
            if (m.fundamental_divergence === '是') fundDisplay.push('背离');
            if (m.fundamental_match === '是') fundDisplay.push('相符');
            const fundText = fundDisplay.length ? fundDisplay.join('、') : '—';

            const predDisplay = getPredictionDisplay(m.initial_prediction) || '—';
            const asianOdds = m.asian_odds || '';
            const betChecked = m.bet === '是';

            html += `<tr>
                    <td class="checkbox-cell"><input type="checkbox" class="row-checkbox" data-id="${m.id}"></td>
                    <td>${m.id}</td>
                    <td>${m.league || ''}</td>
                    <td><a href="/index?id=${m.id}" class="team-link">${m.home_team}</a> <span class="vs-large">VS</span> <a href="/index?id=${m.id}" class="team-link">${m.away_team}</a></td>
                    <td>${fundText}</td>
                    <td>${judgmentDisplay}</td>
                    <td>${asianOdds}</td>
                    <td><span class="pred-display">${predDisplay}</span></td>
                    <td style="text-align:center;"><input type="checkbox" class="bet-checkbox" data-id="${m.id}" ${betChecked ? 'checked' : ''}></td>
                    <td>
                        <select class="result-select" data-id="${m.id}">
                            <option value="">未定</option>
                            <option value="红" ${result==='红'?'selected':''}>红</option>
                            <option value="黑" ${result==='黑'?'selected':''}>黑</option>
                            <option value="走盘" ${result==='走盘'?'selected':''}>走盘</option>
                        </select>
                    </td>
                    <td>
                        <button class="action-btn odds-analysis-btn" data-id="${m.id}">📊 AI分析</button>
                        <button class="action-btn delete-btn" data-id="${m.id}">🗑️ 删除</button>
                    </td>
                </tr>`;
        });
        tbody.innerHTML = html;
        bindEvents();
    }

    async function loadWithClientFilter(date, league, limit, offset) {
        loading.style.display = 'block';
        tableWrap.style.display = 'none';

        const cacheKey = (date || '') + '|' + (league || '');

        if (clientFilterCache.key !== cacheKey) {
            const all = [];
            let o = 0;
            const pageSize = 200;
            let round = 0;
            const maxRounds = 500;

            while (round++ < maxRounds) {
                let url = `/api/history?limit=${pageSize}&offset=${o}&source=ai`;
                if (date) url += '&date=' + encodeURIComponent(date);
                if (league) url += '&league=' + encodeURIComponent(league);

                let data;
                try {
                    const res = await fetch(url, { cache: 'no-store' });
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    data = await res.json();
                } catch (e) {
                    loading.textContent = '❌ 加载失败: ' + e.message;
                    console.error('客户端过滤加载失败:', e);
                    return;
                }

                const items = data.data || [];
                if (items.length === 0) break;

                all.push(...items);

                const t = Number(data.total);
                if (Number.isFinite(t) && t > 0 && all.length >= t) break;

                o += items.length;
            }

            clientFilterCache.data = all.filter(m => {
                if (urlResultFilter === '待定') {
                    return !m.result || m.result === '' || m.result === null || m.result === undefined;
                }
                return m.result === urlResultFilter;
            });
            clientFilterCache.key = cacheKey;
        }

        const filtered = clientFilterCache.data;
        totalItems = filtered.length;

        loading.style.display = 'none';
        tableWrap.style.display = 'block';

        if (!date && !league) {
            updateLeagueSelect(filtered);
        }

        currentLimit = limit;
        currentOffset = Math.min(offset, Math.max(0, totalItems - 1));
        if (currentOffset < 0) currentOffset = 0;

        const pageData = filtered.slice(currentOffset, currentOffset + currentLimit);
        renderRows(pageData);
        updatePagination();
    }

    function loadHistory(date, league, limit, offset) {
        if (date === undefined) date = currentDateFilter;
        if (league === undefined) league = currentLeagueFilter;
        if (limit === undefined) limit = currentLimit;
        if (offset === undefined) offset = currentOffset;

        currentDateFilter = date;
        currentLeagueFilter = league;

        if (urlResultFilter) {
            return loadWithClientFilter(date, league, limit, offset);
        }

        loading.style.display = 'block';
        tableWrap.style.display = 'none';
        let url = `/api/history?limit=${limit}&offset=${offset}&source=ai`;
        if (date) url += '&date=' + date;
        if (league) url += '&league=' + encodeURIComponent(league);

        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                loading.style.display = 'none';
                tableWrap.style.display = 'block';
                const matches = data.data || [];
                totalItems = data.total || 0;
                currentLimit = data.limit || limit;
                currentOffset = data.offset || offset;

                if (!date && !league) {
                    updateLeagueSelect(matches);
                }

                renderRows(matches);
                updatePagination();
            })
            .catch(err => {
                loading.textContent = '❌ 加载失败: ' + err.message;
                console.error('加载失败:', err);
            });
    }

    function bindEvents() {
        document.querySelectorAll('.result-select').forEach(sel => {
            sel.addEventListener('change', function() {
                const id = this.dataset.id;
                const val = this.value;
                fetch('/api/match/' + id + '/result?source=ai', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ result: val || null })
                })
                .then(res => res.json())
                .then(res => {
                    if (res.success) {
                        if (urlResultFilter) clientFilterCache.key = '';
                        loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                    } else alert('更新失败: ' + (res.error || '未知错误'));
                });
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                if (confirm('确定删除该预测记录吗？')) {
                    fetch('/api/match/' + id + '?source=ai', { method: 'DELETE' })
                        .then(res => res.json())
                        .then(res => {
                            if (res.success) {
                                if (urlResultFilter) clientFilterCache.key = '';
                                loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                            } else alert('删除失败: ' + (res.error || '未知错误'));
                        });
                }
            });
        });

        selectAllCheckbox.addEventListener('change', function() {
            const checked = this.checked;
            document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = checked);
        });

        batchDeleteBtn.addEventListener('click', function() {
            const selected = document.querySelectorAll('.row-checkbox:checked');
            if (selected.length === 0) { showToast('请至少选择一条记录'); return; }
            if (!confirm(`确定要删除 ${selected.length} 条记录吗？此操作不可恢复！`)) return;
            const ids = Array.from(selected).map(cb => parseInt(cb.dataset.id));
            let successCount = 0, failCount = 0;
            ids.forEach(id => {
                fetch('/api/match/' + id + '?source=ai', { method: 'DELETE' })
                    .then(res => res.json())
                    .then(res => {
                        res.success ? successCount++ : failCount++;
                        if (successCount + failCount === ids.length) {
                            showToast(`批量删除完成：成功 ${successCount} 条，失败 ${failCount} 条`);
                            if (urlResultFilter) clientFilterCache.key = '';
                            loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                        }
                    })
                    .catch(() => {
                        failCount++;
                        if (successCount + failCount === ids.length) {
                            showToast(`批量删除完成：成功 ${successCount} 条，失败 ${failCount} 条`);
                            if (urlResultFilter) clientFilterCache.key = '';
                            loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                        }
                    });
            });
        });

        document.querySelectorAll('.bet-checkbox').forEach(cb => {
            cb.addEventListener('change', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                const value = this.checked ? '是' : '否';
                const self = this;
                saveField(id, 'bet', value)
                    .then(res => {
                        if (res.success) {
                            showToast('✅ 下注状态已更新');
                        } else {
                            showToast('❌ 更新失败: ' + (res.error || '未知错误'), true);
                            self.checked = !self.checked;
                        }
                    })
                    .catch(err => {
                        showToast('❌ 请求出错: ' + err.message, true);
                        self.checked = !self.checked;
                    });
            });
        });

        document.querySelectorAll('.odds-analysis-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                if (id) openAnalysisModal(id);
            });
        });
    }

    /* ============================================================
     * 打开 AI 分析模态框
     *   1) 读取 AI 记录（初赔分析/终赔分析/初测 使用它的值）
     *   2) 从同一条赛事的 odds 记录导入共享字段
     * ============================================================ */
    async function openAnalysisModal(id) {
        try {
            // 1) 读取 AI 记录
            const aiRes = await fetch('/api/match/' + id + '?source=ai');
            if (!aiRes.ok) throw new Error('获取数据失败');
            const data = await aiRes.json();
            if (data.error) { alert(data.error); return; }

            // 2) 从 odds 记录导入共享字段
            let oddsData = null;
            if (data.date && data.home_team && data.away_team) {
                try {
                    const oddsUrl = `/api/match/find?date=${encodeURIComponent(data.date)}&home_team=${encodeURIComponent(data.home_team)}&away_team=${encodeURIComponent(data.away_team)}&source=odds`;
                    const oddsRes = await fetch(oddsUrl, { cache: 'no-store' });
                    if (oddsRes.ok) {
                        const od = await oddsRes.json();
                        if (od && od.id) oddsData = od;
                    }
                } catch (e) {
                    console.warn('获取赔率记录失败（将使用 AI 记录中的原值）:', e);
                }
            }

            if (oddsData) {
                if (oddsData.pos1 !== undefined && oddsData.pos1 !== null && oddsData.pos1 !== '')
                    data.pos1 = oddsData.pos1;
                if (oddsData.pos2 !== undefined && oddsData.pos2 !== null && oddsData.pos2 !== '')
                    data.pos2 = oddsData.pos2;
                if (oddsData.asian_odds !== undefined && oddsData.asian_odds !== null && oddsData.asian_odds !== '')
                    data.asian_odds = oddsData.asian_odds;
                if (oddsData.range !== undefined && oddsData.range !== null && oddsData.range !== '')
                    data.range = oddsData.range;
                if (oddsData.odds_structure !== undefined && oddsData.odds_structure !== null && oddsData.odds_structure !== '')
                    data.odds_structure = oddsData.odds_structure;
                if (oddsData.judgment !== undefined && oddsData.judgment !== null && oddsData.judgment !== '')
                    data.judgment = oddsData.judgment;
                if (oddsData.fundamental_divergence !== undefined && oddsData.fundamental_divergence !== null && oddsData.fundamental_divergence !== '')
                    data.fundamental_divergence = oddsData.fundamental_divergence;
                if (oddsData.fundamental_match !== undefined && oddsData.fundamental_match !== null && oddsData.fundamental_match !== '')
                    data.fundamental_match = oddsData.fundamental_match;
            }

            // 3) 渲染模态框
            analysisModal.dataset.id = id;
            analysisModalTitle.textContent = `📊 AI分析 - ${data.home_team} vs ${data.away_team}`;
            const pos1Val = data.pos1 || '';
            const pos2Val = data.pos2 || '';
            const asianVal = data.asian_odds || '';
            const rangeVal = data.range || '';
            const initialAnalysisVal = data.initial_analysis || '';
            const finalAnalysisVal = data.final_analysis || '';
            const oddsStructureVal = data.odds_structure || '';
            const predArray = getInitialPredictionArray(data);
            const divergenceVal = data.fundamental_divergence || '否';
            const matchVal = data.fundamental_match || '否';

            const homeScore = Math.round(parseFloat(data.home_score) || 0);
            const awayScore = Math.round(parseFloat(data.away_score) || 0);
            const homeProb = (parseFloat(data.home_prob) || 0) * 100;
            const drawProb = (parseFloat(data.draw_prob) || 0) * 100;
            const awayProb = (parseFloat(data.away_prob) || 0) * 100;

            analysisModal.dataset.oldPos1 = pos1Val;
            analysisModal.dataset.oldPos2 = pos2Val;
            analysisModal.dataset.oldAsian = asianVal;
            analysisModal.dataset.oldRange = rangeVal;
            analysisModal.dataset.oldInitialAnalysis = initialAnalysisVal;
            analysisModal.dataset.oldFinalAnalysis = finalAnalysisVal;
            analysisModal.dataset.oldOddsStructure = oddsStructureVal;
            analysisModal.dataset.oldPred = JSON.stringify(predArray);
            analysisModal.dataset.oldDivergence = divergenceVal;
            analysisModal.dataset.oldMatch = matchVal;

            const options = ['胜', '平', '负', '上盘', '下盘', '让胜', '让平', '让负', '大球', '小球'];

            let dropdownHtml = `
                <div class="custom-dropdown" id="pred-dropdown-${id}">
                    <button class="dropdown-trigger" id="pred-trigger-${id}" type="button">
                        <span class="selected-text">${predArray.length > 0 ? predArray.join('、') : '请选择'}</span>
                    </button>
                    <div class="dropdown-menu" id="pred-menu-${id}">
                        ${options.map(opt => `
                            <label class="dropdown-item ${predArray.includes(opt) ? 'selected' : ''}" data-value="${opt}">
                                <input type="checkbox" value="${opt}" ${predArray.includes(opt) ? 'checked' : ''}>
                                <span class="label-text">${opt}</span>
                                <span class="check-mark">✓</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;

            const judgmentOptions = [
                {val:'home_advantage', label:'主队占优'},
                {val:'away_advantage', label:'客队占优'},
                {val:'equal', label:'两队实力相当'},
                {val:'home_strong', label:'主队较强优势'},
                {val:'away_strong', label:'客队较强优势'},
                {val:'home_dominant', label:'主队绝对优势'},
                {val:'away_dominant', label:'客队绝对优势'},
                {val:'both_weak', label:'两队菜鸡'},
                {val:'home_slight', label:'主队略占优'},
                {val:'away_slight', label:'客队略占优'}
            ];

            let infoHtml = `
                <div style="background:#f0f6ff; border-radius:8px; padding:12px 16px; margin-bottom:12px;">
                    <div style="font-weight:600; font-size:14px; color:#1a3a6b; margin-bottom:8px;">📊 基本面评分</div>
                    <div style="display:flex; flex-wrap:wrap; gap:12px 20px;">
                        <div><span style="color:#4b657a;">主队得分</span> <strong>${homeScore}</strong></div>
                        <div><span style="color:#4b657a;">客队得分</span> <strong>${awayScore}</strong></div>
                        <div><span style="color:#4b657a;">主胜概率</span> <strong>${homeProb.toFixed(1)}%</strong></div>
                        <div><span style="color:#4b657a;">平局概率</span> <strong>${drawProb.toFixed(1)}%</strong></div>
                        <div><span style="color:#4b657a;">客胜概率</span> <strong>${awayProb.toFixed(1)}%</strong></div>
                    </div>
                </div>
                <div class="info-row"><span class="info-label">ID</span><span class="info-value">${data.id}</span></div>
                <div class="info-row"><span class="info-label">联赛</span><span class="info-value">${data.league || '—'}</span></div>
                <div class="info-row"><span class="info-label">基本面判断</span>
                    <div class="info-value">
                        <select id="analysis-judgment" class="analysis-input" data-id="${data.id}" data-field="judgment">
                            ${judgmentOptions.map(opt => `
                                <option value="${opt.val}" ${data.judgment===opt.val?'selected':''}>${opt.label}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group" style="margin-top:10px;">
                    <span class="info-label" style="width:120px;">基本面</span>
                    <div style="display:flex; align-items:center; gap:16px; flex-wrap:nowrap;">
                        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap;">
                            <span>背离</span>
                            <input type="checkbox" id="analysis-divergence" data-id="${data.id}" data-field="fundamental_divergence" ${divergenceVal==='是'?'checked':''}>
                        </label>
                        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap;">
                            <span>相符</span>
                            <input type="checkbox" id="analysis-match" data-id="${data.id}" data-field="fundamental_match" ${matchVal==='是'?'checked':''}>
                        </label>
                    </div>
                    <span class="save-tag" id="analysis-saveTag-fundamental_divergence-${data.id}">✓</span>
                    <span class="save-tag" id="analysis-saveTag-fundamental_match-${data.id}">✓</span>
                </div>
                <div class="form-group"><span class="info-label" style="width:120px;">亚初终</span><input type="text" id="analysis-asian" class="analysis-input" value="${asianVal}" placeholder="如 0.85 半球 0.95" data-id="${data.id}" data-field="asian_odds"><span class="save-tag" id="analysis-saveTag-asian-${data.id}">✓</span></div>
                <div class="form-group"><span class="info-label" style="width:120px;">区间</span><input type="text" id="analysis-range" class="analysis-input" value="${rangeVal}" placeholder="如 2.5-3" data-id="${data.id}" data-field="range"><span class="save-tag" id="analysis-saveTag-range-${data.id}">✓</span></div>
                <div class="form-group"><span class="info-label" style="width:120px;">赔率结构</span><input type="text" id="analysis-odds-structure" class="analysis-input" value="${oddsStructureVal}" placeholder="如 胜平负" data-id="${data.id}" data-field="odds_structure"><span class="save-tag" id="analysis-saveTag-odds_structure-${data.id}">✓</span></div>
                <div class="form-group" style="margin-top:10px;"><span class="info-label" style="width:120px;">初01</span><input type="text" id="analysis-pos1" class="analysis-input" value="${pos1Val}" placeholder="—" data-id="${data.id}" data-field="pos1"><span class="save-tag" id="analysis-saveTag-pos1-${data.id}">✓</span></div>
                <div class="form-group"><span class="info-label" style="width:120px;">初02</span><input type="text" id="analysis-pos2" class="analysis-input" value="${pos2Val}" placeholder="—" data-id="${data.id}" data-field="pos2"><span class="save-tag" id="analysis-saveTag-pos2-${data.id}">✓</span></div>
                <div class="form-group"><span class="info-label" style="width:120px;">初赔分析</span><textarea id="analysis-initial_analysis" class="analysis-input analysis-textarea" rows="1" placeholder="初赔分析" data-id="${data.id}" data-field="initial_analysis">${escapeHtml(initialAnalysisVal)}</textarea><span class="save-tag" id="analysis-saveTag-initial_analysis-${data.id}">✓</span></div>
                <div class="form-group"><span class="info-label" style="width:120px;">终赔分析</span><textarea id="analysis-final_analysis" class="analysis-input analysis-textarea" rows="1" placeholder="终赔分析" data-id="${data.id}" data-field="final_analysis">${escapeHtml(finalAnalysisVal)}</textarea><span class="save-tag" id="analysis-saveTag-final_analysis-${data.id}">✓</span></div>
                <div class="form-group">
                    <span class="info-label" style="width:120px;">初测</span>
                    ${dropdownHtml}
                    <span class="save-tag" id="analysis-saveTag-initial_prediction-${data.id}">✓</span>
                </div>
            `;
            analysisInfoContainer.innerHTML = infoHtml;
            analysisModal.style.display = 'flex';

            analysisInfoContainer.querySelectorAll('.analysis-textarea').forEach(el => {
                autoResizeTextarea(el);
            });

            analysisInfoContainer.addEventListener('input', function(e) {
                if (e.target.classList && e.target.classList.contains('analysis-textarea')) {
                    autoResizeTextarea(e.target);
                }
            });

            if (analysisInfoContainer._autoSaveHandler) {
                analysisInfoContainer.removeEventListener('input', analysisInfoContainer._autoSaveHandler);
            }

            const autoSave = debounce(function(field, value) {
                const oldKey = `old${field.charAt(0).toUpperCase() + field.slice(1)}`;
                let oldVal = analysisModal.dataset[oldKey];
                if (field === 'initial_prediction') {
                    oldVal = analysisModal.dataset.oldPred || '[]';
                }
                if (value === oldVal) return;

                saveField(id, field, value)
                    .then(res => {
                        if (res.success) {
                            if (field === 'initial_prediction') {
                                analysisModal.dataset.oldPred = value;
                            } else {
                                analysisModal.dataset[oldKey] = value;
                            }
                            const tag = document.getElementById(`analysis-saveTag-${field}-${id}`);
                            if (tag) tag.classList.add('show');
                            analysisModal.dataset.changed = 'true';
                            if (urlResultFilter) clientFilterCache.key = '';
                        } else {
                            showToast(`❌ 保存失败 (${field}): ${res.error || '未知错误'}`, true);
                        }
                    })
                    .catch(err => showToast(`❌ 请求出错: ${err.message}`, true));
            }, 600);

            const autoSaveHandler = function(e) {
                const target = e.target;
                if (!target.classList.contains('analysis-input') && !target.classList.contains('pred-checkbox') && target.id !== 'analysis-divergence' && target.id !== 'analysis-match') {
                    return;
                }
                let field = target.dataset.field;
                let value;
                if (target.classList.contains('pred-checkbox')) {
                    const checkedBoxes = analysisInfoContainer.querySelectorAll('.pred-checkbox:checked');
                    const selected = Array.from(checkedBoxes).map(cb => cb.value);
                    value = JSON.stringify(selected);
                    field = 'initial_prediction';
                } else if (target.id === 'analysis-divergence') {
                    value = target.checked ? '是' : '否';
                    field = 'fundamental_divergence';
                } else if (target.id === 'analysis-match') {
                    value = target.checked ? '是' : '否';
                    field = 'fundamental_match';
                } else {
                    value = target.value.trim();
                }
                if (!field) return;

                const tag = document.getElementById(`analysis-saveTag-${field}-${id}`);
                if (tag) tag.classList.remove('show');

                autoSave(field, value);
            };

            analysisInfoContainer._autoSaveHandler = autoSaveHandler;
            analysisInfoContainer.addEventListener('input', autoSaveHandler);

            const allCheckboxes = analysisInfoContainer.querySelectorAll('input[type="checkbox"]');
            allCheckboxes.forEach(cb => {
                cb.addEventListener('change', function() {
                    this.dispatchEvent(new Event('input', { bubbles: true }));
                });
            });

            const trigger = document.getElementById(`pred-trigger-${id}`);
            const menu = document.getElementById(`pred-menu-${id}`);
            const dropdown = document.getElementById(`pred-dropdown-${id}`);

            function updateTriggerText() {
                if (!trigger || !menu) return;
                const checked = menu.querySelectorAll('.dropdown-item input[type="checkbox"]:checked');
                const labels = Array.from(checked).map(cb => cb.value);
                const textSpan = trigger.querySelector('.selected-text');
                if (textSpan) {
                    textSpan.textContent = labels.length > 0 ? labels.join('、') : '请选择';
                    textSpan.classList.toggle('placeholder', labels.length === 0);
                }
            }

            if (trigger && menu) {
                trigger.addEventListener('click', function(e) {
                    e.stopPropagation();
                    menu.classList.toggle('open');
                });

                menu.querySelectorAll('.dropdown-item').forEach(item => {
                    const checkbox = item.querySelector('input[type="checkbox"]');
                    item.addEventListener('click', function(e) {
                        if (e.target.tagName !== 'INPUT') {
                            checkbox.checked = !checkbox.checked;
                        }
                        item.classList.toggle('selected', checkbox.checked);
                        updateTriggerText();
                        checkbox.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                    checkbox.addEventListener('change', function() {
                        item.classList.toggle('selected', this.checked);
                        updateTriggerText();
                        this.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                    if (checkbox.checked) item.classList.add('selected');
                });

                document.addEventListener('click', function closeDropdown(e) {
                    if (dropdown && !dropdown.contains(e.target)) {
                        menu.classList.remove('open');
                    }
                });
            }

            document.querySelectorAll('#analysis-pos1, #analysis-pos2, #analysis-asian, #analysis-range, #analysis-initial_analysis, #analysis-final_analysis, #analysis-odds-structure, #analysis-judgment, #analysis-divergence, #analysis-match').forEach(el => {
                el.addEventListener('input', function() {
                    const id = this.dataset.id;
                    const field = this.dataset.field;
                    const tag = document.getElementById(`analysis-saveTag-${field}-${id}`);
                    if (tag) tag.classList.remove('show');
                });
            });
        } catch (err) {
            showToast('❌ 加载数据失败: ' + err.message, true);
            console.error('加载数据失败:', err);
        }
    }

    function closeAnalysisModal() {
        if (analysisInfoContainer._autoSaveHandler) {
            analysisInfoContainer.removeEventListener('input', analysisInfoContainer._autoSaveHandler);
            delete analysisInfoContainer._autoSaveHandler;
        }
        analysisModal.style.display = 'none';

        if (analysisModal.dataset.changed === 'true') {
            loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
            analysisModal.dataset.changed = 'false';
        }
    }

    function saveAnalysisData() {
        try {
            const id = analysisModal.dataset.id;
            if (!id) { showToast('❌ 未找到赛事ID', true); return; }

            const pos1Input = document.getElementById('analysis-pos1');
            const pos2Input = document.getElementById('analysis-pos2');
            const asianInput = document.getElementById('analysis-asian');
            const rangeInput = document.getElementById('analysis-range');
            const initialAnalysisInput = document.getElementById('analysis-initial_analysis');
            const finalAnalysisInput = document.getElementById('analysis-final_analysis');
            const oddsStructureInput = document.getElementById('analysis-odds-structure');
            const judgmentInput = document.getElementById('analysis-judgment');
            const divergenceInput = document.getElementById('analysis-divergence');
            const matchInput = document.getElementById('analysis-match');

            const pos1Val = pos1Input ? pos1Input.value.trim() : '';
            const pos2Val = pos2Input ? pos2Input.value.trim() : '';
            const asianVal = asianInput ? asianInput.value.trim() : '';
            const rangeVal = rangeInput ? rangeInput.value.trim() : '';
            const initialAnalysisVal = initialAnalysisInput ? initialAnalysisInput.value.trim() : '';
            const finalAnalysisVal = finalAnalysisInput ? finalAnalysisInput.value.trim() : '';
            const oddsStructureVal = oddsStructureInput ? oddsStructureInput.value.trim() : '';
            const judgmentVal = judgmentInput ? judgmentInput.value : 'equal';
            const divergenceVal = divergenceInput ? (divergenceInput.checked ? '是' : '否') : '否';
            const matchVal = matchInput ? (matchInput.checked ? '是' : '否') : '否';

            const menu = document.getElementById(`pred-menu-${id}`);
            let selectedOptions = [];
            if (menu) {
                const checkedBoxes = menu.querySelectorAll('.dropdown-item input[type="checkbox"]:checked');
                selectedOptions = Array.from(checkedBoxes).map(cb => cb.value);
            }
            const initialPredictionVal = JSON.stringify(selectedOptions);

            saveAnalysisBtn.textContent = '⏳ 保存中...';
            saveAnalysisBtn.disabled = true;

            fetch('/api/match/' + id + '?source=ai')
                .then(res => { if (!res.ok) throw new Error('获取当前数据失败'); return res.json(); })
                .then(data => {
                    data.pos1 = pos1Val;
                    data.pos2 = pos2Val;
                    data.asian_odds = asianVal;
                    data.range = rangeVal;
                    data.initial_analysis = initialAnalysisVal;
                    data.final_analysis = finalAnalysisVal;
                    data.initial_prediction = initialPredictionVal;
                    data.odds_structure = oddsStructureVal;
                    data.judgment = judgmentVal;
                    data.fundamental_divergence = divergenceVal;
                    data.fundamental_match = matchVal;
                    return fetch('/api/match/' + id + '?source=ai', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                })
                .then(res => {
                    if (!res.ok) return res.json().then(err => { throw new Error(err.error || '更新失败'); });
                    return res.json();
                })
                .then(result => {
                    if (result.success) {
                        analysisModal.dataset.oldPos1 = pos1Val;
                        analysisModal.dataset.oldPos2 = pos2Val;
                        analysisModal.dataset.oldAsian = asianVal;
                        analysisModal.dataset.oldRange = rangeVal;
                        analysisModal.dataset.oldInitialAnalysis = initialAnalysisVal;
                        analysisModal.dataset.oldFinalAnalysis = finalAnalysisVal;
                        analysisModal.dataset.oldOddsStructure = oddsStructureVal;
                        analysisModal.dataset.oldPred = initialPredictionVal;
                        analysisModal.dataset.oldJudgment = judgmentVal;
                        analysisModal.dataset.oldDivergence = divergenceVal;
                        analysisModal.dataset.oldMatch = matchVal;

                        const fields = ['pos1', 'pos2', 'asian', 'range', 'initial_analysis', 'final_analysis', 'initial_prediction', 'odds_structure', 'judgment', 'fundamental_divergence', 'fundamental_match'];
                        fields.forEach(field => {
                            const tag = document.getElementById(`analysis-saveTag-${field}-${id}`);
                            if (tag) tag.classList.add('show');
                        });
                        showToast('✅ 所有数据保存成功！');
                        if (urlResultFilter) clientFilterCache.key = '';
                        loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                    } else {
                        throw new Error(result.error || '未知错误');
                    }
                })
                .catch(err => {
                    showToast('❌ 保存失败: ' + err.message, true);
                    console.error('保存错误:', err);
                    const oldPos1 = analysisModal.dataset.oldPos1 || '';
                    const oldPos2 = analysisModal.dataset.oldPos2 || '';
                    const oldAsian = analysisModal.dataset.oldAsian || '';
                    const oldRange = analysisModal.dataset.oldRange || '';
                    const oldInitialAnalysis = analysisModal.dataset.oldInitialAnalysis || '';
                    const oldFinalAnalysis = analysisModal.dataset.oldFinalAnalysis || '';
                    const oldOddsStructure = analysisModal.dataset.oldOddsStructure || '';
                    const oldJudgment = analysisModal.dataset.oldJudgment || 'equal';
                    const oldDivergence = analysisModal.dataset.oldDivergence || '否';
                    const oldMatch = analysisModal.dataset.oldMatch || '否';
                    const oldPred = analysisModal.dataset.oldPred || '[]';
                    try {
                        const oldArr = JSON.parse(oldPred);
                        const menu = document.getElementById(`pred-menu-${id}`);
                        if (menu) {
                            menu.querySelectorAll('.dropdown-item').forEach(item => {
                                const cb = item.querySelector('input[type="checkbox"]');
                                if (cb) {
                                    cb.checked = oldArr.includes(cb.value);
                                    item.classList.toggle('selected', cb.checked);
                                }
                            });
                            const trigger = document.getElementById(`pred-trigger-${id}`);
                            if (trigger) {
                                const checked = menu.querySelectorAll('.dropdown-item input[type="checkbox"]:checked');
                                const labels = Array.from(checked).map(cb => cb.value);
                                const textSpan = trigger.querySelector('.selected-text');
                                if (textSpan) {
                                    textSpan.textContent = labels.length > 0 ? labels.join('、') : '请选择';
                                    textSpan.classList.toggle('placeholder', labels.length === 0);
                                }
                            }
                        }
                    } catch (e) {}
                    if (pos1Input) pos1Input.value = oldPos1;
                    if (pos2Input) pos2Input.value = oldPos2;
                    if (asianInput) asianInput.value = oldAsian;
                    if (rangeInput) rangeInput.value = oldRange;
                    if (initialAnalysisInput) initialAnalysisInput.value = oldInitialAnalysis;
                    if (finalAnalysisInput) finalAnalysisInput.value = oldFinalAnalysis;
                    if (oddsStructureInput) oddsStructureInput.value = oldOddsStructure;
                    if (judgmentInput) judgmentInput.value = oldJudgment;
                    if (divergenceInput) divergenceInput.checked = (oldDivergence === '是');
                    if (matchInput) matchInput.checked = (oldMatch === '是');
                    if (initialAnalysisInput) autoResizeTextarea(initialAnalysisInput);
                    if (finalAnalysisInput) autoResizeTextarea(finalAnalysisInput);
                })
                .finally(() => {
                    saveAnalysisBtn.textContent = '💾 保存修改';
                    saveAnalysisBtn.disabled = false;
                });
        } catch (error) {
            showToast('❌ 保存过程中发生错误: ' + error.message, true);
            console.error('手动保存异常:', error);
            saveAnalysisBtn.textContent = '💾 保存修改';
            saveAnalysisBtn.disabled = false;
        }
    }

    function updatePagination() {
        const totalPages = Math.ceil(totalItems / currentLimit) || 1;
        const currentPage = Math.floor(currentOffset / currentLimit) + 1;
        totalCountSpan.textContent = totalItems;

        let html = '';
        const maxVisible = 7;
        let startPage = 1, endPage = totalPages;
        if (totalPages > maxVisible) {
            const half = Math.floor(maxVisible / 2);
            if (currentPage <= half + 1) endPage = maxVisible;
            else if (currentPage >= totalPages - half) startPage = totalPages - maxVisible + 1;
            else { startPage = currentPage - half; endPage = currentPage + half; }
        }
        if (startPage > 1) {
            html += `<span class="page-num" data-page="1">1</span>`;
            if (startPage > 2) html += `<span class="ellipsis">…</span>`;
        }
        for (let i = startPage; i <= endPage; i++) {
            html += `<span class="page-num ${i===currentPage?'active':''}" data-page="${i}">${i}</span>`;
        }
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span class="ellipsis">…</span>`;
            html += `<span class="page-num" data-page="${totalPages}">${totalPages}</span>`;
        }
        pageNumbers.innerHTML = html;
        document.querySelectorAll('.page-num').forEach(el => {
            el.addEventListener('click', function() {
                const page = parseInt(this.dataset.page);
                if (page >= 1 && page <= totalPages) goToPage((page - 1) * currentLimit);
            });
        });
        prevPageBtn.disabled = currentOffset === 0;
        nextPageBtn.disabled = currentOffset + currentLimit >= totalItems;
        pagination.style.display = 'flex';
    }

    function goToPage(offset) {
        if (offset < 0) offset = 0;
        if (offset >= totalItems) offset = Math.max(0, totalItems - currentLimit);
        currentOffset = offset;
        loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
    }

    function addEmptyMatch() {
        const payload = {
            date: '', time: '', league: '',
            home_team: '主队', away_team: '客队',
            home_score: 0, away_score: 0,
            home_prob: 0.33, draw_prob: 0.34, away_prob: 0.33,
            judgment: 'equal',
            asian_odds: '', range: '', pos1: '', pos2: '',
            initial_analysis: '', final_analysis: '',
            initial_prediction: '[]',
            odds_structure: '',
            fundamental_divergence: '否',
            fundamental_match: '否',
            bet: '否'
        };
        fetch('/api/save?source=ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                showToast('✅ 空记录已创建，ID: ' + res.id);
                if (urlResultFilter) clientFilterCache.key = '';
                loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
            } else showToast('❌ 创建失败: ' + (res.error || '未知错误'), true);
        })
        .catch(err => showToast('❌ 请求出错: ' + err.message, true));
    }

    filterBtn.addEventListener('click', function() {
        currentDateFilter = filterDate.value;
        currentLeagueFilter = filterLeague.value;
        currentOffset = 0;
        loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, 0);
    });

    clearFilterBtn.addEventListener('click', function() {
        filterDate.value = '';
        filterLeague.value = '';
        currentDateFilter = '';
        currentLeagueFilter = '';
        currentOffset = 0;
        loadHistory('', '', currentLimit, 0);
    });

    addMatchBtn.addEventListener('click', addEmptyMatch);

    prevPageBtn.addEventListener('click', () => goToPage(currentOffset - currentLimit));
    nextPageBtn.addEventListener('click', () => goToPage(currentOffset + currentLimit));
    perPageSelect.addEventListener('change', function() {
        currentLimit = parseInt(this.value);
        currentOffset = 0;
        loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, 0);
    });

    closeAnalysisBtn.addEventListener('click', closeAnalysisModal);
    saveAnalysisBtn.addEventListener('click', saveAnalysisData);
    window.addEventListener('click', function(e) {
        if (e.target === analysisModal) closeAnalysisModal();
    });

    cancelEditBtn.addEventListener('click', function() { editModal.style.display = 'none'; });
    window.addEventListener('click', function(e) {
        if (e.target === editModal) editModal.style.display = 'none';
    });
    saveEditBtn.addEventListener('click', function() {
        alert('请使用“AI分析”按钮进行编辑。');
    });

    // ---------- 页面初始化 ----------
    const filterDateParam = urlParams.get('date');
    const filterHome = urlParams.get('home');
    const filterAway = urlParams.get('away');
    const filterTime = urlParams.get('time') || '';
    const filterLeagueParam = urlParams.get('league') || '';
    const autoCreate = urlParams.get('auto_create') === '1';

    if (urlResultFilter) {
        const h1 = document.querySelector('h1');
        if (h1) {
            const badge = document.createElement('span');
            badge.style.cssText = 'display:inline-block;padding:3px 12px;background:#eef4ff;color:#1a3a6b;border-radius:20px;font-size:14px;font-weight:600;margin-left:10px;vertical-align:middle;';
            badge.textContent = `已筛选：${urlResultFilter}`;
            h1.appendChild(badge);
        }
    }

    if (filterDateParam && filterHome && filterAway) {
        loading.style.display = 'block';
        tableWrap.style.display = 'none';

        fetch(`/api/match/find?date=${encodeURIComponent(filterDateParam)}&home_team=${encodeURIComponent(filterHome)}&away_team=${encodeURIComponent(filterAway)}&source=ai`)
            .then(res => res.json())
            .then(data => {
                if (data && data.id) {
                    loading.style.display = 'none';
                    tableWrap.style.display = 'block';
                    const m = data;
                    if (urlResultFilter) {
                        const isPending = !m.result || m.result === '' || m.result === null || m.result === undefined;
                        const matchesFilter = (urlResultFilter === '待定') ? isPending : (m.result === urlResultFilter);
                        if (!matchesFilter) {
                            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:30px;">该赛事的结果不是「${urlResultFilter}」</td></tr>`;
                            pagination.style.display = 'none';
                            return;
                        }
                    }
                    renderRows([m]);
                    pagination.style.display = 'none';
                    return;
                }

                if (autoCreate) {
                    const payload = {
                        date: filterDateParam,
                        time: filterTime,
                        league: filterLeagueParam,
                        home_team: filterHome,
                        away_team: filterAway,
                        home_score: 0,
                        away_score: 0,
                        home_prob: 0.33,
                        draw_prob: 0.34,
                        away_prob: 0.33,
                        judgment: 'equal',
                        asian_odds: '',
                        range: '',
                        pos1: '',
                        pos2: '',
                        initial_analysis: '',
                        final_analysis: '',
                        initial_prediction: '[]',
                        odds_structure: '',
                        fundamental_divergence: '否',
                        fundamental_match: '否',
                        bet: '否'
                    };

                    fetch('/api/save?source=ai', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })
                    .then(res => res.json())
                    .then(res => {
                        if (res.success && res.id) {
                            showToast('✅ 已自动创建 AI 预测记录');
                            const newRecord = { ...payload, id: res.id, result: '' };
                            renderRows([newRecord]);
                            pagination.style.display = 'none';
                            loading.style.display = 'none';
                            tableWrap.style.display = 'block';
                            const clean = new URLSearchParams(window.location.search);
                            clean.delete('auto_create');
                            history.replaceState(null, '', '?' + clean.toString());
                        } else {
                            loading.textContent = '❌ 自动创建失败: ' + (res.error || '未知错误');
                        }
                    })
                    .catch(err => {
                        loading.textContent = '❌ 自动创建失败: ' + err.message;
                        console.error(err);
                    });

                    return;
                }

                loading.style.display = 'none';
                tableWrap.style.display = 'block';
                tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:30px;">该赛事暂无 AI 预测记录。</td></tr>`;
                pagination.style.display = 'none';
            })
            .catch(err => {
                loading.textContent = '❌ 加载失败: ' + err.message;
                console.error('加载失败:', err);
            });
    } else {
        loadHistory('', '', 20, 0);
    }
})();