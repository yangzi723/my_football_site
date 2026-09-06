(function() {
    const tbody = document.getElementById('fixturesBody');
    const loading = document.getElementById('loading');
    const tableWrap = document.getElementById('tableWrap');
    const filterDate = document.getElementById('filter-date');
    const filterLeague = document.getElementById('filter-league');
    const filterBtn = document.getElementById('filterBtn');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const addBtn = document.getElementById('addBtn');
    const editModal = document.getElementById('editModal');
    const editTitle = document.getElementById('editTitle');
    const editDate = document.getElementById('edit-date');
    const editTime = document.getElementById('edit-time');
    const editLeague = document.getElementById('edit-league');
    const editHome = document.getElementById('edit-home');
    const editAway = document.getElementById('edit-away');
    const editHomeScore = document.getElementById('edit-home-score');
    const editAwayScore = document.getElementById('edit-away-score');
    const saveEditBtn = document.getElementById('saveEditBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const toast = document.getElementById('toast');

    const pagination = document.getElementById('pagination');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageNumbers = document.getElementById('pageNumbers');
    const perPageSelect = document.getElementById('perPageSelect');
    const totalCountSpan = document.getElementById('totalCount');

    const fetchDate = document.getElementById('fetch-date');
    const includeFinished = document.getElementById('include-finished');
    const fetchBtn = document.getElementById('fetchFixturesBtn');

    let currentEditId = null;
    let toastTimer = null;
    let currentOffset = 0;
    let currentLimit = 20;
    let currentDateFilter = '';
    let currentLeagueFilter = '';
    let totalItems = 0;

    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function splitScore(scoreStr) {
        if (!scoreStr) return ['', ''];
        const parts = scoreStr.split(':');
        if (parts.length === 2) return [parts[0].trim(), parts[1].trim()];
        return ['', ''];
    }

    function isMatchFinished(dateStr, timeStr) {
        if (!dateStr) return false;
        if (!timeStr || timeStr.trim() === '') return false;
        try {
            const matchTime = new Date(dateStr + 'T' + timeStr.trim() + ':00');
            const now = new Date();
            return (now - matchTime) > 10800000;
        } catch (e) { return false; }
    }

    // ---------- 更新联赛下拉框 ----------
    function updateLeagueSelect(fixtures) {
        const select = document.getElementById('filter-league');
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = '<option value="">全部联赛</option>';
        const leagues = new Set();
        fixtures.forEach(f => {
            if (f.league) leagues.add(f.league);
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

    // ---------- 加载赛事 ----------
    function loadFixtures(date, league, limit, offset) {
        if (date === undefined) date = currentDateFilter;
        if (league === undefined) league = currentLeagueFilter;
        if (limit === undefined) limit = currentLimit;
        if (offset === undefined) offset = currentOffset;

        loading.style.display = 'block';
        tableWrap.style.display = 'none';
        let url = `/api/fixtures?limit=${limit}&offset=${offset}`;
        if (date) url += '&date=' + date;
        if (league) url += '&league=' + encodeURIComponent(league);

        fetch(url)
        .then(res => {
            if (!res.ok) {
                return res.text().then(text => {
                    throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`);
                });
            }
            return res.json();
        })
        .then(data => {
            loading.style.display = 'none';
            tableWrap.style.display = 'block';
            const fixtures = data.data || [];
            totalItems = data.total || 0;
            currentLimit = data.limit || limit;
            currentOffset = data.offset || offset;

            // ★ 仅在无任何筛选时更新下拉框（保留全部联赛选项）
            if (!date && !league) {
                updateLeagueSelect(fixtures);
            }

            if (fixtures.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;">暂无赛事记录</td></tr>';
                pagination.style.display = 'none';
                return;
            }

            let html = '';
            fixtures.forEach(item => {
                const [homeScore, awayScore] = splitScore(item.score);
                const finished = isMatchFinished(item.date, item.time);
                const statusClass = finished ? 'status-finished' : 'status-pending';
                const statusText = finished ? '完赛' : '待定';
                const vsSymbol = '<span class="vs-large">VS</span>';
                const analyzed = item.analyzed || 0;

                html += `<tr>
                    <td>${item.id}</td>
                    <td>${item.date}</td>
                    <td>${item.time || ''}</td>
                    <td>${item.league}</td>
                    <td>${item.home_team} ${vsSymbol} ${item.away_team}</td>
                    <td>
                        <div class="score-group">
                            <input type="text" class="score-input home-score" value="${homeScore}" data-id="${item.id}" placeholder="0">
                            <span class="score-separator">:</span>
                            <input type="text" class="score-input away-score" value="${awayScore}" data-id="${item.id}" placeholder="0">
                        </div>
                    </td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td class="analyzed-cell">
                        <input type="checkbox" class="analyzed-checkbox" data-id="${item.id}" ${analyzed ? 'checked' : ''}>
                    </td>
                    <td>
                        <button class="action-btn save-score-btn" data-id="${item.id}">修改比分</button>
                        <button class="action-btn analysis-btn" data-id="${item.id}">基本面分析</button>
                        <button class="action-btn odds-analysis-btn" data-id="${item.id}">赔率分析</button>
                        <button class="action-btn edit-btn" data-id="${item.id}">编辑</button>
                        <button class="action-btn delete-btn" data-id="${item.id}">删除</button>
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

    // ---------- 事件绑定 ----------
    function bindEvents() {
        document.querySelectorAll('.save-score-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                saveScoreForRow(id);
            });
        });

        document.querySelectorAll('.analysis-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const tr = this.closest('tr');
                const date = tr.querySelector('td:nth-child(2)').textContent.trim();
                const time = tr.querySelector('td:nth-child(3)').textContent.trim();
                const league = tr.querySelector('td:nth-child(4)').textContent.trim();
                const homeAwayText = tr.querySelector('td:nth-child(5)').textContent.trim();
                const vsIndex = homeAwayText.indexOf('VS');
                let home = homeAwayText.substring(0, vsIndex).trim();
                let away = homeAwayText.substring(vsIndex + 2).trim();
                const params = new URLSearchParams({
                    date: date,
                    time: time,
                    league: league,
                    home: home,
                    away: away
                });
                window.location.href = '/index?' + params.toString();
            });
        });

        document.querySelectorAll('.odds-analysis-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const tr = this.closest('tr');
                const checkbox = tr.querySelector('.analyzed-checkbox');
                if (!checkbox || !checkbox.checked) {
                    alert('请先勾选“已分析”再查看赔率分析');
                    return;
                }
                const date = tr.querySelector('td:nth-child(2)').textContent.trim();
                const time = tr.querySelector('td:nth-child(3)').textContent.trim();
                const league = tr.querySelector('td:nth-child(4)').textContent.trim();
                const homeAwayText = tr.querySelector('td:nth-child(5)').textContent.trim();
                const vsIndex = homeAwayText.indexOf('VS');
                let home = homeAwayText.substring(0, vsIndex).trim();
                let away = homeAwayText.substring(vsIndex + 2).trim();
                const params = new URLSearchParams({
                    date: date,
                    time: time,
                    league: league,
                    home: home,
                    away: away
                });
                window.location.href = '/odds?' + params.toString();
            });
        });

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                openEditModal(id);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                if (confirm('确定删除该赛事吗？')) {
                    fetch('/api/fixtures/' + id, { method: 'DELETE' })
                    .then(res => res.json())
                    .then(res => {
                        if (res.success) loadFixtures(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                        else alert('删除失败: ' + (res.error || '未知错误'));
                    });
                }
            });
        });

        document.querySelectorAll('.score-input').forEach(input => {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const id = this.dataset.id;
                    if (id) {
                        saveScoreForRow(id);
                    }
                }
            });
        });

        document.querySelectorAll('.analyzed-checkbox').forEach(cb => {
            cb.addEventListener('change', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                const analyzed = this.checked ? 1 : 0;
                fetch('/api/fixtures/' + id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ analyzed: analyzed })
                })
                .then(res => res.json())
                .then(res => {
                    if (res.success) {
                        showToast('✅ 已分析状态已更新');
                    } else {
                        showToast('❌ 更新失败: ' + (res.error || '未知错误'));
                        this.checked = !this.checked;
                    }
                })
                .catch(err => {
                    showToast('❌ 请求出错: ' + err.message);
                    this.checked = !this.checked;
                });
            });
        });
    }

    function saveScoreForRow(id) {
        const homeInput = document.querySelector(`.home-score[data-id="${id}"]`);
        const awayInput = document.querySelector(`.away-score[data-id="${id}"]`);
        if (!homeInput || !awayInput) return;
        const home = homeInput.value.trim() || '0';
        const away = awayInput.value.trim() || '0';
        const newScore = home + ':' + away;
        fetch('/api/fixtures/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: newScore })
        })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                showToast('✅ 比分已更新');
                loadFixtures(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
            } else {
                showToast('❌ 更新失败: ' + (res.error || '未知错误'));
            }
        });
    }

    function openEditModal(id) {
        if (id) {
            currentEditId = id;
            editTitle.textContent = '编辑赛事';
            fetch('/api/fixtures/' + id)
            .then(res => res.json())
            .then(data => {
                if (data.error) { alert(data.error); return; }
                editDate.value = data.date;
                editTime.value = data.time || '';
                editLeague.value = data.league;
                editHome.value = data.home_team;
                editAway.value = data.away_team;
                const [h, a] = splitScore(data.score);
                editHomeScore.value = h;
                editAwayScore.value = a;
                editModal.style.display = 'flex';
            });
        } else {
            currentEditId = null;
            editTitle.textContent = '添加赛事';
            editDate.value = '';
            editTime.value = '';
            editLeague.value = '';
            editHome.value = '';
            editAway.value = '';
            editHomeScore.value = '';
            editAwayScore.value = '';
            editModal.style.display = 'flex';
        }
    }

    function saveEdit() {
        const homeScore = editHomeScore.value.trim() || '0';
        const awayScore = editAwayScore.value.trim() || '0';
        const score = homeScore + ':' + awayScore;
        const data = {
            date: editDate.value,
            time: editTime.value,
            league: editLeague.value,
            home_team: editHome.value,
            away_team: editAway.value,
            score: score
        };
        if (!data.date || !data.league || !data.home_team || !data.away_team) {
            alert('请填写日期、联赛、主队和客队');
            return;
        }
        const url = currentEditId ? '/api/fixtures/' + currentEditId : '/api/fixtures';
        const method = currentEditId ? 'PUT' : 'POST';
        fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                editModal.style.display = 'none';
                loadFixtures(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
                alert(currentEditId ? '修改成功' : '添加成功');
            } else {
                alert('操作失败: ' + (res.error || '未知错误'));
            }
        });
    }

    function closeEditModal() {
        editModal.style.display = 'none';
    }

    function updatePagination() {
        const totalPages = Math.ceil(totalItems / currentLimit) || 1;
        const currentPage = Math.floor(currentOffset / currentLimit) + 1;
        totalCountSpan.textContent = totalItems;

        let html = '';
        const maxVisible = 7;
        let startPage = 1;
        let endPage = totalPages;

        if (totalPages > maxVisible) {
            const half = Math.floor(maxVisible / 2);
            if (currentPage <= half + 1) {
                endPage = maxVisible;
            } else if (currentPage >= totalPages - half) {
                startPage = totalPages - maxVisible + 1;
            } else {
                startPage = currentPage - half;
                endPage = currentPage + half;
            }
        }

        if (startPage > 1) {
            html += `<span class="page-num" data-page="1">1</span>`;
            if (startPage > 2) html += `<span class="ellipsis">…</span>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === currentPage ? 'active' : '';
            html += `<span class="page-num ${activeClass}" data-page="${i}">${i}</span>`;
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
                    const newOffset = (page - 1) * currentLimit;
                    goToPage(newOffset);
                }
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
        loadFixtures(currentDateFilter, currentLeagueFilter, currentLimit, currentOffset);
    }

    function fetchMatches() {
        const date = fetchDate.value;
        if (!date) {
            alert('请选择日期');
            return;
        }
        const finished = includeFinished.checked;
        const btn = fetchBtn;
        btn.textContent = '⏳ 抓取中...';
        btn.disabled = true;

        fetch(`/api/fetch_matches?date=${date}&include_finished=${finished}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                alert('❌ 抓取失败: ' + data.error);
            } else {
                alert(`✅ 抓取成功，共 ${data.length} 场比赛`);
                currentOffset = 0;
                loadFixtures(currentDateFilter, currentLeagueFilter, currentLimit, 0);
            }
        })
        .catch(err => alert('❌ 请求出错: ' + err.message))
        .finally(() => {
            btn.textContent = '📡 抓取';
            btn.disabled = false;
        });
    }

    function setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        fetchDate.value = today;
    }

    // ---- 事件绑定 ----
    filterBtn.addEventListener('click', function() {
        currentDateFilter = filterDate.value;
        currentLeagueFilter = filterLeague.value;
        currentOffset = 0;
        loadFixtures(currentDateFilter, currentLeagueFilter, currentLimit, 0);
    });

    clearFilterBtn.addEventListener('click', function() {
        filterDate.value = '';
        filterLeague.value = '';
        currentDateFilter = '';
        currentLeagueFilter = '';
        currentOffset = 0;
        loadFixtures('', '', currentLimit, 0);
    });

    addBtn.addEventListener('click', function() { openEditModal(null); });
    cancelEditBtn.addEventListener('click', closeEditModal);
    window.addEventListener('click', function(e) {
        if (e.target === editModal) closeEditModal();
    });
    saveEditBtn.addEventListener('click', saveEdit);

    prevPageBtn.addEventListener('click', function() {
        goToPage(currentOffset - currentLimit);
    });
    nextPageBtn.addEventListener('click', function() {
        goToPage(currentOffset + currentLimit);
    });
    perPageSelect.addEventListener('change', function() {
        currentLimit = parseInt(this.value);
        currentOffset = 0;
        loadFixtures(currentDateFilter, currentLeagueFilter, currentLimit, 0);
    });

    fetchBtn.addEventListener('click', fetchMatches);

    setDefaultDate();
    loadFixtures('', '', 20, 0);
})();