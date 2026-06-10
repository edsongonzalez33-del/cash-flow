// ============================================================
// Main Entry Point - App initialization and routing
// ============================================================
import { importData, exportData, hasData, syncWithSupabase, uploadLocalDataToSupabase, setupRealtimeSync } from './store.js';
import { initDashboard, renderDashboard, setDashboardMonth } from './dashboard.js';
import { initExpenses, renderExpenses, setExpensesMonth, handleExpenseDelete } from './expenses.js';
import { initIncomes, renderIncomes, setIncomesMonth, handleIncomeDelete } from './incomes.js';
import { initAuth, logout } from './auth.js';
import { $, $$, showToast } from './utils.js';

// ── App State ──
const now = new Date();
let globalYear = now.getFullYear();
let globalMonth = now.getMonth() + 1;

// ── Boot ──
async function boot() {

  // Initialize modules
  initDashboard(globalYear, globalMonth, onDashboardMonthChange);
  initExpenses(globalYear, globalMonth, onExpensesMonthChange);
  initIncomes(globalYear, globalMonth, onIncomesMonthChange);

  // Set up navigation
  setupNavigation();

  // Set up modals
  setupModals();

  // Set up import/export
  setupImportExport();

  // Set up mobile menu
  setupMobileMenu();

  // Set up light/dark mode theme toggle
  setupThemeToggle();

  // Set up logout button handler
  const logoutBtn = $('#nav-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  // Listen for data changes (from any module)
  window.addEventListener('data-changed', () => {
    renderDashboard();
    renderExpenses();
    renderIncomes();
  });

  // Initialize Supabase Auth
  initAuth(async (user) => {
    showToast('Bienvenido al sistema', 'success');
    
    // La nube (Supabase) es la única fuente de la verdad al iniciar sesión.
    // Descargamos los datos y sobrescribimos lo local.
    const synced = await syncWithSupabase();
    if (synced) {
      showToast('Datos descargados de la nube', 'success');
    }
    
    // Setup Realtime Synchronization
    setupRealtimeSync();
    
    // Initial render after syncing
    renderDashboard();
    renderExpenses();
    renderIncomes();
  });
}

// ── Navigation ──
function setupNavigation() {
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const section = item.dataset.section;
      if (section) {
        e.preventDefault();
        navigateTo(section);
      }
    });
  });
}

function navigateTo(sectionName) {
  if (!sectionName) return;

  // Update nav
  $$('.nav-item').forEach(n => {
    if (n.dataset.section) {
      n.classList.remove('active');
    }
  });
  const navEl = $(`[data-section="${sectionName}"]`);
  if (navEl) navEl.classList.add('active');

  // Update sections
  $$('.section').forEach(s => s.classList.remove('active'));
  const secEl = $(`#section-${sectionName}`);
  if (secEl) secEl.classList.add('active');

  // Close mobile menu
  $('#sidebar').classList.remove('open');

  // Update title
  const titles = {
    dashboard: 'Dashboard | Flujo de Caja',
    expenses: 'Gastos | Flujo de Caja',
    incomes: 'Ingresos | Flujo de Caja'
  };
  document.title = titles[sectionName] || 'Flujo de Caja';
}

// ── Month Change Callbacks ──
function onDashboardMonthChange(year, month) {
  // Dashboard month changes independently
}

function onExpensesMonthChange(year, month) {
  // Expenses month changes independently
}

function onIncomesMonthChange(year, month) {
  // Incomes month changes independently
}

// ── Modals ──
function setupModals() {
  // Main modal close handlers
  const modalOverlay = $('#modal-overlay');
  const modalClose = $('#modal-close');
  const modalCancel = $('#modal-cancel');

  const closeModal = () => {
    modalOverlay.classList.remove('active');
    // Remove any pending form handler
    const form = $('#modal-form');
    const modal = $('#modal');
    if (modal._currentHandler) {
      form.removeEventListener('submit', modal._currentHandler);
      modal._currentHandler = null;
    }
  };

  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);

  // Confirm delete modal
  const confirmOverlay = $('#confirm-overlay');
  const confirmCancel = $('#confirm-cancel');
  const confirmDelete = $('#confirm-delete');

  confirmCancel.addEventListener('click', () => {
    confirmOverlay.classList.remove('active');
    window._pendingDelete = null;
  });

  confirmDelete.addEventListener('click', () => {
    const pending = window._pendingDelete;
    if (pending) {
      if (pending.type === 'expense') {
        handleExpenseDelete(pending.id, pending.year, pending.month);
      } else if (pending.type === 'income') {
        handleIncomeDelete(pending.id, pending.year, pending.month);
      }
      window._pendingDelete = null;
    }
    confirmOverlay.classList.remove('active');
  });

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      confirmOverlay.classList.remove('active');
      window._pendingDelete = null;
    }
  });
}

// ── Import / Export ──
function setupImportExport() {
  const fileInput = $('#file-input');

  $('#btn-import').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const success = await importData(evt.target.result);
        if (success) {
          showToast('Datos importados exitosamente', 'success');
          renderDashboard();
          renderExpenses();
          renderIncomes();
        } else {
          showToast('Error: formato de archivo inválido', 'error');
        }
      } catch (err) {
        showToast('Error al importar: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    fileInput.value = ''; // Reset
  });

  $('#btn-export').addEventListener('click', () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flujo-de-caja-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Datos exportados exitosamente', 'info');
  });
}

// ── Mobile Menu ──
function setupMobileMenu() {
  const toggle = $('#mobile-toggle');
  const sidebar = $('#sidebar');

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 900 &&
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target !== toggle &&
        !toggle.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}

// ── Theme Toggle ──
function setupThemeToggle() {
  const toggleBtn = $('#btn-theme-toggle');
  if (!toggleBtn) return;

  const sunIcon = toggleBtn.querySelector('.sun-icon');
  const moonIcon = toggleBtn.querySelector('.moon-icon');
  const label = $('#theme-toggle-label');

  // Load saved theme or default to dark
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'inline-block';
    label.textContent = 'Modo Oscuro';
  } else {
    document.body.classList.remove('light-mode');
    sunIcon.style.display = 'inline-block';
    moonIcon.style.display = 'none';
    label.textContent = 'Modo Claro';
  }

  toggleBtn.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-mode');
    if (isLight) {
      localStorage.setItem('theme', 'light');
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'inline-block';
      label.textContent = 'Modo Oscuro';
      showToast('Cambiado a modo claro', 'info');
    } else {
      localStorage.setItem('theme', 'dark');
      sunIcon.style.display = 'inline-block';
      moonIcon.style.display = 'none';
      label.textContent = 'Modo Claro';
      showToast('Cambiado a modo oscuro', 'info');
    }
    // Re-render dashboard to update Chart.js labels/grid lines for the new theme
    renderDashboard();
  });
}

// ── Automatic cloud sync on focus/visibility change ──
let isSyncing = false;
async function handleForegroundSync() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const synced = await syncWithSupabase();
    if (synced) {
      showToast('Datos sincronizados con la nube', 'info');
      renderDashboard();
      renderExpenses();
      renderIncomes();
    }
  } finally {
    isSyncing = false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    handleForegroundSync();
  }
});

window.addEventListener('focus', () => {
  handleForegroundSync();
});

window.addEventListener('online', () => {
  handleForegroundSync();
});

// ── Start ──
document.addEventListener('DOMContentLoaded', boot);
