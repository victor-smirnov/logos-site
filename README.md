# logos-site

Static documentation site for the [Logos programming language](https://github.com/victor-smirnov/logos),
published at **[logos-lang.dev](https://logos-lang.dev)**.

Built with a small, hand-rolled static site generator (`build.mjs`) — Markdown +
front-matter in, templated HTML out. No framework.

## Develop

```bash
npm install
npm run dev      # build + preview on http://localhost:4321
```

`npm run build` writes the site to `dist/`.

## Structure

```
content/           Markdown pages (front-matter: title, description, layout)
  index.md         Landing page (layout: home)
  docs/*.md        Documentation pages (layout: doc, default)
  blog/*.md        Blog posts (layout: post, default under blog/)
  404.md           Custom 404
assets/            styles.css and other static assets → served from /assets/
static/            Files copied verbatim to the site root (CNAME, robots.txt, favicon, .nojekyll)
build.mjs          The generator: Markdown → HTML, sidebar/TOC, blog index, RSS, sitemap
.github/workflows/ GitHub Actions build + deploy to Pages
```

## Adding a doc page

1. Create `content/docs/my-page.md` with front-matter:

   ```markdown
   ---
   title: My Page
   description: One-line summary for SEO / social cards.
   ---

   ## A heading

   Content in Markdown. Code blocks tagged `logos` are highlighted.
   ```

2. Add it to the sidebar in the `SITE.nav` array in [`build.mjs`](build.mjs).

## Writing a blog post

Drop `content/blog/my-post.md` — no registration needed. The index at `/blog/`
and the RSS feed at `/blog/rss.xml` are generated automatically, newest first.

```markdown
---
title: My Post
description: Shows up on the blog index and in the RSS feed.
date: 2026-07-04
draft: true        # optional — drafts are skipped entirely at build time
---
```

### Math (GitHub-style, via KaTeX)

Inline `$O(n \log n)$` and display blocks:

```markdown
$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$
```

Formulas are rendered to HTML at build time; KaTeX CSS/fonts are self-hosted
and only linked on pages that actually use math. No JS in the browser.

### Video embeds

Paste a YouTube or Vimeo URL **alone on its own line** — it becomes a
responsive 16:9 embed (privacy-enhanced `youtube-nocookie.com` for YouTube):

```markdown
Some paragraph.

https://www.youtube.com/watch?v=VIDEO_ID

Another paragraph.
```

`youtu.be/...` short links and `vimeo.com/...` work too. A URL inside a
sentence stays a normal link.

## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the
site and publishes `dist/` to GitHub Pages. The custom domain is configured via
the `static/CNAME` file and the repository Pages settings.
