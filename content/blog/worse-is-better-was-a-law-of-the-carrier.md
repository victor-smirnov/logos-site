---
title: "Worse Is Better Was a Law of the Carrier"
description: Gabriel's law held for thirty years because designs spread through human heads — a fixed-bandwidth carrier. The carrier changed, and the selection regime of software design flips sign.
date: 2026-07-20
---

*Part 8 of **Code in the AI-Primary Era**. Previous: [Attention Is the Budget](/blog/attention-is-the-budget/). This part opens a closing arc: what the new authorship regime does to software design itself.*

In 1991 Richard Gabriel explained why the worse thing keeps winning. Unix and C beat the Lisp machines; simple-and-leaky beat correct-and-coherent; the "New Jersey style" — implementation simplicity above all, even above interface correctness — colonized the industry while "the right thing" accumulated admirers and lost markets. Gabriel's essay is one of the few pieces of software writing that earned the status of a law. It has held for over thirty years.

I want to argue that the law is real but was always about something other than software. It is a law of the *carrier* — of the medium through which designs propagate. And the carrier just changed.

## The hidden constant in Gabriel's argument

Strip the essay to its mechanism and it says: designs spread like viruses, through human implementers. A design's infectiousness is set by how cheaply a busy, distractible, moderately-skilled human can pick it up, reimplement it, port it, and teach it. Implementation simplicity *is* infectiousness. Correctness, completeness, conceptual coherence — these add fitness only after adoption, and adoption is decided earlier, at the moment of transmission.

Put it more formally. Every design has a *coherence complexity* C — how much interlocking structure you must hold in your head before the design makes sense and your changes stop breaking it. Every carrier has a bandwidth B. A design propagates when C < B. That's the whole law.

Now notice the constant everyone treated as part of nature: **B — the bandwidth of the human implementer — did not move for fifty years.** Brains in 1975 and brains in 2020 hold the same seven-plus-or-minus-two things. So for fifty years, selection pressed in exactly one direction: minimize C. Quality was selected only within the C-budget, and the budget was tiny. Worse-is-better is what evolution looks like under a fixed, low transmission bandwidth. The Lisp machine didn't lose to Unix on merit; it lost on infectiousness at fixed human B.

The reason this matters now is obvious once said aloud: the carrier is no longer only human — [a growing share of real code is written by models](/blog/your-language-has-two-users-now/), and designs increasingly propagate through them: models port the code, write the bindings, absorb the documentation, and reproduce the concepts in the next system. And a model's B is orders of magnitude above a human's, *and rises with every release*. The condition C < B(t) is still the law. But B(t) is now a rising curve, and every increment unlocks a band of designs that spent decades stranded above the human bar — in order of their coherence.

The selection regime flips sign: from *minimize C, quality incidental* to *maximize quality, subject to C < B(t)* — with the constraint receding every year.

## The two strata of the corpus

There is an immediate objection: models are trained on the artifacts of the worse-is-better era. Ask a model to "design me a backend" with an empty context and you get Kafka + Postgres + S3. Doesn't the corpus just launder the old regime into the new carrier?

That's not choice — that's gravity. And the interesting fact is what happens when gravity is removed.

The corpus contains two different strata. The *descriptive* stratum is what people built: there, worse-is-better won, and the mode of the distribution is the standard stack. But there is a second, *normative* stratum: fifty years of the industry's recorded self-criticism. Every post-mortem that says "we should have had transactional semantics." Every CVE retrospective that says "we should have had memory safety." Textbooks, papers, design critiques, the entire literature of regret. The industry built worse-is-better artifacts while continuously writing down what the right thing would have been.

These strata behave differently under compression — and training is compression. Principles compress; they *are* compression. Hacks and special cases don't compress; they can only be memorized. So a model's generalizing core is built out of the coherent stratum, because that is the stratum that generalizes, while the incoherent stratum sits in the weights as dead memorized mass.

An empty-context query hits the memorized mass: "what do people usually do?" — Kafka + Postgres. But push the model somewhere with *no cached answer* — a genuinely new design problem, stated with its real constraints — and retrieval has nothing to return. The model must derive. And derivation runs through the principled core, because that is the only part of the corpus that supports derivation at all.

> "Push" here is nothing exotic — it is ordinary conditioning. A prompt reweights the distribution: the mode of $p(y \mid \text{context})$ can sit where the unconditioned $p(y)$ had only body or tail mass. The gravity described above is a statement about the *unconditioned* distribution, and conditioning is the lever that moves the mode off it. The catch is that the lever needs coordinates: you have to know what to condition on. Which is why the foundations loaded into context are not background material — they are the steering mechanism itself.

And one subtlety makes the lever special: **a model cannot operate it on itself.** Self-generated context is, by construction, sampled from the model's own high-probability region — a model cannot systematically emit what it itself finds improbable, and "pushing into the tail" is precisely controlled self-surprise. The formal version is the martingale property of Bayesian updating (conservation of expected evidence): conditioning on your own predicted output yields, in expectation, zero movement — $\mathbb{E}\big[p(\cdot \mid \text{own sample})\big] = p(\cdot)$. Self-conditioning is a random walk with no drift, and mode-seeking decoding suppresses even the walk, contracting free-running generation toward its [attraction basins](/blog/attraction-basins/). Drift requires an information source *outside* the distribution being steered: a human's constraints, a verifier's rejection, reality's answer.

Doesn't chain-of-thought escape this? No — and the way it fails is instructive. The rules of inference live in the weights; they are learned, in-distribution content. What the reasoning loop adds is externalized *iteration*: the decode loop as controller, the context as memory. Reasoning therefore extends reach dramatically — a chain of steps, each individually in-distribution, can compose to a conclusion arbitrarily far from anything in the corpus. But it extends reach only across the *connected component* of that step relation. The reachable region is an island. If every path from here to the target passes through at least one step the model itself finds improbable, more reasoning does not help: additional compute explores the island more thoroughly; it does not cross water. Crossing takes exactly one of three things — new information in the context (conditioning), new edges in the weights (training), or a rare improbable step that survives only because an external verifier caught it and kept it. That last one is selection, not sampling: mutation plus external selection is how a zero-drift walk acquires drift, and it is available to the *system* of model-plus-verifier, never to the model alone. An unanchored model orbits its island; it does not explore.

And even within the island there is a second, humbler bound. Each unverified reasoning step carries some error rate $\varepsilon$, so an uncorrected chain survives roughly $1/\varepsilon$ steps before noise swamps it — reach is limited by decay before it is limited by knowledge. The two bounds are different in kind: the island is *topological* (where no in-distribution step exists, no amount of compute passes), the decay is *metric* (even where steps exist, unverified distance is finite). External verification answers both — resetting the error at every step, and catching-and-keeping the rare improbable step that crosses water. [The Phase Transition](/blog/the-phase-transition/) takes up that mechanism in full.

This is why "let the model reason" and "let the model free-run" are opposite regimes, and why the external verifier is not a safety net but the engine: each rejection is a bit of drift the model cannot manufacture for itself.

This is why, in practice, a model allowed to reason and invent goes right-thing rather than worse-is-better. It is not virtue. It is the topology of its memory. Worse-is-better was never what the industry *believed* — it was what the industry's economics *selected*. The corpus recorded both the selection and the regret, and a model inherits the regret as its norm. Freed from the human economics of implementation — the very economics that forced the worse choice — it executes the norm.

**AI is the corpus's conscience, put into execution.**

## Where the outcome is decided: greenfield

A change in the selection regime does not mean existing stacks get rewritten. They never do. Mature stacks enter maintenance mode and stay there indefinitely — COBOL is still in production, still staffed, and has had no influence on the design of new systems for forty years. Historically, competition between stacks is decided somewhere else entirely: at the moments when a *new class* of systems is built for the first time. Unix did not displace mainframe software; it was chosen for workstations and minicomputers, which did not exist before. Linux was chosen for internet servers, ARM for phones. The winner of each era is whatever the builders of the era's new system class pick — and the losers keep running unchanged, in shrinking relevance, for decades.

So the question is what gets picked for the system classes being born right now — agent infrastructure, post-CPU hardware stacks, the state and memory layers of AI-era computing. And here the argument of the previous section applies directly. A new system class means new constraints and no established reference architecture — which is precisely the situation where a model has no cached answer to retrieve. Design for a new class happens by derivation or not at all. **Greenfield is OOD.** The venue where the next stack is decided is exactly the regime where corpus statistics matter least and the principled core matters most.

> That is the alignment that has never existed before: the transmission medium now favors coherent designs (rising B), and the venue of competition now favors derived designs (no precedent to retrieve). Both factors used to point the other way.

One real risk remains, and it is not legacy maintenance. It is the default path: new systems specified by shallow, empty-context queries will reproduce the incumbent stack, because the incumbent stack is the mode of the prior. The countermeasure follows from the conditioning argument above: state the real constraints, load the real foundations, and force a derivation. The prior's mode decides the design only when nothing else has been specified.

## What follows

Three predictions, each checkable:

1. **The unlock proceeds in coherence order.** As B(t) rises, watch decades-old "right thing" designs — capability systems, persistent data structures, declarative-first architectures — stop being research curiosities and start being defaults, roughly in order of how coherent (hence compressible, hence transmissible) they are.

2. **Design quality decouples from team size.** If transmission through human organizations is no longer the bottleneck, small groups holding a coherent design plus a model fleet outbuild large organizations holding an incoherent one. The overhead of shipping a design through many human heads was a worse-is-better tax; it is being repealed.

3. **Coherent systems become *more* productive to work on than incoherent ones — for models.** This one deserves its own argument, because the effect is not gradual, and I've watched it happen. That's [The Phase Transition](/blog/the-phase-transition/).

Gabriel ended his essay ambivalently — he argued both sides for decades afterward, because the law was true and he hated it. The resolution turns out to be neither side winning the argument. The argument assumed a constant, and the constant moved.

The right thing didn't get better. The carrier did.
