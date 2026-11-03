/**
 * One command for the whole rebuild: `npm run build`, or `node scripts/build.mjs`.
 *
 * Editing data/polling_averages.csv does nothing on its own. The data is frozen
 * into index.html at build time, so build_data.mjs and bundle.mjs BOTH have to
 * run, in that order, and forgetting the second one leaves a page that looks
 * updated in the repo and is not. That is roadmap 0.3, and it is a thing to get
 * wrong on the morning of an election while pasting in final numbers.
 *
 * So this runs both, stops if the first fails, and then says what actually
 * changed in the polling — which is the only way to tell from the output that
 * an upload landed, rather than that a build succeeded.
 *
 *   node scripts/build.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const R = (p) => path.join(process.cwd(), p);
const DATA = R('build/data.json');

const readPolling = () => {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf8')).polling || {}; }
  catch { return {}; }
};
const before = readPolling();
const hadBuild = fs.existsSync(DATA);

const run = (script) => {
  const r = spawnSync(process.execPath, [R(`scripts/${script}`)], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n✗ ${script} failed — index.html was NOT rebuilt and still holds the previous data.`);
    console.error('  Nothing is half-written: fix the error above and run this again.');
    process.exit(r.status || 1);
  }
};

run('build_data.mjs');
run('bundle.mjs');

/* ---------- what changed in the polling ---------- */
const after = readPolling();
const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
const added = [], removed = [], changed = [];
const sig = (p) => p && `${p.margin}|${p.opponent ?? ''}|${p.repCandidate ?? ''}|${p.oppCandidate ?? ''}`;
for (const k of keys) {
  if (!before[k] && after[k]) { added.push(k); continue; }
  if (before[k] && !after[k]) { removed.push(k); continue; }
  if (sig(before[k]) !== sig(after[k])) changed.push(k);
}

const byOffice = (o) => Object.keys(after).filter(k => k.startsWith(o + '/')).length;
const named = Object.values(after).filter(p => p.repCandidate && p.oppCandidate).length;

console.log('\n──────────── polling ────────────');
console.log(`loaded: ${Object.keys(after).length} rows — ${byOffice('senate')} Senate, ${byOffice('gov')} Governor, `
  + `${byOffice('house')} House${after['generic/national'] ? ', generic ballot' : ''}`);
console.log(`${named} name both candidates; the rest resolve the matchup by party`);

if (!hadBuild) {
  console.log('no previous build to compare against');
} else if (!added.length && !removed.length && !changed.length) {
  console.log('\n⚠  NOTHING CHANGED since the last build.');
  console.log('   If you just edited the CSV, the edit did not take: check you saved the right');
  console.log('   file, and that rows are not commented out with a leading #.');
} else {
  if (added.length)   console.log(`\n+ ${added.length} new: ${added.join(', ')}`);
  if (changed.length) console.log(`~ ${changed.length} changed: ${changed.map(k => `${k} ${before[k].margin} → ${after[k].margin}`).join(', ')}`);
  if (removed.length) console.log(`- ${removed.length} gone: ${removed.join(', ')}`);
}

/* ---------- is the shipped page actually current? ---------- */
const idx = R('index.html');
const stale = fs.existsSync(idx) && fs.statSync(idx).mtimeMs < fs.statSync(DATA).mtimeMs;
console.log(`\nindex.html — ${(fs.statSync(idx).size / 1024).toFixed(0)} KB, written ${new Date(fs.statSync(idx).mtimeMs).toLocaleTimeString()}`
  + (stale ? '  ⚠ OLDER THAN build/data.json' : ''));
console.log('commit and push for GitHub Pages to serve it.');
