---
title: Roadmap
description: What Logos 1.0 looks like — the platform, the SDK, and the staged path from today's preview to a stable, self-hosted language.
---

Logos is in **preview** — the toolchain works, the language still moves (see [Versioning](/docs/versioning/)). This page describes the destination: what Logos 1.0 is meant to be, what ships in it, and the path there. The path is a sequence of **gated stages, not a calendar**. Consistent with the [rolling scheme](/docs/versioning/), a stage completes when its workloads stop finding problems; version numbers keep tracking compatibility, not milestones.

## The destination

**Logos 1.0 is a self-hosted data platform whose compiler is one of its own applications.** Three commitments define it.

**1. The language: a Rust-class core, extended where reasoning pays.** Let one thing be said plainly: **Logos is not Rust 2.0.** Rust is Logos's *bootstrap language* — the starting semantics, chosen deliberately because it is well designed, thoroughly worked out, and [models already know it](/blog/your-language-has-two-users-now/). So Logos starts from ownership, traits, generics, pattern matching, memory safety without GC — and keeps them. But Logos 1.0 is built over a combination of reasoners, and that inverts where the semantics comes from: **the semantics of the language is a continuation of the semantics of its base reasoners.** Language constructs surface what the engines can soundly derive — not what hand-written compiler code can afford to check, which is what shapes Rust. That is why Logos *diverges*: in exactly the aspects where a built-in reasoning engine changes what a language can afford (see [the divergence axis](#the-ongoing-axis-divergence-with-a-purpose) below), Rust compatibility is not a goal and never a tie-breaker. On top of the core sit the platform features that are already part of the language today — [Writ](/writ/introduction/) (the code+data substrate), [Metacall](/metacall/introduction/) (compile-time metaprogramming), [Deem](/deem/introduction/) (the integrated Datalog engine, compiled/interpreted/incremental), [Trama](/trama/introduction/) (templating) — and [Hest](/hest/introduction/), the first paradigm extension beyond Rust: dataflow and eventflow as first-class language structure, one operator graph retargetable from a fused loop to a distributed system.

**2. The platform is a service, not a binary.** At 1.0 the compiler is a resident, incremental engine over a fact base of your program. Batch compilation, the editor, and AI agents are three thin adapters over one query surface:

- the **CLI** — a batch build is simply one round of the incremental engine, run to completion;
- **LSP** — the human/editor projection: the usual hovers, completions, diagnostics;
- **MCP** — the model projection, and a first-class one: query the program's fact base directly instead of grepping; ask *why* for any diagnostic or derived fact and get its derivation tree; run speculative *what-if* edits on a forked world and read back the delta of consequences; subscribe to standing queries and receive changes, not snapshots.

One engine serving both batch and interactive modes is a design decision with teeth: it removes the reason Rust ended up with two independently written frontends (rustc and rust-analyzer). And the MCP surface is where the platform acts as an amplifier for models — global-consistency bookkeeping (types, borrows, reachability, impact of an edit) is [exactly the kind of function a model should offload](/blog/a-model-is-not-a-calculator/) to a symbolic engine that is never stale and never guesses.

**3. Self-hosted, except code generation.** At 1.0 the compiler and lforge are written in Logos. Internally the compiler is a Deem application: program structure lives as facts, the relational analyses — name resolution, borrow checking, reachability, lints — run as incremental Datalog rules (the design Rust's Polonius pointed at), and the algorithmic kernels (type inference, layout) remain ordinary Logos code driven by the same engine. The one deliberate exception is code generation, which stays a C++ service over MLIR/LLVM — rewriting an LLVM binding layer in Logos buys nothing.

### Why build a compiler on a reasoner

Three points about this architecture deserve to be explicit.

**It buys language power — and diagnostics that models can learn from.** The self-hosted platform is built *over Deem's capabilities as a reasoner*, deliberately. That is where the divergence budget comes from: type-system features become affordable when checking them is a rule set on a fast engine rather than a hand-grown solver. And it is where diagnostics change in kind: every judgment the compiler makes carries provenance, so every diagnostic can answer *why* — which impl was considered and rejected on which ground, which chain of facts makes this borrow conflict. For human users that is a better error message. For models it is something more valuable: a **quality reward signal**. A bare error only rejects an attempt; a diagnostic that exposes its own derivation steers the next one.

**The performance combination is a feature, not a risk.** A compiler written as a mix of *incremental* Datalog (Deem), SMT-class solving, and imperative analyses and transformations should not alarm anyone. Deem is engineered so that simple cases specialize down to noise-level overhead — a compiled query path is an ordinary native loop. On complex cases the engine side comes out *ahead* of hand-written imperative code, for a structural reason: optimization investment poured into one engine amortizes across every analysis and every workload, an accumulation no individual hand-written pass can ever absorb. Databases proved this economics decades ago; a compiler's analyses are queries.

**The design is derived; the specification is generated.** The continuation principle has a strong form, and Logos 1.0 commits to it: the design of the language itself is expected to be **derived from the semantics of the base reasoners** — not invented feature by feature and then implemented. The reasoner combination fixes the substance: which judgments the engines can soundly and incrementally derive determines which constructs can exist and what they are allowed to promise. The classic language-design question — *can we afford this feature?* — stops being a matter of taste and estimation and becomes a read-off from engine capabilities. What remains as deliberate design is real but mostly **cosmetic**: surface syntax, naming, the ergonomics of the profile that models write and humans read. The specification then follows for free. The [Logos spec](/spec/) is already extraction-based today — every rule carries evidence links into compiler source at a pinned revision; at 1.0 sync becomes *identity*: the spec is a rendering of the rule corpus the engines execute, so the 1.0 specification is mostly automatically created.

**There is no human bottleneck this time.** Platforms built "language over Datalog" have failed before — and the failure boundary consistently tracked *human* authoring capacity, not the technique: rule corpora outgrew what people can hold in their heads, while small-unit declarative languages (SQL) and expert-curated rule bases thrived. Logos is [developed by models](/blog/your-language-has-two-users-now/), and models write exactly this kind of code — wide, regular, declarative — substantially better than humans do. The constraint that sank the predecessors does not apply; what remains load-bearing is the verification discipline around the rules, which is precisely what the platform is built to provide.

### What ships in the platform (the toolchain)

- **logosc** — the compiler service described above: incremental fact-base core, batch CLI, LSP and MCP adapters, provenance-carrying diagnostics, C++ codegen service over MLIR/LLVM inside.
- **lforge** — build system and package manager, and the platform's orchestrator: Writ manifests, content-hashed incremental builds, multi-target projects, tests, docs (`lforge doc`), and ownership of the resident compiler sessions.
- **logos-gdb** — source-level debugging (DWARF, gdb pretty-printers).
- **Distribution machinery** — versioned slots with parallel installs and `alternatives` integration; package feeds for fresh builds; seed and cross toolchains (below).

### What ships in the SDK

- **stdlib** — the language/memory/std tiers, including the Writ, Deem, Trama, and Metacall runtimes and, at 1.0, the Hest runtime.
- **extras** — module tiers built against the *binary* stdlib and versioned on their own. The first resident: **Memoria**, the storage engine — packed, relocatable containers and a copy-on-write versioned store — serving as the durable backend under Deem and lforge.

## The path

### Stage 1 — harden the data platform *(current)*

Writ, Deem, Trama, and lforge stabilize under real load, and the load is arranged as a cascade: **Memoria**, being ported from its C++ original into the in-tree incubator, exercises the language and compiler and finds their gaps; **Nous**, an agentic-reasoning application built over Deem, loads Deem and Memoria in turn. Each layer is the completeness oracle for the layer below — the exit gate is reached when the top of the cascade stops finding gaps underneath. Major groundwork already landed on this stage: the incremental Deem engine (full relational algebra, recursion, recursive aggregates, retraction-correct, differentially tested against independent oracles), the versioned store, first-class mappings, and relational source interfaces.

### Stage 2 — the self-hosted platform

A new logosc and lforge, written in Logos on the stage-1 stack — built whole, not as a gradual strangling of the C++ compiler. The existing C++ compiler plays its most important role here: the **oracle**. Every behavior of the new compiler is differentially tested against it over the full test corpus (the parser has already crossed this bar: the Logos-emitted parser generator reproduces the C++ AST byte-for-byte). The architecture is the one described under the destination: fact base, incremental rules, procedural kernels, three adapters. **Hest is implemented alongside** — the compiler itself, internally a dataflow of facts between analyses, is Hest's first serious client. Code generation stays in C++.

The only bootstrap constraint this introduces: compiler sources are written against the *previous* language version — a rolling one-version window, the same discipline Rust and Go use. The stdlib, compiled by the new compiler itself, is free to use the newest features immediately.

### Stage 3 — cross-compilation and the seed

Target set: **Linux, Windows, macOS, iOS**. One canonical build host (Linux) plus a statically linked **seed toolchain** — trimmed of tools (no service, no debugger), but never of language: it must compile the full stdlib. Every other platform, and every older-or-newer version of the platform itself, bootstraps from it by cross-compilation; building version N with version N−1 is the same mechanism as building for another OS. There is deliberately **no second compiler implementation** in this scheme — bootstrap is a technical problem with a technical solution, and the solution is a binary seed plus cross-compilation, not a maintained shadow compiler. (iOS's no-JIT rule costs nothing here: all of Metacall's JIT runs at compile time on the host.)

### Stage 4 — builds everywhere

Packages and feeds for the major platforms, riding the slot/alternatives machinery that already exists. Ordinary users take fresh builds from a feed; nobody builds a compiler to use one.

### Stage 5 — 1.0: the C++ compiler retires

Logosc/C++ goes into history as the first base version — archived at a pinned release as the permanent seed of the chain and an occasional oracle. Trust in the binary chain is maintained by diverse-double-compiling audits, not by keeping a second implementation alive. The language is declared stable: major version 1, with the compatibility guarantees [Versioning](/docs/versioning/) assigns to it.

### The ongoing axis: divergence with a purpose

Running through all stages is the principle from commitment 1: Rust is the bootstrap language, not the destination — **Logos diverges from Rust where a resident reasoner changes the economics.** Much of Rust's design is shaped by *not* having one — coherence rules sized to what a hand-written solver could check, specialization stalled for lack of explainable selection, bounds that must be repeated because entailment is too costly to close over, const expressions in types cut back to what an ad-hoc evaluator handles. With an incremental Datalog engine in the compiler — and, past 1.0, further reasoner classes (constraint/SMT, equality saturation) behind the same judgment interface — those trade-offs can be remade deliberately. Every divergence is recorded in a register with its rationale; "Rust would not accept this" is a data point there, never an argument by itself.

The axis also runs beyond remaking Rust's existing trade-offs, and the strongest candidate for a *signature* divergence is **capability discipline**. Two layers, both riding machinery Logos already has. At runtime, no ambient authority: system access — filesystem, network, clocks — is an unforgeable, attenuable *value*, and ownership is exactly the enforcement substrate (an affine capability cannot be silently duplicated; moving it is revocation). Statically, *effect* requirements are not annotated everywhere but **derived as facts** over the call graph — checked incrementally, violations reported with a witness path, declared per dependency in the manifest (a dependency update that suddenly wants the network is a red capability diff before any code review), and scoped per agent session. One discipline answers three questions of the current era at once: supply-chain trust, containment of model-written code, and hardware targetability — a Hest vertex class *is* a capability set, and compile-time metaprogramming is gated by the same lattice.

## Beyond 1.0

If the language is derived from its reasoners, then language *evolution* is derived from reasoner evolution — so the reasoners themselves are being designed for **incremental semantic growth**: capabilities are added; judgments already derivable are never reinterpreted. This is the logician's *conservative extension*, and it is enforceable the same way ABI compatibility already is in this toolchain — not by promise but by a machine-checked gate: every derivation in the existing corpus must survive an engine upgrade unchanged. It is early to be certain, but if the discipline holds, it carries a striking consequence for [versioning](/docs/versioning/): the language keeps growing inside major version 1 indefinitely, feature by feature, reasoner by reasoner — and **Logos 2.0 may simply never need to exist**.
