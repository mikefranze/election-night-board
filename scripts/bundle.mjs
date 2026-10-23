/**
 * Inlines build/data.json into src/dashboard.template.html and writes a single
 * self-contained index.html. No server, no build step at view time: open
 * the file from disk and it fetches live results from civicAPI directly.
 */
import fs from 'node:fs';
import path from 'node:path';

const R = (...p) => path.join(process.cwd(), ...p);

const tpl = fs.readFileSync(R('src/dashboard.template.html'), 'utf8');
const data = fs.readFileSync(R('build/data.json'), 'utf8');

JSON.parse(data); // fail loudly rather than shipping a broken page

// A literal "</script>" or "<!--" inside the inlined JSON would end the script
// element early, so escape "<" into a form that is identical once parsed.
const safe = data.replace(/</g, '\\u003c');

if (!tpl.includes('__DATA_JSON__')) throw new Error('template is missing the __DATA_JSON__ placeholder');
const out = tpl.replace('__DATA_JSON__', safe);

if (out.includes('__DATA_JSON__')) throw new Error('placeholder was not fully replaced');

fs.writeFileSync(R('index.html'), out);
const kb = (s) => (s / 1024).toFixed(0) + ' KB';
console.log(`index.html written — ${kb(Buffer.byteLength(out))} (template ${kb(tpl.length)} + data ${kb(safe.length)})`);
