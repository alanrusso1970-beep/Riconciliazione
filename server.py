#!/usr/bin/env python3
"""
Server locale stabile per il Registro Riconciliazione.
Agisce come proxy trasparente verso Google Apps Script.
"""
import http.server
import json
import urllib.request
import urllib.parse
import os
import socketserver
import ssl
import urllib.error
import csv
import io

SERVE_DIR = os.path.dirname(os.path.abspath(__file__))
GAS_URL = "https://script.google.com/macros/s/AKfycbxH2e9uh_DrzmBv7sfuwfN0drXedcpHtq3YFPWlKpA2F-3gn7EbvfBR9nfxzX7ksSfG/exec"
PRIMARY_SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/13GXy6HsjW37Z2-wI4INjXCpgp_neEVqxoLVqO1PwtPE/export?format=csv&gid=0"
FALLBACK_SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/19dKi3T8Fhd8KdAFUSjEdLgKJzSJrsCIG/export?format=csv&gid=1663329432"
PORT = 8787

# Fix SSL per macOS
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/'):
            self.handle_proxy('GET')
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/save') or self.path.startswith('/api/'):
            self.handle_proxy('POST')
        else:
            self.send_error(404)

    def handle_proxy(self, method):
        """Proxy trasparente"""
        parsed = urllib.parse.urlparse(self.path)
        query = parsed.query
        
        # Intercetta la richiesta per il CSV storico e la inoltra al GAS
        qs = urllib.parse.parse_qs(query)

        if qs.get('action') == ['get_station_csv']:
            pbl = (qs.get('pbl') or [''])[0].strip()
            print(f"[Proxy] Fetching station for PBL={pbl} from Google Sheets CSVs")
            try:
                station_data = None
                # Proviamo entrambi i fogli
                for csv_url in [PRIMARY_SHEETS_CSV_URL, FALLBACK_SHEETS_CSV_URL]:
                    print(f"[Proxy] Trying CSV: {csv_url}")
                    req = urllib.request.Request(csv_url, headers={'User-Agent': 'Mozilla/5.0'})
                    try:
                        with urllib.request.urlopen(req, context=ssl_context, timeout=30) as resp:
                            raw = resp.read().decode('utf-8', errors='replace')
                        reader = csv.reader(io.StringIO(raw))
                        for row in reader:
                            if len(row) >= 5 and row[0].strip() == pbl:
                                station_data = {
                                    'pbl': row[0].strip(),
                                    'localita': row[1].strip() if len(row) > 1,
                                    'indirizzo': row[2].strip() if len(row) > 2,
                                    'cap': row[3].strip() if len(row) > 3,
                                    'comune': row[4].strip() if len(row) > 4,
                                    'gestore': row[10].strip() if len(row) > 10 else (row[6].strip() if len(row) > 6 else '')
                                }
                                break
                    except Exception as e:
                        print(f"[Proxy] Error fetching/parsing {csv_url}: {e}")
                        continue
                    if station_data: break

                if station_data:
                    result = json.dumps({'success': True, 'station': station_data}).encode('utf-8')
                else:
                    result = json.dumps({'success': False, 'message': f'Impianto {pbl} non trovato nei fogli Google'}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(result)
            except Exception as e:
                print(f"[Proxy] CSV Station Error: {str(e)}")
                self.send_error_json(f"Errore lettura fogli impianti: {str(e)}")
            return

        if qs.get('action') == ['get_history_csv']:
            target_url = f"{GAS_URL}?action=get_history_csv"
            print(f"[Proxy] Fetching History CSV via GAS -> {target_url}")
            try:
                req = urllib.request.Request(target_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, context=ssl_context, timeout=30) as resp:
                    result_data = resp.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/csv; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(result_data)
            except Exception as e:
                print(f"[Proxy] CSV Error: {str(e)}")
                self.send_error_json(f"Errore Proxy CSV: {str(e)}")
            return

        target_url = f"{GAS_URL}?{query}" if query else GAS_URL
        
        try:
            req_data = None
            headers = {'User-Agent': 'Mozilla/5.0 FuelCare-Proxy/1.0'}
            
            if method == 'POST':
                content_length = int(self.headers.get('Content-Length', 0))
                req_data = self.rfile.read(content_length)
                headers['Content-Type'] = self.headers.get('Content-Type', 'application/json')

            print(f"[Proxy] {method} -> {target_url}")
            
            req = urllib.request.Request(target_url, data=req_data, headers=headers, method=method)
            
            with urllib.request.urlopen(req, context=ssl_context, timeout=30) as resp:
                result_data = resp.read()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(result_data)
                
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', errors='ignore')
            print(f"[Proxy] HTTP {e.code} Error")
            self.send_error_json(f"Errore Google ({e.code})")
        except Exception as e:
            print(f"[Proxy] Error: {str(e)}")
            self.send_error_json(f"Errore Proxy: {str(e)}")

    def send_error_json(self, message):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"success": False, "message": message}).encode('utf-8'))

    def log_message(self, format, *args):
        pass # Silenzioso per i log standard

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), ProxyHandler) as httpd:
        print(f"✅ Server Proxy Attivo su http://localhost:{PORT}")
        httpd.serve_forever()