(function() {
    "use strict";

    document.addEventListener('DOMContentLoaded', function() {
        // ---------- DOM 引用 ----------
        const tbody = document.getElementById('historyBody');
        const loading = document.getElementById('loading');
        const tableWrap = document.getElementById('tableWrap');
        const filterDate = document.getElementById('filter-date');
        const filterBtn = document.getElementById('filterBtn');
        const clearFilterBtn = document.getElementById('clearFilterBtn');

        const editModal = document.getElementById('editModal');
        const editTitle = document.getElementById('editTitle');
        const editFormContainer = document.getElementById('editFormContainer');
        const saveEditBtn = document.getElementById('saveEditBtn');
        const cancelEditBtn = document.getElementById('cancelEditBtn');

        const importFixturesBtn = document.getElementById('importFixturesBtn');
        const batchDeleteBtn = document.getElementById('batchDeleteBtn');
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');

        const pagination = document.getElementById('pagination');
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');
        const pageNumbers = document.getElementById('pageNumbers');
        const perPageSelect = document.getElementById('perPageSelect');
        const totalCountSpan = document.getElementById('totalCount');

        const toast = document.getElementById('toast');
        const addMatchBtn = document.getElementById('addMatchBtn');

        let currentOffset = 0;
        let currentLimit = 20;
        let currentDateFilter = '';
        let totalItems = 0;

        const judgmentMap = {
            'home_advantage':'主队占优', 'away_advantage':'客队占优', 'equal':'两队实力相当',
            'home_strong':'主队较强优势', 'away_strong':'客队较强优势',
            'home_dominant':'主队绝对优势', 'away_dominant':'客队绝对优势', 'both_weak':'两队菜鸡'
        };

        // ========== 工具函数 ==========
        function debounce(fn, delay) {
            let timer;
            return function(...args) {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), delay);
            };
        }

        function getPredictionDisplay(val) {
            if (!val) return '—';
            if (typeof val === 'string') {
                try {
                    const parsed = JSON.parse(val);
                    if (Array.isArray(parsed)) return parsed.join('、') || '—';
                    return val;
                } catch { return val; }
            }
            return val;
        }

        let toastTimer;
        function showToast(msg, isError=false) {
            toast.textContent = msg;
            toast.style.background = isError ? '#dc2626' : '#1f3a5f';
            toast.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
        }

        function apiRequest(url, options={}) {
            return fetch(url, {
                ...options,
                headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
            }).then(res => res.json());
        }

        // ========== 表单数据收集（复用） ==========
        function collectEditFormData() {
            const getVal = (id) => document.getElementById(id).value;
            return {
                date: getVal('edit-date'),
                time: getVal('edit-time'),
                league: getVal('edit-league'),
                home_team: getVal('edit-home-name'),
                away_team: getVal('edit-away-name'),
                home_rank: parseInt(getVal('edit-home-rank')) || 0,
                home_scored: parseInt(getVal('edit-home-scored')) || 0,
                home_conceded: parseInt(getVal('edit-home-conceded')) || 0,
                home_recent: parseInt(getVal('edit-home-recent')) || 0,
                home_wins: parseInt(getVal('edit-home-wins')) || 0,
                home_draws: parseInt(getVal('edit-home-draws')) || 0,
                home_losses: parseInt(getVal('edit-home-losses')) || 0,
                home_injuries: parseInt(getVal('edit-home-injuries')) || 0,
                home_motivation: parseInt(getVal('edit-home-motivation')) || 3,
                home_value: parseFloat(getVal('edit-home-value')) || 0,
                away_rank: parseInt(getVal('edit-away-rank')) || 0,
                away_scored: parseInt(getVal('edit-away-scored')) || 0,
                away_conceded: parseInt(getVal('edit-away-conceded')) || 0,
                away_recent: parseInt(getVal('edit-away-recent')) || 0,
                away_wins: parseInt(getVal('edit-away-wins')) || 0,
                away_draws: parseInt(getVal('edit-away-draws')) || 0,
                away_losses: parseInt(getVal('edit-away-losses')) || 0,
                away_injuries: parseInt(getVal('edit-away-injuries')) || 0,
                away_motivation: parseInt(getVal('edit-away-motivation')) || 3,
                away_value: parseFloat(getVal('edit-away-value')) || 0,
                home_unexpected: getVal('edit-home-unexpected') || '',
                away_unexpected: getVal('edit-away-unexpected') || '',
                home_score: parseInt(getVal('edit-home-score')) || 0,
                away_score: parseInt(getVal('edit-away-score')) || 0,
                home_prob: parseFloat(getVal('edit-home-prob')) || 0,
                draw_prob: parseFloat(getVal('edit-draw-prob')) || 0,
                away_prob: parseFloat(getVal('edit-away-prob')) || 0,
                judgment: getVal('edit-judgment'),
                result: getVal('edit-result') || null
            };
        }

        // ========== 加载 & 渲染 ==========
        function loadHistory() {
            loading.style.display = 'block';
            tableWrap.style.display = 'none';
            let url = `/api/history?limit=${currentLimit}&offset=${currentOffset}`;
            if (currentDateFilter) url += '&date=' + currentDateFilter;

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
                currentLimit = data.limit || currentLimit;
                currentOffset = data.offset || currentOffset;

                if (!matches.length) {
                    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:30px;">暂无预测记录</td></tr>';
                    pagination.style.display = 'none';
                    return;
                }

                let html = '';
                matches.forEach(m => {
                    const result = m.result || '未定';
                    let resultDisplay = result;
                    if (result === '红') resultDisplay = `<span style="color:#dc2626;font-weight:600;">红</span>`;
                    else if (result === '黑') resultDisplay = `<span style="color:#1f2937;font-weight:600;">黑</span>`;
                    else if (result === '走盘') resultDisplay = `<span style="color:#d97706;font-weight:600;">走盘</span>`;
                    const judgment = judgmentMap[m.judgment] || m.judgment || '';
                    const homeScore = Math.round(m.home_score || 0);
                    const awayScore = Math.round(m.away_score || 0);
                    const scoreDisplay = `<span class="score-vs">${homeScore}</span> <span class="vs-large">VS</span> <span class="score-vs">${awayScore}</span>`;
                    const predDisplay = getPredictionDisplay(m.initial_prediction);
                    const aiVal = m.ai_result || '';

                    html += `<tr data-id="${m.id}">
                        <td class="checkbox-cell"><input type="checkbox" class="row-checkbox" data-id="${m.id}"></td>
                        <td>${m.id}</td>
                        <td>${m.date || ''}</td>
                        <td>${m.time || ''}</td>
                        <td>${m.league || ''}</td>
                        <td><a href="/?id=${m.id}" class="team-link">${m.home_team}</a> <span class="vs-large">VS</span> <a href="/?id=${m.id}" class="team-link">${m.away_team}</a></td>
                        <td>${scoreDisplay}</td>
                        <td>${judgment}</td>
                        <td>${predDisplay}</td>
                        <td>
                            <select class="ai-result-select" data-id="${m.id}">
                                <option value="">未定</option>
                                <option value="红" ${aiVal==='红'?'selected':''}>红</option>
                                <option value="黑" ${aiVal==='黑'?'selected':''}>黑</option>
                                <option value="走盘" ${aiVal==='走盘'?'selected':''}>走盘</option>
                            </select>
                        </td>
                        <td>
                            <select class="result-select" data-id="${m.id}">
                                <option value="">未定</option>
                                <option value="红" ${result==='红'?'selected':''}>红</option>
                                <option value="黑" ${result==='黑'?'selected':''}>黑</option>
                                <option value="走盘" ${result==='走盘'?'selected':''}>走盘</option>
                            </select>
                        </td>
                        <td>
                            <button class="action-btn edit-btn" data-id="${m.id}">📊 预测/复盘</button>
                            <button class="action-btn delete-btn" data-id="${m.id}">🗑️ 删除</button>
                        </td>
                    </tr>`;
                });
                tbody.innerHTML = html;
                updatePagination();
            })
            .catch(err => {
                loading.textContent = '❌ 加载失败: ' + err.message;
                console.error(err);
            });
        }

        // ========== 分页 ==========
        function updatePagination() {
            const totalPages = Math.ceil(totalItems / currentLimit) || 1;
            const currentPage = Math.floor(currentOffset / currentLimit) + 1;
            totalCountSpan.textContent = totalItems;

            let html = '';
            const maxVisible = 7;
            let start = 1, end = totalPages;
            if (totalPages > maxVisible) {
                const half = Math.floor(maxVisible/2);
                if (currentPage <= half+1) end = maxVisible;
                else if (currentPage >= totalPages - half) start = totalPages - maxVisible + 1;
                else { start = currentPage - half; end = currentPage + half; }
            }
            if (start > 1) {
                html += `<span class="page-num" data-page="1">1</span>`;
                if (start > 2) html += `<span class="ellipsis">…</span>`;
            }
            for (let i=start; i<=end; i++) {
                html += `<span class="page-num ${i===currentPage?'active':''}" data-page="${i}">${i}</span>`;
            }
            if (end < totalPages) {
                if (end < totalPages-1) html += `<span class="ellipsis">…</span>`;
                html += `<span class="page-num" data-page="${totalPages}">${totalPages}</span>`;
            }
            pageNumbers.innerHTML = html;
            document.querySelectorAll('.page-num').forEach(el => {
                el.addEventListener('click', function() {
                    const page = parseInt(this.dataset.page);
                    if (page>=1 && page<=totalPages) {
                        currentOffset = (page-1) * currentLimit;
                        loadHistory();
                    }
                });
            });
            prevPageBtn.disabled = currentOffset === 0;
            nextPageBtn.disabled = currentOffset + currentLimit >= totalItems;
            pagination.style.display = 'flex';
        }

        // ========== 事件委托（下拉框、按钮） ==========
        document.addEventListener('change', function(e) {
            const target = e.target;
            if (target.classList.contains('result-select')) {
                const id = target.dataset.id;
                const val = target.value;
                apiRequest('/api/match/' + id + '/result', {
                    method: 'PUT',
                    body: JSON.stringify({ result: val || null })
                }).then(res => {
                    if (res.success) loadHistory();
                    else alert('更新失败: ' + (res.error || '未知错误'));
                });
                return;
            }
            if (target.classList.contains('ai-result-select')) {
                const id = target.dataset.id;
                const val = target.value;
                const oldVal = target.dataset.oldVal !== undefined ? target.dataset.oldVal : target.value;
                target.dataset.oldVal = oldVal;
                fetch('/api/match/' + id)
                    .then(res => res.json())
                    .then(data => {
                        data.ai_result = val || null;
                        return apiRequest('/api/match/' + id, {
                            method: 'PUT',
                            body: JSON.stringify(data)
                        });
                    })
                    .then(res => {
                        if (res.success) {
                            showToast('✅ AI结果已更新');
                            target.dataset.oldVal = val;
                        } else {
                            target.value = oldVal;
                            alert('更新AI结果失败: ' + (res.error || '未知错误'));
                        }
                    })
                    .catch(err => {
                        target.value = oldVal;
                        alert('更新失败: ' + err.message);
                    });
                return;
            }
        });

        document.addEventListener('click', function(e) {
            const target = e.target.closest('button');
            if (target) {
                if (target.classList.contains('edit-btn')) {
                    const id = target.dataset.id;
                    if (id) openEditModal(id);
                    return;
                }
                if (target.classList.contains('delete-btn')) {
                    const id = target.dataset.id;
                    if (confirm('确定删除该预测记录吗？')) {
                        apiRequest('/api/match/' + id, { method: 'DELETE' })
                            .then(res => {
                                if (res.success) loadHistory();
                                else alert('删除失败: ' + (res.error || '未知错误'));
                            });
                    }
                    return;
                }
            }
        });

        selectAllCheckbox.addEventListener('change', function() {
            const checked = this.checked;
            document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = checked);
        });

        batchDeleteBtn.addEventListener('click', function() {
            const selected = document.querySelectorAll('.row-checkbox:checked');
            if (!selected.length) { showToast('请至少选择一条记录'); return; }
            if (!confirm(`确定删除 ${selected.length} 条记录吗？`)) return;
            const ids = Array.from(selected).map(cb => parseInt(cb.dataset.id));
            let done = 0, success = 0, fail = 0;
            ids.forEach(id => {
                apiRequest('/api/match/' + id, { method: 'DELETE' })
                    .then(res => {
                        if (res.success) success++; else fail++;
                    })
                    .catch(() => fail++)
                    .finally(() => {
                        done++;
                        if (done === ids.length) {
                            showToast(`批量删除完成：成功 ${success} 条，失败 ${fail} 条`);
                            loadHistory();
                        }
                    });
            });
        });

        filterBtn.addEventListener('click', function() {
            currentDateFilter = filterDate.value;
            currentOffset = 0;
            loadHistory();
        });
        clearFilterBtn.addEventListener('click', function() {
            filterDate.value = '';
            currentDateFilter = '';
            currentOffset = 0;
            loadHistory();
        });

        prevPageBtn.addEventListener('click', function() {
            currentOffset = Math.max(0, currentOffset - currentLimit);
            loadHistory();
        });
        nextPageBtn.addEventListener('click', function() {
            currentOffset = Math.min(totalItems - currentLimit, currentOffset + currentLimit);
            loadHistory();
        });
        perPageSelect.addEventListener('change', function() {
            currentLimit = parseInt(this.value);
            currentOffset = 0;
            loadHistory();
        });

        // ========== 编辑模态框 ==========
        const editFields = {
            home: [
                { id:'home-name', label:'球队名称', type:'text', key:'home_team' },
                { id:'home-rank', label:'排名', type:'number', key:'home_rank' },
                { id:'home-scored', label:'总进球', type:'number', key:'home_scored' },
                { id:'home-conceded', label:'总失球', type:'number', key:'home_conceded' },
                { id:'home-recent', label:'近3场积分', type:'number', key:'home_recent' },
                { id:'home-wins', label:'近3主场胜', type:'number', key:'home_wins' },
                { id:'home-draws', label:'近3主场平', type:'number', key:'home_draws' },
                { id:'home-losses', label:'近3主场负', type:'number', key:'home_losses' },
                { id:'home-injuries', label:'关键缺阵', type:'number', key:'home_injuries' },
                { id:'home-motivation', label:'战意等级', type:'number', key:'home_motivation', min:1, max:5 },
                { id:'home-value', label:'身价(M€)', type:'number', step:0.1, key:'home_value' },
                { id:'home-unexpected', label:'意外因素', type:'text', key:'home_unexpected' }
            ],
            away: [
                { id:'away-name', label:'球队名称', type:'text', key:'away_team' },
                { id:'away-rank', label:'排名', type:'number', key:'away_rank' },
                { id:'away-scored', label:'总进球', type:'number', key:'away_scored' },
                { id:'away-conceded', label:'总失球', type:'number', key:'away_conceded' },
                { id:'away-recent', label:'近3场积分', type:'number', key:'away_recent' },
                { id:'away-wins', label:'近3客场胜', type:'number', key:'away_wins' },
                { id:'away-draws', label:'近3客场平', type:'number', key:'away_draws' },
                { id:'away-losses', label:'近3客场负', type:'number', key:'away_losses' },
                { id:'away-injuries', label:'关键缺阵', type:'number', key:'away_injuries' },
                { id:'away-motivation', label:'战意等级', type:'number', key:'away_motivation', min:1, max:5 },
                { id:'away-value', label:'身价(M€)', type:'number', step:0.1, key:'away_value' },
                { id:'away-unexpected', label:'意外因素', type:'text', key:'away_unexpected' }
            ]
        };

        function buildEditForm(data) {
            let html = `<div class="two-col">`;
            // 主队
            html += `<div><div class="section-title">🏠 主队</div>`;
            editFields.home.forEach(f => {
                let value = data[f.key] !== undefined ? data[f.key] : '';
                let attrs = '';
                if (f.type === 'number') {
                    attrs += ` step="${f.step || 1}"`;
                    if (f.min !== undefined) attrs += ` min="${f.min}"`;
                    if (f.max !== undefined) attrs += ` max="${f.max}"`;
                }
                html += `<div class="form-group"><label>${f.label}</label><input type="${f.type}" id="edit-${f.id}" value="${value}"${attrs}></div>`;
            });
            html += `</div>`;
            // 客队
            html += `<div><div class="section-title">✈️ 客队</div>`;
            editFields.away.forEach(f => {
                let value = data[f.key] !== undefined ? data[f.key] : '';
                let attrs = '';
                if (f.type === 'number') {
                    attrs += ` step="${f.step || 1}"`;
                    if (f.min !== undefined) attrs += ` min="${f.min}"`;
                    if (f.max !== undefined) attrs += ` max="${f.max}"`;
                }
                html += `<div class="form-group"><label>${f.label}</label><input type="${f.type}" id="edit-${f.id}" value="${value}"${attrs}></div>`;
            });
            html += `</div></div>`;

            html += `<div class="form-group"><label>日期</label><input type="date" id="edit-date" value="${data.date||''}"></div>`;
            html += `<div class="form-group"><label>时间</label><input type="text" id="edit-time" value="${data.time||''}" placeholder="如 19:30"></div>`;
            html += `<div class="form-group"><label>联赛</label><input type="text" id="edit-league" value="${data.league||''}"></div>`;

            html += `<div class="section-title">📊 预测结果</div>`;
            html += `<div class="form-group"><label>主队得分</label><input type="number" step="1" id="edit-home-score" value="${Math.round(data.home_score||0)}"></div>`;
            html += `<div class="form-group"><label>客队得分</label><input type="number" step="1" id="edit-away-score" value="${Math.round(data.away_score||0)}"></div>`;
            html += `<div class="form-group"><label>主胜概率</label><input type="number" step="0.01" id="edit-home-prob" value="${data.home_prob||0}"></div>`;
            html += `<div class="form-group"><label>平局概率</label><input type="number" step="0.01" id="edit-draw-prob" value="${data.draw_prob||0}"></div>`;
            html += `<div class="form-group"><label>客胜概率</label><input type="number" step="0.01" id="edit-away-prob" value="${data.away_prob||0}"></div>`;

            const judgmentOptions = [
                {val:'home_advantage', label:'主队占优'}, {val:'away_advantage', label:'客队占优'},
                {val:'equal', label:'两队实力相当'}, {val:'home_strong', label:'主队较强优势'},
                {val:'away_strong', label:'客队较强优势'}, {val:'home_dominant', label:'主队绝对优势'},
                {val:'away_dominant', label:'客队绝对优势'}, {val:'both_weak', label:'两队菜鸡'}
            ];
            html += `<div class="form-group"><label>基本面判断</label><select id="edit-judgment">`;
            judgmentOptions.forEach(opt => {
                html += `<option value="${opt.val}" ${data.judgment===opt.val?'selected':''}>${opt.label}</option>`;
            });
            html += `</select></div>`;

            const resultOptions = ['', '红', '黑', '走盘'];
            html += `<div class="form-group"><label>结果</label><select id="edit-result">`;
            resultOptions.forEach(r => {
                const label = r || '未定';
                html += `<option value="${r}" ${data.result===r?'selected':''}>${label}</option>`;
            });
            html += `</select></div>`;

            editFormContainer.innerHTML = html;

            // ---------- 绑定自动保存（防抖） ----------
            const id = saveEditBtn.dataset.id;
            if (id) {
                const autoSave = debounce(function() {
                    const formData = collectEditFormData();
                    apiRequest('/api/match/' + id, {
                        method: 'PUT',
                        body: JSON.stringify(formData)
                    })
                    .then(res => {
                        if (res.success) {
                            showToast('✅ 自动保存成功');
                            loadHistory();        // 刷新表格数据，保持模态框开启
                        } else {
                            showToast('❌ 自动保存失败: ' + (res.error || '未知错误'), true);
                        }
                    })
                    .catch(err => {
                        showToast('❌ 自动保存请求出错: ' + err.message, true);
                    });
                }, 600); // 延迟600ms

                const inputs = editFormContainer.querySelectorAll('input, select');
                inputs.forEach(el => {
                    el.addEventListener('input', autoSave);
                    el.addEventListener('change', autoSave);
                });
            }
        }

        function openEditModal(id) {
            fetch('/api/match/' + id)
                .then(res => res.json())
                .then(data => {
                    if (data.error) { alert(data.error); return; }
                    editTitle.textContent = `📝 预测/复盘 - ${data.home_team} vs ${data.away_team}`;
                    saveEditBtn.dataset.id = id;   // 先设置 id
                    buildEditForm(data);
                    editModal.style.display = 'flex';
                });
        }

        // 保存修改按钮（手动触发）
        saveEditBtn.addEventListener('click', function() {
            const id = this.dataset.id;
            if (!id) return;
            const formData = collectEditFormData();
            apiRequest('/api/match/' + id, {
                method: 'PUT',
                body: JSON.stringify(formData)
            })
            .then(res => {
                if (res.success) {
                    editModal.style.display = 'none';
                    loadHistory();
                    alert('✅ 修改成功！');
                } else {
                    alert('❌ 修改失败: ' + (res.error || '未知错误'));
                }
            });
        });

        cancelEditBtn.addEventListener('click', function() { editModal.style.display = 'none'; });
        window.addEventListener('click', function(e) {
            if (e.target === editModal) editModal.style.display = 'none';
        });

        // ========== 手动添加 ==========
        addMatchBtn.addEventListener('click', function() {
            const payload = {
                date:'', time:'', league:'',
                home_team:'主队', away_team:'客队',
                home_rank:10, home_scored:0, home_conceded:0, home_recent:0,
                home_wins:0, home_draws:0, home_losses:0, home_injuries:0,
                home_motivation:3, home_value:0,
                away_rank:10, away_scored:0, away_conceded:0, away_recent:0,
                away_wins:0, away_draws:0, away_losses:0, away_injuries:0,
                away_motivation:3, away_value:0,
                home_unexpected:'', away_unexpected:'',
                home_score:0, away_score:0,
                home_prob:0.33, draw_prob:0.34, away_prob:0.33,
                judgment:'equal'
            };
            apiRequest('/api/save', {
                method: 'POST',
                body: JSON.stringify(payload)
            }).then(res => {
                if (res.success) {
                    showToast('✅ 空记录已创建，ID: ' + res.id);
                    window.location.href = '/?id=' + res.id;
                } else {
                    showToast('❌ 创建失败: ' + (res.error || '未知错误'), true);
                }
            }).catch(err => showToast('❌ 请求出错: ' + err.message, true));
        });

        // 批量导入占位
        importFixturesBtn.addEventListener('click', function() {
            alert('批量导入功能已实现，请参考完整代码');
        });

        // ========== 初始化 ==========
        loadHistory();
    });
})();