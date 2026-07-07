---
title: "Trama tutorial"
description: Build a Trama template from a first render up through schema fields, loops, conditionals, set, UDFs, the three body forms, and the dynamic Tpl API.
---

## Your first render

The static surface is a `resource` bound to a `trama!` macro call. The parentheses hold a typed parameter list; the braces hold the template.

```logos
resource greet = trama!(name: str){ "Hello {{ name }}" };
```

That expands to a native function. Its emitted signature is `pub fn greet(name: str) -> Result<String, ElError>` — it returns a `Result` because an arithmetic error inside an embedded expression (overflow, divide-by-zero) surfaces as `Err(ElError)` rather than trapping the host. A template with no arithmetic never errors, so you unwrap the `Ok`:

```logos
let s: String = greet("Ada").unwrap();   // "Hello Ada"
```

Two rules already apply. At least one parameter is required — `trama!(){ … }` is a compile error. And `name` is a bare scalar parameter, usable directly: `{{ name }}` is the parameter itself, rendered (here) as a string because its type is `str`.

## Schema params and field chains

A parameter whose type is a schema struct is *reflected*: its fields type automatically, with no `with` or `data` clause. Give the template a `&User` and read its fields:

```logos
struct User {
    pub name: str,
    pub age:  i64,
    pub tags: [str; 2],
}

resource card = trama!(u: &User, greeting: str, count: i64){
`{{ greeting }}, {{ u.name }} ({{ u.age }}) tags:{% for t in u.tags %}{{ t }},{% endfor %} x{{ count }}{% if count %}!{% endif %}`
};
```

This single template uses three parameter kinds at once. `u: &User` is a schema struct — `{{ u.name }}` types as `str` and `{{ u.age }}` as `i64`, straight from the schema, and `{% for t in u.tags %}` follows the `[str; 2]` field to bind `t: str`. `greeting: str` is a bare string. `count: i64` is a bare integer, used both as a value (`{{ count }}`) and as a condition (`{% if count %}`). Render it:

```logos
let u: User = User { name: "Ada", age: 36i64, tags: ["math", "eng"] };
let s: String = card(&u, "Hello", 3i64).unwrap();
// "Hello, Ada (36) tags:math,eng, x3!"
```

Note the interpolations render by *inferred type*: `{{ u.name }}` pushes a string, `{{ u.age }}` and `{{ count }}` push integers. You never annotate any of it.

## Loops and conditionals

You have already met both. `{% for v in coll %} … {% endfor %}` iterates a collection, binding `v` to each element; the loop variable's element type is resolved from the schema, and nested loops resolve too (`{% for line in item.lines %}` follows `Item.lines`). `{% if %}/{% elif %}/{% else %}/{% endif %}` branches on a condition coerced to `bool` by Jinja truthiness — a `bool` is used bare, an `i64` is `!= 0`, a `str` is non-empty. That is why `{% if count %}` above drops the trailing `!` when `count` is `0`:

```logos
let s0: String = card(&u, "Hi", 0i64).unwrap();
// "Hi, Ada (36) tags:math,eng, x0"   — no "!", the i64 guard is false
```

There are no `loop.*` helpers (`loop.index`, `loop.first`, …); a `{% for %}` binds only its variable.

## Floats, arithmetic, and set

Interpolation understands the full EL type lattice. An `f64` field formats through the shortest round-trip decimal convention (`2.5` → `"2.5"`, `5.0` → `"5"`); mixed int/float arithmetic promotes with an explicit cast; and a bare literal expression like `{{ 1.5 + 2 }}` is const-folded at compile time:

```logos
struct Product { pub name: str, pub price: f64 }

resource label = trama!(p: &Product){
{{ p.name }}: {{ p.price }} (x2 = {{ p.price * 2 }}) [{% if p.price > 10.0 %}spendy{% else %}cheap{% endif %}] s={{ 1.5 + 2 }}
};

let a: Product = Product { name: "ada", price: 2.5f64 };
label(&a).unwrap();   // "ada: 2.5 (x2 = 5) [cheap] s=3.5"
```

`{% set v = expr %}` binds a local whose type follows the assigned expression — a typed `let` in the emitted function. It is the way to name a subexpression once and reuse it in the text that follows.

## Calling functions (UDFs)

The module's top-level functions are registered as template UDFs. Call them in interpolations or conditions with zero special syntax — they route through the same call path Deem uses, resolved builtin-first (a same-named builtin shadows your function):

```logos
fn shout(n: str) -> String { let mut s: String = String::new(); s.push_str(n); s.push_str("!"); return s; }
fn is_vip(sc: i64) -> bool { return sc >= 100i64; }
fn dbl(sc: i64) -> i64 { return sc * 2i64; }

resource render = trama!(u: &User){
    `{{ shout(u.name) }} s={{ dbl(u.score) }} [{% if is_vip(u.score) %}vip{% else %}std{% endif %}]`
};

let a: User = User { name: "ada", score: 120i64 };
render(&a).unwrap();   // "ada! s=240 [vip]"
```

A `String`-returning UDF is interpolated as a string, a `bool` UDF drops into `{% if %}` bare, an `i64` UDF pushes as an integer — the same type-routing as any other expression. The built-in EL functions available without declaring anything are `len`, `upper`, `lower`, `contains`, and `starts_with`.

## The three body forms

The template body after `trama!(params)` can be delimited three ways, and the choice is ergonomic:

```logos
// 1. double-quoted — simplest, for templates with no inner quotes
resource a = trama!(c: &Ctx){ "a\{{{ c.n }}\}b\\c" };

// 2. backtick-quoted — lets EL string literals appear unescaped inside
resource b = trama!(u: &User){ `{{ shout(u.name) }}{% if is_vip(u.score) %}vip{% endif %}` };

// 3. delimiter-less whole-brace — the entire { … } is the template, edge-trimmed
resource c = trama!(p: &Product){ {{ p.name }}: {{ p.price }} };
```

Reach for the **backtick** form whenever your EL expressions contain `"` string literals (`{{ "(" + city + ")" }}`, `{% if x == "NYC" %}`) — it saves you from escaping them. The **delimiter-less** form is convenient but trims leading and trailing whitespace; use a quoted form when exact edge whitespace matters.

Inside any form, the four template metacharacters are backslash-escaped: `\{`, `\}`, `` \` ``, and `\\`. The escape survives parsing and is decoded to the bare character at render time, so `\{{` does *not* open a tag:

```logos
resource render = trama!(c: &Ctx){ "a\{{{ c.n }}\}b\\c" };
// with c.n = 7  →  "a{7}b\c"
```

Whitespace-control variants (`{%- … -%}`, `{{- … -}}`) trim the adjacent text run, exactly as in Jinja2.

## The dynamic surface

When the template text is not known until runtime, use `Tpl::compile` / `render` from `logos.std.deem`. You need a schema catalog describing the data, a compiled `Tpl`, and a `QEnv` binding names to values.

```logos
use logos.std.deem;               // SchemaCatalog / QEnv / Tpl / QError

pub schema Emp  : code(0x0A02_0000_0000_0001) { name: str = 0, age: i64 = 1 }
pub schema Team : code(0x0A02_0000_0000_0002) { title: str = 0, emps: WRef<Emp> = 1 }

resource cat = schema_catalog!{ Emp, Team };
```

Compile once, then render — the same `Tpl` is re-entrant over different environments:

```logos
let c: SchemaCatalog = cat();

let tpl: Tpl = match Tpl::compile(
    "Hello {{ e.name }}, {% if e.age >= 40 %}senior{% else %}junior{% endif %}; team {{ t.title }}:{% for m in t.emps %} {{ m.name }}({{ m.age }}){% endfor %}{% set x = 2 + 3 %} x={{ x }}",
    &c)
{
    Result::Ok(v)   => { v }
    Result::Err(_e) => { return 1i32; }
};

let mut env: QEnv = QEnv::new();
env.bind_node("e", e1.as_any());   // a schema'd Writ object
env.bind_node("t", t1.as_any());
let s: String = match tpl.render(&env) {
    Result::Ok(s)    => { s }
    Result::Err(_e2) => { return 2i32; }
};
// "Hello Ann, senior; team Core: Ann(45) Bob(31) x=5"
```

`QEnv` has a binder per kind: `bind_node` (a schema'd object), `bind_source` (a Writ array of rows), and `bind_i64` / `bind_f64` / `bind_bool` / `bind_str` for scalar parameters. Errors here are **values** — `Tpl::compile` and `render` both return `Result<_, QError>`, and you `match` on them rather than watching the build fail.

## Lenient rendering over erased data

For untyped data — string-keyed maps, values with no schema — bind the root *erased*. Fields then resolve at runtime by name, and a miss yields `Null`, which renders as the empty string:

```logos
let t: Tpl = Tpl::compile(
    "{{ x.name }}:{{ x.score }}:{{ x.score + 1 }}:{% if x.score %}Y{% else %}N{% endif %}", &c
).unwrap();

let mut env: QEnv = QEnv::new();
env.bind_node_erased("x", WAny::from(&*m1));   // m1 has name="Ann", score=10
t.render(&env).unwrap();                        // "Ann:10:11:Y"

env.bind_node_erased("x", WAny::from(&*m2));    // m2 has name="Bob", score MISSING
t.render(&env).unwrap();                        // "Bob:::N"
```

For Bob the missing `score` reads as `Null`: `{{ x.score }}` renders empty, `Null + 1` propagates to `Null` and renders empty, and the `{% if x.score %}` guard takes the else branch. A `Null` (or non-array) collection in a `{% for %}` iterates as an empty loop. This lenient behavior is a property of the *binding* (`bind_node_erased` / `bind_source_erased`); strict bindings never produce `Null`.

## Related

- [Trama: the transformation engine](/trama/introduction/) — the concepts: the two surfaces, the Jinja2 lineage, and where Trama is headed.
- [Trama reference](/trama/reference/) — every construct, the full type-routing and truthiness tables, and the complete dynamic API.
- [Deem: the query & reasoning engine](/deem/introduction/) — the sibling engine, sharing the same EL expressions, catalog, and `QEnv`.
