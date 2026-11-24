#!/usr/bin/env node
// check.mjs — rask statisk sjekk (ingen nettleser). Kjøres i CI på hver PR og
// lokalt med `npm run check`. Hver regel tilsvarer en feil som faktisk har
// skjedd, så den ikke kan komme tilbake ubemerket.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ls = (dir, ext) => existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter(f => f.endsWith(ext)).map(f => `${dir}/${f}`) : [];
const read = (f) => readFileSync(join(root, f), 'utf8');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

const errors = [];
const fail = (rule, file, line, msg) => errors.push(`✗ [${rule}] ${file}${line ? ':' + line : ''} — ${msg}`);

const css = ls('css', '.css');
const js = [...ls('js', '.js'), ...ls('worker', '.js'), 'sw.js'].filter(f => existsSync(join(root, f)));

// 1) Syntaks i alle JS-filer (worker er en ES-modul)
for (const f of js) {
  try { execFileSync(process.execPath, ['--check', join(root, f)], { stdio: 'pipe' }); }
  catch (e) {
    if (f.startsWith('worker/') && /import|export/.test(String(e.stderr))) continue;   // ESM — sjekkes av wrangler
    fail('syntaks', f, 0, String(e.stderr).split('\n').find(l => /Error/.test(l)) || 'syntaksfeil');
  }
}

// 2) Variabler som peker på seg selv (--accent: var(--accent)) gjør tokenet ugyldig
for (const f of [...css, ...js]) {
  const s = read(f);
  for (const m of s.matchAll(/(--[a-z0-9-]+)\s*:\s*var\(\1\)/g)) fail('sirkel-variabel', f, lineOf(s, m.index), m[0]);
}

// 3) Vinylriller må ha faste farger — tema-tokens ga striper i lys modus
for (const f of css) {
  const s = read(f);
  for (const m of s.matchAll(/repeating-radial-gradient\(/g)) {
    let j = m.index + m[0].length, depth = 1;           // bare selve gradient-kallet
    while (depth && j < s.length) { depth += s[j] === '(' ? 1 : s[j] === ')' ? -1 : 0; j++; }
    if (/var\(--(bg|surface-[0-9]|surface-sunken|panel|raised)\)/.test(s.slice(m.index, j)))
      fail('vinyl-tema', f, lineOf(s, m.index), 'tema-flate i repeating-radial-gradient (vinylriller skal ha faste farger)');
  }
}

// 4) Frittstående eksportsider laster ikke tokens.css → ingen var(--…) der
for (const f of ['js/app.js', 'js/lyriclab.js'].filter(f => existsSync(join(root, f)))) {
  const s = read(f);
  for (const m of s.matchAll(/`<!DOCTYPE html>[\s\S]*?<\/html>`/g)) {
    const inner = m[0];
    const own = new Set([...inner.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(x => x[1]));    // malens egne variabler
    const RUNTIME = new Set(['--progress', '--ic']);   // satt av JS / icons.css som malen laster
    for (const v of inner.matchAll(/var\((--[a-z0-9-]+)\s*([,)])/g)) {
      if (v[2] === ',') continue;                       // har reserveverdi
      if (!own.has(v[1]) && !RUNTIME.has(v[1])) fail('eksportmal-tokens', f, lineOf(s, m.index + v.index), `${v[1]} er ikke definert i den frittstående malen (tokens.css er ikke lastet der)`);
    }
  }
}

// 5) Hardkodet oransje som TEKSTFARGE — skal følge valgt aksent (--accent-ink/--accent2)
const ORANGE = /#(d68155|f0a579|b9683f|ffc079|ffd284|f4c17e|f0c77f|ffcf8a|ffc070)\b/i;
for (const f of css.filter(f => !/tokens\.css$/.test(f))) {
  const s = read(f);
  for (const m of s.matchAll(/(?<![-\w])color\s*:\s*([^;}\n]*)/g)) {
    if (ORANGE.test(m[1])) fail('aksent-tekst', f, lineOf(s, m.index), `hardkodet oransje tekst: ${m[0].trim()}`);
  }
}

// 5b) Ingen konfliktmarkører etter merge (har skjedd: <<<<<<< i share.html)
for (const f of [...css, ...js, ...['index.html', 'share.html', 'mixtape.html', 'artist.html'].filter(f => existsSync(join(root, f)))]) {
  const s = read(f);
  for (const m of s.matchAll(/^(<{7}|={7}|>{7})( |$)/gm)) fail('konfliktmarkør', f, lineOf(s, m.index), 'uløst merge-konflikt');
}

// 5c) Norsk standardtekst uten engelsk oversettelse (advarsel — se scripts/i18n-coverage.mjs --list)
try {
  const n = Number(execFileSync(process.execPath, [join(root, 'scripts/i18n-coverage.mjs')], { encoding: 'utf8' }).trim().split('\n').pop());
  if (n > 0) console.warn(`⚠ ${n} norske tekster mangler engelsk i js/i18n-en.js — kjør \`node scripts/i18n-coverage.mjs --list\`.`);
} catch (e) { console.warn('⚠ i18n-dekning kunne ikke sjekkes:', String(e.message || e).split('\n')[0]); }

// 6) ?v= i HTML skal være oppdatert (deploy setter det uansett, men lokalt bør det stemme)
try { execFileSync(process.execPath, [join(root, 'scripts/version-assets.mjs'), '--check'], { stdio: 'pipe' }); }
catch (e) { console.warn('⚠ ?v= er ikke oppdatert lokalt — kjør `node scripts/version-assets.mjs` (deploy gjør det automatisk).'); }

if (errors.length) { console.error(errors.join('\n')); console.error(`\n${errors.length} feil.`); process.exit(1); }
console.log(`✓ Statisk sjekk OK (${js.length} JS-filer, ${css.length} CSS-filer).`);
