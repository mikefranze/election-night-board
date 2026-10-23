/**
 * Downloads the external source datasets the build needs.
 *
 * These live under data/raw_* and are .gitignored — together they are about
 * 50 MB against roughly 1 MB for the rest of the project, and they are all
 * third-party files that can be re-fetched. Run this once after cloning:
 *
 *   node scripts/fetch_sources.mjs
 *   node scripts/fetch_index.mjs     # civicAPI race index (changes often)
 *   node scripts/build_data.mjs
 *   node scripts/bundle.mjs
 *
 * Note on MEDSL: their county-level Senate and House files sit behind a
 * Dataverse guestbook that cannot be accepted programmatically, so the House
 * file comes from a mirror and county-level Senate from pmheideman's release.
 * The statewide Senate file is not gated and comes straight from Dataverse.
 */
import fs from 'node:fs';
import path from 'node:path';

const R = (...p) => path.join(process.cwd(), ...p);

const SOURCES = [
  {
    dest: 'data/raw_pres2024/2024_US_County_Level_Presidential_Results.csv',
    url: 'https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2024_US_County_Level_Presidential_Results.csv',
    what: '2024 presidential results by county',
  },
  {
    dest: 'data/raw_pres2024/pres_by_cd_2024.csv',
    url: 'https://raw.githubusercontent.com/jaytimm/PresElectionResults/master/data-raw/2024%20Pres%20by%20CD%20-%20Main.csv',
    what: '2024 presidential results by congressional district (The Downballot, mirrored)',
  },
  {
    dest: 'data/raw_medsl/senate_1976_2024.csv',
    url: 'https://dataverse.harvard.edu/api/access/datafile/13887039?format=original',
    what: 'MEDSL U.S. Senate statewide 1976-2024',
  },
  {
    dest: 'data/raw_medsl/house_1976_2024.tsv',
    url: 'https://raw.githubusercontent.com/jaytimm/PresElectionResults/master/data-raw/1976-2024-house.tab',
    what: 'MEDSL U.S. House 1976-2024 (mirrored past the Dataverse guestbook)',
  },
  {
    dest: 'data/raw_county_senate/us_county_results_long.csv',
    url: 'https://github.com/pmheideman/us-county-election-results/releases/download/v1.0.0/us_county_results_long.csv',
    what: 'County-level President/House/Senate 1990-2024 (~45 MB)',
  },
];

let failed = 0;
for (const s of SOURCES) {
  const out = R(s.dest);
  if (fs.existsSync(out) && fs.statSync(out).size > 10_000) {
    console.log(`have   ${s.dest}`);
    continue;
  }
  process.stdout.write(`fetch  ${s.dest} … `);
  try {
    const r = await fetch(s.url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    // A guestbook refusal comes back as a small JSON blob, not a dataset.
    if (buf.length < 10_000 && buf.toString('utf8', 0, 200).includes('"status":"ERROR"')) {
      throw new Error('blocked: ' + buf.toString('utf8', 0, 160));
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    console.log(`${(buf.length / 1048576).toFixed(1)} MB`);
  } catch (e) {
    failed++;
    console.log(`FAILED — ${e.message}`);
    console.log(`       ${s.what}`);
    console.log(`       ${s.url}`);
  }
}

console.log(failed
  ? `\n${failed} source(s) failed. Download them by hand to the paths above, then re-run.`
  : '\nAll sources present. Next: node scripts/fetch_index.mjs && node scripts/build_data.mjs && node scripts/bundle.mjs');
