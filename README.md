# Turbopack never passes comments to SWC wasm plugins unless a file has both leading AND trailing comments

Minimal reproduction scaffolded from `npx create-next-app -e reproduction-template` (tracks `next@canary`; reproduced on `16.4.0-canary.6` and on `16.3.0`/`16.3.1`) with only the relevant changes added, using
[`swc-plugin-coverage-instrument`](https://www.npmjs.com/package/swc-plugin-coverage-instrument)
(the istanbul coverage plugin), whose `/* istanbul ignore next */` comment hints
depend on the plugin being able to see comments.

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
honored, the function is **absent** from `fnMap`.

1. Build with Turbopack:

   ```sh
   npx next build
   ```

2. Print each file's `fnMap` from the server chunk that contains the two modules:

   ```sh
   perl -ne 'while (/path:"([^"]*(?:leading-only|with-trailing)\.ts)".*?fnMap:(.*?),branchMap/g) { print "$1\n  fnMap: $2\n" }' .next/server/chunks/ssr/*.js
   ```

   Output:

   ```
   lib/leading-only.ts
     fnMap: {0:{name:"leadingOnly",decl:{...},loc:{...},line:4}}   <- instrumented: the ignore hint was dropped
   lib/with-trailing.ts
     fnMap: {}                                                       <- ignore hint honored
   ```

3. The toggle test — delete the trailing comment on the last line of
   `lib/with-trailing.ts`, rebuild, rerun step 2: its `fnMap` now contains
   `withTrailing`. Restore the comment, rebuild: `fnMap: {}` again. A comment on
   an unrelated line decides whether an `istanbul ignore` hint five lines above
   it works.

4. Control — build with webpack and run the same extraction (the chunk is
   `.next/server/app/page.js` and the path is absolute there):

   ```sh
   npx next build --webpack
   perl -ne 'while (/path:"([^"]*(?:leading-only|with-trailing)\.ts)".*?fnMap:(.*?),branchMap/g) { print "$1\n  fnMap: $2\n" }' .next/server/app/page.js
   ```

   Both files report `fnMap: {}` — webpack honors the hint regardless.

(`npm run inspect` runs the same extraction against whatever is currently in
`.next`.)

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
