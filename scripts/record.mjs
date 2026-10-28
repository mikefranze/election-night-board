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
 *   {"t":"<iso>","td":true,"races":{"senate/GA":{"m":-1.4,"r":62.1,"c":false,"v":123456}}}
 *
 * m = margin (R-positive), r = percent reporting, c = called, v = votes counted.
 * td = the feed's own test_data flag, probed once per sweep. The search endpoint
 * does not carry it, only /race/{id} does, so one extra request per sweep buys
 * the one field that tells a rehearsal apart from the real count. null means the
 * probe failed, which is not the same as false.
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
// --counties forces county capture from the first sweep. Left off, the recorder
// stays light while nothing is happening and turns counties on by itself when a
// rehearsal starts. A rehearsal starts unattended, and a recorder that is
// running but capturing the wrong granularity when one finally arrives fails the
// same way a dead one does.
//
// "Any race with votes" is the wrong trigger: a couple of House generals are
// already published and called, so that fires on the first sweep and never lets
// go. The first sweep's races-with-votes become the baseline instead, and only
// something NEW counts — a race outside it gaining votes, or the feed's own
// test_data flag going true.
const FORCE_COUNTIES = process.argv.includes('--counties');
let withCounties = FORCE_COUNTIES;
let baseline = null;             // Set of keys that already had votes at startup

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

  // Is the feed in test mode? Uniform across races every time it has been
  // checked, so one probe race answers it for the whole sweep.
  let td = null;
  const probeKey = Object.keys(raceId).find(k => k.startsWith('senate/'));
  if (probeKey) {
    try { td = !!(await getJSON(`${API}/race/${raceId[probeKey]}`)).test_data; }
    catch { /* leave null: unknown, not false */ }
  }

  const line = { t: new Date().toISOString(), td, races };

  if (withCounties) {
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
console.log(`recording every ${INTERVAL / 1000}s${FORCE_COUNTIES ? ' (with counties)'
  : ' (counties auto-enable when votes appear)'} -> ${OUT}`);
console.log('Ctrl-C to stop.\n');

for (;;) {
  const started = Date.now();
  try {
    const line = await snapshot();
    const file = path.join(OUT, `${line.t.slice(0, 10)}.ndjson`);
    fs.appendFileSync(file, JSON.stringify(line) + '\n');
    const voting = Object.keys(line.races).filter(k => line.races[k].v > 0);
    const counted = voting.length;
    if (baseline === null) {
      baseline = new Set(voting);
      if (counted) console.log(`${line.t.slice(11, 19)}  baseline: ${counted} race(s) already carrying votes `
        + `(${voting.slice(0, 4).join(', ')}${counted > 4 ? ', …' : ''}) — ignored for escalation`);
    } else if (!withCounties) {
      const fresh = voting.filter(k => !baseline.has(k));
      if (fresh.length || line.td === true) {
        withCounties = true;
        console.log(`${line.t.slice(11, 19)}  REHEARSAL DETECTED — `
          + `${line.td === true ? 'feed flipped to test_data' : `new votes in ${fresh.slice(0, 5).join(', ')}`}`
          + ` — county capture ON`);
      }
    }
    n++;
    console.log(`${line.t.slice(11, 19)}  sweep ${n}: ${Object.keys(line.races).length} races, `
      + `${counted} with votes`
      + `${line.td === null ? '' : line.td ? ' [TEST FEED]' : ''}`
      + `${line.counties ? `, ${Object.keys(line.counties).length} races w/ counties` : ''}`
      + `  -> ${path.basename(file)}`);
  } catch (e) {
    // Never exit on a failed sweep; a gap in the record beats losing the recorder.
    console.log(`${new Date().toISOString().slice(11, 19)}  sweep failed: ${e.message}`);
  }
  await sleep(Math.max(1000, INTERVAL - (Date.now() - started)));
}
