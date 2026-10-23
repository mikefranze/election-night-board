/**
 * Re-pulls the civicAPI race index into data/raw_civicapi/.
 *
 * Run this again close to election day: race records, candidate lists and the
 * set of published contests all change upstream. As of the last run the feed
 * carried every 2026 Senate general but almost no House or Governor generals,
 * so this is also how you find out whether those have appeared.
 *
 *   node scripts/fetch_index.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://civicapi.org/api/v2';
const OUT = path.join(process.cwd(), 'data', 'raw_civicapi');
const TYPES = [
  ['US Senate', 'senate_generals.ndjson'],
  ['US House', 'house_generals.ndjson'],
  ['Governor', 'gov_generals.ndjson'],
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJSON(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries) throw e;
      await sleep(900 * i);   // the feed has returned transient 503/429 before
    }
  }
}

async function sweep(type, file) {
  const enc = encodeURIComponent(type);
  const lines = [];
  let total = 0, y2026 = 0;
  for (let offset = 0; offset < 1400; offset += 200) {
    const j = await getJSON(`${API}/race/search?country=US&type=${enc}&election_type=General&limit=200&offset=${offset}`);
    const races = j.races || [];
    lines.push(JSON.stringify({ races }));
    total += races.length;
    y2026 += races.filter(r => String(r.election_date || '').startsWith('2026')).length;
    if (races.length < 200) break;
    await sleep(250);         // be polite: their cache-control is max-age=15
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), lines.join('\n') + '\n');
  console.log(`${type.padEnd(10)} -> ${file.padEnd(24)} ${String(total).padStart(4)} generals, ${String(y2026).padStart(4)} dated 2026`);
  return y2026;
}

const counts = {};
for (const [type, file] of TYPES) counts[type] = await sweep(type, file);

console.log('\n2026 general coverage upstream:');
for (const [type, n] of Object.entries(counts)) {
  const expect = type === 'US House' ? 435 : type === 'US Senate' ? 35 : 36;
  const pct = Math.round((n / expect) * 100);
  console.log(`  ${type.padEnd(10)} ${String(n).padStart(4)} / ~${expect}  (${pct}%)${pct < 50 ? '   <-- still sparse upstream' : ''}`);
}
console.log('\nNext: node scripts/build_data.mjs && node scripts/bundle.mjs');
