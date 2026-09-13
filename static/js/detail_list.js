// static/js/detail_list.js
(function() {
    "use strict";

    const resultType = window.RESULT_TYPE || '';
    const listMode = window.ALL_LIST_MODE || '';

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

    let rawMatches = [];
    let allMatches = [];
    let currentOffset = 0;
    let currentLimit = 20;
    let totalItems = 0;

    let filterPos1 = '';
    let filterPos2 = '';

    const loading = document.getElementById('loading');
    const tableWrap = document.getElementById('tableWrap');
    const tbody = document.getElementById('detailBody');
    const pagination = document.getElementById('pagination');
    const totalCount = document.getElementById('totalCount');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const pageNumbers = document.getElementById('pageNumbers');
    const perPageSelect = document.getElementById('perPageSelect');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const selectAll = document.getElementById('selectAll');

    const filterBarEl = document.getElementById('filterBar');
    const pos1FilterEl = document.getElementById('pos1Filter');
    const pos2FilterEl = document.getElementById('pos2Filter');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const filterInfoEl = document.getElementById('filterInfo');
    const loadTipEl = document.getElementById('loadTip');

    // ---------- 工具 ----------
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getPredictionDisplay(val) {
        if (!val) return '—';
        if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) return parsed.join('、') || '—';
                return val;
            } catch (e) { return val; }
        }
        return val;
    }

    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    function saveReview(id, value) {
        const textarea = document.querySelector(`.review-input[data-id="${id}"]`);
        const tag = document.getElementById(`review-tag-${id}`);
        if (textarea) textarea.classList.add('saving');
        if (tag) tag.classList.remove('show');

        fetch(`/api/match/${id}`)
            .then(res => { if (!res.ok) throw new Error('获取数据失败'); return res.json(); })
            .then(data => {
                data.review = value;
                return fetch(`/api/match/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            })
            .then(res => {
                if (!res.ok) return res.json().then(err => { throw new Error(err.error || '保存失败'); });
                return res.json();
            })
            .then(result => {
                if (result.success) {
                    if (tag) tag.classList.add('show');
                    if (textarea) {
                        textarea.defaultValue = value;
                        textarea.title = value;
                        autoResize(textarea);
                    }
                } else { throw new Error(result.error || '未知错误'); }
            })
            .catch(err => {
                alert('保存复盘失败: ' + err.message);
                if (textarea) textarea.value = textarea.defaultValue || '';
            })
            .finally(() => { if (textarea) textarea.classList.remove('saving'); });
    }

    /* ============================================================
     * 通用循环分页拉取
     *   - 用实际返回条数推进 offset
     *   - 去重 + 无新数据时停止
     *   - 有 total 时按 total 终止
     * ============================================================ */
    async function fetchPagedAll(baseUrl) {
        const seen = new Set();
        const all = [];
        let offset = 0;
        let total = null;
        let stopped = '';
        let round = 0;
        const maxRounds = 500;

        while (round++ < maxRounds) {
            const sep = baseUrl.includes('?') ? '&' : '?';
            const url = `${baseUrl}${sep}limit=1000&offset=${offset}`;
            let data;
            try {
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                data = await res.json();
            } catch (e) {
                console.error('拉取失败:', url, e);
                stopped = '请求失败，已加载部分数据';
                break;
            }

            const arr = Array.isArray(data) ? data : (data.data || []);
            if (arr.length === 0) { stopped = '已到达数据末尾'; break; }

            let added = 0;
            for (const m of arr) {
                const key = (m && m.id !== undefined && m.id !== null && m.id !== '')
                    ? 'id:' + m.id
                    : ['k', m && m.date, m && m.time, m && m.league, m && m.home_team, m && m.away_team].join('|');
                if (seen.has(key)) continue;
                seen.add(key);
                all.push(m);
                added++;
            }

            if (added === 0) { stopped = '服务端未返回新数据，已停止加载'; break; }

            offset += arr.length;

            const t = Number(data && data.total);
            if (Number.isFinite(t) && t > 0) {
                total = t;
                if (all.length >= total) { stopped = '已加载全部数据'; break; }
            }
        }

        if (round >= maxRounds) stopped = '达到最大请求次数，已停止加载';
        if (Number.isFinite(total) && total > 0 && all.length > total) {
            all.length = total;
        }
        return { items: all, total: total, stopped: stopped };
    }

    /* ============================================================
     * ★ 合并数据源（all_list 专用）
     *   1) history 全量（做过分析的记录）
     *   2) fixtures 里 analyzed=1 但 history 里没有的
     * ============================================================ */
    async function fetchAllAnalyzedMerged() {
        const [fixResult, histResult] = await Promise.all([
            fetchPagedAll('/api/fixtures'),
            fetchPagedAll('/api/history')
        ]);

        const fixtures = fixResult.items || [];
        const histories = histResult.items || [];

        const matchKey = (m) => [
            (m.date || '').trim(),
            (m.time || '').trim(),
            (m.league || '').trim(),
            (m.home_team || '').trim(),
            (m.away_team || '').trim()
        ].join('|');

        const result = [];
        const usedKeys = new Set();

        // 1) 所有 history 记录
        histories.forEach(h => {
            result.push(h);
            usedKeys.add(matchKey(h));
        });

        // 2) fixtures 里 analyzed=1 但 history 里没有的
        fixtures.forEach(f => {
            const isAnalyzed = f.analyzed === 1 || f.analyzed === '1' || f.analyzed === true;
            if (!isAnalyzed) return;
            const k = matchKey(f);
            if (usedKeys.has(k)) return;
            result.push({
                id: f.id,
                date: f.date || '',
                time: f.time || '',
                league: f.league || '',
                home_team: f.home_team || '',
                away_team: f.away_team || '',
                score: f.score || '',
                analyzed: f.analyzed,
                pos1: '',
                pos2: '',
                asian_odds: '',
                judgment: '',
                result: '',
                review: '',
                bet: ''
            });
            usedKeys.add(k);
        });

        window.__allListMeta = {
            fixturesCount: fixtures.length,
            historiesCount: histories.length,
            mergedCount: result.length,
            fixturesTotal: fixResult.total,
            historiesTotal: histResult.total,
            fixturesStopped: fixResult.stopped,
            historiesStopped: histResult.stopped
        };

        return result;
    }

    // ---------- 默认数据源（red_list / black_list / draw_list / pending_list） ----------
    async function fetchMatches() {
        const result = await fetchPagedAll('/api/history');
        window.__allListMeta = {
            fetched: result.items.length,
            total: result.total,
            stopped: result.stopped
        };
        return result.items;
    }

    // ---------- 统一入口 ----------
    async function loadRawMatches() {
        if (listMode === 'FIXTURES') {
            return await fetchAllAnalyzedMerged();
        }

        const matches = await fetchMatches();
        if (resultType === '待定') {
            return matches.filter(m => !m.result || m.result === '' || m.result === null);
        } else if (resultType === 'ALL') {
            return matches.filter(m =>
                m.result === '红' || m.result === '黑' || m.result === '走盘'
            );
        } else {
            return matches.filter(m => m.result === resultType);
        }
    }

    // ---------- 筛选 ----------
    function populateFilterOptions() {
        if (!pos1FilterEl || !pos2FilterEl) return;
        if (filterBarEl) filterBarEl.style.display = 'flex';

        const prevP1 = filterPos1;
        const prevP2 = filterPos2;

        const pos1Values = Array.from(new Set(
            rawMatches.map(m => m.pos1)
                .filter(v => v !== undefined && v !== null && v !== '')
                .map(v => String(v))
        )).sort((a, b) => a.localeCompare(b, 'zh-CN'));

        const pos2Values = Array.from(new Set(
            rawMatches.map(m => m.pos2)
                .filter(v => v !== undefined && v !== null && v !== '')
                .map(v => String(v))
        )).sort((a, b) => a.localeCompare(b, 'zh-CN'));

        pos1FilterEl.innerHTML = '<option value="">全部初01</option>' +
            pos1Values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
        pos2FilterEl.innerHTML = '<option value="">全部初02</option>' +
            pos2Values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');

        pos1FilterEl.value = pos1Values.indexOf(prevP1) >= 0 ? prevP1 : '';
        pos2FilterEl.value = pos2Values.indexOf(prevP2) >= 0 ? prevP2 : '';
        filterPos1 = pos1FilterEl.value;
        filterPos2 = pos2FilterEl.value;
    }

    function applyFilters() {
        allMatches = rawMatches.filter(m => {
            if (filterPos1 && String(m.pos1 || '') !== filterPos1) return false;
            if (filterPos2 && String(m.pos2 || '') !== filterPos2) return false;
            return true;
        });
        totalItems = allMatches.length;
    }

    function updateFilterInfo() {
        if (!filterInfoEl) return;
        const parts = [];
        if (filterPos1) parts.push(`初01 = ${filterPos1}`);
        if (filterPos2) parts.push(`初02 = ${filterPos2}`);
        filterInfoEl.textContent = parts.length === 0 ? '' : `已筛选：${parts.join(' 且 ')} （${totalItems} 条）`;
    }

    function refreshAfterFilterChange() {
        currentOffset = 0;
        applyFilters();
        updateFilterInfo();
        if (totalItems === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:30px;">没有符合筛选条件的记录</td></tr>`;
            totalCount.textContent = '0';
            pagination.style.display = 'none';
            return;
        }
        renderPage();
        updatePagination();
    }

    // ---------- 加载 ----------
    function loadList() {
        loading.style.display = 'block';
        tableWrap.style.display = 'none';
        if (loadTipEl) loadTipEl.style.display = 'none';

        loadRawMatches()
            .then(matches => {
                rawMatches = matches;

                rawMatches.sort((a, b) => {
                    const ai = Number(a.id), bi = Number(b.id);
                    if (Number.isFinite(ai) && Number.isFinite(bi)) return bi - ai;
                    return 0;
                });

                populateFilterOptions();
                applyFilters();

                loading.style.display = 'none';
                tableWrap.style.display = 'block';
                updateFilterInfo();

                const meta = window.__allListMeta;
                if (loadTipEl && meta && (meta.historiesStopped || meta.fixturesStopped)) {
                    loadTipEl.textContent = `加载提示: ${meta.historiesStopped || ''} ${meta.fixturesStopped || ''}`;
                    loadTipEl.style.display = 'block';
                }

                if (totalItems === 0) {
                    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:30px;">暂无记录</td></tr>`;
                    pagination.style.display = 'none';
                    return;
                }
                renderPage();
                updatePagination();
            })
            .catch(err => {
                loading.textContent = '❌ 加载失败: ' + err.message;
                console.error(err);
            });
    }

    // ---------- 渲染 ----------
    function renderPage() {
        const start = currentOffset;
        const end = Math.min(start + currentLimit, totalItems);
        const pageItems = allMatches.slice(start, end);
        let html = '';

        pageItems.forEach(m => {
            const judgmentDisplay = judgmentMap[m.judgment] || m.judgment || '—';
            const pos1 = m.pos1 || '—';
            const pos2 = m.pos2 || '—';
            const asianOdds = m.asian_odds || '—';
            const homeTeam = m.home_team || '?';
            const awayTeam = m.away_team || '?';
            const league = m.league || '—';
            const predDisplay = getPredictionDisplay(m.initial_prediction);
            const review = m.review || '';
            const bet = m.bet === '是' ? '是' : '否';

            let resultDisplay = '';
            let color = '#6b7280';
            if (listMode === 'FIXTURES' || resultType === 'ALL') {
                resultDisplay = m.result || '—';
                if (m.result === '红') color = '#dc2626';
                else if (m.result === '黑') color = '#1f2937';
                else if (m.result === '走盘') color = '#d97706';
            } else {
                resultDisplay = resultType;
                color = resultType === '红' ? '#dc2626'
                      : (resultType === '黑' ? '#1f2937'
                      : (resultType === '走盘' ? '#d97706' : '#6b7280'));
            }

            const params = new URLSearchParams({
                date: m.date || '',
                time: m.time || '',
                league: m.league || '',
                home: m.home_team || '',
                away: m.away_team || ''
            });
            const oddsUrl = `/odds?${params.toString()}`;
            const homeLink = `<a href="${oddsUrl}" class="team-link">${homeTeam}</a>`;
            const awayLink = `<a href="${oddsUrl}" class="team-link">${awayTeam}</a>`;
            const teamDisplay = `${homeLink} <span style="font-weight:600;color:#3b7cff;">VS</span> ${awayLink}`;

            html += `
                <tr>
                    <td><input type="checkbox" class="row-checkbox" data-id="${m.id}" /></td>
                    <td>${m.id}</td>
                    <td>${league}</td>
                    <td>${teamDisplay}</td>
                    <td>${pos1}</td>
                    <td>${pos2}</td>
                    <td>${asianOdds}</td>
                    <td>${predDisplay}</td>
                    <td>${judgmentDisplay}</td>
                    <td>${bet}</td>
                    <td style="color:${color};font-weight:600;">${resultDisplay}</td>
                    <td>
                        <textarea class="review-input" data-id="${m.id}" placeholder="输入复盘..." title="${review}">${review}</textarea>
                        <span class="save-tag" id="review-tag-${m.id}">✓</span>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        totalCount.textContent = totalItems;

        tbody.querySelectorAll('.review-input').forEach(el => {
            autoResize(el);
            el.addEventListener('input', function() {
                autoResize(this);
                this.title = this.value;
            });
            el.addEventListener('blur', function() {
                const id = this.dataset.id;
                const value = this.value.trim();
                const oldVal = this.defaultValue || '';
                if (value === oldVal) return;
                saveReview(id, value);
            });
            el.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.blur(); }
                if (e.key === 'Escape') { this.blur(); }
            });
        });
    }

    // ---------- 分页 ----------
    function updatePagination() {
        const totalPages = Math.ceil(totalItems / currentLimit) || 1;
        const currentPage = Math.floor(currentOffset / currentLimit) + 1;

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
                if (page >= 1 && page <= totalPages) {
                    currentOffset = (page - 1) * currentLimit;
                    renderPage();
                    updatePagination();
                }
            });
        });
        prevBtn.disabled = currentOffset === 0;
        nextBtn.disabled = currentOffset + currentLimit >= totalItems;
        pagination.style.display = 'flex';
    }

    // ---------- 删除选中 ----------
    function deleteSelected() {
        const checked = document.querySelectorAll('.row-checkbox:checked');
        if (checked.length === 0) { alert('请至少选择一条记录'); return; }
        if (!confirm(`确定删除选中的 ${checked.length} 条记录吗？此操作不可恢复！`)) return;

        const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id));
        let done = 0, success = 0, fail = 0;
        ids.forEach(id => {
            fetch(`/api/match/${id}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(res => { if (res.success) success++; else fail++; })
                .catch(() => fail++)
                .finally(() => {
                    done++;
                    if (done === ids.length) {
                        alert(`删除完成：成功 ${success} 条，失败 ${fail} 条`);
                        currentOffset = 0;
                        loadList();
                    }
                });
        });
    }

    // ---------- 事件绑定 ----------
    document.addEventListener('DOMContentLoaded', function() {
        prevBtn.addEventListener('click', function() {
            if (currentOffset > 0) {
                currentOffset = Math.max(0, currentOffset - currentLimit);
                renderPage();
                updatePagination();
            }
        });
        nextBtn.addEventListener('click', function() {
            if (currentOffset + currentLimit < totalItems) {
                currentOffset = Math.min(totalItems - currentLimit, currentOffset + currentLimit);
                renderPage();
                updatePagination();
            }
        });
        perPageSelect.addEventListener('change', function() {
            currentLimit = parseInt(this.value);
            currentOffset = 0;
            renderPage();
            updatePagination();
        });
        deleteBtn.addEventListener('click', deleteSelected);

        if (selectAll) {
            selectAll.addEventListener('change', function() {
                document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = this.checked);
            });
        }

        if (pos1FilterEl) {
            pos1FilterEl.addEventListener('change', function() {
                filterPos1 = this.value;
                refreshAfterFilterChange();
            });
        }
        if (pos2FilterEl) {
            pos2FilterEl.addEventListener('change', function() {
                filterPos2 = this.value;
                refreshAfterFilterChange();
            });
        }
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', function() {
                if (pos1FilterEl) pos1FilterEl.value = '';
                if (pos2FilterEl) pos2FilterEl.value = '';
                filterPos1 = '';
                filterPos2 = '';
                refreshAfterFilterChange();
            });
        }

        loadList();
    });
})();