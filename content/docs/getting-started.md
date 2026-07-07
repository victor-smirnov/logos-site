---
title: Getting Started
description: Install Logos by building a distro package with the provided Docker builds, then compile and run your first program with lforge.
---

Logos ships as a native compiler (`logosc`), a standard library, a runtime, and a build tool (`lforge`). This page gets you from nothing to a running program.

There is no `apt`/`dnf` repository yet. Until one exists, the supported way to install Logos is to **build a distro package inside a container** with one of the provided Docker builds, then install that package on your host. Everything below is optimised for that path. If you intend to work on the compiler itself, see [Build from source](#build-from-source) at the end.

## Install with Docker

You need [Docker](https://docs.docker.com/get-docker/) with BuildKit (the default on current Docker). The build clones nothing for you — start from a checkout of the repository:

```bash
git clone https://github.com/victor-smirnov/logos.git
cd logos
```

The repository provides three self-contained, multi-stage Docker builds under `docker/`. Each compiles the toolchain and emits a native package for its target distro:

| Dockerfile | Target distro | LLVM/MLIR | Package |
| --- | --- | --- | --- |
| `docker/Dockerfile` | Ubuntu 24.04 | 20 | `.deb` |
| `docker/Dockerfile.ubuntu26` | Ubuntu 26.04 | 21 | `.deb` |
| `docker/Dockerfile.fedora` | Fedora 43 | 21 | `.rpm` |

### Build a package

The build's `deb` (or `rpm`) stage writes only the finished package. Extract it straight to a local `dist/` directory with BuildKit's `--output`:

```bash
# Ubuntu 24.04 → .deb in ./dist/
docker build -f docker/Dockerfile --target deb -o type=local,dest=dist .
```

For Fedora, target the `rpm` stage instead:

```bash
# Fedora 43 → .rpm in ./dist/
docker build -f docker/Dockerfile.fedora --target rpm -o type=local,dest=dist .
```

The build context is the repository root (`.`), so run these from the top of the checkout.

### Install it

Install the package with your distro's tool. Installing a local package this way pulls its runtime dependencies (LLVM/MLIR runtime, `liburing`, `zlib`, `libzstd`) automatically:

```bash
# Debian / Ubuntu
sudo apt install ./dist/logosc-*.deb

# Fedora / RHEL
sudo dnf install ./dist/logosc-*.rpm
```

The package installs versioned into `/usr` and registers `logosc` through `update-alternatives`, so multiple version slots can coexist and `lforge` lands on your `PATH` alongside it.

### Verify

```bash
logosc --version
lforge version
```

> Prefer a ready-to-run image over a host install? `docker build -f docker/Dockerfile -t logos .` builds the full runtime image (its entrypoint is `logosc`), and `docker run --rm logos --version` runs a smoke check inside it.

## Your first program

Logos projects are driven by `lforge`, the build tool. There is no scaffolding command — a project is just a manifest plus a source directory, which you create by hand.

Make a project directory with this layout:

```
hello/
  lforge.writ
  src/main.logos
```

`lforge.writ` is the project manifest, written in Writ's structured-data notation. A minimal binary project:

```
{
    name:    "hello",
    version: "0.1.0",
    targets: [
        { kind: "bin", name: "hello", src: "src", entry: "main" }
    ]
}
```

`src/main.logos` is the entry point named by `entry`:

```logos
package hello;
use logos.std.io;

fn main() -> i32 {
    println("Hello from Logos!");
    return 0;
}
```

Build and run it from the project root:

```bash
lforge build     # compiles to .lforge/debug/out/hello
lforge run       # builds, then runs; the program's exit code propagates
```

Logos compiles ahead-of-time to a native executable — there is no VM or interpreter in the run path. For the full manifest schema, dependencies, and command set, see the [lforge](/docs/lforge/) reference.

## Build from source

If you're working on the compiler, build it directly with CMake and Ninja — no Docker in the loop. This is a native toolchain build; the main prerequisite is a matching LLVM/MLIR.

**Prerequisites** (Ubuntu LTS is the reference platform): a C++23 compiler (Clang 20+ or GCC 14+), CMake ≥ 3.28, Ninja, and LLVM/MLIR development packages. The exact dependency set is whatever the Docker builds install — for Ubuntu 24.04 that is:

```bash
sudo apt install clang-20 lld-20 llvm-20-dev libmlir-20-dev mlir-20-tools \
    g++-14 cmake ninja-build pkg-config dpkg-dev \
    liburing-dev zlib1g-dev libzstd-dev
```

CMake auto-discovers LLVM under the Debian layout (`/usr/lib/llvm-{22,21,20,19,18}`, in that order). Then configure and build:

```bash
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build
```

This produces the compiler at `build/bin/logosc` and the build tool at `build/bin/lforge`.

### Build packages from source

Packaging is driven by CPack. Configure with the packaging switch, build, then invoke CPack from the build directory:

```bash
cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo \
    -DLOGOS_INSTALL_UNVERSIONED_SYMLINK=OFF
cmake --build build
cd build && cpack -G DEB      # or: cpack -G RPM
```

The resulting package is written into `build/`.

- `-DLOGOS_INSTALL_UNVERSIONED_SYMLINK=OFF` keeps `/usr/bin/logosc` out of the package's file list so `update-alternatives` owns it instead — this is what lets version slots coexist, and it is required for a package build.
- `-DLOGOS_RELEASE=ON` marks an official release version string. It defaults to **OFF**, which produces a snapshot version (a `…-main-g<sha>` slot), so an accidental release-shaped package is impossible.

### Run the test suite

Logos gates merges on a large executable test suite. From the build directory:

```bash
cd build && ctest --output-on-failure     # run everything
ctest -R arith_i64 --output-on-failure    # run one test by name
```

## Where to next

- [lforge](/docs/lforge/) — the build tool in full: manifest schema, dependencies, and commands.
- [Language Overview](/docs/language-overview/) — the design axes and what makes Logos distinct.
- [Writ: code + data](/writ/introduction/) — the built-in code-and-data substrate.
- [Source on GitHub](https://github.com/victor-smirnov/logos) — the compiler, stdlib, and full in-repo documentation.
