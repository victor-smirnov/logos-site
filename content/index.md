---
layout: home
title: Logos
description: Logos is a compiled, statically-typed systems programming language built AI/DB-first — with ownership, traits, generics, and Writ, a built-in code+data substrate.
---

<section class="hero">
  <a class="hero-badge hero-badge-preview" href="/docs/versioning/" title="Logos is in preview — see Versioning">Preview</a>
  <span class="hero-badge">Systems language · built AI/DB-first</span>
  <h1>The Logos Programming Language</h1>
  <p class="lead">A compiled, statically-typed systems language with ownership, traits, generics, and pattern matching — and <strong>Writ</strong>, a code-and-data substrate built into the grammar itself.</p>
  <div class="hero-cta">
    <a class="btn btn-primary" href="/docs/getting-started/">Get Started →</a>
    <a class="btn btn-ghost" href="https://github.com/victor-smirnov/logos" rel="noopener">View on GitHub</a>
  </div>

  <div class="hero-code">

```logos
package graph_reach;
use logos.std.wql.wql;           // the deem! macro
use logos.mem.collections.vec;

struct Edge { pub src: i64, pub dst: i64 }

// A recursive Datalog query, prepared at compile time:
// transitive reachability over a graph of edges.
resource reach = deem!(edges: &[Edge], start: i64) {
    rel path(a: i64, b: i64) {
        from edges e select (e.src, e.dst);
        from path p join edges e on p.b == e.src select (p.a, e.dst);
    }
    from path p where p.a == start select p.b order by p.b
};

fn main() -> i32 {
    let edges: [Edge; 4] = [
        Edge { src: 1i64, dst: 2i64 },
        Edge { src: 2i64, dst: 3i64 },
        Edge { src: 2i64, dst: 4i64 },
        Edge { src: 2i64, dst: 3i64 },   // duplicate — set semantics dedup it
    ];
    // Everything reachable from node 1, transitively:
    let hits: Vec<i64> = reach(&edges[..], 1i64).unwrap();   // → [2, 3, 4]
    return hits.len() as i32;   // 3
}
```

  </div>
</section>

<section class="features">
  <a class="feature" href="/blog/">
    <div class="ico">🤖</div>
    <h3>AI-first ergonomics</h3>
    <p>A strong, expressive type system that models generate and verify reliably — and a toolchain that gives an agent a dense, honest reward signal.</p>
  </a>
  <a class="feature" href="/writ/introduction/">
    <div class="ico">🧬</div>
    <h3>Code + data unified — Writ</h3>
    <p>A schema-aware, tagged object graph over zones, built into the grammar itself — the substrate that unifies values and data.</p>
  </a>
  <a class="feature" href="/deem/introduction/">
    <div class="ico">🔎</div>
    <h3>Query &amp; reasoning — Deem</h3>
    <p>A full incremental Datalog engine, first-class in the language — query and reason over Writ graphs and ordinary Logos objects alike.</p>
  </a>
  <a class="feature" href="/trama/introduction/">
    <div class="ico">🧵</div>
    <h3>Transformation — Trama</h3>
    <p>A typed, compile-checked transformation engine — today a Jinja2-style templating layer sharing Deem's schema'd IR.</p>
  </a>
  <a class="feature" href="/hest/introduction/">
    <div class="ico">🌊</div>
    <h3>Dataflow — Hest</h3>
    <p>The operator graph raised to a first-class language construct — Logos's dataflow aspect. Design stage, no stable syntax yet.</p>
  </a>
  <a class="feature" href="/metacall/introduction/">
    <div class="ico">🧩</div>
    <h3>Compile-time metaprogramming — Metacall</h3>
    <p>Ordinary Logos functions the compiler runs at compile time, splicing their results into your program. No separate macro language.</p>
  </a>
  <a class="feature" href="/docs/introduction/">
    <div class="ico">🦀</div>
    <h3>Ownership, tracking Rust</h3>
    <p>Affine types, <code>&amp;</code>/<code>&amp;mut</code> references, lifetimes, traits, and generics with monomorphization. Semantics track Rust 1.93, minus a blessed list of divergences.</p>
  </a>
  <a class="feature" href="/docs/getting-started/">
    <div class="ico">🚀</div>
    <h3>Native AOT pipeline</h3>
    <p>The <code>logosc</code> compiler lowers parse → sema → borrow-check → monomorphization → MLIR → LLVM to native code. No VM in the run path.</p>
  </a>
</section>

<section class="home-cta-row">
  <a class="btn btn-primary" href="/docs/getting-started/">Build the compiler and run your first program →</a>
</section>
