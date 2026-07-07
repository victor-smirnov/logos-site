// Language-spec renderer: publishes the Logos spec (data/spec/*.md, copied from
// the logos repo by scripts/extract-spec.sh) as a /spec/ section, mirroring the
// stdlib /api/ section — per-document pages, a left sidebar, and client search.
//
// The spec's whole point is that every rule cites source: `**Source:**` /
// `*Evidence:*` lines carry `path#Lstart-Lend` references (EVIDENCE). We turn
// each into a GitHub blob link pinned to the exact commit the docs were built
// from (data/spec/meta.json), so a rule always links to the code it describes
// at the matching revision. Logos-side tooling keeps spec ↔ code in sync; the
// site just publishes and links.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import hljs from 'highlight.js';
import katexModule from '@vscode/markdown-it-katex';

const katexPlugin = katexModule.default?.default ?? katexModule.default ?? katexModule;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Reading order + short sidebar/menu titles. Files not listed here are appended
// alphabetically with a title derived from their leading `# heading`.
const SPEC_ORDER = [
  ['lexical', 'Lexical Structure'],
  ['grammar', 'Grammar'],
  ['items', 'Items'],
  ['types', 'Types & Layout'],
  ['expressions', 'Expressions'],
  ['statements', 'Statements'],
  ['patterns', 'Patterns'],
  ['traits-generics', 'Traits & Generics'],
  ['ownership', 'Ownership'],
  ['modules', 'Modules'],
  ['monomorphization', 'Monomorphization'],
  ['metaprogramming', 'Metaprogramming'],
  ['writ', 'Writ'],
  ['deem', 'Deem'],
  ['trama', 'Trama'],
  ['divergences', 'Divergences'],
  ['conformance-findings', 'Conformance Findings'],
];

const highlight = (code, lang) => {
  const language = lang === 'logos' ? 'rust' : lang;
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch { /* fall through */ }
  }
  return esc(code);
};

const genericSlug = (s) =>
  String(s).trim().toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

// Rule headings start with a dotted id in backticks (`lex.keyword.reserved-set`).
// Anchor on that id verbatim — clean, stable, and what search links target.
const specSlug = (s) => {
  const m = String(s).trim().match(/^([a-z][\w-]*(?:\.[\w-]+)+)/);
  return m ? m[1] : genericSlug(s);
};

// EVIDENCE links: turn `path#Lstart-Lend` (and bare `#Lstart` continuations that
// inherit the previous file within the same line) into links to GitHub at the
// pinned commit. Operates on inline text/code tokens so code fences are untouched.
const REF = /(?:((?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z0-9]+))?#L(\d+)(?:-L(\d+))?/g;

const makeSplitter = (mkPlain) => (content, ctx, Token) => {
  let m, last = 0, out = null;
  REF.lastIndex = 0;
  while ((m = REF.exec(content))) {
    const path = m[1], s = m[2], e = m[3];
    const file = path || ctx.lastFile;
    if (!file) continue; // bare #L with no established file → leave as text
    if (path) ctx.lastFile = path;
    out = out || [];
    if (m.index > last) out.push(mkPlain(content.slice(last, m.index), Token));
    const href = `${ctx.blob}/${file}#L${s}${e ? '-L' + e : ''}`;
    const lo = new Token('link_open', 'a', 1);
    lo.attrs = [['href', href], ['class', 'spec-src'], ['target', '_blank'], ['rel', 'noopener']];
    out.push(lo, mkPlain(m[0], Token), new Token('link_close', 'a', -1));
    last = m.index + m[0].length;
  }
  if (out && last < content.length) out.push(mkPlain(content.slice(last), Token));
  return out;
};
const mkText = (s, Token) => { const t = new Token('text', '', 0); t.content = s; return t; };
const mkCode = (s, Token) => { const t = new Token('code_inline', 'code', 0); t.content = s; return t; };

const sourceLinksPlugin = (blobBase) => (md) => {
  const splitText = makeSplitter(mkText);
  const splitCode = makeSplitter(mkCode);
  md.core.ruler.push('spec_source_links', (state) => {
    for (const blk of state.tokens) {
      if (blk.type !== 'inline' || !blk.children) continue;
      const ctx = { lastFile: null, blob: blobBase }; // continuations reset per line
      let changed = false;
      const nc = [];
      for (const child of blk.children) {
        const rep =
          child.type === 'text' ? splitText(child.content, ctx, state.Token)
          : child.type === 'code_inline' ? splitCode(child.content, ctx, state.Token)
          : null;
        if (rep) { nc.push(...rep); changed = true; } else nc.push(child);
      }
      if (changed) blk.children = nc;
    }
  });
};

// Spec docs cross-reference each other with relative links (`[…](deem.md)`,
// `[…](types.md#anchor)`). Rewrite those to the section route `/spec/<slug>/`
// so intra-spec navigation works on the site. Links with a slash (e.g.
// `../adr/x.md`) or to unknown slugs are left untouched.
const intraLinksPlugin = (slugSet) => (md) => {
  md.core.ruler.push('spec_intra_links', (state) => {
    for (const blk of state.tokens) {
      if (blk.type !== 'inline' || !blk.children) continue;
      for (const t of blk.children) {
        if (t.type !== 'link_open') continue;
        const href = t.attrGet('href');
        const m = href && href.match(/^([a-z0-9][a-z0-9._-]*)\.md(#.+)?$/i);
        if (m && slugSet.has(m[1])) t.attrSet('href', `/spec/${m[1]}/${m[2] || ''}`);
      }
    }
  });
};

const makeMd = (blobBase, slugSet) => {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true, highlight })
    .use(anchor, {
      slugify: specSlug,
      permalink: anchor.permalink.linkInsideHeader({ symbol: '#', placement: 'after', ariaHidden: true }),
      level: [1, 2, 3],
    })
    .use(katexPlugin, { throwOnError: false })
    .use(sourceLinksPlugin(blobBase))
    .use(intraLinksPlugin(slugSet));
  md.disable('replacements'); // keep ++/--/(c) literal, like the site pipeline
  return md;
};

// ── Extraction from rendered HTML ────────────────────────────────────────────
const stripTags = (h) => h.replace(/<a class="header-anchor"[\s\S]*?<\/a>/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// TOC: domain sections (h1, after the stripped title) + groups (h2).
const extractSpecToc = (html) => {
  const heads = [];
  const re = /<h([12])\b[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(html))) heads.push({ tag: Number(m[1]), slug: m[2], text: stripTags(m[3]) });
  const hasDomains = heads.some((h) => h.tag === 1);
  return heads.map((h) => ({
    level: hasDomains ? (h.tag === 1 ? 2 : 3) : 2,
    slug: h.slug,
    text: h.text,
  }));
};

// Rules (h3) for the search index: [ruleId, title].
const extractRules = (html) => {
  const rules = [];
  const re = /<h3\b[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h3>/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    const text = stripTags(m[2]);
    // strip the leading rule id and the em-dash separator to get the title
    const title = text.replace(id, '').replace(/^[\s—–-]+/, '').trim() || id;
    rules.push([id, title]);
  }
  return rules;
};

// ── Model ─────────────────────────────────────────────────────────────────────
export const loadSpecModel = (dataDir) => {
  if (!existsSync(dataDir)) return null;
  const files = readdirSync(dataDir).filter((f) => f.endsWith('.md'));
  if (!files.length) return null;

  let meta = { repo: 'victor-smirnov/logos', commit: null, branch: null, generated: null };
  if (existsSync(join(dataDir, 'meta.json'))) {
    try { meta = { ...meta, ...JSON.parse(readFileSync(join(dataDir, 'meta.json'), 'utf8')) }; } catch { /* keep defaults */ }
  }

  const orderIndex = new Map(SPEC_ORDER.map(([slug], i) => [slug, i]));
  const titleMap = new Map(SPEC_ORDER);
  const slugs = files.map((f) => f.replace(/\.md$/, ''));
  slugs.sort((a, b) => {
    const ia = orderIndex.has(a) ? orderIndex.get(a) : 999;
    const ib = orderIndex.has(b) ? orderIndex.get(b) : 999;
    return ia - ib || a.localeCompare(b);
  });

  const docs = slugs.map((slug) => {
    const raw = readFileSync(join(dataDir, `${slug}.md`), 'utf8');
    const m = raw.match(/^\s*#\s+(.+?)\s*(?:\r?\n|$)/);
    const heading = m ? m[1].trim() : null;
    const body = m ? raw.slice(m[0].length) : raw;
    return { slug, shortTitle: titleMap.get(slug) || heading || slug, heading: heading || titleMap.get(slug) || slug, body };
  });

  return { meta, docs };
};

// ── Rendering ─────────────────────────────────────────────────────────────────
const specUrl = (slug) => `/spec/${slug}/`;
const commitUrl = (meta) => (meta.commit ? `https://github.com/${meta.repo}/commit/${meta.commit}` : null);

const provenanceNote = (meta) => {
  if (!meta.commit) return '';
  const short = meta.commit.slice(0, 8);
  return `<p class="spec-provenance">Source references link to <a href="${commitUrl(meta)}" target="_blank" rel="noopener"><code>${esc(short)}</code></a>${meta.branch ? ` (<code>${esc(meta.branch)}</code>)` : ''} in the <a href="https://github.com/${esc(meta.repo)}" target="_blank" rel="noopener">Logos repository</a>.</p>`;
};

const renderDocPage = (md, meta, doc) => {
  const html = md.render(doc.body);
  const toc = extractSpecToc(html);
  const rules = extractRules(html);
  const body = `<h1 class="doc-title spec-title">${esc(doc.heading)}</h1>
${provenanceNote(meta)}
${html}`;
  return {
    url: specUrl(doc.slug),
    outFile: `spec/${doc.slug}/index.html`,
    title: doc.shortTitle,
    description: `Logos language specification — ${doc.shortTitle}.`,
    body,
    toc,
    rules: rules.map(([id, title]) => [id, title, doc.slug]),
  };
};

const renderIndexPage = (meta, docs, ruleCounts) => {
  const total = [...ruleCounts.values()].reduce((a, b) => a + b, 0);
  let body = `<h1 class="doc-title">Language Specification</h1>
<p>The normative Logos language specification. Every rule cites the compiler source that implements it — those <strong>EVIDENCE</strong> references link straight to the code${meta.commit ? ' at the commit this documentation was built from' : ''}. Logos-side tooling keeps the spec in step with the language.</p>
${provenanceNote(meta)}
<ul class="spec-doc-list">
${docs
  .map((d) => {
    const n = ruleCounts.get(d.slug) || 0;
    return `  <li><a href="${specUrl(d.slug)}">${esc(d.shortTitle)}</a>${n ? ` <span class="spec-rule-count">${n} rules</span>` : ''}</li>`;
  })
  .join('\n')}
</ul>`;
  return {
    url: '/spec/',
    outFile: 'spec/index.html',
    title: 'Language Specification',
    description: 'The normative Logos language specification, with every rule linked to its implementing source.',
    body,
    toc: [],
    rules: [],
    total,
  };
};

export const buildSpecPages = (dataDir) => {
  const model = loadSpecModel(dataDir);
  if (!model) return { pages: [], sidebar: null, searchIndex: [], meta: null };

  const { meta, docs } = model;
  const blobBase = meta.commit
    ? `https://github.com/${meta.repo}/blob/${meta.commit}`
    : `https://github.com/${meta.repo}/blob/${meta.branch || 'main'}`;
  const slugSet = new Set(docs.map((d) => d.slug));
  const md = makeMd(blobBase, slugSet);

  const docPages = docs.map((d) => renderDocPage(md, meta, d));
  const ruleCounts = new Map(docPages.map((p, i) => [docs[i].slug, p.rules.length]));
  const index = renderIndexPage(meta, docs, ruleCounts);
  const pages = [index, ...docPages];

  const searchIndex = docPages.flatMap((p) => p.rules); // [ruleId, title, docSlug]

  const sidebar = (currentUrl) => `
<aside class="sidebar">
  <nav class="sidebar-nav">
    <div class="api-search" data-search="spec">
      <input type="search" placeholder="Search rules…" autocomplete="off" spellcheck="false" aria-label="Search spec rules">
      <ul class="spec-search-results" hidden></ul>
    </div>
    <div class="nav-group">
      <p class="nav-group-title">Specification</p>
      <ul>
        <li><a href="/spec/"${currentUrl === '/spec/' ? ' class="active" aria-current="page"' : ''}>Overview</a></li>
        ${docs
          .map((d) => {
            const u = specUrl(d.slug);
            return `<li><a href="${u}"${u === currentUrl ? ' class="active" aria-current="page"' : ''}>${esc(d.shortTitle)}</a></li>`;
          })
          .join('\n        ')}
      </ul>
    </div>
  </nav>
</aside>`;

  return { pages, sidebar, searchIndex, meta };
};
