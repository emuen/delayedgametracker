/* Delay Booth flat drive chart (Canvas 2D). Used with ?chart=2d and whenever three.js or WebGL
   isn't available. Same spec, same conventions and the same replay timeline as the 3D chart:
   the timing plan, chips, info box and banners come from drivecore.js; only the drawing is here.
   Field: seen at an angle from a low camera on the near sideline (far side narrow at the top),
   one lane per play, newest play nearest. */
(function () {
  "use strict";
  var K = window.DriveCore, EASE = K.EASE, backOut = K.backOut, clamp = K.clamp, ramp = K.ramp, DISPLAY = K.DISPLAY;
  var cache = {}, fontsReady = false, CONE = 2.6, GREY = [141, 150, 143];
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('italic 800 40px "Barlow Condensed"'), document.fonts.load('700 40px "Barlow Condensed"'), document.fonts.load('600 20px "Inter"')])
      .then(function () { fontsReady = true; cache = {}; if (window.Chart2D.onReady) window.Chart2D.onReady(); })
      .catch(function () { fontsReady = true; });
  } else fontsReady = true;

  function cvs(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function rgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (m) { var n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(hex || ""); return m ? [+m[1], +m[2], +m[3]] : [29, 63, 143];
  }
  function mix(c, k) { return "rgb(" + Math.round(c[0] + (GREY[0] - c[0]) * k) + "," + Math.round(c[1] + (GREY[1] - c[1]) * k) + "," + Math.round(c[2] + (GREY[2] - c[2]) * k) + ")"; }

  /* ---------- Geometry ---------- */
  function build(spec, W, H) {
    /* k = CSS px at a 390 px wide chart. Far sideline 76 % of the near one; the near sideline spans the
       width; the sky band under the info box holds the banner; the band below the field is only as
       tall as the "Drive start" label. */
    var u = W / 360, k = W / 390, s = W / 120, boxB = 60 * u, yT = boxB + 34 * u, yB = H - 18 * k, sF = 0.76, sN = 1.0;
    function sc(v) { return sF + (sN - sF) * v; }
    function P(f, v) { f = Math.max(-10, Math.min(110, f)); return { x: W / 2 + (f - 50) * s * sc(v), y: yT + (yB - yT) * v }; }
    /* Lanes at a fixed step (drivecore LANES): depth 0, the newest play, just inside the near sideline;
       the LANES-th lane at the far side. A play's drawing is rebuilt for the lane it's on. */
    var n = spec.rows.length, rows = [], vNear = 0.8, vStep = 0.74 / (K.LANES - 1);   /* nearest lane clear of the yard numbers */
    function vOf(depth) { return vNear - depth * vStep; }
    var laneGapPx = (yB - yT) * vStep;
    function makeRow(row, i, v) {
      var z = sc(v), yd = s * z;            /* px per yard on this lane */
      var w = Math.max(3.5 * k, Math.min(1.25 * yd, laneGapPx * 0.9)), headL = w * 1.7;
      var A = P(row.fs, v), E = P(row.fe, v), col = rgb(row.color);
      var parts = [], end = E, intCross = null, split = null;
      function line(p, q, c) { return { kind: "tube", pts: [[p.x, p.y, p.x, p.y], [q.x, q.y, q.x, q.y]], col: c || col }; }
      function curve(p, q, h, c) {
        var pts = [], cx = (p.x + q.x) / 2, cy = (p.y + q.y) / 2 - 2 * h;
        for (var k = 0; k <= 40; k++) {
          var t = k / 40, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), d = t * t;
          pts.push([a * p.x + b * cx + d * q.x, a * p.y + b * cy + d * q.y, p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t]);
        }
        return { kind: "tube", pts: pts, col: c || col, arc: true };
      }
      function measure(pt) {
        var L = 0; pt.cum = [0];
        for (var k = 1; k < pt.pts.length; k++) { L += Math.hypot(pt.pts[k][0] - pt.pts[k - 1][0], pt.pts[k][1] - pt.pts[k - 1][1]); pt.cum.push(L); }
        pt.len = L || 0.01; return pt;
      }
      function tube(pt) { parts.push(measure(pt)); }
      function cone(tip, dx, c) { parts.push({ kind: "end", tip: [tip.x, tip.y], dir: [dx, 0], len: headL * 0.6, col: c || col, size: headL, w: w, from: [tip.x - dx * headL, tip.y], to: [tip.x, tip.y] }); }
      function cross(p, c) { parts.push({ kind: "end", cross: true, tip: [p.x, p.y], len: 1, col: c || col, size: w * 1.25, w: w, from: [p.x, p.y], to: [p.x, p.y] }); }
      function dotsAlong(pt, c) { measure(pt); var gap = Math.max(w * 1.35, 3 * u), k = Math.max(4, Math.round(pt.len / gap)); parts.push({ kind: "dots", pts: pt.pts, cum: pt.cum, len: pt.len, count: k, col: c || col, w: w }); return pt; }
      function stub(at, d) { var a = P(row.fs, v); a = { x: at.x - d * 3.4 * yd, y: at.y }; tube(line(a, { x: at.x - d * CONE * 0.9 * yd, y: at.y })); cone(at, d); }
      var kick = row.type === "kick";
      function arcH(len) { return Math.max(1.6, Math.min(kick ? 17 : 12, len * (kick ? 0.36 : 0.3))) * yd * 0.85; }
      function arc(p, q, c) { return curve(p, q, arcH(Math.abs(q.x - p.x) / yd), c); }
      function X(f) { return P(f, v); }
      var aiPt = null;
      if (row.intAt != null && row.type === "air") {
        var I = X(row.intAt);
        if (Math.abs(row.intAt - row.fs) >= 1) tube(arc(A, I));
        cross({ x: I.x, y: I.y - 0.3 * yd }, rgb("#d32f2f")); intCross = parts[parts.length - 1];
        var preLen = parts.reduce(function (a2, p2) { return a2 + p2.len; }, 0), rc = rgb(row.retColor || "#8f1d1d");
        var rd = row.fe >= row.intAt ? 1 : -1, rl = Math.abs(row.fe - row.intAt);
        if (rl > CONE * 1.1) tube(line(I, X(row.fe - rd * CONE * 0.9), rc));
        if (rl >= 1) cone(E, rd, rc);
        end = E; split = preLen / (parts.reduce(function (a2, p2) { return a2 + p2.len; }, 0) || 1);
      } else if (row.type === "dot") { stub(A, row.dir || 1); end = A; }
      else if (row.type === "air" || row.type === "inc" || kick) {
        var cF = row.fc != null ? row.fc : row.fe, C = X(cF), airLen = Math.abs(cF - row.fs);
        var glen = row.fc != null ? Math.abs(row.fe - row.fc) : 0, hasRun = glen > CONE * 1.1;
        if (row.type === "inc") { aiPt = dotsAlong(arc(A, C)); cross({ x: C.x, y: C.y - 0.3 * yd }); end = C; }
        else if (airLen < 1) {
          var dg = row.fe >= row.fs ? 1 : -1;
          if (Math.abs(row.fe - row.fs) > CONE * 1.1) tube(line(A, X(row.fe - dg * CONE * 0.9)));
          cone(E, dg); end = E;
        } else if (hasRun) {
          tube(arc(A, C)); var g = row.fe >= row.fc ? 1 : -1;
          tube(line(C, X(row.fe - g * CONE * 0.9))); cone(E, g); end = E;
          split = parts[0].len / parts.reduce(function (a2, p2) { return a2 + p2.len; }, 0);
        } else {
          var tipF = row.fc != null ? row.fe : cF, tip = X(tipF), d2 = tipF >= row.fs ? 1 : -1, span = Math.abs(tipF - row.fs);
          if (span < 1) { stub(tip, row.dir || 1); end = tip; }
          else { tube(arc(A, X(tipF - d2 * Math.min(CONE * 0.85, span * 0.35)))); cone(tip, d2); end = tip; }
        }
      } else {
        var d = row.fe >= row.fs ? 1 : -1;
        if (Math.abs(row.fe - row.fs) > CONE * 1.1) tube(line(A, X(row.fe - d * CONE * 0.9)));
        cone(E, d);
      }
      /* Replay-only pieces (never drawn in the still image). */
      var solid = aiPt ? { pts: aiPt.pts, cum: aiPt.cum, len: aiPt.len, col: col } : null, ghost = null, missX = null;
      if (row.prePlay) {
        var keep = parts, pp = row.prePlay, gd = row.dir || 1, G = { x: A.x + gd * pp.len * yd, y: A.y }, gcol = rgb(row.ghostColor || "#1d3f8f");
        parts = [];
        if (pp.type === "inc") { var ga = dotsAlong(arc(A, G, gcol), gcol); cross({ x: G.x, y: G.y - 0.3 * yd }, gcol); ghost = { solid: { pts: ga.pts, cum: ga.cum, len: ga.len, col: gcol } }; }
        else if (Math.abs(pp.len) < 1) stub(A, gd);
        else {
          var gdir = pp.len > 0 ? gd : -gd;
          if (pp.type === "air") { tube(arc(A, { x: G.x - gdir * Math.min(CONE * 0.85, Math.abs(pp.len) * 0.35) * yd, y: A.y }, gcol)); cone(G, gdir, gcol); }
          else { if (Math.abs(pp.len) > CONE * 1.1) tube(line(A, { x: G.x - gdir * CONE * 0.9 * yd, y: A.y }, gcol)); cone(G, gdir, gcol); }
        }
        parts.forEach(function (p) { p.col = gcol; });
        ghost = Object.assign(ghost || {}, { parts: parts, A: A, inc: pp.type === "inc", end: G, col: gcol });
        parts = keep;
      }
      if (row.fgMiss) missX = { at: [E.x, E.y - 2.5 * yd * 0.62], size: w * 1.6, w: w * 1.2 };
      return { parts: parts, A: A, end: end, v: v, yd: yd, w: w, col: col, split: split, intCross: intCross, solid: solid, ghost: ghost, missX: missX, alpha: 1,
        label: row.label ? { p: { x: end.x, y: end.y }, z: v, dir: end.x > A.x ? 1 : end.x < A.x ? -1 : (row.dir || 1), text: row.label } : null };
    }
    /* Built on the near lane first: that's where each play is animated (the plan reads split etc. from it). */
    spec.rows.forEach(function (row, i) { rows.push(makeRow(row, i, vOf(0))); });
    /* Put play k on its lane (depth 0 = nearest); returns how visible it is (fades past the far lane). */
    function place(k, depth, alpha) {
      var a = alpha != null ? alpha : K.laneAlpha(depth), v = vOf(depth);
      if (Math.abs(rows[k].v - v) > 1e-6) rows[k] = makeRow(spec.rows[k], k, v);
      rows[k].alpha = a; rows[k].depth = depth; return a;
    }
    var startAt = null, tb = spec.start && spec.start.tb && spec.start.tb.row != null && rows[spec.start.tb.row] ? spec.start.tb : null;
    if (spec.start && spec.start.f != null) startAt = P(spec.start.f, 0.99);
    /* Touchback dashes ride on the kick's lane. */
    function tbLine(shown) {
      if (!tb || !shown) return null; var r = rows[tb.row]; if (!(r.alpha > 0)) return null;
      return { a: P(tb.from, r.v), b: P(spec.start.f, r.v), alpha: r.alpha };
    }
    /* A fraction (0..1) of one play, revealed along its path (same share-by-length rule as 3D). */
    function reveal(r, frac) {
      var total = r.parts.reduce(function (a, p) { return a + p.len; }, 0) || 1, done = frac * total;
      r.parts.forEach(function (p) { p.f = Math.max(0, Math.min(1, done / p.len)); done -= p.len; });
    }
    function along(p, f) {
      var L = f * p.len, k = 1; while (k < p.cum.length - 1 && p.cum[k] < L) k++;
      var a = p.pts[k - 1], b = p.pts[k], seg = (p.cum[k] - p.cum[k - 1]) || 1, t = clamp((L - p.cum[k - 1]) / seg, 0, 1);
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, gx: a[2] + (b[2] - a[2]) * t, gy: a[3] + (b[3] - a[3]) * t, tx: b[0] - a[0], ty: b[1] - a[1] };
    }
    function tipAt(r, frac) {
      var total = r.parts.reduce(function (a, p) { return a + p.len; }, 0) || 1, done = frac * total;
      for (var k = 0; k < r.parts.length; k++) {
        var p = r.parts[k], f = done / p.len;
        if (f <= 1 || k === r.parts.length - 1) {
          f = Math.max(0, Math.min(1, f));
          if (p.pts) return along(p, f);
          var x = p.from[0] + (p.to[0] - p.from[0]) * f, y = p.from[1] + (p.to[1] - p.from[1]) * f;
          return { x: x, y: y, gx: x, gy: y, tx: p.to[0] - p.from[0], ty: 0 };
        }
        done -= p.len;
      }
      return { x: r.A.x, y: r.A.y, gx: r.A.x, gy: r.A.y, tx: 1, ty: 0 };
    }
    /* Long-drive modes: "off" lanes may go above the far edge until just under the info box. */
    var yCap = 78 * u, cap = spec.laneMode === "off" ? (vNear - (yCap - yT) / (yB - yT)) / vStep : 0;
    /* "summary": one thin, dimmer arrow on the farthest lane, drive start -> first play shown on its own. */
    function summaryDraw(x, st) {
      if (!st || !(st.alpha > 0)) return null;
      var v = vOf(st.depth), yd = s * sc(v), lw = Math.max(3.5 * k, Math.min(1.25 * yd, laneGapPx * 0.9)), w = Math.max(2.5 * k, lw * 0.55);
      var a = P(st.f0, v), b = P(st.f1, v), d = st.f1 >= st.f0 ? 1 : -1, L = Math.abs(b.x - a.x), hl = w * 1.9;
      x.save(); x.globalAlpha = 0.6 * st.alpha; x.lineCap = "round";
      x.strokeStyle = x.fillStyle = mix(rgb(st.color), 0.15);
      if (L > hl) { x.lineWidth = w; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x - d * hl * 0.9, b.y); x.stroke(); }
      if (L >= yd) { x.beginPath(); x.moveTo(b.x, b.y); x.lineTo(b.x - d * hl, b.y - hl * 0.55); x.lineTo(b.x - d * hl, b.y + hl * 0.55); x.closePath(); x.fill(); }
      x.restore();
      return { p: { x: b.x, y: b.y }, z: v, dir: d, text: st.text, a: st.alpha };
    }
    return {
      cap: cap, yCap: yCap, summaryDraw: summaryDraw,
      W: W, H: H, u: u, k: k, s: s, P: P, bannerY: (boxB + yT) / 2 / H, bannerScale: 0.9, sc: sc, yT: yT, yB: yB, rows: rows, reveal: reveal, tipAt: tipAt, along: along,
      startAt: startAt, startLabel: spec.start && spec.start.label, tbLine: tbLine, place: place, tbRow: tb ? tb.row : -1,
      labelOf: function (k) { var r = rows[k], l = r.label; if (!l || !(r.alpha > 0)) return null; return { p: l.p, z: l.z, dir: l.dir, text: l.text, a: r.alpha }; },
      scr: function (p) { return [p.x, p.y]; },
      laneShift: function (l) { return { x: l.p.x, y: l.p.y + laneGapPx }; }
    };
  }

  /* ---------- Drawing ---------- */
  function background(spec, B) {
    var W = B.W, H = B.H, c = cvs(W, H), x = c.getContext("2d"), P = B.P, u = B.u;
    var g = x.createLinearGradient(0, 0, 0, B.yT); g.addColorStop(0, "#3f8fd8"); g.addColorStop(0.75, "#9fd0f2"); g.addColorStop(1, "#d9eefb");
    x.fillStyle = g; x.fillRect(0, 0, W, B.yT + 1);
    x.fillStyle = "rgba(255,255,255,0.35)";
    [[0.18, 0.34, 0.11, 0.012], [0.72, 0.3, 0.14, 0.01], [0.55, 0.37, 0.08, 0.009]].forEach(function (e) { x.beginPath(); x.ellipse(e[0] * W, e[1] * H, e[2] * W, e[3] * W, 0, 0, Math.PI * 2); x.fill(); });
    x.fillStyle = "#2f6a2c"; x.fillRect(0, B.yT, W, H - B.yT);   /* turf around the field */
    if (spec.laneMode === "off") {   /* a hint of ground behind the far sideline for plays slid past it */
      var gg = x.createLinearGradient(0, B.yCap, 0, B.yT); gg.addColorStop(0, "rgba(43,93,41,0)"); gg.addColorStop(1, "rgba(43,93,41,0.55)");
      x.fillStyle = gg; x.fillRect(0, B.yCap, W, B.yT - B.yCap);
    }
    function quad(f1, f2, fill) { var a = P(f1, 0), b = P(f2, 0), cc = P(f2, 1), d = P(f1, 1); x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.lineTo(cc.x, cc.y); x.lineTo(d.x, d.y); x.closePath(); x.fillStyle = fill; x.fill(); }
    for (var f = 0; f < 100; f += 10) quad(f, f + 10, (f / 10) % 2 ? "#5aa64f" : "#4f9a46");
    function ez(t, f1, f2, flip) {
      quad(f1, f2, t.bg);
      var fc = (f1 + f2) / 2, a = P(fc, 0.96), b = P(fc, 0.06), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      var ang = Math.atan2(b.y - a.y, b.x - a.x); if (flip) ang += Math.PI;
      var len = Math.hypot(b.x - a.x, b.y - a.y), word = String(t.name || "").toUpperCase(), fs = Math.min(7.4 * B.s * B.sc(0.5) * 0.9, len / Math.max(3, word.length) * 1.55);
      x.save(); x.translate(mx, my); x.rotate(ang); x.font = "italic 800 " + Math.round(fs) + "px " + DISPLAY; x.fillStyle = t.ink; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(word, 0, fs * 0.04); x.restore();
    }
    ez(spec.away, -10, 0, false); ez(spec.home, 100, 110, true);
    x.strokeStyle = "#fff";
    for (f = 0; f <= 100; f += 5) {
      var big = f % 10 === 0, a = P(f, 0), b = P(f, 1);
      x.globalAlpha = f === 0 || f === 100 ? 0.95 : big ? 0.7 : 0.42; x.lineWidth = (f === 0 || f === 100 ? 0.9 : big ? 0.5 : 0.32) * B.s * 0.45;
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
    }
    x.globalAlpha = 0.45; x.lineWidth = 0.22 * B.s * 0.45;
    for (var hm = 1; hm < 100; hm++) { if (hm % 5 === 0) continue; [0.38, 0.62].forEach(function (v) { var q = P(hm, v), h = 0.5 * B.s * B.sc(v) * 0.45; x.beginPath(); x.moveTo(q.x, q.y - h); x.lineTo(q.x, q.y + h); x.stroke(); }); }
    x.globalAlpha = 0.9; x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "alphabetic";
    for (f = 10; f < 100; f += 10) {
      var lab = String(f <= 50 ? f : 100 - f), q = P(f, 0.985), z = B.sc(0.985), npx = Math.max(12 * B.k / 0.72, 6.4 * B.s * z);
      x.save(); x.translate(q.x, q.y); x.scale(0.78, 0.72); x.font = "italic 800 " + Math.round(npx) + "px " + DISPLAY; x.fillText(lab, 0, 0); x.restore();
    }
    x.globalAlpha = 1;
    return c;
  }
  function fieldLine(x, B, f, color, wYd) {
    var a = B.P(f, 0), b = B.P(f, 1);
    x.strokeStyle = color; x.lineWidth = Math.max(1.4 * B.u, wYd * B.s * 0.8); x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
  }
  function ribbonPath(x, p, f) {
    var L = f * p.len; x.beginPath(); x.moveTo(p.pts[0][0], p.pts[0][1]);
    for (var k = 1; k < p.pts.length; k++) {
      if (p.cum[k] <= L) x.lineTo(p.pts[k][0], p.pts[k][1]);
      else { var a = p.pts[k - 1], b = p.pts[k], t = (L - p.cum[k - 1]) / ((p.cum[k] - p.cum[k - 1]) || 1); x.lineTo(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); break; }
    }
  }
  /* A play's pieces: ribbon (shadow, colour, highlight), arrowheads, dots, X. */
  function drawParts(x, r, parts, dim, alpha, scaleOf) {
    if (alpha <= 0) return;
    x.save(); x.globalAlpha = (1 - 0.35 * dim) * alpha; x.lineCap = "round"; x.lineJoin = "round";
    parts.forEach(function (p) {
      var f = p.f == null ? 1 : p.f; if (f <= 0) return;
      var c = mix(p.col, 0.25 * dim);
      if (p.kind === "tube") {
        ribbonPath(x, p, f);
        x.save(); x.translate(0, r.w * 0.3); x.strokeStyle = "rgba(0,0,0,0.28)"; x.lineWidth = r.w + 0.9 * B0(r); x.stroke(); x.restore();
        x.strokeStyle = c; x.lineWidth = r.w; x.stroke();
        x.save(); x.translate(0, -r.w * 0.22); x.strokeStyle = "rgba(255,255,255,0.33)"; x.lineWidth = r.w * 0.32; x.stroke(); x.restore();
      } else if (p.kind === "dots") {
        var k = Math.round(f * p.count); x.fillStyle = c;
        for (var j = 0; j < k; j++) { var q = alongPts(p, (j + 0.5) / p.count); x.beginPath(); x.arc(q[0], q[1], r.w * 0.42, 0, Math.PI * 2); x.fill(); }
      } else if (f >= 1) {
        var sc = scaleOf ? scaleOf(p) : 1; if (sc <= 0) return;
        x.save(); x.translate(p.tip[0], p.tip[1]); x.scale(sc, sc);
        if (p.cross) {
          var h = p.size * 0.5; x.strokeStyle = c; x.lineWidth = p.w * 0.55;
          x.beginPath(); x.moveTo(-h, -h); x.lineTo(h, h); x.moveTo(-h, h); x.lineTo(h, -h); x.stroke();
        } else {
          var L = p.size, wd = L * 0.62, dx = p.dir[0];
          x.beginPath(); x.moveTo(0, 0); x.lineTo(-dx * L, -wd); x.lineTo(-dx * L, wd); x.closePath();
          x.fillStyle = c; x.fill(); x.strokeStyle = "rgba(0,0,0,0.35)"; x.lineWidth = Math.max(0.6, p.w * 0.08); x.stroke();
        }
        x.restore();
      }
    });
    x.restore();
  }
  function B0(r) { return r.w * 0.12; }
  function alongPts(p, f) {
    var L = f * p.len, k = 1; while (k < p.cum.length - 1 && p.cum[k] < L) k++;
    var a = p.pts[k - 1], b = p.pts[k], t = clamp((L - p.cum[k - 1]) / ((p.cum[k] - p.cum[k - 1]) || 1), 0, 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function drawSolid(x, r, so, f, alpha) {
    if (alpha <= 0 || f <= 0) return;
    x.save(); x.globalAlpha = alpha; x.lineCap = "round"; x.lineJoin = "round";
    ribbonPath(x, so, f); x.strokeStyle = mix(so.col, 0); x.lineWidth = r.w; x.stroke(); x.restore();
  }
  function drawStart(x, spec, B, tbShown) {
    if (!spec.start || spec.start.f == null) return;
    fieldLine(x, B, spec.start.f, mix(rgb(spec.start.color || "#ffffff"), 0), 0.9);
    var tl = B.tbLine(tbShown !== false);
    if (tl) {
      var a = tl.a, b = tl.b, L = Math.abs(b.x - a.x), dir = b.x >= a.x ? 1 : -1, dash = 1.4 * B.s * 0.8, gap = 1 * B.s * 0.8;
      x.save(); x.globalAlpha = tl.alpha; x.strokeStyle = "rgba(255,255,255,0.9)"; x.lineWidth = Math.max(1.2 * B.u, 0.35 * B.s); x.setLineDash([dash, gap]);
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(a.x + dir * L, b.y); x.stroke(); x.restore();
    }
  }
  function drawBall(x, B, pos, ang, sc, lifted, yd) {
    var rx = Math.max(3.2 * B.k, 0.95 * yd) * sc, ry = rx * 0.58; if (rx <= 0.2) return;
    if (lifted > 0.5) { x.fillStyle = "rgba(0,0,0,0.22)"; x.beginPath(); x.ellipse(pos.gx, pos.gy, rx * 0.9, ry * 0.45, 0, 0, Math.PI * 2); x.fill(); }
    x.save(); x.translate(pos.x, pos.y); x.rotate(ang);
    x.fillStyle = "#7a3b12"; x.strokeStyle = "rgba(255,255,255,0.85)"; x.lineWidth = Math.max(0.8, rx * 0.12);
    x.beginPath(); x.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(-rx * 0.35, 0); x.lineTo(rx * 0.35, 0); x.stroke();
    x.restore();
  }

  function render(spec) {
    var key = JSON.stringify(spec);
    if (cache[key]) return cache[key];
    var W = Math.round(spec.width), H = Math.round(spec.height), B = build(spec, W, H), out = cvs(W, H), x = out.getContext("2d");
    /* Newest play nearest; each earlier play one lane further. */
    var nR = B.rows.length;
    for (var k = 0; k < nR; k++) {
      if (spec.laneMode) { var ls = K.laneState(spec, k, nR - 1, 1, B.cap); B.place(k, ls.depth, ls.alpha); }
      else B.place(k, nR - 1 - k);
    }
    x.drawImage(background(spec, B), 0, 0);
    drawStart(x, spec, B);
    if (spec.ltg != null) fieldLine(x, B, spec.ltg, "#ffd23f", 0.45);
    /* Drive in progress: earlier plays stay dimmed exactly as the animation leaves them. */
    B.rows.forEach(function (r, k) {
      if (!(r.alpha > 0)) return;
      var dim = spec.focus != null && spec.focus >= 0 ? (k === spec.focus ? 0 : 0.85) : spec.dimFrom > 0 && k < spec.dimFrom ? 0.85 : 0;
      var foc = spec.focus != null && spec.focus >= 0 && k !== spec.focus;
      B.reveal(r, 1); drawParts(x, r, r.parts, foc ? 1 : dim, foc ? r.alpha * 0.55 : r.alpha);
      if (r.missX) drawX(x, r, dim, 1, r.alpha);
    });
    var sumLabel = B.summaryDraw(x, K.summaryState(spec, nR - 1, 1));
    K.drawOverlay(x, W, H, B, B.rows.map(function (r, k) { return B.labelOf(k); }).filter(Boolean).concat(sumLabel ? [sumLabel] : []), spec.callout, null);
    var url = out.toDataURL("image/jpeg", 0.9);
    var keys = Object.keys(cache); if (keys.length > 20) delete cache[keys[0]];
    cache[key] = url;
    return url;
  }
  function drawX(x, r, dim, sc, alpha) {
    var m = r.missX; x.save(); x.globalAlpha = (1 - 0.35 * dim) * (alpha == null ? 1 : alpha); x.translate(m.at[0], m.at[1]); x.scale(sc, sc);
    var h = m.size * 0.5; x.strokeStyle = mix(rgb("#d32f2f"), 0.35 * dim); x.lineWidth = m.w * 0.6; x.lineCap = "round";
    x.beginPath(); x.moveTo(-h, -h); x.lineTo(h, h); x.moveTo(-h, h); x.lineTo(h, -h); x.stroke(); x.restore();
  }

  /* ---------- Replay (same timeline and beats as the 3D chart) ---------- */
  /* Where each play sits on screen in the still image, so a tap can be matched to a lane. */
  function hits(spec) {
    var W = Math.round(spec.width), H = Math.round(spec.height), B = build(spec, W, H), nR = B.rows.length;
    for (var k = 0; k < nR; k++) {
      if (spec.laneMode) { var ls = K.laneState(spec, k, nR - 1, 1, B.cap); B.place(k, ls.depth, ls.alpha); }
      else B.place(k, nR - 1 - k);
    }
    return B.rows.map(function (r, k) { return r.alpha > 0 ? { k: k, a: [r.A.x, r.A.y], b: [r.end.x, r.end.y] } : null; });
  }
  function replay(holder, spec, opts) {
    opts = opts || {};
    var W = Math.round(spec.width), H = Math.round(spec.height), u = W / 360;
    var wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;width:100%;aspect-ratio:" + W + "/" + H + ";border-radius:6px;overflow:hidden";
    var cv = cvs(W, H); cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    wrap.appendChild(cv); holder.appendChild(wrap);
    var x = cv.getContext("2d"), B = build(spec, W, H), bg = background(spec, B);
    var linger = Math.max(0, opts.linger != null ? +opts.linger : 1) * 1000;
    var P = K.plan(spec, B, linger), segs = P.segs, fracOf = K.fracOf;
    var ltgAt = function (k) { return k >= 0 && spec.rows[k] ? spec.rows[k].ltg : null; };

    function renderAt(t) {
      var cur = K.activeAt(segs, t), g = segs[cur], s = spec.rows[cur], outro = t >= P.outro;
      var undim = outro ? EASE.out(ramp(t, P.outro, 400)) : 0;
      /* Earlier plays slide one lane back as each new play is spotted. */
      for (var q = 0; q <= cur && q < B.rows.length; q++) {
        if (spec.laneMode) { var ls = K.laneState(spec, q, cur, K.slideE(segs, cur, t), B.cap); B.place(q, ls.depth, ls.alpha); }
        else B.place(q, K.laneDepth(segs, q, cur, t));
      }
      x.drawImage(bg, 0, 0);
      /* End-zone tint on a touchdown / good field goal: ~25 %, ~300 ms. */
      if (g && !outro && (g.kind === "td" || (g.kind === "fg" && !g.miss)) && t >= g.end) {
        var env = ramp(t, g.end, 80) * (1 - ramp(t, g.end + 300, 160));
        if (env > 0) {
          var f1 = s.fe >= 50 ? 100 : -10, f2 = f1 + 10, a = B.P(f1, 0), b = B.P(f2, 0), c = B.P(f2, 1), d = B.P(f1, 1);
          x.save(); x.globalAlpha = 0.25 * env; x.fillStyle = s.color; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.lineTo(c.x, c.y); x.lineTo(d.x, d.y); x.closePath(); x.fill(); x.restore();
        }
      }
      drawStart(x, spec, B, B.tbRow >= 0 && B.tbRow <= cur);
      /* Line to gain glides to the new spot during the pre-snap beat. */
      if (outro) { if (spec.ltg != null) fieldLine(x, B, spec.ltg, "#ffd23f", 0.45); }
      else if (g) {
        var to = ltgAt(cur), from = g.cont ? to : ltgAt(cur - 1);
        if (to != null) { var e = from == null ? 1 : EASE.out(ramp(t, g.t0, 320)); fieldLine(x, B, from == null ? to : from + (to - from) * e, "#ffd23f", 0.45); }
      }
      segs.forEach(function (sg, k) {
        if (k > cur) return;
        var row = B.rows[k], f = k < cur ? 1 : k === cur ? fracOf(sg, t) : 0, la = row.alpha;
        if (!(la > 0)) return;
        B.reveal(row, f);
        var dim = K.dimOf(segs, k, cur, t, undim);
        /* Penalty: the underlying snap draws first, then fades back behind the walk-off. */
        if (row.ghost && k <= cur) {
          var gf = k === cur ? fracOf(sg, t, "g") : 1;
          B.reveal(row.ghost, gf);
          var fade = k < cur || t >= sg.walkAt ? 0.35 + 0.65 * (1 - ramp(t, sg.walkAt, 250)) : 1, gso = row.ghost.solid, gparts = row.ghost.parts;
          if (gso && k === cur && t < sg.ghostEnd) { gparts = gparts.filter(function (p) { return p.kind !== "dots"; }); drawSolid(x, row, gso, gf, la); }
          else if (gso && k === cur && t < sg.ghostEnd + 150) drawSolid(x, row, gso, 1, (1 - (t - sg.ghostEnd) / 150) * la);
          drawParts(x, row, gparts, dim, fade * (1 - undim) * la, function (p) { return k === cur && t >= sg.ghostEnd ? backOut((t - sg.ghostEnd) / 240) : 1; });
        }
        var parts = row.parts;
        /* Incomplete: solid arc in flight, dotted + X once the ball arrives (150 ms crossfade). */
        if (row.solid && k === cur && t < sg.end) { parts = parts.filter(function (p) { return p.kind !== "dots"; }); drawSolid(x, row, row.solid, f, la); }
        else if (row.solid && k === cur && t < sg.end + 150) drawSolid(x, row, row.solid, 1, (1 - (t - sg.end) / 150) * la);
        drawParts(x, row, parts, dim, la, function (p) {
          if (p === row.intCross) { var ca = sg.catchAt != null ? sg.catchAt : sg.end; return k === cur ? backOut(ramp(t, ca, 200)) * (1 + 0.6 * (1 - ramp(t, ca + 200, 350))) : 1; }
          return k === cur && t >= sg.end ? backOut((t - sg.end) / 240) : 1;
        });
        if (row.missX && (k < cur || t >= sg.end)) drawX(x, row, dim, k === cur ? backOut(ramp(t, sg.end, 240)) : 1, la);
      });
      var sumLabel = B.summaryDraw(x, K.summaryState(spec, cur, K.slideE(segs, cur, t)));
      /* Ball: spotted at the start, rides the tip of the arrow, rests where the play ended. */
      if (g && !outro) {
        var row = B.rows[cur], yd = row.yd, sc = 1, pos, ang = 0, lift = 0;
        function pt(p) { return { x: p.x, y: p.y, gx: p.x, gy: p.y }; }
        if (t < g.snap) {
          var prev = cur > 0 ? B.rows[cur - 1].end : null, m = cur === 0 || g.cont ? 1 : EASE.out(ramp(t, g.t0, 260));
          pos = prev && !g.cont ? { x: prev.x + (row.A.x - prev.x) * m, y: prev.y + (row.A.y - prev.y) * m } : pt(row.A);
          pos.gx = pos.x; pos.gy = pos.y;
          if (prev && !g.cont) { lift = Math.sin(Math.PI * m) * 1.2 * yd * 0.62; pos.y -= lift; }
          if (cur === 0) sc *= backOut(ramp(t, g.t0 + 150, 300));
        } else if (row.ghost && t < g.walkAt) {
          if (t < g.ghostEnd) { pos = B.tipAt(row.ghost, fracOf(g, t, "g")); lift = pos.gy - pos.y; if (row.ghost.inc || s.prePlay.type === "air") ang = Math.atan2(pos.ty, pos.tx); }
          else {
            var bk = EASE.out(ramp(t, g.ghostEnd + 80, 260)), ge = row.ghost.end;
            pos = { x: ge.x + (row.A.x - ge.x) * bk, y: ge.y + (row.A.y - ge.y) * bk }; pos.gx = pos.x; pos.gy = pos.y;
            lift = Math.sin(Math.PI * bk) * 1.2 * yd * 0.62; pos.y -= lift;
          }
        } else {
          var fr = fracOf(g, t);
          pos = g.type === "dot" ? pt(row.A) : B.tipAt(row, fr);
          lift = pos.gy - pos.y;
          if (g.type === "dot" && t >= g.end) pos.x += Math.sin((t - g.end) / 22) * 0.35 * yd * (1 - ramp(t, g.end, 260));
          if (g.kind === "fg" && t < g.end) { var fl = Math.sin(Math.PI * fr) * 9 * yd * 0.62; pos.y -= fl; lift += fl; }
          if (g.kind === "pen" && !row.ghost && t < g.phases[0].a + g.phases[0].d) pos = pt(row.A);
          var flying = t < g.end && (g.type === "air" || g.type === "inc" || g.type === "kick" || g.kind === "fg") && (g.catchAt == null || t < g.catchAt);
          if (flying && pos.tx != null) ang = Math.atan2(pos.ty, pos.tx);
          if (g.kind === "inc" && t >= g.end) { sc *= 1 - ramp(t, g.end, 260); pos.y += 0.6 * yd * 0.62 * ramp(t, g.end, 260); }
        }
        pos.y -= 0.35 * yd * 0.62;
        if (sc > 0.01) drawBall(x, B, pos, ang, sc, lift, yd);
      }
      var st = K.overlayState(t, cur, g, s, outro, segs, spec,
        function (k) { return B.labelOf(k); },
        function (k, sg) {
          var e = B.rows[k], p = sg.type === "dot" ? e.A : e.end, f = sg.type === "dot" ? spec.rows[k].fs : spec.rows[k].fe;
          var nudge = f >= 95 ? -10 * B.k : f <= 5 ? 10 * B.k : 0;   /* off the end-zone lettering */
          return { x: p.x + nudge, y: p.y - 1.4 * e.yd * 0.62 };
        });
      K.drawOverlay(x, W, H, B, sumLabel ? st.labels.concat([sumLabel]) : st.labels, st.co, null, st.fx);
    }

    var raf = 0, stopped = false, done = false, start = null, now = 0;
    function check(t) { if (!done && t >= P.total) { done = true; if (opts.onDone) opts.onDone(); } }
    function frame(ts) {
      if (stopped) return;
      if (start == null) {
        /* opts.fromLast: begin at the last play (the scoring play, for score alerts); earlier plays are already drawn. */
        var off = 0;
        if (opts.fromLast && segs.length) { var li = segs.length - 1; while (li > 0 && segs[li].cont) li--; off = segs[li].t0; }
        start = ts - off;
      }
      var t = Math.min(ts - start, P.total);
      renderAt(t);
      if (t >= P.total) { check(t); return; }
      raf = requestAnimationFrame(frame);
    }
    if (!opts.clock) raf = requestAnimationFrame(frame);
    else renderAt(0);
    return {
      total: P.total,
      timeline: K.timelineOf(segs),
      seek: function (ms) { if (stopped) return; now = clamp(ms, 0, P.total); renderAt(now); check(now); return now; },
      step: function (ms) { return this.seek(now + (ms == null ? 1000 / 30 : ms)); },
      stop: function () { stopped = true; cancelAnimationFrame(raf); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
  }

  window.Chart2D = { render: render, replay: replay, hits: hits, ready: function () { return fontsReady; }, onReady: null };
})();
