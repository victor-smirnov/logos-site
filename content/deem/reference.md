---
title: "Deem reference"
description: The complete Deem surface — static macro grammar and lowering, the clause pipeline, rel/stratification rules, the EL sublanguage, and the dynamic runtime API.
---

This is the complete reference for **Deem**, the query domain of WQL. It covers both surfaces: the compile-time `deem!` macro and the runtime `logos.std.deem` API. For orientation see the [introduction](/deem/introduction/); for a worked build-up see the [tutorial](/deem/tutorial/). Where a fact has a canonical home, it is the WQL spec (`docs/spec/wql.md`), whose `wql.*` and `el.*` rule ids are the permanent addresses.

## The static macro

### Invocation and grammar

`deem!` is a `#[token_macro]` (handler `fn deem` in `logos.std.wql.wql`; `wql!` and `wql_walk!` are aliases for the same handler). It is invoked as a `resource` binding:

```text
resource <name> = deem!( <params> ) {
    [ rel NAME( col: ty, … ) { body; body; … } ]*     // zero or more rel blocks
    <entry-query>                                       // exactly one entry query
};
```

- `<params>` is a **genuine Logos parameter list**, re-emitted verbatim into the generated signature (so it is compiler-type-checked) and parsed locally to bind sources and type scalars. There is no `$` sigil and no `with` clause.
  - A **slice param** (`emps: &[Emp]`) is a query *source*, named by a `from`/`join` clause; the row type is the slice element type, its fields reflected automatically. A source name matching no slice param is a compile error.
  - A **scalar param** (`i64`/`f64`/`str`/`bool`) is referenced *bare* inside EL clause bodies and by `limit`.
- The body is a program envelope: zero or more `rel` blocks followed by exactly one entry query.

### Entry-query shapes

Four shapes are distinguished by the structural keyword after the source (PEG ordered choice):

| Shape | Skeleton |
| --- | --- |
| **simple** | `from src v [where P] select [first] [distinct] S [order by O [desc]] [limit N|p] [: RTy]` |
| **join** | `from a x ([anti] join b y on ON)+ [where P] select …` |
| **aggregate** | `from a x ([anti] join …)* [where P] group by K aggregate n=fn(arg?),… [having H] select …` |
| **find** | `from src v find P` |

### Lowering signature

The generated `pub fn` shape depends on the terminal clause:

```logos
// select S               →  pub fn name(<params>) -> Result<Vec<T>, ElError>
// select first S         →  pub fn name(<params>) -> Result<Option<T>, ElError>
// from src v find P       →  pub fn name(<params>) -> Result<Option<&Ty>, ElError>
```

`T` is the projected EL type (`Vec<(T1,…)>` for a tuple projection). Errors are values: an integer overflow or division/modulo-by-zero in an EL expression is `Err(ElError)`, never a host trap; `f64` arithmetic stays IEEE. The compiler reports an `error` (not a panic) on a missing binding name, an empty/malformed param list, or a query that fails to parse.

## The clause pipeline

Logical evaluation order — every query is some prefix/subset of this:

```text
from → [join…] → where → group/aggregate → having → order → project(select) → distinct → limit
```

### `from src var`

Opens every query. `src` names a source (slice param or rel); `var` binds the row loop variable used by all downstream clause bodies. Range-variable style (`from src var`), not SQL's post-hoc column scoping.

### `[anti] join src var on P`

Introduces a new source `var` with a required `on` predicate `P`, which may reference every variable bound so far plus scalar params. Steps chain N-way and fold **left-deep**. `anti` keeps a bound row iff *no* `src` row satisfies `P`. The `on` predicate is split into an equi-key term (`<bound> == <new>`) plus a residual filter; the join **strategy** is selected statically from the equi-key type's trait capability:

- `Hash + Eq` → hash join
- else `Ord` → tree join
- else `PartialEq` → nested-loop join (this is where `f64` keys land)
- else → compile error

Outer joins (`LEFT`/`RIGHT`/`FULL`) are not provided.

### `[anti] join base.field[.field] var [on P]` — edge traversal

A traversal step ranges `var` over a *collection field path* of an already-bound row (`base.field…`). `on` is optional here — containment is the join, `P` is a residual filter. Traversal is always nested-loop (the source is correlated). `anti` keeps the bound row iff no element satisfies `P` (or, with no `on`, iff the collection is empty).

### `where P`

Filters the row stream to rows for which the EL predicate `P` (`bool`) holds.

### `group by K`

Partitions rows by the single EL key expression `K`. Multi-column grouping is a tuple key expression (`group by (a, b)`), not `group by a, b`. In `having`/`select`/`order by`, the group key is referenced by the reserved name `key`.

### `aggregate name=fn(arg?),…`

Binds each aggregate output to a column `name`. Builtins:

| fn | arity | result type |
| --- | --- | --- |
| `count()` | nullary | `i64` |
| `sum(e)` | unary | `T` (numeric) |
| `min(e)` | unary | `T` |
| `max(e)` | unary | `T` |
| `avg(e)` | unary | `f64` (always — accumulates and divides as `f64`) |

Aggregate arguments and rel/set-keyed positions may not be `f64` in keyed contexts; `avg` widens integers to `f64`. User aggregates extend this set (see UDA below).

### `having H`

Filters *groups* by an EL predicate over the group `key` and the aggregate output names. It has no IR node of its own — it lowers to a filter over the aggregate output, applied after aggregation and before ordering/projection. Exists only on the aggregate shape.

### `select S`, `select first S`, `select distinct S`

`select <S>` projects each surviving row to the EL expression `S` (a single expression — a scalar, or a tuple `(a, b, …)` for multiple columns; tuples are legal *only* in `select`). The projected value's EL type is the result element type.

- `select first S` makes the query single-row: returns `Option<T>` (the first projected value in scan/`order by` order). Excludes `distinct` and `limit`.
- `select distinct S` deduplicates the projected values (MVP dedup is a linear scan on native `==`).

### `order by O [desc]`

Sorts by a single key expression `O` (ascending default, `desc` for descending). Sits under the projection — its key ranges over input rows, or over the group key + aggregate outputs on the aggregate shape. Single key only; compose a tuple key for compound sorts. The sort is stable.

### `limit N | param`

Truncates to the first `N` rows. `N` is an integer literal or a bare identifier naming a scalar param (the prepared-statement bind). No `OFFSET`.

### `: RTy`

A trailing `: <TypeName>` names the result element type explicitly. Optional — the element type is otherwise inferred from the projection.

### `find P`

Replaces `where`+`select`. Returns `Option<&Ty>`, a zero-copy borrow of the *first* row matching the EL predicate `P` (early-exit scan), `None` when none match. Takes no other clause; `P` may reference scalar params bare. `find` over a rel is a compile error (rel rows are function-locals and cannot be borrowed out).

## rel blocks and Datalog

### Declaration and semantics

```text
rel NAME( col: ty, … ) { body; body; … }
```

A `rel` is a named derived relation with **set semantics** — its rows are the structurally-deduplicated union of its bodies (multiple bodies = a disjunction of Datalog rules with the same head).

- **Columns** must be `i64`/`str`/`bool` (set membership needs `Hash + Eq`; `f64`/`f32` are rejected with a named diagnostic — they lose `Eq`).
- **Bodies** are `from/join/where/select` producers *only*. `aggregate` and `find` bodies are errors; `first`/`distinct`/`order by`/`limit`/`: RTy` are rejected in a body (they are entry-query concerns; `distinct` is implicit under set semantics). The `select` width must equal the declared column count.
- **Scanning a rel**: the entry query (and other rel bodies) may scan a rel by name exactly like a slice source. Self, forward, and mutual references are all legal — the registry is completed before any body resolves. A rel-sourced row var binds to a positional tuple (`s.a` accesses the declared column by position; a 1-column rel is a scalar).
- **Borrow gate**: `find` over a rel and a whole-rel-row `select` are compile errors — rel rows are function-locals, so a borrow cannot escape the generated fn.

### Recursion, SCC, and semi-naïve evaluation

The rel dependency graph is condensed into strongly-connected components in dependencies-first topological order. A singleton SCC with no self-edge materializes one-shot; a **recursive SCC** (self-edge or multi-rel cycle) becomes one shared **semi-naïve fixpoint**: seed bodies (no in-SCC source) run once, then each round promotes the delta into the total, re-runs the recursive bodies against the delta region, and exits when every delta is empty (least fixpoint, mutual recursion supported).

Let a rel be a set of tuples $R \subseteq T_1 \times \cdots \times T_k$; the fixpoint is the least $R$ closed under all of its bodies. Because the universe of derivable tuples is finite (unless a head mints new values), the ascending chain stabilizes.

### Stratification and termination

- **Non-stratifiable error**: an `anti join R` or an aggregate body reading `R`, where `R` is in the *same* SCC as the body's head, is rejected — a named compile error listing the cycle members. Negation or aggregation against an *earlier* (fully-materialized) stratum composes freely.
- **Termination**: the standard Datalog contract. Recursion over a finite universe reaches a least fixpoint; a recursive head that *mints* new values via arithmetic (e.g. `select (p.a + 1, …)`) can diverge and is deliberately **not** capped (a silent cap would change semantics).

## The EL expression sublanguage

EL is the CEL-class scalar expression language embedded by every Deem clause body (`where`, `select`, join `on`, `group by`, aggregate arg, `having`, `order by`, `find`) **and** by [Trama](/trama/introduction/)'s `{{ … }}`/`{% … %}`. It is a strict profile of the one IR; its canonical spec is the `el.*` rule domain in `docs/spec/wql.md#expression-language-el`. Learn it once for both engines.

### Operators and precedence

The fixed CEL precedence chain, low to high:

```text
ternary  →  ||  →  &&  →  ==/!=  →  <=/>=/</>  →  +/-  →  */ /%  →  unary !/-  →  postfix .field  →  primary
```

Binary levels are left-associative. `c ? t : e` is the conditional (both arms must be type-compatible). `.field` is postfix field access — there is **no** safe-navigation `?.` and **no** `has()` macro (see strict optionality below).

### Types and coercion

The static type lattice is four scalar families: **INT**, **STR**, **BOOL**, **FLT** (the whole integer family collapses to INT). Rules:

- **INT → FLT promotion**: in mixed arithmetic the INT operand gets an explicit `((expr) as f64)` cast (Logos is Rust-like — no implicit int→float).
- **String `+`** is concatenation when either operand is STR.
- `avg` and float division always produce FLT.

### Literals, calls, builtins, tuples

- **Literals**: integer, float (`[0-9]+\.[0-9]+`), `true`/`false`, double-quoted string.
- **Calls**: `ident(args)` (up to 8 args). Names resolve builtins-first, then user functions.
- **Builtins**: `len(x)→INT`, `upper(x)`/`lower(x)→STR` (ASCII byte-wise), `contains(a,b)`/`starts_with(a,b)→BOOL`.
- **Tuples**: `(a, b, …)` (≥2 components) — legal only in a `select` position; a single `(a)` is plain grouping.
- **Comprehensions**: `[head for v in src if guard?]` — the Datalog bridge, yielding a `Vec`.

### Errors and null

- **Errors are values**. Integer overflow and division/modulo-by-zero in an EL expression become `Err(ElError)` on the static surface / a `QError` (or `RtVal::Error`) on the dynamic surface — never a host trap.
- **No implicit null in strict mode**. Under the static/strict surface everything is total by schema; optionality is expressed only via `Option`-typed schema fields. Lenient `Null` (CEL-style propagation) exists only for explicitly-erased dynamic bindings — see the dynamic API below.
- **`f64` restriction**: `f64` lacks `Hash + Eq`, so it cannot be a rel column, a `group by`/join hash key, or a set-dedup key; such positions take the loop tier (dynamic) or are a compile error (rel columns). `f64` is fine as a scalar in arithmetic, projection, and `order by`.

## The dynamic API (`logos.std.deem`)

Query text arriving at runtime is parsed, checked against a catalog, optimized, and executed by a tree-walk over the same schema'd IR the macro uses — reusing the same parsers, `lower_rquery_to_rexpr` lowering, simplify passes, join cascade, and semi-naïve fixpoint. No metacall, no codegen. This package is the ABI-stable surface; the `logos.std.wql.*` engine internals stay ABI-excluded.

### `Query`

```logos
pub fn compile(text: str, cat: &SchemaCatalog) -> Result<Query, QError>
pub fn run(self: &Query, env: &QEnv)          -> Result<QRows, QError>
```

`compile` runs the env-independent checks (parse; unknown-fn/arity; comprehension/tuple rejection; catalog-wide unknown-field; literal type conflicts; rel register/validate/SCC/stratify) and the optimizer, then lowers and simplifies. `run` does the strict type-check against the env's declarations, chooses the join cascade from the checked types, materializes rels, and tree-walks to a `QRows`. **Compile once, run many**: a compiled `Query` is re-entrant over different envs.

### `SchemaCatalog`

Usually produced by the `schema_catalog!{ S1, S2, … }` macro reflecting `pub schema` decls into a static rodata blob. The type also has a builder/probe API:

```logos
pub fn new() -> SchemaCatalog
pub fn add_schema(&mut self, name: str, code: u64)
pub fn add_field(&mut self, sname: str, field: str, key: i64, ty: str)
pub fn add_edge(&mut self, sname: str, field: str, key: i64, target: str)
pub fn from_static(blob: WritStatic) -> SchemaCatalog
pub fn merge_static(&mut self, blob: WritStatic)
pub fn schema_code(&self, name: str) -> u64
pub fn field_key(&self, sname: str, field: str) -> i64
pub fn field_ty(&self, sname: str, field: str) -> str
```

The strict checker resolves `e.field` against this catalog.

### `QEnv`

Binds source names, scalar params, and registered UDFs/UDAs (last write per name wins; capacity is 24 bindings, 8 UDFs, 4 UDAs).

```logos
pub fn new() -> QEnv
// scalar params
pub fn bind_i64(&mut self, name: str, v: i64)
pub fn bind_f64(&mut self, name: str, v: f64)
pub fn bind_bool(&mut self, name: str, v: bool)
pub fn bind_str(&mut self, name: str, v: str)
// nodes and sources (strict)
pub fn bind_node(&mut self, name: str, node: WAny)   // a schema'd Writ object (TOM)
pub fn bind_source(&mut self, name: str, arr: WAny)  // a Writ array of schema'd rows
// nodes and sources (lenient/erased)
pub fn bind_node_erased(&mut self, name: str, node: WAny)
pub fn bind_source_erased(&mut self, name: str, arr: WAny)
// UDF / UDA registration → bool (false = bad type name / capacity / >4 args)
pub fn register_fn(&mut self, name: str, f: QFn, args: &[str], ret: str) -> bool
pub fn register_agg(&mut self, name: str, init: QAggInit, step: QAggStep,
                    fin: QAggFin, arg_ty: str, ret_ty: str) -> bool
```

The caller keeps the backing docs alive across `run`. An empty source array binds fine and yields no rows.

### `QRows`

```logos
pub fn row_count(&self) -> i64
pub fn col_count(&self) -> i64
pub fn is_some(&self)   -> bool
pub fn get_i64(&self, r: i64, c: i64)  -> i64
pub fn get_f64(&self, r: i64, c: i64)  -> f64
pub fn get_bool(&self, r: i64, c: i64) -> bool
pub fn get_str(&self, r: i64, c: i64)  -> str
pub fn get_node(&self, r: i64, c: i64) -> WAny
pub fn is_null(&self, r: i64, c: i64)  -> bool
pub fn col_ty(&self, c: i64)           -> str    // "dyn" for lenient columns
```

### `QError`

```logos
pub struct QError { pub msg: String }
pub fn message(&self) -> str    // the error text, valid while the QError lives
```

A positioned runtime error *value* — the offending name/operator is carried inside the message. Returned by `compile`/`run` (and Trama's `Tpl::compile`/`render`).

### `RtVal` and UDF/UDA

`RtVal` is the runtime scalar — the argument and result type of user functions. Cheap to copy (all payloads are word-sized views/handles):

```logos
pub enum RtVal {
    I(i64), F(f64), B(bool), S(str),   // scalars (S is a borrowed view)
    Node(WAny),                         // a Writ object handle
    Null,                               // lenient miss; propagates CEL-style
    Error,                              // math error; aborts the query as a QError
}
```

UDFs and UDAs are function pointers, registered on the env:

```logos
pub type QFn      = fn(&[RtVal]) -> RtVal;   // scalar UDF
pub type QAggInit = fn() -> RtVal;           // UDA: seed accumulator
pub type QAggStep = fn(RtVal, RtVal) -> RtVal;  // fold one row
pub type QAggFin  = fn(RtVal) -> RtVal;      // finalize (identity if unneeded)
```

`register_fn(name, f, args, ret)` declares the EL type names (`"i64"`/`"f64"`/`"bool"`/`"str"`, ≤4 args); `register_agg` declares an init/step/fin triple plus the argument and result EL types. Both return `false` (registering nothing) on a bad type name or a full registry — no silent no-op. Names resolve builtin-table-first, then the registry (builtins shadow same-named user functions), matching the static surface's precedence.

### Lenient / erased mode

`bind_source_erased` / `bind_node_erased` type a binding `dyn` (runtime-typed): fields resolve by name at runtime, a miss yields `RtVal::Null`, and `Null` propagates CEL-style. The exact table:

- `Null == Null` → true; `Null == x` → false; any `Null` operand makes an ordering comparison false.
- Arithmetic with a `Null` operand → `Null`; negation of `Null` → `Null`.
- `Null` is falsy for `&&`/`||`/`!`; a `Null` `where` predicate drops the row; a `Null` ternary condition takes the else branch.
- Builtins on a non-string (including `Null`) argument → `Null`.
- Non-array lenient values iterate as empty; `order by` sorts `Null` keys as 0; `group by` groups `Null` keys together.
- A `dyn` side never qualifies as a hash key (such joins take the loop tier); aggregate arguments and rel columns of `dyn` type are rejected at check time.

Lenient mode is opt-in per binding; a `WAny`-typed field on a strict schema (an `FK_ANY` field) also resolves leniently. Selected erased columns report `col_ty` as `"dyn"`.

## Status and roadmap

**Shipped and tested** (the `wql_*` and `query_*` pass suites): both surfaces of the core query language — `from`, N-way `join`/`anti join`, edge traversal, `where`, `group by`/`aggregate`/`having`, `order by`, `select`/`first`/`distinct`, `limit`, `find`; recursive `rel` blocks with SCC condensation, semi-naïve fixpoint, and stratified-negation checking; the EL sublanguage with errors-as-values; the dynamic `Query`/`QEnv`/`QRows` API with UDF/UDA registration and lenient/erased mode.

Caveats worth stating:

- **ADR 0012** (`0012-writ-query-language.md`) is a **draft/skeleton** — the code has moved ahead of it. Where they differ, the WQL spec (`docs/spec/wql.md`) is authoritative.
- Several MVP internals are naïve by design: `select distinct` dedup, the sort, and some join tiers are `O(n²)`. String builtins are ASCII byte-oriented, not Unicode-aware.
- The spec still refers to the dynamic package as `logos.std.query`; the shipped package is `logos.std.deem`.

**Designed / not a stable surface yet:**

- **Incremental DBSP engine (ADR 0013)** — an in-tree experimental implementation exists (`FactStore`, `IncrJoin`, `IncrRec`, and the `query_incr_*` tests) that maintains query results under fact insert/retract, but it is not yet a stabilized, documented part of the Deem API. Treat it as evolving.
- **Self-applicable reasoner (ADR 0015)** — planned/designed, not shipped.
- **Deem-native doc extraction (ADR 0014)** — the `docs.json` pipeline this site consumes is proposed/first-slice work; the cross-reference rules are Deem `rel` rules, but the end-to-end tool is not fully shipped.

## Related

- [Deem: querying Writ data](/deem/introduction/) — the conceptual overview: two surfaces, EL, Datalog recursion, errors-as-values.
- [Deem tutorial](/deem/tutorial/) — a hands-on build-up from a first query through recursion and the dynamic API.
- [Trama: templating Writ data](/trama/introduction/) — the sibling WQL engine that shares this EL sublanguage and the Writ-schema IR.
