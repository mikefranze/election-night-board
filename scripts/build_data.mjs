import fs from 'node:fs';
import path from 'node:path';
import { parseDelimited, raceMargin, isGeneral, isRunoff, twoParty } from './lib_parse.mjs';
import { STATES, NAME_TO_PO, SENATE_BASELINE } from './states.mjs';

const R = (...p) => path.join(process.cwd(), ...p);
const warn = [];
const num = (s) => Number(String(s ?? '').replace(/[",\s]/g, ''));
const distKey = (po, d) => {
  const s = String(d ?? '').trim().replace(/^"|"$/g, '');
  return `${po}-${(s === '0' || s === '' || /^AL$/i.test(s)) ? 'AL' : s.padStart(2, '0')}`;
};

/* ---------- 1. 2024 presidential: county + state ---------- */
const presCounty = parseDelimited(R('data/raw_pres2024/2024_US_County_Level_Presidential_Results.csv'), ',');
const counties = {};
const stateAgg = new Map();
for (const r of presCounty) {
  const g = num(r.votes_gop), d = num(r.votes_dem), t = num(r.total_votes);
  const po = NAME_TO_PO[String(r.state_name).toUpperCase()];
  if (!po || !Number.isFinite(g) || !Number.isFinite(d)) {
    warn.push(`county skip: ${r.state_name} / ${r.county_name}`);
    continue;
  }
  const fips = String(r.county_fips).padStart(5, '0');
  // v2 = 2024 two-party votes: the denominator the projection scales turnout
  // against, and the weight everything else uses. Total turnout was also stored
  // here once and was redundant with it to within a percent or two.
  counties[fips] = { n: r.county_name, st: po, m: +twoParty(g, d).toFixed(2), v2: g + d };
  const a = stateAgg.get(po) || { g: 0, d: 0, t: 0 };
  a.g += g; a.d += d; a.t += t;
  stateAgg.set(po, a);
}
const trump2024ByState = {};
for (const [po, a] of stateAgg) trump2024ByState[po] = +twoParty(a.g, a.d).toFixed(2);
const natAgg = [...stateAgg.values()].reduce((x, a) => ({ g: x.g + a.g, d: x.d + a.d }), { g: 0, d: 0 });
const trump2024National = +twoParty(natAgg.g, natAgg.d).toFixed(2);

/* ---------- 2. 2024 presidential by congressional district ---------- */
const presCd = parseDelimited(R('data/raw_pres2024/pres_by_cd_2024.csv'), ',');
const trump2024ByCd = {};
for (const r of presCd) {
  const cd = String(r.CD || '').trim();
  if (!/^[A-Z]{2}-/.test(cd)) continue;
  const [po, d] = cd.split('-');
  const t = num(r.Trump), h = num(r.Harris);
  const tp = (Number.isFinite(t) && Number.isFinite(h)) ? twoParty(t, h) : null;
  if (tp === null) {
    // The Downballot mirror ships NY-21 with empty vote fields. Record the gap
    // rather than guessing a margin; the UI renders these as unknown.
    warn.push(`cd has no 2024 presidential vote totals: ${cd}`);
    trump2024ByCd[distKey(po, d)] = null;
    continue;
  }
  trump2024ByCd[distKey(po, d)] = +tp.toFixed(2);
}

/* ---------- 2b. County-level 2020 Senate, as an alternate scatter baseline ----------
   MEDSL's county-level Senate files sit behind a Dataverse guestbook, so this
   comes from pmheideman/us-county-election-results instead. Cross-checked against
   the MEDSL statewide file: GA R+1.8, NC R+1.8, MI D+1.7, CO D+9.5 all agree.
   Ohio and Florida have no 2020 Senate race at all (neither has a Class 2 seat),
   so they are simply absent here and the UI says so. */
const senatePrevByCounty = {};
const senatePrevByState = {};
{
  const srcPath = R('data/raw_county_senate/us_county_results_long.csv');
  if (!fs.existsSync(srcPath)) {
    warn.push('county-level Senate file missing; that scatter baseline will be unavailable');
  } else {
    // county margins keyed state -> year -> fips, plus a statewide total per year
    const byYear = new Map();
    for (const r of parseDelimited(srcPath, ',')) {
      if (r.office !== 'senate' || r.stage !== 'general') continue;
      const yr = Number(r.year);
      if (!Number.isFinite(yr) || yr < 2016 || yr > 2024) continue;
      const fips = String(r.county_fips || '').padStart(5, '0');
      if (!/^\d{5}$/.test(fips)) continue;
      const v = Number(r.votes); if (!Number.isFinite(v)) continue;
      const k = `${r.state_po}|${yr}`;
      if (!byYear.has(k)) byYear.set(k, { st: r.state_po, yr, counties: new Map(), D: 0, R: 0 });
      const g = byYear.get(k);
      if (!g.counties.has(fips)) g.counties.set(fips, { D: 0, R: 0 });
      const c = g.counties.get(fips);
      if (r.party_group === 'DEM') { c.D += v; g.D += v; }
      else if (r.party_group === 'REP') { c.R += v; g.R += v; }
    }

    const byState = new Map();
    for (const g of byYear.values()) {
      if (!byState.has(g.st)) byState.set(g.st, []);
      byState.get(g.st).push(g);
    }

    /**
     * Which prior Senate race to compare a county against.
     *
     * Default is 2020: that is the Class 2 cycle, so for most of the 35 seats on
     * the ballot in 2026 it is literally the last time THIS seat was contested.
     * Two things force a fallback to the most recent usable race instead:
     *   - the state has no 2020 Senate race at all (FL and OH have no Class 2
     *     seat; their 2026 contests are specials)
     *   - the 2020 race was uncontested, so its margin carries no information
     *     (Arkansas: Tom Cotton drew no Democratic opponent)
     * A race won by an independent is also unusable, because a Democrat-versus-
     * Republican margin then describes a contest that did not happen (Maine 2024,
     * where Angus King won and the D-vs-R gap reads as a 53-point Republican win).
     */
    const usable = (g) => {
      const tp = twoParty(g.R, g.D);
      if (tp === null) return false;
      if (Math.abs(tp) > 95) return false;         // uncontested
      return true;
    };
    const INDEPENDENT_WINS = new Set(['ME|2024', 'VT|2024', 'VT|2022']);

    for (const [st, list] of byState) {
      const ok = list.filter(g => usable(g) && !INDEPENDENT_WINS.has(`${g.st}|${g.yr}`))
        .sort((a, b) => b.yr - a.yr);
      if (!ok.length) { senatePrevByState[st] = { year: null, reason: 'none' }; continue; }
      const y2020 = ok.find(g => g.yr === 2020);
      const had2020 = list.some(g => g.yr === 2020);
      const chosen = y2020 || ok[0];
      senatePrevByState[st] = {
        year: chosen.yr,
        reason: y2020 ? 'class2' : (had2020 ? 'uncontested2020' : 'no2020'),
      };
      // Store the margin alone. The year is a per-state fact, not a per-county
      // one, and the dot size uses 2024 turnout, so carrying either per county
      // would repeat the same value thousands of times.
      for (const [fips, c] of chosen.counties) {
        const tp = twoParty(c.R, c.D);
        if (tp === null) continue;
        senatePrevByCounty[fips] = +tp.toFixed(1);
      }
    }
  }
}

/* ---------- 3. Senate history -> baseline for each 2026 seat ---------- */
const senRows = parseDelimited(R('data/raw_medsl/senate_1976_2024.csv'), ',')
  .filter(r => r.office === 'US SENATE' && (isGeneral(r) || isRunoff(r)));

function senateBaseline(po) {
  const cfg = SENATE_BASELINE[po] || SENATE_BASELINE._default;
  const rows = senRows.filter(r => r.state_po === po
    && Number(r.year) === cfg.year
    && (r.special === 'True') === cfg.special
    && isRunoff(r) === cfg.runoff);
  if (!rows.length) { warn.push(`no senate baseline rows for ${po} (${JSON.stringify(cfg)})`); return null; }
  const m = raceMargin(rows, ['party_simplified', 'party_detailed']);
  if (!m) { warn.push(`senate baseline unparsable for ${po}`); return null; }
  if (m.unresolved.length) warn.push(`senate ${po} ${cfg.year}: unresolved party for ${m.unresolved.join(', ')}`);
  return {
    year: cfg.year, special: cfg.special, runoff: cfg.runoff, note: cfg.note || null,
    margin: +m.margin.toFixed(2), label: m.label,
    uncontested: m.uncontested, effectivelyUncontested: m.effectivelyUncontested ?? false,
    winner: m.winner, winnerParty: m.winnerParty, runnerUp: m.runnerUp,
  };
}

/* ---------- 4. House 2024 margins by district ---------- */
const houseRows = parseDelimited(R('data/raw_medsl/house_1976_2024.tsv'), ',')
  // DC and the territories send non-voting delegates, so they are not House seats.
  .filter(r => r.year === '2024' && isGeneral(r) && STATES[r.state_po] && r.state_po !== 'DC');
const byDist = new Map();
for (const r of houseRows) {
  const k = distKey(r.state_po, r.district);
  if (!byDist.has(k)) byDist.set(k, []);
  byDist.get(k).push(r);
}
const house2024 = {};
for (const [k, rows] of byDist) {
  const m = raceMargin(rows, ['party', 'party_detailed']);
  if (!m) { warn.push(`house unparsable: ${k}`); continue; }
  if (m.unresolved.length) warn.push(`house ${k}: unresolved party for ${m.unresolved.join(', ')}`);
  house2024[k] = {
    margin: +m.margin.toFixed(2), label: m.label,
    uncontested: m.uncontested, effectivelyUncontested: m.effectivelyUncontested ?? false,
    winner: m.winner, winnerParty: m.winnerParty, runnerUp: m.runnerUp,
  };
}

/* ---------- 5. civicAPI 2026 Senate race index ---------- */
const idx = [];
for (const line of fs.readFileSync(R('data/raw_civicapi/senate_generals.ndjson'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t) continue;
  try { idx.push(...(JSON.parse(t).races || [])); } catch { /* truncated line */ }
}
const senate2026 = [];
for (const r of idx) {
  if (!String(r.election_date || '').startsWith('2026')) continue;
  if (r.province === 'US') continue;                        // national rollup, kept separately
  if (senate2026.some(x => x.state === r.province)) continue;
  const cands = (r.candidates || [])
    .filter(c => !/write-?in/i.test(c.party || ''))
    .map(c => ({ name: String(c.name || '').replace(/\s+/g, ' ').trim(), party: c.party || null }));
  senate2026.push({
    raceId: r.id,
    state: r.province,
    stateName: STATES[r.province] || r.province,
    name: r.election_name,
    special: /special/i.test(r.election_name),
    trump2024: trump2024ByState[r.province] ?? null,
    lastSenate: senateBaseline(r.province),
    candidates: cands,
  });
}
senate2026.sort((a, b) => a.stateName.localeCompare(b.stateName));
const nationalRollupId = idx.find(r => r.province === 'US'
  && String(r.election_date || '').startsWith('2026'))?.id ?? null;

/* ---------- 5b. 2026 governor races + poll closing times ---------- */
const gov2026 = [];
{
  const govPath = R('data/raw_civicapi/gov_generals.ndjson');
  if (fs.existsSync(govPath)) {
    const seen = new Set();
    for (const line of fs.readFileSync(govPath, 'utf8').split('\n')) {
      const t = line.trim(); if (!t) continue;
      let races = [];
      try { races = JSON.parse(t).races || []; } catch { continue; }
      for (const r of races) {
        if (!String(r.election_date || '').startsWith('2026')) continue;
        if (!r.province || r.province === 'US' || seen.has(r.province)) continue;
        if (!/^(Statewide|General)$/i.test(r.election_type || '')) continue;
        seen.add(r.province);
        gov2026.push({
          raceId: r.id, state: r.province, stateName: STATES[r.province] || r.province,
          trump2024: trump2024ByState[r.province] ?? null,
        });
      }
    }
    gov2026.sort((a, b) => a.stateName.localeCompare(b.stateName));
  } else {
    warn.push('governor index missing; run scripts/fetch_index.mjs');
  }
}

// Poll closing times are only available from the per-race endpoint, so
// fetch_index.mjs collects them and they are baked in here.
let pollTimes = {};
{
  const ptPath = R('data/raw_civicapi/poll_times.json');
  if (fs.existsSync(ptPath)) {
    try { pollTimes = JSON.parse(fs.readFileSync(ptPath, 'utf8')); }
    catch { warn.push('poll_times.json is unreadable'); }
  } else {
    warn.push('poll_times.json missing; run scripts/fetch_index.mjs for closing-time countdowns');
  }
}

/* ---------- 6. House watchlist: data-driven, not hand-picked ---------- */
const houseWatch = Object.keys(trump2024ByCd)
  .map(k => ({
    district: k, state: k.split('-')[0],
    trump2024: trump2024ByCd[k],
    house2024: house2024[k] || null,
  }))
  // Math.abs(null) is 0, which would smuggle unknown-margin districts in as tossups,
  // so test for a real number first.
  .filter(d => (Number.isFinite(d.trump2024) && Math.abs(d.trump2024) < 10)
            || (d.house2024 && Math.abs(d.house2024.margin) < 10))
  .sort((a, b) => Math.abs(a.trump2024 ?? 99) - Math.abs(b.trump2024 ?? 99));

/* ---------- 7. Polling averages (user-supplied, nothing invented) ---------- */
const polling = {};
const pollPath = R('data/polling_averages.csv');
if (fs.existsSync(pollPath)) {
  const lines = fs.readFileSync(pollPath, 'utf8').split(/\r?\n/)
    .filter(l => l.trim() && !l.trimStart().startsWith('#'));
  if (lines.length > 1) {
    const tmp = R('build/.poll.tmp.csv');
    fs.mkdirSync(R('build'), { recursive: true });
    fs.writeFileSync(tmp, lines.join('\n'));
    for (const row of parseDelimited(tmp, ',')) {
      const k = String(row.race_key || '').trim();
      const m = Number(row.margin);
      if (!k || !Number.isFinite(m)) continue;
      // Party of the leading non-Republican. The margin's sign cannot convey
      // this, and neither can the candidate list where a Democrat and an
      // independent are both on the ballot (Montana).
      const opp = String(row.opponent || '').trim().toUpperCase();
      polling[k] = {
        margin: m,
        source: String(row.source || '').trim() || 'unspecified',
        asOf: String(row.as_of || '').trim(),
        opponent: /^[DIR]$/.test(opp) ? opp : null,
      };
    }
    fs.unlinkSync(tmp);
  }
}

/* ---------- emit ---------- */
const out = {
  meta: {
    generated: new Date().toISOString(),
    electionDate: '2026-11-03',
    trump2024National,
    nationalRollupId,
    sources: {
      liveResults: 'civicAPI https://civicapi.org/api/v2 (free, no key, attribution requested)',
      pres2024County: 'tonmcg/US_County_Level_Election_Results_08-24',
      pres2024ByCd: 'The Downballot, 2024 Pres by CD (via jaytimm/PresElectionResults mirror)',
      senateHistory: 'MIT Election Data + Science Lab, U.S. Senate statewide 1976-2024 (doi:10.7910/DVN/PEJ5QU)',
      houseHistory: 'MIT Election Data + Science Lab, U.S. House 1976-2024 (doi:10.7910/DVN/IG0UN2)',
      polling: 'data/polling_averages.csv (user-supplied)',
    },
    counts: {},
  },
  stateNames: STATES,
  trump2024ByState,
  trump2024ByCd,
  counties,
  senatePrevByCounty,
  senatePrevByState,
  senate2026,
  gov2026,
  pollTimes,
  houseWatch,
  house2024,
  polling,
};
out.meta.counts = {
  senateRaces: senate2026.length,
  govRaces: gov2026.length,
  pollTimes: Object.keys(pollTimes).length,
  counties: Object.keys(counties).length,
  cds: Object.keys(trump2024ByCd).length,
  houseDistrictsWith2024: Object.keys(house2024).length,
  houseWatch: houseWatch.length,
  pollingRows: Object.keys(polling).length,
  senatePrevCounties: Object.keys(senatePrevByCounty).length,
  warnings: warn.length,
};

fs.mkdirSync(R('build'), { recursive: true });
fs.writeFileSync(R('build/data.json'), JSON.stringify(out));
fs.writeFileSync(R('build/warnings.txt'), warn.join('\n') + '\n');

console.log(JSON.stringify(out.meta.counts, null, 2));
console.log(`\nnational 2024 Trump two-party margin: ${trump2024National}`);
console.log(`data.json: ${(fs.statSync(R('build/data.json')).size / 1024).toFixed(0)} KB`);
console.log('\nfirst 15 warnings:');
console.log(warn.slice(0, 15).map(w => '  ' + w).join('\n') || '  none');
