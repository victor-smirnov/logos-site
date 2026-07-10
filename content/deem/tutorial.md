---
title: "Deem tutorial"
description: "Build up a Deem query from a first prepared statement through joins, aggregates, find, recursive rel blocks, graph sources with path steps, and reusable mappings — then run the same language dynamically."
---

This tutorial builds a working Deem query step by step. Every snippet is drawn from the Logos test suite — you can paste the shapes and run them. We start with the `deem` item (the common case), work up through recursion, whole-graph sources, and mappings, and finish with the dynamic `Query::compile`/`run` API.

## A source and a first query

A Deem query is a **language item** — it sits in a module next to your `fn`s and `struct`s, with real visibility and doc comments. Declare a row type, then declare the query. Slice parameters are the sources; scalar parameters are referenced bare inside the query.

```logos
package demo;

use logos.std.wql.wql;          // the deem engine
use logos.mem.collections.vec;

struct Emp { pub name: str, pub dept: i64, pub salary: f64 }

/// Names above 50.0 salary, capped at n rows.
pub deem top(emps: &[Emp], n: i64) {
    from emps e where e.salary > 50.0 select e.name limit n
}
```

Every query opens with `from <src> <var>`: `emps` names the source (the slice param), `e` is the row loop variable used by all downstream clauses. `where` filters, `select` projects, `limit` truncates. The compiler parses the body with its own grammar and lowers the item to a native function:

```logos
//  pub fn top(emps: &[Emp], n: i64) -> Result<Vec<str>, ElError>
```

The parameter list is a genuine Logos signature — type-checked by the compiler, called like any function. `pub deem` emits a public fn; a bare `deem` is private to the package:

```logos
fn main() -> i32 {
    let staff: [Emp; 2] = [
        Emp { name: "Ada", dept: 1i64, salary: 90.0f64 },
        Emp { name: "Bo",  dept: 2i64, salary: 40.0f64 },
    ];
    let rows: Vec<str> = top(&staff[..], 10i64).unwrap();   // ["Ada"]
    return 0i32;
}
```

The result is a `Result` because an EL expression can fail as a *value* (overflow, division-by-zero) rather than trapping — hence the `.unwrap()` (or `?`, or a `match`).

> If you have code from before the item form landed: the old `resource top = deem!(…){…};` macro spelling is retired, and the compiler rejects it with the exact item replacement printed in the error.

## Joining sources

Chain `join <src> <var> on <pred>` steps after the `from`. Each `on` predicate may reference every variable bound so far. The chain is N-way and folds left-deep; the join strategy (hash, tree, or nested-loop) is picked statically from the key type's trait capability — an `i64` equi-key gets a hash join automatically.

```logos
struct Emp  { pub dept: i64, pub salary: i64 }
struct Dept { pub id: i64,   pub region: i64 }
struct Reg  { pub rid: i64,  pub bonus: i64 }

// emp → dept (e.dept == d.id) → region (d.region == r.rid); project salary + bonus.
pub deem emp_bonus(emps: &[Emp], depts: &[Dept], regs: &[Reg]) {
    from emps e
    join depts d on e.dept == d.id
    join regs r on d.region == r.rid
    select e.salary + r.bonus
}
```

```logos
let rows: Vec<i64> = emp_bonus(&emps[..], &depts[..], &regs[..]).unwrap();
```

An emp whose dept has no matching region row simply drops out of the result — an inner join. (Prefix a step with `anti` to keep only bound rows that have *no* match: `anti join depts d on e.dept == d.id` is the "employees in no known department" query.)

## Grouping, aggregating, having, ordering

Add `group by <key> aggregate <name>=<fn>(<arg>),…` to collapse rows into groups. The five builtin aggregates are `count()` (nullary), `sum`, `min`, `max`, and `avg` (each over one EL argument; `avg` always yields `f64`). Inside `having`, `select`, and `order by` you refer to the group key by the reserved name `key` and to each aggregate by its output name.

```logos
struct Sale { pub dept: i64, pub amount: i64 }

/// Per-dept totals, keep groups whose total >= 20.
pub deem big_totals(sales: &[Sale]) {
    from sales s
    group by s.dept
    aggregate total = sum(s.amount), cnt = count()
    having total >= 20
    select key * 1000 + total * 10 + cnt
}
```

`having` filters *groups* (after aggregation, before ordering and projection). It can range over an `f64` aggregate column too, and combine with `order by`:

```logos
/// Depts whose mean sale > 8.0, highest mean first; project the dept id.
pub deem high_avg_depts(sales: &[Sale]) {
    from sales s
    group by s.dept
    aggregate av = avg(s.amount)
    having av > 8.0
    select key order by av desc : i64
}
```

Two clauses worth noting here:

- `order by <expr> [desc]` sorts by a single key (ascending by default). For a compound sort, order by a tuple key.
- The trailing `: i64` is an explicit result-element type annotation. It is optional — the element type is otherwise inferred from the projection.

The full logical pipeline, in evaluation order, is:

```text
from → [join…] → where → group/aggregate → having → order → project(select) → distinct → limit
```

## Finding a single row

When you want the *first matching row as a borrow* rather than a projected set, use `find`. It replaces `where`+`select`, takes no other clause, and returns `Option<&Ty>` — a zero-copy borrow, early-exiting on the first hit:

```logos
struct Person { pub name: str, pub age: i64 }

pub deem find_41(people: &[Person])              { from people p find p.age == 41 }
pub deem find_by_age(people: &[Person], n: i64)  { from people p find p.age == n }
```

```logos
match find_41(&people[..]).unwrap() {
    Option::Some(q) => { /* q: &Person, fields read through the borrow */ }
    Option::None    => { /* no row matched */ }
}
```

`find_41` returns a borrow of the *first* row with age 41 even if a later row shares the age — scan order decides. A predicate that matches nothing yields `None`.

## Recursion: a `rel` block

A single entry query is the degenerate zero-rule program. Prefix it with one or more `rel NAME(cols){ bodies }` blocks to declare named derived relations — Datalog rules. Each body is a `from/join/where/select` producer; the union of a rel's bodies (deduplicated structurally) *is* the relation. Columns must be `i64`/`str`/`bool` (a set needs `Eq`; `f64` is excluded). A body may scan another rel — or the rel being defined — exactly like a slice source.

Here is transitive closure. The first body seeds `path` with the edges; the second joins `path` against `edges` to extend paths by one hop. Because the second body reads `path` itself, the two form a recursive component evaluated as one semi-naïve fixpoint:

```logos
struct Edge { pub src: i64, pub dst: i64 }

pub deem reach(edges: &[Edge], start: i64) {
    rel path(a: i64, b: i64) {
        from edges e select (e.src, e.dst);
        from path p join edges e on p.b == e.src select (p.a, e.dst);
    }
    from path p where p.a == start select p.b order by p.b
}
```

```logos
let edges: [Edge; 4] = [
    Edge { src: 1i64, dst: 2i64 },
    Edge { src: 2i64, dst: 3i64 },
    Edge { src: 2i64, dst: 4i64 },
    Edge { src: 2i64, dst: 3i64 },   // duplicate — set semantics dedup it
];
let out: Vec<i64> = reach(&edges[..], 1i64).unwrap();   // reachable from 1: [2, 3, 4]
```

Set semantics guarantee termination even over a cyclic graph: once every fact is derived, the next round adds nothing and the fixpoint closes. (Termination is only at risk if a recursive head *mints* new values with arithmetic — that is the user's responsibility, exactly as in classic Datalog.)

Layered, non-recursive rels work the same way — one rel can read an earlier one, and a one-column rel projects a scalar:

```logos
pub deem layered(edges: &[Edge]) {
    rel pairs(x: i64, y: i64) { from edges e select (e.src, e.dst); }
    rel bigy(p: i64)          { from pairs t where t.x > 1 select t.y; }
    from bigy s select s.p order by s.p
}
```

## Querying a whole document: graph sources

So far every source was a flat slice. Deem also takes a **whole graph** as a parameter. Type a param `&Writ` and the document itself becomes the fact base — scanned virtually, edge per edge, with no materialized copy:

```logos
use logos.lang.writ.container;
use logos.mem.writ.parser;       // parse_writ

pub deem pool_min(g: &Writ) {
    from g .db .pool .min m select m.vi
}
```

```logos
let doc: Writ = parse_writ(
    r#"{ db:    { engine: "pg", pool: { min: 2, max: 16 } },
         ports: [8080, 8443],
         cache: { engine: "redis" } }"#);
let v: Vec<i64> = pool_min(&doc).unwrap();   // [2]
```

The `from g .db .pool .min m` is **graph-path sugar**. After the source you may write a chain of steps, then bind a variable:

| Step | Meaning |
| --- | --- |
| `.key` | move to the map entry / field named `key` |
| `[*]` | array elements (each element, in turn) |
| `[N]` | the array element at index `N` |
| `*` | any child |
| `{kind}` | *filter* the current node by kind (`map`, `i64`, `str`, `f64`, …) — not a move |
| `**` | descendant-or-self: this node and everything below it, at any depth |

The bound variable ranges over **edge rows** with structural columns and typed payloads: `v.key` (the field/map key), `v.idx` (array position), `v.kind` (node kind), `v.vi` (integer payload — also bools as 0/1 and f64s as bits), `v.vs` (string payload), plus `v.parent`/`v.child` node handles for explicit joins. Some worked shapes:

```logos
/// Array elements, ordered.
pub deem all_ports(g: &Writ) {
    from g .ports [*] p select p.vi order by p.vi        // [8080, 8443]
}

/// Top-level sections that are maps.
pub deem sections(g: &Writ) {
    from g * s {map} select s.key : str                  // ["db", "cache"]
}

/// ** finds every `engine` key at any depth.
pub deem all_engines(g: &Writ) {
    from g ** .engine e select e.vs : str                // ["pg", "redis"]
}

/// Mid-path binding: d and e are both visible downstream.
pub deem db_engine(g: &Writ) {
    from g .db d * e where e.key == "engine" select (d.child, e.vs)
}
```

None of this is a second engine. Steps desugar into an ordinary join chain over one **edge relation**, and `**` lowers to an injected recursive rel — reachability runs on the same semi-naïve fixpoint you met above. Graph paths therefore compose with everything else: use them inside a `rel` body, under an aggregate, or followed by a classic `join` step against a slice param.

```logos
/// Histogram of node kinds under .db — a path scan feeding an aggregate.
pub deem kind_hist(g: &Writ) {
    from g .db d * e group by e.kind aggregate n = count()
    select (key, n) order by key
}
```

## Native object graphs: `#[derive_graph_source]`

Writ documents carry runtime type tags; ordinary Logos objects deliberately don't (their types are static). So for a native struct the traversal is *generated at compile time* by reflection — annotate the types, and the object graph becomes a Deem source with the exact same vocabulary:

```logos
use logos.std.compiler.metaprog;
use logos.std.wql.writ_graph;

#[derive_graph_source]
pub struct Db { pub host: str, pub port: i64, pub load: f64 }

#[derive_graph_source]
pub struct Cfg { pub name: str, pub db: Db, pub replicas: Vec<i64> }

/// ** descends through nested structs; {i64} filters leaf kind.
pub deem ports(g: &Cfg) {
    from g ** p {i64} where p.key == "port" select p.vi
}

/// A Vec field is a container node; [*] enumerates it.
pub deem all_replicas(g: &Cfg) {
    from g .replicas [*] r select r.vi
}
```

Everything from the previous section — `**`, `[*]`, `{kind}` filters, joins, aggregates — applies to native objects unchanged, because both walkers emit the same edge relation. (v1 field classes: `i64`/`bool`/`str`/`f64`, `Vec` of scalars or annotated structs, and nested annotated structs.)

## Mappings: name a vocabulary, reuse it everywhere

The graph queries above spell their paths inline. When a domain vocabulary is worth naming — "this config document has *engines* and *ports*" — promote it to a **mapping**: a named, typed, reusable rule module over a source shape.

```logos
use logos.std.wql.mapping_item;

pub mapping Net(g: &Writ) {
    pub rel engine(owner: i64, name: str) {
        from g ** .engine e select (e.parent, e.vs);
    }
    pub rel port(p: i64) {
        from g .ports [*] q select q.vi;
    }
}
```

A mapping is a *definition*, never an executable — you query **through** it, by typing a parameter with the mapping's name:

```logos
pub deem all_engines(w: Net) { from engine e select (e.owner, e.name) }
```

The compiler splices `Net`'s rules into the query (renaming the mapping's `g` to the consumer's `w`), and the emitted signature takes the mapping's source type — `all_engines(&doc)` with a plain `&Writ`. This is **fusion, not materialization**: the spliced rules and your query optimize and evaluate as one program, one fixpoint. That means you can freely:

```logos
// …join a mapping rel against the raw graph param — same param, both views:
pub deem pg_owner_kind(w: Net) {
    from engine e join w d on d.child == e.owner
    where e.name == "pg"
    select d.kind
}

// …join a mapping rel against your own slice param:
struct Svc { pub id: i64, pub label: str }
pub deem port_labels(w: Net, svcs: &[Svc]) {
    from port p join svcs s on s.id == p.p select (p.p, s.label)
}

// …or layer your own rel on top of a mapping rel:
pub deem big_ports(w: Net) {
    rel big(p: i64) { from port r where r.p >= 1000 select r.p; }
    from big b select b.p
}
```

Declaration order and module boundaries don't matter — a `pub mapping` is consumable from another module, and the consumer may even precede the mapping in the file.

### Generic mappings

A mapping can be generic over its source, bounded by a **source trait** — a trait whose members are `rel` declarations, implemented by binding each rel to a materializer function:

```logos
pub trait EdgeSource {
    rel link(a: i64, b: i64);
}

struct Chain { pub n: i64 }
fn chain_edges(c: &Chain) -> Vec<(i64, i64)> { /* build the (i, i+1) pairs */ }
impl EdgeSource for Chain {
    rel link = chain_edges;      // the rel's rows come from this function
}

/// Reachability, written once, for ANY EdgeSource.
pub mapping Reach<S: EdgeSource>(g: &S) {
    pub rel r(x: i64, y: i64) {
        from g e select (e.a, e.b);
        from r p join g e on e.a == p.y select (p.x, e.b);
    }
}

pub deem chain_reach(w: Reach<Chain>) {
    from r t where t.x == 1 select t.y
}
```

One rule module now serves every type that implements the bound — the generic parameter is substituted at consumption, and the recursion inside the mapping runs in the consumer's fixpoint like everything else.

A mapping may also declare scalar params (`floor: i64`); a consumer binds them by declaring a param with the *same name and type* — no special binding syntax.

## The dynamic surface

When the query text is only known at runtime, compile it against a **schema catalog** and run it against a **QEnv**. The catalog is produced by the `schema_catalog!` macro from `pub schema` declarations; the env binds sources and parameters.

```logos
use logos.std.wql.catalog_macro;   // schema_catalog!
use logos.std.deem;                // Query, QEnv, QRows, SchemaCatalog, RtVal
use logos.lang.result;

pub schema Emp : code(0x0B2C_0000_0000_0001) {
    name: str = 0, dept: i64 = 1, age: i64 = 2, rate: f64 = 3,
}
resource cat = schema_catalog!{ Emp };
```

`Query::compile(text, &cat)` runs the env-independent checks and the optimizer once; `run(&env)` executes the plan. Both return a `Result` — errors are `QError` values, so you `match` them:

```logos
let c: SchemaCatalog = cat();

let q: Query = match Query::compile("from emps e where e.age >= n select e.name", &c) {
    Result::Ok(v)  => { v }
    Result::Err(e) => { /* e.message(): str */ return 1i32; }
};

let mut env: QEnv = QEnv::new();
env.bind_source("emps", emps_warray);   // a Writ array of schema'd rows
env.bind_i64("n", 40i64);

let rows: QRows = match q.run(&env) {
    Result::Ok(r)  => { r }
    Result::Err(_) => { return 2i32; }
};
```

Read results out of `QRows` positionally with typed getters:

```logos
let nr: i64 = rows.row_count();
let mut i: i64 = 0i64;
while i < nr {
    let name: str = rows.get_str(i, 0i64);   // row i, column 0
    i = i + 1i64;
}
```

`get_i64`, `get_f64`, `get_bool`, `get_str`, and `get_node` cover the column types; `is_null(r, c)` and `col_ty(c)` report per-cell nullity and per-column type.

### Compile once, run many

A compiled `Query` is re-entrant: run it over different envs — new parameters, new source arrays, even a different graph — without recompiling. This is the whole point of the compile/run split:

```logos
env.bind_i64("start", 1i64);
let r1: QRows = q_reach.run(&env).unwrap();   // reachability from 1
env.bind_i64("start", 5i64);
let r2: QRows = q_reach.run(&env).unwrap();   // same plan, new param
```

### Graphs and mappings, dynamically

The graph vocabulary crosses to the runtime unchanged. `env.bind_source_tree(name, root)` binds a Writ *value* as a virtual edge scan (the runtime twin of `g: &Writ`), and `env.bind_edge_rows(name, rows)` binds pre-materialized edge rows — what a `#[derive_graph_source]` materializer produces. And a static mapping is consumable from the dynamic side too: every mapping emits runtime artifacts (`Net__rules()`, `Net__src()`), which `Query::compile_with_mapping(text, &cat, bind_as, rules, src)` fuses into a dynamically-compiled query with the same graft-and-rename machinery as the static twin.

### Lenient mode: querying erased data

The dynamic surface has a strict default — every source is schema'd and every field resolves against the catalog. When you have irregular data (string-keyed maps, missing fields), bind it *erased* with `bind_source_erased` / `bind_node_erased`. Fields then resolve by name at runtime; a miss yields `RtVal::Null`, and `Null` propagates CEL-style — comparisons against it are false, arithmetic through it stays `Null`, and a `Null` `where` predicate drops the row without erroring.

```logos
// Rows are string-keyed Writ maps; "score" is present on some, missing on others.
env.bind_source_erased("things", tsrc);

// Bob's score is missing → Null > 5 is false → his row drops, no error.
let q: Query = Query::compile(
    "from things t where t.score > 5 select (t.name, t.score + 1)", &c).unwrap();
let r: QRows = q.run(&env).unwrap();   // only rows with score > 5 survive
```

A selected erased field reports its column type as `"dyn"`, and `is_null(r, c)` tells present from absent. Lenient mode is opt-in per binding — the rest of the query stays strict.

## Related

- [Deem: the query & reasoning engine](/deem/introduction/) — the concepts behind this tutorial: the execution modes, EL, Datalog `rel` recursion, graph sources, mappings, and errors-as-values.
- [Deem reference](/deem/reference/) — every clause, the exact lowering signatures, the graph/mapping rules, the `rel`/stratification rules, and the full dynamic API.
- [Trama: the transformation engine](/trama/introduction/) — transform the data you just queried; today that means rendering it to text with the same EL expressions.
