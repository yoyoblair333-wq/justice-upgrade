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
