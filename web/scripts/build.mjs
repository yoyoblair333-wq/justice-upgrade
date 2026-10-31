// Build the static site into web/dist/ (served by GitHub Pages under
// /justiceupgrade-app/; every URL in the page is relative):
//   app.js          genlayer-js + page code, bundled for the browser by esbuild
//   index.html, styles.css, favicon.svg, .nojekyll
//   evidence.json   index of the recorded studionet run (docs/live/studionet-run.json):
//                   tx hashes to check live, agreement ids, fictional account names
//   snapshot.json   copy of web/snapshot/snapshot.json, the dated fallback shown
//                   only when the live RPC cannot be reached. The Pages workflow
//                   refreshes it at deploy time (npm run snapshot -- dist/snapshot.json).
import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTRACT_ADDRESS } from "../src/config.js";
import { buildEvidence } from "../src/lib/evidence.js";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(web, "..");
const dist = path.join(web, "dist");
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [path.join(web, "src/app.js")],
  outfile: path.join(dist, "app.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  sourcemap: true,
  legalComments: "linked",
  logLevel: "info",
});

for (const f of ["index.html", "styles.css", "favicon.svg"]) await copyFile(path.join(web, "src", f), path.join(dist, f));
await writeFile(path.join(dist, ".nojekyll"), "");

const run = JSON.parse(await readFile(path.join(root, "docs/live/studionet-run.json"), "utf8"));
const evidence = buildEvidence(run);
if (evidence.contract.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) throw new Error("studionet-run.json is for another contract than src/config.js");
await writeFile(path.join(dist, "evidence.json"), JSON.stringify(evidence, null, 2));
const attacks = evidence.transactions.filter((t) => t.kind === "attack").length;
console.log(`evidence.json: ${evidence.transactions.length} txs (${attacks} expected reverts), agreements ${JSON.stringify(evidence.agreements)}`);

const snap = JSON.parse(await readFile(path.join(web, "snapshot/snapshot.json"), "utf8"));
if (String(snap.contract).toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) throw new Error("snapshot/snapshot.json is for another contract");
if (Number.isNaN(Date.parse(snap.snapshotAt))) throw new Error("snapshot/snapshot.json has no snapshotAt date");
await copyFile(path.join(web, "snapshot/snapshot.json"), path.join(dist, "snapshot.json"));
console.log(`snapshot.json: taken ${snap.snapshotAt}`);
