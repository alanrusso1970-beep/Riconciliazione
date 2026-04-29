/**
 * Cloudflare Worker - Proxy verso Google Apps Script e CSV Storico
 * Gestisce le chiamate /api/ per l'ambiente Cloudflare Workers with Assets.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const query = url.search;

    // Gestione richieste API
    if (url.pathname.startsWith('/api')) {
      
      // 1. Proxy per il CSV dello storico via GAS
      if (url.searchParams.get('action') === 'get_history_csv') {
        const GAS_URL = env.GAS_URL || "https://script.google.com/macros/s/AKfycbwaxTXHi4RXmgdTWMMWPnABqnxroWRbYNv6BsWWz73bvxeV_g56R7_yiZFbdl_WjOLa/exec";
        const targetUrl = `${GAS_URL}?action=get_history_csv`;
        try {
          const response = await fetch(targetUrl, { redirect: 'follow' });
          const csvData = await response.arrayBuffer();
          return new Response(csvData, {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, message: e.message }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
          });
        }
      }

      // 2. Proxy verso Google Apps Script
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

        return new Response(responseData, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
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
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    // Se non è una richiesta API, serve gli asset statici (sito web)
    return env.ASSETS.fetch(request);
  }
}
