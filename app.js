// データを保存・取得するための関数
let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
let chart = null;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    // 今日の日付を設定
    const today = new Date();
    document.getElementById('date').valueAsDate = today;

    // 現在の月を設定
    const currentMonth = today.toISOString().slice(0, 7);
    document.getElementById('monthSelect').value = currentMonth;

    // イベントリスナーを設定
    document.getElementById('transactionForm').addEventListener('submit', addTransaction);
    document.getElementById('monthSelect').addEventListener('change', updateDisplay);

    // 初期表示を更新
    updateDisplay();
});

// 取引を追加
function addTransaction(e) {
    e.preventDefault();

    const transaction = {
        id: Date.now(),
        date: document.getElementById('date').value,
        type: document.getElementById('type').value,
        category: document.getElementById('category').value,
        amount: parseInt(document.getElementById('amount').value),
        memo: document.getElementById('memo').value
    };

    transactions.push(transaction);
    saveTransactions();

    // フォームをリセット
    document.getElementById('transactionForm').reset();
    document.getElementById('date').valueAsDate = new Date();

    updateDisplay();
}

// localStorageに保存
function saveTransactions() {
    localStorage.setItem('transactions', JSON.stringify(transactions));
}

// 選択された月の取引を取得
function getMonthTransactions() {
    const selectedMonth = document.getElementById('monthSelect').value;
    return transactions.filter(t => t.date.startsWith(selectedMonth));
}

// 表示を更新
function updateDisplay() {
    updateSummary();
    updateHistory();
    updateChart();
}

// 月次集計を更新
function updateSummary() {
    const monthTransactions = getMonthTransactions();

    const totalIncome = monthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

    const totalExpense = monthTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

    const balance = totalIncome - totalExpense;

    document.getElementById('totalIncome').textContent = formatCurrency(totalIncome);
    document.getElementById('totalExpense').textContent = formatCurrency(totalExpense);
    document.getElementById('balance').textContent = formatCurrency(balance);
}

// 履歴一覧を更新
function updateHistory() {
    const monthTransactions = getMonthTransactions();
    const historyList = document.getElementById('historyList');

    if (monthTransactions.length === 0) {
        historyList.innerHTML = '<div class="no-data">データがありません</div>';
        return;
    }

    // 日付の新しい順にソート
    monthTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    historyList.innerHTML = monthTransactions.map(t => `
        <div class="history-item ${t.type}">
            <div class="history-info">
                <div class="history-date">${formatDate(t.date)}</div>
                <div class="history-category">${t.category}</div>
                ${t.memo ? `<div class="history-memo">${t.memo}</div>` : ''}
            </div>
            <div style="display: flex; align-items: center;">
                <div class="history-amount ${t.type}">
                    ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}
                </div>
                <button class="history-delete" onclick="deleteTransaction(${t.id})">削除</button>
            </div>
        </div>
    `).join('');
}

// 円グラフを更新
function updateChart() {
    const monthTransactions = getMonthTransactions();
    const expenses = monthTransactions.filter(t => t.type === 'expense');

    // カテゴリごとに集計
    const categoryData = {};
    expenses.forEach(t => {
        categoryData[t.category] = (categoryData[t.category] || 0) + t.amount;
    });

    const labels = Object.keys(categoryData);
    const data = Object.values(categoryData);

    // グラフの色
    const colors = [
        '#FF6384',
        '#36A2EB',
        '#FFCE56',
        '#4BC0C0',
        '#9966FF',
        '#FF9F40'
    ];

    const ctx = document.getElementById('expenseChart').getContext('2d');

    // 既存のグラフを破棄
    if (chart) {
        chart.destroy();
    }

    // データがない場合
    if (labels.length === 0) {
        chart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['データなし'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#ddd']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
        return;
    }

    // グラフを作成
    chart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = formatCurrency(context.parsed);
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// 取引を削除
function deleteTransaction(id) {
    if (confirm('この取引を削除しますか？')) {
        transactions = transactions.filter(t => t.id !== id);
        saveTransactions();
        updateDisplay();
    }
}

// 日付をフォーマット
function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    return `${year}/${month}/${day} (${weekday})`;
}

// 金額をフォーマット
function formatCurrency(amount) {
    return '¥' + amount.toLocaleString();
}
