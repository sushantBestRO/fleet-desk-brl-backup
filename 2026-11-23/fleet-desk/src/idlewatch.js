// Every morning: own-truck days that were idle, or ran with no CN -> record + mail the branch (re-mailed until answered).
const { db, save, log } = require("./store");
const { addDays, range, today, dmy } = require("./util");
const { dayStatus } = require("./rules");
const loadData = () => require("./api").loadData();
const mail = require("./mail");
const LOOKBACK = 7;
// Market CNs booked while our own truck was free go out as ONE daily report from Internal Audit (see report() below), not one mail per CN.
const dailyReport = () => !/^\s*no/i.test(mail.S("Market-while-idle report: daily mail", "Yes"));
function run() {
  if (!mail.S("Idle watch from")) { db.settings["Idle watch from"] = today(); save(); } // first run: starts counting from today, like the sheet
  const D = loadData(), S = mail.S, start = S("Idle watch from") || today(), y = addDays(today(), -1), from = [addDays(y, -LOOKBACK + 1), start].sort().pop(), fresh = [];
  db.fleet.forEach(f => range(from, y).forEach(d => {
    const st = dayStatus(D, f.veh, d); if (!["idle", "unbooked"].includes(st.s)) return;
    const key = `${f.veh}_${d}`, g = db.gps[key] || {}; if (db.idle.some(r => r.key === key)) return; if (String(g.note || "").trim()) return;
    const loads = db.local.filter(l => l.kind === "Market" && l.date === d);
    db.idle.push({ key, date: d, veh: f.veh, status: st.s === "idle" ? "Idle" : "Running, no CN", km: st.km, where: [g.halts, g.places].filter(String).join("\n"), loads: loads.map(l => `${l.cn} ${l.route} (${l.veh})`).join("\n"), hire: loads.reduce((t, l) => t + (+l.hire || 0), 0) || "", detected: Date.now(), mails: 0, lastMailed: "", vehConfirmed: "", reason: "", details: "", action: "", explainedBy: "", explainedAt: "", hours: "", photos: "", state: "Waiting for branch" });
    fresh.push(key);
  }));
  db.local.filter(l => l.kind === "Market" && String(l.free).startsWith("Yes") && l.date >= from && l.date <= y).forEach(l => { // one explanation per market CN booked while our truck was free
    const key = `CN_${l.cn}`; if (db.idle.some(r => r.key === key)) return; const g = db.gps[`${l.freeVeh}_${l.date}`] || {};
    db.idle.push({ key, date: l.date, veh: l.freeVeh, status: `Market CN ${l.cn} while our truck was free`, km: g.km == null ? "" : g.km, where: [g.halts, g.places].filter(String).join("\n"),
      loads: `${l.cn} ${l.route} · market vehicle ${l.veh} · ${l.party} · our truck ${String(l.free).replace("Yes — ", "")}`, hire: l.hire || "", detected: Date.now(), mails: 0, lastMailed: "", vehConfirmed: "", reason: "", details: "", action: "", explainedBy: "", explainedAt: "", hours: "", photos: "", state: "Waiting for branch" });
    fresh.push(key);
  });
  const to = mail.list(S("Idle watch mail to", "ankleshwar@bestroadways.com")); let sent = 0;
  db.idle.filter(r => r.state === "Waiting for branch").forEach(r => {
    const isNew = fresh.includes(r.key), link = `${process.env.APP_URL}/?idle=${encodeURIComponent(r.key)}`, day = dmy(r.date);
    const btn = `<p style="margin:16px 0 8px;"><a href="${link}" style="display:inline-block;background:#c8102e;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px;font-weight:bold;">Explain this day · कारण बताएँ</a></p>`;
    if (r.key.startsWith("CN_") && dailyReport()) return; // listed in the daily report instead
    if (r.key.startsWith("CN_")) { const cn = r.key.slice(3); const bt = btn.replace("Explain this day", "Explain this CN");
      mail.compose(to, `${isNew ? "" : "Reminder · "}Market CN ${cn} on ${day} while ${r.veh} was free — explanation needed`, [["Market CN · मार्केट CN", r.loads], ["Hire paid ₹", r.hire], ["Our truck · हमारी गाड़ी", r.veh], ["Our truck that day", String(r.where || "").replace(/\n/g, "<br>")]],
        (isNew ? "" : `<b>Reminder ${r.mails + 1} — not explained yet.</b><br>`) + `Market CN <b>${cn}</b> was booked on <b>${day}</b> for a local load, while our own truck <b>${r.veh}</b> was free nearby. Please explain on the app within 24 hours: why it was not used for this load, and what will be done.<br><span style="color:#7a2e0e;">${day} को लोकल माल के लिए मार्केट CN <b>${cn}</b> बना, जबकि हमारी अपनी गाड़ी <b>${r.veh}</b> पास में खाली थी। कृपया 24 घंटे के अंदर कारण बताएँ।</span>`, bt, true);
      r.mails++; r.lastMailed = new Date().toISOString(); sent++; return; }
    const idle = r.status === "Idle";
    const intro = (isNew ? "" : `<b>Reminder ${r.mails + 1} — not explained yet.</b> · <b>याद दिलाना — अभी तक कारण नहीं बताया।</b><br>`) + `Our truck <b>${r.veh}</b> was <b>${idle ? "standing idle" : "running without a CN"}</b> on <b>${day}</b>. Please explain on the app within 24 hours: confirm the vehicle number, why it was not used, and what is being done.<br>` +
      `<span style="color:#7a2e0e;">हमारी गाड़ी <b>${r.veh}</b> ${day} को <b>${idle ? "खड़ी रही" : "बिना CN के चली"}</b>। कृपया 24 घंटे के अंदर ऐप पर गाड़ी नंबर, गाड़ी क्यों इस्तेमाल नहीं हुई, और क्या किया जा रहा है — यह बताएँ।</span>`;
    mail.compose(to, `${isNew ? "" : "Reminder · "}Truck ${r.veh} ${idle ? "idle" : "ran without CN"} on ${day} — explanation needed`, [["Vehicle · गाड़ी", r.veh], ["Date · तारीख", day], ["Status", r.status], ["GPS km", r.km], ["Where it stood / ran · कहाँ खड़ी / चली", String(r.where || "").replace(/\n/g, "<br>")]], intro, btn, true);
    r.mails++; r.lastMailed = new Date().toISOString(); sent++;
  });
  db.idle.sort((a, b) => (a.date < b.date ? 1 : -1)); save(); log("system", "Idle watch", `${from} → ${y}`, `${fresh.length} new, ${sent} mailed`);
  return `Idle watch: ${fresh.length} new day(s), ${sent} mail(s)`;
}

// ---------------------------------------------------------------------------------------------------------------
// Daily report · market vehicles placed while our own truck was idle / free nearby.
// From Internal Audit to the branch, every morning after the GPS and ERP fetch. Every open CN has a "Give reason" button
// that opens the reason form in the app; the reason then shows in the next day's report.
// Settings (Desk → Settings), all optional:
//   "Market-while-idle report: daily mail"   Yes / No   (No = back to one mail per CN from FMS)
//   "Market-while-idle report: from"         internalaudit@bestroadways.com
//   "Market-while-idle report: to"           ankleshwar@bestroadways.com, virendra.singh@bestroadways.com
//   "Market-while-idle report: cc"           ashish.gupta@bestroadways.com, jaikumar.gupta@bestroadways.com, sangwari@bestroadways.com, rakeshkumar.sangwari@bestroadways.com, mumbai@bestroadways.com
//   "Market-while-idle report: send when nil" Yes / No
//   "Market-while-idle report: overdue after days"  3   (older unanswered CNs go in a red OVERDUE block on top)
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inr = n => "₹" + Math.round(+n || 0).toLocaleString("en-IN");
const stampMs = s => { const m = String(s || "").match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) - 19800e3 : 0; };
// Is the check able to run at all? Without GPS for our truck, or without ERP CNs for the day, "0" means "not checked", not "all clear".
function health(y, msgs) {
  const days = range(addDays(y, -6), y), problems = [], notes = [];
  db.fleet.forEach(f => {
    const start = require("./util").iso(f.start || ""), want = days.filter(d => !start || d >= start);
    const miss = want.filter(d => !db.gps[`${f.veh}_${d}`]);
    if (want.includes(y) && !db.gps[`${f.veh}_${y}`]) problems.push(`No GPS for our truck ${f.veh} on ${dmy(y)} — the idle check could not run for it`);
    else if (miss.length) notes.push(`GPS missing for ${f.veh} on ${miss.map(dmy).join(", ")}`);
  });
  const erpY = db.erp.filter(e => e.date === y).length, lastErp = db.erp.reduce((m, e) => (e.date > m ? e.date : m), "");
  if (!lastErp || lastErp < y) problems.push(`No ERP CNs received for ${dmy(y)} (last ERP day: ${lastErp ? dmy(lastErp) : "none"})`);
  (msgs || []).filter(m => /FAILED|not set/i.test(m)).forEach(m => problems.push("Morning job: " + m));
  return { ok: !problems.length, problems, notes, erpY };
}
function reportData(msgs) {
  const y = addDays(today(), -1), cn = db.idle.filter(r => String(r.key).startsWith("CN_")), byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const od = Math.max(1, +mail.S("Market-while-idle report: overdue after days", "3") || 3), age = r => Math.max(0, Math.round((Date.parse(today()) - Date.parse(r.date)) / 864e5));
  const open = cn.filter(r => r.state === "Waiting for branch").sort((a, b) => -byDate(a, b)); // oldest first: nothing sinks to the bottom
  const overdue = open.filter(r => age(r) > od), due = open.filter(r => age(r) <= od);
  const done = cn.filter(r => r.state !== "Waiting for branch" && stampMs(r.explainedAt) > Date.now() - 26 * 36e5).sort(byDate);
  const mkt = db.local.filter(l => l.kind === "Market" && l.date === y); // every local market CN yesterday, flagged or not
  const late = cn.filter(r => r.date < y && +r.detected > Date.now() - 26 * 36e5); // found today for an earlier day (CN entered late in ERP)
  const wFrom = addDays(y, -6), week = db.local.filter(l => l.kind === "Market" && l.date >= wFrom && l.date <= y).sort((a, b) => (a.date < b.date ? 1 : -1));
  return { y, wFrom, open, overdue, due, od, done, yday: cn.filter(r => r.date === y), mkt, week, late, health: health(y, msgs) };
}
function reportHtml(R) {
  const L = r => db.local.find(l => l.cn === r.key.slice(3)) || {}, age = r => Math.max(0, Math.round((Date.parse(today()) - Date.parse(r.date)) / 864e5));
  const td = 'style="padding:8px 10px;border:1px solid #d9dee7;vertical-align:top;"', th = 'style="padding:7px 10px;border:1px solid #d9dee7;background:#0f2747;color:#fff;text-align:left;font-size:12px;"';
  const row = (r, cell) => { const l = L(r), free = String(l.free || "").replace(/^Yes — /, "") || String(r.status || "");
    return `<tr><td ${td}><b>${esc(r.key.slice(3))}</b> · ${dmy(r.date)}<br>${esc(l.route || "")}<br><b>${+l.km ? `${l.km} km` : "km not in ERP"}</b> · <b>${+l.wt ? `${l.wt} t` : "weight not in ERP"}</b><br><span style="color:#5b6675;">${esc(l.party || "")}</span></td>` +
      `<td ${td}><b>${esc(l.veh || "")}</b><br><span style="color:#5b6675;">${esc(l.broker || "")}</span><br>Hire <b>${inr(r.hire || l.hire)}</b></td>` +
      `<td ${td}><b>${esc(r.veh)}</b><br>${esc(free)}</td><td ${td}>${cell(r)}</td></tr>`; };
  const head = last => `<tr><th ${th}>Market CN · route · distance · weight</th><th ${th}>Market vehicle placed</th><th ${th}>Our own truck that day</th><th ${th}>${last}</th></tr>`;
  const btn = r => `<a href="${process.env.APP_URL}/?idle=${encodeURIComponent(r.key)}" style="display:inline-block;background:#c8102e;color:#fff;padding:9px 14px;text-decoration:none;border-radius:4px;font-weight:bold;white-space:nowrap;">Give reason · कारण बताएँ</a>` +
    `<br><span style="font-size:12px;color:${age(r) > 1 ? "#c8102e" : "#5b6675"};">${age(r) <= 1 ? "New" : `Waiting ${age(r)} days · ${age(r)} दिन से बाकी`}</span>`;
  const ans = r => `<b>${esc(String(r.reason).split(" · ")[0])}</b><br>${esc(r.details).replace(/\n/g, "<br>")}<br><span style="color:#5b6675;font-size:12px;">Action: ${esc(r.action)} · by ${esc(r.explainedBy)}${r.state === "Explained late" ? " · <b style=\"color:#c8102e;\">late</b>" : ""}</span>`;
  const sum = a => a.reduce((s, r) => s + (+r.hire || +L(r).hire || 0), 0);
  const box = (n, label, red) => `<td style="padding:10px 12px;border:1px solid #d9dee7;background:${red ? "#fdecee" : "#f4f6fa"};width:33%;"><div style="font-size:22px;font-weight:700;color:${red ? "#c8102e" : "#0f2747"};">${n}</div><div style="font-size:12px;color:#5b6675;">${label}</div></td>`;
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1b2430;max-width:820px;">
  <div style="background:#0f2747;color:#fff;padding:12px 16px;font-size:16px;font-weight:700;border-bottom:4px solid #c8102e;">Internal Audit · Market vehicle placed while our own truck was idle</div>
  <p style="margin:16px 0 10px;line-height:1.55;">Daily report for <b>${dmy(R.y)}</b>. Each market CN below was booked for a local load while one of our own trucks was standing idle or free nearby. For every CN, press <b>Give reason</b> and tell us why our truck was not used.<br>
  <span style="color:#7a2e0e;">नीचे की हर मार्केट CN उस दिन बनी जब हमारी अपनी गाड़ी पास में खाली खड़ी थी। हर CN के लिए <b>कारण बताएँ</b> बटन दबाकर बताइए कि हमारी गाड़ी क्यों नहीं लगाई गई।</span></p>
  <table style="border-collapse:collapse;width:100%;margin:0 0 14px;"><tr>${box(R.week.length, `local market CNs · last 7 days · hire ${inr(R.week.reduce((t, l) => t + (+l.hire || 0), 0))}<br>yesterday <b>${R.mkt.length}</b> · while our truck was free <b>${R.week.filter(l => l.free).length}</b>`, R.yday.length > 0)}${box(R.open.length, `waiting for a reason · hire ${inr(sum(R.open))}` + (R.overdue.length ? ` · <b style="color:#c8102e;">${R.overdue.length} overdue</b>` : ""), R.open.length > 0)}${box(R.done.length, "reasons received since the last report")}</tr></table>` +
  (R.health.ok ? "" : `<div style="margin:0 0 14px;padding:10px 12px;background:#fff4e0;border-left:4px solid #d97706;"><b>Check incomplete · जाँच पूरी नहीं हुई</b> — the numbers above may be short. FMS Helpdesk has been told.<ul style="margin:6px 0 0 18px;padding:0;">${R.health.problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul></div>`) +
  (R.overdue.length ? `<p style="margin:14px 0 6px;padding:8px 10px;background:#c8102e;color:#fff;font-weight:700;">OVERDUE · more than ${R.od} days without a reason · ${R.od} दिन से ज़्यादा, कारण नहीं बताया (${R.overdue.length} · hire ${inr(sum(R.overdue))})</p><table style="border-collapse:collapse;width:100%;font-size:13px;">${head("Reason")}${R.overdue.map(r => row(r, btn)).join("")}</table>` : "") +
  (R.due.length ? `<p style="margin:16px 0 6px;font-weight:700;color:#c8102e;">Reason needed · कारण बताना बाकी (${R.due.length})</p><table style="border-collapse:collapse;width:100%;font-size:13px;">${head("Reason")}${R.due.map(r => row(r, btn)).join("")}</table>` : "") +
  (R.open.length || !R.health.ok ? ""
    : `<p style="margin:14px 0;padding:10px 12px;background:#e8f5ec;border-left:4px solid #1e7d43;">No market CN is waiting for a reason. · कोई कारण बाकी नहीं है।</p>`) +
  (R.done.length ? `<p style="margin:18px 0 6px;font-weight:700;color:#1e7d43;">Reasons received · मिले हुए कारण (${R.done.length})</p><table style="border-collapse:collapse;width:100%;font-size:13px;">${head("Reason given by the branch")}${R.done.map(r => row(r, ans)).join("")}</table>` : "") +
  (R.week.length ? `<p style="margin:18px 0 6px;font-weight:700;color:#0f2747;">All local market CNs · ${dmy(R.wFrom)} → ${dmy(R.y)} · पिछले 7 दिन की सभी लोकल मार्केट CN (${R.week.length})</p>
  <table style="border-collapse:collapse;width:100%;font-size:12px;"><tr><th ${th}>Date · CN</th><th ${th}>Route · party</th><th ${th}>Market vehicle · hire</th><th ${th}>Our truck that day</th></tr>${R.week.map(l => {
    const own = db.fleet.map(f => { const g = db.gps[`${f.veh}_${l.date}`], n = db.erp.filter(e => e.veh === f.veh && e.date === l.date && e.kind === "Own").length;
      return `${esc(f.veh)}: ${g ? `${g.km} km` : "no GPS"} · ${n} own CN${n === 1 ? "" : "s"}`; }).join("<br>");
    return `<tr${l.free ? ' style="background:#fdecee;"' : ""}><td ${td}>${dmy(l.date)}<br><b>${esc(l.cn)}</b></td><td ${td}>${esc(l.route)}<br><span style="color:#5b6675;">${esc(l.party)}</span></td><td ${td}>${esc(l.veh)}<br>${+l.hire ? inr(l.hire) : "hire not in ERP"}</td><td ${td}>${own}${l.free ? `<br><b style="color:#c8102e;">Free · ${esc(String(l.free).replace(/^Yes — /, ""))}</b>` : ""}</td></tr>`; }).join("")}</table>` : "") +
  `<p style="margin:16px 0 0;font-size:12px;color:#5b6675;line-height:1.5;">How this is found: ERP local CNs (both ends within 80 km of Ankleshwar) on a market vehicle, on a day when GPS shows our own truck idle or running without a CN nearby. The reason is saved against the CN and stays on record. CNs entered late in the ERP are picked up on the next morning's run (last 7 days are re-read).` +
  (R.health.notes.length ? `<br>${R.health.notes.map(esc).join("<br>")}` : "") + `</p>
  <p style="font-size:13px;line-height:1.5;border-top:1px solid #d9dee7;padding-top:10px;margin-top:14px;">Regards,<br><b style="color:#0f2747;">Internal Audit</b><br>Best Roadways Limited<br><span style="color:#5b6675;font-size:12px;">System mail from the Ankleshwar Fleet Desk · help: FMS Helpdesk 9594963357</span></p></div>`;
}
function report(force, msgs) {
  const S = mail.S; if (!dailyReport()) return "Market-while-idle report: off";
  if (!force && db.meta.lastIdleReport === today()) return "Market-while-idle report: already sent today";
  const Rh = health(addDays(today(), -1), msgs); // tell the helpdesk the same morning, not after a week of zeros
  if (!Rh.ok) try { mail.send(mail.S("Job failure mail to", "sangwari@bestroadways.com"), "Fleet Desk · market-while-idle check incomplete", `<p style="font-family:Arial">${Rh.problems.map(esc).join("<br>")}</p>`); } catch (e) { /* the report itself still goes */ }
  const R = reportData(msgs), nil = !R.open.length && !R.done.length && !R.yday.length; // only mail when there is something to act on
  if (nil) { db.meta.lastIdleReport = today(); save(); return "Market-while-idle report: nothing to report, not sent"; }
  const from = S("Market-while-idle report: from", "internalaudit@bestroadways.com");
  const to = mail.list(S("Market-while-idle report: to", "ankleshwar@bestroadways.com, virendra.singh@bestroadways.com"));
  const cc = mail.list(S("Market-while-idle report: cc", "ashish.gupta@bestroadways.com, jaikumar.gupta@bestroadways.com, sangwari@bestroadways.com, rakeshkumar.sangwari@bestroadways.com, mumbai@bestroadways.com")).filter(x => !to.includes(x));
  const subject = `Daily report · Market vehicle placed while our own truck was idle · ${dmy(R.y)} · ` + (R.open.length ? `${R.open.length} reason${R.open.length === 1 ? "" : "s"} needed` + (R.overdue.length ? ` · ${R.overdue.length} OVERDUE` : "") : R.health.ok ? `nothing pending · ${R.week.length} local market CN${R.week.length === 1 ? "" : "s"} in 7 days` : "CHECK INCOMPLETE") + (R.open.length && !R.health.ok ? " · check incomplete" : "");
  mail.send(to.join(","), subject, reportHtml(R), cc.join(","), { from, name: "Internal Audit · Best Roadways" });
  R.open.forEach(r => { r.mails = (+r.mails || 0) + 1; r.lastMailed = new Date().toISOString(); });
  db.meta.lastIdleReport = today(); save(); log("system", "Market-while-idle report", R.y, `${R.mkt.length} local market CNs · ${R.yday.length} while our truck free · ${R.open.length} open · ${R.done.length} explained` + (R.health.ok ? "" : " · INCOMPLETE: " + R.health.problems.join("; ")));
  return `Market-while-idle report: mailed (${R.open.length} open, ${R.done.length} explained)`;
}
module.exports = { run, report, reportData, reportHtml, health };
