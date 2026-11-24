import React, { useState } from "react";
import { api } from "./api.js";
import Slot from "./Files.jsx";

export default function NewRequest({ token, boot, cfg, onDone }) {
  const [veh, setVeh] = useState(boot.fleet[0] || "");
  const [type, setType] = useState("");
  const [f, setF] = useState({ amount: "", litres: "", odo: "", otpMobile: "", pay: "", pumpAcc: "", cn: "", route: "", from: new Date().toISOString().slice(0, 10), to: "", items: "", purpose: "", noReceipt: false, noReceiptWhy: "" });
  const [files, setFiles] = useState({}); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null); const [k, setK] = useState(0);
  const [cart, setCart] = useState([]); const [prog, setProg] = useState("");
  const drv = boot.me.driver, fuel = boot.fuel[veh] || "Diesel", types = cfg.types.filter(t => (!["Diesel", "CNG"].includes(t) || t === fuel) && (!drv || cfg.driverTypes.includes(t)));
  const H = { Diesel: "डीज़ल", CNG: "CNG", "Parking": "पार्किंग", "Toll / green tax": "टोल / ग्रीन टैक्स", "Meal / driver exp": "खाना / ड्राइवर खर्च", "Dala / loading": "दाला / लोडिंग" };
  const set = (n, v) => setF(o => ({ ...o, [n]: v }));
  const cng = type === "CNG", isFuel = type === "Diesel" || cng, trip = type === "Trip advance", need = cfg.need[type] || {};
  const cns = (boot.cns || {})[veh] || []; // this truck's CNs from the ERP register, last 10 days
  const pickCn = v => setF(o => { const c = cns.find(x => x.cn === v.trim()); return { ...o, cn: v, route: c && c.route ? c.route : o.route }; });
  const payList = cng ? cfg.pay.cng : type === "Diesel" ? cfg.pay.diesel : cfg.pay.other;
  const pick = t => { setType(t); setFiles({}); setF(o => ({ ...o, pay: "", purpose: drv && ["Diesel", "CNG"].includes(t) ? `${t} at pump · ${veh}` : o.purpose })); setK(x => x + 1); };
  React.useEffect(() => { if (drv && !type && boot.fleet.length) pick(fuel); }, [veh]);

  const build = () => ({ mode: "new", vehicle: veh, type, amount: f.amount, litres: f.litres, odo: f.odo, otpMobile: cng ? "" : f.otpMobile, pay: f.pay || payList[0], pumpAcc: f.pumpAcc, cn: f.cn, route: f.route,
    from: isFuel || trip ? "" : f.from, to: isFuel || trip ? "" : f.to, items: f.items, purpose: f.purpose, noReceipt: f.noReceipt, noReceiptWhy: f.noReceiptWhy, files: Object.values(files).flat() });
  // same checks as the server (newRequest in src/api.js), so a mistake shows now and not in the middle of sending a list
  function check(p) {
    if (!p.type) return "Pick what the money is for.";
    if (!(+p.amount > 0)) return "Enter the amount.";
    const has = s => p.files.some(x => x.slot === s), noRcpt = p.noReceipt && String(p.noReceiptWhy || "").trim().length >= 5;
    for (const s of Object.keys(need)) if (need[s][1] && !has(s) && !(s === "bills" && noRcpt)) return `Attach: ${need[s][0]}.`;
    if (isFuel && !(+p.odo > 0)) return "Enter the odometer km shown in the photo.";
    if (cng && !(+p.litres > 0)) return "Enter the CNG kg shown on the pump.";
    if (cng && p.pay === cfg.pumpBank && String(p.pumpAcc || "").trim().length < 8) return "Write the CNG pump's name and its account / UPI, so Sitaram ji pays the right account.";
    if (trip && !String(p.cn || "").trim()) return "Enter the LR / CN number.";
    if (!isFuel && !trip && !p.from) return "Enter the work date (from).";
    if (!String(p.purpose || "").trim()) return "Write what the money is for.";
    return "";
  }
  // between two expenses of the same trip, work dates / LR / route / purpose stay; amount, photos and type are cleared
  const clearForm = () => { setType(""); setFiles({}); setK(x => x + 1); setF(o => ({ ...o, amount: "", litres: "", odo: "", items: "", noReceipt: false, noReceiptWhy: "", pumpAcc: "", pay: "" })); };
  const inr = n => "₹" + (+n || 0).toLocaleString("en-IN");
  const total = cart.reduce((s, p) => s + (+p.amount || 0), 0);
  // a type tapped by mistake with an empty form must not block "Send all" once the list has items
  const formUsed = !!type && (f.amount !== "" || Object.values(files).flat().length > 0), useForm = !!type && (!cart.length || formUsed);

  function add() {
    const p = build(), e = check(p); if (e) return setMsg({ err: e });
    setCart(c => [...c, p]); clearForm(); setMsg(null); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function send() {
    const solo = !cart.length; let list = cart;
    if (useForm) { const p = build(), e = check(p); if (e) return setMsg({ err: e }); list = [...cart, p]; if (!solo) { setCart(list); clearForm(); } }
    if (!list.length) return setMsg({ err: "Pick what the money is for." });
    const done = () => setF(o => ({ ...o, cn: "", route: "", purpose: "", to: "" }));
    if (solo) { // one request: exactly as before, the form stays filled if it fails
      setBusy(true); setMsg(null);
      const r = await api("submit", token, list[0]); setBusy(false);
      if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg });
      setMsg({ ok: `Request ${r.id} sent to Sitaram ji for approval.` + (r.level !== "OK" ? `\n\nFlag (${r.level}) — the desk will ask about this:\n${r.flags}` : "\n\nAll checks pass against GPS and the ERP register.") });
      setF(o => ({ ...o, amount: "", litres: "", odo: "", cn: "", route: "", items: "", purpose: "", noReceipt: false, noReceiptWhy: "", pumpAcc: "" })); setFiles({}); setK(x => x + 1); onDone(r); return;
    }
    setBusy(true); setMsg(null);
    const sent = [], left = []; let last = null; const batchId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    for (let i = 0; i < list.length; i++) {
      setProg(`${i + 1} of ${list.length}`);
      const { err, ...p } = list[i], r = await api("submit", token, { ...p, batch: { id: batchId, i, n: list.length } }); // batch → the approver gets one mail for the whole list
      if (r.relogin) { setBusy(false); setProg(""); setCart([...left, ...list.slice(i)]); return onDone(r); }
      if (r.ok) { sent.push({ p, r }); last = r; } else left.push({ ...p, err: r.msg });
    }
    setBusy(false); setProg(""); setCart(left);
    const line = ({ p, r }) => `${r.id} · ${p.type} · ${inr(p.amount)}` + (r.level !== "OK" ? ` — flag (${r.level}), the desk will ask about this:\n${r.flags}` : " — all checks pass");
    const okText = sent.length === 1 && !left.length
      ? `Request ${sent[0].r.id} sent to Sitaram ji for approval.` + (sent[0].r.level !== "OK" ? `\n\nFlag (${sent[0].r.level}) — the desk will ask about this:\n${sent[0].r.flags}` : "\n\nAll checks pass against GPS and the ERP register.")
      : sent.length ? `${sent.length} request${sent.length === 1 ? "" : "s"} sent to Sitaram ji for approval · ${inr(sent.reduce((s, x) => s + (+x.p.amount || 0), 0))}\n\n` + sent.map(line).join("\n") : "";
    const errText = left.length ? `${left.length} not sent — still in the list above. Press Send again, or remove it and enter it again:\n` + left.map(p => `${p.type} ${inr(p.amount)}: ${p.err}`).join("\n") : "";
    setMsg({ ok: okText, err: errText });
    if (sent.length) { done(); onDone(last); }
  }
  return (<>
    {cart.length > 0 && <div className="card cart"><b>Ready to send · भेजने के लिए तैयार — {cart.length} expense{cart.length === 1 ? "" : "s"} · {inr(total)}</b>
      {cart.map((p, i) => <div className="cartrow" key={i}><div><b>{p.type} · {inr(p.amount)}</b><small>{p.vehicle}{p.cn ? " · " + p.cn : ""} · {p.files.length} photo{p.files.length === 1 ? "" : "s"}{p.purpose ? " · " + p.purpose : ""}</small>
        {p.err && <small className="bad">Not sent: {p.err}</small>}</div>
        <button type="button" disabled={busy} onClick={() => setCart(c => c.filter((_, j) => j !== i))}>Remove</button></div>)}
      <div className="hint">Nothing is sent yet. Add the next expense below, then press Send. Each expense goes to Sitaram ji as its own request.</div></div>}
    {drv && !boot.fleet.length && <div className="msg err">Your truck is not set on your login yet. Call the desk · आपकी गाड़ी अभी लॉगिन से जुड़ी नहीं है, डेस्क को बोलें।</div>}
    {drv && <div className="warn" style={{ marginBottom: 10 }}><b>पंप पर: 1) पंप मीटर की फोटो 2) ओडोमीटर की फोटो 3) अपनी फोटो पंप पर → किलो / लीटर और रुपये भरो → भेजो।</b> सीताराम जी approve करेंगे, कैश डेस्क पेमेंट करेगा। पर्ची बाद में "Slip" में लगाओ।</div>}
    <div className="card">
      <label>Vehicle · गाड़ी</label>
      <select value={veh} onChange={e => { setVeh(e.target.value); setType(""); }}>{boot.fleet.map(v => <option key={v}>{v}</option>)}</select>
      {fuel === "CNG" && <div className="hint">CNG vehicle · CNG गाड़ी — fuel in kg</div>}
      <label>What is the money for?</label>
      <div className="types">{types.map(t => <button key={t} type="button" className={t === type ? "on" : ""} onClick={() => pick(t)}>{t}{drv && H[t] ? <><br /><small>{H[t]}</small></> : null}</button>)}</div>
    </div>
    {type && <div className="card">
      <div className="row"><div><label>Amount ₹{drv && " · रुपये"}</label><input type="number" inputMode="decimal" value={f.amount} onChange={e => set("amount", e.target.value)} /></div>
        {isFuel && <div><label>{cng ? "CNG kg" : "Litres"}{drv && (cng ? " · किलो" : " · लीटर")}</label><input type="number" inputMode="decimal" value={f.litres} onChange={e => set("litres", e.target.value)} /></div>}</div>
      {isFuel && <><label>Odometer km <small>— as in the photo{drv && " · फोटो वाला किलोमीटर"}</small></label><input type="number" inputMode="decimal" value={f.odo} onChange={e => set("odo", e.target.value)} />
        {!cng && <><label>Mobile for the OTP <small>— driver's number at the pump</small></label><input type="tel" value={f.otpMobile} onChange={e => set("otpMobile", e.target.value)} /></>}</>}
      <label>{cng ? "Pay to · भुगतान" : type === "Diesel" ? "Pump (OTP)" : "Pay by"}</label>
      <select value={f.pay || payList[0]} onChange={e => set("pay", e.target.value)}>{payList.map(x => <option key={x}>{x}</option>)}</select>
      {cng && (f.pay || payList[0]) === cfg.pumpBank && <><label>CNG pump name + account / UPI <small>— पंप का नाम + खाता / UPI</small></label>
        <input value={f.pumpAcc} placeholder="e.g. Gujarat Gas CNG, GIDC Ankleshwar · A/c 1234567890 IFSC HDFC0001234" onChange={e => set("pumpAcc", e.target.value)} /></>}
      {trip && <><label>LR / CN number{cns.length > 0 && <small> — pick from the list or type</small>}</label><input list="fd-cns" value={f.cn} onChange={e => pickCn(e.target.value)} placeholder="e.g. E36271" />
        <datalist id="fd-cns">{cns.map(c => <option key={c.cn} value={c.cn}>{c.route} · {c.date.slice(8)}/{c.date.slice(5, 7)}</option>)}</datalist><label>Route</label><input value={f.route} onChange={e => set("route", e.target.value)} placeholder="e.g. Panvel → Vapi" /></>}
      {!isFuel && !trip && <><div className="row"><div><label>Work date — from</label><input type="date" value={f.from} onChange={e => set("from", e.target.value)} /></div><div><label>to</label><input type="date" value={f.to} onChange={e => set("to", e.target.value)} /></div></div>
        <label>Each line with amount <small>— e.g. Dala 600, Loading 400</small></label><textarea value={f.items} onChange={e => set("items", e.target.value)} /></>}
      <label>Purpose</label><textarea value={f.purpose} onChange={e => set("purpose", e.target.value)} placeholder="e.g. Ankleshwar → Bhiwandi load, fuel for the trip" />
    </div>}
    {type && <div className="card" key={k}><b>Photos / documents</b>
      <div className="hint">Take the photo with the phone camera or pick from the gallery. Readable numbers only.</div>
      {Object.keys(need).map(s => <Slot key={s} slot={s} label={need[s][0]} required={need[s][1]} onFiles={(sl, fl) => setFiles(o => ({ ...o, [sl]: fl }))} />)}
      {need.bills && <><label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={f.noReceipt} onChange={e => set("noReceipt", e.target.checked)} /> No receipt is available</label>
        {f.noReceipt && <input value={f.noReceiptWhy} placeholder="Why — e.g. hotel parking, no slip given" onChange={e => set("noReceiptWhy", e.target.value)} />}</>}
    </div>}
    {type && !drv && <button className="addmore" type="button" disabled={busy} onClick={add}>+ Add another expense · एक और खर्चा जोड़ें</button>}
    <button className="send" disabled={busy} onClick={send}>{busy ? `Sending… ${prog}` : cart.length + (useForm ? 1 : 0) > 1 ? `Send all ${cart.length + (useForm ? 1 : 0)} requests · ${inr(total + (useForm ? +f.amount || 0 : 0))}` : drv ? "भेजो · Send" : "Send request"}</button>
    {msg && msg.ok && <div className="msg ok">{msg.ok}</div>}
    {msg && msg.err && <div className="msg err">{msg.err}</div>}
  </>);
}
