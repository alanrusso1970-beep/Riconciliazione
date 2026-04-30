import React, { useState } from 'react';
import { X, Printer, FileText } from 'lucide-react';

interface UTFFormProps {
  data: any;
  onClose: () => void;
}

export default function UTFForm({ data, onClose }: UTFFormProps) {
  // Funzione per inizializzare i valori della tabella dai dati dell'app
  const getInitialTableData = (startLetter: string, empty: boolean = false) => {
    const isSecondTable = startLetter === 'j';
    const rowIds = isSecondTable ? ['j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 'diff'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'diff'];
    const fuels: ('spb' | 'gasolio' | 'supreme' | 'totale_gasolio' | 'olio')[] = ['spb', 'gasolio', 'supreme', 'totale_gasolio', 'olio'];
    
    const initialValues: Record<string, Record<string, number>> = {};

    if (empty) {
      rowIds.forEach(rowId => {
        initialValues[rowId] = {};
        fuels.forEach(f => {
          initialValues[rowId][f] = 0;
        });
      });
      return initialValues;
    }

    const calculateForType = (type: 'spb' | 'gasolio' | 'supreme') => {
      const fl = data.fuels[type];
      const calc = data.calcoli[type];
      const erogato = fl.dispensers.reduce((sum: number, disp: any) => sum + Math.max(0, disp.chiusura - disp.apertura), 0);
      const giacEffettiva = fl.cisterne.reduce((s: number, c: any) => s + c.giacenza, 0);
      const introdotto = calc.carico;
      const eccedenze = calc.eccedRegistrate + calc.scattiVuoto + calc.eccedenzeTrasporto;
      const totCarico = calc.rimananzeIniziali + introdotto + eccedenze;
      const cali = calc.caliGiaRegistrati + calc.caliViaggio + calc.caliTecnici;
      const totScarico = erogato + cali;
      const giacContabile = totCarico - totScarico;
      
      return {
        rim: calc.rimananzeIniziali,
        int: introdotto,
        ecc: eccedenze,
        totC: totCarico,
        ero: erogato,
        cal: cali,
        totS: totScarico,
        giaC: giacContabile,
        giaE: giacEffettiva,
        diff: giacEffettiva - giacContabile
      };
    };

    const g = calculateForType('gasolio');
    const s = calculateForType('supreme');
    const b = calculateForType('spb');
    const t = {
      rim: g.rim + s.rim,
      int: g.int + s.int,
      ecc: g.ecc + s.ecc,
      totC: g.totC + s.totC,
      ero: g.ero + s.ero,
      cal: g.cal + s.cal,
      totS: g.totS + s.totS,
      giaC: g.giaC + s.giaC,
      giaE: g.giaE + s.giaE,
      diff: g.diff + s.diff
    };

    rowIds.forEach(rowId => {
      initialValues[rowId] = {};
      fuels.forEach(f => {
        let val = 0;
        const source = f === 'spb' ? b : (f === 'gasolio' ? g : (f === 'supreme' ? s : (f === 'totale_gasolio' ? t : null)));
        
        if (source) {
          if (rowId === 'a' || rowId === 'j') val = source.rim;
          else if (rowId === 'b' || rowId === 'k') val = source.int;
          else if (rowId === 'c' || rowId === 'l') val = source.ecc;
          else if (rowId === 'd' || rowId === 'm') val = source.totC;
          else if (rowId === 'e' || rowId === 'n') val = source.ero;
          else if (rowId === 'f' || rowId === 'o') val = source.cal;
          else if (rowId === 'g' || rowId === 'p') val = source.totS;
          else if (rowId === 'h' || rowId === 'q') val = source.giaC;
          else if (rowId === 'i' || rowId === 'r') val = source.giaE;
          else if (rowId === 'diff') val = source.diff;
        }
        initialValues[rowId][f] = Math.round(val);
      });
    });

    return initialValues;
  };

  const [table1, setTable1] = useState(getInitialTableData('a', false));
  const [table2, setTable2] = useState(getInitialTableData('j', true)); 

  const [extra, setExtra] = useState({
    ufficioDogane: 'CATANIA',
    protN: '',
    vidimatoData: '',
    ditta: (data.station.gestore || '').toUpperCase(),
    codiceDitta: 'IT00',
    ubicazione: `${(data.station.indirizzo || '').toUpperCase()}, ${(data.station.comune || '').toUpperCase()} - ${(data.station.localita || '').toUpperCase()}`,
    chiusoAlN: '',
    delData: data.station.data.split('-').reverse().join('/'),
    esercizioFinanziario: new Date().getFullYear().toString(),
    documentiAllegati: '',
    note: `Le rimanenze effettive sono state riportate sul registro di carico e scarico n° ____ / ____ vidimato il ____________ per l'anno\nIl registro di cui al presente prospetto verrà custodito, per il previsto periodo di anni 5, al seguente indirizzo: ${(data.station.indirizzo || '').toUpperCase()} - ${(data.station.comune || '').toUpperCase()}`,
    annoRiepilogo: new Date().getFullYear().toString(),
  });

  const handleChangeExtra = (field: string, value: string) => {
    setExtra(prev => ({ ...prev, [field]: value }));
  };

  const handleChangeTable = (table: 1 | 2, rowId: string, fuel: string, value: string) => {
    const num = parseInt(value) || 0;
    if (table === 1) {
      setTable1(prev => ({ ...prev, [rowId]: { ...prev[rowId], [fuel]: num } }));
    } else {
      setTable2(prev => ({ ...prev, [rowId]: { ...prev[rowId], [fuel]: num } }));
    }
  };

  const fuels: ('spb' | 'gasolio' | 'supreme' | 'totale_gasolio' | 'olio')[] = ['spb', 'gasolio', 'supreme', 'totale_gasolio', 'olio'];
  const labels = ['BENZINA', 'GASOLIO', 'GASOLIO SUPREME', 'TOTALE GASOLIO', 'OLIO LUBR. Kg.'];
  
  const renderTableRows = (tableNum: 1 | 2) => {
    const isTable2 = tableNum === 2;
    const currentTableData = isTable2 ? table2 : table1;
    const rowLabels = isTable2 ? [
      { id: 'j', l: `Rimanenza al 31/12/${parseInt(extra.esercizioFinanziario) - 1}` },
      { id: 'k', l: `Introdotto dal 01/01/${extra.esercizioFinanziario}` },
      { id: 'l', l: 'Eccedenze' },
      { id: 'm', l: 'Totale Carico (j+k+l)', bold: true },
      { id: 'n', l: 'Erogato' },
      { id: 'o', l: 'Cali (b: reg + c: viag + d: tecn)' },
      { id: 'p', l: 'Totale Scarico (n+o)', bold: true },
      { id: 'q', l: 'Giacenza Contabile' },
      { id: 'r', l: 'Giacenza Effettiva' },
      { id: 'diff', l: 'DIFFERENZA (q-r)', bold: true }
    ] : [
      { id: 'a', l: `Rimanenza al 31/12/${parseInt(extra.esercizioFinanziario) - 1}` },
      { id: 'b', l: `Introdotto dal 01/01/${extra.esercizioFinanziario}` },
      { id: 'c', l: 'Eccedenze' },
      { id: 'd', l: 'Totale Carico (a+b+c)', bold: true },
      { id: 'e', l: 'Erogato' },
      { id: 'f', l: 'Cali (b: reg + c: viag + d: tecn)' },
      { id: 'g', l: 'Totale Scarico (e+f)', bold: true },
      { id: 'h', l: 'Giacenza Contabile' },
      { id: 'i', l: 'Giacenza Effettiva' },
      { id: 'diff', l: 'DIFFERENZA (h-i)', bold: true }
    ];

    return rowLabels.map((row) => (
      <tr key={row.id}>
        <td className="border border-black p-1 text-[9px] w-56 font-bold whitespace-nowrap">
          ({row.id}) {row.l}
        </td>
        {fuels.map((f) => (
          <td key={f} className="border border-black p-0 text-right font-black text-[10px]">
            <input 
              type="number" 
              className="w-full h-full p-0.5 text-right border-none outline-none bg-transparent font-black no-print"
              value={currentTableData[row.id][f] === 0 ? '' : currentTableData[row.id][f]} 
              onChange={e => handleChangeTable(tableNum, row.id, f, e.target.value)}
            />
            <span className="hidden print:block pr-1 font-black text-black">
              {currentTableData[row.id][f] === 0 ? '' : currentTableData[row.id][f]}
            </span>
          </td>
        ))}
      </tr>
    ));
  };

  return (
    <div className="fixed inset-0 bg-white z-[500] overflow-y-auto p-2 md:p-8 font-serif text-black print:static print:p-0 print:overflow-visible">
      {/* Barra strumenti non stampabile */}
      <div className="max-w-[1100px] mx-auto mb-2 flex justify-between items-center no-print bg-slate-100 p-2 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 text-slate-800">
          <FileText size={18} className="text-blue-600" />
          <h2 className="font-bold text-sm">Comunicazione UTF Dogane</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-blue-500 transition-all text-xs">
            <Printer size={16} /> STAMPA
          </button>
          <button onClick={onClose} className="flex items-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-1.5 rounded-lg font-bold hover:bg-slate-50 transition-all text-xs">
            <X size={16} /> CHIUDI
          </button>
        </div>
      </div>

      {/* MODULO REALE */}
      <div className="max-w-[1100px] mx-auto bg-white p-2 print:p-0 print:max-w-full text-black">
        {/* HEADER */}
        <div className="border-b-2 border-black pb-1 mb-2">
          <div className="flex justify-between items-end">
            <h1 className="text-xl font-black uppercase tracking-widest whitespace-nowrap">
              ALL'UFFICIO DELLE DOGANE DI
            </h1>
            <div className="flex-1 border-b-2 border-black mx-4 relative h-8">
              <input 
                className="absolute inset-0 w-full bg-transparent border-none outline-none text-center font-black uppercase text-xl no-print" 
                value={extra.ufficioDogane} 
                onChange={e => handleChangeExtra('ufficioDogane', e.target.value)} 
              />
              <span className="hidden print:block text-center font-black text-xl uppercase pt-0.5">
                {extra.ufficioDogane}
              </span>
            </div>
          </div>
        </div>

        {/* TESTO DESCRITTIVO */}
        <div className="text-[11px] leading-relaxed mb-3 space-y-1.5 px-1">
          <div className="flex flex-wrap items-end gap-x-1">
            <span>Si trasmette il prospetto di chiusura del registro di carico e scarico <strong>Prot. N.</strong></span>
            <div className="border-b border-black min-w-[120px] relative h-4">
              <input className="absolute inset-0 w-full bg-transparent border-none outline-none text-center font-black no-print" value={extra.protN} onChange={e => handleChangeExtra('protN', e.target.value)} />
              <span className="hidden print:block text-center font-black">{extra.protN}</span>
            </div>
            <span>vidimato in data</span>
            <div className="border-b border-black min-w-[140px] relative h-4">
              <input className="absolute inset-0 w-full bg-transparent border-none outline-none text-center font-black no-print" value={extra.vidimatoData} onChange={e => handleChangeExtra('vidimatoData', e.target.value)} />
              <span className="hidden print:block text-center font-black">{extra.vidimatoData}</span>
            </div>
            <span>della ditta</span>
            <span className="font-black border-b border-black px-1 uppercase">{extra.ditta}</span>
            <span>,</span>
          </div>
          <div className="flex flex-wrap items-end gap-x-1">
            <span>Codice Ditta <strong>IT00</strong></span>
            <div className="border-b border-black min-w-[180px] relative h-4">
              <input className="absolute inset-0 w-full bg-transparent border-none outline-none px-1 font-black no-print" value={extra.codiceDitta.replace('IT00', '')} onChange={e => handleChangeExtra('codiceDitta', 'IT00' + e.target.value)} />
              <span className="hidden print:block px-1 font-black">{extra.codiceDitta.replace('IT00', '')}</span>
            </div>
            <span>, per l'esercizio del I.D.C. ubicato in</span>
            <span className="font-black border-b border-black px-1 uppercase">{extra.ubicazione}</span>
            <span>. Il registro è stato chiuso al <strong>N.</strong></span>
            <div className="border-b border-black min-w-[80px] relative h-4">
              <input className="absolute inset-0 w-full bg-transparent border-none outline-none text-center font-black no-print" value={extra.chiusoAlN} onChange={e => handleChangeExtra('chiusoAlN', e.target.value)} />
              <span className="hidden print:block text-center font-black">{extra.chiusoAlN}</span>
            </div>
            <span>del</span>
          </div>
          <div className="flex flex-wrap items-end gap-x-1 no-print">
            <span className="font-black border-b border-black px-4">{extra.delData}</span>
            <span>d'ordine del carico per FINE ESERCIZIO FINANZIARIO <strong>{extra.esercizioFinanziario}</strong>. Al suddetto registro sono allegati n.</span>
            <div className="border-b border-black min-w-[60px] relative h-4">
              <input className="absolute inset-0 w-full bg-transparent border-none outline-none text-center font-black no-print" value={extra.documentiAllegati} onChange={e => handleChangeExtra('documentiAllegati', e.target.value)} />
              <span className="hidden print:block text-center font-black">{extra.documentiAllegati}</span>
            </div>
            <span>documenti di CARICO.</span>
          </div>
        </div>

        {/* TABELLA 1 */}
        <table className="w-full border-collapse border-2 border-black mb-3">
          <thead>
            <tr className="bg-gray-50 font-black text-[10px]">
              <th className="border border-black p-1.5 w-56 text-left"></th>
              {labels.map(l => <th key={l} className="border border-black p-1.5 text-center">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {renderTableRows(1)}
          </tbody>
        </table>

        {/* TABELLA 2 (RIEPILOGO) */}
        <div className="mb-0.5 flex justify-between items-end text-[10px] px-1 font-bold">
          <span>RIEPILOGO ESERCIZIO FINANZIARI ANNO <strong className="ml-1 border-b border-black px-2">{extra.annoRiepilogo}</strong></span>
          <span className="italic text-[8px] font-normal">(compilare in caso di chiusure intermedie per verifiche UTF o GdF)</span>
        </div>
        <table className="w-full border-collapse border-2 border-black mb-3">
          <thead>
            <tr className="bg-gray-50 font-black text-[10px]">
              <th className="border border-black p-1.5 w-56 text-left"></th>
              {labels.map(l => <th key={l} className="border border-black p-1.5 text-center">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {renderTableRows(2)}
          </tbody>
        </table>

        {/* VALORI CHIUSURE EROGATORI */}
        <div className="mb-2 px-1 text-black">
          <h3 className="font-black uppercase text-[10px] mb-1 border-b-[3px] border-black inline-block">Chiusure Erogatori per Prodotto</h3>
          <div className="flex flex-row gap-1.5 w-full">
            {['spb', 'gasolio', 'supreme', 'olio'].map((f, i) => {
              const dispensers = (data.fuels[f]?.dispensers || []).filter((d: any) => d.chiusura > 0);
              const label = ['BENZINA', 'GASOLIO', 'GASOLIO SUPREME', 'OLIO LUBR. KG.'][i];
              return (
                <div key={f} className="flex-1 border-2 border-black flex flex-col bg-white overflow-hidden">
                  <div className="font-black text-[9px] border-b border-black text-center bg-gray-100 py-1 uppercase">{label}</div>
                  <div className="px-1.5 py-1.5 flex-1">
                    <div className="space-y-0.5">
                      {dispensers.map((d: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-[10px] font-black leading-tight">
                          <span>P{idx+1}:</span>
                          <span className="font-mono tracking-tighter">{d.chiusura}</span>
                        </div>
                      ))}
                      {dispensers.length === 0 && (
                        <div className="flex items-center justify-center text-[9px] italic text-gray-300 font-medium py-6 text-center">
                          Nessun dato
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* NOTE E FIRMA */}
        <div className="flex flex-col mt-2 px-1">
          <div className="w-full">
            <h4 className="font-black underline mb-1 uppercase text-[10px]">Note esplicative</h4>
            <div className="text-[9px] leading-tight font-bold whitespace-pre-wrap w-full">
              {extra.note}
            </div>
          </div>
          <div className="w-full text-center flex flex-col items-center pt-2 no-print">
            <div className="border-t-2 border-black w-1/3 pt-2 font-black uppercase text-[11px] tracking-tight">
              TIMBRO E FIRMA DELLA DITTA
              <div className="h-16"></div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4 landscape; margin: 0.4cm; }
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; color: black !important; font-family: serif !important; font-size: 9px !important; }
          * { color: black !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; border-color: black !important; }
          .fixed { position: static !important; overflow: visible !important; height: auto !important; width: auto !important; }
          .max-w-[1100px] { max-width: 100% !important; width: 100% !important; margin: 0 !important; transform: scale(0.9); transform-origin: top center; }
          table { border: 1.5px solid black !important; border-collapse: collapse !important; width: 100% !important; }
          td, th { border: 1px solid black !important; padding: 2px 4px !important; }
          input { display: none !important; }
          h1 { font-size: 16px !important; }
          .text-xl { font-size: 16px !important; }
          .text-[11px] { font-size: 9px !important; }
          .text-[10px] { font-size: 8px !important; }
          .text-[9px] { font-size: 7px !important; }
        }
      `}} />
    </div>
  );
}
