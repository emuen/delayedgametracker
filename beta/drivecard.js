/* Delay Booth · The drive card: the chart with its summary line, info box and controls.
   One component for every place a drive is shown (game view, ticker sheet). A place may change
   how the card opens and what sits around it, never what you can do with it:
   - still picture at rest, Replay drive / Stop,
   - step through plays: the arrow buttons, a sideways swipe on the chart, or a tap on a lane,
   - "Whole drive" (the Replay button while stepping) goes back to the full drive. */
"use strict";
var DriveCard = (function () {
  /* Plays as row ranges: a kick and its return (or a play and its added-on penalty) are one play. */
  function plays(spec) {
    var g = [];
    spec.rows.forEach(function (r, k) { if (k > 0 && r.cont && g.length) g[g.length - 1][1] = k; else g.push([k, k]); });
    return g;
  }
  function engine() { return S.engine === "3d" && window.Chart3D && window.THREE ? window.Chart3D : window.Chart2D; }

  /* The summary line: "Drive  [LAR] Touchdown · 9 plays · 75 yds · 4:12". */
  function capHTML(L) {
    var nOwn = L.real.filter(function (p) { return !isKick(p); }).length, own = L.rows.filter(function (r) { return r.kind === "play"; });
    var yds = own.length ? Math.round(own[own.length - 1].e - own[0].s) : 0, top = driveTime(L);
    var stats = [nOwn + " play" + (nOwn === 1 ? "" : "s"), yds + " yds"].concat(top ? [top] : []).join(" · ");
    var tc = (L.TC || {})[L.off];
    return '<div class="cap"><b>' + (L.done ? "Drive" : "Current drive") + '</b><span><span class="badge"' + (tc ? ' style="--tc:' + tc.bg + ';--tci:' + tc.ink + '"' : '') + '>' + esc(L.offAb) + '</span> ' +
      (L.done && L.label ? esc(L.label) + " · " : "") + esc(stats) + '</span></div>';
  }
  function html(L, url, id) {
    return '<div class="chart dcard">' + capHTML(L) +
      '<div class="dc-c"' + (id ? ' id="' + id + '"' : '') + '><img src="' + url + '" alt="' + esc(L.offAb) + ' drive chart" style="display:block;width:100%;height:auto;border-radius:6px"></div>' +
      '<div class="legend gc rp dc-ctl"><button class="replaybtn dc-rp">▶ Replay drive</button>' +
      '<span class="dc-steps"><button class="dc-step dc-prev" aria-label="Previous play">◀</button><span class="dc-n" aria-live="polite"></span><button class="dc-step dc-next" aria-label="Next play">▶</button></span></div>' +
      (load("db_stepped", false) ? '' : '<small class="dc-hint">Tap a play to see it</small>') + '</div>';
  }

  /* Wire up a card. opts: onBusy(on, card) — the place pauses its own updates while the card is replaying or stepping. */
  function bind(root, spec, opts) {
    opts = opts || {};
    var holder = root.querySelector(".dc-c"), img = holder.querySelector("img"), rp = root.querySelector(".dc-rp");
    var prev = root.querySelector(".dc-prev"), next = root.querySelector(".dc-next"), num = root.querySelector(".dc-n");
    var P = plays(spec), restUrl = img.getAttribute("src"), mode = "rest", idx = -1, ctrl = null, shown = spec, hitCache = null, busy = false;
    var card = { stop: function () { toRest(true); }, root: root };
    function setBusy(on, quiet) { if (on === busy) return; busy = on; if (opts.onBusy && !(quiet && !on)) opts.onBusy(on, card); }
    function stopCtrl() { if (ctrl) { try { ctrl.stop(); } catch (e) {} ctrl = null; } img.hidden = false; }
    function ui() {
      rp.textContent = mode === "replay" ? "■ Stop" : mode === "step" ? "Whole drive" : "▶ Replay drive";
      rp.classList.toggle("on", mode === "replay");
      num.textContent = mode === "step" ? label(idx) : "";
      prev.disabled = mode === "step" && idx <= 0; next.disabled = mode === "step" && idx >= P.length - 1;
    }
    /* "Play 3 of 8", counted like the summary line (kickoffs and punts are named instead). */
    var counted = P.filter(function (g) { return !spec.rows[g[0]].uncounted; }).length;
    function label(i) {
      var r = spec.rows[P[i][0]]; if (r.uncounted) return r.punt ? "Punt" : "Kickoff";
      var n = 0; for (var q = 0; q <= i; q++) if (!spec.rows[P[q][0]].uncounted) n++;
      return "Play " + n + " of " + counted;
    }
    function toRest(quiet) {
      stopCtrl(); mode = "rest"; idx = -1; shown = spec; hitCache = null; img.src = restUrl; ui(); setBusy(false, quiet);
    }
    function replay() {
      var E = engine(); if (!E) return;
      stopCtrl(); mode = "replay"; img.src = restUrl; shown = spec; hitCache = null; img.hidden = true; ui(); setBusy(true);
      try {
        ctrl = E.replay(holder, spec, { linger: S.linger, onDoink: window.dbDoink, onDone: function () { setTimeout(function () { if (mode === "replay") toRest(); }, Math.max(600, S.linger * 1000)); } });
      } catch (e) { console.log("Replay failed", e); toRest(); }
    }
    function step(i) {
      var E = engine(); if (!E || !P.length) return;
      i = Math.max(0, Math.min(P.length - 1, i));
      var g = P[i], r0 = spec.rows[g[0]], r1 = spec.rows[g[1]];
      var sp = Object.assign({}, spec, { focus: g[0], focusTo: g[1], dimFrom: 0, callout: r1.callout || spec.callout, ltg: r0.ltg != null ? r0.ltg : spec.ltg });
      var url; try { url = E.render(sp); } catch (e) { console.log("Step render failed", e); return; }
      if (!url) return;
      stopCtrl(); mode = "step"; idx = i; shown = sp; hitCache = null; img.src = url; ui(); setBusy(true);
      if (!load("db_stepped", false)) { save("db_stepped", true); var h = root.querySelector(".dc-hint"); if (h) h.remove(); }
    }
    function move(d) { step(mode === "step" ? idx + d : P.length - 1); }

    rp.addEventListener("click", function () { if (mode === "rest") replay(); else toRest(); });
    prev.addEventListener("click", function () { move(-1); });
    next.addEventListener("click", function () { move(1); });

    /* Sideways swipe on the chart: left = next play, right = previous. Up and down still scroll. */
    var sx = null, sy = 0, swiped = false;
    holder.addEventListener("touchstart", function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; swiped = false; }, { passive: true });
    holder.addEventListener("touchend", function (e) {
      if (sx == null) return; var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(dy)) { swiped = true; move(dx < 0 ? 1 : -1); }
    }, { passive: true });

    /* Tap a lane: that play (when the tap is close enough to it). */
    holder.addEventListener("click", function (ev) {
      if (swiped) { swiped = false; return; }
      if (mode === "replay") return;
      var E = engine(); if (!E || !E.hits) return;
      var r = img.getBoundingClientRect(); if (!r.width) return;
      var W = shown.width, H = shown.height, x = (ev.clientX - r.left) / r.width * W, y = (ev.clientY - r.top) / r.height * H;
      if (!hitCache) { try { hitCache = E.hits(shown); } catch (e) { console.log("lane hits failed", e); return; } }
      var best = -1, bd = 1e9;
      hitCache.forEach(function (h) {
        if (!h) return; var ax = h.a[0], ay = h.a[1], dx = h.b[0] - ax, dy = h.b[1] - ay, L2 = dx * dx + dy * dy;
        var t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0, d = Math.hypot(x - ax - t * dx, (y - ay - t * dy) * 1.6);
        if (d < bd) { bd = d; best = h.k; }
      });
      if (best < 0 || bd > H * 0.14) return;
      for (var i = 0; i < P.length; i++) if (best >= P[i][0] && best <= P[i][1]) { step(i); return; }
    });
    ui();
    return card;
  }
  return { html: html, bind: bind, plays: plays };
})();
