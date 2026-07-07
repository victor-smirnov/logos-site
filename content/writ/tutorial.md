---
title: "Writ tutorial"
description: Build up from a first @{…} literal through round-tripping, captures, typed arrays, and schemas — every snippet real, runnable Logos.
---

This tutorial builds Writ up one step at a time, starting from a literal and ending at schema-typed views. Every code block is real, compileable Logos drawn from the examples and tests in the Logos repository. If you have `logosc` built (see [Getting Started](/docs/getting-started/)), you can compile and run each one.

If you only read the [introduction](/writ/introduction/), the one fact to carry in: a Writ document is just a value — `@{…}` and `@[…]` are grammar, not a library.

## 1. Your first literal

The `@` sigil in expression position introduces a Writ literal. Only the **outermost** literal needs the `@`; everything nested is plain:

```logos
let cfg: WritStatic = @{"name": "widget", "tags": ["fast", "safe"], "n": 7};
```

Because this literal has **no captures**, its type is `WritStatic`: a compile-time blob folded into `.rodata`, laid out `[u64 size][bytes]`, with no runtime construction cost. Reading it is a pointer dereference, not a parse. The literal forms are:

```logos
@null            // null
@true   @false   // bool
@42     @-7      // integer
@3.14            // float
@"hello"         // string
@[1, 2, 3]       // array
@{"k": 1}        // map
```

## 2. Parsing and stringifying — the round trip

At runtime you often receive Writ as text (a file, a network frame). `parse_writ` takes Writ text and returns a fresh, owned `Writ` container with the parsed graph already set as its root — the one-call form of *new container + parse + set root*. `stringify` renders any node back to text. This is the complete `examples/writ_round_trip.logos`:

```logos
package writ_example;
use logos.lang.writ.container;   // Writ
use logos.mem.writ.parser;       // parse_writ
use logos.mem.writ.stringify;    // stringify
use logos.mem.string;
use logos.lang.str;
use logos.std.io;

fn main() -> i32 {
    // parse_writ: one call -> a fresh, owned Writ with the parsed graph as root.
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

Two things to notice. First, error handling is *absent-is-null*: a parse error leaves `doc.root()` a null `WAny`, so you check `doc.root().is_null()` rather than catching an exception. Second, the `<I32> [1,2,3,4]` inside the text is a **typed array** — element types travel with the data (more on that in §5).

> `parse_writ` interprets its input purely as Writ text. It does **not** perform Logos-side capture — `$ident` / `${expr}` are only meaningful in `@`-literals in your source, never in parsed strings.

## 3. Capture: splicing Logos values into a literal

Inside an `@`-literal, `$ident` splices a Logos variable and `${expr}` an arbitrary expression at construction time. Capture is type-checked at sema. A capture-bearing literal is no longer a static blob — it is constructed at runtime, so its type is `Rc<Writ>` (bring in `use logos.lang.writ.tmpl;`):

```logos
use logos.lang.writ.tmpl;
use logos.lang.writ.container;
use logos.lang.writ.anyval;
use logos.lang.rc;

let id: i32     = 42;
let label: str  = "item";
let doc: Rc<Writ> = @{"id": $id, "label": $label, "sum": ${id + 1}};
```

A `str` capture is interned into the document's zone as a `WString`; a scalar becomes an inline `Pod`. To read fields back out, borrow the container and walk from its root — here through a lightweight `WView2` reader:

```logos
let h: &Writ = doc.deref();
let v0: WView2 = WView2 { base: 0 as *const u8 };
let got: WAny = v0.map_get(h.root(), "label");
if !got.is_string() { return 7; }   // got holds "item"
```

## 4. Comprehensions

`@[expr for x in iter if guard]` produces a document with an array root, mirroring Python's list comprehension. It is the most direct way to turn a Logos collection into a Writ value:

```logos
let arr: [i32; 5] = [1, 2, 3, 4, 5];
let squares: Rc<Writ> = @[x * x for x in arr if (x % 2) == 1];   // [1, 9, 25]
```

The map form `@{k: v for x in iter}` builds a Map root the same way.

## 5. Typed arrays

A homogeneous array of a primitive can be stored **unboxed** — packed, no per-element tag — as a `WArray<T>`. The cast form `&[T] as <Elem>[]` produces one from a Logos slice:

```logos
let nums: [i32; 4] = [10, 20, 30, 40];
let ns: &[i32] = &nums;
let tarr: Rc<Writ> = ns as <I32>[];      // a dense, packed WArray<I32>
```

`Elem` is one of `I8`, `U8`, `I16`, `U16`, `I32`, `U32`, `I64`, `U64`, `F32`, `F64`. In literal position the same idea is `@<I32>[1, 2, 3, 4]`, and in SDN text it is the `<I32> [ … ]` prefix you saw in §2.

## 6. Building a document programmatically

Literals and parsing are not the only ways in — you can build a document imperatively, pushing into arrays and setting map keys inside a `Writ` container's arena. This excerpt from `examples/writ_container_showcase.logos` shows the never-move arena: a small segment forces real growth, yet a value read before a `push` is still correct after it, because the old buffer is never freed and the self-relative ref re-anchors on grow:

```logos
let h: Writ = writ_new(48i64);                   // small segment → growth is real
let arr: &mut WArray<WAny> = h.array(2i64);      // direct &mut into the arena
let mut k: i64 = 0i64;
while k < 6i64 { arr.push(WAny::from((k * 10i64) as i56)); k = k + 1i64; }   // cap 2 → grows

let before: i64 = arr.get(1i64).as_i56();        // arr[1] == 10
arr.push(WAny::from(999i64));                     // may grow again
let after: i64 = arr.get(1i64).as_i56();
// before == after — the read survived the grow
```

Overloaded `push` takes a value directly — a `str` is interned into the arena as a `WString` ref, an `i64` stored as an inline `Pod`:

```logos
let rec: &mut WArray<WAny> = h.array(2i64);
rec.push("Ada");     // str → interned WString ref
rec.push(36i64);     // i64 → inline Pod
```

## 7. Schemas: a typed view over a map

A `schema` gives a Writ map the dotted-field syntax of a struct, while keeping the sparse, tagged, forward-compatible map underneath. Each field names a key (an explicit `= N`, or the positional index). Keys are TOM codes and must lie in `0..51`. The `code(...)` clause stamps the schema's global identity into the backing map's header.

`h.make::<S>()` allocates a fresh, code-stamped map and hands back a writable view. Reading an absent field yields the type's zero — no fault, no `Option`. This is the core of `tests/logos/pass/schema_read.logos`:

```logos
use logos.lang.writ.container;
use logos.lang.writ.anyval;
use logos.lang.writ.wmap;

schema Pt : code(0x0001000000000005) {
    x:  i64  = 0,
    y:  i64  = 1,
    on: bool = 2,
}

fn main() -> i32 {
    let h: Writ = writ_new(256i64);

    // Construct a fresh schema'd map; absent keys read as the type's zero.
    let fresh: Pt = h.make::<Pt>();
    if fresh.x != 0i64 { return 10i32; }
    if fresh.on        { return 11i32; }

    // Or build the backing TOM by hand, stamp values, bind a view, read via sugar.
    let m: &mut WMap<Wu6, WAny> = h.tinymap(4i64);
    m.set_schema_type_code(0x0001000000000005u64);
    m.set(0u8, WAny::from(42i56));
    m.set(2u8, WAny::from(true));
    let p: Pt = (&*m).view::<Pt>();
    if p.x  != 42i64 { return 1i32; }
    if p.y  != 0i64  { return 2i32; }   // absent key → 0
    if !p.on         { return 3i32; }
    return 0i32;
}
```

### Writing fields

A `&mut S` view carries the zone allocator, so field writes work — including boxing wide values and interning strings. From `schema_write.logos` and `schema_str.logos`:

```logos
schema Cfg : code(0x0001000000000009) {
    n:     i56  = 0,
    on:    bool = 1,
    small: i8   = 2,
}
// ...
let p: Cfg = h.make::<Cfg>();
p.n = 1234i56;
p.on = true;
p.small = -7i8;
// p.n == 1234, p.on == true, p.small == -7

schema Person : code(0x0004000000000000) {
    name: str = 0,
    note: str = 1,
}
// ...
let q: Person = h.make::<Person>();
q.name = "Ada";               // interned into the view's arena
// str_eq(q.name, "Ada") holds; an absent str field reads back empty
```

### Trusted vs checked binding

Two ways exist to reinterpret an existing map as a schema view:

- `.view::<S>()` — **unchecked** (trusted). Use it where the type is statically known, e.g. a concrete child inside an already-bound tree, where the code check is provably redundant.
- `.view_checked::<S>()` — **checked**, returning `Option<S>`. It reads the pointee's `schema_type_code` and yields `Some` only if it matches `S::CODE`. This is the safe downcast from erased or untrusted input; the check happens once, at the trust boundary. From `schema_view_checked.logos`:

```logos
schema Lit : code(0x0002000000000000) { v: i56 = 0 }
// ...
let any: WAny = WAny::from(m as &WMap<Wu6, WAny>);
match any.view_checked::<Lit>() {
    Option::Some(l) => { if l.v != 9i56 { return 1i32; } }
    Option::None    => { return 2i32; }
}
```

> The ADR's planned `.as::<S>()` / `.as_trusted::<S>()` forms are **not shipped**. `make` / `view` / `view_checked` are the shipped surface — the code wins over the ADR.

## 8. A schema enum and match

A `schema enum` is a closed union whose variants are other schemas. There is **no stored discriminant** — the variant is read from the pointee's own `schema_type_code`, so a node identifies itself. `match` reads that code once and binds the concrete variant view in the matched arm. This is the whole of `tests/logos/pass/schema_enum_match.logos`:

```logos
package test;
use logos.lang.writ.container;
use logos.lang.writ.anyval;
use logos.lang.writ.wmap;

schema Lit : code(0x0002000000000000) { v: i56 = 0 }
schema Bin : code(0x0002000000000001) { lhs: i56 = 0, rhs: i56 = 1 }

schema enum Expr : category(0x0002000000000000) {
    L(Lit),
    B(Bin),
}

fn eval(e: &Expr) -> i64 {
    match e {
        Expr::L(l) => { return l.v; }
        Expr::B(b) => { return b.lhs + b.rhs; }
    }
}

fn make_lit(h: &Writ, v: i56) -> Expr {
    let m: &mut WMap<Wu6, WAny> = h.tinymap(2i64);
    m.set_schema_type_code(0x0002000000000000u64);
    m.set(0u8, WAny::from(v));
    return (&*m).view::<Expr>();
}

fn make_bin(h: &Writ, a: i56, b: i56) -> Expr {
    let m: &mut WMap<Wu6, WAny> = h.tinymap(2i64);
    m.set_schema_type_code(0x0002000000000001u64);
    m.set(0u8, WAny::from(a));
    m.set(1u8, WAny::from(b));
    return (&*m).view::<Expr>();
}

fn main() -> i32 {
    let h: Writ = writ_new(256i64);
    let e1: Expr = make_lit(&h, 7i56);
    let e2: Expr = make_bin(&h, 10i56, 20i56);
    if eval(&e1) != 7i64  { return 1i32; }
    if eval(&e2) != 30i64 { return 2i32; }
    return 0i32;
}
```

Note the variant codes share the enum's `category` (the top 16 bits) and differ in the variant (the low 48). That is the whole dispatch: `match` reads the pointee's code and compares against each variant's per-instance code.

## 9. impl and traits on a schema

A schema name is an ordinary type, so `impl S { … }` and `impl Trait for S` need no special casing — methods take `self: &S` / `&mut S` and use both the field sugar and raw `self.m.get`/`set`:

```logos
schema Pt : code(0x0006000000000000) { x: i56 = 0, y: i56 = 1 }

impl Pt {
    fn sum(self: &Pt) -> i64 { return self.x + self.y; }
    fn shift(self: &mut Pt, d: i56) { self.x = self.x + d; self.y = self.y + d; }
}

trait Area { fn area(self: &Self) -> i64; }
impl Area for Pt { fn area(self: &Pt) -> i64 { return self.x * self.y; } }
```

## Where to next

- [Writ Reference](/writ/reference/) — the complete grammar, value model, schema rules, and gotchas behind every form above.
- [Writ Introduction](/writ/introduction/) — the concepts: the thesis, the `WAny` word, serialization modes, and where Writ sits in Logos.
- [Trama: transforming Writ](/trama/introduction/) — the transformation layer that rewrites Writ graphs.
