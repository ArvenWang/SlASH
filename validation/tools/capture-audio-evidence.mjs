import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const suppliedBaseUrl = process.argv[2];
const outputDirectory = path.resolve(process.argv[3] ?? "validation/audio-phase1");
const scenarios = ["dash0", "kill1", "kill5", "kill20", "death", "ambient"];
const browserIssues = [];
let vite;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function startVite() {
  const port = 42_000 + (process.pid % 1_000);
  const viteBin = path.resolve("node_modules/vite/bin/vite.js");
  vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stderr.on("data", (chunk) => {
    const text = String(chunk);
    if (!text.includes("forced")) browserIssues.push({ type: "vite", text: text.trim() });
  });
  return `http://127.0.0.1:${port}/`;
}

async function waitForVite(page, baseUrl) {
  let lastError = "not attempted";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 1_000 });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Vite did not become available at ${baseUrl}: ${lastError}`);
}

await mkdir(outputDirectory, { recursive: true });
const baseUrl = suppliedBaseUrl ?? startVite();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (message) => {
  if (message.type() === "error") browserIssues.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => browserIssues.push({ type: "pageerror", text: error.message }));

try {
  await waitForVite(page, baseUrl);
  // Vite can issue its initial full-reload immediately after the first HTML
  // response.  Let that settle before an OfflineAudioContext render starts.
  await page.waitForTimeout(500);
  const renders = [];
  for (const scenario of scenarios) {
    const rendered = await page.evaluate(async ({ scenarioName }) => {
      const { scheduleAudioEvidence } = await import("/src/audio.ts");
      const sampleRate = 48_000;
      const provisionalDuration = scenarioName === "ambient" ? 2.5 : scenarioName === "kill20" ? 1.9 : scenarioName === "kill5" ? 1.7 : scenarioName === "death" ? 1.7 : 1.5;
      const context = new OfflineAudioContext(2, Math.ceil(sampleRate * provisionalDuration), sampleRate);
      const schedule = scheduleAudioEvidence(context, scenarioName);
      const buffer = await context.startRendering();
      const channelCount = buffer.numberOfChannels;
      const samples = buffer.length;
      let sumSquares = 0;
      let peak = 0;
      let ambientPeak = 0;
      let transientPeak = 0;
      const transientStart = Math.floor(sampleRate * 0.16);
      const transientEnd = Math.floor(sampleRate * 0.22);
      for (let channel = 0; channel < channelCount; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let index = 0; index < samples; index += 1) {
          const value = Math.abs(data[index]);
          peak = Math.max(peak, value);
          sumSquares += data[index] * data[index];
          if (index < transientStart) ambientPeak = Math.max(ambientPeak, value);
          if (index >= transientStart && index < transientEnd) transientPeak = Math.max(transientPeak, value);
        }
      }
      const rms = Math.sqrt(sumSquares / (samples * channelCount));
      const db = (value) => 20 * Math.log10(Math.max(value, 1e-12));
      const bytesPerSample = 2;
      const dataSize = samples * channelCount * bytesPerSample;
      const wav = new ArrayBuffer(44 + dataSize);
      const view = new DataView(wav);
      const writeText = (offset, text) => {
        for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
      };
      writeText(0, "RIFF");
      view.setUint32(4, 36 + dataSize, true);
      writeText(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, channelCount, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
      view.setUint16(32, channelCount * bytesPerSample, true);
      view.setUint16(34, 16, true);
      writeText(36, "data");
      view.setUint32(40, dataSize, true);
      let offset = 44;
      for (let index = 0; index < samples; index += 1) {
        for (let channel = 0; channel < channelCount; channel += 1) {
          const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[index]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
          offset += 2;
        }
      }
      const bytes = new Uint8Array(wav);
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      return {
        schedule,
        wavBase64: btoa(binary),
        measurements: {
          sampleRate,
          channels: channelCount,
          durationSeconds: samples / sampleRate,
          peakDbfs: db(peak),
          rmsDbfs: db(rms),
          crestDb: db(peak) - db(rms),
          ambientPeakDbfs: db(ambientPeak),
          bladeTransientPeakDbfs: db(transientPeak),
          bladeOverAmbientDb: db(transientPeak) - db(ambientPeak),
        },
      };
    }, { scenarioName: scenario });
    const wav = Buffer.from(rendered.wavBase64, "base64");
    const filename = `${scenario}.wav`;
    await writeFile(path.join(outputDirectory, filename), wav);
    const variantHash = sha256(JSON.stringify(rendered.schedule.variantIds));
    const audioHash = sha256(wav);
    const transientRequired = scenario === "dash0" || scenario.startsWith("kill");
    renders.push({
      scenario,
      file: filename,
      format: "PCM 16-bit stereo WAV",
      layers: rendered.schedule.layers,
      variantIds: rendered.schedule.variantIds,
      variantHash,
      audioSha256: audioHash,
      measurements: rendered.measurements,
      checks: {
        peakAtOrBelowMinus1Dbfs: rendered.measurements.peakDbfs <= -1,
        bladeTransientClearOfAmbient: !transientRequired || rendered.measurements.bladeOverAmbientDb >= 12,
        durationMatchesSchedule: Math.abs(rendered.measurements.durationSeconds - rendered.schedule.durationSeconds) < 0.001,
      },
    });
  }
  const allVariants = [...new Set(renders.flatMap((entry) => entry.variantIds))].sort();
  const muteValidation = await page.evaluate(async () => {
    const { scheduleAudioEvidence } = await import("/src/audio.ts");
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(2, Math.ceil(sampleRate * 1.9), sampleRate);
    scheduleAudioEvidence(context, "kill20", { muted: true });
    const buffer = await context.startRendering();
    let peak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      for (const sample of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
    }
    return { peakDbfs: 20 * Math.log10(Math.max(peak, 1e-12)), silent: peak <= 1e-9 };
  });
  const report = {
    capturedAt: new Date().toISOString(),
    method: "Real headless Chromium OfflineAudioContext render of src/audio.ts; WAV files contain the rendered PCM, not placeholders or MediaRecorder silence.",
    baseUrl,
    outputDirectory,
    muteBehavior: "AudioRuntime.setEnabled(false) sets the final master gain to zero while preserving the scheduler; no combat voice is scheduled while muted.",
    muteValidation: {
      method: "OfflineAudioContext renders a full kill20 schedule through the same final master gain after it is set to zero.",
      ...muteValidation,
    },
    variantCoverage: {
      required: 6,
      observed: allVariants.length,
      variantIds: allVariants,
      allSixCoveredByKill20: allVariants.length === 6,
    },
    renders,
    browserIssues,
  };
  await writeFile(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const failed = renders.some((entry) => Object.values(entry.checks).some((ok) => !ok));
  console.log(JSON.stringify({ outputDirectory, allVariants, failed, browserIssues }));
  if (failed || allVariants.length !== 6 || !muteValidation.silent || browserIssues.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
  if (vite) vite.kill("SIGTERM");
}
