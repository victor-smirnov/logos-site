---
title: "Deem tutorial"
description: Build up a Deem query from a first prepared statement through joins, aggregates, find, and recursive rel blocks, then run the same language dynamically.
---

This tutorial builds a working Deem query step by step, then shows the dynamic surface. Every snippet is drawn from the Logos test suite — you can paste the shapes and run them. We start with the static `deem!` macro (the common case) and finish with `Query::compile`/`run`.

## A source and a first query

A Deem *source* is a slice of Writ-schema'd rows, `&[T]`. Declare a row type, then declare a query as a `resource` bound to a `deem!` macro. Slice parameters are the sources; scalar parameters are referenced bare inside the query.

```logos
package demo;

use logos.std.wql.wql;          // the deem! macro
use logos.mem.collections.vec;

struct Emp { pub name: str, pub dept: i64, pub salary: f64 }

// A prepared statement: names > 50.0 salary, capped at n rows.
resource top = deem!(emps: &[Emp], n: i64) {
    from emps e where e.salary > 50.0 select e.name limit n };
```

Every query opens with `from <src> <var>`: `emps` names the source (the slice param), `e` is the row loop variable used by all downstream clauses. `where` filters, `select` projects, `limit` truncates. The macro lowers this to a native function:

```logos
//  pub fn top(emps: &[Emp], n: i64) -> Result<Vec<str>, ElError>
```

The parameter list is a genuine Logos signature — re-emitted verbatim, type-checked by the compiler, called like any function:

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

## Joining sources

Chain `join <src> <var> on <pred>` steps after the `from`. Each `on` predicate may reference every variable bound so far. The chain is N-way and folds left-deep; the join strategy (hash, tree, or nested-loop) is picked statically from the key type's trait capability — an `i64` equi-key gets a hash join automatically.

```logos
struct Emp  { pub dept: i64, pub salary: i64 }
struct Dept { pub id: i64,   pub region: i64 }
struct Reg  { pub rid: i64,  pub bonus: i64 }

// emp → dept (e.dept == d.id) → region (d.region == r.rid); project salary + bonus.
resource emp_bonus = deem!(emps: &[Emp], depts: &[Dept], regs: &[Reg]) {
    from emps e
    join depts d on e.dept == d.id
    join regs r on d.region == r.rid
    select e.salary + r.bonus };
```

```logos
let rows: Vec<i64> = emp_bonus(&emps[..], &depts[..], &regs[..]).unwrap();
```

An emp whose dept has no matching region row simply drops out of the result — an inner join. (Prefix a step with `anti` to keep only bound rows that have *no* match: `anti join depts d on e.dept == d.id` is the "employees in no known department" query.)

## Grouping, aggregating, having, ordering

Add `group by <key> aggregate <name>=<fn>(<arg>),…` to collapse rows into groups. The five builtin aggregates are `count()` (nullary), `sum`, `min`, `max`, and `avg` (each over one EL argument; `avg` always yields `f64`). Inside `having`, `select`, and `order by` you refer to the group key by the reserved name `key` and to each aggregate by its output name.

```logos
struct Sale { pub dept: i64, pub amount: i64 }

// Per-dept totals, keep groups whose total >= 20.
resource big_totals = deem!(sales: &[Sale]) {
    from sales s
    group by s.dept
    aggregate total = sum(s.amount), cnt = count()
    having total >= 20
    select key * 1000 + total * 10 + cnt };
```

`having` filters *groups* (after aggregation, before ordering and projection). It can range over an `f64` aggregate column too, and combine with `order by`:

```logos
// Depts whose mean sale > 8.0, highest mean first; project the dept id.
resource high_avg_depts = deem!(sales: &[Sale]) {
    from sales s
    group by s.dept
    aggregate av = avg(s.amount)
    having av > 8.0
    select key order by av desc : i64 };
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

resource find_41    = deem!(people: &[Person])         { from people p find p.age == 41 };
resource find_by_age = deem!(people: &[Person], n: i64) { from people p find p.age == n };
```

```logos
match find_41(&people[..]).unwrap() {
    Option::Some(q) => { /* q: &Person, fields read through the borrow */ }
    Option::None    => { /* no row matched */ }
}
```

`find_41` returns a borrow of *Bob* even though a later row shares age 41 — scan order decides. A predicate that matches nothing yields `None`.

## Recursion: a `rel` block

A single entry query is the degenerate zero-rule program. Prefix it with one or more `rel NAME(cols){ bodies }` blocks to declare named derived relations — Datalog rules. Each body is a `from/join/where/select` producer; the union of a rel's bodies (deduplicated structurally) *is* the relation. Columns must be `i64`/`str`/`bool` (a set needs `Eq`; `f64` is excluded). A body may scan another rel — or the rel being defined — exactly like a slice source.

Here is transitive closure. The first body seeds `path` with the edges; the second joins `path` against `edges` to extend paths by one hop. Because the second body reads `path` itself, the two form a recursive component evaluated as one semi-naïve fixpoint:

```logos
struct Edge { pub src: i64, pub dst: i64 }

resource reach = deem!(edges: &[Edge], start: i64) {
    rel path(a: i64, b: i64) {
        from edges e select (e.src, e.dst);
        from path p join edges e on p.b == e.src select (p.a, e.dst);
    }
    from path p where p.a == start select p.b order by p.b
};
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
resource layered = deem!(edges: &[Edge]) {
    rel pairs(x: i64, y: i64) { from edges e select (e.src, e.dst); }
    rel bigy(p: i64)          { from pairs t where t.x > 1 select t.y; }
    from bigy s select s.p order by s.p
};
```

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

- [Deem: the query & reasoning engine](/deem/introduction/) — the concepts behind this tutorial: the two surfaces, EL, Datalog `rel` recursion, and errors-as-values.
- [Deem reference](/deem/reference/) — every clause, the exact lowering signatures, the `rel`/stratification rules, and the full dynamic API.
- [Trama: the transformation engine](/trama/introduction/) — transform the data you just queried; today that means rendering it to text with the same EL expressions.
