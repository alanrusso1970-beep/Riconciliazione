/**
 * Parsing robusto di una riga CSV (gestisce campi tra virgolette e doppie virgolette).
 */
function parseCSVRow(text) {
  const row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Gestione doppie virgolette (escaped)
        cell += '"';
        i++; 
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  return row;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const params = url.searchParams;

  // L'URL di Google Apps Script può essere configurato nelle impostazioni di Cloudflare (Environment Variables)
  const GAS_URL = env.GAS_URL || "https://script.google.com/macros/s/AKfycbwaxTXHi4RXmgdTWMMWPnABqnxroWRbYNv6BsWWz73bvxeV_g56R7_yiZFbdl_WjOLa/exec";
  // File Anagrafica (Impianti)
  const STATION_SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/19dKi3T8Fhd8KdAFUSjEdLgKJzSJrsCIG/export?format=csv&gid=1663329432";

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Normalizzatore PBL
  const normalizePbl = (p) => (p || '').trim().replace(/^0+/, '') || (p || '').trim();

  // --- AZIONE: RECUPERO ANAGRAFICA IMPIANTO DAL CSV CON CACHING ---
  if (params.get('action') === 'get_station_csv') {
    const pbl = (params.get('pbl') || '').trim();
    try {
      const cacheKey = new Request(new URL(request.url).origin + '/api/static_station_csv');
      const cache = caches.default;
      let cachedResponse = await cache.match(cacheKey).catch(() => null);
      let csvText;

      if (cachedResponse) {
        csvText = await cachedResponse.text();
      } else {
        const csvRes = await fetch(STATION_SHEETS_CSV_URL, {
          headers: { 'User-Agent': 'Mozilla/5.0 FuelCare-Proxy/Cloudflare' },
          redirect: 'follow'
        });
        
        if (!csvRes.ok) throw new Error(`HTTP error! status: ${csvRes.status}`);
        csvText = await csvRes.text();
        
        const cacheResponse = new Response(csvText, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Cache-Control': 'public, max-age=600' // 10 minuti
          }
        });
        context.waitUntil(cache.put(cacheKey, cacheResponse).catch(() => null));
      }
      
      const lines = csvText.split(/\r?\n/);
      if (lines.length < 1) throw new Error("File anagrafica vuoto");

      // Identificazione colonne tramite header (prima riga)
      const headers = parseCSVRow(lines[0]).map(h => h.toUpperCase().trim());
      const findIdx = (names) => {
        for (const name of names) {
          const idx = headers.indexOf(name.toUpperCase());
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const pblIdx = findIdx(['PBL', 'CODICE', 'ID']);
      const cittaIdx = findIdx(['CITTÀ', 'CITY', 'LOCALITÀ']);
      const indirizzoIdx = findIdx(['INDIRIZZO', 'ADDRESS']);
      const provIdx = findIdx(['PROVINCIA', 'PROV', 'COMUNE']);
      const gestoreIdx = findIdx(['GESTORE', 'MANAGER', 'DITTA']);
      const capIdx = findIdx(['CAP', 'ZIP']);

      let stationData = null;
      const targetPblNorm = normalizePbl(pbl);

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = parseCSVRow(lines[i]);
        
        const rowPbl = pblIdx !== -1 ? row[pblIdx]?.trim() : row[0]?.trim();
        if (normalizePbl(rowPbl) === targetPblNorm) {
          stationData = {
            pbl: rowPbl,
            localita: cittaIdx !== -1 ? row[cittaIdx] : (row[1] || ''),
            indirizzo: indirizzoIdx !== -1 ? row[indirizzoIdx] : (row[2] || ''),
            cap: capIdx !== -1 ? row[capIdx] : (row[3] || ''),
            comune: provIdx !== -1 ? row[provIdx] : (row[4] || ''),
            gestore: gestoreIdx !== -1 ? row[gestoreIdx] : (row[10] || ''),
            prov: provIdx !== -1 ? row[provIdx] : ''
          };
          break;
        }
      }

      if (stationData) {
        return new Response(JSON.stringify({ success: true, station: stationData }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } else {
        return new Response(JSON.stringify({ success: false, message: `Impianto ${pbl} non trovato` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ success: false, message: `Errore: ${error.message}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  // --- AZIONE: RECUPERO STORICO DAL CSV CON CACHING E FILTRAGGIO ---
  if (params.get('action') === 'get_history_csv') {
    const pbl = (params.get('pbl') || '').trim();
    try {
      const cacheKey = new Request(new URL(request.url).origin + '/api/static_history_csv');
      const cache = caches.default;
      let cachedResponse = await cache.match(cacheKey).catch(() => null);
      let csvText;

      if (cachedResponse) {
        csvText = await cachedResponse.text();
      } else {
        const targetUrl = `${GAS_URL}?action=get_history_csv`;
        const gasRes = await fetch(targetUrl);
        if (!gasRes.ok) throw new Error(`HTTP error! status: ${gasRes.status}`);
        csvText = await gasRes.text();

        const cacheResponse = new Response(csvText, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Cache-Control': 'public, max-age=300' // 5 minuti
          }
        });
        context.waitUntil(cache.put(cacheKey, cacheResponse).catch(() => null));
      }

      let filteredCsv = csvText;
      if (pbl) {
        const targetPblNorm = normalizePbl(pbl);
        const lines = csvText.split(/\r?\n/);
        const filteredLines = [];

        for (const line of lines) {
          if (!line.trim()) continue;
          const row = parseCSVRow(line);
          if (row.length > 0) {
            const rowPbl = row[0].trim();
            if (normalizePbl(rowPbl) === targetPblNorm) {
              filteredLines.push(line);
            }
          }
        }
        filteredCsv = filteredLines.join('\n');
      }

      return new Response(filteredCsv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          ...corsHeaders
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  // --- AZIONE: PROXY VERSO GOOGLE APPS SCRIPT ---
  const action = params.get('action') || (url.pathname.endsWith('/save') ? 'save_reconciliation' : null);
  
  if (action || request.method === 'POST') {
    try {
      let targetUrl = GAS_URL;
      if (action) {
        targetUrl += `?action=${action}`;
        params.forEach((value, key) => {
          if (key !== 'action') targetUrl += `&${key}=${encodeURIComponent(value)}`;
        });
      } else {
        targetUrl += url.search;
      }

      if (request.method === 'POST') {
        const body = await request.text();
        const gasRes = await fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body
        });
        const gasData = await gasRes.text();

        // In caso di successo POST, invalidiamo la cache dello storico
        if (gasRes.ok) {
          try {
            const cacheKey = new Request(new URL(request.url).origin + '/api/static_history_csv', { method: 'GET' });
            const cache = caches.default;
            context.waitUntil(cache.delete(cacheKey).catch(() => null));
          } catch (e) {
            console.error('Errore invalidazione cache in POST:', e);
          }
        }

        return new Response(gasData, {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } else {
        const gasRes = await fetch(targetUrl);
        const gasData = await gasRes.text();
        const isJson = gasRes.headers.get('content-type')?.includes('application/json');
        
        return new Response(gasData, {
          status: 200,
          headers: { 
            'Content-Type': isJson ? 'application/json' : 'text/plain',
            ...corsHeaders 
          }
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ success: false, message: error.message }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  return new Response(JSON.stringify({ success: false, message: "Azione non specificata o percorso non valido" }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
