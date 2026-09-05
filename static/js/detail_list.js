// static/js/detail_list.js
(function() {
    "use strict";

    // 页面加载时传入 resultType: '红', '黑', '走盘'
    const resultType = window.RESULT_TYPE || '';  // 由页面变量定义

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

    let allMatches = [];
    let currentOffset = 0;
    let currentLimit = 20;
    let totalItems = 0;

    // DOM 引用
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

    // ---------- 保存复盘 ----------
    function saveReview(id, value) {
        const input = document.querySelector(`.review-input[data-id="${id}"]`);
        const tag = document.getElementById(`review-tag-${id}`);
        if (input) input.classList.add('saving');
        if (tag) tag.classList.remove('show');

        fetch(`/api/match/${id}`)
            .then(res => {
                if (!res.ok) throw new Error('获取数据失败');
                return res.json();
            })
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
                    if (input) input.defaultValue = value;
                } else {
                    throw new Error(result.error || '未知错误');
                }
            })
            .catch(err => {
                alert('保存复盘失败: ' + err.message);
                if (input) input.value = input.defaultValue || '';
            })
            .finally(() => {
                if (input) input.classList.remove('saving');
            });
    }

    // ---------- 加载列表 ----------
    function loadList() {
        loading.style.display = 'block';
        tableWrap.style.display = 'none';

        fetch('/api/history?limit=5000')
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                const matches = data.data || [];
                allMatches = matches.filter(m => m.result === resultType);
                totalItems = allMatches.length;
                loading.style.display = 'none';
                tableWrap.style.display = 'block';
                if (totalItems === 0) {
                    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;">暂无${resultType}单记录</td></tr>`;
                    pagination.style.display = 'none';
                    if (selectAll) selectAll.checked = false;
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

    // ---------- 渲染当前页 ----------
    function renderPage() {
        const start = currentOffset;
        const end = Math.min(start + currentLimit, totalItems);
        const pageItems = allMatches.slice(start, end);
        let html = '';
        pageItems.forEach(m => {
            const judgmentDisplay = judgmentMap[m.judgment] || m.judgment || '—';
            const pos1 = m.pos1 || '—';
            const pos2 = m.pos2 || '—';
            const homeTeam = m.home_team || '?';
            const awayTeam = m.away_team || '?';
            const league = m.league || '—';
            const homeScore = Math.round(parseFloat(m.home_score) || 0);
            const awayScore = Math.round(parseFloat(m.away_score) || 0);
            const scoreDisplay = `${homeScore} VS ${awayScore}`;
            const review = m.review || '';
            const color = resultType === '红' ? '#dc2626' : (resultType === '黑' ? '#1f2937' : '#d97706');
            html += `
                <tr>
                    <td><input type="checkbox" class="row-checkbox" data-id="${m.id}" /></td>
                    <td>${m.id}</td>
                    <td>${league}</td>
                    <td>${homeTeam} <span style="font-weight:600;color:#3b7cff;">VS</span> ${awayTeam}</td>
                    <td>${pos1}</td>
                    <td>${pos2}</td>
                    <td>${scoreDisplay}</td>
                    <td>${judgmentDisplay}</td>
                    <td style="color:${color};font-weight:600;">${resultType}</td>
                    <td>
                        <input class="review-input" data-id="${m.id}" value="${review}" placeholder="输入复盘..." />
                        <span class="save-tag" id="review-tag-${m.id}">✓</span>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        totalCount.textContent = totalItems;

        // 绑定复盘输入事件
        tbody.querySelectorAll('.review-input').forEach(inp => {
            inp.addEventListener('blur', function() {
                const id = this.dataset.id;
                const value = this.value.trim();
                const oldVal = this.defaultValue || '';
                if (value === oldVal) return;
                saveReview(id, value);
            });
            inp.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
                if (e.key === 'Escape') { this.blur(); }
            });
        });

        // 更新全选状态（当页面数据变化时，全选复选框应取消选中）
        if (selectAll) selectAll.checked = false;
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
        if (checked.length === 0) {
            alert('请至少选择一条记录');
            return;
        }
        if (!confirm(`确定删除选中的 ${checked.length} 条记录吗？此操作不可恢复！`)) return;

        const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id));
        let done = 0, success = 0, fail = 0;
        ids.forEach(id => {
            fetch(`/api/match/${id}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(res => {
                    if (res.success) success++; else fail++;
                })
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
        // 分页按钮
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

        // 删除按钮
        deleteBtn.addEventListener('click', deleteSelected);

        // 全选功能
        if (selectAll) {
            selectAll.addEventListener('change', function() {
                const checked = this.checked;
                document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = checked);
            });
        }

        // 加载数据
        loadList();
    });
})();