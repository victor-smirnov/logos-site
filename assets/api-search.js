// API search: filters the [path, kind] index generated at build time.
// The index is fetched lazily on first focus; everything runs in the browser.
(function () {
  'use strict';
  var input = document.getElementById('api-search-input');
  var list = document.getElementById('api-search-results');
  if (!input || !list) return;

  var indexPromise = null; // cache the PROMISE, not the result — otherwise every
  var selected = -1;       // keystroke while the fetch is in flight starts another one

  function load() {
    if (!indexPromise) {
      indexPromise = fetch('/api/search-index.json')
        .then(function (r) { return r.json(); })
        .catch(function () { return []; });
    }
    return indexPromise;
  }

  // logos.lang.option.Option        → /api/logos.lang.option/#Option
  // logos.lang.option.Option::unwrap → /api/logos.lang.option/#Option.unwrap
  function urlOf(path) {
    var parts = path.split('::');
    var top = parts[0];
    var ns = top.slice(0, top.lastIndexOf('.'));
    var leaf = top.slice(top.lastIndexOf('.') + 1);
    var anchor = parts[1] ? leaf + '.' + parts[1] : leaf;
    return '/api/' + ns + '/#' + anchor;
  }

  function nameOf(path) {
    var parts = path.split('::');
    if (parts[1]) {
      var top = parts[0];
      return top.slice(top.lastIndexOf('.') + 1) + '::' + parts[1];
    }
    return path.slice(path.lastIndexOf('.') + 1);
  }

  // Rank: exact leaf match, leaf prefix, leaf substring, then full-path
  // substring. For members the leaf is the part after `::` (so `unwrap`
  // exact-matches `Result::unwrap`); the display name is checked too, letting
  // `result::unw` style queries narrow by parent.
  function score(path, q) {
    var display = nameOf(path).toLowerCase();
    var leaf = display.indexOf('::') !== -1 ? display.slice(display.indexOf('::') + 2) : display;
    if (leaf === q || display === q) return 0;
    if (leaf.indexOf(q) === 0) return 1;
    if (leaf.indexOf(q) > 0 || display.indexOf(q) !== -1) return 2;
    if (path.toLowerCase().indexOf(q) !== -1) return 3;
    return -1;
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render(results, q) {
    selected = -1;
    if (!q) { list.hidden = true; list.innerHTML = ''; return; }
    if (!results.length) {
      list.innerHTML = '<li class="api-search-empty">No matches</li>';
      list.hidden = false;
      return;
    }
    list.innerHTML = results
      .map(function (r) {
        return '<li><a href="' + urlOf(r[0]) + '">' +
          '<span class="api-kind api-kind-' + r[1] + '">' + r[1] + '</span>' +
          '<span class="api-search-name">' + esc(nameOf(r[0])) + '</span>' +
          '<span class="api-search-path">' + esc(r[0]) + '</span></a></li>';
      })
      .join('');
    list.hidden = false;
  }

  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) { render([], q); return; }
    load().then(function (idx) {
      var scored = [];
      for (var i = 0; i < idx.length; i++) {
        var s = score(idx[i][0], q);
        if (s >= 0) scored.push([s, idx[i]]);
      }
      scored.sort(function (a, b) {
        return a[0] - b[0] || a[1][0].length - b[1][0].length || (a[1][0] < b[1][0] ? -1 : 1);
      });
      render(scored.slice(0, 40).map(function (x) { return x[1]; }), q);
    });
  }

  function move(delta) {
    var items = list.querySelectorAll('li a');
    if (!items.length) return;
    selected = Math.max(0, Math.min(items.length - 1, selected + delta));
    items.forEach(function (a, i) { a.classList.toggle('selected', i === selected); });
    items[selected].scrollIntoView({ block: 'nearest' });
  }

  var debounce = null;
  input.addEventListener('focus', load);
  input.addEventListener('input', function () {
    clearTimeout(debounce);
    var q = input.value;
    debounce = setTimeout(function () { search(q); }, 80);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      var sel = list.querySelector('li a.selected') || list.querySelector('li a');
      if (sel) location.href = sel.href;
    } else if (e.key === 'Escape') {
      input.value = ''; render([], '');
      input.blur();
    }
  });
  // "/" focuses search from anywhere on API pages.
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input &&
        !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });
  // Click outside closes the dropdown.
  document.addEventListener('click', function (e) {
    if (!list.contains(e.target) && e.target !== input) { list.hidden = true; }
  });
})();
