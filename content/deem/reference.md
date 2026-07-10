---
title: "Deem reference"
description: "The complete Deem surface — the deem item grammar and lowering, the clause pipeline, graph sources and the edge vocabulary, mappings and source traits, rel/stratification rules, the EL sublanguage, and the dynamic runtime API."
---

This is the complete reference for **Deem**, Logos's query and reasoning engine. It covers both surfaces: the compile-time `deem` language item and the runtime `logos.std.deem` API. For orientation see the [introduction](/deem/introduction/); for a worked build-up see the [tutorial](/deem/tutorial/). Where a fact has a canonical home, it is the query spec (`docs/spec/deem.md`, historically `wql.md`), whose `deem.*` and `el.*` rule ids are the permanent addresses.

## The static item

### Declaration and grammar

A Deem query is a **language item** — parsed by the compiler's own grammar (the `deem` head is a contextual keyword at item position), validated by sema, and lowered through the stdlib handler in `logos.std.wql.wql` (which must be in scope via `use`):

```text
[pub] deem <name>( <params> ) {
    [ rel NAME( col: ty, … ) { body; body; … } ]*     // zero or more rel blocks
    <entry-query>                                       // exactly one entry query
}
```

- **Visibility is real**: `deem q(…)` emits a *non-pub* fn; `pub deem q(…)` a pub one. Doc comments attach to the item.
- `<params>` is a **genuine Logos parameter list** (simple `name: Type` bindings, at least one), re-emitted verbatim into the generated signature (so it is compiler-type-checked). There is no `$` sigil and no `with` clause.
  - A **slice param** (`emps: &[Emp]`) is a query *source*, named by a `from`/`join` clause; the row type is the slice element type, its fields reflected automatically. A source name matching no slice param is a compile error.
  - A **scalar param** (`i64`/`f64`/`str`/`bool`) is referenced *bare* inside EL clause bodies and by `limit`.
  - A **graph param** (`g: &Writ`, or a `#[derive_graph_source]` type) makes the whole document/object graph a source — see [Graph sources](#graph-sources-and-the-edge-vocabulary).
  - A **mapping-typed param** (`w: Net`, `w: Reach<Chain>`) fuses that mapping's rules into the program — see [Mappings](#mappings).
- The body is a program envelope: zero or more `rel` blocks followed by exactly one entry query. The compiler parses it with the C++ parser generated from the same grammar the runtime parser uses, and hands the handler a zero-copy pointer into its arena.

**Retired spelling.** The historical `resource <name> = deem!(<params>){ <query> };` token-macro form is retired; using it is a compile error that prints the exact item replacement (name and params substituted).

### Entry-query shapes

Four shapes are distinguished by the structural keyword after the source (PEG ordered choice):

| Shape | Skeleton |
| --- | --- |
| **simple** | `from src v [where P] select [first] [distinct] S [order by O [desc]] [limit N|p] [: RTy]` |
| **join** | `from a x ([anti] join b y on ON)+ [where P] select …` |
| **aggregate** | `from a x ([anti] join …)* [where P] group by K aggregate n=fn(arg?),… [having H] select …` |
| **find** | `from src v find P` |

### Lowering signature

The generated fn (visibility mirroring the item's) depends on the terminal clause:

```logos
// select S               →  fn name(<params>) -> Result<Vec<T>, ElError>
// select first S         →  fn name(<params>) -> Result<Option<T>, ElError>
// from src v find P       →  fn name(<params>) -> Result<Option<&Ty>, ElError>
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

## Graph sources and the edge vocabulary

### The eight-column edge relation

Every graph-shaped source — a Writ document, a derived native object graph, a runtime tree scan — materializes as **one relation**:

```text
edge(parent: i64, key: str, idx: i64, child: i64, kind: str, tag: i64, vi: i64, vs: str)
```

Container nodes carry structure: `parent`/`child` are node handles (addresses), `key` is the field/map key, `idx` the array position (−1 otherwise). Leaves carry the value in the **typed payload columns** `vi`/`vs`, discriminated by `kind`. The payload columns are *total* — canonical fillers `0`/`""`, never Null (rel rows are set-deduplicated, so two-valued `Eq` is required). Two encodings to know:

- `bool` rides `vi` as 0/1.
- `f64` rides `vi` as its **IEEE-754 bits** (`kind == "f64"`) — bit identity is the honest `Eq` for floats (NaN payloads and ±0.0 stay distinct); recover the value with `f64_from_bits`.

This is *one* vocabulary across all producers and both binding times: the Writ walker, the native derive, and the runtime tree scan all emit it.

### `g: &Writ` — a document as a source

A deem param typed `&Writ` registers the edge relation under the param's own name. The document is scanned edge-per-row — expansion-once, DAG/cycle-safe — with a **virtual root edge** (`parent == 0`) making the root queryable. No materialized copy exists; the document *is* the fact base.

### Graph-path sugar

After a graph source, a `from` may navigate with path steps before binding its variable:

```text
from <graph> <step>* <binder>
```

| Step | Meaning |
| --- | --- |
| `.key` | map/field move to the entry named `key` |
| `[*]` | array elements (`idx >= 0`) |
| `[N]` | the array element at index `N` |
| `*` | any child |
| `{kind}` | a **filter** on the current node's kind — not a move |
| `**` | descendant-or-self |

Steps desugar to a classic join chain over the edge relation, in one shared plan→plan pass used by both binding times. `**` lowers to an injected ordinary Datalog relation (`__reach_<src>`: self-pairs + transitive step, deduplicated by name per program) — reachability runs on the existing rel machinery, *no second engine*. Mid-path bindings are legal (`from g .db d * e …` — both `d` and `e` visible downstream), and graph paths compose with rel bodies, aggregates, and classic join steps.

### `#[derive_graph_source]` — native object graphs

Native Logos objects are deliberately untagged (their types are known statically), so traversal is **generated at compile time** by reflection. Per annotated struct the derive emits a walker, a materializer (`__gs_edges_<T>`), and an `impl GraphSource for T` — the same eight-column vocabulary, with node id = address and `tag = 0`; a `Vec` field is a container node with `idx`-ed elements.

v1 field classes: `i64`/`bool`/`str`/`f64`, `Vec<i64|str|Struct>`, and nested annotated structs. dyn-Trait fields (vtable + TypeId) are the named v2.

## Source traits

A trait may declare **`rel` members**, and an impl binds each rel to a *materializer* function — this is how any type presents itself to Deem as a set of relations:

```logos
pub trait EdgeSource {
    rel link(a: i64, b: i64);            // columns i64/str/bool (the Hash+Eq rule)
}
impl EdgeSource for Chain {
    rel link = chain_edges;              // fn(&Chain) -> Vec<(i64, i64)>
}
```

A deem param typed by an implementing type carries the trait's relations: a single-rel vocabulary is addressable as the param itself (`from g …`); a multi-rel one is param-prefixed (`from e_trace t …`). The query walker is source-type-blind — which params carry relations, their columns, and the materializers all arrive as compiler-computed data, and the built-in Writ and engine-state sources are ordinary stdlib impls riding the same mechanism.

### `e: &IncrRec` — the engine as its own source

A param typed `&IncrRec` carries the stdlib `EngineState` vocabulary — four relations of **sensor facts about the completed past** of an incremental run:

```text
<p>_trace(epoch, kind, step, delta, total, ns)
<p>_epochs(epoch, ins, del, rounds, ns)
<p>_tail(epoch, converged, pending, bound, cutr)
<p>_controls(epoch, kind, val)
```

This is the self-applicability seam: the engine is a source like any other, and its honesty oracles (Σδ consistency, raise/converge pairing) are expressed in Deem itself.

## Mappings

### The `mapping` item

```text
[pub] mapping M[<S: Bound>]( param: Type, … ) {
    [pub] rel r( col: ty, … ) { <rules> }
    …
}
```

A mapping is a **pure rule module** — a named, typed, reusable vocabulary of domain relations over a source shape. It is a *definition*, never an executable: it emits no per-rel functions and cannot be called. It is queried **through**, statically by fusion or dynamically via its runtime artifacts.

- **Header params**: simple `name: Type` bindings, at least one (the source shape). `rel` is contextual inside the body.
- **Rel columns**: 1–8 typed columns, restricted to `i64`/`str`/`bool` (set semantics need `Hash+Eq`; `f64` rejected). At most 8 rels per mapping; duplicate rel names are an error.
- **Per-rel `pub`** marks the consumer-visible vocabulary; a non-`pub` rel is an internal other rels of the same mapping may reference.
- **Item visibility is three-tier**: private to its package / `pub(module)` / `pub` — a `pub mapping` is consumable anywhere, including from another binary module compiled against this module's archive.
- Rel **bodies** are syntax-checked at the item and semantically validated at first consumption.

### Consumption by fusion

`deem q(w: M) { … }` — a deem param *typed by a mapping name* — splices the mapping's rules into the program: the canonical rel list is prepended, parsed as **one program**, the param's type rewrites to the mapping's source type in the emitted signature (`w: Net` → `w: &Writ`), and the mapping's own source param is renamed to the consumer's inside just the spliced rels.

Fusion, not materialization: one dependency graph, one SCC condensation, one fixpoint. Recursion and `**` work across the seam; consumer rels may build on spliced rels; a mapping rel may be joined against the raw graph param or against the consumer's own slice params. Item order and module boundaries do not matter (mappings are pre-scanned; archives carry consumed mappings with identity intact).

### Generic mappings

`mapping M<S: Bound>(g: &S) { … }` is generic over its source, bounded by a **source trait**. `deem q(w: M<T>)` checks the bound (every rel of the bound must be bound in `T`'s impls) and substitutes `&S → &T` — the one place `S` appears. One rule module serves every implementing source type.

### Scalar params

A mapping's scalar params (`floor: i64`) bind at the consumption site by **name identity**: the consumer declares a param with the same name and type, and the spliced rules resolve it as written — no rename, no binding syntax. A missing scalar is a named error.

### Runtime artifacts

Mappings are static-only items; the dynamic side *consumes* them. Each mapping emits two artifacts — `<M>__rules() -> str` (the canonical rel-list text) and `<M>__src() -> str` (its source-param name) — and

```logos
Query::compile_with_mapping(text, &cat, bind_as, rules, src)
```

fuses them into a dynamically-compiled query with the same parse/graft/rename machinery as the static twin; the source then binds via `bind_source_tree(bind_as, root)`.

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

Query text arriving at runtime is parsed, checked against a catalog, optimized, and executed by a tree-walk over the same schema'd IR the static item uses — reusing the same parsers, `lower_rquery_to_rexpr` lowering, simplify passes, join cascade, and semi-naïve fixpoint. No metacall, no codegen. This package is the ABI-stable surface; the `logos.std.wql.*` engine internals stay ABI-excluded.

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
// graph sources (the edge vocabulary)
pub fn bind_source_tree(&mut self, name: str, root: WAny)  // a Writ VALUE, scanned virtually edge-per-row
pub fn bind_edge_rows(&mut self, name: str, rows: WAny)    // pre-materialized edge rows (derive twin)
// UDF / UDA registration → bool (false = bad type name / capacity / >4 args)
pub fn register_fn(&mut self, name: str, f: QFn, args: &[str], ret: str) -> bool
pub fn register_agg(&mut self, name: str, init: QAggInit, step: QAggStep,
                    fin: QAggFin, arg_ty: str, ret_ty: str) -> bool
```

The caller keeps the backing docs alive across `run`. An empty source array binds fine and yields no rows.

The **four source binding kinds**, side by side: `bind_source` (a Writ array of schema'd rows) · `bind_source_erased` (lenient rows, CEL Null semantics) · `bind_source_tree` (a Writ *value* scanned virtually, one row per edge, the [graph vocabulary](#graph-sources-and-the-edge-vocabulary)) · `bind_edge_rows` (pre-materialized rows in the same edge vocabulary — the runtime twin of a `#[derive_graph_source]` materializer). Tree and edge sources type identically (`vi: i64`, `vs: str`, total payloads).

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

### The incremental path

`Query::incremental` maintains query results under fact **deltas** rather than recomputing from scratch — the DBSP model (ADR 0013): ±-weighted Z-set batches through the operators, covering the full relational algebra, recursion, and aggregation, with change capture and provenance, oracle-gated against from-scratch recomputation.

- Facts live in a **`FactStore`** — the delta boundary, fed by `insert`/`retract` events.
- **Virtual sources are rejected** with a named error: a tree scan (`bind_source_tree`) or pre-materialized edge rows (`bind_edge_rows`) have re-scan semantics and no delta capture — materialize facts into a `FactStore` to cross into the incremental world.
- The engine's own execution history is queryable back through the [`EngineState` source](#e-incrrec--the-engine-as-its-own-source) — per-epoch traces, convergence, controls.

## Status and roadmap

**Shipped and tested** (the `wql_*` and `query_*` pass suites): the `deem` and `mapping` language items with real visibility (the `deem!` macro spelling retired with a guided error); both surfaces of the core query language — `from`, N-way `join`/`anti join`, edge traversal, `where`, `group by`/`aggregate`/`having`, `order by`, `select`/`first`/`distinct`, `limit`, `find`; recursive `rel` blocks with SCC condensation, semi-naïve fixpoint, and stratified-negation checking; **graph sources** (`&Writ` params, `#[derive_graph_source]` native graphs, the eight-column edge vocabulary, path sugar incl. `**`); **source traits** with rel members and materializers, incl. the `EngineState` self-source; **mappings** (concrete, generic, scalar params, cross-module consumption, runtime artifacts); the EL sublanguage with errors-as-values; the dynamic `Query`/`QEnv`/`QRows` API with all four bind kinds, UDF/UDA registration, lenient/erased mode, and `compile_with_mapping`; and the **incremental DBSP path** (`Query::incremental`, `FactStore`, `IncrRec`) with change capture and provenance.

Caveats worth stating:

- **ADR 0012** (`0012-writ-query-language.md`) is a **draft/skeleton** — the code has moved ahead of it. Where they differ, the query spec (`docs/spec/deem.md`) is authoritative.
- Several MVP internals are naïve by design: `select distinct` dedup, the sort, and some join tiers are `O(n²)`. String builtins are ASCII byte-oriented, not Unicode-aware.
- `#[derive_graph_source]` v1 covers `i64`/`bool`/`str`/`f64` fields, `Vec` of scalars/structs, and nested annotated structs; dyn-Trait fields are the named v2.

**Designed / not a stable surface yet:**

- **JIT execution** of hot dynamic plans — roadmap (see the [introduction](/deem/introduction/#execution-modes-compiled-interpreted-and-soon-jit)).
- **Self-applicable reasoner (ADR 0015/0016)** — the `EngineState` seam is shipped (case S); the full reasoning loop over the engine's own behavior is in progress.
- **Deem-native doc extraction (ADR 0014)** — the `docs.json` pipeline this site consumes is proposed/first-slice work; the cross-reference rules are Deem `rel` rules, but the end-to-end tool is not fully shipped.

## Related

- [Deem: the query & reasoning engine](/deem/introduction/) — the conceptual overview: two surfaces, EL, Datalog recursion, errors-as-values.
- [Deem tutorial](/deem/tutorial/) — a hands-on build-up from a first query through recursion and the dynamic API.
- [Trama: the template engine](/trama/introduction/) — the sibling engine that shares this EL sublanguage and the schema'd IR.
