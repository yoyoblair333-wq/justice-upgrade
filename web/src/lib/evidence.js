// Turns docs/live/studionet-run.json (the recorded studionet run) into the
// small index the page needs: which transactions to check live, which
// agreements to read, and the fictional names of the throwaway accounts.
// The contract does not store tx hashes, so the page gets them from here.
// Used by scripts/build.mjs (writes dist/evidence.json) and the tests.

const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDR = /^0x[0-9a-fA-F]{40}$/;

/** Plain-English titles for the four expected reverts, keyed by the run's step label. */
export const ATTACKS = {
  "5.3 injection rejected": { title: "Prompt injection", tried: "Ben files a dispute that tells the arbiter what to rule." },
  "5.4 outsider rejected": { title: "Outsider", tried: "A third account, not a party to the agreement, tries to file a dispute." },
  "5.5b early resolve blocked": { title: "Early resolve", tried: "Ana tries to resolve before Ben's response window has closed." },
  "5.6 double resolve blocked": { title: "Double resolve", tried: "Ana tries to resolve chores-1 a second time." },
};

/** Fictional display names for the run's throwaway accounts. */
const NAME = { ana: "Ana", ben: "Ben", outsider: "Outsider" };

export function buildEvidence(run) {
  if (!ADDR.test(run.contractAddress ?? "")) throw new Error("studionet-run.json: bad contractAddress");
  const accounts = Object.entries(run.accounts ?? {}).map(([key, address]) => {
    if (!ADDR.test(address)) throw new Error(`studionet-run.json: bad account ${key}`);
    return { key, name: NAME[key] ?? key, address };
  });
  const transactions = [];
  const agreements = [];
  for (const t of run.transactions ?? []) {
    if (!HASH.test(t.hash ?? "")) throw new Error(`studionet-run.json: bad hash for ${t.label}`);
    const expect = typeof t.expect === "string" ? t.expect : t.label === "deploy" ? "SUCCESS" : "";
    const isAttack = expect.startsWith("[EXPECTED]");
    if (t.call === "create_agreement" && typeof t.args?.[0] === "string" && !agreements.includes(t.args[0])) agreements.push(t.args[0]);
    const recorded = t.final ?? t.decided ?? {};
    transactions.push({
      label: t.label,
      call: t.call === "deploy (constructor, no args)" ? "deploy" : t.call,
      sender: t.sender,
      hash: t.hash,
      agreement: t.call?.startsWith("deploy") ? "" : String(t.args?.[0] ?? ""),
      kind: isAttack ? "attack" : "step",
      expect,
      recorded: { status: recorded.statusName ?? "", execution: recorded.execution ?? "" },
      ...(isAttack ? { attack: ATTACKS[t.label] ?? { title: t.label, tried: "" } } : {}),
    });
  }
  return {
    source: "docs/live/studionet-run.json",
    network: run.network,
    rpc: run.rpc,
    contract: run.contractAddress,
    deployTx: run.deployTx,
    recordedAt: run.startedAt,
    sourceSha256: run.sourceSha256,
    accounts,
    agreements,
    transactions,
  };
}
