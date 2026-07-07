---
title: "Trama reference"
description: The complete Trama surface — static macro and emitted signature, every construct, body forms, escapes, type-routing and truthiness, EL coupling, and the dynamic Tpl API.
---

## Static surface — the `trama!` resource macro

The static form is:

```logos
resource <name> = trama!(<params>){ <template> };
```

The handler behind it is `#[token_macro] pub fn trama(name: str, params: str, s: str) -> ItemList`. It receives the `resource` binding NAME, the raw parameter-list text, and the raw brace-body bytes at compile time, parses the template into the Trama AST, walks it, and emits a native render function via `logos_emit_source`.

**Emitted signature:**

```logos
pub fn <name>(<params>) -> Result<String, ElError> {
    let mut __out: String = String::new();
    // … one lowering per construct: __out.push_str(…) / push_i64(…) / …
    return Result::Ok(__out);
}
```

The result is `Result<String, ElError>` — an integer overflow or divide-by-zero in an embedded `{{ … }}` expression becomes `Err(ElError)` rather than a host trap. A template with no arithmetic never errors; callers typically `.unwrap()`.

- A missing binding name is a compile error (`trama!: needs a binding name`).
- At least one parameter is required (`trama!: needs at least one parameter`).

### Parameters

`params` is a genuine Logos parameter list (e.g. `o: &Order, greeting: str`). It is re-emitted **verbatim** into the generated signature, so the compiler parses and type-checks it, and parsed a second time locally to drive reflection. There is no `with`/`data` header — the parameters *are* the type source.

- **Schema-struct params** (`u: &User`) are reflected via `stamp_types_from_schema`: field accesses (`{{ u.name }}`) type automatically from the schema, and the param is bound in the struct-type env so field chains and `{% for v in u.field %}` loops resolve.
- **Scalar / str params** (`greeting: str`) get their EL value-type set directly, so a bare `{{ greeting }}` renders with the correct push and the name is usable directly.
- **Loop variables** reflect recursively: `{% for v in EXPR %}` resolves `EXPR`'s element type `T` from the schema, binds `v → T` (so `v.member` chains and nested loops resolve), and reflects `T`'s fields. A struct element binds **by reference** (`let v: &Ty = &(iter)[__i];`) to avoid moving out of an index; a scalar element binds by value.

## Constructs

Every construct lowers to a `TStmt` schema node; each node carries its embedded expression as a single `WRef<SExpr>` edge — the one coupling to the expression language.

### `{{ expr }}` — interpolation → `TVar`

Grammar: `LMUST expr RMUST` (plus the whitespace-control variants). Renders the expression by its inferred EL value-type — see the type-routing table below. A `{{ tuple }}` is rejected (templates render text, not rows).

### `{% if %} / {% elif %} / {% else %} / {% endif %}` → `TIf`

Grammar: `{% if expr %} then {% elif e2 %} … {% else %} alt {% endif %}`, producing `TIf { expr, body, alt }`. The condition is coerced to `bool` by truthiness (below). Each `{% elif %}` is desugared at parse time into a nested `TIf` in the enclosing `alt`, so the walk is uniform.

On the static surface, if the optimizer const-folds the condition to a const `bool`, only the taken branch is emitted — no `if` wrapper, the other branch is dropped. A bare INT/STR literal condition (`{% if 1 %}`) is *not* a const bool and keeps its runtime truthiness guard; a folding comparison (`1 > 0`) collapses.

### `{% for v in coll %} … {% endfor %}` → `TFor`

Grammar: `{% for v in expr %} body {% endfor %}`, producing `TFor { var, expr, body }`. The static path emits an indexed `while` over `(expr).len()` binding `v` to each element; the dynamic path iterates a Writ array binding `v` per element. `expr` may be a schema'd object-array (elements bind as nodes) or a scalar-element array (elements bind as their scalar).

> Trama does **not** provide Jinja2's `loop.*` helpers (`loop.index`, `loop.first`, `loop.last`, …). A `{% for %}` binds only its loop variable.

### `{% set v = expr %}` → `TSet`

Grammar: `{% set v = expr %}`, producing `TSet { var, expr }`. The static path emits a typed `let v: <ty> = expr;` whose type (str/bool/f64/i64) follows the assigned expression; the dynamic path binds `v` in the render-local bindings.

### Literal text → `TText`

A run of bytes up to the next `{{`/`{%` (a bare `{` that does not open a tag stays text) is a `TText` node; the static path emits `__out.push_str("…")`, the dynamic path appends the de-escaped bytes.

## Body-delimiter forms

Three forms are accepted after `trama!(params)`:

| Form | Syntax | Notes |
| --- | --- | --- |
| Double-quoted | `trama!(p){ "…" }` | Simplest; escape inner `"`. |
| Backtick-quoted | `` trama!(p){ `…` } `` | Lets EL string literals (`{{ "(" + c + ")" }}`) appear unescaped. Recommended when the template embeds `"`. |
| Delimiter-less | `trama!(p){ … }` | The whole brace body is the template; **leading/trailing whitespace is trimmed**. Use a quoted form to preserve exact edge whitespace. |

The delimiter-less form is selected when the first non-space byte is neither `"` (34) nor `` ` `` (96).

## Escapes and whitespace control

The four template metacharacters are backslash-escaped. The backslash survives the parse and is de-escaped to the bare character at render time (`emit_escaped`, static; `push_deescaped`, dynamic), so `\{{` does not open a tag and a stray brace stays literal.

| Escape | Renders |
| --- | --- |
| `\{` | `{` |
| `\}` | `}` |
| `` \` `` | `` ` `` |
| `\\` | `\` |

Each tag delimiter has a whitespace-control variant that trims the adjacent text run, accepted at every tag site:

| Trim variant | Plain form |
| --- | --- |
| `{{-` / `-}}` | `{{` / `}}` |
| `{%-` / `-%}` | `{%` / `%}` |

## Interpolation type-routing

`{{ expr }}` renders by the expression's inferred EL value-type. The static path routes in code generation; the dynamic path mirrors it in `rt_push`.

| Inferred EL type | Rendering |
| --- | --- |
| STR | `push_str` (a concat is flattened to successive pushes) |
| BOOL | the words `true` / `false` |
| FLT | `wql_f64_to_str` — shortest round-trip `%g` decimal (Rust `Display` convention: `2.5` → `"2.5"`, `5.0` → `"5"`) |
| INT (default) | the `i64` value via `push_i64` |

A `String`-returning UDF is borrowed via `.as_str()` for the push. On the dynamic lenient surface, a `Null` value renders as the empty string (see below).

## Truthiness

An `{% if %}` (and any bool coercion) follows Jinja truthiness:

| Value type | True when |
| --- | --- |
| `bool` | used bare |
| `i64` | `!= 0` |
| `str` | non-empty |
| `Null` (lenient, dynamic) | never — `!Null` is `true`, so the else branch is taken |

## The EL coupling

Every `{{ … }}` and every tag-expression body is an EL expression — the same CEL-class, strongly-typed sublanguage Deem uses — reached through exactly one edge per statement node (a `WRef<SExpr>`). Trama specifies the template layer only; it delegates all expression grammar, typing, and Null semantics to EL. The relevant EL rules include the value-type lattice `{INT, BOOL, STR, FLT}`, the INT→FLT promotion rule (explicit cast), string-`+`-as-concatenation, the owned-`String`-vs-`str`-view distinction, and the builtins `len` / `upper` / `lower` / `contains` / `starts_with`. See the [Deem introduction](/deem/introduction/) for the shared expression language.

## Static error model

On the static surface every error is a compile diagnostic. Unknown-function, arity, and tuple-in-render errors are latched via `error()` (a build failure), and emission continues over a safe placeholder so the compiler can report further errors. A `{{ tuple }}` is rejected — templates render text, not projection rows. This inverts Jinja2, which surfaces template errors at render time.

## Dynamic surface — `Tpl::compile` / `render`

The runtime API lives in `logos.std.deem`:

```logos
pub fn Tpl::compile(text: str, cat: &SchemaCatalog) -> Result<Tpl, QError>
pub fn Tpl::render(self: &Tpl, env: &QEnv)          -> Result<String, QError>
```

- **`compile`** parses the template text with the same generated parser the static surface uses, stitches the `TStmt` chain, runs the shared IR optimizer over every embedded expression, and runs the *env-independent* checks. It is compile-once. A malformed template yields `Tpl::compile: template parse error`. Unknown function names **defer** to the render-time check (they may be env-registered UDFs).
- **`render`** runs the *strict* per-env check (every root name must resolve to a `QEnv` binding, every field to a catalog entry, with the full EL type lattice), then walks the `TStmt` chain building a `String`. It is re-entrant over different environments. A math error in an embedded expression aborts the render as a `QError`.

Errors are **values** (`QError`, a positioned message with a `.message()` accessor), never compile diagnostics — the caller is a running program.

### Binding a `QEnv`

`QEnv::new()` creates an empty environment. Bind roots by kind:

| Binder | Binds |
| --- | --- |
| `bind_node(name, node)` | a schema'd Writ object (schema read off the object's TOM) |
| `bind_source(name, arr)` | a Writ array of schema'd rows |
| `bind_i64` / `bind_f64` / `bind_bool` / `bind_str` | a scalar parameter |
| `bind_node_erased(name, node)` | an erased (lenient) object — fields resolve by name at runtime |
| `bind_source_erased(name, arr)` | an erased array of lenient rows |

The catalog comes from the `schema_catalog!{ … }` resource macro (`let c: SchemaCatalog = cat();`).

### Lenient mode

Lenient-ness is a per-**binding** property. An erased binding types its root as `dyn`; fields resolve at runtime by name, and a miss yields `RtVal::Null`, which propagates CEL-style. Concretely:

- `{{ x }}` whose value is `Null` renders as the **empty string**.
- A `Null` (or non-array) collection in `{% for %}` iterates as an **empty** loop.
- A `Null` `{% if %}` predicate takes the **else** branch.

Strict bindings never produce `Null`, so this is a dynamic-only behavior with no static-surface analogue.

### Shared UDF registry

Both surfaces resolve template functions through one registry shared with Deem, builtin-first. On the static surface the module's top-level functions are registered as UDFs (`stamp_udfs_from_module`), so `{{ myfn(o.total) }}` routes through the shared `emit_call` path. On the dynamic surface, register functions on the env with `register_fn(name, f, args, ret)` (and aggregates with `register_agg`) — the same registry `Query` uses. A same-named builtin shadows a user function.

## The AST substrate

Trama's AST is a first-class Writ schema tree (schema category `0x0013`), dogfooding ADR 0011. A template block is a null-terminated singly-linked chain: every `TStmt` (`TText` / `TVar` / `TFor` / `TIf` / `TSet`) carries `next: WRef<TStmt>`, and a `for`/`if` body (and `if` else) is the head of its own chain. The generated parser yields a `WArray` of statement handles; the `chain_array` post-pass stitches the `next` links. This is shared by both surfaces — the same tree, walked to emit code (static) or interpreted (dynamic).

## Related

- [Trama: templating Writ data](/trama/introduction/) — the concepts: WQL, the two surfaces, and the Jinja2 lineage.
- [Trama tutorial](/trama/tutorial/) — a worked build-up from a first render to loops, UDFs, and the dynamic API.
- [Deem: querying Writ data](/deem/introduction/) — the sibling query half of WQL, sharing Trama's EL expressions, catalog, and `QEnv`.
