/* Delay Booth 3D drive chart (test).
   build() turns a drive into a three.js scene. render() draws it once and returns a
   JPEG data URL (a plain image, so re-renders never pile up WebGL contexts).
   replay() plays the drive back on a live canvas, one play at a time.
   Field coordinates: f = yards from the LEFT goal line (0..100), end zones -10..0 and
   100..110. World: x = f - 50, z = depth (far sideline negative), y = up. */
(function () {
  "use strict";
  var R = null, cache = {}, fontsReady = false;
  var FIELD_W = 53.3, DISPLAY = '"Barlow Condensed","Arial Narrow",sans-serif';
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('italic 800 40px "Barlow Condensed"'),
      document.fonts.load('700 40px "Barlow Condensed"'),
      document.fonts.load('600 20px "Inter"')
    ]).then(function () { fontsReady = true; cache = {}; if (window.Chart3D.onReady) window.Chart3D.onReady(); })
      .catch(function () { fontsReady = true; });
  } else fontsReady = true;

  function setupRenderer(r) {
    r.outputEncoding = THREE.sRGBEncoding;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    return r;
  }
  function renderer() {
    if (!R) R = setupRenderer(new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    return R;
  }
  function cvs(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  function fieldTexture(spec, aniso) {
    var PX = 22, W = 120 * PX, H = Math.round(FIELD_W * PX), c = cvs(W, H), x = c.getContext("2d");
    for (var i = 0; i < 10; i++) { x.fillStyle = i % 2 ? "#5ba84f" : "#50a047"; x.fillRect((10 + i * 10) * PX, 0, 10 * PX, H); }
    function ez(t, x0, flip) {
      x.fillStyle = t.bg; x.fillRect(x0 * PX, 0, 10 * PX, H);
      x.save(); x.translate((x0 + 5) * PX, H / 2); x.rotate(flip ? Math.PI / 2 : -Math.PI / 2);
      var nm = String(t.name || "").toUpperCase(), size = 7.4 * PX;
      x.font = "italic 800 " + size + "px " + DISPLAY;
      var w = x.measureText(nm).width, max = H * 0.84;
      if (w > max) { size = size * max / w; x.font = "italic 800 " + size + "px " + DISPLAY; }
      x.fillStyle = t.ink; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(nm, 0, size * 0.04); x.restore();
    }
    ez(spec.away, 0, false); ez(spec.home, 110, true);
    x.strokeStyle = "rgba(255,255,255,0.92)";
    for (var f = 0; f <= 100; f += 5) {
      x.lineWidth = (f === 0 || f === 100 ? 0.4 : f % 10 === 0 ? 0.24 : 0.16) * PX;
      x.beginPath(); x.moveTo((10 + f) * PX, 0); x.lineTo((10 + f) * PX, H); x.stroke();
    }
    x.lineWidth = 0.13 * PX;
    for (f = 1; f < 100; f++) {
      if (f % 5 === 0) continue;
      [0.9, 23.6, FIELD_W - 23.6, FIELD_W - 0.9].forEach(function (z) {
        x.beginPath(); x.moveTo((10 + f) * PX, (z - 0.55) * PX); x.lineTo((10 + f) * PX, (z + 0.55) * PX); x.stroke();
      });
    }
    x.fillStyle = "rgba(255,255,255,0.95)"; x.textAlign = "center"; x.textBaseline = "alphabetic";
    x.font = "italic 800 " + (8 * PX) + "px " + DISPLAY;
    for (f = 10; f < 100; f += 10) { x.save(); x.translate((10 + f) * PX, H - 2.6 * PX); x.scale(0.78, 1); x.fillText(String(f <= 50 ? f : 100 - f), 0, 0); x.restore(); }
    x.font = "italic 800 " + (5 * PX) + "px " + DISPLAY;
    for (f = 10; f < 100; f += 10) { x.save(); x.translate((10 + f) * PX, 2.6 * PX); x.rotate(Math.PI); x.scale(0.78, 1); x.fillText(String(f <= 50 ? f : 100 - f), 0, 0); x.restore(); }
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = aniso || 1;
    return t;
  }
  function skyTexture() {
    var c = cvs(512, 512), x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#2f7fd0"); g.addColorStop(0.55, "#7fbcec"); g.addColorStop(1, "#e3f2fc");
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    x.fillStyle = "rgba(255,255,255,0.45)";
    [[90, 120, 70, 14], [330, 80, 95, 12], [250, 190, 60, 10], [440, 210, 50, 9]].forEach(function (e) {
      x.beginPath(); x.ellipse(e[0], e[1], e[2], e[3], 0, 0, Math.PI * 2); x.fill();
    });
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function lin(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function mat(color) {
    var c = lin(color);
    return new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.05, emissive: c.clone().multiplyScalar(0.12) });
  }

  /* spec: { away:{name,bg,ink}, home, rows:[{fs,fe,fc,type,dir,color,label,los,ltg,callout}],
             los, ltg, callout:{head,l1,l2,hls,row}, width, height, cam }
     type: "air" | "ground" | "inc" | "kick" | "dot". Each row keeps its pieces in drawing
     order so a replay can reveal them along the path. */
  var SEG = 48, RADS = 10;
  function build(spec, W, H, aniso) {
    var scene = new THREE.Scene();
    scene.background = skyTexture();
    var cv = spec.cam || {};
    var cam = new THREE.PerspectiveCamera(cv.fov || 24, W / H, 1, 1000);
    cam.position.set(0, cv.y || 82, cv.z || 138); cam.lookAt(0, cv.ly != null ? cv.ly : 8, cv.lz != null ? cv.lz : -3);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2c4a26, 0.5));
    var sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(-25, 60, 35); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 200;
    scene.add(sun);
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), new THREE.MeshLambertMaterial({ color: lin(0x2f6a2c) }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -FIELD_W / 2 + 100); scene.add(ground);
    var field = new THREE.Mesh(new THREE.PlaneGeometry(120, FIELD_W), new THREE.MeshLambertMaterial({ map: fieldTexture(spec, aniso) }));
    field.rotation.x = -Math.PI / 2; field.receiveShadow = true; scene.add(field);

    function wx(f) { return Math.max(-60, Math.min(60, f - 50)); }
    function lineMesh(color) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, FIELD_W), new THREE.MeshBasicMaterial({ color: lin(color) }));
      m.position.y = 0.04; m.visible = false; scene.add(m); return m;
    }
    var ltgM = lineMesh(0xffd23f), losM = lineMesh(0x2f7cff);
    var ball = new THREE.Group();
    var bm = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), new THREE.MeshStandardMaterial({ color: lin(0x7a3b12), roughness: 0.6 }));
    bm.scale.set(1.5, 0.9, 0.9); bm.castShadow = true; ball.add(bm);
    var lace = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    lace.position.y = 0.88; ball.add(lace);
    ball.position.set(0, 0.95, FIELD_W / 2 - 3); ball.visible = false; scene.add(ball);
    /* Only the line to gain is drawn: the line of scrimmage is where the previous arrow ended. */
    function setLines(los, ltg) {
      losM.visible = false; ball.visible = false; ltgM.visible = ltg != null;
      if (ltg != null) ltgM.position.x = wx(ltg);
    }

    var n = spec.rows.length, zFar = -21, zNear = 15, Y = 0.72, RAD = 0.62, CONE = 2.6;
    var V3 = THREE.Vector3, up = new V3(0, 1, 0), rows = [];
    spec.rows.forEach(function (row, i) {
      var z = n === 1 ? (zFar + zNear) / 2 : zFar + (zNear - zFar) * i / (n - 1);
      var m = mat(row.color), A = new V3(wx(row.fs), Y, z), E = new V3(wx(row.fe), Y, z);
      var parts = [], end = E, mats = [m], intCross = null, split = null;
      function tube(curve) {
        var t = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, RAD, RADS, false), m);
        t.castShadow = true; scene.add(t); parts.push({ kind: "tube", mesh: t, len: curve.getLength(), curve: curve });
      }
      function cone(tip, dir) {
        dir = dir.clone().normalize();
        var c = new THREE.Mesh(new THREE.ConeGeometry(RAD * 2, CONE, 18), m);
        c.position.copy(tip.clone().sub(dir.clone().multiplyScalar(CONE / 2)));
        c.quaternion.setFromUnitVectors(up, dir); c.castShadow = true; scene.add(c);
        parts.push({ kind: "end", mesh: c, len: CONE * 0.6, from: tip.clone().sub(dir.clone().multiplyScalar(CONE)), to: tip.clone() });
      }
      function cross(p) {
        var g = new THREE.Group();
        [Math.PI / 4, -Math.PI / 4].forEach(function (a) {
          var b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.35), m); b.rotation.z = a; g.add(b);
        });
        g.position.copy(p); scene.add(g); parts.push({ kind: "end", mesh: g, len: 1, from: p.clone(), to: p.clone() });
      }
      function stub(at, d) {
        tube(new THREE.LineCurve3(new V3(at.x - d * 3.4, Y, z), new V3(at.x - d * CONE * 0.9, Y, z)));
        cone(at, new V3(d, 0, 0));
      }
      var kick = row.type === "kick";
      function arcH(len) { return Math.max(0.9, Math.min(kick ? 16 : 11, len * (kick ? 0.33 : 0.27))); }
      function arc(P, Q) { var h = arcH(Math.abs(Q.x - P.x)); return new THREE.QuadraticBezierCurve3(P, new V3((P.x + Q.x) / 2, Y + 2 * h, z), Q); }
      if (row.intAt != null && row.type === "air") {
        /* Interception: the pass flies forward to where it was caught (red X), then the return
           runs back along the turf in the defence's colour. */
        var I = new V3(wx(row.intAt), Y, z), mainM = m;
        if (Math.abs(I.x - A.x) >= 1) tube(arc(A, I));
        m = mat("#d32f2f"); mats.push(m); cross(I.clone().setY(Y + 0.3)); intCross = parts[parts.length - 1];
        var preLen = parts.reduce(function (s2, p2) { return s2 + p2.len; }, 0);
        m = mat(row.retColor || "#8f1d1d"); mats.push(m);
        var rd = E.x >= I.x ? 1 : -1, rl = Math.abs(E.x - I.x);
        if (rl > CONE * 1.1) tube(new THREE.LineCurve3(I, new V3(E.x - rd * CONE * 0.9, Y, z)));
        if (rl >= 1) cone(E, new V3(rd, 0, 0));
        m = mainM; end = E;
        split = preLen / (parts.reduce(function (s2, p2) { return s2 + p2.len; }, 0) || 1);
      } else if (row.type === "dot") {
        stub(A, row.dir || 1); end = A;
      } else if (row.type === "air" || row.type === "inc" || kick) {
        var C = row.fc != null ? new V3(wx(row.fc), Y, z) : E, airLen = Math.abs(C.x - A.x);
        var glen = row.fc != null ? Math.abs(E.x - C.x) : 0, hasRun = glen > CONE * 1.1;
        if (row.type === "inc") {
          var ai = arc(A, C), pts = ai.getSpacedPoints(Math.max(4, Math.round(ai.getLength() / 1.7))), dots = [];
          pts.forEach(function (p) { var b = new THREE.Mesh(new THREE.SphereGeometry(RAD * 0.9, 12, 10), m); b.position.copy(p); b.castShadow = true; scene.add(b); dots.push(b); });
          parts.push({ kind: "dots", list: dots, len: ai.getLength(), curve: ai });
          cross(C.clone().setY(Y + 0.3)); end = C;
        } else if (airLen < 1) {
          var dg = E.x >= A.x ? 1 : -1;
          if (Math.abs(E.x - A.x) > CONE * 1.1) tube(new THREE.LineCurve3(A, new V3(E.x - dg * CONE * 0.9, Y, z)));
          cone(E, new V3(dg, 0, 0)); end = E;
        } else if (hasRun) {
          tube(arc(A, C));
          var g = E.x >= C.x ? 1 : -1;
          tube(new THREE.LineCurve3(C, new V3(E.x - g * CONE * 0.9, Y, z)));
          cone(E, new V3(g, 0, 0)); end = E;
        } else {
          var tip = row.fc != null ? E : C, d2 = tip.x >= A.x ? 1 : -1, span = Math.abs(tip.x - A.x);
          if (span < 1) { stub(tip, row.dir || 1); end = tip; }
          else {
            var land = new V3(tip.x - d2 * Math.min(CONE * 0.85, span * 0.35), Y, z);
            tube(arc(A, land)); cone(tip, new V3(d2, 0, 0)); end = tip;
          }
        }
      } else {
        var d = E.x >= A.x ? 1 : -1;
        if (Math.abs(E.x - A.x) > CONE * 1.1) tube(new THREE.LineCurve3(A, new V3(E.x - d * CONE * 0.9, Y, z)));
        cone(E, new V3(d, 0, 0));
      }
      /* split: the share of the path before a catch / interception (replay only). */
      var tot = parts.reduce(function (s2, p2) { return s2 + p2.len; }, 0) || 1;
      if (split == null && row.type === "air" && parts.length === 3 && parts[0].curve && parts[0].curve.type === "QuadraticBezierCurve3") split = parts[0].len / tot;
      /* Replay-only pieces, built hidden so the still image never shows them. */
      function hide(ps) { ps.forEach(function (p) { if (p.mesh) p.mesh.visible = false; if (p.list) p.list.forEach(function (b) { b.visible = false; }); }); }
      var solid = null, ghost = null, missX = null;
      if (row.type === "inc") {
        /* An incomplete pass flies as a solid arc; it turns dotted only when the ball arrives. */
        var sm = m.clone(); sm.transparent = true;
        var sMesh = new THREE.Mesh(new THREE.TubeGeometry(ai, SEG, RAD, RADS, false), sm);
        sMesh.castShadow = true; sMesh.visible = false; scene.add(sMesh); solid = { mesh: sMesh, mat: sm };
      }
      if (row.prePlay) {
        /* Penalty: the snap that happened before the flag, drawn first, then the walk-off. */
        var keepP = parts, keepM = m, pp = row.prePlay, gd = (row.dir || 1), G = new V3(A.x + gd * pp.len, Y, z);
        parts = []; m = mat(row.ghostColor || "#1d3f8f"); m.transparent = true;
        if (pp.type === "inc") {
          var ga = arc(A, G), gpts = ga.getSpacedPoints(Math.max(4, Math.round(ga.getLength() / 1.7))), gdots = [];
          gpts.forEach(function (p) { var b = new THREE.Mesh(new THREE.SphereGeometry(RAD * 0.9, 12, 10), m); b.position.copy(p); scene.add(b); gdots.push(b); });
          parts.push({ kind: "dots", list: gdots, len: ga.getLength(), curve: ga }); cross(G.clone().setY(Y + 0.3));
        } else if (Math.abs(pp.len) < 1) stub(A, gd);
        else {
          var gdir = pp.len > 0 ? gd : -gd;
          if (pp.type === "air") { tube(arc(A, new V3(G.x - gdir * Math.min(CONE * 0.85, Math.abs(pp.len) * 0.35), Y, z))); cone(G, new V3(gdir, 0, 0)); }
          else { if (Math.abs(pp.len) > CONE * 1.1) tube(new THREE.LineCurve3(A, new V3(G.x - gdir * CONE * 0.9, Y, z))); cone(G, new V3(gdir, 0, 0)); }
        }
        ghost = { parts: parts, A: A, mat: m, inc: pp.type === "inc", end: G };
        if (pp.type === "inc") {
          var gsm = m.clone(), gs = new THREE.Mesh(new THREE.TubeGeometry(ga, SEG, RAD, RADS, false), gsm);
          gs.visible = false; scene.add(gs); ghost.solid = { mesh: gs, mat: gsm };
        }
        hide(parts); parts = keepP; m = keepM;
      }
      if (row.fgMiss) {
        var xm = mat("#d32f2f"); missX = new THREE.Group();
        [Math.PI / 4, -Math.PI / 4].forEach(function (a) { var b = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 0.45), xm); b.rotation.z = a; missX.add(b); });
        missX.position.copy(E).setY(Y + 2.5); missX.visible = false; scene.add(missX);
      }
      rows.push({ parts: parts, z: z, A: A, end: end, mat: m, mats: mats, split: split, intCross: intCross, solid: solid, ghost: ghost, missX: missX, label: row.label ? { p: end.clone().setY(Y), z: z, dir: end.x > A.x ? 1 : end.x < A.x ? -1 : (row.dir || 1), text: row.label } : null, at: end.clone().setY(Y + 1.6) });
    });
    /* Drive start: a stripe across the field and a flag in the offense's colour on the near side.
       After a touchback, a dashed line runs from the end zone to the start line. */
    var startAt = null;
    if (spec.start && spec.start.f != null) {
      var sx = wx(spec.start.f), scol = lin(spec.start.color || "#ffffff");
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, FIELD_W), new THREE.MeshBasicMaterial({ color: scol }));
      stripe.position.set(sx, 0.035, 0); scene.add(stripe);
      /* Label sits at the near end of the stripe; no flag. */
      startAt = new V3(sx, 0.2, FIELD_W / 2 - 0.5);
      var tb = spec.start.tb;
      if (tb && tb.row != null && rows[tb.row]) {
        var tz = rows[tb.row].z, fx = wx(tb.from), dir = sx >= fx ? 1 : -1, len = Math.abs(sx - fx), dash = 1.4, gap = 1;
        var dm = new THREE.MeshBasicMaterial({ color: lin(0xffffff), transparent: true, opacity: 0.9 });
        for (var dd = 0; dd + dash <= len; dd += dash + gap) {
          var piece = new THREE.Mesh(new THREE.BoxGeometry(dash, 0.06, 0.35), dm);
          piece.position.set(fx + dir * (dd + dash / 2), 0.06, tz); scene.add(piece);
        }
      }
    }
    /* Show a fraction (0..1) of one play, revealed along its path. */
    function reveal(r, frac) {
      var total = r.parts.reduce(function (s, p) { return s + p.len; }, 0) || 1, done = frac * total;
      r.parts.forEach(function (p) {
        var f = Math.max(0, Math.min(1, done / p.len)); done -= p.len;
        if (p.kind === "tube") {
          p.mesh.visible = f > 0;
          p.mesh.geometry.setDrawRange(0, Math.round(f * SEG) * RADS * 6);
        } else if (p.kind === "dots") {
          var k = Math.round(f * p.list.length);
          p.list.forEach(function (b, j) { b.visible = j < k; });
        } else p.mesh.visible = f >= 1;
      });
    }
    /* Where the tip of a play is at a fraction of its path (replay ball). */
    function tipAt(r, frac) {
      var total = r.parts.reduce(function (s, p) { return s + p.len; }, 0) || 1, done = frac * total, last = r.A;
      for (var k = 0; k < r.parts.length; k++) {
        var p = r.parts[k], f = done / p.len;
        if (f <= 1 || k === r.parts.length - 1) {
          f = Math.max(0, Math.min(1, f));
          if (p.curve) return p.curve.getPointAt(f);
          return p.from.clone().lerp(p.to, f);
        }
        done -= p.len; last = p.curve ? p.curve.getPointAt(1) : p.to;
      }
      return last.clone();
    }
    return {
      scene: scene, cam: cam, rows: rows, reveal: reveal, tipAt: tipAt, ball: ball, ltgM: ltgM, wx: wx, setLines: setLines, startAt: startAt, startLabel: spec.start && spec.start.label,
      laneGap: n > 1 ? (zNear - zFar) / (n - 1) : 10,
      dispose: function () {
        scene.traverse(function (obj) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
        });
        if (scene.background && scene.background.dispose) scene.background.dispose();
      }
    };
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
      o.save(); o.globalAlpha = b.a; o.translate(W / 2, H * 0.385); o.scale(b.s, b.s); o.rotate(-0.03);
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
    function scr(p) { var v = p.clone().project(B.cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; }
    var u = W / 360;
    o.textBaseline = "middle"; o.lineJoin = "round";
    labels.forEach(function (l) {
      var s0 = scr(l.p), s1 = scr(l.p.clone().setZ(l.z + B.laneGap));
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
    var HLC = fx ? { to: "#c62828", sc: "#1d6b3f", yd: "#17201b", loss: "#b4441d", fum: "#b4441d" } : {};
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

  function render(spec) {
    var key = JSON.stringify(spec);
    if (cache[key]) return cache[key];
    var W = Math.round(spec.width), H = Math.round(spec.height), r = renderer();
    r.setPixelRatio(1); r.setSize(W, H, false);
    var B = build(spec, W, H, r.capabilities.getMaxAnisotropy());
    B.rows.forEach(function (row) { B.reveal(row, 1); });
    /* Drive in progress: earlier plays stay dimmed exactly as the animation leaves them. */
    if (spec.dimFrom > 0) {
      var grey = new THREE.Color(0x8d968f).convertSRGBToLinear(), dim = 0.85;
      B.rows.forEach(function (row, k) {
        if (k >= spec.dimFrom) return;
        row.mats.concat(row.ghost ? [row.ghost.mat] : []).forEach(function (m) {
          m.transparent = true; m.opacity = (1 - 0.5 * dim) * (row.ghost && m === row.ghost.mat ? 0.35 : 1);
          m.color.lerp(grey, 0.35 * dim); m.emissive.multiplyScalar(1 - 0.6 * dim); m.needsUpdate = true;
        });
      });
    }
    B.setLines(spec.los, spec.ltg);
    r.render(B.scene, B.cam);
    var out = cvs(W, H), o = out.getContext("2d");
    o.drawImage(r.domElement, 0, 0);
    var ci = spec.callout ? spec.callout.row : -1;
    drawOverlay(o, W, H, B, B.rows.map(function (x) { return x.label; }).filter(Boolean), spec.callout, ci >= 0 && B.rows[ci] ? B.rows[ci].at : null);
    B.dispose();
    var url = out.toDataURL("image/jpeg", 0.9);
    var keys = Object.keys(cache); if (keys.length > 20) delete cache[keys[0]];
    cache[key] = url;
    return url;
  }

  /* ---------- Replay ----------
     The whole replay is a timeline built up front; renderAt(t) draws the state at time t, so
     it can run off requestAnimationFrame or a virtual clock (opts.clock) for frame capture.
     Beats per play: pre-snap (situation only, ball spotted, line to gain glides) -> snap
     (info box shows who/what but not the result) -> flight (ball rides the arrow tip; passes
     hang, runs burst then decelerate) -> result (full text, yardage chip pops) -> hold. */
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
    var y = g.yds, sg = (y > 0 ? "+" : y < 0 ? "−" : "") + Math.abs(y), GREY = "rgba(60,60,60,0.86)";
    switch (g.kind) {
      case "kick": return { text: Math.round(Math.abs(s.fe - s.fs)) + " yd kick" };
      case "ret": return { text: sg + " return" };
      case "inc": return { text: "Incomplete", bg: GREY };
      case "spike": return { text: "Spike", bg: GREY };
      case "nogain": return { text: "No gain", bg: GREY };
      case "sack": return { text: "Sack " + sg, bg: "#b4441d" };
      case "pen": return { text: sg + " penalty", bg: "#ffd23f", fg: "#17201b" };
      case "to":
        if (s.intAt != null) { var ry = Math.round(Math.abs(s.fe - s.intAt)); return { text: ry >= 1 ? ry + " yd return" : "No return", bg: s.retColor || "#8f1d1d" }; }
        return null;
      case "safety": return null;
      case "fg": return g.miss ? { text: "No good", bg: "#c62828" } : null;
      case "td": return { text: "TD " + sg, bg: s.color, big: true, td: true };
      default: return y < 0 ? { text: sg, bg: "#b4441d" } : y === 0 ? { text: "No gain", bg: GREY } : g.big ? { text: sg, bg: "#ffd23f", fg: "#17201b", big: true } : { text: sg };
    }
  }

  function replay(holder, spec, opts) {
    opts = opts || {};
    var W = Math.round(spec.width), H = Math.round(spec.height), u = W / 360;
    var wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;width:100%;aspect-ratio:" + W + "/" + H + ";border-radius:6px;overflow:hidden";
    var gl = document.createElement("canvas"), ov = document.createElement("canvas");
    gl.width = ov.width = W; gl.height = ov.height = H;
    gl.style.cssText = ov.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    wrap.appendChild(gl); wrap.appendChild(ov); holder.appendChild(wrap);
    var r = setupRenderer(new THREE.WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: !!opts.clock }));
    r.setPixelRatio(1); r.setSize(W, H, false);
    var B = build(spec, W, H, r.capabilities.getMaxAnisotropy()), o = ov.getContext("2d");
    var linger = Math.max(0, opts.linger != null ? +opts.linger : 1) * 1000;
    var P = plan(spec, B, linger), segs = P.segs;
    var grey = new THREE.Color(0x8d968f).convertSRGBToLinear();
    B.rows.forEach(function (row) {
      B.reveal(row, 0);
      row.mats.concat(row.ghost ? [row.ghost.mat] : [], row.ghost && row.ghost.solid ? [row.ghost.solid.mat] : [], row.solid ? [row.solid.mat] : []).forEach(function (m) { m.userData.base = m.color.clone(); m.userData.baseE = m.emissive.clone(); m.transparent = true; m.needsUpdate = true; });
    });
    /* Scoring end zones get a brief tint in the team colour (replay only). */
    var tints = [-55, 55].map(function (x) {
      var mm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      var pl = new THREE.Mesh(new THREE.PlaneGeometry(10, FIELD_W), mm);
      pl.rotation.x = -Math.PI / 2; pl.position.set(x, 0.06, 0); pl.visible = false; B.scene.add(pl); return pl;
    });
    var ltgAt = function (k) { return k >= 0 && spec.rows[k] ? spec.rows[k].ltg : null; };

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
    function activeAt(t) { for (var k = segs.length - 1; k >= 0; k--) if (t >= segs[k].t0) return k; return -1; }
    function setDim(m, dim, alpha) {
      m.opacity = (1 - 0.5 * dim) * (alpha == null ? 1 : alpha);
      m.color.copy(m.userData.base).lerp(grey, 0.35 * dim);
      m.emissive.copy(m.userData.baseE).multiplyScalar(1 - 0.6 * dim);
    }

    function renderAt(t) {
      var cur = activeAt(t), g = segs[cur], s = spec.rows[cur], outro = t >= P.outro;
      var undim = outro ? EASE.out(ramp(t, P.outro, 400)) : 0;
      segs.forEach(function (sg, k) {
        var row = B.rows[k], f = k < cur ? 1 : k === cur ? fracOf(sg, t) : 0;
        B.reveal(row, f);
        var dim = 0;
        if (k < cur) {
          var chainEnd = k + 1;
          while (segs[chainEnd] && segs[chainEnd].cont) chainEnd++;
          dim = segs[chainEnd] ? 0.85 * ramp(t, segs[chainEnd].t0, 260) : 0;
        }
        dim *= 1 - undim;
        row.mats.forEach(function (m) { setDim(m, dim); });
        /* Arrowheads / X pop in with a slight overshoot; the interception X flashes at the catch. */
        row.parts.forEach(function (p) {
          if (p.kind !== "end") return;
          if (p === row.intCross) {
            var ca = sg.catchAt != null ? sg.catchAt : sg.end;
            p.mesh.scale.setScalar(k === cur ? backOut(ramp(t, ca, 200)) * (1 + 0.6 * (1 - ramp(t, ca + 200, 350))) : 1);
          } else p.mesh.scale.setScalar(k === cur && t >= sg.end ? backOut((t - sg.end) / 240) : 1);
        });
        /* Incomplete: solid arc in flight, dotted + X once the ball arrives (150 ms crossfade). */
        if (row.solid) {
          var dots = row.parts[0];
          if (k === cur && t < sg.end) {
            dots.list.forEach(function (b) { b.visible = false; });
            row.solid.mesh.visible = f > 0; row.solid.mesh.geometry.setDrawRange(0, Math.round(f * SEG) * RADS * 6);
            setDim(row.solid.mat, 0); row.solid.mat.opacity = 1;
          } else if (k === cur && t < sg.end + 150) {
            row.solid.mesh.visible = true; row.solid.mesh.geometry.setDrawRange(0, Infinity);
            row.solid.mat.opacity = 1 - (t - sg.end) / 150;
          } else row.solid.mesh.visible = false;
        }
        /* Penalty: the underlying snap draws first, then fades back behind the walk-off. */
        if (row.ghost) {
          var gf = k === cur ? fracOf(sg, t, "g") : k < cur ? 1 : 0;
          B.reveal(row.ghost, gf);
          var fade = k < cur || t >= sg.walkAt ? 0.35 + 0.65 * (1 - ramp(t, sg.walkAt, 250)) : 1;
          setDim(row.ghost.mat, dim, fade * (1 - undim));
          row.ghost.parts.forEach(function (p) { if (p.kind === "end") p.mesh.scale.setScalar(k === cur && t >= sg.ghostEnd ? backOut((t - sg.ghostEnd) / 240) : 1); });
          var gso = row.ghost.solid;
          if (gso) {   /* same rule as any incomplete: solid in flight, dotted once it lands */
            if (k === cur && t < sg.ghostEnd) {
              row.ghost.parts[0].list.forEach(function (b) { b.visible = false; });
              gso.mesh.visible = gf > 0; gso.mesh.geometry.setDrawRange(0, Math.round(gf * SEG) * RADS * 6); setDim(gso.mat, 0, 1);
            } else if (k === cur && t < sg.ghostEnd + 150) {
              gso.mesh.visible = true; gso.mesh.geometry.setDrawRange(0, Infinity); setDim(gso.mat, 0, 1 - (t - sg.ghostEnd) / 150);
            } else gso.mesh.visible = false;
          }
        }
        if (row.missX) { row.missX.visible = k < cur || (k === cur && t >= sg.end); row.missX.scale.setScalar(k === cur ? backOut(ramp(t, sg.end, 240)) : 1); }
      });
      /* Line to gain glides to the new spot during the pre-snap beat. */
      var L = B.ltgM;
      if (outro) { B.setLines(spec.los, spec.ltg); }
      else if (g) {
        var to = ltgAt(cur), from = g.cont ? to : ltgAt(cur - 1);
        if (to == null) L.visible = false;
        else {
          L.visible = true;
          var e = from == null ? 1 : EASE.out(ramp(t, g.t0, 320));
          L.position.x = B.wx(from == null ? to : from + (to - from) * e);
        }
      }
      /* Ball: spotted at the start, rides the tip of the arrow, rests where the play ended. */
      var ball = B.ball, row = B.rows[cur];
      ball.visible = false;
      if (g && !outro) {
        ball.visible = true; ball.rotation.set(0, 0, 0);
        var lift = 0.35, sc = 1, pos;
        if (t < g.snap) {
          var prev = cur > 0 ? B.rows[cur - 1].end : null, m = cur === 0 || g.cont ? 1 : EASE.out(ramp(t, g.t0, 260));
          pos = prev && !g.cont ? prev.clone().lerp(row.A, m) : row.A.clone();
          if (prev && !g.cont) pos.y += Math.sin(Math.PI * m) * 1.2;
          if (cur === 0) sc *= backOut(ramp(t, g.t0 + 150, 300));
        } else if (row.ghost && t < g.walkAt) {
          if (t < g.ghostEnd) { pos = B.tipAt(row.ghost, fracOf(g, t, "g")); ball.rotation.x = row.ghost.inc || s.prePlay.type === "air" ? (t - g.snap) / 40 : 0; }
          else {
            /* Flag: the ball goes back to the spot of the foul. */
            var bk = EASE.out(ramp(t, g.ghostEnd + 80, 260));
            pos = row.ghost.end.clone().lerp(row.A, bk); pos.y += Math.sin(Math.PI * bk) * 1.2;
          }
        } else {
          var fr = fracOf(g, t);
          pos = g.type === "dot" ? row.A.clone() : B.tipAt(row, fr);
          if (g.type === "dot" && t >= g.end) pos.x += Math.sin((t - g.end) / 22) * 0.35 * (1 - ramp(t, g.end, 260));
          if (g.kind === "fg" && t < g.end) pos.y += Math.sin(Math.PI * fr) * 9;
          if (g.kind === "pen" && !row.ghost && t < g.phases[0].a + g.phases[0].d) pos = row.A.clone();
          var flying = t < g.end && (g.type === "air" || g.type === "inc" || g.type === "kick" || g.kind === "fg") && (g.catchAt == null || t < g.catchAt);
          if (flying) ball.rotation.x = (t - g.snap) / 40;
          if (g.kind === "inc" && t >= g.end) { sc *= 1 - ramp(t, g.end, 260); pos.y -= 0.6 * ramp(t, g.end, 260); }
        }
        ball.position.copy(pos).setY(pos.y + lift);
        /* Never smaller than ~6 px on a 360 px wide chart. */
        var dist = B.cam.position.distanceTo(ball.position), ppu = H / (2 * Math.tan(B.cam.fov * Math.PI / 360) * dist);
        var base = Math.max(0.6, 6 * u / (3 * ppu));
        ball.scale.setScalar(Math.max(0.0001, base * sc));
        if (sc < 0.01) ball.visible = false;
      }
      /* End-zone tint on a touchdown / good field goal: ~25 %, ~300 ms. */
      tints.forEach(function (pl) { pl.visible = false; });
      if (g && !outro && (g.kind === "td" || (g.kind === "fg" && !g.miss)) && t >= g.end) {
        var side = s.fe >= 50 ? 1 : 0, env = ramp(t, g.end, 80) * (1 - ramp(t, g.end + 300, 160));
        if (env > 0) { var pl = tints[side]; pl.visible = true; pl.material.color.set(s.color).convertSRGBToLinear(); pl.material.opacity = 0.25 * env; }
      }
      r.render(B.scene, B.cam);
      drawState(t, cur, g, s, outro);
    }

    function resultOf(k) { var c = (spec.rows[k] || {}).callout || {}; return { l1: c.l1 || "", l2: c.l2 || "", hls: c.hls || [] }; }
    function drawState(t, cur, g, s, outro) {
      o.clearRect(0, 0, W, H);
      var labels = [], fx = { chips: [], banner: null }, co = null, chipRows = {};
      if (g && !outro) {
        /* Result chip at the end of the play; fades as the next play is spotted. */
        for (var k = cur; k >= Math.max(0, cur - 1); k--) {
          var sg = segs[k], ch = chipFor(spec.rows[k], sg);
          if (!ch || t < sg.end) continue;
          var nx = segs[k + 1], fade = nx && t >= nx.t0 ? 1 - ramp(t, nx.t0, 220) : 1;
          if (k < cur && nx && nx.cont) fade = 1 - ramp(t, nx.end, 200);
          if (fade <= 0) continue;
          var e = B.rows[k], pt = sg.type === "dot" ? e.A : e.end;
          fx.chips.push({ p: pt.clone().setY(1.4), text: ch.text, bg: ch.bg, fg: ch.fg, big: ch.big, s: backOut(ramp(t, sg.end, 260)), a: fade });
          if (ch.td) chipRows[k] = 1;   /* "TD +3" replaces the TD label while it shows */
        }
        if (t >= g.end && !g.miss && (g.kind === "td" || g.kind === "to" || g.kind === "fg" || g.kind === "safety")) {
          var bt = g.kind === "td" ? "TOUCHDOWN" : g.kind === "fg" ? "FIELD GOAL" : g.kind === "safety" ? "SAFETY" : (/fumble/i.test((s.callout || {}).l1 + " " + (s.callout || {}).l2) ? "FUMBLE" : "INTERCEPTED");
          var bin = backOut(ramp(t, g.end + 120, 300)), bout = 1 - ramp(t, Math.min(g.holdEnd - 220, g.end + 1500), 250);
          fx.banner = { text: bt, bg: g.kind === "to" || g.kind === "safety" ? "#c62828" : s.color, fg: "#fff", s: bin, a: bout, size: g.kind === "fg" ? 18 : 22 };
        }
      }
      segs.forEach(function (sg, k) { if ((k < cur || (k === cur && t >= sg.end) || outro) && B.rows[k].label && !chipRows[k]) labels.push(B.rows[k].label); });
      if (g && !outro && s.callout) {
        var c = s.callout, head = c.rhead || c.head;
        if (t < g.snap && !g.cont) {
          /* Pre-snap: the new situation on top, the previous result still readable in grey. */
          var pr = cur > 0 ? resultOf(cur - 1) : { l1: "", l2: "" };
          co = { head: head, l1: pr.l1, l2: pr.l2, hls: [], muted: true, note: s.tmo ? "after " + s.tmo : "" };
        } else if (t < g.end) co = { head: head, l1: (c.pre || {}).l1 || "", l2: (c.pre || {}).l2 || "", hls: [] };
        else co = { head: head, l1: c.l1, l2: c.l2, hls: c.hls };
      } else if (outro && spec.callout) co = spec.callout;   /* matches the still image that replaces the replay */
      drawOverlay(o, W, H, B, labels, co, null, fx);
    }

    var raf = 0, stopped = false, done = false, start = null, now = 0;
    function check(t) { if (!done && t >= P.total) { done = true; if (opts.onDone) opts.onDone(); } }
    function frame(ts) {
      if (stopped) return;
      if (start == null) start = ts;
      var t = Math.min(ts - start, P.total);
      renderAt(t);
      if (t >= P.total) { check(t); return; }
      raf = requestAnimationFrame(frame);
    }
    if (!opts.clock) raf = requestAnimationFrame(frame);
    else renderAt(0);
    return {
      total: P.total,
      timeline: segs.map(function (g) {
        return { row: g.k, kind: g.kind, type: g.type, yds: g.yds, cont: g.cont, num: g.num, t0: g.t0, snap: g.snap, catchAt: g.catchAt || null, ghostEnd: g.ghostEnd || null, walkAt: g.walkAt || null,
          end: g.end, holdEnd: g.holdEnd, read: g.read, newChars: g.newChars, emph: g.emph,
          phases: g.phases.map(function (p) { return { tgt: p.tgt, a: p.a, d: p.d, f0: p.f0, f1: p.f1 }; }) };
      }),
      /* Virtual clock (opts.clock): seek to an absolute time or step forward; renders one frame. */
      seek: function (ms) { if (stopped) return; now = clamp(ms, 0, P.total); renderAt(now); check(now); return now; },
      step: function (ms) { return this.seek(now + (ms == null ? 1000 / 30 : ms)); },
      stop: function () {
        stopped = true; cancelAnimationFrame(raf);
        B.dispose(); r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    };
  }

  window.Chart3D = { render: render, replay: replay, ready: function () { return fontsReady; }, onReady: null };
})();
