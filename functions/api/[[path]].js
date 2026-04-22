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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
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
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
