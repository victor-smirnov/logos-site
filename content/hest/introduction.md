---
title: "Hest: dataflow as a language feature"
description: Hest is Logos's dataflow aspect — the operator graph raised to a first-class language construct. This is a design-stage introduction; there is no implementation or stable syntax yet.
---

> **Status: design phase.** Hest is not implemented. There is no compiler support, no stable
> grammar, and no operator set yet — only an accepted theoretical framework, a settled set of
> design decisions, and an entry path. Everything below describes *where Hest is going*, not
> something you can run today. Code shown is **illustrative and provisional**. There is
> deliberately no Tutorial or Reference for Hest: there is nothing concrete enough to document
> as an API. This page will be superseded by an ADR as the design lands.

## What Hest is

Hest is Logos's **dataflow aspect** — the first serious extension of Logos beyond what Rust
gives you. Where Logos already permits a few *blessed divergences* from Rust (zones, Writ,
metaprogramming), Hest opens a new category: an **extension**. Rust extended control flow
*inward* with `async`; Logos extends *outward*. The unit of composition rises above the
function — **the unit of composition above `fn` is the operator graph.**

A control-flow language composes functions along a call stack. A dataflow language composes
**vertices** — units of computation with typed input and output ports — into a graph, where
execution moves by the availability of data rather than by a program counter. Hest makes that
graph a *language construct* with its own statics: port types, causality, scheduling, and
determinism discipline. It is not a library that assembles a graph on the heap at runtime; it is
a topology the compiler can see, check, transform, and place.

Under this framing, several things that already exist in Logos stop being separate concepts and
become **projections of one model**:

- **HRPC** ("Hest RPC") — the first *wire member*. Its call model of *N input channels × M output
  channels* is exactly the signature of a dataflow vertex, not an RPC quirk.
- **The LCM delta-stream** — a planned second wire member, a streaming profile over the same graph.
- **Deem standing queries** ([Deem](/deem/introduction/)) — the first *client* of the
  dataflow engine.

This is the key reframing to hold onto: **the communication protocols are part of the dataflow
model, not a rival meaning of the name.** The comms family (HRPC and friends) is one face of
Hest, not a sibling to it.

The name completes a triad. **Hest** is Old English *hǣs*, "command, bidding" — the root of
*behest* — and doubles as Danish/Norwegian *hest*, "horse," the workhorse courier. So:
**Logos** (meaning) — [**Writ**](/writ/introduction/) (the written record) — **Hest** (the
courier that bears the Writ, and now the graph along which it moves).

## Why first-class, and not a library

The test of "first-classness" is simple: **the compiler must see the graph.** Three capabilities
follow that a library structurally cannot have, because a library's graph exists only as a
runtime value:

1. **Verification** — before running: edge type-compatibility, absence of illegal cycles,
   bounded memory, causality (a feedback cycle must cross a delay), generalized stratification,
   and *state privacy* (an operator's state never escapes).
2. **Transformation** — fusion (a pipeline collapses to a single loop), fission (one operator
   becomes N parallel copies), partitioning.
3. **Retargeting** — one graph → one process, a cluster, or hardware.

Systems like Rx, timely dataflow, and DBSP-in-Rust hit a ceiling here: they cannot fuse,
partition, or verify what they cannot see. Logos owns the compiler, the metaprogramming layer,
and the data substrate, so it can break that ceiling — the graph is checkable *before* it runs.

## Where it comes from: the compute model

Hest's dataflow model is not an abstract aesthetic. It is **system-oriented** — it presupposes a
concrete physics of the process — and it derives directly from the **Logos Compute Model (LCM)**:
a distributed system of small cores (*xPUs*) placed close to the data they touch, internally
synchronous, exchanging asynchronous messages over potentially unreliable channels, alongside
memory blocks and general-logic blocks (FPGA / CGRA / SIMT).

The organizing physical idea is **GALS** — Globally Asynchronous, Locally Synchronous — and its
slogan:

> Synchrony has a *radius* and a *price*.

A clock is a shared fiction. Inside its radius, time is totally ordered and effectively free, so
control flow is correct and optimal. Outside that radius, total order does not physically exist —
it can only be *simulated* at cost, and the honest semantics is *partial order plus messages*.
This is why dataflow is treated as the natural, physically grounded model and control flow as an
optimization valid inside the radius. (The industry has already been forced back this way: out-of-order
execution is dataflow inside every CPU, and chiplets/NoCs are message passing on-die.)

The logical rule that falls out of this is the spine of Hest:

> **Control flow *inside* fibers and threads; dataflow and messaging *between* them.**

<figure class="fig">
<svg viewBox="0 0 640 220" role="img" aria-label="Two synchronous islands, each running control flow internally, connected by asynchronous dataflow edges between them." xmlns="http://www.w3.org/2000/svg">
  <style>
    #hest-gals { --ink: #1c1c22; --muted: #6b6b78; --edge: #8a8594; --island: #5b4be0; --fill: rgba(91,75,224,0.08); }
    @media (prefers-color-scheme: dark) { #hest-gals { --ink: #e9e9f0; --muted: #a0a0ad; --edge: #7d7790; --island: #9d8cff; --fill: rgba(157,140,255,0.12); } }
    :root[data-theme="light"] #hest-gals { --ink: #1c1c22; --muted: #6b6b78; --edge: #8a8594; --island: #5b4be0; --fill: rgba(91,75,224,0.08); }
    :root[data-theme="dark"]  #hest-gals { --ink: #e9e9f0; --muted: #a0a0ad; --edge: #7d7790; --island: #9d8cff; --fill: rgba(157,140,255,0.12); }
    #hest-gals text { font: 13px ui-sans-serif, system-ui, sans-serif; fill: var(--ink); }
    #hest-gals .m { fill: var(--muted); font-size: 11px; }
    #hest-gals .isl { fill: var(--fill); stroke: var(--island); stroke-width: 1.5; rx: 10; }
    #hest-gals .e { stroke: var(--edge); stroke-width: 2; fill: none; }
  </style>
  <g id="hest-gals">
    <rect class="isl" x="24" y="44" width="220" height="120" rx="10"/>
    <rect class="isl" x="396" y="44" width="220" height="120" rx="10"/>
    <text x="134" y="34" text-anchor="middle">synchronous island (xPU)</text>
    <text x="506" y="34" text-anchor="middle">synchronous island (xPU)</text>
    <text class="m" x="134" y="110" text-anchor="middle">control flow inside</text>
    <text class="m" x="506" y="110" text-anchor="middle">control flow inside</text>
    <path class="e" d="M244 92 H396" marker-end="url(#ah)"/>
    <path class="e" d="M396 128 H244" marker-end="url(#ah)"/>
    <text class="m" x="320" y="84" text-anchor="middle">async dataflow edge</text>
    <text class="m" x="320" y="150" text-anchor="middle">typed channel · message</text>
    <defs>
      <marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
        <path d="M0 0 L7 3 L0 6 Z" fill="var(--edge)"/>
      </marker>
    </defs>
  </g>
</svg>
<figcaption>GALS, lifted from the chip to the system: control flow lives inside each synchronous island; dataflow and messaging carry values between islands.</figcaption>
</figure>

## The central idea: a lattice of vertex classes

Because Hest must bridge *xPU cores ↔ FPGA/CGRA ↔ SIMT* transparently, a vertex needs gradations
of "how static it is." The framework organizes this as a **lattice of vertex classes** — one
mechanism that closes three problems at once (the hardware bridge, decidability, and determinism):

| Class | Discipline | Targets | Theory |
|---|---|---|---|
| **0 — pure** | no state, no time | everything: fusion, a SIMT kernel, a LUT | — |
| **1 — synchronous** | statically bounded state, static rates/clocks, no heap | FPGA / CGRA, SIMT, full fusion, WCET | Lustre / SDF — everything decidable |
| **2 — KPN fiber** | arbitrary control flow inside, blocking ports, private state | xPU cores | Kahn: determinism for free under any schedule |
| **3 — explicit nondeterminism** | merge, timeouts, external I/O | graph boundary, quarantined | Brock–Ackerman: must be visible in the type |

Three properties make this the load-bearing construct:

- **The bridge is narrowing a vertex's class, not switching languages.** The *same* Logos code;
  the more static a vertex is, the more backends it can target. A class-1 vertex maps per target —
  CGRA, eFPGA, SIMT, or a fused CPU loop; a class-2 KPN fiber maps to an xPU core; class-3 is
  quarantined at the boundary.
- **Determinism is a discipline, not a promise.** A class-2 vertex is deterministic by Kahn's
  theorem — blocking reads and no "is the channel empty?" peek — so the graph's result is
  independent of scheduling. Nondeterminism (merge, real-time timeouts) is legal only as an
  **explicit, typed escape**, like `unsafe`.
- **The class is inferred**, with the option to *declare* one and get an error on escape — the
  way `const fn` works today.

The "synchronous mode" Logos compiles to today is, in this picture, just a degenerate case: a
one-vertex class-2 graph running on a CPU.

## Time, and incrementality

Hest carries time at three levels, each with a ready theory rather than an invention:

- **Inside an island** — total order; clocks-as-types (Lustre's clock calculus, formalized as a
  type system); the causality rule "a cycle must cross a delay."
- **At an island boundary** — the analog of clock-domain crossing; N-synchronous Kahn networks
  give a *statically computable* buffer size.
- **Between islands, globally** — partial order; timestamps as lattice elements (the timely /
  Naiad model, with a frontier protocol for progress).

The gluing invariant is **Carloni latency-insensitivity**: composing synchronous blocks through
elastic channels is functionally invariant to channel latency. This is the proven-for-circuits
version of Kahn's theorem — *the same graph is semantically correct from a NoC to an
interplanetary link.* Generalization to extreme latencies is a consequence of choosing KPN
discipline, not a hope.

The algebra underneath is **DBSP**: streams, a delay operator, differentiation `D` and
integration `I`, with incrementalization expressed as the mechanical transform
$Q^{\Delta} = D \circ Q \circ I$, and Z-sets (integer-weighted multisets) that make retraction
free. Incrementality is an *algebraic program transformation* — which is exactly why it belongs
in a compiler rather than in application code.

## Dataflow, streaming, eventflow — one graph

Three words the industry conflates, kept orthogonal here:

- **Dataflow** is about the *structure* of computation: an operator graph, executed by data
  availability. Its problems are spatial — topology, edge types, firing rules, cycle causality,
  determinism, buffer bounds. It says nothing about whether the data is finite.
- **Streaming** is about the *nature of the data*: unbounded, arriving over time, needing
  incremental results. Its problems are temporal — watermarks and frontiers, windows, event-time
  vs processing-time, late data.
- **Eventflow** earns its name only as a **typed profile of the one graph**. Most of the
  "events vs data" distinction is empty (a firing *is* an event). The one piece that carries real
  weight is **reaction to absence** — reacting to *non-occurrence* (a timeout, "A not followed by
  B within T"). The insight that tames it: you never observe absence directly; you observe the
  *closing of an instant* and note that nothing arrived —
  *react-to-absence ≡ presence-of-close-marker ∧ ¬arrival.* Determinism then follows the marker
  (a clock tick and an epoch-close are deterministic; a physical timer is the nondeterministic,
  class-3 case).

So Hest is **one operator graph, edge-typed and marker-explicit** — not two paradigms bolted
together. And it generalizes machinery Logos already has: stratified negation in Datalog (you may
negate only a fully computed relation) is the *same* disciplined absence-primitive in the
deductive domain, and it already works and is differentially tested.

## The engine underneath

Hest depends on, and waits for, the **incremental Datalog / DBSP engine** — the reasoning line that
powers [Deem](/deem/introduction/). That engine plays two roles for Hest:

- **The selector substrate.** Reasoning *about* dataflow — causality, clock discipline,
  vertex-class inference, stratification, state-escape — runs as Datalog programs on the same
  engine. This has strong precedent: Polonius (borrow-check as Datalog), Doop/Soufflé (pointer
  analysis), chalk (trait solving), egglog. The engine's incremental analyses are the *fast front*
  of a slow hardware loop: edit a vertex, re-derive causality and resource budgets in
  milliseconds, before hours of place-and-route.
- **A prototype of Hest's semantics.** Z-set deltas, epochs, and delta-discipline operators are
  exercised in the engine before they become language constructs, and its batch-fixpoint mode is
  the differential oracle for the incremental mode.

One separation matters and is easy to get wrong: **the Datalog/DBSP engine is single-threaded.**
It is an ordinary sequential Logos program, like the compiler itself — no fibers, no channels, no
concurrency; deltas propagate as plain in-process loops; an "epoch" there is a *logical batching*
concept, not a concurrency mechanism. Fibers, channels, and distribution belong to **Hest**, the
later layer that will eventually distribute the engine. They must not leak into the engine's
design.

## Memory is the compute model

A load-bearing architectural fact from LCM: **there are no coherent caches.** Shared memory is
made of **immutable persistent data structures** — and that is exactly what
[Writ](/writ/introduction/) is (relocatable, immutable byte blobs with structural sharing).
Sharing an immutable value is passing a token: no writes to shared locations, so no coherence
protocol, no visible reordering, no manually established happens-before, no ABA. The impedance
mismatch "shared memory ⟂ dataflow" that created the whole lock-free world on coherent CPUs is
*absent by construction*. Checkpoint and migration of an operator's state are nearly free —
because the state is an immutable Writ snapshot you reference, not a live object you serialize.
(The residual cost is honest: the "current version" is one mutable cell that still needs a
serialization point, allocation churn trades against locality, and distributed reclamation of
shared immutable structure across xPUs is a genuinely open problem.)

## Why this can work: the author changed

Every prior dataflow language — Lustre, occam, StreamIt, Rx — was defeated not by its technique
but by **human authoring cognition**: holding a global topology in your head, reading non-linear
graphs, debugging across a distributed mesh. Logos's premise flips the constraint:

> Logos is meant to be used by AIs, not (primarily) by humans.

Dataflow is a **width-shaped** task — hundreds of simultaneous shallow constraints (port
compatibility, wiring, epoch discipline). Control flow is **depth-shaped** — long causal chains
simulated serially. A model's attention is parallel and content-addressable over a very wide
window; declarative topology is its *home* paradigm, not one it tolerates. The selector (types,
causality, stratification, determinism) stays load-bearing — width is not reliability — but now as
a guarantee that *multiplies* with a stronger author instead of compensating for a weak one. This
is a strategic thesis (models write, humans read and own the graph), not a claim about ergonomics
history.

## What exists, and what does not

To be precise about maturity, because none of this is buildable yet:

- **Accepted:** the reframing of Hest as the language's dataflow aspect; the theoretical framework
  above; Hest's dependency on the incremental engine and the resulting critical path; the
  strategic hardware target (LCM-compatible CGRA + eFPGA arrays, *not* standalone FPGA); and the
  resolution that a deterministic core is a must-have with nondeterminism as an explicit typed
  escape.
- **Named but not designed:** the only surface committed to is an **entry path** — a static-first
  metacall such as `flow!{ … }`, modeled on today's `deem!` macro (topology is built at
  elaboration time, the Chisel model). Proposed **edge types** `Signal⟨T⟩` (present every clock)
  and `Event⟨T⟩` / `Delta⟨T⟩` (discrete occurrence), and a proposed vertex annotation
  `may_suspend`, exist as *names*, nothing more.
- **Not designed at all:** there is **no concrete grammar, no operator set, no channel-declaration
  syntax.** A grammar keyword is deliberately deferred until the metacall surface proves the
  capability. Streaming/eventflow in the ADR, CEP/windows, and a dense clausal rule profile are
  explicitly deferred.

That is why this section is an introduction only. When the ADR lands a concrete surface, a
Tutorial and Reference will follow.

## Related

- [Deem: the query & reasoning engine](/deem/introduction/) — the incremental Datalog/DBSP engine Hest depends on and reasons with.
- [Writ: the data substrate](/writ/introduction/) — the immutable persistent structures that *are* LCM's shared memory, and Hest's operator state.
- [Language Overview](/docs/language-overview/) — where the dataflow aspect sits among Logos's design axes.
