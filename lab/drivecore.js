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
    carom: bez(0.15, 0.45, 0.55, 1), /* ball off an upright: quick rebound, drops away */
    stub: bez(0.2, 0.6, 0.3, 1),
    lin: function (x) { return clamp(x, 0, 1); },
    out: bez(0.2, 0.7, 0.3, 1),
    inOut: bez(0.42, 0, 0.58, 1)
  };
  function backOut(t) { t = Math.max(0, Math.min(1, t)); var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ramp(t, a, d) { return clamp((t - a) / (d || 1), 0, 1); }

  /* Goal posts (yards): crossbar height, half the width between the uprights, top of the uprights
     (kept lower than the real 35 ft so they don't crowd the chart), and how far behind the end
     line the base stands (the gooseneck brings the uprights over the end line). */
  /* Injury scene timing (ms): starts this long after the result, lasts this long; the shout comes in at .shout. */
  var HURT = { lead: 1700, len: 7800, shout: 2300 };
  var GOAL = { cb: 3.33, hw: 3.1, top: 3.33 + 7, back: 2 };
  /* Which upright / side of the posts, from the kicker's view: -1 left, 1 right, 0 neither. */
  function fgSide(s) {
    var r = s.fgResult;
    return r === "wideL" || r === "upL" || s.fgDoink === "L" ? -1 : r === "wideR" || r === "upR" || s.fgDoink === "R" ? 1 : 0;
  }
  /* A field goal's flight, renderer-neutral: pieces of sample points {f, h, zo, b}.
     f = field x (0..100 + end zones), h = height in yards, zo = offset from the posts' centre line
     across the field in world depth (+ = near sideline), b = how far the path has moved from the
     play's lane to the posts (0..1). Kicker's left is the far side when kicking toward +x and the
     near side when kicking toward -x. A second piece is the carom after hitting an upright.
     end: "cone" (good) or "cross" (miss / block). Blocked punts use the "blocked" shape too. */
  function fgPath(s) {
    var dir = s.dir || 1, res = s.blocked ? "blocked" : s.fgResult || (s.fgMiss ? "miss" : "good");
    var fk = s.fs, fp = dir > 0 ? 110 : -10, D = Math.max(8, Math.abs(fp - fk)), pieces = [], end = "cone", contact = false;
    function F(p) { return fk + dir * D * p; }
    function piece(fn, n) { var pts = []; for (var i = 0; i <= n; i++) pts.push(fn(i / n)); pieces.push(pts); }
    if (res === "blocked") {
      /* Knocked down at the line: a low, short pop that stops just past the line of scrimmage. */
      var fe = s.fe, pk = 1.5;
      piece(function (q) { return { f: fk + (fe - fk) * q, h: 4 * pk * q * (1 - q), zo: 0, b: 0 }; }, 16);
      end = "cross";
    } else if (res === "short" || res === "miss") {
      /* Comes down in front of the posts, under the crossbar. */
      var pe = Math.max(0.5, (D - 4) / D), hp = clamp(0.2 * D, GOAL.cb + 2.4, 12), a = 4 * hp / (pe * pe);
      piece(function (q) { var p = pe * q; return { f: F(p), h: a * p * (pe - p), zo: 0, b: p }; }, 36);
      end = "cross";
    } else {
      var side = fgSide(s), up = res === "upL" || res === "upR" || !!s.fgDoink, sw = dir * side;
      /* Parabola that would land at PE (past the posts): descending as it reaches them, like a real kick. */
      var hc = up ? GOAL.cb + 2.4 : GOAL.cb + 3, PE = 1.2, A2 = hc / (PE - 1);
      /* Wide: well outside the upright, ending just past the end line.
         On the near side (toward the viewer) a little less, so the X stays inside the 3D frame. */
      var nearW = sw > 0, lat = up ? GOAL.hw : side ? GOAL.hw + (nearW ? 4 : 5) : 0, pEnd = up ? 1 : 1 + (side ? (nearW ? -1 : 0.3) : Math.min(1.4, 0.1 * D)) / D;
      piece(function (q) { var p = pEnd * q; return { f: F(p), h: A2 * p * (PE - p), zo: sw * lat * Math.pow(p, 1.5), b: Math.min(1, p) }; }, 40);
      if (up && res !== "good") {
        /* Doink: off the upright, back toward the field and outward, and down. */
        contact = true;
        piece(function (q) { return { f: fp - dir * 6 * q, h: hc + 2.6 * q - (hc + 2.6) * q * q, zo: sw * (GOAL.hw + 2.6 * q), b: 1 }; }, 20);
        end = "cross";
      } else if (up) {
        /* Doink and in: off the inside of the upright and through. */
        contact = true;
        piece(function (q) { return { f: fp + dir * 2 * q, h: hc - 0.8 * q, zo: sw * GOAL.hw * (1 - 0.7 * q), b: 1 }; }, 10);
        end = "cone";
      } else end = side ? "cross" : "cone";
    }
    /* chip: where the result chip goes, in front of the posts and above them, so it doesn't cover them. */
    var chip = res === "blocked" ? null : { f: fp - dir * 9, h: GOAL.top + 1, zo: 0, b: 1 };
    return { pieces: pieces, end: end, contact: contact, fp: fp, side: fgSide(s), dir: dir, chip: chip };
  }
  /* Doink impact: a short white starburst at the contact point (e = 0..1 over ~360 ms). */
  function drawBurst(o, x, y, u, e) {
    if (!(e > 0 && e < 1)) return;
    var r0 = (3 + 8 * e) * u, r1 = (7 + 15 * e) * u;
    o.save(); o.globalAlpha = 1 - e * e; o.lineCap = "round";
    [["rgba(0,0,0,0.35)", 3.4], ["#ffffff", 1.9]].forEach(function (st) {
      o.strokeStyle = st[0]; o.lineWidth = st[1] * u; o.beginPath();
      for (var i = 0; i < 8; i++) { var an = i * Math.PI / 4 + 0.3, c = Math.cos(an), sn = Math.sin(an); o.moveTo(x + c * r0, y + sn * r0); o.lineTo(x + c * r1, y + sn * r1); }
      o.stroke();
    });
    o.restore();
  }
  /* The "doink": calls opts.onDoink when a render at time t follows one before a play's contact
     time (t moving forward) and t is less than 400 ms past the contact. So: once per forward
     crossing; nothing when seeking backwards, on the first render (e.g. fromLast), or when a seek
     lands more than 400 ms past the contact. With opts.clock (frame capture) only if
     opts.doinkOnSeek is set (the live animation drives the clock and sets it). */
  function doinkWatch(segs, opts) {
    var last = null, ok = opts && (!opts.clock || opts.doinkOnSeek), on = ok && opts.onDoink, onG = ok && opts.onGdd, onH = ok && opts.onHurt;
    return function (t) {
      if ((on || onG || onH) && last != null && t > last) segs.forEach(function (g) {
        if (on && g.contact != null && last < g.contact && t >= g.contact && t - g.contact < 400) { try { opts.onDoink(g); } catch (e) {} }
        /* Easter egg (live broadcast only): the sack shout, as the sack lands. */
        if (onG && g.gdd && last < g.end && t >= g.end && t - g.end < 400) { try { opts.onGdd(g); } catch (e) {} }
        /* Injury scene: the vendor's shout from the stands, as the robots arrive. */
        if (onH && g.hurt) { var hs = g.hurtAt + HURT.shout; if (last < hs && t >= hs && t - hs < 400) { try { opts.onHurt(g); } catch (e) {} } }
      });
      last = t;
    };
  }

  /* Plan the timeline. linger = the user's "Replay pause" in ms. */
  function plan(spec, B, linger) {
    var segs = [], t = 0, si = 0;
    spec.rows.forEach(function (s, k) {
      var r = B.rows[k], cont = !!s.cont && k > 0, nx = spec.rows[k + 1], nextCont = !!(nx && nx.cont);
      /* Later in the drive only the pre-snap and the flight speed up; reading time never does. */
      var pace = Math.max(0.7, 1 - 0.04 * si), tempo = s.td ? 1 : Math.max(0.8, 1 - 0.025 * si);
      var gain = s.yds != null ? s.yds : Math.round(Math.abs(s.fe - s.fs));
      var big = !s.td && s.kind !== "kick" && s.kind !== "ret" && s.kind !== "pen" && s.kind !== "off" && !s.to && !s.poss && gain >= 20;
      var kind = s.td ? "td" : s.safety ? "safety" : s.to ? "to" : s.fg ? "fg" : s.kind === "off" ? "off" : s.type === "none" ? "none" : s.type === "kick" ? "kick" : s.kind === "ret" ? "ret" :
        s.kind === "pen" ? "pen" : s.type === "inc" ? "inc" : s.spike ? "spike" : s.kneel ? "kneel" : s.type === "dot" ? "nogain" :
        s.sack ? "sack" : s.type === "air" ? "pass" : "run";
      /* poss: the other team ends up with the ball (one look and one hold for every kind of turnover). */
      var g = { k: k, kind: kind, type: s.type, yds: gain, big: big, cont: cont, t0: t, miss: !!s.fgMiss, poss: !!s.poss, gdd: !!(spec.easter && s.gdd), hurt: !!(spec.easter && s.hurt && !nextCont) };
      var pre = cont ? 140 : k === 0 ? 700 : Math.max(320, 480 * pace);
      if (s.tmo && !cont) pre += 650;
      if (s.td && !cont) pre = Math.max(pre, 650);
      g.snap = t + pre; g.pre = pre;
      /* Flight phases: [target ("m" = the play, "g" = a penalty's underlying snap), ms, from, to, ease] */
      var ph = [], air = s.fc != null ? Math.abs(s.fc - s.fs) : Math.abs(s.fe - s.fs), len = Math.abs(s.fe - s.fs);
      function airMs(y) { return clamp(420 + 20 * y, 480, 1100); }
      function runMs(y) { return clamp(300 + 28 * y, 380, 1300) + (y >= 15 ? 150 : 0); }
      if (kind === "fg" || (kind === "kick" && s.blocked)) {
        var fl = clamp(780 + 12 * (s.fgDist || 35), 1050, 1600);
        if (s.blocked || s.fgResult === "blocked") ph.push(["m", 560, 0, 1, EASE.out]);
        else if (r.contact && r.split != null) {
          /* Up to the upright, a beat on the contact, then the carom. */
          ph.push(["m", fl, 0, r.split, EASE.kick]); ph.push(["m", 110, r.split, r.split, null]);
          ph.push(["m", s.fgResult === "good" ? 420 : 680, r.split, 1, EASE.carom]); g.contactI = 1;
        } else ph.push(["m", fl, 0, 1, EASE.kick]);
      }
      else if (kind === "kick") ph.push(["m", clamp(900 + 11 * len, 1100, 1800), 0, 1, EASE.kick]);
      else if (kind === "none") ph.push(["m", 300, 0, 1, null]);
      else if (kind === "off") {
        /* Offsetting fouls: the snap as a ghost, then the ball goes back to the spot; no arrow. */
        if (r.ghost) {
          var ol = Math.abs(s.prePlay.len);
          ph.push(["g", s.prePlay.type === "ground" ? runMs(ol) : s.prePlay.type === "kick" ? clamp(900 + 11 * ol, 1100, 1800) : airMs(ol), 0, 1, s.prePlay.type === "ground" ? EASE.run : s.prePlay.type === "kick" ? EASE.kick : EASE.air]);
          ph.push(["m", 380, 0, 0, null]);
        } else ph.push(["m", 300, 0, 0, null]);
      }
      else if (kind === "pen") {
        if (r.ghost) {
          var gl = Math.abs(s.prePlay.len) + Math.abs(s.prePlay.ret || 0), gt = s.prePlay.type;
          ph.push(["g", gt === "ground" ? runMs(gl) : gt === "kick" ? clamp(900 + 11 * gl, 1100, 1800) : gt === "int" ? airMs(Math.abs(s.prePlay.len)) + 280 + clamp(260 + 28 * Math.abs(s.prePlay.ret || 0), 300, 1200) : airMs(gl), 0, 1, gt === "ground" ? EASE.run : gt === "kick" ? EASE.kick : gt === "int" ? EASE.lin : EASE.air]);
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
      if (g.contactI) g.contact = g.phases[0].a + g.phases[0].d;
      if (kind === "pen" && r.ghost) { g.ghostEnd = g.phases[0].a + g.phases[0].d; g.walkAt = g.phases[2].a; }
      if (kind === "off" && r.ghost) { g.ghostEnd = g.phases[0].a + g.phases[0].d; g.walkAt = g.phases[1].a + g.phases[1].d; }
      g.end = tt;
      /* A missed kick holds a little longer (more so off an upright) so the miss can be seen. */
      /* Every change of possession (and a missed field goal) holds the same 1300 ms; a doink a bit longer. */
      var emph = g.gdd ? 1300 : kind === "td" ? 1200 : kind === "to" || g.poss ? 1300 : kind === "fg" ? (g.miss ? (g.contactI ? 1500 : 1300) : g.contactI ? 1300 : 1000) : kind === "safety" ? 1000 : big ? 350 : 0;
      /* Reading time counts only text the snap line did not already show. */
      g.newChars = newChars(s.callout || {});
      g.read = 400 + 30 * g.newChars;
      /* Injury (live only): the result is read first, then the player-down scene plays in the hold. */
      if (g.hurt) emph = HURT.lead + HURT.len + 200;
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
      if (shift) { g.t0 += shift; g.snap += shift; g.end += shift; if (g.catchAt) g.catchAt += shift; if (g.contact) g.contact += shift; if (g.ghostEnd) g.ghostEnd += shift; if (g.walkAt) g.walkAt += shift; g.phases.forEach(function (p) { p.a += shift; }); }
      var nx = segs[k + 1], nextPre = nx && !nx.cont ? nx.pre : 0;
      g.hold = g.nextCont ? 160 : Math.max(linger, g.read - nextPre) + g.emph;
      g.holdEnd = g.end + g.hold; t = g.holdEnd;
      if (g.hurt) { g.hurtAt = g.end + HURT.lead; g.hurtEnd = g.hurtAt + HURT.len; }
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
  var FGCHIP = { wideL: "Wide left", wideR: "Wide right", short: "Short", upL: "Hit left upright", upR: "Hit right upright", blocked: "Blocked" };
  /* The one way to write yards, on chips and in the info box: "18 yds", "1 yd", "\u22125 yds";
     with a noun the unit stays singular: "\u22121 yd return", "44 yd punt", "15 yd penalty". True minus sign. */
  function ydStr(n, noun) {
    n = Math.round(+n || 0); var a = Math.abs(n), sg = n < 0 ? "\u2212" : "";
    return noun ? sg + a + " yd " + noun : sg + a + (a === 1 ? " yd" : " yds");
  }
  var FLAG = "#ffd23f", GREY = "rgba(60,60,60,0.86)";
  function chipFor(s, g) {
    /* A row can carry its own chip (kick outcomes, flags, turnovers, scores): null = no chip. */
    if (s.chip !== undefined) return s.chip ? Object.assign({}, s.chip) : null;
    var y = g.yds;
    switch (g.kind) {
      case "kick": if (s.blocked) return { text: "Blocked", bg: "#c62828" }; return { text: ydStr(Math.abs(s.fe - s.fs), s.punt ? "punt" : "kick") };
      case "ret": return { text: ydStr(y, "return"), bg: s.retChip || undefined, fg: s.retChip ? s.ink : undefined };
      case "inc": return { text: "Incomplete", bg: GREY };
      case "spike": return { text: "Spike", bg: GREY };
      case "kneel": return { text: "Kneel", bg: GREY };
      case "nogain": return { text: "No gain", bg: GREY };
      case "none": return null;
      case "off": return { text: "Offsetting \u00b7 no play", bg: GREY };
      case "sack": return { text: "Sack, " + ydStr(y), bg: "#b4441d" };
      case "pen": return { text: "FLAG" + (s.flagTeam ? " " + s.flagTeam : "") + ", " + ydStr(Math.abs(s.fe - s.fs)), bg: FLAG, fg: "#17201b", flag: true };
      case "to":
        if (s.intAt != null) { var ry = Math.round((s.fe - s.intAt) * -(s.dir || 1)); return { text: ry ? ydStr(ry, "return") : "No return", bg: s.retColor || "#8f1d1d", fg: s.retInk }; }
        return null;
      case "safety": return null;
      case "fg": return g.miss ? { text: FGCHIP[s.fgResult] || "No good", bg: "#c62828" } : null;
      case "td": return { text: (y ? "TD, " + ydStr(y) : "TD") + (s.tryNote ? " \u00b7 " + s.tryNote : ""), bg: s.scoreColor || s.color, fg: s.scoreInk || s.ink, big: true, td: true };
      /* A big play: the offence's colour with a white ring (the penalty flag keeps the yellow). */
      default: return y < 0 ? { text: ydStr(y), bg: "#b4441d" } : y === 0 ? { text: "No gain", bg: GREY } : g.big ? { text: ydStr(y), bg: s.color, fg: s.ink, ring: "#ffffff", big: true } : { text: ydStr(y) };
    }
  }
  /* A small penalty flag drawn inside a chip (x, y = left edge, cap middle; h = cap height). */
  function flagMark(o, x, y, h) {
    o.save(); o.lineWidth = Math.max(1, h * 0.16); o.strokeStyle = "#17201b"; o.fillStyle = "#17201b"; o.lineCap = "round";
    o.beginPath(); o.moveTo(x, y + h * 0.62); o.lineTo(x, y - h * 0.62); o.stroke();
    o.beginPath(); o.moveTo(x, y - h * 0.62); o.lineTo(x + h * 0.95, y - h * 0.36); o.lineTo(x, y - h * 0.08); o.closePath(); o.fill();
    o.restore();
  }

  /* 2D text layer: score labels and the play callout. */
  function pill(o, x, y, w, h) {
    o.beginPath(); if (o.roundRect) o.roundRect(x, y, w, h, h / 2); else o.rect(x, y, w, h);
  }
  /* Replay-only extras: result chips at the end of a play and a full-width banner (TD, turnover). */
  /* Baseline that centres text on cap/digit height, so letters hanging below the line (y, g, p)
     don't make the text look pushed down. Use with textBaseline "alphabetic". */
  function capMid(o) {
    var m = o.measureText("H0"), a = m.actualBoundingBoxAscent;
    if (!(a > 0)) a = parseFloat(o.font.replace(/^.*?(\d+(?:\.\d+)?)px.*$/, "$1")) * 0.7 || 0;
    return a / 2;
  }
  function drawFx(o, W, H, B, fx, u, scr) {
    (fx.chips || []).forEach(function (c) {
      if (!(c.a > 0) || !(c.s > 0)) return;
      var sp = scr(c.p), fs = 13 * u * (c.big ? 1.15 : 1);
      o.font = "italic 800 " + Math.round(fs) + "px " + DISPLAY;
      var tw = o.measureText(c.text).width, ph = fs * 1.3, fw = c.flag ? fs * 0.75 : 0, pw = tw + fs * 0.9 + fw, M = 8 * u;
      /* Kept at least 8 px inside the frame, even for plays at the end zones. */
      var cx = Math.max(M + pw / 2, Math.min(W - M - pw / 2, sp[0])), cy = Math.max(M + ph / 2, Math.min(H - M - ph / 2, sp[1] - 13 * u - ph / 2));
      o.save(); o.globalAlpha = c.a; o.translate(cx, cy); o.scale(c.s, c.s);
      o.shadowColor = "rgba(0,0,0,0.3)"; o.shadowBlur = 4 * u;
      o.fillStyle = c.bg || "rgba(10,25,15,0.86)"; pill(o, -pw / 2, -ph / 2, pw, ph); o.fill(); o.shadowBlur = 0;
      if (c.ring) { o.lineWidth = 1.8 * u; o.strokeStyle = c.ring; o.stroke(); }
      o.fillStyle = c.fg || "#fff"; o.textAlign = "center"; o.textBaseline = "alphabetic";
      var cm = capMid(o);
      if (fw) flagMark(o, -pw / 2 + fs * 0.5, 0, cm * 1.6);
      o.fillText(c.text, fw / 2, cm);
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
      o.fillStyle = b.fg || "#fff"; o.textAlign = "center"; o.textBaseline = "alphabetic";
      o.fillText(b.text, 0, capMid(o));
      o.textBaseline = "middle";
      if (b.sub) {
        o.font = "italic 800 " + Math.round(bfs * 0.46) + "px " + DISPLAY;
        var sw2 = o.measureText(b.sub).width + bfs * 0.6, sh2 = bfs * 0.62;
        o.fillStyle = "rgba(10,25,15,0.86)"; o.fillRect(-sw2 / 2, bh / 2, sw2, sh2);
        o.fillStyle = "#fff"; o.fillText(b.sub, 0, bh / 2 + sh2 / 2);
      }
      o.restore();
    }
  }
  /* Player cards (lab): the "Card" design with the player's photo: team-colour frame, rounded corners,
     the jersey number on a team-colour tab over the bottom edge. Photo from Players (players.js); silhouette if none. */
  function drawCard(o, b, x, y, s, u, frameBg) {
    var bw = Math.max(1.6 * u, s * 0.05), r = s * 0.18, img = window.Players && window.Players.imgOf(b.id);
    function rr(x0, y0, w0, h0, r0) { o.beginPath(); if (o.roundRect) o.roundRect(x0, y0, w0, h0, r0); else o.rect(x0, y0, w0, h0); }
    o.save(); o.shadowColor = "rgba(0,0,0,0.25)"; o.shadowBlur = 6 * u; o.shadowOffsetY = 1.5 * u;
    o.fillStyle = b.bg; rr(x, y, s, s, r); o.fill(); o.restore();
    var ix = x + bw, iy = y + bw, is = s - 2 * bw;
    o.save(); rr(ix, iy, is, is, Math.max(0, r - bw)); o.clip();
    o.fillStyle = frameBg; o.fillRect(ix, iy, is, is);
    if (img && img.complete && img.naturalWidth) o.drawImage(img, ix, iy + is * 0.04, is, is);
    else { o.fillStyle = "rgba(128,128,128,0.45)"; o.beginPath(); o.arc(ix + is / 2, iy + is * 0.4, is * 0.19, 0, 7); o.fill();
      o.beginPath(); o.ellipse(ix + is / 2, iy + is * 1.02, is * 0.36, is * 0.34, 0, Math.PI, 0); o.fill(); }
    o.restore();
    if (!b.num) return;
    var ph = Math.max(10 * u, s * 0.28), pf = (ph - 2.5 * u) * 0.95;
    o.font = "800 " + Math.round(pf) + "px " + DISPLAY;
    var tw = Math.max(ph * 1.5, o.measureText(b.num).width + ph * 0.7), tx = x + (s - tw) / 2, ty = y + s - ph / 2;
    o.fillStyle = "#ffffff"; rr(tx - 1.2 * u, ty - 1.2 * u, tw + 2.4 * u, ph + 2.4 * u, ph * 0.28 + 1.2 * u); o.fill();
    o.fillStyle = b.bg; rr(tx, ty, tw, ph, ph * 0.28); o.fill();
    o.fillStyle = b.ink || "#fff"; o.textAlign = "center"; o.textBaseline = "middle"; o.fillText(b.num, tx + tw / 2, ty + ph / 2 + 0.4 * u);
    o.textAlign = "left";
  }
  function drawOverlay(o, W, H, B, labels, callout, at, fx) {
    function scr(p) { return B.scr(p, W, H); }
    var u = W / 360;
    o.textBaseline = "middle"; o.lineJoin = "round";
    labels.forEach(function (l) {
      if (l.a != null && l.a <= 0) return;
      o.save(); if (l.a != null) o.globalAlpha = l.a;
      var s0 = scr(l.p), s1 = scr(B.laneShift(l));
      var gapPx = Math.abs(s1[1] - s0[1]), fs = Math.max(8 * u, Math.min(12.5 * u, gapPx * 0.78));
      o.font = "700 " + Math.round(fs) + "px " + DISPLAY;
      var tw = o.measureText(l.text).width, ph = fs * 1.15, pw = tw + fs * 0.7, gap = 3.5 * u * fs / (12 * u);
      var x0 = l.dir > 0 ? s0[0] + gap : s0[0] - gap - pw;
      x0 = Math.max(2 * u, Math.min(W - pw - 2 * u, x0));
      o.fillStyle = "rgba(10,25,15,0.72)"; o.beginPath();
      if (o.roundRect) o.roundRect(x0, s0[1] - ph / 2, pw, ph, ph / 2); else o.rect(x0, s0[1] - ph / 2, pw, ph);
      o.fill();
      o.fillStyle = "#fff"; o.textAlign = "center"; o.textBaseline = "alphabetic"; o.fillText(l.text, x0 + pw / 2, s0[1] + capMid(o)); o.textBaseline = "middle";
      o.restore();
    });
    if (B.startAt && B.startLabel) {
      var sp = scr(B.startAt), sfs = Math.round(10 * u); sp[1] += sfs * 1.55;
      o.font = "700 " + sfs + "px " + DISPLAY;
      var sw = o.measureText(B.startLabel).width + sfs * 0.8, sh = sfs * 1.3;
      var sx0 = Math.max(2 * u, Math.min(W - sw - 2 * u, sp[0] - sw / 2));
      o.fillStyle = "rgba(10,25,15,0.72)"; o.beginPath();
      if (o.roundRect) o.roundRect(sx0, sp[1] - sh, sw, sh, sh / 2); else o.rect(sx0, sp[1] - sh, sw, sh);
      o.fill(); o.fillStyle = "#fff"; o.textAlign = "center"; o.textBaseline = "alphabetic"; o.fillText(B.startLabel, sx0 + sw / 2, sp[1] - sh / 2 + capMid(o)); o.textBaseline = "middle";
    }
    if (fx) drawFx(o, W, H, B, fx, u, scr);
    if (!callout) return;
    /* The info box always sits in the same place, across the top. */
    var DKM = (window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches), c = callout, pad = 8 * u, lh = 14 * u, TEXT = fx && c.muted ? (DKM ? "#8d96a1" : "#8b958e") : (DKM ? "#d7dce2" : "#3c463f");
    /* Highlighted words are bold in the normal text colour (same as the still picture). */
    var HLC = {};
    var FB = Math.round(11 * u) + "px 'Work Sans', system-ui, sans-serif", FH = "700 " + Math.round(11 * u) + "px 'Work Sans', system-ui, sans-serif";
    o.font = "700 " + Math.round(11.5 * u) + "px 'Work Sans', system-ui, sans-serif";
    var w1 = o.measureText(c.head).width;
    function pieces(line) {
      var out = [], rest = line || "";
      while (rest) {
        var best = null;
        (c.hls || []).forEach(function (h) { var i = rest.indexOf(h.t); if (i >= 0 && (!best || i < best.i)) best = { i: i, h: h }; });
        /* A player's name: his number plate first (team colour), then the name. */
        (c.badges || []).forEach(function (b) { var i = rest.indexOf(b.t); if (i >= 0 && (!best || i < best.i)) best = { i: i, b: b }; });
        if (!best) { out.push([rest, FB]); break; }
        if (best.i) out.push([rest.slice(0, best.i), FB]);
        if (best.b) { out.push([best.b.num, "badge", null, best.b]); out.push([best.b.t, FB]); rest = rest.slice(best.i + best.b.t.length); continue; }
        out.push([best.h.t, FH, HLC[best.h.k]]);
        rest = rest.slice(best.i + best.h.t.length);
      }
      return out;
    }
    var FBD = "800 " + Math.round(11 * u) + "px " + DISPLAY, bpx = 3.2 * u, bgap = 3 * u;
    function pw(p) { if (p[1] === "badge") { o.font = FBD; return Math.max(o.measureText(p[0]).width + bpx * 2, 15 * u) + bgap; } o.font = p[1]; return o.measureText(p[0]).width; }
    function widthOf(line) { return pieces(line).reduce(function (w, p) { return w + pw(p); }, 0); }
    /* The players in the play (lab): up to 3 cards to the right of the box, in the order they're named.
       With cards the box has room for 3 text lines and long lines wrap instead of being squeezed. */
    var seenId = {}, PL = window.Players ? (c.badges || []).filter(function (b) { if (!b.id || seenId[b.id] || ((c.l1 || "") + " " + (c.l2 || "")).indexOf(b.t) < 0) return false;   /* only names on screen now: no spoilers */ seenId[b.id] = 1; return true; }).slice(0, 3) : [];
    var bw = W - 12 * u, bh = pad * 2 + lh * 3 - 4 * u, bx = 6 * u, by = 6 * u, cs = 0, cg = 5 * u;
    if (PL.length) { bh = pad * 2 + lh * 4 - 4 * u; cs = Math.min(bh - 6 * u, PL.length === 3 ? 44 * u : 52 * u); bw -= PL.length * cs + (PL.length - 1) * cg + 6 * u; }
    o.save(); o.shadowColor = "rgba(0,0,0,0.25)"; o.shadowBlur = 8 * u; o.shadowOffsetY = 2 * u;
    o.fillStyle = DKM ? "#2a3039" : "#fff"; o.beginPath();
    if (o.roundRect) o.roundRect(bx, by, bw, bh, 5 * u); else o.rect(bx, by, bw, bh);
    o.fill(); o.restore();
    o.textAlign = "left"; o.fillStyle = DKM ? "#eef1f4" : "#17201b";
    o.font = "700 " + Math.round(11.5 * u) + "px 'Work Sans', system-ui, sans-serif"; o.fillText(c.head, bx + pad, by + pad + lh / 2 - 2 * u);
    if (c.note) {
      var hw = o.measureText(c.head).width;
      o.font = "600 " + Math.round(10.5 * u) + "px 'Work Sans', system-ui, sans-serif"; o.fillStyle = DKM ? "#a4acb6" : "#8b958e";
      o.fillText("  ·  " + c.note, bx + pad + hw, by + pad + lh / 2 - 2 * u);
    }
    function drawLine(line, y) {
      var x = bx + pad, avail = bw - pad * 2, w = widthOf(line);
      /* A line that would overflow the box is squeezed to fit (no-op when it fits). */
      o.save(); if (w > avail) { o.translate(x, y); o.scale(avail / w, 1); o.translate(-x, -y); }
      pieces(line).forEach(function (p) {
        if (p[1] === "badge") {
          var b = p[3], bw0 = pw(p) - bgap, bh0 = 12.5 * u;
          o.fillStyle = b.bg; o.beginPath(); if (o.roundRect) o.roundRect(x, y - bh0 / 2 - 0.5 * u, bw0, bh0, 2.5 * u); else o.rect(x, y - bh0 / 2 - 0.5 * u, bw0, bh0); o.fill();
          o.font = FBD; o.fillStyle = b.ink || "#fff"; o.textAlign = "center"; o.fillText(p[0], x + bw0 / 2, y + 0.3 * u); o.textAlign = "left";
          x += bw0 + bgap; return;
        }
        o.font = p[1]; o.fillStyle = p[2] || TEXT; o.fillText(p[0], x, y); x += o.measureText(p[0]).width; });
      o.restore();
    }
    if (!PL.length) {
      drawLine(c.l1, by + pad + lh * 1.5 - 2 * u);
      if (c.l2) drawLine(c.l2, by + pad + lh * 2.5 - 2 * u);
    } else {
      /* Wrap by words onto 3 lines; a player's name ("A.St. Brown") never splits from his number. */
      var avail = bw - pad * 2, rows = [];
      [c.l1, c.l2].forEach(function (l) {
        if (!l) return; var prot = l;
        (c.badges || []).forEach(function (b) { prot = prot.split(b.t).join(b.t.replace(/ /g, "\u0001")); });
        var cur = "";
        prot.split(" ").forEach(function (wd) { wd = wd.replace(/\u0001/g, " "); var t = cur ? cur + " " + wd : wd; if (cur && widthOf(t) > avail) { rows.push(cur); cur = wd; } else cur = t; });
        if (cur) rows.push(cur);
      });
      if (rows.length > 3) rows = rows.slice(0, 2).concat([rows.slice(2).join(" ")]);
      rows.forEach(function (l, i) { drawLine(l, by + pad + lh * (1.5 + i) - 2 * u); });
      var cx = bx + bw + 6 * u;
      PL.forEach(function (b) { drawCard(o, b, cx, by, cs, u, DKM ? "#1e232a" : "#f3f2ee"); cx += cs + cg; });
    }
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
  /* Lanes: every play gets the same lane spacing whatever the drive's length. The newest play is on
     the lane nearest the viewer (depth 0); each earlier play is one step further away. When a play
     is spotted (its pre-snap beat), the earlier plays slide one step back over 300 ms. LANES lanes
     are fully visible; the next one fades out over that last step, and anything further is not drawn. */
  var LANES = 13, SLIDE = 300;
  function laneDepth(segs, k, cur, t) {
    if (k >= cur) return 0;
    return (cur - 1 - k) + EASE.out(ramp(t, segs[cur].t0, SLIDE));
  }
  function laneAlpha(depth) { return clamp(LANES - depth, 0, 1); }
  /* Long drives: older plays keep sliding back beyond the far sideline until they would reach the
     info box (cap = the renderer's last usable depth). e = slide progress of the current play
     (0..1; 1 in a still picture). */
  function slideE(segs, cur, t) { return cur > 0 && segs ? EASE.out(ramp(t, segs[cur].t0, SLIDE)) : 1; }
  function laneState(spec, k, cur, e, cap) {
    var depth = k >= cur ? 0 : cur - 1 - k + e;
    /* A still picture stepped to an early play of a long drive: lanes slide back so that play is in
       view; plays after it that would land in front of the nearest lane are left out. */
    if (spec.focus != null && spec.focus >= 0 && e === 1) {
      var fd = spec.focus >= cur ? 0 : cur - spec.focus, sh = Math.max(0, Math.ceil(fd - (cap - 1)));
      if (sh) { depth -= sh; if (depth < 0) return { depth: 0, alpha: 0 }; }
    }
    return { depth: depth, alpha: clamp(cap - depth, 0, 1) };
  }
  /* Is row k part of the picked play (spec.focus .. spec.focusTo)? */
  function inFocus(spec, k) { return k >= spec.focus && k <= (spec.focusTo != null ? spec.focusTo : spec.focus); }
  function summaryState() { return null; }
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
    function resultOf(k) { var c = (spec.rows[k] || {}).callout || {}; return { l1: c.l1 || "", l2: c.l2 || "", hls: c.hls || [], badges: c.badges }; }
    var labels = [], fx = { chips: [], banner: null }, co = null, chipRows = {};
    if (g && !outro) {
      /* Result chip at the end of the play; fades as the next play is spotted. */
      for (var k = cur; k >= Math.max(0, cur - 1); k--) {
        var sg = segs[k], ch = chipFor(spec.rows[k], sg);
        if (!ch || t < sg.end) continue;
        var nx = segs[k + 1], fade = nx && t >= nx.t0 ? 1 - ramp(t, nx.t0, 220) : 1;
        if (k < cur && nx && nx.cont) fade = 1 - ramp(t, nx.end, 200);
        if (fade <= 0) continue;
        fx.chips.push({ p: chipAt(k, sg), text: ch.text, bg: ch.bg, fg: ch.fg, big: ch.big, ring: ch.ring, flag: ch.flag, s: backOut(ramp(t, sg.end, 260)), a: fade });
        if (ch.td) chipRows[k] = 1;   /* "TD +3" replaces the TD label while it shows */
      }
      /* The flag: between the erased play and the walk-off, a flag chip where the foul is marked. */
      if (g.kind === "pen" && g.ghostEnd != null && t >= g.ghostEnd && t < g.end) {
        var fin = backOut(ramp(t, g.ghostEnd, 200)), fout = 1 - ramp(t, g.end - 120, 120);
        fx.chips.push({ p: chipAt(cur, g), text: "FLAG", bg: FLAG, fg: "#17201b", flag: true, s: fin, a: fout });
      }
      if (g.hurt && t >= g.hurtAt + 250 && t < g.hurtAt + 2900) {
        var hin = backOut(ramp(t, g.hurtAt + 250, 300)), hout = 1 - ramp(t, g.hurtAt + 2650, 250);
        fx.banner = { text: "PLAYER DOWN", sub: s.hurt.name + " · " + s.hurt.ab, bg: s.hurt.bg, fg: s.hurt.ink || "#fff", s: hin, a: hout, size: 20 };
      }
      else if (g.gdd && t >= g.end) {
        var gin = backOut(ramp(t, g.end + 80, 300)), gout = 1 - ramp(t, Math.min(g.holdEnd - 220, g.end + 1700), 250);
        fx.banner = { text: "GOD DAMMIT DONALD", bg: s.color, fg: "#fff", s: gin, a: gout, size: 17 };
      }
      else if (t >= g.end && s.banner) {
        /* The row says what its banner is: a score in the scoring team's colour, a turnover in red, named for the event. */
        var bn = s.banner, bi = backOut(ramp(t, g.end + 120, 300)), bo = 1 - ramp(t, Math.min(g.holdEnd - 220, g.end + 1500), 250);
        fx.banner = { text: bn.text, bg: bn.bg, fg: bn.fg || "#fff", sub: bn.sub || "", s: bi, a: bo, size: bn.size || 22 };
      }
      else if (s.banner === undefined && t >= g.end && !g.miss && (g.kind === "td" || g.kind === "to" || g.kind === "fg" || g.kind === "safety")) {
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
        co = { head: head, l1: pr.l1, l2: pr.l2, hls: [], badges: pr.badges, muted: true, note: s.tmo ? "after " + s.tmo : "" };
      } else if (t < g.end) co = { head: head, l1: (c.pre || {}).l1 || "", l2: (c.pre || {}).l2 || "", hls: [], badges: c.badges, note: c.preNote || "" };
      else co = { head: head, l1: c.l1, l2: c.l2, hls: c.hls, badges: c.badges, note: c.note || "" };
    } else if (outro && spec.callout) co = spec.callout;   /* matches the still image that replaces the replay */
    return { labels: labels, co: co, fx: fx };
  }
  /* Timeline export (same shape for both renderers). */
  function timelineOf(segs) {
    return segs.map(function (g) {
      return { row: g.k, kind: g.kind, type: g.type, yds: g.yds, cont: g.cont, num: g.num, t0: g.t0, snap: g.snap, catchAt: g.catchAt || null, contact: g.contact || null, ghostEnd: g.ghostEnd || null, walkAt: g.walkAt || null,
        end: g.end, holdEnd: g.holdEnd, hurtAt: g.hurtAt || null, hurtEnd: g.hurtEnd || null, read: g.read, newChars: g.newChars, emph: g.emph,
        phases: g.phases.map(function (p) { return { tgt: p.tgt, a: p.a, d: p.d, f0: p.f0, f1: p.f1 }; }) };
    });
  }
  window.DriveCore = { HURT: HURT, drawBurst: drawBurst, GOAL: GOAL, fgPath: fgPath, fgSide: fgSide, doinkWatch: doinkWatch, DISPLAY: DISPLAY, bez: bez, EASE: EASE, backOut: backOut, clamp: clamp, ramp: ramp, plan: plan, newChars: newChars,
    chipFor: chipFor, ydStr: ydStr, flagMark: flagMark, fracOf: fracOf, activeAt: activeAt, LANES: LANES, laneDepth: laneDepth, laneAlpha: laneAlpha, slideE: slideE, laneState: laneState, inFocus: inFocus, summaryState: summaryState, dimOf: dimOf, overlayState: overlayState, timelineOf: timelineOf,
    pill: pill, drawOverlay: drawOverlay };
})();
