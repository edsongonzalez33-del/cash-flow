// ============================================================
// Data Store - localStorage persistence & Supabase cloud sync
// ============================================================
import { uuid, monthKey, todayISO, showToast } from './utils.js';
import { supabase } from './supabase.js';

const STORAGE_KEY = 'flujoDeCaja_data';
const SEED_VERSION_KEY = 'flujoDeCaja_seedVersion';
const CURRENT_SEED_VERSION = 6; // Bump this to force re-import of seed data

function checkAuthError(error) {
  if (!error) return;
  const msg = (error.message || '').toLowerCase();
  if (error.status === 401 || error.status === 403 || msg.includes('jwt') || msg.includes('token') || msg.includes('invalid user') || msg.includes('unauthorized') || msg.includes('invalid claim')) {
    console.warn('Auth token expired or invalid, triggering logout event');
    window.dispatchEvent(new CustomEvent('auth-expired'));
  }
}

/**
 * Internal data structure (localStorage Cache):
 * {
 *   expenses: { "YYYY-MM": [ { id, date, concept, amount, type }, ... ] },
 *   incomes:  { "YYYY-MM": [ { id, date, company, amount, notes }, ... ] }
 * }
 */

// ── DATABASE MAPPERS (camelCase to snake_case & vice-versa) ──

function mapExpenseToDB(exp, userId) {
  return {
    id: exp.id,
    user_id: userId,
    date: exp.date,
    concept: exp.concept,
    amount: exp.amount,
    amount_bs: exp.amountBs || 0,
    exchange_rate: exp.exchangeRate || 0,
    type: exp.type || 'variable',
    notes: exp.notes || ''
  };
}

function mapExpenseFromDB(db) {
  return {
    id: db.id,
    date: db.date,
    concept: db.concept,
    amount: parseFloat(db.amount || 0),
    amountBs: parseFloat(db.amount_bs || 0),
    exchangeRate: parseFloat(db.exchange_rate || 0),
    type: db.type || 'variable',
    notes: db.notes || ''
  };
}

function mapIncomeToDB(inc, userId) {
  return {
    id: inc.id,
    user_id: userId,
    date: inc.date,
    company: inc.company,
    amount: inc.amount,
    amount_bs: inc.amountBs || 0,
    exchange_rate: inc.exchangeRate || 0,
    notes: inc.notes || '',
    commission_active: !!inc.commissionActive,
    commission_recipient: inc.commissionRecipient || '',
    commission_status: inc.commissionStatus || 'pendiente',
    commission_amount: inc.commissionAmount || 0,
    commission_pct: inc.commissionPct || 0
  };
}

function mapIncomeFromDB(db) {
  return {
    id: db.id,
    date: db.date,
    company: db.company,
    amount: parseFloat(db.amount || 0),
    amountBs: parseFloat(db.amount_bs || 0),
    exchangeRate: parseFloat(db.exchange_rate || 0),
    notes: db.notes || '',
    commissionActive: !!db.commission_active,
    commissionRecipient: db.commission_recipient || '',
    commissionStatus: db.commission_status || 'pendiente',
    commissionAmount: parseFloat(db.commission_amount || 0),
    commissionPct: parseFloat(db.commission_pct || 0)
  };
}

// ── SUPABASE CLOUD SYNC OPERATIONS ──

/**
 * Downloads and rebuilds the local cache using data fetched from Supabase tables
 */
export async function syncWithSupabase() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const userId = session.user.id;

    // 1. Fetch incomes
    const { data: dbIncomes, error: incError } = await supabase
      .from('incomes')
      .select('*')
      .eq('user_id', userId);

    if (incError) {
      console.error('Error syncing incomes:', incError);
      checkAuthError(incError);
      return false;
    }

    // 2. Fetch expenses
    const { data: dbExpenses, error: expError } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId);

    if (expError) {
      console.error('Error syncing expenses:', expError);
      checkAuthError(expError);
      return false;
    }

    // 3. Clear local storage cache and rebuild
    const store = { expenses: {}, incomes: {} };

    for (const dbInc of dbIncomes) {
      const inc = mapIncomeFromDB(dbInc);
      const [y, m] = inc.date.split('-').map(Number);
      const key = monthKey(y, m);
      if (!store.incomes[key]) store.incomes[key] = [];
      store.incomes[key].push(inc);
    }

    for (const dbExp of dbExpenses) {
      const exp = mapExpenseFromDB(dbExp);
      const [y, m] = exp.date.split('-').map(Number);
      const key = monthKey(y, m);
      if (!store.expenses[key]) store.expenses[key] = [];
      store.expenses[key].push(exp);
    }

    saveStore(store);
    return true;
  } catch (err) {
    console.error('Failed to sync with Supabase:', err);
    return false;
  }
}

/**
 * Uploads all pre-existing local data to Supabase database (migration helper)
 */
export async function uploadLocalDataToSupabase() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const userId = session.user.id;
  const store = getStore();

  // 1. Upload incomes
  const incomesToUpload = [];
  for (const incomesList of Object.values(store.incomes)) {
    for (const inc of incomesList) {
      if (inc && inc.date && inc.company && inc.amount !== undefined && inc.amount !== null) {
        incomesToUpload.push(mapIncomeToDB(inc, userId));
      }
    }
  }

  const chunkSize = 100;
  for (let i = 0; i < incomesToUpload.length; i += chunkSize) {
    const chunk = incomesToUpload.slice(i, i + chunkSize);
    const { error } = await supabase.from('incomes').upsert(chunk);
    if (error) {
      console.error('Error uploading local incomes chunk:', error);
      throw new Error('Error al subir ingresos locales: ' + error.message);
    }
  }

  // 2. Upload expenses
  const expensesToUpload = [];
  for (const expensesList of Object.values(store.expenses)) {
    for (const exp of expensesList) {
      if (exp && exp.date && exp.concept && exp.amount !== undefined && exp.amount !== null) {
        expensesToUpload.push(mapExpenseToDB(exp, userId));
      }
    }
  }

  for (let i = 0; i < expensesToUpload.length; i += chunkSize) {
    const chunk = expensesToUpload.slice(i, i + chunkSize);
    const { error } = await supabase.from('expenses').upsert(chunk);
    if (error) {
      console.error('Error uploading local expenses chunk:', error);
      throw new Error('Error al subir gastos locales: ' + error.message);
    }
  }
}

// ── NORMALIZATION HELPERS ──

function normalizeConceptStr(concept) {
  if (!concept) return '';
  const trimmed = concept.trim();
  const lower = trimmed.toLowerCase();

  // 0. Check commissions first to prevent collision with payroll normalization
  if (lower.includes('comision') || lower.includes('comisión') || lower.includes('comisiones') || lower.includes('3ros')) {
    if (lower.includes('hortencia')) {
      return 'Comisiones 3ros (María Hortencia)';
    }
    if (lower.includes('freder') || lower.includes('freddy')) {
      return 'Comisiones 3ros (Freddy)';
    }
    if (lower.includes('luisa')) {
      return 'Comisiones 3ros (Luisa Velásquez)';
    }
    if (lower.includes('zitiu')) {
      return 'Comisiones 3ros (Zitiu)';
    }
    if (lower.includes('esmyll') || lower.includes('león') || lower.includes('leon')) {
      return 'Comisiones 3ros (Esmyll León)';
    }
    return trimmed;
  }

  // 1. Check payroll (Nómina) first using fuzzy includes
  if (lower.includes('berelitza') || lower.includes('bere')) {
    return 'Nómina: Berelitza';
  }
  if (lower.includes('hortencia')) {
    return 'Nómina: María Hortencia';
  }
  if (lower.includes('romero')) {
    return 'Nómina: Víctor Romero';
  }

  // 2. Check Elinor and Victoria
  if (lower.includes('elinor') || lower.includes('elinar')) {
    return 'Elinor';
  }
  if (lower.includes('victoria')) {
    return 'Victoria';
  }

  // 3. Other standardizations
  if (lower.includes('ariadna')) return 'Ariadna Yoga';
  if (lower.includes('audio place')) return 'Audio Place';
  if (lower.includes('dgboss') || lower.includes('dg boss')) return 'DGBoss';
  if (lower.includes('fondo super viaje')) return 'Fondo Super Viaje';
  if (lower.includes('gasolina')) return 'Gasolina';

  if (lower === 'inter' || lower === 'internet') return 'Internet';
  if (lower.includes('internet caracas')) return 'Internet Caracas';
  if (lower.includes('internet valencia')) return 'Internet Valencia';

  if (lower.includes('luz/agua/cantv') || lower.includes('servicios basicos') || lower.includes('servicios básicos')) {
    return 'Servicios Básicos';
  }

  if (lower.includes('navideño') || lower.includes('navideo')) return 'Mercado Navideño';
  if (lower.includes('navas')) return 'Profesor Navas';

  // Pólizas
  const isPoliza = lower.includes('póliza') || lower.includes('poliza') || lower.includes('pòliza');
  if (lower.includes('diana') && isPoliza) return 'Póliza Diana';
  if (lower.includes('edson') && isPoliza) return 'Póliza Edson';
  if (lower.includes('rosalicia') && isPoliza) return 'Póliza Rosalicia';
  if (lower.includes('spark') && isPoliza) return 'Póliza Spark';
  if (lower.includes('carlos') && isPoliza) return 'Póliza Carlos';
  if (lower.includes('corolla') && isPoliza) return 'Póliza Corolla';
  if ((lower.includes('rafa') || lower.includes('rafael')) && isPoliza) return 'Póliza Rafael';
  
  if (lower.includes('espe y rafa') || lower.includes('rafa y espe')) return 'Pólizas Rafa y Espe';

  if (lower.includes('ahorro') && lower.includes('extra')) return 'Póliza Ahorro (Extra)';
  if (lower.includes('ahorro') && lower.includes('x 2')) return 'Póliza Ahorro x 2';
  if (lower.includes('ahorro') && (isPoliza || lower.includes('de ahorro'))) return 'Póliza Ahorro';

  if (lower.includes('reparación spark') || lower.includes('reparacion spark')) return 'Reparación Spark';

  if (lower.includes('sra') || lower.includes('maria') || lower.includes('marìa')) {
    return 'Sra. María';
  }

  if (lower === 'mercado') return 'Mercado';

  return trimmed;
}

function normalizeCompanyStr(company) {
  if (!company) return '';
  const trimmed = company.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes('caracas')) return 'Caracas';
  if (lower.includes('constitucion') || lower.includes('constitu')) return 'Constitución';
  if (lower === 'loyal') return 'Loyal';

  if (lower.includes('mercantil p') || lower.includes('mercantil panam')) {
    return 'Mercantil Panamá';
  } else if (lower.includes('mercantil')) {
    return 'Mercantil';
  }

  if (lower.includes('oceanica') || lower.includes('oce nica') || lower.includes('oceánica')) {
    return 'Oceánica';
  }

  if (lower.includes('olė') || lower.includes('ole') || lower.includes('olé')) {
    return 'Olé Life';
  }

  if (lower.includes('universitas')) return 'Universitas';

  if (lower.includes('world medic')) return 'World Medic Assist';

  // Capitalize first letter of other common single words if appropriate
  if (lower === 'asistensi') return 'Asistensi';
  if (lower === 'bmi') return 'BMI';
  if (lower === 'best doctors') return 'Best Doctors';
  if (lower === 'best travel') return 'Best Travel';
  if (lower === 'ever') return 'Ever';
  if (lower === 'gbg') return 'GBG';
  if (lower === 'hispana') return 'Hispana';
  if (lower === 'investor trust') return 'Investor Trust';
  if (lower === 'la internacional') return 'La Internacional';
  if (lower === 'la mundial') return 'La Mundial';
  if (lower === 'pirámide' || lower === 'piramide') return 'Pirámide';
  if (lower === 'planisalud') return 'Planisalud';
  if (lower === 'proseguros') return 'Proseguros';
  if (lower === 'qualitas') return 'Qualitas';
  if (lower === 'red bridge') return 'Red Bridge';
  if (lower === 'trawick') return 'Trawick';
  if (lower === 'uniseguros') return 'Uniseguros';
  if (lower === 'venezuela') return 'Venezuela';
  if (lower === 'vumi') return 'Vumi';

  return trimmed;
}

function migrateAndNormalizeStore(store) {
  let migrated = false;
  
  if (store.expenses) {
    for (const [monthKey, list] of Object.entries(store.expenses)) {
      for (const e of list) {
        if (!e.concept) continue;
        
        let changed = false;
        const lowerNotes = (e.notes || '').toLowerCase();
        
        // Corrección de registros históricos erróneamente normalizados como nómina
        if (e.concept === 'Nómina: María Hortencia' && (e.type === 'variable' || lowerNotes.includes('[id-ingreso:'))) {
          e.concept = 'Comisiones 3ros (María Hortencia)';
          changed = true;
          migrated = true;
        }

        const oldConcept = e.concept;
        const normalized = normalizeConceptStr(oldConcept);
        if (normalized !== oldConcept) {
          e.concept = normalized;
          changed = true;
          migrated = true;
        }

        if (changed) {
          // Sincronizar corrección en Supabase en segundo plano
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
              const dbRow = mapExpenseToDB(e, session.user.id);
              supabase.from('expenses').upsert(dbRow).then(({ error }) => {
                if (error) console.error('Error syncing migrated expense:', error);
              });
            }
          });
        }
      }
    }
  }

  if (store.incomes) {
    for (const [monthKey, list] of Object.entries(store.incomes)) {
      for (const i of list) {
        if (!i.company) continue;
        const oldCompany = i.company;
        const normalized = normalizeCompanyStr(oldCompany);
        if (normalized !== oldCompany) {
          i.company = normalized;
          migrated = true;
        }
      }
    }
  }

  return migrated;
}

function getStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const store = JSON.parse(raw);
      if (migrateAndNormalizeStore(store)) {
        saveStore(store);
      }
      return store;
    }
  } catch (e) {
    console.error('Error reading store:', e);
  }
  return { expenses: {}, incomes: {} };
}

function saveStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving store:', e);
  }
}

/**
 * Clears the local cache completely (e.g. on logout)
 */
export function clearLocalCache() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if the store has any data
 */
export function hasData() {
  const store = getStore();
  return Object.keys(store.expenses).length > 0 || Object.keys(store.incomes).length > 0;
}

// ── EXPENSES CRUD ──

export function getExpenses(year, month) {
  const store = getStore();
  const key = monthKey(year, month);
  const items = store.expenses[key] || [];
  return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function addExpense(year, month, expense) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showToast('Sesión no activa. Inicia sesión para guardar.', 'error');
    throw new Error('Sesión no activa');
  }

  const entry = { id: uuid(), ...expense };
  const dbRow = mapExpenseToDB(entry, session.user.id);
  const { error } = await supabase.from('expenses').insert(dbRow);
  if (error) {
    console.error('Error syncing addExpense:', error);
    checkAuthError(error);
    showToast('Error de conexión: No se pudo guardar el gasto en la nube.', 'error');
    throw error;
  }

  const store = getStore();
  const [y, m] = expense.date.split('-').map(Number);
  const key = monthKey(y, m);
  if (!store.expenses[key]) store.expenses[key] = [];
  store.expenses[key].push(entry);
  saveStore(store);

  return entry;
}

export async function updateExpense(year, month, id, updates) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showToast('Sesión no activa. Inicia sesión para guardar.', 'error');
    throw new Error('Sesión no activa');
  }

  const store = getStore();
  let key = monthKey(year, month);
  let list = store.expenses[key] || [];
  let idx = list.findIndex(e => e.id === id);

  if (idx === -1) {
    for (const [k, l] of Object.entries(store.expenses)) {
      const i = l.findIndex(e => e.id === id);
      if (i !== -1) {
        key = k;
        list = l;
        idx = i;
        break;
      }
    }
  }

  if (idx !== -1) {
    const original = list[idx];
    const updated = { ...original, ...updates };

    const dbRow = mapExpenseToDB(updated, session.user.id);
    const { error } = await supabase.from('expenses').upsert(dbRow);
    if (error) {
      console.error('Error syncing updateExpense:', error);
      checkAuthError(error);
      showToast('Error de conexión: No se pudo actualizar en la nube.', 'error');
      throw error;
    }

    const [origY, origM] = original.date.split('-').map(Number);
    const [updY, updM] = updated.date.split('-').map(Number);

    if (origY !== updY || origM !== updM) {
      list.splice(idx, 1);
      if (list.length === 0) delete store.expenses[key];

      const newKey = monthKey(updY, updM);
      if (!store.expenses[newKey]) store.expenses[newKey] = [];
      store.expenses[newKey].push(updated);
    } else {
      list[idx] = updated;
    }

    saveStore(store);
    return updated;
  }
  return null;
}

export async function deleteExpense(year, month, id) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showToast('Sesión no activa. Inicia sesión para borrar.', 'error');
    throw new Error('Sesión no activa');
  }

  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) {
    console.error('Error syncing deleteExpense:', error);
    checkAuthError(error);
    showToast('Error de conexión: No se pudo eliminar en la nube.', 'error');
    throw error;
  }

  const store = getStore();
  let key = monthKey(year, month);
  let list = store.expenses[key] || [];
  let idx = list.findIndex(e => e.id === id);

  if (idx === -1) {
    for (const [k, l] of Object.entries(store.expenses)) {
      const i = l.findIndex(e => e.id === id);
      if (i !== -1) {
        key = k;
        list = l;
        idx = i;
        break;
      }
    }
  }

  if (idx !== -1) {
    list.splice(idx, 1);
    if (list.length === 0) delete store.expenses[key];
    saveStore(store);
  }
}

/**
 * Sincroniza el gasto de comisión asociado a un ingreso en localStorage y Supabase
 */
async function syncCommissionExpense(income) {
  const store = getStore();
  const incomeId = income.id;
  const tag = `[ID-Ingreso: ${incomeId}]`;
  
  // Buscar si ya existe un gasto con este tag en todo el store
  let foundExpense = null;
  let foundMonthKey = null;
  let foundIdx = -1;

  for (const [mKey, expensesList] of Object.entries(store.expenses)) {
    const idx = expensesList.findIndex(e => e.notes && e.notes.includes(tag));
    if (idx !== -1) {
      foundExpense = expensesList[idx];
      foundMonthKey = mKey;
      foundIdx = idx;
      break;
    }
  }

  const isCommissionPaid = income.commissionActive && income.commissionStatus === 'pagado' && (income.commissionAmount || 0) > 0;

  const { data: { session } } = await supabase.auth.getSession();

  if (isCommissionPaid) {
    const recipient = income.commissionRecipient || 'Tercero';
    const commAmount = parseFloat(income.commissionAmount || 0);
    const rate = parseFloat(income.exchangeRate || 0);
    const amountBs = commAmount * rate;
    const [y, m] = income.date.split('-').map(Number);
    const targetMonthKey = monthKey(y, m);

    const expenseData = {
      date: income.date,
      concept: `Comisiones 3ros (${recipient})`,
      amount: commAmount,
      exchangeRate: rate,
      amountBs: amountBs,
      type: 'variable',
      notes: `Pago comisión a ${recipient} por ingreso de ${income.company}. Tasa: ${rate.toFixed(2)} ${tag}`
    };

    if (foundExpense) {
      // Actualizar el gasto existente
      const updatedExpense = { ...foundExpense, ...expenseData };
      
      if (session) {
        const dbRow = mapExpenseToDB(updatedExpense, session.user.id);
        const { error } = await supabase.from('expenses').upsert(dbRow);
        if (error) {
          console.error('Error syncing updated commission expense:', error);
          checkAuthError(error);
          showToast('Error al actualizar comisión en la nube.', 'error');
          throw error;
        }
      }

      if (foundMonthKey !== targetMonthKey) {
        // Mover de mes
        store.expenses[foundMonthKey].splice(foundIdx, 1);
        if (store.expenses[foundMonthKey].length === 0) {
          delete store.expenses[foundMonthKey];
        }
        if (!store.expenses[targetMonthKey]) {
          store.expenses[targetMonthKey] = [];
        }
        store.expenses[targetMonthKey].push(updatedExpense);
      } else {
        // Actualizar en el mismo mes
        store.expenses[foundMonthKey][foundIdx] = updatedExpense;
      }
      
      saveStore(store);
    } else {
      // Crear un nuevo gasto
      const newExpense = {
        id: uuid(),
        ...expenseData
      };
      
      if (session) {
        const dbRow = mapExpenseToDB(newExpense, session.user.id);
        const { error } = await supabase.from('expenses').insert(dbRow);
        if (error) {
          console.error('Error syncing new commission expense:', error);
          checkAuthError(error);
          showToast('Error al guardar comisión en la nube.', 'error');
          throw error;
        }
      }

      if (!store.expenses[targetMonthKey]) {
        store.expenses[targetMonthKey] = [];
      }
      store.expenses[targetMonthKey].push(newExpense);
      saveStore(store);
    }
  } else {
    // Si no está pagada o no está activa, pero existía un gasto previo, lo eliminamos
    if (foundExpense) {
      if (session) {
        const { error } = await supabase.from('expenses').delete().eq('id', foundExpense.id);
        if (error) {
          console.error('Error syncing deleted commission expense:', error);
          checkAuthError(error);
          showToast('Error al eliminar comisión en la nube.', 'error');
          throw error;
        }
      }

      store.expenses[foundMonthKey].splice(foundIdx, 1);
      if (store.expenses[foundMonthKey].length === 0) {
        delete store.expenses[foundMonthKey];
      }
      saveStore(store);
    }
  }
}

// ── INCOMES CRUD ──

export function getIncomes(year, month) {
  const store = getStore();
  const key = monthKey(year, month);
  const items = store.incomes[key] || [];
  return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function addIncome(year, month, income) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showToast('Sesión no activa. Inicia sesión para guardar.', 'error');
    throw new Error('Sesión no activa');
  }

  const entry = { id: uuid(), ...income };
  const dbRow = mapIncomeToDB(entry, session.user.id);
  const { error } = await supabase.from('incomes').insert(dbRow);
  if (error) {
    console.error('Error syncing addIncome:', error);
    checkAuthError(error);
    showToast('Error de conexión: No se pudo guardar el ingreso en la nube.', 'error');
    throw error;
  }

  const store = getStore();
  const [y, m] = income.date.split('-').map(Number);
  const key = monthKey(y, m);
  if (!store.incomes[key]) store.incomes[key] = [];
  store.incomes[key].push(entry);
  saveStore(store);

  // Sincronizar el gasto de comisión correspondiente si aplica
  await syncCommissionExpense(entry);

  return entry;
}

export async function updateIncome(year, month, id, updates) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showToast('Sesión no activa. Inicia sesión para guardar.', 'error');
    throw new Error('Sesión no activa');
  }

  const store = getStore();
  let key = monthKey(year, month);
  let list = store.incomes[key] || [];
  let idx = list.findIndex(e => e.id === id);

  if (idx === -1) {
    for (const [k, l] of Object.entries(store.incomes)) {
      const i = l.findIndex(e => e.id === id);
      if (i !== -1) {
        key = k;
        list = l;
        idx = i;
        break;
      }
    }
  }

  if (idx !== -1) {
    const original = list[idx];
    const updated = { ...original, ...updates };

    const dbRow = mapIncomeToDB(updated, session.user.id);
    const { error } = await supabase.from('incomes').upsert(dbRow);
    if (error) {
      console.error('Error syncing updateIncome:', error);
      checkAuthError(error);
      showToast('Error de conexión: No se pudo actualizar en la nube.', 'error');
      throw error;
    }

    const [origY, origM] = original.date.split('-').map(Number);
    const [updY, updM] = updated.date.split('-').map(Number);

    if (origY !== updY || origM !== updM) {
      list.splice(idx, 1);
      if (list.length === 0) delete store.incomes[key];

      const newKey = monthKey(updY, updM);
      if (!store.incomes[newKey]) store.incomes[newKey] = [];
      store.incomes[newKey].push(updated);
    } else {
      list[idx] = updated;
    }

    saveStore(store);

    // Sincronizar el gasto de comisión correspondiente si aplica
    await syncCommissionExpense(updated);

    return updated;
  }
  return null;
}

export async function deleteIncome(year, month, id) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showToast('Sesión no activa. Inicia sesión para borrar.', 'error');
    throw new Error('Sesión no activa');
  }

  const { error } = await supabase.from('incomes').delete().eq('id', id);
  if (error) {
    console.error('Error syncing deleteIncome:', error);
    checkAuthError(error);
    showToast('Error de conexión: No se pudo eliminar en la nube.', 'error');
    throw error;
  }

  const store = getStore();
  let key = monthKey(year, month);
  let list = store.incomes[key] || [];
  let idx = list.findIndex(e => e.id === id);

  if (idx === -1) {
    for (const [k, l] of Object.entries(store.incomes)) {
      const i = l.findIndex(e => e.id === id);
      if (i !== -1) {
        key = k;
        list = l;
        idx = i;
        break;
      }
    }
  }

  if (idx !== -1) {
    const income = list[idx];
    list.splice(idx, 1);
    if (list.length === 0) delete store.incomes[key];
    saveStore(store);
    
    // Forzar la eliminación de cualquier gasto de comisión asociado
    await syncCommissionExpense({ ...income, commissionActive: false });
  }
}

// ── COMMISSIONS ──

export function getPendingCommissions() {
  const store = getStore();
  let total = 0;
  const list = [];
  for (const [monthKey, incomesList] of Object.entries(store.incomes)) {
    for (const income of incomesList) {
      if (income.commissionActive && income.commissionStatus === 'pendiente') {
        const amt = parseFloat(income.commissionAmount || 0);
        total += amt;
        list.push({
          id: income.id,
          monthKey: monthKey,
          date: income.date,
          company: income.company,
          recipient: income.commissionRecipient,
          amount: amt
        });
      }
    }
  }
  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return {
    total,
    list
  };
}

export function getPaidCommissions() {
  const store = getStore();
  let total = 0;
  const list = [];
  for (const [monthKey, incomesList] of Object.entries(store.incomes)) {
    for (const income of incomesList) {
      if (income.commissionActive && income.commissionStatus === 'pagado') {
        const amt = parseFloat(income.commissionAmount || 0);
        total += amt;
        list.push({
          id: income.id,
          monthKey: monthKey,
          date: income.date,
          company: income.company,
          recipient: income.commissionRecipient,
          amount: amt
        });
      }
    }
  }
  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return {
    total,
    list
  };
}

export async function payCommission(incomeId, ratePaid) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showToast('Sesión no activa. Inicia sesión para pagar.', 'error');
    throw new Error('Sesión no activa');
  }

  const store = getStore();
  let foundIncome = null;
  let foundMonthKey = null;

  for (const [mKey, incomesList] of Object.entries(store.incomes)) {
    const idx = incomesList.findIndex(i => i.id === incomeId);
    if (idx !== -1) {
      foundIncome = incomesList[idx];
      foundMonthKey = mKey;
      break;
    }
  }

  if (!foundIncome) {
    throw new Error('Ingreso no encontrado');
  }

  const originalIncome = { ...foundIncome };
  foundIncome.commissionStatus = 'pagado';
  const oldRate = foundIncome.exchangeRate;
  const oldAmountBs = foundIncome.amountBs;
  if (!foundIncome.exchangeRate || foundIncome.exchangeRate === 0) {
    foundIncome.exchangeRate = parseFloat(ratePaid) || 0;
    foundIncome.amountBs = foundIncome.amount * foundIncome.exchangeRate;
  }

  const dbRow = mapIncomeToDB(foundIncome, session.user.id);
  const { error } = await supabase.from('incomes').upsert(dbRow);
  if (error) {
    console.error('Error syncing payCommission income update:', error);
    checkAuthError(error);
    showToast('Error de conexión: No se pudo registrar el pago en la nube.', 'error');
    foundIncome.commissionStatus = originalIncome.commissionStatus;
    foundIncome.exchangeRate = oldRate;
    foundIncome.amountBs = oldAmountBs;
    throw error;
  }
  
  saveStore(store);

  // Sincronizar el gasto de comisión utilizando la nueva función enlazada
  try {
    await syncCommissionExpense(foundIncome);
  } catch (commErr) {
    console.error(commErr);
  }
  
  return foundIncome;
}

// ── AGGREGATIONS ──

export function getMonthTotals(year, month) {
  const expenses = getExpenses(year, month);
  const incomes = getIncomes(year, month);

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalIncomes = incomes.reduce((s, e) => s + (e.amount || 0), 0);
  const fixedExpenses = expenses.filter(e => (e.type || '').toLowerCase() === 'fijo')
    .reduce((s, e) => s + (e.amount || 0), 0);
  const variableExpenses = expenses.filter(e => (e.type || '').toLowerCase() === 'variable')
    .reduce((s, e) => s + (e.amount || 0), 0);

  return {
    totalExpenses,
    totalIncomes,
    fixedExpenses,
    variableExpenses,
    balance: totalIncomes - totalExpenses,
    expenseCount: expenses.length,
    incomeCount: incomes.length
  };
}

export function getAllConcepts() {
  const store = getStore();
  const concepts = new Set();
  for (const items of Object.values(store.expenses)) {
    for (const item of items) {
      if (item.concept) concepts.add(item.concept);
    }
  }
  return Array.from(concepts).sort();
}

export function getAllCompanies() {
  const store = getStore();
  const companies = new Set();
  for (const items of Object.values(store.incomes)) {
    for (const item of items) {
      if (item.company) companies.add(item.company);
    }
  }
  return Array.from(companies).sort();
}

export function getExpensesByConceptForMonth(year, month) {
  const expenses = getExpenses(year, month);
  const map = {};
  for (const e of expenses) {
    let key = e.concept || 'Otro';
    if (key.startsWith('Nómina')) {
      key = 'Nómina';
    } else if (key.startsWith('Póliza')) {
      key = 'Póliza';
    } else if (key.startsWith('Comisiones 3ros')) {
      key = 'Comisiones 3ros';
    }
    map[key] = (map[key] || 0) + (e.amount || 0);
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

export function getIncomesByCompanyForMonth(year, month) {
  const incomes = getIncomes(year, month);
  const map = {};
  for (const e of incomes) {
    const key = e.company || 'Otro';
    map[key] = (map[key] || 0) + (e.amount || 0);
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

export function getAvailableMonths() {
  const store = getStore();
  const keys = new Set([
    ...Object.keys(store.expenses),
    ...Object.keys(store.incomes)
  ]);
  return Array.from(keys).sort();
}

export function getRecentTransactions(year, month, limit = 8) {
  const expenses = getExpenses(year, month).map(e => ({
    ...e, _type: 'expense', _label: e.concept
  }));
  const incomes = getIncomes(year, month).map(e => ({
    ...e, _type: 'income', _label: e.company
  }));

  return [...expenses, ...incomes]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit);
}

// ── IMPORT / EXPORT ──

export async function importData(json) {
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || typeof data !== 'object') {
      throw new Error('El archivo no contiene un objeto JSON válido.');
    }

    const rawExpenses = data.expenses;
    const rawIncomes = data.incomes;

    if (!rawExpenses && !rawIncomes) {
      throw new Error('Formato inválido. El archivo debe contener la sección "expenses" y/o "incomes".');
    }

    const cleanExpenses = {};
    const cleanIncomes = {};

    // Helper para procesar un gasto individual de forma segura
    const processExpense = (item, expectedMonthKey = null) => {
      if (!item) return;
      if (item.date && item.concept && item.amount !== undefined && item.amount !== null) {
        let dateStr = String(item.date).trim();
        let parts = dateStr.split('-');
        if (parts.length >= 3 && expectedMonthKey) {
          const [expY, expM] = expectedMonthKey.split('-');
          // Si el mes en la fecha no coincide con el mes de la llave, 
          // asumimos que el día y el mes se invirtieron (YYYY-DD-MM).
          if (parts[1] !== expM && parts[2] === expM) {
            // Corregir fecha a YYYY-MM-DD
            dateStr = `${parts[0]}-${parts[2]}-${parts[1]}`;
            parts = dateStr.split('-');
          } else if (parts[0] !== expY || parts[1] !== expM) {
            // Si está totalmente desfasado, forzar al mes de la llave para no perderlo
            dateStr = `${expY}-${expM}-${parts[2]}`;
            parts = dateStr.split('-');
          }
        }
        
        if (parts.length >= 2) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          if (!isNaN(y) && !isNaN(m)) {
            const key = monthKey(y, m);
            if (!cleanExpenses[key]) cleanExpenses[key] = [];
            
            cleanExpenses[key].push({
              id: item.id || uuid(),
              date: dateStr,
              concept: normalizeConceptStr(item.concept),
              amount: parseFloat(item.amount) || 0,
              amountBs: parseFloat(item.amountBs || item.amount_bs || 0),
              exchangeRate: parseFloat(item.exchangeRate || item.exchange_rate || 0),
              type: item.type || 'variable',
              notes: item.notes || ''
            });
          }
        }
      }
    };

    // Helper para procesar un ingreso individual de forma segura
    const processIncome = (item, expectedMonthKey = null) => {
      if (!item) return;
      if (item.date && item.company && item.amount !== undefined && item.amount !== null) {
        let dateStr = String(item.date).trim();
        let parts = dateStr.split('-');
        if (parts.length >= 3 && expectedMonthKey) {
          const [expY, expM] = expectedMonthKey.split('-');
          if (parts[1] !== expM && parts[2] === expM) {
            dateStr = `${parts[0]}-${parts[2]}-${parts[1]}`;
            parts = dateStr.split('-');
          } else if (parts[0] !== expY || parts[1] !== expM) {
            dateStr = `${expY}-${expM}-${parts[2]}`;
            parts = dateStr.split('-');
          }
        }

        if (parts.length >= 2) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          if (!isNaN(y) && !isNaN(m)) {
            const key = monthKey(y, m);
            if (!cleanIncomes[key]) cleanIncomes[key] = [];
            
            cleanIncomes[key].push({
              id: item.id || uuid(),
              date: dateStr,
              company: normalizeCompanyStr(item.company),
              amount: parseFloat(item.amount) || 0,
              amountBs: parseFloat(item.amountBs || item.amount_bs || 0),
              exchangeRate: parseFloat(item.exchangeRate || item.exchange_rate || 0),
              notes: item.notes || '',
              commissionActive: !!(item.commissionActive || item.commission_active),
              commissionRecipient: item.commissionRecipient || item.commission_recipient || '',
              commissionStatus: item.commissionStatus || item.commission_status || 'pendiente',
              commissionAmount: parseFloat(item.commissionAmount || item.commission_amount || 0),
              commissionPct: parseFloat(item.commissionPct || item.commission_pct || 0)
            });
          }
        }
      }
    };

    // Procesar los gastos según la estructura que tengan
    if (rawExpenses) {
      if (Array.isArray(rawExpenses)) {
        for (const item of rawExpenses) {
          processExpense(item);
        }
      } else if (typeof rawExpenses === 'object') {
        for (const [mKey, list] of Object.entries(rawExpenses)) {
          if (Array.isArray(list)) {
            for (const item of list) {
              processExpense(item, mKey);
            }
          }
        }
      }
    }

    // Procesar los ingresos según la estructura que tengan
    if (rawIncomes) {
      if (Array.isArray(rawIncomes)) {
        for (const item of rawIncomes) {
          processIncome(item);
        }
      } else if (typeof rawIncomes === 'object') {
        for (const [mKey, list] of Object.entries(rawIncomes)) {
          if (Array.isArray(list)) {
            for (const item of list) {
              processIncome(item, mKey);
            }
          }
        }
      }
    }

    // Validar si al menos se importó un registro válido
    const totalExpenses = Object.values(cleanExpenses).reduce((acc, curr) => acc + curr.length, 0);
    const totalIncomes = Object.values(cleanIncomes).reduce((acc, curr) => acc + curr.length, 0);

    if (totalExpenses === 0 && totalIncomes === 0) {
      throw new Error('No se encontraron registros válidos de ingresos o gastos en el archivo.');
    }

    const cleanData = { expenses: cleanExpenses, incomes: cleanIncomes };
    saveStore(cleanData);

    // Sync imported data to Supabase in background without blocking the UI
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        try {
          const userId = session.user.id;
          // 1. Wipe remote tables first
          const { error: deleteIncomesError } = await supabase.from('incomes').delete().eq('user_id', userId);
          if (deleteIncomesError) {
            console.error('Error al limpiar ingresos en Supabase:', deleteIncomesError);
          }

          const { error: deleteExpensesError } = await supabase.from('expenses').delete().eq('user_id', userId);
          if (deleteExpensesError) {
            console.error('Error al limpiar gastos en Supabase:', deleteExpensesError);
          }

          // 2. Upload the clean backup data
          await uploadLocalDataToSupabase();
        } catch (syncError) {
          console.error("Cloud sync failed after import:", syncError);
        }
      }
    });
    
    return true;
  } catch (e) {
    console.error('Import error:', e);
    throw e;
  }
}

export function exportData() {
  return JSON.stringify(getStore(), null, 2);
}
