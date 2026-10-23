import fs from 'node:fs';
import { parseDelimited } from './lib_parse.mjs';

const rows = parseDelimited(process.argv[2], ',')
  .filter(r => r.office === 'senate' && r.year === process.argv[3]);
console.log(`senate ${process.argv[3]} rows: ${rows.length}`);
console.log('distinct stage:', [...new Set(rows.map(r => r.stage))].join(' | '));
console.log('distinct district values:', [...new Set(rows.map(r => r.district))].slice(0, 8).join(' | '));
console.log('distinct party_group:', [...new Set(rows.map(r => r.party_group))].join(' | '));

// aggregate to statewide two-party margin
const by = new Map();
for (const r of rows) {
  if (r.stage !== 'general') continue;
  const k = `${r.state_po}|${r.district || ''}`;
  if (!by.has(k)) by.set(k, { D: 0, R: 0, counties: new Set() });
  const g = by.get(k);
  const v = Number(r.votes) || 0;
  if (r.party_group === 'DEM') g.D += v;
  else if (r.party_group === 'REP') g.R += v;
  g.counties.add(r.county_fips);
}
const out = [...by.entries()].map(([k, g]) => {
  const [po, d] = k.split('|');
  const m = (g.R + g.D) ? ((g.R - g.D) / (g.R + g.D)) * 100 : null;
  return { po, d, m, n: g.counties.size };
}).sort((a, b) => a.po.localeCompare(b.po));
console.log(`\nstatewide margins from county data (${out.length} contests):`);
for (const o of out) console.log(`  ${o.po}${o.d ? '/' + o.d : ''}  ${o.m === null ? '—' : (o.m > 0 ? 'R+' : 'D+') + Math.abs(o.m).toFixed(1)}  (${o.n} counties)`);
