---
title: "Metacall reference"
description: The complete, precise surface of Logos metaprogramming — the metacall keyword, fn_macro and token_macro, the quote family, metaprog_handler derives, the splice/typing model, the dispatch fixpoint, hygiene, and status/gaps.
---

This page is the precise surface of **Metacall**, Logos's metaprogramming system. It covers the `metacall` keyword, the `#[fn_macro]` / `#[token_macro]` invocation surface, the `quote_*!` family, `#[metaprog_handler]` derives, the splice/typing model, the dispatch fixpoint, and hygiene — closing with an enumeration of what is shipping versus designed. Spec rule ids (e.g. `metaprog.metacall.no-nested-metacall`) name the canonical rule for each behavior. Throughout, **Metacall** is the system and the `metacall` keyword is one operator within it; the two are never interchangeable.

## The `metacall` keyword

`metacall` is Logos's explicit compile-time-evaluation operator. Logos has **no implicit const-eval**; `metacall` is its replacement (`metaprog.metacall.forms`). It runs its operand at compile time and splices the result back into the program as a literal or an AST fragment. For every form the compiler synthesizes a no-argument thunk, JIT-compiles it, invokes it, and replaces the AST node with the result.

### Expression forms

Three operand shapes are accepted in expression position (`metaprog.metacall.forms`):

| Form | Shape | What runs at compile time |
|---|---|---|
| Call | `metacall foo(<args>)` | `foo` with each `<arg>` CTFE-folded to a literal first. Includes generic `foo::<T>(…)` and static `Type::m(…)` calls. |
| Paren-expr | `metacall (<expr>)` | An arbitrary expression — operators, calls, casts. |
| Block | `metacall { <stmts>; <tail> }` | A full block; the trailing tail expression is the value. |

A block operand **must end in a tail expression** with no trailing semicolon (`metaprog.metacall.block-tail-required`); the block's value type is the type of that tail.

### Item form

At module-item position (top level, or inside `impl`), `metacall` takes the **call form only**, terminated by `;` (`metaprog.metacall.item-position`, `metaprog.metacall-item.callee-form`):

```logos
metacall emit_synth();
```

The callee must be a free-function, turbofish, or static-method call, and its return type must be `QuoteItemBlob` (a single item) or `ItemList` (multiple items) — `metaprog.metacall-item.return-type`. The produced items are spliced into the enclosing module in place of the `metacall` item during discovery (`metaprog.metacall.item-position-splice`). Block and paren-expr forms are expression-position only. Item-form arguments are also CTFE-evaluated, resolving module-level consts (`metaprog.metacall-item.args-const-eval`).

### Return-type restriction (expression forms)

The type produced by a `metacall` operand must be one of (`metaprog.metacall.return-type`):

- a primitive scalar — `bool`; integer kinds `i8`/`i16`/`i24`/`i32`/`i56`/`i64` and their `u` counterparts; `f32`/`f64`; integer/float literal types;
- `&str` or `Slice<u8>`;
- `WritStatic`;
- `Writ` (including `Rc<Writ>`) — **call form only**; it auto-freezes to `WritStatic`, and user code observes the spliced value as `WritStatic` (`metaprog.metacall.writ-autofreeze`);
- `ExprBlob` — an AST-expression fragment.

Any other result type is a compile error (the `metacall_non_primitive` failing test returns a struct and is rejected).

When a `metacall` returns an `ExprBlob`, pass-1 typing is **deferred**: `let x: T = metacall foo()` accepts any annotated `T` over the `ExprBlob` right-hand side, and the real type is recovered after the driver splices the blob and pass-2 sema re-lowers it (`metaprog.metacall.exprblob-deferred-typing`). Until the driver substitutes the literal, a `metacall` lowers as a pass-through of its operand's value so borrow/type checks stay valid; this pass-through never reaches codegen (`metaprog.metacall.runtime-passthrough`).

### Staging rules

Three constraints are enforced, each with a failing test:

- **Arguments must be CTFE constants** (`metaprog.metacall.args-ctfe-constant`). Each call-form argument must fold to a constant literal; a bare identifier naming a module-level `pub const` folds (`metaprog.metacall.const-resolver`). A runtime local does not (`metacall_runtime_arg` is rejected).
- **No runtime-local capture** in the block/expr forms (`metaprog.metacall.no-runtime-capture`). Every variable reference must resolve to a binding introduced *inside* the operand (`let`, `for`, `for_each`, match-arm pattern), a module-level const, or a known function. A reference to an enclosing runtime local is an error; the diagnostic hints to hoist into a `pub const` or pass via a `metacall` argument.
- **No nested `metacall`** (`metaprog.metacall.no-nested-metacall`). A `metacall` operand may not contain another `metacall`; it is a one-shot lift to compile time whose result is a runtime value (`nested_metacall` is rejected). Compose the inner calls into one operand instead.

## Function-style macros

The `name!(...)` surface (`expr.macro.fn-style-call`) runs on the same JIT. The parser captures the balanced-delimiter contents as raw text; sema interprets them per the callee's marker. Three delimiter forms exist: `name!(args)` and `name![args]` are expression-position only; `name!{ … }` is item-position at module top level and expression-position elsewhere.

### `#[fn_macro]` versus `#[token_macro]`

The marker decides what the callee receives. A `#[fn_macro]` gets **parsed argument ASTs** (each an `ExprBlob`); a `#[token_macro]` gets the **raw source bytes as `str`**, unparsed (`metaprog.token-macro.raw-text-as-str`). Accepted signatures:

| Marker | Position | Callee signature | Invocation |
|---|---|---|---|
| `#[fn_macro]` | expression | `(ExprBlob) -> ExprBlob` (exactly one arg) | `name!(e)` / `name![e]` |
| `#[fn_macro]` | expression | `(Vec<ExprBlob>) -> ExprBlob` (N args) | `name!(a, b, …)` |
| `#[fn_macro]` | item | `(Vec<ExprBlob>) -> ItemList` \| `QuoteItemBlob`, or `() -> …` | `name!{ … }` |
| `#[token_macro]` | expression | `(str) -> ExprBlob` | `name!(…)` / `name![…]` / `name!{…}` |
| `#[token_macro]` | item | `(str) -> ItemList` \| `QuoteItemBlob` | `name!{ … }` |
| `#[token_macro]` | item / resource | `(name: str, body: str) -> …` | `resource <name> = h!{ … };` |
| `#[token_macro]` | item / resource | `(name: str, params: str, body: str) -> …` | `resource <name> = h!(<params>){ … };` |

Expression-position signatures are checked by `metaprog.fn-macro.signature-shapes`; item-position parameter shapes by `metaprog.fn-macro-item.param-signature`; item-position return types (`ItemList` or `QuoteItemBlob`) by `metaprog.fn-macro-item.return-type`. A `name!(...)` callee must be marked `#[fn_macro]` or `#[token_macro]` — an unmarked callee is a distinct diagnostic (`metaprog.fn-macro.callee-must-be-marked`).

**Argument handling.** For a `#[fn_macro]`, `name!(...)` arguments parse as a comma-separated expression list (`metaprog.fn-macro.args-are-expr-list`); each argument is serialized as the `ExprBlob` of its AST subtree (`metaprog.fn-macro.arg-passed-as-ast-blob`) — the callee receives *syntax*, not a runtime value. The single-arg `(ExprBlob)` form requires exactly one argument (`metaprog.fn-macro.single-arg-arity`). For a `#[token_macro]`, the raw bytes are forwarded verbatim as one `str` with no parsing.

**The `resource` form.** `resource <name> = h!(<params>){ <body> }` supplies the LHS binding as a `NAME`, the parenthesized text as `PARAMS`, and the brace group as `body` — all as opaque `str` values passed byte-for-byte (`metaprog.token-macro-item.raw-text-verbatim`). The `PARAMS` slot is valid *only* for the 3-arg `(name, params, body)` form, and that form requires it (`metaprog.token-macro-item.params-slot-scope`); the `NAME` slot is required for the 2- and 3-arg forms and is accepted-but-discarded for the 1-arg `(str)` form (`metaprog.token-macro-item.name-slot-scope`). A macro author typically re-emits `params` verbatim into a generated signature (so the compiler parses and type-checks it) and splices `body` as the function's tail. Logos's own `deem` / `wql` / `trama` DSLs are the 3-arg form: `#[token_macro] pub fn deem(name: str, params: str, body: str) -> ItemList`.

**Built-in macros.** Before user resolution, a fixed set is handled directly by the compiler (`metaprog.fn-macro.builtin-macro-list`): `cfg!`, `line!`, `column!`, `file!`, `include!`, `include_str!`, `include_bytes!`, `env!`, `concat!`, `concat_bytes!`, `stringify!`, `compile_error!`. The `format!` family (`format!`, `println!`, `print!`, `eprintln!`, `eprint!`, `panic!`, `format_args_str!`, plus `write!` / `writeln!`) is sema-resident: sema parses the format string at compile time and synthesizes a `Formatter`-driven block, skipping the JIT thunk. Notably **absent** built-ins: `assert!`, `assert_eq!`, `matches!`, `dbg!`.

## The quote family

`quote_*!` forms produce typed AST literals — the body is parsed as the corresponding syntactic form, deep-cloned into a fresh Writ document, and emitted as a blob (`metaprog.quote.typed-ast-literals`):

| Form | Body parsed as | Result type |
|---|---|---|
| `quote_item! { item* }` | one or more items | `QuoteItemBlob` |
| `quote_expr! { expr }` | one expression | `ExprBlob` |
| `quote_ty!   { type }` | one type | `Type` (a runtime reflection value) |

`quote_item!` builds a synthetic `package main` module carrying the cloned items (`metaprog.quote-item.synthetic-main-module`) and inherits the enclosing metafunction's `use` scope so unqualified names resolve (`metaprog.quote-item.inherit-import-scope`). `quote_expr!` with no antiquots emits a static rodata blob wrapped as `ExprBlob { ptr }` (`metaprog.quote-expr.reify-ast-to-exprblob`); with antiquots it lowers to a substitution call at runtime. `quote_ty!` reifies a type into a `Type` struct `{ kind, name, size, align, uid }` (`metaprog.quote-ty.reify-type-to-struct`).

### Antiquotation and repeats

The antiquotation spelling differs by form:

- **`quote_item!`** — `#(name)` splices an `Ident` at name / type-name positions (struct name, impl target, fn name, bare-named param/return types, generic args); `#(blob)` splices an `ExprBlob` at a fn body or `return` site; bare `#name` is accepted inside `<…>` generic-argument lists (`metaprog.quote-item.name-antiquot-forms`).
- **`quote_expr!`** — bare `#x` is the everyday form; a scalar antiquot must be `Ident` or `ExprBlob` (`Ident`-only in ident-only positions such as field names) — `metaprog.quote-expr.scalar-antiquot-type`. Struct-literal antiquots are positions *inside* `quote_expr!`: `Foo { #fname: e }`, `Foo { #(#fnames: e),* }`, and field-read `recv.#fname`. A `#x` antiquot must name a bound local (`metaprog.quote-expr.antiquot-must-be-in-scope`).
- **`quote_ty!`** — antiquotation is **`$`-only**: `$ident` for a bound `Type` (`metaprog.quote-ty.antiquot-type-var`), `$ts...` for a pack-splice (`metaprog.quote-ty.pack-splice`). There is no `#(expr)` form inside `quote_ty!`.

**Repeat groups** — `#(...)*`, `#(...),*`, `#(...)&&*` — expand their body once per element of a cursor pack referenced inside, joined by nothing / `,` / `&&`. A cursor must be `[Ident; N]`, `Vec<Ident>`, or `Vec<ExprBlob>` (`metaprog.quote-expr.repeat-cursor-type`); multiple cursors in one group zip by length; a group must contain at least one cursor (`metaprog.quote-expr.repeat-needs-cursor`); fixed-length `[Ident; N]` siblings must agree on `N` (`metaprog.quote-expr.repeat-cursor-length-agree`). Repeats do **not** nest in `quote_expr!` (`metaprog.quote-expr.no-nested-repeat`); in `quote_item!` they nest at most 2 levels (`metaprog.quote-item.repeat-nesting-limit`). Placeholder order is fixed by a deterministic depth-first walk of the quoted subtree (`metaprog.quote-item.placeholder-walk-order`).

### Unshipped quote forms

`quote_stmt!`, `quote_pat!`, and `quote_ident!` are **design-only — not parsed**. Also unimplemented: method-call-name antiquotation in `quote_expr!`, pattern-position antiquotation in `quote_item!` bodies, and a generic-instantiation Type→AST bridge (`Type::ident()` is bare-name only; `Foo<i32>`-shaped splices need a richer reflector).

## `#[metaprog_handler]` derives

A derive-style hook is registered with `#[metaprog_handler("trigger")]` on a function; the first positional string literal is the trigger name (`metaprog.handler.register`). After all modules finish collection, the compiler scans top-level annotations; a `#[trigger]` attribute immediately preceding an item is recorded as a metaprog target (`metaprog.trigger.annotation-scan`), and the registered handler is invoked on each match during discovery. The handler receives its target's AST offset, builds one or more `QuoteItemBlob`s (typically via `quote_item!`), and emits them as sibling items with `logos_emit_item_blob_subst` (single item) or assembles a `Vec<QuoteItemBlob>` for an `ItemList` thunk (`metaprog.derive.trigger-may-emit-items`).

```logos
#[metaprog_handler("derive_clone")]
fn derive_clone_hook(target_offset: u32) -> () {
    // build a QuoteItemBlob via quote_item! { ... }, then:
    unsafe { logos_emit_item_blob_subst(&blob); }
}
```

Logos does **not** accept Rust's `#[derive(Trait, …)]` syntax; that is an error (`metaprog.derive.no-rust-derive-syntax`). Each derive is one trigger annotation `#[derive_<trait>]` paired with an in-scope `#[metaprog_handler("derive_<trait>")]`. The worked example in the standard library (`stdlib/std/compiler/metaprog/derive_clone.logos`) covers both non-generic and generic struct targets through a single hook, using `impl<#( #tparams: Clone ),*>`-style repeat groups.

## Splice and typing model

All routes end in an item or expression fragment spliced into the program and then re-checked as ordinary code.

- **`ExprBlob`** carries a serialized AST-expression Writ blob. When spliced, a `WRIT_BLOB` whose root is an AST-category expression node is lowered by recursively type-checking that node as an ordinary expression (`metaprog.writ-blob.ast-fragment-recurse`); a non-AST blob falls back to an opaque `WritStatic` literal (`metaprog.writ-blob.opaque-static-fallback`). This is why an `ExprBlob` result defers its typing until after the splice.
- **`QuoteItemBlob`** is a single-item blob `{ template_ptr, template_size, idents_blob, blobs_blob, cursors_blob }` (`metaprog.quote-item.blob-result-type`); at item position the compiler synthesizes a void thunk that emits it, substituting captured identifiers, then releases its buffers (`metaprog.item-emit.quoteitemblob-single`).
- **`ItemList`** is a `Vec<QuoteItemBlob>`; its thunk iterates `blobs` and emits each in turn (`metaprog.item-emit.itemlist-iteration`).

The number of antiquot placeholders discovered in the source must equal the number rewritten in the cloned destination, or it is a compile error (`metaprog.quote-item.placeholder-walk-balance`).

## Dispatch: fixpoint and monotonicity

Item generation runs as a **discovery loop** (`metaprog.dispatch.fixpoint-iteration`). Each iteration re-lowers the program and fires triggers, item-position `metacall`s, and item macros that may emit new items; the loop repeats until an iteration emits nothing new (fixpoint), bounded by a **hard cap of 16 iterations**. Termination rests on **monotonicity**: a metaprogram only ever *adds* entities and never mutates or removes existing ones, so each iteration strictly grows the program or halts. There is deliberately no AST-rewrite surface. (During the discovery pass, entry-file function *bodies* are skipped — only signatures and items needed for trigger discovery are processed: `metaprog.discovery.entry-body-skipped`.)

## Hygiene

References written literally inside a quote resolve at the **call site** by default — like Rust `macro_rules!` non-hygienic references. Macro-synthesized locals (e.g. `format!`'s `__buf`) live in fresh block scopes and cannot collide with user names. For a guaranteed-unique name, `gensym(prefix: str) -> Ident` (in `std.compiler.metaprog.ast`) returns a fresh `<prefix>__hyg_<N>` whose bytes are host-owned and bound on both JITs — this resolves the ODR conflict when a hook is invoked more than once. Full **hybrid hygiene** — a separate scope for literal-internal versus antiquoted names — remains future work.

## Status & gaps

Metacall's shipping substrate is the `metacall` keyword, `#[fn_macro]` / `#[token_macro]`, `#[metaprog_handler]`, and `quote_item!` / `quote_expr!` / `quote_ty!` with antiquotation, repeats, and `gensym`. The following are **designed but not built** — treat them as roadmap, not API:

- **The ADR 0003 metafunction model.** Capability gating (`ReflectCtx` / `InjectCtx` / `QueryCtx` tokens; `IO` / `Nondet` / `FFI` forbidden), signature-as-contract dependency-set scheduling, content-addressed incremental caching with provenance, `typearg(T)` type reification into `TypeDef` / `ClassDef`, implicit `metacall` in declaration / type / constraint positions (`Buffer<T, const N = optimal_size_for(T)>`), and `metacall optimal_size_for(...)` in declaration position. Status: **Draft, not implemented.** The JIT symbol sandbox that would enforce the capability set is likewise not yet in place.
- **`template` bodies.** `template <decl>` parses, but the body is then **silently dropped** — not persisted, not expandable. There is no `apply_template`, no `#[apply(...)]`, no `#X` placeholder grammar. `template_of::<X>()` exposes only `name()` and `type_param_count()`. Code generation goes through `#[metaprog_handler]` / `metacall` + `quote_item!` instead.
- **Extra quote forms.** `quote_stmt!`, `quote_pat!`, `quote_ident!` are design-only (not parsed); method-call-name antiquotation and `quote_item!` pattern-position antiquotation are unimplemented; the generic-instantiation Type→AST bridge is bare-name only.
- **Full hygiene.** Only `gensym`-based opaque-name uniqueness ships; hybrid literal-internal versus antiquoted scoping is future work.
- **Transformative passes.** Phase 2 whole-program `Pass<Rewrites, Diagnostics>` (AOP, bytecode rewriting, lints) is design only. Today's system is generative — it adds code, it does not rewrite it.
- **`metacall` capture of surrounding locals.** Deliberately rejected, not a gap to be closed: compile-time evaluation has no access to runtime locals. Hoist to `pub const` or pass as a `metacall` argument.
- **Missing built-in macros.** `assert!`, `assert_eq!`, `matches!`, `dbg!` are not provided.

For the design rationale behind the unbuilt model, see the repository's ADR 0003 (*Metafunctions — Design Rationale*).

## Related

- [Metacall introduction](/metacall/introduction/) — the conceptual model: metaprograms as ordinary functions, the three surfaces, quote-and-splice, ASTs as Writ maps, and monotonicity.
- [Metacall tutorial](/metacall/tutorial/) — a progressive, test-driven walk through every construct on this page.
- [Writ: the data substrate](/writ/introduction/) — the tagged-map format that backs `ExprBlob` / `QuoteItemBlob` / `WritStatic`; Metacall's ASTs are Writ documents.
- [Deem](/deem/introduction/) and [Trama](/trama/introduction/) — the DSLs built on the 3-arg `#[token_macro]` `resource` form; [Language overview](/docs/language-overview/) for where metaprogramming sits in the language.
