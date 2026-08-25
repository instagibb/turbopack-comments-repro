// Scans the build output for the two files' istanbul coverage maps and reports
// whether each file's `/* istanbul ignore next */` hint was honored (fnMap
// empty) or silently dropped (fnMap contains the function).
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const label = process.argv[2] ?? "";

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".js")) yield p;
  }
}

const files = { "leading-only.ts": null, "with-trailing.ts": null };
for (const p of walk(".next")) {
  const src = readFileSync(p, "utf8");
  for (const name of Object.keys(files)) {
    // The coverage map's path is relative under Turbopack and absolute under
    // webpack, so match on the filename suffix only.
    const i = src.search(new RegExp(`path:"[^"]*${name.replace(".", "\\.")}"`));
    if (i < 0) continue;
    const seg = src.slice(i, i + 700);
    files[name] = /fnMap:\{\}/.test(seg)
      ? "ignore honored (fnMap empty)"
      : "ignore NOT honored (function instrumented)";
  }
}

console.log(`\n[${label}]`);
for (const [name, result] of Object.entries(files)) {
  console.log(`  lib/${name}: ${result ?? "coverage map not found"}`);
}
