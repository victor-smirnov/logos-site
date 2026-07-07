// Spec search over the [ruleId, title, docSlug] index. Wires EVERY widget
// marked [data-search="spec"] — the desktop sidebar and the mobile drawer each
// have one — so search works in both. Index is fetched lazily and shared.
(function () {
  'use strict';

  var indexPromise = null;
  function load() {
    if (!indexPromise) {
      indexPromise = fetch('/spec/search-index.json')
        .then(function (r) { return r.json(); })
        .catch(function () { return []; });
    }
    return indexPromise;
  }

  function urlOf(e) { return '/spec/' + e[2] + '/#' + e[0]; }
  function leafOf(id) { var i = id.lastIndexOf('.'); return i === -1 ? id : id.slice(i + 1); }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Rank: exact id/leaf, id prefix, id substring, then title substring.
  function score(e, q) {
    var id = e[0].toLowerCase(), leaf = leafOf(id), title = e[1].toLowerCase();
    if (id === q || leaf === q) return 0;
    if (id.indexOf(q) === 0 || leaf.indexOf(q) === 0) return 1;
    if (id.indexOf(q) !== -1) return 2;
    if (title.indexOf(q) !== -1) return 3;
    return -1;
  }

  var widgets = [];

  function setup(box) {
    var input = box.querySelector('input');
    var list = box.querySelector('.spec-search-results');
    if (!input || !list) return;
    var selected = -1, debounce = null;

    function render(results, q) {
      selected = -1;
      if (!q) { list.hidden = true; list.innerHTML = ''; return; }
      if (!results.length) { list.innerHTML = '<li class="api-search-empty">No matches</li>'; list.hidden = false; return; }
      list.innerHTML = results.map(function (e) {
        return '<li><a href="' + urlOf(e) + '">' +
          '<span class="spec-search-id">' + esc(e[0]) + '</span>' +
          '<span class="spec-search-title">' + esc(e[1]) + '</span></a></li>';
      }).join('');
      list.hidden = false;
    }
    function search(q) {
      q = q.trim().toLowerCase();
      if (!q) { render([], q); return; }
      load().then(function (idx) {
        var scored = [];
        for (var i = 0; i < idx.length; i++) { var s = score(idx[i], q); if (s >= 0) scored.push([s, idx[i]]); }
        scored.sort(function (a, b) { return a[0] - b[0] || a[1][0].length - b[1][0].length || (a[1][0] < b[1][0] ? -1 : 1); });
        render(scored.slice(0, 40).map(function (x) { return x[1]; }), q);
      });
    }
    function move(d) {
      var items = list.querySelectorAll('li a'); if (!items.length) return;
      selected = Math.max(0, Math.min(items.length - 1, selected + d));
      items.forEach(function (a, i) { a.classList.toggle('selected', i === selected); });
      items[selected].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('focus', load);
    input.addEventListener('input', function () { clearTimeout(debounce); var q = input.value; debounce = setTimeout(function () { search(q); }, 80); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { var sel = list.querySelector('li a.selected') || list.querySelector('li a'); if (sel) location.href = sel.href; }
      else if (e.key === 'Escape') { input.value = ''; render([], ''); input.blur(); }
    });
    box._input = input; box._closeIfOutside = function (t) { if (!list.contains(t) && t !== input) list.hidden = true; };
    widgets.push(box);
  }

  document.querySelectorAll('.api-search[data-search="spec"]').forEach(setup);

  // "/" focuses the first visible search input
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    for (var i = 0; i < widgets.length; i++) {
      if (widgets[i]._input.offsetParent !== null) { e.preventDefault(); widgets[i]._input.focus(); return; }
    }
  });
  document.addEventListener('click', function (e) { widgets.forEach(function (w) { w._closeIfOutside(e.target); }); });
})();
