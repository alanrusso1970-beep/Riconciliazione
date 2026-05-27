# 📊 Registro Riconciliazione Giacenze Carburanti

Applicazione web per la gestione e riconciliazione delle giacenze di carburante presso stazioni di servizio.

## 🚀 Funzionalità

- ✅ Interfaccia identica al modulo cartaceo ufficiale
- ✅ Calcoli automatici in tempo reale (totalizzatori, cali, eccedenze)
- ✅ Salvataggio su Google Sheets tramite proxy locale
- ✅ Esportazione PDF ottimizzata per la stampa
- ✅ Clock automatico e caricamento dati stazione via PBL.

## 🛠️ Prerequisiti

- Node.js 16+ 
- Python 3.7+

## 📦 Installazione

```bash
# 1. Installa dipendenze Node
npm install

# 2. Avvia il proxy Python (in un terminale)
python3 server.py

# 3. Avvia l'app React (in un altro terminale)
npm run dev

# 4. Apri il browser su:
http://localhost:5173