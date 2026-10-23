import fs from 'node:fs';
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').slice(1);
const st = new Map(); let nG = 0, nD = 0, nT = 0;
for (const line of rows) {
  // split on commas, tolerating quoted county names
  const f = line.match(/("[^"]*"|[^,]*)(,|$)/g).map(s => s.replace(/,$/, '').replace(/^"|"$/g, ''));
  const [state, , , gop, dem, tot] = f;
  const g = +gop, d = +dem, t = +tot;
  if (!Number.isFinite(g) || !Number.isFinite(d)) continue;
  const cur = st.get(state) || { g: 0, d: 0, t: 0, n: 0 };
  cur.g += g; cur.d += d; cur.t += t; cur.n++; st.set(state, cur);
  nG += g; nD += d; nT += t;
}
const margin = (g, d) => ((g - d) / (g + d)) * 100;   // two-party, + = Trump
console.log(`counties: ${rows.length}  states: ${st.size}`);
console.log(`NATIONAL two-party Trump margin: ${margin(nG, nD).toFixed(2)}  (R ${nG.toLocaleString()} / D ${nD.toLocaleString()})`);
console.log('\nsanity checks vs known 2024:');
for (const s of ['Georgia','North Carolina','Michigan','Pennsylvania','Wisconsin','Arizona','Nevada','Texas','Maine','Ohio'])
  if (st.has(s)) { const c = st.get(s); console.log(`  ${s.padEnd(16)} Trump +${margin(c.g,c.d).toFixed(2).padStart(6)}  (${c.n} counties)`); }
