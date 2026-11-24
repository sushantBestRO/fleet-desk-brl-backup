// GTropy check — read-only. Run from the Fleet Desk folder:   node /path/to/gt-check.js RJ14GI1677 RJ14GH1277
// It never prints the client id, secret or token. It does not change any Fleet Desk data.
const path = require("path");
try { require(path.join(process.cwd(), "src", "env.js")); } catch (e) { console.log("(could not load src/env.js — run this from the fleet-desk folder)"); }
const TOK = ["http://api-locate.com/api/v1.0/api/generate/token", "https://api-locate.com/api/v1.0/api/generate/token"], DATA = "https://api-locate.com/api/v1.0/trip/summary/location";
const iso = d => d.toISOString().slice(0, 10), day = n => iso(new Date(Date.now() + 19800e3 - n * 864e5));
const variants = v => { const c = String(v).toUpperCase().replace(/[^A-Z0-9]/g, ""), m = c.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{3,4})$/); return [...new Set([c, m && `${m[1]} ${m[2]} ${m[3]} ${m[4]}`.replace(/  +/g, " "), m && `${m[1]}-${m[2]}-${m[3]}-${m[4]}`.replace(/--/g, "-"), m && `${m[1]}${m[2]}${m[3]} ${m[4]}`, v])].filter(Boolean); };
(async () => {
  console.log("Client id set:", !!process.env.GTROPY_CLIENT_ID, "| secret set:", !!process.env.GTROPY_CLIENT_SECRET);
  if (!process.env.GTROPY_CLIENT_ID || !process.env.GTROPY_CLIENT_SECRET) return console.log("\nRESULT: GTROPY_CLIENT_ID / GTROPY_CLIENT_SECRET are not set in .env.");
  let token = "";
  for (const u of TOK) { try { const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: process.env.GTROPY_CLIENT_ID, clientSecret: process.env.GTROPY_CLIENT_SECRET }) }); console.log("Token", u.startsWith("https") ? "(https)" : "(http)", "→ HTTP", r.status); if (r.ok) { const j = await r.json(); token = j.Token || j.token || (j.data && (j.data.Token || j.data.token)) || ""; if (token) break; } } catch (e) { console.log("Token", u, "→ not reachable:", e.message); } }
  if (!token) return console.log("\nRESULT: cannot get a GTropy token. Check GTROPY_CLIENT_ID / GTROPY_CLIENT_SECRET in .env, and that the server can reach api-locate.com.");
  console.log("Token: OK\n");
  const vehs = process.argv.slice(2); if (!vehs.length) return console.log("Give at least one vehicle, e.g.  node gt-check.js RJ14GI1677");
  const from = day(7), to = day(-1);
  for (const v of vehs) {
    console.log(`== ${v}   (trips ${from} → ${to})`); let found = "";
    for (const name of variants(v)) {
      try { const r = await fetch(DATA, { method: "POST", headers: { "Content-Type": "application/json", token }, body: JSON.stringify({ vehicle: name, fromDt: from + " 00:00", toDt: to + " 00:00" }) }); const t = (await r.text()).trim();
        let n = 0, sample = ""; if (r.ok && t) { try { const j = JSON.parse(t), rows = (Array.isArray(j) ? j : j.data || j.Data || j.result || []).filter(x => !/comprehensive|summary|total/i.test(String(x.From ?? x.from ?? ""))); n = rows.length; if (n) sample = `first trip ${rows[0]["Start Date"] || rows[0].startDate || ""}, ${rows[0]["Kms Covered"] || rows[0].kms || "?"} km`; } catch (e) { sample = "reply is not JSON"; } }
        console.log(`   "${name}" → HTTP ${r.status}${r.ok ? ` · ${n} trip row(s)${sample ? " · " + sample : ""}` : " · " + t.slice(0, 110)}`); if (r.ok && n && !found) found = name;
      } catch (e) { console.log(`   "${name}" → error: ${e.message}`); }
    }
    console.log(found ? `   RESULT: GTropy knows this truck as "${found}".\n` : "   RESULT: no trips under any spelling (HTTP 500 \"no row at position 0\" = GTropy does not know this name for your login, or the truck has no data in these days).\n");
  }
})();
