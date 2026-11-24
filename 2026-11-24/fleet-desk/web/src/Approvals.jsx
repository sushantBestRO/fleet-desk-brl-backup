import React, { useEffect, useState } from "react";
import { api } from "./api.js";
const links = s => String(s || "").split("\n").filter(Boolean);
export default function Approvals({ token, me, onDone }) {
  const [rows, setRows] = useState(null); const [msg, setMsg] = useState(null); const [form, setForm] = useState({}); const [bulk, setBulk] = useState(""); // "" | "ask" | "3 of 5"
  const load = async () => { const r = await api("list", token); if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg }); setRows(r.rows); };
  useEffect(() => { load(); }, []);
  const f = (id, k) => (form[id] || {})[k] || ""; const set = (id, k, v) => setForm(o => ({ ...o, [id]: { ...o[id], [k]: v } }));
  async function act(id, action) {
    setMsg(null); const r = await api("act", token, id, action, f(id, "note"), f(id, "ref"));
    if (!r.ok) return r.relogin ? onDone(r) : setMsg({ err: r.msg }); setMsg({ ok: `${id}: ${r.status}` }); load(); onDone(r);
  }
  const R = me.role;
  // Clean = raised, every GPS / ERP check passes, and not the approver's own request. Flagged ones are always opened one by one.
  const clean = (rows || []).filter(a => R === "Sangwari approver" && a.status === "Raised" && a.level === "OK" && a.raisedBy !== me.email);
  const cleanAmt = clean.reduce((s, a) => s + (+a.amount || 0), 0), inr = n => "₹" + (+n || 0).toLocaleString("en-IN");
  async function approveClean() {
    setMsg(null); const done = [], bad = []; let last = null;
    for (let i = 0; i < clean.length; i++) {
      setBulk(`${i + 1} of ${clean.length}`); const a = clean[i], r = await api("act", token, a.id, "approve", "", "");
      if (r.relogin) { setBulk(""); return onDone(r); }
      if (r.ok) { done.push(`${a.id} · ${a.type} · ${inr(a.amount)} → ${r.status}`); last = r; } else bad.push(`${a.id}: ${r.msg}`);
    }
    setBulk(""); setMsg({ ok: done.length ? `${done.length} approved:\n` + done.join("\n") : "", err: bad.length ? `${bad.length} not approved:\n` + bad.join("\n") : "" }); load(); if (last) onDone(last);
  }
  const buttons = a => {
    const B = (action, label, cls) => <button key={action} className={"btn " + (cls || "")} onClick={() => act(a.id, action)}>{label}</button>;
    if (a.status === "Raised" && R === "Sangwari approver") return [B("approve", "Approve", "ok"), B("reject", "Reject", "red")];
    if (R === "Internal Audit" && ["Awaiting audit", "Approved", "Paid"].includes(a.status)) { const x = []; if (a.status === "Awaiting audit") x.push(B("audit_clear", "Clear (audit)", "ok"), B("reject", "Reject", "red")); x.push(B("audit_review", "Mark reviewed")); return x; }
    if (R === "Admin") return [B("admin_set", "Set status → (type it in the reference box)", "red")];
    if (a.status === "Approved" && ["Sangwari approver", "Sangwari ops"].includes(R)) return [B("pay", "Mark paid", "ok")];
    if (a.status === "Paid" && ["Sangwari approver", "Sangwari ops", "Internal Audit"].includes(R)) return [B("close", "Close")];
    return [];
  };
  if (!rows) return <div className="card">Loading…</div>;
  return (<>
    {msg && msg.ok && <div className="msg ok">{msg.ok}</div>}
    {msg && msg.err && <div className="msg err">{msg.err}</div>}
    {clean.length > 1 && <div className="card cart"><b>{clean.length} requests pass every check · {inr(cleanAmt)}</b>
      <div className="hint">GPS and ERP checks are all OK on these. Flagged requests are not included — open those one by one below.</div>
      {bulk === "" && <button className="btn ok" onClick={() => setBulk("ask")}>Approve all {clean.length} clean requests</button>}
      {bulk === "ask" && <>{clean.map(a => <div className="hint" key={a.id}>{a.id} · {a.veh} · {a.type} · {inr(a.amount)} · {a.purpose.split("\n")[0]}</div>)}
        <button className="btn ok" onClick={approveClean}>Yes, approve these {clean.length} · {inr(cleanAmt)}</button><button className="btn" onClick={() => setBulk("")}>Cancel</button></>}
      {bulk !== "" && bulk !== "ask" && <div className="hint">Approving… {bulk}</div>}</div>}
    {!rows.length && <div className="card">Nothing waiting for you.</div>}
    {rows.map(a => (
      <div className="card" key={a.id}>
        <b>{a.id}</b> · {a.veh} · {a.type} · ₹{a.amount} <span className={"pill " + a.level}>{a.level || "—"}</span> <span className="pill">{a.status}</span>
        <div className="hint">{a.date} · raised by {a.raisedBy}{a.litres ? ` · ${a.litres} ${a.type === "CNG" ? "kg" : "L"}` : ""}{a.odo ? ` · odo ${a.odo}` : ""} · {a.mode}{a.from ? ` · work ${a.from}${a.to && a.to !== a.from ? " → " + a.to : ""}` : ""}{a.stmt ? ` · statement ${a.stmt}` : ""}</div>
        {a.cn && <div className="hint">LR / CN <b>{a.cn}</b>: {a.lr.length ? a.lr.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer">LR copy {i + 1} </a>) : <span style={{ color: "#c8102e" }}>no LR copy on file yet (LR / CN tab)</span>}</div>}
        <div className="flags">{a.purpose}</div>
        {a.level !== "OK" && <div className="flags" style={{ color: "#7a2e0e" }}>{a.flags}</div>}
        <div className="hint">{[...links(a.photo), ...links(a.bill), ...links(a.driverPhoto)].map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer">file {i + 1} </a>)}</div>
        {buttons(a).length > 0 && <>
          <input placeholder="Note / reason (needed for reject and audit)" value={f(a.id, "note")} onChange={e => set(a.id, "note", e.target.value)} style={{ marginTop: 8 }} />
          {(a.status === "Approved" || R === "Admin") && <input placeholder="OTP / Happay / UTR reference (for Paid)" value={f(a.id, "ref")} onChange={e => set(a.id, "ref", e.target.value)} style={{ marginTop: 6 }} />}
          {buttons(a)}</>}
      </div>))}
  </>);
}
