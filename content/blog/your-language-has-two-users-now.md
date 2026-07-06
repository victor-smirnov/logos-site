---
title: "Your Language Has Two Users Now"
description: A growing share of real code is written by models. That splits a language's audience in two — and most language-design defaults were calibrated for only one of them.
date: 2026-07-06
---

*Part 1 of **Code in the AI-Primary Era** — a series on what agentic coding actually is: how models behave on code, what that does to the people responsible for it, and what it demands from a language platform.*

<figure class="fig">
<svg id="lg-hero" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A stochastic field of dots flows through deterministic gates into a code artifact, which a human lens reviews and signs off.">
  <style>
    #lg-hero .dot    { fill: var(--dg-model, #5b4be0); }
    #lg-hero .flow   { stroke: var(--dg-model, #5b4be0); fill: none; stroke-width: 1.5; }
    #lg-hero .gate   { stroke: var(--dg-sym, #3b6fe0); fill: var(--surface, #ffffff); stroke-width: 2; }
    #lg-hero .pass   { stroke: var(--dg-ok, #2f8f4e); fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    #lg-hero .post   { stroke: var(--dg-sym, #3b6fe0); fill: none; stroke-width: 1.5; }
    #lg-hero .card   { fill: var(--surface, #ffffff); stroke: var(--border, #e6e8ee); stroke-width: 1.5; }
    #lg-hero .bar-m  { fill: var(--dg-model, #5b4be0); }
    #lg-hero .bar-s  { fill: var(--border, #e6e8ee); }
    #lg-hero .scan   { stroke: var(--dg-human, #b26a00); fill: none; stroke-width: 1.3; }
    #lg-hero .lens   { stroke: var(--dg-human, #b26a00); fill: none; }
    #lg-hero .pupil  { fill: var(--dg-human, #b26a00); opacity: 0.85; }
    #lg-hero .iris   { fill: var(--dg-human, #b26a00); opacity: 0.12; }
    #lg-hero .sig    { stroke: var(--dg-human, #b26a00); fill: none; stroke-width: 2; stroke-linecap: round; }
    #lg-hero .base   { stroke: var(--border, #e6e8ee); stroke-width: 1.5; }
  </style>
  <!-- Stochastic field: the model -->
  <g>
    <circle class="dot" cx="150" cy="300" r="4"   opacity="0.75"/>
    <circle class="dot" cx="170" cy="270" r="3"   opacity="0.7"/>
    <circle class="dot" cx="185" cy="320" r="5"   opacity="0.8"/>
    <circle class="dot" cx="200" cy="290" r="4"   opacity="0.75"/>
    <circle class="dot" cx="215" cy="340" r="3"   opacity="0.65"/>
    <circle class="dot" cx="230" cy="300" r="5"   opacity="0.8"/>
    <circle class="dot" cx="160" cy="350" r="2.5" opacity="0.55"/>
    <circle class="dot" cx="140" cy="260" r="2.5" opacity="0.5"/>
    <circle class="dot" cx="250" cy="270" r="4"   opacity="0.7"/>
    <circle class="dot" cx="245" cy="330" r="3.5" opacity="0.65"/>
    <circle class="dot" cx="265" cy="310" r="2.5" opacity="0.6"/>
    <circle class="dot" cx="190" cy="240" r="3"   opacity="0.55"/>
    <circle class="dot" cx="220" cy="255" r="2.5" opacity="0.55"/>
    <circle class="dot" cx="175" cy="380" r="2.5" opacity="0.5"/>
    <circle class="dot" cx="205" cy="395" r="2"   opacity="0.45"/>
    <circle class="dot" cx="240" cy="375" r="3"   opacity="0.5"/>
    <circle class="dot" cx="270" cy="355" r="2"   opacity="0.45"/>
    <circle class="dot" cx="130" cy="320" r="3"   opacity="0.5"/>
    <circle class="dot" cx="120" cy="290" r="2"   opacity="0.4"/>
    <circle class="dot" cx="110" cy="340" r="2"   opacity="0.35"/>
    <circle class="dot" cx="285" cy="290" r="3"   opacity="0.55"/>
    <circle class="dot" cx="300" cy="320" r="2.5" opacity="0.5"/>
    <circle class="dot" cx="160" cy="225" r="2"   opacity="0.35"/>
    <circle class="dot" cx="135" cy="235" r="2"   opacity="0.3"/>
    <circle class="dot" cx="255" cy="235" r="2.5" opacity="0.4"/>
    <circle class="dot" cx="280" cy="250" r="2"   opacity="0.4"/>
    <circle class="dot" cx="300" cy="270" r="2"   opacity="0.4"/>
    <circle class="dot" cx="105" cy="270" r="2"   opacity="0.3"/>
    <circle class="dot" cx="95"  cy="310" r="1.8" opacity="0.25"/>
    <circle class="dot" cx="315" cy="300" r="2"   opacity="0.4"/>
    <circle class="dot" cx="330" cy="330" r="1.8" opacity="0.3"/>
    <circle class="dot" cx="185" cy="415" r="1.8" opacity="0.3"/>
    <circle class="dot" cx="150" cy="395" r="2"   opacity="0.3"/>
    <circle class="dot" cx="225" cy="420" r="1.6" opacity="0.25"/>
    <circle class="dot" cx="320" cy="255" r="1.6" opacity="0.3"/>
    <circle class="dot" cx="345" cy="295" r="1.6" opacity="0.25"/>
    <circle class="dot" cx="120" cy="375" r="1.6" opacity="0.22"/>
    <circle class="dot" cx="260" cy="400" r="1.8" opacity="0.28"/>
    <circle class="dot" cx="90"  cy="255" r="1.5" opacity="0.2"/>
    <circle class="dot" cx="350" cy="340" r="1.5" opacity="0.2"/>
    <circle class="dot" cx="365" cy="310" r="1.4" opacity="0.18"/>
    <circle class="dot" cx="200" cy="205" r="1.6" opacity="0.25"/>
    <circle class="dot" cx="240" cy="200" r="1.4" opacity="0.2"/>
    <circle class="dot" cx="165" cy="195" r="1.5" opacity="0.2"/>
    <circle class="dot" cx="290" cy="225" r="1.6" opacity="0.28"/>
    <circle class="dot" cx="310" cy="375" r="1.5" opacity="0.22"/>
    <circle class="dot" cx="75"  cy="290" r="1.3" opacity="0.15"/>
    <circle class="dot" cx="82"  cy="330" r="1.3" opacity="0.14"/>
  </g>
  <!-- Flow: proposals leave the field -->
  <path class="flow" d="M305,272 C 355,255 395,248 429,252" opacity="0.55"/>
  <path class="flow" d="M312,315 C 355,313 395,314 429,315" opacity="0.6"/>
  <path class="flow" d="M305,358 C 355,375 395,382 429,378" opacity="0.55"/>
  <!-- Deterministic gates: checkpoints -->
  <g>
    <path class="gate" d="M450,235 L467,252 L450,269 L433,252 Z"/>
    <path class="pass" d="M443,253 l4.5,5 9,-10"/>
    <path class="gate" d="M450,298 L467,315 L450,332 L433,315 Z"/>
    <path class="pass" d="M443,316 l4.5,5 9,-10"/>
    <path class="gate" d="M450,361 L467,378 L450,395 L433,378 Z"/>
    <path class="pass" d="M443,379 l4.5,5 9,-10"/>
  </g>
  <!-- Verified flow into the artifact -->
  <path class="post" d="M467,252 C 500,252 522,236 558,228" opacity="0.6"/>
  <path class="post" d="M467,315 C 500,315 522,315 558,315" opacity="0.6"/>
  <path class="post" d="M467,378 C 500,378 522,394 558,402" opacity="0.6"/>
  <!-- The artifact -->
  <rect class="card" x="560" y="165" width="240" height="300" rx="18"/>
  <g>
    <rect class="bar-m" x="585" y="196" width="120" height="10" rx="5" opacity="0.9"/>
    <rect class="bar-s" x="585" y="222" width="170" height="10" rx="5"/>
    <rect class="bar-s" x="601" y="248" width="140" height="10" rx="5"/>
    <rect class="bar-m" x="601" y="274" width="95"  height="10" rx="5" opacity="0.75"/>
    <rect class="bar-s" x="617" y="300" width="120" height="10" rx="5"/>
    <rect class="bar-m" x="601" y="326" width="150" height="10" rx="5" opacity="0.9"/>
    <rect class="bar-s" x="585" y="352" width="80"  height="10" rx="5"/>
    <rect class="bar-m" x="585" y="378" width="140" height="10" rx="5" opacity="0.75"/>
    <rect class="bar-s" x="601" y="404" width="110" height="10" rx="5"/>
    <rect class="bar-s" x="585" y="430" width="60"  height="10" rx="5"/>
  </g>
  <!-- Human review -->
  <path class="scan" d="M802,240 C 838,244 866,258 897,272" opacity="0.5"/>
  <path class="scan" d="M802,315 C 838,312 866,300 896,290" opacity="0.5"/>
  <path class="scan" d="M802,382 C 840,378 868,330 899,306" opacity="0.5"/>
  <circle class="lens" cx="968" cy="288" r="70" stroke-width="2.5"/>
  <circle class="iris" cx="968" cy="288" r="30"/>
  <circle class="lens" cx="968" cy="288" r="30" stroke-width="1.5"/>
  <circle class="pupil" cx="968" cy="288" r="12"/>
  <!-- Sign-off -->
  <path class="sig" d="M886,470 C 900,442 916,486 934,462 C 946,446 958,470 976,460 C 992,451 1006,468 1022,458 C 1032,452 1042,450 1052,452" opacity="0.9"/>
  <line class="base" x1="880" y1="492" x2="1060" y2="492"/>
  <path class="pass" d="M1072,484 l5,6 10,-12"/>
</svg>
</figure>

For half a century, every layer of the programming stack has been built on one assumption: a human is at the keyboard. Error messages are prose, because humans read prose. Logs are colored, because human eyes scan color. Language features are rationed by committees asking whether an average engineer will misuse them. "Developer experience" means the experience of a person — their fingers, their working memory, their patience. The assumption was so universal that nobody thought of it as a design decision.

It has quietly stopped being true. Commit volumes are growing in ways that headcount does not explain; a rising share of shipped code was never typed by the person who owns it; whole categories of work — scaffolding, migrations, test suites, first drafts of subsystems — now default to generation. The exact percentage is debatable and changes monthly. The direction does not.

Once the primary author of code is a model, a long list of sensible-sounding defaults become miscalibrated. They optimize the comfort of the agent who is no longer doing most of the typing — while the agent who *is* gets feedback formatted as prose, features rationed like sharp knives, and a toolchain that reports its state through a terminal scrollback.

[Logos](/docs/language-overview/) is a systems language built from the opposite starting point, and this series is the reasoning behind it. "AI-first" has become a sticker that means anything from "we have a copilot plugin" to nothing at all. The honest version requires answering a prior question: what do models actually need? Not folklore about prompts — the structural facts: what models can and cannot do, which of their failure modes are permanent architecture and which are this year's weather. That is what this series tries to lay out.

## Two users, asymmetric strengths

The lazy reading of "AI writes the code now" is that the human exits. The accurate reading is that a language now has **two primary users**, and they are strong in opposite places.

**The model is the author.** Its strength is generation over everything it has densely seen: idiomatic code, translation between representations, elaboration of patterns, API plumbing, the entire texture of ordinary programming. Its structural weakness — we will spend [part 2](/blog/a-model-is-not-a-calculator/) on why it is structural — is *executing deterministic procedures*. A model does not compute; it approximates the output of computation. So the language should hand its model-author two things: maximal expressivity, and rich targets to offload deterministic work onto, so that work moves out of the weights and into a substrate that executes exactly.

This is why Logos is, paradigmatically, a C++-level language: arbitrary structured const-generic values, first-class type packs, type-level computation written as ordinary metafunctions, registry-driven dispatch. The classic argument against such features — *junior engineers find them confusing* — evaporates when the author is a model. Filing expressive power behind years of committee process to protect a user who is no longer the author has a name in the Logos design notes: **premature passivisation**. It taxes the model for the benefit of no one.

**The human is the owner.** What humans supply is the part with no training-data leverage: judgment about which invariants matter, what failure means in the world, whether shipping is right given context the repository does not contain — plus the accountability that makes any of it matter. To exercise that ownership over model-scale output, humans need *operational closeness* to the code: the ability to read it, review it, intervene anywhere, at a glance.

This is why Logos wears a Rust-like skin: `let mut`, `&mut self`, `match`, traits, ownership, no exceptions. Familiar, low-entropy, modern-systems-flavoured — a surface the supervising human parses at speed, and, not incidentally, the surface today's models generate more reliably than most alternatives.

Strip either half and the design fails. Remove the C++-level depth and the model hits a metaprogramming ceiling on every database-class problem it is asked to solve. Remove the Rust-class legibility and humans cannot oversee the output volume that models produce. Both layers exist because both users exist. The language composes their asymmetric strengths instead of flattening them onto one notional "developer".

## Owning code you never typed

"The human is the owner" settles who answers for the result. It does not settle how involved the owner is — that is a dial, and its two ends look nothing alike.

At one end, the model is autonomous from task statement to delivery, and ownership is pure trust: accept what arrives, sign it, move on. At the other, the human re-verifies everything the model produces and stays close enough to the work that if the model vanished mid-project, they could continue — slower, with more defects, but genuinely continue.

<figure class="fig">
<svg id="lg-dial" viewBox="0 0 860 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A slider between full delegation and full verification: model autonomy shrinks from left to right while human involvement grows; intermediate stops mark common working modes; speed increases to the left, control to the right.">
  <style>
    #lg-dial text     { font-size: 13px; fill: var(--text, #1c2230); }
    #lg-dial .name    { font-size: 15px; font-weight: 700; }
    #lg-dial .lbl     { font-size: 11px; font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
    #lg-dial .t-model { fill: var(--dg-model, #5b4be0); }
    #lg-dial .t-human { fill: var(--dg-human, #b26a00); }
    #lg-dial .w-model { fill: var(--dg-model, #5b4be0); fill-opacity: 0.10; stroke: var(--dg-model, #5b4be0); stroke-width: 1.75; }
    #lg-dial .w-human { fill: var(--dg-human, #b26a00); fill-opacity: 0.10; stroke: var(--dg-human, #b26a00); stroke-width: 1.75; }
    #lg-dial .track   { stroke: var(--border, #e6e8ee); stroke-width: 6; stroke-linecap: round; }
    #lg-dial .tick    { stroke: var(--text-muted, #5b6472); stroke-width: 1.5; }
    #lg-dial .knob-o  { fill: var(--surface, #ffffff); stroke: var(--dg-human, #b26a00); stroke-width: 2.5; }
    #lg-dial .knob-i  { fill: var(--dg-human, #b26a00); }
    #lg-dial .arr-m   { stroke: var(--dg-model, #5b4be0); fill: none; stroke-width: 1.75; }
    #lg-dial .arr-h   { stroke: var(--dg-human, #b26a00); fill: none; stroke-width: 1.75; }
    #lg-dial .mkf-model { fill: var(--dg-model, #5b4be0); }
    #lg-dial .mkf-human { fill: var(--dg-human, #b26a00); }
  </style>
  <defs>
    <marker id="mk-dial-m" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
      <path class="mkf-model" d="M0,0 L8,4 L0,8 Z"/>
    </marker>
    <marker id="mk-dial-h" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
      <path class="mkf-human" d="M0,0 L8,4 L0,8 Z"/>
    </marker>
  </defs>
  <!-- Shares: model autonomy shrinks, human involvement grows -->
  <text class="name t-model" x="100" y="82">model autonomy</text>
  <text class="name t-human" x="760" y="82" text-anchor="end">human involvement</text>
  <polygon class="w-model" points="100,285 100,95 760,255 760,285"/>
  <polygon class="w-human" points="100,285 100,255 760,95 760,285"/>
  <!-- The dial -->
  <line class="track" x1="100" y1="315" x2="760" y2="315"/>
  <line class="tick" x1="100" y1="308" x2="100" y2="322"/>
  <line class="tick" x1="265" y1="308" x2="265" y2="322"/>
  <line class="tick" x1="430" y1="308" x2="430" y2="322"/>
  <line class="tick" x1="595" y1="308" x2="595" y2="322"/>
  <line class="tick" x1="760" y1="308" x2="760" y2="322"/>
  <text class="lbl" x="100" y="345" text-anchor="middle">sign &amp; ship</text>
  <text class="lbl" x="265" y="345" text-anchor="middle">steer behavior</text>
  <text class="lbl" x="430" y="345" text-anchor="middle">review interfaces</text>
  <text class="lbl" x="595" y="345" text-anchor="middle">review every change</text>
  <text class="lbl" x="760" y="345" text-anchor="middle">re-verify everything</text>
  <!-- Per-task setting -->
  <circle class="knob-o" cx="480" cy="315" r="10"/>
  <circle class="knob-i" cx="480" cy="315" r="4"/>
  <text class="lbl t-human" x="480" y="298" text-anchor="middle">set per task</text>
  <!-- Trade-off -->
  <text class="lbl t-model" x="270" y="380" text-anchor="middle">faster, on average</text>
  <path class="arr-m" d="M400,392 L140,392" marker-end="url(#mk-dial-m)"/>
  <text class="lbl t-human" x="590" y="380" text-anchor="middle">more control</text>
  <path class="arr-h" d="M460,392 L720,392" marker-end="url(#mk-dial-h)"/>
</svg>
<figcaption>The ownership dial. Model autonomy shrinks as human involvement grows; the stops are illustrative — the track is continuous, and the setting is a per-task choice. Moving left buys speed, because the loop stops routing through its slowest component; moving right buys control, which is what responsibility is made of.</figcaption>
</figure>

Even that strict end is a large speedup over working alone, for a reason crisp enough that complexity theory built a class around it: checking a solution is fundamentally cheaper than finding one. NP is exactly this asymmetry — verification stays polynomial even where search, as far as anyone can prove, costs exponential time — and everyday engineering has the same shape. Confirming that a patch is right costs a fraction of what producing it did. A human who verifies everything still moves far faster than a human who must also invent everything.

In practice, though, the strict end is reserved for mission-critical work — and not only because it is slow. The reviewer has an error rate too, and whether the average human patch beats the average model patch is by now a live empirical question, not a rhetorical one. Full manual verification buys assurance from an inspector who is themselves fallible; for most code, the price stops being worth it.

So most real ownership sits between the ends, and it is *mediated*: the human owns the code through the model. The mediator exposes handles — explain this module, walk me through this failure, restructure this boundary, justify this dependency — and through them the owner pulls information out of the codebase and pushes quality and structure back into it, at whatever depth the task deserves. Every handle gripped costs speed, on average, because it routes the loop through its slowest component — the human. Where to set the dial is a per-task judgment — one of the judgments that *is* the human's contribution — and [One System, One Dynamics](/blog/one-system-one-dynamics/) prices the settings honestly.

One configuration is excluded outright: responsibility that exceeds control. A human held accountable for output they had no practical means to inspect, question, or steer is not an owner — they are a scapegoat. Whatever else "AI-first" turns out to mean, a platform that asks humans to own model-scale output must keep the price of reaching for more control — at any moment, on any line — low.

## More capable models mean more classical code

Here is the claim in this framing that most people get backwards: 

>As models improve, the volume of conventional, deterministic, type-disciplined code in the world **grows** — it does not shrink.

Two reasons, developed properly later in the series. First, models cannot reliably execute deterministic procedures at any scale, so every system that must be *correct* keeps its correctness in symbolic components — type checkers, tests, solvers, schema validators — and the more work models do, the more such components are needed to check it. Second, long agentic trajectories drift, and the practical remedy is a lattice of deterministic checkpoints the trajectory must pass. When orchestration code from frontier labs has leaked, the striking thing was how unexotic it is: predominantly `if`/`then` — gates, dispatch, format checks, retries. Scaffolding.

Models are not replacing that scaffolding. Models are *generating* it — in whatever language makes it cheapest to produce, audit, and compose.

<figure class="fig">
<svg id="lg-joint" viewBox="0 0 860 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three agents — model, human, and deterministic programs — exchange proposals, steering, artifacts, and diagnostics around one joint dynamics.">
  <style>
    #lg-joint text     { font-size: 13px; fill: var(--text, #1c2230); }
    #lg-joint .h       { font-size: 17px; font-weight: 700; }
    #lg-joint .sub     { font-size: 11.5px; font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
    #lg-joint .body    { font-size: 12.5px; fill: var(--text-muted, #5b6472); }
    #lg-joint .lbl     { font-size: 11px; font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
    #lg-joint .box     { fill: var(--surface, #ffffff); stroke-width: 1.5; }
    #lg-joint .arr     { fill: none; stroke-width: 1.75; }
    #lg-joint .c-model { stroke: var(--dg-model, #5b4be0); }
    #lg-joint .c-human { stroke: var(--dg-human, #b26a00); }
    #lg-joint .c-sym   { stroke: var(--dg-sym, #3b6fe0); }
    #lg-joint .t-model { fill: var(--dg-model, #5b4be0); }
    #lg-joint .t-human { fill: var(--dg-human, #b26a00); }
    #lg-joint .t-sym   { fill: var(--dg-sym, #3b6fe0); }
    #lg-joint .core    { fill: var(--accent, #5b4be0); fill-opacity: 0.08; stroke: var(--text-muted, #5b6472); stroke-width: 1.2; stroke-dasharray: 5 5; }
    #lg-joint .mkf-model { fill: var(--dg-model, #5b4be0); }
    #lg-joint .mkf-human { fill: var(--dg-human, #b26a00); }
    #lg-joint .mkf-sym   { fill: var(--dg-sym, #3b6fe0); }
  </style>
  <defs>
    <marker id="mk-model" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
      <path class="mkf-model" d="M0,0 L8,4 L0,8 Z"/>
    </marker>
    <marker id="mk-human" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
      <path class="mkf-human" d="M0,0 L8,4 L0,8 Z"/>
    </marker>
    <marker id="mk-sym" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
      <path class="mkf-sym" d="M0,0 L8,4 L0,8 Z"/>
    </marker>
  </defs>
  <!-- Model -->
  <rect class="box c-model" x="60" y="70" width="230" height="118" rx="12"/>
  <text class="h" x="84" y="104">Model</text>
  <text class="sub t-model" x="84" y="127">stochastic · p(y | x)</text>
  <text class="body" x="84" y="151">proposes: code, fixes, tests —</text>
  <text class="body" x="84" y="169">cheap, plausible, unguaranteed</text>
  <!-- Human -->
  <rect class="box c-human" x="570" y="70" width="230" height="118" rx="12"/>
  <text class="h" x="594" y="104">Human</text>
  <text class="sub t-human" x="594" y="127">responsibility · intent</text>
  <text class="body" x="594" y="151">owns goals and invariants,</text>
  <text class="body" x="594" y="169">reviews and signs the work</text>
  <!-- Deterministic programs -->
  <rect class="box c-sym" x="295" y="380" width="270" height="118" rx="12"/>
  <text class="h" x="319" y="414">Deterministic programs</text>
  <text class="sub t-sym" x="319" y="437">compiler · tests · solvers · CI</text>
  <text class="body" x="319" y="461">compute what models can’t,</text>
  <text class="body" x="319" y="479">cache results, constrain trajectories</text>
  <!-- Joint dynamics -->
  <rect class="core" x="345" y="240" width="170" height="66" rx="33"/>
  <text class="sub" x="430" y="268" text-anchor="middle" style="font-size: 13.5px">X<tspan dy="3.5" style="font-size: 9.5px">n+1</tspan><tspan dy="-3.5"> = F(X</tspan><tspan dy="3.5" style="font-size: 9.5px">n</tspan><tspan dy="-3.5">)</tspan></text>
  <text class="body" x="430" y="290" text-anchor="middle" style="font-size: 11px">joint dynamics</text>
  <!-- Model ⇄ Human -->
  <path class="arr c-model" d="M302,112 L556,112" marker-end="url(#mk-model)"/>
  <text class="lbl t-model" x="429" y="100" text-anchor="middle">proposals · explanations</text>
  <path class="arr c-human" d="M558,150 L304,150" marker-end="url(#mk-human)"/>
  <text class="lbl t-human" x="429" y="170" text-anchor="middle">steering · ΔX</text>
  <!-- Model ⇄ Deterministic -->
  <path class="arr c-model" d="M205,190 C 235,262 285,325 345,372" marker-end="url(#mk-model)"/>
  <text class="lbl t-model" x="316" y="330">artifacts</text>
  <path class="arr c-sym" d="M320,376 C 262,328 210,265 178,192" marker-end="url(#mk-sym)"/>
  <text class="lbl t-sym" x="60" y="300">structured</text>
  <text class="lbl t-sym" x="60" y="316">diagnostics</text>
  <!-- Human ⇄ Deterministic -->
  <path class="arr c-human" d="M655,190 C 625,262 575,325 515,372" marker-end="url(#mk-human)"/>
  <text class="lbl t-human" x="544" y="330" text-anchor="end">policy · gates</text>
  <path class="arr c-sym" d="M540,376 C 598,328 650,265 682,192" marker-end="url(#mk-sym)"/>
  <text class="lbl t-sym" x="800" y="308" text-anchor="end">verdicts · provenance</text>
</svg>
<figcaption>The working unit of agentic coding. The model proposes — cheaply, plausibly, without guarantees. Deterministic programs adjudicate — they compute what models cannot, cache what models should not recompute, and constrain trajectories. The human steers and owns the result. Everything in this series is about making this triangle converge fast.</figcaption>
</figure>

A model that proposes, deterministic machinery that adjudicates, a human who owns the outcome: that triangle, not the model alone, is the thing that produces working software. Its joint behavior — how fast it converges, where it gets stuck, what each corner needs from the other two — is the real subject of "AI-first" design.

## What's ahead

The series builds the argument in order, each part standing on the previous one:

- **[A Model Is Not a Calculator](/blog/a-model-is-not-a-calculator/)** — the boundary between what models generalize over and what they merely approximate, and the two offload rules that follow.
- **[Attraction Basins](/blog/attraction-basins/)** — agentic loops as fixed-point iteration: why agents cycle, why confidence means so little, and what "steering" actually does.
- **[The Model Cannot List What It Knows](/blog/the-model-cannot-list-what-it-knows/)** — model memory as a forward-only compressed program, and the enumeration gap that no scale closes.
- **[The Failure Mode Humans Don't Have](/blog/the-failure-mode-humans-dont-have/)** — what those facts do to large AI-built artifacts, and the external-corpus methodology they force.
- **[One System, One Dynamics](/blog/one-system-one-dynamics/)** — the human's actual role: responsibility, the ownership spectrum, and the two goals an AI-first platform must serve.
- **[Attention Is the Budget](/blog/attention-is-the-budget/)** — a note for engineering leadership on what all this does to team throughput.

Two more parts close the series later: the concrete platform requirements that fall out of the argument, and an audit of how Logos's architecture measures against them.

*Next: [A Model Is Not a Calculator](/blog/a-model-is-not-a-calculator/) — why "just wait for the next release" is the wrong reading of a model failing at arithmetic.*
