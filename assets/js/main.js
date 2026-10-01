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
  var tree = null, caption = null, limbs = [], roots = [], buds = [], tags = [], sizes = [];
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
      var limb = document.createElementNS(NS, 'line');
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
      bud.innerHTML = '<span class="bud-text"><span class="bud-label"></span><small class="bud-res"></small></span>';
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

    fib.onlayout = layoutTree;
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
      return { w: t.offsetWidth + 12, h: t.offsetHeight + 8 };
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

  function layoutTree() {
    var W = window.innerWidth, H = window.innerHeight, M = 14;
    var home = fib.homeAtoms(), atoms = home.atoms, cx = home.cx, cy = home.cy;
    var rand = rng(11), placed = [];

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

    function labelRect(ex, ey, dx, dy, size) {
      if (Math.abs(dx) >= 0.45) {
        var right = dx > 0;
        return { side: right ? 'right' : 'left', x0: right ? ex : ex - size.w, x1: right ? ex + size.w : ex, y0: ey - size.h / 2, y1: ey + size.h / 2 };
      }
      var down = dy > 0;
      return { side: down ? 'bottom' : 'top', x0: ex - size.w / 2, x1: ex + size.w / 2, y0: down ? ey : ey - size.h, y1: down ? ey + size.h : ey };
    }

    for (var i = 0; i < panels.length; i++) {
      var seg = fib.segment(i), best = null, bestScore = -1e9, relaxed;
      for (relaxed = 0; relaxed < 3 && !best; relaxed++) {   // 0: tidy, 1: tighter packing, 2: anything that fits
        for (var q = 0; q < atoms.length; q++) {
          var a = atoms[q];
          if (a.res < seg[0] || a.res > seg[1] || a.kind !== 0 || a.r < 28) continue;   // carbons, clear of the centre
          var dx = (a.x - cx) / a.r, dy = (a.y - cy) / a.r, reach = 0;
          for (var j = 0; j < atoms.length; j++) reach = Math.max(reach, (atoms[j].x - cx) * dx + (atoms[j].y - cy) * dy);
          for (var g = 0; g < 4; g++) {
            var gap = 30 + rand() * 100, ex = cx + dx * (reach + gap), ey = cy + dy * (reach + gap);
            var rect = labelRect(ex, ey, dx, dy, sizes[i]);
            if (rect.x0 < M || rect.x1 > W - M || rect.y0 < M || rect.y1 > H - M) continue;
            var bad = false, line = { a: { x: a.x, y: a.y }, e: { x: ex, y: ey } }, k2;
            for (k2 = 0; k2 < avoid.length && !bad; k2++) {
              if (segHitsRect(a.x, a.y, ex, ey, avoid[k2]) || rect.x1 > avoid[k2].x0 && rect.x0 < avoid[k2].x1 && rect.y1 > avoid[k2].y0 && rect.y0 < avoid[k2].y1) bad = true;
            }
            var padX = relaxed ? 2 : 10, padY = relaxed ? 2 : 8;
            for (k2 = 0; k2 < placed.length && !bad && relaxed < 2; k2++) {
              var o = placed[k2];
              if (segHitsSeg(line, o) || segHitsRect(a.x, a.y, ex, ey, o.rect) || segHitsRect(o.a.x, o.a.y, o.e.x, o.e.y, rect) ||
                  (rect.x1 + padX > o.rect.x0 && rect.x0 - padX < o.rect.x1 && rect.y1 + padY > o.rect.y0 && rect.y0 - padY < o.rect.y1) ||
                  (!relaxed && Math.hypot(a.x - o.a.x, a.y - o.a.y) < 30)) bad = true;
            }
            if (bad) continue;
            var score = 1.1 * (a.r / maxR) + 0.9 * rand() - 0.0015 * Math.hypot(ex - a.x, ey - a.y);
            if (score > bestScore) { bestScore = score; best = { atom: a, a: line.a, e: line.e, rect: rect, dx: dx, dy: dy }; }
          }
        }
      }
      if (!best) continue;
      placed.push(best);
      var s = best.atom;
      limbs[i].setAttribute('x1', f(s.x + best.dx * 5)); limbs[i].setAttribute('y1', f(s.y + best.dy * 5));
      limbs[i].setAttribute('x2', f(best.e.x)); limbs[i].setAttribute('y2', f(best.e.y));
      roots[i].setAttribute('cx', f(s.x)); roots[i].setAttribute('cy', f(s.y));
      tags[i].textContent = AA3[SEQ[s.res - 1]] + s.res;
      buds[i].className = 'bud is-' + best.rect.side;
      buds[i].style.transform = 'translate3d(' + f(best.e.x) + 'px,' + f(best.e.y) + 'px,0)';
    }
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
      tree.classList.add('is-open');
      setCaption(ids.indexOf(id));
      fib.focus(ids.indexOf(id));
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
