/**
 * Durable snapshot recorder.
 *
 * Polls civicAPI on an interval and appends one NDJSON line per sweep to
 * data/snapshots/. This runs independently of the dashboard: the page's own
 * in-browser history dies with the tab, and this does not, so it is what
 * guarantees the night is actually captured.
 *
 *   node scripts/record.mjs                  # 60s interval, runs until Ctrl-C
 *   node scripts/record.mjs --interval 30
 *   node scripts/record.mjs --counties       # also record county breakdowns
 *
 * Output: data/snapshots/YYYY-MM-DD.ndjson, one line per sweep:
 *   {"t":"<iso>","races":{"senate/GA":{"m":-1.4,"r":62.1,"c":false,"v":123456}}}
 *
 * m = margin (R-positive), r = percent reporting, c = called, v = votes counted.
 * Replay and post-mortem analysis both read this file.
 */
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://civicapi.org/api/v2';
const OUT = path.join(process.cwd(), 'data', 'snapshots');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? true) : dflt;
};
const INTERVAL = Math.max(15, Number(arg('interval', 60))) * 1000;
const WITH_COUNTIES = process.argv.includes('--counties');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJSON(url, tries = 3) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
      if (i < tries) await sleep(700 * i * i);
    }
  }
  throw last;
}

/** Margin between the top two by votes, signed positive for the Republican. */
function margin(race) {
  const cands = (race.candidates || [])
    .filter(c => !/write-?in/i.test(c.party || ''))
    .map(c => ({ p: /^Democratic/.test(c.party || '') ? 'D' : /^Republican/.test(c.party || '') ? 'R' : 'I',
                 v: +c.votes || 0, w: !!c.winner }))
    .sort((a, b) => b.v - a.v);
  const [w, l] = cands;
  if (!w || !l || w.v + l.v === 0) return { m: null, v: 0, c: cands.some(c => c.w) };
  const spread = ((w.v - l.v) / (w.v + l.v)) * 100;
  const m = w.p === 'R' ? spread : w.p === 'D' ? -spread : (l.p === 'R' ? -spread : spread);
  return { m: +m.toFixed(2), v: w.v + l.v, c: cands.some(c => c.w) };
}

async function sweepType(type, filterGeneral) {
  const enc = encodeURIComponent(type);
  const filter = filterGeneral ? '&election_type=General' : '';
  const out = [];
  for (let offset = 0; offset < 1400; offset += 200) {
    const j = await getJSON(`${API}/race/search?country=US&type=${enc}${filter}&limit=200&offset=${offset}`);
    const races = j.races || [];
    out.push(...races);
    if (races.length < 200) break;
    await sleep(200);
  }
  return out.filter(r => String(r.election_date || '').startsWith('2026'));
}

async function snapshot() {
  const races = {};
  const raceId = {};              // key -> civicAPI race id, so county lookups cannot mismatch office
  const [sen, gov, house] = await Promise.all([
    sweepType('US Senate', true).catch(() => []),
    // Governors publish as "Statewide", not "General" — filtering on General
    // returns almost nothing, which is how the Governor tab looked empty for days.
    sweepType('Governor', false).catch(() => []),
    sweepType('US House', true).catch(() => []),
  ]);
  for (const r of sen) {
    if (!r.province || r.province === 'US') continue;
    const k = `senate/${r.province}`;
    races[k] = { ...margin(r), r: +r.percent_reporting || 0 };
    raceId[k] = r.id;
  }
  for (const r of gov) {
    if (!r.province || r.province === 'US') continue;
    if (!/^(Statewide|General)$/i.test(r.election_type || '')) continue;
    const k = `gov/${r.province}`;
    races[k] = { ...margin(r), r: +r.percent_reporting || 0 };
    raceId[k] = r.id;
  }
  for (const r of house) {
    if (!r.district) continue;
    const k = `house/${r.district}`;
    races[k] = { ...margin(r), r: +r.percent_reporting || 0 };
    raceId[k] = r.id;
  }

  const line = { t: new Date().toISOString(), races };

  if (WITH_COUNTIES) {
    const counties = {};
    for (const key of Object.keys(races)) {
      if (!key.startsWith('senate/') && !key.startsWith('gov/')) continue;
      const id = raceId[key];
      if (!id) continue;
      try {
        const d = await getJSON(`${API}/race/${id}`);
        const regs = {};
        for (const [regKey, reg] of Object.entries(d.region_results || {})) {
          // FIPS is not guaranteed — some races return regions without it, and
          // keying on FIPS alone silently drops every county in those races.
          // Fall back to the region key, prefixed so a replay knows which it is.
          const f = reg.fips ? String(reg.fips).padStart(5, '0') : `name:${regKey}`;
          const m = margin({ candidates: reg.candidates });
          if (m.m === null) continue;
          regs[f] = { m: m.m, r: +reg.percent_reporting || 0, v: m.v };
        }
        if (Object.keys(regs).length) counties[key] = regs;
      } catch { /* a race that fails this sweep is simply absent from it */ }
      await sleep(90);
    }
    line.counties = counties;
  }

  return line;
}

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
console.log(`recording every ${INTERVAL / 1000}s${WITH_COUNTIES ? ' (with counties)' : ''} -> ${OUT}`);
console.log('Ctrl-C to stop.\n');

for (;;) {
  const started = Date.now();
  try {
    const line = await snapshot();
    const file = path.join(OUT, `${line.t.slice(0, 10)}.ndjson`);
    fs.appendFileSync(file, JSON.stringify(line) + '\n');
    const counted = Object.values(line.races).filter(r => r.v > 0).length;
    n++;
    console.log(`${line.t.slice(11, 19)}  sweep ${n}: ${Object.keys(line.races).length} races, `
      + `${counted} with votes${line.counties ? `, ${Object.keys(line.counties).length} races w/ counties` : ''}`
      + `  -> ${path.basename(file)}`);
  } catch (e) {
    // Never exit on a failed sweep; a gap in the record beats losing the recorder.
    console.log(`${new Date().toISOString().slice(11, 19)}  sweep failed: ${e.message}`);
  }
  await sleep(Math.max(1000, INTERVAL - (Date.now() - started)));
}
