---
title: "Deem: querying Writ data"
description: Deem is Logos's Datalog-class query engine over Writ — a compile-time prepared-statement macro and a dynamic runtime API sharing one schema'd IR.
---

**Deem** is Logos's query engine over [Writ](/writ/introduction/) data. It is the query half of **WQL** — the Writ Query Language — and it sits at the Datalog end of the query spectrum: single-source scans and filters, N-way joins, group/aggregate/having, ordering and limits, and genuine recursive relations with a least-fixpoint evaluator. The name is Old English *dēman*, "to judge" or "to deem" — Deem judges a body of Writ data against a query and returns the verdict.

Deem never invents a data model of its own. Its rows are Writ objects, its schemas are [Writ schemas](/writ/introduction/), and the query plan itself is a Writ graph. That is the recurring Logos move: the thing you query, the thing you compile to, and the thing you optimize are all one substrate.

## Where Deem sits

WQL has two domains that share one Writ-schema IR and one expression sublanguage:

- **Deem** — the *query* domain. Relational and graph queries that return rows.
- **[Trama](/trama/introduction/)** — the *template* domain. The same data, rendered to text (`{{ … }}`, `{% if/for %}`).

Both embed **EL**, a CEL-class scalar expression language. Every Deem clause body — `where`, `select`, join `on`, `group by`, aggregate arguments, `having`, `order by`, `find` — is an EL expression, and the *same* EL is what Trama evaluates inside `{{ … }}`. Learn EL once and you know the expression half of both engines.

Underneath everything is Writ. A query source is a slice of Writ-schema'd rows; a projected column is a Writ scalar; a recursive relation is a set of Writ tuples. The IR that Deem lowers to (a scalar tier and a relational/graph tier) is itself a family of Writ schemas — the query plan is Writ dogfooding its own schemas.

## Two surfaces, one engine

Deem exposes the same query language through two surfaces that share their parser, their lowering, their optimizer, and their evaluation semantics. Only the *edges* differ: one emits native code at compile time, the other walks the plan at runtime.

### Static — the prepared-statement macro

`deem!(<params>){ <query> }` is a `#[token_macro]` (handler `fn deem` in `logos.std.wql.wql`; `wql!` and `wql_walk!` are aliases). At **compile time** it parses the query, type-checks it against the row schemas, optimizes it, and emits a native `pub fn`:

```logos
resource top = deem!(emps: &[Emp], n: i64) {
    from emps e where e.salary > 50.0 select e.name limit n };
//  →  pub fn top(emps: &[Emp], n: i64) -> Result<Vec<str>, ElError>
```

This is the sqlx `query!` model for Writ: the query is checked when the program is built, the parameters are ordinary strongly-typed Logos function arguments (no bind sigils), and there is *no* runtime query planner. Reach for the static surface whenever the query text is known at build time — which is most of the time.

### Dynamic — compile once, run many

When the query text only exists at **runtime**, package `logos.std.deem` compiles it against a schema catalog and runs it against an environment:

```logos
let q: Query = Query::compile("from emps e where e.age >= n select e.name", &cat)?;
env.bind_source("emps", emps_warray);
env.bind_i64("n", 40);
let rows: QRows = q.run(&env)?;      // compile-once / run-many, re-entrant over envs
```

Crucially, this is *not* a second implementation. The dynamic engine reuses the same PEG parsers, the same `lower_rquery_to_rexpr` lowering, the same simplify passes, and the same semi-naïve fixpoint as the macro — it is a tree-walk over the schema'd IR, with no codegen at runtime. That is the payoff of schemas-as-IR: one query language, re-hosted from an emitter to an evaluator. Reach for the dynamic surface when the query arrives as data — from a user, a config file, or a model in a loop.

## Datalog at a glance

Beyond the single entry query, a Deem program may declare named derived relations with `rel` blocks — Datalog rules:

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
- [Trama: templating Writ data](/trama/introduction/) — Deem's sibling in WQL, sharing the EL expression language and the Writ-schema IR.
