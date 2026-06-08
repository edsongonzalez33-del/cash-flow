// ============================================================
// Mobile Module - UI Orchestrator for Mobile App
// ============================================================
import { initAuth, logout } from './auth.js';
import {
  getIncomes, addIncome, updateIncome, deleteIncome,
  getExpenses, addExpense, updateExpense, deleteExpense,
  getMonthTotals, syncWithSupabase, getPendingCommissions
} from './store.js';
import {
  formatCurrency, formatDate, formatMonthLabel, navigateMonth,
  todayISO, monthKey, $, $$, showToast
} from './utils.js';

// ── Reminders & Fix Expenses Store Helper ──
const REMINDERS_KEY = 'flujoDeCaja_reminders';

function getReminders() {
  const data = localStorage.getItem(REMINDERS_KEY);
  return data ? JSON.parse(data) : [];
}

function saveReminders(reminders) {
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
}

function normalizeStr(str) {
  return str ? str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
}

// ── App State ──
const now = new Date();
let currentYear = now.getFullYear();
let currentMonth = now.getMonth() + 1;
let pendingDelete = null; // Store item data to confirm deletion
let currentEditId = null;  // Store ID of item currently editing

// ── Boot ──
async function bootMobile() {
  // Bind Header actions
  const logoutBtn = $('#btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  // Config button (Gear icon)
  const configBtn = $('#btn-config');
  if (configBtn) {
    configBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openConfigModal();
    });
  }

  // Close Config modal
  $('#config-close').addEventListener('click', closeConfigModal);

  // Submit Reminder Form
  $('#reminder-form').addEventListener('submit', handleReminderSubmit);

  // Bind Month navigation
  $('#mobile-prev-month').addEventListener('click', () => {
    const nav = navigateMonth(currentYear, currentMonth, -1);
    currentYear = nav.year;
    currentMonth = nav.month;
    renderMobileApp();
  });

  // Month navigation next
  $('#mobile-next-month').addEventListener('click', () => {
    const nav = navigateMonth(currentYear, currentMonth, 1);
    currentYear = nav.year;
    currentMonth = nav.month;
    renderMobileApp();
  });

  // Bind Giant actions
  $('#btn-add-income').addEventListener('click', () => {
    openFormModal('income');
  });

  $('#btn-add-expense').addEventListener('click', () => {
    openFormModal('expense');
  });

  // Bind Modal close handlers
  $('#modal-close').addEventListener('click', closeFormModal);
  $('#modal-cancel').addEventListener('click', closeFormModal);
  
  // Bind Escape key to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeFormModal();
      closeConfigModal();
      $('#confirm-overlay').classList.remove('active');
    }
  });

  // Bind Delete confirmation modal
  $('#confirm-cancel').addEventListener('click', () => {
    $('#confirm-overlay').classList.remove('active');
    pendingDelete = null;
  });

  $('#confirm-delete').addEventListener('click', () => {
    if (pendingDelete) {
      const { type, id, year, month } = pendingDelete;
      if (type === 'income') {
        deleteIncome(year, month, id);
        showToast('Ingreso eliminado', 'info');
      } else {
        deleteExpense(year, month, id);
        showToast('Gasto eliminado', 'info');
      }
      pendingDelete = null;
      $('#confirm-overlay').classList.remove('active');
      window.dispatchEvent(new CustomEvent('data-changed'));
    }
  });

  // Listen to data change events
  window.addEventListener('data-changed', () => {
    renderMobileApp();
  });

  // Initialize Supabase Authentication
  initAuth(async (user) => {
    const userDisplay = $('#user-display');
    if (userDisplay) {
      const displayEmail = user.email.split('@')[0];
      userDisplay.textContent = displayEmail;
    }
    showToast('Bienvenido al sistema', 'success');

    // Rebuild local cache with Cloud DB data as source of truth
    const synced = await syncWithSupabase();
    if (synced) {
      showToast('Datos actualizados de la nube', 'success');
    }
    renderMobileApp();
  });
}

// ── Reminders Operations ──
function openConfigModal() {
  $('#config-overlay').classList.add('active');
  
  // Set default values for switch
  const activeCheckbox = $('#field-reminder-active');
  if (activeCheckbox) {
    activeCheckbox.checked = true;
    const labelToggle = $('#label-toggle-recordar');
    if (labelToggle) labelToggle.textContent = 'Sí';
  }

  // Bind active switch label change if not already done
  const activeCheckboxEl = $('#field-reminder-active');
  const labelToggleEl = $('#label-toggle-recordar');
  if (activeCheckboxEl && labelToggleEl && !activeCheckboxEl._hasListener) {
    activeCheckboxEl.addEventListener('change', () => {
      labelToggleEl.textContent = activeCheckboxEl.checked ? 'Sí' : 'No';
    });
    activeCheckboxEl._hasListener = true;
  }

  renderRemindersList();
}

function closeConfigModal() {
  $('#config-overlay').classList.remove('active');
  $('#reminder-form').reset();
}

function handleReminderSubmit(e) {
  e.preventDefault();
  const concept = $('#field-reminder-concept').value.trim();
  const day = parseInt($('#field-reminder-day').value) || 1;
  const amount = parseFloat($('#field-reminder-amount').value) || 0;
  const category = $('#field-reminder-category').value;
  const active = $('#field-reminder-active').checked;

  if (!concept) {
    showToast('El concepto es requerido', 'error');
    return;
  }

  const reminders = getReminders();
  
  // Prevents duplicates for same concept on the same day
  const exists = reminders.some(r => normalizeStr(r.concept) === normalizeStr(concept) && r.day === day);
  if (exists) {
    showToast('Ya existe este recordatorio para este día', 'error');
    return;
  }

  reminders.push({
    id: Date.now().toString(),
    concept,
    day,
    amount,
    category,
    active
  });

  saveReminders(reminders);
  showToast('Recordatorio agregado', 'success');
  $('#reminder-form').reset();
  
  // Reset active label representation
  const labelToggle = $('#label-toggle-recordar');
  if (labelToggle) labelToggle.textContent = 'Sí';
  const activeCheckbox = $('#field-reminder-active');
  if (activeCheckbox) activeCheckbox.checked = true;

  renderRemindersList();
  renderTicker();
}

function deleteReminder(id) {
  const reminders = getReminders();
  const filtered = reminders.filter(r => r.id !== id);
  saveReminders(filtered);
  showToast('Recordatorio eliminado', 'info');
  
  renderRemindersList();
  renderTicker();
}

function renderRemindersList() {
  const reminders = getReminders();
  const container = $('#reminders-list');

  if (reminders.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 20px; font-size: 0.8rem;">No tienes recordatorios fijos registrados.</div>`;
    return;
  }

  reminders.sort((a, b) => a.day - b.day);

  container.innerHTML = reminders.map(r => `
    <div class="reminder-item" data-id="${r.id}">
      <div class="reminder-info">
        <span class="reminder-concept">${escapeHtml(r.concept)}</span>
        <span class="reminder-meta">Día ${r.day} • ${escapeHtml(r.category || 'Vivienda')} ${r.amount > 0 ? `• Est: $${r.amount.toFixed(2)}` : ''} • Recordar: ${r.active ? 'Sí' : 'No'}</span>
      </div>
      <button class="btn-delete-reminder" title="Eliminar" data-action="delete-reminder">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  `).join('');

  container.querySelectorAll('[data-action="delete-reminder"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.reminder-item');
      const id = item.dataset.id;
      deleteReminder(id);
    });
  });
}

function renderTicker() {
  const reminders = getReminders();
  const expenses = getExpenses(currentYear, currentMonth);
  const tickerScroll = $('#ticker-scroll');

  if (reminders.length === 0) {
    tickerScroll.innerHTML = `💡 Configura tus gastos fijos mensuales en el botón ⚙️ de arriba para recibir alertas automáticas.`;
    tickerScroll.style.animationDuration = '18s';
    return;
  }

  const systemYear = now.getFullYear();
  const systemMonth = now.getMonth() + 1;
  const systemDay = now.getDate();

  const alerts = reminders.map(r => {
    // Check if there is an expense recorded in the selected month that matches this concept
    const isPaid = expenses.some(exp => normalizeStr(exp.concept).includes(normalizeStr(r.concept)));

    if (isPaid) {
      return `<div class="ticker-item"><span class="ticker-badge-done">✅ AL DÍA:</span> <span>${escapeHtml(r.concept)} registrado</span></div>`;
    }

    // Determine status (Pending vs Overdue) based on selected month compared to actual system date
    let isOverdue = false;
    if (currentYear < systemYear || (currentYear === systemYear && currentMonth < systemMonth)) {
      isOverdue = true; // Selected month is in the past, and it was never paid
    } else if (currentYear === systemYear && currentMonth === systemMonth) {
      isOverdue = systemDay > r.day; // Current month, but day has already passed
    }

    if (isOverdue) {
      return `<div class="ticker-item"><span class="ticker-badge-overdue">🚨 VENCIDO:</span> <span>${escapeHtml(r.concept)} (Día ${r.day}) - ¡Registra el gasto!</span></div>`;
    } else {
      return `<div class="ticker-item"><span class="ticker-badge-pending">⚠️ PENDIENTE:</span> <span>${escapeHtml(r.concept)} (Día ${r.day})${r.amount > 0 ? ` - Est: $${r.amount.toFixed(2)}` : ''}</span></div>`;
    }
  });

  // Join items with horizontal bars
  const tickerHtml = alerts.join(' <span class="ticker-item-separator">|</span> ');
  tickerScroll.innerHTML = tickerHtml;

  // Dynamically scale animation speed based on text length for readable flow
  const textLength = tickerScroll.innerText.length;
  const duration = Math.max(12, Math.round(textLength / 8));
  tickerScroll.style.animationDuration = `${duration}s`;
}

// ── Render ──
function renderMobileApp() {
  // Render alerts ticker
  renderTicker();

  // Update Month Label
  $('#mobile-month-label').textContent = formatMonthLabel(currentYear, currentMonth);

  // Get current state totals
  const totals = getMonthTotals(currentYear, currentMonth);
  const incomes = getIncomes(currentYear, currentMonth);
  const expenses = getExpenses(currentYear, currentMonth);

  // Render KPIs
  $('#kpi-balance').textContent = formatCurrency(totals.balance);
  $('#kpi-income').textContent = formatCurrency(totals.totalIncomes);
  $('#kpi-expense').textContent = formatCurrency(totals.totalExpenses);

  // Render Balance Colors dynamically
  const balanceVal = $('#kpi-balance');
  if (totals.balance > 0) {
    balanceVal.style.color = '#34d399'; // green
  } else if (totals.balance < 0) {
    balanceVal.style.color = '#fb7185'; // red
  } else {
    balanceVal.style.color = 'var(--text-primary)';
  }

  // Render Commissions KPI if active
  const pendingComms = getPendingCommissions();
  const commsCard = $('#kpi-commissions-card');
  if (pendingComms.total > 0) {
    $('#kpi-commissions').textContent = formatCurrency(pendingComms.total);
    commsCard.style.display = 'flex';
  } else {
    commsCard.style.display = 'none';
  }

  // Combine and sort transactions for chronological list view
  const combinedTransactions = [
    ...incomes.map(item => ({ ...item, recordType: 'income' })),
    ...expenses.map(item => ({ ...item, recordType: 'expense' }))
  ];

  // Sort descending by date (recent first), then ID
  combinedTransactions.sort((a, b) => {
    const diff = new Date(b.date) - new Date(a.date);
    if (diff !== 0) return diff;
    return b.id.localeCompare(a.id);
  });

  $('#trans-count').textContent = `${combinedTransactions.length} registros`;

  const container = $('#transactions-list');
  if (combinedTransactions.length === 0) {
    container.innerHTML = `<div class="empty-state">No hay transacciones este mes. Pulsa un botón de arriba para registrar.</div>`;
    return;
  }

  container.innerHTML = combinedTransactions.map(item => {
    const isInc = item.recordType === 'income';
    const tagHtml = !isInc && item.type 
      ? `<span class="badge-tag badge-tag-${item.type}">${item.type}</span>` 
      : (isInc && item.commissionActive ? `<span class="badge-tag badge-tag-commission">comisión</span>` : '');

    return `
      <div class="trans-card" data-id="${item.id}" data-type="${item.recordType}">
        <div class="trans-card-top">
          <div class="trans-concept-col">
            <span class="trans-concept">${escapeHtml(isInc ? item.company : item.concept)}</span>
            <div class="trans-details">
              <span>${formatDate(item.date)}</span>
              ${tagHtml}
            </div>
          </div>
          <div class="trans-amount-col">
            <span class="trans-amount-usd ${isInc ? 'income-text' : 'expense-text'}">
              ${isInc ? '+' : '-'}${formatCurrency(item.amount)}
            </span>
            <span class="trans-amount-bs">
              ${item.amountBs ? 'Bs. ' + parseFloat(item.amountBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </span>
          </div>
        </div>
        <div class="trans-card-bottom">
          <span class="trans-notes" title="${escapeHtml(item.notes || '')}">
            ${escapeHtml(item.notes || 'Sin observaciones')}
          </span>
          <div class="trans-actions">
            <button class="btn-card-action edit" title="Editar" data-action="edit">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-card-action delete" title="Eliminar" data-action="delete">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Bind edit & delete buttons
  container.querySelectorAll('.btn-card-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.trans-card');
      const id = card.dataset.id;
      const type = card.dataset.type;
      const action = e.target.closest('[data-action]').dataset.action;

      if (action === 'edit') {
        const item = type === 'income' 
          ? incomes.find(i => i.id === id) 
          : expenses.find(i => i.id === id);
        if (item) openFormModal(type, item);
      } else if (action === 'delete') {
        pendingDelete = { type, id, year: currentYear, month: currentMonth };
        $('#confirm-overlay').classList.add('active');
      }
    });
  });
}

// ── Form Modal Setup ──
function openFormModal(type, record = null) {
  const isEdit = !!record;
  currentEditId = isEdit ? record.id : null;

  // Set Modal title
  $('#modal-title').textContent = isEdit 
    ? `Editar ${type === 'income' ? 'Ingreso' : 'Gasto'}`
    : `Nuevo ${type === 'income' ? 'Ingreso' : 'Gasto'}`;

  // Configure Form Input
  $('#field-type').value = type;

  // Set standard values
  $('#field-date').value = isEdit ? record.date : todayISO();
  $('#field-amount').value = isEdit ? record.amount : '';
  $('#field-exchange-rate').value = isEdit ? record.exchangeRate || '' : '';
  $('#field-amount-bs').value = isEdit ? record.amountBs || '' : '';
  $('#field-notes').value = isEdit ? record.notes || '' : '';

  // Configure custom text label and input fields based on type
  if (type === 'income') {
    $('#label-concept').textContent = 'Compañía / Origen';
    $('#field-concept').placeholder = 'Ej: Oceánica, Mercantil, Particular...';
    $('#field-concept').value = isEdit ? record.company || '' : '';
    
    // Show/Hide Panels
    $('#group-expense-type').style.display = 'none';
    $('#group-commission-toggle').style.display = 'block';

    const activeCheckbox = $('#field-commission-active');
    activeCheckbox.checked = isEdit ? !!record.commissionActive : false;
    
    // Set Commission values if edit mode
    $('#field-commission-recipient').value = isEdit ? record.commissionRecipient || '' : '';
    $('#field-commission-status').value = isEdit ? record.commissionStatus || 'pendiente' : 'pendiente';
    $('#field-commission-pct').value = isEdit ? record.commissionPct || '' : '';
    $('#field-commission-amount').value = isEdit ? record.commissionAmount || '' : '';

    $('#commission-panel').style.display = activeCheckbox.checked ? 'flex' : 'none';
  } else {
    $('#label-concept').textContent = 'Concepto del Gasto';
    $('#field-concept').placeholder = 'Ej: Pago internet, Repuestos, Almuerzo...';
    $('#field-concept').value = isEdit ? record.concept || '' : '';

    // Show/Hide Panels
    $('#group-expense-type').style.display = 'block';
    $('#group-commission-toggle').style.display = 'none';
    $('#commission-panel').style.display = 'none';

    $('#field-expense-type').value = isEdit ? record.type || 'variable' : 'variable';
  }

  // Bind Form dynamic calculations
  setupFormCalculations(type);

  // Set Submit Button Text
  $('#modal-submit').textContent = isEdit ? 'Actualizar' : 'Guardar';
  if (type === 'income') {
    $('#modal-submit').style.background = 'var(--success-gradient)';
    $('#modal-submit').style.boxShadow = 'var(--shadow-glow-success)';
  } else {
    $('#modal-submit').style.background = 'var(--danger-gradient)';
    $('#modal-submit').style.boxShadow = 'var(--shadow-glow-danger)';
  }

  // Show Modal
  $('#modal-overlay').classList.add('active');
  setTimeout(() => $('#field-amount').focus(), 200);
}

function closeFormModal() {
  $('#modal-overlay').classList.remove('active');
  currentEditId = null;
  // Clean up any dynamic event listeners
  const form = $('#modal-form');
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  
  // Re-bind listeners for next submit
  newForm.addEventListener('submit', handleFormSubmit);
}

function setupFormCalculations(type) {
  const amountField = $('#field-amount');
  const rateField = $('#field-exchange-rate');
  const amountBsField = $('#field-amount-bs');
  const notesField = $('#field-notes');

  // Income Specific nodes
  const commCheckbox = $('#field-commission-active');
  const commPanel = $('#commission-panel');
  const commPctField = $('#field-commission-pct');
  const commAmtField = $('#field-commission-amount');
  const commRecipient = $('#field-commission-recipient');
  const commStatus = $('#field-commission-status');

  if (type === 'income') {
    commCheckbox.addEventListener('change', () => {
      commPanel.style.display = commCheckbox.checked ? 'flex' : 'none';
      if (!commCheckbox.checked) {
        commRecipient.value = '';
        commStatus.value = 'pendiente';
        commPctField.value = '';
        commAmtField.value = '';
      }
      runCalculations(false);
    });
  }

  const runCalculations = (triggeredByManualCommission = false) => {
    const amount = parseFloat(amountField.value) || 0;
    const rate = parseFloat(rateField.value) || 0;

    // 1. Calculate Bolívares
    let bsAmount = 0;
    if (rate > 0) {
      bsAmount = amount * rate;
      amountBsField.value = bsAmount.toFixed(2);
    } else {
      amountBsField.value = '';
    }

    // 2. Commission calculation if active
    let commAmount = 0;
    let pct = 0;
    if (type === 'income' && commCheckbox.checked) {
      pct = parseFloat(commPctField.value) || 0;
      commAmount = parseFloat(commAmtField.value) || 0;

      if (!triggeredByManualCommission) {
        commAmount = amount * (pct / 100);
        commAmtField.value = commAmount > 0 ? commAmount.toFixed(2) : '';
      } else {
        if (amount > 0) {
          pct = (commAmount / amount) * 100;
          commPctField.value = pct > 0 ? pct.toFixed(2) : '';
        }
      }
    }

    // 3. Observations text auto-generation
    if (amount > 0 && rate > 0) {
      const formattedAmount = amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedRate = rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedBs = bsAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      let noteText = `Depositado en Bs: ${formattedAmount} × ${formattedRate} = ${formattedBs}`;
      
      if (type === 'income' && commCheckbox.checked && commAmount > 0) {
        const recipient = commRecipient.value || '[Beneficiario]';
        const status = commStatus.value === 'pagado' ? 'pagada' : 'pendiente';
        noteText += `. Comisión del ${pct.toFixed(2)}% ($${commAmount.toFixed(2)}) a ${recipient} ${status}`;
      }
      
      notesField.value = noteText;
    }
  };

  amountField.addEventListener('input', () => runCalculations(false));
  rateField.addEventListener('input', () => runCalculations(false));
  
  if (type === 'income') {
    commPctField.addEventListener('input', () => runCalculations(false));
    commAmtField.addEventListener('input', () => runCalculations(true));
    commRecipient.addEventListener('change', () => runCalculations(false));
    commStatus.addEventListener('change', () => runCalculations(false));
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const type = $('#field-type').value;
  const dateValue = $('#field-date').value;
  const amountValue = parseFloat($('#field-amount').value) || 0;
  const rateValue = parseFloat($('#field-exchange-rate').value) || 0;
  const amountBsValue = parseFloat($('#field-amount-bs').value) || 0;
  const conceptValue = $('#field-concept').value.trim();
  const notesValue = $('#field-notes').value.trim();

  if (!amountValue || !conceptValue) {
    showToast('Monto y Concepto son obligatorios', 'error');
    return;
  }

  const [y, m] = dateValue.split('-').map(Number);
  const isEdit = !!currentEditId;

  if (type === 'income') {
    const commActive = $('#field-commission-active').checked;
    const commRecipient = $('#field-commission-recipient').value;
    
    if (commActive && !commRecipient) {
      showToast('Por favor selecciona un beneficiario', 'error');
      return;
    }

    const data = {
      date: dateValue,
      company: conceptValue,
      amount: amountValue,
      exchangeRate: rateValue,
      amountBs: amountBsValue,
      notes: notesValue,
      commissionActive: commActive,
      commissionRecipient: commActive ? commRecipient : '',
      commissionStatus: commActive ? $('#field-commission-status').value : 'pendiente',
      commissionAmount: commActive ? (parseFloat($('#field-commission-amount').value) || 0) : 0,
      commissionPct: commActive ? (parseFloat($('#field-commission-pct').value) || 0) : 0
    };

    if (isEdit) {
      const oldKey = monthKey(currentYear, currentMonth);
      const newKey = monthKey(y, m);
      if (oldKey !== newKey) {
        deleteIncome(currentYear, currentMonth, currentEditId);
        addIncome(y, m, data);
      } else {
        updateIncome(currentYear, currentMonth, currentEditId, data);
      }
      showToast('Ingreso actualizado', 'success');
    } else {
      addIncome(y, m, data);
      showToast('Ingreso registrado', 'success');
    }
  } else {
    // Expense
    const data = {
      date: dateValue,
      concept: conceptValue,
      amount: amountValue,
      exchangeRate: rateValue,
      amountBs: amountBsValue,
      notes: notesValue,
      type: $('#field-expense-type').value
    };

    if (isEdit) {
      const oldKey = monthKey(currentYear, currentMonth);
      const newKey = monthKey(y, m);
      if (oldKey !== newKey) {
        deleteExpense(currentYear, currentMonth, currentEditId);
        addExpense(y, m, data);
      } else {
        updateExpense(currentYear, currentMonth, currentEditId, data);
      }
      showToast('Gasto actualizado', 'success');
    } else {
      addExpense(y, m, data);
      showToast('Gasto registrado', 'success');
    }
  }

  closeFormModal();
  window.dispatchEvent(new CustomEvent('data-changed'));
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Automatic cloud sync on focus/visibility change (Mobile) ──
let isSyncingMobile = false;
async function handleMobileForegroundSync() {
  if (isSyncingMobile) return;
  isSyncingMobile = true;
  try {
    const synced = await syncWithSupabase();
    if (synced) {
      showToast('Datos sincronizados con la nube', 'info');
      renderMobileApp();
    }
  } finally {
    isSyncingMobile = false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    handleMobileForegroundSync();
  }
});

window.addEventListener('focus', () => {
  handleMobileForegroundSync();
});

// ── Start ──
document.addEventListener('DOMContentLoaded', () => {
  bootMobile();
  // Bind form submit listener to initial modal form
  $('#modal-form').addEventListener('submit', handleFormSubmit);
});
