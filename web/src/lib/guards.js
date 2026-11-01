// Browser mirror of the contract's input guards (contracts/justice_upgrade.py:
// _clean_text, _clean_id, the window bounds and _CONTROL_PATTERNS). The page
// checks a visitor's text with these BEFORE signing, so an obviously bad input
// is refused for free instead of as a rolled-back transaction. The contract
// still enforces every rule itself; this is a courtesy, not the guard.
// Pure module: no DOM, usable from node tests.

export const MAX_ID_CHARS = 64;
export const MAX_TERMS_CHARS = 2000;
export const MAX_STATEMENT_CHARS = 1500;
export const MIN_WINDOW_HOURS = 1;
export const MAX_WINDOW_HOURS = 720;

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const INVISIBLE_RE = /[­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// Cc, Cf, Co, Cs except \n and \t (what _clean_text drops).
const CONTROL_CHARS_RE = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu;

// Same patterns, same order, as _CONTROL_PATTERNS in the contract.
export const CONTROL_PATTERNS = [
  String.raw`\b(ignore|disregard|forget|override|bypass)\s+(all\s+|any\s+|every\s+)?(of\s+)?(the\s+|your\s+|these\s+|those\s+)?` +
    String.raw`(previous|prior|above|earlier|preceding|system|original|fixed)\s+(instructions?|rules|prompts?|messages?|directions?)`,
  String.raw`\b(ignore|disregard)\s+(all|any|your)\s+(instructions?|prompts?|directions?)`,
  String.raw`\bsystem\s+prompt\b`,
  String.raw`\bnew\s+instructions?\s*:`,
  String.raw`\byou\s+are\s+now\s+(an?\s+|the\s+)?(\w+\s+)?(arbiter|judge|model|assistant|ai|system|bot)\b`,
  String.raw`\b(act|behave|pretend)\s+(as|like)\s+(an?\s+|the\s+)?(different\s+)?(arbiter|judge|model|assistant|ai)\b`,
  String.raw`\b(as|dear)\s+(the\s+)?(arbiter|judge|model|ai|assistant)\s*,?\s+(you\s+must|you\s+should|rule|decide|output|return|answer)\b`,
  String.raw`\b(respond|reply|answer|output|return)\s+(only\s+)?(with|in)\s+(json|the\s+following)`,
  String.raw`\bparty_[ab]\b`,
  String.raw`\binsufficient_evidence\b`,
  String.raw`[\"']\s*ruling\s*[\"']\s*:`,
  String.raw`<<<|>>>`,
  "```",
  String.raw`\[/?inst\]`,
  String.raw`</?\s*(system|assistant|user)\s*>`,
  String.raw`^\s*(system|assistant)\s*:`,
];
const CONTROL_RE = new RegExp(CONTROL_PATTERNS.map((p) => `(?:${p})`).join("|"), "im");

/** The text the contract would store, or an error message it would revert with. */
export function cleanText(raw, label, maxChars) {
  if (typeof raw !== "string") return { error: `${label} must be text` };
  let t = raw.normalize("NFKC").replace(INVISIBLE_RE, "").replace(/\r\n?/g, "\n");
  t = t.replace(CONTROL_CHARS_RE, (ch) => (ch === "\n" || ch === "\t" ? ch : "")).trim();
  if (!t) return { error: `${label} is empty` };
  // Python counts code points; so does [...t].
  if ([...t].length > maxChars) return { error: `${label} exceeds ${maxChars} characters` };
  if (CONTROL_RE.test(t)) return { error: `${label} contains instructions aimed at the arbiter` };
  return { text: t };
}

export function checkId(id) {
  if (typeof id !== "string" || !id) return "agreement_id is empty";
  if (id.length > MAX_ID_CHARS) return `agreement_id exceeds ${MAX_ID_CHARS} characters`;
  if (!ID_RE.test(id)) return "agreement_id may only use letters, digits, '-' and '_'";
  return "";
}

export function checkWindow(hours) {
  if (!Number.isInteger(hours)) return "response_window_hours must be an integer";
  if (hours < MIN_WINDOW_HOURS || hours > MAX_WINDOW_HOURS) return `response_window_hours must be between ${MIN_WINDOW_HOURS} and ${MAX_WINDOW_HOURS}`;
  return "";
}

/** A fresh agreement id for a visitor run: "web-" + 12 hex chars. */
export function newAgreementId(rand = () => crypto.getRandomValues(new Uint8Array(6))) {
  return `web-${[...rand()].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Check a whole demo form. Returns {ok, errors: {field: msg}, clean: {terms, claim, response}}. */
export function checkForm({ terms, claim, response }) {
  const errors = {};
  const clean = {};
  for (const [k, v, label, max] of [
    ["terms", terms, "terms", MAX_TERMS_CHARS],
    ["claim", claim, "statement", MAX_STATEMENT_CHARS],
    ["response", response, "statement", MAX_STATEMENT_CHARS],
  ]) {
    const r = cleanText(v, label, max);
    if (r.error) errors[k] = r.error;
    else clean[k] = r.text;
  }
  return { ok: Object.keys(errors).length === 0, errors, clean };
}
