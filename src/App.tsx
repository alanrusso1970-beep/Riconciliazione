import React, { useState, useEffect } from 'react';
import { Save, Printer, Search, Lock, FilePlus, History, X, FileText } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import UTFForm from './components/UTFForm';

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
  attachments?: string[];
}

// --- UTILS ---
const formatNum = (num: number): string => num.toLocaleString('it-IT');

const FUEL_CONFIG: Record<FuelType, { label: string; bg: string; text: string; header: string; icon: string }> = {
  spb: { label: 'Benzina Senza Piombo', bg: 'bg-emerald-50', text: 'text-emerald-900', header: 'bg-emerald-100', icon: 'bg-emerald-500' },
  gasolio: { label: 'Gasolio Autotrazione', bg: 'bg-amber-50', text: 'text-amber-900', header: 'bg-amber-100', icon: 'bg-amber-500' },
  supreme: { label: 'Supreme Diesel', bg: 'bg-rose-50', text: 'text-rose-900', header: 'bg-rose-100', icon: 'bg-rose-600' },
  gpl: { label: 'GPL', bg: 'bg-cyan-50', text: 'text-cyan-900', header: 'bg-cyan-100', icon: 'bg-cyan-500' },
};

// --- COSTANTI E STILI ---
// Rimosso PRINT_STYLES da qui (spostato in index.css)

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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [showError, setShowError] = useState(false);
  
  // Modal History
  const [showHistory, setShowHistory] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [historyData, setHistoryData] = useState<any[]>([]);

  // UTF Form
  const [showUTFForm, setShowUTFForm] = useState(false);

  // --- LOGICA DI AUTENTICAZIONE ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passInput === 'toil') {
      setIsLogged(true);
      toast.success('Accesso effettuato con successo!');
    } else {
      setShowError(true);
      setPassInput('');
      toast.error('Codice errato!');
      setTimeout(() => setShowError(false), 3000);
    }
  };

  // --- EFFETTI ---
  // Caricamento storico rimosso da useEffect perché gestito da loadStation (Sorgente: FILE)

  // --- HELPER DIFFERENZA ---
  const getFuelDiff = (f: FuelType, currentState: AppState) => {
    const fl = currentState.fuels[f];
    const calc = currentState.calcoli[f];
    const erogato = fl.dispensers.reduce((sum, disp) => sum + Math.max(0, disp.chiusura - disp.apertura), 0);
    const giacEffettiva = fl.cisterne.reduce((s, c) => s + c.giacenza, 0);
    const totCarico = calc.rimananzeIniziali + calc.carico + calc.eccedRegistrate + calc.scattiVuoto + calc.eccedenzeTrasporto;
    const totScarico = erogato + calc.caliGiaRegistrati + calc.caliViaggio + calc.caliTecnici;
    const giacContabile = totCarico - totScarico;
    return Math.round(giacEffettiva - giacContabile);
  };

  // --- AZIONI ---
  const loadStation = async () => {
    const currentPbl = data.station.codCliente || '108208';
    setLoading(true);
    try {
      const baseUrl = window.location.origin;

      // 1. Recupera i dati dal foglio impianti_completi (mappatura colonne corrette)
      //    Col 2 -> localita, Col 3 -> indirizzo, Col 5 -> comune, Col 11 -> gestore
      const [csvRes, gasRes] = await Promise.all([
        fetch(`${baseUrl}/api/?action=get_station_csv&pbl=${encodeURIComponent(currentPbl)}`),
        fetch(`${baseUrl}/api/?action=get_station_info&pbl=${encodeURIComponent(currentPbl)}`).catch(() => null),
      ]);

      const csvJson = await csvRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gasJson: any = gasRes ? await gasRes.json().catch(() => ({})) : {};

      // I dati del foglio Google Sheets hanno priorità per gestore, indirizzo, comune, localita
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sheetStation: any = csvJson.success ? csvJson.station : {};
      const savedData = gasJson.savedData || {};

      const mapped: StationData = {
        ...INITIAL_STATE.station,
        ...(savedData.station || {}),
        // Dati dal foglio impianti_completi (colonne corrette):
        localita: sheetStation.localita || savedData.station?.localita || '',
        indirizzo: sheetStation.indirizzo || savedData.station?.indirizzo || '',
        comune: sheetStation.comune || savedData.station?.comune || '',
        gestore: sheetStation.gestore || savedData.station?.gestore || '',
        // Campi dal GAS o dai dati salvati
        prov: sheetStation.comune || gasJson.station?.prov || gasJson.station?.provincia || savedData.station?.prov || '',
        marchio: gasJson.station?.marchio || savedData.station?.marchio || '',
        codCliente: currentPbl,
        data: savedData.station?.data || data.station.data,
        ora: savedData.station?.ora || data.station.ora,
      };

      if (!csvJson.success && !gasJson.success) {
        toast.error('Impianto non trovato.');
        setLoading(false);
        return;
      }

      setData({
        station: mapped,
        fuels: savedData.fuels || INITIAL_STATE.fuels,
        calcoli: savedData.calcoli || INITIAL_STATE.calcoli
      });
      setHasLoadedData(true);
      toast.success('Dati impianto caricati correttamente!');

      // --- CARICAMENTO STORICO DAL FILE (GOOGLE SHEETS) ---
      try {
        const histCsvUrl = `${baseUrl}/api/?action=get_history_csv`;
        const histRes = await fetch(histCsvUrl);
        const csvText = await histRes.text();

        const lines = csvText.split('\n').map(l => l.trim()).filter(l => l !== '');
        if (lines.length > 0) {
          const parsedHistory = [];
          let latestDataFromHistory: any = null;

          for (let i = 0; i < lines.length; i++) {
            try {
              const line = lines[i];
              const firstComma = line.indexOf(',');
              if (firstComma === -1) continue;
              const secondComma = line.indexOf(',', firstComma + 1);
              if (secondComma === -1) continue;

              const rowPbl = line.substring(0, firstComma).replace(/"/g, '').trim();
              if (rowPbl !== currentPbl) continue;

              let jsonStr = line.substring(secondComma + 1).trim();
              if (jsonStr.startsWith('"')) {
                if (jsonStr.endsWith('"')) jsonStr = jsonStr.substring(1, jsonStr.length - 1);
                jsonStr = jsonStr.replace(/""/g, '"');
              }
              
              const rowData = JSON.parse(jsonStr);
              latestDataFromHistory = rowData; // L'ultima riga trovata per questo PBL sarà la più recente

              parsedHistory.push({
                date: rowData.station?.data || '',
                displayDate: (rowData.station?.data || '').split('-').reverse().join('/'),
                spb: getFuelDiff('spb', rowData),
                gasolio: getFuelDiff('gasolio', rowData),
                supreme: getFuelDiff('supreme', rowData),
                gpl: getFuelDiff('gpl', rowData),
                timestamp: i
              });
            } catch (e) { 
              if (i > 0) console.warn(`Errore parsing riga ${i}:`, e); 
            }
          }
          setHistoryData(parsedHistory);

          // Se non abbiamo dati salvati correnti, ma abbiamo trovato dati nello storico,
          // popoliamo i campi con l'ultima riconciliazione trovata.
          if (!gasJson.savedData && latestDataFromHistory) {
            setData(prev => ({
              ...prev,
              fuels: latestDataFromHistory.fuels || prev.fuels,
              calcoli: latestDataFromHistory.calcoli || prev.calcoli
            }));
            toast.success('Caricati dati dall\'ultima riconciliazione salvata.');
          }
        }
      } catch (err) {
        console.error('Errore caricamento storico dal file:', err);
      }

    } catch (err) {
      toast.error('Errore di connessione al server.');
    } finally { 
      setLoading(false); 
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const toastId = toast.loading('Salvataggio in corso...');
    try {
      const baseUrl = window.location.origin;
      const res = await fetch(`${baseUrl}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_reconciliation', pbl: data.station.codCliente, data })
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Salvato con successo!', { id: toastId });
        // Ricarichiamo lo storico dopo il salvataggio per aggiornare il grafico dal file
        loadStation();
        window.print();
      } else {
        toast.error('Errore restituito dal server.', { id: toastId });
      }
    } catch {
      toast.error('Impossibile completare il salvataggio.', { id: toastId });
    } finally { setSaving(false); }
  };

  const handleNew = () => {
    setData(prev => {
      const newFuels = { ...prev.fuels };
      const fuelsList: FuelType[] = ['spb', 'gasolio', 'supreme', 'gpl'];
      
      fuelsList.forEach(f => {
        newFuels[f] = {
          ...newFuels[f],
          dispensers: newFuels[f].dispensers.map(d => ({ ...d, chiusura: 0 })),
          cisterne: newFuels[f].cisterne.map(c => ({ altezza: 0, giacenza: 0 }))
        };
      });

      return {
        ...prev,
        station: {
          ...prev.station,
          data: new Date().toISOString().split('T')[0],
          ora: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
        },
        fuels: newFuels
      };
    });
    toast.success('Nuovo turno! Chiusure e Cisterne azzerate, Data aggiornata.');
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
    
    const diff = giacEffettiva - giacContabile;
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
      { l: "ECCED. (+) / CALO (-)", v: Math.round(diff), bold: true, isDiff: true, red: diff < 0, bg: diff < 0 ? 'bg-red-100' : 'bg-emerald-100' },
      { l: "CALO ANNUO CONSENTITO", v: Math.round(caloAnnuo), bold: true, suffix: ' lt' },
      { l: "ECCEDENZA CONSENTITA", v: Math.round(erogato * 0.005), bold: true, suffix: ' lt' },
    ];
  };

  const shouldHideInPrint = (f: FuelType) => {
    if (f === 'spb' || f === 'gasolio') return false;
    const d = data.fuels[f].dispensers;
    const c = data.fuels[f].cisterne;
    const hasDispenserData = d.some(x => x.apertura > 0 || x.chiusura > 0);
    const hasCisternaData = c.some(x => x.altezza > 0 || x.giacenza > 0);
    return !hasDispenserData && !hasCisternaData;
  };

  // --- RENDER HELPERS ---
  const renderTotalizzatori = (f: FuelType) => {
    const config = FUEL_CONFIG[f];
    const d = data.fuels[f].dispensers;
    const totals = d.map(x => Math.max(0, x.chiusura - x.apertura));
    const grandTotal = totals.reduce((a, b) => a + b, 0);
    const hidePrint = shouldHideInPrint(f) ? 'print:hidden' : '';

    return (
      <div className={`mb-4 break-inside-avoid ${hidePrint}`}>
        <h3 className={`font-bold text-xs mb-1 px-2 py-1 rounded-t-md ${config.header} ${config.text} uppercase flex items-center gap-2`}>
          <div className={`w-2 h-2 rounded-full ${config.icon}`} />
          {config.label}
        </h3>
        <table className="w-full text-[10px] border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-1 w-16 text-left">Erogatore</th>
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
                      <span className="block text-right pr-1 font-mono">{formatNum(totals[i])}</span>
                    ) : (
                      <>
                        <input 
                          type="number" 
                          className={`w-full h-6 px-1 text-right border-none bg-transparent focus:bg-blue-50 outline-none no-print ${row === 'chiusura' && item.chiusura < item.apertura ? 'text-red-700 font-black' : ''}`}
                          value={row === 'chiusura' ? item.chiusura : item.apertura}
                          onChange={e => updateFuel(f, 'dispensers', i, row, parseInt(e.target.value) || 0)} 
                        />
                        <span className={`hidden-screen print-show text-right pr-1 font-mono ${row === 'chiusura' && item.chiusura < item.apertura ? 'text-red-700 font-bold' : ''}`}>
                          {formatNum(row === 'chiusura' ? item.chiusura : item.apertura)}
                        </span>
                      </>
                    )}
                  </td>
                ))}
                <td className="border p-1 text-right font-bold bg-gray-200 font-mono text-slate-800">
                  {row === 'totale' ? formatNum(grandTotal) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCisterne = (f: FuelType) => {
    const config = FUEL_CONFIG[f];
    const cisterne = data.fuels[f].cisterne;
    const hidePrint = shouldHideInPrint(f) ? 'print:hidden' : '';
    
    return (
      <div className={`mb-2 break-inside-avoid ${hidePrint}`}>
        <h3 className={`font-bold text-[10px] mb-1 px-2 py-1 rounded-t-md ${config.header} ${config.text} uppercase flex items-center gap-2`}>
          <div className={`w-1.5 h-1.5 rounded-full ${config.icon}`} />
          {config.label}
        </h3>
        <table className="w-full text-[10px] border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-1 w-8">Tk</th>
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
                  <span className="hidden-screen print-show text-right pr-1 font-mono">{formatNum(c.altezza)}</span>
                </td>
                <td className="border p-0">
                  <input type="number" className="w-full h-6 px-1 text-right border-none bg-transparent no-print font-bold" value={c.giacenza} onChange={e => updateFuel(f, 'cisterne', i, 'giacenza', parseInt(e.target.value) || 0)} />
                  <span className="hidden-screen print-show text-right pr-1 font-mono font-bold">{formatNum(c.giacenza)}</span>
                </td>
              </tr>
            ))}
            <tr className="bg-gray-100 font-bold">
              <td colSpan={2} className="border p-1 text-right uppercase text-[8px]">Totale</td>
              <td className="border p-1 text-right font-mono text-slate-800 bg-gray-200">
                {formatNum(Math.round(cisterne.reduce((s, c) => s + c.giacenza, 0)))}
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
        <table className="w-full text-[9px] border-collapse border border-gray-300">
          <thead>
            <tr className="bg-slate-800 text-white uppercase text-[8px] print:bg-slate-800 print:text-white">
              <th className="border p-1.5 text-left w-48">Descrizione Movimento</th>
              <th className="border p-1.5 text-center bg-emerald-900/40">Benzina (Spb)</th>
              <th className="border p-1.5 text-center bg-amber-900/40">Gasolio</th>
              <th className={`border p-1.5 text-center bg-rose-900/40 ${shouldHideInPrint('supreme') ? 'print:hidden' : ''}`}>Supreme</th>
              <th className={`border p-1.5 text-center bg-cyan-900/40 ${shouldHideInPrint('gpl') ? 'print:hidden' : ''}`}>GPL</th>
            </tr>
          </thead>
          <tbody>
            {listSpb.map((row, i) => (
              <tr key={i} className={`${row.bold ? 'font-bold bg-gray-50' : ''} ${row.bg || ''}`}>
                <td className="border px-1.5 py-1">{row.l}</td>
                {[listSpb[i], listGasolio[i], listSupreme[i], listGpl[i]].map((cell, idx) => {
                  const fuels: FuelType[] = ['spb', 'gasolio', 'supreme', 'gpl'];
                  
                  let displayVal = formatNum(Math.abs(cell.v));
                  if (cell.isDiff) {
                    displayVal = cell.v === 0 ? '0' : (cell.v > 0 ? '+' : '-') + ' ' + displayVal;
                  }

                  return (
                    <td key={idx} className={`border px-1.5 py-1 text-right ${cell.red ? 'text-red-600' : ''} ${shouldHideInPrint(fuels[idx]) ? 'print:hidden' : ''}`}>
                      <div className="flex justify-end items-center gap-1">
                        {cell.k && (
                          <input type="number" 
                            className="w-16 h-5 text-right border border-gray-200 rounded px-1 no-print bg-white focus:ring-1 focus:ring-blue-500 outline-none" 
                            value={cell.v} 
                            onChange={e => updateCalcolo(fuels[idx], cell.k!, parseInt(e.target.value) || 0)} />
                        )}
                        <span className={cell.k ? 'hidden-screen print-show font-mono' : 'font-mono'}>
                          {displayVal}
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
  if (showError) return <div className="min-h-screen flex items-center justify-center text-[200px] animate-pulse">🖕🏼</div>;
  if (!isLogged) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col md:flex-row font-sans selection:bg-blue-500 selection:text-white">
        <Toaster position="top-center" reverseOrder={false} />
        <div className="hidden md:flex md:w-1/2 bg-slate-800 p-12 flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-blue-600 rounded-full blur-[100px] opacity-20 -mr-20 -mt-20 animate-float"></div>
          <div className="absolute bottom-0 left-0 p-32 bg-emerald-600 rounded-full blur-[100px] opacity-20 -ml-20 -mb-20 animate-float" style={{ animationDelay: '2s' }}></div>
          
          <div className="relative z-10 flex flex-col gap-6 animate-fade-in-up">
            <div className="bg-white/10 w-fit p-4 rounded-2xl backdrop-blur-sm border border-white/10 shadow-xl">
              <Lock className="text-white w-8 h-8" />
            </div>
            <div>
              <h1 className="text-5xl font-black text-white tracking-tight leading-tight">
                Riconciliazione <br/><span className="text-blue-400 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">Carburanti</span>
              </h1>
              <p className="mt-6 text-slate-300 text-lg leading-relaxed max-w-md">
                Piattaforma avanzata per la gestione contabile, rilevazione giacenze e quadratura fiscale per gli impianti di distribuzione carburanti.
              </p>
            </div>
            <div className="mt-4 rounded-2xl overflow-hidden border border-white/10 shadow-2xl animate-fade-in-up delay-300 group">
              <img 
                src="/assets/login-hero.png" 
                alt="Petrol Station Schematic" 
                className="w-full h-auto opacity-80 group-hover:opacity-100 transition-all duration-700 scale-100 group-hover:scale-105" 
              />
            </div>
          </div>
          
          <div className="relative z-10 text-slate-500 text-sm font-medium animate-fade-in-up delay-200">
            © {new Date().getFullYear()} - Accesso Limitato al Personale Autorizzato.
          </div>
        </div>
        
        <div className="w-full md:w-1/2 flex items-center justify-center p-8 bg-slate-50 relative">
          <form onSubmit={handleLogin} className="w-full max-w-sm flex flex-col gap-6 bg-white p-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100 animate-fade-in-up delay-100 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] transition-shadow duration-500">
            <div className="md:hidden text-center mb-6">
              <div className="bg-slate-900 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-slate-900/20">
                <Lock className="text-white w-6 h-6" />
              </div>
              <h1 className="text-2xl font-black text-slate-800">Riconciliazione</h1>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Codice di Accesso</label>
              <input 
                type="password" 
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center tracking-[0.5em] font-mono text-2xl outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-700 hover:bg-slate-100" 
                value={passInput} 
                onChange={e => setPassInput(e.target.value)} 
                autoFocus 
                placeholder="••••"
              />
            </div>
            <button type="submit" className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-slate-800 transition-all duration-300 shadow-lg shadow-slate-900/20 hover:shadow-xl hover:shadow-slate-900/30 hover:-translate-y-0.5 active:scale-95 text-sm uppercase tracking-wider mt-2 group relative overflow-hidden">
              <span className="relative z-10">Accedi al Sistema</span>
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- MAIN RENDER ---
  return (
    <div className="min-h-screen bg-slate-50 p-4 print:p-0 print:bg-white font-sans text-slate-900 leading-relaxed">
      <Toaster position="top-center" reverseOrder={false} toastOptions={{ className: 'no-print' }} />

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

      {/* MODALE STORICO */}
      {showHistory && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-[2rem] p-8 shadow-2xl w-full max-w-4xl flex flex-col gap-6 relative animate-fade-in-up">
            <button onClick={() => setShowHistory(false)} className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
              <X size={24} className="text-slate-600" />
            </button>
            
            <div>
              <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                <History className="text-indigo-600" size={28} />
                Storico Riconciliazioni
              </h2>
              <p className="text-slate-500 text-sm mt-1">Andamento delle eccedenze (+) e cali (-) degli ultimi salvataggi su questo dispositivo.</p>
            </div>

            {historyData.length === 0 ? (
              <div className="py-12 text-center text-slate-400 font-medium bg-slate-50 rounded-2xl border border-slate-100">
                Nessun dato storico trovato nel database per l'impianto {data.station.codCliente}. I dati verranno visualizzati dopo il primo salvataggio.
              </div>
            ) : (
              <div className="h-80 w-full bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="displayDate" tick={{fontSize: 10, fill: '#64748b'}} />
                    <YAxis tick={{fontSize: 10, fill: '#64748b'}} />
                    <Tooltip 
                      labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} 
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Line type="monotone" name="Benzina" dataKey="spb" stroke="#10b981" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                    <Line type="monotone" name="Gasolio" dataKey="gasolio" stroke="#f59e0b" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                    <Line type="monotone" name="Supreme" dataKey="supreme" stroke="#e11d48" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                    <Line type="monotone" name="GPL" dataKey="gpl" stroke="#06b6d4" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HEADER & CONTROLLI */}
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="bg-slate-800 text-white p-4 rounded-2xl flex justify-between items-center no-print shadow-[0_8px_30px_rgb(0,0,0,0.12)] animate-fade-in-up">
          <h1 className="font-bold uppercase tracking-tight flex items-center gap-3">
            <div className="bg-white/20 p-1.5 rounded-lg shadow-inner"><Printer size={16} /></div>
            Registro Carburanti v2.0
          </h1>
          <div className="flex flex-wrap gap-2 md:gap-3 justify-end">
            <button 
              onClick={() => setShowUTFForm(true)} 
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-4 py-2 rounded-xl font-bold text-[10px] md:text-sm transition-all shadow-lg shadow-blue-600/20 active:scale-95 text-white"
            >
              <FileText size={16}/> COMUNICAZIONE UTF
            </button>
            {hasLoadedData && (
              <>
                <button onClick={() => setShowHistory(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-3 md:px-4 py-2 rounded-xl font-bold text-[10px] md:text-sm transition-all shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:-translate-y-0.5 active:scale-95 text-white">
                  <History size={18}/> STORICO
                </button>
                <button onClick={handleNew} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-3 md:px-4 py-2 rounded-xl font-bold text-[10px] md:text-sm transition-all shadow-lg shadow-emerald-600/30 hover:shadow-emerald-600/50 hover:-translate-y-0.5 active:scale-95"><FilePlus size={18}/> NUOVO</button>
              </>
            )}
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-3 md:px-4 py-2 rounded-xl font-bold text-[10px] md:text-sm transition-all hover:shadow-lg active:scale-95"><Printer size={18}/> STAMPA</button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-3 md:px-4 py-2 rounded-xl font-bold text-[10px] md:text-sm transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 hover:-translate-y-0.5 active:scale-95"><Save size={18}/> {saving ? 'SALVATAGGIO...' : 'SALVA'}</button>
          </div>
        </div>

        {/* UTF FORM VIEW */}
        {showUTFForm && (
          <UTFForm 
            data={data} 
            onClose={() => setShowUTFForm(false)} 
          />
        )}

        {/* ANAGRAFICA */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow duration-300 space-y-4 animate-fade-in-up delay-100">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Codice Impianto</label>
              <div className="flex gap-2">
                <input className="flex-1 font-bold text-blue-900 border-b outline-none no-print" value={data.station.codCliente} onChange={e => updateStation('codCliente', e.target.value)} />
                <button onClick={loadStation} className="no-print text-blue-600 hover:bg-blue-50 p-1 rounded transition-colors"><Search size={18}/></button>
                <span className="hidden-screen print-show font-bold">{data.station.codCliente}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gestore</label>
              <input className="border-b outline-none no-print font-medium" value={data.station.gestore} onChange={e => updateStation('gestore', e.target.value)} />
              <span className="hidden-screen print-show font-medium">{data.station.gestore}</span>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Indirizzo</label>
              <input className="border-b outline-none no-print font-medium" value={data.station.indirizzo} onChange={e => updateStation('indirizzo', e.target.value)} />
              <span className="hidden-screen print-show font-medium">{data.station.indirizzo}</span>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Comune / Località</label>
              <div className="flex gap-1">
                <input placeholder="Comune" className="w-1/2 border-b outline-none no-print font-medium" value={data.station.comune} onChange={e => updateStation('comune', e.target.value)} />
                <input placeholder="Località" className="w-1/2 border-b outline-none no-print font-medium" value={data.station.localita} onChange={e => updateStation('localita', e.target.value)} />
              </div>
              <span className="hidden-screen print-show font-medium">{data.station.comune} {data.station.localita ? `(${data.station.localita})` : ''}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Marchio</label>
              <input className="border-b outline-none no-print font-medium" value={data.station.marchio} onChange={e => updateStation('marchio', e.target.value)} />
              <span className="hidden-screen print-show font-medium">{data.station.marchio}</span>
            </div>
            <div className="flex flex-col md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data e Ora</label>
              <div className="flex gap-2 items-center">
                <input type="date" className="border-b no-print text-[10px] outline-none" value={data.station.data} onChange={e => updateStation('data', e.target.value)} />
                <span className="hidden-screen print-show font-mono font-bold text-slate-700 text-[10px]">{data.station.data.split('-').reverse().join('/')} - {data.station.ora}</span>
              </div>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Storico Trovato</label>
              <div className="font-bold text-emerald-600 mt-1 border-b pb-1">
                {historyData.length} {historyData.length === 1 ? 'riga' : 'righe'}
              </div>
            </div>
          </div>
        </div>

        {/* TOTALIZZATORI */}
        <div className="bg-white p-6 border border-slate-100 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] page-break transition-all duration-500 hover:-translate-y-1 animate-fade-in-up delay-200">
          <h2 className="text-[11px] font-black mb-6 text-slate-800 border-b border-slate-100 pb-3 uppercase tracking-[0.15em] flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-slate-800 rounded-full shadow-sm animate-pulse" />
            1. Rilevazione Contatori Erogatori
          </h2>
          {renderTotalizzatori('spb')}
          {renderTotalizzatori('gasolio')}
          {renderTotalizzatori('supreme')}
          {renderTotalizzatori('gpl')}
        </div>

        {/* GIACENZE E CALCOLI */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in-up delay-300">
          <div className="bg-white p-6 border border-slate-100 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-500 hover:-translate-y-1">
            <h2 className="text-[11px] font-black mb-6 text-slate-800 border-b border-slate-100 pb-3 uppercase tracking-[0.15em] flex items-center gap-3">
              <div className="w-2.5 h-2.5 bg-slate-800 rounded-full shadow-sm animate-pulse" />
              2. Giacenze Fisiche (Cisterne)
            </h2>
            <div className="grid grid-cols-2 gap-5">
              {renderCisterne('spb')}
              {renderCisterne('gasolio')}
              {renderCisterne('supreme')}
              {renderCisterne('gpl')}
            </div>
          </div>
          <div className="bg-white p-6 border border-slate-100 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] w-full transition-all duration-500 hover:-translate-y-1">
            <h2 className="text-[11px] font-black mb-6 text-slate-800 border-b border-slate-100 pb-3 uppercase tracking-[0.15em] text-center bg-slate-50 rounded-xl p-2">
              3. Prospetto di Riconciliazione Movimenti e Cali
            </h2>
            {renderProspettoGenerale()}
          </div>
        </div>
      </div>
    </div>
  );
}
