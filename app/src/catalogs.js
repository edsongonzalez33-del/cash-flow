// ============================================================
// Catalogs Module - Master Catalogs & Fixed Expenses Management (CRUD)
// ============================================================
import {
  getCatalogList, addCatalogItem, updateCatalogItem, deleteCatalogItem, getCatalogUsageStats,
  getFixedExpenses, addFixedExpense, updateFixedExpense, deleteFixedExpense
} from './store.js';
import { $, $$, showToast, formatCurrency } from './utils.js';

let currentTab = 'fixedExpenses'; // 'fixedExpenses' | 'concepts' | 'companies' | 'beneficiaries'
let currentSearch = '';
let currentEditId = null;

const TAB_CONFIG = {
  fixedExpenses: {
    title: 'Gastos Fijos Programados',
    singular: 'Gasto Fijo',
    btnText: 'Nuevo Gasto Fijo',
    emptyText: 'No hay gastos fijos programados configurados.',
    placeholder: 'Ej: Nómina, Internet, Póliza...'
  },
  concepts: {
    title: 'Conceptos de Gasto',
    singular: 'Concepto',
    btnText: 'Nuevo Concepto',
    emptyText: 'No hay conceptos de gasto registrados en el catálogo.',
    typeLabel: 'Tipo Predeterminado',
    placeholder: 'Ej: Alquiler Oficina, Internet, Repuestos...'
  },
  companies: {
    title: 'Compañías / Orígenes',
    singular: 'Compañía',
    btnText: 'Nueva Compañía',
    emptyText: 'No hay compañías registradas en el catálogo.',
    typeLabel: 'Tipo',
    placeholder: 'Ej: Oceánica, Mercantil, Particular...'
  },
  beneficiaries: {
    title: 'Beneficiarios de Comisión',
    singular: 'Beneficiario',
    btnText: 'Nuevo Beneficiario',
    emptyText: 'No hay beneficiarios registrados en el catálogo.',
    typeLabel: 'Rol',
    placeholder: 'Ej: María Hortencia, Freddy...'
  }
};

/**
 * Initialize Catalogs Module
 */
export function initCatalogs() {
  // Tab switching
  $$('.catalog-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = btn.dataset.tab;
      if (tab && tab !== currentTab) {
        currentTab = tab;
        $$('.catalog-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSearch = '';
        const searchInput = $('#catalog-search');
        if (searchInput) searchInput.value = '';
        renderCatalogs();
      }
    });
  });

  // Search input
  const searchInput = $('#catalog-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = (e.target.value || '').toLowerCase().trim();
      renderCatalogs();
    });
  }

  // Add button
  const addBtn = $('#btn-add-catalog');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openCatalogModal();
    });
  }

  // Modal handlers
  setupCatalogModalHandlers();
}

/**
 * Render the current catalog tab
 */
export function renderCatalogs() {
  const config = TAB_CONFIG[currentTab] || TAB_CONFIG.fixedExpenses;
  const thead = $('#catalogs-thead');
  const tbody = $('#catalogs-tbody');
  const addBtnText = $('#btn-add-catalog-text');
  const sectionTitle = $('#catalog-section-title');
  const sectionSubtitle = $('#catalog-section-subtitle');

  if (addBtnText) addBtnText.textContent = config.btnText;
  if (sectionTitle) sectionTitle.textContent = config.title;
  if (sectionSubtitle) {
    sectionSubtitle.textContent = currentTab === 'fixedExpenses'
      ? 'Configura la lista maestra de gastos recurrentes, frecuencias (mensual/quincenal) y montos de referencia.'
      : `Administra las opciones maestras de ${config.title.toLowerCase()} para el autocompletado del sistema.`;
  }

  if (currentTab === 'fixedExpenses') {
    renderFixedExpensesTab(thead, tbody, config);
  } else {
    renderStandardCatalogTab(thead, tbody, config);
  }
}

/**
 * Render Fixed Expenses Tab
 */
function renderFixedExpensesTab(thead, tbody, config) {
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th style="width: 32%;">Gasto Fijo</th>
        <th style="width: 20%;">Frecuencia</th>
        <th style="width: 22%;">Monto de Referencia</th>
        <th style="width: 14%;">Estado</th>
        <th class="text-center" style="width: 12%;">Acciones</th>
      </tr>
    `;
  }

  const items = getFixedExpenses();
  let filtered = items;
  if (currentSearch) {
    filtered = items.filter(item => (item.name || '').toLowerCase().includes(currentSearch));
  }
  filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">
          <p class="empty-state">${currentSearch ? 'No se encontraron gastos fijos para la búsqueda.' : config.emptyText}</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const isQuincenal = (item.frequency || '').toLowerCase() === 'quincenal';
    const freqBadge = isQuincenal
      ? '<span class="badge" style="background: rgba(59, 130, 246, 0.12); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);">Quincenal (2 pagos)</span>'
      : '<span class="badge badge-fixed">Mensual (1 pago)</span>';

    const activeBadge = item.active !== false
      ? '<span class="badge badge-info"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#10B981; margin-right:5px;"></span>Activo</span>'
      : '<span class="badge badge-secondary" style="opacity: 0.7;">Pausado</span>';

    return `
      <tr data-id="${item.id}">
        <td>
          <div class="catalog-item-name">
            <strong>${escapeHtml(item.name)}</strong>
          </div>
        </td>
        <td>${freqBadge}</td>
        <td>
          <span style="font-weight: 700; font-family: monospace; font-size: 0.95rem; color: var(--accent);">
            ${item.targetAmount > 0 ? formatCurrency(item.targetAmount) : '<span style="color:var(--text-muted); font-weight:normal;">Sin estimación</span>'}
          </span>
        </td>
        <td>${activeBadge}</td>
        <td class="text-center">
          <div class="table-actions">
            <button class="btn-icon btn-edit-catalog" data-id="${item.id}" title="Editar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-icon delete btn-delete-catalog" data-id="${item.id}" title="Eliminar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  bindCatalogRowEvents(items);
}

/**
 * Render Standard Catalog Tabs (concepts, companies, beneficiaries)
 */
function renderStandardCatalogTab(thead, tbody, config) {
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th style="width: 40%;">${config.singular}</th>
        <th style="width: 25%;">${config.typeLabel || 'Tipo'}</th>
        <th style="width: 20%;">Uso en el Sistema</th>
        <th class="text-center" style="width: 15%;">Acciones</th>
      </tr>
    `;
  }

  const items = getCatalogList(currentTab);
  const stats = getCatalogUsageStats();
  const usageMap = stats[currentTab] || {};

  let filtered = items;
  if (currentSearch) {
    filtered = items.filter(item => (item.name || '').toLowerCase().includes(currentSearch));
  }
  filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="4">
          <p class="empty-state">${currentSearch ? 'No se encontraron resultados para la búsqueda.' : config.emptyText}</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const uses = usageMap[item.name] || 0;
    
    let typeBadge = '';
    if (currentTab === 'concepts') {
      const isFixed = (item.defaultType || '').toLowerCase() === 'fijo';
      typeBadge = isFixed 
        ? '<span class="badge badge-fixed">Fijo</span>' 
        : '<span class="badge badge-variable">Variable</span>';
    } else if (currentTab === 'companies') {
      typeBadge = '<span class="badge badge-info">Origen Ingreso</span>';
    } else {
      typeBadge = '<span class="badge badge-secondary">Tercero Comisionable</span>';
    }

    const usageBadge = uses > 0 
      ? `<span class="usage-count active"><span class="usage-dot"></span>${uses} ${uses === 1 ? 'registro' : 'registros'}</span>`
      : `<span class="usage-count zero">Sin registros</span>`;

    return `
      <tr data-id="${item.id}">
        <td>
          <div class="catalog-item-name">
            <strong>${escapeHtml(item.name)}</strong>
          </div>
        </td>
        <td>${typeBadge}</td>
        <td>${usageBadge}</td>
        <td class="text-center">
          <div class="table-actions">
            <button class="btn-icon btn-edit-catalog" data-id="${item.id}" title="Editar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="btn-icon delete btn-delete-catalog" data-id="${item.id}" title="Eliminar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  bindCatalogRowEvents(items);
}

function bindCatalogRowEvents(items) {
  const tbody = $('#catalogs-tbody');
  if (!tbody) return;

  tbody.querySelectorAll('.btn-edit-catalog').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = items.find(i => i.id === id);
      if (item) openCatalogModal(item);
    });
  });

  tbody.querySelectorAll('.btn-delete-catalog').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = items.find(i => i.id === id);
      if (item) confirmDeleteCatalogItem(item);
    });
  });
}

/**
 * Setup modal event listeners
 */
function setupCatalogModalHandlers() {
  const overlay = $('#catalog-modal-overlay');
  const closeBtn = $('#catalog-modal-close');
  const cancelBtn = $('#catalog-modal-cancel');
  const form = $('#catalog-modal-form');

  if (closeBtn) closeBtn.addEventListener('click', closeCatalogModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeCatalogModal);

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeCatalogModal();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = $('#field-catalog-name');
      const name = nameInput ? nameInput.value.trim() : '';

      if (!name) {
        showToast('Por favor escribe un nombre válido', 'error');
        return;
      }

      try {
        if (currentTab === 'fixedExpenses') {
          const freqSelect = $('#field-catalog-frequency');
          const amountInput = $('#field-catalog-target-amount');
          const activeCheck = $('#field-catalog-active');

          const payload = {
            name,
            frequency: freqSelect ? freqSelect.value : 'mensual',
            targetAmount: amountInput ? (parseFloat(amountInput.value) || 0) : 0,
            active: activeCheck ? activeCheck.checked : true
          };

          if (currentEditId) {
            await updateFixedExpense(currentEditId, payload);
            showToast('Gasto fijo actualizado correctamente', 'success');
          } else {
            await addFixedExpense(payload);
            showToast('Nuevo gasto fijo agregado', 'success');
          }
        } else {
          const typeSelect = $('#field-catalog-default-type');
          if (currentEditId) {
            await updateCatalogItem(currentTab, currentEditId, {
              name,
              defaultType: typeSelect ? typeSelect.value : undefined
            });
            showToast('Elemento actualizado correctamente', 'success');
          } else {
            await addCatalogItem(currentTab, {
              name,
              defaultType: typeSelect ? typeSelect.value : undefined
            });
            showToast('Elemento agregado al catálogo', 'success');
          }
        }

        closeCatalogModal();
        renderCatalogs();
      } catch (err) {
        console.error(err);
        showToast('Error: ' + err.message, 'error');
      }
    });
  }
}

/**
 * Open Modal to Add or Edit
 */
function openCatalogModal(item = null) {
  const config = TAB_CONFIG[currentTab] || TAB_CONFIG.fixedExpenses;
  const overlay = $('#catalog-modal-overlay');
  const title = $('#catalog-modal-title');
  const submitBtn = $('#catalog-modal-submit');
  const nameInput = $('#field-catalog-name');
  const nameLabel = $('#catalog-name-label');
  const groupType = $('#group-catalog-type');
  const typeSelect = $('#field-catalog-default-type');

  // Fixed Expense specific fields
  const groupFixedFields = $('#group-catalog-fixed-fields');
  const freqSelect = $('#field-catalog-frequency');
  const targetAmountInput = $('#field-catalog-target-amount');
  const activeCheck = $('#field-catalog-active');

  currentEditId = item ? item.id : null;

  if (title) {
    title.textContent = item ? `Editar ${config.singular}` : `Nuevo ${config.singular}`;
  }
  if (submitBtn) {
    submitBtn.textContent = item ? 'Actualizar' : 'Guardar';
  }
  if (nameLabel) {
    nameLabel.textContent = `Nombre de ${config.singular}`;
  }
  if (nameInput) {
    nameInput.placeholder = config.placeholder;
    nameInput.value = item ? item.name : '';
  }

  // Handle standard concept default type field
  if (groupType) {
    if (currentTab === 'concepts') {
      groupType.style.display = 'block';
      if (typeSelect) {
        typeSelect.value = item ? (item.defaultType || 'variable') : 'fijo';
      }
    } else {
      groupType.style.display = 'none';
    }
  }

  // Handle Fixed Expense specific controls
  if (groupFixedFields) {
    if (currentTab === 'fixedExpenses') {
      groupFixedFields.style.display = 'block';
      if (freqSelect) freqSelect.value = item ? (item.frequency || 'mensual') : 'mensual';
      if (targetAmountInput) targetAmountInput.value = (item && item.targetAmount !== undefined) ? item.targetAmount : '';
      if (activeCheck) activeCheck.checked = item ? (item.active !== false) : true;
    } else {
      groupFixedFields.style.display = 'none';
    }
  }

  if (overlay) overlay.classList.add('active');
  if (nameInput) setTimeout(() => nameInput.focus(), 150);
}

/**
 * Close modal
 */
function closeCatalogModal() {
  const overlay = $('#catalog-modal-overlay');
  if (overlay) overlay.classList.remove('active');
  currentEditId = null;
}

/**
 * Delete confirmation
 */
async function confirmDeleteCatalogItem(item) {
  const config = TAB_CONFIG[currentTab] || TAB_CONFIG.fixedExpenses;
  if (confirm(`¿Estás seguro de eliminar "${item.name}"?`)) {
    try {
      if (currentTab === 'fixedExpenses') {
        await deleteFixedExpense(item.id);
        showToast('Gasto fijo eliminado', 'success');
      } else {
        await deleteCatalogItem(currentTab, item.id);
        showToast('Elemento eliminado del catálogo', 'success');
      }
      renderCatalogs();
    } catch (err) {
      console.error(err);
      showToast('Error al eliminar: ' + err.message, 'error');
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
