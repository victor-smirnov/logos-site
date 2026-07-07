---
title: "Deem: the query & reasoning engine"
description: "Deem is a full incremental Datalog engine built into Logos — a query and reasoning engine with compiled, interpreted, and (planned) JIT execution, running over Writ graphs and ordinary Logos objects alike. Lightweight, batteries included, first-class for filtering a plain collection or reasoning over a recursive graph."
---

**Deem** is Logos's query **and reasoning** engine: a full **incremental Datalog engine built into the language itself** — not a library you pull in, but a compile-time DSL and a runtime API that ship with the compiler and are checked by it. It sits at the Datalog end of the query spectrum: single-source scans and filters, N-way joins, group/aggregate/having, ordering and limits — and, the reasoning half, **genuine recursive relations that *derive* new facts** under a least-fixpoint evaluator. The name is Old English *dēman* — "to judge", "to deem", "to pronounce judgment": Deem does not merely *retrieve* data, it *reasons* over it, and returns the verdict.

And it scales *down* as gracefully as it scales up. The same engine that runs a recursive graph-reasoning pass is the natural way to **filter a plain collection**: `from xs x where x.ok select x` over a `&[X]` of ordinary structs is a first-class Deem query, not a second-class one. It works over [Writ](/writ/introduction/) object graphs and **ordinary Logos objects** alike — a `&[Emp]` of plain structs is as good a source as a Writ table — and it is **lightweight: you pay only for what you use.** No runtime planner when the query is known at build time; no codegen when it is not; nothing linked in that a given query doesn't touch.

Deem never invents a data model of its own. Its rows are *your* typed Logos values — Writ schema objects or ordinary structs in a slice — and the query *plan* itself is a Writ graph. That is the recurring Logos move: the thing you compile to and the thing you optimize are one substrate, while the thing you query is whatever typed data you already hold.

## Where Deem sits

Deem has a sibling — **[Trama](/trama/introduction/)** — and the two share one schema'd IR and one expression sublanguage:

- **Deem** — the *query & reasoning* engine. Relational and graph queries that return rows, and recursive rules that *derive* new ones.
- **[Trama](/trama/introduction/)** — the *transformation* engine. The same data, transformed to an output — today that means rendered to text (`{{ … }}`, `{% if/for %}`), with further transformation modes to come.

Both embed **EL**, a CEL-class scalar expression language. Every Deem clause body — `where`, `select`, join `on`, `group by`, aggregate arguments, `having`, `order by`, `find` — is an EL expression, and the *same* EL is what Trama evaluates inside `{{ … }}`. Learn EL once and you know the expression half of both engines.

What is always Writ is the **IR**, not necessarily the data. A query source may be a slice of Writ-schema'd rows *or* an ordinary Logos collection; a projected column is a scalar; a recursive relation is a set of tuples. Either way, the plan Deem lowers to — a scalar tier and a relational/graph tier — is itself a family of Writ schemas. The query plan is Writ dogfooding its own schemas, even when the rows it scans are plain structs.

## Batteries included

Deem is not a toy Datalog. What ships in the box:

- **The relational core** — `from` scans, `where` filters, N-way `join` and `anti join`, edge/graph traversal, `group by` / `aggregate` / `having`, `order by`, `select` / `first` / `distinct`, `limit`, and `find`.
- **Recursion that reasons** — named derived relations (`rel`) with set semantics and self / mutual / forward references, strongly-connected-component condensation, a **semi-naïve least-fixpoint** evaluator, and **stratified-negation** checking. Transitive closure, same-generation, and shortest / widest paths fall out in a handful of lines.
- **An expression sublanguage (EL)** — a CEL-class scalar language for every clause body, with **errors as values** (an overflow or divide-by-zero becomes an `Err`, never a trap), shared verbatim with [Trama](/trama/introduction/).
- **User-defined functions and aggregates** — register your own UDFs and UDAs into the dynamic engine's function registry.
- **A schema catalog and bound environments** — compile a query once against a catalog, then bind named sources and typed parameters (`bind_source`, `bind_i64`, …) and run it many times over different environments, re-entrantly.
- **Lenient / erased mode** — tolerant binding for dynamic, model-driven inputs, where a missing field reads as null instead of faulting.
- **Incremental maintenance** — the newest frontier: a DBSP-style engine that keeps query results up to date under fact **insert / retract** rather than recomputing from scratch (experimental — see the [reference](/deem/reference/)).

## Execution modes: compiled, interpreted, and (soon) JIT

Deem exposes *one* query language — one parser, one lowering, one optimizer, one set of evaluation semantics — through surfaces that differ only at the *edges*: **when** the query text is known, and **how** the plan runs. Today there are two execution modes, with a third on the roadmap.

### Compiled — the static prepared-statement macro

`deem!(<params>){ <query> }` is a `#[token_macro]` (handler `fn deem` in `logos.std.wql.wql`; `wql!` and `wql_walk!` are aliases). At **compile time** it parses the query, type-checks it against the row schemas, optimizes it, and emits a native `pub fn`:

```logos
resource top = deem!(emps: &[Emp], n: i64) {
    from emps e where e.salary > 50.0 select e.name limit n };
//  →  pub fn top(emps: &[Emp], n: i64) -> Result<Vec<str>, ElError>
```

This is the sqlx `query!` model for Writ: the query is checked when the program is built, the parameters are ordinary strongly-typed Logos function arguments (no bind sigils), and there is *no* runtime query planner. Reach for the static surface whenever the query text is known at build time — which is most of the time.

### Interpreted — the dynamic compile-once, run-many API

When the query text only exists at **runtime**, package `logos.std.deem` compiles it against a schema catalog and runs it against an environment:

```logos
let q: Query = Query::compile("from emps e where e.age >= n select e.name", &cat)?;
env.bind_source("emps", emps_warray);
env.bind_i64("n", 40);
let rows: QRows = q.run(&env)?;      // compile-once / run-many, re-entrant over envs
```

Crucially, this is *not* a second implementation. The dynamic engine reuses the same PEG parsers, the same `lower_rquery_to_rexpr` lowering, the same simplify passes, and the same semi-naïve fixpoint as the macro — it is a tree-walk over the schema'd IR, with no codegen at runtime. That is the payoff of schemas-as-IR: one query language, re-hosted from an emitter to an evaluator. Reach for the dynamic surface when the query arrives as data — from a user, a config file, or a model in a loop.

### JIT — on the roadmap

The two modes sit at opposite ends of a trade-off: compiled is fastest but needs the text at build time; interpreted takes text at runtime but pays a tree-walk per row. A planned **JIT mode** closes the gap — a hot dynamic query plan compiled to native code at runtime, so a long-lived runtime query eventually runs at compiled speed. Because it is the *same* lowered IR feeding a code emitter instead of the tree-walker, it is again a re-hosting, not a third implementation. (Roadmap, not shipped.)

## Reasoning: recursive relations

This is where Deem stops being *just* a query engine. Beyond the single entry query, a Deem program declares named **derived relations** with `rel` blocks — Datalog rules that infer new facts from existing ones:

```logos
resource reach = deem!(edges: &[Edge], start: i64) {
    rel path(a: i64, b: i64) {
        from edges e select (e.src, e.dst);
        from path p join edges e on p.b == e.src select (p.a, e.dst);
    }
    from path p where p.a == start select p.b order by p.b
};
```

A `rel` has **set semantics** (rows are deduplicated structurally) and a body may reference the relation *itself* or another rel — self, forward, and mutual references are all legal. Recursive relations are found by condensing the dependency graph into strongly-connected components and running each recursive component as one shared **semi-naïve fixpoint**. Transitive closure, same-generation, single-source shortest paths, and widest-path all fall out of this in a handful of lines. Negation or aggregation *against a relation in the same recursive component* is rejected as non-stratifiable; against an earlier, fully-materialized stratum it composes freely — the standard Datalog stratification contract.

## Errors are values

Deem never traps the host. An integer overflow or a division-by-zero inside an EL expression does not crash the program — it becomes an `Err`. The static surface returns `Result<Vec<…>, ElError>`; the dynamic surface returns `Result<_, QError>` carrying a positioned message. On the dynamic side this is deliberate: the caller is often a running program — frequently a model-driven loop — and a query error is a *feedback signal it can read*, not a diagnostic that halts the build. (Compile-time errors on the static surface are ordinary compiler diagnostics, the dual of the same idea.)

## A real application: docs.json

The documentation you are reading is itself a Deem application. Logos's doc extractor treats API documentation as what it actually is — a relational, incrementally-maintained dataset, not a tree-walk over one file. It extracts doc facts into Writ tables (the EDB), expresses cross-references — implementors, used-by, reachable public surface, undocumented items — as Deem `rel` rules (the IDB), and serializes a resolved `docs.json` that this site consumes. Adding a new cross-reference report is adding a Deem rule, not writing a renderer pass. (This pipeline is specified in ADR 0014 and is design/first-slice work, not yet fully shipped.)

## Related

- [Deem tutorial](/deem/tutorial/) — build up a query from a first `from … select` to joins, aggregates, a recursive `rel`, and the dynamic API, all from real tests.
- [Deem reference](/deem/reference/) — the complete macro grammar, pipeline clause semantics, `rel`/stratification rules, EL summary, and dynamic API type-by-type.
- [Trama: the transformation engine](/trama/introduction/) — Deem's sibling engine, sharing the EL expression language and the schema'd IR.
