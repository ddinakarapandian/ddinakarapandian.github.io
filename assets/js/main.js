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

  // ---- Tree of branches (WebGL mode) ----
  // Each section is a branch that grows from a station on the fibril axis;
  // fibril.js does the rendering and the camera, this only places the DOM.
  var fib = window.Fibril && window.Fibril.ready ? window.Fibril : null;
  var SEQ = 'DAEFRHDSGYEVHHQKLVFFAEDVGSNKGAIIGLMVGGVVIA';
  var tree = null, caption = null, limbs = [], roots = [], buds = [], widths = [], avoid = null;
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
      var limb = document.createElementNS(NS, 'path');
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
      bud.className = 'bud ' + (i % 2 ? 'is-left' : 'is-right');
      bud.href = '#' + panel.id;
      bud.style.setProperty('--i', i);
      bud.innerHTML = '<span class="bud-dot"></span><span class="bud-label"></span>';
      bud.lastChild.textContent = panel.querySelector('h2').textContent;
      function hot(on) { limb.classList.toggle('is-hot', on); root.classList.toggle('is-hot', on); }
      bud.addEventListener('pointerenter', function () { hot(true); });
      bud.addEventListener('pointerleave', function () { hot(false); });
      bud.addEventListener('focus', function () { hot(true); });
      bud.addEventListener('blur', function () { hot(false); });
      tree.appendChild(bud);
      limbs.push(limb); roots.push(root); buds.push(bud);
    });
    document.body.appendChild(tree);

    caption = document.createElement('p');
    caption.className = 'zoom-caption';
    caption.setAttribute('aria-hidden', 'true');
    document.body.appendChild(caption);

    fib.onframe = layoutTree;
    window.addEventListener('resize', measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    measure();

    // Grow the branches in once the first frame is up
    requestAnimationFrame(function () { requestAnimationFrame(function () { tree.classList.add('is-ready'); }); });
  }

  // On narrow screens the name block owns the top and the footer the bottom,
  // so the tree is laid out in what's left. Labels are re-measured for the branch lengths.
  function measure() {
    var hero = document.querySelector('.hero');
    var narrow = window.innerWidth <= 860;
    fib.reserve.top = narrow && hero ? hero.getBoundingClientRect().bottom + 6 : 0;
    fib.reserve.bottom = narrow ? 56 : 0;
    widths = buds.map(function (b) { return b.lastChild.offsetWidth; });
    var r = hero && !narrow ? hero.getBoundingClientRect() : null;
    avoid = r ? { right: r.right, top: r.top - 24, bottom: r.bottom + 24 } : null;
    fib.setStations(panels.length);
  }

  function layoutTree() {
    var W = window.innerWidth, H = window.innerHeight, M = 18;
    for (var i = 0; i < panels.length; i++) {
      var pt = fib.project(i);
      var side = i % 2 ? -1 : 1;
      // v: perpendicular to the trunk, pointing to this branch's side; u: along it, toward the top
      var vx = -pt.uy * side, vy = pt.ux * side;
      // Keep left-hand labels clear of the name block when they sit at its height
      var edge = M;
      if (side < 0 && avoid && pt.y > avoid.top - 60 && pt.y < avoid.bottom + 60) edge = avoid.right + 28;
      var room = (side > 0 ? W - M - pt.x : pt.x - edge) - (widths[i] || 90) - 16;
      var pref = Math.max(70, Math.min(W * 0.22, 300)) * (0.82 + 0.36 * ((i * 0.618) % 1));
      var L = Math.max(34, Math.min(pref, room));
      var rise = Math.min(0.3 * L, Math.max(0, pt.y - 40));
      var ex = pt.x + vx * L + pt.ux * rise;
      var ey = Math.max(34, Math.min(H - 34, pt.y + vy * L + pt.uy * rise));
      var c1x = pt.x + vx * L * 0.55, c1y = pt.y + vy * L * 0.55;
      var c2x = ex - vx * L * 0.3, c2y = ey - vy * L * 0.3 - rise * 0.2;
      limbs[i].setAttribute('d', 'M' + f(pt.x) + ' ' + f(pt.y) + 'C' + f(c1x) + ' ' + f(c1y) + ',' + f(c2x) + ' ' + f(c2y) + ',' + f(ex) + ' ' + f(ey));
      roots[i].setAttribute('cx', f(pt.x));
      roots[i].setAttribute('cy', f(pt.y));
      buds[i].style.transform = 'translate3d(' + f(ex) + 'px,' + f(ey) + 'px,0)';
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
