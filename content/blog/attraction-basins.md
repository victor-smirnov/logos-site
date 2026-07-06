---
title: "Attraction Basins"
description: Agentic coding is a fixed-point iteration. Its failure modes — loops, drift, confident nonsense — are geometry, and geometry can be engineered.
date: 2026-07-10
---

*Part 3 of **Code in the AI-Primary Era**. Previous: [A Model Is Not a Calculator](/blog/a-model-is-not-a-calculator/).*

Anyone who has watched an agent debug for long enough has seen the loop: fix, run, fail, near-identical fix, run, fail, a third fix that reverts to the first. The trajectory bounces between two states, each step locally reasonable, going nowhere. It is tempting to read this as stupidity. It is more useful to read it as dynamics — because dynamics can be measured, predicted, and engineered around, and "stupidity" cannot.

## The iterated map

At every level of granularity — token generation, a tool-use turn, a whole agentic session — a model-driven system is a fixed-point iteration:

$$
X_{n+1} = F(X_n)
$$

where $X_n$ is the state (context, prompt, in-flight code, conversation history) and $F$ is one model step plus the state update it causes. Whether the iteration converges, cycles, or drifts is governed by the contraction properties of $F$ — and $F$ is not unconditionally contractive. It contracts on some inputs, in some regimes, and not in others.

Several things everyone has observed empirically fall out of this framing:

**Termination is learned, not intrinsic.** Frontier models rarely run away into unbounded generation — but that is a trained stopping policy, not a property of the underlying dynamics, which reassert themselves the moment the policy is weakened.

**Cycles persist one level up.** The fix–fail–fix loop is a limit cycle in the agentic iteration. Mid-tier models exhibit them constantly on code tasks; frontier models converge in a handful of iterations. The difference is not "smarter" in the abstract — it is a more contractive $F$ on that input class, which lands in a fixed point faster and more reliably.

**The object of study is the basin, not the output.** Since $X_{n+1} = F(X_n)$ can express arbitrary computation, any model behavior is some trajectory settling somewhere. The informative question about a task is not "what did the model output" but "what is the basin of attraction of $F$ for this input, and how fast does it contract."

A symbolic algorithm, in this language, is the degenerate case: a single fixed point, one fully analyzed trajectory, contraction engineered to be guaranteed — which is where reproducibility and verifiability come from. A model is the general case: many fixed points, irregular basins, perturbation-sensitive trajectories, and no a-priori map from an input to which fixed point it reaches. Crucially, the fixed points include correct answers, *confident errors*, and partial-answer cycles. "The model can do task T" translates to: the correct-answer basin is large and strongly contractive over T's input distribution. Nothing more.

## An archipelago, not a continent

For models, the coordinate system that matters is in-distribution (InD) versus out-of-distribution (OoD/OOD), and the geography of it is the load-bearing fact: **InD support is fragmented**. The set of inputs a model handles well is not a continent with a coastline you can map — it is a constellation of islands scattered across an out-of-distribution sea. Basins nucleate around training examples; two problems that look adjacent to a human may sit on different islands; a small rephrasing can teleport a query from one island to another, or off support entirely.

<figure class="fig">
<svg id="lg-arch" viewBox="0 0 900 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The whole field is tiled into attraction basins separated by smooth watershed boundaries; islands of in-distribution competence are the strongly contracting cores of the basins, and an iteration initialized at a correct but out-of-distribution target slides down its basin into the nearest island's fixed point.">
  <style>
    #lg-arch .sea    { fill: var(--dg-err, #b5259e); fill-opacity: 0.035; stroke: var(--border, #e6e8ee); stroke-width: 1.5; }
    #lg-arch .haze   { fill: var(--dg-err, #b5259e); }
    #lg-arch .ws     { fill: none; stroke: var(--dg-err, #b5259e); stroke-width: 1.4; stroke-opacity: 0.45; stroke-dasharray: 2 6; stroke-linecap: round; }
    #lg-arch .core   { fill: url(#g-arch-core); }
    #lg-arch .gstop  { stop-color: var(--dg-model, #5b4be0); }
    #lg-arch .ring   { fill: none; stroke: var(--dg-model, #5b4be0); stroke-width: 1.2; }
    #lg-arch .fp     { fill: var(--dg-model, #5b4be0); }
    #lg-arch .traj   { fill: none; stroke: var(--dg-model, #5b4be0); stroke-width: 1.8; stroke-dasharray: 6 5; stroke-linecap: round; }
    #lg-arch .start  { fill: none; stroke: var(--dg-model, #5b4be0); stroke-width: 1.8; }
    #lg-arch .target { fill: none; stroke: var(--dg-ok, #2f8f4e); stroke-width: 2.2; stroke-linejoin: round; }
    #lg-arch .mkf-t  { fill: var(--dg-model, #5b4be0); }
  </style>
  <defs>
    <radialGradient id="g-arch-core">
      <stop class="gstop" offset="0"   stop-opacity="0.20"/>
      <stop class="gstop" offset="0.5" stop-opacity="0.11"/>
      <stop class="gstop" offset="1"   stop-opacity="0"/>
    </radialGradient>
    <marker id="mk-traj" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path class="mkf-t" d="M0,0 L7,3.5 L0,7 Z"/>
    </marker>
  </defs>
  <rect class="sea" x="10" y="10" width="880" height="480" rx="18"/>
  <!-- Soft basin cores: contraction fading with distance from dense support -->
  <ellipse class="core" cx="207" cy="172" rx="105" ry="86"/>
  <ellipse class="core" cx="624" cy="297" rx="130" ry="105"/>
  <ellipse class="core" cx="438" cy="102" rx="85"  ry="70"/>
  <ellipse class="core" cx="178" cy="397" rx="90"  ry="72"/>
  <ellipse class="core" cx="788" cy="107" rx="80"  ry="66"/>
  <!-- Watersheds: the basins tile the whole field; these are their shared boundaries -->
  <path class="ws" d="M284,10 C297,114 361,204 374,308"/>
  <path class="ws" d="M10,261 C129,293 255,276 374,308"/>
  <path class="ws" d="M374,308 Q383,321 397,328"/>
  <path class="ws" d="M397,328 C480,271 530,179 613,122"/>
  <path class="ws" d="M614,10 Q604,66 613,122"/>
  <path class="ws" d="M613,122 C717,188 786,295 890,361"/>
  <path class="ws" d="M397,328 C423,379 407,439 433,490"/>
  <!-- OoD haze -->
  <g>
    <circle class="haze" cx="390" cy="250" r="2.2" opacity="0.16"/>
    <circle class="haze" cx="330" cy="320" r="1.8" opacity="0.13"/>
    <circle class="haze" cx="470" cy="390" r="2"   opacity="0.15"/>
    <circle class="haze" cx="540" cy="180" r="1.8" opacity="0.13"/>
    <circle class="haze" cx="640" cy="90"  r="2"   opacity="0.14"/>
    <circle class="haze" cx="740" cy="230" r="2.2" opacity="0.16"/>
    <circle class="haze" cx="820" cy="320" r="1.8" opacity="0.12"/>
    <circle class="haze" cx="300" cy="60"  r="1.8" opacity="0.12"/>
    <circle class="haze" cx="90"  cy="280" r="2"   opacity="0.13"/>
    <circle class="haze" cx="60"  cy="120" r="1.8" opacity="0.12"/>
    <circle class="haze" cx="400" cy="450" r="1.8" opacity="0.13"/>
    <circle class="haze" cx="560" cy="440" r="2"   opacity="0.13"/>
    <circle class="haze" cx="850" cy="60"  r="1.8" opacity="0.12"/>
    <circle class="haze" cx="150" cy="330" r="1.6" opacity="0.11"/>
    <circle class="haze" cx="720" cy="440" r="1.8" opacity="0.12"/>
    <circle class="haze" cx="490" cy="60"  r="1.6" opacity="0.11"/>
  </g>
  <!-- Island A -->
  <path class="ring" opacity="0.18" d="M 130,175 C 126,138 162,113 202,110 C 247,107 280,133 284,168 C 288,204 252,232 206,235 C 161,238 134,212 130,175 Z"/>
  <path class="ring" opacity="0.4" d="M 130,175 C 126,138 162,113 202,110 C 247,107 280,133 284,168 C 288,204 252,232 206,235 C 161,238 134,212 130,175 Z" transform="translate(207 172) scale(0.62) translate(-207 -172)"/>
  <path class="ring" opacity="0.55" d="M 130,175 C 126,138 162,113 202,110 C 247,107 280,133 284,168 C 288,204 252,232 206,235 C 161,238 134,212 130,175 Z" transform="translate(207 172) scale(0.32) translate(-207 -172)"/>
  <circle class="fp" cx="207" cy="172" r="4.5"/>
  <!-- Island B (landing) -->
  <path class="ring" opacity="0.18" d="M 505,295 C 500,245 555,205 625,202 C 692,199 740,240 744,292 C 748,345 695,388 622,392 C 552,396 510,348 505,295 Z"/>
  <path class="ring" opacity="0.4" d="M 505,295 C 500,245 555,205 625,202 C 692,199 740,240 744,292 C 748,345 695,388 622,392 C 552,396 510,348 505,295 Z" transform="translate(624 297) scale(0.62) translate(-624 -297)"/>
  <path class="ring" opacity="0.55" d="M 505,295 C 500,245 555,205 625,202 C 692,199 740,240 744,292 C 748,345 695,388 622,392 C 552,396 510,348 505,295 Z" transform="translate(624 297) scale(0.32) translate(-624 -297)"/>
  <circle class="fp" cx="624" cy="297" r="5"/>
  <!-- Island C -->
  <path class="ring" opacity="0.18" d="M 385,105 C 383,78 408,58 437,57 C 468,56 490,76 492,101 C 494,127 468,147 436,148 C 406,149 387,131 385,105 Z"/>
  <path class="ring" opacity="0.45" d="M 385,105 C 383,78 408,58 437,57 C 468,56 490,76 492,101 C 494,127 468,147 436,148 C 406,149 387,131 385,105 Z" transform="translate(438 102) scale(0.45) translate(-438 -102)"/>
  <circle class="fp" cx="438" cy="102" r="3.5"/>
  <!-- Island D -->
  <path class="ring" opacity="0.18" d="M 120,400 C 118,372 145,351 177,350 C 210,349 234,370 236,396 C 238,423 210,444 176,445 C 144,446 122,427 120,400 Z"/>
  <path class="ring" opacity="0.45" d="M 120,400 C 118,372 145,351 177,350 C 210,349 234,370 236,396 C 238,423 210,444 176,445 C 144,446 122,427 120,400 Z" transform="translate(178 397) scale(0.45) translate(-178 -397)"/>
  <circle class="fp" cx="178" cy="397" r="3.5"/>
  <!-- Island E -->
  <path class="ring" opacity="0.18" d="M 745,110 C 744,88 764,72 788,71 C 813,70 831,86 832,106 C 833,127 812,143 786,144 C 762,145 746,131 745,110 Z"/>
  <path class="ring" opacity="0.45" d="M 745,110 C 744,88 764,72 788,71 C 813,70 831,86 832,106 C 833,127 812,143 786,144 C 762,145 746,131 745,110 Z" transform="translate(788 107) scale(0.45) translate(-788 -107)"/>
  <circle class="fp" cx="788" cy="107" r="3.5"/>
  <!-- Correct target, out at sea -->
  <path class="target" d="M 812,423 L 824,435 L 812,447 L 800,435 Z"/>
  <!-- Trajectory: initialized near the target, relaxes into island B -->
  <circle class="start" cx="778" cy="440" r="5"/>
  <path class="traj" d="M 771,437 C 730,458 664,444 634,406 C 604,368 560,330 590,301 C 615,277 658,290 652,317 C 648,336 624,332 620,312" marker-end="url(#mk-traj)"/>
</svg>
<figcaption>The InD archipelago. Islands are cores of dense training support; the dot at each center is a fixed point. The basins tile the whole space — the dotted watersheds are their shared boundaries, where an arbitrarily small perturbation changes which fixed point the iteration reaches. Open water is still basin territory, just weakly contractive. The green diamond is a correct answer in open water: it lies inside a basin whose fixed point is elsewhere, so an unforced iteration initialized near it slides down to the island and converges confidently to the wrong answer.</figcaption>
</figure>

Two familiar behaviors are this geography seen from different sides.

**No gibberish.** Model output is essentially never incoherent, even when it is wrong. The iteration almost always lands in *some* InD basin, producing structured, fluent, confident output — even when the correct answer lies far from every island. Confidence, in this picture, is a property of *being in a basin*, not of being in the correct one. This is worth internalizing, because every intuition humans have about confidence — trained on other humans, whose confidence loosely tracks competence — misfires on models.

**Low inventiveness.** The same property with the sign flipped. The model maximizes time spent inside islands and avoids open water, because open water is where contraction is lost and accuracy collapses. For the typical workload this is adaptive: you want the system that stays near what it knows. For invention — an answer that lies in no island — it is exactly wrong.

## Steering, and forcing

If the well-handled region is an archipelago, then someone has to navigate between islands, and the model will not do it alone. This reframes what the human in the loop is actually doing.

The human's function is not only evaluating output. It is **steering**: perturbing the state — a hint, an example, a partial implementation, an error message, an intermediate reframing — to relocate where the iteration lands. Mechanically: a change in $X$ changes the dynamics, which changes the landing basin. Every diagnostic, every failing test, every fragment of context is a candidate perturbation. "Prompting" describes this about as well as "typing" describes programming.

When the target genuinely lies in open water — a design no one has written, a bug class no one has documented — steering escalates to **forcing**. Left unforced, the iteration relaxes to the nearest known pattern and fails by producing a familiar-shaped answer to an unfamiliar problem; anyone who has asked a model for a novel architecture and received last year's standard one has watched this happen. Holding an iteration out in the chaotic region, stepwise, against its own contraction toward familiarity, is an active, adversarial process. Invention is categorically harder than refinement — not because the model lacks some ingredient, but because its core dynamics actively pull away from it.

## Three geometries, one fixed point

The agentic workspace is shared by three kinds of agent, with characteristically different basin geometry. Models: wide, smooth, irregular basins — fast settling in-distribution, drift and cycles out of it, boundaries unaligned with human intuition. Humans: narrow, sharp basins bounded by working memory and attention — precise on a few patterns at a time, fatigue-limited on long iterations. Symbolic algorithms: degenerate basins — one fixed point, zero drift, zero fatigue, but covering only the regions someone bothered to construct.

A naive system lets each iterate independently and forces translation at every boundary; the agents' updates displace one another's trajectories and the joint state drifts. A well-designed system makes the three geometries **interlock**: the model's contraction lands inside the region the symbolic checker can verify; the checker's verdict lands in a representation the human can audit; the human's judgment lands in a structured form the model can attend to. The composed map is more contractive than any component alone — which is the whole point of having three agents rather than one.

<figure class="fig">
<svg id="lg-3g" viewBox="0 0 900 470" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two panels. Left: three basin geometries — a wide soft model basin, a narrow sharp human basin, and a hard-edged symbolic domain — sit apart, and the joint trajectory cycles between their three private fixed points without settling. Right: the geometries interlock, the trajectory passes from model step to checker verdict to human nudge, and contracts to a single shared verified fixed point.">
  <style>
    #lg-3g .hdr    { font-size: 10.5px; letter-spacing: 0.08em; fill: var(--text-muted, #5b6472); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
    #lg-3g .cap    { font-size: 10.5px; fill: var(--text-muted, #5b6472); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
    #lg-3g .lbl    { font-size: 11px; font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
    #lg-3g .frame  { fill: none; stroke: var(--border, #e6e8ee); stroke-width: 1.5; }
    #lg-3g .core   { fill: url(#g-3g-core); }
    #lg-3g .gstop  { stop-color: var(--dg-model, #5b4be0); }
    #lg-3g .ring   { fill: none; stroke: var(--dg-model, #5b4be0); stroke-width: 1.2; }
    #lg-3g .hum    { fill: var(--dg-human, #b26a00); fill-opacity: 0.06; stroke: var(--dg-human, #b26a00); stroke-width: 2; }
    #lg-3g .sym    { fill: var(--dg-sym, #3b6fe0); fill-opacity: 0.05; stroke: var(--dg-sym, #3b6fe0); stroke-width: 1.75; }
    #lg-3g .fp-m   { fill: var(--dg-model, #5b4be0); }
    #lg-3g .fp-h   { fill: var(--dg-human, #b26a00); }
    #lg-3g .fp-s   { fill: var(--dg-sym, #3b6fe0); }
    #lg-3g .ok     { fill: none; stroke: var(--dg-ok, #2f8f4e); stroke-width: 2; }
    #lg-3g .tj-m   { fill: none; stroke: var(--dg-model, #5b4be0); stroke-width: 1.8; stroke-dasharray: 6 5; stroke-linecap: round; }
    #lg-3g .tj-h   { fill: none; stroke: var(--dg-human, #b26a00); stroke-width: 1.8; stroke-dasharray: 6 5; stroke-linecap: round; }
    #lg-3g .tj-s   { fill: none; stroke: var(--dg-sym, #3b6fe0); stroke-width: 1.8; stroke-linecap: round; }
    #lg-3g .ld     { fill: none; stroke-width: 1; opacity: 0.5; }
    #lg-3g .start  { fill: none; stroke: var(--dg-model, #5b4be0); stroke-width: 1.8; }
    #lg-3g .t-model { fill: var(--dg-model, #5b4be0); }
    #lg-3g .t-human { fill: var(--dg-human, #b26a00); }
    #lg-3g .t-sym   { fill: var(--dg-sym, #3b6fe0); }
    #lg-3g .t-ok    { fill: var(--dg-ok, #2f8f4e); }
    #lg-3g .s-human { stroke: var(--dg-human, #b26a00); }
    #lg-3g .s-ok    { stroke: var(--dg-ok, #2f8f4e); }
  </style>
  <defs>
    <radialGradient id="g-3g-core">
      <stop class="gstop" offset="0"   stop-opacity="0.20"/>
      <stop class="gstop" offset="0.5" stop-opacity="0.11"/>
      <stop class="gstop" offset="1"   stop-opacity="0"/>
    </radialGradient>
    <marker id="mk-3g-m" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path class="fp-m" d="M0,0 L7,3.5 L0,7 Z"/>
    </marker>
    <marker id="mk-3g-h" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path class="fp-h" d="M0,0 L7,3.5 L0,7 Z"/>
    </marker>
    <marker id="mk-3g-s" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path class="fp-s" d="M0,0 L7,3.5 L0,7 Z"/>
    </marker>
  </defs>
  <text class="hdr" x="225" y="32" text-anchor="middle">NAIVE — EACH AGENT ITERATES ALONE</text>
  <text class="hdr" x="675" y="32" text-anchor="middle">INTERLOCKED — ONE COMPOSED MAP</text>
  <rect class="frame" x="10"  y="44" width="430" height="400" rx="16"/>
  <rect class="frame" x="460" y="44" width="430" height="400" rx="16"/>
  <!-- LEFT: three geometries apart, three private fixed points -->
  <ellipse class="core" cx="153" cy="203" rx="100" ry="80"/>
  <path class="ring" opacity="0.2" d="M 60,205 C 57,160 95,128 148,125 C 205,122 243,155 246,200 C 249,247 205,278 148,281 C 96,284 63,250 60,205 Z"/>
  <path class="ring" opacity="0.4" d="M 60,205 C 57,160 95,128 148,125 C 205,122 243,155 246,200 C 249,247 205,278 148,281 C 96,284 63,250 60,205 Z" transform="translate(153 203) scale(0.5) translate(-153 -203)"/>
  <circle class="fp-m" cx="153" cy="203" r="3.5"/>
  <ellipse class="hum" cx="330" cy="140" rx="46" ry="26" transform="rotate(-12 330 140)"/>
  <circle class="fp-h" cx="330" cy="140" r="3"/>
  <polygon class="sym" points="300,270 355,295 360,350 310,385 250,360 245,300"/>
  <circle class="fp-s" cx="300" cy="328" r="3"/>
  <!-- joint trajectory: a tug-of-war cycle, never settling -->
  <path class="tj-m" opacity="0.3" d="M308,312 Q248,296 208,202"/>
  <path class="tj-h" opacity="0.3" d="M208,202 Q254,155 324,162"/>
  <path class="tj-s" opacity="0.3" d="M324,162 L308,312"/>
  <path class="tj-m" d="M298,302 Q245,285 218,208" marker-end="url(#mk-3g-m)"/>
  <path class="tj-h" d="M218,208 Q258,165 316,170" marker-end="url(#mk-3g-h)"/>
  <path class="tj-s" d="M316,170 L298,302" marker-end="url(#mk-3g-s)"/>
  <text class="cap" x="225" y="430" text-anchor="middle">three private fixed points — the joint state cycles</text>
  <!-- RIGHT: interlocked geometries, one shared fixed point -->
  <ellipse class="core" cx="687" cy="238" rx="150" ry="122"/>
  <path class="ring" opacity="0.2" d="M 540,240 C 535,165 600,112 685,108 C 775,104 830,160 835,235 C 840,310 775,365 685,369 C 602,373 545,315 540,240 Z"/>
  <path class="ring" opacity="0.4" d="M 540,240 C 535,165 600,112 685,108 C 775,104 830,160 835,235 C 840,310 775,365 685,369 C 602,373 545,315 540,240 Z" transform="translate(687 238) scale(0.55) translate(-687 -238)"/>
  <polygon class="sym" points="690,175 775,215 785,295 715,345 625,325 608,235"/>
  <ellipse class="hum" cx="685" cy="262" rx="58" ry="34" transform="rotate(-8 685 262)"/>
  <circle class="ok" cx="688" cy="262" r="9"/>
  <circle class="fp-m" cx="688" cy="262" r="4"/>
  <!-- joint trajectory: model step → checker verdict → human nudge → converge -->
  <circle class="start" cx="505" cy="412" r="4.5"/>
  <path class="tj-m" d="M511,407 C540,380 590,330 645,312" marker-end="url(#mk-3g-m)"/>
  <path class="tj-s" d="M645,312 L716,292" marker-end="url(#mk-3g-s)"/>
  <path class="tj-h" d="M716,292 Q712,262 700,247" marker-end="url(#mk-3g-h)"/>
  <path class="tj-m" d="M700,247 Q684,246 689,253" marker-end="url(#mk-3g-m)"/>
  <text class="lbl t-model" x="548" y="138">model</text>
  <text class="lbl t-sym" x="798" y="190">symbolic</text>
  <text class="lbl t-human" x="580" y="320" text-anchor="end">human</text>
  <path class="ld s-human" d="M585,315 L638,288"/>
  <text class="lbl t-ok" x="768" y="352">one fixed point</text>
  <path class="ld s-ok" d="M764,344 L697,270"/>
  <text class="cap" x="675" y="430" text-anchor="middle">one shared fixed point — the composed map contracts</text>
</svg>
<figcaption>Three basin geometries in one workspace. Left, the naive composition: the model's wide soft basin, the human's narrow sharp one, and the checker's hard-edged domain each pull the joint state toward a private fixed point — every hand-off is a translation, and the trajectory orbits without settling. Right, the interlocked composition: the model's step lands inside the checker's domain, the checker's verdict lands inside the human's basin, the human's nudge re-enters the model's contraction — and the composed map converges to a single shared fixed point. Solid segments are deterministic snaps; dashed segments are stochastic steps.</figcaption>
</figure>

This gives sharper definitions to some everyday objects. A diagnostic is a *boundary object* — one anchor that has to sit inside the basins of all three agents simultaneously, which is why "human error message" versus "machine payload" is a false choice. A tool is well-chosen when its output lands in the basin of every downstream reader, not just its producer. And a system failure is a *basin-separation event* — the agents stop co-converging — which is a more actionable description than "hallucination."

The practical consequences for a platform: perturbation should be a first-class, cheap, structured operation, not an afterthought chat box. The provenance of an output — which training neighborhood it came from — is high-value and currently unobservable; that is an open tooling opportunity. And there should be an explicit way to say "this request is non-modal; suppress the regression to the nearest pattern." 

> Above all: **convergence rate is a platform variable, not just a model variable.** The same model inside a better feedback loop converges in fewer iterations. That lever belongs to whoever builds the tools.

So far the model has been a dynamical system — trajectories, basins, landings. There is a complementary static question: what is actually *stored* in a trained model, and which operations does that store support? The answer explains the most expensive failure mode in AI-written code, and it is the subject of the next part.

*Next: [The Model Cannot List What It Knows](/blog/the-model-cannot-list-what-it-knows/) — point queries, missing inverses, and why self-review cannot find what generation omitted.*
