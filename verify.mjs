// Usage:
//   node verify.mjs            build with Turbopack, then webpack, and report
//   node verify.mjs inspect    just inspect the current .next output
//
// For each of the two source files this finds the istanbul coverage map the
// plugin emitted and checks whether the `/* istanbul ignore next */` hint was
// honored (fnMap empty) or silently dropped (fnMap contains the function).
import { execSync } from "child_process";
import { readFileSync, readdirSync, statSync, rmSync } from "fs";
import { join } from "path";

const FILES = ["leading-only.ts", "with-trailing.ts"];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".js")) yield p;
  }
}

function inspect() {
  const results = {};
  for (const p of walk(".next")) {
    const src = readFileSync(p, "utf8");
    for (const name of FILES) {
      // Path is relative under Turbopack and absolute under webpack.
      const re = new RegExp(`path:"[^"]*${name.replace(".", "\\.")}".*?fnMap:(.*?),branchMap`);
      const m = src.match(re);
      if (m) results[name] = m[1] === "{}" ? "honored" : "NOT honored";
    }
  }
  return results;
}

function build(bundler) {
  const cmd = bundler === "webpack" ? "npx next build --webpack" : "npx next build";
  rmSync(".next", { recursive: true, force: true });
  process.stdout.write(`Building with ${bundler}... `);
  try {
    execSync(cmd, { stdio: "pipe" });
    console.log("done");
  } catch (e) {
    console.log("FAILED\n" + e.stdout + e.stderr);
    process.exit(1);
  }
  return inspect();
}

function report(rows) {
  const line = "=".repeat(64);
  console.log(`\n${line}\n  /* istanbul ignore next */ hint on the exported function\n${line}`);
  console.log(`  file                     Turbopack        webpack`);
  console.log(`  ${"-".repeat(58)}`);
  for (const name of FILES) {
    const t = rows.turbopack[name] ?? "map not found";
    const w = rows.webpack[name] ?? "map not found";
    console.log(`  lib/${name.padEnd(20)} ${t.padEnd(16)} ${w}`);
  }
  console.log(line);
  const bug = rows.turbopack["leading-only.ts"] === "NOT honored" && rows.turbopack["with-trailing.ts"] === "honored";
  console.log(bug
    ? "  BUG REPRODUCED: Turbopack dropped the hint in the file with only\n  leading comments, but honored it once a trailing comment exists."
    : "  Bug NOT reproduced with this Next.js version.");
  console.log(line + "\n");
}

if (process.argv[2] === "inspect") {
  for (const [name, r] of Object.entries(inspect())) console.log(`lib/${name}: ${r}`);
} else {
  report({ turbopack: build("turbopack"), webpack: build("webpack") });
}
