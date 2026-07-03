// Logos site — a tiny, dependency-light static site generator.
//
// Pipeline: content/**/*.md  --(front-matter + markdown-it)-->  templated HTML in dist/.
// Also copies assets/ and static/ verbatim. Run `node build.mjs` to build,
// `node build.mjs --serve` to build + preview on http://localhost:4321.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import hljs from 'highlight.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(ROOT, 'content');
const ASSETS = join(ROOT, 'assets');
const STATIC = join(ROOT, 'static');
const OUT = join(ROOT, 'dist');

// ── Site configuration ──────────────────────────────────────────────────────
const SITE = {
  title: 'Logos',
  tagline: 'A compiled, statically-typed systems language built AI-first.',
  url: 'https://logos-lang.dev',
  repo: 'https://github.com/victor-smirnov/logos',
  // Sidebar navigation for doc pages.
  nav: [
    {
      title: 'Guide',
      items: [
        { text: 'Getting Started', link: '/docs/getting-started/' },
        { text: 'Language Overview', link: '/docs/language-overview/' },
        { text: 'Writ: code + data', link: '/docs/writ/' },
      ],
    },
  ],
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

const md = new MarkdownIt({ html: true, linkify: true, typographer: true, highlight }).use(anchor, {
  slugify,
  permalink: anchor.permalink.linkInsideHeader({ symbol: '#', placement: 'after', ariaHidden: true }),
  level: [2, 3],
});

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

const header = (currentUrl) => `
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/"><span class="brand-mark">Λ</span><span class="brand-name">Logos</span></a>
    <nav class="top-nav">
      <a href="/docs/getting-started/"${currentUrl.startsWith('/docs/') ? ' class="active"' : ''}>Docs</a>
      <a href="${SITE.repo}" rel="noopener">GitHub</a>
    </nav>
    <div class="header-actions">
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
  <nav class="sidebar-nav">
    ${SITE.nav
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
      .join('\n    ')}
  </nav>
</aside>`;

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

const page = ({ title, description, url, layout, body, toc }) => {
  const fullTitle = url === '/' ? `${SITE.title} — ${SITE.tagline}` : `${esc(title)} · ${SITE.title}`;
  const desc = esc(description || SITE.tagline);
  const isHome = layout === 'home';
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
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE.url}${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/styles.css">
<script>${themeBoot}</script>
</head>
<body class="${isHome ? 'layout-home' : 'layout-doc'}">
${header(url)}
${
  isHome
    ? `<main class="home-main">${body}</main>`
    : `<div class="doc-shell">
${sidebar(url)}
<main class="doc-main">
<article class="doc-content">
${body}
</article>
${tocAside(toc)}
</main>
</div>`
}
${footer()}
<div class="nav-scrim" data-close-nav></div>
<script>${themeToggleJs}</script>
</body>
</html>`;
};

// ── Build ───────────────────────────────────────────────────────────────────
const build = () => {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const pages = walk(CONTENT).filter((f) => f.endsWith('.md'));
  const sitemap = [];
  for (const src of pages) {
    const srcRel = relative(CONTENT, src).replaceAll('\\', '/');
    const raw = readFileSync(src, 'utf8');
    const { data, content } = matter(raw);
    const { outFile, url, indexable } = routeFor(srcRel);
    const layout = data.layout || 'doc';
    const rendered = md.render(content);
    const toc = layout === 'doc' && data.toc !== false ? extractToc(rendered) : [];
    const body =
      layout === 'doc' && data.title
        ? `<h1 class="doc-title">${esc(data.title)}</h1>\n${rendered}`
        : rendered;
    const html = page({ title: data.title || SITE.title, description: data.description, url, layout, body, toc });
    const dest = join(OUT, outFile);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, html);
    if (indexable) sitemap.push(url);
    console.log(`  ${srcRel}  →  ${outFile}`);
  }

  // Static passthrough + assets.
  if (existsSync(ASSETS)) cpSync(ASSETS, join(OUT, 'assets'), { recursive: true });
  if (existsSync(STATIC)) cpSync(STATIC, OUT, { recursive: true });

  // sitemap.xml
  const urlset = sitemap
    .sort()
    .map((u) => `  <url><loc>${SITE.url}${u}</loc></url>`)
    .join('\n');
  writeFileSync(
    join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlset}\n</urlset>\n`
  );

  console.log(`\n✓ Built ${pages.length} page(s) → dist/`);
};

// ── Optional dev server ─────────────────────────────────────────────────────
const serve = async () => {
  const { createServer } = await import('node:http');
  const mime = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
    '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  };
  const port = 4321;
  createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let file = join(OUT, p);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) file = join(OUT, p, 'index.html');
    if (!existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  }).listen(port, () => console.log(`\n➜  Preview: http://localhost:${port}`));
};

build();
if (process.argv.includes('--serve')) await serve();
