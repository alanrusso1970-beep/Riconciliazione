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

SERVE_DIR = os.path.dirname(os.path.abspath(__file__))
GAS_URL = "https://script.google.com/macros/s/AKfycbxH2e9uh_DrzmBv7sfuwfN0drXedcpHtq3YFPWlKpA2F-3gn7EbvfBR9nfxzX7ksSfG/exec"
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