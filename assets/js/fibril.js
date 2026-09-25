/* ==========================================================================
   Background: a slowly rotating cross-β amyloid fibril drawn as a point cloud.
   Two protofilaments, each a pair of pleated β-sheets; strands run across the
   fibril axis and stack along it with a gentle left-handed twist.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('fibril');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var lightQuery = window.matchMedia('(prefers-color-scheme: light)');

  // ---- Geometry (model units) ----
  var LAYERS = 96;          // strands stacked along the fibril axis
  var RESIDUES = 11;        // residues per strand
  var LAYER_GAP = 0.085;    // ~4.8 Å rise, in model units
  var TWIST = -0.034;       // radians per layer (left-handed)
  var STRAND_HALF = 0.62;   // half strand length
  var SHEET_GAP = 0.2;      // steric-zipper spacing between mated sheets
  var PF_OFFSET = 0.46;     // protofilament offset from axis

  var points = [];          // {x,y,z, sheet, layer, res}
  var strands = [];         // arrays of point indices, one per strand

  (function build() {
    for (var k = 0; k < LAYERS; k++) {
      var y = (k - LAYERS / 2) * LAYER_GAP;
      var th = k * TWIST;
      var c = Math.cos(th), s = Math.sin(th);
      for (var pf = 0; pf < 2; pf++) {
        for (var sh = 0; sh < 2; sh++) {
          var line = [];
          var zBase = (pf === 0 ? -PF_OFFSET : PF_OFFSET) + (sh === 0 ? -SHEET_GAP / 2 : SHEET_GAP / 2);
          for (var r = 0; r < RESIDUES; r++) {
            var t = r / (RESIDUES - 1);
            // slight arc so each protofilament reads as a curved β-arch
            var x0 = (t - 0.5) * 2 * STRAND_HALF;
            var z0 = zBase + (pf === 0 ? -1 : 1) * 0.1 * Math.cos(t * Math.PI) + (r % 2 ? 0.025 : -0.025);
            points.push({
              x: x0 * c - z0 * s,
              y: y,
              z: x0 * s + z0 * c,
              sheet: pf * 2 + sh,
              layer: k
            });
            line.push(points.length - 1);
          }
          strands.push(line);
        }
      }
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
  var AXIS_ROLL = -0.62;
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
    out[o + 1] = H / 2 + y3 * scale * p;
    out[o + 2] = z2;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    var cy = Math.cos(spin), sy = Math.sin(spin);
    var ax = 0.28 + tiltY * 0.25, cx = Math.cos(ax), sx = Math.sin(ax);
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
      var zMid = P[line[5] * 3 + 2];
      var depth = (zMid + 1.6) / 3.2;              // ~0 far → 1 near
      var fade = edgeFade(first.layer);
      var a = (0.05 + depth * 0.16) * fade * (isLight ? 1.2 : 1);
      ctx.strokeStyle = 'rgba(' + (first.sheet % 2 ? colB : colA) + ',' + a.toFixed(3) + ')';
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
      ctx.fillStyle = 'rgba(' + (pj.sheet % 2 ? colB : colA) + ',' + alpha.toFixed(3) + ')';
      ctx.fillRect(P[j * 3] - rad / 2, P[j * 3 + 1] - rad / 2, rad, rad);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  function edgeFade(layer) {
    var e = Math.min(layer, LAYERS - 1 - layer) / 14;
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
