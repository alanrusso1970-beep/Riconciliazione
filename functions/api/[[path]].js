/**
 * Cloudflare Pages Function - Proxy verso Google Apps Script
 * Sostituisce server.py per l'ambiente Cloudflare.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const query = url.search;

  // L'URL di Google Apps Script può essere configurato nelle impostazioni di Cloudflare (Environment Variables)
  // Se non presente, usiamo quello di default.
  const GAS_URL = env.GAS_URL || "https://script.google.com/macros/s/AKfycbxH2e9uh_DrzmBv7sfuwfN0drXedcpHtq3YFPWlKpA2F-3gn7EbvfBR9nfxzX7ksSfG/exec";
  // File Anagrafica (Impianti)
  const STATION_SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/19dKi3T8Fhd8KdAFUSjEdLgKJzSJrsCIG/export?format=csv&gid=1663329432";
  // File Riconciliazioni (GiacenzeStore) - Usato indirettamente tramite GAS per salvataggio e storico
  const RECONCILIATION_SS_ID = "13GXy6HsjW37Z2-wI4INjXCpgp_neEVqxoLVqO1PwtPE";

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Gestione action get_station_csv: legge il foglio impianti_completi direttamente
  const params = new URLSearchParams(url.search);
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
          // MappaturaColonne per file 19dKi... (Anagrafica)
          // Col 0: PBL, Col 1: Città, Col 2: Indirizzo, Col 4: Provincia, Col 10: Gestore
          stationData = {
            pbl: row[0].trim(),
            localita: row[1] ? row[1].trim() : '',
            indirizzo: row[2] ? row[2].trim() : '',
            cap: row[3] ? row[3].trim() : '',
            comune: row[4] ? row[4].trim() : '',
            gestore: row[10] ? row[10].trim() : ''
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
      console.error('[CSV Station Error]', error);
      return new Response(JSON.stringify({ success: false, message: `Errore lettura file anagrafica: ${error.message}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  const targetUrl = query ? `${GAS_URL}${query}` : GAS_URL;

  // Prepariamo gli header per la richiesta a Google
  const headers = new Headers();
  headers.set('User-Agent', 'Mozilla/5.0 FuelCare-Proxy/Cloudflare');
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

    console.log(`[Proxy] ${request.method} -> ${targetUrl}`);

    const response = await fetch(targetUrl, options);
    
    // Leggiamo la risposta come Buffer/ArrayBuffer per non corrompere i dati
    const responseData = await response.arrayBuffer();

    // Restituiamo la risposta con gli header CORS necessari
    return new Response(responseData, {
      status: 200, // Forziamo 200 come faceva server.py in caso di successo del proxy
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
        'X-Proxy-By': 'Cloudflare-Pages-Functions'
      }
    });

  } catch (error) {
    console.error('[Proxy Error]', error);
    return new Response(JSON.stringify({
      success: false,
      message: `Errore Proxy Cloudflare: ${error.message}`
    }), {
      status: 200, // Restituiamo 200 con JSON di errore per compatibilità col frontend
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

/**
 * Parsing robusto di una riga CSV (gestisce campi tra virgolette).
 */
function parseCSVRow(line) {
  const result = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  result.push(field);
  return result;
}
