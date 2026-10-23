import fs from 'node:fs';

export function parseDelimited(path, delim) {
  const txt = fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, '').trim();
  const lines = txt.split(/\r?\n/);
  const split = (line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === delim && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out;
  };
  const head = split(lines[0]).map(h => h.trim());
  return lines.slice(1).map(l => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}

// MEDSL party fields are inconsistent: party_simplified is sometimes OTHER or blank
// while party_detailed carries the real label, and occasionally both are empty.
// Resolve through a priority chain and fall back to an explicit override list.
const PARTY_OVERRIDES = {
  'CYNTHIA M. LUMMIS': 'R', 'MERAV BEN DAVID': 'D',   // WY 2020: both fields OTHER
};
const JUNK = /^(OVER|UNDER)\s+VOTES$|^WRITE-?IN|^BLANK|^SCATTER|^EXHAUSTED|^TOTAL$|^OTHER$|^ALL\s+OTHERS$|^CONTINUING\s+BALLOTS$|^NONE\s+OF|^$/i;

export function normParty(...candidates) {
  for (const raw of candidates) {
    const s = String(raw || '').toUpperCase().trim();
    if (!s || s === 'OTHER') continue;
    if (/DEMOCRAT/.test(s) && !/REPUBLICAN/.test(s)) return 'D';
    if (/REPUBLICAN/.test(s) && !/DEMOCRAT/.test(s)) return 'R';
    if (/LIBERTARIAN|GREEN|CONSTITUTION|REFORM|SOCIALIS|WORKING FAMIL|CONSERVATIVE/.test(s)) return '3';
    if (/INDEPEND|NONPARTISAN|NO PARTY/.test(s)) return 'I';
  }
  return null;
}

/**
 * Collapse MEDSL rows (one per candidate per vote-mode) to per-candidate totals and
 * return the margin between the TOP TWO finishers regardless of party, so races won
 * by an independent (VT, ME 2018, NE) are not reported as meaningless D-vs-R gaps.
 * `margin` is signed so that positive = Republican-favouring, matching Trump margin.
 */
// Fusion-voting states (NY especially) list one candidate on several party lines.
// Votes must be summed across those lines and the party resolved by precedence,
// or a Republican cross-endorsed by the Conservative party reads as third-party.
const PARTY_RANK = { D: 0, R: 0, I: 1, 3: 2 };
const bestParty = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return PARTY_RANK[b] < PARTY_RANK[a] ? b : a;
};

export function raceMargin(rows, partyFields) {
  const byCand = new Map();
  for (const r of rows) {
    const v = Number(r.candidatevotes); if (!Number.isFinite(v)) continue;
    const name = (r.candidate || '').trim();
    if (JUNK.test(name)) continue;
    const p = normParty(...partyFields.map(f => r[f])) ?? PARTY_OVERRIDES[name.toUpperCase()] ?? null;
    const cur = byCand.get(name) || { cand: name, party: null, votes: 0 };
    cur.party = bestParty(cur.party, p);
    cur.votes += v;
    byCand.set(name, cur);
  }
  // Warn only when a top-two candidate's party is still unknown after all rows,
  // since that is the only case that can mis-sign the margin.
  const unresolved = [...byCand.values()].filter(c => !c.party).map(c => c.cand);
  const all = [...byCand.values()].sort((a, b) => b.votes - a.votes);
  if (!all.length) return null;
  const sign = (party, spread) => party === 'R' ? spread : party === 'D' ? -spread : spread;

  // 13 of the 2024 House seats drew a single candidate. Reporting them as a
  // 100-point margin is the usual convention; flag it so the UI can say so
  // rather than letting a fake blowout skew any aggregate.
  const [w, l] = all;
  if (all.length === 1 || !(w.votes + (l?.votes ?? 0))) {
    return {
      spread: 100, margin: sign(w.party, 100), uncontested: true,
      winnerParty: w.party, winner: w.cand, runnerUp: null, runnerUpParty: null,
      label: `${w.party ?? '?'}+unopposed`, unresolved: [],
    };
  }

  const denom = w.votes + l.votes;
  const spread = ((w.votes - l.votes) / denom) * 100;
  const signed = w.party === 'R' ? spread : w.party === 'D' ? -spread
               : l.party === 'R' ? -spread : spread;
  return {
    spread, margin: signed, uncontested: false,
    // A named write-in holding under 2% is not real opposition. Marked so these
    // ~99-point margins can be excluded from aggregates instead of skewing them.
    effectivelyUncontested: spread > 96,
    winnerParty: w.party, winner: w.cand, runnerUp: l.cand, runnerUpParty: l.party,
    label: `${w.party ?? '?'}+${spread.toFixed(1)}`,
    // Only an unknown party among the top two can mis-sign the margin; ignore the rest.
    unresolved: [...new Set(unresolved.filter(n => n === w.cand || n === l.cand))],
  };
}

export const isGeneral = (r) => /^GEN$/i.test((r.stage || '').trim());
export const isRunoff  = (r) => /RUNOFF/i.test((r.stage || '').trim());
export const twoParty  = (g, d) => (g + d ? ((g - d) / (g + d)) * 100 : null);
