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
      var parts = [], end = E;
      function tube(curve) {
        var t = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, RAD, RADS, false), m);
        t.castShadow = true; scene.add(t); parts.push({ kind: "tube", mesh: t, len: curve.getLength() });
      }
      function cone(tip, dir) {
        dir = dir.clone().normalize();
        var c = new THREE.Mesh(new THREE.ConeGeometry(RAD * 2, CONE, 18), m);
        c.position.copy(tip.clone().sub(dir.clone().multiplyScalar(CONE / 2)));
        c.quaternion.setFromUnitVectors(up, dir); c.castShadow = true; scene.add(c);
        parts.push({ kind: "end", mesh: c, len: CONE * 0.6 });
      }
      function cross(p) {
        var g = new THREE.Group();
        [Math.PI / 4, -Math.PI / 4].forEach(function (a) {
          var b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.35), m); b.rotation.z = a; g.add(b);
        });
        g.position.copy(p); scene.add(g); parts.push({ kind: "end", mesh: g, len: 1 });
      }
      function stub(at, d) {
        tube(new THREE.LineCurve3(new V3(at.x - d * 3.4, Y, z), new V3(at.x - d * CONE * 0.9, Y, z)));
        cone(at, new V3(d, 0, 0));
      }
      var kick = row.type === "kick";
      function arcH(len) { return Math.max(0.9, Math.min(kick ? 16 : 11, len * (kick ? 0.33 : 0.27))); }
      function arc(P, Q) { var h = arcH(Math.abs(Q.x - P.x)); return new THREE.QuadraticBezierCurve3(P, new V3((P.x + Q.x) / 2, Y + 2 * h, z), Q); }
      if (row.type === "dot") {
        stub(A, row.dir || 1); end = A;
      } else if (row.type === "air" || row.type === "inc" || kick) {
        var C = row.fc != null ? new V3(wx(row.fc), Y, z) : E, airLen = Math.abs(C.x - A.x);
        var glen = row.fc != null ? Math.abs(E.x - C.x) : 0, hasRun = glen > CONE * 1.1;
        if (row.type === "inc") {
          var ai = arc(A, C), pts = ai.getSpacedPoints(Math.max(4, Math.round(ai.getLength() / 1.7))), dots = [];
          pts.forEach(function (p) { var b = new THREE.Mesh(new THREE.SphereGeometry(RAD * 0.9, 12, 10), m); b.position.copy(p); b.castShadow = true; scene.add(b); dots.push(b); });
          parts.push({ kind: "dots", list: dots, len: ai.getLength() });
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
      rows.push({ parts: parts, z: z, A: A, end: end, label: row.label ? { p: end.clone().setY(Y), z: z, dir: end.x > A.x ? 1 : end.x < A.x ? -1 : (row.dir || 1), text: row.label } : null, at: end.clone().setY(Y + 1.6) });
    });
    /* Drive start: a stripe across the field and a flag in the offense's colour on the near side.
       After a touchback, a dashed line runs from the end zone to the start line. */
    var startAt = null;
    if (spec.start && spec.start.f != null) {
      var sx = wx(spec.start.f), scol = lin(spec.start.color || "#ffffff");
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, FIELD_W), new THREE.MeshBasicMaterial({ color: scol }));
      stripe.position.set(sx, 0.035, 0); scene.add(stripe);
      var pz = FIELD_W / 2 - 1.5;
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 11, 10), new THREE.MeshStandardMaterial({ color: lin(0xf2f2f2), roughness: 0.5 }));
      pole.position.set(sx, 5.5, pz); pole.castShadow = true; scene.add(pole);
      var fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(6 * (spec.start.dir || 1), -1.8); fs.lineTo(0, -3.6); fs.lineTo(0, 0);
      var flag = new THREE.Mesh(new THREE.ShapeGeometry(fs), new THREE.MeshStandardMaterial({ color: scol, side: THREE.DoubleSide, roughness: 0.5, emissive: scol.clone().multiplyScalar(0.15) }));
      flag.position.set(sx, 11, pz); flag.castShadow = true; scene.add(flag);
      startAt = new V3(sx, 12.6, pz);
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
    return {
      scene: scene, cam: cam, rows: rows, reveal: reveal, setLines: setLines, startAt: startAt, startLabel: spec.start && spec.start.label,
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
  function drawOverlay(o, W, H, B, labels, callout, at) {
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
      var sp = scr(B.startAt), sfs = Math.round(11 * u);
      o.font = "700 " + sfs + "px " + DISPLAY;
      var sw = o.measureText(B.startLabel).width + sfs * 0.8, sh = sfs * 1.3;
      var sx0 = Math.max(2 * u, Math.min(W - sw - 2 * u, sp[0] - sw / 2));
      o.fillStyle = "rgba(10,25,15,0.72)"; o.beginPath();
      if (o.roundRect) o.roundRect(sx0, sp[1] - sh, sw, sh, sh / 2); else o.rect(sx0, sp[1] - sh, sw, sh);
      o.fill(); o.fillStyle = "#fff"; o.textAlign = "center"; o.fillText(B.startLabel, sx0 + sw / 2, sp[1] - sh / 2);
    }
    if (!callout) return;
    /* The info box always sits in the same place, across the top. */
    var c = callout, pad = 8 * u, lh = 14 * u, TEXT = "#3c463f";
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
        out.push([best.h.t, FH]);
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
    function drawLine(line, y) {
      var x = bx + pad;
      pieces(line).forEach(function (p) { o.font = p[1]; o.fillStyle = TEXT; o.fillText(p[0], x, y); x += o.measureText(p[0]).width; });
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

  /* Replay: plays appear one at a time. For each play the lines move to where it started,
     the arrow draws itself along its path, then the callout shows for `linger` seconds. */
  function replay(holder, spec, opts) {
    opts = opts || {};
    var W = Math.round(spec.width), H = Math.round(spec.height);
    var wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;width:100%;aspect-ratio:" + W + "/" + H + ";border-radius:6px;overflow:hidden";
    var gl = document.createElement("canvas"), ov = document.createElement("canvas");
    gl.width = ov.width = W; gl.height = ov.height = H;
    gl.style.cssText = ov.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    wrap.appendChild(gl); wrap.appendChild(ov); holder.appendChild(wrap);
    var r = setupRenderer(new THREE.WebGLRenderer({ canvas: gl, antialias: true }));
    r.setPixelRatio(1); r.setSize(W, H, false);
    var B = build(spec, W, H, r.capabilities.getMaxAnisotropy()), o = ov.getContext("2d");
    B.rows.forEach(function (row) { B.reveal(row, 0); });
    var i = 0, phase = "start", t0 = 0, raf = 0, stopped = false, linger = Math.max(0, +opts.linger || 1) * 1000;
    function dur(k) {
      var s = spec.rows[k]; if (!s) return 800;
      var len = Math.abs((s.fc != null ? Math.abs(s.fc - s.fs) + Math.abs(s.fe - s.fc) : Math.abs(s.fe - s.fs)));
      return Math.max(700, Math.min(s.type === "kick" ? 2000 : 1700, 550 + len * 28));
    }
    function overlay(showCallout, playDone) {
      o.clearRect(0, 0, W, H);
      var labels = B.rows.slice(0, playDone ? i + 1 : i).map(function (x) { return x.label; }).filter(Boolean);
      var row = spec.rows[i];
      drawOverlay(o, W, H, B, labels, showCallout && row ? row.callout : null, showCallout && B.rows[i] ? B.rows[i].at : null);
    }
    function frame(now) {
      if (stopped) return;
      if (phase === "start") {
        var row = spec.rows[i];
        /* The info box shows as the play starts, so it can be read while the arrow draws. */
        B.setLines(row.los, row.ltg); overlay(true, false); phase = "anim"; t0 = now;
      }
      if (phase === "anim") {
        var f = Math.min(1, (now - t0) / dur(i)), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
        B.reveal(B.rows[i], e);
        if (f >= 1) { phase = "hold"; t0 = now; overlay(true, true); }
      } else if (phase === "hold" && now - t0 >= linger) {
        i++;
        if (i >= spec.rows.length) {
          B.setLines(spec.los, spec.ltg);
          r.render(B.scene, B.cam);
          finish(); return;
        }
        phase = "start";
      }
      r.render(B.scene, B.cam);
      raf = requestAnimationFrame(frame);
    }
    function finish() { stopped = true; if (opts.onDone) opts.onDone(); }
    raf = requestAnimationFrame(frame);
    return {
      stop: function () {
        stopped = true; cancelAnimationFrame(raf);
        B.dispose(); r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    };
  }

  window.Chart3D = { render: render, replay: replay, ready: function () { return fontsReady; }, onReady: null };
})();
