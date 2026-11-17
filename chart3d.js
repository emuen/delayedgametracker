/* Delay Booth 3D drive chart (test).
   Renders one drive as a real 3D scene with three.js and returns a JPEG data URL,
   so the page can show it as a plain image and re-render without piling up WebGL
   contexts. Field coordinates: f = yards from the LEFT goal line (0..100), end
   zones -10..0 and 100..110. World: x = f - 50, z = depth (far sideline negative),
   y = up. */
(function () {
  "use strict";
  var R = null, cache = {}, fontsReady = false;
  var FIELD_W = 53.3;
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('italic 800 40px "Barlow Condensed"'),
      document.fonts.load('700 40px "Barlow Condensed"'),
      document.fonts.load('600 20px "Inter"')
    ]).then(function () { fontsReady = true; cache = {}; if (window.Chart3D.onReady) window.Chart3D.onReady(); })
      .catch(function () { fontsReady = true; });
  } else fontsReady = true;

  function renderer() {
    if (!R) {
      R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      R.outputEncoding = THREE.sRGBEncoding;
      R.shadowMap.enabled = true;
      R.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    return R;
  }
  function cvs(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  var DISPLAY = '"Barlow Condensed","Arial Narrow",sans-serif';

  function fieldTexture(spec) {
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
    /* Big italic numbers along the near sideline, smaller upside-down ones on the far side. */
    x.fillStyle = "rgba(255,255,255,0.95)"; x.textAlign = "center"; x.textBaseline = "alphabetic";
    x.font = "italic 800 " + (8 * PX) + "px " + DISPLAY;
    for (f = 10; f < 100; f += 10) { x.save(); x.translate((10 + f) * PX, H - 2.6 * PX); x.scale(0.78, 1); x.fillText(String(f <= 50 ? f : 100 - f), 0, 0); x.restore(); }
    x.font = "italic 800 " + (5 * PX) + "px " + DISPLAY;
    for (f = 10; f < 100; f += 10) { x.save(); x.translate((10 + f) * PX, 2.6 * PX); x.rotate(Math.PI); x.scale(0.78, 1); x.fillText(String(f <= 50 ? f : 100 - f), 0, 0); x.restore(); }
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer().capabilities.getMaxAnisotropy();
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
  function mat(color, opts) {
    var c = new THREE.Color(color).convertSRGBToLinear();
    return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.42, metalness: 0.05, emissive: c.clone().multiplyScalar(0.12) }, opts || {}));
  }

  /* spec: { away:{name,bg,ink}, home:{...}, rows:[{fs,fe,fc,type,color,label,text}],
             los, ltg, callout:{head,l1,l2,row}, width, height } — f values in field coords.
     type: "air" | "ground" | "inc" | "kick" | "dot" */
  function render(spec) {
    var key = JSON.stringify(spec);
    if (cache[key]) return cache[key];
    var W = Math.round(spec.width), H = Math.round(spec.height), r = renderer();
    r.setPixelRatio(1); r.setSize(W, H, false);
    var scene = new THREE.Scene();
    scene.background = skyTexture();
    var cv = spec.cam || {};
    var cam = new THREE.PerspectiveCamera(cv.fov || 24, W / H, 1, 1000);
    cam.position.set(0, cv.y || 82, cv.z || 138); cam.lookAt(0, cv.ly != null ? cv.ly : 8, cv.lz != null ? cv.lz : -3);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2c4a26, 0.5));
    var sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(-25, 60, 35); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 200;
    scene.add(sun);

    /* Grass around the field on the near side and ends only, so the sky meets the far sideline. */
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), new THREE.MeshLambertMaterial({ color: new THREE.Color(0x2f6a2c).convertSRGBToLinear() }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -FIELD_W / 2 + 100); scene.add(ground);
    var field = new THREE.Mesh(new THREE.PlaneGeometry(120, FIELD_W), new THREE.MeshLambertMaterial({ map: fieldTexture(spec) }));
    field.rotation.x = -Math.PI / 2; field.receiveShadow = true; scene.add(field);

    function wx(f) { return Math.max(-60, Math.min(60, f - 50)); }
    function line(f, color) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, FIELD_W), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).convertSRGBToLinear() }));
      m.position.set(wx(f), 0.04, 0); scene.add(m);
    }
    if (spec.ltg != null) line(spec.ltg, 0xffd23f);
    if (spec.los != null) line(spec.los, 0x2f7cff);

    var n = spec.rows.length, zFar = -21, zNear = 15, Y = 0.55, RAD = 0.62, CONE = 2.6;
    var V3 = THREE.Vector3, up = new V3(0, 1, 0), labels = [], calloutAt = null;
    function addTube(curve, m) {
      var t = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, RAD, 10, false), m);
      t.castShadow = true; scene.add(t);
    }
    function addCone(tip, dir, m) {
      dir = dir.clone().normalize();
      var c = new THREE.Mesh(new THREE.ConeGeometry(RAD * 2, CONE, 18), m);
      c.position.copy(tip.clone().sub(dir.clone().multiplyScalar(CONE / 2)));
      c.quaternion.setFromUnitVectors(up, dir); c.castShadow = true; scene.add(c);
    }
    function addX(p, m) {
      [Math.PI / 4, -Math.PI / 4].forEach(function (a) {
        var b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.35), m);
        b.position.copy(p); b.rotation.z = a; scene.add(b);
      });
    }
    spec.rows.forEach(function (row, i) {
      var z = n === 1 ? (zFar + zNear) / 2 : zFar + (zNear - zFar) * i / (n - 1);
      var m = mat(row.color), A = new V3(wx(row.fs), Y, z), E = new V3(wx(row.fe), Y, z);
      var end = E, endDir;
      if (row.type === "dot") {
        var s = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.22, 8, 24), m); s.rotation.x = -Math.PI / 2; s.position.copy(A); scene.add(s);
      } else if (row.type === "air" || row.type === "inc" || row.type === "kick") {
        var C = row.fc != null ? new V3(wx(row.fc), Y, z) : E;
        var len = Math.abs(C.x - A.x), h = Math.max(3.2, Math.min(row.type === "kick" ? 17 : 13, len * (row.type === "kick" ? 0.34 : 0.4)));
        var mid = new V3((A.x + C.x) / 2, Y + 2 * h, z);
        var arc = new THREE.QuadraticBezierCurve3(A, mid, C);
        if (row.type === "inc") {
          var pts = arc.getSpacedPoints(Math.max(6, Math.round(arc.getLength() / 1.7)));
          pts.forEach(function (p) { var b = new THREE.Mesh(new THREE.SphereGeometry(RAD * 0.9, 12, 10), m); b.position.copy(p); b.castShadow = true; scene.add(b); });
          addX(C.clone().setY(Y + 0.3), m); end = C;
        } else if (row.fc != null && Math.abs(E.x - C.x) > 0.3) {
          addTube(arc, m);
          var g = E.x >= C.x ? 1 : -1, glen = Math.abs(E.x - C.x);
          if (glen > CONE * 1.1) addTube(new THREE.LineCurve3(C, new V3(E.x - g * CONE * 0.9, Y, z)), m);
          endDir = new V3(g, 0, 0); end = E;
        } else {
          var cut = arc.getPointAt(0.97);
          addTube(new THREE.QuadraticBezierCurve3(A, mid, cut), m);
          endDir = C.clone().sub(arc.getPointAt(0.9)); end = C;
        }
        if (endDir) addCone(end, endDir, m);
      } else {
        var d = E.x >= A.x ? 1 : -1, glen2 = Math.abs(E.x - A.x);
        if (glen2 > CONE * 1.1) addTube(new THREE.LineCurve3(A, new V3(E.x - d * CONE * 0.9, Y, z)), m);
        addCone(E, new V3(d, 0, 0), m);
      }
      if (row.label) labels.push({ p: end.clone().setY(Y + 1.2), dir: end.x >= A.x ? 1 : -1, text: row.label });
      if (spec.callout && spec.callout.row === i) calloutAt = end.clone().setY(Y + 1.6);
    });
    if (spec.los != null) {
      var ball = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), new THREE.MeshStandardMaterial({ color: new THREE.Color(0x7a3b12).convertSRGBToLinear(), roughness: 0.6 }));
      ball.scale.set(1.5, 0.9, 0.9); ball.position.set(wx(spec.los), 0.95, FIELD_W / 2 - 3); ball.castShadow = true; scene.add(ball);
      var lace = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lace.position.set(wx(spec.los), 1.83, FIELD_W / 2 - 3); scene.add(lace);
    }
    r.render(scene, cam);

    /* Text goes on a 2D layer on top, so it stays crisp. */
    var out = cvs(W, H), o = out.getContext("2d");
    o.drawImage(r.domElement, 0, 0);
    function scr(p) { var v = p.clone().project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; }
    var u = W / 360;
    o.textBaseline = "middle"; o.lineJoin = "round";
    /* Labels: try beside the arrow end, then the other side, then above; skip if every spot overlaps. */
    var placed = [];
    function hit(r) { return placed.some(function (q) { return r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]; }); }
    labels.slice().reverse().forEach(function (l) {
      var s = scr(l.p), fs = Math.round(11.5 * u);
      o.font = "700 " + fs + "px " + DISPLAY;
      var w = o.measureText(l.text).width, hh = fs, tries = [
        [s[0] + l.dir * 5 * u + (l.dir > 0 ? 0 : -w), s[1] - hh / 2],
        [s[0] - l.dir * 5 * u + (l.dir > 0 ? -w : 0), s[1] - hh / 2],
        [s[0] - w / 2, s[1] - hh * 1.7]];
      for (var t = 0; t < tries.length; t++) {
        var x0 = tries[t][0], y0 = tries[t][1], rect = [x0 - 2 * u, y0 - 1 * u, x0 + w + 2 * u, y0 + hh + 1 * u];
        if (x0 < 4 * u || x0 + w > W - 4 * u || hit(rect)) continue;
        placed.push(rect);
        o.textAlign = "left"; o.strokeStyle = "rgba(0,0,0,0.55)"; o.lineWidth = 3 * u;
        o.strokeText(l.text, x0, y0 + hh / 2); o.fillStyle = "#fff"; o.fillText(l.text, x0, y0 + hh / 2);
        break;
      }
    });
    if (spec.callout && calloutAt) {
      var c = spec.callout, at = scr(calloutAt), pad = 8 * u, lh = 14 * u;
      o.font = "700 " + Math.round(11.5 * u) + "px Inter, system-ui, sans-serif";
      var w1 = o.measureText(c.head).width;
      o.font = Math.round(11 * u) + "px Inter, system-ui, sans-serif";
      var w2 = Math.max(o.measureText(c.l1 || "").width, o.measureText(c.l2 || "").width);
      var bw = Math.min(W - 12 * u, Math.max(w1, w2) + pad * 2), bh = pad * 2 + lh * (c.l2 ? 3 : 2) - 4 * u;
      var bx = Math.max(6 * u, Math.min(W - bw - 6 * u, at[0] - bw / 2)), by = 8 * u;
      o.strokeStyle = "rgba(255,255,255,0.95)"; o.lineWidth = 1.5 * u;
      o.beginPath(); o.moveTo(Math.max(bx + 10 * u, Math.min(bx + bw - 10 * u, at[0])), by + bh); o.lineTo(at[0], at[1]); o.stroke();
      o.fillStyle = "#fff"; o.beginPath(); o.arc(at[0], at[1], 2.5 * u, 0, Math.PI * 2); o.fill();
      o.shadowColor = "rgba(0,0,0,0.25)"; o.shadowBlur = 8 * u; o.shadowOffsetY = 2 * u;
      o.fillStyle = "#fff"; o.beginPath();
      if (o.roundRect) o.roundRect(bx, by, bw, bh, 5 * u); else o.rect(bx, by, bw, bh);
      o.fill(); o.shadowColor = "transparent";
      o.textAlign = "left"; o.fillStyle = "#17201b";
      o.font = "700 " + Math.round(11.5 * u) + "px Inter, system-ui, sans-serif"; o.fillText(c.head, bx + pad, by + pad + lh / 2 - 2 * u);
      o.fillStyle = "#3c463f"; o.font = Math.round(11 * u) + "px Inter, system-ui, sans-serif";
      o.fillText(c.l1 || "", bx + pad, by + pad + lh * 1.5 - 2 * u);
      if (c.l2) o.fillText(c.l2, bx + pad, by + pad + lh * 2.5 - 2 * u);
    }
    scene.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
    });
    if (scene.background && scene.background.dispose) scene.background.dispose();
    var url = out.toDataURL("image/jpeg", 0.9);
    var keys = Object.keys(cache); if (keys.length > 20) delete cache[keys[0]];
    cache[key] = url;
    return url;
  }
  window.Chart3D = { render: render, ready: function () { return fontsReady; }, onReady: null };
})();
