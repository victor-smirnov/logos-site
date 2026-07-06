// API-reference renderer: consumes docs.json files (see the spec at
// logos/docs/tooling/docs-json.md, schema_version 1) from data/api/ and
// produces page bodies for build.mjs to wrap in the site template.
//
// The three stdlib docs.json files overlap: each module is compiled with its
// dependencies, so mem.json re-emits lang's items and std.json most of both —
// with RICHER cross-refs (implementors gathered across modules), yet ~90 items
// (compiler-support internals) appear only in lang.json. We therefore MERGE at
// item level: files load in dependency order and later files overwrite matching
// paths, giving the union with the richest available version of every item.
// Display grouping (lang/mem/std) comes from the path prefix, not the files.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import katexModule from '@vscode/markdown-it-katex';

const katexPlugin = katexModule.default?.default ?? katexModule.default ?? katexModule;

const SCHEMA_VERSION = 1;
// Dependency & display order; filename (minus .json) must match.
const MODULE_ORDER = ['lang', 'mem', 'std'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const highlight = (code, lang) => {
  const language = lang === 'logos' ? 'rust' : lang;
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch { /* fall through */ }
  }
  return esc(code);
};

// Doc bodies get their own markdown instance: same features as site prose but
// WITHOUT the anchor plugin (headings inside item docs must not mint page-level
// ids — hundreds of items per page would collide).
const mdDoc = new MarkdownIt({ html: true, linkify: true, typographer: true, highlight })
  .use(katexPlugin, { throwOnError: false });
mdDoc.disable('replacements'); // same rationale as the site pipeline: keep ++, --, (c) literal

const sig = (s) => `<pre class="api-sig"><code>${highlight(s, 'logos')}</code></pre>`;

const KIND_GROUPS = [
  { title: 'Traits', kinds: ['trait'] },
  { title: 'Types', kinds: ['struct', 'enum', 'union'] },
  { title: 'Functions', kinds: ['fn'] },
];

const nsOf = (path) => path.split('.').slice(0, -1).join('.');
const groupOf = (path) => path.split('.')[1] ?? path.split('.')[0]; // logos.lang.x.Y → lang

// ── Model ───────────────────────────────────────────────────────────────────
export const loadApiModel = (dataDir) => {
  if (!existsSync(dataDir)) return null;
  const files = readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  files.sort((a, b) => {
    const ia = MODULE_ORDER.indexOf(a.replace(/\.json$/, ''));
    const ib = MODULE_ORDER.indexOf(b.replace(/\.json$/, ''));
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  if (!files.length) return null;

  const merged = new Map(); // path → item (later files overwrite: richer view)
  const pubUndocumented = new Set();
  const packages = new Map(); // group name → package label (from same-named file)
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(dataDir, f), 'utf8'));
    if (raw.schema_version !== SCHEMA_VERSION) {
      console.warn(`  ! data/api/${f}: schema_version ${raw.schema_version} (expected ${SCHEMA_VERSION}) — skipped`);
      continue;
    }
    packages.set(f.replace(/\.json$/, ''), raw.package);
    for (const i of raw.items) if (i.visibility === 'pub') merged.set(i.path, i);
    for (const p of raw.undocumented ?? []) pubUndocumented.add(p);
  }

  const items = [...merged.values()];
  const byParent = new Map();
  const topByName = new Map();
  for (const i of items) {
    if (!byParent.has(i.parent)) byParent.set(i.parent, []);
    byParent.get(i.parent).push(i);
    if (i.parent === '' && !topByName.has(i.name)) topByName.set(i.name, i);
  }

  // Display groups (lang/mem/std) from path prefixes of top-level items.
  const groupMap = new Map();
  for (const i of byParent.get('') ?? []) {
    const g = groupOf(i.path);
    if (!groupMap.has(g)) groupMap.set(g, new Map());
    const nss = groupMap.get(g);
    const ns = nsOf(i.path);
    if (!nss.has(ns)) nss.set(ns, []);
    nss.get(ns).push(i);
  }
  const groups = [...groupMap.entries()]
    .sort((a, b) => {
      const ia = MODULE_ORDER.indexOf(a[0]);
      const ib = MODULE_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a[0].localeCompare(b[0]);
    })
    .map(([name, namespaces]) => ({ name, package: packages.get(name) ?? '', namespaces }));

  return { groups, items, byParent, topByName, pubUndocumented };
};

// ── Rendering ───────────────────────────────────────────────────────────────
const nsUrl = (ns) => `/api/${ns}/`;
const itemAnchor = (item) => item.name;
const itemUrl = (item) => `${nsUrl(nsOf(item.path))}#${itemAnchor(item)}`;

// implements/implementors carry bare names (v1) — resolve across the merged model.
const xrefChips = (model, names, label) => {
  if (!names?.length) return '';
  const chips = names
    .map((n) => {
      const target = model.topByName.get(n);
      return target
        ? `<a class="api-chip" href="${itemUrl(target)}"><code>${esc(n)}</code></a>`
        : `<span class="api-chip api-chip-plain"><code>${esc(n)}</code></span>`;
    })
    .join(' ');
  return `<p class="api-xref"><span class="api-xref-label">${label}:</span> ${chips}</p>`;
};

const renderDoc = (doc) => (doc ? `<div class="api-doc">${mdDoc.render(doc)}</div>` : '');

const MEMBER_GROUPS = [
  { title: 'Variants', kinds: ['variant'] },
  { title: 'Fields', kinds: ['field'] },
  { title: 'Methods', kinds: ['method'] },
];

const renderMembers = (model, item) => {
  const members = model.byParent.get(item.path) ?? [];
  if (!members.length) return '';
  let html = '';
  for (const g of MEMBER_GROUPS) {
    const list = members.filter((m) => g.kinds.includes(m.kind)).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    html += `<p class="api-member-group">${g.title}</p>\n`;
    for (const m of list) {
      html += `<div class="api-member" id="${esc(itemAnchor(item))}.${esc(m.name)}">
${sig(m.signature)}
${renderDoc(m.doc)}
</div>\n`;
    }
  }
  return html;
};

const renderTopItem = (model, item) => `
<section class="api-item" id="${esc(itemAnchor(item))}">
<h3 class="api-item-head"><span class="api-kind api-kind-${item.kind}">${item.kind}</span><a href="#${esc(itemAnchor(item))}">${esc(item.name)}</a></h3>
${sig(item.signature)}
${renderDoc(item.doc)}
${xrefChips(model, item.implements, 'Implements')}
${xrefChips(model, item.implementors, 'Implemented by')}
${renderMembers(model, item)}
</section>`;

const renderNamespacePage = (model, group, ns, tops) => {
  let body = '';
  const toc = [];
  for (const g of KIND_GROUPS) {
    const list = tops.filter((i) => g.kinds.includes(i.kind)).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    const gSlug = g.title.toLowerCase();
    body += `<h2 id="${gSlug}">${g.title}</h2>\n`;
    toc.push({ level: 2, slug: gSlug, text: g.title });
    for (const item of list) {
      body += renderTopItem(model, item);
      toc.push({ level: 3, slug: itemAnchor(item), text: item.name });
    }
  }
  const counts = KIND_GROUPS.map((g) => {
    const n = tops.filter((i) => g.kinds.includes(i.kind)).length;
    return n ? `${n} ${g.title.toLowerCase()}` : null;
  })
    .filter(Boolean)
    .join(', ');
  return {
    url: nsUrl(ns),
    outFile: `api/${ns}/index.html`,
    title: ns,
    description: `API reference for ${ns} — ${counts}.`,
    body: `<h1 class="doc-title api-title"><code>${esc(ns)}</code></h1>\n<p class="api-module-note">Module <strong>${esc(group.name)}</strong>${group.package ? ` · package <code>${esc(group.package)}</code>` : ''}</p>\n${body}`,
    toc,
  };
};

const renderIndexPage = (model) => {
  let body = `<h1 class="doc-title">Standard Library</h1>
<p>API reference for the Logos standard library, extracted from source doc comments. Three modules ship with the compiler:</p>\n`;
  for (const group of model.groups) {
    const tops = [...group.namespaces.values()].flat();
    const inGroup = model.items.filter((i) => groupOf(i.path) === group.name);
    const documented = inGroup.filter((i) => !model.pubUndocumented.has(i.path)).length;
    const nss = [...group.namespaces.keys()].sort();
    body += `<section class="api-module">
<h2 id="${esc(group.name)}">${esc(group.name)}</h2>
<p class="api-module-note">${group.package ? `package <code>${esc(group.package)}</code> · ` : ''}${inGroup.length} public items · ${documented} documented</p>
<ul class="api-ns-list">
${nss
  .map(
    (ns) =>
      `  <li><a href="${nsUrl(ns)}"><code>${esc(ns)}</code></a> <span class="api-ns-count">${group.namespaces.get(ns).length}</span></li>`
  )
  .join('\n')}
</ul>
</section>\n`;
  }
  return {
    url: '/api/',
    outFile: 'api/index.html',
    title: 'Standard Library',
    description: 'API reference for the Logos standard library: lang, mem, and std modules.',
    body,
    toc: model.groups.map((g) => ({ level: 2, slug: g.name, text: g.name })),
  };
};

// Compact client-side search index: an array of [path, kind] pairs. The URL is
// derived in the browser (see assets/api-search.js) — for `a.b.C` it is
// /api/a.b/#C, for `a.b.C::m` it is /api/a.b/#C.m — so we ship no URLs.
const buildSearchIndex = (model) => model.items.map((i) => [i.path, i.kind]);

export const buildApiPages = (dataDir) => {
  const model = loadApiModel(dataDir);
  if (!model) return { pages: [], sidebar: null, searchIndex: [] };

  const pages = [renderIndexPage(model)];
  for (const group of model.groups) {
    for (const ns of [...group.namespaces.keys()].sort()) {
      pages.push(renderNamespacePage(model, group, ns, group.namespaces.get(ns)));
    }
  }

  const sidebar = (currentUrl) => `
<aside class="sidebar">
  <nav class="sidebar-nav">
    <div class="api-search">
      <input id="api-search-input" type="search" placeholder="Search API…" autocomplete="off" spellcheck="false" aria-label="Search API">
      <ul id="api-search-results" hidden></ul>
    </div>
    <div class="nav-group">
      <p class="nav-group-title">API Reference</p>
      <ul><li><a href="/api/"${currentUrl === '/api/' ? ' class="active" aria-current="page"' : ''}>Overview</a></li></ul>
    </div>
    ${model.groups
      .map(
        (group) => `<div class="nav-group">
      <p class="nav-group-title">${esc(group.name)}</p>
      <ul>
        ${[...group.namespaces.keys()]
          .sort()
          .map((ns) => {
            const u = nsUrl(ns);
            return `<li><a href="${u}"${u === currentUrl ? ' class="active" aria-current="page"' : ''}><code>${esc(ns)}</code></a></li>`;
          })
          .join('\n        ')}
      </ul>
    </div>`
      )
      .join('\n    ')}
  </nav>
</aside>`;

  return { pages, sidebar, searchIndex: buildSearchIndex(model) };
};
