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
  getRecentTransactions, getExpenses, getPendingCommissions, payCommission, getPaidCommissions,
  getQuarterlySales, getSalesProjection
} from './store.js';
import {
  formatCurrency, formatBs, formatDate, formatMonthLabel, getMonthNameShort,
  navigateMonth, getLastNMonthKeys, parseMonthKey, percentChange, $,
  CHART_COLORS, showToast, animateCount
} from './utils.js';
import { fetchBcvRate } from './bcvService.js';

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
let chartQuarterlySales = null;

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
  const commsPeriodEl = $('#chart-commissions-period');
  if (commsPeriodEl) commsPeriodEl.textContent = label;
  $('#performance-compare-period').textContent = label;

  renderKPIs();
  renderIncomeVsExpenseChart();
  renderExpensesBreakdownChart();
  renderTopCompaniesChart();
  renderRecentTransactions();
  renderPendingCommissions();
  renderCommissionsDestinatarioChart();
  renderPerformanceCompareChart();
  renderSalesProjectionCard();
  renderQuarterlySalesChart();
}

function renderKPIs() {
  const current = getMonthTotals(currentYear, currentMonth);
  const prev = navigateMonth(currentYear, currentMonth, -1);
  const previous = getMonthTotals(prev.year, prev.month);

  // 1. Balance: Total Consolidado + Desglose ($ / Bs) con animación
  animateCount($('#kpi-balance'), current.balance, formatCurrency);
  const balUsdEl = $('#kpi-balance-usd');
  if (balUsdEl) animateCount(balUsdEl, current.directBalanceUsd, formatCurrency);
  const balBsEl = $('#kpi-balance-bs');
  if (balBsEl) animateCount(balBsEl, current.directBalanceBs, formatBs);
  setTrend('#kpi-balance-trend', current.balance, previous.balance);

  // 2. Income: Total Consolidado + Desglose ($ / Bs) con animación
  animateCount($('#kpi-income'), current.totalIncomes, formatCurrency);
  const incUsdEl = $('#kpi-income-usd');
  if (incUsdEl) animateCount(incUsdEl, current.directIncomesUsd, formatCurrency);
  const incBsEl = $('#kpi-income-bs');
  if (incBsEl) animateCount(incBsEl, current.directIncomesBs, formatBs);
  setTrend('#kpi-income-trend', current.totalIncomes, previous.totalIncomes);

  // 3. Expense: Total Consolidado + Desglose ($ / Bs) con animación
  animateCount($('#kpi-expense'), current.totalExpenses, formatCurrency);
  const expUsdEl = $('#kpi-expense-usd');
  if (expUsdEl) animateCount(expUsdEl, current.directExpensesUsd, formatCurrency);
  const expBsEl = $('#kpi-expense-bs');
  if (expBsEl) animateCount(expBsEl, current.directExpensesBs, formatBs);
  // For expenses, LESS is better - so invert the trend
  setTrend('#kpi-expense-trend', current.totalExpenses, previous.totalExpenses, true);

  // 4. Savings rate con animación
  const savingsRate = current.totalIncomes > 0
    ? ((current.balance / current.totalIncomes) * 100)
    : 0;
  animateCount($('#kpi-savings'), savingsRate, (v) => `${(v || 0).toFixed(1)}%`);
  const savingsNetEl = $('#kpi-savings-net');
  if (savingsNetEl) animateCount(savingsNetEl, current.balance, formatCurrency);

  const prevRate = previous.totalIncomes > 0
    ? ((previous.balance / previous.totalIncomes) * 100)
    : 0;
  setTrend('#kpi-savings-trend', savingsRate, prevRate);

  // 5. Pending commissions con animación
  const pendingData = getPendingCommissions();
  animateCount($('#kpi-commissions'), pendingData.total, formatCurrency);
  const commsBsEl = $('#kpi-commissions-bs');
  if (commsBsEl) animateCount(commsBsEl, pendingData.totalBs, formatBs);
  const commsCountEl = $('#kpi-commissions-count');
  if (commsCountEl) commsCountEl.textContent = `${pendingData.list.length} ${pendingData.list.length === 1 ? 'ítem' : 'ítems'}`;
}

function renderPendingCommissions() {
  const isPendingTab = currentCommissionTab === 'pending';
  const data = isPendingTab ? getPendingCommissions() : getPaidCommissions(currentYear, currentMonth);
  
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
      rateInput.placeholder = 'Cargando tasa...';
      bsLabel.textContent = 'Bs. 0,00';

      const updateBsPayLabel = () => {
        const rate = parseFloat(rateInput.value) || 0;
        const totalBs = commissionItem.amount * rate;
        bsLabel.textContent = totalBs > 0 ? 'Bs. ' + totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Bs. 0,00';
      };

      rateInput.addEventListener('input', updateBsPayLabel);

      fetchBcvRate().then(bcv => {
        if (bcv && bcv.tasa) {
          rateInput.value = bcv.tasa;
          updateBsPayLabel();
        }
        rateInput.placeholder = 'Ej: 45.50';
      });

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

  const getExpensesLegendLabels = (chart) => {
    const chartData = chart.data;
    if (chartData.labels.length && chartData.datasets.length) {
      const dataset = chartData.datasets[0];
      const total = dataset.data.reduce((acc, val) => acc + (Number(val) || 0), 0);
      return chartData.labels.map((label, i) => {
        const val = Number(dataset.data[i]) || 0;
        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
        return {
          text: `${label} (${pct}%)`,
          fillStyle: dataset.backgroundColor[i] || '#ccc',
          strokeStyle: themeColors.doughnutBorder,
          lineWidth: 1,
          pointStyle: 'circle',
          hidden: isNaN(dataset.data[i]) || chart.getDatasetMeta(0).data[i]?.hidden,
          index: i
        };
      });
    }
    return [];
  };

  if (chartExpensesBreakdown) {
    chartExpensesBreakdown.data.labels = labels;
    chartExpensesBreakdown.data.datasets[0].data = data;
    chartExpensesBreakdown.data.datasets[0].backgroundColor = colors;
    chartExpensesBreakdown.data.datasets[0].borderColor = themeColors.doughnutBorder;
    
    chartExpensesBreakdown.options.plugins.legend.labels.color = themeColors.textColor;
    chartExpensesBreakdown.options.plugins.legend.labels.generateLabels = getExpensesLegendLabels;
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
            pointStyle: 'circle',
            font: { family: 'Inter', size: 11 },
            padding: 12,
            generateLabels: getExpensesLegendLabels
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
  const top = breakdown.slice(0, 8);

  // Group remaining into "Otras" if more than 8
  const remaining = breakdown.slice(8);
  if (remaining.length > 0) {
    const otherTotal = remaining.reduce((s, [, v]) => s + v, 0);
    top.push(['Otras', otherTotal]);
  }

  const labels = top.map(([name]) => name);
  const data = top.map(([, value]) => value);
  const colors = top.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  const ctx = document.getElementById('chart-top-companies');
  const themeColors = getChartColors();

  const getTooltipLabel = (ctx) => {
    const total = ctx.dataset.data.reduce((s, v) => s + (Number(v) || 0), 0);
    const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0.0';
    return ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`;
  };

  const getCompanyLegendLabels = (chart) => {
    const chartData = chart.data;
    if (chartData.labels.length && chartData.datasets.length) {
      const dataset = chartData.datasets[0];
      const total = dataset.data.reduce((acc, val) => acc + (Number(val) || 0), 0);
      return chartData.labels.map((label, i) => {
        const val = Number(dataset.data[i]) || 0;
        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
        return {
          text: `${label} (${pct}%)`,
          fillStyle: dataset.backgroundColor[i] || '#ccc',
          strokeStyle: themeColors.doughnutBorder,
          lineWidth: 1,
          pointStyle: 'circle',
          hidden: isNaN(dataset.data[i]) || chart.getDatasetMeta(0).data[i]?.hidden,
          index: i
        };
      });
    }
    return [];
  };

  if (chartTopCompanies && chartTopCompanies.config.type === 'doughnut') {
    chartTopCompanies.data.labels = labels;
    chartTopCompanies.data.datasets[0].data = data;
    chartTopCompanies.data.datasets[0].backgroundColor = colors;
    chartTopCompanies.data.datasets[0].borderColor = themeColors.doughnutBorder;
    
    chartTopCompanies.options.plugins.legend.labels.color = themeColors.textColor;
    chartTopCompanies.options.plugins.legend.labels.generateLabels = getCompanyLegendLabels;
    chartTopCompanies.options.plugins.tooltip.backgroundColor = themeColors.tooltipBg;
    chartTopCompanies.options.plugins.tooltip.titleColor = themeColors.tooltipTitle;
    chartTopCompanies.options.plugins.tooltip.bodyColor = themeColors.tooltipBody;
    chartTopCompanies.options.plugins.tooltip.borderColor = themeColors.tooltipBorder;
    chartTopCompanies.options.plugins.tooltip.callbacks.label = getTooltipLabel;
    
    chartTopCompanies.update();
    return;
  }

  if (chartTopCompanies) {
    chartTopCompanies.destroy();
    chartTopCompanies = null;
  }

  chartTopCompanies = new Chart(ctx, {
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
            pointStyle: 'circle',
            font: { family: 'Inter', size: 11 },
            padding: 12,
            generateLabels: getCompanyLegendLabels
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
  const paidData = getPaidCommissions(currentYear, currentMonth);
  const canvas = document.getElementById('chart-commissions-destinatario');
  const emptyEl = document.getElementById('chart-commissions-empty');
  
  const sums = {};
  for (const item of paidData.list) {
    const rec = item.recipient ? item.recipient.trim() : 'Otros';
    sums[rec] = (sums[rec] || 0) + (item.amount || 0);
  }
  
  // Filter only beneficiaries who actually received commissions > 0 in this month
  const activeEntries = Object.entries(sums)
    .filter(([, val]) => val > 0)
    .sort((a, b) => b[1] - a[1]);

  const total = activeEntries.reduce((s, [, v]) => s + v, 0);

  if (activeEntries.length === 0 || total === 0) {
    if (chartCommissionsDestinatario) {
      chartCommissionsDestinatario.destroy();
      chartCommissionsDestinatario = null;
    }
    if (canvas) canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (canvas) canvas.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  const labels = activeEntries.map(([name]) => name);
  const data = activeEntries.map(([, val]) => val);
  const palette = ['#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#14B8A6', '#F43F5E'];
  const colors = labels.map((_, i) => palette[i % palette.length]);
  
  const ctx = canvas;
  const themeColors = getChartColors();
  
  const getTooltipLabel = (ctx) => {
    const sumTotal = ctx.dataset.data.reduce((s, v) => s + v, 0);
    const pct = sumTotal > 0 ? ((ctx.raw / sumTotal) * 100).toFixed(1) : 0;
    return ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`;
  };
  
  const getCommissionsLegendLabels = (chart) => {
    const chartData = chart.data;
    if (chartData.labels.length && chartData.datasets.length) {
      const dataset = chartData.datasets[0];
      const sumTotal = dataset.data.reduce((acc, val) => acc + (Number(val) || 0), 0);
      return chartData.labels.map((label, i) => {
        const val = Number(dataset.data[i]) || 0;
        const pct = sumTotal > 0 ? ((val / sumTotal) * 100).toFixed(1) : '0.0';
        return {
          text: `${label} (${pct}%)`,
          fillStyle: dataset.backgroundColor[i] || '#ccc',
          strokeStyle: themeColors.doughnutBorder,
          lineWidth: 1,
          pointStyle: 'circle',
          hidden: isNaN(dataset.data[i]) || chart.getDatasetMeta(0).data[i]?.hidden,
          index: i
        };
      });
    }
    return [];
  };

  if (chartCommissionsDestinatario) {
    chartCommissionsDestinatario.data.labels = labels;
    chartCommissionsDestinatario.data.datasets[0].data = data;
    chartCommissionsDestinatario.data.datasets[0].backgroundColor = colors;
    chartCommissionsDestinatario.data.datasets[0].borderColor = themeColors.doughnutBorder;
    
    chartCommissionsDestinatario.options.plugins.legend.labels.color = themeColors.textColor;
    chartCommissionsDestinatario.options.plugins.legend.labels.generateLabels = getCommissionsLegendLabels;
    chartCommissionsDestinatario.options.plugins.tooltip.backgroundColor = themeColors.tooltipBg;
    chartCommissionsDestinatario.options.plugins.tooltip.titleColor = themeColors.tooltipTitle;
    chartCommissionsDestinatario.options.plugins.tooltip.bodyColor = themeColors.tooltipBody;
    chartCommissionsDestinatario.options.plugins.tooltip.borderColor = themeColors.tooltipBorder;
    chartCommissionsDestinatario.options.plugins.tooltip.callbacks.label = getTooltipLabel;
    
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
            pointStyle: 'circle',
            font: { family: 'Inter', size: 11 },
            padding: 12,
            generateLabels: getCommissionsLegendLabels
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
    chartPerformanceCompare.data.datasets[0].backgroundColor = 'rgba(6, 182, 212, 0.75)'; // Cyan
    chartPerformanceCompare.data.datasets[0].borderColor = '#06B6D4';
    
    chartPerformanceCompare.data.datasets[1].label = `Año Anterior (${lastYearMonthName})`;
    chartPerformanceCompare.data.datasets[1].data = datasetLastYear;
    chartPerformanceCompare.data.datasets[1].backgroundColor = 'rgba(139, 92, 246, 0.75)'; // Purple/Violet
    chartPerformanceCompare.data.datasets[1].borderColor = '#8B5CF6';
    
    chartPerformanceCompare.data.datasets[2].label = `Mes Actual (${currentMonthName})`;
    chartPerformanceCompare.data.datasets[2].data = datasetCurrent;
    chartPerformanceCompare.data.datasets[2].backgroundColor = 'rgba(16, 185, 129, 0.85)'; // Emerald Green
    chartPerformanceCompare.data.datasets[2].borderColor = '#10B981';
    
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
          backgroundColor: 'rgba(6, 182, 212, 0.75)', // Vibrant Cyan
          borderColor: '#06B6D4',
          borderWidth: 1.5,
          borderRadius: 6
        },
        {
          label: `Año Anterior (${lastYearMonthName})`,
          data: datasetLastYear,
          backgroundColor: 'rgba(139, 92, 246, 0.75)', // Vibrant Purple/Violet
          borderColor: '#8B5CF6',
          borderWidth: 1.5,
          borderRadius: 6
        },
        {
          label: `Mes Actual (${currentMonthName})`,
          data: datasetCurrent,
          backgroundColor: 'rgba(16, 185, 129, 0.85)', // Emerald Green
          borderColor: '#10B981',
          borderWidth: 1.5,
          borderRadius: 6
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
            callback: (v) => `$${v.toLocaleString('en-US')}`
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

function renderQuarterlySalesChart() {
  const qData = getQuarterlySales([2024, 2025, 2026]);

  const total2024 = qData[2024]?.total || 0;
  const total2025 = qData[2025]?.total || 0;
  const total2026 = qData[2026]?.total || 0;

  const totalsContainer = $('#quarterly-sales-totals');
  if (totalsContainer) {
    totalsContainer.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 5px;">
        <span style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #F59E0B; box-shadow: 0 0 6px rgba(245,158,11,0.5);"></span>
        Total 2024: <strong style="color: #F59E0B; font-weight: 700;">${formatCurrency(total2024)}</strong>
      </span>
      <span style="color: var(--border-default);">|</span>
      <span style="display: inline-flex; align-items: center; gap: 5px;">
        <span style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #3B82F6; box-shadow: 0 0 6px rgba(59,130,246,0.5);"></span>
        Total 2025: <strong style="color: #3B82F6; font-weight: 700;">${formatCurrency(total2025)}</strong>
      </span>
      <span style="color: var(--border-default);">|</span>
      <span style="display: inline-flex; align-items: center; gap: 5px;">
        <span style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #10B981; box-shadow: 0 0 6px rgba(16,185,129,0.5);"></span>
        Total 2026: <strong style="color: #10B981; font-weight: 700;">${formatCurrency(total2026)}</strong>
        <small style="color: var(--text-muted); font-size: 0.72rem; margin-left: 2px;">(en curso)</small>
      </span>
    `;
  }

  const labels = ['T1 (Ene - Mar)', 'T2 (Abr - Jun)', 'T3 (Jul - Sep)', 'T4 (Oct - Dic)'];
  
  const dataset2024 = [qData[2024].q1, qData[2024].q2, qData[2024].q3, qData[2024].q4];
  const dataset2025 = [qData[2025].q1, qData[2025].q2, qData[2025].q3, qData[2025].q4];
  const dataset2026 = [qData[2026].q1, qData[2026].q2, qData[2026].q3, qData[2026].q4];

  const ctx = document.getElementById('chart-quarterly-sales');
  if (!ctx) return;
  const themeColors = getChartColors();

  const getQuarterlyTooltipLabel = (ctx) => {
    const val = ctx.raw || 0;
    const year = ctx.dataset.label;
    const qIndex = ctx.dataIndex; // 0 for T1, 1 for T2, etc.
    let extra = '';

    if (year === 'Año 2025') {
      const prevVal = dataset2024[qIndex];
      const change = percentChange(val, prevVal);
      if (change !== null) {
        const sign = change >= 0 ? '+' : '';
        extra = ` (${sign}${change.toFixed(1)}% vs 2024)`;
      }
    } else if (year === 'Año 2026') {
      const prevVal = dataset2025[qIndex];
      const change = percentChange(val, prevVal);
      if (change !== null) {
        const sign = change >= 0 ? '+' : '';
        extra = ` (${sign}${change.toFixed(1)}% vs 2025)`;
      }
    }

    return ` ${year}: ${formatCurrency(val)}${extra}`;
  };

  if (chartQuarterlySales) {
    chartQuarterlySales.data.datasets[0].data = dataset2024;
    chartQuarterlySales.data.datasets[0].backgroundColor = 'rgba(245, 158, 11, 0.8)'; // Warm Amber
    chartQuarterlySales.data.datasets[0].borderColor = '#F59E0B';
    
    chartQuarterlySales.data.datasets[1].data = dataset2025;
    chartQuarterlySales.data.datasets[1].backgroundColor = 'rgba(59, 130, 246, 0.8)'; // Royal Blue
    chartQuarterlySales.data.datasets[1].borderColor = '#3B82F6';
    
    chartQuarterlySales.data.datasets[2].data = dataset2026;
    chartQuarterlySales.data.datasets[2].backgroundColor = 'rgba(16, 185, 129, 0.85)'; // Emerald Green
    chartQuarterlySales.data.datasets[2].borderColor = '#10B981';

    chartQuarterlySales.options.plugins.legend.labels.color = themeColors.textColor;
    chartQuarterlySales.options.plugins.tooltip.backgroundColor = themeColors.tooltipBg;
    chartQuarterlySales.options.plugins.tooltip.titleColor = themeColors.tooltipTitle;
    chartQuarterlySales.options.plugins.tooltip.bodyColor = themeColors.tooltipBody;
    chartQuarterlySales.options.plugins.tooltip.borderColor = themeColors.tooltipBorder;
    chartQuarterlySales.options.plugins.tooltip.callbacks.label = getQuarterlyTooltipLabel;
    chartQuarterlySales.options.scales.x.ticks.color = themeColors.textColor;
    chartQuarterlySales.options.scales.y.grid.color = themeColors.gridColor;
    chartQuarterlySales.options.scales.y.ticks.color = themeColors.textColor;

    chartQuarterlySales.update();
    return;
  }

  chartQuarterlySales = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Año 2024',
          data: dataset2024,
          backgroundColor: 'rgba(245, 158, 11, 0.8)', // Warm Amber Orange
          borderColor: '#F59E0B',
          borderWidth: 1.5,
          borderRadius: 6
        },
        {
          label: 'Año 2025',
          data: dataset2025,
          backgroundColor: 'rgba(59, 130, 246, 0.8)', // Royal Electric Blue
          borderColor: '#3B82F6',
          borderWidth: 1.5,
          borderRadius: 6
        },
        {
          label: 'Año 2026',
          data: dataset2026,
          backgroundColor: 'rgba(16, 185, 129, 0.85)', // Vivid Emerald Green
          borderColor: '#10B981',
          borderWidth: 1.5,
          borderRadius: 6
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
            callback: (v) => `$${v.toLocaleString('en-US')}`
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
          borderColor: themeColors.tooltipBorder,
          callbacks: {
            label: getQuarterlyTooltipLabel
          }
        }
      }
    }
  });
}

function renderSalesProjectionCard() {
  const proj = getSalesProjection(currentYear, currentMonth);

  // Subtitle
  const subEl = $('#projection-subtitle');
  if (subEl) {
    subEl.textContent = `Objetivo base: Superar récord de 2025 (${formatCurrency(proj.targetBase)}) con meta extendida (+10%)`;
  }

  // 1. Metric: Ventas Acumuladas YTD
  animateCount($('#proj-current-sales'), proj.total2026YTD, formatCurrency);
  const currentSub = $('#proj-current-sub');
  if (currentSub) {
    currentSub.textContent = `Ene - ${getMonthNameShort(proj.elapsedMonths)} ${currentYear} (${proj.elapsedMonths} meses)`;
  }

  // 2. Metric: Meta Objetivo 2026
  animateCount($('#proj-target-goal'), proj.targetStretch, formatCurrency);
  const targetSub = $('#proj-target-sub');
  if (targetSub) {
    targetSub.textContent = `Récord 2025 + 10% de crecimiento`;
  }

  // 3. Metric: Proyección a Diciembre
  animateCount($('#proj-forecast-val'), proj.projectedTotal, formatCurrency);
  const forecastSub = $('#proj-forecast-sub');
  if (forecastSub) {
    const sign = proj.projectedVs2025Pct >= 0 ? '+' : '';
    forecastSub.textContent = `${sign}${proj.projectedVs2025Pct.toFixed(1)}% vs cierre 2025`;
    forecastSub.style.color = proj.projectedVs2025Pct >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  // 4. Metric: Faltante para la Meta
  const isGoalReached = proj.total2026YTD >= proj.targetStretch;
  const isRecordReached = proj.total2026YTD >= proj.targetBase;
  
  animateCount($('#proj-gap-val'), isGoalReached ? 0 : proj.gapToStretch, formatCurrency);
  const gapSub = $('#proj-gap-sub');
  if (gapSub) {
    if (isGoalReached) {
      gapSub.textContent = '¡Meta del año 100% superada!';
      gapSub.style.color = 'var(--success)';
    } else if (isRecordReached) {
      gapSub.textContent = '¡Récord 2025 superado! Faltante para meta +10%';
      gapSub.style.color = '#3B82F6';
    } else {
      gapSub.textContent = `Faltan ${formatCurrency(proj.gapToBase)} para récord 2025`;
    }
  }

  // Progress Bar & Percentage
  const progressPctEl = $('#proj-progress-pct');
  if (progressPctEl) {
    animateCount(progressPctEl, proj.progressBasePct, (v) => `${(v || 0).toFixed(1)}%`);
  }

  const barFill = $('#proj-progress-bar-fill');
  if (barFill) {
    const visualWidth = Math.min(100, Math.max(0, proj.progressBasePct));
    barFill.style.width = `${visualWidth}%`;
  }

  // Scale labels below bar
  const scale2024 = $('#proj-scale-2024');
  if (scale2024) scale2024.textContent = `2024: ${formatCurrency(proj.total2024)}`;
  const scale2025 = $('#proj-scale-2025');
  if (scale2025) scale2025.textContent = `Récord 2025: ${formatCurrency(proj.targetBase)} (100%)`;
  const scaleGoal = $('#proj-scale-goal');
  if (scaleGoal) scaleGoal.textContent = `Meta +10%: ${formatCurrency(proj.targetStretch)}`;

  // Status Badge in Header
  const statusBadge = $('#projection-status-badge');
  if (statusBadge) {
    if (proj.progressBasePct >= 100) {
      statusBadge.innerHTML = `<span class="type-badge" style="background: rgba(16, 185, 129, 0.18); color: #10B981; font-weight: 700; padding: 5px 12px; font-size: 0.8rem; border: 1px solid rgba(16, 185, 129, 0.3);">🏆 ¡Récord 2025 Superado!</span>`;
    } else if (proj.progressBasePct >= 80) {
      statusBadge.innerHTML = `<span class="type-badge" style="background: rgba(59, 130, 246, 0.18); color: #3B82F6; font-weight: 700; padding: 5px 12px; font-size: 0.8rem; border: 1px solid rgba(59, 130, 246, 0.3);">🔥 Ritmo Excelente (${proj.progressBasePct.toFixed(1)}%)</span>`;
    } else {
      statusBadge.innerHTML = `<span class="type-badge" style="background: rgba(245, 158, 11, 0.18); color: #F59E0B; font-weight: 700; padding: 5px 12px; font-size: 0.8rem; border: 1px solid rgba(245, 158, 11, 0.3);">⚡ En Progreso (${proj.progressBasePct.toFixed(1)}%)</span>`;
    }
  }

  // Motivational Diagnosis Banner
  const diagBanner = $('#proj-diagnosis-banner');
  if (diagBanner) {
    if (proj.progressBasePct >= 100) {
      diagBanner.style.background = 'rgba(16, 185, 129, 0.12)';
      diagBanner.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      diagBanner.innerHTML = `
        <span style="font-size: 1.1rem;">🎉</span>
        <div>
          <strong>¡Año extraordinario!</strong> Ya superaste las ventas totales de todo el 2025. Al ritmo actual, se proyecta un cierre de <strong>${formatCurrency(proj.projectedTotal)}</strong> (+${proj.projectedVs2025Pct.toFixed(1)}% de crecimiento anual).
        </div>
      `;
    } else {
      diagBanner.style.background = 'rgba(59, 130, 246, 0.08)';
      diagBanner.style.borderColor = 'rgba(59, 130, 246, 0.25)';
      diagBanner.innerHTML = `
        <span style="font-size: 1.1rem;">📊</span>
        <div>
          <strong>Diagnóstico comercial:</strong> Con un promedio mensual de <strong>${formatCurrency(proj.avgMonthlyYTD)}</strong>, estás a solo <strong>${formatCurrency(proj.gapToBase)}</strong> de superar el récord total de 2025. Se proyecta un cierre a Diciembre de <strong>${formatCurrency(proj.projectedTotal)}</strong> (<span style="color: var(--success); font-weight: 700;">+${proj.projectedVs2025Pct.toFixed(1)}%</span> vs 2025).
        </div>
      `;
    }
  }
}


