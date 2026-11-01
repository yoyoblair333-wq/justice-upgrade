// Read-only live check against the DEPLOYED contract on GenLayer studionet.
// No browser, no wallet, no API key; it never signs or sends a transaction.
//
//   cd web && npm ci && npm run live-check
//   Behind an HTTPS proxy (Node >= 22.21):  NODE_USE_ENV_PROXY=1 npm run live-check
//
// Checks, each printed as PASS/FAIL:
//   1 the code the chain returns (gen_getContractCode) hashes to the same
//     sha256 as contracts/justice_upgrade.py in THIS clone
//   2 get_rules(): the four rulings, holds_funds false
//   3 get_agreement_count() covers the recorded agreements
//   4 get_ruling("chores-1") is RESOLVED / SPLIT, as recorded in docs/live/studionet-run.json
//   5 every one of the 13 recorded transactions is FINALIZED, with execution
//     SUCCESS, or for the 4 attacks the recorded [EXPECTED] revert reason
//   6 the browser run (docs/live/browser-run.json): its agreement reads back
//     RESOLVED with the recorded ruling, and its 5 transactions are FINALIZED
// Exits 0 and prints "LIVE CHECK: PASS" only if every check passed.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import * as C from "../src/config.js";
import { gather, plain, sha256Hex, txSummary } from "../src/lib/chain.js";
import { buildEvidence } from "../src/lib/evidence.js";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(web, "..");
const rpc = process.env.JU_RPC_URL || C.RPC_URL;
const sourceFile = path.join(root, C.SOURCE_PATH);
const run = JSON.parse(await readFile(path.join(root, C.EVIDENCE_PATH), "utf8"));
const browserRun = JSON.parse(await readFile(path.join(root, "docs/live/browser-run.json"), "utf8"));
const evidence = buildEvidence(run);
const client = createClient({ chain: studionet, endpoint: rpc });
const localSource = new Uint8Array(await readFile(sourceFile));
const localSha = await sha256Hex(localSource);

console.log(`JusticeUpgrade live check (read-only)`);
console.log(`  rpc:      ${rpc}`);
console.log(`  contract: ${C.CONTRACT_ADDRESS}`);
console.log(`  explorer: https://explorer-studio.genlayer.com/address/${C.CONTRACT_ADDRESS}`);
console.log(`  source:   ${C.SOURCE_PATH} sha256 ${localSha}`);

let fails = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
};
const retry = async (fn, tries = 3) => {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
};

// gather() is the same set of reads the web page makes. Its "github" leg is
// pointed at the local file, so check 1 compares the chain with this clone.
let d;
for (let i = 1; ; i++) {
  d = await gather({ client, address: C.CONTRACT_ADDRESS, evidence, githubUrl: sourceFile, fetchSource: async () => localSource, parallel: 2 });
  const failed = [d.code, d.rules, d.count, ...d.agreements.flatMap((a) => [a.record, a.ruling]), ...d.txs].filter((x) => !x.ok);
  if (!failed.length || i >= 3) break;
  console.log(`  (retrying ${failed.length} failed read(s): ${failed[0].error})`);
  await new Promise((r) => setTimeout(r, 3000 * i));
}

check(
  "deployed code sha256 = sha256 of contracts/justice_upgrade.py",
  d.code.ok && d.code.value.digest === localSha,
  d.code.ok ? `${d.code.value.digest} (${d.code.value.bytes} bytes)` : d.code.error,
);

const rules = d.rules.ok ? d.rules.value : null;
check(
  "get_rules(): rulings PARTY_A/PARTY_B/SPLIT/INSUFFICIENT_EVIDENCE, holds_funds false",
  !!rules && rules.holds_funds === false && ["PARTY_A", "PARTY_B", "SPLIT", "INSUFFICIENT_EVIDENCE"].every((r) => (rules.rulings ?? []).includes(r)),
  rules ? `rulings ${JSON.stringify(rules.rulings)}, holds_funds ${rules.holds_funds}` : d.rules.error,
);

check(
  `get_agreement_count() >= ${evidence.agreements.length}`,
  d.count.ok && Number(d.count.value) >= evidence.agreements.length,
  d.count.ok ? String(d.count.value) : d.count.error,
);

const ch = d.agreements.find((a) => a.id === "chores-1");
const chr = ch?.ruling.ok ? ch.ruling.value : null;
check(
  `get_ruling("chores-1") = RESOLVED / ${run.ruling?.ruling ?? "SPLIT"}`,
  !!chr && chr.status === "RESOLVED" && chr.ruling === (run.ruling?.ruling ?? "SPLIT"),
  chr ? `${chr.status} / ${chr.ruling}, coerced ${chr.coerced}` : ch?.ruling.error,
);

let txOk = 0;
for (const t of evidence.transactions) {
  const s = d.txs.find((x) => x.hash === t.hash);
  const want = t.kind === "attack" ? `revert ${t.expect}` : "SUCCESS";
  const got = !s?.ok ? s?.error : t.kind === "attack" ? `revert ${s.revert}` : s.execution;
  const ok = !!s?.ok && s.status === "FINALIZED" && got === want;
  if (ok) txOk++;
  else check(`recorded tx ${t.label} (${t.hash})`, false, `want FINALIZED ${want}, got ${s?.status} ${got}`);
}
check(
  `recorded studionet run: ${txOk}/${evidence.transactions.length} txs FINALIZED as recorded (incl. ${evidence.transactions.filter((t) => t.kind === "attack").length} expected reverts)`,
  txOk === evidence.transactions.length,
);

// Browser run: agreement read-back + its 5 transactions.
try {
  const id = browserRun.agreementId;
  const ruling = plain(await retry(() => client.readContract({ address: C.CONTRACT_ADDRESS, functionName: "get_ruling", args: [id] })));
  check(
    `get_ruling("${id}") (browser run) = RESOLVED / ${browserRun.readBack.ruling.ruling}`,
    ruling?.status === "RESOLVED" && ruling?.ruling === browserRun.readBack.ruling.ruling,
    `${ruling?.status} / ${ruling?.ruling}`,
  );
  let ok = 0;
  for (const st of browserRun.steps) {
    const s = txSummary(await retry(() => client.getTransaction({ hash: st.hash })));
    if (s.status === "FINALIZED" && s.execution === "SUCCESS") ok++;
    else console.log(`      ${st.fn} ${st.hash}: ${s.status} ${s.execution}`);
  }
  check(`browser run: ${ok}/${browserRun.steps.length} txs FINALIZED with SUCCESS`, ok === browserRun.steps.length);
} catch (e) {
  check("browser run read-back", false, e?.shortMessage || e?.message || String(e));
}

if (fails) {
  console.log(`LIVE CHECK: FAIL (${fails} check(s) failed; if every read failed, studionet may be unreachable from here)`);
  process.exit(1);
}
console.log("LIVE CHECK: PASS");
