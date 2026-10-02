/* ==========================================================================
   Background and section views, in WebGL2, all from the cryo-EM structure of the
   Aβ42 fibril, PDB 5OQV (two protofilaments of LS-shaped subunits).

   At rest the fibril turns slowly behind the name as its Cα backbone, one
   protofilament gold and the other blue, fading out toward its ends. Opening a
   section flies the camera to that section's own view of the real structure:
   a cartoon (strands as arrows, coils as tubes) with the section's stretch of
   the sequence drawn as ball-and-stick with every hydrogen and the backbone
   hydrogen bonds between stacked subunits dashed. The About view is the
   cross-section, one subunit from each protofilament as sticks.

   The loop only runs while something moves. Without WebGL2 nothing here runs
   and the page falls back to a plain nav.
   ========================================================================== */
(function () {
  'use strict';

  var api = window.Fibril = { ready: false };

  var canvas = document.getElementById('fibril');
  var atomData = window.ABETA_ATOMS, strandData = window.ABETA_STRANDS || [];
  if (!canvas || !atomData) return;
  var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, powerPreference: 'high-performance' });
  if (!gl) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var lightQuery = window.matchMedia('(prefers-color-scheme: light)');
  var sheetQuery = window.matchMedia('(max-width: 860px)');

  // ---- Geometry: Aβ42 fibril, PDB 5OQV (Gremer et al., Science 2017) ----
  // One subunit (all atoms, abeta-atoms.js) sits in a frame whose y axis is the fibril axis.
  // Neighbouring subunits alternate between the two protofilaments and are related by a
  // pseudo-2₁ screw fitted to the deposited model (per layer: -1.44° twist, 4.68 Å rise;
  // regenerated chains match to <0.05 Å).
  var SCREW = 3.129003;          // rotation per subunit (rad)
  var RISE = 2.3386;             // rise per subunit (Å)
  var UNIT = 34.5;               // Å per model unit (outer radius → 1)
  var SUBUNITS = 124;            // stacked along the axis
  var K0 = SUBUNITS / 2;         // the pair on show in the cross-section: K0 and K0 + 1
  var TAU = Math.PI * 2;
  var STRIDE = 6;                // numbers per atom in abeta-atoms.js
  var RAD = [0.36, 0.34, 0.32, 0.5, 0.2];   // ball radii in Å: C N O S H
  var STICK_R = 0.14;            // bond radius, Å

  // ---- Camera ----
  var CAM = 6.5;                 // perspective distance, model units
  var PAIR_Y = RISE / UNIT / 2;  // axial middle of the pair

  // At rest: the whole fibril, tilted toward the viewer and laid diagonally, turning slowly.
  var HOME = { ax: 0.6, roll: 0.62, spin: 0.6, rate: 0.000015 };

  // One view per section: where the camera looks and what it keeps.
  //   sub    which subunit of the pair to centre on (on the section's own residues); 'axis' = the fibril axis
  //   ax     0 = side-on … π/2 = straight down the axis (top view)
  //   wu     model units of fibril that fit across the free half of the screen
  //   far / near   how far (units) the cartoon is kept behind / in front of the focus along the axis
  //   sk     how far (units) the ball-and-stick detail reaches along the axis
  //   clip   ribbons nearer the viewer than this (model units) are cut away so the sticks show
  //   both   1 = keep both protofilaments' cartoon, otherwise only the focus subunit's
  //   depth  optional cut either side of the focus in view depth (side views)
  //   rate   turntable speed, rad/s (about half a degree a second); 0 = holds still
  //   xs     1 = the cross-section (every heavy atom as sticks, no cartoon)
  var VIEWS = [
    { sub: 'axis', ax: 1.5,  roll: -0.35, spin: 0.2, rate: 0.006, wu: 2.3, far: 0.04, near: 0.04, sk: 0.04, xs: 1 },                  // About: the cross-section
    { sub: 0,      ax: 0.2,  roll: 0.0,   spin: 0.5, rate: 0.012, wu: 1.5, far: 0.4,  near: 0.4,  sk: 0.1,  clip: 0.45, both: 1 },             // Research: side, turntable
    { sub: 1,      ax: 0.95, roll: -0.5,  spin: 1.0, rate: 0.008, wu: 0.8, far: 0.14, near: 0.04, sk: 0.1 },                          // Publications: into the core
    { sub: 0,      ax: 0.55, roll: 0.25,  spin: 2.2, rate: 0,     wu: 1.1, far: 0.3,  near: 0.3,  sk: 0.1,  depth: 0.6 },             // Experience: oblique, still
    { sub: 1,      ax: 1.4,  roll: -0.9,  spin: 0.0, rate: 0,     wu: 1.0, far: 0.16, near: 0.04, sk: 0.1 },                          // Honors: top, zoomed, still
    { sub: 0,      ax: 0.15, roll: 0.0,   spin: 3.4, rate: 0.01,  wu: 1.0, far: 0.4,  near: 0.4,  sk: 0.1,  depth: 0.45 },            // Skills: side, close
    { sub: 1,      ax: 1.0,  roll: 0.6,   spin: 4.4, rate: -0.008, wu: 0.8, far: 0.14, near: 0.04, sk: 0.1 }                           // Contact: into the core
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
    'vec3 rot(vec3 q) {   // spin about the fibril axis, tilt toward the viewer, roll in the screen plane',
    '  float x1 = q.x * uSpin.x + q.z * uSpin.y;',
    '  float z1 = -q.x * uSpin.y + q.z * uSpin.x;',
    '  float y2 = q.y * uTilt.x - z1 * uTilt.y;',
    '  float z2 = q.y * uTilt.y + z1 * uTilt.x;',
    '  return vec3(x1 * uRoll.x - y2 * uRoll.y, x1 * uRoll.y + y2 * uRoll.x, z2);',
    '}',
    'vec3 sub(vec3 m) { return vec3(m.x * aInst.x + m.z * aInst.y, m.y + aInst.z, -m.x * aInst.y + m.z * aInst.x); }',
    'vec3 viewPos(vec3 m) { return rot(sub(m) - uT); }   // x right, y up, z toward the viewer',
    'vec3 viewDir(vec3 n) { return rot(vec3(n.x * aInst.x + n.z * aInst.y, n.y, -n.x * aInst.y + n.z * aInst.x)); }',
    'vec2 toPx(vec3 v, out float p) { p = uCam / max(uCam - v.z, 0.3); return vec2(uCenter.x + v.x * uScale * p, uCenter.y - v.y * uScale * p); }',
    'vec4 clipPos(vec2 px, float z2) { return vec4(px.x / uView.x * 2.0 - 1.0, 1.0 - px.y / uView.y * 2.0, -z2 / 8.0, 1.0); }'
  ].join('\n');

  // --- far view: the Cα backbone as lines and dots ---
  var LINE_VS = COMMON + '\n' + [
    'in vec3 aPos; uniform float uAlpha; uniform float uLight; uniform vec3 uPfA; uniform vec3 uPfB;',
    'out float vA; out vec3 vC;',
    'void main() {',
    '  vec3 v = viewPos(aPos); float p; gl_Position = clipPos(toPx(v, p), v.z);',
    '  float dep = clamp((v.z + 1.6) / 3.2, 0.0, 1.0);',
    '  vA = (0.1 + dep * 0.3) * uAlpha * aInst.w * mix(1.0, 1.25, uLight);',
    '  vC = aPf > 0.5 ? uPfB : uPfA;',
    '}'
  ].join('\n');
  var LINE_FS = [
    '#version 300 es', 'precision mediump float;',
    'in float vA; in vec3 vC; out vec4 o;',
    'void main() { o = vec4(vC * vA, vA); }'
  ].join('\n');
  var DOT_VS = COMMON + '\n' + [
    'in vec3 aPos; uniform float uAlpha; uniform float uLight; uniform float uSize; uniform vec3 uPfA; uniform vec3 uPfB;',
    'out float vA; out vec3 vC;',
    'void main() {',
    '  vec3 v = viewPos(aPos); float p; gl_Position = clipPos(toPx(v, p), v.z);',
    '  float dep = clamp((v.z + 1.6) / 3.2, 0.0, 1.0);',
    '  gl_PointSize = (0.8 + dep * 1.8) * uSize * uDpr * 1.4;',
    '  vA = (0.2 + dep * 0.7) * uAlpha * aInst.w * mix(1.0, 0.9, uLight);',
    '  vC = aPf > 0.5 ? uPfB : uPfA;',
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

  // --- section views ---
  // Shared by the cartoon, balls and sticks: a slice kept around the focus, residue
  // highlighting for the section's stretch, and element colours.
  var DETAIL = [
    'uniform float uMix; uniform float uLight; uniform float uDepth; uniform vec2 uHi;',
    'uniform vec3 uPfA; uniform vec3 uPfB; uniform vec3 uBg; uniform vec3 uN; uniform vec3 uO; uniform vec3 uS; uniform vec3 uH;',
    'float hiOf(float res) { return smoothstep(uHi.x - 1.0, uHi.x - 0.25, res) * (1.0 - smoothstep(uHi.y + 0.25, uHi.y + 1.0, res)); }',
    'float cut(float z2) { return 1.0 - smoothstep(uDepth * 0.7, uDepth, abs(z2)); }',
    'vec3 element(float kind) { return kind < 0.5 ? vec3(-1.0) : (kind < 1.5 ? uN : (kind < 2.5 ? uO : (kind < 3.5 ? uS : uH))); }',
    'const vec3 LIGHT = vec3(-0.42, 0.58, 0.69);',
    // Fades are done by ordered dithering (opaque fragments, some discarded) so faded parts never
    // write depth for fragments you can see through, and cut edges don't show open ends.
    'float bayer(vec2 p) {',
    '  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));',
    '  const float M[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);',
    '  return (M[x + y * 4] + 0.5) / 16.0;',
    '}',
    // diffuse + a broad, soft highlight + a faint rim, on a colour
    'vec3 lit(vec3 col, vec3 n, float spec) {',
    '  float d = max(dot(n, LIGHT), 0.0);',
    '  float s = pow(max(dot(n, normalize(LIGHT + vec3(0.0, 0.0, 1.0))), 0.0), 36.0) * spec;',
    '  float rim = pow(1.0 - max(n.z, 0.0), 3.0) * 0.18;',
    '  return col * (0.36 + 0.8 * d + rim) + vec3(s);',
    '}'
  ].join('\n');

  // Cartoon. Where the section's own residues are, the ribbon gives way to the sticks (as when a
  // selection is shown as ball-and-stick), ribbons in front of that are clipped, and anything
  // clipped shows its inside as a flat colour so cut edges look solid, not like open tubes.
  var RIB_VS = COMMON + '\n' + DETAIL + '\n' + [
    'in vec3 aPos; in vec3 aNrm; in float aRes; uniform float uSk;',
    'out vec3 vN; out vec3 vCol; out float vA; out float vZ; out float vHn; out float vNear;',
    'void main() {',
    '  vec3 v = viewPos(aPos); float p; gl_Position = clipPos(toPx(v, p), v.z);',
    '  vN = viewDir(aNrm);',
    '  vec3 base = aPf > 0.5 ? uPfB : uPfA;',
    '  float hi = hiOf(aRes);',
    '  vec3 col = mix(base, mix(mix(base, uBg, 0.4), base * 1.1 + 0.04, hi), uMix);   // the rest recedes',
    '  float dep = clamp((v.z + 1.8) / 3.6, 0.0, 1.0);',
    '  vCol = mix(uBg, col, 0.6 + 0.4 * dep);',
    '  vNear = (1.0 - smoothstep(uSk, uSk + 0.01, abs(aInst.z - uT.y))) * uMix;',
    '  vHn = hi * vNear;',
    '  vA = aInst.w; vZ = v.z;',
    '}'
  ].join('\n');
  var RIB_FS = [
    '#version 300 es', 'precision highp float;',
    DETAIL,
    'uniform float uClip;',
    'in vec3 vN; in vec3 vCol; in float vA; in float vZ; in float vHn; in float vNear; out vec4 o;',
    'void main() {',
    '  if (vA < bayer(gl_FragCoord.xy)) discard;',
    '  if (vHn > 0.5) discard;                              // shown as sticks instead',
    '  if (abs(vZ) > uDepth) discard;                       // side views: cut away beyond the slice',
    '  if (uMix > 0.5 && vZ > uClip) discard;               // clear the line of sight to the sticks',
    '  if (!gl_FrontFacing) { o = vec4(vCol * 0.55, 1.0); return; }   // inside of a cut tube: flat cap',
    '  o = vec4(lit(vCol, normalize(vN), 0.25), 1.0);',
    '}'
  ].join('\n');

  var SPH_VS = COMMON + '\n' + DETAIL + '\n' + [
    'in vec3 aPos; in vec2 aMeta;   // residue number, element',
    'uniform vec2 uRange; uniform float uAll; uniform float uHideH; uniform float uBallScale;',
    'const float RADS[5] = float[5](' + RAD.map(function (r) { return r.toFixed(2); }).join(', ') + ');',
    'out vec3 vCol; out float vA; out float vZ; out float vRu;',
    'void main() {',
    '  float res = aMeta.x, kind = aMeta.y;',
    '  bool show = (uAll > 0.5 || (res >= uRange.x - 0.5 && res <= uRange.y + 0.5)) && !(kind > 3.5 && uHideH > 0.5) && aInst.w > 0.01;',
    '  vec3 v = viewPos(aPos); float p; gl_Position = clipPos(toPx(v, p), v.z);',
    '  if (!show) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); vA = 0.0; vZ = 0.0; vRu = 0.0; return; }',
    '  vRu = RADS[int(kind)] * uBallScale / ' + UNIT.toFixed(1) + ';',
    '  gl_PointSize = 2.0 * vRu * uScale * p * uDpr;',
    '  vec3 el = element(kind);',
    '  vec3 col = el.x < 0.0 ? (aPf > 0.5 ? uPfB : uPfA) : el;',
    '  float dep = clamp((v.z + 1.8) / 3.6, 0.0, 1.0);',
    '  vCol = mix(uBg, col, 0.6 + 0.4 * dep);',
    '  vZ = v.z; vA = aInst.w * cut(v.z);',
    '}'
  ].join('\n');
  var SPH_FS = [
    '#version 300 es', 'precision highp float;',
    DETAIL,
    'in vec3 vCol; in float vA; in float vZ; in float vRu; out vec4 o;',
    'void main() {',
    '  vec2 c = gl_PointCoord * 2.0 - 1.0; float d2 = dot(c, c); if (d2 > 1.0) discard;',
    '  float nz = sqrt(1.0 - d2);',
    '  vec3 col = lit(vCol, vec3(c.x, -c.y, nz), 0.5);',
    '  if (vA < bayer(gl_FragCoord.xy)) discard;',
    '  float a = 1.0 - smoothstep(0.88, 1.0, sqrt(d2));',
    '  o = vec4(col * a, a);',
    '  gl_FragDepth = (-(vZ + nz * vRu) / 8.0) * 0.5 + 0.5;',
    '}'
  ].join('\n');

  // Bonds as cylinder impostors: a quad along each bond, shaded across its width. The
  // same quads, thinner and dashed, draw the hydrogen bonds.
  var STK_VS = COMMON + '\n' + DETAIL + '\n' + [
    'in vec3 aA; in vec3 aB; in vec4 aC;   // ends; (end 0/1, side -1/1, element A, element B)',
    'in vec3 aD;                           // residue A, residue B, type (0 covalent, 1 hydrogen bond)',
    'uniform vec2 uRange; uniform float uAll; uniform float uHideH;',
    'out vec2 vSide; out vec3 vColA; out vec3 vColB; out vec2 vTL; out float vZ; out float vRu; out float vA; out vec2 vDir; out float vType;',
    'vec3 colour(float kind, float dep) {',
    '  vec3 el = element(kind);',
    '  vec3 col = el.x < 0.0 ? (aPf > 0.5 ? uPfB : uPfA) : el;',
    '  return mix(uBg, col, 0.6 + 0.4 * dep);',
    '}',
    'void main() {',
    '  bool inA = aD.x >= uRange.x - 0.5 && aD.x <= uRange.y + 0.5, inB = aD.y >= uRange.x - 0.5 && aD.y <= uRange.y + 0.5;',
    '  bool hide = uHideH > 0.5 && (aC.z > 3.5 || aC.w > 3.5);',
    '  bool show = (uAll > 0.5 || (aD.z < 0.5 ? (inA && inB) : (inA || inB))) && !hide && aInst.w > 0.01;',
    '  vec3 va = viewPos(aA), vb = viewPos(aB); float pa, pb;',
    '  vec2 sa = toPx(va, pa), sb = toPx(vb, pb);',
    '  if (!show) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vSide = vec2(0.0); vColA = vColB = vec3(0.0); vTL = vec2(0.0); vZ = 0.0; vRu = 0.0; vA = 0.0; vDir = vec2(1.0, 0.0); vType = 0.0; return; }',
    '  float len = length(sb - sa);',
    '  vec2 dir = len > 0.001 ? (sb - sa) / len : vec2(1.0, 0.0);',
    '  vec2 perp = vec2(-dir.y, dir.x);',
    '  float scale = mix(pa, pb, aC.x) * uScale;',
    '  float ru = (aD.z < 0.5 ? ' + STICK_R.toFixed(3) + ' : 0.07) / ' + UNIT.toFixed(1) + ';',
    '  vec2 px = mix(sa, sb, aC.x) + perp * aC.y * ru * scale;',
    '  float z2 = mix(va.z, vb.z, aC.x);',
    '  gl_Position = clipPos(px, z2);',
    '  float dep = clamp((z2 + 1.8) / 3.6, 0.0, 1.0);',
    '  vSide = vec2(aC.y, aC.x); vTL = vec2(aC.x, len);',
    '  vColA = aD.z < 0.5 ? colour(aC.z, dep) : mix(uBg, vec3(0.25, 0.7, 0.95), 0.6 + 0.4 * dep);',
    '  vColB = aD.z < 0.5 ? colour(aC.w, dep) : vColA;',
    '  vZ = z2; vRu = ru; vA = aInst.w * cut(z2); vDir = vec2(perp.x, -perp.y); vType = aD.z;',
    '}'
  ].join('\n');
  var STK_FS = [
    '#version 300 es', 'precision highp float;',
    DETAIL,
    'in vec2 vSide; in vec3 vColA; in vec3 vColB; in vec2 vTL; in float vZ; in float vRu; in float vA; in vec2 vDir; in float vType; out vec4 o;',
    'void main() {',
    '  if (vType > 0.5 && fract(vTL.x * vTL.y / 7.0) > 0.55) discard;   // dashes, 7 px period',
    '  float nx = vSide.x, nz = sqrt(max(0.0, 1.0 - nx * nx));',
    '  vec3 n = normalize(vec3(vDir * nx, nz));',
    '  vec3 base = mix(vColA, vColB, smoothstep(0.46, 0.54, vTL.x));',
    '  if (vA < bayer(gl_FragCoord.xy)) discard;',
    '  vec3 col = lit(base, n, 0.4);',
    '  o = vec4(col, 1.0);',
    '  gl_FragDepth = (-(vZ + nz * vRu) / 8.0) * 0.5 + 0.5;',
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
    uniforms.concat(['uT', 'uSpin', 'uTilt', 'uRoll', 'uCam', 'uScale', 'uDpr', 'uView', 'uCenter'])
      .forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
    return { p: p, u: u, aInst: gl.getAttribLocation(p, 'aInst'), aPf: gl.getAttribLocation(p, 'aPf') };
  }

  var lineP, dotP, ribP, sphP, stkP;
  try {
    var dU = ['uMix', 'uLight', 'uDepth', 'uHi', 'uPfA', 'uPfB', 'uBg', 'uN', 'uO', 'uS', 'uH'];
    lineP = program(LINE_VS, LINE_FS, ['uAlpha', 'uLight', 'uPfA', 'uPfB']);
    dotP = program(DOT_VS, DOT_FS, ['uAlpha', 'uLight', 'uSize', 'uPfA', 'uPfB']);
    ribP = program(RIB_VS, RIB_FS, dU.concat(['uSk', 'uClip']));
    sphP = program(SPH_VS, SPH_FS, dU.concat(['uRange', 'uAll', 'uHideH', 'uBallScale']));
    stkP = program(STK_VS, STK_FS, dU.concat(['uRange', 'uAll', 'uHideH']));
  } catch (err) {
    if (window.console) console.warn('Fibril: WebGL setup failed', err);
    return;
  }

  // ---- Structure data (from abeta-atoms.js) ----
  var nAtoms = atomData.length / STRIDE;
  function A(i, f) { return atomData[i * STRIDE + f]; }   // f: 0 residue, 1 element, 2-4 xyz, 5 role
  var nRes = 0, ca = [], oxy = [], cc = [];
  for (var q = 0; q < nAtoms; q++) {
    var r = A(q, 0), role = A(q, 5), pos = [A(q, 2), A(q, 3), A(q, 4)];
    nRes = Math.max(nRes, r);
    if (role === 3) ca[r] = pos; else if (role === 2) oxy[r] = pos; else if (role === 4) cc[r] = pos;
  }
  function isStrand(res) {
    for (var s = 0; s < strandData.length; s++) if (res >= strandData[s][0] && res <= strandData[s][1]) return true;
    return false;
  }
  function isStrandEnd(res) {
    for (var s = 0; s < strandData.length; s++) if (res === strandData[s][1]) return true;
    return false;
  }

  // ---- Buffers ----
  function buffer(data, usage, target) {
    var b = gl.createBuffer();
    gl.bindBuffer(target || gl.ARRAY_BUFFER, b);
    gl.bufferData(target || gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
    return b;
  }
  // Per-subunit instance data: cos, sin, rise, fade, protofilament. One buffer per pass.
  function instBuffer() { var a = new Float32Array(SUBUNITS * 5); return { arr: a, buf: buffer(a, gl.DYNAMIC_DRAW), n: 0 }; }
  var instSkel = instBuffer(), instRib = instBuffer(), instDet = instBuffer();

  function vao(prog, buf, attrs, stride, inst, index) {
    var v = gl.createVertexArray();
    gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    attrs.forEach(function (a) {
      var loc = gl.getAttribLocation(prog.p, a.name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a.size, gl.FLOAT, false, stride * 4, a.offset * 4);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, inst.buf);
    gl.enableVertexAttribArray(prog.aInst);
    gl.vertexAttribPointer(prog.aInst, 4, gl.FLOAT, false, 20, 0);
    gl.vertexAttribDivisor(prog.aInst, 1);
    gl.enableVertexAttribArray(prog.aPf);
    gl.vertexAttribPointer(prog.aPf, 1, gl.FLOAT, false, 20, 16);
    gl.vertexAttribDivisor(prog.aPf, 1);
    if (index) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bindVertexArray(null);
    return v;
  }

  // Cα backbone
  var caArr = new Float32Array(nRes * 3);
  for (var rr = 1; rr <= nRes; rr++) {
    caArr[(rr - 1) * 3] = ca[rr][0] / UNIT; caArr[(rr - 1) * 3 + 1] = ca[rr][1] / UNIT; caArr[(rr - 1) * 3 + 2] = ca[rr][2] / UNIT;
  }
  var caBuf = buffer(caArr);
  var caLineVao = vao(lineP, caBuf, [{ name: 'aPos', size: 3, offset: 0 }], 3, instSkel);
  var caDotVao = vao(dotP, caBuf, [{ name: 'aPos', size: 3, offset: 0 }], 3, instSkel);

  // Cartoon: a smooth path through the Cα atoms, a flat ribbon with an arrowhead along
  // strands and a round tube along coils, oriented by the peptide planes (the C=O vectors).
  var ribVerts = [], ribIdx = [];
  (function buildCartoon() {
    var SUB = 7, M = 14, n = nRes;
    function P(i) { return ca[Math.max(1, Math.min(n, i))]; }
    function spline(i, t) {   // Catmull-Rom between residues i and i+1
      var p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), out = [0, 0, 0], d = [0, 0, 0];
      for (var k = 0; k < 3; k++) {
        out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
        d[k] = 0.5 * ((-p0[k] + p2[k]) + (4 * p0[k] - 10 * p1[k] + 8 * p2[k] - 2 * p3[k]) * t + (-3 * p0[k] + 9 * p1[k] - 9 * p2[k] + 3 * p3[k]) * t * t);
      }
      return { p: out, t: d };
    }
    function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

    // peptide-plane side vector at each residue, kept facing the same way along the chain
    var side = [], prev = null;
    for (var i = 1; i <= n; i++) {
      var g = [oxy[i][0] - cc[i][0], oxy[i][1] - cc[i][1], oxy[i][2] - cc[i][2]];
      if (prev && dot(g, prev) < 0) g = [-g[0], -g[1], -g[2]];
      side[i] = norm(g); prev = side[i];
    }
    // ribbon half-width / half-thickness (Å) for a residue
    function shape(res) { return isStrand(res) ? [0.72, 0.13] : [0.24, 0.24]; }

    var rings = (n - 1) * SUB + 1;
    for (var s = 0; s < rings; s++) {
      var f = s / SUB, fl = Math.min(n - 2, Math.floor(f)), i0 = fl + 1, u = f - fl;   // between residues i0 and i0 + 1
      var sp = spline(i0, u), T = norm(sp.t);
      var S0 = side[i0], S1 = side[i0 + 1];
      var Sv = norm([S0[0] * (1 - u) + S1[0] * u, S0[1] * (1 - u) + S1[1] * u, S0[2] * (1 - u) + S1[2] * u]);
      var Bv = norm(cross(T, Sv)), Sx = norm(cross(Bv, T));
      var a0 = shape(i0), a1 = shape(i0 + 1), ue = u * u * (3 - 2 * u);
      var hw = a0[0] + (a1[0] - a0[0]) * ue, ht = a0[1] + (a1[1] - a0[1]) * ue;
      if (isStrandEnd(i0)) { hw = 1.2 + (0.04 - 1.2) * u; ht = 0.13 + (0.06 - 0.13) * u; }   // arrowhead
      var resf = i0 + u;   // residue number along the ribbon, for highlighting
      for (var j = 0; j < M; j++) {
        var ph = j / M * TAU, cp = Math.cos(ph), sn = Math.sin(ph);
        var px = sp.p[0] + Sx[0] * hw * cp + Bv[0] * ht * sn, py = sp.p[1] + Sx[1] * hw * cp + Bv[1] * ht * sn, pz = sp.p[2] + Sx[2] * hw * cp + Bv[2] * ht * sn;
        var nv = norm([Sx[0] * cp / hw + Bv[0] * sn / ht, Sx[1] * cp / hw + Bv[1] * sn / ht, Sx[2] * cp / hw + Bv[2] * sn / ht]);
        ribVerts.push(px / UNIT, py / UNIT, pz / UNIT, nv[0], nv[1], nv[2], resf);
      }
    }
    for (var s2 = 0; s2 < rings - 1; s2++) {
      for (var j2 = 0; j2 < M; j2++) {
        var a = s2 * M + j2, b = s2 * M + (j2 + 1) % M, c = (s2 + 1) * M + j2, d2 = (s2 + 1) * M + (j2 + 1) % M;
        ribIdx.push(a, b, c, b, d2, c);
      }
    }
  })();
  var ribCount = ribIdx.length;
  var ribBuf = buffer(new Float32Array(ribVerts));
  var ribIndexBuf = buffer(new Uint32Array(ribIdx), gl.STATIC_DRAW, gl.ELEMENT_ARRAY_BUFFER);
  var ribVao = vao(ribP, ribBuf, [{ name: 'aPos', size: 3, offset: 0 }, { name: 'aNrm', size: 3, offset: 3 }, { name: 'aRes', size: 1, offset: 6 }], 7, instRib, ribIndexBuf);

  // Balls: every atom, drawn as sprites
  var sphArr = new Float32Array(nAtoms * 5);
  for (var a1 = 0; a1 < nAtoms; a1++) {
    sphArr[a1 * 5] = A(a1, 2) / UNIT; sphArr[a1 * 5 + 1] = A(a1, 3) / UNIT; sphArr[a1 * 5 + 2] = A(a1, 4) / UNIT;
    sphArr[a1 * 5 + 3] = A(a1, 0); sphArr[a1 * 5 + 4] = A(a1, 1);
  }
  var sphVao = vao(sphP, buffer(sphArr), [{ name: 'aPos', size: 3, offset: 0 }, { name: 'aMeta', size: 2, offset: 3 }], 5, instDet);

  // Sticks: covalent bonds, plus the backbone N–H···O=C hydrogen bonds to the subunit two
  // layers up (the same protofilament, 4.7 Å away), found in that subunit's frame.
  var bonds = [];   // [ax, ay, az, bx, by, bz, elemA, elemB, resA, resB, type]  (Å)
  for (var i2 = 0; i2 < nAtoms; i2++) {
    for (var j3 = i2 + 1; j3 < nAtoms; j3++) {
      var kA = A(i2, 1), kB = A(j3, 1);
      var dx = A(i2, 2) - A(j3, 2), dy = A(i2, 3) - A(j3, 3), dz = A(i2, 4) - A(j3, 4), d2s = dx * dx + dy * dy + dz * dz;
      var lim = (kA === 4 && kB === 4) ? 0 : (kA === 4 || kB === 4) ? 1.25 : 1.9;
      if (!lim || d2s > lim * lim) continue;
      bonds.push([A(i2, 2), A(i2, 3), A(i2, 4), A(j3, 2), A(j3, 3), A(j3, 4), kA, kB, A(i2, 0), A(j3, 0), 0]);
    }
  }
  var c2 = Math.cos(2 * SCREW), s2n = Math.sin(2 * SCREW), dy2 = 2 * RISE;
  function up(x, y, z) { return [x * c2 + z * s2n, y + dy2, -x * s2n + z * c2]; }
  function dist2(a, b) { return (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2]); }
  for (var h = 0; h < nAtoms; h++) {
    for (var o = 0; o < nAtoms; o++) {
      var rh = A(h, 5), ro = A(o, 5);
      // amide H in this subunit to a carbonyl O in the one above, and the other way round
      if (rh === 5 && ro === 2) {
        var ou = up(A(o, 2), A(o, 3), A(o, 4)), hp = [A(h, 2), A(h, 3), A(h, 4)];
        if (dist2(hp, ou) < 2.6 * 2.6) bonds.push([hp[0], hp[1], hp[2], ou[0], ou[1], ou[2], 4, 2, A(h, 0), A(o, 0), 1]);
      }
      if (rh === 2 && ro === 5) {
        var hu = up(A(o, 2), A(o, 3), A(o, 4)), op = [A(h, 2), A(h, 3), A(h, 4)];
        if (dist2(op, hu) < 2.6 * 2.6) bonds.push([op[0], op[1], op[2], hu[0], hu[1], hu[2], 2, 4, A(h, 0), A(o, 0), 1]);
      }
    }
  }
  var stkVerts = new Float32Array(bonds.length * 4 * 13), stkIdx = new Uint32Array(bonds.length * 6);
  bonds.forEach(function (bd, bi) {
    var corners = [[0, -1], [0, 1], [1, -1], [1, 1]];
    for (var c = 0; c < 4; c++) {
      var o2 = (bi * 4 + c) * 13;
      stkVerts[o2] = bd[0] / UNIT; stkVerts[o2 + 1] = bd[1] / UNIT; stkVerts[o2 + 2] = bd[2] / UNIT;
      stkVerts[o2 + 3] = bd[3] / UNIT; stkVerts[o2 + 4] = bd[4] / UNIT; stkVerts[o2 + 5] = bd[5] / UNIT;
      stkVerts[o2 + 6] = corners[c][0]; stkVerts[o2 + 7] = corners[c][1]; stkVerts[o2 + 8] = bd[6]; stkVerts[o2 + 9] = bd[7];
      stkVerts[o2 + 10] = bd[8]; stkVerts[o2 + 11] = bd[9]; stkVerts[o2 + 12] = bd[10];
    }
    var b0 = bi * 4;
    stkIdx.set([b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2], bi * 6);
  });
  var stkCount = bonds.length * 6;
  var stkVao = vao(stkP, buffer(stkVerts), [
    { name: 'aA', size: 3, offset: 0 }, { name: 'aB', size: 3, offset: 3 }, { name: 'aC', size: 4, offset: 6 }, { name: 'aD', size: 3, offset: 10 }
  ], 13, instDet, buffer(stkIdx, gl.STATIC_DRAW, gl.ELEMENT_ARRAY_BUFFER));

  // Centre of each stretch of sequence in the subunit frame, for the views that zoom to it
  function centroid(r0, r1) {
    var sx = 0, sy = 0, sz = 0, n = 0;
    for (var qq = 0; qq < nAtoms; qq++) {
      var res = A(qq, 0);
      if (res < r0 || res > r1 || A(qq, 1) === 4) continue;
      sx += A(qq, 2); sy += A(qq, 3); sz += A(qq, 4); n++;
    }
    return n ? [sx / n / UNIT, sy / n / UNIT, sz / n / UNIT] : [0, 0, 0];
  }

  // Per-subunit placement (screw about the fibril axis) and edge fade along the fibril
  var subC = new Float32Array(SUBUNITS), subS = new Float32Array(SUBUNITS), subY = new Float32Array(SUBUNITS), subEdge = new Float32Array(SUBUNITS);
  for (var k = 0; k < SUBUNITS; k++) {
    var nn = k - K0;
    subC[k] = Math.cos(nn * SCREW);
    subS[k] = Math.sin(nn * SCREW);
    subY[k] = nn * RISE / UNIT;
    var e = Math.min(k, SUBUNITS - 1 - k) / 18;
    subEdge[k] = e >= 1 ? 1 : e * e * (3 - 2 * e);
  }

  // ---- State ----
  var view = { W: 0, H: 0, dpr: 1, dprMax: 1.5, scale0: 1, visW: 1, visH: 1, home: { x: 0, y: 0 }, side: 'right' };
  var pfA = [0.85, 0.76, 0.49], pfB = [0.4, 0.58, 0.9], bg = [0.03, 0.04, 0.06];
  var elN, elO, elS, elH;
  var isLight = false;
  var running = false, last = 0;
  var stations = 7, focusIndex = -1;
  var cam = homeCam();
  var tween = null;
  var perf = { n: 0, sum: 0 };
  var pointMax = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64;

  function homeCam() {
    return {
      tx: 0, ty: 0, tz: 0, ax: HOME.ax, roll: HOME.roll, base: HOME.spin, phase: 0, rate: HOME.rate,
      cx: view.home.x, cy: view.home.y, zoom: view.scale0, far: 0.4, near: 0.4, soft: 0.0001, sk: 0.1, clip: 0.1, depth: 99, xs: 0, pf: -1,
      amt: 0, r0: 1, r1: 6
    };
  }

  function hex(str, fallback) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(str).trim());
    if (!m) return fallback;
    var v = parseInt(m[1], 16);
    return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
  }
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    isLight = lightQuery.matches;
    pfA = hex(cs.getPropertyValue('--accent'), pfA);                  // gold
    pfB = isLight ? [0.13, 0.22, 0.48] : [0.38, 0.56, 0.92];          // blue
    bg = hex(cs.getPropertyValue('--bg'), bg);
    elN = isLight ? [0.12, 0.28, 0.85] : [0.3, 0.45, 1.0];
    elO = isLight ? [0.82, 0.12, 0.12] : [0.95, 0.25, 0.25];
    elS = isLight ? [0.72, 0.55, 0.03] : [0.95, 0.82, 0.25];
    elH = isLight ? [0.82, 0.84, 0.88] : [0.94, 0.95, 0.97];
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
    view.home.x = W / 2;
    view.home.y = H / 2;

    // Views fill the other half of the screen from the content (the top half on phones)
    if (sheetQuery.matches) { view.visW = W; view.visH = H * 0.5; }
    else { view.visW = W / 2; view.visH = H; }

    if (!tween) {
      if (focusIndex < 0) { var h = homeCam(); h.r0 = cam.r0; h.r1 = cam.r1; h.phase = cam.phase; cam = h; }
      else { var c = camFor(focusIndex); c.phase = cam.phase; cam = c; }
    }
    kick();
  }

  // Equal slices of the 42 residues, N → C, one per section
  api.segment = function (i) {
    return [Math.round(i * 42 / stations) + 1, Math.round((i + 1) * 42 / stations)];
  };
  api.setStations = function (count) { stations = count; resize(); };
  api.resize = resize;

  // Where the structure sits: the half of the screen opposite the content
  function zoomCenter() {
    if (sheetQuery.matches) return { x: view.W / 2, y: view.visH / 2 };
    return { x: view.side === 'left' ? view.W * 0.75 : view.W * 0.25, y: view.H / 2 };
  }

  // Camera for section i: a point to look at, an orientation, a zoom and what to keep
  function camFor(i) {
    var v = VIEWS[i % VIEWS.length], seg = api.segment(i);
    var T = [0, PAIR_Y, 0];
    if (v.sub !== 'axis') {
      // that stretch of the sequence in the chosen subunit of the pair
      var kk = K0 + v.sub, q = centroid(seg[0], seg[1]);
      T = [q[0] * subC[kk] + q[2] * subS[kk], q[1] + subY[kk], -q[0] * subS[kk] + q[2] * subC[kk]];
    }
    var zc = zoomCenter(), want = Math.min(view.visW, view.visH) / (v.wu * 0.8);
    var cap = 0.95 * pointMax / (2 * 0.5 / UNIT * view.dpr * 1.4);   // the biggest ball must fit a point sprite
    return {
      tx: T[0], ty: T[1], tz: T[2], ax: v.ax, roll: v.roll, base: v.spin, phase: 0, rate: v.rate / 1000,
      cx: zc.x, cy: zc.y, zoom: Math.min(want, cap), far: v.far, near: v.near, soft: 0.0001, sk: v.sk, clip: v.clip === undefined ? 0.1 : v.clip, depth: v.depth || 99, xs: v.xs || 0,
      pf: v.sub === 'axis' || v.both ? -1 : (K0 + v.sub) % 2,
      amt: 1, r0: seg[0], r1: seg[1]
    };
  }

  api.focus = function (i, side) {
    focusIndex = i;
    if (side) view.side = side;
    var b;
    if (i < 0) { b = homeCam(); b.r0 = cam.r0; b.r1 = cam.r1; }
    else { b = camFor(i); if (cam.amt < 0.02) { cam.r0 = b.r0; cam.r1 = b.r1; } }
    // a view that holds still lands on its exact pose; a turntable carries on from where it is
    b.phase = b.rate === 0 ? Math.round(cam.phase / TAU) * TAU : cam.phase;
    if (i < 0) b.phase = cam.phase;
    var from = {};
    for (var key in cam) from[key] = cam[key];
    if (reduceMotion.matches) { cam = b; tween = null; b.rate = 0; render(); return; }
    tween = { a: from, b: b, t0: performance.now(), dur: i < 0 ? 1100 : (cam.amt > 0.6 ? 1000 : 1700) };
    kick();
  };

  function stepTween(now) {
    var p = Math.min(1, (now - tween.t0) / tween.dur), e = ease(p), a = tween.a, b = tween.b;
    var pos = ease(Math.min(1, p / 0.9));
    cam.amt = lerp(a.amt, b.amt, e);
    cam.cx = lerp(a.cx, b.cx, e); cam.cy = lerp(a.cy, b.cy, e);
    cam.tx = lerp(a.tx, b.tx, pos); cam.ty = lerp(a.ty, b.ty, pos); cam.tz = lerp(a.tz, b.tz, pos);
    cam.ax = lerp(a.ax, b.ax, e); cam.roll = lerp(a.roll, b.roll, e);
    cam.base = lerp(a.base, b.base, e); cam.phase = lerp(a.phase, b.phase, e);
    cam.zoom = Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), e));
    cam.far = lerp(a.far, b.far, e); cam.near = lerp(a.near, b.near, e); cam.soft = lerp(a.soft, b.soft, e);
    cam.sk = lerp(a.sk, b.sk, e); cam.clip = lerp(a.clip, b.clip, e); cam.xs = lerp(a.xs, b.xs, e);
    cam.depth = Math.exp(lerp(Math.log(a.depth), Math.log(b.depth), e));
    cam.r0 = lerp(a.r0, b.r0, e); cam.r1 = lerp(a.r1, b.r1, e);
    cam.rate = lerp(a.rate, b.rate, e);
    cam.pf = b.pf;
    cam.soft = p < 1 ? 0.05 : b.soft;   // layers fade in and out while flying, but sit crisp once settled
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
    gl.uniform2f(u.uCenter, cam.cx, cam.cy);
  }
  function setDetail(P, light, mix) {
    var u = P.u;
    gl.uniform1f(u.uMix, mix);
    gl.uniform1f(u.uLight, light);
    gl.uniform1f(u.uDepth, cam.depth);
    gl.uniform2f(u.uHi, cam.r0, cam.r1);
    gl.uniform3fv(u.uPfA, pfA);
    gl.uniform3fv(u.uPfB, pfB);
    gl.uniform3fv(u.uBg, bg);
    gl.uniform3fv(u.uN, elN);
    gl.uniform3fv(u.uO, elO);
    gl.uniform3fv(u.uS, elS);
    gl.uniform3fv(u.uH, elH);
  }
  function upload(inst) {
    gl.bindBuffer(gl.ARRAY_BUFFER, inst.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst.arr.subarray(0, inst.n * 5));
  }
  function put(inst, k, f) {
    var o = inst.n * 5, a = inst.arr;
    a[o] = subC[k]; a[o + 1] = subS[k]; a[o + 2] = subY[k]; a[o + 3] = f; a[o + 4] = k % 2;
    inst.n++;
  }

  // 1 inside the slice around the focus, fading out over `soft`; d > 0 is toward the viewer
  function slab(d) {
    return d < 0 ? 1 - smooth(cam.far, cam.far + cam.soft, -d) : 1 - smooth(cam.near, cam.near + cam.soft, d);
  }

  function render() {
    var spin = cam.base + cam.phase, light = isLight ? 1 : 0;
    var C = {
      cy: Math.cos(spin), sy: Math.sin(spin),
      cx: Math.cos(cam.ax), sx: Math.sin(cam.ax),
      cr: Math.cos(cam.roll), sr: Math.sin(cam.roll)
    };
    var toward = Math.sin(cam.ax) < 0 ? -1 : 1;   // which end of the axis is nearer the viewer
    var mix = smooth(0.1, 0.8, cam.amt), skel = 1 - smooth(0.05, 0.6, cam.amt), cart = 1 - cam.xs;

    instSkel.n = instRib.n = instDet.n = 0;
    var k, d, f;
    for (k = 0; k < SUBUNITS; k++) {
      if (skel > 0.01) put(instSkel, k, subEdge[k] * skel);
      d = (subY[k] - cam.ty) * toward;
      if (mix > 0.01) {
        f = slab(d) * mix * cart * (cam.pf < 0 || k % 2 === cam.pf ? 1 : 1 - mix);
        if (f > 0.01) put(instRib, k, f);
        f = (1 - smooth(cam.sk, cam.sk + cam.soft, Math.abs(subY[k] - cam.ty))) * mix;
        if (f > 0.01) put(instDet, k, f);
      }
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);

    // the backbone, additive on dark backgrounds
    if (instSkel.n) {
      gl.disable(gl.DEPTH_TEST);
      if (isLight) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.ONE, gl.ONE);
      upload(instSkel);
      gl.useProgram(lineP.p);
      setCommon(lineP, C);
      gl.uniform1f(lineP.u.uLight, light); gl.uniform1f(lineP.u.uAlpha, 1);
      gl.uniform3fv(lineP.u.uPfA, pfA); gl.uniform3fv(lineP.u.uPfB, pfB);
      gl.bindVertexArray(caLineVao);
      gl.drawArraysInstanced(gl.LINE_STRIP, 0, nRes, instSkel.n);
      gl.useProgram(dotP.p);
      setCommon(dotP, C);
      gl.uniform1f(dotP.u.uLight, light); gl.uniform1f(dotP.u.uAlpha, 1); gl.uniform1f(dotP.u.uSize, view.W < 640 ? 0.85 : 1);
      gl.uniform3fv(dotP.u.uPfA, pfA); gl.uniform3fv(dotP.u.uPfB, pfB);
      gl.bindVertexArray(caDotVao);
      gl.drawArraysInstanced(gl.POINTS, 0, nRes, instSkel.n);
    }

    // the cartoon, then the ball-and-stick detail with its hydrogen bonds
    if (instRib.n || instDet.n) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (instDet.n) {
        upload(instDet);
        var all = cam.xs > 0.5 ? 1 : 0, hideH = all;
        gl.useProgram(stkP.p);
        setCommon(stkP, C); setDetail(stkP, light, mix);
        gl.uniform2f(stkP.u.uRange, cam.r0, cam.r1); gl.uniform1f(stkP.u.uAll, all); gl.uniform1f(stkP.u.uHideH, hideH);
        gl.bindVertexArray(stkVao);
        gl.drawElementsInstanced(gl.TRIANGLES, stkCount, gl.UNSIGNED_INT, 0, instDet.n);
        gl.useProgram(sphP.p);
        setCommon(sphP, C); setDetail(sphP, light, mix);
        gl.uniform2f(sphP.u.uRange, cam.r0, cam.r1); gl.uniform1f(sphP.u.uAll, all); gl.uniform1f(sphP.u.uHideH, hideH);
        gl.uniform1f(sphP.u.uBallScale, all ? 0.8 : 1);
        gl.bindVertexArray(sphVao);
        gl.drawArraysInstanced(gl.POINTS, 0, nAtoms, instDet.n);
      }
      if (instRib.n) {
        upload(instRib);
        gl.useProgram(ribP.p);
        setCommon(ribP, C); setDetail(ribP, light, mix); gl.uniform1f(ribP.u.uSk, cam.sk); gl.uniform1f(ribP.u.uClip, cam.clip);
        gl.bindVertexArray(ribVao);
        gl.drawElementsInstanced(gl.TRIANGLES, ribCount, gl.UNSIGNED_INT, 0, instRib.n);
      }
    }
    gl.bindVertexArray(null);
  }

  // The loop only runs while something is moving: the slow turn at rest, a fly between views, a turntable
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
    if (reduceMotion.matches || document.hidden || !moving()) { render(); return; }
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
