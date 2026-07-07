---
title: "Metacall: metaprogramming in Logos"
description: Metacall is Logos's metaprogramming system — ordinary functions the compiler runs at compile time, splicing their results into your program. No separate macro language.
---

**Metacall** is Logos's metaprogramming system. Its one idea is that *a metaprogram is an ordinary Logos function* — same body language, same types, same traits, same `let`/`match`/`if` — that the compiler runs at compile time in its JIT, and whose result splices back into your program. There is no separate macro language, no second evaluator, no second type system, and no second set of safety rules. Code that writes code is just Logos code that happens to run during compilation.

Status: the substrate described here — the `metacall` keyword, `#[fn_macro]` / `#[token_macro]`, `#[metaprog_handler]`, and the `quote_*!` forms — is **implemented and shipping**. A more ambitious capability-gated metafunction model is designed but not built; see [What ships, what's designed](#what-ships-whats-designed) below and the [reference](/metacall/reference/).

## The name: system versus keyword

One point to fix immediately, because the repository uses the word two ways.

- **Metacall** (capitalized, the section name) is the *system as a whole* — the branded name for Logos metaprogramming, a sibling to [Writ](/writ/introduction/), [Deem](/deem/introduction/), and [Trama](/trama/introduction/).
- **`metacall`** (lowercase, in `code` font) is a *specific keyword* — the explicit compile-time-evaluation operator. It is one construct in the system, the one the system takes its name from, not the whole of it.

The umbrella term the compiler's own docs use is *metaprogramming* / *metafunctions*. Whenever this documentation means the operator it says "the `metacall` keyword"; whenever it means the system it says "Metacall." The distinction is load-bearing — do not blur them.

## The three surfaces

Metacall exposes three shipping surfaces, all sitting on **one** compile-time JIT. They differ only in how the compiler is told to run your function and in what the function receives.

1. **The `metacall` keyword** — explicit compile-time evaluation (CTFE). Logos has *no* implicit const-eval; `metacall` is the replacement. `let n: i64 = metacall add(2, 3);` runs `add` in the compiler and splices `5`. It has three expression forms (call, parenthesized-expr, block) and an item form. Reach for it when *you* want to force a value or a batch of items at a specific site.

2. **`#[fn_macro]` and `#[token_macro]`** — the `name!(...)` invocation surface. A `#[fn_macro]` receives its arguments as parsed expression ASTs (`ExprBlob` values); a `#[token_macro]` receives the **raw source bytes between the delimiters as a `str`**, never parsed as Logos. This is how DSLs whose body is not valid Logos are embedded — `deem!`, `wql!`, and `trama!` are all three-argument `#[token_macro]`s.

3. **`#[metaprog_handler("trigger")]`** — derive-style hooks. A handler fires when the compiler scans a user item bearing a matching `#[trigger]` attribute; the handler synthesizes sibling items next to that target. This is how `#[derive_clone]`-style derives are written.

All three routes end in the same place: the metaprogram returns a *typed AST fragment*, and the compiler grafts it into the program.

## The mental model: one JIT, quote and splice

Every surface follows the same three-beat cycle. The compiler synthesizes a no-argument thunk around your metaprogram, JIT-compiles it, invokes it, and replaces the original AST node with what the thunk returned. Your metaprogram does not build AST nodes by hand — it *quotes* them, using typed AST literals:

```logos
quote_item! { struct Synth { x: i32 } }   // → QuoteItemBlob (an item)
quote_expr! { vec_from_arr([1, 2, 3]) }   // → ExprBlob      (an expression)
quote_ty!   { Vec<i32> }                   // → a Type value
```

Inside a quote, antiquotation splices values bound in the surrounding metafunction — `#(name)` / `#(blob)` in `quote_item!`, bare `#x` in `quote_expr!`, `$t` in `quote_ty!` — and repeat groups like `#( #elems ),*` expand a cursor pack. The returned fragment (`ExprBlob`, `QuoteItemBlob`, or a `Vec`-of-items `ItemList`) is spliced in, and then re-enters the normal compiler: the spliced code is type-checked exactly as if you had written it by hand.

<figure class="fig">
<svg viewBox="0 0 660 150" role="img" aria-label="A four-stage left-to-right flow. Stage one: source containing metacall, name-bang, or a derive trigger. Stage two: the compiler's JIT runs the metaprogram function. Stage three: the metaprogram returns a typed AST fragment built with quote — an ExprBlob, a QuoteItemBlob, or an ItemList. Stage four: the fragment is spliced into the program and type-checked as ordinary code. A dashed arrow loops from the last stage back to the second, labelled fixpoint, capped at 16 iterations." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto">
  <style>
    .mc-a { fill: var(--hl-2-bg, #eef6ff); stroke: var(--hl-2, #3b82f6); }
    .mc-b { fill: var(--hl-4-bg, #f0fdf4); stroke: var(--hl-4, #16a34a); }
    .mc-c { fill: var(--bg-code, #f5f5f5); stroke: var(--border, #cbd5e1); }
    .mc-t { fill: var(--fg, #1e293b); font: 12px ui-monospace, monospace; }
    .mc-l { fill: var(--fg-muted, #64748b); font: 11px system-ui, sans-serif; }
    .mc-ar { stroke: var(--fg-muted, #64748b); fill: none; stroke-width: 1.5; }
    .mc-lp { stroke: var(--hl-1, #d946ef); fill: none; stroke-width: 1.5; stroke-dasharray: 5 4; }
  </style>
  <rect class="mc-c" x="0" y="34" width="140" height="48" rx="5"/>
  <text class="mc-t" x="70" y="55" text-anchor="middle">metacall / name!()</text>
  <text class="mc-l" x="70" y="72" text-anchor="middle">source site</text>
  <rect class="mc-a" x="176" y="34" width="140" height="48" rx="5"/>
  <text class="mc-t" x="246" y="55" text-anchor="middle">JIT runs the fn</text>
  <text class="mc-l" x="246" y="72" text-anchor="middle">compile-time thunk</text>
  <rect class="mc-b" x="352" y="34" width="140" height="48" rx="5"/>
  <text class="mc-t" x="422" y="55" text-anchor="middle">quote_*! → blob</text>
  <text class="mc-l" x="422" y="72" text-anchor="middle">typed AST fragment</text>
  <rect class="mc-c" x="528" y="34" width="132" height="48" rx="5"/>
  <text class="mc-t" x="594" y="55" text-anchor="middle">splice + typecheck</text>
  <text class="mc-l" x="594" y="72" text-anchor="middle">re-enters sema</text>
  <path class="mc-ar" d="M140 58 L176 58" marker-end="url(#mcah)"/>
  <path class="mc-ar" d="M316 58 L352 58" marker-end="url(#mcah)"/>
  <path class="mc-ar" d="M492 58 L528 58" marker-end="url(#mcah)"/>
  <path class="mc-lp" d="M594 82 L594 120 L246 120 L246 82" marker-end="url(#mclp)"/>
  <text class="mc-l" x="420" y="136" text-anchor="middle">fixpoint — new items re-run discovery, hard cap 16 iterations</text>
  <defs>
    <marker id="mcah" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="var(--fg-muted, #64748b)"/></marker>
    <marker id="mclp" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="var(--hl-1, #d946ef)"/></marker>
  </defs>
</svg>
<figcaption>The quote-and-splice cycle. Item-generating metaprograms run in a discovery loop: each iteration may emit new items that trigger more metaprograms, repeating to a fixpoint (nothing new emitted), bounded by a hard cap of 16 iterations.</figcaption>
</figure>

## ASTs are Writ maps

The reason this is not a second language grafted onto the compiler is that a metaprogram's inputs and outputs are ordinary Logos data. An `ExprBlob`, a `QuoteItemBlob`, an `ItemList` — each is a struct wrapping a serialized AST, and that AST is a [Writ](/writ/introduction/) document: the same tagged-map format the runtime uses, the same bytes that go on the wire and on disk. The compiler's own intermediate representation was migrated to be a shell over a Writ mirror, so *the bytes are the IR*. A metaprogram that reads or produces code consumes the same layout the compiler does — no impedance mismatch, no bespoke macro token type. Writ is the substrate Metacall's fragments live in, which is why the two sections are so tightly coupled.

## Monotonicity and the fixpoint

Metaprograms only ever **add** entities; they never mutate or delete existing ones. This monotonicity is what makes the cycle "AST → sema → run metaprograms → maybe new types → sema again" terminate cleanly: each discovery iteration either emits something new or the loop stops, bounded by a hard cap of 16 iterations. There is deliberately no AST-rewrite surface — synthesis produces new code, analysis is separate, and the two never cross.

## Where Metacall sits

Metacall is foundational rather than a corner feature. The `name!(...)` macro surface — including the format family (`println!`, `format!`, …) and every DSL macro — is built on it. In particular, Logos's own query and template DSLs are Metacall clients: `deem!` / `wql!` (see [Deem](/deem/introduction/)) and `trama!` (see [Trama](/trama/introduction/)) are `#[token_macro]`s that take a `resource` binding name, a raw parameter list, and a raw body, and emit a checked native `pub fn` at compile time. When you write a `deem!` query, you are using Metacall.

## What ships, what's designed

Be honest about the boundary, the way the [Writ](/writ/introduction/) docs are about *their* unshipped corners.

**Shipping today:** the `metacall` keyword (all forms, with its return-type and staging restrictions enforced — there are failing tests for nested `metacall`, runtime-captured arguments, and non-primitive returns); `#[fn_macro]` / `#[token_macro]` at expression, item, and `resource` positions; `#[metaprog_handler]` derives; `quote_item!` / `quote_expr!` / `quote_ty!` with antiquotation and repeat groups; and `gensym` for hygiene.

**Designed but not built:** the full metafunction model of [ADR 0003](/metacall/reference/#status-gaps) — capability gating (`ReflectCtx` / `InjectCtx` / `QueryCtx`, `IO`/`FFI` forbidden), dependency-set scheduling, content-addressed incremental caching, `typearg(T)` reification, and implicit `metacall` in declaration positions. Also unbuilt: `template` body expansion (a `template` body is parsed and then silently dropped), the `quote_stmt!` / `quote_pat!` / `quote_ident!` forms, full def-site hygiene, and the transformative `Pass<Rewrites, Diagnostics>` phase. These are labeled clearly wherever they appear; treat them as roadmap, not API.

## Related

- [Metacall tutorial](/metacall/tutorial/) — build up from `metacall add(2, 3)` through item generation, your first `#[fn_macro]` and `#[token_macro]`, the `resource = macro!(...){…}` form, and `gensym`, all from real tests.
- [Metacall reference](/metacall/reference/) — every form of the `metacall` keyword, the macro signature tables, the `quote_*!` family and antiquotation, `#[metaprog_handler]`, the splice/typing model, the fixpoint, hygiene, and a full status-and-gaps enumeration.
- [Writ: the data substrate](/writ/introduction/) — the tagged-map format that *is* Metacall's AST representation; ASTs are Writ documents.
- [Deem](/deem/introduction/) and [Trama](/trama/introduction/) — the query and template DSLs, both built as `#[token_macro]`s on this substrate.
