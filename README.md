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

## Run

```sh
npm install
npm run check
```

This builds with Turbopack, then with webpack, and inspects the emitted istanbul
coverage maps.

## Result

```
[turbopack]
  lib/leading-only.ts: ignore NOT honored (function instrumented)
  lib/with-trailing.ts: ignore honored (fnMap empty)

[webpack]
  lib/leading-only.ts: ignore honored (fnMap empty)
  lib/with-trailing.ts: ignore honored (fnMap empty)
```

Under Turbopack, the plugin sees **no comments at all** for `leading-only.ts`,
so the ignore hint silently does nothing. Adding a single trailing comment
anywhere in the file makes every comment in the file visible to the plugin.
webpack honors the hint in both files.

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
