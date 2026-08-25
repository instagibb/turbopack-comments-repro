"use client";

import { useEffect, useState } from "react";
import { leadingOnly } from "../lib/leading-only";
import { withTrailing } from "../lib/with-trailing";

const FILES = ["lib/leading-only.ts", "lib/with-trailing.ts"];

type Row = { file: string; instrumented: string[]; honored: boolean };

export default function Home() {
  const [rows, setRows] = useState<Row[]>([]);
  const [bundler, setBundler] = useState("");

  useEffect(() => {
    // Turbopack chunks register on globalThis.TURBOPACK; webpack uses webpackChunk_N_E.
    setBundler("TURBOPACK" in globalThis ? "Turbopack" : "webpack");
    // swc-plugin-coverage-instrument stores each file's istanbul coverage map here.
    const coverage = (globalThis as any).__coverage__ ?? {};
    setRows(
      FILES.map((file) => {
        const fnMap = coverage[file]?.fnMap ?? {};
        const instrumented = Object.values(fnMap).map((f: any) => f.name);
        return { file, instrumented, honored: instrumented.length === 0 };
      }),
    );
  }, []);

  return (
    <main style={{ fontFamily: "monospace", padding: 24 }}>
      <h1 style={{ fontSize: 18 }}>Built by: {bundler}</h1>
      <p>
        Both files mark their exported function with{" "}
        <code>/* istanbul ignore next */</code>. Only one of them also contains a
        trailing comment.
      </p>
      <table cellPadding={8} style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th>file</th>
            <th>functions instrumented</th>
            <th>ignore hint</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.file} style={{ background: r.honored ? "#dfd" : "#fdd" }}>
              <td>{r.file}</td>
              <td>{r.instrumented.join(", ") || "none"}</td>
              <td>{r.honored ? "honored" : "NOT honored (dropped)"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p hidden>
        {leadingOnly()} {withTrailing()}
      </p>
    </main>
  );
}
