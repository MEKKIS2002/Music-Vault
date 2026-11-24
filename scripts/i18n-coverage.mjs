#!/usr/bin/env node
// i18n-coverage.mjs — finner norsk standardtekst i koden som mangler engelsk i
// js/i18n-en.js. Advarsel, ikke feil: kjøres av check.mjs (og alene med --list
// for hele lista). Heuristikk: strenger med æøå eller vanlige norske UI-ord.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const norm = s => String(s).replace(/\s+/g, ' ').trim();

// Last ordboken med en enkel mvI18n-erstatning
const dict = new Set(), pats = [], prefixes = [];
const I = {
  add: o => Object.keys(o).forEach(k => dict.add(norm(k))),
  pat: l => l.forEach(([src]) => { const parts = norm(src).split(/\{#?\d+\}/); pats.push(new RegExp('^' + parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.*?)') + '$')); }),
  prefix: o => Object.keys(o).forEach(k => prefixes.push(norm(k))),
  t: s => s,
};
vm.runInNewContext(readFileSync(join(root, 'js/i18n-en.js'), 'utf8'), { window: { mvI18n: I } });
const covered = s => dict.has(s) || pats.some(r => r.test(s)) || prefixes.some(p => s.startsWith(p));

const NO = /[æøåÆØÅ]|\b(ikke|lagre|slett|legg til|vis|ingen|skriv|velg|åpne|lukk|laster|mangler|kunne|låt|låter|sang|sanger|tekst|lydfil|seksjon|ferdig|siste|tilbake)\b/i;
const CODEY = /[{};=<>]|=>|\$\{|^\W*$|^[\w.-]+$|https?:|var\(|rgb|\\u|\.replace\(|,"$/;
const SKIP_FILES = new Set(['i18n-en.js', 'i18n.js', 'changelog.js', 'writing-tools.js', 'config.js']);
const found = new Map();
// Biter av sammensatte tekster («… » er nå …», «— klikk …», «3 offentlige låter») dekkes av mønstre når appen kjører
const FRAGMENT = /^[»—–·,.:)]|«$|^(offentlig låt|offentlige låter)$/;
const add = (s, f) => { s = norm(s); if (FRAGMENT.test(s)) return; if (s.length < 3 || s.length > 220 || !NO.test(s) || CODEY.test(s) || covered(s)) return; if (!found.has(s)) found.set(s, f); };

for (const f of readdirSync(join(root, 'js')).filter(f => f.endsWith('.js') && !SKIP_FILES.has(f))) {
  const src = readFileSync(join(root, 'js', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/console\.\w+\([^)]*\)/g, '');
  for (const m of src.matchAll(/'([^'\n\\]{3,220})'|"([^"\n\\]{3,220})"/g)) {
    const s = m[1] ?? m[2]; if (/<[a-z]/i.test(s)) s.replace(/<[^>]*>/g, '\u0000').split('\u0000').forEach(p => add(p, f)); else add(s, f);
  }
  for (const m of src.matchAll(/>([^<>`${}\n]{3,200})</g)) add(m[1], f);              // tekst mellom tagger i maler
  for (const m of src.matchAll(/(?:placeholder|title|aria-label)="([^"$]{3,200})"/g)) add(m[1], f);
}
const html = readFileSync(join(root, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
for (const m of html.matchAll(/>([^<>]{3,200})</g)) add(m[1], 'index.html');
for (const m of html.matchAll(/(?:placeholder|title|aria-label)="([^"]{3,200})"/g)) add(m[1], 'index.html');

const list = [...found].sort((a, b) => a[1].localeCompare(b[1]));
if (process.argv.includes('--list')) { for (const [s, f] of list) console.log(`${f}\t${s}`); }
console.log(`${list.length}`);
