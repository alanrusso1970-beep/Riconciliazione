import React, { useState, useEffect } from 'react';
import { Save, Printer, Search } from 'lucide-react';

// --- TIPI E INTERFACCE ---
type FuelType = 'spb' | 'gasolio' | 'supreme' | 'gpl';

interface Dispenser { apertura: number; chiusura: number; }
interface Cisterna { altezza: number; giacenza: number; }
interface FuelData { dispensers: Dispenser[]; cisterne: Cisterna[]; }
interface CalcoliData {
  rimananzeIniziali: number; carico: number; eccedRegistrate: number;
  scattiVuoto: number; eccedenzeTrasporto: number; caliGiaRegistrati: number;
  caliViaggio: number; caliTecnici: number;
}
interface StationData {
  codCliente: string; localita: string; comune: string; indirizzo: string; prov: string;
  marchio: string; gestore: string; data: string; ora: string;
}
interface AppState {
  station: StationData;
  fuels: Record<FuelType, FuelData>;
  calcoli: Record<FuelType, CalcoliData>;
}

// --- COSTANTI E STILI ---
const PRINT_STYLES = `
  @media print {
    @page { size: A4 landscape; margin: 10mm; }
    body { background: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .no-print { display: none !important; }
    .page-break { page-break-after: always; break-after: page; }
    * { font-size: 11px !important; line-height: 1.2 !important; font-family: sans-serif; }
    .print-show { display: block !important; border-bottom: 0.5px solid #ccc; min-height: 14px; }
    .print-grid { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 4px !important; width: 100% !important; }
    .print-section { break-inside: avoid !important; }
    .shadow-lg, .shadow-xl, .shadow-2xl, .shadow-sm { box-shadow: none !important; }
    .rounded-3xl, .rounded-2xl, .rounded-xl { border-radius: 0 !important; border: 0.5px solid #ccc !important; }
  }
  @keyframes loadingBar {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(0); }
    100% { transform: translateX(100%); }
  }
  .animate-loading-bar {
    animation: loadingBar 1.5s infinite linear;
  }
`;

const createEmptyDispensers = () => Array(12).fill({ apertura: 0, chiusura: 0 });
const createEmptyCisterne = (count: number) => Array(count).fill({ altezza: 0, giacenza: 0 });
const createEmptyCalcoli = (): CalcoliData => ({
  rimananzeIniziali: 0, carico: 0, eccedRegistrate: 0, scattiVuoto: 0,
  eccedenzeTrasporto: 0, caliGiaRegistrati: 0, caliViaggio: 0, caliTecnici: 0,
});

const INITIAL_STATE: AppState = {
  station: {
    codCliente: '', localita: '', comune: '', indirizzo: '', prov: '', marchio: '', gestore: '',
    data: new Date().toISOString().split('T')[0],
    ora: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
  },
  fuels: {
    spb: { dispensers: createEmptyDispensers(), cisterne: createEmptyCisterne(8) },
    gasolio: { dispensers: createEmptyDispensers(), cisterne: createEmptyCisterne(8) },
    supreme: { dispensers: createEmptyDispensers(), cisterne: createEmptyCisterne(3) },
    gpl: { dispensers: createEmptyDispensers(), cisterne: createEmptyCisterne(2) },
  },
  calcoli: { spb: createEmptyCalcoli(), gasolio: createEmptyCalcoli(), supreme: createEmptyCalcoli(), gpl: createEmptyCalcoli() },
};

export default function App() {
  const [data, setData] = useState<AppState>(INITIAL_STATE);
  const [pbl, setPbl] = useState('108208');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [showError, setShowError] = useState(false);

  // --- LOGICA DI AUTENTICAZIONE ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passInput === 'toil') {
      setIsLogged(true);
    } else {
      setShowError(true);
      setPassInput('');
      setTimeout(() => setShowError(false), 3000);
    }
  };

  // --- EFFETTI ---
  useEffect(() => {
    const timer = setInterval(() => {
      setData(prev => ({ 
        ...prev, 
        station: { ...prev.station, ora: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) } 
      }));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // --- AZIONI ---
  const loadStation = async () => {
    if (!pbl) return;
    setLoading(true);
    try {
      // FIX: Utilizzo di window.location.origin per l'URL assoluto
      const baseUrl = window.location.origin;
      const res = await fetch(`${baseUrl}/api/?action=get_station_info&pbl=${encodeURIComponent(pbl)}`);
      const json = await res.json();
      if (json.success && json.station) {
        const mapped: StationData = {
          ...INITIAL_STATE.station,
          ...json.station,
          cliente: json.station.cliente || json.station.ragione_sociale || json.station.gestore || '',
          localita: json.station.localita || json.station.citta || '',
          comune: json.station.comune || json.station.citta || '',
          prov: json.station.prov || json.station.provincia || '',
          codCliente: pbl,
          data: data.station.data,
          ora: data.station.ora,
        };
        setData({
          station: mapped,
          fuels: json.savedData?.fuels || INITIAL_STATE.fuels,
          calcoli: json.savedData?.calcoli || INITIAL_STATE.calcoli
        });
      } else {
        alert('⚠️ Impianto non trovato.');
      }
    } catch (err) {
      alert('❌ Errore connessione al server.');
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // FIX: Utilizzo di window.location.origin per l'URL assoluto
      const baseUrl = window.location.origin;
      const res = await fetch(`${baseUrl}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_reconciliation', pbl, data })
      });
      const json = await res.json();
      if (json.success) {
        alert('✅ Salvato con successo!');
        window.print();
      }
    } catch {
      alert('❌ Errore nel salvataggio.');
    } finally { setSaving(false); }
  };

  // --- UPDATE HANDLERS ---
  const updateStation = (f: keyof StationData, v: string) => setData(p => ({ ...p, station: { ...p.station, [f]: v } }));
  
  const updateFuel = (f: FuelType, key: 'dispensers' | 'cisterne', i: number, field: string, val: number) => {
    setData(prev => ({
      ...prev,
      fuels: {
        ...prev.fuels,
        [f]: {
          ...prev.fuels[f],
          [key]: prev.fuels[f][key].map((item, idx) => 
            idx === i ? { ...item, [field]: Math.round(val) } : item
          )
        }
      }
    }));
  };

  const updateCalcolo = (f: FuelType, k: keyof CalcoliData, v: number) => {
    setData(p => ({ ...p, calcoli: { ...p.calcoli, [f]: { ...p.calcoli[f], [k]: Math.round(v) } } }));
  };

  // --- CALCOLI STATISTICI ---
  const getStats = (f: FuelType) => {
    const fl = data.fuels[f]; 
    const calc = data.calcoli[f];
    const erogato = fl.dispensers.reduce((sum, disp) => sum + Math.max(0, disp.chiusura - disp.apertura), 0);
    const giacEffettiva = fl.cisterne.reduce((s, c) => s + c.giacenza, 0);
    
    const totCarico = calc.rimananzeIniziali + calc.carico + calc.eccedRegistrate + calc.scattiVuoto + calc.eccedenzeTrasporto;
    const totScarico = erogato + calc.caliGiaRegistrati + calc.caliViaggio + calc.caliTecnici;
    const giacContabile = totCarico - totScarico;
    const diff = giacContabile - giacEffettiva;

    const caloAnnuo = erogato * ((f === 'spb' || f === 'gpl') ? 0.0025 : 0.000833);

    return [
      { l: "1) RIMANENZA INIZIALE", v: calc.rimananzeIniziali, k: "rimananzeIniziali" as const },
      { l: "2) CARICO", v: calc.carico, k: "carico" as const },
      { l: "3) ECCED. REGISTRATA", v: calc.eccedRegistrate, k: "eccedRegistrate" as const },
      { l: "4) SCATTI A VUOTO", v: calc.scattiVuoto, k: "scattiVuoto" as const },
      { l: "5) ECCED. TRASPORTO", v: calc.eccedenzeTrasporto, k: "eccedenzeTrasporto" as const },
      { l: "6) TOTALE CARICO", v: Math.round(totCarico), bold: true, bg: 'bg-blue-50' },
      { l: "a) TOTALE EROGATO", v: erogato, bold: true, red: true },
      { l: "b) CALI REGISTRATI", v: calc.caliGiaRegistrati, k: "caliGiaRegistrati" as const, red: true },
      { l: "c) CALI VIAGGI", v: calc.caliViaggio, k: "caliViaggio" as const, red: true },
      { l: "d) CALO TECNICO", v: calc.caliTecnici, k: "caliTecnici" as const, red: true },
      { l: "f) TOTALE SCARICO", v: Math.round(totScarico), bold: true, red: true, bg: 'bg-red-50' },
      { l: "GIAC. CONTABILE", v: Math.round(giacContabile), bold: true },
      { l: "GIAC. EFFETTIVA", v: giacEffettiva, bold: true },
      { l: diff > 0 ? "CALO (C-E)" : "ECCEDENZA (C-E)", v: Math.abs(Math.round(diff)), bold: true, red: diff > 0, bg: diff > 0 ? 'bg-red-100' : 'bg-green-100' },
      { l: "CALO ANNUO CONSENTITO", v: Math.round(caloAnnuo), bold: true, suffix: ' lt' },
      { l: "ECCEDENZA CONSENTITA", v: Math.round(erogato * 0.005), bold: true, suffix: ' lt' },
    ];
  };

  // --- RENDER HELPERS ---
  const renderTotalizzatori = (f: FuelType, label: string) => {
    const d = data.fuels[f].dispensers;
    const totals = d.map(x => Math.max(0, x.chiusura - x.apertura));
    const grandTotal = totals.reduce((a, b) => a + b, 0);

    return (
      <div className="mb-4 break-inside-avoid">
        <h3 className="font-bold text-xs mb-1 text-gray-700">{label}</h3>
        <table className="w-full text-[10px] border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-1 w-16 text-left">Voce</th>
              {Array.from({ length: 12 }).map((_, i) => <th key={i} className="border p-0.5 text-center">{i + 1}</th>)}
              <th className="border p-1 bg-gray-200 text-right w-24">TOTALE</th>
            </tr>
          </thead>
          <tbody>
            {(['chiusura', 'apertura', 'totale'] as const).map((row) => (
              <tr key={row}>
                <td className="border p-1 bg-gray-50 capitalize font-medium">{row}</td>
                {d.map((item, i) => (
                  <td key={i} className={`border p-0 ${row === 'chiusura' && item.chiusura < item.apertura ? 'bg-red-100' : ''}`}>
                    {row === 'totale' ? (
                      <span className="block text-right pr-1 font-mono">{totals[i]}</span>
                    ) : (
                      <>
                        <input 
                          type="number" 
                          className={`w-full h-6 px-1 text-right border-none bg-transparent focus:bg-blue-50 outline-none no-print ${row === 'chiusura' && item.chiusura < item.apertura ? 'text-red-700 font-black' : ''}`}
                          value={row === 'chiusura' ? item.chiusura : item.apertura}
                          onChange={e => updateFuel(f, 'dispensers', i, row, parseInt(e.target.value) || 0)} 
                        />
                        <span className={`hidden-screen print-show text-right pr-1 font-mono ${row === 'chiusura' && item.chiusura < item.apertura ? 'text-red-700 font-bold' : ''}`}>
                          {row === 'chiusura' ? item.chiusura : item.apertura}
                        </span>
                      </>
                    )}
                  </td>
                ))}
                <td className="border p-1 text-right font-bold bg-gray-200 font-mono text-blue-900">
                  {row === 'totale' ? grandTotal : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCisterne = (f: FuelType, label: string) => {
    const cisterne = data.fuels[f].cisterne;
    return (
      <div className="mb-2 break-inside-avoid">
        <h3 className="font-bold text-[10px] mb-1 text-gray-700 uppercase">{label}</h3>
        <table className="w-full text-[10px] border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-1 w-8">Tank</th>
              <th className="border p-1">H (cm)</th>
              <th className="border p-1">Litri</th>
            </tr>
          </thead>
          <tbody>
            {cisterne.map((c, i) => (
              <tr key={i}>
                <td className="border p-1 text-center bg-gray-50">{i + 1}</td>
                <td className="border p-0">
                  <input type="number" className="w-full h-6 px-1 text-right border-none bg-transparent no-print font-medium" value={c.altezza} onChange={e => updateFuel(f, 'cisterne', i, 'altezza', parseInt(e.target.value) || 0)} />
                  <span className="hidden-screen print-show text-right pr-1 font-mono">{c.altezza}</span>
                </td>
                <td className="border p-0">
                  <input type="number" className="w-full h-6 px-1 text-right border-none bg-transparent no-print font-bold" value={c.giacenza} onChange={e => updateFuel(f, 'cisterne', i, 'giacenza', parseInt(e.target.value) || 0)} />
                  <span className="hidden-screen print-show text-right pr-1 font-mono font-bold">{c.giacenza}</span>
                </td>
              </tr>
            ))}
            <tr className="bg-gray-100 font-bold">
              <td colSpan={2} className="border p-1 text-right uppercase text-[8px]">Totale</td>
              <td className="border p-1 text-right font-mono text-blue-900 bg-gray-200">
                {cisterne.reduce((s, c) => s + c.giacenza, 0).toFixed(0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderProspettoGenerale = () => {
    const listSpb = getStats('spb');
    const listGasolio = getStats('gasolio');
    const listSupreme = getStats('supreme');
    const listGpl = getStats('gpl');
    
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse border border-gray-300">
          <thead>
            <tr className="bg-blue-900 text-white uppercase text-[9px] print:bg-blue-900 print:text-white">
              <th className="border p-2 text-left w-48">Descrizione Movimento</th>
              <th className="border p-2 text-center">Benzina (Spb)</th>
              <th className="border p-2 text-center">Gasolio</th>
              <th className="border p-2 text-center">Supreme</th>
              <th className="border p-2 text-center">GPL</th>
            </tr>
          </thead>
          <tbody>
            {listSpb.map((row, i) => (
              <tr key={i} className={`${row.bold ? 'font-bold bg-gray-50' : ''} ${row.bg || ''}`}>
                <td className="border px-2 py-1.5">{row.l}</td>
                {[listSpb[i], listGasolio[i], listSupreme[i], listGpl[i]].map((cell, idx) => {
                  const fuels: FuelType[] = ['spb', 'gasolio', 'supreme', 'gpl'];
                  return (
                    <td key={idx} className={`border px-2 py-1.5 text-right ${cell.red ? 'text-red-600' : ''}`}>
                      <div className="flex justify-end items-center gap-1">
                        {cell.k && (
                          <input type="number" 
                            className="w-20 h-6 text-right border border-gray-200 rounded px-1 no-print bg-white" 
                            value={cell.v} 
                            onChange={e => updateCalcolo(fuels[idx], cell.k!, parseInt(e.target.value) || 0)} />
                        )}
                        <span className={cell.k ? 'hidden-screen print-show font-mono' : 'font-mono'}>
                          {Math.round(cell.v)}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // --- LOGICA DI ACCESSO E ERRORI ---
  if (showError) return <div className="min-h-screen flex items-center justify-center text-[200px]">🖕🏼</div>;
  if (!isLogged) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm flex flex-col gap-4">
          <h1 className="text-xl font-bold text-center">Registro Riconciliazione</h1>
          <input type="password" placeholder="Password" className="p-3 border rounded-xl text-center tracking-widest outline-none focus:ring-2 focus:ring-blue-500" value={passInput} onChange={e => setPassInput(e.target.value)} autoFocus />
          <button type="submit" className="bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700">Entra</button>
        </form>
      </div>
    );
  }

  // --- MAIN RENDER ---
  return (
    <div className="min-h-screen bg-slate-50 p-4 print:p-0 print:bg-white font-sans text-slate-900 leading-relaxed">
      <style>{`.hidden-screen { display: none; } ${PRINT_STYLES}`}</style>

      {/* MODALE DI CARICAMENTO */}
      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[3px] z-[100] flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-[280px] flex flex-col items-center gap-5 border border-white/20 transform transition-all scale-100">
            <div className="bg-blue-50 p-3 rounded-2xl">
              <Search className="text-blue-600 animate-bounce" size={24}/>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="text-blue-950 font-black uppercase tracking-[0.2em] text-[10px]">Cloud Sync</div>
              <div className="text-slate-400 text-[9px] font-medium uppercase tracking-wider">Recupero dati in corso</div>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-700 w-full animate-loading-bar rounded-full" style={{ width: '40%' }} />
            </div>
          </div>
        </div>
      )}

      {/* HEADER & CONTROLLI */}
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="bg-blue-900 text-white p-4 rounded-xl flex justify-between items-center no-print shadow-lg">
          <h1 className="font-bold uppercase tracking-tight">Registro Carburanti v1.0</h1>
          <div className="flex gap-3">
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-700 px-4 py-2 rounded-lg font-bold text-sm"><Printer size={18}/> STAMPA</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-green-600 px-4 py-2 rounded-lg font-bold text-sm"><Save size={18}/> {saving ? 'SALVATAGGIO...' : 'SALVA'}</button>
          </div>
        </div>

        {/* ANAGRAFICA */}
        <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Codice Impianto</label>
              <div className="flex gap-2">
                <input className="flex-1 font-bold text-blue-900 border-b outline-none no-print" value={data.station.codCliente} onChange={e => { setPbl(e.target.value); updateStation('codCliente', e.target.value); }} />
                <button onClick={loadStation} className="no-print text-blue-600"><Search size={18}/></button>
                <span className="hidden-screen print-show font-bold">{data.station.codCliente}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Gestore</label>
              <input className="border-b outline-none no-print font-medium" value={data.station.gestore} onChange={e => updateStation('gestore', e.target.value)} />
              <span className="hidden-screen print-show font-medium">{data.station.gestore}</span>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Indirizzo</label>
              <input className="border-b outline-none no-print font-medium" value={data.station.indirizzo} onChange={e => updateStation('indirizzo', e.target.value)} />
              <span className="hidden-screen print-show font-medium">{data.station.indirizzo}</span>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Comune / Località</label>
              <div className="flex gap-1">
                <input placeholder="Comune" className="w-1/2 border-b outline-none no-print font-medium" value={data.station.comune} onChange={e => updateStation('comune', e.target.value)} />
                <input placeholder="Località" className="w-1/2 border-b outline-none no-print font-medium" value={data.station.localita} onChange={e => updateStation('localita', e.target.value)} />
              </div>
              <span className="hidden-screen print-show font-medium">{data.station.comune} {data.station.localita ? `(${data.station.localita})` : ''}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Marchio</label>
              <input className="border-b outline-none no-print font-medium" value={data.station.marchio} onChange={e => updateStation('marchio', e.target.value)} />
              <span className="hidden-screen print-show font-medium">{data.station.marchio}</span>
            </div>
            <div className="flex flex-col md:col-span-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Data e Ora</label>
              <div className="flex gap-2 items-center">
                <input type="date" className="border-b no-print text-[10px]" value={data.station.data} onChange={e => updateStation('data', e.target.value)} />
                <span className="hidden-screen print-show font-mono font-bold text-gray-700 text-[10px]">{data.station.data.split('-').reverse().join('/')} - {data.station.ora}</span>
              </div>
            </div>
          </div>
        </div>

        {/* TOTALIZZATORI */}
        <div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm page-break group transition-all hover:shadow-md">
          <h2 className="text-[11px] font-black mb-5 text-blue-950 border-b border-slate-100 pb-2 uppercase tracking-[0.15em] flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
            1. Rilevazione Contatori Erogatori
          </h2>
          {renderTotalizzatori('spb', 'Benzina Senza Piombo')}
          {renderTotalizzatori('gasolio', 'Gasolio Autotrazione')}
          {renderTotalizzatori('supreme', 'Supreme Diesel')}
          {renderTotalizzatori('gpl', 'GPL')}
        </div>

        {/* GIACENZE E CALCOLI */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm transition-all hover:shadow-md">
            <h2 className="text-[11px] font-black mb-5 text-blue-950 border-b border-slate-100 pb-2 uppercase tracking-[0.15em] flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
              2. Giacenze Fisiche (Cisterne)
            </h2>
            <div className="grid grid-cols-2 gap-5">
              {renderCisterne('spb', 'Benzina')}
              {renderCisterne('gasolio', 'Gasolio')}
              {renderCisterne('supreme', 'Supreme')}
              {renderCisterne('gpl', 'GPL')}
            </div>
          </div>
          <div className="bg-white p-5 border border-slate-200 rounded-3xl shadow-sm w-full transition-all hover:shadow-md">
            <h2 className="text-[11px] font-black mb-5 text-blue-950 border-b border-slate-100 pb-2 uppercase tracking-[0.15em] text-center tracking-[0.15em]">
              3. Prospetto di Riconciliazione Movimenti e Cali
            </h2>
            {renderProspettoGenerale()}
          </div>
        </div>
      </div>
    </div>
  );
}
