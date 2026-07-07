// Logos site — a tiny, dependency-light static site generator.
//
// Pipeline: content/**/*.md  --(front-matter + markdown-it)-->  templated HTML in dist/.
// Also copies assets/ and static/ verbatim. Run `node build.mjs` to build,
// `node build.mjs --serve` to build + preview on http://localhost:4321.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync, watch, renameSync } from 'node:fs';
import { dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import hljs from 'highlight.js';
import katexModule from '@vscode/markdown-it-katex';
import { buildApiPages } from './apidocs.mjs';
import { buildSpecPages } from './specdocs.mjs';

// CJS/ESM interop: the plugin function may sit one or two `.default` levels deep.
const katexPlugin = katexModule.default?.default ?? katexModule.default ?? katexModule;

const ROOT = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(ROOT, 'content');
const ASSETS = join(ROOT, 'assets');
const STATIC = join(ROOT, 'static');
const DATA_API = join(ROOT, 'data/api');
const DATA_SPEC = join(ROOT, 'data/spec');
const OUT = join(ROOT, 'dist');

// ── Site configuration ──────────────────────────────────────────────────────
const SITE = {
  title: 'Logos',
  tagline: 'A compiled, statically-typed systems language built AI-first.',
  url: 'https://logos-lang.dev',
  repo: 'https://github.com/victor-smirnov/logos',
  // Sidebar navigation for /docs/ pages.
  nav: [
    {
      title: 'Guide',
      items: [
        { text: 'Introduction', link: '/docs/introduction/' },
        { text: 'Getting Started', link: '/docs/getting-started/' },
        { text: 'lforge', link: '/docs/lforge/' },
      ],
    },
  ],
  // Language-feature sections. Each is its own top-menu entry (like Stdlib),
  // lives under /<seg>/…, and carries its own left sidebar of sub-pages. The
  // top-menu link points at the section's first page.
  features: [
    {
      seg: 'writ', text: 'Writ',
      nav: [{ title: 'Writ', items: [
        { text: 'Introduction', link: '/writ/introduction/' },
        { text: 'Tutorial', link: '/writ/tutorial/' },
        { text: 'Reference', link: '/writ/reference/' },
        { text: 'TinyObjectMap', link: '/writ/tinyobjectmap/' },
        { text: 'Zoned Memory', link: '/writ/zoned-memory/' },
      ] }],
    },
    {
      seg: 'metacall', text: 'Metacall',
      nav: [{ title: 'Metacall', items: [
        { text: 'Introduction', link: '/metacall/introduction/' },
        { text: 'Tutorial', link: '/metacall/tutorial/' },
        { text: 'Reference', link: '/metacall/reference/' },
      ] }],
    },
    {
      seg: 'deem', text: 'Deem',
      nav: [{ title: 'Deem', items: [
        { text: 'Introduction', link: '/deem/introduction/' },
        { text: 'Tutorial', link: '/deem/tutorial/' },
        { text: 'Reference', link: '/deem/reference/' },
      ] }],
    },
    {
      seg: 'trama', text: 'Trama',
      nav: [{ title: 'Trama', items: [
        { text: 'Introduction', link: '/trama/introduction/' },
        { text: 'Tutorial', link: '/trama/tutorial/' },
        { text: 'Reference', link: '/trama/reference/' },
      ] }],
    },
    {
      seg: 'hest', text: 'Hest',
      nav: [{ title: 'Hest', items: [
        { text: 'Introduction', link: '/hest/introduction/' },
        { text: 'LCM — Compute Model', link: '/hest/lcm/' },
      ] }],
    },
  ],
};

// The left-sidebar nav for a page URL: a feature section when the URL's first
// path segment names one, otherwise the default /docs/ guide nav.
const navForUrl = (url) => {
  const seg = url.split('/')[1];
  const feat = SITE.features.find((f) => f.seg === seg);
  return feat ? feat.nav : SITE.nav;
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slugify = (s) =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // drop punctuation incl. curly quotes
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

// Highlight.js aliases `logos` to the Rust grammar — the surface syntax is
// Rust-like, so this gives accurate-enough highlighting for free.
const highlight = (code, lang) => {
  const language = lang === 'logos' ? 'rust' : lang;
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch { /* fall through */ }
  }
  return esc(code);
};

// A paragraph consisting of ONLY a YouTube/Vimeo URL becomes a responsive embed.
const videoEmbed = (mdIt) => {
  const YT = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,20})(?:[&?#]\S*)?$/;
  const VIMEO = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:[?#]\S*)?$/;
  mdIt.core.ruler.push('video_embed', (state) => {
    const toks = state.tokens;
    for (let i = 0; i + 2 < toks.length; i++) {
      if (toks[i].type !== 'paragraph_open' || toks[i + 1].type !== 'inline' || toks[i + 2].type !== 'paragraph_close') continue;
      const raw = toks[i + 1].content.trim();
      let m, src;
      if ((m = raw.match(YT))) src = `https://www.youtube-nocookie.com/embed/${m[1]}`;
      else if ((m = raw.match(VIMEO))) src = `https://player.vimeo.com/video/${m[1]}`;
      else continue;
      const t = new state.Token('html_block', '', 0);
      t.content = `<div class="video-embed"><iframe src="${src}" title="Embedded video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>\n`;
      toks.splice(i, 3, t);
    }
  });
};

const md = new MarkdownIt({ html: true, linkify: true, typographer: true, highlight })
  .use(anchor, {
    slugify,
    permalink: anchor.permalink.linkInsideHeader({ symbol: '#', placement: 'after', ariaHidden: true }),
    level: [2, 3],
  })
  .use(katexPlugin, { throwOnError: false }) // GitHub-style $...$ and $$...$$
  .use(videoEmbed);

// typographer=true enables two core rules: 'smartquotes' (keep — curly quotes)
// and 'replacements' (drop — its `+-`→± mangles "C++-class", and (c)/(tm)/--
// substitutions are unwanted on a programming-language site).
md.disable('replacements');

// Extract an on-page table of contents from the RENDERED html — ids are then
// guaranteed to match the anchors emitted for the headings.
const extractToc = (html) => {
  const toc = [];
  const re = /<h([23])\b[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(html))) {
    const text = m[3]
      .replace(/<a class="header-anchor"[\s\S]*?<\/a>/g, '') // drop the "#" permalink
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    toc.push({ level: Number(m[1]), slug: m[2], text });
  }
  return toc;
};

// Recursively list files under a directory.
const walk = (dir) => {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
};

// Map a content path to { outFile, url, indexable }.
const routeFor = (srcRel) => {
  const noExt = srcRel.slice(0, -extname(srcRel).length); // strip .md
  if (noExt === 'index') return { outFile: 'index.html', url: '/', indexable: true };
  if (noExt === '404') return { outFile: '404.html', url: '/404', indexable: false };
  if (noExt.endsWith('/index')) {
    const d = noExt.slice(0, -'/index'.length);
    return { outFile: `${d}/index.html`, url: `/${d}/`, indexable: true };
  }
  return { outFile: `${noExt}/index.html`, url: `/${noExt}/`, indexable: true };
};

// ── Templates ───────────────────────────────────────────────────────────────
const themeBoot = `(function(){try{var t=localStorage.getItem('theme');if(t){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

const themeToggleJs = `
(function(){
  var btn=document.getElementById('theme-toggle');if(!btn)return;
  function cur(){return document.documentElement.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}
  btn.addEventListener('click',function(){
    var next=cur()==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme',next);
    try{localStorage.setItem('theme',next);}catch(e){}
  });
  var menu=document.getElementById('menu-toggle');
  if(menu){menu.addEventListener('click',function(){document.body.classList.toggle('nav-open');});}
  function closeNav(){document.body.classList.remove('nav-open');}
  var scrim=document.querySelector('[data-close-nav]');
  if(scrim){scrim.addEventListener('click',closeNav);}
  document.querySelectorAll('.sidebar-nav a').forEach(function(a){a.addEventListener('click',closeNav);});
})();
`;

// Top-level site links — single source for the desktop bar and the mobile drawer.
const topLinks = (currentUrl) => [
  { href: '/docs/getting-started/', text: 'Docs', active: currentUrl.startsWith('/docs/') },
  { href: '/spec/', text: 'Spec', active: currentUrl.startsWith('/spec/') },
  ...SITE.features.map((f) => ({ href: f.nav[0].items[0].link, text: f.text, active: currentUrl.startsWith('/' + f.seg + '/') })),
  { href: '/api/', text: 'Stdlib', active: currentUrl.startsWith('/api/') },
  { href: '/blog/', text: 'Blog', active: currentUrl.startsWith('/blog') },
];

// Sidebar nav-group list HTML — shared by the desktop sidebar and mobile drawer.
const navGroupsHtml = (groups, currentUrl) =>
  groups
    .map(
      (group) => `
    <div class="nav-group">
      <p class="nav-group-title">${esc(group.title)}</p>
      <ul>
        ${group.items
          .map(
            (it) =>
              `<li><a href="${it.link}"${it.link === currentUrl ? ' class="active" aria-current="page"' : ''}>${esc(it.text)}</a></li>`
          )
          .join('\n        ')}
      </ul>
    </div>`
    )
    .join('\n    ');

const header = (currentUrl) => `
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/"><span class="brand-mark">Λ</span><span class="brand-name">Logos</span></a>
    <nav class="top-nav">
      ${topLinks(currentUrl).map((l) => `<a href="${l.href}"${l.active ? ' class="active"' : ''}>${esc(l.text)}</a>`).join('\n      ')}
    </nav>
    <div class="header-actions">
      <a href="${SITE.repo}" class="icon-btn" aria-label="GitHub repository" title="GitHub" rel="noopener" target="_blank">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/></svg>
      </a>
      <button id="theme-toggle" class="icon-btn" aria-label="Toggle theme" title="Toggle theme">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/></svg>
      </button>
      <button id="menu-toggle" class="icon-btn menu-only" aria-label="Toggle menu" title="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
    </div>
  </div>
</header>`;

const sidebar = (currentUrl) => `
<aside class="sidebar">
  <nav class="sidebar-nav">${navGroupsHtml(navForUrl(currentUrl), currentUrl)}
  </nav>
</aside>`;

// Mobile slide-in drawer: a fixed element directly under <body> (NOT the flex
// sidebar — WebKit/iOS ignores transform on a position:fixed flex item, so the
// old approach never slid on Safari). Carries the top-level nav on every page,
// plus this page's section nav (search box stripped to avoid duplicate ids).
// Populated by build() from buildSpecPages — the spec doc list, so the drawer's
// Spec section is filled on EVERY page (not only while inside /spec/).
let specDrawerNav = [];

const searchWidget = (kind) => `<div class="api-search" data-search="${kind}">
        <input type="search" placeholder="${kind === 'spec' ? 'Search rules…' : 'Search API…'}" autocomplete="off" spellcheck="false" aria-label="Search">
        <ul class="${kind}-search-results" hidden></ul>
      </div>`;

const mobileDrawer = ({ url, sidebarHtml }) => {
  const seg = url.split('/')[1];
  // The current api/stdlib page's own left nav (search stripped, unwrapped),
  // injected under its header only while you're inside it (big flat sections).
  const currentSectionNav = sidebarHtml
    ? sidebarHtml
        .replace(/<div class="[a-z-]*search"[\s\S]*?<\/div>/i, '')
        .replace(/^[\s\S]*?<nav class="sidebar-nav">/, '')
        .replace(/<\/nav>\s*<\/aside>\s*$/, '')
    : '';

  // One row per section, in bar order. `items` render inline so any sub-page is
  // pickable from anywhere. Spec carries its (small) doc list + its search on
  // every page; Stdlib is large, so it stays a link and injects its nav + search
  // only while you're inside it.
  const sections = [
    { seg: 'docs', label: 'Docs', href: '/docs/getting-started/', items: SITE.nav.flatMap((g) => g.items) },
    { seg: 'spec', label: 'Spec', href: '/spec/', items: specDrawerNav, search: 'spec' },
    ...SITE.features.map((f) => ({ seg: f.seg, label: f.text, href: f.nav[0].items[0].link, items: f.nav.flatMap((g) => g.items) })),
    { seg: 'api', label: 'Stdlib', href: '/api/', items: null, search: 'api' },
    { seg: 'blog', label: 'Blog', href: '/blog/', items: null },
  ];

  const renderSection = (s) => {
    const active = seg === s.seg;
    let inner = '';
    if (s.search === 'spec') inner += `\n      ${searchWidget('spec')}`; // always searchable
    else if (s.search === 'api' && active) inner += `\n      ${searchWidget('api')}`; // searchable while inside
    if (s.items && s.items.length) {
      inner += `\n      <ul>${s.items
        .map((it) => `<li><a href="${it.link}"${it.link === url ? ' class="active" aria-current="page"' : ''}>${esc(it.text)}</a></li>`)
        .join('')}</ul>`;
    } else if (active && currentSectionNav) {
      inner += `\n      <div class="m-subnav">${currentSectionNav}</div>`;
    }
    return `<div class="nav-group m-section">
      <a class="m-section-title${active ? ' active' : ''}" href="${s.href}">${esc(s.label)}</a>${inner}
    </div>`;
  };

  return `<aside class="mobile-drawer" aria-label="Site menu">
  <nav class="sidebar-nav">
    ${sections.map(renderSection).join('\n    ')}
    <div class="nav-group m-section"><a class="m-section-title" href="${SITE.repo}" rel="noopener" target="_blank">GitHub ↗</a></div>
  </nav>
</aside>`;
};

const tocAside = (toc) =>
  toc.length
    ? `
<aside class="toc">
  <p class="toc-title">On this page</p>
  <ul>
    ${toc.map((h) => `<li class="toc-l${h.level}"><a href="#${h.slug}">${esc(h.text)}</a></li>`).join('\n    ')}
  </ul>
</aside>`
    : '';

const footer = () => `
<footer class="site-footer">
  <div class="footer-inner">
    <p>© 2026 The Logos Project · <a href="${SITE.repo}" rel="noopener">Source on GitHub</a></p>
    <p class="footer-muted">Built with a hand-rolled static generator. No framework was harmed.</p>
  </div>
</footer>`;

const page = ({ title, description, url, layout, body, toc, postMeta, sidebarHtml }) => {
  const fullTitle = url === '/' ? `${SITE.title} — ${SITE.tagline}` : `${esc(title)} · ${SITE.title}`;
  const desc = esc(description || SITE.tagline);
  // KaTeX renders at build time; ship its CSS only on pages that used math.
  const katexCss = body.includes('class="katex') ? '\n<link rel="stylesheet" href="/assets/katex/katex.min.css">' : '';

  let main;
  if (layout === 'home') {
    main = `<main class="home-main">${body}</main>`;
  } else if (layout === 'post') {
    main = `<main class="post-main">
<article class="doc-content post-content">
<p class="post-meta"><a href="/blog/">← Blog</a><span>·</span><time datetime="${postMeta.iso}">${postMeta.dateStr}</time><span>·</span>${postMeta.readMins} min read</p>
<h1 class="doc-title">${esc(title)}</h1>
${body}
</article>
</main>`;
  } else if (layout === 'blog-index') {
    main = `<main class="post-main">${body}</main>`;
  } else {
    // 'doc' uses the SITE.nav sidebar; 'api' brings its own (namespaces).
    // The inline script right after the sidebar restores its scroll position
    // BEFORE first paint (every click is a full navigation, which would
    // otherwise reset the list to the top); keyed per section so /docs and
    // /api remember independent positions. Fresh entries (deep link, search)
    // center the active item instead.
    main = `<div class="doc-shell">
${sidebarHtml ?? sidebar(url)}
<div class="sb-resizer" aria-hidden="true" title="Drag to resize · double-click to reset"></div>
<script>(function(){
var sb=document.querySelector('.sidebar');if(!sb)return;
var sec=location.pathname.split('/')[1];
var key='sb-scroll:'+sec,wkey='sb-width:'+sec;
// restore user-chosen width (localStorage) and scroll position (sessionStorage)
// synchronously, before first paint
function setW(px){sb.style.width=px+'px';sb.style.maxWidth='none';sb.style.flex='0 0 auto';}
try{var w=localStorage.getItem(wkey);if(w)setW(+w);}catch(e){}
try{
var saved=sessionStorage.getItem(key);
if(saved!==null){sb.scrollTop=+saved;}
else{var a=sb.querySelector('.sidebar-nav a.active');if(a)sb.scrollTop=Math.max(0,a.offsetTop-sb.clientHeight/2);}
}catch(e){}
sb.addEventListener('scroll',function(){try{sessionStorage.setItem(key,sb.scrollTop)}catch(e){}},{passive:true});
// full-name tooltip for truncated entries — custom (500ms; native title delay
// is ~1s and not tunable). Truncation is checked at hover time.
var tipEl=null,tipTimer=null;
function showTip(a){
if(!tipEl){tipEl=document.createElement('div');tipEl.className='sb-tip';document.body.appendChild(tipEl);}
tipEl.textContent=a.textContent.trim();
tipEl.style.display='block';
var r=a.getBoundingClientRect();
tipEl.style.left=Math.max(8,Math.min(r.left+8,innerWidth-tipEl.offsetWidth-8))+'px';
tipEl.style.top=(r.bottom+4)+'px';
}
function hideTip(){clearTimeout(tipTimer);tipTimer=null;if(tipEl)tipEl.style.display='none';}
sb.addEventListener('mouseover',function(e){
var a=e.target.closest('.sidebar-nav a');if(!a)return;
if(a.scrollWidth<=a.clientWidth+1)return;
clearTimeout(tipTimer);
tipTimer=setTimeout(function(){showTip(a)},500);
});
sb.addEventListener('mouseout',function(e){if(e.target.closest('.sidebar-nav a'))hideTip();});
sb.addEventListener('scroll',hideTip,{passive:true});
document.addEventListener('click',hideTip,true);
// drag-to-resize; double-click resets to auto width
var rz=document.querySelector('.sb-resizer');
if(rz){
rz.addEventListener('pointerdown',function(e){
e.preventDefault();rz.setPointerCapture(e.pointerId);rz.classList.add('dragging');
document.body.style.userSelect='none';
var left=sb.getBoundingClientRect().left;
function mv(ev){setW(Math.min(Math.max(ev.clientX-left,180),Math.floor(innerWidth*0.5)));}
function up(){rz.classList.remove('dragging');document.body.style.userSelect='';
rz.removeEventListener('pointermove',mv);rz.removeEventListener('pointerup',up);
try{localStorage.setItem(wkey,Math.round(sb.getBoundingClientRect().width))}catch(e2){}}
rz.addEventListener('pointermove',mv);rz.addEventListener('pointerup',up);
});
rz.addEventListener('dblclick',function(){sb.style.width='';sb.style.maxWidth='';sb.style.flex='';try{localStorage.removeItem(wkey)}catch(e){}});
}
})();</script>
<main class="doc-main">
<article class="doc-content${layout === 'api' ? ' api-content' : ''}${layout === 'spec' ? ' spec-content' : ''}">
${body}
</article>
${tocAside(toc)}
</main>
</div>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${SITE.url}${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="${layout === 'post' ? 'article' : 'website'}">
<meta property="og:url" content="${SITE.url}${url}">
<link rel="alternate" type="application/rss+xml" title="${SITE.title} Blog" href="/blog/rss.xml">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/styles.css">${katexCss}
<script src="/assets/spec-search.js" defer></script>${layout === 'api' ? '\n<script src="/assets/api-search.js" defer></script>' : ''}
<script>${themeBoot}</script>
</head>
<body class="layout-${layout}">
${header(url)}
${mobileDrawer({ url, sidebarHtml })}
${main}
${footer()}
<div class="nav-scrim" data-close-nav></div>
<script>${themeToggleJs}</script>
</body>
</html>`;
};

// ── Build ───────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

const build = () => {
  // Render into a temp dir and swap at the very end: a build that throws
  // mid-way must never leave dist/ half-written — the dev server keeps
  // serving the last good build instead.
  const tmp = `${OUT}.tmp`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  const pages = walk(CONTENT).filter((f) => f.endsWith('.md'));
  const sitemap = [];
  const posts = [];

  // Spec is built up front so its doc list is available to the mobile drawer on
  // every page (the Spec section is populated everywhere, not just under /spec/).
  const spec = buildSpecPages(DATA_SPEC);
  specDrawerNav = spec.navItems || [];

  for (const src of pages) {
    const srcRel = relative(CONTENT, src).replaceAll('\\', '/');
    const raw = readFileSync(src, 'utf8');
    const { data, content } = matter(raw);
    if (data.draft) {
      console.log(`  ${srcRel}  (draft — skipped)`);
      continue;
    }
    const { outFile, url, indexable } = routeFor(srcRel);
    const isPost = srcRel.startsWith('blog/');
    const layout = data.layout || (isPost ? 'post' : 'doc');
    const rendered = md.render(content);
    const toc = layout === 'doc' && data.toc !== false ? extractToc(rendered) : [];

    let postMeta;
    if (layout === 'post') {
      if (!data.date) console.warn(`  ! ${srcRel}: no "date" in front-matter, using today`);
      const date = data.date instanceof Date ? data.date : new Date(data.date || Date.now());
      // strip inline HTML (SVG illustrations etc.) so markup doesn't inflate read time
      const readMins = Math.max(1, Math.round(content.replace(/<[^>]+>/g, ' ').split(/\s+/).length / 200));
      postMeta = { iso: date.toISOString().slice(0, 10), dateStr: fmtDate(date), readMins };
      posts.push({ title: data.title || 'Untitled', description: data.description || '', url, date, ...postMeta });
    }

    const body =
      layout === 'doc' && data.title
        ? `<h1 class="doc-title">${esc(data.title)}</h1>\n${rendered}`
        : rendered;
    const html = page({ title: data.title || SITE.title, description: data.description, url, layout, body, toc, postMeta });
    const dest = join(tmp, outFile);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, html);
    if (indexable) sitemap.push(url);
    console.log(`  ${srcRel}  →  ${outFile}`);
  }

  // Blog index (generated — no content/blog/index.md needed).
  posts.sort((a, b) => b.date - a.date);
  const blogDesc = 'Notes from building the Logos language — design, internals, releases.';
  const indexBody = `
<section class="blog-hero">
  <h1>Blog</h1>
  <p>${blogDesc}</p>
</section>
<ul class="post-list">
${posts
  .map(
    (p) => `  <li class="post-card">
    <a class="post-card-link" href="${p.url}">
      <h2>${esc(p.title)}</h2>
      <p class="post-meta"><time datetime="${p.iso}">${p.dateStr}</time><span>·</span>${p.readMins} min read</p>
      ${p.description ? `<p class="post-desc">${esc(p.description)}</p>` : ''}
    </a>
  </li>`
  )
  .join('\n')}
</ul>`;
  mkdirSync(join(tmp, 'blog'), { recursive: true });
  writeFileSync(
    join(tmp, 'blog/index.html'),
    page({ title: 'Blog', description: blogDesc, url: '/blog/', layout: 'blog-index', body: indexBody, toc: [] })
  );
  sitemap.push('/blog/');
  console.log('  (generated)  →  blog/index.html');

  // RSS feed.
  const rssItems = posts
    .map(
      (p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${SITE.url}${p.url}</link>
    <guid>${SITE.url}${p.url}</guid>
    <pubDate>${p.date.toUTCString()}</pubDate>
    <description>${esc(p.description)}</description>
  </item>`
    )
    .join('\n');
  writeFileSync(
    join(tmp, 'blog/rss.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${SITE.title} Blog</title>
  <link>${SITE.url}/blog/</link>
  <description>${blogDesc}</description>
${rssItems}
</channel>
</rss>
`
  );
  console.log('  (generated)  →  blog/rss.xml');

  // API reference (from data/api/*.json — see logos/docs/tooling/docs-json.md).
  const api = buildApiPages(DATA_API);
  for (const p of api.pages) {
    const html = page({
      title: p.title,
      description: p.description,
      url: p.url,
      layout: 'api',
      body: p.body,
      toc: p.toc,
      sidebarHtml: api.sidebar(p.url),
    });
    const dest = join(tmp, p.outFile);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, html);
    sitemap.push(p.url);
  }
  if (api.pages.length) {
    writeFileSync(join(tmp, 'api/search-index.json'), JSON.stringify(api.searchIndex));
    console.log(`  (generated)  →  api/ (${api.pages.length} pages + search index)`);
  }

  // Language spec pages (spec was built above, up front).
  for (const p of spec.pages) {
    const html = page({
      title: p.title,
      description: p.description,
      url: p.url,
      layout: 'spec',
      body: p.body,
      toc: p.toc,
      sidebarHtml: spec.sidebar(p.url),
    });
    const dest = join(tmp, p.outFile);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, html);
    sitemap.push(p.url);
  }
  if (spec.pages.length) {
    writeFileSync(join(tmp, 'spec/search-index.json'), JSON.stringify(spec.searchIndex));
    const commit = spec.meta?.commit ? ` @ ${spec.meta.commit.slice(0, 8)}` : '';
    console.log(`  (generated)  →  spec/ (${spec.pages.length} pages, ${spec.searchIndex.length} rules${commit})`);
  }

  // Static passthrough + assets.
  if (existsSync(ASSETS)) cpSync(ASSETS, join(tmp, 'assets'), { recursive: true });
  if (existsSync(STATIC)) cpSync(STATIC, tmp, { recursive: true });

  // Self-hosted KaTeX CSS + fonts (referenced only by pages that use math).
  const katexDist = join(ROOT, 'node_modules/katex/dist');
  cpSync(join(katexDist, 'katex.min.css'), join(tmp, 'assets/katex/katex.min.css'));
  cpSync(join(katexDist, 'fonts'), join(tmp, 'assets/katex/fonts'), { recursive: true });

  // sitemap.xml
  const urlset = sitemap
    .sort()
    .map((u) => `  <url><loc>${SITE.url}${u}</loc></url>`)
    .join('\n');
  writeFileSync(
    join(tmp, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlset}\n</urlset>\n`
  );

  // Everything rendered — swap the new build in.
  rmSync(OUT, { recursive: true, force: true });
  renameSync(tmp, OUT);
  buildSerial++;

  console.log(`\n✓ Built ${pages.length} page(s) → dist/`);
};

// ── Dev mode (--serve): serve dist/, watch sources, live-reload ─────────────
// Live reload is POLLING, deliberately not SSE/WebSocket: a persistent
// connection per page is retained by Chrome's back/forward cache, so ~5
// sidebar clicks exhausted the browser's 6-connections-per-origin pool and
// the next navigation stalled for tens of seconds. Short-lived /__version
// fetches (1/s, visible tabs only) cannot starve the pool by construction.
// The client script is injected at SERVE time only — files on disk in dist/
// stay identical to what CI deploys.
let buildSerial = 0; // bumped after every successful build()

const devReloadScript = () => `<script>(function(){
var v0=${buildSerial};
function check(){fetch('/__version',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){if(d.v!==v0)location.reload()}).catch(function(){})}
setInterval(function(){if(!document.hidden)check()},1000);
window.addEventListener('pageshow',function(e){if(e.persisted)check()});
})();</script>`;

const rebuild = (reason) => {
  console.log(`\n↻ ${reason} — rebuilding…`);
  try {
    build();
  } catch (e) {
    console.error(`✗ build failed — still serving the last good build: ${e.message}`);
  }
};

const watchSources = () => {
  let timer; // one shared debounce: a multi-file save triggers a single rebuild
  const onChange = (dir) => (_evt, fname) => {
    clearTimeout(timer);
    timer = setTimeout(() => rebuild(`${relative(ROOT, dir)}/${fname ?? ''} changed`), 120);
  };
  for (const dir of [CONTENT, ASSETS, STATIC, DATA_API, DATA_SPEC]) {
    if (existsSync(dir)) watch(dir, { recursive: true }, onChange(dir));
  }
  // The generator itself can't hot-swap into a running process.
  watch(fileURLToPath(import.meta.url), () => {
    console.log('! build.mjs changed — restart the dev server (Ctrl+C, npm run dev) to pick it up');
  });
};

const serve = async () => {
  const { createServer } = await import('node:http');
  const mime = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
    '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml',
  };
  const port = Number(process.env.PORT || process.argv.find((a) => a.startsWith('--port='))?.slice(7) || 4321);
  const server = createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/__version') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ v: buildSerial }));
      return;
    }
    let file = join(OUT, p);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) file = join(OUT, p, 'index.html');
    let status = 200;
    if (!existsSync(file)) {
      file = join(OUT, '404.html');
      status = 404;
      if (!existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
    }
    if (file.endsWith('.html')) {
      const html = readFileSync(file, 'utf8').replace('</body>', `${devReloadScript()}</body>`);
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    res.writeHead(status, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`✗ port ${port} is busy — another dev server running? Try: PORT=${port + 1} npm run dev`);
      process.exit(1);
    }
    throw e;
  });
  server.listen(port, () => console.log(`\n➜  Preview: http://localhost:${port}  (watching content/, assets/, static/)`));
};

if (process.argv.includes('--serve')) {
  try {
    build();
  } catch (e) {
    console.error(`✗ initial build failed: ${e.message}`); // keep serving; fix + save triggers rebuild
  }
  watchSources();
  await serve();
} else {
  build();
}
