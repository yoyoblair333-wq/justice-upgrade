// Read the live contract with the same calls the page makes (lib/chain.js
// gather) and save the result as the dated fallback the page shows when the
// RPC cannot be reached. The page labels it "Snapshot · taken <time>".
//
// Usage: node scripts/snapshot.mjs [out]   default out: snapshot/snapshot.json
// Behind an HTTPS proxy: NODE_USE_ENV_PROXY=1 node scripts/snapshot.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import * as C from "../src/config.js";
import { gather } from "../src/lib/chain.js";
import { buildEvidence } from "../src/lib/evidence.js";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(web, process.argv[2] ?? "snapshot/snapshot.json");
const run = JSON.parse(await readFile(path.join(web, "../docs/live/studionet-run.json"), "utf8"));
const evidence = buildEvidence(run);
const client = createClient({ chain: studionet, endpoint: C.RPC_URL });
const fetchSource = async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
};

let d;
for (let i = 1; ; i++) {
  d = await gather({ client, address: C.CONTRACT_ADDRESS, evidence, githubUrl: C.GITHUB_SOURCE_URL, fetchSource, parallel: 2 });
  const failed = [d.code, d.rules, d.count, ...d.agreements.flatMap((a) => [a.record, a.ruling]), ...d.txs].filter((x) => !x.ok);
  if (!failed.length) break;
  if (i >= 3) throw new Error(`snapshot incomplete after ${i} tries: ${failed.map((x) => x.error).join("; ")}`);
  await new Promise((r) => setTimeout(r, 3000 * i));
}
const snap = { snapshotAt: new Date().toISOString(), rpc: C.RPC_URL, ...d };
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(snap, null, 2) + "\n");
const pin = d.code.value.digest === d.github.value.digest ? "match" : "MISMATCH";
console.log(`snapshot: ${out} taken ${snap.snapshotAt}; code pin ${pin}; ${d.txs.length} txs; agreements ${d.agreements.map((a) => a.id).join(", ")}`);
