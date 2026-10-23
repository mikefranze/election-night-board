import { parseDelimited, raceMargin, isGeneral, isRunoff } from './lib_parse.mjs';
const STATES_2026 = ['AK','AL','AR','CO','DE','FL','GA','IA','ID','IL','KS','KY','LA','MA','ME','MI','MN','MS','MT','NC','NE','NH','NJ','NM','OH','OK','OR','RI','SC','SD','TN','TX','VA','WV','WY'];
const rows = parseDelimited(process.argv[2], ',')
  .filter(r => r.office === 'US SENATE' && (isGeneral(r) || isRunoff(r))
            && Number(r.year) >= 2020 && STATES_2026.includes(r.state_po));
const g = new Map();
for (const r of rows) {
  const k = `${r.state_po}|${r.year}|${r.special === 'True' ? 'SP' : '--'}|${isRunoff(r) ? 'RO' : '--'}`;
  if (!g.has(k)) g.set(k, []); g.get(k).push(r);
}
const out = [];
for (const [k, rs] of g) {
  const [st, yr, sp, ro] = k.split('|');
  const m = raceMargin(rs, ['party_simplified', 'party_detailed']);
  if (m) out.push({ st, yr: +yr, sp: sp === 'SP', ro: ro === 'RO', ...m });
}
out.sort((a, b) => a.st.localeCompare(b.st) || a.yr - b.yr || (a.ro ? 1 : 0));
let cur = '';
for (const o of out) {
  if (o.st !== cur) { console.log(''); cur = o.st; }
  console.log(`${o.st} ${o.yr} ${o.sp ? 'SPECIAL' : '       '} ${o.ro ? 'RUNOFF' : '      '}  ${o.label.padStart(8)}  ${o.winner} / ${o.runnerUp}${o.unresolved.length ? '   UNRESOLVED:' + o.unresolved.join(',') : ''}`);
}
const miss = STATES_2026.filter(s => !out.some(o => o.st === s));
console.log(`\nstates with no 2020+ senate race in data: ${miss.join(',') || 'none'}`);
