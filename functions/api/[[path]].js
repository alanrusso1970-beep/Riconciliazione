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
  const GAS_URL = env.GAS_URL || "https://script.google.com/macros/s/AKfycbxH2e9uh_DrzmBv7sfuwfN0drXedcpHtq3YFPWlKpA2F-3gn7EbvfBR9nfxzX7ksSfG/exec";
  // File Anagrafica (Impianti)
  const STATION_SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/19dKi3T8Fhd8KdAFUSjEdLgKJzSJrsCIG/export?format=csv&gid=1663329432";
  // File Riconciliazioni (GiacenzeStore)
  const RECONCILIATION_SS_ID = "13GXy6HsjW37Z2-wI4INjXCpgp_neEVqxoLVqO1PwtPE";

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- AZIONE: RECUPERO ANAGRAFICA IMPIANTO DAL CSV ---
  if (params.get('action') === 'get_station_csv') {
    const pbl = (params.get('pbl') || '').trim();
    try {
      const csvRes = await fetch(STATION_SHEETS_CSV_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 FuelCare-Proxy/Cloudflare' },
        redirect: 'follow'
      });
      
      if (!csvRes.ok) throw new Error(`HTTP error! status: ${csvRes.status}`);

      const csvText = await csvRes.text();
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
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = parseCSVRow(lines[i]);
        
        const rowPbl = pblIdx !== -1 ? row[pblIdx]?.trim() : row[0]?.trim();
        if (rowPbl === pbl) {
          stationData = {
            pbl: rowPbl,
            localita: cittaIdx !== -1 ? row[cittaIdx] : (row[1] || ''),
            indirizzo: indirizzoIdx !== -1 ? row[indirizzoIdx] : (row[2] || ''),
            cap: capIdx !== -1 ? row[capIdx] : (row[3] || ''),
            comune: provIdx !== -1 ? row[provIdx] : (row[4] || ''),
            gestore: gestoreIdx !== -1 ? row[gestoreIdx] : (row[10] || '')
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
        return new Response(gasData, {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } else {
        const gasRes = await fetch(targetUrl);
        const gasData = await gasRes.text();
        const isJson = gasRes.headers.get('content-type')?.includes('application/json') || action !== 'get_history_csv';
        
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
