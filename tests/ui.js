/* UI check: the key screens at phone size, light and dark, from sample data (no network).
   node tests/ui.js            writes tests/out/ui.png (one contact sheet to look at) and prints flags
   node tests/ui.js beta       checks the beta/ folder instead of the root files
   Needs the repo served on :8765 (python3 -m http.server 8765).
   Flags: anything wider than the screen, tap targets under 44 px, controls closer than 8 px to the
   screen edge, controls still in the phone's native look, text cut off without an ellipsis. */
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }
const fs = require('fs'), path = require('path');
const DIR = __dirname, OUT = path.join(DIR, 'out'); fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8765/' + (process.argv[2] === 'beta' ? 'beta/' : '') + 'index.html';
const THREE = '/home/claude/test3d/node_modules/three/build/three.min.js';

/* Sample week from the test fixtures: two live games, three upcoming, the rest final. */
function mock() {
  const G = {};
  for (const x of JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures.json'), 'utf8'))) {
    const h = x.game.header; G[h.id] = G[h.id] || { header: h, drives: {} };
    for (const d of (x.game.drives.previous || [])) G[h.id].drives[d.id] = d;
  }
  const byWk = {}; Object.values(G).forEach(v => (byWk[v.header.week] = byWk[v.header.week] || []).push(v));
  const games = Object.values(byWk).sort((a, b) => b.length - a.length)[0].sort((a, b) => Object.keys(b.drives).length - Object.keys(a.drives).length);
  const wk = games[0].header.week, sums = {}, events = [];
  games.forEach((v, i) => {
    const c = JSON.parse(JSON.stringify(v.header.competitions[0]));
    c.competitors.forEach(t => { t.records = [{ type: 'total', summary: '6-4' }]; });
    if (i < 2) c.status = { period: 3, displayClock: '8:42', type: { state: 'in', name: 'STATUS_IN_PROGRESS', description: 'In Progress', shortDetail: '8:42 - 3rd' } };
    else if (i > games.length - 4) { c.status = { type: { state: 'pre', name: 'STATUS_SCHEDULED', shortDetail: 'Sun 7:20 PM' } }; c.competitors.forEach(t => delete t.score); }
    events.push({ id: v.header.id, date: c.date, competitions: [c], status: c.status });
    const h = JSON.parse(JSON.stringify(v.header)); h.competitions[0].status = c.status;
    sums[v.header.id] = { header: h, drives: { previous: Object.values(v.drives).sort((a, b) => a.id - b.id) }, boxscore: { teams: [], players: [] }, gameInfo: { venue: { fullName: 'Stadium' } } };
  });
  const day = n => new Date(Date.UTC(2026, 8, 10) + n * 864e5).toISOString();
  const cal = [
    { value: '1', label: 'Preseason', entries: ['Hall of Fame Weekend', 'Preseason Week 1', 'Preseason Week 2', 'Preseason Week 3'].map((l, i) => ({ value: String(i + 1), label: l, startDate: day(-35 + 7 * i) })) },
    { value: '2', label: 'Regular Season', entries: Array.from({ length: 18 }, (_, i) => ({ value: String(i + 1), label: 'Week ' + (i + 1), startDate: day(7 * i) })) },
    { value: '3', label: 'Postseason', entries: ['Wild Card', 'Divisional Round', 'Conference Championship', 'Super Bowl'].map((l, i) => ({ value: String(i + 1), label: l, startDate: day(126 + 7 * i) })) }];
  return { sb: { season: { year: 2026, type: 2 }, week: { number: wk }, events, leagues: [{ calendar: cal }] }, sums, main: games[0].header.id, wk };
}

const FLAGS = () => {
  const W = innerWidth, out = [], seen = new Set();
  const name = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '')) + (el.textContent ? ' "' + el.textContent.trim().slice(0, 24) + '"' : '');
  const shown = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight; };
  const scroller = el => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const add = (k, el) => { const s = k + ': ' + name(el); if (!seen.has(s)) { seen.add(s); out.push(s); } };
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el) || scroller(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 || r.left < -1) add('wider than the screen', el);
  }
  for (const el of document.querySelectorAll('button,a[href],select,input,summary,[role=switch]')) {
    if (!shown(el) || scroller(el) || el.closest('[aria-hidden=true]')) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const top = document.elementFromPoint(Math.min(W - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
    if (top && top !== el && !el.contains(top) && !top.contains(el)) continue; /* under a sheet or overlay */
    const lab = el.closest('label'), h = Math.max(r.height, lab ? lab.getBoundingClientRect().height : 0);
    if (h < 43.5) add('tap target ' + Math.round(h) + ' px tall', el);
    if (r.left < 8 || W - r.right < 8) { if (!el.closest('.chart,.dock,.dongview')) add('control ' + Math.round(Math.min(r.left, W - r.right)) + ' px from the edge', el); }
    if (/^(select|input)$/i.test(el.tagName) && cs.appearance !== 'none' && cs.webkitAppearance !== 'none') add('native look', el);
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el) || !el.childNodes.length || [...el.childNodes].every(n => n.nodeType !== 3 || !n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis') add('text cut off', el);
  }
  return out;
};

(async () => {
  const M = mock(), sbTxt = JSON.stringify(M.sb), b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const shots = [], flags = {};
  for (const scheme of ['light', 'dark']) {
    const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, hasTouch: true });
    pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await pg.addInitScript(fav => { localStorage.clear(); localStorage.setItem('db_delay', '45'); localStorage.setItem('db_fav', fav); localStorage.setItem('db_scores', 'true'); }, M.sb.events[0].competitions[0].competitors[0].team.abbreviation);
    if (fs.existsSync(THREE)) await pg.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(THREE, 'utf8') }));
    await pg.route('https://site.api.espn.com/**', r => { const u = r.request().url(), m = u.match(/event=(\d+)/); r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: m ? JSON.stringify(M.sums[m[1]] || {}) : sbTxt }); });
    await pg.route(/espncdn|fonts\.(googleapis|gstatic)/, r => r.request().url().includes('fonts') ? r.continue().catch(() => r.abort()) : r.abort());
    const snap = async (label, prep) => {
      if (prep) await prep(); await pg.waitForTimeout(500);
      const f = path.join(OUT, 'ui-' + scheme + '-' + label + '.png'); await pg.screenshot({ path: f });
      shots.push({ f, label: scheme + ' · ' + label }); flags[scheme + ' · ' + label] = await pg.evaluate(FLAGS);
    };
    await pg.goto(BASE); await pg.waitForTimeout(2500);
    await snap('game list');
    await snap('week picker', () => pg.click('#wkSel'));
    await pg.keyboard.press('Escape');
    await snap('settings', () => pg.click('#openSettings2'));
    await snap('teams', () => pg.click('#openTeams'));
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape');
    await pg.goto(BASE + '#g-' + M.main); await pg.waitForTimeout(5000);
    await snap('game view');
    await snap('drive list', () => pg.evaluate(() => { const d = document.querySelector('details.drive'); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } }));
    await snap('stats', () => pg.evaluate(() => { scrollTo(0, 0); document.getElementById('tabStats').click(); }));
    await pg.close();
  }
  /* One contact sheet: light row on top, dark below. */
  const n = shots.length / 2, pg = await b.newPage({ viewport: { width: n * 300, height: 1320 } });
  await pg.setContent('<body style="margin:0;background:#888;font:13px sans-serif;display:grid;grid-template-columns:repeat(' + n + ',300px)">' + shots.map(s => '<div style="padding:4px"><div style="color:#fff">' + s.label + '</div><img style="width:292px" src="data:image/png;base64,' + fs.readFileSync(s.f).toString('base64') + '"></div>').join('') + '</body>');
  await pg.waitForTimeout(300); await pg.screenshot({ path: path.join(OUT, 'ui.png'), fullPage: true });
  await b.close();
  let total = 0; for (const k in flags) { if (!flags[k].length) continue; console.log('\n' + k); flags[k].forEach(f => console.log('  - ' + f)); total += flags[k].length; }
  console.log('\n' + shots.length + ' screens · ' + total + ' flags · sheet: tests/out/ui.png');
})();
