---
title: "A Model Is Not a Calculator"
description: Language models generalize; they do not execute. Where each regime applies is the single most useful fact for anyone building with agents.
date: 2026-07-08
---

*Part 2 of **Code in the AI-Primary Era**. Previous: [Your Language Has Two Users Now](/blog/your-language-has-two-users-now/).*

Every few months someone posts a frontier model fumbling the multiplication of two twelve-digit numbers, and the replies split into two camps: "embarrassing, these things are dumb" and "wait for the next release." Both readings are wrong, and the correct one is worth stating precisely, because a large part of platform design follows from it.

An LLM is a distribution $p(y \mid x)$ over token sequences, sampled one token at a time. Training optimizes expected loss on *unseen* inputs — the objective is generalization, not recall, and certainly not execution. What a model does well or badly is therefore governed by how a task sits relative to that objective. The clean way to see it is to sort tasks by **compressibility**.

## Two domains of tasks

Some input→output maps have no short description. Translation, summarization, style transfer, idiomatic code completion: the "algorithm" for these is, in effect, the training distribution itself — a dense manifold of examples with high conditional entropy. No compact procedure exists to write down. On these tasks, generalization is exactly the right tool, performance is dominated by interpolation over everything the model has seen, and **scale wins**: loss falls monotonically with parameters and data.

Other maps are the opposite: arithmetic, logic, constraint solving, query execution, type checking, game-tree search. Each has a *short deterministic generator* — a small program that produces exactly the right answer every time. The target function is low-complexity, but a neural network holds only a learned *approximation* of it, and the approximation's quality is set by training coverage, architecture, and optimizer — all fixed properties that **scale does not close**. As the [Memoria](https://memoria-framework.dev) design notes put it: no amount of scaling can make a database engine out of a neural network.

<figure class="fig">
<svg id="lg-compress" viewBox="0 0 860 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tasks arranged along a compressibility axis: model capability fades where short deterministic generators exist; symbolic algorithms cover exactly that region.">
  <style>
    #lg-compress text     { font-size: 12px; fill: var(--text, #1c2230); }
    #lg-compress .mono    { font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
    #lg-compress .hdr     { font-size: 10.5px; letter-spacing: 0.08em; fill: var(--text-muted, #5b6472); }
    #lg-compress .note    { font-size: 10.5px; fill: var(--text-muted, #5b6472); }
    #lg-compress .axis    { stroke: var(--text-muted, #5b6472); stroke-width: 1.3; fill: none; }
    #lg-compress .mkf-ax  { fill: var(--text-muted, #5b6472); }
    #lg-compress .cliff   { stroke: var(--border, #e6e8ee); stroke-width: 1.3; stroke-dasharray: 4 5; }
    #lg-compress .chip-m  { fill: var(--dg-model, #5b4be0); fill-opacity: 0.07; stroke: var(--dg-model, #5b4be0); stroke-opacity: 0.55; stroke-width: 1.2; }
    #lg-compress .chip-s  { fill: var(--dg-sym, #3b6fe0); fill-opacity: 0.07; stroke: var(--dg-sym, #3b6fe0); stroke-opacity: 0.55; stroke-width: 1.2; }
    #lg-compress .ct      { font-size: 11.5px; }
    #lg-compress .lab-m   { font-size: 12px; fill: var(--dg-model, #5b4be0); }
    #lg-compress .lab-s   { font-size: 12px; fill: var(--dg-sym, #3b6fe0); }
    #lg-compress .bar-m   { fill: var(--dg-model, #5b4be0); }
    #lg-compress .bar-s   { fill: var(--dg-sym, #3b6fe0); }
  </style>
  <defs>
    <marker id="mk-ax" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path class="mkf-ax" d="M0,0 L8,4 L0,8 Z"/>
    </marker>
  </defs>
  <line class="cliff" x1="470" y1="42" x2="470" y2="308"/>
  <!-- Interpolation domain -->
  <text class="mono hdr" x="230" y="46" text-anchor="middle">SCALE WINS</text>
  <g>
    <rect class="chip-m" x="100" y="60" width="96"  height="26" rx="13"/>
    <text class="mono ct" x="148" y="77" text-anchor="middle">translation</text>
    <rect class="chip-m" x="212" y="60" width="112" height="26" rx="13"/>
    <text class="mono ct" x="268" y="77" text-anchor="middle">summarization</text>
    <rect class="chip-m" x="100" y="96" width="112" height="26" rx="13"/>
    <text class="mono ct" x="156" y="113" text-anchor="middle">style transfer</text>
    <rect class="chip-m" x="228" y="96" width="158" height="26" rx="13"/>
    <text class="mono ct" x="307" y="113" text-anchor="middle">idiomatic completion</text>
  </g>
  <!-- Deterministic domain -->
  <text class="mono hdr" x="630" y="46" text-anchor="middle">SCALE DOESN'T CLOSE IT</text>
  <g>
    <rect class="chip-s" x="500" y="60" width="90"  height="26" rx="13"/>
    <text class="mono ct" x="545" y="77" text-anchor="middle">arithmetic</text>
    <rect class="chip-s" x="606" y="60" width="110" height="26" rx="13"/>
    <text class="mono ct" x="661" y="77" text-anchor="middle">type checking</text>
    <rect class="chip-s" x="500" y="96" width="140" height="26" rx="13"/>
    <text class="mono ct" x="570" y="113" text-anchor="middle">constraint solving</text>
    <rect class="chip-s" x="656" y="96" width="118" height="26" rx="13"/>
    <text class="mono ct" x="715" y="113" text-anchor="middle">query planning</text>
  </g>
  <!-- Axis -->
  <line class="axis" x1="70" y1="160" x2="784" y2="160" marker-end="url(#mk-ax)"/>
  <text class="mono note" x="70"  y="184" text-anchor="start">low compressibility — no short generator exists</text>
  <text class="mono note" x="790" y="184" text-anchor="end">high — a short deterministic generator exists</text>
  <!-- Model capability -->
  <text class="mono lab-m" x="70" y="239" text-anchor="start">model</text>
  <rect class="bar-m" x="170" y="228" width="300" height="10" rx="5" opacity="0.8"/>
  <rect class="bar-m" x="482" y="228" width="34" height="10" rx="5" opacity="0.55"/>
  <rect class="bar-m" x="528" y="228" width="22" height="10" rx="5" opacity="0.4"/>
  <rect class="bar-m" x="562" y="228" width="13" height="10" rx="5" opacity="0.3"/>
  <rect class="bar-m" x="587" y="228" width="8"  height="10" rx="4" opacity="0.22"/>
  <rect class="bar-m" x="607" y="228" width="5"  height="10" rx="2.5" opacity="0.15"/>
  <text class="mono note" x="482" y="260" text-anchor="start">approximation, not execution</text>
  <!-- Symbolic capability -->
  <text class="mono lab-s" x="70" y="294" text-anchor="start">symbolic</text>
  <rect class="bar-s" x="470" y="283" width="320" height="10" rx="5" opacity="0.8"/>
  <text class="mono note" x="170" y="292" text-anchor="start">no algorithm to write</text>
</svg>
<figcaption>The compressibility axis. Left of the boundary, no short algorithm exists and interpolation is the only tool — the model's home turf. Right of it, a short deterministic generator exists; the model can only approximate it, while a symbolic algorithm executes it exactly.</figcaption>
</figure>

A tempting misreading of this split: the model is reliable on the left of the axis and unreliable on the right. The raw error rates run closer to the opposite. A model deviates everywhere, and on the incompressible side it deviates *more*, not less — every translation is one sample from a cloud of defensible alternatives, every summary drops something a different run would have kept; score either against any single reference and the deviation rate is enormous. What actually separates the domains is not how often the model slips but what a slip *costs* — and the two cost regimes differ exponentially, because the **error physics** of the domains differ.

Left of the boundary, the domain damps errors. Exponentially many outputs are acceptable, so a near-miss lands on another acceptable point; and the processes that consume the output — a reader decoding prose, a listener reconstructing meaning — are themselves dissipative, absorbing deviation rather than amplifying it. Nature runs on the same physics, which is why it does not look buggy: physical and biological processes are saturated with noise — thermal jitter, copying errors, imprecise motor control — and the noise stays invisible because the dynamics contract perturbations faster than they accumulate. We do not see the model's left-side errors for the same reason we do not see nature's. The domain eats them.

Right of the boundary, the sign flips. A short deterministic generator defines exactly one correct output in an exponentially large space, so "near" does not exist — one bit off is not almost right, it is wrong, and wrong in a way that *propagates*, because downstream computation amplifies perturbations instead of contracting them. A flipped digit invalidates the whole balance sheet; one wrong token turns a compiling program into a non-compiling one, or worse, into a compiling wrong one; a slip at step 3 falsifies steps 4 through 40. The same per-token deviation that vanishes without trace on the left acquires exponential reach on the right. This, incidentally, is why the twelve-digit multiplication from the opening paragraph makes for such a good demo, while nobody films a model choosing a slightly flat adjective: not a difference in how often the model errs — a difference in which domain lets you see it.

Wirth's old decomposition — *programs = algorithms + data structures* — splits precisely along this axis. Data is the incompressible term: facts reducible by no procedure, recoverable only from storage. Algorithms are the compressible term: short generators whose entire value is that they are *not* lookup tables. A symbolic language keeps the two apart explicitly — code here, values there, a type system classifying each, which is what lets an O(1)-sized algorithm range over an O(n)-sized dataset. A neural network superposes both in one parameter tensor: algorithm-approximations and memorized facts share weights and a single gradient, with no tag saying which is which. That one architectural fact predicts both the model's strength (memorization capacity scales with parameters) and its unreliability at execution (a weight-shared approximation of an algorithm contends with everything else stored in the same weights).

## Approximate execution

So what happens when a model "does arithmetic," or walks through a borrow-check argument in chain-of-thought? Not execution. Each token is still sampled from $p(\cdot \mid \text{prefix})$, which carries no fidelity guarantee. The right mental model is **approximate execution**: the output approximates what the deterministic procedure would have produced, with error governed by how well that class of instance was covered in training.

The failure profile this produces is *bimodal*, and the bimodality is the dangerous part. In-distribution — small operands, common shapes, familiar phrasing — the approximation is observationally exact, and it is easy to conclude the model "can do it." Out-of-distribution — large operands, adversarial structure, novel framing, long dependency chains — accuracy collapses discontinuously. No graceful degradation, and no internal signal marking the regime change: a model that answered correctly on `n` similar prompts can be confidently wrong on prompt `n+1` if that prompt exits the generalization basin.

This holds for every correctness criterion of the form "a deterministic procedure yields X": type checking, borrow analysis, constraint solving, dependency resolution, parsing, query planning, ABI lowering. None of them is guaranteed by an LLM at any scale.

## The two offload rules

Two rules follow, and they are close to the whole doctrine.

> **Rule 1: work that *requires* deterministic execution must be offloaded to a symbolic algorithm.** If correctness means "the output of a fixed procedure," route the work to that procedure; do not have the model imitate it. Which formalism — SAT solver, term rewriting, a compiler pass, plain code — is immaterial. Only the locus matters: determinism must live outside the model.

"Determinism" here bundles two properties worth separating. *Reproducibility*: same input, identical output, run to run, year to year. *Verifiability*: the output can be independently checked against the procedure. Symbolic algorithms give you both; models give you neither — sampling is not bit-stable, and the only way to check a model's answer is to run the deterministic procedure that should have produced it in the first place. A model is a trusted black box; a symbolic algorithm is a verifiable glass box. Anything that must be auditable, reviewable, or reproducible has to originate in the glass box. The model's proper role shrinks to **recognition and dispatch**: parse the messy input, identify which formal problem it implies, invoke the solver, post-process the result.

> **Rule 2: any periodic work that *can* be offloaded *should* be, asymptotically.** We can _start_ form execution by an LLM, but as soon as offloading is done, we should switch to the more deterministic and cheap execution mode.

This one is economics rather than correctness. Inference costs O(parameters) per token; model weights are the most expensive memory substrate ever deployed, compared to an index, a hash table, or a compiled function. Store a result whenever storing and retrieving costs less than recomputing — which is almost always, when the recomputation runs through a hundred billion parameters. The rule is not "minimize model calls"; it is "never have the model do what an existing cheaper deterministic component can do." Note the direction this points: as a system matures, solvers, caches, and indexes accumulate, and the model's share of the work *falls*. That is not a failure of the AI strategy. That is the strategy.

## The third role: guardrails

The two rules cover deterministic components as *computers*. They have a second job that is just as load-bearing: **trajectory confinement**.

Run any agent long enough — enough tokens, enough turns, enough sessions — and the iteration drifts off-path through steps that are each locally plausible. The remedy in every production agent system is not a smarter model but a lattice of deterministic checkpoints the trajectory must pass: type checks, test runs, schema validation, lints, CI gates, typed tool interfaces, malformed-output rejection. Each checkpoint is a predicate; the trajectory either satisfies it or gets bounced back. The agent's objective quietly changes from "emit the right artifact" — unverifiable — to "emit an artifact that passes the next checkpoint," which is exactly the kind of local target models are good at hitting.

This is why the volume of classical code around models [*grows*](/blog/your-language-has-two-users-now/#more-capable-models-mean-more-classical-code) with model capability instead of shrinking. Better models buy longer distances between checkpoints; the checkpoints remain where reliability comes from. When frontier-lab agent orchestration has leaked, the notable thing was its ordinariness: predominantly `if`/`then` code — mode dispatch, tool gating, format checks, failure-triggered retries — confining one stochastic component. (Worth noticing in passing: much of that code encodes the *operator's* policy, not the user's.)

Put the three roles together and you get the complete job description for deterministic components in an agentic system: **compute** what the model cannot, **cache** what it can but should not recompute, **constrain** the trajectory through everything it does compute. An AI-first platform is one where adding a component in any of the three roles is cheap, composable, and auditable — which is why machine-readable diagnostics and low-friction solver integration stop being nice-to-haves and become the design center. Later parts return to this.

First, though, the second structural fact about models. The compressibility axis is static — it says what a single query can and cannot do. The stranger behavior lives in iteration: what happens when a model's output feeds back into its input, hundreds of times, inside an agent loop.

*Next: [Attraction Basins](/blog/attraction-basins/) — agentic coding as a fixed-point iteration, and why an agent's confidence tells you which basin it landed in, not whether the answer is right.*
