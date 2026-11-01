// BROWSER web tier (offline): the built site (web/dist served under
// /justiceupgrade-app/ as on GitHub Pages) in Chromium with EVERY non-local
// request blocked, so the page has to fall back to the dated snapshot. A
// hostile snapshot checks that chain text is rendered as text only.
//   npm ci && npx playwright install chromium && npm run build && npm run test:browser
// On Linux, Chromium also needs its OS libraries:
//   npx playwright install --with-deps chromium   (uses sudo apt-get)
// CI runs this tier in the "web" job. The node-only tier is test/unit.test.mjs.

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { test, before, after } from "node:test";
import { fileURLToPath } from "node:url";
import pw from "playwright";
import { buildEvidence } from "../src/lib/evidence.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(here, "..");
const DIST = path.join(WEB, "dist");
const ROOT = path.resolve(WEB, "..");
const BASE = "/justiceupgrade-app/";
const OUT = path.join(WEB, "test-results");
const run = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/live/studionet-run.json"), "utf8"));
const SNAP = JSON.parse(fs.readFileSync(path.join(WEB, "snapshot/snapshot.json"), "utf8"));


let srv;
let browser;
let url;
before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, "index.html")), "web/dist missing: run `npm run build` first");
  const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json" };
  srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (!u.pathname.startsWith(BASE)) return res.writeHead(404).end();
    const file = path.join(DIST, decodeURIComponent(u.pathname.slice(BASE.length)) || "index.html");
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${srv.address().port}${BASE}`;
  browser = await pw.chromium.launch();
  fs.mkdirSync(OUT, { recursive: true });
});
after(async () => {
  await browser?.close();
  srv?.close();
});

/** Open the page with no network: only the local server answers. */
async function offlinePage({ width = 375, snapshot, external } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 812 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  external = external ?? [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => {
    errors.push(`dialog opened (${d.message()})`);
    d.dismiss();
  });
  await ctx.route((u) => !u.href.startsWith(url), (r) => {
    external.push(r.request().url());
    r.abort();
  });
  if (snapshot === null) await page.route(`**${BASE}snapshot.json`, (r) => r.fulfill({ status: 404, body: "" }));
  else if (snapshot) await page.route(`**${BASE}snapshot.json`, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('#source:not([data-state="loading"])', { timeout: 60_000 });
  return { ctx, page, errors, external };
}

for (const width of [375, 1280]) {
  test(`browser (offline, ${width}px): RPC blocked -> dated snapshot with every section, clear labels, no horizontal scroll`, async () => {
    const { ctx, page, errors, external } = await offlinePage({ width });
    assert.equal(await page.getAttribute("#source", "data-state"), "snapshot");
    assert.ok(external.some((u) => u.startsWith("https://studio.genlayer.com/api")), "the page never tried the live RPC");
    const date = SNAP.snapshotAt.slice(0, 10);
    assert.match(await page.locator("#source").innerText(), new RegExp(`^Snapshot · taken ${date} \\d\\d:\\d\\d UTC$`));
    assert.match(await page.locator("#snapnote").innerText(), new RegExp(`Saved snapshot from ${date}.*not a live read`));
    assert.match(await page.locator(".netbar").innerText(), /GenLayer studionet testnet · no real value/);
    assert.match(await page.locator("#fictional").innerText(), /Fictional example\. Ana and Ben are made-up names/);
    // code pin
    assert.match(await page.locator("#pin").innerText(), /Match: deployed code is the GitHub source/);
    assert.equal(await page.locator("#chainsha").innerText(), run.sourceSha256);
    // rules
    assert.match(await page.locator("#rules").innerText(), /holds_funds\s+false/);
    // agreements + ruling, party names marked fictional
    const ch = page.locator('[data-agreement="chores-1"]');
    assert.equal(await ch.locator(".rword").innerText(), "SPLIT");
    assert.match(await ch.innerText(), /Party A Ana \(fictional\)/);
    assert.match(await ch.innerText(), /Party B Ben \(fictional\)/);
    assert.match(await page.locator('[data-agreement="project-1"]').innerText(), /no ruling yet \(status DISPUTED\)/);
    // transactions and votes
    assert.equal(await page.locator("#txs .tx").count(), 9);
    assert.equal(await page.locator("#txs .tx .chip", { hasText: /^FINALIZED$/ }).count(), 9);
    assert.equal(await page.locator("#txs .tx .votes").count(), 9);
    assert.ok((await page.locator("#txs .vd").count()) >= 9 * 4, "validator votes missing");
    // attacks
    const atk = page.locator("#attacks .attack");
    assert.equal(await atk.count(), 4);
    const ev = buildEvidence(run).transactions.filter((t) => t.kind === "attack");
    for (const t of ev) {
      const card = page.locator(`#attacks [data-hash="${t.hash}"]`);
      assert.equal(await card.locator(".revert").innerText(), t.expect);
      assert.match(await card.innerText(), /Same as the recorded expectation/);
    }
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    assert.ok(sw <= iw, `horizontal scroll: scrollWidth ${sw} > innerWidth ${iw}`);
    await page.screenshot({ path: path.join(OUT, `offline-${width}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

const IMG = `<img src=x onerror="window.__xss=1;alert(1)">`;
const SCRIPT = `<script>window.__xss=2</script><svg onload="window.__xss=3">`;
const LINK = `<a href="javascript:window.__xss=4">click</a>`;
function hostile() {
  const s = structuredClone(SNAP);
  s.snapshotAt = "2026-10-31T23:00:00Z";
  s.rules.value = { ...s.rules.value, [`k${IMG}`]: IMG, rulings: [IMG, SCRIPT] };
  s.github = { ok: false, error: `boom ${IMG}` };
  s.count.value = IMG;
  const ch = s.agreements.find((a) => a.id === "chores-1");
  Object.assign(ch.record.value, { terms: `Terms ${IMG}`, claim: SCRIPT, response: LINK, party_a: `0x${"1".repeat(40)}${IMG}`, filed_by: IMG, status: IMG, created_at: IMG });
  Object.assign(ch.ruling.value, { ruling: `<b>PARTY_A</b>${IMG}`, reasoning: SCRIPT, resolution: LINK, coerced: IMG });
  for (const t of s.txs) {
    t.status = IMG;
    t.result = SCRIPT;
    t.votes = [[IMG, `agree" onmouseover="window.__xss=5`], ["0xabc", "agree"]];
    if (t.revert) t.revert = `${t.revert} ${IMG}`;
  }
  const p1 = s.agreements.find((a) => a.id === "project-1");
  p1.record = { ok: false, error: `rpc says ${SCRIPT}` };
  return s;
}

test("browser (offline): hostile chain strings render as text, never as HTML", async () => {
  const { ctx, page, errors } = await offlinePage({ snapshot: hostile() });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__xss), undefined, "injected script ran");
  const injected = await page.locator(".wrap img, .wrap script, .wrap svg, .wrap iframe, .wrap a[href^='javascript'], [onmouseover], [onerror], [onload]").count();
  assert.equal(injected, 0, "chain text became elements");
  assert.equal(await page.locator(".rword b").count(), 0);
  const ch = await page.locator('[data-agreement="chores-1"]').textContent();
  assert.ok(ch.includes(`Terms ${IMG}`), "hostile terms not shown literally");
  assert.ok(ch.includes("<script>window.__xss=2</script>"), "script text not shown literally");
  assert.ok(ch.includes(`<b>PARTY_A</b>${IMG}`), "hostile ruling not shown literally");
  assert.ok((await page.locator("#code").textContent()).includes(`boom ${IMG}`));
  assert.ok((await page.locator("#rules").textContent()).includes(`k${IMG}`));
  assert.ok((await page.locator('[data-agreement="project-1"]').textContent()).includes(`rpc says ${SCRIPT}`));
  assert.ok((await page.locator("#attacks").textContent()).includes(IMG));
  // a hostile vote string never reaches a class name or attribute other than title
  assert.equal(await page.locator(".vd.other").count(), 13);
  assert.match(await page.locator("#source").innerText(), /^Snapshot · taken 2026-10-31 23:00 UTC$/);
  await page.screenshot({ path: path.join(OUT, "offline-hostile-375.png"), fullPage: true });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (offline): Try it section shows two distinct burners, fills samples, and stays disabled without the live network", async () => {
  const { ctx, page, errors, external } = await offlinePage({ width: 375 });
  const a = await page.locator("#addrA").innerText();
  const b = await page.locator("#addrB").innerText();
  assert.match(a, /^0x[0-9a-fA-F]{40}$/);
  assert.match(b, /^0x[0-9a-fA-F]{40}$/);
  assert.notEqual(a.toLowerCase(), b.toLowerCase());
  assert.equal(await page.locator("#trysubmit").isDisabled(), true);
  assert.match(await page.locator("#trygate").innerText(), /needs the live network/);
  await page.click("#trysample");
  assert.match(await page.locator("#t-terms").inputValue(), /chore agreement/);
  assert.ok((await page.locator("#t-claim").inputValue()).length > 20);
  assert.ok((await page.locator("#t-response").inputValue()).length > 20);
  assert.match(await page.locator("#trysample").innerText(), /another sample \(Borrowed bike\)/);
  // burners persist across a reload
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#addrA");
  assert.equal(await page.locator("#addrA").innerText(), a);
  assert.ok(!external.some((u) => /send/i.test(u)), "a write was attempted");
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `horizontal scroll: ${sw} > ${iw}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("browser (offline): no RPC and no snapshot -> says the network is unreachable", async () => {
  const { ctx, page, errors } = await offlinePage({ snapshot: null });
  assert.equal(await page.getAttribute("#source", "data-state"), "error");
  assert.match(await page.locator("#source").innerText(), /Network unreachable/);
  assert.match(await page.locator("#when").innerText(), /no snapshot is available/);
  assert.deepEqual(errors, []);
  await ctx.close();
});
