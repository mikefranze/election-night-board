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
  // Governor contests are published as "Statewide" while Senate generals are
  // "General", so filtering governors on General upstream returns almost
  // nothing. Fetch those unfiltered and screen by election_type instead.
  const isGov = type === 'Governor';
  const filter = isGov ? '' : '&election_type=General';
  const keep = (r) => !isGov || /^(Statewide|General)$/i.test(r.election_type || '');
  for (let offset = 0; offset < 1400; offset += 200) {
    const j = await getJSON(`${API}/race/search?country=US&type=${enc}${filter}&limit=200&offset=${offset}`);
    const all = j.races || [];
    const races = all.filter(keep);
    lines.push(JSON.stringify({ races }));
    total += races.length;
    y2026 += races.filter(r => String(r.election_date || '').startsWith('2026')).length;
    if (all.length < 200) break;
    await sleep(250);         // be polite: their cache-control is max-age=15
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), lines.join('\n') + '\n');
  console.log(`${type.padEnd(10)} -> ${file.padEnd(24)} ${String(total).padStart(4)} generals, ${String(y2026).padStart(4)} dated 2026`);
  return y2026;
}

const counts = {};
for (const [type, file] of TYPES) counts[type] = await sweep(type, file);

/**
 * Poll-closing times come only from the per-race endpoint, never from search,
 * so they are collected here at build time rather than by the page. They do not
 * change, so one pass per index refresh is plenty.
 */
async function collectPollTimes() {
  const out = {};
  const want = [];
  for (const [type, file] of TYPES) {
    const txt = fs.readFileSync(path.join(OUT, file), 'utf8');
    for (const line of txt.split('\n')) {
      const t = line.trim(); if (!t) continue;
      let races = [];
      try { races = JSON.parse(t).races || []; } catch { continue; }
      for (const r of races) {
        if (!String(r.election_date || '').startsWith('2026')) continue;
        if (!r.province || r.province === 'US') continue;
        if (type === 'Governor' && !/^(Statewide|General)$/i.test(r.election_type || '')) continue;
        if (type !== 'Governor' && !/^General$/i.test(r.election_type || '')) continue;
        const office = type === 'US Senate' ? 'senate' : type === 'Governor' ? 'gov' : 'house';
        const key = office === 'house' ? `house/${r.district}` : `${office}/${r.province}`;
        want.push({ key, id: r.id });
      }
    }
  }
  const seen = new Set();
  let got = 0;
  for (const w of want) {
    if (seen.has(w.key)) continue;
    seen.add(w.key);
    try {
      const d = await getJSON(`${API}/race/${w.id}`);
      if (d.polls_close) { out[w.key] = { close: d.polls_close, open: d.polls_open || null }; got++; }
    } catch { /* a missing close time just means no countdown for that race */ }
    await sleep(80);
  }
  fs.writeFileSync(path.join(OUT, 'poll_times.json'), JSON.stringify(out, null, 1));
  console.log(`\npoll closing times: ${got} of ${seen.size} races -> poll_times.json`);
}
await collectPollTimes();

console.log('\n2026 general coverage upstream:');
for (const [type, n] of Object.entries(counts)) {
  const expect = type === 'US House' ? 435 : type === 'US Senate' ? 35 : 36;
  const pct = Math.round((n / expect) * 100);
  console.log(`  ${type.padEnd(10)} ${String(n).padStart(4)} / ~${expect}  (${pct}%)${pct < 50 ? '   <-- still sparse upstream' : ''}`);
}
console.log('\nNext: node scripts/build_data.mjs && node scripts/bundle.mjs');
