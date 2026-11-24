// One-time: load what went through the "Ankleshwar local vehicle All report" WhatsApp group (30 Oct – 7 Nov 2026) into the app,
// so the desk starts with the real records instead of chat photos.   node src/cli.js backfill-wa /path/to/unzipped/export
// Idempotent: running it twice adds nothing. Without the export folder it still creates the records, just without the photos.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { db, save, log, DATA } = require("./store");
const { nowStr } = require("./util");
const VEH = "RJ14GI1677", ALIAS = "RJ14GL1677", DRV = "Surendra (driver, 1677) · WhatsApp", CASH = "Sanwari Cash · WhatsApp 'Done'";

module.exports = function backfill(dir) {
  const { sign, recheckAll } = require("./api"), erp = require("./erp"), out = [];
  const month = "2026-11"; fs.mkdirSync(path.join(DATA, "files", month), { recursive: true });
  const file = (id, slot, name) => { // copy a chat attachment into data/files, return its signed link ("" if the export folder was not given)
    if (!dir) return ""; const src = fs.readdirSync(dir).find(f => f.startsWith(name)); if (!src) { out.push(`missing in export: ${name}`); return ""; }
    const ext = src.toLowerCase().endsWith(".pdf") ? "pdf" : "jpg", n = `${month}/${id}_${slot}_${crypto.createHash("md5").update(src).digest("hex").slice(0, 8)}.${ext}`;
    if (!fs.existsSync(path.join(DATA, "files", n))) fs.copyFileSync(path.join(dir, src), path.join(DATA, "files", n));
    return `${process.env.APP_URL}/f/${n}?s=${sign(n)}`;
  };
  const urls = (id, slot, names) => names.map(n => file(id, slot, n)).filter(Boolean).join("\n");

  // 1. the truck is printed RJ14GL1677 on the LR and in the ERP, RJ14GI1677 on Fleet: make them one vehicle, and re-file its CNs as own
  const f = db.fleet.find(x => x.veh === VEH);
  if (f && f.start && !/^\d{4}-/.test(f.start)) { f.start = require("./util").iso(f.start); out.push(`Fleet: "On desk from" normalised to ${f.start} (was dd-mm-yyyy, which made GTropy skip the truck and the ledger show no days)`); }
  if (f && !String(f.alias || "").includes(ALIAS)) { f.alias = [f.alias, ALIAS].filter(Boolean).join(", "); out.push(`Fleet: ${VEH} also written as ${ALIAS}`); }
  let re = 0; db.erp.forEach(e => { const c = erp.canon(e.veh); if (c !== e.veh) { e.veh = c; e.kind = "Own"; re++; } }); db.local.forEach(l => { const c = erp.canon(l.veh); if (c !== l.veh) { l.veh = c; l.kind = "Own"; re++; } });
  if (re) out.push(`ERP / Local CNs re-filed as own ${VEH}: ${re}`);

  // 2. people who were only on WhatsApp: the driver and the cash desk (set mobile + PIN on Desk → People, they can't log in until then)
  const addP = (email, name, role, veh) => { if (db.people.some(p => p.email === email)) return; db.people.push({ email, name, role, mobile: "", pin: String(1000 + Math.floor(Math.random() * 9000)), device: "", veh: veh || "" }); out.push(`People: added ${name} (${role}) — set the mobile on Desk → People`); };
  addP("driver.1677@bestroadways.com", "Surendra (driver 1677)", "Driver", VEH);
  addP("sangwaricash@bestroadways.com", "Sanwari Cash", "Sangwari ops", "");

  // 3. the CNG fills paid on the group (amount = what the cash desk paid; slip kg / amount in the note)
  const fills = [
    { d: "2026-10-28", amt: 5848, kg: 65.89, odo: 342893, slip: ["00003017"], odoP: ["00003016"], drv: [], pay: "Paytm ₹5,848 to M Patel & Co, Naugama (28-10)", note: "Slip 6066: 65.89 kg @ 88.76 = ₹5,848.40" },
    { d: "2026-10-30", amt: 6400, kg: 71.51, odo: 343217, slip: ["00003009"], odoP: ["00003010"], drv: ["00003015"], pay: "Sanwari Cash 'Done' 30-10 11:39", note: "Sitaram: Gl1677 for cng 6400/- · 71.51 kg rs 88.76 · 343217 km. Slip 6106 total ₹6,348.40 (₹51.60 over slip)" },
    { d: "2026-11-02", amt: 5961, kg: 67.15, odo: 343466, slip: ["00003034", "00003064"], odoP: ["00003029"], drv: [], screen: ["00003024", "00003026"], pay: "Sanwari Cash 'Already done' 03-11 07:20", note: "Pump 1A ₹5,960.23 / 67.15 kg @ 88.76; Gujarat Energy bill 2377 ₹5,960" },
    { d: "2026-11-06", amt: 6933, kg: 76.81, odo: 343872, slip: ["00003073"], odoP: ["00003071", "00003072"], drv: [], screen: ["00003068", "00003069"], pay: "Sanwari Cash 'Done · 6933 kat jayega' 06-11 21:04", note: "Sitaram: 6850/- cng 76.81 kg 88.76 343872 km; driver: total CNG 6933; pump screen ₹6,817.65 / 76.81 kg (two small top-ups ₹115.38 + ₹8.87 before). ₹6,933 deducted — ₹83 above Sitaram's figure, ₹115 above the pump screen: check." },
  ];
  fills.forEach(x => {
    if (db.adv.some(a => a.veh === VEH && a.date === x.d && a.type === "CNG" && /WhatsApp group/.test(a.source || ""))) return;
    const id = "W" + x.d.replace(/-/g, "") + "-CNG";
    const a = { id, veh: VEH, date: x.d, type: "CNG", amount: x.amt, litres: x.kg, odo: x.odo, mode: "Bank transfer to CNG pump account", from: "", to: "", cn: "", purpose: `CNG at pump · ${VEH}\n${x.note}\nPaid: ${x.pay}`,
      photo: urls(id, "odometer", x.odoP) + (x.screen ? "\n" + urls(id, "pumpscreen", x.screen) : ""), bill: urls(id, "pumpslip", x.slip), driverPhoto: urls(id, "driver", x.drv), status: "Paid", level: "", flags: "", note: "", payref: x.pay, reviewed: false,
      raisedBy: DRV, raisedAt: x.d, approvedBy: "Sitaram Goyal (WhatsApp)", approvedAt: x.d, auditBy: "", auditAt: "", paidBy: CASH, paidAt: x.d, closedBy: "", closedAt: "", source: "WhatsApp group (backfill) · app", trail: `${nowStr()} · backfilled from the WhatsApp group export · system`, stmt: "" };
    db.adv.push(a); out.push(`Advance ${id}: CNG ₹${x.amt} ${x.kg} kg odo ${x.odo} (Paid)`);
  });

  // 4. the LR / CN consignor copies sent as PDFs
  [["E36600", "2026-10-29", "00003013"], ["E40024", "2026-11-06", "00003083"], ["E36784", "2026-11-05", "00003084"]].forEach(([cn, d, nm]) => {
    if (db.docs.some(x => x.cn === cn && x.kind === "LR")) return; const e = db.erp.find(x => String(x.cn).toUpperCase() === cn);
    db.docs.push({ id: "D" + cn, cn, veh: e ? e.veh : VEH, date: e ? e.date : d, kind: "LR", route: e ? e.route : "", note: "sent on the WhatsApp group by the driver", urls: file("CN-" + cn, "LR", nm), by: DRV, at: nowStr(), inErp: !!e });
    out.push(`LR ${cn} filed${e ? ` (${e.route})` : " (not in ERP yet)"}`);
  });

  // 5. Virender's October statement (3 Nov): the five typed sheets, ₹9,280, "deduct what you already gave"
  const SID = "S20261103-WA";
  if (!db.statements.some(s => s.id === SID)) {
    const sheet = urls(SID, "sheet", ["00003039", "00003040", "00003041", "00003043", "00003045", "00003048"]), bills = urls(SID, "bills", ["00003049", "00003050", "00003051", "00003052", "00003053", "00003054", "00003055", "00003056", "00003057", "00003058", "00003059", "00003060", "00003061", "00003062", "00003063", "00003065"]);
    const L = [ // [veh, from, to, cn, head, type, amount, note]
      ["RJ14GH1277", "2026-10-09", "2026-10-13", "E34272", "Dala / loading-unloading · दाला", "Dala / loading", 500, "Jhagadia → Jaipur"],
      ["RJ14GH1277", "2026-10-09", "2026-10-13", "E34272", "Toll / green tax / RTO · टोल", "Toll / green tax", 500, "Rajasthan RTC"],
      ["RJ14GH1277", "2026-10-09", "2026-10-13", "E34272", "Fooding · खाना", "Meal / driver exp", 750, "3 days in transit"],
      ["RJ14GH1277", "2026-10-09", "2026-10-13", "E34272", "Grease / oil / small repair · ग्रीस", "Other", 250, "Grees"],
      [VEH, "2026-10-14", "2026-10-22", "", "Fooding · खाना", "Meal / driver exp", 2250, "Standing at Sangwari, waiting for the new vehicle — 9 days"],
      [VEH, "2026-10-23", "2026-10-26", "E35623", "Dala / loading-unloading · दाला", "Dala / loading", 700, "Sangwari → Vapi"],
      [VEH, "2026-10-23", "2026-10-26", "E35623", "Police / entry · पुलिस", "Other", 500, "Vapi local police"],
      [VEH, "2026-10-23", "2026-10-26", "E35623", "Fooding · खाना", "Meal / driver exp", 1000, "4 days in transit & Vapi"],
      [VEH, "2026-10-23", "2026-10-26", "E35623", "Parking · पार्किंग", "Parking", 80, "Parking Delhi (slip 23-10 02:29, ₹80)"],
      [VEH, "2026-10-27", "2026-10-31", "E36593", "Dala / loading-unloading · दाला", "Dala / loading", 800, "Panoli → Halol (E36593 / E36600)"],
      [VEH, "2026-10-27", "2026-10-31", "E36593", "Grease / oil / small repair · ग्रीस", "Other", 250, "Grees"],
      [VEH, "2026-10-27", "2026-10-31", "E36593", "Fooding · खाना", "Meal / driver exp", 750, "3 days Halol"],
      [VEH, "2026-10-27", "2026-10-31", "E36593", "Parking · पार्किंग", "Parking", 100, "Parking Ankleshwar"],
      [VEH, "2026-11-01", "2026-11-03", "E34667", "Dala / loading-unloading · दाला", "Dala / loading", 600, "Panoli local & Ankleshwar → Surat (E34667 / E36760)"],
      [VEH, "2026-11-01", "2026-11-03", "E34667", "Fooding · खाना", "Meal / driver exp", 250, "1 day Surat"],
    ];
    const made = L.map((l, i) => {
      const id = `${SID}-${String(i + 1).padStart(2, "0")}`, [veh, from, to, cn, head, type, amount, note] = l;
      db.adv.push({ id, veh, date: "2026-11-03", type, amount, litres: 0, odo: 0, mode: "Cash", from, to, cn, purpose: `${head.split(" · ")[0]} — ${cn ? "LR " + cn + " · " : ""}${note} (statement ${SID}, line ${i + 1} of ${L.length})\nLines: ${head.split(" · ")[0]} ${amount}`,
        photo: "", bill: bills, driverPhoto: "", status: "Raised", level: "", flags: "", note: "", payref: "", reviewed: false, raisedBy: "ankleshwar@bestroadways.com", raisedAt: "03-11-2026 12:42", approvedBy: "", approvedAt: "", auditBy: "", auditAt: "", paidBy: "", paidAt: "", closedBy: "", closedAt: "",
        source: "WhatsApp group (backfill) · app · statement " + SID, trail: `${nowStr()} · backfilled from Virender's typed October sheets on the WhatsApp group · system`, stmt: SID });
      return { line: i + 1, veh, from, to, cn, head, type, amount, note, id, level: "" };
    });
    const total = made.reduce((s, m) => s + m.amount, 0);
    db.statements.push({ id: SID, veh: VEH, from: "2026-10-09", to: "2026-11-03", lines: made, total, paidBefore: [], paidBeforeTotal: 0, net: total, files: [sheet, bills].filter(Boolean).join("\n"), raisedBy: "ankleshwar@bestroadways.com", raisedAt: "03-11-2026 12:42", note: "Virender: 'Total Amount 9280/-. Aapne jo paisa diya hai vo jama le lena.' Fuel receipts in the same bundle belong to the CNG / diesel advances, not to these lines.", ids: made.map(m => m.id) });
    out.push(`Statement ${SID}: ${made.length} lines, ₹${total} (Raised — Sitaram approves line by line)`);
  }
  save(); recheckAll(); log("system", "WhatsApp backfill", "Oct–Nov 2026", out.join(" | "));
  return out.join("\n");
};
