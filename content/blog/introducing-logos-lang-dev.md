---
title: Introducing logos-lang.dev
description: The Logos language now has a home on the web — documentation, this blog, and a tiny hand-rolled generator behind it all.
date: 2026-07-04
---

Logos now has a proper home: **[logos-lang.dev](https://logos-lang.dev)**. If you're reading this, DNS did its job.

## What's here today

- **[Getting Started](/docs/getting-started/)** — build `logosc`, compile and run your first program.
- **[Language Overview](/docs/language-overview/)** — the design axes, and how Logos relates to (and diverges from) Rust.
- **[Writ: code + data](/docs/writ/)** — the substrate that makes Logos more than a Rust-flavored systems language.

The in-repo documentation under [`docs/`](https://github.com/victor-smirnov/logos) remains the source of truth; this site is the curated, readable entry point. More of the spec and internals docs will migrate here over time.

## The stack (or lack of one)

The site is a single-file static generator — `build.mjs`, roughly three hundred lines of Node. Markdown with front-matter goes in; templated HTML, a sidebar, syntax-highlighted code, a sitemap, and this blog come out. No framework, no client-side rendering: the only JavaScript shipped to your browser is a theme toggle.

Posts support GitHub-style math, inline like $O(n \log n)$ or as display blocks:

$$
T(n) = 2\,T\!\left(\tfrac{n}{2}\right) + \Theta(n) \implies T(n) = \Theta(n \log n)
$$

Formulas render to HTML at build time via KaTeX — no math JavaScript in the browser either. Videos embed by pasting a YouTube or Vimeo link on its own line.

## What's next

Posts on the parts of Logos worth writing about: the borrow checker, the Writ runtime and its zones, metaprogramming hooks that synthesize source during compilation, and the road to green-fiber concurrency. Subscribe via [RSS](/blog/rss.xml) if that sounds interesting.
