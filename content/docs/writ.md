---
title: "Writ: code + data"
description: Writ is a relocatable, schema-aware, tagged data substrate built directly into the Logos language.
---

**Writ** is what makes Logos more than a Rust-flavored systems language. It's a relocatable, schema-aware, tagged data substrate — and it is built *into the language*, not bolted on as a library, DSL, or macro system.

## Why it's part of the language

In most languages, structured data (JSON, protobufs, config trees) lives on the far side of a boundary: you parse it into values, mutate values, then serialize back. Writ erases that boundary.

- `@{…}` and `@[…]` are **literal forms in the grammar** — object and array Writ literals, right in your source.
- Capture — `$ident` and `${expr}` — splices Logos values into a Writ literal and is **type-checked at sema time**.
- **View types** carry lifetimes through the borrow checker, so borrowing into a Writ graph is as safe as borrowing into any other value.
- Module-scope literals **fold to rodata** — constant Writ documents become read-only data in the binary, with no runtime construction cost.

No DSL. No macros. No FFI between values and data.

## Round-tripping a document

Parsing and re-rendering a Writ document is a call each — the parsed graph is a first-class, owned value:

```logos
package writ_example;
use logos.lang.writ.container;   // Writ
use logos.mem.writ.parser;       // parse_writ
use logos.mem.writ.stringify;    // stringify
use logos.std.io;

fn main() -> i32 {
    let doc: Writ = parse_writ(r#"
        {
            name:"widget",
            version:42,
            active:true,
            tags:["fast","safe"],
            i32_array: <I32> [1,2,3,4]
        }
    "#);
    if doc.root().is_null() { return 1; }   // null root == parse error
    let s: String = stringify(doc.root());
    println(s.as_str());
    return 0;
}
```

Note the `<I32> [1,2,3,4]` form — Writ is **tagged** and **schema-aware**, so element types travel with the data.

## Where Writ fits

Writ underpins a lot of Logos: metaprogramming hooks synthesize source as Writ, the runtime models Datatype / Storage / View with zones and a type registry, and compile-time programming is ordinary Logos code operating over Writ graphs.

For the full runtime model, see the in-repo docs under `docs/internals/writ-runtime.md` in the [Logos repository](https://github.com/victor-smirnov/logos).

## Related

- [Language Overview](/docs/language-overview/) — where Writ sits among the design axes.
- [Getting Started](/docs/getting-started/) — build the compiler and run the round-trip example above.
