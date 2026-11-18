/* Delay Booth drive animation core, shared by the 3D (chart3d.js) and flat (chart2d.js) charts.
   Nothing here needs three.js: the timeline plan, easing, result chips, the info box / chip /
   banner overlay, and what the overlay shows at any moment of a replay. A renderer supplies:
     B.rows[k].split / .ghost / .intCross  (path facts the plan needs),
     B.scr(p, W, H) -> [x, y] screen point, B.laneShift(label) -> a point one lane nearer,
     B.startAt / B.startLabel for the drive-start label. */
(function () {
  "use strict";
  var DISPLAY = '"Barlow Condensed","Arial Narrow",sans-serif';
  function bez(x1, y1, x2, y2) {
    function cx(t) { return 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t; }
    function cy(t) { return 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t; }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var lo = 0, hi = 1, t = x;
      for (var k = 0; k < 24; k++) { t = (lo + hi) / 2; if (cx(t) < x) lo = t; else hi = t; }
      return cy(t);
    };
  }
  var EASE = {
    run: bez(0.3, 0, 0.18, 1),      /* quick burst, long deceleration: "how far will he get?" */
    air: bez(0.25, 0.12, 0.5, 1),    /* even flight, settles into the catch */
    kick: bez(0.3, 0.2, 0.6, 0.9),   /* near-constant: hang time comes from the high arc */
    walk: bez(0.45, 0, 0.55, 1),     /* penalty walk-off: deliberate */
    stub: bez(0.2, 0.6, 0.3, 1),
    out: bez(0.2, 0.7, 0.3, 1)
  };
  function backOut(t) { t = Math.max(0, Math.min(1, t)); var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ramp(t, a, d) { return clamp((t - a) / (d || 1), 0, 1); }

  /* Plan the timeline. linger = the user's "Replay pause" in ms. */
  function plan(spec, B, linger) {
    var segs = [], t = 0, si = 0;
    spec.rows.forEach(function (s, k) {
      var r = B.rows[k], cont = !!s.cont && k > 0, nx = spec.rows[k + 1], nextCont = !!(nx && nx.cont);
      /* Later in the drive only the pre-snap and the flight speed up; reading time never does. */
      var pace = Math.max(0.7, 1 - 0.04 * si), tempo = s.td ? 1 : Math.max(0.8, 1 - 0.025 * si);
      var gain = s.yds != null ? s.yds : Math.round(Math.abs(s.fe - s.fs));
      var big = !s.td && s.kind !== "kick" && s.kind !== "ret" && s.kind !== "pen" && !s.to && gain >= 20;
      var kind = s.td ? "td" : s.safety ? "safety" : s.to ? "to" : s.fg ? "fg" : s.type === "kick" ? "kick" : s.kind === "ret" ? "ret" :
        s.kind === "pen" ? "pen" : s.type === "inc" ? "inc" : s.spike ? "spike" : s.type === "dot" ? "nogain" :
        s.sack ? "sack" : s.type === "air" ? "pass" : "run";
      var g = { k: k, kind: kind, type: s.type, yds: gain, big: big, cont: cont, t0: t, miss: !!s.fgMiss };
      var pre = cont ? 140 : k === 0 ? 700 : Math.max(320, 480 * pace);
      if (s.tmo && !cont) pre += 650;
      if (s.td && !cont) pre = Math.max(pre, 650);
      g.snap = t + pre; g.pre = pre;
      /* Flight phases: [target ("m" = the play, "g" = a penalty's underlying snap), ms, from, to, ease] */
      var ph = [], air = s.fc != null ? Math.abs(s.fc - s.fs) : Math.abs(s.fe - s.fs), len = Math.abs(s.fe - s.fs);
      function airMs(y) { return clamp(420 + 20 * y, 480, 1100); }
      function runMs(y) { return clamp(300 + 28 * y, 380, 1300) + (y >= 15 ? 150 : 0); }
      if (kind === "kick") ph.push(["m", clamp(900 + 11 * len, 1100, 1800), 0, 1, EASE.kick]);
      else if (kind === "fg") ph.push(["m", 1150, 0, 1, EASE.kick]);
      else if (kind === "pen") {
        if (r.ghost) {
          var gl = Math.abs(s.prePlay.len);
          ph.push(["g", s.prePlay.type === "ground" ? runMs(gl) : airMs(gl), 0, 1, s.prePlay.type === "ground" ? EASE.run : EASE.air]);
          ph.push(["m", 380, 0, 0, null]);   /* the flag: the snap's result is replaced by the walk-off */
        } else ph.push(["m", 200, 0, 0, null]);
        ph.push(["m", clamp(320 + 16 * len, 420, 900), 0, 1, EASE.walk]);
      }
      else if (s.type === "dot") ph.push(["m", 380, 0, 1, EASE.stub]);
      else if (r.intCross) {
        ph.push(["m", airMs(Math.abs(s.intAt - s.fs)), 0, r.split, EASE.air]);
        ph.push(["m", 280, r.split, r.split, null]);
        ph.push(["m", clamp(260 + 28 * Math.abs(s.fe - s.intAt), 300, 1200), r.split, 1, EASE.run]);
        g.catchI = 1;
      } else if (s.type === "air" || s.type === "inc") {
        if (r.split != null) {
          var yac = Math.abs(s.fe - s.fc);
          ph.push(["m", airMs(air), 0, r.split, EASE.air]); ph.push(["m", 150, r.split, r.split, null]);
          ph.push(["m", clamp(220 + 30 * yac, 280, 1000), r.split, 1, EASE.run]); g.catchI = 1;
        } else ph.push(["m", airMs(air), 0, 1, EASE.air]);
      } else ph.push(["m", runMs(len), 0, 1, EASE.run]);
      if (s.td && ph.length === 1) ph[0][1] = Math.max(ph[0][1], 700);
      var tt = g.snap;
      g.phases = ph.map(function (p) { var o = { tgt: p[0], a: tt, d: p[1] * (p[4] ? tempo : 1), f0: p[2], f1: p[3], e: p[4] }; tt += o.d; return o; });
      if (g.catchI) g.catchAt = g.phases[0].a + g.phases[0].d;
      if (kind === "pen" && r.ghost) { g.ghostEnd = g.phases[0].a + g.phases[0].d; g.walkAt = g.phases[2].a; }
      g.end = tt;
      var emph = kind === "td" ? 1200 : kind === "to" ? 1300 : kind === "fg" || kind === "safety" ? 1000 : big ? 350 : 0;
      /* Reading time counts only text the snap line did not already show. */
      g.newChars = newChars(s.callout || {});
      g.read = 400 + 30 * g.newChars;
      g.emph = emph;
      g.nextCont = nextCont;
      if (!cont) si++;
      segs.push(g);
      /* Durations after the flight are settled below, once the next pre-snap is known. */
      t = g.end + (nextCont ? 160 : g.read + emph);
    });
    /* The result stays readable (in grey) through the next pre-snap, so that time counts as reading
       time; the hold itself is never shorter than the user's pause. */
    t = 0;
    segs.forEach(function (g, k) {
      var shift = t - g.t0;
      if (shift) { g.t0 += shift; g.snap += shift; g.end += shift; if (g.catchAt) g.catchAt += shift; if (g.ghostEnd) g.ghostEnd += shift; if (g.walkAt) g.walkAt += shift; g.phases.forEach(function (p) { p.a += shift; }); }
      var nx = segs[k + 1], nextPre = nx && !nx.cont ? nx.pre : 0;
      g.hold = g.nextCont ? 160 : Math.max(linger, g.read - nextPre) + g.emph;
      g.holdEnd = g.end + g.hold; t = g.holdEnd;
    });
    var idx = 0;
    segs.forEach(function (g) { if (!g.cont) idx++; g.num = idx; });
    return { segs: segs, outro: t, total: t + 450 };
  }

  function newChars(c) {
    function norm(x) { return String(x || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
    var res = norm((c.l1 || "") + " " + (c.l2 || "")), pre = norm(((c.pre || {}).l1 || "") + " " + ((c.pre || {}).l2 || "")).replace(/…$/, "");
    if (/^(TOUCHDOWN|INTERCEPTED|Penalty)/.test(res)) return res.length;
    var k = 0; while (k < res.length && k < pre.length && res[k] === pre[k]) k++;
    return res.length - k;
  }
  function chipFor(s, g) {
    /* Chips in words: "18 yards", "-4 yards", "TD, 5 yards", "22 yard return". */
    var y = g.yds, GREY = "rgba(60,60,60,0.86)";
    function yards(n) { var a = Math.abs(n); return (n < 0 ? "\u2212" : "") + a + (a === 1 ? " yard" : " yards"); }
    function yardOf(n) { return (n < 0 ? "\u2212" : "") + Math.abs(n) + " yard"; }
    switch (g.kind) {
      case "kick": return { text: Math.round(Math.abs(s.fe - s.fs)) + " yard kick" };
      case "ret": return { text: yardOf(y) + " return" };
      case "inc": return { text: "Incomplete", bg: GREY };
      case "spike": return { text: "Spike", bg: GREY };
      case "nogain": return { text: "No gain", bg: GREY };
      case "sack": return { text: "Sack, " + yards(y), bg: "#b4441d" };
      case "pen": return { text: yardOf(y) + " penalty", bg: "#ffd23f", fg: "#17201b" };
      case "to":
        if (s.intAt != null) { var ry = Math.round(Math.abs(s.fe - s.intAt)); return { text: ry >= 1 ? ry + " yard return" : "No return", bg: s.retColor || "#8f1d1d" }; }
        return null;
      case "safety": return null;
      case "fg": return g.miss ? { text: "No good", bg: "#c62828" } : null;
      case "td": return { text: "TD, " + yards(y), bg: s.color, big: true, td: true };
      default: return y < 0 ? { text: yards(y), bg: "#b4441d" } : y === 0 ? { text: "No gain", bg: GREY } : g.big ? { text: yards(y), bg: "#ffd23f", fg: "#17201b", big: true } : { text: yards(y) };
    }
  }

  /* 2D text layer: score labels and the play callout. */
  function pill(o, x, y, w, h) {
    o.beginPath(); if (o.roundRect) o.roundRect(x, y, w, h, h / 2); else o.rect(x, y, w, h);
  }
  /* Replay-only extras: result chips at the end of a play and a full-width banner (TD, turnover). */
  function drawFx(o, W, H, B, fx, u, scr) {
    (fx.chips || []).forEach(function (c) {
      if (!(c.a > 0) || !(c.s > 0)) return;
      var sp = scr(c.p), fs = 13 * u * (c.big ? 1.15 : 1);
      o.font = "italic 800 " + Math.round(fs) + "px " + DISPLAY;
      var tw = o.measureText(c.text).width, ph = fs * 1.3, pw = tw + fs * 0.9, M = 8 * u;
      /* Kept at least 8 px inside the frame, even for plays at the end zones. */
      var cx = Math.max(M + pw / 2, Math.min(W - M - pw / 2, sp[0])), cy = Math.max(M + ph / 2, Math.min(H - M - ph / 2, sp[1] - 13 * u - ph / 2));
      o.save(); o.globalAlpha = c.a; o.translate(cx, cy); o.scale(c.s, c.s);
      o.shadowColor = "rgba(0,0,0,0.3)"; o.shadowBlur = 4 * u;
      o.fillStyle = c.bg || "rgba(10,25,15,0.86)"; pill(o, -pw / 2, -ph / 2, pw, ph); o.fill(); o.shadowBlur = 0;
      if (c.ring) { o.lineWidth = 1.6 * u; o.strokeStyle = c.ring; o.stroke(); }
      o.fillStyle = c.fg || "#fff"; o.textAlign = "center"; o.textBaseline = "middle";
      o.fillText(c.text, 0, fs * 0.05);
      o.restore();
    });
    var b = fx.banner;
    if (b && b.a > 0 && b.s > 0) {
      var bfs = (b.size || 34) * u;
      o.save(); o.globalAlpha = b.a; o.translate(W / 2, H * (B.bannerY || 0.385)); o.scale(b.s * (B.bannerScale || 1), b.s * (B.bannerScale || 1)); o.rotate(-0.03);
      o.font = "italic 800 " + Math.round(bfs) + "px " + DISPLAY;
      var bw = o.measureText(b.text).width + bfs * 1.2, bh = bfs * 1.25;
      o.shadowColor = "rgba(0,0,0,0.35)"; o.shadowBlur = 10 * u; o.shadowOffsetY = 3 * u;
      o.fillStyle = b.bg; o.fillRect(-bw / 2, -bh / 2, bw, bh); o.shadowColor = "transparent";
      o.fillStyle = b.fg || "#fff"; o.textAlign = "center"; o.textBaseline = "middle";
      o.fillText(b.text, 0, bfs * 0.05);
      if (b.sub) { o.font = "700 " + Math.round(bfs * 0.36) + "px " + DISPLAY; o.fillText(b.sub, 0, bh / 2 + bfs * 0.32); }
      o.restore();
    }
  }
  function drawOverlay(o, W, H, B, labels, callout, at, fx) {
    function scr(p) { return B.scr(p, W, H); }
    var u = W / 360;
    o.textBaseline = "middle"; o.lineJoin = "round";
    labels.forEach(function (l) {
      var s0 = scr(l.p), s1 = scr(B.laneShift(l));
      var gapPx = Math.abs(s1[1] - s0[1]), fs = Math.max(8 * u, Math.min(12.5 * u, gapPx * 0.78));
      o.font = "700 " + Math.round(fs) + "px " + DISPLAY;
      var tw = o.measureText(l.text).width, ph = fs * 1.15, pw = tw + fs * 0.7, gap = 3.5 * u * fs / (12 * u);
      var x0 = l.dir > 0 ? s0[0] + gap : s0[0] - gap - pw;
      x0 = Math.max(2 * u, Math.min(W - pw - 2 * u, x0));
      o.fillStyle = "rgba(10,25,15,0.72)"; o.beginPath();
      if (o.roundRect) o.roundRect(x0, s0[1] - ph / 2, pw, ph, ph / 2); else o.rect(x0, s0[1] - ph / 2, pw, ph);
      o.fill();
      o.fillStyle = "#fff"; o.textAlign = "center"; o.fillText(l.text, x0 + pw / 2, s0[1] + fs * 0.04);
    });
    if (B.startAt && B.startLabel) {
      var sp = scr(B.startAt), sfs = Math.round(10 * u); sp[1] += sfs * 1.55;
      o.font = "700 " + sfs + "px " + DISPLAY;
      var sw = o.measureText(B.startLabel).width + sfs * 0.8, sh = sfs * 1.3;
      var sx0 = Math.max(2 * u, Math.min(W - sw - 2 * u, sp[0] - sw / 2));
      o.fillStyle = "rgba(10,25,15,0.72)"; o.beginPath();
      if (o.roundRect) o.roundRect(sx0, sp[1] - sh, sw, sh, sh / 2); else o.rect(sx0, sp[1] - sh, sw, sh);
      o.fill(); o.fillStyle = "#fff"; o.textAlign = "center"; o.fillText(B.startLabel, sx0 + sw / 2, sp[1] - sh / 2);
    }
    if (fx) drawFx(o, W, H, B, fx, u, scr);
    if (!callout) return;
    /* The info box always sits in the same place, across the top. */
    var c = callout, pad = 8 * u, lh = 14 * u, TEXT = fx && c.muted ? "#8b958e" : "#3c463f";
    /* Highlighted words are bold in the normal text colour (same as the still picture). */
    var HLC = {};
    var FB = Math.round(11 * u) + "px Inter, system-ui, sans-serif", FH = "700 " + Math.round(11 * u) + "px Inter, system-ui, sans-serif";
    o.font = "700 " + Math.round(11.5 * u) + "px Inter, system-ui, sans-serif";
    var w1 = o.measureText(c.head).width;
    function pieces(line) {
      var out = [], rest = line || "";
      while (rest) {
        var best = null;
        (c.hls || []).forEach(function (h) { var i = rest.indexOf(h.t); if (i >= 0 && (!best || i < best.i)) best = { i: i, h: h }; });
        if (!best) { out.push([rest, FB]); break; }
        if (best.i) out.push([rest.slice(0, best.i), FB]);
        out.push([best.h.t, FH, HLC[best.h.k]]);
        rest = rest.slice(best.i + best.h.t.length);
      }
      return out;
    }
    function widthOf(line) { return pieces(line).reduce(function (w, p) { o.font = p[1]; return w + o.measureText(p[0]).width; }, 0); }
    var w2 = Math.max(widthOf(c.l1), widthOf(c.l2));
    var bw = W - 12 * u, bh = pad * 2 + lh * 3 - 4 * u, bx = 6 * u, by = 6 * u;
    o.save(); o.shadowColor = "rgba(0,0,0,0.25)"; o.shadowBlur = 8 * u; o.shadowOffsetY = 2 * u;
    o.fillStyle = "#fff"; o.beginPath();
    if (o.roundRect) o.roundRect(bx, by, bw, bh, 5 * u); else o.rect(bx, by, bw, bh);
    o.fill(); o.restore();
    o.textAlign = "left"; o.fillStyle = "#17201b";
    o.font = "700 " + Math.round(11.5 * u) + "px Inter, system-ui, sans-serif"; o.fillText(c.head, bx + pad, by + pad + lh / 2 - 2 * u);
    if (fx && c.note) {
      var hw = o.measureText(c.head).width;
      o.font = "600 " + Math.round(10.5 * u) + "px Inter, system-ui, sans-serif"; o.fillStyle = "#8b958e";
      o.fillText("  ·  " + c.note, bx + pad + hw, by + pad + lh / 2 - 2 * u);
    }
    function drawLine(line, y) {
      var x = bx + pad, avail = bw - pad * 2, w = widthOf(line);
      /* A line that would overflow the box is squeezed to fit (no-op when it fits). */
      o.save(); if (w > avail) { o.translate(x, y); o.scale(avail / w, 1); o.translate(-x, -y); }
      pieces(line).forEach(function (p) { o.font = p[1]; o.fillStyle = p[2] || TEXT; o.fillText(p[0], x, y); x += o.measureText(p[0]).width; });
      o.restore();
    }
    drawLine(c.l1, by + pad + lh * 1.5 - 2 * u);
    if (c.l2) drawLine(c.l2, by + pad + lh * 2.5 - 2 * u);
  }


  function fracOf(g, t, tgt) {
    tgt = tgt || "m";
    if (tgt === "m" && t >= g.end) return 1;
    var v = null;
    for (var q = 0; q < g.phases.length; q++) {
      var p = g.phases[q]; if (p.tgt !== tgt) continue;
      if (t < p.a) return v == null ? p.f0 : v;
      if (t < p.a + p.d) return p.e ? p.f0 + (p.f1 - p.f0) * p.e((t - p.a) / p.d) : p.f0;
      v = p.f1;
    }
    return v == null ? 0 : v;
  }
  function activeAt(segs, t) { for (var k = segs.length - 1; k >= 0; k--) if (t >= segs[k].t0) return k; return -1; }
  /* How dimmed a finished play is: it fades as the next snap (after a kick's return) is spotted. */
  function dimOf(segs, k, cur, t, undim) {
    var dim = 0;
    if (k < cur) {
      var chainEnd = k + 1;
      while (segs[chainEnd] && segs[chainEnd].cont) chainEnd++;
      dim = segs[chainEnd] ? 0.85 * ramp(t, segs[chainEnd].t0, 260) : 0;
    }
    return dim * (1 - undim);
  }
  /* What the overlay shows at time t: labels, info box text, chips and banner.
     label(k) -> the row's score label or null; chipAt(k, seg) -> point for the row's result chip. */
  function overlayState(t, cur, g, s, outro, segs, spec, label, chipAt) {
    function resultOf(k) { var c = (spec.rows[k] || {}).callout || {}; return { l1: c.l1 || "", l2: c.l2 || "", hls: c.hls || [] }; }
    var labels = [], fx = { chips: [], banner: null }, co = null, chipRows = {};
    if (g && !outro) {
      /* Result chip at the end of the play; fades as the next play is spotted. */
      for (var k = cur; k >= Math.max(0, cur - 1); k--) {
        var sg = segs[k], ch = chipFor(spec.rows[k], sg);
        if (!ch || t < sg.end) continue;
        var nx = segs[k + 1], fade = nx && t >= nx.t0 ? 1 - ramp(t, nx.t0, 220) : 1;
        if (k < cur && nx && nx.cont) fade = 1 - ramp(t, nx.end, 200);
        if (fade <= 0) continue;
        fx.chips.push({ p: chipAt(k, sg), text: ch.text, bg: ch.bg, fg: ch.fg, big: ch.big, s: backOut(ramp(t, sg.end, 260)), a: fade });
        if (ch.td) chipRows[k] = 1;   /* "TD +3" replaces the TD label while it shows */
      }
      if (t >= g.end && !g.miss && (g.kind === "td" || g.kind === "to" || g.kind === "fg" || g.kind === "safety")) {
        var bt = g.kind === "td" ? "TOUCHDOWN" : g.kind === "fg" ? "FIELD GOAL" : g.kind === "safety" ? "SAFETY" : (/fumble/i.test((s.callout || {}).l1 + " " + (s.callout || {}).l2) ? "FUMBLE" : "INTERCEPTED");
        var bin = backOut(ramp(t, g.end + 120, 300)), bout = 1 - ramp(t, Math.min(g.holdEnd - 220, g.end + 1500), 250);
        fx.banner = { text: bt, bg: g.kind === "to" || g.kind === "safety" ? "#c62828" : s.color, fg: "#fff", s: bin, a: bout, size: g.kind === "fg" ? 18 : 22 };
      }
    }
    segs.forEach(function (sg, k) { var lb = label(k); if ((k < cur || (k === cur && t >= sg.end) || outro) && lb && !chipRows[k]) labels.push(lb); });
    if (g && !outro && s.callout) {
      var c = s.callout, head = c.rhead || c.head;
      if (t < g.snap && !g.cont) {
        /* Pre-snap: the new situation on top, the previous result still readable in grey. */
        var pr = cur > 0 ? resultOf(cur - 1) : { l1: "", l2: "" };
        co = { head: head, l1: pr.l1, l2: pr.l2, hls: [], muted: true, note: s.tmo ? "after " + s.tmo : "" };
      } else if (t < g.end) co = { head: head, l1: (c.pre || {}).l1 || "", l2: (c.pre || {}).l2 || "", hls: [] };
      else co = { head: head, l1: c.l1, l2: c.l2, hls: c.hls };
    } else if (outro && spec.callout) co = spec.callout;   /* matches the still image that replaces the replay */
    return { labels: labels, co: co, fx: fx };
  }
  /* Timeline export (same shape for both renderers). */
  function timelineOf(segs) {
    return segs.map(function (g) {
      return { row: g.k, kind: g.kind, type: g.type, yds: g.yds, cont: g.cont, num: g.num, t0: g.t0, snap: g.snap, catchAt: g.catchAt || null, ghostEnd: g.ghostEnd || null, walkAt: g.walkAt || null,
        end: g.end, holdEnd: g.holdEnd, read: g.read, newChars: g.newChars, emph: g.emph,
        phases: g.phases.map(function (p) { return { tgt: p.tgt, a: p.a, d: p.d, f0: p.f0, f1: p.f1 }; }) };
    });
  }
  window.DriveCore = { DISPLAY: DISPLAY, bez: bez, EASE: EASE, backOut: backOut, clamp: clamp, ramp: ramp, plan: plan, newChars: newChars,
    chipFor: chipFor, fracOf: fracOf, activeAt: activeAt, dimOf: dimOf, overlayState: overlayState, timelineOf: timelineOf,
    pill: pill, drawOverlay: drawOverlay };
})();
