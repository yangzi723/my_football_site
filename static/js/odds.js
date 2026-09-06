(function() {
    "use strict";

    // ---------- 防抖工具 ----------
    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    const tbody = document.getElementById('historyBody');
    const loading = document.getElementById('loading');
    const tableWrap = document.getElementById('tableWrap');
    const filterDate = document.getElementById('filter-date');
    const filterLeague = document.getElementById('filter-league');
    const filterBtn = document.getElementById('filterBtn');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    const analysisModal = document.getElementById('analysisModal');
    const analysisModalTitle = document.getElementById('analysisModalTitle');
    const analysisInfoContainer = document.getElementById('analysisInfoContainer');
    const closeAnalysisBtn = document.getElementById('closeAnalysisBtn');
    const saveAnalysisBtn = document.getElementById('saveAnalysisBtn');

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
        'both_weak': '两队菜鸡'
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
            } catch (e) {
                return initialPrediction;
            }
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
            } catch (e) {
                return val ? [val] : [];
            }
        }
        return [];
    }

    function saveField(id, field, value) {
        return fetch('/api/match/' + id)
            .then(res => {
                if (!res.ok) throw new Error('获取数据失败');
                return res.json();
            })
            .then(data => {
                const payload = { ...data };
                payload[field] = value;
                return fetch('/api/match/' + id, {
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
        matches.forEach(m => {
            if (m.league) leagues.add(m.league);
        });
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

    function loadHistory(date, league, limit, offset) {
        if (date === undefined) date = currentDateFilter;
        if (league === undefined) league = currentLeagueFilter;
        if (limit === undefined) limit = currentLimit;
        if (offset === undefined) offset = currentOffset;

        loading.style.display = 'block';
        tableWrap.style.display = 'none';
        let url = `/api/history?limit=${limit}&offset=${offset}`;
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

                if (matches.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:30px;">暂无预测记录</td></tr>';
                    pagination.style.display = 'none';
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
                    const homeScore = Math.round(parseFloat(m.home_score) || 0);
                    const awayScore = Math.round(parseFloat(m.away_score) || 0);
                    const scoreDisplay = `<span class="score-vs">${homeScore}</span> <span class="vs-large">VS</span> <span class="score-vs">${awayScore}</span>`;

                    const predDisplay = getPredictionDisplay(m.initial_prediction) || '—';
                    const isEmptyPred = !m.initial_prediction || m.initial_prediction === '[]' || m.initial_prediction === '""' || m.initial_prediction === 'null';

                    // ★ 亚初终列
                    const asianOdds = m.asian_odds || '';

                    html += `<tr>
                            <td class="checkbox-cell"><input type="checkbox" class="row-checkbox" data-id="${m.id}"></td>
                            <td>${m.id}</td>
                            <td>${m.date || ''}</td>
                            <td>${m.time || ''}</td>
                            <td>${m.league || ''}</td>
                            <td><a href="/index?id=${m.id}" class="team-link">${m.home_team}</a> <span class="vs-large">VS</span> <a href="/index?id=${m.id}" class="team-link">${m.away_team}</a></td>
                            <td>${scoreDisplay}</td>
                            <td>${judgmentDisplay}</td>
                            <td>${asianOdds}</td>
                            <td style="text-align:center;"><span class="prediction-clickable ${isEmptyPred ? 'empty' : ''}" style="cursor:default; text-decoration:none;">${predDisplay || '—'}</span></td>
                            <td>
                                <select class="result-select" data-id="${m.id}">
                                    <option value="">未定</option>
                                    <option value="红" ${result==='红'?'selected':''}>红</option>
                                    <option value="黑" ${result==='黑'?'selected':''}>黑</option>
                                    <option value="走盘" ${result==='走盘'?'selected':''}>走盘</option>
                                </select>
                            </td>
                            <td>
                                <button class="action-btn odds-analysis-btn" data-id="${m.id}">📊 赔率分析</button>
                                <button class="action-btn delete-btn" data-id="${m.id}">🗑️ 删除</button>
                            </td>
                        </tr>`;
                });
                tbody.innerHTML = html;
                bindEvents();
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
                fetch('/api/match/' + id + '/result', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ result: val || null })
                })
                .then(res => res.json())
                .then(res => {
                    if (res.success) loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                    else alert('更新失败: ' + (res.error || '未知错误'));
                });
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                if (confirm('确定删除该预测记录吗？')) {
                    fetch('/api/match/' + id, { method: 'DELETE' })
                        .then(res => res.json())
                        .then(res => {
                            if (res.success) loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                            else alert('删除失败: ' + (res.error || '未知错误'));
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
                fetch('/api/match/' + id, { method: 'DELETE' })
                    .then(res => res.json())
                    .then(res => {
                        res.success ? successCount++ : failCount++;
                        if (successCount + failCount === ids.length) {
                            showToast(`批量删除完成：成功 ${successCount} 条，失败 ${failCount} 条`);
                            loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                        }
                    })
                    .catch(() => {
                        failCount++;
                        if (successCount + failCount === ids.length) {
                            showToast(`批量删除完成：成功 ${successCount} 条，失败 ${failCount} 条`);
                            loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                        }
                    });
            });
        });

        // 注意：由于已删除初01和初02列，此处不再绑定 inline-pos1/pos2 事件
        // 但仍需保留原有的 odds-analysis-btn 事件
        document.querySelectorAll('.odds-analysis-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                if (id) openAnalysisModal(id);
            });
        });
    }

    // ---------- 删除初01/初02的独立保存函数，但保留通用保存 ----------
    // 由于表格中不再有这些列，相关保存逻辑已移除

    // ========== 打开赔率分析模态框（含自动保存） ==========
    function openAnalysisModal(id) {
        fetch('/api/match/' + id)
            .then(res => {
                if (!res.ok) throw new Error('获取数据失败');
                return res.json();
            })
            .then(data => {
                if (data.error) { alert(data.error); return; }

                analysisModal.dataset.id = id;
                analysisModalTitle.textContent = `📊 赔率分析 - ${data.home_team} vs ${data.away_team}`;
                const judgmentDisplay = judgmentMap[data.judgment] || data.judgment || '—';
                const pos1Val = data.pos1 || '';
                const pos2Val = data.pos2 || '';
                const asianVal = data.asian_odds || '';
                const rangeVal = data.range || '';
                const initialAnalysisVal = data.initial_analysis || '';
                const finalAnalysisVal = data.final_analysis || '';
                const oddsStructureVal = data.odds_structure || '';
                const predArray = getInitialPredictionArray(data);

                const homeScore = Math.round(parseFloat(data.home_score) || 0);
                const awayScore = Math.round(parseFloat(data.away_score) || 0);
                const homeProb = (parseFloat(data.home_prob) || 0) * 100;
                const drawProb = (parseFloat(data.draw_prob) || 0) * 100;
                const awayProb = (parseFloat(data.away_prob) || 0) * 100;

                // 保存旧值（用于恢复）
                analysisModal.dataset.oldPos1 = pos1Val;
                analysisModal.dataset.oldPos2 = pos2Val;
                analysisModal.dataset.oldAsian = asianVal;
                analysisModal.dataset.oldRange = rangeVal;
                analysisModal.dataset.oldInitialAnalysis = initialAnalysisVal;
                analysisModal.dataset.oldFinalAnalysis = finalAnalysisVal;
                analysisModal.dataset.oldOddsStructure = oddsStructureVal;
                analysisModal.dataset.oldPred = JSON.stringify(predArray);

                const options = ['胜', '平', '负', '上盘', '下盘', '大球', '小球'];

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
                    <div class="info-row"><span class="info-label">基本面判断</span><span class="info-value">${judgmentDisplay}</span></div>
                    <div class="form-group"><span class="info-label" style="width:120px;">亚初终</span><input type="text" id="analysis-asian" class="analysis-input" value="${asianVal}" placeholder="如 0.85 半球 0.95" data-id="${data.id}" data-field="asian_odds"><span class="save-tag" id="analysis-saveTag-asian-${data.id}">✓</span></div>
                    <div class="form-group"><span class="info-label" style="width:120px;">区间</span><input type="text" id="analysis-range" class="analysis-input" value="${rangeVal}" placeholder="如 2.5-3" data-id="${data.id}" data-field="range"><span class="save-tag" id="analysis-saveTag-range-${data.id}">✓</span></div>
                    <div class="form-group"><span class="info-label" style="width:120px;">赔率结构</span><input type="text" id="analysis-odds-structure" class="analysis-input" value="${oddsStructureVal}" placeholder="如 胜平负" data-id="${data.id}" data-field="odds_structure"><span class="save-tag" id="analysis-saveTag-odds_structure-${data.id}">✓</span></div>
                    <div class="form-group" style="margin-top:10px;"><span class="info-label" style="width:120px;">初01</span><input type="text" id="analysis-pos1" class="analysis-input" value="${pos1Val}" placeholder="—" data-id="${data.id}" data-field="pos1"><span class="save-tag" id="analysis-saveTag-pos1-${data.id}">✓</span></div>
                    <div class="form-group"><span class="info-label" style="width:120px;">初02</span><input type="text" id="analysis-pos2" class="analysis-input" value="${pos2Val}" placeholder="—" data-id="${data.id}" data-field="pos2"><span class="save-tag" id="analysis-saveTag-pos2-${data.id}">✓</span></div>
                    <div class="form-group"><span class="info-label" style="width:120px;">初赔分析</span><input type="text" id="analysis-initial_analysis" class="analysis-input" value="${initialAnalysisVal}" placeholder="初赔分析" data-id="${data.id}" data-field="initial_analysis"><span class="save-tag" id="analysis-saveTag-initial_analysis-${data.id}">✓</span></div>
                    <div class="form-group"><span class="info-label" style="width:120px;">终赔分析</span><input type="text" id="analysis-final_analysis" class="analysis-input" value="${finalAnalysisVal}" placeholder="终赔分析" data-id="${data.id}" data-field="final_analysis"><span class="save-tag" id="analysis-saveTag-final_analysis-${data.id}">✓</span></div>
                    <div class="form-group">
                        <span class="info-label" style="width:120px;">初测</span>
                        ${dropdownHtml}
                        <span class="save-tag" id="analysis-saveTag-initial_prediction-${data.id}">✓</span>
                    </div>
                `;
                analysisInfoContainer.innerHTML = infoHtml;
                analysisModal.style.display = 'flex';

                // ========== 绑定自动保存（防抖） ==========
                const autoSave = debounce(function(field, value) {
                    // 如果值没变化，不保存
                    const oldVal = analysisModal.dataset[`old${field.charAt(0).toUpperCase() + field.slice(1)}`];
                    // 但对于 initial_prediction 特殊处理
                    if (field === 'initial_prediction') {
                        const oldPred = analysisModal.dataset.oldPred || '[]';
                        if (value === oldPred) return;
                    } else {
                        if (value === oldVal) return;
                    }

                    saveField(id, field, value)
                        .then(res => {
                            if (res.success) {
                                // 更新旧值缓存
                                if (field === 'initial_prediction') {
                                    analysisModal.dataset.oldPred = value;
                                } else {
                                    const key = `old${field.charAt(0).toUpperCase() + field.slice(1)}`;
                                    analysisModal.dataset[key] = value;
                                }
                                // 显示保存标记
                                const tag = document.getElementById(`analysis-saveTag-${field}-${id}`);
                                if (tag) tag.classList.add('show');
                            } else {
                                showToast(`❌ 保存失败 (${field}): ${res.error || '未知错误'}`, true);
                            }
                        })
                        .catch(err => showToast(`❌ 请求出错: ${err.message}`, true));
                }, 600);

                // 绑定输入框自动保存
                const inputFields = ['asian_odds', 'range', 'initial_analysis', 'final_analysis', 'odds_structure', 'pos1', 'pos2'];
                inputFields.forEach(field => {
                    const el = document.getElementById(`analysis-${field}`);
                    if (el) {
                        el.addEventListener('input', function() {
                            const fieldName = this.dataset.field;
                            const tag = document.getElementById(`analysis-saveTag-${fieldName}-${id}`);
                            if (tag) tag.classList.remove('show');
                            autoSave(fieldName, this.value.trim());
                        });
                    }
                });

                // 绑定初测复选框组自动保存
                const checkboxes = document.querySelectorAll('.pred-checkbox');
                checkboxes.forEach(cb => {
                    cb.addEventListener('change', function() {
                        const selected = Array.from(document.querySelectorAll('.pred-checkbox:checked')).map(cb => cb.value);
                        const value = JSON.stringify(selected);
                        const tag = document.getElementById(`analysis-saveTag-initial_prediction-${id}`);
                        if (tag) tag.classList.remove('show');
                        autoSave('initial_prediction', value);
                    });
                });

                // ---------- 自定义下拉组件交互 ----------
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
                            // 触发自动保存（通过 change 事件）
                            checkbox.dispatchEvent(new Event('change'));
                        });
                        checkbox.addEventListener('change', function() {
                            item.classList.toggle('selected', this.checked);
                            updateTriggerText();
                        });
                        if (checkbox.checked) item.classList.add('selected');
                    });

                    document.addEventListener('click', function closeDropdown(e) {
                        if (dropdown && !dropdown.contains(e.target)) {
                            menu.classList.remove('open');
                        }
                    });
                }

                // 清除保存标记（输入时）
                document.querySelectorAll('#analysis-pos1, #analysis-pos2, #analysis-asian, #analysis-range, #analysis-initial_analysis, #analysis-final_analysis, #analysis-odds-structure').forEach(el => {
                    el.addEventListener('input', function() {
                        const id = this.dataset.id;
                        const field = this.dataset.field;
                        const tag = document.getElementById(`analysis-saveTag-${field}-${id}`);
                        if (tag) tag.classList.remove('show');
                    });
                });
            })
            .catch(err => {
                showToast('❌ 加载数据失败: ' + err.message, true);
            });
    }

    function closeAnalysisModal() {
        analysisModal.style.display = 'none';
    }

    // ---------- 保存按钮（手动） ----------
    function saveAnalysisData() {
        const id = analysisModal.dataset.id;
        if (!id) { showToast('❌ 未找到赛事ID'); return; }

        const pos1Input = document.getElementById('analysis-pos1');
        const pos2Input = document.getElementById('analysis-pos2');
        const asianInput = document.getElementById('analysis-asian');
        const rangeInput = document.getElementById('analysis-range');
        const initialAnalysisInput = document.getElementById('analysis-initial_analysis');
        const finalAnalysisInput = document.getElementById('analysis-final_analysis');
        const oddsStructureInput = document.getElementById('analysis-odds-structure');

        const pos1Val = pos1Input ? pos1Input.value.trim() : '';
        const pos2Val = pos2Input ? pos2Input.value.trim() : '';
        const asianVal = asianInput ? asianInput.value.trim() : '';
        const rangeVal = rangeInput ? rangeInput.value.trim() : '';
        const initialAnalysisVal = initialAnalysisInput ? initialAnalysisInput.value.trim() : '';
        const finalAnalysisVal = finalAnalysisInput ? finalAnalysisInput.value.trim() : '';
        const oddsStructureVal = oddsStructureInput ? oddsStructureInput.value.trim() : '';

        const menu = document.getElementById(`pred-menu-${id}`);
        let selectedOptions = [];
        if (menu) {
            const checkedBoxes = menu.querySelectorAll('.dropdown-item input[type="checkbox"]:checked');
            selectedOptions = Array.from(checkedBoxes).map(cb => cb.value);
        }
        const initialPredictionVal = JSON.stringify(selectedOptions);

        saveAnalysisBtn.textContent = '⏳ 保存中...';
        saveAnalysisBtn.disabled = true;

        fetch('/api/match/' + id)
            .then(res => {
                if (!res.ok) throw new Error('获取当前数据失败');
                return res.json();
            })
            .then(data => {
                data.pos1 = pos1Val;
                data.pos2 = pos2Val;
                data.asian_odds = asianVal;
                data.range = rangeVal;
                data.initial_analysis = initialAnalysisVal;
                data.final_analysis = finalAnalysisVal;
                data.initial_prediction = initialPredictionVal;
                data.odds_structure = oddsStructureVal;
                return fetch('/api/match/' + id, {
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

                    const fields = ['pos1', 'pos2', 'asian', 'range', 'initial_analysis', 'final_analysis', 'initial_prediction', 'odds_structure'];
                    fields.forEach(field => {
                        const tag = document.getElementById(`analysis-saveTag-${field}-${id}`);
                        if (tag) tag.classList.add('show');
                    });
                    showToast('✅ 所有数据保存成功！');
                    loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                } else {
                    throw new Error(result.error || '未知错误');
                }
            })
            .catch(err => {
                showToast('❌ 保存失败: ' + err.message, true);
                console.error('保存错误:', err);
                // 恢复旧值
                const oldPos1 = analysisModal.dataset.oldPos1 || '';
                const oldPos2 = analysisModal.dataset.oldPos2 || '';
                const oldAsian = analysisModal.dataset.oldAsian || '';
                const oldRange = analysisModal.dataset.oldRange || '';
                const oldInitialAnalysis = analysisModal.dataset.oldInitialAnalysis || '';
                const oldFinalAnalysis = analysisModal.dataset.oldFinalAnalysis || '';
                const oldOddsStructure = analysisModal.dataset.oldOddsStructure || '';
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
            })
            .finally(() => {
                saveAnalysisBtn.textContent = '💾 保存修改';
                saveAnalysisBtn.disabled = false;
            });
    }

    // ---------- 分页 ----------
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
            odds_structure: ''
        };
        fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                showToast('✅ 空记录已创建，ID: ' + res.id);
                loadHistory(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
            } else showToast('❌ 创建失败: ' + (res.error || '未知错误'), true);
        })
        .catch(err => showToast('❌ 请求出错: ' + err.message, true));
    }

    // ---------- 全局事件绑定 ----------
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
        alert('请使用“赔率分析”按钮进行编辑。');
    });

    // ---------- 页面初始化 ----------
    const urlParams = new URLSearchParams(window.location.search);
    const filterDateParam = urlParams.get('date');
    const filterHome = urlParams.get('home');
    const filterAway = urlParams.get('away');

    if (filterDateParam && filterHome && filterAway) {
        loading.style.display = 'block';
        tableWrap.style.display = 'none';
        fetch(`/api/match/find?date=${encodeURIComponent(filterDateParam)}&home_team=${encodeURIComponent(filterHome)}&away_team=${encodeURIComponent(filterAway)}`)
            .then(res => res.json())
            .then(data => {
                loading.style.display = 'none';
                tableWrap.style.display = 'block';
                if (data && data.id) {
                    const m = data;
                    const result = m.result || '未定';
                    let resultHtml = result;
                    if (result === '红') resultHtml = `<span style="color:#dc2626;font-weight:600;">红</span>`;
                    else if (result === '黑') resultHtml = `<span style="color:#1f2937;font-weight:600;">黑</span>`;
                    else if (result === '走盘') resultHtml = `<span style="color:#d97706;font-weight:600;">走盘</span>`;
                    const judgmentDisplay = judgmentMap[m.judgment] || m.judgment || '';
                    const homeScore = Math.round(parseFloat(m.home_score) || 0);
                    const awayScore = Math.round(parseFloat(m.away_score) || 0);
                    const scoreDisplay = `<span class="score-vs">${homeScore}</span> <span class="vs-large">VS</span> <span class="score-vs">${awayScore}</span>`;
                    const predDisplay = getPredictionDisplay(m.initial_prediction) || '—';
                    const isEmptyPred = !m.initial_prediction || m.initial_prediction === '[]' || m.initial_prediction === '""' || m.initial_prediction === 'null';
                    const asianOdds = m.asian_odds || '';

                    const rowHtml = `<tr>
                        <td class="checkbox-cell"><input type="checkbox" class="row-checkbox" data-id="${m.id}"></td>
                        <td>${m.id}</td>
                        <td>${m.date || ''}</td>
                        <td>${m.time || ''}</td>
                        <td>${m.league || ''}</td>
                        <td><a href="/index?id=${m.id}" class="team-link">${m.home_team}</a> <span class="vs-large">VS</span> <a href="/index?id=${m.id}" class="team-link">${m.away_team}</a></td>
                        <td>${scoreDisplay}</td>
                        <td>${judgmentDisplay}</td>
                        <td>${asianOdds}</td>
                        <td style="text-align:center;"><span class="prediction-clickable ${isEmptyPred ? 'empty' : ''}" style="cursor:default; text-decoration:none;">${predDisplay || '—'}</span></td>
                        <td>
                            <select class="result-select" data-id="${m.id}">
                                <option value="">未定</option>
                                <option value="红" ${result==='红'?'selected':''}>红</option>
                                <option value="黑" ${result==='黑'?'selected':''}>黑</option>
                                <option value="走盘" ${result==='走盘'?'selected':''}>走盘</option>
                            </select>
                        </td>
                        <td>
                            <button class="action-btn odds-analysis-btn" data-id="${m.id}">📊 赔率分析</button>
                            <button class="action-btn delete-btn" data-id="${m.id}">🗑️ 删除</button>
                        </td>
                    </tr>`;
                    tbody.innerHTML = rowHtml;
                    pagination.style.display = 'none';
                    bindEvents();
                } else {
                    const params = new URLSearchParams(window.location.search);
                    const createUrl = `/index?date=${encodeURIComponent(params.get('date'))}&home=${encodeURIComponent(params.get('home'))}&away=${encodeURIComponent(params.get('away'))}`;
                    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:30px;">
                        该赛事暂无预测记录。
                        <br><br>
                        <a href="${createUrl}" class="btn btn-primary" style="display:inline-block;padding:8px 20px;background:#1a3a6b;color:white;border-radius:30px;text-decoration:none;">📝 去创建预测</a>
                    </td></tr>`;
                    pagination.style.display = 'none';
                }
            })
            .catch(err => {
                loading.textContent = '❌ 加载失败: ' + err.message;
                console.error('加载失败:', err);
            });
    } else {
        loadHistory('', '', 20, 0);
    }
})();