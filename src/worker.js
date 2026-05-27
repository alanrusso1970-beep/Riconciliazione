/**
 * Cloudflare Worker - Proxy verso Google Apps Script e CSV Storico
 * Gestisce le chiamate /api/ per l'ambiente Cloudflare Workers with Assets.
 */

const STATION_SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/19dKi3T8Fhd8KdAFUSjEdLgKJzSJrsCIG/export?format=csv&gid=1663329432";

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const query = url.search;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Gestione richieste API
    if (url.pathname.startsWith('/api')) {
      
      // 1. Recupero anagrafica impianto dal CSV con caching
      if (url.searchParams.get('action') === 'get_station_csv') {
        const pbl = (url.searchParams.get('pbl') || '').trim();
        try {
          const cacheKey = new Request(new URL(request.url).origin + '/api/static_station_csv');
          const cache = caches.default;
          let cachedResponse = await cache.match(cacheKey).catch(() => null);
          let csvText;

          if (cachedResponse) {
            csvText = await cachedResponse.text();
            console.log('[Worker] Station CSV loaded from Cache');
          } else {
            const csvRes = await fetch(STATION_SHEETS_CSV_URL, {
              headers: { 'User-Agent': 'Mozilla/5.0 FuelCare-Proxy/Worker' },
              redirect: 'follow'
            });
            if (!csvRes.ok) throw new Error(`Google Sheet returned status ${csvRes.status}`);
            csvText = await csvRes.text();

            const cacheResponse = new Response(csvText, {
              headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Cache-Control': 'public, max-age=600' // 10 minuti
              }
            });
            if (ctx && ctx.waitUntil) {
              ctx.waitUntil(cache.put(cacheKey, cacheResponse).catch(() => null));
            }
            console.log('[Worker] Station CSV downloaded and cached');
          }

          const lines = csvText.split(/\r?\n/);
          if (lines.length < 1) throw new Error("File anagrafica vuoto");

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
          const normalizePbl = (p) => (p || '').trim().replace(/^0+/, '') || (p || '').trim();
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
            return new Response(JSON.stringify({ success: false, message: `Impianto ${pbl} non trovato nel CSV` }), {
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

      // 2. Proxy per il CSV dello storico via GAS con caching e filtraggio
      if (url.searchParams.get('action') === 'get_history_csv') {
        const GAS_URL = env.GAS_URL || "https://script.google.com/macros/s/AKfycbwaxTXHi4RXmgdTWMMWPnABqnxroWRbYNv6BsWWz73bvxeV_g56R7_yiZFbdl_WjOLa/exec";
        const pbl = (url.searchParams.get('pbl') || '').trim();
        try {
          const cacheKey = new Request(new URL(request.url).origin + '/api/static_history_csv');
          const cache = caches.default;
          let cachedResponse = await cache.match(cacheKey).catch(() => null);
          let csvText;

          if (cachedResponse) {
            csvText = await cachedResponse.text();
            console.log('[Worker] History CSV loaded from Cache');
          } else {
            const targetUrl = `${GAS_URL}?action=get_history_csv`;
            const response = await fetch(targetUrl, { redirect: 'follow' });
            if (!response.ok) throw new Error(`Google Script returned status ${response.status}`);
            csvText = await response.text();

            const cacheResponse = new Response(csvText, {
              headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Cache-Control': 'public, max-age=300' // 5 minuti
              }
            });
            if (ctx && ctx.waitUntil) {
              ctx.waitUntil(cache.put(cacheKey, cacheResponse).catch(() => null));
            }
            console.log('[Worker] History CSV downloaded and cached');
          }

          let filteredCsv = csvText;
          if (pbl) {
            const normalizePbl = (p) => (p || '').trim().replace(/^0+/, '') || (p || '').trim();
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
            console.log(`[Worker] Filtered history: ${filteredLines.length} rows for PBL=${pbl}`);
          }

          return new Response(filteredCsv, {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              ...corsHeaders
            }
          });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, message: e.message }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
          });
        }
      }

      // 3. Proxy verso Google Apps Script per altre azioni
      const GAS_URL = env.GAS_URL || "https://script.google.com/macros/s/AKfycbwaxTXHi4RXmgdTWMMWPnABqnxroWRbYNv6BsWWz73bvxeV_g56R7_yiZFbdl_WjOLa/exec";
      const targetUrl = query ? `${GAS_URL}${query}` : GAS_URL;

      const headers = new Headers();
      headers.set('User-Agent', 'Mozilla/5.0 FuelCare-Proxy/Worker');
      if (request.headers.get('Content-Type')) {
        headers.set('Content-Type', request.headers.get('Content-Type'));
      }

      try {
        const options = {
          method: request.method,
          headers: headers,
          redirect: 'follow'
        };

        if (request.method === 'POST') {
          options.body = await request.arrayBuffer();
        }

        const response = await fetch(targetUrl, options);
        const responseData = await response.arrayBuffer();

        // Se è andato a buon fine, invalidiamo la cache dello storico
        if (response.ok) {
          try {
            const cacheKey = new Request(new URL(request.url).origin + '/api/static_history_csv', { method: 'GET' });
            const cache = caches.default;
            if (ctx && ctx.waitUntil) {
              ctx.waitUntil(cache.delete(cacheKey).catch(() => null));
            }
            console.log('[Worker] POST successful, historical cache invalidated');
          } catch (err) {
            console.error('[Worker] Failed to invalidate cache on POST:', err);
          }
        }

        return new Response(responseData, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
            'X-Proxy-By': 'Cloudflare-Worker'
          }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          message: `Errore Proxy Worker: ${error.message}`
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // Se non è una richiesta API, serve gli asset statici (sito web)
    return env.ASSETS.fetch(request);
  }
}
