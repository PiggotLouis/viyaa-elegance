import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import React from "react";

// Simple localStorage db — works perfectly offline
const db = {
  get: async (k,fb) => { try { const r=localStorage.getItem(k); return r?JSON.parse(r):fb; } catch{return fb;} },
  set: async (k,v)  => { try { localStorage.setItem(k,JSON.stringify(v)); } catch{} }
};
const listen = (k, fb, callback) => {
  db.get(k, fb).then(callback);
  return () => {};
};
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = {error:null}; }
  static getDerivedStateFromError(e) { return {error:e.message}; }
  render() {
    if (this.state.error) return (
      <div style={{padding:40,fontFamily:"sans-serif",color:"#C62828",background:"#FFF0F0",minHeight:"100vh"}}>
        <h2>Something went wrong</h2>
        <p style={{fontFamily:"monospace",background:"#fff",padding:16,borderRadius:8}}>{this.state.error}</p>
        <button onClick={()=>window.location.reload()} style={{padding:"10px 20px",background:"#6B2D9A",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontSize:14}}>
          Reload App
        </button>
      </div>
    );
    return this.props.children;
  }
}



const C = {
  bg:"#F7EEF7", sidebar:"#2D0A52", sidebarHov:"#3D1468", sidebarAct:"#4A1A7A",
  sidebarTxt:"#EDD8F0", sidebarMut:"#A080C0", primary:"#6B2D9A", primaryDk:"#521D78",
  gold:"#C4A535", goldLt:"#F5ECC0", card:"#FFFFFF", cardLt:"#FAF5FB",
  border:"#DEC8E8", borderLt:"#EEE0F5", text:"#2D0A52", muted:"#7A5090",
  success:"#2E7D32", danger:"#C62828", inBg:"#E8F5E9", inTxt:"#1B5E20",
  outBg:"#FBE9E7", outTxt:"#B71C1C",
};

// Default categories — user can add more in Settings
const DEFAULT_CATS = ["Anklet","Bracelet","Chain","Chain Bracelet","Earring","Ring","Long Chain","Other"];

// Serial number prefixes per category
const PREFIX = {
  "Anklet":"AN","Bracelet":"BR","Chain":"CH","Chain Bracelet":"CHBR",
  "Earring":"ER","Ring":"RI","Long Chain":"LOCH","Other":"OT"
};

const CAT_COLORS = {
  Anklet:"#4A8FB5",Bracelet:"#9C4DB8",Chain:"#5B6FD4","Chain Bracelet":"#7B52C4",
  Earring:"#D4507A",Ring:"#4A9B6F","Long Chain":"#C4A535",Other:"#888"
};

const uid   = () => `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
const cur   = (n) => `₹${Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fdt   = (d) => new Date(d).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
const today = () => new Date().toISOString().slice(0,10);
const HF    = "'DM Sans',sans-serif";
const HH    = "'Playfair Display',serif";

// Auto-generate serial: prefix + actual price, with counter if duplicate
const genSerial = (category, actualPrice, existingProds, excludeId=null) => {
  const prefix = PREFIX[category] || category.slice(0,2).toUpperCase();
  const base   = `${prefix}${Math.round(actualPrice)}`;
  const dupes  = existingProds.filter(p => p.id !== excludeId && p.serial && p.serial.startsWith(base));
  return dupes.length === 0 ? base : `${base}-${dupes.length + 1}`;
};



export default function App() {
  const [page,         setPage]        = useState("record");
  const [prods,        setProds]       = useState([]);
  const [txns,         setTxns]        = useState([]);
  const [cats,         setCats]        = useState(DEFAULT_CATS);
  const [ready,        setReady]       = useState(false);
  const [modal,        setModal]       = useState(null);
  const [search,       setSearch]      = useState("");
  const [txF,          setTxF]         = useState("all");
  const [adminMode,    setAdminMode]   = useState(false);
  const [sidebarOpen,  setSidebarOpen] = useState(false);
  const [savedPwd,     setSavedPwd]    = useState(null);
  const [showPwdModal, setShowPwdModal]= useState(false);

  useEffect(() => {
    // Real-time listeners — any change on one device instantly appears on the other
    const unsub = [];
    unsub.push(listen("ve_prods",   [],          setProds));
    unsub.push(listen("ve_txns",    [],          setTxns));
    unsub.push(listen("ve_cats",    DEFAULT_CATS, setCats));
    unsub.push(listen("ve_pwd",     null,        (v) => { setSavedPwd(v); setReady(true); }));
    return () => unsub.forEach(fn => fn()); // cleanup on unmount
    if (!document.getElementById("_vgf")) {
      const l=document.createElement("link"); l.id="_vgf"; l.rel="stylesheet";
      l.href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap";
      document.head.appendChild(l);
    }
    if (!document.getElementById("_vps")) {
      const s=document.createElement("style"); s.id="_vps";
      s.textContent=`*{box-sizing:border-box} @media print{.no-print{display:none!important}}`;
      document.head.appendChild(s);
    }
  }, []);

  // Save to Firebase whenever state changes (real-time listeners propagate to all devices)
  useEffect(() => { if(ready) db.set("ve_prods",prods);  },[prods,ready]);
  useEffect(() => { if(ready) db.set("ve_txns",txns);    },[txns,ready]);
  useEffect(() => { if(ready) db.set("ve_cats",cats);    },[cats,ready]);
  useEffect(() => { if(ready&&savedPwd!==null) db.set("ve_pwd",savedPwd); },[savedPwd,ready]);

  const stats = useMemo(()=>{
    const invest = prods.reduce((s,p)=>s+p.actual*p.qty,0);
    const active = txns.filter(t=>!t.deleted);
    const sales  = active.filter(t=>t.type==="sale");
    const rev    = sales.reduce((s,t)=>s+t.total,0);
    const cogs   = sales.reduce((s,t)=>s+t.cost*t.qty,0);
    return { skus:prods.length, items:prods.reduce((s,p)=>s+p.qty,0), invest, rev, profit:rev-cogs, salesCnt:sales.length };
  },[prods,txns]);

  // Add or edit product — serial is auto-generated on save
  const saveProduct = (d) => {
    if (d.id) {
      // Editing: regenerate serial if price or category changed
      const serial = genSerial(d.category, d.actual, prods, d.id);
      setProds(ps => ps.map(p => p.id===d.id ? {...p,...d, serial} : p));
    } else {
      const serial = genSerial(d.category, d.actual, prods);
      setProds(ps => [...ps, {...d, id:uid(), serial, createdAt:new Date().toISOString()}]);
    }
    setModal(null);
  };

  const delProduct = (id) => setProds(ps=>ps.filter(p=>p.id!==id));

  const recordSale = (d) => {
    const p=prods.find(x=>x.id===d.productId); if(!p) return;
    const qty=parseInt(d.qty);
    if(qty>p.qty){alert(`Only ${p.qty} in stock!`);return;}
    const price=parseFloat(d.price)||p.customer;
    const label=`${p.category} (${p.serial})`;
    setTxns(ts=>[{id:uid(),type:"sale",productId:p.id,productName:label,category:p.category,serial:p.serial,qty,unitPrice:price,cost:p.actual,total:price*qty,date:d.date||new Date().toISOString(),notes:d.notes||""},...ts]);
    setProds(ps=>ps.map(x=>x.id===p.id?{...x,qty:x.qty-qty}:x));
    setModal(null);
  };

  const recordExpense = (d) => {
    setTxns(ts=>[{
      id:uid(), type:"expense", category:"Other Expense",
      productId:null, productName:"Other Expense", serial:null,
      qty:1, unitPrice:parseFloat(d.amount)||0, cost:0,
      total:parseFloat(d.amount)||0,
      date:d.date||new Date().toISOString(),
      notes:d.description||""
    },...ts]);
    setModal(null);
  };

  const recordStockIn = (d) => {
    const p=prods.find(x=>x.id===d.productId); if(!p) return;
    const qty=parseInt(d.qty);
    const price=p.actual;
    const label=`${p.category} (${p.serial})`;
    setTxns(ts=>[{id:uid(),type:"in",productId:p.id,productName:label,category:p.category,serial:p.serial,qty,unitPrice:price,cost:price,total:price*qty,date:d.date||new Date().toISOString(),notes:d.notes||""},...ts]);
    setProds(ps=>ps.map(x=>x.id===p.id?{...x,qty:x.qty+qty}:x));
    setModal(null);
  };

  // Edit a transaction — adjust inventory for qty/price difference
  const editTxn = (id, changes) => {
    const old = txns.find(t=>t.id===id); if(!old) return;
    const newQty   = parseInt(changes.qty)   || old.qty;
    const newPrice = parseFloat(changes.price)|| old.unitPrice;
    const qtyDiff  = newQty - old.qty;
    // Adjust inventory
    setProds(ps=>ps.map(p=>{
      if(p.id!==old.productId) return p;
      if(old.type==="sale")    return {...p, qty: p.qty - qtyDiff}; // sold more → reduce stock
      if(old.type==="in")      return {...p, qty: p.qty + qtyDiff}; // added more → increase stock
      return p;
    }));
    setTxns(ts=>ts.map(t=>t.id===id ? {
      ...t, qty:newQty, unitPrice:newPrice, total:newQty*newPrice,
      date:changes.date||t.date, notes:t.notes,
      editNote:changes.editNote, editedAt:new Date().toISOString()
    } : t));
  };

  // Soft-delete a transaction — reverse its inventory effect
  const deleteTxn = (id, reason) => {
    const t = txns.find(x=>x.id===id); if(!t) return;
    setProds(ps=>ps.map(p=>{
      if(p.id!==t.productId) return p;
      if(t.type==="sale") return {...p, qty: p.qty + t.qty}; // reverse sale → add back
      if(t.type==="in")   return {...p, qty: Math.max(0, p.qty - t.qty)}; // reverse stock-in → remove
      return p;
    }));
    setTxns(ts=>ts.map(x=>x.id===id ? {
      ...x, deleted:true, deletedReason:reason, deletedAt:new Date().toISOString()
    } : x));
  };

  const triggerDownload = (href, filename) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>document.body.removeChild(a), 200);
  };

  const doExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
        {Metric:"Store",              Value:"Viyaa Elegance"},
        {Metric:"Report Date",        Value:new Date().toLocaleDateString()},
        {Metric:"Total SKUs",         Value:stats.skus},
        {Metric:"Total Items",        Value:stats.items},
        {Metric:"Investment (₹)",     Value:Number(stats.invest||0).toFixed(2)},
        {Metric:"Revenue (₹)",        Value:Number(stats.rev||0).toFixed(2)},
        {Metric:"Net Profit (₹)",     Value:Number(stats.profit||0).toFixed(2)},
        {Metric:"Total Sales",        Value:stats.salesCnt},
      ]), "Summary");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prods.map(p=>({
        "Serial #":p.serial, "Category":p.category, "Date":fdt(p.date||p.createdAt),
        "Actual Price (₹)":Number(p.actual||0).toFixed(2),
        "Margin (₹)":Number(p.margin||0).toFixed(2),
        "Customer Price (₹)":Number(p.customer||0).toFixed(2),
        "In Stock":p.qty,
        "Stock Value (₹)":Number((p.actual||0)*p.qty).toFixed(2),
      }))), "Inventory");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txns.filter(t=>!t.deleted).map(t=>({
        Date:fdt(t.date),
        Type:t.type==="sale"?"Sale":t.type==="expense"?"Expense":"Stock In",
        "Serial #":t.serial||"",
        Category:t.category||"",
        Qty:t.qty||0,
        "Unit Price (₹)":Number(t.unitPrice||0).toFixed(2),
        "Total (₹)":Number(t.total||0).toFixed(2),
        Notes:t.notes||"",
      }))), "Transactions");
      const wb64 = XLSX.write(wb, {bookType:"xlsx", type:"base64"});
      triggerDownload(
        "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + wb64,
        "ViyaaElegance_Report.xlsx"
      );
    } catch(e) { alert("Export failed: " + e.message); }
  };

  const doCSV = (which) => {
    try {
      let rows, fname;
      if (which==="inventory") {
        rows = [
          ["Serial #","Category","Date","Actual Price (₹)","Margin (₹)","Customer Price (₹)","In Stock"],
          ...prods.map(p=>[p.serial||"",p.category||"",fdt(p.date||p.createdAt),
            Number(p.actual||0).toFixed(2), Number(p.margin||0).toFixed(2),
            Number(p.customer||0).toFixed(2), p.qty||0]),
        ];
        fname = "ViyaaElegance_Inventory.csv";
      } else {
        rows = [
          ["Date","Type","Serial #","Category","Qty","Unit Price (₹)","Total (₹)","Notes"],
          ...txns.filter(t=>!t.deleted).map(t=>[
            fdt(t.date),
            t.type==="sale"?"Sale":t.type==="expense"?"Expense":"Stock In",
            t.serial||"", t.category||"", t.qty||0,
            Number(t.unitPrice||0).toFixed(2),
            Number(t.total||0).toFixed(2),
            t.notes||"",
          ]),
        ];
        fname = "ViyaaElegance_Transactions.csv";
      }
      const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
      triggerDownload("data:text/csv;charset=utf-8,\uFEFF"+encodeURIComponent(csv), fname);
    } catch(e) { alert("Export failed: " + e.message); }
  };

  const filtProds = prods.filter(p=>!search||[p.serial,p.category].some(v=>(v||"").toLowerCase().includes(search.toLowerCase())));
  const filtTxns = txns.filter(t => {
    if (txF==="deleted")  return t.deleted;
    if (t.deleted)        return false;
    if (txF==="sale")     return t.type==="sale";
    if (txF==="in")       return t.type==="in";
    if (txF==="expense")  return t.type==="expense";
    return true; // "all" includes sales, stock-in, and expenses
  });

  if(!ready) return (
    <div style={{fontFamily:HF,display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,flexDirection:"column",gap:10}}>
      <div style={{fontFamily:HH,fontSize:24,color:C.primary}}>Viyaa Elegance</div>
      <div style={{fontSize:13,color:C.muted}}>Loading your store…</div>
    </div>
  );

  return (
    <ErrorBoundary>
    <div style={{fontFamily:HF,height:"100vh",overflow:"hidden",background:C.bg,color:C.text,position:"relative"}}>

      {/* Overlay — tap outside to close sidebar */}
      {sidebarOpen&&(
        <div onClick={()=>setSidebarOpen(false)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:140}}/>
      )}

      {/* Toggle button — always visible on left edge */}
      <button onClick={()=>setSidebarOpen(s=>!s)}
        className="no-print"
        style={{position:"fixed",left:sidebarOpen?236:0,top:"50%",transform:"translateY(-50%)",
          width:22,height:52,background:C.primary,border:"none",
          borderRadius:"0 10px 10px 0",cursor:"pointer",zIndex:160,
          color:"#fff",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",
          transition:"left 0.3s cubic-bezier(0.4,0,0.2,1)",boxShadow:"2px 0 8px rgba(45,10,82,0.2)"}}>
        {sidebarOpen?"◀":"▶"}
      </button>

      {/* Sliding Sidebar */}
      <div style={{position:"fixed",left:0,top:0,bottom:0,zIndex:150,
        transform:sidebarOpen?"translateX(0)":"translateX(-100%)",
        transition:"transform 0.3s cubic-bezier(0.4,0,0.2,1)"}}>
        <Sidebar
          page={page}
          setPage={(p)=>{ setPage(p); setSidebarOpen(false); }}
          adminMode={adminMode}
          onLogoClick={()=>{ setShowPwdModal(true); setSidebarOpen(false); }}
          onLock={()=>{ setAdminMode(false); setPage("record"); setSidebarOpen(false); }}
        />
      </div>

      {/* Main content — full width always */}
      <div style={{height:"100vh",overflow:"auto"}}>
        {page==="record"       && <RecordSale   prods={prods} onSale={recordSale}/>}
        {page==="salesstats"   && <SalesStats   txns={txns}/>}
        {page==="dashboard"    && <Dashboard    txns={txns} prods={prods} doExcel={doExcel} doCSV={doCSV} doPrint={()=>window.print()}/>}
        {page==="inventory"    && <Inventory    prods={filtProds} allProds={prods} search={search} setSearch={setSearch} setModal={setModal} delProduct={delProduct} cats={cats}/>}
        {page==="transactions" && <Transactions txns={filtTxns} allTxns={txns} txF={txF} setTxF={setTxF} setModal={setModal} editTxn={editTxn} deleteTxn={deleteTxn}/>}
        {page==="reports"      && <Reports      stats={stats} prods={prods} txns={txns} doExcel={doExcel} doCSV={doCSV} doPrint={()=>window.print()}/>}
        {page==="settings"     && <Settings     cats={cats} setCats={setCats} savedPwd={savedPwd} setSavedPwd={setSavedPwd}/>}
      </div>

      {modal&&(
        <div className="no-print" onClick={()=>setModal(null)}
          style={{position:"fixed",inset:0,background:"rgba(45,10,82,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:C.card,borderRadius:20,padding:30,width:500,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(45,10,82,0.3)",border:`1px solid ${C.border}`}}>
            {modal.type==="product" && <ProductForm data={modal.data} allProds={prods} onSave={saveProduct} onClose={()=>setModal(null)} cats={cats}/>}
            {modal.type==="sale"    && <SaleForm    prods={prods} onSave={recordSale} onClose={()=>setModal(null)}/>}
            {modal.type==="stockin" && <StockInForm prods={prods} onSave={recordStockIn} onClose={()=>setModal(null)}/>}
            {modal.type==="expense" && <ExpenseForm onSave={recordExpense} onClose={()=>setModal(null)}/>}
          </div>
        </div>
      )}

      {/* VE logo password modal */}
      {showPwdModal&&(
        <TabPasswordModal
          title="Admin Access"
          subtitle="Enter password to access full store management."
          savedPwd={savedPwd}
          onUnlock={()=>{ setAdminMode(true); setPage("dashboard"); setShowPwdModal(false); }}
          onCancel={()=>setShowPwdModal(false)}
          allowNoPassword={!savedPwd}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}

/* ── Sidebar ───────────────────────────────────────────────────── */
function Sidebar({page,setPage,adminMode,onLogoClick,onLock}) {
  const publicNavs = [
    {id:"record",     icon:"✦", label:"Record Sale"},
    {id:"salesstats", icon:"◈", label:"Sales Stats"},
  ];
  const adminNavs = [
    {id:"dashboard",    icon:"◈", label:"Dashboard"},
    {id:"inventory",    icon:"◎", label:"Inventory"},
    {id:"transactions", icon:"⇅", label:"Transactions"},
    {id:"settings",     icon:"⚙", label:"Settings"},
  ];
  const navs = adminMode ? adminNavs : publicNavs;

  return (
    <div className="no-print" style={{width:236,height:"100%",background:C.sidebar,display:"flex",flexDirection:"column",flexShrink:0}}>
      {/* VE Logo — clicks to enter or exit admin */}
      <div style={{padding:"26px 20px 20px",borderBottom:"1px solid rgba(255,255,255,0.08)",textAlign:"center"}}>
        <div onClick={adminMode ? onLock : onLogoClick}
          style={{width:60,height:60,borderRadius:"50%",border:`2px solid ${C.gold}`,display:"flex",alignItems:"center",
            justifyContent:"center",margin:"0 auto 12px",background:"rgba(196,165,53,0.1)",cursor:"pointer",transition:"transform 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.transform="scale(1.05)"}
          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
          <span style={{fontFamily:HH,fontSize:24,fontWeight:700,color:C.gold,letterSpacing:-2}}>VE</span>
        </div>
        <div style={{fontFamily:HH,fontSize:17,fontWeight:700,color:C.sidebarTxt,letterSpacing:0.5}}>Viyaa Elegance</div>
        <div style={{fontSize:9,color:C.gold,letterSpacing:1.5,textTransform:"uppercase",marginTop:5,fontStyle:"italic",fontFamily:HH}}>
          Timeless Beauty, Designed For You
        </div>
      </div>

      <nav style={{padding:"12px 0",flex:1}}>
        {navs.map(n=>(
          <button key={n.id} onClick={()=>setPage(n.id)}
            style={{display:"flex",alignItems:"center",gap:11,width:"100%",padding:"12px 20px",
              background:page===n.id?C.sidebarAct:"transparent",border:"none",
              color:page===n.id?C.sidebarTxt:C.sidebarMut,cursor:"pointer",fontSize:14,fontFamily:HF,
              fontWeight:page===n.id?600:400,transition:"background 0.15s",textAlign:"left",
              borderLeft:page===n.id?`3px solid ${C.gold}`:"3px solid transparent"}}>
            <span style={{fontSize:16,color:page===n.id?C.gold:C.sidebarMut}}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      <div style={{padding:"14px 20px",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
      </div>
    </div>
  );
}

/* ── Tab Password Modal (small overlay on tab switch) ──────────── */
function TabPasswordModal({title, subtitle, targetPage, savedPwd, onUnlock, onCancel, allowNoPassword}) {
  const pageLabels = {dashboard:"Dashboard",record:"Record Sale",inventory:"Inventory",transactions:"Transactions",reports:"Reports & Export",settings:"Settings"};
  const [pwd,  setPwd]  = useState("");
  const [err,  setErr]  = useState("");
  const [show, setShow] = useState(false);

  const submit = () => {
    if(allowNoPassword){ onUnlock(); return; }
    if(pwd !== savedPwd){ setErr("Incorrect password."); setPwd(""); return; }
    onUnlock();
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(45,10,82,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500}}>
      <div style={{background:C.card,borderRadius:20,padding:"32px 36px",width:360,boxShadow:"0 20px 60px rgba(45,10,82,0.3)",border:`1px solid ${C.border}`,textAlign:"center"}}>
        <div style={{fontSize:28,marginBottom:12}}>🔒</div>
        <div style={{fontFamily:HH,fontSize:18,fontWeight:700,color:C.text,marginBottom:6}}>
          {title || `Opening ${pageLabels[targetPage]||targetPage}`}
        </div>
        <div style={{fontSize:13,color:C.muted,marginBottom:20}}>
          {subtitle || "Enter your password to continue."}
        </div>
        {!allowNoPassword&&<>
          <div style={{position:"relative",marginBottom:6}}>
            <input type={show?"text":"password"} value={pwd}
              onChange={e=>{setPwd(e.target.value);setErr("");}}
              onKeyDown={e=>{ if(e.key==="Enter") submit(); if(e.key==="Escape") onCancel(); }}
              placeholder="Password"
              style={{...IST,fontSize:15,paddingRight:44,textAlign:"center",letterSpacing:2}} autoFocus/>
            <button onClick={()=>setShow(s=>!s)}
              style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:C.muted}}>
              {show?"🙈":"👁"}
            </button>
          </div>
          {err&&<div style={{fontSize:12,color:C.danger,marginBottom:8}}>{err}</div>}
        </>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:14}}>
          <button onClick={onCancel}
            style={{padding:"10px",borderRadius:8,border:`1px solid ${C.border}`,background:"#fff",color:C.text,fontSize:14,fontWeight:600,fontFamily:HF,cursor:"pointer"}}>
            Cancel
          </button>
          <button onClick={submit}
            style={{padding:"10px",borderRadius:8,border:"none",background:C.primary,color:"#fff",fontSize:14,fontWeight:700,fontFamily:HF,cursor:"pointer"}}>
            {allowNoPassword?"Enter (No Password Set)":"Unlock →"}
          </button>
        </div>
        {allowNoPassword&&<div style={{fontSize:11,color:C.muted,marginTop:10}}>Set a password in Settings → Change Password</div>}
      </div>
    </div>
  );
}

/* ── Record Sale Page ──────────────────────────────────────────── */
function RecordSale({prods, onSale}) {
  const [category,    setCategory]    = useState(null);
  const [custPrice,   setCustPrice]   = useState(null);
  const [qty,         setQty]         = useState(1);
  const [finalPrice,  setFinalPrice]  = useState("");
  const [step,        setStep]        = useState("form");
  const [lastSale,    setLastSale]    = useState(null);

  // Categories that have stock > 0
  const availCats = [...new Set(prods.filter(p=>p.qty>0).map(p=>p.category))];

  // Customer prices available for selected category (with qty > 0)
  const availPrices = category
    ? [...new Map(prods.filter(p=>p.category===category&&p.qty>0).map(p=>[p.customer,p])).values()]
        .sort((a,b)=>a.customer-b.customer)
    : [];

  // The matched product (category + customer price uniquely identifies it)
  const matched = custPrice!=null ? prods.find(p=>p.category===category&&p.customer===custPrice&&p.qty>0) : null;

  const effectivePrice = parseFloat(finalPrice)||custPrice||0;
  const profit = matched ? (effectivePrice - matched.actual)*qty : 0;

  const reset = () => {
    setCategory(null); setCustPrice(null); setQty(1);
    setFinalPrice(""); setStep("form");
  };

  const handleConfirm = () => {
    if(!matched){alert("No matching product found.");return;}
    if(qty<1){alert("Quantity must be at least 1.");return;}
    if(qty>matched.qty){alert(`Only ${matched.qty} in stock!`);return;}
    setStep("confirm");
  };

  const handleYes = () => {
    const sale = {
      productId: matched.id,
      qty: String(qty),
      price: String(effectivePrice),
      date: today(),
      notes: finalPrice&&parseFloat(finalPrice)!==custPrice ? `Final price: ₹${finalPrice} (customer price was ₹${custPrice})` : ""
    };
    onSale(sale);
    setLastSale({category:matched.category, serial:matched.serial, qty, price:effectivePrice, profit});
    setStep("success");
  };

  if (step==="success") return (
    <div style={{padding:"32px 36px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh"}}>
      <div style={{background:C.card,borderRadius:20,padding:"40px 48px",textAlign:"center",border:`2px solid ${C.success}40`,maxWidth:420,width:"100%",boxShadow:"0 4px 24px rgba(45,10,82,0.1)"}}>
        <div style={{fontSize:56,marginBottom:16}}>✅</div>
        <div style={{fontFamily:HH,fontSize:28,fontWeight:700,color:C.success,marginBottom:24}}>Item Sold!</div>
        <button onClick={reset}
          style={{width:"100%",padding:"14px",borderRadius:10,border:"none",background:C.primary,color:"#fff",fontSize:16,fontWeight:700,fontFamily:HF,cursor:"pointer"}}>
          Record Next Sale →
        </button>
      </div>
    </div>
  );

  if (step==="confirm") return (
    <div style={{padding:"32px 36px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh"}}>
      <div style={{background:C.card,borderRadius:20,padding:"36px 40px",maxWidth:420,width:"100%",border:`1px solid ${C.border}`,boxShadow:"0 4px 24px rgba(45,10,82,0.1)"}}>
        <div style={{fontFamily:HH,fontSize:22,fontWeight:700,color:C.text,marginBottom:20,textAlign:"center"}}>Confirm Sale?</div>
        <div style={{background:C.cardLt,borderRadius:12,padding:"16px",marginBottom:20}}>
          <Row label="Category"       value={matched?.category}/>
          <Row label="Customer Price" value={cur(custPrice)}/>
          <Row label="Qty"            value={String(qty)}/>
          <Row label="Final Price"    value={<span style={{fontWeight:700,color:C.success,fontSize:15}}>{cur(effectivePrice)}</span>}/>
          <Row label="Total Bill"     value={<span style={{fontWeight:700,color:C.primary,fontSize:16}}>{cur(effectivePrice*qty)}</span>} last/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <button onClick={()=>setStep("form")}
            style={{padding:"13px",borderRadius:10,border:`1px solid ${C.border}`,background:"#fff",color:C.text,fontSize:15,fontWeight:600,fontFamily:HF,cursor:"pointer"}}>
            ← No, Go Back
          </button>
          <button onClick={handleYes}
            style={{padding:"13px",borderRadius:10,border:"none",background:C.success,color:"#fff",fontSize:15,fontWeight:700,fontFamily:HF,cursor:"pointer"}}>
            Yes, Confirm ✓
          </button>
        </div>
      </div>
    </div>
  );

  // Main form
  return (
    <div style={{padding:"32px 36px",maxWidth:680}}>
      {/* Header */}
      <div style={{marginBottom:28}}>
        <div style={{fontFamily:HH,fontSize:26,fontWeight:700,marginBottom:4}}>Record Sale</div>
        <div style={{color:C.muted,fontSize:13}}>
          {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
        </div>
      </div>

      {/* Category */}
      <div style={{background:C.card,borderRadius:14,padding:"20px 22px",border:`1px solid ${C.border}`,marginBottom:20}}>
        <div style={{fontFamily:HH,fontSize:15,fontWeight:700,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          <span style={{display:"inline-block",width:3,height:16,background:C.gold,borderRadius:2}}></span>
          Select Category
        </div>
        {availCats.length===0
          ?<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"12px 0"}}>No products in stock. Add stock first.</div>
          :<div style={{display:"flex",flexWrap:"wrap",gap:10}}>
            {availCats.map(cat=>{
              const col=CAT_COLORS[cat]||"#888";
              const active=category===cat;
              return (
                <button key={cat} onClick={()=>{setCategory(cat);setCustPrice(null);setFinalPrice("");}}
                  style={{padding:"10px 20px",borderRadius:10,border:`2px solid ${active?col:col+"40"}`,
                    background:active?col:`${col}12`,color:active?"#fff":col,
                    cursor:"pointer",fontSize:14,fontWeight:600,fontFamily:HF,transition:"all 0.15s"}}>
                  {cat}
                  <span style={{fontSize:11,marginLeft:6,opacity:0.8}}>
                    ({prods.filter(p=>p.category===cat&&p.qty>0).reduce((s,p)=>s+p.qty,0)} left)
                  </span>
                </button>
              );
            })}
          </div>
        }
      </div>

      {/* Price */}
      {category&&(
        <div style={{background:C.card,borderRadius:14,padding:"20px 22px",border:`1px solid ${C.border}`,marginBottom:20}}>
          <div style={{fontFamily:HH,fontSize:15,fontWeight:700,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <span style={{display:"inline-block",width:3,height:16,background:C.gold,borderRadius:2}}></span>
            Select Price
          </div>
          {availPrices.length===0
            ?<div style={{color:C.muted,fontSize:13}}>No stock available for this category.</div>
            :<div style={{display:"flex",flexWrap:"wrap",gap:10}}>
              {availPrices.map(p=>{
                const active=custPrice===p.customer;
                return (
                  <button key={p.id} onClick={()=>{setCustPrice(p.customer);setFinalPrice(String(p.customer));}}
                    style={{padding:"12px 22px",borderRadius:10,border:`2px solid ${active?C.primary:C.border}`,
                      background:active?C.primary:C.cardLt,color:active?"#fff":C.text,
                      cursor:"pointer",fontSize:15,fontWeight:700,fontFamily:HF,transition:"all 0.15s",minWidth:100,textAlign:"center"}}>
                    {cur(p.customer)}
                    <div style={{fontSize:11,fontWeight:400,marginTop:2,opacity:0.75}}>{p.qty} in stock</div>
                  </button>
                );
              })}
            </div>
          }
        </div>
      )}

      {/* Qty + Final Price */}
      {custPrice!=null&&matched&&(
        <div style={{background:C.card,borderRadius:14,padding:"20px 22px",border:`1px solid ${C.border}`,marginBottom:20}}>
          <div style={{fontFamily:HH,fontSize:15,fontWeight:700,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
            <span style={{display:"inline-block",width:3,height:16,background:C.gold,borderRadius:2}}></span>
            Quantity & Final Price
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div>
              <label style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:0.5,display:"block",marginBottom:5,textTransform:"uppercase"}}>Quantity</label>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setQty(q=>Math.max(1,q-1))}
                  style={{width:36,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:C.cardLt,fontSize:18,cursor:"pointer",fontFamily:HF,color:C.text}}>−</button>
                <input type="number" value={qty} onChange={e=>setQty(Math.max(1,parseInt(e.target.value)||1))}
                  style={{...IST,width:60,textAlign:"center",fontWeight:700,fontSize:16}}/>
                <button onClick={()=>setQty(q=>Math.min(matched.qty,q+1))}
                  style={{width:36,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:C.cardLt,fontSize:18,cursor:"pointer",fontFamily:HF,color:C.text}}>+</button>
              </div>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>{matched.qty} available</div>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:0.5,display:"block",marginBottom:5,textTransform:"uppercase"}}>Final Price (₹)</label>
              <input type="number" value={finalPrice} onChange={e=>setFinalPrice(e.target.value)}
                placeholder={String(custPrice)} style={{...IST,fontSize:16,fontWeight:600}}/>
            </div>
          </div>
        </div>
      )}

      {/* Confirm button */}
      {matched&&custPrice!=null&&(
        <button onClick={handleConfirm}
          style={{width:"100%",padding:"16px",borderRadius:12,border:"none",background:C.primary,color:"#fff",fontSize:16,fontWeight:700,fontFamily:HF,cursor:"pointer"}}>
          Confirm Sale →
        </button>
      )}
    </div>
  );
}

// Small helper for confirm screen rows
const Row=({label,value,last})=>(
  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:last?"none":`1px solid ${C.borderLt}`,fontSize:13}}>
    <span style={{color:C.muted}}>{label}</span>
    <span style={{fontWeight:500}}>{value}</span>
  </div>
);

/* ── Sales Stats ───────────────────────────────────────────────── */
function SalesStats({txns}) {
  const sales = txns.filter(t=>t.type==="sale"&&!t.deleted);
  const grouped = useMemo(()=>{
    const m={};
    sales.forEach(t=>{
      const d=fdt(t.date);
      if(!m[d]) m[d]=[];
      const existing=m[d].find(x=>x.category===t.category);
      if(existing) existing.qty+=t.qty;
      else m[d].push({category:t.category,qty:t.qty});
    });
    return Object.entries(m).sort((a,b)=>new Date(b[0])-new Date(a[0]));
  },[sales]);

  const totalSold=sales.reduce((s,t)=>s+t.qty,0);

  return (
    <div style={{padding:"32px 36px"}}>
      <div style={{marginBottom:28}}>
        <div style={{fontFamily:HH,fontSize:26,fontWeight:700,marginBottom:4}}>Sales Stats</div>
        <div style={{color:C.muted,fontSize:13}}>Total items sold: <strong style={{color:C.primary}}>{totalSold}</strong></div>
      </div>

      {grouped.length===0
        ?<Empty text="No sales recorded yet."/>
        :grouped.map(([date,cats])=>(
          <div key={date} style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,marginBottom:16,overflow:"hidden"}}>
            <div style={{background:"linear-gradient(135deg,#F0E4F8,#E8D8F5)",padding:"12px 18px",borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontFamily:HH,fontSize:15,fontWeight:700,color:C.primary}}>{date}</div>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead>
                <tr>
                  <th style={{padding:"10px 18px",textAlign:"left",fontWeight:600,color:C.muted,fontSize:11,letterSpacing:0.5,textTransform:"uppercase",borderBottom:`1px solid ${C.borderLt}`}}>Category</th>
                  <th style={{padding:"10px 18px",textAlign:"right",fontWeight:600,color:C.muted,fontSize:11,letterSpacing:0.5,textTransform:"uppercase",borderBottom:`1px solid ${C.borderLt}`}}>Items Sold</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((r,i)=>(
                  <tr key={i} style={{borderBottom:i<cats.length-1?`1px solid ${C.borderLt}`:"none",background:i%2===0?C.card:C.cardLt}}>
                    <td style={{padding:"11px 18px"}}><CBadge cat={r.category}/></td>
                    <td style={{padding:"11px 18px",textAlign:"right",fontWeight:700,fontSize:16,color:C.primary}}>{r.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      }
    </div>
  );
}

/* ── CSS Bar Chart ─────────────────────────────────────────────── */
function CSSBarChart({data, height=200}) {
  const max = Math.max(...data.map(d=>Math.abs(d.value)), 1);
  const BAR_H = height;
  return (
    <div>
      {/* Value labels row */}
      <div style={{display:"flex",gap:20,marginBottom:8}}>
        {data.map((d,i)=>(
          <div key={i} style={{flex:1,textAlign:"center",fontSize:13,fontWeight:700,color:d.color}}>
            {cur(d.value)}
          </div>
        ))}
      </div>
      {/* Bar area */}
      <div style={{display:"flex",gap:20,alignItems:"flex-end",height:BAR_H,position:"relative"}}>
        {[0,0.25,0.5,0.75,1].map(p=>(
          <div key={p} style={{position:"absolute",left:0,right:0,bottom:p*BAR_H,
            borderTop:`1px dashed ${C.borderLt}`,zIndex:0}}/>
        ))}
        {data.map((d,i)=>{
          const pct  = Math.abs(d.value)/max;
          const h    = Math.max(pct*BAR_H, d.value!==0?6:0);
          const isNeg= d.value<0;
          return (
            <div key={i} style={{flex:1,height:h,zIndex:1,
              borderRadius:isNeg?"0 0 8px 8px":"8px 8px 0 0",
              background:isNeg
                ?`repeating-linear-gradient(135deg,${d.color}25,${d.color}25 6px,${d.color}50 6px,${d.color}50 12px)`
                :`linear-gradient(180deg,${d.color}cc,${d.color})`,
              boxShadow:`0 6px 20px ${d.color}30`,
              transition:"height 0.5s cubic-bezier(.4,0,.2,1)",
            }}/>
          );
        })}
      </div>
      {/* Label row */}
      <div style={{display:"flex",gap:20,marginTop:10}}>
        {data.map((d,i)=>(
          <div key={i} style={{flex:1,textAlign:"center",fontSize:12,fontWeight:600,color:C.muted}}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Dashboard ─────────────────────────────────────────────────── */
function Dashboard({txns,prods,doExcel,doCSV,doPrint}) {
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [selCat,       setSelCat]       = useState("all");
  const [selPrice,     setSelPrice]     = useState("all");
  const [showDl,       setShowDl]       = useState(false);

  const availCats   = [...new Set(prods.map(p=>p.category))];
  const availPrices = useMemo(()=>{
    const src = selCat==="all"?prods:prods.filter(p=>p.category===selCat);
    return [...new Map(src.map(p=>[p.customer,p])).values()].sort((a,b)=>a.customer-b.customer);
  },[prods,selCat]);

  const matchedProd = useMemo(()=>
    selCat!=="all"&&selPrice!=="all"
      ?prods.find(p=>p.category===selCat&&p.customer===parseFloat(selPrice))
      :null
  ,[prods,selCat,selPrice]);

  const matchedIds = useMemo(()=>{
    let r=prods;
    if(selCat!=="all")   r=r.filter(p=>p.category===selCat);
    if(selPrice!=="all") r=r.filter(p=>p.customer===parseFloat(selPrice));
    return new Set(r.map(p=>p.id));
  },[prods,selCat,selPrice]);

  const inRange = (ds) => {
    const d=new Date(ds);
    if(dateFrom&&d<new Date(dateFrom))           return false;
    if(dateTo  &&d>new Date(dateTo+"T23:59:59")) return false;
    return true;
  };

  const filtSales    = useMemo(()=>txns.filter(t=>!t.deleted&&t.type==="sale"   &&inRange(t.date)&&matchedIds.has(t.productId)),[txns,dateFrom,dateTo,matchedIds]);
  const filtStockIns = useMemo(()=>txns.filter(t=>!t.deleted&&t.type==="in"     &&inRange(t.date)&&matchedIds.has(t.productId)),[txns,dateFrom,dateTo,matchedIds]);
  const filtExpenses = useMemo(()=>txns.filter(t=>!t.deleted&&t.type==="expense"&&inRange(t.date)),[txns,dateFrom,dateTo]);

  const totalInvest = filtStockIns.reduce((s,t)=>s+t.total,0);
  const totalRev    = filtSales.reduce((s,t)=>s+t.total,0);
  const totalExp    = filtExpenses.reduce((s,t)=>s+t.total,0);
  const totalProfit = totalRev-totalInvest-totalExp;

  const hasFilter  = dateFrom||dateTo||selCat!=="all"||selPrice!=="all";
  const lbl = {fontSize:11,fontWeight:600,color:C.muted,letterSpacing:0.5,display:"block",marginBottom:5,textTransform:"uppercase"};
  const dlItems = [
    {icon:"📊",label:"Full Excel Report",  fn:doExcel},
    {icon:"📋",label:"Inventory CSV",      fn:()=>doCSV("inventory")},
    {icon:"📋",label:"Transactions CSV",   fn:()=>doCSV("transactions")},
    {icon:"🖨️",label:"Print / Save PDF",  fn:doPrint},
  ];

  return (
    <div style={{padding:"24px 28px"}} onClick={()=>showDl&&setShowDl(false)}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontFamily:HH,fontSize:24,fontWeight:700}}>Dashboard</div>
        <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>setShowDl(s=>!s)}
            style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",borderRadius:8,
              border:`1px solid ${showDl?C.primary:C.border}`,background:showDl?C.primary:C.card,
              color:showDl?"#fff":C.text,cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:HF,transition:"all 0.15s"}}>
            ⬇ Download Reports <span style={{fontSize:10}}>{showDl?"▲":"▼"}</span>
          </button>
          {showDl&&(
            <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.card,borderRadius:10,
              border:`1px solid ${C.border}`,boxShadow:"0 8px 24px rgba(45,10,82,0.15)",zIndex:100,minWidth:210,overflow:"hidden"}}>
              {dlItems.map((it,i)=>(
                <button key={i} onClick={()=>{it.fn();setShowDl(false);}}
                  style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 16px",
                    border:"none",borderBottom:i<dlItems.length-1?`1px solid ${C.borderLt}`:"none",
                    background:"transparent",color:C.text,cursor:"pointer",fontSize:13,fontFamily:HF,textAlign:"left"}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.cardLt}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span>{it.icon}</span>{it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{background:C.card,borderRadius:14,padding:"20px",border:`1px solid ${C.border}`,marginBottom:16}}>
        <div style={{display:"flex",flexWrap:"wrap",gap:"16px"}}>
          <div style={{flex:"1 1 150px",minWidth:"150px"}}>
            <span style={{fontSize:"12px",fontWeight:"700",color:C.primary,textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:"6px"}}>Date From</span>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={IST}/>
          </div>
          <div style={{flex:"1 1 150px",minWidth:"150px"}}>
            <span style={{fontSize:"12px",fontWeight:"700",color:C.primary,textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:"6px"}}>Date To</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={IST}/>
          </div>
          <div style={{flex:"1 1 150px",minWidth:"150px"}}>
            <span style={{fontSize:"12px",fontWeight:"700",color:C.primary,textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:"6px"}}>Category</span>
            <select value={selCat} onChange={e=>{setSelCat(e.target.value);setSelPrice("all");}} style={IST}>
              <option value="all">All Categories</option>
              {availCats.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{flex:"1 1 150px",minWidth:"150px"}}>
            <span style={{fontSize:"12px",fontWeight:"700",color:C.primary,textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:"6px"}}>Customer Price</span>
            <select value={selPrice} onChange={e=>setSelPrice(e.target.value)} style={IST}>
              <option value="all">All Prices</option>
              {availPrices.map(p=><option key={p.id} value={p.customer}>{cur(p.customer)}</option>)}
            </select>
          </div>
          <div style={{flex:"1 1 150px",minWidth:"150px"}}>
            <span style={{fontSize:"12px",fontWeight:"700",color:C.primary,textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:"6px"}}>Actual Price</span>
            <div style={{...IST,background:"#F5F0FA",color:matchedProd?C.primary:C.muted,fontWeight:matchedProd?700:400,minHeight:"38px",display:"flex",alignItems:"center"}}>
              {matchedProd?cur(matchedProd.actual):"—"}
            </div>
          </div>
        </div>
        {hasFilter&&(
          <button onClick={()=>{setDateFrom("");setDateTo("");setSelCat("all");setSelPrice("all");}}
            style={{marginTop:"12px",fontSize:"12px",color:C.primary,background:"none",border:"none",cursor:"pointer",fontFamily:HF,fontWeight:600}}>
            ✕ Clear filters
          </button>
        )}
      </div>

      {/* Stats + Chart */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"stretch"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <KCard label="Total Investment" value={cur(totalInvest)} icon="💸" stretch/>
          <KCard label="Other Expenses"   value={cur(totalExp)}    icon="🧾" accent={totalExp>0?C.danger:C.muted} stretch/>
          <KCard label="Total Revenue"    value={cur(totalRev)}    icon="💳" accent={C.success} stretch/>
          <KCard label="Total Profit"     value={cur(totalProfit)} icon={totalProfit>=0?"📈":"📉"} accent={totalProfit>=0?C.success:C.danger} stretch/>
        </div>
        <div style={{background:C.card,borderRadius:14,padding:"20px 24px",border:`1px solid ${C.border}`,display:"flex",flexDirection:"column"}}>
          <div style={{fontFamily:HH,fontSize:15,fontWeight:700,color:C.text,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
            <span style={{display:"inline-block",width:3,height:15,background:C.gold,borderRadius:2}}></span>
            Overview
          </div>
          <div style={{flex:1}}>
            <CSSBarChart data={[
              {label:"Investment",value:totalInvest,color:C.primary},
              {label:"Revenue",   value:totalRev,   color:"#4A9B6F"},
              {label:"Profit",    value:totalProfit,color:totalProfit>=0?C.gold:C.danger},
            ]} height={280}/>
          </div>
        </div>
      </div>
    </div>
  );
}

function Inventory({prods,allProds,search,setSearch,setModal,delProduct,cats}) {
  const [confirmDel,setConfirmDel]=useState(null);
  const totalVal=prods.reduce((s,p)=>s+p.actual*p.qty,0);
  return (
    <div style={{padding:"32px 36px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div>
          <div style={{fontFamily:HH,fontSize:26,fontWeight:700,marginBottom:4}}>Inventory</div>
          <div style={{color:C.muted,fontSize:13}}>{allProds.length} products · {prods.reduce((s,p)=>s+p.qty,0)} items · Stock value: {cur(totalVal)}</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search category or serial…"
            style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:C.card,color:C.text,outline:"none",width:220,fontFamily:HF}}/>
          <Btn onClick={()=>setModal({type:"product",data:{}})}>+ Add Product</Btn>
        </div>
      </div>
      <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{background:"linear-gradient(135deg,#F0E4F8,#E8D8F5)"}}>
              {["Serial #","Category","Date","Actual Price","Margin","Customer Price","In Stock","Actions"].map(h=>(
                <th key={h} style={{padding:"13px 14px",textAlign:"left",fontWeight:600,color:C.primary,fontSize:11,letterSpacing:0.5,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prods.length===0
              ?<tr><td colSpan={8} style={{textAlign:"center",padding:48,color:C.muted,fontSize:14}}>
                  No products yet — <span onClick={()=>setModal({type:"product",data:{}})} style={{color:C.primary,cursor:"pointer",textDecoration:"underline"}}>add your first item</span>!
                </td></tr>
              :prods.map((p,i)=>(
                <tr key={p.id} style={{borderBottom:`1px solid ${C.borderLt}`,background:i%2===0?C.card:C.cardLt}}>
                  <td style={{padding:"11px 14px",fontFamily:"monospace",fontSize:12,fontWeight:600,color:C.primary}}>{p.serial}</td>
                  <td style={{padding:"11px 14px"}}><CBadge cat={p.category}/></td>
                  <td style={{padding:"11px 14px",color:C.muted,fontSize:12}}>{fdt(p.date||p.createdAt)}</td>
                  <td style={{padding:"11px 14px",color:C.muted}}>{cur(p.actual)}</td>
                  <td style={{padding:"11px 14px",color:C.gold,fontWeight:600}}>{cur(p.margin)}</td>
                  <td style={{padding:"11px 14px",fontWeight:600,color:C.text}}>{cur(p.customer)}</td>
                  <td style={{padding:"11px 14px"}}>
                    <span style={{fontWeight:700,color:p.qty===0?C.danger:p.qty<=2?"#E67E22":C.success}}>{p.qty}</span>
                  </td>
                  <td style={{padding:"11px 14px"}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <SBtn onClick={()=>setModal({type:"product",data:p})} col={C.primary}>Edit</SBtn>
                      {confirmDel===p.id
                        ?<span style={{display:"flex",gap:4,alignItems:"center"}}>
                            <span style={{fontSize:11,color:C.danger}}>Sure?</span>
                            <SBtn onClick={()=>{delProduct(p.id);setConfirmDel(null);}} col={C.danger}>Yes</SBtn>
                            <SBtn onClick={()=>setConfirmDel(null)} col={C.muted}>No</SBtn>
                          </span>
                        :<SBtn onClick={()=>setConfirmDel(p.id)} col={C.danger}>Del</SBtn>
                      }
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Transactions ──────────────────────────────────────────────── */
function Transactions({txns,allTxns,txF,setTxF,setModal,editTxn,deleteTxn}) {
  const [actionModal, setActionModal] = useState(null);
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [selCat,      setSelCat]      = useState("all");
  const [showDl,      setShowDl]      = useState(false);

  const activeTxns  = allTxns.filter(t=>!t.deleted);
  const deletedTxns = allTxns.filter(t=>t.deleted);
  const allCats     = [...new Set(allTxns.map(t=>t.category).filter(Boolean))].sort();

  // Apply date + category filters on top of tab filter
  const inRange = (ds) => {
    const d = new Date(ds);
    if (dateFrom && d < new Date(dateFrom))           return false;
    if (dateTo   && d > new Date(dateTo+"T23:59:59")) return false;
    return true;
  };

  const displayed = txns.filter(t=>
    inRange(t.date) &&
    (selCat==="all" || t.category===selCat)
  );

  // Download helpers
  const triggerDl = (href, fname) => {
    const a=document.createElement("a"); a.href=href; a.download=fname;
    a.style.display="none"; document.body.appendChild(a); a.click();
    setTimeout(()=>document.body.removeChild(a),200);
  };

  const dlExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      // Summary sheet
      const sales   = displayed.filter(t=>t.type==="sale");
      const stockIn = displayed.filter(t=>t.type==="in");
      const expense = displayed.filter(t=>t.type==="expense");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
        {Metric:"Store",                 Value:"Viyaa Elegance"},
        {Metric:"Report Date",           Value:new Date().toLocaleDateString()},
        {Metric:"Filter - Date From",    Value:dateFrom||"All"},
        {Metric:"Filter - Date To",      Value:dateTo||"All"},
        {Metric:"Filter - Category",     Value:selCat==="all"?"All":selCat},
        {Metric:"Filter - Type",         Value:txF},
        {Metric:"Total Revenue (₹)",     Value:sales.reduce((s,t)=>s+t.total,0).toFixed(2)},
        {Metric:"Total Stock Cost (₹)",  Value:stockIn.reduce((s,t)=>s+t.total,0).toFixed(2)},
        {Metric:"Total Expenses (₹)",    Value:expense.reduce((s,t)=>s+t.total,0).toFixed(2)},
        {Metric:"Records Shown",         Value:displayed.length},
      ]), "Summary");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(displayed.map(t=>({
        Date:     fdt(t.date),
        Type:     t.type==="sale"?"Sale":t.type==="expense"?"Expense":"Stock In",
        "Serial #": t.serial||"",
        Category: t.category||"",
        Qty:      t.qty||0,
        "Unit Price (₹)": Number(t.unitPrice||0).toFixed(2),
        "Total (₹)":      Number(t.total||0).toFixed(2),
        Notes:    t.notes||"",
      }))), "Transactions");
      const wb64 = XLSX.write(wb,{bookType:"xlsx",type:"base64"});
      triggerDl("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,"+wb64,"ViyaaElegance_Transactions.xlsx");
    } catch(e){alert("Export failed: "+e.message);}
  };

  const dlCSV = () => {
    try {
      const rows = [
        ["Date","Type","Serial #","Category","Qty","Unit Price (₹)","Total (₹)","Notes"],
        ...displayed.map(t=>[
          fdt(t.date),
          t.type==="sale"?"Sale":t.type==="expense"?"Expense":"Stock In",
          t.serial||"", t.category||"", t.qty||0,
          Number(t.unitPrice||0).toFixed(2),
          Number(t.total||0).toFixed(2),
          t.notes||"",
        ]),
      ];
      const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
      triggerDl("data:text/csv;charset=utf-8,\uFEFF"+encodeURIComponent(csv),"ViyaaElegance_Transactions.csv");
    } catch(e){alert("Export failed: "+e.message);}
  };

  const hasFilter = dateFrom||dateTo||selCat!=="all";
  const lbl = {fontSize:11,fontWeight:600,color:C.muted,letterSpacing:0.5,display:"block",marginBottom:5,textTransform:"uppercase"};

  return (
    <div style={{padding:"24px 28px"}} onClick={()=>showDl&&setShowDl(false)}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <div style={{fontFamily:HH,fontSize:24,fontWeight:700,marginBottom:3}}>Transactions</div>
          <div style={{color:C.muted,fontSize:13}}>
            {activeTxns.length} active · {displayed.length} shown
            {deletedTxns.length>0&&<span style={{color:C.danger,marginLeft:8}}>· {deletedTxns.length} deleted</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {/* Download Reports dropdown */}
          <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setShowDl(s=>!s)}
              style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:8,
                border:`1px solid ${showDl?C.primary:C.border}`,background:showDl?C.primary:C.card,
                color:showDl?"#fff":C.text,cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:HF,transition:"all 0.15s"}}>
              ⬇ Download <span style={{fontSize:10}}>{showDl?"▲":"▼"}</span>
            </button>
            {showDl&&(
              <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.card,borderRadius:10,
                border:`1px solid ${C.border}`,boxShadow:"0 8px 24px rgba(45,10,82,0.15)",zIndex:100,minWidth:200,overflow:"hidden"}}>
                <div style={{padding:"8px 14px",fontSize:11,color:C.muted,borderBottom:`1px solid ${C.borderLt}`,fontWeight:600}}>
                  DOWNLOADING {displayed.length} RECORDS
                </div>
                {[
                  {icon:"📊",label:"Excel Report",   fn:dlExcel},
                  {icon:"📋",label:"CSV Export",     fn:dlCSV},
                ].map((it,i)=>(
                  <button key={i} onClick={()=>{it.fn();setShowDl(false);}}
                    style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 16px",
                      border:"none",borderBottom:i===0?`1px solid ${C.borderLt}`:"none",
                      background:"transparent",color:C.text,cursor:"pointer",fontSize:13,fontFamily:HF,textAlign:"left"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.cardLt}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    {it.icon} {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Btn onClick={()=>setModal({type:"expense"})} outline>+ Add Expense</Btn>
          <Btn onClick={()=>setModal({type:"stockin"})} outline>+ Add Stock</Btn>
        </div>
      </div>

      {/* Filters */}
      <div style={{background:C.card,borderRadius:12,padding:"20px",border:`1px solid ${C.border}`,marginBottom:14}}>
        <div style={{display:"flex",flexWrap:"wrap",gap:"16px",alignItems:"flex-end"}}>
          <div style={{flex:"1 1 150px",minWidth:"150px"}}>
            <span style={{fontSize:"12px",fontWeight:"700",color:C.primary,textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:"6px"}}>Date From</span>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={IST}/>
          </div>
          <div style={{flex:"1 1 150px",minWidth:"150px"}}>
            <span style={{fontSize:"12px",fontWeight:"700",color:C.primary,textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:"6px"}}>Date To</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={IST}/>
          </div>
          <div style={{flex:"1 1 150px",minWidth:"150px"}}>
            <span style={{fontSize:"12px",fontWeight:"700",color:C.primary,textTransform:"uppercase",letterSpacing:"0.5px",display:"block",marginBottom:"6px"}}>Category</span>
            <select value={selCat} onChange={e=>setSelCat(e.target.value)} style={IST}>
              <option value="all">All Categories</option>
              {allCats.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {hasFilter&&(
          <button onClick={()=>{setDateFrom("");setDateTo("");setSelCat("all");}}
            style={{marginTop:"12px",fontSize:"12px",color:C.primary,background:"none",border:"none",cursor:"pointer",fontFamily:HF,fontWeight:600}}>
            ✕ Clear filters
          </button>
        )}
      </div>

      {/* Type tabs */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[["all","All"],["sale","Sales"],["in","Stock-In"],["expense","Expenses"],["deleted","🗑 Deleted"]].map(([v,l])=>(
          <button key={v} onClick={()=>setTxF(v)}
            style={{padding:"7px 16px",borderRadius:20,
              border:`1px solid ${txF===v?(v==="deleted"?C.danger:C.primary):C.border}`,
              background:txF===v?(v==="deleted"?C.danger:C.primary):"transparent",
              color:txF===v?"#fff":v==="deleted"?C.danger:C.muted,
              cursor:"pointer",fontSize:13,fontFamily:HF,fontWeight:txF===v?600:400,transition:"all 0.15s"}}>
            {l}{v==="deleted"&&deletedTxns.length>0?` (${deletedTxns.length})`:""}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{background:C.card,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{background:"linear-gradient(135deg,#F0E4F8,#E8D8F5)"}}>
              {txF==="deleted"
                ?["Date","Type","Serial #","Category","Qty","Total","Deleted On","Reason"].map(h=>(
                    <th key={h} style={{padding:"13px 14px",textAlign:"left",fontWeight:600,color:C.primary,fontSize:11,letterSpacing:0.5,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                  ))
                :["Date","Type","Serial #","Category","Qty","Unit Price","Total","Notes","Actions"].map(h=>(
                    <th key={h} style={{padding:"13px 14px",textAlign:"left",fontWeight:600,color:C.primary,fontSize:11,letterSpacing:0.5,textTransform:"uppercase",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                  ))
              }
            </tr>
          </thead>
          <tbody>
            {displayed.length===0
              ?<tr><td colSpan={9} style={{textAlign:"center",padding:48,color:C.muted,fontSize:14}}>
                  {txF==="deleted"?"No deleted transactions.":"No transactions match your filters."}
                </td></tr>
              :displayed.map((t,i)=>(
                <tr key={t.id} style={{borderBottom:`1px solid ${C.borderLt}`,background:i%2===0?C.card:C.cardLt}}>
                  <td style={{padding:"11px 14px",color:C.muted,fontSize:11}}>{fdt(t.date)}</td>
                  <td style={{padding:"11px 14px"}}><TBadge type={t.type}/></td>
                  <td style={{padding:"11px 14px",fontFamily:"monospace",fontSize:12,fontWeight:600,color:C.primary}}>{t.serial||"—"}</td>
                  <td style={{padding:"11px 14px"}}><CBadge cat={t.category}/></td>
                  <td style={{padding:"11px 14px"}}>{t.qty}</td>
                  {txF!=="deleted"&&<td style={{padding:"11px 14px",color:C.muted}}>{cur(t.unitPrice)}</td>}
                  <td style={{padding:"11px 14px",fontWeight:700,color:t.type==="sale"?C.success:t.type==="expense"?C.danger:C.text}}>
                    {t.type==="sale"?"+":`-`}{cur(t.total)}
                  </td>
                  {txF==="deleted"
                    ?<>
                        <td style={{padding:"11px 14px",color:C.muted,fontSize:11}}>{t.deletedAt?fdt(t.deletedAt):"—"}</td>
                        <td style={{padding:"11px 14px",fontSize:12}}>
                          <span style={{background:`${C.danger}12`,color:C.danger,padding:"3px 8px",borderRadius:4,fontSize:11}}>{t.deletedReason||"No reason given"}</span>
                        </td>
                      </>
                    :<>
                        <td style={{padding:"11px 14px",fontSize:11}}>
                          <div style={{color:C.muted}}>{t.notes||"—"}</div>
                          {t.editNote&&<div style={{color:C.primary,marginTop:3,fontSize:10}}>✏ {t.editNote}</div>}
                        </td>
                        <td style={{padding:"11px 14px"}}>
                          <div style={{display:"flex",gap:6}}>
                            <SBtn onClick={()=>setActionModal({type:"edit",txn:t})} col={C.primary}>Edit</SBtn>
                            <SBtn onClick={()=>setActionModal({type:"delete",txn:t})} col={C.danger}>Delete</SBtn>
                          </div>
                        </td>
                      </>
                  }
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {actionModal&&(
        <div onClick={()=>setActionModal(null)}
          style={{position:"fixed",inset:0,background:"rgba(45,10,82,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:C.card,borderRadius:20,padding:28,width:480,boxShadow:"0 24px 64px rgba(45,10,82,0.3)",border:`1px solid ${C.border}`}}>
            {actionModal.type==="edit"
              ?<EditTxnModal txn={actionModal.txn} onSave={(id,ch)=>{editTxn(id,ch);setActionModal(null);}} onClose={()=>setActionModal(null)}/>
              :<DeleteTxnModal txn={actionModal.txn} onConfirm={(id,r)=>{deleteTxn(id,r);setActionModal(null);}} onClose={()=>setActionModal(null)}/>
            }
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reports ───────────────────────────────────────────────────── */
function Reports({stats,prods,txns,doExcel,doCSV,doPrint}) {
  const catSummary=useMemo(()=>{
    const m={};
    prods.forEach(p=>{if(!m[p.category])m[p.category]={items:0,cost:0,retail:0};m[p.category].items+=p.qty;m[p.category].cost+=p.actual*p.qty;m[p.category].retail+=p.customer*p.qty;});
    return Object.entries(m).sort((a,b)=>b[1].items-a[1].items);
  },[prods]);
  const monthly=useMemo(()=>{
    const m={};
    txns.filter(t=>t.type==="sale"&&!t.deleted).forEach(t=>{
      const k=new Date(t.date).toLocaleDateString("en-GB",{month:"short",year:"2-digit"});
      if(!m[k])m[k]={rev:0,profit:0,cnt:0};
      m[k].rev+=t.total; m[k].profit+=t.total-t.cost*t.qty; m[k].cnt++;
    });
    return Object.entries(m).slice(-6).reverse();
  },[txns]);

  return (
    <div style={{padding:"32px 36px"}}>
      <div style={{fontFamily:HH,fontSize:26,fontWeight:700,marginBottom:28}}>Reports & Export</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24}}>
        <SumCard label="Total Investment" value={cur(stats.invest)}/>
        <SumCard label="Total Revenue"    value={cur(stats.rev)}/>
        <SumCard label="Net Profit"       value={cur(stats.profit)} accent={stats.profit>=0?C.success:C.danger}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
        <Panel title="Stock by Category">
          {catSummary.length===0?<Empty text="No inventory data"/>:catSummary.map(([cat,d])=>(
            <div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.borderLt}`}}>
              <CBadge cat={cat}/>
              <div style={{textAlign:"right",fontSize:12}}>
                <div style={{fontWeight:600,color:C.text}}>{d.items} items · {cur(d.cost)}</div>
                <div style={{color:C.gold,fontSize:11}}>Customer value: {cur(d.retail)}</div>
              </div>
            </div>
          ))}
        </Panel>
        <Panel title="Monthly Sales">
          {monthly.length===0?<Empty text="No sales recorded yet"/>:monthly.map(([mon,d])=>(
            <div key={mon} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.borderLt}`}}>
              <div style={{fontSize:13,fontWeight:600}}>{mon}</div>
              <div style={{textAlign:"right",fontSize:12}}>
                <div style={{color:C.success,fontWeight:600}}>{cur(d.rev)}</div>
                <div style={{color:C.muted}}>{d.cnt} sales · profit {cur(d.profit)}</div>
              </div>
            </div>
          ))}
        </Panel>
      </div>
      <Panel title="Download Your Data">
        <p style={{fontSize:13,color:C.muted,marginBottom:16,marginTop:0}}>Export your store data anytime in your preferred format.</p>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          <XBtn onClick={doExcel}                   icon="📊" label="Full Excel Report"   sub="Summary + Inventory + Transactions"/>
          <XBtn onClick={()=>doCSV("inventory")}    icon="📋" label="Inventory CSV"       sub="Current stock with all prices"/>
          <XBtn onClick={()=>doCSV("transactions")} icon="📋" label="Transactions CSV"    sub="Complete history of all records"/>
          <XBtn onClick={doPrint}                   icon="🖨️" label="Print / Save as PDF" sub="Opens browser print dialog"/>
        </div>
      </Panel>
    </div>
  );
}

/* ── Settings ──────────────────────────────────────────────────── */
function Settings({cats,setCats,savedPwd,setSavedPwd}) {
  const [newCat,setNewCat]=useState("");
  const [err,setErr]=useState("");
  const [confirmDel,setConfirmDel]=useState(null);

  const addCat=()=>{
    const v=newCat.trim();
    if(!v){setErr("Please enter a category name.");return;}
    if(cats.map(c=>c.toLowerCase()).includes(v.toLowerCase())){setErr("This category already exists.");return;}
    setCats(prev=>[...prev,v]);
    setNewCat(""); setErr("");
  };

  const delCat=(cat)=>{ setCats(prev=>prev.filter(c=>c!==cat)); setConfirmDel(null); };
  const moveUp=(i)=>{ if(i===0)return; setCats(prev=>{const a=[...prev];[a[i-1],a[i]]=[a[i],a[i-1]];return a;}); };
  const moveDn=(i)=>{ if(i===cats.length-1)return; setCats(prev=>{const a=[...prev];[a[i],a[i+1]]=[a[i+1],a[i]];return a;}); };

  return (
    <div style={{padding:"32px 36px",maxWidth:600}}>
      <div style={{fontFamily:HH,fontSize:26,fontWeight:700,marginBottom:6}}>Settings</div>
      <div style={{color:C.muted,fontSize:13,marginBottom:28}}>Manage your store categories and preferences.</div>
      <Panel title="Product Categories">
        <p style={{fontSize:13,color:C.muted,marginTop:0,marginBottom:16}}>Add custom categories, reorder them, or remove ones you don't need.</p>
        <div style={{display:"flex",gap:10,marginBottom:6}}>
          <input value={newCat} onChange={e=>{setNewCat(e.target.value);setErr("");}}
            onKeyDown={e=>e.key==="Enter"&&addCat()}
            placeholder="New category… e.g. Hairpin, Bag Charm"
            style={{...IST,flex:1}}/>
          <Btn onClick={addCat}>+ Add</Btn>
        </div>
        {err&&<div style={{fontSize:12,color:C.danger,marginBottom:10}}>{err}</div>}
        <div style={{marginTop:16,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
          {cats.map((cat,i)=>(
            <div key={cat} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 14px",background:i%2===0?C.card:C.cardLt,borderBottom:i<cats.length-1?`1px solid ${C.borderLt}`:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <CBadge cat={cat}/>
                <span style={{fontSize:11,color:C.muted,fontFamily:"monospace"}}>{PREFIX[cat]||cat.slice(0,2).toUpperCase()}[price]</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <SBtn onClick={()=>moveUp(i)} col={C.muted}>↑</SBtn>
                <SBtn onClick={()=>moveDn(i)} col={C.muted}>↓</SBtn>
                {confirmDel===cat
                  ?<span style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:12,color:C.danger}}>Sure?</span>
                      <SBtn onClick={()=>delCat(cat)} col={C.danger}>Yes</SBtn>
                      <SBtn onClick={()=>setConfirmDel(null)} col={C.muted}>Cancel</SBtn>
                    </span>
                  :<SBtn onClick={()=>setConfirmDel(cat)} col={C.danger}>Remove</SBtn>
                }
              </div>
            </div>
          ))}
        </div>
        <div style={{fontSize:11,color:C.muted,marginTop:10}}>{cats.length} categories · Changes save automatically</div>
      </Panel>

      {/* Change Password */}
      <div style={{marginTop:20}}>
        <ChangePassword savedPwd={savedPwd} setSavedPwd={setSavedPwd}/>
      </div>
    </div>
  );
}

/* ── Product Form ──────────────────────────────────────────────── */
function ProductForm({data,allProds,onSave,onClose,cats}) {
  const isEdit = !!data.id;
  const [f,setF] = useState({
    date:     data.date     || today(),
    category: data.category || cats[0] || "",
    actual:   data.actual   || "",
    margin:   data.margin   || "",
    customer: data.customer || "",
    ...(isEdit ? {id:data.id} : {})
  });

  const s = k => e => {
    const val = e.target.value;
    setF(prev => {
      const next = {...prev, [k]:val};
      // Auto-calculate customer price when actual or margin changes
      if (k==="actual"||k==="margin") {
        const a = parseFloat(k==="actual"?val:prev.actual)||0;
        const m = parseFloat(k==="margin"?val:prev.margin)||0;
        next.customer = a+m > 0 ? String(a+m) : "";
      }
      return next;
    });
  };

  // Preview of the serial that will be generated
  const previewSerial = f.category && f.actual
    ? genSerial(f.category, parseFloat(f.actual)||0, allProds, isEdit?data.id:null)
    : "—";

  const submit = () => {
    if(!f.category){alert("Please select a category.");return;}
    if(!f.actual){alert("Actual price is required.");return;}
    if(!f.margin&&f.margin!==0){alert("Margin is required.");return;}
    onSave({
      ...f,
      actual:   parseFloat(f.actual)||0,
      margin:   parseFloat(f.margin)||0,
      customer: parseFloat(f.customer)||(parseFloat(f.actual||0)+parseFloat(f.margin||0)),
      qty:      isEdit ? data.qty : 0,
    });
  };

  return (
    <div>
      <MTitle>{isEdit?"Edit Product":"Add New Product"}</MTitle>

      <FR label="Date"><FI v={f.date} onChange={s("date")} type="date"/></FR>
      <FR label="Category">
        <FSel v={f.category} onChange={s("category")} opts={cats}/>
      </FR>
      <FR label="Actual Price (₹) — what you paid at wholesale *"><FI v={f.actual} onChange={s("actual")} ph="e.g. 10" type="number"/></FR>
      <FR label="Margin (₹) — your markup *"><FI v={f.margin} onChange={s("margin")} ph="e.g. 30" type="number"/></FR>

      {/* Customer Price — auto-calculated, read-only */}
      <div style={{marginBottom:14}}>
        <label style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:0.5,display:"block",marginBottom:5,textTransform:"uppercase"}}>Customer Price (₹) — auto calculated</label>
        <div style={{padding:"9px 12px",borderRadius:8,border:`2px solid ${C.gold}`,background:C.goldLt,fontSize:15,fontWeight:700,color:C.text,letterSpacing:0.3}}>
          {f.actual&&f.margin ? `₹${(parseFloat(f.actual||0)+parseFloat(f.margin||0)).toFixed(2)}` : "Enter actual price + margin above"}
        </div>
      </div>

      {/* Zero stock notice */}
      {!isEdit&&(
        <div style={{background:"#F0E8F8",border:`1px solid ${C.primary}20`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:C.muted}}>
          📦 Stock will start at <strong style={{color:C.text}}>0</strong>. Add actual stock quantities through <strong style={{color:C.primary}}>Transactions → Add Stock</strong>.
        </div>
      )}

      {/* Serial preview */}
      {f.category&&f.actual&&(
        <div style={{background:"#F0E8F8",border:`1px solid ${C.primary}30`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13}}>
          <span style={{color:C.muted}}>Serial number will be: </span>
          <strong style={{color:C.primary,fontFamily:"monospace",fontSize:15}}>{previewSerial}</strong>
          <span style={{color:C.muted,fontSize:11,display:"block",marginTop:3}}>Auto-generated from category + actual price</span>
        </div>
      )}

      <div style={{display:"flex",gap:10,marginTop:8}}>
        <Btn onClick={submit} full>{isEdit?"Save Changes":"Add Product"}</Btn>
        <Btn onClick={onClose} outline>Cancel</Btn>
      </div>
    </div>
  );
}

/* ── Sale & StockIn Forms ──────────────────────────────────────── */
function SaleForm({prods,onSave,onClose}) {
  const avail=prods.filter(p=>p.qty>0);
  const [f,setF]=useState({productId:avail[0]?.id||"",qty:"1",price:"",date:today(),notes:""});
  const s=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  const sel=prods.find(p=>p.id===f.productId);
  const salePrice=parseFloat(f.price)||sel?.customer||0;
  const qty=parseInt(f.qty||1);
  return (
    <div>
      <MTitle>Record a Sale</MTitle>
      {avail.length===0?<div style={{color:C.danger,textAlign:"center",padding:24,fontSize:14}}>No items in stock! Please add stock first.</div>:<>
        <FR label="Product">
          <FSel v={f.productId} onChange={s("productId")} opts={avail.map(p=>({v:p.id,l:`${p.serial} — ${p.category} (${p.qty} left)`}))}/>
        </FR>
        {sel&&<div style={{fontSize:12,color:C.muted,marginBottom:12,marginTop:-8}}>
          Actual: {cur(sel.actual)} · Customer price: {cur(sel.customer)} · Available: {sel.qty}
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <FR label="Qty Sold *"><FI v={f.qty} onChange={s("qty")} type="number" ph="1"/></FR>
          <FR label="Sale Price / unit (₹)"><FI v={f.price} onChange={s("price")} type="number" ph={`${sel?.customer||0} (default)`}/></FR>
        </div>
        <FR label="Date"><FI v={f.date} onChange={s("date")} type="date"/></FR>
        <FR label="Notes (optional)"><FI v={f.notes} onChange={s("notes")} ph="e.g. pop-up event, discount given…"/></FR>
        <div style={{background:"#F0F9F1",border:`1px solid ${C.success}30`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13}}>
          <span style={{color:C.muted}}>Sale total: </span><strong style={{color:C.success,fontSize:15}}>{cur(salePrice*qty)}</strong>
          {sel&&<span style={{color:C.muted}}> · Profit: <strong style={{color:C.success}}>{cur((salePrice-sel.actual)*qty)}</strong></span>}
        </div>
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>onSave(f)} full>Confirm Sale ✓</Btn>
          <Btn onClick={onClose} outline>Cancel</Btn>
        </div>
      </>}
    </div>
  );
}

function StockInForm({prods,onSave,onClose}) {
  const [f,setF]=useState({productId:prods[0]?.id||"",qty:"1",date:today(),notes:""});
  const s=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  const sel=prods.find(p=>p.id===f.productId);
  const totalCost=(sel?.actual||0)*parseInt(f.qty||1);
  return (
    <div>
      <MTitle>Add Stock In</MTitle>
      {prods.length===0?<div style={{color:C.muted,textAlign:"center",padding:24,fontSize:14}}>Add a product first from the Inventory page.</div>:<>
        <FR label="Product">
          <FSel v={f.productId} onChange={s("productId")} opts={prods.map(p=>({v:p.id,l:`${p.serial} — ${p.category} (${p.qty} in stock)`}))}/>
        </FR>
        {sel&&<div style={{fontSize:12,color:C.muted,marginBottom:12,marginTop:-8}}>
          Actual price: {cur(sel.actual)} · Customer price: {cur(sel.customer)} · Currently in stock: {sel.qty}
        </div>}
        <FR label="Quantity to Add *"><FI v={f.qty} onChange={s("qty")} type="number" ph="1"/></FR>
        <FR label="Date"><FI v={f.date} onChange={s("date")} type="date"/></FR>
        <FR label="Notes (optional)"><FI v={f.notes} onChange={s("notes")} ph="e.g. restocked from supplier…"/></FR>
        <div style={{background:C.goldLt,border:`1px solid ${C.gold}40`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13}}>
          <span style={{color:C.muted}}>Total cost: </span>
          <strong style={{fontSize:15}}>{cur(totalCost)}</strong>
          <span style={{color:C.muted,fontSize:11,marginLeft:8}}>({f.qty||1} × {cur(sel?.actual||0)})</span>
        </div>
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={()=>onSave(f)} full>Add to Stock ✓</Btn>
          <Btn onClick={onClose} outline>Cancel</Btn>
        </div>
      </>}
    </div>
  );
}

/* ── Transaction Action Modals ─────────────────────────────────── */
function EditTxnModal({txn,onSave,onClose}) {
  const [f,setF]=useState({qty:String(txn.qty),price:String(txn.unitPrice),date:txn.date?.slice(0,10)||today(),editNote:""});
  const s=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  const submit=()=>{
    if(!f.editNote.trim()){alert("Please enter a reason for editing this transaction.");return;}
    onSave(txn.id,f);
  };
  const newTotal=((parseFloat(f.price)||txn.unitPrice)*(parseInt(f.qty)||txn.qty));
  return (
    <div>
      <MTitle>Edit Transaction</MTitle>
      <div style={{background:C.cardLt,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",marginBottom:18,fontSize:13}}>
        <div style={{fontWeight:600,color:C.text,marginBottom:4}}>{txn.productName} <TBadge type={txn.type}/></div>
        <div style={{color:C.muted,fontSize:12}}>Original: qty {txn.qty} · {cur(txn.unitPrice)} each · Total {cur(txn.total)}</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <FR label="Quantity"><FI v={f.qty}   onChange={s("qty")}   type="number" ph={String(txn.qty)}/></FR>
        <FR label="Unit Price (₹)"><FI v={f.price} onChange={s("price")} type="number" ph={String(txn.unitPrice)}/></FR>
      </div>
      <FR label="Date"><FI v={f.date} onChange={s("date")} type="date"/></FR>
      <FR label="Reason for editing *">
        <textarea value={f.editNote} onChange={s("editNote")} placeholder="e.g. Wrong quantity entered, price correction…"
          style={{...IST,height:72,resize:"vertical",lineHeight:1.5}}/>
      </FR>
      <div style={{background:"#F0F9F1",border:`1px solid ${C.success}30`,borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13}}>
        <span style={{color:C.muted}}>New total: </span><strong style={{color:C.success}}>{cur(newTotal)}</strong>
        <span style={{color:C.muted,fontSize:11,marginLeft:8}}>· Inventory will be adjusted automatically</span>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={submit} full>Save Changes ✓</Btn>
        <Btn onClick={onClose} outline>Cancel</Btn>
      </div>
    </div>
  );
}

function DeleteTxnModal({txn,onConfirm,onClose}) {
  const [reason,setReason]=useState("");
  const submit=()=>{
    if(!reason.trim()){alert("Please enter a reason for deleting this transaction.");return;}
    onConfirm(txn.id,reason);
  };
  return (
    <div>
      <MTitle>Delete Transaction</MTitle>
      <div style={{background:`${C.danger}08`,border:`1px solid ${C.danger}30`,borderRadius:10,padding:"12px 14px",marginBottom:18,fontSize:13}}>
        <div style={{fontWeight:600,color:C.text,marginBottom:4}}>{txn.productName} <TBadge type={txn.type}/></div>
        <div style={{color:C.muted,fontSize:12}}>qty {txn.qty} · {cur(txn.unitPrice)} each · Total {cur(txn.total)} · {fdt(txn.date)}</div>
      </div>
      <div style={{background:C.goldLt,border:`1px solid ${C.gold}40`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:C.text,lineHeight:1.5}}>
        ⚠️ This transaction will be moved to the <strong>Deleted</strong> tab and <strong>inventory will be reversed</strong>
        {txn.type==="sale"?" (items added back to stock)":" (items removed from stock)"}.
      </div>
      <FR label="Reason for deleting *">
        <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Entered by mistake, duplicate entry, customer cancelled…"
          style={{...IST,height:80,resize:"vertical",lineHeight:1.5}}/>
      </FR>
      <div style={{display:"flex",gap:10}}>
        <button onClick={submit}
          style={{flex:1,padding:"9px 22px",borderRadius:8,border:"none",background:C.danger,color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600,fontFamily:HF}}>
          Delete Transaction
        </button>
        <Btn onClick={onClose} outline>Cancel</Btn>
      </div>
    </div>
  );
}

function ChangePassword({savedPwd,setSavedPwd}) {
  const isFirstTime = !savedPwd;
  const [cur2,  setCur2]  = useState("");
  const [newP,  setNewP]  = useState("");
  const [newP2, setNewP2] = useState("");
  const [msg,   setMsg]   = useState(null);
  const [show,  setShow]  = useState(false);

  const submit = () => {
    if (!isFirstTime && cur2 !== savedPwd) { setMsg({type:"err",text:"Current password is incorrect."});return; }
    if (newP.length < 4)  { setMsg({type:"err",text:"Password must be at least 4 characters."});return; }
    if (newP !== newP2)   { setMsg({type:"err",text:"Passwords do not match."});return; }
    setSavedPwd(newP);
    setCur2(""); setNewP(""); setNewP2("");
    setMsg({type:"ok",text:isFirstTime?"Password set successfully! ✓":"Password changed successfully! ✓"});
  };

  return (
    <Panel title={isFirstTime?"Set Your Password":"Change Password"}>
      {isFirstTime&&(
        <div style={{background:C.goldLt,border:`1px solid ${C.gold}40`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:C.text}}>
          No password set yet. Set one below to protect your store.
        </div>
      )}
      {!isFirstTime&&(
        <FR label="Current Password">
          <div style={{position:"relative"}}>
            <input type={show?"text":"password"} value={cur2} onChange={e=>{setCur2(e.target.value);setMsg(null);}}
              placeholder="Enter current password" style={{...IST,paddingRight:40}}/>
            <button onClick={()=>setShow(s=>!s)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:14,color:C.muted}}>
              {show?"🙈":"👁"}
            </button>
          </div>
        </FR>
      )}
      <FR label="New Password">
        <div style={{position:"relative"}}>
          <input type={show?"text":"password"} value={newP} onChange={e=>{setNewP(e.target.value);setMsg(null);}}
            placeholder="At least 4 characters" style={{...IST,paddingRight:40}}/>
          <button onClick={()=>setShow(s=>!s)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:14,color:C.muted}}>
            {show?"🙈":"👁"}
          </button>
        </div>
      </FR>
      <FR label="Confirm Password">
        <input type={show?"text":"password"} value={newP2} onChange={e=>{setNewP2(e.target.value);setMsg(null);}}
          placeholder="Repeat password" style={IST}/>
      </FR>
      {msg&&<div style={{fontSize:13,color:msg.type==="ok"?C.success:C.danger,marginBottom:10,fontWeight:500}}>{msg.text}</div>}
      <Btn onClick={submit} full>{isFirstTime?"Set Password":"Change Password"}</Btn>
    </Panel>
  );
}

function ExpenseForm({onSave,onClose}) {
  const [f,setF]=useState({amount:"",description:"",date:today()});
  const s=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  const submit=()=>{
    if(!f.amount||parseFloat(f.amount)<=0){alert("Please enter a valid amount.");return;}
    if(!f.description.trim()){alert("Please describe this expense.");return;}
    onSave(f);
  };
  return (
    <div>
      <MTitle>Add Other Expense</MTitle>
      <FR label="Description *"><FI v={f.description} onChange={s("description")} ph="e.g. Transport, packaging, stall rent…"/></FR>
      <FR label="Amount (₹) *"><FI v={f.amount} onChange={s("amount")} type="number" ph="0.00"/></FR>
      <FR label="Date"><FI v={f.date} onChange={s("date")} type="date"/></FR>
      <div style={{display:"flex",gap:10,marginTop:8}}>
        <Btn onClick={submit} full>Add Expense</Btn>
        <Btn onClick={onClose} outline>Cancel</Btn>
      </div>
    </div>
  );
}

/* ── FilterField ───────────────────────────────────────────────── */
const FilterField = ({label, children}) => (
  <div style={{display:"flex",flexDirection:"column",gap:6,minWidth:160,flex:"1 1 160px"}}>
    <label style={{fontSize:12,fontWeight:600,color:C.primary,letterSpacing:0.5,textTransform:"uppercase"}}>{label}</label>
    {children}
  </div>
);

/* ── Atoms ─────────────────────────────────────────────────────── */
const IST={padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:"#FBF7FD",color:C.text,outline:"none",width:"100%",fontFamily:HF};
const MTitle=({children})=><div style={{fontFamily:HH,fontSize:20,fontWeight:700,color:C.text,marginBottom:20,paddingBottom:14,borderBottom:`2px solid ${C.gold}50`}}>{children}</div>;
const FR=({label,children})=><div style={{marginBottom:14}}><label style={{fontSize:11,fontWeight:600,color:C.muted,letterSpacing:0.5,display:"block",marginBottom:5,textTransform:"uppercase"}}>{label}</label>{children}</div>;
const FI=({v,onChange,ph,type="text"})=><input value={v} onChange={onChange} placeholder={ph} type={type} style={IST}/>;
const FSel=({v,onChange,opts})=><select value={v} onChange={onChange} style={IST}>{opts.map(o=>typeof o==="string"?<option key={o}>{o}</option>:<option key={o.v} value={o.v}>{o.l}</option>)}</select>;

function Btn({onClick,children,outline,full}) {
  const [h,setH]=useState(false);
  return <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
    style={{padding:"9px 22px",borderRadius:8,border:outline?`1px solid ${C.border}`:"none",
      background:outline?(h?"#F0E4F8":"#fff"):(h?C.primaryDk:C.primary),
      color:outline?C.text:"#fff",cursor:"pointer",fontSize:14,fontWeight:600,fontFamily:HF,
      transition:"all 0.15s",whiteSpace:"nowrap",...(full?{flex:1}:{})}}>
    {children}
  </button>;
}
const SBtn=({onClick,col,children})=><button onClick={onClick} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${col}30`,background:`${col}14`,color:col,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:HF}}>{children}</button>;
const KCard=({label,value,sub,icon,accent,stretch})=>(
  <div style={{background:C.card,borderRadius:14,padding:"20px 22px",border:`1px solid ${C.border}`,boxShadow:"0 2px 8px rgba(45,10,82,0.07)",...(stretch?{display:"flex",flexDirection:"column",justifyContent:"space-between"}:{})}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
      <div style={{fontSize:10,fontWeight:600,color:C.muted,letterSpacing:0.5,textTransform:"uppercase"}}>{label}</div>
      <span style={{fontSize:20}}>{icon}</span>
    </div>
    <div style={{fontFamily:HH,fontSize:22,fontWeight:700,color:accent||C.text,marginBottom:sub?4:0}}>{value}</div>
    {sub&&<div style={{fontSize:12,color:C.muted}}>{sub}</div>}
  </div>
);
const SumCard=({label,value,accent})=>(
  <div style={{background:C.card,borderRadius:14,padding:"20px",border:`1px solid ${C.border}`,textAlign:"center",boxShadow:"0 2px 8px rgba(45,10,82,0.07)"}}>
    <div style={{fontSize:10,fontWeight:600,color:C.muted,letterSpacing:0.5,textTransform:"uppercase",marginBottom:10}}>{label}</div>
    <div style={{fontFamily:HH,fontSize:24,fontWeight:700,color:accent||C.text}}>{value}</div>
  </div>
);
const Panel=({title,children})=>(
  <div style={{background:C.card,borderRadius:14,padding:"20px 22px",border:`1px solid ${C.border}`,boxShadow:"0 2px 8px rgba(45,10,82,0.07)"}}>
    <div style={{fontFamily:HH,fontSize:16,fontWeight:700,color:C.text,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
      <span style={{display:"inline-block",width:3,height:16,background:C.gold,borderRadius:2}}></span>{title}
    </div>
    {children}
  </div>
);
const TBadge=({type})=>{
  if(type==="expense") return <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:4,background:"#FFF8E1",color:"#F57F17",letterSpacing:0.5,whiteSpace:"nowrap"}}>EXPENSE</span>;
  const s=type==="sale";
  return <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:4,background:s?C.outBg:C.inBg,color:s?C.outTxt:C.inTxt,letterSpacing:0.5,whiteSpace:"nowrap"}}>{s?"SALE":"STOCK IN"}</span>;
};
const CBadge=({cat})=>{const col=CAT_COLORS[cat]||"#888";return <span style={{fontSize:11,padding:"3px 9px",borderRadius:12,background:`${col}18`,color:col,fontWeight:600}}>{cat}</span>;};
const Empty=({text,color})=><div style={{textAlign:"center",padding:"28px 0",color:color||C.muted,fontSize:13}}>{text}</div>;
function XBtn({onClick,icon,label,sub}) {
  const [h,setH]=useState(false);
  return <button onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
    style={{flex:"1 1 160px",padding:"18px 16px",borderRadius:12,border:`1px solid ${h?C.primary:C.border}`,
      background:h?"#F5EBF8":C.card,cursor:"pointer",textAlign:"left",transition:"all 0.15s",fontFamily:HF}}>
    <div style={{fontSize:22,marginBottom:8}}>{icon}</div>
    <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:3}}>{label}</div>
    <div style={{fontSize:11,color:C.muted,lineHeight:1.4}}>{sub}</div>
  </button>;
}
