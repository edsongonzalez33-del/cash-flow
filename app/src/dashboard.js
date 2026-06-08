// ============================================================
// Dashboard Module - KPIs and Charts
// ============================================================
import {
  Chart,
  BarController, BarElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale,
  Tooltip, Legend
} from 'chart.js';
import {
  getMonthTotals, getExpensesByConceptForMonth, getIncomesByCompanyForMonth,
  getRecentTransactions, getExpenses, getPendingCommissions, payCommission, getPaidCommissions
} from './store.js';
import {
  formatCurrency, formatDate, formatMonthLabel, getMonthNameShort,
  navigateMonth, getLastNMonthKeys, parseMonthKey, percentChange, $,
  CHART_COLORS, showToast
} from './utils.js';

// Register Chart.js components
Chart.register(
  BarController, BarElement,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale,
  Tooltip, Legend
);

// Chart instances
let chartIncomeVsExpense = null;
let chartExpensesBreakdown = null;
let chartTopCompanies = null;
let chartCommissionsDestinatario = null;
let chartPerformanceCompare = null;

let currentYear, currentMonth;
let onMonthChange = null;
let currentCommissionTab = 'pending';

function getChartColors() {
  const isLight = document.body.classList.contains('light-mode');
  return {
    textColor: isLight ? '#475569' : '#94A3B8',
    gridColor: isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.04)',
    tooltipBg: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(15, 23, 42, 0.95)',
    tooltipTitle: isLight ? '#0F172A' : '#F1F5F9',
    tooltipBody: isLight ? '#475569' : '#94A3B8',
    tooltipBorder: isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255,255,255,0.1)',
    doughnutBorder: isLight ? '#FFFFFF' : '#111827'
  };
}

// Common Chart.js options
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#94A3B8',
        font: { family: 'Inter', size: 11 },
        padding: 16
      }
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      titleColor: '#F1F5F9',
      bodyColor: '#94A3B8',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      cornerRadius: 8,
      padding: 12,
      titleFont: { family: 'Inter', weight: '600' },
      bodyFont: { family: 'Inter' },
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label || ''}: ${formatCurrency(ctx.raw)}`
      }
    }
  }
};

/**
 * Initialize the dashboard module
 */
export function initDashboard(year, month, onMonthChangeCb) {
  currentYear = year;
  currentMonth = month;
  onMonthChange = onMonthChangeCb;

  // Month navigation
  $('#dash-prev-month').addEventListener('click', () => {
    const nav = navigateMonth(currentYear, currentMonth, -1);
    currentYear = nav.year;
    currentMonth = nav.month;
    renderDashboard();
    if (onMonthChange) onMonthChange(currentYear, currentMonth);
  });

  $('#dash-next-month').addEventListener('click', () => {
    const nav = navigateMonth(currentYear, currentMonth, 1);
    currentYear = nav.year;
    currentMonth = nav.month;
    renderDashboard();
    if (onMonthChange) onMonthChange(currentYear, currentMonth);
  });

  // Commission tab navigation
  $('#btn-tab-pending').addEventListener('click', () => {
    currentCommissionTab = 'pending';
    $('#btn-tab-pending').classList.add('active');
    $('#btn-tab-paid').classList.remove('active');
    renderPendingCommissions();
  });

  $('#btn-tab-paid').addEventListener('click', () => {
    currentCommissionTab = 'paid';
    $('#btn-tab-paid').classList.add('active');
    $('#btn-tab-pending').classList.remove('active');
    renderPendingCommissions();
  });
}

/**
 * Set the current month externally
 */
export function setDashboardMonth(year, month) {
  currentYear = year;
  currentMonth = month;
  renderDashboard();
}

/**
 * Render the full dashboard
 */
export function renderDashboard() {
  const label = formatMonthLabel(currentYear, currentMonth);
  $('#dash-month-label').textContent = label;
  $('#chart-expense-period').textContent = label;
  $('#chart-company-period').textContent = label;
  $('#performance-compare-period').textContent = label;

  renderKPIs();
  renderIncomeVsExpenseChart();
  renderExpensesBreakdownChart();
  renderTopCompaniesChart();
  renderRecentTransactions();
  renderPendingCommissions();
  renderCommissionsDestinatarioChart();
  renderPerformanceCompareChart();
}

function renderKPIs() {
  const current = getMonthTotals(currentYear, currentMonth);
  const prev = navigateMonth(currentYear, currentMonth, -1);
  const previous = getMonthTotals(prev.year, prev.month);

  // Balance
  $('#kpi-balance').textContent = formatCurrency(current.balance);
  setTrend('#kpi-balance-trend', current.balance, previous.balance);

  // Income
  $('#kpi-income').textContent = formatCurrency(current.totalIncomes);
  setTrend('#kpi-income-trend', current.totalIncomes, previous.totalIncomes);

  // Expense
  $('#kpi-expense').textContent = formatCurrency(current.totalExpenses);
  // For expenses, LESS is better - so invert the trend
  setTrend('#kpi-expense-trend', current.totalExpenses, previous.totalExpenses, true);

  // Savings rate
  const savingsRate = current.totalIncomes > 0
    ? ((current.balance / current.totalIncomes) * 100)
    : 0;
  $('#kpi-savings').textContent = `${savingsRate.toFixed(1)}%`;

  const prevRate = previous.totalIncomes > 0
    ? ((previous.balance / previous.totalIncomes) * 100)
    : 0;
  setTrend('#kpi-savings-trend', savingsRate, prevRate);

  // Pending commissions
  const pendingData = getPendingCommissions();
  $('#kpi-commissions').textContent = formatCurrency(pendingData.total);
}

function renderPendingCommissions() {
  const isPendingTab = currentCommissionTab === 'pending';
  const data = isPendingTab ? getPendingCommissions() : getPaidCommissions();
  
  // 1. Update the table headers dynamically
  const headerTr = $('#commissions-table-header');
  headerTr.innerHTML = `
    <th>Fecha Ingreso</th>
    <th>Compañía</th>
    <th>Beneficiario</th>
    <th class="text-right">Monto Comisión</th>
    <th class="text-center">${isPendingTab ? 'Acción' : 'Estado'}</th>
  `;

  // 2. Update status label
  $('#commissions-status-label').textContent = isPendingTab ? 'Control de Pagos' : 'Historial de Pagados';

  const tbody = $('#commissions-tbody');

  if (data.list.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5"><p class="empty-state">${isPendingTab ? 'No hay comisiones pendientes de pago' : 'No hay comisiones pagadas registradas'}</p></td></tr>`;
    return;
  }

  tbody.innerHTML = data.list.map(c => `
    <tr data-id="${c.id}">
      <td>${formatDate(c.date)}</td>
      <td style="color: var(--text-primary); font-weight: 500;">${escapeHtml(c.company || '')}</td>
      <td>
        <span class="type-badge variable" style="background: rgba(139, 92, 246, 0.12); color: #A855F7; text-transform: none; display: inline-block;">
          ${escapeHtml(c.recipient)}
        </span>
      </td>
      <td class="text-right amount-cell text-danger">${formatCurrency(c.amount)}</td>
      <td class="text-center">
        ${isPendingTab ? `
          <button class="btn-primary btn-pay-commission" data-id="${c.id}" style="padding: 6px 12px; font-size: 0.8rem; border-radius: var(--radius-sm);">
            Pagar
          </button>
        ` : `
          <span class="type-badge fijo" style="background: rgba(16, 185, 129, 0.12); color: var(--success-light); text-transform: none; font-weight: 600; display: inline-block;">
            Pagado
          </span>
        `}
      </td>
    </tr>
  `).join('');

  if (!isPendingTab) return; // Paid tab doesn't have click actions

  // Attach event listeners to Pay buttons (Pending tab only)
  tbody.querySelectorAll('.btn-pay-commission').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      const commissionItem = data.list.find(c => c.id === id);
      if (!commissionItem) return;

      const overlay = $('#pay-commission-overlay');
      const rateInput = $('#field-pay-exchange-rate');
      const bsLabel = $('#label-pay-amount-bs');
      const confirmBtn = $('#btn-pay-confirm');
      const cancelBtn = $('#btn-pay-cancel');
      const detailsP = $('#pay-commission-details');

      // Populate details
      detailsP.innerHTML = `Comisión de <strong>${formatCurrency(commissionItem.amount)}</strong> para <strong>${escapeHtml(commissionItem.recipient)}</strong> por ingreso de <strong>${escapeHtml(commissionItem.company)}</strong>.`;
      rateInput.value = '';
      bsLabel.textContent = 'Bs. 0,00';

      const updateBsPayLabel = () => {
        const rate = parseFloat(rateInput.value) || 0;
        const totalBs = commissionItem.amount * rate;
        bsLabel.textContent = totalBs > 0 ? 'Bs. ' + totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Bs. 0,00';
      };

      rateInput.addEventListener('input', updateBsPayLabel);

      const closePayModal = () => {
        overlay.classList.remove('active');
        rateInput.removeEventListener('input', updateBsPayLabel);
        // Reset listeners on confirm/cancel buttons by cloning them
        const newConfirm = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
        const newCancel = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
      };

      $('#btn-pay-cancel').addEventListener('click', closePayModal);
      $('#btn-pay-confirm').addEventListener('click', () => {
        const rate = parseFloat(rateInput.value) || 0;
        if (!rate) {
          showToast('Por favor introduce la tasa BCV del día', 'error');
          return;
        }

        try {
          const income = payCommission(id, rate);
          const formattedBs = (parseFloat(income.commissionAmount) * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          showToast(`Comisión de ${formatCurrency(income.commissionAmount)} (Bs. ${formattedBs}) pagada a ${income.commissionRecipient} con éxito`, 'success');
          
          closePayModal();
          
          // Refresh dashboard
          renderDashboard();
          
          // Trigger event so that other modules reload data
          window.dispatchEvent(new CustomEvent('data-changed'));
        } catch (err) {
          showToast(`Error al pagar comisión: ${err.message}`, 'error');
        }
      });

      overlay.classList.add('active');
      setTimeout(() => rateInput.focus(), 100);
    });
  });
}

function setTrend(selector, current, previous, invertColors = false) {
  const el = $(selector);
  const change = percentChange(current, previous);

  if (change === null) {
    el.className = 'kpi-trend neutral';
    el.textContent = '— sin datos previos';
    return;
  }

  const isPositive = change >= 0;
  const arrow = isPositive ? '↑' : '↓';
  const cls = invertColors
    ? (isPositive ? 'down' : 'up')  // For expenses: going up is bad
    : (isPositive ? 'up' : 'down');

  el.className = `kpi-trend ${cls}`;
  el.textContent = `${arrow} ${Math.abs(change).toFixed(1)}% vs mes anterior`;
}

function renderIncomeVsExpenseChart() {
  const monthKeys = getLastNMonthKeys(currentYear, currentMonth, 12);
  const labels = [];
  const incomeData = [];
  const expenseData = [];

  for (const key of monthKeys) {
    const { year, month } = parseMonthKey(key);
    const totals = getMonthTotals(year, month);
    labels.push(`${getMonthNameShort(month)} ${String(year).slice(-2)}`);
    incomeData.push(totals.totalIncomes);
    expenseData.push(totals.totalExpenses);
  }

  const ctx = document.getElementById('chart-income-vs-expense');
  const colors = getChartColors();

  if (chartIncomeVsExpense) {
    chartIncomeVsExpense.data.labels = labels;
    chartIncomeVsExpense.data.datasets[0].data = incomeData;
    chartIncomeVsExpense.data.datasets[1].data = expenseData;
    
    chartIncomeVsExpense.options.plugins.legend.labels.color = colors.textColor;
    chartIncomeVsExpense.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
    chartIncomeVsExpense.options.plugins.tooltip.titleColor = colors.tooltipTitle;
    chartIncomeVsExpense.options.plugins.tooltip.bodyColor = colors.tooltipBody;
    chartIncomeVsExpense.options.plugins.tooltip.borderColor = colors.tooltipBorder;
    chartIncomeVsExpense.options.scales.x.grid.color = colors.gridColor;
    chartIncomeVsExpense.options.scales.x.ticks.color = colors.textColor;
    chartIncomeVsExpense.options.scales.y.grid.color = colors.gridColor;
    chartIncomeVsExpense.options.scales.y.ticks.color = colors.textColor;
    
    chartIncomeVsExpense.update();
    return;
  }

  chartIncomeVsExpense = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Ingresos',
          data: incomeData,
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderColor: '#10B981',
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false
        },
        {
          label: 'Gastos',
          data: expenseData,
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderColor: '#EF4444',
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false
        }
      ]
    },
    options: {
      ...chartDefaults,
      scales: {
        x: {
          grid: { color: colors.gridColor },
          ticks: { color: colors.textColor, font: { family: 'Inter', size: 11 } }
        },
        y: {
          grid: { color: colors.gridColor },
          ticks: {
            color: colors.textColor,
            font: { family: 'Inter', size: 11 },
            callback: (v) => `$${v}`
          }
        }
      },
      plugins: {
        ...chartDefaults.plugins,
        legend: {
          ...chartDefaults.plugins.legend,
          position: 'top',
          labels: {
            ...chartDefaults.plugins.legend.labels,
            color: colors.textColor
          }
        },
        tooltip: {
          ...chartDefaults.plugins.tooltip,
          backgroundColor: colors.tooltipBg,
          titleColor: colors.tooltipTitle,
          bodyColor: colors.tooltipBody,
          borderColor: colors.tooltipBorder
        }
      }
    }
  });
}

function renderExpensesBreakdownChart() {
  const breakdown = getExpensesByConceptForMonth(currentYear, currentMonth);
  const top = breakdown.slice(0, 8);

  // Group remaining into "Otros"
  const remaining = breakdown.slice(8);
  if (remaining.length > 0) {
    const otherTotal = remaining.reduce((s, [, v]) => s + v, 0);
    top.push(['Otros', otherTotal]);
  }

  const labels = top.map(([name]) => name);
  const data = top.map(([, value]) => value);
  const colors = top.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  // Fetch all expenses of the current month to construct interactive tooltips
  const expenses = getExpenses(currentYear, currentMonth);
  
  // Calculate subdivisions
  const nominaBreakdown = {};
  const polizaBreakdown = {};
  const comisionesBreakdown = {};
  
  for (const e of expenses) {
    const concept = e.concept || '';
    if (concept.startsWith('Nómina')) {
      const subName = concept.startsWith('Nómina: ') ? concept.slice(8) : concept;
      nominaBreakdown[subName] = (nominaBreakdown[subName] || 0) + (e.amount || 0);
    } else if (concept.startsWith('Póliza')) {
      const subName = concept.startsWith('Póliza: ') ? concept.slice(8) : concept;
      polizaBreakdown[subName] = (polizaBreakdown[subName] || 0) + (e.amount || 0);
    } else if (concept.startsWith('Comisiones 3ros')) {
      const match = concept.match(/\(([^)]+)\)/);
      const subName = match ? match[1] : 'Terceros';
      comisionesBreakdown[subName] = (comisionesBreakdown[subName] || 0) + (e.amount || 0);
    }
  }

  const sortedNomina = Object.entries(nominaBreakdown).sort((a, b) => b[1] - a[1]);
  const sortedPoliza = Object.entries(polizaBreakdown).sort((a, b) => b[1] - a[1]);
  const sortedComisiones = Object.entries(comisionesBreakdown).sort((a, b) => b[1] - a[1]);

  const ctx = document.getElementById('chart-expenses-breakdown');
  const themeColors = getChartColors();

  // Helper function to build custom tooltip content with sub-items
  const getTooltipLabel = (ctx) => {
    const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
    const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
    const titleLine = ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`;

    if (ctx.label === 'Nómina' && sortedNomina.length > 0) {
      const lines = [titleLine];
      for (const [name, amount] of sortedNomina) {
        lines.push(`  • ${name}: ${formatCurrency(amount)}`);
      }
      return lines;
    }

    if (ctx.label === 'Póliza' && sortedPoliza.length > 0) {
      const lines = [titleLine];
      for (const [name, amount] of sortedPoliza) {
        lines.push(`  • ${name}: ${formatCurrency(amount)}`);
      }
      return lines;
    }

    if (ctx.label === 'Comisiones 3ros' && sortedComisiones.length > 0) {
      const lines = [titleLine];
      for (const [name, amount] of sortedComisiones) {
        lines.push(`  • ${name}: ${formatCurrency(amount)}`);
      }
      return lines;
    }

    return titleLine;
  };

  if (chartExpensesBreakdown) {
    chartExpensesBreakdown.data.labels = labels;
    chartExpensesBreakdown.data.datasets[0].data = data;
    chartExpensesBreakdown.data.datasets[0].backgroundColor = colors;
    chartExpensesBreakdown.data.datasets[0].borderColor = themeColors.doughnutBorder;
    
    chartExpensesBreakdown.options.plugins.legend.labels.color = themeColors.textColor;
    chartExpensesBreakdown.options.plugins.tooltip.backgroundColor = themeColors.tooltipBg;
    chartExpensesBreakdown.options.plugins.tooltip.titleColor = themeColors.tooltipTitle;
    chartExpensesBreakdown.options.plugins.tooltip.bodyColor = themeColors.tooltipBody;
    chartExpensesBreakdown.options.plugins.tooltip.borderColor = themeColors.tooltipBorder;
    chartExpensesBreakdown.options.plugins.tooltip.callbacks.label = getTooltipLabel;
    
    chartExpensesBreakdown.update();
    return;
  }

  chartExpensesBreakdown = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: themeColors.doughnutBorder,
        borderWidth: 2,
        hoverOffset: 8
      }]
    },
    options: {
      ...chartDefaults,
      cutout: '65%',
      plugins: {
        ...chartDefaults.plugins,
        legend: {
          ...chartDefaults.plugins.legend,
          position: 'right',
          labels: {
            ...chartDefaults.plugins.legend.labels,
            color: themeColors.textColor,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          ...chartDefaults.plugins.tooltip,
          backgroundColor: themeColors.tooltipBg,
          titleColor: themeColors.tooltipTitle,
          bodyColor: themeColors.tooltipBody,
          borderColor: themeColors.tooltipBorder,
          callbacks: {
            label: getTooltipLabel
          }
        }
      }
    }
  });
}

function renderTopCompaniesChart() {
  const breakdown = getIncomesByCompanyForMonth(currentYear, currentMonth);
  const top = breakdown.slice(0, 10);

  const labels = top.map(([name]) => name);
  const data = top.map(([, value]) => value);
  const colors = top.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  const ctx = document.getElementById('chart-top-companies');
  const themeColors = getChartColors();

  if (chartTopCompanies) {
    chartTopCompanies.data.labels = labels;
    chartTopCompanies.data.datasets[0].data = data;
    chartTopCompanies.data.datasets[0].backgroundColor = colors;
    
    chartTopCompanies.options.plugins.legend.labels.color = themeColors.textColor;
    chartTopCompanies.options.plugins.tooltip.backgroundColor = themeColors.tooltipBg;
    chartTopCompanies.options.plugins.tooltip.titleColor = themeColors.tooltipTitle;
    chartTopCompanies.options.plugins.tooltip.bodyColor = themeColors.tooltipBody;
    chartTopCompanies.options.plugins.tooltip.borderColor = themeColors.tooltipBorder;
    chartTopCompanies.options.scales.x.grid.color = themeColors.gridColor;
    chartTopCompanies.options.scales.x.ticks.color = themeColors.textColor;
    chartTopCompanies.options.scales.y.ticks.color = themeColors.textColor;
    
    chartTopCompanies.update();
    return;
  }

  chartTopCompanies = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Ingresos',
        data,
        backgroundColor: colors.map(c => c + 'CC'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      ...chartDefaults,
      indexAxis: 'y',
      scales: {
        x: {
          grid: { color: themeColors.gridColor },
          ticks: {
            color: themeColors.textColor,
            font: { family: 'Inter', size: 11 },
            callback: (v) => `$${v}`
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: themeColors.textColor,
            font: { family: 'Inter', size: 11 }
          }
        }
      },
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false },
        tooltip: {
          ...chartDefaults.plugins.tooltip,
          backgroundColor: themeColors.tooltipBg,
          titleColor: themeColors.tooltipTitle,
          bodyColor: themeColors.tooltipBody,
          borderColor: themeColors.tooltipBorder
        }
      }
    }
  });
}

function renderRecentTransactions() {
  const transactions = getRecentTransactions(currentYear, currentMonth, 8);
  const container = $('#recent-transactions');

  if (transactions.length === 0) {
    container.innerHTML = '<p class="empty-state">No hay transacciones este mes</p>';
    return;
  }

  container.innerHTML = transactions.map(t => {
    const isIncome = t._type === 'income';
    const icon = isIncome ? '↑' : '↓';
    const iconClass = isIncome ? 'income' : 'expense';
    const amountClass = isIncome ? 'income' : 'expense';
    const sign = isIncome ? '+' : '-';

    return `
      <div class="recent-item">
        <div class="recent-item-icon ${iconClass}">${icon}</div>
        <div class="recent-item-info">
          <div class="recent-item-name">${escapeHtml(t._label || '')}</div>
          <div class="recent-item-date">${formatDate(t.date)}</div>
        </div>
        <div class="recent-item-amount ${amountClass}">${sign}${formatCurrency(t.amount)}</div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderCommissionsDestinatarioChart() {
  const paidData = getPaidCommissions();
  
  const sums = {
    'María Hortencia': 0,
    'Luisa Velásquez': 0,
    'Freddy': 0,
    'Zitiu': 0,
    'Esmyll León': 0
  };
  
  for (const item of paidData.list) {
    const rec = item.recipient;
    if (sums[rec] !== undefined) {
      sums[rec] += item.amount;
    } else if (rec) {
      sums[rec] = item.amount;
    }
  }
  
  const labels = Object.keys(sums);
  const data = Object.values(sums);
  const colors = ['#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B']; // Violet, Pink, Blue, Green, Orange
  
  const ctx = document.getElementById('chart-commissions-destinatario');
  const themeColors = getChartColors();
  
  const getTooltipLabel = (ctx) => {
    const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
    const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
    return ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`;
  };
  
  if (chartCommissionsDestinatario) {
    chartCommissionsDestinatario.data.labels = labels;
    chartCommissionsDestinatario.data.datasets[0].data = data;
    chartCommissionsDestinatario.data.datasets[0].backgroundColor = colors;
    chartCommissionsDestinatario.data.datasets[0].borderColor = themeColors.doughnutBorder;
    
    chartCommissionsDestinatario.options.plugins.legend.labels.color = themeColors.textColor;
    chartCommissionsDestinatario.options.plugins.tooltip.backgroundColor = themeColors.tooltipBg;
    chartCommissionsDestinatario.options.plugins.tooltip.titleColor = themeColors.tooltipTitle;
    chartCommissionsDestinatario.options.plugins.tooltip.bodyColor = themeColors.tooltipBody;
    chartCommissionsDestinatario.options.plugins.tooltip.borderColor = themeColors.tooltipBorder;
    
    chartCommissionsDestinatario.update();
    return;
  }
  
  chartCommissionsDestinatario = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: themeColors.doughnutBorder,
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      ...chartDefaults,
      cutout: '60%',
      plugins: {
        ...chartDefaults.plugins,
        legend: {
          ...chartDefaults.plugins.legend,
          position: 'right',
          labels: {
            ...chartDefaults.plugins.legend.labels,
            color: themeColors.textColor,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          ...chartDefaults.plugins.tooltip,
          backgroundColor: themeColors.tooltipBg,
          titleColor: themeColors.tooltipTitle,
          bodyColor: themeColors.tooltipBody,
          borderColor: themeColors.tooltipBorder,
          callbacks: {
            label: getTooltipLabel
          }
        }
      }
    }
  });
}

function renderPerformanceCompareChart() {
  const current = getMonthTotals(currentYear, currentMonth);
  const prev = navigateMonth(currentYear, currentMonth, -1);
  const previous = getMonthTotals(prev.year, prev.month);
  const lastYear = getMonthTotals(currentYear - 1, currentMonth);
  
  const incMoM = percentChange(current.totalIncomes, previous.totalIncomes);
  const incYoY = percentChange(current.totalIncomes, lastYear.totalIncomes);
  const expMoM = percentChange(current.totalExpenses, previous.totalExpenses);
  const expYoY = percentChange(current.totalExpenses, lastYear.totalExpenses);
  
  const formatChange = (val) => {
    if (val === null) return '—';
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val.toFixed(1)}%`;
  };
  
  const subEl = $('#performance-compare-sub');
  subEl.innerHTML = `
    Ingresos: <strong style="color: ${current.totalIncomes >= previous.totalIncomes ? 'var(--success)' : 'var(--danger)'};">${formatChange(incMoM)} MoM</strong> / <strong style="color: ${current.totalIncomes >= lastYear.totalIncomes ? 'var(--success)' : 'var(--danger)'};">${formatChange(incYoY)} YoY</strong>
    &nbsp;&nbsp;•&nbsp;&nbsp;
    Gastos: <strong style="color: ${current.totalExpenses <= previous.totalExpenses ? 'var(--success)' : 'var(--danger)'};">${formatChange(expMoM)} MoM</strong> / <strong style="color: ${current.totalExpenses <= lastYear.totalExpenses ? 'var(--success)' : 'var(--danger)'};">${formatChange(expYoY)} YoY</strong>
  `;

  const labels = ['Ingresos', 'Gastos'];
  
  const prevMonthName = getMonthNameShort(prev.month) + ' ' + String(prev.year).slice(-2);
  const lastYearMonthName = getMonthNameShort(currentMonth) + ' ' + String(currentYear - 1).slice(-2);
  const currentMonthName = getMonthNameShort(currentMonth) + ' ' + String(currentYear).slice(-2);

  const datasetPrev = [previous.totalIncomes, previous.totalExpenses];
  const datasetLastYear = [lastYear.totalIncomes, lastYear.totalExpenses];
  const datasetCurrent = [current.totalIncomes, current.totalExpenses];

  const ctx = document.getElementById('chart-performance-compare');
  const themeColors = getChartColors();

  if (chartPerformanceCompare) {
    chartPerformanceCompare.data.datasets[0].label = `Mes Anterior (${prevMonthName})`;
    chartPerformanceCompare.data.datasets[0].data = datasetPrev;
    
    chartPerformanceCompare.data.datasets[1].label = `Año Anterior (${lastYearMonthName})`;
    chartPerformanceCompare.data.datasets[1].data = datasetLastYear;
    
    chartPerformanceCompare.data.datasets[2].label = `Mes Actual (${currentMonthName})`;
    chartPerformanceCompare.data.datasets[2].data = datasetCurrent;
    
    chartPerformanceCompare.options.plugins.legend.labels.color = themeColors.textColor;
    chartPerformanceCompare.options.plugins.tooltip.backgroundColor = themeColors.tooltipBg;
    chartPerformanceCompare.options.plugins.tooltip.titleColor = themeColors.tooltipTitle;
    chartPerformanceCompare.options.plugins.tooltip.bodyColor = themeColors.tooltipBody;
    chartPerformanceCompare.options.plugins.tooltip.borderColor = themeColors.tooltipBorder;
    chartPerformanceCompare.options.scales.x.ticks.color = themeColors.textColor;
    chartPerformanceCompare.options.scales.y.grid.color = themeColors.gridColor;
    chartPerformanceCompare.options.scales.y.ticks.color = themeColors.textColor;
    
    chartPerformanceCompare.update();
    return;
  }

  chartPerformanceCompare = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: `Mes Anterior (${prevMonthName})`,
          data: datasetPrev,
          backgroundColor: 'rgba(148, 163, 184, 0.4)', // Slate gray
          borderColor: '#94A3B8',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: `Año Anterior (${lastYearMonthName})`,
          data: datasetLastYear,
          backgroundColor: 'rgba(99, 102, 241, 0.4)', // Indigo accent
          borderColor: '#6366F1',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: `Mes Actual (${currentMonthName})`,
          data: datasetCurrent,
          backgroundColor: 'rgba(16, 185, 129, 0.7)', // Green highlight
          borderColor: '#10B981',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      ...chartDefaults,
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: themeColors.textColor, font: { family: 'Inter', size: 12, weight: '500' } }
        },
        y: {
          grid: { color: themeColors.gridColor },
          ticks: {
            color: themeColors.textColor,
            font: { family: 'Inter', size: 11 },
            callback: (v) => `$${v}`
          }
        }
      },
      plugins: {
        ...chartDefaults.plugins,
        legend: {
          ...chartDefaults.plugins.legend,
          position: 'top',
          labels: {
            ...chartDefaults.plugins.legend.labels,
            color: themeColors.textColor
          }
        },
        tooltip: {
          ...chartDefaults.plugins.tooltip,
          backgroundColor: themeColors.tooltipBg,
          titleColor: themeColors.tooltipTitle,
          bodyColor: themeColors.tooltipBody,
          borderColor: themeColors.tooltipBorder
        }
      }
    }
  });
}
