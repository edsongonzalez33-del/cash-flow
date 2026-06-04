// ============================================================
// Expenses Module - CRUD operations and UI for expenses
// ============================================================
import {
  getExpenses, addExpense, updateExpense, deleteExpense, getMonthTotals, getAllConcepts
} from './store.js';
import {
  formatCurrency, formatDate, formatMonthLabel, navigateMonth, showToast, $, todayISO, monthKey
} from './utils.js';

let currentYear, currentMonth;
let currentFilter = 'all';
let currentSearch = '';
let onMonthChange = null;

/**
 * Initialize the expenses module
 */
export function initExpenses(year, month, onMonthChangeCb) {
  currentYear = year;
  currentMonth = month;
  onMonthChange = onMonthChangeCb;

  // Month navigation
  $('#exp-prev-month').addEventListener('click', () => {
    const nav = navigateMonth(currentYear, currentMonth, -1);
    currentYear = nav.year;
    currentMonth = nav.month;
    renderExpenses();
    if (onMonthChange) onMonthChange(currentYear, currentMonth);
  });

  $('#exp-next-month').addEventListener('click', () => {
    const nav = navigateMonth(currentYear, currentMonth, 1);
    currentYear = nav.year;
    currentMonth = nav.month;
    renderExpenses();
    if (onMonthChange) onMonthChange(currentYear, currentMonth);
  });

  // Add expense button
  $('#btn-add-expense').addEventListener('click', () => {
    openExpenseModal();
  });

  // Type filter chips
  $('#expense-type-filter').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    currentFilter = chip.dataset.filter;
    $('#expense-type-filter').querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    renderExpensesTable();
  });

  // Search
  $('#expense-search').addEventListener('input', (e) => {
    currentSearch = e.target.value.toLowerCase();
    renderExpensesTable();
  });
}

/**
 * Set the current month externally and re-render
 */
export function setExpensesMonth(year, month) {
  currentYear = year;
  currentMonth = month;
  renderExpenses();
}

/**
 * Render the full expenses section
 */
export function renderExpenses() {
  // Update month label
  $('#exp-month-label').textContent = formatMonthLabel(currentYear, currentMonth);

  // Update summary
  const totals = getMonthTotals(currentYear, currentMonth);
  $('#exp-total').textContent = formatCurrency(totals.totalExpenses);
  $('#exp-fixed').textContent = formatCurrency(totals.fixedExpenses);
  $('#exp-variable').textContent = formatCurrency(totals.variableExpenses);

  renderExpensesTable();
}

function renderExpensesTable() {
  let expenses = getExpenses(currentYear, currentMonth);

  // Apply filter
  if (currentFilter !== 'all') {
    expenses = expenses.filter(e => (e.type || '').toLowerCase() === currentFilter);
  }

  // Apply search
  if (currentSearch) {
    expenses = expenses.filter(e =>
      (e.concept || '').toLowerCase().includes(currentSearch)
    );
  }

  const tbody = $('#expenses-tbody');

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5"><p class="empty-state">No hay gastos registrados${currentFilter !== 'all' ? ` de tipo "${currentFilter}"` : ''}</p></td></tr>`;
    return;
  }

  tbody.innerHTML = expenses.map(e => `
    <tr data-id="${e.id}">
      <td>${formatDate(e.date)}</td>
      <td style="color: var(--text-primary); font-weight: 500;">${escapeHtml(e.concept || '')}</td>
      <td class="text-right amount-cell text-danger">${formatCurrency(e.amount)}</td>
      <td class="text-right amount-cell" style="color: var(--text-secondary); font-weight: 500;">${e.amountBs ? 'Bs. ' + parseFloat(e.amountBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</td>
      <td><span class="type-badge ${(e.type || '').toLowerCase()}">${e.type || '—'}</span></td>
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
        const expense = getExpenses(currentYear, currentMonth).find(ex => ex.id === id);
        if (expense) openExpenseModal(expense);
      } else if (action === 'delete') {
        window._pendingDelete = { type: 'expense', id, year: currentYear, month: currentMonth };
        $('#confirm-overlay').classList.add('active');
      }
    });
  });
}

/**
 * Open the expense modal for add/edit
 */
function openExpenseModal(expense = null) {
  const isEdit = !!expense;
  const modal = $('#modal');
  const overlay = $('#modal-overlay');

  $('#modal-title').textContent = isEdit ? 'Editar Gasto' : 'Nuevo Gasto';
  $('#modal-submit').textContent = isEdit ? 'Actualizar' : 'Guardar';
  $('#modal-submit').className = 'btn-primary';

  const defaultDate = expense ? expense.date : todayISO();
  const ym = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  const INACTIVE_CONCEPTS = new Set([
    'internet', 'internet caracas', 'internet valencia', 'inter',
    'elinor', 'elinar',
    'victoria',
    'audio place',
    'mercado navideño', 'mercado navideo',
    'pólizas rafa y espe', 'polizas rafa y espe', 'rafa y espe',
    'póliza ahorro (extra)', 'poliza ahorro (extra)',
    'póliza ahorro x 2', 'poliza ahorro x 2'
  ]);

  const rawConcepts = [
    'Nómina: Berelitza',
    'Nómina: María Hortencia',
    'Nómina: Víctor Romero',
    ...getAllConcepts()
  ];

  const filteredConcepts = rawConcepts.filter(c => {
    if (!c) return false;
    const lower = c.trim().toLowerCase();
    return !INACTIVE_CONCEPTS.has(lower);
  });

  const allConcepts = new Set(filteredConcepts);

  const datalistHtml = `
    <datalist id="concept-suggestions">
      ${Array.from(allConcepts).map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}
    </datalist>
  `;

  $('#modal-body').innerHTML = `
    ${datalistHtml}
    <div class="form-row">
      <div class="form-group">
        <label for="field-date">Fecha</label>
        <input type="date" id="field-date" value="${defaultDate}" required />
      </div>
      <div class="form-group">
        <label for="field-type">Tipo</label>
        <select id="field-type">
          <option value="fijo" ${expense?.type?.toLowerCase() === 'fijo' ? 'selected' : ''}>Fijo</option>
          <option value="variable" ${expense?.type?.toLowerCase() === 'variable' ? 'selected' : ''}>Variable</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label for="field-concept">Concepto</label>
      <input type="text" id="field-concept" list="concept-suggestions" value="${escapeHtml(expense?.concept || '')}" placeholder="Ej: Gasolina, Internet..." required />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="field-amount">Monto ($)</label>
        <input type="number" id="field-amount" value="${expense?.amount || ''}" step="0.01" min="0" placeholder="0.00" required />
      </div>
      <div class="form-group">
        <label for="field-exchange-rate">Tasa Cambio BCV (Bs./$)</label>
        <input type="number" id="field-exchange-rate" value="${expense?.exchangeRate || ''}" step="0.01" min="0" placeholder="Ej: 45.50" style="height: 38px;" />
      </div>
    </div>
    
    <div class="form-group">
      <label for="field-amount-bs">Monto en Bolívares (Bs.)</label>
      <input type="number" id="field-amount-bs" value="${expense?.amountBs || ''}" step="0.01" min="0" placeholder="0.00" style="height: 38px; background: rgba(255,255,255,0.03); color: var(--text-secondary);" readonly />
    </div>

    <div class="form-group">
      <label for="field-notes">Observaciones (opcional)</label>
      <textarea id="field-notes" placeholder="Notas adicionales (opcional)">${escapeHtml(expense?.notes || '')}</textarea>
    </div>
  `;

  // Dynamic calculations binding
  const amountField = $('#field-amount');
  const rateField = $('#field-exchange-rate');
  const amountBsField = $('#field-amount-bs');
  const notesField = $('#field-notes');

  const updateCalculationsAndNotes = () => {
    const amount = parseFloat(amountField.value) || 0;
    const rate = parseFloat(rateField.value) || 0;
    
    let bsAmount = 0;
    if (rate > 0) {
      bsAmount = amount * rate;
      amountBsField.value = bsAmount.toFixed(2);
    } else {
      amountBsField.value = '';
    }

    if (amount > 0 && rate > 0) {
      const formattedAmount = amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedRate = rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedBs = bsAmount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      notesField.value = `Pago en Bs: ${formattedAmount} × ${formattedRate} = ${formattedBs}`;
    }
  };

  amountField.addEventListener('input', updateCalculationsAndNotes);
  rateField.addEventListener('input', updateCalculationsAndNotes);

  // Initialize
  updateCalculationsAndNotes();

  // Form submit handler
  const form = $('#modal-form');
  const handler = (e) => {
    e.preventDefault();
    const data = {
      date: $('#field-date').value,
      concept: $('#field-concept').value.trim(),
      amount: parseFloat($('#field-amount').value) || 0,
      type: $('#field-type').value,
      exchangeRate: parseFloat($('#field-exchange-rate').value) || 0,
      amountBs: parseFloat($('#field-amount-bs').value) || 0,
      notes: $('#field-notes').value.trim()
    };

    if (!data.concept || !data.amount) {
      showToast('Completa todos los campos requeridos', 'error');
      return;
    }

    // Determine month from date
    const [y, m] = data.date.split('-').map(Number);

    if (isEdit) {
      // If the month changed, delete from old month and add to new
      const oldKey = monthKey(currentYear, currentMonth);
      const newKey = monthKey(y, m);
      if (oldKey !== newKey) {
        deleteExpense(currentYear, currentMonth, expense.id);
        addExpense(y, m, data);
      } else {
        updateExpense(currentYear, currentMonth, expense.id, data);
      }
      showToast('Gasto actualizado');
    } else {
      addExpense(y, m, data);
      showToast('Gasto agregado');
    }

    overlay.classList.remove('active');
    form.removeEventListener('submit', handler);
    renderExpenses();
    // Notify dashboard
    window.dispatchEvent(new CustomEvent('data-changed'));
  };

  form.addEventListener('submit', handler);

  // Store cleanup handler ref
  modal._currentHandler = handler;

  overlay.classList.add('active');
  setTimeout(() => $('#field-concept').focus(), 100);
}

/**
 * Handle confirmed delete for expenses
 */
export function handleExpenseDelete(id, year, month) {
  deleteExpense(year, month, id);
  showToast('Gasto eliminado');
  renderExpenses();
  window.dispatchEvent(new CustomEvent('data-changed'));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
