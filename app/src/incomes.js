// ============================================================
// Incomes Module - CRUD operations and UI for incomes
// ============================================================
import {
  getIncomes, addIncome, updateIncome, deleteIncome, getMonthTotals,
  getAllCompanies
} from './store.js';
import {
  formatCurrency, formatDate, formatMonthLabel, navigateMonth, showToast, $, todayISO, monthKey
} from './utils.js';

let currentYear, currentMonth;
let currentCompanyFilter = 'all';
let currentSearch = '';
let onMonthChange = null;

/**
 * Initialize the incomes module
 */
export function initIncomes(year, month, onMonthChangeCb) {
  currentYear = year;
  currentMonth = month;
  onMonthChange = onMonthChangeCb;

  // Month navigation
  $('#inc-prev-month').addEventListener('click', () => {
    const nav = navigateMonth(currentYear, currentMonth, -1);
    currentYear = nav.year;
    currentMonth = nav.month;
    renderIncomes();
    if (onMonthChange) onMonthChange(currentYear, currentMonth);
  });

  $('#inc-next-month').addEventListener('click', () => {
    const nav = navigateMonth(currentYear, currentMonth, 1);
    currentYear = nav.year;
    currentMonth = nav.month;
    renderIncomes();
    if (onMonthChange) onMonthChange(currentYear, currentMonth);
  });

  // Add income button
  $('#btn-add-income').addEventListener('click', () => {
    openIncomeModal();
  });

  // Company filter
  $('#income-company-filter').addEventListener('change', (e) => {
    currentCompanyFilter = e.target.value;
    renderIncomesTable();
  });

  // Search
  $('#income-search').addEventListener('input', (e) => {
    currentSearch = e.target.value.toLowerCase();
    renderIncomesTable();
  });
}

/**
 * Set the current month externally and re-render
 */
export function setIncomesMonth(year, month) {
  currentYear = year;
  currentMonth = month;
  renderIncomes();
}

/**
 * Render the full incomes section
 */
export function renderIncomes() {
  // Update month label
  $('#inc-month-label').textContent = formatMonthLabel(currentYear, currentMonth);

  // Update summary
  const totals = getMonthTotals(currentYear, currentMonth);
  const incomes = getIncomes(currentYear, currentMonth);
  const avg = incomes.length > 0 ? totals.totalIncomes / incomes.length : 0;

  $('#inc-total').textContent = formatCurrency(totals.totalIncomes);
  $('#inc-count').textContent = incomes.length;
  $('#inc-avg').textContent = formatCurrency(avg);

  // Update company filter dropdown
  updateCompanyFilter();

  renderIncomesTable();
}

function updateCompanyFilter() {
  const select = $('#income-company-filter');
  const companies = getAllCompanies();
  const current = select.value;

  select.innerHTML = '<option value="all">Todas</option>' +
    companies.map(c => `<option value="${escapeHtml(c)}" ${c === current ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
}

function renderIncomesTable() {
  let incomes = getIncomes(currentYear, currentMonth);

  // Apply company filter
  if (currentCompanyFilter !== 'all') {
    incomes = incomes.filter(e => e.company === currentCompanyFilter);
  }

  // Apply search
  if (currentSearch) {
    incomes = incomes.filter(e =>
      (e.company || '').toLowerCase().includes(currentSearch) ||
      (e.notes || '').toLowerCase().includes(currentSearch)
    );
  }

  const tbody = $('#incomes-tbody');

  if (incomes.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><p class="empty-state">No hay ingresos registrados para este mes</p></td></tr>`;
    return;
  }

  tbody.innerHTML = incomes.map(e => `
    <tr data-id="${e.id}">
      <td>${formatDate(e.date)}</td>
      <td style="color: var(--text-primary); font-weight: 500;">${escapeHtml(e.company || '')}</td>
      <td class="text-right amount-cell text-success">${formatCurrency(e.amount)}</td>
      <td class="text-right amount-cell" style="color: var(--text-secondary); font-weight: 500;">${e.amountBs ? 'Bs. ' + parseFloat(e.amountBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
      <td class="notes-cell" title="${escapeHtml(e.notes || '')}">${escapeHtml(e.notes || '—')}</td>
      <td class="text-center">
        <div class="action-btns">
          <button class="btn-icon edit" title="Editar" data-action="edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-icon delete" title="Eliminar" data-action="delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  // Attach row action handlers
  tbody.querySelectorAll('.btn-icon').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const id = row.dataset.id;
      const action = e.target.closest('[data-action]').dataset.action;

      if (action === 'edit') {
        const income = getIncomes(currentYear, currentMonth).find(inc => inc.id === id);
        if (income) openIncomeModal(income);
      } else if (action === 'delete') {
        window._pendingDelete = { type: 'income', id, year: currentYear, month: currentMonth };
        $('#confirm-overlay').classList.add('active');
      }
    });
  });
}

/**
 * Open the income modal for add/edit
 */
function openIncomeModal(income = null) {
  const isEdit = !!income;
  const overlay = $('#modal-overlay');
  const modal = $('#modal');

  $('#modal-title').textContent = isEdit ? 'Editar Ingreso' : 'Nuevo Ingreso';
  $('#modal-submit').textContent = isEdit ? 'Actualizar' : 'Guardar';
  $('#modal-submit').className = 'btn-primary btn-income';

  const defaultDate = income ? income.date : todayISO();

  const allCompanies = getAllCompanies();
  const datalistHtml = `
    <datalist id="company-suggestions">
      ${allCompanies.map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}
    </datalist>
  `;  $('#modal-body').innerHTML = `
    ${datalistHtml}
    <div class="form-row">
      <div class="form-group">
        <label for="field-date">Fecha</label>
        <input type="date" id="field-date" value="${defaultDate}" required />
      </div>
      <div class="form-group">
        <label for="field-amount">Monto ($)</label>
        <input type="number" id="field-amount" value="${income?.amount || ''}" step="0.01" min="0" placeholder="0.00" required />
      </div>
    </div>
    
    <div class="form-row">
      <div class="form-group">
        <label for="field-exchange-rate">Tasa Cambio BCV (Bs./$)</label>
        <input type="number" id="field-exchange-rate" value="${income?.exchangeRate || ''}" step="0.01" min="0" placeholder="Ej: 45.50" style="height: 38px;" />
      </div>
      <div class="form-group">
        <label for="field-amount-bs">Monto en Bolívares (Bs.)</label>
        <input type="number" id="field-amount-bs" value="${income?.amountBs || ''}" step="0.01" min="0" placeholder="0.00" style="height: 38px; background: rgba(255,255,255,0.03); color: var(--text-secondary);" readonly />
      </div>
    </div>

    <div class="form-group">
      <label for="field-company">Compañía</label>
      <input type="text" id="field-company" list="company-suggestions" value="${escapeHtml(income?.company || '')}" placeholder="Ej: Oceánica, Mercantil..." required />
    </div>
    
    <div class="form-group" style="margin-top: 15px;">
      <label class="checkbox-container" style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
        <input type="checkbox" id="field-commission-active" ${income?.commissionActive ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;" />
        <span style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">¿Aplica comisión a terceros?</span>
      </label>
    </div>

    <!-- Collapsible Commission Panel -->
    <div id="commission-panel" style="display: ${income?.commissionActive ? 'block' : 'none'}; border-left: 3px solid var(--accent); padding-left: 14px; margin: 15px 0; background: rgba(99, 102, 241, 0.03); border-radius: 0 var(--radius-md) var(--radius-md) 0; padding: 12px 14px;">
      <h4 style="font-size: 0.9rem; font-weight: 600; color: var(--accent-hover); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Calculadora y Registro de Comisión</h4>
      
      <div class="form-row" style="margin-bottom: 10px;">
        <div class="form-group">
          <label for="field-commission-recipient">Beneficiario</label>
          <select id="field-commission-recipient" class="filter-select" style="width: 100%; min-width: unset; height: 38px;">
            <option value="">Selecciona beneficiario</option>
            <option value="María Hortencia" ${income?.commissionRecipient === 'María Hortencia' ? 'selected' : ''}>María Hortencia</option>
            <option value="Luisa Velásquez" ${income?.commissionRecipient === 'Luisa Velásquez' ? 'selected' : ''}>Luisa Velásquez</option>
            <option value="Freddy" ${income?.commissionRecipient === 'Freddy' ? 'selected' : ''}>Freddy</option>
            <option value="Zitiu" ${income?.commissionRecipient === 'Zitiu' ? 'selected' : ''}>Zitiu</option>
          </select>
        </div>
        <div class="form-group">
          <label for="field-commission-status">Estado Comisión</label>
          <select id="field-commission-status" class="filter-select" style="width: 100%; min-width: unset; height: 38px;">
            <option value="pendiente" ${income?.commissionStatus === 'pendiente' || !income ? 'selected' : ''}>Pendiente</option>
            <option value="pagado" ${income?.commissionStatus === 'pagado' ? 'selected' : ''}>Pagado</option>
          </select>
        </div>
      </div>

      <div class="form-row" style="margin-bottom: 10px;">
        <div class="form-group">
          <label for="field-commission-pct">Porcentaje Comisión (%)</label>
          <input type="number" id="field-commission-pct" value="${income?.commissionPct || ''}" step="0.1" min="0" max="100" placeholder="Ej: 10" style="height: 38px;" />
        </div>
        <div class="form-group">
          <label for="field-commission-amount">Monto Comisión ($)</label>
          <input type="number" id="field-commission-amount" value="${income?.commissionAmount || ''}" step="0.01" min="0" placeholder="0.00" style="height: 38px;" />
        </div>
      </div>

      <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-default);">
        <span>Comisión Calculada: </span>
        <strong id="label-commission-calc" class="text-danger" style="font-size: 0.9rem;">$${income?.commissionAmount || '0.00'}</strong>
      </div>
    </div>

    <div class="form-group">
      <label for="field-notes">Observaciones</label>
      <textarea id="field-notes" placeholder="Notas adicionales (opcional)">${escapeHtml(income?.notes || '')}</textarea>
    </div>
  `;

  // Dynamic calculations binding
  const activeCheckbox = $('#field-commission-active');
  const panel = $('#commission-panel');
  const recipientField = $('#field-commission-recipient');
  const statusField = $('#field-commission-status');
  const amountBsField = $('#field-amount-bs');
  const rateField = $('#field-exchange-rate');
  const pctField = $('#field-commission-pct');
  const commField = $('#field-commission-amount');
  const commLabel = $('#label-commission-calc');
  const amountField = $('#field-amount');
  const notesField = $('#field-notes');

  activeCheckbox.addEventListener('change', () => {
    panel.style.display = activeCheckbox.checked ? 'block' : 'none';
    if (!activeCheckbox.checked) {
      recipientField.value = '';
      statusField.value = 'pendiente';
      pctField.value = '';
      commField.value = '';
      commLabel.textContent = `$0.00`;
    }
    updateCalculationsAndNotes();
  });

  const updateCalculationsAndNotes = (triggeredByManualCommission = false) => {
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
    if (activeCheckbox.checked) {
      pct = parseFloat(pctField.value) || 0;
      commAmount = parseFloat(commField.value) || 0;

      if (!triggeredByManualCommission) {
        commAmount = amount * (pct / 100);
        commField.value = commAmount > 0 ? commAmount.toFixed(2) : '';
      } else {
        if (amount > 0) {
          pct = (commAmount / amount) * 100;
          pctField.value = pct > 0 ? pct.toFixed(1) : '';
        }
      }
      commLabel.textContent = `$${commAmount.toFixed(2)}`;
    }

    // 3. Observations text generation
    if (amount > 0 && rate > 0) {
      const formattedAmount = amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedRate = rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedBs = bsAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      let noteText = `Depositado en Bs: ${formattedAmount} × ${formattedRate} = ${formattedBs}`;
      
      if (activeCheckbox.checked && commAmount > 0) {
        const recipient = recipientField.value || '[Beneficiario]';
        const status = statusField.value === 'pagado' ? 'pagada' : 'pendiente';
        noteText += `. Comisión del ${pct.toFixed(1)}% ($${commAmount.toFixed(2)}) a ${recipient} ${status}`;
      }
      
      notesField.value = noteText;
    }
  };

  // Bind reactive events
  amountField.addEventListener('input', () => updateCalculationsAndNotes(false));
  rateField.addEventListener('input', () => updateCalculationsAndNotes(false));
  pctField.addEventListener('input', () => updateCalculationsAndNotes(false));
  commField.addEventListener('input', () => updateCalculationsAndNotes(true));
  recipientField.addEventListener('change', () => updateCalculationsAndNotes(false));
  statusField.addEventListener('change', () => updateCalculationsAndNotes(false));

  // Initialize calculations if values exist (edit mode)
  updateCalculationsAndNotes(false);

  // Form submit handler
  const form = $('#modal-form');
  const handler = (e) => {
    e.preventDefault();
    const data = {
      date: $('#field-date').value,
      company: $('#field-company').value.trim(),
      amount: parseFloat($('#field-amount').value) || 0,
      notes: $('#field-notes').value.trim(),
      
      // Save commission status fields
      commissionActive: activeCheckbox.checked,
      commissionRecipient: activeCheckbox.checked ? recipientField.value : '',
      commissionStatus: activeCheckbox.checked ? statusField.value : 'pendiente',
      commissionAmount: activeCheckbox.checked ? (parseFloat(commField.value) || 0) : 0,
      commissionPct: activeCheckbox.checked ? (parseFloat(pctField.value) || 0) : 0,
      amountBs: parseFloat(amountBsField.value) || 0,
      exchangeRate: parseFloat(rateField.value) || 0
    };

    if (!data.company || !data.amount) {
      showToast('Completa todos los campos requeridos', 'error');
      return;
    }

    if (data.commissionActive && !data.commissionRecipient) {
      showToast('Por favor selecciona un beneficiario para la comisión', 'error');
      return;
    }

    const [y, m] = data.date.split('-').map(Number);

    if (isEdit) {
      const oldKey = monthKey(currentYear, currentMonth);
      const newKey = monthKey(y, m);
      if (oldKey !== newKey) {
        deleteIncome(currentYear, currentMonth, income.id);
        addIncome(y, m, data);
      } else {
        updateIncome(currentYear, currentMonth, income.id, data);
      }
      showToast('Ingreso actualizado');
    } else {
      addIncome(y, m, data);
      showToast('Ingreso agregado');
    }

    overlay.classList.remove('active');
    form.removeEventListener('submit', handler);
    renderIncomes();
    window.dispatchEvent(new CustomEvent('data-changed'));
  };

  form.addEventListener('submit', handler);
  modal._currentHandler = handler;

  overlay.classList.add('active');
  setTimeout(() => $('#field-company').focus(), 100);
}

/**
 * Handle confirmed delete for incomes
 */
export function handleIncomeDelete(id, year, month) {
  deleteIncome(year, month, id);
  showToast('Ingreso eliminado');
  renderIncomes();
  window.dispatchEvent(new CustomEvent('data-changed'));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
