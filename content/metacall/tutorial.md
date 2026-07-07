---
title: "Metacall tutorial"
description: A hands-on tour of Logos metaprogramming — from metacall add(2, 3) through item generation, fn_macro and token_macro, the resource form, and gensym hygiene, all from real tests.
---

This tutorial builds Metacall up one construct at a time. Every example is a real Logos test (or derived directly from one), so everything here compiles as shown. We start with the `metacall` keyword, move to item generation, then to the `name!(...)` macro surface, and finish with hygiene. If you have not met the system yet, read the [introduction](/metacall/introduction/) first — in particular the distinction between **Metacall** (the system) and the `metacall` keyword (one operator in it).

## Forcing a value at compile time

The `metacall` keyword runs a call in the compiler and splices its result as a literal. Logos has no implicit const-eval, so this is how you say "evaluate this now."

```logos
package metacall_basic;

fn add(a: i64, b: i64) -> i64 {
    return a + b;
}

unsafe fn main() -> i32 {
    let n: i64 = metacall add(2, 3);   // runs add(2, 3) in the compiler → 5
    if n != 5 {
        return 1;
    }
    return 42;
}
```

`add` is an ordinary function — nothing marks it as "meta." What makes this compile-time is the *call site*: `metacall add(2, 3)`. The compiler synthesizes a no-argument thunk, JIT-compiles it, runs it, and replaces the expression with the literal `5`.

Two rules already apply. First, **every argument must be a compile-time constant** — `2` and `3` are literals, and a module-level `pub const` would also work, but a runtime local would not (we hit that guardrail below). Second, the **result type is restricted** to primitive scalars, `&str` / `Slice<u8>`, `WritStatic`, `Writ`, or `ExprBlob`.

## The block and paren-expr forms

The call form is one of three expression forms. You can also hand `metacall` a parenthesized expression or a whole block:

```logos
package metacall_block_simple;

fn compute() -> i32 { return 42; }

fn main() -> i32 {
    let r: i32 = metacall { compute() };   // block form: runs the block, splices its tail value
    return r;
}
```

A `metacall { … }` block must **end in a tail expression** (no trailing semicolon) — that tail is the value. The block may use module-level `pub const`s, top-level functions, and bindings introduced *inside* the block (`let`, `for`, `match` arms). What it may **not** do is reach out and capture a runtime local from the enclosing function — those do not exist at compile time.

## The guardrails, up front

Three things the compiler rejects are worth seeing early, because they define the shape of what `metacall` is. Each is a real failing test.

**Arguments must be constant.** A runtime local is not available at compile time:

```logos
unsafe fn main() -> i32 {
    let x: i64 = 7;
    let n: i64 = metacall add(x, 3);   // ERROR: x is a runtime local, not a constant
    return 0;
}
```

**No nested `metacall`.** `metacall` is a one-shot lift to compile time; its result is a runtime value and so cannot itself be an argument to an enclosing `metacall`:

```logos
// ERROR: metacall may not be nested inside another metacall's operand
pub const X: i32 = metacall foo(metacall bar(metacall baz(5)));
```

The fix is a single `metacall` over the composed call — `metacall foo(bar(baz(5)))` — or separate `pub const`s.

**The return type is restricted.** Returning a struct is rejected (the type must be one of the allowed result categories):

```logos
struct Pair { a: i64, b: i64 }
fn make_pair() -> Pair { return Pair { a: 1, b: 2 }; }

unsafe fn main() -> i32 {
    let p: Pair = metacall make_pair();   // ERROR: struct is not an allowed metacall result type
    return 0;
}
```

To produce *code* rather than a scalar, you return an AST fragment instead — which is where quoting comes in.

## Generating items

At module-item position, `metacall` takes the call form only, is terminated by `;`, and its callee must return an item fragment. Here the callee builds a struct with `quote_item!` and returns it as a `QuoteItemBlob`:

```logos
package main;

use logos.std.compiler.metaprog;
use logos.lang.writ.wstatic;

fn emit_synth() -> QuoteItemBlob {
    return quote_item! {
        struct Synth { x: i32 }
    };
}

metacall emit_synth();          // splices `struct Synth { x: i32 }` into this module

unsafe fn main() -> i32 {
    let s: Synth = Synth { x: 42 };   // Synth now exists and type-checks
    return s.x;
}
```

`quote_item! { … }` parses its body as an item, deep-clones it into a fresh Writ document, and yields a `QuoteItemBlob` — a typed AST literal. The `metacall emit_synth();` item runs during the compiler's discovery pass; the returned blob is spliced as a real top-level item, so later code (here, `main`) can name `Synth` and have it check.

## Emitting several items at once

To emit more than one item, return an `ItemList` — a `Vec` of `QuoteItemBlob`s. This example also shows the first antiquotation: `#id_a` splices an `Ident` into the struct-name position.

```logos
package main;

use logos.std.compiler.metaprog;
use logos.mem.collections.vec;
use logos.lang.writ.wstatic;

fn emit_pair() -> ItemList {
    let mut out: ItemList = item_list_new();

    let s_a: str = "First";
    let id_a: Ident = Ident { ptr: s_a.as_ptr(), len: s_a.len() as u64 };
    let b1: QuoteItemBlob = quote_item! {
        struct #id_a { x: i32 }
    };
    unsafe { (&mut out.blobs as *mut Vec<QuoteItemBlob>).push(b1); }

    let s_b: str = "Second";
    let id_b: Ident = Ident { ptr: s_b.as_ptr(), len: s_b.len() as u64 };
    let b2: QuoteItemBlob = quote_item! {
        struct #id_b { y: i32 }
    };
    unsafe { (&mut out.blobs as *mut Vec<QuoteItemBlob>).push(b2); }

    return out;
}

metacall emit_pair();           // splices `struct First { x: i32 }` and `struct Second { y: i32 }`

unsafe fn main() -> i32 {
    let a: First = First { x: 17 };
    let b: Second = Second { y: 25 };
    return a.x + b.y;
}
```

The compiler synthesizes a thunk that walks `out.blobs` and splices each `QuoteItemBlob` into the surrounding module. An `Ident` is just a `{ ptr, len }` view over some bytes, so building names programmatically is a matter of pointing at a `str`.

## Your first `#[fn_macro]`

The `name!(...)` surface is the same JIT, reached through a marker attribute. A `#[fn_macro]` receives its arguments as *parsed expression ASTs* — one `ExprBlob` each — and returns an `ExprBlob`. This is the standard-library `vec!`:

```logos
#[fn_macro]
pub fn vec(elems: Vec<ExprBlob>) -> ExprBlob {
    return quote_expr! { vec_from_arr([#(#elems),*]) };
}

// use site:
let v: Vec<i32> = vec!(1i32, 2i32, 3i32);
```

Two things are new. `quote_expr! { … }` quotes an *expression* (yielding an `ExprBlob`), and `#( #elems ),*` is a **repeat group**: it expands its body once per element of the `elems` cursor pack, joined by commas. So `vec!(1, 2, 3)` becomes `vec_from_arr([1, 2, 3])`. The `#[fn_macro]`'s returned `ExprBlob` replaces the call site, then re-enters sema and type-checks as ordinary code.

Repeat groups drive a cursor pack that can be `[Ident; N]` or a `Vec`. Here is the same machinery over a fixed array of `Ident`s, splicing three names into a call's argument list:

```logos
fn build_expr() -> ExprBlob {
    let s_a: str = "a"; let s_b: str = "b"; let s_c: str = "c";
    let xs: [Ident; 3] = [
        Ident { ptr: s_a.as_ptr(), len: s_a.len() as u64 },
        Ident { ptr: s_b.as_ptr(), len: s_b.len() as u64 },
        Ident { ptr: s_c.as_ptr(), len: s_c.len() as u64 },
    ];
    return quote_expr! { add3(#(#xs),*) };   // → add3(a, b, c)
}

unsafe fn main() -> i32 {
    let a: i32 = 2; let b: i32 = 3; let c: i32 = 7;
    let r: i32 = metacall build_expr();       // splices add3(a, b, c); a,b,c resolve at the call site
    return r - 5;                             // 12 - 5 = 7
}
```

Note the hygiene model here: the spliced `a`, `b`, `c` resolve in `main`'s scope — **call-site** resolution, like Rust's `macro_rules!` non-hygienic references.

## A `#[token_macro]`: raw bytes, not parsed

Sometimes the body of a macro is *not* valid Logos. A `#[token_macro]` receives everything between the delimiters as a single `str`, byte-for-byte, with no expression parsing at all:

```logos
package token_macro_basic;

use logos.std.compiler.metaprog;

#[token_macro]
pub fn raw_demo(s: str) -> ExprBlob {
    // `s` is the raw text; sema never parsed it. We ignore it and splice a constant.
    return quote_expr! { 99i32 };
}

fn main() -> i32 {
    // The contents are gibberish to the Logos parser — a #[fn_macro] would reject them.
    let v: i32 = raw_demo!{ this is { just } [random] (tokens) };
    return v;                                  // 99
}
```

This is the doorway to DSLs. The macro author decides how to interpret `s` — parse it with a custom grammar, branch on its contents, emit code accordingly.

## The `resource` form and the DSLs

Token macros have a richer item-position form: `resource <name> = macro!(<params>){ <body> };`. Here the compiler hands the callee three `str`s — the binding *name*, the raw *params* text, and the raw *body* text — and the callee (signature `(name: str, params: str, body: str) -> ItemList`) emits an item named by `<name>`. The params are re-emitted verbatim into a real signature, so the compiler genuinely parses and type-checks them:

```logos
package token_macro_item_params_resource;

use logos.std.compiler.metaprog;   // Emitter, item_list_new, ItemList

#[token_macro]
pub fn build_fn(name: str, params: str, body: str) -> ItemList {
    let out: ItemList = item_list_new();

    // Emit `pub fn <name>(<params>) -> i64 { <body> }`.
    let mut em: Emitter = Emitter::new();
    em.emit_into("token_macro_item_params_resource");
    em.push_text("pub fn ");
    em.push_text(name);
    em.push_text("(");
    em.push_text(params);      // "x: i64" — parsed and type-checked in the generated signature
    em.push_text(") -> i64 {\n");
    em.push_text(body);        // "x + 22i64" — spliced as the fn's tail expr
    em.push_text("\n}\n");
    em.commit();

    return out;
}

resource foo = build_fn!(x: i64){ x + 22i64 };   // generates `pub fn foo(x: i64) -> i64 { x + 22i64 }`

fn main() -> i32 {
    let r: i64 = foo(20i64);   // 20 + 22 == 42
    return r as i32;
}
```

This is exactly the shape Logos's own DSLs take. `deem!` / `wql!` (see [Deem](/deem/introduction/)) and `trama!` (see [Trama](/trama/introduction/)) are three-argument `#[token_macro]`s — `pub fn deem(name: str, params: str, body: str) -> ItemList` — invoked as `resource top = deem!(emps: &[Emp], n: i64){ … query … };`. The query text arrives as the raw `body` `str`, the macro parses it with its own grammar, checks it against the row schemas, and emits a native `pub fn`. When you write a `deem!` query, this `resource`/`#[token_macro]` machinery is what runs.

There are shorter forms too: the two-argument `(name: str, body: str)` variant (`resource seniors = make_query!{ … };`, no params list) and the plain `(str)` variant. The reference tabulates all of them.

## Hygiene with `gensym`

Names written literally inside a quote resolve at the call site, which is usually what you want. But an item-generating metaprogram invoked *more than once* would emit the same name twice and collide. `gensym(prefix: str) -> Ident` returns a fresh `<prefix>__hyg_<N>` identifier that is unique per call:

```logos
package main;

use logos.std.compiler.metaprog;
use logos.lang.writ.wstatic;

fn emit_one() -> QuoteItemBlob {
    let n: Ident = gensym("Helper");           // e.g. Helper__hyg_0, then Helper__hyg_1
    return quote_item! {
        struct #n { v: i32 }
    };
}

metacall emit_one();
metacall emit_one();          // without gensym, both would emit `struct Helper` and collide

unsafe fn main() -> i32 {
    return 42;
}
```

Each invocation gets a distinct name, so both structs splice cleanly. `gensym` is today's hygiene tool; full def-site hygiene (a separate scope for literal-internal names) is still on the roadmap — see the reference.

## Where to go next

You have now used all three surfaces — the `metacall` keyword, `#[fn_macro]` / `#[token_macro]`, and item generation — plus `quote_item!`, `quote_expr!`, repeat groups, and `gensym`. The [reference](/metacall/reference/) fills in the exact grammar, the signature tables, the antiquotation-position matrices, the fixpoint and monotonicity rules, and precisely which pieces are shipping versus designed.

## Related

- [Metacall introduction](/metacall/introduction/) — the concepts behind this tour: metaprograms as ordinary functions, the three surfaces, the quote-and-splice model, and ASTs as Writ maps.
- [Metacall reference](/metacall/reference/) — complete forms, signature tables, the `quote_*!` family, `#[metaprog_handler]`, the splice/typing model, and the status-and-gaps enumeration.
- [Deem](/deem/introduction/) and [Trama](/trama/introduction/) — real DSLs built on the `resource = macro!(…){…}` `#[token_macro]` form shown above.
