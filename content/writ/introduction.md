---
title: "Writ: the data substrate"
description: "Writ is Logos's lightweight referential object graph over zones — schema-aware, tagged, serialization-free, built into the language rather than imported."
---

**Writ** is Logos's data substrate: a lightweight, referential **object graph** built over [zones](/writ/zoned-memory/) — maps, arrays, typed arrays, decimals, strings, and user datatypes as nodes, linked by **self-relative references**, navigated and reshaped at runtime. Because those links are self-relative — an object finds its neighbours by offset, not absolute address — a whole Writ graph is position-independent. It can live directly in an address space **shared between processes**, and it needs **no serialization** to work against external memory or to hand off to an accelerator: the bytes in the container *are* the working representation, not a message you parse into one.

Writ objects are deliberately simple, with a standardized in-memory layout, and they support **no per-object deletion** — a container's memory is reclaimed wholesale by a copying collector ([below](#reclamation-immutability-portability)). And it is not a library you `use` from the outside: the `@{…}` / `@[…]` literal forms are part of the grammar, captures are type-checked at sema, view types are tracked by the borrow checker, and module-scope literals fold to read-only data in the binary.

The name is Old English *ġewrit* — a written record, a *law*. In its day writing was reserved for what was authoritative; a Writ value **is** that record, because the in-memory bytes *are* the record, not a message about one. (It replaced the earlier codename *Hermes*, which named a messenger — apt for transport, wrong for a format that *holds* data. See ADR 0010, and ADR 0011 for schemas.)

Status: **implemented and shipping.**

## The thesis

Writ exists to give you one thing:

> **the flexibility of a dynamically-typed high-level language at the speed of a statically-typed one.**

You build, inspect, and dispatch over arbitrarily-shaped structured data at runtime — the dynamic half — while the bytes keep a compiler-known, zero-copy, unboxed layout with no parse step — the static half. The bridge is **tagged memory**: every object is prefixed by a small variable-length type tag, so code can read that tag and dispatch on a value's type at runtime, exactly as a dynamically-typed language inspects a value, with no static knowledge of the shape.

## The mental model: one tagged word

The whole substrate rests on `WAny`, the Writ heterogeneous slot: a single 8-byte tagged word that is *either* an inline primitive *or* a reference to a type-tagged object.

<figure class="fig">
<svg viewBox="0 0 640 190" role="img" aria-label="A WAny word is 8 bytes. If bit 0 is 1 it is a Pod: bits 1 through 7 hold a 7-bit type code and bits 8 through 63 hold a 56-bit inline value. If bit 0 is 0 and the word is non-zero it is a Ref, a pointer to a tagged object. A word of zero is null." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto">
  <style>
    .wf-b { fill: var(--bg-code, #f5f5f5); stroke: var(--border, #cbd5e1); }
    .wf-p { fill: var(--hl-2-bg, #eef6ff); stroke: var(--hl-2, #3b82f6); }
    .wf-r { fill: var(--hl-4-bg, #f0fdf4); stroke: var(--hl-4, #16a34a); }
    .wf-t { fill: var(--fg, #1e293b); font: 13px ui-monospace, monospace; }
    .wf-l { fill: var(--fg-muted, #64748b); font: 12px system-ui, sans-serif; }
    .wf-tag { fill: var(--hl-1, #d946ef); font: 12px ui-monospace, monospace; }
  </style>
  <text class="wf-l" x="0" y="16">Pod — inline primitive (bit 0 = 1)</text>
  <rect class="wf-p" x="0" y="26" width="120" height="40" rx="4"/>
  <rect class="wf-b" x="120" y="26" width="120" height="40" rx="4"/>
  <text class="wf-t" x="60" y="51" text-anchor="middle">1</text>
  <text class="wf-t" x="180" y="51" text-anchor="middle">7-bit code</text>
  <rect class="wf-b" x="240" y="26" width="400" height="40" rx="4"/>
  <text class="wf-t" x="440" y="51" text-anchor="middle">56-bit signed value</text>
  <text class="wf-l" x="0" y="112">Ref — pointer to a tagged object (bit 0 = 0, word ≠ 0)</text>
  <rect class="wf-r" x="0" y="122" width="640" height="40" rx="4"/>
  <text class="wf-t" x="320" y="147" text-anchor="middle">absolute address → &nbsp;<tspan class="wf-tag">[tag]</tspan>&nbsp; object bytes</text>
  <text class="wf-l" x="0" y="182">A word of 0 is a null reference; a null / absent WAny decodes to the reading type's zero — it never faults.</text>
</svg>
<figcaption>The <code>WAny</code> word: <code>#[zoned] #[borrow_carrying] enum WAny { Ref(*const u8), Pod(u64) }</code>. Zone objects are ≥2-aligned, so a Ref's low bit is always 0 and never collides with the Pod tag.</figcaption>
</figure>

A `Pod` word is `(value << 8) | ((code & 0x7F) << 1) | 1`: bit 0 is the Pod tag, bits 1–7 a 7-bit Writ type code, bits 8–63 a 56-bit signed inline value. Inline integers are therefore `i56`, not `i64`; a value that does not fit 56 signed bits boxes into a `Ref`. Everything else — strings, arrays, maps, decimals, wide scalars, user datatypes — is a `Ref` to a tagged object in a zone.

Two properties fall straight out of this word:

- **Absent is null, and null is the zero value.** A null or absent `WAny` decodes to the reading type's zero — `as_i64 → 0`, `as_bool → false`, a Ref accessor → a null ref — never a fault, never an `Option`. This is the sparse-store default that makes a missing map key harmless.
- **References are position-independent.** A `WAny` has two forms: a *value* form (the plain word in registers) that holds a `Ref` as an absolute pointer, and an *at-rest* form (the same word stored in a zone slot) that holds it as a self-relative delta `target − &slot`. The compiler owns the bridge between them, so a whole graph is relocatable as raw bytes with no pointer rewriting — the property [zoned memory](/writ/zoned-memory/) is built to give.

## Maps, arrays, schemas

Over `WAny`, Writ layers containers:

- **`WArray<WAny>`** — the heterogeneous JSON-style array. **`WArray<T>`** — a typed, densely-packed array of a primitive (`I8`…`F64`), dramatically more compact for numeric payloads.
- **`WMap<WString, WAny>`** — the string-keyed object map (JSON object), grows like a hash map.
- **`WMap<Wu6, WAny>`** — the **TinyObjectMap** (TOM): a fixed-capacity, bitmap-indexed map of up to 52 small keys (`0..51`) → `WAny`, in a 24-byte header. A field lookup is `bitmap & (1 << key)` plus a rank via `popcount` — about what a struct field offset costs, except the field *set* is chosen at runtime. This is the Writ workhorse: **every `logosc` AST node is one.**
- **`schema`** — a typed *view* over a map-like object. A schema is to a Writ map what a `struct` is to a flat byte layout: the same dotted-field syntax (`p.x`, `p.on = true`), but the backing store is a sparse, self-describing, schema-tagged map. Fields are presence-keyed by a stable code, so the layout is forward/backward compatible — adding a key leaves an old reader valid. A **`schema enum`** is a closed union whose variants are other schemas, discriminated not by a stored tag but by the pointee's own `schema_type_code`.

Schemas are what make Writ **typed where you want it and dynamic where you don't**. Logos supports schemas natively over the map types Writ uses, so you work through a schema — fully type-checked field access — exactly where a shape is known, and drop to raw `WAny` traversal where dynamism is more convenient, over the *same* bytes. And because a schema is a compiler-known contract, the compiler can **elide runtime checks** wherever it can prove a map access is safe, so the typed path costs no more than a struct field would.

The [tutorial](/writ/tutorial/) builds each of these up from a first literal; the [reference](/writ/reference/) gives the grammar and rules.

## Three serialization modes

One logical document, three interchangeable representations, chosen by consumer need — with **different safety guarantees and integrity requirements** — and any value moves losslessly between all three:

- **Zero-serialization** — the native in-memory layout. Internal pointers are offsets, so heap, disk, and shared-memory bytes are *the same bytes*: no parse on read. This is what makes storage objects, cross-process IPC, and accelerator offload a pointer hand-off rather than a deserialization. It trusts its input — the fast path for memory you own.
- **Binary serial** — a compact, *validated* wire format for network use, so a compromised peer cannot hand you a malformed document. HRPC frames Writ this way.
- **SDN (String Data Notation)** — the human-readable text form. Every type prints and parses itself; SDN is what you write in `@{…}` literals, what `stringify(root)` emits, and what `parse_writ` consumes.

A Writ container can **check the integrity of its own data**, so a document read back from external memory or the wire can be validated before it is trusted. What Writ deliberately does *not* provide is **versioning**: as a storage format it has no built-in schema-version negotiation — that is left to the operational layer around it (the schema-code compatibility above handles additive field evolution, but format/version policy is the application's to wrap).

## Reclamation, immutability, portability

A Writ container lives in a [relocatable zone](/writ/zoned-memory/), and that choice sets its whole memory story. Objects have no destructors and are never freed individually; instead memory is reclaimed by the simplest possible **copying collector** — walk the reachable set from the root and copy it into a *fresh* container, then drop the old one wholesale. There is no in-place free list, no background thread, no per-object bookkeeping: reclamation is just "keep what's still reachable, discard the rest."

Two further properties follow from the self-contained, offset-addressed layout:

- **An immutable mode.** A container can be sealed immutable, giving a read-only document whose bytes never change after construction — the natural form for shared, cached, or embedded data.
- **Trivially portable.** Because a container holds no absolute pointers and no OS handles, it **moves freely between threads**, and even **between runtimes** — hand off the bytes and the receiver has the live graph, no rehydration.

Treat a Writ document as a *document*, not a *database* — the sweet spot is roughly 1–10 disk blocks of 4 KB; model larger data as many containers linked by application-level identifiers.

## Where Writ sits in Logos

Because of these properties, Writ is the carrier for **everything structured the compiler produces.** Reflection data and **RTTI** are emitted as zero-serialized Writ blobs embedded in `.rodata`, so `reflect::<T>()` is a pointer dereference, not a parse — and the same mechanism carries any embedded document a program wants to ship inside its binary. Logos dogfoods it at the deepest level: **the compiler's own IR is Writ.** `logosc`'s AST and LIR are Writ object graphs — every AST node is a TinyObjectMap with a `CODE` discriminant and typed children. A **library is distributed as its AST** (plus partial sema / mono lowering) combined into a single module *alongside* its object or machine code; the compiler `mmap`s that Writ back with no parse. This is what lets `logosc` be a genuinely **heterogeneous compiler.** It has C++ components — the parser, sema, mono, and codegen — *and* Logos components, notably the [metaprograms](/metacall/introduction/) (`metacall`) that run at compile time. Because the TOM layout is byte-identical across the two languages, all of these components operate on the **same in-memory data structure**, with no marshalling boundary anywhere between them: a metaprogram written in Logos constructs IR the C++ back end consumes directly. In practice this is enormously convenient — one representation, read and written by both halves of the compiler.

That same self-contained representation points at a future direction: because a Writ graph is position-independent and needs no serialization, the compiler's internal structures can be **persisted to a database** and read back as live graphs — the basis for **heterogeneous, distributed build pipelines** where stages of compilation are stored, queried, and resumed rather than recomputed. The higher-level query and transformation surfaces — [Deem](/deem/introduction/) and [Trama](/trama/introduction/) — already operate over Writ graphs as their common substrate.

## Related

- [Writ Tutorial](/writ/tutorial/) — build up hands-on from a first `@{…}` literal through captures, typed arrays, and schemas.
- [Writ Reference](/writ/reference/) — the complete literal grammar, `WAny` value model, schema rules, and pitfalls.
- [Deem: querying Writ](/deem/introduction/) — the query layer that runs over the Writ object graph.
