/**
 * Project Slash gameplay core.
 *
 * This module deliberately has no renderer, DOM, audio, or Three.js dependency.
 * Every value in GameState is JSON-safe so that replays, automated tests, and a
 * visual renderer can all consume the same deterministic simulation state.
 */
import { createEnemyEntityId } from "../core/ids";
import { copyVec2, squaredDistance, vec2 } from "../core/math/vec2";
import { createSeededRandom } from "../core/random/seeded-random";
import { DASH_SLASH_ABILITY_ID } from "../content/abilities/definitions";
import { enemyDefinitions } from "../content/enemies/definitions";
import {
  LEVEL_DEFINITIONS,
  levelByIndex,
  type LevelDefinition,
} from "../content/levels/definitions";
import { activateAbility } from "./abilities/ability-system";
import { segmentIntersectsCircle } from "./collision/shapes";
import type {
  ArenaBounds,
  DashRequestResult,
  GameCommand,
  GameCommandDispatchResult,
  GameCommandResult,
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
import { drainGameEvents, emitGameEvent } from "./events/event-buffer";
import {
  DASH_HIT_RADIUS,
  DASH_RECOVERY_MS,
  DEFAULT_RUN_SEED,
  ENEMY_RADIUS,
  FIXED_STEP_MS,
  MAX_DASH_DURATION_MS,
  MAX_DASH_RECOVERY_MS,
  MAX_FRAME_DELTA_MS,
  MIN_DASH_DURATION_MS,
  MIN_DASH_RECOVERY_MS,
  PLAYER_RADIUS,
} from "./rules/constants";
import { moveEnemiesWithBehaviors } from "./simulation/enemy-behavior";

export type {
  ArenaBounds,
  DashRequestResult,
  EnemyState,
  GameEvent,
  GameCommand,
  GameCommandDispatchResult,
  GameCommandResult,
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
export { getDashDurationMs } from "./abilities/dash-slash";
export { clampPointToArena } from "./collision/arena";
export { distanceSquaredPointToSegment, segmentIntersectsCircle } from "./collision/shapes";
export { drainGameEvents } from "./events/event-buffer";
export {
  DASH_HIT_RADIUS,
  DASH_RECOVERY_MS,
  DEFAULT_RUN_SEED,
  ENEMY_RADIUS,
  FIXED_STEP_MS,
  MAX_DASH_DURATION_MS,
  MAX_DASH_RECOVERY_MS,
  MAX_FRAME_DELTA_MS,
  MIN_DASH_DURATION_MS,
  MIN_DASH_RECOVERY_MS,
  PLAYER_RADIUS,
} from "./rules/constants";

// The real-time renderer normally advances without a control payload. Reusing
// this immutable object avoids creating one short-lived object every frame.
const EMPTY_GAME_INPUT: Readonly<GameInput> = Object.freeze({});

export const GAME_STATE_VERSION = 2 as const;

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
  const state: GameState = {
    version: GAME_STATE_VERSION,
    run: {
      seed: DEFAULT_RUN_SEED,
      tick: 0,
      random: createSeededRandom(DEFAULT_RUN_SEED).snapshot(),
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
      bufferedAbility: null,
      abilities: {
        primary: { abilityId: DASH_SLASH_ABILITY_ID, cooldownRemainingMs: 0 },
        secondary: null,
        special: null,
        ultimate: null,
      },
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
    eventSequence: 0,
    commandSequence: 0,
    lastEvents: [],
  };
  emitGameEvent(state, { type: "stage-started", stageIndex, levelId: level.id });
  return state;
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
    tick: state.run.tick,
    random: { ...state.run.random },
    selectedUpgrades: [...state.run.selectedUpgrades],
    acquiredResources: { ...state.run.acquiredResources },
  };
  replacement.eventSequence = state.eventSequence;
  replacement.commandSequence = state.commandSequence;
  replacement.stage.attempt = nextAttempt;
  replacement.lastEvents = [];
  emitGameEvent(replacement, {
    type: "stage-restarted",
    stageIndex: replacement.stage.index,
    levelId: replacement.stage.levelId,
    attempt: nextAttempt,
  });
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
    tick: state.run.tick,
    random: { ...state.run.random },
    selectedUpgrades: [...state.run.selectedUpgrades],
    acquiredResources: { ...state.run.acquiredResources },
  };
  replacement.eventSequence = state.eventSequence;
  replacement.commandSequence = state.commandSequence;
  replacement.lastEvents = [];
  emitGameEvent(replacement, {
    type: "stage-started",
    stageIndex: replacement.stage.index,
    levelId: replacement.stage.levelId,
  });
  Object.assign(state, replacement);
  return state;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Queues a click/tap. A ready player starts immediately; otherwise only the
 * newest target is retained and fires as soon as the configured recovery expires.
 */
export function queueDash(state: GameState, target: Vec2): DashRequestResult {
  return activateAbility(state, "primary", target);
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
  const dash = state.player.dash;
  const hitRadius = dash?.hitRadius ?? DASH_HIT_RADIUS;
  const attackId = dash?.abilityId ?? DASH_SLASH_ABILITY_ID;
  for (const enemy of state.enemies) {
    if (
      !enemy.alive ||
      !segmentIntersectsCircle(
        segmentStart,
        segmentEnd,
        enemy.position,
        hitRadius + enemy.radius,
      )
    ) {
      continue;
    }

    enemy.alive = false;
    enemy.state = "dead";
    enemy.killedAtMs = state.elapsedMs;
    state.combat.kills += 1;
    emitGameEvent(state, {
      type: "enemy-killed",
      enemyId: enemy.id,
      sourceId: "player",
      attackId,
      position: copyPoint(enemy.position),
      direction: copyPoint(state.player.facing),
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
  state.player.recoveryRemainingMs = dash.recoveryMs;
  emitGameEvent(state, {
    type: "dash-ended",
    abilityId: dash.abilityId,
    sourceId: "player",
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
        state.player.bufferedAbility !== null
      ) {
        const buffered = state.player.bufferedAbility;
        activateAbility(state, buffered.slot, buffered.target);
        continue;
      }
      break;
    }

    if (state.player.bufferedAbility !== null) {
      const buffered = state.player.bufferedAbility;
      activateAbility(state, buffered.slot, buffered.target);
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
  state.player.bufferedAbility = null;
  emitGameEvent(state, {
    type: state.stage.phase,
    stageIndex: state.stage.index,
    levelId: state.stage.levelId,
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
    state.player.bufferedAbility = null;
    state.stage.phase = "dead";
    emitGameEvent(state, {
      type: "player-died",
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
  state.run.tick += 1;
  state.elapsedMs += FIXED_STEP_MS;
  advancePlayerAction(state, FIXED_STEP_MS);

  if (resolveStageCompletion(state)) {
    return;
  }

  moveEnemiesWithBehaviors(state, FIXED_STEP_MS);
  resolvePlayerContact(state);
}

export function dispatchGameCommand(
  state: GameState,
  command: GameCommand,
): GameCommandDispatchResult {
  state.commandSequence += 1;
  let result: GameCommandResult = "ignored";
  if (command.type === "activate-ability") {
    result = activateAbility(state, command.slot, command.target);
  } else if (command.type === "restart-stage") {
    restartStage(state);
    result = "restarted";
  } else if (command.type === "advance-stage" && state.stage.phase === "stage-cleared") {
    advanceStage(state);
    result = "advanced";
  }
  return { sequence: state.commandSequence, result };
}

function applyControlInput(state: GameState, input: GameInput): boolean {
  if (input.restart === true) {
    dispatchGameCommand(state, { type: "restart-stage" });
    return true;
  }
  if (input.advanceStage === true) {
    const stageBefore = state.stage.index;
    dispatchGameCommand(state, { type: "advance-stage" });
    return state.stage.index !== stageBefore;
  }
  return false;
}

/** Advances exactly one 120 Hz simulation tick. Ideal for deterministic tests. */
export function stepGame(state: GameState, input: GameInput = EMPTY_GAME_INPUT): GameState {
  if (applyControlInput(state, input)) {
    return state;
  }
  if (input.dashTarget !== undefined) {
    dispatchGameCommand(state, {
      type: "activate-ability",
      slot: "primary",
      target: input.dashTarget,
    });
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
  if (applyControlInput(state, input)) {
    return state;
  }
  if (input.dashTarget !== undefined) {
    dispatchGameCommand(state, {
      type: "activate-ability",
      slot: "primary",
      target: input.dashTarget,
    });
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
    encounter: { id: state.stage.encounterId },
    run: {
      tick: state.run.tick,
      seed: state.run.seed,
      selectedUpgrades: [...state.run.selectedUpgrades],
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
      state.player.bufferedAbility === null
        ? null
        : {
            x: roundForSnapshot(state.player.bufferedAbility.target.x),
            z: roundForSnapshot(state.player.bufferedAbility.target.z),
          },
    abilities: {
      primary:
        state.player.abilities.primary === null
          ? null
          : {
              id: state.player.abilities.primary.abilityId,
              cooldownMs: roundForSnapshot(state.player.abilities.primary.cooldownRemainingMs),
            },
      secondary:
        state.player.abilities.secondary === null
          ? null
          : {
              id: state.player.abilities.secondary.abilityId,
              cooldownMs: roundForSnapshot(state.player.abilities.secondary.cooldownRemainingMs),
            },
      special:
        state.player.abilities.special === null
          ? null
          : {
              id: state.player.abilities.special.abilityId,
              cooldownMs: roundForSnapshot(state.player.abilities.special.cooldownRemainingMs),
            },
      ultimate:
        state.player.abilities.ultimate === null
          ? null
          : {
              id: state.player.abilities.ultimate.abilityId,
              cooldownMs: roundForSnapshot(state.player.abilities.ultimate.cooldownRemainingMs),
            },
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
    projectiles: state.projectiles.map((projectile) => ({
      id: projectile.id,
      definitionId: projectile.definitionId,
      x: roundForSnapshot(projectile.position.x),
      z: roundForSnapshot(projectile.position.z),
    })),
    obstacles: state.obstacles.map((obstacle) => ({
      id: obstacle.id,
      definitionId: obstacle.definitionId,
      x: roundForSnapshot(obstacle.position.x),
      z: roundForSnapshot(obstacle.position.z),
    })),
    hazards: state.hazards.map((hazard) => ({
      id: hazard.id,
      definitionId: hazard.definitionId,
      x: roundForSnapshot(hazard.position.x),
      z: roundForSnapshot(hazard.position.z),
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
    buffering.player.bufferedAbility?.target.x === -5,
    "input during dash should enter the buffer",
  );
  tickUntil(
    buffering,
    (state) => state.player.dash === null && state.stage.phase === "playing",
  );
  stepGame(buffering, { dashTarget: point(-7, 2) });
  selfCheck(
    buffering.player.bufferedAbility?.target.x === -7,
    "the last recovery input should replace an older buffered input",
  );
  tickUntil(
    buffering,
    (state) =>
      state.player.dash !== null && state.player.dash.to.x === -7,
  );
  selfCheck(
    buffering.player.bufferedAbility === null,
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
  drainGameEvents(state);
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
