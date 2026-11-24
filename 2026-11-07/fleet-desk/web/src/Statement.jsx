import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import Slot from "./Files.jsx";
const iso = d => d.toISOString().slice(0, 10), ist = () => new Date(Date.now() + 19800e3);
const firstOfMonth = () => iso(new Date(Date.UTC(ist().getUTCFullYear(), ist().getUTCMonth(), 1)));
const blank = () => ({ from: "", to: "", cn: "", head: "", amount: "", note: "", veh: "" });
// The branch's monthly expense sheet, typed into the app: one line per trip and head (dala, fooding, parking, grease …).
// Each line becomes its own request for Sitaram; the statement nets off the advances already paid in the period.
export default function Statement({ token, boot, cfg, me, onDone }) {
  const staffOnly = !me.canStmt;
  const [veh, setVeh] = useState(boot.fleet[0] || ""), [from, setFrom] = useState(firstOfMonth()), [to, setTo] = useState(iso(ist())), [lines, setLines] = useState([blank()]);
  const [files, setFiles] = useState({}), [noR, setNoR] = useState(false), [why, setWhy] = useState(""), [note, setNote] = useState(""), [pv, setPv] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), [k, setK] = useState(0), [list, setList] = useState(null);
  const heads = Object.keys(cfg.stmtHeads);
  const preview = async () => { if (staffOnly) return; const r = await api("stmtPreview", token, veh, from, to); if (r.ok) setPv(r); };
  const loadList = async () => { const r = await api("statements", token, staffOnly ? "" : veh); if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg }); setList(r.rows); };
  useEffect(() => { preview(); loadList(); }, [veh, from, to]);
  const set = (i, key, v) => setLines(L => L.map((l, j) => (j === i ? { ...l, [key]: v } : l)));
  const total = lines.reduce((s, l) => s + (+l.amount || 0), 0), paid = pv ? pv.paidTotal : 0;
  async function send() {
    setMsg(null); setBusy(true);
    const r = await api("statement", token, { veh, from, to, lines, files: Object.values(files).flat(), noReceipt: noR, noReceiptWhy: why, note }); setBusy(false);
    if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg });
    setMsg({ ok: `Statement ${r.id} sent to Sitaram ji: ${r.lines.length} lines, ₹${r.total} claimed, ₹${r.paidBeforeTotal} already paid in this period, net ₹${r.net}.` + (r.lines.some(l => l.level !== "OK") ? "\nFlagged lines: " + r.lines.filter(l => l.level !== "OK").map(l => `line ${l.line} (${l.level})`).join(", ") : "") });
    setLines([blank()]); setFiles({}); setNoR(false); setWhy(""); setNote(""); setK(x => x + 1); loadList(); onDone(r);
  }
  return (<>
    {!staffOnly && <div className="card" key={k}>
      <b>Expense statement · महीने का खर्चा</b>
      <div className="hint">Same as the typed sheet: one line per trip and head. Each line goes to Sitaram ji as its own request. Money already paid to you in the period is deducted automatically.<br />एक लाइन = एक ट्रिप का एक खर्चा (दाला / खाना / पार्किंग / ग्रीस…)। जो पैसा पहले मिल चुका है वह अपने आप कट जाएगा।</div>
      <div className="row"><div><label>Vehicle</label><select value={veh} onChange={e => setVeh(e.target.value)}>{boot.fleet.map(v => <option key={v}>{v}</option>)}</select></div>
        <div><label>From</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div><div><label>To</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div></div>
      {lines.map((l, i) => <div key={i} style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 4 }}>
        <div className="hint"><b>Line {i + 1}</b></div>
        <div className="row"><div><label>Trip from</label><input type="date" value={l.from} min={from} max={to} onChange={e => set(i, "from", e.target.value)} /></div><div><label>to</label><input type="date" value={l.to} min={from} max={to} onChange={e => set(i, "to", e.target.value)} /></div></div>
        <div className="row"><div><label>Head · मद</label><select value={l.head} onChange={e => set(i, "head", e.target.value)}><option value="">— pick —</option>{heads.map(h => <option key={h}>{h}</option>)}</select></div>
          <div><label>Amount ₹</label><input type="number" inputMode="decimal" value={l.amount} onChange={e => set(i, "amount", e.target.value)} /></div></div>
        <div className="row"><div><label>LR / CN</label><input value={l.cn} autoCapitalize="characters" placeholder="E36593" onChange={e => set(i, "cn", e.target.value.toUpperCase())} /></div>
          <div style={{ flex: 2 }}><label>Trip / what for · ट्रिप</label><input value={l.note} placeholder="Panoli → Halol, 3 days fooding" onChange={e => set(i, "note", e.target.value)} /></div></div>
        {(boot.allVeh || []).length > 1 && <><label>Other vehicle <small>— only if this line was on another truck</small></label><select value={l.veh} onChange={e => set(i, "veh", e.target.value)}><option value="">{veh}</option>{boot.allVeh.filter(v => v !== veh).map(v => <option key={v}>{v}</option>)}</select></>}
        {lines.length > 1 && <button className="btn red" style={{ padding: "4px 10px" }} onClick={() => setLines(L => L.filter((_, j) => j !== i))}>Remove line</button>}
      </div>)}
      <button className="btn" onClick={() => setLines(L => [...L, { ...blank(), from: L[L.length - 1].to || L[L.length - 1].from }])}>+ Add line · लाइन जोड़ो</button>
      <div className="warn" style={{ marginTop: 12 }}>Claimed <b>₹{total}</b>{pv && <> · already paid in this period <b>₹{paid}</b> ({pv.paid.length} advance{pv.paid.length === 1 ? "" : "s"}) · <b>net ₹{total - paid}</b></>}
        {pv && pv.paid.length > 0 && <div className="hint">{pv.paid.map(a => `${a.id} ${a.type} ₹${a.amount} (${a.date})`).join(" · ")}</div>}
        {pv && pv.open.length > 0 && <div className="hint" style={{ color: "#8a6100" }}>Still open, not deducted: {pv.open.map(a => `${a.id} ₹${a.amount}`).join(" · ")}</div>}</div>
      <Slot slot="sheet" label="Typed / handwritten statement sheet · लिखी हुई शीट" onFiles={(s, f) => setFiles(o => ({ ...o, [s]: f }))} />
      <Slot slot="bills" label="Receipts · रसीदें (parking, police, grease, hotel…)" onFiles={(s, f) => setFiles(o => ({ ...o, [s]: f }))} />
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={noR} onChange={e => setNoR(e.target.checked)} /> No receipts for some lines</label>
      {noR && <input value={why} placeholder="Why — e.g. dala paid cash to hamals, no slip" onChange={e => setWhy(e.target.value)} />}
      <label>Note to Sitaram ji <small>— optional</small></label><input value={note} onChange={e => setNote(e.target.value)} />
      <button className="send" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send statement · भेजो"}</button>
      {msg && <div className={"msg " + (msg.ok ? "ok" : "err")}>{msg.ok || msg.err}</div>}
    </div>}
    {list && <div className="card"><b>{staffOnly ? "Statements" : "Your statements"}</b>
      {!list.length && <div className="hint">None yet.</div>}
      {list.map(s => <div key={s.id} style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 6 }}>
        <b>{s.id}</b> · {s.veh} · {s.from} → {s.to} · claimed ₹{s.total} · already paid ₹{s.paidBeforeTotal} · <b>net ₹{s.net}</b>
        <div className="hint">approved ₹{s.approved} · paid ₹{s.paid} · open ₹{s.open} · rejected ₹{s.rejected} · by {s.raisedBy} {s.raisedAt}{s.note ? " · " + s.note : ""} {s.files.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer">file {i + 1} </a>)}</div>
        <table><tbody>{s.lines.map(l => <tr key={l.id}><td>{l.from}{l.to !== l.from ? "–" + l.to.slice(5) : ""}</td><td>{l.head.split(" · ")[0]}<br /><small>{l.cn ? "LR " + l.cn + " · " : ""}{l.note}</small></td><td>₹{l.amount}</td><td><span className="pill">{l.status}</span> {l.level && l.level !== "OK" && <span className={"pill " + l.level}>{l.level}</span>}{l.note2 && <small><br />{l.note2}</small>}</td></tr>)}</tbody></table>
      </div>)}</div>}
  </>);
}
