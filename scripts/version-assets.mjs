#!/usr/bin/env node
// version-assets.mjs — setter ?v= i HTML-filene til en hash av filinnholdet.
//
// Hvorfor: nettleseren og service workeren (sw.js) mellomlagrer css/js etter
// full adresse inkludert ?v=. Før ble ?v= satt for hånd — glemte man det, fikk
// brukerne en blanding av gamle og nye filer. Nå:
//   • ny fil  → ny hash → ny adresse → hentes på nytt
//   • uendret → samme hash → beholdes fra lageret
//
// Kjøres automatisk i .github/workflows/deploy.yml før opplasting.
// Lokalt (valgfritt):  node scripts/version-assets.mjs        (skriver filene)
//                      node scripts/version-assets.mjs --check (feiler hvis utdatert)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html', 'mixtape.html', 'share.html', 'artist.html'];
const check = process.argv.includes('--check');
const ref = /((?:href|src)=["'])([^"'?#:]+)\?v=[^"'&#]*/g;   // bare lokale stier (ingen «:»)

const hashes = new Map();
const hashOf = (rel) => {
  if (!hashes.has(rel)) {
    const p = join(root, rel);
    hashes.set(rel, existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 10) : null);
  }
  return hashes.get(rel);
};

let changedPages = 0, refs = 0;
const missing = new Set();
for (const page of pages) {
  const file = join(root, page);
  if (!existsSync(file)) continue;
  const before = readFileSync(file, 'utf8');
  const after = before.replace(ref, (m, attr, path) => {
    const h = hashOf(path.replace(/^\.\//, ''));
    if (!h) { missing.add(path); return m; }
    refs++;
    return `${attr}${path}?v=${h}`;
  });
  if (after !== before) {
    changedPages++;
    if (!check) writeFileSync(file, after);
    else console.error(`Utdatert ?v= i ${page}`);
  }
}
if (missing.size) console.warn('Fant ikke (beholdt som de var):', [...missing].join(', '));
console.log(`${refs} referanser sjekket, ${changedPages} side(r) ${check ? 'utdatert' : 'oppdatert'}.`);
if (check && changedPages) process.exit(1);
