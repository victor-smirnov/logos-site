---
title: Versioning
description: What Logos version numbers mean — each field encodes a level of compatibility, and nothing else.
---

A Logos version is `X.Y.Z`, optionally carrying a `-preview` marker and build metadata; `logosc --version` reports the full string. The numbers are not marketing. Each field encodes a specific **level of compatibility**, and nothing else.

## The three fields

**Major (`X`) — the language.** The major version *is* the version of the language. It is `0` today; when the language stabilises it becomes `1`. A move to `2` would mean a substantially different language, not a continuation of this one. Within a single major version the language only ever grows **incrementally** — features are added, never removed or changed under you.

**Minor (`Y`) — binary compatibility.** Within a major version, the minor marks the ABI-compatibility boundary. It is **computed automatically**: the build system decides on its own when a change breaks binary compatibility, so the minor can bump on any commit. The rule that follows is simple — a library built by a compiler at a lower minor must be **rebuilt** with a compiler at a higher one.

**Patch (`Z`) — work done.** The patch number is a monotonic counter of work landed — features, improvements, fixes. Functionality is guaranteed monotonic: a higher patch never offers less than a lower one.

## Development stages

The major-and-marker combination names the stage the language is in:

- **`0.Y.Z-preview`** — *preview*. Nothing is guaranteed; the language is free to move.
- **`0.Y.Z`** — *stabilising*. The toolchain is stable; the language is still fluid.
- **`X.Y.Z`** with `X ≥ 1` — *stable*. Full guarantees within the major version.

The `-preview` marker is orthogonal — it can attach to any version as a version-safe space for experiments.

## A rolling scheme

Within a major version, Logos has no release schedule. Compiler versions ship continuously as work lands; there is no calendar or planned sequence encoded in the numbers — they track compatibility, not milestones. At most, a stretch of work may be tagged `Mn` (milestone *n*) to mark a notable point, but such a tag is a label, not a versioned guarantee.

## Slots and parallel installation

The install **slot** is `X.Y[-preview]` — the major plus the minor, i.e. the ABI boundary. Because the minor *is* the binary-compatibility line, each slot installs independently:

- the versioned binary `logosc-<SLOT>` and stdlib directory `lib/logos/<SLOT>/` are per-slot;
- different slots coexist on one machine, and removing one (`rm -rf …/lib/logos/<SLOT>`) is clean;
- the unversioned `logosc` on `PATH` is a selector (via `update-alternatives`) pointing at one installed slot.

So multiple *minor* versions live side by side. A new *patch*, however, currently **overwrites** the previous one within its slot — coexisting patch installs are a planned future refinement.

## Releases and snapshots

A **release** is built explicitly — the release flow passes `-DLOGOS_RELEASE=ON` — and owns the clean slot `X.Y[-preview]`. **Every other build is a snapshot:** it appends a git discriminator (the branch and short commit, marked dirty if the tree is modified), so it installs into its own slot and can never be mistaken for, or collide with, a release. An accidental release-shaped build is therefore impossible without opting in.

## Requiring a version

An [lforge](/docs/lforge/) project can set a compiler floor in its manifest:

```
requires_logos: "0.9"
```

`lforge` compares this against `logosc`'s reported version and refuses to build against an older compiler.
