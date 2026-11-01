// "Try it on testnet": a visitor runs one full JusticeUpgrade dispute against
// the deployed contract from this browser. Two throwaway testnet accounts are
// generated here (A and B) and sign all five transactions with genlayer-js:
//   create_agreement (A) -> accept_agreement (B) -> file_dispute (A)
//   -> respond (B) -> resolve_dispute (A, the AI ruling)
// Each step is tracked through the real transaction status (PENDING ->
// ACCEPTED -> FINALIZED) and the ruling is read back from the contract with
// get_ruling. Nothing is simulated. Both sides are played by one browser only
// so a visitor can see the whole lifecycle; in real use two people sign.

import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { transactionsStatusNumberToName } from "genlayer-js/types";
import * as C from "./config.js";
import { h } from "./lib/dom.js";
import { classifyTx, revertReason, voteSummary } from "./lib/finality.js";
import { checkForm, checkWindow, newAgreementId } from "./lib/guards.js";
import { plain } from "./lib/chain.js";

const $ = (id) => document.getElementById(id);
const read = createClient({ chain: studionet, endpoint: C.RPC_URL });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 10) => (s && s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-6)}` : s ?? "");

export const SAMPLES = [
  {
    title: "Chore swap",
    terms: "Roommates' chore agreement. A takes out the trash on Mondays and Thursdays. B does the dishes every weeknight. If one of us cannot do a turn, we text the other before 6pm and swap it for a later turn.",
    claim: "B skipped the dishes on Tuesday and Wednesday night and did not text either day, so I did them both nights after my own trash turn.",
    response: "I texted on Tuesday afternoon that I had a late shift and offered to swap for Saturday. I did forget Wednesday, and I will do two extra nights this week to make up for it.",
  },
  {
    title: "Borrowed bike",
    terms: "A lends B a bike for the weekend. B returns it by Sunday at 8pm with both tires pumped, and pays for any damage that happens while B has it.",
    claim: "The bike came back on Monday morning with a flat front tire. B has not offered to pay for the repair.",
    response: "I brought it back Sunday at 9pm, one hour late, because of the rain. The tire went flat on the ride back from a nail in the road. I offered to buy a new inner tube that same night.",
  },
  {
    title: "Group project credit",
    terms: "Group project credit for our history presentation. A writes the script and presents. B designs every slide. The title slide lists who did each part.",
    claim: "The title slide says B wrote half the script, but B only fixed two typos. The credits should say A wrote the script.",
    response: "I rewrote the conclusion and the intro hook after our practice run, which is about a third of the script. I agree half is too much and I am fine with 'script by A, edits by B'.",
  },
];

export const STEPS = [
  { key: "create", fn: "create_agreement", who: "A", label: "Create the agreement", expect: "PROPOSED" },
  { key: "accept", fn: "accept_agreement", who: "B", label: "Accept it", expect: "ACTIVE" },
  { key: "dispute", fn: "file_dispute", who: "A", label: "File a dispute", expect: "DISPUTED" },
  { key: "respond", fn: "respond", who: "B", label: "Respond", expect: "DISPUTED" },
  { key: "ruling", fn: "resolve_dispute", who: "A", label: "AI ruling", expect: "RESOLVED" },
];

// ------------------------------------------------------------- burners

function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key) ?? "null");
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  } catch {
    return value === undefined ? null : value;
  }
}

function burner(key) {
  let b = store(key);
  if (!b || typeof b.privateKey !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(b.privateKey)) {
    b = { privateKey: generatePrivateKey(), label: "testnet only, no value", network: C.NETWORK, createdAt: new Date().toISOString() };
    store(key, b);
  }
  const account = createAccount(b.privateKey);
  return { account, client: createClient({ chain: studionet, endpoint: C.RPC_URL, account }) };
}

let A = null;
let B = null;

function initBurners() {
  A = burner(C.BURNER_A_KEY);
  B = burner(C.BURNER_B_KEY);
  if (A.account.address.toLowerCase() === B.account.address.toLowerCase()) {
    try { localStorage.removeItem(C.BURNER_B_KEY); } catch { /* storage unavailable */ }
    B = burner(C.BURNER_B_KEY);
  }
  $("burners").replaceChildren(
    h("div", { class: "burner" }, h("span", { class: "lbl" }, "Party A · your browser"), h("code", { class: "wrapline", id: "addrA" }, A.account.address)),
    h("div", { class: "burner" }, h("span", { class: "lbl" }, "Party B · also your browser, for the demo"), h("code", { class: "wrapline", id: "addrB" }, B.account.address)),
    h("p", { class: "sub" }, "Two throwaway testnet accounts made in this browser and kept in its localStorage. They sign studionet transactions only and hold nothing of value. Clearing site data deletes them."),
  );
}

// ------------------------------------------------------------- tx tracking

async function send(side, fn, args) {
  const hash = await side.client.writeContract({ address: C.CONTRACT_ADDRESS, functionName: fn, args, value: 0n });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("the network returned no transaction hash");
  return hash;
}

/** Poll a tx until `until` ("ACCEPTED" or "FINAL"); onStatus sees every change. */
async function track(hash, until, onStatus) {
  const end = Date.now() + C.TX_TIMEOUT_MS;
  let last = "";
  let c = { finality: "PENDING", chainStatus: "NOT_FOUND", execution: "UNKNOWN" };
  let tx = null;
  for (;;) {
    try {
      tx = await read.getTransaction({ hash });
      c = classifyTx(tx, transactionsStatusNumberToName);
    } catch (e) {
      console.warn("getTransaction", e.message); // an RPC error is not an answer: retry
    }
    const key = `${c.chainStatus}/${c.execution}`;
    if (key !== last) {
      last = key;
      onStatus?.(c, tx);
    }
    if (c.finality === "FINALIZED_SUCCESS" || c.finality === "FINALIZED_ERROR") return { c, tx };
    if (until === "ACCEPTED" && c.finality === "ACCEPTED") {
      // Accepted with a rolled-back execution is a refusal, not a step done.
      return { c, tx };
    }
    if (Date.now() > end) return { c: { ...c, finality: "STALE" }, tx };
    await sleep(C.POLL_MS);
  }
}

async function view(functionName, args) {
  return plain(await read.readContract({ address: C.CONTRACT_ADDRESS, functionName, args }));
}

// ------------------------------------------------------------- rendering

const TONE = { FINALIZED: "ok", SUCCESS: "ok", ACCEPTED: "info", ERROR: "err", PENDING: "dim", STALE: "warn" };
const chip = (label, tone) => h("span", { class: `chip ${tone ?? TONE[label] ?? "dim"}` }, label);
const txLink = (hash) => h("a", { href: C.EXPLORER_TX(hash), target: "_blank", rel: "noopener", class: "hash" }, h("code", {}, short(hash, 10)));

function renderSteps() {
  $("steps").replaceChildren(...STEPS.map((s, i) =>
    h("li", { "data-step": s.key, class: "step" },
      h("div", { class: "stephead" }, h("span", { class: "num" }, String(i + 1)), h("b", {}, s.label), h("code", {}, s.fn), h("span", { class: "sub who" }, `signed by ${s.who}`)),
      h("div", { class: "stepstate" }, chip("Waiting", "dim")))));
}

function stepState(key, kids) {
  const li = document.querySelector(`#steps [data-step="${key}"]`);
  li.querySelector(".stepstate").replaceChildren(...kids);
}

function stepClass(key, cls) {
  const li = document.querySelector(`#steps [data-step="${key}"]`);
  li.className = `step ${cls}`;
}

function note(t) {
  $("trynote").textContent = t;
}

function log(msg, extra) {
  const li = h("li", {}, h("time", {}, new Date().toLocaleTimeString()), " ", msg);
  if (extra) li.append(" ", extra);
  $("trylog").append(li);
}

function statusKids(r, hash) {
  const kids = [chip(r.c.chainStatus === "FINALIZED" ? "FINALIZED" : r.c.finality === "ACCEPTED" ? "ACCEPTED" : r.c.finality === "STALE" ? "STALE" : r.c.chainStatus), chip(r.c.execution)];
  const v = r.tx ? voteSummary(r.tx) : "";
  if (v) kids.push(h("span", { class: "sub votes-t" }, `validators ${v}`));
  if (hash) kids.push(txLink(hash));
  return kids;
}

function renderRuling(agreement, ruling) {
  $("tryresult").replaceChildren(
    h("article", { class: "card mine", "data-agreement": agreement.id ?? "" },
      h("header", {}, h("h3", {}, "Your agreement ", h("code", {}, agreement.id ?? "")), chip(agreement.status ?? "", agreement.status === "RESOLVED" ? "ok" : "info")),
      h("div", { class: "stmt" }, h("div", { class: "lbl" }, "Terms"), h("p", { class: "quote" }, agreement.terms ?? "")),
      h("div", { class: "stmt" }, h("div", { class: "lbl" }, "Dispute (A)"), h("p", { class: "quote" }, agreement.claim ?? "")),
      h("div", { class: "stmt" }, h("div", { class: "lbl" }, "Response (B)"), h("p", { class: "quote" }, agreement.response ?? "")),
      h("div", { class: "ruling", id: "myruling" },
        h("div", { class: "lbl" }, `get_ruling("${agreement.id ?? ""}") · read back from the contract`),
        h("div", { class: "rword" }, ruling.ruling ?? ""),
        h("p", { class: "quote" }, ruling.reasoning ?? ""),
        ruling.resolution ? h("p", { class: "res" }, h("b", {}, "Resolution: "), ruling.resolution) : null,
        h("p", { class: "sub" }, "The ruling is one of PARTY_A, PARTY_B, SPLIT or INSUFFICIENT_EVIDENCE. Every validator re-judged the dispute with its own model and had to reach the same ruling."))));
}

// ------------------------------------------------------------- the run

let running = false;
let gate = { live: false, pinMatch: false, why: "Reading the network…" };
let sample = 0;
/** The current run, also exposed for the live test as window.__juRun. */
let run = null;

function refreshButton() {
  const why = !gate.live ? "Running a dispute needs the live network; it is unreachable from this browser right now."
    : !gate.pinMatch ? "Running is off: the deployed code does not match the GitHub source."
    : "";
  $("trygate").textContent = why;
  $("trygate").hidden = !why;
  $("trysubmit").disabled = !!why || running;
}

export function setGate(g) {
  gate = g;
  refreshButton();
}

function fillSample() {
  const s = SAMPLES[sample % SAMPLES.length];
  sample++;
  $("t-terms").value = s.terms;
  $("t-claim").value = s.claim;
  $("t-response").value = s.response;
  for (const k of ["terms", "claim", "response"]) $(`e-${k}`).textContent = "";
  $("trysample").textContent = `Fill in another sample (${SAMPLES[sample % SAMPLES.length].title})`;
}

function persistRun() {
  const all = store(C.MY_RUNS_KEY) ?? [];
  const i = all.findIndex((r) => r.agreementId === run.agreementId);
  if (i >= 0) all[i] = run;
  else all.push(run);
  store(C.MY_RUNS_KEY, all.slice(-20));
  window.__juRun = run;
}

async function onSubmit(ev) {
  ev.preventDefault();
  if (running) return;
  const form = { terms: $("t-terms").value, claim: $("t-claim").value, response: $("t-response").value };
  const chk = checkForm(form);
  for (const k of ["terms", "claim", "response"]) $(`e-${k}`).textContent = chk.errors[k] ? `The contract would refuse this: ${chk.errors[k]}` : "";
  if (!chk.ok) return;
  if (!$("c-public").checked || !$("c-adult").checked) {
    $("e-consent").textContent = "Tick both boxes to continue.";
    return;
  }
  $("e-consent").textContent = "";
  const winErr = checkWindow(C.DEMO_WINDOW_HOURS);
  if (winErr) throw new Error(winErr);

  running = true;
  refreshButton();
  $("trysample").disabled = true;
  $("tryresult").replaceChildren();
  $("trylog").replaceChildren();
  $("tryprogress").hidden = false;
  renderSteps();

  const id = newAgreementId();
  run = {
    agreementId: id, contract: C.CONTRACT_ADDRESS, network: C.NETWORK,
    partyA: A.account.address, partyB: B.account.address,
    startedAt: new Date().toISOString(), steps: [], status: "running",
  };
  persistRun();
  const args = {
    create: [id, B.account.address, chk.clean.terms, C.DEMO_WINDOW_HOURS],
    accept: [id],
    dispute: [id, chk.clean.claim],
    respond: [id, chk.clean.response],
    ruling: [id],
  };
  const finalWatchers = [];

  try {
    for (const s of STEPS) {
      const side = s.who === "A" ? A : B;
      stepClass(s.key, "now");
      stepState(s.key, [chip("Signing", "info")]);
      note(`Signing ${s.fn} as party ${s.who}…`);
      const hash = await send(side, s.fn, args[s.key]);
      const rec = { key: s.key, fn: s.fn, signer: s.who, from: side.account.address, hash, sentAt: new Date().toISOString(), transitions: [] };
      run.steps.push(rec);
      persistRun();
      log(`${s.fn}: sent`, txLink(hash));
      stepState(s.key, [chip("PENDING"), txLink(hash)]);
      const last = s.key === "ruling";
      note(last
        ? "The leader validator is asking its AI model for a bounded ruling. The other validators re-judge the dispute with their own models and must reach the same ruling. This usually takes one to three minutes."
        : `Waiting for the validators to accept ${s.fn}…`);
      const r = await track(hash, last ? "FINAL" : "ACCEPTED", (c) => {
        rec.transitions.push({ at: new Date().toISOString(), chainStatus: c.chainStatus, execution: c.execution });
        log(`${s.fn}: ${c.chainStatus} (${c.execution})`);
        stepState(s.key, statusKids({ c, tx: null }, hash));
      });
      rec.decided = { finality: r.c.finality, chainStatus: r.c.chainStatus, execution: r.c.execution, votes: r.tx ? voteSummary(r.tx) : "" };
      persistRun();
      if (r.c.execution === "ERROR" || r.c.finality === "FINALIZED_ERROR" || r.c.finality === "STALE") {
        const why = r.c.execution === "ERROR" ? revertReason(r.tx) : r.c.chainStatus;
        stepClass(s.key, "bad");
        stepState(s.key, statusKids(r, hash));
        throw new Error(r.c.finality === "STALE" ? `${s.fn} is still not done after 15 minutes. Check the transaction later.` : `${s.fn} was refused: ${why || r.c.chainStatus}`);
      }
      stepClass(s.key, last ? "done" : "acc");
      stepState(s.key, statusKids(r, hash));
      if (!last) {
        // Keep following this step to FINALIZED in the background.
        finalWatchers.push(track(hash, "FINAL").then((f) => {
          rec.final = { finality: f.c.finality, chainStatus: f.c.chainStatus, execution: f.c.execution, votes: f.tx ? voteSummary(f.tx) : "" };
          persistRun();
          stepClass(s.key, f.c.finality === "FINALIZED_SUCCESS" ? "done" : "bad");
          stepState(s.key, statusKids(f, hash));
          log(`${s.fn}: ${f.c.chainStatus} (${f.c.execution})`);
        }));
      } else {
        rec.final = rec.decided;
      }
    }
    const [agreement, ruling] = await Promise.all([view("get_agreement", [id]), view("get_ruling", [id])]);
    run.readBack = { agreement, ruling };
    run.status = "resolved";
    persistRun();
    renderRuling(agreement, ruling);
    note(`Ruling read back from the contract: ${ruling.ruling}. The earlier steps finish their finality window in the background.`);
    await Promise.all(finalWatchers);
    run.finishedAt = new Date().toISOString();
    run.status = run.steps.every((x) => x.final?.finality === "FINALIZED_SUCCESS") ? "all-finalized" : "resolved";
    persistRun();
    note(run.status === "all-finalized"
      ? `Done. All five transactions are FINALIZED with execution SUCCESS. Ruling: ${ruling.ruling}.`
      : `Ruling: ${ruling.ruling}. Some earlier steps did not reach FINALIZED; see their status above.`);
  } catch (e) {
    run.status = "failed";
    run.error = e.message;
    persistRun();
    note(e.message);
    log(`Stopped: ${e.message}`);
  } finally {
    running = false;
    $("trysample").disabled = false;
    refreshButton();
    document.body.dataset.tryDone = run?.status ?? "";
  }
}

export function initTry() {
  initBurners();
  renderSteps();
  $("trysample").addEventListener("click", fillSample);
  $("tryform").addEventListener("submit", (ev) => onSubmit(ev).catch((e) => note(e.message)));
  $("trysample").textContent = `Fill in a sample dispute (${SAMPLES[0].title})`;
  refreshButton();
}
