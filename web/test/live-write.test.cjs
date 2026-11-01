// LIVE WRITE tier (opt-in; needs network and signs real studionet
// transactions): the built site (web/dist) served under /justiceupgrade-app/,
// driven by Playwright exactly as a visitor would use it. The browser makes
// its two testnet burners, signs all five steps of one dispute with
// genlayer-js, follows each to FINALIZED and reads the ruling back from the
// contract. Nothing is mocked and no key leaves the browser.
//
//   npm run build && JU_WEB_WRITE=1 npm run test:live-write
//
// Writes the run (hashes, statuses, votes, read-back ruling) to
// docs/live/browser-run.json and screenshots to web/test-results/.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const DIST = path.resolve(__dirname, "../dist");
const OUT = path.resolve(__dirname, "../test-results");
const RUN_OUT = path.resolve(__dirname, "../../docs/live/browser-run.json");
const BASE = "/justiceupgrade-app/";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json" };
const RULINGS = ["PARTY_A", "PARTY_B", "SPLIT", "INSUFFICIENT_EVIDENCE"];

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

async function main() {
  if (process.env.JU_WEB_WRITE !== "1") {
    console.log("SKIP  live write test (set JU_WEB_WRITE=1 to sign real studionet transactions)");
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  assert.ok(fs.existsSync(path.join(DIST, "index.html")), "web/dist missing: run `npm run build` first");
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}${BASE}`;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: "127.0.0.1,localhost" } } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const t0 = Date.now();

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('#source[data-state="live"]', { timeout: 120_000 });
  await page.waitForFunction(() => !document.getElementById("trysubmit").disabled, null, { timeout: 60_000 });
  console.log("PASS  page is live, code pin matches, Run button enabled");

  await page.click("#trysample");
  await page.check("#c-public");
  await page.check("#c-adult");
  await page.screenshot({ path: path.join(OUT, "write-1-form.png"), fullPage: false });
  await page.click("#trysubmit");
  await page.waitForSelector('#steps [data-step="create"] a.hash', { timeout: 120_000 });
  console.log("PASS  create_agreement signed in the browser");

  await page.waitForFunction(() => ["all-finalized", "resolved", "failed"].includes(document.body.dataset.tryDone), null, { timeout: 30 * 60_000, polling: 2000 });
  const run = await page.evaluate(() => window.__juRun);
  await page.locator("#try").screenshot({ path: path.join(OUT, "write-2-done.png") });

  const record = {
    about: "Visitor flow on the built site (web/dist served locally), driven by Playwright (headless Chromium) through `JU_WEB_WRITE=1 npm run test:live-write`. Both testnet burners were generated in the browser and every transaction was signed there with genlayer-js; nothing was mocked. Party A and party B are the same browser playing both sides for the demo.",
    network: "studionet",
    rpc: "https://studio.genlayer.com/api",
    elapsedSec: Math.round((Date.now() - t0) / 1000),
    ...run,
  };
  fs.writeFileSync(RUN_OUT, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), RUN_OUT)}`);

  assert.equal(run.status, "all-finalized", `run ended ${run.status}: ${run.error ?? ""}`);
  assert.equal(run.steps.length, 5);
  for (const s of run.steps) assert.equal(s.final?.finality, "FINALIZED_SUCCESS", `${s.fn}: ${JSON.stringify(s.final)}`);
  assert.ok(RULINGS.includes(run.readBack.ruling.ruling), `ruling ${run.readBack.ruling.ruling}`);
  assert.equal(run.readBack.agreement.status, "RESOLVED");
  assert.equal(run.readBack.agreement.party_b.toLowerCase(), run.partyB.toLowerCase());
  assert.equal(await page.locator("#myruling .rword").innerText(), run.readBack.ruling.ruling);
  assert.deepEqual(errors, []);
  console.log(`PASS  5 browser-signed steps FINALIZED · SUCCESS; ruling ${run.readBack.ruling.ruling} read back (${record.elapsedSec}s)`);

  await browser.close();
  srv.close();
  console.log("LIVE WRITE: PASS");
}

main().catch((e) => {
  console.error(`LIVE WRITE: FAIL ${e.message}`);
  process.exit(1);
});
