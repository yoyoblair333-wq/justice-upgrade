// Pure helpers shared by the page (browser) and scripts/snapshot.mjs (node).
// Nothing here touches the DOM.

/** genlayer-js may decode maps as Map and ints as bigint; make plain JSON. */
export function plain(v) {
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "bigint") return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

export function b64ToBytes(b64) {
  const bin = atob(String(b64));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(bytes) {
  const buf = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const str = (x) => (typeof x === "string" ? x : x === undefined || x === null ? "" : String(x));

/**
 * The revert reason a rolled-back call left in its leader receipt: the
 * decoded payload string, or the raw result bytes after the 1-byte tag.
 */
export function revertReason(tx) {
  const r = tx?.consensus_data?.leader_receipt?.[0]?.result;
  if (!r || typeof r !== "object") return "";
  if (typeof r.payload === "string") return r.payload.slice(0, 500);
  if (typeof r.payload?.readable === "string" && r.status === "rollback") return r.payload.readable.slice(0, 500);
  if (r.status === "rollback" && typeof r.raw === "string") {
    try {
      return new TextDecoder().decode(b64ToBytes(r.raw).slice(1)).slice(0, 500);
    } catch {
      return "";
    }
  }
  return "";
}

export function executionOf(tx) {
  const e = tx?.consensus_data?.leader_receipt?.[0]?.execution_result;
  return e === "SUCCESS" || e === "ERROR" ? e : "UNKNOWN";
}

/** Status name: genlayer-js adds statusName; fall back to the raw field. */
export function statusOf(tx) {
  if (typeof tx?.statusName === "string") return tx.statusName;
  if (typeof tx?.status === "string" && !/^\d+$/.test(tx.status)) return tx.status;
  return "UNKNOWN";
}

/** Validator votes as [[address, vote], ...] strings only. */
export function votesOf(tx) {
  const v = tx?.consensus_data?.votes;
  if (!v || typeof v !== "object" || Array.isArray(v)) return [];
  return Object.entries(v).map(([a, x]) => [str(a), str(x)]);
}

const VOTE_ORDER = ["agree", "disagree", "timeout", "idle"];
const rank = (k) => (VOTE_ORDER.includes(k) ? VOTE_ORDER.indexOf(k) : VOTE_ORDER.length);

/** "3 agree · 2 idle" */
export function voteCounts(votes) {
  const c = new Map();
  for (const [, x] of votes) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1]);
}
export const voteText = (votes) => voteCounts(votes).map(([k, n]) => `${n} ${k}`).join(" · ");

/** The fields the page shows for one transaction (all strings). */
export function txSummary(tx) {
  return {
    status: statusOf(tx),
    result: str(tx?.result_name),
    execution: executionOf(tx),
    revert: revertReason(tx),
    votes: votesOf(tx),
  };
}

/** Run async jobs with at most `n` in flight; results keep input order. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

const errMsg = (e) => str(e?.shortMessage ?? e?.message ?? e).slice(0, 300);

/**
 * Read everything the page shows from the live contract.
 * `client` is a genlayer-js client; `fetchText` fetches the GitHub source.
 * Each part records its own error, so one failed call does not hide the rest.
 */
export async function gather({ client, address, evidence, githubUrl, fetchSource, parallel = 4 }) {
  const view = async (functionName, args = []) => plain(await client.readContract({ address, functionName, args }));
  const attempt = async (fn) => {
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  };
  const code = await attempt(async () => {
    const b64 = await client.request({ method: "gen_getContractCode", params: [address] });
    const bytes = b64ToBytes(b64);
    return { digest: await sha256Hex(bytes), bytes: bytes.length };
  });
  const github = await attempt(async () => {
    const bytes = await fetchSource(githubUrl);
    return { digest: await sha256Hex(bytes), bytes: bytes.length, url: githubUrl };
  });
  const rules = await attempt(() => view("get_rules"));
  const count = await attempt(() => view("get_agreement_count"));
  const agreements = await pool(evidence.agreements, parallel, async (id) => ({
    id,
    record: await attempt(() => view("get_agreement", [id])),
    ruling: await attempt(() => view("get_ruling", [id])),
  }));
  const txs = await pool(evidence.transactions, parallel, async (t) => {
    const r = await attempt(async () => txSummary(await client.getTransaction({ hash: t.hash })));
    return { hash: t.hash, ...(r.ok ? { ok: true, ...r.value } : { ok: false, error: r.error }) };
  });
  return { contract: address, code, github, rules, count, agreements, txs };
}
