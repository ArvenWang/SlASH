/**
 * Project Slash gameplay core.
 *
 * This module deliberately has no renderer, DOM, audio, or Three.js dependency.
 * Every value in GameState is JSON-safe so that replays, automated tests, and a
 * visual renderer can all consume the same deterministic simulation state.
 */
import { createEnemyEntityId } from "../core/ids";
import { copyVec2, squaredDistance, vec2 } from "../core/math/vec2";
import { enemyDefinitions } from "../content/enemies/definitions";
import {
  LEVEL_DEFINITIONS,
  levelByIndex,
  type LevelDefinition,
} from "../content/levels/definitions";
import {
  segmentIntersectsCircle,
} from "./collision/shapes";
import type {
  ArenaBounds,
  DashRequestResult,
  GameInput,
  GameRules,
  GameSnapshot,
  GameState,
  GameplayAcceptanceCase,
  GameplayAcceptanceCheckResult,
  GameplaySelfCheckResult,
  PlayerAction,
  StageDefinition,
  Vec2,
} from "./domain/types";
import { moveEnemiesWithBehaviors } from "./simulation/enemy-behavior";

export type {
  ArenaBounds,
  DashRequestResult,
  EnemyState,
  GameEvent,
  GameInput,
  GamePhase,
  GameRules,
  GameSnapshot,
  GameState,
  GameplayAcceptanceCase,
  GameplayAcceptanceCheckResult,
  GameplaySelfCheckResult,
  PlayerAction,
  StageDefinition,
  Vec2,
} from "./domain/types";
export { distanceSquaredPointToSegment, segmentIntersectsCircle } from "./collision/shapes";

// The real-time renderer normally advances without a control payload. Reusing
// this immutable object avoids creating one short-lived object every frame.
const EMPTY_GAME_INPUT: Readonly<GameInput> = Object.freeze({});

export const GAME_STATE_VERSION = 2 as const;
export const FIXED_STEP_MS = 1000 / 120;
export const MAX_FRAME_DELTA_MS = 250;
export const PLAYER_RADIUS = 0.45;
export const ENEMY_RADIUS = 0.55;
export const DASH_HIT_RADIUS = PLAYER_RADIUS;
export const MIN_DASH_RECOVERY_MS = 80;
export const MAX_DASH_RECOVERY_MS = 180;
export const DASH_RECOVERY_MS = 120;
export const MIN_DASH_DURATION_MS = 35;
export const MAX_DASH_DURATION_MS = 110;
export const DASH_SPEED_UNITS_PER_SECOND = 330;
export const DEFAULT_RUN_SEED = 0x534c4153;

const EPSILON = 1e-8;

function point(x: number, z: number): Vec2 {
  return vec2(x, z);
}

function copyPoint(value: Vec2): Vec2 {
  return copyVec2(value);
}

function copyArena(value: ArenaBounds): ArenaBounds {
  return {
    minX: value.minX,
    maxX: value.maxX,
    minZ: value.minZ,
    maxZ: value.maxZ,
  };
}

function normalizeRules(rules: Partial<GameRules> = {}): GameRules {
  const requestedRecovery = finiteOr(rules.recoveryMs ?? DASH_RECOVERY_MS, DASH_RECOVERY_MS);
  return {
    recoveryMs: Math.min(
      MAX_DASH_RECOVERY_MS,
      Math.max(MIN_DASH_RECOVERY_MS, requestedRecovery),
    ),
  };
}

function phaseOneSpawns(level: LevelDefinition) {
  return level.encounters.flatMap((encounter) => (
    encounter.waves.flatMap((wave) => wave.spawns)
  ));
}

/** Compatibility adapter for existing tools. New code consumes LEVEL_DEFINITIONS. */
export const STAGE_DEFINITIONS: readonly StageDefinition[] = LEVEL_DEFINITIONS.map((level) => {
  const encounter = level.encounters[0];
  if (!encounter) throw new Error(`Level ${level.id} has no encounter.`);
  const spawns = phaseOneSpawns(level);
  return {
    id: level.id,
    name: level.name,
    index: level.index,
    enemyCount: spawns.length,
    enemySpeed: encounter.enemyMoveSpeed,
    arena: copyArena(level.arena),
    playerSpawn: copyPoint(level.playerSpawn),
    enemySpawns: spawns.map((spawn) => copyPoint(spawn.position)),
  };
});

function assertStageDefinitions(): void {
  const expectedCounts = [8, 12, 18];
  STAGE_DEFINITIONS.forEach((stage, index) => {
    if (
      stage.index !== index ||
      stage.enemyCount !== expectedCounts[index] ||
      stage.enemySpawns.length !== expectedCounts[index]
    ) {
      throw new Error(`Invalid stage definition at index ${index}.`);
    }
  });
}

assertStageDefinitions();

/** Returns defensive copies so tools/editors cannot mutate live definitions. */
export function createStages(): StageDefinition[] {
  return STAGE_DEFINITIONS.map((stage) => ({
    ...stage,
    arena: copyArena(stage.arena),
    playerSpawn: copyPoint(stage.playerSpawn),
    enemySpawns: stage.enemySpawns.map(copyPoint),
  }));
}

/** Creates a fresh, deterministic, serializable game state. */
export function createGame(stageIndex = 0, rules: Partial<GameRules> = {}): GameState {
  const level = levelByIndex(stageIndex);
  const encounter = level.encounters[0];
  if (!encounter) throw new Error(`Level ${level.id} has no encounter.`);
  const spawns = phaseOneSpawns(level);
  return {
    version: GAME_STATE_VERSION,
    run: {
      seed: DEFAULT_RUN_SEED,
      selectedUpgrades: [],
      acquiredResources: {},
    },
    stage: {
      index: stageIndex,
      levelId: level.id,
      name: level.name,
      phase: "playing",
      attempt: 1,
      arena: copyArena(level.arena),
      encounterId: encounter.id,
    },
    tick: 0,
    elapsedMs: 0,
    accumulatorMs: 0,
    rules: normalizeRules(rules),
    player: {
      position: copyPoint(level.playerSpawn),
      facing: point(0, -1),
      radius: PLAYER_RADIUS,
      hp: 1,
      dash: null,
      recoveryRemainingMs: 0,
      bufferedDashTarget: null,
    },
    enemies: spawns.map((spawn, index) => {
      const definition = enemyDefinitions.get(spawn.enemyDefinitionId);
      return {
        id: createEnemyEntityId(stageIndex, index + 1),
        definitionId: definition.id,
        position: copyPoint(spawn.position),
        facing: copyPoint(spawn.facing ?? point(0, -1)),
        radius: definition.radius,
        speed: encounter.enemyMoveSpeed,
        alive: true,
        state: "active" as const,
        spawnedAtMs: 0,
        killedAtMs: null,
      };
    }),
    projectiles: [],
    obstacles: [],
    hazards: [],
    combat: {
      kills: 0,
      totalEnemies: spawns.length,
    },
    lastEvents: [
      {
        type: "stage-started",
        atMs: 0,
        stageIndex,
      },
    ],
  };
}

/** Validation-only worst-case state: 20 renderable enemies with an authored
 * eight-target line and the remaining hostiles distributed across the arena. */
export function createStressGame(enemyCount = 20, rules: Partial<GameRules> = {}): GameState {
  const state = createGame(2, rules);
  const safeCount = Math.min(40, Math.max(8, Math.round(finiteOr(enemyCount, 20))));
  const firstRowX = [-16, -12, -8, -4, 4, 8, 12, 16];
  const positions: Vec2[] = firstRowX.map((x) => point(x, -8));
  for (let index = positions.length; index < safeCount; index += 1) {
    const column = (index - 8) % 6;
    const row = Math.floor((index - 8) / 6);
    positions.push(point(-15 + column * 6, row % 2 === 0 ? 2.5 : 8));
  }
  state.stage.levelId = "validation-redline-stress";
  state.stage.name = "REDLINE STRESS";
  state.player.position = point(-19, -8);
  state.player.facing = point(1, 0);
  state.enemies = positions.map((position, index) => ({
    id: `stress-enemy-${String(index + 1).padStart(2, "0")}`,
    definitionId: enemyDefinitions.get("enemy-grunt-v1").id,
    position,
    facing: point(1, 0),
    radius: ENEMY_RADIUS,
    speed: 0,
    alive: true,
    state: "active",
    spawnedAtMs: 0,
    killedAtMs: null,
  }));
  state.combat.totalEnemies = safeCount;
  state.combat.kills = 0;
  return state;
}

/** Mutates the supplied state in place, preserving references held by a renderer. */
export function restartStage(state: GameState): GameState {
  const nextAttempt = state.stage.attempt + 1;
  const replacement = createGame(state.stage.index, state.rules);
  replacement.run = {
    seed: state.run.seed,
    selectedUpgrades: [...state.run.selectedUpgrades],
    acquiredResources: { ...state.run.acquiredResources },
  };
  replacement.stage.attempt = nextAttempt;
  replacement.lastEvents = [
    {
      type: "stage-restarted",
      atMs: 0,
      stageIndex: replacement.stage.index,
      attempt: nextAttempt,
    },
  ];
  Object.assign(state, replacement);
  return state;
}

/** Starts the next stage after a clear. The final stage resolves to game-complete. */
export function advanceStage(state: GameState): GameState {
  if (state.stage.phase !== "stage-cleared") {
    return state;
  }

  const nextIndex = state.stage.index + 1;
  if (nextIndex >= STAGE_DEFINITIONS.length) {
    state.stage.phase = "game-complete";
    return state;
  }

  const replacement = createGame(nextIndex, state.rules);
  replacement.run = {
    seed: state.run.seed,
    selectedUpgrades: [...state.run.selectedUpgrades],
    acquiredResources: { ...state.run.acquiredResources },
  };
  Object.assign(state, replacement);
  return state;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function clampPointToArena(
  target: Vec2,
  arena: ArenaBounds,
  margin = 0,
): Vec2 {
  const safeMargin = Math.max(0, finiteOr(margin, 0));
  const minX = Math.min(arena.maxX, arena.minX + safeMargin);
  const maxX = Math.max(arena.minX, arena.maxX - safeMargin);
  const minZ = Math.min(arena.maxZ, arena.minZ + safeMargin);
  const maxZ = Math.max(arena.minZ, arena.maxZ - safeMargin);
  const x = finiteOr(target.x, (arena.minX + arena.maxX) * 0.5);
  const z = finiteOr(target.z, (arena.minZ + arena.maxZ) * 0.5);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    z: Math.min(maxZ, Math.max(minZ, z)),
  };
}

export function getDashDurationMs(from: Vec2, to: Vec2): number {
  const distance = Math.sqrt(squaredDistance(from, to));
  const duration = (distance / DASH_SPEED_UNITS_PER_SECOND) * 1000;
  return Math.min(
    MAX_DASH_DURATION_MS,
    Math.max(MIN_DASH_DURATION_MS, duration),
  );
}

function startDash(state: GameState, target: Vec2): void {
  const from = copyPoint(state.player.position);
  const to = clampPointToArena(target, state.stage.arena, state.player.radius);
  const directionX = to.x - from.x;
  const directionZ = to.z - from.z;
  const directionLength = Math.hypot(directionX, directionZ);

  if (directionLength > EPSILON) {
    state.player.facing = {
      x: directionX / directionLength,
      z: directionZ / directionLength,
    };
  }

  state.player.dash = {
    from,
    to,
    durationMs: getDashDurationMs(from, to),
    elapsedMs: 0,
  };
  state.player.recoveryRemainingMs = 0;
  state.player.bufferedDashTarget = null;
  state.lastEvents.push({
    type: "dash-started",
    atMs: state.elapsedMs,
    from: copyPoint(from),
    to: copyPoint(to),
    durationMs: state.player.dash.durationMs,
  });
}

/**
 * Queues a click/tap. A ready player starts immediately; otherwise only the
 * newest target is retained and fires as soon as the configured recovery expires.
 */
export function queueDash(state: GameState, target: Vec2): DashRequestResult {
  if (state.stage.phase !== "playing" || state.player.hp === 0) {
    return "ignored";
  }

  const clampedTarget = clampPointToArena(
    target,
    state.stage.arena,
    state.player.radius,
  );
  if (
    state.player.dash === null &&
    state.player.recoveryRemainingMs <= EPSILON
  ) {
    startDash(state, clampedTarget);
    return "started";
  }

  state.player.bufferedDashTarget = clampedTarget;
  return "buffered";
}

export function isPlayerInvulnerable(state: GameState): boolean {
  return state.player.hp === 1 && state.player.dash !== null;
}

export function getPlayerAction(state: GameState): PlayerAction {
  if (state.player.hp === 0) {
    return "dead";
  }
  if (state.player.dash !== null) {
    return "dashing";
  }
  if (state.player.recoveryRemainingMs > EPSILON) {
    return "recovering";
  }
  return "ready";
}

function killEnemiesAlongSegment(
  state: GameState,
  segmentStart: Vec2,
  segmentEnd: Vec2,
): void {
  for (const enemy of state.enemies) {
    if (
      !enemy.alive ||
      !segmentIntersectsCircle(
        segmentStart,
        segmentEnd,
        enemy.position,
        DASH_HIT_RADIUS + enemy.radius,
      )
    ) {
      continue;
    }

    enemy.alive = false;
    enemy.state = "dead";
    enemy.killedAtMs = state.elapsedMs;
    state.combat.kills += 1;
    state.lastEvents.push({
      type: "enemy-killed",
      atMs: state.elapsedMs,
      enemyId: enemy.id,
      position: copyPoint(enemy.position),
    });
  }
}

function completeDash(state: GameState): void {
  const dash = state.player.dash;
  if (dash === null) {
    return;
  }
  state.player.position = copyPoint(dash.to);
  state.player.dash = null;
  state.player.recoveryRemainingMs = state.rules.recoveryMs;
  state.lastEvents.push({
    type: "dash-ended",
    atMs: state.elapsedMs,
    position: copyPoint(state.player.position),
  });
}

function advancePlayerAction(state: GameState, deltaMs: number): void {
  let remainingMs = deltaMs;

  while (remainingMs > EPSILON) {
    const dash = state.player.dash;
    if (dash !== null) {
      const availableMs = Math.max(0, dash.durationMs - dash.elapsedMs);
      const sliceMs = Math.min(remainingMs, availableMs);
      const segmentStart = copyPoint(state.player.position);
      dash.elapsedMs = Math.min(dash.durationMs, dash.elapsedMs + sliceMs);
      const progress =
        dash.durationMs <= EPSILON ? 1 : dash.elapsedMs / dash.durationMs;
      state.player.position = {
        x: dash.from.x + (dash.to.x - dash.from.x) * progress,
        z: dash.from.z + (dash.to.z - dash.from.z) * progress,
      };
      killEnemiesAlongSegment(state, segmentStart, state.player.position);
      remainingMs -= sliceMs;

      if (dash.elapsedMs + EPSILON >= dash.durationMs) {
        completeDash(state);
        continue;
      }
      break;
    }

    if (state.player.recoveryRemainingMs > EPSILON) {
      const sliceMs = Math.min(
        remainingMs,
        state.player.recoveryRemainingMs,
      );
      state.player.recoveryRemainingMs = Math.max(
        0,
        state.player.recoveryRemainingMs - sliceMs,
      );
      remainingMs -= sliceMs;

      if (
        state.player.recoveryRemainingMs <= EPSILON &&
        state.player.bufferedDashTarget !== null
      ) {
        const bufferedTarget = state.player.bufferedDashTarget;
        startDash(state, bufferedTarget);
        continue;
      }
      break;
    }

    if (state.player.bufferedDashTarget !== null) {
      const bufferedTarget = state.player.bufferedDashTarget;
      startDash(state, bufferedTarget);
      continue;
    }
    break;
  }
}

function aliveEnemyCount(state: GameState): number {
  let count = 0;
  for (const enemy of state.enemies) {
    if (enemy.alive) {
      count += 1;
    }
  }
  return count;
}

function resolveStageCompletion(state: GameState): boolean {
  if (aliveEnemyCount(state) !== 0 || state.player.dash !== null) {
    return false;
  }

  state.stage.phase =
    state.stage.index === STAGE_DEFINITIONS.length - 1
      ? "game-complete"
      : "stage-cleared";
  state.player.bufferedDashTarget = null;
  state.lastEvents.push({
    type: state.stage.phase,
    atMs: state.elapsedMs,
    stageIndex: state.stage.index,
  });
  return true;
}

function resolvePlayerContact(state: GameState): void {
  if (isPlayerInvulnerable(state)) {
    return;
  }

  for (const enemy of state.enemies) {
    if (!enemy.alive) {
      continue;
    }
    const contactRadius = state.player.radius + enemy.radius;
    if (
      squaredDistance(state.player.position, enemy.position) >
      contactRadius * contactRadius + EPSILON
    ) {
      continue;
    }

    state.player.hp = 0;
    state.player.dash = null;
    state.player.recoveryRemainingMs = 0;
    state.player.bufferedDashTarget = null;
    state.stage.phase = "dead";
    state.lastEvents.push({
      type: "player-died",
      atMs: state.elapsedMs,
      enemyId: enemy.id,
      position: copyPoint(state.player.position),
    });
    return;
  }
}

function simulateFixedStep(state: GameState): void {
  if (state.stage.phase !== "playing") {
    return;
  }

  state.tick += 1;
  state.elapsedMs += FIXED_STEP_MS;
  advancePlayerAction(state, FIXED_STEP_MS);

  if (resolveStageCompletion(state)) {
    return;
  }

  moveEnemiesWithBehaviors(state, FIXED_STEP_MS);
  resolvePlayerContact(state);
}

function applyControlInput(state: GameState, input: GameInput): boolean {
  if (input.restart === true) {
    restartStage(state);
    return true;
  }
  if (input.advanceStage === true) {
    const stageBefore = state.stage.index;
    advanceStage(state);
    return state.stage.index !== stageBefore;
  }
  return false;
}

/** Advances exactly one 120 Hz simulation tick. Ideal for deterministic tests. */
export function stepGame(state: GameState, input: GameInput = EMPTY_GAME_INPUT): GameState {
  state.lastEvents.length = 0;
  if (applyControlInput(state, input)) {
    return state;
  }
  if (input.dashTarget !== undefined) {
    queueDash(state, input.dashTarget);
  }
  simulateFixedStep(state);
  return state;
}

/**
 * Real-time wrapper around stepGame's fixed simulation. The 250 ms cap prevents
 * a hidden browser tab from producing a multi-second catch-up spiral.
 */
export function advanceGame(
  state: GameState,
  deltaMs: number,
  input: GameInput = EMPTY_GAME_INPUT,
): GameState {
  state.lastEvents.length = 0;
  if (applyControlInput(state, input)) {
    return state;
  }
  if (input.dashTarget !== undefined) {
    queueDash(state, input.dashTarget);
  }
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || state.stage.phase !== "playing") {
    return state;
  }

  state.accumulatorMs += Math.min(deltaMs, MAX_FRAME_DELTA_MS);
  while (
    state.accumulatorMs + EPSILON >= FIXED_STEP_MS &&
    state.stage.phase === "playing"
  ) {
    state.accumulatorMs = Math.max(0, state.accumulatorMs - FIXED_STEP_MS);
    simulateFixedStep(state);
  }
  if (state.stage.phase !== "playing") {
    state.accumulatorMs = 0;
  }
  return state;
}

function roundForSnapshot(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Compact, stable state intended for renderGameToText and browser QA agents. */
export function getGameSnapshot(state: GameState): GameSnapshot {
  const dash = state.player.dash;
  return {
    stage: {
      index: state.stage.index,
      number: state.stage.index + 1,
      count: STAGE_DEFINITIONS.length,
      id: state.stage.levelId,
      name: state.stage.name,
    },
    phase: state.stage.phase,
    attempt: state.stage.attempt,
    tick: state.tick,
    timeMs: roundForSnapshot(state.elapsedMs),
    rules: { recoveryMs: state.rules.recoveryMs },
    arena: copyArena(state.stage.arena),
    player: {
      x: roundForSnapshot(state.player.position.x),
      z: roundForSnapshot(state.player.position.z),
      hp: state.player.hp,
      action: getPlayerAction(state),
      invulnerable: isPlayerInvulnerable(state),
      recoveryMs: roundForSnapshot(state.player.recoveryRemainingMs),
      facingX: roundForSnapshot(state.player.facing.x),
      facingZ: roundForSnapshot(state.player.facing.z),
    },
    dash:
      dash === null
        ? null
        : {
            fromX: roundForSnapshot(dash.from.x),
            fromZ: roundForSnapshot(dash.from.z),
            toX: roundForSnapshot(dash.to.x),
            toZ: roundForSnapshot(dash.to.z),
            progress: roundForSnapshot(dash.elapsedMs / dash.durationMs),
            durationMs: roundForSnapshot(dash.durationMs),
          },
    bufferedTarget:
      state.player.bufferedDashTarget === null
        ? null
        : {
            x: roundForSnapshot(state.player.bufferedDashTarget.x),
            z: roundForSnapshot(state.player.bufferedDashTarget.z),
          },
    kills: state.combat.kills,
    enemyCount: state.combat.totalEnemies,
    aliveEnemies: state.enemies
      .filter((enemy) => enemy.alive)
      .map((enemy) => ({
        id: enemy.id,
        x: roundForSnapshot(enemy.position.x),
        z: roundForSnapshot(enemy.position.z),
      })),
  };
}

export function renderGameToText(state: GameState): string {
  return JSON.stringify(getGameSnapshot(state));
}

function selfCheck(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Gameplay self-check failed: ${message}`);
  }
}

function tickUntil(
  state: GameState,
  predicate: (candidate: GameState) => boolean,
  maximumTicks = 240,
): void {
  for (let tick = 0; tick < maximumTicks && !predicate(state); tick += 1) {
    stepGame(state);
  }
  selfCheck(predicate(state), `condition not reached within ${maximumTicks} ticks`);
}

/**
 * Dependency-free smoke suite. It throws on failure and is safe to call from a
 * browser console, CI script, or future test runner.
 */
export function runGameplaySelfCheck(): GameplaySelfCheckResult {
  const checks: string[] = [];

  const multiKill = createGame(0);
  multiKill.enemies.forEach((enemy, index) => {
    enemy.alive = index < 3;
    enemy.state = index < 3 ? "active" : "dead";
    enemy.killedAtMs = index < 3 ? null : 0;
    enemy.speed = 0;
  });
  multiKill.combat.kills = multiKill.combat.totalEnemies - 3;
  multiKill.enemies[0]!.position = point(2, 0);
  multiKill.enemies[1]!.position = point(4, 0);
  multiKill.enemies[2]!.position = point(6, 0);
  queueDash(multiKill, point(9, 0));
  tickUntil(multiKill, (state) => state.player.dash === null);
  selfCheck(
    multiKill.enemies.slice(0, 3).every((enemy) => !enemy.alive) &&
      multiKill.combat.kills === multiKill.combat.totalEnemies,
    "one swept dash must kill every enemy on the line",
  );
  checks.push("multi-kill swept segment");

  const boundary = createGame(0);
  queueDash(boundary, point(1_000_000, -1_000_000));
  const boundaryDash = boundary.player.dash;
  selfCheck(boundaryDash !== null, "boundary dash should start");
  selfCheck(
    boundaryDash !== null &&
      boundaryDash.to.x === boundary.stage.arena.maxX - boundary.player.radius &&
      boundaryDash.to.z === boundary.stage.arena.minZ + boundary.player.radius,
    "an unlimited requested dash must clamp to the playable arena",
  );
  selfCheck(
    boundaryDash !== null &&
      boundaryDash.durationMs >= MIN_DASH_DURATION_MS &&
      boundaryDash.durationMs <= MAX_DASH_DURATION_MS,
    "dash duration must remain inside 35-110 ms",
  );
  checks.push("arena clamp and dash timing");

  const buffering = createGame(0);
  buffering.enemies.forEach((enemy) => {
    enemy.speed = 0;
  });
  queueDash(buffering, point(5, 1));
  stepGame(buffering, { dashTarget: point(-5, -1) });
  selfCheck(
    buffering.player.bufferedDashTarget?.x === -5,
    "input during dash should enter the buffer",
  );
  tickUntil(
    buffering,
    (state) => state.player.dash === null && state.stage.phase === "playing",
  );
  stepGame(buffering, { dashTarget: point(-7, 2) });
  selfCheck(
    buffering.player.bufferedDashTarget?.x === -7,
    "the last recovery input should replace an older buffered input",
  );
  tickUntil(
    buffering,
    (state) =>
      state.player.dash !== null && state.player.dash.to.x === -7,
  );
  selfCheck(
    buffering.player.bufferedDashTarget === null,
    "buffer should be consumed after the 120 ms recovery",
  );
  checks.push("recovery and last-input buffer");

  const contact = createGame(0);
  contact.enemies.forEach((enemy, index) => {
    enemy.alive = index === 0;
    enemy.state = index === 0 ? "active" : "dead";
    enemy.speed = 0;
  });
  contact.combat.kills = contact.combat.totalEnemies - 1;
  contact.enemies[0]!.position = point(
    contact.player.position.x + PLAYER_RADIUS + ENEMY_RADIUS - 0.01,
    contact.player.position.z,
  );
  stepGame(contact);
  selfCheck(
    contact.player.hp === 0 && contact.stage.phase === "dead",
    "enemy contact outside a dash must kill the 1 HP player",
  );
  checks.push("contact death");

  const serializable = createGame(2);
  const roundTrip = JSON.parse(JSON.stringify(serializable)) as GameState;
  selfCheck(
    roundTrip.combat.totalEnemies === 18 && roundTrip.player.hp === 1,
    "GameState must survive a JSON round trip",
  );
  checks.push("JSON serialization");

  return { ok: true, checks };
}

function configureLineKillScenario(enemyCount: number): GameState {
  const state = createGame(0);
  state.player.position = point(-9, 0);
  state.enemies = Array.from({ length: enemyCount }, (_, index) => ({
    id: `acceptance-line-${String(index + 1).padStart(2, "0")}`,
    definitionId: enemyDefinitions.get("enemy-grunt-v1").id,
    position: point(-7 + ((index + 1) / (enemyCount + 1)) * 14, 0),
    facing: point(1, 0),
    radius: ENEMY_RADIUS,
    speed: 0,
    alive: true,
    state: "active" as const,
    spawnedAtMs: 0,
    killedAtMs: null,
  }));
  state.combat.kills = 0;
  state.combat.totalEnemies = enemyCount;
  state.lastEvents = [];
  return state;
}

/**
 * Deterministic acceptance suite used by the browser validation harness. It
 * deliberately exercises public frame updates at 60/120/144 Hz instead of
 * calling private hit helpers, proving that fast swept dashes are frame-rate
 * independent for 1, 5 and 20 aligned enemies.
 */
export function runGameplayAcceptanceCheck(): GameplayAcceptanceCheckResult {
  const cases: GameplayAcceptanceCase[] = [];
  const frameRates = [60, 120, 144] as const;

  for (const enemyCount of [1, 5, 20] as const) {
    const killsByRate: number[] = [];
    for (const frameRate of frameRates) {
      const state = configureLineKillScenario(enemyCount);
      const request = queueDash(state, point(9, 0));
      selfCheck(request === "started", `${enemyCount}-enemy dash must start at ${frameRate} Hz`);
      for (let frame = 0; frame < frameRate && state.player.dash !== null; frame += 1) {
        advanceGame(state, 1000 / frameRate);
      }
      selfCheck(
        state.combat.kills === enemyCount && state.enemies.every((enemy) => !enemy.alive),
        `${enemyCount}-enemy swept dash must kill all targets at ${frameRate} Hz`,
      );
      killsByRate.push(state.combat.kills);
    }
    selfCheck(
      killsByRate.every((kills) => kills === enemyCount),
      `${enemyCount}-enemy result must be frame-rate independent`,
    );
    cases.push({
      name: `swept-line-${enemyCount}`,
      passed: true,
      details: { enemyCount, frameRates: [...frameRates], killsByRate },
    });
  }

  for (const requestedRecovery of [40, 80, 120, 180, 260]) {
    const state = createGame(0, { recoveryMs: requestedRecovery });
    const expected = Math.min(
      MAX_DASH_RECOVERY_MS,
      Math.max(MIN_DASH_RECOVERY_MS, requestedRecovery),
    );
    selfCheck(
      state.rules.recoveryMs === expected,
      `recovery ${requestedRecovery}ms must clamp to ${expected}ms`,
    );
    cases.push({
      name: `recovery-rule-${requestedRecovery}`,
      passed: true,
      details: { requestedRecovery, appliedRecovery: state.rules.recoveryMs },
    });
  }

  const vulnerableRecovery = createGame(0, { recoveryMs: 180 });
  vulnerableRecovery.enemies.forEach((enemy, index) => {
    enemy.alive = index === 0;
    enemy.state = index === 0 ? "active" : "dead";
    enemy.speed = 0;
  });
  vulnerableRecovery.combat.kills = vulnerableRecovery.combat.totalEnemies - 1;
  queueDash(vulnerableRecovery, point(7, 0));
  tickUntil(vulnerableRecovery, (state) => state.player.dash === null);
  selfCheck(
    vulnerableRecovery.player.recoveryRemainingMs > 0,
    "recovery vulnerability setup must still be inside recovery",
  );
  vulnerableRecovery.enemies[0]!.position = copyPoint(vulnerableRecovery.player.position);
  stepGame(vulnerableRecovery);
  selfCheck(
    vulnerableRecovery.stage.phase === "dead" && vulnerableRecovery.player.hp === 0,
    "player must be vulnerable during recovery",
  );
  cases.push({
    name: "recovery-is-vulnerable",
    passed: true,
    details: { recoveryMs: 180, playerDied: true },
  });

  const stageCounts = createStages().map((stage) => stage.enemyCount);
  selfCheck(
    stageCounts.join(",") === "8,12,18",
    "Phase 1 stages must contain 8, 12 and 18 enemies",
  );
  cases.push({
    name: "stage-counts",
    passed: true,
    details: { stageCounts },
  });

  const restart = createGame(1);
  const previousAttempt = restart.stage.attempt;
  restartStage(restart);
  selfCheck(
    restart.stage.index === 1
      && restart.stage.attempt === previousAttempt + 1
      && restart.stage.phase === "playing",
    "restart must preserve the stage and increment attempt",
  );
  cases.push({
    name: "restart-stage",
    passed: true,
    details: { stageIndex: restart.stage.index, attempt: restart.stage.attempt },
  });

  return {
    ok: true,
    fixedStepHz: Math.round(1000 / FIXED_STEP_MS),
    cases,
  };
}
