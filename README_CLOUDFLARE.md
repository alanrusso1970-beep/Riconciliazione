# Guida al Deploy su Cloudflare Pages

Questa guida spiega come mettere online l'applicazione utilizzando Cloudflare Pages e GitHub.

## 1. Preparazione GitHub

1. Crea un nuovo repository su GitHub (es. `riconciliazioni-carburanti`).
2. Carica i file del progetto sul repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Cloudflare"
   git branch -M main
   git remote add origin https://github.com/tuo-utente/riconciliazioni-carburanti.git
   git push -u origin main
   ```

## 2. Configurazione Cloudflare Pages

1. Accedi al pannello di [Cloudflare](https://dash.cloudflare.com/).
2. Vai su **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Seleziona il tuo repository GitHub.
4. Impostazioni di Build:
   - **Framework preset**: `Vite` (o lascia None e inserisci i comandi sotto).
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
5. Clicca su **Save and Deploy**.

## 3. Configurazione Backend (Proxy)

L'applicazione comunica con Google Apps Script tramite una "Cloudflare Function".
Per sicurezza, l'URL di Google Script è configurato come variabile di ambiente.

1. In Cloudflare Pages, vai nella scheda **Settings** del tuo progetto.
2. Vai su **Environment variables**.
3. Aggiungi una variabile in **Production**:
   - **Variable name**: `GAS_URL`
   - **Value**: `https://script.google.com/macros/s/AKfycbxH2e9uh_DrzmBv7sfuwfN0drXedcpHtq3YFPWlKpA2F-3gn7EbvfBR9nfxzX7ksSfG/exec`
4. Fai lo stesso per **Preview** se necessario.
5. **IMPORTANTE**: Dopo aver aggiunto la variabile, devi far ripartire una build (o fare un nuovo push su GitHub) affinché la modifica sia attiva.

## 4. Sviluppo Locale con Cloudflare

Puoi testare il comportamento di Cloudflare (inclusa la Function) sul tuo iMac senza usare `server.py`:

```bash
npm run cf:dev
```
Questo comando costruirà l'app e avvierà un server locale che simula Cloudflare all'indirizzo `http://localhost:8788`.

---
**Nota**: Il file `server.py` non è più necessario per il funzionamento online, ma puoi continuare a usarlo per lo sviluppo veloce con `npm run dev`.
