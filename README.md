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
  404.md           Custom 404
assets/            styles.css and other static assets → served from /assets/
static/            Files copied verbatim to the site root (CNAME, robots.txt, favicon, .nojekyll)
build.mjs          The generator: Markdown → HTML, sidebar/TOC, sitemap
.github/workflows/ GitHub Actions build + deploy to Pages
```

## Adding a page

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

## Deployment

Every push to `main` triggers `.github/workflows/deploy.yml`, which builds the
site and publishes `dist/` to GitHub Pages. The custom domain is configured via
the `static/CNAME` file and the repository Pages settings.
