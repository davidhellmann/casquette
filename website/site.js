// Casquette website – progressive enhancement only (#43). Without this file the page is complete;
// with reduced motion everything is shown in its final state at once.
(function () {
  'use strict';
  window.casquetteReady = true;
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Copy buttons next to the commands (#get): hidden in the markup, shown only where copying can
  // work. A click copies the step's commands – one per line, without the prompt (CSS) and the
  // notes – shows a tick for three seconds and announces them through the status line.
  // Copying happens synchronously inside the click, through a hidden textarea and
  // execCommand('copy'): Safari, Firefox and embedded webviews allow that only while the click
  // runs, so a fallback after an async Clipboard API rejection would be too late. The Clipboard
  // API is the second try (where execCommand is gone); only if both fail are the commands selected,
  // to be copied by hand.
  function copyByCommand(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('aria-hidden', 'true');
    area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;font-size:16px';
    var focused = document.activeElement;
    document.body.appendChild(area);
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length); // iOS selects nothing with select() alone
    var done = false;
    try { done = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(area);
    // Selecting moved the focus into the textarea: give it back (keyboard users stay on the button)
    if (focused && focused.focus) focused.focus({ preventScroll: true });
    return done;
  }
  function copy(text) {
    if (copyByCommand(text)) return Promise.resolve();
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return Promise.reject(new Error('copy refused'));
  }
  var status = document.querySelector('[data-copy-status]');
  var canCopy = (navigator.clipboard && window.isSecureContext) ||
    (document.queryCommandSupported && document.queryCommandSupported('copy'));
  if (canCopy) {
    document.querySelectorAll('#get .cmd-block').forEach(function (block) {
      var button = block.querySelector('.copy');
      var lines = [].slice.call(block.querySelectorAll('.cmd-line'));
      if (!button || !lines.length) return;
      var text = lines.map(function (line) { return line.textContent.trim(); });
      var timer;
      button.hidden = false;
      button.addEventListener('click', function () {
        copy(text.join('\n')).then(function () {
          button.classList.add('copied');
          if (status) status.textContent = 'Copied: ' + text.join(', ');
          clearTimeout(timer);
          timer = setTimeout(function () {
            button.classList.remove('copied');
            if (status) status.textContent = '';
          }, 3000);
        }, function () {
          var range = document.createRange();
          range.setStartBefore(lines[0]);
          range.setEndAfter(lines[lines.length - 1]);
          var selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        });
      });
    });
  }

  // ---------- Theme switch ----------
  // Light, Dark or Auto (the system decides); Dark by default. Every choice is stored under
  // rc_site_theme – the website's own key: the app (and the demo) keeps rc_theme with Light as its
  // default. Light/Dark are put on <html> as .light/.dark (the inline script in <head> does the same
  // before the first paint).
  (function themeSwitch() {
    var group = document.querySelector('.theme-switch');
    if (!group) return;
    var root = document.documentElement;
    var buttons = [].slice.call(group.querySelectorAll('button[data-theme]'));
    var metas = [].slice.call(document.querySelectorAll('meta[name="theme-color"]'));
    var colours = metas.map(function (meta) { return meta.getAttribute('content'); });
    var isDark = function (meta) { return /dark/.test(meta.getAttribute('media') || ''); };
    function stored() {
      try { var v = localStorage.getItem('rc_site_theme'); return v === 'light' || v === 'auto' ? v : 'dark'; } catch (e) { return 'dark'; }
    }
    function apply(pref) {
      root.classList.remove('light', 'dark');
      if (pref !== 'auto') root.classList.add(pref);
      buttons.forEach(function (button) { button.setAttribute('aria-pressed', String(button.getAttribute('data-theme') === pref)); });
      // Browser chrome: per system scheme from the markup, or the chosen theme's colour for both
      var theme = pref === 'auto' ? null : pref;
      var colour = theme && colours[metas.findIndex(function (meta) { return isDark(meta) === (theme === 'dark'); })];
      metas.forEach(function (meta, i) { meta.setAttribute('content', colour || colours[i]); });
    }
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        var pref = button.getAttribute('data-theme');
        try { localStorage.setItem('rc_site_theme', pref); } catch (e) {}
        apply(pref);
      });
    });
    group.hidden = false;
    apply(stored());
  })();
  // ---------- end Theme switch ----------

  // ---------- Hero (#47) ----------
  // Fills the hero stage with the real UI fragments named in data-shot (website/ui/<name>.html),
  // sizes them, prepares the drawing lines and the calendar fill-up, then starts the stage part of
  // the intro (.is-live; the timing lives in site.css "Hero"). --late carries the seconds the
  // fragments took, so a slow load shortens the waits instead of shuffling the order. A fragment
  // that can't be loaded (e.g. the page opened from disk) leaves an empty panel; its card goes.
  (function hero() {
    var section = document.getElementById('hero');
    if (!section) return;
    var stage = section.querySelector('.hero-stage');
    var shot = section.querySelector('.hero-shot');
    var slots = [].slice.call(section.querySelectorAll('[data-shot]'));
    var live = false;

    function goLive() {
      if (live) return;
      live = true;
      section.style.setProperty('--late', (performance.now() / 1000).toFixed(2) + 's');
      section.classList.add('is-live');
    }

    // The dashboard fills the panel's width (with --pad around it, in fragment px)
    function fitDashboard() {
      var slot = shot && shot.querySelector('[data-shot]');
      var width = slot && parseFloat(slot.style.getPropertyValue('--fw'));
      if (!width) return;
      var pad = parseFloat(getComputedStyle(stage).getPropertyValue('--pad')) || 0;
      shot.style.setProperty('--s', (shot.clientWidth / (width + 2 * pad)).toFixed(4));
    }

    function insert(slot, html) {
      slot.innerHTML = html;
      var fragment = slot.querySelector('.ui-fragment');
      if (!fragment) throw new Error('no fragment');
      var box = slot.parentElement.parentElement; // .hero-shot or .hero-card: sizes its window too
      box.style.setProperty('--fw', fragment.getAttribute('data-width') + 'px');
      box.style.setProperty('--fh', fragment.getAttribute('data-height') + 'px');
      slot.style.setProperty('--fw', fragment.getAttribute('data-width') + 'px');
    }

    // Lines to draw: their length, for stroke-dasharray/-offset
    function measureLines() {
      section.querySelectorAll('path.recharts-area-curve, path.recharts-line-curve').forEach(function (path) {
        if (path.getTotalLength) path.style.setProperty('--len', Math.ceil(path.getTotalLength() + 2) + 'px');
      });
    }

    // The calendar card shows the newest weeks from the month row down: crop above it, and number
    // the visible ride days in date order for the fill-up
    function prepareCalendar() {
      var card = section.querySelector('.hero-card--calendar');
      var grid = card && card.querySelector('[role=grid]');
      if (!grid || !card.offsetParent) return;
      var fragment = card.querySelector('.ui-fragment');
      var months = grid.previousElementSibling || grid;
      var scale = parseFloat(getComputedStyle(card).getPropertyValue('--cs')) || 1;
      var crop = (months.getBoundingClientRect().top - fragment.getBoundingClientRect().top) / scale - 16;
      card.style.setProperty('--crop', Math.max(0, Math.round(crop)) + 'px');
      var edge = card.querySelector('.hero-window').getBoundingClientRect().left;
      var days = [].slice.call(grid.querySelectorAll('[role=gridcell] > [data-day]'))
        .filter(function (day) { return day.getBoundingClientRect().right > edge; })
        .sort(function (a, b) { return a.getAttribute('data-day') - b.getAttribute('data-day'); });
      days.forEach(function (day, i) { day.style.setProperty('--n', i); });
    }

    var loads = slots.map(function (slot) {
      return fetch('ui/' + slot.getAttribute('data-shot') + '.html')
        .then(function (response) {
          if (!response.ok) throw new Error(response.status);
          return response.text();
        })
        .then(function (html) { insert(slot, html); })
        .catch(function () {
          slot.innerHTML = '';
          var card = slot.closest('.hero-card');
          if (card) card.hidden = true;
        });
    });
    // Never keep the stage hidden for long, whatever the network does
    setTimeout(goLive, 3000);
    Promise.all(loads).then(function () {
      fitDashboard();
      measureLines();
      prepareCalendar();
      goLive();
    });
    if ('ResizeObserver' in window && shot) new ResizeObserver(fitDashboard).observe(shot);
    else window.addEventListener('resize', fitDashboard);
  })();
  // ---------- end Hero ----------

  // Feature sections (#48): each shot gets its real UI fragment (ui/<data-ui>.html, generated by
  // `npm run fragments`) shortly before it scrolls into view. The fragment arrives inert and
  // aria-hidden; the curves are marked for the draw animation (data-draw, pathLength=1) and the
  // calendar days get their index as --d (site.css). Without this script the shots stay empty
  // panels; the map is an image in the markup.
  var shots = [].filter.call(document.querySelectorAll('#features .feature-shot[data-ui]'), function (shot) {
    return !shot.querySelector('img.map-light');
  });
  function loadShot(shot) {
    if (shot.dataset.loaded) return;
    shot.dataset.loaded = 'loading';
    fetch('ui/' + shot.dataset.ui + '.html').then(function (response) {
      if (!response.ok) throw new Error(response.status + ' ' + response.url);
      return response.text();
    }).then(function (html) {
      shot.insertAdjacentHTML('beforeend', html);
      shot.querySelectorAll('path.recharts-line-curve, path.recharts-area-curve').forEach(function (path) {
        if (path.hasAttribute('stroke-dasharray')) return;
        path.setAttribute('pathLength', '1');
        path.setAttribute('data-draw', '');
      });
      shot.querySelectorAll('[role=grid] [data-day]').forEach(function (day) {
        day.style.setProperty('--d', day.getAttribute('data-day'));
      });
      shot.dataset.loaded = 'true';
    }).catch(function () { delete shot.dataset.loaded; });
  }
  if ('IntersectionObserver' in window) {
    var near = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        loadShot(entry.target);
        near.unobserve(entry.target);
      });
    }, { rootMargin: '100% 0px 100% 0px' });
    shots.forEach(function (shot) { near.observe(shot); });
  } else {
    shots.forEach(loadShot);
  }

  // Scroll reveal: .reveal blocks (hidden by the `js` class, site.css) get .in once they enter
  // the viewport and stay revealed.
  if (reduce || !('IntersectionObserver' in window)) {
    root.classList.remove('js');
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
})();
