---
layout: home
title: Logos
description: Logos is a compiled, statically-typed systems programming language built AI-first — with ownership, traits, generics, and Writ, a built-in code+data substrate.
---

<section class="hero">
  <span class="hero-badge">Systems language · built AI-first</span>
  <h1>The Logos Programming Language</h1>
  <p class="lead">A compiled, statically-typed systems language with ownership, traits, generics, and pattern matching — and <strong>Writ</strong>, a code-and-data substrate built into the grammar itself.</p>
  <div class="hero-cta">
    <a class="btn btn-primary" href="/docs/getting-started/">Get Started →</a>
    <a class="btn btn-ghost" href="https://github.com/victor-smirnov/logos" rel="noopener">View on GitHub</a>
  </div>

  <div class="hero-code">

```logos
package writ_example;
use logos.lang.writ.container;   // Writ
use logos.mem.writ.parser;       // parse_writ
use logos.mem.writ.stringify;    // stringify
use logos.std.io;

fn main() -> i32 {
    // Parse a document, then render it back — one call each.
    let doc: Writ = parse_writ(r#"
        {
            name:"widget",
            version:42,
            active:true,
            tags:["fast","safe"],
            i32_array: <I32> [1,2,3,4]
        }
    "#);
    if doc.root().is_null() { return 1; }   // null root == parse error
    let s: String = stringify(doc.root());
    println(s.as_str());
    return 0;
}
```

  </div>
</section>

<section class="features">
  <div class="feature">
    <div class="ico">🤖</div>
    <h3>AI-first ergonomics</h3>
    <p>Syntax and semantics chosen so models generate and verify code reliably. A Rust-like surface sits in the sweet spot models handle best.</p>
  </div>
  <div class="feature">
    <div class="ico">🧬</div>
    <h3>Code + data unified</h3>
    <p>Writ is built into the language: <code>@{…}</code> / <code>@[…]</code> are literal grammar forms, capture is type-checked at sema, view types carry lifetimes through the borrow checker.</p>
  </div>
  <div class="feature">
    <div class="ico">⚙️</div>
    <h3>Ownership &amp; borrowing</h3>
    <p>Affine types, <code>&amp;</code>/<code>&amp;mut</code> references, lifetimes, traits, generics with monomorphization, and exhaustive pattern matching.</p>
  </div>
  <div class="feature">
    <div class="ico">🚀</div>
    <h3>Native AOT pipeline</h3>
    <p>The <code>logosc</code> compiler covers parse, sema, borrow checking, monomorphization, MLIR generation, and LLVM lowering to native code.</p>
  </div>
  <div class="feature">
    <div class="ico">🧪</div>
    <h3>Verification-oriented</h3>
    <p>Broad diagnostics, runtime tracing, and a strong test culture — ~800 passing tests and ~165 diagnostic tests gate every merge.</p>
  </div>
  <div class="feature">
    <div class="ico">🔗</div>
    <h3>Pragmatic interop</h3>
    <p>C/C++ FFI exists where you need it, but Logos is the primary programming model — not a framework layer over something else.</p>
  </div>
</section>

<section class="home-cta-row">
  <a class="btn btn-primary" href="/docs/getting-started/">Build the compiler and run your first program →</a>
</section>
