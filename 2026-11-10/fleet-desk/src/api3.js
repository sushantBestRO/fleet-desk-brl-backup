// What used to travel on the "Ankleshwar local vehicle All report" WhatsApp group and now goes through the app:
//   docs       — the LR / CN consignor copy (and POD, challan) for every trip, filed against the CN in the ERP register
//   statements — the branch's typed monthly expense sheet ("DALA / FOODING / PARKING / GREES per trip, total ₹9,280,
//                less what you already gave"): each line becomes a normal request of its head's type, through the same
//                approve → audit → pay → close flow, and the statement shows the net after advances already paid.
const crypto = require("crypto");
const { db, save, log } = require("./store");
const K = require("./constants");
const { today, nowStr, dmy, inr, addDays } = require("./util");
const mail = require("./mail");

const normCn = c => String(c || "").toUpperCase().replace(/^ANKLESHWAR-?/, "").replace(/[^A-Z0-9]/g, "");
const isOwn = e => !e.kind || e.kind === "Own";

module.exports = c => {
  const { auth, roleOf, can, RELOGIN, trail, recheck, saveFiles, emailsWith, fleetFor, newRequest, filesHtml } = c;
  const need = (ok, msg) => { if (!ok) throw new Error(msg); };
  const guard = fn => (tok, ...a) => { const who = auth(tok); if (!who) return RELOGIN; return fn(who, roleOf(who), ...a); };
  const docView = d => ({ id: d.id, veh: d.veh, cn: d.cn, date: d.date, kind: d.kind, kindLabel: K.DOC_KINDS[d.kind] || d.kind, route: d.route, note: d.note, urls: String(d.urls || "").split("\n").filter(Boolean), by: d.by, at: d.at, inErp: !!d.inErp });
  // own CNs of the last N days with no LR filed yet — what the desk chases
  const missingLr = (vehs, days) => {
    const from = addDays(today(), -days);
    return db.erp.filter(e => isOwn(e) && vehs.includes(e.veh) && e.date >= from && !db.docs.some(d => d.kind === "LR" && normCn(d.cn) === normCn(e.cn))).map(e => ({ cn: e.cn, veh: e.veh, date: e.date, route: e.route })).sort((a, b) => (a.date < b.date ? 1 : -1));
  };

  return {
    // ---- LR / CN documents
    docs: guard((who, role, veh) => {
      need(can(role, "docs"), "Your role can't see documents.");
      const vehs = veh ? [veh] : (role === "Driver" ? fleetFor(who) : require("./settle").allVeh());
      const rows = db.docs.filter(d => vehs.includes(d.veh) || (!d.veh && !veh)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 60).map(docView);
      return { ok: true, rows, missing: missingLr(vehs, 45).slice(0, 30), kinds: K.DOC_KINDS };
    }),
    docAdd: guard((who, role, p) => {
      need(can(role, "docs"), "Your role can't file documents.");
      const cn = normCn(p.cn); need(/^[A-Z]\d{4,6}$/.test(cn), "Type the CN / LR number as printed, e.g. E36600.");
      const kind = K.DOC_KINDS[p.kind] ? p.kind : "LR"; const files = p.files || [], pre = p.presaved || []; need(files.length || pre.length, "Attach the LR photo or PDF.");
      const e = db.erp.find(x => normCn(x.cn) === cn); let veh = String(p.veh || "").toUpperCase().trim();
      if (e) { if (veh && veh !== e.veh) throw new Error(`CN ${cn} is booked on ${e.veh} in the ERP, not ${veh}.`); veh = e.veh; }
      need(veh, `CN ${cn} is not in the ERP register yet — pick the vehicle so it can be matched later.`);
      if (role === "Driver") need(fleetFor(who).includes(veh), `${veh} is not your truck.`);
      const saved = saveFiles("CN-" + cn, files).concat(pre), date = e ? e.date : (p.date || today());
      let d = db.docs.find(x => normCn(x.cn) === cn && x.kind === kind);
      if (d) { d.urls = (d.urls ? d.urls + "\n" : "") + saved.map(f => f.url).join("\n"); d.at = nowStr(); d.by = who; if (p.note) d.note = String(p.note).trim(); }
      else { d = { id: "D" + crypto.randomBytes(3).toString("hex").toUpperCase(), cn, veh, date, kind, route: e ? e.route : "", note: String(p.note || "").trim(), urls: saved.map(f => f.url).join("\n"), by: who, at: nowStr(), inErp: !!e }; db.docs.push(d); }
      // a trip advance quoting this CN now has its LR: re-run its checks
      db.adv.filter(a => normCn(a.cn) === cn).forEach(a => { if (!a.lrDoc) { a.lrDoc = d.id; trail(a, `LR ${cn} filed (${kind})`, who); recheck(a); } });
      save(); log(who, "Document filed", cn, `${kind} · ${veh} · ${saved.length} file(s)` + (e ? "" : " · CN not in ERP yet"));
      return { ok: true, doc: docView(d), matched: !!e };
    }),
    // morning job / ERP load calls this: link docs filed before the CN reached the register
    relinkDocs() { let n = 0; db.docs.forEach(d => { if (d.inErp) return; const e = db.erp.find(x => normCn(x.cn) === normCn(d.cn)); if (e) { Object.assign(d, { inErp: true, veh: e.veh, date: e.date, route: e.route }); n++; } }); if (n) save(); return n; },

    // ---- monthly expense statement
    stmtPreview: guard((who, role, veh, from, to) => {
      need(can(role, "statement"), "Your role can't raise a statement."); need(from && to && from <= to, "Pick the period.");
      const inPeriod = a => a.veh === veh && a.status !== "Rejected" && !["Diesel", "CNG"].includes(a.type) && !a.stmt && (a.from ? a.from <= to && (a.to || a.from) >= from : a.date >= from && a.date <= to);
      const paid = db.adv.filter(a => inPeriod(a) && ["Approved", "Paid", "Closed"].includes(a.status)).map(a => ({ id: a.id, date: a.date, type: a.type, amount: a.amount, status: a.status, purpose: String(a.purpose).split("\n")[0].slice(0, 60) }));
      const open = db.adv.filter(a => inPeriod(a) && ["Raised", "Awaiting audit"].includes(a.status)).map(a => ({ id: a.id, date: a.date, type: a.type, amount: a.amount, status: a.status }));
      return { ok: true, paid, paidTotal: paid.reduce((s, a) => s + (+a.amount || 0), 0), open, heads: K.STMT_HEADS, allVeh: require("./settle").allVeh() };
    }),
    statement: guard((who, role, p) => {
      need(can(role, "statement"), "Your role can't raise a statement.");
      const veh = String(p.veh || "").toUpperCase().trim(); need(db.fleet.some(f => f.veh === veh), "Pick the vehicle."); if (role === "Driver") need(fleetFor(who).includes(veh), `${veh} is not your truck.`);
      const from = p.from, to = p.to || p.from; need(/^\d{4}-\d{2}-\d{2}$/.test(from || "") && from <= to, "Pick the period (from – to).");
      const lines = (p.lines || []).map(l => ({ from: l.from || from, to: l.to || l.from || from, cn: normCn(l.cn), head: l.head, type: K.STMT_HEADS[l.head], amount: Math.round(+l.amount || 0), note: String(l.note || "").trim(), veh: String(l.veh || veh).toUpperCase().trim() }))
        .filter(l => l.amount > 0 || l.note || l.cn);
      need(lines.length, "Add at least one line."); lines.forEach((l, i) => { need(l.type, `Line ${i + 1}: pick the head.`); need(l.amount > 0, `Line ${i + 1}: enter the amount.`); need(l.from >= from && l.to <= to, `Line ${i + 1}: dates are outside the period.`); need(l.note || l.cn, `Line ${i + 1}: write the trip / LR or a note.`); });
      const files = p.files || [], has = s => files.some(f => f.slot === s); need(has("sheet") || has("bills") || (p.noReceipt && String(p.noReceiptWhy || "").trim().length >= 5), "Attach the typed sheet or the receipts (or tick 'no receipt' and say why).");
      const total = lines.reduce((s, l) => s + l.amount, 0), id = "S" + today().replace(/-/g, "") + "-" + crypto.randomBytes(2).toString("hex").toUpperCase();
      const saved = saveFiles(id, files), pre = saved.filter(f => K.RF_BILL_SLOTS.includes(f.slot)).map(f => ({ slot: "bills", url: f.url }));
      const paidBefore = db.adv.filter(a => a.veh === veh && a.status !== "Rejected" && !["Diesel", "CNG"].includes(a.type) && !a.stmt && ["Approved", "Paid", "Closed"].includes(a.status) && (a.from ? a.from <= to && (a.to || a.from) >= from : a.date >= from && a.date <= to));
      const ids = [], made = [];
      lines.forEach((l, i) => {
        const tripTxt = [l.cn ? "LR " + l.cn : "", l.note].filter(Boolean).join(" · ");
        const r = newRequest({ type: l.type, vehicle: l.veh, amount: l.amount, from: l.from, to: l.to, cn: l.cn, purpose: `${l.head.split(" · ")[0]} — ${tripTxt} (statement ${id}, line ${i + 1} of ${lines.length})`, pay: K.RF_PAY.other[0], items: `${l.head.split(" · ")[0]} ${l.amount}`,
          presaved: pre, quiet: true, stmt: id, noReceipt: !pre.length, noReceiptWhy: !pre.length ? String(p.noReceiptWhy || "see statement") : "" }, who, role);
        ids.push(r.id); made.push(Object.assign({ line: i + 1 }, l, { id: r.id, level: r.level }));
      });
      const st = { id, veh, from, to, lines: made, total, paidBefore: paidBefore.map(a => a.id), paidBeforeTotal: paidBefore.reduce((s, a) => s + (+a.amount || 0), 0), files: saved.map(f => f.url).join("\n"), raisedBy: who, raisedAt: nowStr(), note: String(p.note || "").trim(), ids };
      st.net = total - st.paidBeforeTotal; db.statements.push(st); save(); log(who, "Statement raised", id, `${veh} · ${dmy(from)}–${dmy(to)} · ${lines.length} lines · ${inr(total)} · net ${inr(st.net)}`);
      const flagged = made.filter(m => m.level && m.level !== "OK");
      mail.compose(emailsWith(["Sangwari approver"]), `Expense statement ${id} · ${veh} · ${dmy(from)}–${dmy(to)} · ${inr(total)}` + (flagged.length ? ` · ${flagged.length} flagged` : ""),
        [["Statement", id], ["Vehicle", veh], ["Period", `${dmy(from)} → ${dmy(to)}`], ["Lines", made.map(m => `${dmy(m.from)}${m.to !== m.from ? "–" + dmy(m.to) : ""} · ${m.head.split(" · ")[0]} · ${m.cn ? "LR " + m.cn + " · " : ""}${m.note} · ${inr(m.amount)} (${m.id}${m.level !== "OK" ? " · " + m.level : ""})`).join("<br>")],
          ["Total claimed", inr(total)], ["Advances already paid in this period", paidBefore.length ? paidBefore.map(a => `${a.id} ${a.type} ${inr(a.amount)}`).join("<br>") + `<br><b>${inr(st.paidBeforeTotal)}</b>` : "none"], ["Net payable", inr(st.net)], ["Raised by", who]],
        "The branch has filed its expense statement on the Fleet Desk. Each line is a request under Approvals; approve or reject them one by one. The net is what remains after the advances already paid in the period.", filesHtml(saved), flagged.length > 0);
      return { ok: true, id, total, paidBeforeTotal: st.paidBeforeTotal, net: st.net, lines: made };
    }),
    statements: guard((who, role, veh) => {
      const mine = ["Ankleshwar branch", "Driver"].includes(role);
      const rows = db.statements.filter(s => (!veh || s.veh === veh) && (!mine || s.raisedBy === who)).sort((a, b) => (a.raisedAt < b.raisedAt ? 1 : -1)).slice(0, 30).map(s => {
        const L = s.lines.map(l => { const a = db.adv.find(x => x.id === l.id) || {}; return Object.assign({}, l, { status: a.status || "?", level: a.level || "", note2: a.note || "" }); });
        const sum = st => L.filter(l => st.includes(l.status)).reduce((t, l) => t + l.amount, 0);
        return { id: s.id, veh: s.veh, from: s.from, to: s.to, total: s.total, paidBeforeTotal: s.paidBeforeTotal, net: s.net, raisedBy: s.raisedBy, raisedAt: s.raisedAt, note: s.note, files: String(s.files || "").split("\n").filter(Boolean), lines: L,
          approved: sum(["Approved", "Paid", "Closed"]), rejected: sum(["Rejected"]), paid: sum(["Paid", "Closed"]), open: sum(["Raised", "Awaiting audit"]) };
      });
      return { ok: true, rows };
    }),
  };
};
