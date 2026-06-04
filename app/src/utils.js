// ============================================================
// Utility functions for the Flujo de Caja app
// ============================================================

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_NAMES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

/**
 * Generate a UUID v4
 */
export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/**
 * Format a number as currency (USD)
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0);
}

/**
 * Format a date string (YYYY-MM-DD) to localized display
 */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/**
 * Get month name from 1-indexed month number
 */
export function getMonthName(month) {
  return MONTH_NAMES[month - 1] || '';
}

/**
 * Get short month name from 1-indexed month number
 */
export function getMonthNameShort(month) {
  return MONTH_NAMES_SHORT[month - 1] || '';
}

/**
 * Format "YYYY-MM" key to human-readable label
 */
export function formatMonthLabel(year, month) {
  return `${getMonthName(month)} ${year}`;
}

/**
 * Get a YYYY-MM key from year and month
 */
export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Parse a month key "YYYY-MM" to { year, month }
 */
export function parseMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m };
}

/**
 * Navigate months: go to prev/next month
 */
export function navigateMonth(year, month, direction) {
  let m = month + direction;
  let y = year;
  if (m > 12) { m = 1; y++; }
  if (m < 1) { m = 12; y--; }
  return { year: y, month: m };
}

/**
 * Get the last N month keys ending at (year, month)
 */
export function getLastNMonthKeys(year, month, n) {
  const keys = [];
  let y = year, m = month;
  for (let i = 0; i < n; i++) {
    keys.unshift(monthKey(y, m));
    const prev = navigateMonth(y, m, -1);
    y = prev.year;
    m = prev.month;
  }
  return keys;
}

/**
 * Calculate percentage change between two values
 */
export function percentChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Show toast notification
 */
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
  };

  toast.innerHTML = `<span>${icons[type] || '•'}</span> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Simple DOM helper - query selector shortcut
 */
export function $(selector) {
  return document.querySelector(selector);
}

/**
 * Simple DOM helper - query selector all shortcut
 */
export function $$(selector) {
  return document.querySelectorAll(selector);
}

/**
 * Create an HTML element from a template string
 */
export function createElement(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

/**
 * Color palette for charts
 */
export const CHART_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E',
  '#F59E0B', '#10B981', '#3B82F6', '#06B6D4',
  '#14B8A6', '#84CC16', '#EAB308', '#F97316',
  '#A855F7', '#D946EF', '#0EA5E9', '#22D3EE'
];

/**
 * Get today's date as YYYY-MM-DD
 */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
