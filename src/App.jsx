import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Minus, Trash2, TrendingUp, TrendingDown, Wallet, 
  X, Save, RefreshCw, Settings, Loader2, Target, Cloud, Copy, AlertCircle
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- Firebase Config ---
// Replace this object with your own keys from the Firebase Console
//const firebaseConfig = typeof __firebase_config !== 'undefined' 
//  ? JSON.parse(__firebase_config) 
//  : { /* PASTE FIREBASE CONFIG HERE */ };
  
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCb7tKOjEKYobr7E3-UnHCD2gm_Jt9h5Tg",
  authDomain: "portfolio-e5fe8.firebaseapp.com",
  projectId: "portfolio-e5fe8",
  storageBucket: "portfolio-e5fe8.firebasestorage.app",
  messagingSenderId: "1090016327730",
  appId: "1:1090016327730:web:bccc71fd58667ba23ce42b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);  

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Utilities ---
const ACCOUNT_TYPES = ['TFSA', 'RRSP', 'FHSA', 'Non-Registered'];
const CURRENCIES = ['CAD', 'USD'];
const ASSET_TYPES = ['Stock/ETF', 'Cash'];

const formatMoney = (amount, currency = 'CAD') => {
  const safeAmount = isNaN(amount) ? 0 : amount;
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: currency, maximumFractionDigits: 2 }).format(safeAmount);
};

const formatNumber = (num) => new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2 }).format(num);

// --- Components ---
const Card = ({ children, className = "" }) => (
  <div className={`bg-slate-800 rounded-xl border border-slate-700 shadow-lg ${className}`}>{children}</div>
);

const Badge = ({ children, type }) => {
  const colors = {
    CAD: 'bg-red-900/30 text-red-400 border-red-800',
    USD: 'bg-green-900/30 text-green-400 border-green-800',
    default: 'bg-slate-700 text-slate-300 border-slate-600',
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${colors[type] || colors.default}`}>
      {children}
    </span>
  );
};

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 fade-in">
      <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---
export default function PortfolioDashboard() {
  
  // --- State ---
  const [user, setUser] = useState(null);
  const [syncId, setSyncId] = useState(() => localStorage.getItem('portfolio_sync_id') || '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('finnhub_key') || '');
  
  // EMPTY INITIAL STATE
  const [holdings, setHoldings] = useState([]);
  const [accountPrincipals, setAccountPrincipals] = useState({ 'FHSA': 0, 'TFSA': 0, 'RRSP': 0, 'Non-Registered': 0 });
  const [exchangeRate, setExchangeRate] = useState(1.41); // Default fallback
  
  // UI State
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPrincipalModalOpen, setIsPrincipalModalOpen] = useState(false);
  
  const [selectedAccountForPrincipal, setSelectedAccountForPrincipal] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [importSyncId, setImportSyncId] = useState('');

  // Transaction Form State
  const [transactData, setTransactData] = useState({
    type: 'buy',
    ticker: '',
    quantity: '',
    price: '', 
    currency: 'CAD',
    account: 'TFSA',
    assetType: 'Stock/ETF'
  });

  // --- Auth & Sync ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) {
            setUser(u);
            // Create a sync ID if one doesn't exist locally
            if (!localStorage.getItem('portfolio_sync_id')) {
                const newId = u.uid.substring(0, 8);
                setSyncId(newId);
                localStorage.setItem('portfolio_sync_id', newId);
            }
        }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !syncId) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'portfolios', syncId);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.holdings) setHoldings(data.holdings);
        if (data.principals) setAccountPrincipals(data.principals);
        if (data.exchangeRate) setExchangeRate(data.exchangeRate);
      } else {
        // If no cloud data, we save our empty/initial state to cloud to initialize it
        saveToCloud(holdings, accountPrincipals, exchangeRate);
      }
    });
    return () => unsub();
  }, [user, syncId]);

  const saveToCloud = async (newHoldings, newPrincipals, newRate) => {
      if (!user || !syncId) return;
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'portfolios', syncId);
      await setDoc(docRef, { holdings: newHoldings, principals: newPrincipals, exchangeRate: newRate }, { merge: true });
  };

  const updateHoldings = (newHoldings) => { setHoldings(newHoldings); saveToCloud(newHoldings, accountPrincipals, exchangeRate); };
  const updatePrincipals = (newPrincipals) => { setAccountPrincipals(newPrincipals); saveToCloud(holdings, newPrincipals, exchangeRate); };
  const updateExchangeRate = (newRate) => { setExchangeRate(newRate); saveToCloud(holdings, accountPrincipals, newRate); }

  useEffect(() => { localStorage.setItem('finnhub_key', apiKey); }, [apiKey]);

  // --- Calculations ---
  const stats = useMemo(() => {
    let currentVal = 0;
    let totalPrincipal = 0;
    const breakdown = {};

    ACCOUNT_TYPES.forEach(t => {
        // Show account if it has holdings OR if principal is set
        if (holdings.some(h => h.account === t) || (accountPrincipals[t] && accountPrincipals[t] > 0)) {
            breakdown[t] = { value: 0, principal: accountPrincipals[t] || 0, items: [] };
            totalPrincipal += (accountPrincipals[t] || 0);
        }
    });

    holdings.forEach(h => {
      const mult = h.currency === 'USD' ? exchangeRate : 1;
      const price = (h.currentPrice > 0) ? h.currentPrice : h.avgCost;
      const val = h.quantity * price * mult;
      currentVal += val;
      if (!breakdown[h.account]) breakdown[h.account] = { value: 0, principal: 0, items: [] };
      breakdown[h.account].value += val;
      breakdown[h.account].items.push(h);
    });

    const gain = currentVal - totalPrincipal;
    const gainPct = totalPrincipal > 0 ? (gain / totalPrincipal) * 100 : 0;
    return { currentVal, totalPrincipal, gain, gainPct, breakdown };
  }, [holdings, exchangeRate, accountPrincipals]);

  // --- Actions ---
  const fetchLivePrices = async () => {
    if (!apiKey) { alert("Please enter API Key in Settings first."); setIsSettingsModalOpen(true); return; }
    setIsLoading(true);
    const updated = [...holdings];
    
    try {
        const fxRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=OANDA:USD_CAD&token=${apiKey}`);
        const fxData = await fxRes.json();
        if (fxData.c > 0) updateExchangeRate(fxData.c);
    } catch (e) {}

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].type === 'Cash') continue;
      let t = updated[i].ticker;
      if (updated[i].currency === 'CAD' && !t.includes('.')) t += '.TO';
      try {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${t}&token=${apiKey}`);
        const d = await res.json();
        if (d.c > 0) updated[i].currentPrice = d.c;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 150));
    }
    updateHoldings(updated);
    setLastUpdated(new Date());
    setIsLoading(false);
  };

  const handleTransactionSubmit = (e) => {
    e.preventDefault();
    
    const qty = Number(transactData.quantity);
    const price = Number(transactData.price); 
    const ticker = transactData.assetType === 'Cash' 
        ? (transactData.currency === 'CAD' ? 'CASH' : 'USD CASH') 
        : transactData.ticker.toUpperCase();
    
    const existingIndex = holdings.findIndex(h => 
        h.ticker === ticker && h.account === transactData.account
    );

    let newHoldings = [...holdings];

    if (existingIndex >= 0) {
        const h = newHoldings[existingIndex];
        if (transactData.type === 'buy') {
            const totalOldCost = h.quantity * h.avgCost;
            const totalNewCost = qty * price;
            const newTotalQty = h.quantity + qty;
            h.avgCost = transactData.assetType === 'Cash' ? 1 : (totalOldCost + totalNewCost) / newTotalQty;
            h.quantity = newTotalQty;
        } else {
            if (qty > h.quantity) { alert("Cannot sell more than owned."); return; }
            h.quantity -= qty;
        }
        if (h.quantity <= 0) newHoldings = newHoldings.filter((_, idx) => idx !== existingIndex);
    } else {
        if (transactData.type === 'sell') { alert("Cannot sell asset you don't own."); return; }
        newHoldings.push({
            id: Date.now(),
            ticker: ticker,
            quantity: qty,
            avgCost: price,
            currentPrice: price,
            currency: transactData.currency,
            account: transactData.account,
            type: transactData.assetType
        });
    }

    updateHoldings(newHoldings);
    setIsTransactionModalOpen(false);
    setTransactData({ type: 'buy', ticker: '', quantity: '', price: '', currency: 'CAD', account: 'TFSA', assetType: 'Stock/ETF' });
  };

  const openTransaction = (type, holding = null) => {
      if (holding) {
          setTransactData({
              type: type,
              ticker: holding.ticker,
              quantity: '',
              price: holding.currentPrice || holding.avgCost,
              currency: holding.currency,
              account: holding.account,
              assetType: holding.type
          });
      } else {
          setTransactData(prev => ({ ...prev, type: type, ticker: '', quantity: '', price: '' }));
      }
      setIsTransactionModalOpen(true);
  };

  const handleImportSync = () => {
      if(importSyncId.length > 3) {
          setSyncId(importSyncId);
          localStorage.setItem('portfolio_sync_id', importSyncId);
          setIsSettingsModalOpen(false);
          alert("Synced!");
      }
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-24">
      
      {/* Navbar */}
      <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 text-white p-2 rounded-lg"><Wallet size={20} /></div>
              <div>
                <h1 className="text-xl font-bold text-white leading-tight">My Portfolio</h1>
                {lastUpdated && <p className="text-[10px] text-slate-400">Updated {lastUpdated.toLocaleTimeString()}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end mr-2">
                  <span className="text-[10px] text-slate-500 font-bold">USD/CAD</span>
                  <span className="text-sm font-bold text-slate-300">{exchangeRate.toFixed(4)}</span>
              </div>
              
              <button onClick={fetchLivePrices} disabled={isLoading} className={`p-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-all ${isLoading ? 'animate-spin text-blue-400' : 'text-slate-400'}`}>
                {isLoading ? <Loader2 size={18} /> : <RefreshCw size={18} />}
              </button>

              <button onClick={() => setIsSettingsModalOpen(true)} className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all">
                <Settings size={18} />
              </button>

              <button onClick={() => openTransaction('buy')} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                <Plus size={16} /> <span className="hidden sm:inline">Add</span>
              </button>
            </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        {/* Empty State Greeting */}
        {holdings.length === 0 && stats.totalPrincipal === 0 && (
          <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/50">
             <div className="flex justify-center mb-4 text-slate-600"><Wallet size={64} strokeWidth={1} /></div>
             <h2 className="text-xl font-bold text-white mb-2">Your portfolio is empty</h2>
             <p className="text-slate-400 max-w-md mx-auto mb-6">Add your first stock, ETF, or cash balance to start tracking your wealth.</p>
             <button onClick={() => openTransaction('buy')} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-500 transition-colors">
                Add First Asset
             </button>
          </div>
        )}

        {/* Holdings */}
        <div className="space-y-6">
          {Object.entries(stats.breakdown).map(([acc, data]) => {
            const gain = data.value - data.principal;
            const gainPct = data.principal > 0 ? (gain / data.principal) * 100 : 0;
            return (
            <div key={acc} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-8 rounded-full ${acc === 'TFSA' ? 'bg-teal-500' : acc === 'RRSP' ? 'bg-purple-500' : 'bg-blue-500'}`}></div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-md font-bold text-white">{acc}</h3>
                            <button onClick={() => {setSelectedAccountForPrincipal(acc); setIsPrincipalModalOpen(true);}} className="text-[10px] text-slate-400 hover:text-blue-400 border border-slate-700 px-2 py-0.5 rounded bg-slate-800 flex items-center gap-1">
                                <Target size={10} /> {data.principal > 0 ? formatMoney(data.principal) : "Set Cash"}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-lg font-bold text-white">{formatMoney(data.value)}</p>
                    <p className={`text-xs font-bold ${gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {gain >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
                    </p>
                </div>
              </div>

              {data.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-slate-500 font-medium border-b border-slate-800 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 w-24">Ticker</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3 text-right">Shares</th>
                      <th className="px-4 py-3 text-right">Avg Cost</th>
                      <th className="px-4 py-3 text-right">Value (CAD)</th>
                      <th className="px-4 py-3 text-right">Return</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.items.map((h) => {
                      const mult = h.currency === 'USD' ? exchangeRate : 1;
                      const price = h.currentPrice > 0 ? h.currentPrice : h.avgCost;
                      const mktVal = h.quantity * price * mult;
                      const costVal = h.quantity * h.avgCost * mult;
                      const ret = costVal > 0 ? ((mktVal - costVal) / costVal) * 100 : 0;
                      const isCash = h.type === 'Cash';

                      return (
                        <tr key={h.id} className="hover:bg-slate-800 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                                <Badge type={h.currency}>{h.currency}</Badge>
                                <span className="font-bold text-white">{h.ticker}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-300">{formatMoney(price, h.currency)}</td>
                          <td className="px-4 py-3 text-right text-slate-400">{formatNumber(h.quantity)}</td>
                          <td className="px-4 py-3 text-right text-slate-400">{formatMoney(h.avgCost, h.currency)}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-200">{formatMoney(mktVal)}</td>
                          <td className="px-4 py-3 text-right">
                             {!isCash && <span className={`text-xs font-bold ${ret >= 0 ? 'text-green-400' : 'text-red-400'}`}>{ret.toFixed(2)}%</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                               {!isCash && (
                                   <>
                                    <button onClick={() => openTransaction('buy', h)} className="px-2 py-1 bg-green-900/20 text-green-400 border border-green-900 hover:bg-green-900/40 rounded text-xs font-bold">Buy</button>
                                    <button onClick={() => openTransaction('sell', h)} className="px-2 py-1 bg-red-900/20 text-red-400 border border-red-900 hover:bg-red-900/40 rounded text-xs font-bold">Sell</button>
                                   </>
                               )}
                               {isCash && <button onClick={() => openTransaction('buy', h)} className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs font-bold">Edit</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              ) : <div className="p-6 text-center text-slate-500 text-sm">No holdings added yet.</div>}
            </div>
          )})}
        </div>

        {/* Summaries */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
             <Card className="p-6 bg-slate-900 border-slate-800">
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Total Cash In</p>
                <h3 className="text-2xl font-bold text-slate-200">{formatMoney(stats.totalPrincipal)}</h3>
             </Card>
             <Card className="p-6 bg-blue-900/20 border-blue-900/50">
                <p className="text-xs font-bold text-blue-300 uppercase mb-1">Current Value</p>
                <h3 className="text-3xl font-bold text-white">{formatMoney(stats.currentVal)}</h3>
             </Card>
             <Card className="p-6 bg-slate-900 border-slate-800">
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Total Return</p>
                <div className="flex items-baseline gap-3">
                    <h3 className={`text-2xl font-bold ${stats.gain >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {stats.gain >= 0 ? '+' : ''}{formatMoney(stats.gain)}
                    </h3>
                    <span className={`text-sm font-bold ${stats.gain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {stats.gainPct.toFixed(2)}%
                    </span>
                </div>
             </Card>
        </div>
      </main>

      {/* --- MODALS --- */}

      {/* Transaction Modal */}
      <Modal isOpen={isTransactionModalOpen} onClose={() => setIsTransactionModalOpen(false)} title="Add Transaction">
         <form onSubmit={handleTransactionSubmit} className="space-y-4">
            <div className="flex bg-slate-800 p-1 rounded-lg">
                <button type="button" onClick={() => setTransactData(p => ({...p, type: 'buy'}))} className={`flex-1 py-2 text-sm font-bold rounded-md ${transactData.type === 'buy' ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}>Buy / Add</button>
                <button type="button" onClick={() => setTransactData(p => ({...p, type: 'sell'}))} className={`flex-1 py-2 text-sm font-bold rounded-md ${transactData.type === 'sell' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'}`}>Sell / Remove</button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                 <select value={transactData.assetType} onChange={e => setTransactData({...transactData, assetType: e.target.value})} className="p-2 bg-slate-800 border border-slate-700 rounded text-white w-full text-sm">
                    {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={transactData.account} onChange={e => setTransactData({...transactData, account: e.target.value})} className="p-2 bg-slate-800 border border-slate-700 rounded text-white w-full text-sm">
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

            {transactData.assetType === 'Stock/ETF' && (
                <input placeholder="Ticker (e.g. RY)" value={transactData.ticker} onChange={e => setTransactData({...transactData, ticker: e.target.value})} className="w-full p-3 bg-slate-800 border border-slate-700 rounded text-white font-bold uppercase" />
            )}

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-slate-500 mb-1 block">Quantity</label>
                    <input type="number" step="any" value={transactData.quantity} onChange={e => setTransactData({...transactData, quantity: e.target.value})} className="w-full p-2 bg-slate-800 border border-slate-700 rounded text-white" />
                </div>
                <div>
                    <label className="text-xs text-slate-500 mb-1 block">{transactData.assetType === 'Cash' ? 'Total Amount' : 'Price per Share'}</label>
                    <input type="number" step="any" value={transactData.price} onChange={e => setTransactData({...transactData, price: e.target.value})} className="w-full p-2 bg-slate-800 border border-slate-700 rounded text-white" />
                </div>
            </div>

            <div className="flex gap-4 items-center">
                <label className="text-xs text-slate-500">Currency:</label>
                {CURRENCIES.map(c => (
                    <label key={c} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                        <input type="radio" checked={transactData.currency === c} onChange={() => setTransactData({...transactData, currency: c})} /> {c}
                    </label>
                ))}
            </div>

            <button className={`w-full py-3 rounded font-bold text-white mt-2 ${transactData.type === 'buy' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}>
                Confirm {transactData.type === 'buy' ? 'Buy' : 'Sell'}
            </button>
         </form>
      </Modal>

      {/* Settings Modal (API & Sync) */}
      <Modal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} title="Settings">
         <div className="space-y-6">
             <div>
                 <p className="text-xs font-bold text-slate-500 uppercase mb-2">API Key (Finnhub)</p>
                 <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste key here..." className="w-full p-2 bg-slate-800 border border-slate-700 rounded text-white text-sm font-mono" />
                 <p className="text-[10px] text-slate-500 mt-1">Required for live prices.</p>
             </div>
             
             <div className="border-t border-slate-800 pt-4">
                 <p className="text-xs font-bold text-slate-500 uppercase mb-2">Cloud Sync (Optional)</p>
                 <div className="bg-slate-800 p-3 rounded border border-slate-700 mb-3">
                     <p className="text-xs text-slate-400 mb-1">Your Portfolio ID:</p>
                     <div className="flex gap-2">
                         <code className="flex-1 bg-slate-950 p-2 rounded text-blue-400 font-mono text-center">{syncId}</code>
                         <button onClick={() => navigator.clipboard.writeText(syncId)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded"><Copy size={16} /></button>
                     </div>
                 </div>
                 <div className="flex gap-2">
                     <input placeholder="Link other ID..." value={importSyncId} onChange={e => setImportSyncId(e.target.value)} className="flex-1 p-2 bg-slate-800 border border-slate-700 rounded text-white text-sm" />
                     <button onClick={handleImportSync} className="bg-blue-600 px-4 rounded text-white text-sm font-bold">Link</button>
                 </div>
             </div>
         </div>
      </Modal>

      {/* Principal Modal */}
      <Modal isOpen={isPrincipalModalOpen} onClose={() => setIsPrincipalModalOpen(false)} title="Update Cash">
           <form onSubmit={(e) => {
               e.preventDefault(); 
               updatePrincipals({ ...accountPrincipals, [selectedAccountForPrincipal]: Number(e.target.amount.value) });
               setIsPrincipalModalOpen(false);
           }}>
               <p className="text-sm text-slate-400 mb-2">Total original cash deposited into <strong>{selectedAccountForPrincipal}</strong>:</p>
               <input name="amount" type="number" defaultValue={accountPrincipals[selectedAccountForPrincipal]} className="w-full p-3 bg-slate-800 border border-slate-700 rounded text-white text-xl font-bold" />
               <button className="w-full bg-blue-600 mt-3 py-2 rounded text-white font-bold">Update</button>
           </form>
      </Modal>

    </div>
  );
}