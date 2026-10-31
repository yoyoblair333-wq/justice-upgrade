// JusticeUpgrade live read-only page. Reads the deployed contract on GenLayer
// studionet from the browser with genlayer-js. It never signs or sends a
// transaction. If the RPC cannot be reached it shows snapshot.json, a
// build-time read of the same views, labelled with the time it was taken.
//
// Every string that comes from the chain, GitHub or a JSON file is put on the
// page with text nodes only (h() below); nothing is parsed as HTML.

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import * as C from "./config.js";
import { gather, voteCounts } from "./lib/chain.js";

const $ = (id) => document.getElementById(id);
const client = createClient({ chain: studionet, endpoint: C.RPC_URL });

// ------------------------------------------------------------- utilities

/** Build an element. Children are Nodes or text; text is never parsed as HTML. */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
const fill = (id, ...kids) => $(id).replaceChildren(...kids.flat());
const text = (x) => (typeof x === "string" ? x : x === undefined || x === null ? "" : JSON.stringify(x));
const short = (s, n = 10) => {
  const t = text(s);
  return t.length > 2 * n + 1 ? `${t.slice(0, n)}…${t.slice(-8)}` : t;
};
const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? text(iso) : d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z").replace(/:\d\dZ$/, " UTC");
};

// Chip colours come from a fixed list, never from chain text.
const TONE = {
  FINALIZED: "ok", SUCCESS: "ok", RESOLVED: "ok", MAJORITY_AGREE: "ok", ACCEPTED: "info", ACTIVE: "info",
  PROPOSED: "info", DISPUTED: "warn", ERROR: "err", CANCELLED: "dim",
};
const chip = (label, tone) => h("span", { class: `chip ${tone ?? TONE[label] ?? "dim"}` }, text(label) || "–");
const VOTE_CLASS = new Set(["agree", "disagree", "idle", "timeout"]);

let evidence = null;
const nameOf = (addr) => {
  const a = text(addr).toLowerCase();
  const acct = evidence?.accounts?.find((x) => x.address.toLowerCase() === a);
  return acct ? `${acct.name} (fictional)` : "";
};
const who = (addr) => {
  const n = nameOf(addr);
  return h("span", { class: "who" }, n ? h("b", {}, n) : null, n ? " " : null, h("code", { class: "addr", title: text(addr) }, short(addr, 6)));
};
const errLine = (r, what) => h("p", { class: "errline" }, `${what} could not be read: ${text(r?.error) || "no answer"}`);

// ------------------------------------------------------------- rendering

function renderSource(src) {
  const el = $("source");
  el.dataset.state = src.kind;
  if (src.kind === "live") {
    el.textContent = `Live · read ${fmtTime(src.at)}`;
    el.title = `Read from ${C.RPC_URL} by this browser.`;
  } else if (src.kind === "snapshot") {
    el.textContent = `Snapshot · taken ${fmtTime(src.at)}`;
    el.title = `The live RPC could not be reached from this browser (${src.error}). Showing a saved read of the same contract views.`;
  } else {
    el.textContent = "Network unreachable";
    el.title = text(src.error);
  }
  const when = $("when");
  when.replaceChildren();
  if (src.kind === "snapshot") {
    when.append(h("span", { class: "snapnote", id: "snapnote" }, h("b", {}, `Saved snapshot from ${fmtTime(src.at)}.`), ` The live network could not be reached, so this is not a live read. Error: ${text(src.error)}`));
  } else if (src.kind === "error") {
    when.append(h("span", { class: "snapnote" }, `The network could not be reached and no snapshot is available. ${text(src.error)}`));
  }
}

function renderCode(d) {
  const rows = [];
  const add = (k, ...v) => rows.push(h("dt", {}, k), h("dd", {}, ...v));
  add("Contract", h("code", { class: "wrapline" }, C.CONTRACT_ADDRESS));
  add("Network", `${C.NETWORK_LABEL} · RPC `, h("code", {}, C.RPC_URL));
  if (evidence?.deployTx) add("Deploy tx", h("code", { class: "wrapline" }, evidence.deployTx));
  const chainD = d.code?.ok ? d.code.value.digest : "";
  const ghD = d.github?.ok ? d.github.value.digest : "";
  add("On-chain code sha256", d.code?.ok ? h("code", { class: "wrapline", id: "chainsha" }, chainD) : errLine(d.code, "Contract code"),
    d.code?.ok ? h("span", { class: "sub" }, `${Number(d.code.value.bytes).toLocaleString("en-US")} bytes`) : null);
  add("GitHub source sha256", d.github?.ok ? h("code", { class: "wrapline", id: "ghsha" }, ghD) : errLine(d.github, "GitHub source"),
    h("span", { class: "sub" }, h("a", { href: `${C.REPO_URL}/blob/main/${C.SOURCE_PATH}` }, `${C.SOURCE_PATH} on main`)));
  let verdict;
  if (chainD && ghD) verdict = chainD === ghD ? chip("Match: deployed code is the GitHub source", "ok") : chip("Mismatch: deployed code differs from GitHub main", "err");
  else if (chainD && evidence?.sourceSha256) verdict = h("span", {}, chainD === evidence.sourceSha256 ? chip("Matches the recorded source hash", "ok") : chip("Differs from the recorded source hash", "err"), h("span", { class: "sub" }, " GitHub could not be reached; compared with the hash recorded in the run."));
  else verdict = chip("Not checked", "dim");
  add("Result", h("span", { id: "pin" }, verdict));
  fill("code", h("dl", { class: "facts" }, rows));
}

function renderRules(d) {
  if (!d.rules?.ok) return fill("rules", errLine(d.rules, "get_rules"));
  const r = d.rules.value ?? {};
  const rows = [];
  for (const [k, v] of Object.entries(r)) {
    const val = Array.isArray(v) ? h("span", { class: "list" }, v.map((x) => h("code", {}, text(x)))) : h("code", {}, text(v));
    rows.push(h("dt", {}, h("code", {}, k)), h("dd", { class: k === "holds_funds" ? "hl" : null }, val));
  }
  const funds = r.holds_funds === false ? h("p", { class: "callout ok" }, h("b", {}, "holds_funds: false. "), "The contract holds no funds and moves no value. It records text and returns a bounded ruling.") : null;
  fill("rules", h("dl", { class: "facts rules" }, rows), funds);
}

function stmt(label, body, meta) {
  return h("div", { class: "stmt" }, h("div", { class: "lbl" }, label, meta ? h("span", { class: "meta" }, meta) : null), h("p", { class: "quote" }, text(body)));
}

function renderAgreements(d) {
  const cards = [];
  const count = d.count?.ok ? h("p", { class: "count" }, `get_agreement_count(): `, h("b", {}, text(d.count.value)), ". The page shows the agreements from the recorded run.") : errLine(d.count, "get_agreement_count");
  for (const a of d.agreements ?? []) {
    const rec = a.record?.ok ? a.record.value ?? {} : null;
    const ru = a.ruling?.ok ? a.ruling.value ?? {} : null;
    const body = [];
    if (!rec) body.push(errLine(a.record, `get_agreement("${a.id}")`));
    else {
      body.push(h("div", { class: "parties" },
        h("span", {}, "Party A ", who(rec.party_a)),
        h("span", {}, "Party B ", who(rec.party_b))));
      body.push(stmt("Terms", rec.terms, rec.created_at ? `created ${fmtTime(rec.created_at)}${rec.accepted_at ? ` · accepted ${fmtTime(rec.accepted_at)}` : ""}` : ""));
      if (rec.claim) body.push(stmt(h("span", {}, "Dispute filed by ", nameOf(rec.filed_by) || short(rec.filed_by, 6)), rec.claim, rec.filed_at ? fmtTime(rec.filed_at) : ""));
      if (rec.response) body.push(stmt("Response", rec.response, rec.responded_at ? fmtTime(rec.responded_at) : ""));
      else if (rec.claim) body.push(h("p", { class: "sub" }, `No response recorded. Response deadline ${fmtTime(rec.response_deadline)}.`));
    }
    if (!ru) body.push(errLine(a.ruling, `get_ruling("${a.id}")`));
    else if (ru.ruling) {
      body.push(h("div", { class: "ruling" },
        h("div", { class: "lbl" }, `get_ruling("${a.id}")`),
        h("div", { class: "rword" }, text(ru.ruling)),
        h("p", { class: "quote" }, text(ru.reasoning)),
        ru.resolution ? h("p", { class: "res" }, h("b", {}, "Resolution: "), text(ru.resolution)) : null,
        h("p", { class: "sub" }, `coerced: ${text(ru.coerced)}`)));
    } else body.push(h("p", { class: "sub ruling-none" }, `get_ruling("${a.id}"): no ruling yet (status ${text(ru.status)}).`));
    const status = rec?.status ?? ru?.status;
    cards.push(h("article", { class: "card", "data-agreement": a.id },
      h("header", {}, h("h3", {}, h("code", {}, a.id)), status ? chip(text(status)) : null), body));
  }
  fill("agreements", count, cards);
}

function votesEl(votes) {
  if (!votes?.length) return h("span", { class: "sub" }, "no votes");
  return h("span", { class: "votes" },
    votes.map(([addr, v]) => h("i", { class: `vd ${VOTE_CLASS.has(v) ? v : "other"}`, title: `${addr}: ${v}` })),
    h("span", { class: "vt" }, voteCounts(votes).map(([k, n]) => `${n} ${k}`).join(" · ")));
}

function liveTx(d, hash) {
  return (d.txs ?? []).find((t) => t.hash === hash);
}

function renderTxs(d) {
  const rows = [];
  for (const t of evidence.transactions.filter((x) => x.kind === "step")) {
    const lt = liveTx(d, t.hash);
    rows.push(h("li", { class: "tx", "data-hash": t.hash },
      h("div", { class: "txhead" },
        h("b", {}, t.call), t.agreement ? h("code", {}, t.agreement) : null,
        h("span", { class: "sub" }, "sent by ", nameOf(evidence.accounts.find((a) => a.key === t.sender)?.address) || t.sender)),
      h("code", { class: "wrapline hash" }, t.hash),
      lt?.ok
        ? h("div", { class: "txlive" }, chip(lt.status), chip(lt.execution), lt.result ? chip(lt.result) : null, votesEl(lt.votes))
        : errLine(lt, "Transaction")));
  }
  fill("txs", h("ol", { class: "txlist" }, rows));
}

function renderAttacks(d) {
  const cards = [];
  for (const t of evidence.transactions.filter((x) => x.kind === "attack")) {
    const lt = liveTx(d, t.hash);
    const reason = lt?.ok ? lt.revert : "";
    const same = reason && reason === t.expect;
    cards.push(h("article", { class: "card attack", "data-hash": t.hash },
      h("header", {}, h("h3", {}, t.attack.title), lt?.ok ? chip(lt.execution === "ERROR" ? "Rolled back" : lt.execution, lt.execution === "ERROR" ? "err" : "warn") : null),
      h("p", { class: "tried" }, t.attack.tried),
      lt?.ok
        ? [
            h("div", { class: "lbl" }, "Revert reason (from the leader receipt)"),
            h("p", { class: "revert" }, reason || "(none)"),
            h("p", { class: "sub" }, same ? chip("Same as the recorded expectation", "ok") : chip(`Expected: ${t.expect}`, "warn")),
            h("div", { class: "txlive" }, chip(lt.status), chip(lt.execution), votesEl(lt.votes)),
          ]
        : errLine(lt, "Transaction"),
      h("code", { class: "wrapline hash" }, t.hash)));
  }
  fill("attacks", cards);
}

function render(d, src) {
  renderSource(src);
  renderCode(d);
  renderRules(d);
  renderAgreements(d);
  renderTxs(d);
  renderAttacks(d);
}

// ------------------------------------------------------------- loading

async function loadEvidence() {
  const r = await fetch("evidence.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`evidence.json ${r.status}`);
  const j = await r.json();
  if (text(j.contract).toLowerCase() !== C.CONTRACT_ADDRESS.toLowerCase()) throw new Error("evidence.json is for another contract");
  return j;
}

async function loadSnapshot() {
  const r = await fetch("snapshot.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`no snapshot (${r.status})`);
  const j = await r.json();
  if (text(j.contract).toLowerCase() !== C.CONTRACT_ADDRESS.toLowerCase()) throw new Error("snapshot is for another contract");
  return j;
}

const fetchSource = async (u) => {
  const r = await fetch(u, { cache: "no-cache" });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
};

let busy = false;
async function load() {
  if (busy) return;
  busy = true;
  $("refresh").disabled = true;
  $("source").dataset.state = "loading";
  $("source").textContent = "Reading the network…";
  try {
    evidence ??= await loadEvidence();
    const at = new Date().toISOString();
    const d = await gather({ client, address: C.CONTRACT_ADDRESS, evidence, githubUrl: C.GITHUB_SOURCE_URL, fetchSource, parallel: C.MAX_PARALLEL });
    const reached = d.code.ok || d.rules.ok || d.count.ok;
    if (reached) render(d, { kind: "live", at });
    else {
      const why = d.rules.error || d.code.error || "RPC unreachable";
      try {
        const snap = await loadSnapshot();
        render(snap, { kind: "snapshot", at: snap.snapshotAt, error: why });
      } catch (e) {
        renderSource({ kind: "error", error: `${why}; ${e.message}` });
      }
    }
  } catch (e) {
    renderSource({ kind: "error", error: e.message });
  } finally {
    busy = false;
    $("refresh").disabled = false;
    document.body.dataset.ready = "1";
  }
}

$("refresh").addEventListener("click", load);
load();
