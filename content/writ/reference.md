---
title: "Writ reference"
description: Complete, precise reference for Writ — literal grammar, the WAny value model, schema rules, view binding, serialization, containers, and pitfalls.
---

This page is the precise reference for the shipped Writ surface. Where it helps, it cites the Writ spec's permanent rule ids (e.g. `writ.value.wany-word`) from `docs/spec/writ.md` in the Logos repository; those ids are stable linkable addresses. For the concepts, start with the [introduction](/writ/introduction/); for a guided build-up, the [tutorial](/writ/tutorial/).

## Literal grammar

Writ structured-data literals use a leading `@` sigil in expression position (`writ.literal.at-brace`). **Only the outermost literal carries the `@`**; nested values are plain.

| Form | Meaning |
|------|---------|
| `@null` | null |
| `@true` / `@false` | bool |
| `@INT` / `@-INT` | integer |
| `@FLOAT` | float |
| `@"str"` | string |
| `@[ v, … ]` | array |
| `@{ k: v, … }` | map |

**Value encodings** (`writ.literal.value-encodings`): an integer lowers inline as `i24` when in `[-2^23, 2^23−1]`, else boxes to `i64`; a float boxes to `f64`; a homogeneous scalar array becomes a typed array, otherwise an object array; a map with integer keys (`I32`/`U32`/`I64`/`U64`) becomes a typed map, otherwise a string-keyed object map.

### Typed collection literals

`writ.literal.typed-collections`:

- `@<Elem>[ … ]` — a typed dense array, `Elem` one of `I8 U8 I16 U16 I32 U32 I64 U64 F32 F64`, resolving to `WArray<Elem>`.
- `@<K>{ … }` / `@<K,V>{ … }` — a typed map, `K` one of `I32 U32 I64 U64`, `V` defaulting to `WAny`, resolving to `WMap<K,V>`.

In SDN text the equivalent prefix is `<I32> [ … ]`. The runtime text parser keeps the type params as **hints** and returns regular array/map nodes.

### Result type: `WritStatic` vs `Rc<Writ>`

- A **capture-free** `@`-literal has type `WritStatic` (`writ.literal.rodata-blob`): a compile-time blob in rodata laid out `[u64 size][bytes]`, `WritStatic.ptr` pointing past the size prefix. The blob is native Writ format (self-relative `WAny` slots, `WMap<WString,WAny>`, `WArray<WAny>`, `WString`) — the same layout the parser builds. Read it with `WView2` (`writ.literal.wview2-reader`).
- A **capture-bearing** `@`-literal has type `Rc<Writ>` and is constructed at runtime — requires `use logos.lang.writ.tmpl;`.

### Captures

`writ.literal.captures`. Available **only** in `@`-literal syntax — `parse_writ` / `parse` do not interpret `$`:

- `$ident` — splice a Logos variable. Same-name `$ident` captures share one value slot (deduplicated).
- `${expr}` — splice an arbitrary expression. Never deduplicated (may have side effects).
- `$N` — a positional PARAM placeholder for document templates (in the embedding grammar).

Capture is type-checked and coerced when safe, and supports `as <T>[…]` casts for typed arrays.

## The WAny value model

### The word

`writ.value.wany-word`. `WAny` is the Writ heterogeneous slot: one 8-byte word, `impl Copy`, defined

```logos
#[zoned] #[borrow_carrying] enum WAny { Ref(*const u8), Pod(u64) }
```

Decoding the raw word: `word == 0` is a null reference (`Ref(0)`); `word & 1 == 1` is an inline `Pod`; `word & 1 == 0 && word != 0` is a `Ref`. Zone objects are ≥2-aligned, so a Ref's low bit is always 0 and never collides with the Pod tag.

### Pod encoding

`writ.value.pod-encoding`. A `Pod` word is `(value << 8) | ((code & 0x7F) << 1) | 1`: bit 0 = 1, bits 1–7 a 7-bit type code (1..127), bits 8–63 a 56-bit signed inline value. **Inline integers are `i56`, not `i64`** — a value that does not fit 56 signed bits boxes into a `Ref`. Inline Pod codes (`writ.value.pod-codes`): `WA_I56=1` (generic inline integer), `WA_BOOL=2`, and exact-width integers `WT_I8=20 WT_U8=21 WT_I16=22 WT_I24=23 WT_U16=24 WT_U24=25`, each preserving its precise type across a round-trip.

### Ref codes

`writ.value.ref-codes`. A `Ref` points at a tagged arena object whose in-band tag identifies the pointee: `W_STRING=130`, `W_ARRAY=100`, `W_MAP=101` (string-keyed), `W_TINYMAP=98` (TOM), `W_DECIMAL=102`, `W_TYPEDVALUE=4115`, plus boxed wide scalars `W_I64=26 W_U64=27 W_F32=30 W_F64=31`.

### Type code and predicates

`writ.value.type-code`. `WAny::type_code()` is the single dispatch point: 0 for null, the inline `pod_code()` for a Pod, or the pointee's tag for a Ref. Kind predicates read it: `is_null is_pod is_ref is_int is_float is_string is_array is_map is_tinymap`. `resolve()` returns the value-form absolute pointer (safe to obtain; dereferencing it is where `unsafe` lives). Accessors: `as_i56 as_i64 as_u64 as_f32 as_f64 as_bool`, and `WAny::from(v)` / `WAny::pod(v, code)` / `WAny::ref_to(ptr)` construct.

### Absent is the zero value

`writ.value.absent-is-null`. A null or absent `WAny` decodes to the reading type's zero, never faulting: `as_i64`/`as_u64` → 0, `as_f32`/`as_f64` → 0.0, `as_bool` → false, a Ref accessor → a null ref. This is the same contract as an absent schema key (`writ.schema.absent-key`).

### At-rest vs value form

`writ.value.at-rest-vs-value`. A `WAny` has two forms. The **value** form (the plain word, movable, in registers) holds a `Ref` as an **absolute** pointer. The **at-rest** form — the same word stored in an arena slot reached through a `*zoned WAny` (a `WArray`/`WMap` buffer) — holds a `Ref` as a **self-relative** delta `target − &slot`. The compiler owns the bridge: `*slot` materialises at-rest→value, `*slot = v` lowers value→at-rest; `Pod`/null are position-independent. `WAnyMut` (`writ.value.wanymut-cursor`) is the mutable dual — a fat `&mut` onto an element slot, with `get()` / `set(v)`.

## Schemas

### Declaration grammar

`writ.schema.decl-grammar`:

```
schema S <type_param_list>? <code_clause>? { field* }
field := pub? IDENT ':' type ('=' const_expr)? ','?
```

Sema registers `S` as a struct flagged `is_schema`. The schema **name itself is the typed view** — there is no separate `FooView` type (`writ.schema.view-over-map`). A view's only real struct fields are synthetic (`writ.schema.synthetic-view-fields`): `m: *const WMap<Wu6,WAny>` (the backing TOM) and `z: *mut u8` (the arena allocator, for boxing on write) — a 16-byte fat view. `z` is null for a read-only view bound from an erased `WAny`. Declared fields do **not** occupy struct offsets; they live in parallel key/field tables surfaced by the desugared get/set.

The `code(...)` and `category(...)` clauses use a **contextual** keyword (a bare IDENT validated in sema), so `code` / `category` remain usable as ordinary identifiers.

### Field keys

`writ.schema.field-key-code`. Each field's key is the `= const_expr` (CTFE-evaluated) when present, else the running positional index (from 0, advancing to `key + 1` after each field). Keys are TOM `u8` codes and:

- must lie in `0..51` — a key `< 0` or `> 51` is a **hard error**: `"key N out of TOM range 0..51"`.
- must be unique — a key equal to an earlier field's is a **hard error**: `"duplicate key N"`.

### Type code, category, variant

`writ.schema.type-code`. An optional `code(const_expr)` clause sets the schema's `schema_type_code` (CTFE `u64`; absent ⇒ 0). It is stamped into the backing TOM header at construction and is the schema's **global identity** — read from the pointee, never stored separately. The code packs `category(16 bits) | variant(48 bits)` (`writ.schema.category-variant-mask`): `CATEGORY_SHIFT = 48`, `CATEGORY_MASK = 0xFFFF << 48`, `VARIANT_MASK = (1 << 48) − 1`. Predefined categories include `CAT_UNSET=0 CAT_AST=1 CAT_TYPE=2 CAT_LIR_EXPR=3 CAT_LIR_STMT=4 CAT_LIR_PAT=5 CAT_SYMBOLS=6 CAT_DIAG=7`.

### Field read / write desugaring

- **Read** `p.f` (`writ.schema.field-read-sugar`) ⇒ `T::from_wany((&*self.m).get(KEY))`: read the synthetic `m`, `get(KEY)` yielding a `WAny`, convert to `T` via the `WritField` trait. An absent key returns a null `WAny` → the type's zero (`writ.schema.absent-key`). A name that is not a declared field falls through to the ordinary struct path.
- **Write** `p.f = v` (`writ.schema.field-write-sugar`) ⇒ `self.m.set(KEY, T::to_wany(v, z))`. `z` is the view-carried allocator, passed for boxing wide values and interning strings; inline conversions ignore it. A type-mismatched write is a hard error: `"schema write 'p.f': expected …, got …"`.

### The `WritField` trait

`writ.schema.writfield-trait`. Field conversions go through:

```logos
trait WritField {
    fn from_wany(v: WAny) -> Self;
    fn to_wany(self: Self, z: *mut Allocator) -> WAny;
}
```

Stdlib impls cover `bool`, `str`, `WAny` (identity), all integer widths (`i8`..`i64` / `u8`..`u64`, `i24 i56 u24 u56 isize usize`), and floats (`f32 f64`). Inline-fitting values ignore `z`; wide/boxing values (`i32 u32 u56 u64 isize usize f32 f64`) allocate through it; `str` interns via `wstring_in_alloc(z, …)`. **A user type becomes schema-storable by implementing `WritField`.** Notable field types:

- `str` (`writ.schema.str-field`) — write interns into the view's arena; read decodes the interned `WString` back to a `str` (null-safe → empty).
- `WAny` (`writ.schema.wany-field`) — the dynamic/heterogeneous field: identity, no conversion, no boxing; re-tag the same slot with any `WAny`; absent reads back null.

### Generic schemas

`writ.schema.generic`. `schema Wrap<T: WritField> { val: T = 0 }` binds `T` as a TypeVar; a `T`-typed field stays symbolic in the generic body and is substituted with the receiver's concrete type-args at the use site (`Wrap<i64>` → `T` becomes `i64`), with mono retargeting the read/write to the concrete `WritField` impl. A type param without a `WritField` impl is a hard error: `"does not implement trait 'WritField'"`. A generic instance derives a **per-instance** `schema_type_code` from the base code's category plus a variant hashed from the canonical concrete name (`writ.schema.generic-instance-code`); `make`, `view_checked`, and schema-enum `match` share this helper, so a produced node's code matches what a consumer checks.

### impl and traits

`writ.schema.impl-and-traits`. The schema name is an ordinary type: `impl S { … }` and `impl Trait for S` need no special casing; methods take `self: &S` / `&mut S` and use both the field sugar and raw `self.m.get`/`set`. A schema may be a trait bound. There is **no `dyn` schema** — open runtime polymorphism is `WAny` + an explicit checked bind; closed sets are a `schema enum`.

## Schema enum and dispatch

`writ.enum.decl`:

```
schema enum E <type_param_list>? <category(expr)>? { V(S), … }
```

A closed union whose variants are **other concrete schemas**; a value is a view `{m, z}` onto the TOM of one variant. It is **not** a flat Logos `enum`: no discriminant is stored — the variant is read from the **pointee's own `schema_type_code`** (single source of truth). The optional `category(expr)` sets the enum's category.

`match` (`writ.enum.match-dispatch`) desugars to reading `(&*e.m).schema_type_code()` once, then an if-chain comparing it against each variant's per-instance code and binding the concrete variant view in the matched arm. Or-patterns in a schema-enum arm are **not yet supported** (`"or-patterns not supported yet"`); an arm pattern must be `E::Variant(b)` or `_`.

## Typed-view binding (shipped surface)

The three shipped bind/construct forms:

| Form | Check | Result | Rule |
|------|-------|--------|------|
| `wr.make::<S>()` | — (allocates & stamps) | `S` (writable view) | `writ.view.make` |
| `.view::<S>()` | **none** (trusted) | `S` | `writ.view.trusted-bind` |
| `.view_checked::<S>()` | verifies `schema_type_code` once | `Option<S>` | `writ.view.checked-option` |

- **`make`** produces a fresh view over a newly allocated, code-stamped TOM (`wr.make_schema_h(cap, S::CODE)` reinterpreted as `S`); `cap` is the schema's field count (min 1). The view carries `z`, so fields are immediately writable.
- **`.view::<S>()`** (alias `.child`) binds *without* a code check — the producer is trusted. Use where the type is statically known (a concrete child inside an already-bound tree).
- **`.view_checked::<S>()`** is the safe downcast from erased/external `WAny`: resolve to the TOM, read `schema_type_code()`, yield `Some(S)` iff it equals `S::CODE`, else `None`. Pattern-match the `Option` to consume.

**Check policy** (`writ.view.check-policy`) follows from the static type, not a flag: erased/external input ⇒ check unavoidable (`view_checked`, or a `match` over a schema enum, once); a bound concrete child ⇒ `view` (check provably redundant, elided).

### Typed edges

`WRef<S>` (`writ.edge.wref`) is the one graph-edge primitive: `pub struct WRef<S> { h: WAny }` — a single `WAny` ref handle whose phantom `S` names the target schema family (compile-time-only documentation; the stored value *is* the `WAny`). `WRef::<S>::from_any(h)` wraps; `.any()` unwraps. It is a schema field via an identity `WritField` (`writ.edge.wref-writfield`). Consume an edge with `r.any().view::<S>()` (`writ.edge.resolve-view`) — the child type is statically the edge target, so no code check.

## Serialization

One logical document, three interchangeable representations; any value round-trips losslessly between all three (`writ.md` §Three Serialization Modes):

- **Zero-copy** — the native in-memory layout; internal pointers are offsets, so heap/disk/shared-memory bytes are the same bytes, no parse on read. For storage, IPC, and accelerator offload.
- **Binary serial** — a compact, *validated* wire format (codec `src/writ/binary_codec.cpp`); validated on decode so a compromised peer cannot hand you a malformed document. HRPC frames Writ this way. In the stdlib, `wbs_write` / `wbs_read` (HBS).
- **SDN (String Data Notation)** — the human-readable text form; every type prints and parses itself. Produced by `stringify`, consumed by `parse_writ` / `parse`.

The text parser, binary codec, and zero-copy clone route through the same trait surface, so every registered datatype gets all three for free.

## Containers

| Container | Alias / code | Shape |
|-----------|--------------|-------|
| `Writ` | — | the owned, never-move root container: owns a segment-arena `Allocator`, holds the root `WAny`. `writ_new(seg_size)`; `set_root` / `root`. (`writ.container.writ-root`) |
| `WMap<Wu6,WAny>` | `WTinyValMap`, `W_TINYMAP=98` | the bitmap-indexed **TinyObjectMap**: ≤52 keys (`0..51`) → `WAny`, 24-byte header, O(1) lookup via `popcount`. The default schema backing. (`writ.container.tom`) |
| `WMap<WString,WAny>` | `WValMap`, `W_MAP=101` | the string-keyed object map (JSON object): open-addressing, FNV-1a, grows like a hash map. (`writ.container.object-map`) |
| `WMap<K,WAny>` (`K: WIntKeyTag`) | `MapI32AnyVal=3101`..`MapU64AnyVal=3104` | the dense integer-keyed map, fixed cap, O(n) linear lookup. (`writ.container.dense-int-map`) |
| `WArray<WAny>` | `W_ARRAY=100` | heterogeneous JSON array of at-rest `WAny` slots. (`writ.container.warray`) |
| `WArray<T>` (`T: WArrTag`) | `2101`..`2110` | typed, packed, homogeneous primitive array. |
| `WString` | `W_STRING=130` | a UTF-8 string interned in the arena; `as_str` borrows it back. |
| `WTypedValue` | `W_TYPEDVALUE=4115` | an SDN datatype instantiation, `@Type(params?) = init`. (`writ.container.typed-value`) |

### The TinyObjectMap in detail

`writ.container.tom`. Header packs `bitmap[0:51] | cap[52:57] | size[58:63]`, plus a separate `schema_code: u64`, plus a self-relative `data: *zoned mut WAny` value buffer kept in key order. `get(key)` returns a null `WAny` for an absent/out-of-range key; `set(key, val)` is a thin `&mut` — fixed cap, so it never allocates, and is a no-op for `key ≥ 52` or a full map with a new key. A key's value-array position is `popcount(bitmap & keys-below)`. `Wu6` is a pure type-level label for the 6-bit key. It is **byte-identical across C++ and Logos** — every `logosc` AST node is one, which is what makes the heterogeneous-compiler story mechanical.

### Walking a document

`writ.container.document-walk`. A "document" is a `Writ` container plus its root `WAny`. Walkers recurse from any `WAny`, dispatching on `type_code()` exactly like `equal` / `stringify`; container children are reached via `is_array`/`is_map` + `resolve()`. This is the canonical traversal shape (`node_count`, `depth`).

## Pitfalls / gotchas

- **Absent is null, not an error.** A missing map key or an absent schema field reads back as the type's zero (`0` / `false` / null ref / empty `str` / null `WAny`), never a fault and never an `Option` (`writ.value.absent-is-null`, `writ.schema.absent-key`). After `parse_writ`, a parse error surfaces the same way: `doc.root().is_null()`. Check for it explicitly where a real value is required.

- **`.as::<S>()` / `.as_trusted::<S>()` are not shipped.** ADR 0011 planned these bind forms, but only `make` / `view` / `view_checked` are implemented — the code wins over the ADR (`writ.view.check-policy`). Use `.view::<S>()` for the trusted bind and `.view_checked::<S>()` for the checked one.

- **The GC runs no destructors.** Reclamation is an on-demand copying/compacting collection over the reachable set — ZTypes are `!Drop`, so no destructors run. Do not attach cleanup semantics to a Writ value's reclamation; there is no conventional heap free per object, only whole-zone copy-and-drop (`writ.md` §Memory Management).

- **Inline integers are `i56`, not `i64`.** A `Pod` carries a 56-bit signed value; anything wider boxes to a `Ref` (`W_I64`/`W_U64`). This is transparent to `as_i64`, but relevant when reasoning about which values allocate (`writ.value.pod-encoding`).

- **Keys must be `0..51` and unique.** A schema field key outside that range, or duplicated, is a hard compile error (`writ.schema.field-key-code`).

- **Captures are literal-only.** `$ident` / `${expr}` are interpreted only in `@`-literals in source, never by the runtime text parser (`writ.literal.captures`).

- **Schema-enum arms are `Variant(b)` or `_` only** — or-patterns are not yet supported (`writ.enum.match-dispatch`).

- **Prefer the free-call/resolve form over `.method()` on a `&WAny`.** Calling a `WAny` accessor as a method on a `&WAny` enum receiver can return null in mlir-gen; the schema desugarings route through a resolved free call for this reason (`writ.pitfall.wany-method-on-enum-ref`). This is mostly internal, but relevant if you hand-roll `WAny` traversal.

## Related

- [Writ Introduction](/writ/introduction/) — the thesis, the `WAny` mental model, and where Writ sits in Logos.
- [Writ Tutorial](/writ/tutorial/) — a runnable build-up from a first literal through schemas and schema enums.
- [Deem: querying Writ](/deem/introduction/) — the query layer over the Writ object graph these types define.
