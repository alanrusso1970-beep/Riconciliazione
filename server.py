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
# File Anagrafica (Impianti)
STATION_SHEETS_CSV_URL = "https://docs.google.com/spreadsheets/d/19dKi3T8Fhd8KdAFUSjEdLgKJzSJrsCIG/export?format=csv&gid=1663329432"
# File Riconciliazioni (GiacenzeStore) - Usato indirettamente tramite GAS
RECONCILIATION_SS_ID = "13GXy6HsjW37Z2-wI4INjXCpgp_neEVqxoLVqO1PwtPE"
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
            print(f"[Proxy] Fetching station data for PBL={pbl}")
            try:
                # Aggiungiamo un cache-buster alla URL del foglio Google
                cb = os.urandom(4).hex()
                csv_url = STATION_SHEETS_CSV_URL + f"&_cb={cb}"
                station_data = None
                req = urllib.request.Request(csv_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, context=ssl_context, timeout=30) as resp:
                    raw = resp.read().decode('utf-8-sig', errors='replace') # utf-8-sig gestisce il BOM
                reader = csv.reader(io.StringIO(raw))
                rows = list(reader)
                if not rows: raise Exception("File vuoto")

                headers = [h.upper().strip() for h in rows[0]]
                print(f"[Proxy] Headers: {headers}")

                def find_idx(names):
                    for name in names:
                        name_up = name.upper()
                        if name_up in headers: return headers.index(name_up)
                        # Cerca corrispondenza parziale se non trova quella esatta
                        for i, h in enumerate(headers):
                            if name_up in h: return i
                    return -1

                pbl_idx = find_idx(['PBL', 'CODICE', 'ID'])
                citta_idx = find_idx(['CITTÀ', 'CITY', 'LOCALITÀ', 'CITTA'])
                indirizzo_idx = find_idx(['INDIRIZZO', 'ADDRESS'])
                prov_idx = find_idx(['PROVINCIA', 'PROV', 'COMUNE'])
                gestore_idx = find_idx(['GESTORE', 'MANAGER', 'DITTA'])
                cap_idx = find_idx(['CAP', 'ZIP'])

                for row in rows[1:]:
                    if not row: continue
                    row_pbl = row[pbl_idx].strip() if pbl_idx != -1 and len(row) > pbl_idx else (row[0].strip() if row else '')
                    # Confronto robusto (senza zeri iniziali)
                    if row_pbl.lstrip('0') == pbl.lstrip('0'):
                        station_data = {
                            'pbl': row_pbl,
                            'comune': row[citta_idx].strip() if citta_idx != -1 and len(row) > citta_idx else '',
                            'localita': '', # Spesso vuoto o uguale a comune nel CSV
                            'indirizzo': row[indirizzo_idx].strip() if indirizzo_idx != -1 and len(row) > indirizzo_idx else '',
                            'cap': row[cap_idx].strip() if cap_idx != -1 and len(row) > cap_idx else '',
                            'prov': row[prov_idx].strip() if prov_idx != -1 and len(row) > prov_idx else '',
                            'gestore': row[gestore_idx].strip() if gestore_idx != -1 and len(row) > gestore_idx else ''
                        }
                        print(f"[Proxy] Found station: {station_data['pbl']} - {station_data['gestore']}")
                        break

                if station_data:
                    result = json.dumps({'success': True, 'station': station_data}).encode('utf-8')
                else:
                    result = json.dumps({'success': False, 'message': f'Impianto {pbl} non trovato nel CSV'}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(result)
            except Exception as e:
                print(f"[Proxy] CSV Station Error: {str(e)}")
                self.send_error_json(f"Errore: {str(e)}")
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