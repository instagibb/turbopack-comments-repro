# Turbopack never passes comments to SWC wasm plugins unless a file has both leading AND trailing comments

Reproduction for [vercel/next.js#97866](https://github.com/vercel/next.js/issues/97866).

Minimal reproduction scaffolded from `npx create-next-app -e reproduction-template` (tracks `next@canary`; reproduced on `16.4.0-canary.51` and earlier on `16.4.0-canary.6` and `16.3.0`/`16.3.1`) with only the relevant changes added, using
[`swc-plugin-coverage-instrument`](https://www.npmjs.com/package/swc-plugin-coverage-instrument)
(the istanbul coverage plugin), whose `/* istanbul ignore next */` comment hints
depend on the plugin being able to see comments.

> Note: the plugin version must match the SWC plugin ABI of the Next.js version
> under test: `swc-plugin-coverage-instrument@0.0.33` for current canary
> (`swc_plugin_runner` 34), `0.0.32` for `16.4.0-canary.6` and `16.3.x`
> (`swc_plugin_runner` 33). A mismatch fails the build with a version-mismatch
> error instead of demonstrating the bug.

## The two files

- [`lib/leading-only.ts`](./lib/leading-only.ts) — every comment is a **leading**
  comment (JSDoc / full-line comments, i.e. a typical source file), including an
  `/* istanbul ignore next */` on the exported function.
- [`lib/with-trailing.ts`](./lib/with-trailing.ts) — byte-identical logic, same
  ignore hint, plus **one trailing comment** (`code; // comment`) on an
  unrelated line.

## Quick check

```sh
npm install
npm run check
```

This builds with Turbopack, then with webpack, inspects the emitted istanbul
coverage maps, and prints:

```
================================================================
  /* istanbul ignore next */ hint on the exported function
================================================================
  file                     Turbopack        webpack
  ----------------------------------------------------------
  lib/leading-only.ts      NOT honored      honored
  lib/with-trailing.ts     honored          honored
================================================================
  BUG REPRODUCED: Turbopack dropped the hint in the file with only
  leading comments, but honored it once a trailing comment exists.
================================================================
```

## Verify manually

The plugin writes an istanbul coverage map into each instrumented module. Its
`fnMap` lists the functions that were instrumented — if the ignore hint was
honored, the function is **absent** from `fnMap`. `app/page.tsx` is a client
component, so the maps are also available in the browser.

### In the browser (fastest)

```sh
npm run dev            # Turbopack (Next's default)
```

Open http://localhost:3000 — the page reads `__coverage__` and renders the
result directly, labelled with the bundler that built it:

```
Built by: Turbopack

file                   functions instrumented   ignore hint
lib/leading-only.ts    leadingOnly              NOT honored (dropped)
lib/with-trailing.ts   none                     honored
```

Stop it and run the same page through webpack for the control:

```sh
npm run dev:webpack    # next dev --webpack
```

```
Built by: webpack

file                   functions instrumented   ignore hint
lib/leading-only.ts    none                     honored
lib/with-trailing.ts   none                     honored
```

(Next allows one dev server per project directory, so run them one after the
other.)

To see the raw data, in the DevTools console:

```js
__coverage__["lib/leading-only.ts"].fnMap    // {0: {name: "leadingOnly", …}}  <- instrumented: hint dropped
__coverage__["lib/with-trailing.ts"].fnMap   // {}                             <- hint honored
__coverage__["lib/leading-only.ts"].f        // {0: 2}  the "ignored" function is being counted
```

In **Sources**, open the `_next/static/chunks/…` file containing `leadingOnly`
(dev chunks are unminified): `leadingOnly` starts with `cov_….f[0]++` counter
lines, `withTrailing` has none.

### From a production build

1. Build with Turbopack:

   ```sh
   npx next build
   ```

2. Find the chunk containing the modules and print each file's `fnMap`:

   ```sh
   f=$(grep -rl 'leading-only.ts' .next --include='*.js' | head -1)
   perl -ne 'while (/path:"([^"]*(?:leading-only|with-trailing)\.ts)".*?fnMap:(.*?),branchMap/g) { print "$1\n  fnMap: $2\n" }' "$f"
   ```

   Output:

   ```
   lib/leading-only.ts
     fnMap: {0:{name:"leadingOnly",decl:{...},loc:{...},line:4}}   <- instrumented: the ignore hint was dropped
   lib/with-trailing.ts
     fnMap: {}                                                       <- ignore hint honored
   ```

3. Control — `npx next build --webpack` and repeat step 2 (the path is absolute
   there, hence the `[^"]*` wildcard): both files report `fnMap: {}`.

### The toggle test

Delete the trailing comment on the last line of `lib/with-trailing.ts`, rebuild
(or just save, with the dev server running) and look again: its `fnMap` now
contains `withTrailing`. Restore the comment: `fnMap: {}` again. A comment on an
unrelated line decides whether an `istanbul ignore` hint five lines above it
works.

(`npm run inspect` runs the production-build extraction against whatever is
currently in `.next`.)

## Root cause

Turbopack only enables the plugin comments proxy when a file has *both* leading
*and* trailing comments —
[`swc_ecma_transform_plugins.rs` lines 136–141 on canary](https://github.com/vercel/next.js/blob/canary/turbopack/crates/turbopack-ecmascript-plugins/src/transform/swc_ecma_transform_plugins.rs#L136-L141):

```rust
let should_enable_comments_proxy =
    !ctx.comments.leading.is_empty() && !ctx.comments.trailing.is_empty();

//[TODO]: as same as swc/core does, we should set should_enable_comments_proxy
// depends on the src's comments availability. For now, check naively if leading
// / trailing comments are empty.
```

Since JSDoc and full-line comments are all *leading*, most real files have an
empty trailing map and fail the `&&` — the plugin receives an empty comment
store, with no error. Expected: enable the proxy when the file has *any*
comments (`||`).
