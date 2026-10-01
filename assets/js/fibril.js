/* ==========================================================================
   Background: an Aβ42 amyloid fibril built from the cryo-EM structure PDB 5OQV
   (two protofilaments of LS-shaped subunits), rendered in WebGL2. At rest it is
   the Cα backbone ("bones") and stays still; main.js turns the sections into
   branches that grow from it. Opening one flies the camera to that section's
   own view of the structure (top, side, or zoomed into the core) with every
   atom drawn around the focus, and its stretch of the sequence lit up.
   The loop only runs while something moves. Without WebGL2 nothing here runs
   and the page falls back to a plain nav.
   ========================================================================== */
(function () {
  'use strict';

  var api = window.Fibril = { ready: false, onlayout: null, reserve: { top: 0, bottom: 0 } };

  var canvas = document.getElementById('fibril');
  var atomData = window.ABETA_ATOMS;
  if (!canvas || !atomData) return;
  var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'high-performance' });
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
  var BOND_CUTOFF = 1.9;         // Å, heavy-atom covalent bonds
  var TAU = Math.PI * 2;

  // ---- Camera ----
  var CAM = 6.5;                 // perspective distance, model units
  var AX_HOME = 0.6;             // tilt of the axis toward the viewer (side-on 0, end-on π/2)
  var ROLL_HOME = -0.12;
  var SPIN_HOME = 0.6;

  // One view per section: where the camera looks and how much of the fibril it keeps.
  //   mode  'axis' looks at the fibril axis; 'res' looks at the section's own residues
  //   ax    0 = side-on … π/2 = straight down the axis (top view)
  //   wu    model units of fibril that fit across the free part of the screen
  //   far / near   how far (units) atoms are kept behind / in front of the focus along the axis
  //   depth        optional cut either side of the focus in view depth (side views)
  //   rate  turntable speed, rad/s; 0 = holds still
  var VIEWS = [
    { mode: 'axis', ax: 1.5,  roll: -0.35, spin: 0.2, rate: 0.12,  wu: 2.5, far: 0.2,  near: 0.03 },              // About: top, whole cross-section
    { mode: 'axis', ax: 0.16, roll: 0.0,   spin: 0.5, rate: 0.10,  wu: 2.3, far: 0.7,  near: 0.7,  depth: 0.4 },  // Research: side, turntable
    { mode: 'res',  ax: 0.95, roll: -0.5,  spin: 1.0, rate: 0.07,  wu: 0.9, far: 0.12, near: 0.03 },              // Publications: zoomed into the core
    { mode: 'res',  ax: 0.5,  roll: 0.25,  spin: 2.2, rate: 0,     wu: 1.6, far: 0.4,  near: 0.4,  depth: 0.5 },  // Experience: oblique, still
    { mode: 'res',  ax: 1.45, roll: -0.9,  spin: 0.0, rate: 0,     wu: 1.3, far: 0.14, near: 0.03 },              // Honors: top, zoomed, still
    { mode: 'res',  ax: 0.12, roll: 0.0,   spin: 3.4, rate: 0.08,  wu: 1.1, far: 0.4,  near: 0.4,  depth: 0.3 },  // Skills: side, close
    { mode: 'res',  ax: 1.0,  roll: 0.6,   spin: 4.4, rate: -0.06, wu: 0.95, far: 0.12, near: 0.03 }              // Contact: zoomed into the core
  ];

  // ---- Shaders ----
  var COMMON = [
    '#version 300 es',
    'precision highp float;',
    'in vec4 aInst;   // per subunit: cos, sin of its screw rotation, rise, fade',
    'in float aPf;    // protofilament (0 / 1)',
    'uniform vec3 uT; uniform vec2 uSpin; uniform vec2 uTilt; uniform vec2 uRoll;',
    'uniform float uCam; uniform float uScale; uniform float uDpr;',
    'uniform vec2 uView; uniform vec2 uCenter;',
    // model point (one subunit's frame) → clip space; also view depth and perspective factor
    'vec4 place(vec3 m, out float z2, out float p) {',
    '  vec3 q = vec3(m.x * aInst.x + m.z * aInst.y, m.y + aInst.z, -m.x * aInst.y + m.z * aInst.x) - uT;',
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
    'in vec3 aPos; uniform float uAlpha; uniform float uLight; uniform vec3 uColA; uniform vec3 uColB;',
    'out float vA; out vec3 vC;',
    'void main() {',
    '  float z2, p; gl_Position = place(aPos, z2, p);',
    '  float dep = clamp((z2 + 1.6) / 3.2, 0.0, 1.0);',
    '  vA = (0.07 + dep * 0.22) * uAlpha * aInst.w * mix(1.0, 1.2, uLight);',
    '  vC = aPf > 0.5 ? uColB : uColA;',
    '}'
  ].join('\n');
  var LINE_FS = [
    '#version 300 es', 'precision mediump float;',
    'in float vA; in vec3 vC; out vec4 o;',
    'void main() { o = vec4(vC * vA, vA); }'
  ].join('\n');

  var DOT_VS = COMMON + '\n' + [
    'in vec3 aPos; uniform float uAlpha; uniform float uLight; uniform float uSize; uniform float uDust;',
    'uniform vec3 uColA; uniform vec3 uColB; uniform float uDustSize;',
    'out float vA; out vec3 vC;',
    'void main() {',
    '  float z2, p; gl_Position = place(aPos, z2, p);',
    '  float dep = clamp((z2 + 1.6) / 3.2, 0.0, 1.0);',
    '  if (uDust > 0.5) { gl_PointSize = uDustSize * p * uDpr; vA = uAlpha; }',
    '  else { gl_PointSize = (0.6 + dep * 1.5) * uSize * uDpr * 1.4; vA = (0.16 + dep * 0.7) * uAlpha * aInst.w * mix(1.0, 0.9, uLight); }',
    '  vC = aPf > 0.5 ? uColB : uColA;',
    '}'
  ].join('\n');
  var DOT_FS = [
    '#version 300 es', 'precision mediump float;',
    'in float vA; in vec3 vC; out vec4 o;',
    'void main() {',
    '  float r = length(gl_PointCoord * 2.0 - 1.0); if (r > 1.0) discard;',
    '  float a = vA * (1.0 - smoothstep(0.55, 1.0, r)); o = vec4(vC * a, a);',
    '}'
  ].join('\n');

  // Atoms (small point-sprite spheres) and bonds (thin lines) share their colouring:
  // a protofilament tint when far, element colours once zoomed with the section's
  // residues in gold and everything else dimmed back.
  var ATOM_COMMON = COMMON + '\n' + [
    'in vec3 aPos; in vec2 aMeta;           // residue number, element',
    'uniform float uMix; uniform float uLight; uniform float uDepth;',
    'uniform vec2 uHi; uniform vec3 uColA; uniform vec3 uColB; uniform vec3 uBg;',
    'uniform vec3 uN; uniform vec3 uO; uniform vec3 uS;',
    'vec3 shade(float z2) {',
    '  float kind = aMeta.y;',
    '  vec3 pf = aPf > 0.5 ? uColB : uColA;',
    '  vec3 el = kind < 0.5 ? uColA : (kind < 1.5 ? uN : (kind < 2.5 ? uO : uS));',
    '  float hi = smoothstep(uHi.x - 1.0, uHi.x - 0.25, aMeta.x) * (1.0 - smoothstep(uHi.y + 0.25, uHi.y + 1.0, aMeta.x));',
    '  vec3 hiCol = kind < 0.5 ? uColB : el;',
    '  vec3 col = mix(pf, mix(mix(el, uBg, 0.4), hiCol, hi), uMix);',
    '  float dep = clamp((z2 + 1.8) / 3.6, 0.0, 1.0);',
    '  return mix(uBg, col, 0.45 + 0.55 * dep);',
    '}',
    'float cut(float z2) { return 1.0 - smoothstep(uDepth * 0.7, uDepth, abs(z2)); }'
  ].join('\n');

  var ATOM_VS = ATOM_COMMON + '\n' + [
    'uniform float uBallPx;',
    'out vec3 vCol; out float vA;',
    'void main() {',
    '  float z2, p; gl_Position = place(aPos, z2, p);',
    '  float k = aMeta.y < 0.5 ? 1.0 : (aMeta.y < 1.5 ? 0.95 : (aMeta.y < 2.5 ? 0.9 : 1.3));',
    '  float r = uBallPx * k;',
    '  gl_Position.z = -(z2 + r / (uScale * p)) / 8.0;     // depth of the sphere\'s front, so bonds tuck behind it',
    '  vCol = shade(z2);',
    '  vA = aInst.w * cut(z2);',
    '  gl_PointSize = 2.0 * r * uDpr;',
    '}'
  ].join('\n');
  var ATOM_FS = [
    '#version 300 es', 'precision highp float;',
    'in vec3 vCol; in float vA; uniform float uLight; out vec4 o;',
    'void main() {',
    '  vec2 c = gl_PointCoord * 2.0 - 1.0; float d2 = dot(c, c); if (d2 > 1.0) discard;',
    '  float nz = sqrt(1.0 - d2);',
    '  float diff = max(dot(vec3(c.x, -c.y, nz), normalize(vec3(-0.45, 0.55, 0.7))), 0.0);',
    '  vec3 col = vCol * (0.42 + 0.7 * diff) + (1.0 - uLight * 1.6) * pow(1.0 - nz, 2.5) * 0.1;',
    '  float a = vA * (1.0 - smoothstep(0.8, 1.0, sqrt(d2)));',
    '  o = vec4(col * a, a);',
    '}'
  ].join('\n');

  var BOND_VS = ATOM_COMMON + '\n' + [
    'out vec3 vCol; out float vA;',
    'void main() {',
    '  float z2, p; gl_Position = place(aPos, z2, p);',
    '  vCol = shade(z2) * 0.9;',
    '  vA = aInst.w * cut(z2) * 0.9;',
    '}'
  ].join('\n');
  var BOND_FS = [
    '#version 300 es', 'precision mediump float;',
    'in vec3 vCol; in float vA; out vec4 o;',
    'void main() { o = vec4(vCol * vA, vA); }'
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
    uniforms.concat(['uT', 'uSpin', 'uTilt', 'uRoll', 'uCam', 'uScale', 'uDpr', 'uView', 'uCenter'])
      .forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
    return { p: p, u: u, aInst: gl.getAttribLocation(p, 'aInst'), aPf: gl.getAttribLocation(p, 'aPf') };
  }

  var lineP, dotP, atomP, bondP;
  try {
    lineP = program(LINE_VS, LINE_FS, ['uAlpha', 'uLight', 'uColA', 'uColB']);
    dotP = program(DOT_VS, DOT_FS, ['uAlpha', 'uLight', 'uSize', 'uDust', 'uDustSize', 'uColA', 'uColB']);
    var atomU = ['uMix', 'uLight', 'uDepth', 'uHi', 'uColA', 'uColB', 'uBg', 'uN', 'uO', 'uS'];
    atomP = program(ATOM_VS, ATOM_FS, atomU.concat(['uBallPx']));
    bondP = program(BOND_VS, BOND_FS, atomU);
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
  // Per-subunit instance data: cos, sin, rise, fade, protofilament
  var instFar = new Float32Array(SUBUNITS * 5), instAtom = new Float32Array(SUBUNITS * 5);
  var instFarBuf = buffer(instFar, gl.DYNAMIC_DRAW), instAtomBuf = buffer(instAtom, gl.DYNAMIC_DRAW);

  function vao(prog, buf, attrs, stride, inst) {
    var v = gl.createVertexArray();
    gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    attrs.forEach(function (a) {
      var loc = gl.getAttribLocation(prog.p, a.name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, stride * 4, a.offset * 4);
    });
    if (inst) {
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.enableVertexAttribArray(prog.aInst);
      gl.vertexAttribPointer(prog.aInst, 4, gl.FLOAT, false, 20, 0);
      gl.vertexAttribDivisor(prog.aInst, 1);
      gl.enableVertexAttribArray(prog.aPf);
      gl.vertexAttribPointer(prog.aPf, 1, gl.FLOAT, false, 20, 16);
      gl.vertexAttribDivisor(prog.aPf, 1);
    }
    gl.bindVertexArray(null);
    return v;
  }

  // Cα trace in model units
  var caArr = new Float32Array(RES * 3);
  for (var r = 0; r < RES; r++) {
    caArr[r * 3] = CA[r * 3] / UNIT; caArr[r * 3 + 1] = CA[r * 3 + 1] / UNIT; caArr[r * 3 + 2] = CA[r * 3 + 2] / UNIT;
  }
  var caBuf = buffer(caArr);
  var caLineVao = vao(lineP, caBuf, [{ name: 'aPos', size: 3, offset: 0 }], 3, instFarBuf);
  var caDotVao = vao(dotP, caBuf, [{ name: 'aPos', size: 3, offset: 0 }], 3, instFarBuf);

  // Ambient "monomers": fixed specks scattered in the volume
  var DUST = 80;
  var dustArr = new Float32Array(DUST * 3);
  for (var i = 0; i < DUST; i++) {
    dustArr[i * 3] = (Math.random() - 0.5) * 9;
    dustArr[i * 3 + 1] = (Math.random() - 0.5) * 6;
    dustArr[i * 3 + 2] = (Math.random() - 0.5) * 5;
  }
  var dustVao = vao(dotP, buffer(dustArr), [{ name: 'aPos', size: 3, offset: 0 }], 3, null);

  // Heavy atoms of one subunit and their covalent bonds, each bond as two coloured halves
  var nAtoms = atomData.length / 5;
  var atomVerts = new Float32Array(nAtoms * 5);
  for (var a = 0; a < nAtoms; a++) {
    atomVerts[a * 5] = atomData[a * 5 + 2] / UNIT;
    atomVerts[a * 5 + 1] = atomData[a * 5 + 3] / UNIT;
    atomVerts[a * 5 + 2] = atomData[a * 5 + 4] / UNIT;
    atomVerts[a * 5 + 3] = atomData[a * 5];
    atomVerts[a * 5 + 4] = atomData[a * 5 + 1];
  }
  var bondList = [];
  function pushBond(x, y, z, res, kind) { bondList.push(x / UNIT, y / UNIT, z / UNIT, res, kind); }
  for (var i2 = 0; i2 < nAtoms; i2++) {
    for (var j2 = i2 + 1; j2 < nAtoms; j2++) {
      var A = i2 * 5, B = j2 * 5;
      var dx = atomData[A + 2] - atomData[B + 2], dy = atomData[A + 3] - atomData[B + 3], dz = atomData[A + 4] - atomData[B + 4];
      if (dx * dx + dy * dy + dz * dz > BOND_CUTOFF * BOND_CUTOFF) continue;
      var mx = (atomData[A + 2] + atomData[B + 2]) / 2, my = (atomData[A + 3] + atomData[B + 3]) / 2, mz = (atomData[A + 4] + atomData[B + 4]) / 2;
      pushBond(atomData[A + 2], atomData[A + 3], atomData[A + 4], atomData[A], atomData[A + 1]);
      pushBond(mx, my, mz, atomData[A], atomData[A + 1]);
      pushBond(mx, my, mz, atomData[B], atomData[B + 1]);
      pushBond(atomData[B + 2], atomData[B + 3], atomData[B + 4], atomData[B], atomData[B + 1]);
    }
  }
  var bondCount = bondList.length / 5;
  var atomLayout = [{ name: 'aPos', size: 3, offset: 0 }, { name: 'aMeta', size: 2, offset: 3 }];
  var atomVao = vao(atomP, buffer(atomVerts), atomLayout, 5, instAtomBuf);
  var bondVao = vao(bondP, buffer(new Float32Array(bondList)), atomLayout, 5, instAtomBuf);

  // Centre of each stretch of sequence in the subunit frame, for the views that zoom to it
  function centroid(r0, r1) {
    var sx = 0, sy = 0, sz = 0, n = 0;
    for (var q = 0; q < nAtoms; q++) {
      var res = atomData[q * 5];
      if (res < r0 || res > r1) continue;
      sx += atomData[q * 5 + 2]; sy += atomData[q * 5 + 3]; sz += atomData[q * 5 + 4]; n++;
    }
    return n ? [sx / n / UNIT, sy / n / UNIT, sz / n / UNIT] : [0, 0, 0];
  }

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
  var view = { W: 0, H: 0, dpr: 1, dprMax: 1.5, scale0: 1, visW: 1, visH: 1, home: { x: 0, y: 0 }, zoomC: { x: 0, y: 0 }, spacing: 90 };
  var colA = [0.78, 0.84, 0.92], colB = [0.85, 0.76, 0.49], bg = [0.03, 0.04, 0.06];
  var elN, elO, elS;
  var isLight = false;
  var running = false, last = 0;
  var stations = 7, focusIndex = -1;
  var cam = homeCam();
  var tween = null;
  var perf = { n: 0, sum: 0 };

  function homeCam() {
    return { tx: 0, ty: 0, tz: 0, ax: AX_HOME, roll: ROLL_HOME, base: SPIN_HOME, phase: 0, rate: 0, zoom: view ? view.scale0 : 1, far: 1, near: 1, depth: 99, amt: 0, r0: 1, r1: 6 };
  }

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

  // ---- Math helpers ----
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, view.dprMax);
    var W = window.innerWidth, H = window.innerHeight;
    view.W = W; view.H = H; view.dpr = dpr;
    var cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    view.scale0 = Math.min(W, H) * (W < 640 ? 0.23 : 0.19);

    // Region of the screen the tree grows in (the hero text may own the top on phones)
    var top = api.reserve.top || 0, bottom = api.reserve.bottom || 0;
    view.home.x = W / 2;
    view.home.y = (top + H - bottom) / 2;
    view.spacing = Math.max(56, Math.min(120, (H - top - bottom - 60) / stations));

    // Zoomed views fill the part of the screen the content card leaves free
    if (sheetQuery.matches) {
      view.visW = W; view.visH = H * 0.4;
      view.zoomC.x = W / 2; view.zoomC.y = view.visH / 2 + 8;
    } else {
      view.visW = W - Math.min(736, W * 0.52); view.visH = H;
      view.zoomC.x = view.visW / 2; view.zoomC.y = H / 2;
    }

    if (!tween) {
      if (focusIndex < 0) { var h = homeCam(); h.r0 = cam.r0; h.r1 = cam.r1; cam = h; }
      else { var c = camFor(focusIndex); c.phase = cam.phase; cam = c; }
    }
    if (api.onlayout) api.onlayout();
    kick();
  }

  // Stations are evenly spaced on screen (view.spacing px apart), so undo the perspective
  // foreshortening along the axis: s = k·y·CAM / (CAM − y·sin a)  ⇒  y = s·CAM / (k·CAM + s·sin a)
  function stationY(i) {
    var s = ((stations - 1) / 2 - i) * view.spacing;
    var k = view.scale0 * Math.cos(AX_HOME) * Math.cos(ROLL_HOME);
    return s * CAM / (k * CAM + s * Math.sin(AX_HOME));
  }

  // Screen position of a point on the fibril axis in the resting pose (which never moves)
  api.project = function (i) {
    var cx = Math.cos(AX_HOME), sx = Math.sin(AX_HOME), cr = Math.cos(ROLL_HOME), sr = Math.sin(ROLL_HOME);
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

  // Camera for section i: a point to look at, an orientation, a zoom and how thick a slice to keep
  function camFor(i) {
    var v = VIEWS[i % VIEWS.length], seg = api.segment(i), yS = stationY(i);
    var T = [0, yS, 0];
    if (v.mode === 'res') {
      // that stretch of the sequence in the subunit sitting at this station
      var m = Math.round(yS * UNIT / RISE), c = Math.cos(m * SCREW), s = Math.sin(m * SCREW), q = centroid(seg[0], seg[1]);
      T = [q[0] * c + q[2] * s, q[1] + m * RISE / UNIT, -q[0] * s + q[2] * c];
    }
    return {
      tx: T[0], ty: T[1], tz: T[2], ax: v.ax, roll: v.roll, base: v.spin, phase: 0, rate: v.rate / 1000,
      zoom: Math.min(view.visW, view.visH) / v.wu, far: v.far, near: v.near, depth: v.depth || 99,
      amt: 1, r0: seg[0], r1: seg[1]
    };
  }

  api.focus = function (i) {
    focusIndex = i;
    var b;
    if (i < 0) { b = homeCam(); b.r0 = cam.r0; b.r1 = cam.r1; }
    else { b = camFor(i); if (cam.amt < 0.02) { cam.r0 = b.r0; cam.r1 = b.r1; } }
    // a view that holds still lands on its exact pose; a turntable carries on from where it is
    b.phase = b.rate === 0 ? Math.round(cam.phase / TAU) * TAU : cam.phase;
    var from = {};
    for (var key in cam) from[key] = cam[key];
    if (reduceMotion.matches) { cam = b; tween = null; b.rate = 0; render(); return; }
    tween = { a: from, b: b, t0: performance.now(), dur: i < 0 ? 1050 : (cam.amt > 0.6 ? 1000 : 1600) };
    kick();
  };

  function stepTween(now) {
    var p = Math.min(1, (now - tween.t0) / tween.dur), e = ease(p), a = tween.a, b = tween.b;
    var pos = ease(Math.min(1, p / 0.9));
    cam.amt = lerp(a.amt, b.amt, e);
    cam.tx = lerp(a.tx, b.tx, pos); cam.ty = lerp(a.ty, b.ty, pos); cam.tz = lerp(a.tz, b.tz, pos);
    cam.ax = lerp(a.ax, b.ax, e); cam.roll = lerp(a.roll, b.roll, e);
    cam.base = lerp(a.base, b.base, e); cam.phase = lerp(a.phase, b.phase, e);
    cam.zoom = Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), e));
    cam.far = lerp(a.far, b.far, e); cam.near = lerp(a.near, b.near, e);
    cam.depth = Math.exp(lerp(Math.log(a.depth), Math.log(b.depth), e));
    cam.r0 = lerp(a.r0, b.r0, e); cam.r1 = lerp(a.r1, b.r1, e);
    cam.rate = lerp(a.rate, b.rate, e);
    if (p >= 1) { cam = b; tween = null; }
  }

  // ---- Draw ----
  function setCommon(P, C) {
    var u = P.u;
    gl.uniform3f(u.uT, cam.tx, cam.ty, cam.tz);
    gl.uniform2f(u.uSpin, C.cy, C.sy);
    gl.uniform2f(u.uTilt, C.cx, C.sx);
    gl.uniform2f(u.uRoll, C.cr, C.sr);
    gl.uniform1f(u.uCam, CAM);
    gl.uniform1f(u.uScale, cam.zoom);
    gl.uniform1f(u.uDpr, view.dpr);
    gl.uniform2f(u.uView, view.W, view.H);
    gl.uniform2f(u.uCenter, C.px, C.py);
  }

  // 1 inside the slice around the focus, fading out over about one subunit; d > 0 is toward the viewer
  function slab(d) {
    return d < 0 ? 1 - smooth(cam.far, cam.far + 0.07, -d) : 1 - smooth(cam.near, cam.near + 0.05, d);
  }

  function render() {
    var spin = cam.base + cam.phase;
    var C = {
      cy: Math.cos(spin), sy: Math.sin(spin),
      cx: Math.cos(cam.ax), sx: Math.sin(cam.ax),
      cr: Math.cos(cam.roll), sr: Math.sin(cam.roll),
      px: lerp(view.home.x, view.zoomC.x, cam.amt), py: lerp(view.home.y, view.zoomC.y, cam.amt)
    };
    var atomMix = smooth(0.3, 0.85, cam.amt);
    var light = isLight ? 1 : 0;
    var toward = Math.sin(cam.ax) < 0 ? -1 : 1;   // which end of the axis is nearer the viewer

    // which subunits to draw, and how strongly
    var nFar = 0, nAtom = 0, k, d, s, f;
    for (k = 0; k < SUBUNITS; k++) {
      d = (subY[k] - cam.ty) * toward;
      s = atomMix > 0.004 ? slab(d) : 0;
      f = subEdge[k] * (1 - atomMix * (s + 0.75 * (1 - s)));   // outside the slice the backbone stays as a faint ghost
      if (f > 0.004) {
        instFar[nFar * 5] = subC[k]; instFar[nFar * 5 + 1] = subS[k]; instFar[nFar * 5 + 2] = subY[k]; instFar[nFar * 5 + 3] = f; instFar[nFar * 5 + 4] = k % 2;
        nFar++;
      }
      f = subEdge[k] * atomMix * s;
      if (f > 0.01) {
        instAtom[nAtom * 5] = subC[k]; instAtom[nAtom * 5 + 1] = subS[k]; instAtom[nAtom * 5 + 2] = subY[k]; instAtom[nAtom * 5 + 3] = f; instAtom[nAtom * 5 + 4] = k % 2;
        nAtom++;
      }
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    if (isLight) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.ONE, gl.ONE);

    // dust
    if (cam.amt < 0.98) {
      gl.useProgram(dotP.p);
      setCommon(dotP, C);
      gl.uniform2f(dotP.u.uSpin, 1, 0);
      gl.vertexAttrib4f(dotP.aInst, 1, 0, 0, 1);
      gl.vertexAttrib1f(dotP.aPf, 0);
      gl.uniform1f(dotP.u.uLight, light);
      gl.uniform1f(dotP.u.uDust, 1);
      gl.uniform1f(dotP.u.uDustSize, 1.6 * view.dpr);
      gl.uniform1f(dotP.u.uAlpha, (isLight ? 0.18 : 0.14) * (1 - cam.amt));
      gl.uniform3fv(dotP.u.uColA, colA);
      gl.uniform3fv(dotP.u.uColB, colB);
      gl.bindVertexArray(dustVao);
      gl.drawArrays(gl.POINTS, 0, DUST);
    }

    if (nFar) {
      gl.bindBuffer(gl.ARRAY_BUFFER, instFarBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, instFar.subarray(0, nFar * 5));

      // backbones
      gl.useProgram(lineP.p);
      setCommon(lineP, C);
      gl.uniform1f(lineP.u.uLight, light);
      gl.uniform1f(lineP.u.uAlpha, 1);
      gl.uniform3fv(lineP.u.uColA, colA);
      gl.uniform3fv(lineP.u.uColB, colB);
      gl.bindVertexArray(caLineVao);
      gl.drawArraysInstanced(gl.LINE_STRIP, 0, RES, nFar);

      // residues
      gl.useProgram(dotP.p);
      gl.uniform2f(dotP.u.uSpin, C.cy, C.sy);
      gl.uniform1f(dotP.u.uDust, 0);
      gl.uniform1f(dotP.u.uSize, view.W < 640 ? 0.85 : 1);
      gl.uniform1f(dotP.u.uAlpha, 1);
      gl.bindVertexArray(caDotVao);
      gl.drawArraysInstanced(gl.POINTS, 0, RES, nFar);
    }

    // atoms and bonds, only the slice around the focus
    if (nAtom) {
      gl.bindBuffer(gl.ARRAY_BUFFER, instAtomBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, instAtom.subarray(0, nAtom * 5));
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      var progs = [bondP, atomP];
      for (var pi = 0; pi < 2; pi++) {
        var P = progs[pi], u = P.u;
        gl.useProgram(P.p);
        setCommon(P, C);
        gl.uniform1f(u.uMix, atomMix);
        gl.uniform1f(u.uLight, light);
        gl.uniform1f(u.uDepth, cam.depth);
        gl.uniform2f(u.uHi, cam.r0, cam.r1);
        gl.uniform3fv(u.uColA, colA);
        gl.uniform3fv(u.uColB, colB);
        gl.uniform3fv(u.uBg, bg);
        gl.uniform3fv(u.uN, elN);
        gl.uniform3fv(u.uO, elO);
        gl.uniform3fv(u.uS, elS);
        if (pi === 0) {
          gl.bindVertexArray(bondVao);
          gl.drawArraysInstanced(gl.LINES, 0, bondCount, nAtom);
        } else {
          gl.uniform1f(u.uBallPx, clamp(0.22 * cam.zoom / UNIT, 2.2, 5));
          gl.bindVertexArray(atomVao);
          gl.drawArraysInstanced(gl.POINTS, 0, nAtoms, nAtom);
        }
      }
    }
    gl.bindVertexArray(null);
  }

  // The loop only runs while something is moving: a fly between views or a turntable
  function moving() { return !!tween || cam.rate !== 0; }

  function tick(now) {
    if (!running) return;
    var dt = Math.min(now - last, 50);
    last = now;
    if (tween) stepTween(now); else cam.phase += dt * cam.rate;
    render();
    watchFrameTime(dt);
    if (moving()) requestAnimationFrame(tick); else running = false;
  }

  // If frames are being dropped, render at a lower resolution rather than stutter
  function watchFrameTime(dt) {
    perf.sum += dt; perf.n++;
    if (perf.n < 40) return;
    var avg = perf.sum / perf.n;
    perf.n = 0; perf.sum = 0;
    if (avg > 21 && view.dprMax > 1) {
      view.dprMax = Math.max(1, view.dprMax - 0.25);
      var dpr = Math.min(window.devicePixelRatio || 1, view.dprMax);
      view.dpr = dpr;
      canvas.width = Math.round(view.W * dpr);
      canvas.height = Math.round(view.H * dpr);
    }
  }

  // Draw once, then keep going if something is in motion
  function kick() {
    if (running) return;
    if (reduceMotion.matches || document.hidden) { render(); return; }
    if (!moving()) { render(); return; }
    running = true;
    last = performance.now();
    perf.n = 0; perf.sum = 0;
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) running = false; else kick();
  });

  function onPrefChange() {
    readColors();
    if (reduceMotion.matches) { running = false; if (tween) { cam = tween.b; tween = null; } cam.rate = 0; }
    render(); kick();
  }
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener('change', onPrefChange);
    lightQuery.addEventListener('change', function () { readColors(); render(); });
    sheetQuery.addEventListener('change', resize);
  }

  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); running = false; });
  canvas.addEventListener('webglcontextrestored', function () { location.reload(); });

  api.ready = true;
  document.documentElement.classList.add('gl');
  readColors();
  resize();
})();
