/* ==========================================================================
   Background: a slowly rotating Aβ42 amyloid fibril built from the cryo-EM
   structure PDB 5OQV (two protofilaments of LS-shaped subunits), rendered in
   WebGL. Far away it is the Cα backbone ("bones"); main.js turns the sections
   into branches that grow from it, and opening one flies the camera into the
   fibril until every atom of the subunits around that point is drawn.
   Without WebGL2 nothing here runs and the page falls back to a plain nav.
   ========================================================================== */
(function () {
  'use strict';

  var api = window.Fibril = { ready: false, onframe: null, reserve: { top: 0, bottom: 0 } };

  var canvas = document.getElementById('fibril');
  var atomData = window.ABETA_ATOMS;
  if (!canvas || !atomData) return;
  var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var lightQuery = window.matchMedia('(prefers-color-scheme: light)');
  var sheetQuery = window.matchMedia('(max-width: 860px)');

  // ---- Geometry: Aβ42 fibril, PDB 5OQV (Gremer et al., Science 2017) ----
  // Cα trace of one subunit (residues 1–42, Å) in a frame whose y axis is the
  // fibril axis. Neighbouring subunits alternate between the two protofilaments
  // and are related by a pseudo-2₁ screw fitted to the deposited model
  // (per layer: -1.44° twist, 4.68 Å rise; regenerated chains match to <0.05 Å).
  var CA = [13.0, -7.3, 2.2, 13.8, -6.5, -1.3, 17.3, -5.7, -2.7, 17.8, -4.8, -6.4, 21.4, -5.1, -7.5, 21.9, -4.2, -11.2, 25.5, -4.3, -12.4, 25.7, -3.9, -16.1, 27.7, -3.0, -19.3, 26.0, -2.1, -22.6, 22.4, -2.4, -21.5, 19.3, -1.5, -23.6, 15.8, -1.4, -22.3, 12.8, -0.8, -24.6, 9.6, -0.5, -22.6, 6.4, 0.3, -24.5, 3.1, 0.3, -22.6, -0.2, 1.7, -23.6, -4.0, 1.2, -23.3, -6.9, 2.1, -25.6, -10.0, 3.2, -23.6, -13.0, 3.6, -25.9, -16.6, 3.8, -25.0, -15.7, 3.9, -21.3, -17.5, 5.5, -18.5, -15.1, 5.2, -15.7, -11.4, 4.2, -15.2, -9.3, 3.4, -12.1, -5.7, 2.4, -12.6, -2.1, 3.2, -12.8, 0.5, 2.9, -15.5, 4.3, 3.4, -15.1, 7.8, 2.0, -15.6, 10.4, 1.0, -13.0, 8.8, 1.4, -9.6, 11.0, 0.8, -6.5, 9.2, -0.9, -3.8, 5.7, -0.2, -2.6, 2.2, -0.9, -3.9, -0.9, 0.3, -5.7, -4.4, 0.2, -4.3, -7.2, -0.1, -6.8];
  var RES = CA.length / 3;
  var SCREW = 3.129003;          // rotation per subunit (rad)
  var RISE = 2.3386;             // rise per subunit (Å)
  var UNIT = 34.5;               // Å per model unit (outer radius → 1)
  var SUBUNITS = 124;            // stacked along the axis
  var ATOM_RADIUS = [0.62, 0.58, 0.55, 0.78];   // C N O S, ball radius in Å
  var BOND_RADIUS = 0.2;
  var BOND_CUTOFF = 1.9;         // Å, heavy-atom covalent bonds
  var BEADS = 4;                 // interior spheres per bond

  // ---- Camera ----
  var CAM = 6.5;
  var AX_HOME = 0.6, AX_ZOOM = 1.3;       // tilt of the axis toward the viewer (side-on = 0, end-on = π/2)
  var ROLL_HOME = -0.12, ROLL_ZOOM = -0.42;
  var SLAB_FAR = [0.2, 0.55];             // model units behind the focus where atoms fade out
  var SLAB_NEAR = [0.04, 0.2];             // …and in front (cut away so the cross-section reads)

  // ---- Shaders ----
  var COMMON = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec2 uSub; uniform float uYsub;',
    'uniform vec2 uSpin; uniform vec2 uTilt; uniform vec2 uRoll;',
    'uniform float uYc; uniform float uCam; uniform float uScale; uniform float uDpr;',
    'uniform vec2 uView; uniform vec2 uCenter;',
    // model point (one subunit's frame) → clip space; also view depth and perspective factor
    'vec4 place(vec3 m, out float z2, out float p) {',
    '  vec3 q = vec3(m.x * uSub.x + m.z * uSub.y, m.y + uYsub - uYc, -m.x * uSub.y + m.z * uSub.x);',
    '  float x1 = q.x * uSpin.x + q.z * uSpin.y;',
    '  float z1 = -q.x * uSpin.y + q.z * uSpin.x;',
    '  float y2 = q.y * uTilt.x - z1 * uTilt.y;',
    '  z2 = q.y * uTilt.y + z1 * uTilt.x;',
    '  float x3 = x1 * uRoll.x - y2 * uRoll.y;',
    '  float y3 = x1 * uRoll.y + y2 * uRoll.x;',
    '  p = uCam / max(uCam - z2, 0.3);',
    '  vec2 s = vec2(uCenter.x + x3 * uScale * p, uCenter.y - y3 * uScale * p);',
    '  return vec4(s.x / uView.x * 2.0 - 1.0, 1.0 - s.y / uView.y * 2.0, -z2 / 8.0, 1.0);',
    '}'
  ].join('\n');

  var LINE_VS = COMMON + '\n' + [
    'in vec3 aPos; uniform float uAlpha; uniform float uLight; out float vA;',
    'void main() {',
    '  float z2, p; gl_Position = place(aPos, z2, p);',
    '  float dep = clamp((z2 + 1.6) / 3.2, 0.0, 1.0);',
    '  vA = (0.07 + dep * 0.22) * uAlpha * mix(1.0, 1.2, uLight);',
    '}'
  ].join('\n');
  var LINE_FS = [
    '#version 300 es', 'precision mediump float;',
    'in float vA; uniform vec3 uColor; out vec4 o;',
    'void main() { o = vec4(uColor * vA, vA); }'
  ].join('\n');

  var DOT_VS = COMMON + '\n' + [
    'in vec4 aPos; uniform float uAlpha; uniform float uLight; uniform float uSize; uniform float uDust; out float vA;',
    'void main() {',
    '  float z2, p; gl_Position = place(aPos.xyz, z2, p);',
    '  float dep = clamp((z2 + 1.6) / 3.2, 0.0, 1.0);',
    '  if (uDust > 0.5) { gl_PointSize = aPos.w * p * 2.0 * uDpr; vA = uAlpha; }',
    '  else { gl_PointSize = (0.6 + dep * 1.5) * uSize * uDpr * 1.4; vA = (0.16 + dep * 0.7) * uAlpha * mix(1.0, 0.9, uLight); }',
    '}'
  ].join('\n');
  var DOT_FS = [
    '#version 300 es', 'precision mediump float;',
    'in float vA; uniform vec3 uColor; out vec4 o;',
    'void main() {',
    '  float r = length(gl_PointCoord * 2.0 - 1.0); if (r > 1.0) discard;',
    '  float a = vA * (1.0 - smoothstep(0.55, 1.0, r)); o = vec4(uColor * a, a);',
    '}'
  ].join('\n');

  var ATOM_VS = COMMON + '\n' + [
    'in vec3 aPos; in vec3 aMeta;           // residue, element, radius (Å)',
    'uniform float uPf; uniform float uMix; uniform float uFade; uniform float uLight;',
    'uniform vec2 uHi; uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uBg;',
    'uniform vec3 uN; uniform vec3 uO; uniform vec3 uS; uniform float uUnit;',
    'out vec3 vCol; out float vA; out float vZ; out float vR;',
    'void main() {',
    '  float z2, p; gl_Position = place(aPos, z2, p);',
    '  float kind = aMeta.y;',
    '  vec3 pf = uPf > 0.5 ? uColB : uColA;',
    '  vec3 el = kind < 0.5 ? uColA : (kind < 1.5 ? uN : (kind < 2.5 ? uO : uS));',
    '  float hi = smoothstep(uHi.x - 1.0, uHi.x - 0.25, aMeta.x) * (1.0 - smoothstep(uHi.y + 0.25, uHi.y + 1.0, aMeta.x));',
    '  vec3 hiCol = kind < 0.5 ? uColB : el;',
    '  vec3 zoomCol = mix(mix(el, uBg, 0.4), hiCol, hi);',
    '  vec3 col = mix(pf, zoomCol, uMix);',
    '  float dep = clamp((z2 + 1.8) / 3.6, 0.0, 1.0);',
    '  vCol = mix(uBg, col, 0.45 + 0.55 * dep);',
    '  vA = uFade; vZ = z2; vR = aMeta.z / uUnit;',
    '  gl_PointSize = 2.0 * vR * uScale * p * uDpr;',
    '}'
  ].join('\n');
  var ATOM_FS = [
    '#version 300 es', 'precision highp float;',
    'in vec3 vCol; in float vA; in float vZ; in float vR; uniform float uLight; out vec4 o;',
    'void main() {',
    '  vec2 c = gl_PointCoord * 2.0 - 1.0; float d2 = dot(c, c); if (d2 > 1.0) discard;',
    '  float nz = sqrt(1.0 - d2);',
    '  vec3 n = vec3(c.x, -c.y, nz);',
    '  float diff = max(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0);',
    '  float rim = pow(1.0 - nz, 2.5);',
    '  vec3 col = vCol * (0.42 + 0.7 * diff) + (1.0 - uLight * 1.6) * rim * 0.1;',
    '  o = vec4(col * vA, vA);',
    '  gl_FragDepth = (-(vZ + nz * vR) / 8.0) * 0.5 + 0.5;',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs, uniforms) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {};
    uniforms.concat(['uSub', 'uYsub', 'uSpin', 'uTilt', 'uRoll', 'uYc', 'uCam', 'uScale', 'uDpr', 'uView', 'uCenter'])
      .forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
    return { p: p, u: u };
  }

  var lineP, dotP, atomP;
  try {
    lineP = program(LINE_VS, LINE_FS, ['uAlpha', 'uLight', 'uColor']);
    dotP = program(DOT_VS, DOT_FS, ['uAlpha', 'uLight', 'uSize', 'uDust', 'uColor']);
    atomP = program(ATOM_VS, ATOM_FS, ['uPf', 'uMix', 'uFade', 'uLight', 'uHi', 'uColA', 'uColB', 'uBg', 'uN', 'uO', 'uS', 'uUnit']);
  } catch (err) {
    if (window.console) console.warn('Fibril: WebGL setup failed', err);
    return;
  }

  // ---- Buffers ----
  function buffer(data, usage) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
    return b;
  }
  function vao(prog, buf, attrs, stride) {
    var v = gl.createVertexArray();
    gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    attrs.forEach(function (a) {
      var loc = gl.getAttribLocation(prog.p, a.name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, stride * 4, a.offset * 4);
    });
    gl.bindVertexArray(null);
    return v;
  }

  // Cα trace: vec4 (x, y, z, 0) in model units
  var caArr = new Float32Array(RES * 4);
  for (var r = 0; r < RES; r++) {
    caArr[r * 4] = CA[r * 3] / UNIT;
    caArr[r * 4 + 1] = CA[r * 3 + 1] / UNIT;
    caArr[r * 4 + 2] = CA[r * 3 + 2] / UNIT;
  }
  var caBuf = buffer(caArr);
  var caLineVao = vao(lineP, caBuf, [{ name: 'aPos', size: 3, offset: 0 }], 4);
  var caDotVao = vao(dotP, caBuf, [{ name: 'aPos', size: 4, offset: 0 }], 4);

  // Ambient "monomers" drifting in the volume: vec4 (x, y, z, radius px)
  var DUST = 80;
  var dust = [];
  var dustArr = new Float32Array(DUST * 4);
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
  var dustBuf = buffer(dustArr, gl.DYNAMIC_DRAW);
  var dustVao = vao(dotP, dustBuf, [{ name: 'aPos', size: 4, offset: 0 }], 4);
  function packDust() {
    for (var d = 0; d < DUST; d++) {
      var q = dust[d];
      dustArr[d * 4] = q.x; dustArr[d * 4 + 1] = q.y; dustArr[d * 4 + 2] = q.z; dustArr[d * 4 + 3] = q.r;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, dustBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, dustArr);
  }

  // All heavy atoms of one subunit plus beads along every covalent bond, so
  // each sphere is a point sprite and bonds read as sticks. vec6 (xyz, residue, element, radius Å)
  var nAtoms = atomData.length / 5;
  var verts = [];
  function pushVert(x, y, z, res, kind, rad) { verts.push(x / UNIT, y / UNIT, z / UNIT, res, kind, rad); }
  for (var a = 0; a < nAtoms; a++) {
    pushVert(atomData[a * 5 + 2], atomData[a * 5 + 3], atomData[a * 5 + 4], atomData[a * 5], atomData[a * 5 + 1], ATOM_RADIUS[atomData[a * 5 + 1]]);
  }
  for (var i2 = 0; i2 < nAtoms; i2++) {
    for (var j2 = i2 + 1; j2 < nAtoms; j2++) {
      var dx = atomData[i2 * 5 + 2] - atomData[j2 * 5 + 2];
      var dy = atomData[i2 * 5 + 3] - atomData[j2 * 5 + 3];
      var dz = atomData[i2 * 5 + 4] - atomData[j2 * 5 + 4];
      if (dx * dx + dy * dy + dz * dz > BOND_CUTOFF * BOND_CUTOFF) continue;
      for (var b = 1; b <= BEADS; b++) {
        var t = b / (BEADS + 1), src = t < 0.5 ? i2 : j2;
        pushVert(
          atomData[i2 * 5 + 2] + (atomData[j2 * 5 + 2] - atomData[i2 * 5 + 2]) * t,
          atomData[i2 * 5 + 3] + (atomData[j2 * 5 + 3] - atomData[i2 * 5 + 3]) * t,
          atomData[i2 * 5 + 4] + (atomData[j2 * 5 + 4] - atomData[i2 * 5 + 4]) * t,
          atomData[src * 5], atomData[src * 5 + 1], BOND_RADIUS);
      }
    }
  }
  var atomCount = verts.length / 6;
  var atomBuf = buffer(new Float32Array(verts));
  var atomVao = vao(atomP, atomBuf, [{ name: 'aPos', size: 3, offset: 0 }, { name: 'aMeta', size: 3, offset: 3 }], 6);

  // Per-subunit placement (screw about the fibril axis) and edge fade
  var subC = new Float32Array(SUBUNITS), subS = new Float32Array(SUBUNITS), subY = new Float32Array(SUBUNITS), subEdge = new Float32Array(SUBUNITS);
  for (var k = 0; k < SUBUNITS; k++) {
    var n = k - SUBUNITS / 2;
    subC[k] = Math.cos(n * SCREW);
    subS[k] = Math.sin(n * SCREW);
    subY[k] = n * RISE / UNIT;
    var e = Math.min(k, SUBUNITS - 1 - k) / 18;
    subEdge[k] = e >= 1 ? 1 : e * e * (3 - 2 * e);
  }

  // ---- State ----
  var view = { W: 0, H: 0, dpr: 1, scale0: 1, zoomScale: 1, home: { x: 0, y: 0 }, zoomC: { x: 0, y: 0 }, spacing: 0.85 };
  var colA = [0.78, 0.84, 0.92], colB = [0.85, 0.76, 0.49], bg = [0.03, 0.04, 0.06];
  var elN, elO, elS;
  var isLight = false;
  var spin = 0.6;
  var mouseX = 0, mouseY = 0, tiltX = 0, tiltY = 0;
  var running = false, last = 0;
  var stations = 7, focusIndex = -1;
  var state = { yc: 0, z: 0, r0: 1, r1: 6 };
  var tween = null;
  var pointMax = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64;

  function triplet(str, fallback) {
    var m = String(str).split(',').map(function (v) { return parseFloat(v) / 255; });
    return m.length === 3 && m.every(isFinite) ? m : fallback;
  }
  function hex(str, fallback) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(str).trim());
    if (!m) return fallback;
    var v = parseInt(m[1], 16);
    return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
  }
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    colA = triplet(cs.getPropertyValue('--fibril-a'), colA);
    colB = triplet(cs.getPropertyValue('--fibril-b'), colB);
    bg = hex(cs.getPropertyValue('--bg'), bg);
    isLight = lightQuery.matches;
    elN = isLight ? [0.14, 0.33, 0.75] : [0.41, 0.58, 0.93];
    elO = isLight ? [0.75, 0.19, 0.2] : [0.93, 0.4, 0.41];
    elS = isLight ? [0.62, 0.47, 0.04] : [0.93, 0.81, 0.36];
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth, H = window.innerHeight;
    view.W = W; view.H = H; view.dpr = dpr;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    view.scale0 = Math.min(W, H) * (W < 640 ? 0.23 : 0.19);

    // Region of the screen the tree grows in (the hero text may own the top on phones)
    var top = api.reserve.top || 0, bottom = api.reserve.bottom || 0;
    view.home.x = W / 2;
    view.home.y = (top + H - bottom) / 2;
    var spacingPx = Math.max(56, Math.min(120, (H - top - bottom - 60) / stations));
    view.spacing = spacingPx;

    // Zoom: fill the part of the screen the content card leaves free
    var visW, visH;
    if (sheetQuery.matches) {
      visW = W; visH = H * 0.4;
      view.zoomC.x = W / 2; view.zoomC.y = visH / 2 + 8;
    } else {
      visW = W - Math.min(736, W * 0.52); visH = H;
      view.zoomC.x = visW / 2; view.zoomC.y = H / 2;
    }
    var want = Math.min(visW, visH) * 0.6;
    var cap = 0.95 * pointMax / (2 * Math.max.apply(null, ATOM_RADIUS) / UNIT * dpr * 1.4);
    view.zoomScale = Math.max(view.scale0 * 1.6, Math.min(want, cap));
    if (!running) render();
  }

  // Stations are evenly spaced on screen (view.spacing px apart), so undo the perspective
  // foreshortening along the axis: s = k·y·CAM / (CAM − y·sin a)  ⇒  y = s·CAM / (k·CAM + s·sin a)
  function stationY(i) {
    var s = ((stations - 1) / 2 - i) * view.spacing;
    var k = view.scale0 * Math.cos(AX_HOME) * Math.cos(ROLL_HOME);
    return s * CAM / (k * CAM + s * Math.sin(AX_HOME));
  }

  // ---- Math helpers ----
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(a, b, v) { var t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // Screen position of a point on the fibril axis in the resting (home) pose
  api.project = function (i) {
    var ax = AX_HOME + tiltY * 0.25, roll = ROLL_HOME + tiltX * 0.08;
    var cx = Math.cos(ax), sx = Math.sin(ax), cr = Math.cos(roll), sr = Math.sin(roll);
    function at(y) {
      var y2 = y * cx, z2 = y * sx;
      var p = CAM / (CAM - z2);
      return [view.home.x + (-y2 * sr) * view.scale0 * p, view.home.y - (y2 * cr) * view.scale0 * p];
    }
    var y = stationY(i), a = at(y), b = at(y + 0.2);
    var ux = b[0] - a[0], uy = b[1] - a[1], len = Math.hypot(ux, uy) || 1;
    return { x: a[0], y: a[1], ux: ux / len, uy: uy / len };
  };

  // Equal slices of the 42 residues, N → C, one per section
  api.segment = function (i) {
    return [Math.round(i * 42 / stations) + 1, Math.round((i + 1) * 42 / stations)];
  };
  api.setStations = function (count) { stations = count; resize(); };
  api.resize = resize;

  api.focus = function (i) {
    focusIndex = i;
    var to;
    if (i < 0) {
      to = { yc: 0, z: 0, r0: state.r0, r1: state.r1 };
    } else {
      var seg = api.segment(i);
      to = { yc: stationY(i), z: 1, r0: seg[0], r1: seg[1] };
      if (state.z < 0.02) { state.r0 = to.r0; state.r1 = to.r1; }
    }
    if (reduceMotion.matches) {
      state = to; tween = null; render();
      return;
    }
    tween = {
      a: { yc: state.yc, z: state.z, r0: state.r0, r1: state.r1 }, b: to,
      t0: performance.now(), dur: i < 0 ? 1050 : (state.z > 0.6 ? 950 : 1600)
    };
    start();
  };

  function stepTween(now) {
    if (!tween) return;
    var p = Math.min(1, (now - tween.t0) / tween.dur), e = ease(p), a = tween.a, b = tween.b;
    state.z = lerp(a.z, b.z, e);
    state.yc = lerp(a.yc, b.yc, ease(Math.min(1, p / 0.88)));
    state.r0 = lerp(a.r0, b.r0, e);
    state.r1 = lerp(a.r1, b.r1, e);
    if (p >= 1) tween = null;
  }

  // ---- Draw ----
  function setCommon(P, C) {
    var u = P.u;
    gl.uniform2f(u.uSpin, C.cy, C.sy);
    gl.uniform2f(u.uTilt, C.cx, C.sx);
    gl.uniform2f(u.uRoll, C.cr, C.sr);
    gl.uniform1f(u.uYc, state.yc);
    gl.uniform1f(u.uCam, CAM);
    gl.uniform1f(u.uScale, C.scale);
    gl.uniform1f(u.uDpr, view.dpr);
    gl.uniform2f(u.uView, view.W, view.H);
    gl.uniform2f(u.uCenter, C.px, C.py);
  }

  function slab(dY) {
    return dY < 0 ? 1 - smooth(SLAB_FAR[0], SLAB_FAR[1], -dY) : 1 - smooth(SLAB_NEAR[0], SLAB_NEAR[1], dY);
  }

  function render() {
    var z = state.z;
    var ax = lerp(AX_HOME, AX_ZOOM, z) + tiltY * 0.25;
    var roll = lerp(ROLL_HOME, ROLL_ZOOM, z) + tiltX * 0.08;
    var C = {
      cy: Math.cos(spin), sy: Math.sin(spin),
      cx: Math.cos(ax), sx: Math.sin(ax),
      cr: Math.cos(roll), sr: Math.sin(roll),
      scale: view.scale0 * Math.pow(view.zoomScale / view.scale0, z),
      px: lerp(view.home.x, view.zoomC.x, z), py: lerp(view.home.y, view.zoomC.y, z)
    };
    var atomMix = smooth(0.3, 0.85, z);
    var light = isLight ? 1 : 0;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    if (isLight) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.ONE, gl.ONE);

    var k, fade;
    // dust (not tied to the fibril's spin)
    gl.useProgram(dotP.p);
    setCommon(dotP, C);
    gl.uniform2f(dotP.u.uSpin, 1, 0);
    gl.uniform2f(dotP.u.uSub, 1, 0);
    gl.uniform1f(dotP.u.uYsub, 0);
    gl.uniform1f(dotP.u.uLight, light);
    gl.uniform1f(dotP.u.uDust, 1);
    gl.uniform1f(dotP.u.uAlpha, (isLight ? 0.18 : 0.14) * (1 - 0.7 * z));
    gl.uniform3fv(dotP.u.uColor, colA);
    gl.bindVertexArray(dustVao);
    gl.drawArrays(gl.POINTS, 0, DUST);

    // backbones
    gl.useProgram(lineP.p);
    setCommon(lineP, C);
    gl.uniform1f(lineP.u.uLight, light);
    gl.bindVertexArray(caLineVao);
    for (k = 0; k < SUBUNITS; k++) {
      fade = subEdge[k] * (1 - atomMix * slab(subY[k] - state.yc));
      if (fade < 0.004) continue;
      gl.uniform2f(lineP.u.uSub, subC[k], subS[k]);
      gl.uniform1f(lineP.u.uYsub, subY[k]);
      gl.uniform1f(lineP.u.uAlpha, fade);
      gl.uniform3fv(lineP.u.uColor, k % 2 ? colB : colA);
      gl.drawArrays(gl.LINE_STRIP, 0, RES);
    }

    // residues
    gl.useProgram(dotP.p);
    gl.uniform2f(dotP.u.uSpin, C.cy, C.sy);
    gl.uniform1f(dotP.u.uDust, 0);
    gl.uniform1f(dotP.u.uSize, window.innerWidth < 640 ? 0.85 : 1);
    gl.bindVertexArray(caDotVao);
    for (k = 0; k < SUBUNITS; k++) {
      fade = subEdge[k] * (1 - atomMix * slab(subY[k] - state.yc));
      if (fade < 0.004) continue;
      gl.uniform2f(dotP.u.uSub, subC[k], subS[k]);
      gl.uniform1f(dotP.u.uYsub, subY[k]);
      gl.uniform1f(dotP.u.uAlpha, fade);
      gl.uniform3fv(dotP.u.uColor, k % 2 ? colB : colA);
      gl.drawArrays(gl.POINTS, 0, RES);
    }

    // atoms, only the slab around the focus
    if (atomMix > 0.004) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(atomP.p);
      setCommon(atomP, C);
      var u = atomP.u;
      gl.uniform1f(u.uMix, atomMix);
      gl.uniform1f(u.uLight, light);
      gl.uniform2f(u.uHi, state.r0, state.r1);
      gl.uniform3fv(u.uColA, colA);
      gl.uniform3fv(u.uColB, colB);
      gl.uniform3fv(u.uBg, bg);
      gl.uniform3fv(u.uN, elN);
      gl.uniform3fv(u.uO, elO);
      gl.uniform3fv(u.uS, elS);
      gl.uniform1f(u.uUnit, UNIT);
      gl.bindVertexArray(atomVao);
      for (k = 0; k < SUBUNITS; k++) {
        fade = subEdge[k] * atomMix * slab(subY[k] - state.yc);
        if (fade < 0.01) continue;
        gl.uniform2f(u.uSub, subC[k], subS[k]);
        gl.uniform1f(u.uYsub, subY[k]);
        gl.uniform1f(u.uPf, k % 2);
        gl.uniform1f(u.uFade, fade);
        gl.drawArrays(gl.POINTS, 0, atomCount);
      }
    }
    gl.bindVertexArray(null);

    if (api.onframe) api.onframe(state);
  }

  function tick(now) {
    if (!running) return;
    var dt = Math.min(now - last, 50);
    last = now;
    spin += dt * 0.00012 * (1 - 0.5 * state.z);
    tiltX += (mouseX - tiltX) * 0.04;
    tiltY += (mouseY - tiltY) * 0.04;
    for (var d = 0; d < DUST; d++) {
      var q = dust[d];
      q.x += q.vx * dt * 0.06;
      q.y += q.vy * dt * 0.06;
      if (q.x > 4.5) q.x = -4.5; else if (q.x < -4.5) q.x = 4.5;
      if (q.y > 3) q.y = -3; else if (q.y < -3) q.y = 3;
    }
    packDust();
    stepTween(now);
    render();
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
    mouseX = (e.clientX / view.W - 0.5) * 2;
    mouseY = (e.clientY / view.H - 0.5) * 2;
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  function onPrefChange() {
    readColors();
    if (reduceMotion.matches) { stop(); if (tween) { state = tween.b; tween = null; } render(); } else start();
  }
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener('change', onPrefChange);
    lightQuery.addEventListener('change', function () { readColors(); render(); });
    sheetQuery.addEventListener('change', resize);
  }

  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); });

  api.ready = true;
  document.documentElement.classList.add('gl');
  readColors();
  packDust();
  resize();
  render();
  start();
})();
