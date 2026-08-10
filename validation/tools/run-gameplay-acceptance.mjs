import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const rawBaseUrl = process.argv[2] ?? "http://127.0.0.1:4174/";
const outputDirectory = path.resolve(process.argv[3] ?? "validation/automated/gameplay");
await mkdir(outputDirectory, { recursive: true });

const harnessUrl = new URL("/validation/tools/gameplay-harness.html", rawBaseUrl).toString();
const browserIssues = [];
const browser = await chromium.launch({ headless: true });
let result;

try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
  });
  page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.gameplay_acceptance_result !== undefined);
  result = await page.evaluate(() => window.gameplay_acceptance_result);
} finally {
  await browser.close();
}

const report = {
  capturedAt: new Date().toISOString(),
  harnessUrl,
  result,
  browserIssues,
};
await writeFile(
  path.join(outputDirectory, "gameplay-tests.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
const lines = [
  `Project Slash gameplay acceptance: ${result?.ok && browserIssues.length === 0 ? "PASS" : "FAIL"}`,
  `Harness: ${harnessUrl}`,
  `Fixed step: ${result?.acceptance?.fixedStepHz ?? "unknown"} Hz`,
  `Self checks: ${result?.selfCheck?.checks?.join(", ") ?? "none"}`,
  `Acceptance cases: ${result?.acceptance?.cases?.map((entry) => entry.name).join(", ") ?? "none"}`,
  `Browser issues: ${browserIssues.length}`,
];
await writeFile(path.join(outputDirectory, "gameplay-tests.txt"), `${lines.join("\n")}\n`);

console.log(JSON.stringify({ outputDirectory, ok: result?.ok === true, browserIssues }));
if (result?.ok !== true || browserIssues.length > 0) process.exitCode = 1;
