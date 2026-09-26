/* ==========================================================================
   Panel router: #about, #research, … open the matching <article class="panel">
   as an overlay. Back/forward, Esc, and clicking the backdrop all close it.
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
    countUp(panel);
  }

  function hide() {
    if (!current) return;
    current.classList.remove('is-active');
    current = null;
    body.classList.remove('is-panel-open');
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

  // Click on the dimmed backdrop (not the card) closes
  container.addEventListener('click', function (e) {
    if (e.target === container) closePanel();
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
