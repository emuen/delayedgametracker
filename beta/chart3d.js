/* Delay Booth 3D drive chart (test).
   build() turns a drive into a three.js scene. render() draws it once and returns a
   JPEG data URL (a plain image, so re-renders never pile up WebGL contexts).
   replay() plays the drive back on a live canvas, one play at a time.
   Field coordinates: f = yards from the LEFT goal line (0..100), end zones -10..0 and
   100..110. World: x = f - 50, z = depth (far sideline negative), y = up. */
(function () {
  "use strict";
  var R = null, cache = {}, fontsReady = false;
  var FIELD_W = 53.3, K = window.DriveCore, DISPLAY = K.DISPLAY;
  var EASE = K.EASE, backOut = K.backOut, clamp = K.clamp, ramp = K.ramp, plan = K.plan, drawOverlay = K.drawOverlay;
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
    for (var i = 0; i < 10; i++) { x.fillStyle = i % 2 ? "#7daa66" : "#76a260"; x.fillRect((10 + i * 10) * PX, 0, 10 * PX, H); }
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
    g.addColorStop(0, "#d9d7d1"); g.addColorStop(0.55, "#e9e7e2"); g.addColorStop(1, "#f3f2ee");
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
    /* fov 26 (was 24): the smallest view that keeps the goal posts on the end lines in the frame. */
    var cam = new THREE.PerspectiveCamera(cv.fov || 26, W / H, 1, 1000);
    cam.position.set(0, cv.y || 82, cv.z || 138); cam.lookAt(0, cv.ly != null ? cv.ly : 8, cv.lz != null ? cv.lz : -3);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2c4a26, 0.5));
    var sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(-25, 60, 35); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 200;
    scene.add(sun);
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), new THREE.MeshLambertMaterial({ color: lin(0x557f47) }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -FIELD_W / 2 + 100); scene.add(ground);
    var field = new THREE.Mesh(new THREE.PlaneGeometry(120, FIELD_W), new THREE.MeshLambertMaterial({ map: fieldTexture(spec, aniso) }));
    field.rotation.x = -Math.PI / 2; field.receiveShadow = true; scene.add(field);

    function wx(f) { return Math.max(-60, Math.min(60, f - 50)); }
    /* Goal posts on both end lines (always shown): base behind the end line, gooseneck, crossbar
       across the field's width direction and two uprights. Each upright has its own material so a
       doink can flash and shake just the one that was hit. */
    var GL = K.GOAL, uprights = {}, ycol = lin("#f4c430");
    var ymat = new THREE.MeshStandardMaterial({ color: ycol, roughness: 0.4, metalness: 0.2, emissive: ycol.clone().multiplyScalar(0.18) });
    [-1, 1].forEach(function (es) {
      var x0 = es * 60, xb = es * (60 + GL.back), baseH = GL.cb - 1.3;
      function add(geo, mm) { var me = new THREE.Mesh(geo, mm || ymat); me.castShadow = true; scene.add(me); return me; }
      add(new THREE.CylinderGeometry(0.3, 0.34, baseH, 10)).position.set(xb, baseH / 2, 0);
      add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(xb, baseH - 0.05, 0), new THREE.Vector3(xb, GL.cb, 0), new THREE.Vector3(x0, GL.cb, 0)), 12, 0.28, 8, false));
      var bar = add(new THREE.CylinderGeometry(0.25, 0.25, 2 * GL.hw + 0.5, 10)); bar.rotation.x = Math.PI / 2; bar.position.set(x0, GL.cb, 0);
      uprights[es] = {};
      [-1, 1].forEach(function (zs) {
        var um = ymat.clone(), ug = new THREE.CylinderGeometry(0.22, 0.25, GL.top - GL.cb, 10);
        ug.translate(0, (GL.top - GL.cb) / 2, 0);   /* pivot at the crossbar, so a shake sways the top */
        var up2 = add(ug, um); up2.position.set(x0, GL.cb, zs * GL.hw); up2.userData.baseE = um.emissive.clone(); uprights[es][zs] = up2;
      });
    });
    /* Doink: the hit upright flashes and sways for a moment (amt 0..1, k = ms since contact). */
    function shake(es, zs, amt, k) {
      [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { var u2 = uprights[a][b]; u2.rotation.set(0, 0, 0); u2.material.emissive.copy(u2.userData.baseE); }); });
      if (!(amt > 0) || !uprights[es] || !uprights[es][zs]) return;
      var u3 = uprights[es][zs];
      u3.rotation.z = 0.11 * amt * Math.sin(k / 24); u3.rotation.x = 0.04 * amt * Math.sin(k / 31);
      u3.material.emissive.setRGB(1, 1, 0.85).multiplyScalar(0.9 * Math.max(0, 1 - k / 260));
    }
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

    /* Lanes at a fixed step (drivecore LANES): the newest play just inside the near sideline. Each
       play is built at z = 0 inside its own group, which is moved to its lane. */
    var n = spec.rows.length, zNear = 13, STEP = 3.3,   /* nearest lane clear of the yard numbers */ Y = 0.72, RAD = 0.62, CONE = 2.6;
    var V3 = THREE.Vector3, up = new V3(0, 1, 0), rows = [];
    spec.rows.forEach(function (row, i) {
      var z = 0, grp = new THREE.Group(); scene.add(grp);
      var m = mat(row.color), A = new V3(wx(row.fs), Y, z), E = new V3(wx(row.fe), Y, z);
      var parts = [], end = E, mats = [m], intCross = null, split = null;
      function tube(curve) {
        var t = new THREE.Mesh(new THREE.TubeGeometry(curve, SEG, RAD, RADS, false), m);
        t.castShadow = true; grp.add(t); parts.push({ kind: "tube", mesh: t, len: curve.getLength(), curve: curve });
      }
      function cone(tip, dir) {
        dir = dir.clone().normalize();
        var c = new THREE.Mesh(new THREE.ConeGeometry(RAD * 2, CONE, 18), m);
        c.position.copy(tip.clone().sub(dir.clone().multiplyScalar(CONE / 2)));
        c.quaternion.setFromUnitVectors(up, dir); c.castShadow = true; grp.add(c);
        parts.push({ kind: "end", mesh: c, len: CONE * 0.6, from: tip.clone().sub(dir.clone().multiplyScalar(CONE)), to: tip.clone() });
      }
      function cross(p) {
        var g = new THREE.Group();
        [Math.PI / 4, -Math.PI / 4].forEach(function (a) {
          var b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.35), m); b.rotation.z = a; g.add(b);
        });
        g.position.copy(p); grp.add(g); parts.push({ kind: "end", mesh: g, len: 1, from: p.clone(), to: p.clone() });
      }
      function stub(at, d) {
        tube(new THREE.LineCurve3(new V3(at.x - d * 3.4, Y, z), new V3(at.x - d * CONE * 0.9, Y, z)));
        cone(at, new V3(d, 0, 0));
      }
      function dotsOn(curve) {
        var pts = curve.getSpacedPoints(Math.max(3, Math.round(curve.getLength() / 1.5))), list = [];
        pts.forEach(function (p) { var b = new THREE.Mesh(new THREE.SphereGeometry(RAD * 0.8, 12, 10), m); b.position.copy(p); b.castShadow = true; grp.add(b); list.push(b); });
        parts.push({ kind: "dots", list: list, len: curve.getLength(), curve: curve });
      }
      /* Along the turf from P to Q; at each lateral a short dotted hop back, then the next carrier's leg. */
      function groundTo(P, Q, lats) {
        var cur = P, bd = -(row.dir || 1);
        (lats || []).forEach(function (lf) {
          var Lp = new V3(wx(lf), Y, z), hb = new V3(Lp.x + bd * 1.8, Y, z);
          if (Math.abs(Lp.x - cur.x) > 0.3) tube(new THREE.LineCurve3(cur, Lp));
          dotsOn(new THREE.QuadraticBezierCurve3(Lp, new V3((Lp.x + hb.x) / 2, Y + 1.8, z), hb));
          cur = hb;
        });
        var dd = Q.x >= cur.x ? 1 : -1;
        if (Math.abs(Q.x - cur.x) > CONE * 1.1) tube(new THREE.LineCurve3(cur, new V3(Q.x - dd * CONE * 0.9, Y, z)));
        cone(Q, new V3(dd, 0, 0));
      }
      /* Where possession changed on a fumble or muff: a red ring with a white rim, flat on the turf. */
      function ring(p) {
        var rg = new THREE.Group(), rm = mat("#d32f2f"), wm = mat("#ffffff"); mats.push(rm, wm);
        /* Tilted toward the camera so it reads as a ring at this angle, not a flat line. */
        var tw = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.6, 8, 40), wm); tw.position.z = -0.45; rg.add(tw);
        var tr = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.44, 10, 40), rm); tr.position.z = 0.3; rg.add(tr);
        rg.rotation.x = -0.75; rg.position.set(p.x, Y + 0.5, p.z); grp.add(rg);
        parts.push({ kind: "end", mesh: rg, len: 1, from: p.clone(), to: p.clone() });
      }
      var kick = row.type === "kick", contact = null, chipPt = null, tapEnd = null;
      function arcH(len) { return Math.max(0.9, Math.min(kick ? 16 : 11, len * (kick ? 0.33 : 0.27))); }
      function arc(P, Q) { var h = arcH(Math.abs(Q.x - P.x)); return new THREE.QuadraticBezierCurve3(P, new V3((P.x + Q.x) / 2, Y + 2 * h, z), Q); }
      if (row.type === "fg" || row.blocked) {
        /* Field goal (or blocked kick): the flight from the spot of the kick toward the posts in
           the far end zone, leaving the play's lane for the posts' centre (local z = -zNear at
           depth 0); a miss ends in a red X, a doink adds the carom off the upright. */
        var fp = K.fgPath(row), mainF = m;
        function fv(q) { return new V3(q.f - 50, Y + q.h, -zNear * q.b + q.zo); }
        var tipV = null, cPt = null;
        fp.pieces.forEach(function (pts, pi) {
          var cvF = new THREE.CatmullRomCurve3(pts.map(fv)), last = pi === fp.pieces.length - 1;
          tipV = cvF.getPointAt(1); if (pi === 0 && fp.contact) cPt = tipV.clone();
          /* The path stops short of the arrowhead / X so neither is buried in the tube. */
          var gap = !last ? 0 : fp.end === "cone" ? CONE * 0.9 : 1.2;
          if (gap && cvF.getLength() > gap * 1.6) {
            var u0 = 1 - gap / cvF.getLength(), cut = [];
            for (var q = 0; q <= 30; q++) cut.push(cvF.getPointAt(u0 * q / 30));
            tube(new THREE.CatmullRomCurve3(cut));
            if (fp.end === "cone") cone(tipV, tipV.clone().sub(cvF.getPointAt(u0)));
          } else tube(cvF);
        });
        if (fp.end === "cross") {
          /* A larger red X with a white outline, so it shows on any end-zone colour. */
          var xr = mat("#d32f2f"), xw = mat("#ffffff"), xg = new THREE.Group(); mats.push(xr, xw);
          [Math.PI / 4, -Math.PI / 4].forEach(function (a) {
            var bw = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.95, 0.3), xw); bw.rotation.z = a; xg.add(bw);
            var br = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.5), xr); br.rotation.z = a; br.position.z = 0.25; xg.add(br);
          });
          xg.position.copy(tipV).setY(Math.max(tipV.y, Y + 0.9)); grp.add(xg); parts.push({ kind: "end", mesh: xg, len: 1, from: tipV.clone(), to: tipV.clone() });
        }
        end = tipV.clone(); tapEnd = new V3(wx(fp.pieces[0][fp.pieces[0].length - 1].f), Y, z);   /* tap target stays on the lane */
        if (fp.chip) chipPt = fv(fp.chip);
        if (fp.contact && fp.pieces.length > 1) { contact = cPt; split = parts[0].len / (parts.reduce(function (s2, p2) { return s2 + p2.len; }, 0) || 1); }
      } else if (row.intAt != null && row.type === "air") {
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
      } else if (row.type === "none") {
        end = A;   /* nothing drawn: offsetting fouls (their ghost only) or a defensive 2-pt */
      } else if (row.lats && (row.type === "air" || row.type === "ground")) {
        /* Laterals: the catch (or run), a dotted hop at each lateral, then the next carrier. */
        var Cl = row.type === "air" ? new V3(wx(row.fc != null ? row.fc : row.lats[0]), Y, z) : A;
        if (row.type === "air") tube(arc(A, Cl));
        groundTo(Cl, E, row.lats); end = E;
        if (row.type === "air") split = parts[0].len / (parts.reduce(function (s2, p2) { return s2 + p2.len; }, 0) || 1);
      } else if (row.type === "dot") {
        stub(A, row.dir || 1); end = A;
      } else if (row.type === "air" || row.type === "inc" || kick) {
        var C = row.fc != null ? new V3(wx(row.fc), Y, z) : E, airLen = Math.abs(C.x - A.x);
        var glen = row.fc != null ? Math.abs(E.x - C.x) : 0, hasRun = glen > CONE * 1.1;
        if (row.type === "inc") {
          var ai = arc(A, C), pts = ai.getSpacedPoints(Math.max(4, Math.round(ai.getLength() / 1.7))), dots = [];
          pts.forEach(function (p) { var b = new THREE.Mesh(new THREE.SphereGeometry(RAD * 0.9, 12, 10), m); b.position.copy(p); b.castShadow = true; grp.add(b); dots.push(b); });
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
      if (row.ring) ring(end.clone().setY(Y));
      /* Replay-only pieces, built hidden so the still image never shows them. */
      function hide(ps) { ps.forEach(function (p) { if (p.mesh) p.mesh.visible = false; if (p.list) p.list.forEach(function (b) { b.visible = false; }); }); }
      var solid = null, ghost = null, missX = null;
      if (row.type === "inc") {
        /* An incomplete pass flies as a solid arc; it turns dotted only when the ball arrives. */
        var sm = m.clone(); sm.transparent = true;
        var sMesh = new THREE.Mesh(new THREE.TubeGeometry(ai, SEG, RAD, RADS, false), sm);
        sMesh.castShadow = true; sMesh.visible = false; grp.add(sMesh); solid = { mesh: sMesh, mat: sm };
      }
      if (row.prePlay) {
        /* Penalty: the snap that happened before the flag, drawn first, then the walk-off. */
        var keepP = parts, keepM = m, pp = row.prePlay, gd = (row.dir || 1), G = new V3(A.x + gd * pp.len, Y, z), gmats = [];
        parts = []; m = mat(row.ghostColor || "#1d3f8f"); m.transparent = true; gmats.push(m);
        if (pp.type === "kick") {
          /* A kick that didn't count: its high arc. */
          var kh = Math.max(0.9, Math.min(16, Math.abs(pp.len) * 0.33)), kd2 = pp.len >= 0 ? gd : -gd;
          tube(new THREE.QuadraticBezierCurve3(A, new V3((A.x + G.x) / 2, Y + 2 * kh, z), new V3(G.x - kd2 * CONE * 0.85, Y, z))); cone(G, new V3(kd2, 0, 0));
        } else if (pp.type === "int") {
          /* An interception that didn't count: the pass, the red X, the return in the defence's colour. */
          if (Math.abs(pp.len) >= 1) tube(arc(A, G));
          var gx = mat("#d32f2f"); gx.transparent = true; gmats.push(gx); m = gx; cross(G.clone().setY(Y + 0.3));
          var R = new V3(G.x + gd * (pp.ret || 0), Y, z), rd2 = R.x >= G.x ? 1 : -1;
          if (Math.abs(R.x - G.x) >= 1) {
            m = mat(pp.retColor || "#8f1d1d"); m.transparent = true; gmats.push(m);
            if (Math.abs(R.x - G.x) > CONE * 1.1) tube(new THREE.LineCurve3(G, new V3(R.x - rd2 * CONE * 0.9, Y, z)));
            cone(R, new V3(rd2, 0, 0)); G = R;
          }
          m = gmats[0];
        } else if (pp.type === "inc") {
          var ga = arc(A, G), gpts = ga.getSpacedPoints(Math.max(4, Math.round(ga.getLength() / 1.7))), gdots = [];
          gpts.forEach(function (p) { var b = new THREE.Mesh(new THREE.SphereGeometry(RAD * 0.9, 12, 10), m); b.position.copy(p); grp.add(b); gdots.push(b); });
          parts.push({ kind: "dots", list: gdots, len: ga.getLength(), curve: ga }); cross(G.clone().setY(Y + 0.3));
        } else if (Math.abs(pp.len) < 1) stub(A, gd);
        else {
          var gdir = pp.len > 0 ? gd : -gd;
          if (pp.type === "air") { tube(arc(A, new V3(G.x - gdir * Math.min(CONE * 0.85, Math.abs(pp.len) * 0.35), Y, z))); cone(G, new V3(gdir, 0, 0)); }
          else { if (Math.abs(pp.len) > CONE * 1.1) tube(new THREE.LineCurve3(A, new V3(G.x - gdir * CONE * 0.9, Y, z))); cone(G, new V3(gdir, 0, 0)); }
        }
        ghost = { parts: parts, A: A, mat: m, mats: gmats, inc: pp.type === "inc", end: G };
        /* A ghost never casts a shadow (an erased play must leave nothing on the turf). */
        parts.forEach(function (p) { if (p.mesh) p.mesh.traverse(function (o) { o.castShadow = false; }); if (p.list) p.list.forEach(function (b) { b.castShadow = false; }); });
        if (pp.type === "inc") {
          var gsm = m.clone(), gs = new THREE.Mesh(new THREE.TubeGeometry(ga, SEG, RAD, RADS, false), gsm);
          gs.visible = false; grp.add(gs); ghost.solid = { mesh: gs, mat: gsm };
        }
        hide(parts); parts = keepP; m = keepM;
      }
      if (row.fgMiss && row.type !== "fg" && !row.blocked) {
        var xm = mat("#d32f2f"); missX = new THREE.Group();
        [Math.PI / 4, -Math.PI / 4].forEach(function (a) { var b = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 0.45), xm); b.rotation.z = a; missX.add(b); });
        missX.position.copy(E).setY(Y + 2.5); missX.visible = false; grp.add(missX);
      }
      rows.push({ grp: grp, parts: parts, z: z, A: A, end: end, mat: m, mats: mats, split: split, contact: contact, chipPt: chipPt, tapEnd: tapEnd, intCross: intCross, solid: solid, ghost: ghost, missX: missX, label: row.label ? { p: end.clone().setY(Y), z: z, dir: end.x > A.x ? 1 : end.x < A.x ? -1 : (row.dir || 1), text: row.label } : null, at: end.clone().setY(Y + 1.6) });
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
        var tz = 0, tbg = rows[tb.row].grp, fx = wx(tb.from), dir = sx >= fx ? 1 : -1, len = Math.abs(sx - fx), dash = 1.4, gap = 1;
        var dm = new THREE.MeshBasicMaterial({ color: lin(0xffffff), transparent: true, opacity: 0.9 });
        for (var dd = 0; dd + dash <= len; dd += dash + gap) {
          var piece = new THREE.Mesh(new THREE.BoxGeometry(dash, 0.06, 0.35), dm);
          piece.position.set(fx + dir * (dd + dash / 2), 0.06, tz); tbg.add(piece);
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
        } else p.mesh.visible = f >= 0.999;   /* tolerance: float sums can leave the last piece at 0.99999 */
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
    /* Long drives: a hint of ground behind the far sideline so plays slid past it still read, and the
       last usable depth before the info box. */
    var cap = 0, mode = spec.laneMode;
    if (mode === "off") {
      var u0 = W / 360, yMin = 78 * u0, pv = new V3();
      for (var dd2 = K.LANES; dd2 < 80; dd2 += 0.25) {
        pv.set(0, Y, zNear - dd2 * STEP).project(cam);
        if ((1 - pv.y) / 2 * H < yMin) break; cap = dd2;
      }
      /* Ground only as far back as plays can go, fading out toward the far end. */
      var depthBack = Math.max(4, (-FIELD_W / 2) - (zNear - (cap + 1) * STEP)), gc = cvs(4, 64), gx = gc.getContext("2d"), gr = gx.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, "rgba(43,93,41,0)"); gr.addColorStop(1, "rgba(43,93,41,0.55)"); gx.fillStyle = gr; gx.fillRect(0, 0, 4, 64);
      var gt = new THREE.CanvasTexture(gc); gt.encoding = THREE.sRGBEncoding;
      var back = new THREE.Mesh(new THREE.PlaneGeometry(400, depthBack), new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false }));
      back.rotation.x = -Math.PI / 2; back.position.set(0, -0.03, -FIELD_W / 2 - depthBack / 2); scene.add(back);
    }
    function setSummary() { return null; }

    return {
      cap: cap, setSummary: setSummary, shake: shake,
      scene: scene, cam: cam, rows: rows, reveal: reveal, tipAt: tipAt, ball: ball, ltgM: ltgM, wx: wx, setLines: setLines, startAt: startAt, startLabel: spec.start && spec.start.label,
      laneGap: STEP,
      /* Put play k on its lane (depth 0 = nearest); returns how visible it is (fades past the far lane). */
      place: function (k, depth, alpha) {
        var r = rows[k], a = alpha != null ? alpha : K.laneAlpha(depth); r.z = zNear - depth * STEP; r.alpha = a;
        r.grp.position.z = r.z; r.grp.visible = a > 0; return a;
      },
      /* A play's local point (built at z = 0) where it is now. */
      world: function (k, v) { return v.clone().setZ(v.z + rows[k].z); },
      labelOf: function (k) {
        var r = rows[k], l = r.label; if (!l || !(r.alpha > 0)) return null;
        return { p: l.p.clone().setZ(r.z), z: r.z, dir: l.dir, text: l.text, a: r.alpha };
      },
      /* For the shared overlay: world point -> screen, and a label's point one lane nearer. */
      scr: function (p, W2, H2) { var v = p.clone().project(cam); return [(v.x + 1) / 2 * W2, (1 - v.y) / 2 * H2]; },
      laneShift: function (l) { return l.p.clone().setZ(l.z + STEP); },
      dispose: function () {
        scene.traverse(function (obj) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
        });
        if (scene.background && scene.background.dispose) scene.background.dispose();
      }
    };
  }

  function render(spec) {
    var key = JSON.stringify(spec);
    if (cache[key]) return cache[key];
    var W = Math.round(spec.width), H = Math.round(spec.height), r = renderer();
    r.setPixelRatio(1); r.setSize(W, H, false);
    var B = build(spec, W, H, r.capabilities.getMaxAnisotropy());
    var nR = B.rows.length;
    B.rows.forEach(function (row, k) {
      if (spec.laneMode) { var ls = K.laneState(spec, k, nR - 1, 1, B.cap); B.place(k, ls.depth, ls.alpha); }
      else B.place(k, nR - 1 - k);
      B.reveal(row, 1);
      if (row.alpha > 0 && row.alpha < 1) row.mats.forEach(function (m) { m.transparent = true; m.opacity = row.alpha; m.needsUpdate = true; });
    });
    var sumLabel = B.setSummary(K.summaryState(spec, nR - 1, 1));
    /* Drive in progress: earlier plays stay dimmed exactly as the animation leaves them. */
    /* spec.focus: one play picked by tapping its lane; every other play is dimmed. */
    /* Offsetting fouls: only the ghost of the snap is drawn (faint). */
    B.rows.forEach(function (row, k) {
      if (!row.ghost || !spec.rows[k].ghostOnly || !(row.alpha > 0)) return;
      B.reveal(row.ghost, 1); if (row.ghost.solid) row.ghost.solid.mesh.visible = false;
      row.ghost.mats.forEach(function (m) { m.transparent = true; m.opacity = 0.4 * row.alpha; m.needsUpdate = true; });
    });
    var hasFocus = spec.focus != null && spec.focus >= 0;
    if (spec.dimFrom > 0 || hasFocus) {
      var grey = new THREE.Color(0x8d968f).convertSRGBToLinear(), dim = 0.85;
      B.rows.forEach(function (row, k) {
        if (hasFocus ? k === spec.focus : k >= spec.dimFrom) return;
        row.mats.concat(row.ghost ? row.ghost.mats : []).forEach(function (m) {
          m.transparent = true; m.opacity = (hasFocus ? 0.3 : 1 - 0.5 * dim) * (row.ghost && row.ghost.mats.indexOf(m) >= 0 ? 0.4 : 1);
          m.color.lerp(grey, (hasFocus ? 0.6 : 0.35) * dim); m.emissive.multiplyScalar(1 - 0.6 * dim); m.needsUpdate = true;
        });
      });
    }
    B.setLines(spec.los, spec.ltg);
    r.render(B.scene, B.cam);
    var out = cvs(W, H), o = out.getContext("2d");
    o.drawImage(r.domElement, 0, 0);
    var ci = spec.callout ? spec.callout.row : -1;
    drawOverlay(o, W, H, B, B.rows.map(function (x, k) { return B.labelOf(k); }).filter(Boolean).concat(sumLabel ? [sumLabel] : []), spec.callout, null);
    B.dispose();
    var url = out.toDataURL("image/jpeg", 0.9);
    var keys = Object.keys(cache); if (keys.length > 20) delete cache[keys[0]];
    cache[key] = url;
    return url;
  }

  /* Where each play sits on screen in the still image (pixels of spec.width x spec.height),
     so a tap can be matched to a lane. */
  function hits(spec) {
    var W = Math.round(spec.width), H = Math.round(spec.height), B = build(spec, W, H, 1), nR = B.rows.length, out = [];
    B.rows.forEach(function (row, k) {
      if (spec.laneMode) { var ls = K.laneState(spec, k, nR - 1, 1, B.cap); B.place(k, ls.depth, ls.alpha); }
      else B.place(k, nR - 1 - k);
    });
    B.cam.updateMatrixWorld(); B.cam.updateProjectionMatrix && B.cam.updateProjectionMatrix();
    B.rows.forEach(function (row, k) {
      if (!(row.alpha > 0)) { out.push(null); return; }
      var a = B.scr(B.world(k, row.A), W, H), e = B.scr(B.world(k, row.tapEnd || row.end || row.A), W, H);
      out.push({ k: k, a: a, b: e });
    });
    B.dispose();
    return out;
  }

  /* ---------- Replay ----------
     The whole replay is a timeline built up front; renderAt(t) draws the state at time t, so
     it can run off requestAnimationFrame or a virtual clock (opts.clock) for frame capture.
     Beats per play: pre-snap (situation only, ball spotted, line to gain glides) -> snap
     (info box shows who/what but not the result) -> flight (ball rides the arrow tip; passes
     hang, runs burst then decelerate) -> result (full text, yardage chip pops) -> hold. */
  /* Timeline, easing, chips and the overlay live in drivecore.js (shared with the flat chart). */
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
    var P = plan(spec, B, linger), segs = P.segs, doink = K.doinkWatch(segs, opts);
    var grey = new THREE.Color(0x8d968f).convertSRGBToLinear();
    B.rows.forEach(function (row) {
      B.reveal(row, 0);
      row.mats.concat(row.ghost ? row.ghost.mats : [], row.ghost && row.ghost.solid ? [row.ghost.solid.mat] : [], row.solid ? [row.solid.mat] : []).forEach(function (m) { m.userData.base = m.color.clone(); m.userData.baseE = m.emissive.clone(); m.transparent = true; m.needsUpdate = true; });
    });
    /* Scoring end zones get a brief tint in the team colour (replay only). */
    var tints = [-55, 55].map(function (x) {
      var mm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      var pl = new THREE.Mesh(new THREE.PlaneGeometry(10, FIELD_W), mm);
      pl.rotation.x = -Math.PI / 2; pl.position.set(x, 0.06, 0); pl.visible = false; B.scene.add(pl); return pl;
    });
    var ltgAt = function (k) { return k >= 0 && spec.rows[k] ? spec.rows[k].ltg : null; };

    var fracOf = K.fracOf;
    function activeAt(t) { return K.activeAt(segs, t); }
    function setDim(m, dim, alpha) {
      m.opacity = (1 - 0.5 * dim) * (alpha == null ? 1 : alpha);
      m.color.copy(m.userData.base).lerp(grey, 0.35 * dim);
      m.emissive.copy(m.userData.baseE).multiplyScalar(1 - 0.6 * dim);
    }

    function renderAt(t) {
      var cur = activeAt(t), g = segs[cur], s = spec.rows[cur], outro = t >= P.outro;
      var undim = outro ? EASE.out(ramp(t, P.outro, 400)) : 0;
      doink(t);
      /* Doink: the upright that was hit shakes and flashes (~0.6 s). */
      var sh = 0, shS = 0, shE = 0;
      if (g && g.contact != null && t >= g.contact && !outro) { sh = 1 - ramp(t, g.contact, 650); shE = (s.dir || 1) > 0 ? 1 : -1; shS = (s.dir || 1) * K.fgSide(s) >= 0 ? 1 : -1; }
      B.shake(shE, shS, sh, g && g.contact != null ? t - g.contact : 0);
      segs.forEach(function (sg, k) {
        var row = B.rows[k], f = k < cur ? 1 : k === cur ? fracOf(sg, t) : 0;
        /* Earlier plays slide one lane back as each new play is spotted. */
        var la;
        if (spec.laneMode) { var ls = K.laneState(spec, k, cur, K.slideE(segs, cur, t), B.cap); la = B.place(k, ls.depth, ls.alpha); }
        else la = B.place(k, K.laneDepth(segs, k, cur, t));
        if (k > cur) row.grp.visible = false;   /* not played yet */
        B.reveal(row, f);
        var dim = K.dimOf(segs, k, cur, t, undim);
        row.mats.forEach(function (m) { setDim(m, dim, la); });
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
            setDim(row.solid.mat, 0); row.solid.mat.opacity = la;
          } else if (k === cur && t < sg.end + 150) {
            row.solid.mesh.visible = true; row.solid.mesh.geometry.setDrawRange(0, Infinity);
            row.solid.mat.opacity = (1 - (t - sg.end) / 150) * la;
          } else row.solid.mesh.visible = false;
        }
        /* Penalty: the underlying snap draws first, then fades back behind the walk-off. */
        if (row.ghost) {
          var gf = k === cur ? fracOf(sg, t, "g") : k < cur ? 1 : 0;
          B.reveal(row.ghost, gf);
          /* P3: the erased play goes away as the walk-off is drawn; offsetting fouls keep a faint ghost. */
          var gOnly = !!spec.rows[k].ghostOnly, floor = gOnly ? 0.4 : 0;
          var fade = k < cur || t >= sg.walkAt ? floor + (1 - floor) * (1 - ramp(t, sg.walkAt, 250)) : 1;
          row.ghost.mats.forEach(function (gm) { setDim(gm, dim, fade * (gOnly ? 1 : 1 - undim) * la); });
          if (!(fade > 0.002)) row.ghost.parts.forEach(function (p) { if (p.mesh) p.mesh.visible = false; if (p.list) p.list.forEach(function (b) { b.visible = false; }); });
          row.ghost.parts.forEach(function (p) { if (p.kind === "end") p.mesh.scale.setScalar(k === cur && t >= sg.ghostEnd ? backOut((t - sg.ghostEnd) / 240) : 1); });
          var gso = row.ghost.solid;
          if (gso) {   /* same rule as any incomplete: solid in flight, dotted once it lands */
            if (k === cur && t < sg.ghostEnd) {
              row.ghost.parts[0].list.forEach(function (b) { b.visible = false; });
              gso.mesh.visible = gf > 0; gso.mesh.geometry.setDrawRange(0, Math.round(gf * SEG) * RADS * 6); setDim(gso.mat, 0, la);
            } else if (k === cur && t < sg.ghostEnd + 150) {
              gso.mesh.visible = true; gso.mesh.geometry.setDrawRange(0, Infinity); setDim(gso.mat, 0, (1 - (t - sg.ghostEnd) / 150) * la);
            } else gso.mesh.visible = false;
          }
        }
        if (row.missX) { row.missX.visible = la > 0.5 && (k < cur || (k === cur && t >= sg.end)); row.missX.scale.setScalar(k === cur ? backOut(ramp(t, sg.end, 240)) : 1); }
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
        var lift = 0.35, sc = 1, pos, isWorld = false;
        if (t < g.snap) {
          /* Hop from where the last play ended (that play is sliding back) to the new spot on the near lane. */
          var prev = cur > 0 ? B.world(cur - 1, B.rows[cur - 1].end) : null, m = cur === 0 || g.cont ? 1 : EASE.out(ramp(t, g.t0, 260));
          pos = prev && !g.cont ? prev.clone().lerp(B.world(cur, row.A), m) : B.world(cur, row.A); isWorld = true;
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
          if (g.kind === "pen" && !row.ghost && t < g.phases[0].a + g.phases[0].d) pos = row.A.clone();
          var flying = t < g.end && (g.type === "air" || g.type === "inc" || g.type === "kick" || g.kind === "fg") && (g.catchAt == null || t < g.catchAt);
          if (flying) ball.rotation.x = (t - g.snap) / 40;
          if (g.kind === "inc" && t >= g.end) { sc *= 1 - ramp(t, g.end, 260); pos.y -= 0.6 * ramp(t, g.end, 260); }
          if ((s.type === "fg" || s.blocked) && t >= g.end) sc *= 1 - ramp(t, g.end + 120, 280);   /* a kick's ball doesn't rest in the air */
        }
        if (!isWorld) pos = B.world(cur, pos);
        ball.position.copy(pos).setY(pos.y + lift);
        /* Never smaller than ~6 px on a 360 px wide chart. */
        var dist = B.cam.position.distanceTo(ball.position), ppu = H / (2 * Math.tan(B.cam.fov * Math.PI / 360) * dist);
        var base = Math.max(0.6, 6 * u / (3 * ppu));
        ball.scale.setScalar(Math.max(0.0001, base * sc));
        if (sc < 0.01 || (g.type === "none" && !row.ghost)) ball.visible = false;
      }
      /* End-zone tint on a touchdown / good field goal: ~25 %, ~300 ms. */
      tints.forEach(function (pl) { pl.visible = false; });
      if (g && !outro && (g.kind === "td" || (g.kind === "fg" && !g.miss)) && t >= g.end) {
        var side = s.fe >= 50 ? 1 : 0, env = ramp(t, g.end, 80) * (1 - ramp(t, g.end + 300, 160));
        if (env > 0) { var pl = tints[side]; pl.visible = true; pl.material.color.set(s.scoreColor || s.color).convertSRGBToLinear(); pl.material.opacity = 0.25 * env; }
      }
      var sumLabel = B.setSummary(K.summaryState(spec, cur, K.slideE(segs, cur, t)));
      r.render(B.scene, B.cam);
      drawState(t, cur, g, s, outro, sumLabel);
    }

    function drawState(t, cur, g, s, outro, sumLabel) {
      o.clearRect(0, 0, W, H);
      var st = K.overlayState(t, cur, g, s, outro, segs, spec,
        function (k) { return B.labelOf(k); },
        function (k, sg) { var e = B.rows[k]; return B.world(k, e.chipPt ? e.chipPt : (sg.type === "dot" ? e.A : e.end).clone().setY(1.4)); });
      /* Doink: a starburst where the ball hit the upright. */
      if (g && g.contact != null && B.rows[cur].contact && !outro) { var cp = B.scr(B.world(cur, B.rows[cur].contact), W, H), bm = 24 * u; K.drawBurst(o, clamp(cp[0], bm, W - bm), cp[1], u, ramp(t, g.contact, 360)); }
      drawOverlay(o, W, H, B, sumLabel ? st.labels.concat([sumLabel]) : st.labels, st.co, null, st.fx);
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

  window.Chart3D = { render: render, replay: replay, hits: hits, ready: function () { return fontsReady; }, onReady: null };
})();
