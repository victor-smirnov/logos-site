---
title: Introduction
description: Why Logos exists — the problem it targets, and how a DB-first, AI-first language answers it.
---

A new programming language is a hard thing to justify. Rust and C++ have decades of momentum, vast ecosystems, and armies of experienced engineers. The right objection is not whether a new language *can* be built — it can — but whether the niche it serves is large enough to sustain it. A language lives or dies by demand, not by funding. Logos is built on a specific bet about where that demand is going. This page makes the case.

## The problem

Three pressures are converging.

1. **Code and data are growing without bound — and AI is multiplying both.** The world's datasphere is already measured in [hundreds of zettabytes and still climbing](https://www.statista.com/statistics/871513/worldwide-data-created/); codebases grow alongside it. AI-assisted development is now stacking a steep multiplier on top: GitHub's COO reports weekly commit volume [up roughly an order of magnitude in a single year](https://www.latent.space/p/github) as coding agents came online — some 275 million commits a week, on pace for around 14 billion in 2026. And the pressure is structural, not a passing spike: models generalize but [do not execute reliably](/blog/a-model-is-not-a-calculator/), so robust systems increasingly move computation *out* of the model and into symbolic code — cheaper, steadier, verifiable — and every such offload is more code to build and run. More code over more data means ever more of the hard problems in software are *data* problems.

2. **More and more software is, in effect, a database.** Not "uses a database" — *is* one. Applications accumulate in-memory graphs, indexes, caches, query paths, and consistency rules until they have quietly reimplemented a large fraction of a DBMS, usually by accident and usually badly. Even compilers have gone this way (more on that below).

3. **There is no language built for this.** Databases and data-intensive systems are written in general-purpose languages — C, C++, Rust — that hand you memory and threads and then leave every data-structure, schema, query, and transformation concern to libraries and convention. The tool was designed for general computation; the data platform is always bolted on afterward.

Logos is a systemic answer to all three: a **DB-first, AI-first** language, where the data platform and the AI workflow are part of the language and its toolchain rather than layered on top.

## Where Logos comes from

Logos did not start as a language. It grew out of [Memoria](https://github.com/victor-smirnov/memoria), a C++ framework for data-intensive systems — dozens of B⁺-tree-derived containers assembled from a large kit of building-block data structures and specialized to concrete algorithms. This is not STL-level generic programming, where the metaprogramming is simple and Rust handles it comfortably. It is metaprogramming at industrial scale, and in C++ it hit two walls:

- **Template metaprogramming does not scale.** C++ TMP is a Turing tarpit — expressive in principle, miserable in practice — and it buckles under the compositional weight Memoria needed. Rust, within these same bounds, is if anything *worse*.
- **Safe code is not practically achievable.** Memory safety is the headline, not the whole story. What actually keeps a data system correct is validation and verification, and those need a strong, expressive type system underneath. C++ cannot offer the guarantees; Rust delivers memory- and thread-safety — genuinely valuable — but stops well short of the type-system strength verification wants.

Rust was the obvious escape hatch, but its type-level metaprogramming was weak for most of the project's life, reaching rough parity with C++ only in the last few years. By then Memoria was far too large to contemplate rewriting. The door was closed.

## Why a new language is reasonable now

AI changed the arithmetic. Porting code across languages is dramatically cheaper than it was, which alone weakens the "too much code to move" objection. But the deeper shift is that it is now feasible to **build a language fitted to the problem** rather than bend a general-purpose one to it. The fixed cost of a language — designing it, implementing it, and, above all, teaching people to use it — has always demanded a huge market to amortize. AI lowers both halves of that cost: the cost of *building* a language and the cost of *adopting* one. A focused niche that could never have justified a language before can justify one now.

That is the opening Logos is built for.

## What Logos is

Logos answers the problem from two directions at once.

### AI-first, at every level

Logos is designed for a world where a language has [two users: humans and models](/blog/your-language-has-two-users-now/).

- **In the language:** a strong, expressive type system is exactly what models generate well *and* what gives verification something to bite on. The same property that serves correctness serves the model.
- **In the tools:** an AI agent learns from a *reward signal*, and a compiler is an ideal source of one. Strong types, broad diagnostics, a large executable test corpus, and verification together form a dense, reliable oracle that an agentic loop can close against. The [Logos blog](/blog/) develops this argument in depth — it is written as the context for exactly this design.

### DB-first: the data platform is in the language

The high-level machinery a data system actually needs is built into Logos and its toolchain — not imported as libraries, but part of the language, and sharing one schema'd representation:

- **[Writ](/writ/introduction/)** — a referential object graph over zones: schema-aware, tagged, serialization-free. The data substrate.
- **[Deem](/deem/introduction/)** — a full incremental Datalog engine: query and reasoning over Writ graphs and ordinary Logos objects alike.
- **[Trama](/trama/introduction/)** — a data-transformation engine, today a typed, compile-checked templating layer that shares its schema'd IR with Deem.
- **[Hest](/hest/introduction/)** — the dataflow aspect: the operator graph raised to a first-class language construct (design stage).

Underneath these sit three foundations that make them possible:

- **A strong type system**, aimed past memory safety at validation and verification.
- **A structurally richer memory model** than other languages of its class — [zones](/writ/zoned-memory/) — providing the primitives that data structures need directly at the type-system level.
- **[Metacall](/metacall/introduction/)** — compile-time metaprogramming written in ordinary Logos. The type-level metaprogramming that broke C++ and Rust is, in Logos, just Logos: fully expressive, and it scales.

## Compilers are already databases — Logos makes it first-principle

Problem #2 — *software is quietly becoming a DBMS* — has a striking witness: the compiler itself.

Modern compilers have independently grown into data platforms with a database and a query language inside them. rustc is organized as a [demand-driven query system whose knowledge is, in the dev guide's own words, a "database"](https://rustc-dev-guide.rust-lang.org/query.html) — filled on demand and incrementally recomputed. rust-analyzer runs on [Salsa](https://github.com/salsa-rs/salsa), a generic incremental query database. Clang ships [AST Matchers](https://clang.llvm.org/docs/LibASTMatchers.html), a domain-specific query language over the syntax tree. Each arrived here by its own road, under pressure from the same forces.

Logos takes that same destination and builds it in from first principles — then proves it on itself. The Logos compiler dogfoods its own data platform:

- **Writ** is the format for the compiler's AST/IR, its RTTI, and the constant data it emits. The AST/LIR is still implemented in C++, yet Logos metaprograms — through Metacall — read and modify those structures **directly, without adapters**, because Writ is the shared substrate.
- **Trama** formats text inside those metaprograms.
- **Deem** is slated to handle AST/IR analysis — Logos's answer to Clang's AST Matchers.
- **Hest**, via the Logos Compute Model, is the compiler's dataflow target: a distributed model with no coherent caches by default.

Writ and Trama are in production use in `logosc` today; Deem and Hest arrive in coming iterations. The data platform is not a promise bolted to a language — it is what the language is already built out of.

## Relationship to Rust

The Rust-like surface was chosen with the model in mind: models generate Rust more reliably than most alternatives, and it sits in a sweet spot — expressive, low-level, a good DSL host.

The kinship runs deep today. As a language, Logos currently tracks **Rust 1.93**: its semantics *are* Rust's, and any deviation is treated as a compiler bug unless it appears on an explicit [blessed list of divergences](/spec/divergences/). The standard library is Rust's as well, though reorganized under a different structure. On that baseline Logos adds extensions — variadic generics, [Metacall](/metacall/introduction/), and others — and departs outright in a few places, most notably an entirely different module system.

Compatibility is **not** a goal — and neither is divergence. Logos does not set out to differ from Rust for its own sake; it will diverge only where a concrete AI-first or DB-first need pushes it to, and each change has to earn its place. Two are already on the map: a **capabilities system** woven into the type system, and a reworking of some memory-handling semantics to fit **[Hest / the Logos Compute Model](/hest/lcm/)**, the dataflow model still under design. By the time Logos reaches 1.0 the two languages will have parted along a number of such lines — toward a richer memory model, code-and-data unification, compile-time programming as ordinary Logos, and verification beyond memory safety. What the shared heritage *does* buy is practical rather than formal: moving code between Logos and Rust stays comparatively simple in both directions.

## Keep reading

- [Getting Started](/docs/getting-started/) — install Logos and build your first program.
- [Writ](/writ/introduction/) · [Deem](/deem/introduction/) · [Trama](/trama/introduction/) · [Hest](/hest/introduction/) — the built-in data platform.
- [Metacall](/metacall/introduction/) — compile-time Logos.
- [The Logos blog](/blog/) — the AI-first design argument in full.
