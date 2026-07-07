---
title: "TinyObjectMap: the Writ workhorse"
description: "The TinyObjectMap (WMap<Wu6, WAny>) is Writ's fixed-capacity, bitmap-indexed small map — the default schema backing and the shape of every logosc AST node. O(1) field access at about a struct-offset cost, chosen at runtime."
---

The **TinyObjectMap** — `WMap<Wu6, WAny>`, alias `WTinyValMap`, wire code `W_TINYMAP = 98` — is the single most important container in Writ. It is a compact, **fixed-capacity, bitmap-indexed** map of up to **52 small keys** (`0..51`) to `WAny` values, and it is the structure Writ leans on everywhere a small keyed object is needed:

- it is the **default backing store for a [schema](/writ/reference/#schemas)** — a typed view is a view over a TOM;
- it is the shape of **every `logosc` AST node** — the compiler's own IR is built from these;
- and its layout is **byte-identical across C++ and Logos**, which is what makes the heterogeneous compiler story mechanical (see [Where the TOM earns its keep](#where-the-tom-earns-its-keep)).

Its trick is to make a *dynamically-chosen* field set cost about what a *statically-laid-out* struct field costs: an O(1) lookup that is a bitmask, a `popcount`, and an indexed load.

## The layout

A TOM is a small header followed by a packed value buffer. The header is one 64-bit word plus a schema code; the values live in a separate, self-relative buffer kept **in key order**.

<figure class="fig">
<svg id="tom-layout" viewBox="-8 -6 696 484" role="img" aria-label="The TinyObjectMap header is one 64-bit word: bits 0 to 51 are a presence bitmap of the 52 possible keys, bits 52 to 57 are the capacity, bits 58 to 63 are the current size. A separate schema_code word holds the schema identity. Values live in a self-relative buffer in key order. To look up a key, mask the bitmap to the bits below that key, popcount the result, and that count is the value's index in the buffer." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto">
  <style>
    #tom-layout .bmap { fill: var(--hl-4-bg, #f0fdf4); stroke: var(--hl-4, #2f8f4e); stroke-width: 1.5; }
    #tom-layout .cap  { fill: var(--hl-2-bg, #eef6ff); stroke: var(--hl-2, #3b6fe0); stroke-width: 1.5; }
    #tom-layout .code { fill: var(--bg-code, #f5f5f5); stroke: var(--border, #cbd5e1); stroke-width: 1.5; }
    #tom-layout .cell { fill: var(--bg-code, #f5f5f5); stroke: var(--border, #cbd5e1); stroke-width: 1.25; }
    #tom-layout .on   { fill: var(--hl-4-bg, #f0fdf4); stroke: var(--hl-4, #2f8f4e); stroke-width: 1.75; }
    #tom-layout .val  { fill: var(--hl-4-bg, #f0fdf4); stroke: var(--hl-4, #2f8f4e); stroke-width: 1.5; }
    #tom-layout .mask { fill: var(--hl-1-bg, #fdf0fb); stroke: var(--hl-1, #b5259e); stroke-width: 1.75; }
    #tom-layout .ar   { stroke: var(--hl-1, #b5259e); stroke-width: 1.75; fill: none; marker-end: url(#tom-a); }
    #tom-layout .t    { fill: var(--fg, #1e293b); font: 13px ui-monospace, monospace; }
    #tom-layout .ts   { fill: var(--fg, #1e293b); font: 12px ui-monospace, monospace; }
    #tom-layout .l    { fill: var(--fg-muted, #64748b); font: 11.5px system-ui, sans-serif; }
    #tom-layout .m    { fill: var(--hl-1, #b5259e); font: 12px ui-monospace, monospace; }
  </style>
  <defs>
    <marker id="tom-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--hl-1, #b5259e)"/></marker>
  </defs>
  <text class="l" x="0" y="16">Header word (64 bits) — low bits on the left</text>
  <rect class="bmap" x="0" y="26" width="470" height="44" rx="4"/>
  <text class="t" x="235" y="53" text-anchor="middle">presence bitmap · keys 0..51</text>
  <rect class="cap" x="470" y="26" width="90" height="44" rx="4"/>
  <text class="ts" x="515" y="53" text-anchor="middle">cap</text>
  <rect class="cap" x="560" y="26" width="90" height="44" rx="4"/>
  <text class="ts" x="605" y="53" text-anchor="middle">size</text>
  <text class="l" x="0" y="86">bits 0–51 (52)</text>
  <text class="l" x="474" y="86">52–57 (6)</text>
  <text class="l" x="564" y="86">58–63 (6)</text>
  <rect class="code" x="0" y="104" width="470" height="34" rx="4"/>
  <text class="ts" x="16" y="126">schema_code : u64</text>
  <text class="l" x="480" y="126">schema identity (0 = unset)</text>
  <text class="l" x="0" y="182">Lookup — get(key = 3), with keys {1, 3, 4} present</text>
  <text class="l" x="0" y="208">bitmap (keys 0–7 shown):</text>
  <g>
    <rect class="cell" x="0"  y="220" width="44" height="40" rx="4"/><text class="ts" x="22" y="245" text-anchor="middle">0</text>
    <rect class="on"   x="44" y="220" width="44" height="40" rx="4"/><text class="ts" x="66" y="245" text-anchor="middle">1</text>
    <rect class="cell" x="88" y="220" width="44" height="40" rx="4"/><text class="ts" x="110" y="245" text-anchor="middle">0</text>
    <rect class="on"   x="132" y="220" width="44" height="40" rx="4"/><text class="ts" x="154" y="245" text-anchor="middle">1</text>
    <rect class="on"   x="176" y="220" width="44" height="40" rx="4"/><text class="ts" x="198" y="245" text-anchor="middle">1</text>
    <rect class="cell" x="220" y="220" width="44" height="40" rx="4"/><text class="ts" x="242" y="245" text-anchor="middle">0</text>
    <rect class="cell" x="264" y="220" width="44" height="40" rx="4"/><text class="ts" x="286" y="245" text-anchor="middle">0</text>
    <rect class="cell" x="308" y="220" width="44" height="40" rx="4"/><text class="ts" x="330" y="245" text-anchor="middle">0</text>
  </g>
  <text class="l" x="22"  y="278" text-anchor="middle">k0</text>
  <text class="m" x="66"  y="278" text-anchor="middle">k1</text>
  <text class="l" x="110" y="278" text-anchor="middle">k2</text>
  <text class="l" x="154" y="278" text-anchor="middle">k3</text>
  <text class="l" x="198" y="278" text-anchor="middle">k4</text>
  <rect class="mask" x="-2" y="216" width="136" height="48" rx="6" fill="none"/>
  <text class="m" x="0" y="306">mask = keys below 3 (bits 0,1,2)</text>
  <text class="ts" x="0" y="344">popcount(bitmap &amp; mask) = popcount(0b010) = <tspan class="m">1</tspan>  →  value index <tspan class="m">1</tspan></text>
  <text class="l" x="0" y="384">value buffer (key order):</text>
  <rect class="val" x="0"   y="396" width="110" height="44" rx="5"/><text class="ts" x="55"  y="423" text-anchor="middle">val(k1)</text>
  <rect class="val" x="118" y="396" width="110" height="44" rx="5"/><text class="ts" x="173" y="423" text-anchor="middle">val(k3)</text>
  <rect class="val" x="236" y="396" width="110" height="44" rx="5"/><text class="ts" x="291" y="423" text-anchor="middle">val(k4)</text>
  <text class="l" x="55"  y="458" text-anchor="middle">[0]</text>
  <text class="l" x="173" y="458" text-anchor="middle">[1] ← get(3)</text>
  <text class="l" x="291" y="458" text-anchor="middle">[2]</text>
  <path class="ar" d="M173,346 C173,366 173,378 173,394"/>
</svg>
<figcaption>The TOM header packs a 52-bit presence bitmap, a 6-bit capacity, and a 6-bit size into one 64-bit word, next to a <code>schema_code</code>. A key's value lives at index <code>popcount(bitmap &amp; keys-below)</code> in a key-ordered buffer — here <code>get(3)</code> resolves to slot <code>[1]</code>.</figcaption>
</figure>

Concretely, the header is:

- **`bitmap` (bits 0–51)** — one presence bit per possible key. Bit *k* set ⇔ key *k* is present. This is the whole index; there are no key bytes stored.
- **`cap` (bits 52–57)** and **`size` (bits 58–63)** — the buffer capacity and the current live count, each a 6-bit field.
- **`schema_code : u64`** — a separate word holding the schema's global identity (`0` = unset). It is read from the pointee, never stored alongside the value; `schema_type_code()` / `set_schema_type_code()` access it. This is how a schema view knows what it is looking at.
- **`data : *zoned mut WAny`** — a self-relative pointer to the value buffer, whose entries are kept **in key order**. Being `*zoned`, it is a self-relative delta, so the whole TOM is position-independent like the rest of a [zoned](/writ/zoned-memory/) graph.

Because keys are *not* stored — only their presence bits — a TOM with *n* live entries is a 16-byte header plus *n* eight-byte value words. That density is why it is the default.

## O(1) lookup by rank

A key carries no stored position; its slot is computed. The value for key *k* sits at index

```
popcount(bitmap & ((1 << k) - 1))
```

— the number of present keys *below* *k*. Mask the bitmap down to the bits under *k*, count them, and that rank is the index into the key-ordered value buffer. One AND, one `popcount`, one indexed load: about what reading a struct field at a fixed offset costs — except **which** fields exist is decided at runtime, per value.

`get(key)` returns a **null `WAny`** for an absent or out-of-range key (never a fault, never an `Option` — the [sparse-store default](/writ/reference/#absent-is-the-zero-value)). `set(key, val)` is a **thin `&mut`**: the capacity is fixed, so it never allocates, and it flips the presence bit and writes the slot in place. Two calls are deliberate no-ops: a `key ≥ 52`, or a `set` of a *new* key into an already-full map — the TOM does not grow.

`Wu6` in `WMap<Wu6, WAny>` is a pure **type-level label** for the 6-bit key; it carries no runtime representation of its own.

## Fixed capacity, by design

The TOM is intentionally *not* a growable hash map. Its fixed capacity is what buys the thin-`&mut` writes (no reallocation, no rehash, no self-relative re-anchoring) and the tiny header. When you need a growable, string-keyed object map, that is a different container — `WMap<WString, WAny>` (`W_MAP = 101`), which grows and rehashes like a `HashMap`. The TOM is for the common case: a small, known-bounded set of small integer keys — exactly what a schema's field set, or an AST node's child set, is.

## As the backing of a schema

A [schema](/writ/reference/#schemas) is a typed view whose backing store is, by default, a TOM. The view itself is a 16-byte fat pair `{ m, z }` — `m` a pointer to the backing TOM, `z` the arena allocator for boxing wide values on write. A schema field `p.f` desugars to a TOM `get(KEY)` / `set(KEY, …)` on `m`, with the field's stable key code chosen at declaration. Because fields are **presence-keyed**, the layout is forward- and backward-compatible: adding a field leaves an old reader valid, and an absent field reads back as the type's zero.

The schema's identity lives in the TOM header's `schema_code`, stamped at construction. A `schema enum` needs no stored discriminant at all — the active variant is read from the pointee's own `schema_type_code`. That is also the check `.view_checked::<S>()` performs at a trust boundary: resolve to the TOM pointer, compare its `schema_type_code()` against `S::CODE`, yield `Some` iff they match.

## Where the TOM earns its keep

The reason the TOM matters beyond "a nice small map" is that **`logosc`'s own IR is built from it.** Every AST node is a TinyObjectMap with a `CODE` discriminant and typed children; the LIR is the same. And crucially, the TOM's byte layout is **identical across the C++ and Logos implementations** — so both halves of the compiler read and write the *same* in-memory structure, with no marshalling boundary between them. (See the [introduction](/writ/introduction/#where-writ-sits-in-logos) for how this makes `logosc` a single heterogeneous C++/Logos pipeline over one data structure.)

Because the nodes are position-independent, a compiled library can embed its AST as zero-serialized Writ in `.rodata` and the compiler `mmap`s it straight back — no parse. A metaprogram written in Logos constructs IR that the C++ compiler consumes directly, because to both of them an AST node is just this map.

## Related

- [Writ: the data substrate](/writ/introduction/) — where the TOM sits in the larger Writ picture, and the heterogeneous-compiler story.
- [Writ Reference](/writ/reference/#the-tinyobjectmap-in-detail) — the TOM header bit-packing, container codes, and schema desugaring rules.
- [Zoned memory](/writ/zoned-memory/) — why the `data` buffer is self-relative and the whole node relocatable.
- [Writ Tutorial](/writ/tutorial/) — build maps and schemas hands-on from a first `@{…}` literal.
