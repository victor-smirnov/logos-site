---
title: "Zoned memory: Logos's region model"
description: "Zones are Logos's fundamental memory model — typed regions with their own placement and addressing rules. Writ is one application built on top of them. This page separates the two: the general zone model, its universal rules, the zone types Logos has today, and how zones integrate with the language."
---

**Zones are a fundamental property of Logos** — the base memory model the language is built on, not a Writ feature. **Writ** is an *applied* layer on top of zones: a generalized, referential object graph that happens to live in one particular kind of zone. This page is about the layer underneath — what a zone is, the rules every zone obeys, and the two zone types Logos has today (with room for more).

Keep the two ideas apart while reading:

- **Zone** — a language-level region of memory with its own placement and addressing discipline. A primitive, like the stack or the heap.
- **Writ** — a data substrate (object graph) that is *stored in* a zone. An application of the model. See [Writ: the data substrate](/writ/introduction/) for that layer.

## What a zone is

A **zone** is a region of memory made of one or more **segments**, governed by its own rules for how objects are *placed* in it and how they are *addressed* within it. Crucially, **different zone types carry different rule sets** — one zone type may address its contents by absolute pointer, another by a relative offset from the zone's base; one may allow objects to move, another may pin them. The zone type *is* the memory discipline.

This is what makes "zone" a more general concept than "arena" or "heap": those are two specific disciplines, whereas a zone is the extensible mechanism by which Logos defines a discipline at all.

## The universal rules

Whatever a zone type's local rules are, three rules hold across **all** zones.

<figure class="fig">
<svg id="zm-rules" viewBox="0 0 680 470" role="img" aria-label="The root zone, containing the heap and stack, holds direct pointers into other zones. Zones may be nested hierarchically and may be of different types. No zone holds a direct pointer into another zone or back into the root zone; cross-zone links use non-pointer mechanisms such as an offset resolved against a zone base." xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto">
  <style>
    #zm-rules .root { fill: var(--hl-2-bg, #eef6ff); stroke: var(--hl-2, #3b6fe0); stroke-width: 1.75; }
    #zm-rules .zone { fill: var(--hl-4-bg, #f0fdf4); stroke: var(--hl-4, #2f8f4e); stroke-width: 1.5; }
    #zm-rules .zone2 { fill: var(--bg-code, #f5f5f5); stroke: var(--hl-4, #2f8f4e); stroke-width: 1.5; stroke-dasharray: 5 3; }
    #zm-rules .ok   { stroke: var(--hl-2, #3b6fe0); stroke-width: 2; fill: none; marker-end: url(#zm-ok); }
    #zm-rules .no   { stroke: var(--hl-1, #b5259e); stroke-width: 2; fill: none; stroke-dasharray: 5 4; marker-end: url(#zm-no); }
    #zm-rules .t    { fill: var(--fg, #1e293b); font: 13px ui-monospace, monospace; }
    #zm-rules .l    { fill: var(--fg-muted, #64748b); font: 11.5px system-ui, sans-serif; }
    #zm-rules .no-x { fill: var(--hl-1, #b5259e); font: 700 15px system-ui, sans-serif; }
  </style>
  <defs>
    <marker id="zm-ok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--hl-2, #3b6fe0)"/></marker>
    <marker id="zm-no" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--hl-1, #b5259e)"/></marker>
  </defs>
  <rect class="root" x="20" y="30" width="220" height="180" rx="10"/>
  <text class="t" x="36" y="58">root zone</text>
  <text class="l" x="36" y="82">all address space</text>
  <text class="l" x="36" y="100">minus other zones</text>
  <text class="l" x="36" y="124">(heap + stack live here)</text>
  <text class="l" x="36" y="190">may point INTO zones</text>
  <rect class="zone" x="320" y="30" width="340" height="160" rx="10"/>
  <text class="t" x="336" y="56">zone A</text>
  <text class="l" x="336" y="76">(e.g. a relocatable zone)</text>
  <rect class="zone2" x="340" y="96" width="140" height="76" rx="7"/>
  <text class="t" x="354" y="124">zone B</text>
  <text class="l" x="354" y="146">nested, other type</text>
  <rect class="zone2" x="500" y="96" width="140" height="76" rx="7"/>
  <text class="t" x="514" y="124">zone C</text>
  <text class="l" x="514" y="146">nested</text>
  <rect class="zone" x="320" y="264" width="220" height="120" rx="10"/>
  <text class="t" x="336" y="292">zone D</text>
  <text class="l" x="336" y="312">sibling zone</text>
  <path class="ok" d="M240,96 C282,96 286,110 318,110"/>
  <path class="no" d="M480,134 L498,134"/>
  <text class="no-x" x="482" y="120">✕</text>
  <path class="no" d="M430,190 L430,262"/>
  <text class="no-x" x="438" y="232">✕</text>
  <path class="no" d="M320,320 C258,320 244,250 238,214"/>
  <text class="no-x" x="270" y="262">✕</text>
  <text class="l" x="20" y="416"><tspan class="t" style="fill:var(--hl-2,#3b6fe0)">→</tspan> direct pointer allowed (root → zone, and within one zone)</text>
  <text class="l" x="20" y="438"><tspan class="no-x" style="font-size:12px">✕</tspan> direct pointer forbidden (zone → zone, zone → root, nested → parent)</text>
  <text class="l" x="20" y="460">Cross-zone links instead use a non-pointer mechanism — e.g. an offset resolved as <tspan class="t" style="font-size:11.5px">zone_base + offset</tspan>.</text>
</svg>
<figcaption>The three universal zone rules. The root zone (all address space minus the other zones — where heap + stack live) may hold direct pointers into zones; no zone may hold a direct pointer into another zone or back into the root. Zones nest into a tree, freely mixing types, and the rules hold at every level.</figcaption>
</figure>

**Rule 1 — no direct references *between* zones.** No object in one zone may hold a direct (absolute-pointer) reference into a *different* zone, even one of the same type. Direct pointers *within* a single zone are fine — including between the segments of that one zone. When objects in different zones must refer to each other, they do so through a **non-pointer mechanism**: for example, an offset stored as data, resolved to an address at use time as `zone_base + offset`.

**Rule 2 — the root zone is special: it is the whole address space minus the other zones.** The **root zone** is, initially, the *entire* address space — everything except the segments carved out by other zones. It is where the heap and the stack live and it addresses absolutely. Objects there may hold direct references *into* zones — but never the reverse: by Rule 1, no zone points back into the root (nor into any other zone). References flow *inward*, from root toward zones, never back out by raw pointer.

**Rule 3 — zones nest into a tree.** Zones — including zones of *different types* — may be nested hierarchically. A relocatable zone may contain a zone of some other discipline, and so on. The no-direct-reference rules are preserved at every level of the tree.

Together these rules are what make a zone relocatable, serializable, and reclaimable as a unit: because nothing outside a zone points *into it by raw pointer* except the root zone's handles (which the compiler tracks), and nothing inside points *out*, a zone's bytes are self-contained.

## The zone types today

Logos has **two** zone types today, distinguished by their addressing discipline:

- **The root zone — the whole address space minus the other zones, with absolute addressing.** Initially the *entire* address space (everything not carved out into another zone's segments); it is where the heap and the stack live. The ordinary Rust-shaped world: objects addressed by absolute pointer, per-object ownership and `Drop`. It is the distinguished zone of Rule 2 (it may point into other zones; nothing points back into it by raw pointer).
- **Relocatable zones — with self-relative addressing.** The new type, described below: intra-zone references stored as 64-bit self-relative deltas, so a single-segment zone is movable as bytes.

**More zone types may appear in the future** — the model is deliberately extensible (see [Design note](#design-note-defining-a-zone-type)). Whatever the type, the language keeps working with it safe through **additional borrow-checker rules for zones** (see [Language integration](#language-integration)): the checker knows each type's addressing discipline and enforces the universal rules, so a reference can never dangle across a zone boundary or outlive a released zone.

## The relocatable zone type

The **relocatable zone** is addressed by a **64-bit self-relative pointer**. Its rule set:

- **Self-relative addressing.** An intra-zone reference is stored not as an absolute pointer but as a signed delta from the referring slot. A single-segment relocatable zone can therefore be **moved to a different address** wholesale — the relative offsets keep the data internally consistent with no pointer rewriting. (This is position-independence, for serialization / `mmap` / a container-level block move — not runtime relocation of individual objects; placed objects still never move *within* the zone.)
- **No destructors.** Objects in a relocatable zone have **no `Drop`** — they are `!Drop`. Nothing runs per-object cleanup.
- **Arena reclamation.** The whole zone, with all its data, is deleted **in one shot**, arena-style. There is no per-object free. (Within a live zone, reclamation is a copying/compacting collection: walk the reachable set from the root, copy it into a fresh zone, drop the old one — cheap precisely because the self-relative offsets survive the copy unchanged and no cross-zone pointers need fixing up.)

This is the zone type **Writ** is built in. A `Writ` container owns a relocatable zone: it holds an `Allocator` (a segment arena), places objects that never move within it, and appends a fresh segment on growth. `WAny` references stored inside are the self-relative deltas above; the same word held in a register is the absolute form. (The mechanics of that at-rest / value bridge are in the [Writ Reference](/writ/reference/#the-wany-value-model).)

**Sizing guidance.** Treat a relocatable-zone document as a *document*, not a *database*. The sweet spot is roughly 1–10 disk blocks of 4 KB; model larger data as many zones linked by application-level identifiers, not one unbounded region.

## Language integration

Zones are not a library bolted on — they are woven into the type system, the reference representation, and the borrow checker. The design goal is that **zone memory looks exactly like ordinary memory to the code using it.**

- **No wrappers at the use site.** An object living in a zone is read, called, and passed exactly like an object on the heap or stack. There is no `Zoned<T>` you unwrap; the zoned-ness is in the type and the reference, not in the surface syntax.
- **Fat references carry what the zone needs.** A reference to a zone object is, where required, a *fat* reference that carries the extra machinery for working with that zone and its data — for instance, the **allocator** for the object's own zone, so that a mutating operation can place new data into the same zone. The reference brings the zone's context with it.
- **The borrow checker understands zones — and this is what makes them safe.** The language guarantees safe work across the different memory zones through **additional borrow-checker rules for zones**. The checker knows each zone type's addressing discipline, distinguishes a root-zone reference from a zone reference, tracks a value that carries a borrow into a zone as if it were that borrow, and enforces the universal rules — so a reference can never dangle across a zone boundary or outlive a released zone. As new zone types are added, they plug into the same rule machinery. (In Writ terms this surfaces as `#[borrow_carrying]` values and residency-holding wrappers; those are the Writ-level spelling of a language-level guarantee.)
- **Zone-only types, with automatic reference conversion.** Some structures are declared **allocatable only in their own zone type** — they cannot be placed on the heap or stack at all. When a *reference* to such an object is moved out onto the stack, it undergoes the **necessary conversion** automatically — for example, from the zone's relative form to an absolute pointer — so the value on the stack is directly usable while the object stays put in its zone.

## Design note: defining a zone type

*This section describes design-stage work, not shipped surface. The relocatable zone above is real and shipping; the mechanism below — writing a **new** zone type in user code — is a design sketch (`sandbox/zoned-spike`), explored to validate the direction.*

If a zone type *is* a set of placement/addressing rules, then defining one should be writing those rules against a trait. The sketch models exactly that: a `Zone` selects its pointer form, its allocation context, and the bridge between an absolute pointer and its stored form.

```logos
trait Zone {
    type Ptr;   // stored pointer form (root/heap: *mut u8; relocatable: a self-relative offset)
    type Ctx;   // allocation context  (heap: HeapCtx;      relocatable: *mut Arena)
    unsafe fn z_alloc(ctx: Self::Ctx, bytes: i64) -> *mut u8;
    unsafe fn z_lower(abs: *mut u8, anchor: *const u8) -> Self::Ptr;      // absolute → stored
    unsafe fn z_materialize(p: Self::Ptr, anchor: *const u8) -> *mut u8;  // stored → absolute
}
```

The **heap** instance is the identity: `Ptr = *mut u8`, and lower/materialize return their argument unchanged (Rule 2 — the root zone addresses absolutely). The **relocatable** instance uses a self-relative offset: `z_lower` records `abs − anchor`, `z_materialize` computes `anchor + offset`. One generic container definition then compiles for *either* discipline from a single source — the same code, two zone types:

```logos
struct Array2<T, Z: Zone> {
    data: Z::Ptr,   // heap: absolute pointer   ·   relocatable: self-relative offset
    len:  i64,
}
```

Two observations from the sketch shape the direction:

- **Inline-tail data is zone-agnostic.** A self-describing value that stores its payload inline — `struct Str2 { len: i64, bytes: [u8] }` — has *no internal pointer*, so its layout does not depend on the zone at all. The zone appears only in the *pointer to* such an object. Inline blobs are the ideal zone citizens; the zone parameter is needed only for genuine inter-object references (Rule 1's cross-boundary case).
- **Position-independence, not relocation.** No zone moves live objects within itself. The self-relative pointer exists so a zone can be serialized, `mmap`ped, or survive a block move — position-independence, not runtime relocation.

The end state folds `z_lower` / `z_materialize` into the compiler, so assigning to or reading a zoned pointer field performs the conversion automatically — exactly the bridge the shipped relocatable zone already provides for `WAny`, generalized to any zone type.

## Related

- [Writ: the data substrate](/writ/introduction/) — the applied object graph built in the relocatable zone.
- [Writ Reference](/writ/reference/#the-wany-value-model) — the `WAny` value model and the at-rest self-relative form in detail.
- [Writ Tutorial](/writ/tutorial/) — build a document hands-on from a first `@{…}` literal.
