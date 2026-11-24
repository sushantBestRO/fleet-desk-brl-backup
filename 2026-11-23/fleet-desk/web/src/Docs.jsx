import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import Slot from "./Files.jsx";
// LR / CN copies: the consignor copy of every trip, filed against the CN number (matched to the ERP register).
export default function Docs({ token, boot, cfg, me, onDone }) {
  const [veh, setVeh] = useState(boot.fleet[0] || ""), [cn, setCn] = useState(""), [kind, setKind] = useState("LR"), [note, setNote] = useState("");
  const [files, setFiles] = useState([]), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), [k, setK] = useState(0), [d, setD] = useState(null);
  const load = async () => { const r = await api("docs", token, me.driver ? "" : veh); if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg }); setD(r); };
  useEffect(() => { load(); }, [veh]);
  async function send() {
    setMsg(null); if (!cn.trim()) return setMsg({ err: "Type the CN / LR number · CN नंबर लिखो" }); if (!files.length) return setMsg({ err: "Attach the LR photo or PDF · LR की फोटो लगाओ" });
    setBusy(true); const r = await api("docAdd", token, { cn, veh, kind, note, files }); setBusy(false);
    if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg });
    setMsg({ ok: `${cfg.docKinds[kind]} filed for CN ${r.doc.cn} · ${r.doc.veh}` + (r.matched ? "" : "\nThis CN is not in the ERP register yet — it will be linked when the CN is booked.") }); setCn(""); setNote(""); setFiles([]); setK(x => x + 1); load(); onDone(r);
  }
  return (<>
    <div className="card" key={k}>
      <b>File an LR / CN copy · LR की कॉपी भेजो</b>
      <div className="hint">Every trip: photo or PDF of the consignor copy, with the CN number as printed (e.g. E36600). The desk, audit and the settlement check look for it here, not on WhatsApp.</div>
      <div className="row"><div><label>Vehicle · गाड़ी</label><select value={veh} onChange={e => setVeh(e.target.value)}>{boot.fleet.map(v => <option key={v}>{v}</option>)}</select></div>
        <div><label>CN / LR number · CN नंबर</label><input value={cn} autoCapitalize="characters" placeholder="E36600" onChange={e => setCn(e.target.value.toUpperCase())} /></div></div>
      <label>Document · कागज़</label><select value={kind} onChange={e => setKind(e.target.value)}>{Object.keys(cfg.docKinds).map(x => <option key={x} value={x}>{cfg.docKinds[x]}</option>)}</select>
      <Slot slot="doc" label="Photo / PDF · फोटो या PDF" required onFiles={(s, f) => setFiles(f)} />
      <label>Note <small>— optional</small></label><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Panoli → Halol, Lanxess" />
      <button className="send" disabled={busy} onClick={send}>{busy ? "Sending…" : "File it · भेजो"}</button>
      {msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.ok || msg.err}</div>}
    </div>
    {d && d.missing.length > 0 && <div className="card"><b style={{ color: "#c8102e" }}>LR copy still missing · LR बाकी</b> <span className="hint">(own CNs of the last 45 days)</span>
      {d.missing.map(m => <div key={m.cn} className="hint" style={{ fontSize: 13, marginTop: 6 }}><b>{m.cn}</b> · {m.date} · {m.veh} · {m.route} <button className="btn" style={{ padding: "4px 10px", margin: "0 0 0 8px" }} onClick={() => { setVeh(m.veh); setCn(m.cn); setKind("LR"); window.scrollTo(0, 0); }}>File LR</button></div>)}</div>}
    {d && <div className="card"><b>Filed · भेजे हुए</b>
      {!d.rows.length && <div className="hint">Nothing filed yet.</div>}
      <table><tbody>{d.rows.map(r => <tr key={r.id}><td>{r.date}</td><td><b>{r.cn}</b><br /><small>{r.route}</small></td><td>{r.veh.slice(-6)}</td><td>{r.kindLabel}{!r.inErp && <small style={{ color: "#8a6100" }}><br />not in ERP yet</small>}</td><td>{r.urls.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer">file {i + 1} </a>)}</td></tr>)}</tbody></table></div>}
  </>);
}
