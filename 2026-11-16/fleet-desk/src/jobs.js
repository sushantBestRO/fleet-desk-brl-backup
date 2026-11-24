const { db, save, log, isDirty } = require("./store");
const { addDays, today } = require("./util");
const gt = require("./gtropy"), erp = require("./erp"), idlew = require("./idlewatch"), sheet = require("./sheetio"), mail = require("./mail");
const { recheckAll, emailsWith } = require("./api");
const { inr, dmy } = require("./util");

async function morning() {
  const y = addDays(today(), -1), msgs = [];
  try { msgs.push(...(await gt.fetchRange(y, y, true))); } catch (e) { msgs.push("GTropy: FAILED " + e.message); }
  try { msgs.push(process.env.API_HEADERS ? await erp.catchUp() : "ERP: API_HEADERS not set, skipped"); } catch (e) { msgs.push("ERP: FAILED " + e.message); }
  recheckAll(); try { const n = require("./api").API.relinkDocs(); if (n) msgs.push(`LR docs linked to CNs: ${n}`); } catch (e) { msgs.push("Doc relink: FAILED " + e.message); }
  try { msgs.push(idlew.run()); } catch (e) { msgs.push("Idle watch: FAILED " + e.message); }
  Object.keys(db.sessions).forEach(k => { if (db.sessions[k].exp < Date.now()) delete db.sessions[k]; }); save();
  try { await sheet.mirror(); } catch (e) { msgs.push("Sheet backup: FAILED " + e.message); }
  log("system", "Morning job", y, msgs.join(" | "));
  if (msgs.some(m => /FAILED/.test(m))) mail.send(mail.S("Job failure mail to", "sangwari@bestroadways.com"), "Fleet Desk morning job — failed", `<pre style="font-family:Arial">${msgs.join("\n")}</pre><p style="font-size:13px">Regards,<br><b>Ankit - Shishir - Sushant</b><br>For FMS Helpdesk<br>Contact us on 9594963357</p>`);
  return msgs;
}
// Nobody should have to chase an approval on the phone. Twice a day, ONE mail lists what is waiting and with whom.
// Settings (Desk): "Waiting reminder: after hours" (default 4, 0 = off) · "Waiting reminder: times (IST)" (default 11:00, 16:00)
const stampMs = s => { const m = String(s || "").match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) - 19800e3 : 0; };
function waiting(hours) {
  const old = (a, k) => { const t = stampMs(a[k]); return t && Date.now() - t >= hours * 36e5; }, real = a => !/TEST|legacy|whatsapp/i.test(a.source || "");
  return { approve: db.adv.filter(a => real(a) && a.status === "Raised" && old(a, "raisedAt")), audit: db.adv.filter(a => real(a) && a.status === "Awaiting audit" && old(a, "approvedAt")),
    pay: db.adv.filter(a => real(a) && a.status === "Approved" && old(a, a.auditAt ? "auditAt" : "approvedAt")) };
}
function waitingMail() {
  const hours = +mail.S("Waiting reminder: after hours", "4"); if (!(hours > 0)) return "Waiting reminder: off";
  const w = waiting(hours), n = w.approve.length + w.audit.length + w.pay.length; if (!n) return "Waiting reminder: nothing waiting";
  const line = a => `${a.id} · ${a.veh} · ${a.type} · ${inr(a.amount)} · raised ${dmy(a.date)}` + (a.level && a.level !== "OK" ? ` · ${a.level} flag` : "");
  const rows = [[`To approve — Sitaram ji (${w.approve.length})`, w.approve.map(line).join("<br>")], [`To clear — Internal Audit (${w.audit.length})`, w.audit.map(line).join("<br>")], [`To pay — Sangwari cash desk (${w.pay.length})`, w.pay.map(line).join("<br>")]];
  const to = [].concat(w.approve.length ? emailsWith(["Sangwari approver"]) : [], w.audit.length ? emailsWith(["Internal Audit"]) : [], w.pay.length ? emailsWith(["Sangwari ops", "Sangwari approver"]) : []);
  mail.compose(to, `Fleet Desk · ${n} request${n === 1 ? "" : "s"} waiting more than ${hours} h`, rows, `These requests have been waiting more than ${hours} hours. Please clear your part in the app. Requests that pass every check can be approved together in one tap.`, "", false);
  log("system", "Waiting reminder", "", `approve ${w.approve.length} · audit ${w.audit.length} · pay ${w.pay.length}`); return `Waiting reminder: ${n} mailed`;
}
let mirroring = false;
function start() {
  setInterval(async () => { // back up to the Google Sheet within 2 minutes of any change
    if (mirroring || !isDirty() || !process.env.BACKUP_SHEET_ID) return; mirroring = true;
    try { await sheet.mirror(); } catch (e) { console.error("mirror:", e.message); } finally { mirroring = false; }
  }, 120e3);
  setInterval(() => { // 08:50 IST once a day · waiting reminder at its set times
    const ist = new Date(Date.now() + 19800e3), hm = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    const slot = mail.S("Waiting reminder: times (IST)", "11:00, 16:00").split(",").map(x => x.trim()).filter(x => /^\d{1,2}:\d{2}$/.test(x)).map(x => +x.split(":")[0] * 60 + +x.split(":")[1]).filter(m => hm >= m && hm < m + 30).pop();
    if (slot != null && db.meta.lastWaiting !== today() + "_" + slot) { db.meta.lastWaiting = today() + "_" + slot; save(); try { waitingMail(); } catch (e) { console.error("waiting:", e.message); } }
    if (hm >= 530 && db.meta.lastMorning !== today()) { db.meta.lastMorning = today(); save(); morning().catch(e => console.error("morning:", e.message)); }
  }, 30e3);
}
module.exports = { morning, start, waiting, waitingMail };
