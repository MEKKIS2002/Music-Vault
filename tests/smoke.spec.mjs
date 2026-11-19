// Røyktester: siden laster uten JS-feil, alle egne filer svarer, låseskjermen
// vises, og lys modus/aksent virker. Innlogget kontrastsjekk kjører bare når
// MV_TEST_USER og MV_TEST_PASSWORD er satt (GitHub-secrets for en egen testbruker).
import { test, expect } from '@playwright/test';

const ownFile = (url) => /127\.0\.0\.1:4173\/(css|js)\//.test(url);

function collect(page){
  const errors = [], bad = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('response', r => { if (ownFile(r.url()) && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  return { errors, bad };
}

test('appen laster uten JS-feil og alle css/js svarer', async ({ page }) => {
  const { errors, bad } = collect(page);
  await page.goto('/index.html');
  await expect(page.locator('#lockScreen')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(bad, 'egne filer som feilet').toEqual([]);
  expect(errors, 'JS-feil ved oppstart').toEqual([]);
});

test('lys modus: krem bakgrunn, låseskjermen forblir mørk', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mv_theme', 'light'));
  await page.goto('/index.html');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyBg).toBe('rgb(245, 239, 228)');
  // Låseskjermen er et mørkt vinylmotiv også i lys modus — teksten må være lys.
  const lockText = await page.evaluate(() => getComputedStyle(document.querySelector('#lockScreen')).color);
  expect(lockText).toBe('rgb(244, 234, 220)');
});

test('aksentfarge krever PRO: uten innlogging brukes oransje', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mv_accent', 'bla'));
  await page.goto('/index.html');
  await expect(page.locator('html')).not.toHaveAttribute('data-accent', /.+/);
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  expect(accent).toBe('#d68155');
});

test('delingssiden for mixtape tåler ugyldig lenke', async ({ page }) => {
  const { errors } = collect(page);
  await page.goto('/mixtape.html?t=finnes-ikke');
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});

// ── Innlogget: kontrast på alle faner i lys modus ──────────────────────────
const USER = process.env.MV_TEST_USER, PASS = process.env.MV_TEST_PASSWORD;
test('lys modus: ingen uleselig tekst på noen fane (innlogget)', async ({ page }, info) => {
  test.skip(!USER || !PASS, 'MV_TEST_USER/MV_TEST_PASSWORD ikke satt');
  test.skip(info.project.name !== 'desktop', 'kjøres bare på desktop');
  await page.addInitScript(() => localStorage.setItem('mv_theme', 'light'));
  await page.goto('/index.html');
  await page.fill('#adminUsername', USER);
  await page.fill('input[type="password"]', PASS);
  await page.keyboard.press('Enter');
  await expect(page.locator('#lockScreen')).toBeHidden({ timeout: 20_000 });
  await page.waitForFunction(() => window.state && window.state.beats);
  const problems = await page.evaluate(async () => {
    const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
    const blend = (t, u) => { const a = t[3]; return [t[0] * a + u[0] * (1 - a), t[1] * a + u[1] * (1 - a), t[2] * a + u[2] * (1 - a), 1]; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const pageBg = parse(getComputedStyle(document.body).backgroundColor);
    const effBg = el => { const chain = []; let e = el; while (e && e.nodeType === 1) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null; const c = parse(cs.backgroundColor); if (c && c[3] > 0) chain.push(c); if (c && c[3] >= .999) break; e = e.parentElement; } let bg = [...pageBg]; for (let i = chain.length - 1; i >= 0; i--) bg = blend(chain[i], bg); return bg; };
    const out = [];
    for (const btn of document.querySelectorAll('.tab-btn[data-tab]')) {
      btn.click(); await new Promise(r => setTimeout(r, 900));
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim().length > 1 ? 1 : 2 });
      let n; while ((n = w.nextNode())) {
        const el = n.parentElement; if (!el || el.closest('#lockScreen,script,style,[disabled]')) continue;
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
        let op = 1, e = el; while (e && e.nodeType === 1) { op *= parseFloat(getComputedStyle(e).opacity) || 1; e = e.parentElement; }
        if (op < .99) continue;                                   // under inn-toning
        const bg = effBg(el); const fg = parse(getComputedStyle(el).color); if (!bg || !fg) continue;
        const cr = ratio(blend(fg, bg), bg);
        if (cr < 3) out.push(`${btn.dataset.tab}: ${cr.toFixed(2)}:1 «${n.nodeValue.trim().slice(0, 30)}» (${el.className || el.tagName})`);
      }
    }
    return out;
  });
  expect(problems, 'tekst med kontrast under 3:1 i lys modus').toEqual([]);
});
