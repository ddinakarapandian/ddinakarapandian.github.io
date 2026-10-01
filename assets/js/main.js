/* ==========================================================================
   Panel router: #about, #research, … open the matching <article class="panel">.
   With WebGL the sections are branches of a tree growing from the fibril and
   opening one flies the camera into it (fibril.js); otherwise they open as an
   overlay from the plain nav. Back/forward, Esc and clicking outside close it.
   ========================================================================== */
(function () {
  'use strict';

  var body = document.body;
  var container = document.getElementById('panels');
  var panels = Array.prototype.slice.call(container.querySelectorAll('.panel'));
  var ids = panels.map(function (p) { return p.id; });
  var current = null;
  var returnFocus = null;

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Close button + prev/next links in every panel
  panels.forEach(function (panel, i) {
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('tabindex', '-1');

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'panel-close';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    close.addEventListener('click', closePanel);
    panel.insertBefore(close, panel.firstChild);

    var nav = document.createElement('nav');
    nav.className = 'panel-nav';
    nav.setAttribute('aria-label', 'Section navigation');
    if (i > 0) nav.appendChild(link(panels[i - 1], '← '));
    if (i < panels.length - 1) nav.appendChild(link(panels[i + 1], '', ' →')).classList.add('next');
    panel.appendChild(nav);
  });

  // Number the blocks of each panel so CSS can stagger them in on opening.
  // Lists and grids are staggered item by item rather than as one block.
  var GROUPS = '.news, .pubs, .talks, .timeline, .awards, .chips, .contact-list, .thrusts, .facts, .stats, .edu, .toolkit';
  var MAX_STEP = 14;
  panels.forEach(function (panel) {
    var i = 0;
    function mark(el) {
      el.setAttribute('data-reveal', '');
      el.style.setProperty('--i', Math.min(i++, MAX_STEP));
    }
    Array.prototype.forEach.call(panel.children, function (el) {
      if (el.matches('.panel-close, .panel-nav')) return;
      if (el.matches(GROUPS)) Array.prototype.forEach.call(el.children, mark);
      else mark(el);
    });
  });

  // Count the Publications numbers up from zero when that panel opens.
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function countUp(panel) {
    if (reduceMotion.matches) return;
    Array.prototype.forEach.call(panel.querySelectorAll('.stats b'), function (b) {
      var target = parseInt(b.getAttribute('data-target') || b.textContent, 10);
      if (!target) return;
      b.setAttribute('data-target', target);
      var t0 = null, dur = 900, delay = 250;
      b.textContent = '0';
      function step(now) {
        if (t0 === null) t0 = now + delay;
        var k = Math.max(0, Math.min(1, (now - t0) / dur));
        b.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  function link(target, pre, post) {
    var a = document.createElement('a');
    a.href = '#' + target.id;
    a.textContent = (pre || '') + target.querySelector('h2').textContent + (post || '');
    return a;
  }

  // ---- Section labels (WebGL mode) ----
  // The resting view is the fibril cross-section, as in the paper's Fig. 2. Each section is a
  // straight leader line from an amino acid in its own stretch of the sequence out to a label,
  // at scattered angles and lengths, like the callouts on a structure figure. fibril.js does the
  // rendering and the camera, this only places the DOM.
  var fib = window.Fibril && window.Fibril.ready ? window.Fibril : null;
  var SEQ = 'DAEFRHDSGYEVHHQKLVFFAEDVGSNKGAIIGLMVGGVVIA';
  var AA3 = { A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', E: 'Glu', Q: 'Gln', G: 'Gly', H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val' };
  var tree = null, caption = null, limbs = [], roots = [], buds = [], tags = [], sizes = [], sides = [];
  if (fib) buildTree();

  function buildTree() {
    var NS = 'http://www.w3.org/2000/svg';
    tree = document.createElement('nav');
    tree.className = 'tree';
    tree.setAttribute('aria-label', 'Sections');
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'tree-lines');
    svg.setAttribute('aria-hidden', 'true');
    tree.appendChild(svg);

    panels.forEach(function (panel, i) {
      var limb = document.createElementNS(NS, 'polyline');
      limb.setAttribute('class', 'tree-limb');
      limb.setAttribute('pathLength', '1');
      limb.style.setProperty('--i', i);
      var root = document.createElementNS(NS, 'circle');
      root.setAttribute('class', 'tree-root');
      root.setAttribute('r', '4.5');
      root.style.setProperty('--i', i);
      svg.appendChild(limb);
      svg.appendChild(root);

      var bud = document.createElement('a');
      bud.className = 'bud';
      bud.href = '#' + panel.id;
      bud.style.setProperty('--i', i);
      bud.innerHTML = '<span class="bud-text"><span class="bud-label"></span> <small class="bud-res"></small></span>';
      bud.querySelector('.bud-label').textContent = panel.querySelector('h2').textContent;
      function hot(on) { limb.classList.toggle('is-hot', on); root.classList.toggle('is-hot', on); fib.hover(on ? i : -1); }
      bud.addEventListener('pointerenter', function () { hot(true); });
      bud.addEventListener('pointerleave', function () { hot(false); });
      bud.addEventListener('focus', function () { hot(true); });
      bud.addEventListener('blur', function () { hot(false); });
      tree.appendChild(bud);
      limbs.push(limb); roots.push(root); buds.push(bud); tags.push(bud.querySelector('.bud-res'));
    });
    document.body.appendChild(tree);

    caption = document.createElement('p');
    caption.className = 'zoom-caption';
    caption.setAttribute('aria-hidden', 'true');
    document.body.appendChild(caption);

    var layoutTimer = 0, laidOut = false;
    fib.onlayout = function () {
      if (!laidOut) { laidOut = true; layoutTree(); return; }
      clearTimeout(layoutTimer);
      layoutTimer = setTimeout(layoutTree, 80);
    };
    window.addEventListener('resize', measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    measure();

    // Draw the lines out once the first frame is up
    requestAnimationFrame(function () { requestAnimationFrame(function () { tree.classList.add('is-ready'); }); });
  }

  // On narrow screens the name block owns the top and the footer the bottom, so the
  // structure sits in what's left. Labels are measured so they can be placed without overlap.
  function measure() {
    var hero = document.querySelector('.hero');
    var narrow = window.innerWidth <= 860;
    fib.reserve.top = narrow && hero ? hero.getBoundingClientRect().bottom + 6 : 0;
    fib.reserve.bottom = narrow ? 56 : 0;
    tags.forEach(function (t) { t.textContent = 'Ala42'; });   // widest tag, so sizes don't depend on the pick
    sizes = buds.map(function (b) {
      var t = b.querySelector('.bud-text');
      return { w: t.offsetWidth + 10, h: t.offsetHeight + 2 };
    });
    fib.setStations(panels.length);
  }

  // small deterministic generator, so the scatter is the same on every load
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function inRect(x, y, r) { return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1; }
  function segHitsRect(ax, ay, bx, by, r) {
    for (var s = 0; s <= 24; s++) {
      var t = s / 24;
      if (inRect(ax + (bx - ax) * t, ay + (by - ay) * t, r)) return true;
    }
    return false;
  }
  function segHitsSeg(a, b) {
    function ccw(p, q, r) { return (r.y - p.y) * (q.x - p.x) > (q.y - p.y) * (r.x - p.x); }
    return ccw(a.a, b.a, b.e) !== ccw(a.e, b.a, b.e) && ccw(a.a, a.e, b.a) !== ccw(a.a, a.e, b.e);
  }

  function distSq(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    var qx = ax + dx * t - px, qy = ay + dy * t - py;
    return qx * qx + qy * qy;
  }
  function polyHitsRect(pl, r) { return segHitsRect(pl.a.x, pl.a.y, pl.k.x, pl.k.y, r) || segHitsRect(pl.k.x, pl.k.y, pl.h.x, pl.h.y, r); }
  function polyHitsPoly(p, q) {
    return segHitsSeg({ a: p.a, e: p.k }, { a: q.a, e: q.k }) || segHitsSeg({ a: p.a, e: p.k }, { a: q.k, e: q.h }) ||
           segHitsSeg({ a: p.k, e: p.h }, { a: q.a, e: q.k }) || segHitsSeg({ a: p.k, e: p.h }, { a: q.k, e: q.h });
  }

  // Each leader is an angled line from a carbon of the section's residues to a short horizontal
  // line with the label sitting on it, like the callouts on a structure figure. Placement is a
  // seeded random search: several scatterings are tried and the tidiest one is kept, so the
  // result is the same on every load.
  function layoutTree() {
    var W = window.innerWidth, H = window.innerHeight, M = 14;
    var home = fib.homeAtoms(), atoms = home.atoms, cx = home.cx, cy = home.cy;
    var narrow = W < 640, ANGLES = narrow ? [0.9, 1.15, 1.35, 1.5] : [0.5, 0.75, 1.0, 1.3];   // phones: steeper, out to the free bands above and below

    // places the text must stay out of: the name block and the footer
    var avoid = [];
    ['.hero', '.site-footer'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      var r = el.getBoundingClientRect();
      avoid.push({ x0: r.left - 12, y0: r.top - 12, x1: r.right + 12, y1: r.bottom + 12 });
    });
    var maxR = 1;
    atoms.forEach(function (a) { a.r = Math.hypot(a.x - cx, a.y - cy); maxR = Math.max(maxR, a.r); });

    // the carbons of each section's stretch, outermost first
    var cands = panels.map(function (_, i) {
      var seg = fib.segment(i);
      return atoms.filter(function (a) { return a.res >= seg[0] && a.res <= seg[1] && a.kind === 0 && a.r > 20; })
        .sort(function (u, v) { return v.r - u.r; }).slice(0, 44);
    });

    function attempt(seed) {
      var rand = rng(seed), placed = [], out = [], cost = 0;
      for (var i = 0; i < panels.length; i++) {
        var size = sizes[i], best = null, bestScore = -1e9, pass;
        for (pass = 0; pass < 3 && !best; pass++) {   // 0: tidy, 1: tighter packing, 2: anything that fits
          for (var q = 0; q < cands[i].length; q++) {
            var a = cands[i][q];
            for (var an = 0; an < ANGLES.length; an++) {
              for (var vs = -1; vs <= 1; vs += 2) {
                for (var hs = 0; hs < 2; hs++) {
                  var o0 = a.x >= cx ? 1 : -1, hd = hs ? -o0 : o0;
                  var L = 34 + rand() * (narrow ? 230 : 120);
                  var kx = a.x + hd * Math.cos(ANGLES[an]) * L, ky = a.y + vs * Math.sin(ANGLES[an]) * L;
                  var hx = kx + hd * size.w;
                  var rect = { x0: Math.min(kx, hx), x1: Math.max(kx, hx), y0: ky - size.h, y1: ky + 2 };
                  if (rect.x0 < M || rect.x1 > W - M || rect.y0 < M || rect.y1 > H - M) continue;
                  var pl = { a: { x: a.x, y: a.y }, k: { x: kx, y: ky }, h: { x: hx, y: ky } }, bad = false, k2;
                  for (k2 = 0; k2 < avoid.length && !bad; k2++) {
                    if (polyHitsRect(pl, avoid[k2]) || rect.x1 > avoid[k2].x0 && rect.x0 < avoid[k2].x1 && rect.y1 > avoid[k2].y0 && rect.y0 < avoid[k2].y1) bad = true;
                  }
                  var padX = pass ? 2 : 14, padY = pass ? 2 : 12;
                  for (k2 = 0; k2 < placed.length && !bad && pass < 2; k2++) {
                    var o = placed[k2];
                    if (polyHitsPoly(pl, o) || polyHitsRect(pl, o.rect) || polyHitsRect(o, rect) ||
                        (rect.x1 + padX > o.rect.x0 && rect.x0 - padX < o.rect.x1 && rect.y1 + padY > o.rect.y0 && rect.y0 - padY < o.rect.y1) ||
                        (!pass && Math.hypot(a.x - o.a.x, a.y - o.a.y) < 30)) bad = true;
                  }
                  if (bad) continue;
                  // keep the lines and text off the sticks
                  var clutter = 0;
                  for (var j = 0; j < atoms.length; j += 2) {
                    var t = atoms[j];
                    if (Math.hypot(t.x - a.x, t.y - a.y) < 14) continue;
                    if (distSq(t.x, t.y, a.x, a.y, kx, ky) < 64 || distSq(t.x, t.y, kx, ky, hx, ky) < 100 ||
                        (t.x > rect.x0 - 3 && t.x < rect.x1 + 3 && t.y > rect.y0 - 3 && t.y < rect.y1 + 3)) clutter++;
                  }
                  if (clutter > (pass === 0 ? 1 : pass === 1 ? 6 : 1e9)) continue;
                  var score = 1.0 * (a.r / maxR) + 0.7 * rand() + (hs ? 0 : 0.25) - 0.03 * clutter - 0.002 * L;
                  if (score > bestScore) { bestScore = score; best = { atom: a, a: pl.a, k: pl.k, h: pl.h, rect: rect, hd: hd }; }
                }
              }
            }
          }
        }
        if (best) { placed.push(best); cost += (pass - 1) * 10; } else cost += 100;
        out[i] = best;
      }
      return { out: out, cost: cost };
    }

    var chosen = null;
    for (var seed = 11; seed < 11 + 14; seed++) {
      var tryOut = attempt(seed);
      if (!chosen || tryOut.cost < chosen.cost) chosen = tryOut;
      if (chosen.cost === 0) break;
    }

    chosen.out.forEach(function (best, i) {
      if (!best) return;
      var s0 = best.atom, dir = Math.hypot(best.k.x - best.a.x, best.k.y - best.a.y) || 1;
      var sx = s0.x + (best.k.x - best.a.x) / dir * 5, sy = s0.y + (best.k.y - best.a.y) / dir * 5;   // leave the ring clear
      limbs[i].setAttribute('points', f(sx) + ',' + f(sy) + ' ' + f(best.k.x) + ',' + f(best.k.y) + ' ' + f(best.h.x) + ',' + f(best.h.y));
      roots[i].setAttribute('cx', f(s0.x));
      roots[i].setAttribute('cy', f(s0.y));
      tags[i].textContent = AA3[SEQ[s0.res - 1]] + s0.res;
      buds[i].className = 'bud is-' + (best.hd > 0 ? 'right' : 'left');
      buds[i].style.transform = 'translate3d(' + f(best.k.x) + 'px,' + f(best.k.y) + 'px,0)';
      // a label on the left half of the screen opens its content on the left, and vice versa
      sides[i] = (best.rect.x0 + best.rect.x1) / 2 < W / 2 ? 'left' : 'right';
    });
  }
  function f(v) { return v.toFixed(1); }

  // "Aβ42 · residues 7–12 · SGYEV…": each section is a stretch of the sequence, N → C,
  // and that stretch is what lights up in the structure.
  function setCaption(i) {
    var s = fib.segment(i);
    caption.textContent = 'Aβ42 · residues ' + s[0] + '–' + s[1] + ' · ' + SEQ.slice(s[0] - 1, s[1]);
  }

  function show(id) {
    var panel = document.getElementById(id);
    if (!panel || ids.indexOf(id) === -1) { hide(); return; }
    if (current === panel) return;

    if (!current) returnFocus = document.activeElement;
    if (current) current.classList.remove('is-active');
    current = panel;
    panel.classList.add('is-active');
    body.classList.add('is-panel-open');
    // The browser's own anchor jump scrolls the overlay; undo it so the card opens at its top.
    container.scrollTop = 0;
    requestAnimationFrame(function () { container.scrollTop = 0; });
    document.title = panel.querySelector('h2').textContent + ' · Daniel M. Dinakarapandian';
    panel.focus({ preventScroll: true });
    if (fib) {
      var n = ids.indexOf(id), side = sides[n] || 'right';
      body.classList.toggle('card-left', side === 'left');
      tree.classList.add('is-open');
      setCaption(n);
      fib.focus(n, side);
    }
    countUp(panel);
  }

  function hide() {
    if (!current) return;
    current.classList.remove('is-active');
    current = null;
    body.classList.remove('is-panel-open');
    if (fib) { tree.classList.remove('is-open'); fib.focus(-1); }
    document.title = 'Daniel M. Dinakarapandian';
    if (returnFocus && returnFocus.focus) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  function closePanel() {
    if (location.hash) {
      history.pushState('', document.title, location.pathname + location.search);
    }
    hide();
  }

  function route() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (id) show(id); else hide();
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);

  // Click on the dimmed backdrop (not the card) closes; in zoom mode, so does a click on the structure
  container.addEventListener('click', function (e) {
    if (e.target === container && !fib) closePanel();
  });
  document.addEventListener('click', function (e) {
    if (!fib || !current || e.target.closest('.panels, a, button')) return;
    closePanel();
  });

  document.addEventListener('keydown', function (e) {
    if (!current) return;
    if (e.key === 'Escape') { closePanel(); return; }
    // Keep Tab focus inside the open panel
    if (e.key === 'Tab') {
      var f = current.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === current)) {
        lastEl.focus(); e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        first.focus(); e.preventDefault();
      }
    }
  });

  route();
  window.addEventListener('load', function () { if (current) container.scrollTop = 0; });
})();
