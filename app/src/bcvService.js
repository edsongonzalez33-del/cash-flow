const bcvApiUrl = import.meta.env.VITE_BCV_API_URL;
const bcvApiKey = import.meta.env.VITE_BCV_API_KEY;

/**
 * Fetches the current BCV exchange rate from the API.
 * @returns {Promise<{tasa: number, tasa_formateada: string} | null>}
 */
export async function fetchBcvRate() {
  if (!bcvApiUrl || !bcvApiKey) {
    console.error('BCV API configuration is missing in .env');
    return null;
  }

  try {
    const response = await fetch(bcvApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': bcvApiKey,
        'Authorization': `Bearer ${bcvApiKey}`
      }
    });

    if (!response.ok) {
      console.error('Failed to fetch BCV rate, status:', response.status);
      return null;
    }

    const data = await response.json();
    
    let bcvData = null;
    if (Array.isArray(data) && data.length > 0) {
      bcvData = data[0];
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      bcvData = data;
    }

    if (bcvData) {
      if (typeof bcvData.tasa === 'number') {
        bcvData.tasa = Number(bcvData.tasa.toFixed(2));
      } else if (typeof bcvData.tasa === 'string') {
        const parsed = parseFloat(bcvData.tasa.replace(',', '.'));
        if (!isNaN(parsed)) {
          bcvData.tasa = Number(parsed.toFixed(2));
        }
      }
      return bcvData;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching BCV rate:', error);
    return null;
  }
}
