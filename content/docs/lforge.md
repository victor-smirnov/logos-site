---
title: lforge
description: The Logos build tool — project manifest, commands, dependency management, and build output.
---

`lforge` is the Logos build tool. It orchestrates `logosc` and `cc` to turn a Logos project into an executable or a linkable library, and it manages dependencies on other Logos projects. It is itself written in Logos — the build tool is a self-hosted Logos program.

`lforge` is installed alongside `logosc` (see [Getting Started](/docs/getting-started/)). It is an early MVP: it builds projects and resolves dependencies, but there is no watcher, no LSP/editor integration, and no cross-compilation yet.

## A project

There is no scaffolding command. A project is a manifest at the root plus one or more source directories, all created by hand:

```
my-project/
  lforge.writ        # the manifest
  src/
    main.logos       # entry point
```

The manifest is a [Writ](/writ/introduction/) document in structured-data notation — JSON-like, with unquoted keys and tolerant of trailing commas. The smallest binary project:

```
{
    name:    "my-project",
    version: "0.1.0",
    targets: [
        { kind: "bin", name: "my-project", src: "src", entry: "main" }
    ]
}
```

`lforge build` from the project root compiles this to `.lforge/debug/out/my-project`.

## Commands

Every command runs against the project rooted at the current directory.

| Command | What it does |
| --- | --- |
| `lforge build [target]` | Compile the project. With a target name, build only that target and its dependencies. |
| `lforge run [target] [-- args…]` | Build a `bin` target, then run it. The program's exit code propagates; arguments after `--` are forwarded to it. |
| `lforge test` | Compile every `lib` target, then compile and run each `*.logos` under `tests/`, reporting `PASS`/`FAIL` per file. |
| `lforge install [--prefix <path>]` | Copy `bin` targets to `<prefix>/bin` and `lib` targets to `<prefix>/lib`. Default prefix `/usr/local`. |
| `lforge update` | Re-resolve every git dependency, ignoring existing pins, and rewrite `lforge.lock`. |
| `lforge clean` | Remove the `.lforge/` build directory. |
| `lforge doc` | Emit a `docs.json` documentation container for the project (consumed by this site). |
| `lforge version` | Print the tool version. |

Pass `--release` to any build command to select the release profile (output lands under `.lforge/release/` instead of `.lforge/debug/`).

> There is no `--help` or `--version` flag. An unrecognised invocation prints a one-line usage string and exits non-zero; the version is available only through the `lforge version` subcommand.

## The manifest

### Top-level fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | string | yes | Project name. |
| `version` | string | yes | Project version. |
| `requires_logos` | string | no | Minimum compiler version (`"X.Y[.Z]"`); `lforge` errors if `logosc` is older. |
| `targets` | array | yes | The build artifacts this project produces. |
| `deps` | array | no | Dependencies on other Logos projects. |
| `replace` | array | no | Local overrides for git dependencies (root manifest only). |

### Targets

Each entry in `targets` describes one artifact:

```
{
    kind:        "bin" | "lib",       // required
    name:        "<name>",            // required
    src:         "src/<dir>",         // directory of .logos sources
    entry:       "main",              // bin only: entry file is <src>/<entry>.logos
    deps:        ["some-lib"],        // sibling lib targets in this project
    c_sources:   ["native/util.c"],   // optional C sources, project-root-relative
    asm_sources: ["native/fast.S"]    // optional assembly sources
}
```

A `bin` target compiles its entry file, then links the object against its sibling libraries and the standard library with `cc`. A `lib` target emits a `lib<name>.a` archive via `logosc --emit-module`. Any `c_sources`/`asm_sources` are compiled with `cc` and folded into the same archive. Sibling `deps` are built first, in dependency order.

## Dependencies

Declare dependencies on other Logos projects in `deps`. Each entry is either a local path or a git reference, and lists the `modules` (library targets) to link from that project:

```
deps: [
    { path: "../shared-lib", modules: ["util"] },
    { project: "github.com/acme/http", tag: "v1.2.0", modules: ["http"] }
]
```

A git dependency pins exactly one of `tag`, `branch`, or `sha`. Bare `host/path`, explicit `https://`/`ssh://`, and `user@host:path` forms are all accepted and canonicalised to the same identity, so a repository shares one cache entry regardless of how it is written.

- **Resolution** uses Go-style minimum-version selection (highest requested version wins, no SAT solver). Sources are cloned into `~/.cache/lforge/`, and compiled artifacts are cached there too, keyed by content so unchanged dependencies are never rebuilt.
- **`lforge.lock`** is written automatically whenever `deps` is non-empty. It pins every git dependency by commit SHA. `lforge build` uses those pins as-is; `lforge update` re-resolves and rewrites the file. Commit the lockfile for applications; the `.lforge/` directory and (typically) `lforge.lock` are the only build artifacts.
- **`replace`** substitutes a local checkout for a git dependency — useful for developing a dependency against its consumer:

```
replace: [
    { project: "github.com/acme/http", path: "../my-fork-of-http" }
]
```

Only the root project's `replace` entries take effect; those in nested dependencies are ignored.

## Build output

Everything `lforge` produces lives under `.lforge/`, split by profile:

```
.lforge/
  <profile>/                     # debug (default) or release
    _gen/<lib>.module            # generated lib manifests
    _files/<lib>/<stem>.o        # per-file objects (incremental)
    out/<bin>                    # linked executable
    out/lib<lib>.a               # library archive
    test/<test>.bin              # per-test binaries (lforge test)
    doc/<name>.json              # docs.json (lforge doc)
```

Rebuilds are incremental: per-file objects are recompiled only when their source is newer, and archives are relinked only when a member changed.

## Environment

`lforge` locates the compiler and standard library through two environment variables:

- `LOGOSC` — path to the `logosc` binary.
- `LOGOS_LIB_DIR` — directory holding the standard-library archives.

When run from inside a Logos source checkout, both fall back to the in-tree build (`./build/bin/logosc` and `./build/lib/logos`). When you build a project elsewhere, point these at your installation.

## See also

- [Getting Started](/docs/getting-started/) — install Logos and build your first program.
- [Writ: code + data](/writ/introduction/) — the substrate the manifest format is built on.
