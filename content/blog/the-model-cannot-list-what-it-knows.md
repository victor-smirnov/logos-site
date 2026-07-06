---
title: "The Model Cannot List What It Knows"
description: A trained model is a compressed forward-only program — cheap to query at a point, impossible to enumerate or invert. Most of what goes wrong in AI-written code follows from that.
date: 2026-07-12
---

*Part 4 of **Code in the AI-Primary Era**. Previous: [Attraction Basins](/blog/attraction-basins/).*

Try a small experiment with any frontier model. Pick a language feature it knows well and ask about one specific edge case — it answers correctly, immediately, in detail. Now ask it to *list all* the edge cases of that feature. You get a list: fluent, plausible, incomplete — and incomplete in a way the model cannot detect, because the items it omitted are omitted from its self-report too.

The difference between those two queries — evaluating at a point versus enumerating a domain — is, I think, the most underrated fact about language models in engineering practice. The [previous part](/blog/attraction-basins/) treated the model as a dynamical system and asked *which basin a trajectory lands in*. This part asks the static question: what is stored in the weights, and which operations does that store actually support?

## A compressed, forward-only program

Generalization is compression. Training does not build a table of the corpus; it distills the corpus's regularities into a short program — that is why a model generalizes at all, and it is the memory-side view of the [compressibility axis](/blog/a-model-is-not-a-calculator/). But the compression is *implicit*. Nowhere in the weights is there a materialized inventory of what was learned. There is only a function: give it an input, it evaluates a learned map at that point.

This makes the model a **point-query engine**. It computes $f$ at a point, cheaply, in one forward pass. Two operations are architecturally absent:

- **Inversion** — "which inputs produce this output?" There is no preimage operator.
- **Enumeration** — "list everything you know of kind X." There is no domain scan.

Both would require a materialized, navigable extent — the induced partition of input space written down somewhere walkable. It never is. It is evaluated, point by point, on demand, and discarded. A database exposes a walkable index; a model exposes a callable function. This is not a capability gap that the next scale-up closes; it is what "storing knowledge as a compressed forward function" means.

## Two kinds of gap

Now look at what this does to generated artifacts. When a model emits an incomplete implementation — common cases handled, remainder silently absent — the omissions come in two structurally different kinds:

**The OoD gap.** The case was never learned. No mass in the training distribution, no bridge from generalization; the learned function simply has nothing there. Closing it requires acquiring the knowledge from outside — documentation, a reference implementation, a failing test with the answer in it.

**The InD gap.** The knowledge is *present*. Present the case explicitly and the model handles it immediately and correctly. It was omitted from the artifact because emitting it would have required *enumerating* the feature's sub-behaviors — the exact operation the architecture does not have. The model knows it, and cannot list it.

The InD gap is the expensive one, and the strange one — a deficit of *access*, not of knowledge. And before you probe, the two kinds are **externally indistinguishable**: both just read as "X is silently absent from the output." Which kind you are looking at is determined only by experiment: show the model the case and see whether competence appears.

This is the same fact as the [archipelago](/blog/attraction-basins/), stated statically. "Basins nucleate on InD islands, and ordinary prompts contract to the modal basin" is the dynamical sentence; "mass exists in the tail, but forward generation never visits it" is the static one. *Models must be led through the basin landscape* and *the list must come from outside* are one proposition in two vocabularies.

## Generation is not verification

Why does generation skip things the model knows? Because producing a complete artifact and checking a flagged case are different information problems.

Generation means selecting one trajectory out of an exponentially branching space while allocating effort across thousands of sub-behaviors — with no internal salience signal saying which corner cases exist and matter. Under that pressure, coverage comes out uniformly shallow. Verification of a *specific* case is the opposite: the failing example pins the behavior, the surrounding code pins the structure, and the conditional entropy of the answer given all that is small. The model is fluent exactly there. Recognizing is cheap; finding is expensive — for models more than for anyone, because a model cannot even enumerate the space it is supposed to be searching.

Two corollaries follow that sound paradoxical until you have this asymmetry, and then become obvious:

**Self-written tests inherit the artifact's blind spots.** A model-authored test suite is drawn from the same compressed feature-model that produced the implementation. It exercises the implemented subset — thoroughly, even — and the gaps sit in that model's complement, which the suite cannot reach from inside. The suite passes. The pass means: the code agrees with itself.

**Self-checking does not surface InD gaps.** "Review your code and check it is complete" samples a completeness assessment from the same distribution, with the same coverage bias, as the code. "Looks done" is one more plausible completion. The model's confidence indexes basin membership — not correctness, and not coverage.

## No way out from inside

It is tempting to think clever sampling escapes this. Ask the model a thousand times, at high temperature, from many angles — eventually everything it knows falls out, doesn't it?

In the limit, yes; in practice, no. InD gaps live in the low-probability tail — that is *why* they went unemitted. Surfacing an item of emission probability ε costs on the order of 1/ε samples, and the gaps span exponentially many tail regions. Sampling-to-enumerate is brute-force inversion — re-paying, at generation prices, the exponential cost that the missing inverse operator was hiding. It is cheap exactly where it is useless (the modal behaviors you already have) and astronomical where you need it (the tail), with no stopping rule and no completeness certificate at any point.

<figure class="fig">
<svg id="lg-dist" viewBox="0 0 900 470" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A decaying distribution over topics ranked by training coverage, split into head, body, and tail. The head has dense sampling mass and low novelty; the tail has thin statistics where hallucination dominates and samples detach from support; the valuable body in between is reachable only with many samples, a harness, and human re-conditioning. A dashed green curve of information value rises in the opposite direction to the mass.">
  <style>
    #lg-dist .note   { font-size: 10.5px; fill: var(--text-muted, #5b6472); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
    #lg-dist .zcap   { font-size: 10.5px; letter-spacing: 0.08em; font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
    #lg-dist .lbl    { font-size: 11px; font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
    #lg-dist .ax     { stroke: var(--text-muted, #5b6472); stroke-width: 1.3; fill: none; }
    #lg-dist .mkf-ax { fill: var(--text-muted, #5b6472); }
    #lg-dist .mkf-h  { fill: var(--dg-human, #b26a00); }
    #lg-dist .cut    { stroke: var(--border, #e6e8ee); stroke-width: 1.3; stroke-dasharray: 4 5; }
    #lg-dist .curve  { fill: none; stroke: var(--dg-model, #5b4be0); stroke-width: 2; }
    #lg-dist .tcurve { fill: none; stroke: var(--dg-err, #b5259e); stroke-width: 2; stroke-dasharray: 4 4; stroke-opacity: 0.8; }
    #lg-dist .fill-h { fill: var(--dg-model, #5b4be0); fill-opacity: 0.13; }
    #lg-dist .fill-b { fill: var(--dg-model, #5b4be0); fill-opacity: 0.06; }
    #lg-dist .fill-t { fill: var(--dg-err, #b5259e); fill-opacity: 0.05; }
    #lg-dist .val    { fill: none; stroke: var(--dg-ok, #2f8f4e); stroke-width: 1.75; stroke-dasharray: 7 5; stroke-opacity: 0.85; }
    #lg-dist .steer  { fill: none; stroke: var(--dg-human, #b26a00); stroke-width: 1.75; }
    #lg-dist .dotm   { fill: var(--dg-model, #5b4be0); }
    #lg-dist .dote   { fill: var(--dg-err, #b5259e); }
    #lg-dist .t-model { fill: var(--dg-model, #5b4be0); }
    #lg-dist .t-human { fill: var(--dg-human, #b26a00); }
    #lg-dist .t-ok    { fill: var(--dg-ok, #2f8f4e); }
    #lg-dist .t-err   { fill: var(--dg-err, #b5259e); }
  </style>
  <defs>
    <marker id="mk-dist-ax" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path class="mkf-ax" d="M0,0 L8,4 L0,8 Z"/>
    </marker>
    <marker id="mk-dist-h" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path class="mkf-h" d="M0,0 L7,3.5 L0,7 Z"/>
    </marker>
  </defs>
  <!-- zone cuts and captions -->
  <line class="cut" x1="270" y1="56" x2="270" y2="380"/>
  <line class="cut" x1="560" y1="56" x2="560" y2="380"/>
  <text class="zcap t-model" x="180" y="76" text-anchor="middle">HEAD</text>
  <text class="note" x="180" y="94"  text-anchor="middle">the textbook zone</text>
  <text class="note" x="180" y="110" text-anchor="middle">high mass, low novelty</text>
  <text class="zcap t-ok" x="415" y="76" text-anchor="middle">BODY</text>
  <text class="note" x="415" y="94"  text-anchor="middle">the rarely-said</text>
  <text class="note" x="415" y="110" text-anchor="middle">high value — ~1/ε samples + harness</text>
  <text class="zcap t-err" x="703" y="76" text-anchor="middle">TAIL</text>
  <text class="note" x="703" y="94"  text-anchor="middle">thin statistics</text>
  <text class="note" x="703" y="110" text-anchor="middle">hallucination dominates</text>
  <!-- mass under the curve -->
  <path class="fill-h" d="M90,115 C140,190 200,232 270,255 L270,380 L90,380 Z"/>
  <path class="fill-b" d="M270,255 C345,285 460,308 560,318 L560,380 L270,380 Z"/>
  <path class="fill-t" d="M560,318 C585,320 605,328 630,326 C660,323 680,334 710,332 C740,329 765,340 795,338 C815,336 833,344 845,343 L845,380 L560,380 Z"/>
  <path class="curve" d="M90,115 C140,190 200,232 270,255 C345,285 460,308 560,318"/>
  <path class="tcurve" d="M560,318 C585,320 605,328 630,326 C660,323 680,334 710,332 C740,329 765,340 795,338 C815,336 833,344 845,343"/>
  <!-- samples: dense in the head, sparse in the body, detached in the tail -->
  <g>
    <circle class="dotm" cx="115" cy="330" r="3.5" opacity="0.7"/>
    <circle class="dotm" cx="135" cy="300" r="3"   opacity="0.65"/>
    <circle class="dotm" cx="160" cy="340" r="3"   opacity="0.6"/>
    <circle class="dotm" cx="185" cy="310" r="2.5" opacity="0.6"/>
    <circle class="dotm" cx="210" cy="345" r="3"   opacity="0.55"/>
    <circle class="dotm" cx="235" cy="320" r="2.5" opacity="0.5"/>
    <circle class="dotm" cx="150" cy="270" r="2.5" opacity="0.5"/>
    <circle class="dotm" cx="120" cy="285" r="2"   opacity="0.45"/>
    <circle class="dotm" cx="250" cy="350" r="2"   opacity="0.45"/>
    <circle class="dotm" cx="200" cy="282" r="2"   opacity="0.4"/>
    <circle class="dotm" cx="170" cy="300" r="2.2" opacity="0.5"/>
    <circle class="dotm" cx="230" cy="290" r="1.8" opacity="0.4"/>
    <circle class="dotm" cx="320" cy="345" r="2.5" opacity="0.5"/>
    <circle class="dotm" cx="380" cy="355" r="2"   opacity="0.45"/>
    <circle class="dotm" cx="450" cy="350" r="2"   opacity="0.4"/>
    <circle class="dotm" cx="505" cy="360" r="1.8" opacity="0.35"/>
    <circle class="dotm" cx="350" cy="332" r="1.8" opacity="0.35"/>
    <circle class="dote" cx="620" cy="355" r="1.8" opacity="0.3"/>
    <circle class="dote" cx="760" cy="362" r="1.6" opacity="0.25"/>
    <circle class="dote" cx="650" cy="300" r="2"   opacity="0.35"/>
    <circle class="dote" cx="720" cy="288" r="1.8" opacity="0.3"/>
    <circle class="dote" cx="800" cy="308" r="1.8" opacity="0.3"/>
  </g>
  <!-- the value of information runs against the mass -->
  <path class="val" d="M140,364 C360,352 600,290 832,152"/>
  <text class="lbl t-ok" x="842" y="138" text-anchor="end">value of new information</text>
  <!-- steering: the human distribution re-conditions sampling -->
  <path class="steer" d="M245,158 Q330,180 408,204" marker-end="url(#mk-dist-h)"/>
  <text class="lbl t-human" x="430" y="228" text-anchor="middle">human + harness re-condition sampling</text>
  <text class="lbl t-human" x="430" y="244" text-anchor="middle">and hold it out here</text>
  <!-- axes -->
  <line class="ax" x1="80" y1="380" x2="856" y2="380" marker-end="url(#mk-dist-ax)"/>
  <line class="ax" x1="80" y1="380" x2="80" y2="58"  marker-end="url(#mk-dist-ax)"/>
  <text class="note" x="92" y="66" text-anchor="start">sampling mass</text>
  <text class="note" x="85" y="404" text-anchor="start">said constantly in the corpus</text>
  <text class="note" x="850" y="404" text-anchor="end">barely said at all</text>
</svg>
<figcaption>The training-mass spectrum. Topics ranked by how much the corpus says about them; the violet curve is the sampling mass a statistical model assigns, the dots are where generation actually lands. The head is the textbook zone — dense statistics, reliable generation, low added value, because it is what everyone already knows. The tail is where statistics were thin, so the learned approximation is noisiest: the hallucination zone, weak for mathematical reasons, with samples detaching from support. The valuable region is the body — things rarely said. Reaching an item of emission probability ε costs ~1/ε samples, and holding the iteration out there takes a harness and a human: a second distribution whose samples re-condition the model against the head's pull.</figcaption>
</figure>

Nor is this deficit offloadable in the way arithmetic is. Offloading works when the function's domain is external: numbers can be handed to a calculator, a query to a database. "Enumerate what this model knows" has the model itself as its domain. A function over X cannot be delegated to a party without access to X — and the only party with access to the learned extent is the model, which is precisely the architecture that cannot scan it. Deficit and data are locked in the same place. Arithmetic is a missing *capability*, and capabilities can be outsourced; enumeration of self is a missing *reflexive operation*, and it cannot be.

So the conclusion stands on architecture, not on pessimism about any particular model:

> The model cannot enumerate its own knowledge, and no amount of self-querying induces it. If it cannot list what it lacks, the list must come from outside.

What that external list looks like for real codebases — reference corpora, gap ledgers, differential oracles, and the characteristic rhythm of discovering thousands of silent omissions in an AI-built artifact — is the next part, and it is where this series stops being theory and starts being methodology.

*Next: [The Failure Mode Humans Don't Have](/blog/the-failure-mode-humans-dont-have/) — uniform shallow gaps, the mandatory external corpus, and the false summit.*
