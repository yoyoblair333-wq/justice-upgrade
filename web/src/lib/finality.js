// Two-step finality, as in the VERDICT web app: a step counts only when its
// transaction is FINALIZED *and* its execution result is SUCCESS. Unknown
// states are never success.

const PENDING_STATES = new Set(["UNINITIALIZED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACTIVATED"]);
const ACCEPTED_STATES = new Set(["ACCEPTED", "READY_TO_FINALIZE", "APPEAL_REVEALING", "APPEAL_COMMITTING"]);
const FAILED_TERMINAL = new Set(["CANCELED", "UNDETERMINED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);

export function executionOf(tx) {
  if (tx.txExecutionResultName === "FINISHED_WITH_RETURN") return "SUCCESS";
  if (tx.txExecutionResultName === "FINISHED_WITH_ERROR") return "ERROR";
  const leader = tx.consensus_data?.leader_receipt?.[0]?.execution_result;
  if (leader === "SUCCESS") return "SUCCESS";
  if (leader === "ERROR") return "ERROR";
  return "UNKNOWN";
}

export function statusNameOf(tx, numToName = {}) {
  if (typeof tx.statusName === "string") return tx.statusName;
  if (typeof tx.status_name === "string") return tx.status_name;
  if (typeof tx.status === "string") return /^\d+$/.test(tx.status) ? numToName[tx.status] ?? "UNKNOWN" : tx.status;
  if (typeof tx.status === "number") return numToName[String(tx.status)] ?? "UNKNOWN";
  return "UNKNOWN";
}

export function classifyTx(tx, numToName) {
  if (!tx) return { finality: "PENDING", chainStatus: "NOT_FOUND", execution: "UNKNOWN" };
  const name = statusNameOf(tx, numToName);
  const execution = executionOf(tx);
  if (name === "FINALIZED") return { finality: execution === "SUCCESS" ? "FINALIZED_SUCCESS" : "FINALIZED_ERROR", chainStatus: name, execution };
  if (FAILED_TERMINAL.has(name)) return { finality: "FINALIZED_ERROR", chainStatus: name, execution: execution === "SUCCESS" ? "UNKNOWN" : execution };
  if (ACCEPTED_STATES.has(name)) return { finality: "ACCEPTED", chainStatus: name, execution };
  if (PENDING_STATES.has(name)) return { finality: "PENDING", chainStatus: name, execution };
  return { finality: "PENDING", chainStatus: name, execution: "UNKNOWN" };
}

/** "agree 3, idle 2" from consensus_data.votes. */
export function voteSummary(tx) {
  const votes = tx?.consensus_data?.votes;
  if (!votes || typeof votes !== "object") return "";
  const counts = {};
  for (const v of Object.values(votes)) counts[v] = (counts[v] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
}

/** Revert reason, if the leader receipt carries one. */
export function revertReason(tx) {
  const r = tx?.consensus_data?.leader_receipt?.[0];
  const s = r?.result?.payload?.readable ?? r?.result?.payload ?? r?.error ?? tx?.result?.payload ?? "";
  return typeof s === "string" ? s.slice(0, 200) : "";
}
