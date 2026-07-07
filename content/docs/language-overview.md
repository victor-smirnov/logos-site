---
title: Language Overview
description: What Logos is, its design direction, and how it relates to Rust.
---

Logos is a compiled, statically-typed systems programming language with its own compiler (`logosc`), standard library, and runtime. It descends from ideas explored in the [Memoria Framework](https://github.com/victor-smirnov/memoria), but is a standalone language platform — not a C++ framework layer.

## What Logos is

- A compiled language (`.logos`) with ownership/borrowing, traits, generics, monomorphization, and pattern matching.
- A native compiler pipeline (`logosc`) covering parse, sema, borrow checking, monomorphization, MLIR generation, and LLVM lowering.
- A standard library (`stdlib/`) including a first-class **Writ** integration — a relocatable, schema-aware, tagged data substrate.
- A large executable test suite (~800 passing tests, ~165 diagnostic tests) that gates merges.

## Design direction

- **AI-first ergonomics** — syntax and semantics chosen for reliable LLM generation and verification.
- **Code + data unified** — Writ is *built into the language*: `@{…}` / `@[…]` are literal forms in the grammar, capture (`$ident`, `${expr}`) is type-checked at sema time, view types carry lifetimes through the borrow checker, and module-scope literals fold to rodata. No DSL, no macros, no FFI between values and data.
- **Systems-level performance** — AOT native codegen, ownership, explicit memory.
- **Verification-oriented** — broad diagnostics, runtime tracing, and a strong test culture.
- **Pragmatic interop** — C/C++ FFI exists; Logos is the primary programming model.

## Relationship to Rust

The Rust-like surface was effectively chosen by the model. The original plan was a much simpler, IR-adjacent syntax with no expressions — explicit, verbose, optimised for small and mid-sized models. In practice the language also has to be pleasant for humans to read and write, and Rust turned out to sit in a sweet spot: expressive, low-level, a good DSL host, and — importantly — models generate it more reliably than most alternatives. Since Logos is built for models first, leaning into a syntax they already handle well is the pragmatic choice.

Logos inherits surface syntax, affine types, generics, and the ownership/borrowing model from Rust, but it is **not** Rust:

- not source-compatible, and not aiming at portability in either direction;
- willing to diverge wherever AI-first ergonomics, Writ-based code/data unification, compile-time programming as ordinary Logos code, or green-fiber concurrency without async coloring point elsewhere.

Substantial divergence is expected in the near future.

## Project structure

```
logos/
  src/            Compiler, runtime, Writ, HRPC, reactor, verification
  stdlib/         Logos standard library and language runtime
  tests/          Language test suites (pass / fail)
  examples/       Example Logos programs
  tools/          Supporting tools (PEG generator, audits, HRPC codegen)
  docs/           Documentation (start at docs/README.md)
```

## Keep reading

- [Getting Started](/docs/getting-started/) — build and run.
- [Writ: code + data](/writ/introduction/) — the substrate that unifies values and data.
