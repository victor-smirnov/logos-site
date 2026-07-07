# Hest — Dataflow as a First-Class Logos Language Feature

**Design-source document.** This is an extraction and light editorial reorganization of a
single Claude Code design session on Hest and the Logos dataflow model
(session `f66d7d93-8599-48ea-8115-822f0044479e`, dated 2026-07-02 … 2026-07-04). It is meant
to be the authoritative internal source for later public docs. It records the design decisions,
terminology, rationale, open forks, and deferred items **as the session established them** — it
adds no design of its own. Where the session leaves something open or uncertain, that is stated.

Primary inputs to this extraction:

- The full design conversation (user × assistant turns) of the session.
- The consolidated project-memory note `project_hest_dataflow_language.md` (the dense, authoritative
  summary the session itself wrote and repeatedly revised; its final on-disk state is treated as canonical).
- The pre-existing repo doc `docs/language/hest.md` (the *narrow*, pre-reframing framing — kept here
  for contrast, since a stated goal of the session was to note the gap between it and the new initiative).

> **Naming note.** Throughout, Russian phrases from the session are paraphrased/translated into English.
> Verbatim material the session marked as canonical (the "Сводка каркаса" / *framework summary* code block)
> is preserved verbatim in its original Russian in a fenced block, with an English gloss alongside.

---

## 0. Status and maturity

- **Phase:** active *design* phase. No Hest implementation exists yet. The session is theory/ADR groundwork.
- **Scale declared by the user:** Hest is "a second Logos + Writ" in scope — «если уж делать, то делать
  серьёзно» ("if we do it, we do it seriously"): a full design phase (ADR, forks, blessing per the
  Rust-extension category), not a sprint.
- **What is *accepted* (blessed by the user in-session):**
  - The reframing of Hest as the language's **dataflow aspect** (2026-07-02).
  - The **theoretical framework** — the «Сводка каркаса» (framework summary), accepted verbatim
    2026-07-03, with two post-acceptance corrections integrated (compilation-direction thesis; FPGA/roundtrip).
  - The **consolidated resume** (2026-07-03) fixing Hest's dependency on the incremental engine and
    the critical path.
  - The **strategic target** (LCM-compatible hardware from independent vendors; CGRA + eFPGA, not standalone FPGA).
  - **CIRCT = oracle, not dependency.**
  - **Dataflow vs eventflow resolved:** eventflow is a *typed profile* of the one operator graph, whose only
    non-empty added semantics is *reaction-to-absence*, itself reduced to a boundary marker.
  - **The Datalog/DBSP engine is single-threaded**; concurrency/fibers/distribution belong to Hest, a *later*
    layer — they must not leak into the engine (correction 2026-07-04).
- **What is still open:** several vertex/entry/determinism forks (see §14), and the mechanical clock-calculus
  and lattice-class membership criteria that the ADR still has to work out.
- **Gate:** Hest work *waits* for the incremental dataflow engine (the WQL→DBSP line) to mature. Design/theory
  work proceeds in parallel and is not gated.

---

## 1. What Hest is — the reframing

### 1.1 The user's declaration (2026-07-02)

Hest is **not** merely the family of communication protocols. It is **the language's dataflow aspect** —
«первое серьёзное расширение Logos относительно Rust» (*the first serious extension of Logos relative to Rust*).
Dataflow/eventflow becomes a **first-class language feature**.

Under this reframing, the things that used to *be* Hest become **particular applications / projections** of it:

- **HRPC** ("Hest RPC") — the first wire member;
- **LCM streaming** — a delta-stream profile;
- **WQL standing queries** — the first *client* of the dataflow engine.

The user's explicit framing (important, and the reason this doc exists): **the communication protocols are
PART of the dataflow model, not a separate meaning.** The comms family is not a sibling concept to dataflow;
it is one face of it. The unit of composition rises above the function: **the unit of composition above `fn`
is the operator graph.**

This positions Hest in a new category relative to Rust. Beyond the *blessed divergences* from Rust that Logos
already permits, this opens an **extension** category: where Rust extended control flow *inward* with `async`,
**Logos extends *outward*** — the operator graph is the composition unit above the function.

### 1.2 The gap with the old doc (noted, not yet fixed)

The repo doc `docs/language/hest.md` still carries the **narrow** framing:

> "Hest is Logos's family of native communication protocols — RPC, streaming, and messaging. Where Writ is how
> Logos data is *shaped*, Hest is how it *moves* between systems… integrated into the language rather than bolted
> on as a library."

The session flags this as the first work item: **the documented Hest ≠ Hest-as-initiative.** In the old doc the
unit of composition is the *protocol*, not the operator graph. The reframing is fixed in memory but not yet in
the repository.

For the record, the old doc's still-valid substance (which the reframing *subsumes*, not discards):

- **The name.** *Hest* — Old English *hǣs* "command, bidding" (root of *behest*); doubles as Danish/Norwegian
  *hest* "horse", the workhorse courier. It completes a triad: **Logos** (meaning) — **Writ** (the written
  record) — **Hest** (the courier that bears the Writ).
- **Writ is the payload format.** Requests/responses/stream messages are Writ documents; no serialize/deserialize
  at the API boundary; zero-copy on shared-memory transports.
- **Interfaces are an IDL with codegen** (small protobuf-like IDL → client/server stubs).
- **Concurrency is Logos-native** (green fibers); streaming maps onto language channels — a call carries
  **N input channels and M output channels**, generalizing unary / client-stream / server-stream / bidi.
  *This N-in × M-out signature is, under the reframing, the signature of a dataflow vertex — not an RPC quirk.*
- **Designed for direct hardware implementation** (small, regular wire shape → realizable in hardware).
- **HRPC** — the one realized member: bidirectional typed RPC and streaming, IDL-driven codegen, a fixed
  16-byte frame header plus a Writ payload, one connection multiplexing all calls. C++ implementation present;
  Logos-side (green-fiber) implementation planned. The `H` is **Hest**, not HTTP; Hest framing is its own.

### 1.3 Consolidated definition (user, 2026-07-03)

Dataflow in Logos is **system-oriented** — it presupposes a concrete *physics of the process*: distributed
computing systems + incremental computation. It is **not an abstract aspect**; it derives from the **Logos
Compute Model (LCM)** and generalizes *toward* FPGA/CGRA.

> **Hest = the concrete dataflow model that will *result* from these inputs.**

Its coverage:

- **(a) the compiler itself** — which becomes dataflow-native internally; the current "synchronous" mode
  becomes the CPU-oriented special case;
- **(b) the base language's type system** — extended for native dataflow support: **new syntax, new memory models.**

Hest **actively relies on** the new incremental dataflow engine (the WQL→DBSP line, currently in development).
Hest work *waits* for that engine's sufficient maturity. Once it matures, the `logosc` → Logos self-hosted
rewrite begins, and the new compiler is built to support the LCM-variant of dataflow from day one.

---

## 2. Why first-class (not a library)

The compiler **must see the graph.** First-class dataflow = the topology *is* a language construct (with its
own statics: port types, causality, schedule), not an object a library assembles on the heap at runtime.

Three capabilities follow that libraries structurally cannot have — the session's test of "first-classness":

1. **Verification** (before running): edge type-compatibility, absence of illegal cycles, bounded memory.
2. **Transformation**: fusion (pipeline → single loop), fission (operator → N parallel copies), partitioning.
3. **Retargeting**: one graph → one process / cluster / hardware.

The compiler-visible checks Hest wants: edge type-compat; **causality** (cycles need a delay/epoch op, cf.
Lustre); generalized **stratification**; **state privacy** (operator state never escapes ⇒ no coherency problem,
matching LCM/PDS). Libraries (timely, Rx, DBSP-in-Rust) hit a ceiling — they cannot fuse / partition / verify
what they cannot see. Logos owns the compiler + metaprogramming + substrate, so it can break that ceiling.

(Aside from the survey, §12: "dataflow analysis" in the classical-compiler sense — reaching definitions,
liveness — is unrelated; it analyzes *imperative* programs. Rx/timely/Spark are dataflow *systems* but
*second-class* dataflow: the graph exists only as a runtime value.)

---

## 3. Why it can win — the strategic thesis

**«Logos предназначен для использования ИИ, а не людьми :)»** — *Logos is meant to be used by AIs, not humans.*

The adoption barrier that killed every dataflow predecessor (Lustre, occam, StreamIt, Rx) was **human authoring
cognition** — holding a global topology in the head, non-linear reading, distributed debugging — **not the
technique.** Model-first authorship removes that barrier:

- declarative topology = structured output (a model's native register);
- static selectors (types / causality / stratification / determinism) = the mass-independent error filter;
- iteration at machine speed.

**The paradigm-processor match flips with the author.** Imperative won the human era because languages mirror
their authors' cognitive architecture (serial narrative cognition × von-Neumann machine). The model genuinely
*is* the better topology-thinker: attention = parallel content-addressable access over a ~1M-token window vs
human working memory of ~4 chunks. Dataflow is a **width-shaped** task (hundreds of simultaneous shallow
constraints: port compatibility, wiring, epoch discipline); control flow is **depth-shaped** (long causal
chains, serial mental simulation). Width-native attention makes declarative topology the models' *home*
paradigm, not a tolerated one.

The **selector stays load-bearing** (width ≠ reliability: confabulated edges, multi-hop error compounding) —
but now as the mass-independent guarantee *multiplying* with a stronger author, not compensating for a weak one.
Consequences the session drew:
- the "regularity/explicitness/diagnostics > terseness" inversion generalizes from WQL to the whole Hest axis;
- the **deterministic-core fork resolves to must-have** (the selector must be airtight as authorship volume scales);
- **graph visualization** joins the human-readability obligation (the human reads the *graph*, not the wiring code).

This is a *strategic* thesis (models write, humans read/own), **not** an ergonomics-history claim.

---

## 4. The theoretical framework — «Сводка каркаса» (accepted verbatim)

The user accepted the following framework summary verbatim (2026-07-03), with post-acceptance corrections
integrated (the compilation-direction thesis and the FPGA/roundtrip line — see §7 and §10). This is the
design base for the Hest ADR.

```
физика:     синхронность имеет радиус и цену  →  GALS
семантика:  Kahn (детерминизм) + решётка классов вершин 0/1/2/3
время:      клоки-как-типы (остров) / CDC+N-synchronous (граница) / lattice-time (глобально)
инвариант:  Carloni latency-insensitivity — от NoC до космоса
отказы:     end-to-end + типизированные контракты каналов + реплей-восстановление
алгебра:    DBSP (инкрементальность = трансформация программы)
компилятор: DF→CF = исполнение (механика, каждая сборка); CF→DF = миграция
            (AI-авторство × селектор; on-ramp легаси в Hest); батч+IDE из одного источника
мост:       сужение класса вершины, не смена языка; elaboration = metacall;
            эквивалентность бэкендов по построению (медленный FPGA-цикл — только PPA;
            CGRA = compile-time sweet spot; вершина = DFX-регион)
```

English gloss, line by line:

- **physics:** synchrony has a *radius* and a *price* → **GALS** (Globally Asynchronous, Locally Synchronous).
- **semantics:** **Kahn** (determinism) + the **vertex-class lattice** 0/1/2/3.
- **time:** clocks-as-types (island) / CDC + N-synchronous (boundary) / lattice-time (global).
- **invariant:** **Carloni** latency-insensitivity — from NoC to deep space.
- **failures:** end-to-end argument + typed channel contracts + replay recovery.
- **algebra:** **DBSP** (incrementality = a program transformation).
- **compiler:** DF→CF = *execution* (mechanical, every build); CF→DF = *migration*
  (AI authorship × selector; on-ramp for legacy code into Hest); batch + IDE from one source.
- **bridge:** narrowing the vertex *class*, not switching languages; elaboration = metacall;
  backend equivalence by construction (the slow FPGA loop is only PPA; CGRA = compile-time sweet spot;
  a vertex = a DFX / partial-reconfiguration region).

Every line has established literature behind it; **the invention is the composition** — the first assembly of
all of it *inside one language* that also has zones, Writ, and metaprogramming.

The following sections unpack each layer.

---

## 5. Execution model = LCM concretized

The dataflow model is not abstract; it derives from the hardware possibilities formulated in the **Logos
Compute Model (LCM)**.

**Philosophy.** Dataflow (DF) is the **natural, physically-grounded model of computation**; control flow (CF)
is an **optimization** valid where "synchronous time" is cheap. Cheap synchrony came from silicon
miniaturization; that dividend is exhausted (physics limits), and the bottom layer has already returned to
out-of-order execution (OoOE = dataflow inside every CPU). Frame: **synchrony has a radius and a price;
CF is valid inside the radius.**

**The physical thesis has a canonical name: GALS + "radius of synchrony".** A clock is a shared fiction with a
price (clock distribution tree, skew margins, worst-path timing closure) and a radius (where that price still
pays). Inside the radius, time is totally ordered and free ⇒ CF is correct and optimal. Outside, total order
does not physically exist — it can only be *simulated* at cost; the honest semantics is *partial order +
messages*. The LCM xPU model is GALS lifted from the chip level to the system level. Confirming milestones:
end of Dennard scaling (~2006), wire delay overtaking gate delay, dark silicon → specialization → heterogeneous
SoCs / chiplets / NoC (already message-passing on-die), and OoOE as dataflow returning inside the core.

**Execution model (LCM concretized).** A distributed system of **xPUs**:

- internally synchronous; **multithreaded = parallelism**, **multifiber = concurrency**;
- exchanging **asynchronous messages over potentially unreliable channels** — relying on the *statistics* of the
  error distribution for planned handling / compensation;
- plus distributed **memory and function blocks** (storage, network the same);
- plus general-logic blocks: **FPGA / CGRA**.
- Transputer-adjacent.
- **Requirement:** support for FPGA / CGRA / SIMT (CUDA / RDNA / Vulkan Compute) **and a transparent bridge
  between them.** Concreteness over abstraction, but generalizable to extreme latencies (space).

**Logical level:** **CF *inside* threads/fibers; DF + messaging *between* them.** The topology and channel
formats (physical channel properties) are dictated by the capabilities of current hardware. This resolves the
vertex fork substantially toward **fiber-with-typed-ports (KPN discipline)**, not SDF-filter-only.

---

## 6. The central construct — the vertex capability lattice

"CF inside fibers/threads, DF between" essentially decides the vertex fork: a vertex = a **fiber with typed
ports** (a Kahn process), not an SDF filter. But the "transparent bridge" xPU ↔ FPGA/CGRA ↔ SIMT needs
gradations of staticness. The framework organizes this as a **lattice of vertex classes** — one mechanism
closing three things at once (the bridge, decidability, determinism):

| Class | Discipline | Targets to | Theory |
|---|---|---|---|
| **0: pure** | no state, no time | everything: fusion, SIMT kernel, LUT | — |
| **1: synchronous** | statically-bounded state, static rates/clocks, no heap | FPGA/CGRA, SIMT, full fusion, WCET | Lustre/SDF; everything decidable |
| **2: KPN-fiber** | arbitrary CF inside, blocking ports, private state, `may_suspend` | xPU | Kahn: determinism; Turing-complete ⇒ buffers by credit protocol |
| **3: explicit-nondet** | merge, timeouts, external I/O | graph boundary, quarantined | Brock–Ackerman: must be visible in the type |

Key properties:

- **The 1/2 boundary is exactly Buck's theorem** — the first control-dependent route kills static decidability
  (SDF + `switch`/`select` = Turing-complete ⇒ boundedness and deadlock undecidable).
- **Class 2 stays deterministic by Kahn** (port discipline, not trust in the author).
- **The bridge = narrowing the class, not switching languages** — the *same* Logos code; the more static the
  vertex, the more backends it targets.
- The compiler **infers** the class (with the option to *declare* one and get an error on escape — like `const fn`).
- The **"current synchronous mode"** in this picture = a degenerate one-vertex class-2 graph on CPU.

**Targetability per class** (with the strategic target of §11): **class-1** vertex maps per-target by the
compiler — CGRA | eFPGA | SIMT | fused-CPU; **class-2** KPN → xPU cores; **class-3** is quarantined at the
graph boundary. This lattice is described as *the transparent bridge*.

---

## 7. Time discipline — three levels, three ready theories

Matching the user's intuition "temporal constraints → into the type system": yes, and it has been done once
already — **Lustre's clock calculus is formalized as a type system** (Colaço–Pouzet, "clocks as first-class
abstract types"; in Lucid Synchrone clocks are *inferred*, HM-style). But Hest has three time levels, with
different typing discipline at each:

- **Inside an island** (xPU core, FPGA region): total order; **clocks-as-types**; causality rule "a cycle must
  cross a delay". The classical calculus applies as-is.
- **Island boundary** (analog of clock-domain crossing in hardware): explicit transition constructs —
  delay/epoch operators. The ready formalism for an "elastic" boundary: **N-synchronous Kahn networks**
  (Pouzet et al., POPL 2006) — relaxed synchrony where clocks relate through an *envelope*, and the boundary
  type yields a **statically computable buffer size**.
- **Between islands, globally:** partial order; timestamps as lattice elements — the timely/Naiad model
  (multidimensional time `(epoch × iteration)` gives incremental recursion; a frontier protocol for progress).

**The gluing theorem (and the "space" generalization): Carloni latency-insensitive design**
(Carloni–McMillan–Sangiovanni-Vincentelli, 2001) — composing synchronous blocks through elastic channels is
*functionally invariant to channel latency*. This is the hardware (literally proven-for-circuits) version of
Kahn's theorem: the semantics of classes 1–2 does not depend on delays; only performance changes. **The same
graph is semantically correct from NoC to an interplanetary link** — "generalization to super-latencies" is
not a hope but a consequence of choosing KPN discipline. (The quantitative side — latency/throughput budgets —
has apparatus too: max-plus algebra for SDF, network calculus / stochastic network calculus for statistical guarantees.)

---

## 8. Dataflow vs streaming (an orthogonality the session insists on)

These are two different axes the industry keeps conflating:

- **Dataflow** is about the *structure of computation*: computation = an operator graph; execution moves by data
  availability, not a program counter. It says nothing about whether the data is finite. Its problems are
  **spatial**: topology, edge types, firing rules, cycle causality, determinism, scheduling, fusion, buffer bounds.
- **Streaming** is about the *nature of the data*: input is **unbounded**, arrives over time (possibly out of
  order), results are needed incrementally. Its problems are **temporal**: when a result is "complete"
  (watermarks/frontiers), windows, event-time vs processing-time, late data, ever-growing state, exactly-once
  over an infinite horizon, backpressure as a steady state.

The axes are orthogonal — all four cells fill in:

| | finite data | unbounded data |
|---|---|---|
| **dataflow structure** | Spark batch DAG, TF graph, SISAL, build systems, compiler pipelines | Flink, Naiad, Lustre, **Hest** |
| **no dataflow structure** | ordinary program | hand-rolled event loop over a Kafka topic, CEP engine with a rule interpreter |

**Consequence for Hest — a separation of design responsibilities:**

- **Dataflow layer (structure):** vertices, ports, edge types, causality, determinism, fusion — what the
  compiler sees. Invariant to whether a batch or an infinite stream flows underneath.
- **Streaming profile (time):** epochs, progress/frontiers, windows, deltas — *additional* time semantics over
  the same structure. Needed only when the data is genuinely unbounded.

Litmus: a fixpoint-Datalog query over a static base and a standing query over a live log can execute on **the
same graph** — the difference is entirely in the time layer. This is exactly why, in the Hest layout, dataflow
is the *language aspect* and delta-stream is *one profile* over it — not a synonym.

---

## 9. Dataflow vs eventflow — resolved: one graph, marker-explicit

The user asked whether "eventflow" carries any real added semantics that isn't fabricated. The session's
answer (accepted): **most of the distinction is empty** (token = event; "data flows / events fire" is a
rebrand — a dataflow firing *is* an event). Two candidates carry real weight because their *algebra differs*:

**(a) Value persistence — signal/behavior vs event** (from FRP, where the distinction is principled):
- **Signal/behavior** — a value defined at *every* (clock) moment, samplable any time.
- **Event** — a discrete *occurrence* at isolated moments, with *nothing* in between.
- Proof they are different types, not shades: explicit conversions are required in both directions —
  `hold`/`stepper : Event a → Signal a`, `changes : Signal a → Event a`,
  `snapshot : Signal b → Event a → Event b`.

**(b) Reaction-to-absence — THE load-bearing one** (user: «вот это и надо» — *this is exactly it*):
reacting to *non-occurrence* (`timeout`, "A not-followed-by B in T", `present S else…`), inexpressible as a
monotone function of input-token *values*. Pure KPN *forbids* it (checking "is the channel empty?" breaks
Kahn determinism); synchronous Esterel *has* it (`present S then… else…` within an instant).

**Litmus:** if an operator is expressible as a monotone function of input-token *values* ⇒ **dataflow**; if it
needs their *timing / order / non-arrival* ⇒ genuinely **eventflow**. (`map/filter/join/fold` = dataflow;
`timeout`, `A before B within T`, `sample signal at tick of clock C`, `emit if absent` = eventflow. CEP
temporal operators are a weaker third candidate, readable as "dataflow + a time axis".)

### 9.1 The key insight — absence is not a primitive; the boundary marker is

You never observe "absence" directly (that would be a race — it might arrive later). You observe the **closing
of an instant** and note that no value occurred inside it:

> **react-to-absence ≡ presence-of-close-marker ∧ ¬arrival**

This turns the danger into something managed: the nondeterminism lives **entirely in how deterministic the
closing marker is**, not in "absence". Three instant-closing disciplines = the three time levels of §7:

| Close marker | Where | Deterministic? | Precedent |
|---|---|---|---|
| **clock tick** | synchronous island (class-1) | yes (constructive semantics) | Esterel `present S else…`, Lustre |
| **epoch-close / frontier** | boundary/global (class-2) | yes, relative to the epoch | DBSP deltas, timely frontier, watermark |
| **physical timer** (`absent 5s`) | real time | **no** — timer-vs-arrival race | class-3, explicit escape |

**Determinism follows the marker** — which reconciles reaction-to-absence with the deterministic-core must-have.
(Flink's watermark is "heuristic"; Naiad's frontier is "exact" — that *is* the determinism contract, an axis:
marker reliability.)

### 9.2 The unification — one primitive in four guises

Once you see "absence = close-marker ∧ ¬arrival", four things become **one**:

- **Esterel** `present/else` — synchronous instant;
- **streaming** `timeout` / watermark-closed window — temporal instant;
- **Datalog stratified negation / antijoin / NOT-EXISTS** — deductive instant (a stratum closed = the relation
  is fully computed);
- **DBSP retraction** (a negative-weight delta = a fact became absent → dependents retract) — incremental instant.

**The deductive case is ALREADY BUILT and differentially tested** — stratified negation in static-Datalog
(slice C) and in the queue-2 interpreter (see `project_writ_query_language`). Stratification *is* the
"closed-instant discipline" for the logical world: you may negate only a fully computed relation (lower stratum
= instant closed), and a negation cycle through recursion is already caught as an error. So there is a working,
deterministic instance of the disciplined absence-primitive. **Eventflow *generalizes* stratified negation from
the deductive domain to the synchronous and temporal domains — it does not invent new machinery.**

### 9.3 Causality and design consequences

- **Causality (ADR checklist):** a cycle *through* an absence-test must cross an instant boundary (`pre`/epoch),
  else a causality error — the Esterel constructive paradox ("emit S iff S absent"). The causality checker must
  treat absence-tests as boundary-requiring.
- Model the **explicit boundary marker** (tick / epoch-close / watermark / stratum-complete), **not** absence,
  as the primitive.
- The react-to-absence operator is **typed**: legal only where the involved edges share a marker in scope
  (the Lustre clock-compatibility rule).
- Determinism is **inherited from the marker** (logical → class-1/2; physical-timer-race → class-3).
- **Reuse/generalize** existing stratified negation; do not reinvent.

**Conclusion:** "eventflow" earns its name **only as a typed profile of the one operator graph** —
edge type ∈ {`Signal⟨T⟩` present-every-clock, `Event⟨T⟩`/`Delta⟨T⟩` discrete-occurrence}; absence/timeout/
temporal operators legal only on `Event` edges / at a synchronous boundary. **Not a second paradigm.**
Per "profiles, not forks": the ADR must **not** introduce dataflow and eventflow as two entities — one graph,
edge-typed, marker-explicit.

> **User steer (2026-07-03):** this does *not* need to go into the ADR now — "we'll decide it in private when
> streaming is actually needed." So the eventflow analysis is accepted as understanding, but explicitly
> **deferred** as an ADR deliverable.

---

## 10. Compilation direction — DF→CF vs CF→DF

The strongest single argument for the whole program, in its corrected form (the user's correction is load-bearing):

- **DF→CF is a mechanical, decidable task** (schedule an explicit partial order into a sequence — scheduling,
  fusion). It works brilliantly: Lustre compiles a whole graph into one step function; StreamIt into pipelines;
  DBSP into chains of incremental operators. This is the **execution** direction — semantics-preserving *by
  construction*, deterministic algorithm, every build, free.
- **CF→DF** (recover the hidden partial order from linearized code) is *not* a closed graveyard. It failed only
  **under the human-era classical-compiler contract**: prove-for-all-inputs, be conservative under any
  uncertainty, and — crucially — **no information injection from outside the artifact** (the compiler is
  forbidden to *author*).

**The failure was information loss, not technique.** Linearization is lossy: the programmer knew two pieces were
independent, but the sequential text does not *contain* that fact and a conservative analysis must assume the
worst. The classical *successes* track information *survival*: polyhedral/affine loops, SQL (declarativity =
independence by construction), OpenMP pragmas and `restrict` (manual info injection). So:

- **User's correction (2026-07-03):** the CF→DF verdict was "failed *for humans*". An AI has a different
  cognitive profile; the question **reopens.** (Cited pattern: many "impossible" verdicts were proven *inside a
  regime* — economic, institutional, cognitive — and misread as physics; systematic re-audit is a cheap
  screen. The Musk rocket-landing analogy: recorded as a separate lens, `insight_reaudit_human_era_impossibles`.)
- **Reframing:** **CF→DF = a migration technology; DF→CF = an execution technology.** AI re-authors — it
  supplies the independence information lost in linearization; the selector verifies. The language is designed
  around the *mechanical* direction: dataflow is the **normal form** into which recovered parallelism is
  deposited *once*, after which you live where the cheap direction suffices. The expensive direction runs on
  the way in, not on every build.

**This *strengthens* Hest, it does not compete with it.** AI-recovered independence must land somewhere
*checkable*: pragmas/threads/locks are unverifiable (an error is a prod heisenbug); a Hest graph is checked by
all the statics Hest carries (port types, causality, determinism-by-discipline) plus differential testing
against the source, where the **deterministic core + replay** make equivalence checking practical. **Hest is the
selector for AI-recovered parallelism ⇒ the on-ramp for the whole legacy world into dataflow.** The first big
instance is self-referential: **the planned C++ → dataflow-first-Logos compiler rewrite is itself an AI-driven
CF→DF migration**, with the current compiler as the differential oracle.

**Batch + IDE from one source (the internal prize of the rewrite):** the rustc / rust-analyzer split is a
cautionary tale — two half-compilers duplicating semantics by hand. DBSP incrementalization is mechanical
(`Q^Δ = D∘Q∘I`): batch compilation = one epoch of a standing computation; the IDE = the same program fed deltas.
Incrementality is *derived*, not written.

---

## 11. Failures, channels, and the determinism dividend

"Relying on the statistics of the error distribution" is formalized in **channel types**: a channel carries a
**delivery contract + a statistical profile** (loss rate, reorder, corruption). Two anchors:

- **End-to-end argument** (Saltzer–Reed–Clark): exactly-once is a property of the *ends*, not the channel; the
  channel honestly gives at-most/at-least-once, compensation lives at the endpoints. Do not repeat the
  TCP-illusion in the language's semantics.
- **Determinism dividend:** a deterministic vertex + logged inputs = recovery by **replay** (the Flink/Naiad
  model); a checkpoint = a Writ snapshot of private state (relocatable bytes — an already-available asset). So
  the deterministic core, fixed as must-have for the *selector*, also buys fault tolerance — the same decision
  paying twice.
- **Practical bonus of statistics-in-the-type:** choosing **FEC vs ARQ** per link becomes a *compiler* decision
  — ARQ needs a round-trip (dead at light-minutes); FEC buys reliability with bandwidth and no RTT; the
  channel's statistical profile is exactly the input to that scheduling problem.

---

## 12. Datalog / DBSP engine — runtime substrate *and* selector substrate

The WQL/Datalog engine (extended to an incremental DBSP mode) plays three roles, each with a precedent:

1. **As computation** (DBSP incrementality, standing queries): already the plan; a Z-set batch = a columnar Writ.
2. **As the compiler's reasoning about the program**: precedents are stronger than expected — **Polonius**
   (Rust borrow-check reformulated as Datalog), **chalk** (trait solving as logic programming),
   **Doop/Soufflé** (pointer analysis as Datalog, the industrial standard), **egglog** (Datalog + e-graphs =
   optimizer via equality saturation). Clock/causality/stratification checks are reachability + fixpoints —
   Datalog-natural.
3. **Self-application**: a dataflow-first compiler whose analyses are incremental Datalog, running on the very
   substrate it compiles. Direct ancestor: **DDlog** (VMware Research; the DBSP experience grew out of it).

**Engine requirement (user, 2026-07-03):** the Datalog engine must **natively (reliably + high-performance)**
solve *reasoning about dataflow properties* in LCM/FPGA/CGRA. I.e. **the engine is the selector substrate** —
causality, clock discipline, vertex-class inference, stratification, state-privacy/escape all run **as Datalog
programs on it.**

Reasoning tasks → their Datalog class:

- **Purely relational / reachability** (the engine does these *today* — recursion + stratified negation exist):
  causality (every cycle crosses a delay/epoch = transitive closure over labeled edges); stratification checks;
  state-privacy/escape ("a reference does not leave the vertex" = reachability); vertex-class inference (max
  over the 0–3 lattice); port compatibility / type propagation.
- **Quantitative** (semiring/lattice class — where the engine must grow): SDF throughput (max-plus, maximum
  cycle ratio); latency (longest/shortest weighted path = recursive aggregation, which vanilla Datalog does not
  take); SDF balance equations (`Γq=0`, rational arithmetic); buffer sizes from N-synchronous envelopes;
  FPGA/CGRA resource budgets (LUT/BRAM/PE counts over a subgraph = aggregates; mapping feasibility).
- **Optimization** (partitioning, placement — min-cut, NP): the *search* is not Datalog, but **candidate check +
  incremental re-validation on edit** is native DBSP territory.

**Engine capability deltas (R1–R7)** — these are, the session notes, the skeleton of the future gate's
acceptance criteria:

| # | Requirement | Status |
|---|---|---|
| R1 | recursion + stratification | ✅ done (slices A–D + queue-2) |
| R2 | **recursive lattice/semiring aggregates** (min/max/sum through fixpoint — path latencies, budgets) | ❌ MISSING; hardest item; non-monotone naively; must be designed into incremental mode *now*. Precedent: **Flix** (Datalog with user-defined lattices, built for program analysis) |
| R3 | numeric domains (rationals for SDF balance eqs; intervals/envelopes for N-synchronous clocks) | ⚠️ partial (i64/f64; f64 out of keys) |
| R4 | **provenance/witness** for diagnostics ("cycle without delay: v1→v2→v3" = derivation tree; semiring provenance) | ❌ MISSING; a selector without "why" loses half its value for model authors (diagnostics = training signal) |
| R5 | incrementality (DBSP) | 🔄 the gate itself |
| R6 | Soufflé/Doop-class performance on compiler-scale fact bases | ⚠️ two paths: queue-1 (compiled — compiler analyses are known ahead ⇒ static queries via the native emitter) + persistent indexes/arrangements for large fact bases |
| R7 | determinism, no timeouts | ✅ already a design invariant |

**Two emphases:** **R2** is the hardest and must be baked into the incremental mode from the start (recursive
aggregation breaks naive semantics; solved by lattice semantics à la Flix, or careful monotonicity in Z-sets).
**R4** is quiet but mandatory (a selector that says "no" without "why" is mute).

**Strategic reading:** incremental analyses = the **fast front of the slow FPGA loop** — edit a vertex →
ms-scale re-derivation of causality/clocks/resources *before* hours-long P&R. "Reliable and high-performance"
is a *functional requirement of the selector role*, not a wish. And full self-application: dataflow-property
analyses are Datalog programs running on an engine that *is* dataflow; the incrementality of the analyses is the
same algebra as the computations.

**Gate becomes two-dimensional:** engine maturity now means not only "DBSP incrementality works and is
diff-tested against the batch oracle" but also "reasoning profile supported" (R2/R3/R4, at least in design; R2
in Z-set semantics from day one).

---

## 13. The single-threaded engine vs Hest — a critical separation (correction 2026-07-04)

An explicit user correction that must not be lost:

> **The Datalog/DBSP engine is NOT multithreaded.** It is an ordinary **single-threaded** high-level Logos
> program, like the compiler and the rest of the code. **No fibers/channels/concurrency in the engine**; deltas
> propagate as plain in-process loops/calls; "epochs" = a *logical batching* concept, **not** a concurrency
> mechanism; basic implementation for now.

Fibers+channels + distribution belong to **Hest** — the separate, later dataflow-fabric layer that will
*eventually* distribute the engine. They **must not leak** into the Datalog engine's own design. So:

- **Engine** = single-threaded (the DBSP track, the WQL line, currently in development).
- **Hest** = the distribution/transport substrate on top (a distinct concern).

The gate relationship is two-sided and useful: the engine is not just Hest's precondition — it is a **prototype
of Hest semantics** (Z-set deltas, epochs, delta-discipline operators are exercised there before they become
language constructs), and its batch-fixpoint mode is the **differential oracle** for the incremental mode.
"Engine maturity" is therefore simultaneously de-risking of Hest's vertex semantics, not only infrastructure readiness.

A further tail: because the deductive instance of the absence-primitive (stratified negation) already works and
is diff-tested, **reaction-to-absence semantics can be validated incrementally on the engine before any hardware
or syntax** — extending existing negation to a temporal marker on the same engine. The engine is the sandbox for
the most heavily-loaded semantics.

---

## 14. Design forks (open — user steer pending)

From the memory note; these were still open at the end of the session unless marked resolved:

- **Determinism contract** — assistant recommendation, and the session treats it as **resolved to must-have**:
  a deterministic core (KPN discipline + synchronous epochs), with nondeterministic merge as an **explicit typed
  escape** (like `unsafe`). (Resolution follows from the selector × authorship-volume argument.)
- **Item kind for a vertex/operator** — a typed-in/out-ports *item* vs a *fn-with-`Stream`-args*. The session
  leans (from §5's "CF inside, DF between") toward **fiber-with-typed-ports (KPN)**, but the exact item form is
  still an open fork. This is the *gating* question: what a vertex *is* as a language construct. (It is one
  question with the postponed VM — the VM's suspension/continuation model *is* the vertex's semantics: what a
  vertex is, when it sleeps, what wakes it, what survives suspension, how it composes with pinned fibers +
  `may_suspend`.)
- **Language types `Stream<T>` / `Delta<T>` (Z-set)** — whether these are language types; **epochs runtime-first,
  clocks-as-types (Lustre-style) as a later refinement.**
- **Entry path** — metacall surface first (`resource/flow!{}` like `wql!`), a grammar keyword only after the
  capability is proven (the static-first inversion replays). *Leaning: static/metacall-first.*
- **Naming** — Hest = the language aspect (like "zones" for the memory tier); **HRPC = the first wire member**;
  the **delta-stream profile = the second member** (epochs + exactly-once + credit flow control + a Z-set-batch
  Writ schema).

---

## 15. Entry syntax / API surface (what little exists)

The session did **not** design concrete Hest grammar. The only surface committed to is the **entry path**:

- **Metacall / static-first:** a macro surface such as **`resource/flow!{ … }`** (or `flow!{}`), modeled on the
  existing **`wql!`** macro. This constructs the graph topology *statically* at elaboration time — the
  **Chisel elaboration model**: metaprogramming *runs* during elaboration and *builds* the graph/netlist, rather
  than the host language being compiled to hardware. Static topology construction = the `wql!` playbook replayed
  (metacall/token_macro).
- A **grammar keyword** is deferred until the capability is proven (per the static-first inversion).
- Proposed **edge types** (not finalized): `Signal⟨T⟩` (present every clock) and `Event⟨T⟩` / `Delta⟨T⟩`
  (discrete occurrence). See §9.
- Proposed **vertex capability** annotation: `may_suspend` (class-2), analogous to `const fn` — the class is
  inferred, declarable, and errors on escape. See §6.

No concrete `flow!{ … }` body, no operator keyword set, and no channel-declaration syntax were written in this
session. These remain to be designed in the ADR.

---

## 16. Product shape — the fact-initiated column (a Drools-class rule environment)

For the *fact-initiated* use of the engine (user, 2026-07-03), the product shape is a **Drools-class rule-
programming environment**: working memory + rules + reactions, continuous. Mapping:

- **Working memory** = a mutable Writ store with change capture;
- **rules** = relational programs (standing);
- **Rete** = the DBSP operator family;
- **Drools TMS / `insertLogical`** = *free* via signed weights (derived facts auto-retract when support vanishes);
- **agenda/salience** → deterministic epochs + an ordered action queue;
- **`no-loop` / `lock-on-active` hacks** → principled causality (feedback edges must cross an epoch delay);
- **recursion** = the differentiator (Rete has no fixpoint);
- **rule hot-loading** already exists = the queue-2 dynamic interpreter.
- CEP/windows (the Drools Fusion analog) = deferred separate expressiveness.

**Surface decision (2026-07-03):** rules stay **select-form**; a "dense" clausal profile is deferred until real
large rule corpora appear; `when`/`then`-with-actions is rejected for the core — **boundary-only.**

---

## 17. Hardware strategy, and CIRCT as oracle

### 17.1 Strategic target and business frame (2026-07-03)

The goal is **LCM-compatible hardware from independent vendors** — most likely **xPU arrays with specialized
hardware functions including CGRA and eFPGA** (embedded FPGA IP), **NOT** standalone FPGA. Logos's offer to such
vendors = a **ready-made heterogeneous automated dev environment with built-in agentic engineering** out of the
box (the toolchain *is* the product wedge).

**FPGA route deprioritized** «по многим причинам» (proprietary Vivado/Quartus break both "everything in Logos"
and "AI in the loop"; standalone FPGA ≠ the LCM product; hours-long P&R). **Exception:** open-toolchain FPGA
(Artix-7 via yosys/nextpnr/prjxray) as an **opportunistic testbench**, not strategy.

**Convergence — the target choice dissolves the roundtrip objection and lands the mapping problem in our
wheelhouse:** eFPGA is small/embedded ⇒ fast P&R; CGRA is coarse-grain ⇒ minutes-scale mapping;
CGRA/eFPGA placement+routing = **constraint-search on a regular grid** (not a closed bitstream) = a Datalog /
constraint program on the incremental engine (R2 lattice aggregates for latency/resource, R3 numeric domains,
constraint/SMT extension). **We own it, natively.** Class-1 vertices map per-target by the compiler
(CGRA | eFPGA | SIMT | fused-CPU); class-2 KPN → xPU cores.

**FPGA/roundtrip vindication (correction to an earlier "HLS failed" claim):** HLS did *not* fail — it is a
production technology on a restricted subset with expert annotation (Vitis/Catapult/Stratus; DSP/codec/wireless
blocks), which *confirms* the information-loss diagnosis (works where independence survived, or is re-injected
via pragmas). Rust-on-FPGA friction is **surface/toolchain** (panics/bounds-checks/drop-glue polluting LLVM IR,
no directive channel, heap-assuming std), **not a paradigm barrier**; ownership/noalias is an **asset**
(Dahlia/Calyx: affine types make HLS predictable); Logos **zones** are the spatial-memory answer
(zone ↦ BRAM/scratchpad/register bank — Rust breaks on the "one global heap" assumption; zones already broke it).

**The real FPGA limiter is the roundtrip** — P&R hours-to-days vs seconds for CPU/GPU; a human physically cannot
sustain the loop (a third instance of a human-era constraint). The language-level answer is the
**backend-equivalence theorem**:

> A Hest-graph run on the CPU/xPU backend is **functionally identical** to its FPGA run — a *compiler theorem*,
> by construction (class-1 vertex + Kahn/Carloni latency-insensitivity invariance), not a co-simulation result.

Consequences: correctness iterates at CPU speed; the slow loop is demoted to **PPA tuning** (batchable,
fleet-parallel, agent-tolerant); LID disentangles timing-failure from functional-failure (RTL entangles them);
CGRA = the compile-time sweet spot; **a Hest vertex = a natural partial-reconfiguration (DFX) region** ⇒
incremental synthesis + hot-swap per vertex (rhymes with rule hot-loading).

### 17.2 "Everything in Logos" principle

Keep all relevant toolchain code **in Logos** so AI programs it fluently — the authors are models. ⇒ the
heterogeneous EDA stack (HDL, scheduling, CGRA/eFPGA mapping) is Logos code, self-hosted (like `peg_gen_logos`).
**CIRCT = oracle for design solutions, NOT a dependency.**

### 17.3 CIRCT assessment (the session inspected the live checkout at `/home/victor/cxx/circt`)

CIRCT is a live, upstream-synced checkout (HEAD hours old, `main`, tracking `llvm/circt`, `firtool-1.151.0`;
34 dialects; its llvm submodule pins `llvm/main`, tip-of-tree). It was built largely by **Chris Lattner while at
SiFive** (the user attended some of the dev meetings) — which explains the near-verbatim overlap: it is the
MLIR design taste applied to hardware.

**Near-verbatim overlap with the framework** ("someone built the hardware half of our framework in MLIR" =
proof of realizability):

| Framework element | CIRCT | Fact/quote |
|---|---|---|
| Class-1/2 vertex = deterministic KPN | **DC** (Dynamic Control) | "independent, unsynchronized processes communicating data through FIFO channels… *fully deterministic*" |
| Class-3 = quarantined nondeterminism | **Handshake** merge/control_merge | "non-deterministic operators… do **not** have a lowering to DC" — quarantine on exactly our boundary |
| One graph → HW \| fibers+channels \| distributed | **DC** value semantics | "could be implemented in hardware by ready/valid **or in software by message queues, RPC, or streaming protocols**" |
| Carloni latency-insensitivity as invariant | **DC/ESI** | "Any DC-typed value has latency insensitive semantics" |
| Hest = typed channels + host↔accel bridge | **ESI** (Elastic Silicon Interconnect) | typed point-to-point channels; auto-generated software API; windowing = framing |
| Chisel elaboration = metacall topology | **FIRRTL** + PyCDE | production Chisel backend |
| Dahlia/Calyx (affine types → predictable HLS) | **Calyx** dialect | SCFToCalyx, LoopScheduleToCalyx |
| SDF rates / scheduling | **SSP** + **Pipeline** + **LoopSchedule** | |
| Selector: formal HW-property checking | **SMT/Verif/LTL** + `circt-bmc` + **`circt-lec`** | logical equivalence checker |
| Backend-equivalence theorem | **`circt-lec`** | formal equivalence of two circuits — a ready tool |

CIRCT's split of dataflow into a **deterministic core (DC)** and a **nondeterministic boundary (Handshake)** is
literally the class-2 / class-3 boundary the framework derived from Kahn and Brock–Ackerman — already drawn as a
boundary between two dialects. And its dataflow is explicitly **substrate-independent** (ready/valid *or*
message queues/RPC/streaming) — the framework's "one vertex → HW | fibers+channels | distributed Hest" and
Carloni invariance.

**Maturity, honestly by layer:** production/tape-out — FIRRTL/HW/Comb/Seq/SV/ExportVerilog/firtool (Chisel
backend), Arc, Moore. Mature/active — ESI (versioned runtime `ESIRuntime-0.6.3`), Calyx. **Research-grade** (per
their own HLS.md: "you *will* encounter bugs") — **Handshake/DC (DHLS), Pipeline, LoopSchedule**, i.e. exactly
the dataflow dialects most interesting to Hest. Young — Synth/Datapath/AIG (`circt-synth`).

**Cost / what's missing:** the **llvm-main pin** is the main friction — CIRCT builds against `llvm/main` while
the Logos compiler stands on stock LLVM/MLIR 20; deep in-process integration is expensive, so the pragmatic path
would be **out-of-process** (emit CIRCT-dialect MLIR text/bytecode → `circt-opt`/`firtool`). **CGRA is not
covered at all** (0 mentions) — that is what *we* own. The most useful dialects are research-grade.

**Verdict — CIRCT = oracle:** its *value is its answers, not its code* — the crystallized 5+ years of PhD
dataflow→hardware research in its Rationale docs and dialect structure. Knowing the answer, re-implementing the
algorithm in Logos is mechanics; finding the answer is what took years. A dependency would be doubly wrong
(a C++/MLIR blob AI can't fluently touch, against "everything in Logos"; plus the llvm/main treadmill), and
CGRA/eFPGA — the actual target — isn't in CIRCT anyway. **Mine first:** the DC-vs-Handshake split and the
latency-insensitive (LID) protocols — they sit directly under the vertex lattice and clocks. Keep
`circt-lec`/`circt-bmc` in mind as an implementation of the backend-equivalence selector.

---

## 18. LCM memory model — no coherent caches; immutable persistent structures

A load-bearing architectural fact the user supplied (2026-07-03): **LCM has no coherent caches.** Shared memory
is to be **immutable persistent data structures.**

Consequences the session drew:

- **Memory model = compute model.** Sharing an immutable value = passing a token. No writes to shared locations
  ⇒ no coherence protocol, no reordering visible to others, no manually-established happens-before, no ABA. A
  "cache" of immutable data is always valid. In LCM, dataflow is **not an alternative** to shared-memory
  programming (as on a coherent CPU) but **the way shared memory is structured.** The impedance mismatch
  "shared memory ⟂ dataflow" that birthed the lock-free world on CPUs is *absent by construction*.
- **The whole coherent-cache problem class evaporates.** Relational weak-memory model-checking (hb/rf/mo as
  relations, which the session noted *is* itself a Datalog application, R2 + R4) is a cure for a coherence
  disease that LCM does not have.
- **Writ is this substrate.** Writ (relocatable, immutable byte blobs; persistent; structural sharing) *is* the
  LCM shared-memory model, not just a data format. Checkpoint/migration are "≈ free" *precisely because* state
  is immutable — you pass a reference to a snapshot, not serialize a live mutable object. The persistent
  substrate is reclassified from a storage side-feature to **the foundation of LCM's shared-memory model**, on
  which Hest stands.
- **Precedents** (so it isn't invention): Clojure (persistent structures + identity/value split), Datomic
  ("the database is a value", accumulate-only, structural sharing, readers never block writers), event sourcing
  / immutable log, MVCC / snapshot isolation.
- **Residual weight, named honestly** (not overclaimed):
  1. **The "current version" is the one mutable cell** — state growth needs a serialization point (pointer-to-
     current / log tail, updated by CAS or a single owner). Coordination is *concentrated* into one explicit
     small point, not removed — the same "nondeterminism → an explicit boundary" (class-3) pattern, shrunk to
     one cell. This is DBSP at the memory level: state = a fold over immutable deltas; change-capture is natural.
  2. **Allocation churn and locality** — every "update" allocates; a tree vs a flat array = pointer-chasing.
     On a coherent CPU sometimes a loss; in LCM the trade flips (no coherence traffic; immutability buys free
     replication/caching).
  3. **Distributed reclamation is a genuinely open problem** — it shifts from "when to free a node" (hazard
     pointers) to **refcount/GC of a shared immutable structure across xPUs without coherence** (racy counters,
     cycles). For tree-shaped persistent data (acyclic) refcount is simpler, but this must be honestly designed,
     not assumed solved.

*(A related "trap" question the user posed — whether a dataflow analyzer helps design lock-free structures on a
coherent CPU — got a nuanced "mostly no": a classical CFG analyzer cannot prove linearizability / place fences;
but relational weak-memory model-checking over the execution graph (hb/rf/mo, herd7/`cat`-style axioms) *is*
Datalog and thus another client of the same engine. Cache coherence is itself a hidden message-passing dataflow
protocol (MESI/MOESI); a lock-free algorithm is a hand-compiled dataflow protocol. This whole thread is moot for
LCM per the immutable-shared-memory decision above, but is recorded because it motivates the engine's
memory-model-checking capability.)*

---

## 19. Relationship to the rest of Logos

- **LCM (Logos Compute Model)** — the physical/execution model Hest concretizes (§5). LCM's tri-domain doc
  already lists FC (CEP/streaming) / BC (SQL/Datalog) plus "production systems and dataflow slated for
  first-class language integration" — this initiative *is* that line. LCM domain 2 (circuits): the same graph →
  HDL long-term.
- **HRPC ("Hest RPC")** — the first *wire member* of Hest. Its N-in × M-out call model = a dataflow-vertex
  signature. The comms protocols are **part of** the dataflow model, not a separate thing (§1.1).
- **Delta-stream profile** — the planned *second* wire member (epochs + exactly-once + credit flow control +
  a Z-set-batch Writ schema).
- **Writ** — payload format **and** operator state; relocatable immutable bytes ⇒ checkpoint/migration ≈ free;
  and (§18) the LCM shared-memory substrate itself.
- **WQL / Datalog engine** (`project_writ_query_language`) — the incremental DBSP engine Hest depends on and the
  selector substrate (§12); its fact-initiated column is the first client (§16). It is **single-threaded** and
  distinct from Hest (§13).
- **Trama** — mentioned only in passing as the WQL-adjacent template engine (the ported jinja-like engine; the
  Writ/Hest/Trama naming triad). **Not part of the Hest dataflow design** in this session.
- **Zones** — the spatial memory answer for class-1/hardware targets (zone ↦ BRAM/scratchpad/register bank).
- **Logos VM** — **postponed until after Hest.** The dependency arrow is **Hest → VM**: the VM's
  suspension/continuation model belongs to Hest's vertex semantics. Rationale: every near-term VM benefit has a
  cheaper home (fuel = a counter in the tree-walk interpreter; sandbox/determinism = already present; speed =
  re-invoke the static emitter). Substrate-before-semantics is the classic mistake; BEAM worked because Erlang
  semantics came first. (VM design notes: VDBE-control + vectorized data plane; kernels = static Logos;
  Z-set batch = the VM vector batch, "design once in Hest".)
- **`peg_gen_logos`** — the self-hosting precedent for "everything in Logos".
- **Rust** — Logos "thinks in Rust"; Hest opens the **extension** category beyond blessed *divergences*.
  Divergence is *licensed* where the dataflow-first paradigm demands it; expected forks are pointwise
  (Drop across epochs; a Send/Sync-analog for ports) and go through the DIVERGENCES register with blessing.
  (Note: no entities named **"Deem"** or **"RExpr"** appear in this Hest design session; "RExpr" in the source
  is an unrelated WQL relational-IR schema symbol.)

---

## 20. Roadmap / critical path / sequencing

**Consolidated critical path (user, 2026-07-03 — supersedes earlier sequencing where they differ):**

```
incremental-DF engine (WQL→DBSP, in development)
        │  "sufficient maturity" = the gate
        │  (2-D: DBSP incrementality diff-tested vs batch oracle
        │        + reasoning profile R2/R3/R4 at least designed)
        ▼
logosc rewritten in Logos — DF-native, LCM-variant DF from day one
        + Hest implementation
        ▼
Logos VM (after Hest; order unchanged)
```

- **Already shipped:** WQL static Datalog + queue-2 interpreter (v0.6.0). It is the **differential oracle** for
  the first Hest milestone (which no longer needs to be built — the queue-2 dynamic Datalog *is* the oracle).
- **Hest work waits** for the engine to mature. **Design/theory work (ADR, forks, the accepted framework)
  proceeds in parallel** and is *not* gated by the engine.
- The `logosc` → Logos rewrite is itself the first big **AI-driven CF→DF migration**, with the current C++
  compiler as the differential oracle (§10).
- The user decided the **Logos VM is postponed until after Hest** — «бенефитов в разработке VM сейчас, кроме
  понтов, нет» (no benefit to building the VM now beyond showing off).

**First incremental milestone:** differential-tested against the batch fixpoint oracle (now existing).

---

## 21. Prior-art coordinates (the design vocabulary)

The survey the assistant gave, organized by *design axes* (granularity, time model, rates, determinism, topology):

- **Classical dataflow machines / single-assignment** — Dennis (static), Arvind (tagged-token dynamic),
  Manchester; VAL/Id/SISAL. Lesson: instruction-granularity lost on economics (token-matching overhead); the
  paradigm *won inside* every CPU (Tomasulo/OoOE) and *returned above* (TF/XLA/MLIR graphs). The middle
  granularity doesn't survive; the edges do.
- **Kahn Process Networks (1974)** — the determinism foundation: blocking read, no emptiness-peek ⇒ the network
  result is *schedule-independent*, for free, for any topology incl. cycles. Boundedness is undecidable in
  general (Parks' algorithm). Determinism is a *reading discipline*, not luck.
- **Synchronous family: Lucid → Lustre / Esterel / Signal → SCADE** — the deepest prior art for "compiler sees
  the graph". Lustre: clock calculus (clocks as types), `pre`/`->`/`when`/`current`, causality analysis (every
  cycle crosses a `pre`), whole program → one step function (total fusion), static memory, WCET. Esterel:
  synchronous imperative control + constructive semantics. Signal: polychronous. Lucid Synchrone/Zélus (Pouzet):
  higher-order + clock inference. SCADE: certified codegen (DO-178B level A), fly-by-wire, nuclear. Three heavy
  lessons: clocks-as-types = a pure static selector; cycle ⇒ mandatory delay = the one complete-and-simple
  causality discipline; certification is the niche where guarantees outvalue ergonomics (the mass market never
  took Lustre — authoring cognition).
- **Static rates: SDF, StreamIt, CAL** — SDF (Lee–Messerschmitt): balance equations → static schedule, exact
  buffers, decidable deadlock. **Buck's theorem:** add `switch`/`select` and the model is Turing-complete ⇒
  undecidable — the design knob is one bit of control-dependent routing. StreamIt: the academic apex of
  "compiler sees the graph" — `filter` with declared `peek/pop/push`, structural combinators
  `pipeline`/`splitjoin`/`feedbackloop`; the reference corpus for graph transformations. Lesson: rates in the
  node signature = a cheap annotation buying a whole compiler stack; structural topology beats an arbitrary mesh.
- **Channels in the language: occam/CSP → Go; actors as the rejected neighbor** — occam: typed point-to-point
  channels, structural `PAR`/`SEQ`, `ALT` = nondeterministic choice as an *explicit syntactic* construct (the
  direct precedent for "nondeterministic merge = explicit typed escape"). Go inherited the surface, not the
  graph (dynamic goroutines, invisible topology = a CSP library). Erlang/actors = the opposite pole
  (addressing-as-computation, emergent topology; nothing for a compiler to fuse) — the neighbor Hest is
  explicitly built away from: **Hest wants topology-as-structure.**
- **FBP and visual: LabVIEW, Simulink, Max/PD, Faust, Excel** — dataflow repeatedly *won* wherever authoring
  cost was removed by another channel (drawing, a spreadsheet grid, a domain algebra). LabVIEW = the one mass
  success (you *draw* the graph). Faust = a compositional *textual* block-diagram algebra
  (`:` `,` `<:` `:>` `~`) → one C++ loop (proof "graph-as-text" can be short and compositional). Excel = the
  most-used dataflow language ever; its 35-year *abstraction* gap (no named reusable subgraph until LAMBDA, 2021)
  is the direct lesson: **naming a subgraph as an operator (a hierarchical vertex) is not sugar but the
  condition of scaling — it must be in the core from day one.**
- **FRP → Rx → Reactive Streams** — how dynamic graphs in libraries burned: Fran (space/time leaks), Yampa
  (cured by *forbidding* first-class signals — i.e. shrinking toward synchronous dataflow), Elm ("A Farewell to
  FRP", 2016), Rx ("monadic hell", unreadable stack traces — the graph is only heap closures). The one durable
  technical artifact: Reactive Streams' `request(n)` = **credit-based backpressure**. Adjacent: incremental
  computation (Adapton, Jane Street Incremental, Salsa) — dataflow over the *call* graph. Lesson: a dynamic
  operator graph without statics *reproducibly* burns on debugging, leaks, refactoring — a structural property
  of "graph-as-heap-value".
- **Distributed runtime-scheduled: Spark/Flink, Naiad/timely, DBSP** — Flink: event-time vs processing-time,
  **watermarks** (a heuristic!), exactly-once via asynchronous barrier snapshotting; the Akidau
  *what/where/when/how* taxonomy. Naiad/timely: partially-ordered multidimensional timestamps
  `(epoch, loop counters)` ⇒ incremental *iteration* in one graph; the **frontier progress protocol** (exact,
  vs heuristic watermarks). **DBSP**: the algebra distilled — streams, delay `z⁻¹`, differentiation `D`,
  integration `I`; **incrementalization is the mechanical transform `Q^Δ = D∘Q∘I`**; **Z-sets** (integer
  weights) make retraction free. Double lesson: (a) time must be *explicit and partially ordered* (epochs/
  frontiers are semantics, not a runtime detail); (b) incrementality is an *algebraic program transformation*,
  so it belongs in the compiler.
- **Kin to know** — Ptolemy II (Ed Lee): "model of computation" as a pluggable *director* (SR/PN/SDF/DE/CT) —
  literally this survey's taxonomy as software; Lee's "The Problem with Threads" (2006). HDL kinship: synchronous
  dataflow ≅ RTL (register = `pre`); Bluespec (Arvind: guarded atomic actions → hardware), Chisel, Clash —
  "same graph → HDL" is real. TF1-vs-PyTorch: define-then-run (topology metaprogramming) lost the war for the
  *human* author to eager mode — then the graph returned via compilers (XLA, torch.compile) for *machine*
  processing. **The paradigm's equilibrium is set by the author** — the width-thesis, confirmed on a
  billion-dollar industry in one decade.

**Designer's theoretical minimum (cheat sheet):**
1. **Kahn's theorem** — blocking read + no peek ⇒ determinism under any schedule.
2. **Brock–Ackerman anomaly (1981)** — under nondeterminism the "input/output history relation" semantics stops
   being compositional (two modules with equal I/O histories are distinguishable in a feedback context) ⇒
   nondeterminism cannot be hidden inside a module ⇒ merge must be visible in the type/interface.
3. **Buck's theorem** — SDF + switch/select = Turing-complete; static decidability ends at the first
   control-dependent route. The design knob: how much dynamism, in what container.
4. **Clock calculus + causality** — clocks as types; a cycle must cross a delay.
5. **Progress tracking** — an honesty hierarchy: bounded buffers (Parks) < watermarks (heuristic, Flink) <
   frontiers (exact, Naiad); multidimensional timestamps (epoch × iteration) give incremental recursion.
6. **Backpressure** — credit-based `request(n)` (Reactive Streams) vs bounded-blocking (KPN/occam); both
   compatible with determinism.
7. **DBSP algebra** — `D`, `I`, `z⁻¹`, `Q^Δ = D∘Q∘I`; Z-weights ⇒ retraction is free.

**Datalog-in-compiler precedents:** Polonius (borrow-check as Datalog), chalk, Doop/Soufflé, the DDlog→DBSP
lineage, Salsa, egglog. The rustc/rust-analyzer split is the cautionary tale a DBSP-incrementalized compiler
resolves (batch + IDE from one source).

---

## 22. Open questions and explicitly deferred items

**Open (to be resolved in the ADR / by later user steer):**

- The **vertex item-kind** — the exact language form of a vertex (typed-ports *item* vs `fn`-with-`Stream`-args).
  Gating; entangled with the VM's suspension model.
- **Clock-calculus mechanics in Logos terms** — how to type ports/clocks, including the N-synchronous boundary
  (this is the vertex's statics; everything else leans on it).
- **Vertex-lattice membership criteria** — precise class-1/2 boundary and class inference.
- Whether **`Stream<T>` / `Delta<T>`** become language types, and when clocks-as-types refine runtime-first epochs.
- A full **Rust-on-FPGA corpus** review (raised but not executed in-session; a deep-research candidate).
- **Distributed reclamation** (refcount/GC of shared immutable structures across xPUs) — a genuinely open
  hardware/runtime problem (§18).
- Engine **R2** (recursive lattice/semiring aggregates) and **R4** (provenance) — designed-for but not built.

**Explicitly deferred:**

- **Eventflow / streaming in the ADR** — the reaction-to-absence analysis is accepted as understanding but
  deferred as an ADR deliverable: "decide in private when streaming is actually needed" (§9).
- **CEP / windows** (Drools-Fusion analog) — deferred separate expressiveness (§16).
- A **"dense" clausal rule profile** — deferred until real large rule corpora appear; core rules stay select-form,
  `when`/`then`-with-actions rejected for the core (§16).
- **A grammar keyword** for Hest — deferred until the metacall/static surface proves the capability (§14–15).
- The **VM** — postponed until after Hest (§19).
- **Standalone-FPGA route** — deprioritized; open-toolchain FPGA kept only as an opportunistic testbench (§17.1).

**Ambiguous / thin in the session (flagged for the doc-writer):**

- **No concrete Hest grammar or operator set exists.** Only edge-type names (`Signal⟨T⟩`, `Event⟨T⟩`/`Delta⟨T⟩`),
  one capability annotation (`may_suspend`), and one entry surface (`resource/flow!{}` à la `wql!`) were named.
  Any public "syntax" section must be written as *proposed/illustrative*, not settled.
- **"Epochs" is overloaded** and the session took care to disambiguate: in the single-threaded engine an epoch is
  a *logical batching* concept, not concurrency (§13); in Hest/time-discipline it is a boundary marker (§7, §9).
- The precise **naming scope** of "Hest" vs "HRPC" vs "delta-stream profile" is settled in intent (Hest = the
  language aspect; HRPC/delta-stream = wire members) but the doc-level cleanup of `docs/language/hest.md`
  (which still says "family of communication protocols") had **not** been done in-session (§1.2).
