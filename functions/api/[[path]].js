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
      console.log(`[CSV Proxy] Fetching station data for PBL ${pbl}`);
      const csvRes = await fetch(STATION_SHEETS_CSV_URL, {
        headers: { 'User-Agent': 'Mozilla/5.0 FuelCare-Proxy/Cloudflare' },
        redirect: 'follow'
      });
      
      if (!csvRes.ok) throw new Error(`HTTP error! status: ${csvRes.status}`);

      const csvText = await csvRes.text();
      const lines = csvText.split(/\r?\n/);
      let stationData = null;

      for (const line of lines) {
        if (!line.trim()) continue;
        const row = parseCSVRow(line);
        
        if (row.length >= 5 && row[0].trim() === pbl) {
          // Mappatura: 0:PBL, 1:Città, 2:Indirizzo, 4:Provincia, 10:Gestore
          stationData = {
            pbl: row[0].trim(),
            localita: row[1] || '',
            indirizzo: row[2] || '',
            cap: row[3] || '',
            comune: row[4] || '',
            gestore: row[10] || ''
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
        return new Response(JSON.stringify({ success: false, message: `Impianto ${pbl} non trovato nel file anagrafica` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ success: false, message: `Errore lettura file: ${error.message}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  // --- AZIONE: PROXY VERSO GOOGLE APPS SCRIPT ---
  const action = params.get('action');
  if (action) {
    try {
      let targetUrl = `${GAS_URL}?action=${action}`;
      params.forEach((value, key) => {
        if (key !== 'action') targetUrl += `&${key}=${encodeURIComponent(value)}`;
      });

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

  return new Response(JSON.stringify({ success: false, message: "Azione non specificata" }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
