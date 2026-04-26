import React, { useState, useEffect } from 'react';
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
      const introdotto = calc.carico + calc.scattiVuoto + calc.eccedenzeTrasporto;
      const eccedenze = calc.eccedRegistrate;
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
  const [table2, setTable2] = useState(getInitialTableData('j', true)); // Seconda tabella inizialmente VUOTA

  const [extra, setExtra] = useState({
    ufficioDogane: 'SIRACUSA',
    protN: '',
    vidimatoData: '',
    ditta: data.station.gestore || '',
    codiceDitta: 'IT00SRY',
    ubicazione: `${data.station.indirizzo} - ${data.station.comune}`,
    chiusoAlN: '',
    delData: data.station.data.split('-').reverse().join('/'),
    esercizioFinanziario: new Date().getFullYear().toString(),
    documentiAllegati: '',
    note: `Le rimanenze effettive sono state riportate sul registro di carico e scarico n° ____ / ____ vidimato il ____________ per l'anno ________.\nIl registro di cui al presente prospetto verrà custodito, per il previsto periodo di anni 5, al seguente indirizzo: ${data.station.indirizzo} - ${data.station.comune}`,
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
      { id: 'j', l: 'Rimanenza al 31/12/' },
      { id: 'k', l: 'Introdotto dal 01/01/' },
      { id: 'l', l: 'Eccedenze' },
      { id: 'm', l: 'Totale Carico (J+k+l)', bold: true },
      { id: 'n', l: 'Erogato' },
      { id: 'o', l: 'Cali' },
      { id: 'p', l: 'Totale Scarico (n+o)', bold: true },
      { id: 'q', l: 'Giacenza Contabile' },
      { id: 'r', l: 'Giacenza Effettiva' },
      { id: 'diff', l: 'DIFFERENZA (q-r)', bold: true }
    ] : [
      { id: 'a', l: 'Rimanenza al 31/12/' },
      { id: 'b', l: 'Introdotto dal 01/01/' },
      { id: 'c', l: 'Eccedenze' },
      { id: 'd', l: 'Totale Carico (a+b+c)', bold: true },
      { id: 'e', l: 'Erogato' },
      { id: 'f', l: 'Cali' },
      { id: 'g', l: 'Totale Scarico (e+f)', bold: true },
      { id: 'h', l: 'Giacenza Contabile' },
      { id: 'i', l: 'Giacenza Effettiva' },
      { id: 'diff', l: 'DIFFERENZA (h-i)', bold: true }
    ];

    return rowLabels.map((row) => (
      <tr key={row.id} className={row.bold ? 'font-bold bg-gray-50' : ''}>
        <td className="border border-black p-1 text-[10px] w-48">
          ({row.id}) <strong>{row.l}</strong>
        </td>
        {fuels.map((f) => (
          <td key={f} className="border border-black p-0 text-right font-mono text-[10px]">
            <input 
              type="number" 
              className="w-full h-full p-1 text-right border-none outline-none bg-transparent"
              value={currentTableData[row.id][f] === 0 ? '' : currentTableData[row.id][f]} 
              onChange={e => handleChangeTable(tableNum, row.id, f, e.target.value)}
            />
          </td>
        ))}
      </tr>
    ));
  };

  return (
    <div className="fixed inset-0 bg-white z-[500] overflow-y-auto p-4 md:p-8 font-serif text-black print:p-0">
      {/* Barra strumenti non stampabile */}
      <div className="max-w-5xl mx-auto mb-8 flex justify-between items-center no-print bg-slate-100 p-4 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-3 text-slate-800">
          <FileText className="text-blue-600" />
          <h2 className="font-bold">Comunicazione UTF Dogane</h2>
        </div>
        <div className="flex gap-4">
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-200">
            <Printer size={20} /> STAMPA MODULO
          </button>
          <button onClick={onClose} className="flex items-center gap-2 bg-white text-slate-600 border border-slate-200 px-6 py-2 rounded-xl font-bold hover:bg-slate-50 transition-all">
            <X size={20} /> CHIUDI
          </button>
        </div>
      </div>

      {/* MODULO REALE */}
      <div className="max-w-5xl mx-auto bg-white border border-transparent print:border-none p-4 md:p-8">
        <div className="text-center mb-8">
          <h1 className="text-xl font-black uppercase tracking-widest border-b-2 border-black pb-2 flex items-center justify-center gap-2">
            ALL'UFFICIO DELLE DOGANE DI 
            <input 
              className="border-b border-black outline-none w-64 text-center font-black uppercase" 
              value={extra.ufficioDogane} 
              onChange={e => handleChangeExtra('ufficioDogane', e.target.value)} 
              placeholder="____________________"
            />
          </h1>
        </div>

        <div className="text-[12px] leading-relaxed mb-6 space-y-2">
          <p>
            Si trasmette il prospetto di chiusura del registro di carico e scarico 
            <strong> Prot. N. </strong> 
            <input className="border-b border-black outline-none w-24 text-center px-1" value={extra.protN} onChange={e => handleChangeExtra('protN', e.target.value)} />
            vidimato in data 
            <input className="border-b border-black outline-none w-32 text-center px-1" value={extra.vidimatoData} onChange={e => handleChangeExtra('vidimatoData', e.target.value)} />
            della ditta 
            <input className="border-b border-black outline-none w-64 px-1" value={extra.ditta} onChange={e => handleChangeExtra('ditta', e.target.value)} />,
          </p>
          <p>
            Codice Ditta <strong>{extra.codiceDitta}</strong>
            <input className="border-b border-black outline-none w-32 px-1 ml-1" value={extra.codiceDitta.replace('IT00SRY', '')} onChange={e => handleChangeExtra('codiceDitta', 'IT00SRY' + e.target.value)} />,
            per l'esercizio del I.D.C. ubicato in 
            <input className="border-b border-black outline-none w-80 px-1" value={extra.ubicazione} onChange={e => handleChangeExtra('ubicazione', e.target.value)} />.
            Il registro è stato chiuso al <strong> N. </strong> 
            <input className="border-b border-black outline-none w-20 text-center px-1" value={extra.chiusoAlN} onChange={e => handleChangeExtra('chiusoAlN', e.target.value)} />
            del 
            <input className="border-b border-black outline-none w-32 text-center px-1" value={extra.delData} onChange={e => handleChangeExtra('delData', e.target.value)} />
          </p>
          <p>
            d'ordine del carico per FINE ESERCIZIO FINANZIARIO 
            <input className="border-b border-black outline-none w-24 text-center px-1 font-bold" value={extra.esercizioFinanziario} onChange={e => handleChangeExtra('esercizioFinanziario', e.target.value)} />.
            Al suddetto registro sono allegati n. 
            <input className="border-b border-black outline-none w-16 text-center px-1" value={extra.documentiAllegati} onChange={e => handleChangeExtra('documentiAllegati', e.target.value)} />
            documenti di CARICO.
          </p>
        </div>

        {/* TABELLA 1 */}
        <table className="w-full border-collapse border border-black mb-8">
          <thead>
            <tr className="bg-gray-100 font-bold text-[10px]">
              <th className="border border-black p-1 w-48"></th>
              {labels.map(l => <th key={l} className="border border-black p-1 text-center">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {renderTableRows(1)}
          </tbody>
        </table>

        {/* TABELLA 2 (RIEPILOGO) */}
        <div className="mb-2 flex justify-between items-end text-[10px]">
          <h3 className="font-bold uppercase">RIEPILOGO ESERCIZIO FINANZIARI ANNO <input className="border-b border-black outline-none w-16 text-center" value={extra.annoRiepilogo} onChange={e => handleChangeExtra('annoRiepilogo', e.target.value)} /></h3>
          <span className="italic">(compilare in caso di chiusure intermedie per verifiche UTF o GdF)</span>
        </div>
        <table className="w-full border-collapse border border-black mb-8">
          <thead>
            <tr className="bg-gray-100 font-bold text-[10px]">
              <th className="border border-black p-1 w-48"></th>
              {labels.map(l => <th key={l} className="border border-black p-1 text-center">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {renderTableRows(2)}
          </tbody>
        </table>

        {/* NOTE E FIRMA */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-12">
          <div className="text-[11px] leading-relaxed">
            <h4 className="font-bold underline mb-2">Note esplicative</h4>
            <textarea 
              className="w-full h-32 border-none outline-none resize-none bg-transparent"
              value={extra.note}
              onChange={e => handleChangeExtra('note', e.target.value)}
            />
          </div>
          <div className="text-center flex flex-col justify-end items-center">
            <div className="border-t border-black w-64 pt-2 font-bold uppercase text-[12px]">
              TIMBRO E FIRMA DELLA DITTA
              <div className="h-24"></div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          body { background: white; margin: 0; padding: 0; }
          .fixed { position: static !important; }
          textarea { height: auto !important; }
          input { border-bottom: 1px solid black !important; }
        }
      `}} />
    </div>
  );
}
