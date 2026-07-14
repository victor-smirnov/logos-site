---
title: "The Phase Transition"
description: Model capability on a codebase doesn't grow smoothly — it jumps when accumulated declarative structure crosses a threshold. An observation, a mechanism, and a falsifiable prediction.
date: 2026-07-14T11:00:00
---

*Part 10 of **Code in the AI-Primary Era**. Previous: [The Compiler Is a Sensor](/blog/the-compiler-is-a-sensor/). This is the empirical one.*

For the past four months I have been building, in a mode close to autonomous AI development, a systems programming language and the data platform beneath it — a compiler, a borrow checker, an incremental Datalog engine, persistent storage structures. One person directing model fleets. That setting turned out to be an accidental instrument: it let me watch, over months and at close range, how a model's effective capability responds to the state of the codebase itself.

Here is the observation the whole essay hangs on:

**Model capability on a project does not grow smoothly as the project matures. It suddenly jumps.** As the project accumulates a declarative-logical stratum — architecture decision records, invariant comments, contracts, checker-enforced rules, a persistent memory of past reasoning — the model's functions strengthen abruptly (I call these "runaway effects"). Below some threshold of accumulated structure, the model flails at a task class; above it, the same model on the same task class is suddenly *reliable*. Nothing changed on the model side. The substrate crossed a line. I have observed this behavior not only on this project, but on many other projects I worked on before, with a multitude of different models.

I've seen effects like this exactly never in three decades of watching how tools respond to codebases. Human productivity degrades gently as codebases worsen and recovers gently as they improve. This is different in kind: it behaves like a phase transition. This essay is my hypothesis for the mechanism, a formalization sharp enough to measure, and a falsifiable prediction.

## The mechanism, in three parts

**1. Models natively reason over declarative material — feed that channel and functions strengthen through it.**

Watch a model work at close range and you see it continuously maintaining a quasi-logical layer: invariants restated in comments, contracts paraphrased before edits, consequences derived from stated rules. Its reasoning over that layer is, in many cases, no worse than a human's. But in an ordinary codebase this layer is *informal and unanchored* — the model derives well from premises it has no way to trust or verify. Accumulating an explicit declarative stratum (ADRs, stated invariants, machine-checked contracts) does something specific: it gives the model's strongest native faculty a substrate with ground truth. The reasoning was always there; the project finally supplies premises worth reasoning from — and a checker that tells it when a derivation went wrong.

**2. Coherent systems compress — and a model holds the generator, not the artifacts.**

A codebase derived from a small set of explicit principles has a short description. A model working in it can carry the *generator* in context and infer the parts it hasn't read: prediction from principles, which is exactly what these systems are best at. An incoherent codebase is incompressible — every seam an exception, every exception a permanent occupant of scarce context, **nothing inferable, everything requiring lookup**.

And errors compound differently. Working across N incoherent seams, each requiring reconstruction of hidden convention with error rate $\varepsilon$, success scales like $(1-\varepsilon)^N$ — multiplicative decay. Working inside one coherent theory, there's a single set of premises and a checker validating each derivation step.

This is where the *sharpness* comes from. Below a coherence threshold, seam combinatorics wins and output quality collapses no matter how strong the model; above it, the model extrapolates correctly and each unit of added structure compounds. A threshold in the exponent is a phase transition in the observable.

**3. The formal frame: capability radius as conditional compression complexity.**

Define a model's *near-OOD* as the region outside its training distribution that it can reach by derivation — a chain of reasoning steps, each individually in-distribution. Not statistical distance: derivational reachability. The natural measure is **conditional compression complexity**: $C_M(\text{target} \mid \text{foundations} + \text{context})$ — how many tokens of verified reasoning trace *this* model needs to reach the target from what it has. (This is computable, unlike Kolmogorov's K: a language model is literally a compressor, and negative log-likelihood is code length.) "Near" means: short derivation from the loaded foundations, regardless of how novel the target is in absolute terms.

Now every design choice in the project becomes legible as an operation on this quantity. The declarative stratum lowers $C_M$ for everything derivable from it. And the development loop becomes a **ratchet**: the model reasons one step past the known; an external verifier — compiler, test oracle, differential check — validates the rung; the validated result is offloaded into durable memory (an ADR, a checked invariant, code); the next derivation starts *from there*, not from raw training distribution. Verified waypoints accumulate; the reachable set grows monotonically. Far-OOD territory is not stormed — it is annexed one verified rung at a time.

Note that the ratchet is not one technique among several — it is the answer to *both* limits an unassisted model has. Reasoning alone is confined topologically: it reaches only what is derivable by steps the model itself finds probable — an island, in the sense of [the previous part of this arc](/blog/worse-is-better-was-a-law-of-the-carrier/). And it is confined metrically: an unverified chain with per-step error rate $\varepsilon$ survives roughly $1/\varepsilon$ steps before noise swamps it, so even within the island, uncorrected reach is finite. The verifier fixes the metric limit (error resets to zero at every certified rung) and, jointly with durable memory, the topological one (a rare improbable step that happens to be right gets *caught and kept* — selection supplying the drift that sampling cannot). One external instance, two distinct mechanisms, and any working architecture for deep model work converges on some version of it.

The capability radius therefore scales like a **product**: (model strength) × (derivation-chain length through memory) × (verification density). Improving any factor moves the frontier nonlinearly — and territory beyond the old frontier flips from unreachable to reachable *in blocks*, which is exactly the jump I observe. "Suddenly the model can do X" means: X's conditional complexity just dropped below the reachable-chain length, along with everything else in X's neighborhood.

## The flywheel, and why the incumbent stack can't have one

Follow the loop around: a coherent ("right thing") substrate raises model productivity → the more productive models evolve the substrate faster and *keep it coherent* (the checker refuses incoherence — see [The Compiler Is a Sensor](/blog/the-compiler-is-a-sensor/)) → the project's artifacts, being coherent, compress well into the next training corpora → the next model generation carries this design regime more cheaply → which raises productivity again. Both factors move together: the carrier's bandwidth B(t) rises with each model release, and the substrate's effective complexity C falls with each verified consolidation.

Now try to run the same loop on a worse-is-better stack. AI applied to an incoherent system yields *painkiller productivity*: seams get patched faster, exceptions get handled faster, the incoherence itself persists — because nothing in the loop rejects it. There is no consolidation step, so there is no ratchet; there is no compression gain, so there is no flywheel. Sublinear versus superlinear. **The difference between AI-on-legacy and AI-on-coherent-substrate is not a coefficient. It's the exponent.**

This, I believe, is the correct explanation for a discrepancy many teams are quietly living: some report AI making them slightly faster, others report it transforming what they can attempt at all. The variable isn't the model and isn't the prompt discipline. It's which side of the coherence threshold the codebase sits on.

## Falsifiability

This is a hypothesis with a measurement protocol, not a manifesto.

**The metric:** verified outcome per token. Give autonomous agents the same task battery on two stacks — one coherent-and-strict, one conventional — and measure the rate of externally verified task completions per token spent. That ratio is, up to inversion, exactly the conditional compression complexity defined above: the theory's quantity, measured directly.

**The predictions:**

1. *Threshold:* on the conventional stack, success rate decays multiplicatively with task depth (number of seams crossed); on the coherent stack it stays flat far deeper. The curves are shaped differently, not just offset.
2. *Divergence across generations:* re-run the battery with each new model generation. The hypothesis predicts the gap between the stacks *widens* as models strengthen — because rising B(t) buys more on a substrate where derivation works. If the gap is constant or shrinking, the hypothesis is wrong.
3. *Waypoint value:* adding consolidated foundations (ADRs, checked invariants) to the coherent stack's context measurably shortens verified-success traces for targets derivable from them. Structure should be worth a quantifiable number of tokens.

A benchmark of this shape doesn't exist yet. It should — because if the effect is real, "on which substrate do your models perform better" is about to become the most commercially important question in software infrastructure, and right now everyone is answering it by anecdote.

## Coda

[Part 8](/blog/worse-is-better-was-a-law-of-the-carrier/) argued that worse-is-better was a law of the transmission carrier, and the carrier changed. [Part 9](/blog/the-compiler-is-a-sensor/) argued that the strictness ceiling was emotional, and the new author has no emotions to protect. This part closes the arc with the empirical claim: past a threshold, doing the right thing is not just newly *possible* — it is the configuration in which the new author is measurably, discontinuously stronger.

For fifty years, "the right thing" was a moral position in software. It is about to become an operating advantage with an exponent in it. I know because I watched the transition happen — one verified rung at a time, and then, one day, all at once.
