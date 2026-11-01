// The live deployment this page reads. Same values as README.md and
// docs/live/studionet-run.json (the recorded studionet run).
export const NETWORK = "studionet";
export const NETWORK_LABEL = "GenLayer studionet testnet · no real value";
export const RPC_URL = "https://studio.genlayer.com/api";
export const CONTRACT_ADDRESS = "0x189247716CB87661fDae59aA5fc38eb9df1D9c9c";
export const REPO_URL = "https://github.com/yoyoblair333-wq/justiceupgrade-app";
/**
 * The contract source on GitHub (main). The page hashes it in the browser and
 * compares it with the hash of the code the chain returns (gen_getContractCode).
 * raw.githubusercontent.com allows cross-origin reads.
 */
export const SOURCE_PATH = "contracts/justice_upgrade.py";
export const GITHUB_SOURCE_URL = `https://raw.githubusercontent.com/yoyoblair333-wq/justiceupgrade-app/main/${SOURCE_PATH}`;
export const EVIDENCE_PATH = "docs/live/studionet-run.json";
/** Parallel RPC requests at most, so a page load does not hammer studionet. */
export const MAX_PARALLEL = 4;

// ------------------------------------------------------- "Try it" (write mode)
/** Two per-browser testnet burners: one signs as party A, the other as party B. */
export const BURNER_A_KEY = "ju.testnet-burner-a.v1";
export const BURNER_B_KEY = "ju.testnet-burner-b.v1";
export const MY_RUNS_KEY = "ju.my-runs.v1";
/** Response window for demo agreements (the contract allows 1–720 hours). */
export const DEMO_WINDOW_HOURS = 24;
export const POLL_MS = 3000;
export const TX_TIMEOUT_MS = 15 * 60 * 1000;
/**
 * Explorer for studionet as published in genlayer-js 1.1.8
 * (`studionet.blockExplorers.default.url`). The per-transaction path is an
 * assumption; the page also checks every transaction live over RPC.
 */
export const EXPLORER_TX = (hash) => `https://genlayer-explorer.vercel.app/transactions/${hash}`;
