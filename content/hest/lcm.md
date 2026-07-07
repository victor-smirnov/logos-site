---
title: "LCM — the Logos Compute Model"
description: LCM is the compute model Logos targets — small cores (xPUs) exchanging messages over a hardware-accelerated transport (HRPC), placed as close to the data they touch as the platform allows. It is the physical substrate the dataflow aspect (Hest) concretizes.
---

> Data dominates. If you've chosen the right data structures and organized things well,
> the algorithms will almost always be self-evident. Data structures, not algorithms, are
> central to programming.
>
> — Rob Pike, [Notes on Programming in C](http://www.lysator.liu.se/c/pikestyle.html), 1989.

LCM is the compute model Logos targets. It is not a description of any one machine. It is the
abstract substrate the language is designed *for*: a set of small cores (**xPUs**) exchanging
messages over a hardware-accelerated transport (**HRPC**), placed as physically close to the data
they touch as the platform allows.

LCM is the **physical grounding** of the [Hest](/hest/introduction/) dataflow model — where Hest
asks "what is the unit of composition above `fn`?", LCM answers "a small core close to its data,
reachable only by message." This page describes LCM as a compute model and a target class for
Logos.

x86_64/Linux is, from this point of view, **just one of the targets** — a particularly large and
well-supported one, and currently the only target the toolchain produces native binaries for. It
is not the architectural centre. Logos does not yet have language-level features for declaring
which functionality is available on which target; that will come later, alongside richer
cross-target tooling.

LCM is the architectural inheritance from the
[Memoria Framework](https://github.com/victor-smirnov/memoria), reframed: the substrate moves into
Logos, while Memoria continues as a separate framework and becomes, over time, something like an
*operating system* for LCM — the data layer, processing layer, and structured-storage layer that
runs on top.

## Why LCM looks this way

Processing can be compute-intensive, IO-intensive, or hybrid. It is *compute-intensive* when each
element of data is processed many times (sorting, matrix multiplication); otherwise it is
*IO-intensive* (hash tables, random-access structured queries). Hybrid workloads contain both, but
in clearly separable stages — JOIN is IO-intensive, SORT is compute-intensive, and an SQL query may
go through both.

Compute/IO-intensity is not an intrinsic property of an algorithm; it is a property of an algorithm
against a *memory architecture*. By IO we mean off-die traffic, which is typically 100–1000× slower
than intra-die traffic. Each algorithm has an access pattern — predictable, random, or mixed — and
good performance comes from arranging data so most access stays intra-die.

Mainstream CPUs lean almost entirely on **caching and prefetching** to bridge this gap. It works
well in many cases, and it is not going away. But it has well-known costs:

- Caching is not free. A miss costs dozens of cycles; a hit still pays for tag lookup. Raw
  scratchpad SRAM can be much faster in the best case.
- Caching interacts badly with virtual memory: address translation, TLB misses, context-switch
  invalidation.
- Caching of *mutable* data does not scale well across cores — coherency traffic dominates.
- To extract performance under irregular memory latency, cores grow into large, hot, expensive
  out-of-order machines.

Raw DDR5 latency is around 25–40 ns; full system latency is roughly 75 ns; under TLB pressure,
several times that. Inter-core latency on modern multi-socket systems ranges from a few ns (SMT
siblings) to
[hundreds of ns](https://chipsandcheese.com/2023/11/07/core-to-core-latency-data-on-large-systems)
across sockets, with the average on the order of dozens of ns — and worse when many cores talk at
once. This makes general-purpose multicore CPUs poor at *fine-grained dynamic parallelism*, even
though they are still the best hosts for latency-sensitive workloads like databases, symbolic
reasoners, and constraint solvers.

LCM is a response to this. It assumes a different tradeoff: **lots of small cores close to the
memory, communicating by message rather than by coherent shared state.**

## Persistent data structures as the default

LCM expects [persistent data structures](https://en.wikipedia.org/wiki/Persistent_data_structure)
(PDS) — committed versions are immutable, and immutable data shares freely across parallel
processing units without coordination. PDS need garbage collection (atomic reference counting or
generational), which in turn needs strongly-ordered, exactly-once delivery — practical at rack and
(modest) DC scale.

PDS pay a cost on single-threaded sequential access — O(1) becomes O(log N). Functional languages
amortise some of this. The benefits start dominating around 10+ cores; below that, the overhead is
real. LCM is designed for the regime where that tradeoff pays.

Accelerating PDS asks the platform for hardware-assisted atomic counters, similar concurrency
primitives, and a fabric that supports robust exactly-once delivery (which reduces to
bounded-history idempotent counters). This is the same immutable-shared-memory substrate Hest's
operator state and [Writ](/writ/introduction/) stand on.

## High-level architecture

LCM is inherently heterogeneous and explicitly supports three computation domains — the same three
Logos itself plans as first-class language layers (see
[Introduction](/docs/introduction/)):

1. **Generic mixed dataflow and control flow.** Most practical compute- and IO-intensive code,
   runnable on CPUs or specialised hardware.
2. **Integrated circuits** — fixed (ASIC) and reconfigurable (FPGA, structured ASIC). High
   performance and low power for stream/mixed-signal stages, with nanosecond-scale event resolution.
3. **Rule- and search-based** — forward chaining (CEP, streaming) and backward chaining
   (SQL/Datalog).

<figure class="fig">
<svg viewBox="0 0 640 280" role="img" aria-label="Three computation domains — mixed control/dataflow, integrated circuits, and rule/search — arranged as a triangle, each pair connected by an HRPC link.">
<style>
#lcm-tri{--ink:#1c2230;--mut:#5b6472;--ln:#b0b4c0;--vi:#5b4be0;--bl:#3b6fe0;--gr:#2f8f4e;--vif:rgba(91,75,224,.09);--blf:rgba(59,111,224,.10);--grf:rgba(47,143,78,.12);}
@media (prefers-color-scheme:dark){#lcm-tri{--ink:#e7eaf1;--mut:#9aa4b4;--ln:#3f465a;--vi:#9d8cff;--bl:#7aa2ff;--gr:#7ee0a0;--vif:rgba(157,140,255,.14);--blf:rgba(122,162,255,.14);--grf:rgba(126,224,160,.15);}}
:root[data-theme="light"] #lcm-tri{--ink:#1c2230;--mut:#5b6472;--ln:#b0b4c0;--vi:#5b4be0;--bl:#3b6fe0;--gr:#2f8f4e;--vif:rgba(91,75,224,.09);--blf:rgba(59,111,224,.10);--grf:rgba(47,143,78,.12);}
:root[data-theme="dark"] #lcm-tri{--ink:#e7eaf1;--mut:#9aa4b4;--ln:#3f465a;--vi:#9d8cff;--bl:#7aa2ff;--gr:#7ee0a0;--vif:rgba(157,140,255,.14);--blf:rgba(122,162,255,.14);--grf:rgba(126,224,160,.15);}
#lcm-tri text{font:14px ui-sans-serif,system-ui,sans-serif;fill:var(--ink);}
#lcm-tri .s{font-size:11px;fill:var(--mut);}
#lcm-tri .h{font-size:11px;fill:var(--mut);letter-spacing:.04em;}
#lcm-tri .e{stroke:var(--ln);stroke-width:2;fill:none;}
</style>
<defs>
<marker id="tri-ah" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto-start-reverse"><path d="M0 0 L8 3 L0 6 Z" fill="var(--ln)"/></marker>
</defs>
<g id="lcm-tri">
<path class="e" d="M262 92 L172 186" marker-start="url(#tri-ah)" marker-end="url(#tri-ah)"/>
<path class="e" d="M378 92 L468 186" marker-start="url(#tri-ah)" marker-end="url(#tri-ah)"/>
<path class="e" d="M226 224 L414 224" marker-start="url(#tri-ah)" marker-end="url(#tri-ah)"/>
<text class="h" x="196" y="140" text-anchor="middle">HRPC</text>
<text class="h" x="444" y="140" text-anchor="middle">HRPC</text>
<text class="h" x="320" y="216" text-anchor="middle">HRPC</text>
<rect x="230" y="22" width="180" height="66" rx="12" fill="var(--vif)" stroke="var(--vi)" stroke-width="1.5"/>
<text x="320" y="49" text-anchor="middle">Control + dataflow</text>
<text class="s" x="320" y="68" text-anchor="middle">CPU or specialised HW</text>
<rect x="30" y="190" width="190" height="66" rx="12" fill="var(--blf)" stroke="var(--bl)" stroke-width="1.5"/>
<text x="125" y="217" text-anchor="middle">Integrated circuits</text>
<text class="s" x="125" y="236" text-anchor="middle">ASIC · FPGA · structured ASIC</text>
<rect x="420" y="190" width="190" height="66" rx="12" fill="var(--grf)" stroke="var(--gr)" stroke-width="1.5"/>
<text x="515" y="217" text-anchor="middle">Rule &amp; search</text>
<text class="s" x="515" y="236" text-anchor="middle">CEP · SQL / Datalog</text>
</g>
</svg>
<figcaption>The three computation domains LCM supports natively, connected through HRPC — the universal transport for intra- and cross-domain communication, kernel traffic included.</figcaption>
</figure>

Domains connect through **[HRPC](/hest/introduction/)** — Hest's first *wire member*, a unified
hardware-accelerated RPC + streaming protocol. HRPC is conceptually similar to gRPC, but designed
for direct hardware implementation, not for an HTTP/2 software stack. Within LCM, HRPC is the
universal transport: intra- and cross-domain communication, including kernel-level traffic, all
flow over it.

When HRPC is in hardware, the OS shrinks. There is no longer a single fully-featured kernel
mediating every operation; what remains is a **nano-kernel** — only the parts of HRPC that, on a
given target, must run as software. A Logos kernel running on a CPU core inside an accelerator can
listen to a stream produced by an FPGA, call into smart-storage, or invoke near-memory compute on a
CXL device — all through the same protocol.

<figure class="fig">
<svg viewBox="0 0 680 360" role="img" aria-label="A distributed system scaled down to one machine: two CPU nodes and five heterogeneous device nodes all attach to a single HRPC fabric; each node runs a Logos nano-kernel.">
<style>
#lcm-comp{--ink:#1c2230;--mut:#5b6472;--ln:#b0b4c0;--nd:#ffffff;--nb:#cfd3dc;--bl:#3b6fe0;--gr:#2f8f4e;--blf:rgba(59,111,224,.10);}
@media (prefers-color-scheme:dark){#lcm-comp{--ink:#e7eaf1;--mut:#9aa4b4;--ln:#3f465a;--nd:#1b2130;--nb:#2f374a;--bl:#7aa2ff;--gr:#7ee0a0;--blf:rgba(122,162,255,.14);}}
:root[data-theme="light"] #lcm-comp{--ink:#1c2230;--mut:#5b6472;--ln:#b0b4c0;--nd:#ffffff;--nb:#cfd3dc;--bl:#3b6fe0;--gr:#2f8f4e;--blf:rgba(59,111,224,.10);}
:root[data-theme="dark"] #lcm-comp{--ink:#e7eaf1;--mut:#9aa4b4;--ln:#3f465a;--nd:#1b2130;--nb:#2f374a;--bl:#7aa2ff;--gr:#7ee0a0;--blf:rgba(122,162,255,.14);}
#lcm-comp text{font:12px ui-sans-serif,system-ui,sans-serif;fill:var(--ink);}
#lcm-comp .s{font-size:10.5px;fill:var(--mut);}
#lcm-comp .e{stroke:var(--ln);stroke-width:1.5;fill:none;}
#lcm-comp .k{fill:var(--gr);}
</style>
<g id="lcm-comp">
<line class="e" x1="235" y1="112" x2="235" y2="158"/>
<line class="e" x1="445" y1="112" x2="445" y2="158"/>
<line class="e" x1="96" y1="250" x2="96" y2="194"/>
<line class="e" x1="218" y1="250" x2="218" y2="194"/>
<line class="e" x1="340" y1="250" x2="340" y2="194"/>
<line class="e" x1="462" y1="250" x2="462" y2="194"/>
<line class="e" x1="584" y1="250" x2="584" y2="194"/>
<rect x="40" y="158" width="600" height="36" rx="10" fill="var(--blf)" stroke="var(--bl)" stroke-width="1.5"/>
<text x="340" y="181" text-anchor="middle" fill="var(--bl)" font-weight="600">HRPC fabric — the universal transport (NoC · PCIe · Ethernet)</text>
<rect x="150" y="30" width="170" height="82" rx="10" fill="var(--nd)" stroke="var(--nb)"/>
<circle class="k" cx="166" cy="46" r="4.5"/><text x="235" y="66" text-anchor="middle" font-weight="600">CPU + MMU</text><text class="s" x="235" y="86" text-anchor="middle">+ DRAM · legacy code</text>
<rect x="360" y="30" width="170" height="82" rx="10" fill="var(--nd)" stroke="var(--nb)"/>
<circle class="k" cx="376" cy="46" r="4.5"/><text x="445" y="66" text-anchor="middle" font-weight="600">CPU + MMU</text><text class="s" x="445" y="86" text-anchor="middle">+ DRAM · legacy code</text>
<rect x="40" y="250" width="112" height="74" rx="10" fill="var(--nd)" stroke="var(--nb)"/>
<circle class="k" cx="55" cy="266" r="4.5"/><text x="96" y="284" text-anchor="middle">FPGA</text><text x="96" y="300" text-anchor="middle">smart NIC</text>
<rect x="162" y="250" width="112" height="74" rx="10" fill="var(--nd)" stroke="var(--nb)"/>
<circle class="k" cx="177" cy="266" r="4.5"/><text x="218" y="284" text-anchor="middle">Rule-engine</text><text x="218" y="300" text-anchor="middle">accelerator</text>
<rect x="284" y="250" width="112" height="74" rx="10" fill="var(--nd)" stroke="var(--nb)"/>
<circle class="k" cx="299" cy="266" r="4.5"/><text x="340" y="284" text-anchor="middle">Smart</text><text x="340" y="300" text-anchor="middle">storage</text>
<rect x="406" y="250" width="112" height="74" rx="10" fill="var(--nd)" stroke="var(--nb)"/>
<circle class="k" cx="421" cy="266" r="4.5"/><text x="462" y="284" text-anchor="middle">Compute</text><text x="462" y="300" text-anchor="middle">accelerator</text>
<rect x="528" y="250" width="112" height="74" rx="10" fill="var(--nd)" stroke="var(--nb)"/>
<circle class="k" cx="543" cy="266" r="4.5"/><text x="584" y="284" text-anchor="middle">CXL</text><text x="584" y="300" text-anchor="middle">memory</text>
<circle class="k" cx="300" cy="344" r="4.5"/><text class="s" x="312" y="348">Logos nano-kernel — every device runs one</text>
</g>
</svg>
<figcaption>Not a "hardware-assisted micro-kernel" but <strong>a distributed system scaled down to a single machine</strong>. The big MMU-enabled CPU is one PU among many — the one that runs legacy code and code that genuinely needs an MMU. Every device speaks HRPC.</figcaption>
</figure>

OS-kernel functionality decomposes into services running on whichever device is closest to the
data. Storage — historically the largest piece of OS surface — is owned by
['smart-storage' devices](https://github.com/victor-smirnov/memoria) able to evaluate complex
queries in streaming and batching modes.

Memory is no longer a single shared address space. It is a set of buffers with different *affinity*
to compute. Programming this directly is harder than programming a flat-memory CPU — but it is also
the same kind of work distributed-systems engineers already do at larger scales every day.

LCM does **not** guarantee cross-environment portability. Different accelerators provide different
default runtimes, memory hierarchies, and cluster topologies. Some Logos code will need substantive
rewrites to move between environments. Logos's job is to keep the unavoidable cost as low as
possible — through metaprogramming, metafunction-driven specialisation, and the build/type system
as a data platform — not to pretend the cost isn't there.

## xPU — the processing element

The reconfigurable extensible processing unit (xPU) is LCM's structural unit. The defining
property: **HRPC is the only way it talks to the outside world.** From outside, an xPU is a set of
HRPC endpoints described in the usual HRPC tooling (IDL, schema, codegen). That includes all
external memory traffic (cache transfers, DMA), debug and observability traffic, runtime exception
signalling, and application-level HRPC.

<figure class="fig">
<svg viewBox="0 0 680 380" role="img" aria-label="The xPU: a core whose only external interface is an HRPC block facing a NoC router. Inside it groups a memory column, a compute column, and the HRPC block; control flow runs internally.">
<style>
#lcm-xpu{--ink:#1c2230;--mut:#5b6472;--ln:#b0b4c0;--nd:#ffffff;--nb:#cfd3dc;--vi:#5b4be0;--am:#b26a00;--bl:#3b6fe0;--gr:#2f8f4e;--amf:rgba(178,106,0,.10);--blf:rgba(59,111,224,.10);--grf:rgba(47,143,78,.12);}
@media (prefers-color-scheme:dark){#lcm-xpu{--ink:#e7eaf1;--mut:#9aa4b4;--ln:#3f465a;--nd:#1b2130;--nb:#2f374a;--vi:#9d8cff;--am:#ffb454;--bl:#7aa2ff;--gr:#7ee0a0;--amf:rgba(255,180,84,.13);--blf:rgba(122,162,255,.14);--grf:rgba(126,224,160,.15);}}
:root[data-theme="light"] #lcm-xpu{--ink:#1c2230;--mut:#5b6472;--ln:#b0b4c0;--nd:#ffffff;--nb:#cfd3dc;--vi:#5b4be0;--am:#b26a00;--bl:#3b6fe0;--gr:#2f8f4e;--amf:rgba(178,106,0,.10);--blf:rgba(59,111,224,.10);--grf:rgba(47,143,78,.12);}
:root[data-theme="dark"] #lcm-xpu{--ink:#e7eaf1;--mut:#9aa4b4;--ln:#3f465a;--nd:#1b2130;--nb:#2f374a;--vi:#9d8cff;--am:#ffb454;--bl:#7aa2ff;--gr:#7ee0a0;--amf:rgba(255,180,84,.13);--blf:rgba(122,162,255,.14);--grf:rgba(126,224,160,.15);}
#lcm-xpu text{font:12px ui-sans-serif,system-ui,sans-serif;fill:var(--ink);}
#lcm-xpu .s{font-size:10.5px;fill:var(--mut);}
#lcm-xpu .e{stroke:var(--ln);stroke-width:1.5;fill:none;}
#lcm-xpu .d{stroke:var(--ln);stroke-width:1.5;fill:none;stroke-dasharray:3 4;}
</style>
<defs>
<marker id="xpu-ah" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto-start-reverse"><path d="M0 0 L8 3 L0 6 Z" fill="var(--ln)"/></marker>
</defs>
<g id="lcm-xpu">
<path class="d" d="M70 24 L70 356" marker-start="url(#xpu-ah)" marker-end="url(#xpu-ah)"/>
<rect x="26" y="160" width="88" height="60" rx="8" fill="var(--grf)" stroke="var(--gr)" stroke-width="1.5"/>
<text x="70" y="195" text-anchor="middle">NoC router</text>
<path class="e" d="M114 196 L150 291" marker-start="url(#xpu-ah)" marker-end="url(#xpu-ah)"/>
<rect x="150" y="30" width="500" height="320" rx="14" fill="none" stroke="var(--vi)" stroke-width="1.5"/>
<text x="170" y="52" fill="var(--vi)" font-weight="700">xPU</text>
<rect x="170" y="66" width="190" height="52" rx="8" fill="var(--amf)" stroke="var(--am)"/><text x="265" y="97" text-anchor="middle">Scratch / L1 D$</text>
<rect x="170" y="128" width="190" height="52" rx="8" fill="var(--amf)" stroke="var(--am)"/><text x="265" y="159" text-anchor="middle">L1 I$</text>
<rect x="170" y="190" width="190" height="52" rx="8" fill="var(--amf)" stroke="var(--am)"/><text x="265" y="221" text-anchor="middle">Stack cache</text>
<rect x="170" y="252" width="190" height="82" rx="8" fill="var(--blf)" stroke="var(--bl)" stroke-width="1.5"/><text x="265" y="286" text-anchor="middle" fill="var(--bl)" font-weight="600">HRPC block</text><text class="s" x="265" y="306" text-anchor="middle">Rx/Tx queues · HRPC logic</text><text class="s" x="265" y="322" text-anchor="middle">the only external interface</text>
<rect x="390" y="66" width="240" height="44" rx="8" fill="var(--nd)" stroke="var(--vi)"/><text x="510" y="93" text-anchor="middle">Execution unit + ALU</text>
<rect x="390" y="120" width="240" height="44" rx="8" fill="var(--nd)" stroke="var(--vi)"/><text x="510" y="147" text-anchor="middle">Per-thread register file</text>
<rect x="390" y="174" width="240" height="44" rx="8" fill="var(--nd)" stroke="var(--vi)"/><text x="510" y="201" text-anchor="middle">Thread scheduler</text>
<rect x="390" y="228" width="240" height="44" rx="8" fill="var(--nd)" stroke="var(--vi)"/><text x="510" y="255" text-anchor="middle">Memoria functions &amp; accel</text>
<rect x="390" y="282" width="240" height="44" rx="8" fill="var(--nd)" stroke="var(--vi)"/><text x="510" y="309" text-anchor="middle">M-mode &amp; debug</text>
</g>
</svg>
<figcaption>The xPU carries no cache coherency (except in narrow cases where it is genuinely needed). Control flow runs <em>inside</em>; everything that crosses the boundary — memory transfers, debug events, exceptions, application calls — is an HRPC message through the one port facing the NoC.</figcaption>
</figure>

HRPC and the system-level endpoint specs are open, so independent vendors can contribute
*specialised cores* and *middleware*. Logos code can have deep call chains and substantial code
size, so an instruction cache is essential; a "stack cache" — a dedicated data cache for thread
stacks — is also load-bearing when the internal data memory is used as a scratchpad rather than a
D$.

What an xPU does **not** carry is cache coherency. LCM relies on PDS: mutable data is private to a
writer; readers see only immutable data. Where shared structured mutable access is required (atomic
ref counting, etc.), it is done through explicit HRPC messages to hardware-accelerated services
rather than through coherent shared memory.

## Containers and memory parallelism

A *container* is the structured-data unit Memoria contributes to LCM. Containers are block-based and
represented as B+Trees, ephemeral or persistent (multi-version). Anything that can be efficiently
represented as an array can be efficiently represented as a container. There are five basic building
blocks, all supporting fixed- and variable-length elements: an unsorted array, a sorted array, an
array-packed prefix-sums tree, an array-packed searchable sequence, and an array-packed compressed
symbol sequence.

<figure class="fig">
<svg viewBox="0 0 660 340" role="img" aria-label="A search descending a multi-ary B+Tree: at each level a prefix-sum scan across an array node selects the next child; the leaf node is sized to a small multiple of a cache line.">
<style>
#lcm-tree{--ink:#1c2230;--mut:#5b6472;--ln:#9aa0ad;--nd:#ffffff;--nb:#c2c6d0;--hi:#b5259e;}
@media (prefers-color-scheme:dark){#lcm-tree{--ink:#e7eaf1;--mut:#9aa4b4;--ln:#5a6274;--nd:#1b2130;--nb:#3a4256;--hi:#ff7bd5;}}
:root[data-theme="light"] #lcm-tree{--ink:#1c2230;--mut:#5b6472;--ln:#9aa0ad;--nd:#ffffff;--nb:#c2c6d0;--hi:#b5259e;}
:root[data-theme="dark"] #lcm-tree{--ink:#e7eaf1;--mut:#9aa4b4;--ln:#5a6274;--nd:#1b2130;--nb:#3a4256;--hi:#ff7bd5;}
#lcm-tree text{font:12px ui-sans-serif,system-ui,sans-serif;fill:var(--ink);}
#lcm-tree .s{font-size:11px;fill:var(--mut);}
#lcm-tree .cell{fill:var(--nd);stroke:var(--nb);stroke-width:1.2;}
#lcm-tree .e{stroke:var(--ln);stroke-width:1.4;fill:none;}
#lcm-tree .hi{stroke:var(--hi);stroke-width:2;fill:none;stroke-dasharray:2 4;}
#lcm-tree .b{stroke:var(--ln);stroke-width:1.2;fill:none;}
</style>
<defs>
<marker id="tree-ah" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto-start-reverse"><path d="M0 0 L8 3 L0 6 Z" fill="var(--ln)"/></marker>
<marker id="tree-hah" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto-start-reverse"><path d="M0 0 L8 3 L0 6 Z" fill="var(--hi)"/></marker>
</defs>
<g id="lcm-tree">
<path class="e" d="M300 50 L100 116" marker-end="url(#tree-ah)"/>
<path class="e" d="M320 50 L330 116" marker-end="url(#tree-ah)"/>
<path class="e" d="M340 50 L560 116" marker-end="url(#tree-ah)"/>
<path class="e" d="M330 146 L360 210" marker-end="url(#tree-ah)"/>
<path class="e" d="M360 240 L430 276" marker-end="url(#tree-ah)"/>
<path class="e" d="M70 148 L60 190" marker-end="url(#tree-ah)"/><path class="e" d="M100 148 L100 190" marker-end="url(#tree-ah)"/><path class="e" d="M130 148 L140 190" marker-end="url(#tree-ah)"/>
<path class="e" d="M530 148 L520 190" marker-end="url(#tree-ah)"/><path class="e" d="M560 148 L560 190" marker-end="url(#tree-ah)"/><path class="e" d="M590 148 L600 190" marker-end="url(#tree-ah)"/>
<g><rect class="cell" x="258" y="24" width="120" height="26"/><line class="b" x1="282" y1="24" x2="282" y2="50"/><line class="b" x1="306" y1="24" x2="306" y2="50"/><line class="b" x1="330" y1="24" x2="330" y2="50"/><line class="b" x1="354" y1="24" x2="354" y2="50"/></g>
<g><rect class="cell" x="40" y="118" width="120" height="26"/><line class="b" x1="64" y1="118" x2="64" y2="144"/><line class="b" x1="88" y1="118" x2="88" y2="144"/><line class="b" x1="112" y1="118" x2="112" y2="144"/><line class="b" x1="136" y1="118" x2="136" y2="144"/></g>
<g><rect class="cell" x="270" y="118" width="120" height="26"/><line class="b" x1="294" y1="118" x2="294" y2="144"/><line class="b" x1="318" y1="118" x2="318" y2="144"/><line class="b" x1="342" y1="118" x2="342" y2="144"/><line class="b" x1="366" y1="118" x2="366" y2="144"/></g>
<g><rect class="cell" x="500" y="118" width="120" height="26"/><line class="b" x1="524" y1="118" x2="524" y2="144"/><line class="b" x1="548" y1="118" x2="548" y2="144"/><line class="b" x1="572" y1="118" x2="572" y2="144"/><line class="b" x1="596" y1="118" x2="596" y2="144"/></g>
<g><rect class="cell" x="300" y="212" width="120" height="26"/><line class="b" x1="324" y1="212" x2="324" y2="238"/><line class="b" x1="348" y1="212" x2="348" y2="238"/><line class="b" x1="372" y1="212" x2="372" y2="238"/><line class="b" x1="396" y1="212" x2="396" y2="238"/></g>
<g><rect class="cell" x="380" y="278" width="120" height="26"/><line class="b" x1="404" y1="278" x2="404" y2="304"/><line class="b" x1="428" y1="278" x2="428" y2="304"/><line class="b" x1="452" y1="278" x2="452" y2="304"/><line class="b" x1="476" y1="278" x2="476" y2="304"/></g>
<path class="hi" d="M342 37 L342 131 M330 131 L318 225 M348 225 L392 291 L488 291" marker-end="url(#tree-hah)"/>
<path class="b" d="M380 268 L500 268 M380 264 L380 272 M500 264 L500 272"/>
<text class="s" x="440" y="260" text-anchor="middle">32–128 B · a cache-line multiple</text>
</g>
</svg>
<figcaption>Best performance is at node sizes a low multiple of a cache line (32–128 B). A prefix-sum search accumulates and compares along a node to pick the child. Instead of running this in CPU cache — pulling the data up the hierarchy to do it — the work can be offloaded to the memory controller or to cores attached directly to the memory banks.</figcaption>
</figure>

Embedding logic into a DRAM die is hard but possible — *Processing-In-Memory* (PIM). The cheaper
alternative is to put logic on the memory module or in the CXL controller — *Processing-Near-Memory*
(PNM): lower throughput and parallelism, slightly higher latency, but built on existing process
nodes. Either way the point is the same: accelerating containers wants **as much memory parallelism
as possible, with xPUs placed as close to the physical memory as the platform allows.** Existing
accelerators — designed for matrix multiplication on neural networks — do not optimise for this,
because GEMM is *latency-insensitive*. LCM workloads need a different class of accelerator:
maximised effective *memory parallelism*.

## Accelerator module

The whole point of LCM is to maximise *memory parallelism* by bringing processing to the data —
primarily for *latency*, secondarily for *throughput*. Beyond PNM/PIM, HRPC, and PDS, LCM does not
pin a specific hardware architecture. The figure below is *one instance* of an accelerator the
toolchain will support.

<figure class="fig">
<svg viewBox="0 0 680 420" role="img" aria-label="One accelerator instance: a die with an on-die SRAM, an HRPC service gateway, eFPGA and service-endpoint blocks, a mesh of xPU cores joined by a NoC, and memory-attached PNM xPUs beside the DRAM.">
<style>
#lcm-acc{--ink:#1c2230;--mut:#5b6472;--ln:#aab0bd;--die:#c2c6d0;--nd:#ffffff;--vi:#5b4be0;--am:#b26a00;--bl:#3b6fe0;--gr:#2f8f4e;--vif:rgba(91,75,224,.10);--amf:rgba(178,106,0,.11);--blf:rgba(59,111,224,.11);--grf:rgba(47,143,78,.13);}
@media (prefers-color-scheme:dark){#lcm-acc{--ink:#e7eaf1;--mut:#9aa4b4;--ln:#4a5266;--die:#3a4256;--nd:#1b2130;--vi:#9d8cff;--am:#ffb454;--bl:#7aa2ff;--gr:#7ee0a0;--vif:rgba(157,140,255,.15);--amf:rgba(255,180,84,.14);--blf:rgba(122,162,255,.15);--grf:rgba(126,224,160,.16);}}
:root[data-theme="light"] #lcm-acc{--ink:#1c2230;--mut:#5b6472;--ln:#aab0bd;--die:#c2c6d0;--nd:#ffffff;--vi:#5b4be0;--am:#b26a00;--bl:#3b6fe0;--gr:#2f8f4e;--vif:rgba(91,75,224,.10);--amf:rgba(178,106,0,.11);--blf:rgba(59,111,224,.11);--grf:rgba(47,143,78,.13);}
:root[data-theme="dark"] #lcm-acc{--ink:#e7eaf1;--mut:#9aa4b4;--ln:#4a5266;--die:#3a4256;--nd:#1b2130;--vi:#9d8cff;--am:#ffb454;--bl:#7aa2ff;--gr:#7ee0a0;--vif:rgba(157,140,255,.15);--amf:rgba(255,180,84,.14);--blf:rgba(122,162,255,.15);--grf:rgba(126,224,160,.16);}
#lcm-acc text{font:11.5px ui-sans-serif,system-ui,sans-serif;fill:var(--ink);}
#lcm-acc .s{font-size:10px;fill:var(--mut);}
#lcm-acc .e{stroke:var(--ln);stroke-width:1.3;fill:none;}
#lcm-acc .r{fill:var(--gr);}
</style>
<g id="lcm-acc">
<rect x="20" y="20" width="640" height="380" rx="16" fill="none" stroke="var(--die)" stroke-width="1.5" stroke-dasharray="4 4"/>
<rect x="300" y="6" width="120" height="28" rx="8" fill="var(--nd)" stroke="var(--die)"/><text x="360" y="24" text-anchor="middle">PCIe / host link</text>
<line class="e" x1="360" y1="34" x2="360" y2="64"/>
<rect x="40" y="48" width="150" height="120" rx="10" fill="var(--amf)" stroke="var(--am)"/><text x="115" y="100" text-anchor="middle" font-weight="600">On-die SRAM</text><text class="s" x="115" y="120" text-anchor="middle">L2$ · stacks · scratch</text>
<rect x="40" y="180" width="150" height="96" rx="10" fill="var(--blf)" stroke="var(--bl)" stroke-width="1.5"/><text x="115" y="224" text-anchor="middle" fill="var(--bl)" font-weight="600">HRPC service</text><text x="115" y="240" text-anchor="middle" fill="var(--bl)" font-weight="600">gateway</text>
<rect x="40" y="288" width="150" height="96" rx="10" fill="var(--grf)" stroke="var(--gr)"/><text x="115" y="326" text-anchor="middle">eFPGA · struct. ASIC</text><text class="s" x="115" y="346" text-anchor="middle">+ service endpoints</text>
<line class="e" x1="190" y1="228" x2="240" y2="200"/>
<line class="e" x1="304" y1="96" x2="330" y2="96"/><line class="e" x1="304" y1="196" x2="330" y2="196"/><line class="e" x1="304" y1="296" x2="330" y2="296"/>
<line class="e" x1="256" y1="128" x2="256" y2="164"/><line class="e" x1="346" y1="128" x2="346" y2="164"/><line class="e" x1="436" y1="128" x2="436" y2="164"/>
<line class="e" x1="256" y1="228" x2="256" y2="264"/><line class="e" x1="346" y1="228" x2="346" y2="264"/><line class="e" x1="436" y1="228" x2="436" y2="264"/>
<rect class="r" x="251" y="123" width="10" height="10" rx="2"/><rect class="r" x="341" y="123" width="10" height="10" rx="2"/><rect class="r" x="431" y="123" width="10" height="10" rx="2"/>
<rect class="r" x="251" y="223" width="10" height="10" rx="2"/><rect class="r" x="341" y="223" width="10" height="10" rx="2"/><rect class="r" x="431" y="223" width="10" height="10" rx="2"/>
<rect class="r" x="299" y="91" width="10" height="10" rx="2"/><rect class="r" x="389" y="91" width="10" height="10" rx="2"/>
<rect class="r" x="299" y="191" width="10" height="10" rx="2"/><rect class="r" x="389" y="191" width="10" height="10" rx="2"/>
<rect class="r" x="299" y="291" width="10" height="10" rx="2"/><rect class="r" x="389" y="291" width="10" height="10" rx="2"/>
<rect x="224" y="64" width="64" height="64" rx="8" fill="var(--vif)" stroke="var(--vi)"/><text x="256" y="100" text-anchor="middle">xPU</text>
<rect x="314" y="64" width="64" height="64" rx="8" fill="var(--vif)" stroke="var(--vi)"/><text x="346" y="100" text-anchor="middle">xPU</text>
<rect x="404" y="64" width="64" height="64" rx="8" fill="var(--vif)" stroke="var(--vi)"/><text x="436" y="100" text-anchor="middle">xPU</text>
<rect x="224" y="164" width="64" height="64" rx="8" fill="var(--vif)" stroke="var(--vi)"/><text x="256" y="200" text-anchor="middle">xPU</text>
<rect x="314" y="164" width="64" height="64" rx="8" fill="var(--vif)" stroke="var(--vi)"/><text x="346" y="200" text-anchor="middle">xPU</text>
<rect x="404" y="164" width="64" height="64" rx="8" fill="var(--vif)" stroke="var(--vi)"/><text x="436" y="200" text-anchor="middle">xPU</text>
<rect x="224" y="264" width="64" height="64" rx="8" fill="var(--vif)" stroke="var(--vi)"/><text x="256" y="300" text-anchor="middle">xPU</text>
<rect x="314" y="264" width="64" height="64" rx="8" fill="var(--vif)" stroke="var(--vi)"/><text x="346" y="300" text-anchor="middle">xPU</text>
<rect x="404" y="264" width="64" height="64" rx="8" fill="var(--vif)" stroke="var(--vi)"/><text x="436" y="300" text-anchor="middle">xPU</text>
<line class="e" x1="468" y1="96" x2="506" y2="96"/><line class="e" x1="468" y1="196" x2="506" y2="196"/><line class="e" x1="468" y1="296" x2="506" y2="296"/>
<rect x="506" y="64" width="44" height="64" rx="8" fill="var(--grf)" stroke="var(--gr)"/><text class="s" x="528" y="100" text-anchor="middle">PNM</text>
<rect x="506" y="164" width="44" height="64" rx="8" fill="var(--grf)" stroke="var(--gr)"/><text class="s" x="528" y="200" text-anchor="middle">PNM</text>
<rect x="506" y="264" width="44" height="64" rx="8" fill="var(--grf)" stroke="var(--gr)"/><text class="s" x="528" y="300" text-anchor="middle">PNM</text>
<rect x="556" y="64" width="84" height="64" rx="8" fill="var(--amf)" stroke="var(--am)"/><text x="598" y="100" text-anchor="middle">DRAM</text>
<rect x="556" y="164" width="84" height="64" rx="8" fill="var(--amf)" stroke="var(--am)"/><text x="598" y="200" text-anchor="middle">DRAM</text>
<rect x="556" y="264" width="84" height="64" rx="8" fill="var(--amf)" stroke="var(--am)"/><text x="598" y="300" text-anchor="middle">DRAM</text>
</g>
</svg>
<figcaption>One instance of an LCM accelerator: a mesh of small xPU cores joined by a NoC, memory-attached PNM xPUs beside the DRAM, an on-die SRAM, an HRPC service gateway with local routers, and optional eFPGA / structured-ASIC blocks. No system-wide bottleneck like full-chip cache coherence — it scales down to MCU-class power budgets and up to an entire wafer.</figcaption>
</figure>

Essential components: **xPUs** (RISC-V cores with hardware support for HRPC and core LCM
data-structure operations); a **network-on-chip** (2D mesh, or an N-dimensional hypercube for better
latency in the general case); a main **HRPC service gateway** and many local routers; **service
endpoints** for hardware-implemented primitives (atomic ref counting and other shared concurrency
primitives); shared **on-die SRAM** used as scratchpad / cache / rings; a **smart DRAM controller**
with embedded PNM xPUs; and external connectivity. The result is **scalable** (no full-chip
coherence), **scales down and up** (MCU to wafer), **composable**, and **extensible** — the only
requirement is that everything talk HRPC over published interfaces.

## Matrices and tensors

Many data structures are arrays; dense graphs are square matrices, and many graph algorithms reduce
to matrix operations. LCM needs efficient matrix support, but the GEMM-for-NN space is being
explored aggressively elsewhere and is close to its local optimum. Logos's primary focus is **sparse
data structures via PIM/PNM** with low memory-access latency. GEMM can be fused in three reasonable
ways — systolic processors / CGRAs attached to xPUs as HRPC devices; a separate GEMM-optimised xPU
or accelerator module; or outsourcing to external projects — and in all three, hardware HRPC is
foundational. The whole HRPC story is to *generate* IP from semantically-rich IDL, the way SOA
codegen does in distributed software today.

## CPU mode

Multicore MMU-enabled CPUs are not the best LCM substrate — MMU overhead, the memory hierarchy, and
OS scheduling all work against the model. They are also, by an enormous margin, the largest
deployment base, and the only target Logos compiles to today. So Logos treats CPU mode as a
first-class member of the target family. As specialised hardware becomes available, it joins the
family incrementally — without dethroning CPU support.

## Where Logos fits

LCM is the architectural target; Logos is the language and toolchain aimed at it.

- **[Writ](/writ/introduction/)** — the relocatable tagged data substrate — is the on-disk,
  in-memory, and on-the-wire shape of structured data across LCM. There is no FFI between values and
  data; a document is just a value.
- **[HRPC](/hest/introduction/)** is the transport for everything that crosses an xPU boundary, from
  an `await` in user code to a debug event — Hest's first wire member.
- **[Metafunctions](/metacall/introduction/)** — ordinary Logos code that runs at compile time — are
  how LCM-specific specialisations (containers, layouts, scheduling, codegen variants per xPU class)
  are expressed, instead of through C++-style templates.
- **The build system** is itself a data platform (Datalog query engine, layered abstractions,
  large-data support), not a `cc` driver — because per-target specialisation, design-space
  exploration, and cross-domain codegen are first-class operations in LCM.
- **Convergent computation models.** Control flow is one model; production systems and
  [dataflow (Hest)](/hest/introduction/) are slated for first-class language integration, mirroring
  the three compute domains LCM supports natively.

## Memoria's role

Memoria and Logos are co-developed. Some of Memoria moves into Logos and stays there — **Writ**
(already done, as the data substrate), **LCM** (this document), **metafunctions and the frameworks
built on them**, and **build / type-checking infrastructure** as Logos's own build system grows up.
The rest stays as an external framework. On top of LCM, Memoria becomes **the data-platform layer** —
containers, persistent storage, query engines, structured runtime services — closest to what an OS
would be: the layer between LCM-as-substrate and the application. Splitting it this way decouples
Logos's release cycle from Memoria's, while keeping the architectural pieces that *must* be in the
language inside the language.

## Implementation strategy and status

LCM is a substantial technical and organisational undertaking. The early roadmap, in stages: a
**configurable RISC-V emulator** with LCM-specific ISA extensions and HRPC machinery, so core data
structures and algorithms can be ported and benchmarked before any hardware exists; **reference HDL
IP** — Writ operations as RV ISA extensions, HRPC core protocol/transport/routing, a configurable
RISC-V xPU — enough for hardware developers to experiment with (early experiments target an
open-toolchain FPGA board such as a Xilinx Alveo U50); and **integration into the Logos build system
/ data platform**, so design-space exploration, codegen variants, and per-target specialisation
become ordinary toolchain operations.

LCM is a target description, not a delivered product. Today, Logos compiles to x86_64/Linux. The
xPU emulator, the HDL reference IP, and the build-system integration are roadmap items, not current
capabilities. What is in place today is the part of LCM that lives inside Logos itself: Writ as the
data substrate, metafunctions as the specialisation mechanism, HRPC as the planned transport, and a
language design that does not bake assumptions about coherent flat memory or a single fully-featured
OS kernel into the surface.

## Related

- [Hest: dataflow as a language feature](/hest/introduction/) — the dataflow aspect LCM physically grounds; HRPC is Hest's first wire member.
- [Writ: the data substrate](/writ/introduction/) — the relocatable immutable structures that are LCM's shared-memory model.
- [Introduction](/docs/introduction/) — where Logos's data platform sits among its design axes.
