// LIVE tier (optional; needs network): the built site (web/dist), served under
// /justiceupgrade-app/ exactly as on GitHub Pages, against the REAL contract on
// GenLayer studionet and the real GitHub source; nothing is mocked. Read-only: this tier never clicks Run, so
// the page never signs or sends a transaction (test/live-write.test.cjs does). The offline tier is
// test/unit.test.mjs + test/browser.test.mjs (npm test).
//
//   npm run build && npm run test:live      screenshots land in web/test-results/
//
// Needs Playwright's Chromium. Behind an HTTPS proxy the browser is pointed at
// $HTTPS_PROXY.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const DIST = path.resolve(__dirname, "../dist");
const OUT = path.resolve(__dirname, "../test-results");
const BASE = "/justiceupgrade-app/";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json" };

function serve() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (!u.pathname.startsWith(BASE)) return res.writeHead(404).end();
    const file = path.join(DIST, decodeURIComponent(u.pathname.slice(BASE.length)) || "index.html");
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

let failures = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`PASS  ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  assert.ok(fs.existsSync(path.join(DIST, "index.html")), "web/dist missing: run `npm run build` first");
  const ev = JSON.parse(fs.readFileSync(path.join(DIST, "evidence.json"), "utf8"));
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}${BASE}`;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: "127.0.0.1,localhost" } } : {});

  for (const [w, hgt] of [[375, 812], [1280, 900]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: w === 375 ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const rpc = [];
    page.on("request", (r) => {
      if (r.url().startsWith("https://studio.genlayer.com/api")) rpc.push(r.postDataJSON()?.method);
      if (r.method() !== "GET" && r.url().startsWith("https://studio.genlayer.com") && /send|sendRaw/i.test(r.postData() ?? "")) errors.push(`write call: ${r.postData()}`);
    });

    await step(`${w}px: page reads the live contract (not the snapshot)`, async () => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('#source:not([data-state="loading"])', { timeout: 120_000 });
      const st = await page.getAttribute("#source", "data-state");
      assert.equal(st, "live", `source is ${st}: ${await page.getAttribute("#source", "title")}`);
      assert.match(await page.locator("#source").innerText(), /^Live · read /);
      for (const m of ["gen_getContractCode", "gen_call", "eth_getTransactionByHash"]) assert.ok(rpc.includes(m), `no ${m}; RPC methods: ${[...new Set(rpc)].join(",")}`);
    });

    await step(`${w}px: code hash matches the GitHub source; get_rules shows holds_funds false`, async () => {
      assert.match(await page.locator("#pin").innerText(), /Match: deployed code is the GitHub source/);
      assert.equal(await page.locator("#chainsha").innerText(), await page.locator("#ghsha").innerText());
      assert.match(await page.locator("#rules").innerText(), /holds_funds\s+false/);
    });

    await step(`${w}px: recorded agreements, dispute, response and SPLIT ruling; fictional names labelled`, async () => {
      const ch = page.locator('[data-agreement="chores-1"]');
      assert.equal(await ch.locator(".rword").innerText(), "SPLIT");
      const t = await ch.innerText();
      assert.match(t, /Ana \(fictional\)/);
      assert.match(t, /Ben \(fictional\)/);
      assert.match(t, /Dispute filed by/i);
      assert.match(t, /Response/i);
      assert.equal(await page.locator('[data-agreement="project-1"]').count(), 1);
      assert.match(await page.locator(".netbar").innerText(), /GenLayer studionet testnet · no real value/);
      assert.match(await page.locator("#fictional").innerText(), /Fictional example/);
    });

    await step(`${w}px: every recorded tx is FINALIZED live with validator votes`, async () => {
      assert.equal(await page.locator("#txs .tx").count(), ev.transactions.filter((t) => t.kind === "step").length);
      assert.equal(await page.locator("#txs .errline").count(), 0, await page.locator("#txs .errline").allInnerTexts().then((x) => x.join(" | ")));
      assert.equal(await page.locator("#txs .chip", { hasText: /^FINALIZED$/ }).count(), 9);
      assert.equal(await page.locator("#txs .votes").count(), 9);
    });

    await step(`${w}px: the 4 blocked attacks show their live revert reasons, equal to the recorded ones`, async () => {
      for (const t of ev.transactions.filter((x) => x.kind === "attack")) {
        const card = page.locator(`#attacks [data-hash="${t.hash}"]`);
        assert.equal(await card.locator(".revert").innerText(), t.expect, t.attack.title);
        assert.match(await card.innerText(), /Same as the recorded expectation/);
      }
    });

    await step(`${w}px: no horizontal scroll, no page errors, no write calls`, async () => {
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      assert.ok(sw <= iw, `scrollWidth ${sw} > innerWidth ${iw}`);
      assert.deepEqual(errors, []);
    });

    await page.screenshot({ path: path.join(OUT, `live-${w}.png`), fullPage: true });
    await page.screenshot({ path: path.join(OUT, `live-${w}-top.png`) });
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await page.route("https://studio.genlayer.com/**", (r) => r.abort());
    await step("fallback: RPC blocked -> dated snapshot label", async () => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('#source[data-state="snapshot"]', { timeout: 60_000 });
      assert.match(await page.locator("#source").innerText(), /^Snapshot · taken \d{4}-\d\d-\d\d \d\d:\d\d UTC$/);
      assert.match(await page.locator("#snapnote").innerText(), /not a live read/);
    });
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log(failures ? `LIVE: ${failures} FAILED` : "LIVE: PASS");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
