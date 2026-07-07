---
title: Getting Started
description: Build the Logos compiler (logosc), compile and run your first program, and run the test suite.
---

Logos ships as a native compiler (`logosc`), a standard library, and a runtime. This page gets you from a fresh checkout to a running program.

## Prerequisites

Building `logosc` is a native toolchain build. You'll want:

- A C/C++ toolchain (Clang recommended) and [CMake](https://cmake.org/) ≥ 3.20
- [Ninja](https://ninja-build.org/) for fast incremental builds
- LLVM/MLIR development libraries (the compiler lowers through MLIR to LLVM)

> The compiler pipeline covers parse, sema, borrow checking, monomorphization, MLIR generation, and LLVM lowering. Building against a matching LLVM/MLIR is the main prerequisite — see the in-repo docs for the exact supported version.

## Build the compiler

```bash
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build
```

This produces the compiler binary at `build/src/compiler/logosc`.

## Compile and run a program

Point `logosc` at a `.logos` source file and give it an output name:

```bash
build/src/compiler/logosc examples/writ_round_trip.logos -o round_trip
./round_trip
```

Logos compiles ahead-of-time to a native executable — there is no VM or interpreter in the run path.

## Your first program

Create `hello.logos`:

```logos
package hello;
use logos.std.io;

fn main() -> i32 {
    println("Hello from Logos!");
    return 0;
}
```

Compile and run it:

```bash
build/src/compiler/logosc hello.logos -o hello
./hello
```

## Run the test suite

Logos gates merges on a large executable test suite — around 800 passing tests plus ~165 diagnostic tests:

```bash
cd build && ctest --output-on-failure
```

## Where to next

- [Language Overview](/docs/language-overview/) — the design axes and what makes Logos distinct.
- [Writ: code + data](/writ/introduction/) — the built-in code-and-data substrate.
- [Source on GitHub](https://github.com/victor-smirnov/logos) — the compiler, stdlib, and full in-repo documentation.
