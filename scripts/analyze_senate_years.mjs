import { parseDelimited } from './lib_parse.mjs';
const rows = parseDelimited(process.argv[2], ',')
  .filter(r => r.office === 'senate' && r.stage === 'general' && Number(r.year) >= 2016);
const agg = new Map();
for (const r of rows) {
  const k = `${r.state_po}|${r.year}`;
  if (!agg.has(k)) agg.set(k, { D: 0, R: 0, n: new Set(), cands: new Set() });
  const a = agg.get(k);
  const v = Number(r.votes) || 0;
  if (r.party_group === 'DEM') a.D += v;
  else if (r.party_group === 'REP') a.R += v;
  a.n.add(r.county_fips);
  if (r.party_group === 'DEM' || r.party_group === 'REP') a.cands.add(r.candidate);
}
const STATES_2026 = ['AK','AL','AR','CO','DE','FL','GA','IA','ID','IL','KS','KY','LA','MA','ME','MI','MN','MS','MT','NC','NE','NH','NJ','NM','OH','OK','OR','RI','SC','SD','TN','TX','VA','WV','WY'];
const by = new Map();
for (const [k, a] of agg) {
  const [po, yr] = k.split('|');
  if (!STATES_2026.includes(po)) continue;
  const m = (a.R + a.D) ? ((a.R - a.D) / (a.R + a.D)) * 100 : null;
  if (!by.has(po)) by.set(po, []);
  by.get(po).push({ yr: +yr, m, n: a.n.size, cands: a.cands.size });
}
console.log('state | years available (margin, counties, #D/R candidates)');
for (const po of STATES_2026) {
  const list = (by.get(po) || []).sort((a, b) => b.yr - a.yr);
  if (!list.length) { console.log(`${po} | NONE`); continue; }
  console.log(`${po} | ` + list.map(l =>
    `${l.yr}:${l.m === null ? '—' : (l.m > 0 ? 'R+' : 'D+') + Math.abs(l.m).toFixed(1)}(${l.n}c${l.cands > 2 ? ',' + l.cands + 'cand' : ''})`).join('  '));
}
