/* Fast regression check over tests/fixtures.json (one browser, no network).
   node tests/run.js            text check: info box, chips, banner, labels, drive caption per example; diff vs tests/golden.json
   node tests/run.js --accept   save this run as the new golden
   node tests/run.js --shots [typeRegex] [--3d]   also write result frames + a contact sheet to tests/out/sheet.html
   Needs the repo served on :8765 (python3 -m http.server 8765). */
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }
const fs = require('fs'), path = require('path');
const DIR = __dirname, REPO = path.join(DIR, '..'), OUT = path.join(DIR, 'out');
const args = process.argv.slice(2), ACCEPT = args.includes('--accept'), SHOTS = args.includes('--shots'), USE3D = args.includes('--3d');
const filt = args.find(a => !a.startsWith('--')); const RX = filt ? new RegExp(filt) : null;
const FX = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures.json'), 'utf8')).filter(f => !RX || RX.test(f.type));
const THREE = '/home/claude/test3d/node_modules/three/build/three.min.js';
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });

const HARNESS = `(function(){
  var K=window.DriveCore, ov0=K.overlayState, P=window.__P, S=P.S;
  K.overlayState=function(){var r=ov0.apply(this,arguments);window.__ov=r;return r};
  function snap(){var s=window.__ov||{},fx=s.fx||{};return {box:s.co?[s.co.head||'',s.co.l1||'',s.co.l2||'',s.co.note||''].filter(Boolean):null,
    chips:(fx.chips||[]).filter(function(c){return c.a>0.5}).map(function(c){return c.text}),
    banner:fx.banner&&fx.banner.a>0.3?fx.banner.text+(fx.banner.sub?' / '+fx.banner.sub:''):null,
    labels:(s.labels||[]).map(function(l){return l.text})}}
  window.__run=function(fx,o){
    var j=fx.game; S.state='post'; S.chartDrive=null;
    var T=P.teamsOf(j), plays=P.allPlays(j), last=plays.length-1, ids={};
    for(var a=0;a<=last;a++)ids[plays[a].id]=1;
    var L=P.latestDrive(j,T,{ids:ids,plays:plays,last:last}); if(!L)return {err:'no drive'};
    var spec=P.fieldChart3D(L,true), E=o.three?window.Chart3D:window.Chart2D;
    var tgt=fx.play, rows=[]; L.rows.forEach(function(r,i){if(r.p&&r.p.id===tgt)rows.push(i)});
    var h=document.createElement('div');h.style.cssText='width:390px;position:absolute;left:0;top:0';document.body.appendChild(h);
    var ctl=E.replay(h,spec,{clock:true,linger:1}), tl=ctl.timeline;
    var seg=tl.filter(function(g){return rows.indexOf(g.row)>=0}); var g=seg.length?seg[seg.length-1]:tl[tl.length-1];
    ctl.seek(g.end+Math.min(650,Math.max(300,(g.holdEnd-g.end)-300)));
    var out=snap(); out.caption=(L.done?'Drive':'Current drive')+' · '+L.offAb+(L.done&&L.label?' · '+L.label:'');
    out.hold=Math.round(g.holdEnd-g.end); out.noRow=!seg.length;
    if(o.img){var cs=h.querySelectorAll('canvas'),c=document.createElement('canvas');c.width=cs[0].width;c.height=cs[0].height;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);cs.forEach(function(k){x.drawImage(k,0,0)});out.img=c.toDataURL('image/jpeg',0.6).split(',')[1]}
    ctl.stop();h.remove(); return out;
  };
})()`;

async function launch() {
  const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await b.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  await pg.addInitScript(() => { try { localStorage.setItem('db_delay', '0'); } catch (e) {} });
  await pg.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(THREE, 'utf8') }));
  await pg.route('https://site.api.espn.com/**', r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"events":[],"leagues":[{"calendar":[]}]}' }));
  await pg.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await pg.goto('http://localhost:8765/index.html');
  await pg.waitForFunction(() => window.Chart2D && window.DriveCore && typeof window.latestDrive === 'function', null, { timeout: 30000 });
  await pg.evaluate(() => { window.__P = { latestDrive: latestDrive, fieldChart3D: fieldChart3D, teamsOf: teamsOf, allPlays: allPlays, S: S }; });
  await pg.evaluate(HARNESS);
  return { b, pg };
}

(async () => {
  const t0 = Date.now(); let ctx = await launch(); const res = {};
  for (let k = 0; k < FX.length; k++) {
    const f = FX[k], key = f.type + '#' + f.i;
    try { res[key] = await ctx.pg.evaluate(a => window.__run(a.f, a.o), { f, o: { img: SHOTS, three: USE3D } }); }
    catch (e) { res[key] = { err: String(e.message).slice(0, 160) }; try { await ctx.b.close(); } catch (e2) {} ctx = await launch(); }
    if (res[key].img) { fs.writeFileSync(path.join(OUT, 'img', key.replace('#', '-') + '.jpg'), Buffer.from(res[key].img, 'base64')); res[key].img = true; }
    if (USE3D && k % 40 === 39) { try { await ctx.b.close(); } catch (e) {} ctx = await launch(); }
  }
  await ctx.b.close();
  fs.writeFileSync(path.join(OUT, 'latest.json'), JSON.stringify(res, null, 1));
  const errs = Object.entries(res).filter(([k, v]) => v.err);
  const gp = path.join(DIR, 'golden.json'), gold = fs.existsSync(gp) ? JSON.parse(fs.readFileSync(gp, 'utf8')) : null;
  let changed = 0;
  if (gold) for (const k of Object.keys(res)) {
    const a = JSON.stringify(strip(gold[k])), b = JSON.stringify(strip(res[k]));
    if (a !== b) { changed++; console.log('\n~ ' + k + '  (' + (FX.find(f => f.type + '#' + f.i === k) || {}).name + ')\n  was: ' + a + '\n  now: ' + b); }
  }
  console.log(`\n${FX.length} examples in ${((Date.now() - t0) / 1000).toFixed(0)} s · ${errs.length} errors` + (gold ? ` · ${changed} changed vs golden` : ' · no golden yet'));
  errs.forEach(([k, v]) => console.log('  ERROR ' + k + ': ' + v.err));
  if (ACCEPT || !gold) { const g = {}; for (const k in res) g[k] = strip(res[k]); fs.writeFileSync(gp, JSON.stringify(g, null, 1)); console.log('golden saved'); }
  if (SHOTS) sheet(res);
})();
function strip(v) { if (!v) return v; const o = Object.assign({}, v); delete o.img; return o; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function sheet(res) {
  let h = '<!DOCTYPE html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>Fixture sheet</title><style>body{font:14px system-ui;margin:12px;max-width:820px}figure{margin:0 0 18px}img{width:100%;max-width:390px;display:block}h2{font-size:16px;margin:22px 0 6px}small{color:#666}</style>';
  let fam = '';
  for (const f of FX) { const k = f.type + '#' + f.i, r = res[k] || {};
    if (f.family !== fam) { fam = f.family; h += '<h1>' + esc(fam) + '</h1>'; }
    if (f.i === 0) h += '<h2>' + esc(f.name) + ' <small>' + f.count + '×</small></h2>';
    h += '<figure><small>' + esc(f.text) + '</small>' + (r.img ? '<img src="img/' + k.replace('#', '-') + '.jpg">' : '<p>' + esc(r.err || 'no image') + '</p>') + '</figure>'; }
  fs.writeFileSync(path.join(OUT, 'sheet.html'), h); console.log('sheet: tests/out/sheet.html');
}
