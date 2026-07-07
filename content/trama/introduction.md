---
title: "Trama: templating Writ data"
description: Trama is Logos's Jinja2-derived templating language — a typed, compile-checked prepared-render macro plus a dynamic render API, sharing WQL's IR with Deem.
---

## What Trama is

Trama is Logos's template language: you write text with holes in it — `{{ … }}` for a value, `{% … %}` for control flow — and Trama weaves the holes shut against typed data, producing a `String`. Its surface is a deliberate subset of Jinja2, so the syntax will be familiar on sight:

```logos
resource greet = trama!(name: str){ "Hello {{ name }}" };
```

That one line declares a resource whose expansion is a real, native Logos function — `greet("Ada")` returns `"Hello Ada"`. Everything interesting about Trama follows from that: the template is not a runtime-loaded file interpreted on every request, it is source the compiler sees, type-checks, and lowers to buffer pushes.

Trama is one half of **WQL**, Logos's embedded query-and-template subsystem. The other half is **Deem**, the relational query language (`from … where … select …`). The two are siblings by construction, not by analogy: they share the same embedded expression sublanguage (EL), the same Writ-schema intermediate representation, the same optimizer passes, and — on the dynamic surface — the same function registry. Deem answers *what rows*; Trama answers *what text*. Where they touch data, they touch it the same way.

## Two surfaces

Trama exists in two forms, and choosing between them is the first design decision you make.

The **static surface** is the `trama!(params){ body }` token-macro shown above. The template text is known at compile time. The macro parses it, walks the resulting AST, and emits a native render function via `logos_emit_source`. Type errors — an unknown field, a bad function call, a tuple where text is expected — **fail the build** as ordinary compile diagnostics. This is the form to reach for when the template is fixed in the program: a report layout, a code generator, a fixed message. It is fast (it lowers to `__out.push_str(…)` / `push_i64(…)` with no interpreter in sight) and it is safe (nothing type-checks at runtime because everything type-checked at build).

The **dynamic surface** is the runtime API in `logos.std.deem`:

```logos
let t: Tpl = Tpl::compile("Hello {{ e.name }}", &cat)?;
let s: String = t.render(&env)?;
```

Here the template *text* arrives at runtime — from a config file, a database, a user. `Tpl::compile` parses and checks it against a schema catalog; `render` binds it to a `QEnv` and produces the string. Errors are not diagnostics here — the caller is a running program — so every failure is a `QError` **value** returned in a `Result`. This is the form for templates you cannot see at build time. Compile once, render many: a `Tpl` is re-entrant over different environments.

The same generated parser and the same shared chain-walk drive both surfaces. The difference is *when* the text is known and *how* errors surface — a build failure versus a returned value.

## The Jinja2 lineage, and where it departs

Trama's constructs are faithful to Jinja2: `{{ expr }}` interpolation, `{% if %}/{% elif %}/{% else %}/{% endif %}`, `{% for v in coll %}/{% endfor %}`, `{% set v = expr %}`, whitespace-control markers (`{%- -%}`, `{{- -}}`), Jinja truthiness. If you know Jinja, you can read Trama.

The departures are all consequences of Logos being a typed, compiled language:

- **Typed params, not an untyped context dict.** Jinja renders against a bag of untyped variables. Trama's parameters are a genuine Logos parameter list — `trama!(u: &User, greeting: str, count: i64)` — re-emitted verbatim so the compiler parses and type-checks them. The params *are* the type source; there is no `with`/`data` header. A parameter whose type is a schema struct is reflected, so `{{ u.name }}` types automatically from the schema.
- **Compile-time type-checking.** Interpolation routes on the *statically inferred* EL type: a `str` value is pushed as a string, a `bool` renders as the words `true`/`false`, an `f64` formats through the shortest round-trip decimal helper, everything else pushes as `i64`. Jinja decides this dynamically per render; Trama decides it once, at build.
- **Static fails the build; dynamic returns a value.** This is the inversion worth internalizing. On the static surface an error stops the compiler. On the dynamic surface the identical error is a `QError` you handle in code. Same checker, opposite delivery.
- **One coupling to expressions.** Every `{{ … }}` and every tag condition is an EL expression — the same CEL-class expression language Deem uses — reached through exactly one edge per statement node (a `WRef<SExpr>`). Trama specifies the *template* layer and delegates all expression semantics to EL.

One honest gap versus Jinja2: Trama does **not** provide the `loop.*` helpers (`loop.index`, `loop.first`, and friends). A `{% for %}` binds the loop variable and nothing else.

## The AST is itself Writ data

A detail that says something about how Logos is built: Trama's own AST is a first-class Writ schema tree (schema category `0x0013`) — a null-terminated, `next`-linked chain of `TStmt` nodes (`TText`, `TVar`, `TFor`, `TIf`, `TSet`), each carrying its embedded expression as a `WRef<SExpr>` edge. The template compiler is not a special-cased data structure; it is Writ data walked like any other, dogfooding the same substrate (ADR 0011) that user schemas use. Both surfaces walk the identical chain — the static path emits Logos statements from it, the dynamic path interprets it.

You do not need to know this to use Trama. But it is why the two surfaces agree: they are the same tree, read twice.

## Related

- [Trama tutorial](/trama/tutorial/) — build up a template from a first render to loops, conditionals, UDFs, and the dynamic API.
- [Trama reference](/trama/reference/) — the complete surface: every construct, the type-routing and truthiness tables, and the dynamic API signatures.
- [Deem: querying Writ data](/deem/introduction/) — the sibling query half of WQL, sharing Trama's EL expression language and Writ IR.
