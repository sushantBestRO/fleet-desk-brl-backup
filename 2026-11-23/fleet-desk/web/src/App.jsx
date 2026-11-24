import React, { useEffect, useState } from "react";
import { api, device } from "./api.js";
import NewRequest from "./NewRequest.jsx";
import Bill from "./Bill.jsx";
import Approvals from "./Approvals.jsx";
import Idle from "./Idle.jsx";
import Mine from "./Mine.jsx";
import Ledger from "./Ledger.jsx";
import Settlement from "./Settlement.jsx";
import Admin from "./Admin.jsx";
import Market from "./Market.jsx";
import Docs from "./Docs.jsx";
import Statement from "./Statement.jsx";

const idleKey = new URLSearchParams(location.search).get("idle") || "";
const STAFF = ["Sangwari approver", "Sangwari ops", "Internal Audit", "Admin"];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("fd_tok") || ""); const [cfg, setCfg] = useState(null); const [boot, setBoot] = useState(null);
  const [tab, setTab] = useState("new"); const [m, setM] = useState({ mobile: "", pin: "" }); const [err, setErr] = useState("");
  const [conn, setConn] = useState(true); const [lock, setLock] = useState(null); // null | { step: "ask" } | { step: "code", to } 
  const [code, setCode] = useState(""); const [info, setInfo] = useState("");
  const loadBoot = async t => { const r = await api("boot", t, idleKey); if (r.ok) setBoot(r); else { localStorage.removeItem("fd_tok"); setToken(""); setBoot(null); } };
  useEffect(() => { api("cfg").then(setCfg); }, []);
  useEffect(() => { if (token) loadBoot(token); }, [token]);
  const refresh = r => { if (r && r.relogin) { localStorage.removeItem("fd_tok"); setToken(""); setBoot(null); } else loadBoot(token); };
  async function login() {
    setErr(""); setInfo(""); setLock(null); const r = await api("login", m.mobile, m.pin, device(), conn);
    if (!r.ok) return setErr(r.msg); localStorage.setItem("fd_tok", r.token); setToken(r.token);
  }
  async function askPin() {
    setErr(""); setInfo(""); const r = await api("requestPin", m.mobile); if (!r.ok) return setErr(r.msg);
    setInfo(`A 6-digit code was sent to ${r.to}. Enter it and your new PIN.`); setLock({ step: "pin", to: r.to });
  }
  async function setNewPin() {
    setErr(""); const r = await api("confirmPin", m.mobile, code, m.pin, device()); if (!r.ok) return setErr(r.msg);
    localStorage.setItem("fd_tok", r.token); setToken(r.token); setLock(null); setCode("");
  }
  const head = <header><b>Ankleshwar Fleet Desk</b><span>Requests · LR / CN copies · expense statements — WhatsApp photos are not paid · व्हाट्सऐप पर भेजा खर्चा नहीं चलेगा</span></header>;
  if (!cfg) return <>{head}<main>Loading…</main></>;
  if (!token || !boot) return <>{head}<main><div className="card"><b>Log in · लॉगिन</b>
    <label>Mobile number or email · मोबाइल नंबर या ईमेल</label><input type="text" autoCapitalize="none" autoComplete="username" value={m.mobile} onChange={e => setM({ ...m, mobile: e.target.value })} />
    <label>PIN</label><input type="password" inputMode="numeric" value={m.pin} onChange={e => setM({ ...m, pin: e.target.value })} onKeyDown={e => e.key === "Enter" && login()} />
    <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={conn} onChange={e => setConn(e.target.checked)} /> <span>This is my phone — connect it and keep me logged in · यह मेरा फोन है, लॉगिन बनाए रखें</span></label>
    <div className="hint">Connected phone: stays logged in for months, no need to type mobile and PIN again. Not your phone? Untick it — you stay logged in here for 30 days.</div>
    <button className="send" onClick={login}>Log in</button>{err && <div className="msg err">{err}</div>}
    {!lock && <div className="hint" style={{ marginTop: 10 }}>Forgot your PIN? · PIN भूल गए? Type your mobile number above, then <a href="#" onClick={e => { e.preventDefault(); if (!m.mobile) return setErr("Type your mobile number or email first."); askPin(); }}><b>click here</b></a> — a code goes to your registered email. No email? Call the desk · FMS Helpdesk 95949 63357.</div>}
    {lock && lock.step === "pin" && <div className="card" style={{ marginTop: 12 }}>{info && <div className="hint" style={{ marginBottom: 6 }}>{info}</div>}
      <label>6-digit code from the email</label><input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)} />
      <label>New PIN (4–6 digits) · नया PIN</label><input type="password" inputMode="numeric" maxLength={6} value={m.pin} onChange={e => setM({ ...m, pin: e.target.value })} onKeyDown={e => e.key === "Enter" && setNewPin()} />
      <button className="send" onClick={setNewPin}>Set PIN and log in</button></div>}
    </div></main></>;
  const me = boot.me, staff = STAFF.includes(me.role);
  return (<>{head}<main>
    <div className="hint" style={{ marginBottom: 10 }}>Signed in as {me.name} · {me.role}{me.test && " · TEST MODE — requests are marked TEST"} · {me.phone ? <span>📱 this phone is connected</span> : <a href="#" onClick={async e => { e.preventDefault(); const r = await api("connectPhone", token, device()); if (r.relogin) return refresh(r); if (!r.ok) return alert(r.msg); refresh(); }}>Connect this phone</a>} · <a href="#" onClick={e => { e.preventDefault(); api("logout", token); localStorage.removeItem("fd_tok"); setToken(""); setBoot(null); }}>Log out</a></div>
    {idleKey ? <Idle token={token} I={boot.idle} idleKey={idleKey} /> : <>
      <div className="tabs">
        {me.canRaise && <button className={tab === "new" ? "on" : ""} onClick={() => setTab("new")}>{me.driver ? "Pump / खर्चा" : "New request"}</button>}
        {me.canRaise && <button className={tab === "bill" ? "on" : ""} onClick={() => setTab("bill")}>{me.driver ? "Slip · पर्ची" : "Attach slip / bill"}</button>}
        {me.canDocs && <button className={tab === "docs" ? "on" : ""} onClick={() => setTab("docs")}>LR / CN</button>}
        {me.canStmt && <button className={tab === "stmt" ? "on" : ""} onClick={() => setTab("stmt")}>{me.driver ? "महीने का खर्चा" : "Expense statement"}</button>}
        {me.canRaise && <button className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")}>{me.driver ? "मेरी requests" : "My requests"}</button>}
        {staff && <button className={tab === "appr" ? "on" : ""} onClick={() => setTab("appr")}>Approvals</button>}
        <button className={tab === "ledger" ? "on" : ""} onClick={() => setTab("ledger")}>Day ledger</button>
        {staff && <button className={tab === "mkt" ? "on" : ""} onClick={() => setTab("mkt")}>Market hire</button>}
        {staff && <button className={tab === "stl" ? "on" : ""} onClick={() => setTab("stl")}>Settlement</button>}
        {staff && <button className={tab === "stmt" ? "on" : ""} onClick={() => setTab("stmt")}>Statements</button>}
        {["Sangwari approver", "Sangwari ops", "Admin"].includes(me.role) && <button className={tab === "admin" ? "on" : ""} onClick={() => setTab("admin")}>Desk</button>}
      </div>
      {me.canRaise && tab === "new" && <NewRequest token={token} boot={boot} cfg={cfg} onDone={refresh} />}
      {me.canRaise && tab === "bill" && <Bill token={token} boot={boot} onDone={refresh} />}
      {me.canRaise && tab === "mine" && <Mine token={token} onDone={refresh} />}
      {(tab === "appr" || (!me.canRaise && !["ledger", "stl", "admin", "mkt", "docs", "stmt"].includes(tab))) && staff && <Approvals token={token} me={me} onDone={refresh} />}
      {tab === "ledger" && <Ledger token={token} boot={boot} me={me} onDone={refresh} />}
      {tab === "docs" && me.canDocs && <Docs token={token} boot={boot} cfg={cfg} me={me} onDone={refresh} />}
      {tab === "stmt" && (me.canStmt || staff) && <Statement token={token} boot={boot} cfg={cfg} me={me} onDone={refresh} />}
      {tab === "mkt" && staff && <Market token={token} boot={boot} onDone={refresh} />}
      {tab === "stl" && staff && <Settlement token={token} boot={boot} onDone={refresh} />}
      {tab === "admin" && <Admin token={token} onDone={refresh} />}
      <div className="card" style={{ marginTop: 16 }}><b>Recent requests</b>
        <table><tbody><tr><th>Date</th><th>Vehicle</th><th>Type</th><th>₹</th><th>Status</th></tr>
          {boot.recent.map(r => <tr key={r.id}><td>{r.date.slice(8)}/{r.date.slice(5, 7)}</td><td>{String(r.veh).slice(-6)}</td><td>{r.type}</td><td>{r.amt}</td><td>{r.status}{r.level && r.level !== "OK" ? " · " + r.level : ""}</td></tr>)}</tbody></table></div></>}
  </main></>);
}
