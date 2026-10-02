const bcvApiUrl = import.meta.env.VITE_BCV_API_URL;
const bcvApiKey = import.meta.env.VITE_BCV_API_KEY;

/**
 * Checks if a given date string (YYYY-MM-DD) is reasonably fresh (within last 3 days).
 */
function isDateFresh(dateStr) {
  if (!dateStr) return false;
  try {
    const recordDate = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    const diffDays = (now - recordDate) / (1000 * 60 * 60 * 24);
    // Fresh if less than 3 days old (allows for weekends)
    return diffDays <= 3.5;
  } catch {
    return false;
  }
}

/**
 * Fetches the current BCV exchange rate with multi-source fallback.
 * @returns {Promise<{tasa: number, tasa_formateada: string, fuente?: string} | null>}
 */
export async function fetchBcvRate() {
  // 1. Primary: Custom Supabase RPC Endpoint
  if (bcvApiUrl && bcvApiKey) {
    try {
      const response = await fetch(bcvApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': bcvApiKey,
          'Authorization': `Bearer ${bcvApiKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        let bcvData = null;
        if (Array.isArray(data) && data.length > 0) {
          bcvData = data[0];
        } else if (data && typeof data === 'object' && !Array.isArray(data)) {
          bcvData = data;
        }

        if (bcvData) {
          let tasaNum = null;
          if (typeof bcvData.tasa === 'number') {
            tasaNum = Number(bcvData.tasa.toFixed(2));
          } else if (typeof bcvData.tasa === 'string') {
            const parsed = parseFloat(bcvData.tasa.replace(',', '.'));
            if (!isNaN(parsed)) tasaNum = Number(parsed.toFixed(2));
          }

          // If rate is valid and fresh, use it
          if (tasaNum && isDateFresh(bcvData.fecha_valor_fecha || bcvData.fecha)) {
            bcvData.tasa = tasaNum;
            return bcvData;
          }
        }
      }
    } catch (error) {
      console.warn('Primary BCV API failed, attempting fallback...', error);
    }
  }

  // 2. Fallback: DolarApi Oficial (High-availability BCV API)
  try {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if (res.ok) {
      const d = await res.json();
      const val = d.promedio || d.venta || d.compra;
      if (val) {
        const tasa = Number(Number(val).toFixed(2));
        return {
          moneda: 'USD',
          tasa: tasa,
          tasa_formateada: tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          fuente: 'BCV Oficial (DolarAPI)'
        };
      }
    }
  } catch (err) {
    console.warn('Fallback DolarAPI error:', err);
  }

  // 3. Fallback: PyDolar API
  try {
    const res = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar?page=bcv');
    if (res.ok) {
      const d = await res.json();
      const val = d?.monitors?.usd?.price;
      if (val) {
        const tasa = Number(Number(val).toFixed(2));
        return {
          moneda: 'USD',
          tasa: tasa,
          tasa_formateada: tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          fuente: 'BCV (PyDolar)'
        };
      }
    }
  } catch (err) {
    console.warn('Fallback PyDolar error:', err);
  }

  return null;
}
