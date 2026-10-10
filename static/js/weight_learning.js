/* ============================================================
 * 权重学习页面
 * ============================================================ */
(function () {
    "use strict";

    const FACTOR_LABELS = {
        strength: '实力',
        form: '状态',
        home_away: '主客场',
        personnel: '人员',
        motivation: '战意',
        value: '身价',
        h2h: '交战'
    };

    // 当前 index 默认权重（与 index-constants.js 保持一致）
    const CURRENT_WEIGHTS = {
        strength: 32, form: 12, home_away: 14,
        personnel: 8, motivation: 6, value: 16, h2h: 12
    };

    const $ = id => document.getElementById(id);

    function loadAnalysis() {
        $('loading').style.display = 'block';
        $('content').style.display = 'none';

        fetch('/api/weight_analysis?source=odds', { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                if (!data.success) {
                    $('loading').innerHTML = '⚠️ ' + (data.error || '分析失败') +
                        '<br><span style="font-size:13px;">当前已出结果的记录数：' + (data.total || 0) + '</span>';
                    return;
                }
                $('loading').style.display = 'none';
                $('content').style.display = 'block';
                renderStats(data);
                renderWeights(data);
            })
            .catch(err => {
                $('loading').textContent = '❌ 请求失败: ' + err.message;
            });
    }

    function renderStats(data) {
        const rc = data.result_counts || {};
        $('statsRow').innerHTML = `
            <div class="stat-card"><div class="num">${data.total}</div><div class="lbl">总样本</div></div>
            <div class="stat-card"><div class="num" style="color:#dc2626;">${rc['红'] || 0}</div><div class="lbl">红单</div></div>
            <div class="stat-card"><div class="num" style="color:#1f2937;">${rc['黑'] || 0}</div><div class="lbl">黑单</div></div>
            <div class="stat-card"><div class="num" style="color:#d97706;">${rc['走盘'] || 0}</div><div class="lbl">走盘</div></div>
        `;
    }

    function renderWeights(data) {
        const sorted = data.sorted || [];
        const weights = data.weights || {};
        const maxStrength = sorted.length > 0 ? sorted[0].strength : 1;
        const tbody = $('weightBody');
        tbody.innerHTML = '';

        sorted.forEach(item => {
            const key = item.key;
            const label = FACTOR_LABELS[key] || key;
            const strength = item.strength;
            const suggested = weights[key] || 0;
            const current = CURRENT_WEIGHTS[key] || 0;
            const delta = suggested - current;

            let deltaHtml = '';
            if (delta > 0) deltaHtml = `<span class="weight-up">+${delta}</span>`;
            else if (delta < 0) deltaHtml = `<span class="weight-down">${delta}</span>`;
            else deltaHtml = `<span style="color:#94a3b8;">0</span>`;

            const barWidth = maxStrength > 0 ? (strength / maxStrength) * 100 : 0;

            tbody.innerHTML += `
                <tr>
                    <td><strong>${label}</strong></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="bar-wrap"><div class="bar-inner" style="width:${barWidth}%;"></div></div>
                            <span style="font-size:13px; color:#4b657a;">${strength.toFixed(3)}</span>
                        </div>
                    </td>
                    <td class="weight-strong">${suggested}</td>
                    <td>${current}</td>
                    <td>${deltaHtml}</td>
                </tr>
            `;
        });

        // 保存建议权重供"应用"按钮使用
        $('applyBtn').dataset.weights = JSON.stringify(weights);
    }

    // 应用建议权重：写入 localStorage，index 页面加载时读取
    function applyWeights() {
        const raw = $('applyBtn').dataset.weights;
        if (!raw) return;
        try {
            const weights = JSON.parse(raw);
            localStorage.setItem('index_custom_weights', JSON.stringify(weights));
            alert('✅ 已保存为自定义权重！\n\n返回 index 页面刷新即可生效。\n（如需恢复默认，可在 index 页面手动调回或清除浏览器缓存）');
        } catch (e) {
            alert('❌ 应用失败: ' + e.message);
        }
    }

    // 导出 CSV
    function exportCsv() {
        window.location.href = '/api/export_matches_csv?source=odds';
    }

    $('applyBtn').addEventListener('click', applyWeights);
    $('reloadBtn').addEventListener('click', loadAnalysis);
    $('exportBtn').addEventListener('click', exportCsv);

    window.addEventListener('load', loadAnalysis);
})();