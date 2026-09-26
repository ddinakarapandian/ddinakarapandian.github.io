/* ==========================================================================
   Background: a slowly rotating Aβ42 amyloid fibril built from the cryo-EM
   structure PDB 5OQV (two protofilaments of LS-shaped subunits), drawn as its
   Cα backbone ("bones") with one dot per residue.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('fibril');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var lightQuery = window.matchMedia('(prefers-color-scheme: light)');

  // ---- Geometry: Aβ42 fibril, PDB 5OQV (Gremer et al., Science 2017) ----
  // Cα trace of one subunit (residues 1–42, Å) in a frame whose y axis is the
  // fibril axis. Neighbouring subunits alternate between the two protofilaments
  // and are related by a pseudo-2₁ screw fitted to the deposited model
  // (per layer: -1.44° twist, 4.68 Å rise; regenerated chains match to <0.05 Å).
  var CA = [13.0, -7.3, 2.2, 13.8, -6.5, -1.3, 17.3, -5.7, -2.7, 17.8, -4.8, -6.4, 21.4, -5.1, -7.5, 21.9, -4.2, -11.2, 25.5, -4.3, -12.4, 25.7, -3.9, -16.1, 27.7, -3.0, -19.3, 26.0, -2.1, -22.6, 22.4, -2.4, -21.5, 19.3, -1.5, -23.6, 15.8, -1.4, -22.3, 12.8, -0.8, -24.6, 9.6, -0.5, -22.6, 6.4, 0.3, -24.5, 3.1, 0.3, -22.6, -0.2, 1.7, -23.6, -4.0, 1.2, -23.3, -6.9, 2.1, -25.6, -10.0, 3.2, -23.6, -13.0, 3.6, -25.9, -16.6, 3.8, -25.0, -15.7, 3.9, -21.3, -17.5, 5.5, -18.5, -15.1, 5.2, -15.7, -11.4, 4.2, -15.2, -9.3, 3.4, -12.1, -5.7, 2.4, -12.6, -2.1, 3.2, -12.8, 0.5, 2.9, -15.5, 4.3, 3.4, -15.1, 7.8, 2.0, -15.6, 10.4, 1.0, -13.0, 8.8, 1.4, -9.6, 11.0, 0.8, -6.5, 9.2, -0.9, -3.8, 5.7, -0.2, -2.6, 2.2, -0.9, -3.9, -0.9, 0.3, -5.7, -4.4, 0.2, -4.3, -7.2, -0.1, -6.8];
  var RES = CA.length / 3;
  var SCREW = 3.129003;          // rotation per subunit (rad)
  var RISE = 2.3386;           // rise per subunit (Å)
  var UNIT = 34.5;             // Å per model unit (outer radius → 1)
  var SUBUNITS = 124;        // stacked along the axis

  var points = [];          // {x,y,z, pf, layer}
  var strands = [];         // arrays of point indices, one per subunit

  (function build() {
    for (var k = 0; k < SUBUNITS; k++) {
      var n = k - SUBUNITS / 2;
      var c = Math.cos(n * SCREW), s = Math.sin(n * SCREW);
      var line = [];
      for (var r = 0; r < RES; r++) {
        var x = CA[r * 3], y = CA[r * 3 + 1], z = CA[r * 3 + 2];
        points.push({
          x: (x * c + z * s) / UNIT,
          y: (y + n * RISE) / UNIT,
          z: (-x * s + z * c) / UNIT,
          pf: k % 2,
          layer: k
        });
        line.push(points.length - 1);
      }
      strands.push(line);
    }
  })();

  // Ambient "monomers" drifting in the volume
  var DUST = 80;
  var dust = [];
  for (var i = 0; i < DUST; i++) {
    dust.push({
      x: (Math.random() - 0.5) * 9,
      y: (Math.random() - 0.5) * 6,
      z: (Math.random() - 0.5) * 5,
      vx: (Math.random() - 0.5) * 0.0016,
      vy: (Math.random() - 0.5) * 0.0016,
      r: Math.random() * 0.6 + 0.4
    });
  }

  // ---- State ----
  var W = 0, H = 0, DPR = 1, scale = 1;
  var colA = '200,214,235', colB = '217,194,126';
  var isLight = false;
  var spin = 0.6;
  var mouseX = 0, mouseY = 0, tiltX = 0, tiltY = 0;
  var projected = new Float32Array(points.length * 3);
  var running = false, last = 0;

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    colA = (cs.getPropertyValue('--fibril-a') || colA).trim();
    colB = (cs.getPropertyValue('--fibril-b') || colB).trim();
    isLight = lightQuery.matches;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    scale = Math.min(W, H) * (W < 640 ? 0.23 : 0.19);
    if (!running) draw();
  }

  // Fibril axis lies diagonally across the viewport.
  var AXIS_ROLL = 0.62;
  var CAM = 6.5;

  function project(x, y, z, cy, sy, cx, sx, cr, sr, out, o) {
    // spin about fibril axis (Y)
    var x1 = x * cy + z * sy;
    var z1 = -x * sy + z * cy;
    // tilt toward/away from viewer (X)
    var y2 = y * cx - z1 * sx;
    var z2 = y * sx + z1 * cx;
    // roll in screen plane (Z) to lay the axis diagonally
    var x3 = x1 * cr - y2 * sr;
    var y3 = x1 * sr + y2 * cr;
    var p = CAM / (CAM - z2);
    out[o] = W / 2 + x3 * scale * p;
    out[o + 1] = H / 2 - y3 * scale * p;   // screen y is down: flip to keep the fibril's true handedness
    out[o + 2] = z2;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    var cy = Math.cos(spin), sy = Math.sin(spin);
    var ax = 0.6 + tiltY * 0.25, cx = Math.cos(ax), sx = Math.sin(ax);
    var roll = AXIS_ROLL + tiltX * 0.08, cr = Math.cos(roll), sr = Math.sin(roll);

    ctx.globalCompositeOperation = isLight ? 'source-over' : 'lighter';

    // dust
    for (var d = 0; d < DUST; d++) {
      var q = dust[d];
      var pz = CAM / (CAM - q.z);
      var dx = W / 2 + (q.x + tiltX * 0.3 * q.z) * scale * pz * 0.9;
      var dy = H / 2 + (q.y + tiltY * 0.3 * q.z) * scale * pz * 0.9;
      ctx.fillStyle = 'rgba(' + colA + ',' + (isLight ? 0.18 : 0.14) + ')';
      ctx.beginPath();
      ctx.arc(dx, dy, q.r * pz, 0, 6.283);
      ctx.fill();
    }

    var n = points.length, P = projected;
    for (var i = 0; i < n; i++) {
      var pt = points[i];
      project(pt.x, pt.y, pt.z, cy, sy, cx, sx, cr, sr, P, i * 3);
    }

    // backbones
    ctx.lineWidth = 1;
    for (var s = 0; s < strands.length; s++) {
      var line = strands[s];
      var first = points[line[0]];
      var zMid = P[line[line.length >> 1] * 3 + 2];
      var depth = (zMid + 1.6) / 3.2;              // ~0 far → 1 near
      var fade = edgeFade(first.layer);
      var a = (0.05 + depth * 0.16) * fade * (isLight ? 1.2 : 1);
      ctx.strokeStyle = 'rgba(' + (first.pf ? colB : colA) + ',' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(P[line[0] * 3], P[line[0] * 3 + 1]);
      for (var r = 1; r < line.length; r++) ctx.lineTo(P[line[r] * 3], P[line[r] * 3 + 1]);
      ctx.stroke();
    }

    // residues
    for (var j = 0; j < n; j++) {
      var pj = points[j];
      var z = P[j * 3 + 2];
      var dep = Math.max(0, Math.min(1, (z + 1.6) / 3.2));
      var f = edgeFade(pj.layer);
      var alpha = (0.12 + dep * 0.55) * f * (isLight ? 0.9 : 1);
      var rad = (0.6 + dep * 1.5) * (W < 640 ? 0.85 : 1);
      ctx.fillStyle = 'rgba(' + (pj.pf ? colB : colA) + ',' + alpha.toFixed(3) + ')';
      ctx.fillRect(P[j * 3] - rad / 2, P[j * 3 + 1] - rad / 2, rad, rad);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  function edgeFade(layer) {
    var e = Math.min(layer, SUBUNITS - 1 - layer) / 18;
    return e >= 1 ? 1 : e * e * (3 - 2 * e);
  }

  function tick(now) {
    if (!running) return;
    var dt = Math.min(now - last, 50);
    last = now;
    spin += dt * 0.00012;
    tiltX += (mouseX - tiltX) * 0.04;
    tiltY += (mouseY - tiltY) * 0.04;
    for (var d = 0; d < DUST; d++) {
      var q = dust[d];
      q.x += q.vx * dt * 0.06;
      q.y += q.vy * dt * 0.06;
      if (q.x > 4.5) q.x = -4.5; else if (q.x < -4.5) q.x = 4.5;
      if (q.y > 3) q.y = -3; else if (q.y < -3) q.y = 3;
    }
    draw();
    requestAnimationFrame(tick);
  }

  function start() {
    if (running || reduceMotion.matches || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
  function stop() { running = false; }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    mouseX = (e.clientX / W - 0.5) * 2;
    mouseY = (e.clientY / H - 0.5) * 2;
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  function onPrefChange() {
    readColors();
    if (reduceMotion.matches) { stop(); draw(); } else start();
  }
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener('change', onPrefChange);
    lightQuery.addEventListener('change', function () { readColors(); draw(); });
  }

  readColors();
  resize();
  draw();
  start();
})();
