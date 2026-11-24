// Rename a vehicle everywhere in the Fleet Desk data.   STOP THE APP FIRST (pm2 stop fleet-desk).
//   node rename-vehicle.js RJ14GI1677 RJ14GL1677            → dry run: only shows what would change
//   node rename-vehicle.js RJ14GI1677 RJ14GL1677 --apply    → makes a backup, then changes data/db.json
// Run it from the fleet-desk folder. Changes: Fleet, requests, settlements, ERP / Local CNs, GPS days, idle records, people, docs …
// (any field that holds exactly the old number, and keys that start with "OLD_"). Not changed: the activity log and free-text notes (history stays as written).
const fs = require("fs"), path = require("path");
const [OLD, NEW] = process.argv.slice(2).filter(a => !a.startsWith("--")), APPLY = process.argv.includes("--apply"), FORCE = process.argv.includes("--force");
if (!OLD || !NEW) { console.log("usage: node rename-vehicle.js OLD NEW [--apply]"); process.exit(1); }
const norm = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), O = norm(OLD), N = NEW.trim().toUpperCase();
const FILE = path.join(process.env.DATA_DIR || "./data", "db.json"); if (!fs.existsSync(FILE)) { console.log("Cannot find " + FILE + " — run this from the fleet-desk folder."); process.exit(1); }
const age = Date.now() - fs.statSync(FILE).mtimeMs; if (age < 30e3 && !FORCE) { console.log(`db.json was changed ${Math.round(age / 1000)} s ago — the app is probably still running. Stop it first: pm2 stop fleet-desk`); process.exit(1); }
const d = JSON.parse(fs.readFileSync(FILE, "utf8")), hits = {}, hit = (c, f) => { const k = c + "." + f; hits[k] = (hits[k] || 0) + 1; }, conflicts = [];
const SKIP = new Set(["log", "sessions"]), keyRe = new RegExp("^" + O + "_", "i"), swapKey = k => N + "_" + String(k).slice(O.length + 1);
function walk(o, coll, field) {
  if (Array.isArray(o)) return o.forEach(x => walk(x, coll, field));
  if (!o || typeof o !== "object") return;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === "string") { if (norm(v) === O) { o[k] = N; hit(coll, k); } else if (k === "key" && keyRe.test(v)) { o[k] = swapKey(v); hit(coll, "key"); } }
    else if (v && typeof v === "object") walk(v, coll, k);
  }
  for (const k of Object.keys(o)) if (keyRe.test(k) && !Array.isArray(o)) { const nk = swapKey(k); if (o[nk] !== undefined) conflicts.push(`${coll}: "${nk}" already exists`); else { o[nk] = o[k]; delete o[k]; hit(coll, "(record key)"); } }
}
const changedAdv = new Set(), before = JSON.stringify(d.adv.map(a => a.veh));
Object.keys(d).forEach(c => { if (!SKIP.has(c)) walk(d[c], c, ""); });
const after = d.adv.map(a => a.veh), old = JSON.parse(before); d.adv.forEach((a, i) => { if (old[i] !== after[i]) changedAdv.add(a.id); });
const rows = Object.keys(hits).sort(); console.log(`Rename ${O} → ${N}\n`); rows.forEach(k => console.log("  " + k.padEnd(34) + hits[k])); if (!rows.length) console.log("  nothing found for " + O);
console.log("  requests (adv) affected".padEnd(36) + changedAdv.size);
const left = JSON.stringify(Object.fromEntries(Object.entries(d).filter(([c]) => !SKIP.has(c)))).toUpperCase().split(O).length - 1; console.log(`\nStill written as ${O} (free text: notes, legacy notes) — left as it is: ${left}`);
if (conflicts.length) { console.log("\nSTOPPED — would overwrite existing data:\n  " + conflicts.join("\n  ")); process.exit(1); }
if (!APPLY) return console.log("\nDry run only — nothing written. Add --apply to do it."), process.exit(0);
const stamp = new Date(Date.now() + 19800e3), z = n => String(n).padStart(2, "0"), nowStr = `${z(stamp.getUTCDate())}-${z(stamp.getUTCMonth() + 1)}-${stamp.getUTCFullYear()} ${z(stamp.getUTCHours())}:${z(stamp.getUTCMinutes())}`;
d.adv.forEach(a => { if (changedAdv.has(a.id)) a.trail = (a.trail ? a.trail + "\n" : "") + `${nowStr} · vehicle number corrected ${O} → ${N} (typing mistake) · system`; });
d.log.unshift({ t: new Date().toISOString(), who: "system", what: "Vehicle renamed", ref: `${O} → ${N}`, detail: rows.map(k => k + " " + hits[k]).join(" | ") });
const bak = FILE + ".before-rename-" + O + "-" + Date.now(); fs.copyFileSync(FILE, bak); console.log("\nBackup: " + bak);
fs.writeFileSync(FILE + ".tmp", JSON.stringify(d)); JSON.parse(fs.readFileSync(FILE + ".tmp", "utf8")); fs.renameSync(FILE + ".tmp", FILE);
console.log("Done. Start the app:  pm2 start fleet-desk   then  Desk → Fetch and checks → \"Re-run all checks\".");
