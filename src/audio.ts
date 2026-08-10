/**
 * The game deliberately uses only procedural Web Audio voices.  Keeping the
 * scheduler deterministic is important: the same kill count produces the same
 * transient family in-game and in the OfflineAudioContext evidence renderer.
 */
export interface AudioRuntime {
  resume(): Promise<void>;
  playDash(killCount: number): void;
  playFocusStart(): void;
  playChainDash(killCount: number, segmentIndex: number): void;
  playDeath(): void;
  setEnabled(enabled: boolean): void;
}

export type AudioEvidenceScenario = "dash0" | "kill1" | "kill5" | "kill20" | "death" | "ambient";

export interface AudioEvidenceSchedule {
  durationSeconds: number;
  layers: readonly string[];
  variantIds: readonly string[];
}

type AudioGraph = {
  readonly context: BaseAudioContext;
  readonly master: GainNode;
};

type KillVariant = {
  readonly id: string;
  readonly offset: number;
  readonly fleshLow: number;
  readonly fleshHigh: number;
  readonly fleshGain: number;
  readonly bodyFrom: number;
  readonly metalFrom: number;
  readonly wetDelay: number;
};

// The source voices leave enough headroom for the 20-kill stack; this makeup
// gain brings the intentional peak back into a useful game-audio range while
// the final brickwall compressor remains below -1 dBFS.
const ENABLED_MASTER_GAIN = 4;
const FLOOR_GAIN = 0.0001;

// Six deliberately different, deterministic hit families.  Their scheduling
// offsets and pitch pairs make a multi-kill read as several crossed bodies,
// rather than one louder copy of the same sound.
const KILL_VARIANTS: readonly KillVariant[] = [
  { id: "iron-drop", offset: 0, fleshLow: 140, fleshHigh: 2_850, fleshGain: 0.112, bodyFrom: 126, metalFrom: 4_100, wetDelay: 0.014 },
  { id: "wet-thrum", offset: 0.009, fleshLow: 92, fleshHigh: 2_100, fleshGain: 0.122, bodyFrom: 98, metalFrom: 3_320, wetDelay: 0.006 },
  { id: "edge-snap", offset: 0.017, fleshLow: 205, fleshHigh: 4_100, fleshGain: 0.092, bodyFrom: 148, metalFrom: 5_200, wetDelay: 0.019 },
  { id: "heavy-slice", offset: 0.027, fleshLow: 74, fleshHigh: 1_720, fleshGain: 0.132, bodyFrom: 88, metalFrom: 2_760, wetDelay: 0.011 },
  { id: "ceramic-cut", offset: 0.038, fleshLow: 260, fleshHigh: 5_600, fleshGain: 0.084, bodyFrom: 166, metalFrom: 6_100, wetDelay: 0.004 },
  { id: "low-gore", offset: 0.051, fleshLow: 62, fleshHigh: 1_480, fleshGain: 0.14, bodyFrom: 76, metalFrom: 2_380, wetDelay: 0.023 },
];

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function createNoiseBuffer(context: BaseAudioContext, seconds: number, seed: number) {
  const length = Math.ceil(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  const random = seededRandom(seed);
  let previous = 0;
  for (let index = 0; index < length; index += 1) {
    const white = random() * 2 - 1;
    previous = previous * 0.73 + white * 0.27;
    data[index] = previous;
  }
  return buffer;
}

function createGraph(context: BaseAudioContext): AudioGraph {
  const master = context.createGain();
  master.gain.value = ENABLED_MASTER_GAIN;
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -1.2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;
  master.connect(limiter).connect(context.destination);
  return { context, master };
}

function noiseBurst(
  graph: AudioGraph,
  start: number,
  duration: number,
  gainValue: number,
  lowFrequency: number,
  highFrequency: number,
  seed: number,
) {
  const { context, master } = graph;
  const source = context.createBufferSource();
  source.buffer = createNoiseBuffer(context, duration + 0.045, seed);
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(lowFrequency, start);
  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(highFrequency, start);
  const gain = context.createGain();
  gain.gain.setValueAtTime(FLOOR_GAIN, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + Math.min(0.008, duration * 0.16));
  gain.gain.exponentialRampToValueAtTime(FLOOR_GAIN, start + duration);
  source.connect(highpass).connect(lowpass).connect(gain).connect(master);
  source.start(start);
  source.stop(start + duration + 0.045);
}

function tone(
  graph: AudioGraph,
  start: number,
  from: number,
  to: number,
  duration: number,
  gainValue: number,
  type: OscillatorType,
) {
  const { context, master } = graph;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(FLOOR_GAIN, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + Math.min(0.008, duration * 0.16));
  gain.gain.exponentialRampToValueAtTime(FLOOR_GAIN, start + duration);
  oscillator.connect(gain).connect(master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function scheduleAmbient(graph: AudioGraph, start: number) {
  const { context, master } = graph;
  // Rain bed: high, diffuse and quiet enough that the blade onset stays clear.
  const rain = context.createBufferSource();
  rain.buffer = createNoiseBuffer(context, 3.7, 0x52_41_49_4e);
  rain.loop = true;
  const rainHighpass = context.createBiquadFilter();
  rainHighpass.type = "highpass";
  rainHighpass.frequency.value = 1_650;
  const rainLowpass = context.createBiquadFilter();
  rainLowpass.type = "lowpass";
  rainLowpass.frequency.value = 8_400;
  const rainGain = context.createGain();
  rainGain.gain.value = 0.031;
  rain.connect(rainHighpass).connect(rainLowpass).connect(rainGain).connect(master);
  rain.start(start);

  // City bed: sub power, electrical fundamental and a thin distant harmonic.
  const citySub = context.createOscillator();
  citySub.type = "sine";
  citySub.frequency.value = 42;
  const cityPower = context.createOscillator();
  cityPower.type = "triangle";
  cityPower.frequency.value = 84.3;
  const cityWhine = context.createOscillator();
  cityWhine.type = "sine";
  cityWhine.frequency.value = 242;
  const cityGain = context.createGain();
  cityGain.gain.value = 0.014;
  const whineGain = context.createGain();
  whineGain.gain.value = 0.0032;
  citySub.connect(cityGain);
  cityPower.connect(cityGain);
  cityGain.connect(master);
  cityWhine.connect(whineGain).connect(master);
  citySub.start(start);
  cityPower.start(start);
  cityWhine.start(start);
}

function scheduleBladeDash(graph: AudioGraph, start: number) {
  // Pre-hum resolves before the air-cut, then the descending body follows it.
  tone(graph, start, 760, 1_780, 0.036, 0.026, "sine");
  tone(graph, start + 0.005, 1_850, 430, 0.15, 0.053, "sawtooth");
  noiseBurst(graph, start + 0.018, 0.15, 0.17, 1_120, 12_400, 0x42_4c_41_44);
  tone(graph, start + 0.022, 5_600, 1_950, 0.071, 0.025, "triangle");
  // Dash body is deliberately below the metallic layer, so it reads as mass.
  tone(graph, start + 0.004, 82, 37, 0.22, 0.13, "sine");
}

function variantFor(killCount: number, index: number) {
  return KILL_VARIANTS[(killCount + index) % KILL_VARIANTS.length];
}

function scheduleKill(graph: AudioGraph, start: number, variant: KillVariant, ordinal: number) {
  const hit = start + variant.offset;
  const attenuation = 1 - Math.min(ordinal, 5) * 0.065;
  // Metal edge, flesh impact, wet blood detail, then low body mass.
  tone(graph, hit, variant.metalFrom, 980, 0.055, 0.016 * attenuation, "square");
  noiseBurst(graph, hit, 0.1, variant.fleshGain * attenuation, variant.fleshLow, variant.fleshHigh, 0x10_000 + ordinal * 97 + variant.metalFrom);
  noiseBurst(graph, hit + variant.wetDelay, 0.064, 0.042 * attenuation, 130, 1_350, 0x20_000 + ordinal * 53 + variant.bodyFrom);
  tone(graph, hit, variant.bodyFrom, 38, 0.23, 0.079 * attenuation, "triangle");
}

function scheduleCombatDash(graph: AudioGraph, start: number, killCount: number) {
  scheduleBladeDash(graph, start);
  if (killCount <= 0) return [];
  const impact = start + 0.069;
  const audibleHits = Math.min(KILL_VARIANTS.length, killCount);
  const variantIds: string[] = [];
  for (let index = 0; index < audibleHits; index += 1) {
    const variant = variantFor(killCount, index);
    variantIds.push(variant.id);
    scheduleKill(graph, impact, variant, index);
  }
  // Escalation adds density and a low confidence hit, without summing every
  // theoretical victim: twenty kills remain punchy but have headroom.
  const escalation = Math.min(1, Math.log2(killCount + 1) / Math.log2(21));
  tone(graph, impact + 0.012, 100 + escalation * 48, 34, 0.32, 0.082 + escalation * 0.05, "sine");
  if (killCount >= 4) {
    noiseBurst(graph, impact + 0.028, 0.13, 0.045 + escalation * 0.028, 48, 620, 0x30_000 + killCount);
  }
  return variantIds;
}

function scheduleFocusStart(graph: AudioGraph, start: number) {
  tone(graph, start, 190, 680, 0.24, 0.045, "sine");
  tone(graph, start + 0.035, 820, 1_640, 0.18, 0.022, "triangle");
  noiseBurst(graph, start + 0.012, 0.16, 0.028, 2_100, 8_400, 0x46_4f_43_55);
}

function scheduleChainDash(graph: AudioGraph, start: number, killCount: number, segmentIndex: number) {
  scheduleCombatDash(graph, start, killCount);
  const lift = Math.max(0, Math.min(2, segmentIndex));
  tone(graph, start, 310 + lift * 92, 94, 0.3, 0.09, "sawtooth");
  tone(graph, start + 0.012, 2_600 + lift * 620, 740, 0.19, 0.044, "triangle");
  noiseBurst(graph, start + 0.018, 0.21, 0.12, 480, 14_000, 0x43_48_41_49 + lift);
}

function scheduleDeath(graph: AudioGraph, start: number) {
  noiseBurst(graph, start, 0.39, 0.18, 62, 2_500, 0x44_45_41_44);
  tone(graph, start, 238, 31, 0.5, 0.17, "sawtooth");
  tone(graph, start + 0.045, 74, 28, 0.42, 0.11, "sine");
}

/** Schedules a complete production-equivalent scene into a browser OfflineAudioContext. */
export function scheduleAudioEvidence(
  context: OfflineAudioContext,
  scenario: AudioEvidenceScenario,
  options: { muted?: boolean } = {},
): AudioEvidenceSchedule {
  const graph = createGraph(context);
  if (options.muted) graph.master.gain.value = 0;
  scheduleAmbient(graph, 0);
  switch (scenario) {
    case "dash0":
      scheduleCombatDash(graph, 0.16, 0);
      return { durationSeconds: 1.5, layers: ["rain-bed", "city-bed", "blade-pre-hum", "air-cut", "dash-body", "metal-edge"], variantIds: [] };
    case "kill1":
      return { durationSeconds: 1.5, layers: ["rain-bed", "city-bed", "blade-pre-hum", "air-cut", "dash-body", "metal-edge", "flesh-impact", "blood-low-body"], variantIds: scheduleCombatDash(graph, 0.16, 1) };
    case "kill5":
      return { durationSeconds: 1.7, layers: ["rain-bed", "city-bed", "blade-pre-hum", "air-cut", "dash-body", "metal-edge", "flesh-impact", "blood-low-body", "multi-kill-escalation"], variantIds: scheduleCombatDash(graph, 0.16, 5) };
    case "kill20":
      return { durationSeconds: 1.9, layers: ["rain-bed", "city-bed", "blade-pre-hum", "air-cut", "dash-body", "metal-edge", "flesh-impact", "blood-low-body", "multi-kill-escalation"], variantIds: scheduleCombatDash(graph, 0.16, 20) };
    case "death":
      scheduleDeath(graph, 0.16);
      return { durationSeconds: 1.7, layers: ["rain-bed", "city-bed", "death-impact", "death-body"], variantIds: [] };
    case "ambient":
      return { durationSeconds: 2.5, layers: ["rain-bed", "city-bed"], variantIds: [] };
  }
}

export function createAudioRuntime(): AudioRuntime {
  let context: AudioContext | null = null;
  let graph: AudioGraph | null = null;
  let enabled = true;

  function initialize() {
    if (context) return;
    context = new AudioContext({ latencyHint: "interactive" });
    graph = createGraph(context);
    scheduleAmbient(graph, context.currentTime);
  }

  return {
    async resume() {
      initialize();
      if (context?.state === "suspended") await context.resume();
    },
    playDash(killCount) {
      if (!enabled || !context || !graph || context.state !== "running") return;
      scheduleCombatDash(graph, context.currentTime + 0.003, Math.max(0, Math.floor(killCount)));
    },
    playFocusStart() {
      if (!enabled || !context || !graph || context.state !== "running") return;
      scheduleFocusStart(graph, context.currentTime + 0.003);
    },
    playChainDash(killCount, segmentIndex) {
      if (!enabled || !context || !graph || context.state !== "running") return;
      scheduleChainDash(
        graph,
        context.currentTime + 0.003,
        Math.max(0, Math.floor(killCount)),
        Math.max(0, Math.floor(segmentIndex)),
      );
    },
    playDeath() {
      if (!enabled || !context || !graph || context.state !== "running") return;
      scheduleDeath(graph, context.currentTime + 0.003);
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      if (graph) graph.master.gain.setValueAtTime(enabled ? ENABLED_MASTER_GAIN : 0, graph.context.currentTime);
    },
  };
}
